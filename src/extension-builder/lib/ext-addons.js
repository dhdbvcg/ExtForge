/**
 * ExtAddons — 轻量插件系统
 *
 * 设计说明：
 * - 多数内置插件（快速复制积木 / 斑马条纹 / 方形输入框 / 数字框微调 / 孤立半透明 /
 *   更多右键菜单）已于 2026-08-22 迁移到独立仓库：
 *     https://github.com/dhdbvcg/scratch-ext-addon
 *   并通过 ExtensionBuilder「设置 → 插件管理 → 安装插件」用来源
 *     github:dhdbvcg/scratch-ext-addon
 *   安装（对齐 DeepSeek Harness 的 dsh plugin add 风格）。
 * - EXT_ADDONS 现在保留少量「强内置」插件（随编辑器代码打包、默认启用、不可卸载），
 *   例如 realtime-collab（多人实时协作）。它们通过顶部 import 加入 EXT_ADDONS，
 *   并在 DEFAULT_STATE 设默认 true。
 * - 其余插件仍来自用户安装（外源）。
 * - 所有插件在 Blockly 工作区注入完成后调用 applyExtAddons() 激活。
 *
 * 导入来源（持续优化）：
 *   - 单个 JS 文件（本地 / 远程直链 / npm / github）
 *   - 文件夹（webkitdirectory）：含 index.js + HTML/CSS/图片/JS 等资源
 *   - ZIP 包：含 index.js + HTML/CSS/图片/JS 等资源（JSZip 解压）
 * 插件除 setup 外，还可携带 resources（base64 持久化），并通过 ctx.assets /
 * ctx.loadAsset / ctx.fileOverride 读取资源、改写网页底层文件。
 */

// 内置插件（随编辑器代码打包，默认启用，无需安装）
// realtime-collab：多人实时协作（房间/聊天/工作区同步）
// 源文件位于 src/extension-builder/lib/builtin/（随 src 打包，babel 可转译 ES2020 语法）
import realtimeCollab from './builtin/realtime-collab.js';
// Bilup Nova（novatheai）：从原版搬运移植的 AI 助手插件（悬浮聊天框 / 多模型 / 设置 / Agent / 会话）
import bilupNova from './bilup-nova/bilup-nova.js';
// 以下插件已从外部仓库迁移回内置
import blockDuplicate from './builtin/block-duplicate.js';
import zebraStriping from './builtin/zebra-striping.js';
import editorSquareInputs from './builtin/editor-square-inputs.js';
import editorNumberArrowKeys from './builtin/editor-number-arrow-keys.js';
import transparentOrphans from './builtin/transparent-orphans.js';
import developerTools from './builtin/developer-tools.js';

const STORAGE_KEY = 'extbuilder_ext_addons';

const DEFAULT_STATE = {
    // 内置实时协作：默认开启
    'realtime-collab': true,
    // Bilup Nova（AI 助手）：从原版搬运移植，默认开启
    'bilup-nova': true,
    // 已迁移回内置的插件：默认开启
    'block-duplicate': true,
    'zebra-striping': true,
    'editor-square-inputs': true,
    'editor-number-arrow-keys': true,
    'transparent-orphans': true,
    'developer-tools': true,
};

/**
 * 插件注册表（内置为空，插件均通过「插件管理 → 安装插件」外部安装）。
 * 每个插件：
 *   id           唯一 id（对应 localStorage 键）
 *   name         中文名
 *   description  中文描述
 *   category     分类（编辑器 / 视觉）
 *   css          (可选) 注入的 CSS 字符串
 *   setup        (可选) async (ctx) => cleanup：在 Blockly 注入后调用，
 * 返回清理函数
 */
export const EXT_ADDONS = [
    // 实时协作：内置插件（不可卸载；可在插件管理里取消勾选 / 重新勾选）
    Object.assign({}, realtimeCollab, { builtin: true }),
    // Bilup Nova（AI 助手）：内置插件（不可卸载；可在插件管理里取消勾选 / 重新勾选）
    Object.assign({}, bilupNova, { builtin: true }),
    // 快速复制积木：按住 Alt/⌥ 拖动直接复制一份
    Object.assign({}, blockDuplicate, { builtin: true }),
    // 斑马条纹积木：嵌套相同颜色积木交替明暗显示
    Object.assign({}, zebraStriping, { builtin: true }),
    // 方形数字输入框：数字/文本输入框从圆形变为方形
    Object.assign({}, editorSquareInputs, { builtin: true }),
    // 数字框 ↑↓ 微调：聚焦数字输入框时按 ↑/↓ 键快速增减数值
    Object.assign({}, editorNumberArrowKeys, { builtin: true }),
    // 孤立积木半透明：顶部不是帽子积木的孤立积木变淡显示
    Object.assign({}, transparentOrphans, { builtin: true }),
    // 更多右键菜单栏：右键积木新增全部复制/复制积木/剪切积木
    Object.assign({}, developerTools, { builtin: true }),
];

/** 提示文案：内置插件已迁移到外部仓库（已废弃，所有插件已迁回内置） */
export const EXT_ADDONS_MIGRATION_NOTE = '';



/**
 * ============================================================
 * 自定义插件（用户从本地 JS 文件导入，持久化在 localStorage）
 * ============================================================
 * 导入的 JS 文件需导出一个插件对象（CommonJS：module.exports = {...}，
 * 或 ES Module：export default {...}），结构：
 *   {
 *     id: 'my-plugin',        // 唯一 id（与内置插件 id 冲突时后者覆盖前者）
 *     name: '我的插件',       // 中文名
 *     description: '...',     // 描述
 *     category: '自定义',     // 分类（可选，默认「自定义」）
 *     css: '...',             // 可选，注入的 CSS 字符串
 *     setup: function(ctx) {  // 必填，返回清理函数
 *       const B = ctx.Blockly;
 *       // 改装逻辑……
 *       return function cleanup() { 在 cleanup 中还原原型并移除监听 };
 *     }
 *   }
 * 也可导出数组一次导入多个插件。
 *
 * 注意：setup 必须是「自包含」函数（不依赖文件内其它变量/helper），因为它会被
 * 序列化为源码字符串（setupCode）在页面加载时重新编译执行。
 */
