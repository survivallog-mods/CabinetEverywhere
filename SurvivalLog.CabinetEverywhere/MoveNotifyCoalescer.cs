using System;
using System.Collections.Generic;
using HarmonyLib;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 搬运通知合并（2026-11-13 方案 A·V1，PERF_NOTES.md「拆账终审」定案；gamekb 2026-11-12_26615062 反汇编取证）。
///
/// 病灶（实证）：批量搬运每搬 1 件 → NotifyGlobal(3002/3005) 同步直调 LogicAdapter →
/// Ac_Item_*::SendAction（同步 reducer，无帧级合并——合并只在订阅推送层，RefreshBag 不走）
/// → RA_AddOrNotify→UpdateBag→活跃 UI×Ac_*_RefreshBag→BuildBagJson **整包界面 JSON 重建**
/// （每件物品 40+ 重调用）。500 件×每件整包重建 = 5.6s 单帧冻结（占卡顿 65-80%）。
/// 官方 ExecuteMoveBag 自己就是「逐件搬数据+批末仅 1 次 3031 整包同步」——本组件把该模式
/// 推广到全部搬运路径。
///
/// 机制：
/// ① 包窗：ItemManager 七个搬运入口（TryQuickMoveItems/TryMoveBagAll/OnMoveBag 族/
///    OnQuickMoveItems 族）prefix 进窗（引用计数，嵌套批无害）+ finalizer 兜底出窗
///    （异常路径也复位）；同时记录本批 (fromOwnerId,toOwnerId)；
/// ② 静默：窗内拦 LogicAdapter 三个物品通知处理器（AddOrNotifyItem=3002 / DelItem=3005 /
///    OnSyncBagItems=3031，全部非泛型方法=最稳拦截面）——3002/3005 丢弃（批末整包覆盖），
///    3031 只记 (from,to) 不放行；
/// ③ 补发：窗计数归零时对每对 (from,to) 直调官方 ItemManager.SyncBothBags(from,to)——
///    官方自己构造两包全量 DTO 并发 1 次 3031 → 此刻窗已关 → OnSyncBagItems 正常执行 →
///    Redux 整包重建一次=状态完全追平（与官方 ExecuteMoveBag 批末行为逐字同构）。
///
/// 不拦的（取证结论）：SearchMarkerManager/BattleLogicWorld 的 3002/3005 处理器 O(1)
/// （队列去重/置脏计时器）照常；FoodPollutionManager 只订 3041/3043；DynamicEventManager
/// 不订通知（走函数直调，不受影响）；弹窗/未读红点（3008/3037）本来就不在搬运路径发。
/// 门=[Perf] EnableMoveCoalescer（默认 true；false=全部补丁不装回原行为）。
/// 线程模型：Item 系统/Redux 全在主线程，无锁。
/// </summary>
internal static class MoveNotifyCoalescer
{
    private static bool _installed;

    // ---- 窗口状态（主线程单线程） ----
    private static int _depth;
    private static bool Active => _depth > 0;
    private static readonly Dictionary<long, HashSet<long>> _pairs = new();
    private static long _swallowAdd, _swallowDel, _swallowSync, _swallowRefresh, _swallowDock; // 窗内累计（日志对账）
    private static System.Diagnostics.Stopwatch _windowSw;
    private static long _windows, _lastLogMs; // 累计窗数/日志限频

