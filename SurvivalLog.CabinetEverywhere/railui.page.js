/* CERail 储物侧栏 —— 游戏内 WebView 注入版（railui.page.js）。
   fork 自 design-proto/rail.js（v12 定稿原型），按计划分任务移植：
   v1.8.3（作者 2026-10-31 执行令「把背包、取用、整理物资三个界面改了」＝原型 v13.2/v13.3 落地）：
       **BackpackUI 页转原生模式**——B 键单独背包 / 开柜双背包（整理物资）两形态都不再装配
       rail/plainbag，官方页整页原生；mod 仅注入原生改造 CSS（style#srNativeBp）三点：
       ①格区高度滚动（max-height+overflow+content-box+行末 padding：滚动条加在官方
       inline 宽度之外，不压格——原型 live-sbfix 实证几何）；②柜侧（.bag-panel.is-storage）
       隐藏负重条（背包侧保留）；③列数=官方数据原生（12 列统一涉柜宽数据层改写=存档级
       变更，仍待作者拍板 CabinetSize 重启用/内建，本版不动）。挂在该页 rail 上的
       跨柜页签/搜索/一键入库随之不在本页出现（作者看原型定稿）；rackOpen/forge/官方
       SORT 刷新等机关无 rail 自行休眠，MaterialRack 等 11 页维持 v1.8.2.5。
   v1.8.2（全场景壳架构收口，2026-10-31，UI-SPEC v13「动作保真总纲」版）：**壳+官方 DOM
       原件，12+1 场景无例外**——①机器页 10 页：宿主替换（壳占官方面板原位）+ SCENES.grid
       指向官方物品格容器，替换【前】取引用、appendChild 移动节点进壳 body：id/官方监听/
       官方渲染通道全保留（拖拽进机器槽/左键详情/右键快转=官方代码在官方节点上跑）；
       ②整理柜（v13 对 v11/v12 自研双面板/自绘格/复刻按钮三要素的显式推翻）：官方
       #rackSystem 整体移除，壳内**作用域容器继承 id=rackSystem+class=rack-system**（官方
       scoped 查询/groundDock/createViewportFit('.rack-system') 测量/飞行动画定位全继续工作），
       三段=左官方 .bag-panel 原件（panelA 负重+官方背包格）+ 中官方 .transfer-controls 原件
       （btnPutAll/btnTakeAll 官方监听）+ mod 三增值按钮 + 右 rail 壳（chrome+#panelB 官方
       汇总行面板进 srGridHost+#flyLayer）；③跨柜=rackOpen：C# 重放官方 Ac_MaterialRack_Open
       动作（SendAction 通道，PreDisasterSpeed/ToolTablePruner 同款先例）→ State_Web_MaterialRack
       整体重绑 → 官方行组件原生重渲染目标柜（rackrows 行拖拽/右键取1/锁定/取出最多/官方
       PUT_ALL·TAKE_ALL 作用于切换后柜，全原生）；④列表=纯汇总只读（行零事件）；mod 自有
       交互只剩壳 chrome + 页脚批量（tidy/storeAll）+ 中段三按钮 + rackOpen。
       崩溃防御（normRows/索引守卫/ctnById 双口径/render try-catch，缺陷①）；壳体不透明底
       （缺陷②）；格尺寸=官方自带（缺陷⑥）；行右键取1 mod 语义退役（§4.8=官方原生）。
   v1.8.1（已被 v1.8.2 取代）：beside 旁挂方案——实机版式不及格（侧栏挤扁/压 HUD），作者否决；
       崩溃防御/列表口径/不透明底成果沿用。
   v1.8.0（已被 v1.8.2 取代）：自绘格全替换路线——官方动作全灭（六缺陷④⑤），作者总裁决
       「动作保真总纲」（UI-SPEC §0）后全面退役；RailData/RailCommands 数据与命令通道保留
       （过滤/汇总元数据 + 新增整柜批量动作的合法层）。
   T2=骨架（__CERAIL__ 契约壳 + SCENES 场景表）；T3=渲染层（契约 v4→store/渲染）；
   T4=视图态（搜索/标签/排序/分段/场景态/五键持久化）；
   T5=▾容器菜单/✎编辑弹窗/页签拖拽 + 命令排队（无乐观刷新，等回包）。
   T10（v1.8.2 重写）= 整理柜三段壳：mount rack 装配（官方件 reparent，见上）+
       renderMidChips（按标签色点随 st.currentId 联动）+ bindMid（mod 三按钮
       takeCat·putCat·putTag 命令化/分类下拉 catsOf/点外 Esc 收起）+ 快照差工具
       （armXfer/settleXfer，T11/T12 复用）。自绘背包面板（BAGPANEL_HTML/renderBagPanel/
       bindBagPanel 右键 put/take 单件语义）已随 v13 总纲退役删除。
   T11= 一键入库（确认前置 + storeAll + 差量汇总 toast）；T12= 一键整理（tidy + 差量 toast +
       ctx.lastTidyFail 降级）；T9= 官方联动（forge 切换/active 跟随/postMessage 包装链/
       A→B→A 重访重绑；v1.8.2：rack 族 active=rackOwnerId、切柜走 rackOpen 命令不走 forge）；
   T8= 正式装配（Root 侧扫描/观察器/宿主替换/复活重装配；rack 场景宿主复活判定=
       「存在不带 data-sr-scope 的 #rackSystem」——作用域容器继承宿主 id 的特判）。
   契约（harness 与 C# 共用）：window.__CERAIL__ = {
     ver:1, setData(json), drain() -> '[]'（待执行命令 JSON 数组字符串）,
     cmd(op, payload), mount(doc, sceneKey), state（只读视图态） }
   cmd 命令契约（T5 冻结 + v1.8.2 增删，RailCommands.cs 照此实现——命令名与负载字段一字不差；
   drain 取走的数组每项 = {op 与 payload 平铺}，字段序 op 在前）：
     {op:"rackOpen",  owner}                                 整理柜跨柜：C# 重放官方
                                                             Ac_MaterialRack_Open.SendAction → 官方
                                                             state 重绑 → 行组件原生重渲染（v13）
     {op:"takeAll",  from}  /  {op:"putAll", to}            整容器互转（中段 mod 三按钮的分类路复用）
     {op:"takeCat",  from, cat:catId}  /  {op:"putCat", to, cat:catId}   分类互转（中段 mod 按钮）
     {op:"putTag",   to}                                     按右侧柜标签放入（中段 mod 按钮）
     {op:"tidy",     owner}                                  一键整理（页脚；失败时 C# 经
                                                             ctx.lastTidyFail 一次性标志回传）
     {op:"storeAll", order:[ownerId...]}                     一键入库（页脚；order=柜子页签顺序）
     {op:"rename",   owner, name}                            容器改名（✎ 弹窗保存）
     {op:"setTags",  owner, tags:[tagId...]}                 容器官方标签（✎ 弹窗保存；只收官方 tagId——
                                                             自定义词走 srp_ctn_tags JS 侧 overlay，
                                                             不参与 C# 入库路由，见 T5 fix-2）
   （v1.8.0 的 take/put 单件 op 随自绘格右键语义退役——JS 不再发出；C# 执行器保留无害。） */
