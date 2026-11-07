# 背包/柜子高度修改（Bag Height Engine）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 24 包高度逐包可调（15 个 [Rail] 配置键，默认 0=原生），宽度恒 12，缩高时越界物品经官方掉落函数掉到物主脚下。

**Architecture:** 扩展现有 `RailUi.SizeEnginePoll`（5s 幂等轮询）写入 `Config_Bag.Size[1]`；缩高前置新组件 `ShrinkDrop`（agentList 全图枚举 + `DropItemManager.SpawnGroundLootItem` + `ItemManager.RemoveItem` 官方函数编排）；ModCenter 面板 15 条经 Meta.cs 注册。

**Tech Stack:** BepInEx 6 IL2CPP / C#（Il2CppInterop）、Playwright harness（node .cjs）、ModCenter 反射桥。

**Spec:** `docs/superpowers/specs/2026-11-07-bag-height-design.md`（名单/键名/掉落策略/验证矩阵的唯一权威，执行者必读）

## Global Constraints（每个任务隐含遵守）

- 红线：mod **不直接**写 Data_Item/存档字段；物品挪动只经官方函数（`SpawnGroundLootItem`/`RemoveItem`，feed 命令 `TryQuickMoveItems` 同口径先例）。
- 宽度恒 12：`Rail.UniformBagWidth` 绑定退役（老 cfg 残留值忽略），代码内常量；24 个高度包全部进宽度目标集（**绕过** ExcludeBagIds 排除，白名单语义同 `SizeIncludeBagIds`）。
- 15 个 cfg 键名与默认值照 spec §4.1 逐字：`BackpackHeight`、`Height_110002/110001/110000/110008/10007`、`Height_1004/115000/115001/115005`、`Height_1021/1022/1023`、`DrawerHeight`、`MaxHeight`（默认 50，0=不封顶）；全部默认 0=原生。
- 抽屉链恒 `H/H+1/H+2`（5010/5012/5013）；背包链 9 包（1/2/5/6/7/8/9/10/11）统一 H。
- 只改容器：天赋数据/天赋表零读写。
- 幂等：会话首见记原生高（还原用）；签名门扩展；表重载（读档/切场景）≤5s 重收敛。
- **立即生效硬验收（作者 2026-11-07 加）**：15 键 SettingChanged → 脏标志 → 下一游戏帧
  主线程重算（**禁止**从 SettingChanged 线程直调 Il2Cpp）；任何实际写 size 后主帧串：
  `Ac_Item_RefreshAllBagViews.SendAction()`（无参官方动作）+ RailData cap 重算 +
  `ForceRepublish()`。开着界面改高（升/缩）当帧~0.5s 更新，无变形/闪烁/延迟。
- 掉落流**先掉后缩**：`ShrinkDrop.Process` 全部成功才写 `size[1]`；任一异常=本轮放弃（签名不记，下轮重试）。
- 本仓无 C# 单测架——C# 任务验证=编译 + 实机清单（Player.log 断言）；JS 行为=harness。
- 文档随行：DESIGN.md/README/CHANGELOG（本批=二十四批）同步更新。
- 提交信息照仓风格：`feat(cerail): 高度修改批——…`（中文，一行说清）。

## Review Focus（spec 未逐条钉死、最可能咬人的五类输入；测试落在 owning task）

1. **改高时相关界面正开着**（升与缩、官方页与 mod 页）→ 当帧~0.5s 内更新，无变形/闪烁/延迟、无崩溃、物品拖拽中不炸（Task 1 实机步⑦ + Task 2 实机步⑤）。
2. **高度键 >0 但该包无在场实例**（如没买 SUV 设 Height_1023）→ 配置级直写照写、零掉落零日志噪音（Task 1 实机步）。
3. **MaxHeight 夹持与 0=不封顶** → 999 被 50 夹；MaxHeight=0 时 999 直写（自担）；抽屉链逐档夹（Task 1 实机步）。
4. **读档/切场景表重载把高度打回原生** → 5s 内重收敛回目标值（Task 2 实机步，宽度引擎同款行为）。
5. **高网格渲染压力**：rows=50（600 格）mod 侧栏/排序弹窗纵向滚动不出屏不卡死（Task 4 harness）。

---

### Task 1: cfg 15 键 + 宽度常量退役 + 高度引擎（升/还原路径）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs`（绑定区 55-129：新增 15 键；删 `UniformBagWidth` Bind 与字段）
- Modify: `SurvivalLog.CabinetEverywhere/RailUi.cs`（SizeEnginePoll 114-202：高度映射/签名/原生缓存；`DrawerBagIds` 旁）
- Modify: `SurvivalLog.CabinetEverywhere/RailData.cs:433`（`uniformWidth` 推送改常量 12）
- Create: 无（引擎内联在 RailUi.cs，与宽度同体）

