/* CERail 储物侧栏 —— 游戏内 WebView 注入版（railui.page.js）。
   fork 自 design-proto/rail.js（v12 定稿原型），按计划分任务移植：
   v1.8.7（作者 2026-11-03 令「页签区还原官方设计，保留 rail 全部功能」）：
       **官方页签栏 DOM 原件还原**——mount 不再销毁页签栏建桩，改为把官方页签栏
       （SCENES.tabs：bag 族 #bagTabs / tt·cart 族 .left-tabs / trade .bag-tabs /
       compressor #tabs）reparent 进壳的 #srTabs 槽（mount 期先取引用、buildStubs 前
       入槽→页签类桩自愈跳过；ensureTabsInSlot 每周期兜底补挂）。自绘页签行
       （.sr-ctnbar/.sr-pinrow/renderCtnBar/bindPinDrag/pinnedCtns/savePinOrder）与
       A/D 拦截层（stepGuard/releasePending/f.pending）整体退役。
       由此复活两个官方原生功能（作者报告被打断的）：①A/D 切页签（C#
       ContainerTabHotKey→RA_SwitchTabByKey，宽度>0 守卫——真页签栏在位即过）；
       ②拖物品到页签转柜（webui-tabdrop 真件矩形命中）。页签点击/active/滚动/锁定
       全官方；rail 只经 followActive 跟随同步自身状态（v1.8.9：▾ 菜单退役，无主动切柜路）。
       场景视图可见性与拖拽排序后续任务移到 C# 状态层收口（数组=可见集，A/D 零拦截）。
   2026-11-01 作者缺陷单#1（排序不生效/数据不显示/显示错误）+#2（9 机器页页签柜子显示错/缺）：
       #1 数值口径整体换 C# RailSortMath（ProjectCook.dll 反编译移植：实例效果值+天赋管线/
          交易损耗×鉴定+Trade 需求因子/保质期 DaysLeft 状态机升序），契约物品行尾增
          [s1,s2,s3,s4,trade,days]；角标三路匹配（id→位序 zip→图标尾段，Vue 页无 id 的逐叠
          维度由位序命中）+ zoom 归一；toast 改 ctx.lastSortAck settle 回执；切场景重置默认
          （§4.11 定版，localStorage 持久化退役）；同场景切柜续排。
       #2 railCtns 机器页按 v1.7.0 逐页语义收窄（ctx.view food/material/browser 视图谓词
          =tagfilter viewAllows 移植 + TABS 官方页签成员过滤）；页签行平铺本页全集（默认前 4 退役）。
   v1.8.6（作者 2026-11-03 令「排序按钮复制到所有储物柜的取用与整理物资界面，位置左下角；
       只排序不入库；材料架不做——行组件页无网格」）：
       **NB 原生页双侧装配**——袋侧（B键/整理物资 A 面板）排序+入库原样；柜侧**新增仅排序钮**
       （取用单柜 A 面板 / 整理物资 B 面板 .is-storage，id 后缀 2）；DISP 双实例化（DISP_CT），
       双面板同屏各自独立排序互不顶替，dropFilter 双实例取落点命中者。
       **装配判据换 Vue 真源**（setupState.bagA/bagB.ownerId 白名单柜判定；兜底链=DOM chips
       →ctx.bpBag→保守袋侧）——旧判据 ctx.bpBag 为上一包快照，开取用柜瞬间滞后=true →按钮对
       先装后摘=「左下角排序钮闪一下就没了」（v1.8.4 起固有竞态）根治；dispOwnerOf vue 分支
       改页面 ownerId 直取（v1.8.5⑪ 陈旧 owner 病灶同类根治）。
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
   T5=▾容器菜单/✎编辑弹窗/页签拖拽 + 命令排队（无乐观刷新，等回包）——前两者 v1.8.9
       随 ▾ 全部容器按钮整链退役（页签行 100% 官方化），命令排队保留。
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
  /* UNI_W=700 格区缩放归一已随 v1.8.4 撤除（拖拽落点错位+酿酒桶缩格，见 render 网格块注释）；
     壳宽=官方格自然宽+20 纯跟随（syncRailWidth；Bug2 只增不减锁已随 v1.8.4 缺陷#5 退役） */
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
     无头部/搜索/快捷标签/排序工具行/悬停条/「N 行」行；页脚=排序钮(可排序页)+格数+入库|整理。
     【v1.8.10 十三批（作者 2026-11-04 令）】排序钮集合 FOOD_KEYS(食品五设施)→SORT_KEYS 扩容：
     +Trade（手动选维，默认官方序——十批退役的「自动价值排序」不复活，只给手动入口）+
     DroneHub（调度机队=bag 族物品面板）；−DyePanel（作者令先撤钮，颜料桶排序待重设计）。
     Trade 默认价值排序已随 v1.8.9 退役（本次加的是手动钮，口径见 badgeSpec）。 */
  var PLAIN_KEYS = { Cooking: 1, BrewPanel: 1, RatCage: 1, Shredder: 1, Compressor: 1, DyePanel: 1, ToolTable: 1, Trade: 1, DroneHub: 1 };
  var SORT_KEYS = { Cooking: 1, BrewPanel: 1, RatCage: 1, Compressor: 1, Trade: 1, DroneHub: 1 };
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
  /* v14 酿酒桶品质（brew spec §2/§5.2）：发酵品质=桶内原料「心态密度」(Σ心态/Σ饱腹) 对两条
     全局阈值三段——<P1 劣质 / P1~P2 普通 / ≥P2 烈性（游戏 BrewPanel.html 品质条同源）。
     阈值=ctx.brewP1/brewP2（C# GameKey 直推；P2≤P1/缺失兜底 0/0.5=官方界面同守卫）；
     三档色取游戏 TIER_COLOR 同源值（劣绿/普黄/烈粉）。单件口径=dispRows 行 s2/s1
     （RailSortMath 实例+天赋口径，与饱腹角标同源）；bw=icfg 尾列 canBrew（仅 BrewPanel 页
     推送，C# fuelCols 同纪律）。brewTierOf 供排序比较器（§Task4）与角标（§Task5）共用。 */
  var TIER_TXT = ['劣', '普', '烈'];
  var TIER_COLOR = ['#9dc47f', '#e8b04b', '#e0899b'];
  function brewTierOf(row) { /* -1=不可酿/无饱腹（排序垫底+不标角标） */
    if (!row || row.s1 == null || !(row.s1 > 0)) return -1;
    var ic = ICFG[row.cfgId];
    if (!ic || !ic.bw) return -1;
    var p1 = store.ctx.brewP1, p2 = store.ctx.brewP2;
    if (typeof p1 !== 'number' || typeof p2 !== 'number' || !(p2 > p1)) { p1 = 0; p2 = 0.5; }
    var d = (row.s2 == null ? 0 : row.s2) / row.s1;
    return d < p1 ? 0 : (d < p2 ? 1 : 2);
  }

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
     Vue 页（BackpackUI/Trade）宿主内无被查询目标 = 空列表不建桩。
     【rack（二十一批）】材料架页签=官方**行视图**（webui-rackrows 分行取物，非网格）：页签激活
     时官方页面藏格、显行视图宿主（Shredder/Greenhouse #cartRack、ToolTable #rack-rows、DroneHub
     #bagRackWrap、Trade 袋列 .rack-view——@各页 renderCartView/applyLeftView/isRack 分支取证）。
     rack=该宿主选择器（null=本页无行视图）：mount 在**替换宿主前**解析（类选择器须宿主域防误取，
     如 Trade 双 .rack-view）、随官方格一起 reparent 进 .sr-gridhost——官方切页自切两件 inline
     display（DroneHub 藏的是包格容器 bagGridWrap → 壳侧 CSS 按 .on 镜像藏格，见 railui.css），
     行拖拽/右键取1/锁定/取出最多全原生。stubs 摘除对应 rack 件（真节点进壳在文档=桩自愈不建，
     列表语义同步）。修复回归：v1.8.3 起这些宿主随宿主子树被摘=「格被藏+行视图不可见」，
     材料架页签内容区整片黑（作者实报：工作台/交易/调度机队/粉碎机）。 */
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
    Cooking:         { host: "#bagTabs.closest('.panel')",       family: 'bag',      bagOnly: false, duo: false, injTabs: true, tabs: '#bagTabs', grid: 'backpackGrid', stubs: ['bagPanelTitle', 'bagTabs', 'bagTabPinned', 'tabScrollLeft', 'bagTabsScroll', 'tabScrollRight', 'fridgeGuide', 'fridgeGuideBtn', 'sortBagBtn'] }, /* 文档第 1 个 .panel（@Cooking.html @881）；grid id 已从桩剔除（官方格进壳仍在文档，官方查询照常命中）。injTabs=TabInjector 注入页（C# 往官方 BagTabs 补全部柜子）：∩门对 kind 'c' 放行（见 railCtns 注释）。tabs=官方页签栏原件（v1.8.7 reparent 进 #srTabs；含 pin/滚动钮/滚动区/fridgeGuide 整件） */
    BrewPanel:       { host: "#bagTabs.closest('.col')",         family: 'bag',      bagOnly: false, duo: false, injTabs: true, tabs: '#bagTabs', grid: 'bagGrid', stubs: ['bagTitleText', 'bagInfo', 'bagTabs', 'bagTabPinned', 'tabScrollLeft', 'bagTabsScroll', 'tabScrollRight'] }, /* 第 1 个 .col（@BrewPanel.html @263）；injTabs 同 Cooking；tabs 同 Cooking */
    RatCage:         { host: "#bagTabs.closest('.panel')",       family: 'bag',      bagOnly: false, duo: false, injTabs: true, tabs: '#bagTabs', grid: 'backpackGrid', stubs: ['bagTitleText', 'bagTabs', 'bagTabPinned', 'tabScrollLeft', 'bagTabsScroll', 'tabScrollRight', 'bagInfo', 'fillAllBtn', 'fillAllText', 'fillAllCnt', 'fillFoodBtn', 'fillFoodText', 'fillFoodCnt'] }, /* 第 1 个 .panel（@RatCage.html @251）；injTabs/tabs 同 Cooking */
    DyePanel:        { host: "#bagTabs.closest('.col.bag-col')", family: 'bag',      bagOnly: false, duo: false, injTabs: true, tabs: '#bagTabs', grid: 'bagGrid', stubs: ['bagTitleText', 'bagInfo', 'bagTabs', 'bagTabPinned', 'tabScrollLeft', 'bagTabsScroll', 'tabScrollRight'] }, /* @DyePanel.html @317；injTabs/tabs 同 Cooking */
    Compressor:      { host: '.cart',     family: 'cart0', bagOnly: false, duo: false, tabs: '#tabs', grid: 'cartGrid', stubs: ['tabs', 'weightSection', 'wfill', 'wtext', 'btnSortBag'] }, /* 唯一 .cart（@Compressor.html @440）；首抛 $('tabs')（renderTabs）；tabs=#tabs 平铺无 pin */
    Shredder:        { host: '.cart',     family: 'cart',  bagOnly: false, duo: false, tabs: '.left-tabs', grid: 'cartGrid', rack: '#cartRack', stubs: ['tabPinned', 'tabLeft', 'tabsScroll', 'tabRight', 'weightSection', 'weightText', 'weightFill', 'btnSortBag', 'btnQuickLoad'] }, /* 唯一 .cart（@Shredder.html @304）；首抛 $('tabPinned')；tabs=.left-tabs（pin+scroll 整件）。rack=#cartRack 官方行视图宿主（二十一批入壳——材料架页签 renderCartView 直写两件 inline display，官方自切）；官方 renderCartView 另读 $('weightSection') 无守卫=桩保留 */
    GreenhouseBuild: { host: '#cartPane', family: 'cart',  bagOnly: false, duo: false, tabs: '.left-tabs', grid: 'cartGrid', rack: '#cartRack', stubs: ['tabPinned', 'tabLeft', 'tabsScroll', 'tabRight', 'weightSection', 'weightLabel', 'weightText', 'weightFill', 'btnSort', 'btnQuick', 'sideHint'] }, /* section.pane.cart（@GreenhouseBuild.html @267）；首抛 $('tabPinned')；tabs 同 Shredder；rack 同 Shredder（二十一批入壳） */
    ToolTable:       { host: '.backpack-panel', family: 'tt',    bagOnly: false, duo: false, tabs: '.left-tabs', grid: 'backpack-grid', rack: '#rack-rows', stubs: ['tab-bag', 'tabScrollLeft', 'leftTabsScroll', 'tab-drawer', 'tabScrollRight', 'cabinetGuide', 'cabinetGuideBtn', 'bagToolbar', 'btn-sort-bag', '.weight-text', '.weight-fill'] }, /* 内含 .left-tabs 页签列（@ToolTable.html @1947）；首抛 applyLeftGrid 的 getElementById('backpack-grid')（@2610 无守卫 .style 解引用）；类桩 '.weight-text'/'.weight-fill'=StatusMsg 无守卫解引用（markup L1968/L1971 仅类名无 id）；tabs=.left-tabs 整列（pin #tab-bag/滚动钮/#leftTabsScroll(含 #tab-drawer)/cabinetGuide；官方 document.querySelector('.left-tabs')/'.left-tabs .cabinet-tab' 同文档照常命中）。rack=#rack-rows 行视图宿主（二十一批入壳——cabinetTab.isRack 分支直写 grid/rack 两件 inline display） */
    Trade:           { host: '.cols>.col:first-child', family: 'trade', bagOnly: false, duo: false, tabs: '.bag-tabs', grid: 'tradeBagGrid', rack: '.rack-view', stubs: [] }, /* 第 1 个 .col=背包列（@TradeUI.html @2518；:first-child 收窄防级联，T8 评审 Critical）；grid=Vue 格（移动后 Vue 按元素引用继续 patch）；tabs=.bag-tabs（Vue v-if tabs>1——reparent 与 Vue patch 互作走宿主复活重挂兜底，实机校准点）。rack=袋列 .rack-view（Vue v-show=bag.isRack 直切，与 grid 同模板同级件；宿主域解析防误取无人机列件，二十一批入壳） */
    DroneHub:        { host: '#paneMine',       family: 'bag',   bagOnly: false, duo: false, tabs: '#bagTabs', grid: 'bagGrid', rack: '#bagRackWrap', stubs: ['bagTitleBar', 'bagTitleText', 'sortBagBtn1', 'bagTabs', 'bagTabPinned', 'tabScrollLeft', 'bagTabsScroll', 'tabScrollRight', 'sortBagBtn2', 'bagGridWrap', 'bagCap', 'bagWeightLb', 'bagWeightBar', 'bagWeightNum', 'shiftHint'] },  /* section.pane.mine（@DroneHub.html @408）；tabs=#bagTabs（自带 padding 头+尾 sortBagBtn2 官方排序钮，随件还原）。rack=#bagRackWrap（内含 #bagRack）行视图宿主二十一批入壳——本页官方藏格写的是 bagGridWrap（**包格容器**，非格本体）：入壳的 #bagGrid 不在包内=官方藏格不达，壳侧 railui.css 按 #bagRackWrap.on 镜像藏 #bagGrid；bagGridWrap 桩保留吸官方写（原末项无尾逗号，fuelgen 条目插入补上）*/
    /* 燃油发电机 bagtabs 页（spec 2026-11-06-fuelgen-cabinet-tabs）：host=null=**不替换宿主/无侧栏壳**
       ——ensureBagtabs 在官方左背包面板内装配 页签栏(#srfgTabs)+柜格(#srfgBody)+底行(#srfgFoot)，
       右侧发电机面板零改动（作者底线）；官方 DOM 只隐藏不 detach（#backpackGrid 柜页签
       display:none；title/info-bar/hint 由 .srfg-on 类隐藏——无燃料柜时全拆除=原版）。 */
    FuelGenerator:   { host: null, bagtabs: true, family: 'fg', bagOnly: false, duo: false, grid: 'backpackGrid', stubs: [] },
  };

  /* 侧栏 DOM 常量（每次切场景重建后重绑；控件入口各只有一个）——原样拷自 rail.js。 */
  var RAIL_HTML =
    '<div class="sr-head"><div class="sr-headtxt"><div class="sr-title" id="srTitle"></div>' +
    '<div class="sr-sub"><b id="srCols"></b><span id="srCap"></span><span id="srTags"></span></div></div></div>' +
    '<div class="sr-offtabs" id="srOffTabs" hidden></div>' + /* v1.8.2.2：BackpackUI aTabs 模式——官方柜签页签行原件搬入此槽（原生切换；v1.8.3 原生模式后休眠） */
    /* v1.8.7（作者 2026-11-03 令「页签区还原官方设计」）：自绘页签行（.sr-ctnbar/.sr-pinrow）
       退役——页签槽 #srTabs 装**官方页签栏 DOM 原件**（mount 时 reparent，SCENES.tabs 逐页
       指路），A/D 步进/点击切换/拖物到页签（webui-tabdrop）全部官方原生。
       v1.8.9（作者 2026-11-04 令）：行尾 ▾ 全部容器按钮整链退役（srAllCtn/srCtnPop/
       srCtnEdit——页签行 100% 官方化；容器设置唯一入口随链移除，rename/setTags 命令
       契约保留但 UI 不可达；NAMES/CTAGS overlay 保留=存量改名/自定义词照常显示）。 */
    '<div class="sr-tabsrow" id="srTabsRow"><div class="sr-tabslot" id="srTabs"></div></div>' +
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
    '<div class="sr-pop sr-popstore" id="srStoreConfirm" hidden><div class="sr-pophead"><span>一键入库</span></div>' +
    '<div class="sr-popbody" id="srStoreText"></div>' +
    '<div class="sr-popfoot"><button class="sr-popclear" id="srStoreCancel" type="button">取消</button>' +
    '<button class="sr-storego" id="srStoreGo" type="button">确认入库</button></div></div>' +
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
  var UNI_W = 12; /* 契约 ctx.uniformWidth 落点（C# [Rail] UniformBagWidth 直出；0=地板停用信号也落地，缺省 12 不回退——bagCap 同款读取先行） */
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
    dragId: null,   /* T5：拖拽中页签（rail.js st 同形；v1.8.7 lastStepIdx 随 stepGuard 退役；v1.8.9 editId/editTags 随编辑弹窗链退役） */
    w12Floor: 0,    /* 壳宽地板（Task4）：本页首见 UNI_W 列容器标定的壳宽，0=未标定 */
    w12Src: 0       /* 标定所用 UNI_W 值（cfg 改值/场景切换失效判据） */
  };
  var COMMON = [];     /* 快捷标签名字符串（默认=lib 前 5；持久化 srp_common_tags_<scene>） */
  var CUSTOM = [];     /* 自定义标签词表（全局 srp_custom_tags；管理弹层新增/移除维护） */
  var el = {};
  var LISTGRP = [];    /* 列表模式当前渲染的同名汇总行（右键按行取出用，T5 消费） */
  var PIN_KEY = '';    /* v1.8.7：自绘页签行退役后仅作快照形状字段保留（恒 ''，无消费方） */
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
  var ST_KEYS = ['scene', 'currentId', 'mode', 'prevMode', 'sort', 'dir', 'query', 'global', 'tags', 'sel', 'cap', 'rows', 'items', 'dragId', 'w12Floor', 'w12Src']; /* 壳宽地板随页快照（重访免重标定；UNI_W 值变仍由 setData 全局清） */
  function saveSnap() {
    if (!st.scene || !SCENES[st.scene]) return;
    var sn = { st: {}, COMMON: COMMON.slice(), sceneApplied: sceneApplied, PIN_KEY: PIN_KEY, TM_KEY: TM_KEY, LISTGRP: LISTGRP };
    for (var i = 0; i < ST_KEYS.length; i++) {
      var k = ST_KEYS[i], v = st[k];
      sn.st[k] = Array.isArray(v) ? v.slice() : v; /* tags 数组隔离（快照不得被活跃集突变连坐） */
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
    shelf: { label: '保质(天)', f: function (i) { return Math.round(((i.shelf || 0) / 24) * 10) / 10; } },
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
      v1: r[9] || 0, v2: r[10] || 0, v3: r[11] || 0, v4: r[12] || 0, v5: r[13] || 0,
      uses: r[14] || 0, /* v1.8.5④：cfgUses（交易使用折旧） */
      burn: r[15] ? 1 : 0, burnV: r[16] || 0, /* fuelgen 页尾列（C# BuildIcfgRow fuelCols；其他页缺省 0 无消费方） */
      /* v14 canBrew 尾列（仅 BrewPanel 页推送=恰 16 列行；按行宽判形与 fuel 尾列(17 列)
         页无关互斥——brewTierOf 只在 BrewPanel 场景被调，此处守形不守页） */
      bw: (r.length === 16 && r[15]) ? 1 : 0
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
  /* 物品行 → 渲染视图对象（join icfg；src=来源容器名，全库/列表/悬停用）。
     2026-11-01 缺陷单#1：行尾增 s1..s4/tradeV/days（C# RailSortMath=ProjectCook 实例+天赋
     口径逐叠数值，null=该维无值→角标「—」、排序排尾） */
  function itOf(ownerId, r) {
    var cfg = ICFG[r[1]] || NOCFG;
    var c = ctnById(ownerId);
    return {
      id: r[0], cfgId: r[1], count: r[2] || 0, shelf: r[3] || 0,
      x: r[4] || 0, y: r[5] || 0, w: r[6] || 1, h: r[7] || 1, flags: r[8] || 0,
      s1: r[9] == null ? null : r[9], s2: r[10] == null ? null : r[10],
      s3: r[11] == null ? null : r[11], s4: r[12] == null ? null : r[12],
      tradeV: r[13] == null ? null : r[13], days: r[14] == null ? null : r[14],
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
  /* 容器显示名：NAMES 覆盖（srp_ctn_names，原 T5 编辑弹窗写入——v1.8.9 起只读存量；缺省=契约名。rail.js nm 同款） */
  function nm(c) { return NAMES[c.id] || c.n; }
  /* 容器自定义词 overlay（srp_ctn_tags {ownerId:[词...]}，T5 fix-2）：并入容器标签视图用 */
  function customTagsOf(id) { var v = CTAGS[id]; return Array.isArray(v) ? v : []; }
  /* 容器标签视图（名字口径，fix-2 合并函数）= 官方 tagId 经 lib 查名 ∪ 自定义词。
     消费：头部副标 / 全库命中路走 customTagsOf。 */
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
  /* 保质键 → 角标文本（缺陷单#1：单位定案=游戏小时；days=排序键编码——-100001 腐败/
     -100000 过期无计/(-100000,0) 过期计天(距腐败)/>0 剩余天；文本口径=ProjectCook DaysText） */
  function daysText(k) {
    if (k == null) return '-';
    if (k <= -100001) return '已腐败';
    if (k <= -100000) return '已过期';
    var d = k < 0 ? k + 100000 : k;
    if (d >= 1) return Math.floor(d) + '天';
    return Math.max(0.1, Math.round(d * 10) / 10) + '天';
  }
  function totalCap() {
    var s = BAG_CAP; /* 全库口径含背包（rail.js CTN 同款） */
    for (var i = 0; i < store.ctn.length; i++) s += store.ctn[i].cap;
    return s;
  }
  /* 侧栏容器全集：背包（虚拟首位）+ 全部家中容器 */
  function allCtns() { return [bagCtn()].concat(store.ctn); }
  /* 侧栏里可见的容器：整理柜场景排除背包（背包=页面左侧官方面板，§4.5；场景态 T4 接管）。
     2026-11-01 缺陷单#2：机器页（plain 9 页）按 **v1.7.0 逐页语义**收窄（v1.8.3 全量容器
     上栏=「显示错误」根源——材料架/载具混进食品页、不可切柜占栏）：
       ① ctx.view（C# View_* cfg 同源）视图谓词（tagfilter viewAllows 移植）：
          food=冰箱(kind f)全显 + 柜子/架子按食物域标签（dim1-4）；material=材料/工具标签柜
          +架子显、冰箱藏、无标签柜不进；browser=全显；
       ② TABS[scene] 成员过滤（官方页签数组缓存**已到**才启用）：tt/cart/cart0 索引族切换
          依赖官方数组下标（buildSwitchEvent indexOf），不在数组里的容器点了不切——
          宁可不显示不错显（Compressor 原生页签=冰箱族，食物柜即被此条收敛=v1.7.0 原状）。
     BackpackUI（browser 全量+原生页签）与 MaterialRack（rack 语义）不受影响。 */
  function matchesFoodTags(tags) {
    for (var i = 0; i < tags.length; i++) { var e = LIB[tags[i]]; if (e && e.dim >= 1 && e.dim <= 4) return true; }
    return false;
  }
  function matToolIds() {
    var mat = 0, tool = 0;
    for (var i = 0; i < store.lib.length; i++) {
      var t = store.lib[i];
      if (!t) continue;
      if (t.icon === 'material') mat = t.id;
      else if (t.icon === 'tool') tool = t.id;
    }
    return [mat, tool];
  }
  function viewAllowsCtn(c, view) {
    if (view === 'food') {
      if (c.kind === 'f') return true;
      return matchesFoodTags(c.tags || []);
    }
    if (view === 'material') {
      if (c.kind === 'r') return true;
      if (c.kind === 'f') return false;
      var mt = matToolIds(), t = c.tags || [];
      return t.indexOf(mt[0]) >= 0 || t.indexOf(mt[1]) >= 0;
    }
    if (view === 'fuel') {
      /* 燃油发电机页（fuelgen spec）：只显带「燃料」官方标签的柜子——tagId 1013 硬编码
         （Config_FurnitureTag ID=1013 实证，与 C# ScenarioViewOf "fuel" 同源） */
      return (c.tags || []).indexOf(1013) >= 0;
    }
    return true; /* browser */
  }
  function railCtns() {
    if (store.ctx && store.ctx.family === 'rack') return store.ctn;
    if (!isPlainScene()) return allCtns();
    var view = (store.ctx && store.ctx.view) || 'browser';
    var arr = store.ctn.filter(function (c) { return viewAllowsCtn(c, view); });
    var tabsArr = TABS[st.scene];
    if (tabsArr && tabsArr.length) {
      var ok = {};
      for (var i = 0; i < tabsArr.length; i++) if (tabsArr[i] != null) ok[String(tabsArr[i])] = true;
      /* 2026-11-01 实机「烹饪页签迟到」终修：四注入页（injTabs，Cooking/RatCage/Brew/Dye）
         的官方数组由本 mod TabInjector 补全全部柜子（kind 'c'）——原生数组只有背包+冰箱，
         首包渲染先于注入回包到达时 ∩门把食物柜裁掉=开页只见背包+冰箱（点击切柜才冒出）。
         bag 族切换=SWITCH_BAG{ownerId} 直给无下标依赖（ApplySwitchBag→GetBagData 无类型
         过滤，TabInjector 取证）→ 柜子(c)放行零风险；冰箱(f)/架子(r)不在注入集，门照旧
         （v1.7.0 口径与 v185 夹具契约不变）。 */
      var injC = !!(SCENES[st.scene] && SCENES[st.scene].injTabs);
      arr = arr.filter(function (c) { return !!ok[String(c.id)] || (injC && c.kind === 'c'); });
    }
    return [bagCtn()].concat(arr);
  }
  /* ---- §4.9 分场景记忆：localStorage 键（键名冻结，persist 区）----
     v1.8.7：srp_pin_order_<scene> 退役——页签顺序唯一权威=C# cerail_pinorder.json
     （拖拽经 cmd pinOrder 落库，各页轮询 ApplyOrder 对账官方数组序；浏览器侧不再
     存序，storeAll 路由序改读 TABS 官方数组缓存）。存留四键：
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
  function commonKey() { return 'srp_common_tags_' + st.scene; }
  function loadCommon() { var v = lsGet(commonKey()); return Array.isArray(v) ? v.slice() : null; }
  function saveCommon() { lsSet(commonKey(), COMMON); }
  function loadNames() {
    var v = lsGet('srp_ctn_names');
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;    /* 启动载入（v1.8.9 起只读：写入侧 saveEdit 已退役） */
  }
  function loadCtnTags() {
    var v = lsGet('srp_ctn_tags');
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;    /* 启动载入（自定义词 overlay；v1.8.9 起只读） */
  }
  function loadCustom() { var v = lsGet('srp_custom_tags'); return Array.isArray(v) ? v.slice() : []; }
  function saveCustom() { lsSet('srp_custom_tags', CUSTOM); }
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

  /* ---- 页签栏：v1.8.7 起自绘页签行（renderCtnBar/sr-pin）整体退役——官方页签栏 DOM
     原件 reparent 进 #srTabs 槽（mount/ensureTabsInSlot），渲染/active/滚动/点击全部
     官方原生；rail 只经 followActive 跟随 active 同步自身状态。
     v1.8.9：▾ 容器菜单（srAllCtn/renderCtnPop/ctnItemHtml/srCtnPop + ✎容器设置
     srCtnEdit/openEdit 链）整链退役=页签行 100% 官方；存量改名/自定义词 overlay
     （NAMES/CTAGS）保留照常显示，rename/setTags 命令契约保留但 UI 不可达。 ---- */
  /* v1.8.9 退役：▾ 容器菜单内容（renderCtnPop/ctnItemHtml）——rail.js 移植件随链删。 */
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
  /* 排序下拉渲染已收敛 makeSortMenu 实例（menuSort，bind 创建；rail.js 原样 hidden 早退守卫在 refresh 内） */

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

  /* ---- 弹层开合（rail.js closePops 原样；入库确认弹窗 srStoreConfirm 行为 = T11 已接；
     v1.8.9：ctn/edit 两路随 ▾ 容器菜单链退役）---- */
  function closePops(keep) {
    if (keep !== 'tag') el.srTagManage.hidden = true;
    if (keep !== 'sort') el.srSortPop.hidden = true;
    if (keep !== 'fsort') el.srFootSortPop.hidden = true;
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
    if (op !== 'rename' && op !== 'setTags' && op !== 'rackOpen' && op !== 'pinOrder' && store.ctx && store.ctx.page === 'BackpackUI') {
      setTimeout(function () { try { forgeSwitchTo(st.currentId); } catch (e) { } }, 600);
    }
  }

  /* ---- ✎ 编辑弹窗：v1.8.9 随 ▾ 容器菜单整链退役（openEdit/editTag2Html/
     renderEditTags/saveEdit 删除；唯一入口 srCtnPop 菜单行双击已不在）。
     存量 overlay 仍生效：NAMES（srp_ctn_names）经 nm() 覆盖显示名、CTAGS
     （srp_ctn_tags）经 customTagsOf 并入标签视图——只读保留，不再写入。 ---- */

  /* ---- 页签拖拽排序：v1.8.7 起随自绘页签行退役（bindPinDrag 删除）——T3 将在
     官方页签元素上重接 HTML5 dnd（身份按族取：data-owner/_ownerId/TABS 位序），
     命令通道沿用 pinOrder（C# 重排官方数组+Repush，A/D 天然跟随新序）。 ---- */

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
      /* Bug4 三段对账（console 一行，实机一段定位）：点击→官方格重绘（C# 快通道已把回推段
         压到 ≤1 帧+推包成本；若此段仍占大头=官方 SORT 处理/官方格重绘本体）→数据回推
         （泵检出+BuildJson+marshal，快通道后应≈0）→渲染完成（setData 内 render+角标）。 */
      try {
        if (x.t0) {
          var tNow = Date.now();
          var a1 = x.tMO ? (x.tMO - x.t0) + 'ms' : '未观测(无格观察器)';
          var a2 = x.tSet ? (x.tSet - (x.tMO || x.t0)) + 'ms' : '?';
          console.warn('[CERail] tidy 计时(JS)：点击→官方格重绘 ' + a1 + '，→数据回推 ' + a2 +
            '，→渲染完成 ' + (tNow - (x.tSet || x.t0)) + 'ms（合计 ' + (tNow - x.t0) + 'ms）');
        }
      } catch (e) { }
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

  /* §4.7 路由顺序（v1.8.7：官方数组序=显示序=C# cerail_pinorder.json 落库的权威序）：
     TABS 缓存（官方页签数组）在前，未进数组的容器按契约序补尾（柜满顺延要能到达全部柜
     ——C# OpStoreAll 只遍历 order，故 order 必须全量）。旧 srp_pin_order_<scene>
     localStorage 读路退役（写路已随自绘页签行删除；C# 每轮 ApplyOrder 自愈数组序）。 */
  function storeAllOrder() {
    var out = [], seen = {};
    var arrT = TABS[st.scene];
    if (arrT) {
      for (var i = 0; i < arrT.length; i++) {
        if (arrT[i] == null) continue;
        var id = numId(arrT[i]);
        if (String(id) === String(store.bag)) continue;
        if (ctnById(id) && !seen[id]) { out.push(id); seen[id] = true; }
      }
    }
    for (var j = 0; j < store.ctn.length; j++) if (!seen[store.ctn[j].id]) { out.push(store.ctn[j].id); seen[store.ctn[j].id] = true; }
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
    /* Bug4（2026-11-04 作者实测：交易页一键整理响应 2s+）三段计时标记：t0=点击、
       tMO=官方格重绘首见（srBadgeMO 回调盖戳≈官方排序完成）、tSet=契约回推到达（setData
       盖戳）——settleXfer 出一行对账日志（console），实机一段定位瓶颈。 */
    XFER = { kind: 'tidy', owner: owner, before: raw.length, t0: Date.now(), tMO: 0, tSet: 0 };
    if (ev && forgePost(ev)) return;                           /* 官方 SORT 事件路（Trade/DroneHub 等 5 页） */
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
  function isSortScene() { return !!SORT_KEYS[st.scene]; } /* v1.8.10：isFoodScene 更名（集合已非纯食品页） */
  function fsortLabel(k) { for (var i = 0; i < FSORTS.length; i++) if (FSORTS[i].k === k) return FSORTS[i].label; return k; }
  /* renderFootSortPop 已收敛 makeSortMenu 实例（menuFoot，bind 创建） */
  /* ================= 显示层排序 v2（v1.8.5 缺陷单#1：ProjectCook page.js 机制移植——模型级） =================
     两轮实机教训：数据层 sortBy（改真实 BagPos）=毁玩家布局且官方格不随改写重渲染；DOM 直写
     left/top=真实页坐标系与夹具不同（作者实机截图实锤：物品堆右下+溢出）。
     ProjectCook 真机制=**改页面自己的数据模型让它自己重渲染**：
       - Vue 背包页（BackpackUI）：#app setupState.bagA/bagB.items（实机实证字段：id/x/y/w/h/
         cfgId/count/useTimes——**数值不走 vd**（悬浮展示值≠实际，作者裁决以详情为准）；
         统一走契约 join（RailSortMath=实例效果×天赋=详情口径=PC）；
       - webui-bag 机器页：w.backpack 网格对象（getItems/getConfig/renderItems——PC sortCooking 同源）。
     真实位 real=Map(id→[x,y])，按 items 数组身份变化重建（PC fs.items!==items 同款判定：
     官方刷新必换数组=刷新后必是真实态）；排序=order（无键排尾/保质升序/稳定）+pack 首放 →
     写模型 x/y → render；还原=写回 real。观察器在官方重渲染后自动重抹（自愈）。
     dropFilter：排序态下拖放进 sorted 容器→同容器取消/跨容器重定向真实布局 firstFree。 */
  /* v1.8.6 双实例：DISP=rail/机器页+NB 袋侧（现状不变）；DISP_CT=NB 柜侧（取用单柜 A /
     整理物资 B）——BackpackUI 双面板同屏时各自独立排序、互不顶替。settling 入初始形状
     （原为动态挂字段）。函数一律带实例参 D，调用点显式传（机器页/rail 全传 DISP=行为零变化）。 */
  function makeDisp() { return { choice: null, owner: 0, model: null, settling: false }; }
  var DISP = makeDisp();
  var DISP_CT = makeDisp();
  /* Vue 真源读取（BackpackUI 原生页）：setupState 是 setup() 原始返回——ref 不解包
     （isDualBag 需 refVal 双形态兼容），bagA/bagB 为 reactive 对象直取。v1.8.6 起装配判据
     （nbPanels）与柜侧模型选取都走页面自带态——零推送延迟，开取用柜瞬间当场可判
     （旧 ctx.bpBag 快照滞后的「左下角排序钮闪一下」竞态根治）。 */
  function nbVueSu(doc) {
    try {
      var app = doc && doc.getElementById('app');
      var c = app && app._vnode && app._vnode.component;
      return (c && c.setupState) ? c.setupState : null;
    } catch (e) { return null; }
  }
  function refVal(v) { return (v && typeof v === 'object' && typeof v.value !== 'undefined') ? v.value : v; }

  function dispFrame() {
    for (var i = 0; i < FRAMES.length; i++) {
      var f = FRAMES[i];
      if (f && f.el && f.doc && frameVisible(f.el)) return f;
    }
    return null;
  }
  /* 模型适配器：vue=BackpackUI（袋侧=A；柜侧=dual?B:A——取用单柜也在 bagA 槽）；
     trade=TradeUI（纯 Vue 页，setupState.bag——ownerKey 字符串制）；grid=机器页当前容器
     （webui-bag 实例）。ownerId=页面自带权威（袋侧=背包实体 id、柜侧=柜 ownerId），
     dispOwnerOf 消费。
     【v1.8.10 grid 寻址修正（十三批实机实锤）】旧实现假设全局名 w.backpack——实机各页
     变量名不同（Cooking/RatCage/ToolTable=backpack、Brew/Dye=bagBag、Compressor=cartBag、
     DroneHub=bagGrid），非 backpack 页 dispModel 恒 null → 排序+角标全链静默死（作者实机
     「排序无效/数值不显示」根因）。修正=按 containerId 反向寻址：webui-bag 实例自带
     getContainerId()（公开 API），扫帧 window 自有属性找 getContainerId()===SCENES.grid
     的实例；命中缓存在 w.__srGridBy（iframe 重载=新 window=缓存天然失效），w.backpack
     降为兜底（harness 旧夹具兼容）。Trade 页无 webui-bag（tradeBagGrid 是 Vue v-for），
     走 trade 分支读 setupState.bag（reactive，写 x/y 响应式自渲染与 BackpackUI 同路）。 */
  function dispGridOf(w, wantId) {
    if (!w) return null;
    try {
      if (!w.__srGridBy) w.__srGridBy = {};
      if (w.__srGridBy[wantId] !== undefined) return w.__srGridBy[wantId];
      var hit = null;
      for (var k in w) {
        var v; try { v = w[k]; } catch (e) { continue; }
        if (v && typeof v.getItems === 'function' && typeof v.getContainerId === 'function'
          && typeof v.renderItems === 'function' && v.getContainerId() === wantId) { hit = v; break; }
      }
      if (!hit && wantId === 'backpackGrid' && w.backpack) hit = w.backpack; /* 兜底：非容器 id 制的旧夹具 */
      w.__srGridBy[wantId] = hit; /* null 也缓存（查过=不再扫；实例在页面生命周期内恒定） */
      return hit;
    } catch (e) { return null; }
  }
  function dispModel(D) {
    var f = dispFrame();
    if (!f) return null;
    try {
      var sc = SCENES[f.key] || {};
      if (sc.native) {
        var doc = f.doc, su = nbVueSu(doc);
        if (!su || !su.bagA || !Array.isArray(su.bagA.items)) return null;
        var dual = !!refVal(su.isDualBag);
        var bag = (D === DISP_CT && dual && su.bagB && Array.isArray(su.bagB.items)) ? su.bagB : su.bagA;
        return { kind: 'vue', frame: f, items: bag.items, cols: bag.gridCols || 12, rows: bag.gridRows || 33, su: su, ownerId: bag.ownerId || 0 };
      }
      if (sc.family === 'trade') {
        var tSu = nbVueSu(f.doc), tBag = tSu && tSu.bag;
        if (!tBag || !Array.isArray(tBag.items)) return null;
        return { kind: 'vue', frame: f, items: tBag.items, cols: tBag.cols || 12, rows: tBag.rows || 33, su: tSu, ownerId: tBag.ownerKey != null ? tBag.ownerKey : store.bag };
      }
      var w = f.el.contentWindow || f.doc.defaultView;
      var grid = dispGridOf(w, sc.grid);
      if (!grid || typeof grid.getItems !== 'function' || typeof grid.renderItems !== 'function') return null;
      var cfg = grid.getConfig();
      return { kind: 'grid', frame: f, items: grid.getItems(), cols: cfg.cols || 12, rows: cfg.rows || 33, grid: grid };
    } catch (e) { return null; }
  }
  /* v1.8.5⑪ owner 现解析（实机 11:52 实锤：换存档/换包后旧 owner 留存——applyFsort 先于
     render 钉正 currentId 取到旧容器 id → itemsOf(旧 id)=空行 → 全 '-'「数值都不显示」）。
     DISP.owner 降为仅诊断展示；join 每次调本函数现取：vue=store.bag（契约恒新），
     grid=ctnById 钉正后的 st.currentId（保持机器页语义，只修陈旧）。 */
  function dispOwnerOf(D, model) {
    if (model && model.kind === 'vue') return model.ownerId || store.bag; /* v1.8.6：页面 ownerId 直取（取用柜/背包实体/双背包 B 柜三形态都对，v1.8.5⑪ 陈旧 owner 病灶顺带根治） */
    var c = ctnById(st.currentId) || railCtns()[0] || null;
    if (c) st.currentId = c.id;
    return c ? c.id : D.owner;
  }

  /* 数值行（统一形状）——v1.8.5⑤ 起两路统一契约 join（RailSortMath 实际口径）：
     join 键=真实位 (x,y,w,h)（无重叠=唯一）；无值=null → 角标 '-' + 排尾（作者口径） */
  function dispRows(D, model) {
    /* v1.8.5⑩ join 改 **物品 id 直配**（作者线索实锤：开包后拖拽/一键整理移动物品，
       契约行还停在推包时的旧位置——按位置配对全错：角标显示成「原来在这个位置的物品」
       的数值、配不上就 '-'，重开背包=契约重推才恢复。id=InstanceId 双侧同空间实锤：
       官方拖拽 DRAG_ITEM 本就带同一 it.id 回 C# 搬同一 Data_Item）。位置 join 降为
       id 缺失时的兜底。数值口径同 v1.8.5⑤：契约 RailSortMath（详情口径）。 */
    var out = [], i, it;
    D.owner = dispOwnerOf(D, model);
    var arr = itemsOf(D.owner), byId = {}, byPos = {}; /* v1.8.6：join 跟实例 D（柜侧=柜 owner；漏参=误 join 袋行全 null 的实锤病灶） */
    for (i = 0; i < arr.length; i++) {
      byId[String(arr[i].id)] = arr[i];
      byPos[(arr[i].x || 0) + '_' + (arr[i].y || 0) + '_' + (arr[i].w || 1) + '_' + (arr[i].h || 1)] = arr[i];
    }
    for (i = 0; i < model.items.length; i++) {
      it = model.items[i];
      var row = byId[String(it.id)] || null;
      var realAt = model.items.__srReal ? model.items.__srReal.get(it.id) : null;
      var jx = realAt ? realAt[0] : (it.x || 0), jy = realAt ? realAt[1] : (it.y || 0);
      if (!row) row = byPos[jx + '_' + jy + '_' + (it.w || 1) + '_' + (it.h || 1)] || null;
      out.push({
        id: it.id, x: jx, y: jy, w: it.w || 1, h: it.h || 1,
        count: row ? row.count : (it.count || 1),
        cfgId: row ? row.cfgId : null, /* v14：brewTierOf 查 ICFG[canBrew] 用（brew spec §5.2） */
        s1: row && row.s1 != null ? row.s1 : null,
        s2: row && row.s2 != null ? row.s2 : null,
        s3: row && row.s3 != null ? row.s3 : null,
        s4: row && row.s4 != null ? row.s4 : null,
        trade: row && row.tradeV != null ? row.tradeV : null,
        days: row && row.days != null ? row.days : null /* 不腐/无保质=null → '-' + 排尾（C# DaysLeftOf：life<1 → null） */
      });
    }
    return out;
  }
  function dispKeyOf(row, k) {
    if (!row) return null;
    if (k === 'shelf') return row.days == null ? null : row.days;
    if (k === 'value' || k === 'tvalue') return row.trade == null ? null : row.trade;
    var v = k === 'sat' ? row.s1 : k === 'mind' ? row.s2 : k === 'en' ? row.s3 : k === 'hp' ? row.s4 : null;
    return v == null ? null : v;
  }
  /* 装填（PC pack 首放，cols/rows=模型官方值；rows+8 余量放不下=整体不排） */
  function dispPack(ordered, cols, rows) {
    var used = [];
    for (var y = 0; y < rows + 8; y++) used.push(new Array(cols).fill(false));
    var out = new Map();
    for (var i = 0; i < ordered.length; i++) {
      var it = ordered[i], w = it.row.w || 1, h = it.row.h || 1, fx = -1, fy = -1;
      for (var yy = 0; yy + h <= rows + 8 && fx < 0; yy++) for (var xx = 0; xx + w <= cols; xx++) {
        var free = true;
        for (var a = yy; a < yy + h && free; a++) for (var b = xx; b < xx + w; b++) if (used[a][b]) { free = false; break; }
        if (free) { fx = xx; fy = yy; break; }
      }
      if (fx < 0) return null;
      for (var a2 = fy; a2 < fy + h; a2++) for (var b2 = fx; b2 < fx + w; b2++) used[a2][b2] = true;
      out.set(it.row.id, [fx, fy]);
    }
    return out;
  }
  /* 主入口：join 模型 → 排序 → 装填 → 写模型 x/y → render（页面自己重渲染）；official=还原 */
  function dispApply(D) {
    var model = dispModel(D);
    if (!model) return;
    D.model = model;
    if (!D.choice || D.choice === 'official') { dispRestore(D, model); return; }
    /* v14.1（作者 2026-11-07 令「不与公共排序规则混合」）：酿酒桶饱腹序走**专属 apply**，
       公共比较器不再带 brew 分支（v14 的比较器内分支已拆出）；置灰/无角标语义由角标层
       按 brewTierOf 现场判定，无附加状态。 */
    if (D === DISP && st.scene === 'BrewPanel' && D.choice === 'sat') { dispApplyBrewSat(D, model); return; }
    var items = model.items;
    if (!items.__srReal) { /* real 快照挂 items 数组本体：先于 dispRows（join 需真实位）；
       数组被官方刷新替换=新数组无快照=自然重采（PC 判定同款） */
      var real = new Map();
      for (var r0 = 0; r0 < items.length; r0++) real.set(items[r0].id, [items[r0].x || 0, items[r0].y || 0]);
      items.__srReal = real;
    }
    var rows = dispRows(D, model);
    var pairs = [];
    for (var i = 0; i < rows.length; i++) pairs.push({ row: rows[i], it: model.items[i], i: i });
    var key = D.choice, sign = -1; /* 全键降序=高在前（作者 2026-11-01 口径：保质期=保质长的在前；PC 快坏在前不采） */
    pairs.sort(function (a, b) {
      var ka = dispKeyOf(a.row, key), kb = dispKeyOf(b.row, key);
      if (ka == null || kb == null) return ((ka == null ? 1 : 0) - (kb == null ? 1 : 0)) || (a.i - b.i);
      var d = (ka - kb) * sign; /* PC 原式 (a.k-b.k)*sign：desc=-1 高在前；shelf=+1 小在前 */
      return d !== 0 ? (d > 0 ? 1 : -1) : (a.i - b.i);
    });
    var packed = dispPack(pairs, model.cols, model.rows);
    if (!packed) { dispRestore(D, model); return; }
    var wrote = false;
    for (var p = 0; p < pairs.length; p++) {
      var at = packed.get(pairs[p].row.id);
      if (!at) continue;
      if (pairs[p].it.x !== at[0]) { pairs[p].it.x = at[0]; wrote = true; }
      if (pairs[p].it.y !== at[1]) { pairs[p].it.y = at[1]; wrote = true; }
    }
    /* v14.1 闪烁根修（brew spec §5 增补；公共路径缺陷，cooking 同病 976 变更/800ms 实测）：
       renderItems 必须 wrote 门控——旧版无条件重渲染 → MO 回调（ensureBadgeObserver）再进
       dispApply → 再渲染 → **50ms 级自激环**：格节点逐拍重建吃掉悬停/点击（mouseenter 未完
       节点已被替换）、视觉=不停闪烁。与 vue 路径的 wrote 门控（下行 settling）对齐。
       官方真重渲染（BagMsg 换新数组=新快照/位置回实）仍会 wrote=true 正常跟随。 */
    if (wrote && model.kind === 'grid') { try { model.grid.renderItems(); } catch (e) { } }
    /* vue：响应式自动重渲染；settling=DOM 未追平窗口（MO 回调清除，角标窗口期跳过） */
    if (wrote && model.kind === 'vue') D.settling = true;
  }
  /* v14.1 酿酒桶饱腹序专属 apply（brew spec §5 增补）：只有可酿（bw 且 s1>0）参与排序——
     品质主键 烈→普→劣，同品质 s1 降序，稳定键 i 收尾；不可酿（含非食物/无饱腹/无契约行）
     全部垫后（稳定序）。置灰遮罩+无数值角标由角标层按同一 brewTierOf 判定绘制（无第二状态源）。
     快照/装填/写位复用公共件（dispRows/dispPack），排序语义自成一体不进公共比较器。 */
  function dispApplyBrewSat(D, model) {
    var items = model.items;
    if (!items.__srReal) {
      var real = new Map();
      for (var r0 = 0; r0 < items.length; r0++) real.set(items[r0].id, [items[r0].x || 0, items[r0].y || 0]);
      items.__srReal = real;
    }
    var rows = dispRows(D, model);
    var brew = [], rest = [];
    for (var i = 0; i < rows.length; i++) {
      var pr = { row: rows[i], it: items[i], i: i };
      (brewTierOf(rows[i]) >= 0 ? brew : rest).push(pr);
    }
    brew.sort(function (a, b) {
      var ta = brewTierOf(a.row), tb = brewTierOf(b.row);
      if (ta !== tb) return tb - ta;                 /* 品质主键：烈(2)→普(1)→劣(0) */
      var ka = a.row.s1, kb = b.row.s1;              /* 同品质：饱腹高在前（null 已被 tier=-1 排除） */
      return ka !== kb ? (kb - ka) : (a.i - b.i);
    });
    rest.sort(function (a, b) { return a.i - b.i; }); /* 不可酿：原序垫后 */
    var pairs = brew.concat(rest);
    var packed = dispPack(pairs, model.cols, model.rows);
    if (!packed) { dispRestore(D, model); return; }
    var wrote = false;
    for (var p = 0; p < pairs.length; p++) {
      var at = packed.get(pairs[p].row.id);
      if (!at) continue;
      if (pairs[p].it.x !== at[0]) { pairs[p].it.x = at[0]; wrote = true; }
      if (pairs[p].it.y !== at[1]) { pairs[p].it.y = at[1]; wrote = true; }
    }
    if (wrote && model.kind === 'grid') { try { model.grid.renderItems(); } catch (e) { } }
  }
  function dispRestore(D, model) {
    if (!model || !model.items || !model.items.__srReal) return;
    var moved = false;
    for (var i = 0; i < model.items.length; i++) {
      var it = model.items[i], at = model.items.__srReal.get(it.id);
      if (!at) continue;
      if (it.x !== at[0]) { it.x = at[0]; moved = true; }
      if (it.y !== at[1]) { it.y = at[1]; moved = true; }
    }
    if (moved && model.kind === 'grid') { try { model.grid.renderItems(); } catch (e) { } }
  }
  /* 角标行绑定（v1.8.5 第四轮：作者缺陷#1/#3）——**下标直配**：Vue v-for 不重排 DOM、
     webui-bag renderItems 同序 ⇒ cells[i] ↔ model.items[i] 恒成立（ProjectCook 原做法）。
     旧「位置序 zip」在悬停缩放（rect 抖动）与详情弹层（格容器多节点）下失稳=数值跳动/清空。 */
  function dispCellRows(D, gridEl) {
    var model = D.model;
    if (!model || !gridEl) return null;
    if (D.settling) return null; /* 模型刚写、DOM 未追平的窗口期：跳过（防新行配旧格） */
    var cells = gridEl.querySelectorAll('.item');
    if (!cells.length || cells.length !== model.items.length) return null;
    if (cells[0].offsetWidth < 2) return null; /* 页面隐藏（详情弹层顶替）=全格零尺寸：保留上一次 */
    var rows = dispRows(D, model); /* 行序=模型数组序（与 DOM 同序）——不再按位置重排 */
    var m = new Map();
    for (var j = 0; j < cells.length; j++) m.set(cells[j], rows[j]);
    return m;
  }
  /* 布局坐标（作者缺陷#1：悬停缩放走 transform，getBoundingClientRect 是视觉框会抖——
     offset* 是布局值不受影响）。返回 el 相对 stop 的 (x,y)。 */
  function offsetXY(el, stop) {
    var x = 0, y = 0, n = el;
    while (n && n !== stop) {
      x += n.offsetLeft || 0; y += n.offsetTop || 0;
      n = n.offsetParent;
      if (!n) break;
      if (stop && stop.contains && !stop.contains(n)) {
        var a = el.getBoundingClientRect(), b2 = stop.getBoundingClientRect();
        return [a.left - b2.left, a.top - b2.top];
      }
    }
    return [x, y];
  }
  function dispActive(D) { return !!(D.choice && D.choice !== 'official' && D.model); }
  /* dropFilter（PC dropFilter 移植）：真实布局=模型 real 快照（无快照=未排序=放行原消息） */
  function dispFirstFree(D, w, h) {
    var model = D.model;
    if (!model || !model.items || !model.items.__srReal) return null;
    var cols = model.cols, occ = [];
    for (var y = 0; y < model.rows + 8; y++) occ.push(new Array(cols).fill(false));
    for (var i = 0; i < model.items.length; i++) {
      var it = model.items[i], at = model.items.__srReal.get(it.id);
      if (!at) continue;
      for (var a = at[1]; a < at[1] + (it.h || 1); a++) for (var b = at[0]; b < at[0] + (it.w || 1); b++)
        if (a < occ.length && b < cols) occ[a][b] = true;
    }
    for (var yy = 0; yy + (h || 1) <= occ.length; yy++) for (var xx = 0; xx + (w || 1) <= cols; xx++) {
      var free = true;
      for (var a2 = yy; a2 < yy + (h || 1) && free; a2++) for (var b2 = xx; b2 < xx + (w || 1); b2++) if (occ[a2][b2]) { free = false; break; }
      if (free) return [xx, yy];
    }
    return null;
  }
  function installDispDropFilter() {
    if (window.__srDispDrop) return;
    try {
      window.__srDispDrop = 1;
      var prev = window.postMessage;
      window.postMessage = function (msg) {
        try {
          var m = msg;
          if (m && typeof m === 'object' && (m.type === 'DRAG_ITEM' || m.type === 'ITEM_MOVE' || m.type === 'GROUND_PICK_TO')) {
            var d = m.data || {};
            var to = d.dstOwnerId != null ? d.dstOwnerId : (d.toOwnerId != null ? d.toOwnerId : d.ownerId);
            var D = null; /* v1.8.6 双实例：取落点 owner 命中的活动排序（袋/柜同屏各自排序各自接） */
            if (to != null) {
              if (dispActive(DISP) && String(to) === String(DISP.owner)) D = DISP;
              else if (dispActive(DISP_CT) && String(to) === String(DISP_CT.owner)) D = DISP_CT;
            }
            if (D) {
              var from = m.type === 'GROUND_PICK_TO' ? null : (d.srcOwnerId != null ? d.srcOwnerId : d.fromOwnerId);
              if (from != null && String(from) === String(to)) return; /* 同容器拖动：排序态取消 */
              var cell = dispFirstFree(D, 1, 1); /* 尺寸未知按 1x1（宁占单格） */
              if (!cell) return;
              var nd = {};
              for (var k2 in d) nd[k2] = d[k2];
              nd.x = cell[0]; nd.y = cell[1];
              if ('cursorCol' in nd) nd.cursorCol = cell[0];
              if ('cursorRow' in nd) nd.cursorRow = cell[1];
              var nm = {};
              for (var k3 in m) nm[k3] = m[k3];
              nm.data = nd;
              return prev.call(this, nm);
            }
          }
        } catch (e) { }
        return prev.apply(this, arguments);
      };
    } catch (e) { }
  }
  installDispDropFilter();

  /* ================= 排序/角标 prefab（2026-11-03 复用化：三处手搓排序 UI 收敛） =================
     三入口（rail 工具行 srSortBtn / 机器页页脚 srFoodSort / NB 原生页 srnSortBtn）与
     apply/角标双份拷贝收敛为三件可复用件（**只复用行为**：markup/id/类名留在各页模板原处，
     CSS 与 harness 契约零移动）：
       makeSortMenu(cfg)      排序钮+弹层：开合/渲染/标签同步/选键接线（元素按 cfg id 现取）。
       applyDispSort(key,cfg) 显示层排序统一应用（合并 applyFsort/nbApplyFsort）：setKey 回写
                              页面态（st.fsort / NB.fsort）→ dispReapply 施 DISP → menu.sync 触发钮
                              → after 页面各自跟随 → toast（v1.8.5 显示层排序：选择即生效，纯模型
                              x/y 写+官方自渲染，真实摆放零触碰——ProjectCook 机制；切场景重置
                              §4.11；toast 即时，显示层无失败路径）。
       makeBadgeLayer(cfg)    角标层（合并 applyBadges/nbBadges）：spec()=null 走清路（rail 留空层/
                              NB 删层节点，各随原行为）；dx/dy=右上角坐标微调；skipHide=rail 被
                              筛掉的格不标。三道防抖全保留（瞬时零格/配对未成保旧、同串免写
                              ——v1.8.5 作者缺陷#2/#3 定稿语义）。
     新页面要排序 = 一处 makeSortMenu + 一份 applyDispSort cfg + 一个 makeBadgeLayer 实例。 */
  var menuSort = null, menuFoot = null, menuNB = null, menuNB2 = null; /* bind()/nbMount 每周期重建（换 doc 换元素）；menuNB2=NB 柜侧（v1.8.6） */

  function makeSortMenu(cfg) {
    var d = cfg.doc || document;
    var btn = d.getElementById(cfg.btnId), pop = d.getElementById(cfg.popId);
    var lbl = cfg.lblId ? d.getElementById(cfg.lblId) : null;
    var body = cfg.bodyId ? d.getElementById(cfg.bodyId) : pop; /* rail 弹层=头+体两层；NB 选项直写 pop */
    if (!btn || !pop || !body) return null;
    /* v14：cfg.keys 兼容函数（每次取用时解析——页脚实例按 st.scene 动态收敛，brew spec §5.2；
       数组路径（工具行 SORTS/NB 实例）行为零改动） */
    function keysOf() { return typeof cfg.keys === 'function' ? cfg.keys() : cfg.keys; }
    function labelOf(k) {
      var ks = keysOf();
      for (var i = 0; i < ks.length; i++) if (ks[i].k === k) return ks[i].label;
      return cfg.defLbl || k;
    }
    var M = {
      btn: btn, pop: pop,
      open: function () { pop.hidden = false; M.renderPop(); },
      close: function () { pop.hidden = true; },
      toggle: function () { if (pop.hidden) M.open(); else M.close(); },
      refresh: function () { if (!pop.hidden) M.renderPop(); }, /* render 主路：弹层开着才重渲染 */
      renderPop: function () {
        var h = '', ks = keysOf();
        for (var i = 0; i < ks.length; i++) {
          var s = ks[i], on = s.k === cfg.getKey();
          h += '<button type="button" class="' + cfg.optCls + (on ? ' active' : '') + '" ' + cfg.attr + '="' + s.k + '">' +
            (cfg.ico ? '<span class="f-ico" aria-hidden="true">' + s.ico + '</span>' : '') + s.label +
            (on && cfg.tick ? '<span class="srn-tick">✓</span>' : '') + '</button>';
        }
        body.innerHTML = h;
      },
      /* v1.8.5（作者缺陷#2）：触发钮标签随当前类型（选中=亮金 onCls；默认=defLbl「排序」） */
      sync: function () {
        if (!lbl || !btn) return;
        var k = cfg.getKey(), t = (k && k !== 'official') ? labelOf(k) : cfg.defLbl;
        if (lbl.textContent !== t) lbl.textContent = t;
        if (cfg.onCls) {
          var on = !!(k && k !== 'official');
          if (btn.classList.contains(cfg.onCls) !== on) btn.classList.toggle(cfg.onCls, on);
        }
      }
    };
    btn.onclick = function () { if (cfg.pre) cfg.pre(); M.toggle(); };
    body.onclick = function (e) { /* 委托选键：选完即关（三入口同款口径） */
      var b = e.target.closest('[' + cfg.attr + ']'); if (!b) return;
      M.close();
      cfg.onPick(b.getAttribute(cfg.attr));
    };
    return M;
  }

  /* 显示层排序应用：非用户路径（机器页每次渲染重抹；Trade 默认路已随 v1.8.9 退役）走
     dispReapply——无菜单同步、无 toast（与 v1.8.5 行为一致） */
  function dispReapply(D, key, ownerId) { D.choice = key; D.owner = ownerId; dispApply(D); }
  function applyDispSort(key, cfg) {
    var D = cfg.disp || DISP; /* v1.8.6：cfg.disp 指定实例（NB 柜侧传 DISP_CT；缺省 DISP=机器页/rail/袋侧现状） */
    cfg.setKey(key);
    dispReapply(D, key, cfg.owner());
    if (cfg.menu) cfg.menu.sync();
    if (cfg.after) cfg.after();
    if (st.scene === 'BrewPanel' && key === 'sat') toast('已按「饱腹度」排序 · 烈→普→劣 · 同品质按饱腹值从高到低（仅显示排序，不改实际摆放）'); /* v14：品质主键口径（brew spec §3） */
    else toast(key === 'official' ? '已恢复官方默认排序' : '已按「' + fsortLabel(key) + '」排序 · 格子右上角显示数值（仅显示排序，不改实际摆放）');
  }
  /* 角标规格：可排序页=当前属性排序维；Trade 特例（十三批）——官方序时常显金色交易价值
     角标（v1.8.9 十批口径保留），选了维度后改显所选维数值（与食品页同口径）。
     【v1.8.10 十三批三追（作者实机）】Trade 官方序**不再常显**价值角标——十批「金色
     价值角标保留」的语境是默认价值排序在排、角标显排序依据；十批退役排序后 official
     态常显价值=作者观感「残留的默认按价值排序还在生效」。收口=Trade 与其余六页完全
     统一：官方序无角标，选维才显示该维数值。 */
  function badgeSpec() {
    if (isSortScene() && st.fsort && st.fsort !== 'official') return { k: st.fsort, color: FBCOLOR[st.fsort] || '#f0b03c' };
    return null;
  }
  function badgeTextFor(it, k) { /* v1.8.5：唯一入参=dispRows 行（页面模型/契约 join 的逐叠数值）。
     2026-11-03 作者数值显示口径：属性维（饱腹/心态/精力/生命）正值带「+」、负值显实际数
     （String 自带负号，如 -2）、无属性/0=「-」；交易价值=金额不带符号、保质期=daysText
     文本——两键不进 +／- 规则（与列表模式 DYN 列同口径）。C# 契约 0 已折 null
     （RailSortMath「v!=0 才落值」），v===0 分支仅为防御旧契约/mock。 */
    if (k === 'shelf') return daysText(it ? it.days : null);
    if (k === 'value' || k === 'tvalue') return it && it.trade != null ? String(it.trade) : '-';
    var v = it ? (k === 'sat' ? it.s1 : k === 'mind' ? it.s2 : k === 'en' ? it.s3 : k === 'hp' ? it.s4 : null) : null;
    if (v == null || v === 0) return '-';
    return v > 0 ? '+' + v : String(v);
  }
  /* 角标（v1.8.5 显示层排序配套）：数值=DISP join 的契约行（RailSortMath 逐叠数值）——
     每格绑定的行恒定（不再随推送错配=「数值变来变去」根治）；join 未成/行缺=宁缺勿错。
     zoom 归一（rect/offsetWidth 比值）沿用；位置随格（显示层排序后仍钉在格右上角）。
     v2（2026-11-03）：绘制主体收敛 makeBadgeLayer prefab，rail/NB 两实例各传宿主/键色/微调。 */
  function makeBadgeLayer(cfg) {
    return function () {
      try {
        var host = cfg.host();
        if (!host) return;
        var doc = host.ownerDocument;
        var layer = doc.getElementById(cfg.layerId);
        var spec = cfg.spec();
        if (!spec) { /* 无排序/页隐藏：rail 留空层、NB 删层节点（各随原行为） */
          if (layer && layer.parentNode) {
            if (cfg.removeOnClear) layer.parentNode.removeChild(layer);
            else layer.innerHTML = '';
          }
          return;
        }
        var its = host.querySelectorAll('.item');
        if (!its.length) {
          /* 瞬时零格（弹层/重渲染窗口）不清角标——只在没有排序时清（上方 spec 分支）。
             【v1.8.10 十三批三追（作者实机「空柜子还有数值 - 显示」）】真·空容器（模型同
             0 件）≠ 瞬时窗口：切到空柜页签时旧页签角标整层残留（its=0 早退保上一次）。
             判据=模型也 0 件（dispApply 已随切柜重取模型）→ 清层；模型未就位或 >0（真窗口）保留。 */
          var m0 = (cfg.disp || DISP).model;
          if (m0 && m0.items && !m0.items.length && layer) layer.innerHTML = '';
          return;
        }
        if (!layer) {
          layer = doc.createElement('div');
          layer.id = cfg.layerId;
          if (cfg.layerCls) layer.className = cfg.layerCls; /* v1.8.6：样式走类（NB 双层同规同款，id 仅作寻址） */
          layer.__srBadgeLayer = true;
          host.appendChild(layer); /* 官方格容器之外的自家层：壳元素/格节点，合法 */
        }
        var cellRows = dispCellRows(cfg.disp || DISP, host); /* 下标直配（v1.8.5④：offset 布局坐标定位，无 rect 归一） */
        if (!cellRows) { return; } /* 配对未成：保留上一次内容（不清空——作者缺陷#3）；下一轮再画 */
        var h = '';
        var brewMode = (spec.k === 'sat' && st.scene === 'BrewPanel'); /* v14.1：brew 饱腹序专属绘制径 */
        for (var k = 0; k < its.length; k++) {
          var elx = its[k];
          if (cfg.skipHide && elx.getAttribute('data-srhide')) continue; /* 被筛掉的格不标（rail 筛选态） */
          var it = cellRows.get(elx);
          if (!it && !brewMode) continue; /* brew 模式：无契约行的格也要置灰（v14.1），其余模式照旧跳过 */
          if (elx.offsetWidth < 2 || elx.offsetHeight < 2) continue;
          var p = offsetXY(elx, host); /* 布局坐标（悬停缩放不影响） */
          var x = p[0] + elx.offsetWidth + (cfg.dx || 0), y = p[1] + (cfg.dy || 0);
          /* v14.1 酿酒桶+饱腹序（brew spec §5 增补）：只有可酿物品画 <i>（数值+品质色角标，
             与数值同一条 dispRows 下标直配链（it），不另起 join；劣绿/普黄/烈粉=游戏 BrewPanel
             TIER_COLOR 同源）；不可酿（含无契约行）=置灰遮罩 .sr-brewdim 且无数值角标，
             pointer-events:none 官方交互零遮挡 */
          if (brewMode) {
            var tb = it ? brewTierOf(it) : -1;
            if (tb < 0) {
              h += '<b class="sr-brewdim" style="left:' + Math.round(p[0]) + 'px;top:' + Math.round(p[1]) +
                'px;width:' + Math.round(elx.offsetWidth) + 'px;height:' + Math.round(elx.offsetHeight) + 'px"></b>';
              continue;
            }
            h += '<i style="left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px;color:' + spec.color + '">' + badgeTextFor(it, spec.k) +
              '<span class="sr-tier" style="color:' + TIER_COLOR[tb] + '">' + TIER_TXT[tb] + '</span></i>';
            continue;
          }
          h += '<i style="left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px;color:' + spec.color + '">' + badgeTextFor(it, spec.k) + '</i>';
        }
        if (h === '' && layer.innerHTML) return; /* 空结果不覆写（隐藏/窗口期保上一次——作者缺陷#2 终修） */
        if (layer.innerHTML !== h) layer.innerHTML = h; /* 同串免写：防自家写入触发观察器回环 */
      } catch (e) { try { console.warn('[CERail] 角标绘制失败', e && (e.stack || e.message)); } catch (e2) { } }
    };
  }
  var applyBadges = makeBadgeLayer({ /* rail/机器页实例：srGridHost 壳内 #srBadgeLayer，Trade=交易价值金/食品设施=当前属性维 */
    host: function () { return el.srGridHost; },
    layerId: 'srBadgeLayer',
    spec: function () { var s = badgeSpec(); return (!s || st.mode !== 'grid' || st.global) ? null : s; },
    disp: DISP, dx: 0, dy: 0, skipHide: true, removeOnClear: false
  });
  /* 格观察器 prefab（ensureBadgeObserver/nbEnsureGridMO 挂 MO 段共用）：marker 幂等，
     50ms 防抖回调（settling 窗口校准同源——v1.8.5 定版节拍） */
  function watchGrid(target, marker, opts, cb) {
    if (!target || target[marker]) return;
    try {
      var V = target.ownerDocument.defaultView.MutationObserver;
      target[marker] = new V(function () { setTimeout(cb, 50); });
      target[marker].observe(target, opts);
    } catch (e) { }
  }
  /* 官方格重渲染跟随：观察自家 srGridHost（合法，非官方节点）——官方改格后先重抹显示层
     排序（新格=真实态→重 join+重排，ProjectCook 自愈模式）再重算角标；
     v1.8.4 缺陷#5 加宽同步——官方格 cols 异步回推变宽时壳重测跟随（防滚动条压末列）；
     v1.8.4c 缺陷（柜子滚动条）——官方 createGridSizeLock 的 margin 填充跟清（unlockGridSize） */
  function ensureBadgeObserver() {
    watchGrid(el.srGridHost, '__srBadgeMO', { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] },
      function () {
        /* Bug4 三段计时：整理后官方格首改=官方排序落地（首见盖戳，50ms 防抖粒度） */
        if (XFER && XFER.kind === 'tidy' && XFER.t0 && !XFER.tMO) XFER.tMO = Date.now();
        unlockGridSize(); DISP.settling = false; dispApply(DISP); applyBadges(); syncRailWidth();
      });
  }
  /* v1.8.4c 作者缺陷「柜子滚动条」：官方 createGridSizeLock（webui-bag.js@1211）的
     seenRows/seenCols 只增不减（hint=State.bagMaxRows=页签柜最高行，作者括号直觉逐字命中）
     → 切到短柜后格容器被上下/左右 margin 撑到「见过的最高/最宽柜」：壳内 sr-body 滚动
     越界全是空白、且容纳也常显滚动条。壳内抵消锁定：官方每次 render 后 bagLock.apply
     重写 margin，观察器（ensureBadgeObserver）+ mount 首清跟清。
     安全性（动作保真红线核查）：官方拖放落点换算=容器实时 getBoundingClientRect（margin
     位移天然计入，webui-bag.js@387/406/446），清零不影响落点；锁内部 baseW/baseH 只读
     offsetWidth/offsetHeight（margin 是锁的输出不是输入），清零不污染锁状态；横向居中由
     .sr-gridhost flex 居中接管（缺陷#5 第三轮同款）。清零后滚动=当前柜真实行数：
     容纳即不可滚（v1.8.8 overflow-y:scroll 轨道常驻——作者令切柜不闪烁），滚动极限=当前柜底。 */
  function unlockGridSize() {
    var host = el.srGridHost;
    var g = host && host.firstElementChild;
    if (!g || !g.style) return;
    try {
      if (g.style.marginTop) g.style.marginTop = '';
      if (g.style.marginBottom) g.style.marginBottom = '';
      if (g.style.marginLeft) g.style.marginLeft = '';
      if (g.style.marginRight) g.style.marginRight = '';
    } catch (e) { }
  }
  /* 壳宽同步（v1.8.4 缺陷#5 从 render 抽出，双路调用：render 主路 + badge MO 官方重渲染路）：
     量官方格布局宽（childG.offsetWidth——官方格 inline px 定宽，与本壳宽度无关，e594832 口径）
     → 壳宽=格宽+20+滚动条宽 **纯跟随**。历史：v1.8.2.4 Bug2 的「只增不减锁」（st.railMinW）已随本缺陷
     退役——它防的是 scrollWidth 量宽反馈塌缩（量宿主自家→越量越窄死循环），e594832 改量官方格
     自身后反馈源已断；而锁在混宽时代（三道门后 6/8/10/12/15 列并存）两头作恶：契约包先到、
     官方 BagMsg（新列数）后到时，render 锁住旧宽 → 切窄格右侧空白 / 官方格变宽后滚动条压末列。
     幂等：宽度没变零 style 写入（自家 MO 观察 host 的 style 属性，写入即回调——必须防回环）；
     官方格瞬时拆建（nat≤40）不动宽度防抖。 */
  function syncRailWidth() {
    if (!el.rail || !el.srGridHost) return;
    /* 二十一批：gridhost 内官方格与 rack 行视图并排（rack 常态 display:none、rack 页签激活时
       反转）——量**首个可见件**（offsetWidth>40）；两件同隐（切页瞬态）=本轮不动作。单件时代
       语义不变（隐=0 宽=原 nat<=40 早退同款）。 */
    var childG = null;
    for (var ci = el.srGridHost.firstElementChild; ci; ci = ci.nextElementSibling) {
      if ((ci.offsetWidth || 0) > 40) { childG = ci; break; }
    }
    if (!childG) return;
    /* 缺陷#5 第二轮（作者实测：工作台页滚动条遮格≈一格半）：官方 8 个机器页全用
       createGridSizeLock（webui-bag.js@1211）把格容器钉在**见过的最大列数**——切窄柜时给
       格容器加左右 margin 补差，格区被左 margin 推右；量 offsetWidth 不含 margin → 壳比
       「格+左补边」窄 → 右侧整段滑进 overflow-x:hidden 被滚动条盖住。修=量**外沿宽**。
       缺陷#5 第三轮（作者实测：工作台 12 列柜只显示 10 列半）：ToolTable 类页面的官方格
       容器**无 inline 宽**（gridInlineW=null 实锤）——block 拉伸下随父定宽，宿主再被写死
       宽度=量宽照镜子，切宽柜后轨道溢出被裁（夹具实锤 lastCellR 超 body 263px）。修=壳内
       .sr-gridhost 改列 flex 居中（railui.css，官方 .backpack-panel 同款）→ 格容器恢复
       fit-content（随轨道内容定宽），**宿主宽度一律不写**（写=冻宽陷阱），只量不锁。 */
    var nat = childG.offsetWidth || 0;
    try {
      var cs = childG.ownerDocument.defaultView.getComputedStyle(childG);
      nat += (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
    } catch (e) { }
    if (nat <= 40) return;
    /* 滚动条计入壳宽（症状②根因）：sr-body overflow-x:hidden 下格区横向溢出恒为
       壳内衬（rail padding20+border2+body border2=24）+滚动条宽。不加 sb 时 WebView2
       经典滚动条(≈8px)溢出 12px>格区自带右内边距 9px → 末列右缘被啃进滚动条底下；
       +sb 后溢出恒 4px≤9px，末列与滚动条粗细无关地安全。v1.8.8 起 sr-body
       overflow-y:scroll 轨道常驻 → sb 恒=滚动条宽（切柜不再 0↔8px 跳变，本量测
       退化为常量确认；MO 补量路径保留作兜底）。 */
    var sb = 0;
    try { var body = el.rail.querySelector('.sr-body'); if (body) sb = Math.max(0, body.offsetWidth - body.clientWidth); } catch (e) { }
    if (el.srGridHost.style.width) el.srGridHost.style.width = ''; /* 历史冻宽残留清除（幂等） */
    /* 壳宽=外沿+24+sb：24=rail 内衬 20+两重边框 4（补齐后格区横向溢出恒 0——第三轮实测
       ToolTable 官方格无内边距，+20 信用下末列右缘被结构性啃 3px；Brew 类 9px 内边距页
       此前把它藏着）。sb=滚动条（同上）。 */
    /* 壳宽地板（spec §5.2，作者令「窄柜两侧留白不缩放」）：地板宽=本页首见 UNI_W 列
       容器时标定的跟随宽（自动吸收各页 slot/内边距差异，零魔法常数）；此后壳宽=max(跟随宽,地板)
       ——窄柜居中留白（.sr-gridhost flex 居中已在位、官方锁 margin 已清），>UNI_W 仍可长胖永不
       裁格。UNI_W=0（cfg off）整段跳过=回纯跟随；UNI_W 值变（setData 清标定）与场景切换
       （applyScene 清标定）失效重标定。cols 信号=dispModel(DISP)（机器页 webui-bag
       getConfig().cols / Vue 页 setupState；rack 页 grid:null 恒 null=不参与地板）。 */
    var rwNum = nat + 24 + sb;
    if (UNI_W > 0) {
      var colsNow = 0;
      try { var dm = dispModel(DISP); colsNow = dm ? (dm.cols | 0) : 0; } catch (e) { }
      if (!(colsNow > 0) && childG) {
        /* 计列兜底（计划 §6-1）：ToolTable 类页面实例是全局 const 绑定（非 window 属性，
           dispGridOf 的 for-in 扫描不可见——同因 v1.8.10 排序在其上静默死的家族病）——
           从官方格 computed gridTemplateColumns 轨道数计列（rack 分行视图 grid display:none
           → 'none' → 0=不参与，天然排除） */
        try {
          var gtc = (childG.ownerDocument.defaultView.getComputedStyle(childG).gridTemplateColumns || '').trim();
          if (gtc && gtc !== 'none') { var tn = gtc.split(/\s+/).length; if (tn > 0 && tn < 100) colsNow = tn; }
        } catch (e) { }
      }
      if (colsNow === UNI_W) { st.w12Floor = rwNum; st.w12Src = UNI_W; }
      else if (st.w12Src !== UNI_W) { st.w12Floor = 0; } /* cfg 改值后旧标定失效（setData 亦清，双保险） */
      var wfl = st.w12Floor | 0;
      if (wfl > 0 && rwNum < wfl) rwNum = wfl;
    }
    var rw2 = rwNum + 'px';
    if (el.rail.style.width !== rw2) {
      try {
        el.rail.style.setProperty('width', rw2, 'important');
        el.rail.style.setProperty('min-width', rw2, 'important');
        el.rail.style.setProperty('max-width', rw2, 'important');
      } catch (e) { }
    }
    if (SB_IND) SB_IND.repaint(); /* v1.8.8：壳宽/格重排后指示轨几何跟随 */
  }

  /* ---- v1.8.8 恒显滚动指示轨（终案）----
     证据链：fluent 已环境级关闭+自定义滚动条接管（诊断实锤 gap=10/trackRule=1）后，剩余
     「闪」=原生 thumb 外观随滚动状态切换——溢出=可见短 thumb、容纳=满长 18% 白近隐形，
     切柜瞬态（官方 size-lock margin 先撑后清 1-2 帧）在两态间跳动=「闪一下然后消失」；
     纯静态条（第四轮）无位置反馈=作者判「滚了没反应」。终案=自绘指示轨：轨道/thumb 常驻
     常色不出现不消失（外观只有长度/位置变化），thumb 长度/位置=滚动比例（容纳时满长同色
     可见）；原生滚动条保持透明占位（槽宽恒定）。更新通路：scroll=即绘（滚动手感）；网格
     MO/尺寸变化=90ms 尾随防抖绘（瞬态寿命 1-2 帧≈16-33ms，90ms 后必已落定=瞬态不可见）；
     ResizeObserver 兜底几何。水平定位：absolute（壳）=CSS right 锚定（随 rail 冻宽同帧贴右，
     2026-11-05 追修「开机器页轨在柜中间闪」——JS left 滞留旧位 90ms）；fixed 量视口 rect。
     mode='fixed'：贴 iframe 视口（原生页宿主层级不可控时用，
     append 到 doc.body）；默认 host 相对定位（壳=rail，已 position:relative）。 */
  var SB_IND = null; /* 壳侧指示轨实例（bind 每次重挂重建） */
  /* readyFn（可选谓词，壳侧传入）：false=骨架期（官方格未进 sr-gridhost），track 整体
     display:none 不出现。第二层根因（2026-11-05 作者复验「还是中间闪，只是快了」）：
     right 锚定只消掉「变宽帧滞留 90ms」，但骨架期 rail=428 窄壳、轨站在 428 右缘≈
     冻宽后 704 宽柜的正中间——位置本身合法却错，格进壳冻宽那帧同帧跳到新右缘=跳的
     位移仍可见。恒显轨的语义是滚动位置反馈，格未进壳=无滚动可言，隐藏→格进壳
     （childList MO→90ms 防抖 repaint）→直接在正确位置现身，零中间帧。 */
  function sbMakeIndicator(doc, host, scroller, thumbCss, trackId, fixed, readyFn) {
    try {
      var t = doc.getElementById(trackId);
      if (!t) {
        t = doc.createElement('div');
        t.id = trackId;
        /* absolute（壳）水平定位=CSS right 锚定（常带）：rail 宽由 syncRailWidth 动态冻宽
           （首挂骨架 428→格进壳冻到格宽+24+sb），JS 像素 left 不随布局跟随、重绘又走 90ms
           防抖=变宽帧轨停在旧位（作者实机「开机器页滚动条在柜子中间闪一下再回右侧」根因，
           v1.8.10 十四批后追修）；right 锚定随 rail 宽同帧贴右零窗口。15=border1+padding10+
           留白4（与旧 left 公式 offsetLeft+offsetWidth−9 在满宽布局下逐像素等价）。 */
        t.style.cssText = (fixed ? 'position:fixed;' : 'position:absolute;right:15px;') +
          'width:6px;border-radius:3px;background:rgba(255,255,255,.07);pointer-events:none;z-index:20';
        var th0 = doc.createElement('div');
        th0.style.cssText = 'position:absolute;left:0;top:0;width:100%;border-radius:3px;' + thumbCss;
        t.appendChild(th0);
        host.appendChild(t);
      } else if (!t.isConnected) {
        host.appendChild(t);
      }
      if (t.__srScroller === scroller) { /* 同一滚动元素：只补一次几何（幂等快路径） */
        if (t.__srPaint) t.__srPaint();
        return { repaint: t.__srDeb };
      }
      if (t.__srUnbind) t.__srUnbind(); /* 官方重建格节点=换 scroller：解绑旧观察再重绑 */
      var thumb = t.firstChild;
      var paint = function () {
        try {
          var sr = scroller.getBoundingClientRect();
          if (readyFn && !readyFn()) { t.style.display = 'none'; return; } /* 骨架期隐藏（见工厂注释）：几何合法≠位置正确 */
          if (!sr.height || !scroller.clientHeight) { t.style.display = 'none'; return; }
          t.style.display = 'block';
          /* 坐标系：absolute 模式（壳）track 与 scroller 同在 rail 缩放上下文=全程布局像素
             （offsetTop/clientHeight 不受 transform 影响）；fixed 模式（原生页 body 上下文
             无缩放）贴视口=全程视觉像素（rect）。thumb 比例 ch/sh 无量纲，两模式都自洽。 */
          if (fixed) {
            t.style.top = Math.round(sr.top) + 'px';
            t.style.left = Math.round(sr.right - 8) + 'px';
            t.style.height = Math.round(sr.height) + 'px';
          } else {
            /* 水平定位退役（JS left→CSS right 锚定，创建 cssText 常带）：当年「滚动条跑左边」
               实锤根因=left/right 双 auto 走静态位置贴容器左缘，right 锚定不受该坑（left:auto+
               right:N 是公式定位非静态位置）。JS 只管垂直几何：top/height 布局像素（sr-body
               为 rail 直接子元素，offsetParent 恒=host，旧 rect 差兜底分支不可达随删）。 */
            t.style.top = (scroller.offsetTop + (scroller.clientTop || 0)) + 'px';
            t.style.height = scroller.clientHeight + 'px';
          }
          var sh = scroller.scrollHeight, ch = scroller.clientHeight, thh = t.clientHeight;
          if (sh <= ch + 2) { thumb.style.height = thh + 'px'; thumb.style.transform = 'translateY(0)'; return; }
          var h = Math.max(28, Math.round(ch / sh * thh));
          var y = Math.round(scroller.scrollTop / (sh - ch) * (thh - h));
          thumb.style.height = h + 'px';
          thumb.style.transform = 'translateY(' + y + 'px)';
        } catch (e) { }
      };
      var dTimer = 0;
      var debounced = function () { clearTimeout(dTimer); dTimer = setTimeout(paint, 90); };
      scroller.addEventListener('scroll', paint, { passive: true });
      var ro = null, mo = null;
      var w = scroller.ownerDocument && scroller.ownerDocument.defaultView;
      if (w) {
        try { if (w.ResizeObserver) { ro = new w.ResizeObserver(debounced); ro.observe(scroller); } } catch (e) { }
        try { if (w.MutationObserver) { mo = new w.MutationObserver(debounced); mo.observe(scroller, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] }); } } catch (e) { }
      }
      t.__srUnbind = function () {
        clearTimeout(dTimer);
        try { scroller.removeEventListener('scroll', paint); } catch (e) { }
        try { if (ro) ro.disconnect(); } catch (e) { }
        try { if (mo) mo.disconnect(); } catch (e) { }
      };
      t.__srScroller = scroller;
      t.__srPaint = paint;
      t.__srDeb = debounced;
      paint();
      return { repaint: debounced };
    } catch (e) { return null; }
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
       Trade 默认价值排序 v1.8.9 退役（恒官方真实排布，价值角标保留）。 */
    var plainSc = isPlainScene();
    el.rail.classList.toggle('plain', plainSc);
    if (plainSc) {
      st.mode = 'grid'; st.global = false; st.query = ''; st.tags = [];
    }
    el.srFoodSort.hidden = !isSortScene();
    if (menuFoot) menuFoot.sync();
    if (menuFoot) menuFoot.refresh();
    ensureBadgeObserver();
    /* v1.8.9：Trade 默认价值排序退役——不再重排物品；曾在此 prime 一次模型（official 态
       常显价值角标的 join 依赖）。v1.8.10 十三批三追：official 态常显价值角标随作者令
       取消（badgeSpec 收口，Trade 与其余六页统一=默认无角标），prime 失去消费者——删除
       （选维后由下方重抹路接管，trade vue 分支模型见 dispModel；官方序零模型开销）。 */
    /* v1.8.5：机器页排序态在每次渲染后重抹（切柜/回包后新格=真实态→重 join 重排，角标随后） */
    if (isPlainScene() && st.fsort && st.fsort !== 'official') dispReapply(DISP, st.fsort, st.currentId);
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
    if (menuSort) menuSort.sync();
    el.srDir.textContent = st.dir === 1 ? '↓' : '↑';
    el.srDir.title = st.dir === 1 ? '当前：数值高在前（点击切倒序）' : '当前：数值低在前（点击切回）';
    el.srFill.textContent = st.global
      ? '匹配 ' + fiAll.length + ' 件' + (limited ? '（显示前 ' + GLOBAL_LIMIT + '）' : '')
      : usedCells(fi) + ' / ' + st.cap + ' 格';
    var natH = st.rows * (st.slot + GAP) + 8, canScroll = !st.global && natH > el.srBody.clientHeight + 2;
    el.srView.textContent = st.global ? '全库模式' : st.rows + ' 行 · ' + (canScroll ? '↓ 纵向滚动' : '全部可见');

    var seg = el.srSeg.querySelectorAll('[data-mode]');
    for (var s = 0; s < seg.length; s++) seg[s].classList.toggle('active', seg[s].getAttribute('data-mode') === st.mode);
    renderTags(); /* 页签行=官方 DOM 原件（v1.8.7），官方渲染；rail 无页签渲染职责 */
    if (menuSort) menuSort.refresh();

    if (st.mode === 'grid' && !st.global) {
      /* 网格模式（v1.8.2）：物品区=官方原版格（mount 时搬进 srGridHost），壳只管显隐与
         筛选 display 层；官方格尺寸/空格/渲染全是官方的（缺陷⑥=天然继承官方尺寸） */
      el.srGridHost.hidden = false; el.srList.hidden = true;
      applyGridFilter(fi);
      st.gridScale = 1;
      /* v1.8.4 缺陷修复（作者实测：拖拽落点错位——瞄 A 格高亮 B 格、松手落 B 格）：
         **撤除格区 transform:scale 归一**。官方落点判定= (clientX-rect.left)/官方zoom/PAD
         再 /CELL(56 布局常数)（BackpackUI.html @6384 cachedZoom 路），rect 会带 transform
         但除数不带 → 光标→格子换算被放大 kk 倍，离格原点越远偏移越大（kk>1 向右下偏）。
         scale 归一是 v1.8.2.2（16 列时代）的视觉一致性机器，与 §0 红线「拖拽移动/落点预览
         官方动作原生存活（一票否决）」和 §2「mod 不改格子几何」冲突，格子回归官方原尺寸。
         宽度逻辑 v1.8.4 缺陷#5 起抽出=syncRailWidth()（壳宽=格宽+20 逐容器跟随，见其注释）。 */
      el.srGridHost.style.transform = 'none';
      /* v1.8.4 缺陷#5（作者实测：SizeEngine 三道门后共包柜回原宽，6/8/10/12/15 列并存——
         ① 旧「只增不减锁」st.railMinW 会话级不重置：看过宽格后切窄格，壳仍锁最大宽 → 窄格
         右侧一片空白；② 契约包先到 render 锁旧宽、官方 BagMsg（新列数）后到格变宽 → 壳比格
         窄 → sr-body 滚动条+overflow-x:hidden 压掉末列。修复=壳宽「格宽+20」**纯跟随**
         （syncRailWidth，render 主路+badge MO 官方重渲染路双调；锁退役——e594832 已改量官方格
         自身 offsetWidth，反馈塌缩源早断，锁只剩害处） */
      syncRailWidth();
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
    if (isPlainScene() && el.rail) plainSlotSync(el.rail.parentElement, el.rail); /* 七轮：槽位随渲染同步（官方等高契约；ResizeObserver 兜底挂载竞态） */
  }

  /* ---- 元素引用收集 + 交互接线 ----
     T3 已接：页签单击/网格列表分段/悬停详情；T4 已接：搜索/范围/标签 chips/
     ＋管理弹层/自定义词表/排序下拉/方向/选中态 + document 级弹层关闭与 Esc；
     T5 已接：页签拖拽/右键取出（take 入队，背包条目 toast 拒绝）——▾容器菜单/✎编辑弹窗
     已随 v1.8.9 整链退役；T9 已接：切柜伪造（forgeSwitchTo，现存调用=BackpackUI
     Bug3 重刷路）；T10 已接：整理柜双面板——sb* 系列与五按钮 id 一并进引用表
     （每帧重收，重绑路同样覆盖），监听器挂载在 bindBagPanel（bp.__srBound 门防双挂）；
     T11 已接：一键入库确认弹窗（srStoreAll/srStoreGo/srStoreCancel + 左面板 sbStoreAll/
     sbCancel/sbGo，见「T11 一键入库」区）；T12 已接：一键整理（srTidy→goTidy(st.currentId)
     / 左面板 sbTidy→goTidy(store.bag)，见「T12 一键整理」区）。 */
  function bind(doc, railEl) {
    var ids = ['srTitle', 'srCols', 'srCap', 'srTags', 'srTidy', 'srStoreAll', 'srStoreConfirm', 'srStoreText', 'srStoreCancel', 'srStoreGo',
      'srTabs', 'srOffTabs', 'srSearch', 'srScope',
      'srTagRow', 'srTagAdd', 'srSortBtn', 'srSortLbl', 'srDir', 'srSeg', 'srBody', 'srGridHost', 'srList', 'srHover', 'srFill', 'srView', 'srToast',
      'srTagManage', 'srTagManageX', 'srTagManageBody', 'srTagNew', 'srTagNewBtn', 'srSortPop', 'srSortPopBody',
      'srFoodSort', 'srFoodSortLbl', 'srFootSortPop', 'srFootSortBody',
      /* T10 中段（仅 rack 场景存在，非 rack 收集为 null，消费侧守卫；官方两按钮
         btnPutAll/btnTakeAll 零接线——官方监听随 reparent 存活，不入引用表） */
      'srMid', 'srTakeCat', 'srTakeCatMenu', 'srPutCat', 'srPutCatMenu', 'srTagPutIn', 'srTagChips'];
    el = {};
    var d = doc || document; /* mount 传入宿主文档（与 rail 同文档），直开时兜底 window 文档 */
    for (var i = 0; i < ids.length; i++) el[ids[i]] = d.getElementById(ids[i]);
    el.rail = railEl || null;
    el.doc = d; /* T10：closeMidMenus 模块级取用（bindBagPanel 开下拉前先收旧菜单） */
    /* 排序钮 prefab 实例（每帧 doc 重建；onclick 属性重挂天然幂等——重绑只是换指新 doc 元素）：
       工具行 SORTS 6 键=排侧栏自身列表（sortArr）；页脚 FSORTS 7 键=官方格显示层排序（DISP） */
    menuSort = makeSortMenu({
      doc: d, btnId: 'srSortBtn', lblId: 'srSortLbl', popId: 'srSortPop', bodyId: 'srSortPopBody',
      keys: SORTS, optCls: 'sr-sortopt', attr: 'data-sort', defLbl: '按分类',
      pre: function () { closePops('sort'); },
      getKey: function () { return st.sort; },
      onPick: function (k) { st.sort = k; render(); }
    });
    menuFoot = makeSortMenu({
      doc: d, btnId: 'srFoodSort', lblId: 'srFoodSortLbl', popId: 'srFootSortPop', bodyId: 'srFootSortBody',
      /* v14：酿酒桶页收敛两项——默认/饱腹度（其余五维在该场景无意义，作者 2026-11-07 令；
         sat 项 label 显示「饱腹度」）；其他可排序页 FSORTS 7 项原样 */
      keys: function () {
        if (st.scene === 'BrewPanel') return [FSORTS[0], { k: 'sat', label: '饱腹度', ico: '🍗' }];
        return FSORTS;
      },
      optCls: 'sr-fsopt', attr: 'data-fsort', defLbl: '排序', ico: true, onCls: 'on',
      pre: function () { closePops('fsort'); },
      getKey: function () { return st.fsort; },
      onPick: function (k) {
        applyDispSort(k, {
          setKey: function (v) { st.fsort = v; },
          owner: function () { return st.currentId; },
          menu: menuFoot, after: render
        });
      }
    });
    /* T9 重绑幂等门：rail 节点已带监听器（首次 bind 挂过，节点未换）→ 引用表重收即可，
       不再重挂（addEventListener 重复挂会让 contextmenu/drag/dblclick 双发）。
       mount 路（全新 DOM）无标记 → 正常挂全量。 */
    if (railEl && railEl.__srBound) return;
    if (railEl) railEl.__srBound = true;

    /* v1.8.7：页签单击切换=官方原生（官方页签元素上的官方监听），rail 不接线不拦截——
       v1.8.9 起 ▾ 容器菜单链退役（含切柜统一出口 switchTo），切柜全走官方原生路径。 */

    /* v1.8.9 退役：T5 ▾ 容器菜单（srAllCtn/srCtnPopBody 开合·单击切柜·双击开设置）
       与 ✎ 编辑弹窗接线（srEditTags/srEditSave/srEditCancel/srEditName）——随链删。 */

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
    /* v1.8.8 恒显滚动指示轨（bind 每次重挂重建实例；工厂按 trackId 幂等）。ready 门=
       官方格在壳：骨架期（格未进壳，mount bind 先于格 appendChild）轨道隐藏，杜绝
       「站在 428 窄壳右缘=冻宽后柜子中间」的可见错位帧。判定=非 mod 自建层（mod 层全带
       sr 前缀 id，如 #srBadgeLayer 也挂 srGridHost 内——Trade 的 Vue 格建得晚，badge 层
       可能先入壳，firstElementChild 判定会被它骗过=门失效，夹具实测抓出）。 */
    SB_IND = sbMakeIndicator(el.srBody.ownerDocument, el.rail, el.srBody, 'background:rgba(255,255,255,.32)', 'srSbTrack', false,
      function () {
        /* 二十一批补可见性：rack 行视图宿主（非 sr 前缀官方件）常驻槽内且常态 display:none——
           仅「非 mod 层」会把它当骨架期已就绪（同 badge 层被骗问题家族），加 offsetWidth>0 */
        var c = el.srGridHost && el.srGridHost.firstElementChild;
        while (c) { if (!/^sr/i.test(c.id || '') && (c.offsetWidth || 0) > 0) return true; c = c.nextElementSibling; }
        return false;
      });
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
    /* 排序钮对（srSortBtn/srFoodSort）开合与选键接线已收敛 bind 头部 makeSortMenu 实例
       （menuSort/menuFoot，v13.5-v13.8 页脚排序 v1.8.5 起为显示层排序）；方向切换仍在此 */
    el.srDir.onclick = function () { st.dir = -st.dir; render(); };
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
        if (!el.srTagManage) return;
        var t = e.target;
        if (t.closest && t.closest('.sr-pop')) return;
        if (t.closest && (t.closest('#srTagAdd') || t.closest('#srSortBtn') || t.closest('#srStoreAll') || t.closest('#srFoodSort'))) return;
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
    /* v1.8.7：官方页签栏引用同样必须在摘除/替换【前】取（与 officialGrid 同规则）。
       tabs 缺省（BackpackUI/MaterialRack）=null，槽留空（plainbag/bagonly CSS 隐藏整行）。 */
    var officialTabs = null;
    if (sc.tabs) {
      officialTabs = sc.tabs.charAt(0) === '#'
        ? (doc.getElementById(sc.tabs.slice(1)) || null)
        : (doc.querySelector(sc.tabs) || null);
    }
    var host = resolveHost(doc, sc.host);
    if (!host) return false;
    /* 二十一批：官方 rack 行视图宿主同款**替换宿主前**取引用（类选择器在宿主域内解析——
       Trade 页无人机列也有 .rack-view，宿主域=袋列；替换后原宿主子树脱文档就查不到了） */
    var rackEl = null;
    if (sc.rack) {
      rackEl = sc.rack.charAt(0) === '#'
        ? (doc.getElementById(sc.rack.slice(1)) || null)
        : (host.querySelector(sc.rack) || null);
    }
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
    if (PLAIN_KEYS[sceneKey]) rail.className += ' plain'; /* v1.8.4 缺陷#1：首包前的骨架也按 plain 呈现
       （render 才正式 toggle；防 Trade 等机器页在数据到达前闪出非 plain 的搜索/工具行） */
    rail.className += ' sc-' + sceneKey.toLowerCase(); /* 2026-11-02 四轮（作者原则：单页问题单页修）：场景类名——per 页 CSS 隔离锚（如老鼠笼专用高度） */
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
    /* v1.8.7 核心还原：官方页签栏 DOM 原件挂进壳的 #srTabs 槽（取代销毁+建桩）——
       官方页面 JS 按 id/class 渲染页签（getElementById/querySelector 与位置无关，同文档
       照常命中），pin 槽/滚动按钮/active 类/locked 态全部官方原生；A/D 步进（C# 侧
       ContainerTabHotKey→RA_SwitchTabByKey，宽度>0 守卫）与拖物到页签（webui-tabdrop
       命中测试）由此整体复活。必须在 buildStubs **之前**（真节点在文档→页签类桩自愈跳过，
       官方查询命中真件不命中桩）。mount 期页签栏未建（Vue 异步）=null 留空，
       ensureTabsInSlot 每周期补挂。 */
    if (officialTabs) {
      var slotT = rail.querySelector('#srTabs');
      if (slotT) { try { slotT.appendChild(officialTabs); } catch (e) { } }
      bindTabDrag(officialTabs, sceneKey); /* T3 拖拽排序（幂等 __srTabDrag 门） */
    }
    /* 二十一批：rack 行视图宿主入壳（.sr-gridhost 内与官方格并排；官方 TAB_SWITCH 后
       renderCartView/applyLeftView 直切两件 inline display，壳只提供位置）。必须先于
       buildStubs——真节点在文档，rack 类桩自愈跳过（stubs 列表已同步摘除）。 */
    if (rackEl) {
      var ghR = rail.querySelector('.sr-gridhost');
      if (ghR) { try { ghR.appendChild(rackEl); } catch (e) { } }
      RACKEL[sceneKey] = rackEl;
    }
    /* 2026-11-02 七轮（官方模板对照定案，治老鼠笼反复）：官方机器页布局契约=三面板 flex
       拉伸**等高**（Cooking/RatCage 模板同构，无特例——差异只在运行时兄弟面板数据高度）。
       壳统一回归该契约：壳高=max(778, 兄弟面板最高自然高)——
       · 兄弟 ≤778：壳 778=高度驱动方，外框随壳 −38（整界面底边 x+10→x+9）+外框
         margin-top −38px 钉回顶边（六轮方案保留）；
       · 兄弟 >778：壳=兄弟高（官方等高拉伸原貌，外框不动、无 margin）。
       挂载竞态（兄弟面板晚长高、量矮了不再跟=六轮实锤 427/782）由槽位 ResizeObserver
       即时自愈 + render 尾重抹（见 plainSlotSync/armSlotObserver）。 */
    if (PLAIN_KEYS[sceneKey] && !bpPanel) {
      try { plainSlotSync(wrap, rail); armSlotObserver(wrap); } catch (e) { }
    }
    buildStubs(doc, sc, wrap); /* T9 桩节点（SCENES.stubs 声明驱动；宿主已移除后建，真节点不在=无 id 重复。rack：真节点已 reparent 在文档 → 自愈不建桩） */
    bind(doc, rail); /* bind 内部 el={} 重建引用表并挂 rail（rail.js 同款；T9 重绑路复用同一函数，__srBound 门防监听器重复挂） */
    /* v1.8.2 核心：官方物品区整体搬进壳 body（appendChild 移动节点=id/官方监听/官方
       渲染通道全保留；官方页按 id 查询照常命中，webui-bag 的 _cachedContainer 仅拖拽期
       缓存且松手即清）。网格模式壳不画任何格子——物品面=官方原版格，拖拽进机器槽/
       左键详情/右键快转全部原生。rack：右段=官方 .bag-panel.is-storage（rackTitle+
       rsw 机器人开关+panelB 汇总行面板）整件进 srGridHost——行拖拽/右键取1/锁定/
       取出最多/落点预览全原生，rackOpen 切柜后官方重渲染写进同一容器。 */
    if (officialGrid && !bpPanel && el.srGridHost) {
      try {
        /* 二十一批：rack 宿主已在槽时官方格插其前——DOM 序恒 [grid, rack]（syncRailWidth
           挑首个可见件已双保险；width-floor/官方 sizeLock 等按首子=格的旧约定同样成立） */
        if (rackEl && rackEl.parentNode === el.srGridHost) el.srGridHost.insertBefore(officialGrid, rackEl);
        else el.srGridHost.appendChild(officialGrid);
      } catch (e) { }
      unlockGridSize(); /* v1.8.4c：入壳首清官方 sizeLock 的 margin 填充（后续由观察器跟清） */
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
    applyScene(sceneKey); /* v1.8.4 缺陷#1/#3 终修：v1.8.3 起此处被误插 `if (mountedOk) return` ——
       装配替换宿主后 mountedOk 恒真 → mount 每次都在做完替换后早退：applyScene/render 被跳过，
       侧栏停在**骨架态**（标题空/页签栏全空/plain 未应用=作者截到的「开发期页面」），只能等
       下一包 setData 才自愈；Trade 浏览期物品零变化无推送 → 骨架卡死（无人机交易页签栏全空）。
       噪声快速路径只属于 ensureMountedFrame（mount 的前置检查），mount 尾部不留任何早退。 */
    TM_KEY = ''; /* 全新弹层 DOM：管理弹层结构必重建（同 PIN_KEY 道理，key 短路只对同一棵节点有效） */
    if (store.ctx) render(); /* 数据先到、装配后到：补一次渲染（Vue 重建宿主复活重装配后立即恢复完整渲染，不再等下一包） */
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
     class 与 trade 同名 .bag-tabs-scroll，必须 bag 先于 trade 判）；rail 侧族别由
     SCENES.family 静态表给出（同一取证表产物，与 detectC 五族一一对应：
     bag/bag、tt/tt、trade/trade、cart/cart、cart0/cart0、backpack·rack=无页签族），
     页签数组由回包消息缓存（extractTabs，tagfilter st.tabs 同语义）。
     v1.8.7：官方页签栏 DOM 原件已 reparent 进壳（SCENES.tabs 指路，不再是「替换即销毁」）
     ——forgeSwitchTo 仅服务 cmdOut 的 BackpackUI Bug3 重刷路（v1.8.9 起；原 ▾ 菜单跳柜
     调用者已退役，页签点击=官方原生，不经此路）。
     各族签名照附录 A 照抄：bag=SWITCH_BAG{ownerId:数字}、trade=SWITCH_BAG{ownerId:字符串}
     （官方=String(tab.owner) attr 直读——rail 直知 ownerId 同型直给）、
     tt=TAB_SWITCH{tab:数组下标+2}（0=背包/1=抽屉在栏外；edge：背包首位→tab:0 显式分支）、
     cart=TAB_SWITCH{tab:下标}（pin 背包占 0）、cart0=TAB_SWITCH{tab:下标}（无 pin）。
     hasActive 字段清单照抄：{bagOwnerId, bagOwnerKey, activeLeftTab, activeTab}。 */
  var TABS = {}; /* sceneKey → extractTabs 归一化页签数组缓存（String|null[]；tt/cart 索引族解 active/forge 对位用） */
  var RACKEL = {}; /* 二十一批：sceneKey → 官方 rack 行视图宿主（mount 解析存档；ensureRackInSlot 对账入槽）。材料架页签激活时官方藏格显行视图——宿主必须随官方格一起进壳，否则「格被藏+行视图不可见」=内容区整片黑 */

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
     v1.8.9 起唯一调用者=cmdOut 的 BackpackUI Bug3 重刷路（try/catch 忽略返回值）；
     返回 true=已发（渲染交回包确认）；false=无官方链（backpack/rack 无页签族/缓存未到 bail）。 */
  function forgeSwitchTo(ownerId, key) {
    var k = key || st.scene;
    var f = frameByKey(k);
    if (!f || !f.el || !f.el.isConnected) return false;
    var ev = buildSwitchEvent(k, ownerId);
    if (!ev) return false;
    try { window.postMessage({ type: ev.type, data: ev.data, sourcePageId: f.el.id }, '*'); return true; } catch (e) { return false; }
  }
  /* v1.8.9 退役：切柜统一出口 switchTo（▾ 容器菜单是最后调用者，随链删）——切柜路径
     只剩官方原生页签（点击/A/D），rail 经 followActive 被动跟随；forgeSwitchTo 保留
     （唯一调用者=cmdOut 的 BackpackUI Bug3 重刷路）。 */
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
    scrollActiveTabIntoView(); /* 十二批：切柜回包落点即时回滚（官方重建路由入槽观察器 rAF 覆盖；函数声明提升可前调） */
  }
  /* ---- postMessage 包装链（tagfilter wrapRelay 同构，只读观察恒放行）----
     保留前一引用并在尾部调用=串联：__SLTF__ 先包装则 rail 挂其后、rail 先包装则
     __SLTF__ 挂 rail 后。共存链各自按需消费（rail 只读恒放行）。
     v1.8.7：扣发/伪造拦截层（stepGuard/releasePending/f.pending）整体退役——官方页签栏
     复活后 A/D 步进=官方原生链路，rail 对消息零干预（v1.7.0 tagfilter 的扣发+弹回工程
     一并不再需要；场景视图收窄改由 C# 状态层收口=数组=可见集，步进天然只落可见页签）。 */
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
  /* 只读截读：页签数组入缓存 + active 跟随（followActive 只同步 rail 自身状态，不碰消息）。
     2026-11-01 实机「烹饪页签迟到」：TABS 是页签行（railCtns 的 ∩门）的输入，但变化
     从不触发 render——开页首包渲染在 TabInjector 注入 Repush 之前拿到的是**原生数组**
     （背包+冰箱），注入回包更新 TABS 后无人再渲染 → 食物柜要等下一次 render 触发
     （作者点冰箱切柜 followActive）才冒出来。修：TABS 内容变化且帧=活跃场景 → render。 */
  function relayObserve(f, msg) {
    try {
      var d = msg && msg.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
      var isBag = !!(msg && typeof msg.type === 'string' && msg.type.indexOf('BagMsg') >= 0);
      var hasActive = !!(d && typeof d === 'object' && (d.bagOwnerId != null || d.bagOwnerKey != null || d.activeLeftTab != null || d.activeTab != null
        || d.rackOwnerId != null)); /* rackOwnerId：rackOpen 重绑后的 active 信号（v1.8.2） */
      var t = extractTabs(msg);
      if (t) {
        var prevT = TABS[f.key];
        var changed = !prevT || prevT.length !== t.length || prevT.join('\u0001') !== t.join('\u0001');
        TABS[f.key] = t;
        if (changed && f.key === st.scene && el.rail) render();
      }
      if (!d || typeof d !== 'object') return;
      if (!isBag && !hasActive) return;
      var v = activeOwnerOf(f.key, d);
      if (v == null) return;
      followActive(f.key, v);
    } catch (e) { }
  }
  /* ---- 2026-11-02 七轮：机器页槽位同步（官方等高契约的壳侧实现，全 plain 页统一）----
     壳高=clamp(778, 兄弟面板最高, 816)（行内 important 覆盖 .plain 定高基线）：
       · 兄弟 ≤778：壳 778=驱动方，外框随壳缩 38（整界面底边上收一格）+外框 margin-top
         −38px 钉回顶边（居中容器 H 缩 38、margin −38 恰把顶边从 t+19 拉回 t）；
       · 兄弟 >778：壳跟随兄弟（官方三面板等高拉伸原貌，外框不动、无 margin）——
         老鼠笼实机即此态（鼠笼/电力面板 782）。
     范围纪律（t8 实锤 Trade 反馈跑飞 1381 的教训）：
       · 兄弟量高范围=**壳父级行**（面板真所在；爬 body 子级在 Vue 页会量到全屏容器）；
       · margin 只打「行=页面居中根」的官方形态页（行父级=body，Cooking/RatCage 形态），
         Vue 包裹页（Trade 等）不打=官方原位；
       · 硬钳 816：任何量测异常壳高不可能超过旧设计高度（跑飞结构性不可能）。
     幂等（值未变不写 DOM=ResizeObserver 自限）；挂载/render 尾/槽位 RO 三路调用。 */
  function plainSlotSync(wrap, rail) {
    try {
      if (!wrap || !wrap.parentElement || !rail) return;
      var doc = wrap.ownerDocument;
      var row = wrap.parentElement; /* 面板行：壳与兄弟面板的直接容器 */
      var sibMax = 0;
      for (var i = 0; i < row.children.length; i++) {
        if (row.children[i] === wrap) continue;
        var h = row.children[i].offsetHeight || 0;
        if (h > sibMax) sibMax = h;
      }
      var wantH = Math.max(778, sibMax);
      /* 跑飞钳=**视口高**（与量高同空间）：界面不可能高过视口，防反馈跑飞等价；
         八轮实锤教训：钳数不能拿夹具空间的常数（816）——游戏 webview 带缩放（实测 0.932），
         官方面板 css 高可到 839 > 816，硬钳把壳截短 23css≈半格=左侧底边与右侧错位。 */
      var vhCap = doc.defaultView.innerHeight || 0;
      if (vhCap > 400 && wantH > vhCap) wantH = vhCap;
      var wantHPx = wantH + 'px';
      if (rail.style.height !== wantHPx) {
        rail.style.setProperty('height', wantHPx, 'important');
        rail.style.setProperty('max-height', 'none', 'important');
      }
      /* margin 目标：行外层=body 直接子级（官方形态页：行即页面居中根）才打；Vue 包裹页不打 */
      var sys = row;
      while (sys && sys.parentElement && sys.parentElement !== doc.body) sys = sys.parentElement;
      if (sys && sys !== doc.body) {
        var canPin = sys === row; /* 行自身=居中根（Cooking/RatCage 形态） */
        var wantMT = (canPin && sibMax <= 778) ? '-38px' : '';
        if (sys.style.marginTop !== wantMT) sys.style.marginTop = wantMT;
      }
    } catch (e) { }
  }
  /* 槽位观察器（per-frame 单挂，__srSlotRO 门）：wrap 尺寸变化=兄弟面板长高/回缩经 flex
     拉伸传导 → 重同步。回调内只排队下一拍（t8 实锤：回调内同步强制回流会触发
     "ResizeObserver loop" 交付循环告警——offsetHeight 量高移出交付周期即消）。 */
  function armSlotObserver(wrap) {
    try {
      if (!wrap || wrap.__srSlotRO) return;
      var rail = wrap.querySelector('.sr-rail');
      if (!rail) return;
      var V = wrap.ownerDocument.defaultView.ResizeObserver;
      if (!V) return;
      wrap.__srSlotRO = new V(function () {
        setTimeout(function () { plainSlotSync(wrap, rail); }, 0);
      });
      wrap.__srSlotRO.observe(wrap);
    } catch (e) { }
  }

  /* ---- stepGuard/releasePending/pending（2026-11-01/02 作者#1 两轮「步进对齐显示序」
     的扣发+伪造拦截层）已随 v1.8.7 官方页签栏还原整体退役：A/D 步进走官方原生链
     （ContainerTabHotKey→RA_SwitchTabByKey→官方渲染），可见性/顺序在 C# 状态层收口
     （数组=可见集、pinOrder 重排=显示序），步进落点天然=页签行邻居，无需任何拦截。 ---- */

  /* ================= v1.8.9 Browser 视图下拉退役（作者令：「全部柜子按钮有时能看到有时
     看不到，很奇怪……没什么用，删了」） =================
     v1.8.7 T4 的标签筛选下拉（srFSel/srFSelPop、setFilter→cerail_filter.json→C# 收窄）整链
     下线：显隐随 Browser 视图/页签场景跳变=观感玄学，切柜能力 ▾ 容器菜单已全覆盖。
     旧 srp_filter_<scene> localStorage 键与 C# cerail_filter.json 同批退役（无消费方）。 */

  /* ================= v1.8.7 T3 官方页签拖拽排序（HTML5 dnd 挂官方页签元素） =================
     官方页签栏还原后的「我们的设计」之一：拖页签改序 → cmd pinOrder → C# 重排官方数组
     +Repush → 官方渲染按新序重建（A/D 步进=数组邻居，天然跟随新序——零拦截）。
     手法照 v1.8.2 时代 bindPinDrag（.sr-pin 已验证的 dnd 路线：dragstart 阈值不吞 click、
     落点半宽前后指示），身份按族取（附录 A 对照）：
       Cooking=el._ownerId（官方 createTabEl 写入）；DroneHub/Trade=el[data-owner]；
       RatCage/Brew/Dye=滚动区位序→TABS 缓存（bag 族 pin 在栏外，scroll[i]=TABS[i+1]）；
       tt=.cabinet-tab 位序→TABS（背包/抽屉在栏外，offset 0）；
       cart=scroll 位序→TABS[i+1]（pin 占 0）；cart0=容器平铺位序→TABS[i]。
     纪律：锁定页签不可拖；身份解析不出=放弃本次拖拽（宁可不排也不错排）；drop 时 DOM
     已重建（官方重渲染竞态）=按现 DOM 现算序，被拖柜已不在=丢弃；pin/背包位永不参与
     （不在滚动集内天然排除；tt 的 #tab-drawer 无 .cabinet-tab 类同排除）。
     官方元素只加 draggable 属性与本模块类名（纯叠加），官方 click/active/tabdrop 零触碰。 */
  var TAB_DRAG = { key: null, owner: null }; /* 拖拽中：目标场景键 + 被拖 ownerId（字符串口径） */

  function tabDragCfg(key) {
    var sc = SCENES[key];
    if (!sc || !sc.tabs) return null;
    var f = sc.family;
    if (f === 'bag') {
      return {
        item: '.bag-tab',
        /* Cooking 官方写 _ownerId；DroneHub 官方写 data-owner——元素现况优先；
           RatCage/Brew/Dye 无身份属性→位序对 TABS（pin 在栏外 offset 1）。解析不出返 null 丢弃 */
        idOf: function (el, i) {
          if (el._ownerId != null) return String(el._ownerId);
          if (el.getAttribute && el.getAttribute('data-owner') != null) return el.getAttribute('data-owner');
          var t = TABS[key];
          return t ? (t[i + 1] != null ? String(t[i + 1]) : null) : null;
        }
      };
    }
    if (f === 'trade') {
      return {
        item: '.bag-tab',
        idOf: function (el) { var v = el.getAttribute && el.getAttribute('data-owner'); return v != null ? String(v) : null; }
      };
    }
    if (f === 'tt') {
      return {
        item: '.cabinet-tab',
        idOf: function (el, i) { var t = TABS[key]; return t ? (t[i] != null ? String(t[i]) : null) : null; }
      };
    }
    if (f === 'cart') {
      return {
        item: '.left-tab',
        idOf: function (el, i) { var t = TABS[key]; return t ? (t[i + 1] != null ? String(t[i + 1]) : null) : null; }
      };
    }
    if (f === 'cart0') {
      return {
        item: '.left-tab',
        idOf: function (el, i) { var t = TABS[key]; return t ? (t[i] != null ? String(t[i]) : null) : null; }
      };
    }
    return null;
  }

  /* 官方页签重建后补标 draggable（锁定页签除外）。观察器挂页签行（childList subtree：
     官方 renderTabs 每次整建 scroll 子节点=必触发）——标记幂等。 */
  function markTabDrag(row, cfg) {
    if (!row || !cfg) return;
    var items = row.querySelectorAll(cfg.item);
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      var lock = (el.classList && el.classList.contains('locked')) || el.disabled === true;
      if (lock) { if (el.getAttribute('draggable') === 'true') el.removeAttribute('draggable'); continue; }
      if (el.getAttribute('draggable') !== 'true') el.setAttribute('draggable', 'true');
    }
  }

  function bindTabDrag(row, key) {
    if (!row || row.__srTabDrag) return;
    var cfg = tabDragCfg(key);
    if (!cfg) return;
    row.__srTabDrag = key;
    markTabDrag(row, cfg);
    try {
      var V = row.ownerDocument.defaultView.MutationObserver;
      row.__srTabMO = new V(function () { markTabDrag(row, cfg); });
      row.__srTabMO.observe(row, { childList: true, subtree: true });
    } catch (e) { }
    row.addEventListener('dragstart', function (e) {
      var el = e.target.closest && e.target.closest(cfg.item);
      if (!el || (el.classList && el.classList.contains('locked')) || el.disabled === true) { TAB_DRAG.key = null; TAB_DRAG.owner = null; return; }
      var items = row.querySelectorAll(cfg.item), i = Array.prototype.indexOf.call(items, el);
      var owner = cfg.idOf(el, i);
      if (owner == null) { e.preventDefault(); return; } /* 身份解析不出：宁可不拖也不错拖 */
      TAB_DRAG.key = key;
      TAB_DRAG.owner = owner;
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', owner); } catch (x) { }
      el.classList.add('sr-dragging');
    });
    row.addEventListener('dragend', function () {
      TAB_DRAG.key = null; TAB_DRAG.owner = null;
      row.querySelectorAll('.sr-dragging,.sr-drop-before,.sr-drop-after').forEach(function (x) {
        x.classList.remove('sr-dragging', 'sr-drop-before', 'sr-drop-after');
      });
    });
    row.addEventListener('dragover', function (e) {
      if (TAB_DRAG.key !== key || TAB_DRAG.owner == null) return;
      e.preventDefault();
      var el = e.target.closest && e.target.closest(cfg.item);
      row.querySelectorAll('.sr-drop-before,.sr-drop-after').forEach(function (x) { x.classList.remove('sr-drop-before', 'sr-drop-after'); });
      if (!el) return;
      var items = row.querySelectorAll(cfg.item), i = Array.prototype.indexOf.call(items, el);
      if (cfg.idOf(el, i) === TAB_DRAG.owner) return;
      var r = el.getBoundingClientRect();
      el.classList.add((e.clientX - r.left) < r.width / 2 ? 'sr-drop-before' : 'sr-drop-after');
    });
    row.addEventListener('drop', function (e) {
      if (TAB_DRAG.key !== key || TAB_DRAG.owner == null) return;
      e.preventDefault();
      var el = e.target.closest && e.target.closest(cfg.item);
      if (!el) return;
      /* 按现 DOM 现算全序（官方重渲染竞态下身份仍真）；被拖柜已不在=丢弃 */
      var items = row.querySelectorAll(cfg.item), ids = [];
      for (var i = 0; i < items.length; i++) {
        var id = cfg.idOf(items[i], i);
        if (id == null) return;
        ids.push(id);
      }
      var from = ids.indexOf(TAB_DRAG.owner);
      if (from < 0) return;
      var ti = Array.prototype.indexOf.call(items, el);
      var target = cfg.idOf(el, ti);
      var to = ids.indexOf(target);
      if (to < 0 || to === from) return;
      var r = el.getBoundingClientRect();
      var after = (e.clientX - r.left) >= r.width / 2;
      ids.splice(from, 1);
      ids.splice(ids.indexOf(target) + (after ? 1 : 0), 0, TAB_DRAG.owner);
      var order = [];
      for (var q = 0; q < ids.length; q++) { var n = parseInt(ids[q], 10); if (!isNaN(n)) order.push(n); }
      if (order.length) cmdOut('pinOrder', { key: key, order: order });
    });
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
    /* v1.8.8 第五轮（与壳同案=自绘恒显指示轨）：原生滚动条透明占位（槽宽恒 8px + gutter
       stable + content-box+padding-right:12px「滚动槽在官方宽之外」口径不变），指示轨几何/
       颜色由 sbMakeIndicator 在 nbMount 里自绘（srnSbTrack，thumb 与壳侧同色=白 32%） */
    + '.grid-container{max-height:560px;overflow-y:scroll;scrollbar-gutter:stable;box-sizing:content-box;padding-right:12px;overscroll-behavior:contain}'
    + '.grid-container::-webkit-scrollbar{width:8px}'
    + '.grid-container::-webkit-scrollbar-track{background:transparent}'
    + '.grid-container::-webkit-scrollbar-thumb{background:transparent}'
    + '.bag-panel.is-storage .weight-section{display:none !important}';
  function ensureNativeBp(f) {
    var doc = f.doc;
    if (!doc || !doc.head) return;
    /* v1.8.12 native 地板退役（作者实报「背包/柜子界面右侧多一块黑色空白、交易/烹饪页没有」）：
       官方 .grid-container inline 宽=cols*56 整（BackpackUI fixture gridContainerStyle 实证：
       CELL=56、容器零内边距）——早版「+18=内边距 9×2」是 rail 机器页几何（webui-bag
       cfg.padding 9）误植到 native 页；min-width=UNI_W*56+18 对 12 列恒超宽 18px、窄袋（背包/
       后备箱页签/材料架等未直写容器）更多 → 格床右侧露出 --grid-frame-bg 暗底=黑块。且 native
       页各面板独占一袋、无 rail 切页签缩放场景（A 侧多页签官方自有 aSlotStyle 按 maxCols 垫宽），
       地板在此零收益=整段撤除，回 v1.8.10 纯官方宽（rail 页地板为自标定实测宽、无此病，不动）。
       data-uw 对账保留：旧版已注入 '690' 的活页一次重写清除（幂等零写）。 */
    var want = NATIVE_BP_CSS;
    var cur = doc.getElementById('srNativeBp');
    if (cur) {
      if ((cur.getAttribute('data-uw') || '') !== '0') { cur.setAttribute('data-uw', '0'); cur.textContent = want; }
      return;
    }
    var st = doc.createElement('style');
    st.id = 'srNativeBp';
    st.setAttribute('data-cer-native', '1');
    st.setAttribute('data-uw', '0');
    st.textContent = want;
    doc.head.appendChild(st);
  }

  /* ================= v1.8.4 原生背包页 mod 按钮（UI-SPEC §0a-4；v1.8.6 扩柜侧排序） =================
     v13.4 转原生时排序/入库随 rail 离开本页 → 作者缺陷单补回，原型 v13.9 定稿：
     面板官方 .toolbar 行**行首左缘**（margin-right:auto 钉左缘，官方丢弃/整理保持右缘），
     基类=官方 .action-btn 同尺寸观感。⇅排序▾=FSORTS 7 项弹层（挂触发钮内 absolute 上弹）→
     DISP 显示层排序（v1.8.5 ProjectCook 机制：纯模型 x/y 写+官方自渲染，真实摆放零触碰）
     +属性排序时格子右上角数值角标（makeBadgeLayer 实例，MutationObserver 跟随官方重渲染）；
     📦一键入库=§4.6 确认窗 → storeAll{order}（settleXfer 差量 toast 经 toast() 兜底路由
     落本页 #srnToast）——**仅袋侧**（入库语义只对背包成立）。
     v1.8.6 双侧装配（作者令「排序按钮复制到所有储物柜的取用与整理物资界面」）：
       袋侧=B键单背包/整理物资 A 面板（排序+入库，id 沿用不变）；
       柜侧=取用单柜 A 面板/整理物资 B 面板 .is-storage（**仅排序**，id 后缀 2）——
       双面板同屏两侧各自独立排序（DISP/DISP_CT 双实例），互不顶替。
     装配判据 v1.8.6 改**页面 Vue 真源**（setupState.bagA/bagB.ownerId——契约白名单柜=取用/
     柜侧，背包实体/其余=袋侧），兜底链=DOM chips（取用柜 canTag 挂 chips）→ ctx.bpBag
     （旧契约快照，仅缺前两者时）→ 保守袋侧。旧判据 ctx.bpBag 是上一包快照：开取用柜瞬间
     滞后为 true → 袋侧按钮对先装后摘=「左下角排序钮闪一下就没了」实锤根因（v1.8.4 起固有，
     非尸体代码）；真源判当场可判（官方 ready 门保证面板出现时 ownerId 已绑定），竞态根治。
     材料架页（行组件无网格，作者拍板）不在此列。
     官方元素零 addEventListener（监听只在 mod 自有钮/弹层/文档级收弹层含 mod 钮豁免=v9
     同款）；.srn-pop[hidden] 必须 !important 压 ID display（v13.9 实测常驻黑条教训）。 */
  var NB = { doc: null, fsort: 'official' };   /* 袋侧页面态（B键/整理物资 A 面板） */
  var NB2 = { doc: null, fsort: 'official' };  /* 柜侧页面态（v1.8.6：取用 A / 整理物资 B） */
  var NB_CSS = ''
    + '.srn-sort,.srn-store{position:relative;flex:0 0 auto}'
    + '.srn-sort{background:#1a1a1e !important;border-color:rgba(240,176,60,.45) !important;color:#f0b03c !important}'
    + '.srn-sort:hover{color:#ffe1a0 !important;border-color:rgba(240,176,60,.68) !important}'
    + '.srn-sort.srn-on{color:#ffe1a0 !important;border-color:rgba(240,176,60,.85) !important;background:rgba(240,176,60,.14) !important}'
    + '.srn-caret{font-size:10px;color:#c9932f;margin-left:1px}'
    + '.srn-store{border-color:rgba(240,176,60,.5) !important;background:rgba(240,176,60,.14) !important;color:#ffe1a0 !important;margin-right:auto !important}'
    + '.srn-store:hover{background:rgba(240,176,60,.26) !important}'
    + '.srn-sort.srn-only{margin-right:auto !important}' /* v1.8.6 柜侧单钮自钉左缘（无入库钮吃 auto 余空间） */
    + '.srn-sort span,.srn-store span{display:inline-block;white-space:nowrap;flex:0 0 auto}'
    + '.srn-pop{position:absolute;bottom:calc(100% + 8px);z-index:30;border-radius:10px;background:rgba(10,10,12,.94);box-shadow:0 8px 24px rgba(0,0,0,.5)}'
    + '.srn-pop[hidden]{display:none !important}'
    + '.srn-sortpop{left:0;width:128px;border:1px solid rgba(255,255,255,.12);padding:6px;display:flex;flex-direction:column;gap:5px}'
    + '.srn-sortpop .srn-opt{display:flex;align-items:center;gap:7px;width:100%;min-height:26px;padding:0 10px;border-radius:7px;border:1px solid #3d3d44;background:#26262b;color:#e8e8e8;font-size:12px;text-align:left;font-family:inherit;cursor:pointer}'
    + '.srn-sortpop .srn-opt:hover{color:#fff;border-color:rgba(255,255,255,.30)}'
    + '.srn-sortpop .srn-opt.active{color:#f0b03c}'
    + '.srn-sortpop .f-ico{flex:0 0 auto;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-size:12.5px}'
    + '.srn-sortpop .srn-tick{margin-left:auto;font-size:11px}'
    + '#srnConfirm{left:0;width:300px;border:1px solid rgba(240,176,60,.4);padding:10px 12px}'
    + '#srnConfirm .srn-cf-head{font-size:13px;color:#ffe1a0;margin-bottom:6px}'
    + '#srnConfirm .srn-cf-body{font-size:12px;color:#cfc8bc;line-height:1.5;margin-bottom:10px}'
    + '#srnConfirm .srn-cf-foot{display:flex;gap:8px;justify-content:flex-end}'
    + '#srnConfirm button{padding:5px 12px;border-radius:7px;font-size:12px;font-family:inherit;cursor:pointer}'
    + '#srnConfirm .srn-cf-cancel{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#d8d0c2}'
    + '#srnConfirm .srn-cf-go{border:1px solid rgba(240,176,60,.5);background:rgba(240,176,60,.14);color:#ffe1a0}'
    + '.srn-badges{position:absolute;inset:0;pointer-events:none;z-index:50}'
    + '.srn-badges i{position:absolute;transform:translateX(-100%);min-width:10px;padding:0 2px;border-radius:2px;background:rgba(0,0,0,.8);font-size:9.5px;line-height:12px;text-align:center;font-family:Consolas,monospace;font-style:normal;white-space:nowrap}'
    + '#srnToast{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:99;padding:7px 14px;border-radius:9px;background:rgba(20,24,36,.94);border:1px solid rgba(240,176,60,.5);color:#ffe1a0;font-size:12.5px}'
    + '#srnToast[hidden]{display:none !important}';
  /* 契约白名单柜判定（v1.8.6 装配判据核心）：命中=储物柜（取用/柜侧装配对象）。不能走
     ctnById——它对背包有特判直返 bagCtn（store.bag 先行剔除；背包实体 id 空间不同实锤，
     v1.8.5④ BpBagDyn 同款教训）。 */
  function nbIsCtnOwner(id) {
    if (id == null || !(id > 0)) return false;
    if (store.bag && String(id) === String(store.bag)) return false;
    for (var i = 0; i < store.ctn.length; i++) if (String(store.ctn[i].id) === String(id)) return true;
    return false;
  }
  /* 页面侧容器 ownerId 现取（Vue 真源）：side='ctn' 取 dual?bagB:bagA（取用单柜也在 bagA
     槽）；side='bag' 恒 bagA。无 Vue/未就绪返回 0。 */
  function nbVueBagOwner(doc, side) {
    var su = nbVueSu(doc);
    if (!su) return 0;
    var dual = !!refVal(su.isDualBag);
    var bag = (side === 'ctn' && dual) ? su.bagB : su.bagA;
    return bag ? (bag.ownerId || 0) : 0;
  }
  /* v1.8.6 双侧面板解析（取代旧 nbPanel 单面板判定），返回 {bag,ctn}；无面板返回 null：
     dual（.is-storage 在场）→ bag=A 面板、ctn=B 面板（白名单门——行级安全同机器页 railCtns）；
     单面板 → A 侧身份判据链：Vue ownerId（白名单柜=取用；背包实体/后备箱等其余=袋侧）
       → DOM chips（取用柜 canTag 挂 chips，B键背包无——harness 夹具路）
       → ctx.bpBag===false（旧契约兜底）→ 保守袋侧。 */
  function nbPanels(doc) {
    var panels = doc.querySelectorAll('.bag-panel:not(.is-storage)');
    if (!panels.length) return null;
    var dual = !!doc.querySelector('.bag-panel.is-storage');
    var out = { bag: null, ctn: null };
    if (dual) {
      out.bag = panels[0];
      var bp = doc.querySelector('.bag-panel.is-storage');
      out.ctn = (bp && bp.querySelector('.toolbar') && nbIsCtnOwner(nbVueBagOwner(doc, 'ctn'))) ? bp : null;
      return out;
    }
    var aOwner = nbVueBagOwner(doc, 'bag');
    if (aOwner > 0) {
      if (nbIsCtnOwner(aOwner)) out.ctn = panels[0].querySelector('.toolbar') ? panels[0] : null;
      else out.bag = panels[0];
      return out;
    }
    if (panels[0].querySelector('.header .tag-chips')) { out.ctn = panels[0].querySelector('.toolbar') ? panels[0] : null; return out; }
    if (store.ctx && store.ctx.bpBag === false) { out.ctn = panels[0].querySelector('.toolbar') ? panels[0] : null; return out; }
    out.bag = panels[0];
    return out;
  }
  function nbSidePanel(doc, side) { /* 角标层宿主现解析（nbBadgesCore/Core2 host 用） */
    if (!doc) return null;
    var pp = nbPanels(doc);
    return pp ? (side === 'ctn' ? pp.ctn : pp.bag) : null;
  }
  function nbCtnOwner() { /* 柜侧当前容器 owner（菜单 owner/角标 spec 用）：Vue 现取，缺 Vue 回退上一应用值 */
    var v = NB2.doc ? nbVueBagOwner(NB2.doc, 'ctn') : 0;
    return v || DISP_CT.owner || 0;
  }
  function nbStripSide(doc, sfx, withStore) { /* 摘单侧钮+角标（形态翻转=面板换边即摘，另一侧不受连坐） */
    if (!doc) return;
    var ids = ['srnSortBtn' + sfx, 'srnBadges' + sfx];
    if (withStore) ids.push('srnStoreBtn');
    for (var i = 0; i < ids.length; i++) {
      var n = doc.getElementById(ids[i]);
      if (n && n.parentNode) n.parentNode.removeChild(n);
    }
  }
  function nbStrip(doc) { /* 形态翻转/离页全摘（两侧）；style/toast 留着无害 */
    if (!doc) return;
    nbStripSide(doc, '', true);
    nbStripSide(doc, '2', false);
  }
  /* 单侧装配（v1.8.6 从 nbMount 抽出）：panel 在场=装钮+接线+菜单+角标+观察器；
     不在场=摘本侧（形态翻转即摘）。isBag 决定钮组（袋侧排序+入库 / 柜侧仅排序）与
     DISP 实例（DISP / DISP_CT）、id 后缀（'' / '2'）。 */
  function nbSide(doc, panel, isBag) {
    var S = isBag ? NB : NB2;
    var D = isBag ? DISP : DISP_CT;
    var sfx = isBag ? '' : '2';
    var sortId = 'srnSortBtn' + sfx, lblId = 'srnSortLbl' + sfx, popId = 'srnSortPop' + sfx;
    var row = panel && panel.querySelector('.toolbar'); /* 官方按钮行（一键丢弃/一键整理所在行） */
    if (!row) {
      nbStripSide(doc, sfx, isBag);
      if (isBag) menuNB = null; else menuNB2 = null;
      return;
    }
    if (!doc.getElementById(sortId)) {
      var sortBtn = doc.createElement('button');
      sortBtn.className = 'action-btn srn-sort' + (isBag ? '' : ' srn-only'); /* 柜侧单钮自钉左缘 */
      sortBtn.id = sortId;
      sortBtn.type = 'button';
      sortBtn.title = '排序：官方默认，或按属性排序（格子右上角显示数值）';
      sortBtn.innerHTML = '<span>⇅</span><span id="' + lblId + '">排序</span><span class="srn-caret">▾</span>';
      var pop = doc.createElement('div');
      pop.className = 'srn-pop srn-sortpop';
      pop.id = popId;
      pop.hidden = true;
      sortBtn.appendChild(pop);
      row.insertBefore(sortBtn, row.firstChild); /* 行首左缘；margin-right:auto 钉左缘 */
      if (isBag) { /* 入库仅袋侧；storeBtn margin-right:auto 吃余空间（官方钮保持右缘） */
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
        row.insertBefore(storeBtn, sortBtn.nextSibling);
        storeBtn.onclick = function () { nbOpenConfirm(doc); };
      }
    }
    /* 排序钮 prefab 实例（每 nbMount 周期重建：onclick 重挂幂等，换 doc 换元素集）。
       v1.8.5 显示层排序（ProjectCook 机制）：solo 背包旧路（数据层 sortBy+SWITCH_BAG 重绑）
       对 bag owner 无效且毁真实布局，废弃——走 DISP + applyDispSort 统一入口；
       v1.8.6 cfg.disp 指定实例（柜侧=DISP_CT），menu 引用在 onPick 体内取=点击时新值 */
    var m = makeSortMenu({
      doc: doc, btnId: sortId, lblId: lblId, popId: popId,
      keys: FSORTS, optCls: 'srn-opt', attr: 'data-k', defLbl: '排序', ico: true, tick: true, onCls: 'srn-on',
      pre: function () { /* 开本侧弹层：先收对侧排序弹层+入库确认弹层（同款 v9 教训） */
        var ids = isBag ? ['srnSortPop2', 'srnConfirm'] : ['srnSortPop', 'srnConfirm'];
        for (var i = 0; i < ids.length; i++) { var p = doc.getElementById(ids[i]); if (p) p.hidden = true; }
      },
      getKey: function () { return S.fsort; },
      onPick: function (k) {
        applyDispSort(k, {
          setKey: function (v) { S.fsort = v; },
          owner: isBag ? (function () { return store.bag; }) : nbCtnOwner,
          disp: D,
          menu: isBag ? menuNB : menuNB2,
          after: isBag ? (function () { nbBadges(); }) : (function () { nbBadges2(); })
        });
      }
    });
    if (isBag) menuNB = m; else menuNB2 = m;
    if (m) m.sync();
    if (isBag) { nbBadges(); nbEnsureGridMO(doc, panel, DISP, nbBadges, true); }
    else { nbBadges2(); nbEnsureGridMO(doc, panel, DISP_CT, nbBadges2, false); }
  }
  function nbMount(f) {
    try {
      var doc = f.doc;
      if (!doc || !doc.body) return;
      var pp = nbPanels(doc);
      if (!pp) { nbStrip(doc); if (NB.doc === doc) NB.doc = null; if (NB2.doc === doc) NB2.doc = null; return; } /* 无面板（页面未建树/特殊形态）：全摘 */
      /* 样式/文档级收弹层/toast：双侧共用一份，幂等 */
      if (!doc.getElementById('srnStyle')) {
        var stl = doc.createElement('style');
        stl.id = 'srnStyle';
        stl.setAttribute('data-cer-native', '1');
        stl.textContent = NB_CSS;
        doc.head.appendChild(stl);
      }
      if (!doc.__srnDocBound) {
        doc.__srnDocBound = true;
        doc.addEventListener('click', function (ev) { /* 点空白收弹层；mod 钮内点击豁免（v9 同款教训） */
          if (ev.target && ev.target.closest && ev.target.closest('.srn-sort,.srn-store')) return;
          var closeIds = ['srnSortPop', 'srnSortPop2', 'srnConfirm'];
          for (var i = 0; i < closeIds.length; i++) { var p = doc.getElementById(closeIds[i]); if (p) p.hidden = true; }
        });
      }
      var t = doc.getElementById('srnToast');
      if (!t) {
        t = doc.createElement('div');
        t.id = 'srnToast';
        t.hidden = true;
        doc.body.appendChild(t);
      }
      var docChanged = NB.doc !== doc || NB2.doc !== doc; /* nbMount 每 scan 周期重跑——重置只许发生在进页/换页沿 */
      NB.doc = doc; NB2.doc = doc;
      nbSide(doc, pp.bag, true);   /* 袋侧：排序+入库（取用形态不在场即摘） */
      nbSide(doc, pp.ctn, false);  /* 柜侧：仅排序（v1.8.6） */
      /* v1.8.8 原生页恒显滚动指示轨：官方格（唯一 .grid-container）右缘；fixed 贴视口
         （官方宿主层级不可控，不动官方 position）；工厂按 trackId 幂等，每周期重挂补位。
         thumb 白 32%=与壳侧 srSbTrack 同色（作者令「颜色统一」——v1.8.3 金色调退役） */
      var nbGrid = doc.querySelector('.grid-container');
      if (nbGrid) sbMakeIndicator(doc, doc.body, nbGrid, 'background:rgba(255,255,255,.32)', 'srnSbTrack', true);
      /* 缺陷单#1：切场景重置为默认（§4.11 定版）——**只在进页/换页沿重置**（nbMount 每周期
         重跑，无条件重置会把玩家刚选的排序当场打回；旧实现靠 localStorage 每周期回灌掩盖） */
      var scKey = (store.ctx && store.ctx.page) || '';
      if (docChanged || NB.sceneKey !== scKey) {
        NB.sceneKey = scKey; NB.fsort = 'official';
        NB2.sceneKey = scKey; NB2.fsort = 'official';
        DISP.choice = null; DISP.owner = 0; DISP.model = null; /* v1.8.5：进页沿重置显示层排序态 */
        DISP_CT.choice = null; DISP_CT.owner = 0; DISP_CT.model = null; /* v1.8.6：柜侧同沿重置 */
      }
    } catch (e) { try { console.warn('[CERail] nbMount 失败(兜底不炸扫描)', e && (e.stack || e.message)); } catch (e2) { } }
  }
  /* nbRenderSortPop/nbSortLabel/nbApplyFsort 已收敛：弹层渲染/标签同步=makeSortMenu 实例
     （menuNB，nbMount 创建），应用=applyDispSort 统一入口（选完即关/亮金态/toast 文案原样） */
  function nbOpenConfirm(doc) {
    var p = doc.getElementById('srnSortPop');
    if (p) p.hidden = true;
    var p2 = doc.getElementById('srnSortPop2'); /* v1.8.6：柜侧弹层一并收 */
    if (p2) p2.hidden = true;
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
     重渲染由 nbEnsureGridMO 观察器驱动）。 */
  /* NB 原生页角标=makeBadgeLayer 实例×2（v1.8.5 数值=DISP join 行——Vue 页无 id/无 LogicId
     通道，视觉序↔网格序 zip 在真实态恒成立，行绑定恒定=数值不再错配跳动；未 join/行缺=
     不标宁缺勿错）。v1.8.6 柜侧第二实例（layerId=srnBadges2，样式走 .srn-badges 类同规）。
     保留 nbBadges(doc,panel) 调用形（doc 恒=NB.doc，panel 由 host 闭包现解析）；
     清路=删层节点（nbStripSide/nbMount 形态翻转同语义） */
  var nbBadgesCore = makeBadgeLayer({
    host: function () { var p = nbSidePanel(NB.doc, 'bag'); return p ? p.querySelector('.grid-container') : null; },
    layerId: 'srnBadges', layerCls: 'srn-badges',
    spec: function () { return (NB.fsort === 'official' || !bagArr().length) ? null : { k: NB.fsort, color: FBCOLOR[NB.fsort] || '#f0b03c' }; },
    disp: DISP, dx: -1, dy: 1, skipHide: false, removeOnClear: true
  });
  function nbBadges(doc, panel) { if (NB.doc && NB.doc.body) nbBadgesCore(); }
  var nbBadgesCore2 = makeBadgeLayer({ /* v1.8.6 柜侧：取用单柜 A / 整理物资 B 面板 */
    host: function () { var p = nbSidePanel(NB2.doc, 'ctn'); return p ? p.querySelector('.grid-container') : null; },
    layerId: 'srnBadges2', layerCls: 'srn-badges',
    spec: function () { var o = nbCtnOwner(); return (NB2.fsort === 'official' || !o || !itemsOf(o).length) ? null : { k: NB2.fsort, color: FBCOLOR[NB2.fsort] || '#f0b03c' }; },
    disp: DISP_CT, dx: -1, dy: 1, skipHide: false, removeOnClear: true
  });
  function nbBadges2(doc, panel) { if (NB2.doc && NB2.doc.body) nbBadgesCore2(); }
  /* 2026-11-01 第十三轮：对齐节拍器——500ms 兜底重算角标（有排序时）。观察器只盯格子/
     面板的属性变更，纯 CSS 回流（详情弹窗压扁格区 162²→218×50 又复原）不产生变更 →
     旧角标钉死旧坐标直到下一次格子类变更。节拍器独立于装配循环，任何布局变化 ≤500ms 自愈。
     v1.8.6 双侧各自节拍（柜侧 NB2 同款跟随）。 */
  setInterval(function () {
    try {
      if (NB.doc && NB.doc.body && NB.fsort && NB.fsort !== 'official') nbBadges(NB.doc, null);
      if (NB2.doc && NB2.doc.body && NB2.fsort && NB2.fsort !== 'official') nbBadges2(NB2.doc, null);
    } catch (e) { }
  }, 500);

  function nbEnsureGridMO(doc, panel, D, badgeFn, isBag) {
    var home = D === DISP ? NB : NB2; /* 回调门：本侧 doc 仍当前（离页/换文档即失效） */
    var side = isBag ? 'bag' : 'ctn';
    /* v1.8.6 marker 按侧别：solo↔取用翻转是同面板节点换内容（Vue 原地复用）——共用
       marker 会让后到的一侧 watchGrid 视「已挂」而跳过（袋侧观察器占位后柜侧永远挂不上，
       settling 无人清=角标层恒空，实锤病灶）。 */
    var mk = isBag ? '__srnMO' : '__srnMO2';
    var grid = panel && panel.querySelector('.grid-container');
    watchGrid(grid, mk, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] },
      function () {
        /* v1.8.6 双门：观察器挂在格容器上随节点存活，旧侧观察器不会自然消亡。回调必须
           现验「本侧面板仍在场」：否则翻转后旧袋侧观察器拿 DISP（choice 空）对本面板现柜
           模型 dispRestore，会把柜侧刚写的显示层排序当场回滚（实锤病灶）。 */
        if (home.doc !== doc) return;
        if (!nbSidePanel(doc, side)) return;
        D.settling = false; dispApply(D); badgeFn();
      }); /* v1.8.5：官方重渲染→重抹显示层排序 */
    /* 2026-11-01 第十三轮：详情弹窗开/关在面板/祖先层切 class 驱动格区压扁(162²→218×50)/
       复原——纯 CSS 回流不动格内联样式，格子观察器静默 → 角标钉旧坐标（关弹窗也不回来，
       点别的物品才触发类变更恢复——作者实锤）。补观察面板级 class/style（角标重算只读
       模型，doc 一道门即可）。 */
    var host = panel && panel.parentElement ? panel.parentElement : panel;
    watchGrid(host, mk, { attributes: true, attributeFilter: ['style', 'class'], subtree: false },
      function () { if (home.doc === doc) badgeFn(); });
  }
  function nbRefresh() { /* setData 后跟随：角标值随新契约重算（网格未变也不漏）——双侧 */
    if (NB.doc && NB.doc.body) nbBadges(NB.doc, null);
    if (NB2.doc && NB2.doc.body) nbBadges2(NB2.doc, null);
  }
  /* v1.8.7：官方页签栏进槽兜底——mount 期页签栏未建（Vue 异步渲染/官方晚建）或被官方
     重建到文档别处时，把真件搬进 #srTabs 槽（槽内已有匹配件=幂等早退）。挂在
     ensureMountedFrame 的「在位」快速路径上：rail 装配不变量不动，只补页签件。 */
  /* ---- v1.8.9 十二批：活动页签滚回可见区（作者 2026-11-04 缺陷单「A/D 移到后面当前
     选择的柜子跑出页签栏之外」）----
     根因：官方页签链零 scroll-into-view——renderBagTabs 每次都 innerHTML 整体重建滚动
     容器内容（浏览器钳回 scrollLeft=0，手动滚过的位置一并丢），滚动唯一通道=手动
     < / > 按钮 scrollBy ±step；原生场景页签=背包+冰箱一两个不溢出从未暴露，mod 注入
     全柜后溢出常态化 → A/D 切到屏外页签无人回滚。修：①官方页签栏入槽即布
     MutationObserver（childList 子树，iframe 自窗构造器——观察器不跨文档），官方重建
     → rAF 合帧回滚一次（burst 突变只滚一次）；②followActive 渲染后即时回滚（直发路）。
     回滚只写官方容器 scrollLeft/scrollTop（active 页签矩形差，已可见=零写入幂等
     零抖动——§4.10 同款纪律），零官方监听触碰（§0 红线）。容器判定=slot 内向上走、
     **实际溢出即修**（官方 .bag-tabs-scroll/.left-tabs-scroll 是 overflow-x:hidden
     的程序滚动容器，按 auto/scroll 判会漏）；横向 bag/trade/cart 与纵向 tt 竖列同路。
     钉住页签（背包位）在滚动容器外=走不到可滚祖先，天然空操作。 */
  var TABSCROLL = { slot: null, obs: null, raf: 0 };
  function tabScrollUnarm() {
    try { if (TABSCROLL.obs) { TABSCROLL.obs.disconnect(); } } catch (e) { }
    if (TABSCROLL.raf) { try { TABSCROLL.raf.win.cancelAnimationFrame(TABSCROLL.raf.id); } catch (e) { } }
    TABSCROLL.obs = null; TABSCROLL.raf = 0; TABSCROLL.slot = null;
  }
  function scrollActiveTabIntoView(slot) {
    try {
      slot = slot || el.srTabs;
      if (!slot) return;
      var act = slot.querySelector('.bag-tab.active,.left-tab.active,.cabinet-tab.active');
      if (!act) return;
      var n = act.parentElement;
      while (n && n !== slot) {
        if (n.scrollWidth > n.clientWidth + 1) {
          var cr = n.getBoundingClientRect(), tr = act.getBoundingClientRect();
          if (tr.left < cr.left + 1) n.scrollLeft -= (cr.left - tr.left) + 4;
          else if (tr.right > cr.right - 1) n.scrollLeft += (tr.right - cr.right) + 4;
        }
        if (n.scrollHeight > n.clientHeight + 1) {
          var cv = n.getBoundingClientRect(), tv = act.getBoundingClientRect();
          if (tv.top < cv.top + 1) n.scrollTop -= (cv.top - tv.top) + 4;
          else if (tv.bottom > cv.bottom - 1) n.scrollTop += (tv.bottom - cv.bottom) + 4;
        }
        n = n.parentElement;
      }
    } catch (e) { }
  }
  function armTabScrollFollow(slot) {
    try {
      if (TABSCROLL.slot === slot && TABSCROLL.obs) { scrollActiveTabIntoView(slot); return; }
      tabScrollUnarm();
      TABSCROLL.slot = slot;
      var V = slot.ownerDocument.defaultView;
      TABSCROLL.obs = new V.MutationObserver(function () {
        if (TABSCROLL.raf) return; /* rAF 单飞：官方整表 innerHTML=一串突变，合帧只滚一次 */
        TABSCROLL.raf = { win: V, id: V.requestAnimationFrame(function () {
          TABSCROLL.raf = 0;
          scrollActiveTabIntoView(TABSCROLL.slot);
        }) };
      });
      TABSCROLL.obs.observe(slot, { childList: true, subtree: true });
      scrollActiveTabIntoView(slot);
    } catch (e) { }
  }
  function ensureTabsInSlot(f) {
    try {
      var sc = SCENES[f.key], doc = f.doc;
      if (!sc || !sc.tabs || !doc) return;
      var slot = doc.getElementById('srTabs');
      if (!slot) return;
      armTabScrollFollow(slot); /* 十二批：官方重建→rAF 回滚活动页签（真件在槽的早退路同样要布防） */
      if (slot.querySelector(sc.tabs)) return; /* 真件已在槽内（#bagTabs/.left-tabs/.bag-tabs 均容器内可查） */
      var t = sc.tabs.charAt(0) === '#'
        ? doc.getElementById(sc.tabs.slice(1))
        : doc.querySelector(sc.tabs);
      if (t && t !== slot) { slot.appendChild(t); bindTabDrag(t, f.key); scrollActiveTabIntoView(slot); }
    } catch (e) { }
  }
  /* 二十一批：rack 行视图宿主入槽对账（ensureTabsInSlot 同语义，无拖拽/滚动接线）。引用死
     （iframe 重载/整树重建）时类选择器不盲查（Trade 双 .rack-view 会误取无人机列件）——
     交给宿主复活→mount 的宿主域重解析；id 形态无歧义可直查补挂。 */
  function ensureRackInSlot(f) {
    try {
      var sc = SCENES[f.key], doc = f.doc;
      if (!sc || !sc.rack || !doc) return;
      var slot = doc.getElementById('srGridHost');
      if (!slot) return;
      var el = RACKEL[f.key];
      if (el && el.isConnected) {
        if (el.closest && el.closest('#srGridHost') === slot) return; /* 已在槽 */
        slot.appendChild(el); /* 被官方挪出槽（罕见）：搬回 */
        return;
      }
      if (sc.rack.charAt(0) !== '#') return; /* 类选择器等 remount 宿主域重解析 */
      var t = doc.getElementById(sc.rack.slice(1));
      if (t && !(t.closest && t.closest('#srp'))) { slot.appendChild(t); RACKEL[f.key] = t; }
    } catch (e) { }
  }
  /* ================= 燃油发电机 bagtabs 装配（spec 2026-11-06-fuelgen-cabinet-tabs） =================
     不替换宿主/无侧栏壳：官方左背包面板内装配 页签栏(#srfgTabs)+柜格视口(#srfgBody)+
     警示(#srfgWarn)+底行(#srfgFoot)。作者底线：右侧发电机面板零改动。
     官方 DOM 只隐藏不 detach：#backpackGrid 柜页签 display:none；title/info-bar/hint 由面板
     .srfg-on 类隐藏——无燃料柜（或 cfg 关）时三件 mod DOM 全拆+类清除=逐像素原版。
     官方查询点清点（T9 纪律，FuelGenerator.html getElementById/$ 全量扫描）：backpackGrid/
     bagInfoBar/generatorSystem/fuelQueueZone/warningBox/availText/totalBurnValue/genRunLine/
     genRunText/genPerTickValue/fuelPerTickValue/generatorNameDisplay/recipeTooltip/auto 系——
     全部原位保留（mod 只 append 自家节点+加隐藏类），官方渲染通道零影响。
     面板尺寸锁（spec §5.1，实机修复批 2026-11-07 重做）：宽=CSS min-width 结构锁（.srfg-on
     上 calc 官方 CSS 变量 12 列全宽——官方页渐进渲染：默认 6×5 格先建、BagMsg 后 resize 12×N，
     一次性量取会锁进 6 列宽竞态=实机「重开页签栏不可见」根因）；高=右 .gen-panel 自然高
     （fgLockHeight 每轮 settle 自愈复核，不再一次性）——格区超高改内部滚动不撑爆对话框。 */
  var FG = { doc: null, panel: null, grid: null, current: 'bag', active: false, warnT: 0, lastKey: 0, rootBound: false, sig: '', tabSig: '' };
  var FG_FAIL_TEXT = { notfuel: '只能添加燃料', full: '燃油槽已满', bagfull: '背包已满，无法转送', noitem: '物品已不在柜中' };
  var FG_TIDY_SVG = '<svg viewBox="0 0 24 24"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>';

  function fgFuelCtns() {
    if (store.ctx && store.ctx.page === 'FuelGenerator' && store.ctx.fgOn === false) return []; /* cfg EnableFuelGen=false（ctx.fgOn，C# 直推）——空表=拆除态=原版 */
    var view = (store.ctx && store.ctx.view) || 'fuel';
    return store.ctn.filter(function (c) { return viewAllowsCtn(c, view); });
  }
  function fgTabIds() { return ['bag'].concat(fgFuelCtns().map(function (c) { return String(c.id); })); }

  function ensureBagtabs(f) {
    var doc = f.doc;
    if (!fgFuelCtns().length) return;        /* 无燃料柜=不建（拆后再建再拆=观察器乒乓暴毙，实机教训） */
    var panel = doc.querySelector('.generator-system > .panel:not(.gen-panel)');
    var grid = doc.getElementById('backpackGrid');
    if (!panel || !grid) return;             /* 官方左面板未建：等下一轮 */
    if (grid.children.length === 0) return;  /* 官方格未渲染（页面脚本未跑/BagMsg 未到）：等下一轮（默认 6×5 先建即可装配——宽度已无一次性锁，中间态无害） */
    if (FG.doc === doc && doc.getElementById('srfgTabs')) { fgSettle(); return; } /* 在位：数据驱动更新 */
    injectRailStyle(doc); /* srfg-* 样式随 railui.css 注入（本页此前无 rail=首次注入） */
    fgTeardown(); /* 跨文档重建（iframe 重载）：清旧引用 */
    FG.doc = doc; FG.panel = panel; FG.grid = grid; FG.current = 'bag';
    panel.classList.add('srfg-on');
    try { panel.parentNode.classList.add('srfg-sys'); } catch (e) { } /* 断官方 stretch：防背包格先渲染把 gen 拉高→锁进拉伸值（面板=system 直接子级，选择器已保证） */
    fgLockHeight(); /* 高度锁自愈首轮；宽度不锁（.srfg-on min-width 结构锁，渐进渲染中间态锁不错） */
    var tabs = doc.createElement('div');
    tabs.id = 'srfgTabs'; tabs.setAttribute('data-interactive', '');
    tabs.innerHTML = '<div class="srfg-pin"><div class="srfg-tab active" data-id="bag">背包</div></div>' +
      '<button class="srfg-tabbtn srfg-tabbtn-l" type="button">‹</button>' +
      '<div class="srfg-scroll" id="srfgScroll"></div>' +
      '<button class="srfg-tabbtn srfg-tabbtn-r" type="button">›</button>';
    panel.insertBefore(tabs, panel.firstChild);
    var body = doc.createElement('div');
    body.id = 'srfgBody'; body.hidden = true; body.setAttribute('data-interactive', '');
    panel.insertBefore(body, grid.nextSibling);
    var warn = doc.createElement('div');
    warn.id = 'srfgWarn'; warn.className = 'srfg-warn'; warn.hidden = true;
    panel.appendChild(warn);
    var foot = doc.createElement('div');
    foot.id = 'srfgFoot'; foot.className = 'srfg-foot'; foot.setAttribute('data-interactive', '');
    foot.innerHTML = '<button class="srfg-act" type="button">' + FG_TIDY_SVG + '<span>一键整理</span></button>';
    panel.appendChild(foot);
    /* 事件（一次性，委托——子节点重建不重绑）：页签点击/‹›/物品点击/整理钮 */
    tabs.addEventListener('click', function (ev) {
      var tb = ev.target.closest && ev.target.closest('.srfg-tab');
      if (tb && tb.getAttribute('data-id')) { fgSwitch(tb.getAttribute('data-id')); return; }
      if (ev.target.closest && ev.target.closest('.srfg-tabbtn-l')) { fgScrollBy(-160); return; }
      if (ev.target.closest && ev.target.closest('.srfg-tabbtn-r')) { fgScrollBy(160); }
    });
    body.addEventListener('click', function (ev) {
      var it = ev.target.closest && ev.target.closest('.item');
      if (!it || FG.current === 'bag') return;
      fgItemClick(+it.getAttribute('data-it') || 0, +it.getAttribute('data-cfg') || 0);
    });
    foot.addEventListener('click', function () { cmdOut('tidy', { owner: FG.current === 'bag' ? store.bag : Number(FG.current) }); });
    try { doc.getElementById('srfgScroll').addEventListener('scroll', fgBtnState, { passive: true }); } catch (e) { } /* 滚动中端点禁用即时更新（scroll 不冒泡，直挂滚动容器本体；sc 元素常驻，仅其 innerHTML 重建） */
    /* A/D 双绑（S5 兜底先行）：iframe 文档级（随文档销毁自然解绑）+ Root window（常驻，
       FG.active 守卫=燃料页不可见不动作，60ms 去重防双达双切） */
    try { doc.addEventListener('keydown', fgKey, true); } catch (e) { }
    if (!FG.rootBound) { FG.rootBound = true; try { window.addEventListener('keydown', fgKey, true); } catch (e) { } }
    fgSettle();
    try { console.log('[CERail] bagtabs mounted: FuelGenerator'); } catch (e) { }
  }

  function fgKey(e) {
    if (!FG.active || !FG.doc) return;
    var k = e.key;
    if (k !== 'a' && k !== 'A' && k !== 'd' && k !== 'D') return;
    var t = Date.now();
    if (t - FG.lastKey < 60) return; /* iframe+root 双绑去重 */
    FG.lastKey = t;
    var ids = fgTabIds(), i = ids.indexOf(String(FG.current));
    var ni = (k === 'd' || k === 'D') ? i + 1 : i - 1;
    if (ni >= 0 && ni < ids.length) fgSwitch(ids[ni]);
  }
  function fgScrollBy(dx) {
    var sc = FG.doc && FG.doc.getElementById('srfgScroll');
    if (sc) { try { sc.scrollLeft += dx; } catch (e) { } }
  }
  /* 高度锁自愈：右 .gen-panel 自然高（>400=已渲染）每轮 settle 复核、同值守卫——原一次性
     量取在官方渐进渲染竞态里会漏锁（实机教训：漏锁=#srfgBody 高度不定→柜格 max-height:100%
     无解→溢出界面外）；gen 后续长高（自动开机框展开等）也随之更新。
     锁变更后须补一发 resize：官方 createViewportFit 只在 BagMsg/resize 时量 .generator-system——
     首包 BagMsg 常先于装配到达，量到的是未锁高的巨大系统→body.zoom 被压小；锁完不重量=
     整个对话框停在半缩放（实机「重开页签栏看不见」观感）。_fit 注册了 window resize 监听，
     派发即重测（锁后系统≈gen 高，zoom 回 1）。 */
  function fgLockHeight() {
    if (!FG.doc || !FG.panel) return;
    var gen = FG.doc.querySelector('.gen-panel');
    var h = gen ? gen.offsetHeight : 0;
    if (h <= 400) return;
    var px = h + 'px';
    if (FG.panel.style.height !== px) {
      try { FG.panel.style.height = px; } catch (e) { }
      try { FG.doc.defaultView.dispatchEvent(new Event('resize')); } catch (e) { } /* 促官方 _fit 复测（zoom 复位） */
    }
  }
  /* ‹› 端点禁用（官方 Cooking .tab-scroll-btn:disabled 同式；实机修复①：按钮常驻可见，
     不再 is-visible 溢出门——燃料柜少时永不显形=「按钮没有」）。同值守卫防观察器环。 */
  function fgBtnState() {
    if (!FG.doc) return;
    var sc = FG.doc.getElementById('srfgScroll');
    var bl = FG.doc.querySelector('#srfgTabs .srfg-tabbtn-l'), br = FG.doc.querySelector('#srfgTabs .srfg-tabbtn-r');
    if (!sc || !bl || !br) return;
    var dl = sc.scrollLeft <= 0;
    var dr = sc.scrollLeft >= sc.scrollWidth - sc.clientWidth - 1;
    if (bl.disabled !== dl) bl.disabled = dl;
    if (br.disabled !== dr) br.disabled = dr;
  }

  function fgSwitch(id) {
    FG.current = String(id);
    var ids = fgTabIds();
    if (ids.indexOf(FG.current) < 0) FG.current = 'bag'; /* 容器已消失：回背包 */
    fgSettle();
  }

  function fgSettle() {
    if (!store.ctx || store.ctx.page !== 'FuelGenerator') return; /* 页守卫：他页 setData 不得驱动本页（终审修复：切场景中途误拆+回装断链） */
    if (!FG.doc || !FG.doc.getElementById('srfgTabs')) return;
    fgLockHeight(); /* 自愈高度锁：官方渐进渲染晚到（gen 面板后长成）也能补锁，同值守卫零观察器噪声 */
    var fuel = fgFuelCtns();
    if (!fuel.length) { fgTeardown(); return; } /* 无燃料柜=原版（Review Focus 1） */
    /* 页签行——**清单签名守卫**（勿用 innerHTML 串比较：序列化含 active 类修正，与生成串
       永不相等→重写丢 active→修正→再重写=观察器自激环，实机教训=渲染器 59 万写/秒暴毙） */
    var sc = FG.doc.getElementById('srfgScroll');
    if (sc) {
      var listSig = '';
      var html = '';
      for (var i = 0; i < fuel.length; i++) {
        html += '<div class="srfg-tab" data-id="' + fuel[i].id + '">' + nm(fuel[i]) + '</div>';
        listSig += (i ? '|' : '') + fuel[i].id + ':' + nm(fuel[i]);
      }
      if (FG.tabSig !== listSig) { FG.tabSig = listSig; sc.innerHTML = html; }
    }
    var ids = fgTabIds();
    if (ids.indexOf(String(FG.current)) < 0) FG.current = 'bag';
    try {
      var act = FG.doc.querySelectorAll('#srfgTabs .srfg-tab');
      for (var a = 0; a < act.length; a++) {
        var on = act[a].getAttribute('data-id') === String(FG.current);
        var want = 'srfg-tab' + (on ? ' active' : '');
        if (act[a].className !== want) {
          act[a].className = want; /* 同值守卫：防观察器环 */
          /* 仅真切换那一次滚动，且 instant：smooth scrollIntoView 在 overflow:hidden 滚动容器内
             被观察器周期反复触发=headless 渲染器崩溃实测（bag 页签在 .srfg-pin 容器外故幸免） */
          if (on) { try { act[a].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); } catch (e) { } }
        }
      }
      fgBtnState(); /* ‹› 常驻+端点禁用（原 is-visible 溢出门已退役） */
    } catch (e) { }
    /* 格网：背包页签=官方格原生；柜页签=官方格藏、mod 格渲。
       **签名门防环**（实机教训=harness 挂死根因）：fgRenderGrid 整写 innerHTML 会触发帧内
       观察器→scanFrames→ensureBagtabs→fgSettle 再整写=无限环（页面主线程打满、evaluate
       永不返回）。柜页签只在 签名(当前柜+rev) 变化时重建；页签 active 类同加同值守卫。 */
    var body = FG.doc.getElementById('srfgBody');
    if (FG.current === 'bag') {
      FG.sig = '';
      if (FG.grid.style.display) FG.grid.style.display = '';
      if (body && !body.hidden) body.hidden = true;
    } else {
      if (FG.grid.style.display !== 'none') FG.grid.style.display = 'none';
      if (body) {
        if (body.hidden) body.hidden = false;
        var sig = FG.current + '|' + (store.rev || 0);
        if (FG.sig !== sig) { FG.sig = sig; fgRenderGrid(body, Number(FG.current)); }
      }
    }
    /* ctx.feedFail 一次性消费（lastTidyFail 同款：本地清零，C# 推出即清双保险） */
    var ff = store.ctx && store.ctx.feedFail;
    if (ff) { fgWarn(FG_FAIL_TEXT[ff] || ''); store.ctx.feedFail = ''; }
  }

  /* mod 柜格：官方 .grid-container/.slot/.item/.is-fuel 类直接复用（同文档官方样式表=观感
     逐像素官方）；固定 12 列（spec），行数=cap/12；物品按 x/y/w/h 绝对定位（官方格同式） */
  function fgRenderGrid(body, ownerId) {
    var c = ctnById(ownerId);
    if (!c) { body.innerHTML = ''; return; }
    var cols = 12, rows = Math.max(1, Math.ceil((c.cap || 24) / cols));
    var html = '<div class="grid-container" id="srfgGrid" style="grid-template-columns:repeat(' + cols + ',var(--slot-size))">';
    for (var i = 0; i < cols * rows; i++) html += '<div class="slot"></div>';
    html += '</div>';
    body.innerHTML = html;
    var g = body.firstChild;
    var items = itemsOf(ownerId);
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      var ic = ICFG[it.cfgId];
      var el = FG.doc.createElement('div');
      el.className = 'item' + (ic && ic.burn ? ' is-fuel' : '');
      el.setAttribute('data-it', it.id);
      el.setAttribute('data-cfg', it.cfgId);
      el.title = it.name || '';
      var w = it.w || 1, h = it.h || 1;
      el.style.left = (10 + it.x * 46) + 'px';
      el.style.top = (10 + it.y * 46) + 'px';
      el.style.width = (w * 40 + (w - 1) * 6) + 'px';
      el.style.height = (h * 40 + (h - 1) * 6) + 'px';
      el.innerHTML = (it.icon ? '<img src="' + it.icon + '" style="width:100%;height:100%;object-fit:contain;pointer-events:none;" loading="lazy" decoding="async" alt="">' : '📦') +
        (it.count > 1 ? '<span class="item-count">' + it.count + '</span>' : ''); /* 图标=官方 mapItem 同款内联（100% 填充+contain；旧 26px 定值=实机「图标压缩变小」） */
      g.appendChild(el);
    }
  }

  /* 点击柜中物品：JS 预检省往返（非燃料/满员直接弹 mod 警示），C# OpFeed 权威校验兜底
     （拒绝经 ctx.feedFail 回执——fgSettle 消费弹同一节点） */
  function fgItemClick(id, cfgId) {
    var ic = ICFG[cfgId];
    if (!ic || !ic.burn) { fgWarn('只能添加燃料'); return; }
    if (fgQueueFull()) { fgWarn('燃油槽已满'); return; }
    cmdOut('feed', { owner: Number(FG.current), item: id });
  }
  function fgQueueFull() {
    var z = FG.doc.getElementById('fuelQueueZone');
    if (!z) return false;
    var slots = z.querySelectorAll('.fuel-slot');
    var used = z.querySelectorAll('.fuel-slot.queued-item, .fuel-slot.active-burn');
    return slots.length > 0 && used.length >= slots.length;
  }

  function fgWarn(text) {
    if (!FG.doc) return;
    var w = FG.doc.getElementById('srfgWarn');
    if (!w) return;
    w.textContent = text || '';
    w.hidden = !text;
    if (FG.warnT) { try { clearTimeout(FG.warnT); } catch (e) { } }
    if (text) FG.warnT = setTimeout(function () { try { w.hidden = true; } catch (e) { } }, 1800);
  }

  /* 拆除=原版：三件 mod DOM 移除、.srfg-on 与宽高 inline 清除、官方格显式恢复 display */
  function fgTeardown() {
    if (!FG.doc) return;
    ['srfgTabs', 'srfgBody', 'srfgWarn', 'srfgFoot'].forEach(function (id) {
      var el = FG.doc.getElementById(id);
      if (el && el.parentNode) { try { el.parentNode.removeChild(el); } catch (e) { } }
    });
    var p = FG.panel || (FG.doc.querySelector ? FG.doc.querySelector('.generator-system > .panel:not(.gen-panel)') : null);
    if (p) {
      p.classList.remove('srfg-on');
      p.style.width = ''; p.style.height = '';
      try { if (p.parentNode && p.parentNode.classList) p.parentNode.classList.remove('srfg-sys'); } catch (e) { } /* stretch 断链随拆（vanilla 零残留） */
      try { FG.doc.defaultView.dispatchEvent(new Event('resize')); } catch (e) { } /* 高锁解除=系统复高，促官方 _fit 复测（vanilla 测量恢复） */
    }
    if (FG.grid) FG.grid.style.display = '';
    FG.doc = null; FG.panel = null; FG.grid = null; FG.current = 'bag';
  }

  function ensureMountedFrame(f) {
    var doc = f.doc, key = f.key, sc = SCENES[key];
    if (!doc || !doc.body || !sc) return;
    /* 燃油发电机 bagtabs（fuelgen spec）：在 frameVisible 门**之前**——隐帧也要翻 FG.active=false
       （Root A/D 守卫依赖它；隐藏后键不动作=不泄漏）。装配自身仍只对可见帧。 */
    if (sc.bagtabs) {
      FG.active = frameVisible(f.el);
      if (FG.active) { try { ensureBagtabs(f); } catch (e) { try { console.warn('[CERail] bagtabs 装配异常', e && (e.message || e)); } catch (e2) { } } }
      return;
    }
    if (!frameVisible(f.el)) return;
    if (sc.native) { ensureNativeBp(f); nbMount(f); return; } /* v1.8.3 原生模式：注 CSS 不装配 rail；v1.8.4 加 mod 按钮对（幂等；iframe 重载换文档自然重注） */
    /* T9 宿主复活先撤桩（裁定 2）：rail 在位而宿主重现=官方重建——真节点已回文档，此刻
       桩的重复 id 会让官方 $() 命中桩而非真节点；撤桩后 mount 重替换并重建新桩。
       （官方格引用在 mount 内先于摘除取得，复活重装配不丢格。） */
    if (doc.getElementById('srRail') && hostAlive(doc, sc)) stripStubs(doc);
    if (mountedOk(doc, sc)) { ensureTabsInSlot(f); ensureRackInSlot(f); return; } /* 在位且宿主未复活：观察器/interval 噪声快速路径（BP 形态翻转由 Vue 重建摘壳→hostAlive('bp')=true→自然重装）；v1.8.7 快路径上补挂页签件；二十一批同路补挂 rack 行视图宿主 */
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
        if (SCENES[FRAMES[j].key] && SCENES[FRAMES[j].key].bagtabs) FG.active = false; /* 终审 Minor7：帧移除复位（Root A/D 守卫收口，实机关界面形态） */
        FRAMES.splice(j, 1);
      }
    }
  }
  try { setInterval(scanFrames, 500); } catch (e) { }        /* 兜底轮询（裁定 2：观察器+interval 双保险） */
  try { setTimeout(scanFrames, 0); } catch (e) { }           /* 首扫错开一拍：bootstrap 在本 IIFE 返回后才写 __CERAIL_CSS__ */
  /* ---- v1.8.10 十三批四追：首包丢失自愈心跳（八追扩陈旧态） ----
     实机实锤（2026-11-05 作者重启后全界面 rail 裸骨架：排序钮全隐/格区布局残留）：
     推送是 fire-and-forget（ExecuteJavaScript 无回执），读档时序窗口内首包可被 WebView
     静默丢弃；此后 C# 门②（page 未变且签名未变）永不重试 → JS store.ctx 恒空 →
     render 全局早退。自愈=数据饥饿期每 5s 发一条零副作用 ping
     （C# Pump 执行过即 ForceRepublish=rev 门控强制下周期重推），数据到达即停。
     v1.8.10 八追（同日复发会话实锤「Trade 开着 20 分钟断流不自愈、重启才好」）：
     旧判据 `store.ctx 空才 ping` 漏掉**陈旧态**——首包到过（ctx 非空、按钮亮=render 跑过
     一遍）、之后所有包被丢（数据是旧的、功能全死、命令对着旧 owner 打），心跳被 ctx 非空
     静音 → 永不自愈。新判据补位：rail 在位且 >60s 无新包到达（lastSetAt，setData 落地即
     记——包到达本身即通道活性证明）也发 ping；空闲期代价=每 ~65s 一包重推（兼作保活探针）。 */
  var pingAt = 0;
  var lastSetAt = 0; /* 八追：最近一包到达时刻（setData 入口即记，空契约早退也计） */
  try {
    setInterval(function () {
      try {
        if (!el.rail && !FG.active) return; /* 十四批心跳门扩 bagtabs 页（无 el.rail；FG.active=燃料页可见在装）——首包丢弃自愈不再缺位（终审 Important3） */
        var now = Date.now();
        var hungry = !store.ctx || (lastSetAt > 0 && now - lastSetAt > 60000);
        if (!hungry) return;
        if (now - pingAt < 5000) return;
        pingAt = now;
        cmdOut('ping');
      } catch (e) { }
    }, 2000);
  } catch (e) { }
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
    /* 页签顺序无需显式应用：storeAllOrder 现读 TABS（官方数组序=C# pinorder.json 权威序）。 */
  }
  function applyScene(key) {
    st.scene = key;
    st.w12Floor = 0; st.w12Src = 0; /* 壳宽地板：跨页标定失效（各页 slot/内边距几何不同，本页首见 UNI_W 列重标定） */
    loadScenePrefs();
    st.currentId = entryDefault();
    /* v13.5-v13.8：设施排序态随场景；缺陷单#1：**切场景重置为默认**（UI-SPEC §4.11 定版；
       旧实现 localStorage 恢复标签不重排）。v1.8.9：Trade 默认价值排序**退役**（作者令
       「去掉」——一键整理后显示层重排把官方格全量重建放大成两遍=卡顿帮凶；退役后 Trade
       恒保持官方真实排布；金色价值角标保留，模型 prime 见 render 的 Trade 分支）。
       v1.8.10 十三批：Trade 排序钮回归（SORT_KEYS）——**进页仍默认 official**（退役口径
       不变：不自动重排），选维是玩家显式动作（页脚钮），整理性能路径零回退。 */
    st.fsort = 'official';
    /* v1.8.5：显示层排序态随场景重置；换场景=换模型（vue/grid 适配器现取），旧模型 real
       快照随数组身份自然失效 */
    DISP.choice = null;
    DISP.owner = 0; DISP.model = null;
    DISP_CT.choice = null; DISP_CT.owner = 0; DISP_CT.model = null; /* v1.8.6 柜侧同沿重置（换模型实例，快照随数组身份失效） */
    /* B 键单独背包 = 纯背包页：进入时全库收紧（rail.js setScene：global 复位回 prevMode） */
    if (sceneBagOnly() && st.global) { st.global = false; st.mode = st.prevMode || 'grid'; }
    st.sel = null;
    /* v1.8.7：场景开启上报本页显示序退役——顺序唯一权威=C# cerail_pinorder.json，
       各页轮询（TabInjector/TabGate/Pruner 的 ApplyOrder）每 0.5s 对账自愈，
       无需 JS 浏览器侧回灌（旧 srp_pin_order_<scene> localStorage 读写路整体下线）。
       v1.8.9：T4 Browser 选中上报同批退役（下拉按钮已删，C# 端 setFilter/cerail_filter.json 一并拆）。 */
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
    lastSetAt = Date.now(); /* 八追：到达即证通道活（后续空契约早退也算到达——心跳据此免 ping） */
    /* v1.8.5⑫ 三零空契约不落地（实机 rev4 实锤：弹窗/切页瞬间 C# OwnerCache 空窗——
       落地即摘角标层+进页沿复位把排序打回=「点详情数值消失」终修；icfg=0 必为构建空窗，
       配置表恒非空）。保留上一包，等下一笔真数据。 */
    if (store.rev > 0
      && !(json.ctn && json.ctn.length)
      && !(json.icfg && json.icfg.length)
      && !(json.items && Object.keys(json.items).length)) return;
    store.rev = json.rev || 0;
    /* Bug4 三段计时：契约回推到达（空契约守卫之后=真数据才记） */
    if (XFER && XFER.kind === 'tidy' && XFER.t0 && !XFER.tSet) XFER.tSet = Date.now();
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
    /* ctx.uniformWidth（int>=0，0=off 也落地——地板停用信号）：值变 → 壳宽地板标定失效
       （Review Focus 2 的 JS 半边；标定逻辑在 syncRailWidth，Task4） */
    if (store.ctx && typeof store.ctx.uniformWidth === 'number' && store.ctx.uniformWidth !== UNI_W) {
      UNI_W = store.ctx.uniformWidth;
      st.w12Floor = 0; st.w12Src = 0;
    }
    /* 场景态（T4）：ctx.page 换了 → 应用新场景（偏好重载/入口默认/bagonly 收紧）；
       同页首包（mount 先行、数据后到）也补应用一次（sceneApplied 门——mount 时 ctx
       未到，入口默认容器可能落旧值）；同场景回推（rev 变）→ 不动，保住玩家当前页签。
       COMMON 不在此处重置（玩家状态），由 applyScene→loadScenePrefs 按存档/默认赋值。 */
    /* v1.8.5：sortBy 数据层通道退役（ctx.lastSortAck 不再消费）——显示层排序即时生效，
       真实数据零触碰、无失败路径（旧回执/toast 机制随之废弃）。 */
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
    try { fgSettle(); } catch (e) { try { console.warn('[CERail] fgSettle 失败', e && (e.stack || e.message), e); } catch (e2) { } } /* fuelgen bagtabs：页签/格网/底行随数据更新 + ctx.feedFail 一次性消费 */
    try { nbRefresh(); } catch (e) { try { console.warn('[CERail] nbRefresh 失败', e && (e.stack || e.message), e); } catch (e2) { } } /* v1.8.4 原生页角标随契约重算 */
  }

  /* ---- __CERAIL__ 契约壳（T2 定面；T3 填实 setData/mount；T5 填实 drain/cmd）---- */
  window.__CERAIL__ = {
    dispInfo: function () { return { choice: DISP.choice, owner: DISP.owner, model: DISP.model ? DISP.model.kind : null, items: DISP.model ? DISP.model.items.length : 0, ct: { choice: DISP_CT.choice, owner: DISP_CT.owner, items: DISP_CT.model ? DISP_CT.model.items.length : 0 }, nb: { bag: NB.fsort, ctn: NB2.fsort } }; },
    brewTier: function (row) { return brewTierOf(row); }, /* v14 自检口（dispInfo 先例）：harness §1 三档派生/阈值兜底断言用 */
    _ppCount: 0,
    _pp: function () { this._ppCount++; }, /* v1.8.10 十三批六追：微包回执钩（OpPing 发 ~40B 微型 ExecuteJavaScript——达=通道活、长度丢弃实锤；不达=通道级死） */
    /* v1.8.10 八追分片落包（同日九点修订：乱序免疫）：大契约（>7.5KB）C# 侧拆片下发（大包
       ExecuteJavaScript 概率性丢弃而微包恒达——六追 CDP 实证 + 2026-11-05 复发会话 20 分钟
       断流），JS 侧按**推送实例 pid** 缓冲重组——初版按「seq=0 重开缓冲」管理生命周期，实机
       CDP 活捉（分片重组失败每 6s 一次、join 出洞+串包）证明 **WebView2 ExecuteScript 异步
       无序执行**：seq=0 迟到会清掉已收后续片、跨包迟到片写进新包槽位 → 重组必炸 → setData
       永不落地=断流假象。修订=pid 单调递增寻址（旧 pid 片直接弃）+ 计数齐片才 commit
       （有洞永不 commit，30s 超时弃——丢片由心跳重推新 pid 自愈），对任意乱序/重复/迟到
       均幂等安全。 */
    _pcBuf: null, _pcPid: -1, _pcFill: 0, _pcAt: 0,
    pushChunk: function (pid, seq, total, s) {
      var now = Date.now();
      if (pid < this._pcPid) return;                 /* 旧包迟到片：弃（乱序安全核心；_pcPid=单调
                                                        高水位，commit/超时只清缓冲不回退——旧包
                                                        迟到齐片也不得复活覆盖新数据） */
      if (pid > this._pcPid) { this._pcPid = pid; this._pcBuf = []; this._pcFill = 0; this._pcAt = now; }
      if (this._pcBuf && this._pcAt && now - this._pcAt > 30000) { this._pcBuf = null; return; } /* 陈片弃（_pcAt>0 门=防冷启动误判） */
      if (!this._pcBuf) return;                      /* 本 pid 无活动缓冲（已 commit/超时弃）：重复片/迟到片弃 */
      this._pcAt = now;
      if (this._pcBuf[seq] === undefined) this._pcFill++;
      this._pcBuf[seq] = s;
      if (this._pcFill < total) return;              /* 有洞不 commit：等齐（丢片由新 pid 重推） */
      var joined = this._pcBuf.join('');
      this._pcBuf = null;
      try { setData(JSON.parse(joined)); }
      catch (e) { try { console.warn('[CERail] 分片重组失败（齐片仍解析失败——契约非严格 JSON？）', e && (e.message || e)); } catch (e2) { } }
    },
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
