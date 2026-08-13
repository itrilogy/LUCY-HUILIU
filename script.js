/**
 * VectorStream script.js v1.8.0
 * 管理入口预留、标签清洗、编辑按钮语义与出品双标。
 */
const VERSION = '1.8.0';
const DEFAULT_THEME_TARGETS = ['#000', '#000000', 'black', '#6c63ff', '#3f3d56'];
const COLOR_TOLERANCE = 18;
const VIRTUAL_THRESHOLD = 80;
const PREVIEW_CACHE_LIMIT = 240;
const SHAPE_SELECTOR = 'path, rect, circle, ellipse, polygon, polyline, line';

let allMetadata = [];
let taxonomy = [];
let filteredMetadata = [];
let activeCategory = 'all';
let currentColor = '#0D5E42';
let miniSearch = null;
let currentPage = 1;
let rowsPerPage = 5;
let searchTimer = null;
let galleryObserver = null;
let pickMode = 'sample';
let sampleTarget = 'bg';
let libraryWritable = false;
let isAdmin = false;
let adminConfigured = false;
let adminServer = false;
let pageItems = [];
let focusedIndex = 0;
let virtualEnabled = false;
let catalogHeavyBytes = 80000;
let scrollRaf = 0;
const previewCache = new Map();

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
    themeColorDisplay: getEl('themeColorDisplay'),
    editChips: getEl('editChips'),
    previewHint: getEl('previewHint'),
    exportStatus: getEl('exportStatus'),
    saveToLibrary: getEl('saveToLibrary'),
    themeToggle: getEl('themeToggle')
};

const editor = {
    raw: '',
    processed: '',
    actions: []
};

let pendingDownload = null;

const NAMED_COLORS = {
    black: [0, 0, 0],
    white: [255, 255, 255],
    red: [255, 0, 0],
    silver: [192, 192, 192],
    gray: [128, 128, 128],
    grey: [128, 128, 128],
    navy: [0, 0, 128]
};

function clampByte(n) {
    return Math.max(0, Math.min(255, n | 0));
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('');
}

