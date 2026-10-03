/**
 * 编辑器插件的 Node 侧运行时
 * ================================================================
 * 编辑器插件平时只是一段浏览器 JS（`plugins/<id>/index.js`，由
 * `/ext-plugins/list` 送给页面后 eval 成插件对象）。但有些插件需要真正的
 * Node 能力 —— 读本地文件、开 socket、跑 WASM、维护长连接 —— 浏览器里做不到。
 *
 * 约定：插件目录下若存在 `server.mjs` / `server.js`，就在 devServer 启动时
 * 把它 fork 成**独立子进程**；子进程通过 IPC 回报自己实际监听的端口和
 * 它要占用的路由前缀，父进程据此建一张路由表，把对应的 HTTP 请求反代过去。
 *
 * 为什么用端口 0（系统分配）而不是写死端口：用户可能同时开着网页版和 Electron
 * 版编辑器，写死端口会互相抢占，而「端口被占用」这种错误对用户毫无意义。
 *
 * 为什么给子进程传 DSH_HOME：有些插件的上游产物是按 DSH 插件的约定写的
 * （数据放 `${DSH_HOME}/<插件名>/`）。把 DSH_HOME 指向**编辑器自己的数据
 * 文件夹**，插件的数据就跟编辑器在一起，也不用去动用户真实的 ~/.dsh。
 */
const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

/** 读文本并剥掉 UTF-8 BOM。
 *  Windows 上写文件很容易带 BOM（PowerShell 的 Set-Content、记事本「UTF-8」
 *  都是），BOM 会让 JSON.parse 直接抛错，也会给插件源码塞进一个不可见字符。
 */
function readText(p) {
    return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
}

/** 插件 Node 侧入口的候选文件名，按优先级。 */
const SERVER_ENTRIES = ['server.mjs', 'server.js'];

/** 递归拷贝目录（内置插件部署用）。
 *  不用 fs.cpSync：Node 16 才有，而 Electron 打包环境不一定满足。 */
function copyDir(src, dst) {
    fs.mkdirSync(dst, {recursive: true});
    for (const ent of fs.readdirSync(src, {withFileTypes: true})) {
        const s = path.join(src, ent.name);
        const d = path.join(dst, ent.name);
        if (ent.isDirectory()) copyDir(s, d);
        else if (ent.isFile()) fs.copyFileSync(s, d);
    }
}

/** 读插件清单里的 version；没有清单或读坏了都返回空串。 */
function readVersion(dir) {
    try {
        const mf = path.join(dir, 'plugin.json');
        if (!fs.existsSync(mf)) return '';
        return String(JSON.parse(readText(mf)).version || '');
    } catch (e) {
        return '';
    }
}

/**
 * 从 GitHub 拉一个目录下的全部文件。
 *
 * 为什么由 Node 侧拉而不是浏览器拉：
 *   1. 浏览器直连 api.github.com 有 CORS 和 60 次/小时/IP 的限流；
 *   2. Node 侧还能顺便处理重定向、gzip，代码更短；
 *   3. 最关键的 —— 浏览器拉完还得把 418KB 的 vendor bundle base64 后
 *      再 POST 回来，等于把同一份数据搬两遍。
 *
 * 实现走 Git Trees API 而不是递归 Contents API：后者每层目录一个请求，
 * 深目录会打出十几个请求，且拿不到嵌套 vendor 的完整清单。
 */
