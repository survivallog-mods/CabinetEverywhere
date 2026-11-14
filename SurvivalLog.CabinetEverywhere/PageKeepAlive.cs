using System;
using System.Collections.Generic;
using HarmonyLib;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 页面常驻实验 v3（perf/page-keepalive；v1 教训在案——见下）。
///
/// v1 失败定责（2026-11-14 实机：关背包后无法重开+输入锁死）：拦 RemovePage 改调 HidePage
/// 并跳过官方方法体——官方关闭簿记（PageMap/标志字典×3/装载停滞监视/页列刷新/根可见性）
/// 全没跑，官方状态机停在「页面还在」→ 重开被判已开、输入被模态判定锁死。
/// 且页面装载有「就绪信号」机制（Root 回报 pageReady→OnPageReady：置就绪+停监视+冲队列）——
/// 缓存页不重装就永不再发就绪信号，官方会一直等它。
///
/// v3 方案（消息级拦截，官方簿记全照跑）：
/// - 关（RemovePage prefix）：先官方 HidePage（Root 收到「隐藏」消息，iframe+JS 原地保留），
///   再置压制窗放行官方 RemovePage 体——其唯一一条「销毁」Root 消息被压掉，簿记全跑；
/// - 开（LoadPage prefix/postfix）：先官方 ShowPage（显示缓存 iframe），置压制窗放行官方
///   LoadPage 体——其唯一一条「装载」Root 消息被压掉（新 WebUIVm/簿记/停滞监视照建），
///   postfix 手工补调官方 OnPageReady（置就绪+停监视+冲队列）+ SendMessageToPage 补一次
///   视图推送 + mod 数据 ForceRepublish；
/// - 世界标识：缓存时记 canvasWebViewPrefab.GetInstanceID()，WebView 重建后缓存自动作废；
/// - 换档：OnWorldRebind 弃缓存；任何异常路径=不压制/不缓存（官方原行为）。
///
/// 反汇编依据：RemovePage@0x2E0C9F0（1 条 Root 消息+簿记）、LoadPage(Type)@0x2E07DF0
/// （新 vm+簿记+WatchPageLoadStall+**1 条** Root 装载消息）、HidePage/ShowPage@0x2E06960/
/// 0x2E10CC0（各 1 条显隐 Root 消息）、OnPageReady@0x2E09A60、PostOrQueueRootMessage@
/// 0x2E0AA20(string)。已知残留：RA_OpenUI 状态重建（~370ms）每次照跑（v4 目标）。
/// </summary>
internal static class PageKeepAlive
{
    private const string PageId = "Backpack";

    private static bool _installed;
    private static bool _cached;          // 关页时被隐藏保留、待重显的页
    private static bool _suppressRootMsg; // 压制窗：吞掉包夹调用内发的那条 Root 消息（同步调用栈，立即开合）
    private static bool _inCachedOpen;    // 本次 LoadPage 走缓存路径（postfix 收口用）
    private static int _worldId;          // 缓存时 canvasWebViewPrefab.GetInstanceID()（WebView 世界标识）

