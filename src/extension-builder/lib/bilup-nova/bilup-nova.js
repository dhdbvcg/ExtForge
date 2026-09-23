/**
 * Bilup Nova (novatheai) 扩展插件 —— 移植适配层
 * ============================================================
 * 这是「搬运」而非「重写」：
 *  - novatheai.bundle.js 是原版 Bilup Nova 的 addon 构建产物，原样搬运（未改动逻辑）。
 *  - messages.js 是从原版构建中抽取的 190 条中文 i18n 文案（搬运原数据）。
 * 本文件只做「运行环境适配」：
 *  1. 用宿主（scratch-gui）的 React / ReactDOM / prop-types / lucide 预填原版 bundle 缺失的外部模块
 *     （外部 id 经反编译精确还原：React=0、ReactDOM=77、react-dom/client=506、prop-types=1、
 *      lucide 工厂=5、lucide 图标=1746、窗口管理=97、css-loader=10/12、UMD=89/110/162/505）。
 *     注：本 bundle 把 module 1 误编为 strip-comments，需覆盖为 prop-types；宿主 React16 无
 *      createRoot，故 506 给 null 安全降级。webpack interop（n.n）后原版用 o.a / c.a 访问。
 *  2. 实现浮动窗桥（原版经 n(97).default.createWindow 与 addon.createWindow 两路取用）。
 *  3. 实现 Scratch Addons 的 addon API shim：tab.traps.{vm,getWorkspace,getBlockly}、
 *     tab.waitForElement（把启动按钮挂载到扩展编辑器顶部菜单 .ext-menu-bar）、tab.redux、
 *     addon.createWindow、中文 msg。
 *  4. 实现 css-loader 运行时（n(10)/n(12)）：把原版 CSS 以全局 <style> 注入，并构建
 *     locals 映射（组件用 f.a.xxx 取的哈希类名），让界面与原版像素级一致。
 *  5. 用最小 webpack runtime 执行原版 bundle 入口模块 2112 的 resources["userscript.js"]。
 * Bilup Nova 自身的 UI / 聊天 / 多模型 AI / 设置 / Agent / 会话 / 工具调用逻辑全部是原版代码。
 */

import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
// 以字符串形式载入原版 bundle（raw-loader 内联，绕过 babel，避免被 scratch-gui 的 webpack 解析）
import novaBundleSrc from '!!raw-loader!./novatheai.bundle.js';
import novaMessages from './messages.js';

// ---- lucide-react 垫片（原版经 n(5).a / n(1746).a 取用 lucide 图标）----
// 宿主（scratch-gui）未安装 lucide-react，而原版把 lucide 图标作为外部模块（5=createLucideIcon 工厂、
// 1746=某个已创建图标组件）由宿主运行时提供。lucide 图标本质是「带固定 attrs 的 <svg> + 子节点」，
// 故用 React.createElement 精确还原其渲染结果，保证界面与原版像素级一致。
function createLucideIcon(iconName, iconNode) {
    const Icon = (props) => {
        const {
            color = 'currentColor',
            size = 24,
            strokeWidth = 2,
            className,
            children,
            ...rest
        } = props || {};
        return React.createElement(
            'svg',
            {
                xmlns: 'http://www.w3.org/2000/svg',
                width: size,
                height: size,
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: color,
                strokeWidth: strokeWidth,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                className: className,
                ...rest,
            },
            iconNode &&
                iconNode.map((node, i) => {
                    const tag = node[0];
                    const attrs = node[1] || {};
                    return React.createElement(tag, { key: i, ...attrs });
                }),
            children
        );
    };
    Icon.displayName = 'Lucide(' + iconName + ')';
    return Icon;
}

