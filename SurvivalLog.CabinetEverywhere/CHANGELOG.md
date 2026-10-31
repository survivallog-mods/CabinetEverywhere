# 更新日志（SurvivalLog.CabinetEverywhere / 储藏柜直达）

> 本文件只记本 mod 的更新；套件/安装器版本史见总仓根 CHANGELOG.md。
> 版本号单源：总仓 version.json 的 mods 字段（作者定义）。

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
