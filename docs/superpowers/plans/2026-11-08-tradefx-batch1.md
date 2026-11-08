# TradeFx 批 1（推送通道 + A3 偏好条 + A4 天平数字）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 TradeFx 数据通道（C# 读交易状态→算→推 JSON，JS 在 TradeUI 帧渲染），交付 A3 商人想要/半价 chips 与 A4 天平条两端数字，内建 SelfCheck 数值对账保险丝。

**Architecture:** C# 侧三个新文件——TradeFxMath（纯数学，无 Il2Cpp 依赖）、TradeFxJson（纯 JSON 构建）、TradeFx（Il2Cpp 取数+0.5s 轮询+推送，挂现有 AccessTicker 快轮）；JS 侧 railui.page.js 新增 tradefx 节（`window.__CERAIL_TRADEFX__` 消费壳 + chips/bar 渲染 + missing 探针走现有 drain 通道）。零新增 patch、零新增配置。

**Tech Stack:** C# net6.0 BepInEx IL2CPP interop / 注入 JS（railui.page.js）/ harness 验收 Playwright（design-proto serve.cjs:8180 + fixtures/Trade.html）/ 纯逻辑单测 console 项目（tools/ 先例 railjson-test）。

**Spec:** `docs/superpowers/specs/2026-11-08-tradefx-design.md`（本计划从该文档出证，执行者两份都读）

**批次说明:** 批 2-4（徽章/tooltip/派送）在批 1 实机收口后各立自己的计划——批 1 的 gamekb 复核结果与通道实测决定后续形状。

## Global Constraints

- 兼容原则（作者定）：只考虑套件内 mod 与官方原生设计，**不写任何针对第三方 mod 的代码**。
- 授权红线：不搬 BetterTrade 反编译代码（`thirdparty/BetterTrade/decompiled/` 只读参照）；交易公式经 gamekb 从游戏本体反推；对拍是开发期验收动作，交付物零相关代码。
- ExecuteJavaScript 必须走**带回调重载**（单参重载在本 Vuplex/Il2Cpp 组合静默丢脚本，RailUi.cs:401-407）；手搓 JSON 禁 `",,"`/`"[,"`（RailUi.cs:417-428）；单段 >7500 字符走分块。
- 批 1 零新增 Harmony patch、零新增配置项；TradeFx 随 rail 生命周期（`RailUi.Enabled` 为假即停）。
- 官方 DOM 不删不移；一切渲染幂等（先比签名变了才写）；UI 文案中文；CSS 类/前缀 `cfx`、变量 `--cfx-*`；色值 gold `#FBB034` / coral `#FF8A65` / green `#66BB6A`。
- 不渲染背包格价值徽章（归 rail 现有排序，作者裁定）；trade 模式判定含 mask 多类别口径。

## Review Focus

1. **商人无想要无半价**（wants/half 全空）→ chips 行不建、官方「想要」行**不隐藏**——测试在 Task 5。
2. **SelfCheck 对账失败**（公式漂移/游戏更新）→ bar 推 `null`、页面零 bar 渲染、C# 按 OwnerId 一次告警——判定在 Task 1、产出在 Task 2、零渲染断言在 Task 6。
3. **重复推送相同 JSON** → DOM 零重写（幂等签名）；`mode:"none"` 重复推 → 清路幂等——Task 5/6 双调断言。
4. **窗口关闭 / 切回应求助名单（phase=roster）** → 推一次 `{mode:"none"}` 全清，重开窗正常重建——判定在 Task 2、清路断言在 Task 6。
5. **超大 JSON 分块乱序到达** → 重组按序正确、过期 pid 丢弃——切分在 Task 3、乱序断言在 Task 4。

---

