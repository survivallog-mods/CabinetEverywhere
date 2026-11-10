# 篮子救援 glist 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BackpackUI 篮子模式（二楼吊篮救援）背包侧接入 glist 列表（全局搜索/需求类别单选筛选/救助贡献实时边际分排序/右键直放篮子），无许愿时退固定 9 分类筛选+手动排序。

**Architecture:** C# 新增 `BasketGlist.cs`（AccessTicker 0.5s 轮询：篮子态门控→签名比对→官方 `NeighborRules.CalcSendProgress` 差分逐行边际分→SelfCheck 对官方 gain→产出 `ctx.basket` 页条件字段并入 rail 契约）；drain 新 op `basketPut` 走官方容器移动直达篮子。JS 侧 glist 节新增第四场景 `GLIST.BackpackUI`（gate=ctx.glistOn 已含篮子态；宿主=A 侧 .bag-panel；chips 三态/aid 徽章/禁入置灰/nowish 手动排序）。零新增 Harmony patch。

**Tech Stack:** C# net6.0 BepInEx IL2CPP interop / railui.page.js 注入 / railui.css / harness=Playwright（design-proto serve.cjs:8180 + fixtures）。

**Spec:** `docs/superpowers/specs/2026-11-09-basket-glist-design.md`（执行者两份都读；本计划从该文档出证）

## Global Constraints

- 官方算子直调零复刻：分值=`NeighborRules.CalcSendProgress(List<int> itemCategories, List<int> itemValues, List<int> wishCategories, int hitPerCategory, float hitValueRate, float missValueRate, List<int> hitCategoriesOut)`（dump.cs:111589）差分；危机=`CalcCrisisResolveProgress(List<int> itemCategories, List<int> itemCounts, int crisisCategory, int resolveProgress, int resolveProgressPerItem, out int hitPieces)`（dump.cs:111590）。禁入=`NeighborRules.IsBasketForbidItem(int)`（dump.cs:111585 区段）。
- 状态读取面（已 gamekb 复核）：`State_Web_BackpackUI.IsBasket_B`（RP<bool>）、`NeighborWishSnap`（public 属性，字段 active/wishCats/wishNames/basketAway/wishPending/tier/tierName/missValueRate/progress/max/hitPerCategory/hitValueRate/dying/satietyMin/satietyHigh/crisisActive/crisisCat/crisisCatName/crisisTitle/crisisResolve/crisisPerItem，dump.cs:156161）、`BasketWishJson_B`（官方 gain 对账源）、`ItemDataList_B`/`OwnerIdRP_B`（篮子内容与容器 owner）、`ItemDataList_A`。
- 模式三态：dying→'dying'；noWish（快照无 wishCats 或 wishPending）→'nowish'；其余→'wish'。**away 不可达不处理**（作者裁定）。
- SelfCheck：mod 差分口径对 B 侧现有内容 Σ 与官方 wishJson `gain` 对账 |Δ|≤0.5；超差 LogWarning（按 OwnerId 去重）+ 本窗 scores 置空（JS 退无分值形态）。
- ExecuteJavaScript 带回调重载；手搓 JSON 禁 `",,"`/`"[,"`；>7500 字符走既有分块（本设计并入 rail 契约=RailData 通道，无需新通道）。
- 幂等防自激：JS 写入先签名比对（GL_SIG/expando）；C# 逐值签名门控（Il2Cpp 字符串引用比较恒不等，必须 ordinal）。
- 官方 DOM 不删不移；UI 文案中文；CSS 全部 `srg-` 前缀；零新增配置之外不动现有 cfg。
- cfg：`EnableGlistBasket`（[Access] 区，默认 true，SettingChanged→reload 慢道）。
- 非篮子模式 BackpackUI **零扰动**（native 模式/柜子页签路径原样）——每个 JS 任务的回归断言项。
- 版本 2.0.0→2.1.0（csproj+Plugin.cs 两处）；CHANGELOG/UI-SPEC 随行。

## Review Focus

