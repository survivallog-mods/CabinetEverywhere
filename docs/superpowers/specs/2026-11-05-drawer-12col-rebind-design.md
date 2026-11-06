# 工作台抽屉 12 列换绑 + 壳宽 12 列地板 —— 设计

- 日期：2026-11-05　状态：**已被十八批终案部分取代（2026-11-06）**——核心前提误判：抽屉≠工具台
  家具的 1010 包（那是备料区），真抽屉=全局包 5010/5012/5013。数据层换绑方案整体退役；本 spec 的
  壳宽地板（§5.2）、契约 ctx.uniformWidth（§5.2）、取证方法仍有效并被沿用。终案见 CHANGELOG 十八批。
- 日期：2026-11-05　状态：**待作者批准**（builder-check 修订后稿）
- 作者拍板链：改 12 列（动机=切页签零缩放）→ 染料桶原料槽不可动 → 只影响抽屉 → 首帧必须 12 列（不接受 5s 自愈窗口）→ 追加壳宽固定地板保险层
- builder-check 四问定案：Q1 Rail 总门=与 SizeEngine 同门全停（§5.1）；Q2 宽度跟进=宽入
  早退门+SettingChanged 复位帧门，收缩与 SizeEngine 活改柜宽同语义（§5.1）；Q3 地板 cfg
  联动=地板目标=cfg 值、0=停用，契约增 `uniformWidth` 字段（§5.2）；Q4 克隆包 id 入
  ModShared 改宽黑名单（§5.4）——**Q3/Q4 为本稿自定项，作者可否决**

## 1. 意图与为什么

工作台页三个左栏页签 背包(12)/抽屉(6)/柜子(12) 宽度不齐，切换时壳与整页重排=「缩放变形」。
目标态：**抽屉与柜子同宽（12 列），且任何 <12 的漏网容器只产生两侧留白，不触发任何宽度变化**。

抽屉用的包是 Config_Bag **1010（纸箱 6×6）**，配置级共用：染料桶 66196（原料槽 UI）、
纸箱 307/308/309、工具台 405/80158、工具桌×7、自制工具台 313/80033/80164。直接把 1010
改宽会连带染料桶原料槽变形（作者 2026-11-01 实锤并拍板保护）——所以走**换绑**：给自制工具台
换一个专用 12 列克隆包，1010 一字不动。

## 2. 目标 / 非目标 / 反目标

**目标**
1. 工作台抽屉（含中栏材料格，同一实例的另一视图）12 列，宽度=`[Rail] UniformBagWidth`
2. 零过渡：任何时点打开工作台，抽屉首帧即 12 列（含读档后立即开）
3. 染料桶原料槽、纸箱、工具台/工具桌行为与宽度完全不变
4. 壳宽地板：mod 壳（10 个机器页）宽度恒 ≥ 12 列设计宽；窄柜居中留白；>12 仍可长胖不裁格
5. 存档中立：零存档写入；卸载 dll 即回原版行为

**非目标**
- 不统一纸箱/工具桌宽度（维持 11-01 拍板的「共包柜保持原宽」）
- 材料架（行式界面）不涉及
- 不做染料桶换包（作者明确「只影响工作台抽屉」）

**反目标（一票否决）**
- 任何 6↔12 过渡帧/闪烁
- 视图层伪列（幻影格——拖放落点必错乱，UI-SPEC 红线）
- 碰 1010 的 Size/Burden 等任何字段
- 写存档 / 写游戏文件

## 3. 已实证约束（2026-11-05 反汇编取证，build 26454866）

