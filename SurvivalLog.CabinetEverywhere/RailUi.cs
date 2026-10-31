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

    /// <summary>cfg [Rail] Enable（T8 裁定 4）：false=不注入/不推数/drain（含 Pump）全停。</summary>
    internal static bool Enabled =>
        CabinetEverywherePlugin.RailEnable == null || CabinetEverywherePlugin.RailEnable.Value;

    // ================= v13.8 SizeEngine：柜宽统一（作者 2026-10-31 拍板 12 列） =================
    private static bool _sizeEngineDone = false;
    private static void SizeEngineOnce()
    {
        if (_sizeEngineDone) return;
        int w;
        try { w = CabinetEverywherePlugin.UniformBagWidth?.Value ?? 12; } catch { w = 12; }
        if (w <= 0) { _sizeEngineDone = true; return; } // 0=off：本会话不再检查
        try
        {
            var cm = BagTable.Cm();
            var bags = BagTable.BagDict(cm);
            var furns = BagTable.FurnDict(cm);
            if (bags == null || furns == null || bags.Count == 0) return; // 配置表未就绪：下轮再试
            var ids = new HashSet<int>();
            foreach (var c in CabinetCatalog.AllContainers)
            {
                try { if (furns.TryGetValue(c.ConfigId, out var f) && f != null && f.BagId > 0) ids.Add(f.BagId); } catch { }
            }
            if (ids.Count == 0) return; // 目录未就绪（家具未扫描）：下轮再试
            int changed = 0;
            foreach (var bagId in ids)
            {
                try
                {
                    if (!bags.TryGetValue(bagId, out var bag) || bag == null) continue;
                    int cw = bag.Size != null && bag.Size.Count > 0 ? bag.Size[0] : 0;
                    if (cw <= 0 || cw == w) continue;
                    var r = BagTable.RewriteSize(new HashSet<int> { bagId }, w / (float)cw, 1f, false);
                    if (r.Item2 > 0) changed++;
                }
                catch { }
            }
            _sizeEngineDone = true;
            if (changed > 0)
                CabinetEverywherePlugin.Log.LogInfo($"[CERail] SizeEngine：{changed}/{ids.Count} 个柜宽已统一为 {w} 列（Config_Bag.Size 内存直写，本会话一次）");
        }
        catch (Exception e)
        {
            _sizeEngineDone = true; // 异常也不重试（保持官方原宽，无害）
            CabinetEverywherePlugin.Log.LogWarning("[CERail] SizeEngine 异常: " + e.Message);
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

            // v13.8 SizeEngine（作者拍板：所有柜子宽度 12 列）：每会话一次，目录内全部柜子的
            // Config_Bag.Size 宽改写为 [Rail] UniformBagWidth（BagTable 内存表直写/幂等/原值记忆；
            // 每会话仅执行一次且首读即真原值——mult=目标/当前宽；0=off）。高不变，容量=宽×高随之变。
            SizeEngineOnce();

            var web = GetWebView();
            if (web == null) return;

            // bootstrap 注入（T8）：幂等，每周期执行（WebView 重建自动重挂）；探活确认见下
            InjectBootstrap(web);

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
            string page = RailData.ActivePage();
            bool pageChanged = !string.Equals(page, _lastPage, StringComparison.Ordinal);
            if (!pageChanged && !RailData.ItemsDirty()) return;

            var (json, rev) = RailData.BuildJson();
            if (json == null) return; // 背包 owner 不可得（findings §4 兜底③），等下一周期

            web.ExecuteJavaScript("window.__CERAIL__&&window.__CERAIL__.setData(" + json + ")");
            _lastPage = page;

            // Debug.Verbose（T14 实机校准观测点）：json 头 200 字符 + 容器数/物品行数/icfg 行数/rev
            if (CabinetEverywherePlugin.Verbose?.Value == true)
                CabinetEverywherePlugin.Log?.LogInfo(
                    $"[CERail] 推送 rev={rev} page={page ?? ""}：容器 {RailData.LastCtnRows}，物品行 {RailData.LastItemRows}，icfg {RailData.LastIcfgRows}\n  head: {RailData.LastJsonHead}");
        }
        catch (Exception e)
        {
            WarnOnce("tick", "rail 数据推送失败: " + e.Message);
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
            web.ExecuteJavaScript(BootstrapJs);
        }
        catch (Exception e)
        {
            WarnOnce("bootstrap", "bootstrap 注入失败: " + e.Message);
        }
    }

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
