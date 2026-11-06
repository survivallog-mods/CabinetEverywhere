# 燃油发电机界面柜子页签（FuelGen Cabinet Tabs）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 燃油发电机界面左侧背包面板页签化（背包+燃料标签柜），点柜中燃料直接整组送入发电机。

**Architecture:** 复用 CERail 管道——FuelGenerator 进 RailData 场景表（数据推送+drain 命令通道），railui.page.js 新增 `bagtabs` 装配模式（不替换宿主、不建侧栏壳，在官方左面板内装配页签/柜格/底行）；新命令 `feed` 走「柜→背包→官方 FUEL_ADD」两跳；右面板零改动。

**Tech Stack:** BepInEx/IL2CPP interop C#（.NET 6）、Vuplex WebView2 注入 JS（railui.page.js/railui.css）、Playwright harness（design-proto serve.cjs :8180 + tools/railui-harness-tests/*.cjs）。

**Spec:** `docs/superpowers/specs/2026-11-06-fuelgen-cabinet-tabs-design.md`（视觉基准=同 spec 引用的原型 v6）

## Global Constraints

- 作者底线：**右侧发电机面板零改动**（DOM/CSS/JS 一个字节不碰）；其他 12 个 CERail 场景零行为变化
- 红线（RailCommands.cs 文件头，逐条沿用）：drain 回调只解析入队；owner/item 白名单校验（∈ AllContainers ownerIds ∪ 背包 owner，违者丢弃+LogWarning）；只用官方 API（ItemManager.TryQuickMoveItems 等）+ 官方动作重放（Ac_*.SendAction）；每帧 ≤8 条命令；批量末尾一次 ForceRepublish
- 契约 v4 其他页形状不变：icfg 追加列 **仅** ctx.page=="FuelGenerator" 时输出
- 官方背包格 `#backpackGrid` 只允许 CSS 隐藏（display:none），永不 remove/detach/改监听
- 游戏侧常量（已实证，照抄勿改）：燃料标签 tagId=**1013**（Config_FurnitureTag）；玩家背包 12 列×18 行；`State_Web_FuelGenerator.BagOwnerId` 是 `ReactiveProperty<long>`（读 `.Value`，别家页是裸 long，不同）；`Config_Item.Burnable`(bool)/`BurnValue`(int)
- 测试基建：C# 侧=编译门（dotnet build）+ 实机矩阵；JS 侧=Playwright harness（`node design-proto/serve.cjs` 先起 :8180，再 `node tools/railui-harness-tests/<脚本>.cjs`）

## Review Focus

1. **家中无燃料柜时左面板必须与原版逐像素一致**——harness-fuelgen.cjs「no-fuel-cabinets」场景：无页签行/无底行、官方 title/info-bar/hint 全显、grid 无 inline 样式残留
2. **背包页签官方交互保真**——官方 grid 在柜子页签仅 display:none，切回即恢复；harness 回归：harness-regression.cjs 全 PASS
3. **页签再多不撑宽、面板高锁死**——harness：mock 6+柜页签 → ‹› 出现、#bagPanel offsetWidth 前后不变、短柜底行位置不变
4. **feed 两跳的叠并重解析**（背包已有同 cfg 叠时移动会并叠、InstanceId 变）——实机矩阵项（harness mock 覆盖不了），Task 5 清单钉死
5. **拒绝路径全反馈 + 键绑定不泄漏**——notfuel/full/bagfull/noitem 四路 ctx.feedFail→JS 红字；切走场景后 A/D 无效（root 绑定守卫）；harness 逐路断言
6. **官方 JS 查询点不踩**（T9 纪律）——FuelGenerator.html 的 getElementById/$ 查询全量清点入 Task 3 注释表，隐藏元素查询仍可达

---

### Task 1: C# 数据层——场景接入 + Fuel 视图 + icfg 追加列

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs`（枚举与 cfg 绑定区，~L15/L71/L126-155）
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs`（Scenes 表 L59-73、ResolveBagOwner L559-566、ScenarioViewOf L338-364、BuildJson ctx L392-413、BuildIcfgRow L763-797、RefreshActivePage L111-126）

