/**
 * DeepSeek 网页版（dsh-deepseek-web-vision）独立浮动窗
 * ================================================================
 * dsh-deepseek-web-vision 是跑在 DSH Node 侧的 cordis 插件：浏览器登录态捕获、
 * 账号库、PoW 求解、图片上传与识图轮询全在那一侧；对外只挂 HTTP API
 * （前缀 /deepseek-web-vision/api）。本模块把它的完整管理界面做成编辑器里的
 * 一个独立浮动窗（自带最小化 / 最大化 / 关闭，可拖动可拉伸），入口在顶部
 * 菜单栏右侧 —— 不再嵌进 Bilup Nova 的 AI 设置面板，两者互不干扰。
 *
 * 跨源：插件响应不带 Access-Control-Allow-Origin，OPTIONS 预检 404，浏览器从
 * 8601 直连 3080 读不到响应。已在 webpack.config.js 的 devServer.before 里加
 * 同源反向代理，故这里只请求同源 /deepseek-web-vision/api。
 *
 * DOM 注入稳健性：入口按钮插进 React 管理的顶部菜单栏，重渲染可能删除 →
 * MutationObserver 补挂；窗口自身挂在 body 下，不进入 React 子树。
 */

const API_BASE = '/deepseek-web-vision/api';

const PANEL_ID = 'dsw-vision-panel';
const CSS_ID = 'dsw-vision-css';

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
        const msg = (data && (data.error || data.message)) || ('HTTP ' + res.status);
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }
    if (data == null) throw new Error('响应不是 JSON：' + text.slice(0, 120));
    return data;
}

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}

function btn(label, cls, onClick) {
    const b = el('button', 'dsw-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
}

function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function fmtMs(ms) {
    const n = Number(ms);
    if (!isFinite(n)) return '—';
    return n < 1000 ? n + ' ms' : (n / 1000).toFixed(1) + ' s';
}

function kv(k, v, cls) {
    const row = el('div', 'dsw-kv');
    row.appendChild(el('span', 'dsw-k', k));
    const val = el('span', 'dsw-v' + (cls ? ' ' + cls : ''));
    val.textContent = v == null || v === '' ? '—' : String(v);
    row.appendChild(val);
    return row;
}

function card(title) {
    const c = el('div', 'dsw-card');
    if (title) c.appendChild(el('div', 'dsw-cardhead', title));
    return c;
}

const CSS_TEXT = `
/* ---- 内嵌面板：作为设置面板右侧的一个标签页 ---- */
/* 默认隐藏，只有 .ext-settings-panes 带 .dsw-embedded 时才顶上 */
.dsw-pane{display:none!important;flex-direction:column;flex:1;min-height:0;padding:0!important;
  overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;
  font-size:13px;color:#202124;}
.ext-settings-panes.dsw-embedded>.dsw-pane{display:flex!important;}
/* 我们的面板激活时，宿主自己的标签页内容让位 */
.ext-settings-panes.dsw-embedded>.ext-settings-tab-content:not(.dsw-pane){display:none!important;}
/* 设置面板左侧导航里的入口按钮：沿用宿主的 .ext-settings-tab 类，
   只补一条避免长文案换行（选中态直接复用宿主的 .active 样式）。 */
.dsw-entry-btn{white-space:nowrap;}
.dsw-scroll{flex:1;overflow-y:auto;padding:20px 22px 28px;}
.dsw-title{font-size:16px;font-weight:600;margin:0 0 4px;}
.dsw-sub{font-size:12px;color:#80868b;margin:0 0 16px;line-height:1.6;}
.dsw-card{border:1px solid #e8eaed;border-radius:8px;padding:14px 16px;margin-bottom:14px;background:#fff;}
.dsw-cardhead{font-size:13px;font-weight:600;margin-bottom:10px;}
.dsw-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.dsw-kv{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px dashed #f1f3f4;}
.dsw-kv:last-child{border-bottom:none;}
.dsw-k{color:#5f6368;}
.dsw-v{font-weight:500;text-align:right;word-break:break-all;}
.dsw-ok{color:#137333;}
.dsw-bad{color:#c5221f;}
.dsw-warn{color:#b06000;}
.dsw-btn{border:1px solid #dadce0;background:#fff;border-radius:6px;padding:6px 12px;font-size:12px;
  cursor:pointer;color:#202124;}
.dsw-btn:hover:not(:disabled){background:#f8f9fa;border-color:#c6cace;}
.dsw-btn:disabled{opacity:.5;cursor:not-allowed;}
.dsw-btn.primary{background:#1a73e8;border-color:#1a73e8;color:#fff;}
.dsw-btn.primary:hover:not(:disabled){background:#1765cc;}
.dsw-btn.danger{color:#c5221f;border-color:#f0c4c2;}
.dsw-btn.danger:hover:not(:disabled){background:#fce8e6;}
.dsw-btn.armed{background:#c5221f;border-color:#c5221f;color:#fff;}
.dsw-input{width:100%;box-sizing:border-box;border:1px solid #dadce0;border-radius:6px;
  padding:6px 8px;font-size:12px;font-family:inherit;background:#fff;color:#202124;}
.dsw-input:focus{outline:none;border-color:#1a73e8;}
.dsw-field{margin-bottom:10px;}
.dsw-label{display:block;font-size:11px;color:#5f6368;margin-bottom:4px;}
.dsw-hint{font-size:11px;color:#80868b;line-height:1.6;margin:6px 0 0;}
.dsw-code{display:block;background:#f1f3f4;border-radius:4px;padding:6px 8px;font-size:11px;
  font-family:Consolas,Monaco,monospace;word-break:break-all;margin:6px 0;}
.dsw-acct{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e8eaed;
  border-radius:8px;margin-bottom:8px;flex-wrap:wrap;}
.dsw-acct.active{border-color:#1a73e8;background:#f8fbff;}
.dsw-acct-main{flex:1;min-width:170px;}
.dsw-acct-name{font-weight:600;font-size:13px;}
.dsw-acct-meta{font-size:11px;color:#80868b;margin-top:3px;line-height:1.5;}
.dsw-tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:9px;background:#e8f0fe;
  color:#1a73e8;margin-left:6px;vertical-align:middle;}
.dsw-tag.grey{background:#f1f3f4;color:#5f6368;}
.dsw-tag.red{background:#fce8e6;color:#c5221f;}
.dsw-tag.green{background:#e6f4ea;color:#137333;}
.dsw-msg{font-size:12px;padding:8px 10px;border-radius:6px;margin:8px 0;display:none;line-height:1.6;}
.dsw-msg.show{display:block;}
.dsw-msg.info{background:#e8f0fe;color:#174ea6;}
.dsw-msg.ok{background:#e6f4ea;color:#0d652d;}
.dsw-msg.err{background:#fce8e6;color:#a50e0e;}
.dsw-models{width:100%;border-collapse:collapse;font-size:12px;}
.dsw-models th{text-align:left;color:#5f6368;font-weight:500;padding:6px 8px;border-bottom:1px solid #e8eaed;}
.dsw-models td{padding:7px 8px;border-bottom:1px solid #f1f3f4;vertical-align:top;}
.dsw-models tr:last-child td{border-bottom:none;}
.dsw-mono{font-family:Consolas,Monaco,monospace;font-size:11px;}
.dsw-loading{padding:40px 0;text-align:center;color:#80868b;font-size:12px;}
.dsw-err{margin:16px 0;padding:12px 14px;background:#fce8e6;color:#a50e0e;border-radius:8px;
  font-size:12px;line-height:1.7;word-break:break-all;}
`;

function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    const s = document.createElement('style');
    s.id = CSS_ID;
    s.setAttribute('data-ext-addon', 'bilup-nova');
    s.textContent = CSS_TEXT;
    document.head.appendChild(s);
}

