# 工作台抽屉 12 列换绑 + 壳宽 12 列地板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 工作台抽屉换绑专用 12 列克隆包（染料桶/纸箱/工具台桌零影响、零过渡帧），加壳宽 uniformWidth 地板（漏网窄柜只留白不缩放）。

**Architecture:** 数据层=DrawerWidthEngine（RailUi.cs 新节）：克隆包 99001010 入 Config_Bag 表 + 自制工具台(313/80033/80164) BagId 换绑，三层驱动（每帧门/Harmony 生成入口前缀/5s 清扫）；视图层=syncRailWidth 增 W12 地板（首见 uniformWidth 列自标定，`max(跟随宽, W12)`），cfg 经 rail 契约 ctx.uniformWidth 下发。

**2026-11-06 修订（对账他轮会话 5 提交，含十六批 SizeIncludeBagIds 白名单与十三批八追 BuildJson/分片推送）：** 设计零影响——1010 仍被共包守卫跳过（染料桶保护不变）、换绑前提成立；克隆包 99001010 会进 SizeEngine 的 skip（313 在排除家具名单∩在场）→ SizeEngine 不碰它，宽度由本引擎自持，无冲突。锚点修订：ctx 构建在 **RailData.cs BuildJson**（bagCap Append=RailData.cs:401、契约头注释 RailData.cs:14-16，非 RailJson.cs——RailJson.cs 只是转义工具库）；railui.page.js 锚点漂移 NATIVE_BP_CSS≈L2876/ensureNativeBp≈L2885/setData bagCap 行≈L3489；SizeEnginePoll 尾部≈L180（政策注释已到④）。

**Tech Stack:** C#/net6.0 + BepInEx 6 IL2CPP interop + HarmonyLib（0Harmony.dll 已引用）；注入 JS（railui.page.js，ES5 风格）；测试=Playwright harness（.cjs，serve.cjs@8180）。

**Spec:** `docs/superpowers/specs/2026-11-05-drawer-12col-rebind-design.md`（契约 C1-C9 与反目标以此为准，实现时随行阅读）

## Global Constraints

- 反目标（一票否决）：任何 6↔12 过渡帧；视图层伪列；碰 Config_Bag 1010 的任何字段；写存档/游戏文件
- 克隆包 `Size` 必须新建 `Il2CppSystem.Collections.Generic.List<int>` 实例（抄 1010 的 List 引用=改克隆即改 1010）
- Harmony：按类型+方法名解析（`AccessTools`），**不写 RVA**；前缀体首行 `RailUi.Enabled` 门 + 幂等早退；Load 阶段 `General.Enabled=false` 则不装（RefreshCoalescer 同款惯例）
- 换绑/地板宽度统一读 `CabinetEverywherePlugin.UniformBagWidth.Value`；`=0` 时换绑与地板**整体停用**（换绑已写值不回滚；JS 地板回纯跟随）
- 总门：`[Rail] Enable=false` 全停（三条驱动全部过 `RailUi.Enabled` 首检）
- C# 侧无单测工程（套件现状）：C# 任务验证=`dotnet build` 零错 + 日志断点预留（格式见各任务）；JS 任务=harness TDD
- 版本号不自行 bump（作者裁定）；提交信息用仓库风格（`feat(cerail): ...`，中文摘要）

## Review Focus

1. **off 模式地板泄漏**：`uniformWidth=0` 时若地板仍生效，10 个机器页全部变成 12 列空壳——harness 必须推 `ctx.uniformWidth=0` 断言回纯跟随（Task 4 Step 1 场景④）
2. **cfg 改值地板滞留**：12→14 后地板仍钉 12（标定值未随契约失效）——harness 推 14 断言地板重标定（Task 4 场景③）
3. **地板下窄柜被裁**：跟随宽 < 地板时末列右缘越界（居中失效/滚动条啃列）——harness 断言格右缘 ≤ 壳可视右缘（Task 4 场景②）
4. **跨页标定串味**：st.w12Floor 带着上一页的值进新页（页面 slot 尺寸不同）——场景切换必须清标定（Task 4 场景⑤；实现挂 applyScene）
5. **Rail 关会话换绑泄漏**：`[Rail] Enable=false` 时抽屉仍被换 12 而柜子原生宽（Q1 复现）——C# 侧 `RailUi.Enabled` 门 + 实机清单第 9 条（Task 2 Step 3 验证日志门存在）

