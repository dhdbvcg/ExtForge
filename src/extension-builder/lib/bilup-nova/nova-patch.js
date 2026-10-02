/**
 * Nova bundle 运行时补丁
 * ======================
 * novatheai.bundle.js 是原版 Bilup Nova 的构建产物，按「原样搬运」原则不直接改动它。
 * 本模块在 bundle 源码被 eval 之前做几处精确的字符串替换，把原版的
 * 「Gandi IDE / Scratch 项目」语境改造成「Scratch 扩展编辑器」语境：
 *
 *  1. 系统提示词  → 扩展编辑器版（AI 知道自己在哪、能操作什么）
 *  2. 工具数组 nb → 扩展编辑器工具集（读写扩展元信息与积木定义）
 *  3. 工具派发 $g → 先查 window.__extEditorAiToolHost，命中即走扩展编辑器实现
 *  4. 配置 hook wg → 监听 nova-storage-sync 事件，让「一键配置模型」即时生效
 *
 * 定位全部用 indexOf + 引号/括号配平（不用正则、不写字面反斜杠），
 * 任何一处不匹配只记录诊断，绝不抛错，保证 AI 插件不会因补丁失败而整体崩掉。
 */

// 用 charCode 常量代替字面反斜杠，避免转义层级出错。
// BS 用于字符串拼接（String），BS_CODE 用于 charCodeAt 比较（Number）——
// 二者不可混用，否则转义判定永远为假，字符串会提前截断。
const BS = String.fromCharCode(92);   // 反斜杠（字符串）
const BS_CODE = 92;                   // 反斜杠（charCode）
const SQ = String.fromCharCode(39);   // 单引号
const LF = String.fromCharCode(10);   // 换行
const CR = String.fromCharCode(13);   // 回车

