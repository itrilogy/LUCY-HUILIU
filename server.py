#!/usr/bin/env python3
"""VectorStream local server: static files, gzip JSON, admin session, write-back."""
from __future__ import annotations

import argparse
import gzip
import hmac
import json
import mimetypes
import os
import secrets
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
ILLUSTRATIONS = (ROOT / "assets" / "illustrations").resolve()
ENV_PATH = ROOT / ".env"
MAX_SAVE_BYTES = 8 * 1024 * 1024
GZIP_TYPES = {".json", ".js", ".css", ".svg", ".html"}
SESSION_TTL = 12 * 60 * 60
COOKIE_NAME = "vs_admin"

ADMIN_PIN = ""
SESSION_SECRET = ""
SESSIONS: dict[str, float] = {}


def load_env(path: Path) -> dict[str, str]:
    values = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        values[key.strip()] = val.strip().strip('"').strip("'")
    return values


def configure_auth():
    global ADMIN_PIN, SESSION_SECRET
    env = load_env(ENV_PATH)
    env.update({k: v for k, v in os.environ.items() if k.startswith("VS_")})
    ADMIN_PIN = env.get("VS_ADMIN_PIN", "").strip()
    SESSION_SECRET = env.get("VS_SESSION_SECRET", "").strip() or secrets.token_hex(16)


def purge_sessions():
    now = time.time()
    expired = [token for token, exp in SESSIONS.items() if exp <= now]
    for token in expired:
        SESSIONS.pop(token, None)


def new_session() -> str:
    purge_sessions()
    token = secrets.token_urlsafe(24)
    SESSIONS[token] = time.time() + SESSION_TTL
    return token


def session_valid(token: str) -> bool:
    purge_sessions()
    exp = SESSIONS.get(token)
    if not exp:
        return False
    SESSIONS[token] = time.time() + SESSION_TTL
    return True


class VectorStreamHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.path.startswith("/assets/illustrations/"):
            return
        super().log_message(fmt, *args)

    def _cookie_token(self) -> str:
        raw = self.headers.get("Cookie", "")
        jar = SimpleCookie()
        try:
            jar.load(raw)
        except Exception:
            return ""
        morsel = jar.get(COOKIE_NAME)
        return morsel.value if morsel else ""

    def _is_admin(self) -> bool:
        return session_valid(self._cookie_token())

    def _set_session_cookie(self, token: str | None):
        if token:
            cookie = f"{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL}"
        else:
            cookie = f"{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
        self.send_header("Set-Cookie", cookie)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            return self._send_json({
                "ok": True,
                "writable": True,
                "adminConfigured": bool(ADMIN_PIN),
                "admin": self._is_admin(),
                "root": str(ROOT),
                "version": "1.8.0",
            })
        if parsed.path == "/api/admin/session":
            return self._send_json({
                "ok": True,
                "adminConfigured": bool(ADMIN_PIN),
                "admin": self._is_admin(),
            })
        return self._serve_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/admin/login":
            return self._admin_login()
        if parsed.path == "/api/admin/logout":
            token = self._cookie_token()
            SESSIONS.pop(token, None)
            self._send_json({"ok": True, "admin": False}, extra_headers={"Set-Cookie": f"{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"})
            return
        if parsed.path == "/api/save":
            return self._save_asset()
        self.send_error(404, "Unknown API")

    def _read_json(self, limit=MAX_SAVE_BYTES):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > limit:
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    def _admin_login(self):
        if not ADMIN_PIN:
            return self._send_json({"ok": False, "error": "admin_not_configured"}, status=503)
        payload = self._read_json(limit=4096) or {}
        pin = str(payload.get("pin") or "")
        if not pin or not hmac.compare_digest(pin, ADMIN_PIN):
            return self._send_json({"ok": False, "error": "invalid_pin"}, status=401)
        token = new_session()
        self._send_json({"ok": True, "admin": True}, extra_headers={"Set-Cookie": f"{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL}"})

    def _save_asset(self):
        if not self._is_admin():
            return self._send_json({"ok": False, "error": "unauthorized"}, status=401)
        payload = self._read_json()
        if not isinstance(payload, dict):
            self.send_error(400, "Invalid JSON")
            return
        filename = Path(str(payload.get("file") or "")).name
        svg = payload.get("svg")
        if not filename.lower().endswith(".svg") or not isinstance(svg, str) or not svg.strip():
            self.send_error(400, "Expected {file, svg}")
            return
        if "<svg" not in svg.lower():
            self.send_error(400, "Not an SVG document")
            return
        target = (ILLUSTRATIONS / filename).resolve()
        if target.parent != ILLUSTRATIONS:
            self.send_error(403, "Path not allowed")
            return
        if not target.exists():
            self.send_error(404, "Asset not found")
            return
        target.write_text(svg, encoding="utf-8")
        self._send_json({"ok": True, "file": filename, "bytes": target.stat().st_size})

    def _serve_static(self, path):
        rel = unquote(path.split("?", 1)[0])
        if rel == "/":
            rel = "/index.html"
        rel = rel.lstrip("/")
        if ".." in Path(rel).parts:
            self.send_error(403, "Path not allowed")
            return
        file_path = (ROOT / rel).resolve()
        try:
            file_path.relative_to(ROOT)
        except ValueError:
            self.send_error(403, "Path not allowed")
            return
        if not file_path.is_file():
            self.send_error(404, "Not found")
            return

        data = file_path.read_bytes()
        ctype = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        accept = self.headers.get("Accept-Encoding", "")
        use_gzip = "gzip" in accept and file_path.suffix.lower() in GZIP_TYPES and len(data) > 1024
        if use_gzip:
            data = gzip.compress(data, compresslevel=6)

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if use_gzip:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, payload, status=200, extra_headers=None):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(raw)


def main():
    parser = argparse.ArgumentParser(description="VectorStream local server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3001)
    args = parser.parse_args()
    os.chdir(ROOT)
    configure_auth()
    httpd = ThreadingHTTPServer((args.host, args.port), VectorStreamHandler)
    print(f"VectorStream  http://{args.host}:{args.port}", flush=True)
    print(f"Admin pin     {'configured (.env VS_ADMIN_PIN)' if ADMIN_PIN else 'missing — copy .env.example to .env'}", flush=True)
    print("Write-back    POST /api/save  (admin session required)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