**Interfaces:**
- Consumes: 现有 SceneDef/ScenarioViewOf/BuildIcfgRow/RefreshActivePage 结构（签名不变，加分支）
- Produces（Task 2/3 依赖）: `ScenarioView.Fuel` 枚举成员；cfg `View_FuelGenerator`（默认 Fuel）、`EnableFuelGen`（默认 true，SettingChanged→Rerun）；ctx.page=="FuelGenerator" 时 ctx.view=="fuel"（默认）；icfg 行尾追加 `[,burnable(0/1),burnValue(int)]` 两列（仅本页）；`case "FuelGenerator": Ac_FuelGenerator_RefreshBag.SendAction()`；背包 owner 取 `State_Web_FuelGenerator.BagOwnerId.Value`

- [ ] **Step 1: 枚举与 cfg 绑定**（CabinetEverywherePlugin.cs）
  - `public enum ScenarioView { Food, Material, Browser, Fuel }`（doc 注释：Fuel=带「燃料」标签(1013)的柜子，本批仅 FuelGenerator 页消费）
  - 绑定区加：`ViewFuelGenerator = Config.Bind("Scenario", "View_FuelGenerator", ScenarioView.Fuel, "燃油发电机" + viewDesc);` + `EnableFuelGen = Config.Bind("Access", "EnableFuelGen", true, "燃油发电机界面柜子页签（背包+燃料标签柜）。");` + 两者的 SettingChanged→`Rerun = true`
- [ ] **Step 2: 场景表条目**（RailData.cs Scenes）——`new SceneDef{ Page="FuelGenerator", Family="fg", ReadsPlayerBagOwner=true, UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_FuelGenerator)) }`（注释：bagtabs 装配页，无侧栏壳；JS 侧 SCENES.FuelGenerator.bagtabs 对应）
- [ ] **Step 3: 背包 owner 与视图映射**——ResolveBagOwner switch 加 `"FuelGenerator" => raw?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_FuelGenerator>()?.BagOwnerId?.Value ?? 0`（注意 ReactiveProperty 取 .Value，与别家裸 long 不同）；ScenarioViewOf 加 case + switch 映射 `Fuel => "fuel"`
- [ ] **Step 4: icfg 本页追加列**——BuildIcfgRow 加可选参数 `bool fuelCols`（默认 false，本页调用点传 `sc?.Page=="FuelGenerator"`）；true 时行尾 `.Append(',').Append(ic.Burnable ? 1 : 0).Append(',').Append(ic.BurnValue)`（try/catch 同款包裹，读不到=0,0；**禁止**从 Category==13 推导——spec 裁定）
- [ ] **Step 5: 官方刷新动作**——RefreshActivePage switch 加 `case "FuelGenerator": GameCore.HotUpdate.ReduxUI.Ac_FuelGenerator_RefreshBag.SendAction(); break;`
- [ ] **Step 6: 编译验证**

Run: `dotnet build SurvivalLog.CabinetEverywhere/SurvivalLog.CabinetEverywhere.csproj`
Expected: Build succeeded, 0 errors

- [ ] **Step 7: Commit**——`feat(cerail): 燃油发电机数据层——场景表+Fuel视图+icfg燃烧列+刷新动作`

### Task 2: C# 命令层——OpFeed（两跳）+ ctx.feedFail

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailCommands.cs`（Cmd 模型 L82-92、ToCmd L134-149、Execute switch L208-227、新增 OpFeed；文件头 cmd 契约注释补一行）
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs`（ctx 一次性标志：`_feedFailPending`/`MarkFeedFail(reason)`，照 `_tidyFailPending` 先例 L330；BuildJson ctx 尾部加 `,"feedFail":"notfuel|full|bagfull|noitem|空"`——注意早退分支不清、推出即清）

**Interfaces:**
- Consumes: Task 1 全部；现有 `RailData.BagOwner()/ItemMgr()/OwnerItems()/ItemOf()/Whitelisted()`、`im.TryQuickMoveItems(List<long>, from, to, SilentQuickMove, false)`
- Produces（Task 3 依赖）: drain 命令 `{op:"feed", owner:<long>, item:<long InstanceId>}`；ctx.feedFail 一次性字符串（"notfuel"|"full"|"bagfull"|"noitem"），JS 映射文案：notfuel=只能添加燃料 / full=燃油槽已满 / bagfull=背包已满，无法转送 / noitem=物品已不在柜中

