# 篮子救援 glist——BackpackUI 篮子模式列表式全局物品栏设计

- 日期：2026-11-09
- 状态：builder check 已收口（2 问裁定入文 + 2 处事实更正入文）→ **待作者批准**
- 前序：本设计是 glist 设计（2026-11-07-global-storage-list-design.md）§5.3「二楼交易点」场景列的重启与**形态修正**——重启调查后确认二楼交易不是 TradeUI 场景，而是 BackpackUI 的**篮子模式**（吊篮救援）。原 §5.3 交易列（需求标签单选+需n 小字+💲交易价值排序牌）由本设计整体取代；Q1 三子问（价值口径/半价品类/需n 来源）随之作废（那是按无人机交易假设提的问）。
- 视觉基准：global-trade-v4.html 的交互骨架（chips 单选/排序牌/右键移 1 件/列表↔格子切换）沿用，徽章与 chips 语义按本设计重定义。

## 1. 意图与为什么

二楼吊篮救援（女大学生「她」/打工仔「他」两个吊篮家具）：官方篮子窗口 = 玩家背包 + 篮子两栏，**柜中物品够不着**——要送柜里的东西得先取出搬进背包。本设计把 glist 复用进篮子模式：背包侧换成全局列表（背包+整屋柜子、同名汇总、搜索即时过滤），**按救助进度的实时边际贡献排序**、**按需求类别筛选**、**右键直放篮子**。

## 2. 机制取证摘要（gamekb 2026-11-05_26454866，全部实证位）

| 机制 | 证据 |
|---|---|
| 页面与模式 | BackpackUI 篮子模式：`State_Web_BackpackUI.IsBasket_B`（ReactiveProperty\<bool\>，WebBind `_InfoBMsg "isBasket"`，dump.cs:154795/155011）。A 侧=玩家背包，B 侧=篮子容器 |
| 吊篮家具 | GlobalSetting `Neighbor_BasketFurnitureId`（女大学生，「她最想要」）/`Companion_BasketFurnitureId`（打工仔，「他最想要」）——两个吊篮、同一套机制、参数键分 Neighbor_*/Companion_* 两族 |
| 需求标签来源 | 今日许愿 `Config_NeighborRescueWish`（RescueId+Day→`WishCategories` 如 `"1;5"`，按日换组，可多类）；危机 `Config_NeighborRescueCrisis`（Category+`ResolveProgressPerItem=5`/件，⚠ 行）；第三段无许愿配置→官方「最想要」整行不渲染（noWish）；垂危（dying「她需要吃的」=饱腹救援，另一条饱腹进度）。~~篮子不在家（away）~~：**作者裁定删除**（2026-11-09）——篮子不在家时窗口根本打不开，该态不可达（前端兜底代码不构成场景） |
| 分值=救助进度贡献 | 参数 `HitProgress=30 / HitPerCategory=15 / HitValueRate=0.2 / MissValueRate`；**完整参数快照在 `State_Web_BackpackUI.NeighborWishSnap`（public 属性，dump.cs:155017/156161：wishCats/wishNames/三 rate/crisis 全套）——C# 直读该属性**（builder check 更正：前端 wishJson 只带渲染字段（show/away/noWish/tier/cur/max/gain/chips/crisis*/dying/satiety*），**不带 rate 参数**，勿走解析前端 JSON 的弯路）；`MissValueRate` 仅存在于 GlobalSetting 键（`Neighbor_MissValueRate`/`Companion_MissValueRate`）与快照，**Config 表无此列**（兜底链=快照→GlobalSetting）。官方篮内 +N 预览=gain（wishJson 内，作 SelfCheck 对账基准） |
| 官方算子（**分值计算主通道**） | `NeighborRules.CalcSendProgress(List<int> itemCategories, List<int> itemValues, List<int> wishCategories, int hitPerCategory, float hitValueRate, float missValueRate, List<int> hitCategoriesOut)`（**参数化纯静态**，dump.cs:111589——任意物品清单的进度贡献，不限于篮内现有内容）；`NeighborRules.CalcCrisisResolveProgress(List<int> itemCategories, List<int> itemCounts, int crisisCategory, int resolveProgress, int resolveProgressPerItem, out int hitPieces)`（危机分值，dump.cs:111591 区段）。另：`Reducer_Web_BackpackUI.RecomputeBasketPreview(state)`（静态，篮子内容变化重算官方 gain，dump.cs:156357 类内，只读作对账基准）；送出结算 `NeighborRescueManager.OnBasketSendSettle(furnitureInstanceId)`→`AddProgress/AddAffinity`；进度上限 `RescueProgressMax=500/300`、里程碑 `100;250;500`=「资格」档 |
| 分值数学定谳（实机批改#1 反汇编 RecomputeBasketPreview@0x2af04b0-0x2af0558 + CalcSendProgress@0x29f9a66-0x29f9c41） | **逐叠条目**：`value=TradeValue>0 ? Round(ItemCount×TradeValue×factor) : 0`，`factor=UseTimes>0 ? UseTimes/max(MaxUseTimes,cfgUses)×cfgUses : 1`，`cfgUses=max(cfg.UseTimes,1)`（**剩余使用次数折算——多次使用物品分值随剩余次数变化**）；CalcSendProgress：`gain=⌊hitVal×hitRate⌋+⌊missVal×missRate⌋+命中类别数×hitPerCategory`（hit=类别∈今日许愿，逐叠累计；ApplyFuelValueScale 燃料折算在算子内部）。~~同类降级~~实为 **uses 折算假象**（21→6=第二件剩余次数少），无类别级降档机制 |
| 旧实测锚（作者 2026-11-09 实机，v2.1.0 误读为「类别级降档」） | 铁丝首放 +21（满次数）；精致铁皮先入后铁丝仅 +6（该件剩余次数低）——v2.1.0 逐件平铺 TV 模型漏 uses 折算=分值错+SelfCheck 触发全隐的根因，实机批改#1 修正 |
| 禁入/容量 | `NeighborRules.IsBasketForbidItem / IsBasketForbidGiftItem`（静态可直调；截图红叹号来源）；容量 GlobalSetting `Neighbor_BasketMaxItems`（前端 basketMaxItems 同源） |
| 官方移动 | 背包内右键=ITEM_CLICK rightClick 快速转移（A→B）；跨容器直达先例=`ItemManager.TryQuickMoveItems`（feed 链柜→燃料槽同款，RailCommands.cs:48 起） |