const CUSTOM_ADDONS_KEY = 'extbuilder_custom_addons';

// 去掉函数引用，返回可 JSON 序列化的纯对象（保留 setupCode 源码）
const stripCustomFn = (a) => {
    const {setup, ...rest} = a;
    return rest;
};

// 解析当前可用的 Blockly 实例（窗口优先，其次全局）
function resolveBlockly() {
    if (typeof window !== 'undefined') {
        if (window._extBuilderBlockly) return window._extBuilderBlockly;
        if (window.Blockly) return window.Blockly;
    }
    if (typeof globalThis !== 'undefined' && globalThis.Blockly) return globalThis.Blockly;
    return undefined;
}

// 把存储的 setupCode 还原成函数
function rehydrateSetup(addon) {
    if (typeof addon.setup === 'function') return addon.setup;
    if (typeof addon.setupCode === 'string') {
        try {
            const code = 'module.exports = (' + addon.setupCode + ');';
            const fn = new Function('module', 'exports', 'Blockly', code);
            const module = {exports: {}};
            const blk = resolveBlockly();
            fn(module, module.exports, blk);
            return typeof module.exports === 'function' ? module.exports : (() => {});
        } catch (e) {
            console.error('[ExtAddons] 自定义插件「' + (addon.id || '?') + '」setup 解析失败:', e);
            return () => {};
        }
    }
    return () => {};
}

/**
 * 读取已导入并持久化的自定义插件（带已还原的 setup 函数）
 */
