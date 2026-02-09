import os
import json
import requests
import time
import logging

# 配置信息
API_KEY = "sk-muuaqhogqlylpndejkcqgxhyldcjhunnkglhdxrptxrczoby"
MODEL = "Qwen/Qwen3-VL-32B-Instruct"
API_URL = "https://api.siliconflow.cn/v1/chat/completions"

ASSETS_DIR = "assets/illustrations"
METADATA_PATH = "assets/metadata.json"
CACHE_PATH = "assets/ai_cache.json"
TAXONOMY_PATH = "assets/taxonomy.json"
LOG_PATH = "tagger.log"

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.FileHandler(LOG_PATH, encoding='utf-8'), logging.StreamHandler()]
)

def load_json(path, default):
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except:
                logging.error(f"Failed to parse {path}, using default.")
    return default

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_standard_labels_from_filename(filename, taxonomy):
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

def call_ai(filename, svg_content, existing_data, taxonomy_list):
    # 构造 Taxonomy 选项字符串供 AI 选择
    categories_str = ", ".join([f"{t['id']} ({t['zh']})" for t in taxonomy_list])
    
    prompt = f"""
你是一个专业的插画分类与语义分析专家。请分析以下 SVG 插画。
文件名：{filename}
基于文件名的标准标签：{json.dumps(existing_data['tags'], ensure_ascii=False)}

任务：
1. **分类补全 (关键)**: 从以下标准分类中选择 1-2 个最贴切的：[{categories_str}]。只要画面相关就必须选，不能留空。
2. **深度语义**: 生成 3-5 个深度的中文/英文语义标签（双语对齐，非重复）。
3. **描述**: 生成一句话中文描述。

请以严格的 JSON 格式返回：
{{
  "suggested_categories": ["tech", "business"],
  "ai_tags": [
    {{"en": "Teamwork", "zh": "团队协作"}},
    {{"en": "Innovation", "zh": "创新"}}
  ],
  "description": "插画描述..."
}}
"""
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt + f"\nSVG源码预览：\n{svg_content[:2500]}"}],
        "response_format": {"type": "json_object"}
    }

    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=60)
        if response.status_code == 200:
            return response.json()['choices'][0]['message']['content']
        else:
            logging.error(f"API Error: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        logging.error(f"Request exception: {e}")
        return None

def main(batch_size=20):
    taxonomy = load_json(TAXONOMY_PATH, [])
    cache = load_json(CACHE_PATH, {})
    # 加载现有 metadata，如果存在则基于此增量更新，否则重建
    metadata_list = load_json(METADATA_PATH, [])
    
    # 建立 file -> index 映射，方便更新
    file_map = {item['file']: idx for idx, item in enumerate(metadata_list)}

    all_files = [f for f in os.listdir(ASSETS_DIR) if f.endswith('.svg')]
    
    # 筛选出 "categories" 为空的，或者 cache 中没有的（即未 AI 处理过的）
    # 或者是完全的新文件
    pending_files = []
    
    for f in all_files:
        is_processed = f in cache
        
        # 检查是否需要重新处理（例如之前跑过但没分类）
        needs_reprocess = False
        if is_processed:
             cached_data = cache[f]
             # 如果缓存里也没有建议分类，或者建议分类为空，则认为需要重跑（针对Barista这种Case）
             if 'suggested_categories' not in cached_data or not cached_data['suggested_categories']:
                 # 只有当它本身基于文件名也没分类时，才强制重跑
                 std_info = get_standard_labels_from_filename(f, taxonomy)
                 if not std_info['categories']: 
                     needs_reprocess = True
        
        if not is_processed or needs_reprocess:
            pending_files.append(f)

    total_pending = len(pending_files)
    logging.info(f"files needing AI processing/re-processing: {total_pending}")

    if total_pending == 0:
        logging.info("All files have valid categories or AI data.")
        return

    count = 0
    for f in pending_files:
        if count >= batch_size:
            break
            
        std_info = get_standard_labels_from_filename(f, taxonomy)
        
        logging.info(f"[{count+1}/{batch_size}] Processing {f}...")
        
        with open(os.path.join(ASSETS_DIR, f), 'r', encoding='utf-8') as svg_f:
             svg_content = svg_f.read()
        
        ai_res = call_ai(f, svg_content, std_info, taxonomy)
        
        ai_data = {"suggested_categories": [], "ai_tags": [], "description": "AI处理失败"}
        if ai_res:
            try:
                ai_data = json.loads(ai_res)
                # 存入缓存
                cache[f] = ai_data
                save_json(CACHE_PATH, cache)
            except:
                logging.warning(f"Invalid JSON for {f}")

        # 核心逻辑：合并分类
        # 最终分类 = 文件名识别分类 + AI建议分类 (去重)
        final_categories = list(set(std_info['categories'] + ai_data.get('suggested_categories', [])))
        # 确保只使用 taxonomy 中存在的 ID
        valid_ids = [t['id'] for t in taxonomy]
        final_categories = [c for c in final_categories if c in valid_ids]
        
        # 构造元数据对象
        meta_item = {
            "file": f,
            "title": f.replace('.svg', '').replace('_', ' ').title(),
            "categories": final_categories, # 修复点：填补分类
            "tags": {
                "standard": std_info['tags'],
                "ai": ai_data.get('ai_tags', [])
            },
            "description": ai_data.get('description', '')
        }
        
        # 更新或追加到 metadata_list
        if f in file_map:
            metadata_list[file_map[f]] = meta_item
        else:
            metadata_list.append(meta_item)
            file_map[f] = len(metadata_list) - 1
            
        save_json(METADATA_PATH, metadata_list)
        count += 1
        time.sleep(1)

    logging.info(f"Batch completed. Processed {count} files.")

if __name__ == "__main__":
    main(3000)