const S = {
    open: false,
    loading: false,
    msg: null,
    error: null,
    status: null,
    gate: null,
    accounts: null,
    transport: null,
    contextMode: null,
    ledger: null,
    labelEditingId: null,
    removeArmedId: null,
    tokenDraft: '',
};

/** 内嵌面板的内容容器（挂在设置面板右侧 .ext-settings-panes 里）。 */
let paneRoot = null;
let reloadTimer = null;
function setMsg(kind, text) {
    S.msg = text ? {kind: kind, text: text} : null;
}

function repaint() {
    if (!paneRoot || !S.open) return;
    renderInto(paneRoot);
}

function renderMsgNode() {
    if (!S.msg) return null;
    return el('div', 'dsw-msg show ' + S.msg.kind, S.msg.text);
}

function renderAccounts() {
    const c = card('账号库');
    const acc = S.accounts;
    if (!acc || !acc.accounts) {
        c.appendChild(el('p', 'dsw-hint', '账号信息不可用。'));
        return c;
    }
    const row = el('div', 'dsw-row');
    row.style.marginBottom = '10px';
    row.appendChild(btn('添加账号', 'primary', () => doAddAccount()));
    row.appendChild(btn('刷新校验状态', null, () => doRefreshAccounts()));
    row.appendChild(btn('导出备份', null, () => doExportAccounts()));
    row.appendChild(btn('导入备份', null, () => doImportAccounts()));
    c.appendChild(row);

    if (!acc.accounts.length) {
        c.appendChild(el('p', 'dsw-hint', '账号库为空。点「添加账号」用浏览器登录一次即可入库。'));
        return c;
    }

    acc.accounts.forEach((a) => {
        const box = el('div', 'dsw-acct' + (a.isActive ? ' active' : ''));
        const main = el('div', 'dsw-acct-main');
        const nameRow = el('div', 'dsw-acct-name');
        nameRow.appendChild(document.createTextNode(a.title || a.display || a.id));
        if (a.isActive) nameRow.appendChild(el('span', 'dsw-tag', '当前'));
        if (a.unverified) nameRow.appendChild(el('span', 'dsw-tag red', '未校验'));
        else if (a.lastVerifyError) nameRow.appendChild(el('span', 'dsw-tag red', '失效'));
        else nameRow.appendChild(el('span', 'dsw-tag green', '正常'));
        if (a.label) nameRow.appendChild(el('span', 'dsw-tag grey', a.label));
        main.appendChild(nameRow);
        const meta = el('div', 'dsw-acct-meta');
        meta.textContent = '捕获 ' + fmtTime(a.capturedAt) + ' · 校验 ' + fmtTime(a.lastVerifiedAt);
        main.appendChild(meta);
        box.appendChild(main);

        const acts = el('div', 'dsw-row');
        if (!a.isActive) {
            acts.appendChild(btn('切换', null, () => doSwitchAccount(a.id)));
        }
        acts.appendChild(btn('重登', null, () => doRelogin(a.id)));
        acts.appendChild(btn('备注', null, () => {
            S.labelEditingId = S.labelEditingId === a.id ? null : a.id;
            repaint();
        }));
        acts.appendChild(btn(S.removeArmedId === a.id ? '确认移除' : '移除',
            S.removeArmedId === a.id ? 'armed' : 'danger',
            () => doRemoveAccount(a.id)));
        box.appendChild(acts);

        if (S.labelEditingId === a.id) {
            const editRow = el('div', 'dsw-row');
            editRow.style.width = '100%';
            editRow.style.marginTop = '6px';
            const input = el('input', 'dsw-input');
            input.value = a.label || '';
            input.placeholder = '备注名，如「工作号」';
            input.style.flex = '1';
            input.style.minWidth = '140px';
            editRow.appendChild(input);
            editRow.appendChild(btn('保存', 'primary', () => doRenameAccount(a.id, input.value)));
            box.appendChild(editRow);
        }

        c.appendChild(box);
    });

    if (acc.footprint) {
        c.appendChild(el('p', 'dsw-hint',
            '账号库占用 ' + acc.footprint.count + ' 个文件 / ' +
            Math.round(acc.footprint.bytes / 1024 * 10) / 10 + ' KB'));
    }
    return c;
}

