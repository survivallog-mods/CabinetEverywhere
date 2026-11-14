# 储物数据链瘦身设计（按页收窄推送 + 事件驱动变化检测 + 名单按需扫描）

日期：2026-11-14　状态：待作者批准　分支：`perf/rail-page-scope`（自 main 切出）

## 意图与为什么

排查实锤：12 个储物界面任一页打开期间，任何一件物品变动都触发**全屋整包**重建+推送
（背包+全部柜子+家内地面逐件；实测 173KB、约 24 片脚本、主线程 19~61ms），B 键背包、
整理物资页也照收全屋；界面开着时每 0.5s 全屋逐件扫一遍算变化哈希；界面全关时每 5s
仍全屋家具重扫 + 筛选脚本（约 65KB）重注入重推送。官方原生全为事件驱动
（物品增删走 LogicAdapter 通知处理器，容器收集在「打开面板」动作里现收）。

目标：每页只推它真正用到的数据；变化检测挂官方事件；柜子名单只在需要时扫。
作者诉求：不要过度设计，不加兜底，不留定时器。

## 目标

1. 单件物品操作的推送体积按页面/列表用途收窄（详见范围矩阵）。
2. 界面全关 = 零后台活动（零扫描、零注入、零推送）。
3. 界面开着时不再周期性扫全屋物品。

## 非目标 / 反目标

- **温室工程台零改动**：推送保持全量现状，场景表/视图配置/页签处理代码一行不动。
- 不新增配置键、不加开关、不加兜底轮询、不加任何定时器（含「界面开着期间 5s 扫」——
  作者裁定：装柜子必然关着储物界面，开页现扫即最新，无需自动出现在已开界面）。
- 筛选规则语义不变（TabGate 视图过滤、A/D 步进、页签显示条件照旧）。
- 一键入库路由范围不变、页签名不变、柜子名单元数据全量保留。
- 五个汇总列表页与吊栏列表的**显示内容**除下述一处外不变：
  吊栏列表「全部」视图预筛后只显示当前状态相关类别（作者确认=按需求分类，预期行为）。

## 约束（红线）

- 绝不 foreach 整个 OwnerCache，只按白名单 owner TryGetValue（既有红线）。
- ExecuteJavaScript 回调内禁止改游戏数据（既有红线）；推送走带回调重载。
- State/Reducer 只读不写；Harmony prefix 只置标志不改行为（放行原方法）。
- 既有可靠性机制全部保留：600ms 余波节流、>7.5KB 分片+pid、推送回执看门狗、
  7 处 ForceRepublish 通道、StoreTaskActive 闸、RefreshCoalescer.Flush 每帧最先。

## 方案（每部分一条可行路 + 弃选理由）

### A. 变化检测：挂官方通知，删轮询
新建 `ItemChangeSignal.cs`（独立挂载，不受 EnableMoveCoalescer 门控）：Harmony prefix 挂
LogicAdapter 五处理器——AddOrNotifyItem(3002，载荷自带 OwnerId)/DelItem(3005，prefix 内
ItemManager.GetItemData(id).OwnerId 反查)/OnSyncBagItems(3031)/OnRefreshAllBagViews(3027)/
OnGroundDockSync(21015)——只置脏标志并放行（return true，不吞通知）。
`RailData.ItemsDirty()` 改为脏标志组合（含 _forcePending/_tidyFailPending/BasketGlist.Dirty/
范围变化）；退役 ComputeSig/_lastSig/SigOwner/每帧 StructureChangedFast。
MoveNotifyCoalescer 逻辑不改（其窗口收尾 SyncBothBags 穿透时由本钩子捕获）。
- 弃选：挂 ItemManager 全部变更方法（AddItem/CostItem/SplitItem…）——拦截面大且含
  非 UI 可见变化；LogicAdapter 是官方界面更新的唯一通道，官方显示的变化必经此处。
- 无兜底依据：官方界面无 3032 处理器，叠数变化只能经 3002 到达 UI；保鲜倒计时本就
  不入签名（RailData.cs:269-272 既有裁定）。实测缺哪条路补挂哪个 ItemManager prefix
  （SetItemCount/IncreaseItemCount/DecreaseItemCount），不回退轮询。

### B. 推送范围：每页一个范围函数
`RailData.ScopeOwnersOf(scene)`（复用 ResolveBagOwner/RackOwnerOf 的 GetStateByUI+TryCast
读法）：BuildJson 的 items 段只拼范围内 owner；**ctn 元数据段保持全量**（每柜几十字节，
保住入库路由 order、页签名、白名单校验、容器名）。
官方切页签→各页 State_Web_* 的当前容器字段变→FastPoll 每帧廉价比对当前 owner（代替
原 StructureChangedFast 的角色）触发重推。
- 弃选：JS 上报当前容器给 C#——多一条通道且滞后一拍；状态字段是官方真源，C# 直读零成本。

### C. 五个汇总列表页：推送前按页筛选
染料桶=有色素点；暖炉/燃油发电机=可燃物；老鼠笼=猎物或有饱腹值的食物；酿酒桶=可酿酒
且 s1>0。谓词只作用于**非当前柜**的行；**背包行与当前柜行不过滤**（格子态网格/排序角标/
右键取物回查都要当前柜全量——列表/格子切换是 JS 本地状态，C# 读不到，按两边都满足推）。
被滤行计数随包带 `ctx.glistHidden`：按 JS 同口径「种」（物品名+剩余次数+词条 去重）计数，
含当前柜将被 JS 藏掉的行——页脚数字与现在完全同口径。谓词字段与 JS glistAggregate 同源
（icfg 尾列同一批 Config_Item 字段，C# 侧出数，拼行时已带 uses/attrSig）。
- 弃选：JS 端继续全量收再藏——包不瘦身，本轮无意义。

