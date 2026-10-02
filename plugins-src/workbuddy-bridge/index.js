/**
 * workbuddy-bridge —— 编辑器侧面板
 * ================================================================
 *
 * 把 WorkBuddy 桥的状态（账号 / 模型 / 一键配置）做成设置面板里的
 * 一个浮动标签页，入口挂在左侧导航，行为与 deepseek-web-panel 一致：
 *
 *  - 入口按钮插进 React 管理的侧栏，MutationObserver 反复补挂；
 *  - 内容面板挂在 .ext-settings-panes 里，激活时让宿主内容让位；
 *  - 「一键配置模型」直接写 Nova 的 localStorage（AI_ASSISTANT_AGENTS），
 *    并派发 nova-storage-sync 让 Nova 立即重读，无需刷新。
 *
 * API 全部走同源 /workbuddy-ai/api（ext-plugin-runtime 的反向代理），
 * 避免 CORS；apiKey 对上游无意义（桥用本机登录态），Nova 里填占位即可。
 */

const API_BASE = '/workbuddy-ai/api';

const PANEL_ID = 'wb-bridge-panel';
const CSS_ID = 'wb-bridge-css';
const ENTRY_ID = 'wb-bridge-entry';
const PANE_CLS = 'wb-pane';
const EMBED_CLS = 'wb-embedded';

const SIDEBAR_SEL = '.ext-settings-sidebar';
const PANES_SEL = '.ext-settings-panes';
const TAB_SEL = '.ext-settings-tab';

/** Nova 的 Agent 存储（与 deepseek-web-panel 相同约定） */
const NOVA_AGENTS_KEY = 'AI_ASSISTANT_AGENTS';
const NOVA_CURRENT_AGENT_KEY = 'AI_ASSISTANT_CURRENT_AGENT_ID';
const NOVA_AGENT_NAME = 'WorkBuddy（多模型）';
/** Agent 的 baseUrl 指向本插件的同源反代，Nova 按 OpenAI 协议拼 /chat/completions */
const NOVA_AGENT_BASE_URL = '/workbuddy-ai/api/v1';

const S = {
    open: false,
    loading: false,
    msg: null,
    error: null,
    status: null,
    applying: false
};

let paneRoot = null;
let reloadTimer = null;

async function api(path, opts) {
    const o = opts || {};
    const init = {method: o.method || 'GET', headers: {}};
    if (o.body !== undefined) {
        init.headers['content-type'] = 'application/json';
        init.body = typeof o.body === 'string' ? o.body : JSON.stringify(o.body);
    }
    const res = await fetch(API_BASE + path, init);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    if (!res.ok) {
        const msg = (data && (data.error && data.error.message || data.error || data.message)) || ('HTTP ' + res.status);
        throw new Error(msg);
    }
    return data;
}

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}

function btn(label, cls, onClick) {
    const b = el('button', 'wb-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
}

function fmtTime(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '—';
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function fmtExp(ms) {
    if (!ms) return '长期';
    const days = Math.round((ms - Date.now()) / 86400000);
    if (days <= 0) return '已过期';
    return days + ' 天后';
}

function kv(k, v, cls) {
    const row = el('div', 'wb-kv');
    row.appendChild(el('span', 'wb-k', k));
    const val = el('span', 'wb-v' + (cls ? ' ' + cls : ''));
    val.textContent = v == null || v === '' ? '—' : String(v);
    row.appendChild(val);
    return row;
}

function card(title) {
    const c = el('div', 'wb-card');
    if (title) c.appendChild(el('div', 'wb-cardhead', title));
    return c;
}

function setMsg(kind, text) {
    S.msg = text ? {kind: kind, text: text} : null;
}

// ─────────────────── 一键配置到 AI 助手 ───────────────────
//
// 与 deepseek-web-panel 的 doApplyModelConfig 同构：写 Nova 的
// AI_ASSISTANT_AGENTS，复用/新建 baseUrl 指向本桥的 Agent，然后
// 派发 nova-storage-sync 让 Nova 立即重读。

function readJsonStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw == null || raw === '') return fallback;
        const v = JSON.parse(raw);
        return v == null ? fallback : v;
    } catch (e) {
        return fallback;
    }
}