### Task 1: TradeFxMath 纯数学（含 mask 口径与 SelfCheck 判定）+ 单测项目

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/TradeFxMath.cs`
- Create: `tools/tradefx-math-test/tradefx-math-test.csproj`、`tools/tradefx-math-test/Program.cs`（镜像 railjson-test 结构：`<Compile Include>` 链接被测源文件）

**Interfaces:**
- Consumes: 无（本任务是批 1 的地基）。
- Produces（Task 2 消费，全部无 Il2Cpp 依赖）:
  - `internal sealed class TfxTrader { public int DemandCategory, DemandCategoryMask, HalfValueCategory, AidDemandCategory; public float Boost, BoostMax, AppraisalBoost, HalfRate; public bool IsTradeRunPoint, IsCampPoint; }`
  - `internal sealed class TfxSettings { public float HalfRate, DealLineDiscount, DealLineMaxDiscount, BarScale; public static TfxSettings Resolve(float? selfStockRate, float? dealLineDiscount, float? dealLineMaxDiscount, float? barScale); }`（selfStockRate 钳 (0,1] 默认 0.5；BarScale 默认 120；MaxDiscount 默认 60）
  - `internal readonly struct TfxGiveLine { public int Category, TradeValue, Count, UseTimes, MaxUseTimes, CfgUses; public float CfgSellRate; }`
  - `internal static class TradeFxMath`：`static float EffectiveUses(int useTimes, int maxUseTimes, int cfgUses)`、`static bool IsWanted(int category, TfxTrader t)`（mask 位测试优先，`1<<category`，无 mask>0 才看单值）、`static float ClampedBoost(TfxTrader t)`（负归 0、BoostMax>0 时取小）、`static (float Value, float Multiplier, float HalfRate, float SellRate, bool Wanted) GiveValue(TfxGiveLine l, TfxTrader t)`、`static int TakeUnitValue(int tradeValue, int cfgUses, bool isMedicine, bool isCampPoint, float medicineRate)`（药品营地 rate>1 取大；cfgUses<1 归 1）、`static (float Offer, int Goods, float Discount, float DealLine) Totals(IEnumerable<float> giveValues, IEnumerable<int> takeUnitTotals, float dealLineBonus, TfxSettings s)`（折扣=Discount+bonus 钳 [0, MaxDiscount] 再钳 ≤goods）、`static int Shown(float v)`（MidpointRounding.AwayFromZero）、`static bool SelfCheckOk(float offer, int goods, float gameBarNet, float barScale)`（`|offer-goods-gameBarNet*barScale| ≤ 0.5f`）。

- [ ] **Step 1: 写失败的单测**

Program.cs 用 railjson-test 的 `Ok(cond, name, detail)` 模式，覆盖（数值即断言值，全部先手算钉死）：
  - `EffectiveUses(0,0,5)==1`、`EffectiveUses(3,0,5)==3`、`EffectiveUses(6,4,8)==12`（useTimes/maxUseTimes*cfgUses）；
  - `IsWanted` mask 优先：mask=`1<<3` 时 category 3 true、category 1 false（即使 DemandCategory==1）；mask==0 时单值生效；category<1 恒 false；
  - `ClampedBoost`：负→0、Boost=0.8/Max=0.5→0.5、Max=0→原值；
  - `GiveValue` 整链：底值 10×count 3、uses 2、wanted（Boost 0.5）→ `Value==10*3*2*1.5`；非 wanted 半价类（HalfRate 0.5）→ `Value==10*3*2*0.5` 且 Class=low 路径成立；TradeRunPoint+CfgSellRate 0.8 再乘 0.8；
  - `TakeUnitValue(20, 3, true, true, 1.5f)==90`（round(20*1.5)=30，取大后 ×3）；medicineRate 0.9<1 时不折（==60）；
  - `Totals`：give {45,15}+take {30,20}+Discount 10+bonus 5（Max 60）→ Offer 60、Goods 50、DealLine 35；bonus 超钳（bonus 100→DealLine=Goods-Max）；Discount+bonus<0→0；
  - `Settings.Resolve`：null 全默认（0.5/0/60/120）、selfStockRate 2→1、barScale -1→120；
  - `SelfCheckOk(60,50,10/120f,120f)==true`、`SelfCheckOk(60,50,20/120f,120f)==false`（差>0.5）。

- [ ] **Step 2: 跑测试确认失败**

Run: `dotnet run --project tools/tradefx-math-test`（cwd=仓库根）
Expected: 编译失败（TradeFxMath 不存在）→ 建空壳后 FAIL 行。

- [ ] **Step 3: 实现 TradeFxMath.cs**

公式来源=游戏本体（gamekb 反汇编 `Reducer_Web_TradeUI`/`ItemManager` 交易管线）；BetterTrade 反编译只作数值对拍参照，不抄代码结构。`GiveValue` 折算序：`(count*TradeValue) × uses × (want?1+ClampedBoost:1 + AppraisalBoost≥0) × (sellRate×halfRate，≤0 归 1)`；产物 half/sell 归还给调用方用于后续 tooltip（本批只断 Value/乘数）。

- [ ] **Step 4: 跑测试确认全过**

Run: `dotnet run --project tools/tradefx-math-test`
Expected: 全 PASS，退出码 0。

- [ ] **Step 5: Commit**

```bash
git add SurvivalLog.CabinetEverywhere/TradeFxMath.cs tools/tradefx-math-test
git commit -m "feat(tradefx): 批1 纯数学 TradeFxMath（mask 口径+SelfCheck 判定）+ 单测"
```

### Task 2: TradeFx 取数壳（gamekb 复核→状态映射→模式判定→签名门控）+ TradeFxJson 纯构建

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/TradeFx.cs`（Il2Cpp 取数+轮询入口，推送在 Task 3 接线）
- Create: `SurvivalLog.CabinetEverywhere/TradeFxJson.cs`（纯：模型→JSON 字符串）
- Modify: `tools/tradefx-math-test/Program.cs`（追加 TradeFxJson 测试组）

