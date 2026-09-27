/**
 * 调试器面板 —— 把当前扩展一键丢进在线编辑器真机试跑。
 *
 * 实现方式和 CB-ExtGallary 一致：把生成的扩展源码直接编码成 Data URI，
 * 拼到编辑器的 ?extension= 参数上打开。
 *
 *   https://turbowarp.org/editor?extension=data:text/javascript;base64,....
 *
 * 为什么用 Data URI 而不是别的：
 *   - 不经过任何服务器，不需要部署，不需要公网 https 直链；
 *   - 不依赖本机 devServer 的临时接口，生产构建下同样可用；
 *   - TurboWarp 的扩展加载器原生接受 data: 地址，实测能正常注册积木。
 *
 * 注意（踩过的坑）：
 *   - scratch-vm 会把扩展放进 worker 里跑，扩展源码里不能出现 `import`；
 *     导出的代码本身是自包含 IIFE，满足这个前提。
 *   - Data URI 走 URL，超长会被浏览器截断，所以超过阈值时给出提示，
 *     并保留「下载 .js」这条不受长度限制的退路。
 */
import React, {useCallback, useMemo, useState} from 'react';

/** 目标编辑器：都支持 ?extension=<url> 加载自定义扩展。 */
const TARGETS = [
    {id: 'turbowarp', name: 'TurboWarp', base: 'https://turbowarp.org/editor'},
    {id: 'remixwarp', name: 'RemixWarp', base: 'https://remixwarp.pages.dev/editor'},
    {id: 'custom', name: '自定义地址…', base: ''}
];

/** URL 安全上限：超过就提醒可能被浏览器截断（Chrome 约 2MB，留足余量）。 */
const URL_WARN_LEN = 600000;

/** 把 UTF-8 字符串编码成 base64（分块，避免 apply 参数过多）。 */
function encodeBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

/**
 * 统计一行里未转义的反引号个数，用来跟踪模板字符串状态。
 *
 * 模板字符串里的换行和缩进是有语义的，绝不能按普通代码行去 trim，
 * 所以要先知道「这一行结束时是否还在模板里」。
 */
function countTicks(line) {
    let n = 0;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\') { i++; continue; }
        if (line[i] === '`') n++;
    }
    return n;
}

/**
 * 为塞进 URL 而做的保守瘦身。
 *
 * 只做三件绝对不会改变语义的事：
 *   1. 删掉整行注释（// … 和独占整行的 /* … *\/）；
 *   2. 删掉空行；
 *   3. 去掉每行的行首缩进。
 *
 * 刻意不做的事：不删行尾注释、不合并语句、不动字符串一个字。
 * 生成代码里注释占比很高（文件头说明 + 每个积木的注册注释），
 * 光靠这三步就能砍掉近一半体积，而 Data URI 的长度正是能否加载成功的关键。
 */
function minifyForUrl(src) {
    const lines = String(src == null ? '' : src).split(/\r?\n/);
    const out = [];
    let inBlockComment = false;
    let inTemplate = false;

    for (let li = 0; li < lines.length; li++) {
        let line = lines[li];

        // 模板字符串内部：整行原样保留，只更新状态。
        if (inTemplate) {
            out.push(line);
            if (countTicks(line) % 2 === 1) inTemplate = false;
            continue;
        }

        // 上一行开了块注释，这一行还在里面。
        if (inBlockComment) {
            const end = line.indexOf('*/');
            if (end < 0) continue;
            line = line.slice(end + 2);
            inBlockComment = false;
        }

        let t = line.trim();
        if (!t) continue;

        if (t.indexOf('//') === 0) continue;
        if (t.indexOf('/*') === 0) {
            const end = t.indexOf('*/');
            if (end < 0) { inBlockComment = true; continue; }
            t = t.slice(end + 2).trim();
            if (!t) continue;
        }

        out.push(t);
        if (countTicks(t) % 2 === 1) inTemplate = true;
    }

    return out.join('\n');
}

