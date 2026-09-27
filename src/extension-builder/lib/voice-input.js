/**
 * AI 面板语音输入 — SenseVoiceSmall（双引擎）
 *
 *  - 录音：AudioContext(sampleRate=16000) + ScriptProcessor → Int16 PCM。
 *  - 解码引擎（自动选择，?voice=web 可强制浏览器路径）：
 *      api（本地开发）：POST /voice-api → webpack-dev-server 内 Node sherpa-onnx 解码；
 *      web（线上 Pages）：浏览器 WASM —— 补丁版 sherpa 运行时(voice/web/sherpa-browser.js)
 *        + FS.writeFile 灌入 3 个模型分片（Cache Storage 持久缓存）→ 同一 OfflineRecognizer 解码。
 *  - 音频与转写全程不出本机；结果追加写入 AI 输入框，Esc 取消录音。
 */

import micIconUrl from '../assets/mic-icon.png';         // 黑色 128px（亮色模式）
import micIconDarkUrl from '../assets/mic-icon-dark.png'; // 原版 64px（暗色模式）

const API_BASE = '/voice-api';

let recording = null; // { stop(), cancel() }

// ─── 双引擎 ───
// 'api'：本地 webpack-dev-server 的 /voice-api（Node 侧 sherpa-onnx 解码）
// 'web'：线上 GitHub Pages 用浏览器 WASM 解码（补丁版 sherpa 运行时 + FS 灌入分片模型）
const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const FORCE_WEB = new URLSearchParams(location.search).get('voice') === 'web';
// 本地：voice/ 由 devServer contentBase 根映射 → /web/...；线上：页面同级 voice/web/
const WEB_BASE = IS_LOCAL ? '/web/' : new URL('voice/web/', location.href).href;
let engine = null; // 'api' | 'web'（懒确定）

const webState = {factory: null, asr: null, Module: null, recognizer: null};

const MODEL_PART_COUNT = 3;
const MODEL_TOTAL_SIZE = 239233841; // p0 90,000,000 + p1 90,000,000 + p2 59,233,841
const MODEL_FS_PATH = '/model/model.int8.onnx';
const TOKENS_FS_PATH = '/model/tokens.txt';

const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('脚本加载失败: ' + src));
    document.head.appendChild(s);
});

/** 带 Cache Storage 的分片下载（GH Pages 只缓存10分钟 → 自建持久缓存，二次访问免流量） */
const fetchBytesCached = async (url, onProgress) => {
    let cache = null;
    try { cache = await caches.open('ext-voice-model-v1'); } catch (e) { /* 隐私模式等无 Cache API */ }
    if (cache) {
        const hit = await cache.match(url);
        if (hit) {
            const buf = new Uint8Array(await hit.arrayBuffer());
            onProgress && onProgress(buf.length, buf.length, true);
            return buf;
        }
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}: ${url}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        onProgress && onProgress(got, total, false);
    }
    const buf = new Uint8Array(got);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.length; }
    if (cache) {
        try { await cache.put(url, new Response(buf, {headers: {'content-type': 'application/octet-stream'}})); } catch (e) { /* 配额不足则跳过缓存 */ }
    }
    return buf;
};