## 3. 目标 / 非目标 / 反目标

**目标**

1. **篮子模式背包侧 glist 接管**：默认列表态，列表↔格子单图标钮互切（染料桶同款），格子态=官方原样背包。
2. **有许愿**：chips=今日许愿类别（**单选**，再点同枚=取消回全部；危机激活追加 ⚠ 枚）+ 排序牌「按救助贡献 ↓」常驻；**行徽章=下一件的实时边际分**（篮子内容变化即联动——铁丝在首个材料入篮后 21→6，作者确认此口径）。
3. **无许愿**（第三段 noWish）：chips=9 固定分类（全部/食物/材料/日用品/燃料/药品/书刊/工具/种子）筛选 + **手动排序按钮**（复用现成 SORT 键下拉设计：饱腹/心态/精力/生命/保质期/交易价值）；不做贡献排序（无需求时救助贡献无意义——作者裁定）。
4. **右键行=直放 1 件进篮子**：柜中物品不落背包直达；篮子满/禁入→官方口径提示。
5. **禁入物品**行置灰+红叹号标记（官方 IsBasketForbidItem 口径）。

**非目标**

- 不动普通背包模式：篮子一关，柜子页签/rail 一切照旧。
- 不动 B 侧篮子面板（官方愿望 chips/救助进度条/资格/送出按钮全原样）。
- 不改任何官方结算数值（全程只读状态+官方移动动作）。
- TradeUI（无人机交易页）本设计不涉及；glist 原设计 §5.3 的「交易点」场景就此关闭，将来要做交易页另立。

**反目标（做了即失败）**

- 复刻公式无对账保险：SelfCheck 是硬性验收项，失败宁可整窗不显分值。
- 绕开官方移动自造转移路径（柜→篮必须走官方容器移动）。
- 删/移官方 DOM 节点。

