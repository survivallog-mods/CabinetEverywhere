# 更新日志（SurvivalLog.CabinetEverywhere / 储藏柜直达）

> 本文件只记本 mod 的更新；套件/安装器版本史见总仓根 CHANGELOG.md。
> 版本号单源：总仓 version.json 的 mods 字段（作者定义）。

## v1.8.1（2026-11-06，作者定版——合并 main；版本号单源=作者裁定）

以下待发版批次（多会话并行：十三~二十批）随本版一并发布。

### 待发版·二十九批（2026-11-07，燃料火苗角标断供修复——fgBadgeFuel 补类+官方规则注入）

**作者实报**：「燃油发电机、暖炉界面的背包和柜子中，燃料左上角的火焰标记不显示了」。

- **根因（git -S is-fuel 考古）**：火苗角标从来是 **mod 侧**的——fuelgen 批（459ba38）自绘格
  时代 mod 渲染时写 `el.className='item is-fuel'`，官方页 CSS 的 `.item.is-fuel::before`
  （火苗 SVG+橙红渐变）配类绘制；**九验收（5e9f973）退役自绘格改官方 #backpackGrid 后断供**
  ——官方 webui-bag.js `mapItem` 只加 `item`+品质类、从不加 `is-fuel`（官方那条 CSS 规则在
  官方页=死规则，mod 曾是唯一消费者）。与本日滚动器/暖炉批次无关（断供自九验收起一直在，
  暖炉页先天无此规则=从未有过角标）。
- **修复（bagtabs 帧内补类，官方渲染零触碰）**：①`fgBadgeFuel()`——官方格渲染后按 ICFG
  燃烧位（icfg 尾列 burnable，fgFeedCmd 预检同源）补 `is-fuel` 类：物品 id=官方元素 id，
  id→cfgId 走当前视图物品表（`itemsOf(bag|柜签)`，随柜签切换换源）；渲染时机=官方 BagMsg
  异步到达→**childList 观察器**（FG.badgeMO，盯格树；只听 childList=补类写 className 不回触=
  零自激环）+fgSettle 每轮复核双保险，**同值守卫**幅零写；拆除随拆断开。②railui.css 注入
  官方 `.item.is-fuel::before` 规则（FuelGenerator.html **逐字拷贝**；Heater 页官方无此规则
  =mod 补供，--warm-orange/--danger-red 两页同名同值）——rail 他页无此类=规则惰性零影响。
- **harness**：双页孪生各 +1 断言（柜签 3 件：木柴/柴油 .is-fuel 类在+`::before` 15px 真绘制
  （backgroundImage 非 none——heater 页即证明注入规则生效）、零件无类）→ fuelgen **53/53**、
  heater **55/55**；mount 166/179（13 size 预存不变）、native-width 8/8、switch-cabinet 27/27
  复验绿。

### 待发版·二十八批（2026-11-07，暖炉界面柜子页签——bagtabs 族第二页同构移植）

**作者需求**：「燃油发电机界面的改造是否可以直接复用到暖炉界面，它俩界面基本完全一致」——
实证结论：可以，游戏侧是 1:1 镜像；mod 侧查表扩页零新机制。

- **游戏侧实证（移植依据，HotUpdate.dll 元数据+双页源码逐项对比）**：`State_Web_Heater` 与
  `State_Web_FuelGenerator` 字段级镜像（`BagOwnerId` 同 `ReactiveProperty<Int64>` 直写目标、
  BagCols/Rows/FuelSlotCount/FuelItems 同名同型）；动作族 `Ac_Heater_RefreshBag/FuelAdd/
  FuelReturn/ItemClick` 同载荷（FUEL_ADD 同 `{itemId}`）；Heater.html 左面板 DOM 契约同名
  （`.heater-system>.panel:not(.heater-panel)` 宿主、#backpackGrid/#fuelQueueZone/.fuel-slot/
  .panel-title/.info-bar/.hint-shift）；页面 JS `createGridBag`+`createBagDragCoordinator` 的
  ITEM_MOVE/ITEM_CLICK/FUEL_ADD 事件逐字同形——九~十一验收的 switchBag v2 官方状态直写/
  CtnGuard 柜子 id 排斥/闪环根除语义结构性继承。
- **C# 查表扩页六处**：SceneDef 加 Heater 行（family 'ht'）+ `HeaterState()`（GetStateByUI 同
  路径）+ RefreshActivePage case（Ac_Heater_RefreshBag）+ ResolveBagOwner case（.Value 直读+
  十一验收 CtnGuard 同款）+ ctx 页条件字段 `heaterOn`（fgOn 同款消费链）+ ScenarioViewOf case；
  OpSwitchBag/OpFeed 按 `ActivePage()` 派发（直写 State_Web_Heater.BagOwnerId / 容量校验读
  FuelSlotCount+FuelItems / 第二跳 Ac_Heater_FuelAdd，default=燃油发电机保形）。
- **JS 页描述符 BAGTABS（本批唯一新机制点，~10 行）**：SCENES.Heater 行（bagtabs 族第二页）+
  页差异全表驱动——宿主选择器两件套（`.heater-system`/`.heater-panel`）、cfg 门 onKey
  （heaterOn）、满员文案（「炉膛已满」=页官方 warningFuelFull 同词）；ensureBagtabs/
  fgSettle/fgTeardown/fgFeedCmd 的硬编码 'FuelGenerator' 与选择器泛化为描述符取值，
  fuelgen 行为零改动；CSS 零改动（.srfg-on 族选择器两页通用）。feedFail 的 full 文案走
  描述符（燃油槽/炉膛页异），notfuel/bagfull/noitem 两页同词。
- **cfg**：[Access] `EnableHeater`（默认 true，独立开关不联动 EnableFuelGen——页级开关先例
  同构）+ [Scenario] `View_Heater`（默认 Fuel=燃料标签柜视角，与发电机同语义）。
- **harness**：root harness bagtabs mock 按页分流（HTVIEW 独立官方状态模拟 State_Web_Heater、
  switchBag/feed/官方节律 tick 按 current 页派发——C# ActivePage 保真）+ `fixtures/Heater.html`
  （官方页逐字节原样+遥测桥，tooltip 元素 id 页异 #fuelTooltip 已适配）+ `harness-heater.cjs`
  孪生（fuelgen 断言集逐路对齐+⑫暖炉特有：右炉体面板零改动/fuelCap 官方读数随 BagMsg 刷新/
  料槽 8 格官打）→ **54/54**；合流复验 fuelgen 52/52、switch-cabinet 27/27、height 12/12、
  width-floor 13/13、tagfilter-gate 15/15、brew-tier 35/35、native-width 8/8、
  native-scroll-drag 14/14、sbtrack 全绿；mount 166/179（13 size 预存逐条不变）；
  regression/store-all/tidy 超时点同预存（176/73/86 行）。
- **与二十七批二报合流**：本批 Heater 帧入 SCENE_KEYS 后暴露 bagtabs 多页共存键死穴
  （FG.active 单实例被隐帧覆盖），二报已代修（可见帧赢/隐帧仅本页才翻 false）并在本批
  harness-heater 上回验——两批同树，缺一不可分。
- **实机校准点（移交作者，T8 式）**：①Heater 页 iframe id 是否恰为 'Heater'（SCENES 键直配，
  首装日志 `bagtabs mounted: Heater` 为准）；②State_Web_Heater.BagOwnerId 直写副作用面与
  FuelGenerator 同（预期同——同构 ReactiveProperty，实机一验）。

### 待发版·二十七批（2026-11-07，原生背包+燃油发电机/暖炉 bagtabs 滚动后拖拽修复——滚动器上收，官方坐标数学零改动）

**作者实报**：「背包界面通过滚动条滚动到下方后，无法移动物品，拖拽移动物品的落地位置不对」
（截图实锤：绿色落点预览比目标高约 7 行）。

- **根因**：v1.8.3 原生模式 CSS 把 `.grid-container` **自己**变成滚动器
  （max-height:560+overflow-y:scroll）——而官方 BackpackUI 页（Vue）拖拽坐标基准恰是该元素
  rect：onMouseDown 缓存 `gridRefs[side].getBoundingClientRect()`，滚动后 rect=裁剪窗顶（行 0
  实际在 rect.top−scrollTop 上方），updateHover 落点 `ny=round((cursorY−offsetY−rect.top−PAD)
  /CELL)` 恒少 `scrollTop/CELL` 行 ⇒ DRAG_ITEM y 整段偏上（=截图绿框在上方）；目标行被误判
  占用 ⇒ 放不下回弹（=「无法移动物品」）。官方代码无过——官方背包从不滚动，滚动是本 mod
  注入的，注错了元素。
- **修复（纯 CSS 迁移，官方代码/监听/数据零触碰）**：滚动四规则（max-height+overflow+
  gutter+content-box+padding-right 滚动槽在官方 inline 宽之外口径不变）从 `.grid-container`
  迁到**官方父层 `.grid-wrapper`**（宽=max-content+margin:auto 居中=槽仍贴格，篮子固定宽面板
  同）——格 rect 恢复全高内容矩形（行 0 恒在 rect.top），官方坐标数学零改动自洽。与壳侧
  机器页 sr-body 祖先滚动同案（该路 webui-bag.js getGridCoordinates 一直正确的原因）。
- **配套**：nbMount 恒显指示轨 srnSbTrack 改绑 `.grid-wrapper`（滚动事件/scrollTop 在新滚动器
  上，绑格本体恒 0=thumb 钉死满长）；`style#srNativeBp` 注入体版本 data-uw '0'→'2'（旧注入体
  活页一次重写换新，harness-native-width 活迁移路同测）。
- **harness**：新增 harness-native-scroll-drag.cjs——10×16 高袋滚到底（scrollTop=336=6 行）
  **真鼠标**拖拽两例：(4,14)→(7,13) 与 (2,11)→(9,10)，断言 DRAG_ITEM x/y=光标格、悬停期
  .drag-highlight 客户区=目标格、格 rect 全高 896、格本体非滚动器、thumb translateY>0。
  **RED 实证旧病**（还原旧 CSS：格 rect 560 裁剪窗/highlight(0,0)/两拖拽零 DRAG_ITEM=「无法
  移动物品」复现）→修复后 **14/14**；native-width 8/8（断言随迁：data-uw='2'+活迁移升 v2）；
  mount 166/179（native-rules 断言收紧=滚动器必 .grid-wrapper 且格本体无 overflow-y:scroll；
  13 个 size 旧口径 FAIL 逐条不变=预存）；height 12/12、fuelgen 48/48、switch-cabinet 27/27、
  sbtrack/width-floor/tagfilter-gate/brew-tier 全绿；regression/store-all/tidy 超时点与干净
  HEAD 逐字一致（预存红，与本批无关）。
- **已知边界（与官方一致，不另造机制）**：拖拽**途中**滚轮再滚动，落点按起拖时缓存的 rect
  计算=偏移起拖后滚动量（官方页 rect 只在 onMouseDown 缓存一次，官方背包原生无滚动故从未
  处理；本修复后静态滚动态已正确，途中滚动误差从「全量 scrollTop」收窄为「途中增量」）。

**同日二报（作者实报「打开燃油发电机界面的侧栏，背包和柜子界面也有这个问题」）——bagtabs
族同病同修（v1.8.14）**：

- **根因同形**：bagtabs 页（燃油发电机/暖炉）官方 `#backpackGrid`（webui-bag.js 格）被
  railui.css `.srfg-on > .grid-container{flex:1;overflow-y:auto}` 变成自滚滚动器，而
  webui-bag `getGridCoordinates`/`isMouseOver`/松手落点全按**格 rect 顶=行 0** 对齐——滚动后
  rect=裁剪窗，ITEM_MOVE x/y 恒少 `scrollTop/step` 行（同 BackpackUI 病，页不同款）。
- **修复（mod 包装层，官方代码/监听零触碰）**：ensureBagtabs 把官方格包进 mod
  `#srfgGridScroll.srfg-gridscroll`（railui.css 唯一 flex:1+overflow 子项，滚动槽 thin 样式随迁），
  格全高在内滚=格 rect 恒全高内容矩形；fgSwitch 换签归顶改写包装层 scrollTop；fgTeardown
  拆包还原（格回面板直子=DOM 序原版，harness 断言拆包不变量）。暖炉页（bagtabs 族第二页，
  同一 ensureBagtabs）同享修复。
- **顺带根除 bagtabs 多页共存键死穴**：`FG.active` 单实例被**任意** bagtabs 帧无条件覆盖
  （暖炉帧入列后，DOM 序后到的隐帧每轮扫描把燃油发电机可见页翻成 false=A/D 键全灭；暖炉
  自身因排末位幸免）——改**可见帧赢/隐帧仅本页（FG.page）才翻 false**，帧移除复位同款守卫。
- **harness**：harness-fuelgen 三处滚动断言改量包装层（tall-ctn/bag-viewport/reopen-bagheight）
  +新增 4 断言（格非滚动器+rect 全高 936/滚到底有效性/滚动态两例拖拽 **ITEM_MOVE={x:7,y:13}**
  **{x:9,y:10}**=光标格/拆除含包装层+格回面板直子）→ **52/52**；harness-heater 54/54（暖炉
  孪生含同款滚动态拖拽断言）；native-scroll-drag 14/14、native-width 8/8、height 12/12、
  sbtrack 全绿；mount 166/179（13 个 size 旧口径 FAIL=预存逐条不变）。

### 待发版·二十六批（2026-11-07，背包/柜子高度修改——宽度退役恒 12，缩高物品官方掉落）

- **spec**：docs/superpowers/specs/2026-11-07-bag-height-design.md；**计划**：docs/superpowers/plans/2026-11-07-bag-height.md。
- **24 包高度逐包可调，15 个 [Rail] 键全进 ModCenter 面板（全部默认 0=恢复原生）**：
  背包链 9 包统一（BackpackHeight，天赋换包链同高兼容）；置物架四档+工具柜、冰箱四包、
  载具三包逐包独立（作者令「冰箱、载具怎么能统一高度，分开」）；工作台抽屉基准高
  DrawerHeight→三档 H/H+1/H+2（升级加行语义保留）；MaxHeight=50 防呆逐档夹（0=不封顶）。
- **宽度退役恒 12**：Rail.UniformBagWidth 键删除（老 cfg 残留值忽略），常量 RailUi.UniformWidth；
  24 高度包全部并进宽度目标集（载具 1021/1022 原生宽 5/10 随批首收 12，绕过 ExcludeBagIds
  白名单包含优先语义）。
- **缩高掉落流 ShrinkDrop（作者拍板「放不下的直接掉地上，官方已有案例」）**：
  官方编排 `DropItemManager.SpawnGroundLootItem`+`ItemManager.RemoveItem`（拆除掉落同款先例，
  保鲜随身、地面物进存档；mod 零直接写 Data_Item）；实例源=背包/抽屉/后备箱/门口袋合成
  owner 常量（`VehicleConfig.TrunkOwnerId/BoxOwnerId`、`DoorBoxBagId=1023` dump 实锤）+全图
  家具（当前图掉落玩家脚下、他图留包日志兜底=到场整理找回）；先掉后缩，生成失败本轮放弃
  零物品损失。
- **立即生效硬验收（作者令「不允许界面变形、闪烁、延迟生效」）**：15 键 SettingChanged→
  SizeDirty 帧级主线程消费；写后链=Ra_RefreshBag 官方页刷新+BackpackUI 补
  Ac_Item_RefreshAllBagViews+容器 cap 重算（RefreshMeta 顺序翻转为先改尺寸后算容量）强推。
- 签名门扩双维（宽|高映射|目标集|排除集）；家中无柜不再整轮早退（高度名单静态）。
- **harness**：harness-height.cjs 五查 12/12（18/50 行侧栏行数重算+官方格 12×18/12×50+纵向
  滚动+燃油发电机高背包 12×50 面板不越界+零错）；width-floor 复跑 13/13。
  harness-regression 现存 3 FAIL+超时为预存红（干净 HEAD 与工作树逐字一致，源出燃油发电机
  线，与本批无关——本批零被伺服文件改动）。
- ModCenter：Meta.cs 面板 15 条（ModCenter 仓 ed7ba80）。

### 待发版·二十五批（2026-11-07，材料架转移列操作按钮归位官方——mod 三增值按钮整链退役）

**作者实机对账裁决（停用 mod 官方截图实锤）**：材料架特殊，与其他柜子不一样——转移列
**只有两个操作按钮**「放入材料 / 全部取出」（官方 #btnPutAll/#btnTakeAll 原件+官方监听）。
v1.8.2 v13 曾往官方 .transfer-controls 尾部 append mod 三增值按钮（◀分类取出/分类放入▶/
按标签放入+色点行，rackMid 装配），实机观感与官方不符=本批整链退役删除：

- **railui.page.js**：MID_EXTRA_HTML 常量、mount 的 rackMid append 块、bindMid()（含内嵌
  bindCat 分类下拉）、renderMidChips()（按标签色点联动）、putAllToCabinet/takeAllFromCabinet/
  tagPutIn、armXfer + settleXfer 的 put/take 差量尾部、分类工具（catName/catMatch/catLabel/
  catsOf）、sbToast 别名、bind() 引用表 srMid 七 id——全删；SCENES.MaterialRack 摘 rackMid
  旗。closeMidMenus 与 document 级点外/Esc 收起守卫保留（无 mid 节点=空操作，零风险）。
- **命令契约对账**：takeAll/putAll/takeCat/putCat/putTag 五 op JS 侧不再发出（文件头契约注
  已标退役；C# 执行器保留无害——take/put 单件 op 退役同款先例）。settleXfer 仅存 storeAll/
  tidy 两路（T11/T12 活跃消费，三处 arm 点不变）。
- **railui.css**：#srMid/.transfer-controls-spacer/.category-dropdown*/.tag-putin* fork 段删除。
- 对账：v1.8.2 v13 的「中段三按钮」为设计口径引入（非缺陷回归），本批按作者裁决整体推翻，
  官方两按钮即全部。
- harness-mount 新增回归断言 rack-mid-official2:MaterialRack（转移列按钮 id 恰
  [btnPutAll,btnTakeAll] 且 #srMid 不存在）——**RED 实锤旧代码 5 按钮**
  （btnPutAll,btnTakeAll,srTakeCat,srPutCat,srTagPutIn srMid=true）→修复后 PASS；
  mount 166/179（基线 165/178+新断言，13 个 size 旧口径 FAIL 逐条不变）；
  switch-cabinet 27/27、fuelgen 49/49、width-floor 13/13、native-width 8/8、
  brew-tier/sbtrack/tagfilter 全绿；截图视觉对账=官方两按钮。

### 待发版·二十四批（2026-11-07，燃油发电机 bagtabs 实机四缺陷修复——夹具换真实官方页）

**十一验收轮（作者实机反馈：切到柜签后切不回背包，界面停在柜内容）**：
㉔ **背包 owner 解析链污染**——switchBag v2 把柜子 id 写进 State_Web_FuelGenerator.BagOwnerId，
   而 ResolveBagOwner 第①优先级恰是读这个字段：切到置物架后「切回背包」(owner=0) 解析出**柜子
   id**→OpSwitchBag 同值守卫短路→界面停在柜；且契约 items.bag 会被同源污染成柜内容。修：
   解析链 FG case 加**容器 id 排斥**（CtnGuard：IsKnownCtn 视同未读到，回落会话缓存/PlayerId
   正路；玩家背包 id 与柜子 id 空间天然不同——不落缓存防污染）。mock 同步 C# 解析链保真
   （状态字段+容器排斥+会话缓存三级），fg:bag-tab-restore 升格为本 bug 回归床。48/48。