---

### Task 1: DrawerWidthEngine 核心（克隆包 + 配置换绑 + 黑名单）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailUi.cs`（SizeEnginePoll 之后新增 DrawerWidthEngine 节，尾部现 ~L180）
- Modify: `ModShared/BagTableRw.cs:38`（DefaultResizeExcludeIds 数组追加 id）
- Test: 无独立测试文件（C# 套件无单测）——验证=`dotnet build`

**Interfaces:**
- Consumes: `BagTable.Cm()/BagDict()/FurnDict()/InvalidateBagSizeIndex()`（ModShared 既有）、`RailUi.Enabled`、`CabinetEverywherePlugin.UniformBagWidth/Log`、`WarnOnce(string,string)`（RailUi 既有私有静态，同文件可直接用）
- Produces:
  - `internal const int CloneBagId = 99001010;`
  - `internal static readonly int[] WorkbenchFurnitureIds = { 313, 80033, 80164 };`
  - `internal static bool DrawerSwapDone`（Task 2 帧门消费；cfg 变更时置 false）
  - `internal static void EnsureDrawerBag()`（幂等；Task 2 前缀/帧门/清扫共用）

- [ ] **Step 1: 黑名单追加**

`ModShared/BagTableRw.cs` 的 `DefaultResizeExcludeIds` 数组末尾追加 `99001010`，行尾注释风格照旧（`// 抽屉12列克隆包（CabinetEverywhere 换绑专用，防兄弟扩容 mod 改宽打架）`），并把首段 doc 注释补一句该 id 语义。

- [ ] **Step 2: 实现 EnsureDrawerBag()**

RailUi.cs 新节（挂 SizeEnginePoll 尾部之后，现 ~L180；注释块风格照抄 SizeEngine 节：政策/幂等/取证引用）。逻辑按 spec §5.1：
1. 首检：`!Enabled`（=RailUi.Enabled）或 `UniformBagWidth.Value <= 0` → return
2. 取 cm/furns/bags，任一 null/空 → return（下轮再试）
3. 早退门：`furns[WorkbenchFurnitureIds[0]].BagId == CloneBagId` **且** bags 含 CloneBagId **且** `bags[CloneBagId].Size[0] == w` → `DrawerSwapDone = true` 后 return
4. 碰撞检查：bags 含 CloneBagId 但 `Size` 非 `[w,6]` 且非本会话所建（用私有 `_cloneCreated` 标志区分）→ `WarnOnce("drawerbag-collision", ...)` 并永久跳过（私有 `_disabled=true`，后续调用首检即退）
5. 克隆包入表：`new GameCore.HotUpdate.Config_Bag()`，抄 1010 的 Name/Name_Local/Burden/UseOwnerName；`Size = new Il2CppSystem.Collections.Generic.List<int>(); Size.Add(w); Size.Add(6);`（**新 List**）；`bags[CloneBagId] = clone`；`_cloneCreated=true`；`BagTable.InvalidateBagSizeIndex(cm, new List<string>())`
6. 换绑：foreach WorkbenchFurnitureIds → `furns[id].BagId = CloneBagId`（TryGetValue 取 cfg，取不到跳过该 id 不崩）
7. 成功路径日志一行（照 SizeEngine 风格）：`[CERail] DrawerWidth：工作台抽屉换绑 {w} 列克隆包 {CloneBagId}（313/80033/80164→CloneBagId，1010 不动）`；置 `DrawerSwapDone = true`

- [ ] **Step 3: 构建验证**

Run: `dotnet build "E:\Game\Mod\survivallog-mods\CabinetEverywhere\SurvivalLog.CabinetEverywhere\SurvivalLog.CabinetEverywhere.csproj" -v q`
Expected: Build 零 error（warning 维持基线）

