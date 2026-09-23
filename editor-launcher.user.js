// ==UserScript==
// @name         一键启动 · scratch 扩展编辑器
// @namespace    https://scratchextensioneditor.cc.cd/
// @version      1.5.0
// @description  网页右下角悬浮按钮：一键启动并打开本地 scratch 扩展编辑器（http://127.0.0.1:8601）；编辑器已打开时自动隐藏（可切换）；可拖动、可收起、带状态灯
// @author       dhdbvcg
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

/*
 * 用法
 * 1) 先在本机运行一次 install-editor-protocol.bat（注册 scratchedit:// 协议，仅写 HKCU，不需要管理员）
 * 2) 在 Tampermonkey 里安装本脚本
 * 3) 任意网页右下角出现「启动扩展编辑器」按钮，点一下即可：
 *    - 若本地服务已在运行 -> 直接打开编辑器
 *    - 若未运行 -> 通过 scratchedit:// 协议拉起 start-editor.bat，等端口就绪后自动打开
 *
 * 交互
 *   · 按钮左侧小圆点 = 本地服务状态：绿 = 已启动，灰白 = 未启动/未知（每 30s 检查，切回标签页立即检查）
 *   · 编辑器已打开（服务可达，或当前就在编辑器页）时 -> 自动隐藏按钮（可在脚本菜单里关掉）
 *   · 按住按钮拖动 = 挪位置；点「×」= 收起成小圆点（位置/收起状态都记忆）
 *
 * 脚本菜单（Tampermonkey 扩展图标 -> 本脚本）
 *   · 重置按钮位置
 *   · 切换「已打开时隐藏按钮」
 *
 * 说明：浏览器不允许网页直接启动本地进程，所以真正的「启动」由
 *       start-editor.bat 完成，本脚本只负责触发它并等待结果。
 */

