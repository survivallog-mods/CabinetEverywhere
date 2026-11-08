# TradeFx 设计——交易页数值可视化与派送增强（融入 BetterTrade 功能集）

- 日期：2026-11-08
- 状态：已评审（builder check 4 问收口 3 问裁定入文），待作者批准
- 范围：CERail（SurvivalLog.CabinetEverywhere）新增 TradeFx 模块
- 参照物：BetterTrade 1.0.1（`com.ivmakk.survivallog.bettertrade`），反编译存档
  `thirdparty/BetterTrade/decompiled/`（下文引用 BT.* 均指此目录）

## 1. 意图与动机

BetterTrade 在官方交易页（TradeUI.html，无人机交易窗口）上做了一套数值可视化：每格
物品的出售价值、悬停时的价值算式、商人想要/半价标签、天平条两端数字、货架单价，以及
派送模式下的投放贡献 `+N`、需求进度条、奖励预览、补给药品总计。这些是纯玩家收益功能，
与 CERail 的柜子页签/排序/筛选互不冲突，且 CERail 已有其中约一半的地基（价值数学、
角标层 prefab、推送管道）。本设计把 BetterTrade 的 9 项功能按 CERail 架构重做进
CERail（功能编号沿用分析报告：A1-A5、B7-B10；A6 排序与 C 组交易标签已由 CERail
覆盖，不做）。

## 2. 目标 / 非目标 / 反目标

**目标（9 项，全部交付）**

| 编号 | 功能 | 官方页落点 |
|---|---|---|
| A1 | 每格数值徽章：trade 模式出售价值（三档色/暗格）**仅无人机格**——背包格价值角标维持 rail 现有交易价值排序（作者裁定，见 §5.3）；supply/camp/donate 模式补给/饱腹数字两格都画 | 背包格 `#tradeBagGrid`（rail 壳内）、无人机格 `.col.mid .grid-container` |
| A2 | 悬停 tooltip 追加块：物品事实（子类/使用次数/五维属性/阅读效果/种子产出）+ 价值算式（`84 = 28 × 3 × 1.5（想要）`） | 官方 `div.tooltip` 内追加 |
| A3 | 商人想要/半价 chips 行（替换官方「想要」行） | `.info-rows`（缺则 `.bubble` 内自建行） |
| A4 | 天平条两端数字：左「你给出」右「货物」，悬停出成交线明细 | `.foot-main` + `.bal-track` |
| A5 | 货架单价徽章 + 点击弹官方物品详情 | `.shelf-list .shelf-icon` |
| B7 | 派送模式每格 `+N`：该物品投放对哪条需求加多少（rail 无此维度，两格都画） | 同 A1 两个网格 |
| B8 | 需求行改造：文本行 → 带物品图标的进度条（paid/need、官方填充、预览高亮），悬停官方 tooltip、点击弹详情 | `.sup-list .sup-row`（data 属性+CSS 叠加，不动官方节点） |
| B9 | 奖励预览：行下「回报」条带，物品图标+数量，超 3 行折叠 `+N` | `.sup-row` 下新增节点 |
| B10 | 补给模式药品总计：选中邻居行「药品 +N」小标签（无人机送药总量） | `.sup-row.on .sup-dims` 内新增 chip |

**非目标**

- A6 交易价值排序：CERail 已有（rail 侧栏 SORT_KEYS/srSortBtn）。
- BetterTrade C 组（交易标签→柜子页签）：CERail TradeTabs 已覆盖，不引入标签体系。
- 不做 i18n 框架：沿用 CERail 现状，UI 文案 JS 侧中文硬编码（见 §8 我的裁定）。
- 不动 BackpackUI/ShopUI 等其他页面：本期只做 TradeUI 页。

**反目标（做了即失败）**