**十验收轮（作者实机反馈：柜签不能动+背包也不能动+柜签不停闪烁——「你验证了吗？」）**：
㉑ 诚实对账：九验收只验到 harness（mock 世界无游戏权威状态/官方推送节律），实机两类崩法均
   无法在旧 mock 里存在。根因复盘：**v1 合成 BagMsg 注入只改页面视图**——①视图与游戏权威
   状态分叉→官方 ITEM_MOVE 按游戏状态校验→背包/柜子移动全废；②switchBag 命令→泵末
   RefreshActivePage→官方推玩家背包→失配监听重拉→再命令→再刷新=**闪烁自激环**（「匹配即
   清零重试计数」给环无限续命）。
㉒ **v2=官方状态直写**（烹饪页签的正身用法）：switchBag 改写
   `State_Web_FuelGenerator.BagOwnerId`（游戏开页自己就设的官方字段，ReactiveProperty 直写）
   + 派发官方 `Ac_FuelGenerator_RefreshBag`——**官方 C# 自己按新 owner 组包推送**。合成
   BagMsg/PostPageMessage/失配监听全删：视图=权威状态恒一致，闪环/移动失效/推送打架结构性
   不存在；同值守卫（owner 未变零动作）。
㉓ harness 补 mock 缺口（这次的教训固化）：**官方推送节律模拟**（__HZ_FAKEOFFICIALTICK__：
按当前 owner 整包推送=游戏周期刷新同构；forceOwner 参数=野推送）+ **闪环回归断言**
（fg:no-flicker-loop：节律 3 拍+野推玩家背包 1 拍→必须零重拉命令——v1 实证 RED（drain=1），
v2 绿）；另修官方口径实证：**BagMsg 每包必带 bagItems**（官方 handler 每包 refresh(data.
bagItems||[])——缺省=清空背包格，v1 的 fuelItems-only 推送就是背包消失的另一路根因）。
harness **48/48**。

**九验收轮（作者定调：官方原生拖拽没问题=用法问题；参考烹饪/酿酒/背包，撤掉保底堆叠）**：
⑲ **架构改版：柜签=官方背包数据切换**——新增 C# 命令 `switchBag`：向 FuelGenerator iframe 注入
   官方形状 BagMsg（bagOwnerId=柜子/背包，bagItems 带 icon/name/count/burnable/burnValue——
   官方 mapItem/dropInterceptor/onItemHover 消费面）。此后**物品渲染、拖拽（含拖到燃料槽=官方
   FUEL_ADD）、柜内拖拽整理（官方 ITEM_MOVE 按 BagOwnerId=柜子执行）、左键 ITEM_CLICK 原生
   详情面板、悬浮热值 tooltip 全部官方代码路径**——与烹饪/酿酒柜签同机制（数据进官方格，交互
   零自定义）。mod 自定义交互全数退役：自绘格/自造拖拽（外部通道+保底网）/自造 tooltip/
   OpDetail 全删；仅保留作者定规的**右键=整叠直送发电机**（官方元素 el.id=itemId 直取+预检）
   与页签栏/底行/等高契约。失配自愈：官方刷新链（feed 后 RefreshBag 等）会推玩家背包数据→
   帧级 message 监听比对 bagOwnerId，失配防抖重发 switchBag（连续>5 次静默防风暴）。
   harness **47/47**（官方路径断言：switchBag 命令流/官方格渲染柜数据/左键→ITEM_CLICK 官方
   通道/官方 showFuelTip 悬浮/官方协调器拖拽→FUEL_ADD 捕获+mock 官方侧保真应用/满员门/
   回弹/重开柜签渲染）；旧 JS 跑新测试直接不兼容（RED=崩溃实证）。

**八验收轮（作者反馈：能拖起来，放不下去）**：
⑰ **放手链路纵深防御**：起拖时帧窗口挂**捕获相一次性 mouseup 保底**（dropNet）——用事件真实
落点路由 feed/take、幽灵兜底清理、drag-over 复位；与协调器自身 stopDrag（冒泡相）双路并行，
`FG.dragging` 幂等门保证只走一条——实机无论哪个环节吞掉协调器的放手事件，保底独立生效。
⑱ **料槽 drag-over 金框反馈**：官方页的拖拽悬停高亮只认它自己协调器的 isDragging（外部拖拽
对它不可见=拖到料槽无任何视觉响应=「放不下去」手感的一半）——拖拽中自挂 mousemove，可燃物
悬停料槽时切换官方 `.drag-over` 类（金框+暖底，与官方背包拖拽同观感），松手/移开即灭。
harness 49/49（drag-feed 增断言：drag-over 亮起+松手灭）。

**七验收轮（作者反馈：柜中物品无法拖拽）**：
⑯ **柜中物品拖拽**——走官方 webui-bag 协调器的**外部来源公共通道**（`beginExternalDrag`/
`onExternalDrop`，材料架行拖拽同款：官方幽灵/跟手/回弹动画全免实现，落点只回调不动数据）。
起拖=mousedown+6px 阈值；落点路由：**燃料槽区=整叠加油**（预检与右键同口径：非燃料/满员红字）、
其余落点=回弹（官方口径：不乐观移除，命令后数据回推重画）。协调器实例挂帧文档
（`defaultView.createBagDragCoordinator`，随文档销毁）；假配置袋供 slot 40/gap 6（空袋数组
ghost 按 50/4 默认=偏大）。对账：mod 柜格自初版起从未接过拖拽（官方协调器只绑官方背包格）——
非后续轮引入。harness **49/49**（drag-feed 幽灵出现+收场干净+feed 命令 / drag-bounce 回弹
零命令）；RED 回滚 1 红。

**六验收轮（作者反馈：缺滚动条/显示高度与其他界面有差异/超高柜怎么办——多次提醒后定位真相）**：
⑮ **对齐本 mod 自家滚动标准**：其他界面的「14 格半可见+滚动」=侧栏版式（railui.css 头部版式约束
   +plainSlotSync 官方等高契约，778 地板）。发电机左面板改**等高契约 fgSyncHeight**：高=778 地板
   +视口硬钳（与侧栏同数同义；不做 gen 跟随——gen 被 flex stretch 跟随本面板，量它=自激环，
   24 行实测锁进 1124px 实锤）；格区视窗=面板内 flex:1 滚动：**背包 18 行滚动显示、柜子任意高
   （>18 格同窗滚动到底、更短留白钉底）**——「扩容不越界」储物体验红线补齐。教训记录：我此前
   两轮误把参考标准当官方页面行为（官方页其实无背包滚动），作者提醒多次——其他界面=本 mod
   自身先例。harness **47/47**：新增 bag-viewport-scroll（18 行>视窗=滚动）+ **panel-matches-rail
   版式绑定断言**（发电机面板 ≡ 侧栏 sr-rail 同 778，跨帧实测——防再走样）+ zoom 归一读高
   （offsetHeight 在 body zoom 下被缩放，rail 实证）；RED 回滚 6 红。

**五验收轮（作者反馈：右键加料 2s+ / 悬浮无提示 / 左键详情应是原生面板——截图基准=官方背包侧）**：
⑪ **命令通道帧级化**：drain/Pump 从 0.5s Tick 提到每帧 FastPoll（drain 回调入队→下一帧 Pump
消化=端到端≈2 帧；原路径 drain@N 帧+Pump@N+0.5s=固定 0.5~1s 量化延迟，叠加官方刷新链=实机
2s+ 观感）。0.5s Tick 首位 Pump 保留（点完即关界面的存量命令兜底，双调用幂等）。
⑫ **悬浮提示=官方同款**：柜签燃料物品 hover 复用页面自带 #recipeTooltip（官方样式/定位算式
逐字：内容=物品名+热值两行、+15/zoom 跟随、**仅燃料显示**——官方 onItemHover burnValue>0 口径，
作者截图实证「鼠标悬浮提示，只有燃料有」）；移出物品/离开格区/切页签/拆除随手收。
⑬ **左键=游戏原生 ItemDetailPopup**：C# 新命令 detail——重放官方 Ac_ItemDetailPopup_OpenUI
（签名经 interop 元数据 MetadataLoadContext 反射取证：SendAction(ItemId,OwnerId,ItemConfigId,
Discount,TipsType,ShopShowHour,TimeScale,ShopConfigId,SourceFurnitureId,SourceRect×4)，
TipsType.UseByBag=2=背包侧查看口径；官方 ITEM_CLICK 链路只认页面背包态物品、柜中物品到不了
Unity 侧，故走 mod 命令；官方开面板动作重放先例=Ac_OpenUI/uiShow）。
⑭ 夹具纠偏：icfg 燃料尾列 14+2 直拼=burnable 落 14 位、burnValue 丢（火苗角标靠真值碰巧亮、
热值恒 —）——照 brew 先例补 uses 占位对齐 C# 真 17 列行。harness **46/46**（新增 detail 命令
断言+官方 tooltip 内容/仅燃料/移出即隐断言；RED：旧 JS 2 红）。

**四验收轮交互归位（作者实机反馈：柜签物品只能左键移动、右键无反应）**：
⑩ 柜签物品交互改**官方移动规则**（页面 hint「右键 / Shift+点击 快速转移 · 点击查看详情」同口径）：
**右键 或 Shift+左键 = 整组送入发电机**（含预检：非燃料→「只能添加燃料」、满员→「燃油槽已满」；
contextmenu preventDefault 吞浏览器菜单，rail srBody 同款）；**左键 = 查看详情**（物品名×数量+
热值+操作提示，复用 #srfgWarn 节点换中性暖色 .srfg-info、2.6s 自隐——绝对悬浮不占布局，高锁
稳定）。对账实锤：原功能提交（459ba38）起就只挂左键 click=喂料、右键从未实现——最初交互设计
错误，非修复轮引入。harness ⑤ 重写（左键详情零命令/右键 feed/Shift+左键 feed/右键非燃料警示）
+⑥ 满员门改右键派发，**45/45**。

**三验收轮根修（作者截图定位：重开后页签栏只剩「背包」、柜签全消失）**：
⑨ **tabSig/sig 跨文档残留**——游戏重开面板=新 iframe（Root.html 状态广播注释实锤「面板重开=新
iframe+新 PAGE_READY」）；装配防观察器环的清单签名守卫 `FG.tabSig` 跨文档不清零，新文档首填时
签名与旧文档相同→判「无变化」→**新文档 #srfgScroll 永不首填**（柜签消失），同病 `FG.sig` 使柜格
永不渲染。首次打开正常（JS 状态全新）＝「只有首次打开才显示」的完整解释。修：fgTeardown 清零
两签名缓存；快路径在位判定改四件全查（tabs/body/warn/foot 任缺=走全量重装，防半装配陷阱）。
harness 断言补盲（此前重开只查「页签栏存在」不数柜签=漏检根因）：重开后页签清单全量+柜签可点
渲染+两复现床柜签计数——RED 实锤旧代码重开后清单=`bag`、柜签 1/8（与实机截图一致），修复后
**43/43** 全绿。

**二验收轮追加修复（作者实机反馈三项+一项质询改版）**：
⑤ 页签栏居中——上轮误引官方 Cooking `.bag-tabs` 的 `align-self:center`（Cooking 收缩居中
观感）；本页应与其他界面/原型 v6 一致=**整行左起满宽**，回退该属性。
⑥ 柜格物品图标压缩变小——mod 格图标 26px 定值内联，官方格是 **100% 填充+contain**（mapItem
同款）；改官方同款内联，柜签图标与背包签逐像素一致。
⑦ 二次打开页签栏不显示——harness 按 Root.html 真实时序（同文档 display 关/开+心跳重推+
re-nudge、及重载变体）均无法复现（自愈链在）；加固：fgSettle 发现「页签不在而燃料数据在」
时**当次 setData 即回装**（FRAMES 直查当前 bagtabs 帧走全装配，不再单等 500ms interval/
观察器路）；若实机仍复现，看 BepInEx 控制台有无 `[CERail] bagtabs mounted: FuelGenerator`
即可定位死在哪条路。
⑧ 「固定高度与其他界面一致吗」——质询成立：旧锁=右 gen 面板自然高（本页比他界面矮一截、
背包被压缩滚动）；改 **锁=官方背包格全高**（grid.scrollHeight+面板其他部分；只在背包页签
量取、跨页签恒定、同值守卫）——背包 18 行整幅直显不滚动、与 Cooking 等界面同观感同缩放，
柜签高于背包内部滚动、更短留白钉底；`.srfg-sys` 断 stretch 退役（不再量 gen），警示行
`.srfg-warn` 改绝对悬浮（不占流——锁跨「有/无警示」两态恒定）；锁=面板自然高后系统高不再
被锁改变，④ 的 zoom 滞留问题随之结构性消失。

**修复（作者实机验收反馈四项，全部根因=旧静态夹具「一帧全量渲染」掩掉的时序/装配缺陷）**：
① ‹› 翻页按钮不显示——`is-visible` 溢出门在燃料柜少时永不显形；改**常驻可见+端点禁用**
（官方 Cooking `.tab-scroll-btn:disabled` 同式），页签栏样式逐值对齐官方 `.bag-tabs`
（stretch/margin 6/居中收缩/smooth 滚动）。② 高柜无滚动条、格区溢出界面外——旧一次性高度锁
在官方渐进渲染竞态里漏锁（`#srfgBody` 无定高→`max-height:100%` 无解）；改 **fgLockHeight
每轮 settle 自愈复核**（同值守卫防观察器环）+ `.srfg-on > .grid-container` 官方背包格同入
滚动（18 行真实背包在锁定面板内滚，官方拖拽 ghost 挂 body 不受滚动容器裁剪）。③ 一键整理
按钮跑左——JS 只挂 id 未挂 `.srfg-foot` 类，无 `justify-content:flex-end`；补类+双选择器兜底。
④ 调整背包高度后重开页签栏不可见——两重根因：一次性 **px 宽锁**量进官方渐进渲染中间态
（官方格仅随首包 BagMsg 才渲染，量取时机不定）→ 改 **CSS min-width 结构锁**（calc 官方页
CSS 变量 12 列全宽，不测不锁）；官方 `createViewportFit` 在 BagMsg 时量 `.generator-system`
（早于装配）→ 调高背包后整对话框被压到 ~0.78 缩放且不复原——装配锁高/拆除时**补发 resize**
促官方 `_fit` 复测（zoom 复位 1）。另断官方 `align-items:stretch`（`.srfg-sys`，随拆随清）
防背包格先渲染把右 gen 面板拉高、高度锁量进拉伸值。

- 夹具重建：`fixtures/FuelGenerator.html` = **webui_src 官方页逐字节原样**（webui-core/webui-bag
  经 serve.cjs 三级解析回源 vendor 快照）+ 3 行遥测 id 桥——官方渐进渲染（格空→BagMsg 首渲
  12×N）、`createViewportFit` 缩放、`backpack.resize` 全为真实时序；旧自绘最小 handler 夹具
  是四缺陷全数漏检的根因。root harness 增 `__HZ_FGNUDGE__`（ready 自动投 BagMsg 开关）/
  `__HZ_FGROWS__`（背包行数=实机「调整背包高度」旋钮）。
- harness-fuelgen **48/48**（九验收官方路径断言+十验收闪环回归）（31 旧断言全绿 + 新增：foot-right 右贴 / arrows-always 常驻+端点
  禁用 / tall-ctn-scroll 20 行高柜内部滚动零溢出 / bag-full-height 背包整幅直显+高锁=背包全高+跨签恒定 /
  race-empty-wait+late-mount-sane 数据晚到装配 / reopen-bagheight 24 行重开页签可见+锁随行数长 /
  reopen-samedoc-tabs+reopen-reload-tabs=Root 真实时序同文档关开与重载变体）。
  **RED 对账**：首轮回滚两修复文件 7 断言红（四缺陷逐一命中+宽锁/拉伸/zoom 滞留）；二轮再回滚
  4 断言红（gen 高锁压背包 399px 滚动=「与他界面不一致」实证）。修复后全绿。
- 回归：brew-tier 27/27、switch-cabinet 27/27、tagfilter 15/15、width-floor 13/13、
  native-width 8/8、sbtrack 全绿（并行会话成果无扰）；mount/store-all/regression/tidy 失败
  为基线旧病（二十三批已对账记录，非本批引入）。

### 待发版·二十三批（2026-11-07，酿酒桶界面 酒品品质角标 + 饱腹排序收敛）

**新功能**：酿酒桶（BrewPanel）页排序菜单收敛两项（`⊞默认 / 🍗饱腹度`）；选饱腹度后物品格右上角
显示**双层角标 = 饱腹数值 + 品质色角标**（劣绿/普黄/烈粉——游戏 BrewPanel 品质条三档同源色），
排序规则改**品质主键：烈→普→劣→不可酿垫底，同品质内饱腹高在前**。作者底线：只动该页排序按钮/
排序规则/角标显示三处，其余 11 界面观感与行为零变化（spec 隔离论证 + harness 对照断言）。

- 品质机制（游戏侧实证，spec §2）：发酵品质 = 原料「心态密度」(Σ心态/Σ饱腹) 对两条全局阈值
  三段（<P1 劣 / P1~P2 普 / ≥P2 烈）；单件口径 = s2/s1（RailSortMath 实例+天赋口径，与饱腹
  角标同源）；桶内聚合公式（Σ假设）留实机一步验证（结论只进 spec，不影响代码）。
- 契约：icfg 页专属尾列 canBrew（仅 BrewPanel 页推送，fuelCols 同纪律：**禁止**从 Category==1
  推导——官方判定是物品级 Config_Item.CanBrew；独立缓存 _icfgBrewCache 分键防串形）+
  ctx 直推 brewP1/brewP2（GameKey.GlobalSetting_Brew_TierMoodDensityP1/P2，try/catch 缺省
  0/0.5=官方界面兜底；P2≤P1 时 JS 同守卫回兜底）。
- JS：normIcfg.bw（按行宽判形恰 16 列——与 fuel 尾列 17 列页无关互斥）/ dispRows 行补 cfgId /
  brewTierOf(row)→-1|0|1|2（排序比较器与角标共用）/ makeSortMenu keys 函数化（仅页脚实例
  传函数，工具行 SORTS/NB 数组路径零改动）/ dispApply 比较器 brew+sat 分支（其他页逐字节
  不变）/ 角标绘制行追加 .sr-tier span（与数值同一条下标直配链，不另起 join）。
- harness：harness-brew-tier.cjs **27/27**（§1 契约形状+三档+阈值兜底 / §2 菜单两项+NB·Cooking
  7 项对照 / §3 品质主键序+Cooking 纯饱腹序对照 / §4 双层角标逐件色值+重推重建+默认序清层+
  Cooking 无品质对照）；夹具 railui-root-harness 增 __HZ_BREWP1__/P2__ 旋钮+brew 页 icfg 尾列
  分支（14 列冻结基座补 [uses 占位,canBrew]=C# 真 16 列形状）。
- 已知（非本批引入，基线 4b8af09 同病对账）：harness-regression 16 PASS+MaterialRack 等待超时、
  harness-mount 26 FAIL（720px 旧宽度期望族对现行 max-content 壳的遗留失配；switch-cabinet
  27/27 绿反证装配链健康）。
- **v14.1 复测增补（同日）**：①排序径独立——brew 饱腹序专属 `dispApplyBrewSat`（公共比较器
  零分支），只有可酿参与排序，不可酿（含非食物/无契约行）**置灰遮罩+无数值角标**
  （.sr-brewdim pointer-events:none 官方交互零遮挡）；②**闪烁/悬停失效根修（公共缺陷）**：
  dispApply grid 路径 renderItems 无条件执行→MO 回调→再渲染=50ms 级自激环（实测 brew 736
  变更/800ms、Cooking 976），节点逐拍重建吃掉悬停/点击——改 `wrote` 门控（vue 路径同纪律），
  修后双页 800ms 零变更。harness 增 §5（34/34：置灰 id 集/角标 id 集/序保持/静止性/官方序复原/
  Cooking 对照）。