function notifyNovaStorage(key) {
    try {
        window.dispatchEvent(new CustomEvent('nova-storage-sync', {detail: {key: key}}));
    } catch (e) { /* 忽略 */ }
}

async function doApplyModelConfig() {
    S.applying = true;
    setMsg('info', '正在把 WorkBuddy 模型写入 AI 助手配置…');
    repaint();
    try {
        let models = (S.status && S.status.models) || [];
        if (!models.length) {
            const r = await api('/models').catch(() => null);
            models = (r && r.models) || [];
        }
        if (!models.length) throw new Error('没取到模型列表——请先确认 WorkBuddy 桌面端已登录');

        const agents = readJsonStorage(NOVA_AGENTS_KEY, []);
        const list = Array.isArray(agents) ? agents.slice() : [];

        // 复用已有 Agent：以 baseUrl 为准（用户改过名字也不新建）
        let agent = list.find((a) => a && a.baseUrl === NOVA_AGENT_BASE_URL);
        if (!agent) {
            agent = {
                id: 'wbb' + Date.now(),
                provider: 'openai',
                baseUrl: NOVA_AGENT_BASE_URL,
                apiKey: 'via-bridge',
                name: NOVA_AGENT_NAME,
                models: []
            };
            list.push(agent);
        }

        const oldModels = Array.isArray(agent.models) ? agent.models : [];
        agent.provider = 'openai';
        agent.baseUrl = NOVA_AGENT_BASE_URL;
        agent.apiKey = agent.apiKey || 'via-bridge';
        agent.name = agent.name || NOVA_AGENT_NAME;
        // 沿用旧 model.id，避免进行中的会话因 id 变化找不到模型
        agent.models = models.map((m, i) => {
            const old = oldModels.find((o) => o && o.modelId === m.id) || oldModels[i];
            const mult = m.multiplier != null ? (m.multiplier === 0 ? '免费' : '×' + m.multiplier) : '';
            return {
                id: (old && old.id) || (agent.id + '-model-' + (i + 1)),
                name: (m.name || m.id) + (mult ? '（' + mult + '）' : ''),
                modelId: m.id
            };
        });

        localStorage.setItem(NOVA_AGENTS_KEY, JSON.stringify(list));
        notifyNovaStorage(NOVA_AGENTS_KEY);

        const prevCurrent = readJsonStorage(NOVA_CURRENT_AGENT_KEY, '');
        const current = typeof prevCurrent === 'string' ? prevCurrent : '';
        const stillValid = agent.models.some((m) => m.id === current);
        const nextCurrent = stillValid ? current : (agent.models[0] && agent.models[0].id);
        if (nextCurrent) {
            localStorage.setItem(NOVA_CURRENT_AGENT_KEY, JSON.stringify(nextCurrent));
            notifyNovaStorage(NOVA_CURRENT_AGENT_KEY);
        }

        setMsg('ok', '已配置 ' + agent.models.length + ' 个模型到 AI 助手（' + agent.name +
            '）。回到对话窗口，模型选择器里会出现它们；额度与 WorkBuddy 桌面端共用。');
    } catch (e) {
        setMsg('err', '配置失败：' + ((e && e.message) || e));
    }
    S.applying = false;
    repaint();
}

// ─────────────────── 渲染 ───────────────────

function renderMsgNode() {
    if (!S.msg) return null;
    return el('div', 'wb-msg show ' + S.msg.kind, S.msg.text);
}

function renderAccounts() {
    const c = card('账号（读自 WorkBuddy 桌面端登录态）');
    const st = S.status;
    if (!st) {
        c.appendChild(el('p', 'wb-hint', '状态未加载。'));
        return c;
    }
    c.appendChild(kv('可用账号', st.accountCount, st.accountCount > 0 ? 'wb-ok' : 'wb-bad'));
    const accounts = st.accounts || [];
    accounts.forEach((a) => {
        const row = el('div', 'wb-acct' + (a.cooling ? ' cooling' : ''));
        const main = el('div', 'wb-acct-main');
        const name = el('div', 'wb-acct-name');
        name.appendChild(document.createTextNode(a.nickname));
        if (!a.valid) name.appendChild(el('span', 'wb-tag red', '已过期'));
        else if (a.cooling) name.appendChild(el('span', 'wb-tag orange', '限流中'));
        else name.appendChild(el('span', 'wb-tag green', '可用'));
        main.appendChild(name);
        const meta = el('div', 'wb-acct-meta');
        meta.textContent = '登录有效期至 ' + fmtTime(a.expiresAt) + '（' + fmtExp(a.expiresAt) + '）';
        main.appendChild(meta);
        row.appendChild(main);
        c.appendChild(row);
    });
    if (!accounts.length) {
        c.appendChild(el('p', 'wb-hint',
            '没有读到账号。确认 WorkBuddy 桌面端已登录（CodeBuddyExtension auth 目录里有 .info 文件）。'));
    }
    return c;
}

