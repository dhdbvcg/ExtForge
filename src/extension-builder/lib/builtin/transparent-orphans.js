// 孤立积木半透明 (transparent-orphans)
// 顶部不是帽子积木的孤立积木（没有以帽子启动的脚本）变淡显示，帮助快速发现未接线的积木；
// 帽子积木本身保持清晰。
export default {
    id: 'transparent-orphans',
    name: '孤立积木半透明',
    description: '顶部不是帽子积木的孤立积木（没有以帽子启动的脚本）变淡显示，帮助快速发现未接线的积木；帽子积木本身保持清晰。',
    category: '视觉',
    setup: async (ctx) => {
        const { Blockly } = ctx;
        if (!Blockly || !Blockly.BlockSvg) return () => {};

        const CLASS = 'sa-orphan-hat';
        const isHat = (block) =>
            !!(block && !block.previousConnection && !block.outputConnection);

        const collectChain = (block) => {
            const out = [];
            const stack = [block];
            const seen = new Set();
            while (stack.length) {
                const b = stack.pop();
                if (!b || seen.has(b.id)) continue;
                seen.add(b.id);
                out.push(b);
                const next = b.getNextBlock && b.getNextBlock();
                if (next) stack.push(next);
                if (b.inputList) {
                    for (const input of b.inputList) {
                        const target = input.connection &&
                            input.connection.targetBlock &&
                            input.connection.targetBlock();
                        if (target) stack.push(target);
                    }
                }
            }
            return out;
        };

        const tagChain = (topBlock) => {
            if (!topBlock) return;
            const keep = isHat(topBlock);
            for (const b of collectChain(topBlock)) {
                const svg = b.getSvgRoot && b.getSvgRoot();
                if (!svg || !svg.classList) continue;
                if (keep) svg.classList.add(CLASS);
                else svg.classList.remove(CLASS);
            }
        };

        const tagWorkspace = (ws) => {
            if (!ws || ws.isFlyout) return;
            let tops;
            try { tops = ws.getTopBlocks(false); } catch (e) { return; }
            for (const block of tops) tagChain(block);
        };

        const origRender = Blockly.BlockSvg.prototype.render;
        Blockly.BlockSvg.prototype.render = function (optBubble) {
            const result = origRender.call(this, optBubble);
            if (!this.isInFlyout && !this.getParent() &&
                this.svgGroup_ && this.svgGroup_.classList) {
                if (isHat(this)) this.svgGroup_.classList.add(CLASS);
                else this.svgGroup_.classList.remove(CLASS);
            }
            return result;
        };

        const listener = (e) => {
            let ws = null;
            if (e && e.workspaceId && Blockly.Workspace && Blockly.Workspace.getById) {
                ws = Blockly.Workspace.getById(e.workspaceId);
            }
            if (!ws) ws = ctx.getWorkspace && ctx.getWorkspace();
            if (ws) tagWorkspace(ws);
        };
        let removeListener = () => {};
        try {
            const main = ctx.getWorkspace && ctx.getWorkspace();
            if (main && typeof main.addChangeListener === 'function') {
                main.addChangeListener(listener);
                removeListener = () => { try { main.removeChangeListener(listener); } catch (e) {} };
            }
        } catch (e) { /* 变更监听是可选的，失败不影响初始打标 */ }

        const retagAll = () => {
            const tagWs = (ws) => {
                if (!ws || ws.isFlyout) return;
                try { tagWorkspace(ws); } catch (e) { /* silent */ }
            };
            const main = ctx.getWorkspace && ctx.getWorkspace();
            if (main) tagWs(main);
            try {
                const db = Blockly.Workspace && Blockly.Workspace.WorkspaceDB_;
                if (db && typeof db === 'object') {
                    for (const id in db) tagWs(db[id]);
                }
            } catch (e) { /* silent */ }
        };
        retagAll();
        setTimeout(retagAll, 0);
        setTimeout(retagAll, 500);
        setTimeout(retagAll, 1500);

        return () => {
            Blockly.BlockSvg.prototype.render = origRender;
            removeListener();
            try {
                const workspaces = [];
                const main = ctx.getWorkspace && ctx.getWorkspace();
                if (main) workspaces.push(main);
                const db = Blockly.Workspace && Blockly.Workspace.WorkspaceDB_;
                if (db && typeof db === 'object') {
                    for (const id in db) { if (db[id]) workspaces.push(db[id]); }
                }
                for (const ws of workspaces) {
                    if (!ws || ws.isFlyout) continue;
                    let tops;
                    try { tops = ws.getTopBlocks(false); } catch (e) { continue; }
                    for (const block of tops) {
                        for (const b of collectChain(block)) {
                            const svg = b.getSvgRoot && b.getSvgRoot();
                            if (svg && svg.classList) svg.classList.remove(CLASS);
                        }
                    }
                }
            } catch (e) { /* silent */ }
        };
    },
    css: `
.blocklySvg > .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable:not(.sa-orphan-hat) {
    opacity: 0.6;
    transition: opacity .2s;
}
.blocklySvg > .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable:not(.sa-orphan-hat):hover,
.blocklySvg > .blocklyWorkspace > .blocklyBlockCanvas > .blocklyDraggable:not(.sa-orphan-hat).blocklyDragging {
    opacity: 1;
}
`
};
