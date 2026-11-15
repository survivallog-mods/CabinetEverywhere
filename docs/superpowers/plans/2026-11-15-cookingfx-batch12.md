# Cooking Recipe FX 批1+批2 实施计划（菜谱排序 chips + 这一锅属性区间）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 烹饪页菜谱书加五枚排序 chips（默认/饱腹/心态/精力/生命，同值按菜谱 ID 升序），"这一锅"已知菜谱行内加图标化属性区间 chips。

**Architecture:** C# 侧 `CookingFx.cs` 经探活状态机（TagFilter 同款）向 Root WebView 注入 `cookingfx.page.js` 并推两类包（静态排序键表 + 动态预测区间包）；JS 在 Cooking iframe（同源 contentDocument）内做 chips 注入与 DOM 稳定重排，零触碰官方数据流。区间公式在 `CookingFxMath.cs` 纯逻辑层（tools console 断言工件）。

**Tech Stack:** BepInEx + Il2CppInterop + HarmonyLib（批2 沿钩可选用）；Vuplex WebView ExecuteJavaScript；vanilla JS。

**Spec:** `docs/superpowers/specs/2026-11-15-cooking-recipe-fx-design.md`（§2 实证/§3 目标/§5.1/§5.2/§6 T0/§7 原型结论随计划同行）。批3（可见集对齐）不在本计划——前置 T0 实机试探（设计 §6），另出计划。

## Global Constraints

- 只作用 Cooking 页；其他 11 页观感行为零变化（spec §3 反目标）。
- 官方 DOM/事件监听零篡改：chips=壳层 overlay，排序=DOM 节点重排；官方 DOM 写入仅限 chips 注入与 appendChild 移动（spec §3/§4）。
- 排序 tiebreak：数值降序 → 同值菜谱 ID 升序 → 无键垫底（组内 ID 升序）→ craftLocked 垫尾；"默认"=官方序快照还原（spec §3 目标 1，作者批改#2）。
- 区间 chips：图标（**官方原生字形优先**：C# 读 `State_Web_CoreUI1.AttrList` 的 `AttrIcon.Value` 下发 `setIcons({d0..d3})`，读不到回退内联 SVG 饭碗/笑脸/闪电/心）+ 数值，无文字标签，悬停 title=维度名；全 0 维不显示；单值收敛（作者批改#1/#3）。
- 通道键名：JS 全局 `window.__CEFX__`（`setRecipes`/`setPred`）、localStorage `cefx_sort_v1`、日志前缀 `[CookingFx]`。
- 行数纪律：`CookingFx.cs` ≤300（工具类）、`CookingFxMath.cs` ≤300。
- 所有 interop 访问 try/catch 吞异常回退（PerfDiag.Swallow 或 WarnOnce），反射调官方方法缺方法=告警+回退。
- C# 推送必须走 `ExecuteJavaScript(script, callback)` 带回调重载（单参重载本机静默丢弃，RailUi 实机铁证）。
- 文案中文；代码注释密度随项目（文件头块注释+关键决策行）。
- 主文档 `DESIGN.md` 与 `CHANGELOG.md` 随批更新（项目文档维护规则）。

## Review Focus（无任务测试覆盖、最可能咬人的输入类）

