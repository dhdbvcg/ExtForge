/**
 * SenseVoiceSmall 本地解码模块（Node 侧，供 webpack-dev-server 的 /voice-api 路由调用）
 *
 * 依赖：voice-runtime/package（sherpa-onnx npm 包，Node WASM 构建）
 * 模型：voice/model/{model.int8.onnx, tokens.txt}
 *
 * 用法：
 *   const {decodeFloat32, getStatus} = require('./voice-decode');
 *   const result = await decodeFloat32(float32Samples, 16000);
 *   // => {text, lang, emotion, event, timestamps, tokens, ...}
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MODEL_DIR = path.join(ROOT, 'voice', 'model');
const MODEL_FILE = path.join(MODEL_DIR, 'model.int8.onnx');
const TOKENS_FILE = path.join(MODEL_DIR, 'tokens.txt');
const SHERPA_PKG = path.join(ROOT, 'voice-runtime', 'package');

let recognizer = null;
let initPromise = null;
let initError = null;

function modelFilesExist() {
    try {
        return fs.existsSync(MODEL_FILE) && fs.existsSync(TOKENS_FILE) &&
            fs.statSync(MODEL_FILE).size > 200 * 1024 * 1024;
    } catch (e) {
        return false;
    }
}

function runtimeExists() {
    try {
        return fs.existsSync(path.join(SHERPA_PKG, 'index.js')) &&
            fs.existsSync(path.join(SHERPA_PKG, 'sherpa-onnx-wasm-nodejs.wasm'));
    } catch (e) {
        return false;
    }
}

function getStatus() {
    return {
        runtime: runtimeExists(),
        model: modelFilesExist(),
        ready: recognizer !== null,
        initializing: initPromise !== null,
        error: initError ? String(initError.message || initError) : null
    };
}

function ensureRecognizer() {
    if (recognizer) return Promise.resolve(recognizer);
    if (initPromise) return initPromise;
    initError = null;
    initPromise = (async () => {
        if (!runtimeExists()) throw new Error('sherpa-onnx 运行时缺失（voice-runtime/package）');
        if (!modelFilesExist()) throw new Error('SenseVoice 模型缺失或不完整（voice/model）');
        const sherpa = require(SHERPA_PKG);
        recognizer = sherpa.createOfflineRecognizer({
            featConfig: {
                sampleRate: 16000,
                featureDim: 80
            },
            modelConfig: {
                tokens: TOKENS_FILE,
                numThreads: 4,
                provider: 'cpu',
                debug: 0,
                senseVoice: {
                    model: MODEL_FILE,
                    language: 'auto',
                    useInverseTextNormalization: 1 // 开启 ITN：数字归一化 + 标点
                }
            },
            decodingMethod: 'greedy_search'
        });
        return recognizer;
    })();
    initPromise.catch((e) => {
        initError = e;
        initPromise = null;
    });
    return initPromise;
}

/**
 * 解码 Float32 采样（范围 [-1,1]）
 * @param {Float32Array} samples
 * @param {number} sampleRate 一般 16000
 * @returns {Promise<{text:string, lang?:string, emotion?:string, event?:string, tokens?:string[], timestamps?:number[]}>}
 */
async function decodeFloat32(samples, sampleRate = 16000) {
    const rec = await ensureRecognizer();
    const stream = rec.createStream();
    try {
        stream.acceptWaveform(sampleRate, samples);
        rec.decode(stream);
        const result = rec.getResult(stream);
        return result;
    } finally {
        try {
            stream.free();
        } catch (e) { /* noop */ }
    }
}

/**
 * 解码 Int16 PCM 字节缓冲（浏览器上传的录音）
 * @param {Buffer} buf  little-endian Int16
 * @param {number} sampleRate
 */
async function decodeInt16Buffer(buf, sampleRate = 16000) {
    const n = Math.floor(buf.length / 2);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        samples[i] = buf.readInt16LE(i * 2) / 32768;
    }
    return decodeFloat32(samples, sampleRate);
}

module.exports = {
    decodeFloat32,
    decodeInt16Buffer,
    getStatus,
    ensureRecognizer
};