function parseColor(value) {
    if (!value) return null;
    const raw = String(value).trim().toLowerCase();
    if (!raw || raw === 'none' || raw === 'transparent' || raw === 'currentcolor' || raw.startsWith('url(')) {
        return null;
    }
    if (NAMED_COLORS[raw]) return NAMED_COLORS[raw];
    if (raw.startsWith('#')) {
        let hex = raw.slice(1);
        if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
        if (hex.length === 8) hex = hex.slice(0, 6);
        if (hex.length !== 6 || /[^0-9a-f]/.test(hex)) return null;
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
    const rgb = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (rgb) return [clampByte(Number(rgb[1])), clampByte(Number(rgb[2])), clampByte(Number(rgb[3]))];
    return null;
}

function colorDistance(a, b) {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

function colorsMatch(a, b, tolerance = COLOR_TOLERANCE) {
    const pa = parseColor(a);
    const pb = parseColor(b);
    if (!pa || !pb) return false;
    return colorDistance(pa, pb) <= tolerance;
}

function toHexDisplay(value) {
    const rgb = parseColor(value);
    return rgb ? rgbToHex(...rgb).toUpperCase() : String(value || '').toUpperCase();
}

function parseStyleMap(styleText) {
    const map = {};
    String(styleText || '').split(';').forEach((part) => {
        const idx = part.indexOf(':');
        if (idx === -1) return;
        map[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim();
    });
    return map;
}

function serializeStyleMap(map) {
    return Object.entries(map)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${k}:${v}`)
        .join(';');
}

function parseSvgDom(svgText) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.tagName.toLowerCase() === 'parsererror' || svg.querySelector('parsererror')) {
        return null;
    }
    return svg;
}

function serializeSvg(svg) {
    if (!svg.getAttribute('xmlns')) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    return new XMLSerializer().serializeToString(svg);
}

function normalizeSvgDom(svgText) {
    let text = String(svgText || '').trim();
    if (!text) return null;

    if (!/viewBox\s*=/i.test(text)) {
        const w = text.match(/width\s*=\s*["']([\d.]+)["']/i);
        const h = text.match(/height\s*=\s*["']([\d.]+)["']/i);
        const vb = w && h ? `viewBox="0 0 ${w[1]} ${h[1]}"` : 'viewBox="0 0 24 24"';
        text = text.replace(/<svg\b/i, `<svg ${vb}`);
    }

    const svg = parseSvgDom(text);
    if (!svg) return null;

    svg.removeAttribute('width');
    svg.removeAttribute('height');
    if (!svg.hasAttribute('preserveAspectRatio')) {
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
    return svg;
}

function applyDefaultThemeMap(svg) {
    replacePaint(svg, DEFAULT_THEME_TARGETS, 'currentColor', 4);
}

function eachPaintable(svg, fn) {
    const nodes = [svg, ...svg.querySelectorAll('*')];
    nodes.forEach((node) => {
        if (!node.getAttribute) return;
        fn(node);
    });
}

function replacePaint(svg, targets, replacement, tolerance = COLOR_TOLERANCE) {
    const list = Array.isArray(targets) ? targets : [targets];
    eachPaintable(svg, (node) => {
        ['fill', 'stroke'].forEach((attr) => {
            if (!node.hasAttribute(attr)) return;
            const val = node.getAttribute(attr);
            if (list.some((t) => colorsMatch(val, t, tolerance))) {
                node.setAttribute(attr, replacement);
            }
        });
        if (!node.hasAttribute('style')) return;
        const map = parseStyleMap(node.getAttribute('style'));
        let changed = false;
        ['fill', 'stroke'].forEach((attr) => {
            if (map[attr] && list.some((t) => colorsMatch(map[attr], t, tolerance))) {
                map[attr] = replacement;
                changed = true;
            }
        });
        if (changed) node.setAttribute('style', serializeStyleMap(map));
    });
}

function parseViewBox(svg) {
    const raw = svg.getAttribute('viewBox');
    if (!raw) return null;
    const parts = raw.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

function numericAttr(el, name, fallback) {
    const val = el.getAttribute(name);
    if (val == null) return fallback;
    if (String(val).endsWith('%')) return fallback;
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : fallback;
}

function isLikelyCanvasFill(el, vb) {
    if (!vb) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'rect') {
        const x = numericAttr(el, 'x', 0);
        const y = numericAttr(el, 'y', 0);
        const width = el.getAttribute('width');
        const height = el.getAttribute('height');
        const isFullPercent = width === '100%' && height === '100%';
        const w = numericAttr(el, 'width', 0);
        const h = numericAttr(el, 'height', 0);
        return isFullPercent || (x <= vb.x + 1 && y <= vb.y + 1 && w >= vb.w - 2 && h >= vb.h - 2);
    }
    if (tag === 'path') {
        const d = (el.getAttribute('d') || '').replace(/\s+/g, ' ').trim();
        if (!d) return false;
        const compact = d.replace(/,/g, ' ');
        const fullRect = /M\s*(?:0(?:\.0+)?|1024(?:\.0+)?)\s+(?:0(?:\.0+)?|1024(?:\.0+)?)/i.test(compact)
            && (compact.match(/L\s*/gi) || []).length >= 3;
        const coversOrigin = /M\s*0(?:\.0+)?\s+0(?:\.0+)?/i.test(compact)
            && compact.includes(String(Math.round(vb.w)))
            && compact.includes(String(Math.round(vb.h)))
            && (compact.match(/L\s*/gi) || []).length >= 3
            && compact.length < 180;
        return fullRect || coversOrigin;
    }
    return false;
}

function stripCanvasBackground(svg) {
    const vb = parseViewBox(svg);
    [...svg.querySelectorAll('rect, path')].forEach((el) => {
        if (isLikelyCanvasFill(el, vb)) el.remove();
    });
}

function stampShapeIds(svg) {
    let index = 0;
    svg.querySelectorAll(SHAPE_SELECTOR).forEach((el) => {
        index += 1;
        el.setAttribute('data-vs-id', String(index));
    });
}

function findShapeById(svg, id) {
    if (id == null) return null;
    return svg.querySelector(`[data-vs-id="${id}"]`);
}

function shapeHasPaint(el, attr) {
    const direct = el.getAttribute && el.getAttribute(attr);
    if (direct && direct !== 'none' && direct !== 'transparent') return true;
    if (el.hasAttribute && el.hasAttribute('style')) {
        const map = parseStyleMap(el.getAttribute('style'));
        if (map[attr] && map[attr] !== 'none' && map[attr] !== 'transparent') return true;
    }
    return false;
}

function writeShapePaint(el, attr, value) {
    el.setAttribute(attr, value);
    if (!el.hasAttribute('style')) return;
    const map = parseStyleMap(el.getAttribute('style'));
    if (map[attr] != null) {
        map[attr] = value;
        el.setAttribute('style', serializeStyleMap(map));
    }
}

function eraseShape(el) {
    writeShapePaint(el, 'fill', 'none');
    writeShapePaint(el, 'stroke', 'none');
    el.setAttribute('fill-opacity', '0');
    el.setAttribute('stroke-opacity', '0');
    el.setAttribute('pointer-events', 'all');
}

function fillShape(el, color) {
    writeShapePaint(el, 'fill', color);
    el.removeAttribute('fill-opacity');
    if (el.hasAttribute('style')) {
        const map = parseStyleMap(el.getAttribute('style'));
        delete map['fill-opacity'];
        el.setAttribute('style', serializeStyleMap(map));
    }
}

function rebuildProcessedSvg() {
    const svg = normalizeSvgDom(editor.raw);
    if (!svg) {
        editor.processed = '';
        return;
    }
    stampShapeIds(svg);
    applyDefaultThemeMap(svg);
    editor.actions.forEach((action) => {
        if (action.type === 'remove') replacePaint(svg, action.color, 'none', action.tolerance ?? COLOR_TOLERANCE);
        if (action.type === 'theme') replacePaint(svg, action.color, 'currentColor', action.tolerance ?? COLOR_TOLERANCE);
        if (action.type === 'stripBg') stripCanvasBackground(svg);
        if (action.type === 'localErase') {
            const el = findShapeById(svg, action.id);
            if (el) eraseShape(el);
        }
        if (action.type === 'localFill') {
            const el = findShapeById(svg, action.id);
            if (el) fillShape(el, action.color);
        }
    });
    editor.processed = serializeSvg(svg);
}

function injectSvg(container, svgText, color) {
    container.replaceChildren();
    const svg = parseSvgDom(svgText);
    if (!svg) {
        container.textContent = '预览失败';
        return null;
    }
    const imported = document.importNode(svg, true);
    imported.style.color = color || currentColor;
    container.appendChild(imported);
    return imported;
}

function processSvgContent(svgText) {
    const svg = normalizeSvgDom(svgText);
    if (!svg) return svgText || '';
    applyDefaultThemeMap(svg);
    return serializeSvg(svg);
}

function applyTheming(svgText, targetColor) {
    const svg = parseSvgDom(svgText);
    if (!svg) return svgText;
    replacePaint(svg, targetColor, 'currentColor');
    return serializeSvg(svg);
}

function deepCleanSvg(svgText, targetColor = null) {
    const svg = parseSvgDom(svgText);
    if (!svg) return svgText || '';
    if (targetColor) replacePaint(svg, targetColor, 'none');
    stripCanvasBackground(svg);
    return serializeSvg(svg);
}

function inflateCatalogItem(row) {
    if (Array.isArray(row)) {
        const [file, title, categories, tags, description, bytes] = row;
        return {
            file,
            title,
            categories: categories || [],
            tags: { ai: (tags || []).map((zh) => ({ zh })) },
            description: description || '',
            bytes: bytes || 0
        };
    }
    return {
        file: row.file || row.f,
        title: row.title || row.t || row.name,
        categories: row.categories || row.c || (row.category ? [row.category] : []),
        tags: row.tags || { ai: (row.g || []).map((zh) => ({ zh })) },
        description: row.description || row.d || '',
        bytes: row.bytes || row.s || 0
    };
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed ${url}`);
    return res.json();
}

function cachePreview(key, value) {
    if (previewCache.has(key)) previewCache.delete(key);
    previewCache.set(key, value);
    if (previewCache.size > PREVIEW_CACHE_LIMIT) {
        previewCache.delete(previewCache.keys().next().value);
    }
}

async function loadData() {
    try {
        initTheme();
        const [catalog, tax, health] = await Promise.all([
            fetchJson('assets/catalog.json').catch(() => null),
            fetchJson('assets/taxonomy.json'),
            fetch('/api/health').then((r) => (r.ok ? r.json() : null)).catch(() => null)
        ]);

        taxonomy = tax;
        if (!taxonomy.find((t) => t.id === 'all')) {
            taxonomy.unshift({ id: 'all', zh: '全部素材', en: 'All Assets' });
        }

        if (catalog && Array.isArray(catalog.items)) {
            catalogHeavyBytes = catalog.heavyBytes || 80000;
            allMetadata = catalog.items.map(inflateCatalogItem);
        } else {
            const meta = await fetchJson('assets/metadata.json');
            allMetadata = meta.map(inflateCatalogItem);
        }

        libraryWritable = !!(health && health.writable);
        adminServer = !!health;
        adminConfigured = !!(health && health.adminConfigured);
        isAdmin = !!(health && health.admin);
        syncAdminUi();

        filteredMetadata = [...allMetadata];
        renderTaxonomy();
        initSearch();
        renderGallery();
        updateStats();
        bindEvents();
    } catch (err) {
        console.error(err);
        showToast('数据加载失败', 'error');
    }
}

function bindEvents() {
    getEl('closeDownload').onclick = closeDownload;
    getEl('closeVersion').onclick = closeVersion;
    els.downloadModal.onclick = (e) => { if (e.target === els.downloadModal) closeDownload(); };
    els.versionModal.onclick = (e) => { if (e.target === els.versionModal) closeVersion(); };

    els.clearSearch.onclick = () => {
        els.searchInput.value = '';
        els.clearSearch.classList.add('hidden');
        handleSearch();
        els.searchInput.focus();
    };

    getEl('versionTrigger').onclick = () => {
        els.versionModal.classList.remove('hidden');
        els.versionModal.classList.add('active');
    };

    getEl('downloadSvg').onclick = () => download('svg');
    getEl('downloadPng').onclick = () => download('png');
    if (els.saveToLibrary) els.saveToLibrary.onclick = handleSaveToLibrary;
    if (els.themeToggle) els.themeToggle.onclick = toggleTheme;
    bindAdmin();
    const searchForm = getEl('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => e.preventDefault());
    }

    els.modalPreview.onclick = handlePreviewPick;

    els.bgColorPicker.oninput = (e) => {
        els.bgColorDisplay.textContent = e.target.value.toUpperCase();
        setSampleTarget('bg', true);
    };
    els.themeColorPicker.oninput = (e) => {
        els.themeColorDisplay.textContent = e.target.value.toUpperCase();
        setSampleTarget('theme', true);
    };
    els.bgColorPicker.onfocus = () => setSampleTarget('bg', true);
    els.themeColorPicker.onfocus = () => setSampleTarget('theme', true);

    getEl('applyDeepClean').onclick = handleDeepClean;
    getEl('setThemeColor').onclick = handleSetTheme;
    getEl('stripCanvasBg').onclick = handleStripCanvas;
    getEl('undoEdit').onclick = handleUndoEdit;
    getEl('resetEdit').onclick = handleResetEdit;

    getEl('pickModeErase').onclick = () => toggleLocalMode('erase');
    getEl('pickModeFill').onclick = () => toggleLocalMode('fill');
    getEl('bgSampleRow').onclick = (e) => {
        if (e.target.closest('button')) return;
        setSampleTarget('bg');
    };
    getEl('themeSampleRow').onclick = (e) => {
        if (e.target.closest('button')) return;
        setSampleTarget('theme');
    };
    els.modalPreview.onmousemove = handlePreviewHover;
    els.modalPreview.onmouseleave = clearShapeHover;

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!els.downloadModal.classList.contains('hidden')) {
                if (pickMode === 'erase' || pickMode === 'fill') {
                    setEditMode('sample');
                    return;
                }
                closeDownload();
            } else if (!els.versionModal.classList.contains('hidden')) closeVersion();
        }
        if (e.key === '/' && document.activeElement !== els.searchInput && !e.metaKey && !e.ctrlKey) {
            if (els.downloadModal.classList.contains('hidden') && els.versionModal.classList.contains('hidden')) {
                e.preventDefault();
                els.searchInput.focus();
            }
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !els.downloadModal.classList.contains('hidden')) {
            e.preventDefault();
            handleUndoEdit();
        }
        handleGridKeys(e);
    });

    window.addEventListener('resize', () => {
        if (virtualEnabled) updateVirtualWindow(true);
    });
}

