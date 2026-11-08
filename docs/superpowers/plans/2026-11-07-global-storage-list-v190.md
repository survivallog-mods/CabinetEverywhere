# 竖版全局物品栏 v1.9.0（染料桶+暖炉）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 DyePanel（染料桶）与 Heater（暖炉）两页的左侧背包区装配「竖版全局物品栏」：跨背包+整屋柜子汇总列表 + 场景预设筛选排序 + 行三键交互（悬停/左键详情/右键移 1 件到染料槽或炉膛），单图标钮与现行格网视图互切。

**Architecture:** 全部 UI 落在既有 `railui.page.js` 单文件内新增 `glist` 段（页面描述符表驱动，两页各一条），CSS 追加 `railui.css`（`srg-` 前缀）；数据零新管道——RailData 契约 v4 本就每页推送全屋快照（背包+全部白名单柜 items + icfg 尾列 burnValue/pig + ctx.dyePal）；右键走既有命令（暖炉=`feed`，染料=柜源先 `take` 再页面官方 ITEM_CLICK rightClick 回放，Unity 裁决）；C# 仅加两个 cfg 开关与 `ctx.glistOn` 页条件字段。

**Tech Stack:** BepInEx 6 IL2CPP 插件（C#）+ 游戏内 WebView 页（JS 注入 bootstrap 单 IIFE）+ Playwright harness（design-proto/railui-root-harness.html 真实 DOM）。

**Spec:** `docs/superpowers/specs/2026-11-07-global-storage-list-design.md`（已批准；§7.0 裁定：交易点待定不进本批、染料 8 色补齐；§5 视觉规格、§4 决策表随行）

## Global Constraints

- **版本**：本批 = **1.9.0**（作者指定）。csproj `<Version>`（SurvivalLog.CabinetEverywhere.csproj:7）与 `CabinetEverywherePlugin.cs:43` 常量必须一致；CHANGELOG 必须有 `## v1.9.0` 节（release.ps1:25-31 门）。
- **§0 动作保真红线（经 2026-11-07 修订）**：列表行零格子级取放语义；行交互仅三类=悬停（只读）/左键详情（只读）/右键移 1 件（官方口径事件回放：暖炉 `Ac_Heater_FuelAdd`、染料页面官方 `ITEM_CLICK rightClick`——Unity 裁决含 canDye/locked/满员与官方 toast，mod 不拦截不伪造）。
- **观察器铁律（§0b）**：所有 DOM 写签名/同值守卫；innerHTML 串比较永不相等=自激环；拆除态不得重建。
- **命令纪律**：JS→C# 只走 CMDQ/drain（railui.page.js:812-827）；C# `RailCommands.Pump` ≤8 条/帧（RailCommands.cs:183-211）；回调线程只入队不执行。
- **cfg 生效**：新键挂 `SettingChanged → Rerun=true` 慢道重收敛（CabinetEverywherePlugin.cs:199-221 先例）；release.ps1:51-100 补归一化默认值。
- **数据源（builder check 已定非开放项）**：热值=icfg 尾列 idx16 `burnValue`（idx15 burnable，fuelCols=FuelGenerator||Heater，RailData.cs:907-913）；色素=icfg 尾列 `pig` 串 `"[[dyeItemId,points]…]"`（:926-929，`_Config_PlantPigment_Dict` 66 行聚聚合）；色板=`ctx.dyePal` `[[dyeItemId,"名","#hex",1,order]…]`（:968-993）。**主色=该植物点数最高的色**（官方 DyePanel `State.mainPoints` 同口径，fixtures DyePanel.html:400-417）。
- **合并判据（沿用全库列表旧约 UI-SPEC §3-6）**：同名且 `timeLeft`/`flags` 任异不合并（显示层近似，不动真实摆放）；来源序=背包恒第一、其后 ctn 页签序。
- **视觉规格锚点（spec §5）**：面板宽 616px；行高双行 ~52px；Σ数量=`x120` 12px Consolas 加粗；切换钮=单图标 34×30 微贴右上角（margin:-5px -5px 0 0），列表态显 SVG 田字格、格子态显 `☰`；水滴徽章=官方 dropSvg 方案仅换填充色=主色 hex；页脚文案逐字按 spec §5.1；空态「无匹配物品」；列表渲染上限 300 行（旧全库约）+「已截断显示前 300 种」提示。
- **范围红线**：右侧染料桶本体/暖炉本体面板零改动；FuelGenerator 页**不进本批**（保留现行 bagtabs）；二楼交易点待定；现有 bagtabs（Heater）与 rail 壳（DyePanel）在格子态原样可用。
- 每任务收尾跑 `node --check SurvivalLog.CabinetEverywhere/railui.page.js`（语法门，docs-cerail-acceptance.md:238）。