1. **组条目（variantCount>1）代表 ID**：代表是真实菜谱 ID（`DishCodexGrouping.Representative`），静态表必含；若代表 ID 查表 miss → 该组无键垫底（不炸）。→ T3 断言：组条目随代表 VD 排序。
2. **PredictionListJson 异形/空锅**：JSON 空串、null、未知字段 → C# 守卫跳过、JS try/catch 不渲染，无控制台报错。→ T5 断言：空 pred 包=行内无 chips。
3. **WebView 重建/iframe 重载**：探针 absent 沿重注 bootstrap、数据补推一包（TagFilter 状态机语义照抄）。→ T4 实机验收项。
4. **GlobalSetting 四系数键缺失**：`CookingVD_QualityCoeff_Fail/Perfect`、`CookingVD_TierCoeff_*` 任一缺 → 回退 1.0 + WarnOnce，区间退化为 Σ 食材值区间仍显示。→ T2 断言：缺键委托下 TagRange 落在 Σ×[1,1] 口径。
5. **负值食材区间反转**：Σ 为负时 [qFail,qPerfect] 两端倒序 → min/max 归一（spike bug 1）。→ T1 断言：负值算例区间 [min,max] 有序。
6. **官方字形包缺失**：CoreUI1 state 不可读 / AttrIcon 空 → JS 收不到 setIcons 或包内字形空 → 回退 SVG 不空窗。→ T3 harness 断言：清图标包后全 SVG；T4 实机验收：HUD 正常时 log 字形包四值。

---

### Task 1: CookingFxMath 纯逻辑上移主工程 + console 断言工件

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/CookingFxMath.cs`（源=`design-proto/cookfx/cookfx-math/CookingFxMath.cs` 上移，namespace 改 `SurvivalLog.CabinetEverywhere`）
- Create: `tools/cookfx-math-test/cookfx-math-test.csproj` + `Program.cs`（railjson-test 同构：`<Compile Include="..\..\SurvivalLog.CabinetEverywhere\CookingFxMath.cs" Link="CookingFxMath.cs" />`）
- Test: `tools/cookfx-math-test/Program.cs`（自断言 console，源=spike Program.cs 上移）

**Interfaces:**
- Produces: `static class CookingFxMath`，方法签名照 spike 不变：`float[][] ExactRange(float[][] tierVd)`、`float[][] TagRange(IReadOnlyList<float[]> ingredientVd, IReadOnlyList<int> counts, float tierCoeff, float qFail, float qPerfect, float baseBonus)`、`bool ShouldShow(float[] dimRange)`、`string FormatRange(float min, float max)`、`int CompareSortKeys(float? a, float? b)`、常量 `DimSatiety..DimVitality`/`TierPerfect..TierFail`。后续任务只依赖这些名字。

- [ ] **Step 1: 建 csproj + 上移两文件（namespace 全局改 `SurvivalLog.CabinetEverywhere`，Program 断言集照搬 spike 20 条）**
- [ ] **Step 2: 追加断言：负键 vs 无键次序（负键为"有键"排无键前）**

```csharp
Eq("cmp.negative-vs-missing", CookingFxMath.CompareSortKeys(-6f, null), -1);
```

- [ ] **Step 3: 运行断言工件**

Run: `DOTNET_MULTILEVEL_LOOKUP=0 ../sdk/dotnet/dotnet.exe run`（cwd=`tools/cookfx-math-test`）
Expected: `ALL PASS`（21 条+）

- [ ] **Step 4: Commit** `feat：CookingFxMath 区间/排序纯逻辑上移主工程+断言工件（spike 全绿口径）`

### Task 2: CookingFx 静态表构建（C# 数据侧，可离线测的纯变换 + interop 薄壳）

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/CookingFx.cs`（本任务只建静态表部分；通道接线在 T4）
- Test: `tools/cookfx-math-test/Program.cs` 追加断言（csproj 增 `<Compile Include="..\..\SurvivalLog.CabinetEverywhere\CookingFx.cs" Link="CookingFx.cs" />`）

**Interfaces:**
- Consumes: `CookingFxMath`（T1）。
- Produces:
  - `internal static string BuildRecipeTableJson(IEnumerable<(int id, int[] productIds)> recipes, Func<int, float[]> vdOf)`——纯函数：vdOf=产物 ConfigId→`float[5]{ValueDisplay1..5}`（interop 层委托，离线测试注入假委托）；输出 `{"id":[vd1..vd5]}`（排序键取 Normal 位即 productIds 索引 2）。
  - `internal static float[] ReadCoeffs(Func<string, float?> gsOf)`——纯函数：键 `CookingVD_QualityCoeff_Fail/Perfect`、`CookingVD_TierCoeff_High/Mid/Low` → `[qFail,qPerfect,tierHigh,tierMid,tierLow]`，任一缺→1.0。