(function () {
    'use strict';

    // 只在顶层页面注入，避免页面里每个 iframe 都冒出一个按钮
    if (window.top !== window.self) return;

    var DEV_PORT = 8601;
    var EDITOR_URL = 'http://127.0.0.1:' + DEV_PORT + '/editor.html';
    var PROBE_URL = 'http://127.0.0.1:' + DEV_PORT + '/manifest.webmanifest';
    var EDITOR_ORIGIN = 'http://127.0.0.1:' + DEV_PORT;
    var PROTO_URL = 'scratchedit://start';
    var STATUS_INTERVAL = 30000;

    // ── 存储：优先用 Tampermonkey 的跨站存储，退化到 localStorage（按站点隔离） ──
    var HAS_GM = (typeof GM_getValue === 'function' && typeof GM_setValue === 'function');
    function storeGet(key, def) {
        try {
            if (HAS_GM) {
                var v = GM_getValue(key, undefined);
                return (v === undefined || v === null) ? def : v;
            }
        } catch (e) { /* ignore */ }
        try {
            var s = localStorage.getItem('sce_' + key);
            return s === null ? def : s;
        } catch (e) { /* ignore */ }
        return def;
    }
    function storeSet(key, val) {
        try {
            if (HAS_GM) { GM_setValue(key, val); return; }
        } catch (e) { /* ignore */ }
        try { localStorage.setItem('sce_' + key, String(val)); } catch (e) { /* ignore */ }
    }

    function getHideWhenOpen() { return storeGet('hideWhenOpen', '1') !== '0'; }
    function setHideWhenOpen(on) { storeSet('hideWhenOpen', on ? '1' : '0'); }

    var css = [
        '#sce-launcher{position:fixed;right:18px;bottom:18px;z-index:2147483647;',
        'display:flex;align-items:center;gap:6px;',
        'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;}',
        '#sce-launcher.sce-dragging{cursor:move;opacity:.92;}',
        '#sce-launcher button{cursor:pointer;border:0;font-size:13px;font-weight:600;',
        'transition:transform .12s ease,background .12s ease,opacity .12s ease;}',
        '#sce-main{display:inline-flex;align-items:center;border-radius:22px;padding:10px 18px;',
        'background:#FF8C1A;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.28);}',
        '#sce-main:hover{background:#f07d0a;transform:translateY(-1px);}',
        '#sce-main[disabled]{opacity:.72;cursor:default;transform:none;}',
        '.sce-dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:0 0 auto;',
        'background:rgba(255,255,255,.55);transition:background .2s ease,box-shadow .2s ease;}',
        '#sce-main .sce-dot{margin-right:7px;}',
        '#sce-main .sce-dot.up{background:#2ecc71;box-shadow:0 0 0 2px rgba(255,255,255,.4);}',
        '#sce-hide{width:26px;height:26px;border-radius:50%;padding:0;line-height:1;',
        'background:rgba(17,24,39,.72);color:#fff;font-size:15px;font-weight:400;',
        'box-shadow:0 4px 12px rgba(0,0,0,.24);}',
        '#sce-hide:hover{background:rgba(17,24,39,.9);}',
        '#sce-mini{display:none;position:relative;width:40px;height:40px;border-radius:50%;padding:0;',
        'background:#FF8C1A;color:#fff;font-size:12px;',
        'align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.28);}',
        '#sce-mini:hover{background:#f07d0a;transform:translateY(-1px);}',
        '#sce-mini .sce-dot{position:absolute;top:-1px;right:-1px;width:11px;height:11px;',
        'margin:0;border:2px solid #fff;background:rgba(17,24,39,.4);}',
        '#sce-mini .sce-dot.up{background:#2ecc71;}',
        '#sce-launcher.sce-collapsed #sce-main,',
        '#sce-launcher.sce-collapsed #sce-hide{display:none;}',
        '#sce-launcher.sce-collapsed #sce-mini{display:inline-flex;}',
        '#sce-toast{position:fixed;right:18px;bottom:68px;z-index:2147483647;max-width:300px;',
        'background:rgba(17,24,39,.95);color:#fff;border-radius:8px;padding:10px 12px;font-size:12px;',
        'line-height:1.55;box-shadow:0 8px 24px rgba(0,0,0,.32);display:none;word-break:break-word;}'
    ].join('');

    var style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = 'sce-launcher';

    var btn = document.createElement('button');
    btn.id = 'sce-main';
    btn.type = 'button';
    var btnDot = document.createElement('span');
    btnDot.className = 'sce-dot';
    var btnLabel = document.createElement('span');
    btnLabel.textContent = '启动扩展编辑器';
    btn.appendChild(btnDot);
    btn.appendChild(btnLabel);

    var hideBtn = document.createElement('button');
    hideBtn.id = 'sce-hide';
    hideBtn.type = 'button';
    hideBtn.textContent = '×';
    hideBtn.title = '收起成小圆点';

    var miniBtn = document.createElement('button');
    miniBtn.id = 'sce-mini';
    miniBtn.type = 'button';
    miniBtn.title = '展开「启动扩展编辑器」按钮';
    var miniLabel = document.createElement('span');
    miniLabel.textContent = '编辑器';
    var miniDot = document.createElement('span');
    miniDot.className = 'sce-dot';
    miniBtn.appendChild(miniLabel);
    miniBtn.appendChild(miniDot);

    wrap.appendChild(btn);
    wrap.appendChild(hideBtn);
    wrap.appendChild(miniBtn);

    var toast = document.createElement('div');
    toast.id = 'sce-toast';

    // ── 「已经打开就不显示启动按钮」（可在脚本菜单切换） ──
    //   判定为“已打开”：本地服务可达（编辑器已启动），或当前页面本身就是编辑器页。
    //   隐藏期间仍继续轮询，服务一旦停掉按钮会自动回来。
    function applyVisibility(up) {
        var onEditor = location.origin === EDITOR_ORIGIN;
        var hide = getHideWhenOpen() && (!!up || onEditor);
        wrap.style.display = hide ? 'none' : '';
        if (hide) toast.style.display = 'none';
    }

    // ── 状态灯 ──
    function setStatus(up) {
        var cls = up ? 'up' : 'down';
        btnDot.className = 'sce-dot ' + cls;
        miniDot.className = 'sce-dot ' + cls;
        btn.title = (up ? '本地服务运行中' : '本地服务未启动') + ' · ' + EDITOR_URL + '\n按住可拖动，点右侧 × 可收起';
        applyVisibility(up);
    }
    function refreshStatus() {
        if (document.hidden) return;          // 后台标签页不探测，避免无谓的请求/报错
        probe(1500).then(setStatus);
    }

    // ── 收起 / 展开 ──
    function setCollapsed(on) {
        if (on) wrap.classList.add('sce-collapsed');
        else wrap.classList.remove('sce-collapsed');
        storeSet('collapsed', on ? '1' : '0');
    }
    setCollapsed(storeGet('collapsed', '0') === '1');
    hideBtn.addEventListener('click', function () { if (dragged) return; setCollapsed(true); });
    miniBtn.addEventListener('click', function () { if (dragged) return; setCollapsed(false); });

    // ── 拖动（按住按钮本体移动；位移小于阈值时仍算点击） ──
    var dragState = null;
    var dragged = false;

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function applyPos(left, top) {
        wrap.style.right = 'auto';
        wrap.style.bottom = 'auto';
        wrap.style.left = left + 'px';
        wrap.style.top = top + 'px';
    }

    function resetPos() {
        wrap.style.left = '';
        wrap.style.top = '';
        wrap.style.right = '';
        wrap.style.bottom = '';
        storeSet('pos', '');
    }

    function restorePos() {
        var raw = storeGet('pos', '');
        if (!raw) return;
        var p;
        try { p = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) { return; }
        if (!p || typeof p.left !== 'number' || typeof p.top !== 'number') return;
        var r = wrap.getBoundingClientRect();
        applyPos(
            clamp(p.left, 4, Math.max(4, window.innerWidth - r.width - 4)),
            clamp(p.top, 4, Math.max(4, window.innerHeight - r.height - 4))
        );
    }

    function onDragMove(e) {
        if (!dragState) return;
        var dx = e.clientX - dragState.sx;
        var dy = e.clientY - dragState.sy;
        if (!dragged && Math.abs(dx) + Math.abs(dy) > 4) {
            dragged = true;
            wrap.classList.add('sce-dragging');
        }
        if (!dragged) return;
        applyPos(
            clamp(dragState.ox + dx, 4, Math.max(4, window.innerWidth - dragState.w - 4)),
            clamp(dragState.oy + dy, 4, Math.max(4, window.innerHeight - dragState.h - 4))
        );
        e.preventDefault();
    }

    function onDragEnd() {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        wrap.classList.remove('sce-dragging');
        if (dragged && dragState) {
            var r = wrap.getBoundingClientRect();
            storeSet('pos', JSON.stringify({left: Math.round(r.left), top: Math.round(r.top)}));
        }
        dragState = null;
    }

    wrap.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        var r = wrap.getBoundingClientRect();
        dragState = {sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, w: r.width, h: r.height};
        dragged = false;                       // 每次按下都重置；纯点击时保持 false
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    });

    window.addEventListener('resize', function () {
        var r = wrap.getBoundingClientRect();
        if (wrap.style.left) {
            applyPos(
                clamp(r.left, 4, Math.max(4, window.innerWidth - r.width - 4)),
                clamp(r.top, 4, Math.max(4, window.innerHeight - r.height - 4))
            );
        }
    });

    var toastTimer = null;
    function say(msg, ms) {
        toast.textContent = msg;
        toast.style.display = 'block';
        if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
        if (ms) toastTimer = setTimeout(function () { toast.style.display = 'none'; }, ms);
    }

    function busy(on) {
        btn.disabled = !!on;
        btnLabel.textContent = on ? '启动中…' : '启动扩展编辑器';
    }

    // 探测本地服务：跨域读不到内容，能连上（不 reject）就算已启动
    function probe(timeout) {
        return new Promise(function (resolve) {
            var done = false;
            var ctl = new AbortController();
            var timer = setTimeout(function () {
                if (done) return;
                done = true;
                try { ctl.abort(); } catch (e) { /* ignore */ }
                resolve(false);
            }, timeout || 1200);
            fetch(PROBE_URL, {mode: 'no-cors', cache: 'no-store', signal: ctl.signal})
                .then(function () { if (!done) { done = true; clearTimeout(timer); resolve(true); } })
                .catch(function () { if (!done) { done = true; clearTimeout(timer); resolve(false); } });
        });
    }

    // 触发自定义协议（install-editor-protocol.bat 注册）
    function fireProtocol() {
        try {
            var f = document.createElement('iframe');
            f.style.display = 'none';
            f.src = PROTO_URL;
            (document.body || document.documentElement).appendChild(f);
            setTimeout(function () { try { f.parentNode.removeChild(f); } catch (e) { /* ignore */ } }, 3000);
        } catch (e) { /* ignore */ }
        try { window.location.href = PROTO_URL; } catch (e) { /* ignore */ }
    }

    btn.addEventListener('click', function () {
        if (dragged) return;                   // 刚才是拖动，不算点击

        // 已经在编辑器页面上：直接刷新到编辑器
        if (location.origin === EDITOR_ORIGIN) {
            location.href = EDITOR_URL;
            return;
        }

        busy(true);
        say('正在检查本地服务…');

        // 关键：在用户手势内先拿到标签页句柄，否则异步 window.open 会被弹窗拦截
        var tab = window.open('about:blank', '_blank');

        function openEditor() {
            if (tab && !tab.closed) {
                try { tab.location.href = EDITOR_URL; return; } catch (e) { /* fallthrough */ }
            }
            location.href = EDITOR_URL;
        }
        function dropTab() {
            if (tab && !tab.closed) { try { tab.close(); } catch (e) { /* ignore */ } }
        }

        probe().then(function (up) {
            setStatus(up);
            if (up) {
                say('本地服务已在运行，正在打开…', 2500);
                openEditor();
                return;
            }
            say('正在拉起本地服务…首次启动需 1-2 分钟。若长时间无反应，请先运行 install-editor-protocol.bat');
            fireProtocol();

            var tries = 0;
            var iv = setInterval(function () {
                tries++;
                probe().then(function (ok) {
                    if (ok) {
                        clearInterval(iv);
                        setStatus(true);
                        say('已就绪，正在打开编辑器…', 2500);
                        openEditor();
                        busy(false);
                    } else if (tries >= 60) {   // 60 × 2s ≈ 2 分钟
                        clearInterval(iv);
                        setStatus(false);
                        dropTab();
                        say('等待超时。请确认已运行 install-editor-protocol.bat，或手动双击 start-editor.bat 后重试。', 8000);
                        busy(false);
                    }
                });
            }, 2000);
        });
    });

    // ── 脚本菜单（Tampermonkey 图标 -> 本脚本） ──
    function registerMenus() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        try {
            GM_registerMenuCommand('重置按钮位置', function () {
                resetPos();
            });
            GM_registerMenuCommand('切换「已打开时隐藏按钮」', function () {
                setHideWhenOpen(!getHideWhenOpen());
                refreshStatus();
            });
        } catch (e) { /* ignore */ }
    }

    function mount() {
        document.body.appendChild(wrap);
        document.body.appendChild(toast);
        restorePos();
        // 当前就在编辑器页面上 -> 立刻隐藏（不等探测结果，避免闪一下）
        if (location.origin === EDITOR_ORIGIN) applyVisibility(false);
        registerMenus();
        refreshStatus();
        setInterval(refreshStatus, STATUS_INTERVAL);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) refreshStatus();
        });
    }
    if (document.body) mount();
    else window.addEventListener('DOMContentLoaded', mount, {once: true});
})();