// ─────────────────── 一键配置模型到 AI 助手 ───────────────────
//
// 背景：以前要手动进「AI 设置 → 模型」，新建 Agent、填 provider=openai、
// baseUrl=/deepseek-web-vision/api、apiKey=via-proxy，再逐条抄模型 id。登录
// 账号后这一串步骤完全没有信息量，纯手工搬砖，且很容易抄错。
//
// 现在只要账号登录成功（凭证校验通过），点一次「一键配置模型」：
//   1. 读本插件的真实模型列表（S.status.models，含思考/上下文信息）
//   2. 复用或新建 baseUrl 指向本插件的 Agent，把模型列表整体写进去
//   3. 把 current agent 指到该 Agent 的第一个模型（用户已选则不覆盖）
//   4. 派发 nova-storage-sync，让 Nova 的 useLocalStorage 立刻重读
//      （见 nova-patch.js 里给 wg 注入的监听），无需刷新页面。

const NOVA_AGENTS_KEY = 'AI_ASSISTANT_AGENTS';
const NOVA_CURRENT_AGENT_KEY = 'AI_ASSISTANT_CURRENT_AGENT_ID';
const NOVA_AGENT_NAME = 'DeepSeek 网页版';
/** Agent 的 baseUrl 指向本插件的同源反向代理（见 webpack.config.js devServer.before）。 */
const NOVA_AGENT_BASE_URL = '/deepseek-web-vision/api';

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

/** 通知 Nova 重读某个 localStorage key（nova-patch.js 在 wg 里挂了该事件）。 */
function notifyNovaStorage(key) {
    try {
        window.dispatchEvent(new CustomEvent('nova-storage-sync', {detail: {key: key}}));
    } catch (e) { /* 老浏览器不支持 CustomEvent 构造时忽略 */ }
}

async function doApplyModelConfig() {
    setMsg('info', '正在把网页版模型写入 AI 助手配置…');
    repaint();
    try {
        let models = (S.status && S.status.models) || [];
        if (!models.length) {
            // 面板数据可能还没加载完，单独补一次
            const r = await api('/models', {method: 'POST', body: {}}).catch(() => null);
            models = (r && r.models) || [];
        }
        models = models.filter((m) => m && m.id);
        if (!models.length) {
            throw new Error('没取到模型列表——请先确认「登录状态」为已登录，再点「刷新」重试');
        }

        const agents = readJsonStorage(NOVA_AGENTS_KEY, []);
        const list = Array.isArray(agents) ? agents.slice() : [];

        // 复用已有 Agent：以 baseUrl 为准（用户可能改过名字，不该因此新建一个）
        let agent = list.find((a) => a && a.baseUrl === NOVA_AGENT_BASE_URL);
        if (!agent) {
            agent = {
                id: 'dsw' + Date.now(),
                provider: 'openai',
                baseUrl: NOVA_AGENT_BASE_URL,
                apiKey: 'via-proxy',
                name: NOVA_AGENT_NAME,
                models: []
            };
            list.push(agent);
        }

        const oldModels = Array.isArray(agent.models) ? agent.models : [];
        agent.provider = 'openai';
        agent.baseUrl = NOVA_AGENT_BASE_URL;
        agent.apiKey = agent.apiKey || 'via-proxy';
        agent.name = agent.name || NOVA_AGENT_NAME;
        // 尽量沿用旧的 model.id，避免已在进行的会话因 id 变化而找不到模型
        agent.models = models.map((m, i) => {
            const old = oldModels.find((o) => o && o.modelId === m.id) || oldModels[i];
            return {
                id: (old && old.id) || (agent.id + '-model-' + (i + 1)),
                name: m.name || m.id,
                modelId: m.id
            };
        });

        localStorage.setItem(NOVA_AGENTS_KEY, JSON.stringify(list));
        notifyNovaStorage(NOVA_AGENTS_KEY);

        // 当前选中模型：用户已经选在这个 Agent 的某个模型上就保持不动
        const prevCurrent = readJsonStorage(NOVA_CURRENT_AGENT_KEY, '');
        const current = typeof prevCurrent === 'string' ? prevCurrent : '';
        const stillValid = agent.models.some((m) => m.id === current);
        const nextCurrent = stillValid ? current : (agent.models[0] && agent.models[0].id);
        if (nextCurrent) {
            localStorage.setItem(NOVA_CURRENT_AGENT_KEY, JSON.stringify(nextCurrent));
            notifyNovaStorage(NOVA_CURRENT_AGENT_KEY);
        }

        setMsg('ok', '已配置 ' + agent.models.length + ' 个模型到 AI 助手（' + agent.name +
            '）。回到对话窗口，模型选择器里会直接出现它们。');
    } catch (e) {
        setMsg('err', '配置失败：' + ((e && e.message) || e));
    }
    repaint();
}