function renderModels() {
    const c = card('模型（与 WorkBuddy 上游一致，倍率即积分消耗）');
    const models = (S.status && S.status.models) || [];
    const row = el('div', 'wb-row');
    row.style.marginBottom = '10px';
    const applyBtn = btn('一键配置到 AI 助手', 'primary', () => doApplyModelConfig());
    if (S.applying) applyBtn.disabled = true;
    row.appendChild(applyBtn);
    row.appendChild(btn('刷新', null, () => loadAll(true)));
    c.appendChild(row);
    if (!models.length) {
        c.appendChild(el('p', 'wb-hint', '未取到模型列表。'));
        return c;
    }
    const t = el('table', 'wb-models');
    const thead = el('thead');
    const hr = el('tr');
    ['模型 id', '名称', '倍率', '上下文'].forEach((h) => hr.appendChild(el('th', null, h)));
    thead.appendChild(hr);
    t.appendChild(thead);
    const tb = el('tbody');
    models.forEach((m) => {
        const tr = el('tr');
        tr.appendChild(el('td', 'wb-mono', m.id));
        tr.appendChild(el('td', null, m.name || '—'));
        tr.appendChild(el('td', null, m.multiplier === 0 ? '免费' : '×' + m.multiplier));
        tr.appendChild(el('td', null, m.contextWindow ? Math.round(m.contextWindow / 1024) + 'K' : '—'));
        tb.appendChild(tr);
    });
    t.appendChild(tb);
    c.appendChild(t);
    c.appendChild(el('p', 'wb-hint',
        '「一键配置」会在 AI 助手里新建（或复用）一个指向本桥的 Agent，模型随上游更新时点一次即可同步。'));
    return c;
}

function renderInto(host) {
    host.innerHTML = '';

    if (S.loading && !S.status) {
        host.appendChild(el('div', 'wb-loading', '正在连接 WorkBuddy 桥…'));
        return;
    }
    if (S.error && !S.status) {
        const box = el('div', 'wb-err');
        box.appendChild(el('div', null, '无法连接 WorkBuddy 桥（workbuddy-bridge 插件）'));
        const detail = el('div', null, S.error);
        detail.style.marginTop = '6px';
        box.appendChild(detail);
        const hint = el('div', null, '排查：插件管理里确认 workbuddy-bridge 已安装且运行中。');
        hint.style.marginTop = '8px';
        box.appendChild(hint);
        host.appendChild(box);
        const row = el('div', 'wb-row');
        row.appendChild(btn('重试', 'primary', () => loadAll(true)));
        host.appendChild(row);
        return;
    }

    const scroll = el('div', 'wb-scroll');
    host.appendChild(scroll);

    scroll.appendChild(el('h3', 'wb-title', 'WorkBuddy 模型桥'));
    scroll.appendChild(el('p', 'wb-sub',
        '把 WorkBuddy 桌面端的登录态桥给编辑器的 AI 助手：多账号轮询、SSE 流式、15 个模型' +
        '（DeepSeek / GLM / Kimi / MiniMax…），额度与 WorkBuddy 桌面端共用。'));

    const msgEl = renderMsgNode();
    if (msgEl) scroll.appendChild(msgEl);

    scroll.appendChild(renderAccounts());
    scroll.appendChild(renderModels());
}

// ─────────────────── 挂载（deepseek-web-panel 同款机制）───────────────────

