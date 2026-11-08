using System;
using HarmonyLib;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// TradeFx 官方刷新事件钩（全库第 4 个 patch，实机批改二批 2026-11-08）。
/// 目标：Reducer_Web_TradeUI.Refresh（private static，主帧 reducer 语义）——postfix 只做
/// 一件事：TradeFx.OnOfficialRefresh() 置事件位（零状态触碰，异常吞掉不扰官方链）。
/// 动机（实机取证）：0.5s 轮询可能落在「官方状态已变、页面 DOM 未渲染完」的中间瞬间，
/// 纯推送驱动一次错过即死到下一包；事件沿=官方 reducer 状态落定才推（BetterTrade
/// ValuesOnRefresh 同款架构）。0.5s AccessTicker 轮询保留为兜底（漏沿/WebView 重建路）。
/// 装法：RefreshCoalescer 同款手动 harmony.Patch（AccessTools.Method 按名解析）。
/// </summary>
internal static class TradeFxRefreshHook
{
    private static bool _installed;

    internal static void Install()
    {
        if (_installed) return;
        try
        {
            var original = HarmonyLib.AccessTools.Method(
                typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_TradeUI), "Refresh");
            if (original == null)
            {
                CabinetEverywherePlugin.Log.LogWarning("[TradeFx] Refresh 钩未装上（方法缺失，回退纯 0.5s 轮询）");
                return;
            }
            var h = new Harmony("com.local.survivallog.cabineteverywhere.tradefxrefresh");
            h.Patch(original, postfix: new HarmonyMethod(typeof(TradeFxRefreshHook), nameof(Postfix)));
            _installed = true;
            CabinetEverywherePlugin.Log.LogInfo("[TradeFx] Refresh 钩已挂（build T5——进程内构建标识，部署核验用）");
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[TradeFx] Refresh 钩安装异常（回退纯 0.5s 轮询）: " + e.Message);
        }
    }

    private static void Postfix()
    {
        try { TradeFx.OnOfficialRefresh(); } catch { }
    }
}
