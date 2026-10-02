/**
 * workbuddy-bridge —— Scratch 扩展编辑器的 WorkBuddy 模型桥
 * ================================================================
 *
 * 作用：把本机 WorkBuddy 桌面端登录态（CodeBuddyExtension auth 文件）
 * 直接桥给编辑器的内置 AI 助手（Bilup Nova，OpenAI 兼容协议）。
 *
 * 与 dsh-workbuddy-xdpool 的关系：
 *   - xdpool 是 DSH 内核的 cordis 插件，它有账号池调度（轮询/冷却/保底），
 *     但它的 shim 有随机 Bearer 密钥、只在 DSH 主进程内存里，外部进程拿不到。
 *   - 本插件不复用 shim，而是**直接读同一份 auth 文件**（与 xdpool 的
 *     candidateAuthDirs 同一位置），用自己的简单轮询直调上游
 *     https://copilot.tencent.com/v2/chat/completions。
 *   - 两侧并行调用同一批账号。上游按账号计积分，不按进程计，因此互不冲突；
 *     唯一的共享约束是上游的账号级风控（限流），桥端遇到 429 会跳过该账号。
 *
 * 上游协议（headers / body 规范化）逐条对照 xdpool 源码实现：
 *   chatHeaders()      → Bearer accessToken + X-User-Id/X-No-* 惯例 + X-Product
 *   prepareChatBody()  → 强制 stream:true、developer→system、tool_choice 清洗
 *
 * 挂载方式与 deepseek-web-panel 一致：
 *   fork 出来后向 stderr 发一行 JSON {type:'listening', port, routes}，
 *   编辑器把 /workbuddy-ai/api 反代到本进程。
 */

import http from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir, platform } from 'node:os';

const ROUTE_PREFIX = '/workbuddy-ai/api';
const PORT = Number(process.env.WORKBUDDY_BRIDGE_PORT || 0);
const MAX_BODY = 32 * 1024 * 1024;

/** 上游常量（与 xdpool 一致） */
const CN_CHAT_BASE = 'https://copilot.tencent.com';
const CLIENT_UA = 'WorkBuddy/5.5.6 WorkBuddy/5.5.6 CLI/2.137.1';
const CHAT_TIMEOUT_MS = 90000;

/**
 * 模型静态表（倍率/上下文/形状），与 xdpool status 里看到的目录一致。
 * 上游没有公开的 /v1/models，这张表是给 AI 助手挑模型用的。
 */
const MODELS = [
    {id: 'deepseek-v4.1-flash', name: 'Deepseek-V4.1-Flash', multiplier: 0.11, contextWindow: 1000000, maxOutputTokens: 128000, supportsImages: true},
    {id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', multiplier: 0.06, contextWindow: 1000000, maxOutputTokens: 131072, supportsImages: false},
    {id: 'glm-5.3', name: 'GLM-5.3', multiplier: 0.79, contextWindow: 1000000, maxOutputTokens: 64000, supportsImages: true},
    {id: 'glm-5.2', name: 'GLM-5.2', multiplier: 0.79, contextWindow: 1000000, maxOutputTokens: 64000, supportsImages: true},
    {id: 'glm-5.1', name: 'GLM-5.1', multiplier: 0.79, contextWindow: 200000, maxOutputTokens: 48000, supportsImages: false},
    {id: 'glm-5v-turbo', name: 'GLM-5v-Turbo', multiplier: 0.71, contextWindow: 200000, maxOutputTokens: 64000, supportsImages: true},
    {id: 'kimi-k3-1', name: 'Kimi-K3', multiplier: 1.62, contextWindow: 1000000, maxOutputTokens: 32000, supportsImages: true},
    {id: 'kimi-k2.8-preview', name: 'Kimi-K2.8-Preview', multiplier: 0.77, contextWindow: 1000000, maxOutputTokens: 64000, supportsImages: true},
    {id: 'kimi-k2.7', name: 'Kimi-K2.7-Code', multiplier: 0.57, contextWindow: 256000, maxOutputTokens: 32000, supportsImages: true},
    {id: 'kimi-k2.6', name: 'Kimi-K2.6', multiplier: 0.52, contextWindow: 256000, maxOutputTokens: 32000, supportsImages: true},
    {id: 'minimax-m3', name: 'MiniMax-M3', multiplier: 0.25, contextWindow: 512000, maxOutputTokens: 64000, supportsImages: true},
    {id: 'deepseek-v4-pro', name: 'Deepseek-V4-Pro', multiplier: 0.51, contextWindow: 1000000, maxOutputTokens: 128000, supportsImages: true},
    {id: 'hy3', name: 'Hy3', multiplier: 0, contextWindow: 192000, maxOutputTokens: 64000, supportsImages: true},
    {id: 'hy3-x', name: 'Hy3', multiplier: 0.05, contextWindow: 192000, maxOutputTokens: 64000, supportsImages: true},
    {id: 'hy4-preview', name: 'Hy4 preview', multiplier: 0.29, contextWindow: 1000000, maxOutputTokens: 64000, supportsImages: true}
];

//#region auth 文件读取（与 xdpool candidateAuthDirs 同一目录约定）

function authDirs() {
    const override = process.env.WORKBUDDY_AUTH_FILE;
    const dirs = [];
    if (override) {
        dirs.push(override.toLowerCase().endsWith('.info') ? join(override, '..') : override);
    }
    if (platform() === 'win32') {
        dirs.push(join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'CodeBuddyExtension', 'Data', 'Public', 'auth'));
        dirs.push(join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'CodeBuddyExtension', 'Data', 'Public', 'auth'));
    } else if (process.platform === 'darwin') {
        dirs.push(join(homedir(), 'Library', 'Application Support', 'CodeBuddyExtension', 'Data', 'Public', 'auth'));
    } else {
        dirs.push(join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'CodeBuddyExtension', 'Data', 'Public', 'auth'));
    }
    return dirs;
}

