import json
import os

# 定义 Taxonomy 映射
TAXONOMY = {
    "Business": ["商务办公", ["office", "work", "business", "colleague", "project", "team", "manager", "briefing", "corporate", "investment", "marketing", "startup", "presentation", "meeting"]],
    "Technology": ["科技数字化", ["tech", "coding", "data", "cloud", "developer", "software", "server", "programming", "artificial intelligence", "ai", "robotics", "digital", "network", "blockchain", "app", "mobile"]],
    "People": ["人物生活", ["woman", "man", "character", "baby", "child", "couple", "lovers", "family", "person", "friend", "people", "walk", "social", "activity"]],
    "Healthy": ["医疗运动", ["medical", "doctor", "hospital", "health", "nurse", "fitness", "sport", "workout", "medicine", "yoga", "running", "gym", "wellness"]],
    "Daily": ["日常琐事", ["home", "shop", "food", "pet", "cat", "dog", "travel", "car", "cooking", "grocery", "house", "cleaning", "delivery"]],
    "Education": ["教育学习", ["education", "school", "learning", "student", "book", "study", "university", "teaching", "graduation", "library", "research", "creative"]],
    "Interface": ["界面布局", ["404", "search", "empty", "error", "minimalist", "ui", "login", "maintenance", "not found", "select", "web"]],
    "Abstract": ["抽象概念", ["growth", "logic", "trends", "idea", "vision", "strategy", "innovation", "process", "success", "future"]]
}

def generate_metadata(file_list_path, output_path):
    with open(file_list_path, 'r') as f:
        files = [line.strip() for line in f if line.strip()]

    metadata = []
    print(f"Processing {len(files)} files...")

    for filename in files:
        name_clean = filename.replace('.svg', '').lower().replace('_', ' ').replace('-', ' ')
        tags_en = []
        categories_zh = []
        tags_zh = []

        # 1. 基础分类匹配
        for cat_en, (cat_zh, keywords) in TAXONOMY.items():
            if any(keyword in name_clean for keyword in keywords):
                if cat_zh not in categories_zh:
                    categories_zh.append(cat_zh)
                # 提取匹配到的关键词作为基础标签
                matched_keywords = [k for k in keywords if k in name_clean]
                tags_en.extend(matched_keywords)

        # 2. 语义标签转换与扩展 (双语)
        # 简单美化文件名作为一类标签
        tags_zh.append(name_clean.replace(' ', '')) # 移除空格作为中文搜索源
        
        # 3. 结果汇总
        metadata.append({
            "filename": filename,
            "title": filename.replace('.svg', '').replace('_', ' ').capitalize(),
            "categories": categories_zh if categories_zh else ["其它"],
            "tags_en": list(set(tags_en)),
            "tags_zh": list(set(tags_zh))
        })

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    
    print(f"Metadata generated: {output_path}")

if __name__ == "__main__":
    generate_metadata("full_svg_list.txt", "assets/metadata.json")
