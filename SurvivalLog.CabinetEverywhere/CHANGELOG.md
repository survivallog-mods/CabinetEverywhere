# 更新日志（SurvivalLog.CabinetEverywhere / 储藏柜直达）

> 本文件只记本 mod 的更新；套件/安装器版本史见总仓根 CHANGELOG.md。
> 版本号单源：总仓 version.json 的 mods 字段（作者定义）。

## 待发版·六批（2026-11-03，页签区还原官方设计——官方页签栏 DOM 原件 + 视图/排序状态层收口）

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

## 待发版·五批（2026-11-03，排序钮扩全储物柜取用/整理界面 + 开柜闪钮根治）

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

## 待发版·四批（2026-11-03，排序/角标复用化重构——行为零变化）

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

## 待发版·三批（2026-11-01 晚，作者复测：冰箱没进 12 / 柜子滚动条越界空白）

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

## 待发版·二批（2026-11-01 下午，作者缺陷单：交易页残留页/柜宽不齐/交易页签全空）

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