- [ ] **Step 4: Commit**

```bash
git add SurvivalLog.CabinetEverywhere/RailUi.cs ModShared/BagTableRw.cs
git commit -m "feat(cerail): 抽屉换绑核心——克隆包 99001010 入表+自制工具台 BagId 换绑（1010 零触碰）+黑名单防打架"
```

### Task 2: 三层驱动（Harmony 前缀 + 每帧门 + 5s 清扫）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailUi.cs`（Task 1 节内追加 Install/前缀/帧门/清扫）
- Modify: `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs`（Load 尾部 + AccessTicker.Update + UniformBagWidth.SettingChanged）
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs:235`（SizeEnginePoll() 调用后追加一行）
- Test: 无独立测试文件——验证=`dotnet build` + 日志门自查

**Interfaces:**
- Consumes: Task 1 的 `EnsureDrawerBag()/DrawerSwapDone/WorkbenchFurnitureIds/CloneBagId`
- Produces:
  - `internal static void InstallDrawerWidth()`（plugin Load 调；Harmony 前缀安装，General.Enabled=false 不装）
  - `internal static void DrawerFramePoll()`（AccessTicker.Update 每帧调；未完成标志期查配置表就绪）
  - `internal static void DrawerSweep()`（RefreshMeta 尾部调；在场实例 SetBagConfigId+BagCache 重指）
  - `internal static void InvalidateDrawerSwap()`（SettingChanged 调；置 DrawerSwapDone=false）

- [ ] **Step 1: Harmony 安装与前缀**

`InstallDrawerWidth()` 照 RefreshCoalescer.Install 逐样：`AccessTools.Method` 改为反射枚举——`typeof(GameCore.HotUpdate.Battle.Logic.Furniture).GetMethods()` 过滤 `Name == "Initialize"`（当前三条：public 六参 + 两条 protected，全部前缀补丁；签名不硬编码），`new Harmony("com.local.survivallog.cabineteverywhere.drawerwidth")`，prefix=`DrawerInitializePrefix`。前缀体：无参，首行 `Enabled` 判定（Rail 总门，照 SendPrefix 的 General 门写法），次行 `DrawerSwapDone` 早退，否则 try/catch 调 `EnsureDrawerBag()`，**恒返回 true**（只前置不改参不吞调用）。安装失败 LogWarning 不抛（照旧）。

- [ ] **Step 2: 帧门 + 清扫 + cfg 复位**

- `DrawerFramePoll()`：`if (DrawerSwapDone || !Enabled) return;` → try 调 `EnsureDrawerBag()`（内部自带表就绪判定，未就绪静默下轮）。稳态零开销=一次 bool 读。
- `DrawerSweep()`：首检同上；扫 `BattleLogicWorld.Instance._AgentManager.agentList`→TryCast Furniture→`AgentConfigId ∈ WorkbenchFurnitureIds`（扫描骨架照 CabinetCatalog.RefreshHomeInstances L161-168 的廉价门槛顺序，但**不做地图判定**——场景侧也扫）；对命中实例经 `furn.agentComponentDictionary[Il2CppType.From(typeof(BagComponent))].TryCast<BagComponent>()` 调 `SetBagConfigId(CloneBagId)`（try/catch 单实例失败不终止）；再取 Redux `State_Data_Item.BagCache`（取法照 CabinetCatalog 镜像修复 L274-281），`bagCache[ownerId] = CloneBagId`（已等于则零写）。全 try/catch + WarnOnce。
- `InvalidateDrawerSwap()`：`DrawerSwapDone = false;`（EnsureDrawerBag 的宽度早退门保证 12→14 重同步）。
- plugin 接线三处：Load 尾部（`RefreshCoalescer.Install();` 之后）加 `RailUi.InstallDrawerWidth();`（无条件调——内部自带 General 门与幂等 `_installed`）；`UniformBagWidth` 的 `SettingChanged +=`（绑定价 L90 附近，照 Enabled.SettingChanged L78 写法）加 `(_, _) => { RailUi.InvalidateDrawerSwap(); }`；AccessTicker.Update 的 `TabInjector.FastPoll();` 之后（L228 附近）加 `RailUi.DrawerFramePoll();`；RailData.cs L235 `RailUi.SizeEnginePoll();` 后加 `RailUi.DrawerSweep();`。

- [ ] **Step 3: 构建验证 + 门自查**

Run: `dotnet build ...（同 Task 1 Step 3）` → 零 error。
自查（读代码逐条打勾，写入提交信息）：①前缀恒 return true；②前缀体 Rail 门在 DrawerSwapDone 之前；③Sweep 无地图过滤；④SettingChanged 复位链闭合（cfg→Invalidate→帧门重开→宽度早退门重同步）。

- [ ] **Step 4: Commit**

```bash
git add SurvivalLog.CabinetEverywhere/RailUi.cs SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs SurvivalLog.CabinetEverywhere/RailData.cs
git commit -m "feat(cerail): 抽屉换绑三层驱动——生成入口Harmony前缀(零闪烁硬保证)+每帧门+5s在场清扫+cfg改值复位"
```

### Task 3: 契约下发 ctx.uniformWidth（C# 推送 + JS 接收）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs:401`（bagCap Append 后追加）与 `:14-16`（契约头注释 ctx 字段清单；BuildJson 住 RailData.cs，勿找 RailJson.cs）
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（setData 内，~L3489 bagCap 读取之后）
- Test: `node --check` + 既有 harness 冒烟

