# CabinetEverywhere 性能只读分析报告

## 调优总账（2026-11-13 上午 ~ 11-14 凌晨全程汇总）

### 一、过程时间线

| 阶段 | 动作 | 产出 |
|---|---|---|
| 0 静态分析 | 28 个源文件全量审查 + 昨晚日志静态验证 | 热点地图 R1~R15；R11（Verbose 探针+每 5s×20 行日志刷屏）实锤=最初「只装也卡」主因；常态底噪量化（SizeGuardFrame ~132 interop/帧等） |
| 1 诊断插桩 | PerfDiag（异常哨兵+22 处吞异常打点+10s 帧率窗口+R1/R3/R4/R5/R8 A/B 开关）→ 基线实测 → 升级（>100ms 卡顿现场行+异常堆栈采样+GC 计数） | 基线满帧（背包/工作台/交易页全开 59.9）——证明 Verbose 关掉后基础健康；发现每秒 6 次后台 Il2CppException |
| 2 实时抓捕 | 用户正常游玩（拾取/入库/存取）触发卡顿，现场行+3 个静态排查智能体（其他 mod 日志/JS 侧/内存累积）交叉 | 三层定位：①单帧大搬运（官方 API 平方广播）②入库收尾三合一 ③JS 每 0.5s 全量重绘；外部发现 EndlessGuard 周期异常+写盘（用户已停用） |
| 3 反汇编取证（4 个智能体） | gamekb dump+GameAssembly 反汇编：通知总线架构/通知码表/官方先例/订阅者语义/全部存入拆账/丢弃链解剖 | 主犯=每件 3002/3005→LogicAdapter 同步直调→BuildBagJson **整包界面 JSON 重建**（占 65-80%）；官方 ExecuteMoveBag 自己就是「批末一次」模式（可行性背书）；丢弃真凶=21015 脚边全量同步放大器（本局拖放一次后永不清零）；RA_DiscardAll 只是弹框（执行在另一帧） |
| 4 迭代修复 | V1→V1.4 五轮（每轮实测驱动，回归即时修） | 见下表 |

### 二、已完成的调优（机制：搬运通知合并 MoveNotifyCoalescer + 三件套）

**核心机制**（方案 A「汇总而非屏蔽」，作者定调）：批量操作期间静默界面逐件刷新通知（3002/3005/3031/3027/21015 五码，拦订阅者处理器而非泛型事件入口=避开 il2cpp 泛型共享坑），操作结束**一次整包同步追平**（官方 SyncBothBags/PushGroundDock/Ac_Item_RefreshAllBagViews 三条补发路）。包窗面：7 个搬运入口+3 个拾取入口+丢弃入口+mod 侧栏手工窗+入库任务级大窗。cfg [Perf] EnableMoveCoalescer 可整体关闭。

| # | 问题 | 修复前（实测） | 修复后 | 版本 |
|---|---|---|---|---|
| 1 | 官方全部存入/取出（几百件） | **5649ms 单帧冻结**（每搬一件=整包界面 JSON 重建一遍） | 冻结消失（实测确认） | V1 |
| 2 | mod 批量命令（take/put/takeAll/putAll/cat/tag） | 同平方风暴 | 七搬运入口窗覆盖 | V1 |
| 3 | 一键入库收尾帧三合一 | 402~411ms | 拆帧：哨兵当帧、刷新+重推下一帧 | V1(C1) |
| 4 | storeAll order 混入地面 -101 | 8 次白名单拒绝警告 | 入循环前剔除 | V1(C2) |
| 5 | 开界面周期顿挫 | JS 每 0.5s 一拍全量重绘+双强制布局（无内容门） | render 十元组指纹门：数据+视图未变直接跳过 | V1(C3) |
| 6 | Verbose 探针+日志刷屏 | 2.6 万行/4h（占日志 93%）+探针挂官方高频方法 | 关闭（cfg） | 阶段 0 |
| 7 | 材料架搬运 | 338/319ms（3027 每件风暴） | 静默 3027+批末兜底 | V1.1 |
| 8 | **背包一键丢弃（放满）** | **91012ms 彻底卡死**（21015 脚边放大器：每件全量重扫地面+递增 JSON+≤4 次网页推送） | 91s→秒级丢弃过程 | V1.2 |
| 9 | 丢弃后背包显示不更新 | 静默后 Data 层无增量（仅刷视图无效） | 批末背包自环 SyncBothBags 整包追平 Data 层 | V1.3 |
| 10 | **批量拾取** | **142702ms 卡死**（mod 侧栏/脚边拾取不走已包窗入口=21015 全链放行） | 拾取三入口+RailGround 手工窗全包 | V1.3 |
| 11 | 一键入库回归（V1.3 引入） | 连续 2175→760ms 巨帧串（每帧小窗各自整包补发，窗实测 831/941ms） | 任务级大窗：全程零补发、收尾一次 | V1.4（待实测确认） |

### 三、未调优 / 待处理事项

| # | 事项 | 状态/方案 | 优先级 |
|---|---|---|---|
| P1 | **开/关整理页巨帧 0.5~2.7s（满载）**——**2026-11-14 定责完成：官方原生层，随物品数线性，mod 无关，不可根治** | 五轮排除法（OpenTrace v3~v7 探针+WebView CDP buffered 取样+反汇编）：✗GetMsg 序列化（1~12ms）✗SendMessageToPage/PostToWebView 发送链（≤51ms）✗GC（巨帧当帧增量 0/0/0）✗JS 渲染（全 frame buffered 长任务 ≤115ms）✗mod rail 推送（Rail 关闭 A/B 后巨帧照旧）✗C# 等待（TickLoadStallGuard 反汇编非阻塞）→ 剩 Vuplex/WebView2 原生同步（Harmony 不可达）。空背包开页流畅=成本随物品数线性。唯一剩余 mod 侧思路：页面常驻（拦 RemovePage 保活 iframe，开/关降为 Show/Hide），需评估内存与官方状态一致性 | 已定责 |
| P2 | 丢弃残余 1~4s（几百件掉落物 3D 实体生成 2-6ms/件，V1.2 后暴露） | 可做 V1.5：丢弃表现层分帧（掉落物分批渐显） | 中 |
| P3 | 拾取链飘字/音效（2020/14001 逐件） | 批量拾取时几百条飘字——体验项非性能主因，可并入 V1.5 静默+批末汇总 | 低 |
| P4 | JS 侧 TradeFx MutationObserver（characterData+subtree，打字机动画期近每帧跑四渲染链） | agent B 高风险项，未修；交易页动画期掉帧时再修 | 中 |
| P5 | JS makeBadgeLayer 三路驱动逐格读 offset 链 | 未修；角标层偶发布局抖动源 | 低 |
| P6 | C# 内存累积（agent 审查）：ComputeSig/BuildJson 全量枚举与 130KB 大串随物品总数线性（LOH 碎片）=「越玩越卡」型；TagCtx 每 0.5s 多处无缓存重建；_namesWorld 钉住旧档整个逻辑世界 | 结构性优化项（增量签名/缓存/换档清理），非本次卡顿主因；玩家反馈"越玩越卡"时启动 | 中 |
| P7 | 每秒 6 次 Il2CppException 来源 | 堆栈仅 interop 一帧无法定位；2026-11-14 二分：EndlessGuard dll 改 .disabled 后计数照旧（×64/10s）→ **已排除 EndlessGuard**，来源仍未知（其余 mod 或游戏自身）；恒定背景噪音（≈数 ms/s），非性能主因 | 低 |
| P8 | 诊断代码拆除（PerfDiag+[PERFDIAG] 标记 22 处+5 个 A/B 开关） | 稳定运行一段时间后一次性拆除 | 收尾 |
| P9 | 遗留台账 L1~L5（EndlessGuard 反馈/残留进程风险/R10 UI 变形复现修） | 见下方台账节 | 低 |
| P10 | 帧预算自适应/搬运任务互斥（方案 B 并发防护） | V1.4 大窗后每帧成本回到 ~13ms，优先级降低；若并发批量操作叠加掉帧再做 | 低 |
| P11 | **单件操作剩余地板 ~150-250ms**（V1.6 后实测 110~288ms；单丢背包>单丢柜子=批末 PushGroundDock 全量地面同步差异；单件移动=批末 SyncBothBags 整包追平一次） | 每次状态变更至少 1 次整包 DTO+推送（官方协议固有）；可见 managed 仅 20-40ms（BuildBagJson 1-13ms 已证便宜），其余为推送求值等隐形成本。**V1.7 候选：官方 O(1) 增量通道 Ac_Item_MoveBag→3017**（RA_ToOther 0x40 字节、RA_MoveBag 0x70 字节反汇编实证；约束=Data 层需 DTO，须 3002/3005 放行+只吞 3031/3027/21015 的混合方案，防 V1.2 显示不更新回归） | 中 |
| P12 | 开页巨帧构成更新（v7.1 RA_* 钩子实测）：653ms 帧中 **RA_OpenUI 211ms + RA_UpdateItemActionMarks 206ms 可见**（物品角标 O(物品数) 重算）+RA_Sort 219ms（整理按钮）；此前"隐形原生"实为未挂钩的 RA 族 | 官方 Reducer 逻辑，mod 不可跳过；600+600 格是放大器。降格数或页面常驻（已否决）是仅有的杠杆 | 已定责 |