## Review Focus

1. **观察器自激环**：glist 渲染若无签名守卫会每帧重写 innerHTML（§0b 59 万写/秒前科）→ Task 2 测试：mount 稳定后连续 5 帧写计数=0。
2. **切换/拆除还原泄漏**：list↔grid 反复切 + cfg 关=拆净后，残留 `srg-*` 节点/样式/监听 → Task 2 测试：拆除后左面板 innerHTML 与装配前快照一致；开关三循环后无 `#srgPanel`。
3. **右键染料双跳时序**：柜源物品 `take` 未等数据推送回就回放=物品不在背包=回放丢失 → Task 4 测试：mock 推送延迟 2 帧后才回放，断言回放携带的 itemId 在推送后。
4. **属性异合并**：timeLeft/flags 异的同名物品被错误合并（spec 反目标）→ Task 1 测试：两叠同名 timeLeft 异 → 2 行。
5. **dyePal 未就绪/空板**：配置未推送时 chips 渲染崩（染料批「空板=仅默认」前科）→ Task 5 测试：dyePal=[] → 仅「全部」chip，列表照常渲染不报错。

---

### Task 1: 聚合核心 `glistAggregate`（JS 纯函数）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（bagtabs 段后新增 `/* ===== glist 全局物品栏 ===== */` 段）
- Test: `tools/railui-harness-tests/harness-glist.cjs`（新建，本任务先落「聚合」节）

**Interfaces:**
- Consumes: rail store 既有 `store.items`（keyed `"bag"`+各柜 ownerId，行 `[id,cfg,count,timeLeft,x,y,w,h,flags,s1..s4,trade,days]`，railui.page.js setData:4046）、`store.icfg`（15 列基座+页尾列）、`store.ctn`、`store.ctx.dyePal`；`pigMapOf` 既有解析（:1346-1360）。
- Produces（后续任务依赖，签名固定）:
  - `GLIST` 页描述符表：`{ DyePanel:{target:'染料槽',badge:'pig',feed:'dye'}, Heater:{target:'炉膛',badge:'heat',feed:'fuel'} }`
  - `glistAggregate(sceneKey) -> { rows:[{key,cfg,name,ico,total,srcs:[[ctnKey,name,n]…],fuel,badge:{v,hex?},colorId,mainPts}], hiddenCount, truncated }`；`srcs` 背包恒首；`badge.v`=主色点数（pig）/burnValue（heat）；合并键=`cfg+'|'+timeLeft+'|'+flags`；rows 已按场景排序键降序、截 300。

- [ ] **Step 1: 写失败测试**（harness-glist.cjs，Playwright 起 serve.cjs:8180 后对 root harness `page.evaluate` 断言；check 风格=既有 `check(name,ok,detail)` + 尾行 `---- glist: X/Y PASS ----`）
  断言：①同名同 timeLeft/flags 两柜叠→1 行 Σ=合计、srcs 背包首；②timeLeft 异→2 行；③flags 异→2 行；④Heater 场景 badge.v=burnValue 降序、非 fuel 不进 rows 且 hiddenCount 计数；⑤Dye 场景多色植物 mainPts=最高点数、colorId=对应 dyeItemId、无色素植物进 hiddenCount；⑥>300 种→truncated=true 且 rows.length=300。mock 数据经 root harness 既有 `__HZ_MOCKSET__`/`__HZ_PUSH__('DyePanel'|'Heater')` 注入（含跨 3 柜+背包的物品集与 pig/burnValue 尾列）。
- [ ] **Step 2: 跑测确认 FAIL**（`node design-proto/serve.cjs` 常驻后 `node tools/railui-harness-tests/harness-glist.cjs`；Expected: `glistAggregate is not defined` 类 FAIL）
- [ ] **Step 3: 实现**：`GLIST` 表 + `glistAggregate(sceneKey)` 纯函数（读 store→按合并键归组→Σ/来源聚合→主色=max 点数→场景排序键降序→截 300）；不触碰任何 DOM。
- [ ] **Step 4: 跑测 PASS**；`node --check railui.page.js`
- [ ] **Step 5: Commit** `feat(cerail): glist 聚合核心——全屋同名汇总/主色/热值/300 截断`

### Task 2: 面板装配与视图互切（两页挂载、防自激、拆净还原）