function renderModels() {
    const c = card('可用模型');
    const models = (S.status && S.status.models) || [];
    const row = el('div', 'dsw-row');
    row.style.marginBottom = '10px';
    row.appendChild(btn('一键配置模型到 AI 助手', 'primary', () => doApplyModelConfig()));
    row.appendChild(btn('刷新模型列表', null, () => loadAll(true)));
    c.appendChild(row);
    if (!models.length) {
        c.appendChild(el('p', 'dsw-hint',
            '未取到模型列表。确认账号已登录后点上面「刷新模型列表」。'));
        return c;
    }
    const t = el('table', 'dsw-models');
    const thead = el('thead');
    const hr = el('tr');
    ['模型 id', '名称', '思考', '上下文', '说明'].forEach((h) => hr.appendChild(el('th', null, h)));
    thead.appendChild(hr);
    t.appendChild(thead);
    const tb = el('tbody');
    models.forEach((m) => {
        const tr = el('tr');
        tr.appendChild(el('td', 'dsw-mono', m.id));
        tr.appendChild(el('td', null, m.name || '—'));
        tr.appendChild(el('td', null, m.thinking ? '开' : '关'));
        tr.appendChild(el('td', null, m.contextWindow ? Math.round(m.contextWindow / 1024) + 'K' : '—'));
        tr.appendChild(el('td', null, m.description || ''));
        tb.appendChild(tr);
    });
    t.appendChild(tb);
    c.appendChild(t);
    c.appendChild(el('p', 'dsw-hint',
        '在模型选择器里把 provider 切到 deepseek-web-vision 即可用这两个模型；' +
        'Agent 的工具调用走插件的提示词协议。'));
    return c;
}

function makeNumberField(label, value, bounds, onCommit) {
    const wrap = el('div', 'dsw-field');
    wrap.style.flex = '1';
    wrap.style.minWidth = '150px';
    wrap.appendChild(el('label', 'dsw-label', label +
        (bounds ? '（' + bounds.min + '~' + bounds.max + '）' : '')));
    const row = el('div', 'dsw-row');
    const input = el('input', 'dsw-input');
    input.type = 'number';
    input.value = value == null ? '' : String(value);
    if (bounds) {
        input.min = String(bounds.min);
        input.max = String(bounds.max);
    }
    input.style.flex = '1';
    input.style.minWidth = '80px';
    row.appendChild(input);
    row.appendChild(btn('保存', null, () => {
        const v = parseInt(input.value, 10);
        if (!isFinite(v)) { setMsg('err', '请输入数字'); repaint(); return; }
        onCommit(v);
    }));
    wrap.appendChild(row);
    return wrap;
}

function renderGate() {
    const c = card('防风控节流');
    const g = S.gate;
    if (!g) {
        c.appendChild(el('p', 'dsw-hint', '防风控配置不可用。'));
        return c;
    }
    c.appendChild(kv('会话清理模式', g.sessionCleanup || '—'));
    c.appendChild(kv('单会话最长轮次', g.longRunThreshold != null ? g.longRunThreshold : '—'));
    c.appendChild(kv('请求间隔', fmtMs(g.minRequestIntervalMs) + ' ~ ' + fmtMs(g.maxRequestIntervalMs)));
    c.appendChild(kv('单次请求上限字符', g.maxPromptChars));
    c.appendChild(kv('ref_file_ids 硬上限', g.maxRefImages));
    c.appendChild(kv('附带历史图片数', g.keepHistoryImages));
    c.appendChild(kv('并发请求', g.allowConcurrent ? '允许' : '禁止'));

    const row = el('div', 'dsw-row');
    row.style.marginTop = '10px';
    row.appendChild(btn('间隔 1.5~2.5s（快）', null,
        () => doSaveGate({minRequestIntervalMs: 1500, maxRequestIntervalMs: 2500})));
    row.appendChild(btn('间隔 2~4s（默认）', null,
        () => doSaveGate({minRequestIntervalMs: 2000, maxRequestIntervalMs: 4000})));
    row.appendChild(btn('间隔 5~9s（稳）', null,
        () => doSaveGate({minRequestIntervalMs: 5000, maxRequestIntervalMs: 9000})));
    c.appendChild(row);

    const ieRow = el('div', 'dsw-row');
    ieRow.style.marginTop = '8px';
    ieRow.appendChild(makeNumberField('附带历史图片数', g.keepHistoryImages,
        g.keepHistoryImagesBounds, (v) => doSaveGate({keepHistoryImages: v})));
    ieRow.appendChild(makeNumberField('ref_file_ids 上限', g.maxRefImages,
        g.maxRefImagesBounds, (v) => doSaveGate({maxRefImages: v})));
    c.appendChild(ieRow);
    c.appendChild(el('p', 'dsw-hint',
        '附带历史图片数 = 0 时只发本轮图片（默认，最省额度也最像真人）；' +
        '想接着问刚才那张图可设为 1~2。'));
    return c;
}

function renderTransport() {
    const c = card('网络栈');
    const t = S.transport;
    if (!t) {
        c.appendChild(el('p', 'dsw-hint', '网络栈配置不可用。'));
        return c;
    }
    c.appendChild(kv('期望', t.requested || '—'));
    c.appendChild(kv('实际生效', t.effective || '—', t.degraded ? 'dsw-warn' : 'dsw-ok'));
    c.appendChild(kv('Chromium 可用', t.chromiumAvailable ? '是' : '否',
        t.chromiumAvailable ? 'dsw-ok' : 'dsw-warn'));
    if (t.hint) c.appendChild(el('p', 'dsw-hint', t.hint));
    const row = el('div', 'dsw-row');
    row.style.marginTop = '10px';
    row.appendChild(btn('用 Node', null, () => doSaveTransport('node')));
    row.appendChild(btn('用 Chromium', null, () => doSaveTransport('chromium')));
    c.appendChild(row);
    return c;
}

