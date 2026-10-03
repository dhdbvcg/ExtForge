/**
 * 定位编辑器的数据文件夹（%APPDATA%/<产品名>）。
 *
 * 单独抽成模块是因为**三处都要用**且必须给出完全一致的答案：
 *   1. webpack.config.js（devServer 扫插件目录）
 *   2. build/main.js（Electron userData，桌面版）
 *   3. build_installer.py / installer.py（写快捷方式、定安装目录）
 *
 * 产品名 2026-10 从 scratch-extension-editor 改为 ForgeExt。加迁移的
 * 原因：数据目录里放着用户已装的插件、AI 助手配置、登录态。直接换名
 * 等于让这些「凭空消失」——目录还在，只是没人去找了。
 *
 * 迁移策略（保守）：
 *   - 新目录为空 且 旧目录存在 → 把旧目录整个搬过去（rename，跨盘则复制）；
 *   - 新目录已有内容 → 什么都不做，绝不覆盖用户新产生的数据；
 *   - 搬完在旧位置留一个 README 说明去向，方便出问题时人工找回。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

/** 当前产品名（= %APPDATA% 下的目录名 / Electron productName） */
const PRODUCT = 'ForgeExt';
/**
 * 历史目录名，从新到旧排列，逐个尝试迁移。
 *
 * 品牌改过两次，中间那次（ExtForge）也得认：用户如果用过那一版，它的
 * 插件 / 设置 / 登录态在 %APPDATA%/ExtForge 里 —— 不迁移的话，这次
 * 改名后看起来就是「全没了」。按「离当前名最近」优先的顺序尝试。
 */
const LEGACY_PRODUCTS = ['ExtForge', 'scratch-extension-editor'];
/** 兼容旧调用方（早期只认第一个） */
const LEGACY_PRODUCT = LEGACY_PRODUCTS[0];

function homeRoot() {
    const home = os.homedir();
    if (process.platform === 'win32') {
        return process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    }
    if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support');
    }
    return process.env.XDG_CONFIG_HOME || path.join(home, '.config');
}

function currentDir() {
    return path.join(homeRoot(), PRODUCT);
}
/** 第一个历史目录（兼容旧接口） */
function legacyDir() {
    return path.join(homeRoot(), LEGACY_PRODUCTS[0]);
}
/** 全部历史目录（按新旧顺序） */
function allLegacyDirs() {
    return LEGACY_PRODUCTS.map(n => path.join(homeRoot(), n));
}

/** 目录非空判断（只有一个 plugins 子目录、且里面空，也算「有内容」）。 */
function hasContent(dir) {
    let entries;
    try {
        entries = fs.readdirSync(dir);
    } catch (e) {
        return false;
    }
    for (const name of entries) {
        // Node 会往数据目录里写 .marker 之类的辅助文件，跳过
        if (name.startsWith('.')) continue;
        return true;
    }
    return false;
}

/**
 * 把某个历史目录的内容并进新目录（不删源目录，出问题还能找回来）。
 * @returns {boolean} 是否实际搬了东西
 */
function mergeInto(from, to, say) {
    const moveAll = () => {
        for (const name of fs.readdirSync(from)) {
            if (name === 'MIGRATED.txt') continue;
            const src = path.join(from, name);
            const dst = path.join(to, name);
            // 目标已存在同名项时不覆盖 —— 用户新产生的数据优先
            if (fs.existsSync(dst)) continue;
            try {
                fs.renameSync(src, dst);
            } catch (e) {
                fs.cpSync(src, dst, {recursive: true});
            }
        }
    };
    try {
        // 整个目录直接改名最省事（同一盘符时是一次原子操作）
        if (!fs.existsSync(to) && fs.readdirSync(from).length > 0) {
            try {
                fs.renameSync(from, to);
                say('[data] 已从 ' + path.basename(from) + ' 迁移到 ' + PRODUCT);
                return true;
            } catch (e) { /* 跨盘：落到下面的合并分支 */ }
        }
        fs.mkdirSync(to, {recursive: true});
        moveAll();
        say('[data] 已从 ' + path.basename(from) + ' 合并到 ' + PRODUCT);
        return true;
    } catch (e) {
        if (say) say('[data] 从 ' + path.basename(from) + ' 迁移失败: ' + ((e && e.message) || e));
        return false;
    }
}

/**
 * 若新目录空、旧目录有内容，把旧目录内容搬过去。
 * 多个历史目录按新旧顺序依次尝试，都搬完为止。
 * @returns {{migrated: boolean, from?: string, to?: string, note?: string}}
 */
function migrateLegacyData(log) {
    const to = currentDir();
    const say = (m) => { if (typeof log === 'function') log(m); };

    // 先保证新目录存在
    if (!fs.existsSync(to)) {
        try { fs.mkdirSync(to, {recursive: true}); } catch (e) { /* 后面会报错 */ }
    }

    let migrated = false;
    let lastFrom = null;
    let touched = false;

    for (const dir of allLegacyDirs()) {
        let exists = true;
        try { fs.statSync(dir); } catch (e) { exists = false; }
        if (!exists) continue;
        touched = true;
        if (hasContent(dir)) {
            if (mergeInto(dir, to, say)) {
                migrated = true;
                lastFrom = dir;
            }
        } else {
            // 空壳目录：留个说明文件，避免下次又当成有数据
            try {
                if (!fs.existsSync(path.join(dir, 'MIGRATED.txt'))) {
                    fs.writeFileSync(path.join(dir, 'MIGRATED.txt'),
                        '数据已迁移到 ' + PRODUCT + '\\。此目录仅作记录，可安全删除。\n', 'utf8');
                }
            } catch (e) { /* ignore */ }
        }
    }

    if (migrated) return {migrated: true, from: lastFrom, to};
    if (touched) return {migrated: false, note: '历史目录为空或已有对应数据'};
    return {migrated: false};
}

module.exports = {
    PRODUCT,
    LEGACY_PRODUCT,
    LEGACY_PRODUCTS,
    homeRoot,
    currentDir,
    legacyDir,
    allLegacyDirs,
    migrateLegacyData
};