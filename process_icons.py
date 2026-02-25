import argparse
import logging

# 配置默认值
DEFAULT_SOURCE_DIR = "assets/ICON"
TARGET_DIR = "assets/illustrations"
MANIFEST_PATH = "incremental_task.json"

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def get_existing_filenames(directory):
    """获取目标目录中已存在的文件名集合"""
    if not os.path.exists(directory):
        os.makedirs(directory)
        return set()
    return {f.lower() for f in os.listdir(directory) if os.path.isfile(os.path.join(directory, f))}

def slugify(text):
    """将文本转换为适合文件名的格式"""
    text = text.lower()
    text = re.sub(r'[^a-z0-9_-]', '-', text)
    text = re.sub(r'-+', '-', text)
    return text.strip('-')

def generate_unique_name(base_name, existing_names):
    """生成唯一的名称，如果冲突则增加后缀"""
    name, ext = os.path.splitext(base_name)
    counter = 1
    unique_name = base_name
    while unique_name.lower() in existing_names:
        counter += 1
        unique_name = f"{name}-v{counter}{ext}"
    return unique_name

def process(source_dir):
    if not os.path.exists(source_dir):
        logging.error(f"源目录不存在: {source_dir}")
        return

    logging.info(f"开始处理图标资产，来源: {source_dir}")
    existing_names = get_existing_filenames(TARGET_DIR)
    manifest = []
    
    # 统计信息
    stats = {"total": 0, "copied": 0, "skipped": 0, "collisions": 0}

    # 深度优先遍历目录
    for root, dirs, files in os.walk(source_dir):
        relative_path = os.path.relpath(root, source_dir)
        path_parts = relative_path.split(os.sep)
        
        # 排除根目录直接包含的文件（如果没有分类子目录）
        if relative_path == ".":
            # 如果根目录下有文件，将其归类为 general
            source = os.path.basename(source_dir) or "custom"
            category = "general"
        else:
            # 确定来源和分类
            source = slugify(path_parts[0])
            category = slugify(path_parts[1]) if len(path_parts) > 1 else "general"
        
        for file in files:
            if not file.lower().endswith('.svg'):
                continue
            
            stats["total"] += 1
            original_path = os.path.join(root, file)
            
            # 基础重命名：source-category-filename
            file_slug = slugify(os.path.splitext(file)[0])
            new_base_name = f"{source}-{category}-{file_slug}.svg"
            
            # 唯一性处理
            final_name = generate_unique_name(new_base_name, existing_names)
            if final_name != new_base_name:
                stats["collisions"] += 1
            
            target_path = os.path.join(TARGET_DIR, final_name)
            
            try:
                # 执行复制
                shutil.copy2(original_path, target_path)
                existing_names.add(final_name.lower()) # 更新已存在集合
                
                manifest.append({
                    "original_source_path": original_path,
                    "new_name": final_name,
                    "target_path": target_path,
                    "source": source,
                    "category": category
                })
                stats["copied"] += 1
                
                if stats["copied"] % 100 == 0:
                    logging.info(f"已处理 {stats['copied']} 个文件...")
            except Exception as e:
                logging.error(f"处理 {original_path} 时发生异常: {e}")
                stats["skipped"] += 1

    # 保存清单
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    logging.info(f"\n处理完成！")
    logging.info(f"总计发现 SVG: {stats['total']}")
    logging.info(f"成功复制: {stats['copied']}")
    logging.info(f"冲突解决次数: {stats['collisions']}")
    logging.info(f"失败/跳过: {stats['skipped']}")
    logging.info(f"任务清单已生成至: {MANIFEST_PATH}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SVG 图标预处理工具 (重命名与整合)")
    parser.add_argument("--source", type=str, default=DEFAULT_SOURCE_DIR, help="图标来源目录路径 (默认: assets/ICON)")
    args = parser.parse_args()
    
    process(args.source)