async function fetchGithubDir(owner, repo, dir, log) {
    // 归一化：'.' 与空串都表示「仓库根目录就是插件本体」。
    // 市场清单里这类条目没法把 dir 当子目录用 —— dir 字段被占用来表示
    // 「装到本机后用哪个目录名」，仓库内路径由单独的 path 字段给出。
    let cleanDir = String(dir == null ? '' : dir).trim().replace(/^\/+|\/+$/g, '');
    if (cleanDir === '.') cleanDir = '';

    // 本机 Node 的根证书库常与企业代理 / 自签中间证书冲突，报
    // `unable to verify the first certificate`（Node 26 还会建议 --use-system-ca）。
    // 这里**先按严格校验请求**，只在确实撞上证书类错误时才降级重试一次，
    // 并把降级这件事显式打进日志。
    //
    // 为什么不干脆一直 rejectUnauthorized:false：这条路径下载回来的是会被
    // fork 执行的插件代码，静默放宽校验等于给中间人开门。开发机上的
    // github-oauth 代理敢放宽，是因为它只转发两个公开 OAuth 端点、不传凭据、
    // 响应也只回给本机页面；这里没有那个前提。
    const isCertError = (e) => {
        const code = String((e && e.code) || '');
        const msg = String((e && e.message) || '');
        return /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/.test(code) ||
            /unable to verify|self.signed|certificate/i.test(msg);
    };

    function get(url, redirects, relaxed) {
        return new Promise((resolve, reject) => {
            const req = https.get(url, {
                headers: {
                    'user-agent': 'ExtForge',
                    accept: 'application/vnd.github+json'
                },
                rejectUnauthorized: !relaxed
            }, (res) => {
                const sc = res.statusCode || 0;
                // GitHub 的 raw 域会 302 到 CDN，不跟就会拿到一个空 body
                if (sc >= 300 && sc < 400 && res.headers.location && (redirects || 0) < 5) {
                    res.resume();
                    resolve(get(res.headers.location, (redirects || 0) + 1, relaxed));
                    return;
                }
                if (sc !== 200) {
                    res.resume();
                    reject(new Error('HTTP ' + sc + ' ' + url));
                    return;
                }
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks)));
            });
            req.on('error', (e) => {
                if (!relaxed && isCertError(e)) {
                    if (log) log('[ext-plugins] TLS 证书链校验失败，已降级重试（' + (e.code || e.message) + '）');
                    resolve(get(url, redirects, true));
                    return;
                }
                reject(e);
            });
            req.setTimeout(60000, () => req.destroy(new Error('请求超时')));
        });
    }

    // 默认分支名可能是 main 也可能是 master，两边都试
    let tree = null;
    let lastErr = null;
    for (const ref of ['main', 'master']) {
        try {
            const buf = await get('https://api.github.com/repos/' + owner + '/' + repo + '/git/trees/' + ref + '?recursive=1', 0, false);
            const data = JSON.parse(buf.toString('utf8'));
            if (Array.isArray(data.tree)) { tree = data.tree; break; }
        } catch (e) { lastErr = e; }
    }
    if (!tree) throw new Error('取仓库文件树失败：' + ((lastErr && lastErr.message) || '未知'));

    /**
     * 取一个文件的原始字节。
     *
     * 走 Contents API（base64）而**不是** raw.githubusercontent.com：
     * 后者在本机当前网络下稳定返回 502（代理层拦的，不是 GitHub 的错），
     * 而 api.github.com 已经验证可达。代价是响应体大 33%，但插件包一共
     * 就几个文件、最大 418KB，这点开销远小于「根本装不上」。
     *
     * Contents API 对超过 1MB 的文件不返回 content，故对超大文件明确报错，
     * 而不是静默写一个空文件进去。
     */
    async function fetchBlob(owner, repo, filePath) {
        const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' +
            filePath.split('/').map(encodeURIComponent).join('/') + '?ref=HEAD';
        const buf = await get(url, 0, false);
        const data = JSON.parse(buf.toString('utf8'));
        if (!data || typeof data.content !== 'string') {
            if (data && data.size > 1048576) {
                throw new Error('文件超过 1MB，Contents API 不返回内容：' + filePath + '（' + data.size + ' 字节）');
            }
            throw new Error('取文件内容失败：' + filePath);
        }
        return Buffer.from(data.content.replace(/\s/g, ''), 'base64');
    }

    const prefix = cleanDir ? cleanDir + '/' : '';
    const blobs = tree.filter(t =>
        t.type === 'blob' && t.path.indexOf(prefix) === 0 && (!cleanDir || t.path !== cleanDir)
    );
    if (!blobs.length) throw new Error('在 ' + owner + '/' + repo + '/' + cleanDir + ' 下没有找到文件');

    const files = [];
    for (const b of blobs) {
        // 相对插件目录的路径：vendor/deepseek-web-host.mjs
        const rel = b.path.slice(prefix.length);
        if (!rel || rel.indexOf('..') >= 0) continue;
        files.push({path: rel, content: await fetchBlob(owner, repo, b.path)});
    }
    return files;
}

