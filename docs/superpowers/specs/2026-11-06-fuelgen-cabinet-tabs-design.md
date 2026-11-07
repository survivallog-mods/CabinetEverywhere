# 燃油发电机界面柜子页签（FuelGen Cabinet Tabs）设计

日期：2026-11-06
状态：待作者批准
视觉基准：原型 v6（`.superpowers/brainstorm/10499-1793977845/content/fuelgen-proto-v6.html`，作者逐轮修订定稿：v1 布局→v2 12列/滚动/整理/‹›+A/D→v3 固定宽高+底行钉底→v4 提示并底行→v5 面板宽锁死自查→v6 删格数/提示/圆点）

## 1. 意图与为什么

燃油发电机的操作界面官方只显示背包格：想加油必须「柜子→背包→开界面→背包→发电机」绕三步。
本设计让该界面的**左侧背包面板**变成「背包 + 燃料标签柜」页签面板：点柜中燃料直接整组送入发电机
燃油队列，与官方从背包加油完全同口径。

**作者底线（最高优先级约束）**：只动左侧背包/柜子面板；右侧发电机面板（状态卡/燃料槽/自动开启/
按钮）是官方原始内容，**一个字节不碰**。对话框 `.generator-system` 容器结构不动——左面板内容变化
经官方 flex 自然决定整体尺寸。

## 2. 目标 / 非目标 / 反目标

**目标**
- 左面板加页签栏：`背包`（固定首签）+ 全部带官方「燃料」标签（tagId 1013）的柜子
- 点柜中燃料 → 整组送入燃油队列；非燃料 → 官方同款提示「只能添加燃料」；队列满 → 「燃油槽已满」
- 格网固定 12 列（全界面统一宽）；行数超出限高滚动（8px 经典滚动条，与 CERail 同款）
- 面板固定宽高：宽=12 列格网外宽；高=固定值；短柜下方留白、底行不上移
- 底行仅一个官方同款「一键整理」按钮（右缘对齐，钉死面板底部；所有页签都有）
- 页签栏 ‹› 滚动钮（溢出才出现）+ A/D 键切页签
- 没有燃料标签柜时：左面板与原版完全一致（页签栏/底行不出现，官方元素原样）

**非目标（本次不做）**
- 取暖器等其他纯背包界面（机制按可复用设计，本次只接燃油发电机一页）
- 柜格拖拽到燃料槽、右键详情弹窗（点击直达已覆盖主路径，后续可加）
- 一键入库（作者令：仅背包界面专属）
- 右侧发电机面板的任何改动
- 对现有 12 个 CERail 场景、场景视图、页签注入等既有行为的任何改动

**反目标（做了即失败）**
- 动官方背包格 DOM/监听（背包页签必须官方原件原生交互）
- 撑宽/撑高对话框（页签再多只能滚动；面板尺寸锁死）
- 改其他界面的观感或行为

## 3. 约束与实证依据

- 燃油发电机页是标准 WebView 页：`WebUI_FuelGenerator : WebUIVm`，iframe id=`FuelGenerator`；
  官方事件 `FUEL_ADD{itemId} / FUEL_RETURN{slotIndex} / ITEM_CLICK / ITEM_MOVE / TOGGLE_POWER /
  SET_AUTO_START`（gamekb webui/UI/FuelGenerator/FuelGenerator.html）。
- **官方柜子页签机制到不了此页（方案 C 排除的实证）**：`Ac_Shredder_Open` 自带
  `CabinetBags/CabinetConfigIds`（读 `ToolCabinetConfig.CraftSourceFurnitureIds` 白名单）；
  而 `Ac_FuelGenerator_Open` 只带 `BagList/TargetId/...`，且 `State_Web_FuelGenerator` 无 BagTabs、
  页面 HTML 无页签区域——白名单注入与页签注入两条现成路都不适用。
- 官方加油口径（JS 侧实证）：`itemData._raw.burnable` 才可加；
  `(activeFuel?1:0)+fuelQueue.length >= fuelSlotCount` 时提示燃油已满；然后发 `FUEL_ADD{itemId}`。
- 「燃料」是官方原生家具标签：Config_FurnitureTag ID 1013（#E2703A）——与食物(1001)/材料(1012)
  同一机制，视野谓词可复用现有 AllContainers 的 tag 数据。
- CERail 管道现成：RailData 契约 v4（容器/物品/背包全量数据+rev 门控+分片推送+看门狗）、
  drain 命令通道、RailCommands.Pump 主帧执行、bootstrap 幂等注入（`railui.page.js` 顶部早退）。
- 红线（suite/docs/03-教训与红线.md）：回调内禁止改游戏数据；State/Reducer 只读不写；
  不 foreach OwnerCache；命令批量 ≤8 条/帧。

## 4. 方案选型

