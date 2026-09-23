/**
 * adapt-bundle.js —— Bilup Nova（novatheai）原始 bundle 的「本项目适配」改写层
 * ════════════════════════════════════════════════════════════════════════
 * 原版 Bilup Nova 假设自己跑在「TurboWarp / Scratch 运行时」里，所以：
 *   - 系统提示词说它在 Bilup(Scratch environment)，要求它去「安装内置扩展」；
 *   - getProjectOverview / listFiles 读的是 Scratch 项目的 sprites / costumes；
 *   - installExtension 依赖 vm.extensionManager.loadExtensionURL。
 * 而本宿主是「scratch扩展编辑器」——一个**制作**扩展的网页工具（自定义积木 +
 * 实现 + 导出），**没有 Scratch VM**。于是原版工具一调用就报
 * "Scratch VM extensionManager.loadExtensionURL is not available"。
 *
 * 这里不改动 1.6MB 的 bundle 源文件本身，而是在 eval 之前对它做两类改写：
 *   1) 换掉那条英文 system prompt → 面向本编辑器的中文提示词；
 *   2) 在依赖 VM 的工具方法体开头注入 return，改走宿主 API window._extBuilderAI
 *      （由 components/ExtensionBuilder.jsx 暴露：读写积木定义/变量/扩展信息/代码）；
 *   3) 改写工具 schema 的 description，让模型看到的就是本编辑器语境。
 *
 * 之所以用「字符串外科手术」而不是重写方法，是因为 bundle 是压缩产物，
 * 在方法体首行插入短路分支是最小侵入、且不受压缩变量名影响的做法。
 *
 * 本模块不依赖任何外部模块，纯字符串函数，可直接在 Node 里离线单测。
 */

