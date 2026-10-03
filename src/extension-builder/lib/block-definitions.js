/**
 * Block Definitions for Scratch Extension API
 * Defines the visual blocks (toolbox) and code generators for the
 * Blockly-based Scratch extension builder.
 */

// ============================================================
// Toolbox Configuration
// ============================================================

export const TOOLBOX_CONFIG = {
    kind: 'categoryToolbox',
    contents: [
        {kind: 'category', name: '事件', colour: '#FFBF00',
            contents: [
                {kind: 'block', type: 'event_whenLoaded'},
                {kind: 'block', type: 'event_whenReceived'},
                {kind: 'block', type: 'event_whenKeyPressed'},
                {kind: 'block', type: 'event_whenTimerGreaterThan'},
                {kind: 'block', type: 'event_whenLoudnessGreaterThan'},
                {kind: 'block', type: 'event_whenCloned'},
                {kind: 'block', type: 'event_whenBackdropChangesTo'},
                {kind: 'block', type: 'event_broadcast'},
                {kind: 'block', type: 'event_broadcastAndWait'},
                {kind: 'block', type: 'event_newThread'}
            ]},
        {kind: 'category', name: '控制', colour: '#FFAB19',
            contents: [
                {kind: 'block', type: 'control_if'},
                {kind: 'block', type: 'control_ifElse'},
                {kind: 'block', type: 'control_wait'},
                {kind: 'block', type: 'control_repeat'},
                {kind: 'block', type: 'control_while'},
                {kind: 'block', type: 'control_return'},
                {kind: 'block', type: 'control_inlineReturn'}
            ]},
        {kind: 'category', name: '运算', colour: '#59C059',
            contents: [
                {kind: 'block', type: 'math_arithmetic'},
                {kind: 'block', type: 'math_single'},
                {kind: 'block', type: 'math_round'},
                {kind: 'block', type: 'math_random'},
                {kind: 'block', type: 'math_trig'},
                {kind: 'block', type: 'math_constant'},
                {kind: 'block', type: 'math_compare'},
                {kind: 'block', type: 'logic_operation'},
                {kind: 'block', type: 'logic_negate'},
                {kind: 'block', type: 'logic_boolean'}
            ]},
        {kind: 'category', name: '字符串', colour: '#5BA58C',
            contents: [
                {kind: 'block', type: 'string_concat'},
                {kind: 'block', type: 'string_slice'},
                {kind: 'block', type: 'string_indexOf'},
                {kind: 'block', type: 'string_length'},
                {kind: 'block', type: 'string_contains'},
                {kind: 'block', type: 'string_replace'},
                {kind: 'block', type: 'string_trim'},
                {kind: 'block', type: 'string_toUpperCase'},
                {kind: 'block', type: 'string_toLowerCase'},
                {kind: 'block', type: 'string_regex'}
            ]},
        {kind: 'category', name: '向量', colour: '#4C97FF',
            contents: [
                {kind: 'block', type: 'vector_create'},
                {kind: 'block', type: 'vector_x'},
                {kind: 'block', type: 'vector_y'},
                {kind: 'block', type: 'vector_add'},
                {kind: 'block', type: 'vector_sub'},
                {kind: 'block', type: 'vector_distance'}
            ]},
        {kind: 'category', name: '输入', colour: '#5CB1D6',
            contents: [
                {kind: 'block', type: 'input_keyDown'},
                {kind: 'block', type: 'input_mouseDown'},
                {kind: 'block', type: 'input_mouseX'},
                {kind: 'block', type: 'input_mouseY'}
            ]},
        {kind: 'category', name: '变量', colour: '#FF8C1A',
            contents: [
                {kind: 'block', type: 'var_register'},
                {kind: 'block', type: 'var_get'},
                {kind: 'block', type: 'var_set'},
                {kind: 'block', type: 'var_change'}
            ]},
        {kind: 'category', name: '列表', colour: '#FF6680',
            contents: [
                {kind: 'block', type: 'list_create'},
                {kind: 'block', type: 'list_getItem'},
                {kind: 'block', type: 'list_indexOf'},
                {kind: 'block', type: 'list_contains'},
                {kind: 'block', type: 'list_addItem'},
                {kind: 'block', type: 'list_removeItem'},
                {kind: 'block', type: 'list_replaceItem'},
                {kind: 'block', type: 'list_length'},
                {kind: 'block', type: 'list_foreach'}
            ]},
        {kind: 'category', name: '函数', colour: '#CF63CF',
            contents: [
                {kind: 'block', type: 'func_declare'},
                {kind: 'block', type: 'func_call'},
                {kind: 'block', type: 'func_return'},
                {kind: 'block', type: 'func_param'}
            ]},
        {kind: 'category', name: '积木', colour: '#9966FF',
            contents: [
                // block_define（定义xxx 实现）已从工具箱移除：定义块只能通过
                // "制作积木"界面创建（addStarterBlocks 自动生成），防止用户
                // 手动拖出与积木列表不同步的定义块。
                {kind: 'block', type: 'block_field_string'},
                {kind: 'block', type: 'block_field_number'},
                {kind: 'block', type: 'block_field_label'}
            ]},
        {kind: 'category', name: '运行时', colour: '#FF6680',
            contents: [
                {kind: 'block', type: 'runtime_start'},
                {kind: 'block', type: 'runtime_stop'},
                {kind: 'block', type: 'runtime_frameRate'},
                {kind: 'block', type: 'runtime_timer'},
                {kind: 'block', type: 'runtime_broadcast'}
            ]},
        {kind: 'category', name: '目标', colour: '#4C97FF',
            contents: [
                {kind: 'block', type: 'target_clone'},
                {kind: 'block', type: 'target_deleteClone'},
                {kind: 'block', type: 'target_getSprite'}
            ]},
        {kind: 'category', name: '运动', colour: '#4C97FF',
            contents: [
                {kind: 'block', type: 'motion_moveSteps'},
                {kind: 'block', type: 'motion_turnRight'},
                {kind: 'block', type: 'motion_turnLeft'},
                {kind: 'block', type: 'motion_pointInDirection'},
                {kind: 'block', type: 'motion_glideTo'},
                {kind: 'block', type: 'motion_xPosition'},
                {kind: 'block', type: 'motion_yPosition'},
                {kind: 'block', type: 'motion_direction'}
            ]},
        {kind: 'category', name: '外观', colour: '#9966FF',
            contents: [
                {kind: 'block', type: 'looks_say'},
                {kind: 'block', type: 'looks_think'},
                {kind: 'block', type: 'looks_show'},
                {kind: 'block', type: 'looks_hide'},
                {kind: 'block', type: 'looks_changeSize'},
                {kind: 'block', type: 'looks_size'}
            ]},
        {kind: 'category', name: '网络', colour: '#2D8F8F',
            contents: [
                {kind: 'block', type: 'net_httpGet'},
                {kind: 'block', type: 'net_httpPost'},
                {kind: 'block', type: 'net_jsonParse'}
            ]},
        {kind: 'category', name: '时间', colour: '#FF8C1A',
            contents: [
                {kind: 'block', type: 'time_now'},
                {kind: 'block', type: 'time_dateString'},
                {kind: 'block', type: 'time_waitMs'}
            ]},
        {kind: 'category', name: '浏览器', colour: '#2D8F8F',
            contents: [
                {kind: 'block', type: 'browser_alert'},
                {kind: 'block', type: 'browser_console'},
                {kind: 'block', type: 'browser_localStorageGet'},
                {kind: 'block', type: 'browser_localStorageSet'},
                {kind: 'block', type: 'browser_openUrl'}
            ]},
        {kind: 'category', name: '音乐', colour: '#D050B0',
            contents: [
                {kind: 'block', type: 'music_playTone'},
                {kind: 'block', type: 'music_playNote'},
                {kind: 'block', type: 'music_rest'},
                {kind: 'block', type: 'music_setVolume'},
                {kind: 'block', type: 'music_setTempo'}
            ]},
        {kind: 'category', name: '脚本', colour: '#5A5A8F',
            contents: [
                {kind: 'block', type: 'script_eval'}
            ]},
        {kind: 'category', name: '额外', colour: '#8B8B8B',
            contents: [
                {kind: 'block', type: 'extra_comment'},
                {kind: 'block', type: 'extra_rawCode'}
            ]}
    ]
};

// ============================================================
// Block Definitions (visual shapes)
// ============================================================