- [ ] **Step 1: 契约解析**——Cmd 加 `public long Item;`；ToCmd 加 `c.Item = Lng(o, "item");`；Execute switch 加 `case "feed": OpFeed(c); break;`；文件头注释补：`feed {owner,item}  燃油发电机柜中燃料整组直送：两跳（柜→背包→官方FUEL_ADD）+叠并重解析（spec §5.3）`
- [ ] **Step 2: OpFeed 主流程**（顺序即校验序）：
  1. `Whitelisted(c.Owner)` 不过→丢弃+LogWarning（红线2）；`c.Item<=0` 丢弃
  2. burnable 权威校验：OwnerItems(im, c.Owner) 取 ItemData→`Config_Item.Burnable`（经 `cm._Config_Item_Dict[ItemData.ConfigId]`）——非燃料→`RailData.MarkFeedFail("notfuel")` return
  3. 容量校验：`State_Web_FuelGenerator`（Redux 单例同 ResolveBagOwner 取法）`FuelItems.Count >= FuelSlotCount.Value`→MarkFeedFail("full") return（校准注：若 FuelItems 不含在燃格，实机按官方 JS 谓词 `(activeFuel?1:0)+queue>=fuelSlotCount` 校准——Task 5 矩阵项）
  4. 两跳：`im.TryQuickMoveItems([c.Item], c.Owner, bag, SilentQuickMove, false)`==0→MarkFeedFail("noitem") return
  5. **叠并重解析**：背包 OwnerItems 里找 `ConfigId` 相同的叠（原 InstanceId 可能已并入既存叠消失）→取其 InstanceId；找不到→MarkFeedFail("noitem") return
  6. 官方动作：`Ac_FuelGenerator_FuelAdd.SendAction("{\"itemId\":" + resolvedId + "}")`（官方静态派发，rackOpen 同款纪律）
  7. 收尾由 Pump 统一：mutated→RefreshActivePage（Task 1 已挂 FuelGenerator case）+ForceRepublish
  - 背包满：TryQuickMoveItems 返回 0 且物品仍在柜→与 noitem 同路径前先判「ItemOf(inner原owner, c.Item) 仍存在」→存在=背包满 MarkFeedFail("bagfull")；不存在=noitem
  - **v1 只走两跳**（spec 允许：S1 直达路属优化项）——若后续反编译/实机实证 `RA_FuelAdd` 认柜中物品，再加直发短路（独立小改动，不影响本计划结构）
- [ ] **Step 3: ctx.feedFail 一次性标志**——RailData 照 lastTidyFail 三处：字段/Mark 方法/BuildJson ctx 追加（`sb.Append(",\"feedFail\":\"").Append(_feedFailPending ? _feedFailCode : "").Append('"')`，append 后即清）
- [ ] **Step 4: 编译验证**——同 Task 1 Step 6
- [ ] **Step 5: Commit**——`feat(cerail): OpFeed 两跳命令+feedFail 回执——柜中燃料整组直送燃油发电机`

### Task 3: JS bagtabs 装配 + fixture + harness 测试

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（SCENES 表 L167-188 加 FuelGenerator 条目；viewAllows 加 fuel 分支；icfg 尾列消费；新增 bagtabs 装配函数块；cmdOut 复用）
- Modify: `SurvivalLog.CabinetEverywhere/railui.css`（末尾加 `/* FuelGen bagtabs */` 段：页签栏/底行按钮/警告条/宽锁样式，全部 `srfg-` 前缀）
- Create: `SurvivalLog.CabinetEverywhere/design-proto/fixtures/FuelGenerator.html`（官方页结构拷贝：#generatorSystem>两 .panel，左含 #bagPanelTitle/#bagInfoBar/#backpackGrid/.hint-shift，右 gen-panel 含 #fuelQueueZone 8 空槽——从 gamekb webui/UI/FuelGenerator/FuelGenerator.html 抠结构，去脚本逻辑留静态）
- Modify: `SurvivalLog.CabinetEverywhere/design-proto/railui-root-harness.html`（12 iframe 建表 L286-310 加第 13 个 `FuelGenerator`；mock 数据集加燃料柜 ctn 行 [owner,"燃料柜·大号",'c',…,1013]×3 + 无燃料柜场景切换钮）
- Create: `tools/railui-harness-tests/harness-fuelgen.cjs`