### 待发版·二十二批（2026-11-07，燃油发电机界面柜子页签——bagtabs 装配模式）

**新功能**：燃油发电机界面左侧背包面板页签化（背包 + 带「燃料」官方标签[1013]的柜子），点柜中燃料
**整组直送**发电机燃料队列（与官方从背包加油完全同口径：非燃料→「只能添加燃料」、满员→「燃油槽已满」）。
作者底线：右侧发电机面板零改动；官方左面板 DOM 只隐藏不 detach；家中无燃料标签柜时界面与原版一致。

- 装配=bagtabs 新模式（SCENES.host=null 不替换宿主/无侧栏壳）：#srfgTabs（背包 pinned+‹› 滚动+
  A/D 双绑去重）/ #srfgBody（mod 柜格复用官方格类，12 列定宽、格区限高滚动）/ #srfgWarn（官方
  warning-box 同款观感）/ #srfgFoot（仅一键整理，所有页签都有；无一键入库）。面板宽锁死官方
  12 列格宽、高=右面板自然高。
- 数据/命令全复用 CERail：FuelGenerator 进场景表（icfg 本页尾列 [burnable,burnValue]，其他 12 页
  契约形状不变）；新命令 feed{owner,item} 两跳=柜→背包→官方 FUEL_ADD（含叠并重解析：背包已有
  同 cfg 叠时按 ItemConfigId 重找目标叠）；拒绝四路 notfuel/full/bagfull/noitem 经 ctx.feedFail
  一次性回执。v1 只走两跳（S1 直达=官方动作认柜中物品，待实证后独立优化）。
- cfg：[Access] EnableFuelGen（默认 true）+ [Scenario] View_FuelGenerator（默认 Fuel）。
- 夹具/harness：fixtures/FuelGenerator.html（官方页静态保真）+ railui-root-harness 13 iframe +
  harness-fuelgen.cjs 28 断言（含无燃料柜=原版、宽锁、键不泄漏、feedFail 四路）。
- 教训：bagtabs 观察器纪律三条（签名守卫/拆除重建门/同值守卫）——innerHTML 串比较与 active 类
  修正永不相等=自激环 59 万写/秒渲染器暴毙（harness 挂死根因，双根修）。
- 已知（非本批引入，HEAD 基线即红）：harness-regression/harness-tidy 两套 TimeoutError（本批前后
  失败集合 diff=零差异）；native-width 8/8、width-floor 13/13、fuelgen 28/28 绿。

### 待发版·二十一批（2026-11-06，材料架页签机器页黑块根修——官方 rack 行视图宿主入壳）

**作者实报：材料架在工作台/无人机交易/调度机队（实测连粉碎机）页签选中后内容区整片黑，
底部计数（如 89/240 格）与页签高亮俱在——数据在、渲染空。**

- **根因（结构缺口，非近批引入）**：材料架页签=官方**行视图**（webui-rackrows 分行取物，非
  网格）。四页官方页 JS（Shredder/GreenhouseBuild `renderCartView`、ToolTable `isRack` 分支、
  DroneHub `applyLeftView`、Trade `bag.isRack` v-show）在页签激活时**藏官方格、显 rack 行视图
  宿主**（`#cartRack`/`#rack-rows`/`#bagRackWrap`/袋列 `.rack-view`）。而 v1.8.3「机器界面简化」
  的壳替换只 reparent 了官方格与页签栏——rack 宿主随宿主子树脱文档（cart 三页再吃隐藏桩），
  =「格被官方藏 + 行视图不可见」→ 内容区黑。v1.7.0（tagfilter 不动官方面板）时代材料架在机器页
  正常，v1.8.4 发版起即为坏态；十八批抽屉页签进三页让页签区更受检视，作者首次点到即曝光。
- **修复（官方件 reparent，与页签栏 v1.8.7 同款哲学）**：
  - SCENES 五页补 `rack` 字段（宿主选择器；Trade 类选择器在**宿主域**解析防误取无人机列
    .rack-view），mount 在替换宿主前取引用、随官方格进 `.sr-gridhost`（DOM 序恒 [grid, rack]）；
    stubs 列表同步摘除 rack 件（真节点在文档=桩自愈不建）。官方切页直切两件 inline display，
    行拖拽/右键取1/锁定/取出最多/落点预览全原生。
  - DroneHub 特例：官方藏格写的是**包格容器** `#bagGridWrap`（桩保留吸写），入壳的 `#bagGrid`
    不在包内=藏格不达——railui.css 增 `:has(#bagRackWrap.on)` 镜像藏真格。
  - 配套三处鲁棒性：`syncRailWidth` 改量 gridhost 内**首个可见件**（rack 常态 display:none，
    激活时反转——壳宽跟随 rack 行视图）；滚动指示轨 ready 门补可见性判定（rack 宿主非 sr 前缀
    会骗过「非 mod 层」谓词，同 badge 层被骗家族）；`ensureRackInSlot` 周期对账入槽
    （ensureTabsInSlot 同语义；类选择器形态不盲查、交宿主复活重解析）。
- 材料架专属页（MaterialRack 整理柜三段壳）与背包页不涉（无 rack 页签/行视图路径），零改动。
- 教训入档：**壳替换清单必须覆盖官方页的「互斥视图族」**——同一容器位有多套官方视图（格/行）
  时，只搬常见路径=另一路径激活即黑；扫描依据=官方页 JS 的显示切换分支（renderCartView 族），
  而非仅首屏可见件。

### 待发版·十九批（2026-11-06，native 页壳宽地板撤除——背包/柜子界面右侧黑块修复）

**作者实报：背包与柜子界面右侧都多一块黑色空白区域，交易/烹饪等 rail 页没有。**

- **根因**：十七批给 native 背包页（BackpackUI）NATIVE_BP_CSS 追加的
  `.grid-container{min-width:UNI_W*56+18}` 用了**错页几何**——「+18=内边距 9×2」是 rail 机器页
  （webui-bag cfg.padding 9）的量测，native BackpackUI 页官方 `.grid-container` inline 宽=
  `cols*56` 整、**容器零内边距**（fixture `gridContainerStyle` 实证：CELL=56）。后果：min-width
  690px 对 12 列格（官方 672px）恒超宽 18px，窄袋（背包本体/后备箱页签/材料架等未直写容器）
  超宽更多——格床右侧露出 `.grid-container` 自身 `--grid-frame-bg` 暗底=黑色空白块；rail 页地板
  是**首见实测宽自标定**（零魔数）故无此病，与症状分布（交易/烹饪页正常）一一对应。
- **修复**：`ensureNativeBp` 整段撤除 min-width 注入，回 v1.8.10 纯官方宽（native 模式本旨=
  官方页整页原生）。native 页各面板独占一袋、无 rail 切页签缩放场景（A 侧背包/后备箱多页签
  官方自有 `aSlotStyle` 按 maxCols 垫宽），地板在此零收益；rail 页地板（自标定）不动。
  data-uw 对账保留：旧版已注入 '690' 的活页一次重写清除（幂等零写）。
- **教训入档**：跨页家族复用几何常数前先对页取证——「同款」两个字把机器页的 padding 带进了
  零 padding 的 Vue 原生页；rail 侧同功能零魔数自标定（十七批主实现）之所以稳，正因它不依赖
  任何页几何假设。
- harness：新增 `harness-native-width.cjs` **8/8**（BackpackUI 夹具 gridCols=10 窄袋最大化暴露：
  注入体无 min-width 行/computed min-width=auto/offsetWidth=572 未垫 690/旧 '690' 注入体活迁移
  重写清除）；回归 width-floor 13/13、switch-cabinet 27/27、sbtrack ALL PASS、mount 154/167
  （13 FAIL 为 HEAD 既有 size 期望漂移，stash 复跑逐条一致实锤，非本轮引入）。

### 待发版·十八批（2026-11-06，抽屉终案——误判返工+备料格退场+抽屉进交易/粉碎机页签）

**作者对齐终案（三轮实测对话定谳）：「工作台抽屉」=全局包 5010[8×5]/5012[8×6]/5013[8×7] 三档
升级链、不挂任何家具（Config_Furniture 零引用实锤）、全工作台共享互通（作者实测「四台抽屉通」
+鸡蛋实验）。十七批把「工具台/自制工具台家具的 1010 包」当抽屉=误判——1010 家具包实为**制作
备料区**（每件独立、页签可见=直达功能误收，v1.8.4 热修「工作台材料容器」措辞即指它）。**

- **返工**：DrawerWidthEngine 整链退役（克隆包/换绑/Harmony 前缀/每帧门/清扫/黑名单条目）；
  被换绑的工具台备料包随配置表换档重建自然回原宽。
- **抽屉宽度（终案实现=三行直写）**：三档包入 SizeEngine 目标集（RailUi.DrawerBagIds——抽屉
  非家具不走 AllContainers，显式补入；无共包/零家具引用/不在任何黑名单，宽随 [Rail]
  UniformBagWidth、高/档位不动；换档重读 5s 幂等收敛）。
- **备料格退场**：工作台族 9 配置（工具台 405/80158+自制工具台 313/80033/80164+工具桌
  322/323/414/436/444/445/448）入 ExcludeFurnitureIds 默认值+活 cfg 同步——备料区是内部机制
  非储物柜，从**全部**机器页签/筛选/白名单退出（纸箱 307-309 同 1010 包但真储物，保留）。
- **抽屉页签注入（DrawerTabs.cs 新文件）**：抽屉补进 **无人机交易+粉碎机+调度机队** 三页签
  （作者令，无人机交易全手动=页签即够）——Trade BagTabs（POCO 平字段，cols/rows 取当前档位）
  +Shredder CartTabs +DroneHub BagTabs（R3.ReactiveProperty 族，TabInjector bag×4 构造同款）
  尾插+Repush；0.5s 轮询幂等。
- **抽屉冷启动注册（终案机制）**：owner=WorkbenchDrawerConfig.DrawerOwnerId 常量直读；BagCache/
  OwnerCache 懒登记（游戏仅在工作台首开时经 ItemManager.SyncWorkbenchDrawerToRedux() 转发装配）
  → mod 在三页 UI 打开后**直调同一公开函数**（游戏自家装配：天赋推档+物品行一次到位，零手搓；
  WishManager 有非工作台调用先例；读档窗口期零重活=触发纪律，3 次尝试上限）——不开工作台直达。
  （返工史在案：agent 扫描镜像方案已证伪弃用——抽屉无实体，物品在读档期即入 ItemManager。）
  owner 发现=扫 BagCache 取 value∈三档（档位无关，缓存逐轮复核跨换档自愈；发现不了=页签
  缺席零崩溃）。免剪豁免：TabGate「未知 owner 永不剪」纪律天然放行；cart 族 Index 重排自动
  维护位次。纯视图层：零配置写/零存档写/卸载重开即消。
- harness 回归：width-floor 13/13 维持（JS 零改动）。
- 教训入档（十七批三条实机修正保留在案）：①「三路全覆盖」假设必须以实挂计数为准；②兜底层
  不因「理论上已被覆盖」而退役；③**身份取证优先于机制取证**——本轮翻车根因=把备料格认成抽屉，
  机制全对、对象全错。

### 待发版·十七批（2026-11-06，工作台抽屉换绑 12 列克隆包 + 壳宽 uniformWidth 地板——切页签零缩放终局）

**作者缺陷链：抽屉 6 列=工作台页 背包(12)/抽屉(6)/柜子(12) 切换缩放变形；1010 共包（染料桶原料槽/
纸箱/工具台桌）直改即染料桶变形（11-01 已否）；拍板=自制工具台(313/80033/80164)换绑专用克隆包
99001010（[w×1010原高]，1010 一字不动），零过渡帧（不接受 5s 自愈窗口）+ 追加壳宽地板保险层
（漏网窄柜两侧留白不缩放）。设计定稿 docs/superpowers/specs/2026-11-05-drawer-12col-rebind-design.md
（builder-check 四问闭环：Rail 总门/宽度跟进入早退门/地板 cfg 联动/克隆包入 ModShared 黑名单）。**

- **DrawerWidthEngine（RailUi.cs，SizeEngine 并列）**：克隆包入 `_Config_Bag_Dict`（**新 List 实例**
  防 1010 连坐红线；碰撞检查=占用且形状不符即停用告警）+ 家具 BagId 换绑（FridgeChill 改 ColdRate
  同款内存直写）+ 宽度入早退门（cfg 改值含收缩 ≤帧级重同步，与 SizeEngine 活改柜宽同语义）。
  取证（build 26454866 反汇编，spec C1-C9）：三条家具生成路**现场读** furnConfig.BagId→OnInit→
  AddCache 注册 BagCache；GetBagData/CanPlaceItemForMove 视图与拖放校验同源 BagCache→Config_Bag.Size；
  RA_SetBag add-if-missing（重指不被覆盖）；AgentSave 无包 id 字段（存档中立，卸载回原生——x≥6 物品
  在原版 6 列视图不可见=SizeEngine 同类已拍板代价）；官方换袋先例=ApplyCargoBag。
- **三层驱动（零闪烁）**：①每帧门（AccessTicker，抢在存档家具生成波前，稳态一次 bool 读）
  ②**Harmony 前缀挂 Furniture.Initialize 全重载**（反射枚举按名解析不写 RVA；前缀体在 body 读
  配置前幂等换绑——同帧竞态也零窗口；恒 return true 只前置不吞调用；RefreshCoalescer 先例）
  ③5s 兜底清扫（RefreshMeta 尾 SizeEngine 同位=继承 Rail 门；在场实例 SetBagConfigId+BagCache
  重指，含次序护栏防指空包；无地图过滤场景侧同收敛）。总门=[Rail] Enable（与 SizeEngine 同停，
  防止「柜子原生宽+抽屉 12」的错位复现）。
- **契约 v4 增补 ctx.uniformWidth**（bagCap 同款：JS 读取先行缺省 12，C# BuildJson 直推；**0=off
  也落地**=地板停用信号）：壳宽地板=railui.page.js syncRailWidth 首见 uniformWidth 列**自标定**
  本页 W12（自动吸收各页 slot 几何，零魔法常数）→ 壳宽=max(跟随宽, 地板)：窄柜居中留白
  （.sr-gridhost flex 居中在位+锁 margin 已清）、>目标宽仍可长胖永不裁格；值变/场景切换失效重标
  （入 ST_KEYS 场景快照，重访免重标定）。cols 信号=dispModel 优先+**DOM 计列兜底**
  （computed gridTemplateColumns——ToolTable 类页面 webui-bag 实例是全局 const 绑定，for-in window
  扫描不可见；顺带实锤 v1.8.10 排序在同因下 ToolTable 页疑似静默死，既有缺陷待另修）。native 背包页
  NATIVE_BP_CSS 同款 `.grid-container{min-width:UNI_W*56+18}`（值随契约，0=不注入）。
- **ModShared 黑名单 +99001010**（DefaultResizeExcludeIds：兄弟扩容 mod 勿改克隆包宽=防打架）。
- harness：新增 `harness-width-floor.cjs` **13/13**（RED 先行 7 红：标定/窄柜不缩/居中对称/末列不裁/
  14 重标定/hold/off 回纯跟随/跨页自标定——Review Focus 1-4 逐条钉死）；回归 mount=13 既知基线
  无新增、sbtrack ALL PASS、switch-cabinet 27/27；**harness-regression 3 FAIL+1 超时为 HEAD 既有**
  （stash 复跑实锤，mock 数据/夹具漂移待作者自理）。
- **实机修正（2026-11-06 作者复测「抽屉仍 6 列」+「页面固定宽度已生效」）**：前缀实挂 ×1
  （Furniture 实有**七个** Initialize 重载——dump 实证含存档加载路 `Initialize(GameSaveData,GameMode)`
  与 protected 路；代理单层 DeclaredOnly 只见 1，存档家具生成走漏网路=实例链仍 1010）+ 清扫
  「前缀已挂即跳过」早退赌注不成立。修两件：①前缀枚举沿基类链逐层收集去重（×N 全重载，单重载
  Patch 失败不拦其余）②清扫撤早退**常开幂等**（在场实例最终一致层——SetBagConfigId+BagCache
  重指幂等零日志，当前存档 ≤5s 自愈；补 General 热关门）。教训入档：三路全覆盖的假设必须以
  实挂计数为准，兜底层不因「理论上已被覆盖」而退役。
- **实机修正二轮（同日，作者复测「还是 6 列」+截图）**：前缀 ×3/3、配置换绑成功、但在场清扫
  **零命中**（无「组件重绑」行）+ 家中 26 柜实拍清单只有**工具台**×1 无自制工具台——换绑目标
  换错了家具：作者实际使用的工作台=**工具台 405/80158**（同为 1010 共包），首发只收了
  自制工具台 313/80033/80164。修=WorkbenchFurnitureIds 扩为五变体（405/80158/313/80033/80164）。
  副作用（口径内）：工具台是入选柜子（进页签），换绑后其柜签视图随包 12×6（柜宽统一语义，
  容量 36→72）；染料桶/纸箱/工具桌仍 1010 零触碰。另实锤：读档重开会重建配置表（二行换绑
  日志=世界重绑后克隆包重建），佐证终审 B 的复位前提。

- 实机验收=spec §7 十一条（重点：读档立即开工作台首帧 12 列零闪烁/染料桶原料槽 6×6 原样/
  cfg 改 14 跟进/[Rail] Enable=false 会话零换绑/卸载回 6 列）。

### 待发版·十六批（2026-11-05，柜宽统一漏无人机中控台——宽度与 Access 排除解耦，白名单直进目标集）

**作者缺陷单：「无人机中控台柜子的宽度不是 12。」**

- **根因**：中控台（家具 9080，独占包 BagId 1009）被**两层**挡在 SizeEngine 目标集外——
  ① AllContainers 扫描门槛（CabinetCatalog.RefreshHomeInstances 廉价门槛行）见
  ExcludeBagIds/代码 NonStorageBagIds 任一名单即跳过，1009 两名单都在（2026-10-15 A/D
  卡死闪烁、2026-10-17 误注入烹饪页签两道防线的**页签/筛选语义**）；② SizeEngine 自己的
  skip=同一 cfg ExcludeBagIds。即**柜宽政策搭了 Access 排除的便车**——与三批「冰箱
  kind 'f' 全漏」同病根（目标集派生口径太窄），中控台格宽保持官方原值≠12，在调度机队/
  无人机交易里与旁边 12 列柜子页签不齐。
- **修**：新 cfg `[Rail] SizeIncludeBagIds`（默认 `1009`）——**包含优先于排除共包**：白名单
  包即使在 skip 里也直进目标集；不在 AllContainers（被 Access 双名单挡在扫描门槛外）的
  功能包由 SizeEngine 补进目标（配置级直写：家中未摆放不生效于 UI，与 2003 场景侧共包
  同口径）。**页签/筛选语义零变化**——AllContainers/NonStorageBagIds/ExcludeBagIds 三处
  不动，中控台仍不进烹饪/工作台页签、标签筛选仍不隐藏其官方页签。
- **边界**：厨房电器/机器功能槽/门窗床/围栏等槽位语义包不进白名单（改宽即变形，染料桶/
  自制工具台 2026-11-01 实锤口径）；无人机货舱 1008 不默认收（作者仅报中控台，要统一往
  SizeIncludeBagIds 追加即可）。签名门含 targets，cfg 白名单改值 ≤5s 当场跟进、零重启。
- **日志口径**：SizeEngine 改写行/尾注同步「目标=家中柜子+冰箱+SizeIncludeBagIds 白名单，
  材料架不动；排除=……（白名单优先）」；政策头注（RailUi.cs SizeEngine 块）补第 ④ 条。