**Interfaces:**
- Consumes: `CabinetEverywherePlugin.UniformBagWidth`（C# 侧）；JS 侧 `store.ctx`
- Produces: JS 全局 `var UNI_W = 12;`（模块级，初始 12；`setData` 里 `if (typeof (store.ctx||{}).uniformWidth === 'number') UNI_W = store.ctx.uniformWidth;`——**0 也落地**（地板停用信号），缺省不动）+ `st.w12Floor`（Task 4 消费，number，0=未标定）+ `st.w12Src`（上次标定用的 UNI_W，供 Task 4 判失效）

- [ ] **Step 1: JS 侧先接线（读取先行，缺省不回退——bagCap 先例）**

railui.page.js：模块级声明区加 `var UNI_W = 12;`；setData 的 bagCap 行后加上述读取；`st` 初始形状（~L560 `st.cols` 附近）加 `w12Floor: 0, w12Src: 0,`；UNI_W 值变化时（新≠旧）重置 `st.w12Floor = 0`（标定随 cfg 失效——Review Focus 2 的 JS 半边）。

- [ ] **Step 2: C# 推送**

RailData.cs L401 `bagCap` Append 行后：`sb.Append(",\"uniformWidth\":").Append(Math.Max(0, CabinetEverywherePlugin.UniformBagWidth?.Value ?? 12));`；契约头注释（RailData.cs:16）ctx 字段清单补 `uniformWidth`。

- [ ] **Step 3: 验证**

Run: `node --check "E:\Game\Mod\survivallog-mods\CabinetEverywhere\SurvivalLog.CabinetEverywhere\railui.page.js"` → 无输出（语法过）。
Run: `cd E:\Game\Mod\survivallog-mods\CabinetEverywhere\design-proto && node serve.cjs`（后台）→ `node ../tools/railui-harness-tests/harness-switch-cabinet.cjs` → 维持既有 PASS 面（该套件不涉宽度）。
Run: `dotnet build ...` → 零 error。

- [ ] **Step 4: Commit**

```bash
git add SurvivalLog.CabinetEverywhere/RailData.cs SurvivalLog.CabinetEverywhere/railui.page.js
git commit -m "feat(cerail): 契约 v4 增补 ctx.uniformWidth——C# 直推+JS 读取先行（bagCap 同款；地板停用信号随值下发）"
```

### Task 4: 壳宽 W12 地板 + native 页 min-width（harness TDD）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（syncRailWidth ~L1675-1715；NATIVE_BP_CSS ~L2849 + ensureNativeBp ~L2858；applyScene 内）
- Create: `tools/railui-harness-tests/harness-width-floor.cjs`
- Test: 即 harness-width-floor.cjs（Playwright，骨架照 harness-regression.cjs 头部：serve@8180、railui-root-harness.html、frameOf/waitRail/check 辅助）