// 本编辑器的系统提示词（替换 bundle 内那条英文 prompt）
const AI_SYSTEM_PROMPT = [
    '你是「scratch扩展编辑器」（Scratch / TurboWarp 扩展编辑器）内置的 AI 助手，帮助用户**制作和修改 Scratch 扩展**。',
    '',
    '## 你在哪里（重要）',
    '你运行在一个**网页版扩展开发工具**里。用户用它把「自定义积木 + 实现代码」打包成一个 TurboWarp 扩展（.js），再导入 TurboWarp 使用。',
    '⚠️ 这里**不是** Scratch 运行时，**没有 Scratch VM**：不要尝试「安装/搜索 Scratch 内置扩展」，那在本环境不存在也不适用（原版工具的 installExtension 会直接失败）。',
    '用户说的「制作一个扩展」「做一个简单扩展」= 在编辑器里**定义积木**并说明/搭出**实现**。',
    '',
    '## 编辑器的核心概念',
    '- 一个扩展 = 一组「积木定义」+ 每块积木的「实现」。',
    '- 积木定义字段：name（显示名）、blockType（command 命令块 / hat 帽子块 / reporter 返回值椭圆 / Boolean 布尔六边形 / C C 形块）、',
    '  parts（积木面板文案与参数，数组：{kind:"text",value:"文本"} 文本片段、{kind:"input",name:"参数名",inputType:"String"|"Number"} 参数）、',
    '  colour（可选，形如 #4C97FF）、isAsync（异步积木）、isTerminal（终止积木）。',
    '',
    '### ⚠️ 积木类型选择指南（非常重要）',
    '一个扩展通常需要**混合使用多种积木类型**，不要全部用同一种。根据功能选择正确的类型：',
    '- **command（命令块）**：执行动作但不返回值。如「移动 [steps] 步」「说 [message]」。',
    '- **reporter（报告器/椭圆）**：返回一个值，可嵌入其他积木的输入。如「当前时间」「[a] 加 [b]」。',
    '- **Boolean（布尔/六边形）**：返回 true/false，用于条件判断。如「按下 [key] 键？」「碰到 [color]？」。',
    '- **hat（帽子块/事件）**：事件触发入口，放在脚本顶部。如「当收到 [message]」「当 [condition]」。',
    '- **C（C 形块/控制）**：包含内部空间，可包裹其他积木。如「重复 [n] 次」「如果 [condition] 则」。',
    '  C 形块需用 nextStatement/previousStatement 搭建内部逻辑。',
    '',
    '示例：一个「数学工具」扩展应该包含：reporter 类的「[a] 加 [b]」、Boolean 类的「[a] 大于 [b]？」、command 类的「设置 [var] 为 [value]」。',
    '示例：一个「游戏控制」扩展应该包含：hat 类的「当按下 [key]」、command 类的「移动 [dir]」、Boolean 类的「碰到 [target]？」。',
    '',
    '- 变量：工程级变量列表，会被注入到生成的实现代码中。',
    '- 实现：每块积木的实现由画布上的 Scratch 积木搭成，编辑器据此生成 JS。',
    '- 导出：编辑器把扩展信息 + 生成代码打包成 TurboWarp 扩展 JS。',
    '',
    '## 可用工具在本编辑器里的含义',
    '【读】',
    '- getProjectOverview：读取当前扩展概览（扩展信息 / 积木列表 / 变量 / 生成代码长度）。**开工前先调用**。',
    '- listFiles / listBlocks：列出当前扩展的积木定义（积木清单）。',
    '- getExportCode：读取当前扩展导出的完整 TurboWarp 扩展 JS 代码。',
    '- searchBlocks / getBlockHelp / getScratchGuide：查询 Scratch 积木的 opcode 与用法——用于给积木搭实现时选对积木。',
    '【写 · 直接用它们制作扩展】',
    '- defineBlock：**新增一块积木**。传 name（面板文字，参数位置写成 [参数名]，如「移动 [steps] 步」）、',
    '  blockType（command/hat/reporter/Boolean/C）、parts（面板片段数组：{kind:"text",value:"文字"} 或 {kind:"input",name:"steps",inputType:"Number"}）、',
    '  可选 colour（#RRGGBB）、isAsync（含 await 的异步积木）。**这是"制作扩展"的主力工具**。',
    '- updateBlockDef：修改已有积木（传 id + 要改的字段），用于改名、换类型、加参数、改颜色。',
    '- deleteBlockDef：删除积木（传 id）。',
    '- setExtensionInfo：设置扩展信息（name/description/author/color1/id）。',
    '- addVariable：新增工程级变量（name + type）。',
    '- addImplementationBlocks：**给积木搭实现**（传 id + xml）。xml 是 scratch-blocks 积木片段，',
    '  例如让积木「移动 10 步」：',
    '    <block type="motion_movesteps"><value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block>',
    '  串联多块用 <next>：第一块的 </block> 前插 <next>…第二块…</next>。',
    '  规则：实现必须以**语句积木**（command / C 形）开头；reporter / Boolean 这类返回值积木要放进 <value> 当输入，不能直接串。',
    '  输入的名字（如 STEPS / MESSAGE / CONDITION）与字段名（如 NUM / TEXT）**务必先用 describeBlock 核对**，',
    '  或用 searchBlocks / getBlockHelp 查；写错输入名会被 Blockly 静默忽略（积木变空壳），',
    '  addImplementationBlocks 会预校验并回报合法名字、同时取消本次插入。',
    '- clearBlockImplementation：**清空某块积木的实现**（搭错了要重来时用，然后重新 addImplementationBlocks）。',
    '- describeBlock：查询某积木类型的**合法输入名 / 语句输入名 / 字段名**（写 XML 前先问它）。',
    '- listAvailableBlocks：**列出本编辑器工具箱里真实可用的积木**（按分类，带合法输入名与推荐默认影子）。',
    '  ⚠️ 本编辑器只支持工具箱里的积木；想用某个积木前先在这里查（或 describeBlock 核对），',
    '  不要凭 Scratch 通用文档猜（诸如造型/角色/画笔/音乐等其它扩展的积木在本编辑器里可能不存在）。',
    '- getBlockImplementationXml：读取某块积木的工作区 XML 快照（确认已有实现 / 参照 XML 写法）。',
    '- validateExtension：**自检**。校验导出 JS 能否通过语法解析，并列出没有实现/没进代码的积木。',
    '  **建完积木与实现后必须调用它**：若返回 ok:false 或 missingImplementations 非空，先修好再告诉用户完成。',
    '【不适用】',
    '- searchExtensions / installExtension：**在本编辑器中不适用**（这里没有 Scratch 运行时，也没有"内置扩展"可装）。',
    '  若用户想增加功能，请直接用 defineBlock 定义积木，而不是安装扩展。',
    '',
    '## 收到「制作一个扩展」这类需求时的工作流程',
    '1. 先调用 getProjectOverview 看清现状（已有积木、变量、扩展信息）。',
    '2. 用自然语言把方案讲清楚：扩展叫什么、有哪几块积木、每块做什么、参数是什么。**注意混合使用不同积木类型**（command/reporter/Boolean/hat/C），不要全用同一种。',
    '3. 用 setExtensionInfo 设定扩展名称与描述。',
    '4. 用 defineBlock **逐块真正创建积木**（给出 name / blockType / parts / 颜色）。每块积木根据功能选择正确的 blockType。',
    '5. 需要变量时用 addVariable。',
    '6. 用 addImplementationBlocks **给每块积木搭上实现**（查准 opcode 与输入名后用 XML 插入）。⚠️ 必须使用真实积木（control_if、operator_*、math_*、variables_*、looks_say 等），不要用 extra_rawCode（原始代码）！',
    '7. **必须用 validateExtension 自检**；若报语法错误或 missingImplementations 非空，先修好。',
    '   修实现时：可先 clearBlockImplementation 清空，再用 addImplementationBlocks 重搭，然后重新自检。',
    '8. 用 getBlockImplementationXml 或 getExportCode 复核实现确实生效。',
    '9. 告诉用户：积木与实现已建好，可在画布上继续微调，然后点右上角「导出」得到扩展 .js 文件并在 TurboWarp 里加载。',
    '',
    '重要：不要只在回复里"描述"积木，而要**真的调用 defineBlock / addImplementationBlocks 把它们建出来**，否则用户的工作区不会发生任何变化。',
    '',
    '## 语言与风格',
    '- 使用与用户最新消息相同的语言；不确定时用简体中文。',
    '- 回答简明、分步骤、可执行；不要输出与 Scratch 运行时相关的无关操作。',
    '',
    '## 实现 XML 常用模板（直接复制改参数即可）',
    '',
    '### 1. 简单命令：说文字',
    '```xml',
    '<block type="looks_say"><value name="MESSAGE"><shadow type="text"><field name="TEXT">Hello!</field></shadow></value></block>',
    '```',
    '',
    '### 2. 如果（条件积木 + 语句内部）',
    '```xml',
    '<block type="control_if">',
    '  <value name="COND">',
    '    <block type="operator_equals">',
    '      <value name="A"><block type="variables_get"><field name="VAR">score</field></block></value>',
    '      <value name="B"><shadow type="math_number"><field name="NUM">100</field></shadow></value>',
    '    </block>',
    '  </value>',
    '  <statement name="DO">',
    '    <block type="looks_say"><value name="MESSAGE"><shadow type="text"><field name="TEXT">你赢了！</field></shadow></value></block>',
    '  </statement>',
    '</block>',
    '```',
    '',
    '### 3. 如果否则',
    '```xml',
    '<block type="control_ifElse">',
    '  <value name="COND">',
    '    <block type="math_compare">',
    '      <field name="OP">GT</field>',
    '      <value name="A"><block type="variables_get"><field name="VAR">hp</field></block></value>',
    '      <value name="B"><shadow type="math_number"><field name="NUM">0</field></shadow></value>',
    '    </block>',
    '  </value>',
    '  <statement name="DO">',
    '    <block type="looks_say"><value name="MESSAGE"><shadow type="text"><field name="TEXT">存活</field></shadow></value></block>',
    '  </statement>',
    '  <statement name="ELSE">',
    '    <block type="looks_say"><value name="MESSAGE"><shadow type="text"><field name="TEXT">死亡</field></shadow></value></block>',
    '  </statement>',
    '</block>',
    '```',
    '',
    '### 4. 等待 N 秒',
    '```xml',
    '<block type="control_wait">',
    '  <value name="TIME"><shadow type="math_number"><field name="NUM">1</field></shadow></value>',
    '  <statement name="DO">',
    '    <block type="looks_say"><value name="MESSAGE"><shadow type="text"><field name="TEXT">等待结束</field></shadow></value></block>',
    '  </statement>',
    '</block>',
    '```',
    '',
    '### 5. 重复 N 次',
    '```xml',
    '<block type="control_repeat">',
    '  <value name="TIMES"><shadow type="math_number"><field name="NUM">10</field></shadow></value>',
    '  <statement name="SUBSTACK">',
    '    <block type="motion_movesteps"><value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block>',
    '  </statement>',
    '</block>',
    '```',
    '',
    '### 6. 当条件循环',
    '```xml',
    '<block type="control_while">',
    '  <value name="COND">',
    '    <block type="math_compare">',
    '      <field name="OP">LT</field>',
    '      <value name="A"><block type="variables_get"><field name="VAR">i</field></block></value>',
    '      <value name="B"><shadow type="math_number"><field name="NUM">10</field></shadow></value>',
    '    </block>',
    '  </value>',
    '  <statement name="DO">',
    '    <block type="variables_change"><field name="VAR">i</field><value name="DELTA"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block>',
    '  </statement>',
    '</block>',
    '```',
    '',
    '### 7. 串联多块（用 <next>）',
    '```xml',
    '<block type="variables_set"><field name="VAR">x</field><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value>',
    '  <next>',
    '    <block type="control_repeat">',
    '      <value name="TIMES"><shadow type="math_number"><field name="NUM">5</field></shadow></value>',
    '      <statement name="SUBSTACK">',
    '        <block type="variables_change"><field name="VAR">x</field><value name="DELTA"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block>',
    '      </statement>',
    '    </block>',
    '  </next>',
    '</block>',
    '```',
    '',
    '### 8. 运算作为输入',
    '```xml',
    '<block type="variables_set">',
    '  <field name="VAR">result</field>',
    '  <value name="VALUE">',
    '    <block type="math_arithmetic">',
    '      <field name="OP">add</field>',
    '      <value name="A"><shadow type="math_number"><field name="NUM">1</field></shadow></value>',
    '      <value name="B"><shadow type="math_number"><field name="NUM">2</field></shadow></value>',
    '    </block>',
    '  </value>',
    '</block>',
    '```',
    '',
    '### 9. reporter 返回值（如返回正弦）',
    '```xml',
    '<block type="control_inlineReturn">',
    '  <value name="VALUE">',
    '    <block type="extra_rawCode"><field name="CODE">Math.sin(args.angle)</field></block>',
    '  </value>',
    '</block>',
    '```',
    '',
    '⚠️ 优先用真实积木（control_*、operator_*、math_*、variables_*、looks_*、motion_*）；',
    '仅当没有对应积木时才用 extra_rawCode 写原始代码。',
].join('\n');

