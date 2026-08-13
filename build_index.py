#!/usr/bin/env python3
"""Build a compact catalog from metadata.json for first-paint search/browse."""
import gzip
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
META = ROOT / "assets" / "metadata.json"
ILLUSTRATIONS = ROOT / "assets" / "illustrations"
OUT = ROOT / "assets" / "catalog.json"
OUT_GZ = ROOT / "assets" / "catalog.json.gz"
HEAVY = 80_000


def zh_tags(item, limit=8):
    tags = (item.get("tags") or {})
    seen = []
    for group in (tags.get("ai") or []) + (tags.get("standard") or []):
        if isinstance(group, dict):
            label = group.get("zh") or group.get("en") or ""
        else:
            label = str(group)
        label = label.strip()
        if label and label not in seen:
            seen.append(label)
        if len(seen) >= limit:
            break
    return seen


def main():
    data = json.loads(META.read_text(encoding="utf-8"))
    items = []
    for item in data:
        filename = item.get("file") or ""
        size = 0
        path = ILLUSTRATIONS / filename
        if path.is_file():
            size = path.stat().st_size
        items.append([
            filename,
            item.get("title") or item.get("name") or filename,
            item.get("categories") or ([item["category"]] if item.get("category") else []),
            zh_tags(item),
            item.get("description") or "",
            size,
        ])

    catalog = {"v": 1, "count": len(items), "heavyBytes": HEAVY, "items": items}
    raw = json.dumps(catalog, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    OUT.write_bytes(raw)
    with gzip.open(OUT_GZ, "wb", compresslevel=9) as fh:
        fh.write(raw)
    print(f"catalog items={len(items)}")
    print(f"  catalog.json    {OUT.stat().st_size:10} bytes")
    print(f"  catalog.json.gz {OUT_GZ.stat().st_size:10} bytes")
    print(f"  metadata.json   {META.stat().st_size:10} bytes")
    print(f"  heavy (>{HEAVY}) {sum(1 for row in items if row[5] > HEAVY)}")


if __name__ == "__main__":
    main()
