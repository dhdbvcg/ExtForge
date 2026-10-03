// local-auth-server.js - 本地开发用一体化服务器
// 功能：
//   1) /api/auth        —— 邮箱验证码（注册/登录/找回密码）
//   2) /api/inbox       —— 读取 QQ 邮箱收件箱（IMAP）
//   3) /api/send-mail   —— 自由撰写并发送邮件（SMTP）
// 验证码通过 QQ SMTP 真实发信；Turnstile 开发模式始终通过
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

// 静态文件根目录：指向 website/ 目录（本文件已移出 website，避免被 Cloudflare 部署公开）
const WEB_ROOT = process.env.WEB_ROOT || path.resolve(__dirname, '..', 'website');
const PORT = 3458;

// ============================================================
//  QQ 邮箱 SMTP / IMAP 配置（本地开发用）
//  - user：QQ 邮箱地址
//  - pass：QQ 邮箱的 SMTP/IMAP 授权码（同一个码，两处通用）
//
//  凭据一律从环境变量读，源码里不留缺省值 —— 这个文件是 git 跟踪的，
//  写死的授权码等同于公开。缺变量时直接启动失败，比「悄悄用一个错的码
//  然后发信失败」好排查。启动前先设：
//      set SMTP_USER=you@qq.com
//      set SMTP_PASS=<你的授权码>
// ============================================================
function requireEnv(name) {
    const v = process.env[name];
    if (!v) {
        console.error('缺少环境变量 ' + name + '（本地开发服务器需要 QQ 邮箱 SMTP/IMAP 凭据）');
        process.exit(1);
    }
    return v;
}

const MAIL_CONFIG = {
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: Number(process.env.SMTP_PORT || 465),
    imapHost: process.env.IMAP_HOST || 'imap.qq.com',
    imapPort: Number(process.env.IMAP_PORT || 993),
    user: requireEnv('SMTP_USER'),
    pass: requireEnv('SMTP_PASS'),
    from: process.env.SMTP_FROM || ('ExtForge <' + requireEnv('SMTP_USER') + '>')
};

// ============================================================
//  Cloudflare Mailchannels 发信配置（自定义域名 From）
//  设置环境变量 USE_MAILCHANNELS=1 启用本通道
// ============================================================
const MAILCHANNELS_FROM = process.env.MAILCHANNELS_FROM || 'noreply@scratchextensioneditor.cc.cd';
const USE_MAILCHANNELS = process.env.USE_MAILCHANNELS === '1';

// 内存存储（替代 Cloudflare KV）
const codeStore = new Map();
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_INTERVAL_MS = 60 * 1000;

function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function corsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, data) {
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString();
            try { resolve(raw ? JSON.parse(raw) : {}); }
            catch (e) { resolve({}); }
        });
    });
}