function renderContextMode() {
    const c = card('上下文投喂');
    const m = S.contextMode;
    if (!m) {
        c.appendChild(el('p', 'dsw-hint', '上下文模式不可用。'));
        return c;
    }
    c.appendChild(kv('当前模式', m.mode === 'chained' ? '链式投喂' : '每轮全量'));
    if (m.hint) c.appendChild(el('p', 'dsw-hint', m.hint));
    const row = el('div', 'dsw-row');
    row.style.marginTop = '10px';
    row.appendChild(btn('每轮全量（最稳）', m.mode !== 'full' ? 'primary' : null,
        () => doSaveContextMode('full')));
    row.appendChild(btn('链式投喂（省额度）', m.mode !== 'chained' ? 'primary' : null,
        () => doSaveContextMode('chained')));
    c.appendChild(row);
    return c;
}

function renderLedger() {
    const c = card('用量台账（近 24 小时）');
    const l = S.ledger;
    if (!l) {
        c.appendChild(el('p', 'dsw-hint', '用量数据不可用。'));
        return c;
    }
    c.appendChild(kv('调用次数', l.calls));
    c.appendChild(kv('成功', l.succeeded, 'dsw-ok'));
    c.appendChild(kv('失败', l.failed, l.failed ? 'dsw-bad' : ''));
    if (l.failures) {
        Object.keys(l.failures).forEach((k) => {
            if (l.failures[k]) c.appendChild(kv('· ' + k, l.failures[k]));
        });
    }
    if (l.gaps) {
        c.appendChild(kv('请求间隔 P50', fmtMs(l.gaps.p50)));
        c.appendChild(kv('请求间隔 P90', fmtMs(l.gaps.p90)));
    }
    if (l.hourly && l.hourly.length) {
        const max = Math.max.apply(null, l.hourly.concat([1]));
        const chart = el('div', 'dsw-row');
        chart.style.alignItems = 'flex-end';
        chart.style.height = '44px';
        chart.style.gap = '2px';
        chart.style.marginTop = '8px';
        l.hourly.forEach((v, i) => {
            const bar = el('div');
            bar.style.width = '6px';
            bar.style.height = Math.max(2, Math.round(v / max * 40)) + 'px';
            bar.style.background = v ? '#1a73e8' : '#e8eaed';
            bar.style.borderRadius = '2px';
            bar.title = (l.hourly.length - 1 - i) + ' 小时前：' + v + ' 次';
            chart.appendChild(bar);
        });
        c.appendChild(chart);
    }
    return c;
}

function renderToken() {
    const c = card('手动粘贴 Token（可选路径）');
    c.appendChild(el('p', 'dsw-hint',
        '在浏览器打开 chat.deepseek.com 并登录 → F12 控制台执行下面一行 → 把结果粘贴到输入框：'));
    c.appendChild(el('code', 'dsw-code', "JSON.parse(localStorage.getItem('userToken')).value"));
    c.appendChild(el('p', 'dsw-hint',
        '新版网页端 token 存在 {"value": …} 包装里；若上面那行报错，改成 localStorage.getItem(\'userToken\') ' +
        '直接复制整串，插件会自动解包。'));
    const ta = el('textarea', 'dsw-input');
    ta.rows = 3;
    ta.placeholder = '粘贴 token（JSON 包装或裸 token 都行；可选：下一行粘 Cookie）';
    ta.value = S.tokenDraft || '';
    ta.addEventListener('input', () => { S.tokenDraft = ta.value; });
    ta.style.marginTop = '6px';
    c.appendChild(ta);
    const row = el('div', 'dsw-row');
    row.style.marginTop = '8px';
    row.appendChild(btn('保存并校验', 'primary', () => doSaveToken()));
    c.appendChild(row);
    return c;
}

// ─────────────────────────── 操作 ───────────────────────────

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
        const results = await Promise.all([
            api('/'),
            api('/gate').catch(() => null),
            api('/accounts').catch(() => null),
            api('/transport').catch(() => null),
            api('/context-mode').catch(() => null),
            api('/ledger?hours=24').catch(() => null),
        ]);
        S.status = results[0];
        S.gate = results[1];
        S.accounts = results[2];
        S.transport = results[3];
        S.contextMode = results[4];
        S.ledger = results[5];
        S.error = null;
    } catch (e) {
        S.error = String((e && e.message) || e);
    } finally {
        S.loading = false;
        repaint();
    }
}

async function doTest() {
    setMsg('info', '正在测试连通…');
    repaint();
    try {
        const r = await api('/test', {method: 'POST', body: {}});
        if (r && r.ok) {
            setMsg('ok', '连通正常' + (r.ms != null ? '（' + r.ms + ' ms）' : '') +
                (r.text ? '，模型回复：' + String(r.text).slice(0, 80) : ''));
        } else {
            setMsg('err', '测试失败：' + ((r && (r.error || r.reason)) || '未知原因'));
        }
    } catch (e) {
        setMsg('err', '测试失败：' + ((e && e.message) || e));
    }
    repaint();
}

async function doReloginActive() {
    const acc = S.accounts && S.accounts.accounts;
    const active = acc && acc.find((a) => a.isActive);
    if (!active) { setMsg('err', '没有当前账号，请先添加账号。'); repaint(); return; }
    doRelogin(active.id);
}

async function doRelogin(id) {
    setMsg('info', '正在打开登录窗口，请在窗口里重新登录…');
    repaint();
    try {
        const r = await api('/login/relogin', {method: 'POST', body: {id: id}});
        setMsg('ok', (r && r.hint) || '登录窗口已打开，登录后会自动更新该账号凭证。');
        scheduleReload();
    } catch (e) {
        setMsg('err', '重登失败：' + ((e && e.message) || e));
    }
    repaint();
}