| # | 事实 | 对设计的意义 |
|---|---|---|
| C1 | `AgentSave`（家具存档 DTO）无包 id 字段：存 `AgentConfigId`+`ItemList(BagPos)`；`BagFurnitureConfigId` 是家具 id | 换绑存档中立 |
| C2 | `BagComponent.SetBagConfigId`（公开）：写 BagConfigId+按新包重拍负重；幂等；不动 InitialBagConfigId、不发事件 | 可安全重复调用 |
| C3 | 官方运行时换袋先例：`ApplyCargoBag`（载具货舱）即 SetBagConfigId 唯一调用方；缩袋时 EvictCargoOutside 驱逐越界物品 | 我们只放宽不收缩，无需驱逐 |
| C4 | 视图与拖放校验同源：`GetBagData`（90 调用点，含 `RA_GetHandMadeBagList` 背包/抽屉/工作台三连取）与 `CanPlaceItemForMove` 的边界都取 `BagCache[owner]→Config_Bag.Size` | BagCache 重指即视图+校验一致 |
| C5 | `RA_SetBag`（Ac_Item_SetBag 处理器）add-if-missing：TryGetValue 命中即跳过 | 重指后游戏重广播(1010)不会覆盖 |
| C6 | 三条家具生成路（public `Initialize` + 两条 protected `Initialize`）都**生成时现场读** `furnConfig.BagId`(偏移 0xFC)→`OnInit`；`AddCache`(BagCache 注册)在表体内 | 配置换绑先于表体=零闪烁的构造性保证；工作台 UI 不可能先于家具生成 |
| C7 | `Config_Bag` 有公开无参 ctor，全字段可写；`_bagSizeSet` 置空即重建白名单（套件已有工具方法） | 克隆包可行 |
| C8 | 套件 Harmony 前缀先例：RefreshCoalescer（0Harmony 已引用） | 补丁机制零新增 |
| C9 | 已知代价（与 SizeEngine 柜子同类、已拍板）：抽屉 x≥6 物品进存档，卸载后原版 6 列视图不可见（重装恢复） | 明示接受 |

## 4. 方案选型（作者已拍板）

| 方案 | 内容 | 结局 |
|---|---|---|
| A | 1010 直改 12 | ❌ 染料桶原料槽跟着变宽（11-01 已否） |
| B | 染料桶换专用包 + 1010 统一 12 | ❌ 波及纸箱/工具桌，超出「只影响抽屉」 |
| **C** | **自制工具台换绑专用 12 列克隆包** | ✅ 作者拍板 |
| — | 视图层壳宽 12 列地板 | ✅ 作者追加的保险层，与 C 叠加 |

## 5. 设计

### 5.1 数据层：DrawerWidthEngine（C#，RailUi.cs 新节，与 SizeEngine 并列）

**总门**：整套换绑与 SizeEngine 同门——`[Rail] Enable=false` 全停（作者动机=给 rail 壳统一宽度，
Rail 关=回原版语义；若只换抽屉不统一柜子反而复现宽窄不齐）。三条驱动全部过 `RailUi.Enabled` 首检。

**克隆包**：id=`99001010`（合成号防撞游戏更新）。字段抄 1010：Name/Name_Local/Burden=0/
UseOwnerName=1；`Size=[UniformBagWidth, 6]`（宽跟 cfg；高=1010 原高 6）。**Size 必须新建
List\<int\> 实例**（抄 1010 的 List 引用=改克隆即改 1010，红线事故）。入表前碰撞检查：该 id 已存在
且形状非 [w,6] → 告警并停用换绑（防游戏更新占用合成号）。入 `_Config_Bag_Dict` 后
`_bagSizeSet=null` 重建（复用 BagTable.InvalidateBagSizeIndex）。

**EnsureDrawerBag()（幂等核心，三处调用共用）**：
1. 早退门：`RailUi.Enabled` 为假 / 配置表未就绪（furns 缺 313 任一键=下轮再试，不崩）→ 零写返回；
   已就位判定=`furns[313].BagId==99001010` **且** 克隆包在表 **且** `clone.Size[0]==cfg 当前值`
   （宽入早退门=cfg 改值自动重同步，见下）——稳态成本=两次字典查找+两次 int 比对
2. 克隆包入表/改宽（先于换绑，防 SetBagConfigId 查空）
3. `furns[313/80033/80164].BagId = 99001010`（Config_Furniture 内存直写，FridgeChill 改 ColdRate 同款）