// ============================================================
//  通用 SMTP 发送（隐式 TLS，端口 465）
// ============================================================
function smtpSend(to, subject, text, fromAddr) {
    return new Promise((resolve, reject) => {
        // QQ SMTP 强制 From=认证账号，否则 550
        // fromAddr 存在时：From 保持 QQ 账号，但 Reply-To/Sender 指向站内账号
        const actualFrom = MAIL_CONFIG.from;  // 始终用 QQ 认证账号
        const envelopeFrom = MAIL_CONFIG.user;
        const dateStr = new Date().toUTCString();
        const extraHeaders = fromAddr
            ? 'Reply-To: ' + fromAddr + '\r\n' +
              'Sender: ' + fromAddr + '\r\n'
            : '';
        const message =
            'From: ' + actualFrom + '\r\n' +
            'To: ' + to + '\r\n' +
            extraHeaders +
            'Subject: =?UTF-8?B?' + Buffer.from(subject).toString('base64') + '?=\r\n' +
            'Date: ' + dateStr + '\r\n' +
            'MIME-Version: 1.0\r\n' +
            'Content-Type: text/plain; charset=UTF-8\r\n' +
            'Content-Transfer-Encoding: base64\r\n' +
            '\r\n' +
            Buffer.from(text).toString('base64') + '\r\n';

        let buffer = '';
        let phase = 'greet';
        let userSent = false;
        let passSent = false;
        let settled = false;

        const finish = (err, val) => {
            if (settled) return;
            settled = true;
            if (err) reject(err); else resolve(val);
            try { socket.end(); } catch (e) {}
        };

        const cmd = (c) => { socket.write(c + '\r\n'); };
        const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

        const onResponse = (code, text) => {
            if (code === '334') {
                if (!userSent) { userSent = true; return cmd(b64(MAIL_CONFIG.user)); }
                if (!passSent) { passSent = true; return cmd(b64(MAIL_CONFIG.pass)); }
                return;
            }
            if (code === '220' && phase === 'greet') {
                phase = 'ehlo';
                return cmd('EHLO localhost');
            }
            if (code === '235') {
                phase = 'mailfrom';
                return cmd('MAIL FROM:<' + envelopeFrom + '>');
            }
            if (code === '250') {
                if (phase === 'ehlo') { phase = 'auth'; return cmd('AUTH LOGIN'); }
                if (phase === 'mailfrom') { phase = 'rcpt'; return cmd('RCPT TO:<' + to + '>'); }
                if (phase === 'rcpt') { phase = 'data'; return cmd('DATA'); }
                if (phase === 'body') { phase = 'quit'; return cmd('QUIT'); }
                if (phase === 'quit') { return finish(null, true); }
                return;
            }
            if (code === '354') {
                phase = 'body';
                socket.write(message, () => socket.write('.\r\n'));
                return;
            }
            if (code === '221' && phase === 'quit') { return finish(null, true); }
            finish(new Error('SMTP ' + code + ': ' + text));
        };

        const handleLine = (line) => {
            const m = line.match(/^(\d{3})([ \-])(.*)$/);
            if (!m) return;
            if (m[2] === '-') return;
            onResponse(m[1], m[3]);
        };

        let socket;
        try {
            socket = tls.connect(MAIL_CONFIG.port, MAIL_CONFIG.host, {
                rejectUnauthorized: false,
                servername: MAIL_CONFIG.host
            });
        } catch (e) {
            return finish(e);
        }
        socket.setTimeout(20000);
        socket.on('timeout', () => finish(new Error('连接超时')));
        socket.on('error', (e) => finish(new Error('连接失败: ' + e.message)));
        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            let idx;
            while ((idx = buffer.indexOf('\r\n')) !== -1) {
                const line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                handleLine(line);
            }
        });
        socket.on('close', () => { if (!settled) finish(new Error('连接意外关闭')); });
    });
}

// 验证码邮件（调用通用 smtpSend）
function sendSmtpMail(to, code) {
    const subject = 'ExtForge - 邮箱验证码';
    const text =
        '您好，\n\n' +
        '您的邮箱验证码是：' + code + '\n' +
        '该验证码 10 分钟内有效，请勿将验证码告知他人。\n\n' +
        '如果这不是您本人的操作，请忽略此邮件。';
    return smtpSend(to, subject, text);
}

// ---- Cloudflare Mailchannels 发送 ----
function sendMailchannelsMail(to, code) {
    return new Promise((resolve, reject) => {
        const subject = 'ExtForge - 邮箱验证码';
        const text =
            '您好，\n\n' +
            '您的邮箱验证码是：' + code + '\n' +
            '该验证码 10 分钟内有效，请勿将验证码告知他人。\n\n' +
            '如果这不是您本人的操作，请忽略此邮件。';
        const payload = {
            personalizations: [
                { to: [{email: to}], dkim_domain: 'scratchextensioneditor.cc.cd', dkim_selector: 'mailchannels' }
            ],
            from: {email: MAILCHANNELS_FROM, name: 'ExtForge'},
            subject: subject,
            content: [{type: 'text/plain', value: text}]
        };
        const body = JSON.stringify(payload);
        const req = https.request({
            method: 'POST',
            hostname: 'api.mailchannels.net',
            path: '/tx/v1/send',
            headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)}
        }, (r) => {
            let data = '';
            r.on('data', c => data += c);
            r.on('end', () => {
                if (r.statusCode >= 200 && r.statusCode < 300) resolve(true);
                else reject(new Error('Mailchannels ' + r.statusCode + ': ' + (data || r.statusMessage)));
            });
        });
        req.on('error', e => reject(new Error('Mailchannels 连接失败: ' + e.message)));
        req.write(body);
        req.end();
    });
}