export const BLOCK_DEFINITIONS = {
    // ---- 我的积木 (default hat block — the entry point of any extension) ----
    user_my_extension_block: {
        args0: [],
        message0: '我的积木',
        previousStatement: null,
        nextStatement: null,
        colour: '#FF6680',
        tooltip: '扩展入口 — 默认创建一个我的积木，所有编辑从这里开始',
        id: 'HAT',
    },

    // ---- 事件 Events ----
    event_whenLoaded: {
        args0: [],
        message0: '当扩展加载时',
        previousStatement: null,
        nextStatement: null,
        colour: '#FFBF00',
        tooltip: '当扩展被加载时触发',
        id: 'HAT',
    },
    event_whenReceived: {
        type: 'event_whenReceived',
        message0: '当接收到 %1',
        args0: [{type: 'field_input', name: 'EVENT', text: '事件名'}],
        previousStatement: null,
        nextStatement: null,
        colour: '#FFBF00',
        tooltip: '当接收到指定广播时触发',
        id: 'HAT',
    },
    event_broadcast: {
        type: 'event_broadcast',
        message0: '广播 %1',
        args0: [{type: 'field_input', name: 'EVENT', text: '事件名'}],
        colour: '#FFBF00',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    event_broadcastAndWait: {
        type: 'event_broadcastAndWait',
        message0: '广播 %1 并等待',
        args0: [{type: 'field_input', name: 'EVENT', text: '事件名'}],
        colour: '#FFBF00',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    event_newThread: {
        args0: [{type: 'field_input', name: 'CODE', text: ''}],
        message0: '在新线程中执行 %1',
        previousStatement: null,
        nextStatement: null,
        colour: '#FFBF00',
        id: 'HAT',
    },
    // ----- Extension lifecycle hat blocks -----
    event_whenKeyPressed: {
        type: 'event_whenKeyPressed',
        message0: '当 %1 键被按下',
        args0: [{
            type: 'field_dropdown',
            name: 'KEY',
            options: [
                ['空格', 'space'], ['任意', 'any'], ['向上', 'up'],
                ['向下', 'down'], ['向左', 'left'], ['向右', 'right'],
                ['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd'], ['E', 'e'],
                ['F', 'f'], ['G', 'g'], ['H', 'h'], ['I', 'i'], ['J', 'j'],
                ['K', 'k'], ['L', 'l'], ['M', 'm'], ['N', 'n'], ['O', 'o'],
                ['P', 'p'], ['Q', 'q'], ['R', 'r'], ['S', 's'], ['T', 't'],
                ['U', 'u'], ['V', 'v'], ['W', 'w'], ['X', 'x'], ['Y', 'y'], ['Z', 'z'],
                ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'],
                ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9']
            ]
        }],
        previousStatement: null,
        nextStatement: null,
        colour: '#FFBF00',
        tooltip: '当用户按下指定键时触发',
        id: 'HAT',
    },
    event_whenTimerGreaterThan: {
        type: 'event_whenTimerGreaterThan',
        message0: '当计时器 > %1',
        args0: [{type: 'input_value', name: 'VALUE', check: 'Number'}],
        previousStatement: null,
        nextStatement: null,
        colour: '#FFBF00',
        tooltip: '当指定计时器值大于设定值时持续触发',
        id: 'HAT',
    },
    event_whenLoudnessGreaterThan: {
        type: 'event_whenLoudnessGreaterThan',
        message0: '当响度 > %1',
        args0: [{type: 'input_value', name: 'VALUE', check: 'Number'}],
        previousStatement: null,
        nextStatement: null,
        colour: '#FFBF00',
        tooltip: '当麦克风响度大于设定值时持续触发',
        id: 'HAT',
    },
    event_whenCloned: {
        type: 'event_whenCloned',
        message0: '当作为克隆体启动时',
        args0: [],
        previousStatement: null,
        nextStatement: null,
        colour: '#FFBF00',
        tooltip: '当此角色作为克隆体被创建时触发',
        id: 'HAT',
    },
    event_whenBackdropChangesTo: {
        type: 'event_whenBackdropChangesTo',
        message0: '当背景切换为 %1',
        args0: [{type: 'field_input', name: 'BACKDROP', text: 'backdrop1'}],
        previousStatement: null,
        nextStatement: null,
        colour: '#FFBF00',
        tooltip: '当舞台背景切换为指定背景时触发',
        id: 'HAT',
    },

    // ---- 控制 Control ----
    control_if: {
        type: 'control_if',
        message0: '如果 %1',
        args0: [{type: 'input_value', name: 'COND'}],
        message1: '%1',
        args1: [{type: 'input_statement', name: 'DO'}],
        previousStatement: null,
        nextStatement: null,
        colour: '#FFAB19',
        id: 'C',
    },
    control_ifElse: {
        type: 'control_ifElse',
        message0: '如果 %1',
        args0: [{type: 'input_value', name: 'COND'}],
        message1: '%1',
        args1: [{type: 'input_statement', name: 'DO'}],
        message2: '否则 %1',
        args2: [{type: 'input_statement', name: 'ELSE'}],
        previousStatement: null,
        nextStatement: null,
        colour: '#FFAB19',
        id: 'C',
    },
    control_wait: {
        type: 'control_wait',
        message0: '等待 %1    秒',
        args0: [
            {type: 'input_value', name: 'TIME', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        message1: '%1',
        args1: [{type: 'input_statement', name: 'DO'}],
        previousStatement: null,
        nextStatement: null,
        colour: '#FFAB19',
        id: 'C',
    },
    control_while: {
        type: 'control_while',
        message0: '当 %1 时循环',
        args0: [{type: 'input_value', name: 'COND'}],
        message1: '%1',
        args1: [{type: 'input_statement', name: 'DO'}],
        previousStatement: null,
        nextStatement: null,
        colour: '#FFAB19',
        id: 'C',
    },
    control_repeat: {
        type: 'control_repeat',
        message0: '重复 %1 次',
        args0: [{type: 'input_value', name: 'TIMES'}],
        message1: '%1',
        args1: [{type: 'input_statement', name: 'SUBSTACK'}],
        previousStatement: null,
        nextStatement: null,
        colour: '#FFAB19',
        id: 'C',
    },
    control_return: {
        type: 'control_return',
        message0: '返回 %1',
        args0: [{type: 'input_value', name: 'VALUE'}],
        args1: [{type: 'field_label_serializable', name: 'VALUE', text: ''}],
        colour: '#FFAB19',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    control_inlineReturn: {
        type: 'control_inlineReturn',
        message0: '返回 %1',
        args0: [{type: 'input_value', name: 'VALUE'}],
        args1: [{type: 'field_label_serializable', name: 'VALUE', text: ''}],
        output: 'Number',
        colour: '#FFAB19',
        id: 'REPORTER',
    },

    // ---- 运算 Math ----
    math_arithmetic: {
        type: 'math_arithmetic',
        message0: '%1  %2  %3',
        args0: [
            {type: 'input_value', name: 'A', check: ['Number','String','Boolean','Vector','Sprite']},
            {type: 'field_dropdown', name: 'OP', options: [
                ['+', 'add'], ['-', 'sub'], ['×', 'mul'], ['÷', 'div'], ['%', 'mod'],
            ]},
            {type: 'input_value', name: 'B', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        inputsInline: true,
        output: 'Number',
        colour: '#59C059',
        id: 'REPORTER',
    },
    math_single: {
        type: 'math_single',
        message0: '%1 %2',
        args0: [
            {type: 'field_dropdown', name: 'OP', options: [
                ['绝对值', 'abs'], ['负', 'neg'], ['ln', 'ln'], ['log10', 'log10'],
                ['e^', 'exp'], ['10^', 'pow10'], ['平方根', 'sqrt'], ['立方根', 'cbrt'],
            ]},
            {type: 'input_value', name: 'NUM', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        output: 'Number',
        colour: '#59C059',
        id: 'REPORTER',
    },
    math_round: {
        type: 'math_round',
        message0: '取整 %1 %2',
        args0: [
            {type: 'field_dropdown', name: 'OP', options: [
                ['四舍五入', 'round'], ['向上取整', 'ceil'], ['向下取整', 'floor']
            ]},
            {type: 'input_value', name: 'NUM', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        output: 'Number',
        colour: '#59C059',
        id: 'REPORTER',
    },
    math_random: {
        type: 'math_random',
        message0: '随机整数 从 %1    到 %2',
        args0: [
            {type: 'input_value', name: 'FROM', check: ['Number','String','Boolean','Vector','Sprite']},
            {type: 'input_value', name: 'TO', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        output: 'Number',
        colour: '#59C059',
        id: 'REPORTER',
    },
    math_trig: {
        type: 'math_trig',
        message0: '%1 的 %2',
        args0: [
            {type: 'field_dropdown', name: 'OP', options: [
                ['正弦', 'sin'], ['余弦', 'cos'], ['正切', 'tan'],
                ['反正弦', 'asin'], ['反余弦', 'acos'], ['反正切', 'atan']
            ]},
            {type: 'input_value', name: 'NUM', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        output: 'Number',
        colour: '#59C059',
        id: 'REPORTER',
    },
    math_constant: {
        type: 'math_constant',
        message0: '%1',
        args0: [{type: 'field_dropdown', name: 'CONST', options: [
            ['π', 'PI'], ['e', 'E'], ['∞', 'INFINITY'], ['(1/0)', 'INFINITY_NEG'],
            ['φ', 'PHI'], ['√2', 'SQRT2'], ['√1/2', 'SQRT1_2'],
        ]}],
        output: 'Number',
        colour: '#59C059',
        id: 'REPORTER',
    },
    math_compare: {
        type: 'math_compare',
        message0: '%1    %2  %3',
        args0: [
            {type: 'input_value', name: 'A', check: ['Number','String','Boolean','Vector','Sprite']},
            {type: 'field_dropdown', name: 'OP', options: [
                ['=', 'EQ'], ['<', 'LT'], ['>', 'GT']
            ]},
            {type: 'input_value', name: 'B', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        output: 'Boolean',
        colour: '#59C059',
        id: 'BOOLEAN',
    },
    logic_operation: {
        type: 'logic_operation',
        message0: '%1 %2 %3',
        args0: [
            {type: 'input_value', name: 'A', check: 'Boolean'},
            {type: 'field_dropdown', name: 'OP', options: [['且', 'AND'], ['或', 'OR']]},
            {type: 'input_value', name: 'B', check: 'Boolean'}
        ],
        output: 'Boolean',
        colour: '#59C059',
        id: 'BOOLEAN',
    },
    logic_negate: {
        type: 'logic_negate',
        message0: '非 %1',
        args0: [{type: 'input_value', name: 'BOOL', check: 'Boolean'}],
        output: 'Boolean',
        colour: '#59C059',
        id: 'BOOLEAN',
    },
    logic_boolean: {
        type: 'logic_boolean',
        message0: '%1',
        args0: [{type: 'field_dropdown', name: 'BOOL', options: [['真', 'TRUE'], ['假', 'FALSE']]}],
        output: 'Boolean',
        colour: '#FFFFFF',
        id: 'BOOLEAN',
    },

    // ---- 文本 Text ----,
    text: {
        type: 'text',
        message0: '%1',
        args0: [{type: 'field_input', name: 'TEXT', text: ''}],
        output: 'String',
        colour: '#FFFFFF',
        id: 'REPORTER',
    },

    // ---- 数字 Number ----,
    math_number: {
        type: 'math_number',
        message0: '%1',
        args0: [{type: 'field_number', name: 'NUM', value: 0}],
        output: 'Number',
        colour: '#FFFFFF',
        id: 'REPORTER',
    },

    // ---- 字符串 Strings ----,
    string_concat: {
        type: 'string_concat',
        message0: '连接 %1   %2    和',
        args0: [
            {type: 'input_value', name: 'A'},
            {type: 'input_value', name: 'B'}
        ],
        output: 'String',
        colour: 160,
        id: 'REPORTER',
    },
    string_slice: {
        type: 'string_slice',
        message0: '截取 %1    从 %2     到 %3',
        args0: [
            {type: 'input_value', name: 'STR'},
            {type: 'input_value', name: 'START', check: ['Number','String','Boolean','Vector','Sprite']},
            {type: 'input_value', name: 'END', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        output: 'String',
        colour: 160,
        id: 'REPORTER',
    },
    string_indexOf: {
        type: 'string_indexOf',
        message0: '查找 %1    中 %2     的位置',
        args0: [
            {type: 'input_value', name: 'STR'},
            {type: 'input_value', name: 'SUBSTR'}
        ],
        output: 'Number',
        colour: 160,
        id: 'REPORTER',
    },
    string_length: {
        message0: '%1 的长度',
        args0: [{type: 'input_value', name: 'STR'}],
        output: 'Boolean',
        colour: 160,
        id: 'BOOLEAN',
    },
    string_replace: {
        type: 'string_replace',
        message0: '替换 %1    中 %2     为 %3',
        args0: [
            {type: 'input_value', name: 'STR'},
            {type: 'input_value', name: 'OLD'},
            {type: 'input_value', name: 'NEW'}
        ],
        output: 'String',
        colour: 160,
        id: 'REPORTER',
    },
    string_trim: {
        message0: '%1 去首尾空格',
        args0: [{type: 'input_value', name: 'STR'}],
        output: 'String',
        colour: 160,
        id: 'REPORTER',
    },
    string_contains: {
        message0: '%1 包含 %2?',
        args0: [{type: 'input_value', name: 'STR'}, {type: 'input_value', name: 'SUBSTR'}],
        output: 'Boolean',
        colour: 160,
        id: 'BOOLEAN',
    },
    string_toLowerCase: {
        message0: '%1 转小写',
        args0: [{type: 'input_value', name: 'STR'}],
        output: 'String',
        colour: 160,
        id: 'REPORTER',
    },
    string_toUpperCase: {
        message0: '%1 转大写',
        args0: [{type: 'input_value', name: 'STR'}],
        output: 'String',
        colour: 160,
        id: 'REPORTER',
    },
    string_regex: {
        message0: '%1 正则匹配 %2',
        args0: [{type: 'input_value', name: 'STR'}, {type: 'input_value', name: 'PATTERN'}],
        output: 'Boolean',
        colour: 160,
        id: 'BOOLEAN',
    },

    // ---- 向量 Vectors ----
    vector_create: {
        type: 'vector_create',
        message0: '创建向量 (%1   , %2    )',
        args0: [
            {type: 'input_value', name: 'X', check: ['Number','String','Boolean','Vector','Sprite']},
            {type: 'input_value', name: 'Y', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        output: 'Vector',
        colour: 195,
        id: 'REPORTER',
    },
    vector_x: {
        type: 'vector_x',
        message0: '%1 的 X 分量',
        args0: [{type: 'input_value', name: 'A', check: 'Vector'}],
        output: 'Number',
        colour: 195,
        id: 'REPORTER',
    },
    vector_y: {
        type: 'vector_y',
        message0: '%1 的 Y 分量',
        args0: [{type: 'input_value', name: 'A', check: 'Vector'}],
        output: 'Number',
        colour: 195,
        id: 'REPORTER',
    },
    vector_add: {
        type: 'vector_add',
        message0: '%1 + %2',
        args0: [
            {type: 'input_value', name: 'A', check: 'Vector'},
            {type: 'input_value', name: 'B', check: 'Vector'}
        ],
        output: 'Vector',
        colour: 195,
        id: 'REPORTER',
    },
    vector_sub: {
        type: 'vector_sub',
        message0: '%1 - %2',
        args0: [
            {type: 'input_value', name: 'A', check: 'Vector'},
            {type: 'input_value', name: 'B', check: 'Vector'}
        ],
        output: 'Vector',
        colour: 195,
        id: 'REPORTER',
    },
    vector_distance: {
        type: 'vector_distance',
        message0: '%1 到 %2 的距离',
        args0: [
            {type: 'input_value', name: 'A', check: 'Vector'},
            {type: 'input_value', name: 'B', check: 'Vector'}
        ],
        output: 'Number',
        colour: 195,
        id: 'REPORTER',
    },

    // ---- 输入 Inputs ----
    input_keyDown: {
        type: 'input_keyDown',
        message0: '按键 %1 按下?',
        args0: [{type: 'field_input', name: 'KEY', text: 'space'}],
        output: 'Boolean',
        colour: 140,
        id: 'BOOLEAN',
    },
    input_mouseDown: {
        args0: [],
        message0: '鼠标按下?',
        output: 'Boolean',
        colour: 140,
        id: 'BOOLEAN',
    },
    input_mouseX: {
        args0: [],
        message0: '鼠标 X 坐标',
        output: 'Number',
        colour: 140,
        id: 'REPORTER',
    },
    input_mouseY: {
        args0: [],
        message0: '鼠标 Y 坐标',
        output: 'Number',
        colour: 140,
        id: 'REPORTER',
    },

    // ---- 变量 Variables ----
    var_register: {
        type: 'var_register',
        message0: '声明变量 %1 类型 %2',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'myVar'},
            {type: 'field_dropdown', name: 'TYPE', options: [
                ['String', 'STRING'], ['Number', 'NUMBER'],
                ['Boolean', 'BOOLEAN'], ['List', 'LIST'],
            ]}
        ],
        colour: '#FF8C1A',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    var_get: {
        type: 'var_get',
        message0: '变量 %1',
        args0: [{type: 'field_input', name: 'NAME', text: 'myVar'}],
        colour: '#FF8C1A',
        output: 'Number',
        id: 'REPORTER',
    },
    var_set: {
        type: 'var_set',
        message0: '设置变量 %1 为 %2',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'myVar'},
            {type: 'input_value', name: 'VALUE'}
        ],
        colour: '#FF8C1A',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    var_change: {
        type: 'var_change',
        message0: '变量 %1 改变 %2',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'myVar'},
            {type: 'input_value', name: 'DELTA', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        colour: '#FF8C1A',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },

    // ---- 列表 Lists ----
    list_create: {
        type: 'list_create',
        message0: '建立列表 %1',
        args0: [{type: 'field_input', name: 'NAME', text: 'myList'}],
        colour: '#FF6680',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    list_getItem: {
        type: 'list_getItem',
        message0: '列表 %1 的第 %2    项',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'myList'},
            {type: 'input_value', name: 'INDEX', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        colour: '#FF6680',
        output: 'Number',
        id: 'REPORTER',
    },
    list_indexOf: {
        type: 'list_indexOf',
        message0: '列表 %1 中 %2    的位置',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'myList'},
            {type: 'input_value', name: 'ITEM'}
        ],
        output: 'Number',
        colour: '#FF6680',
        id: 'REPORTER',
    },
    list_contains: {
        type: 'list_contains',
        message0: '列表 %1 包含 %2   ?',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'myList'},
            {type: 'input_value', name: 'ITEM'}
        ],
        output: 'Boolean',
        colour: '#FF6680',
        id: 'BOOLEAN',
    },
    list_addItem: {
        type: 'list_addItem',
        message0: '列表 %1 添加 %2',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'myList'},
            {type: 'input_value', name: 'ITEM'}
        ],
        colour: '#FF6680',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    list_removeItem: {
        type: 'list_removeItem',
        message0: '列表 %1 移除第 %2    项',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'myList'},
            {type: 'input_value', name: 'INDEX', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        colour: '#FF6680',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    list_replaceItem: {
        type: 'list_replaceItem',
        message0: '列表 %1 替换第 %2    项为 %3',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'myList'},
            {type: 'input_value', name: 'INDEX', check: ['Number','String','Boolean','Vector','Sprite']},
            {type: 'input_value', name: 'ITEM'}
        ],
        colour: '#FF6680',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    list_length: {
        type: 'list_length',
        message0: '列表 %1 的长度',
        args0: [{type: 'field_input', name: 'NAME', text: 'myList'}],
        output: 'Number',
        colour: '#FF6680',
        id: 'REPORTER',
    },
    list_foreach: {
        type: 'list_foreach',
        message0: '遍历列表 %1 %2 %3',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'myList'},
            {type: 'field_input', name: 'VAR', text: 'item'},
            {type: 'input_statement', name: 'DO'}
        ],
        previousStatement: null,
        nextStatement: null,
        colour: '#FF6680',
        id: 'C',
    },

    // ---- 函数 Functions ----
    func_declare: {
        type: 'func_declare',
        message0: '定义函数 %1 (%2)',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'myFunc'},
            {type: 'field_input', name: 'PARAMS', text: 'a, b'}
        ],
        message1: '%1',
        args1: [{type: 'input_statement', name: 'BODY'}],
        previousStatement: null,
        nextStatement: null,
        colour: 300,
        id: 'C',
    },
    func_call: {
        type: 'func_call',
        message0: '调用函数 %1 (%2)',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'myFunc'},
            {type: 'field_input', name: 'ARGS', text: ''}
        ],
        output: 'Number',
        colour: 300,
        id: 'REPORTER',
    },
    func_return: {
        type: 'func_return',
        message0: '从函数返回 %1',
        args0: [{type: 'input_value', name: 'VALUE'}],
        args1: [{type: 'field_label_serializable', name: 'VALUE', text: ''}],
        colour: 300,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    func_param: {
        type: 'func_param',
        message0: '参数 %1',
        args0: [{type: 'field_input', name: 'NAME', text: 'param'}],
        colour: 300,
        output: 'Number',
        id: 'REPORTER',
    },

    // ---- 积木 Blocks (Custom Block Definition) ----
    block_define: {
        type: 'block_define',
        message0: '定义 %1',
        args0: [{type: 'field_label', text: '我的积木', name: 'NAME'}],
        message1: '实现 %1',
        args1: [{type: 'input_statement', name: 'IMPL'}],
        colour: 290,
        extensions: ['shape_hat']
    },
    block_field_string: {
        type: 'block_field_string',
        message0: '字符串参数 %1 默认 %2',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'STR'},
            {type: 'field_input', name: 'DEFAULT', text: ''}
        ],
        colour: 270,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    block_field_number: {
        type: 'block_field_number',
        message0: '数字参数 %1 默认 %2',
        args0: [
            {type: 'field_input', name: 'NAME', text: 'NUM'},
            {type: 'input_value', name: 'DEFAULT', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        colour: 270,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    block_field_label: {
        type: 'block_field_label',
        message0: '标签 %1',
        args0: [{type: 'field_input', name: 'TEXT', text: '标签'}],
        colour: 270,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },

    // ---- 运行时 Runtime ----,
    runtime_start: {
        args0: [],
        message0: '启动项目',
        colour: 350,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    runtime_stop: {
        args0: [],
        message0: '停止项目',
        colour: 350,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    runtime_frameRate: {
        args0: [],
        message0: '帧率',
        output: 'Number',
        colour: 350,
        id: 'REPORTER',
    },
    runtime_timer: {
        args0: [{type: 'field_dropdown', name: 'WHICH', options: [['时钟1','timer1'],['时钟2','timer2']]}],
        message0: '计时器 %1',
        output: 'Number',
        colour: 350,
        id: 'REPORTER',
    },
    runtime_broadcast: {
        type: 'runtime_broadcast',
        message0: '运行时广播 %1',
        args0: [{type: 'field_input', name: 'EVENT', text: '事件名'}],
        colour: 350,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },

    // ---- 目标 Targets ----,
    target_clone: {
        args0: [{type: 'input_value', name: 'TARGET'}],
        message0: '克隆 %1',
        colour: 210,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    target_deleteClone: {
        args0: [],
        message0: '删除克隆体',
        colour: 210,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    target_getSprite: {
        type: 'target_getSprite',
        message0: '获取角色 %1',
        args0: [{type: 'field_input', name: 'NAME', text: 'Sprite1'}],
        output: 'Sprite',
        colour: 210,
        id: 'REPORTER',
    },

    // ---- 浏览器 Browser ----,
    browser_alert: {
        message0: '弹出提示 %1',
        args0: [{type: 'input_value', name: 'MSG'}],
        colour: 180,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    browser_console: {
        message0: '控制台输出 %1',
        args0: [{type: 'input_value', name: 'MSG'}],
        colour: 180,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    browser_localStorageGet: {
        type: 'browser_localStorageGet',
        message0: '本地存储读取 %1',
        args0: [{type: 'field_input', name: 'KEY', text: 'key'}],
        output: 'String',
        colour: 180,
        id: 'REPORTER',
    },
    browser_localStorageSet: {
        type: 'browser_localStorageSet',
        message0: '本地存储写入 %1 为 %2',
        args0: [
            {type: 'field_input', name: 'KEY', text: 'myKey'},
            {type: 'input_value', name: 'VALUE'}
        ],
        colour: 180,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    browser_openUrl: {
        message0: '打开网址 %1',
        args0: [{type: 'input_value', name: 'URL'}],
        colour: 330,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    // ---- 运动 Motion ----
    motion_moveSteps: {
        type: 'motion_moveSteps',
        message0: '移动 %1 步',
        args0: [{type: 'input_value', name: 'STEPS', check: 'Number'}],
        colour: '#4C97FF',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    motion_turnRight: {
        type: 'motion_turnRight',
        message0: '右转 %1 度',
        args0: [{type: 'input_value', name: 'DEGREES', check: 'Number'}],
        colour: '#4C97FF',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    motion_turnLeft: {
        type: 'motion_turnLeft',
        message0: '左转 %1 度',
        args0: [{type: 'input_value', name: 'DEGREES', check: 'Number'}],
        colour: '#4C97FF',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    motion_pointInDirection: {
        type: 'motion_pointInDirection',
        message0: '面向 %1 度',
        args0: [{type: 'input_value', name: 'DIRECTION', check: 'Number'}],
        colour: '#4C97FF',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    motion_glideTo: {
        type: 'motion_glideTo',
        message0: '在 %1 秒内滑行到 x:%2 y:%3',
        args0: [
            {type: 'input_value', name: 'SECS', check: 'Number'},
            {type: 'input_value', name: 'X', check: 'Number'},
            {type: 'input_value', name: 'Y', check: 'Number'}
        ],
        colour: '#4C97FF',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    motion_xPosition: {
        type: 'motion_xPosition',
        message0: 'x 坐标',
        args0: [],
        output: 'Number',
        colour: '#4C97FF',
        id: 'REPORTER',
    },
    motion_yPosition: {
        type: 'motion_yPosition',
        message0: 'y 坐标',
        args0: [],
        output: 'Number',
        colour: '#4C97FF',
        id: 'REPORTER',
    },
    motion_direction: {
        type: 'motion_direction',
        message0: '方向',
        args0: [],
        output: 'Number',
        colour: '#4C97FF',
        id: 'REPORTER',
    },
    // ---- 外观 Looks ----
    looks_say: {
        type: 'looks_say',
        message0: '说 %1 持续 %2 秒',
        args0: [
            {type: 'input_value', name: 'MESSAGE'},
            {type: 'input_value', name: 'SECS', check: 'Number'}
        ],
        colour: '#9966FF',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    looks_think: {
        type: 'looks_think',
        message0: '思考 %1',
        args0: [{type: 'input_value', name: 'MESSAGE'}],
        colour: '#9966FF',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    looks_show: {
        type: 'looks_show',
        message0: '显示',
        args0: [],
        colour: '#9966FF',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    looks_hide: {
        type: 'looks_hide',
        message0: '隐藏',
        args0: [],
        colour: '#9966FF',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    looks_changeSize: {
        type: 'looks_changeSize',
        message0: '将大小增加 %1',
        args0: [{type: 'input_value', name: 'CHANGE', check: 'Number'}],
        colour: '#9966FF',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    looks_size: {
        type: 'looks_size',
        message0: '大小',
        args0: [],
        output: 'Number',
        colour: '#9966FF',
        id: 'REPORTER',
    },
    // ---- 网络 Network ----
    net_httpGet: {
        type: 'net_httpGet',
        message0: 'HTTP GET %1',
        args0: [{type: 'input_value', name: 'URL'}],
        output: 'String',
        colour: 190,
        id: 'REPORTER',
    },
    net_httpPost: {
        type: 'net_httpPost',
        message0: 'HTTP POST %1 数据 %2',
        args0: [
            {type: 'input_value', name: 'URL'},
            {type: 'input_value', name: 'BODY'}
        ],
        output: 'String',
        colour: 190,
        id: 'REPORTER',
    },
    net_jsonParse: {
        type: 'net_jsonParse',
        message0: '解析 JSON %1 取键 %2',
        args0: [
            {type: 'input_value', name: 'JSON'},
            {type: 'input_value', name: 'KEY'}
        ],
        output: 'String',
        colour: 190,
        id: 'REPORTER',
    },
    // ---- 时间 Time ----
    time_now: {
        type: 'time_now',
        message0: '当前时间戳（毫秒）',
        args0: [],
        output: 'Number',
        colour: 30,
        id: 'REPORTER',
    },
    time_dateString: {
        type: 'time_dateString',
        message0: '当前日期字符串',
        args0: [],
        output: 'String',
        colour: 30,
        id: 'REPORTER',
    },
    time_waitMs: {
        type: 'time_waitMs',
        message0: '等待 %1 毫秒',
        args0: [{type: 'input_value', name: 'MS', check: 'Number'}],
        colour: 30,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    music_playTone: {
        type: 'music_playTone',
        message0: '播放音调 %1 %2 持续   秒',
        args0: [
            {type: 'input_value', name: 'FREQ', check: ['Number','String','Boolean','Vector','Sprite']},
            {type: 'input_value', name: 'TIME', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        colour: 330,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    music_playNote: {
        type: 'music_playNote',
        message0: '播放音符 %1 持续 %2    拍',
        args0: [
            {type: 'field_dropdown', name: 'NOTE', options: [
                ['C', 'C'], ['D', 'D'], ['E', 'E'], ['F', 'F'],
                ['G', 'G'], ['A', 'A'], ['B', 'B']
            ]},
            {type: 'input_value', name: 'BEATS', check: ['Number','String','Boolean','Vector','Sprite']}
        ],
        colour: 330,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    music_rest: {
        message0: '休止符 %1 拍',
        args0: [{type: 'input_value', name: 'BEATS', check: ['Number','String','Boolean','Vector','Sprite']}],
        colour: 330,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    music_setTempo: {
        message0: '设置节奏 %1 BPM',
        args0: [{type: 'input_value', name: 'TEMPO', check: ['Number','String','Boolean','Vector','Sprite']}],
        colour: 100,
        output: 'Number',
        id: 'REPORTER',
    },
    music_setVolume: {
        message0: '设置音量 %1',
        args0: [{type: 'input_value', name: 'VOLUME', check: ['Number','String','Boolean','Vector','Sprite']}],
        colour: 100,
        output: 'Number',
        id: 'REPORTER',
    },

    // ---- 脚本 Script ----
    // 工具箱「脚本」分类里引用了 script_eval，但 BLOCK_DEFINITIONS 里一直缺定义，
    // 结果这个块在工具箱看得见、点得动，却无法被创建（Blockly.Blocks 里不存在）。
    script_eval: {
        type: 'script_eval',
        message0: '执行代码 %1',
        args0: [{type: 'field_input', name: 'CODE', text: 'return 1;'}],
        colour: '#5A5A8F',
        tooltip: '直接执行一段 JavaScript 代码',
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },

    // ---- 额外 Extra ----,
    extra_comment: {
        type: 'extra_comment',
        message0: '注释 %1',
        args0: [{type: 'field_input', name: 'TEXT', text: '注释内容'}],
        colour: 80,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
    extra_rawCode: {
        type: 'extra_rawCode',
        message0: '原始代码 %1',
        args0: [{type: 'field_input', name: 'CODE', text: '// raw code'}],
        colour: 80,
        id: 'COMMAND',
        previousStatement: null,
        nextStatement: null,
    },
};

// ============================================================,
// Code Generators - Convert blocks to JavaScript,
// ============================================================

export const CODE_GENERATORS = {
    // 事件
    event_whenLoaded: () => 'runtime.on("PROJECT_LOADED", () => {\n})',
    event_whenReceived: (b) => `runtime.on("PROJECT_LOADED", () => { \n// when received: ${b.getFieldValue('EVENT')}\n})`,
    event_broadcast: (b) => {
        const ev = b.getFieldValue('EVENT') || '事件名';
        // runtime.broadcast doesn't exist in scratch-vm; broadcast is done via
        // startHats('event_whenbroadcastreceived', ...).
        return `runtime.startHats('event_whenbroadcastreceived', null, ${JSON.stringify(ev)});\n`;
    },
    event_broadcastAndWait: (b) => {
        const ev = b.getFieldValue('EVENT') || '事件名';
        return `runtime.startHats('event_whenbroadcastreceived', null, ${JSON.stringify(ev)});\n`;
    },
    event_newThread: (b) => `// new thread\n${b.getFieldValue('CODE') || ''}`,
    event_whenLoaded: () => 'runtime.on("PROJECT_LOADED", () => {\n// block started\n})',
    event_whenKeyPressed: (b) => `// when key "${b.getFieldValue('KEY') || 'space'}" pressed\n`,
    event_whenTimerGreaterThan: (b) => {
        const v = javascriptGenerator.valueToCode(b, 'VALUE', 0) || '10';
        // No 'TIMER_GT' runtime event exists; keep a safe polling hook.
        return `setInterval(() => {\n// when timer > ${v} (poll hook)\n}, 1000);\n`;
    },
    event_whenLoudnessGreaterThan: (b) => {
        const v = javascriptGenerator.valueToCode(b, 'VALUE', 0) || '10';
        return `// when loudness > ${v} (requires ioDevices.sound; left as a no-op hook)\n`;
    },
    event_whenCloned: () => '// when cloned\n',
    event_whenBackdropChangesTo: (b) => `// when backdrop changes to "${b.getFieldValue('BACKDROP') || 'backdrop1'}"\n`,

    // 控制
    control_if: (b) => {
        const cond = javascriptGenerator.valueToCode(b, 'COND', 0) || 'false';
        const doCode = javascriptGenerator.statementToCode(b, 'DO');
        return `if (${cond}) {\n${doCode}}\n`;
    },
    control_ifElse: (b) => {
        const cond = javascriptGenerator.valueToCode(b, 'COND', 0) || 'false';
        const doCode = javascriptGenerator.statementToCode(b, 'DO');
        const elseCode = javascriptGenerator.statementToCode(b, 'ELSE');
        return `if (${cond}) {\n${doCode}} else {\n${elseCode}}\n`;
    },
    control_wait: (b) => {
        const t = javascriptGenerator.valueToCode(b, 'TIME', 0) || '1';
        // runtime.yield doesn't exist; wait with a Promise (requires async method,
        // which block_define now emits automatically when the impl contains await).
        return `await new Promise(r => setTimeout(r, ${t} * 1000));\n`;
    },
    control_repeat: (b) => {
        const times = javascriptGenerator.valueToCode(b, 'TIMES', 0) || '10';
        // NOTE: this block's statement input is named SUBSTACK (see BLOCK_DEFINITIONS),
        // NOT DO — reading 'DO' returns empty, silently dropping the loop body.
        const body = javascriptGenerator.statementToCode(b, 'SUBSTACK');
        return `for (let i = 0; i < ${times}; i++) {\n${body}}\n`;
    },
    control_while: (b) => {
        const cond = javascriptGenerator.valueToCode(b, 'COND', 0) || 'false';
        const body = javascriptGenerator.statementToCode(b, 'DO');
        return `while (${cond}) {\n${body}}\n`;
    },
    control_return: (b) => {
        const v = javascriptGenerator.valueToCode(b, 'VALUE', 0) || '';
        return `return ${v};\n`;
    },
    control_inlineReturn: (b) => {
        const v = javascriptGenerator.valueToCode(b, 'VALUE', 0) || '0';
        return [v, 0];
    },

    // scratch-blocks 给 input_value 自动创建的默认 shadow（用户键入数字/文本时）
    math_number: (b) => [String(b.getFieldValue('NUM')), 0],
    text: (b) => [JSON.stringify(b.getFieldValue('TEXT')), 0],

    // 运算
    math_arithmetic: (b) => {
        const op = b.getFieldValue('OP');
        const a = javascriptGenerator.valueToCode(b, 'A', 0) || '0';
        const b2 = javascriptGenerator.valueToCode(b, 'B', 0) || '0';
        const ops = {add: '+', sub: '-', mul: '*', div: '/', mod: '%'};
        return [`(${a} ${ops[op]} ${b2})`, 0];
    },
    math_single: (b) => {
        const op = b.getFieldValue('OP');
        const num = javascriptGenerator.valueToCode(b, 'NUM', 0) || '0';
        const ops = {
            abs: 'Math.abs', neg: '-', ln: 'Math.log', log10: 'Math.log10',
            exp: 'Math.exp', pow10: 'Math.pow(10,', sqrt: 'Math.sqrt', cbrt: 'Math.cbrt'
        };
        if (op === 'neg') return [`(-(${num}))`, 0];
        if (op === 'pow10') return [`(Math.pow(10, ${num}))`, 0];
        return [`(${ops[op]}(${num}))`, 0];
    },
    math_round: (b) => {
        const op = b.getFieldValue('OP');
        const num = javascriptGenerator.valueToCode(b, 'NUM', 0) || '0';
        const ops = {round: 'Math.round', ceil: 'Math.ceil', floor: 'Math.floor'};
        return [`(${ops[op]}(${num}))`, 0];
    },
    math_random: (b) => {
        const from = javascriptGenerator.valueToCode(b, 'FROM', 0) || '0';
        const to = javascriptGenerator.valueToCode(b, 'TO', 0) || '100';
        return [`(Math.floor(Math.random() * (${to} - ${from} + 1)) + ${from})`, 0];
    },
    math_trig: (b) => {
        const op = b.getFieldValue('OP');
        const num = javascriptGenerator.valueToCode(b, 'NUM', 0) || '0';
        return [`(Math.${op}(${num}))`, 0];
    },
    math_constant: (b) => {
        const c = b.getFieldValue('CONST');
        const consts = {
            PI: 'Math.PI', E: 'Math.E', INFINITY: 'Infinity',
            INFINITY_NEG: '-Infinity', PHI: '1.618033988749895',
            SQRT2: 'Math.SQRT2', SQRT1_2: 'Math.SQRT1_2'
        };
        return [`${consts[c]}`, 0];
    },
    math_compare: (b) => {
        const op = b.getFieldValue('OP');
        const a = javascriptGenerator.valueToCode(b, 'A', 0) || '0';
        const b2 = javascriptGenerator.valueToCode(b, 'B', 0) || '0';
        const ops = {EQ: '===', NEQ: '!==', LT: '<', LTE: '<=', GT: '>', GTE: '>='};
        return [`(${a} ${ops[op]} ${b2})`, 0];
    },
    logic_operation: (b) => {
        const op = b.getFieldValue('OP');
        const a = javascriptGenerator.valueToCode(b, 'A', 0) || 'false';
        const b2 = javascriptGenerator.valueToCode(b, 'B', 0) || 'false';
        const sym = op === 'AND' ? '&&' : '||';
        return [`(${a} ${sym} ${b2})`, 0];
    },
    logic_negate: (b) => {
        const v = javascriptGenerator.valueToCode(b, 'BOOL', 0) || 'false';
        return [`(!(${v}))`, 0];
    },
    logic_boolean: (b) => {
        return [b.getFieldValue('BOOL').toLowerCase(), 0];
    },

    // 字符串
    string_concat: (b) => {
        const a = javascriptGenerator.valueToCode(b, 'A', 0) || '""';
        const b2 = javascriptGenerator.valueToCode(b, 'B', 0) || '""';
        return [`(String(${a}) + String(${b2}))`, 0];
    },
    string_slice: (b) => {
        const s = javascriptGenerator.valueToCode(b, 'STR', 0) || '""';
        const start = javascriptGenerator.valueToCode(b, 'START', 0) || '0';
        const end = javascriptGenerator.valueToCode(b, 'END', 0) || '0';
        return [`(${s}.slice(${start}, ${end}))`, 0];
    },
    string_indexOf: (b) => {
        const s = javascriptGenerator.valueToCode(b, 'STR', 0) || '""';
        const sub = javascriptGenerator.valueToCode(b, 'SUBSTR', 0) || '""';
        return [`(${s}.indexOf(${sub}))`, 0];
    },
    string_length: (b) => {
        const s = javascriptGenerator.valueToCode(b, 'STR', 0) || '""';
        return [`(${s}.length)`, 0];
    },
    string_contains: (b) => {
        const s = javascriptGenerator.valueToCode(b, 'STR', 0) || '""';
        const sub = javascriptGenerator.valueToCode(b, 'SUBSTR', 0) || '""';
        return [`(${s}.includes(${sub}))`, 0];
    },
    string_replace: (b) => {
        const s = javascriptGenerator.valueToCode(b, 'STR', 0) || '""';
        const oldS = javascriptGenerator.valueToCode(b, 'OLD', 0) || '""';
        const newS = javascriptGenerator.valueToCode(b, 'NEW', 0) || '""';
        return [`(${s}.split(${oldS}).join(${newS}))`, 0];
    },
    string_trim: (b) => {
        const s = javascriptGenerator.valueToCode(b, 'STR', 0) || '""';
        return [`(${s}.trim())`, 0];
    },
    string_toUpperCase: (b) => {
        const s = javascriptGenerator.valueToCode(b, 'STR', 0) || '""';
        return [`(${s}.toUpperCase())`, 0];
    },
    string_toLowerCase: (b) => {
        const s = javascriptGenerator.valueToCode(b, 'STR', 0) || '""';
        return [`(${s}.toLowerCase())`, 0];
    },
    string_regex: (b) => {
        const s = javascriptGenerator.valueToCode(b, 'STR', 0) || '""';
        const p = javascriptGenerator.valueToCode(b, 'PATTERN', 0) || '""';
        return [`(new RegExp(${p}).test(${s}))`, 0];
    },

    // 向量
    vector_create: (b) => {
        const x = javascriptGenerator.valueToCode(b, 'X', 0) || '0';
        const y = javascriptGenerator.valueToCode(b, 'Y', 0) || '0';
        return [`({x: ${x}, y: ${y}})`, 0];
    },
    vector_x: (b) => {
        const v = javascriptGenerator.valueToCode(b, 'VEC', 0) || '{x:0,y:0}';
        return [`(${v}.x)`, 0];
    },
    vector_y: (b) => {
        const v = javascriptGenerator.valueToCode(b, 'VEC', 0) || '{x:0,y:0}';
        return [`(${v}.y)`, 0];
    },
    vector_add: (b) => {
        const a = javascriptGenerator.valueToCode(b, 'A', 0) || '{x:0,y:0}';
        const b2 = javascriptGenerator.valueToCode(b, 'B', 0) || '{x:0,y:0}';
        return [`({x: ${a}.x + ${b2}.x, y: ${a}.y + ${b2}.y})`, 0];
    },
    vector_sub: (b) => {
        const a = javascriptGenerator.valueToCode(b, 'A', 0) || '{x:0,y:0}';
        const b2 = javascriptGenerator.valueToCode(b, 'B', 0) || '{x:0,y:0}';
        return [`({x: ${a}.x - ${b2}.x, y: ${a}.y - ${b2}.y})`, 0];
    },
    vector_distance: (b) => {
        const a = javascriptGenerator.valueToCode(b, 'A', 0) || '{x:0,y:0}';
        const b2 = javascriptGenerator.valueToCode(b, 'B', 0) || '{x:0,y:0}';
        return [`(Math.hypot(${a}.x - ${b2}.x, ${a}.y - ${b2}.y))`, 0];
    },

    // 输入
    input_keyDown: (b) => {
        const k = b.getFieldValue('KEY');
        return [`runtime.ioDevices.keyboard.getKeyIsDown(${JSON.stringify(k)})`, 0];
    },
    input_mouseDown: () => ['runtime.ioDevices.mouse.getIsDown()', 0],
    input_mouseX: () => ['runtime.ioDevices.mouse.getScratchX()', 0],
    input_mouseY: () => ['runtime.ioDevices.mouse.getScratchY()', 0],

    // 变量
    var_register: (b) => {
        const name = b.getFieldValue('NAME');
        const type = b.getFieldValue('TYPE');
        return `let ${name} = ${type === 'STRING' ? '""' : type === 'NUMBER' ? '0' : type === 'BOOLEAN' ? 'false' : '[]'};\n`;
    },
    var_get: (b) => [b.getFieldValue('NAME'), 0],
    var_set: (b) => {
        const name = b.getFieldValue('NAME');
        const v = javascriptGenerator.valueToCode(b, 'VALUE', 0) || '""';
        return `${name} = ${v};\n`;
    },
    var_change: (b) => {
        const name = b.getFieldValue('NAME');
        const d = javascriptGenerator.valueToCode(b, 'DELTA', 0) || '0';
        return `${name} += ${d};\n`;
    },

    // 列表
    list_create: (b) => {
        const name = b.getFieldValue('NAME');
        return `let ${name} = [];\n`;
    },
    list_getItem: (b) => {
        const name = b.getFieldValue('NAME');
        const idx = javascriptGenerator.valueToCode(b, 'INDEX', 0) || '0';
        return [`(${name}[${idx}])`, 0];
    },
    list_indexOf: (b) => {
        const name = b.getFieldValue('NAME');
        const item = javascriptGenerator.valueToCode(b, 'ITEM', 0) || '""';
        return [`(${name}.indexOf(${item}))`, 0];
    },
    list_contains: (b) => {
        const name = b.getFieldValue('NAME');
        const item = javascriptGenerator.valueToCode(b, 'ITEM', 0) || '""';
        return [`(${name}.includes(${item}))`, 0];
    },
    list_addItem: (b) => {
        const name = b.getFieldValue('NAME');
        const item = javascriptGenerator.valueToCode(b, 'ITEM', 0) || '""';
        return `${name}.push(${item});\n`;
    },
    list_removeItem: (b) => {
        const name = b.getFieldValue('NAME');
        const idx = javascriptGenerator.valueToCode(b, 'INDEX', 0) || '0';
        return `${name}.splice(${idx}, 1);\n`;
    },
    list_replaceItem: (b) => {
        const name = b.getFieldValue('NAME');
        const idx = javascriptGenerator.valueToCode(b, 'INDEX', 0) || '0';
        const item = javascriptGenerator.valueToCode(b, 'ITEM', 0) || '""';
        return `${name}[${idx}] = ${item};\n`;
    },
    list_length: (b) => [`(${b.getFieldValue('NAME')}.length)`, 0],
    list_foreach: (b) => {
        const name = b.getFieldValue('NAME');
        const varName = b.getFieldValue('VAR');
        const body = javascriptGenerator.statementToCode(b, 'DO');
        return `for (const ${varName} of ${name}) {\n${body}}\n`;
    },

    // 函数
    func_declare: (b) => {
        const name = b.getFieldValue('NAME');
        const params = b.getFieldValue('PARAMS');
        const body = javascriptGenerator.statementToCode(b, 'BODY');
        return `function ${name}(${params}) {\n${body}}\n`;
    },
    func_call: (b) => {
        const name = b.getFieldValue('NAME');
        const args = b.getFieldValue('ARGS') || '';
        return [`${name}(${args})`, 0];
    },
    func_return: (b) => {
        const v = javascriptGenerator.valueToCode(b, 'VALUE', 0) || '';
        return `return ${v};\n`;
    },
    func_param: (b) => [b.getFieldValue('NAME'), 0],

    // 积木
    block_define: (b) => {
        const name = b.getFieldValue('NAME') || 'myBlock';
        // opcode/type/text are stored as non-rendered properties on the block
        // (set by addStarterBlocks from the customBlocks metadata).
        const opcode = b._opcode || name.replace(/[^a-zA-Z0-9]/g, '_');
        const type = b._type || 'COMMAND';
        const text = b._text || '[' + name + ']';
        const impl = javascriptGenerator.statementToCode(b, 'IMPL');
        // If the implementation body uses `await` (control_wait / time_waitMs /
        // net_httpGet etc.), the method MUST be async or JS throws a syntax
        // error. TurboWarp also requires isAsync on the block entry.
        const usesAwait = /\bawait\b/.test(impl);
        const sig = usesAwait ? `async ${opcode}(args, util) {` : `${opcode}(args, util) {`;
        // REPORTER/BOOLEAN blocks must never return undefined — TurboWarp
        // would fail silently. Emit a default return value for empty impls.
        if ((type === 'REPORTER' || type === 'BOOLEAN') && !impl.trim()) {
            return `${sig}\n    return ${type === 'BOOLEAN' ? 'false' : '0'};\n}\n\n// Register block: ${name}\n// opcode: ${opcode}, type: ${type}, text: "${text}"${usesAwait ? '\n// isAsync: true' : ''}\n`;
        }
        return `${sig}\n${impl}}\n\n// Register block: ${name}\n// opcode: ${opcode}, type: ${type}, text: "${text}"${usesAwait ? '\n// isAsync: true' : ''}\n`;
    },
    block_field_string: (b) => {
        const n = b.getFieldValue('NAME');
        const d = b.getFieldValue('DEFAULT');
        // 从 args 解构参数（TurboWarp 的块参数在 args 对象里；entry.arguments
        // 由 wrapAsExtension 从 customBlocks.parts 生成）。写 arguments.NAME
        // 是无意义的——arguments 是函数内置对象，不注册参数。
        return `const ${n} = (args && args.${n} !== undefined) ? args.${n} : ${JSON.stringify(d)};\n`;
    },
    block_field_number: (b) => {
        const n = b.getFieldValue('NAME');
        const d = javascriptGenerator.valueToCode(b, 'DEFAULT', 0) || '0';
        return `const ${n} = (args && args.${n} !== undefined) ? args.${n} : ${d};\n`;
    },
    block_field_label: (b) => {
        return `// label: ${b.getFieldValue('TEXT')}\n`;
    },

    // 运行时
    runtime_start: () => 'runtime.start();\n',
    runtime_stop: () => 'runtime.stop();\n',
    runtime_frameRate: () => ['(runtime && runtime.frameLoop ? runtime.frameLoop.framerate : 30)', 0],
    runtime_timer: () => ['runtime.currentMSecs', 0],
    runtime_broadcast: (b) => {
        const ev = b.getFieldValue('EVENT') || '事件名';
        return `runtime.startHats('event_whenbroadcastreceived', null, ${JSON.stringify(ev)});\n`;
    },

    // 目标
    target_clone: () => 'util.target.makeClone();\n',
    target_deleteClone: () => 'runtime.disposeTarget(util.target);\n',
    target_getSprite: (b) => [`runtime.getSpriteTargetByName(${JSON.stringify(b.getFieldValue('NAME'))})`, 0],

    // 浏览器
    browser_alert: (b) => {
        const m = javascriptGenerator.valueToCode(b, 'MSG', 0) || '""';
        return `alert(${m});\n`;
    },
    browser_console: (b) => {
        const m = javascriptGenerator.valueToCode(b, 'MSG', 0) || '""';
        return `console.log(${m});\n`;
    },
    browser_localStorageGet: (b) => [`localStorage.getItem(${JSON.stringify(b.getFieldValue('KEY'))})`, 0],
    browser_localStorageSet: (b) => {
        const v = javascriptGenerator.valueToCode(b, 'VALUE', 0) || '""';
        return `localStorage.setItem(${JSON.stringify(b.getFieldValue('KEY'))}, ${v});\n`;
    },
    browser_openUrl: (b) => {
        const u = javascriptGenerator.valueToCode(b, 'URL', 0) || '""';
        return `window.open(${u});\n`;
    },

    // 运动
    motion_moveSteps: (b) => {
        const s = javascriptGenerator.valueToCode(b, 'STEPS', 0) || '10';
        return `ForgeExt.Motion.moveSteps(${s});\n`;
    },
    motion_turnRight: (b) => {
        const d = javascriptGenerator.valueToCode(b, 'DEGREES', 0) || '15';
        return `ForgeExt.Motion.turnRight(${d});\n`;
    },
    motion_turnLeft: (b) => {
        const d = javascriptGenerator.valueToCode(b, 'DEGREES', 0) || '15';
        return `ForgeExt.Motion.turnLeft(${d});\n`;
    },
    motion_pointInDirection: (b) => {
        const d = javascriptGenerator.valueToCode(b, 'DIRECTION', 0) || '90';
        return `ForgeExt.Motion.pointInDirection(${d});\n`;
    },
    motion_glideTo: (b) => {
        const s = javascriptGenerator.valueToCode(b, 'SECS', 0) || '1';
        const x = javascriptGenerator.valueToCode(b, 'X', 0) || '0';
        const y = javascriptGenerator.valueToCode(b, 'Y', 0) || '0';
        return `ForgeExt.Motion.glideTo(${s}, ${x}, ${y});\n`;
    },
    motion_xPosition: () => ['ForgeExt.Motion.xPosition()', 0],
    motion_yPosition: () => ['ForgeExt.Motion.yPosition()', 0],
    motion_direction: () => ['ForgeExt.Motion.direction()', 0],

    // 外观
    looks_say: (b) => {
        const m = javascriptGenerator.valueToCode(b, 'MESSAGE', 0) || '""';
        const s = javascriptGenerator.valueToCode(b, 'SECS', 0) || '2';
        return `ForgeExt.Looks.say(${m}, ${s});\n`;
    },
    looks_think: (b) => {
        const m = javascriptGenerator.valueToCode(b, 'MESSAGE', 0) || '""';
        return `ForgeExt.Looks.think(${m});\n`;
    },
    looks_show: () => 'ForgeExt.Looks.show();\n',
    looks_hide: () => 'ForgeExt.Looks.hide();\n',
    looks_changeSize: (b) => {
        const c = javascriptGenerator.valueToCode(b, 'CHANGE', 0) || '10';
        return `ForgeExt.Looks.changeSize(${c});\n`;
    },
    looks_size: () => ['ForgeExt.Looks.size()', 0],

    // 网络
    net_httpGet: (b) => {
        const u = javascriptGenerator.valueToCode(b, 'URL', 0) || '""';
        return [`fetch(${u}).then(r => r.text())`, 0];
    },
    net_httpPost: (b) => {
        const u = javascriptGenerator.valueToCode(b, 'URL', 0) || '""';
        const body = javascriptGenerator.valueToCode(b, 'BODY', 0) || '""';
        return [`fetch(${u}, {method: 'POST', body: ${body}}).then(r => r.text())`, 0];
    },
    net_jsonParse: (b) => {
        const j = javascriptGenerator.valueToCode(b, 'JSON', 0) || '""';
        const k = javascriptGenerator.valueToCode(b, 'KEY', 0) || '""';
        return [`(JSON.parse(${j})[${k}] ?? '')`, 0];
    },

    // 时间
    time_now: () => ['Date.now()', 0],
    time_dateString: () => ['new Date().toString()', 0],
    time_waitMs: (b) => {
        const ms = javascriptGenerator.valueToCode(b, 'MS', 0) || '1000';
        return `await new Promise(r => setTimeout(r, ${ms}));\n`;
    },

    // 音乐
    music_playTone: (b) => {
        const f = javascriptGenerator.valueToCode(b, 'FREQ', 0) || '440';
        const t = javascriptGenerator.valueToCode(b, 'TIME', 0) || '1';
        return `ForgeExt.Music.playTone(${f}, ${t});\n`;
    },
    music_playNote: (b) => {
        const n = b.getFieldValue('NOTE');
        const b2 = javascriptGenerator.valueToCode(b, 'BEATS', 0) || '1';
        return `ForgeExt.Music.playNote("${n}", ${b2});\n`;
    },
    music_rest: (b) => {
        const b2 = javascriptGenerator.valueToCode(b, 'BEATS', 0) || '1';
        return `ForgeExt.Music.rest(${b2});\n`;
    },
    music_setVolume: (b) => {
        const v = javascriptGenerator.valueToCode(b, 'VOLUME', 0) || '50';
        return `ForgeExt.Music.setVolume(${v});\n`;
    },
    music_setTempo: (b) => {
        const t = javascriptGenerator.valueToCode(b, 'TEMPO', 0) || '120';
        return `ForgeExt.Music.setTempo(${t});\n`;
    },

    // 脚本
    script_eval: (b) => [`eval(${JSON.stringify(b.getFieldValue('CODE'))})`, 0],

    // 额外
    extra_comment: (b) => `// ${b.getFieldValue('TEXT')}\n`,
    extra_rawCode: (b) => `${b.getFieldValue('CODE')}\n`
};

// ============================================================
// Pseudo javascriptGenerator object (lightweight Blockly generator stub)
// ============================================================
export const javascriptGenerator = {
    valueToCode: (block, name, _indent) => {
        const targetBlock = block.getInputTargetBlock(name);
        if (targetBlock) {
            const fn = CODE_GENERATORS[targetBlock.type];
            if (typeof fn === 'function') {
                const result = fn(targetBlock);
                if (Array.isArray(result)) return result[0];
                return result;
            }
            return '';
        }
        // 没有连子积木——scratch-blocks 的 input_value 若未配置 shadow，
        // 用户键入的值存在 input.fieldRow 的 <input>/<textarea> 元素上，
        // getField / getInputTargetBlock 都拿不到，必须读 DOM。
        const input = block.getInput(name);
        if (input && input.fieldRow) {
            const htmlInput = input.fieldRow.querySelector('input, textarea');
            if (htmlInput && htmlInput.value !== '') {
                const v = htmlInput.value;
                if (typeof v === 'number') return String(v);
                if (/^-?\d+(\.\d+)?$/.test(v)) return v;
                return JSON.stringify(v);
            }
        }
        // 退路：有 shadow/field 时走老逻辑
        const field = block.getField(name);
        if (field) {
            const v = field.getValue();
            if (v === '' || v === undefined || v === null) return '';
            // Numbers stay bare, everything else becomes a JS string literal
            if (typeof v === 'number') return String(v);
            if (/^-?\d+(\.\d+)?$/.test(v)) return v;
            return JSON.stringify(v);
        }
        return '';
    },
    statementToCode: (block, name) => {
        let code = '';
        let current = block.getInputTargetBlock(name);
        while (current) {
            const fn = CODE_GENERATORS[current.type];
            if (typeof fn === 'function') {
                const result = fn(current);
                if (typeof result === 'string') code += result;
            }
            current = current.getNextBlock();
        }
        return code;
    },
    workspaceToCode: (workspace) => {
        let code = '';
        workspace.getTopBlocks(true).forEach(block => {
            // 只输出 block_define（自定义积木方法）与 func_declare（顶层函数）。
            // 其他顶层游离块（如 control_wait / event_broadcast 拖到定义块外）
            // 一律跳过——否则会生成方法体外的裸代码（如 await ... 或
            // runtime.startHats(...)），污染扩展类结构导致 SyntaxError。
            if (block.type !== 'block_define' && block.type !== 'func_declare') return;
            const fn = CODE_GENERATORS[block.type];
            if (typeof fn === 'function') {
                const result = fn(block);
                if (typeof result === 'string') code += result;
            }
        });
        return code;
    }
};