**三层驱动（零闪烁的时序闭环）**：
- **主路·每帧门**：AccessTicker.Update 里未完成标志期每帧查「ConfigManager 表就绪」→
  EnsureDrawerBag() → 完成后停查（`UniformBagWidth.SettingChanged` 置回未完成=改值当场跟进；
  稳态零开销）。正常在存档家具生成波之前完成换绑。
- **硬保证·Harmony 前缀**：Load 阶段（General.Enabled=true 才装，套件惯例）前缀补在三条
  `Initialize` 生成入口（按 Furniture 类型+签名解析，**不写 RVA**——RVA 随版本漂移）；前缀体=
  无参幂等调 EnsureDrawerBag()（首行 RailUi.Enabled 门，成本=早退门）。就算配置表与生成同帧，
  body 现场读到的已是克隆包（C6）——按构造零竞态。
- **兜底·5s 清扫**：挂 RailData.RefreshMeta 尾部（SizeEngine 同位，自然继承 Rail 门）——扫在场
  自制工具台实例（agentList→Furniture→AgentConfigId∈表，复用 CabinetCatalog 扫描模式）→
  `SetBagConfigId(99001010)` + `BagCache[owner]=99001010`（均幂等；C5 保证不被重广播覆盖）。
  仅服务「运行中中途开 Rail/换 cfg」边缘路径（此时界面未开，不可见）。

**cfg 语义**：宽度复用 `[Rail] UniformBagWidth`（不新增配置项）；`=0(off)` 时整套换绑停用
（含已换绑会话不回滚——与 SizeEngine「已写值不回滚」同语义）。**改值含收缩（14→12）**：与
SizeEngine 活改柜宽同款语义（15→12 已在线上跑过）——越界物品暂时不可见，挪走即恢复；
官方 ApplyCargoBag 的驱逐纪律不搬（SizeEngine 先例背书）。

**卸载**：全部内存级，dll 移除即回原生 6 列（C9 代价明示）。

### 5.2 视图层：壳宽 12 列地板（railui.page.js）

**syncRailWidth 改造**（现逻辑：量官方格外沿宽 nat → 壳宽=nat+24+sb 三重 !important 纯跟随）：
- 新增 `st.w12Floor`（每页帧级状态）：**首次渲染到 12 列容器时**，把当时的壳宽(计算值)标定为
  该页 W12。机器页打开必落背包页签（背包恒 12）→ 首帧即标定；自动吸收各页 slot/内边距差异，
  零魔法常数。判「当前 12 列」的信号源留给实现者（首选 webui-bag `getConfig().cols===12`，
  DOM 计列为兜底）。
- 壳宽 = `max(纯跟随宽, W12)`：W12 未标定前维持纯跟随；窄柜居中留白（`.sr-gridhost` flex
  居中已在位、unlockGridSize 已清官方锁 margin——两侧空白自然成立）；>12 容器仍可长胖，永不裁格。
- `SB_IND.repaint()` 照旧跟随。幂等写入门（宽度没变零 style 写）沿用。

**地板的 cfg 联动（评审 Q3 定案）**：地板目标宽=**当前 `UniformBagWidth` 值**（默认 12；改 14
地板跟 14——「设计宽」就是 cfg），`=0(off)` 时**地板整体停用**回纯跟随（off 语义=整个宽度统一
体系退出，不能留一个 12 列空壳）。实现：rail 数据契约（RailData.BuildJson/JS setData）增加
`uniformWidth` 字段由 C# 推送（契约小改，JS/NATIVE_BP_CSS 按值生成/移除地板）；harness 夹具
同步建模该字段。W12 标定判据相应=「cols==uniformWidth」而非写死 12。

**native 背包页**（B 键双背包/取用柜切换同类风险）：NATIVE_BP_CSS 追加
`.grid-container{min-width:<uniformWidth×56+18>}`（值随契约；12 时基准 690px，含自家
content-box 补偿的精确值由实现者实机校准；uniformWidth=0 时不注入该行）。窄容器右侧留白，不缩放。

### 5.3 测试

