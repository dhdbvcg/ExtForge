/**
 * 社区扩展（Gist 存储）
 * ================================================================
 *
 * 用户把扩展发布到社区，别的用户可以「一键载入编辑器」改造成自己的新
 * 扩展。存储走 GitHub Gist 而不是自建后端 —— 零运维、内容跟着用户
 * 账号走、删除即退订。
 *
 * ── 为什么 Gist 文件是 JSON 而不是 .js ──
 * 用户需求原文是「其他用户可以通过扩展源码修改成新扩展」。如果社区存
 * 的是 .js 源码，别的用户只能下载、然后走「加载 .js」——但编辑器现有
 * 的 handleLoadExtension 只弹了文件框、读完只 alert 一声，并没有真正
 * 解析（见 ExtensionBuilder.jsx:4281），也就是说从 .js 无法还原积木
 * 定义，只能当黑盒看。
 *
 * 存项目快照（extInfo / customBlocks / workspaceXml / generatedCode）
 * 就能真正「载入」：积木定义回到定义列表、画布实现回到 Blockly 工作区，
 * 用户接着改，改完另存为自己的新扩展，不影响原作者。
 * generatedCode 仍然一并带上 —— 源码本身也是社区要展示的东西。
 *
 * ── Gist 的取名约定 ──
 * description 里写固定的标记前缀 + 扩展名，列表接口按这个前缀过滤，
 * 避免把用户其它 Gist 也当成社区扩展。
 *
 * ── 关于 2026-10 的改名（ExtForge → ForgeExt）──
 * 标记字符串**故意保持 'extforge-community' 不变**。它是数据协议标识，
 * 不是显示名：改名会让已发布到 Gist / 云端的社区扩展、别人浏览器里
 * 已缓存的列表、以及 localStorage 里存的导入载荷全部认不出来。
 * 显示名改，显示标识不改 —— 新版写入的用新名，读取端两种都认
 *（见 parseDescription / parseCommunityEntry 的兼容分支）。
 */

/** 写入用：Gist description 里的标记前缀 */
const TAG = 'extforge-community';
/** 读取时兼容的历史标记（早期拼写 / 可能的其它变体） */
const LEGACY_TAGS = ['extforge-community', 'forgeext-community', 'extforge_community'];
/** 读取端要认的全部标记（新 + 旧） */
const ALL_TAGS = [TAG].concat(LEGACY_TAGS);
/** 快照格式标识 + 版本（对外发布用 TAG，避免同时认两种格式导致重复） */
export const FORMAT = 'extforge-community';
export const SNAPSHOT_VERSION = 1;

import {
    cloudAvailable,
    cloudFetchCommunity,
    cloudUpsertCommunity,
    cloudFetchCommunityOne,
    cloudDeleteCommunity,
    cloudBumpCommunityViews,
    cloudSetCommunityLike
} from './cloud.js';

/** 社区列表用哪个 Gist API 拉（公开 Gist，无需鉴权，但有速率限制） */
function gistsApi(user) {
    return user
        ? 'https://api.github.com/users/' + encodeURIComponent(user) + '/gists'
        : 'https://api.github.com/gists/public';
}

/**
 * 组装一条社区扩展的 Gist description。
 * 格式：extforge-community · <扩展名> · <一句话描述>
 * 描述里的换行会破坏前缀匹配，所以压成单行。
 */
function makeDescription(ext) {
    const name = String((ext && ext.extInfo && ext.extInfo.name) || '未命名扩展').replace(/[\r\n·]+/g, ' ').trim();
    const desc = String((ext && ext.description) || '').replace(/[\r\n·]+/g, ' ').trim();
    return desc ? TAG + ' · ' + name + ' · ' + desc : TAG + ' · ' + name;
}

/** 从 Gist description 里认领：是不是社区扩展，顺带取出作者填的名字/描述 */
export function parseDescription(desc) {
    const s = String(desc || '');
    // 兼容历史标记（改名后仍要认得旧 Gist）
    const tag = ALL_TAGS.find(t => s.indexOf(t) === 0);
    if (!tag) return null;
    const rest = s.slice(tag.length).replace(/^\s*·\s*/, '');
    const parts = rest.split('·').map(x => x.trim()).filter(Boolean);
    return {name: parts[0] || '未命名扩展', description: parts.slice(1).join(' · ')};
}

