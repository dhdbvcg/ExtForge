/**
 * AI 询问条（对齐 DeepSeek Harness 的 ask_user_question）
 * ====================================================
 * 需求演变：
 *   1.0  居中模态弹选择框 —— 挡住工作区，且一次只能问一个问题。
 *   2.0  改成贴在 AI「提示词输入框」上方的询问条，并且：
 *          · 支持一次询问多个问题（questions 数组，逐个作答）
 *          · 左下角显示「本次询问的问题数」
 *
 * 为什么用原生 DOM 而不是 React：
 *   AI 面板（Nova）是原版 bundle 用 ReactDOM 渲染到 .sa-nova-wm-body 里的，
 *   那棵 React 树不在 ExtensionBuilder 的控制范围内。要用 React 渲染到
 *   composer 内部，得跨 React root 做 portal，成本和风险都高。这里改成
 *   原生 DOM 节点直接插到 composer 输入区前面，随窗口一起移动，行为确定。
 *
 * 找不到 composer 时的降级：贴到视口底部中间（.is-floating），绝不退回模态。
 */

const BAR = 'ext-ai-ask-bar';

const CSS = `
.ext-ai-ask-bar {
  margin: 0 0 8px;
  padding: 10px 12px;
  border: 1px solid #d7e3f4;
  border-radius: 10px;
  background: #f6f9ff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  color: #202124;
  box-shadow: 0 1px 3px rgba(26, 115, 232, .08);
  box-sizing: border-box;
  max-height: 46vh;
  overflow: auto;
}
.ext-ai-ask-bar-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.ext-ai-ask-bar-title {
  flex: 1;
  font-weight: 600;
  font-size: 12.5px;
  color: #1a73e8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ext-ai-ask-bar-close {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: #5f6368;
  font-size: 16px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.ext-ai-ask-bar-close:hover { background: #e8eaed; }
.ext-ai-ask-bar-q {
  line-height: 1.55;
  white-space: pre-wrap;
  margin-bottom: 8px;
}
.ext-ai-ask-bar-opts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}
.ext-ai-ask-bar-opt {
  text-align: left;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid #dadce0;
  background: #fff;
  cursor: pointer;
  font: inherit;
  color: #202124;
}
.ext-ai-ask-bar-opt:hover { border-color: #a8c7fa; }
.ext-ai-ask-bar-opt.is-on {
  border: 2px solid #1a73e8;
  background: #e8f0fe;
  padding: 6px 9px;
}
.ext-ai-ask-bar-opt-label { font-weight: 600; font-size: 12.5px; }
.ext-ai-ask-bar-opt-desc { font-size: 11.5px; color: #5f6368; margin-top: 2px; }
.ext-ai-ask-bar-custom {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid #dadce0;
  border-radius: 8px;
  font: inherit;
  font-size: 12.5px;
  outline: none;
  background: #fff;
}
.ext-ai-ask-bar-custom:focus { border-color: #1a73e8; }
.ext-ai-ask-bar-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.ext-ai-ask-bar-count {
  flex: 1;
  font-size: 11.5px;
  color: #5f6368;
}
.ext-ai-ask-bar-count b { color: #1a73e8; font-weight: 600; }
.ext-ai-ask-bar-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  border: 1px solid #dadce0;
  background: #fff;
  color: #5f6368;
  flex: 0 0 auto;
}
.ext-ai-ask-bar-btn.is-primary {
  border: none;
  background: #1a73e8;
  color: #fff;
  font-weight: 600;
}
.ext-ai-ask-bar-btn:disabled { opacity: .45; cursor: not-allowed; }
/* 贴在 AI 输入框正上方（正常情况）：left / width / bottom 由 JS 量输入框实时写入 */
.ext-ai-ask-bar.is-pinned {
  position: fixed;
  margin: 0;
  z-index: 1000001;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .16), 0 2px 6px rgba(0, 0, 0, .08);
}
/* 兜底：AI 窗口没开或被最小化时，贴视口底部居中，保证用户一定能看到 */
.ext-ai-ask-bar.is-floating {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 96px;
  width: 520px;
  max-width: 92vw;
  z-index: 1000001;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .18), 0 2px 8px rgba(0, 0, 0, .08);
}
`;