// ---- 最小 webpack runtime：执行原版 bundle ----
function makeRuntime() {
    const modules = {};
    const cache = {};
    function req(id) {
        if (cache[id]) return cache[id].exports;
        const fn = modules[id];
        if (!fn) throw new Error('[AI] Missing module ' + id);
        const module = { exports: {}, i: id, l: false };
        cache[id] = module;
        fn.call(module.exports, module, module.exports, req);
        module.l = true;
        return module.exports;
    }
    req.r = (exports) => {
        if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
            Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
        }
        Object.defineProperty(exports, '__esModule', { value: true });
    };
    req.d = (exports, keyOrDef, getter) => {
        if (typeof keyOrDef === 'string') {
            // webpack 5 形式：n.d(exports, key, getter)
            if (!Object.prototype.hasOwnProperty.call(exports, keyOrDef)) {
                Object.defineProperty(exports, keyOrDef, { enumerable: true, get: getter });
            }
        } else {
            // webpack 4 形式：n.d(exports, definition)
            for (const key in keyOrDef) {
                if (
                    Object.prototype.hasOwnProperty.call(keyOrDef, key) &&
                    !Object.prototype.hasOwnProperty.call(exports, key)
                ) {
                    Object.defineProperty(exports, key, { enumerable: true, get: keyOrDef[key] });
                }
            }
        }
    };
    // 与原版一致的 interop：esModule 取 .default，否则取模块本身。
    // 关键修正：原版 webpack 的 req.n 返回「一个可调用的 getter 函数」且 getter.a = 值本身。
    // 这样两种用法都能成立：
    //   - o.a.createElement  → getter.a = React → React.createElement 正常解析；
    //   - X()(!0,{},i)       → X 是 getter，X() 返回 mergeFn（函数），再 mergeFn(!0,{},i) 正常合并。
    // 若像之前那样返回 {a: 值} 对象，则 X() 会变成「调用一个对象」抛 "X is not a function"；
    // 若直接返回值，则 X() 返回合并结果（对象）而非函数，抛 "X(...) is not a function"。
    // 二者都会让「发消息 → react-markdown 渲染」时崩溃。故采用 getter 函数方案。
    req.n = (module) => {
        const value = module && module.__esModule ? module.default : module;
        const getter = () => value;
        try {
            Object.defineProperty(getter, 'a', { value, configurable: true, writable: true });
        } catch (e) {
            /* 忽略 */
        }
        return getter;
    };
    req.t = (value, mode) => {
        if (mode & 1) value = req(value);
        if (mode & 8) return value;
        if ((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
        const ns = Object.create(null);
        req.r(ns);
        Object.defineProperty(ns, 'default', { enumerable: true, value });
        if (mode & 2 && typeof value !== 'string') {
            for (const key in value) req.d(ns, key, () => value[key]);
        }
        return ns;
    };
    req.c = cache;
    req.s = {};
    return { modules, cache, req };
}

// ---- css-loader 运行时（n(10) 列表 + n(12) 注入）----
// 原版 css modules 形如 `.styles_sidebar_HASH {...}`，组件用 f.a.sidebar 取哈希类名。
// 我们把 CSS 以全局 <style> 注入（哈希类名天然不冲突），并把 local 名映射到哈希类名。
function cssLocalKey(cls) {
    const first = cls.indexOf('_');
    const last = cls.lastIndexOf('_');
    if (first === -1 || last <= first) return cls;
    return cls.slice(first + 1, last);
}
function injectNovaCss(cssText, locals) {
    if (typeof cssText !== 'string') return;
    const re = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;
    let mm;
    while ((mm = re.exec(cssText))) {
        const cls = mm[1];
        const key = cssLocalKey(cls);
        if (!(key in locals)) locals[key] = cls;
    }
    let style = document.getElementById('bilup-nova-css');
    if (!style) {
        style = document.createElement('style');
        style.id = 'bilup-nova-css';
        style.setAttribute('data-ext-addon', 'bilup-nova');
        document.head.appendChild(style);
    }
    style.textContent += '\n' + cssText;
}
function makeCssRuntime() {
    return (m) => {
        m.exports = function makeCssList() {
            const list = [];
            list.locals = {};
            list.push = function (...items) {
                for (const it of items) {
                    if (Array.isArray(it) && typeof it[1] === 'string') injectNovaCss(it[1], list.locals);
                }
            };
            list.toString = () => '';
            return list;
        };
    };
}

// ---- 浮动窗桥（原版经 n(97).default.createWindow 与 addon.createWindow 两路取用）----
function createWindowManager() {
    let zCounter = 99990;
    function createWindow(opts) {
        const o = opts || {};
        const title = o.title || '';
        const className = o.className || '';
        const width = o.width || 800;
        const height = o.height || 600;
        const minWidth = o.minWidth || 320;
        const minHeight = o.minHeight || 240;
        const x = typeof o.x === 'number' ? o.x : 80;
        const y = typeof o.y === 'number' ? o.y : 80;
        const onClose = o.onClose;
        const onResize = o.onResize;

        const root = document.createElement('div');
        root.className = 'sa-nova-wm-root ' + className;
        Object.assign(root.style, {
            position: 'fixed',
            left: x + 'px',
            top: y + 'px',
            width: width + 'px',
            height: height + 'px',
            zIndex: '1000000',
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            boxShadow: '0 8px 40px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08)',
            borderRadius: '10px',
            overflow: 'hidden',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        });

        // 点击本窗口任意位置 → 调用 React 统一层级系统置顶（与其它悬浮框同一套管理）
        root.addEventListener('mousedown', () => {
            if (typeof window.__extBringToFront === 'function') window.__extBringToFront('nova');
        });

        const titleBar = document.createElement('div');
        titleBar.className = 'sa-nova-wm-titlebar';
        Object.assign(titleBar.style, {
            height: '44px',
            flex: '0 0 44px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px 0 16px',
            cursor: 'move',
            background: '#f8f9fa',
            borderBottom: '1px solid #e8eaed',
            borderRadius: '10px 10px 0 0',
            color: '#202124',
            userSelect: 'none',
        });
        const titleText = document.createElement('span');
        titleText.textContent = title;
        Object.assign(titleText.style, {
            flex: '1',
            fontWeight: '600',
            fontSize: '14px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        });
        // 标题栏按钮区（最小化 / 最大化-还原 / 关闭）—— 对齐实时协作 .rtc-header-btns
        const headerBtns = document.createElement('div');
        headerBtns.className = 'sa-nova-wm-btns';
        Object.assign(headerBtns.style, {
            display: 'flex',
            gap: '4px',
            alignItems: 'center',
            flexShrink: '0',
        });

        function makeHeaderBtn(text, title, onClick) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.title = title;
            Object.assign(btn.style, {
                width: '26px', height: '26px',
                border: 'none', borderRadius: '6px',
                background: 'transparent', color: '#5f6368',
                fontSize: '16px', lineHeight: '1', cursor: 'pointer',
                padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background .1s',
            });
            btn.addEventListener('mouseenter', () => { btn.style.background = '#e8eaed'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
            btn.addEventListener('click', onClick);
            return btn;
        }

        // 最小化（隐藏到任务栏区域，保留 DOM）
        const minBtn = makeHeaderBtn('−', '最小化', () => { instance.minimize(); });
        // 最大化 / 还原
        const maxBtn = makeHeaderBtn('□', '最大化', () => { instance.toggleMaximize(); });
        // 关闭
        const closeBtn = makeHeaderBtn('×', '关闭', () => { instance._close(); });
        // 关闭按钮 hover 变红（视觉区分）
        closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = '#e8eaed'; closeBtn.style.color = '#d93025'; });
        closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = 'transparent'; closeBtn.style.color = '#5f6368'; });

        headerBtns.appendChild(minBtn);
        headerBtns.appendChild(maxBtn);
        headerBtns.appendChild(closeBtn);
        titleBar.appendChild(titleText);
        titleBar.appendChild(headerBtns);

        const body = document.createElement('div');
        body.className = 'sa-nova-wm-body';
        Object.assign(body.style, {
            flex: '1',
            minHeight: '0',
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
        });

        root.appendChild(titleBar);
        root.appendChild(body);
        document.body.appendChild(root);

        let contentNode = null;

        // 重要：setContent 收到的 node 是「原版 bundle 内部 ReactDOM.render 好的原生 DOM 节点」，
        // 不是 React element。直接挂到 body 即可——不能用 React.createElement 包裹它
        // （React 16 不允许把外来 DOM 节点当 child，否则整窗白屏：Objects are not valid as a React child）。
        const instance = {
            isVisible: true,
            isMinimized: false,
            isMaximized: false,
            // 保存还原前的位置/尺寸
            restoreRect: { x, y, width, height },
            x,
            y,
            setContent(node) {
                contentNode = node;
                if (node) {
                    node.style.width = '100%';
                    node.style.height = '100%';
                    body.appendChild(node);
                }
            },
            show() {
                if (!root.parentNode) document.body.appendChild(root);
                root.style.display = 'flex';
                instance.isVisible = true;
                // 打开/显示时自动置顶（统一走 React 层级系统）
                if (typeof window.__extBringToFront === 'function') window.__extBringToFront('nova');
                return instance;
            },
            bringToFront() {
                if (typeof window.__extBringToFront === 'function') {
                    window.__extBringToFront('nova');
                } else {
                    root.style.zIndex = String(++zCounter);
                }
            },
            hide() {
                root.style.display = 'none';
                instance.isVisible = false;
            },
            minimize() {
                if (instance.isMinimized) return;
                instance.isMinimized = true;
                root.style.display = 'none';
                instance.isVisible = false;
            },
            toggleMaximize() {
                if (instance.isMaximized) {
                    // 还原
                    const r = instance.restoreRect;
                    root.style.left = r.x + 'px';
                    root.style.top = r.y + 'px';
                    root.style.width = r.width + 'px';
                    root.style.height = r.height + 'px';
                    root.style.borderRadius = '10px';
                    instance.isMaximized = false;
                    maxBtn.textContent = '□';
                    maxBtn.title = '最大化';
                } else {
                    // 最大化前保存当前
                    instance.restoreRect = {
                        x: root.offsetLeft,
                        y: root.offsetTop,
                        width: root.offsetWidth,
                        height: root.offsetHeight,
                    };
                    root.style.left = '0';
                    root.style.top = '0';
                    root.style.width = window.innerWidth + 'px';
                    root.style.height = window.innerHeight + 'px';
                    root.style.borderRadius = '0';
                    instance.isMaximized = true;
                    maxBtn.textContent = '❐';
                    maxBtn.title = '还原';
                }
                if (onResize) {
                    try { onResize(root.offsetWidth, root.offsetHeight); } catch (e) { /* ignore */ }
                }
            },
            _close() {
                if (onClose) {
                    try {
                        onClose();
                    } catch (e) {
                        console.error('[AI] onClose error', e);
                    }
                }
                if (contentNode && contentNode.parentNode) {
                    contentNode.parentNode.removeChild(contentNode);
                }
                if (root.parentNode) root.parentNode.removeChild(root);
                instance.isVisible = false;
            },
        };
        closeBtn.addEventListener('click', () => instance._close());

        // 拖拽
        let dragging = false;
        let offX = 0;
        let offY = 0;
        titleBar.addEventListener('mousedown', (e) => {
            if (e.target === closeBtn || e.target === minBtn || e.target === maxBtn) return;
            dragging = true;
            offX = e.clientX - root.offsetLeft;
            offY = e.clientY - root.offsetTop;
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            root.style.left = e.clientX - offX + 'px';
            root.style.top = e.clientY - offY + 'px';
        });
        window.addEventListener('mouseup', () => {
            dragging = false;
        });

        // ── 8 方向自由拉伸（对齐实时协作 .rtc-resize-handle）──
        const rzLayer = document.createElement('div');
        rzLayer.className = 'sa-nova-wm-rz-layer';
        Object.assign(rzLayer.style, {
            position: 'absolute', top: '0', left: '0', right: '0', bottom: '0',
            pointerEvents: 'none', zIndex: '10',
        });

        const RZ_DIRS = [
            { cls: 'n',  css: { top: '-4px', left: '8px', right: '8px', height: '8px', cursor: 'ns-resize' } },
            { cls: 's',  css: { bottom: '-4px', left: '8px', right: '8px', height: '8px', cursor: 'ns-resize' } },
            { cls: 'e',  css: { right: '-4px', top: '8px', bottom: '8px', width: '8px', cursor: 'ew-resize' } },
            { cls: 'w',  css: { left: '-4px', top: '8px', bottom: '8px', width: '8px', cursor: 'ew-resize' } },
            { cls: 'ne', css: { top: '-4px', right: '-4px', width: '14px', height: '14px', cursor: 'nesw-resize' } },
            { cls: 'nw', css: { top: '-4px', left: '-4px', width: '14px', height: '14px', cursor: 'nwse-resize' } },
            { cls: 'se', css: { bottom: '-4px', right: '-4px', width: '14px', height: '14px', cursor: 'nwse-resize' } },
            { cls: 'sw', css: { bottom: '-4px', left: '-4px', width: '14px', height: '14px', cursor: 'nesw-resize' } },
        ];

        let resizing = false;
        let rzDir = null;       // 当前拉伸方向
        let startX = 0, startY = 0;
        let startRect = null;   // { x, y, w, h }

        RZ_DIRS.forEach(d => {
            const h = document.createElement('div');
            h.className = 'sa-nova-wm-rz sa-nova-wm-rz-' + d.cls;
            Object.assign(h.style, d.css, {
                position: 'absolute', pointerEvents: 'auto', zIndex: '11',
            });
            h.addEventListener('mouseenter', () => { h.style.background = 'rgba(26,115,232,.25)'; });
            h.addEventListener('mouseleave', () => { if (!resizing) h.style.background = 'transparent'; });
            h.addEventListener('mousedown', (e) => {
                if (instance.isMaximized) return; // 最大化时不允许拉伸
                resizing = true;
                rzDir = d.cls;
                startX = e.clientX; startY = e.clientY;
                startRect = { x: root.offsetLeft, y: root.offsetTop, w: root.offsetWidth, h: root.offsetHeight };
                e.preventDefault();
                e.stopPropagation();
            });
            rzLayer.appendChild(h);
        });
        root.appendChild(rzLayer);

        window.addEventListener('mousemove', (e) => {
            if (!resizing || !rzDir) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            let nx = startRect.x, ny = startRect.y, nw = startRect.w, nh = startRect.h;

            // 根据方向计算新位置/尺寸
            if (rzDir.includes('e')) nw = Math.max(minWidth, startRect.w + dx);
            if (rzDir.includes('w')) { nw = Math.max(minWidth, startRect.w - dx); nx = startRect.x + startRect.w - nw; }
            if (rzDir.includes('s')) nh = Math.max(minHeight, startRect.h + dy);
            if (rzDir.includes('n')) { nh = Math.max(minHeight, startRect.h - dy); ny = startRect.y + startRect.h - nh; }

            // 边界约束：不超出视口
            nx = Math.max(0, Math.min(nx, window.innerWidth - 80));
            ny = Math.max(0, Math.min(ny, window.innerHeight - 40));
            nw = Math.min(nw, window.innerWidth - nx);
            nh = Math.min(nh, window.innerHeight - ny);

            root.style.left = nx + 'px';
            root.style.top = ny + 'px';
            root.style.width = nw + 'px';
            root.style.height = nh + 'px';

            // 同步更新 restoreRect（非最大化时）
            if (!instance.isMaximized) {
                instance.restoreRect = { x: nx, y: ny, width: nw, height: nh };
            }

            if (onResize) {
                try { onResize(nw, nh); } catch (err) { /* ignore */ }
            }
        });
        window.addEventListener('mouseup', () => {
            if (resizing) {
                resizing = false;
                rzDir = null;
                // 清除所有手柄 hover 色
                rzLayer.querySelectorAll('.sa-nova-wm-rz').forEach(h => { h.style.background = 'transparent'; });
            }
        });

        return instance;
    }
    return { createWindow };
}

