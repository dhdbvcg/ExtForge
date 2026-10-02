const defaultsDeep = require('lodash.defaultsdeep');
const path = require('path');
const webpack = require('webpack');

// Plugins
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// PostCss
const autoprefixer = require('autoprefixer');
const postcssVars = require('postcss-simple-vars');
const postcssImport = require('postcss-import');

const STATIC_PATH = process.env.STATIC_PATH || '/static';
const APP_NAME = 'Scratch扩展编辑器';

const root = process.env.ROOT || '';
if (root.length > 0 && !root.endsWith('/')) {
    throw new Error('If ROOT is defined, it must have a trailing slash.');
}

const htmlWebpackPluginCommon = {
    root: root,
    meta: JSON.parse(process.env.EXTRA_META || '{}'),
    APP_NAME
};

// When this changes, the path for all JS files will change, bypassing any HTTP caches
const CACHE_EPOCH = 'pentapod';

const base = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devtool: process.env.SOURCEMAP || (process.env.NODE_ENV === 'production' ? false : 'cheap-module-source-map'),
    devServer: {
        // build：页面产物；voice：语音识别运行时 + SenseVoice 模型（大文件直接静态服务，不进 webpack 编译）
        contentBase: [path.resolve(__dirname, 'build'), path.resolve(__dirname, 'voice')],
        host: '0.0.0.0',
        disableHostCheck: true,
        compress: true,
        port: process.env.PORT || 8601,
        // 语音识别 API（SenseVoiceSmall，Node 侧本地解码，同源免 CORS）
        before(app) {
            const voiceDecode = require('./voice-decode');
            const MAX_PCM_BYTES = 32 * 1024 * 1024; // ≈ 16 分钟 @16kHz Int16

            // ── 编辑器插件：数据目录与 Node 侧运行时 ──
            // 编辑器的数据文件夹 = Electron userData（productName = scratch-extension-editor）。
            // 浏览器读不了本地文件夹，所以由 Node 侧扫描后喂给页面；
            // 「终端安装 → 重开编辑器就出现」这条链路全靠这里。
            const EDITOR_DATA_DIR = (function () {
                if (process.env.SCRATCH_EDITOR_DATA_DIR) return process.env.SCRATCH_EDITOR_DATA_DIR;
                const os = require('os');
                const home = os.homedir();
                if (process.platform === 'win32') {
                    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'scratch-extension-editor');
                }
                if (process.platform === 'darwin') {
                    return path.join(home, 'Library', 'Application Support', 'scratch-extension-editor');
                }
                return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'scratch-extension-editor');
            })();
            const PLUGINS_DIR = path.join(EDITOR_DATA_DIR, 'plugins');
            const pluginRuntime = require('./ext-plugin-runtime')({
                pluginsDir: PLUGINS_DIR,
                dataDir: EDITOR_DATA_DIR,
                // 随编辑器分发的内置插件。首次启动时由运行时铺到 PLUGINS_DIR ——
                // 用户装完编辑器，插件目录是空的，得有人替他放进去。
                bundledDir: path.join(__dirname, 'plugins-src')
            });

            // ── DSH deepseek-web-vision 插件 API 同源代理 ──
            // 该插件是跑在 DSH Node 侧的 cordis 插件，对外只挂 HTTP API
            // （前缀 /deepseek-web-vision/api），响应不带 Access-Control-Allow-Origin，
            // 且 OPTIONS 预检直接 404。浏览器从 8601 直连 3080 属跨源，读不到响应。
            // 这里在 devServer 内做一层同源反向代理：页面只需请求同源的
            // /deepseek-web-vision/api/*，由 Node 侧转发到 DSH Web 端口。
            // 端口可用 DSH_WEB_PORT 覆盖（默认 3080）。
            const DSH_WEB_PORT = parseInt(process.env.DSH_WEB_PORT, 10) || 3080;
            const DSW_PREFIX = '/deepseek-web-vision/api';

            // ── workbuddy-bridge 同源反代 ──
            // 注意：这里不能用 app.use('/workbuddy-ai/api', ...) —— devServer 3.x
            // 传给 before 的 app 挂在内部中间件栈里，实测带前缀的 app.use 永远
            // 匹配不上（同栈的 app.get 精确路由却正常），表现为 404。改成无前缀
            // 中间件 + 手动路径匹配，行为等价。
            app.use((req, res, next) => {
                const p = String(req.url || '').split('?')[0];
                if (p !== '/workbuddy-ai/api' && p.indexOf('/workbuddy-ai/api/') !== 0) return next();
                const http = require('http');
                const pluginPort = pluginRuntime.portFor(p);
                if (!pluginPort) {
                    res.status(502).json({error: 'workbuddy-bridge 插件未运行'});
                    return;
                }
                const up = http.request({
                    hostname: '127.0.0.1',
                    port: pluginPort,
                    path: p,
                    method: req.method,
                    headers: Object.assign({}, req.headers, {host: '127.0.0.1:' + pluginPort})
                }, (r) => {
                    res.writeHead(r.statusCode || 502, r.headers);
                    r.pipe(res);
                });
                up.on('error', (e) => {
                    if (res.headersSent) { res.end(); return; }
                    res.status(502).json({error: 'workbuddy-bridge 服务不可达：' + String(e && e.message || e)});
                });
                req.pipe(up);
            });

            app.use(DSW_PREFIX, (req, res) => {
                const http = require('http');

                // ── 优先转发给「编辑器数据文件夹里装的插件」 ──
                // deepseek-web-panel 这类插件自带 Node 侧服务，装进数据文件夹后
                // 由 pluginRuntime fork 起来。它在了就不需要 DSH —— 这条路径让
                // 编辑器完全自包含：不装 DSH、不装任何 DSH 插件也能用网页版模型。
                // 只有没装该插件时才回落到 DSH 的 3080 代理（开发期兼容）。
                // 注意：Express 的 app.use(prefix) 会把前缀从 req.url 里剥掉，
                // 这里拿到的是 '/xxx' 而不是 '/deepseek-web-vision/api/xxx'。
                // 路由表里存的是插件声明的**完整前缀**，所以查表要把前缀拼回去，
                // 否则永远匹配不上、静默回落到 DSH（表现为「插件跑起来了但请求还是走 DSH」）。
                const fullPath = DSW_PREFIX + String(req.url || '/');
                const pluginPort = pluginRuntime.portFor(fullPath);
                const upPort = pluginPort || DSH_WEB_PORT;
                const upPath = fullPath;
                if (pluginPort) {
                    // 插件侧的路由前缀就是 /deepseek-web-vision/api，原样透传即可，
                    // 也不需要 GET→POST 的方法改写（那是为迁就 DSH 侧路由做的）。
                    const up = http.request({
                        hostname: '127.0.0.1',
                        port: upPort,
                        path: upPath,
                        method: req.method,
                        headers: Object.assign({}, req.headers, {host: '127.0.0.1:' + upPort})
                    }, (r) => {
                        res.writeHead(r.statusCode || 502, r.headers);
                        r.pipe(res);
                    });
                    up.on('error', (e) => {
                        if (res.headersSent) { res.end(); return; }
                        res.status(502).json({error: '插件服务不可达：' + String(e && e.message || e)});
                    });
                    req.pipe(up);
                    return;
                }

                // ── GET /models → POST /models ──
                // Bilup Nova 的「刷新模型」按 OpenAI 惯例发 GET ${baseUrl}/models，
                // 而 dsh-deepseek-web-vision 的 /models 路由只挂了 POST（GET 走 404）。
                // 两者语义完全一致（都不带参数、只读），所以在代理层做一次方法改写，
                // 免得为了迁就前端去改插件源码。
                let method = req.method;
                const barePath = String(req.url || '/').split('?')[0].replace(/\/+$/, '');
                const isGetModels = method === 'GET' && (barePath === '/models' || barePath === '/v1/models');
                const synthBody = isGetModels ? Buffer.from('{}') : null;
                if (isGetModels) method = 'POST';

                const headers = Object.assign({}, req.headers, {host: '127.0.0.1:' + DSH_WEB_PORT});
                if (synthBody) {
                    headers['content-type'] = 'application/json';
                    headers['content-length'] = String(synthBody.length);
                }

                const upstream = http.request({
                    hostname: '127.0.0.1',
                    port: DSH_WEB_PORT,
                    path: DSW_PREFIX + (req.url || '/'),
                    method: method,
                    headers: headers
                }, (up) => {
                    res.writeHead(up.statusCode || 502, up.headers);
                    up.pipe(res);
                });
                upstream.on('error', (e) => {
                    if (res.headersSent) { res.end(); return; }
                    res.status(502).json({
                        error: 'DSH 侧 deepseek-web-vision 不可达（端口 ' + DSH_WEB_PORT + '）：' + String(e && e.message || e),
                        hint: '确认 DSH Web GUI 正在运行，或用 DSH_WEB_PORT 指定实际端口'
                    });
                });
                if (synthBody) upstream.end(synthBody);
                else req.pipe(upstream);
            });

            // ── GitHub OAuth Device Flow 同源代理 ──
            // GitHub 的 /login/device/code 与 /login/oauth/access_token 不返回
            // CORS 头，浏览器从 8601 直连会 TypeError: Failed to fetch。这里在
            // devServer 内转发到 github.com，页面只请求同源 /github-oauth/*。
            // Device Flow 本身不需要 client_secret，故代理不注入任何凭据，
            // 前端只持有公开的 client_id。全程不经过 scratchextensioneditor.cc.cd。
            const GITHUB_OAUTH_PREFIX = '/github-oauth';
            app.use(GITHUB_OAUTH_PREFIX, (req, res) => {
                const https = require('https');
                const chunks = [];
                req.on('data', (c) => chunks.push(c));
                req.on('end', () => {
                    const body = Buffer.concat(chunks);
                    const upstream = https.request({
                        hostname: 'github.com',
                        port: 443,
                        // req.url 已被 Express 剥掉 /github-oauth 前缀
                        path: '/login' + (req.url || '/'),
                        method: req.method,
                        // 本机 Node 的根证书库常与企业代理 / 自签中间证书冲突，表现为
                        // `unable to verify the first certificate`，代理会直接 502。
                        // 这里只代理 github.com 上两个公开的 OAuth 端点、不传任何凭据、
                        // 响应也只透传给本机页面，故开发期放宽链校验以换取可用性。
                        // 生产环境不经过这个代理（Device Flow 走的是部署后的同源反代）。
                        rejectUnauthorized: false,
                        headers: {
                            'content-type': req.headers['content-type'] || 'application/json',
                            'accept': 'application/json',
                            'content-length': String(body.length),
                            'user-agent': 'Scratch-Extension-Editor',
                            host: 'github.com'
                        }
                    }, (up) => {
                        // GitHub 在轮询期间会返回 200 + body.error=authorization_pending，
                        // 也返回 400 + error，两种情况都原样透传给前端判断。
                        res.writeHead(up.statusCode || 502, {
                            'content-type': up.headers['content-type'] || 'application/json; charset=utf-8',
                            'cache-control': 'no-store'
                        });
                        up.pipe(res);
                    });
                    upstream.on('error', (e) => {
                        if (res.headersSent) { res.end(); return; }
                        res.writeHead(502, {'content-type': 'application/json; charset=utf-8'});
                        res.end(JSON.stringify({
                            error: 'github_unreachable',
                            error_description: String(e && e.message || e)
                        }));
                    });
                    if (body.length) upstream.end(body);
                    else upstream.end();
                });
            });

            app.get('/voice-api/status', (req, res) => {
                try {
                    res.json(voiceDecode.getStatus());
                } catch (e) {
                    res.status(500).json({error: String(e && e.message || e)});
                }
            });

            // 预热：提前加载模型（首次解码不再卡）
            app.get('/voice-api/warmup', async (req, res) => {
                try {
                    await voiceDecode.ensureRecognizer();
                    res.json({ok: true, ...voiceDecode.getStatus()});
                } catch (e) {
                    res.status(500).json({error: String(e && e.message || e)});
                }
            });

            app.post('/voice-api/decode', (req, res) => {
                const rate = parseInt(req.query.rate, 10) || 16000;
                const chunks = [];
                let size = 0;
                let aborted = false;
                req.on('data', (c) => {
                    if (aborted) return;
                    size += c.length;
                    if (size > MAX_PCM_BYTES) {
                        aborted = true;
                        res.status(413).json({error: 'PCM too large'});
                        req.destroy();
                        return;
                    }
                    chunks.push(c);
                });
                req.on('error', () => { aborted = true; });
                req.on('end', async () => {
                    if (aborted) return;
                    try {
                        const buf = Buffer.concat(chunks);
                        if (buf.length < 32000) { // < 1s @16k
                            res.status(400).json({error: 'audio too short'});
                            return;
                        }
                        const t0 = Date.now();
                        const result = await voiceDecode.decodeInt16Buffer(buf, rate);
                        res.json({ok: true, ms: Date.now() - t0, ...result});
                    } catch (e) {
                        res.status(500).json({error: String(e && e.message || e)});
                    }
                });
            });

            // 插件清单：浏览器读不了本地文件夹，由这里扫完送过去。
            app.get('/ext-plugins/list', (req, res) => {
                try {
                    res.json({ok: true, dir: PLUGINS_DIR, plugins: pluginRuntime.listPlugins()});
                } catch (e) {
                    res.status(500).json({ok: false, error: String(e && e.message || e)});
                }
            });

            // 启动单个插件的 Node 侧服务。
            // devServer 启动时 start() 只拉起当时已存在的插件；用户把新插件
            // 拷进 plugins 目录（或市场装完）后，页面需要一条「后装后启」的路。
            app.post('/ext-plugins/start', (req, res) => {
                let raw = '';
                req.on('data', (c) => {
                    raw += c;
                    if (raw.length > 4096) req.destroy();
                });
                req.on('end', () => {
                    let id = '';
                    try { id = String((JSON.parse(raw || '{}') || {}).id || ''); } catch (e) { /* 下面统一报错 */ }
                    if (!id) return res.status(400).json({ok: false, error: '缺少 id 参数'});
                    try {
                        const out = pluginRuntime.startById(id);
                        res.status(out.ok ? 200 : 400).json(out);
                    } catch (e) {
                        res.status(500).json({ok: false, error: String(e && e.message || e)});
                    }
                });
            });

            // 删除插件目录。内置（随编辑器分发）的会被运行时拒绝，见 removePlugin()。
            // 不挂 body-parser：这里只收一个目录名，自己收最稳。
            app.post('/ext-plugins/remove', (req, res) => {
                let raw = '';
                req.on('data', (c) => {
                    raw += c;
                    // 只收一个目录名，超过 8KB 一定是异常请求
                    if (raw.length > 8192) req.destroy();
                });
                req.on('end', () => {
                    let dir = '';
                    try { dir = (JSON.parse(raw || '{}') || {}).dir || ''; } catch (e) { /* 下面统一报错 */ }
                    if (!dir) return res.status(400).json({ok: false, error: '缺少 dir 参数'});
                    let out;
                    try { out = pluginRuntime.removePlugin(dir); } catch (e) { out = {ok: false, error: String(e && e.message || e)}; }
                    res.status(out.ok ? 200 : 400).json(out);
                });
            });

            // 从 GitHub 安装**外置插件**（市场「安装」按钮的落点）。
            // 和 /ext-plugins/list 那条路不同：这里要落盘 + 起子进程，
            // 所以必须由 Node 侧去拉文件，浏览器只发一个 owner/repo/dir。
            app.post('/ext-plugins/install', (req, res) => {
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
                    // dir 允许为空 —— 空表示「仓库根目录就是插件本体」。
                    // 早期版本把它当必填，导致住在独立仓库根目录的插件（如
                    // scratch-deepseek-web-panel）永远装不上，报「缺少参数」，
                    // 而请求里其实什么参数都不缺。
                    const dir = String(body.dir == null ? '' : body.dir).trim();
                    const dirName = String(body.dirName || dir).trim();
                    if (!owner || !repo || !dirName) {
                        res.status(400).json({ok: false, error: '缺少 owner / repo / dirName 参数'});
                        return;
                    }
                    try {
                        const out = await pluginRuntime.installFromGithub(owner, repo, dir, dirName);
                        res.status(out.ok ? 200 : 400).json(out);
                    } catch (e) {
                        res.status(500).json({ok: false, error: String((e && e.message) || e)});
                    }
                });
            });

            // 启动所有带 Node 侧服务的插件（它们各自 fork 成子进程）。
            pluginRuntime.start();

        },
        // allows ROUTING_STYLE=wildcard to work properly
        historyApiFallback: {
            rewrites: []
        }
    },
    output: {
        library: 'GUI',
        filename: (
            process.env.NODE_ENV === 'production' ? `js/${CACHE_EPOCH}/[name].[contenthash].js` : 'js/[name].js'
        ),
        chunkFilename: (
            process.env.NODE_ENV === 'production' ? `js/${CACHE_EPOCH}/[name].[contenthash].js` : 'js/[name].js'
        ),
        publicPath: root
    },
    resolve: {
        symlinks: false
    },
    module: {
        rules: [{
            test: /\.jsx?$/,
            loader: 'babel-loader',
            include: [
                path.resolve(__dirname, 'src'),
                /node_modules[\\/]scratch-[^\\/]+[\\/]src/,
                /node_modules[\\/]pify/,
                /node_modules[\\/]@vernier[\\/]godirect/
            ],
            options: {
                // Explicitly disable babelrc so we don't catch various config
                // in much lower dependencies.
                babelrc: false,
                plugins: [
                    ['react-intl', {
                        messagesDir: './translations/messages/'
                    }]],
                presets: ['@babel/preset-env', '@babel/preset-react']
            }
        },
        {
            test: /\.css$/,
            use: [{
                loader: 'style-loader'
            }, {
                loader: 'css-loader',
                options: {
                    modules: true,
                    importLoaders: 1,
                    localIdentName: '[name]_[local]_[hash:base64:5]',
                    camelCase: true
                }
            }, {
                loader: 'postcss-loader',
                options: {
                    ident: 'postcss',
                    plugins: function () {
                        return [
                            postcssImport,
                            postcssVars,
                            autoprefixer
                        ];
                    }
                }
            }]
        }]
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'node_modules/scratch-blocks/media',
                    to: 'static/blocks-media/default'
                },
                {
                    from: 'node_modules/scratch-blocks/media',
                    to: 'static/blocks-media/high-contrast'
                }
            ]
        })
    ]
};

