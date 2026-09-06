/**
 * Extension Editor - A Blockly-based Scratch/TurboWarp extension editor
 *
 * Defensive version: works even if Blockly fails to load
 */

import React, {useState, useEffect, useRef, useCallback, useMemo, Component} from 'react';
import LazyScratchBlocks from '../lib/tw-lazy-scratch-blocks.js';
import {
    TOOLBOX_CONFIG,
    BLOCK_DEFINITIONS,
    CODE_GENERATORS,
    javascriptGenerator
} from '../lib/block-definitions.js';
import {applyZhTranslations} from '../lib/scratch-blocks-zh.js';
import {EXT_FORGE_RUNTIME, withUtilInjection} from '../lib/extforge-runtime.js';
import {getSession, login, register, logout as authLogout, getUserMeta, savePrevSession, getPrevSession, clearPrevSession, switchToPrevSession, sendEmailCode, verifyEmailCode, clearLocalAuthData, buildGitHubAuthUrl, loginWithGitHub, makeGitHubState, getRegisteredAccounts, switchToAccount, ensureSiteAccount} from '../lib/auth.js';
import {
    listSaves, saveProject, deleteSave, exportSaveFile, parseSaveFileText,
    collectProjectState, restoreProjectState
} from '../lib/saves.js';
import {buildSyncUrl, parseSyncPayload, importSyncPayload} from '../lib/sync.js';
import {
    cloudAvailable, cloudSearchUsers, cloudListRelations, cloudFollow, cloudUnfollow
} from '../lib/cloud.js';
import {EXT_ADDONS, getAllAddons, getAddonState, setAddonState, applyExtAddons, getAddonOptions, setAddonOptions, removeCustomAddon, importAddonFromSource, updateCustomAddonSource, importAddonFromGithubDir, fetchAddonMarketFromTopic, loadCustomAddons, importAddonBundle, importAddonFromZip} from '../lib/ext-addons.js';
import '../styles/extension-builder.css';

// 积木预设颜色（Scratch 风格常用色，供积木定义面板选择）
const BLOCK_COLOURS = [
    '#FF6680', // 红
    '#FFAB19', // 橙
    '#FFD500', // 黄
    '#59C059', // 绿
    '#0FBD8C', // 青
    '#4C97FF', // 蓝
    '#9966FF', // 紫（默认）
    '#A66F48'  // 棕
];

/**
 * For each (block, input_name) we map to the standard block type whose
 * shadow child will be attached as the placeholder. Numbers use
 * math_number, strings use text, booleans use logic_boolean. When a real
 * reporter block is plugged in, Blockly swaps the shadow out automatically.
 */
const PLACEHOLDER_SHADOWS = {
    control_wait:     {TIME: {type: 'math_number', field: 'NUM', value: 1}},
    control_repeat:   {TIMES: {type: 'math_number', field: 'NUM', value: 10}},
    control_return:   {VALUE: {type: 'text', field: 'TEXT', value: ''}},
    control_inlineReturn:{VALUE: {type: 'text', field: 'TEXT', value: ''}},
    math_arithmetic:  {A: {type: 'math_number', field: 'NUM', value: 0}, B: {type: 'math_number', field: 'NUM', value: 0}},
    math_single:      {NUM: {type: 'math_number', field: 'NUM', value: 0}},
    math_round:       {NUM: {type: 'math_number', field: 'NUM', value: 0}},
    math_random:      {FROM: {type: 'math_number', field: 'NUM', value: 1}, TO: {type: 'math_number', field: 'NUM', value: 10}},
    math_trig:        {NUM: {type: 'math_number', field: 'NUM', value: 0}},
    math_compare:     {A: {type: 'math_number', field: 'NUM', value: 0}, B: {type: 'math_number', field: 'NUM', value: 0}},
    string_concat:    {A: {type: 'text', field: 'TEXT', value: ''}, B: {type: 'text', field: 'TEXT', value: ''}},
    string_slice:     {STR: {type: 'text', field: 'TEXT', value: ''}, START: {type: 'math_number', field: 'NUM', value: 0}, END: {type: 'math_number', field: 'NUM', value: 0}},
    string_indexOf:   {STR: {type: 'text', field: 'TEXT', value: ''}, SUBSTR: {type: 'text', field: 'TEXT', value: ''}},
    string_length:    {STR: {type: 'text', field: 'TEXT', value: ''}},
    string_contains:  {STR: {type: 'text', field: 'TEXT', value: ''}, SUBSTR: {type: 'text', field: 'TEXT', value: ''}},
    string_replace:   {STR: {type: 'text', field: 'TEXT', value: ''}, OLD: {type: 'text', field: 'TEXT', value: ''}, NEW: {type: 'text', field: 'TEXT', value: ''}},
    string_trim:      {STR: {type: 'text', field: 'TEXT', value: ''}},
    string_toUpperCase:{STR: {type: 'text', field: 'TEXT', value: ''}},
    string_toLowerCase:{STR: {type: 'text', field: 'TEXT', value: ''}},
    string_regex:     {STR: {type: 'text', field: 'TEXT', value: ''}, PATTERN: {type: 'text', field: 'TEXT', value: ''}},
    vector_create:    {X: {type: 'math_number', field: 'NUM', value: 0}, Y: {type: 'math_number', field: 'NUM', value: 0}},
    var_set:          {VALUE: {type: 'text', field: 'TEXT', value: ''}},
    var_change:       {DELTA: {type: 'math_number', field: 'NUM', value: 0}},
    list_getItem:     {INDEX: {type: 'math_number', field: 'NUM', value: 0}},
    list_indexOf:     {ITEM: {type: 'text', field: 'TEXT', value: ''}},
    list_contains:    {ITEM: {type: 'text', field: 'TEXT', value: ''}},
    list_addItem:     {ITEM: {type: 'text', field: 'TEXT', value: ''}},
    list_removeItem:  {INDEX: {type: 'math_number', field: 'NUM', value: 0}},
    list_replaceItem: {INDEX: {type: 'math_number', field: 'NUM', value: 0}, ITEM: {type: 'text', field: 'TEXT', value: ''}},
    func_return:      {VALUE: {type: 'text', field: 'TEXT', value: ''}},
    block_field_number:{DEFAULT: {type: 'math_number', field: 'NUM', value: 0}},
    browser_alert:    {MSG: {type: 'text', field: 'TEXT', value: ''}},
    browser_console:  {MSG: {type: 'text', field: 'TEXT', value: ''}},
    browser_localStorageSet:{VALUE: {type: 'text', field: 'TEXT', value: ''}},
    browser_openUrl:  {URL: {type: 'text', field: 'TEXT', value: ''}},
    music_playTone:   {FREQ: {type: 'math_number', field: 'NUM', value: 440}, TIME: {type: 'math_number', field: 'NUM', value: 1}},
    music_playNote:   {BEATS: {type: 'math_number', field: 'NUM', value: 1}},
    music_rest:       {BEATS: {type: 'math_number', field: 'NUM', value: 1}},
    music_setVolume:  {VOLUME: {type: 'math_number', field: 'NUM', value: 50}},
    music_setTempo:   {TEMPO: {type: 'math_number', field: 'NUM', value: 120}},
    event_whenTimerGreaterThan: {VALUE: {type: 'math_number', field: 'NUM', value: 10}},
    event_whenLoudnessGreaterThan: {VALUE: {type: 'math_number', field: 'NUM', value: 10}},
    motion_moveSteps: {STEPS: {type: 'math_number', field: 'NUM', value: 10}},
    motion_turnRight: {DEGREES: {type: 'math_number', field: 'NUM', value: 15}},
    motion_turnLeft: {DEGREES: {type: 'math_number', field: 'NUM', value: 15}},
    motion_pointInDirection: {DIRECTION: {type: 'math_number', field: 'NUM', value: 90}},
    motion_glideTo: {SECS: {type: 'math_number', field: 'NUM', value: 1}, X: {type: 'math_number', field: 'NUM', value: 0}, Y: {type: 'math_number', field: 'NUM', value: 0}},
    looks_say: {MESSAGE: {type: 'text', field: 'TEXT', value: '你好!'}, SECS: {type: 'math_number', field: 'NUM', value: 2}},
    looks_think: {MESSAGE: {type: 'text', field: 'TEXT', value: '嗯...'}},
    looks_changeSize: {CHANGE: {type: 'math_number', field: 'NUM', value: 10}},
    net_httpGet: {URL: {type: 'text', field: 'TEXT', value: 'https://example.com/api'}},
    net_httpPost: {URL: {type: 'text', field: 'TEXT', value: 'https://example.com/api'}, BODY: {type: 'text', field: 'TEXT', value: '{}'}},
    net_jsonParse: {JSON: {type: 'text', field: 'TEXT', value: '{"a":1}'}, KEY: {type: 'text', field: 'TEXT', value: 'a'}},
    time_waitMs: {MS: {type: 'math_number', field: 'NUM', value: 1000}}
};

const DEFAULT_EXTENSION_INFO = {
    id: 'myextension',
    name: '我的第一个扩展',
    description: '',
    author: '',
    docsUrl: '',
    license: 'MPL-2.0',
    color1: '#FF6680',
    color2: '#FF4D6A',
    color3: '#FF3355',
    categoryIcon: '',
    blockIcon: '',
    customId: false,
    blocks: []
};

// Common open-source licenses for Scratch extensions
const LICENSE_OPTIONS = [
    'MPL-2.0',
    'MIT',
    'Apache-2.0',
    'GPL-3.0',
    'BSD-3-Clause',
    'CC-BY-4.0',
    'CC0-1.0',
    'Proprietary'
];

const COLOR_PRESETS = [
    ['#FF6680', '#FF4D6A', '#FF3355'],
    ['#4C97FF', '#4280D7', '#3373CC'],
    ['#9966FF', '#855CD6', '#774DCB'],
    ['#0FBD8C', '#0DA57A', '#0B8E69'],
    ['#FF8C1A', '#FF8000', '#DB6E00'],
    ['#FFBF00', '#E6AC00', '#CC9900'],
    ['#5CB1D7', '#4A9DC0', '#3D8AA8'],
    ['#CF63CF', '#BB4FBC', '#A53EA5']
];

// Error boundary to catch rendering errors
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = {error: null};
    }
    static getDerivedStateFromError(error) {
        return {error};
    }
    componentDidCatch(error, info) {
        console.error('ExtensionBuilder error:', error, info);
    }
    render() {
        if (this.state.error) {
            return (
                <div className="ext-builder-error">
                    <h2>运行时错误</h2>
                    <pre style={{whiteSpace: 'pre-wrap', maxWidth: '80%', overflow: 'auto'}}>
                        {this.state.error.toString()}
                    </pre>
                    <button onClick={() => window.location.reload()}>刷新页面</button>
            </div>
            );
        }
        return this.props.children;
    }
}

const ExtensionBuilder = () => {
    return (
        <ErrorBoundary>
            <ExtensionBuilderInner />
        </ErrorBoundary>
    );
};

