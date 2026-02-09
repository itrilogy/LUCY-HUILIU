import os
import json

ASSETS_DIR = "assets/illustrations"
METADATA_PATH = "assets/metadata.json"
TAXONOMY_PATH = "assets/taxonomy.json"
CACHE_PATH = "assets/ai_cache.json"

def load_json(path, default):
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except:
                print(f"Failed to parse {path}, using default.")
    return default

def get_standard_labels(filename, taxonomy):
    name_clean = filename.replace('.svg', '').lower().replace('_', ' ').replace('-', ' ')
    std_categories = []
    std_tags = []
    
    for entry in taxonomy:
        found_in_category = False
        for kw in entry['keywords']:
            if kw['en'] in name_clean:
                if not any(t['en'] == kw['en'] for t in std_tags):
                    std_tags.append({"en": kw['en'], "zh": kw['zh']})
                found_in_category = True
        if found_in_category:
            std_categories.append(entry['id'])

    return {
        "categories": list(set(std_categories)),
        "tags": std_tags
    }

def bootstrap():
    taxonomy = load_json(TAXONOMY_PATH, [])
    # 优先使用 ai_cache.json 获取已标注的数据
    ai_cache = load_json(CACHE_PATH, {})
    
    all_files = [f for f in os.listdir(ASSETS_DIR) if f.endswith('.svg')]
    print(f"Bootstrapping metadata for {len(all_files)} files...")

    final_metadata = []
    for f in all_files:
        std_info = get_standard_labels(f, taxonomy)
        
        # 整合 AI 缓存数据
        ai_data_item = ai_cache.get(f, {})
        ai_tags = ai_data_item.get('ai_tags', [])
        description = ai_data_item.get('description', '')

        final_metadata.append({
            "file": f,
            "title": f.replace('.svg', '').replace('_', ' ').title(),
            "categories": std_info['categories'],
            "tags": {
                "standard": std_info['tags'],
                "ai": ai_tags
            },
            "description": description
        })

    with open(METADATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(final_metadata, f, ensure_ascii=False, indent=2)
    
    print(f"Success! {METADATA_PATH} now contains all {len(all_files)} assets with cached AI tags.")

if __name__ == "__main__":
    bootstrap()
