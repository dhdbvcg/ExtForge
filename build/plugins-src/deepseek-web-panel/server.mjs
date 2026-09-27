/**
 * DeepSeek 网页版插件 —— Node 侧入口
 * ================================================================
 * 这个文件由编辑器（devServer / Electron main）在启动时 spawn 成**独立子进程**，
 * 不是网页代码。它做三件事：
 *
 *   1. 喂一个最小 ctx shim，把 vendor/deepseek-web-host.mjs 跑起来
 *      —— 那份 418KB 的产物原本是 DSH 的 cordis 插件，只需要 ctx 上很少几个面
 *      （logger / effect / get / llm.registerAdapter / webServer.register）；
 *   2. 起一个只监听 127.0.0.1 的 http server，把 host bundle 注册的
 *      prefix handler 挂上去；
 *   3. 通过 fork 的 IPC 把实际端口回传给父进程（编辑器），由编辑器把
 *      /deepseek-web-vision/api/* 反代到这里。
 *
 * 端口用 0（系统分配）而不是固定值：编辑器可能同时开着多个版本，
 * 固定端口会互相抢占，而「谁占了」这类错误对用户毫无意义。
 */
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST_BUNDLE = join(HERE, 'vendor', 'deepseek-web-host.mjs');

/** host bundle 注册进来的 prefix handler（目前只有一个）。 */
const registrations = [];

/** 已注册的 provider id，供 ctx.llm.listProviders() 查询（见下面的注释）。 */
const registeredProviderIds = new Set();

/**
 * 最小 ctx shim。
 *
 * 刻意保持极简：host bundle 里真正依赖宿主的只有 llm.registerAdapter
 * （我们不需要它接进 DSH 的 LLM 路由，所以是空实现）和 webServer.register
 * （这是我们要的东西）。其余 ctx.effect / ctx.get 只要求「存在且可调用」。
 *
 * 注意 ctx.get('attachments') 返回 undefined 是**预期行为**：
 * host bundle 会把图片输入降级为文本，并在界面上如实说明，
 * 而不是抛异常让整个插件挂掉。
 */
const ctx = {
    logger: {
        info: (...a) => console.log('[deepseek-web-panel]', ...a),
        warn: (...a) => console.warn('[deepseek-web-panel]', ...a),
        error: (...a) => console.error('[deepseek-web-panel]', ...a),
        debug: () => {}
    },
    effect(fn) {
        try {
            const disposer = fn();
            return typeof disposer === 'function' ? disposer : undefined;
        } catch (e) {
            console.error('[deepseek-web-panel] ctx.effect 执行失败:', e && e.message || e);
            return undefined;
        }
    },
    get(name) {
        // 没有宿主服务可借。attachments 缺失会让图片输入降级（见上）。
        console.log('[deepseek-web-panel] ctx.get(' + name + ') → 未提供');
        return undefined;
    },
    llm: {
        // 编辑器不需要把网页模型注册进 DSH 的 LLM 路由，只借用它的管理界面与 API。
        // 但 registerAdapter / listProviders 这对方法必须**成对**提供：
        // 管理界面用 listProviders() 的返回值渲染「Provider 已注册」那一栏，
        // 只给 registerAdapter 的话该调用会抛错，被上游 `catch {}` 吞掉后
        // 面板会长期显示「否」——看起来像插件没装配成功，实际只是缺个查询方法。
        registerAdapter(route) {
            const id = Array.isArray(route) ? route[0] : route;
            if (id) registeredProviderIds.add(String(id));
            console.log('[deepseek-web-panel] host bundle 注册 provider:', JSON.stringify(route));
        },
        listProviders() {
            return Array.from(registeredProviderIds).map((id) => ({id}));
        }
    },
    webServer: {
        register(opts) {
            registrations.push(opts);
            console.log('[deepseek-web-panel] host bundle 挂载路由:', opts.kind, opts.path);
        }
    }
};

let hostMod;
try {
    hostMod = await import(pathToFileURL(HOST_BUNDLE).href);
} catch (e) {
    console.error('[deepseek-web-panel] 加载 host bundle 失败:', e && e.stack || String(e));
    process.exit(1);
}

try {
    const r = hostMod.apply(ctx, {});
    if (r && typeof r.then === 'function') await r;
} catch (e) {
    console.error('[deepseek-web-panel] host bundle apply 失败:', e && e.stack || String(e));
    process.exit(1);
}

const server = createServer((req, res) => {
    const url = String(req.url || '/');
    const reg = registrations.find(r => typeof r.path === 'string' && url.startsWith(r.path));
    if (!reg) {
        res.writeHead(404, {'content-type': 'application/json; charset=utf-8'});
        res.end(JSON.stringify({ok: false, error: 'no plugin route for ' + url}));
        return;
    }
    try {
        const ret = reg.handler(req, res);
        if (ret && typeof ret.catch === 'function') {
            ret.catch((e) => {
                console.error('[deepseek-web-panel] handler 异常:', e && e.message || e);
                if (!res.headersSent) {
                    res.writeHead(500, {'content-type': 'application/json; charset=utf-8'});
                    res.end(JSON.stringify({ok: false, error: String(e && e.message || e)}));
                }
            });
        }
    } catch (e) {
        console.error('[deepseek-web-panel] handler 同步抛错:', e && e.message || e);
        if (!res.headersSent) {
            res.writeHead(500, {'content-type': 'application/json; charset=utf-8'});
            res.end(JSON.stringify({ok: false, error: String(e && e.message || e)}));
        }
    }
});

server.on('error', (e) => {
    console.error('[deepseek-web-panel] server 启动失败:', e && e.message || e);
    if (process.send) process.send({type: 'error', error: String(e && e.message || e)});
    process.exit(1);
});

// 端口 0 = 让系统分配空闲端口，避免多个编辑器实例互相抢占。
server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    console.log('[deepseek-web-panel] 已监听 127.0.0.1:' + port);
    if (process.send) process.send({type: 'listening', port, routes: registrations.map(r => r.path)});
});

// 父进程消失时跟着退出，避免留下孤儿进程。
process.on('disconnect', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
