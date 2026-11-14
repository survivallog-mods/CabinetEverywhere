# 储物数据链瘦身实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 储物界面只推本页用到的物品数据；物品变化检测改挂官方事件通知；柜子名单只在需要时扫描——界面全关零后台活动。

**Architecture:** C# 侧（BepInEx/Harmony/IL2CPP interop）新建 ItemChangeSignal 挂 LogicAdapter 五通知处理器置脏，替代 0.5s 全屋签名轮询；RailData.BuildJson 按每页范围函数只拼范围内 owner 的 items 行；五列表页与吊栏在拼行处按页谓词/状态类别过滤；一键入库结果由任务计数经 ctx 带出；AccessTicker 慢通道改四触发点按需执行。

**Tech Stack:** C# / .NET 6 / BepInEx.Unity.IL2CPP / Harmony / Il2CppInterop / WebView2（railui.page.js 为内嵌 JS 资源）。

**Spec:** docs/superpowers/specs/2026-11-14-rail-data-slim-design.md（本计划据它展开，执行者两份都要读）

## Global Constraints

- 红线：绝不 foreach 整个 OwnerCache（只按白名单 owner TryGetValue）；ExecuteJavaScript 回调内禁止改游戏数据；State/Reducer 只读。
- 推送一律走带回调重载的 ExecuteJavaScript（单参重载在本机静默丢弃，实机铁证）。
- 保留不动：600ms 余波节流、>7.5KB 分片+pid、推送回执看门狗、7 处 ForceRepublish 通道、StoreTaskActive 闸、RefreshCoalescer.Flush 每帧最先、emptyTransient 三零空包判定。
- 温室工程台零改动：场景表条目/View 配置/页签处理/推送范围（全量）一行不碰。
- 不新增配置键、不加开关、不加定时器（含开态 5s 扫）。
- commit 格式 `<type>：<描述>`（技术名词保留英文），每 Task 一个 commit 作为独立回退单元。
- 行数上限：新增文件 ≤300 行（工具/辅助）；RailData.cs 等存量超限文件只提示不拆。
- 每个代码步骤后必须 `dotnet build` 通过才可 commit；本仓库无法离线跑游戏侧测试，纯逻辑以 tools/* 测试程序为准，运行期行为靠最终实机清单验收。

## Review Focus（实机验收映射，执行完交给作者逐项过）

1. **窗外官方/机器人改动丢更新**：非搬运窗内的官方整理/机器人并叠也必须置脏（ItemChangeSignal prefix 无条件执行）→ Task 1。
2. **叠数变化不刷新**（吃/用一件、官方整理并叠）：R1 推断「走 3002」，dump 复核+实机验证，缺则补挂 ItemManager.SetItemCount/IncreaseItemCount/DecreaseItemCount prefix → Task 1。
3. **切页签后角标长期空**：FastPoll 每帧比对当前容器 owner，页签切换 ≤600ms 重推 → Task 2。
4. **五列表页行数与改前不一致**（C#/JS 谓词不一致）：行数、隐藏计数、右键取 1 件三对照 → Task 3。
5. **只用筛选、不开侧栏的用户被新触发器漏掉**：触发器放 AccessTicker.Update（RailUi.Enabled 门之外）→ Task 5。

---

### Task 0: 分支与前置查证

**Files:** 无代码改动（查证结论写进 Task 1 的实现注释）

- [ ] **Step 1: 建分支**

Run: `git checkout -b perf/rail-page-scope main`（在 E:\Game\Mod\survivallog-mods\CabinetEverywhere）

- [ ] **Step 2: dump 复核五个挂点签名与 SetItemCount 族**

在 gamekb/2026-11-12_26615062/il2cpp/dump.cs 复核：LogicAdapter.AddOrNotifyItem(ItemDataDto)/DelItem(long)/OnSyncBagItems(long,long,List,List)/OnRefreshAllBagViews()/OnGroundDockSync(List<ItemPickupData>) 五签名与可 patch 性（非泛型实例方法，MoveNotifyCoalescer.cs:68-72 已 patch 其中 5 个同类方法的先例）；ItemManager.SetItemCount/IncreaseItemCount/DecreaseItemCount 是否存在且公开。任何签名与预期不符 → 停下报告作者，不带猜动工。

### Task 1: 事件驱动替代轮询（ItemChangeSignal + 退役签名扫描）

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/ItemChangeSignal.cs`
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs`（ItemsDirty:274-278、StructureChangedFast:291-323、ComputeSig/SigOwner:1413-1475、BuildJson 尾 :638、OnWorldRebind:350、_lastSig/_lastFastSig 字段）
- Modify: `SurvivalLog.CabinetEverywhere/RailUi.cs`（FastPoll:626-634 推送门）
- Modify: `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs`（Load 尾 Install 调用）

**Interfaces:**
- Produces（Task 2/3/4/5 依赖）:
  - `RailData.MarkOwnerDirty(long owner)` / `RailData.MarkGlobalDirty()`（ItemChangeSignal 与后续任务调用；线程安全：lock(_dirtyLock) 的 HashSet+bool）
  - `RailData.DirtyNow()` → bool（= 脏集与当前范围相交 ∪ 全局脏 ∪ _forcePending ∪ _tidyFailPending ∪ BasketGlist.Dirty；Task 2 的范围变化沿并入）
  - `RailData.ClearDirty()`（BuildJson 成功推出后清）
  - `ItemChangeSignal.Install()`（Plugin.Load 无条件调用，不受 EnableMoveCoalescer/General.Enabled 门控）

- [ ] **Step 1: 写 ItemChangeSignal.cs**

五个 Harmony prefix（挂 LogicAdapter，return true 放行原方法，体内只置脏）：AddOrNotifyItem→MarkOwnerDirty(data.OwnerId)；DelItem→prefix 内 `RailData.ItemMgr()?.GetItemData(id)` 取 OwnerId，取不到 MarkGlobalDirty()；OnSyncBagItems→MarkOwnerDirty(from)+MarkOwnerDirty(to)；OnRefreshAllBagViews→MarkGlobalDirty()；OnGroundDockSync→MarkGlobalDirty()（地面无 owner 维度）。挂载模式照抄 MoveNotifyCoalescer.Patch0（:112-127），失败 warn-once 不抛。
头注释记录 Task 0 Step 2 的 dump 复核结论（含 R1 推断依据）。

- [ ] **Step 2: RailData 脏集 + 门改造**

ItemsDirty()（:274）体内改调 DirtyNow()；删 StructureChangedFast/InnerCountFast/_lastFastSig（:288-323）；删 ComputeSig/SigOwner/_lastSig（:1413-1475、:1564）与 BuildJson 尾 `_lastSig = ComputeSig()`（:638，改调 ClearDirty()）；OnWorldRebind 删 `_lastSig = long.MinValue` 行（:350，_forcePending=true 已在）。注意 :269-272 的 TimeLeft 不入签名注释随函数一起退役。

- [ ] **Step 3: FastPoll 推送门替换**

RailUi.cs:626 `if (!RailData.AnyRailSceneActive() || !RailData.StructureChangedFast()) return;` 改为 `if (!RailData.AnyRailSceneActive() || !RailData.DirtyNow()) return;`。0.5s Tick 的 PushIfDue 门（:531 `!pageChanged && !RailData.ItemsDirty()`）无需改（ItemsDirty 已转调）。

- [ ] **Step 4: Plugin.Load 挂载**

CabinetEverywherePlugin.cs Load 尾（MoveNotifyCoalescer.Install() 之后）加 `ItemChangeSignal.Install();`。

- [ ] **Step 5: 构建**

Run: `dotnet build SurvivalLog.CabinetEverywhere/SurvivalLog.CabinetEverywhere.csproj`
Expected: 0 errors（grep 确认 ComputeSig/StructureChangedFast 全库零残留引用）

- [ ] **Step 6: Commit**

`git commit -m "perf：物品变化检测改事件驱动——挂官方 3002/3005/3031/3027/21015 通知置脏，退役 0.5s 全屋签名扫描与每帧结构快检"`

### Task 2: 推送范围按页收窄（ScopeOwnersOf + 当前容器跟随）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs`（新增 ScopeOwnersOf/CurrentOwnerOf；BuildJson :452-467、:585-630 items/icfg 段改走范围集）

**Interfaces:**
- Consumes: Task 1 的 DirtyNow/ClearDirty。
- Produces（Task 3 扩展、Task 5 触发器复用 ActivePage）:
  - `RailData.CurrentOwnerOf(SceneDef sc)` → long（0=未知）：BackpackUI dual→OwnerId_B、取用→OwnerId_A、Cooking/RatCage/Brew/Dye/DroneHub/ToolTable/FuelGen/Heater→BagOwnerId?.Value、Compressor/Shredder/GreenhouseBuild→CartOwnerId?.Value、Trade→BagOwnerId 裸 long、MaterialRack→RackOwnerOf(sc)；带 ResolveBagOwner 的 CtnGuard 口径（:794，柜 id 校验白名单）。
  - `RailData.ScopeOwnersOf(SceneDef sc)` → List&lt;long&gt;（首位恒为 bag）：bagOnly→仅 bag；BasketOn→全部 _ctn owner（行过滤在 Task 3）；GreenhouseBuild→全部 _ctn owner；其余→bag + CurrentOwnerOf（去重）。
  - 范围变化沿：BuildJson 后记录 `_lastScopeOwner`，FastPoll 每帧比对 `CurrentOwnerOf(ActiveScene())`，变即并入 DirtyNow()（在 DirtyNow 实现里判 `_scopeChanged` 静态位，FastPoll 置位）。

- [ ] **Step 1: 实现 CurrentOwnerOf/ScopeOwnersOf**

读法复用 ResolveBagOwner/RackOwnerOf/BpBagDyn 的 GetStateByUI+TryCast 模式（:156-219、:788-856）。异常纪律同款：读不到=0，范围退化为 bag。

- [ ] **Step 2: BuildJson 改走范围集**

:585-590 `ownerIds` 从「全部 _ctn」改为 `ScopeOwnersOf(sc)`（ctn 元数据段 :556-576 **不动**——全量保留）；CollectCfgIds/AppendOwnerItems 循环（:589、:616-621）同改。icfg 只出范围内 cfgId（未推柜的物品不再进 icfg，JS 对 items 缺键已全 `|| []` 容错）。

- [ ] **Step 3: FastPoll 范围变化沿**

DirtyNow() 并入 `_scopeChanged`；FastPoll 在 :626 门之前比对当前 owner（ActiveScene 非空时 1-2 次 interop 读），变即置位并清 _lastPage 触发 pageChanged 语义。

- [ ] **Step 4: 构建 + 既有工具回归**

Run: `dotnet build ...`；`dotnet run --project tools/railjson-test`（若断言全量 owner 拼装形状，同步改断言为范围形状并注明）。
Expected: build 0 errors；railjson-test PASS。

- [ ] **Step 5: Commit**

`perf：推送物品范围按页收窄——B 背包=背包、整理物资=背包+B 柜、机器页=背包+当前容器（切页签帧级跟随重推）；温室与吊栏窗口保持全量（现状）`

### Task 3: 五列表页按页筛选 + 吊栏按状态类别 + 隐藏计数回传

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs`（行过滤器 + ctx.glistHidden + 吊栏范围并入）
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（页脚 :5414-5424、:5453-5455 改读 ctx.glistHidden；:4844 注释更新）

**Interfaces:**
- Consumes: Task 2 的 ScopeOwnersOf/行拼装路径。
- Produces: `ctx.glistHidden`（int，按「种」=物品名+uses+attrSig 去重计数，含当前柜将被 JS 藏掉的行）。

- [ ] **Step 1: C# 行过滤器**

谓词与 JS glistAggregate（railui.page.js:4839-4869）同源字段：Heater/FuelGenerator=可燃（Config_Item 燃烧字段，与 icfg 尾列同源）；DyePanel=有色素点（DyePaletteRules 同源）；RatCage=Prey_Rarity&gt;0 或 s1&gt;0；BrewPanel=可酿且 s1&gt;0。**只滤非当前柜**；背包与当前柜全量。glistOn（ctx 门同源判定）才启用。吊栏（BasketOn）：非 bag owner 行按状态类别滤——wish=NeighborWishSnap.wishCats∪crisisCat；dying=Category==1；nowish∈{1,9,5,13,2,3,6,10}（对应 JS GLB_NOWISH_CATS 八类）。Category 取 ItemDict(cfg).Category。

- [ ] **Step 2: glistHidden 计数与 ctx 带出**

被滤行按 (cfg, uses, attrSig) 去重累计（拼行处已有三值），BuildJson ctx 追加 `"glistHidden":N`（页条件字段，非列表态缺省）。

- [ ] **Step 3: JS 页脚改读回传**

:5414-5424（rat-brew 页脚）与 :5453-5455（「已隐藏 N 种」）改读 `ctx.glistHidden`（缺省 0 时保持现文案隐藏）；:4844 注释改为「吊栏按需求类别预筛（C# 侧）」。

- [ ] **Step 4: 构建**

Run: `dotnet build ...`
Expected: 0 errors。

- [ ] **Step 5: Commit**

`perf：五列表页推送前按页筛选（可燃/色素/猎物饱腹/可酿）+吊栏按需求状态类别预筛——列表显示内容不变，「已隐藏 N 种」改由 C# 按种回传`

### Task 4: 一键入库结果 C# 权威计数

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailCommands.cs`（StoreAllTask 字段 :1070-1084、结算 :1233-1245、FinishStoreTask :1295-1300）
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs`（ctx.storeAllRes 一次性字段，storeAllDone 同点位 :497-498）
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（settleXfer storeAll 分支 :929-950、armStoreAll :1012-1016）

**Interfaces:**
- Produces: `ctx.storeAllRes = {"cabs":[[ownerId,件数]…],"left":件数}`（随完成哨兵包一次性带出即清）。

- [ ] **Step 1: C# 计数**

StoreAllTask 加 `Dictionary<int,long> CabPieces` 与 `long LeftPieces`；结算处（:1240 吸收判定）`CabPieces[cab]+=p.cnt-now`；终局无匹配（:1264）`LeftPieces+=p.cnt`；FinishStoreTask 组 JSON 经 `RailData.SetStoreAllRes(json)` 随哨兵带出。

- [ ] **Step 2: JS 改读 ctx**

settleXfer storeAll 分支的逐柜差量（:933-947）改读 ctx.storeAllRes（文案措辞不变，单位=件与现状一致）；armStoreAll 删 snaps（XFER 只留 {kind,hold,bag}——bag 快照供「背包是空的」前置判定保留）；tidy 路的 owner/before 快照不动。

- [ ] **Step 3: 构建**

Run: `dotnet build ...`
Expected: 0 errors。

- [ ] **Step 4: Commit**

`refactor：一键入库结果改 C# 任务权威计数（ctx.storeAllRes 逐柜件数+留背包件数），退役 JS 全屋柜快照结算`

### Task 5: 名单/筛选按需触发 + TagFilter 探活注入

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs`（AccessTicker 慢通道 :410-453 重构；Update 序 :370-396）
- Modify: `SurvivalLog.CabinetEverywhere/RailUi.cs`（ReapplyOnBattleStart :333-340 补 BagBurden.SlowTick；场景活跃边沿缓存）
- Modify: `SurvivalLog.CabinetEverywhere/RailCommands.cs`（OpStoreAll 入口 :1111-1146 前置重扫）
- Modify: `SurvivalLog.CabinetEverywhere/TagFilter.cs`（Tick :33-67 重构为探活+签名推送；:52/:55 改带回调重载）

**Interfaces:**
- Consumes: Task 2 的 ActivePage/场景判定。
- Produces: `AccessTicker.SlowPass(string reason)`（"open"|"rerun"|"load"|"storeall" 四源共入口；内部按 reason 取舍执行 RebuildConfigIds/CraftSourceInjector.Ensure/RemoveAll/BagBurden.SlowTick/RefreshHomeInstances/RefreshMeta/TagFilter 数据推）。

- [ ] **Step 1: 慢通道重构**

删 _slowCheck 5s 累计（:366、:410-415）；Update 内加场景边沿检测（closed→open 或 ActivePage 变）→ SlowPass("open")，置于 TabInjector.FastPoll **之前**；Rerun 置位时当帧 SlowPass("rerun")（原 :411-419 消费点平移，含 RebuildConfigIds/Ensure/BagBurden.SlowTick）；ReapplyOnBattleStart（RailUi.cs:333-340）尾部只补一行 `BagBurden.SlowTick();`（读档链，不调 AccessTicker）；OpStoreAll 在柜候选枚举前 `CabinetCatalog.RefreshHomeInstances()+RailData.RefreshMeta()`。General.Enabled=false 早退门（:403-408）保留。

- [ ] **Step 2: TagFilter 探活+签名推送**

照 RailUi.InjectBootstrap 探针状态机（RailUi.cs:736-777）：每周期几十字节探针 `window.__SLTF__?1:0`，确认存活后零注入、WebView 重建自动重注并补推一包；数据推送条件=有储物界面开 && 名单/标签签名（AllContainers ownerId+tagIds+lib+scenario cfg 值拼串）变化；ExecuteJavaScript 全部改带回调重载。Probe 仅诊断一次的原逻辑（:56-60）随重构退役。

- [ ] **Step 3: 构建**

Run: `dotnet build ...`
Expected: 0 errors。

- [ ] **Step 4: Commit**

`perf：柜子名单与筛选数据改按需触发（开页帧/入库前/改配置/读档，全关零扫描零注入）——TagFilter 探活注入一次+签名变化才推，通道改带回调；BagBurden 补读档收敛链`

### Task 6: 收尾验证与移交

- [ ] **Step 1: 全量构建 + 工具回归**

Run: `dotnet build ...` + `dotnet run --project tools/railjson-test` + `dotnet run --project tools/basket-glist-test`（如该测试覆盖 BasketGlist 取数面）。
Expected: 全绿。

- [ ] **Step 2: 交付实机清单（作者逐项过，任一不过按 commit 回退对应 Task）**

空闲（开一页不动）无重推日志；界面全关无扫描/注入日志（开 Verbose 观察）；官方整理/机器人整理/拖放/右键取物/捡拾/丢弃/吃用一件/腐烂删除/无人机交易变动→≤1s 跟上；B 背包只收背包行、整理物资收背包+当前柜、机器页切页签角标正确（允许 ≤600ms 短暂 '-'）；五列表页行数/隐藏计数/右键取 1 件与改前一致；吊栏三状态列表内容与右键直放正常；一键入库逐柜件数文案正确；新放柜子打好标签→开烹饪/工作台页签即显；读档后负重/柜宽正常；只用筛选不开侧栏（Rail.Enable=false）时开页扫描照常；温室工程台与改前完全一致。

- [ ] **Step 3: Commit（PERF_NOTES 不动，待实机通过后随发版流程补记）**

`chore：收尾——railjson-test 断言随范围形状更新，实机验收清单移交`