**Files:**
- Modify: `railui.page.js`（glist 段续：`ensureGlist`/`glistTeardown`/`glistToggleView`）
- Modify: `SurvivalLog.CabinetEverywhere/railui.css`（追加 `srg-` 全套样式，spec §5 六段结构+官方基因）
- Modify: `design-proto/railui-root-harness.html`（新增 `__HZ_GLIST__(sceneKey,on)` 强制门 mock 钮；DyePanel/Heater iframe 既有）
- Test: `tools/railui-harness-tests/harness-glist.cjs`（「装配」节）

**Interfaces:**
- Consumes: `GLIST` 表（Task 1）；bagtabs 装配点 `ensureMountedFrame`（:3803-3810，glist 判定插其旁）；挂载宿主=Heater `'.heater-system > .panel:not(.heater-panel)'`（:3534 同式）、DyePanel=现行 rail 壳体区（SCENES.DyePanel.host 内 `.sr-gridhost` 位）。
- Produces: `ensureGlist()`（幂等，签名守卫）、`glistTeardown()`（拆 `#srgPanel` 等全部 srg 节点+还原 display）、`glistToggleView()`；DOM 契约：容器 `#srgPanel` 内六段 `#srgHead`(标题+`#srgToggle`) / `#srgSearch` / `#srgChips` / `#srgHint` / `#srgList` / `#srgFoot`；视图记忆键 `localStorage['srp_glist_view_<scene>']`（'list'|'grid'，进页默认 list；我的调用=沿用 §4.9 分场景记忆惯例）；列表态把现行格网视图容器 display:none（元素保留不 detach——fuelgen `#backpackGrid` 同纪律），格子态全部还原。

- [ ] **Step 1: 失败测试**：①两页 `__HZ_GLIST__(k,1)` 后 `#srgPanel` 在场且六段齐全、标题「全局物品栏 · 背包 + 整屋柜子」；②切换钮列表态=田字格 SVG/格子态=`☰`，切到格子=现行视图（Heater bagtabs 四件/DyePanel 壳格网）可见且 `#srgList` 隐藏、再切回；③幂等：连调 ensureGlist 三次 DOM 签名不变；④防自激：mount 落定后 5 帧内 srg 写计数=0；⑤拆净：`__HZ_GLIST__(k,0)` 后左面板 innerHTML==装配前快照、无 srg 节点、格网视图恢复；⑥三开三关循环无残留。
- [ ] **Step 2: FAIL 确认**
- [ ] **Step 3: 实现** ensureGlist/glistTeardown/glistToggleView + `srg-*` CSS（尺寸/文案逐字按 Global Constraints 锚点）；写守卫=渲染串与上次比对同值跳过。
- [ ] **Step 4: PASS + `node --check`；既有回归抽测 harness-heater/harness-dye-pig 不红（格网视图未受扰）**
- [ ] **Step 5: Commit** `feat(cerail): glist 面板装配——两页挂载/单图标互切/拆净还原/防自激`

### Task 3: 行渲染、搜索过滤与页脚

**Files:**
- Modify: `railui.page.js`（`glistRender()`）
- Test: `harness-glist.cjs`（「渲染」节）

**Interfaces:**
- Consumes: `glistAggregate`（Task 1）、`#srgList/#srgFoot`（Task 2）。
- Produces: `glistRender()`——行 DOM 契约：`.srg-row[data-i]` = `.srg-ico`(40×40，fuel 加官方 is-fuel 火苗) + `.srg-main`(`.srg-name`[(染料)9px 主色圆点+名称] / `.srg-src`(前 3 来源`名×n`、超 3 折`等 N 处`、背包金色)) + `.srg-right`(场景徽章 + `.srg-count`=`x总数` 12px)。页脚左=`N 种 · M 件 · 来源 K 处（含背包）`；右=场景隐藏提示（spec §5.3 逐字）或「已截断显示前 300 种」。搜索 input→即时重渲（走同一签名守卫）。空态=「无匹配物品」居中。

- [ ] **Step 1: 失败测试**：①行结构逐段断言（ico/name/src/badge/xN 文本）；②来源折叠>3；③搜索「木」→仅含木字行+页脚数随动；④清空恢复；⑤空结果态；⑥300 截断页脚提示；⑦染色料行色点=主色 hex、暖炉行火苗 class。
- [ ] **Step 2: FAIL** → **Step 3: 实现**（渲染串缓存复用 Task 2 守卫）→ **Step 4: PASS + node --check** → **Step 5: Commit** `feat(cerail): glist 行渲染/搜索/页脚`

### Task 4: 行三键——悬停信息条、左键详情、右键官方口径移 1 件

