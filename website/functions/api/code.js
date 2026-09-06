/**
 * code.js —— 邮箱验证码：服务端生成 + 校验，经 Resend 发送
 *
 * POST /api/code  { action: 'send' | 'verify', ... }
 *
 *  action=send   { email, purpose, token(人机验证) }
 *      → 校验人机 → 生成 6 位码 → Resend 发信 → 发信成功才落库
 *  action=verify { email, purpose, code }
 *      → 校验码 → 通过后删码 → 签发一次性 verifiedToken（TTL 600s）
 *
 * 依赖：
 *   - KV 绑定 AUTH_KV（见 wrangler.toml）
 *   - 环境变量 RESEND_API_KEY（npx wrangler secret put RESEND_API_KEY）
 *   - 环境变量 TURNSTILE_SECRET（可选，缺省用内置配对 secret）
 */

var FROM = 'Scratch 扩展编辑器 <noreply@scratchextensioneditor.cc.cd>';
var CODE_TTL = 600;      // 验证码有效期（秒）
var RATE_TTL = 60;       // 重发间隔（秒）
var MAX_ATTEMPTS = 5;    // 最多错误次数
var VTOKEN_TTL = 600;    // 验证票据有效期（秒）
var TURNSTILE_SECRET = '0x4AAAAAAEeqDlYhOpSDfBz5qSU-RcyCafw';

function json(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}

function newId() {
    return crypto.randomUUID();
}

function randomCode() {
    var arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return String(arr[0] % 1000000).padStart(6, '0');
}

function validEmail(e) {
    return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

// ---- 人机验证 ----
async function verifyTurnstile(token, remoteip, env) {
    var secret = (env && env.TURNSTILE_SECRET) || TURNSTILE_SECRET;
    if (!token) return { ok: false, error: '请先完成人机验证' };
    try {
        var r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret: secret, response: token, remoteip: remoteip || '' })
        });
        var d = await r.json();
        if (d && d.success) return { ok: true };
        return { ok: false, error: '人机验证未通过，请重试' };
    } catch (e) {
        return { ok: false, error: '人机验证服务异常' };
    }
}

// ---- 经 Resend 发信 ----
async function sendMail(env, to, subject, html, text) {
    var key = env && env.RESEND_API_KEY;
    if (!key) return { ok: false, error: '服务端未配置 RESEND_API_KEY' };
    var resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from: FROM, to: [to], subject: subject, html: html, text: text })
    });
    var data = null;
    try { data = await resp.json(); } catch (e) {}
    if (!resp.ok) {
        return {
            ok: false,
            error: (data && (data.message || data.error)) || ('发信失败（HTTP ' + resp.status + '）')
        };
    }
    return { ok: true, id: data && data.id };
}

function mailHtml(code, purpose) {
    var title = purpose === 'reset' ? '重置密码' : '注册账号';
    return '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0c0c1a;border-radius:16px;color:#eef0fb">' +
        '<h2 style="margin:0 0 8px;font-size:20px">Scratch 扩展编辑器</h2>' +
        '<p style="color:#a6a8c4;font-size:14px;margin:0 0 24px">' + title + '验证码</p>' +
        '<div style="background:linear-gradient(115deg,#8b5cf6,#22d3ee);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px">' +
        '<div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#fff">' + code + '</div></div>' +
        '<p style="color:#a6a8c4;font-size:13px;line-height:1.7;margin:0 0 8px">验证码 <b style="color:#eef0fb">10 分钟内</b>有效，请尽快完成验证。</p>' +
        '<p style="color:#6c6f93;font-size:12px;line-height:1.7;margin:0">如果不是你本人操作，请忽略此邮件。</p>' +
        '</div>';
}

function mailText(code) {
    return '你的验证码是：' + code + '\n\n验证码 10 分钟内有效。如果不是你本人操作，请忽略此邮件。';
}

