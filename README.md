<div align="center">
  <img src="assets/brand/favicon.svg" width="64" height="64" alt="绘流 · HuiLiu 产品标" />
  &nbsp;&nbsp;
  <img src="assets/brand/luxi-lab-main.svg" width="64" height="64" alt="鹿溪联合创新实验室 LUXI LAB" />
</div>

<h1 align="center">绘流 · HuiLiu（VectorStream）</h1>

<p align="center">
  <strong>引线定锚，聚迹成流</strong><br/>
  <em>Anchors define precision; vectors flow in harmony.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Matrix-知行%C2%B7三动-0D5E42" alt="matrix" />
  <img src="https://img.shields.io/badge/Product-绘流%20HuiLiu-0D5E42" alt="product" />
  <img src="https://img.shields.io/badge/Lab-鹿溪联合创新实验室-047538" alt="lab" />
  <img src="https://img.shields.io/badge/Version-v1.8.0-f1c40f" alt="version" />
  <img src="https://img.shields.io/badge/Stack-HTML%20%7C%20CSS%20%7C%20JS%20%7C%20Python-blue" alt="stack" />
</p>

<p align="center">
  <b>鹿溪联合创新实验室</b>（LUXI Joint Innovation Lab）出品<br/>
  仓库：<a href="https://github.com/itrilogy/LUCY-HUILIU">itrilogy/LUCY-HUILIU</a>
</p>

---

**绘流 · HuiLiu**（工程代号 VectorStream）是一个本地优先的 SVG 矢量资产管理工作站。它以贝塞尔路径为基底，支持 AI 语义检索、调色去背与双格式导出，专为解决「素材多、管理难、查找慢」而设计。本版本已实现 **全离线运行**。

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
  - **棋盘格预览**：网格与弹窗均可辨认透明区域。
  - **分层去背 / 改色**：按色清除、整图换色、擦除 / 填充选块、去掉画板框。
  - **双格式下载**：下载当前预览的 SVG / 透明 PNG，不必先保存。

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
  - `catalog.json`: 首屏精简检索目录。
  - `metadata.json`: 完整元数据索引。
  - `taxonomy.json`: 分类树和双语关键词映射。
  - `ai_cache.json`: AI 标注断点续传。

## 🚀 快速开始

### 1. 环境准备
确保您的电脑已安装：
- **Python 3.8+**（推荐用自带 `server.py` 启动，支持 gzip 与素材库写回）

### 2. 安装依赖
```bash
# 进入项目目录
cd LUCY-HUILIU

# 安装 Python 依赖 (用于 AI 标注脚本)
pip install requests

# (可选) 从自定义目录导入并重命名图标素材
python3 process_icons.py --source /path/to/your/icons
```

### 3. 运行服务
推荐用自带服务器（gzip 压缩 JSON；管理员登录后可写回素材库）：
```bash
cp .env.example .env   # 首次：填写 VS_ADMIN_PIN
python3 server.py --port 3001
```
访问：`http://localhost:3001`

仅浏览、不需要写回时，也可用：
```bash
npx serve . -l 3001
```

若更新了 `metadata.json`，请重建精简目录：
```bash
python3 build_index.py
```

### 4. (可选) 运行 AI 标注
如果您添加了新素材，或想重新生成标签：
```bash
# 确保已配置 API Key (在脚本中设置)
python3 ai_tagger.py
```

## 📂 目录结构

```
LUCY-HUILIU/
├── assets/
│   ├── brand/               # 产品标识 + 实验室主 LOGO
│   ├── illustrations/       # 17,000+ 个 SVG 源文件
│   ├── catalog.json         # 精简检索目录（首屏加载）
│   ├── metadata.json        # 完整索引库 (由 AI 生成)
│   ├── taxonomy.json        # 分类体系定义
│   └── ai_cache.json        # AI 结果缓存
├── docs/软件说明书.md       # 软著鉴别：产品说明书
├── USER_MANUAL.md           # 使用说明书
├── server.py                # 本地服务、管理登录、写回
├── process_icons.py         # 导入重命名
├── build_index.py / clean_tags.py
├── index.html / script.js / style.css
└── README.md
```

## 🎨 品牌标识