/** 浏览器引擎：加载补丁版 glue + asr 包装，实例化 Module（含 FS） */
const warmupWeb = async (onTip) => {
    // asr 包装（CommonJS → 用假 module/process 求值，取 OfflineRecognizer）
    if (!webState.asr) {
        onTip && onTip('⏳ 加载识别器包装…');
        const txt = await (await fetch(WEB_BASE + 'sherpa-onnx-asr.js')).text();
        const mod = {exports: {}};
        const proc = {versions: {node: 'browser-shim'}};
        const fn = new Function('module', 'process', txt + '\n;return module.exports;');
        webState.asr = fn(mod, proc);
        if (!webState.asr || !webState.asr.OfflineRecognizer) throw new Error('识别器包装解析失败');
    }
    // glue（MODULARIZE 工厂）——先挂全局 module/exports 桥，脚本尾部会写入 module.exports
    if (!webState.factory) {
        onTip && onTip('⏳ 加载 WASM 运行时…');
        if (!window.module || typeof window.module.exports !== 'object') window.module = {exports: {}};
        window.exports = window.module.exports;
        await loadScript(WEB_BASE + 'sherpa-browser.js');
        const factory = window.module.exports;
        if (typeof factory !== 'function') throw new Error('运行时工厂导出异常: ' + typeof factory);
        webState.factory = factory;
    }
    if (!webState.Module) {
        onTip && onTip('⏳ 下载 WASM 运行时（15MB，含缓存）…', 600000);
        // 浏览器禁止同步 XHR 取 wasm → 按官方提示手动预载为 wasmBinary
        const wasmBytes = await fetchBytesCached(WEB_BASE + 'sherpa-onnx-wasm-nodejs.wasm', (got, total, cached) => {
            const pct = total ? (got * 100 / total).toFixed(0) : '?';
            onTip && onTip(`⏳ WASM 运行时 ${pct}%（${(got / 1048576).toFixed(0)}/15MB）${cached ? ' [缓存]' : ''}`, 600000);
        });
        onTip && onTip('⏳ 编译 WASM（异步，绕过 Chrome 主线程 8MB 限制）…', 300000);
        // Chrome 禁止主线程同步编译/实例化 >8MB wasm → 提前异步 compile；
        // 钩子里异步 instantiate，sherpa-browser.js 已补丁为 await createWasm 后再 run()。
        const wasmModule = await WebAssembly.compile(wasmBytes.buffer);
        onTip && onTip('⏳ 初始化 WASM（512MB 内存）…', 300000);
        let M = await webState.factory({
            wasmBinary: wasmBytes.buffer,
            locateFile: (p) => WEB_BASE + p,
            instantiateWasm: (imports, successCallback) => {
                WebAssembly.instantiate(wasmModule, imports).then((inst) => {
                    successCallback(inst, wasmModule);
                }).catch((err) => {
                    console.error('[voice] WASM 实例化失败', err);
                    // 用抛错代理让初始化链以真实错误 reject
                    successCallback({exports: new Proxy({}, {get: () => { throw err; }})}, wasmModule);
                });
            }
        });
        if (M && typeof M.then === 'function') M = await M;
        if (!M || !M.FS) throw new Error('运行时初始化失败（缺少 FS 导出）');
        webState.Module = M;
    }
    // 灌入分片模型（首次下载 239MB，之后走 Cache Storage）
    if (!webState.recognizer) {
        const FS = webState.Module.FS;
        onTip && onTip('⏳ 下载模型分片（首次 239MB，之后本地缓存）…');
        try { FS.mkdir('/model'); } catch (e) { /* 已存在 */ }
        const stream = FS.open(MODEL_FS_PATH, 577); // O_WRONLY|O_CREAT|O_TRUNC
        let written = 0;
        for (let i = 0; i < MODEL_PART_COUNT; i++) {
            const bytes = await fetchBytesCached(WEB_BASE + 'model/model.int8.onnx.p' + i, (got, total, cached) => {
                const all = written + got;
                const pct = MODEL_TOTAL_SIZE ? (all * 100 / MODEL_TOTAL_SIZE).toFixed(1) : '?';
                onTip && onTip(`⏳ 下载模型 ${pct}%（${(all / 1048576).toFixed(0)}MB / 239MB）${cached ? ' [缓存]' : ''}`, 600000);
            });
            FS.write(stream, bytes, 0, bytes.length, written);
            written += bytes.length;
        }
        FS.close(stream);
        if (written !== MODEL_TOTAL_SIZE) {
            throw new Error(`模型分片不完整: ${written}/${MODEL_TOTAL_SIZE}`);
        }
        const tokensTxt = await (await fetch(WEB_BASE + 'model/tokens.txt')).text();
        FS.writeFile(TOKENS_FS_PATH, tokensTxt);
        onTip && onTip('⏳ 初始化 SenseVoice 识别器…', 300000);
        webState.recognizer = new webState.asr.OfflineRecognizer({
            featConfig: {sampleRate: 16000, featureDim: 80},
            modelConfig: {
                tokens: TOKENS_FS_PATH,
                numThreads: 1,
                provider: 'cpu',
                senseVoice: {model: MODEL_FS_PATH, language: 'auto', useInverseTextNormalization: 1}
            },
            decodingMethod: 'greedy_search'
        }, webState.Module);
    }
    return webState;
};

