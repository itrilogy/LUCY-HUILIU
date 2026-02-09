let allMetadata = [];
let taxonomy = [];
let filteredMetadata = [];
let currentColor = '#028000';
let activeCategory = 'all';

// Pagination State
let currentPage = 1;
let rowsPerPage = 5; // Default 5 rows

// DOM 元素
const gallery = document.getElementById('gallery');
const searchInput = document.getElementById('searchInput');
const resultCount = document.getElementById('resultCount');
const colorPicker = document.getElementById('colorPicker');
const gridRange = document.getElementById('gridRange');
const categoryList = document.getElementById('categoryList');
const downloadModal = document.getElementById('downloadModal');
const rowsSelect = document.getElementById('rowsSelect');
const paginationNav = document.getElementById('paginationNav');
const backToTopBtn = document.getElementById('backToTop');
const versionModal = document.getElementById('versionModal');
const toast = document.getElementById('toast');
const canvas = document.getElementById('conversionCanvas');

// 初始化
async function init() {
    try {
        // 并行加载元数据和分类库
        const [metaRes, taxRes] = await Promise.all([
            fetch('assets/metadata.json'),
            fetch('assets/taxonomy.json')
        ]);

        allMetadata = await metaRes.json();
        taxonomy = await taxRes.json();

        renderCategoryNav();
        filterAndRender();
        setupEventListeners();
        updateGrid(gridRange.value);
    } catch (error) {
        console.error('无法初始化智能检索系统:', error);
        showToast('智能索引加载失败，请运行 AI 标注脚本');
    }
}

// 渲染分类导航
function renderCategoryNav() {
    taxonomy.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'cat-item';
        btn.dataset.cat = cat.id;
        btn.textContent = cat.zh;
        categoryList.appendChild(btn);
    });
}

// 智能名字转换（如果 metadata 中没有 title）
function beautifyName(filename) {
    return filename.replace('.svg', '').replace(/[_-]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// 核心过滤逻辑：支持 分类 + 语义搜索 + 多关键词 + 隐式分类匹配
function filterAndRender() {
    const rawTerm = searchInput.value.toLowerCase().trim();
    const keywords = rawTerm.split(/\s+/).filter(k => k.length > 0); // Split by space
    currentPage = 1; // Search/Filter resets pagination

    // 预处理：构建中文分类名 -> ID 的映射，即使 taxonomy 还没加载完也能安全运行
    const categoryMap = {};
    if (taxonomy && taxonomy.length > 0) {
        taxonomy.forEach(t => {
            if (t.zh) categoryMap[t.zh] = t.id;
            if (t.en) categoryMap[t.en.toLowerCase()] = t.id;
        });
    }

    filteredMetadata = allMetadata.filter(item => {
        // 1. 显式分类筛选 (Navigation Bar)
        const matchesActiveCategory = activeCategory === 'all' || (item.categories && item.categories.includes(activeCategory));
        if (!matchesActiveCategory) return false;

        // 2. 关键词筛选 (AND Logic)
        if (keywords.length === 0) return true;

        // 必须满足所有关键词 (every)
        return keywords.every(keyword => {
            // A. 隐式分类匹配
            // 如果关键词是 "商务"，则检查 item.categories 是否包含 "business"
            const targetCatId = categoryMap[keyword]; // 尝试从关键词映射分类ID
            if (targetCatId && item.categories && item.categories.includes(targetCatId)) {
                return true;
            }

            // B. 常规字段匹配
            // 文件名或标题
            if (item.file.toLowerCase().includes(keyword) || item.title.toLowerCase().includes(keyword)) return true;

            // 标签 (Tags)
            if (item.tags) {
                // Standard Tags
                if (item.tags.standard && item.tags.standard.some(t =>
                    (t.en && t.en.toLowerCase().includes(keyword)) ||
                    (t.zh && t.zh.includes(keyword))
                )) return true;

                // AI Tags
                if (item.tags.ai && item.tags.ai.some(t =>
                    (t.en && t.en.toLowerCase().includes(keyword)) ||
                    (t.zh && t.zh.includes(keyword))
                )) return true;
            }

            // 描述
            if (item.description && item.description.includes(keyword)) return true;

            return false;
        });
    });

    renderGallery();
}

// 渲染画廊
function renderGallery() {
    gallery.innerHTML = '';
    resultCount.textContent = filteredMetadata.length;

    let displayData = filteredMetadata;

    // Pagination Logic
    if (rowsPerPage !== 'all') {
        // Get current grid columns from CSS variable or default to 4
        const cols = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-cols')) || 4;
        const itemsPerPage = cols * parseInt(rowsPerPage);

        // Safety check
        if (itemsPerPage > 0) {
            const startIndex = (currentPage - 1) * itemsPerPage;
            displayData = filteredMetadata.slice(startIndex, startIndex + itemsPerPage);
        }
    }

    displayData.forEach(item => {
        const card = document.createElement('div');
        card.className = 'svg-card';
        card.setAttribute('data-file', item.file);
        card.innerHTML = `
            <div class="svg-container" data-src="assets/illustrations/${item.file}">
                <div class="placeholder">加载中...</div>
            </div>
            <div class="svg-title">${item.title || beautifyName(item.file)}</div>
        `;
        gallery.appendChild(card);
        observer.observe(card.querySelector('.svg-container'));
    });

    renderPaginationControls();
}

// 渲染分页控件
function renderPaginationControls() {
    paginationNav.innerHTML = '';

    // If no pagination needed or no results
    if (rowsPerPage === 'all' || filteredMetadata.length === 0) return;

    const cols = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-cols')) || 4;
    const itemsPerPage = cols * parseInt(rowsPerPage);
    const totalPages = Math.ceil(filteredMetadata.length / itemsPerPage);

    if (totalPages <= 1) return;

    // Prev Button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            renderGallery();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Info
    const info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = `第 ${currentPage} / ${totalPages} 页`;

    // Next Button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderGallery();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    paginationNav.append(prevBtn, info, nextBtn);
}

// 懒加载观察者
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const container = entry.target;
            const src = container.getAttribute('data-src');
            if (src) {
                loadSvg(container, src);
                observer.unobserve(container);
            }
        }
    });
}, { rootMargin: '200px' });

