/**
 * turnstile-verify.js —— Cloudflare Turnstile 人机验证（服务端验签）
 *
 * POST /api/turnstile-verify  { token }
 * 返回 { success: true } 或 { success: false, error: '...' }
 *
 * 密钥通过 wrangler secret 设置：npx wrangler secret put TURNSTILE_SECRET
 */

// 与前端 widget 配对的 secret（也可通过环境变量覆盖）
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

export async function onRequestOptions() {
    return json({}, 204);
}

export async function onRequestPost(context) {
    var request = context.request;
    var env = context.env;

    var body;
    try {
        body = await request.json();
    } catch (e) {
        return json({ success: false, error: '请求格式错误' }, 400);
    }

    var token = body && body.token;
    if (!token) {
        return json({ success: false, error: '缺少人机验证令牌' }, 400);
    }

    var secret = (env && env.TURNSTILE_SECRET) || TURNSTILE_SECRET;

    try {
        var resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: secret,
                response: token,
                remoteip: request.headers.get('CF-Connecting-IP') || ''
            })
        });
        var data = await resp.json();
        if (data && data.success) {
            return json({ success: true });
        }
        return json({
            success: false,
            error: '人机验证未通过，请重试',
            codes: (data && data['error-codes']) || []
        }, 403);
    } catch (e) {
        return json({ success: false, error: '人机验证服务异常：' + (e && e.message ? e.message : e) }, 502);
    }
}

export async function onRequest(context) {
    if (context.request.method === 'POST') return onRequestPost(context);
    if (context.request.method === 'OPTIONS') return onRequestOptions();
    return json({ success: false, error: '仅支持 POST' }, 405);
}