**Interfaces:**
- Consumes: Task 3 的 `UNI_W/st.w12Floor/st.w12Src`；既有 `dispModel(DISP).cols`（机器页当前容器列数）；`el.rail/el.srGridHost`；`.sr-body`
- Produces: 无对外新接口（纯内部行为；harness 以 DOM 断言消费）

- [ ] **Step 1: 写失败测试 harness-width-floor.cjs**

五场景（断言值钉死，mock 推送手法照 harness-regression 的 `__HZ_MOCKSET__/__HZ_PUSH__/__HZ_POST__` 既有用法，ToolTable fixture 的 BagMsg 走 `__HZ_POST__('ToolTable', {type:'WebUI_ToolTable_BagMsg', data:{...}})` 换 bagCols/bagItems）：
① 标定：推 ctx.uniformWidth=12 契约 + BagMsg bagCols=12 → waitRail → 记 `W = rail.offsetWidth`
② 窄柜不缩（Review Focus 3）：BagMsg bagCols=6（带 2 件物品）→ 等 400ms → 断言 `rail.offsetWidth === W` 且格区居中：`gridRight - gridLeft >= 0` 且 `lastCellRight ≤ bodyRight - 1`（量 .sr-gridhost 内官方格与末个 .slot/.item 的 rect，照 v146 风格）且左右留白 `gridLeft - hostLeft` 与 `hostRight - gridRight` 差 ≤2px（对称）
③ 改值重标定（Review Focus 2）：推 ctx.uniformWidth=14 契约 → BagMsg bagCols=14 → 断言新壳宽 `W14 > W`；再 bagCols=6 → 壳宽保持 W14
④ off 回纯跟随（Review Focus 1）：推 ctx.uniformWidth=0 → BagMsg bagCols=6 → 断言 `rail.offsetWidth < W`（跟随窄格，地板已撤）；bagCols=12 → 恢复 W
⑤ 跨页不串味（Review Focus 4）：ToolTable 完成②后切 Cooking（`__HZ_SHOW__('Cooking')`）→ 在 Cooking 上复跑「推 bagCols=6 → 壳窄（跟随，未标定）→ 推 bagCols=12 → 记 Wc=壳宽 → 再推 6 → 壳保持 Wc」——即①②逻辑在本页复跑成立（Wc 自标定生效=旧页 W 未带入的直接证据）
尾部：零 console error/pageerror 汇总断言（照 harness-regression L24-25 口径）。

- [ ] **Step 2: 跑测确认失败**

Run: `node tools/railui-harness-tests/harness-width-floor.cjs`（serve.cjs 在跑）
Expected: ①过（现状即贴 12 列），②③④⑤ FAIL（现状纯跟随：②壳变窄、③无重标定、④⑤无所谓地板——②③④ 必红）

- [ ] **Step 3: 实现**

- syncRailWidth（在算出 `rw2` 之后、写入之前插入）：
  `var colsNow = 0; try { var m = dispModel(DISP); colsNow = m ? (m.cols | 0) : 0; } catch (e) { }`
  `if (UNI_W > 0) { if (colsNow === UNI_W) { st.w12Floor = rw2; st.w12Src = UNI_W; } var fl = st.w12Floor | 0; if (fl > 0 && rw2 < fl) rw2 = fl; }`
  （标定值=套地板**前**的跟随宽——先存后 max；地板=纯下限；`UNI_W=0` 整段跳过=停用；rw2 已 ≥ 地板时零写入幂等门自然吸收）
- applyScene 内（场景切换点）加 `st.w12Floor = 0; st.w12Src = 0;`（Review Focus 4）
- ensureNativeBp：style 文本按 UNI_W 动态拼——`UNI_W > 0` 时 NATIVE_BP_CSS 追加 `.grid-container{min-width:{UNI_W*56+18}px}`（690px 基准）；UNI_W 变化时（比较 style.dataset.uw）重写 style.textContent；`=0` 不含该行
- syncRailWidth 注释块补「v1.8.x W12 地板」段（动机=漏网窄柜只留白不缩放；标定/失效/停用三态），照文件内注释密度