- 改变任何官方交易数值逻辑：全程只读状态+纯视觉叠加。
- 删除/移动官方 DOM 节点（B8 也只加 data 属性和叠加样式，官方节点原样）。
- 在 ExecuteJavaScript 回调线程触碰游戏数据（现有红线 1，drain 只入队）。
- 搬运 BetterTrade 反编译代码：无授权（原包仅 DLL 无 LICENSE），公式经 gamekb 从
  游戏本体反推，BetterTrade 仅作行为参照与对拍 oracle（见 §4）。

## 3. 约束

- **兼容原则（作者定）**：只考虑套件内 mod 与官方原生设计，不写任何针对第三方
  mod 的检测/让位/兼容代码。
- CERail 纪律：全库仅 3 个 Harmony patch（RefreshCoalescer/ToolTableProbe/RailUi
  gkguard），本期默认零新增 patch，预留升级路径（§5.1）。
- 推送必须走带回调重载的 ExecuteJavaScript（单参重载在本 Vuplex/Il2Cpp 组合上静默
  丢弃脚本，RailUi.cs:401-407）。
- 手搓 JSON 禁止 `",,"`/`"[,"`（RailUi.cs:417-428）；单发 >7.5KB 需分块。
- interop 面（§5.4 清单）由 BetterTrade 1.0.1（2026-10-08 构建）在当前游戏版本验证
  可行；开工日用 gamekb 复核一遍签名（游戏若已更新）。
- Trade 页对 JS 的可见重渲染只来自官方 reducer/refresh 动作——纯视觉叠加走注入 JS
  的 DOM 层渲染（ensureTabsInSlot/nbMount 同款已验证路径）。

## 4. 授权与对拍

1. **不搬代码**：BetterTrade 无 LICENSE，反编译产物只读参照，实现代码全部自写。
2. **公式来源**：交易数学（GiveValue/TakeUnitValue/Totals/补给换算/捐赠饱腹）经
   gamekb 反汇编游戏本体（`Reducer_Web_TradeUI` / `ItemManager` / `SupplyLevelRules`）
   反推；BT.TradeMath.cs 仅作数值行为参照。
3. **对拍 oracle**：验收时临时启用 BetterTrade（其 Features.TradeStorages 配置关掉，
   避免与 CERail 柜子页签叠加），并排比对每处数字一致。
4. **运行时保险丝（SelfCheck）**：C# 每次构建 bar 数据时对账
   `|offer − goods − BarNet × barScale| ≤ 0.5`（BT.TradeData.cs SelfCheck 同式，从
   游戏本体公式独立推导），超差：LogWarning 一次（按 OwnerId 去重）+ 本窗不推 bar
   节数据。其余模式对拍源：supply 用官方 `SupplyLevelRules.ConvertItem` 输出、donate
   用官方 `Reducer_Web_TradeUI.DonateSatietyOf`、B7 直接差分官方
   `CollectDispatchTake`（天然对齐）。游戏更新后此对账是固定验收环节。

## 5. 设计

### 5.0 方案选择（已定：A）

三案比较记录：

- **A（选定）**：C# 新建 TradeFx 数据通道（TabGate 推 `__CERAIL_TABS__` 同款模板，
  TabGate.cs:561-564）+ 渲染代码并入 railui.page.js 新 tradefx 节。复用最大：badge
  prefab、观察器/节拍器、drain 通道、CSS 体系、ensureMountedFrame；tradefx 崩溃不
  影响柜子页签（模块级 try/catch 隔离）。
- B（独立 bootstrap+独立渲染脚本）：与 rail 解耦彻底，但 badge 工厂要么复制要么跨
  脚本暴露、双观察器双 CSS，单 mod 内过度工程。弃。
- C（tradefx 节并入 RailData.BuildJson 契约）：管道最少，但交易窗口态（give 勾选高
  频变）混进柜子目录（低频变）会让 rail 的 rev 签名失真、窗口关闭后仍在推。弃。

### 5.1 C# 侧：TradeFx.cs（新文件）+ TradeFxMath.cs（新文件）

挂点与节律：

