const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// 隐藏默认菜单栏（与网页版一致）
Menu.setApplicationMenu(null);

// MIME 类型映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.eot':  'application/vnd.ms-fontobject',
  '.map':  'application/json',
  '.wasm': 'application/wasm',
};

const ROOT = __dirname;
const PORT = 18790;

/** 编辑器插件运行时（app ready 后创建，见 createWindow）。 */
let pluginRuntime = null;

// 简单静态文件服务器（仅监听 localhost，供 hCaptcha 等 HTTP-origin 服务使用）
function createServer() {
  return http.createServer((req, res) => {
    // 安全：只接受来自本机的请求
    if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let urlPath = decodeURI(req.url);
    // 去掉查询字符串和锚点
    const qi = urlPath.indexOf('?');
    if (qi !== -1) urlPath = urlPath.substring(0, qi);
    const hi = urlPath.indexOf('#');
    if (hi !== -1) urlPath = urlPath.substring(0, hi);
    // ── 编辑器插件：清单接口 + Node 服务反代 ──
    // 网页版走 devServer 的 before 中间件，打包版走这里，两边行为必须一致，
    // 否则「终端装了插件、网页版能用、装出来的 exe 却看不到」。
    if (pluginRuntime) {
      if (urlPath === '/ext-plugins/list') {
        try {
          const body = JSON.stringify({
            ok: true,
            dir: pluginRuntime.pluginsDir,
            plugins: pluginRuntime.listPlugins(),
          });
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(body);
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
        }
        return;
      }

      // 删除插件目录。内置（随编辑器分发）的会被运行时拒绝，见 removePlugin()。
      if (urlPath === '/ext-plugins/remove' && req.method === 'POST') {
        let raw = '';
        req.on('data', (c) => {
          raw += c;
          if (raw.length > 8192) req.destroy();
        });
        req.on('end', () => {
          let dir = '';
          try { dir = (JSON.parse(raw || '{}') || {}).dir || ''; } catch (e) { /* 下面统一报错 */ }
          if (!dir) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: '缺少 dir 参数' }));
            return;
          }
          let out;
          try {
            out = pluginRuntime.removePlugin(dir);
          } catch (e) {
            out = { ok: false, error: String((e && e.message) || e) };
          }
          res.writeHead(out.ok ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(out));
        });
        return;
      }

      // 从 GitHub 安装**外置插件**（市场「安装」按钮的落点）。
      // 与 /ext-plugins/list 不同：这里要落盘 + 起子进程，必须由 Node 侧拉文件。
      if (urlPath === '/ext-plugins/install' && req.method === 'POST') {
        let raw = '';
        req.on('data', (c) => {
          raw += c;
          if (raw.length > 8192) req.destroy();
        });
        req.on('end', async () => {
          let body = {};
          try { body = JSON.parse(raw || '{}') || {}; } catch (e) { /* 下面统一报错 */ }
          const owner = String(body.owner || '').trim();
          const repo = String(body.repo || '').trim();
          // dir 允许为空 —— 空表示「仓库根目录就是插件本体」，见 webpack.config.js 同名端点。
          const dir = String(body.dir == null ? '' : body.dir).trim();
          const dirName = String(body.dirName || dir).trim();
          if (!owner || !repo || !dirName) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: '缺少 owner / repo / dirName 参数' }));
            return;
          }
          let out;
          try {
            out = await pluginRuntime.installFromGithub(owner, repo, dir, dirName);
          } catch (e) {
            out = { ok: false, error: String((e && e.message) || e) };
          }
          res.writeHead(out.ok ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(out));
        });
        return;
      }

      // 路由表里的前缀是插件自报的完整路径（如 /deepseek-web-vision/api），
      // 命中就整段透传，插件子进程自己解析剩余部分。
      const pluginPort = pluginRuntime.portFor(urlPath);
      if (pluginPort) {
        const up = http.request({
          hostname: '127.0.0.1',
          port: pluginPort,
          path: req.url,
          method: req.method,
          headers: Object.assign({}, req.headers, { host: '127.0.0.1:' + pluginPort }),
        }, (r) => {
          res.writeHead(r.statusCode || 502, r.headers);
          r.pipe(res);
        });
        up.on('error', (e) => {
          if (res.headersSent) { res.end(); return; }
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: '插件服务不可达：' + String((e && e.message) || e) }));
        });
        req.pipe(up);
        return;
      }
    }

    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    const filePath = path.join(ROOT, urlPath);
    const ext = path.extname(filePath).toLowerCase();

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found: ' + req.url);
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  });
}

async function createWindow() {
  await app.whenReady();

  // ── 编辑器插件运行时 ──
  // 插件装在 userData/plugins/（= %APPDATA%\scratch-extension-editor\plugins，
  // 与 devServer 侧算出来的路径一致）。带 server.mjs / server.js 的插件会被
  // fork 成独立子进程，它回报的端口由 pluginRuntime 记成一张路由表，
  // 上面的 HTTP server 据此把请求反代过去。
  if (!pluginRuntime) {
    try {
      pluginRuntime = require('./ext-plugin-runtime')({
        pluginsDir: path.join(app.getPath('userData'), 'plugins'),
        dataDir: app.getPath('userData'),
        // 随编辑器分发的内置插件。首次启动时由运行时铺到 plugins/ ——
        // 用户装完编辑器，插件目录是空的，得有人替他放进去。
        bundledDir: path.join(__dirname, 'plugins-src'),
        log: (...a) => console.log(...a),
      });
      pluginRuntime.start();
    } catch (e) {
      // 插件系统坏了不该让编辑器打不开
      console.error('[ext-plugins] 运行时初始化失败:', (e && e.message) || e);
    }
  }

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.listen(PORT, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'favicon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    }
  });

  win.loadURL('http://127.0.0.1:' + PORT + '/index.html');

  // 首次启动（或快捷方式不存在时）自动创建桌面快捷方式
  ensureDesktopShortcut();

  // 窗口关闭时停止服务器
  win.on('closed', () => server.close());
}

// 创建桌面快捷方式（幂等：已存在则跳过）
function ensureDesktopShortcut() {
  const { shell } = require('electron');
  const desktopPath = app.getPath('desktop');
  const shortcutPath = path.join(desktopPath, 'scratch-extension-editor.lnk');
  if (!fs.existsSync(shortcutPath)) {
    try {
      shell.writeShortcutLink(shortcutPath, 'target', [
        path.join(process.resourcesPath, 'app', 'scratch-extension-editor.exe')
      ].join(''));
    } catch (e) {
      // 静默失败，不影响主功能
    }
  }
}

createWindow();

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