/**
 * 把项目快照封装成社区扩展条目。
 * @param {object} snapshot collectProjectState() 的产物
 * @param {object} meta {description}
 */
export function buildCommunityEntry(snapshot, meta) {
    const info = (snapshot && snapshot.extInfo) || {};
    return {
        format: FORMAT,
        version: SNAPSHOT_VERSION,
        extInfo: info,
        customBlocks: Array.isArray(snapshot && snapshot.customBlocks) ? snapshot.customBlocks : [],
        workspaceXml: (snapshot && snapshot.workspaceXml) || {},
        generatedCode: (snapshot && snapshot.generatedCode) || '',
        description: String((meta && meta.description) || '').trim(),
        publishedAt: Date.now()
    };
}

/** 校验一份文本是不是合法的社区快照（兼容历史 format 值） */
export function parseCommunityEntry(text) {
    let obj;
    try { obj = JSON.parse(text); } catch { return null; }
    if (!obj || !ALL_TAGS.includes(obj.format)) return null;
    if (!obj.extInfo || typeof obj.extInfo !== 'object') return null;
    if (!Array.isArray(obj.customBlocks) || !obj.customBlocks.length) return null;
    return obj;
}

/** 从 GitHub Gist 列表项里抽出社区扩展（拿不到正文时只返回元信息） */
export function gistToCommunity(gist) {
    const tag = parseDescription(gist && gist.description);
    if (!tag) return null;
    const files = (gist && gist.files) || {};
    const key = Object.keys(files).find(k => /\.json$/i.test(k)) || Object.keys(files)[0];
    const file = key ? files[key] : null;
    let snapshot = null;
    if (file && typeof file.content === 'string' && file.content) {
        snapshot = parseCommunityEntry(file.content);
    }
    // 正文超长时 GitHub 会截断 content（truncated=true），此时先给元信息，
    // 真正的数据由 fetchGistDetail() 单独拉。
    return {
        gistId: gist.id,
        url: gist.html_url,
        author: (gist.owner && gist.owner.login) || '',
        authorAvatar: (gist.owner && gist.owner.avatar_url) || '',
        name: tag.name,
        description: tag.description,
        updatedAt: gist.updated_at,
        comments: gist.comments || 0,
        extInfo: (snapshot && snapshot.extInfo) || null,
        blockCount: snapshot ? snapshot.customBlocks.length : null,
        needsFetch: !snapshot && !!(gist.files && Object.keys(gist.files).length)
    };
}

/**
 * 拉社区列表。
 *
 * GitHub 的 /gists/public 不支持按 description 过滤，所以只能取回来
 * 自己在客户端筛。单页 100 条、按 updated_at 倒序，足以覆盖活跃社区。
 *
 * ── 存储后端：云端（Supabase）为主，Gist 为辅 ──
 *
 * 为什么不只靠 Gist：
 *   1. Gist 发布要 GitHub 授权（scope=gist），而编辑器部署在 GitHub Pages
 *      时 Device Flow 是坏的 —— GitHub Pages 纯静态托管，POST 被 SPA
 *      fallback 挡成 405，登录报「GitHub 未返回设备码」。云端发布不需要
 *      任何 GitHub 授权。
 *   2. Gist 列表走 api.github.com，未登录 60 次/小时/IP，社区一大就限流。
 *   3. 浏览量 / 点赞这类聚合数据 Gist 放不下。
 *
 * 取舍：云端不可用时（Supabase 未配 / 网络不通）自动回退到 Gist，
 * 保证「浏览 + 载入」在任何情况下都能用，只是发布要走 Gist 授权。
 */

/** 后端可用性：云端是否可用（Supabase 配好且未被回收） */
export function cloudBackendReady() {
    return cloudAvailable();
}