- [ ] **Step 4: 跑测通过 + 回归**

Run: `node tools/railui-harness-tests/harness-width-floor.cjs`
Expected: 五场景全 PASS + 零控制台错
Run: `node tools/railui-harness-tests/harness-regression.cjs && node tools/railui-harness-tests/harness-mount.cjs`
Expected: 维持既有 PASS 面（mount 的 13 个 size FAIL 为既知容差，不得新增）

- [ ] **Step 5: Commit**

```bash
git add SurvivalLog.CabinetEverywhere/railui.page.js tools/railui-harness-tests/harness-width-floor.cjs
git commit -m "feat(cerail): 壳宽 W12 地板——首见 uniformWidth 列自标定+max下限+场景切换失效+off停用；native页min-width同款（窄柜留白不缩放）"
```

### Task 5: 文档四件套

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/DESIGN.md`（SizeEngine 节后新增「抽屉换绑」节 + 壳宽地板小节）
- Modify: `SurvivalLog.CabinetEverywhere/CHANGELOG.md`（待发版条目置顶）
- Modify: `README.md` + `SurvivalLog.CabinetEverywhere/README.md`（cfg 表 `UniformBagWidth` 行补「含工作台抽屉与壳宽地板」）
- Modify: `SurvivalLog.CabinetEverywhere/UI-SPEC.md`（「壳宽跟官方格」相关行按地板语义更新）

**Interfaces:** 无代码接口；内容以 spec §3 C1-C9 取证表与 §5 设计为源，不复述实现细节

- [ ] **Step 1: 四文件落笔**（DESIGN 节含机制图：三层驱动时序、地板三态；CHANGELOG 按「待发版·N 批」格式，版本号留待作者；UI-SPEC 检索关键词「壳宽」逐行核对）

- [ ] **Step 2: 验证**：`grep -rn "壳宽" UI-SPEC.md` 输出行全部与新语义一致；README 两份同步

- [ ] **Step 3: Commit**

```bash
git add SurvivalLog.CabinetEverywhere/DESIGN.md SurvivalLog.CabinetEverywhere/CHANGELOG.md README.md SurvivalLog.CabinetEverywhere/README.md SurvivalLog.CabinetEverywhere/UI-SPEC.md
git commit -m "docs(cerail): 抽屉换绑+壳宽地板——DESIGN/CHANGELOG/README/UI-SPEC 四件套（取证C1-C9随行）"
```

### Task 6: 构建 + 部署 + 实机验收交接

**Files:**
- Modify: 无源码（产物部署：`SurvivalLog.CabinetEverywhere/bin/Debug/net6.0/SurvivalLog.CabinetEverywhere.dll` → 游戏插件目录，旧版 .bak 备份照 v1.8.4 部署惯例）

- [ ] **Step 1: Release 构建**

Run: `dotnet build ...csproj -c Release -v q` → 零 error；核对产物 dll 时间戳

- [ ] **Step 2: 部署**

备份 `E:\SteamLibrary\steamapps\common\Survival Log\BepInEx\plugins\SurvivalLog.CabinetEverywhere.dll` → `.bak`；复制新 dll 过去。（作者机器本地路径，套件既有惯例）

- [ ] **Step 3: 实机验收（作者执行）**

按 spec §7 十一条清单跑（重点 1/8/9：首帧零闪烁、cfg 改值联动、Rail 关会话零换绑），BepInEx LogOutput.log 核对两行：`DrawerWidth：工作台抽屉换绑 12 列克隆包...` 与 SizeEngine 行为不变。结果记回 spec §7 勾选。

- [ ] **Step 4: Commit（验收记录）**

```bash
git add docs/superpowers/specs/2026-11-05-drawer-12col-rebind-design.md
git commit -m "docs(cerail): 抽屉换绑+壳宽地板——实机验收清单回填（spec §7）"
```
