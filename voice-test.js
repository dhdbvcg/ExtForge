/**
 * 语音解码 API 端到端测试：
 *   node voice-test.js            用 voice/model/test_wavs/zh.wav 验证
 *   node voice-test.js <file.wav> 测试任意 16bit PCM WAV
 *
 * 依赖 dev server 运行于 http://127.0.0.1:8601
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const wavPath = process.argv[2] || path.join(__dirname, 'voice', 'model', 'test_wavs', 'zh.wav');

function parseWav(buf) {
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error('not a RIFF/WAVE file');
    }
    let off = 12;
    let fmt = null;
    let data = null;
    while (off + 8 <= buf.length) {
        const id = buf.toString('ascii', off, off + 4);
        const size = buf.readUInt32LE(off + 4);
        const body = buf.slice(off + 8, off + 8 + size);
        if (id === 'fmt ') {
            fmt = {
                audioFormat: body.readUInt16LE(0),
                channels: body.readUInt16LE(2),
                sampleRate: body.readUInt32LE(4),
                bitsPerSample: body.readUInt16LE(14)
            };
        } else if (id === 'data') {
            data = body;
        }
        off += 8 + size + (size % 2);
    }
    if (!fmt || !data) throw new Error('missing fmt/data chunk');
    if (fmt.audioFormat !== 1) throw new Error('only PCM supported, got format ' + fmt.audioFormat);
    if (fmt.bitsPerSample !== 16) throw new Error('only 16-bit supported');
    if (fmt.channels !== 1) throw new Error('only mono supported');
    return {sampleRate: fmt.sampleRate, pcm: data};
}

function post(pathAndQuery, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port: 8601,
            method: 'POST',
            path: pathAndQuery,
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': body.length
            },
            timeout: 300000
        }, (res) => {
            let out = '';
            res.on('data', (c) => { out += c; });
            res.on('end', () => resolve({status: res.statusCode, body: out}));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('timeout')); });
        req.write(body);
        req.end();
    });
}

(async () => {
    console.log('[1] GET /voice-api/status ...');
    const status = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:8601/voice-api/status', (res) => {
            let out = '';
            res.on('data', (c) => { out += c; });
            res.on('end', () => resolve(out));
        }).on('error', reject);
    });
    console.log('    ' + status);

    console.log('[2] GET /voice-api/warmup（加载模型，首次约 1~3s）...');
    const warm = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:8601/voice-api/warmup', (res) => {
            let out = '';
            res.on('data', (c) => { out += c; });
            res.on('end', () => resolve({code: res.statusCode, body: out}));
        }).on('error', reject);
        setTimeout(() => reject(new Error('warmup timeout 120s')), 120000);
    });
    console.log('    [' + warm.code + '] ' + warm.body);
    if (warm.code !== 200) throw new Error('warmup failed');

    console.log('[3] POST /voice-api/decode with ' + wavPath);
    const wav = parseWav(fs.readFileSync(wavPath));
    console.log(`    wav: ${wav.sampleRate}Hz, ${wav.pcm.length} bytes（${(wav.pcm.length / 2 / wav.sampleRate).toFixed(1)}s）`);
    const t0 = Date.now();
    const res = await post(`/voice-api/decode?rate=${wav.sampleRate}`, wav.pcm);
    console.log(`    [${res.status}] wall=${Date.now() - t0}ms`);
    console.log('    ' + res.body);
    if (res.status !== 200) throw new Error('decode failed');
    const data = JSON.parse(res.body);
    console.log('\n✅ 识别结果: ' + data.text);
    console.log('   服务端解码耗时: ' + data.ms + 'ms');
})().catch((e) => {
    console.error('❌ FAILED: ' + (e && e.stack || e));
    process.exit(1);
});