### 四、经验教训（本案沉淀）

1. **静默通知必须配套数据层追平**：只刷视图不追平 Redux Data=显示不更新（V1.2 丢弃bug）；追平通道=官方整包动作（3031/自环 SyncBothBags），与官方 ExecuteMoveBag 批末行为同构。
2. **包窗必须贴着真正的逐件循环**：包在弹框帧（RA_DiscardAll）=执行在另一帧静默失效；包在每帧小批（入库）=每帧补发整包=新回归。**任务级大窗>每帧小窗**。
3. **官方先例是可行性最快证明**：ExecuteMoveBag 批末一次 3031、NotifyQuickMoveFails 聚合提示、QuickStoreProgress 进度通知——「汇总」与官方设计同向。
4. 拦订阅者处理器（非泛型）优于拦泛型事件入口（il2cpp 泛型代码共享陷阱）。
5. 诊断先行：卡顿现场行（页面/队列/入库/推送上下文）+通知账单让每轮回归 5 分钟内定位。

---
（以下为过程原始记录：时序图/取证/迭代详情）

分析日期：2026-11-13 · 范围：全部 28 个源文件（约 11600 行）· 环境：BepInEx 6 IL2CPP + HarmonyX + Vuplex WebView2

## 卡顿事件时序图（修复前基线，2026-11-13 晚实测）

> 实测锚点：`[PERFDIAG] 卡顿帧 5649ms｜页=BackpackUI rail=On`。件数未记录（估 400~600，按 500 件取均值 11.3ms/件）。分项耗时=反汇编结构实证 × 占比权重折算（#1 占 65-80%、#2 10-20%、#3 5-10%、#4 ~5%，均为估算区间取中值）——**结构是实证的，毫秒数是折算的**。

### 主事件：官方"全部存入"（整理物资界面原生按钮，~500 件，5649ms 单帧冻结）

```
玩家                 官方按钮/Redux              ItemManager                事件总线           LogicAdapter→Redux→界面
 │ 点"全部存入" ──────→ RA ─ NotifyGlobal(3015 MoveBag) ─────────→ OnMoveBag │                  │
 │                                                                 │ 进入 ExecuteMoveBag 逐件循环 ═════════════════════════╗
 │                                                                 │                                                     ║
 │  【第 N 件，共~500 件｜每件均值 ≈11.3ms】                 ║ 总计 ≈5648ms
 │                                                                 │                                                     ║
 │   ①  六项校验（标签规则/冷藏/负重/禁入/类别/重量）   O(1)      ~0.05ms       ║
 │   ②  FindStackableItem：线性扫描目标包【全部物品】            ~1.7ms  ★扩容放大 ║
 │   ③  搬数据：堆叠并入 O(1) ／ 或找空位三件套                    ~0.3ms       ║
 │        （整包 List 拷贝 O(M)＋bool[W,H] 占位网格重建＋FindBestPosition O(WH)）  ║
 │   ④  NotifyGlobal(3002 加了一件) ──────────────────→ 同步直调（无队列无合并） ║
 │   ⑤  NotifyGlobal(3002 源减了一件)（源叠归零再+3005）────────→ 同上           ║
 │        └→ LogicAdapter.AddOrNotifyItem → Ac_Item_*::SendAction（同步立即执行） ║
 │            └→ RA_AddOrNotify → UpdateBag：                      ~0.6ms       ║
 │                 ├ GetItemDataList：遍历源包全部物品 O(M)                     ║
 │                 └ 17×IsUIActive 探测 → 活跃界面各派 Ac_*_RefreshBag          ║
 │                     └→ BuildBagJson ★★★主犯 ★★★               ~7.4ms        ║
 │                         整包界面 JSON 重建：全物品×(查配置表/本地化文本/      ║
 │                         转义/20+次 Append，每件 40+ 重调用)                  ║
 │                         + Recompute 三连（购物篮预览/标签预览/全屋库存）      ║
 │   ⑥  家具目标直调：OnFurnitureBagChanged（含日志字符串 Format）  ~0.9ms       ║
 │        + RefreshFurnitureBagSlotState 再全包扫 O(M)                          ║
 │   ⑦  线性杂项（ToDto/计数增减/SearchMarker 置脏/委托遍历）      ~0.5ms        ║
 │                                                                 │                                                     ║
 │                                                                 │ 批末：SyncBothBags（两包全量 ToDto）→ 仅 1×3031     ~1ms   ═╝
 │  5649ms 冻结结束（官方唯一已优化的一环：整包广播批末只发一次）           │
```

**每件均值拆账**：通知链④⑤ ~8.2ms（72%，其中 BuildBagJson ~7.4ms）｜找位② ~1.7ms（15%）｜家具直调⑥ ~0.9ms（8%）｜其他 ~0.5ms（5%）。

### 附事件 A：一键入库收尾帧（402~411ms 级，实测 4 帧）

```
最后一批 12 件搬完 → FinishStoreTask 收尾帧【三件事同帧】
  ① MarkStoreDone 哨兵+进度推送 100%        ~1ms
  ② RefreshActivePage：官方整页重建推送      ~100-200ms（含 BuildBagJson 同款整包重建）
  ③ BuildJson 130KB（mod 侧 ~2.5 万 interop）+19 片下发   ~25-80ms
```

### 附事件 B：批量拾取（多次拾取地上物品，实测 907/1947ms 级）

```
每件拾取 = TryAddItemToBag(堆叠轮×3002+3033) + 21001 掉落消失 + 14001 音效
         + 2020"获得xx"飘字 + 3046 计数
——链路与移动链不同（无 3031 整包），重量级构成待 V2 取证；3002 的订阅者链同主犯
```

### 附事件 C：背包"一键丢弃"（放满 600 格，实测 91012ms=91s 彻底卡死；V1.1 后仍卡死）

