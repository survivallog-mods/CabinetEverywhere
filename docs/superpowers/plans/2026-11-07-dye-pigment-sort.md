# 染料桶色素排序（Dye Pigment Sort）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 染料桶页脚回归排序钮（DISP 显示层排序），弹窗列全部颜色，选色按该色色素点数降序排官方格；顺带产出全植物×全颜色色素数值表。

**Architecture:** 沿 v1.8.5 DISP 机制（纯 Vue 模型 x/y 写+官方自渲染）与 v14.1 酿酒桶专属 apply 先例：C# 契约加 DyePanel 页专属 icfg 尾列 `pig`（全颜色点数，含未解锁）+ 页条件字段 `ctx.dyePal`（颜色板）；JS 加专属 `dispApplyDyePig` 与色项菜单。零命令下发、零真实移动。

**Tech Stack:** BepInEx 6 IL2CPP（C#/Il2CppInterop反射）+ 游戏自带 WebView（Vue 2 原生页）+ mod 注入 `railui.page.js`；测试=Playwright harness（`tools/railui-harness-tests`，serve.cjs @8180）。

**Spec:** `docs/superpowers/specs/2026-11-07-dye-pigment-sort-design.md`（已批准；本计划据其论证，执行者两份都读）

## Global Constraints

- 官方格渲染/拖拽零接管；**本功能零 ItemManager 移动类调用**（spec §2 反目标）
- 不动原料槽 vatGrid；不与「提取颜色」联动；不做置灰（spec §2/§5.4）
- 色素排序走**专属 apply**，公共比较器 `dispKeyOf`/`badgeTextFor` 属性维分支不扩（spec §4，v14.1 作者令同构）
- `st.fsort` **不持久化**：applyScene 复位 official 现行为不动（spec §5.4；fsort 持久化 v1.8.5 已退役）
- icfg 缓存分键防串形：`_icfgDyeCache` 独立于 `_icfgCache/_icfgFuelCache/_icfgBrewCache`（spec §3）
- C# 配置读取 try/catch 容错=各行同口径；读不到 → pig=`"[]"`、dyePal 不带（spec §3）
- 植物不堆叠**不作为代码假设**：比较器/装填走通用 w×h（dispPack 现规则）（spec §3）
- 契约字符串全部 ASCII 安全转义（BuildIcfgRow 现有 esc 纪律）

## Review Focus

1. **配置未就绪窗口**（dyePal 缺失 / pig 全空）→ 菜单只剩「默认」、排序钮在、不崩 → Task 4 §2 测试 `menu-empty-pal`
2. **pig 串畸形**（非法 JSON）→ 按无色素沉底、不崩 → Task 3 §1 测试 `pig-malformed`
3. **颜色板增长**（>10 项）→ 弹窗限高滚动不溢出 → Task 4 §2 测试 `menu-scroll`
4. **占位行/异页行同宽判形**：dye pig 16 列与 brew canBrew 16 列同宽 → normIcfg 按类型判形（pig=string / canBrew=number），互不误读 → Task 3 §1 测试 `shape-collision`
5. **其他页零污染**：BrewPanel 菜单仍两项、Trade/其余页仍 FSORTS 七项 → Task 5 §5 测试 `menu-isolation`

---

### Task 1: Spike——色素数据源运行时探查 + `Debug.DumpDyePigments`

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs`（加 `[ConfigEntry] Debug.DumpDyePigments`，默认 false，ListOnReady 同节）
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs`（dump 例程：配置 true 时在 AccessTicker 就绪轮 dumping 一次）
- Modify: `docs/superpowers/specs/2026-11-07-dye-pigment-sort-design.md`（附录 A 回填数值表 + §6 spike 结论）

**Interfaces:**
- Consumes: 静态探查已证实的名字（`global-metadata.dat`）：`_plantPigmentsByItem`、`DyeConfig`、`DyeEntry`、`DyeUnlockManager`、`PigmentOpen`、`PigmentsByItem`、GameKey `Dye_PointsPerBucket`、`PigmentTotals`
- Produces（Task 2 消费，写进附录 A「访问链」节）: ①植物→`[[colorId,points],…]` 的确切 C# 访问链（类型.成员）；②颜色板（colorId→名/hex/序）访问链；③全植物×全颜色数值表