export function loadCustomAddons() {
    try {
        const raw = localStorage.getItem(CUSTOM_ADDONS_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr.map(a => ({...a, custom: true, setup: rehydrateSetup(a)}));
    } catch (e) { return []; }
}

/**
 * 持久化自定义插件列表（自动去掉不可序列化的函数）
 */
export function saveCustomAddons(list) {
    try {
        localStorage.setItem(CUSTOM_ADDONS_KEY, JSON.stringify((list || []).map(stripCustomFn)));
    } catch (e) { /* localStorage 不可用时静默 */ }
}

/**
 * 把 JS 文本编译成插件定义数组（共享逻辑：本地文件与远程来源都用它）。
 * 支持 `export default {...}` / `module.exports = {...}`，以及导出数组。
 * @returns {Array} 校验通过的插件对象数组（含 setupCode 源码）
 */
function evalAddonText(rawCode) {
    if (typeof rawCode !== 'string' || !rawCode.trim()) throw new Error('内容为空');
    let code = rawCode;
    if (/export\s+default/.test(code)) {
        code = code.replace(/export\s+default\s+/, 'module.exports = ');
        code = code.replace(/^[ \t]*export\s+/gm, '// export ');
    }
    const module = {exports: {}};
    const blk = resolveBlockly();
    const win = (typeof window !== 'undefined' ? window : undefined);
    const fn = new Function('module', 'exports', 'Blockly', 'ctx', 'window', code);
    fn(module, module.exports, blk, undefined, win);
    const exp = module.exports;
    if (!exp) throw new Error('文件未导出插件对象（请用 module.exports = {...} 或 export default {...}）');
    const list = Array.isArray(exp) ? exp : [exp];
    const valid = [];
    for (const a of list) {
        if (!a || typeof a.id !== 'string' || !a.id.trim()) throw new Error('插件缺少有效的 id 字段');
        if (typeof a.setup !== 'function') throw new Error('插件「' + (a.id || '?') + '」缺少 setup 函数');
        valid.push({
            id: a.id.trim(),
            name: a.name || a.id,
            description: a.description || '',
            category: a.category || '自定义',
            css: typeof a.css === 'string' ? a.css : '',
            setupCode: a.setup.toString(),
            custom: true
        });
    }
    return valid;
}

/**
 * 写入 localStorage（合并同名、追加新插件）。sourceSpec 非空时记录来源便于「更新」。
 */
function storeImportedAddons(list, sourceSpec) {
    const existing = loadCustomAddons().map(stripCustomFn);
    const merged = existing
        .filter(e => !list.some(v => v.id === e.id))
        .concat(list.map(a => sourceSpec != null
            ? {...a, source: sourceSpec, installedAt: Date.now()}
            : a));
    saveCustomAddons(merged);
    return list;
}

/**
 * 从本地 JS 文件文本导入（向后兼容旧入口，不记录来源）。
 */
export function importCustomAddonFromFile(fileText) {
    const list = evalAddonText(fileText);
    if (!list.length) throw new Error('文件中没有有效的插件对象');
    return storeImportedAddons(list, null);
}

/* ===================== 文件夹 / ZIP / 多格式导入 =====================
 * 一个插件「包」是一组文件（HTML / CSS / 各种图片 / JS 等），结构：
 *   index.js  —— 入口（必须，导出插件对象，同 evalAddonText 规则）
 *   *.html / *.css / *.png / *.jpg / *.svg / *.gif / *.webp ... —— 资源（转 base64）
 * 其余 JS 文件也可作为资源被 index.js 通过 ctx.loadAsset 读取。
 *
 * 导入方式：
 *   1) 文件夹：浏览器 <input webkitdirectory> 选出的 File[]，逐个读为 {path, text, base64}
 *   2) ZIP：JSZip 解压后的 {path, text, base64}[]
 *   3) 单个 JS：沿用 importCustomAddonFromFile（已存在）
 *
 * 资源以 base64 dataURL 形式存进插件对象的 assets 字段，持久化到 localStorage，
 * 重载后由 makeAddonCtx 还原为 ctx.assets / ctx.loadAsset。
 */

// 是否视为「可识别的资源」（用于生成 assets map）
// 白名单：HTML / CSS / 图片 / 字体 / 非入口的 JS（可被 index.js 经 loadAsset 读取）。
// 其余文本（md/txt/json 等）不进 assets；index.js 永远作为入口不进 assets。
function isAssetPath(path) {
    const p = path.replace(/\\/g, '/').replace(/^\/+/, '');
    if (/^index\.js$|(^|\/)index\.js$/.test(p)) return false;
    if (/\.(js|mjs)$/i.test(p)) return true; // 非入口 JS 也可作为资源被 loadAsset 读取
    if (/\.(md|markdown|txt|json|map)$/i.test(p)) return false;
    if (/\.(html?|css|png|jpe?g|gif|webp|bmp|ico|svg|woff2?|ttf|otf)$/i.test(p)) return true;
    return false;
}

// 归一化路径（去掉前导 ./ 与绝对前缀，统一小写比较用 key）
function normPath(path) {
    return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

// 从文件数组解析出 index.js 文本 + assets map
function parseBundleFiles(files) {
    const fileMap = new Map();
    for (const f of files) {
        const p = normPath(f.path || f.name || '');
        if (!p) continue;
        fileMap.set(p.toLowerCase(), f);
    }
    // 找入口：优先根 index.js，其次任一 index.js
    const entryCandidates = ['index.js', ...[...fileMap.keys()].filter(k => /(^|\/)index\.js$/.test(k))];
    let entryKey = entryCandidates.find(k => fileMap.has(k));
    if (!entryKey) throw new Error('插件包中找不到 index.js 入口文件');
    const entryFile = fileMap.get(entryKey);
    const entryText = entryFile.text != null ? entryFile.text : entryFile.base64 || '';
    if (!entryText) throw new Error('入口 index.js 内容为空');

    // 其余文件做 assets（base64 dataURL）
    const assets = {};
    for (const [k, f] of fileMap.entries()) {
        if (k === entryKey) continue;
        if (!isAssetPath(k)) continue;
        const dataUrl = toDataUrl(f, k);
        if (dataUrl) assets[k] = dataUrl;
    }
    return {entryText, assets};
}

// 把文件转成 dataURL（优先 base64 字段，否则用 text 转）
function toDataUrl(f, key) {
    if (f.base64) return f.base64; // 已经是 dataURL 或裸 base64
    if (f.text != null) {
        const mime = mimeOf(key);
        const b64 = typeof btoa !== 'undefined'
            ? btoa(unescape(encodeURIComponent(f.text)))
            : Buffer.from(f.text, 'utf-8').toString('base64');
        return 'data:' + mime + ';base64,' + b64;
    }
    return null;
}

// 粗略 MIME 推断（仅用于资源预览/dataURL 头）
function mimeOf(path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    const map = {
        html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript',
        json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
        jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
        ico: 'image/x-icon', txt: 'text/plain', md: 'text/markdown', woff: 'font/woff',
        woff2: 'font/woff2', ttf: 'font/ttf'
    };
    return map[ext] || 'application/octet-stream';
}

/**
 * 把 {path, text, base64}[] 编译并持久化为插件（含资源）。
 * @returns 导入的插件定义数组
 */
export function evalAddonBundle(files, sourceSpec) {
    if (!Array.isArray(files) || !files.length) throw new Error('文件列表为空');
    const {entryText, assets} = parseBundleFiles(files);
    const list = evalAddonText(entryText);
    for (const item of list) {
        item.assets = assets; // 资源随插件一起持久化
    }
    return storeImportedAddons(list, sourceSpec || null);
}

/**
 * 浏览器本地文件夹 / 多文件选择导入（webkitdirectory 或 multiple）。
 * files: File[]（可能含子目录路径，webkitdirectory 时 file.webkitRelativePath 可用）
 */
export async function importAddonBundle(files, sourceSpec) {
    if (!files || !files.length) throw new Error('未选择文件');
    const prepared = await Promise.all([...files].map(async (f) => {
        const path = (f.webkitRelativePath && f.webkitRelativePath.length > f.name.length)
            ? f.webkitRelativePath
            : f.name;
        const isImg = /(\.(png|jpe?g|gif|webp|bmp|svg|ico|woff2?|ttf))$/i.test(path);
        let base64 = null;
        if (isImg) {
            const buf = await f.arrayBuffer();
            base64 = 'data:' + (f.type || mimeOf(path)) + ';base64,' +
                (typeof btoa !== 'undefined'
                    ? btoa(String.fromCharCode(...new Uint8Array(buf)))
                    : Buffer.from(buf).toString('base64'));
        }
        return {path, name: f.name, text: isImg ? '' : await f.text(), base64};
    }));
    return evalAddonBundle(prepared, sourceSpec || ('local:' + (files[0].name || 'folder')));
}

/**
 * 从 ZIP（ArrayBuffer）导入插件包，使用 JSZip 解压。
 * 支持 HTML/CSS/图片/JS 等任意资源。
 */
export async function importAddonFromZip(arrayBuffer, sourceSpec) {
    let JSZip;
    try {
        JSZip = (await import('jszip')).default || (await import('jszip'));
    } catch (e) {
        // 兜底：全局或 require
        JSZip = (typeof window !== 'undefined' && window.JSZip) || (typeof require !== 'undefined' ? require('jszip') : null);
    }
    if (!JSZip) throw new Error('ZIP 解压库不可用（JSZip 未加载）');
    const zip = await JSZip.loadAsync(arrayBuffer);
    const files = [];
    zip.forEach((relPath, entry) => {
        if (entry.dir) return;
        // 忽略 macOS 元数据
        if (relPath.startsWith('__MACOSX/') || relPath.endsWith('/.DS_Store')) return;
        files.push(relPath);
    });
    const prepared = await Promise.all(files.map(async (relPath) => {
        const entry = zip.file(relPath);
        if (!entry) return null;
        const isImg = /(\.(png|jpe?g|gif|webp|bmp|svg|ico|woff2?|ttf))$/i.test(relPath);
        if (isImg) {
            const buf = await entry.async('uint8array');
            const b64 = (typeof btoa !== 'undefined'
                ? btoa(String.fromCharCode(...buf))
                : Buffer.from(buf).toString('base64'));
            return {path: relPath, name: relPath.split('/').pop(), base64: 'data:image/' + (mimeOf(relPath).split('/')[1] || 'png') + ';base64,' + b64, text: ''};
        }
        const text = await entry.async('string');
        return {path: relPath, name: relPath.split('/').pop(), text, base64: null};
    }));
    const filtered = prepared.filter(Boolean);
    return evalAddonBundle(filtered, sourceSpec || 'local:zip');
}

/* ===================== 多源安装（对齐 DeepSeek Harness 的 dsh plugin add） ===================== */

const CDN = 'https://cdn.jsdelivr.net';

// 识别来源类型：npm / github / git / url / tarball
function detectSourceType(spec) {
    spec = (spec || '').trim();
    if (!spec) throw new Error('来源为空');
    if (/^https?:\/\//i.test(spec)) {
        if (/\.tgz$|\.tar\.gz$/i.test(spec)) return {type: 'tarball', url: spec};
        return {type: 'url', url: spec};
    }
    if (/^git\+https?:\/\//i.test(spec)) {
        const m = spec.match(/^git\+https?:\/\/(github\.com\/[^\s/]+\/[^\s/]+?)(\.git)?$/i);
        if (m) return {type: 'github', owner: m[1].split('/')[0], repo: m[1].split('/')[1]};
        return {type: 'git', url: spec.replace(/^git\+/, '')};
    }
    if (/^github:/i.test(spec)) {
        const rest = spec.replace(/^github:/i, '').replace(/\.git$/, '');
        const parts = rest.split('/');
        return {type: 'github', owner: parts[0], repo: parts[1]};
    }
    if (/^npm:/i.test(spec)) return {type: 'npm', pkg: spec.replace(/^npm:/i, '')};
    if (/^[\w.-]+\/[\w.-]+$/.test(spec)) {
        return {type: 'github', owner: spec.split('/')[0], repo: spec.split('/')[1].replace(/\.git$/, '')};
    }
    if (/^(@[\w.-]+\/)?[\w.-]+$/.test(spec) && !/\s/.test(spec)) return {type: 'npm', pkg: spec};
    throw new Error('无法识别的来源类型：' + spec);
}

async function fetchText(url) {
    // 加时间戳破坏浏览器缓存（确保每次都拿到最新数据）
    const sep = url.indexOf('?') === -1 ? '?' : '&';
    const bustUrl = url + sep + '_t=' + Date.now() + '_' + Math.random().toString(36).slice(2);
    console.log('[ExtAddons] fetchText URL:', bustUrl);
    const res = await fetch(bustUrl, {mode: 'cors', cache: 'no-store'});
    console.log('[ExtAddons] fetchText status:', res.status, res.headers.get('content-length'), 'bytes');
    if (!res.ok) throw new Error('拉取失败（HTTP ' + res.status + '）：' + url);
    const text = await res.text();
    console.log('[ExtAddons] fetchText OK, length:', text.length, 'first 100:', text.slice(0, 100));
    return text;
}

// 极简 tar(ustar) 读取：解 gzip 后找出最佳 .js 入口
async function extractJsFromTarball(arrayBuffer) {
    const ds = new DecompressionStream('gzip');
    const stream = new Response(arrayBuffer).body.pipeThrough(ds);
    const gunzipped = await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(gunzipped);
    const jsFiles = [];
    let offset = 0;
    const readStr = (off, len) => {
        let s = '';
        for (let i = 0; i < len; i++) { const c = bytes[off + i]; if (c === 0) break; s += String.fromCharCode(c); }
        return s;
    };
    while (offset + 512 <= bytes.length) {
        const name = readStr(offset, 100).replace(/\0.*$/, '');
        const size = parseInt(readStr(offset + 124, 12).replace(/\0.*$/, '').trim(), 8) || 0;
        const typeflag = String.fromCharCode(bytes[offset + 156]);
        offset += 512;
        if (typeflag !== '0') { offset += Math.ceil(size / 512) * 512; continue; }
        if (!name || size === 0) { offset += Math.ceil(size / 512) * 512; if (!name) break; continue; }
        const data = bytes.slice(offset, offset + size);
        offset += Math.ceil(size / 512) * 512;
        if (name.endsWith('.js')) jsFiles.push({name, text: new TextDecoder().decode(data)});
    }
    if (!jsFiles.length) throw new Error('tarball 中没有 .js 文件');
    return (jsFiles.find(f => /(^|\/)(index|main)\.js$/.test(f.name)) || jsFiles[0]).text;
}

async function resolveTarball(url) {
    const res = await fetch(url, {mode: 'cors'});
    if (!res.ok) throw new Error('拉取 tarball 失败（HTTP ' + res.status + '）：' + url);
    return extractJsFromTarball(await res.arrayBuffer());
}

async function resolveNpm(pkg) {
    let text = await fetchText(CDN + '/npm/' + pkg);
    if (text.trim().startsWith('{') && text.includes('"version"')) {
        try {
            const j = JSON.parse(text);
            const main = j.main || 'index.js';
            return await fetchText(CDN + '/npm/' + pkg + '/' + main);
        } catch (e) { /* 不是 package.json，原样返回 */ }
    }
    return text;
}

async function resolveGithub(owner, repo) {
    const base = CDN + '/gh/' + owner + '/' + repo + '/';
    const candidates = ['package.json', 'index.js', 'dist/index.js', 'src/index.js',  'dist/bundle.js', 'build/index.js'];
    for (const c of candidates) {
        try {
            const text = await fetchText(base + c);
            if (c === 'package.json') {
                const j = JSON.parse(text);
                try {
                    return [await fetchText(base + (j.main || 'index.js'))];
                } catch (e) { /* main 指向的文件不存在，尝试多插件模式 */ }
            } else {
                return [text];
            }
        } catch (e) { /* 尝试下一个候选 */ }
    }
    // 无单入口（「一个仓库多个插件」结构）：优先读取仓库根目录的 plugins.json 清单（走 jsDelivr，避免 API 限流/CORS）；
    // 其次回退到 GitHub API 文件树。每个子目录的 index.js 作为一个独立插件。
    let jsPaths = [];
    try {
        const manifest = JSON.parse(await fetchText(base + 'plugins.json'));
        if (Array.isArray(manifest.plugins) && manifest.plugins.length) {
            jsPaths = manifest.plugins.map(p => {
                const dir = (typeof p === 'string' ? p : (p.dir || p.path || '')).replace(/\/+$/, '');
                return dir + '/index.js';
            });
        }
    } catch (e) { /* 没有清单，回退到 API tree */ }
    if (!jsPaths.length) {
        const tree = await fetchGithubTree(owner, repo);
        jsPaths = tree
            .map(t => t.path)
            .filter(p => /^(?:[^\/]+\/)?index\.js$/.test(p) && p !== 'index.js');
    }
    if (!jsPaths.length) throw new Error('在 github:' + owner + '/' + repo + ' 中找不到入口 JS 文件');
    const texts = [];
    for (const p of jsPaths) {
        try { texts.push(await fetchText(base + p)); } catch (e) { /* 跳过无法读取的文件 */ }
    }
    if (!texts.length) throw new Error('在 github:' + owner + '/' + repo + ' 中找不到入口 JS 文件');
    return texts;
}

async function fetchGithubTree(owner, repo) {
    // 依次尝试常见分支名 / HEAD，避免默认分支名差异导致的 404
    const refs = ['main', 'master', 'HEAD'];
    let lastErr;
    for (const ref of refs) {
        try {
            const api = 'https://api.github.com/repos/' + owner + '/' + repo + '/git/trees/' + ref + '?recursive=1';
            const res = await fetch(api, {mode: 'cors'});
            if (!res.ok) { lastErr = res.status; continue; }
            const data = await res.json();
            if (Array.isArray(data.tree) && data.tree.length) return data.tree;
        } catch (e) { lastErr = e; }
    }
    throw new Error('获取仓库文件树失败（HTTP ' + (lastErr || '未知') + '）');
}

/**
 * 根据来源标识符拉取 JS 文本（支持 npm / github / git / 直链 / tarball）。
 * 返回 string[]：单入口仓库返回 [单文件]，多插件仓库返回每个 index.js 的内容。
 */
export async function resolveAddonSource(spec) {
    const info = detectSourceType(spec);
    switch (info.type) {
        case 'npm': return [await resolveNpm(info.pkg)];
        case 'github': return resolveGithub(info.owner, info.repo);
        case 'url': return [await fetchText(info.url)];
        case 'tarball': return [await resolveTarball(info.url)];
        case 'git': throw new Error('暂不支持该 git 托管（目前仅支持 GitHub）：' + info.url);
        default: throw new Error('未知来源类型');
    }
}

/**
 * 从来源安装插件（对齐 DSH：`dsh plugin add <npm/github/git/url>`）。
 * 成功返回导入的插件定义数组。
 */
export async function importAddonFromSource(spec, opts = {}) {
    let texts;
    if (opts && opts.fileText != null) texts = [opts.fileText];
    else texts = await resolveAddonSource(spec);
    const all = [];
    for (const t of texts) {
        const list = evalAddonText(t);
        for (const item of list) all.push(item);
    }
    if (!all.length) throw new Error('来源中没有有效的插件对象');
    return storeImportedAddons(all, spec);
}

/**
 * 按来源重新拉取并更新某个已安装插件（DSH 的 update 等价物）。
 */
export async function updateCustomAddonSource(id) {
    const existing = loadCustomAddons().map(stripCustomFn);
    const found = existing.find(e => e.id === id);
    if (!found || !found.source) throw new Error('该插件没有来源信息，无法更新');
    const texts = await resolveAddonSource(found.source);
    const all = [];
    for (const t of texts) {
        const list = evalAddonText(t);
        for (const item of list) all.push(item);
    }
    const updated = all.find(a => a.id === id);
    if (!updated) throw new Error('更新后未找到 id 为「' + id + '」的插件');
    const others = existing.filter(e => e.id !== id);
    saveCustomAddons(others.concat([{...updated, source: found.source, installedAt: Date.now()}]));
    return updated;
}

/**
 * 从 GitHub 仓库的某个子目录安装单个插件（市场「安装」按钮使用）。
 * 直接走 jsDelivr CDN 拉取 <dir>/index.js，不依赖 GitHub API。
 */
export async function importAddonFromGithubDir(owner, repo, dir) {
    // 优先用 GitHub Contents API（支持 CORS + 实时数据，无 CDN 缓存问题）
    const cleanDir = dir.replace(/\/+$/, '');
    const apiPath = 'repos/' + owner + '/' + repo + '/contents/' + cleanDir + '/index.js';
    let text;
    try {
        const apiUrl = 'https://api.github.com/' + apiPath;
        console.log('[ExtAddons] importAddonFromGithubDir fetching via Contents API:', apiUrl);
        const res = await fetch(apiUrl, {cache: 'no-store'});
        if (!res.ok) throw new Error('Contents API HTTP ' + res.status);
        const data = await res.json();
        if (data.content && data.encoding === 'base64') {
            const binary = atob(data.content.replace(/\s/g, ''));
            text = new Uint8Array([...binary].map(c => c.charCodeAt(0)));
            text = new TextDecoder('utf-8').decode(text);
        } else {
            throw new Error('Contents API 未返回有效内容');
        }
    } catch (e) {
        console.warn('[ExtAddons] Contents API 失败，回退 jsDelivr CDN:', e && e.message);
        // 回退：jsDelivr CDN（有 CORS 但可能缓存旧版）
        const base = CDN + '/gh/' + owner + '/' + repo + '/';
        const url = base + cleanDir + '/index.js?_t=' + Date.now();
        text = await fetchText(url);
    }
    console.log('[ExtAddons] importAddonFromGithubDir got length:', text.length);
    const list = evalAddonText(text);
    if (!list.length) throw new Error('在 ' + dir + ' 中没有有效的插件对象');
    return storeImportedAddons(list, 'github:' + owner + '/' + repo + '/' + dir);
}

/**
 * 拉取插件市场清单（仓库根的 plugins.json，走 jsDelivr CDN）。
 * 返回 [{ id, name, description, category, dir, source }]
 */
export async function fetchAddonMarketList(owner, repo) {
    const base = CDN + '/gh/' + owner + '/' + repo + '/';
    let manifest;
    try {
        manifest = JSON.parse(await fetchText(base + 'plugins.json'));
    } catch (e) {
        // 没有清单时回退：列举整个仓库的 index.js
        const tree = await fetchGithubTree(owner, repo);
        const dirs = tree
            .map(t => t.path)
            .filter(p => /^(?:[^\/]+\/)?index\.js$/.test(p) && p !== 'index.js')
            .map(p => p.replace(/\/index\.js$/, ''));
        manifest = { plugins: dirs.map(d => ({ dir: d, name: d, description: '' })) };
    }
    const raw = Array.isArray(manifest.plugins) ? manifest.plugins : [];
    return raw.map(p => {
        // 兼容两种格式：字符串目录名 或 { dir, name, description, category }
        const dir = (typeof p === 'string' ? p : (p.dir || p.path || '')).replace(/\/+$/, '');
        const name = (typeof p === 'string' ? p : (p.name || dir));
        const description = (typeof p === 'string' ? '' : (p.description || ''));
        const category = (typeof p === 'string' ? '插件' : (p.category || '插件'));
        return {
            id: dir,
            name,
            description,
            category,
            dir,
            source: 'github:' + owner + '/' + repo + '/' + dir
        };
    });
}

/**
 * 通过 GitHub 搜索 API 列出带指定 topic 的所有公开仓库。
 * 返回 [{ owner, repo, description, stars }]
 * 注意：GitHub API 在浏览器内受 CORS 限制，沙箱/无 token 环境可能失败，
 * 调用方需自行处理异常（可回退到固定仓库清单）。
 */
export async function fetchAddonTopicRepos(topic) {
    const url = 'https://api.github.com/search/repositories?q=topic:' +
        encodeURIComponent(topic) + '&per_page=100&sort=stars';
    const res = await fetch(url, {
        headers: { 'Accept': 'application/vnd.github+json' }
    });
    if (!res.ok) throw new Error('搜索主题仓库失败（HTTP ' + res.status + '）');
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map(r => ({
        owner: r.owner && r.owner.login,
        repo: r.name,
        description: r.description || '',
        stars: r.stargazers_count || 0
    }));
}

/**
 * 从插件市场拉取清单。
 * 优先用 GitHub Contents API（支持 CORS + 实时数据），
 * 失败则回退 jsDelivr CDN（支持 CORS 但可能有缓存延迟）。
 * 返回 [{ id, name, description, category, dir, source, repoOwner, repoName }]
 */
export async function fetchAddonMarketFromTopic(topic) {
    console.log('[ExtAddons] fetchAddonMarketFromTopic START, topic=', topic);
    const MARKET_OWNER = 'dhdbvcg';
    const MARKET_REPO = 'scratch-ext-addon';

    let manifest;
    // 策略 1：GitHub Contents API（支持 CORS，实时数据，返回 base64）
    try {
        const api = 'https://api.github.com/repos/' + MARKET_OWNER + '/' + MARKET_REPO + '/contents/plugins.json';
        console.log('[ExtAddons] trying GitHub Contents API:', api);
        const res = await fetch(api, {cache: 'no-store'});
        if (res.ok) {
            const data = await res.json();
            if (data.content && data.encoding === 'base64') {
                // 正确解码 UTF-8：atob 返回二进制字符串，需经 TextDecoder 转 UTF-8
                const bin = atob(data.content.replace(/\s/g, ''));
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                manifest = JSON.parse(new TextDecoder('utf-8').decode(bytes));
                console.log('[ExtAddons] Contents API OK, decoded length:', JSON.stringify(manifest).length);
            } else { throw new Error('unexpected encoding'); }
        } else { throw new Error('HTTP ' + res.status); }
    } catch (e) {
        console.warn('[ExtAddons] Contents API failed, fallback to jsDelivr:', e && e.message);
        // 策略 2：jsDelivr CDN（有 CORS，但可能缓存旧数据）
        const base = CDN + '/gh/' + MARKET_OWNER + '/' + MARKET_REPO + '/';
        const ts = '_v=' + Date.now() + '_' + Math.random().toString(36).slice(2);
        console.log('[ExtAddons] fetching jsDelivr:', base + 'plugins.json?' + ts);
        manifest = JSON.parse(await fetchText(base + 'plugins.json?' + ts));
    }
    const raw = Array.isArray(manifest.plugins) ? manifest.plugins : [];
    console.log('[ExtAddons] plugins count:', raw.length, raw.map(p => (typeof p === 'string' ? p : p.dir || p.id)));
    return raw.map(p => {
        const dir = (typeof p === 'string' ? p : (p.dir || p.path || '')).replace(/\/+$/, '');
        const name = (typeof p === 'string' ? p : (p.name || dir));
        const description = (typeof p === 'string' ? '' : (p.description || ''));
        const category = (typeof p === 'string' ? '插件' : (p.category || '插件'));
        return {
            id: dir, name, description, category, dir,
            source: 'github:' + MARKET_OWNER + '/' + MARKET_REPO + '/' + dir,
            repoOwner: MARKET_OWNER,
            repoName: MARKET_REPO
        };
    });
}

/**
 * 删除一个自定义插件（按 id）
 */
export function removeCustomAddon(id) {
    const existing = loadCustomAddons().map(stripCustomFn);
    saveCustomAddons(existing.filter(e => e.id !== id));
}


/**
 * 内置插件 + 自定义插件（运行时合并，用于列表渲染与激活）
 */
export function getAllAddons() {
    return [...EXT_ADDONS, ...loadCustomAddons()];
}

/**
 * 读取插件开关状态（默认值合并）
 */
export function getAddonState() {
    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) { saved = {}; }
    const state = {};
    getAllAddons().forEach(a => {
        // 自定义插件默认关闭（不在 DEFAULT_STATE 里）；内置插件用 DEFAULT_STATE 默认值
        state[a.id] = saved[a.id] === undefined ? !!DEFAULT_STATE[a.id] : !!saved[a.id];
    });
    return state;
}

/**
 * 保存插件开关状态
 */
export function setAddonState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* localStorage 不可用时静默 */ }
}