function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
}

let styleInjected = false;
function ensureStyle() {
    if (styleInjected && document.getElementById('ext-ai-ask-bar-css')) return;
    const old = document.getElementById('ext-ai-ask-bar-css');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const s = document.createElement('style');
    s.id = 'ext-ai-ask-bar-css';
    s.textContent = CSS;
    document.head.appendChild(s);
    styleInjected = true;
}

/**
 * 归一化入参。既接受 [{question, options, ...}]，也接受裸字符串数组。
 * 同时兼容 DSH 的 snake_case 字段（multi_select / allow_custom）。
 */
export function normalizeAskQuestions(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const src = (item && typeof item === 'object') ? item : {question: item};
        const question = String(src.question == null ? '' : src.question).trim();
        if (!question) continue;
        const rawOptions = Array.isArray(src.options) ? src.options : [];
        const options = [];
        for (let j = 0; j < rawOptions.length; j++) {
            const o = rawOptions[j];
            if (typeof o === 'string') {
                if (o.trim()) options.push({label: o.trim(), description: ''});
                continue;
            }
            if (!o) continue;
            const label = String(o.label == null ? '' : o.label).trim();
            if (!label) continue;
            options.push({label: label, description: String(o.description == null ? '' : o.description)});
        }
        out.push({
            id: String(src.id == null ? ('q' + (i + 1)) : src.id),
            header: String(src.header == null ? '' : src.header).trim(),
            question: question,
            options: options,
            allowCustom: src.allowCustom !== false && src.allow_custom !== false,
            multiSelect: src.multiSelect === true || src.multi_select === true,
            selected: [],
            custom: '',
        });
    }
    return out;
}

/**
 * 在 Nova 窗口里找 composer 输入框本体。
 * 返回 textarea（首选）或它的输入区容器，用来把询问条「贴在它正上方」。
 * 只认可见窗口 —— 窗口被最小化时返回 null，交给调用方走底部兜底位置。
 */
function findComposerBox() {
    const all = [].slice.call(document.querySelectorAll('.sa-nova-wm-root'));
    const visible = all.filter(function (w) { return w.style.display !== 'none'; });
    for (let i = 0; i < visible.length; i++) {
        const w = visible[i];
        const ta = w.querySelector('textarea');
        if (ta && ta.getBoundingClientRect().width > 40) return ta;
        const area = w.querySelector('[class*="Composer-module_inputArea"]');
        if (area && area.getBoundingClientRect().width > 40) return area;
    }
    return null;
}

/**
 * 询问条必须压在所有浮动面板之上。
 *
 * 历史坑（用户实测「询问选择框被 AI 界面挡住了」）：这里原先在 CSS 里写死
 * z-index:1000001，而 AI 窗口 .sa-nova-wm-root 的层级由 ExtensionBuilder 的
 * React 层级系统动态分配（Z_BASE = 1000000，用户每点一次窗口就 +1）。
 * 实测：打开 AI 窗口后连点 6 次，它的 z-index 从 1000001 涨到 1000007 ——
 * 写死的 1000001 被反超，询问条整个盖在窗口下面，明明渲染出来了、
 * elementFromPoint 却取不到它，肉眼就是「被挡住 / 点不到」。
 *
 * 现在每次 place() 都实测当前最大层级再往上抬，思路同 dsw-vision-panel 的
 * computePanelZIndex，只是偏移给得更足（+100000），保证询问条显示期间用户
 * 继续点 AI 窗口也不会把它压下去。顺带覆盖 .dsw-panel 与 .rtc-panel。
 */
function topZIndex() {
    let max = 1000001;
    const sel = '.sa-nova-wm-root, .dsw-panel, .rtc-panel';
    const nodes = document.querySelectorAll(sel);
    for (let i = 0; i < nodes.length; i++) {
        const v = parseInt(getComputedStyle(nodes[i]).zIndex, 10);
        if (isFinite(v) && v > max) max = v;
    }
    return max + 100000;
}

