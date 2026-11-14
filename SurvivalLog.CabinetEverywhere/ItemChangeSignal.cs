using System;
using HarmonyLib;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 事件驱动变化信号（spec 2026-11-14-rail-data-slim-design §A）：Harmony prefix 挂
/// LogicAdapter 五个官方物品通知处理器，只置 RailData.Dirty 脏标记并放行（void prefix
/// 恒执行——即便 MoveNotifyCoalescer 的吞窗 prefix 对同一方法 return false 跳过原方法，
/// 本 prefix 仍运行；再叠加 Priority.First 先跑，双保险零依赖其语义细节）。
///
/// 挂点（2026-11-14 dump 复核，gamekb 2026-11-12_26615062/il2cpp/dump.cs）：
///   3002 AddOrNotifyItem(ItemDataDto)   @148621 —— dto 自带 OwnerId（@104222）
///   3005 DelItem(long id)               @148627 —— prefix 先于原方法，ItemManager.GetItemData(id)
///                                                  (@429901 公开) 反查 OwnerId；查不到=全局脏
///   3031 OnSyncBagItems(from,to,...)    @148633 —— 双端 owner 各标一次
///   3027 OnRefreshAllBagViews()         @148693 —— 全局脏
///   21015 OnGroundDockSync(...)         @148883 —— 全局脏（地面）
/// R1 推断依据：LogicAdapter 无 3032 (OnSyncItem) 处理器——叠数变化（用一件/并叠）只能经
/// 3002 到达官方 UI；若实机发现某路径不刷新，补挂 ItemManager 对应 prefix（SetItemCount@429883 /
/// IncreaseItemCount@429886 / DecreaseItemCount@429892 / TakeOneFromStack@429889，全带 ItemData
/// 可得 owner），不回退轮询。
///
/// 独立挂载（不受 General.Enabled / EnableMoveCoalescer 门控）：前者只停注入/推送侧，后者关
/// 闭时本钩子仍须在（事件是变化检测的唯一来源）。与 MoveNotifyCoalescer 挂同一批方法共存
/// （其窗收尾 SyncBothBags/PushGroundDock 在 Active=false 时穿透，同样落进本钩子）。
/// </summary>
internal static class ItemChangeSignal
{
    private static bool _installed;

    internal static void Install()
    {
        if (_installed) return;
        try
        {
            var h = new Harmony("com.local.survivallog.cabineteverywhere.itemsignal");
            var la = typeof(GameCore.HotUpdate.ReduxUI.LogicAdapter);
            int patched = 0;
            patched += Patch(h, la, "AddOrNotifyItem", nameof(PreAdd));
            patched += Patch(h, la, "DelItem", nameof(PreDel));
            patched += Patch(h, la, "OnSyncBagItems", nameof(PreSync));
            patched += Patch(h, la, "OnRefreshAllBagViews", nameof(PreRefresh));
            patched += Patch(h, la, "OnGroundDockSync", nameof(PreDock));
            _installed = patched > 0;
            CabinetEverywherePlugin.Log.LogInfo(
                "[CE.变化信号] 已挂 " + patched + "/5（LogicAdapter 3002/3005/3031/3027/21015 → 脏标记，void prefix 恒执行）");
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CE.变化信号] 挂载失败（事件驱动不可用）: " + e.Message);
        }
    }

    private static int Patch(Harmony h, System.Type type, string method, string prefixName)
    {
        try
        {
            var m = AccessTools.Method(type, method);
            if (m == null) return 0;
            var prefix = new HarmonyMethod(typeof(ItemChangeSignal), prefixName) { priority = Priority.First };
            h.Patch(m, prefix: prefix);
            return 1;
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CE.变化信号] " + method + " 未挂上: " + e.Message);
            return 0;
        }
    }

    // ---- prefix：只标记，永不拦截（void 返回）----

    // 挪位忽略缓存（RailMoveCache）：恢复旧 SigOwner 裁定「同容器挪动物位不触发重推」——
    // 3002 携新 BagPos 必至，(owner,cfg,count) 三元组不变=纯挪位/纯缓变，忽略。
    private static readonly RailMoveCache _move = new();
    internal static void ResetMoveCache() => _move.Clear();

    private static void PreAdd(GameCore.HotUpdate.ItemDataDto data)
    {
        try
        {
            if (data == null) { RailData.MarkGlobalDirty(); return; }
            long id = 0, owner = 0; int cfg = 0, count = 0;
            try { id = data.InstanceId; owner = data.OwnerId; cfg = data.ItemConfigId; count = data.ItemCount; } catch { }
            if (id > 0 && _move.NoteIgnoreable(id, owner, cfg, count)) return; // 纯挪位/纯缓变：旧签名口径本就不重推
            RailData.MarkOwnerDirty(owner);
        }
        catch { RailData.MarkGlobalDirty(); }
    }

    private static void PreDel(long id)
    {
        long owner = 0;
        try { owner = RailData.ItemMgr()?.GetItemData(id)?.OwnerId ?? 0; } catch { }
        _move.Remove(id);
        if (owner > 0) RailData.MarkOwnerDirty(owner);
        else RailData.MarkGlobalDirty(); // 已被移出索引/异常：全局脏兜底（代价=一次重建比对）
    }

    private static void PreSync(long fromOwnerId, long toOwnerId)
    {
        RailData.MarkOwnerDirty(fromOwnerId);
        RailData.MarkOwnerDirty(toOwnerId);
    }

    private static void PreRefresh() => RailData.MarkGlobalDirty();

    private static void PreDock() => RailData.MarkGlobalDirty();
}