if (!process.env.CI) {
    base.plugins.push(new webpack.ProgressPlugin());
}

module.exports = [
    // to run editor examples
    defaultsDeep({}, base, {
        entry: {
            'editor': './src/playground/editor.jsx'
        },
        output: {
            path: path.resolve(__dirname, 'build')
        },
        module: {
            rules: base.module.rules.concat([
                {
                    test: /\.(svg|png|wav|mp3|gif|jpg|woff2|hex)$/,
                    loader: 'url-loader',
                    options: {
                        limit: 2048,
                        outputPath: 'static/assets/',
                        esModule: false
                    }
                }
            ])
        },
        optimization: {
            splitChunks: {
                chunks: 'all',
                minChunks: 2,
                minSize: 50000,
                maxInitialRequests: 5
            }
        },
        plugins: base.plugins.concat([
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': `"${process.env.NODE_ENV}"`,
                'process.env.DEBUG': Boolean(process.env.DEBUG),
                'process.env.ENABLE_SERVICE_WORKER': JSON.stringify(process.env.ENABLE_SERVICE_WORKER || ''),
                'process.env.ROOT': JSON.stringify(root),
                'process.env.ROUTING_STYLE': JSON.stringify(process.env.ROUTING_STYLE || 'filehash'),
                'process.env.ENABLE_WINDCHIMES': JSON.stringify(process.env.ENABLE_WINDCHIMES || '')
            }),
            new HtmlWebpackPlugin({
                chunks: ['editor'],
                template: 'src/playground/index.ejs',
                filename: 'index.html',
                title: 'scratch扩展编辑器',
                isEditor: true,
                hash: true,
                ...htmlWebpackPluginCommon
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'static',
                        to: ''
                    }
                ]
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'extensions/**',
                        to: 'static',
                        context: 'src/examples'
                    }
                ]
            })
        ])
    })
];