| 标识 | 预览 | 说明 | 源文件 |
| :---: | :---: | :--- | :--- |
| **产品方标** | <img src="assets/brand/favicon.svg" width="32" height="32" alt="绘流" /> | 贝塞尔手柄 + 溪流 + 标题金落点（鹿溪绿底） | `assets/brand/favicon.svg` |
| **产品字锁** | [`assets/brand/logo.svg`](assets/brand/logo.svg) | 横版产品字锁 | `assets/brand/logo.svg` |
| **实验室主标** | <img src="assets/brand/luxi-lab-main.svg" width="32" height="32" alt="LUXI LAB" /> | 官方 LUXI LAB | `assets/brand/luxi-lab-main.svg` |

**色板（LUXI CI）**

| Token | 色值 | 用途 |
| :--- | :--- | :--- |
| 鹿溪绿 | `#0D5E42` | 主色 / 图标底板 |
| 源启白 | `#F5F7FA` | 浅色背景 / 反白 |
| 进化蓝 | `#00D2FF` | 溪流 / 数据高亮 |
| 标题金 | `#F1C40F` | 落点 / 显著信号 |

## 📜 版本历史

- **v1.8.0 (Current)**:
  - ✏️ **编辑语义**：按色清除 / 整图换色 / 擦除选块 / 填充选块 / 去掉画板框。
  - 🔐 **管理登录**：顶栏 / 页脚入口；口令仅 `.env` + `server.py` 校验。
  - 🏷 **标签清洗**：去掉 `en:` 残片与描述句，合并极度近义项。
  - 📄 **文档**：使用手册与软著《软件说明书》增量对齐。
- **v1.7.0**:
  - 📦 **精简目录**：首屏改加载 `catalog.json`（约 5MB / gzip 1.3MB），不再先拉 12.8MB metadata。
  - 🪟 **虚拟网格**：无分页时只挂载可视行，避免 1.7 万 DOM 卡死。
  - 🖼 **重资源**：超过 80KB 的 SVG 网格用 `<img>` 预览，弹窗再解析。
  - 💾 **素材库写回**：`python3 server.py` 提供 `POST /api/save`。
  - 🌙 **深色模式**、焦点环与网格方向键导航。
- **v1.6.0**:
  - 🎨 **产品品牌**：鹿溪 CI 产品标 + favicon，页脚 / 关于加入实验室主 LOGO 出品方。
  - 🖼 **预览编辑**：棋盘格透明预览、拾色分层去背/改色、撤销还原、剥离画布底。
  - ⚡ **浏览性能**：网格 IntersectionObserver 惰性加载；搜索覆盖描述与 AI 标签。
- **v1.4.0**:
  - 🚀 **大规模资产整合**：成功整合了包括 IconPark, Lucide 等在内的 1.5 万个新图标资产，总数突破 1.7 万。
  - 🏎️ **并发标注引擎**：重构 `ai_tagger.py` 以支持多线程并发，标注效率提升 5-10 倍。
  - 📑 **增量任务清单**：引入 `incremental_task.json` 清单机制，支持精准的断点续传。
- **v1.3.2**:
- **v1.3.1**:
  - 💄 **个性化定制**：新增网格密度滑块、行数选择器、回到顶部按钮。
  - 🖼 **双格式下载**：新增 PNG 导出功能。
  - 🏷 **品牌本地化**：产品定名为「绘流 · HuiLiu（VectorStream）」。
- **v1.2.1**: 修复 SVG 渲染与尺寸异常。
- **v1.2**: 引入 AI 自动分类补全。
- **v1.1**: 集成 SiliconFlow API 实现语义搜索。
- **v1.0**: 基础本地浏览功能。

## 📄 版权说明
- **System License**: MIT License
- **Assets Source**: 本系统内素材来源于以下开源项目，均遵循其原有的免费商用协议：
  - **插画类**: [unDraw.co](https://undraw.co), [Lukasz Adam](https://lukaszadam.com), **VectorCraftr**。
  - **图标类**: [IconPark](https://iconpark.oceanengine.com), [Lucide](https://lucide.dev), [Tabler Icons](https://tabler-icons.io), [Feather](https://feathericons.com), [Heroicons](https://heroicons.com), [Iconoir](https://iconoir.com)。
- **Author**: Kwangwa Hung
- **出品**: 鹿溪联合创新实验室（LUXI Joint Innovation Lab）

---

<div align="center">
  <img src="assets/brand/luxi-lab-main.svg" width="48" height="48" alt="LUXI LAB" />
  <p><strong>绘流 · HuiLiu</strong> · 引线定锚，聚迹成流</p>
  <p>© 鹿溪联合创新实验室 · LUXI Joint Innovation Lab</p>
  <p><em>林深见鹿，源启清溪 · Deep Insights, Evolutionary Origin.</em></p>
</div>