- [ ] **Step 1: 写 dump 例程**——反射打印：候选根（`BagTable.Cm()` 同源的 ItemManager/Dye 单例）下 `_plantPigmentsByItem`、`DyeConfig`/`DyeEntry` 全字段、`DyeUnlockManager.PigmentOpen`、GameKey `Dye_PointsPerBucket` 值；每项 try/catch 单独容错并打印失败名（找不全不是错，打多少算多少）
- [ ] **Step 2: 构建**——Run: `dotnet build SurvivalLog.CabinetEverywhere/SurvivalLog.CabinetEverywhere.csproj -c Release`；Expected: 0 Error
- [ ] **Step 3: 实机取证（作者配合）**——dll 装进游戏（Full 包目录 `E:\SteamLibrary\steamapps\common\Survival Log\BepInEx\plugins\`），cfg 置 `Debug.DumpDyePigments = true`，开一局进家，收 `BepInEx/LogOutput.log` 中 `[CERail] dye-pig` 前缀行
- [ ] **Step 4: 结论回填**——附录 A 誊入全表 + 访问链；若 `_plantPigmentsByItem` 读不出：按 spec §6 S1 兜底=停工回报作者（后续任务作废）
- [ ] **Step 5: Commit**——`git add -A && git commit -m "feat(cerail): 染料桶排序spike——色素数据源运行时dump+附录A数值表"`

### Task 2: C# 契约——icfg dyeCols 尾列 `pig` + `ctx.dyePal`

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs:519`（场景旗标行加 `bool dyeCols = sc?.Page == "DyePanel";` 并透传）
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs:581`（`IcfgRow` 签名加 `bool dyeCols = false`；缓存选择链加 `_icfgDyeCache`；占位行尾列 `,"[]"`）
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs:857`（`BuildIcfgRow` 末尾 dye 分支）与 `RailData.cs:1217` 邻域（声明 `_icfgDyeCache`）
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs:481-485` 邻域（ctx 拼装点，tradePrefs 页条件先例同款加 `dyePal`）

**Interfaces:**
- Consumes: Task 1 附录 A 的访问链
- Produces: ①DyePanel 页 icfg 行 16 列：基座 15 列 + `r[15]` = pig 串 `"[[<colorId>,<points>],…]"`（无色素 `"[]"`）；其他页形状不变 ②`ctx.dyePal = [[<colorId>,"色名","#hex",1,<order>],…]`（unlocked v1 恒 1；仅 DyePanel 页带出）——Task 3 的 normIcfg/menu 按此消费

- [ ] **Step 1: 实现**——`BuildIcfgRow` dye 分支照 fuelCols 分支（:893）抄纪律：try/catch 逐字段，读不到 pig 素=`"[]"`；色名/hex 经现有 esc；dyePal 拼 `[[id,\"名\",\"#hex\",1,order]…]`，颜色板空则**整个字段不下发**
- [ ] **Step 2: 构建**——Run: `dotnet build SurvivalLog.CabinetEverywhere/SurvivalLog.CabinetEverywhere.csproj -c Release`；Expected: 0 Error
- [ ] **Step 3: 实机冒烟（作者配合）**——装 dll 开染料桶，`Debug.Verbose=true` 看推送：DyePanel icfg 行长 16、含 pig 串、ctx 带 dyePal；其他页（Cooking）行长 15 照旧
- [ ] **Step 4: Commit**——`git commit -m "feat(cerail): 染料桶契约——icfg pig尾列(16列,分键缓存)+ctx.dyePal颜色板"`

### Task 3: JS 契约读取 + 专属排序 `dispApplyDyePig`

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js:411`（`normIcfg`：`pig` 类型判形 + 收紧 `bw` 判形）
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js:125`（`SORT_KEYS` 加 `DyePanel: 1`）
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js:1237` 邻域（`dispApply` 路由 dye 分支）
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js:1277` 邻域（`dispApplyBrewSat` 后加 `dispApplyDyePig` + `pigPointsOf`）
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js:3913` 邻域（自检口 `window.__CERAIL__.dyePig`，brewTier 先例）
- Test: `tools/railui-harness-tests/harness-dye-pig.cjs`（新建，harness-brew-tier.cjs 同构骨架）

**Interfaces:**
- Consumes: Task 2 契约形状
- Produces: `pigPointsOf(row, colorId) -> number`（0=无/畸形/缺 ICFG）；`dispApplyDyePig(D, model)`；排序键 `"pig:<colorId>"`；自检口 `window.__CERAIL__.dyePig.points(row, colorId)`——Task 4/5 消费

- [ ] **Step 1: 写失败测试（§1/§3）**——夹具：mock 契约 DyePanel 页，icfg 16 列带 pig（cfgA `"[[3,2],[5,1]]"`、cfgB `"[[3,2]]"`、cfgC `"[]"`、cfgD 畸形 `"x"`、cfgE 15 列无尾列），items.bag 混排 + 一件 2×1 多格植物；断言：
  - `shape-collision`：normIcfg 后 `ICFG[cfgA].pig` 为串、`.bw===0`；15 列行 `.pig===''`
  - `pig-malformed`：`dyePig.points(cfgD 行,3)===0` 不抛
  - 排序：`pushCtx('DyePanel')` + 触发排序（循 harness-brew-tier.cjs §3 同路：applyDispSort/菜单点击）选 `pig:3` 后模型 y 序 = [cfgA,cfgB(同点并列按原序稳定)] → 沉底组 [cfgC,cfgD,非植物] 原相对序 → 多格 plant 装填无重叠（dispPack 通用断言）
- [ ] **Step 2: 跑测红**——Run: `node tools/railui-harness-tests/harness-dye-pig.cjs`（serve.cjs 起 8180）；Expected: FAIL（pig 未定义/排序无路由）
- [ ] **Step 3: 实现**——`normIcfg` 加 `pig: (r.length===16 && typeof r[15]==='string') ? r[15] : ''`，`bw` 改 `(r.length===16 && typeof r[15]==='number' && r[15]) ? 1 : 0`；`pigPointsOf`=懒解析 ICFG[cfgId].pig JSON（失败/缺失返 0）；`dispApplyDyePig` 逐句镜像 `dispApplyBrewSat`（__srReal 捕获→dispRows join→按 points>0 分组降序/并列稳定→rest 原序→dispPack→写 x/y→renderItems；packed==null→dispRestore）；`dispApply` 在 brew 分支后加 `if (st.scene==='DyePanel' && String(D.choice).indexOf('pig:')===0){ dispApplyDyePig(D,model); return; }`；SORT_KEYS 加行
- [ ] **Step 4: 跑测绿**——同 Run；Expected: §1/§3 全 PASS，零 console error
- [ ] **Step 5: Commit**——`git commit -m "feat(cerail): 染料桶JS排序——pig类型判形+dispApplyDyePig专属apply(点数降序/沉底稳定)"`

### Task 4: JS 菜单（颜色板）+ 角标（suppress 口径）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js:1964-1975`（menuFoot `keys()` DyePanel 分支）
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js:1065`（`fsortLabel` 动态键兜底查 dyePal）
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js:1513-1575`（角标层 dyeMode：有点数画角标、无点数**不出**——suppress，非 `-`、无置灰遮罩）
- Modify: `railui.page.js` NB_CSS 邻域或既有弹窗 CSS（`.sr-fswatch` 色块 + 弹窗 max-height 滚动）
- Test: `tools/railui-harness-tests/harness-dye-pig.cjs`（追加 §2/§4）

**Interfaces:**
- Consumes: `store.ctx.dyePal`（C# ctx 页条件字段，brewP1 同读法）；Task 3 `pigPointsOf`
- Produces: 菜单项 `{k:'pig:<id>', label:色名, ico:'●', color:'#hex'}`；角标 spec 色=该色 hex

- [ ] **Step 1: 写失败测试（§2/§4）**——断言：
  - DyePanel 推 dyePal（12 色）→ 菜单项=「默认」+12 色项、`menu-scroll`：弹窗容器 scrollHeight>clientHeight 且可滚
  - `menu-empty-pal`：dyePal 缺失 → 菜单仅「默认」，按钮在、无报错
  - §4 角标：选 `pig:3` 后 cfgA 格右上角 `<i>` 文本 `2` 且 color=#该色 hex；cfgC/非植物格**无** `<i>`（suppress）、**无**置灰类
- [ ] **Step 2: 跑测红**——Run 同 Task 3；Expected: §2/§4 FAIL
- [ ] **Step 3: 实现**——menuFoot `keys()` 加 `if (st.scene==='DyePanel') return [FSORTS[0]].concat(dyePalItems());`（dyePalItems=读 `store.ctx.dyePal` 映射菜单项，空返 `[]`）；makeSortMenu 渲染项支持可选 `color` 画 10px 圆点；`fsortLabel` 加 pig 键兜底；角标层照 brewMode 加 `dyeMode`（spec 色=hex；文本=`String(points)`，points<=0 跳过该格）；弹窗 max-height+overflow-y:auto
- [ ] **Step 4: 跑测绿**——Run；Expected: 全 PASS 零 error
- [ ] **Step 5: Commit**——`git commit -m "feat(cerail): 染料桶菜单全色板+色素角标(suppress口径)+弹窗滚动"`

### Task 5: 回归补全——复位/隔离/跨页判形

**Files:**
- Test: `tools/railui-harness-tests/harness-dye-pig.cjs`（追加 §5）；若断言暴露实现缺陷，回改 Task 3/4 的文件

**Interfaces:**
- Consumes: Task 3/4 全部

- [ ] **Step 1: 写测试（§5）**——断言：
  - `official` 复位：选 pig 后再选「默认」→ dispRestore（x/y=__srReal）
  - 重开复位：重推 DyePanel ctx（模拟重开 mount）→ `st.fsort==='official'`
  - 推包重应用：pig 排序态下 mock 推包（物品挪位/增减）→ 模型仍按点数序
  - `menu-isolation`：BrewPanel 菜单仍 2 项、Cooking 仍 7 项、Trade 仍 7 项
  - 背包↔柜子页签切换：items 带 `<ownerId>` 组同序断言（pig 是 cfg 级，柜子物品同规可排）
- [ ] **Step 2: 跑测**——FAIL 则修实现（红→绿循环）
- [ ] **Step 3: 全量回归**——Run: `node tools/railui-harness-tests/harness-brew-tier.cjs && node tools/railui-harness-tests/harness-regression.cjs`（+本文件）；Expected: 全 PASS
- [ ] **Step 4: Commit**——`git commit -m "test(cerail): 染料桶排序回归——复位/重开/推包重应用/跨页菜单隔离"`

### Task 6: 文档收尾

**Files:**
- Modify: `README.md` + `SurvivalLog.CabinetEverywhere/README.md`（功能清单/English 各一条；配置表若 Task 1 加了 Debug.DumpDyePigments 则补行）
- Modify: `SurvivalLog.CabinetEverywhere/CHANGELOG.md`（v1.8.x 条目）
- Modify: `SurvivalLog.CabinetEverywhere/UI-SPEC.md`（若该文件覆盖页脚/排序钮装配，补 DyePanel 一行）
- Modify: `docs/superpowers/specs/2026-11-07-dye-pigment-sort-design.md`（附录 A 定稿核对）

- [ ] **Step 1: 补文档**（内容=功能一句话+撤销口径：删 dll 即无）
- [ ] **Step 2: 终检**——全 harness 复跑 + `dotnet build` 0 Error
- [ ] **Step 3: Commit**——`git commit -m "docs(cerail): 染料桶色素排序——README/CHANGELOG/UI-SPEC/附录A定稿"`
