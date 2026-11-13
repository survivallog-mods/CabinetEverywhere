# CabinetEverywhere 性能只读分析报告

分析日期：2026-11-13 · 范围：全部 28 个源文件（约 11600 行）· 环境：BepInEx 6 IL2CPP + HarmonyX + Vuplex WebView2

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