| 方案 | 内容 | 取舍 |
|---|---|---|
| **A（选定）** | 复用 CERail 数据/命令管道，FuelGenerator 进 RailData 场景表；UI 装配为新的「背包面板页签化」模式（不走侧栏壳） | 推送/分片/看门狗/命令/探活全复用，新写的只有本页装配与 feed 命令；一次建成后其他纯背包页套用=纯配置 |
| B | 独立新组件：自带数据通道与命令通道，与 CERail 并存 | 重复建设两条易碎管道（八追断流史教训），否决 |
| C | 走官方机制：白名单注入或 BagTabs 页签注入 | 上节实证：此页无消费方，不可行，否决 |

## 5. 最终设计

### 5.1 左面板改动清单（mod 区，全部在 `#bagPanel` 内）

| 元素 | 处理 |
|---|---|
| 官方 `panel-title`「角色背包」 | 有页签时隐藏（官方 Cooking 页同款行为：tabs>1 藏标题）；无柜子时原样 |
| 页签栏（新增，mod DOM） | 官方 Cooking `.bag-tabs` 结构与 CSS 克隆：`背包` 固定首签（pinned 槽+分隔线）+ 燃料柜页签 + `‹›`（`.tab-scroll-btn`，**常驻可见+端点禁用**——实机修复①：溢出门在柜少时永不显形，官方 Cooking JS 对行设显式宽帽同意图改 CSS calc）；纯文字无圆点（v6 定稿） |
| 官方 `#bagInfoBar` 空间条 | 有页签时隐藏；无柜子时原样 |
| 官方 `#backpackGrid` 背包格 | **永不移除、永不解绑**；柜子页签激活时 `display:none`，切回背包页签即恢复原生（官方 BagMsg 推送照常渲染，隐藏时无副作用）；mod 在场时改面板内滚动（`.srfg-on > .grid-container`——18 行真实背包不撑爆对话框，官方拖拽 ghost 挂 body 不受滚动裁剪，实机修复②背包侧） |
| 柜子格网（新增，mod DOM） | 与官方格网同几何（12 列、官方 slot 尺寸、官方 .slot/.item 观感）；行数超出限高滚动（`#srfgBody` 定高自愈锁保障，实机修复②柜侧）；燃料物品带官方火苗角标（.is-fuel） |
| 官方 `.hint-shift` 提示行 | 有页签时隐藏（v6 作者令删）；无柜子时原样 |
| 底行（新增，mod DOM） | 仅「一键整理」按钮（官方 BackpackUI `.action-btn` 基类暖金化，mod 在 BackpackUI 原生页同款先例）；右缘对齐（`.srfg-foot` 类+`justify-content:flex-end`，实机修复③类漏挂）、钉死面板底部 |
| 面板尺寸锁定 | **结构锁，非测量锁**（实机修复④：官方页渐进渲染——格仅随首包 BagMsg 才渲染、`createViewportFit` 在 BagMsg 时量系统，一次性 px 量取时机不定会锁进中间态/漏锁）：宽=CSS `min-width: calc(var(--slot-size)×12+…)`（官方页 CSS 变量 12 列全宽；实证 2026-11-06 Config_Bag：玩家背包全部 12 列×18 行=216 格，ID 1/2/5/6/7/8~11；唯一 14 列的 ID 4 是轿车后备箱非玩家背包——UI-SPEC 旧注「背包 12~15 列」与现表不符，以现表为准）；高=右 gen 面板自然高，`fgLockHeight` 每轮 settle 自愈复核+断官方 stretch（`.srfg-sys`，防背包先渲染把 gen 拉高）+锁变更补发 resize 促官方 `_fit` 复测（防调高背包后整对话框滞留半缩放）；格网区弹性主体（短柜留白、底行钉底） |

**右侧发电机面板与对话框容器：零 DOM/CSS/JS 改动。**

### 5.2 交互口径（与官方从背包加油逐条对齐）

- 点柜中燃料 = **整组**送入燃油队列（不拆分、不弹确认）
- 非燃料物品：格网照常显示（不藏），点击时校验 → 提示「只能添加燃料」——**提示元素=mod 在左面板内克隆官方 `.warning-box` 样式的自有节点**（官方 #warningBox 在右侧发电机面板内，作者底线=右面板一个字节不碰，绝不写入）
- 队列满 → 「燃油槽已满」（同一 mod 提示节点）；两跳兜底背包满 → 「背包已满，无法转送」（同节点）
- JS 侧预检（burnable/满员）：burnable 取 5.3 的本页 icfg 追加列；满员取官方页面状态（S2）或契约元数据；**C# 侧为权威校验**，拒绝经 ctx 一次性标志回传（lastTidyFail 先例），JS 收到即弹 mod 提示节点
- 一键整理：柜子页签=整理当前柜；背包页签=整理背包（官方 Sort+Merge，现有 OpTidy 复用）
- A/D 切页签：本页官方无页签状态、A/D 无官方 JS 占用（官方 A/D 走 C# ContainerTabHotKey，仅对有官方页签栏的页面生效，本页不命中）。绑定策略按 **S5 实测定**：iframe 文档级 keydown 优先（随 iframe 销毁自动解绑）；实测焦点不落 iframe 则改为 Root 绑定+场景退出显式解绑，或双绑去重
- 燃料退回（点燃料槽退背包）= 官方原样，不碰

### 5.3 数据与命令通道（复用 CERail）