- 挂 `AccessTicker` 0.5s 快轮（CabinetEverywherePlugin.cs:421-440 区段，与
  TabGate.PollAll 同列）。
- **签名先行**：先做廉价比对——OwnerId、Phase.Value、GiveJson、PicksJson、
  ShelfSnapshotJson、DispatchRaw、SupplyTargetsRaw **逐值 ordinal 比较**（Il2Cpp
  字符串每次读取都重新封送成新托管串，引用比较恒不等，不可用）+ ItemDataList
  引用比较。全部没变 → 直接返回（不重建 JSON、不推）。变了 → 重建。目的：窗口
  静置时不做无用功（否则开着窗每 0.5s 白算全量、白推几十 KB）——JS 侧「变了才
  写」纪律在 C# 侧的同款。
- 模式判定（对齐 BT.StateReader.Read 的分流）：OwnerId==0 或
  Phase.Value=="roster" → 推一次 `{mode:"none"}` 后停；IsWhDonate→donate；
  IsSupply→supply（`ParseSupplyTargets`+`FindCampRow` 命中则 camp）；IsDispatch→
  request；否则 trade。
- 状态读取套用 RailSortMath.TradeNow 的取法（GetStateByUI + TryCast）。
- 推送：`window.__CERAIL_TRADEFX__(<json>)`；>7.5KB 时走自有 4 行分块协议
  （pid/i/total 单调递增，railui.page.js pushChunk 同款免疫乱序；不耦合 rail 的
  pid 序列）。
- 升级路径（本期不做，文档备案）：若实机嫌 give 勾选后数字 0.5s 跟随太慢，加第 4
  个 patch——`Reducer_Web_TradeUI.Refresh` postfix 直接触发重建（BetterTrade
  ValuesOnRefresh 同款），FastPoll 降级为兜底。

TradeFxMath（纯函数，从游戏本体反推；BT.TradeMath.cs 数值对拍）：

- GiveValue（每格出售值）：底值 × 剩余使用折算 EffectiveUses × (想要加成
  (1+Boost 钳 BoostMax) + 鉴定 AppraisalBoost) × 半价率 × 货架 sellRate。
- TakeUnitValue（货架单价）：TradeValue × UseTimes，营地药品类乘
  GameKey.EndlessTradeTakeMedicineRate（取大不取小）。
- Totals（A4）：offer=选中 give 各格 GiveValue 和；goods=选中 picks 单价值和；
  dealLine=goods−(DealLineDiscount+DealLineBonus 钳 [0, MaxDiscount])。
- 参数：`Config_GlobalSetting` 的 StrangerTradeSelfStockValueRate（半价率，钳
  (0,1] 默认 0.5）/ DealLineDiscount / DealLineMaxDiscount / BarScale（默认 120）。
- supply/camp：SupplyAmount（按 dim→饱腹/种子/材料/燃料/药品五类）；CampGain
  （category 13 燃料走 BurnValue×count，其余 convertDim/convertValue）。
- donate：DonateSatiety（useTimes 回退链 × 实例/配置饱腹值 × count）。
- 想要判定：DemandCategoryMask 位测试优先，无 mask 再 DemandCategory 单值
  （注意：现有 AppendTradePrefs 只处理单类别，TradeFx 用完整口径；rail 的
  tradePrefs 是否同步修口径留给实现判断，不强求）。

B7 差分（每格调官方 `Reducer_Web_TradeUI.CollectDispatchTake`）：

- 已在 give 的物品：去掉该件重算，取两表差分得 +N 及命中需求行；在 hints 里的
  物品：加一件重算；两者皆非 → dim。对齐 BT.StateReader.DispatchCells 行为。
- 只在 DispatchRaw/GiveJson 签名变化时重算（每格 2 次官方调用，袋内 ~百件可承受）。
- 失败降级：整段 try/catch，失败时 request 模式不带数字，页面纯徽章全清（对齐
  BetterTrade 降级）。

