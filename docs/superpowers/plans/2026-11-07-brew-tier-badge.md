# 酿酒桶 酒品品质角标 + 饱腹排序收敛 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BrewPanel 页排序菜单收敛两项（默认/饱腹度），饱腹序=品质主键（烈→普→劣→不可酿垫底，同品质饱腹降序）+ 可酿物品格右上角「饱腹数值+品质色角标」双层角标；其余 11 页零变化。

**Architecture:** 数据=C# 契约增补（icfg 尾列 canBrew 仅 BrewPanel 页——fuelCols 同款；ctx 直推 brewP1/brewP2——uniformWidth 同款）；视图=JS 显示层（排序比较器分支+角标层 span 追加），官方 DOM 零触碰。tier=纯派生值（s2/s1 vs P1/P2），JS 侧统一函数供排序与角标共用。

**Tech Stack:** C#/net6.0 BepInEx IL2CPP interop（RailData.cs）；注入 JS（railui.page.js，ES5）；CSS（railui.css）；测试=Playwright harness（tools/railui-harness-tests/*.cjs，serve.cjs@8180 root harness）。

**Spec:** `docs/superpowers/specs/2026-11-07-brew-tier-badge-design.md`（品质机制实证/方案选型/隔离论证以此为准，实现时随行阅读）

## Global Constraints

- 反目标（一票否决）：其他 11 页推送形状或行为任何变化；动官方格 DOM/监听；从 Category==1 推导 CanBrew（Burnable 同纪律）
- icfg 尾列（第 16 元素，下标 15）**只允许 `sc?.Page == "BrewPanel"` 的包出现**（fuelCols 约束同款：其他页行形状逐字节不变）
- 阈值读法：`GameCore.HotUpdate.GameKey.GlobalSetting_Brew_TierMoodDensityP1/P2`，try/catch 缺省 0/0.5；JS 侧 `!(P2>P1)` 时兜底 0/0.5（官方 BrewPanel.html L525 同守卫）
- 三档色/文案常量与游戏同源：`['#9dc47f','#e8b04b','#e0899b']`、`劣/普/烈`（BrewPanel.html L345/L371）
- C# 无单测工程（套件现状）：C# 任务验证=`dotnet build` 零错；JS 任务=harness TDD（RED→GREEN）
- 版本号不自行 bump（作者裁定）；提交信息仓库风格（`feat(cerail): ...`，中文摘要）
- 原型 `design-proto/rail.js` v14 已定稿，**不随本计划改动**（对照基准）

## Review Focus

1. **尾列跨页泄漏**：非 BrewPanel 页 icfg 行若也带下标 15，其他页 normIcfg 虽读到 bw 但菜单/排序不消费——形状仍变（防御性红线）——harness 断言 Cooking 页推送 JSON icfg 行 `length===15`（Task 3 Step 2 场景⑤）
2. **菜单收敛串味**：makeSortMenu 的 keys 函数化若改坏数组路径，NB 侧（BackpackUI 排序钮）菜单变空——harness 断言 NB 菜单 7 项照旧（Task 3 Step 2 场景④；NB 实例传数组路径必须零改动）
3. **阈值缺省错档**：GameKey 读抛异常或 P2≤P1 时若不兜底，全部物品错档——harness 推 `brewP1=0.9`（P2 缺省 0.5→P2<P1）断言走兜底 0/0.5（Task 2 Step 2 场景③）
4. **角标错配**（v1.8.5④ 教训）：品质字必须走与数值同一条 dispRows 下标直配链，禁止另起位置 join——实现约束在 makeBadgeLayer 绘制行内（Task 5）；harness 断言不可酿格无 `.sr-tier`（场景②）
5. **官方重渲染丢角标**：切柜/加料后官方 bagBag 重渲染，MO 回调若不重画品质字=残留旧值——harness 触发 `__HZ_PUSH__` 重推断言角标层重建（Task 5 Step 2 场景③）

---