(function () {
  if (window.__CERAIL__) return; /* 幂等：C# 重复注入 / 页面重复引脚本只生效一次 */

  /* 版式常量（同原型）：428px 侧栏内 10×34px + 9×6px = 394px 恰好铺满。
     所有容器一律 10 列，扩容只增加行数（纵向滚动）。 */
  var COLS = 10, SLOT = 34, GAP = 6;
  var UNI_W = 700; /* Bug2 宽度归一：格区恒定宽（16 列 × ~40px 视觉），壳宽=UNI_W+20 */
  /* 格子尺寸跟官方（缺陷⑥，v1.8.1）：SCENES.cell = 逐页官方源码取证值
     （Brew/Dye 38、Cooking/RatCage/DroneHub/Compressor/Greenhouse 40、Shredder 45、
     ToolTable/Trade/BackpackUI 56px），旁挂侧栏与 bagonly 生效；列数按 428 壳宽自适应。
     整理柜 duo 双面板保持 COLS=10×34 定版几何（该页官方格已整体替换，无对照物）。 */
  function slotOf(sc) { return (sc && sc.cell) || SLOT; }
  function colsOf(sc) { return Math.max(6, Math.floor((428 - 20) / (slotOf(sc) + GAP))); }
  /* 背包容量：契约 v4 的 ctn 不含背包（bag 只是 ownerId），背包格数不在数据里——
     照原型 40（10×4）起底；T4 起可被 ctx.bagCap（int>0）覆盖（契约增补字段，T6 推送，
     见 setData——读取逻辑先行就位，harness mock 已带该字段验证）。 */
  var BAG_CAP = 40;

  /* ================= v13.5-v13.8 机器界面简化+设施排序（作者 2026-10-31 执行令） =================
     9 个机器页（不含 BackpackUI 原生页/MaterialRack/温室 GreenhouseBuild）侧栏 plain：
     无头部/搜索/快捷标签/排序工具行/悬停条/「N 行」行；页脚=排序钮(食品五设施)+格数+入库|整理。
     食品五设施页脚左下角排序钮（作者参考图样式 7 项）；Trade 默认按交易价值排序。 */
  var PLAIN_KEYS = { Cooking: 1, BrewPanel: 1, RatCage: 1, Shredder: 1, Compressor: 1, DyePanel: 1, ToolTable: 1, Trade: 1, DroneHub: 1 };
  var FOOD_KEYS = { Cooking: 1, BrewPanel: 1, RatCage: 1, Compressor: 1, DyePanel: 1 };
  var FSORTS = [
    { k: 'official', label: '默认', ico: '⊞' },
    { k: 'sat', label: '饱腹', ico: '🍗' },
    { k: 'mind', label: '心态', ico: '🧠' },
    { k: 'en', label: '精力', ico: '⚡' },
    { k: 'hp', label: '生命', ico: '❤️' },
    { k: 'value', label: '交易价值', ico: '💲' },
    { k: 'shelf', label: '保质期', ico: '🕐' }
  ];
  var FBCOLOR = { sat: '#8fc06e', mind: '#b08fd6', en: '#6fc7c9', hp: '#e07ab0', value: '#f0b03c', shelf: '#f0b03c', tvalue: '#f0b03c' };
  var VFMap = { sat: 'v1', mind: 'v2', en: 'v3', hp: 'v5' }; /* 排序键 → icfg 字段（VD_MAP：v4 恒 0 不用） */

  /* 12 页场景表 —— host 选择器照 Task 1 取证表逐页抄录
     （docs/superpowers/plans/2026-10-30-cerail-spike-findings.md §6，模板标记已逐页核实）。
     '#anchor.closest(...)' 形态 = mount 期先按 id 锚点定位再向上取最近祖先（优先 id 锚点
     导航，比 first-of-type 抗页面迭代）；裸类选择器 = querySelector 文档序首个匹配。
     键 = 页面标识：10 页实测键即 iframe 元素 id；Trade 页 iframe id 实测 = 'Trade'（不是
     TradeUI）；BackpackUI/MaterialRack 两处 iframe id 为默认值（'Backpack'/'MaterialRack'），
     照抄取证结论并保留标注，T8/T9 首次注入校准。
     【不变量语义（T8 评审 Critical 定案）】host 选择器必须满足「替换即消亡」——宿主被
     rail 原位替换后选择器不得再命中任何节点，否则 ensureMounted 的「宿主未复活」判据
     （!resolveHost）恒假 → 观察器毫秒级把 rail 逐列搬家级联摘光官方面板（Trade 实锤：
     `.cols>.col` 3 命中，替换背包列后仍命中中列 → 级联到无命中，两官方列被毁）。裸选择器
     页以唯一命中为前提（root harness 断言 anchors==1），Trade 因运行时 3 个 .col 兄弟列
     特用 `:first-child` 收窄：替换后首子为 #srp（非 .col）→ 选择器归 null。
     【stubs（T9 评审 Critical，正交设计）】宿主替换后，官方页面自身 BagMsg 渲染段的 live
     $()/getElementById 解引用被摘节点 → 每条官方推送必抛 TypeError、中断 handler 后续
     逻辑（机器功能区显示冻结；五页评审实锤首抛点：Compressor $('tabs')、Shredder/
     GreenhouseBuild $('tabPinned')、MaterialRack $('wtText')、ToolTable applyLeftGrid 的
     'backpack-grid'；T9 评审揭露的 ToolTable StatusMsg 类查询无守卫解引用见下）。stubs =
     该页宿主子树内被官方 JS 查询的全部渲染目标（源码扫描全量：id 条目='$('x')/
     getElementById('x') 目标 ∩ 宿主内 [id] 集合；类名条目='.class' 形态，fix round 3 起
     支持——ToolTable '.weight-text'/'.weight-fill' 仅类名无 id、StatusMsg 无守卫解引用，
     其余 8 页类查询∩宿主复核零命中/全守卫，见 buildStubs 注释）。按 SCENES.stubs 声明
     驱动、不写死页名：宿主换成任何元素（如 T10 .sr-duo 替换 #rackSystem）同用同一机制；
     Vue 页（BackpackUI/Trade）宿主内无被查询目标 = 空列表不建桩。 */
  var SCENES = {
    /* v1.8.2 装配（全场景壳架构）：宿主替换（壳占官方面板原位）+
       grid=官方物品格容器（替换前取引用，appendChild 移动节点进壳 body——id/官方监听/
       官方渲染通道全保留：拖拽/左键详情/右键快转都是官方代码在官方节点上跑）。
       grid 官方 id 逐页源码取证：Cooking/RatCage backpackGrid、Brew/Dye/DroneHub bagGrid、
       Compressor/Shredder/Greenhouse cartGrid、ToolTable backpack-grid、Trade tradeBagGrid
       （Vue）、BackpackUI .grid-container（Vue，无 id）。MaterialRack=rack 三段壳（官方件
       reparent，见 mount rack 分支）。stubs 沿用 v1.8.0 实证表——自愈语义：reparent 后真节点
       仍在文档（官方查询照常命中）即不建桩，任一官方件抓取失败时兜底防 TypeError。 */
    BackpackUI:      { host: '.backpack-container', family: 'backpack', bagOnly: true, duo: false, native: true, grid: '.grid-container', stubs: [] }, /* iframe id 实测 'Backpack'（ID_ALIAS 归一）。v1.8.3：**原生模式（native:true）**——不装配 rail/plainbag（ensureNativeBp 注 style#srNativeBp：高度滚动+滚动条不压格+柜侧隐负重条）；v1.8.4：加 mod 按钮对（nbMount：⇅排序▾/📦一键入库 进官方 .toolbar 行左缘，UI-SPEC §0a-4；装配判据=ctx.bpBag，取用单柜不装）。host/grid/stubs 字段保留供旧 harness mount() 直调参考。列数=官方数据原生（12 列统一待数据层拍板） */
    MaterialRack:    { host: '.bag-panel:not(.is-storage)', family: 'rack', bagOnly: false, duo: false, plainBag: true, rackMid: true, grid: null, stubs: ['wtText', 'wtFill', 'previewLayer'] }, /* v1.8.2.5：**只替换左侧背包 .bag-panel**→简洁背包栏（plainbag）；官方转移列（2 原件+mod 3 增值按钮 append）与右侧柜子面板（普通存储取物界面=官方行组件）原样不动。宿主「替换即消亡」成立（默认 alive）。stubs=随背包面板移除的官方查询目标兜底 */
    Cooking:         { host: "#bagTabs.closest('.panel')",       family: 'bag',      bagOnly: false, duo: false, grid: 'backpackGrid', stubs: ['bagPanelTitle', 'bagTabs', 'bagTabPinned', 'tabScrollLeft', 'bagTabsScroll', 'tabScrollRight', 'fridgeGuide', 'fridgeGuideBtn', 'sortBagBtn'] }, /* 文档第 1 个 .panel（@Cooking.html @881）；grid id 已从桩剔除（官方格进壳仍在文档，官方查询照常命中） */
    BrewPanel:       { host: "#bagTabs.closest('.col')",         family: 'bag',      bagOnly: false, duo: false, grid: 'bagGrid', stubs: ['bagTitleText', 'bagInfo', 'bagTabs', 'bagTabPinned', 'tabScrollLeft', 'bagTabsScroll', 'tabScrollRight'] }, /* 第 1 个 .col（@BrewPanel.html @263） */
    RatCage:         { host: "#bagTabs.closest('.panel')",       family: 'bag',      bagOnly: false, duo: false, grid: 'backpackGrid', stubs: ['bagTitleText', 'bagTabs', 'bagTabPinned', 'tabScrollLeft', 'bagTabsScroll', 'tabScrollRight', 'bagInfo', 'fillAllBtn', 'fillAllText', 'fillAllCnt', 'fillFoodBtn', 'fillFoodText', 'fillFoodCnt'] }, /* 第 1 个 .panel（@RatCage.html @251） */
    DyePanel:        { host: "#bagTabs.closest('.col.bag-col')", family: 'bag',      bagOnly: false, duo: false, grid: 'bagGrid', stubs: ['bagTitleText', 'bagInfo', 'bagTabs', 'bagTabPinned', 'tabScrollLeft', 'bagTabsScroll', 'tabScrollRight'] }, /* @DyePanel.html @317 */
    Compressor:      { host: '.cart',     family: 'cart0', bagOnly: false, duo: false, grid: 'cartGrid', stubs: ['tabs', 'weightSection', 'wfill', 'wtext', 'btnSortBag'] }, /* 唯一 .cart（@Compressor.html @440）；首抛 $('tabs')（renderTabs） */
    Shredder:        { host: '.cart',     family: 'cart',  bagOnly: false, duo: false, grid: 'cartGrid', stubs: ['tabPinned', 'tabLeft', 'tabsScroll', 'tabRight', 'weightSection', 'weightText', 'weightFill', 'cartRack', 'btnSortBag', 'btnQuickLoad'] }, /* 唯一 .cart（@Shredder.html @304）；首抛 $('tabPinned') */
    GreenhouseBuild: { host: '#cartPane', family: 'cart',  bagOnly: false, duo: false, grid: 'cartGrid', stubs: ['tabPinned', 'tabLeft', 'tabsScroll', 'tabRight', 'weightSection', 'weightLabel', 'weightText', 'weightFill', 'cartRack', 'btnSort', 'btnQuick', 'sideHint'] }, /* section.pane.cart（@GreenhouseBuild.html @267）；首抛 $('tabPinned') */
    ToolTable:       { host: '.backpack-panel', family: 'tt',    bagOnly: false, duo: false, grid: 'backpack-grid', stubs: ['tab-bag', 'tabScrollLeft', 'leftTabsScroll', 'tab-drawer', 'tabScrollRight', 'cabinetGuide', 'cabinetGuideBtn', 'rack-rows', 'bagToolbar', 'btn-sort-bag', '.weight-text', '.weight-fill'] }, /* 内含 .left-tabs 页签列（@ToolTable.html @1947）；首抛 applyLeftGrid 的 getElementById('backpack-grid')（@2610 无守卫 .style 解引用）；类桩 '.weight-text'/'.weight-fill'=StatusMsg 无守卫解引用（markup L1968/L1971 仅类名无 id） */
    Trade:           { host: '.cols>.col:first-child', family: 'trade', bagOnly: false, duo: false, grid: 'tradeBagGrid', stubs: [] }, /* 第 1 个 .col=背包列（@TradeUI.html @2518；:first-child 收窄防级联，T8 评审 Critical）；grid=Vue 格（移动后 Vue 按元素引用继续 patch） */
    DroneHub:        { host: '#paneMine',       family: 'bag',   bagOnly: false, duo: false, grid: 'bagGrid', stubs: ['bagTitleBar', 'bagTitleText', 'sortBagBtn1', 'bagTabs', 'bagTabPinned', 'tabScrollLeft', 'bagTabsScroll', 'tabScrollRight', 'sortBagBtn2', 'bagGridWrap', 'bagRackWrap', 'bagRack', 'bagCap', 'bagWeightLb', 'bagWeightBar', 'bagWeightNum', 'shiftHint'] }  /* section.pane.mine（@DroneHub.html @408） */
  };

  /* 侧栏 DOM 常量（每次切场景重建后重绑；控件入口各只有一个）——原样拷自 rail.js。 */
  var RAIL_HTML =
    '<div class="sr-head"><div class="sr-headtxt"><div class="sr-title" id="srTitle"></div>' +
    '<div class="sr-sub"><b id="srCols"></b><span id="srCap"></span><span id="srTags"></span></div></div></div>' +
    '<div class="sr-offtabs" id="srOffTabs" hidden></div>' + /* v1.8.2.2：BackpackUI aTabs 模式——官方柜签页签行原件搬入此槽（原生切换） */
    '<div class="sr-ctnbar"><div class="sr-pinrow" id="srPinRow"></div>' +
    '<button class="sr-allctn" id="srAllCtn" type="button" aria-label="全部容器" title="全部容器">▾</button></div>' +
    '<div class="sr-tradeinfo" id="srTrade" hidden></div>' +
    '<div class="sr-searchrow"><div class="sr-search">🔍 <input id="srSearch" type="text" placeholder="搜索物品" autocomplete="off"></div>' +
    '<button class="sr-scope" id="srScope" type="button" title="筛选范围：当前容器 / 全部容器">本柜</button></div>' +
    '<div class="sr-tagrow"><div class="sr-tags" id="srTagRow"></div>' +
    '<button class="sr-tagadd" id="srTagAdd" type="button" aria-label="添加筛选标签">＋</button></div>' +
    '<div class="sr-tools"><button class="sr-sortbtn" id="srSortBtn" type="button">⇅ <span id="srSortLbl"></span><span class="sb-caret">▾</span></button>' +
    '<button class="sr-dir" id="srDir" type="button" title="排序方向：高→低 / 低→高">↓</button>' +
    '<div class="sr-seg" id="srSeg"><button class="active" data-mode="grid" type="button">网格</button>' +
    '<button data-mode="list" type="button">列表</button></div></div>' +
    '<div class="sr-body" id="srBody"><div class="sr-gridhost" id="srGridHost"></div><div class="sr-list" id="srList" hidden></div></div>' +
    '<div class="sr-hover" id="srHover">悬停查看物品详情</div>' +
    '<div class="sr-foot"><button class="sr-act sr-fsort" id="srFoodSort" type="button" hidden title="排序：官方默认，或按属性排序（格子右上角显示数值）"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg><span id="srFoodSortLbl">排序</span><span class="sb-caret2" aria-hidden="true">▾</span></button>' +
    '<div class="sr-foot-l"><span id="srFill"></span><span class="fr" id="srView"></span></div>' +
    '<div class="sr-actrow">' +
    '<button class="sr-act primary" id="srStoreAll" type="button" hidden title="按物品分类自动放入带对应标签的柜子（柜满顺延，无匹配留在背包）">📦 一键入库</button>' +
    '<button class="sr-act" id="srTidy" type="button" title="同名叠合并，按分类归位"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>一键整理</button>' +
    '</div></div>' +
    '<div class="sr-toast" id="srToast" hidden></div>' +
    '<div class="sr-pop sr-popctn" id="srCtnPop" hidden><div class="sr-popbody" id="srCtnPopBody"></div></div>' +
    '<div class="sr-pop sr-popedit" id="srCtnEdit" hidden><div class="sr-pophead"><span>容器设置</span></div>' +
    '<div class="sr-popbody"><label class="sr-edit-lbl">名称</label><input id="srEditName" class="sr-edit-name" type="text" maxlength="8">' +
    '<label class="sr-edit-lbl">标签</label><div class="sr-tagwrap" id="srEditTags"></div></div>' +
    '<div class="sr-popfoot"><button class="sr-popclear" id="srEditCancel" type="button">取消</button>' +
    '<button class="sr-edit-save" id="srEditSave" type="button">保存</button></div></div>' +
    '<div class="sr-pop sr-popstore" id="srStoreConfirm" hidden><div class="sr-pophead"><span>一键入库</span></div>' +
    '<div class="sr-popbody" id="srStoreText"></div>' +
    '<div class="sr-popfoot"><button class="sr-popclear" id="srStoreCancel" type="button">取消</button>' +
    '<button class="sr-edit-save" id="srStoreGo" type="button">确认入库</button></div></div>' +
    '<div class="sr-pop" id="srTagManage" hidden><div class="sr-pophead"><span>筛选标签（点击启用，再点停用）</span>' +
    '<button class="sr-popclear" id="srTagManageX" type="button">完成</button></div>' +
    '<div class="sr-popbody"><div class="sr-tagwrap" id="srTagManageBody"></div>' +
    '<div class="sr-tm-add"><input id="srTagNew" type="text" placeholder="自定义标签（≤6字）" maxlength="6">' +
    '<button class="sr-popclear" id="srTagNewBtn" type="button">添加</button></div></div></div>' +
    '<div class="sr-pop sr-popsort" id="srSortPop" hidden><div class="sr-pophead"><span>排序方式</span></div>' +
    '<div class="sr-popbody" id="srSortPopBody"></div></div>' +
    '<div class="sr-pop sr-popfsort" id="srFootSortPop" hidden><div class="sr-popbody" id="srFootSortBody"></div></div>';

  /* 整理柜中段 mod 增值三按钮（v1.8.2 v13 口径）：「放入材料/全部取出」两按钮=官方
     #btnPutAll/#btnTakeAll **原件**（mount 时随官方 .transfer-controls reparent 进中段，
     官方监听原样，不在此复刻）；本串只含 mod 三个批量按钮——◀分类取出(下拉)/
     分类放入▶(下拉)/按标签放入+色点行，append 进官方 .transfer-controls 容器尾。
     按钮样式=页面自带官方 .transfer-btn（MaterialRack 样式表；BackpackUI 独有类
     category-dropdown/tag-putin/putin-row/spacer 在 railui.css fork 段）。
     id 与旧版逐字一致（srTakeCat/srTakeCatMenu/srPutCat/srPutCatMenu/srTagPutIn/srTagChips），
     行为 bindMid 接线（命令契约见文件头）。 */
  var MID_EXTRA_HTML =
    '<div class="transfer-controls-spacer"></div>' +
    '<div class="category-dropdown-wrapper">' +
    '<button class="transfer-btn category-dropdown-btn btn-dir-left" id="srTakeCat" type="button"><span class="btn-arrow">◀</span><span class="btn-label">分类取出</span></button>' +
    '<div class="category-dropdown" id="srTakeCatMenu" hidden></div></div>' +
    '<div class="category-dropdown-wrapper">' +
    '<button class="transfer-btn category-dropdown-btn btn-dir-right" id="srPutCat" type="button"><span class="btn-label">分类放入</span><span class="btn-arrow">▶</span></button>' +
    '<div class="category-dropdown" id="srPutCatMenu" hidden></div></div>' +
    '<button class="transfer-btn tag-putin-btn" id="srTagPutIn" type="button" title="按右侧柜子的标签规则放入（背包中分类命中标签的物品）">' +
    '<span class="putin-row" id="srTagChips"></span>' +
    '<span class="putin-row putin-main"><span class="btn-label">按标签放入</span><span class="btn-arrow">▶</span></span>' +
    '</button>';

  /* ================= T3 渲染层（数据契约 v4 → store/渲染） =================
     移植自 rail.js 的渲染函数区；数据源从原型假数据（POOL/CTN/ICTN）换为 setData 推来的
     契约 v4：ctn 行 [ownerId,名,kind,cap,tagId...]、lib 行 [tagId,名,dim,order,icon,color]、
     icfg 行 [cfgId,名,图标,trade,stack,catId,subCatId,分类名,life,v1..v5]、
     items 行 [logicId,cfgId,count,timeLeftSec,x,y,w,h,flags]（flags: bit0污染 bit1过期 bit2临期）。
     渲染层只读：一切转移走 cmd→C#→setData 回推（T5/T7），故无 rail.js 的 ICTN 可变缓存
     与 GCACHE 失效逻辑。 */

  /* ---- 数据仓（行归一化为对象；冻结形状见计划 Task 3 Interfaces）---- */
  var store = { rev: -1, ctx: null, bag: 0, ctn: [], lib: [], icfg: [], items: {} };
  var ICFG = {}; /* cfgId → 归一化 icfg（渲染高频查表） */
  var LIB = {};  /* tagId → 归一化 lib */
  var LIBN = {}; /* 标签名 → 归一化 lib（chips 色/组按名取；自定义名不在表内走自定义色） */

  /* 容器改名/容器自定义词的浏览器侧覆盖（§4.9 全局键 srp_ctn_names/srp_ctn_tags）：
     {ownerId: 值}——名字在 nm() 读取时覆盖（rail.js NAMES 同语义）；标签键自 T5 fix-2
     双层裁定起只存**自定义词** overlay（官方标签=C# 权威：cmd('setTags')→C# SetRule→
     契约回推，本地不再缓存 tagId 覆盖）。自定义词经 customTagsOf/tagNamesOf 并入容器
     标签视图（一处合并、四处消费：头部副标/▾ 菜单「自定义标签」组/全库命中/✎ 回显），
     不参与 C# 入库路由（storeAll/putTag 只按官方标签）。 */
  var NAMES = {};
  var CTAGS = {};
  /* 待执行命令队列（T5 冻结契约见文件头）：cmd 入队、C# drain 取走即清空 */
  var CMDQ = [];

  /* ---- 视图态（T4 接管：交互+持久化+场景态；形状与 rail.js st 一致）----
     tags/COMMON/CUSTOM 一律存「标签名字符串」（lib 标签名或自定义原文）——§4.4 命中=
     同名比对（物品分类名 icfg.catName / 来源容器标签经 lib 转名），chips 与管理弹层的
     data-* 也用名字，全链口径一致（原型即字符串口径；lib 同名行首行胜出）。
     scene 只由 mount(sceneKey)/ctx.page 经 applyScene 写入——分场景 localStorage 键
     （srp_*_<scene>）依赖它，mount 不同步就会错位成上一场景（T3 评审随行项①）。 */
  var st = {
    scene: null, currentId: null, mode: 'grid', prevMode: 'grid', sort: 'value', dir: 1,
    query: '', global: false, tags: [], sel: null,
    cap: 0, rows: 0, items: [],
    dragId: null, editId: null, editTags: []   /* T5：拖拽中页签/编辑弹窗容器与选中集（rail.js st 同形） */
  };
  var COMMON = [];     /* 快捷标签名字符串（默认=lib 前 5；持久化 srp_common_tags_<scene>） */
  var CUSTOM = [];     /* 自定义标签词表（全局 srp_custom_tags；管理弹层新增/移除维护） */
  var el = {};
  var LISTGRP = [];    /* 列表模式当前渲染的同名汇总行（右键按行取出用，T5 消费） */
  var PIN_KEY = '';    /* renderCtnBar 结构短路键（原地更新纪律，§4.10） */
  var sceneApplied = null; /* 已应用过场景态的 ctx.page（mount 先行时，首包 setData 补应用） */
  var RENDERED_ID = null;  /* 当前 rail 实际渲染出的容器（T9 防回环门：forge 回包到达时区分
                              「已渲染该柜」（幂等早退）与「currentId 已记下但未渲染」（补渲染）） */

  /* ---- 帧上下文快照（T9 落地，T8 遗留缺陷修复）----
     bind() 的 el 引用表是全局单套（旧缺陷）：A→B→A 重访时 A 的 rail 还在原位（宿主已被
     替换且未复活，resolveHost 归 null → ensureMounted 早退不重装配），el 却指向 B 的
     rail——A 帧冻结、setData 渲染进错误 rail。修复裁定（task-9）：el/渲染目标跟当前帧走；
     视图态（st/COMMON 等活跃集）按 sceneKey 切快照——重访重绑时换回该帧快照，筛选/页签态
     跟着帧走、不把 A 场景的筛选态渲染进 B。全局单套活跃集 + 每帧快照 = 与「单场景活跃」
     装配语义（frameVisible 门控，T8）一致的多帧安全形态。 */
  var SNAPS = {}; /* sceneKey → { st, COMMON, sceneApplied, PIN_KEY, TM_KEY, LISTGRP } */
  var ST_KEYS = ['scene', 'currentId', 'mode', 'prevMode', 'sort', 'dir', 'query', 'global', 'tags', 'sel', 'cap', 'rows', 'items', 'dragId', 'editId', 'editTags'];
  function saveSnap() {
    if (!st.scene || !SCENES[st.scene]) return;
    var sn = { st: {}, COMMON: COMMON.slice(), sceneApplied: sceneApplied, PIN_KEY: PIN_KEY, TM_KEY: TM_KEY, LISTGRP: LISTGRP };
    for (var i = 0; i < ST_KEYS.length; i++) {
      var k = ST_KEYS[i], v = st[k];
      sn.st[k] = Array.isArray(v) ? v.slice() : v; /* tags/editTags 数组隔离（快照不得被活跃集突变连坐） */
    }
    SNAPS[st.scene] = sn;
  }
  function loadSnap(key) {
    var sn = SNAPS[key];
    if (!sn) return false;
    for (var i = 0; i < ST_KEYS.length; i++) {
      var k = ST_KEYS[i];
      if (k in sn.st) { var v = sn.st[k]; st[k] = Array.isArray(v) ? v.slice() : v; }
    }
    COMMON = sn.COMMON.slice();
    sceneApplied = sn.sceneApplied;
    PIN_KEY = sn.PIN_KEY;
    TM_KEY = sn.TM_KEY;
    LISTGRP = sn.LISTGRP || [];
    RENDERED_ID = null; /* 保守：重绑后必有一次 render 落 RENDERED_ID（回包门在此之前恒「未渲染」） */
    return true;
  }

  /* 排序 6 键（rail.js 定稿）：映射照 Task 1 VD_MAP——
     交易价值=icfg.trade×count、保质期=items 行 timeLeftSec（排序用原值）、
     饱食=v1、生命=v5、精力=v3、心态=v2；v4 全表恒 0 弃用不进排序。 */
  var SORTS = [
    { k: 'value', label: '交易价值' }, { k: 'shelf', label: '保质期' }, { k: 'sat', label: '饱食度' },
    { k: 'hp', label: '生命' }, { k: 'en', label: '精力' }, { k: 'mind', label: '心态' }
  ];
  var GLOBAL_LIMIT = 300;
  /* 标签分组（三处一致：▾容器菜单/✎编辑弹窗/管理弹层）——dim 驱动可扩展：
     官方 Config_FurnitureTag 的 dim 语义（docs findings + TagFilter.cs 取证注释）：
     0=物资域（材料/工具/零件等）、1/2/3=食物细分行、4=食物全部行（1-4 合并=食品类），
     ≥5=功能域标签（种植/堆肥/染色/酿造等游戏机制标签，原型 TAG_GROUPS 第三组「功能类」
     同域——lib 出现 dim≥5 即落此组）。组显示名与色值照原型 TAG_GROUPS/GROUP_COLOR 观感；
     自定义词表组色 #C9915A（tagColor 兜底，见 tagColor）。扩展新域 = 追加一行 {g,color,min,max}。 */
  var LIB_GROUPS = [
    { g: '食品类', color: '#A3B550', min: 1, max: 4 },   /* dim 1/2/3 细分行 + 4 全部行 */
    { g: '材料类', color: '#7AA2D6', min: 0, max: 0 },   /* dim 0 物资域 */
    { g: '功能类', color: '#6FC7C9', min: 5, max: 9999 } /* dim ≥5 功能域（种植/堆肥/染色/酿造…） */
  ];
  /* 分类色环：slotHtml 的 s-dot 分类点。原型用 CAT_COLORS[分类名]（6 类小表）；
     正式版分类来自 icfg.catId（ItemCategory 枚举 23 项），写死 23 色环按 catId 取模映射
     （catId 超界也安全回环），色值取原型 CAT_COLORS/GROUP_COLOR 的低饱和系观感。 */
  var CAT_RING = ['#b0a89a', '#8fc06e', '#d68ab8', '#9a8fc0', '#6fa8dc', '#c9b458', '#7aa2d6', '#e8a33d', '#b08968', '#a3b550', '#6fc7c9', '#d6a26f', '#c07f7f', '#88b8a0', '#b5a0d6', '#d68f6f', '#7fc0b0', '#c0b088', '#d68f9f', '#8fc0d6', '#c9c98f', '#a08fd6', '#d6c08f'];
  /* 列表 dyn 列：排序键 → 列头标签 + 取值（rail.js DYN 原样，字段换契约映射） */
  var DYN = {
    value: { label: '总价值', f: function (i) { return i.value * i.count; } },
    shelf: { label: '保质(h)', f: function (i) { return shelfH(i.shelf); } },
    sat: { label: '饱食', f: function (i) { return i.sat > 0 ? '+' + i.sat : '—'; } },
    hp: { label: '生命', f: function (i) { return i.hp ? '+' + i.hp : '—'; } },
    en: { label: '精力', f: function (i) { return i.en ? '+' + i.en : '—'; } },
    mind: { label: '心态', f: function (i) { return i.mind ? (i.mind > 0 ? '+' + i.mind : String(i.mind)) : '—'; } }
  };
  /* icfg 查不到时的兜底（契约保证 items 的 cfgId 均在 icfg 内，防御性而已） */
  var NOCFG = { n: '?', icon: '', trade: 0, stack: 1, catId: 0, subCatId: 0, cat: '', life: 0, v1: 0, v2: 0, v3: 0, v4: 0, v5: 0 };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* ---- 归一化 ---- */
  /* 行数组归一（v1.8.1 防御）：实机曾现注入 JS 2028 行 `reading 'n'` 崩溃（397bad2 实测，
     lib 迭代期 lib[i] 为空值）——畸形契约行（null/非数组）在入口整行剔除，不让坏行进
     store；后续所有 .n/.id 迭代天然安全。 */
  function normRows(arr, norm) {
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (!Array.isArray(arr[i])) continue;
      out.push(norm(arr[i]));
    }
    return out;
  }
  function normCtn(r) {
    return { id: r[0], n: r[1] != null ? String(r[1]) : '', kind: r[2] || 'c', cap: r[3] || 0, tags: r.length > 4 ? r.slice(4) : [] };
  }
  function normLib(r) {
    return { id: r[0], n: r[1] != null ? String(r[1]) : '', dim: r[2] || 0, order: r[3] || 0, icon: r[4] || '', color: r[5] || '' };
  }
  function normIcfg(r) {
    return {
      id: r[0], n: r[1] != null ? String(r[1]) : '', icon: r[2] != null ? String(r[2]) : '',
      trade: r[3] || 0, stack: r[4] || 1, catId: r[5] || 0, subCatId: r[6] || 0,
      cat: r[7] != null ? String(r[7]) : '', life: r[8] || 0,
      v1: r[9] || 0, v2: r[10] || 0, v3: r[11] || 0, v4: r[12] || 0, v5: r[13] || 0
    };
  }
  /* ---- 查表（Produces：ctnById / bagArr；T4/T5 复用）---- */
  /* 背包=虚拟容器（契约 ctn 不含背包，页签固定首位）；kind 'b' 仅作标记 */
  function bagCtn() { return { id: store.bag, n: '背包', kind: 'b', cap: BAG_CAP, tags: [], fixed: true }; }
  function ctnById(id) {
    /* 字符串+数字双口径比较（v1.8.1）：页签持久化/消息 active 是字符串口径、契约 owner
       是数字——=== 严等错配返回 null 即「页签栏空/渲染目标丢失」一类病灶的来源 */
    if (store.bag != null && String(id) === String(store.bag)) return bagCtn();
    for (var i = 0; i < store.ctn.length; i++) if (String(store.ctn[i].id) === String(id)) return store.ctn[i];
    return null;
  }
  /* Produces：bagArr() = items['bag']（契约原始行，T5/T7 取 logicId/cfgId/count 用） */
  function bagArr() { return store.items['bag'] || []; }
  /* 物品行 → 渲染视图对象（join icfg；src=来源容器名，全库/列表/悬停用） */
  function itOf(ownerId, r) {
    var cfg = ICFG[r[1]] || NOCFG;
    var c = ctnById(ownerId);
    return {
      id: r[0], cfgId: r[1], count: r[2] || 0, shelf: r[3] || 0,
      x: r[4] || 0, y: r[5] || 0, w: r[6] || 1, h: r[7] || 1, flags: r[8] || 0,
      name: cfg.n, icon: cfg.icon, cat: cfg.cat, catId: cfg.catId, value: cfg.trade,
      sat: cfg.v1, mind: cfg.v2, en: cfg.v3, hp: cfg.v5,
      src: c ? nm(c) : '?', ctnId: ownerId
    };
  }
  function itemsOf(id) {
    var raw = String(id) === String(store.bag) ? bagArr() : (store.items[String(id)] || []);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      if (!Array.isArray(raw[i])) continue; /* 畸形行防御（同 normRows 口径） */
      out.push(itOf(id, raw[i]));
    }
    return out;
  }
  /* 容器显示名：NAMES 覆盖（srp_ctn_names，T5 编辑弹窗写入；缺省=契约名。rail.js nm 同款） */
  function nm(c) { return NAMES[c.id] || c.n; }
  /* 容器自定义词 overlay（srp_ctn_tags {ownerId:[词...]}，T5 fix-2）：并入容器标签视图用 */
  function customTagsOf(id) { var v = CTAGS[id]; return Array.isArray(v) ? v : []; }
  /* 容器标签视图（名字口径，fix-2 合并函数）= 官方 tagId 经 lib 查名 ∪ 自定义词。
     消费：头部副标 / ✎ 回显（编辑态另需 id 口径，见 openEdit）/ 全库命中路走 customTagsOf。 */
  function tagNamesOf(c) { return c.tags.map(tagName).concat(customTagsOf(c.id)); }
  function tagName(id) { var t = LIB[id]; return t ? t.n : '#' + id; }
  /* lib dim → LIB_GROUPS 下标（min/max 区间匹配；未登记维度兜底最后一组，见 LIB_GROUPS 注释） */
  function dimGroup(dim) {
    for (var i = 0; i < LIB_GROUPS.length; i++) {
      if (dim >= LIB_GROUPS[i].min && dim <= LIB_GROUPS[i].max) return i;
    }
    return LIB_GROUPS.length - 1;
  }
  function tagColor(name) {
    var t = LIBN[name];
    /* 无 lib 条目 = 自定义词表标签：色值照原型 GROUP_COLOR.自定义 #C9915A */
    return t ? LIB_GROUPS[dimGroup(t.dim)].color : '#C9915A';
  }
  function catColor(catId) { return CAT_RING[((catId % CAT_RING.length) + CAT_RING.length) % CAT_RING.length]; }
  /* 保质秒 → 显示小时（Math.round(timeLeftSec/3600)；排序仍用原值 timeLeftSec） */
  function shelfH(sec) { return Math.round((sec || 0) / 3600); }
  function totalCap() {
    var s = BAG_CAP; /* 全库口径含背包（rail.js CTN 同款） */
    for (var i = 0; i < store.ctn.length; i++) s += store.ctn[i].cap;
    return s;
  }
  /* 侧栏容器全集：背包（虚拟首位）+ 全部家中容器 */
  function allCtns() { return [bagCtn()].concat(store.ctn); }
  /* 侧栏里可见的容器：整理柜场景排除背包（背包=页面左侧官方面板，§4.5；场景态 T4 接管） */
  function railCtns() {
    if (store.ctx && store.ctx.family === 'rack') return store.ctn;
    return allCtns();
  }
  /* ---- §4.9 分场景记忆：localStorage 五键（键名冻结，persist 区）----
     srp_pin_order_<scene>   页签常用顺序 ownerId 数组（读=pinOrderIds 渲染即用；写=T5 拖拽 savePinOrder）
     srp_common_tags_<scene> 快捷标签名字符串数组（T4 chips × /管理弹层写）
     srp_ctn_names           容器改名覆盖 id→名（全局；T5 已接线：启动载入→nm() 消费，
                             编辑弹窗保存写+cmd('rename') 主通道由 C# 持久化随契约回推）
     srp_ctn_tags            容器自定义词 overlay id→[词...]（全局；fix-2 双层：官方标签=C# 权威
                             cmd('setTags')→C# SetRule→契约回推，本键只存自定义词、JS 侧经
                             customTagsOf 并入标签视图，不参与 C# 入库路由）
     srp_custom_tags         自定义标签词表（全局；T4 管理弹层写） */
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function lsSet(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { }
  }
  function pinKey() { return 'srp_pin_order_' + st.scene; }
  function commonKey() { return 'srp_common_tags_' + st.scene; }
  function loadPinOrder() { var v = lsGet(pinKey()); return Array.isArray(v) ? v : null; }
  function savePinOrder(ids) { lsSet(pinKey(), ids || []); }                 /* T5 拖拽调用 */
  function loadCommon() { var v = lsGet(commonKey()); return Array.isArray(v) ? v.slice() : null; }
  function saveCommon() { lsSet(commonKey(), COMMON); }
  function loadNames() {
    var v = lsGet('srp_ctn_names');
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;    /* T5 已接：启动载入 */
  }
  function saveNames(m) { lsSet('srp_ctn_names', m || {}); }                 /* T5 已接：saveEdit 写 */
  function loadCtnTags() {
    var v = lsGet('srp_ctn_tags');
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;    /* T5 已接：启动载入（自定义词 overlay） */
  }
  function saveCtnTags(m) { lsSet('srp_ctn_tags', m || {}); }                /* T5 已接：saveEdit 写（自定义词 overlay） */
  function loadCustom() { var v = lsGet('srp_custom_tags'); return Array.isArray(v) ? v.slice() : []; }
  function saveCustom() { lsSet('srp_custom_tags', CUSTOM); }
  function pinOrderIds() {
    var po = loadPinOrder();
    if (!po || !po.length) return null;
    var have = {}, out = [];
    for (var i = 0; i < store.ctn.length; i++) have[store.ctn[i].id] = true;
    for (var j = 0; j < po.length; j++) {
      var id = po[j];
      if (have[id] && out.indexOf(id) < 0) out.push(id); /* 已删容器/重复 id 剔除 */
    }
    return out.length ? out : null;
  }
  function pinnedCtns() {
    var rc = railCtns();
    var bag = rc.length && rc[0].fixed ? rc[0] : null;
    var ids = pinOrderIds();
    if (!ids) {
      ids = [];
      for (var i = 0; i < store.ctn.length && i < 4; i++) ids.push(store.ctn[i].id);
    }
    var byId = {};
    for (var j = 0; j < store.ctn.length; j++) byId[store.ctn[j].id] = store.ctn[j];
    var out = [];
    if (bag) out.push(bag);
    for (var q = 0; q < ids.length; q++) { var c = byId[ids[q]]; if (c) out.push(c); }
    return out;
  }
  /* 容量换列数+行数（cosmetic：页脚 N 行估算用；网格模式物品区=官方格，尺寸官方自带；
     duo 背包面板仍用 COLS×SLOT 定版几何） */
  function applySize(cap) {
    st.cap = cap;
    st.slot = slotOf(SCENES[st.scene]);
    st.cols = colsOf(SCENES[st.scene]);
    st.rows = Math.max(3, Math.ceil(cap / st.cols));
    st.items = itemsOf(st.currentId);
  }
  /* 页脚已用格数 = Σ w×h（多格物品计入格占用；原型 1×1 时代即物品行数，语义一致） */
  function usedCells(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += (arr[i].w || 1) * (arr[i].h || 1);
    return s;
  }
  /* ---- 排序（Produces：sortArr）---- */
  /* 排序键：交易价值 = 单价 × 数量（多份按总数计）；保质期用 timeLeftSec 原值；其余取 v1/v5/v3/v2 */
  function sortVal(it) {
    if (st.sort === 'value') return it.value * it.count;
    if (st.sort === 'shelf') return it.shelf;
    return it[st.sort] || 0;
  }
  function sortArr(arr) {
    return arr.slice().sort(function (a, b) {
      var d = sortVal(b) - sortVal(a);           /* dir=1：数值高的在前 */
      if (d) return d * st.dir;
      return a.id - b.id;
    });
  }
  /* ---- 可见物品（Produces：visItems；谓词 rail.js 移植，T4 定稿）----
     本柜=物品名/分类名命中搜索 + 快捷标签同名命中物品分类名（不切柜不藏页签，§4.4）；
     全库=跨全部容器+背包，标签命中 = 物品分类名带该标签 或 来源容器标签带该标签
     （容器 ctn 行的 tagId 经 lib 转名后与 st.tags 名字比对——同名比对口径见 st 注释）。 */
  function visItems() {
    var q = st.query.trim().toLowerCase(), tags = st.tags, arr;
    if (st.global) {
      arr = gitems().filter(function (it) {
        if (q && it.name.toLowerCase().indexOf(q) < 0 && it.cat.toLowerCase().indexOf(q) < 0 && it.src.toLowerCase().indexOf(q) < 0) return false;
        if (tags.length) {
          var c = ctnById(it.ctnId);
          var hit = tags.indexOf(it.cat) >= 0 ||
            (c && c.tags && c.tags.some(function (t) { return tags.indexOf(tagName(t)) >= 0; })) ||
            (c && customTagsOf(c.id).some(function (w) { return tags.indexOf(w) >= 0; })); /* 自定义词 overlay 命中（fix-2） */
          if (!hit) return false;
        }
        return true;
      });
    } else {
      arr = st.items.filter(function (it) {
        if (q && it.name.toLowerCase().indexOf(q) < 0 && it.cat.toLowerCase().indexOf(q) < 0) return false;
        if (tags.length && tags.indexOf(it.cat) < 0) return false;
        return true;
      });
    }
    return sortArr(arr);
  }
  /* 全库物品：全部容器+背包拼合（§4.4 全库口径含背包——rack 场景页签排除背包只作用于
     页签栏/入口默认，全库搜索仍全域；只读渲染无需 rail.js 的 GCACHE 失效缓存） */
  function gitems() {
    var ac = allCtns(), out = [];
    for (var i = 0; i < ac.length; i++) out = out.concat(itemsOf(ac[i].id));
    return out;
  }
  function entryById(id) {
    var arr = st.global ? gitems() : st.items;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function sortLabel() { for (var i = 0; i < SORTS.length; i++) if (SORTS[i].k === st.sort) return SORTS[i].label; return '按分类'; }
  /* ---- 格子（Produces：slotHtml）----
     原型 emoji（POOL.e）换 icfg.icon 的 <img>（Task 1 ICON_RULE：WebIcon 原样作 src，勿加工）。
     分类点：原型 CAT_COLORS[分类名] → catColor(catId) 23 色环。
     fav（原型装饰位）契约无来源，弃用；s-new 橙点 ← flags bit2 临期
     （bit1 过期/bit0 污染原型无对应视觉，flags 原样透传保留，后续任务需要再出样式）。 */
  function slotHtml(it, cls) {
    return '<button type="button" class="' + cls + (st.sel === it.id ? ' selected' : '') + '" data-it="' + it.id + '" aria-label="' + esc(it.name + ' ×' + it.count) + '" style="--cat:' + catColor(it.catId) + '">' +
      '<span class="s-dot"></span>' +
      (it.icon ? '<img src="' + esc(it.icon) + '" alt="" aria-hidden="true" draggable="false" style="width:20px;height:20px;object-fit:contain;pointer-events:none">' : '') +
      '<span class="s-cnt">' + it.count + '</span>' + ((it.flags & 4) ? '<span class="s-new"></span>' : '') + '</button>';
  }
  function ctnItemHtml(c) {
    return '<button type="button" class="sr-ctnitem' + (c.id === st.currentId ? ' cur' : '') + '" data-ctn="' + c.id + '" title="' + esc(nm(c)) + '（单击切换 · 双击设置）">' +
      '<span class="cin">' + esc(nm(c)) + '</span></button>';
  }

  /* ---- 页签栏（Produces：renderCtnBar）----
     结构（id+顺序+名称）没变就不重建 DOM（key 短路）：切容器只翻 active 类保住节点，
     否则第二次点击落在重建后的新节点上，浏览器会把 dblclick 派发到公共祖先（§4.10）。
     背包固定首位（.main + CSS 2px 竖线、不可拖）；其余页签恒一行横向滚动（CSS）。
     ✎ 编辑入口（方案2定稿：仅选中页签右侧显示，CSS 控制显隐；双击保留为隐藏快捷方式）
     ——背包为虚拟容器（契约 ctn 无背包行，rename/setTags 无处落库）不渲染 ✎（rail.js
     模板对 main 也渲染 ✎，正式版按契约收窄，见 openEdit 守卫）。 */
  function renderCtnBar() {
    var pins = pinnedCtns();
    var key = pins.map(function (p) { return p.id + ':' + nm(p); }).join('-');
    if (key !== PIN_KEY) {
      PIN_KEY = key;
      el.pinRow.innerHTML = pins.map(function (p) {
        var main = !!p.fixed;
        return '<button type="button" draggable="' + (main ? 'false' : 'true') + '" class="sr-pin' + (main ? ' main' : '') + '" data-ctn="' + p.id + '" title="' + esc(nm(p)) + (main ? '（固定首位）' : '（拖拽排序 · 双击设置）') + '">' +
          '<span class="p-lb">' + esc(nm(p)) + '</span>' +
          (main ? '' : '<span class="p-edit" draggable="false" role="button" aria-label="编辑名称与标签" title="编辑名称与标签">✎</span>') +
          '</button>';
      }).join('');
    }
    el.pinRow.querySelectorAll('[data-ctn]').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.getAttribute('data-ctn'), 10) === st.currentId);
    });
  }
  /* ---- ▾ 容器菜单内容（Produces：renderCtnPop；开关/单击切换/双击开设置 = T5 bind）----
     分组照 rail.js：按容器标签命中的 lib 分组（dimGroup 三组：食品类/材料类/功能类）
     逐组列出，再「自定义标签」组（fix-2 双层：自定义词 overlay 挂到柜上的容器入此组，
     组名与位置照 rail.js renderCtnPop 的 customC 段），最后未打标签组；一柜多组标签
     可同现多组（rail.js some 语义同款）。 */
  function renderCtnPop() {
    var html = '', RC = railCtns();
    for (var g = 0; g < LIB_GROUPS.length; g++) {
      var list = RC.filter(function (c) {
        return c.tags && c.tags.some(function (t) { var e = LIB[t]; return !!e && dimGroup(e.dim) === g; });
      });
      if (!list.length) continue;
      html += '<div class="sr-grp">' + LIB_GROUPS[g].g + '</div>';
      for (var i = 0; i < list.length; i++) html += ctnItemHtml(list[i]);
    }
    var customC = RC.filter(function (c) { return customTagsOf(c.id).length > 0; });
    if (customC.length) {
      html += '<div class="sr-grp">自定义标签</div>';
      for (var k = 0; k < customC.length; k++) html += ctnItemHtml(customC[k]);
    }
    var untag = RC.filter(function (c) { return (!c.tags || c.tags.length === 0) && customTagsOf(c.id).length === 0; });
    if (untag.length) {
      html += '<div class="sr-grp">未打标签</div>';
      for (var u = 0; u < untag.length; u++) html += ctnItemHtml(untag[u]);
    }
    el.srCtnPopBody.innerHTML = html || '<div class="sr-empty">没有容器</div>';
  }
  /* ---- 快捷标签行（Produces：renderTags；交互=T4：点=切换筛选、× =移出、＋=管理弹层）----
     chips = 全部 + COMMON（标签名查 lib 取名/组色；自定义名走自定义色）。 */
  function renderTags() {
    var h = '<button type="button" class="sr-tag' + (!st.tags.length ? ' active' : '') + '" data-tag="__all">全部</button>';
    for (var i = 0; i < COMMON.length; i++) {
      var t = COMMON[i];
      h += '<button type="button" class="sr-tag' + (st.tags.indexOf(t) >= 0 ? ' active' : '') + '" data-tag="' + esc(t) + '">' +
        '<span class="t-dot" style="background:' + tagColor(t) + '"></span>' + esc(t) +
        '<span class="t-x" data-tx="' + esc(t) + '" role="button" aria-label="移除标签">×</span></button>';
    }
    el.srTagRow.innerHTML = h;
    renderTagManage();
  }
  /* ---- 标签管理弹层内容（＋按钮打开；分组 = lib dim 两组 + 自定义词表组）----
     rail.js 的 TAG_GROUPS 静态表 → 正式版按 store.lib 的 dim 推导（组内按 order 排），
     自定义组照 rail.js 追加在最后；hidden 早退守卫照 rail.js（§4.10 先切 hidden 再渲染）。
     结构（词表全集）没变不重建 innerHTML，active 类每次原地同步——照 renderCtnBar 的
     key 短路纪律：整体重建会把被点节点换掉，同一次点击冒泡到 document 时目标已脱离
     DOM，关闭监听的 closest('.sr-pop') 判不中 → 弹层被秒关（§4.10「点击秒关」同类坑，
     harness 实测踩坑后改原地更新）。「点击启用，再点停用」要求弹层常驻。 */
  function tag2Html(name) {
    return '<button type="button" class="sr-tag2' + (st.tags.indexOf(name) >= 0 ? ' active' : '') + '" data-tg="' + esc(name) + '">' +
      '<span class="t-dot" style="background:' + tagColor(name) + '"></span>' + esc(name) + '</button>';
  }
  var TM_KEY = '';
  function renderTagManage() {
    if (!el.srTagManage || el.srTagManage.hidden) return;
    var key = store.lib.map(function (t) { return t.n; }).join(',') + '|' + CUSTOM.join(',');
    if (key !== TM_KEY) {
      TM_KEY = key;
      var h = '';
      for (var g = 0; g < LIB_GROUPS.length; g++) {
        var list = store.lib.filter(function (t) { return dimGroup(t.dim) === g; });
        list.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        if (!list.length) continue;
        h += '<div class="sr-grp">' + LIB_GROUPS[g].g + '</div><div class="sr-tagwrap">';
        for (var i = 0; i < list.length; i++) h += tag2Html(list[i].n);
        h += '</div>';
      }
      if (CUSTOM.length) {
        h += '<div class="sr-grp">自定义</div><div class="sr-tagwrap">';
        for (var c = 0; c < CUSTOM.length; c++) h += tag2Html(CUSTOM[c]);
        h += '</div>';
      }
      el.srTagManageBody.innerHTML = h;
    }
    var chips = el.srTagManageBody.querySelectorAll('[data-tg]');
    for (var q = 0; q < chips.length; q++) {
      chips[q].classList.toggle('active', st.tags.indexOf(chips[q].getAttribute('data-tg')) >= 0);
    }
  }
  /* ---- 排序下拉内容（rail.js 原样；hidden 早退守卫照 rail.js）---- */
  function renderSortPop() {
    if (el.srSortPop.hidden) return;
    var h = '';
    for (var i = 0; i < SORTS.length; i++) {
      var s = SORTS[i];
      h += '<button type="button" class="sr-sortopt' + (s.k === st.sort ? ' active' : '') + '" data-sort="' + s.k + '">' + s.label + '</button>';
    }
    el.srSortPopBody.innerHTML = h;
  }

  /* ---- toast（rail.js 同款：2s 常显后淡出，重复调用重置计时）---- */
  function toastAt(tEl, msg) {
    if (!tEl) return;
    tEl.textContent = msg;
    tEl.hidden = false;
    tEl.classList.add('on');
    if (tEl.__t) clearTimeout(tEl.__t);
    tEl.__t = setTimeout(function () {
      tEl.classList.remove('on');
      setTimeout(function () { tEl.hidden = true; }, 250);
    }, 2000);
  }
  function toast(msg) {
    /* v1.8.4 原生背包页优先：native 页活跃且 NB.doc 在场时一律落本页 #srnToast——
       el 引用表可能仍是上一 rail 页的残留（页切换瞬间/隐藏帧预装配），写到那边玩家看不见 */
    if (NB.doc && store.ctx && SCENES[store.ctx.page] && SCENES[store.ctx.page].native) {
      var t = NB.doc.getElementById ? NB.doc.getElementById('srnToast') : null;
      if (t) { toastAt(t, msg); return; }
    }
    if (el.srToast) { toastAt(el.srToast, msg); return; }
    var t2 = NB.doc && NB.doc.getElementById ? NB.doc.getElementById('srnToast') : null;
    if (t2) toastAt(t2, msg);
  }
  /* 整理柜场景 toast（v1.8.2：左背包面板已官方化，无独立 sbToast 元素——统一走主侧栏 toast） */
  function sbToast(msg) { toast(msg); }

  /* ---- 快捷标签两行上限（rail.js 同款）：先加再量 srTagRow 溢出，溢出回退并拒绝 ---- */
  function tryAddQuick(t) {
    COMMON.push(t);
    renderTags();
    if (el.srTagRow.scrollHeight > el.srTagRow.clientHeight + 2) {
      COMMON.splice(COMMON.indexOf(t), 1);
      renderTags();
      toast('快捷标签最多两行，请先移除一个');
      return false;
    }
    return true;
  }

  /* ---- 弹层开合（rail.js closePops 原样；入库确认弹窗 srStoreConfirm 行为 = T11 已接）---- */
  function closePops(keep) {
    if (keep !== 'ctn') el.srCtnPop.hidden = true;
    if (keep !== 'tag') el.srTagManage.hidden = true;
    if (keep !== 'sort') el.srSortPop.hidden = true;
    if (keep !== 'fsort') el.srFootSortPop.hidden = true;
    if (keep !== 'edit') el.srCtnEdit.hidden = true;
    if (keep !== 'store') el.srStoreConfirm.hidden = true;
  }
  /* ---- 官方分类下拉收起（rail.js closeMidMenus 同款；T10 自 bind() 局部提升到模块级——
     bindBagPanel 的五按钮开下拉前也要先收，双面板装配前文档里无 .category-dropdown 节点，
     调用为空操作）。文档取 el.doc（bind 每帧重收）= 只作用于当前活跃帧。 ---- */
  function closeMidMenus() {
    var d = el.doc || document;
    d.querySelectorAll('.category-dropdown').forEach(function (m) { m.hidden = true; });
    d.querySelectorAll('.category-dropdown-btn.open').forEach(function (b) { b.classList.remove('open'); });
  }

  /* ================= T5 命令排队（cmd 契约冻结，见文件头） =================
     转移类数据层函数（原型 takeEntries/putEntries/tidyById/storeAll）不搬：UI 一律
     cmdOut 入队，C# drain 取走执行后推新契约包，setData 到达自然重渲染（无乐观刷新）。 */
  function cmd(op, payload) {
    var entry = { op: op };
    if (payload) for (var k in payload) entry[k] = payload[k]; /* 平铺：drain 项 = {op,...payload}，与契约行同形 */
    CMDQ.push(entry);
  }
  /* 内部统一出口：走 window.__CERAIL__.cmd 属性调用（而非闭包内 cmd 直调），
     宿主/harness 的包装器（命令日志、遥测）才能截获每一笔命令 */
  function cmdOut(op, payload) {
    window.__CERAIL__.cmd(op, payload);
    /* Bug3 v1.8.2.3：物品变更类命令发出后，官方格需官方重绑才重渲染——BackpackUI 页的
       C# 侧 RefreshBag 带参不可直调，此处对当前 owner 重发 SWITCH_BAG（官方重绑=同效刷新；
       600ms=命令泵 0.5s 周期后落点）。其余 12 页走 C# RefreshActivePage（无参官方动作）。 */
    if (op !== 'rename' && op !== 'setTags' && op !== 'rackOpen' && store.ctx && store.ctx.page === 'BackpackUI') {
      setTimeout(function () { try { forgeSwitchTo(st.currentId); } catch (e) { } }, 600);
    }
  }

  /* ---- ✎ 编辑弹窗（rail.js openEdit/renderEditTags/saveEdit 移植）----
     保存 = 写 localStorage 覆盖（srp_ctn_names {ownerId:名}；srp_ctn_tags {ownerId:[自定义词...]}
     JS 侧 overlay——fix-2 双层裁定：官方 tagId 走 cmd('setTags') 由 C# SetRule 权威持久化并随
     契约回推；自定义词只落浏览器侧、并入标签视图，不参与 C# 入库路由）+ 全处同步重渲染
     （标题/页签/菜单/全库过滤——rail.js saveEdit 同款；名字经 nm() 覆盖、词经
     customTagsOf/tagNamesOf 合并）。 */
  function openEdit(id) {
    var c = ctnById(id);
    if (!c || c.fixed) return; /* 背包=虚拟容器（契约 ctn 无背包行，rename/setTags 无处落库）不可编辑 */
    st.editId = id;
    /* data-tg 口径：官方=tagId 字符串、自定义=词原文（回显=官方 ∪ 自定义 overlay，fix-2） */
    st.editTags = c.tags.map(String).concat(customTagsOf(id));
    el.srEditName.value = nm(c);
    renderEditTags();
    el.srCtnEdit.hidden = false;
    closePops('edit');
    setTimeout(function () { try { el.srEditName.focus(); el.srEditName.select(); } catch (x) { } }, 0);
  }
  /* 编辑弹窗标签多选 = lib 全量按 LIB_GROUPS 三组（组内按 order 排，官方 26 标签全量口径）
     + 自定义词表组（照 rail.js 追加在最后）；data-tg：lib 行=tagId 字符串、自定义词=原文
     （saveEdit 按纯数字判定归属）。 */
  function editTag2Html(key, label, color) {
    return '<button type="button" class="sr-tag2' + (st.editTags.indexOf(key) >= 0 ? ' active' : '') + '" data-tg="' + esc(key) + '">' +
      '<span class="t-dot" style="background:' + color + '"></span>' + esc(label) + '</button>';
  }
  function renderEditTags() {
    var h = '';
    for (var g = 0; g < LIB_GROUPS.length; g++) {
      var list = store.lib.filter(function (t) { return dimGroup(t.dim) === g; });
      list.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      if (!list.length) continue;
      h += '<div class="sr-grp">' + LIB_GROUPS[g].g + '</div><div class="sr-tagwrap">';
      for (var i = 0; i < list.length; i++) h += editTag2Html(String(list[i].id), list[i].n, LIB_GROUPS[g].color);
      h += '</div>';
    }
    if (CUSTOM.length) {
      h += '<div class="sr-grp">自定义</div><div class="sr-tagwrap">';
      for (var c = 0; c < CUSTOM.length; c++) h += editTag2Html(CUSTOM[c], CUSTOM[c], '#C9915A');
      h += '</div>';
    }
    el.srEditTags.innerHTML = h;
  }
  function saveEdit() {
    var c = ctnById(st.editId);
    if (!c) { el.srCtnEdit.hidden = true; return; }
    var v = el.srEditName.value.trim();
    /* 名字：基准=当前显示名 nm(c)（契约名 ∪ rename 覆盖）——rename 被 C# 持久化
       （cerail_names.json，RailData.NameOf 优先）后回推的行名 c.n 已是覆盖名，不能再当
       「原名」基准（否则清空想恢复官方名时 JS 误判未变、静默无效）。显示名有变化（含清空
       =恢复官方名）→ 写/删 overlay 并**无条件**发 rename（空串由 C# OpRename 删覆盖）；
       显示名未变→不发命令（T5「同名不重发」在新基准下自然达成）。 */
    var nameChanged = v !== nm(c);
    if (nameChanged && v) NAMES[c.id] = v; else delete NAMES[c.id];
    /* 选中集按 data-tg 双层分流（fix-2）：纯数字=官方 tagId → cmd('setTags')（C# SetRule
       权威、机器人跟随，回推后视图自然更新——无乐观刷新）；其余=自定义词 → srp_ctn_tags
       overlay（JS 侧，不入命令，不参与 C# 入库路由 storeAll/putTag 只按官方标签）。 */
    var ids = [], words = [];
    for (var i = 0; i < st.editTags.length; i++) {
      if (/^\d+$/.test(st.editTags[i])) ids.push(parseInt(st.editTags[i], 10));
      else words.push(st.editTags[i]);
    }
    var sameIds = c.tags.length === ids.length && c.tags.every(function (t) { return ids.indexOf(t) >= 0; });
    var oldW = customTagsOf(c.id);
    var sameW = oldW.length === words.length && oldW.every(function (w) { return words.indexOf(w) >= 0; });
    if (!sameW) {
      if (words.length) CTAGS[c.id] = words.slice(); else delete CTAGS[c.id];
      saveCtnTags(CTAGS); /* §4.9：srp_ctn_tags 落盘（仅自定义词） */
    }
    saveNames(NAMES);
    if (nameChanged) cmdOut('rename', { owner: c.id, name: v }); /* v 允许空串=清空恢复官方名 */
    if (!sameIds) cmdOut('setTags', { owner: c.id, tags: ids.slice() });
    el.srCtnEdit.hidden = true;
    render();
  }

  /* ---- 页签拖拽（rail.js bindPinDrag 移植）----
     背包固定首位：模板 draggable=false + dragstart JS 守卫 + drop 落到背包位拒绝；
     落点指示 drop-before/after 按指针在目标页签左右半区（CSS box-shadow 橙线）；
     drop 只算序并写 srp_pin_order_<scene>（persist 区 savePinOrder），DOM 重排交给
     dragend→render()（pinnedCtns→pinOrderIds 渲染层现读解出，store 只读不重排）。 */
  function bindPinDrag() {
    var row = el.srPinRow;
    row.addEventListener('dragstart', function (e) {
      var b = e.target.closest('[data-ctn]'); if (!b) return;
      if (b.classList.contains('main')) { st.dragId = null; return; } /* 背包固定首位不可拖 */
      st.dragId = parseInt(b.getAttribute('data-ctn'), 10);
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(st.dragId)); } catch (x) { }
      b.classList.add('dragging');
    });
    row.addEventListener('dragend', function () {
      st.dragId = null;
      row.querySelectorAll('.sr-pin').forEach(function (b) { b.classList.remove('dragging', 'drop-before', 'drop-after'); });
      render();
    });
    row.addEventListener('dragover', function (e) {
      if (st.dragId == null) return;
      e.preventDefault();
      var b = e.target.closest('[data-ctn]');
      row.querySelectorAll('.sr-pin').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });
      if (!b || parseInt(b.getAttribute('data-ctn'), 10) === st.dragId) return;
      if (parseInt(b.getAttribute('data-ctn'), 10) === store.bag) return; /* 背包位不显示落点指示（drop 亦拒） */
      var r = b.getBoundingClientRect();
      b.classList.add((e.clientX - r.left) < r.width / 2 ? 'drop-before' : 'drop-after');
    });
    row.addEventListener('drop', function (e) {
      e.preventDefault();
      var b = e.target.closest('[data-ctn]'); if (!b || st.dragId == null) return;
      var target = parseInt(b.getAttribute('data-ctn'), 10);
      if (target === st.dragId) return;
      /* 角色背包固定首位不参与排序：落到背包位直接拒绝（rail.js fixedC[0] 同款） */
      if (target === store.bag) return;
      var pins = pinnedCtns().filter(function (p) { return !p.fixed; });
      var from = -1, to = -1;
      for (var i = 0; i < pins.length; i++) {
        if (pins[i].id === st.dragId) from = i;
        if (pins[i].id === target) to = i;
      }
      if (from < 0 || to < 0) return;
      var r = b.getBoundingClientRect();
      var after = (e.clientX - r.left) >= r.width / 2;
      var order = pins.map(function (p) { return p.id; });
      order.splice(from, 1);
      order.splice(order.indexOf(target) + (after ? 1 : 0), 0, st.dragId);
      savePinOrder(order); /* §4.9：srp_pin_order_<scene>（pinnedCtns 每次渲染现读） */
    });
  }

  /* ================= T10 整理柜三段壳（v1.8.2 v13：壳+官方 DOM 原件） =================
     装配在 mount()（sc.rack 分支：作用域容器 #rackSystem.rack-system + 官方左面板/
     官方中段两按钮/mod 三按钮/官方右面板/飞层 reparent，明细见 mount 注释）。
     本区只保留 mod 增值层的命令化：putAllToCabinet/takeAllFromCabinet（分类路 putCat/
     takeCat）、tagPutIn（putTag）、catsOf/catMatch/catLabel——数据层转移不落地（无 ICTN
     可变缓存），一律 cmdOut 入队，等 C# 执行后推新契约包自然重渲染；moved/stay 结果
     toast 由快照差工具 armXfer/settleXfer 复现（命令前记快照 → 下包 setData 差量生成文案）。
     官方两按钮（PUT_ALL/TAKE_ALL）与全部格子级动作=官方原生，本区零涉及。
     接线经 bind() 的 el 引用表（srMid 与三按钮 id），主侧栏 render() 末尾连带 renderMidChips()。 */

  /* ---- 分类工具（rail.js catsOf/catMatch/catLabel 的契约口径版）----
     cat 三态：null=全部 | catId 数字（=icfg.catId，即 C# takeCat/putCat 的
     Config_Item.Category 过滤值）| 官方标签名字符串数组（putTag 语义：柜官方标签名
     ∩ 背包物品分类名，rail.js catMatch 的 Array 分支同款）。 */
  function catName(catId) {
    for (var i = 0; i < store.icfg.length; i++) if (store.icfg[i].catId === catId && store.icfg[i].cat) return store.icfg[i].cat;
    return '#' + catId;
  }
  function catMatch(it, cat) {
    if (cat == null) return true;
    if (Array.isArray(cat)) return cat.indexOf(it.cat) >= 0;
    return it.catId === cat;
  }
  function catLabel(cat) { return Array.isArray(cat) ? cat.join('·') : (typeof cat === 'number' ? catName(cat) : ''); }
  /* 分类下拉选项 = 对应容器实际存在分类（rail.js catsOf 同义）：按 icfg.catId 汇总去重
     （首现顺序），选项 value=catId、label=catName（rail.js 选项即分类名，正式版 id/名分离
     ——分类名经 esc 渲染、id 走 data-cat）。 */
  function catsOf(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (!arr[i].cat) continue; /* rail.js 同款：分类名缺失的行不入选项 */
      var hit = false;
      for (var j = 0; j < out.length; j++) if (out[j].id === arr[i].catId) { hit = true; break; }
      if (!hit) out.push({ id: arr[i].catId, n: arr[i].cat });
    }
    return out;
  }

  /* ---- 快照差工具（共享，T11/T12 复用）----
     命令发出前记相关 owner 的叠数/件数快照（XFER 在途恒一笔，后发覆盖前发=末次命令口径）；
     下包 setData 到达（settleXfer 在 setData 末尾、render 之后调用——rail.js「先刷后 toast」
     同序）按差量生成结果 toast：放入方向 sbToast（左面板 toast）、取出方向 toast（主侧栏），
     与 rail.js putAllToCabinet/takeAllFromCabinet 的 toast 元素选择一致。文案分支口径照
     rail.js：「已放入 X N 件（cat）」「柜满剩 N 叠」「X 已满」「背包里没有命中「cat」的物品」/
     「已取出 N 件（cat）」「背包满剩 N 叠」「背包已满」「柜子里没有cat」。
     stay（满则整叠跳过计数）= 命令时刻命中叠数 - 快照差搬走叠数：整叠语义下精确（T7 的
     put/putAll/putCat/putTag/takeAll/takeCat 全部整叠搬运——TryQuickMoveItems/TryMoveBagAll
     无半叠拆分；take 1 件的 SplitItem 拆分路径不经本工具）。 */
  var XFER = null; /* 在途转移：{kind:'putAll'|'takeAll'|'storeAll'|'tidy', cat, tgt, cands, n, all, bag:{s,p}, ctn:{s,p}, order, snaps, owner, before}
                      （v1.8.2：put1 随右键 mod 语义退役；putAll/takeAll 由中段分类/按标签路
                      复用——cat 恒非 null；tidy 只带 owner/before=命令时该 owner 叠数；
                      storeAll 带 order+全量柜 snaps） */
  function snapOwner(id) { /* ownerId → {s:叠数, p:件数}（契约原始行直读，零渲染对象开销） */
    var raw = id === store.bag ? bagArr() : (store.items[String(id)] || []);
    var s = raw.length, p = 0;
    for (var i = 0; i < raw.length; i++) p += raw[i][2] || 0;
    return { s: s, p: p };
  }
  function armXfer(kind, cat, n, all) {
    var tgtId = st.currentId;
    var src = kind === 'takeAll' ? itemsOf(tgtId) : itemsOf(store.bag);
    var cands = 0;
    for (var i = 0; i < src.length; i++) if (catMatch(src[i], cat)) cands++;
    XFER = { kind: kind, cat: cat, tgt: tgtId, cands: cands, n: n || 0, all: !!all, bag: snapOwner(store.bag), ctn: snapOwner(tgtId) };
  }
  function settleXfer() {
    if (!XFER) return;
    var x = XFER; XFER = null;
    /* tidy（T12 §4.6）：失败路先行——ctx.lastTidyFail（T7 一次性标志，C# 推出即清）在该包
       到达 → toast「本界面暂不支持整理」（降级文案），不差量、不误报成功；消费即 JS 侧
       置 false（同包/重推防重复 toast 兜底——C# 已清，此处防 mock/异常路径残留）。成功路
       照 rail.js tidyById 口径：before=命令时该 owner 叠数快照、M=新包该 owner 叠数，
       toast「已整理：N 叠合并为 M 叠」（已并无可并时 N=M，文案照打——proto 同款）。
       owner 已消失（柜子拆了）：无从措辞，静默。toast 走主侧栏（rail.js tidyById 同款，
       sbTidy 入口亦然——rack 双面板两段同屏，proto 定稿如此）。 */
    if (x.kind === 'tidy') {
      if (!ctnById(x.owner)) return;
      if (store.ctx && store.ctx.lastTidyFail) {
        store.ctx.lastTidyFail = false; /* 一次性消费（见上） */
        toast('本界面暂不支持整理');
        return;
      }
      toast('已整理：' + x.before + ' 叠合并为 ' + snapOwner(x.owner).s + ' 叠');
      return;
    }
    /* storeAll（T11 §4.7）：入库方向无固定 target——按 order 全量差量对账。
       moved = 背包件数减量（快照差，件数守恒）；各柜增量 = 该柜件数差量（ rail.js
       cnt 口径为「叠」，正式版取件——同 cfgId 合并叠在叠数差量下恒 0 会漏计，件数差量
       精确且与 moved 同单位）；parts=有增量的柜按 order 序取前四 join ' · '，超出补「 等」；
       留背包 = 背包现存件数。toast 走主侧栏（rail.js storeAll 同款，sb 入口亦然——
       rack 双面板两段同屏，proto 定稿如此）。全留背包（无匹配/全满/空回推）单独分支。 */
    if (x.kind === 'storeAll') {
      var bagSt = snapOwner(store.bag);
      var movedP = x.bag.p - bagSt.p;
      var parts = [], hit = 0;
      for (var s = 0; s < x.order.length; s++) {
        var was = x.snaps[x.order[s]];
        if (!was) continue;
        var dp = snapOwner(x.order[s]).p - was.p;
        if (dp <= 0) continue;
        hit++;
        if (parts.length < 4) { var cc = ctnById(x.order[s]); if (cc) parts.push(nm(cc) + '×' + dp); }
      }
      if (movedP > 0) {
        var msg = '已入库 ' + movedP + ' 件 → ' + parts.join(' · ') + (hit > 4 ? ' 等' : '');
        if (bagSt.p) msg += '；' + bagSt.p + ' 件无匹配柜或柜已满，留在背包';
        toast(msg);
      } else {
        toast(bagSt.p + ' 件无匹配柜或柜已满，留在背包');
      }
      return;
    }
    var tgt = ctnById(x.tgt);
    if (!tgt) return; /* 柜已消失（拆了等）：无从措辞，静默 */
    var bagNow = snapOwner(store.bag), ctnNow = snapOwner(x.tgt);
    var label = catLabel(x.cat), suffix = x.cat != null ? '（' + label + '）' : '';
    var movedP, movedS, stay;
    if (x.kind === 'putAll') {
      movedP = ctnNow.p - x.ctn.p;
      movedS = x.bag.s - bagNow.s;
      stay = Math.max(0, x.cands - movedS);
      if (movedP > 0) sbToast('已放入 ' + nm(tgt) + ' ' + movedP + ' 件' + suffix + (stay ? '，柜满剩 ' + stay + ' 叠' : ''));
      else if (stay > 0) sbToast(nm(tgt) + ' 已满');
      else sbToast(x.cat != null ? '背包里没有命中「' + label + '」的物品' : '背包是空的');
      return;
    }
    /* takeAll（rail.js takeAllFromCabinet：结果 toast 走主侧栏） */
    movedP = bagNow.p - x.bag.p;
    movedS = x.ctn.s - ctnNow.s;
    stay = Math.max(0, x.cands - movedS);
    if (movedP > 0) toast('已取出 ' + movedP + ' 件' + suffix + (stay ? '，背包满剩 ' + stay + ' 叠' : ''));
    else if (stay > 0) toast('背包已满');
    else toast(x.cat != null ? '柜子里没有' + label : '柜子是空的');
  }

  /* ================= T11 一键入库（确认前置 + storeAll + 差量汇总 toast） =================
     rail.js openStoreConfirm/storeAll 移植 + 命令化（§4.6 v9 确认前置 / §4.7 分配路由）。
     两入口同款文案同款流程：主侧栏 srStoreAll（背包页且非 rack 家族才显示，render hidden
     规则 T3 已定）→ srStoreConfirm；rack 双面板 sbStoreAll（左背包面板底部，T10 装配）→
     sbConfirm。背包空直接 toast 不弹窗（主入口 toast / 左面板 sbToast，rail.js 分工同款）；
     确认才 armStoreAll + cmd('storeAll',{order})，无乐观刷新——等 C# 回推新包由 settleXfer
     的 storeAll 分支差量出汇总 toast。确认弹窗定位锚底部按钮上方（railui.css .sr-popstore
     bottom:44px，T2 已就位）。sbStoreAll 已入 bind() document 级关闭监听豁免清单
     （防同次点击冒泡秒关=v9 踩坑，rail.js 豁免清单同位）。 */

  /* §4.7 路由顺序：srp_pin_order_<scene> 现值在前（常用柜优先，§4.9），未覆盖容器按契约
     序补尾（柜满顺延要能到达全部柜——rail.js storeAll 遍历全 CTN 同口径；C# OpStoreAll
     只遍历 order，故 order 必须全量）；无存档 = 契约序全量（默认页签顺序）。 */
  function storeAllOrder() {
    var out = [], seen = {}, po = pinOrderIds();
    if (po) for (var i = 0; i < po.length; i++) { out.push(po[i]); seen[po[i]] = true; }
    for (var j = 0; j < store.ctn.length; j++) if (!seen[store.ctn[j].id]) out.push(store.ctn[j].id);
    return out;
  }
  /* 确认文案（rail.js openStoreConfirm 逐字）：X=件数 Σcount、Y=叠数。 */
  function storeConfirmText() {
    var bag = bagArr(), pieces = 0;
    for (var i = 0; i < bag.length; i++) pieces += bag[i][2] || 0;
    return '背包现有 <b>' + pieces + '</b> 件（' + bag.length + ' 叠），将按<b>物品分类</b>放入带对应标签的柜子。<br>柜满顺延下一个同标签柜；无匹配/全满的留在背包。';
  }
  /* 主侧栏入口（背包页页脚；弹窗先 hidden=false 再填内容，§4.10 开关序）。
     v1.8.2：rack 左面板 sbStoreAll 入口随官方化退役（整理柜场景无入库按钮——背包在
     左段官方面板，放入走官方流程；spec §4.6 v13 裁定）。 */
  function openStoreConfirm() {
    if (!bagArr().length) { toast('背包是空的'); return; }
    closePops('store');
    closeMidMenus();
    el.srStoreConfirm.hidden = false;
    el.srStoreText.innerHTML = storeConfirmText();
  }
  /* 确认入库：弹窗关 → arm（bag+order 全量柜快照）→ 命令入队等回推。 */
  function goStoreAll() {
    el.srStoreConfirm.hidden = true;
    var order = storeAllOrder(), snaps = {};
    for (var i = 0; i < order.length; i++) snaps[order[i]] = snapOwner(order[i]);
    XFER = { kind: 'storeAll', order: order, bag: snapOwner(store.bag), snaps: snaps };
    cmdOut('storeAll', { order: order });
  }

  /* ================= T12 一键整理（tidy：同名叠合并+差量 toast+降级分支） =================
     rail.js tidyById/tidy/sbTidy 移植 + 命令化（§4.6）。无确认直发（入库才有 §4.6 v9
     确认前置，整理无破坏性——proto 同款）；空容器直接 toast 零命令（零命令纪律同 T11
     空背包路）。C# 侧（T7 OpTidy）= 官方 SortContainerForHub+MergeStacksForHub 直调，
     失败置 ctx.lastTidyFail 一次性标志（推出即清）——本函数只 arm+发命令，结果文案
     全由 settleXfer 的 tidy 分支按回推生成（失败降级文案 / 成功差量 toast）。 */
  /* tidy 统一出口（v1.8.2 唯一入口=主侧栏页脚 srTidy；rack 左面板 sbTidy 随官方化退役）：
     owner=st.currentId（bag 页=背包「任意容器含背包」、柜页=该柜；rack 场景=rackOpen 切换后的
     当前柜）。空 owner toast 口径照 rail.js tidyById：背包=「背包是空的」、其余容器=「这里没有物品」。 */
  function goTidy(owner) {
    owner = parseInt(owner, 10);
    if (!ctnById(owner)) return; /* 柜已消失等：无从整理，静默 */
    var raw = owner === store.bag ? bagArr() : (store.items[String(owner)] || []);
    if (!raw.length) { toast(owner === store.bag ? '背包是空的' : '这里没有物品'); return; }
    /* Bug3 v1.8.2.4：改走**官方 SORT 事件**（与官方面板"一键整理"按钮同一条路：官方 Reducer
       原地排序+推送，实测流畅；旧路=C# Sort/Merge 直调(82ms)+命令后 RefreshBag 全页重绑——
       多重全量刷新叠加官方大网格重绘=卡顿主源，作者实机对照实锤）。带 SORT 事件的页直发；
       无该事件的页（Brew/RatCage/Dye/Compressor/Shredder/GreenhouseBuild/MaterialRack）
       保留 C# 命令路（Sort+Merge+RefreshBag）。 */
    var ev = buildSortEvent(owner);
    if (ev && forgePost(ev)) {
      XFER = { kind: 'tidy', owner: owner, before: raw.length };
      return;
    }
    XFER = { kind: 'tidy', owner: owner, before: raw.length }; /* 快照=该 owner 当前叠数 N */
    cmdOut('tidy', { owner: owner });                          /* C# OpTidy：Sort+Merge 官方 API */
  }
  /* 官方 SORT 事件构造（findings §5 + BackpackUI.html @5844 实证负载）：
     BackpackUI=SORT_BACKPACK{side:'A'|'B'}（A=背包本体；B=双背包另一侧=当前柜）；
     Cooking/DroneHub/ToolTable=SORT_BAG{}（排序对象=背包面板当前 active 容器=st.currentId）；
     Trade=SORT_BAG{}（仅 trade 阶段官方启用）。 */
  function buildSortEvent(owner) {
    var page = store.ctx && store.ctx.page;
    if (!page) return null;
    if (page === 'BackpackUI') return { type: 'SORT_BACKPACK', data: { side: owner === store.bag ? 'A' : 'B' } };
    if (page === 'Cooking' || page === 'DroneHub' || page === 'ToolTable' || page === 'Trade') return { type: 'SORT_BAG', data: {} };
    return null;
  }
  /* 官方事件直发（Root 帧伪造页面来源，tagfilter forgeSwitch 同通道；复用 frameByKey 定位真实 iframe id） */
  function forgePost(ev) {
    var f = frameByKey(st.scene);
    if (!f || !f.el || !f.el.isConnected) return false;
    try { window.postMessage({ type: ev.type, data: ev.data, sourcePageId: f.el.id }, '*'); return true; } catch (e) { return false; }
  }

  /* ---- 中段「按标签放入」色点渲染（v1.8.2：renderBagPanel 随左面板官方化退役，仅存此联动）----
     主 render() 末尾连带调用：色点随 st.currentId 联动（v12 第三连修回归点）。官方 tagId 经
     lib 查名查色（tagColor 按名字取组色），前三+more；柜无官方标签=空串（自定义词不进色点：
     putTag 只按官方标签路由，fix-2 裁定）。 */
  function renderMidChips() {
    var tp = el.srTagPutIn;
    if (!tp || !store.ctx) return; /* 中段未装配/数据未到：不动（非 rack 场景 el.srTagPutIn=null） */
    var tgt = ctnById(st.currentId);
    var tags = tgt && tgt.id !== store.bag ? (tgt.tags || []) : [];
    var names = tags.map(tagName);
    var chips = el.srTagChips;
    var ico = '<span class="putin-ico">' + names.slice(0, 3).map(function (t) {
      return '<i class="pi-dot" style="background:' + tagColor(t) + '" title="' + esc(t) + '"></i>';
    }).join('') + '</span>';
    var more = names.length > 3 ? '<span class="putin-more">+' + (names.length - 3) + '</span>' : '';
    chips.innerHTML = names.length ? ico + more : '';
    tp.classList.toggle('has-ico', names.length > 0);
    tp.title = names.length ? '按「' + names.join('·') + '」标签放入背包中的对应物品' : '右侧柜子未设置标签';
  }

  /* ---- 中列 mod 三按钮（rail.js putAllToCabinet/takeAllFromCabinet/tagPutIn 命令化，v1.8.2 收敛为分类/按标签路）----
     空容器早退 toast 照 rail.js（数据本地即真，无命令可发）；满则整叠跳过/无命中的结果
     文案由 settleXfer 按回推差量生成（此处只 arm 不判）。
     命令分流（契约一字不差）：cat=catId 数字 → putCat{to,cat}/takeCat{from,cat}；
     cat=标签名数组（tagPutIn 路径）→ putTag{to}（C# 按 to 的 GetRule 标签名集合自取，
     负载不带标签）。cat=null 的整柜互转路（putAll/takeAll）已随官方两原件按钮退役——
     官方 PUT_ALL/TAKE_ALL 走原生事件，不arm 不差量（官方自有反馈）。 */
  function putAllToCabinet(cat) {
    var tgt = ctnById(st.currentId);
    if (!tgt || tgt.id === store.bag) return;
    if (!bagArr().length) { sbToast('背包是空的'); return; }
    armXfer('putAll', cat);
    if (Array.isArray(cat)) cmdOut('putTag', { to: st.currentId });
    else cmdOut('putCat', { to: st.currentId, cat: cat });
  }
  function takeAllFromCabinet(cat) {
    var tgt = ctnById(st.currentId);
    if (!tgt || tgt.id === store.bag) return;
    if (!itemsOf(tgt.id).length) { toast('柜子是空的'); return; }
    armXfer('takeAll', cat);
    cmdOut('takeCat', { from: st.currentId, cat: cat });
  }
  function tagPutIn() {
    var tgt = ctnById(st.currentId);
    if (!tgt || tgt.id === store.bag) return;
    /* 柜无官方标签（TagIds 空）→ toast 拒绝不发命令（rail.js 同款；自定义词不算——C#
       putTag 按 FurnitureTagComponent.GetRule 官方标签路由，fix-2 双层裁定） */
    var names = (tgt.tags || []).map(tagName);
    if (!names.length) { sbToast(nm(tgt) + ' 未设置标签'); return; }
    putAllToCabinet(names);
  }

  /* ---- 中段 mod 三按钮接线（v1.8.2：bindBagPanel 随左面板官方化退役，收敛为 bindMid）----
     引用表（srTakeCat/srTakeCatMenu/srPutCat/srPutCatMenu/srTagPutIn/srTagChips）随 bind()
     每帧重收；监听器只挂一次（mid 容器 __srMidBound 门=mount 生成的新容器才挂，T9 rebindFrame
     重绑路防双挂）。官方两按钮（btnPutAll/btnTakeAll）零接线——官方监听随 reparent 原样存活。 */
  function bindMid() {
    var mid = el.srMid;
    if (!mid || mid.__srMidBound) return;
    mid.__srMidBound = true;
    var tp = el.srTagPutIn;
    if (tp) tp.onclick = function () { closeMidMenus(); tagPutIn(); };
    var tc = el.srTakeCat, tcm = el.srTakeCatMenu, pc = el.srPutCat, pcm = el.srPutCatMenu;
    /* 分类下拉（rail.js bindCat 移植）：开=重算选项（数据驱动，选项随容器内容变化）；
       再点=收起（reopen 门）；点外/Esc 收起走 bind() 的 document 级监听（T5 已就位，
       wrapper 内豁免防同次点击开合互搏）。选项 data-cat=catId（C# cat 字段口径），
       label=catName；无可转移物品占位照 rail.js。 */
    function bindCat(btn, menu, srcArr, fn) {
      if (!btn || !menu) return;
      btn.onclick = function () {
        var reopen = menu.hidden;
        closeMidMenus();
        if (!reopen) return;
        var cs = catsOf(srcArr());
        menu.innerHTML = cs.length
          ? cs.map(function (c) { return '<div class="category-option" data-cat="' + c.id + '">' + esc(c.n) + '</div>'; }).join('')
          : '<div class="category-empty">无可转移物品</div>';
        menu.hidden = false;
        btn.classList.add('open');
      };
      menu.onclick = function (e) {
        var o = e.target.closest('[data-cat]'); if (!o) return;
        closeMidMenus();
        fn(parseInt(o.getAttribute('data-cat'), 10));
      };
    }
    bindCat(tc, tcm, function () { return itemsOf(st.currentId); }, function (c) { takeAllFromCabinet(c); }); /* ◀分类取出：选项=当前柜实际分类 */
    bindCat(pc, pcm, function () { return itemsOf(store.bag); }, function (c) { putAllToCabinet(c); });      /* 分类放入▶：选项=背包实际分类 */
  }

  /* ---- 官方格 display 层过滤（v1.8.2）----
     网格模式物品区=官方格：搜索/标签过滤只动官方 .item 的 display（零 addEventListener，
     不碰官方事件与内联样式语义）。识别双路：webui-bag 页 .item id=logicId 直查 fi 集合；
     Vue 页 .item 无 id（源码核实），按 img src 尾段→ICONIDX（icfg 图标索引）识别，同尾段
     多 cfgId=歧义键一概不藏（宁少藏不多藏）。恢复=只清自己标记 [data-srhide] 的元素。 */
  var ICONIDX = null; /* 图标尾段 → { ids:{cfgId:true}, ambig:bool }（setData 置空重懒建） */
  function buildIconIdx() {
    ICONIDX = {};
    for (var i = 0; i < store.icfg.length; i++) {
      var ic = store.icfg[i];
      var tail = String(ic.icon || '').split('?')[0].split('/').pop().toLowerCase();
      if (!tail) continue;
      var e = ICONIDX[tail];
      if (!e) { ICONIDX[tail] = { ids: {}, ambig: false }; e = ICONIDX[tail]; }
      else e.ambig = true;
      e.ids[ic.id] = true;
    }
  }
  function itemElMatch(elx, want, wantCfg) {
    var iid = elx.id || '';
    if (iid && want[iid]) return true;
    var img = elx.querySelector ? elx.querySelector('img') : null;
    if (img && ICONIDX) {
      var tail = String(img.getAttribute('src') || '').split('?')[0].split('/').pop().toLowerCase();
      var e = ICONIDX[tail];
      /* 图标识别路三态（v13 G11 口径回归）：未知键/歧义键 → **不藏**（宁少藏不多藏：
         同图多 cfg 或图标不在 icfg 时误藏的代价 > 漏藏）；唯一键 → 按 cfgId 命中过滤集 */
      if (!e) return true;
      if (e.ambig) return true;
      for (var cid in e.ids) if (wantCfg[cid]) return true;
    }
    return false;
  }
  function applyGridFilter(fi) {
    var host = el.srGridHost; if (!host) return;
    var prev = host.querySelectorAll('[data-srhide]');
    for (var i = 0; i < prev.length; i++) { prev[i].style.display = ''; prev[i].removeAttribute('data-srhide'); }
    var q = (st.query || '').trim().toLowerCase(), tags = st.tags || [];
    if (!q && !tags.length) return; /* 无过滤：官方格原样零触碰 */
    if (!ICONIDX) buildIconIdx();
    var want = {}, wantCfg = {}; /* want=实例 id（.item id=logicId 直配路）；wantCfg=cfgId（图标识别路） */
    for (var j = 0; j < fi.length; j++) { want[fi[j].id] = true; if (fi[j].cfgId) wantCfg[fi[j].cfgId] = true; }
    /* .item=官方背包格（webui-bag/Vue 页）；.rk-row=整理柜官方汇总行（webui-rackrows，
       行内 img 走图标识别路——行按 configId 分组，同组同图，歧义键不藏） */
    var items = host.querySelectorAll('.item, .rk-row');
    for (var k = 0; k < items.length; k++) {
      var elx = items[k];
      if (!itemElMatch(elx, want, wantCfg)) { elx.style.display = 'none'; elx.setAttribute('data-srhide', '1'); }
    }
  }
  /* ================= v13.5-v13.8 设施排序 + 数值角标 + 交易条（作者执行令） =================
     排序=数据层重排（cmd sortBy → C# 重排 owner 物品位序 → ForceRepublish → 官方管线
     重渲染官方格，动作保真红线零触碰）；角标=壳层 overlay（#srBadgeLayer 挂自家
     srGridHost 内，pointer-events:none，只读官方 .item 几何，零 addEventListener）。 */
  function isPlainScene() { return !!PLAIN_KEYS[st.scene]; }
  function isFoodScene() { return !!FOOD_KEYS[st.scene]; }
  function fsortLabel(k) { for (var i = 0; i < FSORTS.length; i++) if (FSORTS[i].k === k) return FSORTS[i].label; return k; }
  function renderFootSortPop() {
    if (el.srFootSortPop.hidden) return;
    var h = '';
    for (var i = 0; i < FSORTS.length; i++) {
      var s = FSORTS[i];
      h += '<button type="button" class="sr-fsopt' + (s.k === st.fsort ? ' active' : '') + '" data-fsort="' + s.k + '">' +
        '<span class="f-ico" aria-hidden="true">' + s.ico + '</span>' + s.label + '</button>';
    }
    el.srFootSortBody.innerHTML = h;
  }
  function applyFsort(key) {
    st.fsort = key;
    try { lsSet('srp_fsort_' + st.scene, key); } catch (e) { }
    cmdOut('sortBy', { owner: st.currentId, key: key }); /* 统一出口：包装器可截获；入队同 cmd */
    toast(key === 'official' ? '已恢复官方默认排序' : '已按「' + fsortLabel(key) + '」排序 · 格子右上角显示数值');
    render();
  }
  /* 交易买家条：正式实现无演示切换控件；品类加成数据源（ctx.tradePrefs=[[分类名,加成]…]）
     C# 侧校准后接入——在场则显示加成 chips，暂缺只显示排序口径 */
  function renderTradeInfo() {
    var t = el.srTrade; if (!t) return;
    t.hidden = st.scene !== 'Trade';
    if (t.hidden) return;
    var prefs = (store.ctx && store.ctx.tradePrefs) || [];
    var ps = '';
    for (var i = 0; i < prefs.length; i++) {
      ps += '<i class="ti-pref"><span class="t-dot" style="background:' + FBCOLOR.tvalue + '"></span>' + esc(String(prefs[i][0])) + ' +' + Math.round(Number(prefs[i][1]) * 100) + '%</i>';
    }
    t.innerHTML = (prefs.length ? '<span class="ti-prefs">' + ps + '</span>' : '') +
      '<span class="ti-mode" title="交易价值 = 单价 × 数量（品类加成接入后按当前交易对象加成计算）">按交易价值排序</span>';
  }
  /* 角标规格：Trade=交易价值（金）；食品设施=当前属性排序维 */
  function badgeSpec() {
    if (st.scene === 'Trade') return { k: 'value', color: FBCOLOR.tvalue };
    if (isFoodScene() && st.fsort && st.fsort !== 'official') return { k: st.fsort, color: FBCOLOR[st.fsort] || '#f0b03c' };
    return null;
  }
  function badgeTextFor(it, cfg, k) {
    if (k === 'shelf') return shelfH(it ? it.shelf : 0) + 'h';
    if (k === 'value' || k === 'tvalue') {
      var trade = cfg ? cfg.trade : (it ? it.value : 0);
      var cnt = it ? it.count : 1;
      return String(Math.round((trade || 0) * (cnt || 1)));
    }
    var v = cfg ? (cfg[VFMap[k]] || 0) : (it ? (it[k] || 0) : 0); /* sat/mind/en/hp=配置级 icfg v1/v2/v3/v5 */
    return v > 0 ? String(v) : (v < 0 ? String(v) : '—');
  }
  /* 匹配口径同 applyGridFilter：webui-bag 页 .item id=logicId 精确；Vue 页图标尾段唯一键→
     配置级维度可标；逐叠维度（保质/交易价值）必须实例精确匹配，否则不标（宁缺勿错） */
  function applyBadges() {
    var host = el.srGridHost;
    if (!host || !host.firstElementChild || !el.doc) return;
    var d = el.doc;
    var layer = d.getElementById('srBadgeLayer');
    var spec = badgeSpec();
    if (!spec || st.mode !== 'grid' || st.global) { if (layer) layer.innerHTML = ''; return; }
    var its = host.querySelectorAll('.item');
    if (!its.length) { if (layer) layer.innerHTML = ''; return; }
    if (!layer) {
      layer = d.createElement('div');
      layer.id = 'srBadgeLayer';
      layer.__srBadgeLayer = true;
      host.appendChild(layer); /* 官方格容器之外的自家层：srGridHost 是壳元素，合法 */
    }
    if (!ICONIDX) buildIconIdx();
    var hostRect = host.getBoundingClientRect(), sc = st.gridScale || 1;
    var arr = itemsOf(st.currentId), byId = {};
    for (var i = 0; i < arr.length; i++) byId[String(arr[i].id)] = arr[i];
    var h = '';
    for (var k = 0; k < its.length; k++) {
      var elx = its[k];
      if (elx.getAttribute('data-srhide')) continue;             /* 被筛掉的格不标 */
      var it = byId[String(elx.id || '')] || null;
      var cfgId = it ? it.cfgId : 0, cfg = null;
      if (!cfgId) {
        var img = elx.querySelector ? elx.querySelector('img') : null;
        var tail = img ? String(img.getAttribute('src') || '').split('?')[0].split('/').pop().toLowerCase() : '';
        var e2 = tail ? ICONIDX[tail] : null;
        if (e2 && !e2.ambig) { for (var cid in e2.ids) { cfgId = parseInt(cid, 10); break; } }
      }
      if (cfgId && ICFG[cfgId]) cfg = ICFG[cfgId];
      if (!it && !cfg) continue;
      if (!it && (spec.k === 'shelf' || spec.k === 'value' || spec.k === 'tvalue')) continue;
      var r = elx.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      var x = (r.left - hostRect.left) / sc + r.width / sc;
      var y = (r.top - hostRect.top) / sc;
      h += '<i style="left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px;color:' + spec.color + '">' + badgeTextFor(it, cfg, spec.k) + '</i>';
    }
    if (layer.innerHTML !== h) layer.innerHTML = h; /* 同串免写：防自家写入触发观察器回环 */
  }
  /* 官方格重渲染跟随：观察自家 srGridHost（合法，非官方节点），官方改格后重算角标 */
  function ensureBadgeObserver() {
    var host = el.srGridHost;
    if (!host || host.__srBadgeMO) return;
    try {
      var V = host.ownerDocument.defaultView.MutationObserver;
      host.__srBadgeMO = new V(function () { setTimeout(applyBadges, 50); });
      host.__srBadgeMO.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    } catch (e) { }
  }

  /* ---- 主渲染（Produces：render）——setData 到达/视图态变化后全量刷新 ---- */
  function render() {
    if (!el.rail || !store.ctx) return; /* 未挂载或数据未到：不动（装配后数据先到也能补渲染） */
    /* v1.8.2.5 plainbag（整理物资/材料架 背包侧）：固定背包视图——柜签/搜索/标签/排序/
       列表切换全部隐藏（CSS），页脚=一键整理+一键入库，标题=背包名+格数 */
    if (st.plainBag) {
      st.currentId = store.bag;
      st.mode = 'grid'; st.global = false; st.query = ''; st.tags = [];
    }
    /* v13.5-v13.8 机器页 plain（9 页，不含 BackpackUI 原生/MaterialRack/温室）：固定网格+
       本柜+清筛选；头部/搜索/标签/工具/悬停/N行 由 .plain CSS 隐藏。设施排序钮=食品五页；
       Trade 默认交易价值排序（首包到达后一次性下发 sortBy，之后跟手动）。 */
    var plainSc = isPlainScene();
    el.rail.classList.toggle('plain', plainSc);
    if (plainSc) {
      st.mode = 'grid'; st.global = false; st.query = ''; st.tags = [];
    }
    el.srFoodSort.hidden = !isFoodScene();
    renderTradeInfo();
    if (!el.srFootSortPop.hidden) renderFootSortPop();
    ensureBadgeObserver();
    if (st.scene === 'Trade' && !st.tradeSorted && store.items && bagArr().length > 1) {
      st.tradeSorted = true; /* 每次进页一次性（applyScene 复位）；「默认按交易价值排序」 */
      cmd('sortBy', { owner: st.currentId, key: 'value' });
    }
    var c = ctnById(st.currentId) || railCtns()[0] || null;
    if (!c) return; /* 空契约（无背包无容器）：侧栏保持骨架 */
    st.currentId = c.id;
    applySize(c.cap);
    var fiAll = visItems(), limited = st.global && fiAll.length > GLOBAL_LIMIT;
    var fi = limited ? fiAll.slice(0, GLOBAL_LIMIT) : fiAll;
    el.srTitle.textContent = st.global ? '全库搜索' : nm(c);
    /* 页脚动作组：入库 hidden 规则照 rail.js render()——仅背包页且非整理柜场景（整理柜的
       入库按钮在左侧背包面板底部，T10 装配、T11 接线）；整理 hidden 规则同款（全库视图
       隐藏=对象不明），行为 T12 已接（srTidy→goTidy(st.currentId)） */
    el.srTidy.hidden = !!st.global && !st.plainBag;
    el.srStoreAll.hidden = st.plainBag ? false : (st.currentId !== store.bag || (store.ctx && store.ctx.family === 'rack'));
    el.srCols.textContent = COLS + ' 列';
    el.srCap.textContent = ' · ' + (st.global ? totalCap() + ' 格' : c.cap + ' 格');
    /* 副标标签段：容器标签视图（官方 tagId 查名 ∪ 自定义词 overlay，fix-2 tagNamesOf）
       join ·（无标签则整段空，含背包页） */
    var cn = tagNamesOf(c);
    el.srTags.textContent = st.global ? ' · ' + allCtns().length + ' 个容器' : (cn.length ? ' · ' + cn.join('·') : '');
    el.srScope.textContent = st.global ? '全库' : '本柜';
    el.srScope.classList.toggle('active', st.global);
    el.rail.classList.toggle('bagonly', sceneBagOnly()); /* 场景态类：SCENES 表 + ctx.bagOnly 双源，随数据/场景同步（§4.5） */
    el.srSeg.classList.toggle('lock', st.global);
    el.srSortLbl.textContent = sortLabel();
    el.srDir.textContent = st.dir === 1 ? '↓' : '↑';
    el.srDir.title = st.dir === 1 ? '当前：数值高在前（点击切倒序）' : '当前：数值低在前（点击切回）';
    el.srFill.textContent = st.global
      ? '匹配 ' + fiAll.length + ' 件' + (limited ? '（显示前 ' + GLOBAL_LIMIT + '）' : '')
      : usedCells(fi) + ' / ' + st.cap + ' 格';
    var natH = st.rows * (st.slot + GAP) + 8, canScroll = !st.global && natH > el.srBody.clientHeight + 2;
    el.srView.textContent = st.global ? '全库模式' : st.rows + ' 行 · ' + (canScroll ? '↓ 纵向滚动' : '全部可见');

    var seg = el.srSeg.querySelectorAll('[data-mode]');
    for (var s = 0; s < seg.length; s++) seg[s].classList.toggle('active', seg[s].getAttribute('data-mode') === st.mode);
    renderCtnBar(); renderTags();
    if (!el.srSortPop.hidden) renderSortPop();

    if (st.mode === 'grid' && !st.global) {
      /* 网格模式（v1.8.2）：物品区=官方原版格（mount 时搬进 srGridHost），壳只管显隐与
         筛选 display 层；官方格尺寸/空格/渲染全是官方的（缺陷⑥=天然继承官方尺寸） */
      el.srGridHost.hidden = false; el.srList.hidden = true;
      applyGridFilter(fi);
      st.gridScale = 1;
      /* Bug2 v1.8.2.2 宽度/格子归一：格区等比缩放到恒定 UNI_W（数据层列数已统一 16——
         BackpackExpand.Width=16 / CabinetSize 档位 16；各页官方 slot 38-56px 差异经缩放
         归一为视觉一致——rect 系拖拽/落点按缩放后矩形判定，官方渲染管线零改动）。 */
      if (el.srGridHost.firstElementChild) {
        var nat = el.srGridHost.scrollWidth || 0;
        if (nat > 40) {
          var kk = UNI_W / nat;
          if (kk > 0.2 && kk < 5) {
            el.srGridHost.style.transformOrigin = 'top left';
            el.srGridHost.style.transform = 'scale(' + kk + ')';
            el.srGridHost.style.width = UNI_W + 'px';
            st.gridScale = kk; /* 角标 overlay 坐标除以缩放（getBoundingClientRect 是缩放后值） */
          }
        }
        try {
          var rw2 = (UNI_W + 20) + 'px';
          el.rail.style.setProperty('width', rw2, 'important');
          el.rail.style.setProperty('min-width', rw2, 'important');
          el.rail.style.setProperty('max-width', rw2, 'important');
        } catch (e) { }
      }
      try { applyBadges(); } catch (e) { } /* v13.7 角标（壳层 overlay，官方格重渲染由观察器跟随） */
    } else {
      el.srGridHost.hidden = true; el.srList.hidden = false;
      var d = DYN[st.sort] || DYN.value;
      /* 列表 = 纯汇总展示（v1.8.1 缺陷③口径）：同名且「保质期+flags 全同」（可互换的
         非随机属性叠）才并一行；烹饪产出等随机属性物品逐叠一行（数量=该叠自身）——
         右键动作落点=行首实叠，语义与官方网格右键快转完全一致，不另造总量逻辑 */
      var groups = [], byName = {};
      for (var j = 0; j < fi.length; j++) {
        var it = fi[j];
        var gk = it.name + '|' + (it.shelf || 0) + '|' + (it.flags || 0);
        var g = byName[gk];
        if (!g) {
          g = { name: it.name, icon: it.icon, cat: it.cat, total: 0, entries: [], minShelf: it.shelf, val: 0, srcs: [] };
          byName[gk] = g; groups.push(g);
        }
        g.total += it.count; g.entries.push(it);
        g.val += it.value * it.count;
        if (it.shelf < g.minShelf) g.minShelf = it.shelf;
        if (it.src && g.srcs.indexOf(it.src) < 0) g.srcs.push(it.src);
      }
      LISTGRP = groups;
      var lh = '<div class="sr-lhead"><span></span><span>物品</span><span class="num">数量</span><span class="num">' + d.label + '</span></div>';
      for (var gi = 0; gi < groups.length; gi++) {
        var g2 = groups[gi];
        var dyn = st.sort === 'value' ? g2.val : d.f(g2.entries[0]);
        lh += '<button type="button" class="sr-row' + (st.sel === g2.entries[0].id ? ' selected' : '') + '" data-grp="' + gi + '" data-it="' + g2.entries[0].id + '">' +
          '<span class="ico">' + (g2.icon ? '<img src="' + esc(g2.icon) + '" alt="" aria-hidden="true" draggable="false" style="width:20px;height:20px;object-fit:contain;vertical-align:middle">' : '') + '</span><span class="main"><span class="nm">' + esc(g2.name) + '</span>' +
          '<span class="sub">' + esc(g2.cat) + ' · ' + g2.entries.length + ' 叠 · 保质 ' + shelfH(g2.minShelf) + 'h' +
          (g2.srcs.length ? ' · <i class="src">' + esc(g2.srcs[0]) + (g2.srcs.length > 1 ? ' 等' + g2.srcs.length + ' 处' : '') + '</i>' : '') +
          '</span></span><span class="cnt">×' + g2.total + '</span><span class="dyn">' + dyn + '</span></button>';
      }
      if (!fi.length) lh = '<div class="sr-empty">没有匹配的物品</div>';
      el.srList.innerHTML = lh;
    }
    RENDERED_ID = st.currentId; /* T9：落地「已渲染」标记（回包门判定用） */
    saveSnap(); /* T9：活跃集即当前帧状态，渲染同步进快照（重访重绑换回的就是最新态） */
    if (el.srMid) renderMidChips(); /* T10 中段联动（v1.8.2）：主侧栏任何渲染（切柜/筛选/
       命令回推/active 跟随都汇于 render）连带刷「按标签放入」色点——随 st.currentId 联动
       （v12 第三连修回归点）；非 rack 场景 el.srMid=null 自然跳过 */
  }

  /* ---- 元素引用收集 + 交互接线 ----
     T3 已接：页签单击/网格列表分段/悬停详情；T4 已接：搜索/范围/标签 chips/
     ＋管理弹层/自定义词表/排序下拉/方向/选中态 + document 级弹层关闭与 Esc；
     T5 已接：▾容器菜单（单击切换不关/原地高亮/双击开设置）/✎编辑弹窗/页签拖拽/
     右键取出（take 入队，背包条目 toast 拒绝）；T9 已接：切柜伪造（switchTo 统一出口，
     forge 成功等回包确认渲染）；T10 已接：整理柜双面板——sb* 系列与五按钮 id 一并进引用表
     （每帧重收，重绑路同样覆盖），监听器挂载在 bindBagPanel（bp.__srBound 门防双挂）；
     T11 已接：一键入库确认弹窗（srStoreAll/srStoreGo/srStoreCancel + 左面板 sbStoreAll/
     sbCancel/sbGo，见「T11 一键入库」区）；T12 已接：一键整理（srTidy→goTidy(st.currentId)
     / 左面板 sbTidy→goTidy(store.bag)，见「T12 一键整理」区）。 */
  function bind(doc, railEl) {
    var ids = ['srTitle', 'srCols', 'srCap', 'srTags', 'srTidy', 'srStoreAll', 'srStoreConfirm', 'srStoreText', 'srStoreCancel', 'srStoreGo',
      'srPinRow', 'srOffTabs', 'srAllCtn', 'srSearch', 'srScope',
      'srTagRow', 'srTagAdd', 'srSortBtn', 'srSortLbl', 'srDir', 'srSeg', 'srBody', 'srGridHost', 'srList', 'srHover', 'srFill', 'srView', 'srToast',
      'srCtnPop', 'srCtnPopBody',
      'srCtnEdit', 'srEditName', 'srEditTags', 'srEditSave', 'srEditCancel',
      'srTagManage', 'srTagManageX', 'srTagManageBody', 'srTagNew', 'srTagNewBtn', 'srSortPop', 'srSortPopBody',
      'srFoodSort', 'srFoodSortLbl', 'srFootSortPop', 'srFootSortBody', 'srTrade',
      /* T10 中段（仅 rack 场景存在，非 rack 收集为 null，消费侧守卫；官方两按钮
         btnPutAll/btnTakeAll 零接线——官方监听随 reparent 存活，不入引用表） */
      'srMid', 'srTakeCat', 'srTakeCatMenu', 'srPutCat', 'srPutCatMenu', 'srTagPutIn', 'srTagChips'];
    el = {};
    var d = doc || document; /* mount 传入宿主文档（与 rail 同文档），直开时兜底 window 文档 */
    for (var i = 0; i < ids.length; i++) el[ids[i]] = d.getElementById(ids[i]);
    el.pinRow = el.srPinRow;
    el.rail = railEl || null;
    el.doc = d; /* T10：closeMidMenus 模块级取用（bindBagPanel 开下拉前先收旧菜单） */
    /* T9 重绑幂等门：rail 节点已带监听器（首次 bind 挂过，节点未换）→ 引用表重收即可，
       不再重挂（addEventListener 重复挂会让 contextmenu/drag/dblclick 双发）。
       mount 路（全新 DOM）无标记 → 正常挂全量。 */
    if (railEl && railEl.__srBound) return;
    if (railEl) railEl.__srBound = true;

    /* T3：① 页签单击切容器——renderCtnBar 的 key 短路正是为它服务（切换只翻 active
       不重建）；T5 加 ✎ 分支（方案2主入口）：点击开设置弹窗、不切容器；
       stopPropagation 防冒泡到 document 关闭监听秒关刚开的弹窗（§4.10 豁免同类坑）。
       T9：切换走 switchTo 统一出口（forgeSwitchTo 伪造官方切换，回包确认后才渲染）。 */
    el.pinRow.onclick = function (e) {
      var ed = e.target.closest('.p-edit');
      if (ed) {
        e.stopPropagation();
        openEdit(parseInt(ed.closest('[data-ctn]').getAttribute('data-ctn'), 10));
        return;
      }
      var b = e.target.closest('[data-ctn]'); if (!b) return;
      switchTo(parseInt(b.getAttribute('data-ctn'), 10)); /* T9：切柜统一出口（伪造官方切换+回包确认渲染） */
    };
    /* T5：✎ 上按下不启动拖拽（draggable=false 之外再加一道保险，rail.js 同款） */
    el.srPinRow.addEventListener('mousedown', function (e) {
      if (e.target.closest('.p-edit')) e.stopPropagation();
    });
    /* T5：双击页签同开设置弹窗（隐藏快捷方式，方案2降级入口；单击只切换不重建，
       renderCtnBar key 短路保住节点，dblclick 才能落在同一元素上，§4.10） */
    el.srPinRow.addEventListener('dblclick', function (e) {
      var b = e.target.closest('[data-ctn]'); if (b) openEdit(parseInt(b.getAttribute('data-ctn'), 10));
    });
    /* T5：页签拖拽（背包固定首位不可拖/落点指示/写 srp_pin_order_<scene>） */
    bindPinDrag();

    /* ---- T5：▾ 容器菜单（rail.js el.srAllCtn.onclick/srCtnPopBody.onclick 移植）----
       ▾ 唯一入口；点空白处收起（document 级监听已在下方）。 */
    el.srAllCtn.onclick = function () { closePops('ctn'); el.srCtnPop.hidden = !el.srCtnPop.hidden; renderCtnPop(); };
    el.srCtnPopBody.onclick = function (e) {
      var b = e.target.closest('[data-ctn]'); if (!b) return;
      switchTo(parseInt(b.getAttribute('data-ctn'), 10)); /* T9：同页签路径（▾ 菜单切柜；渲染时机由 switchTo 裁定——forge 成功等回包） */
      /* 单击只切换不关菜单（关了第二次点击就没处落，双击永远触发不了）；cur 高亮
         原地翻、节点不替换（§4.10 原地更新纪律——菜单行 dblclick 依赖同一元素连击）。
         不再本地 render：cur 翻色已就地可见，物品区等回包确认（forge 失败时 switchTo
         自行兜底渲染）。 */
      el.srCtnPopBody.querySelectorAll('[data-ctn]').forEach(function (x) {
        x.classList.toggle('cur', x === b);
      });
    };
    /* T5：双击菜单行 = 打开设置并关菜单（rail.js 同款） */
    el.srCtnPopBody.addEventListener('dblclick', function (e) {
      var b = e.target.closest('[data-ctn]');
      if (b) { el.srCtnPop.hidden = true; openEdit(parseInt(b.getAttribute('data-ctn'), 10)); }
    });

    /* ---- T5：✎ 编辑弹窗接线（rail.js srEditTags/srEditSave/srEditCancel/srEditName）---- */
    el.srEditTags.onclick = function (e) {
      var b = e.target.closest('[data-tg]'); if (!b) return;
      var t = b.getAttribute('data-tg'), i = st.editTags.indexOf(t);
      if (i >= 0) st.editTags.splice(i, 1); else st.editTags.push(t);
      b.classList.toggle('active', st.editTags.indexOf(t) >= 0); /* 原地翻色（内容重建无必要） */
    };
    el.srEditSave.onclick = saveEdit;
    el.srEditCancel.onclick = function () { el.srCtnEdit.hidden = true; };
    el.srEditName.onkeydown = function (e) { if (e.key === 'Enter') saveEdit(); };

    /* ---- T11：一键入库确认弹窗（rail.js srStoreAll/srStoreGo/srStoreCancel 移植+命令化；
       按钮显隐已由 render() 的 hidden 规则管（背包页且非 rack 家族），rack 场景同款流程
       在左面板 sbStoreAll——bindBagPanel 接线）。 ---- */
    el.srStoreAll.onclick = openStoreConfirm;
    el.srStoreGo.onclick = goStoreAll;
    el.srStoreCancel.onclick = function () { el.srStoreConfirm.hidden = true; };

    /* ---- T12：一键整理（rail.js el.srTidy.onclick = tidy() 同位；任意容器可用——
       owner=st.currentId，bag 页即背包；无确认直发，空容器 goTidy 内 toast 零命令；
       全库视图按钮 hidden=render() 规则管（对象不明），点了也到不了这里）。 ---- */
    el.srTidy.onclick = function () { goTidy(st.currentId); };

    /* ---- 右键语义（v1.8.2 v13 口径：零接线）----
       网格/整理柜行组件=官方 DOM：右键=官方原生（快转一件/高亮键批转/行锁定等），壳零接线
       零拦截——官方监听在官方节点上原样跑。srBody 级 preventDefault 只吞浏览器默认菜单
       （官方 handler 在更深节点先跑，不受影响）。列表=纯汇总只读（行零事件，§0 红线）。 */
    el.srBody.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    /* T3：② 网格/列表分段（rail.js 原样；全库模式锁定列表视图） */
    el.srSeg.onclick = function (e) {
      if (st.global) return; /* 全库模式锁定列表视图 */
      var b = e.target.closest('[data-mode]'); if (!b) return;
      st.mode = b.getAttribute('data-mode');
      render();
    };
    /* T3：③ 悬停详情条（只读 UI 反馈；v1.8.2 文案=官方原生口径 §4.8：网格官方格右键快转/
       高亮键批转；列表纯汇总只读无动作提示。[data-it] 网格分支在官方格模式下天然不触发，
       留作 harness/列表行内的兜底路径） */
    el.srBody.onmouseover = function (e) {
      var gr = e.target.closest('[data-grp]');
      if (gr) {
        var g = LISTGRP[parseInt(gr.getAttribute('data-grp'), 10)];
        if (g) el.srHover.innerHTML = '<b>' + esc(g.name) + '</b> ×' + g.total + ' · ' + g.entries.length + ' 叠 · 保质 ' + shelfH(g.minShelf) + 'h' +
          (g.srcs.length ? ' · 来自 ' + esc(g.srcs[0]) + (g.srcs.length > 1 ? ' 等 ' + g.srcs.length + ' 处' : '') : '') +
          ' · 纯汇总展示（到网格操作）';
        return;
      }
      var n = e.target.closest('[data-it]'); if (!n) return;
      var it = entryById(parseInt(n.getAttribute('data-it'), 10)); if (!it) return;
      el.srHover.innerHTML = '<b>' + esc(it.name) + '</b> ×' + it.count + ' · 交易 ' + it.value + ' · 保质 ' + shelfH(it.shelf) + 'h · 饱食 +' + it.sat +
        (it.src ? ' · 来自 ' + esc(it.src) : '') + ' · 官方原生：右键快转 · 高亮键批转';
    };
    el.srBody.onmouseleave = function () { el.srHover.textContent = '悬停查看物品详情'; };

    /* ---- T4 交互（rail.js bind() 移植）---- */
    /* 搜索 + 范围切换：全库自动锁列表（prevMode 备忘），退出恢复 */
    el.srSearch.oninput = function () { st.query = el.srSearch.value; render(); };
    el.srScope.onclick = function () {
      st.global = !st.global;
      if (st.global) { st.prevMode = st.mode; st.mode = 'list'; }
      else st.mode = st.prevMode || 'grid';
      render();
    };
    /* 快捷标签行：chip 点=切换筛选，× =移出快捷栏（自定义词表同步移除并持久化） */
    el.srTagRow.onclick = function (e) {
      var x = e.target.closest('[data-tx]');
      if (x) {
        var tx = x.getAttribute('data-tx'), i = COMMON.indexOf(tx);
        if (i >= 0) COMMON.splice(i, 1);
        var ci = CUSTOM.indexOf(tx); if (ci >= 0) CUSTOM.splice(ci, 1);
        if (i >= 0) saveCommon();
        if (ci >= 0) saveCustom(); /* rail.js 漏存词表，正式版补齐（§4.9 词表全局持久） */
        var f = st.tags.indexOf(tx); if (f >= 0) st.tags.splice(f, 1);
        render(); return;
      }
      var b = e.target.closest('[data-tag]'); if (!b) return;
      var t = b.getAttribute('data-tag');
      if (t === '__all') st.tags = [];
      else { var i2 = st.tags.indexOf(t); if (i2 >= 0) st.tags.splice(i2, 1); else st.tags.push(t); }
      render();
    };
    /* ＋ 唯一管理弹层入口（先切 hidden 再渲染内容，§4.10；hidden 态 renderTagManage 早退） */
    el.srTagAdd.onclick = function () { closePops('tag'); el.srTagManage.hidden = !el.srTagManage.hidden; renderTagManage(); };
    el.srTagManageX.onclick = function () { el.srTagManage.hidden = true; };
    /* 管理弹层：点=加入快捷栏（同时进筛选态）；已在快捷栏=移除 */
    el.srTagManageBody.onclick = function (e) {
      var b = e.target.closest('[data-tg]'); if (!b) return;
      var t = b.getAttribute('data-tg'), i = COMMON.indexOf(t);
      if (i >= 0) {
        COMMON.splice(i, 1);
        var ci = CUSTOM.indexOf(t); if (ci >= 0) CUSTOM.splice(ci, 1);
        var f = st.tags.indexOf(t); if (f >= 0) st.tags.splice(f, 1);
        saveCommon();
        if (ci >= 0) saveCustom();
        render(); renderTagManage();
      } else if (tryAddQuick(t)) {
        st.tags.push(t);
        saveCommon(); render(); renderTagManage();
      }
    };
    /* 自定义词表新增（≤6 字输入框 maxlength 在 RAIL_HTML；重名拒绝；两行上限走
       tryAddQuick 统一拒绝+toast；失败不落词表） */
    function addCustom() {
      var v = el.srTagNew.value.trim();
      if (!v) return;
      if (COMMON.indexOf(v) >= 0) { toast('该标签已在快捷栏'); return; }
      if (CUSTOM.indexOf(v) >= 0) { toast('该标签已在词表'); return; } /* T5 随行项：防词表重复（词表在快捷栏之外残留时不致双写） */
      if (!tryAddQuick(v)) { el.srTagNew.value = ''; return; }
      CUSTOM.push(v); st.tags.push(v);
      saveCustom(); saveCommon(); /* §4.9：词表全局 + 快捷栏引用按场景（rail.js 漏 saveCommon，正式版补齐） */
      el.srTagNew.value = '';
      render(); renderTagManage();
    }
    el.srTagNewBtn.onclick = addCustom;
    el.srTagNew.onkeydown = function (e) { if (e.key === 'Enter') addCustom(); };
    /* 排序：自定义下拉 + 方向切换 */
    el.srSortBtn.onclick = function () { closePops('sort'); el.srSortPop.hidden = !el.srSortPop.hidden; renderSortPop(); };
    el.srSortPopBody.onclick = function (e) {
      var b = e.target.closest('[data-sort]'); if (!b) return;
      st.sort = b.getAttribute('data-sort');
      el.srSortPop.hidden = true; render();
    };
    el.srDir.onclick = function () { st.dir = -st.dir; render(); };
    /* ---- v13.5-v13.8：食品五设施页脚排序钮（作者参考图 7 项）→ C# sortBy 数据层重排 ---- */
    el.srFoodSort.onclick = function () { closePops('fsort'); el.srFootSortPop.hidden = !el.srFootSortPop.hidden; renderFootSortPop(); };
    el.srFootSortBody.onclick = function (e) {
      var b = e.target.closest('[data-fsort]'); if (!b) return;
      var key = b.getAttribute('data-fsort');
      el.srFootSortPop.hidden = true;
      applyFsort(key);
    };
    /* 选中态（左键点物品/列表行切换；右键取出 = T5） */
    el.srBody.onclick = function (e) {
      var n = e.target.closest('[data-it]'); if (!n) return;
      var id = parseInt(n.getAttribute('data-it'), 10);
      st.sel = st.sel === id ? null : id; render();
    };
    /* 点空白处/Esc 关弹层（document 级只挂一次/文档：正式版每次 mount 重建 #srp，
       守卫从 rail.js 的 root 常驻标记挪到 doc 上，防监听器随场景切换堆积；豁免清单照
       rail.js——弹层内点击与开弹层按钮不关（srStoreAll 豁免=v9 踩坑：不豁免则同一次
       点击冒泡到 document 把刚开的确认弹窗秒关））。closeMidMenus = T10 提升到模块级
       （rack 场景装配前文档里无 .category-dropdown 节点，调用为空操作）。
       v1.8.2：sb* 族弹窗/按钮随左面板官方化退役，关闭通道收敛。 */
    if (!d.__srDocBound) {
      d.__srDocBound = true;
      d.addEventListener('click', function (e) {
        if (!el.srCtnPop) return;
        var t = e.target;
        if (t.closest && t.closest('.sr-pop')) return;
        if (t.closest && (t.closest('#srAllCtn') || t.closest('#srTagAdd') || t.closest('#srSortBtn') || t.closest('#srStoreAll') || t.closest('#srFoodSort'))) return;
        closePops();
        /* 官方分类下拉：点下拉外任意处收起（wrapper 内豁免，防同次点击开合互搏；rack 装配后生效） */
        if (d.querySelector('.category-dropdown:not([hidden])') && t.closest && !t.closest('.category-dropdown-wrapper')) closeMidMenus();
      });
      d.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          closePops();
          closeMidMenus();
        }
      });
    }
  }

  /* ---- 装配（T8 正式版）----
     宿主解析照 SCENES.host：'#anchor.closest(SELECTOR)' 形态 = id 锚点再向上最近祖先。 */
  function resolveHost(doc, sel) {
    var k = sel.indexOf(".closest('");
    if (k > 0) {
      var a = doc.querySelector(sel.slice(0, k));
      return a ? a.closest(sel.slice(k + 10, sel.length - 2)) : null;
    }
    return doc.querySelector(sel);
  }
  /* railui.css 注入（T8 样式随 JS 单资源方案）：样式表文本由 C# bootstrap 经
     window.__CERAIL_CSS__ 带入（railui.page.js 与 railui.css 两个 EmbeddedResource 在 C# 侧
     拼一次缓存）——rail DOM 在场景 iframe 文档里，CSS 必须逐 iframe 文档注入（Root 文档的
     样式管不到 iframe，T8 实现裁定：bootstrap 把 CSS 文本存 __CERAIL_CSS__，此处消费）。
     旧 harness 直引 ../railui.css（<link>）且无 __CERAIL_CSS__，自然跳过。幂等按 style
     id=srpRail 判重；对齐裁定命名。 */
  function injectRailStyle(doc) {
    var css = window.__CERAIL_CSS__;
    if (!css || doc.getElementById('srpRail')) return;
    var st = doc.createElement('style');
    st.id = 'srpRail';
    /* 末尾兜底规则（brief Step 3 欠账补齐）：置于注入文本最末赢下同优先级级联——官方页面
       自带/运行时插入的 [hidden] display 覆盖不得穿透 rail（railui.css 作用域版在文件中部，
       这里补一份末尾注入版）；官方运行时浮层（tooltip/拖拽幽灵）的 extras 正则 hidden 仍
       不做（Vue 驱动，实机归 T14 观察）。 */
    st.textContent = css + '\n/* T8 注入兜底：rail 内 [hidden] 语义不被页面级覆盖 */\n#srp [hidden]{display:none !important}';
    (doc.head || doc.documentElement).appendChild(st);
  }
  /* T8 mount（harness 与 ensureMounted 共用装配核心）：CSS 注入 → 旧包裹层摘除（场景重入/
     重挂幂等）→ 建 #srp>#srRail 原位替换宿主 → bind + 场景态 + 补渲染。返回 true=装配成功。
     clickThrough（T8 裁定 3）：rail 根容器（wrap 与 rail）打 data-interactive——官方
     webui-core.js clickThrough 的采集 selector 为 '.unity-interactive, button, input, select,
     a, [data-interactive]'，rail 全部可交互控件本就是 <button>/<input>（对照 Cooking.html
     按钮同款写法），根容器补 data-interactive 让整块 428×816 矩形进上报集。rect 上报循环由
     页面自己的 clickThrough.start() 驱动（BackpackUI/TradeUI 已 start：其 body 级
     MutationObserver 会在 rail 装入/重渲染时自动把 rail 矩形并进上报；其余 10 页官方未
     start——与官方面板同享整面交互，不自行另起上报循环以免缩小官方交互面）。 */
  /* ---- T9 评审 Critical：官方渲染段桩节点（stubs；fix round 3 扩展类名桩）----
     宿主替换后，官方页面自身 BagMsg/StatusMsg 渲染段的 live $()/getElementById/
     querySelector 解引用被摘节点 → 每条官方推送必抛 TypeError、中断 handler 后续逻辑
     （机器功能区显示冻结）。对 SCENES.stubs 声明的目标在 #srp 内建隐藏桩：官方查询命中
     桩不抛、写进桩（display:none 不可见），handler 后续逻辑（机器区渲染）照常跑。
     条目两种形态：'id'（bare id，原批）与 '.class'（fix round 3 新增——ToolTable
     StatusMsg 的 '.weight-text'/'.weight-fill' 仅类名无 id（markup L1968/L1971），每条带
     weightCurrent/weightMax 的 StatusMsg 在此解引用必抛，复审实锤）。统一标记
     data-cer-stub="1"：stripStubs 按 [data-cer-stub] 定位自家桩（类名不唯一，须标记防与
     官方复活节点混淆）。
     生命周期（裁定 2）：桩随 #srp 存活；宿主复活时 ensureMountedFrame 先 stripStubs
     （真节点回文档后桩的重复 id 会让官方查询命中桩而非真节点），mount 重替换后重建新桩。
     正交设计（裁定 5）：桩目标由 SCENES.stubs 每页声明驱动，不写死页名分支。
     类查询复核（fix round 3 全 9 页扫源修正）：类选择器 ∩ 宿主子树仅 ToolTable 命中 12
     条——'.weight-text'/'.weight-fill' 为 StatusMsg 内无守卫解引用（前轮「全带守卫」结论
     被此证伪，类桩能力即为此补）；其余（.left-tabs/.left-tab.active/.left-tab-pinned/
     .left-tab.guide-hint/.weight-section）单发解引用全部带 null 守卫（syncLeftTabsWidth
     `if (!bar) return`、scrollActiveTabIntoView `if (!el) return`、applyBagMsg
     `if (weightSection)` 等）或从被桩祖先（$('tabsScroll') 返回桩→querySelector null→守卫
     早退）发起；querySelectorAll 类目标为空 NodeList 空循环天然安全——故只需这两条类桩，
     其余 8 页类查询∩宿主复核零命中（scan 脚本留档 tmp-t8/scan-host-classes.cjs）。 */
  function buildStubs(doc, sc, wrap) {
    var stubs = sc.stubs;
    if (!stubs || !stubs.length) return;
    for (var i = 0; i < stubs.length; i++) {
      var tok = stubs[i], byClass = tok.charAt(0) === '.', name = byClass ? tok.slice(1) : tok;
      /* 命中检查：id 桩按 id、类名桩按宿主外同 class 元素查重——官方查询已有真命中物则
         不建桩（防 id/class 重复让官方查询落到桩上） */
      var exists = byClass ? doc.querySelector('.' + name) : doc.getElementById(name);
      if (exists) continue;
      var stub = doc.createElement('div');
      if (byClass) stub.className = name; else stub.id = name;
      stub.setAttribute('data-cer-stub', '1');
      stub.hidden = true;
      stub.style.display = 'none'; /* 行内 + hidden 属性 + 我们的 `#srp [hidden]{display:none!important}` 三重，官方页面级 CSS 顶不掉 */
      wrap.appendChild(stub);
    }
  }
  function stripStubs(doc) {
    var stubs = doc.querySelectorAll('[data-cer-stub]');
    for (var i = 0; i < stubs.length; i++) if (stubs[i].parentNode) stubs[i].parentNode.removeChild(stubs[i]);
  }
  function mount(doc, sceneKey) {
    var sc = SCENES[sceneKey];
    if (!doc || !sc) return false;
    injectRailStyle(doc);
    /* 官方物品区引用必须在任何摘除/替换【前】取（v13 实证教训：宿主子树脱离文档后
       doc.getElementById 找不到；上一轮 mount 的官方格此刻可能还在旧 #srp 里——同样
       先拿引用再摘，引用跨摘除存活）。rack 场景相反：**先摘旧壳再按 id 取件**——旧壳内
       reparent 的官方件与新官方重建件会同 id 冲突（getElementById 文档序先到先得），
       摘旧壳后取到的必是官方新版。v1.8.2.5：rack 已改面板级替换，此条仅历史注释。 */
    var officialGrid = null;
    if (sc.grid) {
      officialGrid = sc.grid.charAt(0) === '.'
        ? (doc.querySelector(sc.grid) || null)
        : (doc.getElementById(sc.grid) || null);
    }
    var host = resolveHost(doc, sc.host);
    if (!host) return false;
    /* v1.8.2.5 统一口径（作者裁决：整理物资=简洁存储取物界面）——BackpackUI 与 MaterialRack
       都**只替换背包侧 .bag-panel:not(.is-storage)** 为简洁背包栏（plainbag：标题+官方格+页脚
       整理/入库；无页签/搜索/标签/排序/列表切换）；柜子侧面板与官方转移列原样不动。
       BackpackUI：容器 ready 门照旧（v-show=InfoAMsg 到达即形态已定）；dual=transfer-controls
       在场→plainbag；A 头部官方 aTabs（若有）入 #srOffTabs 槽保原生切换。
       MaterialRack：宿主即左侧背包面板；官方转移列 append mod 三增值按钮（rackMid）。 */
    var bpDual = false, bpPanel = null, bpTabs = null;
    if (sceneKey === 'BackpackUI') {
      try { if (doc.defaultView.getComputedStyle(host).display === 'none') return false; } catch (e) { }
      bpDual = !!(host.querySelector && host.querySelector('.transfer-controls'));
      bpPanel = host.querySelector('.bag-panel:not(.is-storage)');
      if (!bpPanel) return false; /* 面板未建：等下一轮 */
      var tabsEl = bpPanel.querySelector('.bag-tabs');
      if (tabsEl && tabsEl.querySelector('.bag-tab')) bpTabs = tabsEl;
    } else if (sceneKey === 'MaterialRack') {
      bpPanel = host; /* 宿主即左侧背包面板（SCENES.host 已收窄到 :not(.is-storage)） */
    }
    st.domDual = bpDual;
    st.domAtabs = !!bpTabs;
    st.plainBag = !!(sc.plainBag) || bpDual; /* 简洁背包栏：render 固定背包视图+页脚双按钮 */
    if (bpTabs) rail.className += ' atabs';
    /* 网格从**本面板**内取（文档序首个 .grid-container 可能是另一侧，不能泛取） */
    if (bpPanel) {
      var bpGrid = bpPanel.querySelector('.grid-container');
      if (bpGrid) officialGrid = bpGrid;
    }
    /* 旧包裹层摘除（T8 重挂幂等：同 doc 重入/宿主复活重装配时先清自家残骸；
       harness 三场景同文档切换时也在此清掉上一场景的 #srp。officialGrid 引用已先取，
       随旧 #srp 一起摘除后再入新壳，节点不丢。rack 场景已在上方先撤，此处幂等空过） */
    var old = doc.getElementById('srp');
    if (old && old.parentNode) { try { old.parentNode.removeChild(old); } catch (e) { } }
    var rail = doc.createElement('div');
    rail.className = 'sr-rail' + (sc.bagOnly && !bpDual ? ' bagonly' : ''); /* 初类按 SCENES 表（BackpackUI dual=非 bagonly，Bug1）；ctx.bagOnly/sceneBagOnly 由 render 随数据同步 */
    /* 格子尺寸跟官方（缺陷⑥，v1.8.1 起由官方格自带尺寸继承；--sr-slot 仅列表行参考） */
    try { rail.style.setProperty('--sr-slot', slotOf(sc) + 'px'); } catch (e) { }
    rail.id = 'srRail';
    rail.setAttribute('data-interactive', '');
    rail.innerHTML = RAIL_HTML;
    if (st.plainBag) rail.className += ' plainbag'; /* v1.8.2.5：简洁背包栏（CSS 隐 ctnbar/搜索/标签/工具行） */
    /* v1.8.2.5：BP/rack 官方格与页签行在**替换面板前**入壳（格进 srGridHost、页签行进
       #srOffTabs 槽，Vue 后续 patch 按引用继续渲染） */
    if (bpPanel) {
      var ghB = rail.querySelector('.sr-gridhost');
      if (ghB && officialGrid) { try { ghB.appendChild(officialGrid); } catch (e) { } }
      if (bpTabs) {
        var ot = rail.querySelector('#srOffTabs');
        if (ot) { try { ot.appendChild(bpTabs); ot.hidden = false; } catch (e) { } }
      }
    }
    /* rack（rackMid）：mod 三增值按钮 append 进官方转移列（官方两按钮原序在前；替换宿主前
       完成，buildStubs 时官方列已在文档不建桩——#srMid 残留先清防重） */
    if (sc.rackMid) {
      var midHost0 = doc.querySelector('.transfer-controls');
      if (midHost0) {
        var stale0 = midHost0.querySelector('#srMid');
        if (stale0 && stale0.parentNode) stale0.parentNode.removeChild(stale0);
        var midExtra0 = doc.createElement('div');
        midExtra0.id = 'srMid';
        midExtra0.innerHTML = MID_EXTRA_HTML;
        midHost0.appendChild(midExtra0);
      }
    }
    /* railui.css 选择器全部 #srp 前缀：侧栏连一层 #srp 包裹一起原位替换宿主。每次 mount
       都用全新包裹（复用旧 #srp 会把侧栏挂回旧场景遗留的包裹层里——harness 双场景实测踩坑）。
       缩放（§1 实现期决定项）：宿主原位即在官方 createViewportFit/applyViewportFit 的缩放
       容器（body/app zoom）之内，侧栏天然跟随页面缩放；T14 实测若恒定抖动再改挂 zoom 容器
       外层（此注释即裁定记录，挂宿主位=当前实现）。
       T10 整理柜三段壳（sc.rack，v1.8.2 v13）：#srp 内先架**作用域容器**（继承
       id=rackSystem+class=rack-system+data-sr-scope 标记）——官方 scoped 选择器
       （groundDock 的 '#rackSystem .panel/.header/.transfer-controls'）、flyer 定位
       （createItemFlyer host=$('rackSystem')）、createViewportFit 测量（measureSelector
       '.rack-system'）全部继续命中；.rack-system 自带 flex row 布局=三段并排。三段 =
       左官方 .bag-panel 原件 + 中官方 .transfer-controls 原件（mod 三按钮 append 其尾）+
       右 rail 壳（官方右面板进 srGridHost 后自然成第三段）。桩机制与宿主正交：stubs 自愈
       （reparent 后真节点在文档=不建桩）。宿主复活判定特判见 hostAlive()。 */
    var wrap = doc.createElement('div');
    wrap.id = 'srp';
    wrap.setAttribute('data-interactive', '');
    wrap.appendChild(rail);
    /* v1.8.2.5：BackpackUI 与 MaterialRack 都换背包侧 .bag-panel（面板级，柜子侧/转移列
       官方原样）；其余场景换宿主本体 */
    var replaceTarget = bpPanel || host;
    replaceTarget.parentNode.replaceChild(wrap, replaceTarget);
    buildStubs(doc, sc, wrap); /* T9 桩节点（SCENES.stubs 声明驱动；宿主已移除后建，真节点不在=无 id 重复。rack：真节点已 reparent 在文档 → 自愈不建桩） */
    bind(doc, rail); /* bind 内部 el={} 重建引用表并挂 rail（rail.js 同款；T9 重绑路复用同一函数，__srBound 门防监听器重复挂） */
    /* v1.8.2 核心：官方物品区整体搬进壳 body（appendChild 移动节点=id/官方监听/官方
       渲染通道全保留；官方页按 id 查询照常命中，webui-bag 的 _cachedContainer 仅拖拽期
       缓存且松手即清）。网格模式壳不画任何格子——物品面=官方原版格，拖拽进机器槽/
       左键详情/右键快转全部原生。rack：右段=官方 .bag-panel.is-storage（rackTitle+
       rsw 机器人开关+panelB 汇总行面板）整件进 srGridHost——行拖拽/右键取1/锁定/
       取出最多/落点预览全原生，rackOpen 切柜后官方重渲染写进同一容器。 */
    if (officialGrid && !bpPanel && el.srGridHost) {
      try { el.srGridHost.appendChild(officialGrid); } catch (e) { }
    }
    if (sc.rackMid) bindMid(); /* 中段 mod 三按钮接线（mid 容器 __srMidBound 门防重绑双挂；官方两按钮零接线） */
    /* T4 场景态随装配应用：st.scene←sceneKey（T3 评审随行项①——分场景 localStorage 键
       srp_*_<scene> 由此对齐，否则 harness 切 rack 场景会错位成上一场景/undefined）；
       applyScene 内含 PIN_KEY=''（全新侧栏 DOM 页签结构必重建——key 短路只对同一棵
       pinrow 节点有效，不复位则换场景重挂后页签栏空白，harness 往返实测踩坑）。
       ensureMounted 传入的 sceneKey 恒为 SCENES 规范键（iframe id 经 ID_ALIAS 归一），
       与 ctx.page 同名字空间。此刻 ctx 可能未到（entryDefault 落旧值），sceneApplied 门
       会让随后的首包 setData 用真实 ctx 再补应用一次。
       T9：全新 DOM = 全新瞬态视图——上一活跃场景的搜索词/标签筛选/全库态不串味
       （重访路走 rebindFrame 快照恢复，不经此处；re-apply 路由 sceneApplied 门短路，
       不重置在途筛选）。 */
    st.query = '';
    st.tags = [];
    st.global = false;
    st.lockW = 0; /* Bug2 壳宽只增锁：全新页面重置 */
    try { rail.style.removeProperty('width'); rail.style.removeProperty('min-width'); rail.style.removeProperty('max-width'); } catch (e) { }
    if (mountedOk(doc, sc)) return;                    /* 在位且宿主未复活：观察器/interval 噪声快速路径（BP 形态翻转由 Vue 重建摘壳→hostAlive('bp')=true→自然重装） */    applyScene(sceneKey);
    TM_KEY = ''; /* 全新弹层 DOM：管理弹层结构必重建（同 PIN_KEY 道理，key 短路只对同一棵节点有效） */
    if (store.ctx) render(); /* 数据先到、装配后到：补一次渲染 */
    return true;
  }

  /* ================= T9 官方联动：切柜伪造 + active 跟随 + postMessage 包装链 =================
     移植自 tagfilter.page.js（DESIGN.md 附录 A 十页对照的活代码；两文件生命周期独立，
     整段自含、不引用 __SLTF__）。
     通道（webui-core.js/Root.html 实证）：官方页面发事件 = core.UnitySendEvent →
     window.parent.postMessage({type,data,sourcePageId}) → Root 转发只认 sourcePageId
     （resolveSourceId 的 claimed 分支）→ Unity；官方回包 = Root case 8/10 →
     frame.contentWindow.postMessage({type,data})。rail 在 Root 帧，从 Root 帧直发即模拟
     页面来源（tagfilter forgeSwitch 同款通道，resolveSourceId claimed 分支）。

     族别判定与 tagfilter 的差异（裁定记录）：tagfilter 用 detectC 从 DOM 探族（bag 容器
     class 与 trade 同名 .bag-tabs-scroll，必须 bag 先于 trade 判）；rail 侧官方页签栏在
     宿主替换后已不存在（SCENES.host 的「替换即消亡」裁定，T8——Cooking 宿主 .panel 内含
     #bagTabs、ToolTable 宿主 .backpack-panel 内含 .left-tabs 列等，12 页页签容器全部随
     宿主移除，rail 自身即页签 UI），detectC 的 DOM 探测在装配后恒 null，故族别改由
     SCENES.family 静态表给出（同一取证表产物，与 detectC 五族一一对应：
     bag/bag、tt/tt、trade/trade、cart/cart、cart0/cart0、backpack·rack=无页签族），
     页签数组改由回包消息缓存（extractTabs，tagfilter st.tabs 同语义）。
     各族签名照附录 A 照抄：bag=SWITCH_BAG{ownerId:数字}、trade=SWITCH_BAG{ownerId:字符串}
     （官方=String(tab.owner) attr 直读——rail 直知 ownerId 同型直给）、
     tt=TAB_SWITCH{tab:数组下标+2}（0=背包/1=抽屉在栏外；edge：背包首位→tab:0 显式分支）、
     cart=TAB_SWITCH{tab:下标}（pin 背包占 0）、cart0=TAB_SWITCH{tab:下标}（无 pin）。
     hasActive 字段清单照抄：{bagOwnerId, bagOwnerKey, activeLeftTab, activeTab}。 */
  var TABS = {}; /* sceneKey → extractTabs 归一化页签数组缓存（String|null[]；tt/cart 索引族解 active/forge 对位用） */

  /* ---- extractTabs（tagfilter 原样移植：*_BagMsg → 页签 owner 数组，含 null 占位维持对齐）---- */
  function normOwner(t) {
    if (!t) return null;
    var o = (t.ownerId != null) ? t.ownerId : ((t.owner != null) ? t.owner : null);
    return (o == null || o === '') ? null : String(o);
  }
  function extractTabs(msg) {
    try {
      if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('BagMsg') < 0) return null;
      var d = msg.data;
      if (typeof d === 'string') d = JSON.parse(d);
      if (!d) return null;
      var arr = null;
      if (d.bagTabsJson) arr = JSON.parse(d.bagTabsJson);
      else arr = d.cabinetTabs || d.bagTabs || d.cartTabs || null;
      if (!arr) return null;
      var out = [];
      for (var i = 0; i < arr.length; i++) out.push(normOwner(arr[i]));
      return out;
    } catch (e) { return null; }
  }

  /* ---- 伪造事件构造（附录 A 各族签名；位置族需 TABS 缓存对位——宁可不切也不错切）----
     tt 族 edge 落点（tagfilter forgeSwitch isEdge 显式分支照抄）：背包首位不在 cabinetTabs
     数组内（0=背包/1=抽屉在栏外，offset 0），indexOf 必失——bail 只本地渲染会被下一包
     activeLeftTab 拽回旧柜（T9 评审 Important 实锤）→ 显式 TAB_SWITCH{tab:0}（rail 无
     抽屉页签，tab:1 不入路径）。 */
  function buildSwitchEvent(key, target) {
    var sc = SCENES[key];
    if (!sc) return null;
    var t = String(target);
    if (sc.family === 'bag') {
      var n = parseInt(t, 10);
      return isNaN(n) ? null : { type: 'SWITCH_BAG', data: { ownerId: n } };
    }
    if (sc.family === 'trade') return { type: 'SWITCH_BAG', data: { ownerId: t } };
    if (sc.family === 'tt' && t === String(store.bag)) return { type: 'TAB_SWITCH', data: { tab: 0 } };
    var arr = TABS[key];
    if (!arr) return null;
    var j = arr.indexOf(t);
    if (j < 0) return null;
    if (sc.family === 'tt') return { type: 'TAB_SWITCH', data: { tab: j + 2 } };
    if (sc.family === 'cart' || sc.family === 'cart0') return { type: 'TAB_SWITCH', data: { tab: j } };
    return null;
  }
  function frameByKey(key) {
    for (var i = 0; i < FRAMES.length; i++) if (FRAMES[i].key === key) return FRAMES[i];
    return null;
  }
  /* rail 切柜 → 伪造页面同款切换事件（Root 帧直发，sourcePageId=iframe 元素 id——
     Root resolveSourceId claimed 分支同款，tagfilter forgeSwitch 的发送侧）。
     返回 true=已发（渲染交回包确认）；false=无官方链（backpack/rack 无页签族/缓存未到
     bail），调用方本地兜底渲染。 */
  function forgeSwitchTo(ownerId, key) {
    var k = key || st.scene;
    var f = frameByKey(k);
    if (!f || !f.el || !f.el.isConnected) return false;
    var ev = buildSwitchEvent(k, ownerId);
    if (!ev) return false;
    try { window.postMessage({ type: ev.type, data: ev.data, sourcePageId: f.el.id }, '*'); return true; } catch (e) { return false; }
  }
  /* rail 切柜统一出口（页签/▾ 菜单等一切改 currentId 的路径）：
     st.currentId 立即记下（防回环——回包 active===currentId 时由 RENDERED_ID 门幂等），
     forge/rackOpen 成功不乐观渲染（等回包 active 确认后 followActive 统一 render，与无乐观
     刷新纪律一致）；forge 不可达（无页签族/缓存未到）→ 本地数据仍为真，直接渲染。
     **rack 场景（v1.8.2 v13）不走 forge**——页面无切柜事件，改发 rackOpen 命令：C# 重放
     官方 Ac_MaterialRack_Open → State_Web_MaterialRack 整体重绑（RackOwnerId/rows/
     furnitureName）→ 官方行组件原生重渲染 + ctx.rackOwner 回推 → activeOwnerOf(rack 族)
     读 rackOwnerId → followActive 收敛（防抖：切换中重复点击由 C# 侧最后一条定胜负，
     JS 侧幂等门兜底）。 */
  function switchTo(id) {
    id = parseInt(id, 10);
    if (!ctnById(id) || id === st.currentId) return;
    st.currentId = id;
    st.sel = null;
    saveSnap();
    if (store.ctx && store.ctx.family === 'rack') {
      cmdOut('rackOpen', { owner: id }); /* 官方动作重放（非 forge）；渲染等 state 重绑回包 */
      return;
    }
    /* v1.8.2：forge 官方切换 → 官方格（在壳内）按新容器重渲染（原生通道）；forge 不可达
       （无页签族/缓存未到）→ 本地数据仍为真，直接渲染 */
    if (!forgeSwitchTo(id)) { if (el.rail) render(); }
  }
  /* ---- active 字段读取（附录 A 各族 active 语义，tagfilter readActive 移植 + rack 特例）----
     返回 owner 字符串或 null。索引族（tt/cart/cart0）经 TABS 缓存解下标（pin 占位语义与
     缓存一致——缓存由 extractTabs 从回包原生维护，先更新后读取同消息自洽）。
     注意 tt 族 BagMsg 另带 bagOwnerId=背包但**非 active**（附录 A 红字），不读。 */
  function activeOwnerOf(key, d) {
    var sc = SCENES[key];
    if (!sc) return null;
    if (sc.family === 'bag') return d.bagOwnerId != null ? String(d.bagOwnerId) : null;
    if (sc.family === 'trade') return d.bagOwnerKey != null ? String(d.bagOwnerKey) : null;
    /* rack 族（v1.8.2 v13）：active=rackOwnerId（当前架子 owner——rackOpen 重放
       Ac_MaterialRack_Open 后 state 重绑即变，RailData ctx.rackOwner 同源）；兜底 bagOwnerId
       （背包侧，正常恒玩家背包不触发跟随后果）。 */
    if (sc.family === 'rack') return d.rackOwnerId != null ? String(d.rackOwnerId) : (d.bagOwnerId != null ? String(d.bagOwnerId) : null);
    if (sc.family === 'tt') {
      if (d.activeLeftTab == null) return null;
      var tab = d.activeLeftTab | 0;
      if (tab < 2) return store.bag ? String(store.bag) : null; /* 背包/抽屉 → 跟到背包 */
      var at = TABS[key];
      return at && at[tab - 2] != null ? String(at[tab - 2]) : null;
    }
    if (sc.family === 'cart' || sc.family === 'cart0') {
      if (d.activeTab == null) return null;
      var ac = TABS[key];
      var i2 = d.activeTab | 0;
      return ac && ac[i2] != null ? String(ac[i2]) : null;
    }
    return null; /* backpack（bagonly 页无柜签）等 */
  }
  function numId(v) { /* 契约 owner 为数字、消息 active 为字符串——统一回契约口径 */
    var n = parseInt(v, 10);
    return isNaN(n) ? v : n;
  }
  /* 官方 active 变化 → rail 跟随（A/D 步进/页面自身按钮/自己 forge 的回包统一入口）。
     回环防护（tagfilter skipEcho 思路的只读版，无扣发）：自己 forge 的切换 currentId 已
     记下，回包到达时若 RENDERED_ID 也等于该值=纯重复回包（C# 一条切换推多条消息：active
     一条、tabs 一条）幂等早退零抖动；currentId 已记下但未渲染过=forge 回包到达点 → 补
     渲染（「等回包确认再渲染」的到达动作）；值不同=官方主动切换 → 记下并渲染。 */
  function followActive(key, v) {
    if (st.scene !== key) return; /* 非活跃帧：不动活跃集（快照态随该帧下次活跃时自行收敛） */
    if (st.plainBag) return; /* v1.8.2.5：plainbag 固定背包视图，不跟随 */
    var c = ctnById(numId(v));
    if (!c) return; /* 未知容器不跟（宁可不跟也不错跟） */
    if (store.ctx && store.ctx.family === 'rack' && c.id === store.bag) return; /* rack 场景无背包页签：bagOwnerId 兜底信号解析到背包不跟（只跟 rackOwnerId） */
    var vs = String(c.id);
    if (String(st.currentId) === vs && String(RENDERED_ID) === vs) return;
    st.currentId = c.id;
    st.sel = null;
    saveSnap();
    if (el.rail) render();
  }
  /* ---- postMessage 包装链（tagfilter wrapRelay 同构，只读观察不扣发）----
     保留前一引用并在尾部调用=串联：__SLTF__ 先包装则 rail 挂其后、rail 先包装则
     __SLTF__ 挂 rail 后。共存链各自按需消费（rail 只读恒放行）；外层丢弃回声时内层
     不见该条（tagfilter skipEcho 路径）——rail 幂等无依赖（RENDERED_ID 门兜底），
     下一包自然收敛。 */
  function wrapRelay(f) {
    try {
      var win = f.el.contentWindow;
      if (!win || win.__cerWrapped) return;
      var prev = win.postMessage;
      win.__cerWrapped = 1;
      win.postMessage = function (msg) {
        relayObserve(f, msg);
        return prev.apply(this, arguments);
      };
    } catch (e) { f.xorigin = true; }
  }
  /* 只读截读：页签数组入缓存 + active 跟随。无扣发无丢弃（rail 不做 tagfilter 的藏页签
     语义，官方页面照常收每条消息；hasActive 清单照附录 A）。 */
  function relayObserve(f, msg) {
    try {
      var t = extractTabs(msg);
      if (t) TABS[f.key] = t;
      var d = msg && msg.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
      if (!d || typeof d !== 'object') return;
      var isBag = !!(msg && typeof msg.type === 'string' && msg.type.indexOf('BagMsg') >= 0);
      var hasActive = !!(d.bagOwnerId != null || d.bagOwnerKey != null || d.activeLeftTab != null || d.activeTab != null
        || d.rackOwnerId != null); /* rackOwnerId：rackOpen 重绑后的 active 信号（v1.8.2） */
      if (!isBag && !hasActive) return;
      var v = activeOwnerOf(f.key, d);
      if (v == null) return;
      followActive(f.key, v);
    } catch (e) { }
  }

  /* ================= T8 正式装配区（Root 侧扫描/观察器，游戏内自动生效） =================
     本文件由 C# bootstrap 注入 Root 文档执行（TagFilter 同位），rail DOM 装进各场景 iframe
     文档（Root↔iframe 同源，contentDocument 可达——TagFilter.cs Probe 实证）。装配循环：
     ① 500ms interval 兜底扫描 + Root body 级 MutationObserver 即时触发（双保险）；
     ② 扫 #iframe-container iframe → el.id 对 SCENES（BackpackUI 的 findings 默认 id
        'Backpack' 经 ID_ALIAS 归一，T8 校准点——首装 console.log 打实际 frame id）；
     ③ ensureMounted 不变量检查：rail 在位（#srRail 连通且 el 引用表绑定本文档）且宿主未
        复活 → 空转；宿主复活/rail 被摘 → 重装配。invariant 即记录降噪（tagfilter
        subtreeTouched 思路的等价替代：宿主重建/摘 rail 两类事件都令不变量变假，其余
        body 噪声在 O(1) 检查后早退，比逐 record 子树比对更不会漏跨容器重建）。
     harness 兼容：旧 railui-harness.html 无 #iframe-container → 扫描早退，mount(document,
     key) 直调路径不变；root harness（railui-root-harness.html）与游戏同走本循环。 */
  var ID_ALIAS = { Backpack: 'BackpackUI' }; /* findings §6：Backpack 页 iframe id 静态默认 'Backpack'（SCENES 键=BackpackUI），实装后 T8 校准 */
  var FRAMES = [];                            /* { el, key, doc, mo }——tagfilter S.frames 同构 */
  var MOUNT_LOGGED = {};                      /* 场景键 → 已打首装日志（iframe id 校准点） */

  function frameKey(el) {
    if (SCENES[el.id]) return el.id;
    return ID_ALIAS[el.id] || null;
  }
  function findFrame(el) {
    for (var i = 0; i < FRAMES.length; i++) if (FRAMES[i].el === el) return FRAMES[i];
    return null;
  }
  /* 页面可见性（游戏语义=Root hidePage 用 display:none 收起未开面板；打开恒 display:block）。
     隐藏页不装配：面板未开（游戏）/未选场景（root harness），且防多 iframe 同挂时 el 引用表
     在隐藏文档间来回翻（bind(doc) 全局单套，单场景活跃语义）。 */
  function frameVisible(el) {
    try { return el.ownerDocument.defaultView.getComputedStyle(el).display !== 'none'; } catch (e) { return true; }
  }
  function attachFrame(f) {
    var doc = null;
    try { doc = f.el.contentDocument; } catch (e) { doc = null; }
    if (!doc || !doc.body) return false;
    f.doc = doc;
    if (!f.mo) {
      /* iframe 文档级观察器：官方（Vue）重建宿主/摘除 rail 均为 childList 变化——只看
         childList（属性抖动由 invariant 检查在 interval 兜底路覆盖，不进观察器回调）。 */
      f.mo = new MutationObserver(function (rs) {
        var touched = false;
        for (var i = 0; i < rs.length; i++) {
          if ((rs[i].addedNodes && rs[i].addedNodes.length) || (rs[i].removedNodes && rs[i].removedNodes.length)) { touched = true; break; }
        }
        if (!touched) return;
        if (!f.doc || !f.el.isConnected) return;
        ensureMountedFrame(f); /* 内部 invariant 早退=降噪快速路径 */
      });
      f.mo.observe(doc.body, { childList: true, subtree: true });
    }
    /* T9 wrapRelay 只为 rail 的 active 跟随服务；v1.8.3 原生页无 rail——不包装
       （防 followActive 把本页 active 渲染进他帧残留 rail） */
    if (!(SCENES[f.key] && SCENES[f.key].native)) wrapRelay(f);
    return true;
  }
  /* 宿主复活判定（统一出口）：默认=resolveHost 命中即「宿主在」（「替换即消亡」前提，
     SCENES 表头注释）。rack 特判：作用域容器继承 id=rackSystem（官方 scoped 查询/fit 测量
     依赖），选择器恒命中自家壳——官方重建=出现**不带 data-sr-scope 标记**的 #rackSystem。 */
  function hostAlive(doc, sc) {
    if (sc.alive === 'bp') return !doc.getElementById('srRail'); /* v1.8.2.3：BP 面板级替换——容器恒在，装配判定=rail 缺失（Vue 结构重建摘壳亦走此路自愈） */
    return !!resolveHost(doc, sc.host);
  }
  /* 装配不变量：rail 在位 = #srRail 连通 && el 引用表正绑定它（bind(doc) 全局单套——文档
     切换后旧 rail 的 el 引用已被新 mount 抢走，旧文档视为未装配，重显时强制重装配拿回
     引用表）&& 宿主未复活（官方重建会把宿主加回来，出现即替换）。「宿主未复活」=
     !hostAlive(doc, sc)——默认走 resolveHost（「替换即消亡」前提），rack 走标记特判。
     官方格进壳不影响本判据（host 选择器不指向格容器本身；格 id 仍在文档=官方查询照常命中）。 */
  function mountedOk(doc, sc) {
    var rail = doc.getElementById('srRail');
    if (!rail || !rail.isConnected) return false;
    if (el.rail !== rail) return false;
    return !hostAlive(doc, sc);
  }
  /* ================= v1.8.3 BackpackUI 原生模式（作者执行令＝原型 v13.2/v13.3） =================
     官方页整页原生，mod 只注入 CSS 三点（全部纯视图层，不碰数据/坐标/官方监听）：
     ① 高度滚动：max-height+overflow+scrollbar-gutter——官方 JS 给 .grid-container 写死
        inline width:cols*56px 且全页 border-box，滚动槽会从该宽度里扣、格底 repeat(cols,56px)
        轨道与 px 定位物品层被顶进滚动条底下（原型实测）；content-box+行末 padding 让滚动槽
        加在官方宽度之外（原型 live-sbfix 实证：格底=完整 cols×56、物品与滚动条间隙≥2px）。
     ② 柜侧隐负重条：.bag-panel.is-storage（官方源码：dual 且 side==='B' 才挂）→ 背包侧
        保留负重、柜侧隐藏；B 键单背包无 is-storage=负重照常。
     ③ 列数=官方数据原生。12 列统一需柜宽数据层改写（真实尺寸/存档坐标变更），仍待作者
        拍板（CabinetSize 重启用 / 内建 SizeEngine），本版不动数据。 */
  var NATIVE_BP_CSS = ''
    + '.grid-container{max-height:560px;overflow-y:auto;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:rgba(255,193,7,.5) transparent}'
    + '.grid-container::-webkit-scrollbar{width:8px}'
    + '.grid-container::-webkit-scrollbar-thumb{background:rgba(255,193,7,.45);border-radius:4px}'
    + '.grid-container{box-sizing:content-box;padding-right:12px}'
    + '.bag-panel.is-storage .weight-section{display:none !important}';
  function ensureNativeBp(f) {
    var doc = f.doc;
    if (!doc || !doc.head || doc.getElementById('srNativeBp')) return;
    var st = doc.createElement('style');
    st.id = 'srNativeBp';
    st.setAttribute('data-cer-native', '1');
    st.textContent = NATIVE_BP_CSS;
    doc.head.appendChild(st);
  }

  /* ================= v1.8.4 原生背包页 mod 按钮对（UI-SPEC §0a-4，v13.9 作者缺陷单#1） =================
     v13.4 转原生时排序/入库随 rail 离开本页 → 作者缺陷单补回，原型 v13.9 三轮定稿：
     背包面板官方 .toolbar 行**行首左缘**两钮（margin-right:auto 钉左缘，官方丢弃/整理
     保持右缘），基类=官方 .action-btn 同尺寸观感。⇅排序 ▾=FSORTS 7 项弹层（挂触发钮内
     absolute 上弹）→ sortBy{owner:bag} 数据层重排（cmdOut 对 BackpackUI 自带 forge 官方
     刷新）+ 属性排序时背包格右上角数值角标（#srnBadges overlay，MutationObserver 跟随
     官方重渲染，同串免写防回环）；📦一键入库=§4.6 确认窗 → storeAll{order}（settleXfer
     差量 toast 经 toast() 兜底路由落本页 #srnToast）。装配判据=面板带 .weight-section
     （背包有负重；取用=单柜面板无负重条不装配）；柜侧（is-storage）恒不装配。
     官方元素零 addEventListener（监听只在 mod 自有钮/弹层/文档级收弹层含 mod 钮豁免=v9
     同款）；.srn-pop[hidden] 必须 !important 压 ID display（v13.9 实测常驻黑条教训）。 */
  var NB = { doc: null, fsort: 'official' };
  var NB_CSS = ''
    + '.srn-sort,.srn-store{position:relative;flex:0 0 auto}'
    + '.srn-sort{background:#1a1a1e !important;border-color:rgba(240,176,60,.45) !important;color:#f0b03c !important}'
    + '.srn-sort:hover{color:#ffe1a0 !important;border-color:rgba(240,176,60,.68) !important}'
    + '.srn-caret{font-size:10px;color:#c9932f;margin-left:1px}'
    + '.srn-store{border-color:rgba(240,176,60,.5) !important;background:rgba(240,176,60,.14) !important;color:#ffe1a0 !important;margin-right:auto !important}'
    + '.srn-store:hover{background:rgba(240,176,60,.26) !important}'
    + '.srn-sort span,.srn-store span{display:inline-block;white-space:nowrap;flex:0 0 auto}'
    + '.srn-pop{position:absolute;bottom:calc(100% + 8px);z-index:30;border-radius:10px;background:rgba(10,10,12,.94);box-shadow:0 8px 24px rgba(0,0,0,.5)}'
    + '.srn-pop[hidden]{display:none !important}'
    + '#srnSortPop{left:0;width:128px;border:1px solid rgba(255,255,255,.12);padding:6px;display:flex;flex-direction:column;gap:5px}'
    + '#srnSortPop .srn-opt{display:flex;align-items:center;gap:7px;width:100%;min-height:26px;padding:0 10px;border-radius:7px;border:1px solid #3d3d44;background:#26262b;color:#e8e8e8;font-size:12px;text-align:left;font-family:inherit;cursor:pointer}'
    + '#srnSortPop .srn-opt:hover{color:#fff;border-color:rgba(255,255,255,.30)}'
    + '#srnSortPop .srn-opt.active{color:#f0b03c}'
    + '#srnSortPop .f-ico{flex:0 0 auto;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-size:12.5px}'
    + '#srnSortPop .srn-tick{margin-left:auto;font-size:11px}'
    + '#srnConfirm{left:0;width:300px;border:1px solid rgba(240,176,60,.4);padding:10px 12px}'
    + '#srnConfirm .srn-cf-head{font-size:13px;color:#ffe1a0;margin-bottom:6px}'
    + '#srnConfirm .srn-cf-body{font-size:12px;color:#cfc8bc;line-height:1.5;margin-bottom:10px}'
    + '#srnConfirm .srn-cf-foot{display:flex;gap:8px;justify-content:flex-end}'
    + '#srnConfirm button{padding:5px 12px;border-radius:7px;font-size:12px;font-family:inherit;cursor:pointer}'
    + '#srnConfirm .srn-cf-cancel{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#d8d0c2}'
    + '#srnConfirm .srn-cf-go{border:1px solid rgba(240,176,60,.5);background:rgba(240,176,60,.14);color:#ffe1a0}'
    + '#srnBadges{position:absolute;inset:0;pointer-events:none;z-index:5}'
    + '#srnBadges i{position:absolute;transform:translateX(-100%);min-width:10px;padding:0 2px;border-radius:2px;background:rgba(0,0,0,.8);font-size:9.5px;line-height:12px;text-align:center;font-family:Consolas,monospace;font-style:normal;white-space:nowrap}'
    + '#srnToast{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:99;padding:7px 14px;border-radius:9px;background:rgba(20,24,36,.94);border:1px solid rgba(240,176,60,.5);color:#ffe1a0;font-size:12.5px}'
    + '#srnToast[hidden]{display:none !important}';
  function nbPanel(doc) {
    /* 双背包形态：A 侧（:not(.is-storage)）恒为背包，直接装配。
       单面板形态 B键背包 vs 取用（同页同构，负重条判据不成立——柜子也有负重）：
       权威判据=ctx.bpBag（C# 直读 State_Web_BackpackUI.OwnerId_A 比对背包 owner）；
       缺字段（旧契约/harness mock）兜底=头部分类 chips（取用柜 canTag 挂 chips，B键背包无）。 */
    var panels = doc.querySelectorAll('.bag-panel:not(.is-storage)');
    if (!panels.length) return null;
    var dual = !!doc.querySelector('.bag-panel.is-storage');
    if (dual) return panels[0];
    var ctx = store.ctx || {};
    var isBag;
    if (typeof ctx.bpBag === 'boolean') isBag = ctx.bpBag;
    else isBag = !panels[0].querySelector('.header .tag-chips');
    return isBag ? panels[0] : null;
  }
  function nbStrip(doc) { /* 形态翻转（B键↔取用）摘按钮对+角标；style/toast 留着无害 */
    if (!doc) return;
    var b = doc.getElementById('srnSortBtn');
    if (b && b.parentNode) b.parentNode.removeChild(b);
    var s = doc.getElementById('srnStoreBtn');
    if (s && s.parentNode) s.parentNode.removeChild(s);
    var lay = doc.getElementById('srnBadges');
    if (lay && lay.parentNode) lay.parentNode.removeChild(lay);
  }
  function nbMount(f) {
    try {
      var doc = f.doc;
      if (!doc || !doc.body) return;
      var panel = nbPanel(doc);
      if (!panel) { nbStrip(doc); if (NB.doc === doc) NB.doc = null; return; } /* 取用形态：不装配（翻转即摘） */
      var row = panel.querySelector('.toolbar'); /* 官方按钮行（一键丢弃/一键整理所在行） */
      if (!row) return;
      if (NB.doc !== doc) NB.doc = doc;
      if (!doc.getElementById('srnStyle')) {
        var stl = doc.createElement('style');
        stl.id = 'srnStyle';
        stl.setAttribute('data-cer-native', '1');
        stl.textContent = NB_CSS;
        doc.head.appendChild(stl);
      }
      if (!doc.getElementById('srnSortBtn')) {
        var sortBtn = doc.createElement('button');
        sortBtn.className = 'action-btn srn-sort';
        sortBtn.id = 'srnSortBtn';
        sortBtn.type = 'button';
        sortBtn.title = '排序：官方默认，或按属性排序（格子右上角显示数值）';
        sortBtn.innerHTML = '<span>⇅</span><span>排序</span><span class="srn-caret">▾</span>';
        var pop = doc.createElement('div');
        pop.className = 'srn-pop';
        pop.id = 'srnSortPop';
        pop.hidden = true;
        sortBtn.appendChild(pop);
        var storeBtn = doc.createElement('button');
        storeBtn.className = 'action-btn srn-store';
        storeBtn.id = 'srnStoreBtn';
        storeBtn.type = 'button';
        storeBtn.title = '按物品分类自动放入带对应标签的柜子（柜满顺延，无匹配留在背包）';
        storeBtn.innerHTML = '<span>📦</span><span>一键入库</span>';
        var cf = doc.createElement('div');
        cf.className = 'srn-pop';
        cf.id = 'srnConfirm';
        cf.hidden = true;
        storeBtn.appendChild(cf);
        row.insertBefore(sortBtn, row.firstChild); /* 行首左缘；storeBtn margin-right:auto 吃余空间 */
        row.insertBefore(storeBtn, sortBtn.nextSibling);
        sortBtn.onclick = function () {
          var c = doc.getElementById('srnConfirm');
          if (c) c.hidden = true;
          var p = doc.getElementById('srnSortPop');
          if (!p) return;
          p.hidden = !p.hidden;
          nbRenderSortPop(doc);
        };
        storeBtn.onclick = function () { nbOpenConfirm(doc); };
      }
      if (!doc.__srnDocBound) {
        doc.__srnDocBound = true;
        doc.addEventListener('click', function (ev) { /* 点空白收弹层；mod 钮内点击豁免（v9 同款教训） */
          if (ev.target && ev.target.closest && ev.target.closest('.srn-sort,.srn-store')) return;
          var p = doc.getElementById('srnSortPop');
          if (p) p.hidden = true;
          var c = doc.getElementById('srnConfirm');
          if (c) c.hidden = true;
        });
      }
      var t = doc.getElementById('srnToast');
      if (!t) {
        t = doc.createElement('div');
        t.id = 'srnToast';
        t.hidden = true;
        doc.body.appendChild(t);
      }
      NB.fsort = lsGet('srp_fsort_' + (st.scene || 'BackpackUI')) || 'official';
      nbBadges(doc, panel);
      nbEnsureGridMO(doc, panel);
    } catch (e) { try { console.warn('[CERail] nbMount 失败(兜底不炸扫描)', e && (e.stack || e.message)); } catch (e2) { } }
  }
  function nbRenderSortPop(doc) {
    var pop = doc.getElementById('srnSortPop');
    if (!pop || pop.hidden) return;
    var h = '';
    for (var i = 0; i < FSORTS.length; i++) {
      var s = FSORTS[i], on = s.k === NB.fsort;
      h += '<button type="button" class="srn-opt' + (on ? ' active' : '') + '" data-k="' + s.k + '">' +
        '<span class="f-ico" aria-hidden="true">' + s.ico + '</span>' + s.label + (on ? '<span class="srn-tick">✓</span>' : '') + '</button>';
    }
    pop.innerHTML = h;
    var btns = pop.querySelectorAll('.srn-opt');
    for (var j = 0; j < btns.length; j++) {
      btns[j].onclick = function () { nbApplyFsort(this.getAttribute('data-k'), doc); };
    }
  }
  function nbApplyFsort(key, doc) {
    NB.fsort = key;
    try { lsSet('srp_fsort_' + (st.scene || 'BackpackUI'), key); } catch (e) { }
    var p = doc.getElementById('srnSortPop');
    if (p) p.hidden = true; /* 与机器页设施排序弹层同款：选完即关 + 同口径 toast */
    cmdOut('sortBy', { owner: store.bag, key: key }); /* 数据层重排；BackpackUI 页 cmdOut 自带 forge 官方刷新 */
    toast(key === 'official' ? '已恢复官方默认排序' : '已按「' + fsortLabel(key) + '」排序 · 格子右上角显示数值');
    nbBadges(doc, nbPanel(doc));
  }
  function nbOpenConfirm(doc) {
    var p = doc.getElementById('srnSortPop');
    if (p) p.hidden = true;
    var cf = doc.getElementById('srnConfirm');
    if (!cf) return;
    if (!bagArr().length) { toast('背包是空的'); return; } /* §4.6：空背包 toast 不弹窗 */
    cf.innerHTML = '<div class="srn-cf-head">一键入库</div><div class="srn-cf-body"></div>' +
      '<div class="srn-cf-foot"><button type="button" class="srn-cf-cancel">取消</button>' +
      '<button type="button" class="srn-cf-go">确认入库</button></div>';
    cf.querySelector('.srn-cf-body').innerHTML = storeConfirmText(); /* 文案与主侧栏逐字同款（rail.js 口径） */
    cf.hidden = false;
    cf.querySelector('.srn-cf-cancel').onclick = function () { cf.hidden = true; };
    cf.querySelector('.srn-cf-go').onclick = function () {
      cf.hidden = true;
      /* goStoreAll 同款 arm+cmd（rail 弹窗元素在原生页不存在，故独立收口） */
      var order = storeAllOrder(), snaps = {};
      for (var i = 0; i < order.length; i++) snaps[order[i]] = snapOwner(order[i]);
      XFER = { kind: 'storeAll', order: order, bag: snapOwner(store.bag), snaps: snaps };
      cmdOut('storeAll', { order: order }); /* settleXfer 差量汇总 toast → toast() 兜底落本页 */
    };
  }
  /* 数值角标（v13.5 同款 overlay；挂官方 .grid-container 内 pointer-events:none，跟随官方
     重渲染由 nbEnsureGridMO 观察器驱动）。webui-bag 页 .item id=logicId 精确匹配契约背包行，
     无主格不标（宁缺勿错）；几何按官方 zoom 归一（rect/offsetWidth），角标锚格右上角。 */
  function nbBadges(doc, panel) {
    try {
      if (!doc || !doc.body) return;
      if (!panel) panel = nbPanel(doc);
      var grid = panel && panel.querySelector('.grid-container');
      if (!grid) return;
      var old = doc.getElementById('srnBadges');
      if (NB.fsort === 'official' || !bagArr().length) {
        if (old && old.parentNode) old.parentNode.removeChild(old);
        return;
      }
      var its = grid.querySelectorAll('.item');
      if (!its.length) { if (old && old.parentNode) old.parentNode.removeChild(old); return; }
      var arr = itemsOf(store.bag), byId = {};
      for (var i = 0; i < arr.length; i++) byId[String(arr[i].id)] = arr[i];
      var gRect = grid.getBoundingClientRect();
      var z = (gRect.width > 0 && grid.offsetWidth > 0) ? gRect.width / grid.offsetWidth : 1;
      var color = FBCOLOR[NB.fsort] || '#f0b03c';
      if (!ICONIDX) buildIconIdx(); /* 双路匹配同 v1.8.3 applyBadges：id 精确 / 图标尾段→配置级维度 */
      var h = '';
      for (var k = 0; k < its.length; k++) {
        var elx = its[k];
        var it = byId[String(elx.id || '')] || null;
        var cfgId = it ? it.cfgId : 0, cfg = null;
        if (!cfgId) { /* Vue 页 .item 无 id 属性：img src 尾段唯一键→配置级（逐叠维度不标，宁缺勿错） */
          var img = elx.querySelector ? elx.querySelector('img') : null;
          var tail = img ? String(img.getAttribute('src') || '').split('?')[0].split('/').pop().toLowerCase() : '';
          var e2 = tail ? ICONIDX[tail] : null;
          if (e2 && !e2.ambig) { for (var cid in e2.ids) { cfgId = parseInt(cid, 10); break; } }
        }
        if (cfgId && ICFG[cfgId]) cfg = ICFG[cfgId];
        if (!it && !cfg) continue;
        if (!it && (NB.fsort === 'shelf' || NB.fsort === 'value')) continue;
        var r = elx.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        var x = (r.left - gRect.left) / z + r.width / z - 1;
        var y = (r.top - gRect.top) / z + 1;
        h += '<i style="left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px;color:' + color + '">' + badgeTextFor(it, cfg, NB.fsort) + '</i>';
      }
      if (old && old.__srnH === h) return; /* 同串免写：防自家写入触发观察器回环（v1.8.3 同款） */
      if (!old) {
        old = doc.createElement('div');
        old.id = 'srnBadges';
        grid.appendChild(old);
      }
      old.__srnH = h;
      old.innerHTML = h;
    } catch (e) { try { console.warn('[CERail] nbBadges 失败', e && (e.stack || e.message)); } catch (e2) { } }
  }
  function nbEnsureGridMO(doc, panel) {
    var grid = panel && panel.querySelector('.grid-container');
    if (!grid || grid.__srnMO) return;
    try {
      var V = doc.defaultView.MutationObserver;
      grid.__srnMO = new V(function () {
        setTimeout(function () { if (NB.doc === doc) nbBadges(doc, null); }, 50);
      });
      grid.__srnMO.observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    } catch (e) { }
  }
  function nbRefresh() { /* setData 后跟随：角标值随新契约重算（网格未变也不漏） */
    if (NB.doc && NB.doc.body) nbBadges(NB.doc, null);
  }
  function ensureMountedFrame(f) {
    var doc = f.doc, key = f.key, sc = SCENES[key];
    if (!doc || !doc.body || !sc) return;
    if (!frameVisible(f.el)) return;
    if (sc.native) { ensureNativeBp(f); nbMount(f); return; } /* v1.8.3 原生模式：注 CSS 不装配 rail；v1.8.4 加 mod 按钮对（幂等；iframe 重载换文档自然重注） */
    /* T9 宿主复活先撤桩（裁定 2）：rail 在位而宿主重现=官方重建——真节点已回文档，此刻
       桩的重复 id 会让官方 $() 命中桩而非真节点；撤桩后 mount 重替换并重建新桩。
       （官方格引用在 mount 内先于摘除取得，复活重装配不丢格。） */
    if (doc.getElementById('srRail') && hostAlive(doc, sc)) stripStubs(doc);
    if (mountedOk(doc, sc)) return;                    /* 在位且宿主未复活：观察器/interval 噪声快速路径（BP 形态翻转由 Vue 重建摘壳→hostAlive('bp')=true→自然重装） */
    var railHere = doc.getElementById('srRail');
    if (railHere && railHere.isConnected && !hostAlive(doc, sc)) {
      rebindFrame(f, railHere);                        /* T9 重绑：rail 在位但 el 引用表在他帧（A→B→A 重访） */
      return;
    }
    if (!hostAlive(doc, sc)) return;                   /* 宿主不存在（页面未 ready/整树未建）：等下一轮 */
    if (mount(doc, key) && !MOUNT_LOGGED[key]) {
      MOUNT_LOGGED[key] = true;
      /* T8 校准点（findings §6）：首装打印 SCENES 键与实际 iframe id——Backpack/MaterialRack
         两页 id 为静态默认值，实机若不符以本行日志为准回填 SCENES/ID_ALIAS。 */
      try { console.log('[CERail] scene mounted: ' + key + ' (iframe#' + f.el.id + (f.el.id !== key ? '，别名归一' : '') + ')'); } catch (e) { }
    }
  }
  /* T9 重绑（T8 遗留缺陷修复）：帧重新可见但 el 引用表在他帧（A→B→A 重访）——rail 仍在
     本帧文档且宿主未复活（mount 无从下手，旧代码在此早退=A 帧冻结+setData 渲染进错帧）。
     bind 重跑只重收引用表（监听器随节点存活，__srBound 门防重复挂），视图态按 sceneKey
     换回本帧快照（筛选/页签/当前柜态跟着帧走，不串味），随后补渲染——本帧 rail 重新响应
     setData 与消息回包。 */
  function rebindFrame(f, rail) {
    if (!loadSnap(f.key)) applyScene(f.key); /* 无快照（异常兜底）：按场景态重置 */
    bind(f.doc, rail);
    el.srSearch.value = st.query || ''; /* 搜索框是快照外唯一的受控输入：与恢复的筛选态对齐 */
    closePops(); /* 隐藏期间的弹层 DOM 态不属快照语义：重显一律收起 */
    if (store.ctx) render();
  }
  function scanFrames() {
    var rootEl = document.getElementById('iframe-container');
    if (!rootEl) return; /* 旧 harness（无 #iframe-container）：装配区整体空转 */
    var els = rootEl.querySelectorAll('iframe');
    for (var i = 0; i < els.length; i++) {
      var elx = els[i];
      var key = frameKey(elx);
      if (!key) continue;
      var f = findFrame(elx);
      var doc = null;
      try { doc = elx.contentDocument; } catch (e) { doc = null; }
      if (!doc || !doc.body) continue; /* 场景页尚未建树 */
      if (!f) { f = { el: elx, key: key, doc: null, mo: null }; FRAMES.push(f); }
      f.key = key;
      if (f.doc !== doc) { /* iframe（重）载=换文档：旧观察器作废，重挂 */
        if (f.mo) { try { f.mo.disconnect(); } catch (e) { } }
        f.mo = null; f.doc = null;
        if (TABS[key]) delete TABS[key]; /* T9：新文档旧页签缓存作废（forge/解 active 宁可不切也不错切） */
      }
      if (!f.doc && !attachFrame(f)) continue;
      ensureMountedFrame(f);
    }
    for (var j = FRAMES.length - 1; j >= 0; j--) { /* 已移除的 iframe：清状态防泄漏（tagfilter scanFrames 同款） */
      if (!FRAMES[j].el.isConnected) {
        if (FRAMES[j].mo) { try { FRAMES[j].mo.disconnect(); } catch (e) { } }
        FRAMES.splice(j, 1);
      }
    }
  }
  try { setInterval(scanFrames, 500); } catch (e) { }        /* 兜底轮询（裁定 2：观察器+interval 双保险） */
  try { setTimeout(scanFrames, 0); } catch (e) { }           /* 首扫错开一拍：bootstrap 在本 IIFE 返回后才写 __CERAIL_CSS__ */
  try { /* Root 级观察器：iframe 增删/display 切换即时触发（Root 自身变更稀疏，零降噪需求）。
           MutationObserver 不跨 iframe 文档——iframe 内部重建由上面的文档级观察器分管 */
    new MutationObserver(function () { scanFrames(); })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'src'] });
  } catch (e) { }


  /* ---- 场景态（T4）----
     applyScene = rail.js setScene 的状态段移植（DOM 装配留在 mount）：场景键只由
     mount(sceneKey) 与 ctx.page 两个入口写，每次应用都重载分场景偏好、落入口默认容器、
     bagonly 进入时全库收紧（rail.js setScene 同款：global 复位回 prevMode）。 */
  function sceneBagOnly() {
    if (st.domDual || st.domAtabs) return false; /* Bug1：BackpackUI 双背包（后备箱）/aTabs（开柜=整理物资，官方页签行）= 非 bagonly */
    var sc = SCENES[st.scene];
    return !!(sc && sc.bagOnly) || !!(store.ctx && store.ctx.bagOnly);
  }
  /* 无存档默认 = lib 前 5 个标签名（rail.js COMMON_DEFAULT 口径）；行级守卫——实机 2028 行
     崩溃即本函数 lib[i].n（v1.8.1：normRows 入口剔除畸形行后此处再兜一层空值） */
  function defaultCommon() {
    var out = [];
    for (var i = 0; i < store.lib.length && out.length < 5; i++) {
      var t = store.lib[i];
      if (!t || t.n == null) continue;
      if (out.indexOf(t.n) < 0) out.push(t.n);
    }
    return out;
  }
  function loadScenePrefs() {
    var sc = loadCommon();
    COMMON = (sc && sc.length) ? sc : defaultCommon();
    /* 页签顺序无需显式应用：pinnedCtns→pinOrderIds 每次渲染按 srp_pin_order_<scene>
       现读（rail.js applyPinOrder 重排 CTN 数组；正式版 store 只读，顺序在渲染层解）。 */
  }
  function applyScene(key) {
    st.scene = key;
    loadScenePrefs();
    st.currentId = entryDefault();
    /* v13.5-v13.8：设施排序态随场景（Trade=交易价值默认；食品=存档或官方默认）；
       tradeSorted=每次进 Trade 页重置（首包后一次性下发默认排序） */
    st.fsort = (key === 'Trade') ? 'value' : (lsGet('srp_fsort_' + key) || 'official');
    st.tradeSorted = false;
    /* B 键单独背包 = 纯背包页：进入时全库收紧（rail.js setScene：global 复位回 prevMode） */
    if (sceneBagOnly() && st.global) { st.global = false; st.mode = st.prevMode || 'grid'; }
    st.sel = null;
    PIN_KEY = ''; /* 场景换了/全新侧栏 DOM：页签结构必重建（原地更新纪律，§4.10） */
    RENDERED_ID = null; /* 场景态重置=渲染目标未知，回包门回到「未渲染」 */
    saveSnap(); /* T9：入口态即刻入快照（数据未到时重绑重访也有完整场景态可换回） */
  }
  /* ---- 场景入口默认容器（§4.5）：bagOnly → 背包页；rack → rackOwner（兜底首个容器，
     rack 场景无背包页签——railCtns 排除背包）；其余机器界面（壳替换的原面板即背包）→ 背包页 ---- */
  function entryDefault() {
    var ctx = store.ctx || {};
    if (st.domDual && store.ctn.length) return store.ctn[0].id; /* Bug1：双背包默认柜=首个容器；followActive(bagOwnerId=B 侧柜) 随首包 BagMsg 校正到实际打开的柜 */
    if (ctx.family === 'rack') {
      var r = ctx.rackOwner ? ctnById(ctx.rackOwner) : null;
      if (r) return r.id;
      if (store.ctn.length) return store.ctn[0].id;
    }
    return store.bag;
  }
  /* ---- 数据入口：C# rev 门控直推契约 v4 JSON → 归一化入 store → render ---- */
  function setData(json) {
    if (!json || typeof json !== 'object') return;
    store.rev = json.rev || 0;
    store.ctx = json.ctx || {};
    store.bag = json.bag || 0;
    store.ctn = normRows(json.ctn, normCtn);
    store.lib = normRows(json.lib, normLib);
    store.icfg = normRows(json.icfg, normIcfg);
    store.items = (json.items && typeof json.items === 'object') ? json.items : {};
    ICFG = {}; LIB = {}; LIBN = {}; ICONIDX = null;
    for (var i = 0; i < store.icfg.length; i++) { var ic = store.icfg[i]; if (ic && ic.id != null) ICFG[ic.id] = ic; }
    for (var j = 0; j < store.lib.length; j++) {
      var lw = store.lib[j];
      if (!lw || lw.id == null) continue; /* 畸形行防御（normRows 后理论不达，双保险） */
      LIB[lw.id] = lw;
      if (lw.n != null && !LIBN[lw.n]) LIBN[lw.n] = lw; /* 同名首行胜出 */
    }
    /* fix-2：官方容器标签以契约为唯一权威（cmd('setTags')→C# SetRule→回推），本地不再
       叠加 tagId 覆盖；自定义词 overlay 走 customTagsOf 在读取侧合并，不经 setData。 */
    /* 契约增补字段（T3 评审随行项②）：ctx.bagCap（int>0）覆盖背包容量常量——
       读取逻辑先行就位，T6 冻结契约后由 C# 推送；缺省保持现值不回退 */
    if (store.ctx && typeof store.ctx.bagCap === 'number' && store.ctx.bagCap > 0) BAG_CAP = store.ctx.bagCap;
    /* 场景态（T4）：ctx.page 换了 → 应用新场景（偏好重载/入口默认/bagonly 收紧）；
       同页首包（mount 先行、数据后到）也补应用一次（sceneApplied 门——mount 时 ctx
       未到，入口默认容器可能落旧值）；同场景回推（rev 变）→ 不动，保住玩家当前页签。
       COMMON 不在此处重置（玩家状态），由 applyScene→loadScenePrefs 按存档/默认赋值。 */
    var page = store.ctx.page || st.scene;
    if (page && (page !== st.scene || page !== sceneApplied)) {
      applyScene(page);
      sceneApplied = page;
    } else if (!ctnById(st.currentId)) {
      st.currentId = entryDefault(); /* 当前容器已被移除（柜子拆了等）：回默认 */
    }
    /* v1.8.1 兜底：渲染/快照差任何异常只 warn 不炸死消息通道——实机教训：一次渲染异常
       曾让 setData 半途抛出（页签空白+全部交互失联即此）。warn 带堆栈，实机复现一击定位。 */
    if (el.rail) {
      try { render(); } catch (e) { try { console.warn('[CERail] render 失败(兜底不炸通道)', e && (e.stack || e.message), e); } catch (e2) { } }
    }
    try { settleXfer(); } catch (e) { try { console.warn('[CERail] settleXfer 失败', e && (e.stack || e.message), e); } catch (e2) { } }
    try { nbRefresh(); } catch (e) { try { console.warn('[CERail] nbRefresh 失败', e && (e.stack || e.message), e); } catch (e2) { } } /* v1.8.4 原生页角标随契约重算 */
  }

  /* ---- __CERAIL__ 契约壳（T2 定面；T3 填实 setData/mount；T5 填实 drain/cmd）---- */
  window.__CERAIL__ = {
    ver: 1,
    /* C# rev 门控直推数据契约 v4 JSON（存入 store 并触发渲染） */
    setData: setData,
    /* 主帧取走待执行命令队列：JSON 数组字符串（每项 = {op 与 payload 平铺}，契约见
       文件头，T7 C# 照此解析）；取走即清空，无待执行恒返回 '[]' */
    drain: function () { var s = JSON.stringify(CMDQ); CMDQ = []; return s; },
    /* 侧栏→C# 命令入口（op/payload 命令名 T5 冻结，见文件头）；内部一律经 cmdOut
       走本属性调用，宿主/测试的包装器（日志、遥测）方能截获 */
    cmd: cmd,
    /* 装配：把侧栏替换进 doc 中 SCENES[sceneKey].host 指向的官方面板（T8 正式版：
       CSS 注入 + 旧包裹摘除 + data-interactive 根容器 + 场景态，返回 true=成功；
       游戏内由装配区 ensureMounted 自动驱动，直调保留给 harness/测试） */
    mount: mount,
    /* 只读视图态（T4 填实）：st 直引用，harness/测试只读；外部勿改写 */
    state: st,
    /* T8：SCENES 场景表只读暴露 + scanFrames 手动触发（root harness/测试对账与
       免等 500ms 兜底用；游戏内不依赖） */
    scenes: SCENES,
    scan: scanFrames
  };

  /* ---- 启动期载入（全局键一次；分场景键随 applyScene 每场景重载）----
     srp_custom_tags 自定义词表全局（§4.9）；srp_ctn_names/srp_ctn_tags 覆盖 T5 接入
     （nm()/customTagsOf 消费；官方标签主通道 cmd('setTags')→C#→契约回推）。 */
  CUSTOM = loadCustom();
  var nt0 = loadNames(); if (nt0) NAMES = nt0;
  var tg0 = loadCtnTags();
  if (tg0) {
    /* fix-2 起该键只存自定义词：滤掉历史遗留的 tagId 数值项（旧版 TAGOV 语义的存档） */
    for (var kk in tg0) {
      if (Array.isArray(tg0[kk])) {
        tg0[kk] = tg0[kk].filter(function (x) { return typeof x === 'string' && !/^\d+$/.test(x); });
        if (!tg0[kk].length) delete tg0[kk];
      }
    }
    CTAGS = tg0;
  }
})();