- [ ] **Step 1: 写失败断言（Program.cs 追加）**：BuildRecipeTableJson 用 2 条假菜谱（佛跳墙 4 档、全家桶 4 档）断言 JSON 串逐字节（Normal 键位=索引 2）；ReadCoeffs 全键在/缺键两组断言（缺→1.0）。
- [ ] **Step 2: 跑工件确认 FAIL（类型缺失）**
- [ ] **Step 3: 实现 CookingFx.cs**——文件头块注释（定位/通道/纪律三行式，TagFilter 同款）；静态表缓存 `_recipeTableJson`（构建一次，WebView 生命周期内不重算）；interop 壳 `TryBuildTable()`：`BagTable.Cm()` → `cm._Config_CookingRecipe_Dict` 遍历（`ID/PerfectItemID/GoodItemID/NormalItemID/FailItemID` 属性直访）→ `_Config_Item_Dict` 查 `ValueDisplay1..5`，任一产物缺配置→该菜谱跳过（不进表=无键垫底）；整体 try/catch 返回 null。
- [ ] **Step 4: 跑工件 PASS**
- [ ] **Step 5: Commit** `feat：CookingFx 静态排序键表构建（纯变换可测+interop 薄壳）`

### Task 3: cookingfx.page.js（批1 全功能）+ harness 切换到 shipping 文件

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/cookingfx.page.js`（源=`design-proto/cookfx/cookfx.proto.js` 逻辑搬运，加探活幂等头）
- Modify: `design-proto/cookfx/cookfx-harness.html`（脚本引用改 `"../../cookingfx.page.js"`——serve.cjs 三级解析到 MODROOT；fixtures 保留原位）
- Test: Playwright 断言集（本次会话已验证的 evaluate 脚本，存 `design-proto/cookfx/cookfx-assert.js` 供复跑：断言 A-F + 同值 tiebreak + 三次重挂确定性 + 图标无文字残留）

**Interfaces:**
- Consumes: `window.__CEFX__.setRecipes(json字符串或对象)`、`setPred(json)`、`setIcons(json|null)`（C# T4 调用；JS 侧各入口都接受 string|object|null）。
- Produces: DOM 契约——chips 容器注在菜谱书头部（实机=官方 Cooking.html 菜谱书标题区，选择器实机定版；harness=`#cefxChips`）；重排作用域=菜谱列表容器（实机选择器实机定版，harness=`#bookList`）；区间 chips 注入预测行（实机=`#predictionList` 行内，harness=`#predList`）。
- **三条重排硬约束照抄原型 v2**（自触发环防线 / queueMicrotask 复位 / 官方序快照），代码已定，照搬不改。
- **图标双形态**（批改#3）：`iconPack`（官方字形 `{d0..d3}`，CoreUI1 AttrIcon）优先，null/空字形回退内联 SVG `DIM_ICON`——原型 v3 已定稿，照搬。

- [ ] **Step 1: 搬运并改造 proto.js → cookingfx.page.js**——顶部加幂等头 `if (window.__CEFX__) return;`；`DIM_ICON` 四枚 SVG（回退）+ `setIcons` 字形包优先、tiebreak=ID 升序、`b.cefx-vdN` 样式契约（CSS 由 JS 注 `<style>`——实机无 harness style 可依赖）；实机选择器留 `SEL` 配置对象（`chipsHost/bookList/predList` 三键，harness 值默认，实机 T4 定版改值）。
- [ ] **Step 2: harness 改引 shipping 文件 + Playwright 复跑断言集**

Run: `node design-proto/serve.cjs`（已活着则复用 8180）→ Playwright 开 `http://127.0.0.1:8180/cookfx/cookfx-harness.html` → 执行 cookfx-assert.js 断言
Expected: A 官方序 / B 饱腹序（同值 1002→1015、1005→1014）/ C 三次重挂一致 / D 同值组=true / E 图标 svg+title / F 无文字残留 全过