async function doAddAccount() {
    setMsg('info', '正在准备登录窗口（会清掉上次的浏览器登录态，不影响账号库）…');
    repaint();
    try {
        const prep = await api('/login/add', {method: 'POST', body: {}});
        if (prep && prep.ok === false) {
            setMsg('err', '准备失败：' + (prep.error || '未知原因'));
            repaint();
            return;
        }
        setMsg('info', '登录窗口已打开：请在窗口里登录另一个账号…');
        repaint();
        const r = await api('/login/browser', {method: 'POST', body: {}});
        if (r && r.started === false) {
            setMsg('err', '打开登录窗口失败：' + (r.reason || '未知原因') + '（可改用「手动粘贴 Token」）');
        } else if (r && r.added) {
            setMsg('ok', r.created
                ? '已把新账号加入账号库（当前账号未改动，点列表里的「切换」才会用它）'
                : '这个账号本来就在库里（凭证已更新）');
        } else {
            setMsg('ok', '已捕获并保存凭证。');
        }
        scheduleReload();
    } catch (e) {
        setMsg('err', '添加账号失败：' + ((e && e.message) || e));
    }
    repaint();
}

async function doBrowserLogin() {
    setMsg('info', '正在打开浏览器登录…');
    repaint();
    try {
        const r = await api('/login/browser', {method: 'POST', body: {}});
        if (r && r.started === false) setMsg('err', '打开登录窗口失败：' + (r.reason || '未知原因'));
        else setMsg('ok', '登录流程已启动，完成后会自动入库。');
        scheduleReload();
    } catch (e) {
        setMsg('err', '登录失败：' + ((e && e.message) || e));
    }
    repaint();
}

async function doLogout() {
    setMsg('info', '正在退出登录…');
    repaint();
    try {
        await api('/logout', {method: 'POST', body: {}});
        setMsg('ok', '已退出登录。');
        scheduleReload();
    } catch (e) {
        setMsg('err', '退出失败：' + ((e && e.message) || e));
    }
    repaint();
}

async function doSwitchAccount(id) {
    setMsg('info', '正在切换账号…');
    repaint();
    try {
        const r = await api('/accounts/switch', {method: 'POST', body: {id: id}});
        if (r && r.ok === false) setMsg('err', '切换失败：' + (r.error || '未知原因'));
        else setMsg('ok', '已切换（下一次请求生效）。');
        scheduleReload();
    } catch (e) {
        setMsg('err', '切换失败：' + ((e && e.message) || e));
    }
    repaint();
}

async function doRemoveAccount(id) {
    if (S.removeArmedId !== id) {
        S.removeArmedId = id;
        setMsg('info', '再点一次「确认移除」即删除该账号凭证（4 秒内有效）。');
        repaint();
        setTimeout(() => {
            if (S.removeArmedId === id) { S.removeArmedId = null; repaint(); }
        }, 4000);
        return;
    }
    S.removeArmedId = null;
    setMsg('info', '正在移除…');
    repaint();
    try {
        const r = await api('/accounts/remove', {method: 'POST', body: {id: id}});
        if (r && r.ok === false) setMsg('err', '移除失败：' + (r.error || '未知原因'));
        else setMsg('ok', '已移除该账号（凭证已删除）。');
        scheduleReload();
    } catch (e) {
        setMsg('err', '移除失败：' + ((e && e.message) || e));
    }
    repaint();
}

async function doRenameAccount(id, label) {
    setMsg('info', '正在保存备注…');
    repaint();
    try {
        await api('/accounts/rename', {method: 'POST', body: {id: id, label: label}});
        S.labelEditingId = null;
        setMsg('ok', '备注已保存。');
        scheduleReload();
    } catch (e) {
        setMsg('err', '保存失败：' + ((e && e.message) || e));
    }
    repaint();
}

async function doRefreshAccounts() {
    setMsg('info', '正在刷新账号校验状态…');
    repaint();
    try {
        await api('/accounts/refresh', {method: 'POST', body: {}});
        setMsg('ok', '账号状态已刷新。');
        scheduleReload();
    } catch (e) {
        setMsg('err', '刷新失败：' + ((e && e.message) || e));
    }
    repaint();
}

async function doExportAccounts() {
    setMsg('info', '正在导出账号备份…');
    repaint();
    try {
        const data = await api('/accounts/export-json', {method: 'POST', body: {}});
        if (!data || data.ok === false) throw new Error((data && data.error) || '读取备份内容失败');
        const rest = Object.assign({}, data);
        delete rest.ok;
        const text = JSON.stringify(rest, null, 2);
        const blob = new Blob([text], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'deepseek-web-vision-accounts-' + Date.now() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        setMsg('ok', '已下载备份文件（含明文凭证，请妥善保管）。');
    } catch (e) {
        setMsg('err', '导出失败：' + ((e && e.message) || e));
    }
    repaint();
}

function doImportAccounts() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            setMsg('info', '正在导入 ' + file.name + '…');
            repaint();
            try {
                const payload = JSON.parse(String(reader.result));
                const r = await api('/accounts/import', {method: 'POST', body: {payload: payload}});
                if (r && r.ok === false) setMsg('err', '导入失败：' + (r.error || '未知原因'));
                else setMsg('ok', '导入完成：新增 ' + (r.imported || 0) + ' / 更新 ' + (r.updated || 0) +
                    ' / 跳过 ' + (r.skipped || 0));
                scheduleReload();
            } catch (e) {
                setMsg('err', '导入失败：' + ((e && e.message) || e));
            }
            repaint();
        };
        reader.readAsText(file);
    });
    input.click();
}

