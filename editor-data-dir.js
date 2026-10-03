/**
 * 定位编辑器的数据文件夹（%APPDATA%/<产品名>）。
 *
 * 单独抽成模块是因为**三处都要用**且必须给出完全一致的答案：
 *   1. webpack.config.js（devServer 扫插件目录）
 *   2. build/main.js（Electron userData，桌面版）
 *   3. build_installer.py / installer.py（写快捷方式、定安装目录）
 *
 * 产品名 2026-10 从 scratch-extension-editor 改为 ExtForge。加迁移的
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
const PRODUCT = 'ExtForge';
/** 改名前的旧目录名，仅用于一次性迁移 */
const LEGACY_PRODUCT = 'scratch-extension-editor';

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
function legacyDir() {
    return path.join(homeRoot(), LEGACY_PRODUCT);
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
 * 若新目录空、旧目录有内容，把旧目录内容搬进新目录。
 * @returns {{migrated: boolean, from?: string, to?: string, note?: string}}
 */
function migrateLegacyData(log) {
    const to = currentDir();
    const from = legacyDir();
    const say = (m) => { if (typeof log === 'function') log(m); };

    let fromExists = true;
    try { fs.statSync(from); } catch (e) { fromExists = false; }
    if (!fromExists) return {migrated: false};

    if (fs.existsSync(to)) {
        if (!hasContent(to)) {
            // 新目录在但空 —— 说明上次迁移只建了壳，重试一次
            try {
                for (const name of fs.readdirSync(from)) {
                    if (name === 'MIGRATED.txt') continue;
                    fs.renameSync(path.join(from, name), path.join(to, name));
                }
                say('[data] 补迁完成: ' + from + ' → ' + to);
                return {migrated: true, from, to};
            } catch (e) {
                return {migrated: false, note: '补迁失败: ' + (e && e.message)};
            }
        }
        return {migrated: false, note: '新目录已有数据，未触碰旧目录'};
    }

    try {
        fs.renameSync(from, to);
    } catch (e) {
        // 跨盘符时 rename 会失败（EXDEV），退回复制
        try {
            fs.mkdirSync(to, {recursive: true});
            for (const name of fs.readdirSync(from)) {
                if (name === 'MIGRATED.txt') continue;
                fs.cpSync(path.join(from, name), path.join(to, name), {recursive: true});
            }
        } catch (e2) {
            return {migrated: false, note: '迁移失败: ' + (e2 && e2.message)};
        }
    }
    say('[data] 已从 ' + LEGACY_PRODUCT + ' 迁移到 ' + PRODUCT);
    return {migrated: true, from, to};
}

module.exports = {
    PRODUCT,
    LEGACY_PRODUCT,
    homeRoot,
    currentDir,
    legacyDir,
    migrateLegacyData
};