/**
 * 激活（或重新激活）所有启用的插件。
 * @param {object} ctx { Blockly, getWorkspace }
 * @returns {Promise<() => void>} 清理函数
 *
 * 注意：串行化执行（内部 promise 链），避免快速连续切换开关时并发
 * apply 互相覆盖（A 的 cleanup 恢复原型后 B 的 setup 又覆写，最终状态
 * 取决于时序）。每次 apply 前先移除同 id 的旧 style，保证幂等。
 */
let _applyQueue = Promise.resolve();

/**
 * 为单个插件构造富上下文（对齐 DSH 的 ctx）：
 * 除了 Blockly / getWorkspace，还提供 document / window / createElement /
 * injectCSS / addToolbarButton / mountPanel / effect / addEventListener / root，
 * 让插件可以像 DSH 一样自由改造编辑器网页界面。所有副作用通过 effect()
 * 或 setup 返回的清理函数统一回收。
 */
function makeAddonCtx(addon, {Blockly, getWorkspace}) {
    const disposers = [];
    const registerDisposer = (d) => { if (typeof d === 'function') disposers.push(d); };
    const root = () => document.querySelector('.ext-builder');
    // 插件包内资源（path -> base64 dataURL），从 addon.assets 还原
    const assets = (addon && addon.assets) || {};
    const ctx = {
        Blockly,
        getWorkspace,
        document,
        window,
        addon,
        root,

        /* ---------- 资源访问（文件夹 / ZIP 导入的 HTML/CSS/图片/JS） ---------- */
        /**
         * 读取插件包内资源。name 支持相对路径（如 'icon.png'、'css/style.css'、'lib/util.js'）。
         * 返回 base64 dataURL 字符串；找不到返回 null。
         */
        loadAsset(name) {
            if (!name) return null;
            const key = normPath(name).toLowerCase();
            if (assets[key]) return assets[key];
            // 模糊匹配：以文件名结尾
            const found = Object.keys(assets).find(k => k === key || k.endsWith('/' + key) || k.split('/').pop() === key);
            return found ? assets[found] : null;
        },
        /**
         * 读取资源文本（如 CSS / JS / HTML），自动剥离 dataURL 头。
         * 返回文本字符串；找不到返回 null。
         */
        loadAssetText(name) {
            const d = ctx.loadAsset(name);
            if (!d) return null;
            const m = /^data:[^;]+;base64,(.*)$/.exec(d);
            if (m) {
                try {
                    const bin = typeof atob !== 'undefined' ? atob(m[1]) : Buffer.from(m[1], 'base64').toString('binary');
                    return decodeURIComponent(escape(bin));
                } catch (e) { return null; }
            }
            return d; // 不是 base64，假定已是文本
        },
        /** 当前插件携带的资源路径列表 */
        get assetNames() { return Object.keys(assets); },

        /* ---------- 修改网页底层文件的能力 ---------- */
        /**
         * 覆盖 / 改写编辑器网页的底层文件。插件可借此替换 HTML 结构、注入 CSS、
         * 挂载脚本、替换图片资源，实现「底层文件级」改造。
         * @param {object} opt
         *   - html: string | {selector, html} | {selector, prepend, append}  改写 DOM 结构
         *   - css: string                      注入整段 CSS（作用域到 body）
         *   - js: string                       注入并执行一段脚本（run 在 DOM 就绪后）
         *   - images: {[selectorOrUrl]: dataUrl}  替换匹配元素的 src / 背景图
         *   - replaceUrl: {[oldUrl]: newUrl}   把页面里出现的某资源 URL 整体换掉
         * 所有副作用都会被自动回收（插件关闭时还原）。
         */
        fileOverride(opt) {
            opt = opt || {};
            const reverts = [];
            const snapshot = (el) => el ? el.outerHTML : null;

            // 1) HTML 结构改写
            if (opt.html) {
                const apply = (h) => {
                    if (typeof h === 'string') {
                        const host = root() || document.body;
                        const tmp = document.createElement('div');
                        tmp.innerHTML = h;
                        while (tmp.firstChild) host.appendChild(tmp.firstChild);
                        reverts.push(() => { /* 追加内容无法精确回滚，记录提示 */ });
                    } else if (h.selector) {
                        const el = document.querySelector(h.selector);
                        if (el) {
                            const before = el.innerHTML;
                            if (h.html != null) el.innerHTML = h.html;
                            if (h.prepend != null) el.insertAdjacentHTML('afterbegin', h.prepend);
                            if (h.append != null) el.insertAdjacentHTML('beforeend', h.append);
                            reverts.push(() => { el.innerHTML = before; });
                        }
                    }
                };
                Array.isArray(opt.html) ? opt.html.forEach(apply) : apply(opt.html);
            }

            // 2) 注入 CSS（整段，作用于 body）
            if (opt.css) {
                const s = document.createElement('style');
                s.setAttribute('data-ext-addon-override', addon.id);
                s.textContent = opt.css;
                document.head.appendChild(s);
                reverts.push(() => s.remove());
            }

            // 3) 注入并执行 JS
            if (opt.js) {
                const tag = document.createElement('script');
                tag.setAttribute('data-ext-addon-override', addon.id);
                tag.textContent = opt.js;
                document.head.appendChild(tag);
                reverts.push(() => tag.remove());
            }

            // 4) 替换图片资源（按选择器或按当前 src）
            if (opt.images && typeof opt.images === 'object') {
                for (const [selOrUrl, dataUrl] of Object.entries(opt.images)) {
                    if (!dataUrl) continue;
                    let targets = [];
                    if (selOrUrl.startsWith('http') || selOrUrl.startsWith('/') || selOrUrl.startsWith('.')) {
                        // 视为 URL 模糊匹配：选所有 src/style 含该串的元素
                        targets = [...document.querySelectorAll('img, [style], [src]')].filter(el => {
                            const src = el.getAttribute && el.getAttribute('src');
                            const style = el.getAttribute && el.getAttribute('style');
                            return (src && src.indexOf(selOrUrl) !== -1) || (style && style.indexOf(selOrUrl) !== -1);
                        });
                    } else {
                        targets = [...document.querySelectorAll(selOrUrl)];
                    }
                    targets.forEach(el => {
                        if (el.tagName === 'IMG') {
                            const old = el.getAttribute('src');
                            el.setAttribute('src', dataUrl);
                            reverts.push(() => old != null ? el.setAttribute('src', old) : el.removeAttribute('src'));
                        } else {
                            const oldStyle = el.getAttribute('style');
                            const newStyle = (oldStyle || '') + ';background-image:url(' + dataUrl + ') !important;';
                            el.setAttribute('style', newStyle);
                            reverts.push(() => oldStyle != null ? el.setAttribute('style', oldStyle) : el.removeAttribute('style'));
                        }
                    });
                }
            }

            // 5) 全局替换资源 URL
            if (opt.replaceUrl && typeof opt.replaceUrl === 'object') {
                const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT, null);
                const changed = [];
                let node;
                const applyMap = (attr) => {
                    const val = node.getAttribute(attr);
                    if (!val) return;
                    for (const [oldU, newU] of Object.entries(opt.replaceUrl)) {
                        if (val.indexOf(oldU) !== -1) {
                            const nv = val.split(oldU).join(newU);
                            node.setAttribute(attr, nv);
                            changed.push({node, attr, old: val});
                            break;
                        }
                    }
                };
                while ((node = walker.nextNode())) {
                    applyMap('src'); applyMap('href'); applyMap('style');
                }
                reverts.push(() => changed.forEach(c => c.node.setAttribute(c.attr, c.old)));
            }

            // 统一登记回收：插件关闭时还原所有底层文件改动
            registerDisposer(() => { for (const r of reverts) { try { r(); } catch (e) {} } });
            return () => { for (const r of reverts) { try { r(); } catch (e) {} } };
        },
        createElement(tag, props, children) {
            const el = document.createElement(tag);
            if (props) {
                for (const [k, v] of Object.entries(props)) {
                    if (v == null) continue;
                    if (k === 'className') el.className = v;
                    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
                    else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
                    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
                    else if (k === 'textContent') el.textContent = v;
                    else if (k === 'innerHTML') el.innerHTML = v;
                    else el.setAttribute(k, v);
                }
            }
            const kids = Array.isArray(children) ? children : (children == null ? [] : [children]);
            kids.forEach(c => {
                if (c == null) return;
                el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
            });
            return el;
        },
        injectCSS(css) {
            const s = document.createElement('style');
            s.setAttribute('data-ext-addon', addon.id);
            s.textContent = css || '';
            document.head.appendChild(s);
            registerDisposer(() => s.remove());
            return s;
        },
        addToolbarButton(label, onClick, opts) {
            opts = opts || {};
            const btn = ctx.createElement('button', {className: 'ext-plugin-btn', title: opts.title || label}, [label]);
            if (typeof onClick === 'function') btn.addEventListener('click', onClick);
            const mount = opts.container ? document.querySelector(opts.container) : document.querySelector('.ext-menu-bar-right');
            (mount || root()).appendChild(btn);
            registerDisposer(() => btn.remove());
            return btn;
        },
        mountPanel(opts) {
            opts = opts || {};
            const panel = ctx.createElement('div', {className: 'ext-plugin-panel' + (opts.className ? ' ' + opts.className : '')});
            if (opts.title) panel.appendChild(ctx.createElement('div', {className: 'ext-plugin-panel-title'}, [opts.title]));
            const body = ctx.createElement('div', {className: 'ext-plugin-panel-body'});
            panel.appendChild(body);
            const container = opts.container ? document.querySelector(opts.container) : document.querySelector('.ext-builder-main');
            (container || root()).appendChild(panel);
            registerDisposer(() => panel.remove());
            return {panel, body, remove: () => panel.remove()};
        },
        effect(disposer) { registerDisposer(disposer); },
        addEventListener(target, event, cb, opts) {
            target.addEventListener(event, cb, opts);
            registerDisposer(() => target.removeEventListener(event, cb, opts));
        }
    };
    return {ctx, disposers};
}