// ---- action: send ----
async function handleSend(body, env, request) {
    var email = (body.email || '').trim();
    var purpose = body.purpose === 'reset' ? 'reset' : 'register';

    if (!validEmail(email)) return json({ success: false, error: '请输入正确的邮箱地址' }, 400);

    // 1) 人机验证（强制，不降级放行）
    var ts = await verifyTurnstile(body.token, request.headers.get('CF-Connecting-IP'), env);
    if (!ts.ok) return json({ success: false, error: ts.error }, 403);

    // 2) 限流：同邮箱 60 秒内只能发一次
    var rateKey = 'coderate:' + purpose + ':' + email;
    var last = await env.AUTH_KV.get(rateKey);
    if (last) {
        var wait = RATE_TTL - Math.floor((Date.now() - Number(last)) / 1000);
        if (wait > 0) return json({ success: false, error: '请 ' + wait + ' 秒后再试' }, 429);
    }

    // 3) 生成验证码 → 先发信
    var code = randomCode();
    var subject = purpose === 'reset' ? '【Scratch 扩展编辑器】重置密码验证码' : '【Scratch 扩展编辑器】注册验证码';
    var sent = await sendMail(env, email, subject, mailHtml(code, purpose), mailText(code));
    if (!sent.ok) return json({ success: false, error: sent.error }, 502);

    // 4) 发信成功才落库
    var codeKey = 'code:' + purpose + ':' + email;
    await env.AUTH_KV.put(codeKey, JSON.stringify({
        code: code,
        attempts: 0,
        createdAt: Date.now()
    }), { expirationTtl: CODE_TTL });
    await env.AUTH_KV.put(rateKey, String(Date.now()), { expirationTtl: RATE_TTL });

    return json({ success: true, message: '验证码已发送，请查收邮件（10 分钟内有效）' });
}

// ---- action: verify ----
async function handleVerify(body, env) {
    var email = (body.email || '').trim();
    var purpose = body.purpose === 'reset' ? 'reset' : 'register';
    var code = String(body.code || '').trim();

    if (!validEmail(email)) return json({ success: false, error: '请输入正确的邮箱地址' }, 400);
    if (!/^\d{6}$/.test(code)) return json({ success: false, error: '请输入 6 位验证码' }, 400);

    var codeKey = 'code:' + purpose + ':' + email;
    var raw = await env.AUTH_KV.get(codeKey);
    if (!raw) return json({ success: false, error: '验证码已过期或不存在，请重新获取' }, 400);

    var rec;
    try { rec = JSON.parse(raw); } catch (e) { rec = null; }
    if (!rec) return json({ success: false, error: '验证码无效，请重新获取' }, 400);

    if ((rec.attempts || 0) >= MAX_ATTEMPTS) {
        await env.AUTH_KV.delete(codeKey);
        return json({ success: false, error: '错误次数过多，请重新获取验证码' }, 400);
    }

    if (rec.code !== code) {
        rec.attempts = (rec.attempts || 0) + 1;
        var left = MAX_ATTEMPTS - rec.attempts;
        await env.AUTH_KV.put(codeKey, JSON.stringify(rec), { expirationTtl: CODE_TTL });
        return json({ success: false, error: '验证码错误，还可尝试 ' + left + ' 次' }, 400);
    }

    // 通过：删码 + 签发一次性票据
    await env.AUTH_KV.delete(codeKey);
    var verifiedToken = newId();
    await env.AUTH_KV.put('vtoken:' + verifiedToken, JSON.stringify({
        email: email, purpose: purpose
    }), { expirationTtl: VTOKEN_TTL });

    return json({ success: true, verifiedToken: verifiedToken });
}

export async function onRequestOptions() {
    return json({}, 204);
}

export async function onRequestPost(context) {
    var request = context.request;
    var env = context.env;

    if (!env || !env.AUTH_KV) {
        return json({ success: false, error: '服务端未绑定 AUTH_KV，无法使用验证码功能' }, 500);
    }

    var body;
    try {
        body = await request.json();
    } catch (e) {
        return json({ success: false, error: '请求格式错误' }, 400);
    }

    var action = body && body.action;
    if (action === 'send') return handleSend(body, env, request);
    if (action === 'verify') return handleVerify(body, env);
    return json({ success: false, error: '未知 action' }, 400);
}

export async function onRequest(context) {
    if (context.request.method === 'POST') return onRequestPost(context);
    if (context.request.method === 'OPTIONS') return onRequestOptions();
    return json({ success: false, error: '仅支持 POST' }, 405);
}
