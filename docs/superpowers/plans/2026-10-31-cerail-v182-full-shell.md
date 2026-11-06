# CERail v1.8.2 收口计划——全场景壳架构（壳+官方 DOM 原件）+ rackOpen 原生跨柜

> 2026-10-31。作者总复盘裁决后的修复计划（裁决记录：`design-intent-actions-mandate`）：
> **重构储物系统 = 改布局/导航；物品格 = 官方 DOM 原件；官方动作（存/取/拖拽/使用/丢弃）保真是硬约束。**
> 设计/原型/实现三线一致；实机验收全绿才交付，不以床测替代。

## 0. 授权与基线

- 基线 = 分支 `cerail-storage-rail` HEAD（00481f3）+ worktree 未提交的 v1.8.2 方案A
  （机器页 10 页 + BackpackUI/Trade = 壳占面板原位 + 官方格 reparent，已就位）。
- 本轮授权范围：**装配方式统一（整理柜改官方 DOM）+ bug 修复 + spec/原型/文档对齐**。
  本轮明确**推翻** v11/v12 定稿中「整理柜左背包自研面板/自绘柜格/复刻按钮」三要素——
  依据 2026-10-31 作者总裁决（动作保真 > 自绘定版）；「官方原版背包禁绝」条款同步修订为
  「禁整页原版 chrome；物品格一律官方原件」。UI-SPEC 演进记录留痕。

## 1. 取证结论（实现依据，全部已核实）

1. **官方 MaterialRack.html**（suite/tools/webui_src，build 26157732）：
   - 结构：`#rackSystem` > 左`.bag-panel`(`#panelA`含负重+`#gridWrap`(`#bagGrid`+`#previewLayer`)) |
     中`.transfer-controls`(`#btnPutAll`/`#btnTakeAll` 官方原件) | 右`.bag-panel.is-storage`
     (header`#rackTitle`+`#rswBox`机器人开关 / `#panelB`(`#rackStat`+`#rackBody`+`#warnBox`+foot)) |
     `#flyLayer`。
   - 官方动作全在：bag 格=webui-bag（拖拽出格/详情/高亮键批转）；rack 侧=`createRackRows`
     汇总行（**左键拖动搬运 / 右键取1 / 单击详情 / 锁定行 / 取出最多 / 落点预览**）；
     两按钮=PUT_ALL/TAKE_ALL。
   - 拖拽落点=**坐标判定** `$('panelB').getBoundingClientRect()`（@492-526）→ reparent 后
     id 仍在文档即成立；`groundDockObstacles()` 用 `#rackSystem .panel` 作用域选择器（@572）
     → 壳内保留 `id=rackSystem` 作用域容器可使其继续工作。
2. **rack 族无页面级切柜事件**（页面事件全集：ITEM_CLICK/TAKE_ONE/TOGGLE_LOCK/TAKE_MAX/
   GROUND_PICK_TO/PUT_ITEM/PUT_ALL/TAKE_ALL/SET_ROBOT_PUT/CLOSE）；
   **State_Web_MaterialRack 无 switch 动作，但有 `RA_Open(Ac_MaterialRack_Open{OwnerId,
   TargetId, FurnitureConfigId})` 整 state 重绑**（dump.cs @192096）。
   `Ac_MaterialRack_Open.SendAction(long,long,int)` public static 实存——套件先例：
   PreDisasterSpeed `Ac_CoreUI1_SpeedChange.SendAction`、ToolTablePruner
   `Ac_ToolTable_RefreshBag.SendAction()`（同一通道，非伪造）。
   ContainerInst.OwnerId == Furniture.InstanceId（CabinetCatalog 注释实锤）→ TargetId
   口径（==OwnerId?==CurrentFurnitureId?）为**实机校准点 C1**。
3. **实机验收通道**：ViewportProbe（已装，cfg `[DevTools] Enabled=true`）→ 游戏 UI WebView
   远程调试 localhost:9222 → Playwright `connectOverCDP`（suite/docs/06 实证；本日晨
   v181-*.json 探针即此路）。
4. 机器页/BackpackUI/Trade 现行装配（v1.8.2 未提交）：壳宽 `max-content;min-width:428;
   max-width:640`；`SCENES.grid` 逐页指向官方格容器；mount 替换宿主【前】取引用、
   `appendChild` 搬进 `#srGridHost`；网格模式壳零画格；过滤=display 层。

## 2. 目标态（12+1 场景统一公式）

