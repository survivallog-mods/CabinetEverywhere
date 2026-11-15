using System;
using HarmonyLib;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// CookingFx 官方刷新事件钩（TradeFxRefreshHook 同款架构，作者批改9②：治 0.5s 轮询延迟——
/// 打开烹饪界面/切换食材后区间与排序数值可感迟滞）。目标：Reducer_Web_Cooking.RefreshRecipeList
/// （private static void，官方菜谱/预测状态落定的汇聚点）postfix 只置事件位（零状态触碰，
/// 异常吞掉不扰官方链）；AccessTicker.Update 每帧 CookingFx.FastPoll 消费——官方状态落定
/// 当帧即推，0.5s 轮询保留为兜底（WebView 重建/漏沿路）。
/// </summary>
internal static class CookingFxRefreshHook
{
    private static bool _installed;

    internal static void Install()
    {
        if (_installed) return;
        try
        {
            var original = HarmonyLib.AccessTools.Method(
                typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_Cooking), "RefreshRecipeList");
            if (original == null)
            {
                CabinetEverywherePlugin.Log.LogWarning("[CookingFx] RefreshRecipeList 钩未装上（方法缺失，回退纯 0.5s 轮询）");
                return;
            }
            var h = new Harmony("com.local.survivallog.cabineteverywhere.cookingfxrefresh");
            h.Patch(original, postfix: new HarmonyMethod(typeof(CookingFxRefreshHook), nameof(Postfix)));
            _installed = true;
            CabinetEverywherePlugin.Log.LogInfo("[CookingFx] 官方刷新沿钩已挂（区间/排序数值帧级推送）");
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CookingFx] 刷新沿钩安装异常（回退纯 0.5s 轮询）: " + e.Message);
        }
    }

    private static void Postfix()
    {
        try { CookingFx.OnOfficialRefresh(); } catch { }
    }
}
