// 斑马条纹积木 (zebra-striping)
// 嵌套的相同颜色积木（如「重复」里的「重复」）交替明暗显示，方便看清嵌套层级。
export default {
    id: 'zebra-striping',
    name: '斑马条纹积木',
    description: '嵌套的相同颜色积木（如 重复 里的 重复）交替明暗显示，方便看清嵌套层级。',
    category: '视觉',
    setup: async (ctx) => {
        const B = ctx.Blockly;
        if (!B || !B.BlockSvg) return () => {};
        const origRender = B.BlockSvg.prototype.render;
        B.BlockSvg.prototype.render = function (optBubble) {
            if (!this.isInFlyout && !this.isShadow() && !this.getParent()) {
                const stripeState = new Map();
                for (const block of this.getDescendants()) {
                    const parent = block.getSurroundParent();
                    let striped = false;
                    if (parent) {
                        if (block.isShadow()) striped = !!stripeState.get(parent);
                        else if (parent.getColour() === block.getColour()) striped = !stripeState.get(parent);
                    }
                    stripeState.set(block, striped);
                    const els = [block.svgPath_];
                    if (block.inputList) {
                        for (const input of block.inputList) {
                            if (input.outlinePath) els.push(input.outlinePath);
                            if (input.fieldRow) {
                                for (const f of input.fieldRow) {
                                    if (f.fieldGroup_) els.push(f.fieldGroup_);
                                }
                            }
                        }
                    }
                    els.forEach(el => el && el.classList && el.classList.toggle('sa-zebra-stripe', striped));
                }
            }
            return origRender.call(this, optBubble);
        };
        return () => { B.BlockSvg.prototype.render = origRender; };
    },
    css: `
.sa-zebra-stripe { filter: brightness(0.95); }
.blocklyDraggable > .blocklyPath.sa-zebra-stripe { filter: brightness(0.95) saturate(0.9); }
`
};
