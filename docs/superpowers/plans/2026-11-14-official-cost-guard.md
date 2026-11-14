# 官方成本拦截实施计划（第二轮：关页标记跳过 / 单件移动 O(1) 追平 / 整理改造）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消灭实测四条卡顿中可治的三类官方成本：关页动作标记重算（411-719ms）、单件右键移动的整包追平地板（150-500ms）、整理按钮 ~500ms 巨帧。

**Architecture:** ①Harmony prefix 拦 9 页 Reducer 的 RA_UpdateItemActionMarks，页面未激活即跳过（开页全量重建，零损失）；②搬运窗收尾的整包 SyncBothBags 换成官方拖拽同款 O(1) 动作对（Ac_Item_MoveBag=Data 层 + Ac_BackpackUI_ToOther=视图层）；③mod 整理弃官方 SORT 重放，改窗内静默合并+批末一次追平。

**Tech Stack:** C#/.NET6/BepInEx/Harmony/Il2CppInterop。

**Spec:** docs/superpowers/specs/2026-11-14-official-cost-guard-design.md（取证结论全部在案：RA_UpdateItemActionMarks 反汇编@0x2B05CB0、LogicAdapter.UpdateItemActionMarks 九页扇出@0x2A90550、RA_OpenUI 开页新建状态+InitSide_A/B、RA_Sort@0x2B04F80=排序+RefreshItems×2+一次 NotifyGlobal、Ac_Item_MoveBag→State_Data_Item.RA_MoveBag@151819 O(1)、官方批量残余=找位 N²/2 物理边界不修）

## Global Constraints

- 红线：静默必须配套数据层追平（V1.2 教训）；不 foreach OwnerCache；State/Reducer 只读（发官方动作而非直写状态）。
- 不加配置键；不动官方自身按钮行为；不动第一轮已有 commit。
- 每 Task 一个 commit（独立回退单元）；每步 `dotnet build` 0 错 + 全套件绿才可提交；游戏侧行为实机验收。
- 构建：`DOTNET_MULTILEVEL_LOOKUP=0 /e/Game/Mod/survivallog-mods/sdk/dotnet/dotnet.exe build ... -c Release`。

## Review Focus（实机验收映射）

1. 重开任一界面后物品角标/快捷操作标记正确（R1：关页跳过的安全性）。
2. 整理结果与改前一致（同名同词条合并；顺序语义变化=合并保位不重排，作者已知情）。
3. 右键移动后背包与柜子两侧显示立即正确（R3：O(1) 追平的正确性——错了=V1.2 式不更新，退回整包）。
4. 官方全部存入/取出按钮行为不变（不修，仅确认未误伤）。

---

### Task 1: 关页动作标记跳过（StaleMarksGuard）

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/StaleMarksGuard.cs`
- Modify: `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs`（Load 尾 Install）

**Interfaces:**
- Produces: `StaleMarksGuard.Install()`（无条件挂载；逐页 try/catch，挂不上的页跳过并 warn-once）

- [ ] **Step 1: 写 StaleMarksGuard.cs**

九页表 (ReducerType, UIType)：BackpackUI/RatCage/Brew/Shredder/Compressor/DroneHub/Dye/MaterialRack/TrashCan（dump 实证九页 RA_UpdateItemActionMarks 各 1、WebUI_* 类全在）。Harmony **bool prefix**（Priority.First 不必——无共存 patch）挂 `Reducer_Web_<P>.RA_UpdateItemActionMarks`（private static，AccessTools.Method 按名取）：`ReduxUISystem.IsUIActive(WebUI_<P>)==false → return false`（跳过整个处理器）；活跃 → return true 放行。头注释记录安全论证（RA_OpenUI 开页 new State+InitSide_A/B 全量重建@0x2B036A0 反汇编；LogicAdapter 九页无门扇出@0x2A90550；实测关页帧 411-719ms）。注意 MaterialRack 的 UI 类型名与 Reducer 名按 dump 核对（含取用形态不变——IsUIActive 覆盖）。

- [ ] **Step 2: Plugin.Load 挂载**（MoveNotifyCoalescer/ItemChangeSignal 之后）

- [ ] **Step 3: 构建** `dotnet build ... -c Release` → 0 错 0 警告；全套件跑绿。

- [ ] **Step 4: Commit** `perf：拦九页关期动作标记重算——LogicAdapter 无门扇出(0x2A90550)致页面已关仍全量重算（实测411-719ms巨帧）；RA_UpdateItemActionMarks 页面未激活跳过（开页 RA_OpenUI 新建状态全量重建，零损失）`

### Task 2: 单件右键移动 O(1) 追平（BackpackUI 页）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/MoveNotifyCoalescer.cs`（Exit 收尾路径）

**Interfaces:**
- Consumes: MoveNotifyCoalescer 既有 `_pairs`（from,to 集合）与 Exit() 收尾。
- Produces: `TryIncrementalCatchup()`——BackpackUI 活跃时对每对 (from,to) 发 `Ac_Item_MoveBag.SendAction(from,to)`（Data 层 O(1)@151819）+ `Ac_BackpackUI_ToOther.SendAction(...)`（视图 O(1)，**Step 1 先核 SendAction 签名**）；失败/签名不符 → 返 false 走原 SyncBothBags 整包（红线兜底）。

- [ ] **Step 1: dump 核对** `Ac_BackpackUI_ToOther.SendAction` 参数（Ac 类字段@115191 区段）；不符预期（无公开 SendAction/参数对不上）→ 本 Task 降级为「仅 Data 层 O(1)+视图整包」或整体放弃，记台账。
- [ ] **Step 2: 实现**——Exit() 内：若 `RailData.ActivePage()=="BackpackUI"` 且 TryIncrementalCatchup 成功 → 跳过该对的 SyncBothBags（空对兜底/21015 地面补发逻辑不动）；任一对失败 → 全部退回原整包路径。
- [ ] **Step 3: 构建 + 全套件** → Commit `perf：单件右键移动批末追平改官方拖拽同款 O(1) 动作对（Ac_Item_MoveBag=Data层0x70B + Ac_BackpackUI_ToOther=视图0x40B），替代整包 SyncBothBags（P11 地板 150-500ms 的构成）；失败兜底回整包（V1.2 红线）`

### Task 3: mod 整理改造（弃官方 SORT 重放）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/RailCommands.cs`（OpTidy）

**Interfaces:**
- Consumes: 既有 MoveNotifyCoalescer.ManualEnter/Exit、TryMergeIntoOwner（public@dump）、lastTidyFail 语义。
- Produces: OpTidy 新路径=窗内逐叠 TryMergeIntoOwner 静默合并（合并键=物品名+uses+attrSig）+ 批末一次追平（优先 Task 2 的 O(1) 对、否则 SyncBothBags）+ RefreshActivePage。

- [ ] **Step 1: 实现**——行为变化（作者已知情）：整理=合并同类保位，不再按排序键重排（官方 RA_Sort 的重排随 2×整包重建一起退役）；排序由显示层（mod ⇅ 菜单）承担。空袋/异常保留现有 toast 语义；合并 API 异常 → lastTidyFail。
- [ ] **Step 2: 构建 + 全套件** → Commit `perf：整理按钮弃官方 SORT 重放（RA_Sort=2×整包JSON重建~500ms）——改窗内静默合并+批末一次追平；语义变化：合并保位不重排`

### Task 4: 收尾验证与移交

- [ ] 全套件 + 全量 Rebuild 0 警告；PerfDiag 日志行核对指引（关页帧消失/整理帧/右键帧）交作者实机；PERF_NOTES 待实机后补记（随发版）。
