# VectorStream 矢量流 - 本地素材管理系统 (v1.4.0)

VectorStream 是一个现代化的、基于 AI 驱动的 SVG 矢量插画本地管理与检索系统。它专为解决“素材多、管理难、查找慢”的痛点而设计，通过集成大模型 (LLM) 的语义理解能力，让您可以像使用 Google 图片搜索一样精准查找本地素材。本版本已实现 **全离线运行**。

![Project Banner](assets/logo.svg)

## ✨ 核心特性

- **🤖 AI 语义检索 (Semantic Search 2.0)**
  - 内置 **Qwen3-VL (32B)** 视觉大模型接口，自动分析插画内容。
  - **组合逻辑检索**：支持多关键词 AND 组合搜索（如 "tech blue meeting"）。
  - **隐式分类映射**：直接搜索中文分类名（如 "商务"）即可命中对应分类下的所有素材。
  - 智能补全分类：AI 自动识别画面并归类，解决文件名含糊不清的问题。

- **🎨 深度个性化 (Deep Personalization)**
  - **沉浸式配色**：一键修改所有 SVG 的主色调，预览与下载同步生效。
  - **动态布局**：自由调节网格密度（2-10列）与每页行数（5-All），适应各种屏幕尺寸。
  - **细节打磨**：优化的毛玻璃质感（0.65 Alpha）与比例适宜的界面间距。

- **🌐 全离线支持 (Offline First)**
  - **组件本地化**：所有字体（Outfit / Noto Sans SC）及脚本逻辑均已本地化。
  - **内网友好**：无需连接外网即可享受完整的预览、搜索与配色功能。

- **🔍 智能分类与标签 (Smart Taxonomy)**
  - 基于 8 大核心场景（技术、商业、设计等）的科学分类体系。
  - 支持 **多维度筛选**：文件名关键词 + AI 标签 + 标准分类 + 描述文本。

- **⚡️ 高性能浏览体验**
  - **Glassmorphism UI**：现代化的毛玻璃风格界面，沉浸式体验。
  - **双格式下载**：弹窗预览支持 **SVG 源码**与 **PNG 高清位图**下载。
  - **站点 Favicon**：新增精美站点图标。

## 🛠 技术栈 (Tech Stack)

本项目采用 **"纯粹且高效" (Pure & Efficient)** 的技术架构，无繁重的框架依赖：

### 前端 (Frontend)
- **HTML5**: 语义化标签结构。
- **CSS3 (Vanilla)**: 
  - 使用 CSS Variables 实现主题定制。
  - 大量应用 `backdrop-filter` 实现高性能毛玻璃效果。
  - Flexbox & Grid 现代布局。
- **JavaScript (ES6+)**: 
  - 原生 DOM 操作，无 jQuery/Vue/React 依赖。
  - 基于 `fetch` 的异步数据加载。
  - Canvas API 实现 SVG 转 PNG。

### 后端与数据 (Backend & Data)
- **Python 3**: 核心脚本语言。
- **AI Engine**: 集成 **SiliconFlow API** (Qwen3-VL-32B-Instruct)。
- **Data Store**: 
  - `metadata.json`: 包含所有素材的元数据索引。
  - `taxonomy.json`: 定义分类树和双语关键词映射。
  - `ai_cache.json`: 实现 AI 标注的断点续传。

## 🚀 快速开始

### 1. 环境准备
确保您的电脑已安装：
- **Python 3.8+**
- **Node.js** (仅用于启动本地静态服务 `npx serve`)

### 2. 安装依赖
```bash
# 进入项目目录
cd VectorStream

# 安装 Python 依赖 (用于 AI 标注脚本)
pip install requests

# (可选) 从自定义目录导入并重命名图标素材
python3 process_icons.py --source /path/to/your/icons
```

### 3. 运行服务
启动前端界面：
```bash
# 使用 npx 启动静态服务 (默认端口 3000 或 3001)
npx serve . -l 3001
```
访问浏览器：`http://localhost:3001`

### 4. (可选) 运行 AI 标注
如果您添加了新素材，或想重新生成标签：
```bash
# 确保已配置 API Key (在脚本中设置)
python3 ai_tagger.py
```

## 📂 目录结构

```
VectorStream/
├── assets/
│   ├── illustrations/       # 2,396 个 SVG 源文件
│   ├── metadata.json        # 核心索引库 (由 AI 生成)
│   ├── taxonomy.json        # 分类体系定义
│   └── ai_cache.json        # AI 结果缓存
├── ai_tagger.py             # 核心处理引擎：AI 标注、增量更新与并发管理
├── process_icons.py         # 图标预处理：重命名与唯一性校验
├── index.html               # 主入口
├── script.js                # 前端交互逻辑
├── style.css                # 样式表
└── README.md                # 项目文档
```

## 📜 版本历史

- **v1.4.0 (Current)**:
  - 🚀 **大规模资产整合**：成功整合了包括 IconPark, Lucide 等在内的 1.5 万个新图标资产，总数突破 1.7 万。
  - 🏎️ **并发标注引擎**：重构 `ai_tagger.py` 以支持多线程并发，标注效率提升 5-10 倍。
  - 📑 **增量任务清单**：引入 `incremental_task.json` 清单机制，支持精准的断点续传。
- **v1.3.2**:
- **v1.3.1**:
  - 💄 **个性化定制**：新增网格密度滑块、行数选择器、回到顶部按钮。
  - 🖼 **双格式下载**：新增 PNG 导出功能。
  - 🏷 **品牌本地化**：项目更名为 "VectorStream 矢量流"。
- **v1.2.1**: 修复 SVG 渲染与尺寸异常。
- **v1.2**: 引入 AI 自动分类补全。
- **v1.1**: 集成 SiliconFlow API 实现语义搜索。
- **v1.0**: 基础本地浏览功能。

## 📄 版权说明
- **System License**: MIT License
- **Assets Source**: 本系统内素材来源于以下开源项目，均遵循其原有的免费商用协议：
  - **插画类**: [unDraw.co](https://undraw.co), [Lukasz Adam](https://lukaszadam.com), **VectorCraftr**。
  - **图标类**: [IconPark](https://iconpark.oceanengine.com), [Lucide](https://lucide.dev), [Tabler Icons](https://tabler-icons.io), [Feather](https://feathericons.com), [Heroicons](https://heroicons.com), [Iconoir](https://iconoir.com)。
- **Author**: Kwangwa Hung / 鹿溪联合创新实验室

---
© 2026 Crafted with Excellence.