const ExtensionBuilderInner = () => {
    const blocklyDivRef = useRef(null);
    const workspaceRef = useRef(null);
    const [generatedCode, setGeneratedCode] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [activeTab, setActiveTab] = useState('editor');
    const [showBlockBuilder, setShowBlockBuilder] = useState(false);
    const [builderModalPos, setBuilderModalPos] = useState(null); // {x, y}
    const builderModalRef = useRef(null);
    const builderResizeRef = useRef(null); // {dir, startX, startY, origLeft, origTop, origWidth, origHeight}
    const [builderMinimized, setBuilderMinimized] = useState(false);
    const [builderMaximized, setBuilderMaximized] = useState(false);
    const [builderSize, setBuilderSize] = useState(null); // {width, height}
    const BUILDER_RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    const builderDragRef = useRef(null); // {startX, startY, origX, origY}
    // Blockly workspace XML is stored in a ref instead of React state so
    // that drag operations don't trigger component re-renders (which
    // were causing the floating builder window's block list to flash /
    // disappear during drags).
    const customBlockXmlRef = useRef(new Map());

    // Close the floating builder window with the Escape key.
    useEffect(() => {
        if (!showBlockBuilder) return;
        const onKey = (e) => {
            if (e.key === 'Escape') setShowBlockBuilder(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [showBlockBuilder]);

    // Drag the floating builder window by its header.
    const handleBuilderDragStart = useCallback((e) => {
        if (e.button !== 0 || !builderModalRef.current) return;
        const rect = builderModalRef.current.getBoundingClientRect();
        builderDragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: rect.left,
            origY: rect.top
        };
        document.addEventListener('mousemove', handleBuilderDragMove);
        document.addEventListener('mouseup', handleBuilderDragEnd);
        e.preventDefault();
    }, []);

    const handleBuilderDragMove = useCallback((e) => {
        if (!builderDragRef.current) return;
        const dx = e.clientX - builderDragRef.current.startX;
        const dy = e.clientY - builderDragRef.current.startY;
        setBuilderModalPos({
            x: builderDragRef.current.origX + dx,
            y: builderDragRef.current.origY + dy
        });
    }, []);

    const handleBuilderDragEnd = useCallback(() => {
        builderDragRef.current = null;
        document.removeEventListener('mousemove', handleBuilderDragMove);
        document.removeEventListener('mouseup', handleBuilderDragEnd);
    }, [handleBuilderDragMove]);

    // Minimize / maximize the builder window (matches realtime-collab behaviour).
    const handleBuilderMinimize = useCallback(() => {
        setBuilderMinimized((prev) => !prev);
    }, []);

    const handleBuilderMaximize = useCallback(() => {
        setBuilderMaximized((prev) => !prev);
    }, []);

    // 8-direction resize, driven by the edge/corner handles.
    const handleBuilderResizeMove = useCallback((e) => {
        const st = builderResizeRef.current;
        if (!st) return;
        const dx = e.clientX - st.startX;
        const dy = e.clientY - st.startY;
        const MIN_W = 300;
        const MIN_H = 360;
        let left = st.origLeft;
        let top = st.origTop;
        let width = st.origWidth;
        let height = st.origHeight;
        if (st.dir.indexOf('e') !== -1) width = Math.max(MIN_W, st.origWidth + dx);
        if (st.dir.indexOf('s') !== -1) height = Math.max(MIN_H, st.origHeight + dy);
        if (st.dir.indexOf('w') !== -1) {
            width = Math.max(MIN_W, st.origWidth - dx);
            left = st.origLeft + (st.origWidth - width);
        }
        if (st.dir.indexOf('n') !== -1) {
            height = Math.max(MIN_H, st.origHeight - dy);
            top = st.origTop + (st.origHeight - height);
        }
        setBuilderModalPos({ x: Math.round(left), y: Math.round(top) });
        setBuilderSize({ width: Math.round(width), height: Math.round(height) });
    }, []);

    const handleBuilderResizeEnd = useCallback(() => {
        builderResizeRef.current = null;
        document.removeEventListener('mousemove', handleBuilderResizeMove);
        document.removeEventListener('mouseup', handleBuilderResizeEnd);
    }, [handleBuilderResizeMove]);

    const handleBuilderResizeStart = useCallback((e, dir) => {
        if (e.button !== 0 || !builderModalRef.current) return;
        const rect = builderModalRef.current.getBoundingClientRect();
        builderResizeRef.current = {
            dir,
            startX: e.clientX,
            startY: e.clientY,
            origLeft: rect.left,
            origTop: rect.top,
            origWidth: rect.width,
            origHeight: rect.height
        };
        document.addEventListener('mousemove', handleBuilderResizeMove);
        document.addEventListener('mouseup', handleBuilderResizeEnd);
        e.preventDefault();
        e.stopPropagation();
    }, [handleBuilderResizeMove, handleBuilderResizeEnd]);
    const [searchTerm, setSearchTerm] = useState('');
    const [extInfo, setExtInfo] = useState(DEFAULT_EXTENSION_INFO);
    const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
    const [editingBlockId, setEditingBlockId] = useState(null);
    const [editingName, setEditingName] = useState('');
    const [settingsDraft, setSettingsDraft] = useState(null);
    const [showBlockPreview, setShowBlockPreview] = useState(false);

    // ---- 登录 / 存档 / 跨站同步 ----
    const [session, setSession] = useState(() => getSession());
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
    const [authUser, setAuthUser] = useState('');
    const [authPass, setAuthPass] = useState('');
    const [authPass2, setAuthPass2] = useState('');
    const [authEmail, setAuthEmail] = useState(''); // 注册用邮箱
    const [authError, setAuthError] = useState('');
    const [authBusy, setAuthBusy] = useState(false);
    const [authRemember, setAuthRemember] = useState(true); // 自动登录（记住我）默认开启
    const [authCode, setAuthCode] = useState('');           // 邮箱验证码（注册用）
    const [codeSending, setCodeSending] = useState(false);   // 发送验证码中
    const [codeCountdown, setCodeCountdown] = useState(0);   // 重发倒计时（秒）
    const [devCode, setDevCode] = useState('');               // 开发模式显示的验证码
    const codeTimerRef = useRef(null);
    const [prevSession, setPrevSession] = useState(() => getPrevSession()); // 切换账号时记住的上一个会话
    const [showAccountSwitcher, setShowAccountSwitcher] = useState(false); // 多账号切换子菜单
    const [accountList, setAccountList] = useState(() => getRegisteredAccounts()); // 已注册账号列表
    // ---- Cloudflare Turnstile 人机验证（注册模式） ----
    const TURNSTILE_SITEKEY = '0x4AAAAAAEeqDjN4nAzMOE8q';
    const [turnstileLoaded, setTurnstileLoaded] = useState(false);
    const [turnstileWidgetId, setTurnstileWidgetId] = useState(null);
    const [turnstileToken, setTurnstileToken] = useState('');
    const turnstileContainerRef = useRef(null);
    // GitHub OAuth 弹窗流程：保存本次授权 state，用于回调消息校验（防 CSRF）
    const githubStateRef = useRef('');
    const [showSavesPanel, setShowSavesPanel] = useState(false);
    const [savesList, setSavesList] = useState([]);
    const [saveNameInput, setSaveNameInput] = useState('');
    const [saveMsg, setSaveMsg] = useState('');
    const [syncLinkText, setSyncLinkText] = useState('');
    const [syncInput, setSyncInput] = useState('');

    // ExtAddons 插件系统：弹窗开关 + 激活清理
    const [showAddonsPanel, setShowAddonsPanel] = useState(false);
    const [addonState, setAddonStateInternal] = useState(() => getAddonState());
    const [addonSearch, setAddonSearch] = useState('');
    // 安装插件对话框（对齐 DSH 的 dsh plugin add）
    const [showInstallModal, setShowInstallModal] = useState(false);
    const [installSource, setInstallSource] = useState('');
    const [installStatus, setInstallStatus] = useState('');
    const [installError, setInstallError] = useState('');
    const [installLoading, setInstallLoading] = useState(false);
    const installFileRef = useRef(null);
    // 统一设置面板（含编辑器设置 + 插件管理标签页）
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [settingsTab, setSettingsTab] = useState('editor'); // 'editor' | 'addons'
    const settingsPanelRef = useRef(null); // 设置悬浮框 DOM 引用
    const [settingsMinimized, setSettingsMinimized] = useState(false); // 是否最小化
    const [settingsMaximized, setSettingsMaximized] = useState(false); // 是否最大化
    const settingsBoundsRef = useRef(null); // 最大化前保存的位置尺寸
    const [settingsResizeLayerOn, setSettingsResizeLayerOn] = useState(false); // resize 层显隐
    const [addonOpts, setAddonOptsInternal] = useState(() => {
        // 初始化所有有 options 的插件的子选项状态
        const opts = {};
        getAllAddons().filter(a => a.options && a.options.length).forEach(a => {
            opts[a.id] = getAddonOptions(a.id, a.options);
        });
        return opts;
    });
    // 插件市场（从 GitHub 仓库清单加载可安装插件）
    const [marketView, setMarketView] = useState(false); // 是否在插件管理内显示市场
    const [marketList, setMarketList] = useState([]);
    const [marketLoading, setMarketLoading] = useState(false);
    const [marketError, setMarketError] = useState('');
    const [marketInstalled, setMarketInstalled] = useState({}); // { dir: true }
    const [marketInstalling, setMarketInstalling] = useState(''); // 正在安装的 dir
    const MARKET_TOPIC = 'scratch-extension-editot-addon'; // 插件市场主题（github.com/topics/...）
    const extAddonsCleanupRef = useRef(null);

    // 个人主页
    const [showProfilePanel, setShowProfilePanel] = useState(false);
    const [profileMeta, setProfileMeta] = useState(null);
    const [profileCounts, setProfileCounts] = useState({following: 0, followers: 0});

    // 好友 / 关注
    const [showFriendsPanel, setShowFriendsPanel] = useState(false);
    const [friendsTab, setFriendsTab] = useState('friends'); // 'friends' | 'following' | 'followers'
    const [friendsRelations, setFriendsRelations] = useState([]); // [{follower, followee}]

    // 用户下拉菜单
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showToolsMenu, setShowToolsMenu] = useState(false);
    const [showStatsPanel, setShowStatsPanel] = useState(false);
    const statsPanelRef = useRef(null);
    const statsResizeLayerRef = useRef(null);
    const [statsFloatBounds, setStatsFloatBounds] = useState({ x: 200, y: 100, w: 560, h: 480 });
    const statsDragRef = useRef(null);
    const statsResizeRef = useRef(null);
    const [statsTick, setStatsTick] = useState(0); // 强制 projectStats 重算的计数器

    // 用户面板悬浮框状态（个人主页/好友/存档共用一套，同时只开一个）
    const [userPanelType, setUserPanelType] = useState(null); // 'profile' | 'friends' | 'saves'
    const userFloatRef = useRef(null);
    const [userFloatBounds, setUserFloatBounds] = useState({ x: 120, y: 70, w: 520, h: 520 });
    const [userMaximized, setUserMaximized] = useState(false);
    const [userMinimized, setUserMinimized] = useState(false);
    const [userResizeLayerOn, setUserResizeLayerOn] = useState(false);
    const userFloatSavedBounds = useRef(null);
    const [friendsSearch, setFriendsSearch] = useState('');
    const [friendsResults, setFriendsResults] = useState([]);
    const [friendsBusy, setFriendsBusy] = useState(false);
    const [friendsMsg, setFriendsMsg] = useState('');

    // Block management state (like Scratch's sprite list)
    const [customBlocks, setCustomBlocks] = useState([
        {
            id: 'block_1', name: '我的第一个积木', xml: null,
            blockType: 'command', isTerminal: false, isAsync: false,
            attachAllThreads: false, filterSprite: true, filterStage: true, icon: '',
            colour: ''
        },
        {
            id: 'block_2', name: '我的第二个积木', xml: null,
            blockType: 'command', isTerminal: false, isAsync: false,
            attachAllThreads: false, filterSprite: true, filterStage: true, icon: '',
            colour: ''
        },
        {
            id: 'block_3', name: '我的第三个积木', xml: null,
            blockType: 'command', isTerminal: false, isAsync: false,
            attachAllThreads: false, filterSprite: true, filterStage: true, icon: '',
            colour: ''
        }
    ]);
    // 派生：代码面板显示的内容 = 与导出 .js 文件完全一致（wrapAsExtension 输出）。
    // 放这里是为了确保 generatedCode / extInfo / customBlocks 都已声明（避免 TDZ）。
    const exportableCode = React.useMemo(() => {
        if (!generatedCode && !(customBlocks && customBlocks.length)) return '';
        try {
            return wrapAsExtension(extInfo, generatedCode, customBlocks);
        } catch (e) {
            return '// 包装失败：' + (e && e.message ? e.message : String(e)) +
                '\n\n/* 原始生成代码 */\n' + generatedCode;
        }
    }, [extInfo, generatedCode, customBlocks]);

    // ── 项目统计数据（积木数、代码大小、复杂度等）──
    const projectStats = useMemo(() => {
        // 优先统计工作区中实际放置的积木数量，回退到定义数量
        let workspaceBlockCount = 0;
        let wsHat = 0, wsCmd = 0, wsReporter = 0, wsBool = 0;
        try {
            const ws = workspaceRef.current;
            if (ws) {
                const allBlocks = ws.getAllBlocks ? ws.getAllBlocks() : [];
                // 过滤掉 shadow 积木（placeholder）和 disabled 积木
                const realBlocks = allBlocks.filter(b => !b.isShadow() && !b.disabled);
                workspaceBlockCount = realBlocks.length;
                realBlocks.forEach(b => {
                    const opcode = b.type || '';
                    // 从 opcode 或输出连接判断类型
                    if (b.outputConnection) {
                        if (b.outputConnection.check_ && b.outputConnection.check_.includes('Boolean')) wsBool++;
                        else wsReporter++;
                    } else if (b.previousConnection === null && b.nextConnection !== null) {
                        wsHat++;
                    } else {
                        wsCmd++;
                    }
                });
            }
        } catch(e) { /* workspace 未就绪 */ }

        // 如果工作区没有积木，回退到定义数量
        const blockCount = workspaceBlockCount > 0 ? workspaceBlockCount : (customBlocks || []).length;

        // 使用 exportableCode（代码面板实际显示的完整包装后代码）
        const code = exportableCode || generatedCode || '';
        const codeSize = new Blob([code], { type: 'text/javascript' }).size;
        const fullSize = codeSize; // exportableCode 已经是完整导出代码
        const lineCount = code.split('\n').length;

        // 如果工作区有统计则使用，否则从定义推断
        const hatCount = workspaceBlockCount > 0 ? wsHat : (customBlocks || []).filter(b => b.blockType === 'hat').length;
        const cmdCount = workspaceBlockCount > 0 ? wsCmd : (customBlocks || []).filter(b => b.blockType === 'command' || !b.blockType).length;
        const reporterCount = workspaceBlockCount > 0 ? wsReporter : (customBlocks || []).filter(b => b.blockType === 'reporter').length;
        const boolCount = workspaceBlockCount > 0 ? wsBool : (customBlocks || []).filter(b => b.blockType === 'boolean').length;

        // 复杂度评分（极高考门槛：至少约3000块积木才能取得高分）
        // 积木分（上限70分）：每块0.024分，需约2900块才满
        const blockScore = Math.min(70, blockCount * 0.024);
        // 代码行数分（上限18分）：每行0.036分，需约500行才满（辅助项）
        const lineScore = Math.min(18, lineCount * 0.036);
        // 类型多样性分（上限12分）
        const typeDiversity = Math.min(12, (hatCount + cmdCount + reporterCount + boolCount) * 1.0);
        const complexityScore = Math.round(blockScore + lineScore + typeDiversity);
        const complexityLevel = complexityScore < 15 ? '低' : complexityScore < 35 ? '中' : complexityScore < 55 ? '较高' : complexityScore < 78 ? '高' : '极高';
        return { blockCount, codeSize, fullSize, lineCount, hatCount, cmdCount, reporterCount, boolCount, complexityScore, complexityLevel };
    }, [customBlocks, generatedCode, exportableCode, workspaceLoaded, statsTick]);

    const [copyMsg, setCopyMsg] = useState('');
    const copyMsgTimerRef = useRef(null);
    const [currentBlockId, setCurrentBlockId] = useState('block_1');
    const currentBlockRef = useRef('block_1');
    // Keep a ref to quickly save current workspace without re-render
    const saveWorkspaceRef = useRef(() => {});

    // Load scratch-blocks
    useEffect(() => {
        let cancelled = false;
        try {
            if (LazyScratchBlocks.isLoaded()) {
                setLoaded(true);
                return;
            }
            LazyScratchBlocks.load()
                .then((BlocklyModule) => {
                    if (cancelled) return;
                    // BlocklyModule is the scratch-blocks default export (the Blockly global)
                    const Blockly = BlocklyModule && (BlocklyModule.default || BlocklyModule);
                    console.log('scratch-blocks loaded. Blockly:', typeof Blockly);
                    console.log('Blockly.inject:', typeof (Blockly && Blockly.inject));
                    console.log('Blockly.Blocks:', typeof (Blockly && Blockly.Blocks));
                    // Make sure window.Blockly also has the right reference
                    if (Blockly && typeof Blockly.inject === 'function') {
                        window.Blockly = Blockly;
                    }
                    setLoaded(true);
                })
                .catch(err => {
                    console.error('Failed to load scratch-blocks:', err);
                    if (!cancelled) {
                        setLoadError(err.message || String(err));
                        setLoaded(true);
                    }
                });
        } catch (e) {
            console.error('LazyScratchBlocks error:', e);
            setLoadError(e.message);
            setLoaded(true);
        }
        return () => { cancelled = true; };
    }, []);

    // Initialize Blockly workspace
    useEffect(() => {
        if (!loaded || workspaceLoaded || !blocklyDivRef.current) return;

        try {
            // Try multiple sources to get Blockly
            let Blockly = null;
            if (LazyScratchBlocks.get) {
                Blockly = LazyScratchBlocks.get();
            }
            if (!Blockly && window.Blockly && typeof window.Blockly.inject === 'function') {
                Blockly = window.Blockly;
            }

            if (!Blockly || typeof Blockly.inject !== 'function') {
                console.error('Blockly not properly loaded', {
                    fromLazy: typeof (LazyScratchBlocks.get && LazyScratchBlocks.get()),
                    fromWindow: typeof window.Blockly,
                    windowKeys: window.Blockly ? Object.keys(window.Blockly).slice(0, 20) : []
                });
                setLoadError('Blockly.inject function not available. Check browser console.');
                return;
            }

            // Set Blockly media path to local scratch-blocks media (avoid blockly-demo.appspot.com requests)
            if (Blockly.utils && typeof Blockly.utils._MEDIA_URL !== 'undefined') {
                Blockly.utils._MEDIA_URL = '/static/blocks-media/default/';
            }

            // Register all custom blocks
            let registeredCount = 0;
            Object.entries(BLOCK_DEFINITIONS).forEach(([type, def]) => {
                if (!Blockly.Blocks) {
                    console.warn('Blockly.Blocks not found, creating empty object');
                    Blockly.Blocks = {};
                }
                // Register all custom blocks (override any built-in Scratch
                // blocks with the same type — e.g. event_broadcast,
                // control_wait — so custom shapes apply).
                if (Blockly.Blocks[type]) {
                    Blockly.Blocks[type] = null; // force re-init with custom def
                }
                // Clean the definition: remove type (set externally), keep everything else
                const cleanDef = {};
                Object.keys(def).forEach(k => {
                    if (k !== 'type') cleanDef[k] = def[k];
                });
                Blockly.Blocks[type] = {
                    init: function () {
                        // Apply hat shape for HAT blocks before jsonInit, so SVG renders
                        // the curved top instead of a flat one. scratch-blocks detects
                        // this via the `shape_hat` extension which calls setInputsInline
                        // + setNextStatement + sets `this.hat_ = true`. We must also
                        // REMOVE the previousStatement field — otherwise Blockly's
                        // jsonInit treats `previousStatement: null` as "create a
                        // previousConnection of any type", which gives the block a
                        // flat top with a notch instead of a curved hat top.
                        if (cleanDef.id === 'HAT') {
                            delete cleanDef.previousStatement;
                            const baseExts = (def.extensions || []).filter(function (e) { return e !== 'shape_hat'; });
                            cleanDef.extensions = baseExts.concat(['shape_hat']);
                            // block_define uses the same yellow as other hat blocks
                            // (scratch event category) so it looks identical.
                            if (type === 'block_define') {
                                cleanDef.colour = 45;
                            }
                        }
                        // Use jsonInit for all output shape decisions.
                        // This avoids infinite recursion that occurs when
                        // calling setOutput + jsonInit separately.
                        this.jsonInit(cleanDef);
                        // After jsonInit, override the bottom notch for block_define.
                        // shape_hat extension sets setNextStatement(true) which
                        // creates a C-shape notch at the bottom. Remove it so
                        // block_define looks like an ordinary hat block (flat
                        // bottom, no C notch) — matching CB-ExtGallary / scratch
                        // standard hat appearance.
                        if (type === 'block_define') {
                            this.setNextStatement(false);
                        }
                        // After jsonInit, set the output shape if applicable.
                        if (this.outputConnection) {
                            let outputShape = null;
                            if (cleanDef.output === 'Boolean') {
                                outputShape = 1;
                            } else if (cleanDef.output === 'Number' ||
                                       cleanDef.output === 'String') {
                                outputShape = 2;
                            }
                            if (outputShape !== null) {
                                this.setOutputShape(outputShape);
                            }
                        }

                        // For blocks that show a value preview below
                        // (boolean/return blocks), wrap the VALUE field text
                        // with a white background rect that mirrors the
                        // runtime preview in TurboWarp.
                        const previewTypes = ['logic_boolean', 'control_return',
                            'control_inlineReturn', 'func_return'];
                        if (previewTypes.indexOf(type) >= 0) {
                            const valueField = this.getField('VALUE');
                            if (valueField) {
                                valueField.extNeedsBox_ = true;
                                this.extValueField_ = valueField;
                            }
                        }

                        // NOTE: Editable input placeholders are injected via the toolbox
                        // XML as shadow child blocks (<shadow type="math_number">).
                        // Blockly's flyout automatically clones these onto every
                        // block created from the toolbox. For blocks created
                        // programmatically via ws.newBlock(), we attach the
                        // same shadow children here so the visual style is
                        // consistent everywhere.
                        const shadowSpec = PLACEHOLDER_SHADOWS[type];
                        if (shadowSpec && this.workspace) {
                            Object.keys(shadowSpec).forEach((iname) => {
                                const spec = shadowSpec[iname];
                                const input = this.getInput(iname);
                                if (!input || !input.connection) return;
                                if (input.connection.targetBlock()) return;
                                try {
                                    const shadow = this.workspace.newBlock(spec.type);
                                    shadow.setShadow(true);
                                    shadow.setFieldValue(String(spec.value), spec.field);
                                    shadow.initSvg();
                                    shadow.render();
                                    input.connection.connect(shadow.outputConnection);
                                } catch (e) {
                                    // ignore — likely shadow already exists from toolbox
                                }
                            });
                        }
                    }
                };
                registeredCount++;
            });
            console.log('[ExtBuilder] Registered', registeredCount, 'custom blocks');

            // Verify a sample block was created correctly
            const sampleBlock = Blockly.Blocks['event_whenLoaded'];
            if (!sampleBlock) {
                console.error('event_whenLoaded block NOT registered!');
                setLoadError('Block registration failed - no blocks registered');
                return;
            }

            // Set Blockly media path and utils before injection
            if (!Blockly.utils) {
                Blockly.utils = {};
            }
            if (typeof Blockly.utils._MEDIA_URL !== 'string') {
                Blockly.utils._MEDIA_URL = '/static/blocks-media/default/';
            }
            // Initialize xml namespace if missing
            if (!Blockly.utils.xml) {
                Blockly.utils.xml = {};
            }
            if (typeof DOMParser !== 'undefined' && !Blockly.utils.xml.DOM_PARSER) {
                Blockly.utils.xml.DOM_PARSER = new DOMParser();
            }

            // Build multi-category toolbox XML from TOOLBOX_CONFIG (16 categories).
            // Each category shows its own block types from block-definitions.js.
            // The "id" attribute is critical: scratch-blocks uses it for the
            // category menu dots (scratchCategoryId-{id}), so clicking a dot
            // scrolls the flyout to the correct category section.
            const categoryIds = [
                'events', 'control', 'math', 'strings', 'vectors',
                'input', 'variables', 'lists', 'functions', 'blocks',
                'runtime', 'targets', 'browser', 'music', 'script', 'extra'
            ];
            const toolboxXml = '<xml xmlns="https://developers.google.com/blockly/xml">' +
                TOOLBOX_CONFIG.contents.map((cat, idx) => {
                    const childXml = cat.contents.map(b => {
                        const shadows = PLACEHOLDER_SHADOWS[b.type];
                        if (!shadows) return `<block type="${b.type}"/>`;
                        const valueXml = Object.keys(shadows).map(name => {
                            const s = shadows[name];
                            return `<value name="${name}"><shadow type="${s.type}"><field name="${s.field}">${s.value}</field></shadow></value>`;
                        }).join('');
                        return `<block type="${b.type}">${valueXml}</block>`;
                    }).join('');
                    const safeName = String(cat.name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const safeColour = String(cat.colour || '#FF6680').replace(/[^#0-9a-fA-F]/g, '');
                    const catId = categoryIds[idx] || 'cat' + idx;
                    return `<category name="${safeName}" id="${catId}" colour="${safeColour}" secondaryColour="${safeColour}">${childXml}</category>`;
                }).join('') +
                '</xml>';
            console.log('[ExtBuilder] Toolbox XML length:', toolboxXml.length);

            // Apply Chinese translations BEFORE inject so Blockly renders blocks
            // with Chinese text from the start (instead of waiting for DOM mutations)
            applyZhTranslations(Blockly);
            console.log('[ExtBuilder] Chinese translations applied to Blockly.Msg');

            // Inject workspace with our custom toolbox. scratch-blocks' default
            // toolbox has 10 categories — we replace it with a SINGLE 自制积木
            // category matching CB-ExtGallary layout.
            const workspace = Blockly.inject(blocklyDivRef.current, {
                toolbox: toolboxXml,
                media: '/static/blocks-media/default/',
                grid: {
                    spacing: 25,
                    length: 3,
                    colour: '#ccc',
                    snap: false
                },
                zoom: {
                    controls: true,
                    wheel: true,
                    startScale: 0.55,
                    maxScale: 3,
                    minScale: 0.3,
                    scaleSpeed: 1.1
                },
                trashcan: true,
                sounds: false,
                // 禁用"折叠所有积木/展开所有积木"右键菜单项，避免
                // scratch-blocks 因 Blockly.Msg.COLLAPSE_ALL/EXPAND_ALL 未
                // 定义而渲染出空白按钮（点击后会把自定义积木塌缩成
                // 小图标，用户很容易误以为是 bug）。
                collapse: false
            });
            console.log('[ExtBuilder] Workspace injected. Initial block count:', workspace.getAllBlocks(false).length);

            // Force scale to match original TurboWarp (BLOCKS_DEFAULT_SCALE = 0.55)
            // This ensures blocks are the same size as turbowarp.org/editor
            // even if startScale option was ignored by scratch-blocks.
            try {
                if (workspace.setScale) workspace.setScale(0.55);
            } catch(e) {}

            // Hide inline input fields when a reporter block is plugged into the
            // same socket. Blockly's input_value renderer doesn't know that
            // we appended a field, so we toggle the field's SVG group
            // (g.blocklyEditableText / blocklyFieldTextGroup) visibility
            // directly on every change.
            // (no runtime helper needed — placeholder fields are declared in args0.)
            // (placeholder fields are declared directly in BLOCK_DEFINITIONS
            // args0; Blockly handles placeholder visibility automatically when
            // a target block is plugged in — no runtime sync needed.)

            // CRITICAL: scratch-blocks queries container size on inject and caches it.
            // After CSS layout completes, the host div may have grown from 0 → N px.
            // We must call resizeSvg on next animation frame so the SVG fills the host.
            const forceResize = () => {
                try {
                    if (typeof Blockly.svgResize === 'function') {
                        Blockly.svgResize(workspace);
                    } else if (typeof workspace.resizeSvg === 'function') {
                        workspace.resizeSvg();
                    } else if (typeof Blockly.resizeSvg === 'function') {
                        Blockly.resizeSvg();
                    }
                    if (typeof Blockly.fireUiEvent === 'function') {
                        Blockly.fireUiEvent(workspace, 'resize');
                    } else if (typeof workspace.fireUiEvent === 'function') {
                        workspace.fireUiEvent('resize');
                    }
                } catch (e) {
                    console.warn('[ExtBuilder] resizeSvg failed:', e);
                }
                console.log('[ExtBuilder] Workspace resized. SVG size:', workspace.getMetrics ? (() => {
                    const m = workspace.getMetrics();
                    return m ? `${Math.round(m.viewWidth)}x${Math.round(m.viewHeight)}` : 'no metrics';
                })() : 'no metrics method');
            };

            // Resize on next animation frame (DOM has been laid out by then)
            requestAnimationFrame(() => {
                requestAnimationFrame(forceResize);
                // Re-apply scale after resize (resizeSvg may reset it)
                try { if (workspace.setScale) workspace.setScale(0.55); } catch(e) {}

                // 修复 flyout clip-path 尺寸不匹配问题：
                // Blockly 默认创建的 clipPath rect (248×438) 比 flyout 实际尺寸 (250×442) 小，
                // 导致边缘积木被多余裁切。此处同步 clip-path 到 flyout 实际尺寸。
                try {
                    const flyout = document.querySelector('.blocklyFlyout');
                    const clipRect = document.getElementById('blocklyBlockMenuClipRect');
                    if (flyout && clipRect) {
                        const fr = flyout.getBoundingClientRect();
                        clipRect.setAttribute('width', Math.max(1, Math.round(fr.width)));
                        clipRect.setAttribute('height', Math.max(1, Math.round(fr.height)));
                    }

                    // 修复 flyout 积木左侧被裁切：
                    // Blockly 默认 translateX=0 导致积木左边缘紧贴 flyout 左边界，
                    // 帽子形状弧形和文字开头被截断。右移 15px 给积木留出左侧边距。
                    const canvas = flyout.querySelector('.blocklyBlockCanvas');
                    if (canvas) {
                        const t = canvas.getAttribute('transform') || '';
                        const m = t.match(/translate\(([^,]+),\s*([^)]+)\)/);
                        if (m) {
                            const x = parseFloat(m[1]) + 15;
                            const y = m[2];
                            canvas.setAttribute('transform',
                                'translate(' + x + ',' + y + ') scale(0.55)');
                        }
                    }
                } catch(e) { console.warn('[ExtBuilder] flyout fix failed:', e); }
            });
            // Also resize on a delayed schedule as a safety net
            const resizeTimer = setTimeout(() => {
                forceResize();
                try { if (workspace.setScale) workspace.setScale(0.55); } catch(e) {}
                // 延迟修复：flyout 可能在 250ms 后才完全渲染，再次右移积木
                try {
                    const flyout2 = document.querySelector('.blocklyFlyout');
                    const canvas2 = flyout2 ? flyout2.querySelector('.blocklyBlockCanvas') : null;
                    if (canvas2) {
                        const t2 = canvas2.getAttribute('transform') || '';
                        const m2 = t2.match(/translate\(([^,]+),\s*([^)]+)\)/);
                        if (m2) {
                            const x2 = parseFloat(m2[1]) + 15;
                            canvas2.setAttribute('transform',
                                'translate(' + x2 + ',' + m2[2] + ') scale(0.55)');
                        }
                    }
                } catch(e2) {}
            }, 250);

            // Translate default Scratch toolbox categories from English to Chinese.
            // scratch-blocks injects its own category menu (scratchCategoryMenu)
            // with English names like "Motion". We rewrite them in the DOM on the
            // next frame after the menu has been rendered.
            const enToZh = {
                Motion: '运动', Looks: '外观', Sound: '声音',
                Events: '事件', Control: '控制', Sensing: '侦测',
                Operators: '运算', Data: '数据', DataLists: '数据列表',
                More: '更多', Extensions: '扩展',
                Variables: '变量', 'My Blocks': '自制积木'
            };
            const translateToolbox = () => {
                const labels = document.querySelectorAll('.scratchCategoryMenuItemLabel');
                let translated = 0;
                labels.forEach(el => {
                    const raw = el.textContent.trim();
                    if (enToZh[raw] && el.textContent !== enToZh[raw]) {
                        el.textContent = enToZh[raw];
                        translated++;
                    }
                });
                // Also try aria-label / title on the menu item itself
                const items = document.querySelectorAll('.scratchCategoryMenuItem');
                items.forEach(el => {
                    const match = el.className.match(/scratchCategoryId-(\w+)/);
                    if (!match) return;
                    const eng = match[1].charAt(0).toUpperCase() + match[1].slice(1);
                    if (enToZh[eng]) {
                        // Update aria-label or any visible attribute
                        const label = el.querySelector('.scratchCategoryMenuItemLabel');
                        if (!label) {
                            // Fallback: create label if missing
                            const span = document.createElement('span');
                            span.className = 'scratchCategoryMenuItemLabel';
                            span.textContent = enToZh[eng];
                            el.appendChild(span);
                            translated++;
                        }
                    }
                });

                // Translate the small "Extension" header text that scratch-blocks
                // renders at the top of every extension_xxx block in the flyout.
                // The text is rendered as an SVG <text> by the FlyoutExtensionCategoryHeader
                // or by the block itself. Match on text content == "Extension" only.
                const extLabels = document.querySelectorAll('text.blocklyText');
                extLabels.forEach(el => {
                    const txt = (el.textContent || '').trim();
                    if (txt === 'Extension') {
                        el.textContent = '扩展';
                        translated++;
                    }
                });

                // Translate the flyout section header text (e.g. "Extensions"
                // that appears below the "Make a Block" button inside the
                // 制作积木 flyout). Class is blocklyFlyoutLabelText.
                const flyoutLabels = document.querySelectorAll('.blocklyFlyoutLabelText');
                flyoutLabels.forEach(el => {
                    const txt = (el.textContent || '').trim();
                    if (enToZh[txt] && el.textContent !== enToZh[txt]) {
                        el.textContent = enToZh[txt];
                        translated++;
                    } else if (txt === 'Extensions') {
                        el.textContent = '扩展积木';
                        translated++;
                    } else if (txt === 'Extension') {
                        el.textContent = '扩展';
                        translated++;
                    }
                });

                // Category dot click navigation: let scratch-blocks handle it
                // natively. In multi-category toolbox mode, clicking a dot
                // scrolls the flyout to that category while keeping all other
                // categories' blocks visible below/above. No custom filtering
                // is needed — scratch-blocks' setSelectedItemFactory already
                // does this (toolbox.js:732).

                // Inject a 创建积木 button at the bottom of the flyout.
                // Blockly's flyout and workspace roots are <svg>, so HTML
                // children get zero size. Append to the host div (HTML) and
                // absolute-position over the bottom of the flyout.
                const flyout = document.querySelector('.blocklyFlyout');
                if (!flyout) {
                    // flyout not rendered yet, skip this cycle
                    return false;
                }

                if (translated > 0) {
                    console.log('[ExtBuilder] Translated', translated, 'toolbox category labels to Chinese');
                }
                return translated > 0;
            };
            // Retry up to 5 times (every 200ms) until toolbox DOM is ready
            const translateTimer = setInterval(() => {
                if (translateToolbox()) clearInterval(translateTimer);
            }, 200);
            setTimeout(() => {
                clearInterval(translateTimer);
                translateToolbox(); // one last attempt
            }, 1500);

            // HTML floating preview widget — shown below ANY reporter block
            // (oval or hex shape, i.e. has outputConnection) when clicked.
            const isReporter = (block) => !!block.outputConnection;
            const previewDivs = {}; // block.id -> { div, block }
            var activePreviewBlockId = null;

            const ensurePreviewDiv = (block) => {
                if (!isReporter(block)) return;
                var text = '';
                var vf = block.getField('VALUE');
                if (!vf && block.type === 'logic_boolean') vf = block.getField('BOOL');
                if (!vf && block.type === 'math_number') vf = block.getField('NUM');
                if (vf) {
                    var raw = vf.getValue();
                    if (block.type === 'logic_boolean') {
                        // Show true/false in the white box, not 真/假
                        text = raw === 'TRUE' ? 'true' : 'false';
                    } else {
                        text = raw || '';
                    }
                }
                // For blocks whose VALUE field is empty (return blocks with
                // nothing plugged in), fall through to the code generator
                // to show the actual computed value.
                if (!text) {
                    try {
                        var fn = CODE_GENERATORS[block.type];
                        if (typeof fn === 'function') {
                            var code = fn(block);
                            if (Array.isArray(code)) code = code[0];
                            code = String(code || '');

                            // Build a sandbox with a stub runtime so blocks
                            // like mouseX / timer can produce real-looking values.
                            var sandbox = {
                                Math: Math,
                                String: String,
                                Number: Number,
                                Array: Array,
                                // Common scratch runtime objects referenced by code
                                runtime: {
                                    ioDevices: {
                                        mouse: {
                                            getScratchX: function () { return window.mouseX || 0; },
                                            getScratchY: function () { return window.mouseY || 0; },
                                            getIsDown: function () { return false; }
                                        },
                                        keyboard: {
                                            getKeyIsDown: function () { return false; }
                                        }
                                    },
                                    currentMSecs: 0,
                                    frameRate: 30,
                                    start: function () {},
                                    stop: function () {},
                                    createClone: function () {},
                                    deleteThisClone: function () {},
                                    broadcast: function () {}
                                },
                                // Stub scratch list/variable references (commonly
                                // appear in list_contains, var_get, etc.)
                                myList: [],
                                list: [],
                                arr: [],
                                __var: 0,
                                __str: '',
                                __bool: false,
                                __arr: []
                            };
                            var keys = Object.keys(sandbox);
                            var vals = keys.map(function (k) { return sandbox[k]; });
                            var fnBody = 'return (' + code + ')';
                            try {
                                var result = (new Function(...keys, fnBody))(...vals);
                                window.__extEvalDebug = {code: code, fnBody: fnBody, result: result};
                            } catch (e2) {
                                // ReferenceError (e.g. undefined variable name from
                                // user's list/var) → boolean blocks fall back to
                                // false, value blocks show the code expression
                                // itself (never a misleading 'false').
                                var blockDef = BLOCK_DEFINITIONS[block.type];
                                var isHex = blockDef && blockDef.output === 'Boolean';
                                if (e2 instanceof ReferenceError ||
                                    /is not defined/.test(e2.message)) {
                                    result = isHex ? false : code;
                                    window.__extEvalErr = e2.message;
                                } else {
                                    result = code; // unknown error → show code
                                    window.__extEvalErr = e2.message;
                                }
                            }
                            // Format the value — booleans always become 'true'/'false'
                            if (typeof result === 'boolean') {
                                text = 'true' === String(result) ? 'true' :
                                       'false' === String(result) ? 'false' : String(result);
                            } else if (typeof result === 'number') {
                                text = Number.isInteger(result) ? String(result) :
                                    code.indexOf('Math.PI') >= 0 ? result.toFixed(6) :
                                    String(Math.round(result * 1000) / 1000);
                            } else if (typeof result === 'string') {
                                text = result;
                            } else if (result === undefined || result === null) {
                                // Undefined result (e.g. list index out of
                                // range) → show the code expression, never
                                // the literal string 'undefined'
                                text = code;
                            } else if (code === 'true' || code === 'false') {
                                text = code;
                            } else {
                                text = String(result);
                            }
                        } else { text = '...'; }
                    } catch (e) { text = '...'; }
                }
                var entry = previewDivs[block.id];
                if (!entry) {
                    var wrap = document.createElement('div');
                    wrap.className = 'ext-value-preview';
                    wrap.style.cssText = [
                        'position:absolute','z-index:999',
                        'background:#ffffff','border:1px solid #cccccc',
                        'border-radius:8px',
                        'box-shadow:0 1px 2px rgba(0,0,0,0.15),0 3px 12px rgba(0,0,0,0.2),0 6px 24px rgba(0,0,0,0.1)',
                        'padding:4px 6px',
                        'font-family:Helvetica,Arial,sans-serif','font-size:13px','font-weight:500',
                        'color:#222222',
                        'white-space:nowrap','text-align:center',
                        'display:inline-flex','align-items:center','gap:6px',
                        'display:none','transition:opacity 0.15s ease','opacity:0',
                        'pointer-events:auto'
                    ].join(';');

                    var span = document.createElement('span');
                    span.className = 'ext-value-text';
                    span.style.cssText = 'min-width:18px; user-select:text;';

                    var btn = document.createElement('button');
                    btn.className = 'ext-value-copy';
                    btn.textContent = '\uD83D\uDCCB';
                    btn.title = '\u590D\u5236\u8FD4\u56DE\u503C';
                    btn.style.cssText = [
                        'background:none','border:none','cursor:pointer',
                        'font-size:12px','padding:1px 3px','margin:0',
                        'line-height:1','opacity:0.5',
                        'border-radius:4px'
                    ].join(';');
                    btn.onmouseenter = function () { this.style.opacity = '1'; };
                    btn.onmouseleave = function () { this.style.opacity = '0.5'; };
                    btn.onclick = function (e) {
                        e.stopPropagation();
                        var txt = span.textContent || '';
                        if (navigator.clipboard) {
                            navigator.clipboard.writeText(txt).then(function () {
                                btn.textContent = '\u2714\uFE0F';
                                setTimeout(function () { btn.textContent = '\uD83D\uDCCB'; }, 1200);
                            });
                        }
                    };

                    wrap.appendChild(span);
                    wrap.appendChild(btn);
                    document.body.appendChild(wrap);
                    entry = { div: wrap, span: span };
                    previewDivs[block.id] = entry;
                }
                entry.block = block;
                // Hex blocks (output: 'Boolean') MUST show only true / false
                var def = BLOCK_DEFINITIONS[block.type];
                var isHexBlock = def && def.output === 'Boolean';
                if (isHexBlock) {
                    if (text !== 'true' && text !== 'false') {
                        text = (!text || text === '...' || text === '0') ? 'false' : 'true';
                    }
                }
                entry.span.textContent = text || '...';
            };

            const showPreview = (block) => {
                var entry = previewDivs[block.id];
                if (!entry) return;
                var svgRoot = block.getSvgRoot();
                if (!svgRoot) return;
                var rect = svgRoot.getBoundingClientRect();
                var div = entry.div;
                // Cancel any pending fade-out timer
                if (div._fadeTimer) { clearTimeout(div._fadeTimer); div._fadeTimer = null; }
                div.style.display = 'inline-flex';
                div.style.left = (rect.left + rect.width / 2) + 'px';
                div.style.top = (rect.bottom + 4) + 'px';
                div.style.opacity = '1';
                activePreviewBlockId = block.id;
            };

            const hideAllPreviews = () => {
                activePreviewBlockId = null;
                var ids = Object.keys(previewDivs);
                for (var i = 0; i < ids.length; i++) {
                    var div = previewDivs[ids[i]].div;
                    div.style.opacity = '0';
                    // Hide after fade completes — store handle to cancel on re-show
                    div._fadeTimer = setTimeout(function (d) {
                        d.style.display = 'none';
                    }.bind(null, div), 120);
                }
            };

            const repositionActive = () => {
                if (!activePreviewBlockId) return;
                var entry = previewDivs[activePreviewBlockId];
                if (!entry) return;
                var block = entry.block;
                if (!block || !block.workspace) {
                    // Block was deleted — faded hide
                    if (entry.div) { entry.div.style.opacity = '0'; }
                    activePreviewBlockId = null;
                    return;
                }
                var svgRoot = block.getSvgRoot();
                if (!svgRoot) return;
                var rect = svgRoot.getBoundingClientRect();
                entry.div.style.left = (rect.left + rect.width / 2) + 'px';
                entry.div.style.top = (rect.bottom + 4) + 'px';
                entry.div.style.opacity = '1';
            };

            const removePreviewDiv = (block) => {
                var entry = previewDivs[block.id];
                if (entry) {
                    if (entry.div && entry.div.parentNode) {
                        entry.div.parentNode.removeChild(entry.div);
                    }
                    delete previewDivs[block.id];
                }
                if (activePreviewBlockId === block.id) activePreviewBlockId = null;
            };

            // Ensure every reporter block has its hidden div created
            const refreshValueBoxes = () => {
                workspace.getAllBlocks(false).forEach(function (b) {
                    if (!isReporter(b)) { removePreviewDiv(b); return; }
                    ensurePreviewDiv(b);
                });
            };

            // Single capture-phase handler: intercept ALL mousedowns before
            // any Blockly handler. Decision matrix:
            //  - dropdown text → pass through (Blockly opens dropdown)
            //  - preview block body → stop + show white box
            //  - outside → hide white box
            document.addEventListener('mousedown', function (e) {
                var el = e.target;
                while (el) {
                    if (el.classList && el.classList.contains('ext-value-preview')) return;
                    el = el.parentNode;
                }
                // Walk up to find what was clicked
                var clickedBlockId = null;
                var onDropdownText = false;
                var inDropDown = false;
                el = e.target;
                while (el) {
                    // Skip if clicking inside Blockly's dropdown menu
                    if (el.classList && (
                        el.classList.contains('blocklyDropDownDiv') ||
                        el.classList.contains('blocklyWidgetDiv'))) {
                        inDropDown = true;
                    }
                    if (el.classList && el.classList.contains('blocklyDropdownText')) {
                        onDropdownText = true;
                    }
                    if (el.classList && el.classList.contains('blocklyDraggable')) {
                        clickedBlockId = el.getAttribute('data-id');
                        break;
                    }
                    el = el.parentElement;
                }
                // Dropdown area → let Blockly handle everything, keep preview
                if (onDropdownText || inDropDown) {
                    window.__extDropClick = (window.__extDropClick||0)+1;
                    return;
                }
                // Preview block body → show white box
                if (clickedBlockId && previewDivs[clickedBlockId]) {
                    var blk = workspace.getBlockById(clickedBlockId);
                    if (blk && isReporter(blk)) {
                        // Boolean block: stop event so Blockly doesn't open dropdown
                        if (blk.type === 'logic_boolean') {
                            e.stopImmediatePropagation();
                        }
                        showPreview(blk);
                        return;
                    }
                }
                // Outside → hide white box, let event continue to Blockly
                hideAllPreviews();
            }, true); // capture phase

            // MutationObserver on workspace SVG — refresh divs and
            // reposition active preview when DOM changes
            try {
                var svgCanvas = workspace.getCanvas();
                if (svgCanvas && window.MutationObserver) {
                    var valueBoxObserver = new MutationObserver(function () {
                        refreshValueBoxes();
                        repositionActive();
                    });
                    valueBoxObserver.observe(svgCanvas, {
                        childList: true, subtree: true,
                        attributes: false, characterData: true
                    });
                }
            } catch (e) {
                console.warn('Could not set up value box observer:', e);
            }

            // Hat-block visual fix: the top curve is drawn at negative-y
            // coordinates and gets clipped, so shift every hat block's
            // group down by 18px to bring the curve into view.
            try {
                const hatFix = () => {
                    if (!svgCanvas) return;
                    svgCanvas.querySelectorAll('.blocklyDraggable[data-shapes~="hat"]').forEach(function (g) {
                        if (g.getAttribute('data-hat-fixed') === '1') return;
                        g.setAttribute('data-hat-fixed', '1');
                        const cur = g.getAttribute('transform') || '';
                        const m = cur.match(/translate\(([^)]+)\)/);
                        const baseX = m ? Number(m[1].split(',')[0]) || 0 : 0;
                        const baseY = m ? Number(m[1].split(',')[1]) || 0 : 0;
                        g.setAttribute('transform', 'translate(' + baseX + ',' + (baseY + 18) + ')');
                    });
                };
                hatFix();
                if (window.MutationObserver) {
                    new MutationObserver(hatFix).observe(svgCanvas, {childList: true, subtree: true});
                }
            } catch (e) { /* cosmetic — never crash */ }

            // Reposition on drag/zoom/move via Blockly events
            if (typeof workspace.addChangeListener === 'function') {
                workspace.addChangeListener(function (e) {
                    if (e.type === Blockly.Events.UI ||
                        e.type === Blockly.Events.MOVE ||
                        e.type === Blockly.Events.DRAG) {
                        repositionActive();
                    }
                    refreshValueBoxes();
                });
            }
            window.addEventListener('resize', repositionActive);
            if (blocklyDivRef.current) {
                blocklyDivRef.current.addEventListener('scroll', repositionActive);
            }
            // Track mousemove to keep the white box following the block
            // during drags (Blockly uses a drag surface that doesn't
            // trigger DOM events while moving).
            document.addEventListener('mousemove', function (e) {
                if (e.buttons && activePreviewBlockId) {
                    repositionActive();
                }
            });

            // Auto-generate JS code + auto-save workspace XML on every change.
            // Debounced so dragging blocks doesn't re-render the whole UI
            // (including the floating builder window) on every mouse move.
            let wsSaveTimer = null;
            workspace.addChangeListener((event) => {
                try {
                    if (event.type !== Blockly.Events.UI) {
                        if (wsSaveTimer) clearTimeout(wsSaveTimer);
                        wsSaveTimer = setTimeout(() => {
                            try {
                                const code = javascriptGenerator.workspaceToCode(workspace);
                                setGeneratedCode(code);
                                setStatsTick(t => t + 1); // 触发 projectStats 重算
                            } catch (genErr) { /* silent */ }
                            try {
                                const B = window._extBuilderBlockly || window.Blockly;
                                if (B && B.Xml) {
                                    // Save XML to a ref (not React state) so drags
                                    // don't re-render the builder window.
                                    customBlockXmlRef.current.set(currentBlockRef.current,
                                        B.Xml.domToText(B.Xml.workspaceToDom(workspace)));
                                }
                            } catch (saveErr) { /* silent */ }
                        }, 400);
                    }
                    // Keep the value preview label below return
                    // blocks in sync with the actual value.
                    if (event.type === Blockly.Events.BLOCK_CHANGE && event.blockId) {
                        const changed = workspace.getBlockById(event.blockId);
                        if (!changed) return;
                        if (changed.type === 'control_return' ||
                            changed.type === 'control_inlineReturn' ||
                            changed.type === 'func_return') {
                            const label = changed.getField('VALUE');
                            if (label) {
                                const v = javascriptGenerator.valueToCode(changed, 'VALUE', 0) || '';
                                label.setValue(v);
                            }
                        }
                    }
                    // Remove preview divs for deleted blocks
                    if (event.type === Blockly.Events.DELETE && event.oldBlockIds) {
                        for (var i = 0; i < event.oldBlockIds.length; i++) {
                            var did = event.oldBlockIds[i];
                            if (previewDivs[did] && previewDivs[did].parentNode) {
                                previewDivs[did].parentNode.removeChild(previewDivs[did]);
                            }
                            delete previewDivs[did];
                        }
                    }
                    refreshValueBoxes();
                } catch (e) {
                    console.error('Code generation error:', e);
                }
            });


            // Attach to window for debugging
            window._extBuilderWorkspace = workspace;
            window._extBuilderBlockly = Blockly;
            window._extBuilderGenerator = javascriptGenerator;
            window._extBuilderCustomBlocks = customBlocks;

            // Seed the workspace with starter blocks for every existing
            // customBlock so the canvas is populated immediately. Subsequent
            // starter blocks are added by handleCreateBlock.
            customBlocks.forEach((b) => {
                addStarterBlocks(workspace, Blockly, b.name, b.id, b.blockType);
            });
            if (customBlocks.length) {
                const first = findBlockByCustomId(workspace, customBlocks[0].id);
                if (first && workspace.select) {
                    workspace.select(first);
                }
            }

            workspaceRef.current = workspace;
            setWorkspaceLoaded(true);
            // 清理主工作区重复块（防御注入瞬间出现的副本，如 target_clone
            // 有时会被复制成 2 个，残留一个孤立椭圆显示在屏幕左上角）
            try {
                const seen = new Set();
                workspace.getTopBlocks(true).forEach(b => {
                    const key = (b.type || '?') + ':' + (b.getFieldValue && (b.getFieldValue('NAME') || b.getFieldValue('TYPE') || ''));
                    if (seen.has(key)) b.dispose(false);
                    else seen.add(key);
                });
            } catch (e) { /* 清理失败无关紧要 */ }
            // 拖动结束 + 工具箱 flyout 拖动时：清理任何独立显示的 ghost 元素
            // （scratch-blocks 拖动带 input_value 字段的块时，字段会作为 ghost
            // 在屏幕外独立显示——比如截图1里左上角孤立显示"克隆体"的椭圆）
            try {
                const INPUT_VALUE = (Blockly.inputsValue || Blockly.INPUT_VALUE || 1);
                const hideInputGhosts = () => {
                    // 1) 隐藏所有 .blocklyInputRow 元素（input_value 字段 SVG 容器）
                    //    如果它们不在任何 block 主体内（孤立显示）
                    //    同时清理 main workspace 和 dragSurface 内部
                    ['.blocklyMainWorkspace', '.blocklyBlockDragSurface'].forEach(function(sel) {
                        const svg = document.querySelector(sel);
                        if (!svg) return;
                        svg.querySelectorAll('.blocklyInputRow').forEach(row => {
                            if (!row.closest('.blocklyDraggable')) {
                                row.style.display = 'none';
                            }
                        });
                    });
                    // 2) 拖动结束后强制隐藏 blocklyBlockDragSurface
                    const ds = document.querySelector('.blocklyBlockDragSurface');
                    if (ds && !(workspace.isDragging && workspace.isDragging())) {
                        ds.style.display = 'none';
                    }
                };
                workspace.addChangeListener((event) => {
                    if (event && event.type === Blockly.Events.BLOCK_CREATE) {
                        // 延后一毫秒再隐藏（等块内的脱联 input_value 字段创建出来）
                        setTimeout(hideInputGhosts, 0);
                    }
                });
                // 兜底：每次 mouseup 后再清理一次（拖动结束时也可能有 ghost 残留）
                const injectionDiv = workspace.getInjectionDiv();
                if (injectionDiv) {
                    injectionDiv.addEventListener('pointerup', () => {
                        setTimeout(hideInputGhosts, 50);
                    });
                }
                // 终极兜底：每 200ms 检查 blocklyBlockDragSurface，非拖动时强制 hide
                // （scratch-blocks 拖动时 set display:block，mouseup 后偶尔不重置）
                const dragSurfaceWatcher = setInterval(() => {
                    const ds = document.querySelector('.blocklyBlockDragSurface');
                    if (!ds) return;
                    const isDragging = !!(workspace.isDragging && workspace.isDragging());
                    const dsHasContent = (ds.children[0] && ds.children[0].childNodes.length > 0);
                    if (!isDragging && dsHasContent) {
                        ds.style.display = 'none';
                    } else if (!isDragging && ds.style.display !== 'none') {
                        ds.style.display = 'none';
                    }
                }, 200);
                // 终极 v6：覆写 BlockDragSurfaceSvg.setBlocksAndShow——
                // 拖动开始时立即隐藏拖动副本里的 input 字段（不依赖 CSS 选择器）
                try {
                    const BlockDragSurfaceSvg = Blockly.BlockDragSurfaceSvg;
                    if (BlockDragSurfaceSvg && BlockDragSurfaceSvg.prototype) {
                        const origSetBlocks = BlockDragSurfaceSvg.prototype.setBlocksAndShow;
                        BlockDragSurfaceSvg.prototype.setBlocksAndShow = function(blocks) {
                            const result = origSetBlocks.call(this, blocks);
                            // 立即隐藏拖动副本中所有 input 字段
                            if (this.dragGroup_) {
                                this.dragGroup_.querySelectorAll(
                                    'g.blocklyInputRow, path:not(.blocklyBlockBackground), ' +
                                    'path[data-argument-type], ellipse, rect.blocklyInputRow, .blocklyShape'
                                ).forEach(el => {
                                    el.style.display = 'none';
                                });
                            }
                            return result;
                        };
                    }
                } catch (e) { /* 覆写失败无关紧要 */ }
                // 终极 v7：监听主工作区 blocklyBlockCanvas 上的元素新增
                // 任何不在 blocklyDraggable 内的 input socket 立即隐藏
                // （用户拖动时主工作区会出现跟随鼠标的孤立 input ghost）
                try {
                    const mainCanvas = document.querySelector('.blocklyBlockCanvas');
                    if (mainCanvas && window.MutationObserver) {
                        const mainOrphanObserver = new MutationObserver((mutations) => {
                            mutations.forEach(m => {
                                m.addedNodes.forEach(node => {
                                    if (node && node.querySelectorAll) {
                                        node.querySelectorAll(
                                            'g.blocklyInputRow, ' +
                                            'path:not(.blocklyBlockBackground), ' +
                                            'path[data-argument-type], ' +
                                            'ellipse, rect.blocklyInputRow, .blocklyShape'
                                        ).forEach(el => {
                                            if (!el.closest('.blocklyDraggable')) {
                                                el.style.display = 'none';
                                            }
                                        });
                                    }
                                });
                            });
                        });
                        mainOrphanObserver.observe(mainCanvas, {childList: true, subtree: true});
                    }
                } catch (e) { /* observer 失败无关紧要 */ }
                // 终极 v8：监听 scratch-blocks 拖动表面（避免 document.body 监听导致 reflow 警告）
                try {
                    if (window.MutationObserver) {
                        const dragSurf = document.querySelector('.blocklyBlockDragSurface');
                        const mainCanvas = document.querySelector('.blocklyBlockCanvas');
                        const bubbleCanvas = document.querySelector('.blocklyBubbleCanvas');
                        const targets = [dragSurf, mainCanvas, bubbleCanvas].filter(Boolean);
                        targets.forEach(function(target) {
                            try {
                                const obs = new MutationObserver(function(mutations) {
                                    mutations.forEach(m => {
                                        m.addedNodes.forEach(node => {
                                            if (node && node.querySelectorAll) {
                                                node.querySelectorAll(
                                                    'g.blocklyInputRow, ' +
                                                    'path:not(.blocklyBlockBackground), ' +
                                                    'path[data-argument-type], ' +
                                                    'ellipse, rect.blocklyInputRow, .blocklyShape, ' +
                                                    'g.blocklyInsertionMarker, .blocklyInsertionMarker'
                                                ).forEach(el => {
                                                    if (!el.closest('.blocklyDraggable')) {
                                                        el.style.display = 'none';
                                                    }
                                                });
                                            }
                                        });
                                    });
                                });
                                obs.observe(target, {childList: true, subtree: true});
                            } catch (e) { /* 单个 observer 失败无关紧要 */ }
                        });
                    }
                } catch (e) { /* observer 失败无关紧要 */ }
                // 终极 v10：暴力兜底 —— 任何 fill="#529552" 元素不在 blocklyDraggable 内立即隐藏
                // 覆盖 v9 漏掉的所有 input socket 形状
                try {
                    if (window.MutationObserver) {
                        const v10obs = new MutationObserver(function(mutations) {
                            mutations.forEach(m => {
                                m.addedNodes.forEach(node => {
                                    if (node && node.querySelectorAll) {
                                        node.querySelectorAll('[fill="#529552"], [fill="#0FBD8C"]').forEach(el => {
                                            if (!el.closest('.blocklyDraggable')) {
                                                el.style.display = 'none';
                                            }
                                        });
                                    }
                                });
                            });
                        });
                        v10obs.observe(document.body, {childList: true, subtree: true, attributes: true});
                    }
                } catch (e) { /* v10 失败无关紧要 */ }
                // 终极兜底：MutationObserver 监听 dragSurface 内部的孤立 inputRow
                // 任何新加入的 inputRow 如果不在 .blocklyDraggable 内则立即 hide
                try {
                    const dsEl = document.querySelector('.blocklyBlockDragSurface');
                    if (dsEl && window.MutationObserver) {
                        const dsObserver = new MutationObserver((mutations) => {
                            mutations.forEach(m => {
                                m.addedNodes.forEach(node => {
                                    if (node && node.querySelectorAll) {
                                        node.querySelectorAll('.blocklyInputRow').forEach(row => {
                                            if (!row.closest('.blocklyDraggable')) {
                                                row.style.display = 'none';
                                            }
                                        });
                                    }
                                });
                            });
                        });
                        dsObserver.observe(dsEl, {childList: true, subtree: true});
                    }
                } catch (e) { /* observer 失败无关紧要 */ }
                // 页面卸载时清除定时器
                if (workspace.dispose) {
                    const origDispose = workspace.dispose.bind(workspace);
                    workspace.dispose = function() {
                        clearInterval(dragSurfaceWatcher);
                        return origDispose();
                    };
                }
            } catch (e) { /* drag 监听失败无关紧要 */ }
            return () => {
                clearTimeout(resizeTimer);
            };
        } catch (e) {
            console.error('Failed to initialize Blockly:', e);
            setLoadError('Blockly initialization failed: ' + (e.message || String(e)));
            return undefined;
        }
    }, [loaded, workspaceLoaded]);

    // 插件激活（独立 effect）：workspace 就绪后激活 ExtAddons。
    // 必须放在独立 useEffect 里——若与 workspace 初始化同 effect，
    // setWorkspaceLoaded(true) 会让 effect 重新运行并先执行 cleanup，
    // 把刚激活的插件全部卸载。
    useEffect(() => {
        if (!workspaceLoaded || !workspaceRef.current) return;
        const Blockly = window._extBuilderBlockly || window.Blockly;
        if (!Blockly) return;
        if (extAddonsCleanupRef.current) return; // 已激活
        let cancelled = false;
        applyExtAddons({
            Blockly,
            getWorkspace: () => workspaceRef.current
        }).then(cleanup => {
            if (!cancelled) extAddonsCleanupRef.current = cleanup;
        }).catch(e => console.warn('[ExtAddons] 激活失败:', e));
        return () => {
            cancelled = true;
            if (extAddonsCleanupRef.current) {
                try { extAddonsCleanupRef.current(); } catch (e) { /* silent */ }
                extAddonsCleanupRef.current = null;
            }
        };
    }, [workspaceLoaded]);

    const addStarterBlocks = (workspace, Blockly, blockName, blockId, blockType, colour) => {
        try {
            // Place a block_define starter for this custom block in workspace.
            // Each starter carries a `data-block-id` attribute so we can map
            // it back to the React customBlocks[] entry.
            const metrics = workspace.getMetrics ? workspace.getMetrics() : null;
            const viewW = (metrics && metrics.viewWidth) || 800;
            const viewH = (metrics && metrics.viewHeight) || 400;

            // Stack new starters below any existing top-level blocks
            const top = workspace.getTopBlocks ? workspace.getTopBlocks(true) : [];
            let bottomY = 60;
            top.forEach(b => {
                const y = (b.getRelativeToSurfaceXY && b.getRelativeToSurfaceXY().y) || 0;
                const h = b.height || 40;
                bottomY = Math.max(bottomY, y + h + 20);
            });
            const startX = Math.max(40, viewW / 2 - 60);
            const startY = bottomY;

            const def = workspace.newBlock('block_define');
            if (def) {
                // Tag with data-block-id so we can locate the block later
                const svgRoot = def.getSvgRoot && def.getSvgRoot();
                if (svgRoot && blockId) {
                    svgRoot.setAttribute('data-block-id', blockId);
                }
                const nameField = def.getField('NAME');
                if (nameField) {
                    nameField.setValue(blockName || '我的积木');
                }
                // Store non-rendered metadata used by the code generator
                // (opcode / type / display text) directly on the Blockly block.
                def._opcode = (blockId || 'block').replace(/[^a-zA-Z0-9]/g, '_');
                def._type = (blockType || 'command').toUpperCase() === 'BOOLEAN' ? 'BOOLEAN'
                    : (blockType || 'command').toUpperCase() === 'REPORTER' ? 'REPORTER'
                        : (blockType || 'command').toUpperCase() === 'HAT' ? 'HAT'
                            : (blockType || 'command').toUpperCase() === 'CONDITIONAL' ? 'CONDITIONAL'
                                : 'COMMAND';
                def._text = '[' + (blockName || 'block') + ']';
                // 积木自定义颜色（hex，如 #FF6680）；留空使用默认色
                if (colour) {
                    try { def.setColour(colour); } catch (e) { /* 忽略非法色 */ }
                }
                // 定义扩展的积木块禁止一切删除（拖动/右键/Delete 键），
                // 防止用户误删导致工作区与代码面板失去对应关系。
                def.setDeletable(false);
                def.initSvg();
                def.moveBy(startX, startY);
                def.render();
            }
            console.log('[ExtBuilder] Starter block added for "' + blockName + '" (id=' + blockId + '). Block count:', workspace.getAllBlocks(false).length);
        } catch (e) {
            console.warn('Failed to add starter block:', e);
        }
    };

    // Find a top-level block_define carrying a given customBlock id
    const findBlockByCustomId = (workspace, blockId) => {
        if (!workspace || !blockId) return null;
        const tops = workspace.getTopBlocks(true);
        for (let i = 0; i < tops.length; i++) {
            const t = tops[i];
            if (t.type !== 'block_define') continue;
            const svg = t.getSvgRoot && t.getSvgRoot();
            if (svg && svg.getAttribute('data-block-id') === blockId) return t;
        }
        return null;
    };

    // Save current workspace to the active block's xml ref
    const saveCurrentWorkspace = useCallback(() => {
        if (!workspaceRef.current) return;
        try {
            const B = window._extBuilderBlockly || window.Blockly;
            const xml = B.Xml.domToText(B.Xml.workspaceToDom(workspaceRef.current));
            customBlockXmlRef.current.set(currentBlockRef.current, xml);
        } catch (e) {
            console.warn('Failed to save workspace:', e);
        }
    }, []);

    // Load a block's workspace into the current workspace
    const loadBlockWorkspace = useCallback((blockId, blockName) => {
        if (!workspaceRef.current) return;
        try {
            const ws = workspaceRef.current;
            ws.clear();
            const block = customBlocks.find(b => b.id === blockId);
            const B = window._extBuilderBlockly || window.Blockly;
            // Prefer the latest saved XML from the ref (kept in sync with the
            // live workspace via the change listener). Fall back to the
            // initial xml field on first load.
            const savedXml = customBlockXmlRef.current.get(blockId) ||
                (block && block.xml);
            if (savedXml) {
                const dom = B.Xml.textToDom(savedXml);
                B.Xml.domToWorkspace(dom, ws);
            } else {
                addStarterBlocks(ws, B, block?.name || blockName);
            }
            console.log('[ExtBuilder] Loaded workspace for block:', blockName);
        } catch (e) {
            console.warn('Failed to load workspace:', e);
            // Fallback: just add starter
            const ws = workspaceRef.current;
            const B = window._extBuilderBlockly || window.Blockly || {};
            addStarterBlocks(ws, B, blockName);
        }
    }, [customBlocks]);

    // Switch to a block — just highlight/focus the matching top-level
    // block_define; do NOT swap the workspace contents.
    const handleSelectBlock = useCallback((blockId) => {
        if (blockId === currentBlockRef.current) {
            // Even re-selecting the same block — focus the matching starter
            if (workspaceRef.current) {
                const target = findBlockByCustomId(workspaceRef.current, blockId);
                if (target && workspaceRef.current.select) {
                    workspaceRef.current.select(target);
                    if (workspaceRef.current.centerOnBlock) {
                        workspaceRef.current.centerOnBlock(target.id);
                    }
                }
            }
            return;
        }
        saveCurrentWorkspace();
        currentBlockRef.current = blockId;
        setCurrentBlockId(blockId);
        if (workspaceRef.current) {
            const target = findBlockByCustomId(workspaceRef.current, blockId);
            if (target && workspaceRef.current.select) {
                workspaceRef.current.select(target);
                if (workspaceRef.current.centerOnBlock) {
                    workspaceRef.current.centerOnBlock(target.id);
                }
            }
        }
    }, [saveCurrentWorkspace]);

    // Create a new block — append a block_define to the shared workspace
    // (no longer clears or swaps the workspace).
    const handleCreateBlock = useCallback(() => {
        const id = 'block_' + Date.now();
        const name = '我的积木 ' + (customBlocks.length + 1);
        setCustomBlocks(prev => [...prev, {
            id, name, xml: null,
            blockType: 'command', isTerminal: false, isAsync: false,
            attachAllThreads: false, filterSprite: true, filterStage: true, icon: '',
            colour: ''
        }]);
        currentBlockRef.current = id;
        setCurrentBlockId(id);
        if (workspaceRef.current) {
            const B = window._extBuilderBlockly || window.Blockly || {};
            addStarterBlocks(workspaceRef.current, B, name, id, 'command', '');
            // Focus the newly added block so the user sees it immediately
            const created = findBlockByCustomId(workspaceRef.current, id);
            if (created && workspaceRef.current.select) {
                workspaceRef.current.select(created);
            }
        }
    }, [customBlocks.length]);

    // Delete a block — remove from customBlocks AND from the shared workspace
    const handleDeleteBlock = useCallback((blockId) => {
        if (customBlocks.length <= 1) return; // at least one block remains
        // Remove the corresponding top-level block from the workspace
        if (workspaceRef.current) {
            const target = findBlockByCustomId(workspaceRef.current, blockId);
            if (target && target.dispose) target.dispose(false);
        }
        setCustomBlocks(prev => prev.filter(b => b.id !== blockId));
        if (blockId === currentBlockRef.current) {
            // Pick the next visible block — do NOT reload workspace
            const remaining = customBlocks.filter(b => b.id !== blockId);
            const next = remaining[remaining.length - 1];
            if (next) {
                currentBlockRef.current = next.id;
                setCurrentBlockId(next.id);
                if (workspaceRef.current) {
                    const nextBlock = findBlockByCustomId(workspaceRef.current, next.id);
                    if (nextBlock && workspaceRef.current.select) {
                        workspaceRef.current.select(nextBlock);
                    }
                }
            }
        }
    }, [customBlocks]);

    // Rename a block
    const handleRenameBlock = useCallback((blockId, newName) => {
        const trimmed = (newName || '').trim();
        if (!trimmed) return; // ignore empty names
        setCustomBlocks(prev => prev.map(b =>
            b.id === blockId ? {...b, name: trimmed} : b
        ));
        // Sync the block's NAME field on the shared workspace canvas so the
        // hat block renames immediately (CB-ExtGallary behavior).
        if (workspaceRef.current) {
            const defBlock = findBlockByCustomId(workspaceRef.current, blockId);
            if (defBlock) {
                const f = defBlock.getField('NAME');
                if (f) f.setValue(trimmed);
                if (defBlock.render) defBlock.render();
            }
        }
    }, []);

    // Begin inline rename
    const handleStartRename = useCallback((blockId, currentName) => {
        setEditingBlockId(blockId);
        setEditingName(currentName);
    }, []);

    const handleCancelRename = useCallback(() => {
        setEditingBlockId(null);
        setEditingName('');
    }, []);

    const handleCommitRename = useCallback((blockId) => {
        handleRenameBlock(blockId, editingName);
        handleCancelRename();
    }, [editingName, handleRenameBlock, handleCancelRename]);

    // Update a block's metadata (type, filters, icon, etc.) AND sync
    // the matching top-level block_define in the shared workspace.
    const handleUpdateBlock = useCallback((blockId, updates) => {
        setCustomBlocks(prev => prev.map(b =>
            b.id === blockId ? {...b, ...updates} : b
        ));
        // Sync NAME/TYPE fields to the Blockly block
        if (workspaceRef.current) {
            const defBlock = findBlockByCustomId(workspaceRef.current, blockId);
            if (defBlock) {
                if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
                    const f = defBlock.getField('NAME');
                    if (f) f.setValue(updates.name);
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'blockType')) {
                    const f = defBlock.getField('TYPE');
                    if (f) f.setValue(updates.blockType);
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'colour')) {
                    try {
                        if (updates.colour) defBlock.setColour(updates.colour);
                        else defBlock.setColour(290); // 恢复默认紫色
                    } catch (e) { /* 忽略非法色 */ }
                }
            }
        }
    }, []);

    // Upload a block icon
    const handlePickBlockIcon = useCallback((blockId) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                handleUpdateBlock(blockId, {icon: ev.target.result});
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }, [handleUpdateBlock]);

    const handleClearBlockIcon = useCallback((blockId) => {
        handleUpdateBlock(blockId, {icon: ''});
    }, [handleUpdateBlock]);

    // Add a text segment to current block's template
    const handleAddText = useCallback((blockId) => {
        const value = (window.prompt('输入文本片段:') || '').trim();
        if (!value) return;
        setCustomBlocks(prev => prev.map(b => {
            if (b.id !== blockId) return b;
            const parts = Array.isArray(b.parts) ? b.parts : [];
            return {...b, parts: [...parts, {kind: 'text', value}]};
        }));
    }, []);

    // Add an input segment to current block's template
    const handleAddInput = useCallback((blockId) => {
        const name = (window.prompt('输入参数名 (仅 a-z, A-Z):') || '').trim();
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
            window.alert('参数名格式不正确（仅字母数字下划线，开头必须是字母）');
            return;
        }
        setCustomBlocks(prev => prev.map(b => {
            if (b.id !== blockId) return b;
            const parts = Array.isArray(b.parts) ? b.parts : [];
            return {...b, parts: [...parts, {kind: 'input', name, inputType: 'String'}]};
        }));
    }, []);

    // Field-editor handlers (CB-ExtGallary style)
    const handleAddField = useCallback((blockId, kind) => {
        setCustomBlocks(prev => prev.map(b => {
            if (b.id !== blockId) return b;
            const fields = Array.isArray(b.fields) ? b.fields : [];
            const idx = fields.length;
            const newField = kind === 'label'
                ? {kind: 'label', text: '标签' + idx, name: 'F' + idx}
                : kind === 'number'
                    ? {kind: 'number', text: '数字' + idx, default: '0', name: 'F' + idx}
                    : kind === 'boolean'
                        ? {kind: 'boolean', text: '布尔' + idx, default: 'true', name: 'F' + idx}
                        : {kind: 'text', text: '文本' + idx, name: 'F' + idx};
            return {...b, fields: [...fields, newField]};
        }));
    }, []);

    const handleUpdateField = useCallback((blockId, idx, updates) => {
        setCustomBlocks(prev => prev.map(b => {
            if (b.id !== blockId) return b;
            const fields = Array.isArray(b.fields) ? b.fields : [];
            return {...b, fields: fields.map((f, i) => i === idx ? {...f, ...updates} : f)};
        }));
    }, []);

    const handleRemoveField = useCallback((blockId, idx) => {
        setCustomBlocks(prev => prev.map(b => {
            if (b.id !== blockId) return b;
            const fields = Array.isArray(b.fields) ? b.fields : [];
            return {...b, fields: fields.filter((_, i) => i !== idx)};
        }));
    }, []);

    // Save block metadata (already applied via setters, this just confirms + shows summary)
    const handleSaveBlockMeta = useCallback((blockId) => {
        const block = customBlocks.find(b => b.id === blockId);
        if (!block) return;
        const parts = block.parts || [];
        const template = parts
            .map(p => p.kind === 'text' ? p.value : `[${p.name}]`)
            .join('');
        const summary = [
            `名称: ${block.name}`,
            `类型: ${block.blockType}`,
            `结尾: ${block.isTerminal ? '是' : '否'}`,
            `异步: ${block.isAsync ? '是' : '否'}`,
            `附加所有线程: ${block.attachAllThreads ? '是' : '否'}`,
            `在角色中显示: ${block.filterSprite ? '是' : '否'}`,
            `在舞台中显示: ${block.filterStage ? '是' : '否'}`,
            `图标: ${block.icon ? '已设置' : '无'}`,
            `模板: ${template || '(空)'}`
        ].join('\n');
        window.alert('积木已保存:\n\n' + summary);
    }, [customBlocks]);

    // Extension settings (creation) modal
    const handleOpenSettings = useCallback(() => {
        setSettingsDraft({...extInfo});
        setShowSettingsPanel(true);
        setSettingsTab('editor');
    }, [extInfo]);

    const handleCloseSettings = useCallback(() => {
        setShowSettingsPanel(false);
        setSettingsDraft(null);
        setSettingsMinimized(false);
        setSettingsMaximized(false);
    }, []);

    // ─── 设置悬浮框：拖动 / 拉伸 / 最大化 ───
    const settingsDragRef = useRef(null);
    const settingsResizeRef = useRef(null);
    const settingsResizeLayerRef = useRef(null);

    // 将拉伸层定位到面板当前 rect（覆盖面板边缘，手柄才贴边可点）
    const syncSettingsResizeLayerPos = useCallback(() => {
        const panel = settingsPanelRef.current;
        const layer = settingsResizeLayerRef.current;
        if (!panel || !layer) return;
        const rect = panel.getBoundingClientRect();
        layer.style.top = rect.top + 'px';
        layer.style.left = rect.left + 'px';
        layer.style.width = rect.width + 'px';
        layer.style.height = rect.height + 'px';
    }, []);

    const settingsSyncResizeLayer = useCallback(() => {
        const panel = settingsPanelRef.current;
        if (!panel) return;
        if (panel.style.display === 'none' || settingsMaximized) { setSettingsResizeLayerOn(false); return; }
        setSettingsResizeLayerOn(true);
    }, [settingsMaximized]);

    const handleSettingsHeaderMouseDown = useCallback((e) => {
        if (settingsMaximized) return;
        // 以下区域不触发拖拽：按钮 / tab / 表单控件 / 可滚动内容列表 / 拉伸手柄
        if (e.target.closest('.ext-float-btn')) return;
        if (e.target.closest('.ext-settings-tab')) return;
        if (e.target.closest('.ext-float-resize-handle')) return;
        if (e.target.closest('button, input, select, textarea, a, label, .ext-market-grid')) return;
        const panel = settingsPanelRef.current;
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        // 锁定宽度：防止 width:auto 被 content 撑开后右边缘贴屏
        const lockedWidth = panel.style.width || (panel.offsetWidth + 'px');
        settingsDragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origLeft: rect.left,
            origTop: rect.top,
            lockedWidth: lockedWidth
        };
        e.preventDefault();
    }, [settingsMaximized]);

    const handleSettingsMouseMove = useCallback((e) => {
        const panel = settingsPanelRef.current;
        if (!panel) return;
        if (settingsDragRef.current) {
            const d = settingsDragRef.current;
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            let newLeft = d.origLeft + dx;
            let newTop = d.origTop + dy;
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 60));
            newLeft = Math.max(-panel.offsetWidth + 80, Math.min(newLeft, window.innerWidth - 80));
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
            panel.style.right = 'auto';
            panel.style.width = d.lockedWidth || panel.style.width || (panel.offsetWidth + 'px');
            panel.style.transform = 'none';
            settingsSyncResizeLayer();
            syncSettingsResizeLayerPos();
        } else if (settingsResizeRef.current) {
            const d = settingsResizeRef.current;
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            let newLeft = d.origLeft, newTop = d.origTop, newW = d.origW, newH = d.origH;
            const minW = 420, minH = 360;
            if (d.dir.indexOf('e') !== -1) newW = Math.max(minW, d.origW + dx);
            if (d.dir.indexOf('s') !== -1) newH = Math.max(minH, d.origH + dy);
            if (d.dir.indexOf('w') !== -1) { newW = Math.max(minW, d.origW - dx); newLeft = d.origLeft + (d.origW - newW); }
            if (d.dir.indexOf('n') !== -1) { newH = Math.max(minH, d.origH - dy); newTop = d.origTop + (d.origH - newH); }
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 40));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 40));
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
            panel.style.right = 'auto';
            panel.style.width = newW + 'px';
            panel.style.height = newH + 'px';
            panel.style.transform = 'none';
            settingsSyncResizeLayer();
            syncSettingsResizeLayerPos();
        }
    }, [settingsSyncResizeLayer]);

    const handleSettingsMouseUp = useCallback(() => {
        settingsDragRef.current = null;
        settingsResizeRef.current = null;
        setSettingsResizeLayerOn(false);
    }, []);

    const handleSettingsResizeDown = useCallback((dir) => (e) => {
        if (settingsMaximized) return;
        e.preventDefault();
        e.stopPropagation();
        const panel = settingsPanelRef.current;
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        settingsResizeRef.current = { dir, startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top, origW: rect.width, origH: rect.height };
        setSettingsResizeLayerOn(true);
    }, [settingsMaximized]);

    const handleSettingsToggleMax = useCallback(() => {
        const panel = settingsPanelRef.current;
        if (!panel) return;
        if (!settingsMaximized) {
            const rect = panel.getBoundingClientRect();
            settingsBoundsRef.current = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
            panel.style.top = '8px';
            panel.style.left = '8px';
            panel.style.right = '8px';
            panel.style.width = '';
            panel.style.height = 'calc(100vh - 16px)';
            panel.style.transform = 'none';
            setSettingsMaximized(true);
        } else {
            if (settingsBoundsRef.current) {
                panel.style.top = settingsBoundsRef.current.top + 'px';
                panel.style.left = settingsBoundsRef.current.left + 'px';
                panel.style.right = 'auto';
                panel.style.width = settingsBoundsRef.current.width + 'px';
                panel.style.height = settingsBoundsRef.current.height + 'px';
                panel.style.transform = 'none';
            }
            setSettingsMaximized(false);
        }
        settingsSyncResizeLayer();
        syncSettingsResizeLayerPos();
    }, [settingsMaximized, settingsSyncResizeLayer, syncSettingsResizeLayerPos]);

    const handleSettingsToggleMin = useCallback(() => {
        const panel = settingsPanelRef.current;
        if (!panel) return;
        setSettingsMinimized(prev => !prev);
        settingsSyncResizeLayer();
        syncSettingsResizeLayerPos();
    }, [settingsSyncResizeLayer, syncSettingsResizeLayerPos]);

    // 全局鼠标监听（拖动/拉伸）
    useEffect(() => {
        if (!showSettingsPanel) return;
        const move = (e) => handleSettingsMouseMove(e);
        const up = () => handleSettingsMouseUp();
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        // 面板打开后同步拉伸层定位（等面板渲染完成）
        const raf = requestAnimationFrame(syncSettingsResizeLayerPos);
        return () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            cancelAnimationFrame(raf);
        };
    }, [showSettingsPanel, handleSettingsMouseMove, handleSettingsMouseUp, syncSettingsResizeLayerPos]);

    // ─── 统计面板：拖动 / 拉伸 ───
    const syncStatsResizeLayerPos = useCallback(() => {
        const panel = statsPanelRef.current;
        const layer = statsResizeLayerRef.current;
        if (!panel || !layer) return;
        const r = panel.getBoundingClientRect();
        layer.style.left = r.left + 'px';
        layer.style.top = r.top + 'px';
        layer.style.width = r.width + 'px';
        layer.style.height = r.height + 'px';
    }, []);

    const handleStatsHeaderMouseDown = useCallback((e) => {
        if (e.target.closest('.ext-float-btn')) return;
        const panel = statsPanelRef.current;
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        statsDragRef.current = { startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top };
        e.preventDefault();
    }, []);

    const handleStatsMouseMove = useCallback((e) => {
        const panel = statsPanelRef.current;
        if (!panel) return;
        if (statsDragRef.current) {
            const d = statsDragRef.current;
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            let newLeft = d.origLeft + dx;
            let newTop = d.origTop + dy;
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 60));
            newLeft = Math.max(-panel.offsetWidth + 80, Math.min(newLeft, window.innerWidth - 80));
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
            panel.style.right = 'auto';
            panel.style.transform = 'none';
            syncStatsResizeLayerPos();
        } else if (statsResizeRef.current) {
            const d = statsResizeRef.current;
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            let newLeft = d.origLeft, newTop = d.origTop, newW = d.origW, newH = d.origH;
            const minW = 400, minH = 300;
            if (d.dir.indexOf('e') !== -1) newW = Math.max(minW, d.origW + dx);
            if (d.dir.indexOf('s') !== -1) newH = Math.max(minH, d.origH + dy);
            if (d.dir.indexOf('w') !== -1) { newW = Math.max(minW, d.origW - dx); newLeft = d.origLeft + (d.origW - newW); }
            if (d.dir.indexOf('n') !== -1) { newH = Math.max(minH, d.origH - dy); newTop = d.origTop + (d.origH - newH); }
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 40));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 40));
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
            panel.style.right = 'auto';
            panel.style.width = newW + 'px';
            panel.style.height = newH + 'px';
            panel.style.transform = 'none';
            syncStatsResizeLayerPos();
        }
    }, [syncStatsResizeLayerPos]);

    const handleStatsMouseUp = useCallback(() => {
        statsDragRef.current = null;
        statsResizeRef.current = null;
    }, []);

    const handleStatsResizeDown = useCallback((dir) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        const panel = statsPanelRef.current;
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        statsResizeRef.current = { dir, startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top, origW: rect.width, origH: rect.height };
    }, []);

    useEffect(() => {
        if (!showStatsPanel) return;
        const move = (e) => handleStatsMouseMove(e);
        const up = () => handleStatsMouseUp();
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        const raf = requestAnimationFrame(syncStatsResizeLayerPos);
        return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); cancelAnimationFrame(raf); };
    }, [showStatsPanel, handleStatsMouseMove, handleStatsMouseUp, syncStatsResizeLayerPos]);

    // ─── 用户面板悬浮框：拖动 / 拉伸 / 最大化 / 最小化 ───
    const userDragRef = useRef(null);
    const userResizeRef = useRef(null);

    const openUserPanel = useCallback((type) => {
        setUserPanelType(type);
        setUserMinimized(false);
        setUserMaximized(false);
        // 关闭其他用户面板状态
        setShowProfilePanel(false);
        setShowFriendsPanel(false);
        setShowSavesPanel(false);
    }, []);

    const closeUserPanel = useCallback(() => {
        setUserPanelType(null);
        setUserMinimized(false);
        setUserMaximized(false);
    }, []);

    const handleUserHeaderMouseDown = useCallback((e) => {
        if (userMaximized) return;
        if (e.target.closest('.ext-float-btn')) return;
        const panel = userFloatRef.current;
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        userDragRef.current = { startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top };
        e.preventDefault();
    }, [userMaximized]);

    const handleUserMouseMove = useCallback((e) => {
        const panel = userFloatRef.current;
        if (!panel) return;
        if (userDragRef.current) {
            const d = userDragRef.current;
            const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
            let newLeft = d.origLeft + dx, newTop = d.origTop + dy;
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 60));
            newLeft = Math.max(-panel.offsetWidth + 80, Math.min(newLeft, window.innerWidth - 80));
            panel.style.left = newLeft + 'px'; panel.style.top = newTop + 'px';
            panel.style.right = 'auto'; panel.style.transform = 'none';
        } else if (userResizeRef.current) {
            const d = userResizeRef.current;
            const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
            let newLeft = d.origLeft, newTop = d.origTop, newW = d.origW, newH = d.origH;
            const minW = 420, minH = 360;
            if (d.dir.indexOf('e') !== -1) newW = Math.max(minW, d.origW + dx);
            if (d.dir.indexOf('s') !== -1) newH = Math.max(minH, d.origH + dy);
            if (d.dir.indexOf('w') !== -1) { newW = Math.max(minW, d.origW - dx); newLeft = d.origLeft + (d.origW - newW); }
            if (d.dir.indexOf('n') !== -1) { newH = Math.max(minH, d.origH - dy); newTop = d.origTop + (d.origH - newH); }
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 40));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 40));
            panel.style.left = newLeft + 'px'; panel.style.top = newTop + 'px';
            panel.style.right = 'auto'; panel.style.width = newW + 'px'; panel.style.height = newH + 'px';
            panel.style.transform = 'none';
        }
    }, []);

    const handleUserMouseUp = useCallback(() => { userDragRef.current = null; userResizeRef.current = null; setUserResizeLayerOn(false); }, []);

    const handleUserResizeDown = useCallback((dir) => (e) => {
        if (userMaximized) return; e.preventDefault(); e.stopPropagation();
        const panel = userFloatRef.current; if (!panel) return;
        const rect = panel.getBoundingClientRect();
        userResizeRef.current = { dir, startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top, origW: rect.width, origH: rect.height };
        setUserResizeLayerOn(true);
    }, [userMaximized]);

    const handleUserToggleMax = useCallback(() => {
        const panel = userFloatRef.current; if (!panel) return;
        if (!userMaximized) {
            const rect = panel.getBoundingClientRect();
            userFloatSavedBounds.current = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
            panel.style.top = '8px'; panel.style.left = '8px'; panel.style.right = '8px';
            panel.style.width = ''; panel.style.height = 'calc(100vh - 16px)'; panel.style.transform = 'none';
            setUserMaximized(true);
        } else {
            if (userFloatSavedBounds.current) {
                panel.style.top = userFloatSavedBounds.current.top + 'px';
                panel.style.left = userFloatSavedBounds.current.left + 'px'; panel.style.right = 'auto';
                panel.style.width = userFloatSavedBounds.current.width + 'px';
                panel.style.height = userFloatSavedBounds.current.height + 'px'; panel.style.transform = 'none';
            }
            setUserMaximized(false);
        }
    }, [userMaximized]);

    const handleUserToggleMin = useCallback(() => { setUserMinimized(v => !v); }, []);

    // 用户面板全局鼠标监听
    useEffect(() => {
        if (!userPanelType) return;
        const move = (e) => handleUserMouseMove(e);
        const up = () => handleUserMouseUp();
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    }, [userPanelType, handleUserMouseMove, handleUserMouseUp]);

    // 打开设置面板并直接切到插件标签页（供原插件按钮入口复用）
    const handleOpenAddonsInSettings = useCallback(() => {
        setShowSettingsPanel(true);
        setSettingsTab('addons');
    }, []);

    // ---- Block preview: render each block in a hidden workspace, capture SVG XML ----
    const [previewBlocks, setPreviewBlocks] = useState([]);
    const [panelPreviewSvg, setPanelPreviewSvg] = useState('');
    const previewHostRef = useRef(null);
    const previewWorkspaceRef = useRef(null);
    const panelPreviewRef = useRef(null);
    const panelWorkspaceRef = useRef(null);

    const handleOpenPreview = useCallback(() => {
        setShowBlockPreview(true);
    }, []);

    const handleClosePreview = useCallback(() => {
        setShowBlockPreview(false);
        setPreviewBlocks([]);
    }, []);

    // Render customBlock previews — each customBlock becomes a *finished*
    // scratch block (matching AstraEditor preview behaviour). The block
    // shows the user-supplied NAME followed by all the fields as inputs,
    // just like a normal Scratch command block would render.
    useEffect(() => {
        if (!showBlockPreview || !previewHostRef.current) return;
        const host = previewHostRef.current;
        if (!previewWorkspaceRef.current) {
            previewWorkspaceRef.current = Blockly.inject(host, {
                renderer: 'scratch',
                toolbox: '<xml></xml>',
                sounds: false,
                trashcan: false,
                scrollbars: false,
                zoom: {controls: false, wheel: false, startScale:1},
                grid: {spacing: 8, length: 1, colour: '#fff', snap: false},
                collapse: false
            });
        }
        const ws = previewWorkspaceRef.current;
        ws.getTopBlocks().forEach(b => b.dispose(false));

        const items = [];
        let yOffset = 8;
        customBlocks.forEach(function (cb, idx) {
            const svgXml = renderCustomBlockToSvg(ws, cb, idx);
            if (!svgXml) return;
            // Estimate height from svg width attr for stacking
            const m = svgXml.match(/height="(\d+)"/);
            const h = m ? Number(m[1]) : 40;
            items.push({
                type: cb.name || ('我的积木 ' + (idx + 1)),
                label: cb.name || ('我的积木 ' + (idx + 1)),
                svgXml: svgXml
            });
            yOffset += Math.max(20, h) + 4;
        });
        setPreviewBlocks(items);
    }, [showBlockPreview, customBlocks]);

    // Live preview of the currently-edited customBlock inside the builder
    // panel's "积木预览" zone. Re-renders whenever the active block or its
    // fields / blockType change — renders a REAL Scratch block SVG.
    useEffect(() => {
        const cb = customBlocks.find(b => b.id === currentBlockId);
        if (!cb || !panelPreviewRef.current) {
            setPanelPreviewSvg('');
            return;
        }
        const host = panelPreviewRef.current;
        if (!panelWorkspaceRef.current) {
            panelWorkspaceRef.current = Blockly.inject(host, {
                renderer: 'scratch',
                toolbox: '<xml></xml>',
                sounds: false,
                trashcan: false,
                scrollbars: false,
                zoom: {controls: false, wheel: false, startScale:1},
                grid: {spacing: 8, length: 1, colour: '#fff', snap: false},
                collapse: false
            });
        }
        const ws = panelWorkspaceRef.current;
        ws.getTopBlocks().forEach(b => b.dispose(false));
        const idx = customBlocks.findIndex(b => b.id === currentBlockId);
        setPanelPreviewSvg(renderCustomBlockToSvg(ws, cb, Math.max(0, idx)));
    }, [currentBlockId, customBlocks, activeTab]);

    const handleApplySettings = useCallback(() => {
        if (!settingsDraft) return;
        const trimmed = settingsDraft.name.trim() || DEFAULT_EXTENSION_INFO.name;
        const id = settingsDraft.customId
            ? (settingsDraft.id.trim() || DEFAULT_EXTENSION_INFO.id)
            : DEFAULT_EXTENSION_INFO.id;
        // TurboWarp / scratch-vm only accepts ids matching /^[a-z0-9]+$/i
        // (letters and digits only — no hyphens, underscores, or other
        // punctuation).
        const safeId = id.toLowerCase().replace(/[^a-z0-9]/g, '') || 'myextension';
        setExtInfo({...settingsDraft, name: trimmed, id: safeId});
        handleCloseSettings();
    }, [settingsDraft]);

    const handlePickColor = useCallback((preset) => {
        if (!settingsDraft) return;
        setSettingsDraft({
            ...settingsDraft,
            color1: preset[0],
            color2: preset[1],
            color3: preset[2]
        });
    }, [settingsDraft]);

    const handlePickIcon = useCallback((targetKey) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file || !settingsDraft) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                setSettingsDraft(d => d ? {...d, [targetKey]: ev.target.result} : d);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }, [settingsDraft]);

    const handleClearIcon = useCallback((targetKey) => {
        if (!settingsDraft) return;
        setSettingsDraft(d => d ? {...d, [targetKey]: ''} : d);
    }, [settingsDraft]);

    const handleExport = useCallback(() => {
        console.log('Export clicked, code length:', generatedCode.length);
        try {
            const fullCode = wrapAsExtension(extInfo, generatedCode, customBlocks);
            const blob = new Blob([fullCode], {type: 'application/javascript'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${extInfo.id}.js`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('Export complete:', `${extInfo.id}.js`);
        } catch (e) {
            console.error('Export failed:', e);
            alert('导出失败: ' + e.message);
        }
    }, [extInfo, generatedCode, customBlocks]);

    // 复制完整代码到剪贴板（兼容非 HTTPS 环境：navigator.clipboard 不可用时
    // 回退到 execCommand）
    const handleCopyCode = useCallback(() => {
        const text = exportableCode || generatedCode;
        if (!text) return;
        const flashCopy = () => {
            setCopyMsg('已复制');
            if (copyMsgTimerRef.current) clearTimeout(copyMsgTimerRef.current);
            copyMsgTimerRef.current = setTimeout(() => setCopyMsg(''), 1800);
        };
        const fallbackCopy = () => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                flashCopy();
            } catch (err) {
                alert('复制失败，请手动选中代码复制（Ctrl+C）');
            }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(flashCopy).catch(fallbackCopy);
        } else {
            fallbackCopy();
        }
    }, [exportableCode, generatedCode]);

    const handleReset = useCallback(() => {
        try {
            if (workspaceRef.current) {
                workspaceRef.current.clear();
                const currentBlock = customBlocks.find(b => b.id === currentBlockRef.current);
                addStarterBlocks(workspaceRef.current, window._extBuilderBlockly || window.Blockly, currentBlock?.name || '我的积木');
            }
        } catch (e) {
            console.error('Reset failed:', e);
            alert('重置失败: ' + e.message);
        }
    }, [customBlocks]);

    // 插件开关：保存状态 → 重新激活插件（清理旧的原型覆写再应用新的）
    const handleToggleAddon = useCallback((addonId, enabled) => {
        setAddonStateInternal(prev => {
            const next = {...prev, [addonId]: enabled};
            setAddonState(next);
            return next;
        });
        // 重新应用插件：先清理，再按新状态激活
        // 注意：Blockly 是 useEffect 内的局部变量，这里用全局 window 引用
        const Blockly = window._extBuilderBlockly || window.Blockly;
        if (!Blockly || !workspaceRef.current) return;
        if (extAddonsCleanupRef.current) {
            try { extAddonsCleanupRef.current(); } catch (e) { /* silent */ }
            extAddonsCleanupRef.current = null;
        }
        applyExtAddons({
            Blockly,
            getWorkspace: () => workspaceRef.current
        }).then(cleanup => {
            extAddonsCleanupRef.current = cleanup;
        }).catch(e => console.warn('[ExtAddons] 重激活失败:', e));
    }, []);

    // 插件子选项切换（如 developer-tools 的增强整理/鼠标粘贴）
    const handleToggleAddonOption = useCallback((addonId, optId, value) => {
        setAddonOptsInternal(prev => {
            const addonPrev = prev[addonId] || {};
            const next = {...prev, [addonId]: {...addonPrev, [optId]: value}};
            setAddonOptions(addonId, next[addonId]);
            return next;
        });
        // 子选项变更后不需要重新 applyExtAddons——
        // developer-tools 的 setup 内部通过 optsPoller 轮询 localStorage 自动响应
    }, []);

    // ExtAddons：导出设置（JSON 下载）
    const handleAddonExport = useCallback(() => {
        try {
            const blob = new Blob([JSON.stringify(addonState, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'extbuilder-addons-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            alert('导出失败: ' + (e.message || String(e)));
        }
    }, [addonState]);

    // ExtAddons：导入设置（读取 JSON 文件，校验 ID 后合并）
    const handleAddonImport = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    if (typeof data !== 'object' || data === null) throw new Error('文件格式错误');
                    const validIds = new Set(getAllAddons().map(a => a.id));
                    const merged = {...addonState};
                    let changed = 0;
                    Object.keys(data).forEach(k => {
                        if (validIds.has(k)) {
                            merged[k] = !!data[k];
                            changed++;
                        }
                    });
                    if (changed === 0) throw new Error('文件中没有可识别的插件 ID');
                    setAddonState(merged);
                    setAddonStateInternal(merged);
                    // 重激活
                    const Blockly = window._extBuilderBlockly || window.Blockly;
                    if (Blockly && workspaceRef.current) {
                        if (extAddonsCleanupRef.current) {
                            try { extAddonsCleanupRef.current(); } catch (er) { /* silent */ }
                            extAddonsCleanupRef.current = null;
                        }
                        applyExtAddons({Blockly, getWorkspace: () => workspaceRef.current})
                            .then(cleanup => { extAddonsCleanupRef.current = cleanup; });
                    }
                    alert('已导入 ' + changed + ' 项插件设置');
                } catch (err) {
                    alert('导入失败: ' + (err.message || String(err)));
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }, [addonState]);

    // ExtAddons：全部重置为默认（清空 localStorage 强制下次读 DEFAULT_STATE）
    const handleAddonReset = useCallback(() => {
        if (!confirm('确定重置全部插件设置到默认值？')) return;
        try { localStorage.removeItem('extbuilder_ext_addons'); } catch (e) { /* silent */ }
        const fresh = getAddonState();
        setAddonStateInternal(fresh);
        const Blockly = window._extBuilderBlockly || window.Blockly;
        if (Blockly && workspaceRef.current) {
            if (extAddonsCleanupRef.current) {
                try { extAddonsCleanupRef.current(); } catch (er) { /* silent */ }
                extAddonsCleanupRef.current = null;
            }
            applyExtAddons({Blockly, getWorkspace: () => workspaceRef.current})
                .then(cleanup => { extAddonsCleanupRef.current = cleanup; });
        }
    }, []);

    // ExtAddons：删除一个自定义插件（按 id）
    const handleRemoveCustomAddon = useCallback((id) => {
        if (!confirm('确定删除自定义插件「' + id + '」？此操作不可撤销。')) return;
        try {
            removeCustomAddon(id);
            // 若当前已启用，先禁用并清理
            if (addonState[id]) {
                const nextState = {...addonState};
                delete nextState[id];
                setAddonState(nextState);
                setAddonStateInternal(nextState);
                const Blockly = window._extBuilderBlockly || window.Blockly;
                if (Blockly && workspaceRef.current) {
                    if (extAddonsCleanupRef.current) {
                        try { extAddonsCleanupRef.current(); } catch (er) { /* silent */ }
                        extAddonsCleanupRef.current = null;
                    }
                    applyExtAddons({Blockly, getWorkspace: () => workspaceRef.current})
                        .then(cleanup => { extAddonsCleanupRef.current = cleanup; });
                }
            }
        } catch (e) {
            console.error('Remove custom addon failed:', e);
        }
    }, [addonState]);

    // 重新激活所有插件（导入/更新/删除后调用）
    const reapplyAddons = useCallback(() => {
        const Blockly = window._extBuilderBlockly || window.Blockly;
        if (!Blockly || !workspaceRef.current) return;
        if (extAddonsCleanupRef.current) {
            try { extAddonsCleanupRef.current(); } catch (er) { /* silent */ }
            extAddonsCleanupRef.current = null;
        }
        applyExtAddons({Blockly, getWorkspace: () => workspaceRef.current})
            .then(cleanup => { extAddonsCleanupRef.current = cleanup; });
    }, []);

    // 从来源安装插件（对齐 DSH：dsh plugin add <npm/github/git/url>）
    const handleInstallFromSource = useCallback(async (sourceSpec) => {
        if (!sourceSpec || !sourceSpec.trim()) { setInstallError('请输入来源（npm 包名 / github:owner/repo / 直链 URL）'); return; }
        setInstallLoading(true);
        setInstallError('');
        setInstallStatus('正在解析来源：' + sourceSpec.trim() + ' …');
        try {
            const imported = await importAddonFromSource(sourceSpec.trim());
            if (!imported.length) throw new Error('来源中没有有效的插件对象');
            const nextState = {...addonState};
            imported.forEach(p => { nextState[p.id] = true; });
            setAddonState(nextState);
            setAddonStateInternal(nextState);
            reapplyAddons();
            setInstallStatus('已安装 ' + imported.length + ' 个插件：' + imported.map(p => p.name).join('、'));
            setInstallLoading(false);
        } catch (err) {
            setInstallLoading(false);
            setInstallError('安装失败：' + (err && err.message ? err.message : String(err)));
        }
    }, [addonState, reapplyAddons]);

    // 通用：导入成功后激活
    const _activateImported = useCallback((imported, label) => {
        const nextState = {...addonState};
        imported.forEach(p => { nextState[p.id] = true; });
        setAddonState(nextState);
        setAddonStateInternal(nextState);
        reapplyAddons();
        setInstallStatus('已安装 ' + imported.length + ' 个插件：' + imported.map(p => p.name).join('、'));
        setInstallLoading(false);
    }, [addonState, reapplyAddons]);

    // 选择本地文件安装（支持：单个 JS / 文件夹 / ZIP 三种模式）
    // mode: 'file' 单 JS | 'folder' 文件夹(webkitdirectory) | 'zip' ZIP 包
    const handleInstallLocalFile = useCallback((mode) => {
        const input = document.createElement('input');
        input.type = 'file';
        if (mode === 'folder') {
            input.webkitdirectory = true;
            input.setAttribute('webkitdirectory', '');
            input.mozdirectory = true;
            input.setAttribute('mozdirectory', '');
        } else if (mode === 'zip') {
            input.accept = '.zip,application/zip,application/x-zip-compressed';
        } else {
            input.accept = '.js,.mjs,text/javascript';
        }
        input.onchange = async (e) => {
            const fileList = e.target.files;
            if (!fileList || !fileList.length) return;
            setInstallLoading(true);
            setInstallError('');
            try {
                if (mode === 'folder') {
                    setInstallStatus('正在读取文件夹（' + fileList.length + ' 个文件）…');
                    const imported = await importAddonBundle([...fileList], 'local:folder:' + (fileList[0].webkitRelativePath || fileList[0].name));
                    if (!imported.length) throw new Error('文件夹中没有有效的插件包');
                    _activateImported(imported, 'folder');
                } else if (mode === 'zip') {
                    const file = fileList[0];
                    setInstallStatus('正在解压 ZIP：' + file.name + ' …');
                    const buf = await file.arrayBuffer();
                    const imported = await importAddonFromZip(buf, 'local:zip:' + file.name);
                    if (!imported.length) throw new Error('ZIP 中没有有效的插件包');
                    _activateImported(imported, 'zip');
                } else {
                    const file = fileList[0];
                    const reader = new FileReader();
                    reader.onload = () => {
                        setInstallStatus('正在安装本地文件：' + file.name + ' …');
                        importAddonFromSource('local:' + file.name, {fileText: String(reader.result)})
                            .then(imported => {
                                if (!imported.length) throw new Error('文件中没有有效的插件对象');
                                _activateImported(imported, 'file');
                            })
                            .catch(err => {
                                setInstallLoading(false);
                                setInstallError('安装失败：' + (err && err.message ? err.message : String(err)));
                            });
                    };
                    reader.onerror = () => { setInstallLoading(false); setInstallError('读取文件失败'); };
                    reader.readAsText(file);
                }
            } catch (err) {
                setInstallLoading(false);
                setInstallError('安装失败：' + (err && err.message ? err.message : String(err)));
            }
        };
        input.click();
    }, [_activateImported]);

    // 按来源更新已安装插件
    const handleUpdateAddon = useCallback(async (id) => {
        try {
            await updateCustomAddonSource(id);
            reapplyAddons();
            alert('已更新插件：' + id);
        } catch (e) {
            alert('更新失败：' + (e && e.message ? e.message : String(e)));
        }
    }, [reapplyAddons]);

    // 打开/刷新插件市场（从 GitHub 主题聚合页加载所有带该 topic 的仓库插件）
    const handleOpenMarket = useCallback(async () => {
        setMarketView(true);
        setMarketError('');
        setMarketList([]); // 先清空旧数据，避免拉取失败时显示过期内容
        if (marketLoading) return; // 防止重复并发请求
        setMarketLoading(true);
        try {
            const list = await fetchAddonMarketFromTopic(MARKET_TOPIC);
            console.log('[ExtAddons] 市场返回', list.length, '个插件:', list.map(p => p.dir));
            setMarketList(list);
            // 标记已安装（按 source 匹配已装自定义插件）
            const installed = {};
            const customSources = loadCustomAddons().map(a => (a.source || '').replace(/\/$/, ''));
            list.forEach(p => {
                if (customSources.indexOf(p.source.replace(/\/$/, '')) >= 0) installed[p.dir] = true;
            });
            setMarketInstalled(installed);
        } catch (e) {
            setMarketError('加载市场失败：' + (e && e.message ? e.message : String(e)));
        } finally {
            setMarketLoading(false);
        }
    }, [marketLoading]);

    // 从市场安装单个插件（source 已含 owner/repo/dir，动态解析）
    const handleMarketInstall = useCallback(async (item) => {
        setMarketInstalling(item.dir);
        try {
            const m = /^github:([^/]+)\/([^/]+)\/(.+)$/.exec(item.source || '');
            if (!m) throw new Error('插件来源格式不正确：' + (item.source || ''));
            const imported = await importAddonFromGithubDir(m[1], m[2], m[3]);
            // 安装后默认启用（与 _activateImported 一致）
            const nextState = {...addonState};
            (imported || []).forEach(p => { nextState[p.id] = true; });
            setAddonState(nextState);
            setAddonStateInternal(nextState);
            reapplyAddons();
            setMarketInstalled(prev => ({...prev, [item.dir]: true}));
            alert('已安装插件：' + item.name);
        } catch (e) {
            alert('安装失败：' + (e && e.message ? e.message : String(e)));
        } finally {
            setMarketInstalling('');
        }
    }, [addonState, reapplyAddons]);

    const handleLoadExtension = useCallback(() => {
        console.log('Load clicked');
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.js';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    alert('已加载文件: ' + file.name);
                };
                reader.readAsText(file);
            };
            input.click();
        } catch (e) {
            console.error('Load failed:', e);
        }
    }, []);

    const handleUndo = useCallback(() => {
        console.log('Undo clicked, workspace:', !!workspaceRef.current);
        try {
            if (workspaceRef.current) {
                workspaceRef.current.undo(false);
            }
        } catch (e) {
            console.error('Undo failed:', e);
        }
    }, []);

    const handleRedo = useCallback(() => {
        console.log('Redo clicked, workspace:', !!workspaceRef.current);
        try {
            if (workspaceRef.current) {
                workspaceRef.current.undo(true);
            }
        } catch (e) {
            console.error('Redo failed:', e);
        }
    }, []);

    // ---- 登录 / 存档 / 跨站同步 handlers ----

    const refreshSaves = useCallback(() => {
        if (!session) {
            setSavesList([]);
            return;
        }
        // 先本地，再尝试云端拉取合并（多设备一致）
        setSavesList(listSaves(session.username));
        import('../lib/saves.js').then(m => {
            return m.syncSavesFromCloud(session.username);
        }).then(merged => {
            if (merged) setSavesList(merged);
        }).catch(() => { /* 云端不可用则保持本地 */ });
    }, [session]);

    // 打开存档面板时刷新列表
    const handleOpenSavesPanel = useCallback(() => {
        setSaveMsg('');
        setSyncLinkText('');
        setSyncInput('');
        refreshSaves();
        openUserPanel('saves');
    }, [refreshSaves, openUserPanel]);

    // 打开个人主页：加载账号资料 + 刷新存档列表 + 拉取关注/粉丝数
    const handleOpenProfile = useCallback(() => {
        if (!session) return;
        const username = session.username;
        setProfileMeta(getUserMeta(username));
        setProfileCounts({following: 0, followers: 0});
        refreshSaves();
        openUserPanel('profile');
        // 云端可用时拉取关注关系，统计关注数 / 粉丝数（本地模式为 0）
        cloudListRelations(username).then((rows) => {
            if (!Array.isArray(rows)) return;
            let following = 0;
            let followers = 0;
            for (const r of rows) {
                if (r.follower === username) following += 1;
                if (r.followee === username) followers += 1;
            }
            setProfileCounts({following, followers});
        }).catch(() => {
            // 拉取不影响主页其余内容，保持 0
        });
    }, [session, refreshSaves, openUserPanel]);

    // ---- 好友 / 关注 ----
    // 拉取我与他人的全部关注关系，并重算好友（互关）/ 我关注的 / 关注我的
    const loadFriendsRelations = useCallback(() => {
        if (!session) return Promise.resolve([]);
        return cloudListRelations(session.username).then((rows) => {
            setFriendsRelations(rows || []);
            return rows || [];
        }).catch((e) => {
            setFriendsMsg('加载好友关系失败：' + (e && e.message ? e.message : String(e)));
            return [];
        });
    }, [session]);

    const handleOpenFriends = useCallback(() => {
        setFriendsMsg('');
        setFriendsResults([]);
        setFriendsSearch('');
        setFriendsTab('friends');
        openUserPanel('friends');
        loadFriendsRelations();
    }, [loadFriendsRelations, openUserPanel]);

    const handleFriendSearch = useCallback(() => {
        if (!session) return;
        const q = friendsSearch.trim();
        if (!q) { setFriendsResults([]); return; }
        setFriendsBusy(true);
        setFriendsMsg('');
        cloudSearchUsers(q, session.username).then((list) => {
            setFriendsResults(list || []);
            if (!list || list.length === 0) setFriendsMsg('没有找到匹配的用户');
        }).catch((e) => {
            setFriendsMsg('搜索失败：' + (e && e.message ? e.message : String(e)));
        }).then(() => setFriendsBusy(false));
    }, [friendsSearch, session]);

    // direction: 'follow' 关注对方；'unfollow-following' 取消关注（我→对方）；
    // 'unfollow-follower' 移除粉丝（对方→我）；'unfriend' 解除好友（取消我对对方的关注）
    const handleFriendAction = useCallback((target, action) => {
        if (!session) return;
        const me = session.username;
        setFriendsBusy(true);
        setFriendsMsg('');
        let p;
        if (action === 'follow') {
            p = cloudFollow(me, target);
        } else if (action === 'unfollow-following' || action === 'unfriend') {
            p = cloudUnfollow(me, target);
        } else if (action === 'unfollow-follower') {
            p = cloudUnfollow(target, me);
        } else {
            p = Promise.resolve();
        }
        p.then(() => loadFriendsRelations())
            .catch((e) => {
                setFriendsMsg('操作失败：' + (e && e.message ? e.message : String(e)));
            })
            .then(() => setFriendsBusy(false));
    }, [session, loadFriendsRelations]);

    // 发送邮箱验证码（注册模式）
    const handleSendCode = useCallback(() => {
        const email = String(authEmail || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setAuthError('请输入正确的邮箱地址后再发送验证码');
            return;
        }
        // 先通过人机验证才能发送验证码
        if (!turnstileToken) {
            setAuthError('请先完成人机验证（勾选「我是人类」）再获取验证码');
            return;
        }
        if (codeSending || codeCountdown > 0) return;
        setAuthError('');
        setCodeSending(true);
        sendEmailCode(email, 'register', turnstileToken)
            .then((data) => {
                // 发送失败（如 EmailJS 配置错误或网络问题）时抛错，不启动倒计时
                if (data && data.success === false) {
                    throw new Error(data.error || '验证码发送失败，请稍后重试');
                }
                setCodeCountdown(60); // 60 秒内不可重发
                // 开发模式/EmailJS 失败回退：返回 devCode 字段，直接显示在页面上
                if (data && data.result && data.result.devCode) {
                    setDevCode(data.result.devCode);
                }
            })
            .catch((err) => {
                setAuthError(err && err.message ? err.message : '验证码发送失败，请稍后重试');
            })
            .then(() => {
                setCodeSending(false);
            });
    }, [authEmail, turnstileToken, codeSending, codeCountdown]);

    // 重发倒计时
    useEffect(() => {
        if (codeCountdown <= 0) return undefined;
        codeTimerRef.current = setTimeout(() => setCodeCountdown(codeCountdown - 1), 1000);
        return () => clearTimeout(codeTimerRef.current);
    }, [codeCountdown]);

    const handleAuthSubmit = useCallback((e) => {
        e.preventDefault();
        setAuthError('');
        setAuthBusy(true);
        // 注册模式：先校验人机验证 + 邮箱 + 邮箱验证码
        if (authMode === 'register') {
            if (!turnstileToken) {
                setAuthError('请先完成人机验证');
                setAuthBusy(false);
                return;
            }
            const email = String(authEmail || '').trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                setAuthError('请输入正确的邮箱地址');
                setAuthBusy(false);
                return;
            }
            if (!/^\d{6}$/.test(String(authCode || '').trim())) {
                setAuthError('请输入 6 位邮箱验证码');
                setAuthBusy(false);
                return;
            }
        }
        const doAuth = authMode === 'register'
            ? (authPass === authPass2
                ? verifyEmailCode(String(authEmail).trim(), String(authCode).trim(), 'register')
                    .then((verifiedToken) => register(authUser, authPass, authRemember, turnstileToken, String(authEmail).trim(), verifiedToken))
                : Promise.reject(new Error('两次输入的密码不一致')))
            : login(authUser, authPass, authRemember);
        doAuth.then((s) => {
            setSession(s);
            setShowAuthModal(false);
            setAuthUser('');
            setAuthPass('');
            setAuthPass2('');
            setAuthEmail('');
            setAuthCode('');
            setTurnstileToken('');
            // 注册成功后重置 Turnstile
            if (authMode === 'register' && window.turnstile && turnstileWidgetId !== null) {
                try { window.turnstile.reset(turnstileWidgetId); } catch (e) { /* ignore */ }
            }
        }).catch((err) => {
            setAuthError(err && err.message ? err.message : String(err));
            // 验证失败时重置 Turnstile 让用户重试
            if (authMode === 'register' && window.turnstile && turnstileWidgetId !== null) {
                try { window.turnstile.reset(turnstileWidgetId); } catch (e) { /* ignore */ }
            }
            if (authMode === 'register') setTurnstileToken('');
        }).then(() => {
            setAuthBusy(false);
        });
    }, [authMode, authUser, authPass, authPass2, authEmail, authCode, authRemember, turnstileToken, turnstileWidgetId]);

    const handleLogout = useCallback(() => {
        // 切换账号前保存当前会话（支持一键切回）
        if (session) savePrevSession(session);
        authLogout();
        setSession(null);
        setUserPanelType(null);
        setPrevSession(getPrevSession());
    }, [session]);

    // 切换账号：记住当前 → 退出 → 打开登录弹窗
    const handleSwitchAccount = useCallback(() => {
        if (session) savePrevSession(session);
        authLogout();
        setSession(null);
        setUserPanelType(null);
        setPrevSession(getPrevSession());
        setAuthMode('login');
        setAuthError('');
        setShowAuthModal(true);
    }, [session]);

    // 一键切回到上一个账号
    const handleSwitchBack = useCallback(() => {
        const restored = switchToPrevSession();
        if (restored) {
            setSession(restored);
            setPrevSession(null); // 已切回，清除 prev
            setUserPanelType(null);
        }
    }, []);

    // 多账号切换：切换到指定账号
    const handleSwitchToAccount = useCallback((username) => {
        if (!username || (session && username === session.username)) return;
        const newSession = switchToAccount(username);
        if (newSession) {
            setSession(newSession);
            setAccountList(getRegisteredAccounts()); // 刷新列表（虽然内容不变，保持一致）
            setShowUserMenu(false);
            setShowAccountSwitcher(false);
        }
    }, [session]);

    // 用 GitHub 登录：打开授权弹窗，回调通过后由 postMessage 把用户资料送回（见下方 message 监听）
    const handleGitHubLogin = useCallback(() => {
        if (typeof window === 'undefined') return;
        // state 带 'g:' 前缀 + btoa(编辑器地址)：回调页据此回传 github-auth 给本窗口；
        // 若 opener 不可用（浏览器 COOP / 弹窗拦截），回调页还会兜底跳回编辑器并把会话放在 URL hash 里
        let state;
        try {
            state = 'g:' + btoa(window.location.origin + '/') + '~' + makeGitHubState();
        } catch (e) {
            state = makeGitHubState();
        }
        githubStateRef.current = state;
        setAuthError('');
        const url = buildGitHubAuthUrl(state);
        let popup = null;
        try {
            popup = window.open(url, 'github-oauth', 'width=600,height=720');
        } catch (e) {
            popup = null;
        }
        if (!popup) {
            setAuthError('浏览器拦截了登录弹窗，请允许本站弹出窗口后重试');
        }
    }, []);

    // 监听 GitHub 回调弹窗回传的登录结果（防 CSRF：校验来源 + state）
    useEffect(() => {
        function onGitHubMessage(e) {
            if (!e.data || e.data.type !== 'github-auth') return;
            const ALLOWED = [
                'https://scratchextensioneditor.cc.cd',
                'https://scratchextensioneditor.pages.dev'
            ];
            if (ALLOWED.indexOf(e.origin) === -1) return;
            if (e.data.state !== githubStateRef.current) {
                setAuthError('GitHub 登录校验失败（state 不匹配）');
                return;
            }
            if (e.data.error) {
                setAuthError('GitHub 登录失败：' + e.data.error);
                return;
            }
            loginWithGitHub(e.data.profile, authRemember)
                .then((s) => {
                    setSession(s);
                    setShowAuthModal(false);
                    setAuthUser(''); setAuthPass(''); setAuthPass2('');
                    setAuthEmail(''); setAuthCode('');
                    setTurnstileToken('');
                })
                .catch((err) => setAuthError(err && err.message ? err.message : String(err)));
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('message', onGitHubMessage);
        }
        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('message', onGitHubMessage);
            }
        };
    }, [authRemember]);

    // 接收来自 scratchextensioneditor.cc.cd 网站的登录会话（跨域：网站登录后 postMessage 给编辑器）
    // 处理两种消息类型：
    //   - site-session：网站首页/旧路径推送
    //   - site-session-response：登录页 goHome() 通过 window.opener 直接推送 / session-bridge.html 桥接推送
    useEffect(() => {
        function onSiteSession(e) {
            if (!e.data) return;
            if (e.data.type !== 'site-session' && e.data.type !== 'site-session-response') return;
            const ALLOWED = [
                'https://scratchextensioneditor.cc.cd',
                'https://scratchextensioneditor.pages.dev'
            ];
            // site-session-response 可能来自登录页（window.opener.postMessage），origin 就是网站 origin
            // 也可能来自任何来源的 bridge iframe（sandbox 后 origin 变为网站 origin）
            if (ALLOWED.indexOf(e.origin) === -1) return;
            const payload = e.data;
            if (!payload.session || !payload.session.username) return;
            try {
                const s = payload.session;
                ensureSiteAccount(s.username); // 确保本地账号存在，刷新后 getSession 才能通过账号校验
                localStorage.setItem('extbuilder_session', JSON.stringify(s));
                setSession(s);
                setUserPanelType(null);
            } catch (err) {
                console.warn('[Editor] 接收网站会话失败:', err);
            }
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('message', onSiteSession);
        }
        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('message', onSiteSession);
            }
        };
    }, []);

    // 兜底通道：回调页在 opener 不可用（浏览器 COOP / 弹窗拦截）时，
    // 会把会话编码进 URL 的 #gh= 里跳回本编辑器页面，这里读出来并登录。
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const hash = window.location.hash || '';
            if (!/(^|[#&])gh=/.test(hash)) return;
            const params = new URLSearchParams(hash.replace(/^#/, ''));
            const raw = params.get('gh');
            if (!raw) return;
            const s = JSON.parse(decodeURIComponent(raw));
            if (!s || !s.username) return;
            ensureSiteAccount(s.username); // 保证本地账号存在，刷新后 getSession 才能通过校验
            localStorage.setItem('extbuilder_session', JSON.stringify(s));
            setSession(s);
            setUserPanelType(null);
            setShowAuthModal(false);
            // 立即清掉地址栏里的凭据，避免残留在历史/分享链接中
            params.delete('gh');
            const rest = params.toString();
            window.history.replaceState(
                null, '',
                window.location.pathname + window.location.search + (rest ? '#' + rest : '')
            );
        } catch (err) {
            console.warn('[Editor] 解析 URL 登录回传失败:', err);
        }
    }, []);

    // 同源其他标签页写入会话时自动同步（storage 事件只在「其他」标签页触发，本页不触发）
    useEffect(() => {
        if (typeof window === 'undefined') return;
        function onStorage(e) {
            if (e.key !== 'extbuilder_session') return;
            try {
                const s = e.newValue ? JSON.parse(e.newValue) : null;
                if (s && s.username) {
                    ensureSiteAccount(s.username);
                    setSession(s);
                } else {
                    setSession(null);
                }
            } catch (err) { /* 忽略解析错误 */ }
        }
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    // 启动时通过隐藏 iframe 尝试拉取 scratchextensioneditor.cc.cd 的登录会话
    // session-bridge.html 加载后主动 postMessage 回 session 数据，由上面的 onSiteSession 接收
    useEffect(() => {
        if (typeof window === 'undefined' || session) return; // 已有本地会话则不拉
        var bridgeUrls = [
            'https://scratchextensioneditor.cc.cd/session-bridge.html',
            'https://scratchextensioneditor.pages.dev/session-bridge.html'
        ];
        var iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;border:none;';
        iframe.sandbox = 'allow-scripts allow-same-origin';
        var idx = 0;
        function tryNext() {
            if (idx >= bridgeUrls.length) {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                return;
            }
            iframe.src = bridgeUrls[idx++];
        }
        function onBridgeResponse(e) {
            if (!e.data || e.data.type !== 'site-session-response') return;
            if (e.data.session && e.data.session.username) {
                var s = e.data.session;
                try {
                    localStorage.setItem('extbuilder_session', JSON.stringify(s));
                    setSession(s);
                    setUserPanelType(null);
                } catch (err) { /* ignore */ }
            }
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            window.removeEventListener('message', onBridgeResponse);
        }
        window.addEventListener('message', onBridgeResponse);
        iframe.onload = function () { };
        document.body.appendChild(iframe);
        tryNext();
        setTimeout(function () {
            window.removeEventListener('message', onBridgeResponse);
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 8000);
        return () => {
            window.removeEventListener('message', onBridgeResponse);
            if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
        };
    }, [session]);

    // 用户从网站登录页切回编辑器时，自动重新拉取网站会话（隐藏 iframe 桥接）
    // 健壮性：单个域名 5s 无响应自动换备用域；同时监听 focus；未登录且标签页可见时重试若干次，
    // 避免"一次性超时/网络抖动"导致同步不上（早前只试一次且 8s 才清理）。
    useEffect(() => {
        if (typeof window === 'undefined' || session) return;
        var pulling = false;
        var attempts = 0;

        function pullSiteSession() {
            if (pulling || getSession()) return;
            if (attempts >= 15) return; // 约 90 秒后放弃，避免无限轮询
            attempts += 1;
            pulling = true;
            var bridgeUrls = [
                'https://scratchextensioneditor.cc.cd/session-bridge.html',
                'https://scratchextensioneditor.pages.dev/session-bridge.html'
            ];
            var idx = 0;
            var timer = null;
            var iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;border:none;';
            iframe.sandbox = 'allow-scripts allow-same-origin';

            function cleanup() {
                pulling = false;
                if (timer) { clearTimeout(timer); timer = null; }
                window.removeEventListener('message', onBridgeResponse);
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }
            function tryNext() {
                if (idx >= bridgeUrls.length) { cleanup(); return; }
                iframe.src = bridgeUrls[idx++];
                // 5 秒没回音就换下一个域名
                timer = setTimeout(tryNext, 5000);
            }
            function onBridgeResponse(e) {
                if (!e.data || e.data.type !== 'site-session-response') return;
                if (e.data.session && e.data.session.username) {
                    var s = e.data.session;
                    try {
                        ensureSiteAccount(s.username); // 确保本地账号存在，刷新后 getSession 才能通过账号校验
                        localStorage.setItem('extbuilder_session', JSON.stringify(s));
                        setSession(s);
                        setUserPanelType(null);
                    } catch (err) { /* ignore */ }
                }
                cleanup();
            }
            window.addEventListener('message', onBridgeResponse);
            document.body.appendChild(iframe);
            tryNext();
        }

        function onVisible() {
            if (document.visibilityState === 'visible') pullSiteSession();
        }
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        // 切回来后若桥接还没返回（网络慢），补几次轮询
        var poll = setInterval(pullSiteSession, 6000);
        return () => {
            clearInterval(poll);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [session]);

    // 清除本地账号数据：清空本浏览器 localStorage / sessionStorage 中的账号注册表与会话
    // （与线上账号清零配套的本地收口；云端残留账号需另行处理）
    const handleClearLocalData = useCallback(() => {
        if (typeof window !== 'undefined' && window.confirm) {
            const ok = window.confirm(
                '确定要清除本地的所有账号数据吗？\n\n' +
                '将删除：本地账号注册表、当前登录会话、切换账号记录。\n' +
                '此操作不可恢复，但不会删除你在服务器上的账号。'
            );
            if (!ok) return;
        }
        clearLocalAuthData();
        setSession(null);
        setPrevSession(null);
        setShowUserMenu(false);
        setUserPanelType(null);
        setAuthError('');
    }, []);

    // ---- Cloudflare Turnstile：注册模式打开时加载 SDK 并渲染 widget ----
    useEffect(() => {
        if (!showAuthModal || authMode !== 'register') return;
        let mounted = true;
        let retryTimer = null;

        const tryRender = (attempt) => {
            if (!mounted) return;
            const el = turnstileContainerRef.current || document.getElementById('ext-turnstile-container');
            if (!el) {
                if (attempt < 20) {
                    retryTimer = setTimeout(() => tryRender(attempt + 1), 200);
                }
                return;
            }
            if (!window.turnstile) {
                if (attempt < 30) {
                    retryTimer = setTimeout(() => tryRender(attempt + 1), 300);
                } else {
                    console.warn('[Turnstile] SDK 未加载');
                }
                return;
            }
            if (el.hasChildNodes() && turnstileWidgetId !== null) return;
            try {
                const wid = window.turnstile.render(el, {
                    sitekey: TURNSTILE_SITEKEY,
                    theme: 'light',
                    callback: (token) => { if (mounted) setTurnstileToken(token); },
                    'expired-callback': () => { if (mounted) setTurnstileToken(''); },
                    'error-callback': () => { if (mounted) setTurnstileToken(''); }
                });
                if (mounted) setTurnstileWidgetId(wid);
            } catch (err) {
                console.error('[Turnstile] render 失败:', err);
                if (attempt < 10) retryTimer = setTimeout(() => tryRender(attempt + 1), 300);
            }
        };

        if (!window.turnstile) {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&hl=zh-cn';
            script.async = true;
            script.onload = () => {
                if (!mounted) return;
                setTurnstileLoaded(true);
                tryRender(0);
            };
            script.onerror = (e) => console.error('[Turnstile] SDK 加载失败:', e);
            document.head.appendChild(script);
        } else {
            setTurnstileLoaded(true);
            tryRender(0);
        }

        return () => {
            mounted = false;
            if (retryTimer) clearTimeout(retryTimer);
            if (window.turnstile && turnstileWidgetId !== null) {
                try { window.turnstile.remove(turnstileWidgetId); } catch (e) { /* ignore */ }
            }
            if (mounted) { setTurnstileWidgetId(null); setTurnstileToken(''); }
        };
    }, [showAuthModal, authMode]);

    // 保存当前项目为新存档
    const handleSaveProject = useCallback(() => {
        if (!session) return;
        try {
            saveCurrentWorkspace();
            const data = collectProjectState({
                extInfo,
                customBlocks,
                workspaceXmlMap: customBlockXmlRef.current,
                generatedCode
            });
            const name = saveNameInput.trim() || ('存档 ' + new Date().toLocaleString());
            saveProject(session.username, {id: 'save_' + Date.now(), name, data});
            setSaveNameInput('');
            refreshSaves();
            setSaveMsg('已保存存档：' + name);
        } catch (err) {
            setSaveMsg('保存失败：' + (err.message || err));
        }
    }, [session, extInfo, customBlocks, generatedCode, saveNameInput,
        refreshSaves, saveCurrentWorkspace]);

    // 用当前项目覆盖已有存档
    const handleOverwriteSave = useCallback((saveId) => {
        if (!session) return;
        try {
            saveCurrentWorkspace();
            const data = collectProjectState({
                extInfo,
                customBlocks,
                workspaceXmlMap: customBlockXmlRef.current,
                generatedCode
            });
            const old = savesList.find(s => s.id === saveId);
            saveProject(session.username, {id: saveId, name: (old && old.name) || '存档', data});
            refreshSaves();
            setSaveMsg('已更新存档：' + ((old && old.name) || ''));
        } catch (err) {
            setSaveMsg('更新失败：' + (err.message || err));
        }
    }, [session, extInfo, customBlocks, generatedCode, savesList,
        refreshSaves, saveCurrentWorkspace]);

    const handleDeleteSave = useCallback((saveId) => {
        if (!session) return;
        const target = savesList.find(s => s.id === saveId);
        if (!target) return;
        if (!window.confirm('确定删除存档「' + target.name + '」吗？此操作不可恢复。')) return;
        deleteSave(session.username, saveId);
        refreshSaves();
        setSaveMsg('已删除存档：' + target.name);
    }, [session, savesList, refreshSaves]);

    // 恢复 block_define 上的生成元数据（opcode/type/text）
    const rehydrateBlockMeta = useCallback((ws, blocks) => {
        const tops = ws.getTopBlocks ? ws.getTopBlocks(true) : [];
        tops.forEach(t => {
            if (t.type !== 'block_define') return;
            const svg = t.getSvgRoot && t.getSvgRoot();
            const bid = svg && svg.getAttribute('data-block-id');
            const cb = blocks.find(b => b.id === bid);
            if (!cb) return;
            t._opcode = (cb.id || 'block').replace(/[^a-zA-Z0-9]/g, '_');
            const bt = String(cb.blockType || 'command').toUpperCase();
            t._type = bt === 'BOOLEAN' ? 'BOOLEAN'
                : bt === 'REPORTER' ? 'REPORTER'
                    : bt === 'HAT' ? 'HAT'
                        : bt === 'CONDITIONAL' ? 'CONDITIONAL' : 'COMMAND';
            t._text = '[' + (cb.name || 'block') + ']';
            // 同步积木颜色（hex 或默认 290 紫色）
            if (t.setColour) {
                try { t.setColour(cb.colour || 290); } catch (e) { /* 忽略非法色 */ }
            }
            // 定义块禁止删除（覆盖从 XML 存档恢复的块）
            if (t.setDeletable) t.setDeletable(false);
        });
    }, []);

    // 任何 customBlocks 变化（创建/编辑/删除/导入）都同步到 Blockly 工作区
    // 并刷新生成代码面板——否则用户在"积木定义"面板改了 name/type 等信息，
    // 工作区里既有的 block_define 块对应的 _opcode/_type/_text 不会更新，
    // 代码面板仍显示旧内容。
    useEffect(() => {
        const ws = workspaceRef.current;
        if (!ws || !workspaceLoaded) return;
        rehydrateBlockMeta(ws, customBlocks);
        try {
            setGeneratedCode(javascriptGenerator.workspaceToCode(ws));
        } catch (e) { /* silent */ }
    }, [customBlocks, workspaceLoaded]);

    // 用存档中的积木列表 + 工作区 XML 重建当前 Blockly 工作区
    const rebuildWorkspaceFromState = useCallback((blocks, xmlMap) => {
        const ws = workspaceRef.current;
        const B = window._extBuilderBlockly || window.Blockly;
        if (!ws || !B) return;
        try {
            ws.clear();
            const firstId = blocks.length ? blocks[0].id : null;
            currentBlockRef.current = firstId;
            setCurrentBlockId(firstId);
            const xml = firstId ? xmlMap.get(firstId) : null;
            if (xml) {
                try {
                    const dom = B.Xml.textToDom(xml);
                    B.Xml.domToWorkspace(dom, ws);
                } catch (e) {
                    console.warn('Restore XML failed, adding starter blocks instead:', e);
                    blocks.forEach(b => addStarterBlocks(ws, B, b.name, b.id, b.blockType));
                }
            } else {
                blocks.forEach(b => addStarterBlocks(ws, B, b.name, b.id, b.blockType));
            }
            rehydrateBlockMeta(ws, blocks);
            try {
                setGeneratedCode(javascriptGenerator.workspaceToCode(ws));
            } catch (e) { /* silent */ }
        } catch (e) {
            console.warn('rebuildWorkspaceFromState failed:', e);
        }
    }, [rehydrateBlockMeta]);

    // 加载一个存档（恢复全部项目状态）
    const handleLoadSave = useCallback((save) => {
        if (!save || !save.data) return;
        try {
            const restored = restoreProjectState(save.data);
            setExtInfo({...DEFAULT_EXTENSION_INFO, ...restored.extInfo});
            setCustomBlocks(restored.customBlocks);
            customBlockXmlRef.current = restored.workspaceXmlMap;
            setGeneratedCode(restored.generatedCode);
            rebuildWorkspaceFromState(restored.customBlocks, restored.workspaceXmlMap);
            setUserPanelType(null);
            setSaveMsg('已加载存档：' + save.name);
            alert('已加载存档：' + save.name);
        } catch (err) {
            alert('加载存档失败：' + (err.message || err));
        }
    }, [rebuildWorkspaceFromState]);

    // 从 JSON 文件导入存档（登录后存入当前账号）
    const handleImportSaveFile = useCallback(() => {
        if (!session) {
            alert('请先登录后再导入存档');
            return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const save = parseSaveFileText(String(ev.target.result));
                    saveProject(session.username, {
                        id: save.id || ('save_' + Date.now()),
                        name: save.name || file.name.replace(/\.json$/i, ''),
                        data: save.data
                    });
                    refreshSaves();
                    setSaveMsg('已导入存档：' + (save.name || file.name));
                } catch (err) {
                    alert('导入失败：' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }, [session, refreshSaves]);

    // 生成同步链接（在另一个部署打开即可互通）
    const handleGenSync = useCallback(() => {
        if (!session) return;
        try {
            const url = buildSyncUrl(session.username);
            setSyncLinkText(url);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url)
                    .then(() => setSaveMsg('同步链接已生成并复制到剪贴板'))
                    .catch(() => setSaveMsg('同步链接已生成（复制失败，可手动选择复制）'));
            } else {
                setSaveMsg('同步链接已生成（请手动复制）');
            }
        } catch (err) {
            setSaveMsg('生成失败：' + (err.message || err));
        }
    }, [session]);

    // 粘贴对方网站的同步链接并导入
    const handleImportSync = useCallback(() => {
        const payload = parseSyncPayload(syncInput);
        if (!payload) {
            setSaveMsg('链接无效，请检查后重试');
            return;
        }
        const ok = window.confirm(
            '检测到来自「' + (payload.site || '其他站点') + '」的同步数据。\n' +
            '账号：' + payload.user.username + '\n' +
            '存档数量：' + (payload.saves ? payload.saves.length : 0) + '\n\n' +
            '导入后本网站的登录账号与存档将与对方互通（已存在的存档不会被覆盖），是否继续？'
        );
        if (!ok) return;
        try {
            const res = importSyncPayload(payload);
            setSession(getSession());
            setSavesList(listSaves(payload.user.username));
            setSyncInput('');
            const msg = res.created
                ? '已在本站创建账号「' + res.username + '」并登录，互通成功。'
                : '账号「' + res.username + '」已存在，已合并其存档，互通成功。';
            setSaveMsg(msg + (res.merged ? ' 新增存档 ' + res.merged + ' 个。' : ''));
        } catch (err) {
            setSaveMsg('同步失败：' + (err.message || err));
        }
    }, [syncInput]);

    // 页面加载时检测 URL 中的 #sync= 同步链接并提示导入
    useEffect(() => {
        if (typeof location === 'undefined' || !location.hash) return;
        if (location.hash.indexOf('#sync=') !== 0) return;
        const payload = parseSyncPayload(location.hash);
        if (!payload) return;
        const ok = window.confirm(
            '检测到来自「' + (payload.site || '其他站点') + '」的同步链接。\n' +
            '账号：' + payload.user.username + '\n' +
            '存档数量：' + (payload.saves ? payload.saves.length : 0) + '\n\n' +
            '导入后本网站的登录账号与存档将与对方互通，是否继续？'
        );
        try {
            if (ok) {
                const res = importSyncPayload(payload);
                setSession(getSession());
                const msg = res.created
                    ? '已在本站创建账号「' + res.username + '」并登录，互通成功。'
                    : '账号「' + res.username + '」已存在，已合并其存档，互通成功。';
                alert(msg + (res.merged ? ' 新增存档 ' + res.merged + ' 个。' : ''));
            }
        } catch (err) {
            alert('同步失败：' + (err.message || err));
        }
        // 清除 hash，避免刷新页面重复提示
        try {
            history.replaceState(null, '', location.pathname + location.search);
        } catch (e) { /* ignore */ }
    }, []);

    // Add a block by type - removed (use Blockly drag-from-flyout instead)

    // Always render the UI - Blockly loads in background
    return (
        <div className="ext-builder">
            {/* Top menu bar (mimics TurboWarp's red top bar) */}
            <div className="ext-menu-bar">
                                <div className="ext-menu-bar-left">
                    <div className="ext-menu-brand">
                        <span className="ext-menu-logo">⊞</span>
                        <span className="ext-menu-title">扩展编辑器</span>
                    </div>
                    <button className="ext-menu-btn" onClick={handleOpenSettings} title="编辑器设置与插件管理">
                        <svg className="ext-menu-btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                        <span className="ext-menu-btn-label">设置</span>
                    </button>
                    <button className="ext-menu-btn" onClick={handleOpenPreview} title="预览所有积木">
                        <svg className="ext-menu-btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span className="ext-menu-btn-label">预览</span>
                    </button>
                    {/* 工具下拉菜单 */}
                    <div className="ext-tools-dropdown" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setShowToolsMenu(false); }}>
                        <button
                            className="ext-menu-btn ext-menu-tools-btn"
                            onClick={() => setShowToolsMenu(v => !v)}
                            title="工具"
                        >
                            <svg className="ext-menu-btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                            <span className="ext-menu-btn-label">工具</span>
                            <span className="ext-menu-arrow">▾</span>
                        </button>
                        {showToolsMenu && (
                            <div className="ext-tools-menu">
                                <button className="ext-tools-menu-item" onClick={() => { setShowToolsMenu(false); window.dispatchEvent(new CustomEvent('ext-toggle-realtime-collab')); }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                                    实时协作
                                </button>
                            </div>
                        )}
                    </div>
                    {!session ? (
                        <React.Fragment>
                            <button
                                className="ext-menu-btn"
                                onClick={() => { var r = encodeURIComponent(window.location.href); window.open('https://scratchextensioneditor.cc.cd/login?return=' + r, '_blank'); }}
                                title="前往网站登录，登录后回到本编辑器即可自动同步"
                            >
                                <span className="ext-menu-btn-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                                <span className="ext-menu-btn-label">登录</span>
                            </button>
                        </React.Fragment>
                    ) : (
                        <div className="ext-user-dropdown" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setShowUserMenu(false); }}>
                            <button
                                className="ext-menu-user"
                                onClick={() => setShowUserMenu(v => !v)}
                                title="用户菜单"
                            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:'4px'}}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>{session.username} ▼</button>
                            {showUserMenu && (
                                <div className="ext-user-menu">
                                    <button className="ext-user-menu-item" onClick={() => { setShowUserMenu(false); window.open('https://scratchextensioneditor.cc.cd/users', '_blank'); }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                        个人主页
                                    </button>
                                    <button className="ext-user-menu-item" onClick={() => { setShowUserMenu(false); handleOpenSavesPanel(); }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,9 15,9"/></svg>
                                        存档管理
                                    </button>
                                    <button className="ext-user-menu-item" onClick={() => { setShowUserMenu(false); handleOpenFriends(); }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                                        好友 / 关注
                                    </button>
                                    <div className="ext-user-menu-divider"></div>
                                    <button className="ext-user-menu-item ext-user-menu-danger" onClick={() => { setShowUserMenu(false); handleClearLocalData(); }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                        清除本地账号数据
                                    </button>
                                    <button className="ext-user-menu-item ext-user-menu-logout" onClick={() => { setShowUserMenu(false); handleLogout(); }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d32f2f" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                                        退出登录
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="ext-menu-bar-center">
                    <span className="ext-menu-ext-name">{extInfo.name}</span>
                    <span className="ext-menu-ext-id">({extInfo.id})</span>
                </div>
                <div className="ext-menu-bar-right">
                    <button className="ext-menu-btn" onClick={handleLoadExtension} title="加载扩展">
                        <svg className="ext-menu-btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span className="ext-menu-btn-label">加载</span>
                    </button>
                    <button className="ext-menu-btn" onClick={handleExport} title="导出 .js 文件">
                        <svg className="ext-menu-btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span className="ext-menu-btn-label">导出</span>
                    </button>
                    <button className="ext-menu-btn ext-menu-btn-warn" onClick={handleReset} title="重置工作区">
                        <svg className="ext-menu-btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                        <span className="ext-menu-btn-label">重置</span>
                    </button>
                    <div className="ext-block-count-badge" onClick={() => setShowStatsPanel(v => !v)} title="点击查看项目数据分析">
                        <span className="ext-block-count-num">{projectStats.blockCount}</span>
                        <span className="ext-block-count-label">个积木</span>
                    </div>
                </div>
            </div>

            {/* Left icon rail (mimics AstraEditor: 制作积木 button pinned to far left) */}
            <div className="ext-builder-left">
                <button
                    className={`ext-left-btn ${showBlockBuilder ? 'active' : ''}`}
                    onClick={() => { setShowBlockBuilder(true); setBuilderMinimized(false); setBuilderMaximized(false); setBuilderModalPos(null); setBuilderSize(null); }}
                    title="制作积木"
                >
                    <img
                        src="/make-blocks-btn.png"
                        alt="制作积木"
                        className="ext-left-btn-img"
                    />
                </button>
            </div>

            {/* Right side: tab bar + main area */}
            <div className="ext-builder-right">
                {/* Tab bar */}
                <div className="ext-builder-tabs">
                    <button
                        className={`ext-tab ${activeTab === 'editor' ? 'active' : ''}`}
                        onClick={() => setActiveTab('editor')}
                    >
                        <span className="ext-tab-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><path d="M14 4l-4 16"/></svg></span>
                        代码
                    </button>
                    <button
                        className={`ext-tab ${activeTab === 'debugger' ? 'active' : ''}`}
                        onClick={() => setActiveTab('debugger')}
                    >
                        <span className="ext-tab-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/><circle cx="12" cy="12" r="3"/></svg></span>
                        调试器
                    </button>
                </div>

                <div className="ext-builder-main">
                {/* Block builder as a floating window (opens via 制作积木 button) */}
                {showBlockBuilder && (
                    <div className="ext-builder-modal-backdrop">
                        <div
                            ref={builderModalRef}
                            className="ext-builder-modal"
                            style={{
                                ...(builderModalPos ? { left: builderModalPos.x, top: builderModalPos.y, right: 'auto' } : null),
                                ...(builderSize ? { width: builderSize.width, height: builderSize.height } : null),
                                ...(builderMaximized ? { top: 8, left: 8, right: 8, bottom: 8, height: 'auto', maxHeight: 'none' } : null),
                                ...(builderMinimized ? { display: 'none' } : null)
                            }}
                        >
                            <div
                                className="ext-builder-modal-header"
                                onMouseDown={handleBuilderDragStart}
                                title="拖动移动窗口"
                            >
                                <span className="ext-builder-modal-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="#5b21b6" stroke="#5b21b6" strokeWidth="1.5" style={{verticalAlign:'middle',marginRight:'4px'}}><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>制作积木</span>
                                <div className="ext-builder-modal-controls">
                                    <button
                                        type="button"
                                        className="ext-builder-tb-btn"
                                        onClick={handleBuilderMinimize}
                                        aria-label="最小化制作积木"
                                        title="最小化"
                                    >─</button>
                                    <button
                                        type="button"
                                        className="ext-builder-tb-btn"
                                        onClick={handleBuilderMaximize}
                                        aria-label={builderMaximized ? '还原制作积木' : '最大化制作积木'}
                                        title={builderMaximized ? '还原' : '最大化'}
                                    >{builderMaximized ? '❐' : '□'}</button>
                                    <button
                                        type="button"
                                        className="ext-builder-tb-btn"
                                        onClick={() => setShowBlockBuilder(false)}
                                        aria-label="关闭制作积木"
                                        title="关闭"
                                    >×</button>
                                </div>
                            </div>
                            {/* 8 方向拉伸手柄层（与实时协作一致） */}
                            {!builderMinimized && !builderMaximized && (
                                <div className="ext-builder-resize-layer">
                                    {BUILDER_RESIZE_DIRS.map((dir) => (
                                        <div
                                            key={dir}
                                            className={`ext-builder-rz-${dir}`}
                                            onMouseDown={(e) => handleBuilderResizeStart(e, dir)}
                                        />
                                    ))}
                                </div>
                            )}
                            <div className="ext-builder-modal-body">
                    <div className="ext-block-list">
                        <button
                            className="ext-block-list-settings"
                            onClick={handleOpenSettings}
                            title="扩展设置"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> 扩展设置
                        </button>
                        <div className="ext-block-list-title">积木列表</div>
                        <div className="ext-block-list-items">
                            {customBlocks.map(block => (
                                <div
                                    key={block.id}
                                    className={`ext-block-list-item ${block.id === currentBlockId ? 'selected' : ''}`}
                                    onClick={() => editingBlockId !== block.id && handleSelectBlock(block.id)}
                                >
                                    {editingBlockId === block.id ? (
                                        <input
                                            className="ext-block-list-name-input"
                                            value={editingName}
                                            autoFocus
                                            onChange={(e) => setEditingName(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleCommitRename(block.id);
                                                } else if (e.key === 'Escape') {
                                                    handleCancelRename();
                                                }
                                            }}
                                            onBlur={() => handleCommitRename(block.id)}
                                        />
                                    ) : (
                                        <span
                                            className="ext-block-list-name"
                                            onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                handleStartRename(block.id, block.name);
                                            }}
                                            title="双击重命名"
                                        >{block.name}</span>
                                    )}
                                    {customBlocks.length > 1 && (
                                        <button
                                            className="ext-block-list-delete"
                                            onClick={(e) => { e.stopPropagation(); handleDeleteBlock(block.id); }}
                                            title="删除积木"
                                        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button className="ext-block-list-add" onClick={handleCreateBlock}>
                            + 创建积木
                        </button>

                        {/* Per-block editor (AstraEditor-style: type / config / target filter / icon) */}
                        {(() => {
                            const currentBlock = customBlocks.find(b => b.id === currentBlockId);
                            if (!currentBlock) return null;
                            return (
                                <div className="ext-block-editor">
                                    <div className="ext-block-editor-header">
                                        <span className="ext-block-editor-title">编辑积木</span>
                                        <span className="ext-block-editor-name">{currentBlock.name}</span>
                                    </div>

                                    {/* Live preview — shows the currently-edited block as a real Blockly SVG */}
                                    <div className="ext-block-editor-preview">
                                        <div className="ext-block-editor-preview-header">
                                            <span className="ext-block-editor-preview-label">
                                                {currentBlock.blockType === 'command' ? '命令积木'
                                                    : currentBlock.blockType === 'Boolean' ? '布尔积木'
                                                    : currentBlock.blockType === 'reporter' ? '报告积木'
                                                    : currentBlock.blockType === 'hat' ? '帽子积木'
                                                    : '条件积木'}
                                            </span>
                                        </div>
                                        <div
                                            className="ext-block-editor-preview-svg"
                                            dangerouslySetInnerHTML={{__html: panelPreviewSvg || '<span class="ext-block-editor-preview-empty">编辑字段以预览积木</span>'}}
                                        />
                                        <div
                                            ref={panelPreviewRef}
                                            className="ext-block-editor-preview-host"
                                            aria-hidden="true"
                                        />
                                    </div>

                                    {/* Field table (CB-ExtGallary style) */}
                                    <div className="ext-block-editor-fields-header">
                                        <span>类型</span>
                                        <span>文本</span>
                                        <span></span>
                                    </div>
                                    <div className="ext-block-editor-fields-list">
                                        {(Array.isArray(currentBlock.fields) ? currentBlock.fields : []).map((f, idx) => (
                                            <div key={idx} className="ext-block-editor-fields-row">
                                                <select
                                                    className="ext-block-editor-input ext-block-editor-input-type"
                                                    value={f.kind || 'text'}
                                                    onChange={(e) => handleUpdateField(currentBlock.id, idx, {kind: e.target.value})}
                                                >
                                                    <option value="label">标签</option>
                                                    <option value="text">字符串</option>
                                                    <option value="number">数字</option>
                                                    <option value="boolean">布尔</option>
                                                </select>
                                                <input
                                                    className="ext-block-editor-input ext-block-editor-input-text"
                                                    value={f.text || ''}
                                                    onChange={(e) => handleUpdateField(currentBlock.id, idx, {text: e.target.value})}
                                                    placeholder="字段文本"
                                                />
                                                {f.kind === 'number' && (
                                                    <input
                                                        className="ext-block-editor-input ext-block-editor-input-default"
                                                        type="number"
                                                        value={f.default || '0'}
                                                        onChange={(e) => handleUpdateField(currentBlock.id, idx, {default: e.target.value})}
                                                        placeholder="默认值"
                                                        title="数字默认值"
                                                    />
                                                )}
                                                {f.kind === 'boolean' && (
                                                    <select
                                                        className="ext-block-editor-input ext-block-editor-input-default"
                                                        value={f.default || 'true'}
                                                        onChange={(e) => handleUpdateField(currentBlock.id, idx, {default: e.target.value})}
                                                        title="布尔默认值"
                                                    >
                                                        <option value="true">是</option>
                                                        <option value="false">否</option>
                                                    </select>
                                                )}
                                                <button
                                                    type="button"
                                                    className="ext-block-editor-fields-delete"
                                                    onClick={() => handleRemoveField(currentBlock.id, idx)}
                                                    title="删除此字段"
                                                >删除</button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Add field row (CB-ExtGallary style) */}
                                    <div className="ext-block-editor-fields-add">
                                        <button
                                            type="button"
                                            className="ext-block-editor-fields-add-btn"
                                            onClick={() => handleAddField(currentBlock.id, 'text')}
                                        >添加字段</button>
                                        <select
                                            className="ext-block-editor-input ext-block-editor-fields-add-type"
                                            defaultValue="text"
                                            id="ext-block-editor-fields-add-type-select"
                                        >
                                            <option value="label">标签</option>
                                            <option value="text">字符串</option>
                                            <option value="number">数字</option>
                                            <option value="boolean">布尔</option>
                                        </select>
                                    </div>

                                    {/* Block metadata (collapsed by default for cleaner UI) */}
                                    <details className="ext-block-editor-meta">
                                        <summary>积木元数据（高级）</summary>
                                        <label className="ext-block-editor-label">ID</label>
                                        <input
                                            className="ext-block-editor-input"
                                            value={currentBlock.id.replace(/^block_/, '')}
                                            readOnly
                                            title="积木 ID 由系统生成，可在扩展设置中自定义扩展 ID"
                                        />

                                        <label className="ext-block-editor-label">积木类型</label>
                                        <select
                                            className="ext-block-editor-input"
                                            value={currentBlock.blockType || 'command'}
                                            onChange={(e) => handleUpdateBlock(currentBlock.id, {blockType: e.target.value})}
                                        >
                                            <option value="command">命令积木</option>
                                            <option value="Boolean">布尔积木</option>
                                            <option value="reporter">报告积木</option>
                                            <option value="hat">帽子积木</option>
                                            <option value="conditional">条件积木</option>
                                        </select>

                                        <label className="ext-block-editor-label">积木颜色</label>
                                        <div className="ext-block-colour-picker">
                                            <input
                                                type="color"
                                                className="ext-block-colour-input"
                                                value={/^#[0-9a-fA-F]{6}$/.test(currentBlock.colour || '') ? currentBlock.colour : '#9966FF'}
                                                onChange={(e) => handleUpdateBlock(currentBlock.id, {colour: e.target.value})}
                                                title="自定义颜色"
                                            />
                                            {BLOCK_COLOURS.map(c => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    className={'ext-block-colour-swatch' + (currentBlock.colour === c ? ' ext-block-colour-swatch-active' : '')}
                                                    style={{background: c}}
                                                    onClick={() => handleUpdateBlock(currentBlock.id, {colour: currentBlock.colour === c ? '' : c})}
                                                    title={c}
                                                />
                                            ))}
                                            {!!currentBlock.colour && (
                                                <button
                                                    type="button"
                                                    className="ext-block-colour-clear"
                                                    onClick={() => handleUpdateBlock(currentBlock.id, {colour: ''})}
                                                >默认</button>
                                            )}
                                        </div>

                                        <div className="ext-block-editor-section">积木配置</div>
                                        <label className="ext-block-editor-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={!!currentBlock.isTerminal}
                                                onChange={(e) => handleUpdateBlock(currentBlock.id, {isTerminal: e.target.checked})}
                                            />
                                            结尾积木
                                        </label>
                                        <label className="ext-block-editor-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={!!currentBlock.isAsync}
                                                onChange={(e) => handleUpdateBlock(currentBlock.id, {isAsync: e.target.checked})}
                                            />
                                            异步积木
                                        </label>
                                        <label className="ext-block-editor-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={!!currentBlock.attachAllThreads}
                                                onChange={(e) => handleUpdateBlock(currentBlock.id, {attachAllThreads: e.target.checked})}
                                            />
                                            附加所有线程
                                        </label>

                                        <div className="ext-block-editor-section">目标过滤</div>
                                        <label className="ext-block-editor-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={!!currentBlock.filterSprite}
                                                onChange={(e) => handleUpdateBlock(currentBlock.id, {filterSprite: e.target.checked})}
                                            />
                                            在角色中显示
                                        </label>
                                        <label className="ext-block-editor-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={!!currentBlock.filterStage}
                                                onChange={(e) => handleUpdateBlock(currentBlock.id, {filterStage: e.target.checked})}
                                            />
                                            在舞台中显示
                                        </label>

                                        <button
                                            type="button"
                                            className="ext-block-editor-icon-btn"
                                            onClick={() => currentBlock.icon
                                                ? handleClearBlockIcon(currentBlock.id)
                                                : handlePickBlockIcon(currentBlock.id)}
                                        >
                                            {currentBlock.icon ? '移除图标' : '上传积木图标'}
                                        </button>
                                    </details>

                                    <div className="ext-block-editor-hint">
                                        在右侧 Blockly 工作区拖入积木来定义此积木的代码实现
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Blockly's native workspace + toolbox */}
                <div className="ext-builder-workspace-full">
                    {loadError && (
                        <div className="ext-builder-load-error">
                            <p style={{color: '#f48771', padding: '8px'}}>
                                ⚠️ Blockly 加载失败: {loadError}
                            </p>
                        </div>
                    )}
                    <div ref={blocklyDivRef} className="blockly-host" />
                </div>

                {/* Right code panel */}
                <div className="ext-builder-stage">
                    <div className="ext-stage-header">
                        <span className="ext-stage-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:'6px'}}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>JavaScript 代码</span>
                        <div className="ext-stage-actions">
                            <button className="ext-stage-btn" onClick={handleOpenPreview} title="扩展积木预览">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                            <button className="ext-stage-btn ext-stage-btn-copy" onClick={handleCopyCode} title="复制完整代码，可直接粘贴到 TurboWarp">
                                {copyMsg ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2"><polyline points="20,6 9,17 4,12"/></svg> 已复制</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> 复制</>}
                            </button>
                            <button className="ext-stage-btn" onClick={handleExport} title="导出">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </button>
                            <button className="ext-stage-btn" onClick={handleLoadExtension} title="加载">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            </button>
                            <button className="ext-stage-btn" onClick={handleReset} title="重置">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                    </div>

                    {/* Add block by category - removed (Blockly toolbox now handles drag-from-flyout) */}

                    <div className="ext-stage-screen">
                        <pre className="ext-code-content">
                            <code>{exportableCode || '// 拖入积木，JS 代码会自动生成在这里\n// Drag blocks into the workspace, JS will appear here'}</code>
                        </pre>
                    </div>
                    <div className="ext-stage-footer">
                        <div className="ext-stage-footer-left">
                            <button onClick={handleUndo} title="撤销"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H13"/></svg> 撤销</button>
                            <button onClick={handleRedo} title="重做"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 014-4h14"/></svg> 重做</button>
                        </div>
                        <div className="ext-stage-footer-right">
                            <span className="ext-stat-item" title="代码行数"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg> {projectStats.lineCount} 行</span>
                            <span className="ext-stat-item" title="导出文件大小">{formatBytes(projectStats.fullSize)}</span>
                        </div>
                    </div>
                </div>
                </div>
            </div>

            {/* 统一设置面板（编辑器设置 + 插件管理）— 实时协作风格悬浮框 */}
            {showSettingsPanel && settingsDraft && (
                <React.Fragment>
                {/* 自由拉伸层（8 方向手柄，面板打开时常驻显示） */}
                {!settingsMinimized && !settingsMaximized && (
                    <div className="ext-float-resize-layer" ref={settingsResizeLayerRef}>
                        {['n','s','e','w','ne','nw','se','sw'].map(dir => (
                            <div
                                key={dir}
                                className={`ext-float-resize-handle ext-fz-${dir}`}
                                onMouseDown={handleSettingsResizeDown(dir)}
                            />
                        ))}
                    </div>
                )}
                <div
                    ref={settingsPanelRef}
                    className={`ext-float-panel ext-settings-unified ${settingsMinimized ? 'ext-float-minimized' : ''}`}
                    style={{ display: settingsMinimized ? 'none' : '' }}
                    onMouseDown={handleSettingsHeaderMouseDown}
                >
                    <div
                        className="ext-settings-unified-header ext-float-header"
                        onMouseDown={handleSettingsHeaderMouseDown}
                    >
                        <h2 className="ext-settings-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:'6px'}}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>设置</h2>
                        <div className="ext-float-btns">
                            <button
                                type="button"
                                className="ext-float-btn"
                                onClick={handleSettingsToggleMin}
                                aria-label="最小化"
                                title="最小化"
                            >−</button>
                            <button
                                type="button"
                                className="ext-float-btn"
                                onClick={handleSettingsToggleMax}
                                aria-label={settingsMaximized ? '还原' : '最大化'}
                                title={settingsMaximized ? '还原' : '最大化'}
                            >{settingsMaximized ? '❐' : '□'}</button>
                            <button
                                type="button"
                                className="ext-float-btn ext-float-btn-close"
                                onClick={handleCloseSettings}
                                aria-label="关闭"
                                title="关闭"
                            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                        </div>
                    </div>

                        {/* 标签页栏 */}
                        <div className="ext-settings-tabs" onMouseDown={handleSettingsHeaderMouseDown}>
                            <button
                                type="button"
                                className={`ext-settings-tab ${settingsTab === 'editor' ? 'active' : ''}`}
                                onClick={() => setSettingsTab('editor')}
                            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b21b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>编辑器设置</button>
                            <button
                                type="button"
                                className={`ext-settings-tab ${settingsTab === 'addons' ? 'active' : ''}`}
                                onClick={() => { setSettingsTab('addons'); setMarketView(false); }}
                            ><svg width="14" height="14" viewBox="0 0 24 24" fill="#5b21b6" stroke="#5b21b6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'4px'}}><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>插件管理</button>
                            <button
                                type="button"
                                className={`ext-settings-tab ${settingsTab === 'addons' && marketView ? 'active' : ''}`}
                                onClick={() => { setSettingsTab('addons'); handleOpenMarket(); }}
                            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b21b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'4px'}}><rect x="3" y="3" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v7"/><path d="M16 3v7"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="12" y1="12" x2="12" y2="18"/></svg>插件市场</button>
                        </div>

                        {/* ===== 编辑器设置标签页 ===== */}
                        {settingsTab === 'editor' && (
                            <div className="ext-settings-tab-content">
                        <div
                            className="ext-settings-banner"
                            style={{
                                background: `linear-gradient(135deg, ${settingsDraft.color1}, ${settingsDraft.color2}, ${settingsDraft.color3})`
                            }}
                        >
                            {settingsDraft.blockIcon ? (
                                <img src={settingsDraft.blockIcon} alt="icon" className="ext-settings-banner-icon" />
                            ) : (
                                <div className="ext-settings-banner-icon ext-settings-banner-placeholder">⊞</div>
                            )}
                        </div>
                        <h2 className="ext-settings-title">创建扩展</h2>

                        <label className="ext-settings-label">名称</label>
                        <input
                            className="ext-settings-input"
                            value={settingsDraft.name}
                            placeholder="扩展名称..."
                            onChange={(e) => setSettingsDraft({...settingsDraft, name: e.target.value})}
                        />

                        <div className="ext-settings-id-preview">
                            {settingsDraft.customId ? settingsDraft.id : DEFAULT_EXTENSION_INFO.id}
                        </div>

                        <label className="ext-settings-checkbox">
                            <input
                                type="checkbox"
                                checked={settingsDraft.customId}
                                onChange={(e) => setSettingsDraft({
                                    ...settingsDraft,
                                    customId: e.target.checked,
                                    id: e.target.checked ? (settingsDraft.id || DEFAULT_EXTENSION_INFO.id) : DEFAULT_EXTENSION_INFO.id
                                })}
                            />
                            自定义ID?
                        </label>
                        {settingsDraft.customId && (
                            <input
                                className="ext-settings-input"
                                placeholder="扩展ID"
                                value={settingsDraft.id}
                                onChange={(e) => setSettingsDraft({...settingsDraft, id: e.target.value})}
                            />
                        )}

                        <label className="ext-settings-label">描述</label>
                        <input
                            className="ext-settings-input"
                            value={settingsDraft.description}
                            placeholder="扩展描述..."
                            onChange={(e) => setSettingsDraft({...settingsDraft, description: e.target.value})}
                        />

                        <label className="ext-settings-label">作者</label>
                        <input
                            className="ext-settings-input"
                            value={settingsDraft.author}
                            placeholder="作者名称..."
                            onChange={(e) => setSettingsDraft({...settingsDraft, author: e.target.value})}
                        />

                        <label className="ext-settings-label">文档链接</label>
                        <input
                            className="ext-settings-input"
                            value={settingsDraft.docsUrl}
                            placeholder="https://..."
                            onChange={(e) => setSettingsDraft({...settingsDraft, docsUrl: e.target.value})}
                        />

                        <label className="ext-settings-label">许可证</label>
                        <select
                            className="ext-settings-input"
                            value={settingsDraft.license}
                            onChange={(e) => setSettingsDraft({...settingsDraft, license: e.target.value})}
                        >
                            {LICENSE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>

                        <div className="ext-settings-label-row">
                            <span className="ext-settings-label">自定义颜色:</span>
                            <input
                                type="color"
                                className="ext-settings-color-picker"
                                value={settingsDraft.color1}
                                onChange={(e) => {
                                    const c = e.target.value;
                                    setSettingsDraft({
                                        ...settingsDraft,
                                        color1: c,
                                        color2: c,
                                        color3: c
                                    });
                                }}
                            />
                        </div>
                        <div className="ext-settings-color-presets">
                            {COLOR_PRESETS.map((preset, i) => {
                                const active = preset[0] === settingsDraft.color1
                                    && preset[1] === settingsDraft.color2
                                    && preset[2] === settingsDraft.color3;
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        className={`ext-settings-color-swatch ${active ? 'active' : ''}`}
                                        onClick={() => handlePickColor(preset)}
                                        title={preset.join(', ')}
                                        style={{
                                            background: `linear-gradient(135deg, ${preset[0]}, ${preset[1]}, ${preset[2]})`
                                        }}
                                    />
                                );
                            })}
                        </div>

                        <div className="ext-settings-icon-row">
                            <div className="ext-settings-icon-cell">
                                <div className="ext-settings-label">分类图标</div>
                                <div className="ext-settings-icon-preview">
                                    {settingsDraft.categoryIcon ? (
                                        <img src={settingsDraft.categoryIcon} alt="category" />
                                    ) : (
                                        <span className="ext-settings-icon-empty">未选择图标</span>
                                    )}
                                </div>
                                <div className="ext-settings-icon-actions">
                                    <button
                                        type="button"
                                        className="ext-settings-icon-btn"
                                        onClick={() => handlePickIcon('categoryIcon')}
                                    >上传</button>
                                    {settingsDraft.categoryIcon && (
                                        <button
                                            type="button"
                                            className="ext-settings-icon-clear"
                                            onClick={() => handleClearIcon('categoryIcon')}
                                        >清除</button>
                                    )}
                                </div>
                            </div>

                            <div className="ext-settings-icon-cell">
                                <div className="ext-settings-label">积木图标</div>
                                <div className="ext-settings-icon-preview">
                                    {settingsDraft.blockIcon ? (
                                        <img src={settingsDraft.blockIcon} alt="block" />
                                    ) : (
                                        <span className="ext-settings-icon-empty">未选择图标</span>
                                    )}
                                </div>
                                <div className="ext-settings-icon-actions">
                                    <button
                                        type="button"
                                        className="ext-settings-icon-btn"
                                        onClick={() => handlePickIcon('blockIcon')}
                                    >上传</button>
                                    {settingsDraft.blockIcon && (
                                        <button
                                            type="button"
                                            className="ext-settings-icon-clear"
                                            onClick={() => handleClearIcon('blockIcon')}
                                        >清除</button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="ext-settings-actions">
                            <button
                                type="button"
                                className="ext-settings-cancel"
                                onClick={handleCloseSettings}
                            >取消</button>
                            <button
                                type="button"
                                className="ext-settings-done"
                                onClick={handleApplySettings}
                            >完成</button>
                        </div>
                            </div>
                        )}

                        {/* ===== 插件管理标签页 ===== */}
                        {settingsTab === 'addons' && (
                            <div className="ext-settings-tab-content ext-addons-tab-content">
                                {marketView ? (
                                    <div className="ext-market">
                                        <div className="ext-market-head">
                                            <button
                                                type="button"
                                                className="ext-market-back"
                                                onClick={() => setMarketView(false)}
                                                title="返回插件管理"
                                            >← 返回</button>
                                            <span className="ext-market-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b21b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'4px'}}><rect x="3" y="3" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v7"/><path d="M16 3v7"/></svg>插件市场</span>
                                            <span className="ext-market-repo">主题：{MARKET_TOPIC}</span>
                                            {!marketLoading && marketList.length > 0 && (
                                                <span className="ext-market-count">共 {marketList.length} 个</span>
                                            )}
                                            <button
                                                type="button"
                                                className="ext-market-refresh-btn"
                                                onClick={() => { setMarketList([]); handleOpenMarket(); }}
                                                disabled={marketLoading}
                                                title="刷新插件列表"
                                            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> 刷新</button>
                                        </div>
                                        {marketLoading && <div className="ext-market-loading">正在加载插件市场…</div>}
                                        {marketError && <div className="ext-market-error">⚠ {marketError}</div>}
                                        {!marketLoading && !marketError && marketList.length === 0 && (
                                            <div className="ext-market-empty">市场暂时没有可安装的插件</div>
                                        )}
                                        {!marketLoading && !marketError && marketList.length > 0 && (
                                        <div className="ext-market-grid">
                                            {marketList.map(item => (
                                                <div key={item.source} className="ext-market-card">
                                                    <div className="ext-market-card-name">{item.name}</div>
                                                    <div className="ext-market-card-cat">{item.category}</div>
                                                    <div className="ext-market-card-repo">{item.repoOwner}/{item.repoName}</div>
                                                    <div className="ext-market-card-desc">{item.description}</div>
                                                    <button
                                                        type="button"
                                                        className={`ext-market-install-btn ${marketInstalled[item.dir] ? 'installed' : ''}`}
                                                        disabled={marketInstalled[item.dir] || marketInstalling === item.dir}
                                                        onClick={() => handleMarketInstall(item)}
                                                    >
                                                        {marketInstalled[item.dir] ? '已安装' : (marketInstalling === item.dir ? '安装中…' : '安装')}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        )}
                                    </div>
                                ) : (
                                <div>
                                <div className="ext-addons-search">
                                    <input
                                        type="search"
                                        className="ext-addons-search-input"
                                        placeholder="搜索插件..."
                                        value={addonSearch}
                                        onChange={(e) => setAddonSearch(e.target.value)}
                                    />
                                </div>
                                <div className="ext-addons-list">
                                    {getAllAddons()
                                        .filter(addon => {
                                            if (!addonSearch.trim()) return true;
                                            const q = addonSearch.trim().toLowerCase();
                                            return addon.name.toLowerCase().indexOf(q) >= 0 ||
                                                addon.description.toLowerCase().indexOf(q) >= 0 ||
                                                addon.category.toLowerCase().indexOf(q) >= 0;
                                        })
                                        .map(addon => (
                                        <div key={addon.id} className="ext-addon-item">
                                            <label className="ext-addon-label">
                                                <input
                                                    type="checkbox"
                                                    className="ext-addon-check"
                                                    checked={!!addonState[addon.id]}
                                                    disabled={!!addon.locked}
                                                    onChange={(e) => handleToggleAddon(addon.id, e.target.checked)}
                                                />
                                                <span className="ext-addon-name">{addon.name}</span>
                                                {addon.recommended && <span className="ext-addon-recommend">推荐</span>}
                                                {addon.builtin && <span className="ext-addon-builtin">内置</span>}
                                                <span className="ext-addon-cat">{addon.category}</span>
                                                {addon.custom && (
                                                    <span className="ext-addon-source">来自：{addon.source || '本地文件'}</span>
                                                )}
                                                {addon.custom && (
                                                    <button
                                                        type="button"
                                                        className="ext-addon-del"
                                                        title="删除此自定义插件"
                                                        aria-label="删除自定义插件"
                                                        onClick={() => handleRemoveCustomAddon(addon.id)}
                                                    >删除</button>
                                                )}
                                                {addon.custom && addon.source && (
                                                    <button
                                                        type="button"
                                                        className="ext-addon-update"
                                                        title="按来源重新拉取并更新"
                                                        aria-label="更新插件"
                                                        onClick={() => handleUpdateAddon(addon.id)}
                                                    >更新</button>
                                                )}
                                            </label>
                                            <div className="ext-addon-desc">{addon.description}</div>
                                            {addonState[addon.id] && addon.options && addon.options.length > 0 && (
                                                <div className="ext-addon-opts">
                                                    {addon.options.map(opt => (
                                                        <label key={opt.id} className="ext-addon-opt-item">
                                                            <input
                                                                type="checkbox"
                                                                className="ext-addon-opt-check"
                                                                checked={!!(addonOpts[addon.id] && addonOpts[addon.id][opt.id])}
                                                                onChange={(e) => handleToggleAddonOption(addon.id, opt.id, e.target.checked)}
                                                            />
                                                            <span className="ext-opt-label">{opt.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {getAllAddons().filter(addon => {
                                        if (!addonSearch.trim()) return true;
                                        const q = addonSearch.trim().toLowerCase();
                                        return addon.name.toLowerCase().indexOf(q) >= 0 ||
                                            addon.description.toLowerCase().indexOf(q) >= 0 ||
                                            addon.category.toLowerCase().indexOf(q) >= 0;
                                    }).length === 0 && (
                                        <div className="ext-addon-empty">没有匹配的插件</div>
                                    )}
                                </div>
                                <div className="ext-addons-actions">
                                    <button
                                        type="button"
                                        className="ext-addons-action-btn ext-addons-action-btn-primary"
                                        onClick={() => { setInstallError(''); setInstallStatus(''); setInstallSource(''); setShowInstallModal(true); }}
                                        title="从 npm / GitHub / 直链 / 本地文件安装插件（对齐 DeepSeek Harness 的 dsh plugin add）"
                                    >安装插件</button>
                                    <button
                                        type="button"
                                        className="ext-addons-action-btn ext-addons-action-btn-info"
                                        onClick={() => window.open('ext-addons-doc.html', '_blank')}
                                        title="打开插件开发文档与使用教程（独立页面）"
                                    >开发教程</button>
                                    <button
                                        type="button"
                                        className="ext-addons-action-btn"
                                        onClick={handleAddonExport}
                                    >导出设置</button>
                                    <button
                                        type="button"
                                        className="ext-addons-action-btn"
                                        onClick={handleAddonImport}
                                    >导入设置</button>
                                    <button
                                        type="button"
                                        className="ext-addons-action-btn ext-addons-action-btn-warn"
                                        onClick={handleAddonReset}
                                    >全部重置</button>
                                </div>
                                <div className="ext-addons-foot">
                                    <button
                                        type="button"
                                        className="ext-auth-btn"
                                        onClick={handleCloseSettings}
                                    >完成</button>
                                </div>
                                </div>
                                )}
                            </div>
                        )}
                    </div>
                </React.Fragment>
            )}

            {/* Block preview modal (mimics AstraEditor "扩展预览") */}
            <div
                className="ext-preview-host"
                ref={previewHostRef}
                aria-hidden="true"
            />
            {showBlockPreview && (
                <div className="ext-modal-backdrop" onClick={handleClosePreview}>
                    <div
                        className="ext-modal ext-preview-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="ext-preview-modal-header">
                            <h2 className="ext-settings-title">扩展积木预览</h2>
                            <button
                                type="button"
                                className="ext-preview-modal-close"
                                onClick={handleClosePreview}
                                aria-label="关闭预览"
                            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                        </div>
                        <div className="ext-preview-modal-sub">
                            <span className="ext-preview-ext-name">{extInfo.name}</span>
                            <span className="ext-preview-block-count">共 {previewBlocks.length} 个积木</span>
                        </div>
                        <div className="ext-preview-list">
                            {previewBlocks.length === 0 ? (
                                <div className="ext-preview-empty">没有可预览的积木</div>
                            ) : (
                                previewBlocks.map((b, i) => (
                                    <div
                                        key={b.type + i}
                                        className="ext-preview-item"
                                        title={b.type}
                                    >
                                        <div className="ext-preview-item-type">{b.type}</div>
                                        <div
                                            className="ext-preview-item-svg"
                                            dangerouslySetInnerHTML={{__html: b.svgXml}}
                                        />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 登录 / 注册 弹窗 */}
            {showAuthModal && (
                <div
                    className="ext-auth-backdrop"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}
                >
                    <div className="ext-auth-card">
                        <div className="ext-auth-header">
                            <span className="ext-auth-title">
                                {authMode === 'login' ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:'6px'}}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>登录</> : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:'6px'}}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>注册</>}
                            </span>
                            <button
                                type="button"
                                className="ext-builder-modal-close"
                                onClick={() => setShowAuthModal(false)}
                                aria-label="关闭"
                                title="关闭"
                            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                        </div>
                        <form className="ext-auth-form" onSubmit={handleAuthSubmit}>
                                {authMode === 'register' && (
                                    <React.Fragment>
                                        <label className="ext-auth-label">邮箱</label>
                                        <input
                                            className="ext-auth-input"
                                            type="email"
                                            value={authEmail}
                                            onChange={(e) => setAuthEmail(e.target.value)}
                                            placeholder="输入邮箱地址"
                                            autoFocus
                                        />
                                        <label className="ext-auth-label">邮箱验证码</label>
                                        <div className="ext-auth-code-row">
                                            <input
                                                className="ext-auth-input ext-auth-code-input"
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={6}
                                                value={authCode}
                                                onChange={(e) => setAuthCode(e.target.value.replace(/\D/g, ''))}
                                                placeholder="请输入 6 位验证码"
                                                autoComplete="one-time-code"
                                            />
                                            <button
                                                type="button"
                                                className="ext-auth-code-btn"
                                                onClick={handleSendCode}
                                                disabled={codeSending || codeCountdown > 0}
                                            >
                                                {codeSending ? '发送中…' : (codeCountdown > 0 ? `${codeCountdown}秒后重发` : '发送验证码')}
                                            </button>
                                        </div>
                                        {devCode && (
                                            <div style={{fontSize:12, color:'#059669', marginTop:2, fontWeight:600}}>
                                                验证码（调试用）：{devCode}
                                            </div>
                                        )}
                                    </React.Fragment>
                                )}
                                <label className="ext-auth-label">用户名</label>
                                <input
                                    className="ext-auth-input"
                                    value={authUser}
                                    onChange={(e) => setAuthUser(e.target.value)}
                                    placeholder="输入用户名"
                                    autoFocus={authMode !== 'register'}
                                />
                                <label className="ext-auth-label">密码</label>
                                <input
                                    className="ext-auth-input"
                                    type="password"
                                    value={authPass}
                                    onChange={(e) => setAuthPass(e.target.value)}
                                    placeholder={authMode === 'register' ? '至少 4 个字符' : '输入密码'}
                                />
                                {authMode === 'register' && (
                                    <React.Fragment>
                                        <label className="ext-auth-label">确认密码</label>
                                        <input
                                            className="ext-auth-input"
                                            type="password"
                                            value={authPass2}
                                            onChange={(e) => setAuthPass2(e.target.value)}
                                            placeholder="再次输入密码"
                                        />
                                        {/* Cloudflare Turnstile 人机验证 */}
                                        <div id="ext-turnstile-container" className="ext-turnstile-container" ref={turnstileContainerRef}></div>
                                    </React.Fragment>
                                )}
                                {authError && <div className="ext-auth-error">{authError}</div>}
                                <label className="ext-auth-remember" title="勾选后 30 天内打开本网站自动登录，无需重复输入密码">
                                    <input
                                        type="checkbox"
                                        checked={authRemember}
                                        onChange={(e) => setAuthRemember(e.target.checked)}
                                    />
                                    <span>自动登录（记住我，30 天内免登录）</span>
                                </label>
                                <button className="ext-auth-btn" type="submit" disabled={authBusy}>
                                    {authBusy ? '请稍候…' : (authMode === 'login' ? '登录' : '注册并登录')}
                                </button>
                                <div className="ext-auth-divider"><span>或</span></div>
                                <button
                                    type="button"
                                    className="ext-auth-github-btn"
                                    onClick={handleGitHubLogin}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{verticalAlign:'middle',marginRight:'8px'}}>
                                        <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 015.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0023.5 12C23.5 5.73 18.27.5 12 .5z"/>
                                    </svg>
                                    使用 GitHub 登录
                                </button>
                                <button
                                    type="button"
                                    className="ext-auth-switch"
                                    onClick={() => {
                                        setAuthMode(authMode === 'login' ? 'register' : 'login');
                                        setAuthError('');
                                    }}
                                >
                                    {authMode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
                                </button>
                            </form>
                    </div>
                </div>
            )}

            {/* 安装插件对话框（对齐 DeepSeek Harness 的 dsh plugin add） */}
            {showInstallModal && (
                <div
                    className="ext-auth-backdrop"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowInstallModal(false); }}
                >
                    <div className="ext-auth-card ext-install-card">
                        <div className="ext-auth-header">
                            <span className="ext-auth-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b21b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'4px'}}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>安装插件</span>
                            <button
                                type="button"
                                className="ext-builder-modal-close"
                                onClick={() => setShowInstallModal(false)}
                                aria-label="关闭"
                                title="关闭"
                            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                        </div>
                        <div className="ext-install-body">
                            <p className="ext-install-hint">
                                粘贴来源后点击「安装」。支持：
                            </p>
                            <ul className="ext-install-sources">
                                <li><code>npm 包名</code>（如 <code>my-addon</code> 或 <code>@scope/addon</code>）</li>
                                <li><code>github:owner/repo</code> 或 <code>owner/repo</code></li>
                                <li>直链 <code>https://…/plugin.js</code> 或 <code>.tgz</code> 包</li>
                                <li>本地 <code>.js</code> 文件 / 文件夹（含 HTML·CSS·图片·JS）/ <code>.zip</code> 包</li>
                            </ul>
                            <input
                                type="text"
                                className="ext-install-input"
                                placeholder="npm 包名 / github:owner/repo / 直链 URL"
                                value={installSource}
                                onChange={(e) => setInstallSource(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !installLoading) handleInstallFromSource(installSource); }}
                            />
                            <div className="ext-install-actions">
                                <button
                                    type="button"
                                    className="ext-addons-action-btn ext-addons-action-btn-primary"
                                    disabled={installLoading}
                                    onClick={() => handleInstallFromSource(installSource)}
                                >{installLoading ? '安装中…' : '安装'}</button>
                                <button
                                    type="button"
                                    className="ext-addons-action-btn"
                                    disabled={installLoading}
                                    onClick={() => handleInstallLocalFile('file')}
                                    title="导入单个 JS 插件文件"
                                >单个 JS</button>
                                <button
                                    type="button"
                                    className="ext-addons-action-btn"
                                    disabled={installLoading}
                                    onClick={() => handleInstallLocalFile('folder')}
                                    title="导入整个文件夹（含 index.js 与 HTML/CSS/图片/JS 等资源）"
                                >文件夹</button>
                                <button
                                    type="button"
                                    className="ext-addons-action-btn"
                                    disabled={installLoading}
                                    onClick={() => handleInstallLocalFile('zip')}
                                    title="导入 ZIP 包（含 index.js 与 HTML/CSS/图片/JS 等资源）"
                                >ZIP 包</button>
                                <button
                                    type="button"
                                    className="ext-addons-action-btn"
                                    onClick={() => { setShowInstallModal(false); }}
                                >取消</button>
                            </div>
                            {installStatus && <div className="ext-install-status">✓ {installStatus}</div>}
                            {installError && <div className="ext-install-error">✕ {installError}</div>}
                            <p className="ext-install-note">
                                文件夹 / ZIP 需含 <code>index.js</code> 入口；其它 HTML·CSS·图片·JS 会作为资源随插件持久化，
                                可在 <code>setup(ctx)</code> 中通过 <code>ctx.loadAsset()</code> / <code>ctx.fileOverride()</code> 读取并改写网页底层文件。
                                文档见右上角「开发教程」。
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* 插件开发与使用教程已移至独立页面：ext-addons-doc.html */}


            {/* 用户面板悬浮框 */}
            {userPanelType && session && (
                <React.Fragment>
                {userResizeLayerOn && !userMinimized && (
                    <div className="ext-float-resize-layer">
                        {['n','s','e','w','ne','nw','se','sw'].map(dir => (
                            <div key={dir} className={"ext-fz-" + dir} onMouseDown={handleUserResizeDown(dir)} />
                        ))}
                    </div>
                )}
                <div
                    ref={userFloatRef}
                    className={`ext-float-panel ${userMinimized ? 'ext-float-minimized' : ''}`}
                    style={{ display: userMinimized ? 'none' : '', left: userFloatBounds.x, top: userFloatBounds.y, width: userFloatBounds.w, height: userFloatBounds.h }}
                    onMouseDown={handleUserHeaderMouseDown}
                >
                    <div className="ext-float-header">
                        <span className="ext-float-title">
                            {userPanelType === 'profile' && <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:'6px'}}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>个人主页</>}
                            {userPanelType === 'friends' && <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:'6px'}}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>好友 / 关注</>}
                            {userPanelType === 'saves' && <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',marginRight:'6px'}}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,9 15,9"/></svg>存档管理</>}
                        </span>
                        <div className="ext-float-btns">
                            <button type="button" className="ext-float-btn" onClick={handleUserToggleMin} title="最小化">−</button>
                            <button type="button" className="ext-float-btn" onClick={handleUserToggleMax} aria-label={userMaximized ? '还原' : '最大化'} title={userMaximized ? '还原' : '最大化'}>{userMaximized ? '❐' : '□'}</button>
                            <button type="button" className="ext-float-btn" onClick={closeUserPanel} aria-label="关闭" title="关闭"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                        </div>
                    </div>
                    <div className="ext-float-body" style={{overflow:'auto'}}>
                        {/* 从 friendsRelations 推导好友/关注/粉丝列表 */}
                        {(() => {
                            const me = session ? session.username : '';
                            const following = [], followers = [];
                            const fwd = new Set(), bwd = new Set();
                            for (const r of friendsRelations) {
                                if (r.follower === me) { following.push(r.followee); fwd.add(r.followee); }
                                if (r.followee === me) { followers.push(r.follower); bwd.add(r.follower); }
                            }
                            // 互关 = 好友
                            const friendSet = new Set([...fwd].filter(u => bwd.has(u)));
                            const emptyText = friendsTab === 'friends' ? '暂无好友' : friendsTab === 'following' ? '你还没有关注任何人' : '还没有人关注你';
                            let listItems = [];
                            if (friendsTab === 'friends') listItems = [...friendSet].map(u => ({u, followBack: false, action: 'unfriend', label: '解除好友'}));
                            else if (friendsTab === 'following') listItems = following.map(u => ({u, followBack: bwd.has(u), action: 'unfollow-following', label: '取消关注'}));
                            else listItems = followers.map(u => ({u, followBack: fwd.has(u), action: 'unfollow-follower', label: '移除粉丝'}));
                            // 将推导结果挂到 window 上供闭包内 JSX 使用（避免在 return 外声明额外 state）
                            window.__extFriends = { friendSet, following, followers, listItems, emptyText };
                            return null;
                        })()}
                        {userPanelType === 'friends' && (
                    <div className="ext-float-content">
                        <div className="ext-friends-intro">
                            关注他人即可建立联系；互相关注会自动成为好友。数据存储在云端，跨设备同步。
                        </div>
                        {!cloudAvailable() && (
                            <div className="ext-friends-msg">⚠️ 云端未启用，好友功能暂不可用。请检查 supabase-config.js 的 Supabase 配置。</div>
                        )}

                        {/* 搜索添加 */}
                        <div className="ext-friends-search">
                            <input
                                type="search"
                                className="ext-friends-search-input"
                                placeholder="输入用户名搜索用户…"
                                value={friendsSearch}
                                onChange={(e) => setFriendsSearch(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleFriendSearch(); }}
                            />
                            <button
                                type="button"
                                className="ext-friends-search-btn"
                                onClick={handleFriendSearch}
                                disabled={friendsBusy}
                            >搜索</button>
                        </div>
                        {friendsResults.length > 0 && (
                            <div className="ext-friends-results">
                                {friendsResults.map(r => {
                                    const isFollowing = (window.__extFriends ? window.__extFriends.following : []).indexOf(r.username) >= 0;
                                    return (
                                        <div key={r.username} className="ext-friends-item">
                                            <span className="ext-friends-name">{r.username}</span>
                                            <button
                                                type="button"
                                                className={'ext-friends-btn' + (isFollowing ? ' ext-friends-btn-done' : '')}
                                                disabled={friendsBusy}
                                                onClick={() => handleFriendAction(r.username, isFollowing ? 'unfollow-following' : 'follow')}
                                            >{isFollowing ? '已关注 ✓' : '关注'}</button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* 分组标签 */}
                        <div className="ext-friends-tabs">
                            <button
                                type="button"
                                className={'ext-friends-tab' + (friendsTab === 'friends' ? ' ext-friends-tab-active' : '')}
                                onClick={() => setFriendsTab('friends')}
                            >好友 ({(window.__extFriends ? window.__extFriends.friendSet : new Set()).length})</button>
                            <button
                                type="button"
                                className={'ext-friends-tab' + (friendsTab === 'following' ? ' ext-friends-tab-active' : '')}
                                onClick={() => setFriendsTab('following')}
                            >我关注的 ({(window.__extFriends ? window.__extFriends.following : []).length})</button>
                            <button
                                type="button"
                                className={'ext-friends-tab' + (friendsTab === 'followers' ? ' ext-friends-tab-active' : '')}
                                onClick={() => setFriendsTab('followers')}
                            >关注我的 ({(window.__extFriends ? window.__extFriends.followers : []).length})</button>
                        </div>

                        {/* 列表 */}
                        <div className="ext-friends-list">
                            {(window.__extFriends ? window.__extFriends.listItems : []).length === 0 ? (
                                <div className="ext-friends-empty">{window.__extFriends ? window.__extFriends.emptyText : ''}</div>
                            ) : (
                                (window.__extFriends ? window.__extFriends.listItems : []).map((it) => (
                                    <div key={it.u} className="ext-friends-item">
                                        <span className="ext-friends-name">{it.u}</span>
                                        <span className="ext-friends-actions">
                                            {it.followBack && (
                                                <button
                                                    type="button"
                                                    className="ext-friends-btn"
                                                    disabled={friendsBusy}
                                                    onClick={() => handleFriendAction(it.u, 'follow')}
                                                >回关</button>
                                            )}
                                            <button
                                                type="button"
                                                className="ext-friends-btn ext-friends-btn-warn"
                                                disabled={friendsBusy}
                                                onClick={() => handleFriendAction(it.u, it.action)}
                                            >{it.label}</button>
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>

                        {friendsMsg && <div className="ext-friends-msg">{friendsMsg}</div>}
                    </div>
                        )}
                        {userPanelType === 'profile' && (
                    <div className="ext-profile-body">
                            <div className="ext-profile-head">
                                <div className="ext-profile-avatar">
                                    {(session.username || '?').charAt(0).toUpperCase()}
                                </div>
                                <div className="ext-profile-info">
                                    <div className="ext-profile-name">{session.username}</div>
                                    <div className="ext-profile-email">
                                        {profileMeta && profileMeta.email ? profileMeta.email : ''}
                                    </div>
                                </div>
                            </div>
                            <div className="ext-profile-stats">
                                <div className="ext-profile-stat">
                                    <span className="ext-profile-stat-num">
                                        {Array.isArray(savesList) ? savesList.length : 0}
                                    </span>
                                    <span className="ext-profile-stat-label">存档</span>
                                </div>
                                <div className="ext-profile-stat">
                                    <span className="ext-profile-stat-num">
                                        {customBlocks.length}
                                    </span>
                                    <span className="ext-profile-stat-label">积木</span>
                                </div>
                                <div className="ext-profile-stat">
                                    <span className="ext-profile-stat-num">1</span>
                                    <span className="ext-profile-stat-label">扩展</span>
                                </div>
                                <div className="ext-profile-stat">
                                    <span className="ext-profile-stat-num">{profileCounts.following}</span>
                                    <span className="ext-profile-stat-label">关注</span>
                                </div>
                                <div className="ext-profile-stat">
                                    <span className="ext-profile-stat-num">{profileCounts.followers}</span>
                                    <span className="ext-profile-stat-label">粉丝</span>
                                </div>
                            </div>
                            <div className="ext-profile-joined">
                                注册时间：
                                {profileMeta && profileMeta.createdAt
                                    ? new Date(profileMeta.createdAt).toLocaleString()
                                    : '未知'}
                            </div>
                            <div className="ext-profile-saves-title">我的存档</div>
                            <div className="ext-profile-saves">
                                {Array.isArray(savesList) && savesList.length > 0 ? (
                                    savesList.map(save => (
                                        <div key={save.id} className="ext-profile-save-item">
                                            <div className="ext-profile-save-info">
                                                <div className="ext-profile-save-name">{save.name || '未命名存档'}</div>
                                                <div className="ext-profile-save-time">
                                                    {new Date(save.updatedAt || Date.now()).toLocaleString()}
                                                </div>
                                            </div>
                                            <div className="ext-profile-save-actions">
                                                <button
                                                    type="button"
                                                    className="ext-profile-save-btn"
                                                    onClick={() => handleLoadSave(save)}
                                                    title="加载此存档"
                                                >加载</button>
                                                <button
                                                    type="button"
                                                    className="ext-profile-save-btn ext-profile-save-btn-del"
                                                    onClick={() => handleDeleteSave(save.id)}
                                                    title="删除此存档"
                                                >删除</button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="ext-profile-saves-empty">还没有存档，点击顶部 💾 存档 按钮保存项目</div>
                                )}
                            </div>
                        </div>
                        )}
                        {userPanelType === 'saves' && (
                        <div className="ext-saves-body">
                            <div className="ext-saves-new">
                                <input
                                    className="ext-auth-input ext-saves-name-input"
                                    value={saveNameInput}
                                    onChange={(e) => setSaveNameInput(e.target.value)}
                                    placeholder="存档名称（留空自动命名）"
                                />
                                <button className="ext-auth-btn ext-saves-save-btn" onClick={handleSaveProject}>
                                    保存当前项目
                                </button>
                            </div>
                            {saveMsg && <div className="ext-saves-msg">{saveMsg}</div>}
                            <div className="ext-saves-list-title">我的存档（{savesList.length}）</div>
                            {savesList.length === 0 && (
                                <div className="ext-saves-empty">还没有存档，点击上方按钮保存当前项目。</div>
                            )}
                            <div className="ext-saves-list">
                                {savesList.map(save => (
                                    <div className="ext-saves-item" key={save.id}>
                                        <div className="ext-saves-item-info">
                                            <div className="ext-saves-item-name" title={save.name}>{save.name}</div>
                                            <div className="ext-saves-item-time">
                                                {new Date(save.updatedAt).toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="ext-saves-item-actions">
                                            <button
                                                className="ext-saves-act"
                                                title="加载此存档"
                                                onClick={() => handleLoadSave(save)}
                                            >加载</button>
                                            <button
                                                className="ext-saves-act"
                                                title="用当前项目覆盖此存档"
                                                onClick={() => handleOverwriteSave(save.id)}
                                            >覆盖</button>
                                            <button
                                                className="ext-saves-act"
                                                title="导出为 JSON 文件"
                                                onClick={() => exportSaveFile(save)}
                                            >导出</button>
                                            <button
                                                className="ext-saves-act ext-saves-act-del"
                                                title="删除此存档"
                                                onClick={() => handleDeleteSave(save.id)}
                                            >删除</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="ext-sync-section">
                                <div className="ext-sync-title">🔗 跨站互通（同步链接）</div>
                                <p className="ext-sync-hint">
                                    在两个部署（例如平台应用与自定义域名）之间互通登录与存档：
                                    在本站生成同步链接，在另一个网站打开该链接即可导入账号与存档，
                                    两边数据保持一致，可双向重复同步。
                                </p>
                                <button className="ext-auth-btn" onClick={handleGenSync}>生成同步链接</button>
                                {syncLinkText && (
                                    <div className="ext-sync-link-box">
                                        <textarea
                                            className="ext-sync-link"
                                            readOnly
                                            value={syncLinkText}
                                            onFocus={(e) => e.target.select()}
                                            rows={3}
                                        />
                                        <button
                                            className="ext-saves-act"
                                            onClick={() => {
                                                if (navigator.clipboard && navigator.clipboard.writeText) {
                                                    navigator.clipboard.writeText(syncLinkText)
                                                        .then(() => alert('已复制同步链接'))
                                                        .catch(() => alert('复制失败，请手动选择复制'));
                                                } else {
                                                    alert('复制失败，请手动选择复制');
                                                }
                                            }}
                                        >复制</button>
                                    </div>
                                )}
                                <div className="ext-sync-import">
                                    <input
                                        className="ext-auth-input"
                                        value={syncInput}
                                        onChange={(e) => setSyncInput(e.target.value)}
                                        placeholder="粘贴对方网站的同步链接（或 #sync= 部分）"
                                    />
                                    <button className="ext-auth-btn" onClick={handleImportSync}>导入对方同步</button>
                                </div>
                                <div className="ext-sync-file">
                                    <button className="ext-saves-act" onClick={handleImportSaveFile}>
                                        导入存档文件(.json)
                                    </button>
                                </div>
                            </div>
                        </div>
                        )}
                    </div>
                </div>
                </React.Fragment>
            )}

            {/* 项目数据分析面板（悬浮框，可拖拽/拉伸） */}
            {showStatsPanel && (
                <React.Fragment>
                {/* 自由拉伸层（8 方向手柄，常驻显示） */}
                <div className="ext-float-resize-layer" ref={statsResizeLayerRef}>
                    {['n','s','e','w','ne','nw','se','sw'].map(dir => (
                        <div key={dir} className={`ext-float-resize-handle ext-fz-${dir}`} onMouseDown={handleStatsResizeDown(dir)} />
                    ))}
                </div>
                <div
                    ref={statsPanelRef}
                    className="ext-float-panel ext-stats-panel"
                    style={{left: statsFloatBounds.x, top: statsFloatBounds.y, width: statsFloatBounds.w, height: statsFloatBounds.h}}
                >
                    <div className="ext-float-header" onMouseDown={handleStatsHeaderMouseDown}>
                        <span className="ext-float-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2" style={{verticalAlign:'middle',marginRight:'6px'}}>
                                <path d="M21.21 15.89A10 10 0 118 2.83"/>
                                <path d="M22 12A10 10 0 0012 2v10z"/>
                            </svg>
                            项目数据分析
                        </span>
                        <div className="ext-float-btns">
                            <button className="ext-float-btn ext-float-btn-close" onClick={() => setShowStatsPanel(false)} title="关闭">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                    </div>
                    <div className="ext-stats-body">
                        {/* 复杂度评分 */}
                        <div style={{background:'#e8f0fe',border:'1px solid #c5d8f7',borderRadius:8,padding:'12px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:14}}>
                            <div style={{fontSize:32,fontWeight:800,color:'#1a73e8',lineHeight:1}}>{projectStats.complexityScore}<span style={{fontSize:14,fontWeight:400,color:'#888',marginLeft:2}}>/100</span></div>
                            <div style={{flex:1}}>
                                <div style={{fontSize:14,fontWeight:600,color:'#333',marginBottom:2}}>复杂度：{projectStats.complexityLevel}</div>
                                <div style={{fontSize:12,color:'#666'}}>{projectStats.blockCount} 个积木，{projectStats.lineCount} 行代码</div>
                            </div>
                        </div>

                        {/* 概览 */}
                        <div className="rtc-section-title">概览</div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:14}}>
                            {[
                                [projectStats.blockCount,'积木总数','#4C97FF'],
                                [projectStats.hatCount,'帽积木','#FF6680'],
                                [projectStats.cmdCount,'命令积木','#4C97FF'],
                                [projectStats.reporterCount,'报告积木','#9966FF'],
                                [projectStats.boolCount,'布尔积木','#FF8C1A']
                            ].filter(v=>v[0]>0).map(([val,label,color])=>(
                                <div key={label} style={{background:'#f8f9fa',border:'1px solid #e9ecef',borderRadius:8,padding:'10px 12px'}}>
                                    <div style={{fontSize:20,fontWeight:700,color:'#333'}}>{val}</div>
                                    <div style={{fontSize:11,color:'#777',marginTop:2}}>{label}</div>
                                </div>
                            ))}
                        </div>

                        {/* 项目数据 */}
                        <div className="rtc-section-title">项目数据</div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                            <div style={{background:'#f8f9fa',border:'1px solid #e9ecef',borderRadius:8,padding:'10px 12px'}}>
                                <div style={{fontSize:20,fontWeight:700,color:'#333'}}>{projectStats.lineCount}</div>
                                <div style={{fontSize:11,color:'#777',marginTop:2}}>代码行数</div>
                            </div>
                            <div style={{background:'#f8f9fa',border:'1px solid #e9ecef',borderRadius:8,padding:'10px 12px'}}>
                                <div style={{fontSize:20,fontWeight:700,color:'#333'}}>{formatBytes(projectStats.codeSize)}</div>
                                <div style={{fontSize:11,color:'#777',marginTop:2}}>核心代码</div>
                            </div>
                            <div style={{background:'#f8f9fa',border:'1px solid #e9ecef',borderRadius:8,padding:'10px 12px'}}>
                                <div style={{fontSize:20,fontWeight:700,color:'#333'}}>{formatBytes(projectStats.fullSize)}</div>
                                <div style={{fontSize:11,color:'#777',marginTop:2}}>导出大小</div>
                            </div>
                        </div>

                        {/* 建议 */}
                        <div className="rtc-section-title" style={{marginTop:10}}>建议</div>
                        <div style={{background:'#fffbe6',border:'1px solid #f5e6a3',borderRadius:6,padding:'10px 14px',fontSize:12,color:'#856404'}}>
                            {projectStats.blockCount === 0 ? '还没有添加积木。点击左侧「制作积木」开始创建。'
                             : projectStats.complexityScore < 15 ? '项目复杂度较低，继续添加更多积木和代码来丰富功能。'
                             : projectStats.complexityScore > 78 ? '项目较复杂，建议拆分为多个扩展以保持可维护性。'
                             : '项目结构良好，复杂度在合理范围内。'}
                        </div>
                    </div>
                </div>
                </React.Fragment>
            )}

            </div>
        );
    }
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
function wrapAsExtension(extInfo, generatedCode, customBlocks) {
    const esc = (s) => String(s || '').replace(/'/g, "\\'");
    const headerLines = [
        ' * ' + extInfo.name,
        ' * Extension ID: ' + extInfo.id,
        extInfo.description ? ' * Description: ' + extInfo.description : null,
        extInfo.author ? ' * Author: ' + extInfo.author : null,
        extInfo.docsUrl ? ' * Docs: ' + extInfo.docsUrl : null,
        ' * License: ' + (extInfo.license || 'MPL-2.0'),
        ' * Blocks: ' + (Array.isArray(customBlocks) ? customBlocks.length : 0),
        ' * Generated by TurboWarp Extension Editor'
    ].filter(Boolean).join('\n');

    // Build block entries from customBlocks metadata.
    // Each block's `text` is reconstructed from its parts (text + input fragments).
    const blocks = (Array.isArray(customBlocks) ? customBlocks : []).map((b) => {
        const parts = Array.isArray(b.parts) ? b.parts : [];
        // TurboWarp text 语法：命名参数用 [NAME]（%s/%n 是 Blockly 语法，
        // TurboWarp 不解析，会原样显示成 "%s"）。arguments 必须与 [NAME]
        // 一一对应，否则 TurboWarp 静默丢弃该参数。
        const text = parts
            .map(p => p.kind === 'text' ? p.value : `[${p.name}]`)
            .join('');
        const filter = [];
        if (b.filterSprite) filter.push('TARGET_SPRITE');
        if (b.filterStage) filter.push('TARGET_STAGE');
        // 从 parts 构建 arguments（TurboWarp 的 ArgumentType 字符串形式）
        const argumentsDef = {};
        parts.forEach(p => {
            if (!p || p.kind !== 'input' || !p.name) return;
            argumentsDef[p.name] = {
                type: p.inputType === 'Number' ? 'number' : 'string',
                defaultValue: p.inputType === 'Number' ? 0 : ''
            };
        });
        const entry = {
            // CRITICAL: this opcode must EXACTLY match the method name the
            // generator emits. The generator uses `_opcode` which is
            // `(blockId || 'block').replace(/[^a-zA-Z0-9]/g, '_')` — so the
            // registered opcode must be the same transform of b.id. If they
            // differ (e.g. appending the block name), TurboWarp renders the
            // block but calling it fails silently ("no reaction").
            opcode: (b.id || 'block').replace(/[^a-zA-Z0-9]/g, '_'),
            // CRITICAL: TurboWarp parses text with `[NAME]` as a reference
            // to arguments.NAME. If no matching argument exists the bracket
            // is silently dropped, leaving a blank block (visible as a red
            // rectangle with no text). Wrap names in `[]` ONLY when an
            // argument is actually defined.
            text: text || (b.name || 'block'),
            blockType: b.blockType || 'command',
            arguments: argumentsDef
        };
        // 积木自定义颜色：同时输出 colour 与 color1/color2/color3。
        // TurboWarp 的 scratch-vm 在 _convertBlockForScratchBlocks 中读取
        // blockInfo.color1（块级覆盖），不读 colour；官方文档推荐 colour。
        // 三份都输出，任何解析方式都能生效。color2/color3 由 color1 变暗派生。
        if (b.colour) {
            entry.colour = b.colour;
            entry.color1 = b.colour;
            entry.color2 = darkenHex(b.colour, 0.85);
            entry.color3 = darkenHex(b.colour, 0.7);
        }
        if (b.isTerminal) entry.isTerminal = true;
        // isAsync：用户勾选，或生成的实现方法体含 await（block_define 会为
        // 含 await 的方法自动加 async 前缀并输出 "// isAsync: true" 注释）。
        // TurboWarp 对 isAsync 块会 await 方法返回值；漏标则异步块静默失效。
        const opcode = (b.id || 'block').replace(/[^a-zA-Z0-9]/g, '_');
        if (b.isAsync || new RegExp('async\\s+' + opcode + '\\s*\\(args').test(generatedCode)) {
            entry.isAsync = true;
        }
        if (b.attachAllThreads) entry.shouldRestartExistingThreads = true;
        if (filter.length) entry.filterTargets = filter;
        if (b.icon) entry.hideFromPalette = false;
        return entry;
    });

    const blocksJson = JSON.stringify(blocks, null, 4)
        .split('\n')
        .map(l => '                ' + l)
        .join('\n');

    const metaFields = [
        "                id: '" + esc(extInfo.id) + "',",
        "                name: '" + esc(extInfo.name) + "',",
        "                color1: '" + extInfo.color1 + "',",
        "                color2: '" + extInfo.color2 + "',",
        "                color3: '" + extInfo.color3 + "',",
        extInfo.description ? "                description: '" + esc(extInfo.description) + "'," : null,
        extInfo.author ? "                author: '" + esc(extInfo.author) + "'," : null,
        extInfo.docsUrl ? "                docsURL: '" + esc(extInfo.docsUrl) + "'," : null,
        extInfo.license ? "                license: '" + esc(extInfo.license) + "'," : null,
        '                blocks: ' + blocksJson
    ].filter(Boolean).join('\n');

    const className = extInfo.id
        .split(/[^a-zA-Z0-9]/)
        .filter(Boolean)
        .map(capitalize)
        .join('') || 'MyExtension';

    return `/**\n${headerLines}\n */\n\n` +
`(function(Scratch) {\n` +
`    'use strict';\n\n` +
EXT_FORGE_RUNTIME.split('\n').map(l => '    ' + l).join('\n') + '\n\n' +
`    class ${className} {\n` +
`        getInfo() {\n` +
`            return {\n` +
`${metaFields}\n` +
`            };\n` +
`        }\n\n` +
`${withUtilInjection(generatedCode).split('\n').map(l => '        ' + l).join('\n')}\n` +
`    }\n\n` +
`    Scratch.extensions.register(new ${className}());\n` +
`})(Scratch);\n`;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// 从 hex 颜色按比例变暗，派生 color2/color3（'#RRGGBB' -> '#RRGGBB'）
function darkenHex(hex, factor) {
    const h = String(hex || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(h)) return hex;
    const n = (v) => {
        const x = Math.max(0, Math.min(255, Math.round(v * factor)));
        return x.toString(16).padStart(2, '0');
    };
    return '#' + n(parseInt(h.slice(1, 3), 16)) + n(parseInt(h.slice(3, 5), 16)) + n(parseInt(h.slice(5, 7), 16));
}

/**
 * Render one customBlock as a real Scratch block inside `ws` (a hidden
 * workspace) and return the wrapped SVG string. Module-level so both the
 * modal preview and the builder-panel preview can reuse it.
 */
function renderCustomBlockToSvg(ws, cb, idx) {
    if (!ws || !cb) return '';
    const B = window._extBuilderBlockly || window.Blockly;
    if (!B || !B.Blocks) return '';
    const name = cb.name || ('我的积木 ' + ((idx || 0) + 1));
    const fields = Array.isArray(cb.fields) ? cb.fields : [];

    // Build message template + args from the fields
    let message0 = '%1';
    const args0 = [{type: 'field_label', text: name, name: 'NAME'}];
    fields.forEach(function (f, fi) {
        if (!f) return;
        const ftype = f.kind || 'text';
        const textIdx = (fi * 2) + 2;
        const inputIdx = (fi * 2) + 3;
        if (ftype === 'label') {
            args0.push({type: 'field_label', text: f.text || '', name: 'TXT' + fi});
            message0 += ' %' + textIdx;
        } else {
            args0.push({type: 'field_label', text: f.text || '', name: 'TXT' + fi});
            if (ftype === 'number') {
                args0.push({type: 'field_number', value: Number(f.default) || 0, name: 'FLD' + fi, precision: 1});
            } else if (ftype === 'boolean') {
                args0.push({type: 'field_dropdown', options: [['是','true'],['否','false']], name: 'FLD' + fi});
            } else {
                args0.push({type: 'field_input', text: f.default || f.text || '', name: 'FLD' + fi});
            }
            message0 += ' %' + textIdx + ' %' + inputIdx;
        }
    });

    // Choose the scratch block shape + colour by blockType
    let shapeDef = {colour: 344, id: 'C'};
    if (cb.blockType === 'reporter') shapeDef = {colour: 270, output: 'Number'};
    else if (cb.blockType === 'Boolean') shapeDef = {colour: 270, output: 'Boolean'};
    else if (cb.blockType === 'hat') shapeDef = {colour: 45, id: 'HAT'};
    // 用户自定义积木颜色覆盖默认色（与 block_define 工作区 / 导出代码一致）
    if (cb.colour) shapeDef.colour = cb.colour;

    const previewType = (cb.id || ('b' + idx)) + '__preview';
    // Force re-registration so shape / fields changes are reflected live.
    if (B.Blocks[previewType]) B.Blocks[previewType] = null;
    B.Blocks[previewType] = {
        init: function () {
            const opts = JSON.parse(JSON.stringify({
                message0: message0,
                args0: args0
            }));
            opts.colour = shapeDef.colour;
            if (shapeDef.output !== undefined) opts.output = shapeDef.output;
            opts['id'] = shapeDef.id || 'C';
            if (shapeDef.id === 'HAT') {
                delete opts.previousStatement;
                // shape_hat extension will create the nextConnection via
                // setNextStatement(true). Don't pre-set it to null or
                // setNextStatement(false) — that would remove the
                // connection and break the top-hat shape.
                opts.extensions = ['shape_hat'];
            } else if (shapeDef.output !== undefined) {
                delete opts.previousStatement;
                delete opts.nextStatement;
            } else {
                opts.previousStatement = null;
                opts.nextStatement = null;
            }
            this.jsonInit(opts);
            if (shapeDef.id === 'HAT' && this.setInputsInline) {
                this.setInputsInline(true);
            }
            if (this.outputConnection) {
                let s = null;
                if (shapeDef.output === 'Boolean') s = 1;
                else if (shapeDef.output === 'Number' || shapeDef.output === 'String') s = 2;
                if (s !== null && this.setOutputShape) this.setOutputShape(s);
            }
        }
    };

    try {
        const b = ws.newBlock(previewType);
        b.initSvg();
        b.moveBy(8, 8);
        b.render();
        const draggable = b.getSvgRoot().querySelector('.blocklyDraggable') || b.getSvgRoot();
        let innerXml = draggable.outerHTML;
        innerXml = innerXml.replace(/ transform="translate\([^)]*\)"/, '');
        let w = 100, h = 40;
        try {
            const bbox = draggable.getBBox();
            w = bbox.width;
            h = bbox.height;
        } catch (e) { /* bbox may fail on hidden svg */ }
        // For hat blocks, the top-hat curve extends into negative y (the
        // START_HAT_PATH control points are y=-22) but getBBox ignores it,
        // so the visible SVG box clips the curve. Wrap the inner SVG with
        // a viewBox that includes the negative-y range and shift the
        // group down by the hat height so the curve becomes visible.
        let hatPad = 0;
        if (shapeDef.id === 'HAT') {
            hatPad = 22;
            innerXml = innerXml.replace(
                /<g class="blocklyDraggable"([^>]*)>/,
                '<g class="blocklyDraggable"$1 transform="translate(0,' + hatPad + ')">'
            );
            // bump the path inside so its origin moves down too
            innerXml = innerXml.replace(
                /<path class="blocklyPath"/,
                '<path transform="translate(0,' + hatPad + ')" class="blocklyPath"'
            );
            // Adjust the left/top notch indicators if present
            innerXml = innerXml.replace(
                /<g class="blocklyResizeSE"/,
                '<g transform="translate(0,' + hatPad + ')" class="blocklyResizeSE"'
            );
        }
        const wrapped =
            '<svg width="' + Math.ceil(w) + '" height="' + Math.ceil(h + hatPad) +
            '" xmlns="http://www.w3.org/2000/svg" class="blockly-svg">' +
            innerXml + '</svg>';
        b.dispose(false);
        return wrapped;
    } catch (e) {
        return '';
    }
}

export default ExtensionBuilder;