**Interfaces:**
- Consumes: Task 1 ctx.view=="fuel"/icfg 尾列；Task 2 feed 命令契约与 ctx.feedFail 文案映射；现有 `cmdOut(op,payload)`/`drain()`/`store/ctn/items` 渲染数据结构
- Produces: SCENES 条目 `FuelGenerator: { host: null, bagtabs: true, family: 'fg', grid: 'backpackGrid' }`（host:null=不替换宿主——ensureMounted 需放行该形态）；`viewAllows(ctn,'fuel')`=ctn.tags 含 1013；icfg 解析暴露 `cfgBurnable(cfgId)/cfgBurnValue(cfgId)`；mod DOM 常量 id：`srfgTabs/srfgScroll/srfgGrid/srfgFoot/srfgWarn`

- [ ] **Step 1: fixture + harness 场景**——FuelGenerator.html 静态模板（官方类名/id 原样）；root harness 建 iframe + `FuelGenerator`/`FuelGenNoCtn`（无燃料柜）两个场景钮；mock 契约包：ctn 含 2 个带 1013 柜 + 1 个无标签柜，items 带燃料（icfg 尾列 [1,600]）与非燃料（[0,0]），bag owner=900001
- [ ] **Step 2: 写失败测试**（harness-fuelgen.cjs，断言=Review Focus 1/2/3/5/6）
  - `fg:tabs-render`——FuelGenerator 场景：`#srfgTabs` 存在，页签=背包+2 柜（1013 过滤、无标签柜不出现），官方 #bagPanelTitle/#bagInfoBar/.hint-shift 隐藏
  - `fg:bag-tab-official`——背包页签：#backpackGrid 可见且未被移动（父节点仍为官方 .panel）；点柜页签→grid display:none、`#srfgGrid` 渲染该柜物品、燃料带 `.is-fuel`；切回背包→官方 grid 恢复可见
  - `fg:feed-cmd`——点柜中燃料→drain JSON `{op:'feed',owner:<柜>,item:<id>}`；点非燃料→无 drain、#srfgWarn 文本「只能添加燃料」
  - `fg:full-precheck`——fixture 把 8 槽全置 .queued-item→点燃料→「燃油槽已满」无 drain
  - `fg:feedfail-ctx`——mock 执行器置 ctx.feedFail="bagfull" 重推→#srfgWarn「背包已满，无法转送」（一次性，二次推不重复弹）
  - `fg:width-lock`——mount 时记 #bagPanel offsetWidth；加第 4 个柜页签→宽度不变、‹› 可见
  - `fg:ad-keys`——iframe document 派发 keydown 'd'→页签前进一步；root 派发 'a'→后退（双路守卫）；切到 Cooking 场景再派发→无动作（不泄漏）
  - `fg:tidy-btn`——#srfgFoot 仅一键整理按钮，柜页签点击→drain `{op:'tidy',owner:<柜>}`；背包页签→owner=900001
  - `fg:no-fuel-cabinets`——FuelGenNoCtn 场景：#srfgTabs/#srfgFoot 不存在，官方 title/info-bar/hint/grid 全显（Review Focus 1）
  - `fg:console-clean`——全流程 console 零 error/pageerror