/**
 * 社区列表（云端优先，失败回退 Gist）。
 * @param {object} opts {search, sort, limit, author, page, perPage, token, prefer}
 *   prefer: 'cloud' | 'gist' —— 显式指定；不传则云端优先
 * @returns {Promise<{items, backend, hasMore, error?}>}
 */
export async function fetchCommunity(opts) {
    const o = opts || {};
    const wantCloud = o.prefer !== 'gist';

    if (wantCloud && cloudAvailable()) {
        try {
            const rows = await cloudFetchCommunity({
                search: o.search,
                sort: o.sort,
                limit: o.limit || o.perPage || 100,
                author: o.author
            });
            return {
                items: rows.map(cloudToCommunity),
                backend: 'cloud',
                hasMore: rows.length >= (o.limit || o.perPage || 100),
                rawCount: rows.length
            };
        } catch (e) {
            // 云端失败不抛 —— 回退 Gist，让功能不至于整个不可用
            const gist = await fetchCommunityFromGist(o);
            gist.backend = 'gist';
            gist.notice = '云端暂不可用（' + (e.message || e) + '），已回退到 GitHub Gist';
            return gist;
        }
    }
    const gist = await fetchCommunityFromGist(o);
    gist.backend = 'gist';
    return gist;
}

/** 云端行 → 统一条目结构（与 Gist 侧字段对齐） */
function cloudToCommunity(c) {
    return {
        cloudId: c.id,
        source: 'cloud',
        author: c.author,
        name: c.name,
        description: c.description,
        extInfo: c.extInfo,
        customBlocks: c.customBlocks,
        workspaceXml: c.workspaceXml,
        generatedCode: c.generatedCode,
        views: c.views,
        likes: c.likes,
        updatedAt: c.updatedAt,
        entry: {
            format: FORMAT,
            version: SNAPSHOT_VERSION,
            extInfo: c.extInfo,
            customBlocks: c.customBlocks,
            workspaceXml: c.workspaceXml,
            generatedCode: c.generatedCode,
            description: c.description
        }
    };
}

/** 直接读 Gist（原实现的入口，云端回退时用） */
export async function fetchCommunityFromGist(o = {}) {
    const page = o.page || 1;
    const perPage = o.perPage || 100;
    const url = gistsApi(o.author) + '?per_page=' + perPage + '&page=' + page;
    const headers = {Accept: 'application/vnd.github+json'};
    if (o.token) headers.Authorization = 'Bearer ' + o.token;

    const res = await fetch(url, {headers});
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error('拉取社区列表失败：HTTP ' + res.status + (body ? ' ' + body.slice(0, 120) : ''));
    }
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error('社区列表返回格式异常');

    const items = list.map(gistToCommunity).filter(Boolean);
    return {
        items,
        page,
        hasMore: list.length >= perPage,
        rawCount: list.length
    };
}

/** 拉单个 Gist 的完整内容（大文件被截断时用） */
export async function fetchGistDetail(gistId, token) {
    const headers = {Accept: 'application/vnd.github+json'};
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch('https://api.github.com/gists/' + encodeURIComponent(gistId), {headers});
    if (!res.ok) throw new Error('拉取扩展详情失败：HTTP ' + res.status);
    const gist = await res.json();
    const files = gist.files || {};
    const key = Object.keys(files).find(k => /\.json$/i.test(k)) || Object.keys(files)[0];
    if (!key) throw new Error('该 Gist 里没有扩展数据');
    return {entry: parseCommunityEntry(files[key].content), gist};
}

/**
 * 发布到社区：创建一个 Gist。
 * 需要用户 OAuth token（scope 含 gist）。
 */
export async function publishToCommunity(entry, token) {
    if (!token) throw new Error('需要 GitHub 登录后才能发布');
    if (!entry || !entry.customBlocks || !entry.customBlocks.length) {
        throw new Error('扩展里还没有积木，先做几个积木再发布');
    }
    const filename = (String((entry.extInfo && entry.extInfo.id) || 'extension')
        .replace(/[^a-zA-Z0-9_-]/g, '') || 'extension') + '.extforge.json';
    const res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            description: makeDescription(entry),
            public: true,
            files: {[filename]: {content: JSON.stringify(entry, null, 2)}}
        })
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = body;
        try { msg = (JSON.parse(body).message) || body; } catch (e) { /* 原文 */ }
        throw new Error('发布失败：HTTP ' + res.status + ' ' + String(msg).slice(0, 160));
    }
    return await res.json();
}

