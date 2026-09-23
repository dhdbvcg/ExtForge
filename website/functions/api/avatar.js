/*
 * GET  /api/avatar?u=<username>            -> { ok:true, avatar:"data:image/...", updatedAt }
 * POST /api/avatar  { username, avatar, owner }
 *      -> { ok:true, updatedAt }
 *
 * 头像存在 KV（复用已有的 AUTH_KV 绑定），key = "avatar:<username>"。
 *
 * 归属保护：首次上传时用 owner（客户端算好的 sha256）「认领」该用户名；
 * 之后必须用同一个 owner 才能覆盖，避免任何人随意改别人头像。
 * 服务端只保存 owner 的哈希值本身，不做二次哈希（它已经是派生值）。
 */
const KV_PREFIX = 'avatar:';
const MAX_CHARS = 96 * 1024;          // dataURL 字符数上限（160px JPEG 一般 ~8KB）
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

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const u = (url.searchParams.get('u') || '').trim();
  if (!u) return json({ ok: false, error: '缺少用户名' }, 400);
  if (!env || !env.AUTH_KV) return json({ ok: false, error: '服务端未配置 KV' }, 500);
  try {
    const raw = await env.AUTH_KV.get(KV_PREFIX + u);
    if (!raw) return json({ ok: false, error: '未找到头像' }, 404);
    const rec = JSON.parse(raw);
    return json({ ok: true, avatar: rec.avatar || '', updatedAt: rec.updatedAt || 0 });
  } catch (e) {
    return json({ ok: false, error: '读取失败' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.AUTH_KV) return json({ ok: false, error: '服务端未配置 KV' }, 500);

  let body = null;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: '请求格式错误' }, 400); }

  const u = String((body && body.username) || '').trim();
  const avatar = String((body && body.avatar) || '');
  const owner = String((body && body.owner) || '');
  const isRemoval = avatar === '';

  if (!USER_RE.test(u)) return json({ ok: false, error: '用户名无效' }, 400);
  if (!isRemoval && !/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(avatar)) return json({ ok: false, error: '头像格式无效' }, 400);
  if (!isRemoval && avatar.length > MAX_CHARS) return json({ ok: false, error: '头像过大（上限 96KB）' }, 400);
  if (!/^[a-f0-9]{64}$/i.test(owner)) return json({ ok: false, error: '缺少归属凭证' }, 400);

  const key = KV_PREFIX + u;
  let existing = null;
  try {
    const raw = await env.AUTH_KV.get(key);
    if (raw) existing = JSON.parse(raw);
  } catch (e) { /* ignore */ }

  if (existing && existing.owner && existing.owner !== owner) {
    return json({ ok: false, error: '该用户名已有头像，且归属凭证不匹配' }, 403);
  }

  // 移除：清空头像（仍需归属凭证，防别人乱删）
  if (isRemoval) {
    try { await env.AUTH_KV.delete(key); } catch (e) {
      return json({ ok: false, error: '删除失败' }, 500);
    }
    return json({ ok: true, removed: true });
  }

  const rec = { avatar: avatar, owner: owner, updatedAt: Date.now() };
  try {
    await env.AUTH_KV.put(key, JSON.stringify(rec));
  } catch (e) {
    return json({ ok: false, error: '写入失败' }, 500);
  }
  return json({ ok: true, updatedAt: rec.updatedAt });
}