async function doSaveGate(patch) {
    setMsg('info', '正在保存防风控配置…');
    repaint();
    try {
        const r = await api('/gate', {method: 'POST', body: patch});
        if (r && r.ok === false) setMsg('err', '保存失败：' + (r.error || '未知原因'));
        else setMsg('ok', '防风控配置已保存。');
        scheduleReload();
    } catch (e) {
        setMsg('err', '保存失败：' + ((e && e.message) || e));
    }
    repaint();
}

async function doSaveTransport(mode) {
    setMsg('info', '正在切换网络栈…');
    repaint();
    try {
        const r = await api('/transport', {method: 'POST', body: {transport: mode}});
        if (r && r.ok === false) setMsg('err', '切换失败：' + (r.error || '未知原因'));
        else setMsg('ok', '网络栈已切换为 ' + mode + '（实际生效：' + (r.effective || mode) + '）。');
        scheduleReload();
    } catch (e) {
        setMsg('err', '切换失败：' + ((e && e.message) || e));
    }
    repaint();
}

async function doSaveContextMode(mode) {
    setMsg('info', '正在切换上下文模式…');
    repaint();
    try {
        const r = await api('/context-mode', {method: 'POST', body: {mode: mode}});
        if (r && r.ok === false) setMsg('err', '切换失败：' + (r.error || '未知原因'));
        else setMsg('ok', '上下文模式已切换为 ' + (mode === 'chained' ? '链式投喂' : '每轮全量') + '。');
        scheduleReload();
    } catch (e) {
        setMsg('err', '切换失败：' + ((e && e.message) || e));
    }
    repaint();
}

async function doSaveToken() {
    const v = (S.tokenDraft || '').trim();
    if (!v) { setMsg('err', '请先粘贴 token。'); repaint(); return; }
    setMsg('info', '正在保存并校验…');
    repaint();
    try {
        const lines = v.split(/\r?\n/);
        const token = lines[0].trim();
        const cookie = lines.slice(1).join(';').trim();
        const body = cookie ? {token: token, cookie: cookie} : {token: token};
        const r = await api('/login/token', {method: 'POST', body: body});
        if (r && r.ok === false) setMsg('err', '保存失败：' + (r.error || '未知原因'));
        else {
            S.tokenDraft = '';
            setMsg('ok', 'Token 已保存' + (r && r.display ? '（账号 ' + r.display + '）' : '') + '。');
        }
        scheduleReload();
    } catch (e) {
        setMsg('err', '保存失败：' + ((e && e.message) || e));
    }
    repaint();
}

// ─────────────────────────── 主渲染 ───────────────────────────

function renderInto(host) {
    host.innerHTML = '';

    if (S.loading && !S.status) {
        host.appendChild(el('div', 'dsw-loading', '正在连接 DSH 侧 deepseek-web-vision 插件…'));
        return;
    }

    if (S.error) {
        const box = el('div', 'dsw-err');
        box.appendChild(el('div', null, '无法连接 deepseek-web-vision 插件'));
        const detail = el('div', null, S.error);
        detail.style.marginTop = '6px';
        box.appendChild(detail);
        const hint = el('div', null,
            '排查：确认 DSH Web GUI 在运行（默认 3080 端口），且插件已装配到 web profile。' +
            '端口不同时用环境变量 DSH_WEB_PORT 启动 dev server。');
        hint.style.marginTop = '8px';
        box.appendChild(hint);
        host.appendChild(box);
        const row = el('div', 'dsw-row');
        row.appendChild(btn('重试', 'primary', () => loadAll(true)));
        host.appendChild(row);
        return;
    }

    const scroll = el('div', 'dsw-scroll');
    host.appendChild(scroll);

    scroll.appendChild(el('h3', 'dsw-title', 'DeepSeek 网页版'));
    scroll.appendChild(el('p', 'dsw-sub',
        '用 chat.deepseek.com 的浏览器登录态驱动 Agent（不是 API Key）：浏览器登录捕获 + PoW 求解 + ' +
        'SSE 流式 + 提示词协议工具调用 + 图片理解。provider 路由 deepseek-web-vision。'));

    const msgEl = renderMsgNode();
    if (msgEl) scroll.appendChild(msgEl);

    const actions = el('div', 'dsw-row');
    actions.style.marginBottom = '14px';
    actions.appendChild(btn('刷新', null, () => loadAll(true)));
    actions.appendChild(btn('测试连通', null, () => doTest()));
    scroll.appendChild(actions);

    const st = S.status || {};
    const auth = st.auth || {};
    const val = st.validation || {};
    const cLogin = card('登录状态');
    cLogin.appendChild(kv('登录账号', auth.display || '（未登录）', auth.loggedIn ? 'dsw-ok' : 'dsw-bad'));
    cLogin.appendChild(kv('凭证校验',
        val.ok === true ? '通过' : (val.ok === false ? ('失败：' + (val.error || '未知')) : '未校验'),
        val.ok === true ? 'dsw-ok' : (val.ok === false ? 'dsw-bad' : '')));
    cLogin.appendChild(kv('上次校验', fmtTime(auth.lastVerifiedAt)));
    cLogin.appendChild(kv('捕获时间', fmtTime(auth.capturedAt)));
    if (auth.limitUntilMs) {
        cLogin.appendChild(kv('限流至', fmtTime(new Date(auth.limitUntilMs).toISOString()), 'dsw-warn'));
    }
    if (auth.lastVerifyError) {
        cLogin.appendChild(kv('最近错误', auth.lastVerifyError, 'dsw-bad'));
    }
    const regd = (st.registeredProviders || []).indexOf('deepseek-web-vision') >= 0;
    cLogin.appendChild(kv('Provider 已注册', regd ? '是' : '否', regd ? 'dsw-ok' : 'dsw-bad'));
    const loginRow = el('div', 'dsw-row');
    loginRow.style.marginTop = '10px';
    loginRow.appendChild(btn('重新登录当前账号', null, () => doReloginActive()));
    loginRow.appendChild(btn('打开浏览器登录', null, () => doBrowserLogin()));
    loginRow.appendChild(btn('退出登录', 'danger', () => doLogout()));
    cLogin.appendChild(loginRow);
    if (st.loginCapability) {
        cLogin.appendChild(el('p', 'dsw-hint',
            '登录能力：进程 ' + (st.loginCapability.processType || '?') +
            '，可开窗口 ' + (st.loginCapability.canOpenWindow ? '是' : '否') +
            '，系统浏览器 ' + (st.loginCapability.browser || '未找到') +
            '。无法开窗口时会改用系统浏览器完成登录。'));
    }
    scroll.appendChild(cLogin);

    scroll.appendChild(renderAccounts());
    scroll.appendChild(renderModels());
    scroll.appendChild(renderGate());
    scroll.appendChild(renderTransport());
    scroll.appendChild(renderContextMode());
    scroll.appendChild(renderLedger());
    scroll.appendChild(renderToken());
    // 「数据目录」卡片已按需求移除（仅影响 UI 展示，
    // 插件仍使用 st.paths 里的真实路径读写账号与台账）。
}