- **验证**：dotnet build 0 错（3 警告=存量基线：CS0108 Log 隐藏/CS0168 e 未用/CS0649
  _nowFallback）。实机验收点（待作者复测）：开调度机队/无人机交易，中控台官方页签格宽
  =12 与柜子页签对齐；日志出现 `1009(...)→12` 改写行；Access 侧无回归（中控台仍只在
  官方界面出现）。

### 待发版·十五批（2026-11-05，开机器页滚动指示轨「柜中间闪」根修——双层：CSS right 锚定 + 骨架期 ready 门）

**作者缺陷单：「打开工作台、烹饪、交易等界面时，柜子的滚动条会在柜子中间闪一下，
然后才会回到柜子右侧。」**（首修后作者复验：「还是中间闪一下再回位，只是闪的快了
一点，问题没那么明显了」——指向双层根因，第二层为本批补修。）

- **根因①（首层，已修）**：壳侧指示轨（sbMakeIndicator absolute 模式）水平定位原为
  paint() 写死 JS 像素 `left=offsetLeft+offsetWidth−9`，而 mount 流程里首绘必然早于
  冻宽——`bind()`（→paint 同步首绘，sr-body 空壳、rail 宽=CSS min-width 428）→ 官方格
  进壳 → `render()`→`syncRailWidth()` 把壳宽改写为格宽+24+sb（12 列≈704）。left 不随
  布局跟随、重绘又走 90ms 尾随防抖（v1.8.8 为吞官方 size-lock 瞬态设计）→ 变宽帧起
  轨在旧位 ~400px 停留 ≥90ms=**正好落在 704 宽柜子的正中间**，防抖到期才回右缘。
- **根因②（第二层，作者复验实锤）**：right 锚定只消掉「滞留 90ms」，但骨架期（格未
  进壳）rail 恒 428 窄壳、轨道站在 428 右缘≈**冻宽后 704 宽柜的正中间**——位置合法
  却错，冻宽帧同帧跳到新右缘=「跳的位移」（≈276px）本身可见=「闪得快了但还闪」。
- **修①（right 锚定）**：absolute（壳）水平定位改 CSS `right:15px` 锚定（创建 cssText
  常带；15=border1+padding10+留白4，与旧公式满宽布局下逐像素等价）——rail 变宽变窄
  浏览器同帧贴右；paint 删两路 left 写入（含不可达的 rect 差兜底）。当年「滚动条跑
  左边」实锤=left/right 双 auto 走静态位置，right 锚定（left:auto+right:N 公式定位）
  不受该坑。fixed 模式（srnSbTrack 原生页）不动：视口锚定必须量 rect。
- **修②（ready 门）**：sbMakeIndicator 增可选谓词 readyFn，paint 首行假=track 整体
  display:none；壳侧谓词=「srGridHost 内存在**非 mod 自建层**的子元素」（mod 层全带
  sr 前缀 id；#srBadgeLayer 也挂 srGridHost 内，Trade 的 Vue 格建得晚、badge 层可能
  先入壳，firstElementChild 判定会被骗过=门失效，夹具实测抓出）。骨架期轨道隐藏，
  格进壳（childList MO→90ms 防抖）后直接在正确位置现身——恒显轨语义=滚动位置反馈，
  格未进壳=无滚动可言，隐藏优于错位现身。格与宿主同批建（Trade v-if=ready 同款），
  mount 必然带格→门只在窗口期关闭，无「永不出现」回归。
- **验证（tools/railui-harness-tests/sbtrack-flash.cjs，修复 10/10 PASS；旧版 HEAD 同测
  5 FAIL）**：① 同帧跟随——rail 宽突变 +280px 后不重绘立即量 gap=rail右−track右 恒
  ≈15px，旧版 Trade 偏 172px/ToolTable 偏 52px=柜中间量级实锤；② 全程无闪帧——真实
  装配流 rAF 逐帧采样 1.5s 任意可见帧 gap 恒 15±1；③ ready 门——官方格移出壳（mod
  层留在壳内）250ms 后轨道必 display:none，格回壳 250ms 后现身且 gap≈15。回归：
  harness-mount 154/167 与 HEAD 基线逐条一致（13 个 size FAIL=宽度归一旧口径既有
  断言漂移，与本修无关）。

### 待发版·十四批（2026-11-05，首开页签闪烁根治——TabInjector.FastPoll 开界面瞬帧注入抢在官方首推之前）

**作者缺陷单：「刚打开界面时页签栏显示不完整，只显示一部分，会闪烁一下才显示完整。
刚打开时显示官方默认设计（例如烹饪只显示背包+冰箱），闪一下之后才加载柜子页签。」**

- **根因**：柜子页签注入走 0.5s 轮询——开界面后最多白等 500ms，官方首推 BagMsg 只带
  原生页签（背包+冰箱）先渲染一版，下一次轮询 Repush 才是注入后的全量=可见闪烁
  （2026-11-01「烹饪页签迟到」同源时序，当时只修了 JS 侧 TABS 变化重渲染，未动 C# 延迟）。
- **修（TabInjector.FastPoll，照 RailUi.FastPoll v1.8.9 Bug4 帧级快通道先例）**：
  每帧只做翻转/未决判定（SafeActive=layer 查询 ×4，廉价），命中才跑该 UI 全量注入——
  ①刚开的翻转帧：立即改完 BagTabs 并 Repush，抢在官方首推序列化之前落地（即便同帧
  竞态，两包间隔 ≤1 帧=不可感知）；②UiSession 新增 Pending：开界面后官方数组未建/
  未就绪（BagTabs 空）的窗口期每帧续查，数组就绪帧即注入（0.5s 门闩不再是首注入
  延迟源）；稳态活跃（WasActive 且非 Pending）零额外动作，重活仍归 0.5s 轮询。
  挂点=AccessTicker.Update（RefreshCoalescer.Flush 与 RailUi.FastPoll 之后的帧级序列）。
- **覆盖**：bag×4（烹饪/老鼠笼/酿酒桶/颜料桶）。TabGate/Pruner 管的页（工作台/粉碎机/
  温室/交易/调度机队）开界面时序未动（Material 视图移出原生冰箱若有同感闪烁，同模式可扩）。
- **回归**：dotnet build Release 0 错（3 警告均为存量）；注入通道/幂等门（s.Injected
  防重/Repush 条件）零改动——FastPoll 只是提前了既有 Poll 的执行时机。

### 待发版·十三批（2026-11-04，排序钮扩交易/调度机队 + 网格寻址根修 + 颜料桶撤钮）

**作者令：「将咱们的排序按钮与相关功能添加到烹饪、老鼠笼、酿酒桶、交易、调度机队、
口粮压制机界面。以上部分界面已经有排序按钮了，但是功能不可用。」**（后续补充症状：
数值不显示、有重新排序但无法确认对错；颜料桶「先去掉，我之后要想想怎么做」。）

- **根因（实机 CDP 取证，一击定案）**：DISP 显示层排序的模型适配器（dispModel）假设
  机器页网格全局名=`w.backpack`——实机各页变量名各不相同（官方源码逐页取证：
  Cooking/RatCage/ToolTable=`backpack`、Brew/Dye=`bagBag`、Compressor=`cartBag`、
  DroneHub=`bagGrid`；Trade 页无 webui-bag，tradeBagGrid 是纯 Vue v-for）。非
  `backpack` 页 dispModel 恒 null → dispApply 早退 → **排序+数值角标全链静默死**
  （显示层无失败路径、toast 恒报成功）——这就是「部分界面排序无效/数值不显示」。
  本地 harness 从未暴露：fixtures 恰好全部沿用 `backpack` 变量名（夹具保真缺口）。
- **修 ①（railui.page.js dispGridOf）**：grid 寻址改 **containerId 反向匹配**——
  webui-bag 实例公开 API `getContainerId()` 即 DOM 容器 id，扫帧 window 自有属性找
  `getContainerId()===SCENES.grid` 的实例（三重 API 校验防误命中），命中缓存
  `w.__srGridBy`（iframe 重载=新 window=缓存天然失效；null 也缓存不再扫）；
  `w.backpack` 降为 backpackGrid 页兜底。
- **修 ②（Trade vue 分支）**：dispModel 加 `family==='trade'` 分支——读
  `setupState.bag`（reactive，与 BackpackUI 原生页同路），items/cols/rows/ownerKey
  （字符串制）直取；写 x/y 响应式自渲染，角标下标直配同源。
- **扩容（SORT_KEYS，原 FOOD_KEYS 食品五设施）**：+Trade +DroneHub −DyePanel →
  烹饪/酿酒桶/老鼠笼/口粮压制机/交易/调度机队 六页统一挂页脚排序钮（FSORTS 7 项）；
  `isFoodScene()` 更名 `isSortScene()`（引用仅 badgeSpec/render 显隐门两处）。
  **颜料桶撤钮**（作者令：显隐门移出即藏，FSORTS/DISP 链保留供重设计）。
- **Trade 口径（与十批「去掉默认排序」令不冲突的收口）**：进页仍默认官方序（applyScene
  通用路，**不复活自动价值排序**、整理性能零回退）；页脚钮选维才重排；badgeSpec Trade
  分支改双态——官方序时金色交易价值角标**常显**（十批保留项不动），选维后改显所选维
  数值。
- **夹具保真修复（design-proto/railui-root-harness.html）**：Trade mock 行字段
  `itemId`→`id`——TradeUI handler 零转换（bag.items=parse(bagItemsJson)）、官方模板
  v-for/拖拽直用 it.id ⇒ 真实协议行字段=id；旧 mock 投 webui-bag 的 itemId 形状=
  it.id 恒 undefined（CERAIL join 全 miss 的假阴性源）。
- **追修（2026-11-05 作者实机复测「数值仍不显示」）——角标层被官方格整层盖住**：
  `#srBadgeLayer` z-index **5→50**（railui.css）。实机 CDP 实锤：DOM 46 个角标全部
  就位（+12 绿字、渲染几何正确、颜色/背景正常），但官方 webui-bag/Vue 格 `.item`
  自带 `z-index:10`——5 被物品格整层盖住=**画了看不见**；热注入 50 当场复现可见
  （裁剪格区截图 +12 肉眼可辨）后落源码，本地裁剪截图同步确认（+15 绿字黑底）。
  与 v1.8.5 十三轮 NB 侧 `#srnBadges` 5→50 同款终案（当年只修 NB 侧，机器页侧漏带）。
  教训入档：十三批首轮本地「七页全绿」只断言了 DOM 文本（layer.children/textContent），
  **视觉层叠从未断言**——elementFromPoint 也测不出（角标 pointer-events:none 被其
  跳过）；视觉回归=裁剪角标区截图判读（本轮已补双端各一张）。
- **再追修（同日作者复测「下拉列表不对，下面一大块」）——CSS 注释内「星号斜杠」
  序列吞规则**：railui.css 弹区注释写着「.sr-edit-*/」（十一批删容器菜单样式时的
  通配写法）——**注释正文里的 `*/` 提前闭合 CSS 注释**，尾段成裸文本把下一条规则
  `#srp .sr-pop{position:absolute...}` 整条吞掉（浏览器丢弃零报错）：弹层失
  absolute=掉进内容流（「下拉列表下面一大块」），`.sr-pop[hidden]` 起后续规则正常
  （CSS 错误恢复只吞一条）。**本地从未暴露**：fixtures 页面另有完整 `<link>` 双保险；
  实机纯靠注入（__CERAIL_CSS__ 单 style）=裸奔。修=注释改写不出现该序列（全文扫雷
  仅此一处；本追修注释初稿自己也踩了一次同雷——已改述为「星号斜杠」）。验证：
  CSSStyleSheet 独立解析 153→154 条（.sr-pop 回归）+ 本地注入式 CSSOM 含 .sr-pop、
  弹层 position:absolute、底距 rail 45px、悬于页脚钮上方。教训入档：**CSS 注释内
  禁现「星号斜杠」序列**（含通配收尾的类名列举）；注入式 CSS 的回归必须断言
  「注入 style 节点的 CSSOM 含关键 selector」——link 兜底会掩盖注入侧缺失。
- **三追修（同日作者复测「Trade 默认排序仍显数值 + 空柜子还有 - 显示」）——两条**：
  ①**Trade 官方序价值角标常显取消**（badgeSpec 删 Trade official 特例分支）：十批
  「金色价值角标保留」的语境是默认价值排序在排、角标显排序依据；排序退役后 official
  态常显价值=作者观感「残留的默认按价值排序还在生效」。收口=Trade 与其余六页完全
  统一——官方序无角标，选维才显示该维数值；render 的 Trade 模型 prime 分支随之失去
  消费者一并删除（官方序零模型开销）。②**选维态切空柜角标残留根修**（makeBadgeLayer
  零格早退路）：旧防御「瞬时零格不清角标」（防重渲染窗口闪空）把**真·空容器**也当
  窗口——切到 0 件柜时上一页签角标整层残留（作者实机「空柜子还有数值 - 显示」）。
  判据补位=模型同 0 件（dispApply 已随切柜重取模型）→ 清层；模型未就位或 >0（真窗口）
  仍保留上一次。回归（本地测试床）：Trade 官方序无角标层、选 value 角标 360/99 正常、
  bag.items 清空后（模拟空柜）cells=0 且层清空不残留。
- **四追修（同日作者重启后「排序按钮全不见+柜区展示不全+列数不对」——全局断流根因）**：
  实机 CDP 实锤链：JS 侧装配/bind/弹层全活（onclick 可用、弹层可开合），但 **store.ctx
  恒空**（currentId=0/标题空/render 全局早退于首门）→ C# 侧 Tick 活（drain 2/s 在取）但
  **setData 零调用**；日志只有读档时「快通道重推 61KB 下发」一包，之后门②（page 未变
  且签名未变）静默。**根因=推送 fire-and-forget（ExecuteJavaScript 无回执）**：读档时序
  窗口内首包被 WebView 静默丢弃，之后永不重试——所有 rail 页 render 早退、按钮保持初始
  hidden、unlockGridSize/syncRailWidth 不跑（size-lock margin 560px 残留=「柜区展示
  不全/列数观感不对」的下游）。**修=最小自愈**：C# 加零副作用 `ping` 命令（RailCommands
  Execute case，Pump 执行过即 ForceRepublish=rev 门控强制下周期重推）+ JS 心跳（装配
  在位而 store.ctx 空的窗口期每 5s 发 ping，数据到达即停）。断流为偶发（上会话 56KB 包
  正常、本会话 61KB 丢失——时序竞态非长度内容），自愈重推即愈；若后续复现「ping 后仍
  不达」再查 Vuplex 长包通道。
  【排查续记（同夜三轮实机重启）】①同一 dll 首次重启读档后**完全正常**（首包到达、
  currentId=背包实体）——断流非 dll 确定性回归；②复现一次「读档后零数据」但归因为
  **零界面死锁**（正常）：推送门①=AnyRailSceneActive（12 页全关=读档后未开任何界面）
  连 drain 都停 → JS 队列里的 uiShow/ping 积压无人取——**uiShow 只能在「已有界面活跃」
  时换界面，不能从零开界面**（ingame-matrix 先点 HUD 背包激活门的用意）；③作者报障
  会话「Trade 开着却 ctx 空+手动 ping 零回推」**机理仍无定论**（当时 drain 活/门①过/
  ping→Pump→ForceRepublish→BuildJson 链静态全通；ResolveBagOwner 对 Trade 走 PlayerId
  兜底亦通）——ping 自愈在真断流态的实效**未经实机证实**，待下次复现时保持界面开着
  CDP 现场抓 Pump/BuildJson 环节。调试 cfg（Verbose/AllowDebugUiShow）排查后已还原。
- **六追修（同日作者复现「按钮不可见/柜区不完整」保留现场——真凶落网）**：现场 CDP
  铁证三角：①drain（带回调 ExecuteJavaScript）2/s 稳定到达；②推送 setData（**单参无
  回调重载**）JS 钩 0 次零到达；③CDP 直注假包 JS 接收端当场生效——**根因=本机
  Vuplex/Il2Cpp 组合下 ExecuteJavaScript 单参重载静默丢弃**（bootstrap 早期窗口偶达=
  会话时好时坏假象）。修=推送与 bootstrap 注入统一改**带回调重载**（RailUi PushIfDue/
  探活注入两处；空回调命名方法 PushAck=与 _drainCb 同款 ConvertDelegate 模式）。
  **实机实证**：修复版重启→读档→开背包→**推送到达（JS 钩 1 次、currentId=背包实体、
  scene 正确）**——四追的 ping 自愈与六追的通道修复为双保险（通道修好后 ping 通常
  闲置）。附记：反复重启排查中游戏数次异常退出（非本 mod 代码路径：日志无异常栈、
  崩在读档初始化段；直启 exe 与 Steam 协议启动均出现过）——如作者日常游玩复现请知悉。
- **七追（终案收口——六追定性修正+到达延迟实测）**：作者以另一构建（13:30 版）复测
  「问题依旧」，现场复查发现**此前多轮「零到达」判读部分被延迟误导**：ping 微包实验
  实测 ExecuteJavaScript 到达存在**数秒级延迟波动**（~40B 微包 4.5s 读 0、后续读=1）——
  「单参重载静默丢弃」的定性过强（带回调双通道修复保留=无害且与实证兼容）；22:05 构建
  部署后数据链全通（大包到达、store 正常、作者界面确认正常收尾）。本轮沉淀：①ping
  升级为微包回执（OpPing 发 `__CERAIL__._pp(1)`，JS 侧 `_ppCount` 计数——通道诊断
  基建，后续断流可一键分辨「未发出/延迟/真丢失」）；②RailUi 暴露 ActiveWebView/
  PushAckCallback 供命令层复用。**断流终态判定：时好时坏的直接原因=推送到达延迟
  波动叠加门②签名静默（期间无重发）**——六追双通道+四追 ping 心跳重发已覆盖该窗口。