### 5.2 C# 侧：其余接线

- **详情弹窗**：drain 新 op `detail`（参数 configId）→ 主帧
  `Ac_ItemDetailPopup_OpenUI.SendAction(...)`（BT.DetailPopup.cs 同参形：configId
  位传值其余 0/默认）。注册进 RailCommands 分发表（RailCommands.cs:215-241）。
- **missing 探针**：drain 新 op `report`（参数文本）→ LogWarning（按消息去重）。
  JS 侧每个功能声明依赖选择器表（对齐 BT.page.js FEATURES 表），渲染前逐一探测，
  缺哪个报哪个——实机排障直接定位「游戏改版把哪個选择器改没了」。
- **无互斥处理**（作者裁定：不做多余动作）：不检测 BetterTrade、不让位，同装
  双渲染与否是玩家自己的事，mod 只管好自己。对拍验收（§4.3）即开发期两者同装
  同开并排比数字——交付物中不含任何为此服务的代码。
- **生命周期**：TradeFx 随 rail 走（rail 脚本不注入则 TradeFx 全停）。作者裁定
  `[Rail] Enable` 等价卸载 mod、不构成独立使用场景，不做独立底座。
- **零新增配置**（作者裁定）：TradeFx 不设任何开关，mod 开着就有。诊断日志
  沿用现有 `[Debug] Verbose` 惯例（build 耗时/json KB），不新增配置项。
- 关窗清理：OwnerId 变 0 时推一次 `{mode:"none"}`，JS 各功能走 clear 路径。

### 5.3 JS 侧：railui.page.js 新增 tradefx 节 + railui.css 追加

- **宿主**：TradeUI iframe（id `Trade`）。数据经根窗 `window.__CERAIL_TRADEFX__`
  进来，渲染写到 TradeUI 帧文档（ensureMountedFrame 已管辖该帧；帧卸载即自清）。
- **A1/B7 徽章**：`makeBadgeLayer`（railui.page.js:1824）新增实例。
  **共存裁定（作者定）**：trade 模式背包格的价值角标**归 rail 现有交易价值排序**，
  Tradefx 不在背包格画价值徽章；Tradefx 只画 rail 没有的维度——无人机格价值徽章、
  supply/camp/donate 数字、派送 +N。rail 排序功能自身缺陷单独修，不混入本批。
  注意 rail 会把 `#tradeBagGrid` 收编进壳（SCENES.Trade host 替换）——背包格实例
  的 host 函数须现解析格子当前所在父节点（nbBadgesCore host 闭包同款）。
  **检查点 A（prefab 能力）**：现有 prefab 是「单维度同源数值」角标（spec 返回
  k/color），tradefx 需「每格独立 text/tone/dim」（BT.drawBadges 的 per-cell
  looks 形）。给 prefab 加可选 per-cell 模式或旁立小函数——铁律：现有 rail/NB
  双实例行为零扰动。
  **检查点 B（同格双角标）**：派送/补给模式下 rail 排序角标与 Tradefx 数字可能
  同格（维度不同），错开角落（makeBadgeLayer dx/dy）；实现时按 rail 实际占角定。
  **检查点 C（观察器互扰）**：rail 的 srGridHost 观察器会看到 Tradefx 层写入——
  双方都必须幂等签名守卫，防互踢循环（自激铁律同 nbMount 先例）。
- **A2 tooltip**：wrap TradeUI 帧 Vue `setupState.onItemEnter/onItemMove/onItemLeave`
  （BT shapes.ts 做法：wrapOnce 防重入，Vue.nextTick 后追加），官方 tooltip div 内
  追加两个块（事实块/价值块），视口钳 keepInside。物品事实数据（info 表）由 C#
  推送：stats 五维（实例 InstanceVD 优先，回退配置 ValueDisplay1-5）、uses、子类
  名、阅读效果（Category==3 ItemDes2）、种子产出（Config_Plant.Gain[0] 名）。