function setSampleTarget(target, keepLocal = false) {
    sampleTarget = target === 'theme' ? 'theme' : 'bg';
    const bgRow = getEl('bgSampleRow');
    const themeRow = getEl('themeSampleRow');
    if (bgRow) bgRow.classList.toggle('is-sample', sampleTarget === 'bg');
    if (themeRow) themeRow.classList.toggle('is-sample', sampleTarget === 'theme');
    if (!keepLocal && (pickMode === 'erase' || pickMode === 'fill')) setEditMode('sample');
    else refreshPreviewHint();
}

function setEditMode(mode) {
    pickMode = mode === 'erase' || mode === 'fill' ? mode : 'sample';
    const eraseBtn = getEl('pickModeErase');
    const fillBtn = getEl('pickModeFill');
    if (eraseBtn) eraseBtn.setAttribute('aria-pressed', pickMode === 'erase' ? 'true' : 'false');
    if (fillBtn) fillBtn.setAttribute('aria-pressed', pickMode === 'fill' ? 'true' : 'false');
    els.modalPreview.classList.toggle('is-erase', pickMode === 'erase');
    els.modalPreview.classList.toggle('is-fill', pickMode === 'fill');
    clearShapeHover();
    refreshPreviewHint();
}

function toggleLocalMode(mode) {
    setEditMode(pickMode === mode ? 'sample' : mode);
}