**壳（自绘 chrome：头部/柜签栏/搜索行/标签行/工具行/页脚动作组）+ 官方 DOM 原件
（物品格/行组件/官方按钮 reparent 进壳）+ 命令通道（仅新增整柜批量动作 + rackOpen）。**

| 场景 | 物品区 | 跨柜切换 | 转移操作 |
|---|---|---|---|
| 机器页×10 | 官方格 reparent（已就位） | forge SWITCH_BAG/TAB_SWITCH（已有） | 官方原生（拖/右键/高亮键）+ 页脚 tidy/storeAll |
| BackpackUI | 官方 .grid-container reparent（已写，实机验） | bagonly 无柜签 | 官方原生 + tidy/storeAll |
| Trade | 官方 #tradeBagGrid reparent（已写，实机验） | forge SWITCH_BAG(String) | 官方原生 |
| **MaterialRack** | **左=#panelA 原件（负重+官方背包格）右=#panelB 原件（官方汇总行）** | **cmd rackOpen → C# `Ac_MaterialRack_Open.SendAction` → 官方 state 重绑 → 官方行原生重渲染** | **中列=官方 btnPutAll/btnTakeAll 原件 + mod 三按钮（分类取出/分类放入/按标签放入，cmd 通道）** |

退役（自绘路径，全部删除）：BAGPANEL_HTML 自绘背包格渲染、renderBagPanel/bindBagPanel
自绘格接线、duo 右侧自绘柜格、自绘格 contextmenu take/put、列表行右键取1（列表=纯汇总
只读，行零事件）。保留：TRANSFER 三按钮 cmd 接线、✎/▾/页签拖拽/搜索/标签/排序 chrome、
列表汇总渲染、tidy/storeAll、rename/setTags。

## 3. 任务分解

### T1 UI-SPEC 更新（设计先行）
- 新增 §0.5《动作保真红线（总纲，2026-10-31）》：物品格=官方 DOM 原件；官方动作清单
  （左键详情/拖拽移动/右键快转/高亮键批转/使用/丢弃/入机器槽/行组件锁定/取出最多）；
  「任何版本验收=清单逐项实机打勾」；修订「官方原版背包禁绝」→「禁整页原版 chrome」。
- §4.5/§4.6/§4.8 整理柜与取出口径重写（上表目标态；右键=官方原生快转；列表纯展示）。
- §7 验收清单重写：加「每场景 × 动作矩阵」条目。
- §6 演进记录补 v13 废案与 v1.8.2 裁决条目（留痕，不改写历史）。
- 验收：spec 自洽（无 v12 自绘口径残留于生效章节）。

### T2 原型对齐（design-proto）
- rail.js rack 分支：左/右段物品区改为「官方原件占位」标注（视觉框+文案「官方格（原生
  动作）」），五按钮区标「2 官方原件 + 3 增值」；删自绘格右键取放模拟逻辑的「口径=实现」
  声明，改为「布局定稿用；物品级交互以官方原件为准」。重建 standalone.html。
- 验收：node build-rail-proto.cjs 产物含新标注；rack 场景三段布局与 v12 几何不变。

### T3 railui.page.js 整理柜装配重写
- SCENES.MaterialRack：`duo:true` 改 `rack:true`；新增 `official:{left:'.bag-panel:not(.is-storage)',
  mid:'.transfer-controls', right:'.bag-panel.is-storage', fly:'#flyLayer'}`；stubs 收缩为
  未保留节点（wtText 等已随 panelA 保留则剔除；保留 node 查询仍命中的不再建桩）。
- mount rack 分支：替换 #rackSystem → `#srp > .sr-duo` 三段；**左段←官方左 .bag-panel、
  中段←官方 .transfer-controls + mod 三按钮、右段=rail 壳（chrome）+ 官方右 .bag-panel
  （置于 srGridHost 位）**；#flyLayer 挂 .sr-duo（position:relative 上下文）；
  壳内层保留 `id=rackSystem` 作用域 div（官方 scoped 选择器/groundDock 继续工作）；
  复活检测 rack 专用判据（rackSystem 不在 #srp 内=复活）。
- render rack 分支：网格态=srGridHost 显示官方右面板（rackTitle/rackStat/rows 原生刷新）；
  列表态=纯汇总（官方面板 hidden，同机器页口径）；搜索/标签=display 过滤官方行
  （行=官方 DOM，matchItemEl 按行内数据键）。
- 删除：BAGPANEL_HTML()/renderBagPanel/bindBagPanel 自绘格与右键 put、put1/take 单件
  mod 语义、duo 自绘柜格渲染分支。
