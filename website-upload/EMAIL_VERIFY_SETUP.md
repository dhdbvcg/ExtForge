# 邮箱验证码功能 · 部署与配置指南

本目录已新增一套「邮箱验证码」能力（注册验证 / 登录 OTP / 找回密码），
后端为 Cloudflare Pages Functions + Mailchannels 发信，前端为 `email-auth.js`。
**以下 3 步是上线前必须完成的外部配置**，代码本身无法直接替你做。

---

## 1. 创建 KV 命名空间（存验证码 / 密码哈希 / 会话）

```bash
npx wrangler kv namespace create AUTH_KV
# 输出形如：{ id: "a1b2c3...", title: "dhdbvcg-AUTH_KV" }
```

把 `wrangler.toml` 里的 `id = "REPLACE_WITH_YOUR_KV_ID"` 换成上面得到的 id。

---

## 2. 配置 Mailchannels 发信域名（一次性 DNS）

Mailchannels 随 Cloudflare Pages 自带，无需 API Key，但**发件域必须在该 Cloudflare 站点验证**：

1. Cloudflare 控制台 → 你的站点 `dhdbvcg.cc.cd` → **Email Routing** → 开启 Email Routing。
2. 按提示给 `dhdbvcg.cc.cd` 添加 MX 记录与 `dkim._domainkey` 的 TXT 记录（控制台会给出具体值，照抄）。
3. 验证通过后，发件人 `no-reply@dhdbvcg.cc.cd` 即可使用。
   - 若想换发件名/地址，改 `functions/api/auth.js` 顶部 `FROM_EMAIL` / `FROM_NAME` 即可。

> 未验证域名时，函数会返回 `Mailchannels 4xx: ... domain not verified` 类错误。

---

## 3. 部署站点（含 Functions）

> 直接拖拽上传（`Direct Upload`）**不支持** Pages Functions，必须用 Git 或 Wrangler 部署。

```bash
# 安装 wrangler（如未装）
npm i -g wrangler
wrangler login

# 在本目录（含 wrangler.toml / functions/）执行
wrangler pages deploy . --project-name dhdbvcg
```

部署后访问 `https://dhdbvcg.cc.cd/email-auth.html` 即可看到演示页并实测发码。

---

## 本地调试

```bash
wrangler pages dev . --kv AUTH_KV
# 然后打开 http://localhost:8788/email-auth.html
```

> 本地 dev 的 Mailchannels 发信仍走线上域名校验，本地能跑通函数逻辑但真实发信需在已验证域名的线上环境。

---

## 集成到现有账号面板（users.html）

在登录/注册面板里插入：

```html
<div id="email-auth"></div>
<script src="email-auth.js"></script>
<script>EmailAuth.mount('#email-auth');
EmailAuth.onLogin = function(d){ /* 同步到现有 auth.js 的会话 */ };</script>
```

`email-auth.js` 与现有 `auth.js`（Supabase）**互不冲突**，可并存：用户可用「邮箱+密码(Supabase)」或「邮箱验证码(本方案)」任一方式。

---

## 接口速查（POST /api/auth）

| action   | body                                        | 说明                   |
|----------|---------------------------------------------|------------------------|
| send     | `{email, purpose}`                          | purpose=register/login/reset |
| verify   | `{email, code, purpose}`                    | 返回 `verifiedToken`  |
| register | `{email, code, verifiedToken, password}`    | 注册（密码服务端哈希） |
| login    | `{email, code?, verifiedToken?}` 或 `{email, password}` | OTP 或密码登录 |
| reset    | `{email, code, verifiedToken, newPassword}` | 重置密码               |
| logout   | `{token}`                                   | 注销                   |

安全说明：验证码以 SHA-256 哈希存于 KV（不存明文）；密码用 PBKDF2-SHA256（10 万次迭代）加盐哈希，明文不落盘；验证码 10 分钟过期、单码最多试 5 次、同邮箱 60 秒限流一次。