- **A3 chips**：官方「想要」行（`.info-rows .cp-row` 内 `.cp-k` 文本==localText
  .wantLabel）隐藏，chips 行替换；`.info-rows` 缺席时在 `.bubble` 内自建容器。
  C# 推 wants/half 两组（名称×倍率）。
- **A4 bar**：`.foot-main` 相对定位，`.bal-track` 左右让位 46px，两端数字 +
  hover 气泡（offer · goods · dealLine）。与页脚「筛选 ▾」按钮共存的间距实机校。
- **A5 货架**：`.shelf-icon` 内单价徽章 + 点击 post `detail`；官方对图标整体
  opacity .6 淡出的样式，徽章需独立保真（BT 对 :has(> .bt-badge) 的处理可参照思
  路）。
- **B8 需求条**：`.sup-list`/`.sup-row`/`.sup-cell` 加 `data-cfx-bars` 属性，CSS
  把官方 `.sup-track/.sup-fill.cur/.sup-fill.preview` 变形为行底填充层，文字压上，
  图标 13px 前置，点击 post `detail`。需求行物品 id 溯源：kind 1 →
  `AidPlatformManager.FindRequest(id).Demands`；kind 4（id≥1000）→
  `StrangerSupportManager.GetPoolSpec(AidChannelPool, channel).Lines`；仅取
  kind==0 且无 PickIds 多义的行（对齐 BT.RequestData.ItemIds 的保守过滤——多义
  行不标图标宁缺勿错）。kind 2 跳过。
- **B9 奖励**：`.sup-row` 下新增 `.cfx-rewards` 条带；奖励源：kind 1 →
  `AidPlatformManager.BuildCommissionReward(no)`；kind 4 →
  `StrangerSupportManager.GetDefRsGift(AidChannelDefRs(channel))`。物品对象 JSON
  （官方 tooltip 用）由 C# 调 `Reducer_Web_TradeUI.AppendShelfJson` 生成塞进
  objects 表。折叠 +N / 展开 −，WeakSet 记忆展开态。
- **B10 药品总计**：supply 模式选中邻居行（`.sup-row.on`）`.sup-dims` 末尾 chip
  「药品 +N」；N=当前选中 give 中药品类 SupplyAmount 合计（BT.StateReader.Supply
  的 Medicine 累计口径）。
- **CSS**：railui.css 新增 tradefx 节；语义色对齐 BetterTrade 的取值（gold
  #FBB034 / coral #FF8A65 / green #66BB6A / 需求条 #E2C422+#FFC107——它与官方页
  协调的选色），以 CSS 变量收口（--cfx-*），不与 rail 现有 --sr 系混用。
- **幂等**：所有 draw 先算签名（dataset 文本比对）变了才写；观察器复用 watchGrid
  模式只盯官方变更；tradefx 自身触发的变更不计（BT.onlyModWrites 同思路）。
- **命名**：JS 类名/CSS 前缀 `cfx`（CERail tradefx），避免与 rail 的 `sr`/BetterTrade
  的 `bt` 撞名。

### 5.4 新增 interop 面（gamekb 复核清单，开工日验证）

- `Reducer_Web_TradeUI` statics：ParseGive / ParsePicks / FindBagItem /
  ParseSupplyTargets / FindCampRow / ParseDispatch / FindDispTarget /
  CollectDispatchTake / AppendShelfJson / CategoryDisplayName /（对拍用
  EffectiveUses / DonateSatietyOf / CampGainOf）
- `SupplyLevelRules.ConvertItem`；`GameKey.EndlessTradeTakeMedicineRate`
- `AidPlatformManager.FindRequest / BuildCommissionReward`；
  `StrangerSupportManager.GetPoolSpec / GetDefRsGift / AidChannelPool /
  AidChannelDefRs`