/** 更新已发布的 Gist（作者本人改自己的扩展） */
export async function updateCommunityEntry(gistId, entry, token) {
    if (!token) throw new Error('需要 GitHub 登录');
    const filename = (String((entry.extInfo && entry.extInfo.id) || 'extension')
        .replace(/[^a-zA-Z0-9_-]/g, '') || 'extension') + '.extforge.json';
    const res = await fetch('https://api.github.com/gists/' + encodeURIComponent(gistId), {
        method: 'PATCH',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            description: makeDescription(entry),
            files: {[filename]: {content: JSON.stringify(entry, null, 2)}}
        })
    });
    if (!res.ok) throw new Error('更新失败：HTTP ' + res.status);
    return await res.json();
}

/** 「载入编辑器改」的载荷：跨页面传给编辑器 */
export function buildImportPayload(entry) {
    return {
        type: 'extforge-import-community',
        format: FORMAT,
        data: {
            extInfo: entry.extInfo || {},
            customBlocks: entry.customBlocks || [],
            workspaceXml: entry.workspaceXml || {},
            generatedCode: entry.generatedCode || ''
        }
    };
}

// ==================== 云端发布（Supabase） ====================

/** 生成云端条目 id：作者 + 时间戳，保证唯一且可读 */
export function makeCloudId(author) {
    const who = String(author || 'anon').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'anon';
    return 'ext_' + who + '_' + Date.now().toString(36);
}

/**
 * 发布到云端。
 *
 * 与 Gist 发布的最大差别：**不需要 GitHub 授权**。只要云端配好、
 * 用户已登录（拿得到 username）就能发 —— 这正好绕开 GitHub Pages 上
 * Device Flow 不可用的问题。
 *
 * @param {object} entry   buildCommunityEntry() 的产物
 * @param {string} author  发布者用户名（登录态）
 */
export async function publishToCloud(entry, author) {
    if (!cloudAvailable()) {
        throw new Error('云端尚未配置：请在 supabase-config.js 填入项目 URL 与 anon key，并在 Supabase 执行建表 SQL');
    }
    if (!author) throw new Error('需要先登录才能发布（用于标记作者）');
    if (!entry || !entry.customBlocks || !entry.customBlocks.length) {
        throw new Error('扩展里还没有积木，先做几个积木再发布');
    }
    const id = entry.cloudId || makeCloudId(author);
    const row = await cloudUpsertCommunity({
        id,
        author,
        name: (entry.extInfo && entry.extInfo.name) || '未命名扩展',
        description: entry.description || '',
        extInfo: entry.extInfo || {},
        customBlocks: entry.customBlocks,
        workspaceXml: entry.workspaceXml || {},
        generatedCode: entry.generatedCode || '',
        createdAt: entry.createdAt || Date.now()
    });
    return {id, ok: !!(row && row.length), url: './community.html#' + id};
}

/** 云端条目详情（含被列表接口裁掉的完整快照） */
export async function fetchCloudDetail(id) {
    if (!cloudAvailable() || !id) return null;
    return cloudFetchCommunityOne(id);
}

/** 删除云端条目 */
export async function deleteFromCloud(id, author) {
    if (!cloudAvailable() || !id) return;
    await cloudDeleteCommunity(id, author);
}

/** 浏览量 +1（静默失败） */
export async function bumpViews(id) {
    if (!cloudAvailable() || !id) return;
    await cloudBumpCommunityViews(id);
}

/** 点赞（count 由调用方算好：已赞则 -1） */
export async function setLikes(id, count) {
    if (!cloudAvailable() || !id) return;
    await cloudSetCommunityLike(id, count);
}