function refreshPreviewHint() {
    const bytes = pendingDownload && pendingDownload.bytes ? pendingDownload.bytes : 0;
    const heavy = bytes > catalogHeavyBytes ? `大型素材 ${(bytes / 1024).toFixed(0)} KB · ` : '';
    const hint = getEl('editHint');
    let text = '';
    if (pickMode === 'erase') {
        text = `${heavy}擦除选块已开：点击一块闭合图形，只去掉这一块`;
    } else if (pickMode === 'fill') {
        text = `${heavy}填充选块已开：点击一块图形，填入 ${els.themeColorPicker.value.toUpperCase()}`;
    } else {
        text = sampleTarget === 'theme'
            ? `${heavy}点击预览取样到主配色，也可打开色板取色`
            : `${heavy}点击预览取样到背景色，也可打开色板取色`;
    }
    if (els.previewHint) els.previewHint.textContent = text;
    if (hint) hint.textContent = text;
}

function resolveClickedShape(event) {
    const svg = els.modalPreview.querySelector('svg');
    if (!svg) return null;
    const stack = (typeof document.elementsFromPoint === 'function')
        ? document.elementsFromPoint(event.clientX, event.clientY)
        : [event.target];
    const hit = stack.find((node) =>
        node && node.matches && node.matches(SHAPE_SELECTOR) && svg.contains(node)
    );
    if (hit) return hit;
    const fallback = event.target && event.target.closest ? event.target.closest(SHAPE_SELECTOR) : null;
    return fallback && svg.contains(fallback) ? fallback : null;
}

function clearShapeHover() {
    const svg = els.modalPreview && els.modalPreview.querySelector('svg');
    if (!svg) return;
    svg.querySelectorAll('[data-vs-hover]').forEach((node) => node.removeAttribute('data-vs-hover'));
}

function handlePreviewHover(event) {
    if (pickMode !== 'erase' && pickMode !== 'fill') return;
    const shape = resolveClickedShape(event);
    const svg = els.modalPreview.querySelector('svg');
    if (!svg) return;
    svg.querySelectorAll('[data-vs-hover]').forEach((node) => {
        if (node !== shape) node.removeAttribute('data-vs-hover');
    });
    if (shape) shape.setAttribute('data-vs-hover', '1');
}

function extractNodeColor(node) {
    if (!node || node === els.modalPreview) return null;
    const attr = node.getAttribute && (node.getAttribute('fill') || node.getAttribute('stroke'));
    if (attr && attr !== 'none' && attr !== 'currentColor') return attr;
    const styleFill = node.style && (node.style.fill || node.style.stroke);
    if (styleFill && styleFill !== 'none' && styleFill !== 'currentColor') return styleFill;
    const computed = getComputedStyle(node);
    const fill = computed.fill;
    if (fill && fill !== 'none' && fill !== 'currentColor') return fill;
    const stroke = computed.stroke;
    if (stroke && stroke !== 'none' && stroke !== 'currentColor') return stroke;
    return null;
}

function handlePreviewPick(e) {
    const target = resolveClickedShape(e);
    if (!target) {
        if (pickMode === 'erase' || pickMode === 'fill') {
            showToast('请点中一块闭合图形', 'warning');
        }
        return;
    }

    if (pickMode === 'erase' || pickMode === 'fill') {
        applyLocalShapeEdit(target);
        return;
    }

    let color = extractNodeColor(target);
    if (!color) {
        showToast('该图形没有可拾取的实色', 'warning');
        return;
    }
    if (color === 'currentColor') {
        color = currentColor;
    }
    const hex = toHexDisplay(color);
    const rgb = parseColor(color);
    const pickerValue = rgb ? rgbToHex(...rgb) : currentColor;

    if (sampleTarget === 'theme') {
        els.themeColorPicker.value = pickerValue;
        els.themeColorDisplay.textContent = hex;
    } else {
        els.bgColorPicker.value = pickerValue;
        els.bgColorDisplay.textContent = hex;
    }
    highlightMatching(hex);
    showToast(`已取样 ${hex} → ${sampleTarget === 'theme' ? '主配色' : '背景色'}`, 'success');
}

function applyLocalShapeEdit(target) {
    const id = target.getAttribute('data-vs-id');
    if (!id) {
        showToast('无法识别该图形，请重开预览后再试', 'warning');
        return;
    }
    if (pickMode === 'erase') {
        commitEdit({ type: 'localErase', id }, '已消除该图形');
        return;
    }
    const color = els.themeColorPicker.value;
    commitEdit({ type: 'localFill', id, color }, `已填充 ${color.toUpperCase()}`);
}

function highlightMatching(hex) {
    const svg = els.modalPreview.querySelector('svg');
    if (!svg) return;
    eachPaintable(svg, (node) => {
        if (node.removeAttribute) node.removeAttribute('data-vs-hit');
        const fill = node.getAttribute && node.getAttribute('fill');
        const stroke = node.getAttribute && node.getAttribute('stroke');
        if ((fill && colorsMatch(fill, hex)) || (stroke && colorsMatch(stroke, hex))) {
            node.setAttribute('data-vs-hit', '1');
        }
    });
}

function adminStatusText() {
    if (!adminServer) return '需用 python3 server.py 启动后才能登录。';
    if (!adminConfigured) return '尚未配置：复制 .env.example 为 .env，填写 VS_ADMIN_PIN。';
    return '口令写在 .env 的 VS_ADMIN_PIN，由服务器校验，不会下发到页面。';
}