const CSS_TEXT = `
.wb-pane{display:none!important;flex-direction:column;flex:1;min-height:0;padding:0!important;
  overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;
  font-size:13px;color:#202124;}
.ext-settings-panes.wb-embedded>.wb-pane{display:flex!important;}
.ext-settings-panes.wb-embedded>.ext-settings-tab-content:not(.wb-pane){display:none!important;}
.wb-entry-btn{white-space:nowrap;}
.wb-scroll{flex:1;overflow-y:auto;padding:20px 22px 28px;}
.wb-title{font-size:16px;font-weight:600;margin:0 0 4px;}
.wb-sub{font-size:12px;color:#80868b;margin:0 0 16px;line-height:1.6;}
.wb-card{border:1px solid #e8eaed;border-radius:8px;padding:14px 16px;margin-bottom:14px;background:#fff;}
.wb-cardhead{font-size:13px;font-weight:600;margin-bottom:10px;}
.wb-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.wb-kv{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px dashed #f1f3f4;}
.wb-kv:last-child{border-bottom:none;}
.wb-k{color:#5f6368;}
.wb-v{font-weight:500;text-align:right;word-break:break-all;}
.wb-ok{color:#137333;}
.wb-bad{color:#c5221f;}
.wb-btn{border:1px solid #dadce0;background:#fff;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;color:#202124;}
.wb-btn:hover:not(:disabled){background:#f8f9fa;border-color:#c6cace;}
.wb-btn:disabled{opacity:.5;cursor:not-allowed;}
.wb-btn.primary{background:#1a73e8;border-color:#1a73e8;color:#fff;}
.wb-btn.primary:hover:not(:disabled){background:#1765cc;}
.wb-acct{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e8eaed;border-radius:8px;margin-bottom:8px;}
.wb-acct.cooling{background:#fff8f0;border-color:#fde3c0;}
.wb-acct-main{flex:1;min-width:160px;}
.wb-acct-name{font-weight:600;font-size:13px;}
.wb-acct-meta{font-size:11px;color:#80868b;margin-top:3px;}
.wb-tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:9px;margin-left:6px;vertical-align:middle;}
.wb-tag.green{background:#e6f4ea;color:#137333;}
.wb-tag.red{background:#fce8e6;color:#c5221f;}
.wb-tag.orange{background:#fef3e0;color:#b06000;}
.wb-models{width:100%;border-collapse:collapse;font-size:12px;}
.wb-models th{text-align:left;color:#5f6368;font-weight:500;padding:6px 8px;border-bottom:1px solid #e8eaed;}
.wb-models td{padding:7px 8px;border-bottom:1px solid #f1f3f4;}
.wb-mono{font-family:Consolas,Monaco,monospace;font-size:11px;}
.wb-msg{font-size:12px;padding:8px 10px;border-radius:6px;margin:8px 0;display:none;line-height:1.6;}
.wb-msg.show{display:block;}
.wb-msg.info{background:#e8f0fe;color:#174ea6;}
.wb-msg.ok{background:#e6f4ea;color:#0d652d;}
.wb-msg.err{background:#fce8e6;color:#a50e0e;}
.wb-hint{font-size:11px;color:#80868b;line-height:1.6;margin:6px 0 0;}
.wb-loading{padding:40px 0;text-align:center;color:#80868b;font-size:12px;}
.wb-err{margin:16px 0;padding:12px 14px;background:#fce8e6;color:#a50e0e;border-radius:8px;font-size:12px;line-height:1.7;}
`;

function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    const s = document.createElement('style');
    s.id = CSS_ID;
    s.setAttribute('data-ext-addon', 'bilup-nova');
    s.textContent = CSS_TEXT;
    document.head.appendChild(s);
}

let entryObserver = null;

function markEntryActive(on) {
    const b = document.getElementById(ENTRY_ID);
    if (!b) return;
    if (on) b.classList.add('active');
    else b.classList.remove('active');
}