**Interfaces:**
- Produces（Task 2/3 依赖）:
  - `CabinetEverywherePlugin.BackpackHeight / DrawerHeight / MaxHeight : ConfigEntry<int>`
  - `CabinetEverywherePlugin.HeightByBag : Dictionary<int, ConfigEntry<int>>`（12 个单包键，Load 时填充）
  - `CabinetEverywherePlugin.BackpackBagIds : int[]`（9 包）
  - `RailUi.ResolveTargetHeight(int bagId) -> int`（0=原生/还原；已夹 MaxHeight；抽屉链偏移后）
  - `RailUi.NativeHeightOf(int bagId, int currentH) -> int`（会话首见缓存；还原值）
- Consumes: 既有 `CabinetCatalog.AllContainers`、`BagTable.Cm()/BagDict()`、`DrawerBagIds`。

- [ ] **Step 1: 绑定 15 键 + 退役 UniformBagWidth**

  Plugin.cs 绑定区（`SizeIncludeBagIds` 绑定后、`EnableCraftSource` 前）加 15 个 `Config.Bind("Rail", …)`，描述文案含该包原生尺寸与「0=恢复原生」；`HeightByBag` 字典在 Load 内填充（键=BagId）；`BackpackBagIds` 静态数组。删除 `UniformBagWidth` 字段+Bind（RailUi/RailData 引用点下一步改）。

- [ ] **Step 2: RailUi 高度引擎**

  `SizeEnginePoll` 内：宽度段后接高度段——遍历 `BackpackBagIds ∪ HeightByBag.Keys ∪ DrawerBagIds`，逐包 `ResolveTargetHeight`；目标>0 且 ≠当前 `size[1]` 且 **目标>当前**（升：直接写）或 **目标<当前**（缩：调 `ShrinkDrop.Process`——Task 2 前先留桩 `// Task2: shrink path`，桩期缩高=直接跳过不写并日志，Task 2 接管）；0=还原（写 `NativeHeightOf`）。签名 `_sizeSig` 追加高度映射串。24 包并进宽度目标集（targets 计算处补静态集，绕过 skip）。`w` 改 `const int w = 12;`。**立即生效**：15 键 SettingChanged → `RailUi.SizeDirty=true`（勿直调，线程红线）→ `RailUi.Tick` 首行消费；任何 `changed>0` 后主帧串刷新——`Ac_Item_RefreshAllBagViews.SendAction()` + RailData cap 重算 + `ForceRepublish()`。日志行：`SizeEngine：高度改写 N 包：bagId(name) cur→tgt…`。

- [ ] **Step 3: RailData.cs:433 推送改常量**

  `CabinetEverywherePlugin.UniformBagWidth?.Value ?? 12` → `RailUi.UniformWidth`（`internal const int UniformWidth = 12;` 放 RailUi）。

- [ ] **Step 4: 编译**

  Run: `.\sdk\dotnet\dotnet.exe build SurvivalLog.CabinetEverywhere/SurvivalLog.CabinetEverywhere.csproj -c Release`
  Expected: 0 error 0 warning（新代码）。

- [ ] **Step 5: 实机升/还原/夹持验收**（spec §9.1/9.2/9.6 部分）

  进档后改 cfg（ModCenter 面板/记事本热改）：①`Height_115001=20` → 帧级日志「高度改写 1 包」、冰柜界面 12x20；②`BackpackHeight=24` → 背包 12x24、天赋换包（如可测）尺寸不变；③`DrawerHeight=10` → 抽屉三档 12x10/11/12、工作台升级档位切换正常；④`Height_1022=16`（无车也写）→ 日志直写无掉落无异常；⑤`Height_1004=999` → 落地被 MaxHeight=50 夹（日志明示）；`MaxHeight=0` 后 `Height_1004=60` → 落地 60；⑥键改回 0 → 回原生高（宽度仍 12）；⑦**冰柜界面开着**改 `Height_115001` 20→26 与 26→20（升缩各一）→ 当帧~0.5s 更新、无闪烁无变形无延迟（官方页与 mod 侧栏/排序弹窗各验一处）。`ListOnReady` 顺带核 24 包原生对账 spec §4.1（背包链 12x18 重点）。
  Expected: 每条与日志断言一致；Player.log 无新 WARN。