1. **非篮子模式误进场**：普通背包页开 glist=毁掉 native 模式。→ Task 5 断言：ctx 无 basket/glistOn=false 时 glistFrame 零挂载、`.bag-panel` 零改动。
2. **SelfCheck 失败仍显示分值**：组合层不齐时显示错数比不显示更糟。→ Task 1 单测（纯逻辑部分）+ Task 6 断言：scores 空时徽章/排序牌不渲染、chips 保留。
3. **篮子内容变化徽章不联动**（21→6 场景）：签名漏了 B 侧物品→分值陈旧。→ Task 6 断言：推两次 ctx.basket（不同 gain/scores）徽章文本变更。
4. **右键柜中物品走整叠而非 1 件**：→ Task 3 断言 basketPut 对 count>1 的叠只移 1 件（拆件口径沿 OpTake SplitItem 模式）；Task 6 断言 op 报文形状。
5. **篮子满/禁入无反馈**：→ Task 3 feedFail 回执路径 + Task 6 toast 断言；禁入行置灰断言。

---

### Task 1: BasketGlist C# 取数与差分壳（门/签名/三态/官方直调/SelfCheck）

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/BasketGlist.cs`
- Modify: `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs`（AccessTicker 0.5s 快轮区段，TradeFx.Poll 同列加一行 `BasketGlist.Poll()`）

**Interfaces:**
- Consumes: `RailUi.Enabled` 门控惯例；`ReduxUISystem.IsUIActive(WebUI_BackpackUI)`（RailData.ActiveScene 同款取法）；`Reducer_Web_TradeUI`/TradeFx.cs 的 GetStateByUI+TryCast 取态模式（TradeFx.cs:37-38）。
- Produces（Task 2 消费）: `internal static class BasketGlist { public static void Poll(); internal static string BasketJson; /* null=非篮子态；否则 ctx.basket 段 JSON（无外层花括号的 "basket":{...} 片段或整对象，Task 2 定形状） */ internal static bool BasketOn; /* EnableGlistBasket && IsBasket_B && 窗活 */ }`
- 差分纯逻辑放可测静态：`internal static int MarginalOf(int[] baseCats, int[] baseVals, int cat, int val, int[] wishCats, int hitPerCategory, float hitRate, float missRate)`——内部两次 `NeighborRules.CalcSendProgress`（Il2cpp List 编组）取差；**SelfCheck 纯逻辑** `internal static bool SelfCheckOk(int modSum, int officialGain)`（|Δ|≤0.5）。

- [ ] **Step 1: 写失败的纯逻辑单测**

`tools/basket-glist-test/basket-glist-test.csproj`+`Program.cs`（镜像 tradefx-math-test 结构：`<Compile Include>` 链接被测源文件；因 Il2Cpp 调用不可离线跑，单测只覆盖**非 interop 部分**：三态判定 `ModeOf(NeighborWishSnap 字段的托管镜像)`（dying/noWish/wish）、SelfCheckOk 边界（0.5 过/0.6 不过）、BasketJson 构建形状（三态 chips/空 scores/forbid 数组、转义禁 `",,"`）。断言值先手算钉死写进测试。

- [ ] **Step 2: 跑测试确认失败** — Run: `dotnet run --project tools/basket-glist-test`（cwd=仓库根）Expected: 编译失败（类不存在）。
- [ ] **Step 3: 实现 BasketGlist.cs**

Poll 流程：`if (!RailUi.Enabled) return;` → 门（IsUIActive(BackpackUI) && IsBasket_B.Value && EnableGlistBasket）不满足→`BasketJson=null; BasketOn=false; return`（幂等）。满足→**签名**（BasketWishJson_B ordinal + NeighborWishSnap.progress/max/tier/crisisActive/crisisCat + ItemDataList_B 逐件 (ItemConfigId,count) 序列化 + ItemDataList_A 引用）与上次比对，同→return。变→重建：读 `NeighborWishSnap`（try/catch 任一异常→warn-once+BasketJson=null）；三态判定；wish 态对 rail 目录全部不同 cfg（含背包+契约柜，复用 RailData 侧 icfg 遍历口径）算 `MarginalOf`（危机激活时危机类别行改 `CalcCrisisResolveProgress` 差分：baseCats/Counts 追加本件）；`forbid`=对在场 cfg 调 `IsBasketForbidItem`（static Dictionary 缓存）；SelfCheck=对 ItemDataList_B 逐件按同差分口径累加 vs BasketWishJson_B.gain（JSON 提取 `"gain":(\d+)`，官方 wishJson 解析仅此一处）→超差 warn-once+scores 清空。产出 BasketJson。`[Debug] Verbose` 时 Debug 日志（mode/行数/json 字节数/耗时 Stopwatch）。
- [ ] **Step 4: 跑测试确认全过** — Run 同上 Expected: 全 PASS。
- [ ] **Step 5: `dotnet build SurvivalLog.CabinetEverywhere` 编译过**（interop 段编译验证；运行行为归 Task 7 实机）。
- [ ] **Step 6: Commit** `feat(basket-glist): 取数与差分壳（门/签名/三态/官方直调/SelfCheck）+ 单测`

### Task 2: 契约接线（ctx.basket/glistOn@BackpackUI）+ cfg + 键盘门

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs`（BuildJson 页条件字段区，dyePal 先例位 ~:505-509）
- Modify: `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs`（cfg 声明 :92 区+Bind :203 区+SettingChanged :219 区）
- Modify: `SurvivalLog.CabinetEverywhere/RailUi.cs`（GlistKeyboardTick 页键组 :760-762 与门 :838-841）

