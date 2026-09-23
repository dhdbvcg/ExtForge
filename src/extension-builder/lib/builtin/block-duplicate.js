// 快速复制积木 (block-duplicate)
// 按住 Alt/⌥ 拖动积木直接复制一份（无需右键）。按住 Ctrl/⌘ 拖动只复制选中的单个积木（cherry pick）。
// 安装方式见仓库 README：github:dhdbvcg/scratch-ext-addons 或导入本文件。
export default {
    id: 'block-duplicate',
    name: '快速复制积木',
    description: '按住 Alt/⌥ 拖动积木直接复制一份（无需右键）。按住 Ctrl/⌘ 拖动只复制选中的单个积木（cherry pick）。扩展拼装积木时非常好用。',
    category: '编辑器',
    setup: async (ctx) => {
        const B = ctx.Blockly;
        if (!B || !B.Gesture) return () => {};
        let ctrlOrMeta = false;
        let alt = false;
        const onMouseDown = (e) => {
            ctrlOrMeta = e.ctrlKey || e.metaKey;
            alt = e.altKey;
        };
        document.addEventListener('mousedown', onMouseDown, {capture: true});

        const origStart = B.Gesture.prototype.startDraggingBlock_;
        B.Gesture.prototype.startDraggingBlock_ = function (...args) {
            const block = this.targetBlock_;
            const isFakeEvent = !(this.mostRecentEvent_ instanceof MouseEvent);
            const isProtectedBlock = !block || block.type === 'block_define' ||
                block.type === 'procedures_definition';
            const isDuplicating = alt && !isFakeEvent && !this.flyout_ &&
                !this.shouldDuplicateOnDrag_ && !isProtectedBlock;
            const isCherry = ctrlOrMeta && block && !block.isShadow && !block.isShadow() && !isProtectedBlock;
            if (isDuplicating || isCherry) {
                if (!B.Events.getGroup()) B.Events.setGroup(true);
            }
            if (isDuplicating) {
                try {
                    this.startWorkspace_.setResizesEnabled(false);
                    B.Events.disable();
                    let newBlock = null;
                    try {
                        const xmlBlock = B.Xml.blockToDom(block);
                        newBlock = B.Xml.domToBlock(xmlBlock, this.startWorkspace_);
                        if (B.scratchBlocksUtils && B.scratchBlocksUtils.changeObscuredShadowIds) {
                            B.scratchBlocksUtils.changeObscuredShadowIds(newBlock);
                        }
                        const xy = block.getRelativeToSurfaceXY();
                        newBlock.moveBy(xy.x, xy.y);
                    } catch (e) { /* 复制失败不影响拖动 */ }
                    if (newBlock) {
                        B.Events.enable();
                        B.Events.setGroup(true);
                    }
                } catch (e) { /* silent */ }
            }
            return origStart.call(this, ...args);
        };
        return () => {
            B.Gesture.prototype.startDraggingBlock_ = origStart;
            document.removeEventListener('mousedown', onMouseDown, {capture: true});
        };
    }
};