- **八追（同日复发会话现场诊断+断流终案修复：分片推送/陈旧心跳/回执看门狗/控制台转发/CDP 门/页签补挂根修）**：
  作者报障「排序按钮又丢了，概率性复现」，现场（游戏保持运行）逐步取证定案——
  ①**复发形态**：除背包（官方原生自足）外所有 rail 界面失效；按钮在但功能死；重开界面无效、重启游戏才好；期间纯 C# 子系统（TabInjector/TabGate/SizeEngine）全程正常；
  ②**日志盲区实锤**：OpPing 无日志、推送到达无回执、JS 侧异常只 warn 进 WebView 控制台（BepInEx 日志不可见）、「cfg 运行中改 5 秒生效」注释有误（BepInEx 不监听 cfg 外部修改，DumpFurniture/Verbose 双探针实测零触发）——四~七追轮番盲修的根因；
  ③**断流机理定案**：微包（探针 ~40B/心跳/drain）全通、大包（63KB setData）长时间丢弃、终有一片落地=「时好时坏+概率性」全解释；且旧心跳只覆盖「ctx 空」——首包到过之后断流（陈旧态：按钮亮=render 跑过、数据旧、命令打旧 owner 全废）心跳被静音 → 永不自愈 =「重开无效、重启才好」。
  修复六件（三条通道修复+三条可见化）：
  - **分片推送**（RailUi.PushIfDue + railui.page.js pushChunk）：大契约（>7.5KB）拆片下发，每片独立微包（原文子串 EscapeJs 装箱、JS 字面量解析即还原原文），JS 侧按**推送实例 pid（单调高水位）**寻址缓冲、计数齐片才重组 JSON.parse 进 setData；对任意乱序/重复/跨包迟到片幂等安全（node 模拟 400 轮：乱序/逆序/重复/丢片/交错全绿）。注：初判「ExecuteScript 乱序实锤」未获最终观测支持（部署版失败 100% 源于下述内容损坏），pid 高水位作为防御性设计保留。
    **【部署版当晚即暴露真凶——分片把静默失败变显式失败】**部署版开 Trade 后 CDP 45s 活捉：`分片重组失败 Unexpected token ','` 每 6s 一次 100% 复现——pid 修订后依旧 → 深挖字节（CDP 抓失败原文 65010B）→ **真凶=BuildJson 两处非法 JSON（非通道、非丢包）**：
    ①**tradePrefs**（RailSortMath.AppendTradePrefs）：Escape 是「带引号包装」的 JSON 引用器（返回 "名"），旧码在包装结果外再手拼 \" → `""食物""` 双重引号；且需求条目缺席（当日无热需分类）时 HalfValue 条目前导逗号悬空 → `[,`。产出 `"tradePrefs":[,[""食物"",-0.5]]`。**旧直推路径=整段 setData 脚本 JS 语法错误被 WebView 静默丢弃——四~八追「断流/大包丢弃/时好时坏」悬案的真正根因**；触发条件=当日交易带 prefs（交易需求按日轮换=「概率性复现」「重启才好」的全部来源；BuildJson 全页面无条件携带=「除背包（官方原生自足）外全界面失效」）。
    ②**lib**（RailData.AppendLib）：行尾逗号与行首分隔逗号叠加 → 行间 `,,`。旧直推路径按 JS 字面量求值=**合法数组空洞**（一直"能用"，JS normRows 兜底滤掉）——历史从未暴露；分片 commit 的 JSON.parse 严格拒绝 → 部署版全包报废=「按钮仍丢+一键整理提示背包是空的」（store 恒空走空数据分支）。
    修三件：AppendTradePrefs 改条目集 string.Join（引号包装语义只出自 Escape 一处，四分支形状 node 断言全 VALID）；AppendLib 改纯行首分隔（ctn/icfg/items 同款，尾部 Length-- 补丁随行尾逗号退役）；PushIfDue 加告警护栏（结构位 `,,`/`[,` 限频告警带现场片段——**告警不拦发**：字符串值内可合法含，严格校验归 JS 侧 JSON.parse；未来拼装 bug 从静默死变一行日志）。
    **历史定性修正（诚实记录）**：六追「单参重载静默丢弃」、七追「到达延迟波动」均为本内容 bug 的衍生观测——trade 状态好=包合法=通，坏=语法错误=零到达；40B 微包（探针/drain）恒为合法脚本故恒达；「时好时坏」=坏包好包随交易轮换交替的观测假象。当晚会话现场 JS 线程后段无响应，热补丁验证未走完即转入源码修复——实机验证待本版部署。
  - **心跳覆盖陈旧态**（railui.page.js）：判据从「ctx 空」扩为「ctx 空 **或** rail 在位且 >60s 无新包」（lastSetAt 于 setData 入口即记——包到达本身即通道活性证明）；空闲期代价 ≈65s 一包重推，兼作保活探针。
  - **页签补挂根修**（TabInjector.AddMissing）：去掉 s.Injected 防重门（官方 RefreshBag 重建 BagTabs 后注入条目消失、防重集残留 → 永不补挂=「顶部柜子页签栏不见了」；have=活数组实时判定即可防重，0.5s 轮询自然收敛）。
  - **推送回执看门狗**（RailUi.PushWatchdog）：已发未回执缺口 ≥6 且距最近回执 >10s（七追实证到达有数秒延迟波动，双条件防误报）→ 限频 10s 告警+ForceRepublish 维持重发压力（JS 假尸态心跳停摆时的 C# 侧独立保底）；缺口归零记恢复行（断流窗口时长可从日志读出）。86KB bootstrap 注入同入账本。
  - **WebView 控制台转发**（RailUi.HookConsole）：ConsoleMessageLogged 挂载（本机 Vuplex 版 API=ConsoleMessageEventArgs/Level/Source/Line，事件以 add_ 方法形态暴露），JS warn/error → BepInEx 日志 `[CERail][JS:lvl]`（级别+前缀去重防官方噪声）——v1.8.1「渲染异常半途抛出全页失联」类问题从不可见变一行日志。首版 ConvertDelegate(EventHandler<T>) 实机报「Parameter type at 0 has mismatched native type pointers」（泛型委托 object 参托管/Il2Cpp 身份不匹配）——改 Action<Il2CppSystem.Object, T> 签名转换（下会话启动日志验证挂载行；CDP 口是更强取证通道，本件为常开兜底）。
  - **CDP 取证门**（cfg [Rail] RemoteDebugPort 默认 0）：>0 时向 WebView2 附加 --remote-debugging-port（复用滚动条同款进程环境变量通道，独立于 ClassicWebViewScrollbars 开关）；下次复现浏览器开 http://127.0.0.1:端口/json 直连现场读 `__CERAIL__` 活态（store.rev/_ppCount/srFoodSort.hidden/FRAMES）。
  附带修正：DumpFurniture cfg 注释的「运行中改 cfg 约 5 秒生效」删除（实测不生效，需重启）。
  **排查过程与证据边界完整落档：`docs-cerail-outage-playbook.md`（断流排查手册）**——含
  因果链结论、已实证/未定案清单（大包丢弃的底层机理未定案=绕过而非修复）、复现现场
  操作步骤（保持现场连 CDP，勿重启）、判读表与验证标准（重启后没复现≠修好；结构性
  消除+自愈上界 ≤65s+可观测三条件结案）。下次复现先读该手册 §4。
  - **八追回归**：`node --check` 过；分片往返（EscapeJs 装箱→字面量解析→join→JSON.parse）
    在 node 以多语种/引号/反斜杠/代理对合成载荷 500 轮全通过；dotnet build 0 错。

- **回归**：`node --check` 过；本地测试床七页断言全绿——六页（Cooking/BrewPanel/
  RatCage/Compressor/Trade/DroneHub）排序钮可见+选 sat 后模型重排+角标数值
  （+15/+8）非递减、Trade 默认官方序+金色价值角标（360/99）常显+选 value 后 905
  (99) 重排至第二格（模型 x:1+DOM 59px+角标 99@110px 三点对齐）；DyePanel 钮隐藏。
  harness 套件与基线核对：switch-cabinet 27/27、tagfilter-gate 15/15 全过；mount
  宽度断言与 regression/tidy/store-all 超时=**改动前基线同败（存量，十二批记录
  13 个 width 断言基线同败同源）**，非本批引入。ingame-matrix 断言同步（FOOD 表→
  新集合：Trade/DroneHub 翻转 sortbtn、DyePanel 翻转 nosortbtn、trade:fsort 文案
  改「有排序钮、默认官方序」）。dotnet build 见发版记录。

### 待发版·十二批（2026-11-04，A/D 步进活动页签滚回可见区——官方零 scroll-into-view 的补链）

**作者缺陷单：「页签栏按 AD 键移动柜子，移动到后面当前选择的柜子没有显示了……预期应该
高亮并显示到页签上，而不是跑出页签栏之外。」**

- **根因（官方链取证）**：官方页签滚动唯一通道=手动 `<`/`>` 按钮（`scrollBy ±step`），
  `renderBagTabs` **零 scroll-into-view**——且每次 BagMsg 都 `innerHTML` 整体重建滚动
  容器内容，浏览器把 `scrollLeft` 钳回 0（手动滚过的位置一并丢）。原生场景页签=背包+
  冰箱一两个从不溢出，此洞从未暴露；mod 注入全柜后溢出常态化 → A/D 切到屏外页签
  无人回滚=「选中柜子消失在页签栏外」。
- **修（railui.page.js TABSCROLL 块，两个挂点）**：
  ①官方页签栏入槽（ensureTabsInSlot）即布 **MutationObserver**（childList 子树，
  iframe 自窗构造器——观察器不跨文档）→ 官方重建 → rAF 合帧回滚一次（burst 突变
  只滚一次，官方整表 innerHTML=一串突变）；②followActive 渲染后即时回滚（直发路）。
  回滚实现=slot 内自 active 页签向上走、**实际溢出即修**（官方滚动容器是
  overflow-x:hidden 程序滚动，按 auto/scroll 判会漏），只写该容器
  scrollLeft/scrollTop（矩形差+4px 边距，已可见=零写入幂等零抖动）；横向
  bag/trade/cart 与纵向 tt 竖列同路；钉住页签（背包位）在滚动容器外=天然空操作。
  零官方监听触碰（§0 红线）；scroll 写入不触发 childList 突变=观察器零自环。
- **回归**：`node --check` 过；harness 与改动前基线逐条一致——mount 154/167（13 个
  width 断言基线同败=存量）、switch-cabinet 27/27、tagfilter-gate 15/15，
  console/pageerror 全程零报错（新观察器零噪声）。

### 待发版·十一批（2026-11-04，页签行 100% 官方化收官——▾ 全部容器按钮与容器设置弹窗整链退役）

**作者令：「这个下拉菜单按钮有点大，且左边有一块空白，且跟页签栏其他按钮风格不一样……
没有好的建议就删掉。」**（自绘 30×30 半透明暗钮挂官方页签栏行尾=三大观感问题根源：
尺寸大于官方滚动钮/独立 flex 兄弟节点与官方栏右缘对不齐留空白/皮肤与官方件不一致。）

- **删什么**：行尾 `▾` 全部容器按钮（srAllCtn）及其整条菜单链——①▾ 菜单弹层
  （srCtnPop：按标签分组跳柜列表，单击切柜/双击开设置）；②容器设置弹窗（srCtnEdit：
  改名 ≤8 字 + 官方 26 标签分组多选，openEdit/renderEditTags/saveEdit 写 NAMES/CTAGS
  overlay + rename/setTags 命令）；③切柜统一出口 switchTo（▾ 菜单是最后调用者；
  切柜路径只剩官方原生页签：点击/A/D，rail 经 followActive 被动跟随）。
- **退役范围（整链五段，不留死代码）**：
  ①JS：RAIL_HTML 按钮+两弹层节点、bind 引用表八个 id、srAllCtn/srCtnPopBody/
  srEdit* 五路接线、closePops ctn/edit 两分支、document 豁免清单 srAllCtn 项、
  renderCtnPop/ctnItemHtml/openEdit/editTag2Html/renderEditTags/saveEdit、孤儿
  saveNames/saveCtnTags、st.editId/editTags 与 ST_KEYS 两键；
  ②CSS：.sr-allctn(:hover)/.sr-popctn(含 plain 锚点变体)/.sr-popedit/.sr-edit-lbl/
  .sr-edit-name(:focus)/.sr-edit-save(:hover)/.sr-ctnitem(.cur/.cin)；
  ③随带迁移：「确认入库」按钮原复用 .sr-edit-save 类 → 改专属 .sr-storego 同款规则；
  ④注释口径：文件头 T5 描述、bind 区、forgeSwitchTo 消费方等四处同步。
- **保留（数据零丢失）**：存量自定义名/自定义词 overlay（srp_ctn_names/srp_ctn_tags，
  loadNames/loadCtnTags 载入）只读生效——nm() 显示名、customTagsOf 标签视图/全库命中
  照旧；rename/setTags 命令契约（RailCommands/OpRename/OpSetTags/白名单）原样保留但
  UI 不可达；一键入库的标签路由（官方 SetRule 权威）不受影响。
- **行为变化**：柜子无法再改名/打标签（作者知悉选定）；跳柜=页签滚动+A/D；页签行
  成为纯官方页签栏 DOM（v1.8.7「页签区还原官方设计」收官，无 mod 元素残留）。
- **回归**：`node --check` railui.page.js 过；grep 全库 srAllCtn/srCtnPop/srCtnEdit/
  srEdit*/renderCtnPop/openEdit/switchTo 零活引用（余皆为退役说明注释）；dotnet build
  0 错（3 警告均为存量）；harness 实跑与改动前基线逐条一致——mount 154/167（13 个
  width 断言基线同败=旧版固定 720 宽口径过期）、switch-cabinet 27/27、tagfilter-gate
  15/15 全绿；regression 3 败+store-all/tidy 超时均基线复现（fixtures 存量），零回归。

### 待发版·十批（2026-11-04，Trade 默认价值排序退役——一键整理不再二次重排官方格）

**作者令：「把这个默认按交易价值排序的功能去掉，不要。」**（九批只删了展示条、保了排序；
本批把排序行为本身退役——八批排查实锤它是整理卡顿的帮凶：官方格每整理一次被重绘两遍。）

- **改动（三锚点全拆，railui.page.js）**：
  ①applyScene：`st.fsort` Trade 特例 'value' → 恒 'official'、`DISP.choice` Trade 特例
  'value' → 恒 null、`st.tradeSorted` 标志删除（每次渲染重抹路 isPlainScene 行对 Trade
  自然失效——fsort 恒 official 不触发）；
  ②render()：原「首包一次性 dispReapply('value')」块 → 换成 `!DISP.model 时 dispApply`
  一次性 prime（choice=null 路只设模型供角标 join，restore 早退=零排序零 x/y 写入零
  renderItems——**官方格重建从两遍回到一遍**）；
  ③注释与文件头口径同步（「Trade 默认价值排序 v1.8.9 退役」）。
- **保留**：金色交易价值角标照旧（badgeSpec Trade 分支不动，角标只做 id join 不动摆位）；
  食品五页页脚排序钮、NB 原生页排序钮是独立入口，不受影响。行为变化：交易页物品恒保持
  官方真实排布，整理后也不再被重排成价值序。
- **对整理延迟的意义**：八批四段拆解里的 ④「显示层重排+二次重绘」对 Trade 页归零；剩余 =
  官方 SORT 处理+官方格单遍重建（官方本体）+ 回推一包（快通道 ≤1 帧检出）+ 角标重画（一遍
  字符串拼接，便宜）。
- **回归**：`node --check` 过；ingame-matrix `trade:fsort` 断言翻转（'value'→'official'，
  文案「默认不排序（v1.8.9 退役）」）；harness mount/switch-cabinet/tagfilter-gate 与基线
  对齐（Trade 排序无自动化断言，零波及）。

### 待发版·九批（2026-11-04，交易页去两处冗余 UI——「全部柜子」下拉与「按交易价值排序」条退役）

**作者令：「无人机交易界面有一个全部柜子按钮，有时能看到有时看不到，很奇怪，把这个按钮
删了。没什么用。还有下面的按交易价值排序那一条也删了。」**

- **删什么**：①页签行右侧「全部柜子 ▾」筛选下拉（srFSel：按标签筛选柜子页签，v1.8.7 T4）——
  显隐随 Browser 视图/页签场景跳变=「有时能看到有时看不到」的观感玄学，切柜能力 ▾ 容器
  菜单已全覆盖；②其下方「按交易价值排序」虚线金条（srTrade 买家条，仅 Trade 页）——
  纯口径说明文案。**交易页默认按交易价值排序的行为与金色角标不变**（只删展示条，不删排序）。
- **退役范围（整链五段，不留死代码）**：
  ①JS：RAIL_HTML 按钮/弹层、bind 接线、renderFilterSel/pickFilterSel/filterOptions 等
  T4 函数区、render() 两处调用、applyScene 开页 setFilter 上报、引用表五个 id；
  ②CSS：.sr-fsel/.sr-fselpop/.sr-fselopt 与 .sr-tradeinfo/.ti-prefs/.ti-pref/.ti-mode；
  ③RailCommands：setFilter 分支+OpSetFilter+Cmd.Sel 字段+ToCmd sel 解析；
  ④TabGate：cerail_filter.json 持久化整块（FilterPath/LoadFilters/SaveFilter/SelValid）、
  SelMatch/SelActive/JudgeInstSel，Judge/RemoveUndesired 去 sel 参（Browser=全显恒真快路径），
  Trade 轮询收窄条件回归 `view != "Browser"`；
  ⑤TabInjector：bag×4 注入集 LoadFilters 读取与 sel 透传（Injectable 去 sel 参）。
  旧 `cerail_filter.json`（BepInEx 目录）与 `srp_filter_<scene>` localStorage 键无消费方，
  自然失效=此前若选过非「全部」筛选也不会再收窄页签（防「按钮删了页签回不来」陷阱）。
- **回归**：dotnet build 0 错（3 警告均为存量）；`node --check` railui.page.js 过；
  ingame-matrix 断言同步（trade:strip 买家条断言删除，trade:fsort 默认价值排序保留）。

### 待发版·八批（2026-11-04，一键整理响应提速——回推快通道 ≤1 帧检出 + 三段计时对账）

**作者反馈：「无人机交易界面进行一键整理，响应有点慢，感觉需要 2 秒以上。」**

- **排查结论（静态取证，链路分段）**：交易页（TradeUI）整理走**官方 SORT_BAG 事件**路
  （v1.8.2.4 起），C# 全程不经手，感知延迟由四段叠加：
  ①官方 SORT 处理+官方格重绘（官方本体，Bug3 时代已知「官方大网格重绘=卡顿主源」）；
  ②**mod 泵 0.5s 轮询量化**——回推靠 `ItemsDirty()` 全量逐物品签名比对，只在 0.5s Tick 跑，
  官方排序落地后最多白等 0.5s 才检出（交易页 SORT 走官方事件，C# 无从即时得知=本段必吃满）；
  ③BuildJson 全量契约拼装+ExecuteJavaScript 大字符串 marshal；
  ④JS 渲染段（交易页还有显示层价值排序重排+角标重画，官方格在一次整理里前后重绘两遍：
  官方序一遍+显示层序一遍）。
- **修复（快通道，治②）**：`RailData.StructureChangedFast()` 廉价结构签名——每 owner 只读
  1 次 `Count`（interop 跨界每帧数十次，远低于全量签名的逐物品扫描），叠数/owner 集一变即真；
  `RailUi.FastPoll()` 挂 `AccessTicker.Update` 每帧（`RefreshCoalescer.Flush` 同位），检出即走
  与 Tick 同一套推送尾（抽出 `PushIfDue` 共用，门②/BuildJson/Verbose 日志口径不变）。官方
  tidy 合并、搬运增删叠、拆分等「行数变化」类改动全部 **≤1 帧**检出重推，回推与差量 toast
  从「最多迟到 0.5s+」压到「≤1 帧+推包成本」；行数不变的改动（纯挪位/拾取并入已有叠/用掉
  部分）不触发，仍由 0.5s Tick 全量签名兜底=零回归。空闲成本：12 页 IsUIActive+每 owner
  一次 Count，无变化即退。`>150ms` 常驻打一行 `[CERail] 快通道重推`（Bug3 对账口径）。
- **诊断（防盲改，Bug3 分段计时同法）**：JS 侧 tidy 三段计时——`goTidy` 记 t0=点击、
  srBadgeMO 回调首见记 tMO=官方格重绘、setData 过空契约守卫记 tSet=契约回推到达；
  `settleXfer` tidy 分支出对账一行（console）：`[CERail] tidy 计时(JS)：点击→官方格重绘 Xms，
  →数据回推 Yms，→渲染完成 Zms（合计 Nms）`。快通道落地后若实机仍 2s+，该行直接指认
  剩余瓶颈在哪段（①=官方本体/④=渲染段），再对症。
- **回归**：dotnet build 0 错；`node --check` ×2 过；推送门②与 Tick 路径行为不变（PushIfDue
  为纯抽取）；JS harness 五套件与基线对齐仅毫秒噪声。

### 待发版·七批（2026-11-04，物品区滚动条常驻——切柜不再闪烁）

**作者令：「侧边滚动条改成固定显示，柜子高度不超上限时只是无法滚动，不要出现/消失闪烁。」**

- **根因（两轮）**：①壳物品区 `.sr-body` 为 `overflow-y:auto`——容纳即无滚动条，切柜时
  滚动条出现/消失 + `syncRailWidth` 的 sb 量测在 0↔滚动条宽间跳变（壳宽跟着跳）。
  ②首轮改 `overflow-y:scroll` 后实机仍闪（染料桶看似「彻底隐藏」、高柜页依旧闪烁）——
  **WebView2 Runtime 155+ 在 Win11 默认 fluent（悬浮式）滚动条：闲置自动隐藏、内容不溢出
  时完全不绘制**；且 Chromium 121+ 起 `scrollbar-width` 非 auto 会让 `::-webkit-scrollbar`
  自定义样式全部失效（railui.css 原有 8px 自定义滚动条自 WebView2 升级后一直没生效过）。