```
RA_DiscardAll(0x2B023A0)：只弹确认框（V1.1 窗误包在此——执行在确认回调后的另一帧=窗外！）
 └ 确认回调 → NotifyGlobal(21013) → DropItemManager.DropAllFromBag(0x2720720) ★逐件循环★
     每件：校验(任务书/不可丢跳过) → DropItemFromBag(0x2721A70, silent=true)
       ├ NavMesh 采样 SamplePositionSameFloor（0.05-1ms）            实证
       ├ 逻辑增删：ForceRemoveItem(3005)+AddItem(3002)               实证（V1 已静默）
       ├ 逻辑实体 CreateFromPool<DropItem>（纯数据壳）               实证 轻
       └ ★NotifyGlobal(21008 DropItem_Spawn 每件,silent 也不跳过)★   实证
           ├ DropItemShowManager.OnSpawnDropItem→CreateBox：资源加载
           │  (YooAsset 同步,未预载型号 10-300ms/种)+Instantiate+2×GetComponentsInChildren
           │  +碰撞注册（每件 2-6ms，600 件≈1-4s）
           └ ★DropItemManager.OnGroundDockSpawn→PushGroundDock★（真凶）
               前提：本局拖放过一次物品→_groundDockWatching 置 1 后【永不清零】(实证 0x27244D2 唯一置位)
               每件触发：CollectGroundDockItems【线性扫全部地面物 O(n)】+递增 JSON 序列化
               → NotifyGlobal(21015) → LogicAdapter → Redux 扇出 ≤4 个 Web 状态
               → GroundDockView.BuildJson → WebView 大字符串推送
               =600 件×(全量重扫+全量JSON+≤4次推送)≈91s ← 主因（链路实证+量级推断）
已排除：BagDropRouter/Planner（拖拽入包的布局规划，不在丢弃路径）；声音/飘字（官方 silent=true 已跳过）
```

## V1.1/V1.2 迭代记录（2026-11-13 深夜~14 凌晨）

- V1 实测（用户反馈）：全部存入 5.6s→消失✓；残余=重复大批量仍卡（材料架 338ms=3027 每件风暴；拾取链 1383ms 无窗）+**全部丢弃仍卡死 91s**+打开放满的背包卡（2710ms，官方首帧序列化渲染为主，mod 大包在后续帧）。
- V1.1（70f4343）：静默面+3027；包窗+RA_DiscardAll+OnRequestPickAll；空对兜底 Ac_Item_RefreshAllBagViews。
- V1.1 实测：丢弃**仍卡死**（账单窗未触发+日志截断于冻结）——取证揭示双错：①窗包在 RA_DiscardAll（弹框帧），真执行在确认回调另一帧；②真凶=21015 脚边全量同步链（DropItem 域，与已静默的 ItemBag 域不同域）。
- V1.2（67b28b2）：窗挪 DropAllFromBag（真正逐件循环）；静默面+LogicAdapter.OnGroundDockSync(21015)；批末 PushGroundDock() 补一次（幂等全量）。预期：91s→1-4s（残余=每件 CreateBox 实体生成，若仍不可接受→V1.3 丢弃表现层分帧）。

### V1 实施记录（2026-11-13 深夜，commit fac5fea）

| 项 | 实现 |
|---|---|
| MoveNotifyCoalescer（新文件） | ①包窗：ItemManager 七搬运入口（TryQuickMoveItems/TryMoveBagAll/OnMoveBag/ByCategory/ByTag/OnQuickMoveItems/WithFallback）prefix 进窗（引用计数）+finalizer 兜底；②静默：窗内拦 LogicAdapter.AddOrNotifyItem(3002)/DelItem(3005)/OnSyncBagItems(3031) 三个**非泛型**处理器（比泛型事件入口更稳更准，避开 il2cpp 泛型共享坑）；③补发：窗归零对每 (from,to) 直调官方 ItemManager.SyncBothBags（interop 私有直调，编译实证可达）→官方发 3031→窗已关正常执行→Redux 整包追平。cfg [Perf] EnableMoveCoalescer=true 可关。日志：首窗+60s 限频一行对账（拦×N/补×N 对/窗时长） |
| C1 收尾帧拆开 | FinishStoreTask 只做哨兵+进度 100%，官方整页刷新+ForceRepublish 延一帧（_storeFlushPending，Pump 消费） |
| C2 order 剔地面 | OpStoreAll 循环首行跳过 -101（消 8 次白名单警告） |
| C3 render 指纹门 | railui.page.js render() 入口指纹（store.rev+scene/currentId/mode/global/query/tags/sort/sel/plainBag 十元组），同指纹跳过全量管线；rev=C# 结构签名（同 rev 必同数据），视图态变化自然换指纹 |
| 部署 | dll 编译 0 错误；部署时游戏占用，待退出后复制 |

### 修复后对比（V1 落地后回填）

| 指标 | 修复前（实测） | 修复后（实测回填） |
|---|---|---|
| 官方全部存入 500 件单帧 | **5649ms** | 待测 |
| 一键入库收尾帧 | 402~411ms | 待测 |
| 批量拾取 | 907~1947ms | 待测（V1 不覆盖，预期不变） |
| 每件通知链成本 | ~8.2ms（BuildBagJson×500 次） | 预期批末仅 1 次（结构由补发 3031 保证） |

> 修复后预期（推断）：主犯全消后残余=找位扫描+家具直调（纯内存操作），取证口径分歧给出 50ms~1.3s 区间——以实测为准。

## A. 热点地图

### Harmony 补丁（7 个）

| # | 目标方法 | 补丁类型 | 安装处 | 调用频率估计 |
|---|---|---|---|---|
| P1 | `HotKeyManager.Update` | prefix | TradeTabKeyFix.cs:64 | **每帧**（游戏主循环） |
| P2 | `WebUILayer.SetKeyboardEnabled` | postfix | RailUi.cs:1006 | 官方键盘管理调用频率，**推测每帧级** |
| P3 | `Reducer_Web_TradeUI.Refresh` | postfix | TradeFxRefreshHook.cs:32 | 交易页打开期间高频（官方 reducer 刷新路径） |
| P4 | `Ac_ToolTable_RefreshBag.SendAction()` | prefix | RefreshCoalescer.cs:40 | 工作台制作时高频（实测 10 件=53 次），已被本补丁合并 |
| P5 | `Reducer_Web_TradeUI.RA_SwitchTabByKey` | prefix+postfix | TradeTabKeyFix.cs:61 | 低频（A/D 按键） |
| P6 | `ItemManager.StartBattle` | prefix | SizeGuardHook.cs:41 | 一次性（读档），但 prefix 内做全量重扫 |
| P7 | `RefreshRecipeList` / `TryCreateItem` | prefix+postfix×2 | ToolTableProbe.cs:47,57 | 仅 `Debug.Verbose=true` 时安装；工作台打开期间高频 |

无 `PatchAll`，全部手动 Patch + `_installed` 守卫，无重复装载。

### Update / 每帧执行链

- **`AccessTicker.Update`**（CabinetEverywherePlugin.cs:358）每帧串行执行：`RefreshCoalescer.Flush` → `RailUi.FastPoll`（内含 SizeGuardFrame、命令 Pump、**每帧 drain IPC**、结构快检）→ `RailUi.GlistKeyboardTick`（门开期间每帧 `SetKeyboardEnabled(true)`）→ `TabInjector.FastPoll`（4×IsUIActive）→ `TabGate.FastPoll`（5×IsUIActive，开页后 20 帧短窗内跑全量 poll）→ `DrawerTabs.FastPoll`（3×IsUIActive）→ `TradeTabs.FastPoll`（1×IsUIActive）→ `TradeFx.FastPoll` → `Tick(dt)`（0.5s/5s 门闩）。整体包一层 `catch { }`（:383）。
- **`WelcomeTicker.Update`**（WelcomeTip.cs:62）每帧累加 + 0.5s 门，进档后显示一次气泡即空转。

每帧 interop 边界调用量（rail 场景活跃时）：`AnyRailSceneActive` 14×IsUIActive **被调用 2 次**（RailUi.cs:604、619）+ FastPoll 族 13×IsUIActive + StructureChangedFast（1+容器数）×2 次字典读 ≈ **每帧 60~100 次 interop**（容器 30+ 时）。