- [ ] **Step 6: Commit**

  `git add -A && git commit -m "feat(cerail): 高度修改批①——15 键 cfg+宽度常量 12 退役 UniformBagWidth+SizeEngine 高度段（升/还原/MaxHeight 夹持；缩高留桩跳过）"`

### Task 2: 缩高掉落流（ShrinkDrop.cs）

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/ShrinkDrop.cs`
- Modify: `SurvivalLog.CabinetEverywhere/RailUi.cs`（Task 1 桩位接真实现）

**Interfaces:**
- Consumes: `RailUi.ResolveTargetHeight`、`DrawerTabs.FindDrawerOwner()`（owner 发现既有）、`RailData.BagOwner()`（玩家 owner）、`BagTable.Cm()`。
- Produces: `ShrinkDrop.Process(int bagId, int targetH) -> bool`（true=可安全写高；false=本轮放弃）。

- [ ] **Step 1: 实例枚举源实现**

  `EnumerateOwners(int bagId) -> List<(long ownerId, Vector3 pos, int mapId)>`：①agentList 全图 `TryCast<Furniture>`（**去 home 过滤**，spec §8——缩高事件内才扫）按 `Config_Furniture.BagId==bagId` 过滤，位置=`furn` transform；②`TryCast<BagFurniture>`（门口袋/购物袋道具，读其 BagComponent 的 BagConfigId==bagId）；③载具：grep dump `GetTrunkBagId`/`Config_Vehicle` 消费方定位载具 agent 类（实施时第一步取证，写进文件头注释），TryCast 后按 `TrunkBagId==bagId`；④玩家（bagId∈BackpackBagIds 时 `RailData.BagOwner()`，位置=主角）；⑤抽屉（bagId∈DrawerBagIds 时 `DrawerTabs.FindDrawerOwner()`，**无实体位置→用玩家位置**）。全部 try/catch per-源，单源失败=跳过该源并记日志（兜底口径 spec §8）。

- [ ] **Step 2: 越界物品与掉落**

  每 owner 只读 `OwnerCache[ownerId]`（State_Data_Item 取法照 `CabinetCatalog` 镜像补全先例）→ 取 `bagPos.y + itemSize.h > targetH` 的物品 → 逐件 `DropItemManager.SpawnGroundLootItem(pos, 0.5f, configId, count, startTime, timeLeft, mapId)` + `ItemManager.RemoveItem(ownerId, itemId)`。整包处理完返回 true；任一异常=false（RailUi 侧签名不记，下轮重试）。日志：`ShrinkDrop：bagId(name) 实例 N、掉落 M 件`。主线程纪律：由 SizeEnginePoll（RefreshMeta 5s 慢通道，游戏主帧）直调，不另起线程。

- [ ] **Step 3: RailUi 桩位接线**

  缩高分支：`if (!ShrinkDrop.Process(bagId, target)) continue;` 全部成功才写 `size[1]=target`（先掉后缩）。**升/还原不经 ShrinkDrop**。

- [ ] **Step 4: 编译**（同 Task 1 Step 4 命令）

- [ ] **Step 5: 实机掉落矩阵**（spec §9.5 全条 + Review Focus 1/4）

  ①冰箱装满至第 10 行 → `Height_1004=7` → 底部物品掉在冰箱脚下、保鲜时间保留、包内无残留；②掉落后**读档重进** → 地面物仍在（持久化）；③SUV 尾箱放物 → `Height_1023=6` → 掉在车旁；④抽屉放物 → `DrawerHeight=3` → 掉在玩家脚下；⑤缩高时冰柜界面开着 → 无崩溃、界面下次推送行数自愈（Review Focus 1）；⑥高度改写后**读档**（表重载打回原生）→ ≤5s 重收敛回目标高（Review Focus 4）；⑦场景推车（110001 共用）有物缩高 → 枚举到即掉在其脚下，枚举不到 → 日志兜底、开容器整理可找回。
  Expected: 全部成立；Player.log 对应行可见。

- [ ] **Step 6: Commit**

  `git add -A && git commit -m "feat(cerail): 高度修改批②——缩高掉落流 ShrinkDrop（官方 SpawnGroundLootItem+RemoveItem 编排/agentList 全图+BagFurniture+载具枚举/先掉后缩/异常轮重试）"`

### Task 3: ModCenter 面板 15 条

**Files:**
- Modify: `E:\Game\Mod\survivallog-mods\ModCenter\SurvivalLog.ModCenter\Meta.cs:327-333`（CabinetEverywhere 条目「仅启停」→ Groups）

**Interfaces:**
- Consumes: Task 1 的 cfg 键（Section="Rail"，Key=键名）；MetaItem 结构照同文件既有条目（`Section/Key/Label/Badge/Type/Def`）。

- [ ] **Step 1: 注册面板**

  `Groups` 一组「高度修改」，15 个 `MetaItem`（Type="num"，Label=spec §4.1 面板条目名逐字：背包高度/小型置物架/…/高度上限），顺序=spec §4.1 表序。Desc 行同步（「高度修改：24 包逐包可调，0=恢复原生；宽度恒 12」）。

- [ ] **Step 2: 编译 ModCenter**

  Run: ModCenter 仓同款 dotnet build（照其 release.ps1 的 csproj 路径）。
  Expected: 0 error。

- [ ] **Step 3: 实机面板验收**

  装载后 ModCenter 打开本 mod → 15 条按序显示、改 `冰柜=20` 回游戏 ≤5s 生效（反射桥直写 cfg→SettingChanged→轮询）。
  Expected: 全部成立。

- [ ] **Step 4: Commit（ModCenter 仓）**

  `git add SurvivalLog.ModCenter/Meta.cs && git commit -m "feat(modcenter): CabinetEverywhere 高度修改 15 键面板（背包/置物架/工具柜/冰箱/载具/抽屉/上限）"`

### Task 4: harness 纵向回归（harness-height.cjs）

**Files:**
- Create: `tools/railui-harness-tests/harness-height.cjs`（模式照 `harness-width-floor.cjs`：serve.cjs 8180、`__HZ_POST__`/`__HZ_UNIW__` 钩子）

**Interfaces:**
- Consumes: 既有 harness 基建（`railui-root-harness.html`、fixtures、`window.__HZ_POST__(key, bagMsg)`）。

- [ ] **Step 1: 写 harness 五查**

  ①推 `bagRows=18`/`bagItems` 满 18 行 → `st.rows==18`、`.sr-body` scrollHeight>clientHeight（纵向滚动启用）且 `.sr-slot` 数=12×18；②`bagRows=50`（cap=600）→ 同上成立、渲染 <2s、零 console error（Review Focus 5）；③cap 增长（模拟升高）→ 行数即时重算 `ceil(cap/cols)`；④抽屉页签条目 rows 跟随 DrawerHeight 推送值；⑤零 console error / pageerror 收尾。

- [ ] **Step 2: 跑 harness**

  Run: `node tools/railui-harness-tests/harness-height.cjs`（serve.cjs 先行）
  Expected: 全 PASS。

- [ ] **Step 3: Commit**

  `git add tools/railui-harness-tests/harness-height.cjs && git commit -m "test(cerail): 高度修改批 harness——18/50 行纵向滚动/行数重算/600 格渲染压力 五查全绿"`

### Task 5: 文档随行 + 全矩阵收官

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/DESIGN.md`（新增 §12 高度修改批：指向 spec/plan，摘要名单+掉落策略）
- Modify: `SurvivalLog.CabinetEverywhere/README.md`（配置表：15 新键行 + `UniformBagWidth` 退役注记；「与各扩容类 mod 互不冲突」段更新为「取代 BackpackExpand/CabinetSize 尺寸职能，升级前先卸载旧扩容 mod」）
- Modify: `SurvivalLog.CabinetEverywhere/CHANGELOG.md`（二十四批一节）
- Modify: `SurvivalLog.CabinetEverywhere/UI-SPEC.md`（如契约有 `uniformWidth` 语义变化注记——实为值恒 12，无契约变更则只加一行说明）

**Interfaces:** 无代码接口； Consumes spec §4.1/§8/§9 定稿文案。

- [ ] **Step 1: 三文档更新**（内容照 spec，不新开口径）

- [ ] **Step 2: spec §9 验证矩阵全量过一遍并记录**

  7 条逐项打勾（Task 1/2 实机步已覆盖 1/2/3/4/5/6/7 大部，此处补漏项：⑦共存回归——柜宽统一/页签/筛选/排序既有行为零变化，跑 `harness-regression.cjs` + 抽两界面实机）。
  Run: `node tools/railui-harness-tests/harness-regression.cjs`
  Expected: 全 PASS + 实机无回归。

- [ ] **Step 3: Commit**

  `git add -A && git commit -m "docs(cerail): 高度修改批文档随行——DESIGN §12/README 配置表/CHANGELOG 二十四批 + spec §9 矩阵收官记录"`

---

## 执行顺序与依赖

Task 1 → Task 2（桩位接线）→ Task 3/4 可并行 → Task 5 收官。Task 2 Step 1 的载具类取证若失败（dump 查不到 agent 类），走 spec §8 兜底（载具枚举源跳过+日志），不阻塞后续。