- **修复（第三轮=环境级关 fluent）**：第二轮 CSS（自定义经典接管）实机仍「轨道常驻但
  thumb 随切柜闪一下然后消失」=游戏 WebView2 的 fluent 渲染**无视页面 ::-webkit-scrollbar
  样式**（页面级 CSS 已到头）。终案：进程环境变量 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`
  注入 `--disable-features=msFluentScrollbars,…`（WebView2 loader 原生支持、只在游戏进程内
  生效、零落盘；已有 disable 列表则追加不覆盖；BepInEx chainloader 先于首块 WebView 环境
  创建，时序来得及）——fluent 关闭后 railui.css 的 8px 自定义经典滚动条接管：恒久绘制、
  永不自动隐藏、容纳时 thumb 顶格满长。cfg `[Rail] ClassicWebViewScrollbars`（默认开，
  改后需重启游戏）。
- **配套**：`.sr-body` 与 BackpackUI 原生页 `.grid-container` 去
  `scrollbar-width/scrollbar-color` 让 `::-webkit-scrollbar` 生效（自定义启用时该元素退出
  fluent：恒久绘制、槽宽恒 8px）+ `overflow-y:scroll`；轨道加浅色底（壳白 5%、原生页金
  10%）。`scrollbar-gutter:stable` 与原生页 content-box+padding-right:12px「滚动槽在官方宽
  之外」口径不变。EdgeCore 156 headful 实测 fit/溢出两态槽宽恒定恒绘。
- **修复（第五轮=自绘恒显指示轨，终案）**：第四轮纯静态条被作者判「滚了没反应」（滚动条
  不指示位置=需要滚动的柜子坏了）。终案：原生滚动条透明占位（槽宽恒 8px、滚轮滚动保留），
  **JS 自绘指示轨**（sbMakeIndicator）——轨道/thumb 常驻常色不出现不消失（消灭闪烁的
  「可见↔隐形」切换），thumb 长度/位置=滚动比例（找回位置反馈，容纳时满长同色可见）；
  更新通路=scroll 即绘 + 网格 MO/尺寸变化 90ms 尾随防抖（官方 size-lock margin 瞬态寿命
  1-2 帧≈16-33ms，90ms 后必已落定=瞬态不可见）+ ResizeObserver 兜底。壳侧 srSbTrack 绝对
  定位锚 #srRail（同缩放上下文全程布局像素；left 显式右锚=offsetLeft+offsetWidth−9，
  修「跑左边」——absolute 的 left:auto 走静态位置贴左缘）；BackpackUI 原生页 srnSbTrack
  fixed 贴视口（thumb 白 32%=与壳侧同色，作者令「颜色统一」v1.8.3 金色调退役；不动官方
  position）；官方 Vue 重建格节点=换 scroller 时自动解绑重绑；`.sr-body` 与原生页
  `.grid-container` 加 `overscroll-behavior:contain`（修「不超也能滚」=滚轮链到页面把
  整个面板推走）。harness 六套件失败名单与基线一致（存量 flaky），零新增失败。
- **诊断（防盲改）**：RailUi.Tick 新增一次性量测——首个 rail 场景挂出后从 Root 逐 iframe 量
  `.sr-body` 的 overflowY/滚动条占位 gap/是否溢出/style#srpRail 规则，回包记一行
  `[CERail] 滚动条诊断：srBody …`（LogOutput.log；判读：trackRule=1 且 gap≥8=自定义生效；
  trackRule=1 但 gap=0=fluent 仍接管；trackRule=0=CSS 未注入）。
- **回归**：harness 五套件与改动前基线对齐（仅毫秒计时噪声）；mount 既有 size 断言失败为
  存量问题与本次无关。syncRailWidth 的 sb 退化为常量（注释同步，MO 补量路径保留兜底）。

### 待发版·六批（2026-11-03，页签区还原官方设计——官方页签栏 DOM 原件 + 视图/排序状态层收口）

**作者令：「页签区还原为官方的设计。在保留官方原有功能的基础上添加我们自己的设计：
①标签拖拽移动顺序，不能影响 AD 左右移动；②储物柜直达，按场景在页签里显示对应柜子
（如烹饪=全部冰箱+食物标签柜）。不能影响官方原生功能：AD 切页签、拖物品到页签转柜。」**

**根因（作者报告「官方设计的部分原生功能不生效」）**：v1.8.x rail 宿主替换把官方页签栏
**销毁**（只留 display:none 桩）——①A/D 切页签是 C# `ContainerTabHotKey→RA_SwitchTabByKey`
（各面板"页签栏宽度>0"守卫，页签栏被桩后失效，rail 的 stepGuard 只是事后补救重定向）；
②拖物到页签是官方 `webui-tabdrop` 真件矩形命中（页签 DOM 销毁后全灭）。

- **T1 官方页签栏还原**：mount 不再销毁页签栏——官方页签栏 DOM 原件（SCENES.tabs 逐页
  指路：bag 族 `#bagTabs` / tt·cart 族 `.left-tabs` / 压制机 `#tabs` / 交易 `.bag-tabs`）
  reparent 进壳的 `#srTabs` 槽（buildStubs 前入槽→页签类桩自愈跳过；ensureTabsInSlot
  每周期兜底补挂）。自绘页签行（.sr-ctnbar/.sr-pinrow/renderCtnBar/bindPinDrag/
  pinnedCtns/savePinOrder）与 A/D 拦截层（stepGuard/releasePending/f.pending）整体退役。
  **A/D、点击切柜、active 高亮、滚动按钮、锁定态、拖物到页签=100% 官方原生链**。
- **T2 场景视图状态层收口（新 TabGate.cs）**：视图谓词（Food=冰箱+食物域柜 dim1-4 /
  Material=材料·工具柜+架 / Browser=全显）从「全量进数组+JS 藏显示」改为 **C# 对账**
  ——官方数组=可见集，A/D 官方步进天然只落可见页签，零拦截零弹回零闪烁（v1.7.0
  tagfilter 十七轮扣发工程让位，保留为 `[Rail] Enable=false` 回退通道）。覆盖：bag×4
  （TabInjector 注入集按视图过滤+移出不匹配原生条目，随移除解除会话防重标记）、
  ToolTable（Pruner 存量机制不动）、**DroneHub（BagTabs）/粉碎机·温室·压制机（CartTabs）
  /交易（BagTabs=List<BagTabEntry>，attr 制无下标耦合）**——活动页签本轮不剪、cart 族
  Index/ActiveTab 平移（pruner 同款舞步）、`[Filter] Enable` 关=全显零动作。
- **T3 页签拖拽排序（官方页签上的 HTML5 dnd）**：拖官方页签 → `pinOrder` →
  cerail_pinorder.json（页键扩到全十页）→ 各页轮询 ApplyOrder 重排官方数组+Repush →
  官方按新序重建（**A/D=数组邻居天然跟随新序**）。身份按族：Cooking=`_ownerId` /
  DroneHub·Trade=`data-owner` / RatCage·Brew·Dye·tt·cart=位序对 TABS 缓存；锁定页签
  不可拖；drop 按现 DOM 现算序（重渲染竞态防护）。localStorage `srp_pin_order` 读写路
  退役（C# 文件唯一权威；storeAll 路由序改读官方数组序）。
- **T4 Browser 下拉（标签筛选，状态层版）**：v1.7.0 下拉换轨——选中不再 JS DOM 隐藏，
  改 `setFilter` → cerail_filter.json → TabGate 按选中收窄（"0"=全部/"other"=未打标签/
  tagId，材料架自动匹配"材料"伪标签）；下拉 UI 进 rail 页签行（▾ 左侧，仅 Browser 视图
  tab 场景显示），选中按场景记忆（浏览器回显 + C# 文件权威，场景开启上报对齐）。
- **取证**：cart×3/DroneHub/Trade 状态类与字段全部 gamekb dump.cs 实证（Trade
  BagTabs@0x100=POCO 公有字段 owner/player/pin/rack…无 Index；DroneHub BagTabs 与烹饪族
  同构；cart 三页 ActiveTab/CartOwnerId 齐）。
- **回归**：mount harness **tabs 断言 40/40 全绿**（十页：官方页签栏在槽内+非桩+可见宽
  >0（=A/D 宽度守卫判据）+官方 BagMsg 渲染落槽+自绘行已退役）；switch-cabinet 驱动重接
  官方页签点击（**附录 A 六族签名全部由官方点击事件复现**，27/27）；tagfilter-gate
  15/15（回退通道无恙）；node --check×2、dotnet build 0 错。已知：Trade 为 Vue v-if 页，
  「装配后数据才到」的重建路径走脱离树（探针实证）——真机开页数据先于装配不触发，
  列 T14 实机校准点；store-all/tidy/regression 三驱动在改造前即环境性超时（新旧
  page.js 对照一致失败，与本次无关）。

### 待发版·五批（2026-11-03，排序钮扩全储物柜取用/整理界面 + 开柜闪钮根治）

**作者令：「排序按钮与功能复制到所有储物柜的取用与整理物资界面，位置左下角；只要排序
按钮（不入库）；材料架不做——行组件页无网格。」**

- **NB 原生页（BackpackUI）双侧装配**：
  - **柜侧新增仅排序钮**（`srnSortBtn2` 等 id 后缀 2）——**取用单柜 A 面板 / 整理物资
    B 面板（.is-storage）**两形态，官方 `.toolbar` 行首左缘同位（柜侧单钮
    `.srn-only` 自钉左缘）；📦一键入库**仅袋侧**（B键/整理物资 A 面板，id 沿用不变）。
  - **DISP 双实例化**（`makeDisp()` 工厂 + `DISP_CT` 柜侧实例）：整理物资双面板同屏
    **各自独立排序互不顶替**（袋按饱腹、柜按保质期同时成立）；全部 DISP 函数带实例参
    （机器页/rail 调用点显式传 `DISP`=行为零变化）；dropFilter 双实例取落点 owner 命中者。
  - `dispOwnerOf` vue 分支改**页面自带 ownerId 直取**（取用柜/背包实体/双背包 B 柜三形态
    都对——v1.8.5⑪「陈旧 owner」病灶同类根治）。
- **开柜「左下角排序钮闪一下就没了」根治（v1.8.4 起固有竞态，非尸体代码）**：装配判据
  从 `ctx.bpBag`（**上一包快照**，开取用柜瞬间滞后=true → 袋侧按钮对先装上柜面板、下包
  推到即摘=闪钮）改为**页面 Vue 真源**（`setupState.bagA/bagB.ownerId` 白名单柜判定；
  官方 ready 门保证面板出现时 ownerId 已绑定=当场可判零推送延迟）；兜底链=DOM chips
  （取用柜 canTag）→ ctx.bpBag → 保守袋侧。C# 零改动（bpBag 保留作兜底+签名）。
- **两枚连带 bug（双侧同节点复用暴露）**：① `dispRows` join 漏参 `itemsOf(DISP.owner)`
  （柜侧误 join 袋行=角标全 '-'+排序稳定不排）改 `itemsOf(D.owner)`；② solo↔取用翻转是
  **同面板节点换内容**（Vue 原地复用）——旧袋侧格观察器存活且 marker 共用（后到侧挂不上
  =settling 无人清角标恒空），且其回调拿 DISP(choice 空) 对现柜模型 dispRestore **回滚
  柜侧刚写的排序**。修=marker 按侧别（`__srnMO`/`__srnMO2`）+ 回调现验「本侧面板在场」。
- CSS：`#srnSortPop/#srnBadges` ID 选择器改类（`.srn-sortpop/.srn-badges`，双实例同规），
  markup id 仅作寻址；`makeBadgeLayer` 增 `layerCls`/`disp` 参数。
- harness：`harness-regression.cjs` 修活（playwright require 环境漂移兜底，tagfilter-gate
  同款）+ 新增 ①b 段 **13 断言全绿**（solo 双钮/取用柜侧装配+袋侧即摘（闪钮竞态钉死）/
  取用排序模型位+角标值/整理物资 A 双钮 B 仅排序/两侧独立排序+双侧角标/零控制台错）；
  tagfilter-gate 15/15；mount 既有 8 条夹具漂移与本次无关（基线对比确认）。既有 ①③ 段
  三条 FAIL（Cooking 文案/toast/网格）为夹具漂移（基线同败），② 段超时同前未动。
- 材料架（MaterialRack，行组件无网格）按作者拍板**不做**。

### 待发版·四批（2026-11-03，排序/角标复用化重构——行为零变化）

**背景：同一套「排序钮+弹层+应用+角标」在 railui.page.js 手搓了三份**（rail 工具行
srSortBtn / 机器页页脚 srFoodSort / NB 原生页 srnSortBtn），应用与角标各两份逐行雷同
（applyFsort/nbApplyFsort、applyBadges/nbBadges，连 toast 文案都是复制的）——修一处 bug
要同步改两三处。收敛为三件 prefab（**只复用行为**：markup/id/类名留在各页模板原处，
CSS 与 harness 契约零移动；玩家可见行为、外观、文案逐字节不变）：

- `makeSortMenu(cfg)`：排序钮+弹层（开合/渲染/标签亮金同步/委托选键选完即关）。
  三入口改为各传一份 cfg（键表 SORTS/FSORTS、皮肤类名、pre/onPick 回调）。
- `applyDispSort(key, cfg)`：显示层排序统一应用（合并 applyFsort/nbApplyFsort；Trade
  首包默认值/机器页渲染重抹走 `dispReapply`——非用户路径无 toast）。DISP 引擎本体
  （join→排→pack→写模型→还原）一直是单份，未动。
- `makeBadgeLayer(cfg)`：格子右上角数值角标（合并 applyBadges/nbBadges）；三道防抖
  （瞬时零格/配对未成保旧、同串免写）与 NB 的 -1/+1 像素微调、删层/空层清路原样参数化。
  观察器挂 MO 段收敛 `watchGrid(target, marker, opts, cb)`（50ms 防抖节拍不变；NB 500ms
  对齐节拍器与面板级观察器保留）。

- 删旧函数：sortLabel/renderSortPop/renderFootSortPop/footSortLabel/applyFsort/
  nbRenderSortPop/nbSortLabel/nbApplyFsort（净 -212/+203 行）。C# 侧（RailSortMath/
  RailCommands/sortBy）与 railui.css 零改动。
- 回归：node --check 过；本地 harness mount 114/127、tagfilter-gate 15/15、switch-cabinet
  与基线（重构前）逐条一致（mount 的 13 个 size FAIL 为 fixtures 环境固有，对照排除）；
  排序三入口交互冒烟 15/15（含 NB 点外收起、official 还原、toast 文案）；角标探针：
  选键后 8 格画 8 角标（值取 mock 真实饱腹 15）、还原后层清空、零 pageerror。
  实机建议跟一轮 ingame-matrix（排序相关页×动作矩阵）再发版。

**数值角标符号规则（作者 2026-11-03 口径，badgeTextFor 一处改动=机器页/NB 双路生效）：**

- 属性维（饱腹/心态/精力/生命）正值前带「+」（如 +15）；负值显实际数值（String 自带
  负号，如 -2）；无属性/0=「-」。交易价值=金额不带符号、保质期=daysText 文本，两键
  不进 +／- 规则（与列表模式 DYN 列同口径）。
- 排序口径确认不变（负值显实际数后需求自然成立）：正值降序 → 负值按数值降序 →
  无属性殿后；注入负值 mock 探针实证：s1=15/8/-1/-5/null×4 → 角标序列
  `["+15","+8","-1","-5","-","-","-","-"]` 全中，零 pageerror；排序冒烟 15/15 复跑通过。
- 属性门扩药物（作者实机报：兴奋剂 -10生命×3次无角标）：RailSortMath.Of 的 isFood(cat=1)
  → isFood||isDrug(cat=2)，药物同走「实例→配置」取值链与「弹窗数×剩余次数」算式；
  滋养（AE_CookDishNourish）改 cooked&&isFood 才叠——药物带时效效果也不吃烹饪天赋，
  恒 ×1（防天赋把药物数值乘歪）。

### 待发版·三批（2026-11-01 晚，作者复测：冰箱没进 12 / 柜子滚动条越界空白）

**缺陷「豪华版双门冰箱、冰柜宽度还不是 12」——SizeEngine 目标集漏冷链电器：**

- 根因：上一版目标集=HomeInstances（只有 kind 'c' 柜子）；冰箱是冷链电器 kind 'f'
  （IsElectrical+ElectricalType==1+ColdRate>0，与官方 CollectFridges 同判定）→ 冰箱包
  （1004/115000/115001/115005 族）全漏。作者家冰箱在 Cooking 页签可见（豪华版双门冰箱/
  冰柜/大容量冰柜）正是漏改的直观面。
- 修：目标集改扫 AllContainers，剔除 kind 'r'（材料架/货架：行式界面且原宽可 >12，收窄
  =砍容量，保持原宽）——柜子+冰箱统一 12；材料架若也要统一再拍板（说一声即加）。

**缺陷「柜子滚动条：能完整显示还要滚动条、往下滚全是空白、极限=页签最高柜」——官方
  createGridSizeLock 填充在壳内的越界暴露：**

- 机制（作者括号直觉逐字命中）：官方 webui-bag 的 createGridSizeLock（webui-bag.js@1211）
  seenRows/seenCols **只增不减**，hint=State.bagMaxRows=页签柜最高行 → 切到矮柜后格容器被
  上下 margin 撑到「见过的最高柜」（夹具复现：4 行柜 +552px）；壳内 sr-body 的滚动区随格
  容器外沿走 → 滚动越界全空白、且补边常让「本可完整显示」也出滚动条。
- 修：`unlockGridSize()`——壳内清零官方锁的格容器 margin（mount 首清 + ensureBadgeObserver
  50ms 跟清，官方每次 render 后 bagLock.apply 重写即被清）。清零后：滚动极限=当前柜真实
  行数；容纳即无滚动条（overflow:auto 原生语义）。安全性：官方拖放落点=容器实时
  getBoundingClientRect（margin 位移天然计入，webui-bag.js@387/406/446），清零不碰落点；
  锁内部只读 offsetWidth/Height（margin 是输出非输入），清零不污染锁状态；横向居中由
  .sr-gridhost flex 居中接管（缺陷#5 第三轮同款）。
- harness：v210（6 断言全绿，官方真页复现 mB=552px→清零→4 行无溢出/20 行滚动极限=自身
  936px）+红灯（手注 mB=552px 观察器 300ms 内清回 0）；v146 三条「量外沿补偿」时代断言
  更替为新契约（margin 恒 0、壳贴当前格宽、末列安全 +2 亚像素容差）13/13。

### 待发版·二批（2026-11-01 下午，作者缺陷单：交易页残留页/柜宽不齐/交易页签全空）

**缺陷#1「进交易界面偶尔显示开发期页面」+ #3「交易页签栏全空」——同根终修（v207/v208 实证）：**

- 根因（v1.8.3 引入）：`mount()` 尾部被误插 `if (mountedOk) return`——装配替换宿主后该判定恒真，
  每次 mount 都在**替换完宿主后早退**：`applyScene`/`render()` 被跳过，侧栏停留在骨架态
  （标题空/**页签栏全空**/plain 未应用=非 plain 的搜索/工具行可见=作者截到的「开发期页面」），
  只能等下一包 setData 才自愈；**Trade 浏览期物品零变化无推送 → 骨架卡死**（作者截图实锤）；
  机器页开页到首包间的 ~0.5s 骨架=「烹饪/酿酒开页闪一下」。快速路径本属于 ensureMountedFrame
  （mount 的前置检查），mount 内不留。