### 协程 / 定时器 / 线程 / 事件 / DontDestroyOnLoad

- **协程：无**。
- 定时轮询：0.5s（_fastCheck）、5s（_slowCheck）、0.3s（gk 键盘门）、600ms（推送余波节流 _lastPushMs）、2s（RailSortMath 因子缓存）、30s（glist 遥测日志）、每 3 帧（入库进度 PushStoreProg，任务期间）。
- 线程：无自建线程；Vuplex 回调线程进 `RailCommands.Enqueue`（ConcurrentQueue，正确）、`PushAck`（Interlocked，正确）；`OnConsoleMessage` 在回调线程操作**非线程安全的 HashSet `_consoleSeen`**（RailUi.cs:708，推测并发损坏低概率）。
- 事件订阅：`ConfigEntry.SettingChanged`×40+（进程生命周期，无泄漏）；`ConsoleMessageLogged` 只 add 无 remove，且 `_consoleHooked` 永真 → **WebView 崩溃重建后新实例永远不再挂**（功能缺陷，非性能）。
- AddComponent/DontDestroyOnLoad：`CabinetEverywhere.Ticker`（Plugin.cs:260）与 `SurvivalLog.WelcomeTip`（WelcomeTip.cs:34，GameObject.Find 去重）各创建一次，**切场景不会重复创建**。

## B/C/D 风险表（按可疑程度高且验证成本低排序）

| 编号 | 文件:行号 | 风险描述 | 执行频率 | 可疑程度 | 对应症状 | 验证方法 |
|---|---|---|---|---|---|---|
| R1 | RailUi.cs:351-389, 397-407 | **SizeGuard 帧级写回拉锯**：官方异步表重载把包尺寸洗回原生 → mod 当帧写回 + `InvalidateBagSizeIndex` + `RefreshActivePage`（官方 Ra_RefreshBag 整页重建）+ ForceRepublish。若官方周期性洗表，则**每帧写回+每帧官方整页重建** | 洗表期间每帧 | 高（与两个症状均吻合） | 卡顿+掉帧；界面变形/错位（网格尺寸反复伸缩） | 日志 grep `SizeGuard：官方表重载`（60s 节流，出现即实锤）；再看其相邻时间戳密度 |
| R2 | CabinetEverywherePlugin.cs:383 及全线 try/catch | **静默吞异常风暴**：Update 及各 FastPoll 大量空 catch。任一 interop 调用（GetStateByUI/TryCast/IsUIActive 等）若稳定抛异常，每帧构造+捕获数十次——IL2CPP 异常单次开销远高于 Mono（数百 μs 级），且零日志=完全不可见 | 每帧（若被触发） | 高（推测，但与「不知道原因」形态吻合） | 持续卡顿掉帧 | 临时在每个空 catch 加计数器打点；或 IL2CPP 下用 `--enable-console` 看首帧异常后统计；最快的验证：注释 Update 内逐段调用做二分 |
| R3 | RailUi.cs:604-618 | **每帧 drain IPC**：rail 场景活跃时每帧向 WebView2 发 `ExecuteJavaScript("window.__CERAIL__&&...drain()")`。WebView2 ExecuteJavaScript 是跨进程 COM IPC，60 次/s 持续唤醒浏览器进程 | 每帧（场景打开时） | 高 | 开任一容器界面即卡、关界面缓解 | 临时跳过 FastPoll 内 drain（保留 0.5s Tick 路）对比帧率；CDP 观察脚本执行频率 |
| R4 | TradeTabKeyFix.cs:64, 81-82 | **补丁挂在极高频方法**：`HotKeyManager.Update` prefix 每帧走 HarmonyX detour（IL2CPP 跳板+`__instance` 封送）+ 2 次 `Input.GetKeyDown` interop。官方已修复该 bug 时补丁仍在空转 | 每帧 | 中高 | 全局帧率下降（与界面开关无关） | `harmony.Unpatch` 该补丁对比帧率；游戏版本≥修复版可直接验证 |
| R5 | RailUi.cs:895, 1012-1028 | **键盘门拉锯**：Dye/Heater/篮子等页打开期间每帧 `SetKeyboardEnabled(true)`（interop+过 P2 跳板），postfix 再读 getter；若官方每帧压关则形成每帧 2-3 次往返振荡 | 每帧（相关页打开时） | 中高（推测） | 相关界面打开时卡顿 | 日志看「glist 键盘标志位采样=」翻转频率（每 0.3s 一行，频繁翻转=振荡实锤）；对比开/关染料桶页帧率 |
| R6 | RailData.cs:444-656, 958-1021; RailSortMath.cs:442 | **BuildJson 全量重推**：33 容器×数百物品行，每行 ~30 次 interop 属性读（含 RailSortMath.Of）+130KB StringBuilder+大量临时分配（GC），分片后 ~18 次 IPC；JS 侧同相位全量渲染。600ms 节流限制下，物品频繁变化期（整理/腐烂）仍连续触发 | 结构变化时（≥600ms 间隔） | 中高 | 「一键整理/入库后慢动作数秒」（代码注释已自证此症状） | 日志 grep `快通道重推`（>150ms 常驻打印）与 `命令泵本帧执行`；开 Verbose 看 payload KB |
| R7 | TabGate.cs:692-795; TabInjector.cs:183; DrawerTabs/TradeTabs | **状态数组对账振荡残留风险**：四组件写同一批官方数组+Repush。PollTrade 注释记录过「移出 19 条无限重复+ping 风暴」自持振荡（已修根因，但同构路径仍在：源名单重写↔DrawerTabs 补挂↔TradeTabs 补挂互为对端） | 0.5s（若振荡） | 中 | 交易页打开时周期性卡顿+页签闪烁 | 日志 grep `视图=` `页签已补` `移出` 是否同秒重复出现 |
| R8 | TagFilter.cs:52 | **每 5s 全量重注 JS**：`ExecuteJavaScript(BootstrapJs)` 无条件重发整个 tagfilter.page.js（无 RailUi 那套探针确认后跳过机制），WebView 每 5s 解析执行全文一次；另每 5s `setData` 全标签数据 | 5s | 中 | 常态帧率毛刺（周期性） | 日志时间轴对比卡顿是否 5s 周期；CDP Performance 看 5s 周期脚本 |
| R9 | RailData.cs:94-103, 291-313 | **每帧 interop 扫描**：`AnyRailSceneActive` 每帧被调 2 次（14×IsUIActive×2）+ StructureChangedFast 逐容器 OwnerCache 读；容器多时每帧 ~100 次 interop。单独 <1ms，但与 R2 异常叠加放大 | 每帧 | 中低 | 轻微常态开销 | Unity Profiler 看 `Il2CppInterop`/`RuntimeInvoker` 自时间占比 |
| R10 | RailUi.cs:210-216（SizeEnginePoll 写表）+ DrawerTabs.cs:349 | **UI 变形·尺寸快照失配**：mod 直写 Config_Bag.Size 后，官方页签条目携带的 cols/rows 快照（收集时机早于改写）可能滞后——Trade 页有 FixStaleTradeSizes 自愈，**DroneHub/Cooking 等页无同类自愈**（推测）；SizeGuard 拉锯期间尺寸反复变化直接表现为网格伸缩变形 | 事件性 | 中（对应 D 项） | 界面偶尔变形/错位 | 复现变形时立即看日志有无 R1 告警；切柜对比网格列数 |
| R11 | ToolTableProbe.cs:47,57 | 探针在 `RefreshRecipeList`（高频）前后挂 Stopwatch——若用户 cfg 里 `Verbose=true` 忘关，探针本身成为热点（prefix/postfix×2） | 工作台打开时高频（仅 Verbose=true） | 中低（取决于 cfg） | 工作台卡顿 | 检查 `BepInEx/config/...cfg` 中 `Verbose` 是否为 true；日志有无 `[CE.探针]` 行 |
| R12 | RailUi.cs:929,946-961 | **常驻遥测日志**：glist 键盘门未开期间每 30s 打 1-3 行 LogWarning（含 PageMap 全键倾倒）；SizeEnginePoll 每 5s 一行 LogInfo 常驻。控制台开启时写终端+文件 | 30s/5s | 低 | 控制台开着时轻微 IO | 对比关闭 BepInEx 控制台前后帧率 |
| R13 | TabInjector.cs:393; TabGate.cs:186 | `LoadOrders/LoadFilters` 每调用做 `File.Exists`+`GetLastWriteTimeUtc`（打开文件句柄的 syscall）；ApplyOrder 调用点 ~9 处×各页 | ~20 次 syscall/0.5s | 低 | 无感 | Process Monitor 过滤 cerail_*.json 的元数据查询频率 |
| R14 | SizeGuardHook.cs:54-65; RefreshCoalescer.cs:70 | 读档瞬间 prefix 全量重扫（RebuildConfigIds+RefreshHomeInstances+SizeEnginePoll 同步）；Flush 用反射 `_send.Invoke`（IL2CPP 反射调用较贵） | 事件性 | 低 | 读档瞬间卡一下 | 日志时间轴对照读档卡顿点 |
| R15 | RailUi.cs:673-713 | `ConsoleMessageLogged` 只 add 无 remove + 回调线程操作非线程安全 HashSet | 事件性 | 低（推测） | 无直接症状 | 无需优先处理 |