// ---- addon API shim（原版 bundle 用到的 Scratch Addons 接口）----
function isEditorDark() {
    try {
        if (document.documentElement.getAttribute('data-theme') === 'dark') return true;
        if (document.body && document.body.classList.contains('dark')) return true;
        const tw = localStorage.getItem('tw:theme');
        if (tw === 'dark') return true;
        if (tw) {
            try {
                const p = JSON.parse(tw);
                if (p.gui === 'dark') return true;
            } catch (e) {
                /* ignore */
            }
        }
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
        return false;
    }
}

function buildAddonShim(wm, ctrl) {
    const getBlockly = () => window._extBuilderBlockly || window.Blockly;
    const getWorkspace = () => {
        const B = window._extBuilderBlockly || window.Blockly;
        if (B && typeof B.getMainWorkspace === 'function') {
            try {
                return B.getMainWorkspace();
            } catch (e) {
                /* ignore */
            }
        }
        return window._extBuilderWorkspace || null;
    };
    // 扩展编辑器没有完整 scratch VM；原版做了防御式处理，给最小 stub 即可挂载。
    // 原版 UI 用 vm.on('targetsUpdate', ...) 订阅 VM 事件（EventEmitter），故需补齐 on/off/emit。
    function makeEmitter() {
        const listeners = {};
        return {
            on(evt, cb) {
                (listeners[evt] = listeners[evt] || []).push(cb);
                return this;
            },
            off(evt, cb) {
                if (!listeners[evt]) return this;
                listeners[evt] = listeners[evt].filter((f) => f !== cb);
                return this;
            },
            addListener(evt, cb) {
                return this.on(evt, cb);
            },
            removeListener(evt, cb) {
                return this.off(evt, cb);
            },
            emit(evt, ...args) {
                (listeners[evt] || []).forEach((f) => {
                    try {
                        f(...args);
                    } catch (e) {
                        /* ignore */
                    }
                });
                return this;
            },
        };
    }
    const vm = Object.assign(makeEmitter(), {
        editingTarget: null,
        runtime: Object.assign(makeEmitter(), {
            targets: [],
            getTargetById: () => null,
            getEditingTarget: () => null,
        }),
    });
    const tab = {
        traps: {
            vm,
            getWorkspace,
            getBlockly: () => Promise.resolve(getBlockly()),
        },
        redux: {
            state: {
                scratchGui: {
                    theme: {
                        isDark: () => isEditorDark(),
                    },
                },
            },
        },
        // 原版 waitForElement：菜单选择器映射到扩展编辑器 .ext-menu-bar；其余真实等待
        // ctrl.disposed 为销毁开关：AI 插件关闭时置 true，使原版 userscript 的
        // for(;;) 无限循环永久阻塞在 await，不再把按钮重新挂载回菜单栏（keep-alive 反制）。
        waitForElement: (selector, opts) => {
            if (ctrl && ctrl.disposed) return new Promise(() => {}); // 永久挂起，阻止重新挂载
            let mapped = selector;
            if (typeof selector === 'string' && selector.indexOf('menu-bar_file-group') >= 0) {
                mapped = selector.replace(/div\[class\*="menu-bar_file-group"\]/g, '.ext-menu-bar');
            }
            return new Promise((resolve) => {
                const tryResolve = () => {
                    if (ctrl && ctrl.disposed) return false; // 已销毁，绝不再解析
                    const el = document.querySelector(mapped);
                    if (el) {
                        if (opts && opts.markAsSeen) el.classList.add('sa-nova');
                        resolve(el);
                        return true;
                    }
                    return false;
                };
                if (tryResolve()) return;
                const obs = new MutationObserver(() => {
                    if (tryResolve()) obs.disconnect();
                });
                obs.observe(document.body, { childList: true, subtree: true });
                // 记录 observer，便于销毁时统一断开
                if (ctrl) (ctrl.observers = ctrl.observers || []).push(obs);
            });
        },
    };
    // addon.createWindow 是原版聊天/Agent 窗口的另一取用路径
    return {
        tab,
        createWindow: wm.createWindow,
    };
}

