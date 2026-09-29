# 安全策略

## 报告漏洞

**请不要开公开 Issue。** 用 GitHub 的私密报告通道：

<https://github.com/dhdbvcg/scratch-extension-editor/security/advisories/new>

或者在 Issues 里 @dhdbvcg 请求一个私下沟通渠道。

请尽量附上：影响范围、复现步骤或 PoC、涉及的文件与版本、你判断的严重程度。收到后我会先确认能不能复现，再和你商量修复与披露的时间点。

## 支持范围

只有 `main` 分支上的最新代码会被修。这个项目不维护旧版本分支。

## 已知的、有意为之的设计

有几处看起来像问题、实际是权衡后的选择，先说清楚，免得白报：

**插件会被 fork 成子进程执行。** 插件就是代码，装上就会在本机跑。编辑器不沙箱化插件 —— 它和你在终端里 `node server.mjs` 没有本质区别。所以：只安装你信任的插件。市场里的条目只是索引，不是安全担保。

**插件下载会降级重试 TLS。** `ext-plugin-runtime.js` 在遇到证书链校验失败（`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）时会降级重试一次，并把降级显式打进日志。这是为了兼容部分网络环境下 GitHub 的证书链不全。降级只发生在证书类错误上，且必然留痕 —— 如果你在日志里看到这一行，说明那次下载的完整性保证被削弱了。

**Data URI 启动的扩展代码跑在第三方页面里。** 调试器把扩展源码 base64 后拼进 TurboWarp / RemixWarp 的 `?extension=` 参数。那段代码在对方站点的上下文里执行。这是 TurboWarp 提供的公开机制，不是漏洞，但你要清楚自己写的代码会在哪里跑。

**本地插件服务只监听 127.0.0.1。** 端口由操作系统分配（传 0），不对外暴露。但同一台机器上的其他程序可以访问它 —— 这是回环地址的固有性质。

## 凭据

**仓库里不应出现任何可用凭据。** `apikey.md`、`.env`、`voice-web-pkg/` 等已在 `.gitignore` 中排除，且经审计确认从未进入过提交历史。

`website/functions/` 下有两个文件硬编码了 Cloudflare Turnstile 的 secret 作为环境变量缺省值（`env.TURNSTILE_SECRET` 优先）。Turnstile secret 用于服务端验签，泄露的后果是他人可以伪造人机验证通过结果，无法用于读取数据或提权。如果你要部署自己的实例，请用 `npx wrangler secret put TURNSTILE_SECRET` 设成自己的值，不要沿用仓库里的。

如果你在代码或历史里发现了其他真实凭据，请按上面的私密通道报告。