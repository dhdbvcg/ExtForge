# Scratch 扩展编辑器

**像做 Scratch 项目一样做 Scratch 扩展。**

基于 [TurboWarp/scratch-gui](https://github.com/TurboWarp/scratch-gui) 深度定制的可视化扩展编辑器。在图形界面里拼积木、写代码、一键导出能在 TurboWarp 跑的扩展 —— 不需要打开编辑器源码，也不需要懂 webpack。

[官网](https://scratchextensioneditor.cc.cd) · [插件市场](https://github.com/dhdbvcg/scratch-ext-addon) · [问题反馈](https://github.com/dhdbvcg/scratch-extension-editor/issues)

---

## 它是什么

写一个 Scratch 扩展，传统上意味着：克隆 TurboWarp 的扩展仓库 → 找到 `extension-manager` → 照着已有扩展抄一份 `getInfo()` → 处理积木颜色、参数类型、`Blockly` 定义 → 装依赖 → 打包 → 在编辑器里手动加载调试。改一次积木名字，这一圈要重走一遍。

这个项目把这一圈压成一个界面：

- **左侧**：积木清单，点「+」加一个积木，选类型（命令 / 报告器 / 布尔 / 帽子 / C 形）
- **中间**：Blockly 工作区，每个积木的参数直接可视化编辑，外观与官方 Scratch 3.0 / TurboWarp 像素级一致
- **右侧**：实时生成的扩展 JS 源码，可以手动改，改完能反同步回积木
- **调试器**：把源码编码成 Data URI，一键在 TurboWarp / RemixWarp 里打开并加载

---

## 功能

### 扩展构建器

- 五种积木形态：命令、报告器、布尔、帽子、C 形
- 积木类别、颜色、参数类型与官方规范一致（颜色统一走 `#RRGGBB` + `resolveBlockColour`）
- 参数支持文本、数字、布尔、下拉菜单、颜色、角度、矩阵、音符等
- 生成的代码带完整的 `getInfo()` / `blocks` / 参数定义，可直接被 TurboWarp 加载
- JS 文件导入 / 导出，方便手写与图形化混合编辑

### 调试器：Data URI 直载

调试器不跑本地服务器，也不需要把你的扩展传到公网。它把源码做 base64 后拼进在线编辑器的 `?extension=` 参数：

```
https://turbowarp.org/editor?extension=data:text/javascript;base64,<...>
```

这条路和 [CB-ExtGallary](https://github.com/chessbrain/CB-ExtGallary) 用的是同一个机制，好处是**不需要公网直链、不经过任何中间服务器**。

两个实现细节值得说明：

- **用 base64 而不是 `encodeURIComponent`。** 中文积木名在 UTF-8 下每字 4 字节，`%XX` 转义会膨胀成 9 字节。实测 7.8 KB 源码 base64 后 4.1 KB，而百分号编码要 10 KB 以上。
- **`minifyForUrl()` 只删整行注释、空行和行首缩进。** 行内注释不敢动 —— 一句 `http://` 就会误伤。模板字符串按反引号配对跳过。压缩后还要过一遍 `new Function()` 语法自检，解析失败就退回原文，宁可链接长一点也不给你一个打不开的页面。

链接过长时 TurboWarp 会返回 520，所以调试器同时保留「下载 .js」作为手动加载的退路。

### 插件系统

编辑器本身可以被插件扩展。插件**不随编辑器分发**，本体住在各自的 GitHub 仓库，用户在「设置 → 插件市场」里安装。

插件分两类：

| 类型 | 组成 | 能力 |
|---|---|---|
| 页面插件 | `index.js` | 往界面注入按钮、面板、样式 |
| Node 插件 | `server.mjs` + `plugin.json` | 起本地服务，提供 API、接模型、读写文件 |

带 `server.mjs` 的插件会被 fork 成独立子进程，用 IPC 报回自己的端口和路由前缀，编辑器据此建路由表并反向代理。页面里 `fetch('/你的前缀/...')` 就能同源访问，不用处理 CORS。

端口由操作系统分配（传 `0`），所以开多个编辑器实例不会撞端口。

已上架的例子：**[DeepSeek 网页版](https://github.com/dhdbvcg/scratch-deepseek-web-panel)** —— 把 chat.deepseek.com 的网页模型接进编辑器，含登录态捕获、账号库、PoW 求解、SSE 流式与图片理解。

自己写插件的完整说明见 [CONTRIBUTING.md](CONTRIBUTING.md#写一个插件)。

### AI 助手与实时协作

- AI 助手面板，可接入多种模型
- 语音输入：浏览器录音 → 本机解码，音频不出机器（见下）
- 实时协作：多人同时编辑

### 账号与存档

- 注册 / 登录 / 登出，密码 SHA-256 + 盐
- 按账号分区存储项目，可接 Supabase 云端同步
- `#sync=` 同步链接，在任意部署之间转移账号与存档
- GitHub OAuth 登录（PKCE，纯前端流程，不需要 client_secret）

### 桌面端

除网页版外提供 Windows 桌面版（Electron），打包配置在 `build/`。桌面版与网页版行为一致 —— 同一套插件运行时，同一个 `/ext-plugins/list` 接口，同一条反向代理路径。

```bash
cd build
npm install
npm start              # 起开发版
npm run build          # 出 NSIS 安装包
```

---

## 快速开始

```bash
# 需要 Node.js 22.x（见 .nvmrc）
git clone https://github.com/dhdbvcg/scratch-extension-editor.git
cd scratch-extension-editor
npm install

npm start
# 打开 http://localhost:8601/
```

生产构建：

```bash
npx webpack --colors --bail
# 产物输出到 build/
```

> `npm run build` 会先 `rimraf ./build`，这一步在部分机器上会被安全软件拦下来。构建失败时直接用上面的 `npx webpack` 即可。

---

## 目录结构

```
src/extension-builder/
├── components/
│   ├── ExtensionBuilder.jsx      主组件：菜单 / Blockly 工作区 / 代码面板 / 浮窗
│   └── DebuggerPanel.jsx         调试器：Data URI 启动器
├── lib/
│   ├── block-definitions.js      积木定义与代码生成
│   ├── ext-addons.js             插件系统：内置 / 市场 / 数据目录
│   ├── bilup-nova/               AI 助手
│   ├── auth.js / saves.js        账号与云存档
│   └── tw-lazy-scratch-blocks.js scratch-blocks 懒加载
└── styles/extension-builder.css

ext-plugin-runtime.js             插件运行时（Node 侧）：扫描、部署、fork、反代
build/main.js                     桌面端（Electron）主进程
website/                          官网与 Cloudflare Pages Functions
static/                           静态页面：编辑器入口、插件开发文档
voice-decode.js                   语音解码服务（devServer 路由）
```

---

## AI 面板语音输入（SenseVoiceSmall）

AI 面板输入框旁的 🎤 按钮提供**完全本地**的语音转文字（浏览器录音 → 本机解码，音频不出机器）：

- 录音：16 kHz 单声道 PCM（`voice-input.js`）
- 解码：webpack-dev-server 内置 `/voice-api/*` 路由（`voice-decode.js`），基于 [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) WASM + [SenseVoiceSmall](https://github.com/FunAudioLLM/SenseVoice) int8 模型（支持中/英/日/韩/粤，ITN 数字归一化 + 标点）
- 实测：5.6 s 音频约 3.7 s 解码；中文测试句识别与官方 ground truth 一致

运行时与模型**不随仓库分发**（约 240 MB），需一次性下载到本地：

```powershell
# 1) sherpa-onnx 运行时（npmmirror，约 15 MB）
mkdir voice-runtime
Invoke-WebRequest https://registry.npmmirror.com/sherpa-onnx/-/sherpa-onnx-1.13.8.tgz -OutFile voice-runtime\s.tgz
tar -xzf voice-runtime\s.tgz -C voice-runtime   # 解出 voice-runtime/package/

# 2) SenseVoiceSmall int8 模型（GitHub Releases，约 230 MB）
mkdir voice-models voice\model
Invoke-WebRequest https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2 -OutFile voice-models\m.tar.bz2
tar -xjf voice-models\m.tar.bz2 -C voice-models
Copy-Item voice-models\sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17\{model.int8.onnx,tokens.txt} voice\model\
```

重启 `npm start` 后，接口自检：`GET http://localhost:8601/voice-api/status` 应返回 `{"runtime":true,"model":true,...}`。端到端测试：`node voice-test.js`。

---

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请走 [SECURITY.md](SECURITY.md)，不要开公开 Issue。

---

## 版权与致谢

- 本项目基于 [TurboWarp/scratch-gui](https://github.com/TurboWarp/scratch-gui)（GPL-3.0）二次开发，`LICENSE` 保留原始许可证
- 积木外观与翻译遵循 Scratch 3.0 / TurboWarp 设计规范，中文翻译来自 [LLK/scratch-l10n](https://github.com/LLK/scratch-l10n)
- 语音识别：[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)、[SenseVoice](https://github.com/FunAudioLLM/SenseVoice)
- 感谢 [TurboWarp](https://turbowarp.org) 与 [Scratch 基金会](https://scratch.mit.edu) 的开源工作

Scratch 名称与 Scratch 猫等图形是 MIT 的商标，使用限制见 [TRADEMARK](TRADEMARK)。

---

## 许可

[GPL-3.0](LICENSE)