// ---- 中文 i18n ----
function makeMsg(dict) {
    return (key, vars) => {
        let str = dict[key];
        if (str == null) return key;
        if (vars && typeof vars === 'object') {
            str = str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
        }
        return str;
    };
}

// ---- 主流程：载入并执行原版 bundle ----
const ENTRY_MODULE_ID = 2112;

export default {
    id: 'bilup-nova',
    name: 'AI',
    description: 'AI 助手（从原版搬运移植，悬浮聊天框 / 多模型 / 设置 / Agent / 会话）',
    category: 'AI',
    css: '',
    setup() {
        try {
            const { modules, req } = makeRuntime();

            // 1) 先把原版 bundle 放进我们自己的 webpack runtime（临时替换全局 webpackJsonpGUI）
            const savedGlobal = window.webpackJsonpGUI;
            window.webpackJsonpGUI = [];
            try {
                // eslint-disable-next-line no-eval
                (0, eval)(novaBundleSrc);
            } catch (e) {
                console.error('[AI] bundle eval error', e);
            }
            // 注册 push 进来的原版模块（不破坏 scratch-gui 自身 runtime）
            const pushed = window.webpackJsonpGUI;
            window.webpackJsonpGUI = savedGlobal;
            for (let c = 0; c < pushed.length; c++) {
                const mods = pushed[c] && pushed[c][1];
                if (!mods) continue;
                for (const id in mods) {
                    if (Object.prototype.hasOwnProperty.call(mods, id)) modules[id] = mods[id];
                }
            }

            // 2) 注册之后，再覆盖注入「外部模块」（宿主提供，必须优先于 bundle 内同名模块）。
            //    经反编译精确还原的原版外部模块契约（bundle 内未定义、由宿主运行时提供）：
            //      React(0)、ReactDOM(77)、react-dom/client(506, 可选 try/catch 兜底)、
            //      prop-types(1, 本 bundle 错把 module 1 编为 strip-comments，需覆盖)、
            //      lucide createLucideIcon(5)、lucide 图标组件(1746)、窗口管理(97)、
            //      css-loader(10/12)、UMD 垫片(89/110/162/505)。
            //    其中 0/5/77/89/110/162/505/506/1746 在 bundle 内未定义（纯外部），
            //    只有 module 1 是「bundle 定义 + 需覆盖」的特殊冲突项。
            const reactMod = (m) => { m.exports = React; };
            const reactDomMod = (m) => { m.exports = ReactDOM; };
            const propTypesMod = (m) => { m.exports = PropTypes; };
            // lucide 图标：5=createLucideIcon 工厂（Qb.a("bot",...)），1746=已创建的关于图标组件（ty.a）
            const aboutIcon = createLucideIcon('info', [
                ['circle', { cx: 12, cy: 12, r: 10 }],
                ['path', { d: 'M12 16v-4' }],
                ['path', { d: 'M12 8h.01' }],
            ]);
            const lucideFactoryMod = (m) => { m.exports = { a: createLucideIcon }; };
            const lucideIconMod = (m) => { m.exports = { a: aboutIcon }; };
            // react-dom/client：原版用 try/catch 兜底，React16 没有 createRoot，给 null 安全降级
            const reactDomClientMod = (m) => { m.exports = null; };

            modules[0] = reactMod;            // React
            modules[77] = reactDomMod;        // ReactDOM
            modules[506] = reactDomClientMod; // react-dom/client（可选）
            modules[5] = lucideFactoryMod;    // lucide createLucideIcon 工厂
            modules[1746] = lucideIconMod;    // lucide 关于图标组件
            modules[1] = propTypesMod;        // prop-types（覆盖 bundle 内 strip-comments）

            // 浮动窗桥：原版经 n(97).default.createWindow 与 addon.createWindow 两路取用
            const wm = createWindowManager();
            modules[97] = (m) => { m.exports = { default: wm }; };

            // css-loader 运行时（n(10) 列表收集 + 注入；n(12) 注入器在本环境为 no-op）
            modules[10] = makeCssRuntime();
            modules[12] = (m) => { m.exports = function () {}; };

            // UMD 垫片（process / Buffer / global / setImmediate）—— 仅被图片 dataURL 模块引用
            modules[89] = (m) => { m.exports = {}; };
            modules[110] = (m) => { m.exports = { Buffer: { isBuffer: () => false } }; };
            modules[162] = (m) => { m.exports = (typeof window !== 'undefined' ? window : {}); };
            modules[505] = (m) => {
                m.exports = {
                    setImmediate: (fn, ...a) => setTimeout(() => fn(...a), 0),
                    clearImmediate: () => {},
                };
            };

            // 适配：原版 Nova 经 window.Blockly.ContextMenu.addDynamicMenuItem 在积木右键菜单注入
            // 「加入对话」动态项（scratch-blocks 不提供该 API，仅原生 Blockly 有）。提供最小垫片：
            // 记录回调并返回可注销的 id；不真正注入到右键菜单（属宿主限制，移植适配范畴）。
            // 需在 window.Blockly.ContextMenu 就绪后再打补丁，故做几次重试。
            const applyContextMenuShim = () => {
                const cm = window.Blockly && window.Blockly.ContextMenu;
                if (!cm || typeof cm.addDynamicMenuItem === 'function') return true;
                const items = [];
                let seq = 0;
                cm.addDynamicMenuItem = (cb, opts) => {
                    const id = 'nova-dyn-' + ++seq;
                    items.push({ id, cb, opts });
                    return id;
                };
                cm.deleteDynamicMenuItem = (id) => {
                    for (let i = items.length - 1; i >= 0; i--) {
                        if (items[i].id === id) items.splice(i, 1);
                    }
                };
                return true;
            };
            if (!applyContextMenuShim()) {
                let tries = 0;
                const iv = setInterval(() => {
                    if (applyContextMenuShim() || ++tries > 20) clearInterval(iv);
                }, 200);
            }

            // 入口：原版把 userscript 作为 resources["userscript.js"] 导出
            const entry = req(ENTRY_MODULE_ID);
            const resources = entry && entry.resources;
            const userscript = resources && resources['userscript.js'];
            if (typeof userscript !== 'function') {
                console.error('[AI] userscript 入口未找到');
                return () => {};
            }

            const msg = makeMsg(novaMessages);
            // 销毁控制器：cleanup 时置 disposed=true 阻止原版 userscript 的 for(;;) 重新挂载按钮，
            // 同时收集所有 waitForElement 创建的 MutationObserver 统一断开。
            const ctrl = { disposed: false, observers: [] };
            const addon = buildAddonShim(wm, ctrl);

            // 诊断 + 降级：捕获 Nova 渲染崩溃（多为 react-markdown 路径的 "X is not a function"），
            // 向空白的浮动窗体注入「原生 DOM」降级提示（不经 React，避免二次崩溃），
            // 同时把完整栈写入 window.__novaRenderErrors 供定位根因。
            window.__novaRenderErrors = [];
            const _origHandler = window.onerror || null;
            window.onerror = function (msg, url, line, col, err) {
                const detail = { msg, url, line, col, stack: err && err.stack, name: err && err.name };
                window.__novaRenderErrors.push(detail);
                console.error('[AI] RENDER CRASH:', JSON.stringify(detail));
                // 降级提示：在空白的 Nova 浮动窗体内注入原生 DOM 说明（不经 React）
                try {
                    const bodies = document.querySelectorAll('.sa-nova-wm-body');
                    bodies.forEach((b) => {
                        if (b.querySelector('.sa-nova-degraded')) return;
                        const d = document.createElement('div');
                        d.className = 'sa-nova-degraded';
                        Object.assign(d.style, {
                            position: 'absolute', inset: '0', display: 'flex',
                            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            padding: '24px', textAlign: 'center', color: '#666', fontFamily: 'inherit',
                            background: '#fff', boxSizing: 'border-box',
                        });
                        const icon = document.createElement('div');
                        icon.textContent = '⚠️';
                        icon.style.cssText = 'font-size:32px;margin-bottom:12px;';
                        const t1 = document.createElement('div');
                        t1.textContent = 'AI 渲染出错';
                        t1.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:8px;';
                        const t2 = document.createElement('div');
                        t2.textContent = 'AI 响应渲染失败（可能是 markdown 解析器兼容性问题）：' + (err && err.message ? err.message : msg);
                        t2.style.cssText = 'font-size:13px;max-width:360px;line-height:1.5;';
                        d.appendChild(icon); d.appendChild(t1); d.appendChild(t2);
                        b.appendChild(d);
                    });
                } catch (e) { /* ignore */ }
                if (_origHandler) return _origHandler.apply(this, arguments);
            };

            // 执行原版 addon（向顶部菜单注入 Bilup Nova 启动按钮）
            Promise.resolve()
                .then(() => userscript({ addon, msg }))
                .catch((e) => console.error('[AI] userscript 运行错误', e));

            return () => {
                // 销毁控制器：先置 disposed=true，使原版 userscript 的 for(;;) 永久阻塞在
                // await waitForElement，不再把按钮重新挂载回菜单栏（keep-alive 反制）。
                ctrl.disposed = true;
                if (ctrl.observers) ctrl.observers.forEach((o) => { try { o.disconnect(); } catch (e) { /* ignore */ } });
                // 清理：移除启动按钮（data-mw-item="nova"）与所有浮动窗（.sa-nova-wm-root）。
                // 注意：不要匹配 .sa-nova —— 该 class 是 markAsSeen 标记在编辑器菜单元素上的，
                // 误删会破坏顶部菜单栏。只精确移除 AI 自己的按钮与窗口即可。
                const sel = '.sa-nova-wm-root, [data-mw-item="nova"]';
                document.querySelectorAll(sel).forEach((el) => { el.remove(); });
                const css = document.getElementById('bilup-nova-css');
                if (css) css.remove();
            };
        } catch (e) {
            console.error('[AI] 初始化失败', e);
            return () => {};
        }
    },
};