### Task 1: C# 契约——icfg 尾列 canBrew（BrewPanel 专属）+ ctx brewP1/brewP2

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs`（BuildIcfgRow ≈L522 起、IcfgRow ≈L521 起、BuildJson icfg 段 ≈L474-480、ctx uniformWidth 行 ≈L432 后）

**Interfaces:**
- Consumes: `sc?.Page`（BuildJson 现场变量）、`BagTable.Cm()._Config_Item_Dict`、`GameCore.HotUpdate.GameKey.GlobalSetting_Brew_TierMoodDensityP1/P2`（读法先例 RailData.cs:781-782）、`F(float)`（RailData.cs:1168）、`IcfgRow/_icfgCache/_icfgFuelCache` 懒缓存机制
- Produces: 契约形状——BrewPanel 页 icfg 行 `[…15 元素, canBrew(0|1)]`；ctx 增 `"brewP1":<float>,"brewP2":<float>`（所有页都带，缺省 0/0.5；JS 仅 BrewPanel 消费）

- [ ] **Step 1: icfg 尾列接线（照抄 fuelCols 三处）**

`BuildIcfgRow(int cfgId, itemDict, bool fuelCols)` 增参 `bool brewCols = false`；
行尾 `if (brewCols)` 追加 `,canBrew?1:0`（`try { canBrew = ic.CanBrew; } catch {}`，bool 缺省 false；
与 burnable 同款 Remove-末括号-再封口写法）。`IcfgRow` 同增参并选缓存
（`brewCols` 复用 `_icfgFuelCache` 模式新建 `_icfgBrewCache`，占位行 `+ ",0"`）。
BuildJson icfg 段：`bool brewCols = sc?.Page == "BrewPanel";`（紧挨现有 `fuelCols` 行），
`IcfgRow(icfgOrder[i], itemDict, fuelCols, brewCols)`。

- [ ] **Step 2: ctx 直推阈值（uniformWidth 先例同点位）**

`sb.Append(",\"uniformWidth\":...")` 行后追加：
`"brewP1"`/`"brewP2"` 两个 try/catch 读 GameKey（缺省 0f/0.5f）、`F()` 序列化。

- [ ] **Step 3: 构建验证**

Run: `dotnet build SurvivalLog.CabinetEverywhere/SurvivalLog.CabinetEverywhere.csproj`
Expected: 零 error（warning 与 HEAD 基线一致）

- [ ] **Step 4: Commit**

`feat(cerail): 酿酒桶品质契约——icfg 尾列 canBrew(仅 BrewPanel 页)+ctx 直推 brewP1/P2`

### Task 2: JS 契约读取 + tier 派生函数（含 harness 夹具改造）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（normIcfg ≈L395、dispRows ≈L1288 出行对象、常量区 FSORTS 后 ≈L132）
- Modify: `SurvivalLog.CabinetEverywhere/design-proto/railui-root-harness.html`（ctxFor ≈L213、MOCK.icfg ≈L240）
- Test: `tools/railui-harness-tests/harness-brew-tier.cjs`（新建，骨架抄 harness-width-floor.cjs 头/启动/汇总）

**Interfaces:**
- Consumes: Task 1 契约形状（icfg 下标 15、ctx.brewP1/brewP2）
- Produces:
  - `normIcfg` 增 `bw: r[15] || 0`
  - `dispRows` 出行增 `cfgId: row ? row.cfgId : null`
  - 模块级 `var TIER_TXT = ['劣','普','烈']; var TIER_COLOR = ['#9dc47f','#e8b04b','#e0899b'];`
  - `function brewTierOf(row)` → `-1|0|1|2`：`row` 非 null 且 `ICFG[row.cfgId]` 存在且 `.bw` 真且 `row.s1>0` 时按 `row.s2/row.s1`（s2 可 null→按 0）对 P1/P2 三段；P1/P2 取 `store.ctx.brewP1/brewP2`，`!(P2>P1)` 兜底 0/0.5；否则 `-1`
  - 夹具旋钮 `window.__HZ_BREWP1__ / __HZ_BREWP2__`（ctxFor 注入，默认 0/0.5，`__HZ_PUSH__` 重推生效——`__HZ_UNIW__` 同款）

- [ ] **Step 1: 写失败测试（harness-brew-tier.cjs §1 契约读取）**

场景：BrewPanel 夹具推 mock（bag 行覆盖三档：如 cfg2 烤肉 s2/s1=2.5 烈、cfg1 香米 0 普、
cfg3 咖啡 -2.5 劣、cfg5 铁钉 bw=0 不可酿）。断言：
① 夹具推送 JSON：BrewPanel 页 icfg 行 `length===16`、Cooking 页 `length===15`（契约形状）；
② `__HZ_BREWP1__=0.9` 重推后（P2 缺省 0.5→P2<P1）tier 三档分布不随 0.9 变（兜底 0/0.5 生效
——经 §3 排序断言观察，或临时公开 `w.__HZ_TIER__` 自检口仅测试期挂夹具）；
③ 非 BrewPanel 页 ctx 仍带 brewP1/brewP2 字段但无消费者（形状断言+代码 grep 双证）。

- [ ] **Step 2: 跑测试确认 RED**

Run: `node tools/railui-harness-tests/harness-brew-tier.cjs`（serve.cjs 已起）
Expected: FAIL（bw 未读/兜底未实现——按断言落点报错）

- [ ] **Step 3: 实现 normIcfg.bw / dispRows.cfgId / TIER_* / brewTierOf / 夹具旋钮**

夹具侧：MOCK.icfg 的 cfg 1/2/3/7 追加第 16 元素（1），cfg 4/5/6/8/9 不动；
ctxFor 增两旋钮。注意 MOCK.icfg 被多场景共享——尾列在 Cooking 页推送时由夹具
`pushCtx` 按 `page!=='BrewPanel'` 剥离（模拟 C# 页判据，形状断言才有意义）。

- [ ] **Step 4: 跑测试确认 GREEN，Commit**

`feat(cerail): JS 契约读取 canBrew/brewP1P2 + brewTierOf 三档派生（harness §1）`

### Task 3: 菜单收敛（BrewPanel 两项；keys 函数化）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（makeSortMenu ≈L1498 `labelOf`/`renderPop`、menuFoot 实例 ≈L2017）
- Test: `tools/railui-harness-tests/harness-brew-tier.cjs`（§2 追加）

**Interfaces:**
- Consumes: `FSORTS`（L123）、`st.scene`
- Produces: makeSortMenu 兼容 `cfg.keys` 为 function（`var ks = typeof cfg.keys === 'function' ? cfg.keys() : cfg.keys;`，labelOf/renderPop 各取一次）；menuFoot 传
  `keys: function () { return st.scene === 'BrewPanel' ? FSORTS.filter(function (s) { return s.k === 'official' || s.k === 'sat'; }) : FSORTS; }`
  BrewPanel 的 sat 项 label 显示「饱腹度」（keys 函数返回的数组项可带覆盖 label：`{ k:'sat', label:'饱腹度', ico:'🍗' }`）

- [ ] **Step 1: 写失败测试（§2 菜单）**

① BrewPanel：点 `#srFoodSort` → `#srFootSortBody button` 恰 2 个，文案 `⊞默认`/`🍗饱腹度`；
② 点饱腹度 → 触发钮 label 变「饱腹度」（menuFoot.sync 路径）+ toast 文案含「烈→普→劣」；
③ 回默认 → 钮 label 回「排序」。
④ 回归：Cooking 页菜单 7 项文案照旧；⑤ NB 侧（BackpackUI）排序弹层 7 项照旧（数组路径零改动证明）。

