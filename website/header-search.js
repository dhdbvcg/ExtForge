/*
 * 顶部全局搜索框（共享脚本，自动注入）
 * 用法：在页面 </body> 前引入 <script src="../header-search.js"></script>（/users/ 下页面）
 *
 * 行为：在 .hdr 内、.hdr-right 之前插入一个搜索框；回车或提交时跳转到
 *       ./search.html?q=<关键词>（由 search.html 读取 ?q= 自动搜索）。
 * 若页面已自带 #hdrSearchForm 则跳过，避免重复注入。
 * 样式随脚本注入（<style id="hdrSearchStyle">），并复用页面已有的 CSS 变量。
 */
(function () {
  function init() {
    var hdr = document.querySelector('.hdr');
    if (!hdr) return;
    if (document.getElementById('hdrSearchForm')) return; // 已存在

    if (!document.getElementById('hdrSearchStyle')) {
      var st = document.createElement('style');
      st.id = 'hdrSearchStyle';
      st.textContent =
        '.hdr-search{display:flex;align-items:center;position:relative;margin-left:16px}' +
        '.hdr-search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--ink-faint);pointer-events:none}' +
        '.hdr-search-input{width:190px;padding:7px 14px 7px 34px;border-radius:999px;border:1px solid var(--glass-brd);background:var(--bg-3);color:var(--ink);font-family:var(--font);font-size:13px;outline:none;transition:border-color .15s}' +
        '.hdr-search-input:focus{border-color:var(--violet);box-shadow:0 0 0 3px rgba(139,92,246,0.15)}' +
        '.hdr-search-input::placeholder{color:var(--ink-faint)}' +
        '@media(max-width:900px){.hdr-search{display:none}}';
      document.head.appendChild(st);
    }

    var form = document.createElement('form');
    form.className = 'hdr-search';
    form.id = 'hdrSearchForm';
    form.setAttribute('onsubmit', 'return false');
    form.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<input class="hdr-search-input" id="hdrSearchInput" type="text" placeholder="搜索用户" autocomplete="off" />';

    var right = hdr.querySelector('.hdr-right');
    if (right) hdr.insertBefore(form, right); else hdr.appendChild(form);

    var inp = form.querySelector('#hdrSearchInput');
    function go() {
      var v = (inp.value || '').trim();
      if (!v) { location.href = './search.html'; return; }
      location.href = './search.html?q=' + encodeURIComponent(v);
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); go(); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