- [ ] **Step 3: Commit** `feat：cookingfx.page.js 批1（chips+DOM 稳定重排三条硬约束）+harness 切 shipping 源`

### Task 4: C# 通道接线（探活注入 + 静态表推送 + cfg 开关）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/CookingFx.cs`（加通道段：探活状态机+Poll）
- Modify: `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs`（cfg 绑定 `[CookingFx] Enable` 默认 true + AccessTicker 0.5s 段挂 `CookingFx.Poll()`，位置=TradeFx.Poll 后）
- Modify: `SurvivalLog.CabinetEverywhere/SurvivalLog.CabinetEverywhere.csproj`（`<EmbeddedResource Include="cookingfx.page.js" LogicalName="SurvivalLog.CabinetEverywhere.cookingfx.page.js" />`）

**Interfaces:**
- Consumes: T2 `TryBuildTable()`、T3 `__CEFX__.setRecipes`/`setIcons`。
- Produces: `internal static void Poll()`（AccessTicker 调用）；`internal static string BuildIconPackJson(...)` 纯函数（`(int attrNameKey, string icon)[] → {"d0":"🍗",...}`，四维映射 Satiety/Morale/Stamina/Health→d0..d3，Vitality→d4 备用，空/缺→该键不输出=JS 回退）；探活状态机字段语义照抄 `TagFilter.cs`（`_alive/_probeState/_probeCb/_ackCb/_lastJson`）。

- [ ] **Step 1: 实现通道段**——探针 `window.__CEFX__?1:0` → absent 沿注 bootstrap（内嵌资源读法=TagFilter.ReadBootstrap 同款）→ alive 沿置脏补推；数据包=`setRecipes(TryBuildTable())` + `setIcons(图标包)`（读 `GetStateByUI(State_Web_CoreUI1).AttrList` 遍历 `AttrNameKey/AttrIcon.Value`，HUD 常驻；异常/空→不推=JS SVG 回退，WarnOnce）仅烹饪 UI 活跃时（`ReduxUISystem.IsUIActive(Il2CppType.From(typeof(WebUI_Cooking)))`，TabInjector.IsUIActive 同款 try/catch）；门控首行：cfg false / UI 不活跃 → 探针都不发（零开销）。JS 侧 SEL 实机选择器本步实机定版（log 首装打印）。
- [ ] **Step 2: 构建全绿**

Run: `DOTNET_MULTILEVEL_LOOKUP=0 sdk/dotnet/dotnet.exe build SurvivalLog.CabinetEverywhere/SurvivalLog.CabinetEverywhere.csproj`（cwd=mod 根）
Expected: 0 error 0 warning（新增文件）

- [ ] **Step 3: Commit** `feat：CookingFx 探活通道接线（TagFilter 状态机同款+cfg 开关+AccessTicker 挂点）`

### Task 5: 批2 动态侧（这一锅区间包 + 图标 chips 渲染）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/CookingFx.cs`（加 `BuildPredEntryJson` 纯函数 + Poll 层组装推送）
- Modify: `SurvivalLog.CabinetEverywhere/cookingfx.page.js`（仅当 dims 契约有变时同步；正常无 JS 改动）
- Test: `tools/cookfx-math-test/Program.cs` 追加 `BuildPredEntryJson`/`FilterKnownEntries` 纯函数断言