// 工具 schema 描述改写（精确字符串 → 本编辑器语境；找不到则跳过，不影响运行）
const TOOL_SCHEMA_PATCHES = [
    [
        'List virtual Scratch project files, including writable stage/sprite JS files, writable SVG costume files, and read-only docs.',
        '列出当前扩展的积木定义（每块积木的名称、类型、参数、是否已有实现）。',
    ],
    [
        'Get a compact overview of Scratch targets, stage size/runtime options, virtual file paths, scripts, costumes, variables, and lists. Prefer this before reading full files when orienting.',
        '获取当前扩展项目概览：扩展信息（名称/ID/描述）、积木列表、变量、生成代码长度。开始工作前先调用它。',
    ],
    [
        'Search built-in and known remote Scratch/TurboWarp/Mist/SharkPool/Bilup extensions by ID, name, keyword, source, or URL stem. Use before installing extension blocks that are not already loaded.',
        '【本编辑器不适用】这里没有 Scratch 运行时，无法搜索/安装内置扩展。若要新增功能，请改用「定义积木」方案（名称/类型/参数）。',
    ],
    [
        'Install one built-in or known remote extension into the current Scratch VM, then return loaded extension blocks. External direct URLs require allowExternalUrl: true because remote extensions execute unsandboxed.',
        '【本编辑器不适用】本编辑器是「制作扩展」的工具，没有 Scratch VM，无法安装内置扩展。请改用「定义积木」方案来表达新功能。',
    ],
];

