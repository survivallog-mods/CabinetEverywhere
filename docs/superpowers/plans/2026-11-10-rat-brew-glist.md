# 老鼠笼/酿酒桶全局物品栏（Rat & Brew Glist）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 v1.9.0 竖版全局物品栏（glist）扩装到 RatCage/BrewPanel 两页：饱腹降序、rat 角标 🍗、brew 角标=游戏三档酒精瓶图+品质色、旧侧栏排序钮退役、零新增配置键。

**Architecture:** GLIST 描述符加两场景（rail 页宿主=dye 默认分支零新装配码）；聚合加 sat/brew 分支（筛选 s1>0 / icfg.bw、拆行键 +s1(+s2)）；右键走 dye 同款默认回放分支（feed 值非 fuel/basket 即入）；C# 只加 ctx `glistOn`（两页恒 true）+ `brewIco`（BrewPanel 页三瓶 WebIcon）+ 键盘门两页键组。

**Tech Stack:** BepInEx IL2CPP C#（RailData.cs/RailUi.cs）+ 原生 JS（railui.page.js/railui.css 注入 iframe）+ node harness（playwright，serve.cjs@8180）。

**Spec:** docs/superpowers/specs/2026-11-09-rat-brew-glist-design.md（随行阅读；六条作者裁定+四 spike 结论已定谳）

## Global Constraints

- §0 红线：官方格 DOM/监听零触碰；右键=官方事件回放（ITEM_CLICK rightClick，两页官方源码实证 RatCage.html:523 / BrewPanel.html:444）。
- 零新增配置键（spec 裁定#7）；两页 `glistOn` 恒 true；`EnableRatCage`/`EnableBrew` 不再作用于这两页。
- 排序=纯 s1 降序+并列稳定（badge.v 通用径）；品质不参与排序。
- 隐藏：rat=s1≤0、brew=icfg.bw=0；页脚右下计数；无 chips，仅常驻牌「🍗 按饱腹度 ↓」。
- 拆行键（裁定#5）：rat 合并键+`s1`、brew+`s1/s2`；其他场景键逐字节不变。
- 品质三色：劣 #7fe05a / 普 #ffc93c / 烈 #ff7086（原型定稿值）；瓶图=Config_Item WebIcon（15505 劣/15504 普/15506 烈）。
- 其他 12+ 页 icfg 形状/菜单/角标/行为逐字节不变；v14.1 旧径代码保留（harness glistOn=false 可达）。
- 版本 2.1.0→2.2.0（csproj+Plugin.cs）。

## Review Focus

1. **同名异 s1 不得并一行**（蒜蓉西兰花 40/20 实据）→ RB-A 拆行断言；feed/回放匹配同键口径（键函数改签名后三处调用点全改）。
2. **非可酿食物必须藏**（brew 页 s1>0 但 bw=0）→ RB-B 断言；对偶 rat 页 s1≤0 藏（含 s1=null）。
3. **tier 除零/空值**：s1>0 但 s2=null→密度 0 按阈值判档（v14.1 brewTierOf 同式）；s1=null→隐藏不进档计算。
4. **柜源双跳**：take 先行、推送落包后才回放新实例（GLPEND 队列 5s 过期）→ RB-D 复用 dye D5 模式。
5. **格子态退役面**：两页 srg-plain 下 srFoodSort 必隐、srStoreAll/格数仍在 → RB-E；染料页排序钮不受牵连（回归）。

---

### Task 1: JS 聚合扩展——GLIST 两场景 + sat/brew 分支 + 拆行键

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（GLIST 描述符 ~L4426、glistItemKey ~L4453、glistAggregate ~L4457、glistPickFefo ~L4763、glistPump ~L4809）
- Test: `tools/railui-harness-tests/harness-glist.cjs`（RB-A/RB-B 节追加）