// ─────────────────── 挂载：设置面板里的第四个标签页 ───────────────────

/** 设置面板左侧竖排导航容器（React 渲染，面板关闭时整块消失，需反复补挂）。 */
const SIDEBAR_SEL = '.ext-settings-sidebar';
/** 设置面板右侧内容容器，我们的面板作为它的一个子节点嵌进去。 */
const PANES_SEL = '.ext-settings-panes';
/** 宿主自己的导航项类名，入口按钮复刻它以保证视觉一致。 */
const TAB_SEL = '.ext-settings-tab';
/** 内容面板类名，同时也是显隐规则的选择器锚点。 */
const PANE_CLS = 'dsw-pane';
/** 挂到 .ext-settings-panes 上的标记：有它 = 当前显示我们的面板。 */
const EMBED_CLS = 'dsw-embedded';
const ENTRY_ID = 'dsw-vision-entry';

let entryObserver = null;

function markEntryActive(on) {
    const b = document.getElementById(ENTRY_ID);
    if (!b) return;
    if (on) b.classList.add('active');
    else b.classList.remove('active');
}

/**
 * 在设置面板左侧竖排导航里挂入口按钮。
 *
 * 容器由 React 渲染（.ext-settings-sidebar，只在设置面板打开期间存在），
 * 重渲染可能把外部插入的节点挤掉，所以 MutationObserver 里反复补挂。
 * 按钮类名直接复刻宿主的 .ext-settings-tab，视觉与「编辑器设置 / 插件管理 /
 * 插件市场」像素级一致，选中态也复用宿主的 .active 规则。
 */
function buildEntry() {
    const bar = document.querySelector(SIDEBAR_SEL);
    if (!bar) return;
    if (document.getElementById(ENTRY_ID)) return;

    const tpl = bar.querySelector(TAB_SEL);
    const tabCls = tpl ? tpl.className : 'ext-settings-tab';

    const b = el('button', tabCls + ' dsw-entry-btn');
    b.id = ENTRY_ID;
    b.type = 'button';
    b.title = 'DeepSeek 网页版（登录态 / 账号 / 模型 / 防风控 / 用量）';

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
    [['circle', {cx: 12, cy: 12, r: 10}], ['path', {d: 'M2 12h20'}],
     ['path', {d: 'M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z'}]]
        .forEach((pair) => {
            const child = document.createElementNS(ns, pair[0]);
            Object.keys(pair[1]).forEach((k) => child.setAttribute(k, String(pair[1][k])));
            svg.appendChild(child);
        });

    b.appendChild(svg);
    b.appendChild(el('span', null, 'DeepSeek 网页版'));
    b.addEventListener('click', (e) => { e.stopPropagation(); openEmbed(); });
    bar.appendChild(b);
    markEntryActive(S.open);
}

/**
 * 把内容面板补挂到设置面板右侧。
 *
 * React 每次重渲染右侧内容都会重建 .ext-settings-panes 的子节点，
 * 我们插进去的 pane 会被一起摘掉 —— 所以每次都要确认它在位。
 */
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

/** 同步显隐：面板开着就隐藏宿主内容、显示我们的 pane，反之相反。 */
function applyEmbed() {
    const panes = document.querySelector(PANES_SEL);
    if (!panes) { paneRoot = null; return; }
    const p = ensurePane();
    if (!p) return;
    if (S.open) panes.classList.add(EMBED_CLS);
    else panes.classList.remove(EMBED_CLS);
    markEntryActive(S.open);
    // pane 被 React 重建过（内容空了）→ 用现有数据补画一次，不重新请求
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

/**
 * 点了宿主的三个导航项 → 让出内容区。
 *
 * 左侧导航是单选语义：既然用户切到了「插件管理」，右侧就该显示插件列表。
 */
function bindTabInterception() {
    document.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || !t.closest) return;
        const item = t.closest(TAB_SEL);
        if (!item) return;
        if (item.id === ENTRY_ID) return;   // 自己处理
        if (S.open) closeEmbed();
    }, true);
}

/**
 * 盯着设置面板的打开 / 关闭。
 *
 * 左侧导航只在设置面板打开期间存在，所以：
 *  - 它出现 → 补挂入口按钮与内容面板；
 *  - 它消失（用户关了设置面板）→ 收起内嵌面板并清掉残留节点，
 *    否则下次打开设置会看到一个状态错乱的孤儿面板。
 */
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

// ─────────────────────────── 生命周期 ───────────────────────────

export function initDeepseekWebPanel() {
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
