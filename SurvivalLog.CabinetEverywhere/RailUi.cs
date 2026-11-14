using System;
using System.Collections.Generic;
using SurvivalLog.ModShared;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// CERail 推送通道（T6 数据推 + T7 命令通道 + T8 bootstrap 注入与 cfg 门）。RailUi.Tick 挂在
/// AccessTicker 0.5s 快通道（TabInjector.PollAll 之后）。
///
/// cfg 门（T8）：[Rail] Enable=false → Tick 首行 return——bootstrap 注入/数据推送/drain/Pump
/// 四路全停（数据推/drain/Pump 都在 Tick 内，先判门）；已注入界面的存量 rail 随界面重开由
/// 原生重建清除（与 Filter/TagFilter 同策略，不主动清）。
///
/// bootstrap 注入（T8，TagFilter 幂等注入模式同款）：探活确认存活前每周期执行
///   window.__CERAIL__||(function(){ railui.page.js 全文; window.__CERAIL_CSS__="railui.css 全文"; })()
/// ——JS 与 CSS 两个 EmbeddedResource 静态拼一次缓存（勿每 tick 重拼）；幂等由外层守卫 +
/// railui.page.js IIFE 顶部 `if (window.__CERAIL__) return;` 双重保证；探活确认存活且 WebView
/// 实例未变后跳过注入（终审 Minor-3，约 86KB 表达式不再每 tick 重派）；WebView 崩溃重建后
/// Root 文档重载 → __CERAIL__ 消失 → 下周期自动重注。CSS 文本经 __CERAIL_CSS__ 随行进
/// Root 文档，由 railui.page.js 装配区按 iframe 文档逐个注入 style#srpRail（rail DOM 在
/// iframe 文档，Root 文档样式管不到 iframe——单资源方案的消费点在 JS 侧 injectRailStyle）。
///
/// 注入成功确认与 ForceRepublish（T8 裁定 1，T6 缺口修补）：WebView 重建后 rev 未变不重推的
/// 缺口在此补——每周期对「未确认存活」的 WebView 发探测表达式
/// `window.__CERAIL__?1:0`（带 DelegateSupport 回调，TagFilter.Probe 先例）；回调收到 1 即
/// 「__CERAIL__ 从无到有」→ RailData.ForceRepublish() 强制下一周期重推一包。WebView 实例
/// 引用变化（重建）即复位确认态重新探测；确认后不再发探测（常态零额外开销）。
///
/// 推送门控（计划 Step 3，不变）：
///   ① 当前无 rail 场景（12 页 IsUIActive 全否）→ 不推（RailData.AnyRailSceneActive）；
///   ② rev 未变（RailData.ItemsDirty 签名：容器/物品/背包 owner/rackOwner/页签场景）且
///      ctx.page 未切换 → 不推；
///   ③ 数据初值/容器 0 个照常可推（JS 空态已就绪，T6 裁定 4）。
/// 推送 = WebUILayer.canvasWebViewPrefab.WebView.ExecuteJavaScript 直推
/// window.__CERAIL__.setData(json)（__CERAIL__ 未注入时表达式空转，无害）。
/// json 由 RailData.BuildJson 紧凑拼装（EscapeJs 转义全部字符串字段）。
///
/// 命令通道（T7，红线1：ExecuteJavaScript 回调内禁止改游戏数据）：
///   ① 场景活动时发 drain()（带 DelegateSupport 回调，TagFilter.Probe 先例）——回调
///      （Vuplex 线程，时序不确定）只解析 JSON 入 RailCommands._pending（ConcurrentQueue）；
///   ② Pump 在 Tick 开头（场景门控之前——点完即关界面的存量命令也要执行）主帧串行执行，
///      每帧 ≤8 条（红线6），批量末尾统一 ForceRepublish 一次；cfg 门在 Tick 首行，停用即连
///      Pump 一并停（队列不再进新命令——rail 已不存在，存量留到重开后执行）；
///   ③ _pending 积压 ≥ RailCommands.MaxQueued 抑流（本周期不发 drain，防页面失控刷队列）。
/// </summary>
internal static class RailUi
{
    private static string _lastPage;               // 上次推送的 ctx.page（场景切换即重推）
    private static Il2CppSystem.Action<string> _drainCb; // drain 回调（DelegateSupport 包装，仅主帧创建一次）
    private static readonly HashSet<string> Warned = new();

    // ---- T8 bootstrap 状态 ----
    private static string _bootstrap;                    // JS+CSS 拼装缓存（静态一次，勿每 tick 重拼）
    private static bool _bootstrapLive;                  // 已探测到 __CERAIL__ 存活（本次 WebView 生命周期内）
    private static int _probeState;                      // 0=等待探针回包/未知 1=最近一探明确 absent（许可注入一剂）
    private static Il2CppSystem.Action<string> _probeCb; // 探活回调（仅主帧创建一次）
    private static Il2CppSystem.Action<string> _pushAckCb; // v1.8.10 十三批六追：推送空回调（单参 ExecuteJavaScript 在本机 Vuplex 组合下静默丢弃，见 PushIfDue 注释）
    // ---- v1.8.10 八追：推送回执账本（断流可见化）----
    // 回调达=该条 ExecuteJavaScript 已在页面执行（微包与大包共用同一回调对象，故账本按
    // 「条」计不按「包」计）；Vuplex 回调线程不确定 → Interlocked。缺口=已发未回执。
    private static long _pushSent, _pushAcked;
    private static long _pushPid; // 八追九点修订：分片推送实例号（单调递增，JS 按 pid 弃旧包迟到片）
    private static long _lastAckAt, _lastWatchdogLog; // 秒制（UtcNow.Ticks/1e7）
    private static bool _watchdogTripped;
    private static void PushAck(string _)
    { /* 回调体零动作红线不动，仅计数（命名方法=与 drainCb 同款 ConvertDelegate 模式） */
        System.Threading.Interlocked.Increment(ref _pushAcked);
        System.Threading.Interlocked.Exchange(ref _lastAckAt, DateTime.UtcNow.Ticks / TimeSpan.TicksPerSecond);
    }

    // ---- v1.8.8 滚动条诊断（一次性：首个 rail 场景开到后量测并记一行日志，防盲改） ----
    private static bool _diagDone;
    private static int _diagTries;
    private static Il2CppSystem.Action<string> _diagCb;

    /// <summary>cfg [Rail] Enable（T8 裁定 4）：false=不注入/不推数/drain（含 Pump）全停。</summary>
    internal static bool Enabled =>
        CabinetEverywherePlugin.RailEnable == null || CabinetEverywherePlugin.RailEnable.Value;

    // ================= v1.8.4b SizeEngine：柜宽统一（作者 2026-11-01 缺陷#2 拍板 12 列、内建、不依赖套件） =================
    // 政策（v1.8.3「三道门」热修版的接续修订）：
    //   ① 目标=家中柜子子集 HomeInstances 的包（kind=='c' 且入柜名单；冰箱/材料架/材料堆不碰）——不变；
    //   ② 排除=cfg [Access] ExcludeBagIds（包级，作者维护）+ **家中在场**的排除家具
    //     （ExcludeFurnitureIds ∩ AllContainers）所占的包（机器共包守卫：染料桶/自制工具台
    //     的原料槽 UI 嵌包格，改宽即变形——2026-11-01 上午作者实锤；守卫由配置级全家具收窄到
    //     家中在场，场景搜刮件不再连带挡宽）；
    //   ③ 退役 BagTable.DefaultResizeExcludeIds（34 包黑名单=CabinetSize 套件单源）：作者令
    //     「不要依赖其他mod，套件柜子扩容/背包扩容/柜子负重挨个退役，最终只保留这一个」——
    //     黑名单挡住的 通信设备(1062 独占包 8×6)/SUV·购物车(2003) 即本次「有的宽有的窄」
    //     直接根因（Config_Furniture 实查：1062 仅通信设备一家使用；2003=SUV/购物车/纸箱子/
    //     材料堆/自行车共用，家中无排除件即可安全改宽，场景侧共用件随之变宽=配置级宽度固有）。
    //   ④ 白名单 cfg [Rail] SizeIncludeBagIds（2026-11-05 作者复测「无人机中控台宽度不是 12」
    //     拍板）：②的 ExcludeBagIds 挡的是页签/筛选语义（中控台页签常显=不注入不筛选，
    //     2026-10-15 卡死闪烁防线），宽度不该搭车被挡——白名单内的包**包含优先于排除**直接进
    //     目标集（含 AllContainers 之外的功能包，配置级直写：家中未摆放不生效于 UI，与 2003
    //     场景侧共包同口径）。默认 1009 中控台（家具 9080 独占包）；厨房电器/机器槽/门窗床等
    //     槽位语义包不进白名单（改宽即变形）。
    //   ⑤ 抽屉三档包 5010/5012/5013（2026-11-06 作者对齐终案：工作台抽屉=**全局包不挂家具**，
    //     三档 [8×5/8×6/8×7] 升级链，全工作台共享互通；无家具引用/无共包/不在任何黑名单——
    //     宽直进目标集（高/档位不动）。抽屉不是家具→不走 AllContainers，这里显式补入。
    //     （DrawerWidthEngine 换绑方案已退役：备料格≠抽屉的误判产物，见 CHANGELOG 十八批。）
    // 直写 size[0]=目标宽——**勿回 RewriteSize 的 mult 路**：want=原值×(目标/当前宽)，重跑时
    // 当前宽=已改值 → 想要值被弹回原宽（12↔16 振荡）；v1.8.3 靠「每会话一次」掩盖了这一点。
    // 高度修改批（2026-11-07）起宽恒 12（cfg 键退役）；5s 周期重扫（RefreshMeta 慢通道）+
    // 高度键 SettingChanged→SizeDirty 帧级重算；高=15 键逐包（0=原生/MaxHeight 夹/缩高走掉落闸）。
    private static string _sizeSig = ""; // 目标集签名（集合/宽/高映射未变=零日志快路径；异常轮不记号下轮重试）