**Interfaces:**
- Consumes: Task 1 全部类型。
- Produces:
  - `internal sealed class TfxModel { public string Mode; public List<(string N, string X)> Wants, Half; public (int Offer, int Goods, int DealLine, bool Picked)? Bar; }`（Mode ∈ "trade"/"none"；批 2-4 扩展 Items/Shelf 等字段）
  - `internal static class TradeFxJson { public static string Build(TfxModel m); }`——输出形状冻结：`{"mode":"trade","trader":{"wants":[{"n":"食物","x":"×1.5"}...],"half":[...]},​"bar":{"offer":84,"goods":30,"dealLine":12,"picked":true}}`；wants/half 空数组；`Bar==null` → `"bar":null`；`mode:"none"` → `{"mode":"none"}`（无其余键）。
  - `internal static class TradeFx { public static void Poll(); }`（Task 3 挂 AccessTicker）。内部：`static string LastSig; static string LastJson; static bool Disabled;` 签名=7 源逐值 ordinal（OwnerId、Phase.Value、GiveJson、PicksJson、ShelfSnapshotJson、DispatchRaw、SupplyTargetsRaw——后三批 1 暂不消费但入签名，游戏侧变了就重建，无害）+ ItemDataList 引用。

- [ ] **Step 1: gamekb 复核批 1 interop 面**

清单（用 gamekb 反汇编核对签名，BT 1.0.1 于 2026-10-08 验证过，防游戏已更新）：`State_Web_TradeUI` 字段 OwnerId/Phase/IsWhDonate/IsSupply/IsDispatch/ItemDataList/GiveJson/PicksJson/ShelfSnapshotJson/DispatchRaw/SupplyTargetsRaw/NpcId/ShelfShopId/CampState/DemandCategory/DemandCategoryMask/Boost/BoostMax/AppraisalBoost/HalfValueCategory/AidDemandCategory/DealLineBonus/BarNet；`Reducer_Web_TradeUI.ParseGive/ParsePicks/FindBagItem/CategoryDisplayName`；`ConfigManager.TryGet_Config_GlobalSetting(Params2)`；`Config_Item`（Category/TradeValue/UseTimes/TradeSellRate/Name 本地化取法沿 RailSortMath 现行口径）。核对结论写进本任务 commit message（有出入按实际改映射并注明）。
- [ ] **Step 2: 写失败的 TradeFxJson 单测**

追加测试组：模型（wants 2 项含 `"×½"` 文本、half 1 项、bar picked=true）→ 断言输出逐串相等（含键序）；bar null → `"bar":null`；mode none → 恰为 `{"mode":"none"}`；空 wants/half → `"wants":[],"half":[]`；**注入用例**：所有字符串值含 `,`、`"`、`\\` 转义后无 `",,"`/`"[,"`（Global Constraints）。
- [ ] **Step 3: 跑测试确认失败** — Run 同 Task 1，Expected: FAIL（TradeFxJson 未建）。
- [ ] **Step 4: 实现 TradeFxJson.cs + TradeFx.cs 取数段**