**Files:**
- Modify: `railui.page.js`（`#srgTip` 跟随 tip、`#srgDetail` 遮罩弹窗、`glistFeed(i)`）
- Modify: `railui.css`（tip/弹窗样式，官方 tooltip 观感）
- Test: `harness-glist.cjs`（「交互」节）

**Interfaces:**
- Consumes: `feed{owner,item}`（既有，RailCommands.cs:542-616，暖炉两跳直达）、`take`（既有 :242-309，柜→包移 1 件）、页面官方右键回放（染料）。
- Produces: `glistFeed(i)`——右键行：暖炉=取行首来源直接 `feed{owner:srcKey,item:itemId}`；染料=srcKey 为 bag→直接回放官方 `ITEM_CLICK {itemId, rightClick:true}`（经页面官方事件发送路径，以 fixtures DyePanel.html:600-603 实测函数名为准），柜源→先 `take{owner,itemId,1}` 并登记待回放队列，**下次 items 推送落地后**对背包中该 cfg 新实例回放（时序防线=Review Focus 3）；toast 回执 `已移 1 件 <ico> <名> → 染料槽/炉膛（取自 <来源>）`。tip/详情内容按 spec §5.4（属性行染料=颜色/主色点数，暖炉=热值/类别可燃物；详情含合计+来源清单；Esc/点空白/× 关闭）。

- [ ] **Step 1: 失败测试**：①悬停行→`#srgTip` 内容含名称/场景属性/全部来源/操作提示、随鼠标移动、离行即隐；②左键→`#srgDetail` 开（属性行+合计+来源行）、Esc/点遮罩/× 三路关；③暖炉右键→CMDQ spy 捕获 `feed` 携正确 owner/item；④染料 bag 源右键→官方回放 spy 命中、无 take；⑤染料柜源右键→take 先发、mock 延迟 2 帧推送后回放才发生且回放 itemId=推送后的背包实例；⑥toast 文案；⑦contextmenu 默认菜单被 preventDefault。
- [ ] **Step 2: FAIL** → **Step 3: 实现**（官方回放函数名先从 fixtures 读出钉死再写）→ **Step 4: PASS + node --check** → **Step 5: Commit** `feat(cerail): glist 行三键——悬停/详情/右键官方口径移1件（染料双跳时序）`

### Task 5: 染料预设——8 色板 chips、主色排序、水滴徽章

**Files:**
- Modify: `railui.page.js`（glist 染料分支：chips 行、水滴徽章、隐藏）
- Test: `harness-glist.cjs`（「染料预设」节）

**Interfaces:**
- Consumes: `ctx.dyePal`（:141-152 读法同染料批）、`glistAggregate` 的 colorId/mainPts/badge。
- Produces: chips=「全部」(默认选) + dyePal 动态全色（色块 11px+色名，**单选**：点色=只看任一色有点数的植物、再点「全部」回全色；命中=任一色点数>0）；排序牌常驻「💧 按色素值 ↓」（键=主色点数）；💧徽章=官方 dropSvg + 主色 hex 填充；无色素物品隐藏+页脚「已按预设隐藏 N 种无色素物品」。

- [ ] **Step 1: 失败测试**：①chips 数=dyePal 项数（8 色 fixture）且色块 hex 对位；②点「红」→仅任一色含红的行、再点「全部」恢复；③排序=主色点数降序（构造反序 fixture）；④徽章 svg fill=主色 hex；⑤无色素进 hiddenCount+页脚提示；⑥dyePal=[] 容错→仅「全部」chip 不报错（Review Focus 5）。
- [ ] **Step 2: FAIL** → **Step 3: 实现** → **Step 4: PASS + node --check + harness-dye-pig 回归绿** → **Step 5: Commit** `feat(cerail): glist 染料预设——8色动态板/主色点数序/官方水滴随主色`

### Task 6: 暖炉预设——固定仅可燃物、热值排序

**Files:**
- Modify: `railui.page.js`（glist 暖炉分支）
- Test: `harness-glist.cjs`（「暖炉预设」节）

**Interfaces:**
- Consumes: `glistAggregate` 的 fuel/badge.v（=burnValue）。
- Produces: chips=「🔥 仅可燃物」lock 态（常驻选中、无 ×、点击无操作）；排序牌「🔥 按热值 ↓」常驻；非燃料隐藏+页脚「非燃料 N 种已按场景预设隐藏」；行 ico 官方火苗角标。