function buildEntry() {
    const bar = document.querySelector(SIDEBAR_SEL);
    if (!bar) return;
    if (document.getElementById(ENTRY_ID)) return;

    const tpl = bar.querySelector(TAB_SEL);
    const tabCls = tpl ? tpl.className : 'ext-settings-tab';

    const b = el('button', tabCls + ' wb-entry-btn');
    b.id = ENTRY_ID;
    b.type = 'button';
    b.title = 'WorkBuddy 模型桥（账号 / 模型 / 一键配置 AI 助手）';

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    [
        ['rect', {x: 4, y: 4, width: 16, height: 16, rx: 3}],
        ['path', {d: 'M9 4v16'}],
        ['path', {d: 'M4 9h16'}],
        ['circle', {cx: 15.5, cy: 14.5, r: 2.5}]
    ].forEach((pair) => {
        const child = document.createElementNS(ns, pair[0]);
        Object.keys(pair[1]).forEach((k) => child.setAttribute(k, String(pair[1][k])));
        svg.appendChild(child);
    });

    b.appendChild(svg);
    b.appendChild(el('span', null, 'WorkBuddy'));
    b.addEventListener('click', (e) => { e.stopPropagation(); openEmbed(); });
    bar.appendChild(b);
    markEntryActive(S.open);
}

function ensurePane() {
    const panes = document.querySelector(PANES_SEL);
    if (!panes) { paneRoot = null; return null; }
    let p = panes.querySelector('.' + PANE_CLS);
    if (!p) {
        p = el('div', 'ext-settings-tab-content ' + PANE_CLS);
        p.id = PANEL_ID;
        panes.appendChild(p);
    }
    paneRoot = p;
    return p;
}

function applyEmbed() {
    const panes = document.querySelector(PANES_SEL);
    if (!panes) { paneRoot = null; return; }
    const p = ensurePane();
    if (!p) return;
    if (S.open) panes.classList.add(EMBED_CLS);
    else panes.classList.remove(EMBED_CLS);
    markEntryActive(S.open);
    if (S.open && !p.firstChild) renderInto(p);
}

function openEmbed() {
    ensureCss();
    S.open = true;
    applyEmbed();
    if (!S.status && !S.loading) loadAll(true);
}

function closeEmbed() {
    S.open = false;
    applyEmbed();
}

function bindTabInterception() {
    document.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || !t.closest) return;
        const item = t.closest(TAB_SEL);
        if (!item) return;
        if (item.id === ENTRY_ID) return;
        if (S.open) closeEmbed();
    }, true);
}

function watchSettingsPanel() {
    if (entryObserver) return;
    entryObserver = new MutationObserver(() => {
        if (!document.querySelector(SIDEBAR_SEL)) {
            S.open = false;
            const stale = document.getElementById(ENTRY_ID);
            if (stale && stale.parentElement) stale.parentElement.removeChild(stale);
            if (paneRoot && paneRoot.parentElement) paneRoot.parentElement.removeChild(paneRoot);
            paneRoot = null;
            return;
        }
        buildEntry();
        applyEmbed();
    });
    entryObserver.observe(document.body, {childList: true, subtree: true});
}

function scheduleReload() {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => { loadAll(false); }, 1200);
}

async function loadAll(showLoading) {
    if (showLoading) {
        S.loading = true;
        S.error = null;
        repaint();
    }
    try {
        S.status = await api('/status');
        S.error = null;
    } catch (e) {
        S.error = String((e && e.message) || e);
    } finally {
        S.loading = false;
        repaint();
    }
}

function repaint() {
    if (!paneRoot || !S.open) return;
    renderInto(paneRoot);
}

function initWorkbuddyBridge() {
    ensureCss();
    buildEntry();
    watchSettingsPanel();
    bindTabInterception();
    return function dispose() {
        if (entryObserver) { try { entryObserver.disconnect(); } catch (e) { /* ignore */ } entryObserver = null; }
        if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }
        const entry = document.getElementById(ENTRY_ID);
        if (entry && entry.parentElement) entry.parentElement.removeChild(entry);
        if (paneRoot && paneRoot.parentElement) paneRoot.parentElement.removeChild(paneRoot);
        paneRoot = null;
        const css = document.getElementById(CSS_ID);
        if (css) css.remove();
        S.open = false;
    };
}

module.exports = {
    id: 'workbuddy-bridge',
    name: 'WorkBuddy 模型桥',
    description: '把 WorkBuddy 桌面端登录态桥给编辑器 AI 助手：多账号轮询、SSE 流式、15 个模型（DeepSeek/GLM/Kimi/MiniMax），额度共用。一键配置到 AI 助手。',
    category: 'AI',
    setup: function () {
        return initWorkbuddyBridge();
    }
};