- `ConfigManager.TryGet_Config_GlobalSetting`（四参数）
- `Ac_ItemDetailPopup_OpenUI.SendAction`
- 读：State_Web_TradeUI 全部分流字段（OwnerId/Phase/IsWhDonate/IsSupply/
  IsDispatch/ItemDataList/GiveJson/PicksJson/ShelfSnapshotJson/DispatchRaw/
  SupplyTargetsRaw/DispSelKind/DispSelId/NpcId/ShelfShopId/CampState/
  DemandCategory(+/Mask)/Boost(+/Max)/AppraisalBoost/HalfValueCategory/
  AidDemandCategory/DealLineBonus/BarNet/DonateTarget）

## 6. 批次与验收

| 批 | 内容 | 里程碑标准 |
|---|---|---|
| 1 | 通道+签名门控+A3 chips+A4 bar+SelfCheck 对账 | 两个功能实机可用；对账日志干净；与 BetterTrade 并排数字一致（其 TradeStorages 关闭） |
| 2 | A1 徽章层（无人机格价值+两格补给/捐赠数字）+A5 货架（含检查点 A/B/C） | 徽章实机可用；与 rail 角标无重叠无互踢；makeBadgeLayer 旧实例零扰动（rail/NB 回归线全绿） |
| 3 | A2 tooltip | 四模式 tooltip 实机可用；官方 tooltip 原生行不受扰 |
| 4 | B9 奖励 → B7 +N → B8 需求条 → B10 药品总计（按侵入深度递增） | 派送页四件套实机可用；B8 异常/探针 miss 时自清，不影响其余功能 |

每批固定动作：harness 补锚点（design-proto 既有套件）；回归既有线（scroll-drag/
native-width/switch-cabinet/height/glist/bagtabs 等）全绿；CHANGELOG/UI-SPEC 更新；
DLL 部署实机验证。

## 7. 风险

| 风险 | 缓解 |
|---|---|
| 游戏更新导致公式/页面结构漂移 | §4 SelfCheck 保险丝 + missing 探针 + 每次更新跑 BetterTrade 对拍流程 |
| makeBadgeLayer 不支持 per-cell | 批 2 首个检查点，小改或旁立，旧实例零扰动为验收项 |
| B8 官方行结构敏感 | 模块级 try/catch + 探针 miss 自清；坏了只坏它，其余不受累 |
| give 勾选后 0.5s 延迟 | 实机评估；备好 Refresh postfix 升级路径（§5.1） |
| JSON 体积（objects 表） | 分块协议；objects 只收被引用的 configId（BT 同款节流） |
| Tradefx 徽章与 rail 角标同格互扰 | §5.3 共存裁定划清维度归属 + 检查点 B/C 兜底；rail 排序缺陷单独修不混批 |

## 8. 裁定记录（作者裁定=定案；实现裁定=构建者可推翻，推翻前先问）

1. 不做 i18n：JS 中文硬编码，与 CERail 现状一致（「筛选 ▾」先例）。（实现裁定）
2. TradeFx 零新增配置项，mod 开着就有。（作者裁定）
3. 不检测/不让位 BetterTrade，不做任何互斥处理。（作者裁定）
4. 对拍=开发期验收动作（两者同装同开并排比数字），交付物不含相关代码。（作者裁定）
5. CSS 色值沿用 BetterTrade 语义色（与官方页协调已被验证），前缀换 cfx。（实现裁定）
6. 变更检测用逐值比较（Il2Cpp 字符串引用比较恒不等）；作用=窗口静置时不做无用
   重算重推。（实现裁定）
7. TradeFx 绑定 rail 生命周期：`[Rail] Enable` 等价卸载 mod、无独立使用场景，
   不做独立底座。（作者裁定）
8. trade 模式背包格价值角标归 rail 现有排序系统；Tradefx 只补 rail 没有的维度
   （无人机格价值/补给/捐赠/派送 +N/药品总计）。（作者裁定）
9. TradeFxMath 想要判定补全 mask 多类别口径；rail tradePrefs 是否同步由实现定。
   （实现裁定）