/**
 * 解析一份 .info 文件 → 账号对象。
 * 结构对照 xdpool parseWorkBuddyAuth：{auth:{accessToken,...}, account:{uid,nickname,...}}，
 * 也兼容扁平结构。accessToken 加密文件（xdpool 有解密分支）这里读不出就跳过。
 */
function parseAuthFile(text, sourcePath) {
    let doc;
    try { doc = JSON.parse(text); } catch { return null; }
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return null;
    const auth = (typeof doc.auth === 'object' && doc.auth !== null) ? doc.auth : doc;
    const identity = (typeof doc.account === 'object' && doc.account !== null) ? doc.account : doc;
    const accessToken = typeof auth.accessToken === 'string' ? auth.accessToken : '';
    // xdpool 的加密存档是 {encrypted:..} 包装对象；字符串才是明文
    if (!accessToken || accessToken.charAt(0) !== 'e' || accessToken.slice(0, 3) === '{"e') {
        if (!accessToken) return null;
    }
    // 过期检查
    const exp = Number(auth.expiresAt || 0);
    if (exp > 0 && exp < Date.now()) return null;
    return {
        id: String(identity.uid || identity.uin || basename(sourcePath)),
        nickname: String(identity.nickname || identity.phoneNumber || identity.uid || '未知账号'),
        domain: String(auth.domain || 'www.workbuddy.cn'),
        accessToken: accessToken,
        uid: String(identity.uid || ''),
        enterpriseId: identity.enterpriseId == null ? '' : String(identity.enterpriseId),
        expiresAt: exp || null,
        source: sourcePath,
        /** 简易轮询游标：本进程内递增 */
        used: 0
    };
}

/** 收集全部可用账号（去重：同一 uid 取 expiresAt 更晚的那份）。 */
function loadAccounts() {
    const byId = new Map();
    const dirs = authDirs();
    const files = [];
    for (const dir of dirs) {
        if (!existsSync(dir)) continue;
        let entries = [];
        try { entries = readdirSync(dir); } catch { continue; }
        for (const name of entries) {
            if (!/\.info$/i.test(name)) continue;
            const full = join(dir, name);
            try { if (!statSync(full).isFile()) continue; } catch { continue; }
            files.push(full);
        }
    }
    for (const f of files) {
        let text = '';
        try { text = readFileSync(f, 'utf8'); } catch { continue; }
        const acc = parseAuthFile(text, f);
        if (!acc) continue;
        const prev = byId.get(acc.id);
        if (!prev || (acc.expiresAt || 0) > (prev.expiresAt || 0)) byId.set(acc.id, acc);
    }
    return Array.from(byId.values());
}

//#endregion

//#region 上游调用（协议对照 xdpool）