function syncAdminUi() {
    const login = getEl('adminLogin');
    const consoleEl = getEl('adminConsole');
    const copy = getEl('adminCopy');
    if (copy) copy.textContent = adminStatusText();
    if (login) login.classList.toggle('hidden', isAdmin);
    if (consoleEl) consoleEl.classList.toggle('hidden', !isAdmin);
    if (els.saveToLibrary) {
        els.saveToLibrary.classList.toggle('hidden', !(isAdmin && libraryWritable));
    }
    document.querySelectorAll('#adminEntry, #adminEntryFooter').forEach((btn) => {
        btn.textContent = isAdmin ? '管理员' : '管理登录';
        btn.classList.toggle('is-on', isAdmin);
        btn.title = isAdmin ? '打开管理控制台' : '管理员登录';
    });
}

function openAdminLogin() {
    const body = getEl('adminBody');
    if (body) body.classList.remove('hidden');
    els.versionModal.classList.remove('hidden');
    els.versionModal.classList.add('active');
    syncAdminUi();
    const pin = getEl('adminPin');
    if (pin && !isAdmin) setTimeout(() => pin.focus(), 80);
}

function bindAdmin() {
    const toggle = getEl('adminToggle');
    const body = getEl('adminBody');
    const pin = getEl('adminPin');
    const loginBtn = getEl('adminLoginBtn');
    const logoutBtn = getEl('adminLogoutBtn');
    getEl('adminEntry').onclick = openAdminLogin;
    const footerEntry = getEl('adminEntryFooter');
    if (footerEntry) footerEntry.onclick = openAdminLogin;
    if (toggle && body) {
        toggle.onclick = () => body.classList.toggle('hidden');
    }
    if (loginBtn) loginBtn.onclick = tryAdminLogin;
    if (pin) {
        pin.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') tryAdminLogin();
        });
    }
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            try {
                await fetch('/api/admin/logout', { method: 'POST' });
            } catch { /* ignore */ }
            isAdmin = false;
            syncAdminUi();
            showToast('已退出管理', 'success');
        };
    }
    syncAdminUi();
}

async function tryAdminLogin() {
    if (!adminServer) {
        showToast('请先用 python3 server.py 启动', 'warning');
        return;
    }
    if (!adminConfigured) {
        showToast('请先在 .env 设置 VS_ADMIN_PIN', 'warning');
        return;
    }
    const pin = getEl('adminPin');
    const value = pin ? pin.value.trim() : '';
    if (!value) {
        showToast('请输入管理口令', 'warning');
        return;
    }
    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: value })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
            showToast(res.status === 401 ? '口令不正确' : '登录失败', 'error');
            return;
        }
        if (pin) pin.value = '';
        isAdmin = true;
        syncAdminUi();
        showToast('已进入管理模式', 'success');
    } catch (err) {
        console.error(err);
        showToast('无法连接管理接口', 'error');
    }
}

async function handleSaveToLibrary() {
    const processed = snapshotPreviewSvg();
    if (!isAdmin || !libraryWritable || !pendingDownload || !processed) {
        showToast('需要管理员登录，且使用 python3 server.py 启动', 'warning');
        return;
    }
    try {
        const res = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file: pendingDownload.file,
                svg: processed
            })
        });
        if (!res.ok) throw new Error(await res.text());
        previewCache.delete(pendingDownload.file);
        showToast(`已写回 ${pendingDownload.file}`, 'success');
        const safe = (window.CSS && CSS.escape) ? CSS.escape(pendingDownload.file) : pendingDownload.file.replace(/"/g, '\\"');
        const card = els.gallery.querySelector(`[data-id="${safe}"] .svg-container`);
        if (card) loadCardSvg(card);
    } catch (err) {
        console.error(err);
        showToast('写回素材库失败', 'error');
    }
}

function renderTaxonomy() {
    els.categoryList.innerHTML = taxonomy.map((cat) => `
        <button class="cat-item ${cat.id === activeCategory ? 'active' : ''}"
                type="button" data-cat="${cat.id}">
            ${cat.zh || cat.name || cat.id}
        </button>
    `).join('');
    els.categoryList.onclick = (e) => {
        const btn = e.target.closest('[data-cat]');
        if (btn) filterCategory(btn.dataset.cat);
    };
}

function updateStats() {
    els.resultCount.textContent = filteredMetadata.length.toLocaleString('en-US');
}

function disconnectObserver() {
    if (galleryObserver) {
        galleryObserver.disconnect();
        galleryObserver = null;
    }
}

function getGridCols() {
    if (window.matchMedia('(max-width: 768px)').matches) return 2;
    const v = getComputedStyle(document.documentElement).getPropertyValue('--grid-cols').trim();
    return Math.max(2, parseInt(v, 10) || 5);
}

function getPageSlice() {
    const isAll = rowsPerPage === 'all';
    const num = isAll ? filteredMetadata.length : rowsPerPage * 6;
    const start = isAll ? 0 : (currentPage - 1) * num;
    const end = isAll ? filteredMetadata.length : start + num;
    return filteredMetadata.slice(start, end);
}

function measureRowHeight(cols) {
    const styles = getComputedStyle(els.gallery);
    const gap = parseFloat(styles.columnGap || styles.gap) || 24;
    const width = els.gallery.clientWidth || document.documentElement.clientWidth - 64;
    const cell = Math.max(80, (width - gap * (cols - 1)) / cols);
    return cell + gap;
}

function createCard(item, index) {
    const card = document.createElement('article');
    card.className = 'svg-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const fileId = item.file;
    card.dataset.id = fileId;
    card.dataset.index = String(index);
    card.setAttribute('aria-label', item.title || fileId);
    const src = item.path || `assets/illustrations/${item.file}`;
    const container = document.createElement('div');
    container.className = 'svg-container';
    container.dataset.src = encodeURI(src);
    container.dataset.file = fileId;
    container.dataset.bytes = String(item.bytes || 0);
    container.innerHTML = '<div class="loader"></div>';
    const title = document.createElement('div');
    title.className = 'svg-title';
    title.textContent = item.title || item.file;
    card.append(container, title);
    card.addEventListener('click', () => openDownload(fileId));
    card.addEventListener('focus', () => { focusedIndex = index; });
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDownload(fileId);
        }
    });
    return card;
}

