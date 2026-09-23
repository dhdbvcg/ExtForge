/*
 * 站点头像（共享小工具）
 * ------------------------------------------------------------------
 * 用户在 /users/ 上传头像后，头像存在 localStorage 的
 * extbuilder_users[username].avatarDataUrl 里。
 * 其它页面（外观 / 好友 / 安全 等）原本只显示昵称首字母，本脚本负责
 * 把这些页面上的 #hdrAvatar / #sbAvatar 等圆形元素换成真实头像。
 *
 * 用法：在页面 </body> 之前引入（路径按页面层级调整）：
 *   <script src="../avatar.js"></script>
 *
 * 注意：本脚本只做「显示」，不负责上传；上传逻辑在 users/index.html 里。
 */
(function () {
  'use strict';

  var USERS_KEY = 'extbuilder_users';
  var SESSION_KEY = 'extbuilder_session';

  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function getSession() {
    try {
      var r = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!r || !r.username) return null;
      if (r.expires && r.expires < Date.now()) return null;
      return r;
    } catch (e) { return null; }
  }

  function paint(el, url, letter) {
    if (!el) return;
    if (url) {
      el.style.backgroundImage = 'url(' + url + ')';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat = 'no-repeat';
      el.textContent = '';
    } else if (letter != null) {
      el.style.backgroundImage = '';
      el.textContent = letter;
    }
  }

  function sync() {
    var s = getSession();
    if (!s) return;
    var u = getUsers()[s.username] || {};
    var url = u.avatarDataUrl || '';
    if (!url) return;
    var letter = String(u.displayName || s.username).charAt(0).toUpperCase();
    ['hdrAvatar', 'sbAvatar', 'avatarPreview', 'prevAvatar', 'pubAvatar'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      // 已经用同一个头像画过就跳过（也避免 MutationObserver 自触发死循环）
      if (el.getAttribute('data-avatar-url') === url) return;
      el.setAttribute('data-avatar-url', url);
      paint(el, url, letter);
    });
  }

  function boot() {
    sync();
    // 页面脚本可能晚一步才写入首字母，监听文本变化及时补画
    if (window.MutationObserver) {
      var mo = new MutationObserver(sync);
      ['hdrAvatar', 'sbAvatar'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) mo.observe(el, {childList: true, characterData: true, subtree: true});
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('load', sync);
})();
