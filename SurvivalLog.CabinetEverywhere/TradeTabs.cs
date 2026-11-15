using System;
using System.Collections.Generic;
using GameCore.HotUpdate;
using GameCore.HotUpdate.ReduxUI;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 交易页柜子页签补挂 v2（2026-11-08 作者实报：无人机交易「回应求助」页不显示储物柜页签栏；
/// v1 状态层直挂已证伪——见下）。
///
/// 官方数据流（gamekb 2026-11-05_26454866 反汇编取证，RVA 全档内）：
/// - 页面消费的唯一数据源 = State_Web_TradeUI 的各 ReactiveProperty（WebBind 属性直绑
///   _BagMsg 字段——dump@223099 `[WebBind_String("_BagMsg","bagTabsJson")] BagTabsJson`）；
///   **BagTabs（List&lt;BagTabEntry&gt;）只是 reducer 工作集，改它页面永远看不见**。
/// - 柜子页签链：LogicAdapter.OnBtOpenXXX → NotifyGlobal(3049) → ItemManager.
///   OnTradeContainerTabsRequest(0x2790DC0) → CollectTradeContainers(0x2776C50) →
///   Ac_TradeUI_SetContainerTabs.SendAction(list) → RA_SetContainerTabs(0x2D55B80)：
///   **state.Containers(0xF8)=action.Containers** → RebuildBagTabs(0x2D56860) 从
///   Containers+背包 重建 BagTabs 列表**并手搓 StringBuilder 重序列化 BagTabsJson**
///   （RP 变更→WebBind 推送 JS）→ phase=='trade' 则 Refresh。
/// - 电台回应求助路（OnBtOpenTradeRosterUI 0x2A66A50）在 TradeUI WebView 挂载完成前
///   **同帧**发 3049 收集请求，晚到/丢弃不定（对照：官方另一条派送路 SwitchTradeToDispatchAsync
///   0x2A923D0 特意 等 UI 关净→Ac_OpenUI→逐帧等挂载→才请求=官方自己知道该时序）；选人
///   （PickRosterCore 0x2D52270）只切 phase，无重发 → 该路容器页签出现与否全看竞态。
///   正常终端交易路时序无竞态=页签稳定——故「正常交易有、回应求助没有（或时有时无）」。
///
/// v1 教训（本类首版，已整体替换）：向 BagTabs 列表尾插 BagTabEntry+Repush（DrawerTabs 同款）
/// ——列表变更不触发 BagTabsJson 重序列化，MarkAllMsgDirty 只会把 msg 里**旧字符串**原样重发，
/// 页面永远渲染旧页签集。CDP 实测（16:38 在机）：C# 列表已含 23 柜+抽屉，页面 tabs=1（仅背包）。
/// （同病根提醒：DrawerTabs 交易页抽屉页签 / TabGate.PollTrade 视图修剪与序重排 / FixStaleTradeSizes
///   宽度自愈——全是列表级写=交易页零渲染，历来「工作正常」实为原生路径恰好自足；后续批另修。）
///
/// v2 修法=**走官方源名单**：Ensure 缺席柜子进 State.Containers（List&lt;TradeContainerInfo&gt;
/// {OwnerId/FurnitureConfigId/IsFridge/Pinned} 平字段 POCO），然后直调游戏自家
/// Ac_TradeUI_SetContainerTabs.SendAction(合并表)——官方 reducer 全链自跑：Containers 落位 →
/// RebuildBagTabs 原生重建列表+json+推送（命名走官方 ToConstantText、尺寸走官方 Config 快照）、
/// phase=trade 再 Refresh。与晚到的官方收集动作互为幂等（整表替换+本类 have 判重），后续任何
/// 官方重建（切页签/RefreshBag）都从 Containers 读=**补挂柜子在 state 生命周期内原生存活、零闪烁**；
/// state 重建（每次开页）后本类 ≤0.5s 再补。注入集=HomeInstances（白名单同源柜子集）按
/// View_Trade 谓词+筛选 sel（v1.9.2）过滤——与页面可见性口径一致，防「我补它剪」震荡。
/// 门=General.Enabled + EnableCraftSource（交易柜子页签本就是白名单族特性，cfg 原句「白名单注入：
/// 工作台/无人机交易/…的柜子页签」）。纯 UI 态写（零配置/存档写），重开界面即还原官方。
/// </summary>
internal static class TradeTabs
{
    private static readonly Il2CppSystem.Type TradeType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_TradeUI));

    private static readonly HashSet<string> Warned = new();
    private static void WarnOnce(string key, string msg)
    {
        if (Warned.Add(key)) CabinetEverywherePlugin.Log.LogWarning("[CabinetEverywhere.TradeTabs] " + msg);
    }
    private static void Log(string msg) => CabinetEverywherePlugin.Log.LogInfo("[CabinetEverywhere.TradeTabs] " + msg);

    // ---- FastPoll（DrawerTabs.FastOne 同款纪律：开界面短窗每帧抢跑，抢在首推/选人重建前落地；
    //      Ensure 内置 0.5s 派发节流防队列连打） ----
    private sealed class FlipWin { public bool WasActive; public int Frames; }
    private static FlipWin _flip = new();
    private static DateTime _lastDispatch = DateTime.MinValue;

    /// <summary>每帧（AccessTicker，DrawerTabs.FastPoll 旁）：TradeUI 翻转短窗内每帧 Ensure（幂等）。</summary>
    internal static void FastPoll()
    {
        if (CabinetEverywherePlugin.Enabled != null && !CabinetEverywherePlugin.Enabled.Value) return;
        if (CabinetEverywherePlugin.EnableCraftSource == null || !CabinetEverywherePlugin.EnableCraftSource.Value) return;
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return;
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            if (rus == null) return;
            bool active = SafeActive(rus, TradeType);
            if (!active) { _flip.WasActive = false; _flip.Frames = 0; return; }
            if (!_flip.WasActive) { _flip.WasActive = true; _flip.Frames = 20; }
            if (_flip.Frames > 0) { _flip.Frames--; Ensure(rus); }
        }
        catch (Exception e)
        {
            WarnOnce("fastpoll", "交易页柜子页签瞬帧补挂异常: " + e.Message);
        }
    }

    /// <summary>0.5s 轮询（AccessTicker 快通道）：覆盖 state 重建（每次开页 Containers 清零）后的补挂。</summary>
    internal static void PollAll()
    {
        if (CabinetEverywherePlugin.Enabled != null && !CabinetEverywherePlugin.Enabled.Value) return;
        if (CabinetEverywherePlugin.EnableCraftSource == null || !CabinetEverywherePlugin.EnableCraftSource.Value) return;
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return;
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            if (rus == null) return;
            if (!SafeActive(rus, TradeType)) return;
            Ensure(rus);
        }
        catch (Exception e)
        {
            WarnOnce("poll", "交易页柜子页签轮询异常: " + e.Message);
        }
    }

    private static bool SafeActive(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, Il2CppSystem.Type t)
    {
        try { return rus.IsUIActive(t); } catch { return false; }
    }

    /// <summary>
    /// Ensure 主体：HomeInstances 缺席柜子（视图+sel 过滤后）逐台造 TradeContainerInfo 追加进
    /// Containers（null=官方收集未到过，直接新建整表），有增量则 Ac_TradeUI_SetContainerTabs.
    /// SendAction(合并表) 走官方 reducer 全链（reducer 会把本表整表赋回 state.Containers——
    /// 传活实例自赋值无害）。派发后 0.5s 节流窗：reducer 入队到落位有帧差，窗内不重复派发
    /// （have 判重随后接管=稳态零派发）。
    /// </summary>
    private static void Ensure(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var st = rus.GetStateByUI(TradeType)?.TryCast<State_Web_TradeUI>();
        if (st == null) return;

        string view = TabGate.ViewOfEntry(CabinetEverywherePlugin.ViewTrade);
        var ctx = TabGate.TagCtx.Build();
        TabGate.LoadFilters().TryGetValue("trade", out var sel); /* v1.9.2 筛选下拉选中（在用则同步收窄注入集） */

        var containers = st.Containers;
        var have = new HashSet<long>();
        if (containers != null)
        {
            for (int i = 0; i < containers.Count; i++)
            {
                try { var t = containers[i]; if (t != null && t.OwnerId != 0) have.Add(t.OwnerId); } catch { }
            }
        }

        int added = 0;
        var names = new List<string>();
        foreach (var c in CabinetCatalog.HomeInstances)
        {
            if (have.Contains(c.OwnerId)) continue;
            if (TabGate.Judge(c.OwnerId, view, ctx, sel) == TabGate.Verdict.Remove) continue;
            try
            {
                if (containers == null) containers = new Il2CppSystem.Collections.Generic.List<TradeContainerInfo>();
                containers.Add(new TradeContainerInfo
                {
                    OwnerId = c.OwnerId, FurnitureConfigId = c.ConfigId, IsFridge = false, Pinned = false,
                });
                added++;
                names.Add($"{c.Name}({c.OwnerId})");
            }
            catch (Exception e)
            {
                WarnOnce("add_" + c.OwnerId, $"交易页容器名单补挂失败 ownerId={c.OwnerId}: {e.Message}");
            }
        }
        if (added == 0) return;
        if ((DateTime.UtcNow - _lastDispatch).TotalSeconds < 0.5) return; /* 派发节流：队列落位帧差窗 */

        try
        {
            _lastDispatch = DateTime.UtcNow;
            Ac_TradeUI_SetContainerTabs.SendAction(containers);
            Log($"交易页容器名单已补 {added} 台：{string.Join("、", names)}——官方 SetContainerTabs 全链重建页签（回应求助路收集竞态补挂；正常交易路=官方已在零动作）");
        }
        catch (Exception e)
        {
            WarnOnce("send", "Ac_TradeUI_SetContainerTabs.SendAction 异常: " + e.Message);
        }
    }
}
