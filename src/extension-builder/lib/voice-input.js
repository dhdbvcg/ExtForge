/**
 * AI 面板语音输入 — SenseVoiceSmall 本地识别
 *
 * 架构（对齐 DeepSeek Harness 语音输入插件思路，改为纯本地 Web 方案）：
 *  - 录音：AudioContext(sampleRate=16000) + ScriptProcessor → Int16 PCM。
 *  - 解码：POST /voice-api/decode → webpack-dev-server 内置的 Node 解码 API
 *    （voice-decode.js + sherpa-onnx WASM + voice/model 的 SenseVoice int8 模型）。
 *    同源免 CORS；模型只在 Node 进程加载一次；音频与转写不出本机。
 *  - 结果追加写入 AI 面板输入框（不替换已有内容），Esc 取消录音。
 */

import micIconUrl from '../assets/mic-icon.png';         // 黑色 128px（亮色模式）
import micIconDarkUrl from '../assets/mic-icon-dark.png'; // 原版 64px（暗色模式）

const API_BASE = '/voice-api';

let recording = null; // { stop(), cancel() }

// ─── 状态 / 解码 ───

const checkVoiceReady = async () => {
    try {
        const r = await fetch(`${API_BASE}/status`);
        if (!r.ok) throw new Error('status HTTP ' + r.status);
        return await r.json();
    } catch (e) {
        return {runtime: false, model: false, ready: false, error: String(e.message || e)};
    }
};

/** 预热：加载 228MB 模型（约 1~3s），后续解码毫秒级 */
const warmup = async () => {
    const r = await fetch(`${API_BASE}/warmup`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('warmup HTTP ' + r.status));
    return data;
};