- [ ] **Step 2: 跑 RED → 实现 keys 函数化 + menuFoot keys → GREEN**

applyDispSort 的 toast 分支（≈L1553）增 BrewPanel+sat 专用文案：
`已按「饱腹度」排序 · 烈→普→劣 · 同品质按饱腹值从高到低`

- [ ] **Step 3: Commit**

`feat(cerail): BrewPanel 排序菜单收敛两项（默认/饱腹度）——makeSortMenu keys 函数化（harness §2）`

### Task 4: 排序比较器（品质主键，仅 BrewPanel+sat）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（dispApply pairs.sort ≈L1362）
- Test: `tools/railui-harness-tests/harness-brew-tier.cjs`（§3 追加）

**Interfaces:**
- Consumes: `brewTierOf(row)`（Task 2）、`dispKeyOf`、`st.scene`
- Produces: 排序语义——BrewPanel+sat：tier 降序（烈2→普1→劣0→不可酿-1 垫底）为第一键，
  `dispKeyOf(row,'sat')` 降序为第二键（null 仍按现行「无值排尾」语义沉底），稳定键 `a.i-b.i` 收尾

- [ ] **Step 1: 写失败测试（§3 排序）**

夹具 bag 混放：烈×2（不同 s1）、普×3（不同 s1）、劣×1、不可酿×2（s1 null 与 0 各一）。
选饱腹度后断言（读 bagBag 模型或 `.item` DOM 序）：`烈(s1大) 烈 烈 普(s1大)…普 劣 不可酿(s1>0) 不可酿(null)`；
Cooking 页选饱腹 → 纯 s1 降序（tier 不参与——回归）。

- [ ] **Step 2: 跑 RED → 实现比较器分支 → GREEN**