## 4. 方案选型（已定：B'官方纯函数直调；2026-11-09 作者两次裁定）

行分值计算三案过程全记录（防回潮）：

- ~~A（2026-11-09 首裁，**已作废**）~~：官方参数+公式反汇编 `RecomputeBasketPreview` 复刻+SelfCheck。作废原因：builder check 查证 `NeighborRules.CalcSendProgress` 为**参数化纯静态**（入参=任意物品清单+许愿类别+折算参数，返回进度贡献），「官方算子只能算篮内现有内容」这一否决 B 的前提不成立；作者复裁同意换轨（原话「同意」）。反汇编与公式复刻整段工作不再需要。
- **B'（定案）**：**逐行边际分 = `CalcSendProgress(篮子现有内容+该行 1 件) − CalcSendProgress(篮子现有内容)` 一次差分**；危机行分值走 `CalcCrisisResolveProgress` 同式差分；参数从 `NeighborWishSnap` 直读。零复刻零反汇编，游戏更新改公式自动跟随（TradeFx v2.0.0 同款「官方算子直调」纪律）。开销：每行 2 次官方静态调用（il2cpp List 编组，RailCommands `TryQuickMoveItems` 每帧在调的成熟通道），列表 ~百行可承受；签名门控下仅篮子内容/许愿变化时重算。
- C：不做行分值——列表无法按贡献排序，不满足核心诉求。弃。

**SelfCheck 保险丝保留**（角色从「复刻漂移保险」变为「组合层双保险」）：mod 差分口径对 B 侧现有内容求 Σ，与官方 wishJson `gain` 对账 `|Δ|≤0.5`；超差→warn-once（按 OwnerId 去重）+ 本窗不推 scores（JS 退无分值形态）。组合层（tier 封顶/进度上限钳制/危机叠加次序）若官方 gain 有而 CalcSendProgress 无，以对账暴露、以差分兜底，不自行补写。

## 5. 设计

### 5.1 C# 侧

**新文件 `BasketGlist.cs`**（挂 AccessTicker 0.5s 快轮，TradeFx.Poll 同列）：

- **门**：`ReduxUISystem.IsUIActive(WebUI_BackpackUI) && State_Web_BackpackUI.IsBasket_B.Value == true`；门关零动作。
- **签名先行**（窗口静置不做无用功，TradeFx 同款纪律）：`BasketWishJson_B`（ordinal）+ B 侧篮子物品表 + A 侧背包 rev（rail 契约 rev）+ 危机态字段，逐值比较，变了才重建。
- **状态与参数读取**：mode（wish/nowish/dying 三态：`dying`→dying；`noWish`→nowish；其余→wish；away 不可达已删）、chips（wishCats 类别名 + 危机类别追加）从 wishJson；**折算参数（hitPerCategory/hitValueRate/missValueRate/wishCategories/危机全套）从 `State_Web_BackpackUI.NeighborWishSnap` 直读**（Il2Cpp 对象字段，勿解析前端 JSON），MissValueRate 缺席兜底 GlobalSetting `Neighbor_/Companion_MissValueRate`。
- **逐行边际分（官方直调差分，§4 B'）**：对每个出现在背包+契约柜的不同 cfg：`CalcSendProgress(篮内 categories+values 追加本件 category/value, wishCats, params…) − CalcSendProgress(篮内, …)`；危机激活时危机类别行改走 `CalcCrisisResolveProgress` 差分。签名门控下仅重建时算（篮子内容/许愿/危机变化才触发）。**实测对拍锚**：官方函数对「铁丝单独」「精致铁皮+铁丝」两场景复算必须命中 21/6（开发期日志验证，批 1 验收项）。
- **SelfCheck 保险丝（组合层双保险）**：mod 差分口径对 B 侧现有内容求 Σ，与官方 wishJson `gain` 对账 `|Δ|≤0.5`；超差→LogWarning（按 OwnerId 去重）+ 本窗 scores 不推（JS 侧退「无分值形态」：chips 保留、徽章与排序牌隐藏）。
- **推送**：并入 rail 契约页条件字段（dyePal 先例）：BackpackUI 页包带 `ctx.basket = { mode, chips:[{id,name,warn}], plaque:'score'|null, scores:{cfgId:分}, forbid:[cfgId] }`；>7.5KB 走既有分块。scores 只收列表在场的 cfg（节流）。
- **右键 op**：drain 新 op `basketPut {owner, itemId}`（owner=背包或柜 ownerId）→ C# 走官方容器移动（`TryQuickMoveItems`/`SplitItem` 拆 1 直达篮子容器 owner=B 侧 BagOwnerId）；满/禁入/失败→`ctx.feedFail` 同款一次性回执（JS toast 官方口径文案）。

