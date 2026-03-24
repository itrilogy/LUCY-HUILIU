/**
 * VectorStream script.js v1.5.8 (Fix 2)
 * 功能：深度背景清洗 + UI 视觉、交互完全修复。
 * 修复：类名对齐 style.css、恢复弹窗与交互监听、优化大数据兼容。
 */
const VERSION = '1.5.8';

// --- 核心状态 ---
let allMetadata = [];
let taxonomy = [];
let filteredMetadata = [];
let activeCategory = 'all';
let currentColor = '#028000';
let miniSearch = null;
let currentPage = 1;
let rowsPerPage = 5;

const getEl = (id) => document.getElementById(id);

const els = {
    gallery: getEl('gallery'),
    searchInput: getEl('searchInput'),
    resultCount: getEl('resultCount'),
    categoryList: getEl('categoryList'),
    downloadModal: getEl('downloadModal'),
    versionModal: getEl('versionModal'),
    rowsSelect: getEl('rowsSelect'),
    gridRange: getEl('gridRange'),
    colorPicker: getEl('colorPicker'),
    clearSearch: getEl('clearSearch'),
    paginationNav: getEl('paginationNav'),
    backToTop: getEl('backToTop'),
    toast: getEl('toast'),
    canvas: getEl('conversionCanvas'),
    modalTitle: getEl('modalTitle'),
    modalTags: getEl('modalTags'),
    modalPreview: getEl('modalSvgPreview'),
    bgColorPicker: getEl('bgColorPicker'),
    bgColorDisplay: getEl('bgColorDisplay'),
    themeColorPicker: getEl('themeColorPicker'),
    themeColorDisplay: getEl('themeColorDisplay')
};

// --- 全局处理器仓库 ---
let currentRawSvg = ''; // 存储当前弹窗素材的原始 SVG