TradeFx.Poll 流程（推送调用点留 Task 3 填）：首行 `if (!RailUi.Enabled) return;`（General.Enabled 的门控方式对齐 AccessTicker 现行对 TabGate.PollAll 的做法，同款）；`Disabled` 置位后恒 return。读状态（RailSortMath.TradeNow 同款 GetStateByUI+TryCast）：OwnerId==0 或 `Phase?.Value=="roster"` → 上一模式非 none 时产出 `{mode:"none"}`；`IsWhDonate||IsSupply||IsDispatch` → 本批同样产出 none（后续批实现，先占位分支+注释）；否则 trade：组 TfxTrader（HalfRate 等来自 `Settings.Resolve` 四参数 TryGet，任何一参异常按 null 传入），give 明细=`ParseGive(GiveJson)`+`FindBagItem` 回查 Data_Item（Config: Category/TradeValue/UseTimes/TradeSellRate；UseTimes/MaxUseTimes 取实例）逐项 `GiveValue`；goods=`ParsePicks(PicksJson)` 逐项 `TakeUnitValue`（isMedicine=Category==2、isCampPoint=非 NPC 货架且 CampState!=0、medicineRate=`GameKey.EndlessTradeTakeMedicineRate`）；`Totals` 后 `SelfCheckOk(offer, goods, s.BarNet?.Value ?? 0, settings.BarScale)`——失败：`Log.LogWarning`（按 OwnerId 一次）且 `Bar=null`；成功且 picked（任一 picks 数量≥1）才填 Bar。Wants=对 category 1..31 过 `IsWanted`，名称用 `Reducer_Web_TradeUI.CategoryDisplayName(c)`（空则 `c.ToString()`），倍率文本 `"×"+Shown(1+ClampedBoost)`；Half=HalfValueCategory>0 且 ≠AidDemandCategory 且 HalfRate<1 → `("×½"` 当 HalfRate==0.5 否则 `"×"+值`）。任何 interop 异常 → warn-once（消息去重 HashSet）+ `Disabled=true`（模块自禁，不影响 rail 其他功能）。
- [ ] **Step 5: 跑测试确认全过** — Run 同上，Expected: 全 PASS。
- [ ] **Step 6: `dotnet build SurvivalLog.CabinetEverywhere` 编译通过**（Il2Cpp 取数段编译验证；运行行为归 Task 7 实机）。
- [ ] **Step 7: Commit**

```bash
git add SurvivalLog.CabinetEverywhere/TradeFx.cs SurvivalLog.CabinetEverywhere/TradeFxJson.cs tools/tradefx-math-test
git commit -m "feat(tradefx): 批1 取数壳（模式判定/签名门控/SelfCheck 产 null）+ JSON 构建 + 单测"
```

