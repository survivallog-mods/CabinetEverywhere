using System;
using System.Collections.Generic;
using GameCore.HotUpdate.ReduxUI;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 交易页柜子页签状态层补挂（2026-11-08 作者实报：无人机交易「回应求助」页不显示储物柜页签栏）。
///
/// 根因（gamekb 2026-11-05_26454866 反汇编取证，RVA 全档内）：
/// - 交易页柜子页签原生收集链 = LogicAdapter.OnBtOpenXXX → NotifyGlobal(3049
///   TradeContainerTabsRequest) → ItemManager.OnTradeContainerTabsRequest(0x2790DC0)
///   → CollectTradeContainers(0x2776C50，白名单 IsCraftSource 过滤——mod 白名单注入本在生效)
///   → NotifyGlobal(3050 Ready) → LogicAdapter → Ac_TradeUI_SetContainerTabs →
///   RA_SetContainerTabs(0x2D55B80) 写 state 容器名单 + RebuildBagTabs(0x2D56860)。
/// - 电台回应求助路（LogicAdapter.OnBtOpenTradeRosterUI 0x2A66A50）：Ac_TradeUI_OpenRoster
///   建全新 state（OpenRosterCore 0x2D4FD40 只 RebuildBagTabs=背包单页签）后**同帧**发 3049
///   收集请求——该请求在 TradeUI WebView 挂载完成前到达，容器页签晚到即丢（对照：另一条
///   派送路 SwitchTradeToDispatchAsync 0x2A923D0 特意 等 UI 关净→Ac_OpenUI→逐帧等挂载
///   →才 RequestTradeContainerTabs=官方自己知道该时序）；选人（PickRosterCore 0x2D52270）
///   只切 phase 进 disp 态，全程无任何重发收集的路径 → 柜子页签在回应求助页永不出现。
///   正常交易路（终端直开）时序无此竞态 → 页签齐全——故「正常交易有、回应求助没有」。
/// - 旁证（作者 11-08 实机 LogOutput）：Trade 常开期间 DrawerTabs「交易页签已补」反复出现
///   =官方在 roster/pick 等节点反复重建 BagTabs，mod 侧补挂条目随之被清再补=既有收敛节奏。
///
/// 修法（DrawerTabs 同页同款先例——工作台抽屉页签即本页 List&lt;BagTabEntry&gt; POCO 尾插）：
/// TradeUI 激活期间对 BagTabs 做 Ensure——HomeInstances（=白名单同源柜子集）里缺页签的
/// 逐台补挂（视图/筛选谓词同 TabGate 单一事实源；正常交易路官方原生已在=零动作幂等）。
/// 纯视图层状态追加：零配置写、零存档写、重开界面即消（TabInjector/DrawerTabs 同生命周期）。
/// 门=General.Enabled + EnableCraftSource（交易页柜子页签本就是白名单族特性，cfg 描述原句
/// 「白名单注入：工作台/无人机交易/…的柜子页签与自动取料」——本补是同一承诺在回应求助页兑现）。
/// 语义边界（与抽屉页签同）：页签=手动搬运；回应求助装货本就全手动，无自动货源语义缺口。
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

    // ---- FastPoll（DrawerTabs.FastOne 同款纪律：开界面短窗每帧抢跑，抢在官方首推序列化前
    //      落地=治开页闪「先背包后柜子」；稳态零动作，重活归 0.5s 轮询） ----
    private sealed class FlipWin { public bool WasActive; public int Frames; }
    private static FlipWin _flip = new();

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

    /// <summary>0.5s 轮询（AccessTicker 快通道，DrawerTabs.PollAll 之后）：覆盖 roster→pick 等
    /// 页中重建（官方重建即清补挂条目，≤0.5s 收敛=抽屉页签既有节奏）。</summary>
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

    private static State_Data_Item StateItem(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        try
        {
            var dataTree = rus?.reduxStoreLayer?.dataTree;
            GameCore.HotUpdate.ReduxUI.BaseReduxState raw = null;
            dataTree?.TryGetValue(Il2CppInterop.Runtime.Il2CppType.From(typeof(State_Data_Item)), out raw);
            return raw?.TryCast<State_Data_Item>();
        }
        catch { return null; }
    }

    /// <summary>柜子 live 尺寸（owner→BagCache→Config_Bag.Size——FixStaleTradeSizes 同源；
    /// 读不到=袋未注册，本轮跳过下轮再看（宁缺不错尺寸，官方数组未含它时本也显示不出））。</summary>
    private static bool SizeOf(Il2CppSystem.Collections.Generic.Dictionary<long, int> bagCache,
        Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Bag> bags, long owner, out int cols, out int rows)
    {
        cols = rows = 0;
        try
        {
            int cfgId = 0;
            if (bagCache == null || bags == null) return false;
            if (!bagCache.TryGetValue(owner, out cfgId) || cfgId == 0) return false;
            if (!bags.TryGetValue(cfgId, out var b) || b?.Size == null || b.Size.Count < 2) return false;
            cols = b.Size[0]; rows = b.Size[1];
            return cols > 0 && rows > 0;
        }
        catch { return false; }
    }

    /// <summary>
    /// Ensure 主体：HomeInstances 缺页签的柜子逐台尾插 BagTabEntry（DrawerTabs.EnsureTrade 同构：
    /// owner/name/fridge/player/cols/rows/rack/rackCfg/pin 平字段）。注入集按 View_Trade 视图谓词
    /// +（若在用）筛选下拉 sel 过滤——与 TabGate.PollTrade 收窄口径一致，防「我补它剪」震荡。
    /// 正常交易路官方原生已含全部白名单柜=have 全命中零动作；回应求助路补齐后页签栏即现
    /// （TradeUI.html bag-tabs v-if="bag.tabs.length>1"）。
    /// </summary>
    private static void Ensure(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var tabs = rus.GetStateByUI(TradeType)?.TryCast<State_Web_TradeUI>()?.BagTabs;
        if (tabs == null || tabs.Count == 0) return; // 官方首推未就绪：不猜（DrawerTabs「官方首推后再补」同纪律）

        var have = new HashSet<long>();
        for (int i = 0; i < tabs.Count; i++)
        {
            try { var t = tabs[i]; if (t != null && t.owner != 0) have.Add(t.owner); } catch { }
        }

        string view = TabGate.ViewOfEntry(CabinetEverywherePlugin.ViewTrade);
        var ctx = TabGate.TagCtx.Build();
        TabGate.LoadFilters().TryGetValue("trade", out var sel); /* v1.9.1 筛选下拉选中（在用则同步收窄注入集） */

        var bagCache = StateItem(rus)?.BagCache;
        var bags = SurvivalLog.ModShared.BagTable.BagDict(SurvivalLog.ModShared.BagTable.Cm());

        int added = 0;
        var names = new List<string>();
        foreach (var c in CabinetCatalog.HomeInstances)
        {
            if (have.Contains(c.OwnerId)) continue;
            if (TabGate.Judge(c.OwnerId, view, ctx, sel) == TabGate.Verdict.Remove) continue;
            if (!SizeOf(bagCache, bags, c.OwnerId, out var cols, out var rows))
            {
                WarnOnce("size_" + c.OwnerId, $"柜子 {c.Name}(0x{c.OwnerId:X}) 尺寸未就绪，本轮跳过（下轮再看）");
                continue;
            }
            try
            {
                tabs.Add(new State_Web_TradeUI.BagTabEntry
                {
                    owner = c.OwnerId, name = c.Name, fridge = false, player = false,
                    cols = cols, rows = rows, rack = false, rackCfg = 0, pin = false,
                });
                added++;
                names.Add($"{c.Name}({c.OwnerId})");
            }
            catch (Exception e)
            {
                WarnOnce("add_" + c.OwnerId, $"交易页柜子页签补挂失败 ownerId={c.OwnerId}: {e.Message}");
            }
        }
        if (added > 0)
        {
            Log($"交易页柜子页签已补 {added} 个：{string.Join("、", names)}（回应求助路官方收集缺位，状态层补挂；正常交易路=原生已在零动作）");
            TabInjector.Repush(rus, TradeType);
        }
    }
}