// --- SVG 处理器：统一预览版 (v1.6.4) ---
// 该函数现在仅负责：1. 结构补全 (viewBox)  2. 基础色彩映射 (黑/紫 -> currentColor)
// 它不再执行任何自动去背动作，确保网格预览与弹窗初始态完全一致。
function processSvgContent(svgText) {
    if (!svgText) return '';
    let text = svgText.trim();

    // 1. 结构与视图保障
    if (!text.includes('viewBox')) {
        const w = text.match(/width\s*=\s*["'](\d+)["']/);
        const h = text.match(/height\s*=\s*["'](\d+)["']/);
        if (w && h) text = text.replace('<svg', `<svg viewBox="0 0 ${w[1]} ${h[1]}"`);
        else text = text.replace('<svg', '<svg viewBox="0 0 24 24"');
    }

    text = text.replace(/<svg[^>]*>/i, (match) => {
        return match
            .replace(/\s+width\s*=\s*["'][^"']*["']/gi, '')
            .replace(/\s+height\s*=\s*["'][^"']*["']/gi, '');
    });

    if (!text.includes('preserveAspectRatio')) {
        text = text.replace('<svg', '<svg preserveAspectRatio="xMidYMid meet"');
    }

    // 2. 默认色彩映射 (保持变色能力)
    text = text.replace(/fill\s*=\s*["'](?:#000|#000000|black|#6c63ff|#6C63FF)["']/gi, 'fill="currentColor"');
    text = text.replace(/stroke\s*=\s*["'](?:#000|#000000|black|#6c63ff|#6C63FF)["']/gi, 'stroke="currentColor"');

    return text;
}

// --- 色彩工具：设为主色 ---
function applyTheming(svgText, targetColor) {
    if (!svgText || !targetColor) return svgText;
    // 将指定颜色映射为 currentColor，使其随动变色 (大小写不敏感匹配)
    const colorRegex = new RegExp(`(fill|stroke)=["']${targetColor}["']`, "gi");
    return svgText.replace(colorRegex, '$1="currentColor"');
}

// --- 深度工具：路径剥离与特定清除 ---
function deepCleanSvg(svgText, targetColor = null) {
    if (!svgText) return '';
    let text = svgText;

    // A. 定向色块清除 (转为 None，大小写不敏感匹配)
    if (targetColor) {
        const colorRegex = new RegExp(`(fill|stroke)=["']${targetColor}["']`, "gi");
        text = text.replace(colorRegex, '$1="None"');
    }

    // B. 全屏路径剥离 (针对合并路径背景)
    const fsRegex = /M\s*(?:1024|0)(?:\.0+)?\s*(?:1024|0)(?:\.0+)?(?:\s*L\s*-?\d+(?:\.\d+)?\s*-?\d+(?:\.\d+)?){3,5}(?:\s*Z)?/gi;
    text = text.replace(/(<path[^>]*d=["'])([^"']*)(["'][^>]*>)/gi, (fullMatch, start, dAttr, end) => {
        if (fsRegex.test(dAttr)) {
            const newD = dAttr.replace(fsRegex, '').trim();
            if (newD === '' || newD.length < 10) return '';
            return start + newD + end;
        }
        return fullMatch;
    });

    return text;
}

// --- 数据加载 ---
async function loadData() {
    try {
        const [metaRes, taxRes] = await Promise.all([
            fetch('assets/metadata.json'),
            fetch('assets/taxonomy.json')
        ]);
        if (!metaRes.ok || !taxRes.ok) throw new Error('Data load failed');

        allMetadata = await metaRes.json();
        taxonomy = await taxRes.json();

        if (!taxonomy.find(t => t.id === 'all')) {
            taxonomy.unshift({ id: 'all', zh: '全部素材', en: 'All Assets' });
        }

        filteredMetadata = [...allMetadata];
        renderTaxonomy();
        initSearch();
        renderGallery();
        updateStats();

        // 绑定全局点击关闭逻辑 (除了初始化)
        bindEvents();
    } catch (err) {
        console.error(err);
        showToast('数据加载失败', 'error');
    }
}

function bindEvents() {
    // 弹窗关闭
    getEl('closeDownload').onclick = closeDownload;
    getEl('closeVersion').onclick = closeVersion;
    els.downloadModal.onclick = (e) => { if (e.target === els.downloadModal) closeDownload(); };
    els.versionModal.onclick = (e) => { if (e.target === els.versionModal) closeVersion(); };

    // 搜索清除
    els.clearSearch.onclick = () => {
        els.searchInput.value = '';
        els.clearSearch.classList.add('hidden');
        handleSearch();
    };

    // 版本触发
    getEl('versionTrigger').onclick = () => els.versionModal.classList.add('active');

    // 下载按钮
    getEl('downloadSvg').onclick = () => download('svg');
    getEl('downloadPng').onclick = () => download('png');
    getEl('saveOriginal').onclick = handleSaveToOriginal;

    // 辅助工具：点击拾色
    els.modalPreview.onclick = (e) => {
        const target = e.target.closest('path, rect, circle, ellipse, polygon, polyline');
        if (target) {
            let color = target.getAttribute('fill') || target.style.fill;
            if (color && color !== 'currentColor' && color !== 'None' && color !== 'none') {
                // 如果是 rgb 格式，转为 hex
                if (color.startsWith('rgb')) {
                    const rgb = color.match(/\d+/g);
                    color = "#" + rgb.map(x => {
                        const hex = parseInt(x).toString(16);
                        return hex.length === 1 ? "0" + hex : hex;
                    }).join("");
                }
                const hexColor = color.toUpperCase();

                // 同步更新两个拾色器
                els.bgColorPicker.value = color;
                els.bgColorDisplay.textContent = hexColor;
                els.themeColorPicker.value = color;
                els.themeColorDisplay.textContent = hexColor;

                showToast(`已拾取颜色: ${hexColor}`, 'success');
            }
        }
    };

    els.bgColorPicker.oninput = (e) => {
        els.bgColorDisplay.textContent = e.target.value.toUpperCase();
        handleDeepClean(); // 实时去背预览
    };

    els.themeColorPicker.oninput = (e) => {
        els.themeColorDisplay.textContent = e.target.value.toUpperCase();
        handleSetTheme(); // 实时变色预览
    };

    getEl('applyDeepClean').onclick = handleDeepClean;
    getEl('setThemeColor').onclick = handleSetTheme;
}

// --- 文件覆写逻辑 (v1.6.3) ---
async function handleSaveToOriginal() {
    if (!pendingDownload || !currentProcessedSvg) return;

    try {
        // 使用针对编辑修订的 SVG 代码（转为 currentColor 前的代码，或者根据需要调整）
        // 这里我们保存的是 currentProcessedSvg，它已经包含了去背处理
        const processed = currentProcessedSvg.replace(/currentColor/g, currentColor);

        // 现代浏览器 File System Access API
        if ('showSaveFilePicker' in window) {
            const opts = {
                suggestedName: pendingDownload.file || (pendingDownload.title + '.svg'),
                types: [{
                    description: 'SVG Image',
                    accept: { 'image/svg+xml': ['.svg'] },
                }],
            };
            const handle = await window.showSaveFilePicker(opts);
            const writable = await handle.createWritable();
            await writable.write(processed);
            await writable.close();
            showToast('覆写保存成功', 'success');
        } else {
            // 降级方案：触发下载并提示
            download('svg');
            showToast('浏览器不支持直接覆写，已为您下载副本，请手动覆盖原件', 'warning');
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error(err);
            showToast('保存失败', 'error');
        }
    }
}

// --- 渲染逻辑 (对齐 CSS) ---
function renderTaxonomy() {
    els.categoryList.innerHTML = taxonomy.map(cat => `
        <button class="cat-item ${cat.id === activeCategory ? 'active' : ''}" 
                onclick="filterCategory('${cat.id}')">
            ${cat.zh || cat.name || cat.id}
        </button>
    `).join('');
}

function updateStats() {
    els.resultCount.textContent = filteredMetadata.length;
}

async function renderGallery() {
    const isAll = rowsPerPage === 'all';
    const num = isAll ? filteredMetadata.length : rowsPerPage * 6;
    const start = isAll ? 0 : (currentPage - 1) * num;
    const end = isAll ? filteredMetadata.length : start + num;
    const pageData = filteredMetadata.slice(start, end);

    els.gallery.innerHTML = '';

    for (const item of pageData) {
        const card = document.createElement('div');
        card.className = 'svg-card'; // 对齐 CSS
        card.onclick = () => openDownload(item.id || item.file);

        const safeId = (item.id || item.file).replace(/[^a-z0-9]/gi, '-');
        card.innerHTML = `
            <div class="svg-container" id="preview-${safeId}">
                <div class="loader"></div>
            </div>
            <div class="svg-title">${item.title || item.name}</div>
        `;
        els.gallery.appendChild(card);
        fetchAndProcessSvg(item, safeId);
    }
    renderPagination();
}

async function fetchAndProcessSvg(item, safeId) {
    try {
        const path = item.path || `assets/illustrations/${item.file}`;
        const res = await fetch(path);
        const raw = await res.text();
        const processed = processSvgContent(raw);
        const container = document.getElementById(`preview-${safeId}`);
        if (container) {
            container.innerHTML = processed;
            const svg = container.querySelector('svg');
            if (svg) svg.style.color = currentColor;
        }
    } catch (err) {
        console.error('Loader error:', item.file);
    }
}

// --- 搜索与过滤 ---
function initSearch() {
    miniSearch = new MiniSearch({
        fields: ['title', 'name', 'categories'],
        storeFields: ['id', 'file'],
        searchOptions: { prefix: true, fuzzy: 0.2 }
    });
    const docs = allMetadata.map(m => ({
        id: m.id || m.file,
        title: m.title || m.name,
        categories: (m.categories || [m.category]).join(' ')
    }));
    miniSearch.addAll(docs);
}

function handleSearch() {
    const val = els.searchInput.value.trim();
    if (val) els.clearSearch.classList.remove('hidden');
    else els.clearSearch.classList.add('hidden');

    if (!val) {
        filteredMetadata = activeCategory === 'all'
            ? [...allMetadata]
            : allMetadata.filter(m => (m.categories || [m.category]).includes(activeCategory));
    } else {
        const results = miniSearch.search(val);
        const matchedIds = new Set(results.map(r => r.id));
        filteredMetadata = allMetadata.filter(m => {
            const isMatch = matchedIds.has(m.id) || matchedIds.has(m.file);
            const isCat = activeCategory === 'all' || (m.categories || [m.category]).includes(activeCategory);
            return isMatch && isCat;
        });
    }
    currentPage = 1;
    renderGallery();
    updateStats();
}

function filterCategory(catId) {
    activeCategory = catId;
    renderTaxonomy();
    handleSearch();
}

// --- 分页 ---
function renderPagination() {
    const total = filteredMetadata.length;
    const perPage = rowsPerPage === 'all' ? total : rowsPerPage * 6;
    const totalPages = Math.ceil(total / perPage);

    if (totalPages <= 1) {
        els.paginationNav.innerHTML = '';
        return;
    }

    let html = `<button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>`;
    html += `<span class="page-info">第 ${currentPage} / ${totalPages} 页</span>`;
    html += `<button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>`;
    els.paginationNav.innerHTML = html;
}

function changePage(p) {
    currentPage = p;
    renderGallery();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- 下载与细节 ---
let pendingDownload = null;
let currentProcessedSvg = ''; // 存储当前弹窗中处理后的 SVG 代码

async function openDownload(id) {
    pendingDownload = allMetadata.find(m => m.id === id || m.file === id);
    if (!pendingDownload) return;

    els.modalTitle.textContent = pendingDownload.title || pendingDownload.name;

    // 渲染标签
    const cats = (pendingDownload.categories || [pendingDownload.category]);
    let tagsHtml = cats.map(c => {
        const t = taxonomy.find(tax => tax.id === c);
        return `<span class="tag-chip category-chip">${t ? t.zh : c}</span>`;
    }).join('');

    if (pendingDownload.tags && pendingDownload.tags.ai) {
        tagsHtml += pendingDownload.tags.ai.slice(0, 5).map(t => `<span class="tag-chip">${t.zh}</span>`).join('');
    }
    els.modalTags.innerHTML = tagsHtml;

    // 预览与数据记录
    const path = pendingDownload.path || `assets/illustrations/${pendingDownload.file}`;
    const res = await fetch(path);
    currentRawSvg = await res.text(); // 记录原始数据
    currentProcessedSvg = processSvgContent(currentRawSvg); // 统一使用标准预览（带背景+默认变色）

    updateModalPreview();
    els.downloadModal.classList.remove('hidden');
    els.downloadModal.classList.add('active');
}

function updateModalPreview() {
    els.modalPreview.innerHTML = currentProcessedSvg;
    const svg = els.modalPreview.querySelector('svg');
    if (svg) svg.style.color = currentColor;
}

// 手动深度清理逻辑
function handleDeepClean() {
    if (!currentRawSvg) return;
    const targetColor = getEl('bgColorPicker').value;
    // 使用原始数据运行深度清理
    currentProcessedSvg = deepCleanSvg(currentRawSvg, targetColor);
    // 再次运行标准处理以确保配色映射和结构规范
    currentProcessedSvg = processSvgContent(currentProcessedSvg);

    updateModalPreview();
    showToast('深度处理完成', 'success');
}

// 手动设为主色逻辑
function handleSetTheme() {
    if (!currentRawSvg) return;
    const targetColor = getEl('themeColorPicker').value;
    // 将指定颜色映射为配色
    currentProcessedSvg = applyTheming(currentProcessedSvg || currentRawSvg, targetColor);
    // 再次运行标准处理保证结构
    currentProcessedSvg = processSvgContent(currentProcessedSvg);

    updateModalPreview();
    showToast('配色映射成功', 'success');
}

function closeDownload() {
    els.downloadModal.classList.remove('active');
    setTimeout(() => {
        els.downloadModal.classList.add('hidden');
        currentRawSvg = '';
        currentProcessedSvg = '';
    }, 300);
}

function closeVersion() {
    els.versionModal.classList.remove('active');
}

async function download(format) {
    if (!pendingDownload || !currentProcessedSvg) return;

    // 使用当前弹窗中实时处理好的代码
    const processed = currentProcessedSvg.replace(/currentColor/g, currentColor);

    if (format === 'svg') {
        const blob = new Blob([processed], { type: 'image/svg+xml' });
        saveAs(blob, `${pendingDownload.title || pendingDownload.name}.svg`);
    } else {
        const img = new Image();
        const svgBlob = new Blob([processed], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        img.onload = () => {
            els.canvas.width = 1024;
            els.canvas.height = 1024;
            const ctx = els.canvas.getContext('2d');
            ctx.clearRect(0, 0, 1024, 1024);
            ctx.drawImage(img, 0, 0, 1024, 1024);
            els.canvas.toBlob((blob) => {
                saveAs(blob, `${pendingDownload.title || pendingDownload.name}.png`);
                URL.revokeObjectURL(url);
            });
        };
        img.src = url;
    }
}

function saveAs(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

// --- 用户交互 ---
els.searchInput.oninput = handleSearch;

els.colorPicker.oninput = (e) => {
    currentColor = e.target.value;
    document.querySelectorAll('svg').forEach(svg => {
        svg.style.color = currentColor;
    });
};

els.gridRange.oninput = (e) => {
    document.documentElement.style.setProperty('--grid-cols', e.target.value);
};

els.rowsSelect.onchange = (e) => {
    rowsPerPage = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
    currentPage = 1;
    renderGallery();
};

els.backToTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

window.onscroll = () => {
    if (window.scrollY > 500) els.backToTop.classList.add('active');
    else els.backToTop.classList.remove('active');
};

function showToast(msg, type = 'success') {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    els.toast.classList.add('active', type);

    setTimeout(() => {
        els.toast.classList.remove('active');
        // 等待动画结束后隐藏（如果有的话），或者直接隐藏
        setTimeout(() => {
            els.toast.classList.add('hidden');
            els.toast.classList.remove(type);
        }, 300);
    }, 3000);
}

// --- 初始化 ---
window.onload = loadData;