    // ==== 高度修改批（2026-11-07，spec 2026-11-07-bag-height-design §6）====
    /// <summary>柜宽恒 12（作者令「宽度固定 12 不允许修改」：Rail.UniformBagWidth 键退役，此常量单源）。</summary>
    internal const int UniformWidth = 12;
    /// <summary>立即生效硬验收（spec §2）：15 个高度键 SettingChanged 置脏（线程不定，禁直调 Il2Cpp）→
    /// Tick 首行主线程帧内消费重算——改键当帧落笔，不等 5s 慢通道。</summary>
    internal static volatile bool SizeDirty;
    private static readonly Dictionary<int, int> _nativeH = new(); // 会话首见即原生高（0=恢复原生语义的数据源）
    // 尺寸守卫缓存（读档掉物品修复 2026-11-12）：SizeEnginePoll 每轮确认的包尺寸目标
    // （宽度段记 w+当时高；高度段随后覆盖高——ShrinkDrop 未竟包钉当前值，慢通道收敛后覆盖）。
    // 读档表重载/异步洗表后帧级守卫（SizeGuardFrame）据此当帧写回，物品校验窗口 5s→1 帧。
    private static readonly Dictionary<int, int[]> _appliedSize = new();

    /// <summary>工作台抽屉三档全局包（2026-11-06 终案）：5010[8×5]/5012[8×6]/5013[8×7] 升级链，
    /// 不挂任何家具（Config_Furniture 零引用实锤）、全工作台共享互通（作者实测「四台抽屉通」）。
    /// 宽随 cfg 统一；高/档位不动（升级链照常）。下轮换档配置表重建→5s 幂等重写自动收敛。</summary>
    internal static readonly int[] DrawerBagIds = { 5010, 5012, 5013 };

    /// <summary>材料架包（家具 205 专属，零共包）：宽 20=每行可放件数（cap=20÷材料宽）、
    /// 高 12=材料行数（MaterialRackRowBuilder.GetRackBagSize 反汇编实证实时直读 Size[0]/[1]，
    /// 空行垫底补齐到包高）。2026-11-12 作者令开高度（Height_110009）；宽**不进 12 统一**
    /// ——收窄=砍每行件数容量，SizeEnginePoll 宽度段对它跳过。</summary>
    internal const int RackBagId = 110009;

    internal static void SizeEnginePoll()
    {
        const int w = UniformWidth; // 宽恒 12（UniformBagWidth 键退役，spec §2）
        try
        {
            var cm = BagTable.Cm();
            var bags = BagTable.BagDict(cm);
            var furns = BagTable.FurnDict(cm);
            if (bags == null || furns == null || bags.Count == 0) return; // 配置表未就绪：下轮再试

            // ① 目标包=家中柜子 + 冷链冰箱（作者 2026-11-01 复测缺陷：豪华版双门冰箱/冰柜没进 12——
            //    上一版只扫 HomeInstances=kind 'c'，冰箱是冷链电器 kind 'f' 全漏；改扫 AllContainers
            //    并剔除 'r' 材料架/货架——行式界面且原宽可 >12，收窄=砍容量，保持原宽）
            var ids = new HashSet<int>();
            foreach (var c in CabinetCatalog.AllContainers)
            {
                if (c.Kind == 'r') continue;
                try { if (furns.TryGetValue(c.ConfigId, out var f) && f != null && f.BagId > 0) ids.Add(f.BagId); } catch { }
            }
            // 高度修改批 ruling：家中无柜/目录未就绪不再整轮早退——高度名单全静态（背包/载具/抽屉/
            // 置物架/冰箱键全在 cfg），不依赖 AllContainers；宽度段目标空=零写自然跳过。

            // ② 排除包 = cfg 包级 + 家中在场的排除家具所占包
            var skip = BagTable.ParseIds(CabinetEverywherePlugin.ExcludeBagIds.Value);
            var excludeFurn = BagTable.ParseIds(CabinetEverywherePlugin.ExcludeFurnitureIds.Value);
            if (excludeFurn.Count > 0)
            {
                var seenCfg = new HashSet<int>();
                foreach (var c in CabinetCatalog.AllContainers)
                {
                    if (!excludeFurn.Contains(c.ConfigId) || !seenCfg.Add(c.ConfigId)) continue;
                    try { if (furns.TryGetValue(c.ConfigId, out var f) && f != null && f.BagId > 0) skip.Add(f.BagId); } catch { }
                }
            }

            // ③ 柜宽白名单（cfg SizeIncludeBagIds）：包含优先于排除共包——白名单包即使在
            //    ② 的 skip 里也直进目标；不在 AllContainers（Access 双名单挡在扫描门槛外）
            //    的功能包（如 1009 中控台）由这里补进，页签/筛选语义不受影响
            var include = BagTable.ParseIds(CabinetEverywherePlugin.SizeIncludeBagIds.Value);

            var targets = new List<int>();
            var skipped = new List<string>();
            foreach (var bagId in ids)
            {
                if (skip.Contains(bagId) && !include.Contains(bagId)) { skipped.Add(bagId + "(排除共包)"); continue; }
                targets.Add(bagId);
            }
            foreach (var bagId in include)
                if (!ids.Contains(bagId)) targets.Add(bagId); // 白名单独有（AllContainers 外的功能包）
            foreach (var bagId in DrawerBagIds)              // 抽屉三档（全局包，非家具——见上注⑤）
                if (!targets.Contains(bagId)) targets.Add(bagId);
            // 高度修改批 §6.2：24 静态包并进宽度目标集（**绕过 skip**，白名单包含优先语义同 ⑤）——
            // 载具 1021/1022 原生宽 5/10 随批首次收 12；背包链原生 12 幂等零写。
            // 材料架 110009 例外（2026-11-12 高度批）：只并进高度段、不进宽度目标——
            // 宽 20=每行可放件数（cap=20÷材料宽），统一 12=砍容量。
            var heightBags = new List<int>(HeightTargetBags());
            foreach (var bagId in heightBags)
                if (bagId != RackBagId && !targets.Contains(bagId)) targets.Add(bagId);
            targets.Sort();
            skipped.Sort(string.CompareOrdinal);
            // 签名含高度映射（cfg 值变即重算）：bagId:want 串（want<0=不在名单占位）
            var hmap = new List<string>();
            foreach (var bagId in heightBags) hmap.Add(bagId + ":" + ResolveTargetHeight(bagId));
            var sig = w + "|" + string.Join(",", targets) + "|" + string.Join(",", skipped) + "|" + string.Join(",", hmap);
            if (sig == _sizeSig) return; // 集合/宽/高映射都未变：零日志零写
            _sizeSig = sig;

            int changed = 0, errs = 0;
            var detail = new List<string>();
            foreach (var bagId in targets)
            {
                try
                {
                    if (!bags.TryGetValue(bagId, out var bag) || bag == null) continue;
                    var size = bag.Size;
                    if (size == null || size.Count < 2) continue;
                    int cw = size[0];
                    if (cw <= 0) continue;
                    _appliedSize[bagId] = new[] { w, size[1] }; // 守卫缓存：宽=目标（写后/已达标），高先记现值（高度段覆盖）
                    if (cw == w) continue;
                    size[0] = w; // 直写宽（高不动）
                    changed++;
                    detail.Add(bagId + "(" + BagTable.Name(bag) + ")" + cw + "→" + w);
                }
                catch { errs++; }
            }

            // ==== 高度段（高度修改批 §6.1）：24 静态包逐包行数 ====
            int hChanged = 0, shrinkPending = 0; // shrinkPending=ShrinkDrop 未竟包数（日志诚实化：终审 M1）
            var hDetail = new List<string>();
            foreach (var bagId in heightBags)
            {
                try
                {
                    int tgt = ResolveTargetHeight(bagId);
                    if (tgt < 0) continue; // 不在名单（名单静态，防御性兜底）
                    if (!bags.TryGetValue(bagId, out var bag) || bag == null) continue;
                    var size = bag.Size;
                    if (size == null || size.Count < 2) continue;
                    int curH = size[1];
                    if (curH <= 0) continue;
                    int nativeH = NativeHeightOf(bagId, curH);
                    int want = tgt == 0 ? nativeH : tgt; // 0=恢复原生（会话首见缓存）
                    if (want == curH)
                    {
                        if (_appliedSize.TryGetValue(bagId, out var rec)) rec[1] = want; // 已达标：守卫缓存高对齐
                        else _appliedSize[bagId] = new[] { size[0], want };
                        continue;
                    }
                    // 缩高=先掉后缩（spec §8：ShrinkDrop 官方掉落编排成功才落笔；false=本轮放弃
                    // 签名不记下轮重试——位置不可得/掉落失败等，零物品损失）
                    if (want < curH && !ShrinkDrop.Process(bagId, want)) { _sizeSig = ""; shrinkPending++; continue; }
                    size[1] = want;
                    if (_appliedSize.TryGetValue(bagId, out var rec2)) rec2[1] = want;
                    else _appliedSize[bagId] = new[] { size[0], want };
                    hChanged++;
                    hDetail.Add(bagId + "(" + BagTable.Name(bag) + ")" + curH + "→" + want);
                }
                catch { errs++; }
            }
            changed += hChanged;
            detail.AddRange(hDetail);

            if (errs > 0) _sizeSig = ""; // 有异常：签名不记，下轮重试（防单包偶发失败被签名门吞掉）
            if (changed > 0)
            {
                BagTable.InvalidateBagSizeIndex(cm, new List<string>());
                RefreshAfterSizeWrite(); // 立即生效链（spec §2 硬验收）
            }
            CabinetEverywherePlugin.Log.LogInfo(
                (changed > 0
                    ? $"[CERail] SizeEngine：宽 {w} 列/高改写 {changed} 包：" + string.Join("、", detail)
                    : $"[CERail] SizeEngine：目标 {targets.Count} 包宽 {w} 列/高度均已达标"
                      + (shrinkPending > 0 ? $"（另有 {shrinkPending} 包缩高待处理，每 5s 重试——见 ShrinkDrop 日志）" : ""))
                    + (skipped.Count > 0 ? "；跳过 " + skipped.Count + " 包：" + string.Join(",", skipped) : "")
                    + "（宽度目标=家中柜子+冰箱+白名单+高度名单24包，材料架宽 20 不动（高可调，Height_110009）；高度=16键解析(0=原生/MaxHeight夹/抽屉H·H+1·H+2)；Config_Bag 内存直写，5s 幂等+改键帧级）");
        }
        catch (Exception e)
        {
            WarnOnce("sizeengine", "SizeEngine 异常: " + e.Message);
        }
    }

