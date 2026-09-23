// 方形数字输入框 (editor-square-inputs)
// 数字/文本输入框从圆形变为方形，视觉上更清晰地区分输入区域。
export default {
    id: 'editor-square-inputs',
    name: '方形数字输入框',
    description: '数字/文本输入框从圆形变为方形，视觉上更清晰地区分输入区域。',
    category: '视觉',
    setup: async (ctx) => {
        const B = ctx.Blockly;
        if (!B || !B.BlockSvg) return () => {};
        const origJsonInit = B.BlockSvg.prototype.jsonInit;
        B.BlockSvg.prototype.jsonInit = function (json) {
            const shapeOverride = {
                math_number: 'NUMBER', math_integer: 'NUMBER', math_whole_number: 'NUMBER',
                math_positive_number: 'NUMBER', math_angle: 'NUMBER', note: 'NUMBER',
                text: 'TEXT', argument_editor_string_number: 'TEXT', colour_picker: 'COLOUR'
            };
            if (shapeOverride[this.type] && !this.isShadow()) {
                const shape = B.OUTPUT_SHAPE_SQUARE || B.INPUT_SHAPE_SQUARE;
                if (shape && B.shapesForArgument) {
                    try {
                        const newJson = {...json};
                        if (B.INPUT_SHAPE_SQUARE) {
                            newJson.outputShape = B.OUTPUT_SHAPE_SQUARE;
                        }
                        return origJsonInit.call(this, newJson);
                    } catch (e) { /* 降级 */ }
                }
            }
            return origJsonInit.call(this, json);
        };
        return () => { B.BlockSvg.prototype.jsonInit = origJsonInit; };
    },
    css: `
.blocklyDraggable .blocklyEditableText, .blocklyDraggable .blocklyHtmlInput {
    border-radius: 4px;
}
`
};