/** 扩展编辑器版系统提示词（逐行给出，便于维护）。 */
export const EXT_EDITOR_SYSTEM_PROMPT = [
    'You are AI, an AI assistant built into the Scratch Extension Editor (scratch扩展编辑器), a visual editor for authoring TurboWarp / Scratch extensions.',
    '',
    '## Where you are',
    '- The user is working inside a visual extension editor. This is NOT a Scratch project, NOT the Gandi IDE, and NOT the Bilup IDE.',
    '- There is no Scratch VM here: no sprites, no stage, no costumes, no sounds, and no project files. Never claim to have used tools such as listFiles / readFile / applyPatch / createSpriteWithSvg - those do not exist in this environment.',
    '- What you operate on is exactly one extension definition: its metadata (id / name / colors / description / author / license), an ordered list of custom blocks, and the generated TurboWarp extension source code.',
    '',
    '## What this editor produces',
    '- A standalone TurboWarp extension file shaped like: (function(Scratch) { ... Scratch.extensions.register(new MyExtension()); })(Scratch);',
    '- Every custom block becomes an entry in getInfo().blocks[] with opcode / text / blockType / arguments / colour / color1..3.',
    '- Block text uses TurboWarp syntax: a named parameter is written as [name] and MUST have a matching key in arguments, otherwise that parameter is silently dropped and the block renders blank.',
    '- Block types: command (stack block), reporter (round value output), boolean (hexagonal true/false output), hat (event block that starts a script).',
    '- Colors are #RRGGBB hex strings. A block without its own color inherits the extension color1; color2 / color3 are darker shades used for borders and labels.',
    '',
    '## Tools',
    '- getEditorGuide: read this editor structure and authoring rules. Call it once at the start.',
    '- getExtensionInfo: current extension metadata.',
    '- listCustomBlocks: every custom block currently defined, with id / name / type / color / arguments / flags.',
    '- getCurrentBlock: the block currently selected in the block list panel.',
    '- getGeneratedCode: the full generated extension source code.',
    '- addBlock: append a new custom block (name required; blockType / color / isAsync / filters optional).',
    '- updateBlock: change an existing block, addressed by id or by display name.',
    '- deleteBlock: remove a block, addressed by id or by display name.',
    '- setExtensionInfo: change extension metadata such as id / name / color1..3 / description / author / license.',
    '- listToolboxBlocks: the block palette (about 20 categories / 100+ blocks: 事件 / 控制 / 运算 / 字符串 / 运动 / 外观 / 声音 / 变量 / 列表 / 自定义积木 ...) - every block type that can be dropped onto the canvas. Call it to learn the exact `type` ids; pass `category` to filter.',
    '- listWorkspaceBlocks: what is actually placed on the canvas right now - blocks (with id / type / x / y) and comments.',
    '- addWorkspaceBlock: drop a block from the palette onto the canvas. Needs `type` from listToolboxBlocks; optional x / y.',
    '- deleteWorkspaceBlock: remove a block from the canvas by its `id` from listWorkspaceBlocks. Use it to clean up an experiment that did not work out. The only thing it refuses is a block_define card - those belong to the custom block list and go away through deleteBlock.',
    '- addWorkspaceComment: stick a yellow note on the canvas. Needs `text`; optional x / y.',
    '- updateWorkspaceComment: rewrite an existing note or move it. Needs `id`; give `text` and/or `x` / `y`.',
    '- deleteWorkspaceComment: remove a note from the canvas by its `id`.',
    '- connectWorkspaceBlocks: plug one block into another - the key step for real logic. Needs `parent`, `child`; optional `input` (a socket name from inspectWorkspaceBlock). Without `input` it tries the value sockets first, then stacks them. Example: parent = control_if, child = math_compare fills the CONDITION socket.',
    '- moveWorkspaceBlock: reposition a canvas block. Needs `id` plus `x` and/or `y`.',
    '- inspectWorkspaceBlock: read one canvas block\'s arguments - every field and input slot, with the current value and whether it is writable. Needs `id`.',
    '- setWorkspaceBlockValue: fill a value into one argument of a canvas block. Needs `id`, `name` (the argument name from inspectWorkspaceBlock) and `value`.',
    '- askUser: pop a chooser for the human and WAIT for the answer. Use it when a decision is genuinely theirs (color scheme, naming, which of two structures) - not for things you can decide yourself.',
    '',
    '## Two different things - do not confuse them',
    '- A "custom block" (addBlock / updateBlock / deleteBlock) is a definition: it becomes an entry in getInfo().blocks[] and a block_define card on the canvas.',
    '- A "workspace block" (addWorkspaceBlock / deleteWorkspaceBlock) is a real Scratch block sitting on the canvas: put a control_if here, delete a stray looks_say there, annotate with a comment.',
    '- Only block_define cards are non-deletable. Everything else on the canvas can be added and removed freely.',
    '',
    '## When the user says "put / place / stack / connect blocks" (放积木 / 摆积木 / 搭积木 / 连积木)',
    '- They mean WORKSPACE blocks. Use listToolboxBlocks to find the exact `type`, then addWorkspaceBlock to drop it, connectWorkspaceBlocks to plug blocks together, setWorkspaceBlockValue to fill numbers and text.',
    '- Do NOT create a new custom block (addBlock) to mimic an existing palette block. The palette already has 运动 / 外观 / 声音 / 事件 / 控制 / 侦测 / 运算 / 变量 / 列表 - motion_movesteps IS "移动10步", there is nothing to define. addBlock is ONLY for a brand-new capability the palette does not have.',
    '- Wrong: user asks "放一个移动10步" -> addBlock({name:"移动十步"}) ... that pollutes the extension definition.',
    '- Right: user asks "放一个移动10步" -> addWorkspaceBlock({type:"motion_moveSteps"}) -> setWorkspaceBlockValue({id, name:"STEPS", value:10}).',
    '',
    '## Blocks are useless until their arguments are filled',
    '- addWorkspaceBlock only drops the empty shell. "say [] for [] secs" with nothing in it does nothing.',
    '- Always follow it with inspectWorkspaceBlock to learn the argument names, then setWorkspaceBlockValue to write each one.',
    '- Typical shape: addWorkspaceBlock({type:"looks_say"}) -> inspectWorkspaceBlock({id}) -> shows MESSAGE and SECS -> setWorkspaceBlockValue({id, name:"MESSAGE", value:"Hello!"}) and setWorkspaceBlockValue({id, name:"SECS", value:2}).',
    '- A slot that already holds a real plugged-in block is refused on purpose - never silently replace the user\'s own wiring.',
    '',
    '## Asking the human',
    '- Call askUser when the choice is theirs. Pass a `questions` ARRAY - you may ask several things at once, and the user answers them one by one:',
    '  askUser({questions:[{id:"color", header:"选择配色", question:"...", options:[{label, description}]}, {id:"name", question:"..."}]})',
    '- Each item: {id, header, question, options:[{label, description}], allowCustom, multiSelect}. Only `question` is required; `id` just lets you match the answer back.',
    '- The bar is pinned above the AI prompt box (it does not cover the workspace) and shows "本次询问共 N 个问题" in its bottom-left corner. The user can go back to a previous question before submitting.',
    '- It blocks until the user submits, then returns {success, answers:[{id, header, question, answer}], answer}. `answer` is the single value when you asked one question, or an array of values when you asked several. Each value is a string, or an array when that question had multiSelect true.',
    '- If the user dismisses it you get {success:false, cancelled:true} - stop and ask what they want instead of guessing.',
    '- Do NOT use askUser for trivial or reversible things. Prefer 2-5 concrete options per question, and leave allowCustom true so the user can type their own. Do not ask more than 5 questions at once.',
    '',
    '## Workflow',
    '1) Call getEditorGuide once, then getExtensionInfo and listCustomBlocks to see the current state. If the request is about placing / wiring palette blocks, also call listToolboxBlocks up front.',
    '2) Briefly tell the user what you are about to change and why.',
    '3) If a real fork in the road depends on their taste, call askUser before building. Otherwise just decide and proceed.',
    '4) Apply the change with addBlock / updateBlock / deleteBlock / setExtensionInfo / addWorkspaceBlock / connectWorkspaceBlocks / setWorkspaceBlockValue - one logical change per call. The user watches the workspace update live, so do not print patches, diffs, or code.',
    '5) After editing, call listCustomBlocks / listWorkspaceBlocks / inspectWorkspaceBlock again to confirm the change actually landed, then summarize in one or two sentences.',
    '6) To build real logic instead of loose shells: addWorkspaceBlock the container (control_if / control_repeat), addWorkspaceBlock the piece that goes inside it (math_compare / math_number), then connectWorkspaceBlocks({parent, child}) to plug them together. Repeat until the structure is complete.',
    '7) If a request cannot be expressed by this editor, say so plainly and offer the closest supported design instead of inventing features.',
    '',
    '## Language',
    '- Answer in the same language as the user. If unclear, use zh-CN.'
].join(LF);