function originReferer(acc) {
    return acc.domain && acc.domain.indexOf('global') >= 0 ? 'https://www.workbuddy.cn' : 'https://copilot.tencent.com';
}

function chatHeaders(acc) {
    const h = {
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': originReferer(acc),
        'Referer': originReferer(acc) + '/',
        'User-Agent': CLIENT_UA,
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + acc.accessToken,
        'X-Product': 'SaaS'
    };
    if (acc.uid) h['X-User-Id'] = acc.uid; else h['X-No-User-Id'] = '1';
    if (acc.enterpriseId) h['X-Enterprise-Id'] = acc.enterpriseId; else h['X-No-Enterprise-Id'] = '1';
    h['X-Domain'] = acc.domain || 'www.workbuddy.cn';
    return h;
}

/** body 规范化：强制流式、developer→system、tool_choice 清洗（对照 xdpool prepareChatBody）。 */
function prepareChatBody(raw) {
    let body;
    try { body = JSON.parse(raw); } catch { return raw; }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return raw;
    body.stream = true;
    delete body.stream_options;
    if (Array.isArray(body.messages)) {
        for (const m of body.messages) {
            if (m && typeof m === 'object' && !Array.isArray(m) && m.role === 'developer') m.role = 'system';
        }
    }
    const choice = body.tool_choice;
    if (typeof choice === 'string') {
        if (choice.trim().toLowerCase() === 'none') {
            delete body.tool_choice; delete body.tools; delete body.functions;
        }
    } else if (typeof choice === 'object' && choice !== null && !Array.isArray(choice)) {
        const type = typeof choice.type === 'string' ? choice.type.trim().toLowerCase() : '';
        if (type === 'none') {
            delete body.tool_choice; delete body.tools; delete body.functions;
        } else if (type === 'auto' || type === 'required') {
            body.tool_choice = type;
        } else if (type === 'function') {
            const name = choice && choice.function && typeof choice.function.name === 'string' ? choice.function.name.trim() : '';
            body.tool_choice = name || 'auto';
        } else {
            delete body.tool_choice;
        }
    }
    return JSON.stringify(body);
}

//#endregion

//#region 账号轮询

/** 轮询游标（进程内）；429/401 的账号本轮跳过。 */
let rrCursor = 0;
const cooledUntil = new Map(); // accId -> ts

function pickAccount() {
    const now = Date.now();
    const all = loadAccounts().filter(a => !(cooledUntil.get(a.id) > now));
    if (!all.length) return null;
    const acc = all[rrCursor % all.length];
    rrCursor = (rrCursor + 1) % Math.max(1, all.length);
    return acc;
}

//#endregion

//#region HTTP 服务

function json(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (c) => {
            size += c.length;
            if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
            chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

/** 挑一个可用账号把 /chat 转发到上游，SSE 原样透传。 */
async function handleChat(req, res) {
    const raw = await readBody(req);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return json(res, 400, {error: {message: '请求体不是合法 JSON'}}); }
    const model = typeof parsed.model === 'string' ? parsed.model : '';

    // 最多把在线账号轮一遍：上游 429/401 时换下一个
    const now = Date.now();
    const accounts = loadAccounts().filter(a => !(cooledUntil.get(a.id) > now));
    if (!accounts.length) {
        return json(res, 503, {error: {message: '没有可用的 WorkBuddy 账号（请确认 WorkBuddy 桌面端已登录，或登录态未过期）', type: 'no_account'}});
    }

    let lastErr = null;
    for (let attempt = 0; attempt < accounts.length; attempt++) {
        const acc = accounts[(rrCursor + attempt) % accounts.length];
        const prepared = prepareChatBody(raw);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
        let resp;
        try {
            resp = await fetch(CN_CHAT_BASE + '/v2/chat/completions', {
                method: 'POST',
                headers: chatHeaders(acc),
                body: prepared,
                signal: controller.signal
            });
        } catch (e) {
            clearTimeout(timer);
            lastErr = 'transport: ' + ((e && e.message) || e);
            continue;
        }
        clearTimeout(timer);

        if (resp.status === 429 || resp.status === 401 || resp.status === 403) {
            // 该账号被限流/失效：冷却 10 分钟，换下一个
            cooledUntil.set(acc.id, Date.now() + 600000);
            lastErr = 'account ' + acc.nickname + ' → http ' + resp.status;
            continue;
        }
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            lastErr = 'upstream http ' + resp.status + ': ' + text.slice(0, 300);
            continue;
        }

        // 成功：SSE 原样透传
        rrCursor = (rrCursor + attempt + 1) % Math.max(1, accounts.length);
        // 响应头值只能 ASCII：中文昵称必须编码，否则 Node 抛
        // Invalid character in header content（实测踩过：昵称「Wpj云」）
        const safeName = Buffer.from(acc.nickname, 'utf8').toString('base64');
        res.writeHead(200, {
            'Content-Type': resp.headers.get('content-type') || 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Workbuddy-Account': safeName
        });
        const reader = resp.body.getReader();
        try {
            for (;;) {
                const {done, value} = await reader.read();
                if (done) break;
                res.write(Buffer.from(value));
            }
        } catch (e) {
            // 客户端断开或上游中断：结束响应即可
        } finally {
            try { reader.releaseLock(); } catch { /* ignore */ }
            res.end();
        }
        return;
    }

    json(res, 502, {error: {message: '所有 WorkBuddy 账号都不可用；最后错误：' + (lastErr || '未知'), type: 'all_accounts_failed'}});
}