    internal static void Install()
    {
        if (_installed) return;
        try
        {
            var h = new Harmony("com.local.survivallog.cabineteverywhere.pagekeepalive");
            var layer = typeof(GameCore.HotUpdate.ReduxUI.WebUILayer);

            // 解析（OpenTrace 同款：按名+形参类型名匹配；Il2Cpp 的 Type 形参名="Type"）
            System.Reflection.MethodBase rm = null, ld = null, post = null, ready = null;
            foreach (var m in AccessTools.GetDeclaredMethods(layer))
            {
                var n = m?.Name;
                var ps = m.GetParameters();
                if (ps.Length != 1) continue;
                var pn = ps[0].ParameterType.Name;
                if (n == "RemovePage" && pn == "String") rm = m;
                else if (n == "LoadPage" && pn == "Type") ld = m;
                else if (n == "PostOrQueueRootMessage" && pn == "String") post = m;
                else if (n == "OnPageReady" && pn == "String") ready = m;
            }
            if (rm == null || ld == null || post == null)
            {
                CabinetEverywherePlugin.Log.LogWarning("[CE.页面常驻] 方法解析失败 rm=" + (rm != null) + " ld=" + (ld != null) + " post=" + (post != null) + "，未装（零影响）");
                return;
            }
            _onPageReady = ready; // 可缺（postfix 内 try/catch 降级）

            h.Patch(rm,
                prefix: new HarmonyMethod(typeof(PageKeepAlive), nameof(PreRemovePage)),
                finalizer: new HarmonyMethod(typeof(PageKeepAlive), nameof(FinRemovePage)));
            h.Patch(ld,
                prefix: new HarmonyMethod(typeof(PageKeepAlive), nameof(PreLoadPage)),
                postfix: new HarmonyMethod(typeof(PageKeepAlive), nameof(PostLoadPage)));
            h.Patch(post, prefix: new HarmonyMethod(typeof(PageKeepAlive), nameof(PreRootMsg)));
            _installed = true;
            CabinetEverywherePlugin.Log.LogInfo("[CE.页面常驻] v3 已挂（消息级：官方簿记照跑，只吞销毁/装载两条 Root 消息+补就绪信号）");
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CE.页面常驻] 安装失败（零影响）: " + e.Message);
        }
    }

    private static System.Reflection.MethodBase _onPageReady;

    /// <summary>世界重绑（RailData.OnWorldRebind 调）：旧世界页面内容作废，弃缓存。</summary>
    internal static void OnWorldRebind() => _cached = false;

    private static int WorldIdOf(GameCore.HotUpdate.ReduxUI.WebUILayer layer)
    {
        try
        {
            var prefab = AccessTools.Field(typeof(GameCore.HotUpdate.ReduxUI.WebUILayer), "canvasWebViewPrefab")
                ?.GetValue(layer) as UnityEngine.Object;
            return prefab != null ? prefab.GetInstanceID() : 0;
        }
        catch { return 0; }
    }

    // ---- 临时追踪（v3 实测两钩子零触发：实参与假定不符——打出真实 pageId/uiType 后移除） ----
    private static int _traceLeft = 16;
    private static void Trace(string what)
    {
        if (_traceLeft <= 0) return;
        _traceLeft--;
        try { CabinetEverywherePlugin.Log.LogInfo("[CE.页面常驻][追踪] " + what); } catch { }
    }

    // ---- 关：先隐藏保留，再放行官方销毁簿记（压掉其销毁 Root 消息） ----

    private static bool PreRemovePage(GameCore.HotUpdate.ReduxUI.WebUILayer __instance, string pageId)
    {
        Trace("RemovePage pageId=[" + pageId + "]");
        if (pageId != PageId) return true;
        try
        {
            var wid = WorldIdOf(__instance);
            if (wid == 0) return true;
            __instance.HidePage(pageId); // Root 收「隐藏」：iframe+JS 世界保留
            _worldId = wid;
            _suppressRootMsg = true;     // 官方体唯一一条「销毁」Root 消息将被 PreRootMsg 吞掉
            return true;                 // 官方簿记（PageMap/标志字典/监视/页列/根可见性）全跑
        }
        catch
        {
            _suppressRootMsg = false;
            return true; // 异常=不压制不缓存（官方原行为）
        }
    }

    private static void FinRemovePage()
    {
        if (!_suppressRootMsg) return;   // 非 Backpack 或异常路径：无窗
        _suppressRootMsg = false;
        _cached = true;
        try { CabinetEverywherePlugin.Log.LogInfo("[CE.页面常驻] Backpack 已隐藏保留（官方关闭簿记已跑，销毁消息被吞）"); } catch { }
    }

    // ---- 开：先显示缓存页，放行官方装载簿记（压掉其装载 Root 消息），postfix 补就绪 ----

    private static bool PreLoadPage(
        GameCore.HotUpdate.ReduxUI.WebUILayer __instance,
        Il2CppSystem.Type uiType)
    {
        try
        {
            Trace("LoadPage uiType=" + (uiType == null ? "null" : (uiType.FullName ?? ("?:" + uiType.Name))));
            if (!_cached || uiType == null || uiType.Name != "WebUI_BackpackUI") return true;
            if (WorldIdOf(__instance) != _worldId)
            {
                _cached = false; // WebView 重建过：缓存作废，官方全价路径
                return true;
            }
            __instance.ShowPage(PageId);  // Root 收「显示」：缓存 iframe 重现
            _suppressRootMsg = true;      // 官方体唯一一条「装载」Root 消息将被吞掉
            _inCachedOpen = true;
            return true;                  // 新 WebUIVm+簿记+停滞监视照建（全新官方对象，零旧状态）
        }
        catch
        {
            _suppressRootMsg = false;
            _inCachedOpen = false;
            _cached = false;
            return true; // 兜底：官方原行为（本帧会装载新页，与缓存 iframe 并存一次——显示前者）
        }
    }

    private static void PostLoadPage(GameCore.HotUpdate.ReduxUI.WebUILayer __instance)
    {
        if (!_inCachedOpen) return;
        _inCachedOpen = false;
        _suppressRootMsg = false;
        _cached = false;
        try
        {
            // 手工补就绪信号（官方 OnPageReady：置就绪+停装载停滞监视+冲该页消息队列）——
            // 缓存页不会重装，官方会一直等它就绪（v1 卡死机制的另一半）。
            if (_onPageReady != null)
                _onPageReady.Invoke(__instance, new object[] { PageId });
            __instance.SendMessageToPage(PageId); // 隐藏期间官方不给非活跃页推视图——补一次
            RailData.ForceRepublish();            // mod 数据层对账
            CabinetEverywherePlugin.Log.LogInfo("[CE.页面常驻] Backpack 缓存命中：ShowPage+补就绪+补推（装载消息被吞，簿记全新）");
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CE.页面常驻] 缓存重显收口异常（下开恢复官方路径）: " + e.Message);
        }
    }

    // ---- 压制窗：包夹调用内的那条 Root 消息直接吞 ----

    private static bool PreRootMsg() => !_suppressRootMsg;
}