**Interfaces:**
- Consumes: Task 1 `BasketJson/BasketOn`。
- Produces: BackpackUI 页包新增 `"glistOn":BasketGlist.BasketOn`（其余页不含）与 `"basket":<BasketJson>`（BasketJson 为 null 时该键整体缺省——JS 判键在场）；`internal static ConfigEntry<bool> EnableGlistBasket`。

- [ ] **Step 1: RailData.BuildJson 接线**——页条件门照 dyePal 模式：`page=="BackpackUI"` 时带 `glistOn = plugin.EnableGlistBasket.Value && BasketGlist.BasketOn` 与 `basket` 段（注意：BasketOn 已含窗活+篮子态判定，不重复 AND）。
- [ ] **Step 2: cfg 三处**（声明/Bind/SettingChanged→Rerun 慢道，三先例同款）。
- [ ] **Step 3: 键盘门**——页键数组加 "BackpackUI"，门=EnableGlistBasket && IsBasket_B（与 ctx.glistOn 同口径；读法沿 GlistKeyboardTick 现行 ActiveScene 判定）。
- [ ] **Step 4: 编译+既有回归不红** — `dotnet build`；起 serve.cjs 跑 `node tools/railui-harness-tests/harness-regression.cjs`（新代码未接 JS 行为，基线持平）。
- [ ] **Step 5: Commit** `feat(basket-glist): 契约接线（ctx.basket/glistOn@BackpackUI）+ cfg EnableGlistBasket + 键盘门`

### Task 3: drain op `basketPut`（官方移动直达篮子 + feedFail 回执）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailCommands.cs`（分发表 :221-242 加 case；Op 实现）

**Interfaces:**
- Consumes: `ItemManager` 官方移动（OpTake 的 SplitItem 拆 1 件模式与 OpFeed 的 TryQuickMoveItems 编组模式，:572-654/:249+）；`State_Web_BackpackUI.OwnerIdRP_B.Value`（篮子容器 owner）；`MarkFeedFail`→`ctx.feedFail` 回执链。
- Produces: JS 可发 `{op:'basketPut', owner:<long>, item:<long>}`（owner=背包 playerId 或柜 ownerId，item=物品逻辑 id）；结果失败→feedFail 文本（「篮子满了…」「篮子不收这件…」官方口径中文文案）。