// ============================================================
//  IMAP 读取收件箱（QQ 邮箱）
// ============================================================
function fetchInbox(count) {
    return new Promise((resolve, reject) => {
        const imap = new Imap({
            user: MAIL_CONFIG.user,
            password: MAIL_CONFIG.pass,
            host: MAIL_CONFIG.imapHost,
            port: MAIL_CONFIG.imapPort,
            tls: true,
            tlsOptions: { rejectUnauthorized: false }
        });
        const mails = [];
        imap.once('ready', () => {
            imap.openBox('INBOX', true, (err, box) => {
                if (err) return reject(err);
                const total = box.messages.total;
                if (!total) { imap.end(); return; }
                const start = Math.max(total - count + 1, 1);
                const f = imap.seq.fetch(start + ':' + total, { bodies: '', struct: true });
                f.on('message', (msg) => {
                    let attrs;
                    msg.on('attributes', a => attrs = a);
                    msg.on('body', (stream) => {
                        simpleParser(stream, (err, parsed) => {
                            if (err) return;
                            mails.push({
                                uid: attrs && attrs.uid,
                                from: parsed.from ? parsed.from.text : '',
                                to: parsed.to ? parsed.to.text : '',
                                replyTo: parsed.replyTo ? parsed.replyTo.text : '',
                                subject: parsed.subject || '(无主题)',
                                date: parsed.date ? parsed.date.toISOString() : '',
                                text: (parsed.text || '').slice(0, 4000),
                                snippet: (parsed.text || '').replace(/\s+/g, ' ').slice(0, 140)
                            });
                        });
                    });
                });
                f.once('end', () => imap.end());
            });
        });
        imap.once('error', err => reject(err));
        imap.once('close', () => resolve(mails.sort((a, b) => (b.date || '').localeCompare(a.date || ''))));
        imap.connect();
    });
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

function serveStatic(pathname, res) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(WEB_ROOT, safe);
    if (filePath.includes(path.join(WEB_ROOT, 'functions')) ||
        safe === 'wrangler.toml' || safe === 'deploy.cmd' || safe === 'local-auth-server.js') {
        res.writeHead(403);
        return res.end('Forbidden');
    }
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
            return res.end('404 Not Found');
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
        fs.createReadStream(filePath).pipe(res);
    });
}

// ---- 站内信本地镜像（内存存储，合约与 functions/api/mail.js 一致）----
const mailUsers = new Map();
const mailSessions = new Map();
const mailStore = new Map();
const mailInbox = new Map();
const mailSent = new Map();

function mailPbkdf2(pw, saltBuf) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(pw, saltBuf, 100000, 32, 'sha256', (err, derived) => {
            if (err) return reject(err);
            resolve(derived);
        });
    });
}

