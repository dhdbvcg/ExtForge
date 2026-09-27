/**
 * GitHub OAuth Device Flow 同源代理（Cloudflare Pages Function）
 *
 * 为什么需要它：GitHub 的 /login/device/code 与 /login/oauth/access_token
 * 不返回 Access-Control-Allow-Origin，浏览器从编辑器页面直连会直接
 * TypeError: Failed to fetch。所以由同源的 Pages Function 代为转发。
 *
 * 路由：/github-oauth/<path>  →  https://github.com/login/<path>
 *   POST /github-oauth/device/code        → /login/device/code
 *   POST /github-oauth/oauth/access_token → /login/oauth/access_token
 *
 * 安全说明：Device Flow 全程不需要 client_secret，因此这里不注入、也不持有
 * 任何凭据；前端只带公开的 client_id。本 Function 是纯粹的透明转发，
 * 与 scratchextensioneditor.cc.cd 上的换 token 服务端无关，也就不存在
 * 「登录被弹到线上编辑器」的问题。
 *
 * 开发期不走这里：webpack-dev-server 的 before 中间件里有一份等价实现
 * （见 webpack.config.js 的 /github-oauth 段），因为 devServer 不是 Pages。
 */

export async function onRequestPost(context) {
    const { request, params } = context;

    // [[path]] 捕获段：可能是数组（多段）或字符串（单段）
    const seg = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
    if (!seg) {
        return json({ error: 'bad_request', error_description: '缺少转发路径' }, 400);
    }

    const body = await request.text();

    let upstream;
    try {
        upstream = await fetch('https://github.com/login/' + seg, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Scratch-Extension-Editor'
            },
            body: body
        });
    } catch (e) {
        return json({
            error: 'github_unreachable',
            error_description: String((e && e.message) || e)
        }, 502);
    }

    // 原样透传：轮询期间 GitHub 会返回 200 + body.error=authorization_pending，
    // 也可能返回 400 + error，两种都要让前端自己判断，不能在这里吞掉。
    const text = await upstream.text();
    return new Response(text, {
        status: upstream.status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function json(obj, status) {
    return new Response(JSON.stringify(obj), {
        status: status || 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}