在 pairs.sort 回调头部：`if (key === 'sat' && st.scene === 'BrewPanel')` 先比
`brewTierOf(a.row) - brewTierOf(b.row)`（b-a 降序；不等即返回，不等号方向与「高在前」一致），
相等落到现行单键路径（不动 null 沉底与 a.i 逻辑）。

- [ ] **Step 3: Commit**

`feat(cerail): 酿酒桶饱腹序品质主键——烈→普→劣→不可酿垫底，同品质饱腹降序（harness §3）`

### Task 5: 双层角标（数值 + 品质色角标）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（makeBadgeLayer 绘制行 ≈L1623、badgeTextFor ≈L1565 只读不改）
- Modify: `SurvivalLog.CabinetEverywhere/railui.css`（`#srp #srBadgeLayer i` 块 ≈L245-252 后追加）
- Test: `tools/railui-harness-tests/harness-brew-tier.cjs`（§4 追加）

**Interfaces:**
- Consumes: `brewTierOf`、`TIER_TXT/TIER_COLOR`、`spec.k`/`st.scene`（badgeSpec 不动）
- Produces: 角标 HTML——BrewPanel+sat 且 `brewTierOf(row)>=0` 时 `<i>` 内容 =
  `badgeTextFor(...)` + `<span class="sr-tier" style="color:<TIER_COLOR[t]>"><TIER_TXT[t]></span>`；
  CSS：`#srp #srBadgeLayer i .sr-tier{display:block;font-size:9px;line-height:12px;font-family:inherit;}`（底衬继承父 `<i>` 的 rgba(0,0,0,.80)，右对齐随父 translate(-100%)）

- [ ] **Step 1: 写失败测试（§4 角标）**

① BrewPanel+sat：`#srBadgeLayer i` 数=可显示格数；烈/普/劣格 `<i>` 内含 `.sr-tier` 且
computed color 等于三档色（rgb 断言）；② 不可酿格 `<i>` 不含 `.sr-tier` 且文本=数值/-；
③ `__HZ_PUSH__` 重推（模拟官方重渲染+MO 重画）后角标层重建且内容一致；④ 默认序=层清空
（badgeSpec null 路径照旧）；⑤ Cooking+sat：`<i>` 无 `.sr-tier`（回归）。

- [ ] **Step 2: 跑 RED → 实现绘制行追加 + CSS → GREEN**

绘制行现拼 `badgeTextFor(it, spec.k)` 单文本；改为先算 `var t = (spec.k === 'sat' && st.scene === 'BrewPanel') ? brewTierOf(it) : -1;`
再拼 HTML（it=cellRows 行——与数值同一条下标直配链，禁另起 join）。

- [ ] **Step 3: Commit**

`feat(cerail): 酿酒桶饱腹序双层角标——饱腹数值+品质色角标（劣绿/普黄/烈粉，游戏同源色）（harness §4）`

### Task 6: 全量回归 + 收尾

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/CHANGELOG.md`（顶部新批次行）
- Modify: `docs/superpowers/specs/2026-11-07-brew-tier-badge-design.md`（状态→已实施；§2 聚合公式实证行补实测值）

**Interfaces:**
- Consumes: 前五任务全部产出
- Produces: 收尾记录

- [ ] **Step 1: harness 全套**

Run: `node tools/railui-harness-tests/harness-brew-tier.cjs` → 全 PASS；
`node tools/railui-harness-tests/harness-regression.cjs` → 与 HEAD 基线一致（既有 FAIL 集合不变）；
`harness-mount.cjs`/`harness-switch-cabinet.cjs` 抽查绿（菜单/角标链未伤宿主装配）

- [ ] **Step 2: CHANGELOG 批次行（含 harness 计数）+ spec 状态翻转**

- [ ] **Step 3: 实机验收清单（作者侧）**

① BrewPanel 菜单两项/排序三层/角标双层+三色；② 五对照页（Cooking/RatCage/Compressor/Trade/DroneHub）菜单 7 项、各维角标排序照旧；③ 官方发酵面板/料仓/品质条未动；④ 单投一件原料看酿酒桶自带品质条档位 vs 侧栏角标档位一致（P1/P2 实读校准）；⑤ 顺手记录桶内两件混合的 moodDensity（Σ心态/Σ饱腹 假设验证——结论补进 spec §2，代码无关）

- [ ] **Step 4: Commit**

`chore(cerail): 酿酒桶品质角标收尾——CHANGELOG 批次行+spec 定版+harness 全绿`
