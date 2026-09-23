// 更多右键菜单栏 (developer-tools)
// 右键积木新增「全部复制（整条脚本）/ 复制积木（单块）/ 剪切积木」，复制内容存入内部剪贴板；
// 点击空白画布会浮现「粘贴」按钮，点击即可粘贴；增强「整理积木」。
export default {
    id: 'developer-tools',
    name: '更多右键菜单栏',
    description: '右键积木新增「全部复制（整条脚本）/ 复制积木（单块）/ 剪切积木」，复制内容存入内部剪贴板；点击空白画布会浮现「粘贴」按钮，点击即可粘贴。区别于原版「复制」直接落一块到画布。',
    category: '编辑器',
    recommended: true,
    options: [
        { id: 'enhanced-cleanup', label: '增强"整理积木"', default: true },
        { id: 'paste-at-mouse', label: '在鼠标指针处粘贴积木', default: true }
    ],
    css: ``,
    setup: async (ctx) => {
        const B = ctx.Blockly;
        if (!B || !B.Xml || !B.Gesture || !B.ContextMenu) return () => {};

        const addonConfig = ctx.addon || {};
        const optionDefs = addonConfig.options || [];
        const getOpts = () => {
            try {
                const saved = JSON.parse(localStorage.getItem('extbuilder_opts_' + (addonConfig.id || 'developer-tools')) || '{}');
                const defaults = {};
                optionDefs.forEach(o => { defaults[o.id] = !!o.default; });
                return {...defaults, ...saved};
            } catch (e) {
                const defaults = {};
                optionDefs.forEach(o => { defaults[o.id] = !!o.default; });
                return {...defaults};
            }
        };

        let clipboardXml = null;

        let lastTarget = null;
        let lastWorkspace = null;
        let lastMouseWsPos = null;

        const computeWsPos = (e, ws) => {
            if (!e || !ws || !ws.getCanvas) return null;
            try {
                const svg = ws.getCanvas();
                if (svg && svg.createSVGPoint) {
                    const pt = svg.createSVGPoint();
                    pt.x = e.clientX; pt.y = e.clientY;
                    const ctm = svg.getScreenCTM();
                    if (ctm) return pt.matrixTransform(ctm.inverse());
                }
            } catch (err) { /* silent */ }
            return null;
        };

        const getMainWs = () => { try { return ctx.getWorkspace && ctx.getWorkspace(); } catch (e) { return null; } };

        const getStackTop = (b) => {
            let t = b;
            try { while (t.getParent && t.getParent()) t = t.getParent(); } catch (e) {}
            return t;
        };
        // 定义块（"定义XXX实现"）本身不参与复制：向上找根时遇到它就停下，
        // 否则"全部复制"会把定义块帽子一起复制，粘贴后多出一个定义块。
        const isDefineBlock = (b) => !!(b && b.type === 'block_define');
        const getCopyRoot = (b) => {
            let t = b;
            try {
                while (t.getParent && t.getParent()) {
                    const p = t.getParent();
                    if (isDefineBlock(p)) break;
                    t = p;
                }
            } catch (e) { /* silent */ }
            return t;
        };
        // 取定义块"实现 %1"语句里的第一块（右键点在定义块本体上时用它）
        const getDefineInnerBlock = (defBlock) => {
            try {
                const input = defBlock.getInput && defBlock.getInput('IMPL');
                const conn = input && input.connection;
                return conn && conn.targetBlock ? conn.targetBlock() : null;
            } catch (e) { return null; }
        };
        const serializeStack = (topBlock) => {
            const xml = B.Xml.blockToDom(topBlock, true);
            return new XMLSerializer().serializeToString(xml);
        };
        const serializeSingle = (block) => {
            const xml = B.Xml.blockToDom(block, true);
            const nextEl = xml.getElementsByTagName('next')[0];
            if (nextEl && nextEl.parentNode) nextEl.parentNode.removeChild(nextEl);
            return new XMLSerializer().serializeToString(xml);
        };
        const setClipboard = (xmlStr) => { clipboardXml = xmlStr; };

        const copyAll = (block) => {
            if (!block) return;
            try {
                let top = getCopyRoot(block);
                // 右键点在定义块本体上 → 只复制它"实现"里的那摞积木，不含定义块帽子
                if (isDefineBlock(top)) {
                    const inner = getDefineInnerBlock(top);
                    if (!inner) { setClipboard(null); return; } // 实现里没积木 → 不可粘贴
                    top = inner;
                }
                setClipboard(serializeStack(top));
            } catch (e) { console.warn('[MoreRightClick] 复制失败:', e); }
        };
        const copySingle = (block) => {
            if (!block || isDefineBlock(block)) return; // 定义块不允许单独复制
            try { setClipboard(serializeSingle(block)); } catch (e) { console.warn('[MoreRightClick] 复制失败:', e); }
        };
        const cutSingle = (block) => {
            if (!block || isDefineBlock(block)) return; // 定义块不允许剪切
            try {
                setClipboard(serializeSingle(block));
                const nextBlock = block.getNextBlock && block.getNextBlock();
                if (nextBlock && block.nextConnection) {
                    try { block.nextConnection.disconnect(); } catch (e) {}
                }
                block.dispose(true);
            } catch (e) { console.warn('[MoreRightClick] 剪切失败:', e); }
        };

        const pasteBlocks = (ws, optX, optY) => {
            if (!clipboardXml || !ws || !B.Xml || !B.Xml.domToBlock) return;
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(clipboardXml, 'text/xml');
                const blockEl = xmlDoc.documentElement;
                if (!blockEl || blockEl.tagName !== 'block') return;
                if (!B.Events.getGroup()) B.Events.setGroup(true);
                const newBlock = B.Xml.domToBlock(blockEl, ws);
                if (!newBlock) return;
                if (B.scratchBlocksUtils && B.scratchBlocksUtils.changeObscuredShadowIds) {
                    B.scratchBlocksUtils.changeObscuredShadowIds(newBlock);
                }
                const cur = newBlock.getRelativeToSurfaceXY ? newBlock.getRelativeToSurfaceXY() : {x: 0, y: 0};
                let dx, dy;
                if (optX !== undefined && optY !== undefined) {
                    dx = optX - cur.x; dy = optY - cur.y;
                } else {
                    dx = 40; dy = 40;
                }
                newBlock.moveBy(dx, dy);
                if (ws.select && newBlock.select) {
                    try { ws.select(newBlock); } catch (e) { /* silent */ }
                }
                B.Events.setGroup(false);
            } catch (e) {
                console.warn('[MoreRightClick] 粘贴失败:', e);
            }
        };

        const enhancedCleanUp = (ws) => {
            if (!ws) return;
            let tops;
            try { tops = ws.getTopBlocks(false); } catch (e) { return; }
            if (!tops || tops.length === 0) return;
            const hats = [];
            const orphans = [];
            tops.forEach(b => {
                const isHat = !b.previousConnection && !b.outputConnection;
                if (isHat) hats.push(b);
                else orphans.push(b);
            });
            const COL_GAP = 180;
            const ROW_GAP = 48;
            let x = 20, maxY = 0;
            const layoutColumn = (blocks) => {
                let cx = x, cy = 10;
                blocks.forEach(block => {
                    try {
                        const hw = block.width || block.height || 120;
                        const hh = block.height || block.height || 80;
                        block.moveBy(cx - (block.getRelativeToSurfaceXY ? block.getRelativeToSurfaceXY().x : 0),
                                    cy - (block.getRelativeToSurfaceXY ? block.getRelativeToSurfaceXY().y : 0));
                        cy += hh + ROW_GAP;
                        if (cy > maxY) maxY = cy;
                    } catch (e) { /* 跳过不可移动的 */ }
                });
                x += COL_GAP;
            };
            if (hats.length) layoutColumn(hats);
            if (orphans.length) layoutColumn(orphans);
            try { ws.resizeContents(); } catch (e) { /* silent */ }
        };

        const origHandleRightClick = B.Gesture.prototype.handleRightClick;
        B.Gesture.prototype.handleRightClick = function (e) {
            lastTarget = this.targetBlock_ || null;
            lastWorkspace = this.startWorkspace_ || null;
            lastMouseWsPos = computeWsPos(e, lastWorkspace);
            return origHandleRightClick.call(this, e);
        };

        const origShow = B.ContextMenu.show;
        B.ContextMenu.show = function (e, options, rtl) {
            try {
                const opts = getOpts();
                const ws = lastWorkspace || getMainWs();
                const block = lastTarget ||
                    (ws && ws.getSelected && ws.getSelected()) || null;

                const newOptions = [];

                const canUndo = ws && ws.undoStack && Array.isArray(ws.undoStack) && ws.undoStack.length > 0;
                const canRedo = ws && ws.redoStack && Array.isArray(ws.redoStack) && ws.redoStack.length > 0;
                let _canUndo = false, _canRedo = false;
                try {
                    if (B.Events && typeof B.Events.getUndoStack === 'function') {
                        _canUndo = B.Events.getUndoStack().length > 0;
                    }
                    if (B.Events && typeof B.Events.getRedoStack === 'function') {
                        _canRedo = B.Events.getRedoStack().length > 0;
                    }
                } catch(e) {}
                try {
                    if (!_canUndo && ws && ws.undo_ && Array.isArray(ws.undo_)) _canUndo = ws.undo_.length > 0;
                    if (!_canRedo && ws && ws.redo_ && Array.isArray(ws.redo_)) _canRedo = ws.redo_.length > 0;
                } catch(e) {}

                newOptions.push({
                    text: '撤销',
                    enabled: _canUndo,
                    callback: () => { try { if (ws && ws.undo) ws.undo(); else if (B.Commands) B.Commands.undo(); } catch(x){} }
                });
                newOptions.push({
                    text: '重做',
                    enabled: _canRedo,
                    callback: () => { try { if (ws && ws.redo) ws.redo(); else if (B.Commands) B.Commands.redo(); } catch(x){} }
                });

                newOptions.push({text: '──', enabled: false, callback: function(){}});

                newOptions.push({
                    text: '整理积木' + (opts['enhanced-cleanup'] ? '+' : ''),
                    enabled: !!(ws && ws.getTopBlocks),
                    callback: () => {
                        if (opts['enhanced-cleanup']) enhancedCleanUp(ws);
                        else try { if (ws && ws.cleanUp) ws.cleanUp(); } catch(e){}
                    }
                });

                newOptions.push({text: '──', enabled: false, callback: function(){}});

                if (block && options && options.length > 0) {
                    for (const opt of options) newOptions.push(opt);
                    options.length = 0;
                    newOptions.push({text: '──', enabled: false, callback: function(){}});
                    newOptions.push({
                        text: '全部复制',
                        // 定义块只有"实现"里有积木时才有可复制的内容
                        enabled: !isDefineBlock(block) || !!getDefineInnerBlock(block),
                        callback: () => { copyAll(block); }
                    });
                    newOptions.push({
                        text: '复制积木',
                        enabled: !isDefineBlock(block),
                        callback: () => { copySingle(block); }
                    });
                    newOptions.push({
                        text: '剪切积木',
                        enabled: (typeof block.isDeletable !== 'function') ? true : block.isDeletable(),
                        callback: () => { cutSingle(block); }
                    });
                }

                newOptions.push({
                    text: '粘贴',
                    enabled: !!clipboardXml,
                    callback: () => {
                        const pasteWs = lastWorkspace || getMainWs();
                        pasteBlocks(pasteWs, lastMouseWsPos ? lastMouseWsPos.x : undefined, lastMouseWsPos ? lastMouseWsPos.y : undefined);
                    }
                });

                options.length = 0;
                for (const o of newOptions) options.push(o);
            } catch (err) { /* 任何错误不影响原生菜单 */ }
            return origShow.call(this, e, options, rtl);
        };

        const onKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !e.shiftKey && !e.altKey) {
                const ws = getMainWs();
                const selected = ws && ws.getSelected && ws.getSelected();
                if (selected && !(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable))) {
                    e.preventDefault();
                    e.stopPropagation();
                    // 交给 copyAll 计算复制根：定义块内的积木不会被连帽子一起复制
                    copyAll(selected);
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && !e.shiftKey && !e.altKey) {
                if (clipboardXml && !(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable))) {
                    e.preventDefault();
                    e.stopPropagation();
                    const ws = getMainWs();
                    if (ws) pasteBlocks(ws);
                }
            }
        };
        document.addEventListener('keydown', onKeyDown, true);

        const origMoveOffDragSurface = B.BlockSvg.prototype.moveOffDragSurface_;
        B.BlockSvg.prototype.moveOffDragSurface_ = function (newXY) {
            origMoveOffDragSurface.call(this, newXY);
            try {
                const self = this;
                requestAnimationFrame(() => {
                    try {
                        let top = self;
                        while (top.getParent && top.getParent()) top = top.getParent();
                        const rerenderWithShadows = (block) => {
                            if (!block) return;
                            if (block.svgGroup_) {
                                const root = block.getSvgRoot && block.getSvgRoot();
                                if (root) {
                                    const cur = block.getRelativeToSurfaceXY ? block.getRelativeToSurfaceXY() : {x:0,y:0};
                                    root.setAttribute('transform', 'translate(' + cur.x + ',' + cur.y + ')');
                                }
                            }
                            block.render && block.render(true);
                            if (block.inputList) {
                                for (const inp of block.inputList) {
                                    const target = inp.connection && inp.connection.targetBlock && inp.connection.targetBlock();
                                    if (target) rerenderWithShadows(target);
                                }
                            }
                            const next = block.getNextBlock && block.getNextBlock();
                            if (next) rerenderWithShadows(next);
                        };
                        rerenderWithShadows(top);
                    } catch(e) { /* silent */ }
                });
            }  catch(e) { /* silent */ }
        };

        let origCleanUp = null;
        const tryPatchCleanup = () => {
            const opts = getOpts();
            if (opts['enhanced-cleanup'] && B.WorkspaceSvg && B.WorkspaceSvg.prototype.cleanUp && !origCleanUp) {
                origCleanUp = B.WorkspaceSvg.prototype.cleanUp;
                B.WorkspaceSvg.prototype.cleanUp = function (...args) {
                    enhancedCleanUp(this);
                };
            } else if (!opts['enhanced-cleanup'] && origCleanUp) {
                B.WorkspaceSvg.prototype.cleanUp = origCleanUp;
                origCleanUp = null;
            }
        };
        tryPatchCleanup();

        let _lastOptsStr = JSON.stringify(getOpts());
        const optsPoller = setInterval(() => {
            const cur = JSON.stringify(getOpts());
            if (cur !== _lastOptsStr) {
                _lastOptsStr = cur;
                tryPatchCleanup();
            }
        }, 500);

        return () => {
            B.Gesture.prototype.handleRightClick = origHandleRightClick;
            B.ContextMenu.show = origShow;
            B.BlockSvg.prototype.moveOffDragSurface_ = origMoveOffDragSurface;
            document.removeEventListener('keydown', onKeyDown, true);
            clearInterval(optsPoller);
            if (origCleanUp) {
                B.WorkspaceSvg.prototype.cleanUp = origCleanUp;
            }
            clipboardXml = null;
            lastTarget = null; lastWorkspace = null; lastMouseWsPos = null;
        };
    }
};
