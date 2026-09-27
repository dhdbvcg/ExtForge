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
        deployBundled,
        start,
        dispose,
        portFor,
        routeTable: () => routeTable.slice()
    };
};