**Interfaces:**
- Produces: `GLIST.RatCage={target:'食物仓',badge:'sat',feed:'click'}`、`GLIST.BrewPanel={target:'酿酒桶',badge:'brew',feed:'click'}`；
  `glistItemKey(r, sceneKey)`（sceneKey 可选，缺省=旧键）；聚合行 `r.s1/r.s2`（sat/brew 场景）、
  `r.badge={v:s1[,tier]}`、hiddenCount 语义同先行页。
- Consumes: items 行 r[9]=s1/r[10]=s2（契约 v4 现列）、icfg `bw`（v14.1 尾列，normIcfg 现成）、ctx `brewP1/brewP2`（所有页已推）。

- [ ] **Step 1: 写失败测试 RB-A（rat 聚合）**——夹具 items 带 s1/s2：同名异 s1 两 cfg=两行（键拆）、s1≤0 隐藏计数、s1 降序+并列稳定（badge.v 序）。
- [ ] **Step 2: 写失败测试 RB-B（brew 聚合）**——bw=0 藏、tier 三档（ctx.brewP1=0/brewP2=0.5 夹具：密度 <0 劣 / 0~0.5 普 / ≥0.5 烈）、同名异 s2 拆行、badge.v=s1。
- [ ] **Step 3: 跑测确认 FAIL**（`node tools/railui-harness-tests/harness-glist.cjs`，serve.cjs 在 8180）——Expected: RB 系全 FAIL（NOGLIST/键未拆），A/GE/GF 系全 PASS（回归面）。
- [ ] **Step 4: 实现**——描述符+键签名（sceneKey 尾参，三调用点 aggregate/feed/pump 传 f.key 或 sceneKey；brewTierOf 复用为 `{s1,s2,cfgId}` 垫片）；聚合两分支首循环捕 g.s1/g.s2、二循环判隐藏+badge（tier=brewTierOf 垫片，-1 不出现——已被 bw 门过滤）。
- [ ] **Step 5: 跑测确认 PASS** + A/GE/GF/D 系回归绿。
- [ ] **Step 6: Commit**（`feat(glist): RB 场景聚合——sat/brew 分支+拆行键`）

### Task 2: JS 渲染——排序牌/角标瓶图/属性行/页脚计数 + CSS

**Files:**
- Modify: `railui.page.js`（glistChipsHtml ~L4837、glistBadgeHtml ~L4852、glistAttrLines ~L4692、glistRender footR ~L4993）
- Modify: `SurvivalLog.CabinetEverywhere/railui.css`（srg-badge 系 ~L479）
- Test: `harness-glist.cjs`（RB-C 节）

**Interfaces:**
- Consumes: Task 1 行形状；`ctx.brewIco`（Task 3 C# 推，数组 [劣,普,烈] URL；缺省=角标退纯色无图）。
- Produces: 角标 HTML：rat=`🍗 N`（绿 #8fc06e）；brew=`<img class="srg-bico">N`（档色壳，色=GLB_TIER_C[tier]）。

- [ ] **Step 1: 写失败测试 RB-C**——chips 行仅一张牌文本「🍗 按饱腹度 ↓」；rat 角标色、brew 角标 img src=ctx.brewIco[tier] 逐档+档色 style；footR 两页隐藏计数文案；tip/detail 属性行含「预估品质：劣质/普通/烈性」（brew）与「饱腹度：N」。
- [ ] **Step 2: 跑测确认 FAIL**。
- [ ] **Step 3: 实现**——常量 `GLB_TIER_C=['#7fe05a','#ffc93c','#ff7086']`、`GLB_TIER_TXT=['劣质','普通','烈性']`（近 GLIST）；chips/badge/attrLines/footR 四处分支；CSS `.srg-bico`（13px contain drop-shadow）+sat 绿壳复用 srg-badge 内联式（照 srg-pig 内联 hex 先例，brew 档色壳走内联）。
- [ ] **Step 4: 跑测确认 PASS** + 回归绿。
- [ ] **Step 5: Commit**