/** 浏览器引擎解码：Int16 PCM → Float32 → SenseVoice offline */
const voiceDecodeWeb = async (pcm, sampleRate = 16000) => {
    const {recognizer} = await warmupWeb();
    const n = pcm.length;
    const f32 = new Float32Array(n);
    for (let i = 0; i < n; i++) f32[i] = pcm[i] / 32768;
    const t0 = performance.now();
    const stream = recognizer.createStream();
    stream.acceptWaveform(sampleRate, f32);
    recognizer.decode(stream);
    const result = recognizer.getResult(stream);
    try { stream.free(); } catch (e) { /* noop */ }
    return {...result, ms: Math.round(performance.now() - t0)};
};

// ─── 状态 / 解码（api 引擎，本地开发） ───

const checkVoiceReady = async () => {
    if (!FORCE_WEB && engine !== 'web') {
        try {
            const r = await fetch(`${API_BASE}/status`);
            if (r.ok) {
                const s = await r.json();
                if (s.runtime && s.model) {
                    engine = 'api';
                    return {...s, engine: 'api'};
                }
            }
        } catch (e) { /* 无本地 API → 尝试浏览器引擎 */ }
    }
    // 浏览器引擎就绪检查（HEAD 关键资源）
    const urls = ['sherpa-browser.js', 'sherpa-onnx-wasm-nodejs.wasm', 'sherpa-onnx-asr.js', 'model/tokens.txt', 'model/model.int8.onnx.p0'];
    const missing = [];
    for (const u of urls) {
        try {
            const r = await fetch(WEB_BASE + u, {method: 'HEAD'});
            if (!r.ok) missing.push(u);
        } catch (e) { missing.push(u); }
    }
    if (missing.length) {
        return {runtime: false, model: false, ready: false, engine: 'web', error: '浏览器引擎资源缺失: ' + missing.join(', ')};
    }
    engine = 'web';
    return {runtime: true, model: true, ready: !!webState.recognizer, engine: 'web'};
};

/** 预热：api=加载 228MB 模型（1~3s）；web=运行时+分片模型+识别器 */
const warmup = async (onTip) => {
    if (engine === 'web') return warmupWeb(onTip);
    const r = await fetch(`${API_BASE}/warmup`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('warmup HTTP ' + r.status));
    return data;
};

/** Int16Array → 解码（按引擎分流） → {text, lang, ...} */
const voiceDecode = async (pcm, sampleRate = 16000) => {
    if (engine === 'web') return voiceDecodeWeb(pcm, sampleRate);
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

// 供 DevTools 调试/自动化测试
window.__voiceWeb = {webState, warmupWeb, voiceDecodeWeb, WEB_BASE, get engine() { return engine; }};

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
        showTip(btn, engine === 'web' ? '浏览器识别中…（主线程，大模型约数秒）' : '识别中…', 600000);
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
            showTip(btn, '语音引擎不可用: ' + status.error, 5000);
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
            if (engine === 'web') {
                // 浏览器引擎：首次需下载 15MB 运行时 + 239MB 模型分片（带进度）
                await warmupWeb((msg) => showTip(btn, msg, 600000));
            } else {
                showTip(btn, '正在加载语音模型（首次约 2s）…', 30000);
                await warmup();
            }
        }
    } catch (err) {
        showTip(btn, '初始化失败: ' + err.message, 5000);
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