- RailData.Scenes 新增：`{ Page:"FuelGenerator", Family:"fg", UiType=WebUI_FuelGenerator, ... }`；
  契约 v4 照常推送（ctx.page="FuelGenerator"），柜子/物品/背包数据即页签与格网的数据源
- ctx.view：新视野成员 `Fuel`（ScenarioView 枚举 +1）——谓词=带标签 1013 的柜子；
  cfg `[Scenario] View_FuelGenerator` 默认 Fuel（同其他界面的 View_* 模式，可换 Browser 等）
- **icfg 本页追加列（builder check Q1 裁定）**：ctx.page=="FuelGenerator" 时 icfg 行尾追加
  `[burnable,burnValue]` 两列（C# 从 Config_Item.Burnable/BurnValue 直读），供火苗角标与 JS 预检；
  其他 12 页推送形状不变（ctx 页条件字段先例：tradePrefs/lastTidyFail）。注意**不得**从分类推导
  burnable（官方判定是物品级标志，分类外的可燃物会误标）。JS normIcfg 按位取列，本页多出的尾列
  只由 bagtabs 装配层消费；harness 夹具补本页样例
- railui.page.js 新增装配模式 `bagtabs`（SCENES 条目声明）：不替换宿主、不建侧栏壳，
  在官方左面板内装配 5.1 的 mod 元素；数据到达即渲染，rev 变化增量刷新
- 新命令 `{op:"feed", owner:<柜ownerId>, item:<物品InstanceId>}`（drain→Pump 主帧执行）：
  1. C# 权威校验（burnable/队列容量）
  2. **直达路（Spike S1 验证）**：`Ac_FuelGenerator_FuelAdd.SendAction("{itemId:N}")` 官方动作直发
  3. **两跳兜底**（直达路不认柜中物品时）：ItemManager 柜→背包搬运（现有单件执行器）→ 再发官方
     FUEL_ADD；背包无空位则失败 toast「背包已满，无法转送」（不做自动腾挪）
  4. 收尾：`Ac_FuelGenerator_RefreshBag.SendAction()` 官方刷新 + ForceRepublish 重推契约
- 整理复用现有 `{op:"tidy", owner}`

### 5.4 配置与开关（对称移除纪律）

- `[Access] EnableFuelGen`（默认 true）：false=左面板 mod DOM 全摘、被隐藏的官方元素全恢复；
  已开界面重开后收敛（官方重建）；SettingChanged→Rerun
- `General.Enabled` 总开关与 `[Rail] Enable` 均沿用现有门（RailEnable 关=不注入不推数，本页随之退场）
- 其他 12 场景/视图/cfg 一律不动

## 6. Spike 项（计划期先做，各自有验证方法与兜底）

- **S1 RA_FuelAdd 跨包语义**：官方加油动作认不认「owner=柜子」的物品。验证=反编译读 RA_FuelAdd
  （RailSortMath 的 ProjectCook 反编译先例）或实机 CDP 试发。不认→5.3 两跳兜底（已定）。
- **S2 官方页面状态可达性**：mod JS 能否读到官方 State（fuelQueue/fuelSlotCount）做满员预检；
  不可达→契约 ctx 增补队列元数据或纯 C# 权威校验。
- **S3 官方 DOM 查询点扫描**（T9 stubs 纪律）：FuelGenerator.html 的 getElementById/$ 查询全量清点，
  确认「隐藏非移除」不踩官方 JS 解引用。
- **S4 背包 owner 取数**：State_Web_FuelGenerator 的 bagOwnerId 直读路径（契约 §4 的适配）。
- **S5 A/D 键位到达路径**（builder check Q4）：实机验证 FuelGenerator iframe 是否收到 keydown
  （CDP 打日志）。不达→Root 绑定+退出解绑/双绑去重（5.2 已定兜底）。

## 7. 留给实现者的决定

- 面板固定高度的具体像素值（以实机官方右面板自然高为基准对齐校准）
- 柜子格网行数上限的滚动触发值（=面板高反推）
- ‹› 滚动步长/平滑行为细节（照官方 Cooking 参数抄）
- mod 提示节点在左面板内的具体挂点（格网下方/底行上方，样式克隆官方 .warning-box）

## 8. 验收标准（作者实机清单）

1. 打开发电机界面：左侧=「背包+燃料柜页签」面板，右侧与原版逐像素一致
2. 家中无燃料标签柜时：整页与未装 mod 时一致
3. 点柜中柴火/柴油 → 整组出现在燃料槽，总热值/可用同步；点旧报纸类 → 「只能添加燃料」；加满 → 「燃油槽已满」
4. 背包页签：官方原生交互（右键/Shift 转移、拖拽加油）全部照常
5. 短柜页签：格网 3 行下方留白、底行整理按钮钉底不动；长柜/背包：格区滚动
6. 页签溢出时 ‹› 出现可滚，A/D 键左右切签
7. 一键整理对背包与柜子页签各自生效；无一键入库按钮
8. cfg 关 EnableFuelGen / General.Enabled / Rail Enable：界面退回官方原样
9. 其他 12 个 CERail 场景与既有功能回归无变化