**RailData.cs**：`BuildJson` 的 BackpackUI 页包加 `glistOn = EnableGlistBasket && IsBasket_B`（页条件门；非篮子模式恒 false=rail 柜子页签照旧）；items 18 列全量数据已在契约，零新管道。

**CabinetEverywherePlugin.cs**：新 cfg `EnableGlistBasket`（[Access] 区，默认 true，SettingChanged 慢道 reload——三先例同款）。

**RailUi.cs 键盘门**：GlistKeyboardTick 页键组加 BackpackUI+篮子门（与 ctx.glistOn 同口径）。

### 5.2 JS 侧（railui.page.js glist 节扩展）

- **场景注册**：`GLIST.BackpackUI = { target:'篮子', badge:'aid', feed:'basket', gate:'basket' }`——新 `gate:'basket'` 字段：`glistOwnsPage` 追加 `store.ctx.basket` 在场判定；非篮子模式 BackpackUI **零扰动**（rail 现行行为原样）。宿主=篮子模式 A 侧背包列（domDual 形态；选择器批 2 夹具先行探明）。
- **chips 两态**：
  - wish：`ctx.basket.chips` 动态渲染（单选 data-c，再点回全部；危机枚带 ⚠ 前缀与 warn 色）+ 常驻排序牌「⬆ 按救助贡献 ↓」；
  - nowish：9 固定分类 chips（全部/食物/材料/日用品/燃料/药品/书刊/工具/种子）+ 手动排序钮（复用 srSort 观感与 SORT_KEYS 六键：sat 饱腹/mind 心态/en 精力/hp 生命/shelf 保质期/value 交易价值；**glist 行聚合口径**：饱腹/心态/精力/生命=物品固有值（合并键含 attrSig，行内一致）、保质期=行内最快到期（FEFO 同源）、交易价值=行总价（单价×Σcount×使用次数折算，与既有角标同源））；
  - dying：chips=「🍗 她需要吃的·食物」+ 排序键=饱腹（实现裁定，见 §8）。
- **徽章**：`srg-badge` 新 aid 变体（`+21` 绿系，绿色=#66BB6A 语义=救助）；悬停显贡献说明（「材料 · 今日想要」/「类别已有 · 折算」——具体文案随批 1 官方函数行为实测后落，不写死系数）。
- **行**：禁入 cfg（ctx.basket.forbid）置灰（srg-dim）+ 红叹号角标（官方观感）；右键→`basketPut`（FEFO 选叠同 glistPickFefo）；篮子容量满时行不置灰（放了才知道？否——**容量满=右键时官方拒绝+toast**，行态不预判，避免与官方窗口期竞态）。
- **联动**：ctx.basket 变化进 GL_SIG 渲染签名（篮子内容变→官方 gain 变→mod scores 变→徽章/排序刷新）。
- **幂等/防自激**：GL_SIG/expando/写计数铁律全沿 glist 既有纪律。

### 5.3 CSS（railui.css）

badge aid 变体、nowish 手动排序钮（srSort 同观感移植进 glist 面板）、禁入置灰行、⚠ 危机 chip 色——量小，全部 `srg-` 前缀体系内。

### 5.4 harness