- 修：摘除误插行，装配即 `applyScene`+`render()`（数据先到也补渲染）；mount 建 rail 时对
  PLAIN_KEYS 页**即刻挂 plain 类**（首包前的骨架也按 plain 呈现，无非 plain 控件行闪烁）。
- 页签栏=1.7.0 语义恢复（背包固定首位+柜子平铺一行、点击=官方格切换，rail v12 定版样式）：
  修后 Trade 页签行=[背包]+柜子全量平铺（browser 视图），与 1.7.0 官方页签行为一致。
- harness：v207（12 断言全绿）——Trade 装配后**无第二包**即完整渲染/宿主复活（模拟 Vue 重建首列）
  重装配后**仍无新包**即恢复（旧码红=卡死骨架=作者复现径）/mount 直调返回 true/重访快照路；
  v208 实机 11/11——SizeEngine 6 包直写行、Cooking 实机装配即渲染（plain/pins=6/标题/搜索行隐），
  Trade 断言由 v207 离线官方模板覆盖（uiShow 重放页无数据流不建 .cols=游戏开页机制，v187 已知）。

**缺陷#2「柜宽没固定 12、有的宽有的窄」——SizeEngine 政策重写（v208 实机 6/6 包全改 12）：**

- 根因：v1.8.4 三道门里的「34 包改宽黑名单」（BagTable.DefaultResizeExcludeIds，口径=CabinetSize
  套件单源）把 **1062（通信设备独占包）**、**2003（纸箱/SUV/购物车共用包）** 整个挡住——作者令
  「不要依赖其他mod（扩容套件挨个退役）」，黑名单即「有的宽有的窄」直接根因（Config_Furniture
  实查：1062 仅通信设备一家使用；2003=SUV/购物车/纸箱子/材料堆/自行车共用）。
- 新政策：目标=家中柜子子集 HomeInstances 的包（不变）；排除=①cfg ExcludeBagIds（包级，作者维护）
  +②**家中在场**的排除家具（ExcludeFurnitureIds ∩ AllContainers）所占的包——机器共包守卫保留但
  由配置级全家具**收窄到家中在场**（染料桶/自制工具台原料槽 UI 嵌包格、改宽即变形，2026-11-01
  上午实锤；场景搜刮件不再连带挡宽）；**34 包套件黑名单退役不再引用**（ModShared 保留给其他 mod）。
- 改写方式：直写 `size[0]=12`（**勿用 RewriteSize mult 路**：want=原值×(目标/当前宽)，重跑时当前宽
  =已改值 → 想要值被弹回原宽（12↔16 振荡），v1.8.4 靠「每会话一次」掩盖）；幂等+签名门零日志快路径；
  由「每会话一次」改 **5s 周期重扫**（RefreshMeta 慢通道）——新放柜子/换档重读 ≤5s 收敛、cfg 改值
  当场跟进、异常轮不记签名下轮重试。
- 实机（v208）：`改写 6 包：1001 8→12、1003 8→12、1062(燃料仓/通信设备) 8→12、2003(纸箱/SUV)
  5→12、10009 10→12、110001 8→12`，零跳过、零套件黑名单引用。副作用（配置级宽度固有，作者令
  口径内）：与柜子共包的场景侧容器（场景纸箱子/材料堆/自行车等）同变 12 宽。

## 待发版（2026-11-01，缺陷单#1 排序 + #2 机器页页签；版本号待作者定）

**缺陷#1 排序——三轮重做，最终=ProjectCook 机制完整移植（显示层，真实摆放零触碰）：**

- 轮1（废弃）：数据层 sortBy（改真实 BagPos+官方刷新）——排序一次毁一次真实布局，且 solo 背包
  对 bag owner 重绑无效（官方格不随改写重渲染）＝「排序不生效」；位序角标随推送错配＝「数值变来变去」。
- 轮2（废弃）：DOM 直写 left/top——真实页坐标系与夹具不同（作者实机截图实锤：物品堆右下+溢出）。
- **轮3（本版）**：`railui.page.js` DISP 模块=ProjectCook page.js 机制移植——**改页面自己的数据模型
  让页面自己重渲染**：Vue 背包页=`#app setupState.bagA.items`（实机实证自带 cfgId/vd 实例值/
  shelfLifeDays/count，数值零 join 直取）；webui-bag 机器页=`w.backpack`（getItems/getConfig/
  renderItems，契约行按 (x,y,w,h) 真实位唯一键 join 取 RailSortMath 数值）。
  排序=order（无键排尾/保质升序/其余降序/稳定）+pack 首放 → 写模型 x/y；真实位快照挂 items 数组
  本体（数组身份变=官方刷新=自然重采——适配器对象存不住快照的坑实锤修）；默认=写回真实位。
  dropFilter（PC 移植）：排序态同容器拖动取消/跨容器重定向真实位 firstFree。观察器自愈重抹。
  角标=行绑定恒定（数值不随推送跳动）+模型-DOM 追平窗口期跳过（settling 门）。
- 数值口径（RailSortMath=ProjectCook 数值管线移植，喂机器页 join；Vue 页直接用页面自带 vd）；
  TimeLeft 单位定案=游戏小时（T14#3 关闭）。**C# 数据层 sortBy/lastSortAck 全套移除**（废弃逻辑清理）。
- harness：v138/v144 增**方向断言**（sat 降序首两格 15→8；shelf 升序 已过期→2天→3天→nulls 尾；
  角标按视觉序读取——层内追加序≠视觉序的断言坑实录）。
- **作者复测三修（同日第四轮）**：①solo 背包按钮不显示——页面 bagA.ownerId=背包实体 id（与
  PlayerId 不同 id 空间，实机 12884906630 vs 12884906565 实锤），旧「相等」判恒假误判取用单柜；
  BpBagDyn 改「A 侧非白名单容器即背包」；②触发钮标签随选中类型（饱腹/心态/…/默认=「排序」）
  +选中态亮金（nb 钮 srn-on / 页脚钮 on，作者缺陷#2 参考图口径）；③角标模型 zip 未成时恢复
  图标→icfg 配置级 stats 兜底（v1.8.3 实机路）+ console 诊断一行（治「数值完全不显示」）。
- **第十三轮·「选中/详情弹窗期数值不显示」三防线终修（作者实时配合观察器抓帧实锤）**：
  弹窗开着时角标层完好（L=64/valN=11）但看不见——①弹窗开=祖先 class 切换驱动格区压扁
  （格子 162×162→218×50 实测）→纯 CSS 回流不动格子内联样式→格子观察器静默→角标钉旧坐标；
  ②关弹窗复原同款静默→**直到点其他物品（类变更触发）才恢复**（作者描述分毫不差）；
  ③选中格白框层压过角标层（原 z-index:5）。修=三防线：#srnBadges z-index 5→50（选中态
  压不过，仍低于官方弹层 55/60）+ 面板级 class/style 观察器（祖先驱动的压扁/复原即时重算）
  + **500ms 对齐节拍器**（独立于装配循环，任何布局变化≤半秒自愈）。v206 harness：祖先
  class 切换挤压 50→218 宽，角标 0.8s 内 52→220 跟齐、复原回 52。
- **第十二轮 b·「读其他档就不行」换档竞态终修（校准行 owner≠PlayerId 实锤：43170 vs 79943）**：
  世界重绑复位后管线立刻重推，此刻 redux 树可能还带**上一档** PlayerId → 兜底把旧 pid
  缓存终身（if(_bagOwner>0)return 短路）→ 新档背包行永远按旧 owner 组装=空 →
  bagArr()=[] 角标层被摘。同档重读 PlayerId 不变故碰巧没事=「读原档可以」。修：兜底
  PlayerId 每次现读、变了就采用并打日志（owner 在签名里=变化即自动重推自愈）；读不到才
  回退旧缓存。日志新增「采用新值」行供作者会话直验。
- **第十二轮·「重读档后排序彻底失效/数值消失」同根终修（日志时间线实锤）**：作者会话
  rev1-2 → 退主菜单重读档 → rev3 → **全程静默**——重读档后 LogicWorld 换实例而泵的
  页沿/签名门全不翻 → 推送冻结在 rev3=**旧世界的物品 InstanceId** → 新世界模型 id 全
  miss → 排序键全 null（排序失效）+角标全空（数值消失），作者两报同根。修：泵每帧
  `CheckWorldRebind()`（LogicWorld 引用变即触发）→ `OnWorldRebind()` 按新开机复位
  （owner/校准位/签名/force 全清）+ `_lastPage=null`（首场景必推）；日志新增「世界重绑」
  行（作者会话直接可验：重读档后必有该行+紧跟推送恢复）。**附带修活第十一轮三零门死代码**
  （_last* 计数先赋值再比前包=恒假，空包照推——正确序=先比后存）。离线 122 断言全绿。
- **第十一轮·「点详情后数值消失」终修（实机日志实锤根因）**：作者会话日志出现
  `推送 rev=4 page=BackpackUI：容器 0，物品行 0，icfg 0` **三零空契约**——点详情/切页瞬间
  OwnerCache 空窗被当真数据推下来；JS 落地即走 `bagArr()=[]` 摘角标层分支 + 空把 ctx 触发
  进页沿把排序打回 official，下一笔真数据回来角标也不复活=「查看详情后数值消失」
  （选中物品白色边框为官方选中态，与角标无关——v200 实测弹窗全程层原样）。**两头堵**：
  ①C# BuildJson 三零+前包非空=瞬态不推（_forcePending 立即重试；T6 裁定 4 的正常空包
  ——bag 行在——不受影响）②JS setData 三零空契约不落地（保留上一包）。v202 harness
  5 断言：空包砸入排序/标签/角标层全保+真数据照收——**toggle 红灯验过**（关防护层即被摘
  L=-1=复现作者症状）。
- **第十轮终公式（游戏详情弹窗实机三连证+作者真档 5/5 全中；「没一个算对的」「数值都不
  显示了」收官）**：自起游戏载作者档、逐件左键开详情对数——**详情弹窗=vd 原值（包装食品）
  或 round(vd×(1+ΣAE_CookDishNourish))（熟食）**：红烧牛肉面 vd[25,3]→+25/+3、火腿肠
  [10,1]→+10/+1（零加成）；招牌盖饭(完美) vd[30.5,10,0,0,4]×1.15→+35/+12/+5（滋养 0.05×3）；
  作者「菌菇饭单次 28」=round(24×1.15)=27.6→28 实锤。第九轮整 PC Gain 管线叠过头（牛肉面
  25→45 错）——**终公式：角标=round(vd×(熟食?1+滋养:1))×UseTimes**（先舍入再乘=作者算式
  逐字）。实机 5/5：25/10/35×2=70/31×3=93；对账 60045=**[84,21,-,6]**（28×3）、60093=**
  [96,15,-,24]**（龙虎不再 '-'）。数值源 InstanceVD→Config ValueDisplay 兜底；FactorsNow
  仅取滋养（[因子]行留诊断）。
- **「数值都不显示了」根因=换存档后 owner 陈旧**（实机日志 12884906429→12884946683 实锤：
  itemsOf(旧容器 id)=空行→全 '-'）——`dispOwnerOf` 每次现解析（vue=store.bag 恒新、
  grid=ctnById 钉正后 currentId），DISP.owner 降为诊断展示。
- **作者线索终修·join 改物品 id 直配**（「开包后拖拽/一键整理再排序，数值=原位置物品的/
  全是 -，重开背包才恢复」）：契约行位置=开包时刻快照，拖拽后模型位置已变而契约未重推——
  按位置配对全错。改 `dispRows` **id（InstanceId）直配**、位置 join 降兜底（id 同空间实锤：
  官方拖拽 DRAG_ITEM 本就带同一 it.id 回 C#）。实机拖拽换位（不重推契约）复测数值跟物品
  （25→25）。离线 harness **117 断言全绿**（+v193 作者拖拽时序 7、+v195 换包 4——均 toggle
  红灯验过测试有效性；v196-v198 实机脚本入库：载档对数/弹窗对数/拖拽复测）。