async function loadSvg(container, src) {
    try {
        const response = await fetch(src);
        let svgText = await response.text();

        // 智能修复：如果缺失 viewBox，尝试从 width/height 构造
        if (!svgText.includes('viewBox')) {
            const widthMatch = svgText.match(/width\s*=\s*["'](\d+(?:\.\d+)?)["']/);
            const heightMatch = svgText.match(/height\s*=\s*["'](\d+(?:\.\d+)?)["']/);
            if (widthMatch && heightMatch) {
                const w = widthMatch[1];
                const h = heightMatch[1];
                svgText = svgText.replace('<svg', `<svg viewBox="0 0 ${w} ${h}"`);
            }
        }

        // 2. 强制根元素尺寸适配 (100%)
        // 提取 <svg ... > 开头标签，避免误伤内部元素的 attributes
        const svgOpenTagMatch = svgText.match(/<svg[^>]*>/);
        if (svgOpenTagMatch) {
            let openTag = svgOpenTagMatch[0];

            // 处理 width
            if (openTag.match(/\bwidth\s*=/)) {
                openTag = openTag.replace(/\bwidth\s*=\s*["'][^"']*["']/, 'width="100%"');
            } else {
                openTag = openTag.replace('<svg', '<svg width="100%"');
            }

            // 处理 height
            if (openTag.match(/\bheight\s*=/)) {
                openTag = openTag.replace(/\bheight\s*=\s*["'][^"']*["']/, 'height="100%"');
            } else {
                openTag = openTag.replace('<svg', '<svg height="100%"');
            }

            svgText = svgText.replace(svgOpenTagMatch[0], openTag);
        }
        container.innerHTML = svgText;
    } catch (error) {
        container.innerHTML = '<div class="error">!</div>';
    }
}

function updateGrid(value) {
    document.documentElement.style.setProperty('--grid-cols', value);
    renderGallery(); // Re-render to update pagination based on new columns
}

// 下载弹窗逻辑
let activeItem = null;
function openDownload(filename) {
    activeItem = allMetadata.find(i => i.file === filename);
    if (!activeItem) return;

    const modalTags = document.getElementById('modalTags');
    modalTags.innerHTML = '';

    // 1. 渲染分类 (Priority)
    if (activeItem.categories && activeItem.categories.length > 0) {
        activeItem.categories.forEach(catId => {
            const catInfo = taxonomy.find(t => t.id === catId);
            if (catInfo) {
                const badge = document.createElement('span');
                badge.className = 'tag-chip category-chip';
                badge.textContent = catInfo.zh; // 显示中文分类名
                modalTags.appendChild(badge);
            }
        });
    }

    // 2. 渲染标准标签
    if (activeItem.tags && activeItem.tags.standard) {
        activeItem.tags.standard.forEach(tag => {
            const badge = document.createElement('span');
            badge.className = 'tag-chip';
            badge.textContent = tag.zh; // 优先显示中文
            modalTags.appendChild(badge);
        });
    }

    // 3. 渲染 AI 标签 (Limit to first 5 to avoid clutter)
    if (activeItem.tags && activeItem.tags.ai) {
        activeItem.tags.ai.slice(0, 5).forEach(tag => {
            // 避免与标准标签重复
            if (activeItem.tags.standard && activeItem.tags.standard.some(t => t.zh === tag.zh)) return;

            const badge = document.createElement('span');
            badge.className = 'tag-chip';
            // AI tag 样式微调?? 这里复用 tag-chip
            badge.textContent = tag.zh;
            modalTags.appendChild(badge);
        });
    }

    document.getElementById('modalTitle').textContent = activeItem.title;
    const src = `assets/illustrations/${activeItem.file}`;

    fetch(src).then(r => {
        if (!r.ok) throw new Error('File not found');
        return r.text();
    }).then(svgText => {
        // 智能修复：如果缺失 viewBox，尝试从 width/height 构造
        if (!svgText.includes('viewBox')) {
            const widthMatch = svgText.match(/width\s*=\s*["'](\d+(?:\.\d+)?)["']/);
            const heightMatch = svgText.match(/height\s*=\s*["'](\d+(?:\.\d+)?)["']/);
            if (widthMatch && heightMatch) {
                const w = widthMatch[1];
                const h = heightMatch[1];
                svgText = svgText.replace('<svg', `<svg viewBox="0 0 ${w} ${h}"`);
            }
        }

        // 2. 强制根元素尺寸适配 (100%)
        // 提取 <svg ... > 开头标签，避免误伤内部元素的 attributes
        const svgOpenTagMatch = svgText.match(/<svg[^>]*>/);
        if (svgOpenTagMatch) {
            let openTag = svgOpenTagMatch[0];

            // 处理 width
            if (openTag.match(/\bwidth\s*=/)) {
                openTag = openTag.replace(/\bwidth\s*=\s*["'][^"']*["']/, 'width="100%"');
            } else {
                openTag = openTag.replace('<svg', '<svg width="100%"');
            }

            // 处理 height
            if (openTag.match(/\bheight\s*=/)) {
                openTag = openTag.replace(/\bheight\s*=\s*["'][^"']*["']/, 'height="100%"');
            } else {
                openTag = openTag.replace('<svg', '<svg height="100%"');
            }

            svgText = svgText.replace(svgOpenTagMatch[0], openTag);
        }

        // 3. 实时主题色注入 (关键修复：确保预览和下载都生效)
        // 将 unDraw 默认紫色硬编码替换为当前选择的颜色
        svgText = svgText.replace(/#6c63ff/gi, currentColor);

        document.getElementById('modalSvgPreview').innerHTML = svgText;
        downloadModal.classList.remove('hidden');
    }).catch(err => {
        console.error("Preview failed:", err);
        document.getElementById('modalSvgPreview').innerHTML = `<div class="error">预览失败: ${activeItem.file}</div>`;
        downloadModal.classList.remove('hidden');
    });
}

// Canvas 位图转换
async function downloadAsPng() {
    const svgElement = document.querySelector('#modalSvgPreview svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
        const scale = 2;
        canvas.width = (svgElement.viewBox.baseVal.width || 1200) * scale;
        canvas.height = (svgElement.viewBox.baseVal.height || 900) * scale;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            const pngUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = activeItem.file.replace('.svg', '.png');
            a.click();
            URL.revokeObjectURL(pngUrl);
            showToast('PNG 导出成功');
        }, 'image/png');
        URL.revokeObjectURL(url);
    };
    img.src = url;
}

// 事件监听
function setupEventListeners() {
    searchInput.addEventListener('input', filterAndRender);

    colorPicker.addEventListener('input', (e) => {
        currentColor = e.target.value;
        document.documentElement.style.setProperty('--primary-color', currentColor);
    });

    rowsSelect.addEventListener('change', (e) => {
        rowsPerPage = e.target.value;
        currentPage = 1; // Reset to first page
        renderGallery();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    gridRange.addEventListener('input', (e) => updateGrid(e.target.value));

    // 分类切换
    categoryList.addEventListener('click', (e) => {
        const item = e.target.closest('.cat-item');
        if (item) {
            document.querySelectorAll('.cat-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            activeCategory = item.dataset.cat;
            filterAndRender();
        }
    });

    gallery.addEventListener('click', (e) => {
        const card = e.target.closest('.svg-card');
        if (card) openDownload(card.getAttribute('data-file'));
    });

    document.getElementById('closeDownload').onclick = () => downloadModal.classList.add('hidden');
    document.getElementById('closeVersion').onclick = () => versionModal.classList.add('hidden');
    document.getElementById('versionTrigger').onclick = () => versionModal.classList.remove('hidden');

    document.getElementById('downloadSvg').onclick = () => {
        const svgData = document.querySelector('#modalSvgPreview').innerHTML;
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = activeItem.file;
        a.click();
        URL.revokeObjectURL(url);
        showToast('SVG 下载成功');
    };

    document.getElementById('downloadPng').onclick = downloadAsPng;

    window.onclick = (e) => {
        if (e.target === downloadModal) downloadModal.classList.add('hidden');
        if (e.target === versionModal) versionModal.classList.add('hidden');
    };
}

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
}

init();
