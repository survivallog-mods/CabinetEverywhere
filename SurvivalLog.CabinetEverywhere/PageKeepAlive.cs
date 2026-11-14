using System;
using HarmonyLib;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 页面常驻实验（spec 2026-11-14 页面常驻；独立分支 perf/page-keepalive，不过关整支丢弃）。
///
/// 病灶（实测+PERF_NOTES P1/P12 定责）：开背包/整理页 ≈800ms/次——原生 iframe 重建（装载
/// HTML+JS 启动 ≈400ms，Harmony 不可达）+ RA_OpenUI 状态重建（≈400ms）。官方 RemovePage
/// 销毁页面 → 每次开都全价重建。
///
/// 拦截面（dump 2026-11-12 + 反汇编实证）：
/// - WebUILayer.HidePage/ShowPage（0x2E06960/0x2E10CC0，各 0x120B）= 仅向 Root 发显隐消息
///   （WebUIProtocol.Build→PostOrQueueRootMessage），零销毁零假设——官方自己的页面切换机制；
/// - WebUILayer.RemovePage（0x2E0C9F0）= 发移除消息 + PageMap.Remove + 销毁；
/// - WebUILayer.LoadPage(Type)（返回 WebUIVm）；背包页 pageId 实测="Backpack"
///   （glist 遥测 PageMap keys 实录：CoreUI1/ActionEcho/Backpack/MaterialRack…）。
///
/// 行为：
/// - 关：RemovePage("Backpack") → 改调 HidePage（iframe+JS 世界原地保留，逻辑关闭照官方）；
/// - 开：LoadPage(WebUI_BackpackUI) 且缓存页在场 → ShowPage + 从 PageMap 取回 vm 作返回值
///   （跳过原生重建）+ SendMessageToPage 补一次视图刷新（隐藏期间官方不给非活跃页推视图）；
///   数据层无需追平（Redux 状态本就不随页面销毁——关页标记案的实证）；
/// - 换档：OnWorldRebind 清缓存（真 RemovePage，下次开全价重建）；
/// - 兜底：任何一步异常/缓存不在场 → 放行官方原路径（失败模式=回到现状）。
///
/// 已知边界（实机验证项）：LoadPage&lt;T&gt; 泛型若不落 LoadPage(Type) 则缓存永不命中（无 harm）；
/// RA_OpenUI 状态重建仍每次执行（v1 只省原生半），同上下文跳过留 v2。
/// </summary>
internal static class PageKeepAlive
{
    private const string PageId = "Backpack";

    private static bool _installed;
    private static bool _cached; // 关页时被 Hide 保留、尚未被重新 Show 的页