- [ ] **Step 1: 实现 OpBasketPut**——目标 owner=`OwnerIdRP_B.Value`；源叠定位（owner 容器内按逻辑 id 找 Data_Item）；count>1 → SplitItem 拆 1 件至篮子（OpTake 同型），count==1 → 整件移动；容量满/禁入/异常→MarkFeedFail（消息区分满/禁入/通用三档）；成功零回执（数据回推自渲染）。
- [ ] **Step 2: 编译过 + harness-regression 持平**（op 表新增不影响既有）。
- [ ] **Step 3: Commit** `feat(basket-glist): drain op basketPut——官方移动直达篮子+满/禁 feedFail 回执`

### Task 4: 夹具 BasketBackpack.html + harness 骨架

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/design-proto/fixtures/BasketBackpack.html`
- Create: `tools/railui-harness-tests/harness-basket-glist.cjs`

**Interfaces:**
- Consumes: serve.cjs 8180 fixture 协议（`__HZ_SHOW__('BasketBackpack')`）；railui.page.js `window.__CERAIL__.setData`（契约注入驱动 glist，harness-glist.cjs 同款）。
- Produces（Task 5/6 消费）: 夹具=官方篮子模式结构静态拷贝（`.backpack-container` > 两个 `.bag-panel`：A 侧含 `#bagPanelTitle/.toolbar/.grid-container#bagGrid`+负重条，B 侧 `is-basket-panel` 含篮子格+`basket-count-section`——从官方 BackpackUI.html 篮子段抠结构去脚本留静态，FuelGenerator.html 夹具同法）；harness 骨架断言组=①夹具帧就绪 ②注入 ctx{page:'BackpackUI',basket:{mode:'wish',...}} → glist 面板出现 ③无 basket 键注入 → 面板不存在（Review Focus 1 骨架半）④console/pageerror 尾检。

- [ ] **Step 1: 写失败骨架** — Run: `node tools/railui-harness-tests/harness-basket-glist.cjs` Expected: FAIL（glist 未接 BackpackUI）。
- [ ] **Step 2: 建夹具**（官方页篮子段结构拷贝；A 侧 .bag-panel 不带 is-basket-panel 类）。
- [ ] **Step 3: Commit** `test(basket-glist): 篮子模式夹具 + harness 骨架`

### Task 5: JS 场景接线（GLIST.BackpackUI/宿主/装配链/两态切换/零扰动）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（GLIST 表 :4426-4432；glistHost :4527-4534；glistFrame/Teardown 链）
- Modify: `tools/railui-harness-tests/harness-basket-glist.cjs`

**Interfaces:**
- Consumes: Task 4 夹具与骨架；ctx.glistOn（BackpackUI 页）+ ctx.basket（Task 2）。
- Produces: `GLIST.BackpackUI = { target:'篮子', badge:'aid', feed:'basket' }`；`glistHost` 分支：BackpackUI=A 侧 `.bag-panel:not(.is-basket-panel)`（夹具先行校准选择器）；`glistFeed` 分支 `feed==='basket'` → `cmdOut('basketPut', {owner: pick.srcKey==='bag'?store.bag:Number(pick.srcKey), item: pick.id})`+toast「已放 1 件 <名> → 篮子（取自 <源>）」（FEFO 选叠沿 glistPickFefo）。

- [ ] **Step 1: 写失败断言**——①wish ctx 注入→`#srgPanel` 出现且宿主=A 侧 bag-panel、B 侧面板零改动；②列表↔格子切换钮（默认列表态，切格子=A 侧官方件复显、chrome 隐——DyePanel plain 同型）；③无 basket 注入→`.bag-panel` innerHTML 恒等+无 srg 节点（Review Focus 1 全量）；④搜索过滤。
- [ ] **Step 2: 实现场景接线**（glistFrame 对 BackpackUI 走 gate 门控=glistGate 现行式已覆盖——ctx.page==='BackpackUI' && ctx.glistOn；确保非篮子时 glistOn=false 即零进场）。
- [ ] **Step 3: 跑 harness 确认过** + `harness-glist.cjs` 回归（三旧场景全绿）。
- [ ] **Step 4: Commit** `feat(basket-glist): JS 场景接线——GLIST.BackpackUI/A 侧宿主/两态切换/零扰动`

