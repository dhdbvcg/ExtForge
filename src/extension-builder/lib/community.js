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
 * description 里写固定的标记前缀 `extforge-community` + 扩展名，
 * 列表接口按这个前缀过滤，避免把用户其它 Gist 也当成社区扩展。
 */

/** Gist description 里的标记前缀（列表时按它过滤） */
const TAG = 'extforge-community';
/** 快照格式标识 + 版本 */
export const FORMAT = 'extforge-community';
export const SNAPSHOT_VERSION = 1;

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
    if (s.indexOf(TAG) !== 0) return null;
    const rest = s.slice(TAG.length).replace(/^\s*·\s*/, '');
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

/** 校验一份文本是不是合法的社区快照 */
export function parseCommunityEntry(text) {
    let obj;
    try { obj = JSON.parse(text); } catch { return null; }
    if (!obj || obj.format !== FORMAT) return null;
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
 * @param {object} opts {author, page, perPage, token}
 */
export async function fetchCommunity(opts) {
    const o = opts || {};
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
        // 作者模式下这个接口是「该作者的 Gist」，翻完即止；
        // 公共模式下 /gists/public 也不分页到底，所以都靠 hasMore 判断。
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