    internal static void Install()
    {
        if (_installed) return;
        try
        {
            var h = new Harmony("com.local.survivallog.cabineteverywhere.pagekeepalive");
            var layer = typeof(GameCore.HotUpdate.ReduxUI.WebUILayer);

            // 方法解析（两轮实锤）：①AccessTools.Method 带参数类型失败；②typeof(System.Type)
            // 形参比对失败——Il2Cpp 互操作程序集里 Type 形参是 Il2CppSystem.Type 包装，托管
            // System.Type 恒不等（日志 rm=True ld=False）。定案：按形参类型 Name 字符串匹配；
            // prefix 形参也用 Il2CppSystem.Type（与互操作签名一致，Harmony 按名绑定才成立）。
            System.Reflection.MethodBase rm = null, ld = null;
            foreach (var m in AccessTools.GetDeclaredMethods(layer))
            {
                var n = m?.Name;
                if (n != "RemovePage" && n != "LoadPage") continue;
                var ps = m.GetParameters();
                if (ps.Length != 1) continue;
                var pn = ps[0].ParameterType.Name;
                if (n == "RemovePage" && pn == "String") rm = m;
                if (n == "LoadPage" && pn == "Type") ld = m;
            }
            if (rm == null || ld == null)
            {
                CabinetEverywherePlugin.Log.LogWarning("[CE.页面常驻] 方法解析失败 rm=" + (rm != null) + " ld=" + (ld != null) + "，未装（零影响）");
                return;
            }
            h.Patch(rm, prefix: new HarmonyMethod(typeof(PageKeepAlive), nameof(PreRemovePage)));
            h.Patch(ld, prefix: new HarmonyMethod(typeof(PageKeepAlive), nameof(PreLoadPage)));
            _installed = true;
            CabinetEverywherePlugin.Log.LogInfo("[CE.页面常驻] 已挂（RemovePage→HidePage / LoadPage→ShowPage+PageMap 取回）");
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CE.页面常驻] 安装失败（零影响）: " + e.Message);
        }
    }

    /// <summary>世界重绑（RailData.OnWorldRebind 调）：旧世界的页面内容全部作废——真移除，弃缓存。</summary>
    internal static void OnWorldRebind()
    {
        if (!_cached) return;
        _cached = false;
        try
        {
            var layer = Layer();
            layer?.RemovePage(PageId); // 官方真移除（本 prefix 对非缓存路径放行；_cached 已先清）
        }
        catch { }
    }

    private static GameCore.HotUpdate.ReduxUI.WebUILayer Layer()
    {
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return null;
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            return rus?.GetWebUILayer();
        }
        catch { return null; }
    }

    /// <summary>关页拦截：Backpack 改 HidePage（保留 iframe+JS 世界），其余页照常销毁。</summary>
    private static bool PreRemovePage(GameCore.HotUpdate.ReduxUI.WebUILayer __instance, string pageId)
    {
        try
        {
            if (pageId != PageId || !_enabled) return true;
            __instance.HidePage(pageId);
            _cached = true;
            CabinetEverywherePlugin.Log.LogInfo("[CE.页面常驻] Backpack 已隐藏保留（重开=ShowPage，跳过原生重建）");
            return false; // 跳过官方销毁
        }
        catch
        {
            _cached = false;
            return true; // 任何异常=放行官方销毁（兜底=现状）
        }
    }

    /// <summary>开页拦截：缓存命中 → ShowPage + PageMap 取回 vm（跳过 LoadPage 原体重建）。
    /// uiType=Il2CppSystem.Type（互操作签名）；类名比对（Name 无命名空间，足够判 WebUI_BackpackUI）。</summary>
    private static bool PreLoadPage(
        GameCore.HotUpdate.ReduxUI.WebUILayer __instance,
        Il2CppSystem.Type uiType,
        ref GameCore.HotUpdate.ReduxUI.WebUIVm __result)
    {
        try
        {
            if (!_cached || uiType == null || uiType.Name != "WebUI_BackpackUI") return true;
            var map = AccessTools.Field(typeof(GameCore.HotUpdate.ReduxUI.WebUILayer), "PageMap")
                ?.GetValue(__instance) as Il2CppSystem.Collections.Generic.Dictionary<string, GameCore.HotUpdate.ReduxUI.WebUIVm>;
            if (map == null || !map.TryGetValue(PageId, out var vm) || vm == null)
            {
                _cached = false; // 缓存失效（WebView 重建等）→ 官方全价路径
                return true;
            }
            __instance.ShowPage(PageId);
            _cached = false;
            __result = vm;
            // 隐藏期间官方不给非活跃页推视图（UpdateBag 的 IsUIActive 门）——重显后补一次该页推送；
            // mod 数据层由 ForceRepublish 随后跟上（数据/视图双层对账，spec §二）。
            __instance.SendMessageToPage(PageId);
            RailData.ForceRepublish();
            CabinetEverywherePlugin.Log.LogInfo("[CE.页面常驻] Backpack 缓存命中：ShowPage+补推（跳过 LoadPage 原生重建）");
            return false;
        }
        catch
        {
            _cached = false;
            return true; // 兜底：官方全价路径
        }
    }

    private static bool _enabled => true; // 实验分支恒开；如需急停改此谓词
}