### Task 6: chips 三态 + aid 徽章 + 禁入置灰 + 右键 + nowish 手动排序 + CSS

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（glistChipsHtml :4784-4797/glistBadgeHtml :4798-4802/glistAggregate :4453-4503/glistRender/glistAttrLines）
- Modify: `SurvivalLog.CabinetEverywhere/railui.css`（srg 节）
- Modify: `tools/railui-harness-tests/harness-basket-glist.cjs`

**Interfaces:**
- Consumes: ctx.basket `{mode:'wish'|'nowish'|'dying', chips:[{id,name,warn}], scores:{cfgId:分}, forbid:[cfgId]}`。
- Produces: ①wish chips=ctx.basket.chips（单选 data-c 再点回全部；warn 枚 ⚠ 前缀）+常驻牌「❤ 按救助贡献 ↓」；②nowish chips=9 固定 `[[0,'全部'],[1,'食物'],[9,'材料'],[5,'日用品'],[13,'燃料'],[2,'药品'],[3,'书刊'],[6,'工具'],[10,'种子']]`+手动排序钮（srSort 观感，六键 sat 饱腹/mind 心态/en 精力/hp 生命/shelf 保质期/value 交易价值；行聚合=固有值取行内首叠、shelf=行内最小 timeLeft、value=行内 Σtrade 列）；③dying chips=[食物]+排序键=饱腹；④徽章 `srg-badge srg-aid`（`+N`，#66BB6A）悬停贡献说明；⑤forbid 行 srg-dim+红叹号角标、右键 toast 拒绝；⑥行排序：wish/scores 在场=score 降序（无分垫底），scores 空=无排序牌+默认序（Review Focus 2）。

- [ ] **Step 1: 写失败断言**——三态 chips 形状/单选再点回全部/徽章 21→6 联动（两次注入不同 scores）/悬停链路/forbid 置灰+右键 toast/nowish 六键排序切换各键序正确/basketPut op 报文（Review Focus 3/4/5）。
- [ ] **Step 2: 实现**（chips/徽章/排序分支+CSS：`.srg-aid`/`.srg-chip.warn`/`.srg-row.dim`/nowish 排序钮）。
- [ ] **Step 3: 跑 harness 全绿 + 全量回归**（`harness-*.cjs` 逐个，glist/tradefx/bagtabs 等全绿）。
- [ ] **Step 4: Commit** `feat(basket-glist): chips 三态+aid 徽章+禁入置灰+右键直放+nowish 手动排序+CSS`

### Task 7: 收口——版本/CHANGELOG/UI-SPEC/构建部署/实机清单

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere.csproj`+`CabinetEverywherePlugin.cs`（2.0.0→2.1.0 两处）
- Modify: `CHANGELOG.md`、`UI-SPEC.md`（§0b-glist 第四场景条目：篮子门/chips 三态/aid 徽章/官方直调差分/SelfCheck/basketPut）

- [ ] **Step 1: 版本+文档**（CHANGELOG 记 spec 链接+作者裁定五条+SelfCheck 保险丝）。
- [ ] **Step 2: 全量 harness 回归绿**（含环境存量败线按 v1.9.2 口径核对）。
- [ ] **Step 3: 构建 Release+部署**：`dotnet build -c Release` → DLL 拷 `E:\SteamLibrary\steamapps\common\Survival Log\BepInEx\plugins\`。
- [ ] **Step 4: Commit** `feat(cerail): v2.1.0 篮子救援 glist——二楼吊篮列表式全局物品栏（细节见 CHANGELOG/UI-SPEC）`
- [ ] **Step 5: 【作者实机清单】交付时随附**：①开篮子窗→列表进场、许愿 chips+分值徽章出现；②放首件材料→其余材料行徽章掉档（21→6 口径）联动；③右键柜中物品 1 件直入篮子、篮子满/禁入 toast；④铁丝/精致铁皮两场景官方 gain 与 mod Σ 对账日志干净（SelfCheck）；⑤无许愿态 9 分类筛选+六键手动排序；⑥关篮子→普通背包页 native/柜子页签原样零扰动；⑦垂危/危机态（存档可造时）chips 形态。
