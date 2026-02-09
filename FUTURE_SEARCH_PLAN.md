# 智能搜索进阶方案 (Scheme B) 实施规划

本文档为后期数据量超过 20,000+ 或需要支持模糊纠错搜索时的技术升级储备方案。

## 1. 技术选型
推荐使用 **MiniSearch** (相比 Fuse.js 更轻量，内存占用极低，且支持前缀搜索和权重的精确控制)。

- **库名**: `MiniSearch`
- **体积**: ~6KB (Gzipped)
- **特性**: 全文检索、前缀匹配、模糊匹配 (Fuzzy)、字段权重 (Field Boosting)。

## 2. 实施时机
- 当 `metadata.json` 数据量 > 5MB。
- 当用户反馈“拼写错误搜不到”或“搜索结果排序不合理”。
- 当需要支持复杂的布尔查询 (e.g. `(tech OR business) AND NOT blue`)。

## 3. 实施步骤

### 步骤 1: 引入依赖 (本地化)
为了保证内网环境可用及系统稳定性，建议将 JS 库下载到本地：

1.  下载 [minisearch.min.js](https://cdn.jsdelivr.net/npm/minisearch@7.1.0/dist/umd/index.min.js)
2.  保存至 `assets/libs/minisearch.min.js`
3.  在 `index.html` 中引入：
    ```html
    <script src="assets/libs/minisearch.min.js"></script>
    ```

### 步骤 2: 构建索引配置 (JS)
替换现有的简单 `categoryMap` 逻辑，初始化 MiniSearch 实例：

```javascript
let miniSearch = new MiniSearch({
  fields: ['title', 'file', 'description', 'allTags'], // 参与搜索的字段
  storeFields: ['file'], // 搜索结果仅返回 file ID 用于关联
  searchOptions: {
    boost: { title: 3, allTags: 2, description: 1 }, // 权重配置：标题 > 标签 > 描述
    prefix: true, // 支持前缀搜索 (搜 "busin" 命中 "business")
    fuzzy: 0.2    // 允许 20% 的拼写错误
  },
  // 自定义分词器（可选，处理中文分词优化）
  tokenize: (string, _fieldName) => string.split(/[\s\-\_]+/) 
});
```

### 步骤 3: 数据预处理与索引
在 `init()` 函数获取到 `allMetadata` 后：

```javascript
// 1. 数据预处理：构建全量中英双语索引 (Data Preprocessing)
// 先建立 taxonomy 字典（ID -> "英文名 中文名 关键词"）
const taxMap = {};
taxonomy.forEach(t => {
    // 整合分类的 ID、英中文名及该分类下的所有关键词
    const keywords = t.keywords.map(k => `${k.en} ${k.zh}`).join(' ');
    taxMap[t.id] = `${t.id} ${t.en} ${t.zh} ${keywords}`;
});

const indexableData = allMetadata.map((item, index) => {
  // A. 分类扩展：将分类 ID (e.g. "tech") 扩展为 "tech Technology 科技数字化 编程 数据..."
  const categoryText = (item.categories || []).map(catId => taxMap[catId] || catId).join(' ');

  // B. 标签整合：包含 Standard Tags 和 AI Tags 的所有中英文
  const standardTags = (item.tags?.standard || []).map(t => `${t.en} ${t.zh}`).join(' ');
  const aiTags = (item.tags?.ai || []).map(t => `${t.en} ${t.zh}`).join(' ');

  // C. 组合所有可搜索文本
  const fullText = [
    categoryText,
    standardTags,
    aiTags
  ].join(' ');

  return {
    id: index, // 必须有唯一 ID
    file: item.file,
    title: item.title,
    description: item.description, // 描述字段单独保留，权重设低
    allTags: fullText // 汇聚所有标签与分类信息的超级字段
  };
});

// 2. 批量构建索引 (约 50-100ms)
miniSearch.addAll(indexableData);
```

### 步骤 4: 执行搜索
替换 `filterAndRender` 中的关键词匹配逻辑：

```javascript
// 当 searchInput 为空时，返回 default all
if (!term) {
    filteredMetadata = allMetadata;
} else {
    // 智能搜索
    const results = miniSearch.search(term);
    // results 包含 { id, score, match }
    
    // 映射回原始数据对象
    const matchedFiles = new Set(results.map(r => r.file));
    filteredMetadata = allMetadata.filter(item => matchedFiles.has(item.file));
}

// 继续执行分类筛选 (activeCategory)
if (activeCategory !== 'all') {
    filteredMetadata = filteredMetadata.filter(item => item.categories.includes(activeCategory));
}
```

## 4. 性能优化 (Web Worker)
如果数据量巨大导致 UI 卡顿，可将上述逻辑移入 `search-worker.js`：
1. 主线程发送 `allMetadata` 给 Worker。
2. Worker 构建索引。
3. 主线程发送 `search(term)` 消息。
4. Worker 返回结果 IDs。

## 5. 预期效果
- **容错性**: 搜 "busines" (少一个s) 依然能命中 "Business"。
- **相关度**: 标题包含关键词的结果排在描述包含关键词的结果之前。
- **高亮**: 可以在 UI 上高亮匹配到的文字片段（MiniSearch 支持返回 `match` 位置）。