### Task 3: C# 契约——glistOn 无条件 + brewIco + 键盘门两页

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs`（ctx ~L495-511、brewIco 读取=ic.WebIcon 先例 L954，静态缓存）
- Modify: `SurvivalLog.CabinetEverywhere/RailUi.cs`（GlistKeyboardTick 键组 L760-762、active 条件 L843-846）

**Interfaces:**
- Produces: ctx `"glistOn":true`（RatCage/BrewPanel 恒真，无 cfg）；ctx `"brewIco":["…","…","…"]`（仅 BrewPanel 页，序=[劣15505,普15504,烈15506]；读不到=整字段缺席）。
- Consumes: `Config_Item.WebIcon`（ItemDict 查表）；页键遥测词表（RatCage/UI_RatCage/WebUI_RatCage、Brew/UI_Brew/WebUI_Brew 变体）。

- [ ] **Step 1: RailData**——两 if 分支 glistOn 恒 true + brewIco 静态字符串（三 ID WebIcon join，try/catch 空=不下发；注释=裁定#7）。
- [ ] **Step 2: RailUi**——`_gkRatKeys/_gkBrewKeys` 两键组 + active 条件追加两行（无 cfg 门）；遥测倾倒循环同步。
- [ ] **Step 3: 构建**（`dotnet build -c Release`）——Expected: 0 error。
- [ ] **Step 4: Commit**

### Task 4: 旧侧栏退役门——排序钮 + harness 夹具扩展

**Files:**
- Modify: `railui.page.js`（srFoodSort 门 ~L2176）
- Modify: `design-proto/railui-root-harness.html`（glistOn 注入行 ~L361 加两页；BrewPanel ctx 加 brewIco 夹具）
- Test: `harness-glist.cjs`（RB-D feed 节 + RB-E 装配节）

**Interfaces:**
- Produces: `GLIST_RETIRE_SORT={RatCage:1,BrewPanel:1}`；`el.srFoodSort.hidden = … || (GLIST_RETIRE_SORT[st.scene] && glistOwnsPage(st.scene))`。
- Consumes: Task 1/2 行为；root html take 模拟器（dye D5 同款）。

- [ ] **Step 1: 写失败测试 RB-D**（bag 源=ITEM_CLICK rightClick 直回放一发；柜源=take 先行+落包后回放新实例，复用 __HZ_SENT__ 捕获）。
- [ ] **Step 2: 写失败测试 RB-E**（knob 开：#srgPanel 挂载、列表态 rail 隐；切格子态：#srp.srg-plain、srStoreAll 可见、**srFoodSort.hidden=true**；knob 关：拆净还原 srFoodSort 复原）。
- [ ] **Step 3: 跑测确认 FAIL**（RB-E 排序钮断言败；RB-D 因 feed:'click' 落默认分支可能已过——若过则记为 Step 4 前的既绿断言）。
- [ ] **Step 4: 实现**——排序钮门常量+条件；root html 两处夹具。
- [ ] **Step 5: 跑测确认 PASS** + 回归绿。
- [ ] **Step 6: Commit**

### Task 5: 全量回归 + 版本文档收口

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere.csproj`+`CabinetEverywherePlugin.cs`（2.2.0）、`CHANGELOG.md`、`README.md`、`SurvivalLog.CabinetEverywhere/UI-SPEC.md`（§0b-glist 五/六场景）、spec 文档 spike 回填（S1-S4 结论已入本计划，回填一行状态）。

- [ ] **Step 1: 全量 harness**（serve.cjs 在跑，逐个 `harness-*.cjs`）——Expected: 全绿；已知存量环境败线（mount/regression/store-all/tidy）按 v1.9.2 记录口径核对为环境问题非本批引入。
- [ ] **Step 2: 构建+部署**——`dotnet build -c Release` → DLL 拷 `E:\SteamLibrary\steamapps\common\Survival Log\BepInEx\plugins\`。
- [ ] **Step 3: 版本 2.2.0 三处对齐 + CHANGELOG/README/UI-SPEC/spec 状态行**。
- [ ] **Step 4: Commit**（`feat(cerail): v2.2.0 老鼠笼/酿酒桶全局物品栏——饱腹降序+酒精瓶品质角标+旧侧栏退役（细节见 CHANGELOG/UI-SPEC）`）