    /// <summary>高度段静态名单（spec §4.1 + 2026-11-12 材料架批）：背包链 9 + 单包键 13（含材料架 110009）+ 抽屉三档 3 = 25 包（顺序即处理序）。</summary>
    private static IEnumerable<int> HeightTargetBags()
    {
        foreach (var id in CabinetEverywherePlugin.BackpackBagIds) yield return id;
        var byBag = CabinetEverywherePlugin.HeightByBag;
        if (byBag != null)
            foreach (var id in byBag.Keys) yield return id;
        foreach (var id in DrawerBagIds) yield return id;
    }

    /// <summary>包的目标行数：单包键/背包链直值；抽屉三档=H/H+1/H+2（升级链递进保留，spec §7）；
    /// 0=恢复原生；MaxHeight&gt;0 逐包/逐档夹。不在高度名单=-1（调用方跳过）。</summary>
    private static int ResolveTargetHeight(int bagId)
    {
        int want;
        try
        {
            if (bagId == 5010 || bagId == 5012 || bagId == 5013)
            {
                int h = CabinetEverywherePlugin.DrawerHeight?.Value ?? 0;
                if (h <= 0) return 0; // 0=原生链（三档各自还原）
                want = h + (bagId == 5012 ? 1 : bagId == 5013 ? 2 : 0);
            }
            else if (Array.IndexOf(CabinetEverywherePlugin.BackpackBagIds, bagId) >= 0)
            {
                want = CabinetEverywherePlugin.BackpackHeight?.Value ?? 0;
            }
            else if (CabinetEverywherePlugin.HeightByBag == null ||
                     !CabinetEverywherePlugin.HeightByBag.TryGetValue(bagId, out var ent) || ent == null)
            {
                return -1;
            }
            else
            {
                want = ent.Value;
            }
        }
        catch { return -1; }
        if (want <= 0) return 0;
        int max;
        try { max = CabinetEverywherePlugin.MaxHeight?.Value ?? 0; } catch { max = 0; }
        if (max > 0 && want > max) want = max;
        return want;
    }

    /// <summary>会话首见即原生高缓存（幂等：重复执行永远按首见值还原；表重载后不重记）。</summary>
    internal static int NativeHeightOf(int bagId, int currentH)
    {
        if (!_nativeH.TryGetValue(bagId, out var n) || n <= 0) { n = currentH; _nativeH[bagId] = n; }
        return n;
    }

    /// <summary>
    /// 读档启动族抢写（SizeGuardHook prefix 调，2026-11-12 读档掉物品修复）：清签名+守卫缓存
    /// →柜子名单/场景实例重扫（AfterAgent 起家具已建，柜子包进目标集）→SizeEnginePoll 全量写表。
    /// 必须先于 ItemManager.StartBattle 体内的 LoadItemsFromSave（物品逐件 AddItem 按当时表值
    /// 校验 BagPos，越界即 TryDropOverflowItemData 官方掉落）。幂等：三 prefix 重复进入零写。
    /// </summary>
    internal static void ReapplyOnBattleStart()
    {
        _sizeSig = "";
        _appliedSize.Clear();
        try { CabinetCatalog.RebuildConfigIds(); } catch { } // 配置层名单幂等重扫（未就绪=SizeEnginePoll 内部自判）
        try { CabinetCatalog.RefreshHomeInstances(); } catch { } // 家具未建时扫空无害（后续 prefix/慢通道补）
        SizeEnginePoll();
        try { BagBurden.SlowTick(); } catch { } // 数据链瘦身 §F：负重读档收敛链（原 5s 事后收敛退役）
    }

    /// <summary>守卫告警节流（60s）：官方异步洗表若持续，防每帧刷屏。</summary>
    private static long _sizeGuardLastLog;

    /// <summary>
    /// 帧级尺寸守卫（FastPoll 调）：逐包比对守卫缓存与 Config_Bag 现值，被官方表重载洗回
    /// 原生（读档后异步发生，日志 1771→1801 间隔实证）则当帧写回+索引失效+刷新活跃页。
    /// 洗表→写回窗口=1 帧，物品校验（读档加载/开柜/腐烂轮询）几乎不可能命中。
    /// 稳态纯比较零写（~30 包×2 次 int 读，interop 开销可忽略）。表未就绪/缓存空=秒退。
    /// </summary>
    internal static void SizeGuardFrame()
    {
        if (PerfDiag.R1Off) return; // [PERFDIAG] R1 A/B：true=停用帧级读检（5s 慢通道+StartBattle 抢写仍在）
        if (_appliedSize.Count == 0) return;
        try
        {
            var cm = BagTable.Cm();
            var bags = BagTable.BagDict(cm);
            if (bags == null || bags.Count == 0) return;
            int fixedCount = 0;
            var fixedNames = new List<string>();
            foreach (var kv in _appliedSize)
            {
                try
                {
                    if (!bags.TryGetValue(kv.Key, out var bag) || bag == null) continue;
                    var size = bag.Size;
                    if (size == null || size.Count < 2) continue;
                    var want = kv.Value;
                    if (size[0] == want[0] && size[1] == want[1]) continue;
                    size[0] = want[0];
                    size[1] = want[1];
                    fixedCount++;
                    if (fixedNames.Count < 8) fixedNames.Add(kv.Key + "(" + BagTable.Name(bag) + ")");
                }
                catch (Exception e) { PerfDiag.Swallow("sizeguard.bag:" + e.GetType().Name); } // [PERFDIAG]
            }
            if (fixedCount == 0) return;
            try { BagTable.InvalidateBagSizeIndex(cm, new List<string>()); } catch { }
            RefreshAfterSizeWrite();
            var now = DateTime.UtcNow.Ticks / TimeSpan.TicksPerSecond;
            if (now - _sizeGuardLastLog < 60) return;
            _sizeGuardLastLog = now;
            CabinetEverywherePlugin.Log.LogWarning(
                "[CERail] SizeGuard：官方表重载把 " + fixedCount + " 包尺寸洗回原生，已当帧写回（" +
                string.Join("、", fixedNames) + (fixedCount > fixedNames.Count ? " 等" : "") +
                "）——读档掉物品修复（抢写钩 SizeGuardHook + 本帧守卫双保险）");
        }
        catch (Exception e) { PerfDiag.Swallow("sizeguard.frame:" + e.GetType().Name); } // [PERFDIAG]
    }