function observeVisibleCards() {
    disconnectObserver();
    galleryObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            galleryObserver.unobserve(entry.target);
            loadCardSvg(entry.target);
        });
    }, { rootMargin: '240px' });
    els.gallery.querySelectorAll('.svg-container').forEach((el) => galleryObserver.observe(el));
}

function mountCards(start, end) {
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i += 1) {
        frag.appendChild(createCard(pageItems[i], i));
    }
    els.gallery.replaceChildren(frag);
    observeVisibleCards();
}

function updateVirtualWindow(force) {
    const cols = getGridCols();
    const rowH = measureRowHeight(cols);
    const rows = Math.max(1, Math.ceil(pageItems.length / cols));
    const galleryTop = els.gallery.getBoundingClientRect().top + window.scrollY;
    const scrollRel = Math.max(0, window.scrollY - galleryTop + 16);
    const overscan = 3;
    const startRow = Math.max(0, Math.floor(scrollRel / rowH) - overscan);
    const visibleRows = Math.ceil(window.innerHeight / rowH) + 1;
    const endRow = Math.min(rows, startRow + visibleRows + overscan);
    const start = startRow * cols;
    const end = Math.min(pageItems.length, endRow * cols);
    const padTop = startRow * rowH;
    const padBottom = Math.max(0, (rows - endRow) * rowH);
    els.gallery.style.paddingTop = `${padTop}px`;
    els.gallery.style.paddingBottom = `${padBottom}px`;
    const mark = `${start}-${end}`;
    if (!force && els.gallery.dataset.vr === mark) return;
    els.gallery.dataset.vr = mark;
    mountCards(start, end);
}

function renderGallery() {
    disconnectObserver();
    pageItems = getPageSlice();
    focusedIndex = 0;
    renderPagination();
    virtualEnabled = pageItems.length > VIRTUAL_THRESHOLD;
    els.gallery.dataset.vr = '';
    if (!virtualEnabled) {
        els.gallery.style.paddingTop = '';
        els.gallery.style.paddingBottom = '';
        mountCards(0, pageItems.length);
        return;
    }
    updateVirtualWindow(true);
}

function mountHeavyPreview(container, src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    container.replaceChildren(img);
}

async function loadCardSvg(container) {
    const src = container.dataset.src;
    const file = container.dataset.file || src;
    if (!src) return;
    if (previewCache.has(file)) {
        const cached = previewCache.get(file);
        if (cached === 'img') mountHeavyPreview(container, src);
        else injectSvg(container, cached, currentColor);
        return;
    }
    if (Number(container.dataset.bytes) > catalogHeavyBytes) {
        cachePreview(file, 'img');
        mountHeavyPreview(container, src);
        return;
    }
    try {
        const res = await fetch(src);
        const raw = await res.text();
        const processed = processSvgContent(raw);
        cachePreview(file, processed);
        injectSvg(container, processed, currentColor);
    } catch (err) {
        container.textContent = '加载失败';
    }
}

function collectSearchText(item) {
    const ai = (item.tags && item.tags.ai) || [];
    const standard = (item.tags && item.tags.standard) || [];
    const tagText = [...ai, ...standard].map((t) => [t.zh, t.en].filter(Boolean).join(' ')).join(' ');
    return {
        id: item.id || item.file,
        title: item.title || item.name || '',
        name: item.name || item.file || '',
        description: item.description || '',
        tags: tagText,
        categories: (item.categories || [item.category]).filter(Boolean).join(' ')
    };
}

function initSearch() {
    miniSearch = new MiniSearch({
        fields: ['title', 'name', 'description', 'tags', 'categories'],
        storeFields: ['id'],
        searchOptions: { prefix: true, fuzzy: 0.2, combineWith: 'AND' }
    });
    miniSearch.addAll(allMetadata.map(collectSearchText));
}

function implicitCategoryIds(query) {
    const q = query.toLowerCase();
    return taxonomy
        .filter((t) => t.id !== 'all')
        .filter((t) => {
            if ((t.zh || '').includes(query) || (t.en || '').toLowerCase().includes(q)) return true;
            return (t.keywords || []).some((k) =>
                (k.zh && k.zh.includes(query)) || (k.en && k.en.toLowerCase().includes(q))
            );
        })
        .map((t) => t.id);
}

function itemInCategory(item, catId) {
    if (catId === 'all') return true;
    return (item.categories || [item.category]).includes(catId);
}