module.exports = function createPluginRuntime(opts) {
    const pluginsDir = opts.pluginsDir;
    const dataDir = opts.dataDir || path.dirname(pluginsDir);
    const bundledDir = opts.bundledDir || '';
    const log = opts.log || ((...a) => console.log(...a));

    /** 正在跑的子进程：id → {id, proc, port, routes} */
    const running = new Map();
    /** 路由前缀表，按前缀长度降序（长前缀优先，避免 /a 吃掉 /a/b） */
    let routeTable = [];

    /** 扫描插件目录，返回清单（含源码文本，供页面侧 eval）。 */
    function listPlugins() {
        let names = [];
        try {
            names = fs.readdirSync(pluginsDir, {withFileTypes: true})
                .filter(d => d.isDirectory())
                .map(d => d.name);
        } catch (e) {
            return [];
        }
        const out = [];
        for (const name of names) {
            const dir = path.join(pluginsDir, name);
            const entry = path.join(dir, 'index.js');
            const hasServer = SERVER_ENTRIES.some(f => fs.existsSync(path.join(dir, f)));
            // 两类插件都收：
            //   - 有 index.js：浏览器侧插件（可能顺带带 Node 服务）；
            //   - 只有 server.mjs/js：纯 Node 侧插件（界面由别处提供，
            //     比如 deepseek-web-panel 的界面就嵌在设置面板里）。
            // 一个都没有的目录直接跳过。
            if (!fs.existsSync(entry) && !hasServer) continue;
            let code = '';
            if (fs.existsSync(entry)) {
                try { code = readText(entry); } catch (e) { code = ''; }
            }
            let manifest = {};
            try {
                const mf = path.join(dir, 'plugin.json');
                if (fs.existsSync(mf)) manifest = JSON.parse(readText(mf));
            } catch (e) { /* 清单坏了不影响加载，回退目录名 */ }
            const id = manifest.id || name;
            const rec = running.get(id);
            // 是否随编辑器分发（bundledDir 里有同名目录）。
            // 这类插件删了也没用 —— 下次启动 deployBundled() 会原样铺回来，
            // 所以界面要据此禁掉删除按钮，而不是让用户删完发现它又回来了。
            const bundled = !!(bundledDir && fs.existsSync(path.join(bundledDir, name)));
            out.push({
                id,
                dir: name,
                name: manifest.name || name,
                description: manifest.description || '',
                category: manifest.category || '已安装',
                version: manifest.version || '',
                author: manifest.author || '',
                hasServer,
                bundled,
                running: !!rec,
                port: rec ? rec.port : 0,
                routes: rec ? rec.routes : [],
                code
            });
        }
        return out;
    }

    function rebuildRouteTable() {
        const rows = [];
        for (const rec of running.values()) {
            if (!rec.port) continue;
            for (const r of rec.routes) rows.push({path: r, port: rec.port, id: rec.id});
        }
        rows.sort((a, b) => b.path.length - a.path.length);
        routeTable = rows;
    }

    /**
     * 查某个请求路径该转发到哪个插件端口。
     * 返回 0 表示没有插件接管 —— 调用方自行回退（例如回落 DSH）。
     */
    function portFor(urlPath) {
        const p = String(urlPath || '').split('?')[0];
        const hit = routeTable.find(r => p === r.path || p.startsWith(r.path + '/'));
        return hit ? hit.port : 0;
    }

    function startOne(plugin) {
        const dir = path.join(pluginsDir, plugin.dir);
        const entry = SERVER_ENTRIES.map(f => path.join(dir, f)).find(f => fs.existsSync(f));
        if (!entry) return;
        let proc;
        try {
            proc = fork(entry, [], {
                // cwd 用 dataDir 而不是插件目录本身。
                // Windows 下「某目录是某个活进程的当前目录」会锁住该目录，
                // 导致升级 / 卸载 / 删除插件时报 EPERM。插件要用自己的目录时
                // 走 SCRATCH_EDITOR_PLUGIN_DIR，或按 import.meta.url 定位，
                // 两者都不依赖 cwd。
                cwd: dataDir,
                stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
                env: Object.assign({}, process.env, {
                    SCRATCH_EDITOR_PLUGIN_DIR: dir,
                    SCRATCH_EDITOR_DATA_DIR: dataDir,
                    // 上游产物（deepseek-web-host.mjs）按 `${DSH_HOME || ~/.dsh}`
                    // 决定数据目录。这里**不覆盖**已存在的 DSH_HOME，原因很实际：
                    // 网页版编辑器是从 DSH 会话里起的，继承下来的 DSH_HOME 指向
                    // 用户真实的 ~/.dsh —— 那里的账号库和台账是用户已经用起来的，
                    // 强行改指到编辑器数据文件夹会让面板显示「未登录」、台账清零，
                    // 用户得重新登录一次。打包版没有 DSH_HOME，自然落到 dataDir，
                    // 自包含的诉求在那边已经满足。
                })
            });
        } catch (e) {
            log('[ext-plugins] 启动 ' + plugin.id + ' 失败: ' + (e && e.message || e));
            return;
        }
        const tag = '[ext-plugins:' + plugin.id + ']';
        const rec = {id: plugin.id, proc, port: 0, routes: []};
        running.set(plugin.id, rec);
        // 子进程的 stdout/stderr 直接透传，插件作者加 console.log 就能看见
        if (proc.stdout) proc.stdout.on('data', d => process.stdout.write(tag + ' ' + d));
        if (proc.stderr) proc.stderr.on('data', d => process.stderr.write(tag + ' ' + d));
        proc.on('message', (msg) => {
            if (!msg || msg.type !== 'listening') return;
            rec.port = Number(msg.port) || 0;
            rec.routes = (Array.isArray(msg.routes) && msg.routes.length) ? msg.routes : ['/'];
            rebuildRouteTable();
            log('[ext-plugins] ' + plugin.id + ' 就绪 :' + rec.port + ' → ' + rec.routes.join(', '));
        });
        proc.on('exit', (code, sig) => {
            log('[ext-plugins] ' + plugin.id + ' 退出 code=' + code + ' sig=' + sig);
            running.delete(plugin.id);
            rebuildRouteTable();
        });
    }

    /**
     * 把随编辑器分发的内置插件部署到用户插件目录。
     *
     * 为什么要这一步：用户装完编辑器，`%APPDATA%/scratch-extension-editor/plugins/`
     * 是空的 —— 内置插件（如 deepseek-web-panel）必须有人替他放进去。
     * 放在这里而不是安装脚本里，是因为网页版没有安装脚本，两边得走同一条路。
     *
     * 覆盖规则（刻意保守）：
     *   - 目标不存在 → 首次安装；
     *   - 目标存在且 version 与内置版不同 → 升级覆盖；
     *   - 其余情况跳过 —— 既避免每次启动重写几百 KB 的 vendor 文件，
     *     也避免把用户自己改过的插件覆盖掉。
     *
     * 注意：覆盖运行时正在使用的 server.mjs 不会影响已 fork 的子进程
     * （Node 早已把文件读进内存），要等重启编辑器才生效。
     */
    function deployBundled() {
        if (!bundledDir || !fs.existsSync(bundledDir)) return [];
        const deployed = [];
        let entries = [];
        try {
            entries = fs.readdirSync(bundledDir, {withFileTypes: true});
        } catch (e) {
            return [];
        }
        for (const ent of entries) {
            if (!ent.isDirectory()) continue;
            const src = path.join(bundledDir, ent.name);
            const dst = path.join(pluginsDir, ent.name);
            // 开发期可能把 bundledDir 直接指到用户插件目录（同一路径），
            // 那样 copyDir 会自己拷自己、无限递归。同路径直接跳过。
            if (path.resolve(src) === path.resolve(dst)) continue;
            const srcVer = readVersion(src);
            const dstVer = readVersion(dst);
            if (fs.existsSync(dst) && srcVer && srcVer === dstVer) continue;
            try {
                copyDir(src, dst);
                deployed.push(ent.name);
            } catch (e) {
                log('[ext-plugins] 部署内置插件 ' + ent.name + ' 失败: ' + (e && e.message || e));
            }
        }
        if (deployed.length) log('[ext-plugins] 已部署内置插件: ' + deployed.join(', '));
        return deployed;
    }

    /**
     * 删掉一个插件目录。
     *
     * 拒绝删除随编辑器分发的内置插件：它们的源头在 bundledDir 里，
     * 删掉用户目录这份只会在下次启动时被 deployBundled() 铺回来，
     * 用户会以为「删除没生效」。与其做一件注定被撤销的事，不如明确拒绝。
     *
     * 删除前必须先把子进程杀掉 —— Windows 下「某目录是活进程的 cwd」
     * 或者被进程打开的文件都会锁住目录，直接 rm 会报 EPERM。
     * 即使杀了进程，句柄释放也有延迟，所以带重试。
     */
    function removePlugin(dir) {
        const name = String(dir || '').replace(/[\\/]+$/, '');
        // 防目录穿越：只允许删 pluginsDir 的直接子目录
        if (!name || name.indexOf('/') >= 0 || name.indexOf('\\') >= 0 || name === '.' || name === '..') {
            return {ok: false, error: '非法的插件目录名：' + dir};
        }
        const target = path.join(pluginsDir, name);
        if (path.resolve(path.dirname(target)) !== path.resolve(pluginsDir)) {
            return {ok: false, error: '目录不在插件目录内' };
        }
        if (!fs.existsSync(target)) return {ok: false, error: '插件目录不存在' };
        if (bundledDir && fs.existsSync(path.join(bundledDir, name))) {
            return {ok: false, error: 'builtin', message: '这是随编辑器分发的内置插件，不能删除。' };
        }

        // 先停掉它的 Node 服务：running 的 key 是插件 id（可能来自 plugin.json），
        // 而这里拿到的是目录名，所以要回扫一遍匹配 dir。
        for (const [pid, rec] of Array.from(running.entries())) {
            let recDir = pid;
            try {
                const mf = path.join(pluginsDir, pid, 'plugin.json');
                if (fs.existsSync(mf)) recDir = pid;
            } catch (e) { /* 用 id 兜底 */ }
            // listPlugins 的 id 与 dir 多数相同；两个都试，命中即杀
            if (recDir === name || pid === name) {
                try { rec.proc.kill(); } catch (e) { /* ignore */ }
                running.delete(pid);
                rebuildRouteTable();
            }
        }

        let lastErr = null;
        for (let i = 0; i < 5; i++) {
            try {
                fs.rmSync(target, {recursive: true, force: true, maxRetries: 3, retryDelay: 150});
                log('[ext-plugins] 已删除插件目录: ' + name);
                return {ok: true, dir: name};
            } catch (e) {
                lastErr = e;
                // 句柄释放有延迟，等一下再试
                const until = Date.now() + 250;
                while (Date.now() < until) { /* spin */ }
            }
        }
        return {ok: false, error: (lastErr && lastErr.code) || String(lastErr && lastErr.message || lastErr)};
    }

    /**
     * 把一个插件的文件写进 pluginsDir/<dirName>。
     *
     * 覆盖前先把旧目录整个删掉，理由不是洁癖：升级时如果新版本**删掉了**
     * 某个文件（比如换了 vendor 文件名），保留旧文件会让旧代码仍被加载，
     * 表现为「明明更新了却还是老行为」，极难排查。
     */
    function writePluginFiles(dirName, files) {
        const name = String(dirName || '').replace(/[\\/]+$/, '');
        if (!name || name.indexOf('/') >= 0 || name.indexOf('\\') >= 0 || name === '.' || name === '..') {
            throw new Error('非法的插件目录名：' + dirName);
        }
        const target = path.join(pluginsDir, name);
        if (path.resolve(path.dirname(target)) !== path.resolve(pluginsDir)) {
            throw new Error('目录不在插件目录内');
        }

        // 正在跑的实例会占着文件（Windows 上尤其明显），先停
        for (const [pid, rec] of Array.from(running.entries())) {
            if (pid === name || pid === (files.manifestId || name)) {
                try { rec.proc.kill(); } catch (e) { /* ignore */ }
                running.delete(pid);
                rebuildRouteTable();
            }
        }

        if (fs.existsSync(target)) {
            fs.rmSync(target, {recursive: true, force: true, maxRetries: 3, retryDelay: 150});
        }
        fs.mkdirSync(target, {recursive: true});

        for (const f of files) {
            const rel = String(f.path || '').replace(/\\/g, '/');
            // 再防一次目录穿越：文件路径来自远端仓库，不能无条件信任
            if (!rel || rel.indexOf('..') >= 0 || rel.charAt(0) === '/') continue;
            const dst = path.join(target, rel);
            if (path.resolve(dst).indexOf(path.resolve(target)) !== 0) continue;
            fs.mkdirSync(path.dirname(dst), {recursive: true});
            const buf = Buffer.isBuffer(f.content) ? f.content : Buffer.from(String(f.content || ''), 'utf8');
            fs.writeFileSync(dst, buf);
        }
        log('[ext-plugins] 已写入插件 ' + name + '（' + files.length + ' 个文件）');
        return name;
    }

    /** 启动单个插件的 Node 服务（已在跑则跳过）。 */
    function startById(id) {
        const p = listPlugins().find(x => x.id === id || x.dir === id);
        if (!p) return {ok: false, error: '插件不存在：' + id};
        if (!p.hasServer) return {ok: false, error: '该插件没有 Node 侧服务'};
        if (running.has(p.id)) return {ok: true, already: true, id: p.id};
        startOne(p);
        return {ok: true, id: p.id};
    }

    /**
     * 从 GitHub 装一个带 Node 服务的插件（市场「安装」按钮的落点）。
     *
     * 这条路径和「浏览器侧插件」完全不同：那些只是 localStorage 里的一段
     * 源码，这些是磁盘上的一个目录 + 一个会被 fork 的子进程。所以不走
     * /ext-plugins/list 那套 eval 流程，而是拉文件 → 落盘 → 起服务。
     */
    async function installFromGithub(owner, repo, dir, dirName) {
        try {
            const files = await fetchGithubDir(owner, repo, dir, log);
            // 目录名优先用调用方给的（市场清单里的 dir），否则用仓库侧目录名
            const name = writePluginFiles(dirName || dir, files);
            const started = startById(name);
            return {ok: true, dir: name, files: files.length, started};
        } catch (e) {
            return {ok: false, error: String((e && e.message) || e)};
        }
    }

    /** 启动所有带 Node 侧服务的插件。可重复调用（已在跑的会跳过）。 */
    function start() {
        // 先把内置插件铺到用户目录，再扫描 —— 否则首次启动扫到的是空目录。
        deployBundled();
        const list = listPlugins();
        let started = 0;
        for (const p of list) {
            if (!p.hasServer) continue;
            if (running.has(p.id)) continue;
            startOne(p);
            started += 1;
        }
        log('[ext-plugins] 插件目录: ' + pluginsDir + '（共 ' + list.length + ' 个，启动 Node 服务 ' + started + ' 个）');
        return list;
    }

    function dispose() {
        for (const rec of running.values()) {
            try { rec.proc.kill(); } catch (e) { /* ignore */ }
        }
        running.clear();
        rebuildRouteTable();
    }

    return {
        pluginsDir,
        dataDir,
        bundledDir,
        listPlugins,
        removePlugin,
        writePluginFiles,
        startById,
        installFromGithub,
        deployBundled,
        start,
        dispose,
        portFor,
        routeTable: () => routeTable.slice()
    };
};