// 工具方法改写：在方法体首行短路，改走宿主 API（找不到锚点则跳过）
const TOOL_METHOD_PATCHES = [
    [
        'listFiles(){',
        'if(window._extBuilderAI&&window._extBuilderAI.listFiles)return window._extBuilderAI.listFiles();',
    ],
    [
        'getProjectOverview(){',
        'if(window._extBuilderAI&&window._extBuilderAI.getProjectOverview){' +
            'var _ai=window._extBuilderAI.getProjectOverview();' +
            '_ai.success=true;' +
            '_ai.files=(_ai.blocks||[]).map(function(b){return{path:"/blocks/"+b.id+".js",kind:"block",name:b.name,blockType:b.blockType};});' +
            'return _ai;}',
    ],
    [
        'async searchExtensions(){',
        'return {success:true,query:"",matchCount:0,matches:[],note:"本编辑器用于制作扩展（自定义积木+实现），没有 Scratch 运行时，因此不提供内置扩展搜索。若要新增功能，请用「定义积木」方案表达。"};',
    ],
    [
        'async installExtension(){',
        'return {success:false,error:"本编辑器是扩展开发工具（没有 Scratch VM），无法安装 Scratch 内置扩展。请改用「定义积木」的方式来描述要实现的功能。"};',
    ],
];