const server = http.createServer(async (req, res) => {
    // 反代原样透传完整前缀路径（/workbuddy-ai/api/...），直连时也可能不带
    // 前缀（本地调试）。统一剥掉已知前缀再匹配路由。
    let url = (req.url || '').split('?')[0];
    for (const prefix of [ROUTE_PREFIX]) {
        if (url === prefix) { url = '/'; break; }
        if (url.startsWith(prefix + '/')) {
            url = url.slice(prefix.length) || '/';   // 保留 "/xxx" 的前导斜杠
            break;
        }
    }
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        return res.end();
    }

    try {
        // —— OpenAI 兼容端点（给 Nova 的 provider-custom 用）——
        if (url === '/v1/models') {
            const accounts = loadAccounts();
            const data = MODELS.map(m => ({
                id: m.id,
                object: 'model',
                owned_by: 'workbuddy',
                meta: {name: m.name, multiplier: m.multiplier, contextWindow: m.contextWindow}
            }));
            return json(res, 200, {object: 'list', data, accounts: accounts.length});
        }

        if (url === '/v1/chat/completions' && req.method === 'POST') {
            return await handleChat(req, res);
        }

        // —— 管理端点（给面板页面用）——
        if (url === '/status') {
            const accounts = loadAccounts().map(a => ({
                id: a.id, nickname: a.nickname, domain: a.domain,
                expiresAt: a.expiresAt || null,
                valid: !a.expiresAt || a.expiresAt > Date.now(),
                cooling: cooledUntil.get(a.id) > Date.now() ? cooledUntil.get(a.id) : null,
                source: a.source
            }));
            return json(res, 200, {
                ok: true,
                authDirs: authDirs(),
                accountCount: accounts.length,
                accounts,
                models: MODELS,
                modelCount: MODELS.length
            });
        }

        if (url === '/' || url === '') {
            return json(res, 200, {
                ok: true,
                name: 'workbuddy-bridge',
                endpoints: ['/status', '/models', '/v1/models', '/v1/chat/completions'],
                hint: 'Nova 的自定义 OpenAI Agent 指向 ' + ROUTE_PREFIX + '/v1，apiKey 随便填（如 via-proxy）'
            });
        }

        return json(res, 404, {error: {message: 'not found: ' + url}});
    } catch (e) {
        return json(res, 500, {error: {message: (e && e.message) || String(e)}});
    }
});

server.listen(PORT, '127.0.0.1', () => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : PORT;
    // ext-plugin-runtime 约定：listening 信息走 **IPC message**（fork 建立的
    // parentPort），不是 stderr —— stderr 只做日志透传。两路都发一份：
    // IPC 给 runtime 建路由表，stderr 给人看。
    if (typeof process.send === 'function') {
        process.send({type: 'listening', port: port, routes: [ROUTE_PREFIX]});
    }
    process.stderr.write('[workbuddy-bridge] ready on 127.0.0.1:' + port + '\n');
});

server.on('error', (e) => {
    process.stderr.write('[workbuddy-bridge] fatal: ' + ((e && e.message) || e) + '\n');
    process.exit(1);
});