- 验收：node --check；root-harness rack 场景断言（见 T7）。

### T4 rackOpen 命令链（跨柜全原生）
- JS：rack 场景柜签点击 → `cmdOut({op:'rackOpen', owner})`（替代本地切柜；等待 ctx.rackOwner
  回推确认 active，防抖：切换中忽略后续点击）。
- C# RailCommands：新增 op rackOpen → CabinetCatalog.AllContainers 查 owner（白名单外丢弃+
  LogWarning）→ `Ac_MaterialRack_Open.SendAction(ownerId, targetId, cfgId)`；guard：仅
  MaterialRack UI 活跃时执行（防关页后重开）；执行后 ForceRepublish。
- ctx.rackOwner 已在契约——JS active 跟随既有路（2134 行区）。
- 校准 C1（实机）：TargetId 取值口径三选一验证（OwnerId 同值 / State.CurrentFurnitureId /
  furniture InstanceId==OwnerId）；RA_Open 副作用观察（是否会重播开场动画/未读标记等）。
- 验收：harness mock 派发断言 + 实机 C1 记录进 DESIGN §9.7。

### T5 BackpackUI/Trade/列表复核
- BackpackUI：`.grid-container` Vue 容器搬移后 Vue patch 存活（harness 已跑 Vue；实机验
  拖拽/右键/使用三动作）；bagonly chrome 规则不变。
- Trade：#tradeBagGrid 搬移 + cols 布局不破。
- 列表：行=纯展示零事件（复核 v1.8.1 行右键取1 已退役；drain 断言行点击零命令）。

### T6 harness 断言更新
- railui-root-harness：rack 场景新断言组（官方三件进段/行原生刷新/rackOpen cmd 形状/
  官方按钮在位/自绘格退役 grep 断言/列表纯展示）；既有 v13-accept 类断言组适配重跑。
- 验收：全部断言 PASS + 零控制台错误。

### T7 构建与版本
- csproj `<Version>` → 1.8.2；Plugin.cs Version 常量同步；CHANGELOG v1.8.2 条目；
  DESIGN §9 装配机制改「全场景壳架构」口径 + §9.7 加 C1 记录位。
- 验收：`release.ps1 -PackageOnly` 构建 0 错。

### T8 部署 + 实机验收（交付门，不可跳过）
- 部署：DLL → 游戏 BepInEx\plugins。
- 驱动：启动游戏（steam://rungameid 或直启 exe）→ CDP 9222 连接 → 逐场景探针。
- **动作保真矩阵（每场景逐项打勾，输出验收 JSON + 截图）**：
  1) 壳在位（官方面板原位替换/三段就位） 2) 官方物品元素在壳内（计数>0）
  3) 左键点击官方物品 → 官方事件链存活（UnitySendEvent spy 捕获 ITEM_CLICK）
  4) 右键快转 → 物品计数实变（取1/转1 语义）
  5) 拖拽 → DOM 级 mousedown/mousemove 落点判定生效（rack 页=行拖至背包格计数实变）
  6) 使用/丢弃（背包格原生菜单路径，至少事件链存活+计数实变一项）
  7) 搜索过滤 display 层生效且可清 8) 控制台零错误
  - rack 附加：rackOpen 切柜后 rackTitle/rows 原生重渲染、官方 PUT_ALL/TAKE_ALL 作用于
    切换后柜、机器人开关在位、锁定行/取出最多原生。
- 全绿后：实机截图存档 → 提交 → 汇报。任何一项红=回到对应任务修复重验，不带病交付。

## 4. 风险与预案

| 风险 | 预案 |
|---|---|
| RA_Open 副作用（重播开架流程/未读标记/声音） | C1 实机首验；不可接受则降级：rack 页签=当前架子原生 + 其他柜列表只读（用户已授权本方向，降级需回报作者裁定） |
| 非架子容器（冰箱 f/柜子 c）经 rackOpen 重绑行为异常 | 实机逐 kind 各测一柜；异常柜 kind 走列表只读降级并记录 |
| flyLayer 定位上下文变化导致飞行动画错位 | .sr-duo position:relative + 尺寸=rackSystem 原占位；实机目验 |
| Vue 页搬移后高频重绘壳条位移 | 观察器自愈既有；实机目验闪烁 |
| 游戏无法编程化启动 | steam 协议拉起失败时请作者点一下启动（仅此一步需人工，验收本身全自动） |