/** Int16Array → 服务端解码 → {text, lang, ...} */
const voiceDecode = async (pcm, sampleRate = 16000) => {
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    const r = await fetch(`${API_BASE}/decode?rate=${sampleRate}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/octet-stream'},
        body: bytes
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || ('decode HTTP ' + r.status));
    return data;
};

// ─── 录音 ───

const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {echoCancellation: true, noiseSuppression: true, sampleRate: 16000}
    });
    const ctx = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 16000});
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    let sampleCount = 0;
    processor.onaudioprocess = (e) => {
        const f32 = e.inputBuffer.getChannelData(0);
        const i16 = new Int16Array(f32.length);
        for (let i = 0; i < f32.length; i++) {
            const s = Math.max(-1, Math.min(1, f32[i]));
            i16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        chunks.push(i16);
        sampleCount += i16.length;
    };
    source.connect(processor);
    processor.connect(ctx.destination); // ScriptProcessor 需要连到 destination 才会跑

    return {
        sampleCount: () => sampleCount,
        stop() {
            try {
                source.disconnect();
                processor.disconnect();
            } catch (e) { /* noop */ }
            stream.getTracks().forEach(t => t.stop());
            ctx.close().catch(() => {});
            const merged = new Int16Array(sampleCount);
            let off = 0;
            chunks.forEach(c => { merged.set(c, off); off += c.length; });
            return merged;
        },
        cancel() {
            try {
                source.disconnect();
                processor.disconnect();
            } catch (e) { /* noop */ }
            stream.getTracks().forEach(t => t.stop());
            ctx.close().catch(() => {});
        }
    };
};

// ─── AI 面板输入框写入 ───

const findComposer = () => {
    const win = document.querySelector('.sa-nova-wm-root');
    if (!win) return null;
    // 输入框：textarea（Enter 发送，Shift+Enter 换行）
    return win.querySelector('textarea') ||
        win.querySelector('input[type="text"]') ||
        null;
};

const insertText = (el, text) => {
    if (!el || !text) return;
    const isTextarea = el.tagName === 'TEXTAREA';
    const proto = isTextarea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    const sep = el.value && !/\s$/.test(el.value) &&
        /^[\u4e00-\u9fa5]/.test(text) ? ' ' : '';
    setter.call(el, el.value + sep + text);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.focus();
};

// ─── 按钮 UI ───

const BTN_ID = 'ext-voice-input-btn';

const style = () => {
    if (document.getElementById('ext-voice-style')) return;
    const s = document.createElement('style');
    s.id = 'ext-voice-style';
    s.textContent = `
        #${BTN_ID} {
            display: inline-flex; align-items: center; justify-content: center;
            width: 34px; height: 34px; border-radius: 50%;
            border: 1px solid #dadce0; background: #fff; cursor: pointer;
            font-size: 16px; line-height: 1; padding: 0; margin-right: 6px;
            transition: background .15s, border-color .15s; flex-shrink: 0;
        }
        #${BTN_ID}:hover { background: #f1f3f4; border-color: #bdc1c6; }
        #${BTN_ID} .voice-icon { width: 18px; height: 18px; display: block; }
        #${BTN_ID} .voice-icon-dark { display: none; }
        #${BTN_ID} .voice-state { display: none; font-size: 15px; line-height: 1; }
        /* 暗色模式：切换到原版（浅色）图标 */
        @media (prefers-color-scheme: dark) {
            #${BTN_ID} .voice-icon-light { display: none; }
            #${BTN_ID} .voice-icon-dark { display: block; }
        }
        html[data-theme='dark'] #${BTN_ID} .voice-icon-light { display: none; }
        html[data-theme='dark'] #${BTN_ID} .voice-icon-dark { display: block; }
        #${BTN_ID}.recording .voice-icon,
        #${BTN_ID}.busy .voice-icon { display: none; }
        #${BTN_ID}.recording .voice-state,
        #${BTN_ID}.busy .voice-state { display: inline; }
        #${BTN_ID}.recording {
            background: #fce8e6; border-color: #ea4335; color: #d93025;
            animation: ext-voice-pulse 1.2s ease-in-out infinite;
        }
        #${BTN_ID}.busy { background: #e8f0fe; border-color: #1a73e8; color: #1a77f0; cursor: wait; }
        @keyframes ext-voice-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(234,67,53,.45); }
            50% { box-shadow: 0 0 0 7px rgba(234,67,53,0); }
        }
        #${BTN_ID} .voice-tip {
            position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
            background: #333; color: #fff; padding: 5px 10px; border-radius: 6px;
            font-size: 12px; white-space: nowrap; pointer-events: none; opacity: 0;
            transition: opacity .15s; z-index: 10;
        }
        #${BTN_ID}.tip-show .voice-tip { opacity: 1; }
    `;
    document.head.appendChild(s);
};

const showTip = (btn, msg, ms = 2600) => {
    let tip = btn.querySelector('.voice-tip');
    if (!tip) {
        tip = document.createElement('span');
        tip.className = 'voice-tip';
        btn.appendChild(tip);
    }
    tip.textContent = msg;
    btn.classList.add('tip-show');
    clearTimeout(btn._tipTimer);
    btn._tipTimer = setTimeout(() => btn.classList.remove('tip-show'), ms);
};

/** 更新按钮状态文字（⏳/⏹ 等，图标由 CSS 按状态自动切换） */
const setStateText = (btn, text) => {
    const s = btn.querySelector('.voice-state');
    if (s) s.textContent = text;
};

// ─── 主流程 ───

const onClick = async (btn) => {
    const composer = findComposer();
    if (!composer) {
        showTip(btn, '未找到 AI 输入框，请先打开 AI 面板');
        return;
    }

    // 1) 停止录音 → 识别
    if (recording) {
        const rec = recording;
        recording = null;
        btn.classList.remove('recording');
        btn.classList.add('busy');
        setStateText(btn, '⏳');
        showTip(btn, '识别中…', 60000);
        try {
            const pcm = rec.stop();
            if (pcm.length < 16000) { // 不足 0.5s
                showTip(btn, '录音太短，请重试');
            } else {
                const data = await voiceDecode(pcm);
                const clean = (data.text || '').replace(/<\|[^|]*\|>/g, '').trim();
                if (clean) {
                    insertText(composer, clean);
                    showTip(btn, `✓ ${clean.slice(0, 40)}（${data.ms || '?'}ms）`);
                } else {
                    showTip(btn, '未识别到内容');
                }
            }
        } catch (err) {
            showTip(btn, '识别失败: ' + err.message, 4000);
        } finally {
            btn.classList.remove('busy');
        }
        return;
    }

    // 2) 就绪检查 + 预热模型
    btn.classList.add('busy');
    try {
        const status = await checkVoiceReady();
        if (status.error) {
            showTip(btn, '语音服务不可用: ' + status.error, 4000);
            return;
        }
        if (!status.runtime || !status.model) {
            const missing = [];
            if (!status.runtime) missing.push('sherpa-onnx 运行时');
            if (!status.model) missing.push('SenseVoice 模型');
            showTip(btn, '缺少: ' + missing.join('、'), 5000);
            return;
        }
        if (!status.ready) {
            showTip(btn, '正在加载语音模型（首次约 2s）…', 30000);
            await warmup();
        }
    } catch (err) {
        showTip(btn, '初始化失败: ' + err.message, 4000);
        return;
    } finally {
        btn.classList.remove('busy');
    }

    // 3) 开始录音（getUserMedia 必须由用户点击触发）
    try {
        recording = await startRecording();
        btn.classList.add('recording');
        setStateText(btn, '⏹');
        showTip(btn, '录音中，点击结束 · Esc 取消');
    } catch (err) {
        const name = err && err.name;
        showTip(btn,
            name === 'NotAllowedError' ? '麦克风权限被拒绝' :
            name === 'NotFoundError' ? '未找到麦克风设备' :
            '无法录音: ' + err.message, 4000);
    }
};

const onKey = (e) => {
    if (e.key === 'Escape' && recording) {
        recording.cancel();
        recording = null;
        const btn = document.getElementById(BTN_ID);
        if (btn) {
            btn.classList.remove('recording');
            showTip(btn, '已取消录音');
        }
    }
};

/**
 * 向 AI 面板输入区注入麦克风按钮。
 * AI 面板由 bilup-nova 纯 JS 渲染，随时可能出现 → 用 MutationObserver 持续监听。
 */
export const installVoiceInput = () => {
    style();
    document.addEventListener('keydown', onKey);

    const tryInject = () => {
        if (document.getElementById(BTN_ID)) return true;
        const composer = findComposer();
        if (!composer) return false;
        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.type = 'button';
        btn.title = '语音输入（SenseVoice 本地识别）';
        const iconLight = document.createElement('img');
        iconLight.className = 'voice-icon voice-icon-light';
        iconLight.src = micIconUrl;
        iconLight.alt = '🎤';
        const iconDark = document.createElement('img');
        iconDark.className = 'voice-icon voice-icon-dark';
        iconDark.src = micIconDarkUrl;
        iconDark.alt = '🎤';
        const state = document.createElement('span');
        state.className = 'voice-state';
        btn.appendChild(iconLight);
        btn.appendChild(iconDark);
        btn.appendChild(state);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick(btn);
        });
        // 插到输入框前（composer 的父容器内）
        const host = composer.parentElement;
        host.insertBefore(btn, composer);
        return true;
    };

    if (tryInject()) return;
    const observer = new MutationObserver(() => {
        if (tryInject()) observer.disconnect();
    });
    observer.observe(document.body, {childList: true, subtree: true});
    // 面板可能被关闭重开 → 长期保留一个慢轮询兜底
    const timer = setInterval(() => {
        if (tryInject()) {
            // 注入过一次也保持低频检查（面板可能重渲染丢失按钮）
        }
    }, 3000);
    // 不 clearInterval：页面生命周期内持续守护
    void timer;
};

export default installVoiceInput;