### Task 3: 推送接线（AccessTicker 挂载/直推与分块/关窗 none/Verbose 计时）+ drain `report` op

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs`（0.5s 快轮区段 ~:421-440，加 `TradeFx.Poll()` 一行，与 TabGate.PollAll 同列）
- Modify: `SurvivalLog.CabinetEverywhere/TradeFx.cs`（补推送段）
- Modify: `SurvivalLog.CabinetEverywhere/RailCommands.cs`（分发表 ~:215-241 加 report；Enqueue 侧 op 集合同步）

**Interfaces:**
- Consumes: Task 2 的 `Poll()/BuildJson()`；RailUi 现有 WebView 获取与推送工具（`RailUi.GetWebView()`；ExecuteJavaScript 回调重载）。
- Produces: JS 侧可调用的两个入口（Task 4 实现消费端）——小包直推 `ExecuteJavaScript("window.__CERAIL_TRADEFX__(<json>)", cb)`；>7500 字符分块 `window.__CERAIL_TRADEFX_CHUNK__(pid,i,total,<段>)` 按序发完（pid 单调递增，全局静态起点随机避开 rail 序列）；drain 新 op：`{op:"report", text:"..."}` → 主帧 `Log.LogWarning("[TradeFx] "+text)`（HashSet 去重）。

- [ ] **Step 1: RailCommands 加 report op**

分发表加 case：仅记录日志（去重），无副作用、不 ForceRepublish。同时确认 JS 侧允许的 op 白名单处（railui.page.js cmd() 无白名单则无动作）。
- [ ] **Step 2: TradeFx 补推送段**

Poll 内：签名未变→return；变了→`BuildJson()`；json==LastJson → 不推（幂等）；否则按上面接口推。关窗 none 推送后把 LastJson 置为该 none 串（下次开窗自然失配重推）。`CabinetEverywherePlugin.Verbose`（现有 [Debug] Verbose）为真时 Debug 日志：mode/json 字符数/build 耗时（`System.Diagnostics.Stopwatch`）。
- [ ] **Step 3: 编译 + 既有回归不红**

Run: `dotnet build SurvivalLog.CabinetEverywhere`；然后起 `node SurvivalLog.CabinetEverywhere/design-proto/serve.cjs`（8180）跑 `node tools/railui-harness-tests/harness-regression.cjs`。
Expected: build 0 error；regression 基线持平（新增代码未注入任何 JS 行为——bootstrap 未变，理应零影响）。
- [ ] **Step 4: Commit**

```bash
git add SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs SurvivalLog.CabinetEverywhere/TradeFx.cs SurvivalLog.CabinetEverywhere/RailCommands.cs
git commit -m "feat(tradefx): 批1 推送接线（AccessTicker 挂载/分块/关窗 none/Verbose）+ drain report op"
```

### Task 4: JS 消费壳（TRADEFX 入口/Trade 帧定位/探针表）+ harness 骨架

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（新 tradefx 节，置于 glist 节与 `__CERAIL__` 壳（:5053）之间；`window.__CERAIL_TRADEFX__`/`__CERAIL_TRADEFX_CHUNK__` 定义+防重入守卫）
- Create: `tools/railui-harness-tests/harness-tradefx.cjs`（骨架：壳可调、分块重组、探针上报）

**Interfaces:**
- Consumes: Task 3 的两个入口与 `cmd()`（railui.page.js:818）；Trade 帧定位复用文件内既有 iframe 帧获取路径（SCENES.Trade 所用；无通用 helper 则新增本地 `tfxFrame()`：扫 iframe `/TradeUI\.html/i` 且 readyState==="complete"，BT.findFrame 同思路）。
- Produces（Task 5/6 消费）: `TFX.setData(json字符串)`（解析失败静默 return）、`TFX.clear()`（清 chips/bar，Task5/6 各自 clear 挂进来）、`TFX.data`（解析后对象）、探针表 `TFX_DEPS = { chips: ['.bubble'], bar: ['.foot-main', '.bal-track'] }`（chips 探针只查 `.bubble`——.info-rows 缺席走 .bubble 自建路径，两条都有才算齐）；缺件经 `cmd('report', { text: 'tradefx missing: '+名称+选择器 })` 上报一次（页面级 Set 去重）；分块重组器：乱序收集、齐后组串调 setData、pid<当前已弃。

- [ ] **Step 1: 写失败的 harness 骨架测试**

`harness-tradefx.cjs`（拷 harness-native-width.cjs 头部模式：playwright chromium-1223 路径、BASE 8180、console/page error 尾检）：
  1. 打开 root harness → `__HZ_SHOW__('TradeUI')` → Trade fixture 帧就绪；
  2. 根窗 `window.__CERAIL_TRADEFX__` 存在且为函数；
  3. 分块乱序：根窗依次 `__CERAIL_TRADEFX_CHUNK__(1,1,2,后半)`→`__CERAIL_TRADEFX_CHUNK__(1,0,2,前半)` → `TFX.data.mode==='trade'`（拼装成功）；再推 pid 0 过期块 → data 不变；
  4. 探针：临时把某依赖选择器改坏（如隐藏 `.foot-main`）后 setData → `window.__CERAIL__.drain()` 含 `op:'report'` 且 text 带 'bar'；恢复后不再重复上报（Set 去重）；
  5. 非法 JSON → 静默（无 pageerror）。
- [ ] **Step 2: 跑测试确认失败** — Run: `node tools/railui-harness-tests/harness-tradefx.cjs`（serve.cjs 须在跑）Expected: FAIL（入口不存在）。
- [ ] **Step 3: 实现 tradefx 节消费壳**

按上面 Interfaces 实现；`window.__CERAIL_TRADEFX__ = function(json){...}` 带存在即 return 守卫；本任务只做壳+重组+探针，chips/bar 渲染留空函数（Task 5/6 填）。
- [ ] **Step 4: 跑测试确认通过** — Run 同上，Expected: 全 PASS，零 console error。
- [ ] **Step 5: Commit**

```bash
git add SurvivalLog.CabinetEverywhere/railui.page.js tools/railui-harness-tests/harness-tradefx.cjs
git commit -m "feat(tradefx): 批1 JS 消费壳（TRADEFX 入口/分块重组/探针 report）+ harness 骨架"
```

### Task 5: A3 chips 渲染 + CSS

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（tradefx 节补 `tfxChips(doc)`）
- Modify: `SurvivalLog.CabinetEverywhere/railui.css`（cfx tokens + chips 规则）
- Modify: `tools/railui-harness-tests/harness-tradefx.cjs`（追加 chips 组）

**Interfaces:**
- Consumes: Task 4 `TFX.data`（`trader.wants[].n/.x`、`trader.half[]`）与 `TFX_DEPS.chips`。
- Produces: chips 渲染（挂进 `TFX.setData` 流程）——官方「想要」行（Trade 帧 `.info-rows > .cp-row` 中 `.cp-k` 文本==setupState.localText.wantLabel，无 Vue 时回退 `'想要'`）在 wants 非空时加 `cfx-hide`；chips 行 `.cfx-head-row`：wants 非空建 `.cfx-wants`（chip 文本 `名称 ×1.5`，色 green）、half 非空建 `.cfx-half`（色 coral）；两者皆空 → 不建行且**不隐藏官方行**（Review Focus 1）；`.info-rows` 缺席 → 在 `.bubble` 内自建 `.cfx-head` 容器行，空则移除；幂等：行 `dataset.cfx` 签名（label+groups 拼串）不变不写；`TFX.clear()` 挂 chips 清路（移除 cfx 行+cfx-hide 类）。CSS：`--cfx-green/-coral` tokens、`.cfx-chip` 边框圆角小签（对齐 rail 现有 chip 风格尺寸 11px 级）、`.cfx-hide{display:none}`。

- [ ] **Step 1: 写失败的 chips harness 断言**

追加组：① 推 trade JSON（wants 2 项/half 1 项）→ `.cfx-wants` 2 chips、`.cfx-half` 1 chip、官方想要行（fixture 预置）带 cfx-hide；② 全空 wants/half → 无 cfx 行、官方行无 cfx-hide；③ 幂等：重推同 JSON → `dataset.cfx` 未变（用 MutationObserver 计数或比对前后 outerHTML 恒等）；④ `mode:"none"` → 行移除、cfx-hide 摘除；⑤ `.info-rows` 摘除后再推 → `.bubble` 内自建容器出现。
- [ ] **Step 2: 跑测试确认失败** — Run: harness-tradefx.cjs，Expected: 新组 FAIL。
- [ ] **Step 3: 实现 tfxChips + CSS**
- [ ] **Step 4: 跑测试确认通过** — Expected: 全 PASS 零 console error。
- [ ] **Step 5: Commit**（消息：`feat(tradefx): 批1 A3 想要/半价 chips + CSS`，含 railui.css）

### Task 6: A4 天平条两端数字 + hover 气泡 + CSS

**Files:**
- Modify: `railui.page.js`（tradefx 节补 `tfxBar(doc)`）、`railui.css`（bar 规则）、`tools/railui-harness-tests/harness-tradefx.cjs`（追加 bar 组）

**Interfaces:**
- Consumes: `TFX.data.bar`（offer/goods/dealLine/picked）与 `TFX_DEPS.bar`。
- Produces: bar 渲染（挂进 setData 流程）——仅 `mode==="trade" && bar` 且（有 Vue 时 `setupState.foot.barMode` ∈ {"balance","noquote"}，无 Vue 视为可渲）：Trade 帧 body 加 `cfx-bar` 类；`.foot-main` 相对定位、`.bal-track` 左右 margin 46px（CSS 类驱动）；`.cfx-bar-offer`（左端金）必显、`.cfx-bar-goods`（右端金）仅 picked 显示；`.cfx-bar-tip`（`你给出 84 · 货物 30 · 成交线 12`，picked false 时只 offer 段）hover 显隐（mouseenter/leave 绑一次，`__cfxTip` 标记）；`bar:null` 或 mode none → 摘 body 类+三节点（清路幂等）；幂等：textContent 不等才写；`TFX.clear()` 挂 bar 清路。CSS：`.cfx-bar-offer/-goods`（12px/700/tabular-nums，各 40px 宽贴两端）、`.cfx-bar-tip`（11px 黑底圆角，hidden 属性驱动）、色 `--cfx-gold`。

- [ ] **Step 1: 写失败的 bar harness 断言**

① trade+bar picked → 两端数字=JSON 值、tip 文本含三段；② picked=false → goods 节点不在；③ `bar:null` → 无任何 cfx-bar 节点、body 无类（Review Focus 2 的 JS 半边）；④ 重推同 JSON → outerHTML 恒等（幂等）；⑤ `mode:"none"` → 全清（Review Focus 4）；⑥ 探针坏 `.bal-track` → report 含 'bar'。
- [ ] **Step 2: 跑测试确认失败** — Expected: bar 组 FAIL。
- [ ] **Step 3: 实现 tfxBar + CSS**
- [ ] **Step 4: 跑测试确认通过** — Expected: 全 PASS 零 console error。
- [ ] **Step 5: Commit**（消息：`feat(tradefx): 批1 A4 天平条数字+hover 气泡 + CSS`）

### Task 7: 批收口——全量回归、实机部署对拍、版本与文档

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/SurvivalLog.CabinetEverywhere.csproj` + `CabinetEverywherePlugin.cs`（版本 1.9.2→1.9.3）
- Modify: `CHANGELOG.md`、`docs/UI-SPEC.md`（v1.9.3 节：TradeFx 通道+A3+A4 机制条目）

