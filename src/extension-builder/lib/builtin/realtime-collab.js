export default {
    id: 'realtime-collab',
    name: '实时协作',
    description: '多人实时协作编辑扩展制作器。支持创建/加入房间、在线用户列表、聊天、Blockly 工作区实时同步、房间隐私设置。基于 WebRTC（PeerJS）点对点连接，数据不经过中心服务器。',
    category: '协作',
    css: `
:global(.rtc-panel) {
  position: fixed;
  top: 60px;
  right: 20px;
  width: 420px;
  height: 560px;
  max-height: calc(100vh - 80px);
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 40px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08);
  z-index: 99999;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  min-width: 300px;
  min-height: 360px;
}
:global(.rtc-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #e8eaed;
  border-radius: 10px 10px 0 0;
  user-select: none;
  flex-shrink: 0;
  cursor: default;
}
:global(.rtc-header-title) {
  font-size: 14px;
  font-weight: 600;
  color: #202124;
}
:global(.rtc-header-btns) {
  display: flex;
  gap: 4px;
}
:global(.rtc-header-btn) {
  width: 26px; height: 26px;
  border: none; border-radius: 6px;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #5f6368;
  transition: background .1s;
}
:global(.rtc-header-btn:hover) { background: #e8eaed; }
:global(.rtc-body) { padding: 12px 16px; overflow-y: auto; flex: 1; }

/* 自由拉伸手柄（8 方向） */
:global(.rtc-resize-layer) {
  position: fixed;
  pointer-events: none;
  z-index: 99998;
}
:global(.rtc-resize-handle) {
  position: absolute;
  pointer-events: auto;
  z-index: 99999;
}
:global(.rtc-resize-handle:hover) { background: rgba(26,115,232,.25); }
:global(.rtc-rz-n)  { top: -4px; left: 8px; right: 8px; height: 8px; cursor: ns-resize; }
:global(.rtc-rz-s)  { bottom: -4px; left: 8px; right: 8px; height: 8px; cursor: ns-resize; }
:global(.rtc-rz-e)  { right: -4px; top: 8px; bottom: 8px; width: 8px; cursor: ew-resize; }
:global(.rtc-rz-w)  { left: -4px; top: 8px; bottom: 8px; width: 8px; cursor: ew-resize; }
:global(.rtc-rz-ne) { top: -4px; right: -4px; width: 14px; height: 14px; cursor: nesw-resize; }
:global(.rtc-rz-nw) { top: -4px; left: -4px; width: 14px; height: 14px; cursor: nwse-resize; }
:global(.rtc-rz-se) { bottom: -4px; right: -4px; width: 14px; height: 14px; cursor: nwse-resize; }
:global(.rtc-rz-sw) { bottom: -4px; left: -4px; width: 14px; height: 14px; cursor: nesw-resize; }

/* 远程光标 */
:global(.rtc-cursor-layer) {
  position: fixed;
  top: 0; left: 0;
  pointer-events: none;
  z-index: 99997;
  overflow: hidden;
}
:global(.rtc-remote-cursor) {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: left .15s, top .15s;
  pointer-events: none;
}
:global(.rtc-remote-cursor-pointer) {
  width: 16px; height: 16px;
  border-left: 3px solid #ff7043;
  border-top: 3px solid #ff7043;
  transform: rotate(-45deg);
  margin-top: -2px;
}
:global(.rtc-remote-cursor-name) {
  font-size: 11px; padding: 1px 6px; border-radius: 4px;
  background: #ff7043; color: #fff; white-space: nowrap;
  margin-top: 2px; font-weight: 500;
}
:global(.rtc-alpha-banner) {
  background: #fef7e0;
  border: 1px solid #fdd663;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #b06000;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.45;
}
:global(.rtc-alpha-banner svg) { flex-shrink: 0; margin-top: 1px; }
:global(.rtc-section-title) {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 600; color: #202124;
  margin: 18px 0 12px;
}
:global(.rtc-section-title svg) { flex-shrink: 0; }
:global(.rtc-settings-badge) { margin-left: auto; }
:global(.rtc-settings-badge button) {
  width: 30px; height: 30px;
  border: none; border-radius: 6px;
  background: transparent;
  cursor: pointer; color: #5f6368;
  font-size: 16px; display: flex; align-items: center; justify-content: center;
  transition: background .15s;
}
:global(.rtc-settings-badge button:hover) { background: #f1f3f4; }

/* 用户名行 */
:global(.rtc-username-row) {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 4px; font-size: 13px; color: #5f6368;
}
:global(.rtc-username-row svg) { flex-shrink: 0; }
:global(.rtc-username-edit) {
  border: none; background: transparent;
  color: #1a73e8; cursor: pointer;
  font-size: 13px; padding: 2px 4px; border-radius: 4px;
}
:global(.rtc-username-edit:hover) { background: #e8f0fe; }

/* 表单 */
:global(.rtc-field-label) { font-size: 13px; font-weight: 600; color: #202124; margin: 14px 0 6px; }
:global(.rtc-input) {
  width: 100%; box-sizing: border-box;
  padding: 10px 14px; border: 1px solid #dadce0;
  border-radius: 8px; font-size: 14px; outline: none;
  transition: border-color .2s, box-shadow .2s;
  font-family: inherit;
}
:global(.rtc-input:focus) { border-color: #1a73e8; box-shadow: 0 0 0 3px rgba(26,115,232,.12); }
:global(.rtc-input::placeholder) { color: #9aa0a6; }

/* 按钮 */
:global(.rtc-btn) {
  width: 100%; padding: 11px; border: none; border-radius: 8px;
  font-size: 14px; font-weight: 500; cursor: pointer;
  transition: opacity .15s, transform .1s; margin-top: 8px;
  font-family: inherit;
}
:global(.rtc-btn:hover) { opacity: .9; }
:global(.rtc-btn:active) { transform: scale(.98); }
:global(.rtc-btn-primary) { background: #4db6ac; color: #fff; }
:global(.rtc-btn-danger) { background: #ff7043; color: #fff; }
:global(.rtc-btn-outline) { background: transparent; border: 1px solid #dadce0; color: #1a73e8; }
:global(.rtc-btn-outline:hover) { background: #f1f3f4; }

/* 警告提示 */
:global(.rtc-hint) {
  background: #f8f9fa; border: 1px solid #e8eaed;
  border-radius: 8px; padding: 8px 12px; margin-top: 8px;
  font-size: 12px; color: #5f6368; line-height: 1.45;
  display: flex; align-items: flex-start; gap: 6px;
}
:global(.rtc-hint svg) { flex-shrink: 0; margin-top: 1px; color: #f4b400; }

/* 分隔线 */
:global(.rtc-divider) { border: none; border-top: 1px solid #e8eaed; margin: 18px 0; }

/* 已连接状态 */
:global(.rtc-room-name) { font-size: 15px; font-weight: 600; color: #202124; }
:global(.rtc-room-id-box) { margin-top: 10px; }
:global(.rtc-room-id-label) { font-size: 12px; color: #5f6368; margin-bottom: 4px; }
:global(.rtc-room-id-box .rtc-input) { font-size: 12px; color: #5f6368; background: #f8f9fa; }
:global(.rtc-conn-info) { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #5f6368; margin-bottom: 10px; }
:global(.rtc-server-tag) { padding: 2px 8px; background: #e8f0fe; color: #1a73e8; border-radius: 10px; font-size: 11px; }
:global(.rtc-loading) { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #5f6368; padding: 8px 0; }
:global(.rtc-spinner) { width: 16px; height: 16px; border: 2px solid #dadce0; border-top-color: #1a73e8; border-radius: 50%; animation: rtc-spin .8s linear infinite; }
@keyframes rtc-spin { to { transform: rotate(360deg); } }
:global(.rtc-status) {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: #1e8e3e; margin-top: 4px;
}
:global(.rtc-status-dot) {
  width: 8px; height: 8px; border-radius: 50%;
  background: #34a853; flex-shrink: 0;
}
:global(.rtc-status-dot.warn) { background: #f4b400; }
:global(.rtc-status-dot.err) { background: #ea4335; }

/* 连接异常状态条 */
:global(.rtc-banner) {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 8px; margin-bottom: 12px;
  font-size: 13px; line-height: 1.4;
}
:global(.rtc-banner.warn) { background: #fef7e0; border: 1px solid #fdd663; color: #b06000; }
:global(.rtc-banner.err) { background: #fce8e6; border: 1px solid #f4c7c3; color: #c5221f; }
:global(.rtc-banner svg) { flex-shrink: 0; }
:global(.rtc-banner .rtc-banner-spin) { width: 14px; height: 14px; border: 2px solid #f4b400; border-top-color: #b06000; border-radius: 50%; animation: rtc-spin .8s linear infinite; flex-shrink: 0; }
:global(.rtc-banner.editing) { background: #e6f4ea; border: 1px solid #b7dfc3; color: #137333; }
:global(.rtc-banner.editing svg) { color: #34a853; }

/* 用户列表 */
:global(.rtc-users-title) { font-size: 13px; font-weight: 600; color: #202124; margin: 14px 0 8px; }
:global(.rtc-user-item) {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 8px;
  margin-bottom: 6px; font-size: 14px; color: #202124;
}
:global(.rtc-user-item.host) { background: #e8f0fe; }
:global(.rtc-user-item.self) { background: #e6f4ea; }
:global(.rtc-user-item.host.self) { background: #fce8e6; }
:global(.rtc-user-icon) { flex-shrink: 0; font-size: 18px; }
:global(.rtc-user-name) { font-weight: 500; flex: 1; }
:global(.rtc-badges) { display: flex; gap: 4px; flex-shrink: 0; }
:global(.rtc-badge) {
  padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500;
}
:global(.rtc-badge-host) { background: #c5cae9; color: #1a237e; }
:global(.rtc-badge-you) { background: #b2dfdb; color: #004d40; }

/* 聊天区域 */
:global(.rtc-chat-title) { font-size: 13px; font-weight: 600; color: #202124; margin: 14px 0 8px; }
:global(.rtc-chat-box) {
  background: #f8f9fa; border: 1px solid #e8eaed; border-radius: 8px;
  padding: 10px; min-height: 80px; max-height: 160px; overflow-y: auto;
  font-size: 13px; line-height: 1.6; margin-bottom: 8px;
}
:global(.rtc-chat-msg) { margin-bottom: 4px; word-break: break-word; }
:global(.rtc-chat-msg-name) { font-weight: 600; color: #1a73e8; }
:global(.rtc-chat-input-wrap) { display: flex; gap: 6px; }
:global(.rtc-chat-input) {
  flex: 1; padding: 8px 12px; border: 1px solid #dadce0;
  border-radius: 8px; font-size: 13px; outline: none; font-family: inherit;
}
:global(.rtc-chat-input:focus) { border-color: #1a73e8; }

/* 隐私设置 */
:global(.rtc-privacy-title) { font-size: 13px; font-weight: 600; color: #202124; margin: 14px 0 8px; }
:global(.rtc-privacy-option) {
  border: 1px solid #dadce0; border-radius: 8px; padding: 12px 14px;
  margin-bottom: 8px; cursor: pointer; transition: background .15s, border-color .15s;
}
:global(.rtc-privacy-option:hover) { background: #f8f9fa; }
:global(.rtc-privacy-option.active) { background: #e0f2f1; border-color: #4db6ac; }
:global(.rtc-privacy-opt-name) { font-size: 14px; font-weight: 500; color: #202124; }
:global(.rtc-privacy-opt-desc) { font-size: 12px; color: #5f6368; margin-top: 2px; }

/* 连接设置弹窗 */
:global(.rtc-settings-overlay) {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,.35); z-index: 100000;
  display: flex; align-items: center; justify-content: center;
}
:global(.rtc-settings-dialog) {
  background: #fff; border-radius: 10px;
  width: 480px; max-width: 90vw; max-height: 85vh;
  box-shadow: 0 8px 40px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.1);
  display: flex; flex-direction: column; overflow: hidden;
}
:global(.rtc-settings-header) {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid #e8eaed;
  flex-shrink: 0;
}
:global(.rtc-settings-header-title) {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 600; color: #202124;
}
:global(.rtc-settings-header-title svg) { flex-shrink: 0; }
:global(.rtc-settings-close) {
  width: 30px; height: 30px; border: none; border-radius: 50%;
  background: transparent; cursor: pointer; color: #5f6368;
  font-size: 18px; display: flex; align-items: center; justify-content: center;
  transition: background .15s;
}
:global(.rtc-settings-close:hover) { background: #f1f3f4; }
:global(.rtc-settings-body) { padding: 16px 20px; overflow-y: auto; flex: 1; }
:global(.rtc-settings-subtitle) {
  font-size: 14px; font-weight: 600; color: #202124;
  margin-bottom: 14px;
}
:global(.rtc-settings-field) { margin-bottom: 12px; }
:global(.rtc-settings-label) {
  font-size: 13px; font-weight: 500; color: #202124;
  margin-bottom: 4px; display: block;
}
:global(.rtc-settings-input) {
  width: 100%; box-sizing: border-box;
  padding: 9px 12px; border: 1px solid #dadce0;
  border-radius: 8px; font-size: 14px; outline: none;
  transition: border-color .2s, box-shadow .2s;
  font-family: inherit;
}
:global(.rtc-settings-input:focus) { border-color: #1a73e8; box-shadow: 0 0 0 3px rgba(26,115,232,.12); }
:global(.rtc-settings-checkbox-row) {
  display: flex; align-items: center; gap: 8px;
  margin-top: 16px; cursor: pointer;
}
:global(.rtc-settings-checkbox-row input[type="checkbox"]) {
  width: 16px; height: 16px; accent-color: #1a73e8; cursor: pointer;
}
:global(.rtc-settings-checkbox-label) {
  font-size: 13px; color: #5f6368; cursor: pointer; user-select: none;
}
:global(.rtc-settings-footer) {
  display: flex; gap: 10px; justify-content: flex-end;
  padding: 14px 20px; border-top: 1px solid #e8eaed;
  flex-shrink: 0;
}
:global(.rtc-settings-btn-cancel) {
  padding: 9px 24px; border: 1px solid #dadce0; border-radius: 8px;
  background: #fff; color: #5f6368; font-size: 14px; font-weight: 500;
  cursor: pointer; font-family: inherit; transition: background .15s;
}
:global(.rtc-settings-btn-cancel:hover) { background: #f8f9fa; }
:global(.rtc-settings-btn-save) {
  padding: 9px 28px; border: none; border-radius: 8px;
  background: #4db6ac; color: #fff; font-size: 14px; font-weight: 500;
  cursor: pointer; font-family: inherit; transition: opacity .15s;
}
:global(.rtc-settings-btn-save:hover) { opacity: .88; }

/* 触发按钮（在 ExtensionBuilder 工具栏） */
:global(.rtc-trigger-btn) {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border: 1px solid #dadce0; border-radius: 8px;
  background: #fff; cursor: pointer; font-size: 13px; color: #202124;
  font-family: inherit; transition: background .15s, box-shadow .15s;
}
:global(.rtc-trigger-btn:hover) { background: #f8f9fa; box-shadow: 0 1px 4px rgba(0,0,0,.1); }

/* 右下角 Toast 通知 */
:global(.rtc-toast-container) {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 100001;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
}
:global(.rtc-toast) {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 4px 20px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08);
    min-width: 300px;
    max-width: 400px;
    animation: rtc-toast-in .3s ease-out;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
@keyframes rtc-toast-in {
    from { opacity: 0; transform: translateX(40px) scale(.95); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes rtc-toast-out {
    from { opacity: 1; transform: translateX(0) scale(1); }
    to   { opacity: 0; transform: translateX(40px) scale(.95); }
}
:global(.rtc-toast-icon) {
    flex-shrink: 0;
    width: 36px; height: 36px;
    border-radius: 50%;
    background: #e8f0fe;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
}
:global(.rtc-toast-body) { flex: 1; min-width: 0; }
:global(.rtc-toast-title) {
    font-size: 14px; font-weight: 600; color: #202124;
    margin-bottom: 2px;
}
:global(.rtc-toast-desc) {
    font-size: 12px; color: #5f6368;
}
:global(.rtc-toast-actions) {
    display: flex; gap: 6px; flex-shrink: 0;
    margin-top: 8px;
}
:global(.rtc-toast-btn) {
    padding: 5px 14px; border: none; border-radius: 6px;
    font-size: 13px; font-weight: 500; cursor: pointer;
    font-family: inherit; transition: opacity .15s;
}
:global(.rtc-toast-btn:hover) { opacity: .85; }
:global(.rtc-toast-approve) { background: #4db6ac; color: #fff; }
:global(.rtc-toast-reject) { background: #ff7043; color: #fff; }
:global(.rtc-toast-close) {
    flex-shrink: 0; width: 24px; height: 24px;
    border: none; border-radius: 50%; background: transparent;
    cursor: pointer; color: #9aa0a6; font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    transition: background .15s;
}
:global(.rtc-toast-close:hover) { background: #f1f3f4; }

/* 「工具」下拉菜单注入项 */
:global(.rtc-tools-menu-item) {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; cursor: pointer;
    font-size: 13px; color: #333; font-family: inherit;
    border-radius: 4px; transition: background .12s;
}
:global(.rtc-tools-menu-item:hover) { background: rgba(0,0,0,.06); }
`,
    setup: async function (ctx) {
        const { document, window, createElement, addToolbarButton, mountPanel, effect } = ctx;

        // ─── 配置 ───
        // PeerJS 信令服务器（按优先级尝试）
        // 注意：peerjs.com 主域名已停用 ID 服务（返回 404），必须用带数字的节点 0/1.peerjs.com
        const PEERJS_SERVERS = [
            { host: '0.peerjs.com', port: 443, path: '/' },
            { host: '1.peerjs.com', port: 443, path: '/' }
        ];
        const STORAGE_PREFIX = 'rtc_collab_';

        // ICE 服务器配置（STUN + 免费公共 TURN，提高 NAT 穿透成功率）
        const ICE_SERVERS = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            // 免费公共 TURN（来自 openrelayproject.org / metered.ca）
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ];

        // ─── 状态 ───
        // 优先使用 ExtensionBuilder 登录系统的用户名
        let username = '';
        try {
            const sessionRaw = localStorage.getItem('extbuilder_session') || sessionStorage.getItem('extbuilder_session');
            if (sessionRaw) {
                const s = JSON.parse(sessionRaw);
                if (s && s.username) username = s.username;
            }
        } catch(e) {}
        // 回退：localStorage 旧值或随机生成
        if (!username) {
            username = localStorage.getItem(STORAGE_PREFIX + 'username') || '';
        }
        if (!username) {
            username = 'player' + Math.floor(Math.random() * 9000 + 1000);
        }
        localStorage.setItem(STORAGE_PREFIX + 'username', username);
        let peer = null;
        let connections = {};       // peerId -> { conn, metadata }
        let isHost = false;
        let roomId = '';
        let roomAlias = '';        // 房主自定义的房间昵称（仅展示，不参与连接）
        let privacy = 'public';     // 'public' | 'private'
        let myPeerId = '';
        let currentServerHost = '';   // 当前实际连接的信令服务器
        let wsSyncStarted = false;    // 工作区同步是否已启动（避免重复绑定）
        let connecting = false;       // 正在创建/加入房间
        let connState = 'ok';         // 'ok' | 'disconnected' | 'reconnecting' | 'error'
        let connStateMsg = '';        // 状态条文案
        let editingBannerName = '';   // 远程编辑提示中的用户名
        let editingBannerTimer = null;
        let chatMessages = [];
        let chatBoxEl = null;       // 当前聊天框 DOM 引用（增量追加用，避免整面板重建丢失）
        let pendingXml = null;      // 收到但暂缓应用的 XML（避免循环广播）
        let suppressBroadcast = false;
        let approvedMembers = {};   // peerId -> true（私人房间已审批）
        let pendingJoiners = {};    // peerId -> { conn }（等待审批的加入者）
        let initError = '';          // 初始化错误信息（空=无错误）
        let lastAction = '';          // 上次操作: 'create' | 'join' | ''
        let lastActionId = '';        // 上次操作的参数（房间ID）

        // ─── 连接设置 ───
        const SETTINGS_KEY = STORAGE_PREFIX + 'server_config';
        let serverConfig = loadServerConfig();

        function loadServerConfig() {
            try {
                const raw = localStorage.getItem(SETTINGS_KEY);
                if (raw) return JSON.parse(raw);
            } catch(e) {}
            return { host: 'peerjs.com', port: 443, key: '', path: '/', secure: true };
        }
        function saveServerConfig(cfg) {
            serverConfig = Object.assign({}, serverConfig, cfg);
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(serverConfig));
        }

        // ─── DOM 构建 ───
        const panel = createElement('div', { className: 'rtc-panel' });

        // Toast 通知容器（右下角弹窗）
        const toastContainer = createElement('div', { className: 'rtc-toast-container' });
        document.body.appendChild(toastContainer);

        // 音效：使用 Web Audio API 生成提示音（无需外部文件）
        let audioCtx = null;
        function playNotificationSound() {
            try {
                if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === 'suspended') audioCtx.resume();
                const now = audioCtx.currentTime;
                // 双音：高音→低音，模拟"叮咚"
                [880, 660].forEach((freq, i) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0.3, now + i * 0.15);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.35);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(now + i * 0.15);
                    osc.stop(now + i * 0.15 + 0.4);
                });
            } catch(e) {}
        }

        // 显示加入请求 Toast 通知
        function showJoinRequestToast(peerId, name) {
            // 避免重复弹出同一人的请求
            const existing = toastContainer.querySelector('[data-peer-id="' + peerId + '"]');
            if (existing) return;

            playNotificationSound();

            const toast = createElement('div', { className: 'rtc-toast' });
            toast.dataset.peerId = peerId;
            toast.innerHTML =
                '<div class="rtc-toast-icon">🔔</div>' +
                '<div class="rtc-toast-body">' +
                '<div class="rtc-toast-title">新的加入请求</div>' +
                '<div class="rtc-toast-desc"><strong>' + escapeHtml(name) + '</strong> 请求加入房间</div>' +
                '<div class="rtc-toast-actions">' +
                '<button class="rtc-toast-btn rtc-toast-approve">✓ 同意</button>' +
                '<button class="rtc-toast-btn rtc-toast-reject">✕ 拒绝</button>' +
                '</div></div>' +
                '<button class="rtc-toast-close">×</button>';

            // 同意按钮
            toast.querySelector('.rtc-toast-approve').onclick = () => {
                dismissToast(toast);
                approveJoiner(peerId);
            };
            // 拒绝按钮
            toast.querySelector('.rtc-toast-reject').onclick = () => {
                dismissToast(toast);
                rejectJoiner(peerId);
            };
            // 关闭按钮
            toast.querySelector('.rtc-toast-close').onclick = () => dismissToast(toast);

            toastContainer.appendChild(toast);

            // 12秒后自动消失
            setTimeout(() => {
                if (toast.parentNode) dismissToast(toast);
            }, 12000);
        }

        function dismissToast(toastEl) {
            if (!toastEl || !toastEl.parentNode) return;
            toastEl.style.animation = 'rtc-toast-out .25s ease-in forwards';
            setTimeout(() => {
                if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
            }, 260);
        }

        // 最大化状态
        let isMaximized = false;
        let savedBounds = null;

        // 拖拽功能
        let dragState = null;
        function startDrag(e) {
            if (isMaximized) return;
            if (e.target.closest('.rtc-header-btn')) return;
            const rect = panel.getBoundingClientRect();
            dragState = {
                startX: e.clientX,
                startY: e.clientY,
                origLeft: rect.left,
                origTop: rect.top,
                origW: rect.width,
                origH: rect.height
            };
            e.preventDefault();
        }
        function onDrag(e) {
            if (!dragState) return;
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            let newLeft = dragState.origLeft + dx;
            let newTop = dragState.origTop + dy;
            // 边界约束
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 60));
            newLeft = Math.max(-dragState.origW + 80, Math.min(newLeft, window.innerWidth - 80));
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
            panel.style.right = 'auto';
            panel.style.transform = 'none';
            syncResizeLayer();
        }
        function endDrag() { dragState = null; }

        // 自由拉伸功能（8 方向）
        let resizeState = null;
        const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
        const resizeLayer = createElement('div', { className: 'rtc-resize-layer' });
        RESIZE_DIRS.forEach(dir => {
            const h = createElement('div', { className: 'rtc-resize-handle rtc-rz-' + dir });
            h.dataset.dir = dir;
            h.addEventListener('mousedown', (e) => startResize(e, dir));
            resizeLayer.appendChild(h);
        });
        document.body.appendChild(resizeLayer);

        function syncResizeLayer() {
            if (panel.style.display === 'none' || isMaximized) { resizeLayer.style.display = 'none'; return; }
            resizeLayer.style.display = '';
            const r = panel.getBoundingClientRect();
            resizeLayer.style.left = r.left + 'px';
            resizeLayer.style.top = r.top + 'px';
            resizeLayer.style.width = r.width + 'px';
            resizeLayer.style.height = r.height + 'px';
        }

        function startResize(e, dir) {
            if (isMaximized) return;
            e.preventDefault();
            e.stopPropagation();
            const r = panel.getBoundingClientRect();
            resizeState = {
                dir,
                startX: e.clientX,
                startY: e.clientY,
                origLeft: r.left,
                origTop: r.top,
                origW: r.width,
                origH: r.height
            };
        }

        function onResize(e) {
            if (!resizeState) return;
            const d = resizeState;
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            let newLeft = d.origLeft;
            let newTop = d.origTop;
            let newW = d.origW;
            let newH = d.origH;
            const minW = 300, minH = 360;
            if (d.dir.indexOf('e') !== -1) newW = Math.max(minW, d.origW + dx);
            if (d.dir.indexOf('s') !== -1) newH = Math.max(minH, d.origH + dy);
            if (d.dir.indexOf('w') !== -1) {
                newW = Math.max(minW, d.origW - dx);
                newLeft = d.origLeft + (d.origW - newW);
            }
            if (d.dir.indexOf('n') !== -1) {
                newH = Math.max(minH, d.origH - dy);
                newTop = d.origTop + (d.origH - newH);
            }
            // 边界约束
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 40));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 40));
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
            panel.style.right = 'auto';
            panel.style.width = newW + 'px';
            panel.style.height = newH + 'px';
            panel.style.transform = 'none';
            syncResizeLayer();
        }

        function endResize() { resizeState = null; }

        function toggleMaximize() {
            if (!isMaximized) {
                // 保存当前位置尺寸
                const rect = panel.getBoundingClientRect();
                savedBounds = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
                // 最大化：撑满屏幕（无间距）
                panel.style.top = '0';
                panel.style.left = '0';
                panel.style.right = '0';
                panel.style.bottom = '0';
                panel.style.width = '100vw';
                panel.style.height = '100vh';
                panel.style.maxHeight = 'none';
                panel.style.minWidth = '0';
                panel.style.minHeight = '0';
                panel.style.borderRadius = '0';
                panel.style.transform = 'none';
                isMaximized = true;
            } else {
                // 还原
                if (savedBounds) {
                    panel.style.top = savedBounds.top + 'px';
                    panel.style.left = savedBounds.left + 'px';
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                    panel.style.width = savedBounds.width + 'px';
                    panel.style.height = savedBounds.height + 'px';
                    panel.style.maxHeight = '';
                    panel.style.minWidth = '';
                    panel.style.minHeight = '';
                    panel.style.borderRadius = '';
                    panel.style.transform = 'none';
                }
                isMaximized = false;
            }
            render();
            syncResizeLayer();
        }

        function render() {
            panel.innerHTML = '';

            // Header（可拖拽）
            const header = createElement('div', { className: 'rtc-header' });
            header.innerHTML = '<span class="rtc-header-title">实时协作</span>' +
                '<div class="rtc-header-btns">' +
                '<button class="rtc-header-btn" title="最小化">−</button>' +
                '<button class="rtc-header-btn" title="' + (isMaximized ? '还原' : '最大化') + '">' + (isMaximized ? '❐' : '□') + '</button>' +
                '<button class="rtc-header-btn" title="关闭">×</button></div>';
            panel.appendChild(header);

            // 拖拽事件
            header.addEventListener('mousedown', startDrag);
            header.querySelector('[title="最小化"]').onclick = () => { panel.style.display = 'none'; syncResizeLayer(); };
            header.querySelector('[title="' + (isMaximized ? '还原' : '最大化') + '"]').onclick = toggleMaximize;
            header.querySelector('[title="关闭"]').onclick = closePanel;

            const body = createElement('div', { className: 'rtc-body' });
            panel.appendChild(body);

            // Alpha 警告
            body.innerHTML += '<div class="rtc-alpha-banner">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
                '<span><strong>Alpha</strong> 警告：此功能处于早期开发阶段。你的项目可能会损坏或出错。使用风险自负。</span></div>';

            if (!peer || !roomId) {
                renderLanding(body);
            } else {
                renderConnected(body);
            }
        }

        // ─── 连接设置面板 ───
        let settingsOverlay = null;

        function showSettings() {
            if (settingsOverlay) { closeSettings(); return; }
            const cfg = serverConfig;

            settingsOverlay = createElement('div', { className: 'rtc-settings-overlay' });

            const dialog = createElement('div', { className: 'rtc-settings-dialog' });

            // Header
            const hdr = createElement('div', { className: 'rtc-settings-header' });
            hdr.innerHTML = '<div class="rtc-settings-header-title">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' +
                '<span>连接设置</span></div>';
            const closeBtn = createElement('button', { className: 'rtc-settings-close', textContent: '×' });
            closeBtn.onclick = () => closeSettings();
            hdr.appendChild(closeBtn);
            dialog.appendChild(hdr);

            // Body
            const body = createElement('div', { className: 'rtc-settings-body' });
            body.innerHTML = '<div class="rtc-settings-subtitle">PeerJS 服务器配置</div>';

            // 主机
            body.appendChild(createElement('label', { className: 'rtc-settings-label', textContent: '主机' }));
            const hostInput = createElement('input', { className: 'rtc-settings-input', value: cfg.host, placeholder: 'peerjs.com' });
            body.appendChild(hostInput);

            // 端口
            body.appendChild(createElement('label', { className: 'rtc-settings-label', textContent: '端口' }));
            const portInput = createElement('input', { className: 'rtc-settings-input', value: String(cfg.port), placeholder: '443', type: 'number' });
            body.appendChild(portInput);

            // 密钥
            body.appendChild(createElement('label', { className: 'rtc-settings-label', textContent: '密钥' }));
            const keyInput = createElement('input', { className: 'rtc-settings-input', value: cfg.key || '', placeholder: '（可选）' });
            body.appendChild(keyInput);

            // 路径
            body.appendChild(createElement('label', { className: 'rtc-settings-label', textContent: '路径' }));
            const pathInput = createElement('input', { className: 'rtc-settings-input', value: cfg.path || '/', placeholder: '/' });
            body.appendChild(pathInput);

            // 安全连接 checkbox
            const cbRow = createElement('label', { className: 'rtc-settings-checkbox-row' });
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = cfg.secure !== false;
            cbRow.appendChild(cb);
            cbRow.appendChild(createElement('span', { className: 'rtc-settings-checkbox-label', textContent: '安全连接（HTTPS/WSS）' }));
            body.appendChild(cbRow);

            dialog.appendChild(body);

            // Footer
            const footer = createElement('div', { className: 'rtc-settings-footer' });
            const cancelBtn = createElement('button', { className: 'rtc-settings-btn-cancel', textContent: '取消' });
            cancelBtn.onclick = () => closeSettings();
            footer.appendChild(cancelBtn);
            const saveBtn = createElement('button', { className: 'rtc-settings-btn-save', textContent: '保存设置' });
            saveBtn.onclick = () => {
                const portVal = parseInt(portInput.value, 10);
                saveServerConfig({
                    host: hostInput.value.trim() || 'peerjs.com',
                    port: (portVal > 0 && portVal <= 65535) ? portVal : 443,
                    key: keyInput.value.trim(),
                    path: pathInput.value.trim() || '/',
                    secure: cb.checked
                });
                closeSettings();
                alert('设置已保存。下次创建/加入房间时生效。\n\n当前已连接的房间不受影响。');
            };
            footer.appendChild(saveBtn);
            dialog.appendChild(footer);

            settingsOverlay.appendChild(dialog);

            // 点击遮罩关闭
            settingsOverlay.addEventListener('click', (e) => {
                if (e.target === settingsOverlay) closeSettings();
            });

            document.body.appendChild(settingsOverlay);
        }

        function closeSettings() {
            if (settingsOverlay && settingsOverlay.parentNode) {
                settingsOverlay.parentNode.removeChild(settingsOverlay);
            }
            settingsOverlay = null;
        }

        function renderLanding(body) {
            // 标题栏
            const secTitle = createElement('div', { className: 'rtc-section-title' });
            secTitle.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>实时协作' +
                '<span class="rtc-settings-badge"><button title="连接设置">⚙</button></span>';
            body.appendChild(secTitle);
            // 绑定设置按钮
            secTitle.querySelector('.rtc-settings-badge button').onclick = (e) => { e.stopPropagation(); showSettings(); };

            // 用户名
            const unameRow = createElement('div', { className: 'rtc-username-row' });
            unameRow.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
                '<span>你的用户名是: <strong>' + escapeHtml(username) + '</strong></span>';
            body.appendChild(unameRow);

            // 加入房间
            body.appendChild(createElement('div', { className: 'rtc-field-label', textContent: '加入现有房间' }));
            const joinInput = createElement('input', { className: 'rtc-input', placeholder: '输入房间ID...' });
            body.appendChild(joinInput);
            const joinBtn = createElement('button', { className: 'rtc-btn rtc-btn-primary', textContent: '加入房间' });
            body.appendChild(joinBtn);
            const joinHint = createElement('div', { className: 'rtc-hint' });
            joinHint.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
                '<span>房主可以看到您的 IP 地址，其他成员不能。</span>';
            body.appendChild(joinHint);

            joinBtn.onclick = () => {
                const id = joinInput.value.trim();
                if (!id) return alert('请输入房间ID');
                connecting = true;
                render();
                joinRoom(id);
            };
            joinInput.onkeydown = (e) => { if (e.key === 'Enter') joinBtn.click(); };

            // 分隔线
            body.appendChild(createElement('hr', { className: 'rtc-divider' }));

            // 创建新房间
            body.appendChild(createElement('div', { className: 'rtc-field-label', textContent: '创建新房间' }));
            const createInput = createElement('input', { className: 'rtc-input', placeholder: '设置房间ID（留空自动生成）' });
            body.appendChild(createInput);
            const createBtn = createElement('button', { className: 'rtc-btn rtc-btn-outline', textContent: '创建新房间' });
            body.appendChild(createBtn);
            const createHint = createElement('div', { className: 'rtc-hint' });
            createHint.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
                '<span>加入的人可以看到您的 IP 地址，您也可以看到他们的。</span>';
            body.appendChild(createHint);

            createBtn.onclick = () => {
                connecting = true;
                render();
                const id = createInput.value.trim();
                createRoom(id || null);
            };

            // 连接中提示
            if (connecting) {
                const loading = createElement('div', { className: 'rtc-loading' });
                loading.innerHTML = '<div class="rtc-spinner"></div><span>正在连接信令服务器…</span>';
                body.appendChild(loading);
            }

            // 初始化错误提示（内联，不弹 alert 阻塞）
            if (initError && !connecting) {
                const errBox = createElement('div', { className: 'rtc-banner err' });
                errBox.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
                    '<span>' + escapeHtml(initError).replace(/\n/g, '<br>') + '</span>';
                body.appendChild(errBox);

                const retryBtn = createElement('button', { className: 'rtc-btn rtc-btn-primary', textContent: '🔄 重试连接' });
                retryBtn.style.marginTop = '8px';
                retryBtn.onclick = () => {
                    initError = '';
                    connecting = true;
                    render();
                    // 重新触发上一次的操作（创建或加入）
                    // 通过记录 lastAction 来决定重做什么
                    if (lastAction === 'create') {
                        createRoom(lastActionId || null);
                    } else if (lastAction === 'join' && lastActionId) {
                        joinRoom(lastActionId);
                    } else {
                        // 没有记录的操作，仅初始化 peer
                        initPeer().then(() => { connecting = false; render(); });
                    }
                };
                body.appendChild(retryBtn);
            }
        }

        function renderConnected(body) {
            connecting = false; // 已进入连接视图，清除加载态
            // 连接异常状态条
            if (connState !== 'ok') {
                const bannerCls = connState === 'reconnecting' ? 'warn' : (connState === 'disconnected' ? 'warn' : 'err');
                const banner = createElement('div', { className: 'rtc-banner ' + bannerCls });
                if (connState === 'reconnecting') {
                    banner.innerHTML = '<div class="rtc-banner-spin"></div><span>' + escapeHtml(connStateMsg || '连接中断，正在重连...') + '</span>';
                } else {
                    banner.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
                        '<span>' + escapeHtml(connStateMsg || '连接异常') + '</span>';
                }
                body.appendChild(banner);
            } else if (editingBannerName) {
                // 远程编辑提示条
                const eb = createElement('div', { className: 'rtc-banner editing' });
                eb.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
                    '<span><strong>' + escapeHtml(editingBannerName) + '</strong> 正在编辑工作区…</span>';
                body.appendChild(eb);
            }
            // 房间信息
            const roomInfo = createElement('div', { className: 'rtc-section-title' });
            roomInfo.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2"><path d="M21 15a2 2 0 01-2 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' +
                '<span class="rtc-room-name">房间:' + escapeHtml(roomId) + (roomAlias ? '（' + escapeHtml(roomAlias) + '）' : '') + '</span>';
            body.appendChild(roomInfo);

            // 连接状态 + 信令服务器
            const infoRow = createElement('div', { className: 'rtc-conn-info' });
            const peerCount = Object.keys(connections).length + 1;
            infoRow.innerHTML = '<span class="rtc-status-dot"></span>' +
                '<span>' + (peerCount) + ' 位在线</span>' +
                '<span class="rtc-server-tag" title="当前信令服务器">🔗 ' + escapeHtml(currentServerHost || '—') + '</span>';
            body.appendChild(infoRow);

            // 房主：显示可复制的房间ID（加入者凭此加入）
            if (isHost) {
                const idWrap = createElement('div', { className: 'rtc-room-id-box' });
                const idLabel = createElement('div', { className: 'rtc-room-id-label', textContent: '房间ID（分享给协作者）' });
                idWrap.appendChild(idLabel);
                const idInput = createElement('input', { className: 'rtc-input', value: roomId, readonly: true });
                idWrap.appendChild(idInput);
                const idCopyBtn = createElement('button', { className: 'rtc-btn rtc-btn-outline', textContent: '📋 复制房间ID', style: 'margin-top:6px;' });
                idCopyBtn.onclick = () => {
                    navigator.clipboard.writeText(roomId).then(() => {
                        idCopyBtn.textContent = '✓ 已复制';
                        setTimeout(() => { idCopyBtn.textContent = '📋 复制房间ID'; }, 2000);
                    }).catch(() => { idInput.select(); document.execCommand && document.execCommand('copy'); });
                };
                idWrap.appendChild(idCopyBtn);
                body.appendChild(idWrap);
            }

            // 已连接用户
            body.appendChild(createElement('div', { className: 'rtc-users-title', textContent: '已连接用户' }));

            const usersList = createElement('div');
            // 自己
            usersList.appendChild(renderUserItem(username, true, true));
            // 其他用户
            Object.values(connections).forEach(c => {
                if (c.metadata && c.metadata.username) {
                    usersList.appendChild(renderUserItem(c.metadata.username, c.metadata.isHost || false, false));
                }
            });
            body.appendChild(usersList);

            // 聊天
            body.appendChild(createElement('hr', { className: 'rtc-divider' }));
            body.appendChild(createElement('div', { className: 'rtc-chat-title', textContent: '聊天' }));

            const chatBox = createElement('div', { className: 'rtc-chat-box' });
            chatMessages.forEach(m => {
                const msgEl = createElement('div', { className: 'rtc-chat-msg' });
                msgEl.innerHTML = '<span class="rtc-chat-msg-name">' + escapeHtml(m.name) + '</span>: ' + escapeHtml(m.text);
                chatBox.appendChild(msgEl);
            });
            body.appendChild(chatBox);
            chatBoxEl = chatBox;   // 保存引用，供增量追加使用
            // 自动滚动到底部
            chatBox.scrollTop = chatBox.scrollHeight;

            const chatWrap = createElement('div', { className: 'rtc-chat-input-wrap' });
            const chatInput = createElement('input', { className: 'rtc-chat-input', placeholder: '输入消息… (按 Enter 发送)' });
            const chatSendBtn = createElement('button', { className: 'rtc-btn rtc-btn-primary', textContent: '发送', style: 'width:auto;padding:8px 16px;margin-top:0;' });
            chatWrap.appendChild(chatInput);
            chatWrap.appendChild(chatSendBtn);
            body.appendChild(chatWrap);

            const doSend = () => {
                const text = chatInput.value.trim();
                if (!text) return;
                addChatMessage(username, text);
                broadcast({ type: 'chat', name: username, text: text });
                chatInput.value = '';
                render(); // 刷新聊天显示
            };
            chatSendBtn.onclick = doSend;
            chatInput.onkeydown = (e) => { if (e.key === 'Enter') doSend(); };

            // 房主：待审批列表（私人房间）
            if (isHost && Object.keys(pendingJoiners).length > 0) {
                body.appendChild(createElement('hr', { className: 'rtc-divider' }));
                body.appendChild(createElement('div', { className: 'rtc-privacy-title', textContent: '待审批加入请求' }));
                Object.keys(pendingJoiners).forEach(pid => {
                    const meta = (connections[pid] && connections[pid].metadata) || {};
                    const name = meta.username || '匿名用户';
                    const item = createElement('div', { className: 'rtc-privacy-option' });
                    item.innerHTML = '<div class="rtc-privacy-opt-name">👤 ' + escapeHtml(name) + '</div><div class="rtc-privacy-opt-desc">请求加入房间</div>';
                    const btnRow = createElement('div', { style: 'display:flex;gap:8px;margin-top:8px;' });
                    const okBtn = createElement('button', { className: 'rtc-btn rtc-btn-primary', textContent: '✓ 同意', style: 'margin-top:0;' });
                    const noBtn = createElement('button', { className: 'rtc-btn rtc-btn-danger', textContent: '✕ 拒绝', style: 'margin-top:0;' });
                    okBtn.onclick = () => approveJoiner(pid);
                    noBtn.onclick = () => rejectJoiner(pid);
                    btnRow.appendChild(okBtn);
                    btnRow.appendChild(noBtn);
                    item.appendChild(btnRow);
                    body.appendChild(item);
                });
            }

            // 房主：隐私设置
            if (isHost) {
                body.appendChild(createElement('hr', { className: 'rtc-divider' }));
                body.appendChild(createElement('div', { className: 'rtc-privacy-title', textContent: '房间隐私设置' }));

                const pubOpt = createElement('div', { className: 'rtc-privacy-option' + (privacy === 'public' ? ' active' : '') });
                pubOpt.innerHTML = '<div class="rtc-privacy-opt-name">公开房间</div><div class="rtc-privacy-opt-desc">任何人都可以加入此房间，无需批准</div>';
                pubOpt.onclick = () => { privacy = 'public'; broadcast({ type: 'privacy', value: 'public' }); render(); };
                body.appendChild(pubOpt);

                const privOpt = createElement('div', { className: 'rtc-privacy-option' + (privacy === 'private' ? ' active' : '') });
                privOpt.innerHTML = '<div class="rtc-privacy-opt-name">私人房间</div><div class="rtc-privacy-opt-desc">用户必须请求批准才能加入此房间</div>';
                privOpt.onclick = () => { privacy = 'private'; broadcast({ type: 'privacy', value: 'private' }); render(); };
                body.appendChild(privOpt);
            }

            // 底部按钮
            body.appendChild(createElement('hr', { className: 'rtc-divider' }));
            const copyBtn = createElement('button', { className: 'rtc-btn rtc-btn-primary', textContent: '📋 复制房间URL以分享' });
            copyBtn.onclick = () => {
                const url = location.origin + location.pathname + '#rtc=' + roomId;
                navigator.clipboard.writeText(url).then(() => {
                    copyBtn.textContent = '✓ 已复制';
                    setTimeout(() => { copyBtn.textContent = '📋 复制房间URL以分享'; }, 2000);
                }).catch(() => {
                    prompt('复制此链接分享给协作者:', url);
                });
            };
            body.appendChild(copyBtn);

            const leaveBtn = createElement('button', { className: 'rtc-btn rtc-btn-danger', textContent: '离开房间' });
            leaveBtn.onclick = leaveRoom;
            body.appendChild(leaveBtn);
        }

        function renderUserItem(name, isHostFlag, isYou) {
            const item = createElement('div', { className: 'rtc-user-item' + (isHostFlag ? ' host' : '') + (isYou ? ' self' : '') });
            let icon = '👤';
            if (isHostFlag) icon = '👑';
            item.innerHTML = '<span class="rtc-user-icon">' + icon + '</span>' +
                '<span class="rtc-user-name">' + escapeHtml(name) + '</span>' +
                '<span class="rtc-badges">' +
                (isHostFlag ? '<span class="rtc-badge rtc-badge-host">房主</span>' : '') +
                (isYou ? '<span class="rtc-badge rtc-badge-you">你</span>' : '') +
                '</span>';
            return item;
        }

        // ─── PeerJS / WebRTC 核心 ───
        let currentServerIndex = 0;  // 当前使用的信令服务器索引

        async function initPeer() {
            if (peer) return peer;
            try {
                // 动态加载 PeerJS（多 CDN 回退，国内网络兼容）
                if (typeof window.Peer === 'undefined') {
                    console.log('[RTC] 正在加载 PeerJS 库...');
                    const PEERJS_CDNS = [
                        'https://cdn.jsdelivr.net/npm/peerjs@1.5.2/dist/peerjs.min.js',
                        'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.2/peerjs.min.js',
                        'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'
                    ];
                    let loaded = false;
                    for (const cdn of PEERJS_CDNS) {
                        try {
                            await loadScript(cdn);
                            if (typeof window.Peer !== 'undefined') { loaded = true; break; }
                        } catch(e) { console.warn('[RTC] CDN 加载失败:', cdn, e.message); }
                    }
                    if (!loaded) throw new Error('PeerJS 库加载失败（所有 CDN 均不可达）。请检查网络连接。');
                    console.log('[RTC] PeerJS 库加载完成');
                }

                // 构建服务器列表：用户配置优先，然后是内置备选（去重，避免重复尝试同一主机）
                const cfg = serverConfig;
                const servers = [];
                const userSrv = { host: cfg.host || '0.peerjs.com', port: cfg.port || 443, path: cfg.path || '/', key: cfg.key || undefined, secure: cfg.secure !== false };
                servers.push(userSrv);
                PEERJS_SERVERS.forEach(s => {
                    if (s.host !== userSrv.host) servers.push(s);
                });

                // 按优先级尝试各个信令服务器
                for (let i = 0; i < servers.length; i++) {
                    const srv = servers[i];
                    try {
                        const peerOpts = {
                            debug: 1,
                            host: srv.host,
                            port: srv.port,
                            path: srv.path,
                            secure: srv.secure !== false,  // 显式声明，避免 PeerJS 协议推断错误（http/https 混用导致 ID 接口 CORS 失败）
                            config: { iceServers: ICE_SERVERS }
                        };
                        if (srv.key) peerOpts.key = srv.key;

                        console.log('[RTC] 尝试连接信令服务器:', srv.host + ':' + srv.port + ' (secure=' + peerOpts.secure + ')');
                        peer = new window.Peer(peerOpts);

                        // 用 Promise 包装连接，设置超时
                        const connected = await Promise.race([
                            new Promise((resolve, reject) => {
                                peer.on('open', (id) => {
                                    myPeerId = id;
                                    currentServerIndex = i;
                                    currentServerHost = srv.host;
                                    console.log('[RTC] ✓ Peer 连接成功! Peer ID:', id, '服务器:', srv.host);
                                    resolve(id);
                                });
                                peer.on('error', (err) => {
                                    console.error('[RTC] ✗ Peer 错误:', err.type, err);
                                    reject(err);
                                });
                            }),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('信令服务器连接超时（8秒）')), 8000)
                            )
                        ]);

                        // 连接成功，设置事件监听
                        setupPeerEvents();
                        initError = '';  // 清除之前的错误
                        return peer;

                    } catch (e) {
                        console.warn('[RTC] 服务器 ' + srv.host + ' 失败:', e && e.message);
                        if (peer) {
                            try { peer.destroy(); } catch(ex) {}
                            peer = null;
                        }
                        // 继续尝试下一个服务器
                    }
                }

                // 所有服务器都失败
                throw new Error('所有信令服务器均无法连接。请检查网络或防火墙设置。');

            } catch (e) {
                console.error('[RTC] 初始化失败:', e);
                initError = (e && e.message ? e.message : String(e)) +
                    '\n\n可能原因:\n1. 网络无法访问 PeerJS 信令服务器或 CDN\n2. 防火墙阻止了 WebSocket 连接\n3. 公司/学校网络限制了 P2P 连接';
                render();
                return null;
            }
        }

        function setupPeerEvents() {
            if (!peer) return;
            peer.on('connection', (conn) => {
                console.log('[RTC] 收到新连接请求:', conn.peer);
                handleConnection(conn);
            });
            peer.on('disconnected', () => {
                console.warn('[RTC] 与信令服务器断开连接，尝试重连...');
                connState = 'reconnecting';
                connStateMsg = '连接中断，正在重连信令服务器...';
                render();
                // 尝试重连
                setTimeout(() => {
                    if (peer && !peer.destroyed) {
                        peer.reconnect();
                    }
                }, 3000);
            });
            peer.on('open', () => {
                // 重连成功后恢复状态
                if (connState !== 'ok') {
                    connState = 'ok';
                    connStateMsg = '';
                    render();
                }
            });
            peer.on('close', () => {
                console.log('[RTC] Peer 连接已关闭');
            });
        }

        function loadScript(src) {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }

        async function createRoom(roomIdToUse) {
            lastAction = 'create'; lastActionId = roomIdToUse || '';
            const p = await initPeer();
            if (!p) return;
            await new Promise((resolve) => { p.open ? resolve() : p.on('open', resolve); });

            // 关键修正：房间ID 必须使用 PeerJS 分配的真实 peerId，
            // 否则加入者 p.connect(roomId) 找不到房主。
            roomId = myPeerId;
            roomAlias = roomIdToUse || '';   // 自定义ID仅作备注展示，不参与连接
            isHost = true;
            privacy = 'public';
            chatMessages = [];
            loadChatHistory();

            console.log('[RTC] 房间已创建! RoomId:', roomId, 'Alias:', roomAlias, 'MyPeerId:', myPeerId);

            // 把当前工作区 XML 记录为初始状态
            try { pendingXml = getWorkspaceXml(); } catch(e) {}

            startCursorMonitor();
            startHeartbeat();
            render();
            console.log('[RTC] 房间创建完成，等待他人加入...');
        }

        async function joinRoom(id) {
            lastAction = 'join'; lastActionId = id;
            const p = await initPeer();
            if (!p) return;
            await new Promise((resolve) => { p.open ? resolve() : p.on('open', resolve); });

            roomId = id;
            isHost = false;
            chatMessages = [];
            loadChatHistory();

            console.log('[RTC] 正在加入房间:', id, '我的PeerId:', myPeerId);

            // 连接房主（房主的真实 peerId 即房间ID）
            const conn = p.connect(id, { reliable: true });

            // 连接层级的即时错误反馈（peer-unavailable 等）
            conn.on('error', (err) => {
                console.error('[RTC] 连接失败:', err.type, err);
                connecting = false;
                if (err.type === 'peer-unavailable') {
                    alert('无法加入：房间不存在或房主已离线。\n\n请确认房间ID正确，且房主当前在线。');
                } else {
                    alert('连接出错：' + (err.type || '未知错误') + '\n请重试或检查网络连接。');
                }
                // 重置未连接状态
                setTimeout(() => {
                    if (Object.keys(connections).length === 0 && !isHost) {
                        roomId = '';
                        render();
                    }
                }, 300);
            });

            conn.on('open', () => { connecting = false; });

            handleConnection(conn);

            // 超时提示：若 10 秒未连上，给出明确错误并回到可重试界面
            setTimeout(() => {
                connecting = false;
                if (peer && roomId === id && Object.keys(connections).length === 0 && !isHost) {
                    console.error('[RTC] 加入房间超时:', id);
                    alert('连接超时：未能建立与房主的连接。\n\n可能原因:\n1. 房间ID错误或房主已离线\n2. 网络防火墙阻止了 P2P 连接\n3. 双方 NAT 类型不兼容\n\n建议：双方使用同一网络或手机热点测试。');
                    roomId = '';
                    render();
                }
            }, 10000);

            startCursorMonitor();
            render();
        }

        function handleConnection(conn) {
            console.log('[RTC] handleConnection 开始, 目标:', conn.peer);

            // 监听 ICE 连接状态变化（用于诊断）
            conn.on('iceStateChange', (state) => {
                console.log('[RTC] ICE 状态变化 (' + conn.peer + '):', state);
            });

            // 监听底层 DataChannel 的信号状态
            if (conn.peerConnection) {
                conn.peerConnection.oniceconnectionstatechange = () => {
                    const state = conn.peerConnection.iceConnectionState;
                    console.log('[RTC] WebRTC ICE Connection State (' + conn.peer + '):', state);
                    if (state === 'failed' || state === 'disconnected') {
                        alert('P2P 连接失败（ICE 状态: ' + state + '）。\n\n这通常意味着网络无法建立直连。\n建议：\n- 检查防火墙设置\n- 尝试使用相同网络\n- 使用手机热点测试');
                    }
                };
            }

            conn.on('open', () => {
                console.log('[RTC] ✓ 连接已建立! 对方:', conn.peer);

                // 发送自己的用户信息（房主据此判断是否需要审批）
                conn.send(JSON.stringify({
                    type: 'user-info',
                    username: username,
                    isHost: isHost
                }));

                if (isHost) {
                    // 房主侧：记录连接，等待加入者发 join-request
                    connections[conn.peer] = { conn, metadata: {} };
                    if (privacy === 'private' && !approvedMembers[conn.peer]) {
                        // 私人房间：暂不放行，要求加入者发起审批请求
                        pendingJoiners[conn.peer] = { conn };
                        conn.send(JSON.stringify({ type: 'join-need-approval', host: username }));
                        render(); // 刷新审批列表
                    } else {
                        // 公开房间：直接同步
                        approvedMembers[conn.peer] = true;
                        sendWorkspaceToPeer(conn);
                    }
                } else {
                    // 加入者侧：先记录房主连接（否则收到 join-approve 后找不到 conn 发 request-xml）
                    connections[conn.peer] = { conn, metadata: { isHost: true } };
                    // 请求加入（房主决定是否需要审批）
                    conn.send(JSON.stringify({ type: 'join-request', username: username }));
                }

                // 连接成功后启动工作区同步（仅一次；加入者仅在被批准后启用）
                if (isHost) {
                    ensureWorkspaceSync();
                } else {
                    // 加入者：收到 join-approve 后才启用同步
                }

                render();
            });

            conn.on('data', (data) => {
                try {
                    const msg = typeof data === 'string' ? JSON.parse(data) : data;
                    handleMessage(msg, conn.peer);
                } catch(e) {
                    console.warn('[RTC] Invalid message:', e);
                }
            });

            conn.on('close', () => {
                console.log('[RTC] Connection closed:', conn.peer);
                removeRemoteCursor(conn.peer);
                delete connections[conn.peer];
                delete pendingJoiners[conn.peer];
                delete approvedMembers[conn.peer];
                render();
            });

            conn.on('error', (err) => {
                console.error('[RTC] Connection error:', err);
            });
        }

        function handleMessage(msg, fromPeerId) {
            switch (msg.type) {
                case 'user-info':
                    if (connections[fromPeerId]) {
                        connections[fromPeerId].metadata = msg;
                    }
                    // 房主作为中继：把新成员信息转发给其他人
                    if (isHost) relay(msg, fromPeerId);
                    render();
                    break;

            case 'join-request':
                    console.log('[RTC] 收到加入请求:', msg.username, fromPeerId);
                    if (isHost) {
                        // 标记待审批
                        if (connections[fromPeerId]) connections[fromPeerId].metadata = connections[fromPeerId].metadata || {};
                        pendingJoiners[fromPeerId] = { conn: (connections[fromPeerId] && connections[fromPeerId].conn) || null };
                        // 触发右下角 Toast 通知
                        showJoinRequestToast(fromPeerId, msg.username || '匿名用户');
                        render(); // 刷新审批列表
                    }
                    break;

                case 'join-need-approval':
                    // 加入者收到：等待房主审批
                    console.log('[RTC] 房主要求审批，等待批准...');
                    if (!isHost) {
                        connState = 'reconnecting';
                        connStateMsg = '已连接到房主，等待审批...';
                        render();
                    }
                    break;

                case 'join-approve':
                    // 加入者收到：正式加入，请求工作区
                    console.log('[RTC] 加入已批准');
                    if (!isHost) {
                        connState = 'ok';
                        connStateMsg = '';
                        approvedMembers[fromPeerId] = true;
                        const c = connections[fromPeerId];
                        if (c && c.conn) {
                            c.conn.send(JSON.stringify({ type: 'request-xml' }));
                        }
                        ensureWorkspaceSync();
                    }
                    break;

                case 'join-reject':
                    // 加入者收到：被拒绝
                    if (!isHost) {
                        connState = 'err';
                        connStateMsg = '房主拒绝了您的加入请求';
                        setTimeout(() => {
                            leaveRoom();
                        }, 1500);
                    }
                    break;

                case 'chat':
                    addChatMessage(msg.name || '未知', msg.text || '');
                    // 房主作为中继：把聊天转发给其他人
                    if (isHost) relay(msg, fromPeerId);
                    render();
                    break;

                case 'workspace-xml':
                    if (msg.from !== myPeerId) {
                        suppressBroadcast = true;
                        try {
                            // msg.xml 是字符串（domToText 产物），需解析回 DOM 节点再应用
                            let xmlDom = msg.xml;
                            if (typeof xmlDom === 'string') {
                                const parser = new DOMParser();
                                xmlDom = parser.parseFromString(xmlDom, 'text/xml').documentElement;
                            }
                            setWorkspaceXml(xmlDom);
                        } catch(e) {}
                        setTimeout(() => { suppressBroadcast = false; }, 500);
                        // 远程编辑提示：显示「X 正在编辑」
                        const editorName = (connections[fromPeerId] && connections[fromPeerId].metadata && connections[fromPeerId].metadata.username) || '协作者';
                        showEditingBanner(editorName);
                    }
                    // 房主作为中继：把工作区变更转发给其他成员（排除发送者）
                    // 避免回声风暴：仅当此消息不是「已被中继过」的才转发
                    if (isHost && !msg.relayed) relay(msg, fromPeerId);
                    break;

                case 'request-xml':
                    if (isHost) {
                        const targetConn = connections[fromPeerId];
                        if (targetConn && targetConn.conn) {
                            sendWorkspaceToPeer(targetConn.conn);
                        }
                    }
                    break;

                case 'privacy':
                    privacy = msg.value || 'public';
                    if (privacy === 'public') {
                        // 切换为公开：放行所有已连接但未审批的成员
                        Object.keys(connections).forEach(pid => {
                            if (!approvedMembers[pid]) {
                                approvedMembers[pid] = true;
                                delete pendingJoiners[pid];
                                sendWorkspaceToPeer(connections[pid].conn);
                            }
                        });
                    }
                    // 房主作为中继：转发隐私设置
                    if (isHost) relay(msg, fromPeerId);
                    render();
                    break;

                case 'cursor':
                    if (msg.x != null && msg.y != null) {
                        const senderName = (connections[fromPeerId] && connections[fromPeerId].metadata && connections[fromPeerId].metadata.username) || '?';
                        updateRemoteCursor(fromPeerId, senderName, msg.x, msg.y);
                    }
                    // 房主作为中继：转发远程光标给其他成员
                    if (isHost) relay(msg, fromPeerId);
                    break; // 不触发 render（光标更新太频繁）

                default:
                    break;
            }
        }

        // 房主把当前工作区 XML 发给指定连接（用于审批通过 / 公开放行）
        function sendWorkspaceToPeer(targetConn) {
            if (!targetConn) return;
            try {
                const xml = getWorkspaceXml();
                // 关键修复：workspaceToDom 返回的是 DOM 节点，JSON.stringify 会把它序列化成 {}，
                // 导致接收方 domToWorkspace({}) 无效、完全无法同步（各编各的）。
                // 必须先用 domToText 转成字符串再发送。
                const xmlStr = ctx.Blockly.Xml.domToText(xml);
                targetConn.send(JSON.stringify({ type: 'workspace-xml', xml: xmlStr, from: myPeerId }));
            } catch(e) {}
        }

        // 房主作为中继：把消息转发给除发送者外的所有其他成员（私人房间下跳过未审批者）
        function relay(msgObj, excludePeerId) {
            // 标记为「已被中继」，接收方（房主）不再二次转发，避免回声风暴
            const relayMsg = Object.assign({}, msgObj, { relayed: true });
            const data = JSON.stringify(relayMsg);
            Object.keys(connections).forEach(peerId => {
                if (peerId === excludePeerId) return;
                // 私人房间：未审批成员不参与同步链路（看不到他人活动）
                if (privacy === 'private' && !approvedMembers[peerId]) return;
                const c = connections[peerId];
                if (c && c.conn) {
                    try { c.conn.send(data); } catch(e) {}
                }
            });
        }

        function broadcast(msgObj) {
            const data = JSON.stringify(msgObj);
            Object.values(connections).forEach(c => {
                try { c.conn.send(data); } catch(e) {}
            });
        }

        // 房主批准/拒绝加入者
        function approveJoiner(peerId) {
            approvedMembers[peerId] = true;
            delete pendingJoiners[peerId];
            // 关闭对应的 Toast（如果存在）
            const toast = toastContainer.querySelector('[data-peer-id="' + peerId + '"]');
            if (toast) dismissToast(toast);
            const c = connections[peerId];
            if (c && c.conn) {
                c.conn.send(JSON.stringify({ type: 'join-approve', from: myPeerId }));
                sendWorkspaceToPeer(c.conn);
            }
            render();
        }
        function rejectJoiner(peerId) {
            const c = connections[peerId];
            if (c && c.conn) {
                try { c.conn.send(JSON.stringify({ type: 'join-reject', from: myPeerId })); } catch(e) {}
            }
            delete pendingJoiners[peerId];
            // 关闭对应的 Toast
            const toast = toastContainer.querySelector('[data-peer-id="' + peerId + '"]');
            if (toast) dismissToast(toast);
            render();
        }

        function broadcastUserInfo() {
            broadcast({ type: 'user-info', username: username, isHost: isHost });
        }

        // ─── Blockly 工作区同步 ───
        let workspaceChangeListener = null;

        function ensureWorkspaceSync() {
            if (wsSyncStarted) return;
            wsSyncStarted = true;
            try {
                const ws = ctx.getWorkspace ? ctx.getWorkspace() : null;
                if (!ws) { wsSyncStarted = false; return; }
                workspaceChangeListener = function(event) {
                    if (suppressBroadcast) return;
                    // 防抖：合并高频事件
                    if (workspaceChangeListener._raf) return;
                    workspaceChangeListener._raf = requestAnimationFrame(() => {
                        workspaceChangeListener._raf = null;
                        try {
                            const xml = getWorkspaceXml();
                            // DOM 节点必须转字符串才能经 JSON 传输
                            const xmlStr = ctx.Blockly.Xml.domToText(xml);
                            broadcast({ type: 'workspace-xml', xml: xmlStr, from: myPeerId });
                        } catch(e) {}
                    });
                };
                ws.addChangeListener(workspaceChangeListener);
            } catch(e) {
                wsSyncStarted = false;
                console.warn('[RTC] Cannot attach workspace listener:', e);
            }
        }

        function stopWorkspaceSync() {
            try {
                const ws = ctx.getWorkspace ? ctx.getWorkspace() : null;
                if (ws && workspaceChangeListener) {
                    ws.removeChangeListener(workspaceChangeListener);
                }
            } catch(e) {}
            workspaceChangeListener = null;
            wsSyncStarted = false;
        }

        // 房主定时心跳：周期性把最新工作区同步给所有成员，避免成员断连重连后状态不一致
        let heartbeatTimer = null;
        function startHeartbeat() {
            if (heartbeatTimer) return;
            heartbeatTimer = setInterval(() => {
                if (!isHost || !peer) return;
                try {
                    const xml = getWorkspaceXml();
                    const xmlStr = ctx.Blockly.Xml.domToText(xml);
                    broadcast({ type: 'workspace-xml', xml: xmlStr, from: myPeerId, relayed: true });
                } catch(e) {}
            }, 30000);
        }
        function stopHeartbeat() {
            if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
        }

        function getWorkspaceXml() {
            const ws = ctx.getWorkspace ? ctx.getWorkspace() : null;
            if (!ws) throw new Error('No workspace');
            return ctx.Blockly.Xml.workspaceToDom(ws);
        }

        function setWorkspaceXml(xmlDom) {
            const ws = ctx.getWorkspace ? ctx.getWorkspace() : null;
            if (!ws) return;
            // 序列化对比：若与当前工作区一致则跳过，避免无意义重建（清空选区/光标/闪烁）
            try {
                const cur = ctx.Blockly.Xml.workspaceToDom(ws);
                const curStr = ctx.Blockly.Xml.domToText(cur);
                const newStr = ctx.Blockly.Xml.domToText(xmlDom);
                if (curStr === newStr) return;
            } catch (e) {}

            ws.clear();
            ctx.Blockly.Xml.domToWorkspace(xmlDom, ws);
        }

        // ─── 聊天 ───
        // 增量追加单条消息节点到当前聊天框（不重建整面板，保证发送/接收即时可见）
        function appendChatNode(name, text) {
            if (!chatBoxEl || !chatBoxEl.parentNode) return; // 面板未渲染，交由 render() 全量重建兜底
            const msgEl = createElement('div', { className: 'rtc-chat-msg' });
            msgEl.innerHTML = '<span class="rtc-chat-msg-name">' + escapeHtml(name) + '</span>: ' + escapeHtml(text);
            chatBoxEl.appendChild(msgEl);
            // 自动滚动到底部
            chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
        }
        function addChatMessage(name, text) {
            chatMessages.push({ name, text, time: Date.now() });
            if (chatMessages.length > 200) chatMessages.shift(); // 限制历史
            saveChatHistory();
            // 增量显示（若面板已渲染）；render() 仍作为全量兜底
            appendChatNode(name, text);
        }
        function saveChatHistory() {
            if (!roomId) return;
            try {
                sessionStorage.setItem(STORAGE_PREFIX + 'chat_' + roomId, JSON.stringify(chatMessages));
            } catch(e) {}
        }
        function loadChatHistory() {
            if (!roomId) return;
            try {
                const raw = sessionStorage.getItem(STORAGE_PREFIX + 'chat_' + roomId);
                if (raw) {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) chatMessages = arr;
                }
            } catch(e) {}
        }
        function clearChatHistory() {
            try { sessionStorage.removeItem(STORAGE_PREFIX + 'chat_' + roomId); } catch(e) {}
        }

        // 远程编辑提示条（短暂显示「X 正在编辑」）
        function showEditingBanner(name) {
            editingBannerName = name;
            if (editingBannerTimer) clearTimeout(editingBannerTimer);
            editingBannerTimer = setTimeout(() => {
                editingBannerName = '';
                editingBannerTimer = null;
                render();
            }, 2500);
            render();
        }

        // ─── 远程光标 ───
        const cursorLayer = createElement('div', { className: 'rtc-cursor-layer' });
        const remoteCursors = {}; // { peerId: { el, name, x, y } }
        let lastCursorBroadcast = 0;
        document.body.appendChild(cursorLayer);

        function broadcastCursor(x, y) {
            const now = Date.now();
            if (now - lastCursorBroadcast < 50) return; // 节流 20fps
            lastCursorBroadcast = now;
            broadcast({ type: 'cursor', x: Math.round(x), y: Math.round(y) });
        }

        function updateRemoteCursor(peerId, name, x, y) {
            let rc = remoteCursors[peerId];
            if (!rc) {
                rc = {};
                rc.el = createElement('div', { className: 'rtc-remote-cursor' });
                rc.el.innerHTML = '<div class="rtc-remote-cursor-pointer"></div>' +
                    '<div class="rtc-remote-cursor-name">' + escapeHtml(name || '?') + '</div>';
                cursorLayer.appendChild(rc.el);
                remoteCursors[peerId] = rc;
            }
            rc.el.style.left = x + 'px';
            rc.el.style.top = y + 'px';
            rc.name = name;
            if (name) {
                const nameEl = rc.el.querySelector('.rtc-remote-cursor-name');
                if (nameEl) nameEl.textContent = name;
            }
        }

        function removeRemoteCursor(peerId) {
            const rc = remoteCursors[peerId];
            if (rc && rc.el && rc.el.parentNode) rc.el.parentNode.removeChild(rc.el);
            delete remoteCursors[peerId];
        }

        function clearAllRemoteCursors() {
            Object.keys(remoteCursors).forEach(removeRemoteCursor);
        }

        // 监听鼠标移动广播光标位置
        let cursorMonitorActive = false;
        function startCursorMonitor() {
            if (cursorMonitorActive) return;
            cursorMonitorActive = true;
            document.addEventListener('mousemove', onCursorMove);
            document.addEventListener('keydown', onHotkey);
        }
        function stopCursorMonitor() {
            cursorMonitorActive = false;
            document.removeEventListener('mousemove', onCursorMove);
            document.removeEventListener('keydown', onHotkey);
        }
        function onHotkey(e) {
            // 按 / 聚焦聊天输入框（仿原版 Scratch 协作）
            if (e.key === '/' && peer && roomId) {
                const tag = (e.target && e.target.tagName) || '';
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                const box = panel.querySelector('.rtc-chat-input');
                if (box) { e.preventDefault(); box.focus(); }
            }
        }
        function onCursorMove(e) {
            if (!roomId || !peer) return;
            broadcastCursor(e.clientX, e.clientY);
        }

        // ─── 工具函数 ───
        function generateRoomId() {
            const adjectives = ['快乐','聪明','勇敢','冷静','活泼','明亮','神秘','温暖','酷炫','闪电'];
            const nouns = ['熊猫','老虎','凤凰','麒麟','龙','鹰','鲸鱼','狮子','星空','海洋'];
            const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
            const noun = nouns[Math.floor(Math.random() * nouns.length)];
            const num = Math.floor(Math.random() * 900) + 100;
            return adj + noun + num;
        }

        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        function closePanel() {
            leaveRoom();
            panel.style.display = 'none';
            syncResizeLayer();
        }

        function leaveRoom() {
            stopWorkspaceSync();
            stopCursorMonitor();
            stopHeartbeat();
            clearAllRemoteCursors();
            Object.values(connections).forEach(c => {
                try { c.conn.close(); } catch(e) {}
            });
            connections = {};
            if (peer) {
                try { peer.destroy(); } catch(e) {}
            }
            peer = null;
            isHost = false;
            roomId = '';
            chatMessages = [];
            connState = 'ok';
            connStateMsg = '';
            approvedMembers = {};
            pendingJoiners = {};
            clearChatHistory();
            render();
        }

        // ─── URL 深链接支持 ───
        function checkUrlForRoom() {
            const hash = location.hash;
            const m = hash.match(/#rtc=([^&]+)/);
            if (m && m[1]) {
                const rid = decodeURIComponent(m[1]);
                // 延迟一点等面板初始化
                setTimeout(() => {
                    if (!peer && !roomId) {
                        panel.style.display = '';
                        joinRoom(rid);
                    }
                }, 500);
            }
        }

        // ─── 初始化 UI ───
        render();

        // 挂载面板到 DOM（初始隐藏）
        panel.style.display = 'none';
        panel.style.zIndex = '1000000'; // 对齐 React 层级系统基准值
        document.body.appendChild(panel);

        // 点击/拖动实时协面板时，调用 React 层级系统置顶（与其它悬浮框统一管理）
        panel.addEventListener('mousedown', () => {
            if (typeof window.__extBringToFront === 'function') window.__extBringToFront('rtc');
        });

        // 全局拖拽 / 拉伸事件
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('mouseup', endResize);
        window.addEventListener('resize', syncResizeLayer);

        // ─── 注入到「工具」下拉菜单（降级为工具栏按钮）───
        const togglePanel = () => {
            panel.style.display = panel.style.display === 'none' ? '' : 'none';
            render();
            syncResizeLayer();
        };

        // 监听来自 React 工具下拉菜单的自定义事件
        window.addEventListener('ext-toggle-realtime-collab', togglePanel);
        registerDisposer(() => window.removeEventListener('ext-toggle-realtime-collab', togglePanel));

        let triggerBtn = null;
        const toolsBtn = Array.from(document.querySelectorAll('button, [role=button], .ext-menu-btn, [class*="menu"]'))
            .find(el => el.textContent.trim() === '工具' || el.title === '工具' || el.getAttribute('aria-label') === '工具');

        if (toolsBtn) {
            // 找到「工具」按钮 → 注入菜单项到其下拉面板
            // 等待下拉面板出现（首次点击时创建或已存在）
            const tryInject = () => {
                // 常见下拉面板选择器（按优先级）
                const dropdown = toolsBtn.parentElement.querySelector('[class*="dropdown"], [class*="popover"], [class*="menu-list"], [role="menu"], [class*="popup"]')
                    || toolsBtn.nextElementSibling
                    || toolsBtn.closest('[class*="menu"]')?.querySelector('[class*="list"], [class*="items"], [role="listbox"]');
                if (!dropdown) return false;

                // 避免重复注入
                if (dropdown.querySelector('.rtc-tools-menu-item')) return true;

                const item = createElement('div', { className: 'rtc-tools-menu-item' }, ['🤝 实时协作']);
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    togglePanel();
                    // 关闭下拉（模拟点击外部）
                    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                });
                dropdown.appendChild(item);
                return true;
            };

            // 立即尝试（下拉可能已渲染）
            if (!tryInject()) {
                // 监听点击「工具」按钮后注入（下拉动态创建）
                const onClickCapture = () => {
                    requestAnimationFrame(() => { tryInject(); });
                    // 注入成功后移除监听
                    setTimeout(() => {
                        if (document.querySelector('.rtc-tools-menu-item')) {
                            toolsBtn.removeEventListener('click', onClickCapture);
                        }
                    }, 500);
                };
                toolsBtn.addEventListener('click', onClickCapture);
            }

            // 同时保留一个隐藏的工具栏按钮作为备用入口（CSS 隐藏，仅作 registerDisposer 占位）
            triggerBtn = addToolbarButton('🤝 实时协作', togglePanel);
            triggerBtn.style.display = 'none';
        } else {
            // 降级：无「工具」菜单，使用独立工具栏按钮
            triggerBtn = addToolbarButton('🤝 实时协作', togglePanel);
        }

        // 检查 URL 是否带房间ID
        checkUrlForRoom();

        // 当进入房间后启动工作区同步（仅在连接成功时由 handleConnection 触发）
        const originalRender = render;
        render = function() {
            originalRender();
            if (!peer || !roomId) {
                stopWorkspaceSync();
            }
        };

        // 清理函数
        return function cleanup() {
            closeSettings();
            leaveRoom();
            stopCursorMonitor();
            clearAllRemoteCursors();
            if (cursorLayer && cursorLayer.parentNode) cursorLayer.parentNode.removeChild(cursorLayer);
            if (toastContainer && toastContainer.parentNode) toastContainer.parentNode.removeChild(toastContainer);
            if (audioCtx) { try { audioCtx.close(); } catch(e) {} }
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mousemove', onResize);
            document.removeEventListener('mouseup', endDrag);
            document.removeEventListener('mouseup', endResize);
            window.removeEventListener('resize', syncResizeLayer);
            if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
            if (resizeLayer && resizeLayer.parentNode) resizeLayer.parentNode.removeChild(resizeLayer);
            if (triggerBtn && triggerBtn.parentNode) triggerBtn.parentNode.removeChild(triggerBtn);
        };
    }
};