async function handleLocalMail(body) {
    const action = body && body.action;
    if (action === 'register' || action === 'login') {
        const email = (body.email || '').trim().toLowerCase();
        const pw = body.password || '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: '邮箱格式不正确' };
        if (!/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(pw)) return { ok: false, error: '密码需至少6位且含字母和数字' };
        if (action === 'register') {
            if (mailUsers.has(email)) return { ok: false, error: '该账号已存在' };
            const salt = crypto.randomBytes(16);
            const hash = await mailPbkdf2(pw, salt);
            mailUsers.set(email, { salt: salt.toString('hex'), hash: hash.toString('hex') });
            const token = crypto.randomBytes(24).toString('hex');
            mailSessions.set(token, email);
            return { ok: true, token, email };
        } else {
            const u = mailUsers.get(email);
            if (!u) return { ok: false, error: '该账号不存在，请先注册' };
            const hash = await mailPbkdf2(pw, Buffer.from(u.salt, 'hex'));
            if (hash.toString('hex') !== u.hash) return { ok: false, error: '密码错误' };
            const token = crypto.randomBytes(24).toString('hex');
            mailSessions.set(token, email);
            return { ok: true, token, email };
        }
    }
    if (action === 'logout') {
        if (body.token) mailSessions.delete(body.token);
        return { ok: true };
    }
    const email = body && body.token ? mailSessions.get(body.token) : null;
    if (!email) return { ok: false, error: '未登录或会话已过期' };
    if (action === 'send-external') {
        const to = (body.to || '').trim().toLowerCase();
        const subject = (body.subject || '').trim();
        const text = body.text || '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: '收件人邮箱格式不正确' };
        if (!subject) return { ok: false, error: '主题不能为空' };
        const id = crypto.randomBytes(16).toString('hex');
        const mail = { id, from: email, to, subject, text, ts: Date.now(), read: true, external: true };
        const rememberSent = () => {
            mailStore.set(id, mail);
            const se = (mailSent.get(email) || []).filter(x => x !== id); se.unshift(id); mailSent.set(email, se.slice(0, 200));
        };
        // 优先走 Resend：支持自定义域名 From（xxx@scratchextensioneditor.cc.cd）
        if (process.env.RESEND_API_KEY) {
            try {
                const r = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ from: email, to: [to], subject: subject, text: text })
                });
                if (!r.ok) {
                    const t = await r.text().catch(() => '');
                    return { ok: false, error: '外部发信失败（Resend ' + r.status + '）：' + t };
                }
                rememberSent();
                console.log(`  ✅ 外部邮件已通过 Resend 以 ${email} 发往 ${to}`);
                return { ok: true, id, external: true };
            } catch (e) {
                return { ok: false, error: '外部发信异常：' + e.message };
            }
        }
        try {
            // QQ SMTP 强制 From=认证账号，否则 550 拒绝
            // 所以本地通道用原始 From，但加 Reply-To 指向当前站内账号
            await smtpSend(to, subject, text, email);
            rememberSent();
            console.log(`  ✅ 外部邮件已通过 QQ SMTP 发往 ${to}`);
            return { ok: true, id, external: true };
        } catch (e) {
            return { ok: false, error: '外部发信失败：' + e.message };
        }
    }
    if (action === 'send') {
        const to = (body.to || '').trim().toLowerCase();
        const subject = (body.subject || '').trim();
        const text = body.text || '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: '收件人邮箱格式不正确' };
        if (!subject) return { ok: false, error: '主题不能为空' };
        if (!mailUsers.has(to)) return { ok: false, error: '收件人账号不存在（站内信只能发给已注册账号）' };
        const id = crypto.randomBytes(16).toString('hex');
        const mail = { id, from: email, to, subject, text, ts: Date.now(), read: false };
        mailStore.set(id, mail);
        const ib = (mailInbox.get(to) || []).filter(x => x !== id); ib.unshift(id); mailInbox.set(to, ib.slice(0, 200));
        const se = (mailSent.get(email) || []).filter(x => x !== id); se.unshift(id); mailSent.set(email, se.slice(0, 200));
        return { ok: true, id };
    }
    if (action === 'inbox' || action === 'sent') {
        const ids = (action === 'sent' ? mailSent.get(email) : mailInbox.get(email)) || [];
        const mails = ids.map(id => {
            const m = mailStore.get(id);
            if (!m) return null;
            return { id: m.id, from: m.from, to: m.to, subject: m.subject || '(无主题)', snippet: (m.text || '').slice(0, 80), ts: m.ts, read: !!m.read };
        }).filter(Boolean);
        return { ok: true, mails };
    }
    if (action === 'read') {
        const m = mailStore.get(body.id);
        if (!m) return { ok: false, error: '邮件不存在' };
        if (m.to !== email && m.from !== email) return { ok: false, error: '无权查看此邮件' };
        if (m.to === email && !m.read) { m.read = true; mailStore.set(body.id, m); }
        return { ok: true, mail: m };
    }
    return { ok: false, error: '未知 action：' + action };
}