function hasAnswer(q) {
    if ((q.custom || '').trim()) return true;
    return q.selected.length > 0;
}

function takeAnswer(q) {
    const custom = (q.custom || '').trim();
    if (q.multiSelect) {
        const arr = q.selected.slice();
        if (custom) arr.push(custom);
        return arr;
    }
    return custom || q.selected[0] || '';
}

/**
 * 展开询问条。
 * @param {Array} rawQuestions 问题数组
 * @param {{onSubmit?:Function,onCancel?:Function}} opts
 *        onSubmit(answers) —— answers = [{id, header, question, answer}]
 * @returns {{destroy:Function, el:HTMLElement}|null} null 表示没有有效问题
 */
export function openAskBar(rawQuestions, opts) {
    const options = opts || {};
    const questions = normalizeAskQuestions(rawQuestions);
    if (!questions.length) return null;
    ensureStyle();

    const bar = h('div', BAR);

    const head = h('div', BAR + '-head');
    const title = h('span', BAR + '-title');
    const closeBtn = h('button', BAR + '-close', '\u00d7');
    closeBtn.type = 'button';
    closeBtn.title = '取消本次询问';
    head.appendChild(title);
    head.appendChild(closeBtn);

    const qEl = h('div', BAR + '-q');
    const optsEl = h('div', BAR + '-opts');
    const customEl = h('input', BAR + '-custom');
    customEl.type = 'text';

    const foot = h('div', BAR + '-foot');
    const countEl = h('span', BAR + '-count');
    const prevBtn = h('button', BAR + '-btn', '上一个');
    const cancelBtn = h('button', BAR + '-btn', '取消');
    const okBtn = h('button', BAR + '-btn is-primary', '确定');
    prevBtn.type = 'button';
    cancelBtn.type = 'button';
    okBtn.type = 'button';
    foot.appendChild(countEl);
    foot.appendChild(prevBtn);
    foot.appendChild(cancelBtn);
    foot.appendChild(okBtn);

    bar.appendChild(head);
    bar.appendChild(qEl);
    bar.appendChild(optsEl);
    bar.appendChild(customEl);
    bar.appendChild(foot);

    let index = 0;
    let destroyed = false;
    const answers = [];

    function current() { return questions[index]; }

    function render() {
        const q = current();
        if (!q) return;

        title.textContent = q.header ? ('\ud83e\udd16 ' + q.header) : '\ud83e\udd16 AI 需要你确认';
        qEl.textContent = q.question;

        optsEl.innerHTML = '';
        if (q.options.length) {
            optsEl.style.display = '';
            q.options.forEach(function (o) {
                const on = q.multiSelect
                    ? q.selected.indexOf(o.label) >= 0
                    : q.selected[0] === o.label;
                const b = h('button', BAR + '-opt' + (on ? ' is-on' : ''));
                b.type = 'button';
                b.appendChild(h('div', BAR + '-opt-label', o.label));
                if (o.description) b.appendChild(h('div', BAR + '-opt-desc', o.description));
                b.addEventListener('click', function () {
                    if (q.multiSelect) {
                        const at = q.selected.indexOf(o.label);
                        if (at >= 0) q.selected.splice(at, 1); else q.selected.push(o.label);
                    } else {
                        q.selected = (q.selected[0] === o.label) ? [] : [o.label];
                    }
                    render();
                });
                optsEl.appendChild(b);
            });
        } else {
            optsEl.style.display = 'none';
        }

        customEl.style.display = q.allowCustom ? '' : 'none';
        customEl.value = q.custom;
        customEl.placeholder = q.options.length ? '或者自己输入\u2026' : '输入你的答案\u2026';

        const n = questions.length;
        if (n > 1) {
            countEl.innerHTML = '本次询问共 <b>' + n + '</b> 个问题 \u00b7 第 <b>'
                + (index + 1) + '</b> / ' + n + ' 个';
        } else {
            countEl.innerHTML = '本次询问共 <b>1</b> 个问题';
        }

        prevBtn.style.display = index > 0 ? '' : 'none';
        okBtn.textContent = (index < n - 1) ? '下一个' : '确定';
        okBtn.disabled = !hasAnswer(q);
    }

    function finish(cancelled) {
        destroy();
        if (cancelled) {
            if (options.onCancel) options.onCancel();
        } else if (options.onSubmit) {
            options.onSubmit(answers.slice());
        }
    }

    // 即时置顶保险：轮询间隔 250ms，而 AI 窗口被点时 z-index 是立刻变的。
    // 用户手已经点到询问条上时不能再等下一轮，就地抬一层。
    bar.addEventListener('mousedown', function () {
        if (!destroyed) bar.style.zIndex = String(topZIndex());
    }, true);
    bar.addEventListener('focusin', function () {
        if (!destroyed) bar.style.zIndex = String(topZIndex());
    }, true);

    customEl.addEventListener('input', function () {
        const q = current();
        if (!q) return;
        q.custom = customEl.value;
        okBtn.disabled = !hasAnswer(q);
    });
    customEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!okBtn.disabled) okBtn.click();
        }
    });

    closeBtn.addEventListener('click', function () { finish(true); });
    cancelBtn.addEventListener('click', function () { finish(true); });
    prevBtn.addEventListener('click', function () {
        if (index > 0) { index -= 1; render(); }
    });
    okBtn.addEventListener('click', function () {
        const q = current();
        if (!q || !hasAnswer(q)) return;
        answers[index] = {
            id: q.id,
            header: q.header,
            question: q.question,
            answer: takeAnswer(q),
        };
        if (index < questions.length - 1) {
            index += 1;
            render();
            try { customEl.focus(); } catch (e) { /* 忽略 */ }
        } else {
            finish(false);
        }
    });

    /**
     * 贴到 AI 输入框正上方。
     *
     * 用 position:fixed + 实时测量输入框位置，而不是把节点插进 composer 的 DOM：
     *   · composer 在可滚动容器里，插进去会被 overflow 裁掉，滚动时还会跟着乱跑；
     *   · 询问条自身高度会随选项/多问题变化，fixed + bottom 让它向上生长，
     *     底边始终贴着输入框顶部，不会把输入框顶下去。
     * 找不到可见输入框（窗口没开 / 被最小化）就退回视口底部居中。
     *
     * @returns {boolean} 是否成功贴在输入框上
     */
    function place() {
        if (destroyed) return true;

        if (bar.parentElement !== document.body) document.body.appendChild(bar);

        // 每次定位都重算层级：AI 窗口可能刚被点过而置顶（250ms 轮询会跟上），
        // 也可能在询问条显示期间又被点了几次。
        bar.style.zIndex = String(topZIndex());

        const box = findComposerBox();
        if (box) {
            const r = box.getBoundingClientRect();
            if (r.width > 40 && r.top > 0) {
                bar.classList.remove('is-floating');
                bar.classList.add('is-pinned');
                bar.style.left = Math.round(r.left) + 'px';
                bar.style.width = Math.round(r.width) + 'px';
                bar.style.bottom = Math.round(window.innerHeight - r.top + 8) + 'px';
                return true;
            }
        }

        bar.classList.remove('is-pinned');
        bar.classList.add('is-floating');
        bar.style.left = '';
        bar.style.width = '';
        bar.style.bottom = '';
        return false;
    }

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        clearInterval(iv);
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
        if (bar.parentElement) bar.parentElement.removeChild(bar);
    }

    render();
    place();
    // 轮询而非一次性：AI 窗口可能晚于 askUser 打开、被关掉重开，用户还会拖动 /
    // 缩放窗口。250ms 一次 getBoundingClientRect 足够跟上拖动，开销可忽略。
    const iv = setInterval(function () {
        if (destroyed) { clearInterval(iv); return; }
        place();
    }, 250);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);

    return {destroy: destroy, el: bar};
}