- **harness v146 契约翻新**（tools/railui-harness-tests）：原「壳贴当前格宽」断言改为
  「首见 uniformWidth 列标定后壳宽恒定；切 6 列格壳宽不变、格居中、lastCellR≤可视缘；切回满贴」；
  新增夹具场景：12 列标定→6 列格→断言零壳宽变化；**夹具建模 `uniformWidth` 契约字段**
  （含 =0 时地板停用回纯跟随的断言）。
- C# 侧本套件无单测工程 → 覆盖靠 5.3 harness + 第 7 节实机验收清单（作者执行）。

### 5.4 文档

- DESIGN.md 新章节：抽屉换绑（机制+取证引用）、壳宽地板
- CHANGELOG.md 待发版条目；版本号待作者裁定（套件惯例不自行 bump）
- README cfg 表：`UniformBagWidth` 描述补「含工作台抽屉与壳宽地板」
- UI-SPEC「壳宽跟官方格」相关行同步（评审提示：现文案与新地板语义不符）
- **ModShared/BagTableRw.cs `DefaultResizeExcludeIds` 追加 `99001010`**（跨 mod 单源黑名单
  「谁的 Size 不能动」——防止仍装载的兄弟扩容 mod 与本引擎打宽度架；名单口径作者所有，
  加一行带注释，属共享源小改）

## 6. 留给实现者的决定

1. W12 标定信号源（getConfig cols vs DOM 计列）与标定时机（render 主路挂点）
2. native 页 min-width 精确值（690px 基准+实机校准）
3. 三条 Initialize 的签名取证与 Harmony 解析写法（AccessTools.Method 重载消歧）
4. 克隆包 Name_Local 是否加后缀便于日志辨识（如「纸箱(抽屉12)」——仅日志/诊断面，UI 用
   UseOwnerName=1 显示家具名，不现包名）
5. `uniformWidth` 契约字段的具体形状与推送时机（RailJson 增字段 vs 独立推送）

## 7. 实机验收清单（作者执行）

1. 读档后**立即**开工作台（不等 5s）→ 抽屉首帧 12 列，零闪烁
2. 工作台页 背包/抽屉/柜子 来回切 → 整页零缩放零重排
3. 染料桶页：原料槽 6×6 原样，染色全流程正常
4. 纸箱/工具台/工具桌在背包页与机器页仍 6×6 原样
5. 场景搜刮中的自制工具台 → 抽屉同 12 列
6. 抽屉拖放 x≥6 可放可取；重读档仍在
7. `[CERail]` 日志：换绑行可见（改写 N 条/已就绪），SizeEngine 行为不变（1010 仍按守卫跳过=预期）
8. UniformBagWidth 改 14 → 抽屉 ≤5s 跟进 14、壳地板跟 14；改 0 → 换绑+地板停用，
   新会话回 6 列纯跟随
9. **[Rail] Enable=false 新会话**：抽屉保持 6、柜子原生宽、无换绑日志（评审 Q1 场景）
10. 卸载 dll 重进 → 抽屉回 6 列，原物品（x<6）可见
11. v146 harness（翻新后）全绿；回归 v145/v144/v138/v182

## 8. 风险与已知代价

- 🟡 新机制首创：Config_Bag 克隆注入 + 家具 BagId 换绑，套件首次（官方 ApplyCargoBag 先例
  佐证）；需第 7 节实机一轮验收
- 🟡 契约小改：rail setData 增 `uniformWidth` 字段（地板 cfg 联动依赖）；夹具/回归面随之 +1
- 🟡 Harmony 前缀补三条生成入口：游戏更新若改签名则前缀挂空——每帧门仍保主路，闪窗仅回退到
  「帧级概率窗口」（读档同帧竞态理论存在），实机清单第 1 条专测
- 🟢 游戏枚举 Config_Bag 全表的统计/图鉴面理论上多一行（名字抄 1010，UseOwnerName 不现名）
- 🟢 当会话已注册的**场景侧**自制工具台在换绑落地前保持 6 列（视图与校验一致，无损坏；
  下会话自动 12）
- ⚪ C9：抽屉 x≥6 物品存档后，卸载 mod 原版视图不可见（SizeEngine 同类已接受口径）
