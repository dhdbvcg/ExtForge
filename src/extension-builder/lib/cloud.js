/**
 * Supabase 云端同步层
 *
 * 纯 fetch + anon key 实现（不引入 @supabase/supabase-js 依赖），
 * 供 auth.js（账号）与 saves.js（存档）调用。
 *
 * 设计：本地 localStorage 为即时存储，云端为持久备份。
 * 每次写操作（注册/登录/存档增删改）后同步推送到云端；
 * 读操作优先云端（云端有则拉取），保证多设备一致。
 */

import {SUPABASE_URL, SUPABASE_ANON_KEY, CLOUD_ENABLED} from './supabase-config.js';

function endpoint(path) {
    return SUPABASE_URL + '/rest/v1/' + path;
}

async function request(path, options = {}) {
    const {params, ...rest} = options;
    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };
    const res = await fetch(endpoint(path) + (params || ''), {
        ...rest,
        headers: {...headers, ...((rest && rest.headers) || {})}
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error('云同步失败 (' + res.status + '): ' + body.slice(0, 200));
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

/** 云端是否可用（配置完整且网络可达由调用方按需 try/catch） */
export function cloudAvailable() {
    return CLOUD_ENABLED;
}

// ==================== 账号 ====================

/** 云端 upsert 一个账号（按 username 主键覆盖） */
export async function cloudUpsertUser(user) {
    if (!cloudAvailable()) return null;
    return request('ext_users', {
        method: 'POST',
        headers: {'Prefer': 'resolution=merge-duplicates,return=representation'},
        body: JSON.stringify([{
            username: user.username,
            salt: user.salt || '',
            hash: user.hash || '',
            email: user.email || null,
            provider: user.provider || 'local',
            created_at: user.createdAt || Date.now()
        }]),
        params: '?on_conflict=username'
    });
}

/** 从云端拉取所有账号（登录/注册时校验用） */
export async function cloudFetchUsers() {
    if (!cloudAvailable()) return [];
    const rows = await request('ext_users?select=username,salt,hash,email,provider,created_at');
    return Array.isArray(rows) ? rows.map(r => ({
        username: r.username,
        salt: r.salt,
        hash: r.hash,
        email: r.email,
        provider: r.provider,
        createdAt: r.created_at
    })) : [];
}

// ==================== 存档 ====================

/** 云端拉取某用户全部存档 */
export async function cloudFetchSaves(username) {
    if (!cloudAvailable() || !username) return [];
    const rows = await request('ext_saves?username=eq.' + encodeURIComponent(username) +
        '&order=updated_at.desc&select=id,username,name,updated_at,data');
    return Array.isArray(rows) ? rows.map(r => ({
        id: r.id,
        username: r.username,
        name: r.name,
        updatedAt: r.updated_at,
        data: r.data || {}
    })) : [];
}

/** 云端 upsert 一个存档（按 id 主键覆盖） */
export async function cloudUpsertSave(username, save) {
    if (!cloudAvailable() || !username || !save) return null;
    return request('ext_saves', {
        method: 'POST',
        headers: {'Prefer': 'resolution=merge-duplicates,return=representation'},
        body: JSON.stringify([{
            id: save.id,
            username,
            name: save.name || '存档',
            updated_at: save.updatedAt || Date.now(),
            data: save.data || {}
        }]),
        params: '?on_conflict=id'
    });
}

/** 云端删除一个存档 */
export async function cloudDeleteSave(username, id) {
    if (!cloudAvailable() || !username || !id) return;
    await request('ext_saves?id=eq.' + encodeURIComponent(id) +
        '&username=eq.' + encodeURIComponent(username), {
        method: 'DELETE'
    });
}

// ==================== 好友 / 关注 ====================

/**
 * 按用户名模糊搜索用户（排除自己），用于"添加好友/关注"时的检索。
 * @returns {Promise<Array<{username:string, createdAt:number}>>}
 */
export async function cloudSearchUsers(query, self) {
    if (!cloudAvailable()) return [];
    const q = String(query || '').trim();
    if (q.length < 1) return [];
    const rows = await request('ext_users?username=ilike.*' + encodeURIComponent(q) +
        '*&select=username,created_at&order=username.asc&limit=20');
    return Array.isArray(rows)
        ? rows
            .filter(r => r.username !== self)
            .map(r => ({username: r.username, createdAt: r.created_at}))
        : [];
}

/**
 * 列出与某用户相关的全部关注关系（我关注的 + 关注我的）。
 * @returns {Promise<Array<{follower:string, followee:string, createdAt:number}>>}
 */
export async function cloudListRelations(username) {
    if (!cloudAvailable() || !username) return [];
    const rows = await request('ext_friends?or=(follower.eq.' +
        encodeURIComponent(username) + ',followee.eq.' + encodeURIComponent(username) +
        ')&select=follower,followee,created_at');
    return Array.isArray(rows) ? rows.map(r => ({
        follower: r.follower,
        followee: r.followee,
        createdAt: r.created_at
    })) : [];
}

/**
 * 关注某人（follower 关注 followee）。重复关注会被主键合并，幂等安全。
 */
export async function cloudFollow(follower, followee) {
    if (!cloudAvailable() || !follower || !followee) return null;
    return request('ext_friends', {
        method: 'POST',
        headers: {'Prefer': 'resolution=merge-duplicates,return=representation'},
        body: JSON.stringify([{follower, followee, created_at: Date.now()}]),
        params: '?on_conflict=follower,followee'
    });
}

/**
 * 取消关注 / 移除关系（删除 follower→followee 这一条记录）。
 */
export async function cloudUnfollow(follower, followee) {
    if (!cloudAvailable() || !follower || !followee) return;
    await request('ext_friends?follower=eq.' + encodeURIComponent(follower) +
        '&followee=eq.' + encodeURIComponent(followee), {
        method: 'DELETE'
    });
}

// ==================== 社区扩展 ====================
//
// 为什么社区也走 Supabase 而不是只有 Gist：
//   1. Gist 发布要 GitHub 授权（scope=gist），而编辑器部署在 GitHub Pages
//      时 Device Flow 是坏的 —— GitHub Pages 纯静态托管，POST 被 SPA
//      fallback 挡成 405，「未返回设备码」。云端发布不依赖任何 GitHub 授权。
//   2. Gist 列表走 api.github.com，未登录 60 次/小时/IP，社区一大就限流。
//   3. 云端能存「浏览量 / 收藏 / 评论」这类 Gist 放不下的聚合数据。
//
// 表结构见 supabase-config.js 顶部的建表 SQL（ext_community）。
// 三层存储策略见 community.js：云端为主，Gist 为个人备份。

/**
 * 列出社区扩展。
 * @param {object} opts {search, sort, limit, author}
 *   sort: 'updated'（最近更新，默认）| 'popular'（按浏览+收藏）| 'name'
 * @returns {Promise<Array>}
 */
export async function cloudFetchCommunity(opts = {}) {
    if (!cloudAvailable()) return [];
    let q = 'ext_community?select=*';
    if (opts.author) {
        q += '&author=eq.' + encodeURIComponent(opts.author);
    }
    if (opts.search) {
        // name / description 双字段模糊匹配。用 or 语法（PostgREST 约定）。
        const s = encodeURIComponent(String(opts.search).replace(/[,()]/g, ''));
        q += '&or=(name.ilike.*' + s + '*,description.ilike.*' + s + '*)';
    }
    const sort = opts.sort === 'popular' ? 'views_count.desc,likes_count.desc'
        : opts.sort === 'name' ? 'name.asc'
            : 'updated_at.desc';
    const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 200);
    q += '&order=' + sort + '&limit=' + limit;

    const rows = await request(q);
    return Array.isArray(rows) ? rows.map(rowToCommunity) : [];
}

function rowToCommunity(r) {
    return {
        id: r.id,
        author: r.author || '',
        name: r.name || '未命名扩展',
        description: r.description || '',
        extInfo: r.ext_info || {},
        customBlocks: Array.isArray(r.custom_blocks) ? r.custom_blocks : [],
        workspaceXml: r.workspace_xml || {},
        generatedCode: r.generated_code || '',
        views: Number(r.views_count) || 0,
        likes: Number(r.likes_count) || 0,
        createdAt: r.created_at || 0,
        updatedAt: r.updated_at || 0
    };
}

/**
 * 发布 / 更新一个社区扩展（按 id 主键覆盖）。
 * id 由调用方生成（ext_<用户名>_<时间戳>），避免依赖数据库默认值。
 */
export async function cloudUpsertCommunity(entry) {
    if (!cloudAvailable() || !entry || !entry.id) return null;
    const now = Date.now();
    const existing = entry.createdAt || now;
    return request('ext_community', {
        method: 'POST',
        headers: {'Prefer': 'resolution=merge-duplicates,return=representation'},
        body: JSON.stringify([{
            id: entry.id,
            author: entry.author || '',
            name: entry.name || '未命名扩展',
            description: entry.description || '',
            ext_info: entry.extInfo || {},
            custom_blocks: entry.customBlocks || [],
            workspace_xml: entry.workspaceXml || {},
            generated_code: entry.generatedCode || '',
            views_count: entry.views || 0,
            likes_count: entry.likes || 0,
            created_at: existing,
            updated_at: now
        }]),
        params: '?on_conflict=id'
    });
}

/** 拉单个社区扩展的完整内容 */
export async function cloudFetchCommunityOne(id) {
    if (!cloudAvailable() || !id) return null;
    const rows = await request('ext_community?id=eq.' + encodeURIComponent(id) + '&select=*&limit=1');
    return Array.isArray(rows) && rows.length ? rowToCommunity(rows[0]) : null;
}

/** 删除（仅作者自己可删，权限由 RLS 保证） */
export async function cloudDeleteCommunity(id, author) {
    if (!cloudAvailable() || !id) return;
    let q = 'ext_community?id=eq.' + encodeURIComponent(id);
    if (author) q += '&author=eq.' + encodeURIComponent(author);
    await request(q, {method: 'DELETE'});
}

/** 浏览量 +1（失败不影响主流程，纯统计） */
export async function cloudBumpCommunityViews(id) {
    if (!cloudAvailable() || !id) return;
    // 视图函数用 rpc 更规范，但没有建函数时用列自增接口更省事：
    // 读当前值再 upsert 会竞态，故这里直接用 Supabase 的 increment 语法（rpc 名不存在时静默失败）
    try {
        await request('rpc/bump_community_views', {method: 'POST', body: {id}});
    } catch (e) { /* 统计失败无所谓，不打断浏览 */ }
}

/** 点赞 / 取消点赞（toggle 由调用方按当前状态决定） */
export async function cloudSetCommunityLike(id, count) {
    if (!cloudAvailable() || !id) return;
    const n = Math.max(0, Number(count) || 0);
    await request('ext_community?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify({likes_count: n})
    });
}