// 注入到工具 schema 数组 nb 开头的「写入类」工具（让 AI 真能制作扩展）
// 这些工具名与宿主 API window._extBuilderAI 上的同名函数一一对应。
const TOOL_SCHEMA_INJECTION =
    '{type:"function",function:{name:"listBlocks",description:"列出当前扩展的所有积木定义（名称、类型、参数、颜色、是否已有实现）。",parameters:{type:"object",properties:{}}}},' +
    '{type:"function",function:{name:"defineBlock",description:"在当前扩展中新增一块积木。name 是积木面板文字（如「移动 [steps] 步」，参数位置用 [参数名] 占位）。blockType 必须根据积木功能正确选择：command=执行动作无返回值（如「移动」「说」）；reporter=返回数值/字符串（椭圆形，如「当前时间」「[a]加[b]」）；Boolean=返回true/false（六边形，如「碰到[color]？」「按下[key]？」「[a]>[b]？」）；hat=事件触发入口（帽子形，如「当收到[msg]」「当绿旗被点击」）；C=包含内部空间的控制块（C形，如「重复[n]次」「如果[cond]则」）。parts 是面板片段数组，元素形如 {kind:\'text\',value:\'文字\'} 或 {kind:\'input\',name:\'steps\',inputType:\'Number\'}（inputType 取 String 或 Number）；colour 可选，形如 #4C97FF；isAsync 可选布尔。⚠️ 一个扩展应混合使用多种类型，不要全用同一种。",parameters:{type:"object",properties:{name:{type:"string"},blockType:{type:"string"},parts:{type:"array",items:{type:"object"}},colour:{type:"string"},isAsync:{type:"boolean"},isTerminal:{type:"boolean"}},required:["name"]}}},' +
    '{type:"function",function:{name:"updateBlockDef",description:"修改已有积木定义。必须传 id，以及要修改的字段（name / blockType / parts / colour / isAsync / isTerminal）。",parameters:{type:"object",properties:{id:{type:"string"},name:{type:"string"},blockType:{type:"string"},parts:{type:"array",items:{type:"object"}},colour:{type:"string"},isAsync:{type:"boolean"},isTerminal:{type:"boolean"}},required:["id"]}}},' +
    '{type:"function",function:{name:"deleteBlockDef",description:"删除指定积木定义（扩展至少保留一块积木）。",parameters:{type:"object",properties:{id:{type:"string"}},required:["id"]}}},' +
    '{type:"function",function:{name:"setExtensionInfo",description:"设置扩展信息：name 扩展名称、description 描述、author 作者、color1 主题色（#RRGGBB）、id 扩展 ID（仅小写字母数字）。",parameters:{type:"object",properties:{name:{type:"string"},description:{type:"string"},author:{type:"string"},color1:{type:"string"},id:{type:"string"}}}}},' +
    '{type:"function",function:{name:"addVariable",description:"新增一个工程级变量。name 变量名；type 取 EMPTY/STRING/NUMBER/BOOLEAN/LIST/VECTOR。",parameters:{type:"object",properties:{name:{type:"string"},type:{type:"string"}},required:["name"]}}},' +
    '{type:"function",function:{name:"addImplementationBlocks",description:"给指定积木的「实现」区插入积木（AI 真正搭出实现的主力工具）。id 为积木 id；xml 为 scratch-blocks 积木片段。⚠️ 优先使用真实积木（control_if/control_ifElse/control_wait/control_repeat/control_while/operator_equals/operator_math_compare/math_arithmetic/variables_set/variables_get/looks_say 等）来构建实现，不要用 extra_rawCode（原始代码）块！只有当工具箱里没有对应积木时才用 rawCode。例如：if条件用 control_if（COND=条件 Boolean，DO=内部语句）；比较用 math_compare（OP=GT/LT/EQ，A/B=输入）；循环用 control_repeat（TIMES=次数，SUBSTACK=内部语句）；变量赋值用 variables_set。可用 <next> 串联多块；实现必须以语句积木（command/C 形）开头，返回值积木（reporter/Boolean）要放进 <value> 里当输入。",parameters:{type:"object",properties:{id:{type:"string"},xml:{type:"string"}},required:["id","xml"]}}},' +
    '{type:"function",function:{name:"getBlockImplementationXml",description:"读取某块积木当前的工作区 XML 快照（含它的定义与实现），用于确认已有实现或参照积木 XML 写法。",parameters:{type:"object",properties:{id:{type:"string"}},required:["id"]}}},' +
    '{type:"function",function:{name:"describeBlock",description:"查询某个 Scratch 积木类型的合法输入名/语句输入名/字段名。写实现 XML 前先用它核对，避免输入名写错（写错会被静默忽略、积木变空壳）。",parameters:{type:"object",properties:{type:{type:"string",description:"积木类型，如 motion_movesteps、looks_say、control_if、data_setvariableto。"}},required:["type"]}}},' +
    '{type:"function",function:{name:"clearBlockImplementation",description:"清空某块积木的「实现」（搭错了要重来时用，配合 addImplementationBlocks 重新搭）。id 为积木 id。",parameters:{type:"object",properties:{id:{type:"string"}},required:["id"]}}},' +
    '{type:"function",function:{name:"validateExtension",description:"自检：校验当前扩展导出的 JS 能否通过语法解析，并列出没有实现、没进代码的积木。建完积木与实现后应当调用它自我核对。",parameters:{type:"object",properties:{}}}},{type:"function",function:{name:"listAvailableBlocks",description:"列出本编辑器工具箱里真实可用的积木（按分类），含每块的 type、面板文字、合法输入/字段名与推荐默认影子。想找积木时先查这里，不要凭 Scratch 通用文档猜（本编辑器只支持其中一部分）。",parameters:{type:"object",properties:{query:{type:"string",description:"可选关键词，匹配积木 type 或面板文字，如 移动 / wait / string。"},category:{type:"string",description:"可选分类名，如 事件/控制/运算/字符串/变量/函数/运行时/目标/浏览器/音乐。"}},}}},' +
    '{type:"function",function:{name:"getExportCode",description:"读取当前扩展导出的完整 TurboWarp 扩展 JS 代码。",parameters:{type:"object",properties:{}}}},';