## 结论要点

1. **优先查 R1/R2/R3**：R1 一条 grep 命令验证；R3 是架构上唯一的每帧跨进程 IPC；R2 是唯一能解释「完全不知道原因」的隐形热点。
2. 每帧固定成本结构：`AccessTicker.Update` 链 + P1/P2 两个跳板 + 60~100 次 interop，在无异常、无拉锯时约 0.3~0.8ms/帧——不足以单独解释「严重卡顿」，**卡顿大概率来自叠加态**（拉锯/振荡/异常风暴/大包推送）。
3. UI 变形最可能与 R1（尺寸反复改写）和 R10（cols/rows 快照失配）相关，均为本 mod 直写 `Config_Bag.Size` 这同一机制的衍生。
4. 队列/线程纪律（ConcurrentQueue、Interlocked、委托缓存、白名单遍历）整体做得规范；无明显资源泄漏（无 `.material`/`new Texture2D`）；无每帧 `Config.Save`。

## 静态验证结果（2026-11-13，日志 = LogOutput.log，会话 2026-11-12 19:46 ~ 23:34 约 4 小时）

### 证实

| 编号 | 证据 |
|---|---|
| **R11 实锤** | cfg `Verbose = true`。后果三条全部成立：① ToolTableProbe 已安装（日志 :311 `[CE.探针] 已挂`）——RefreshRecipeList/TryCreateItem 双补丁常驻工作台路径；② BagBurden.SlowTick 每 5s 刷 ~19 行「BAG xx 负重 xx（原 xx，已达标）」，全程 **26,013 行 / 共 28,076 行（93%）**、3.2MB 日志，从 :1604 贯穿到 :28075；③ Verbose 推送日志 33 次（每次附 head 200 字符）+ 命令 VLog |
| R6 部分证实 | 快通道重推 17 次，单次 19~61ms、payload 102~103KB；tidy：官方 sort API 178ms + JS 侧合计 398ms（:1966-1971）——「一键整理卡顿 0.4s 级」真实存在，但未到秒级慢动作（600ms 节流生效） |
| R12（控制台） | BepInEx.cfg `[Logging.Console] Enabled = false`——控制台本来就是关的，用户无法对比；文件日志仍以 ~20 行/5s 持续写盘 |

### 排除（本会话）

| 编号 | 证据 |
|---|---|
| R1 SizeGuard 拉锯 | 全程 0 次「官方表重载…洗回原生」告警（仅 2 行补丁安装/读档抢写日志） |
| R7 页签对账振荡 | `视图=` / `移出` / `容器名单已补` / `抽屉页签已补` / `页签序重排` 全部 0 次 |
| 本 mod 异常 | 全日志仅 1 条 Exception，属于另一 mod（PreDisasterSpeed）的 HarmonyX 安装失败（一次性，非运行时）；本 mod 零异常记录 |

### 未触发 / 待运行游戏验证

- **R5 键盘门拉锯**：本会话门从未开过（`门开`/`门关`/`标志位采样`/`守卫拦截` 均 0 次）——需要打开染料桶/暖炉/篮子页才有数据；门未开期间每 30s 打 3 行遥测 Warning（59 轮/178 行，常驻噪声）。
- R2 吞异常风暴：空 catch 吞掉的异常不会进日志，日志干净 ≠ 不存在，仍需插桩验证。
- R3 每帧 drain IPC、R4 HotKeyManager.Update 跳板：需 A/B 对比。
- R10 UI 变形：需复现现场 + 当时日志。

### 下一步优先级

1. cfg 改 `Verbose = false` 重启对比帧率（零成本，可能直接解决探针+刷屏两项）。
2. 仍卡 → 按注释 FastPoll 内 drain（R3）做 A/B → Update 链二分（R2）→ Unpatch TradeTabKeyFix（R4）。

## 第 1 轮基线结果（2026-11-13，Verbose=false + 开关全默认 + 新 dll，~15.6 分钟 / 94 窗口）

| 指标 | 结果 | 结论 |
|---|---|---|
| FPS | 除加载窗外全程 **59.7~59.9**（vsync 锁 60） | 满帧 |
| 慢帧 | >50ms 每分钟 0~2 个偶发（50~94ms），**>100ms 全程为 0**（除加载窗） | 无掉帧 |
| 吞异常（本 mod 22 处高频打点） | **全程为 0** | **R2 对本 mod 排除**；常态底噪（SizeGuardFrame 等）实测不构成掉帧 |
| first-chance 异常 | 加载窗一次性 IOException×492/ArgumentException×269（正常）；稳态**恒定 60 次/10s Il2CppException（≈每帧 1 次）** | 来源不在本 mod 已打点路径（吞异常=0 为证）——其他 mod 或游戏自身；满帧说明开销未超帧预算，暂不追 |
| 场景覆盖 | 日志无任何界面打开痕迹（无页签注入/开台登记/交易页活动/整理命令；glist 遥测全程“门未开”） | **只验证了进档+挂机底噪，界面场景（R3/R5）未覆盖** |

判定：关 Verbose + 新 dll 后底噪完全健康；R11 主因地位强化。需补一轮“真开界面”的基线（cfg 不变）：背包/柜子、工作台、交易页各开+挂 2 分钟——若仍满帧且主观不卡 → 结案（主因=R11），A/B 全关轮免做。

## 实时卡顿定位（2026-11-13 晚，用户正常游玩触发：多次拾取地面物品+一键入库+存取物品）

现场数据（卡顿帧行全部落在 BackpackUI + rail=On）：907/5649/1947/708/682/577/460/411/402/392ms 巨帧串 + 100-300ms 密集帧；相应窗口 FPS 跌至 10.3。关界面后恢复 59.9。三层根因：

### 层 1（主犯）：单帧大搬运——官方 API 平方广播（R6 的真身，agent 核算+现场双证）

