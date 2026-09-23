// 数字框 ↑↓ 微调 (editor-number-arrow-keys)
// 聚焦数字输入框时，按 ↑/↓ 键可以快速增减数值，Shift 一次 ±10，替代手动输入。
export default {
    id: 'editor-number-arrow-keys',
    name: '数字框 ↑↓ 微调',
    description: '聚焦数字输入框时，按 ↑/↓ 键可以快速增减数值，Shift 一次 ±10，替代手动输入。',
    category: '编辑器',
    setup: async (ctx) => {
        const B = ctx.Blockly;
        if (!B) return () => {};
        const handler = (e) => {
            const target = e.target;
            if (!target || target.tagName !== 'INPUT') return;
            const isNum = /^\d*\.?\d*$/.test(target.value || '');
            if (!isNum) return;
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            e.stopPropagation();
            let v = parseFloat(target.value || '0');
            const step = e.shiftKey ? 10 : 1;
            v = e.key === 'ArrowUp' ? v + step : v - step;
            target.value = String(Math.round(v * 1000) / 1000);
            target.dispatchEvent(new Event('input', {bubbles: true}));
            const field = target._blocklyField;
            if (  field && field.setValue) field.setValue(target.value);
        };
        document.addEventListener('keydown', handler, true);
        return () => { document.removeEventListener('keydown', handler, true); };
    }
};
