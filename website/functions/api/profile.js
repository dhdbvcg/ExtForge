/*
 * 公开资料跨设备同步（与 /api/avatar 同款 owner 归属保护）
 *
 * GET  /api/profile?u=<username>
 *      -> { ok:true, displayName, bio, gender, createdAt, uid, updatedAt }（公开，任何人可读）
 * POST /api/profile { username, displayName, bio, gender, createdAt, uid, owner }
 *      -> { ok:true, updatedAt }
 *
 * KV key = "profile:<username>"（复用 AUTH_KV）。
 * owner 与 /api/avatar 一致：登录时记录的 ownerToken = sha256(username + '::' + password)，
 * 首次上传认领用户名，之后须同 owner 才能覆盖。
 */
const KV_PREFIX = 'profile:';
const DISPLAY_MAX = 30;
const BIO_MAX = 3000;
const USER_RE = /^[\p{L}\p{N}_.\-@]{1,64}$/u;
const GENDER_SET = new Set(['male', 'female', 'secret', '']);

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function cleanText(v, max) { return String(v == null ? '' : v).slice(0, max); }
function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }

// 昵称归一化：去首尾空白、压缩连续空白、转小写 —— 用于不重名比较
function normName(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase(); }

export async function onRequestGet(context) {
  const { request, env } = context;
  const u = (new URL(request.url).searchParams.get('u') || '').trim();
  if (!u) return json({ ok: false, error: '缺少用户名' }, 400);
  if (!env || !env.AUTH_KV) return json({ ok: false, error: '服务端未配置 KV' }, 500);
  try {
    const raw = await env.AUTH_KV.get(KV_PREFIX + u);
    if (!raw) return json({ ok: false, error: '未找到资料' }, 404);
    const r = JSON.parse(raw);
    return json({
      ok: true,
      displayName: r.displayName || '',
      bio: r.bio || '',
      gender: r.gender || '',
      createdAt: r.createdAt || 0,
      uid: r.uid || 0,
      updatedAt: r.updatedAt || 0
    });
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
  const displayName = cleanText(body && body.displayName, DISPLAY_MAX);
  const bio = cleanText(body && body.bio, BIO_MAX);
  const gender = GENDER_SET.has(String((body && body.gender) || '')) ? String(body.gender) : '';
  const createdAt = num(body && body.createdAt);
  const uid = num(body && body.uid);
  const owner = String((body && body.owner) || '');

  if (!USER_RE.test(u)) return json({ ok: false, error: '用户名无效' }, 400);
  if (!/^[a-f0-9]{64}$/i.test(owner)) return json({ ok: false, error: '缺少归属凭证' }, 400);

  const key = KV_PREFIX + u;
  let existing = null;
  try {
    const raw = await env.AUTH_KV.get(key);
    if (raw) existing = JSON.parse(raw);
  } catch (e) { /* ignore */ }

  if (existing && existing.owner && existing.owner !== owner) {
    return json({ ok: false, error: '该用户名已有资料，且归属凭证不匹配' }, 403);
  }

  // 昵称不重名：扫描已同步的公开资料，排除自己（网络/读取异常时不阻塞保存）
  const nn = normName(displayName);
  if (nn) {
    try {
      const listing = await env.AUTH_KV.list({ prefix: KV_PREFIX });
      const keys = (listing && listing.keys) || [];
      const scanned = Math.min(keys.length, 500);
      for (let i = 0; i < scanned; i++) {
        const otherUser = keys[i].name.slice(KV_PREFIX.length);
        if (otherUser === u) continue;
        const otherRaw = await env.AUTH_KV.get(keys[i].name);
        if (!otherRaw) continue;
        let other = null;
        try { other = JSON.parse(otherRaw); } catch (e) { continue; }
        if (other && normName(other.displayName) === nn) {
          return json({ ok: false, error: '昵称「' + displayName + '」已被其他用户使用' }, 409);
        }
      }
    } catch (e) { /* 查重失败不阻塞保存 */ }
  }

  const rec = {
    displayName: displayName, bio: bio, gender: gender,
    createdAt: createdAt, uid: uid,
    owner: owner, updatedAt: Date.now()
  };
  try {
    await env.AUTH_KV.put(key, JSON.stringify(rec));
  } catch (e) {
    return json({ ok: false, error: '写入失败' }, 500);
  }
  return json({ ok: true, updatedAt: rec.updatedAt });
}

/*
 * DELETE /api/profile?u=<用户名>&owner=<ownerToken>
 *   -> { ok:true, deleted:true }   （账号注销时删除服务端公开资料）
 * 归属校验与 POST 一致：owner 不匹配 → 403；资料不存在视为已删除（幂等）。
 */
export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!env || !env.AUTH_KV) return json({ ok: false, error: '服务端未配置 KV' }, 500);

  const sp = new URL(request.url).searchParams;
  const u = (sp.get('u') || '').trim();
  const owner = String(sp.get('owner') || '');

  if (!u) return json({ ok: false, error: '缺少用户名' }, 400);
  if (!USER_RE.test(u)) return json({ ok: false, error: '用户名无效' }, 400);
  if (!/^[a-f0-9]{64}$/i.test(owner)) return json({ ok: false, error: '缺少归属凭证' }, 400);

  const key = KV_PREFIX + u;
  try {
    const raw = await env.AUTH_KV.get(key);
    if (!raw) return json({ ok: true, deleted: true });
    let rec = null;
    try { rec = JSON.parse(raw); } catch (e) { rec = null; }
    if (rec && rec.owner && rec.owner !== owner) {
      return json({ ok: false, error: '归属凭证不匹配' }, 403);
    }
    await env.AUTH_KV.delete(key);
    return json({ ok: true, deleted: true });
  } catch (e) {
    return json({ ok: false, error: '删除失败' }, 500);
  }
}
