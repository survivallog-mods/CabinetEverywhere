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
    private static void PushAck(string _) { } // 空回调体（命名方法=与 drainCb 同款 ConvertDelegate 模式；回调内零动作，红线1）

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
    // 直写 size[0]=目标宽——**勿回 RewriteSize 的 mult 路**：want=原值×(目标/当前宽)，重跑时
    // 当前宽=已改值 → 想要值被弹回原宽（12↔16 振荡）；v1.8.3 靠「每会话一次」掩盖了这一点。
    // 幂等：已是目标宽零写零日志；5s 周期重扫（RefreshMeta 慢通道）——新放柜子/换档重读 ≤5s
    // 收敛、cfg UniformBagWidth 改值当场跟进；高不变，容量=宽×高随之变；0=off（已写值不回滚）。
    private static string _sizeSig = ""; // 目标集签名（集合/宽未变=零日志快路径；异常轮不记号下轮重试）

    internal static void SizeEnginePoll()
    {
        int w;
        try { w = CabinetEverywherePlugin.UniformBagWidth?.Value ?? 12; } catch { w = 12; }
        if (w <= 0) return; // 0=off
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
            if (ids.Count == 0) return; // 目录未就绪/家中无柜：下轮再看

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

            var targets = new List<int>();
            var skipped = new List<string>();
            foreach (var bagId in ids)
            {
                if (skip.Contains(bagId)) { skipped.Add(bagId + "(排除共包)"); continue; }
                targets.Add(bagId);
            }
            targets.Sort();
            skipped.Sort(string.CompareOrdinal);
            var sig = w + "|" + string.Join(",", targets) + "|" + string.Join(",", skipped);
            if (sig == _sizeSig) return; // 集合与宽都未变：零日志零写
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
                    if (cw <= 0 || cw == w) continue;
                    size[0] = w; // 直写宽（高不动）
                    changed++;
                    detail.Add(bagId + "(" + BagTable.Name(bag) + ")" + cw + "→" + w);
                }
                catch { errs++; }
            }
            if (errs > 0) _sizeSig = ""; // 有异常：签名不记，下轮重试（防单包偶发失败被签名门吞掉）
            if (changed > 0) BagTable.InvalidateBagSizeIndex(cm, new List<string>());
            CabinetEverywherePlugin.Log.LogInfo(
                (changed > 0
                    ? $"[CERail] SizeEngine：柜宽统一 {w} 列——改写 {changed} 包：" + string.Join("、", detail)
                    : $"[CERail] SizeEngine：目标 {targets.Count} 包均已 {w} 列")
                + (skipped.Count > 0 ? "；跳过 " + skipped.Count + " 包：" + string.Join(",", skipped) : "")
                + "（目标=家中柜子+冰箱，材料架不动；排除=ExcludeBagIds+家中排除家具共包；Config_Bag 内存直写，5s 幂等重扫）");
        }
        catch (Exception e)
        {
            WarnOnce("sizeengine", "SizeEngine 异常: " + e.Message);
        }
    }

    internal static void Tick()
    {
        // cfg 门（T8）：首行判定，覆盖 bootstrap 注入/数据推送/drain/Pump 全部路径
        if (!Enabled) return;
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

            // bootstrap 注入（T8）：幂等，每周期执行（WebView 重建自动重挂）；探活确认见下
            InjectBootstrap(web);

            // 世界重绑检测（第十二轮：退主菜单重读档——LogicWorld 引用变即复位管线，
            // 否则门②永拦=契约冻结旧世界 id=排序失效+角标全空）
            if (RailData.CheckWorldRebind())
            {
                RailData.OnWorldRebind();
                _lastPage = null; /* 视为新开机：首个场景必推 */
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
        }
        catch (Exception e)
        {
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
    private static int PushIfDue(Vuplex.WebView.IWebView web)
    {
        string page = RailData.ActivePage();
        bool pageChanged = !string.Equals(page, _lastPage, StringComparison.Ordinal);
        if (!pageChanged && !RailData.ItemsDirty()) return -1;

        var (json, rev) = RailData.BuildJson();
        if (json == null) return -1; // 背包 owner 不可得（findings §4 兜底③），等下一周期

        if (_pushAckCb == null)
            _pushAckCb = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<Il2CppSystem.Action<string>>(
                new Action<string>(PushAck)); // 命名方法（与 _drainCb 同款模式；空回调只走「带回调」可达通道）
        web.ExecuteJavaScript("window.__CERAIL__&&window.__CERAIL__.setData(" + json + ")", _pushAckCb);
        _lastPage = page;

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
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return;
            if (!RailData.AnyRailSceneActive()) return;
            if (!RailData.StructureChangedFast()) return;
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
            WarnOnce("fastpoll", "快通道推送失败: " + e.Message);
        }
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
        catch { return null; }
    }

    /// <summary>JS 字符串字面量转义（TagFilter.EscapeJs 同款，railui.css 文本进 bootstrap 用）。</summary>
    private static string EscapeJs(string s)
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