**Interfaces:**
- Consumes: `CookingFxMath.ExactRange/TagRange/ShouldShow`（T1）；`ReadCoeffs`（T2）；state 契约（实机）：`State_Web_Cooking.WorkbenchItems`（`ObservableList<Data_Web_Cooking_Item>`，取 `ConfigId/Count`）、`PredictionListJson.Value`（string，条目 `{RecipeId,Name,Tier,Level,IsExact,Icon,CookTime}`，`Level===2` 为已知必出）。
- Produces: `internal static string BuildPredEntryJson(bool isExact, float[][] tierVd, IReadOnlyList<float[]> ingredientVd, IReadOnlyList<int> counts, float tierCoeff, float qFail, float qPerfect, float baseBonus)`——纯函数：exact→ExactRange；tag→vd1/4/5 TagRange + vd2/3 取 tierVd 4 档区间；输出 `{"dims":[[min,max]|null ×4]}`（四维渲染白名单，全 0→null）。`internal static IEnumerable<(int recipeId, bool isExact)> FilterKnownEntries(IEnumerable<(int recipeId, int level)> entries)`——Level===2 且 RecipeId!==0 才过。推送包形状：`{"entries":[{"recipeId":int,"dims":[...]}]}`（JS T3 契约不变）。

- [ ] **Step 1: 写失败断言**：exact 路（佛跳墙实值→dims=`[[20,45],[1,5],null,null]`）；tag 路（spike 肉*2+蔬菜算例+系数）；`FilterKnownEntries`：Level!==2 / RecipeId===0 条目被滤（黑暗料理初版不显示区间，spec 非目标）。
- [ ] **Step 2: 跑工件 FAIL → 实现 → PASS**
- [ ] **Step 3: Poll 层组装**——`GetStateByUI(Il2CppType.From(typeof(WebUI_Cooking))).TryCast<State_Web_Cooking>()`（TabInjector 162 行同款）→ WorkbenchItems 按 ConfigId 求和（`Category==1 && CanCook && !NeedCut` 过滤照官方）→ 解析 PredictionListJson（RailJson 惯例；失败整包跳过 WarnOnce）→ 对已知条目：IsExact 用配置判（`SpecificItems` 非空）而非信包内 IsExact（防官方语义漂移，注释说明）→ tier 反射调官方 `Reducer_Web_Cooking.ResolvePredictionTier`（AccessTools.Method 按名，缺→tierCoeff=Mid 档兜底）→ BuildPredEntryJson → 同串免重推（`_lastPredJson`）。**沿取舍**：本批只做 0.5s 轮询（TradeFx 批1 同款架构）；spec §5.2 的 `RefreshRecipeList` postfix 官方刷新沿留作实机体验后可选增补（迟滞可感知才加，TradeFxRefreshHook 30 行同款）。
- [ ] **Step 4: 构建绿 + harness 预测断言复跑（T3 断言集 E/F 段）**
- [ ] **Step 5: Commit** `feat：CookingFx 批2 这一锅区间包（exact/tag 两路+图标 chips 渲染接线）`

### Task 6: 实机验收 + 文档同步

**Files:**
- Modify: `DESIGN.md`（新 §：CookingFx 批1+批2 机制三行式——通道/数据/三条硬约束，引用 spec）
- Modify: `SurvivalLog.CabinetEverywhere/CHANGELOG.md`
- Modify: `README.md`（功能清单一行，若维护惯例要求）

- [ ] **Step 1: 实机验收清单（玩家侧）**——①烹饪页菜谱书出现 5 chips，点击排序正确（同值稳定）；②切"默认"回官方序；③重开烹饪界面选择记忆保持；④这一锅已知菜谱行内图标区间（全 0 维不显示；图标=HUD 同款官方字形）；⑤其他 11 页零变化；⑥`[CookingFx] Enable=false` 后重开界面=官方原样；⑦性能：界面关闭零注入零推送（log 无周期输出）。T0 顺带项：log 打印 GlobalSetting 四系数实值（缺失=WarnOnce+1.0 回退）与图标字形包四值（核对 spec §6 T0-4）。
- [ ] **Step 2: 文档同步 + Commit** `docs：CookingFx 批1+批2 设计文档与主文档同步`

## 批3 备注（另出计划，不属本计划）

前置：T0-1（interop Harmony prefix 带 out 参数试探桩）、T0-2（RA_RecipeClick 填装分支反汇编）——设计 §6。批3 交付 CookingScope/CookingStatusHook/CookingFillHook 三件 + 实机验收（设计 §8 批3 行）。