const server = http.createServer(async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/api/turnstile-verify') {
        return json(res, 200, {success: true});
    }

    // 收件箱
    if (url.pathname === '/api/inbox') {
        try {
            const mails = await fetchInbox(20);
            return json(res, 200, {ok: true, mails: mails});
        } catch (e) {
            console.error(`  ❌ 读取收件箱失败: ${e.message}`);
            return json(res, 500, {ok: false, error: '读取收件箱失败：' + e.message});
        }
    }

    // 自由发送邮件
    if (url.pathname === '/api/send-mail') {
        const body = await readBody(req);
        const to = (body.to || '').trim();
        const subject = (body.subject || '').trim();
        const text = body.text || '';
        if (!to || !to.includes('@')) return json(res, 400, {ok: false, error: '请输入有效收件人'});
        if (!subject) return json(res, 400, {ok: false, error: '主题不能为空'});
        try {
            if (USE_MAILCHANNELS) {
                // Mailchannels 也支持自定义内容
                await sendMailchannelsMail(to, '');
                // 注：Mailchannels 验证码模板固定，自定义正文需另写；此处暂走 SMTP
            }
            await smtpSend(to, subject, text);
            console.log(`  ✅ 已发送邮件 → ${to}  主题: ${subject}`);
            return json(res, 200, {ok: true});
        } catch (e) {
            console.error(`  ❌ 发信失败: ${e.message}`);
            return json(res, 502, {ok: false, error: '发送失败：' + e.message});
        }
    }

    // 站内信（与线上 functions/api/mail.js 同契约，内存存储）
    if (url.pathname === '/api/mail') {
        const body = await readBody(req);
        return json(res, 200, await handleLocalMail(body));
    }

    // 只处理 /api/auth
    if (url.pathname !== '/api/auth') {
        if (req.method === 'GET') return serveStatic(url.pathname, res);
        return json(res, 404, {ok: false, error: 'Not Found'});
    }

    let action = url.searchParams.get('action');
    let email = (url.searchParams.get('email') || '').trim().toLowerCase();
    let postData = await readBody(req);
    if (!action) action = postData.action;
    if (!email) email = (postData.email || '').trim().toLowerCase();

    console.log(`\n[${new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})}]] ${req.method} /api/auth?action=${action}&email=${email}`);

    if (action === 'send') {
        if (!email || !email.includes('@')) return json(res, 400, {ok: false, error: '请输入有效邮箱地址'});
        const prev = codeStore.get(email);
        if (prev && prev.lastSent && Date.now() - prev.lastSent < RESEND_INTERVAL_MS) {
            const wait = Math.ceil((RESEND_INTERVAL_MS - (Date.now() - prev.lastSent)) / 1000);
            return json(res, 429, {ok: false, error: `请 ${wait} 秒后再发送`});
        }
        const code = generateCode();
        codeStore.set(email, {code, expires: Date.now() + CODE_TTL_MS, verified: false, lastSent: Date.now()});
        console.log(`\n  📧 准备发信 → ${email}  验证码: ${code}`);
        try {
            if (USE_MAILCHANNELS) {
                await sendMailchannelsMail(email, code);
                console.log(`  ✅ 验证码已通过 Mailchannels(${MAILCHANNELS_FROM}) 发往 ${email}`);
            } else {
                await sendSmtpMail(email, code);
                console.log(`  ✅ 验证码已通过 ${MAIL_CONFIG.user} 发往 ${email}`);
            }
            return json(res, 200, {ok: true});
        } catch (e) {
            console.error(`  ❌ 发信失败: ${e.message}`);
            return json(res, 502, {ok: false, error: '发信失败：' + e.message});
        }
    }

    if (action === 'verify') {
        const inputCode = ((postData && postData.code) || '').trim();
        const record = codeStore.get(email);
        if (!record) return json(res, 400, {ok: false, error: '请先发送验证码'});
        if (Date.now() > record.expires) {
            codeStore.delete(email);
            return json(res, 400, {ok: false, error: '验证码已过期，请重新发送'});
        }
        if (record.code !== inputCode) return json(res, 400, {ok: false, error: '验证码错误'});
        record.verified = true;
        const verifiedToken = crypto.randomBytes(32).toString('hex');
        record.verifiedToken = verifiedToken;
        record.verifiedAt = Date.now();
        console.log(`  ✅ 邮箱 ${email} 验证通过! token=${verifiedToken.slice(0, 16)}...`);
        return json(res, 200, {ok: true, verifiedToken: verifiedToken});
    }

    if (action === 'register') {
        const pw = postData.password;
        if (!pw || !/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(pw)) return json(res, 400, {ok: false, error: '密码需至少6位且含字母和数字'});
        const token = crypto.randomBytes(32).toString('hex');
        console.log(`  ✅ 注册成功: ${email}`);
        return json(res, 200, {ok: true, email: email, token: token});
    }

    if (action === 'login') {
        const token = crypto.randomBytes(32).toString('hex');
        console.log(`  ✅ 登录成功: ${email}`);
        return json(res, 200, {ok: true, email: email, token: token});
    }

    if (action === 'reset') {
        const newPw = postData.newPassword;
        if (!newPw || !/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(newPw)) return json(res, 400, {ok: false, error: '新密码需至少6位且含字母和数字'});
        console.log(`  ✅ 密码已重置: ${email}`);
        return json(res, 200, {ok: true, message: '密码已重置'});
    }

    json(res, 400, {ok: false, error: '未知动作: ' + action});
});

server.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  本地邮箱一体化开发服务器`);
    console.log(`  邮箱页面:   http://localhost:${PORT}/mail.html`);
    console.log(`  API:       http://localhost:${PORT}/api/auth | /api/inbox | /api/send-mail`);
    console.log(`  账号:       ${MAIL_CONFIG.user}`);
    console.log(`  发信通道:   ${MAIL_CONFIG.host} (SMTP+IMAP)`);
    console.log(`========================================\n`);
});