- `take/put`（all:true）、`takeAll/putAll`（TryMoveBagAll）、`takeCat/putCat/putTag`、**地面全部拾取（RailGround.TakeAllToBag 逐件 TryPickupItem）**——全部是“一条命令、一帧内、几百件”单调用。官方 TryQuickMoveItems/TryPickupItem 逐件 Notify 广播×订阅者=平方成本（代码注释自证 157 件=3.6s；本次 5649ms 同量级）。
- storeAll 已分帧（所以入库执行帧只有 ~13ms），但**收尾帧三合一**：FinishStoreTask 同帧做 官方整页刷新(RefreshActivePage) + BuildJson 130KB(~2.5 万 interop) + 19 片下发——现场 411/402/392ms 帧与“入库=On”吻合。
- storeAll 残余全扫描帧：柜全饱和/无匹配时 600 叠×33 柜 Matches=1.98 万次官方调用（20-200ms）。
- **附带 bug**：JS 下发的 order 含地面 owner=-101，被白名单拒绝并打 8 次 LogWarning（应剔除）。

### 层 2（从犯）：WebView/JS 侧每 0.5s 全量重绘（agent 静态审查）

- railui.page.js:5676 setData→render() **无内容签名门**：每包（100-160KB）全量过滤+排序+列表模式整表 innerHTML 重建（2462-2488）；:2426 写后读 clientHeight+再写 innerHTML=**每拍两次强制同步布局**。
- TradeFx：:6193 MutationObserver 含 characterData+subtree 观察整帧 body，打字机动画期间 rAF 近每帧跑 tfxApply 四链；与 :6269 的 500ms 兜底叠加（交易页动画期掉帧）。
- 角标层 makeBadgeLayer（:2076-2121）逐格读 offsetWidth/offsetParent 链，三路驱动（render/500ms 节拍器/官方重渲染 MO）。
- 监听器无泄漏（__srBound 等幂等门齐全）；CSS 无动画热点。

### 层 3（外部背景）：其他 mod（agent 日志分析）

- **EndlessGuard**：重度会话持续 9~33 行/min 写盘（7.9MB 中 70%=无信息心跳），且**每 1-10 秒抛一次 GetFloorGroup NullReferenceException+完整堆栈落盘（299 次，游戏线程）**——独立周期性卡顿源。
- RU_gate：每次启动 dump 1600 行（拖慢加载）。
- 每秒 6 次 Il2CppException 样本堆栈仅 interop 一帧（Il2CppInterop.Runtime.Il2CppException.RaiseExceptionIfNecessary），native 侧来源未定位——嫌疑指向某个 mod 的周期 interop 调用失败（EndlessGuard registry 周期吻合但类型不符，存疑）。
- 历史残留：11-12 曾有 3 个游戏进程+3 个 unkillable crashpad_handler 残留（多实例抢资源）。

### 修复方案（待拍板，按收益排序）

1. **搬运命令分帧化**（治层 1 主犯）：take/put/takeAll/putAll/takeCat/putCat/putTag/地面全拾取 复用 StoreAllTask 跨帧机制（12 件/帧）；地面 TakeAllToBag 同样分帧。
2. **storeAll 收尾帧拆开**：收尾后仍闸 PushIfDue 一个周期，官方刷新与 BuildJson 分帧落地；order 预剔 -101。
3. **JS render 加内容签名门**（治层 2）：数据未变跳过全量管线；修 2426 读写交织。
4. EndlessGuard：建议用户侧关闭/更新（非本项目代码）。

## 修复方案设计（2026-11-13 晚定稿，作者参与决策）

> 病灶共识：官方搬运 API（TryQuickMoveItems/TryMoveBagAll/TryPickupItem）**每搬一件广播一次通知，订阅者全量响应**——N 件×全量响应=平方成本。mod 扩容（背包 12×50、柜子加宽加高）把单次批量从几十件放大到几百件，官方原生按钮（全部拾取/全部放入）与 mod 批量命令同样中招（2026-11-13 实测 5649ms 巨帧，官方路径，mod 队列=0 为证）。

### 方案 A（首选·根治）：广播汇总（coalesce，非屏蔽）

**原则（作者定调）**：不是全部屏蔽——订阅者该知道的事最终都要知道；把 N 次通知**汇总成完成时有限次数的反馈**（一次或按类型几次），不能无限放大次数。

**机制**：
1. 反汇编取证：官方通知广播入口（候选：ItemManager.NotifyGlobal(int,…) / OnQuickMoveItem(s) 事件；storeAll 注释实证"每叠触发一轮官方 OnQuickMoveItem(s) 事件广播"）、NotifyGlobal(3049) 先例存在；
2. Harmony prefix 在批量任务期间置静默标志：拦截广播入口，**不丢弃**——记录"哪些类型的通知发生过"（去重集合），原方法跳过；
3. 任务收尾：复位标志，按去重后的通知类型各补发一次（或走官方统一刷新动作 Ra_RefreshBag 族 + mod ForceRepublish——收尾帧拆开后分帧落地，见方案 C）；
4. 对官方原生按钮（全部拾取/全部放入）同样生效——在官方批量 API（TryMoveBagAll 等）外包一层静默窗口（prefix 置位/postfix 复位+汇总补发），无需拦按钮本身（原 1b 拦按钮方案作废）。

**收益**：平方→线性。1000 件≈5.6s → 纯搬运几百 ms；叠轻分帧可到每帧几 ms、总 <0.5s 全程无感。

**风险与前置取证（不做完不动手）**：
- R-A1 **订阅者清单与语义**（作者补充的关键风险）：收到广播后各方到底做什么？必须逐个确认——纯 UI/Redux 推送类（延迟无害，先例：RefreshCoalescer 拦刷新风暴已安全运行）✅可汇总；**存档脏标记/任务计数/腐烂推进等状态累积类**（依赖"每件必达"或带次序语义）⚠️不可吞——需改用"转发末次"或排除在汇总窗外；
- R-A2 静默窗口内官方单件搬运 API 自洽性（广播与搬运逻辑是否耦合，如广播内同步计算）；
- R-A3 静默窗口异常中断（异常路径必须 finally 复位+补发，防永久静默=界面死寂）；
- R-A4 多入口竞态：官方按钮与 mod 命令同时进入批量（静默计数器化，引用计数归零才补发）。

### 方案 B（备选·治标）：分帧化

若 A 取证失败（存在不可汇总的订阅者）。机制：批量操作拆成每帧 ≤12 件的跨帧任务（复用 StoreAllTask 成熟机制：快照+每帧校验+件数差量结算+进度推送）。
- 覆盖：mod 命令全族（take/put/takeAll/putAll/takeCat/putCat/putTag/地面全拾）；官方按钮仍需 A 或 1b；
- 并发防护（作者关切）：帧预算自适应（上帧超时本帧少搬）+ 任务互斥（同时一个搬运任务）+ 玩家并发操作正常响应（对比原形态：5.6s 冻结期间玩家操作同样被堵死在同帧队列，并非"不打扰"）；
- 已知边界：地面拾取分帧期间玩家走远→官方距离校验拒收→失败即停+提示（柜内搬运无此问题）；
- 体验：从"冻结 N 秒"变"流畅渐进 2~3 秒"。

### 方案 C（无论 A/B 都做）：收尾帧拆开 + 小修

- storeAll FinishStoreTask 收尾帧三合一（官方整页刷新+BuildJson 130KB+19 片下发同帧）拆开：收尾后仍闸 PushIfDue 一周期；
- JS storeAll order 剔除地面 owner=-101（实测 8 次白名单拒绝警告）；
- （独立）JS 侧 render 内容签名门：数据指纹未变跳过全量重绘+双强制布局（治开界面周期顿挫，railui.page.js:5676/:2426）。

### 执行顺序（作者裁定）

A 取证 → A 实施 → 复测；A 不可行则 B（+C 始终随行）。取证产出：广播入口清单、订阅者语义表、可汇总性结论。

## 方案 A 取证结论（2026-11-13 深夜，双智能体：方法体反汇编 + 订阅者语义普查）

### 病灶精确解剖（反汇编实证，RVA 可复验）