    /// <summary>
    /// 尺寸改写后的立即生效链（spec §2 硬验收：不允许变形/闪烁/延迟）：
    /// ①官方活跃页刷新 Ra_RefreshBag（重建态=重读尺寸，官方路径零闪烁——Bug3 以来验证的机制）；
    /// ②BackpackUI 补 Ac_Item_RefreshAllBagViews（其 RefreshBag 需 Redux 对象，见 RailData.RefreshActivePage 注）；
    /// ③mod rail：容器 cap 重算（变化经 RailData._lastMetaSig 比对）+ 强制重推——侧栏/排序弹窗当帧~0.5s 跟上。
    /// </summary>
    private static void RefreshAfterSizeWrite()
    {
        try { RailData.RefreshActivePage(); } catch { }
        try
        {
            if (RailData.ActivePage() == "BackpackUI")
                GameCore.HotUpdate.ReduxUI.Ac_Item_RefreshAllBagViews.SendAction();
        }
        catch { }
        try { RailData.RecomputeCaps(); RailData.ForceRepublish(); } catch { }
    }

    internal static void Tick()
    {
        // cfg 门（T8）：首行判定，覆盖 bootstrap 注入/数据推送/drain/Pump 全部路径
        if (!Enabled) return;
        // 立即生效硬验收（spec §2）：高度键 SettingChanged 置脏（线程不定禁直调 Il2Cpp）→
        // 此处主线程帧内消费——改键当帧重算落笔+立即生效链，不等 5s 慢通道
        if (SizeDirty)
        {
            SizeDirty = false;
            SizeEnginePoll();
        }
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return;
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            if (rus == null) return;

            // 命令泵（T7）：主帧串行执行待执行命令（红线1 的"执行侧"），场景门控之前——
            // 点完即关界面的存量命令也要执行；每帧 ≤8 条，执行过即 ForceRepublish（红线6）
            RailCommands.Pump();

            // v1.8.4b SizeEngine 移交 RefreshMeta 慢通道（5s 幂等重扫；RailData.RefreshMeta 尾部调用）
            // ——原「每会话一次」既漏新放柜子/换档重读，又掩盖了 RewriteSize mult 路的振荡缺陷。

            var web = GetWebView();
            if (web == null) return;

            // 八追：WebView 控制台转发（一次挂载；JS 异常/分片重组失败 warn → BepInEx 日志）
            HookConsole(web);

            // bootstrap 注入（T8）：幂等，每周期执行（WebView 重建自动重挂）；探活确认见下
            InjectBootstrap(web);

            // 世界重绑检测（第十二轮：退主菜单重读档——LogicWorld 引用变即复位管线，
            // 否则门②永拦=契约冻结旧世界 id=排序失效+角标全空）
            if (RailData.CheckWorldRebind())
            {
                RailData.OnWorldRebind();
                _lastPage = null; /* 视为新开机：首个场景必推 */
                _sizeSig = "";    /* 终审 I2：读档/切场景表重载会还原 Config_Bag——签名复位保证下一轮幂等重写（宽高同管） */
                _appliedSize.Clear(); /* 换档包集合可能变：守卫缓存随签名同清（StartBattle prefix 抢写已先行重建） */
            }

            // 门控①：无 rail 场景不推（清 _lastPage：重开场景时视为 page 变化必推一包）
            if (!RailData.AnyRailSceneActive()) { _lastPage = null; return; }

            // drain（T7）：取走 JS 命令队列——回调只解析入队（红线1），Pump 下周期消费；
            // 积压 ≥ MaxQueued 抑流。回调创建一次复用（主帧赋值，无竞争）。
            if (RailCommands.QueueDepth < RailCommands.MaxQueued)
            {
                try
                {
                    if (_drainCb == null)
                        _drainCb = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<Il2CppSystem.Action<string>>(
                            new Action<string>(RailCommands.Enqueue));
                    web.ExecuteJavaScript("window.__CERAIL__&&window.__CERAIL__.drain()", _drainCb);
                }
                catch (Exception e)
                {
                    WarnOnce("drain", "drain 回调通道不可用（命令暂不能下发）: " + e.Message);
                }
            }

            // 门控②：rev（数据签名）未变且场景未切换 → 不推
            RunScrollbarDiag(web);
            PushIfDue(web);
            PushWatchdog(); // 八追：回执缺口看门狗（丢弃态可见化+维持重发压力）
        }
        catch (Exception e)
        {
            PerfDiag.Swallow("railui.tick"); // [PERFDIAG]
            WarnOnce("tick", "rail 数据推送失败: " + e.Message);
        }
    }

    /// <summary>
    /// 推送尾（Tick 与 FastPoll 共用）：门②全量签名判定 → BuildJson → setData 下发。
    /// 返回 payload 字节数；-1=本轮无推送（签名未变或 owner 窗口期）。
    /// 【v1.8.10 十三批六追（实机铁证定案）：推送必须走带回调重载】
    /// 旧实现用单参无回调 ExecuteJavaScript(script)——与 drain/探针/滚动条诊断（均带回调）
    /// 对照实机取证：带回调三通道全达（drain 2/s 稳定），单参推送零达（JS setData 钩 0 次、
    /// store 恒空=「全界面排序钮不见/柜区布局残留」断流根因）；JS 接收端健康（CDP 直注假包
    /// 当场生效）。= 本机 Vuplex/Il2Cpp 组合下**单参重载静默丢弃**（bootstrap 早期窗口偶达
    /// =会话时好时坏的假象来源）。修=统一带回调（回调体空转，红线1 不碰数据）。
    /// </summary>
    /// <summary>入库任务进度小包（方案 A 交互终案）：几十字节直推 __CERAIL__.storeProg
    /// （Root 文档模态进度弹窗的更新口）。必须走带回调重载（v1.8.10 铁证：单参无回调
    /// ExecuteJavaScript 本机静默丢弃——_pushAckCb 复用同纪律）；~12 次/s（DriveStoreTask
    /// 每 5 帧）+完成时 100% 一次。WebView 不在场=静默跳过（进度条缺席无害，任务照常）。</summary>
    internal static void PushStoreProg(int done, int total)
    {
        try
        {
            var web = GetWebView();
            if (web == null) return;
            if (_pushAckCb == null)
                _pushAckCb = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<Il2CppSystem.Action<string>>(
                    new Action<string>(PushAck));
            web.ExecuteJavaScript("window.__CERAIL__&&__CERAIL__.storeProg(" + done + "," + total + ")", _pushAckCb);
        }
        catch { }
    }

    /// <summary>上次全量推送时刻（ms，Environment.TickCount64）——余波节流用（见 PushIfDue 头注释）。</summary>
    private static long _lastPushMs;

    // [PERFDIAG] 卡顿现场行取数（PERF_NOTES.md 验证后删除）
    internal static long LastPushAgoMs => _lastPushMs == 0 ? -1 : System.Environment.TickCount64 - _lastPushMs;
    internal static int LastPushLen { get; private set; }

    private static int PushIfDue(Vuplex.WebView.IWebView web)
    {
        if (RailCommands.StoreTaskActive) return -1; // 入库任务在途：闸住全量重推（Tick/FastPoll 双通道一收口——任务每帧搬几件，不闸=每帧 136KB BuildJson+下发；完成时 FinishStoreTask 收尾一次推）
        // 余波节流（2026-11-11 慢动作终案）：入库后游戏自身系统（机器人整理/并叠等）会连续动物品
        // （实测物品行 1492→1496→1493 逐包变）→ 每次结构变化=129KB 全量重推，8+ 连发=1MB 下发+
        // JS 全量渲染×8=游戏慢动作数秒。600ms 节流把连发合并到 2-3 包（哨兵/页面切换最多迟 600ms 无感）。
        long nowMs = System.Environment.TickCount64;
        if (nowMs - _lastPushMs < 600 && _lastPushMs != 0) return -1;
        string page = RailData.ActivePage();
        bool pageChanged = !string.Equals(page, _lastPage, StringComparison.Ordinal);
        if (!pageChanged && !RailData.ItemsDirty()) return -1;

        var (json, rev) = RailData.BuildJson();
        if (json == null) return -1; // 背包 owner 不可得（findings §4 兜底③），等下一周期

        /* 八追终案护栏（告警不拦发——字符串值内可合法含 ",,"（如柜子改名"a,,b"），盲拦会误伤；
           严格校验由 JS 侧 commit 的 JSON.parse 把关）：合法 JSON 结构位严禁 ",,"（空值/双分隔）
           与 "[,"（前导逗号）——tradePrefs（双重引号+悬空前导逗号）与 lib（行尾+行首双分隔）
           两案的教训：坏包直推=整段脚本语法错误被 WebView 静默丢弃=「断流/概率性丢包」假象
           （四~八追悬案的真正根因）。命中即带现场片段限频告警——拼装 bug 从静默死变一行日志。 */
        int bad = json.IndexOf(",,", StringComparison.Ordinal);
        if (bad < 0) bad = json.IndexOf("[,", StringComparison.Ordinal);
        if (bad >= 0)
        {
            string spot = json.Substring(Math.Max(0, bad - 40), Math.Min(100, json.Length - Math.Max(0, bad - 40)));
            WarnOnce("payload", "推送载荷疑似非法 JSON（,,/[, @" + bad + "，若为字符串值内出现则无害）——拼装 bug 现场核查：…" + spot + "…");
        }

        if (_pushAckCb == null)
            _pushAckCb = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<Il2CppSystem.Action<string>>(
                new Action<string>(PushAck)); // 命名方法（与 _drainCb 同款模式；空回调只走「带回调」可达通道）

        /* v1.8.10 八追分片（九点修订：pid 寻址乱序免疫）：大契约（>7.5KB）拆片走
           __CERAIL__.pushChunk 微包通道——大包 ExecuteJavaScript 概率性丢弃而微包恒达
           （六追 CDP 实证 + 2026-11-05 复发会话 20 分钟断流）。每片独立小表达式（原文子串
           经 EscapeJs 装箱，JS 解析字面量即还原原文）；**每包分配单调递增 pid**——实机 CDP
           活捉证明 WebView2 ExecuteScript 异步无序执行（心跳重压下 seq=0 迟到/跨包串片，
           初版按序假设的重组必炸=八追部署版断流假象的根因），JS 按 pid 丢弃旧包迟到片、
           计数齐片才 commit，任意乱序/重复/迟到幂等安全。小包维持直推零开销。 */
        const int Chunk = 7500;
        System.Threading.Interlocked.Increment(ref _pushSent);
        if (json.Length <= Chunk)
        {
            web.ExecuteJavaScript("window.__CERAIL__&&window.__CERAIL__.setData(" + json + ")", _pushAckCb);
        }
        else
        {
            long pid = System.Threading.Interlocked.Increment(ref _pushPid);
            int total = (json.Length + Chunk - 1) / Chunk;
            for (int i = 0; i < total; i++)
            {
                int take = Math.Min(Chunk, json.Length - i * Chunk);
                web.ExecuteJavaScript("window.__CERAIL__&&__CERAIL__.pushChunk(" + pid + "," + i + "," + total + ",\"" +
                    EscapeJs(json.Substring(i * Chunk, take)) + "\")", _pushAckCb);
            }
        }
        _lastPage = page;
        _lastPushMs = nowMs; // 余波节流基准（本次推送时刻，见头注释）
        LastPushLen = json.Length; // [PERFDIAG] 卡顿现场行取数

        // Debug.Verbose（T14 实机校准观测点）：json 头 200 字符 + 容器数/物品行数/icfg 行数/rev
        if (CabinetEverywherePlugin.Verbose?.Value == true)
            CabinetEverywherePlugin.Log?.LogInfo(
                $"[CERail] 推送 rev={rev} page={page ?? ""}：容器 {RailData.LastCtnRows}，物品行 {RailData.LastItemRows}，icfg {RailData.LastIcfgRows}\n  head: {RailData.LastJsonHead}");
        return json.Length;
    }

    /// <summary>
    /// v1.8.9 Bug4（作者实测：无人机交易一键整理响应 2s+，排查结论见 CHANGELOG 八批）：
    /// 帧级快通道——官方排序/搬运落地（ItemManager 叠数变化）≤1 帧即检出并全量重推，
    /// 替代原「0.5s 泵轮询量化等待」这一段固定延迟。tidy（SORT 事件页走官方事件，C# 不经手，
    /// 原本只能等轮询）与全部搬运类命令的回推/差量 toast 同步提速。
    /// 成本：每帧 12 页 IsUIActive + 每 owner 1 次 Count（interop 读数十次/帧，空闲≈零变化
    /// 即退）；重活（探针/drain/诊断）仍在 0.5s Tick。行数不变的改动（纯挪位/Σcount 微变）
    /// 不走此路，由 Tick 全量签名兜底（与原行为一致）。
    /// AccessTicker.Update 每帧最先段调用（RefreshCoalescer.Flush 同位）。
    /// </summary>
    internal static void FastPoll()
    {
        if (!Enabled) return;
        SizeGuardFrame(); // 帧级尺寸守卫（读档掉物品修复）：表被官方异步洗回原生→当帧写回
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return;
            // 帧级命令通道（五验收「右键加料 2s+」）：Pump 每帧执行（0.5s Tick 首位调用保留=点完
            // 即关界面的存量命令兜底，双调用幂等）；drain 每帧下发（场景活跃时；回调入队后下一帧
            // Pump 消化=端到端≈2 帧。原路径 drain@0.5s Tick + Pump@下轮 Tick=固定 0.5~1s 量化延迟）。
            // drain() 空队列=微 JS 调用零成本（ping 通道实验实证小包恒达先例）
            RailCommands.Pump();
            if (!PerfDiag.R3Off && RailData.AnyRailSceneActive() && RailCommands.QueueDepth < RailCommands.MaxQueued) // [PERFDIAG] R3 A/B：true=停每帧 drain（保留 0.5s Tick 的 drain）
            {
                var webC = GetWebView();
                if (webC != null)
                {
                    try
                    {
                        if (_drainCb == null)
                            _drainCb = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<Il2CppSystem.Action<string>>(
                                new Action<string>(RailCommands.Enqueue));
                        webC.ExecuteJavaScript("window.__CERAIL__&&window.__CERAIL__.drain()", _drainCb);
                    }
                    catch (Exception e) { WarnOnce("drain", "drain 回调通道不可用（命令暂不能下发）: " + e.Message); }
                }
            }
            if (!RailData.AnyRailSceneActive()) return;
            RailGround.PollFastCount(); // 地面计数沿（丢弃/拾取/腐烂）→ 脏标记
            RailData.PollCtxFast();     // 页面态沿（活动页/双背包翻转/A 侧归属/架子 owner/背包 owner）
            if (!RailData.ItemsDirty()) return;
            var web = GetWebView();
            if (web == null) return;
            var sw = System.Diagnostics.Stopwatch.StartNew();
            int len = PushIfDue(web);
            long t = sw.ElapsedMilliseconds;
            // Bug3 对账口径（>150ms 常驻打印）：快通道检出→BuildJson→下发一段的成本留痕
            if (len >= 0 && (CabinetEverywherePlugin.Verbose?.Value == true || t > 150))
                CabinetEverywherePlugin.Log?.LogInfo($"[CERail] 快通道重推（结构变化≤1帧检出）：检出+BuildJson+下发 {t}ms，payload {len / 1024}KB");
        }
        catch (Exception e)
        {
            PerfDiag.Swallow("railui.fastpoll"); // [PERFDIAG]
            WarnOnce("fastpoll", "快通道推送失败: " + e.Message);
        }
    }

    /// <summary>
    /// v1.8.10 八追：推送回执看门狗。判据=「已发未回执缺口 ≥6」且「距最近一次回执 >10s」
    /// （七追实证到达存在数秒级延迟波动——瞬时缺口是常态，双条件防误报）且 rail 场景活跃。
    /// 命中=通道丢弃态（分片后单片 7.5KB，健康流缺口≈0~1）：限频 10s 告警一行 + ForceRepublish
    /// 维持重发压力（JS 心跳 ping 的重推环在「JS 假尸」态会停摆——看门狗是 C# 侧独立保底）。
    /// 缺口归零时记一行恢复（断流窗口长度由此可从日志读出）。
    /// </summary>
    private static void PushWatchdog()
    {
        long gap = System.Threading.Interlocked.Read(ref _pushSent) - System.Threading.Interlocked.Read(ref _pushAcked);
        long now = DateTime.UtcNow.Ticks / TimeSpan.TicksPerSecond;
        if (gap <= 0)
        {
            if (_watchdogTripped)
            {
                _watchdogTripped = false;
                CabinetEverywherePlugin.Log?.LogInfo("[CERail] 推送回执恢复（缺口归零——通道自愈）");
            }
            return;
        }
        long lastAck = System.Threading.Interlocked.Read(ref _lastAckAt);
        if (gap < 6 || lastAck <= 0 || now - lastAck <= 10) return;
        _watchdogTripped = true;
        if (now - _lastWatchdogLog < 10) return;
        _lastWatchdogLog = now;
        CabinetEverywherePlugin.Log?.LogWarning(
            $"[CERail] 推送回执缺口 {gap}（已发 {_pushSent}/回执 {_pushAcked}，距最近回执 {now - lastAck}s）——通道丢弃态疑似，ForceRepublish 维持重发");
        RailData.ForceRepublish();
    }

    /// <summary>
    /// v1.8.10 八追：WebView 控制台转发。动机——v1.8.1 先例：JS 渲染异常曾让 setData 半途
    /// 抛出（页签空白+全部交互失联），而所有 JS 侧兜底 warn 只进 WebView 控制台= BepInEx 日志
    /// 盲区；断流排查曾因此无法分辨「包未达」vs「包达但渲染炸」。挂 ConsoleMessageLogged，
    /// warn/error 转发进 BepInEx 日志（按级别+消息前缀去重，防 Vue 官方噪声刷屏）。
    /// </summary>
    private static bool _consoleHooked;
    private static readonly HashSet<string> _consoleSeen = new();
    private static void HookConsole(Vuplex.WebView.IWebView web)
    {
        if (_consoleHooked || web == null) return;
        try
        {
            // Il2CppInterop 不生成 C# 事件，事件以 add_Xxx 方法形态暴露（探针实锤：
            // IWebView.add_ConsoleMessageLogged(EventHandler<ConsoleMessageEventArgs>)）。
            // 首版 ConvertDelegate(EventHandler<T>) 实机报「Parameter type at 0 has
            // mismatched native type pointers; System.Object != System.Object」（泛型委托的
            // object 参托管/Il2Cpp 身份不匹配）——改 Action<Il2CppSystem.Object, T> 签名转换。
            var handler = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<
                Il2CppSystem.EventHandler<Vuplex.WebView.ConsoleMessageEventArgs>>(
                new Action<Il2CppSystem.Object, Vuplex.WebView.ConsoleMessageEventArgs>(
                    (s, e) => OnConsoleMessage(null, e)));
            web.add_ConsoleMessageLogged(handler);
            _consoleHooked = true;
            CabinetEverywherePlugin.Log?.LogInfo("[CERail] WebView 控制台转发已挂（JS warn/error → BepInEx 日志）");
        }
        catch (Exception e)
        {
            _consoleHooked = true; /* 挂不上不重试（每 tick 重试只刷异常） */
            WarnOnce("consoleHook", "WebView 控制台转发挂载失败（JS 异常仍不可见）: " + e.Message);
        }
    }
    private static void OnConsoleMessage(object sender, Vuplex.WebView.ConsoleMessageEventArgs e)
    {
        try
        {
            string msg = e?.Message;
            if (string.IsNullOrEmpty(msg)) return;
            string lvl;
            try { lvl = e.Level.ToString(); } catch { lvl = "?"; }
            string src = "";
            try { src = "（" + e.Source + ":" + e.Line + "）"; } catch { }
            string key = lvl + "|" + (msg.Length > 120 ? msg.Substring(0, 120) : msg);
            if (_consoleSeen.Count > 400) _consoleSeen.Clear(); /* 去重集合上限（防无限涨） */
            if (!_consoleSeen.Add(key)) return;
            CabinetEverywherePlugin.Log?.LogWarning($"[CERail][JS:{lvl}] {msg} {src}");
        }
        catch { }
    }

    /// <summary>
    /// bootstrap 注入 + 轻探针状态机（v1.8.1 重写；T8 裁定 1 的旧 ReferenceEquals 方案作废）。
    /// 旧案根因（实机刷屏实锤）：GetWebView() 每次属性访问都产生新的 interop 包装实例，
    /// ReferenceEquals(web,_lastWeb) 恒 false → 每 tick 复位探活态 → 每秒重注 86KB + 每次
    /// 确认回调 ForceRepublish（rev 暴涨 + 日志刷屏）。
    /// 新案：废弃引用判等。每 tick 发一次轻探针 `window.__CERAIL__?1:0`（几十字节）；
    ///   · 回包 present 且未确认 → 确认存活 + ForceRepublish 一包（WebView 重建后 rev 未变
    ///     不重推的缺口由此补）；
    ///   · 回包 absent → _bootstrapLive=false（WebView 重建/页面重载探测）且 _probeState=1；
    ///   · 未确认态且最近一探明确 absent → 注入一剂全量 bootstrap（Vuplex 按派发序执行，
    ///     探针先行保证 absent 判定可靠），随后回到探针等待；确认为止。
    /// 稳态（已确认）：每 tick 只剩一发探针，零注入零 ForceRepublish。
    /// </summary>
    private static void InjectBootstrap(Vuplex.WebView.IWebView web)
    {
        try
        {
            if (_probeCb == null)
                _probeCb = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<Il2CppSystem.Action<string>>(
                    new Action<string>(r =>
                    {
                        if (r == "1")
                        {
                            if (!_bootstrapLive)
                            {
                                _bootstrapLive = true;
                                _probeState = 0;
                                RailData.ForceRepublish(); // T6 缺口修补：注入成功即强制重推（rev 未变也要推一包）
                                TradeFx.OnWebViewRebuilt(); // TradeFx 同缺口（终审 I4）：JS 侧状态已清而 C# 门控仍命中→复位重推
                                CabinetEverywherePlugin.Log?.LogInfo("[CERail] bootstrap 注入确认（__CERAIL__ 就绪）→ ForceRepublish");
                            }
                        }
                        else
                        {
                            _bootstrapLive = false; // WebView 重建/页面重载：复位待重注
                            _probeState = 1;        // 明确 absent：许可下一 tick 注入一剂
                        }
                    }));
            web.ExecuteJavaScript("(function(){try{return window.__CERAIL__?1:0}catch(e){return 0}})()", _probeCb);
            if (_bootstrapLive) return;  // 已确认存活：本 tick 只做探针维护，零注入
            if (_probeState != 1) return; // 探针回包未到/未明确 absent：不盲目重注（等回包驱动态转移）
            _probeState = 0;
            /* v1.8.10 十三批六追：注入同改带回调通道（单参重载静默丢弃——见 PushIfDue 注释；
               早期窗口偶达造成的「有时能注入」假象与本轮实机铁证一致） */
            if (_pushAckCb == null)
                _pushAckCb = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<Il2CppSystem.Action<string>>(
                    new Action<string>(PushAck));
            System.Threading.Interlocked.Increment(ref _pushSent); /* 八追：86KB 最大单包也入账本（看门狗覆盖注入丢弃） */
            web.ExecuteJavaScript(BootstrapJs, _pushAckCb);
        }
        catch (Exception e)
        {
            WarnOnce("bootstrap", "bootstrap 注入失败: " + e.Message);
        }
    }

    /// <summary>
    /// v1.8.8 滚动条诊断（一次性）：首个 rail 场景挂出后从 Root 逐 iframe 找 #srRail，量 .sr-body
    /// 的 overflowY / 滚动条占位 gap / 是否溢出 / style#srpRail 是否带自定义轨道规则，回包记一行
    /// 日志。判读：trackRule=1 且 gap≥8（或 !overflowed 且 gap≥8）=自定义经典滚动条生效（fluent
    /// 已关，恒显不闪）；trackRule=1 但 gap=0=fluent 仍接管（环境变量没赶上/feature 名失效）；
    /// trackRule=0=CSS 未注入（bootstrap 陈旧）。最多试 20 个周期，rail 一直没挂就放弃。
    /// </summary>
    private static void RunScrollbarDiag(Vuplex.WebView.IWebView web)
    {
        if (_diagDone || _diagTries >= 20) return;
        _diagTries++;
        try
        {
            if (_diagCb == null)
                _diagCb = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<Il2CppSystem.Action<string>>(
                    new Action<string>(r =>
                    {
                        if (!string.IsNullOrEmpty(r) && r.Contains("srBody"))
                        {
                            _diagDone = true;
                            CabinetEverywherePlugin.Log?.LogInfo("[CERail] 滚动条诊断：" + r);
                        }
                    }));
            web.ExecuteJavaScript(DiagJs, _diagCb);
        }
        catch (Exception e)
        {
            WarnOnce("diag", "滚动条诊断通道不可用: " + e.Message);
            _diagDone = true;
        }
    }

    private const string DiagJs =
        "(function(){try{" +
        "var ws=[window];for(var i=0;i<window.frames.length;i++){try{ws.push(window.frames[i])}catch(e){}}" +
        "for(var i=0;i<ws.length;i++){var d;try{d=ws[i].document}catch(e){continue}" +
        " if(!d||!d.getElementById||!d.getElementById('srRail'))continue;" +
        " var b=d.getElementById('srBody');if(!b)continue;" +
        " var st=(d.defaultView||ws[i]).getComputedStyle(b);" +
        " var css='';var sEl=d.getElementById('srpRail');if(sEl)css=sEl.textContent;" +
        " return 'srBody overflowY='+st.overflowY+' gap='+(b.offsetWidth-b.clientWidth)+" +
        " '+ov='+(b.scrollHeight>b.clientHeight+2?1:0)+" +
        " ' trackRule='+(css.indexOf('-webkit-scrollbar-track')>=0?1:0)+" +
        " ' sbwRule='+(css.indexOf('scrollbar-width')>=0?1:0);" +
        "}" +
        "return 'noRail';}catch(e){return 'diagErr '+e.message}})()";

    /// <summary>
    /// bootstrap 全文（静态缓存）：`window.__CERAIL__||(function(){ railui.page.js 全文;
    /// window.__CERAIL_CSS__="railui.css 全文（JS 字符串字面量转义）" })()`——JS 文本与 CSS
    /// 文本两个 EmbeddedResource 拼一次缓存；幂等靠外层守卫与 page.js IIFE 顶部早退（已有）。
    /// CSS 不注入 Root head（rail DOM 在 iframe 文档，Root 样式无效）：以 __CERAIL_CSS__ 随行，
    /// 由 railui.page.js 装配区 injectRailStyle 按 iframe 文档注入 style#srpRail。
    /// </summary>
    internal static string BootstrapJs => _bootstrap ??= BuildBootstrap();

    private static string BuildBootstrap()
    {
        string js = ReadResource("SurvivalLog.CabinetEverywhere.railui.page.js");
        string css = ReadResource("SurvivalLog.CabinetEverywhere.railui.css");
        return "window.__CERAIL__||(function(){" + js + "\n" +
               "window.__CERAIL_CSS__=\"" + EscapeJs(css) + "\";" +
               "})()";
    }

    private static string ReadResource(string name)
    {
        var asm = System.Reflection.Assembly.GetExecutingAssembly();
        using var s = asm.GetManifestResourceStream(name);
        if (s == null) { WarnOnce("res", "内嵌资源缺失: " + name); return ""; }
        using var r = new System.IO.StreamReader(s, System.Text.Encoding.UTF8);
        return r.ReadToEnd();
    }

    /// <summary>WebView 通道（TagFilter.GetWebView 同款：WebUILayer.canvasWebViewPrefab.WebView）。</summary>
    private static Vuplex.WebView.IWebView GetWebView()
    {
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return null;
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            var layer = rus?.GetWebUILayer();
            var prefab = layer?.canvasWebViewPrefab;
            return prefab?.WebView;
        }
        catch (Exception e) { PerfDiag.Swallow("webview.get:" + e.GetType().Name); return null; } // [PERFDIAG]
    }

    // ==== glist 键盘门（实机批改#5，2026-11-08）：搜索框可输入 + 中文 IME ====
    // 方案=套件 PlanPick（自选规划）装机十一轮实证同款：官方为防误触**全局限制**输入法与键盘转发
    // （WebUI 预制体 KeyboardEnabled=0，仅工具台配方搜索等白名单界面解锁）——单靠页面侧
    // SEARCH_FOCUS 事件不够（#3 教训）。正解 C# 侧双开：Dye/Heater 页激活期间
    // WebUILayer.SetKeyboardEnabled(true)（英文/裸键通道唯一开关，PlanPick S1/S3 实证）+
    // Input.imeCompositionMode=On（中文 IME 解锁：组合挂 Unity 窗口、结果 Vuplex 直投浏览器
    // 即时上屏）；页关/cfg 关=对称还原（SetKeyboardEnabled(false)+IME 还原 prev）。
    private static bool _gkHanded;
    private static float _gkNext;
    private static GameCore.HotUpdate.ReduxUI.WebUILayer _gkLayer; // 批改#12c：帧级重申快速路缓存（门开期间层恒在）
    private static UnityEngine.IMECompositionMode _gkPrevIme = UnityEngine.IMECompositionMode.Auto;
    // 批改#12f 定谳（v4 遥测 PageMap 倾倒）：官方页 id 词汇=场景名本体——染料桶真名 DyePanel
    // （非 Dye/UI_Dye/WebUI_Dye 任意变体——此前整场「门开被压关」理论全废，染料桶的门从
    // #5 起就没开过；暖炉/发电机的 Heater/FuelGenerator 恰是本名所以一直能通）。真名置首，
    // 旧变体保留兜底（IsPageActive 精确匹配，多键无副作用）。
    private static readonly string[] _gkDyeKeys = { "DyePanel", "Dye", "UI_Dye", "WebUI_Dye" };
    private static readonly string[] _gkHeaterKeys = { "Heater", "UI_Heater", "WebUI_Heater" };
    private static readonly string[] _gkFuelGenKeys = { "FuelGenerator", "UI_FuelGenerator", "WebUI_FuelGenerator" }; // 批改#8：燃油发电机复用暖炉（搜索框键盘门同开）
    // 篮子救援 glist（basket spec）：BackpackUI 篮子模式——iframe id 实测 'Backpack'（ID_ALIAS
    // 归一，findings §6），真名置首旧变体兜底；**门=篮子态在场（BasketGlist.BasketOn，含
    // cfg+IsBasket_B），普通背包页不开键盘门**（与 ctx.glistOn 同口径）
    private static readonly string[] _gkBasketKeys = { "Backpack", "BackpackUI", "UI_Backpack", "WebUI_BackpackUI" };
    // rat-brew glist（rat-brew spec 裁定#7 零配置键）：第五/六场景——老鼠笼/酿酒桶，页活即开
    // （无 cfg 门）。真名置首（批改#12f 定谳：官方页 id=场景名本体），旧变体兜底；实机 30s
    // 遥测倾倒自校准（PageMap dump 为准）。
    private static readonly string[] _gkRatKeys = { "RatCage", "UI_RatCage", "WebUI_RatCage" };
    private static readonly string[] _gkBrewKeys = { "BrewPanel", "Brew", "UI_Brew", "WebUI_Brew" };
    internal static void GlistKeyboardTick()
    {
        if (PerfDiag.R5Off) return; // [PERFDIAG] R5 A/B：true=停键盘门（相关页搜索框不可输入）
        var now = UnityEngine.Time.unscaledTime;
        if (_gkHanded && now < _gkNext)
        {
            /* 批改#12c 快速路（帧级差分实锤：暖炉搜索键全到/染料桶 0 键——染料页存在页面级
               原生压关，0.3s 节流重申打不过每帧压关者）：非求值帧只做**每帧重申开**（幂等轻量），
               状态求值/日志/IME prev 采样仍 0.3s 节流。 */
            try { _gkLayer?.SetKeyboardEnabled(true); } catch (Exception e) { PerfDiag.Swallow("gk.reassert:" + e.GetType().Name); } // [PERFDIAG]
            return;
        }
        if (now < _gkNext) return;
        _gkNext = now + 0.3f;
        /* 批改#12e 测量仪（与守卫独立的第二信道）：门开着期间采样标志位真值并记翻转——
           若打字失败期间标志位恒 true=「标志位不是染料页闸门」直接定谳（整个向量弃案）；
           恒 false=压关实锤（守卫应同时开火，频次对上即结案）。前 6 次翻转留日志。 */
        if (_gkHanded && _gkLayer != null)
        {
            try
            {
                bool k = _gkLayer.IsKeyboardEnabled;
                if (k != _gkSeen || _gkSeenN < 6)
                {
                    if (k != _gkSeen) _gkSeenN++;
                    _gkSeen = k;
                    CabinetEverywherePlugin.Log.LogInfo("[CERail] glist 键盘标志位采样=" + k + (_gkSeenN <= 6 ? " (#" + _gkSeenN + ")" : ""));
                }
            }
            catch { }
        }
        GameCore.HotUpdate.ReduxUI.WebUILayer layer = null;
        try
        {
            if (GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                layer = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance?.GetWebUILayer();
        }
        catch (Exception e) { PerfDiag.Swallow("gk.layer:" + e.GetType().Name); layer = null; } // [PERFDIAG]
        if (layer == null)
        {
            if (_gkHanded) GlistKeyboardReturn();
            /* 批改#12e 遥测：门未开期间层取不到=静默 return（v2 实机会话整场零日志的两种可能之一，
               30s 节流一行把静默路径照亮） */
            if (now > _gkTelNext) { _gkTelNext = now + 30f; CabinetEverywherePlugin.Log.LogWarning("[CERail] glist 键盘遥测：GetWebUILayer=null（tick 活着，层不可得）"); }
            return;
        }
        /* 批改#12e 遥测：门未开时 30s 一行页键全景（层在但页键全灭=IsPageActive 键名/覆盖层问题）。
           v4：实机判决=染料页开着九键全灭 → 键名本身可疑，加 PageMap/pageReadyStates 键名倾倒
           （官方页 id 词汇表=IsPageActive 的合法参数域，一次拿到真相） */
        if (!_gkHanded && now > _gkTelNext)
        {
            _gkTelNext = now + 30f;
            try
            {
                string keys = "";
                foreach (var k in _gkDyeKeys) keys += k + (GlistAnyPageActive(layer, new[] { k }) ? "=1 " : "=0 ");
                foreach (var k in _gkHeaterKeys) keys += k + (GlistAnyPageActive(layer, new[] { k }) ? "=1 " : "=0 ");
                foreach (var k in _gkFuelGenKeys) keys += k + (GlistAnyPageActive(layer, new[] { k }) ? "=1 " : "=0 ");
                foreach (var k in _gkRatKeys) keys += k + (GlistAnyPageActive(layer, new[] { k }) ? "=1 " : "=0 ");
                foreach (var k in _gkBrewKeys) keys += k + (GlistAnyPageActive(layer, new[] { k }) ? "=1 " : "=0 ");
                CabinetEverywherePlugin.Log.LogWarning("[CERail] glist 键盘遥测：门未开；页键全景 " + keys);
            }
            catch { }
            try
            {
                string ids = "";
                foreach (var k in layer.PageMap.Keys) ids += k + " ";
                CabinetEverywherePlugin.Log.LogWarning("[CERail] glist 键盘遥测：PageMap keys: " + ids);
            }
            catch (Exception e) { CabinetEverywherePlugin.Log.LogWarning("[CERail] glist 键盘遥测：PageMap 枚举失败 " + e.Message); }
            try
            {
                string ids = "";
                foreach (var k in layer.pageReadyStates.Keys) ids += k + " ";
                CabinetEverywherePlugin.Log.LogWarning("[CERail] glist 键盘遥测：pageReadyStates keys: " + ids);
            }
            catch { }
        }
        bool active =
            (CabinetEverywherePlugin.EnableGlistDye?.Value != false && CabinetEverywherePlugin.EnableDye?.Value != false && GlistAnyPageActive(layer, _gkDyeKeys)) ||
            (CabinetEverywherePlugin.EnableGlistHeater?.Value != false && CabinetEverywherePlugin.EnableHeater?.Value != false && GlistAnyPageActive(layer, _gkHeaterKeys)) ||
            (CabinetEverywherePlugin.EnableGlistFuelGen?.Value != false && CabinetEverywherePlugin.EnableFuelGen?.Value != false && GlistAnyPageActive(layer, _gkFuelGenKeys)) ||
            (CabinetEverywherePlugin.EnableGlistBasket?.Value != false && BasketGlist.BasketOn && GlistAnyPageActive(layer, _gkBasketKeys)) ||
            (GlistAnyPageActive(layer, _gkRatKeys)) || /* rat-brew：零配置键=页活即开（spec 裁定#7） */
            (GlistAnyPageActive(layer, _gkBrewKeys));
        if (active)
        {
            bool first = !_gkHanded;
            _gkHanded = true;
            _gkLayer = layer;
            try
            {
                if (first) GlistKeyboardArmGuard();
                if (first) _gkPrevIme = UnityEngine.Input.imeCompositionMode;
                layer.SetKeyboardEnabled(true);
                UnityEngine.Input.imeCompositionMode = UnityEngine.IMECompositionMode.On;
                if (first) CabinetEverywherePlugin.Log.LogInfo("[CERail] glist 键盘门开（每帧重申+守卫补丁）：SetKeyboardEnabled+IME On");
            }
            catch (Exception e) { _gkHanded = false; CabinetEverywherePlugin.Log.LogWarning("[CERail] glist 键盘门开异常: " + e.Message); }
        }
        else if (_gkHanded) GlistKeyboardReturn(layer);
    }

    /* 批改#12e v2（v1 IL Compile Error 实锤=类型化注入参数不被 il2cpp 补丁接受；照抄本仓
       RefreshCoalescer.SendPrefix 零参数实证模式）：零参数后置守卫——每次 SetKeyboardEnabled
       调用后读现值（getter），门开着（_gkHanded）期间若被压 false 立即夺回 true（postfix 在
       原方法后跑=必赢，与 Update 顺序无关；夺回调用自身 value=true 走读值短路，无递归）。
       门关守卫静默，官方归还语义不变。前 5 次拦截带调用栈日志=测量仪：压关者真身+频次。 */
    private static bool _gkGuardArmed;
    private static int _gkRepelled;
    private static bool _gkSeen; private static int _gkSeenN;
    private static float _gkTelNext;
    private static void GlistKeyboardArmGuard()
    {
        if (_gkGuardArmed) return;
        _gkGuardArmed = true;
        try
        {
            var m = HarmonyLib.AccessTools.Method(typeof(GameCore.HotUpdate.ReduxUI.WebUILayer), "SetKeyboardEnabled");
            if (m == null) { CabinetEverywherePlugin.Log.LogWarning("[CERail] glist 键盘守卫：SetKeyboardEnabled 方法不可寻"); return; }
            new HarmonyLib.Harmony("com.local.survivallog.cabineteverywhere.gkguard").Patch(
                m, postfix: new HarmonyLib.HarmonyMethod(typeof(RailUi), nameof(GlistKeyboardGuardPostfix)));
            CabinetEverywherePlugin.Log.LogInfo("[CERail] glist 键盘守卫已武装（零参数后置）");
        }
        catch (Exception e) { CabinetEverywherePlugin.Log.LogWarning("[CERail] glist 键盘守卫武装异常: " + e.Message); }
    }
    private static void GlistKeyboardGuardPostfix()
    {
        if (!_gkHanded || _gkLayer == null) return;
        try
        {
            if (_gkLayer.IsKeyboardEnabled) return; /* 现值开=无事（含我方夺回/重申的 true 调用） */
            _gkLayer.SetKeyboardEnabled(true);
            if (_gkRepelled < 5)
            {
                _gkRepelled++;
                string who = "";
                try { who = "\n" + new System.Diagnostics.StackTrace().ToString(); } catch { }
                CabinetEverywherePlugin.Log.LogWarning("[CERail] glist 键盘守卫拦截压关并夺回 #" + _gkRepelled + who);
            }
        }
        catch { }
    }
    private static void GlistKeyboardReturn(GameCore.HotUpdate.ReduxUI.WebUILayer layer = null)
    {
        _gkHanded = false;
        _gkLayer = null;
        try
        {
            if (layer == null && GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                layer = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance?.GetWebUILayer();
            layer?.SetKeyboardEnabled(false);
            UnityEngine.Input.imeCompositionMode = _gkPrevIme;
            CabinetEverywherePlugin.Log.LogInfo("[CERail] glist 键盘门关：还原官方键盘管理");
        }
        catch (Exception e) { CabinetEverywherePlugin.Log.LogWarning("[CERail] glist 键盘门关异常: " + e.Message); }
    }
    private static bool GlistAnyPageActive(GameCore.HotUpdate.ReduxUI.WebUILayer layer, string[] keys)
    {
        foreach (var k in keys) { try { if (layer.IsPageActive(k)) return true; } catch (Exception e) { PerfDiag.Swallow("gk.ispageactive:" + e.GetType().Name); } } // [PERFDIAG]
        return false;
    }
    internal static Vuplex.WebView.IWebView ActiveWebView => GetWebView(); // v1.8.10 十三批六追：OpPing 通道对照实验用（微包回执）
    internal static Il2CppSystem.Action<string> PushAckCallback
    { // 惰性建（与 PushIfDue 内同款；命名方法 PushAck）
        get
        {
            if (_pushAckCb == null)
                _pushAckCb = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<Il2CppSystem.Action<string>>(
                    new Action<string>(PushAck));
            return _pushAckCb;
        }
    }

    /// <summary>JS 字符串字面量转义（TagFilter.EscapeJs 同款，railui.css 文本进 bootstrap 用；
    /// TradeFx 分块推送复用——转义语义全库只此一处实现）。</summary>
    internal static string EscapeJs(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var sb = new System.Text.StringBuilder(s.Length + 8);
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '\\': sb.Append("\\\\"); break;
                case '"': sb.Append("\\\""); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (ch < ' ') sb.Append(' ');
                    else sb.Append(ch);
                    break;
            }
        }
        return sb.ToString();
    }

    private static void WarnOnce(string key, string msg)
    {
        if (Warned.Add(key))
            CabinetEverywherePlugin.Log?.LogWarning("[CERail] " + msg);
    }
}
