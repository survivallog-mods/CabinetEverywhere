# 官方成本拦截设计（动作标记关页跳过 / 整理 O(1) 化 / 单件移动地板压降）

日期：2026-11-14　状态：待作者批准（范围已口头定：1/2/3 做，4 页面常驻不做）　
分支：续用 `perf/rail-page-scope`（第二轮独立 commit，与第一轮可分别回退）

## 意图与为什么

第一轮（数据链瘦身）后实测：mod 自身开销已从卡顿榜清零（拼包+推送全程 <150ms 告警零条），
但用户四条卡顿仍在。取证定责（实测日志 + 反汇编 + PERF_NOTES 拆账终审）：

1. **关页动作标记重算**：`LogicAdapter.UpdateItemActionMarks` 不看页面开关，一次给 9 个界面
   （BackpackUI/RatCage/Brew/Shredder/Compressor/DroneHub/Dye/MaterialRack/TrashCan）全发；
   实测页面已关时 `RA_UpdateItemActionMarks` 仍跑 411~719ms（本会话 1225/2142ms 巨帧）。
   **烹饪/工作台/交易/发电机/暖炉不在这 9 页名单里——「烹饪不卡、背包页卡」的结构性答案。**
2. **整理按钮 ~470-503ms**：`RA_Sort`（0x2B04F80 反汇编）= 内存排序 + RefreshItems_A/B（内部
   →BuildBagJson 整包 JSON 重建×2，扩容背包 600 格×每件 40+ 重调用）+ 一次 NotifyGlobal。
   mod 的整理按钮目前重放官方 SORT 事件 → 同样吃这个成本。
3. **单件右键移动/单件丢弃/拾取 150-500ms 地板**：P11 已析——官方每次状态变更至少一次
   整包 DTO+推送（协议固有）；主犯链=每件 3002/3005→LogicAdapter→UpdateBag→BuildBagJson
   整包重建（占 65-80%，拆账终审）。官方拖拽路走 O(1) 增量通道（RA_ToOther 0x40 字节/
   RA_MoveBag 0x70 字节），右键快移路走重路。
4. 批量官方按钮（全部存入 1.4s）= 官方找位 N²/2 残余，你们已定责「官方方法体不可拆=物理
   边界」；mod 已有分帧版（一键入库任务）。

## 目标

1. 页面未激活时的动作标记重算直接跳过（纯赢，零行为损失）。
2. mod 整理按钮脱离官方 SORT 重放，成本从 ~500ms 巨帧降到逐件 O(1)+一次轻收尾。
3. 单件右键移动/单件丢弃/拾取：批末追平从「整包 3031」换成官方拖拽同款 O(1) 通道。

## 非目标 / 反目标

- 页面常驻（拦 RemovePage）——作者明确否决（本轮不做）。
- 官方自己的按钮（官方整理钮/全部存入钮）不改——官方方法体不可拆（既定定责）；
  mod 界面上已有替代入口（mod 排序/一键入库）。
- 不动通知语义红线：静默必须配套数据层追平（V1.2 教训）；3002/3005/3031/3027/21015
  拦截面维持既有 MoveNotifyCoalescer 架构。
- 不加配置键。

## 方案

### A. 关页动作标记跳过（Fix 1）
新建 `StaleMarksGuard.cs`：Harmony void→bool prefix 挂 9 个 Reducer 的
`RA_UpdateItemActionMarks`（private static，dump 逐页核对签名），页面未激活
（ReduxUISystem.IsUIActive(对应 WebUI 类型) 为 false）→ return false 跳过整个处理器。
安全性论证（反汇编实证）：`RA_OpenUI` 开页时 `new State_Web_BackpackUI` + InitSide_A/B +
BuildATabs 全量重建——关页期间算的标记在重开时全部作废重算，跳过零损失。其余 8 页同理
（每页开页动作建新状态；Task 0 逐页核对，核对不过的页不挂）。
成本：每次事件 1 次 IsUIActive（事件频率级，非每帧）。

### B. mod 整理 O(1) 化（Fix 2）
OpTidy 弃「重放官方 SORT 事件」：改为窗内（ManualEnter/Exit 复用）逐叠执行
**官方拖拽同款搬移 API**（Task 0 取证确认：ItemManager 的 O(1) 请求路——OnMoveItem 请求族
或 Ac_Item_MoveBag→3017 的官方发起 API；拿不到公开入口则退备选=静默 ItemManager 合并+
批末一次 SyncBothBags，成本=合并数据操作+一次整包，仍远低于 2×整包重建）。
排序键=既有 RailSortMath；合并键=物品名+uses+attrSig（JS glist 同口径）。
批末：RefreshActivePage + 官方一次轻追平；失败路径保留 lastTidyFail toast 语义。

### C. 单件操作地板压降（Fix 3）
右键快移/单件丢弃/单件拾取的批末追平，从整包 3031（SyncBothBags）/PushGroundDock 换成：
- 跨容器单件移动：官方 O(1) 通道一次（3017 族动作——Task 0 确认发送 API）；
- 拾取/丢弃：地面侧 PushGroundDock 保持（V1.2 定案，地面无 O(1) 通道），背包侧换 O(1)。
约束：Data 层 DTO 需求必须被满足（V1.2 回归红线）——若 O(1) 通道不带 Data 增量，
则维持整包追平不动该路径（宁可不赚，不可回退显示正确性）。

### D. Task 0 前置取证（动手前逐条落定）
1. ItemManager 公开搬移 API 与 3017 请求路的可用性（dump+反汇编：OnMoveItem 的调用方/
   事件号；Ac_Item_MoveBag 的 SendAction 参数）。
2. 9 页 RA_UpdateItemActionMarks 逐页签名 + 对应 WebUI 类型存在性 + 开页重建证据
   （每页 Open 动作 new State 或 Init 全量）。
3. RA_ToOther/RA_MoveBag 反汇编存档（0x40/0x70 字节复核 + 是否带 Data 层更新）。
任一条与预期不符 → 该 Fix 降级或放弃，记录进实施计划，不带猜动工。

## 风险登记

- R1 关页跳过：若某页存在「不开 OpenUI 的重开路径」（状态复用），跳过会导致该页标记过期
  ——Task 0 逐页核开页重建；实测项=重开每页后角标/快捷操作标记正确。
- R2 整理改自实现：合并/排序语义与官方有差异（官方两路=排序+合并）——保留
  lastTidyFail 降级 toast；实测项=整理结果与改前一致（同名合并、顺序）。
- R3 O(1) 通道不带 Data 增量→显示不更新（V1.2 复发）——红线约束：不满足即放弃该子项。
- R4 拦截面与既有 MoveNotifyCoalescer 叠加的嵌套/重入——复用其引用计数窗。

## 验证

每 Fix 独立 commit + build + railscope/railjson 等全套件；实机清单（作者过）：
关页期无 RA_UpdateItemActionMarks 巨帧（PerfDiag 卡顿帧行）；整理 ~500ms→感知级；
单件右键移动/丢弃/拾取手感；重开各页角标正确；整理结果与改前一致；
官方按钮（全部存入）行为不变（不修，仅确认未被误伤）。