/** 从源码里粗略抽出扩展名与 id，纯展示用，抽不到就回退。 */
function readExtensionMeta(src) {
    const out = {name: '', id: '', blockCount: 0};
    try {
        // 生成的代码里 id 是不带引号的键名（id: 'myextension'），
        // 所以不能要求键名本身被引号包住。
        const idm = /\bid\s*:\s*["']([A-Za-z0-9_-]+)["']/.exec(src);
        if (idm) out.id = idm[1];
        const nameM = /\bname\s*:\s*["']([^"']{1,60})["']/.exec(src);
        if (nameM) out.name = nameM[1];
        const om = src.match(/opcode\s*:/g);
        if (om) out.blockCount = om.length;
    } catch (e) { /* 展示用，失败无所谓 */ }
    return out;
}

/** 人类可读的字节数。 */
function formatBytes(n) {
    if (!isFinite(n) || n <= 0) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}

export default function DebuggerPanel(props) {
    const code = props.code || '';

    const [targetId, setTargetId] = useState('turbowarp');
    const [customBase, setCustomBase] = useState('');
    const [copied, setCopied] = useState('');

    const meta = useMemo(function () { return readExtensionMeta(code); }, [code]);

    const srcBytes = useMemo(function () {
        try { return new TextEncoder().encode(code).length; } catch (e) { return code.length; }
    }, [code]);

    /** 为 URL 瘦身后的源码（语义等价，只少了注释、空行和行首缩进）。 */
    const slimCode = useMemo(function () {
        if (!code || !code.trim()) return '';
        try {
            const slim = minifyForUrl(code);
            // 保险：瘦身结果必须还能当函数体解析，否则宁可退回原文。
            try {
                // eslint-disable-next-line no-new-func
                new Function(slim);
                return slim;
            } catch (e) {
                return code;
            }
        } catch (e) {
            return code;
        }
    }, [code]);

    const slimBytes = useMemo(function () {
        try { return new TextEncoder().encode(slimCode).length; } catch (e) { return slimCode.length; }
    }, [slimCode]);

    /**
     * Data URI 形式的扩展直链。
     *
     * 用 base64 而不是 encodeURIComponent：导出代码里大量中文积木名，
     * 按 UTF-8 走 base64 是 4 字节/字，走 %XX 转义会膨胀到 9 字节/字。
     */
    const dataUri = useMemo(function () {
        if (!slimCode || !slimCode.trim()) return '';
        try {
            return 'data:text/javascript;base64,' + encodeBase64(slimCode);
        } catch (e) {
            return '';
        }
    }, [slimCode]);

    const base = useMemo(function () {
        const t = TARGETS.find(function (x) { return x.id === targetId; });
        if (t && t.id !== 'custom') return t.base;
        return String(customBase || '').trim().replace(/\/+$/, '');
    }, [targetId, customBase]);

    const launchUrl = useMemo(function () {
        if (!dataUri || !base) return '';
        return base + '?extension=' + encodeURIComponent(dataUri);
    }, [base, dataUri]);

    const hasCode = !!(code && code.trim());
    const tooLong = launchUrl.length > URL_WARN_LEN;

    const copyText = useCallback(function (text, tag, label) {
        if (!text) return;
        const done = function () {
            setCopied(tag);
            setTimeout(function () { setCopied(function (c) { return c === tag ? '' : c; }); }, 1600);
        };
        try {
            navigator.clipboard.writeText(text).then(done, function () {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); done(); } catch (e) { /* 忽略 */ }
                document.body.removeChild(ta);
            });
        } catch (e) {
            void label;
        }
    }, []);

    /** 主操作：拼好 Data URI 链接，新标签打开在线编辑器。 */
    const launch = useCallback(function () {
        if (!launchUrl) return;
        window.open(launchUrl, '_blank');
    }, [launchUrl]);

    /** 下载 .js：Data URI 过长时的退路，也是离线测试方式。 */
    const download = useCallback(function () {
        if (!hasCode) return;
        const name = meta.id || 'extension';
        const blob = new Blob([code], {type: 'text/javascript;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name + '.js';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }, [code, hasCode, meta.id]);

    return (
        <div className="ext-launch-root">
            <div className="ext-launch-card">
                <div className="ext-launch-head">
                    <div className="ext-launch-title">通过 Data URI 加载扩展</div>
                    <div className="ext-launch-sub">
                        把生成的扩展源码直接编码进链接，打开在线编辑器即完成加载 ——
                        不需要部署、不需要服务器、不需要公网直链。
                    </div>
                </div>

                <div className="ext-launch-meta">
                    <div className="ext-launch-meta-item">
                        <span className="ext-launch-meta-label">扩展</span>
                        <span className="ext-launch-meta-value">{meta.name || '未命名扩展'}</span>
                    </div>
                    <div className="ext-launch-meta-item">
                        <span className="ext-launch-meta-label">id</span>
                        <span className="ext-launch-meta-value">{meta.id || '—'}</span>
                    </div>
                    <div className="ext-launch-meta-item">
                        <span className="ext-launch-meta-label">积木</span>
                        <span className="ext-launch-meta-value">{meta.blockCount} 个</span>
                    </div>
                    <div className="ext-launch-meta-item">
                        <span className="ext-launch-meta-label">代码</span>
                        <span className="ext-launch-meta-value">
                            {formatBytes(srcBytes)}
                            {slimBytes && slimBytes < srcBytes && (
                                <span className="ext-launch-meta-sub">
                                    {' '}→ {formatBytes(slimBytes)}（省 {Math.round((1 - slimBytes / srcBytes) * 100)}%）
                                </span>
                            )}
                        </span>
                    </div>
                    <div className="ext-launch-meta-item">
                        <span className="ext-launch-meta-label">链接</span>
                        <span className={'ext-launch-meta-value' + (tooLong ? ' is-warn' : '')}>
                            {dataUri ? formatBytes(launchUrl.length) : '—'}
                        </span>
                    </div>
                </div>

                {!hasCode && (
                    <div className="ext-launch-empty">
                        还没有可测试的代码 —— 先在左侧工作区拖几个积木。
                    </div>
                )}

                <button
                    type="button"
                    className="ext-launch-go"
                    onClick={launch}
                    disabled={!launchUrl}
                >▶ 在 {TARGETS.find(function (t) { return t.id === targetId; }).name} 中打开并加载扩展</button>

                <div className="ext-launch-row">
                    <button
                        type="button"
                        className="ext-launch-btn"
                        onClick={function () { copyText(launchUrl, 'url'); }}
                        disabled={!launchUrl}
                    >{copied === 'url' ? '✓ 已复制' : '复制测试链接'}</button>
                    <button
                        type="button"
                        className="ext-launch-btn"
                        onClick={function () { copyText(code, 'code'); }}
                        disabled={!hasCode}
                    >{copied === 'code' ? '✓ 已复制' : '复制扩展代码'}</button>
                    <button
                        type="button"
                        className="ext-launch-btn"
                        onClick={download}
                        disabled={!hasCode}
                    >下载 .js</button>
                </div>

                <div className="ext-launch-field">
                    <span className="ext-launch-field-label">目标编辑器</span>
                    <select
                        className="ext-launch-select"
                        value={targetId}
                        onChange={function (e) { setTargetId(e.target.value); }}
                    >
                        {TARGETS.map(function (t) {
                            return <option key={t.id} value={t.id}>{t.name}</option>;
                        })}
                    </select>
                    {targetId === 'custom' && (
                        <input
                            className="ext-launch-input"
                            value={customBase}
                            placeholder="https://example.com/editor"
                            onChange={function (e) { setCustomBase(e.target.value); }}
                        />
                    )}
                </div>

                <div className="ext-launch-url" title={launchUrl}>
                    {launchUrl || '（先生成代码）'}
                </div>

                <div className="ext-launch-hint">
                    链接形如 <code>…?extension=data:text/javascript;base64,…</code>，
                    在线编辑器解析后即注册扩展，打开就能在工作区看到新积木。
                    {tooLong && (
                        <span className="ext-launch-warn">
                            {' '}当前链接已达 {formatBytes(launchUrl.length)}，部分浏览器会截断超长 URL；
                            若打开后没有加载成功，请改用「下载 .js」再在编辑器里手动加载。
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