export async function applyExtAddons(ctx) {
    const run = async () => {
        const state = getAddonState();
        const cleanups = [];

        // 幂等：移除所有已注入的插件样式（可能来自上次 apply）
        document.querySelectorAll('style[data-ext-addon]').forEach(el => el.remove());

        for (const addon of getAllAddons()) {
            if (!state[addon.id]) continue;
            // 注入 CSS（剥离 :global() 包装——css-loader 伪语法，运行时注入需去掉）
            if (addon.css) {
                const style = document.createElement('style');
                style.setAttribute('data-ext-addon', addon.id);
                // :global(.foo) → .foo  （css-loader 编译时剥离，运行时 raw 注入必须手动去）
                style.textContent = addon.css.replace(/:global\(([^)]+)\)/g, '$1');
                document.head.appendChild(style);
                cleanups.push(() => { try { style.remove(); } catch (e) {} });
            }
            // 执行 setup（富 ctx）
            if (typeof addon.setup === 'function') {
                const {ctx: addonCtx, disposers} = makeAddonCtx(addon, ctx);
                try {
                    const cleanup = await addon.setup(addonCtx);
                    if (typeof cleanup === 'function') disposers.push(cleanup);
                } catch (e) {
                    console.error('[ExtAddons] 插件 ' + addon.id + ' 初始化失败:', e);
                }
                cleanups.push(() => disposers.forEach(d => { try { d(); } catch (e) {} }));
            }
        }

        return () => {
            cleanups.forEach(fn => { try { fn(); } catch (e) { /* silent */ } });
        };
    };

    // 排队：前一个 apply 完成后才执行本次，避免并发覆写
    const result = _applyQueue.then(run, run);
    _applyQueue = result.catch(() => {});
    return result;
}

/**
 * 子选项状态管理（用于有 options 的插件，如 developer-tools）
 * 键格式：extbuilder_opts_{addonId}
 */
const OPTS_STORAGE_PREFIX = 'extbuilder_opts_';

/**
 * 获取某插件的子选项状态
 * @param {string} addonId 插件 id
 * @param {Array} optionDefs 选项定义数组 [{id, default}]
 * @returns {Object} {optionId: boolean, ...}
 */
export function getAddonOptions(addonId, optionDefs) {
    const defaults = {};
    (optionDefs || []).forEach(o => { defaults[o.id] = !!o.default; });
    try {
        const saved = JSON.parse(localStorage.getItem(OPTS_STORAGE_PREFIX + addonId) || '{}');
        return {...defaults, ...saved};
    } catch (e) { return {...defaults}; }
}

/**
 * 保存某插件的子选项状态
 * @param {string} addonId 插件 id
 * @param {Object} opts {optionId: boolean, ...}
 */
export function setAddonOptions(addonId, opts) {
    try {
        localStorage.setItem(OPTS_STORAGE_PREFIX + addonId, JSON.stringify(opts));
    } catch (e) { /* silent */ }
}