- [ ] **Step 1: 全量 harness 回归**

serve.cjs 在跑，逐个执行 `tools/railui-harness-tests/harness-*.cjs`（含新 harness-tradefx）。
Expected: 全绿；已知存量环境败线（mount/regression/store-all/tidy 若再现历史环境问题）按 v1.9.2 记录口径核对为环境问题而非本批引入。
- [ ] **Step 2: 构建 + 部署实机**

`dotnet build -c Release` → DLL 拷入 `E:\SteamLibrary\steamapps\common\Survival Log\BepInEx\plugins\`。实机清单：① 开交易窗→chips/两端数字出现且数值合理；② 勾 give 物品→offer 变化（≤0.5s 跟随）；③ 勾货架 picks→goods/dealLine 出现；④ 悬停天平条→气泡；⑤ 关窗再开→无残留、重渲正确；⑥ 切「回应求助」名单页→无渲染残留；⑦ SelfCheck：日志无对账告警（有=立即停下查公式）；⑧ BepInEx 日志无 TradeFx warn-once 之外的异常刷屏。
- [ ] **Step 3: 对拍验收（开发期动作，不进交付物）**

临时启用 BetterTrade.dll（其 Features.TradeStorages=false 关柜子页签防叠加），与 TradeFx 同场：同商人同物品下，chips 倍率、offer/goods/dealLine 与 BetterTrade 显示逐项一致；不一致→回 gamekb 查公式，改 TradeFxMath 后重跑 Task 1 单测。验收后 BetterTrade 恢复 .disabled，工作区不留对拍代码。
- [ ] **Step 4: 版本+CHANGELOG+UI-SPEC+Commit**

三处版本对齐 1.9.3；CHANGELOG 记批 1 内容（通道/A3/A4/SelfCheck/兼容原则）；UI-SPEC 记 TradeFx 机制条目。
```bash
git add -A && git commit -m "feat(cerail): v1.9.3 TradeFx 批1——推送通道+A3 偏好条+A4 天平数字+SelfCheck 对账（细节见 CHANGELOG/UI-SPEC）"
```