- **平方风暴真身=3031 SyncBagItems**：每搬 1 件，官方把源+目标两包**全部物品** ToDto 成整列表广播（`SyncBothBags` 0x27AB8D0 → NotifyGlobal 4 参版）。N 件=N 次双包全量序列化+订阅者整包响应。
- 逐件轻通知：3002 AddOrNotifyItem、3005 DelItem（每件各 1 次，同栈同步直调）。
- `silent` 参数实证只挡 2020 tip（4 处分支），不挡 3002/3005/3031——mod 传 silent=true 无缓解，此前疑惑解释。
- **官方先例（可行性最强背书）**：`ExecuteMoveBag`（官方"全部存入"内部，0x278AF80）=逐件搬数据+**批末仅 1 次 3031**；`OnQuickMoveItems`（官方批量快移）=逐件 silent=true+批末聚合失败位码（≤3×2020）。官方自己已验证"批末汇总一次"安全。
- 派发机制：EventDispatcher 同栈直调（查表→快照数组→循环 call 委托），无队列无帧调度——**拦 NotifyGlobal 入口按码过滤=单点拦截面**。
- 拾取链（TryPickupItem 0x2728620）：每堆叠轮 3002+3033、1×21001、1~2×14001(音效)、1×2020(飘字)、0~1×3046——**无 3031**，拾取的卡顿源与移动链不同（待 V2 取证）。

### 订阅者语义判定（声明层推断+反汇编佐证）

| 类别 | 通知码 | 订阅者 | 判定 |
|---|---|---|---|
| **可合并**（批末一次=语义等价） | 3031/3027/3002/3005/3030/3061/14005 | LogicAdapter（Redux 链→webui itemsJson **整包替换，天然幂等**）、SearchMarkerManager（QueueRecalculate 自带合批队列）、FmodManager | ✅ 全是整包重算/幂等替换型 |
| **静默且不补发**（搬运≠获得） | 3008/3048/3053/3055 弹窗、3037 未读红点、3024/3044 | LogicAdapter→Ac_Pop_Update / Reducer_Data_BagUnread | ✅ 补发=弹窗/红点风暴，语义上就不该发 |
| **不碰**（命令面=请求管道） | 3026/3047/3054/3017/3038/3029/3015/3016/3052/3001/3003/3051/3032 | ItemManager 自身处理器 | 静默窗口不涉及（mod 直调 API 绕过请求面；拦的只是结果广播） |
| 不受影响 | 存档（无事件驱动脏标记，集中式全量序列化）、成就（28007 间接计数）、RobotSorting（主动扫描）、ReduxUISystem（ReduxSubscribeLayer 已有帧级合并） | — | ✅ |
| **不确定（V1 不拦即零风险）** | FoodPollutionManager.OnItemPlacementChanged / DynamicEventManager.OnFurnitureBagChanged / BattleLogicWorld 两 lambda 的具体订阅码与粒度 | — | V2 扩拦前需反汇编确认 |

### 方案 A 最终设计（V1 最小拦截面）

1. **V1 只静默 3031**（占绝对大头；3002/3005 便宜且 SearchMarker 自带合批，不拦=不确定项零风险）：
   - Harmony patch `EventDispatcherTools.NotifyGlobal` 泛型入口（或 SyncBothBags 调用点）：静默窗口内 3031 被拦下并**记录 (from,to) 对**（不丢弃语义）；
   - 窗口收尾：对每个 (from,to) 补发一次官方等价汇总——复用 mod 已有收尾链（RefreshActivePage=官方按数据重建 state+推送 + RailData.ForceRepublish），与官方 ExecuteMoveBag 批末一次 3031 同构；
   - 窗口开关：mod 命令前 try/finally；官方批量入口（OnQuickMoveItems/ExecuteMoveBag 族 6 个）prefix/postfix 包窗；**引用计数**防嵌套/并发（R-A4）；异常路径 finally 复位+补发（R-A3）。
2. V2（V1 实测后按需）：拾取链反汇编补证（批量拾取的重量级源=逐件 2020 飘字/3002 处理链/GroundDock 逐件请求？）→ 拾取窗静默 2020/14001/21001+批末汇总；3002/3005 拦截前先完成不确定项反汇编。
3. A 落地后残余=线性搬运成本（估计 600 件 60~300ms 单帧）→ **叠加轻分帧（方案 B 简化版）**：官方路径不可分帧（不能拆官方方法体），但 600 件在静默后若实测 <100ms 可接受；mod 命令路径分帧照做。

### 方案 A 边界（诚实声明）

- **作者质疑（2026-11-13 深夜，关键修正）**：官方"全部存入/全部取出"批末本来就只发一次 3031，但实测照样卡 5.6s——**3031 重复只是平方源之一，官方路径另有未压掉的平方源**。两大嫌疑：①3002/3005 逐件通知的订阅者响应若为"整包级重算"则自成平方；②每件找位/找堆叠扫描×扩容大包（96 格→600 格，单件找位成本×6，几百件累计平方级，与广播无关）。已派专向取证：解剖 ExecuteMoveBag 每件成本公式 + LogicAdapter 3002/3005 处理器方法体 + 不确定订阅者注册码。**取证结果直接决定 V1 拦截面**（若订阅者响应是主因→拦 3002+3005+3031 批末补 3031；若找位扫描是主因→广播拦截治不了官方按钮，官方路径残余靠引导 mod 分帧操作兜底）。
- 官方按钮路径在静默后仍有单帧线性成本（估计几百件≈百余 ms 级，待实测）；要完全无感需官方路径也能分帧——不可行（官方方法体不可拆），属物理边界。
- 拾取链卡顿 V1 **不覆盖**（无 3031），用户"多次拾取很卡"的主诉之一需 V2。
- 泛型 NotifyGlobal 的 Harmony patch 在 IL2CPP 下的实例化覆盖（<long> / <long,long,object,object> 等多参版）需逐个验证拦全。

## 拆账终审（2026-11-13 深夜补证，官方全部存入 5.6s 的成本构成）

**作者之问的完整答案**：官方压掉了 3031 的批内重复，但 3002/3005 逐件通知的订阅者链**没有帧级合并且是同步直调**——"合并"只存在于订阅推送层（ReduxSubscribeLayer），RefreshBag 走 SendAction→reducer 立即执行路径。

| # | 成本项（反汇编实证） | 复杂度 | 占比估 |
|---|---|---|---|
| **1（主犯）** | 每件 3002/3005 → LogicAdapter(0x2A77620/0x2A77B30) → **同步** Ac_Item_*::SendAction → RA_AddOrNotify→**UpdateBag**(0x2AD8D20：GetItemDataList O(M) + 17×IsUIActive + 活跃 UI 各派 Ac_*_RefreshBag) → **RefreshItems_B→BuildBagJson**(0x2AFBE30，1164 条指令：每件物品 40+ 重调用=配置查询/本地化/EscapeJson/20+ Append)——**每搬一件=把打开的界面整包 JSON 重建一遍** | N × O(总物品×40 重调用) | **65-80%** |
| 2 | 每件找位：FindStackableItem(0x278F8A0 线性扫目标包全物品) + 新位三件套（List 整包拷贝 O(M)+BagPacker bool[W,H] 网格重建+FindBestPosition O(WH)）；物资架另加 ScanRackRows/CompactRackRows/OnMaterialRackItemLeft(每件 3027) | N×O(M_dst)≈N²/2 纯内存 | 10-20% |
| 3 | 家具目标：AddItemToOwnerCache→直调 DynamicEventManager.OnFurnitureBagChanged（含 LogWarning 字符串 Format）+RefreshFurnitureBagSlotState 每件 O(M) | N×O(M+E) | 5-10% |
| 4 | 线性杂项（ToDto/Increase/Decrease/SearchMarker O(1) 去重/SmartRecommend 4 指令置脏/批末 SyncBothBags/GC） | O(N) | ~5% |

