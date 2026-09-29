# 参与贡献

感谢你愿意花时间改进 Scratch 扩展编辑器。本文说明本地怎么跑起来、代码往哪放、改动怎么提。

## 开发环境

| 项 | 要求 |
|---|---|
| Node.js | 22.x（CI 用的就是 22；`.nvmrc` 里也写了） |
| 包管理 | npm |
| 操作系统 | Windows / macOS / Linux 都可以；桌面端打包目前只配了 Windows |

```bash
git clone https://github.com/dhdbvcg/scratch-extension-editor.git
cd scratch-extension-editor
npm install

# 开发服务器（默认 8601）
npm start
# 打开 http://localhost:8601/
```

生产构建：

```bash
npx webpack --colors --bail
# 产物在 build/ 下
```

> 仓库里的 `npm run build` 会先 `rimraf ./build`，这一步在部分机器上会被安全软件拦下来。构建失败时直接用上面的 `npx webpack` 即可。

## 代码地图

```
src/extension-builder/          编辑器本体
├── components/
│   ├── ExtensionBuilder.jsx    主组件：菜单 / Blockly 工作区 / 代码面板 / 浮窗
│   └── DebuggerPanel.jsx       调试器：把扩展源码编码成 Data URI 去在线编辑器加载
├── lib/
│   ├── block-definitions.js    积木定义与代码生成
│   ├── ext-addons.js           插件系统：内置 / 市场 / 数据目录三条来源
│   ├── bilup-nova/             AI 助手（含语音输入）
│   └── auth.js / saves.js      账号与云存档
└── styles/extension-builder.css

ext-plugin-runtime.js           插件运行时（Node 侧）
plugins-src/                    随编辑器分发的内置插件源码（当前为空）
website/                        官网与 Cloudflare Pages Functions
build/main.js                   桌面端（Electron）主进程
```

## 改动的几条约定

**不要恢复已经移除的东西。** 三栏调试台、`/ext-preview/*` 中间件、TurboWarp 直链发布都已被有意删除，调试器现在只走 Data URI 一条路。历史提交里能看到它们，但别再搬回来。

**注释写「为什么」，不写「做了什么」。** 代码本身能说明做了什么，注释的价值在于记录当时为什么这么选 —— 比如 `minifyForUrl()` 为什么只删整行注释而不敢动行内注释，`fork()` 的 `cwd` 为什么不能用插件目录。这类信息一旦丢掉，下一个人会把坑重踩一遍。

**UI 改动请在浏览器里实际点一遍。** 这个项目的界面大量依赖原生 DOM 与 Blockly，单测覆盖不到。提交前至少手动走一遍你改的那条路径。

**提交信息用中文，格式 `type: 一句话`**，type 取 `feat` / `fix` / `refactor` / `docs` / `chore` / `deploy`。正文里把「原来的问题是什么」和「为什么这样修」写清楚，比罗列改了哪些文件有用。

## 提交 Pull Request

1. 从 `main` 开分支：`git checkout -b fix/xxx`
2. 改完确认 `npx webpack --colors --bail` 能过
3. 推上去，开 PR，按模板填

PR 里请说明：**现象**（原来坏在哪）、**原因**（为什么坏）、**验证方式**（你怎么确认修好了）。只写「修复了 bug」的 PR 会被问回来。

## 写一个插件

插件不一定要进主仓库 —— 插件本体可以住在自己的 GitHub 仓库，用户在「设置 → 插件市场」里安装。仓库结构：

```
你的插件仓库/
├── plugin.json     清单：id / name / version / routes
├── index.js        浏览器侧界面（可选，纯 Node 插件可省）
├── server.mjs      Node 侧服务（可选）
└── vendor/         依赖产物（可选）
```

`server.mjs` 起服务后用 IPC 把端口和路由前缀报给编辑器：

```js
process.send({type: 'listening', port: server.address().port, routes: ['/your-plugin/api']});
```

编辑器会把这个前缀反向代理到你的进程，页面里直接 `fetch('/your-plugin/api/...')` 就能同源访问，不需要处理 CORS。

然后把条目加进市场清单 [dhdbvcg/scratch-ext-addon](https://github.com/dhdbvcg/scratch-ext-addon) 的 `plugins.json`，指向你的仓库即可。

## 报告问题

用 [Issue 模板](https://github.com/dhdbvcg/scratch-extension-editor/issues/new) 提，尽量带上：复现步骤、期望行为、实际行为、浏览器与系统版本、控制台报错原文。安全问题请走 [SECURITY.md](SECURITY.md)，不要开公开 Issue。

## 许可

本项目以 GPL-3.0 发布。提交贡献即表示你同意以同一许可分发你的改动。