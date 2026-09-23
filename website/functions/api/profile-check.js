/*
 * 查重（公开，无需登录）—— 供注册/资料编辑页实时预检
 *
 * GET /api/profile-check?name=<昵称>&exclude=<自己的用户名>
 *   -> { ok:true, available:boolean, name }
 *   昵称查重：归一化（trim+压缩空白+小写）后与已同步公开资料比较（排除 exclude）。
 *
 * GET /api/profile-check?username=<用户名>
 *   -> { ok:true, username, exists:boolean }
 *   用户名占用检查：profile:<user> 存在即视为已被使用。
 *   注意：同用户名+同密码在新设备注册可凭 ownerToken 接管资料，因此调用方应作
 *   「提醒」而非「阻止」。
 */
const KV_PREFIX = 'profile:';
const SCAN_LIMIT = 500;
const USER_RE = /^[\p{L}\p{N}_.\-@]{1,64}$/u;

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function normName(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env || !env.AUTH_KV) return json({ ok: false, error: '服务端未配置 KV' }, 500);

  const sp = new URL(request.url).searchParams;

  // 模式一：用户名占用检查
  const username = (sp.get('username') || '').trim();
  if (username) {
    if (!USER_RE.test(username)) return json({ ok: false, error: '用户名无效' }, 400);
    let exists = false;
    try { exists = !!(await env.AUTH_KV.get(KV_PREFIX + username)); } catch (e) { exists = false; }
    return json({ ok: true, username: username, exists: exists });
  }

  // 模式二：昵称查重
  const name = (sp.get('name') || '').trim();
  const exclude = (sp.get('exclude') || '').trim();

  if (!name) return json({ ok: false, error: '缺少昵称' }, 400);
  if (name.length > 30) return json({ ok: false, error: '昵称过长' }, 400);

  const norm = normName(name);
  let available = true;

  try {
    const listing = await env.AUTH_KV.list({ prefix: KV_PREFIX });
    const keys = (listing && listing.keys) || [];
    const scanned = Math.min(keys.length, SCAN_LIMIT);
    for (let i = 0; i < scanned; i++) {
      const otherUser = keys[i].name.slice(KV_PREFIX.length);
      if (otherUser === exclude) continue;
      const raw = await env.AUTH_KV.get(keys[i].name);
      if (!raw) continue;
      let p = null;
      try { p = JSON.parse(raw); } catch (e) { continue; }
      if (p && normName(p.displayName) === norm) { available = false; break; }
    }
  } catch (e) {
    // 查重服务异常时不阻塞前端，按可用处理（POST 仍会兜底校验）
    available = true;
  }

  return json({ ok: true, available: available, name: name });
}
