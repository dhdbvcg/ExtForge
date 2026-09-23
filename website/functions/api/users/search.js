/*
 * 公开用户搜索（无需登录）
 *
 * GET /api/users/search?q=<关键词>&gender=<male|female|secret>&sort=<active|newest|name>
 *   -> { ok:true, results:[{ username, displayName, gender, uid, hasAvatar, createdAt, updatedAt }],
 *        total, returned, truncated }
 *   - q      : 匹配用户名 或 显示名称 包含关键词（不区分大小写）；空则返回全部
 *   - gender : 按性别过滤（非法值忽略）
 *   - sort   : active=最近活跃(updatedAt desc，默认) / newest=最新加入(createdAt desc) / name=用户名 A-Z
 *   仅能搜到「已同步过公开资料」的用户（KV 中存在 profile:<user>）；最多返回 120 条。
 */
const PROFILE_PREFIX = 'profile:';
const AVATAR_PREFIX = 'avatar:';
const MAX_RESULTS = 120;
const SCAN_LIMIT = 500; // 单次最多读取的 profile 数，控制 KV 成本
const GENDER_SET = new Set(['male', 'female', 'secret']);
const SORT_SET = new Set(['active', 'newest', 'name']);

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
  if (!env || !env.AUTH_KV) return json({ ok: false, error: '服务端未配置 KV' }, 500);

  const sp = new URL(request.url).searchParams;
  const q = (sp.get('q') || '').trim();
  const ql = q.toLowerCase();

  let gender = (sp.get('gender') || '').trim();
  if (!GENDER_SET.has(gender)) gender = '';

  let sort = (sp.get('sort') || 'active').trim();
  if (!SORT_SET.has(sort)) sort = 'active';

  try {
    const listing = await env.AUTH_KV.list({ prefix: PROFILE_PREFIX });
    const keys = (listing && listing.keys) || [];
    const matches = [];
    const scanned = Math.min(keys.length, SCAN_LIMIT);

    for (let i = 0; i < scanned; i++) {
      const username = keys[i].name.slice(PROFILE_PREFIX.length);
      let p = null;
      try {
        const raw = await env.AUTH_KV.get(keys[i].name);
        if (raw) p = JSON.parse(raw);
      } catch (e) { continue; }
      if (!p) continue;

      const dn = (p.displayName || username);
      if (ql && !username.toLowerCase().includes(ql) && !dn.toLowerCase().includes(ql)) continue;
      if (gender && (p.gender || '') !== gender) continue;

      let hasAvatar = false;
      try { hasAvatar = !!(await env.AUTH_KV.get(AVATAR_PREFIX + username)); } catch (e) { /* ignore */ }

      matches.push({
        username: username,
        displayName: dn,
        gender: p.gender || '',
        uid: (typeof p.uid === 'number') ? p.uid : 0,
        hasAvatar: hasAvatar,
        createdAt: p.createdAt || 0,
        updatedAt: p.updatedAt || 0
      });
    }

    if (sort === 'name') matches.sort(function (a, b) { return a.username.localeCompare(b.username); });
    else if (sort === 'newest') matches.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    else matches.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });

    const results = matches.slice(0, MAX_RESULTS);
    return json({
      ok: true,
      results: results,
      total: keys.length,
      returned: results.length,
      truncated: matches.length > MAX_RESULTS
    });
  } catch (e) {
    return json({ ok: false, error: '搜索失败' }, 500);
  }
}