### D. 二楼吊栏：按需求状态类别预筛
窗口期间（BasketOn）柜子物品按当前状态筛：有许愿=许愿类别∪危机类别；垂危=食物；
无许愿=8 固定分类（食物/材料/日用品/燃料/药品/书刊/工具/种子）。类别源=NeighborWishSnap
（C# 已在读）。背包行全量（右键放篮子）。可见变化：列表「全部」只显示相关类别。
- 弃选：无（作者直接裁定按需求分类）。

### E. 一键入库结果：C# 权威计数
DriveStoreTask 逐柜累计吸收件数、留背包按件累计（现 LeftStacks 是叠数）；FinishStoreTask
经 `ctx.storeAllRes=[[ownerId,件数]…]+留背包件数` 随完成哨兵包带出；JS settleXfer 改读
ctx，退役 armStoreAll 全屋快照与 storeAll 路 snapOwner（tidy 路快照保留）。
- 弃选：保留 JS 快照——依赖全屋数据，与按页收窄冲突。

### F. 柜子名单与筛选数据：按需触发
触发时机四个：①打开储物界面那一帧/切场景（放 **AccessTicker.Update** 内、
TabInjector.FastPoll 之前同帧执行，保证首开页签不闪；不放进 RailUi.FastPoll——其首行
[Rail] Enable 门会把「只用筛选不开侧栏」的用户拦掉）②OpStoreAll 执行前 ③cfg 变更
（既有 Rerun）④读档（ReapplyOnBattleStart）。
每次触发执行清单（按触发点取舍）：RebuildConfigIds（③④+首次配置表就绪）+
CraftSourceInjector.Ensure/RemoveAll（③④+首次——白名单是家具**类型**级静态集合，
新柜子实例无需重注入）+BagBurden.SlowTick（③④——修原先读档洗表/热改负重只靠 5s
事后收敛）+RefreshHomeInstances+RefreshMeta（SizeEnginePoll+RecomputeCaps）+
TagFilter 数据（签名变化才推）。
TagFilter bootstrap 注入抄 RailUi.InjectBootstrap 探活模式（探针确认存活后零注入，
WebView 重建自动重注）；数据仅在「有储物界面开 && 签名变」时推；单参 ExecuteJavaScript
换带回调重载（实机铁证：单参在本机静默丢弃）。
- 弃选：界面开着期间保留 5s 扫——作者裁定不需要（装柜子必然关着界面）；开页现扫。

### G. 全库搜索不受影响（复核结论）
「本柜/全库」搜索按钮所在搜索行在 11 个机器页（plain）、材料架（plainbag）、B 键背包
（bagonly）全部被 CSS 隐藏（railui.css:54/72/219），全 mod 仅温室工程台显示；温室按
作者指令保持全量推送，该功能天然不受收窄影响。零改动。

## 范围矩阵（每页推送的 items）

| 界面 | 背包行 | 柜子行 |
|---|---|---|
| B 键背包 | 全量 | 无 |
| 整理物资（双背包/取用单柜） | 全量 | 仅当前打开的柜 |
| 机器页 11 页 + 材料架 | 全量 | 仅当前页签容器 |
| 染料桶/暖炉/发电机/老鼠笼/酿酒桶 | 全量 | 当前柜全量 + **其余柜**按页筛选 |
| 二楼吊栏窗口 | 全量 | 当前状态相关类别（许愿∪危机/垂危=食物/无许愿=8 分类） |
| 温室工程台 | 全量 | 全量（现状，零改动） |
| 家内地面 | 有物才现（现状） | — |

## 风险登记（每项独立 commit，出问题按 commit 回退）

- R1 叠数变化走 3002 为签名级推断：实测不刷新→补挂 ItemManager 对应 prefix，不回退轮询。
  动手前先读 dump 复核 SetItemCount/IncreaseItemCount/DecreaseItemCount 调用面。
- R2 切页签瞬间新柜行最迟 600ms 到达，期间排序键/角标显示 '-'。
- R3 C#/JS 列表筛选不一致→行数错：C 独立可回退。
- R4 TagFilter 通道切换（单参→带回调）异常→回退该行。
- R5 无定时器后：全关期间放的柜子由下一次开页帧发现（零陈旧）；读档洗表靠
  ReapplyOnBattleStart 补挂收敛。
- R6 入库文案口径对齐（件）；吊栏「全部」视图类别预筛为预期行为变化。

## 验证

1. 每 commit 后 `dotnet build`；tools/railjson-test 若断言 BuildJson 形状需同步改。
2. 实机清单（作者逐项过）：空闲（开一页不动）无重推日志、全关无扫描/注入日志；
   官方整理/机器人整理/拖放/右键取物/捡拾/丢弃/吃用一件（叠数变）/腐烂删除/无人机交易
   变动→≤1s 跟上；B 背包只收背包行、整理物资收背包+当前柜、机器页切页签角标正确；
   五页列表行数与改前一致+隐藏计数正确+右键取 1 件正常；吊栏三状态列表内容正确+
   右键直放正常；一键入库逐柜件数文案正确；新放柜子并打标签→开烹饪/工作台页签即显；
   读档后负重/柜宽正常；温室工程台表现与改前完全一致。
3. 通过后按发版流程整理 commit，PERF_NOTES.md 补记。

## 留给实现的查证项（动手前）

- dump 复核 R1 挂点签名与 SetItemCount 族调用面。
- JS railui.page.js:4844「全行可见零预设隐藏」注释随吊栏预筛更新。
- tools/railjson-test 断言面核对。