- [ ] **Step 1: 失败测试**：①chip lock：点击后状态不变、无取消路径；②非燃料不出现在列表+页脚计数；③排序=burnValue 降序；④火苗角标 class 在每个 fuel 行 ico；⑤搜索不破坏预设过滤（搜非燃料名→空态）。
- [ ] **Step 2: FAIL** → **Step 3: 实现** → **Step 4: PASS + node --check + harness-heater 回归绿** → **Step 5: Commit** `feat(cerail): glist 暖炉预设——固定仅可燃物/热值序/火苗角标`

### Task 7: C# 接线——cfg 开关、ctx 门、release 归一化

**Files:**
- Modify: `CabinetEverywherePlugin.cs`（静态字段区 :49-89 加 `EnableGlistDye`/`EnableGlistHeater`；Load() :157-197 同款 Bind+中文说明；:199-201 加 SettingChanged ritual）
- Modify: `RailData.cs`（BuildJson ctx :429-579 页条件段加 `glistOn`：DyePanel=EnableGlistDye&&EnableDye、Heater=EnableGlistHeater&&EnableHeater，门语义照 `heaterOn` :486-487）
- Modify: `railui.page.js`（glist 装配门由 `__HZ_GLIST__` 钮改为 `ctx.glistOn||__HZ_GLIST__` 覆盖——钮保留供 harness）
- Modify: `release.ps1`（:51-100 cfg 归一化补两键默认值）
- Test: `harness-glist.cjs`（门节：ctx.glistOn=0 时强制钮仍可开=钮覆盖语义）

**Interfaces:**
- Consumes: 既有 `feed/take` 命令（零新 C# 命令——本批 C# 只有门与推送）。
- Produces: cfg 键 `[Access] EnableGlistDye`/`EnableGlistHeater`（默认 true，说明文案仿 EnableHeater 句式：「染料桶界面竖版全局物品栏（列表/格子可切）」类）；`ctx.glistOn` bool 页条件字段。

- [ ] **Step 1: 失败测试**：mock ctx.glistOn=false+钮 off→`#srgPanel` 不在场；钮 on→在场（覆盖门）。
- [ ] **Step 2: FAIL** → **Step 3: 实现四处改动** → **Step 4: `dotnet build`（csproj 目录）零错 + harness-glist 全节 PASS** → **Step 5: Commit** `feat(cerail): glist C# 接线——EnableGlistDye/Heater 开关+ctx.glistOn+release 归一化`

### Task 8: 全量回归、版本 1.9.0 与文档仪式

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere.csproj:7`、`CabinetEverywherePlugin.cs:43`（→1.9.0）
- Modify: `SurvivalLog.CabinetEverywhere/CHANGELOG.md`（`## v1.9.0` 节：功能述要+harness 计数）
- Modify: 根 `README.md` + `SurvivalLog.CabinetEverywhere/README.md`（功能清单一条+配置表两行）+ `ReleaseREADME.md`
- Modify: `SurvivalLog.CabinetEverywhere/UI-SPEC.md`（§0b 族补 glist 模式小节：装配/门/DOM 契约/两页描述符；**§0-4 修订条文落定**——列表行三键语义照 spec §3 措辞；§7 验收清单补 glist 项）
- Modify: `SurvivalLog.CabinetEverywhere/DESIGN.md`（§9 实现全貌补 glist 段，一段即可）

- [ ] **Step 1: 全量回归**：serve.cjs 常驻→逐个 `node tools/railui-harness-tests/harness-*.cjs`（17 套含新 glist）全绿 + `node --check`。任何一红=修完再走。
- [ ] **Step 2: 版本三处对齐 1.9.0**（csproj/Plugin.cs/CHANGELOG 节）。
- [ ] **Step 3: 文档五处**（两 README 配置表两键+功能条目、ReleaseREADME、UI-SPEC §0b/§0-4/§7、DESIGN §9）。
- [ ] **Step 4: `dotnet build` + `release.ps1` 干跑校验门**（版本一致/CHANGELOG 节/cfg 归一化含新键）。
- [ ] **Step 5: Commit** `feat(cerail): v1.9.0 竖版全局物品栏——染料桶+暖炉先行（交易点待定）`；提交信息尾注 harness 计数（沿仓例）。

---

## 执行说明

- harness 运行前提：`node design-proto/serve.cjs`（8180 端口常驻，独立终端或后台）；套件=Playwright headless Chromium（路径回退见 harness-dye-pig.cjs:5-8）。
- 实机验收（作者）：两页进页=列表态默认、右键送染料槽/炉膛逐项打勾、开关 5s 生效、拆净=原版——UI-SPEC §7 动作矩阵补打勾后交付。