- [ ] **Step 3: 跑测试确认失败**——`node tools/railui-harness-tests/harness-fuelgen.cjs`（serve.cjs 先起）Expected: FAIL（srfg* 未定义/场景未装配）
- [ ] **Step 4: 实现**
  - SCENES.FuelGenerator 条目（host:null 放行：ensureMounted 对 bagtabs 场景判定「官方 #backpackGrid 在文档且无 #srfgTabs」即装配）
  - viewAllows fuel 分支：`view==='fuel' ? (ctn.tags.indexOf(1013)>=0) : …`（1013 硬编码+注释出处 Config_FurnitureTag）
  - normIcfg 本页尾列消费→cfgBurnable/cfgBurnValue
  - 装配块（一次性 mount+render 两相）：页签栏（克隆官方 Cooking bag-tab 结构，样式走 railui.css srfg- 前缀；背包 pinned 首签+‹›滚动）；柜格 `#srfgGrid`（官方 .slot/.item/.is-fuel 类直接复用——同文档官方样式表天然可用；燃料角标=icfg burnable）；底行 `#srfgFoot`（仅整理钮→cmdOut('tidy',{owner:当前签 owner})）；警告条 `#srfgWarn`（克隆官方 .warning-box 观感，位置=左面板格网下方）
  - 点击：柜物品→JS 预检（icfg burnable→notfuel；#fuelQueueZone 占用槽>=总槽→full）过→cmdOut('feed',{owner,item})；预检拒=直接弹 #srfgWarn 同文案（省一次往返）
  - ctx.feedFail 消费：setData 时非空→弹映射文案→清本地
  - 宽高锁：mount 时量 #bagPanel 自然宽（=官方 12 列背包格宽）写 inline max-width；高=右 .gen-panel offsetHeight 写 inline height；格网区 flex 主体+max-height:100% 滚动（8px 经典条样式随 railui.css）
  - A/D：iframe document 与 root window 双绑 keydown，handler 首行守卫「当前场景==FuelGenerator」，50ms 去重
  - 官方查询点清点表（Review Focus 6）：实现注释里列 FuelGenerator.html 全部 getElementById/$ 目标与「仅隐藏未移除」结论
- [ ] **Step 5: 跑测试确认通过**——同 Step 3 命令 Expected: 全 PASS
- [ ] **Step 6: 回归**——`node tools/railui-harness-tests/harness-regression.cjs` + `harness-tidy.cjs` + `harness-native-width.cjs` + `harness-width-floor.cjs` Expected: 全 PASS（12 场景零变化）
- [ ] **Step 7: Commit**——`feat(cerail): 燃油发电机 bagtabs 装配——页签/柜格/底行/宽高锁/A-D + fixture/harness 十路断言`

### Task 4: 文档收口

**Files:**
- Modify: `README.md` 与 `SurvivalLog.CabinetEverywhere/README.md`（撤「发电机加油界面不在范围」段，改为已覆盖说明）
- Modify: `SurvivalLog.CabinetEverywhere/DESIGN.md`（L21 同句修正+新章节：FuelGen bagtables 模式一页纸——复用管道/两跳/底线）
- Modify: `SurvivalLog.CabinetEverywhere/CHANGELOG.md`（顶部待发版批次：二十一批 燃油发电机柜子页签）
- Modify: `SurvivalLog.CabinetEverywhere/UI-SPEC.md`（§场景表加 FuelGenerator bagtabs 条目，视觉基准指向原型 v6 存档路径）

- [ ] **Step 1: 四文档同步更新**（版本号不 bump——作者定版纪律）
- [ ] **Step 2: 全量验证**——`dotnet build` + Task 3 Step 6 全部 harness Expected: 全绿
- [ ] **Step 3: Commit**——`docs(cerail): 燃油发电机柜子页签四文档——README范围/DESIGN/CHANGELOG/UI-SPEC`

### Task 5: 实机验收矩阵（作者机器）

**Files:**
- Modify: `tools/railui-harness-tests/ingame-matrix.cjs`（加 FuelGenerator 场景行；用例=spec §8 验收 1-8 逐条）

- [ ] **Step 1: ingame-matrix.cjs 扩展**——CDP 用例（AllowDebugUiShow/RemoteDebugPort 现有开关）：①页签渲染+右面板截图对比原版 ②无燃料柜=原版 ③点柴火整组入槽/非燃料红字/满员红字 ④背包页签官方右键·Shift·拖拽照常 ⑤短柜留白+长柜滚动 ⑥‹›+A/D ⑦整理两页签 ⑧cfg 三开关退场（EnableFuelGen/General.Enabled/Rail Enable）；**另钉两处校准**：FeedItems 是否含在燃格（Task 2 Step 2.3 校准注）；叠并重解析实机验证（背包预放同 cfg 叠→feed→断言进槽）
- [ ] **Step 2: 作者实机跑矩阵**——Expected: spec §8 九条全过（含第 9 条：其余 12 场景回归）
- [ ] **Step 3: Commit**——`test(cerail): 实机矩阵扩燃油发电机八用例+两校准点`