**不确定项全部落定（字节级注册扫描）**：FoodPollutionManager 只订 3041/3043（食物污染域）——不在搬运路径零风险；DynamicEventManager **不订**搬运码（其进入路径是 ItemManager 内部函数直调，不受通知拦截影响）；BattleLogicWorld lambda=4 指令置脏计时器排除；SearchMarkerManager=队列去重 O(1) 排除。

### V1 拦截面终审定案

**拦 3002+3005+3031 三码**（主犯在 3002/3005 的订阅者链，只拦 3031 不够）；批量期间攒 (from,to) 集合，收尾每对补发一次 3031（整包 DTO→Redux SyncBagItems reducer 一次重建=状态追平，正是作者"汇总反馈"语义）。预期：主犯全消，残余 #2/#3（无字符串放大）估 **<50-100ms（原 5.6s 的 1-2%）**；物资架目标的每件 3027 订阅者响应亦随拦截消失。mod 命令路径再配轻分帧=完全无感。

| # | 事项 | 状态 |
|---|---|---|
| L1 | EndlessGuard 已由用户暂停（2026-11-13 晚）。遗留：该 mod 每 1~10s 抛 GetFloorGroup NRE+完整堆栈落盘（游戏线程，299 次历史）、重度会话 9~33 行/min 心跳写盘（7.9MB）——后续需反馈给该 mod 作者或用户侧永久处理 | 待办 |
| L2 | 每秒 6 次 Il2CppException 来源未定位（堆栈仅 Il2CppInterop.Runtime.Il2CppException.RaiseExceptionIfNecessary 一帧）——下次会话验证：EndlessGuard 暂停后该计数若归零则实锤归它；否则另查（嫌疑=某 mod 周期 interop 调用失败被吞） | 待办（下次日志验证） |
| L3 | 2026-11-12 曾发现 3 个残留游戏进程+3 个 unkillable crashpad_handler（hang-capture-1112-004853.txt）——多实例抢资源风险，遇不明卡顿时先查残留进程 | 已知风险 |
| L4 | UI 偶发变形/错位（R10：官方页签 cols/rows 快照失配）不在本次修复范围——方案 3 缓解整表重建型闪烁，尺寸快照型变形若复现单独修 | 待办（复现再修） |
| L5 | 内存累积专项结论（子智能体，全部 27 文件通读）：**高风险**=ComputeSig/SigOwner 每 0.5s 全量物品枚举（封送 wrapper ∝ 物品总数，仓储玩法下单调增长）+ BuildJson 130KB 主串/分片串（>85KB 进 LOH，碎片+Gen2 压力）——只限频率不限单次规模，对应"越玩越卡"型风险；**中**=TagCtx.Build 无缓存（每 0.5s 3-5 处重建）、每 5s 重注 64KB JS、每帧 drain+每帧 new List、`_namesWorld` 强持旧 BattleLogicWorld 整对象图（换档后钉住到下次进档）；低=Warned 动态 key/_vouched 等异常路径无界集合（量级小）。结构性修复方向：签名扫描增量缓存或降频、缓存 TagCtx、_namesWorld 换档清理——**属后续优化项，非本次卡顿主因** | 已结论 |

## 常态底噪成本（2026-11-13 二次分析：零症状时也在烧）

> 修正：上节「R1/R7 排除」仅指**病态路径**（拉锯/振荡）未发生。「R1 写回 0 次」有日志铁证——SizeGuard 首次写回必打告警（`_sizeGuardLastLog` 初始 0，`now-0 ≥ 60` 恒真），全程 0 条 = 写回路径从未执行。**但检查路径本身每帧全量运行**，且代码注释的成本估算（「~30 包×2 次 int 读，interop 开销可忽略」）严重低估——实测口径见下。用户指正正确。

### 实测规模（来自日志）

AllContainers=29、HomeInstances=21、SizeEngine 宽度目标=32 包（`_appliedSize` ≈ 32 条）。

### 每帧固定成本（AccessTicker.Update，与是否开界面无关）

| 路径 | 位置 | 每帧 interop 调用 | 每帧堆分配 | 备注 |
|---|---|---|---|---|
| **SizeGuardFrame** | RailUi.cs:351-389，FastPoll 首行，**无场景门** | Cm(2)+BagDict(1)+Count(1) + 32×(TryGetValue+Size+Count+`size[0]`) ≈ **132 次** | **32 个 Il2CppList 包装**（`bag.Size` 每次 get 新建包装）+1 个 `new List<string>()` | 稳态短路只省 `size[1]`；60fps = ~7900 调用/s + ~2000 分配/s，全进 Gen0 GC |
| IsUIActive 扫描 | TabInjector(4)+TabGate(5)+DrawerTabs(3)+TradeTabs(1) FastPoll | **13 次** | 0 | 场景关着也跑 |
| GlistKeyboardTick 求值 | RailUi.cs:887，0.3s 节流 | 折算 ~7 次/帧（每 0.3s 最多 21 次 IsPageActive） | 少量 | 门未开时 21 键全查 |
| **合计（场景关闭闲逛）** | | **~150 次/帧（9000 次/s）** | **~33 个/帧** | 「只装 mod 也卡」的底噪候选 |
| +AnyRailSceneActive×2（14×2）+StructureChangedFast（29×2+杂） | 场景打开时 | 再 +92 | 少量 | 合计 **~240 次/帧（14000 次/s）** |

### 每 0.5s 轮询成本（各 Poll，场景打开时）

| 路径 | 位置 | 成本 | 备注 |
|---|---|---|---|
| **TagCtx.Build() 重复重建** | TabGate.cs:66（TabInjector 各活跃页 / TabGate.PollTrade·PollDroneHub / TradeTabs.Ensure / ToolTablePruner.TagContext.Build 同构另算一份） | 每次 foreach Il2Cpp 字典 33 项：枚举 33 + 属性读 ~132 + **IconKey 的 Il2CppString→string 隐式转换分配 33 个** ≈ 170 interop/次；最多 4-5 次/0.5s | **无缓存**，标签库运行期不变；开页 FastPoll 短窗（20 帧）内**每帧每页重建一遍** |
| FindContainer 线性扫描 | TabGate.cs:162（被 Judge 调用） | TradeTabs.Ensure：foreach HomeInstances(21)×Judge→FindContainer 扫 29 = ~609 次比较/轮；PollDroneHub want 判定同构 | O(N²)，托管侧比较尚廉价，量大时放大 |
| LoadOrders/LoadFilters mtime | TabInjector.cs:393; TabGate.cs:186 | File.Exists+GetLastWriteTimeUtc ≈ 20 次 syscall/0.5s | |
| CollectOwners/快照对账 | TabInjector.cs:308; TabGate.cs:476-516 | 遍历 tabs 每条 OwnerId?.Value 2 interop；28 页签 ≈ 56 interop×页数 | |

### 常态底噪结论

- SizeGuardFrame 是**最大的无条件每帧成本**（132 interop + 33 分配/帧），且不依赖任何界面打开；「每帧读 32 包尺寸做比对」确凿成立，「每帧写回」不成立（0 次告警铁证）。
- TagCtx.Build 是**最大的重复计算**：同构上下文每 0.5s 重建 4-5 份、开页短窗内每帧重建，全因「标签库极小，每轮重建」的设计假设忽略了 interop 边界成本（实际每次 170 调用+33 string 分配，不是零）。
- 优化方向（待批准后实施，此处仅记录）：SizeGuardFrame 读检查降频（200ms 一轮仍远快于洗表窗口）或缓存 Size 引用/只查签名变化的包；TagCtx 按 Config_FurnitureTag_Dict 引用+签名缓存（5s 失效）；FindContainer 换 Dictionary 索引。