`harness-basket-glist.cjs` + 夹具 `fixtures/BasketBackpack.html`（官方 BackpackUI 篮子模式结构拷贝：A 背包列+B 篮子列）。断言组：三态 chips（wish/nowish/dying）/徽章随 ctx.basket 联动（21→6 场景）/右键 basketPut op 发出/满禁 feedFail toast/列表↔格子切换/搜索筛选/**非篮子模式零扰动**（同帧不带 ctx.basket 时 glist 不进场、柜子页签路径原样）。危机/dying 两态**仅 harness 覆盖**（作者存档不可造，2026-11-09 裁定）。

## 6. 批次与验收

| 批 | 内容 | 里程碑 |
|---|---|---|
| 1 | gamekb 复核 interop 面（`CalcSendProgress`/`CalcCrisisResolveProgress`/`NeighborWishSnap`/`IsBasketForbidItem*`/容量键）→ C# 取数与差分通道（门/签名/官方直调/SelfCheck 日志） | 编译过；实机日志：官方函数复算 21/6 两场景命中、SelfCheck 干净（对不上=停下查组合层，不进批 2） |
| 2 | ctx.basket 契约推送 + basketPut op + 夹具 + harness 骨架 | harness 骨架绿；非篮子模式零扰动断言过 |
| 3 | JS 场景全量（宿主/chips 三态/徽章/右键/切换钮/nowish 手动排序钮）+ CSS | harness-basket-glist 全绿；glist 既有三场景回归全绿 |
| 4 | 收口：全量回归 + 实机（**对拍=mod 行分值与官方篮子 +N 增量一致**；两吊篮各验一轮；wish/nowish 态实机验，危机/dying 仅 harness）+ 版本/CHANGELOG/UI-SPEC | 实机收口；SelfCheck 日志干净 |

## 7. 风险

| 风险 | 缓解 |
|---|---|
| 官方函数组合层与 gain 不齐（tier 封顶/上限钳制/危机叠加不在 CalcSendProgress 内） | SelfCheck 对账暴露；超差→停查组合层（读 RecomputeBasketPreview 反汇编定组合次序），仍不自行复刻基础公式 |
| 篮子模式 DOM 与常规 BackpackUI 异形（domDual/篮子面板结构） | 夹具先行探明；宿主选择器实现期校；探针 miss→glist 不进场回退官方（missing 探针先例） |
| 官方移动 API 拒绝柜→篮直达 | 退两跳备案：take 落包+ITEM_CLICK 回放（GLPENDQ 先例）——功能不砍，多一跳 |
| dying/危机态实机不可造 | 两态仅 harness 验证（作者裁定 2026-11-09）；降级路径（无分值形态）有断言兜底 |
| 游戏更新改公式签名/页面结构 | SelfCheck 保险丝+missing 探针+每次更新跑对拍（TradeFx 既有流程复用） |

## 8. 裁定记录

**作者裁定（定案）**

1. 行分值=**下一件的实时边际分**（篮子内容联动更新，非 Σ 非首件；示例：首材料未入时铁丝显 21，已入后显 6）。**实机批改#1 修正**：该 21→6 实为剩余使用次数折算（多次使用物品拆行各按其 uses 计分——glistItemKey 合并键同口径），非同类降档。
2. 无需求时：9 固定分类标签筛选 + 手动排序按钮（饱腹/心态/精力/生命/保质期/交易价值，现成设计复用）；不做贡献排序。
3. 列表↔格子切换（染料桶同款），默认打开=列表。
4. 右键=直放篮子（不落背包中转）；篮子满/禁入→提示禁止放入。
5. 分值计算走**官方纯函数直调**（`CalcSendProgress`/`CalcCrisisResolveProgress` 差分；2026-11-09 复裁定案——首裁 A「反汇编复刻」因 builder check 证伪其前提后作废，作者同意换轨）。
6. away 态不存在：篮子不在家时窗口打不开，该态从设计中删除（2026-11-09）。
7. 危机/dying 态实机存档不可造：两态仅 harness 验收（2026-11-09）。

**实现裁定（构建者可推翻，推翻前先问）**

1. 危机激活时 ⚠ 类别追加进 chips（单选池的一员）。
2. dying 态按「食物 chip + 饱腹排序」处理（官方该态只看饱腹）。
3. SelfCheck 失败降级形态=chips 保留、分值徽章与排序牌隐藏（不瞎猜数）。
4. nowish 排序的行聚合口径（保质期=最快到期、交易价值=行总价）。
