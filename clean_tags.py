#!/usr/bin/env python3
"""Normalize AI tags: drop garbage, extract leaked zh, merge near-duplicates."""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
META = ROOT / "assets" / "metadata.json"
REPORT = ROOT / "assets" / "tag_clean_report.json"

SYNONYMS = {
    "用户界面元素": "界面元素",
    "用户界面图标": "界面图标",
    "用户界面组件": "界面元素",
    "用户界面控制": "界面元素",
    "用户界面设计": "界面",
    "用户界面": "界面",
    "数字界面元素": "数字界面",
    "界面符号": "界面元素",
    "界面组件": "界面元素",
    "界面控制": "界面元素",
    "标准界面元素": "界面元素",
    "交互式界面元素": "界面元素",
    "文件管理": "文档管理",
    "文档处理": "文档管理",
    "文档编辑": "文档管理",
    "文档图标": "文档",
    "文件图标": "文档",
    "文件夹图标": "文档",
    "团队协作": "协作",
    "协作工作": "协作",
    "数字化协作": "协作",
    "数字协作": "协作",
    "协作工具": "协作",
    "协作平台": "协作",
    "协作环境": "协作",
    "云计算": "云端",
    "云存储": "云端",
    "云端存储": "云端",
    "云端同步": "云端",
    "云同步": "云端",
    "云服务": "云端",
    "云平台": "云端",
    "数据流动": "数据流",
    "数据传输": "数据流",
    "数据同步": "数据流",
    "数字交互": "用户交互",
    "数字通信": "通信",
}

LEAKED_ZH = re.compile(r"['\"]zh['\"]\s*:\s*['\"]([^'\"]{1,20})['\"]")
EN_PREFIX = re.compile(r"^(en|zh)\s*:\s*", re.I)
GARBAGE = {
    "en", "zh", "en:", "zh:", "none", "null", "undefined", "{", "}", ",", ":",
    "[", "]", "error", "json",
}
BAD_SNIPPETS = ("ERROR", "JSON", "修正", "如下", "不符合", "原始输出", "corrected")


def normalize_label(raw):
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None

    leaked = LEAKED_ZH.search(text)
    if leaked:
        text = leaked.group(1).strip()

    text = EN_PREFIX.sub("", text).strip(" \t\"'`")
    low = text.lower()
    if low in GARBAGE or text in GARBAGE:
        return None
    if any(snip in text for snip in BAD_SNIPPETS):
        return None
    if len(text) <= 1 and not re.fullmatch(r"[\u4e00-\u9fff]", text):
        return None
    if len(text) > 16:
        return None
    if re.search(r"[。；]|,\s*zh", text):
        return None

    text = SYNONYMS.get(text, text)
    return text or None


def clean_tag_list(items):
    seen = []
    dropped = 0
    for item in items:
        if isinstance(item, dict):
            zh = normalize_label(item.get("zh") or item.get("en"))
            en = (item.get("en") or "").strip()
        else:
            zh = normalize_label(item)
            en = ""
        if not zh:
            dropped += 1
            continue
        if any(existing["zh"] == zh for existing in seen):
            dropped += 1
            continue
        seen.append({"zh": zh, "en": en})
    return seen[:8], dropped


def main():
    data = json.loads(META.read_text(encoding="utf-8"))
    before = Counter()
    after = Counter()
    dropped_total = 0

    for row in data:
        tags = row.get("tags") or {}
        ai = tags.get("ai") or []
        standard = tags.get("standard") or []
        for group in ai + standard:
            label = group.get("zh") if isinstance(group, dict) else str(group)
            if label:
                before[label] += 1
        new_ai, d1 = clean_tag_list(ai)
        new_std, d2 = clean_tag_list(standard)
        dropped_total += d1 + d2
        tags["ai"] = new_ai
        tags["standard"] = new_std
        row["tags"] = tags
        for tag in new_ai + new_std:
            after[tag["zh"]] += 1

    META.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {
        "items": len(data),
        "unique_before": len(before),
        "unique_after": len(after),
        "dropped_entries": dropped_total,
        "top_after": after.most_common(30),
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"items {len(data)}")
    print(f"unique {len(before)} -> {len(after)}")
    print(f"dropped tag entries {dropped_total}")
    print(f"wrote {META}")
    print(f"wrote {REPORT}")


if __name__ == "__main__":
    main()