    internal static void Install()
    {
        if (_installed) return;
        try
        {
            if (CabinetEverywherePlugin.EnableMoveCoalescer != null && !CabinetEverywherePlugin.EnableMoveCoalescer.Value)
            {
                CabinetEverywherePlugin.Log.LogInfo("[CE.搬运合并] cfg 关闭，未装");
                return;
            }

            var h = new Harmony("com.local.survivallog.cabineteverywhere.movecoalesce");
            var la = typeof(GameCore.HotUpdate.ReduxUI.LogicAdapter);
            var im = typeof(GameCore.HotUpdate.Battle.Logic.ItemManager);
            int patched = 0;

            // ② 静默面：LogicAdapter 五处理器（零参/简参 prefix=最稳注入）
            // 3027 OnRefreshAllBagViews（V1.1）：物资架路径每件一发（OnMaterialRackItemLeft 批内逐件，
            // 实测 MaterialRack 338ms）——窗内静默，批末兜底刷一次（幂等全刷）
            // 21015 OnGroundDockSync（V1.2）：丢弃真凶——本局拖放过一次物品后官方 _groundDockWatching
            // 永不清零，之后每件 21008 都触发「全量重扫地面+递增 JSON+≤4 次 WebView 推送」（600 件=91s
            // 冻结，反汇编 0x2725B50 实证）。幂等全量同步→窗内吞，批末 PushGroundDock 补一次
            patched += Patch0(h, la, "AddOrNotifyItem", nameof(SwallowAdd));
            patched += Patch0(h, la, "DelItem", nameof(SwallowDel));
            patched += Patch0(h, la, "OnSyncBagItems", nameof(SwallowSync)); // prefix 内额外记 (from,to)
            patched += Patch0(h, la, "OnRefreshAllBagViews", nameof(SwallowRefresh));
            patched += Patch0(h, la, "OnGroundDockSync", nameof(SwallowDock));

            // ① 包窗面：ItemManager 批量搬运入口（参数名实证统一 fromOwnerId/toOwnerId；
            // 单件移动/右键通道不开窗——V1.7.x 实验已全部回滚，仅保留批量窗+V1.6 单丢窗）
            foreach (var name in new[]
                     {
                         "TryQuickMoveItems", "TryMoveBagAll", "OnMoveBag",
                         "OnMoveBagByCategory", "OnMoveBagByTag", "OnQuickMoveItems", "OnQuickMoveItemsWithFallback",
                     })
                patched += PatchWindow(h, im, name);

            // ①（V1.3）无参窗：批量拾取三入口（OnRequestPickAll 官方列表全拾 + OnGroundDockPick
            // 脚边横排批拾 + OnGroundDockPickTo 拾入指定包——实测 142s 卡死：mod 侧栏拾取/脚边
            // 拾取不走已包的搬运窗，每件 21015 全链放行）。无参 → 批末走空对兜底（见 Exit）。
            foreach (var name in new[] { "OnRequestPickAll", "OnGroundDockPick", "OnGroundDockPickTo" })
                patched += PatchWindowNp(h, typeof(GameCore.HotUpdate.Battle.Logic.DropItemManager), name);

            // ①（V1.3）全部丢弃专用窗：DropAllFromBag(long ownerId)（V1.1 误包 RA_DiscardAll 弹框帧）。
            // 带 ownerId 注入 → 记 (ownerId,ownerId) 对 → 批末 SyncBothBags(owner,owner) 整包追平
            // Data 层（V1.2 实测显示不更新：3002/3005 被吞后 Redux Data 无增量，仅刷视图无效）
            patched += PatchWindowOwner(h, typeof(GameCore.HotUpdate.Battle.Logic.DropItemManager), "DropAllFromBag");

            // ①（V1.6）单件丢弃窗：DropItemFromBag(itemId)/DropItemFromBag(itemId,dropOneOnly,silent)
            // 两个重载首参均为 itemId——prefix 里先查 ItemData.OwnerId 记自环对（此刻物品还在包里，
            // 查得到；官方删完再查就没了），批末 SyncBothBags(owner,owner) 追平。单丢的官方成本
            // =3005 全链+21015 全量地面重扫+≤4 次 WebView 推送，窗内静默后批末各补一次。
            foreach (var m in AccessTools.GetDeclaredMethods(typeof(GameCore.HotUpdate.Battle.Logic.DropItemManager)))
                if (m != null && m.Name == "DropItemFromBag" && !m.IsGenericMethod)
                    patched += PatchWindowItem(h, m);

            if (patched < 4) { CabinetEverywherePlugin.Log.LogWarning("[CE.搬运合并] 关键方法缺失过多（游戏改版？），未装：patched=" + patched); return; }
            _installed = true;
            CabinetEverywherePlugin.Log.LogInfo("[CE.搬运合并] 已挂：静默 LogicAdapter 3002/3005/3031 + 七搬运入口包窗 + 批末官方 SyncBothBags 整包同步（patched=" + patched + "）");
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CE.搬运合并] 安装失败（回原行为）: " + e.Message);
        }
    }

    private static int Patch0(Harmony h, System.Type type, string method, string prefixName)
    {
        try
        {
            var m = AccessTools.Method(type, method);
            if (m == null) return 0;
            var prefix = new HarmonyMethod(typeof(MoveNotifyCoalescer), prefixName);
            h.Patch(m, prefix: prefix);
            return 1;
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CE.搬运合并] " + method + " 未挂上: " + e.Message);
            return 0;
        }
    }

    private static int PatchWindow(Harmony h, System.Type type, string method)
    {
        try
        {
            var m = AccessTools.Method(type, method);
            if (m == null) return 0;
            var prefix = new HarmonyMethod(typeof(MoveNotifyCoalescer), nameof(EnterPrefix));
            var fin = new HarmonyMethod(typeof(MoveNotifyCoalescer), nameof(ExitFinalizer)); // 异常路径兜底复位
            h.Patch(m, prefix: prefix, finalizer: fin);
            return 1;
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CE.搬运合并] " + method + " 未挂上: " + e.Message);
            return 0;
        }
    }

    /// <summary>无参窗（丢弃/批量拾取入口：无 fromOwnerId 可注入，批末走空对兜底刷新）。</summary>
    private static int PatchWindowNp(Harmony h, System.Type type, string method)
    {
        try
        {
            var m = AccessTools.Method(type, method);
            if (m == null) return 0;
            var prefix = new HarmonyMethod(typeof(MoveNotifyCoalescer), nameof(EnterPrefixNp));
            var fin = new HarmonyMethod(typeof(MoveNotifyCoalescer), nameof(ExitFinalizer));
            h.Patch(m, prefix: prefix, finalizer: fin);
            return 1;
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CE.搬运合并] " + method + " 未挂上: " + e.Message);
            return 0;
        }
    }

    /// <summary>丢弃专用窗（参数名 ownerId 注入 → 自环对 → 批末 SyncBothBags 追平 Data 层）。</summary>
    private static int PatchWindowOwner(Harmony h, System.Type type, string method)
    {
        try
        {
            var m = AccessTools.Method(type, method);
            if (m == null) return 0;
            var prefix = new HarmonyMethod(typeof(MoveNotifyCoalescer), nameof(EnterPrefixOwner));
            var fin = new HarmonyMethod(typeof(MoveNotifyCoalescer), nameof(ExitFinalizer));
            h.Patch(m, prefix: prefix, finalizer: fin);
            return 1;
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CE.搬运合并] " + method + " 未挂上: " + e.Message);
            return 0;
        }
    }

    /// <summary>单件丢弃窗（V1.6：DropItemFromBag 两重载，首参 itemId → prefix 查 OwnerId 记自环对）。</summary>
    private static int PatchWindowItem(Harmony h, System.Reflection.MethodBase m)
    {
        try
        {
            var prefix = new HarmonyMethod(typeof(MoveNotifyCoalescer), nameof(EnterPrefixItem));
            var fin = new HarmonyMethod(typeof(MoveNotifyCoalescer), nameof(ExitFinalizer));
            h.Patch(m, prefix: prefix, finalizer: fin);
            return 1;
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CE.搬运合并] DropItemFromBag 未挂上: " + e.Message);
            return 0;
        }
    }

    // ---- ② 静默 prefix（窗内吞调用；窗外零动作直通） ----

    private static bool SwallowAdd()
    {
        if (!Active) return true;
        _swallowAdd++;
        return false;
    }

    private static bool SwallowDel()
    {
        if (!Active) return true;
        _swallowDel++;
        return false;
    }

    private static bool SwallowSync(long fromOwnerId, long toOwnerId)
    {
        if (!Active) return true;
        _swallowSync++;
        NotePair(fromOwnerId, toOwnerId); // 官方批末 3031 也记（与包窗参数并集）
        return false;
    }

    private static bool SwallowRefresh()
    {
        if (!Active) return true;
        _swallowRefresh++;
        return false; // 3027：窗内逐件全刷静默（物资架路径每件一发），批末兜底刷一次
    }

    private static bool SwallowDock()
    {
        if (!Active) return true;
        _swallowDock++;
        return false; // 21015：窗内每件全量脚边同步静默（幂等），批末 PushGroundDock 补一次
    }

    private static void NotePair(long from, long to)
    {
        if (from <= 0 || to <= 0) return;
        if (!_pairs.TryGetValue(from, out var set)) _pairs[from] = set = new HashSet<long>();
        set.Add(to);
    }

    // ---- ① 包窗 prefix / finalizer ----

    private static void EnterPrefix(long fromOwnerId, long toOwnerId)
    {
        EnterWindow();
        NotePair(fromOwnerId, toOwnerId);
    }

    /// <summary>无参窗入口（丢弃/批量拾取：批末走空对兜底）。</summary>
    private static void EnterPrefixNp()
    {
        EnterWindow();
    }

    /// <summary>丢弃专用窗（DropAllFromBag(long ownerId)：记自环对，批末 SyncBothBags 追平 Data 层）。</summary>
    private static void EnterPrefixOwner(long ownerId)
    {
        EnterWindow();
        NotePair(ownerId, ownerId);
    }

    /// <summary>单件丢弃窗（V1.6）：此刻物品未删，查 OwnerId 记自环对；查不到=空对兜底。</summary>
    private static void EnterPrefixItem(long itemId)
    {
        EnterWindow();
        try
        {
            var d = RailData.ItemMgr()?.GetItemData(itemId);
            if (d != null && d.OwnerId > 0) NotePair(d.OwnerId, d.OwnerId);
        }
        catch { /* 查询失败=空对兜底（BagOwner 自环+整刷） */ }
    }

    /// <summary>mod 侧手工窗（RailGround 拾取循环直调）：进窗+记背包自环对。</summary>
    internal static void ManualEnter(long bagOwner)
    {
        if (!_installed) return;
        EnterWindow();
        NotePair(bagOwner, bagOwner);
    }

    /// <summary>mod 侧手工窗收尾（finally 调；未装时零动作）。</summary>
    internal static void ManualExit()
    {
        if (!_installed) return;
        Exit();
    }

    private static void EnterWindow()
    {
        if (_depth == 0)
        {
            _swallowAdd = _swallowDel = _swallowSync = _swallowRefresh = _swallowDock = 0;
            _windowSw = System.Diagnostics.Stopwatch.StartNew();
        }
        _depth++;
    }

    private static void ExitFinalizer(Exception __exception)
    {
        try { Exit(); }
        catch (Exception e) { CabinetEverywherePlugin.Log.LogWarning("[CE.搬运合并] 出窗异常: " + e.Message); }
    }

    private static void Exit()
    {
        if (_depth <= 0) return;
        if (--_depth > 0) return; // 嵌套批：内层退出不开闸

        // 归零：补发——每对 (from,to) 走官方整包同步（此刻 Active=false，3031 畅通）；
        // 吞过通知但无 (from,to)（丢弃/批量拾取窗）→ 空对兜底：官方整刷动作一次（3027 请求版，
        // 与 RefreshAllBagViews 幂等全刷同效——按 ItemManager 权威数据重建全部背包视图）
        var im = RailData.ItemMgr();
        int flushed = 0;
        var swallowedAny = _swallowAdd > 0 || _swallowDel > 0 || _swallowSync > 0 || _swallowRefresh > 0;
        if (im != null && _pairs.Count > 0)
        {
            foreach (var kv in _pairs)
                foreach (var to in kv.Value)
                {
                    try { im.SyncBothBags(kv.Key, to); flushed++; }
                    catch (Exception e) { CabinetEverywherePlugin.Log.LogWarning("[CE.搬运合并] 补发失败 from=" + kv.Key + " to=" + to + ": " + e.Message); }
                }
        }
        if (flushed == 0 && swallowedAny)
        {
            // 空对兜底（V1.3 升级）：3002/3005 被吞=Redux Data 层无增量——仅刷视图不够（丢弃实测
            // 显示不更新）。对背包 owner 发 (bag,bag) 自环 SyncBothBags=官方 3031 整包→Data 层
            // 权威追平（OnSyncBagItems→Ac_Item_SyncBagItems→Redux 整包替换），再整刷一次视图。
            try
            {
                long bag = RailData.BagOwner();
                if (bag > 0 && im != null) im.SyncBothBags(bag, bag);
                GameCore.HotUpdate.ReduxUI.Ac_Item_RefreshAllBagViews.SendAction();
                flushed = -1;
            }
            catch (Exception e) { CabinetEverywherePlugin.Log.LogWarning("[CE.搬运合并] 空对兜底刷新失败: " + e.Message); }
        }
        // 21015 补发：窗内每件全量脚边同步被吞 → 批末 PushGroundDock 一次（幂等全量，含最新地面态）
        if (_swallowDock > 0)
        {
            try
            {
                var dim = RailData.World()?._DropItemManager;
                dim?.PushGroundDock();
            }
            catch (Exception e) { CabinetEverywherePlugin.Log.LogWarning("[CE.搬运合并] 脚边同步补发失败: " + e.Message); }
        }
        _pairs.Clear();
        _windows++;
        _windowSw?.Stop();

        // 对账日志：首窗必打 + 之后 60s 限频（效果验证观测点）
        long nowMs = System.Environment.TickCount64;
        if (_windows == 1 || nowMs - _lastLogMs > 60000)
        {
            _lastLogMs = nowMs;
            CabinetEverywherePlugin.Log.LogInfo(
                $"[CE.搬运合并] 窗 {_windowSw?.ElapsedMilliseconds ?? 0}ms：拦 3002×{_swallowAdd} 3005×{_swallowDel} 3031×{_swallowSync} 3027×{_swallowRefresh} 21015×{_swallowDock}，批末同步 {(flushed < 0 ? "整刷兜底" : flushed + " 对")}（累计 {_windows} 窗）");
        }
    }
}
