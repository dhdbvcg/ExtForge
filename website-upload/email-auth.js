// =====================================================================
// email-auth.js —— 邮箱验证码前端模块（注册 / 登录 OTP / 找回密码）
// ---------------------------------------------------------------------
// 依赖后端：/api/auth（见 functions/api/auth.js）
// 用法：
//   <div id="email-auth"></div>
//   <script src="email-auth.js"></script>
//   <script>EmailAuth.mount('#email-auth');</script>
//
// 集成到现有 users.html 账号面板：把下面 mount 调用放进登录面板，
// 或在 auth.js 渲染表单处插入 EmailAuth.mount('#邮箱验证码区域') 即可。
// =====================================================================
(function () {
  'use strict';

  var API = '/api/auth';
  var COLOR = '#43A047';
  var COLOR_DARK = '#2E7D32';

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    if (children) children.forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function api(action, payload) {
    return fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, payload)),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
  }

  function mount(sel) {
    var root = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!root) return;

    // 状态
    var state = { mode: 'register', sent: {}, cooldown: 0 };

    var tabBar = el('div', { class: 'ea-tabs' }, [
      tabBtn('register', '注册'),
      tabBtn('login', '登录'),
      tabBtn('reset', '找回密码'),
    ]);

    var msgBox = el('div', { class: 'ea-msg' });

    var emailInput = field('email', '邮箱', 'you@example.com', 'email');
    var codeRow = el('div', { class: 'ea-row' }, [
      field('code', '验证码', '6 位数字', 'text'),
      sendBtn(),
    ]);
    var pwInput = field('password', '密码（字母+数字≥6）', '', 'password');
    var pw2Input = field('password2', '确认密码', '', 'password');

    var submitBtn = el('button', {
      class: 'ea-submit', text: '注册', onclick: onSubmit,
    });

    var form = el('div', { class: 'ea-form' }, [emailInput, codeRow, pwInput, pw2Input, submitBtn]);

    root.appendChild(el('div', { class: 'ea-card' }, [tabBar, msgBox, form]));
    injectStyle();
    render();

    // ---------------- 组件 ----------------
    function tabBtn(mode, label) {
      return el('button', {
        class: 'ea-tab', 'data-mode': mode, text: label,
        onclick: function () { state.mode = mode; render(); },
      });
    }
    function field(name, label, ph, type) {
      var input = el('input', { class: 'ea-input', type: type || 'text', placeholder: ph || '', name: name });
      return el('div', { class: 'ea-field' }, [el('label', { text: label }), input]);
    }
    function sendBtn() {
      var b = el('button', { class: 'ea-send', text: '获取验证码', onclick: onSend });
      b._input = codeRow.querySelector('[name=code]'); // placeholder
      return b;
    }

    // ---------------- 行为 ----------------
    function onSend() {
      var email = emailInput.querySelector('input').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show('请输入正确邮箱', 'err');
      var b = codeRow.querySelector('.ea-send');
      b.disabled = true;
      api('send', { email: email, purpose: state.mode }).then(function (res) {
        if (res.ok && res.data.ok) {
          show('验证码已发送，请查收邮箱（10 分钟内有效）', 'ok');
          startCooldown(b);
        } else {
          show(res.data.error || '发送失败', 'err');
          b.disabled = false;
        }
      }).catch(function () { show('网络错误', 'err'); b.disabled = false; });
    }

    function startCooldown(b) {
      state.cooldown = 60;
      b.textContent = state.cooldown + 's';
      var t = setInterval(function () {
        state.cooldown -= 1;
        if (state.cooldown <= 0) { clearInterval(t); b.textContent = '获取验证码'; b.disabled = false; }
        else b.textContent = state.cooldown + 's';
      }, 1000);
    }

    function onSubmit() {
      var email = emailInput.querySelector('input').value.trim();
      var code = codeRow.querySelector('[name=code]').value.trim();
      var pw = pwInput.querySelector('input').value;
      var pw2 = pw2Input.querySelector('input').value;

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show('请输入正确邮箱', 'err');

      if (state.mode === 'register') {
        if (pw !== pw2) return show('两次密码不一致', 'err');
        if (!/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(pw)) return show('密码需至少6位且含字母和数字', 'err');
        // 先校验码
        api('verify', { email: email, code: code, purpose: 'register' }).then(function (r) {
          if (!r.ok || !r.data.ok) return show(r.data.error || '验证失败', 'err');
          return api('register', { email: email, code: code, verifiedToken: r.data.verifiedToken, password: pw })
            .then(function (rr) {
              if (rr.ok && rr.data.ok) finish(rr.data);
              else show(rr.data.error || '注册失败', 'err');
            });
        });
      } else if (state.mode === 'login') {
        if (code) {
          api('verify', { email: email, code: code, purpose: 'login' }).then(function (r) {
            if (!r.ok || !r.data.ok) return show(r.data.error || '验证失败', 'err');
            return api('login', { email: email, code: code, verifiedToken: r.data.verifiedToken })
              .then(function (rr) { if (rr.ok && rr.data.ok) finish(rr.data); else show(rr.data.error || '登录失败', 'err'); });
          });
        } else if (pw) {
          api('login', { email: email, password: pw }).then(function (rr) {
            if (rr.ok && rr.data.ok) finish(rr.data); else show(rr.data.error || '登录失败', 'err');
          });
        } else {
          show('请输入验证码或密码', 'err');
        }
      } else if (state.mode === 'reset') {
        if (!/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(pw)) return show('新密码需至少6位且含字母和数字', 'err');
        api('verify', { email: email, code: code, purpose: 'reset' }).then(function (r) {
          if (!r.ok || !r.data.ok) return show(r.data.error || '验证失败', 'err');
          return api('reset', { email: email, code: code, verifiedToken: r.data.verifiedToken, newPassword: pw })
            .then(function (rr) { if (rr.ok && rr.data.ok) { show('密码已重置，请用新密码登录', 'ok'); state.mode = 'login'; render(); } else show(rr.data.error || '重置失败', 'err'); });
        });
      }
    }

    function finish(data) {
      try { localStorage.setItem('ea_token', data.token); localStorage.setItem('ea_email', data.email); } catch (e) {}
      show('欢迎，' + data.email + '！已登录', 'ok');
      if (window.EmailAuth && window.EmailAuth.onLogin) window.EmailAuth.onLogin(data);
    }

    function show(text, type) {
      msgBox.textContent = text;
      msgBox.className = 'ea-msg ' + (type || '');
    }

    function render() {
      // 高亮 tab
      tabBar.querySelectorAll('.ea-tab').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-mode') === state.mode);
      });
      submitBtn.textContent = state.mode === 'register' ? '注册' : (state.mode === 'login' ? '登录' : '重置密码');
      // 登录模式允许仅密码；注册/找回需要确认密码
      pw2Input.style.display = (state.mode === 'register') ? '' : 'none';
      show('', '');
    }

    function injectStyle() {
      if (document.getElementById('ea-style')) return;
      var s = document.createElement('style');
      s.id = 'ea-style';
      s.textContent = [
        '.ea-card{max-width:360px;margin:24px auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px;font-family:"Microsoft YaHei UI",sans-serif}',
        '.ea-tabs{display:flex;gap:8px;margin-bottom:16px}',
        '.ea-tab{flex:1;padding:8px;border:1px solid #e0e0e0;background:#fafafa;color:#757575;border-radius:8px;cursor:pointer;font-size:14px}',
        '.ea-tab.active{background:' + COLOR + ';color:#fff;border-color:' + COLOR + '}',
        '.ea-field{margin-bottom:12px}',
        '.ea-field label{display:block;font-size:12px;color:#757575;margin-bottom:4px}',
        '.ea-input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d0d0d0;border-radius:8px;font-size:14px;outline:none}',
        '.ea-input:focus{border-color:' + COLOR + '}',
        '.ea-row{display:flex;gap:8px;align-items:flex-end}',
        '.ea-row .ea-field{flex:1;margin-bottom:12px}',
        '.ea-send{white-space:nowrap;padding:10px 12px;border:none;background:#e8f5e9;color:' + COLOR_DARK + ';border-radius:8px;cursor:pointer;font-size:13px}',
        '.ea-send:disabled{opacity:.6;cursor:default}',
        '.ea-submit{width:100%;padding:12px;border:none;background:' + COLOR + ';color:#fff;border-radius:8px;font-size:15px;cursor:pointer;margin-top:4px}',
        '.ea-submit:hover{background:' + COLOR_DARK + '}',
        '.ea-msg{font-size:13px;min-height:18px;margin:8px 0}',
        '.ea-msg.ok{color:' + COLOR_DARK + '}',
        '.ea-msg.err{color:#d32f2f}',
      ].join('');
      document.head.appendChild(s);
    }
  }

  window.EmailAuth = { mount: mount };
})();