// 工具 schema 数组 nb 的注入锚点（数组第一个元素之前）
const NB_ANCHOR = 'nb=[{type:"function",function:{name:"listFiles"';

// 工具调用守卫的注入锚点：让「宿主 API 上的同名函数」可直接作为工具调用，
// 从而不必把新工具塞进 bundle 内部被压缩的 class 里。
const GUARD_ANCHOR = '$g=async(e,t,n)=>{';
const GUARD_INJECTION =
    'if(window._extBuilderAI&&typeof window._extBuilderAI[t]==="function")return window._extBuilderAI[t](n);';

// 替换 bundle 内那条英文 system prompt（单引号字符串，需正确处理转义）
function patchSystemPrompt(src) {
    const marker = 'role:"system",content:\'';
    const at = src.indexOf(marker);
    if (at < 0) return src;
    const start = at + marker.length;
    // 从内容起点扫描到未转义的结束单引号
    let i = start;
    let end = -1;
    while (i < src.length) {
        const ch = src[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === "'") { end = i; break; }
        i++;
    }
    if (end < 0) return src;
    const escaped = AI_SYSTEM_PROMPT
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, '\\n');
    return src.slice(0, start) + escaped + src.slice(end);
}

// 替换工具 schema 描述
function patchToolSchemas(src) {
    let out = src;
    TOOL_SCHEMA_PATCHES.forEach((patch) => {
        const from = patch[0];
        const to = patch[1].replace(/"/g, '\\"');
        if (out.indexOf(from) < 0) return;
        out = out.split(from).join(to);
    });
    return out;
}

// 在工具方法体首行注入短路 return
function patchToolMethods(src) {
    let out = src;
    TOOL_METHOD_PATCHES.forEach((patch) => {
        const anchor = patch[0];
        const inject = patch[1];
        const idx = out.indexOf(anchor);
        if (idx < 0) return;
        const at = idx + anchor.length;
        out = out.slice(0, at) + inject + out.slice(at);
    });
    return out;
}

// 注入「写入类」工具 schema（让 AI 知道可以新增/修改积木、设扩展信息、加变量）
function patchToolSchemasAdd(src) {
    const idx = src.indexOf(NB_ANCHOR);
    if (idx < 0) return src;
    const at = idx + 'nb=['.length;
    return src.slice(0, at) + TOOL_SCHEMA_INJECTION + src.slice(at);
}

// 让宿主 API 上的同名函数可直接作为工具调用（工具调用守卫的逃生口）
function patchToolGuard(src) {
    const idx = src.indexOf(GUARD_ANCHOR);
    if (idx < 0) return src;
    const at = idx + GUARD_ANCHOR.length;
    return src.slice(0, at) + GUARD_INJECTION + src.slice(at);
}

// 组合：源码 → 适配后的源码
function adaptNovaBundle(src) {
    let out = src;
    try {
        out = patchSystemPrompt(out);
    } catch (e) { console.warn('[AI] 系统提示词替换失败，沿用原版', e); }
    try {
        out = patchToolSchemas(out);
    } catch (e) { console.warn('[AI] 工具描述替换失败', e); }
    try {
        out = patchToolSchemasAdd(out);
    } catch (e) { console.warn('[AI] 写入类工具注入失败', e); }
    try {
        out = patchToolGuard(out);
    } catch (e) { console.warn('[AI] 工具守卫注入失败', e); }
    try {
        out = patchToolMethods(out);
    } catch (e) { console.warn('[AI] 工具方法改写失败', e); }
    return out;
}

// 取出注入的工具名列表（供运行时自检：这些名字必须与宿主 API 上的函数逐一同名）
function getInjectedToolNames() {
    try {
        // eslint-disable-next-line no-new-func
        const arr = new Function('return [' + TOOL_SCHEMA_INJECTION.replace(/,\s*$/, '') + ']')();
        return arr.map((t) => (t && t.function && t.function.name) || '').filter(Boolean);
    } catch (e) {
        return [];
    }
}

export {
    adaptNovaBundle,
    patchSystemPrompt,
    patchToolSchemas,
    patchToolSchemasAdd,
    patchToolGuard,
    patchToolMethods,
    getInjectedToolNames,
    AI_SYSTEM_PROMPT,
    TOOL_SCHEMA_PATCHES,
    TOOL_METHOD_PATCHES,
    TOOL_SCHEMA_INJECTION,
};