- **属性角标第九轮终解（同日；「没一个算对的」根因=三连误读）**：ProjectCook 反编译
  `OneUse()` 命名实锤——**InstanceEffectEnd=单次使用值**（非总量）；详情弹窗的单次值=实例值经
  **天赋管线**（PC `EatLogic.EatValues`：实例×(1+滋养)×Gain(BasePermille/食材系天赋/高效营养/
  LifeDelta 难度；i=3 Fitness 跳过）——第六轮删管线、第七轮当总量再除 MaxUseTimes 皆误判。
  **终公式：角标 = EatValues(单次值) × UseTimes（剩余次数）**——山珍菌菇饭(完美) 实例[24,6,0,0,2]
  ×天赋=28/次 ×3 次=84；吃一口剩 1 次=28。天赋管线逐字回归（68fb926 版）+AddRatioIds 实锤
  （HotUpdate.dll 反编译：20001-20005=SatietyAdd/MoraleAdd/StaminaAdd/HealthAdd/VitalityAdd_Ratio）；
  新增 [因子]/[对账] 诊断日志（天赋签名变化一行；60045/60093 两份料理全链路数字入 BepInEx 日志，
  事后核对零作者负担）。
- **作者复测四修（同日第五轮）**：①悬停两物品间数值跳动——角标定位弃 getBoundingClientRect
  （悬停缩放=transform，视觉框抖）改 **offset 布局坐标**；②配对弃「位置序 zip」改**下标直配**
  （Vue v-for 不重排 DOM、webui-bag renderItems 同序——PC 原做法；位置序在悬停/弹层下失稳）；
  ③点详情数值消失——详情弹层临时节点致配对弃后**清空了角标层**，改「配对未成保留上一次内容」；
  ④保质期方向=**保质长的在前**（作者拍板，推翻照抄 PC 的快坏在前）；⑤交易价值补**使用损耗**
  （PC TradeUses：单价×剩余次数比×数量；icfg 行尾增 cfgUses 列）——多次使用食物/料理折旧。
- **作者复测五修（同日第六轮，口径终裁）**：①**数值源统一=契约 RailSortMath（实例效果×天赋=
  实际吃到口径=ProjectCook=详情弹层）**——背包页弃 vd（悬浮展示值≠实际，作者裁决「以详情为准」；
  两页全走 (x,y,w,h) 真实位 join，快照先于 join（换键重排用首排真实位）；②无保质期/无属性=
  **'-' + 排尾**（C# DaysLeftOf life<1→null；'—'→'-' 作者口径）；③瞬时零格/配对未成不清角标层
  （详情弹层窗口期）。

**缺陷#2 九机器页页签（同前，未再改动）：railCtns 按 v1.7.0 逐页语义收窄（ctx.view 视图谓词+TABS
官方成员门）+页签行全量平铺。**

## v1.8.4（2026-10-31）

**背包页 mod 按钮对：⇅排序 ▾ + 📦一键入库 回归原生背包页（作者缺陷单#1「背包界面缺失 排序、
一键入库 按钮」；UI-SPEC v13.9 §0a-4，原型三轮定稿「并入官方按钮行/放左边」）**：

- **BackpackUI 原生页（B 键单独背包 / 开柜双背包=整理物资）背包面板官方 `.toolbar` 行
  （一键丢弃/一键整理所在行）行首左缘插入两钮**（`margin-right:auto` 钉左缘、官方两钮
  保持右缘；基类=官方 `.action-btn` 同尺寸观感+金色点缀）；取用（单柜面板）与柜侧
  （is-storage）不装配。
- **⇅ 排序 ▾**：FSORTS 7 项弹层（v13.7 参考图样式，挂触发钮内 absolute 上弹）→
  `sortBy{owner:bag}` 数据层重排（C# 官方 SortContainerForHub/属性维降序管线复用，
  C# 零新增命令）；按 `srp_fsort_BackpackUI` 持久化；选完即关+同口径 toast。
  属性排序时背包格右上角**数值角标**（`#srnBadges` overlay：v1.8.3 applyBadges 同款
  双路匹配——.item id 精确/图标尾段唯一键→配置级维度，逐叠维度宁缺勿错；MutationObserver
  跟随官方重渲染，同串免写防回环）。
- **📦 一键入库**：§4.6/§4.7 全流程（空背包 toast 不弹窗；确认窗文案与主侧栏逐字同款；
  `storeAll{order}`；差量汇总 toast 走 toast() 原生页优先路由落本页 `#srnToast`——
  el 引用表残留上一 rail 页时不再写丢）。
- **C# 契约增补一字段**：`ctx.bpBag`（BackpackUI A 侧是否玩家背包：直读
  `State_Web_BackpackUI.OwnerId_A` 比对 ResolveBagOwner；B键单背包/双背包=true、
  取用单柜=false；未知保守 true）——JS 装配判据（负重条判据不成立：柜子也有负重）；
  签名门纳入（形态翻转即重推）；旧契约缺字段时 JS 兜底=头部分类 chips 判据。
- harness：新增 `v144-native-bp-buttons.cjs` 19 断言全绿（toolbar 挂载/左缘钉定/7 项弹层/
  sortBy owner=bag/角标双路/默认摘除/确认窗/storeAll 差量 toast/bpBag 摘与恢复/零控制台
  错）；夹具 `mk()` 增 cfg 参数（#v 图标尾段对齐 __HZ_ICOV__）；回归 v138 16/16、v182 17/17。
- 已部署 v1.8.4 → 游戏 plugins（旧版备份 .v1.8.3.bak）；实机验收见 v144 实机矩阵。
- **热修（同版）**：酿酒桶/机器页**一键整理后格子变小、右侧大片空白**（作者实测）——格区
  归一量宽用 `srGridHost.scrollWidth` 的反馈塌缩：v13.8 柜宽 12 列后网格(445)窄于
  UNI_W(700)，scrollWidth 读到上帧写死的宿主 width:700 → kk=1，每次数据回推都把 transform
  重置（16 列时代网格 896>700 溢出撑着 scrollWidth 故未暴露）。修复=量子格 offsetWidth
  （布局宽，transform 无关，帧间稳定）。harness `v145-gridscale-feedback` 6/6（缩放帧间
  稳定/tidy 两笔回推不缩/零控制台错）；回归 v144 19/19、v138 16/16、v182 17/17。
  版本号维持作者裁定（本次不自行 bump）。
- **热修（同版）**：机器页 rail **拖拽落点错位**（作者实测：瞄 A 格高亮 B 格、松手落 B 格）——
  格区 `transform:scale` 归一与官方落点判定互斥：官方换算 `(clientX-rect.left)/官方zoom/PAD/CELL`
  （BackpackUI.html @6384 cachedZoom 路）的除数不含我们的 scale，rect 却带着 → 光标→格子
  被放大 kk 倍，离格原点越远偏移越大。**撤除 scale 归一**（v1.8.2.2 十六列时代的视觉一致性
  机器，与 §0 红线「拖拽移动/落点预览一票否决」及 §2「mod 不改格子几何」冲突），格子回归
  官方原尺寸（对齐已批原型 12×34px 原生格）；壳宽=格自然宽+20，Bug2 只增不减锁保留
  （st.railMinW）。UNI_W 常量退役。v145 改新口径 6/6；回归 v144 19/19、v138 16/16、v182 17/17。
- **热修（同版）**：SizeEngine 柜宽统一**把染料桶原料槽、工作台材料容器一并改宽、界面变形**
  （作者实测）——根因=Config_Bag 配置级共包：染料桶(66196)/自制工具台(313/80033/80164) 与
  工具桌/工具台/杂物纸箱共用 1010，改柜子袋=改机器槽（日志「13/14 个柜宽已统一」实锤）；
  v1.8.3 又误拿 AllContainers（筛选收录名单：家里一切带包家具，含冰箱/材料架/被家具级排除的
  染料桶）当改宽目标，黑名单只抄 23 包（扩容 mod 是 34 包，1010/110007 等在漏网列）。
  修复三道门：① 目标集=真柜子子集 HomeInstances（冰箱/材料架/材料堆不碰）；② 剔
  `BagTable.DefaultResizeExcludeIds`（套件改宽黑名单 34 包**上收 ModShared 单源**，CabinetSize
  改为同源引用）；③ 共包守卫=包被 cfg ExcludeFurnitureIds 名单内家具使用即跳过。日志带
  跳过明细。取舍（作者认可）：共包柜子（工具桌/工具台/杂物纸箱/纸箱堆）维持官方原宽不凑
  12 列。版本号维持作者裁定（本次不自行 bump）。
- **调整（同版）**：载具 **1024购物塑料袋/1025购物车/1027小汽车/1028SUV 撤出默认排除名单**
  （作者 2026-11-01 令「不要加入排除名单」）——收录为柜子：家中摆放即进直达页签/筛选
  （自行车 1026、旧SUV 42033 仍排除，作者点名四个）。代码默认值+活 cfg 值同步改
  （BepInEx 已存条目不随默认值变，须改文件）。副作用核查：共包守卫/改宽黑名单不受影响
  （其家具袋 2003 仍被材料堆共包守卫与 34 包黑名单双重跳过，宽度维持官方原值）；真后备箱
  载具包 1021车筐/1022轿车后备箱/1023SUV+门口袋本就不在 CE 改宽范围（Config_Vehicle 侧，
  CabinetSize 停用后为原生尺寸）。版本号维持作者裁定。
- **热修（同版，缺陷#5）**：SizeEngine 三道门后共包柜回原宽、6/8/10/12/15 列并存，**有的
  界面柜子右侧一片空白、有的界面滚动条压格子**（作者实测+截图：染料桶页背包 117/396 滚动态）。
  根因两头：① 旧壳宽锁 `st.railMinW` 会话级只增不减且从不重置——看过宽格后切窄格，壳仍锁
  最大宽→窄格右侧空白；② 契约包先到 render 量旧宽、官方 BagMsg（新列数）后到→壳比格窄，
  sr-body 滚动条+overflow-x:hidden 啃末列（WebView2 经典滚动条≈8px 时溢出 12px>格区右
  内边距 9px）。修复=壳宽逻辑抽出 `syncRailWidth()` **纯跟随**（量官方格自身 offsetWidth
  ——e594832 已断反馈源，Bug2 只增不减锁退役；render 主路+badge MO 官方重渲染路双调、
  幂等零写防观察器回环、nat≤40 瞬时拆建防抖）+ 滚动条宽计入壳宽（格宽+20+sb，末列安全与
  滚动条粗细无关）。harness 新增 `v146-shell-width-follow` 7/7（初挂贴合/缩 6 列随缩空白消/
  长 12 列随长不溢/二次回推零抖/零控制台错）；回归 v145 6/6、v144 19/19、v138 16/16、
  v182 17/17。版本号维持作者裁定。
- **热修（同版，缺陷#5 第二轮）**：作者实测**工作台页滚动条遮格≈一格半**——官方 8 个机器页
  全用 `createGridSizeLock`（webui-bag.js@1211）把格容器钉在**见过的最大列数**：切窄柜时给
  格容器加左右 margin 补差（左 margin 把格区推右）。第一轮壳宽量 offsetWidth（不含
  margin）→ 壳比「格+左补边」窄 → 右侧整段滑进 overflow-x:hidden 被滚动条盖住（全 12 列
  时代差值恒 0 从未暴露；旧 JS 只增不减锁与官方锁同宽，把问题 accidental 藏住，撤锁后现形）。
  修复=壳宽改量**外沿宽**（offsetWidth+左右 margin）——官方锁保证外沿恒定（格区居中补边），
  壳跟外沿=跨页签稳定、零裁切。v146 扩到 9/9（新增：锁补边路必走 margin>0、外沿恒定壳稳定、
  lastCellR≤bodyRight-sb-1 末列零啃食断言=工作台缺陷直接回归）；回归 v145 6/6、v144 19/19、
  v138 16/16、v182 17/17。已部署。版本号维持作者裁定。
- **热修（同版，缺陷#5 第三轮）**：作者实测**工作台 12 列柜只显示 10 列半**——夹具复现实锤
  根因：ToolTable 类页面的官方格容器**无 inline 宽**（gridInlineW=null，块级）——在我们壳里
  block 拉伸=随父定宽（量宽照镜子），宿主又被写死宽度后切宽柜 → 格轨道溢出宿主被
  overflow-x:hidden 裁掉（复现数据：轨道右缘超 body 263px）。官方页里格容器在
  align-items:center 列 flex 中是 fit-content（随内容定宽）。修复三件：① 壳内 `.sr-gridhost`
  改**列 flex 居中**（railui.css，官方 .backpack-panel 同款语义）→ 格容器恢复 fit-content、
  官方锁补边回到设计语义；② **宿主宽度一律不写**（写=冻宽陷阱，历史残留清除）；③ 壳宽信用
  +20→+24（rail 内衬 20+两重边框 4 补齐——ToolTable 官方格无内边距，+20 下末列右缘被结构
  性啃 3px，Brew 类 9px 内边距页此前把它藏着）。v146 扩到 **13/13**（新增工作台复现场：
  6 列背包→12 列柜全列可见 lastCellR≤可视缘、宿主零冻宽、切回 6 列锁补边居中）；v145 宿主
  断言适配新语义；回归 v145 6/6、v144 19/19、v138 16/16、v182 17/17。已部署。版本号维持
  作者裁定。

## v1.8.3（2026-10-31）

**机器界面简化+设施排序+交易价值+柜宽 12 列（作者执行令「按照原型……执行吧」＝UI-SPEC v13.5-v13.8 §4.11）**：

- **9 个机器页侧栏 plain**（烹饪/酿酒桶/老鼠笼/粉碎机/食物压制器/颜料桶/工作台/
  无人机交易/调度机队）：头部两行/搜索行/快捷标签行/排序工具行/悬停条/「N 行」
  全部不显示；页脚=格数 + `📦 一键入库`（调到 `一键整理` 左，v13.6）；
  温室（GreenhouseBuild）在作者清单外，保持全 chrome。
- **食品五设施页脚左下角排序钮**（作者参考图样式 7 项：⊞默认/🍗饱腹/🧠心态/⚡精力/
  ❤️生命/💲交易价值/🕐保质期；选中金色；弹层 128px·按钮 26px 对齐控件基准）：
  排序走**数据层重排**（新命令 `sortBy{owner,key}`：official=官方 SortContainerForHub；
  属性=Config_Item.ValueDisplay1/2/3/5·value=TradeValue×Count·shelf=TimeLeft 降序 +
  12 列占用网格贪心首放 + `OnSetBagPos` 逐叠落位[异常回退 SetBagPosSafe]，私有方法
  interop 直调=tidy MergeStacksForHub 同款先例；Pump 末尾官方刷新渲染）。
- **格子右上角数值角标**（排属性时/交易页常显）：壳层 overlay `#srBadgeLayer`
  （挂自家 srGridHost、pointer-events:none、只读官方 .item 几何，零 addEventListener）；
  匹配同 display 过滤双路（.item id=logicId 精确 / 图标尾段唯一键→配置级维度）；
  逐叠维度（保质/价值）仅精确实例匹配，宁缺勿错；官方格重渲染由 MutationObserver
  （观察自家 host）跟随重算。
- **无人机交易默认按交易价值排序**（单价×数量；进页首包后一次性下发 sortBy value）；
  买家条在场显示排序口径——**品类加成数据源待实机校准**（ctx.tradePrefs 接入位已留，
  游戏内交易对象是否带品类价格修正待取证，接入后加成自动进计算与显示）。
- **柜宽统一 12 列**（作者拍板，取代 v1.8.2.2 临设 16 列）：新 cfg `[Rail] UniformBagWidth`
  （默认 12，0=off），SizeEngine 每会话一次把目录内全部柜子 Config_Bag.Size 宽改写
  （BagTable 内存表直写/幂等/原值记忆；高不变容量随之）。
- harness：新增 `v138-machine-sort.cjs` 16 断言全绿（plain chrome/7 项弹层/sortBy 命令/
  角标值/Trade 条/rack 不受扰/零控制台错）；t8 127/127（428→720 过时几何断言修齐 +
  tradeBagGrid reparent 语义对齐，均为先在漂移）；v182 17/17。已部署 v1.8.3 → 游戏
  plugins（旧版备份 .v1.8.3wip.bak）；**实机验收待开游戏**（重点：sortBy 官方格真实
  重排/角标跟随官方渲染/12 列落表/Trade 自动排序）。

**背包/取用/整理物资三界面转官方原生（作者执行令，原型 v13.2/v13.3 定稿＝UI-SPEC v13.4 §0a）**：

- **BackpackUI 页（B 键单独背包 / 开柜双背包=整理物资）不再装配 rail/plainbag**——
  官方页整页原生，此前挂在本页的跨柜页签/搜索/标签/排序/一键入库随 rail 一并不在
  本页出现（作者看原型定稿）；rackOpen/forge/官方 SORT 刷新机关无 rail 自休眠。
- mod 仅向该页注入 `style#srNativeBp`（幂等，iframe 重载重注）三点，全纯视图层：
  ①**格区高度滚动**（max-height:560+overflow+scrollbar-gutter，`content-box+
  padding-right:12px` 让滚动槽加在官方 inline 宽度之外——修「滚动条压格」：官方
  写死 width:cols*56px+border-box，滚动槽原从宽度里扣、格底轨道与 px 物品层被顶进
  滚动条底下；原型 live-sbfix 实证间隙≥2px）；②**柜侧隐负重条**
  （.bag-panel.is-storage .weight-section 隐藏——背包侧保留）；③**列数=官方数据
  原生**（Config_Bag：背包 12~15 列、柜 10~20 列；原型 mock 的统一 12 列需柜宽数据层
  改写＝存档级变更，A 重启用 CabinetSize/B 内建 SizeEngine 待作者拍板，本版不做
  视图层伪列防幻影格落点错乱）。
- MaterialRack（材料架）与机器页 10 页**维持 v1.8.2.5 不动**（plainbag/壳原样）；
  若需材料架页同样转原生，待作者示下（涉 rackOpen 落点改造，另一步 C#）。
- wrapRelay（active 跟随）对原生页不再包装（防 followActive 把本页 active 渲染进
  他帧残留 rail）；C#/数据契约零改动。

## v1.8.2.1（2026-10-31）

实机三缺陷修复（作者实测反馈，7 场景实机矩阵全绿后回归）：

- **Bug1 开柜只剩背包**：世界里开储物柜，游戏打开的"整理物资"界面=官方 BackpackUI
  **双背包形态**（A 袋|五按钮|B 柜，isDualBag=true）——v1.8.2 的 bagonly 壳把
  .backpack-container 整体替换只搬了 A 侧格，**B 侧柜与官方五按钮被吞**。修复：mount 按
  `.transfer-controls` 在场判定形态；dual=三段壳（左官方 A 袋 .bag-slot 原件 + 中官方
  .transfer-controls 五按钮原件 + 右 rail 壳带官方 B 侧 .bag-slot 进 srGridHost），
  柜签 forge SWITCH_BAG 切 B 侧（官方重渲染）；B 键单背包维持 bagonly。C# ctx.bagOnly=
  !State_Web_BackpackUI.IsDualBag 动态下推（签名纳入，翻转即重推）；形态出生即定
  （每开全新 iframe），mid-life 翻转=Vue 根列表重渲染会摘外来节点（页面固有行为，
  游戏不存在该路径），看门狗保留作尽力自愈。
- **Bug2 柜宽不齐/切柜变形**：①CabinetSize 档位与逐柜 Width 全部统一 **16 列**（容量差异
  只增高）——已直接改写游戏机 cfg；②壳宽**只增不减锁**：首帧按官方格宽锁定，遇更宽才扩、
  绝不回缩——切柜不再挤压变形/闪大片空白。
- **Bug3 一键整理卡顿 1-2s**：OpTidy 分段计时（sort/merge 各多少 ms）+ 命令泵重推耗时
  （>150ms 常驻打印）——下次实机一键整理即出对账日志定位瓶颈（官方排序/合并调用 vs
  33 容器全量重推），证据齐后对症优化。
- harness：v182-rack-accept 22/22（M2b 双背包翻转断言撤销=合成场景，实机走开柜路径验收）。

## v1.8.2（2026-10-31）

**全场景壳架构收口（UI-SPEC v13「动作保真总纲」版）**——作者总裁决：重构储物=改布局/导航，
物品格必须是官方 DOM 原件，官方动作（存/取/拖拽/使用/丢弃）保真是硬约束，验收一票否决：

- **整理柜三段壳+官方原件（v13 对 v11/v12 自研双面板/自绘格/复刻按钮三要素的显式推翻）**：
  官方 #rackSystem 整体移除，壳内**作用域容器继承 id=rackSystem+class=rack-system**（官方
  scoped 查询/groundDock/createViewportFit 测量/飞行动画定位全继续工作）；左段=官方
  .bag-panel 原件（panelA 负重+官方背包格），中段=官方 .transfer-controls 原件
  （btnPutAll/btnTakeAll 官方监听原样）+ mod 三增值按钮（分类取出/分类放入/按标签放入，
  命令通道），右段=rail 壳（chrome+官方汇总行面板原件+页脚动作组）；#flyLayer 随壳。
- **跨柜 = rackOpen（官方动作重放）**：柜签点击 → C# 重放官方 `Ac_MaterialRack_Open
  .SendAction`（套件 SendAction 先例通道）→ State_Web_MaterialRack 整体重绑 → 官方
  rackrows 行组件原生重渲染目标柜——行拖拽/右键取1/锁定/取出最多/官方放入取出全部
  作用于新柜，全原生零伪造零自绘。
- **自绘格全面退役**：BAGPANEL_HTML 自绘背包面板/renderBagPanel/bindBagPanel 右键
  put/take 单件 mod 语义/duo 自绘柜格/列表行右键取1 一并删除；列表=纯汇总只读（行零
  事件）；右键口径回归官方原生（§4.8）。
- **图标过滤 v13 口径回归修复**：display 层过滤的图标识别路——未知键/歧义键**不藏**
  （宁少藏不多藏，v13 G11 裁定在 v1.8.2 重写中丢失，本轮回归）；wantCfg 按 cfgId 匹配
  （原图标路拿实例 id 查 cfg 键恒空=全部误藏的隐性 bug 一并修复）；整理柜 .rk-row 行
  纳入过滤目标。
- **宿主复活判定特判（rack）**：作用域容器继承宿主 id，复活判定=存在不带 data-sr-scope
  标记的 #rackSystem（任一命中即官方重建）；官方右面板在替换宿主前先进壳（桩自愈前提）。
- UI-SPEC 升 v13（§0 动作保真红线/§4.5 整理柜官方原件口径/§7.12 动作矩阵验收）；
  原型 rail.js 对齐（物品级交互语义以官方原件为准，模拟路径显式标注）；DESIGN §9 同步。
- 验收：root harness v182-rack-accept 22/22（三段装配/官方按钮原生事件/行右键取1/
  rackOpen 命令形状/宿主复活重装配/Vue 双页进壳/零控制台错误）+ t13-railon-gate 15/15；
  实机动作矩阵见交付验收记录。

## v1.8.1（2026-10-31）

实机六缺陷修复（作者裁决口径：**只改界面布局样式；存物/取物/拖拽移动/左键详情/右键快转
等动作交互一律保持官方原生语义**；列表模式=纯汇总展示，随机属性物品不合并）：

- **机器页旁挂装配（beside）**：烹饪/酿造/鼠笼/染缸/压缩机/粉碎机/温室/工作台/无人机
  交易/调度机队 10 页不再整块替换官方面板——官方物品格/页签/按钮原样保留，左键详情、
  右键快转、拖拽移动全部原生存活（缺陷④⑤）；柜子侧栏改为 body 旁挂（`body:has` 强制
  flex 并排），柜列纯本地切柜（契约自带全容器数据，零 forge、不带动官方背包区）。仍走
  「替换宿主」的只剩两个定版场景：整理柜（v12 自研双面板+官方五按钮）与 B 键纯背包页。
- **页签空白根修（缺陷①）**：实机 `reading 'n'` 崩溃（注入 2028 行 lib 迭代）——数据
  入口 normRows 剔除畸形行（null/非数组）+索引构建守卫+容器 id 字符串/数字双口径比较+
  defaultCommon 行级守卫；setData 渲染链 try/catch 兜底（失败 console.warn 带堆栈，不再
  炸死消息通道）。
- **壳体不透明（缺陷②）**：.sr-rail 从未设背景色=宿主替换后整栏全透明；固定深色面板底
  （#201d24）+描边+投影，任何官方页上恒可读。
- **格子尺寸跟官方（缺陷⑥）**：34px→逐页官方取证值（酿造/染缸 38、烹饪/鼠笼/无人机/
  压缩机/温室 40、粉碎机 45、工作台/交易/背包页 56），列数按壳宽自适应。
- **列表模式纯汇总（缺陷③）**：同名且「保质期+flags 全同」（可互换）才并一行；烹饪产出
  等随机属性物品逐叠一行；行右键=行首实叠取 1 件、Shift+右键=整堆（与官方网格右键快转
  同源同语义，废除总量语义/跨柜群发）。
- **bootstrap 重注抖动根修**：GetWebView() interop 包装实例每次访问皆新，ReferenceEquals
  恒 false=每秒重注 86KB+ForceRepublish 刷屏；改轻探针状态机（每 tick 一发 `__CERAIL__?1:0`，
  absent 才注一剂全量，确认后稳态零注入；absent 回包自动复位覆盖 WebView 重建）。

## v1.8.0（2026-10-30）

- **储物侧栏正式实现（CERail）**：12+1 场景（11 官方储物界面 + 温室工程台同款适配）官方背包
  面板列替换为固定侧栏（柜子页签/搜索/快捷标签/排序/网格列表/右键取放一体），界面其余部分
  不改动；B 键单独背包=纯背包页，整理柜=自研双面板（左优化版背包+中官方五按钮转移列+右柜子
  侧栏）。UI 口径以 UI-SPEC.md 为唯一定义源。
- **一键入库/一键整理**：背包页按物品分类匹配柜子标签入库（页签顺序优先、柜满顺延、确认弹窗、
  差量 toast）；任意容器一键整理（同名叠合并+分类归位，失败降级 toast）。
- **数据契约 v4 与命令层**：C# RailData 组装（白名单遍历+rev 门控直推）、RailCommands 命令执行层
  （take/put/takeAll/putAll/takeCat/putCat/putTag/tidy/storeAll/rename/setTags 共 11 op，官方 API
  直调+红线对照：回调只入队、白名单遍历、不碰 State/Reducer）、RailJson 自带解析器
  （tools/railjson-test 13 断言）。
- **桩兼容层**：宿主替换后官方渲染段无守卫解引用的桩节点注入（五页 TypeError 根治；ToolTable
  StatusMsg 类名桩通道）。
- **[Rail] Enable 门（cfg）**：false=侧栏脚本不注入、数据不推、命令不取（12 页官方面板恢复原样）；
  同步经筛选数据段 `railOn` 通知旧 tagfilter 对 rail 覆盖页让位（旧页签隐藏/下拉/A-D 弹回全停，
  false=旧筛选行为完全不变）。工作台 CabinetTabs 修剪（ToolTablePruner）保持不动——自动取料与
  重算成本治理与侧栏正交。

## v1.7.0（2026-10-25）

- 随套件 v1.7.0 发布（本 mod 当版无独立条目；历史更新说明见总仓根 CHANGELOG.md）。