function handleSearch() {
    const val = els.searchInput.value.trim();
    els.clearSearch.classList.toggle('hidden', !val);

    if (!val) {
        filteredMetadata = allMetadata.filter((m) => itemInCategory(m, activeCategory));
    } else {
        const results = miniSearch.search(val);
        const matchedIds = new Set(results.map((r) => r.id));
        const implicit = implicitCategoryIds(val);
        filteredMetadata = allMetadata.filter((m) => {
            const id = m.id || m.file;
            const textHit = matchedIds.has(id) || matchedIds.has(m.file);
            const catHit = implicit.some((c) => itemInCategory(m, c));
            return (textHit || catHit) && itemInCategory(m, activeCategory);
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

function renderPagination() {
    const total = filteredMetadata.length;
    const perPage = rowsPerPage === 'all' ? Math.max(total, 1) : rowsPerPage * 6;
    const totalPages = Math.max(1, Math.ceil(total / perPage));

    if (totalPages <= 1) {
        els.paginationNav.innerHTML = '';
        return;
    }

    els.paginationNav.innerHTML = `
        <button class="page-btn" type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>
        <span class="page-info">第 ${currentPage} / ${totalPages} 页</span>
        <button class="page-btn" type="button" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>
    `;
    els.paginationNav.onclick = (e) => {
        const btn = e.target.closest('[data-page]');
        if (!btn || btn.disabled) return;
        changePage(Number(btn.dataset.page));
    };
}

function changePage(p) {
    currentPage = p;
    renderGallery();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function openDownload(id) {
    pendingDownload = allMetadata.find((m) => m.id === id || m.file === id);
    if (!pendingDownload) return;

    els.modalTitle.textContent = pendingDownload.title || pendingDownload.name;
    sampleTarget = 'bg';
    setEditMode('sample');

    const cats = pendingDownload.categories || [pendingDownload.category];
    let tagsHtml = cats.map((c) => {
        const t = taxonomy.find((tax) => tax.id === c);
        return `<span class="tag-chip category-chip">${t ? t.zh : c}</span>`;
    }).join('');

    if (pendingDownload.tags && pendingDownload.tags.ai) {
        tagsHtml += pendingDownload.tags.ai.slice(0, 5).map((t) => `<span class="tag-chip">${t.zh || t.en}</span>`).join('');
    }
    els.modalTags.innerHTML = tagsHtml;
    els.modalPreview.innerHTML = '<div class="loader"></div>';
    els.downloadModal.classList.remove('hidden');
    els.downloadModal.classList.add('active');

    const path = pendingDownload.path || `assets/illustrations/${pendingDownload.file}`;
    try {
        const res = await fetch(encodeURI(path));
        editor.raw = await res.text();
        editor.actions = [];
        rebuildProcessedSvg();
        updateModalPreview();
        renderEditChips();
    } catch (err) {
        console.error(err);
        els.modalPreview.textContent = '预览加载失败';
        showToast('素材加载失败', 'error');
    }
}

function updateModalPreview() {
    injectSvg(els.modalPreview, editor.processed, currentColor);
    updateExportStatus();
}

function renderEditChips() {
    if (!els.editChips) return;
    if (!editor.actions.length) {
        els.editChips.innerHTML = '';
        return;
    }
    els.editChips.innerHTML = editor.actions.map((action, i) => {
        if (action.type === 'remove') return `<span class="edit-chip remove">按色清除 ${toHexDisplay(action.color)}</span>`;
        if (action.type === 'theme') return `<span class="edit-chip theme">整图换色 ${toHexDisplay(action.color)}</span>`;
        if (action.type === 'stripBg') return `<span class="edit-chip">去掉画板框</span>`;
        if (action.type === 'localErase') return `<span class="edit-chip remove">擦除选块 #${action.id}</span>`;
        if (action.type === 'localFill') return `<span class="edit-chip theme">填充选块 #${action.id} ${toHexDisplay(action.color)}</span>`;
        return `<span class="edit-chip">#${i + 1}</span>`;
    }).join('');
}

function commitEdit(action, message) {
    editor.actions.push(action);
    rebuildProcessedSvg();
    updateModalPreview();
    renderEditChips();
    updateExportStatus();
    if (message) showToast(message, 'success');
}

function handleDeepClean() {
    if (!editor.raw) return;
    const targetColor = els.bgColorPicker.value;
    commitEdit({ type: 'remove', color: targetColor, tolerance: COLOR_TOLERANCE }, `已清除 ${targetColor.toUpperCase()}`);
}

function handleSetTheme() {
    if (!editor.raw) return;
    const targetColor = els.themeColorPicker.value;
    commitEdit({ type: 'theme', color: targetColor, tolerance: COLOR_TOLERANCE }, `已映射 ${targetColor.toUpperCase()} 为主色`);
}

function handleStripCanvas() {
    if (!editor.raw) return;
    commitEdit({ type: 'stripBg' }, '已去掉画板框');
}

function handleUndoEdit() {
    if (!editor.actions.length) {
        showToast('没有可撤销的步骤', 'warning');
        return;
    }
    editor.actions.pop();
    rebuildProcessedSvg();
    updateModalPreview();
    renderEditChips();
    updateExportStatus();
    showToast('已撤销', 'success');
}

function handleResetEdit() {
    editor.actions = [];
    rebuildProcessedSvg();
    updateModalPreview();
    renderEditChips();
    updateExportStatus();
    showToast('已还原到原始预览', 'success');
}

function closeDownload() {
    els.downloadModal.classList.remove('active');
    els.downloadModal.classList.add('hidden');
    editor.raw = '';
    editor.processed = '';
    editor.actions = [];
    pendingDownload = null;
    sampleTarget = 'bg';
    setEditMode('sample');
}

function closeVersion() {
    els.versionModal.classList.remove('active');
    els.versionModal.classList.add('hidden');
}

function bakeCurrentColor(svgText) {
    return String(svgText || '').replace(/currentColor/gi, currentColor);
}

function isDirtyPreview() {
    return editor.actions.length > 0;
}

function updateExportStatus() {
    if (!els.exportStatus) return;
    const dirty = isDirtyPreview();
    els.exportStatus.classList.toggle('is-dirty', dirty);
    els.exportStatus.textContent = dirty
        ? `未保存 ${editor.actions.length} 步 · 下载即当前画面`
        : '下载即当前画面，不必先保存';
}

function bakePaintToHex(svg, hex) {
    const bake = (val) => {
        if (!val) return val;
        return /^currentColor$/i.test(String(val).trim()) ? hex : val;
    };
    eachPaintable(svg, (node) => {
        ['fill', 'stroke', 'color'].forEach((attr) => {
            if (node.hasAttribute && node.hasAttribute(attr)) {
                node.setAttribute(attr, bake(node.getAttribute(attr)));
            }
        });
        if (node.hasAttribute && node.hasAttribute('style')) {
            const map = parseStyleMap(node.getAttribute('style'));
            ['fill', 'stroke', 'color'].forEach((attr) => {
                if (map[attr]) map[attr] = bake(map[attr]);
            });
            node.setAttribute('style', serializeStyleMap(map));
        }
    });
    if (svg.hasAttribute('style')) {
        const map = parseStyleMap(svg.getAttribute('style'));
        delete map.color;
        const next = serializeStyleMap(map);
        if (next) svg.setAttribute('style', next);
        else svg.removeAttribute('style');
    }
}

function snapshotPreviewSvg() {
    const live = els.modalPreview && els.modalPreview.querySelector('svg');
    const source = live ? live.cloneNode(true) : parseSvgDom(editor.processed);
    if (!source) return '';
    source.querySelectorAll('[data-vs-hit], [data-vs-hover]').forEach((node) => {
        node.removeAttribute('data-vs-hit');
        node.removeAttribute('data-vs-hover');
    });
    source.querySelectorAll('[data-vs-id]').forEach((node) => node.removeAttribute('data-vs-id'));
    bakePaintToHex(source, currentColor);
    if (!source.getAttribute('xmlns')) {
        source.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    return serializeSvg(source);
}

function svgAspectSize(svgText, longEdge = 1024) {
    const svg = parseSvgDom(svgText);
    const vb = svg ? parseViewBox(svg) : null;
    if (!vb || !vb.w || !vb.h) return { w: longEdge, h: longEdge };
    if (vb.w >= vb.h) return { w: longEdge, h: Math.max(1, Math.round(longEdge * vb.h / vb.w)) };
    return { w: Math.max(1, Math.round(longEdge * vb.w / vb.h)), h: longEdge };
}

async function download(format) {
    const processed = snapshotPreviewSvg();
    if (!pendingDownload || !processed) {
        showToast('当前没有可下载的预览', 'warning');
        return;
    }
    const base = pendingDownload.title || pendingDownload.name || 'vectorstream';
    const filename = isDirtyPreview() ? `${base}-edited` : base;

    if (format === 'svg') {
        saveAs(new Blob([processed], { type: 'image/svg+xml;charset=utf-8' }), `${filename}.svg`);
        showToast(isDirtyPreview() ? '已下载当前预览（含未保存修改）' : '已下载当前预览', 'success');
        return;
    }

    const sized = parseSvgDom(processed);
    if (!sized) return;
    const { w, h } = svgAspectSize(processed, 1024);
    sized.setAttribute('width', String(w));
    sized.setAttribute('height', String(h));
    if (!sized.getAttribute('xmlns')) sized.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const svgBlob = new Blob([serializeSvg(sized)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
        els.canvas.width = w;
        els.canvas.height = h;
        const ctx = els.canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        els.canvas.toBlob((blob) => {
            if (blob) {
                saveAs(blob, `${filename}.png`);
                showToast(isDirtyPreview() ? '已下载当前预览 PNG（含未保存修改）' : '已下载当前预览 PNG', 'success');
            }
            URL.revokeObjectURL(url);
        }, 'image/png');
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        showToast('PNG 导出失败', 'error');
    };
    img.src = url;
}

function saveAs(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

els.searchInput.oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(handleSearch, 160);
};

els.colorPicker.oninput = (e) => {
    currentColor = e.target.value;
    document.querySelectorAll('.svg-container svg, #modalSvgPreview svg').forEach((svg) => {
        svg.style.color = currentColor;
    });
    if (!els.downloadModal.classList.contains('hidden')) updateExportStatus();
};

els.gridRange.oninput = (e) => {
    document.documentElement.style.setProperty('--grid-cols', e.target.value);
    if (virtualEnabled || pageItems.length) renderGallery();
};

els.rowsSelect.onchange = (e) => {
    rowsPerPage = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
    currentPage = 1;
    renderGallery();
};

els.backToTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

window.onscroll = () => {
    els.backToTop.classList.toggle('active', window.scrollY > 500);
    if (!virtualEnabled) return;
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        updateVirtualWindow(false);
    });
};

function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('vs-theme', next); } catch { /* ignore */ }
    if (els.themeToggle) {
        els.themeToggle.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
        els.themeToggle.title = next === 'dark' ? '切换浅色模式' : '切换深色模式';
    }
}

function initTheme() {
    let stored = null;
    try { stored = localStorage.getItem('vs-theme'); } catch { /* ignore */ }
    let theme = stored || 'light';
    if (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
    applyTheme(theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

function handleGridKeys(e) {
    if (!els.downloadModal.classList.contains('hidden') || !els.versionModal.classList.contains('hidden')) return;
    const active = document.activeElement;
    if (!active || !active.classList.contains('svg-card')) return;
    const cols = getGridCols();
    let next = focusedIndex;
    if (e.key === 'ArrowRight') next += 1;
    else if (e.key === 'ArrowLeft') next -= 1;
    else if (e.key === 'ArrowDown') next += cols;
    else if (e.key === 'ArrowUp') next -= cols;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = pageItems.length - 1;
    else return;
    e.preventDefault();
    focusCardAt(next);
}

function focusCardAt(index) {
    if (!pageItems.length) return;
    const next = Math.max(0, Math.min(pageItems.length - 1, index));
    focusedIndex = next;
    const existing = els.gallery.querySelector(`[data-index="${next}"]`);
    if (existing) {
        existing.focus();
        return;
    }
    const cols = getGridCols();
    const rowH = measureRowHeight(cols);
    const row = Math.floor(next / cols);
    const galleryTop = els.gallery.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, galleryTop + row * rowH - 140) });
    updateVirtualWindow(true);
    requestAnimationFrame(() => {
        const el = els.gallery.querySelector(`[data-index="${next}"]`);
        if (el) el.focus();
    });
}

let toastTimer = null;
function showToast(msg, type = 'success') {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden', 'success', 'error', 'warning');
    els.toast.classList.add('active', type);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        els.toast.classList.remove('active');
        setTimeout(() => {
            els.toast.classList.add('hidden');
            els.toast.classList.remove(type);
        }, 280);
    }, 2200);
}

window.VERSION = VERSION;
window.processSvgContent = processSvgContent;
window.applyTheming = applyTheming;
window.deepCleanSvg = deepCleanSvg;
window.filterCategory = filterCategory;
window.changePage = changePage;

window.onload = loadData;