/** 扩展编辑器工具集（替换原版 26 个 Scratch 项目 DSL 工具）。 */
export const EXT_EDITOR_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'getEditorGuide',
            description: '读取 Scratch 扩展编辑器的结构与写作规范：积木类型、参数规则、颜色规则、导出到 TurboWarp 的方式。开始任务前先调用一次。',
            parameters: {type: 'object', properties: {}}
        }
    },
    {
        type: 'function',
        function: {
            name: 'getExtensionInfo',
            description: '读取当前扩展的元信息：id / 名称 / 三种颜色 / 描述 / 作者 / 许可 / 文档地址。',
            parameters: {type: 'object', properties: {}}
        }
    },
    {
        type: 'function',
        function: {
            name: 'listCustomBlocks',
            description: '列出当前扩展里定义的全部积木，含 id、显示名、opcode、形状类型、颜色、参数、异步与可用目标标记。',
            parameters: {type: 'object', properties: {}}
        }
    },
    {
        type: 'function',
        function: {
            name: 'getCurrentBlock',
            description: '读取积木列表里当前选中（正在编辑）的那个积木的完整信息。',
            parameters: {type: 'object', properties: {}}
        }
    },
    {
        type: 'function',
        function: {
            name: 'getGeneratedCode',
            description: '读取当前生成的完整 TurboWarp 扩展源码（代码面板里显示的那份）。',
            parameters: {type: 'object', properties: {}}
        }
    },
    {
        type: 'function',
        function: {
            name: 'addBlock',
            description: '新增一个积木。编辑器会立即在工作区里画出它，并加入积木列表。',
            parameters: {
                type: 'object',
                properties: {
                    name: {type: 'string', description: '积木显示名，例如「移动十步」。同时作为默认文案。'},
                    blockType: {type: 'string', description: '积木形状：command 堆叠块 / reporter 圆形返回值 / boolean 六边形布尔 / hat 事件帽。默认 command。'},
                    color: {type: 'string', description: '可选，积木颜色 #RRGGBB。省略则继承扩展 color1。'},
                    isAsync: {type: 'boolean', description: '可选，是否为异步积木（实现体里含 await）。'},
                    filterSprite: {type: 'boolean', description: '可选，是否可用于角色，默认 true。'},
                    filterStage: {type: 'boolean', description: '可选，是否可用于舞台，默认 true。'}
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'updateBlock',
            description: '修改一个已存在的积木：改名、改形状、改颜色、切换异步或可用目标。用 id 或显示名定位。',
            parameters: {
                type: 'object',
                properties: {
                    block: {type: 'string', description: '目标积木的 id 或显示名。'},
                    name: {type: 'string', description: '可选，新的显示名。'},
                    blockType: {type: 'string', description: '可选，新的形状：command / reporter / boolean / hat。'},
                    color: {type: 'string', description: '可选，新的颜色 #RRGGBB；传空字符串表示回退到扩展 color1。'},
                    isAsync: {type: 'boolean', description: '可选，是否异步。'},
                    filterSprite: {type: 'boolean', description: '可选，是否可用于角色。'},
                    filterStage: {type: 'boolean', description: '可选，是否可用于舞台。'}
                },
                required: ['block']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'deleteBlock',
            description: '删除一个积木（同时从工作区移除）。用 id 或显示名定位。至少要保留一个积木，删最后一个会被拒绝。',
            parameters: {
                type: 'object',
                properties: {
                    block: {type: 'string', description: '目标积木的 id 或显示名。'}
                },
                required: ['block']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'listToolboxBlocks',
            description: '列出积木工具箱（16 个分类）里的全部积木类型：type / 中文名 / 形状 / 提示。要往画布上放积木前先用它查准确的 type。',
            parameters: {
                type: 'object',
                properties: {
                    category: {type: 'string', description: '可选，按分类名过滤，例如「控制」「外观」「运动」。省略返回全部。'}
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'listWorkspaceBlocks',
            description: '列出当前画布上真实摆放的积木（含 id / 类型 / 中文名 / 坐标）和所有注释。删除积木前先用它拿到 id。',
            parameters: {type: 'object', properties: {}}
        }
    },
    {
        type: 'function',
        function: {
            name: 'addWorkspaceBlock',
            description: '把工具箱里的一个积木放到画布上（和用户从左侧拖出来完全一样）。type 必须是 listToolboxBlocks 返回的值。',
            parameters: {
                type: 'object',
                properties: {
                    type: {type: 'string', description: '积木类型 id，例如 control_if、looks_say、math_number。'},
                    x: {type: 'number', description: '可选，画布坐标 x。省略自动排在已有积木下方。'},
                    y: {type: 'number', description: '可选，画布坐标 y。省略自动排在已有积木下方。'}
                },
                required: ['type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'deleteWorkspaceBlock',
            description: '从画布上删除一个积木（连带它的子块）。id 来自 listWorkspaceBlocks。block_define 卡片不可删除。',
            parameters: {
                type: 'object',
                properties: {
                    id: {type: 'string', description: '要删除的积木 id，来自 listWorkspaceBlocks。'}
                },
                required: ['id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'addWorkspaceComment',
            description: '在画布上贴一张黄色便签注释，用来给积木写说明。',
            parameters: {
                type: 'object',
                properties: {
                    text: {type: 'string', description: '注释正文。'},
                    x: {type: 'number', description: '可选，画布坐标 x。'},
                    y: {type: 'number', description: '可选，画布坐标 y。'}
                },
                required: ['text']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'updateWorkspaceComment',
            description: '修改画布上已有的注释：改文字、挪位置。id 来自 listWorkspaceBlocks 的 comments。',
            parameters: {
                type: 'object',
                properties: {
                    id: {type: 'string', description: '注释 id，来自 listWorkspaceBlocks。'},
                    text: {type: 'string', description: '可选，新的注释正文。'},
                    x: {type: 'number', description: '可选，新的画布坐标 x。'},
                    y: {type: 'number', description: '可选，新的画布坐标 y。'}
                },
                required: ['id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'deleteWorkspaceComment',
            description: '删除画布上的一条注释。id 来自 listWorkspaceBlocks。',
            parameters: {
                type: 'object',
                properties: {
                    id: {type: 'string', description: '注释 id，来自 listWorkspaceBlocks。'}
                },
                required: ['id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'connectWorkspaceBlocks',
            description: '把一块积木接到另一块积木的插槽上，这是搭出真实逻辑的关键一步（例如把随机数接进「移动 … 步」的步数槽，把条件接进「如果 … 那么」）。parent / child 都是 listWorkspaceBlocks 里的 id；不给 input 时会自动挑第一个接得上的插槽。',
            parameters: {
                type: 'object',
                properties: {
                    parent: {type: 'string', description: '父积木 id（带插槽的那块），来自 listWorkspaceBlocks。'},
                    child: {type: 'string', description: '子积木 id（要接进去的那块），来自 listWorkspaceBlocks。'},
                    input: {type: 'string', description: '可选，插槽名（用 inspectWorkspaceBlock 查，例如 CONDITION / STEPS / VALUE）。省略则自动选择。'}
                },
                required: ['parent', 'child']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'moveWorkspaceBlock',
            description: '把画布上的积木挪到新坐标（只改位置，不改连接）。',
            parameters: {
                type: 'object',
                properties: {
                    id: {type: 'string', description: '积木 id，来自 listWorkspaceBlocks。'},
                    x: {type: 'number', description: '新的画布坐标 x。'},
                    y: {type: 'number', description: '新的画布坐标 y。'}
                },
                required: ['id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'inspectWorkspaceBlock',
            description: '读取画布上某个积木的全部参数：每个字段/插槽的名字、当前值、是否可写。往积木里填值之前必须先调它拿到参数名。',
            parameters: {
                type: 'object',
                properties: {
                    id: {type: 'string', description: '积木 id，来自 listWorkspaceBlocks 或 addWorkspaceBlock 的返回。'}
                },
                required: ['id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'setWorkspaceBlockValue',
            description: '往画布积木的某个参数里填值。刚放下的积木参数是空的（「说 …」没内容、「移动 … 步」没数字），必须用这个工具填进去积木才有意义。',
            parameters: {
                type: 'object',
                properties: {
                    id: {type: 'string', description: '积木 id。'},
                    name: {type: 'string', description: '参数名，必须是 inspectWorkspaceBlock 返回的 arguments 里的 name（例如 MESSAGE / SECS / STEPS / NUM）。'},
                    value: {type: ['string', 'number', 'boolean'], description: '要写入的值。数字插槽传数字，布尔插槽传 true/false，文本插槽传字符串。'},
                    valueType: {type: 'string', description: '可选：插槽为空时用来挑占位块类型，number / text / boolean。省略则按插槽自身的类型约束自动判断。'}
                },
                required: ['id', 'name', 'value']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'askUser',
            description: '向用户提问并一直等到用户作答才返回。询问条会贴在 AI 输入框上方，用户可以点选项、也能自己输入。当决定权确实在用户手上时使用（配色方案、命名、两种结构选型、要不要加某个功能）；能自己决定的小事不要问。一次可以问多个问题，用户逐个作答后你一次性拿到全部答案。',
            parameters: {
                type: 'object',
                properties: {
                    questions: {
                        type: 'array',
                        description: '要问的问题列表，1-5 个。每个问题在询问条里逐个呈现，界面左下角会显示本次共几个问题。',
                        items: {
                            type: 'object',
                            properties: {
                                id: {type: 'string', description: '可选，这个问题的标识，用于在返回结果里对上号，例如 "color"。省略时自动编号 q1/q2。'},
                                header: {type: 'string', description: '可选，该问题的短标题，例如「选择配色」。'},
                                question: {type: 'string', description: '问题正文，写清楚背景，一到两句。'},
                                options: {
                                    type: 'array',
                                    description: '可选，给出的选项列表（建议 2-5 个）。用户也可以不用选项、自己输入。',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            label: {type: 'string', description: '选项文字，尽量短。'},
                                            description: {type: 'string', description: '可选，一句话说明这个选项的含义或影响。'}
                                        },
                                        required: ['label']
                                    }
                                },
                                allowCustom: {type: 'boolean', description: '可选，是否允许用户自己输入答案，默认 true。'},
                                multiSelect: {type: 'boolean', description: '可选，是否允许多选，默认 false（单选）。多选时该项的 answer 是数组。'}
                            },
                            required: ['question']
                        }
                    }
                },
                required: ['questions']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'setExtensionInfo',
            description: '修改扩展元信息。只传需要改的字段，未传的保持原值。',
            parameters: {
                type: 'object',
                properties: {
                    id: {type: 'string', description: '扩展 id，小写字母数字，会作为 getInfo().id 与生成的类名。'},
                    name: {type: 'string', description: '扩展显示名。'},
                    color1: {type: 'string', description: '主色 #RRGGBB。'},
                    color2: {type: 'string', description: '次色 #RRGGBB（边框）。'},
                    color3: {type: 'string', description: '第三色 #RRGGBB（文字）。'},
                    description: {type: 'string', description: '扩展描述。'},
                    author: {type: 'string', description: '作者。'},
                    license: {type: 'string', description: '许可协议，例如 MPL-2.0。'},
                    docsUrl: {type: 'string', description: '文档地址。'}
                }
            }
        }
    }
];

/** 把任意文本编码成安全的单引号 JS 字面量。 */
function toSingleQuotedLiteral(text) {
    let s = String(text == null ? '' : text);
    s = s.split(BS).join(BS + BS);
    s = s.split(SQ).join(BS + SQ);
    s = s.split(CR).join('');
    s = s.split(LF).join(BS + 'n');
    return SQ + s + SQ;
}

/** 从 quotePos 处的引号出发，找到配对的结束引号位置（考虑转义）。 */
function findStringEnd(src, quotePos) {
    const quote = src.charCodeAt(quotePos);
    if (quote !== 34 && quote !== 39 && quote !== 96) return -1;
    let esc = false;
    for (let i = quotePos + 1; i < src.length; i++) {
        const c = src.charCodeAt(i);
        if (esc) { esc = false; continue; }
        if (c === BS_CODE) { esc = true; continue; }
        if (c === quote) return i;
    }
    return -1;
}

/** 从 openPos 处的开括号出发做配平，返回结束位置（不含）。 */
function findBalancedEnd(src, openPos) {
    let depth = 0;
    let inStr = 0;
    let esc = false;
    for (let i = openPos; i < src.length; i++) {
        const c = src.charCodeAt(i);
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (c === BS_CODE) { esc = true; continue; }
            if (c === inStr) inStr = 0;
            continue;
        }
        if (c === 34 || c === 39 || c === 96) { inStr = c; continue; }
        if (c === 91 || c === 123 || c === 40) depth++;
        else if (c === 93 || c === 125 || c === 41) {
            depth--;
            if (depth === 0) return i + 1;
        }
    }
    return -1;
}

/**
 * 对 bundle 源码做全部替换，返回 {src, report}。
 * report 是逐条中文诊断，失败条目以 FAIL 开头。
 */
export function patchNovaBundle(src) {
    const report = [];
    let out = String(src || '');
    if (!out) return {src: out, report: ['FAIL 源码为空']};

    // ---- 1) 系统提示词 ----
    const PROMPT_ANCHOR = 'content:' + SQ + 'You are AI';
    let idx = out.indexOf(PROMPT_ANCHOR);
    if (idx < 0) {
        report.push('FAIL 系统提示词：未找到锚点');
    } else {
        const quotePos = idx + 'content:'.length;
        const end = findStringEnd(out, quotePos);
        if (end < 0) {
            report.push('FAIL 系统提示词：字面量未闭合');
        } else {
            const oldLen = end - quotePos - 1;
            const lit = toSingleQuotedLiteral(EXT_EDITOR_SYSTEM_PROMPT);
            out = out.slice(0, quotePos) + lit + out.slice(end + 1);
            report.push('OK   系统提示词已替换（' + oldLen + ' → ' + EXT_EDITOR_SYSTEM_PROMPT.length + ' 字符）');
        }
    }

    // ---- 2) 工具数组 nb ----
    const TOOLS_ANCHOR = 'const nb=[{type:"function",function:{name:"listFiles"';
    idx = out.indexOf(TOOLS_ANCHOR);
    if (idx < 0) {
        report.push('FAIL 工具数组：未找到锚点');
    } else {
        const openPos = out.indexOf('[', idx);
        const end = openPos < 0 ? -1 : findBalancedEnd(out, openPos);
        if (end < 0) {
            report.push('FAIL 工具数组：括号未配平');
        } else {
            const oldLen = end - openPos;
            const lit = JSON.stringify(EXT_EDITOR_TOOLS);
            out = out.slice(0, openPos) + lit + out.slice(end);
            report.push('OK   工具集已替换（' + oldLen + ' → ' + lit.length + ' 字符，' + EXT_EDITOR_TOOLS.length + ' 个工具）');
        }
    }

    // ---- 3) 工具派发钩子 ----
    const DISPATCH_ANCHOR = '$g=async(e,t,n)=>{if(!e||"function"!=typeof e[t])throw new Error("Tool ".concat(t," not found"));';
    idx = out.indexOf(DISPATCH_ANCHOR);
    if (idx < 0) {
        report.push('FAIL 工具派发：未找到锚点');
    } else {
        const head = '$g=async(e,t,n)=>{const __h=window.__extEditorAiToolHost;' +
            'if(__h&&typeof __h[t]==="function"){try{return await __h[t](n||{})}' +
            'catch(__e){return {success:false,error:String(__e&&__e.message||__e)}}}';
        const tail = DISPATCH_ANCHOR.slice('$g=async(e,t,n)=>{'.length);
        out = out.slice(0, idx) + head + tail + out.slice(idx + DISPATCH_ANCHOR.length);
        report.push('OK   工具派发钩子已安装（优先走扩展编辑器实现）');
    }

    // ---- 4) 配置同步钩子（让一键配置模型即时生效）----
    const WG_ANCHOR = 'var wg=function(e,t){const n=_g(Object(a.useState)(()=>{try{' +
        'const n=localStorage.getItem(e);return n?JSON.parse(n):t}catch(e){return t}}),2),' +
        'r=n[0],i=n[1],o=Object(a.useMemo)(()=>JSON.stringify(t),[t]);';
    idx = out.indexOf(WG_ANCHOR);
    if (idx < 0) {
        report.push('FAIL 配置同步：未找到 wg 锚点');
    } else {
        const sync = 'Object(a.useEffect)(()=>{const __s=(__e)=>{try{' +
            'if(!__e||!__e.detail||__e.detail.key!==e)return;' +
            'const __v=localStorage.getItem(e);i(__v?JSON.parse(__v):t)}catch(__x){}};' +
            'window.addEventListener("nova-storage-sync",__s);' +
            'return()=>window.removeEventListener("nova-storage-sync",__s)},[e,o]);';
        out = out.slice(0, idx) + WG_ANCHOR + sync + out.slice(idx + WG_ANCHOR.length);
        report.push('OK   配置同步钩子已安装（nova-storage-sync）');
    }

    // ---- 5) 内联 SVG 属性归一化（消除 React 的 Invalid DOM property 警告）----
    // 原版 bundle 里有 3 处直接手写 React.createElement('svg', {...})，属性用的是
    // SVG 原始 kebab-case（"stroke-width" / "stroke-linecap" / "stroke-linejoin" / class），
    // React 16 会逐条报「Invalid DOM property ... Did you mean ...?」。
    // 只替换「后面紧跟 lucide lucide- 类名」的那三处内联图标，绝不碰：
    //   · 上面属性名→属性名 的映射表（React 自身用的）
    //   · setAttribute("stroke-width", ...) 这种原生 DOM 写法（本来就该 kebab-case）
    // 三处都紧挨在一起、文字完全一致，直接整体替换即可。
    const Q = String.fromCharCode(34); // 双引号
    const KEBAB_OLD = Q + 'stroke-width' + Q + ':' + Q + '2' + Q + ',' +
        Q + 'stroke-linecap' + Q + ':' + Q + 'round' + Q + ',' +
        Q + 'stroke-linejoin' + Q + ':' + Q + 'round' + Q + ',class:' +
        Q + 'lucide lucide-';
    const KEBAB_NEW = 'strokeWidth:' + Q + '2' + Q + ',strokeLinecap:' + Q + 'round' + Q +
        ',strokeLinejoin:' + Q + 'round' + Q + ',className:' + Q + 'lucide lucide-';
    const kebabCount = out.split(KEBAB_OLD).length - 1;
    if (kebabCount > 0) {
        out = out.split(KEBAB_OLD).join(KEBAB_NEW);
        report.push('OK   内联 SVG 属性已归一化（' + kebabCount + ' 处 kebab-case → camelCase）');
    } else {
        report.push('SKIP 内联 SVG 属性：未找到 kebab-case 锚点（原版可能已修）');
    }

    return {src: out, report};
}

/**
 * 把工具名映射到 window.__extEditorAI 上的实现。
 * __extEditorAI 由 ExtensionBuilder.jsx 挂载，是扩展编辑器的唯一对外操作面。
 */
export function installExtEditorToolHost() {
    if (typeof window === 'undefined') return;
    if (window.__extEditorAiToolHost) return;

    const dispatch = (name, args) => {
        const api = window.__extEditorAI;
        if (!api || typeof api[name] !== 'function') {
            return {
                success: false,
                error: '扩展编辑器 API 尚未就绪（缺少 __extEditorAI.' + name + '）。请确认编辑器已完全加载后重试。'
            };
        }
        try {
            const r = api[name](args || {});
            return r === undefined ? {success: true} : r;
        } catch (e) {
            return {success: false, error: String((e && e.message) || e)};
        }
    };

    const host = {};
    EXT_EDITOR_TOOLS.forEach((t) => {
        const name = t.function.name;
        host[name] = (args) => dispatch(name, args);
    });
    window.__extEditorAiToolHost = host;
}
