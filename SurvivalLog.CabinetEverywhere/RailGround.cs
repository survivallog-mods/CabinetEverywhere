using System;
using System.Collections.Generic;
using SurvivalLog.ModShared;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 家内地面掉落（DropItem）数据源（地面/门口袋扩展批，2026-11-11）。
///
/// 官方机制实证（gamekb 2026-11-05 il2cpp dump @413724/@413914）：
/// - DropItem : BaseEntity——每件地面物品一个实体，内嵌完整 ItemData（保鲜/污染/词条/使用
///   次数随身，AppendOwnerItems 行体同构）；DropItemManager._dropItems 全量列表，
///   world._DropItemManager 私有字段直取（ShrinkDrop 同源先例）。
/// - 地面物品不挂白名单 owner（OwnerCache 的地面虚拟 owner 正是红线「绝不 foreach
///   OwnerCache」的来源）——本类独立枚举 DropItem，不碰 OwnerCache。
/// - 取物官方 API：TryPickupItem(dropInstanceId, ownerId, out pickedCount, showPopup)
///   ——支持直接收进指定 owner；官方「脚边」横排（GroundDock，身边 3 米）同路。
///   距离校验未知（官方仅身边调用）——若实机跨房取物被拒，JS 数据面不受影响，仅取物降级。
///
/// 契约接入（RailData）：虚拟容器键 OwnerId（负常量，避开 InstanceId 正数空间）——有物品
/// 才进 ctn 段（BuildJson 0.5s 动态判定，不入 _ctn 5s 元数据通道）；行 id=Item.InstanceId
/// （官方详情弹窗 idetail 同源）；取物时反查 DropItem 实体 id。伪坐标 12 列（UniformWidth）
/// 顺序填充——渲染层按排序键平铺不消费 x/y（ComputeSig 注释同判），仅保 grid 视图合法形状。
///
/// 性能纪律：FastCount（每帧）只 1 次 _dropItems.Count（O(1) 零分配零地图判定）；家图
/// 过滤/逐件字段读只在 0.5s BuildJson/签名通道——千件级静息 ~1.5-6ms/0.5s、变化 8-30ms
/// 一次性突发（与既有全量组装同量级，glist 聚合+300 行截断封顶渲染面）。
/// </summary>
internal static class RailGround
{
    /// <summary>地面虚拟容器键（ctn 行 id / items 段键 / 命令 from）。负值避开真实 owner 空间。</summary>
    internal const long OwnerId = -101;
    internal const string CtnName = "地面（家中）";

    // IsHomeMap 判定缓存（int mapId → 是否家图组）：地图数个位数，换档清（OnWorldRebind→Reset）
    private static readonly Dictionary<int, bool> _homeMapCache = new();

    /// <summary>世界重绑（RailData.OnWorldRebind 调）：换档清地图判定缓存（家图组随档变）。</summary>
    internal static void Reset() => _homeMapCache.Clear();

    private static GameCore.HotUpdate.Battle.Logic.BattleLogicWorld World()
    {
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.Battle.Logic.BattleLogicWorld>.IsInstanceCreated)
                return null;
            return GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.Battle.Logic.BattleLogicWorld>.Instance;
        }
        catch { return null; }
    }

    /// <summary>
    /// 家内 DropItem 快照：主图严格相等短路（绝大多数），非主图走 IsHomeMap（重，缓存）——
    /// RefreshHomeInstances 同口径（全楼层含地下室）。空 Item（拾取瞬间 HasItem=false）跳过。
    /// </summary>
    internal static List<GameCore.HotUpdate.Battle.Logic.DropItem> HomeDrops()
    {
        var result = new List<GameCore.HotUpdate.Battle.Logic.DropItem>();
        var world = World();
        var am = world?._AgentManager;
        var dim = world?._DropItemManager;
        if (am == null || dim == null) return result;

        Il2CppSystem.Collections.Generic.List<GameCore.HotUpdate.Battle.Logic.DropItem> all = null;
        try { all = dim._dropItems; } catch { }
        if (all == null || all.Count == 0) return result;

        int mapId = 0;
        try { mapId = am.GetHomeMapId(); } catch { }

        for (int i = 0; i < all.Count; i++)
        {
            GameCore.HotUpdate.Battle.Logic.DropItem d = null;
            try { d = all[i]; } catch { continue; }
            if (d == null) continue;

            int dm = 0;
            try { dm = d.MapConfigId; } catch { continue; }
            bool home;
            if (dm == mapId) home = true; // 主图短路（绝大多数）
            else if (!_homeMapCache.TryGetValue(dm, out home))
            {
                try { home = am.IsHomeMap(dm); } catch { home = false; }
                _homeMapCache[dm] = home;
            }
            if (!home) continue;

            bool has = false;
            try { has = d.HasItem; } catch { }
            if (!has) continue;
            result.Add(d);
        }
        return result;
    }

    /// <summary>每帧快检（StructureChangedFast）：全部 DropItem 数（含野外=超集，野外增减也触发
    /// 重推=保守正确）；O(1) 计数，零分配零地图判定——每帧纪律的硬边界。</summary>
    internal static int FastCount()
    {
        try
        {
            var all = World()?._DropItemManager?._dropItems;
            return all != null ? all.Count : 0;
        }
        catch (Exception e) { PerfDiag.Swallow("ground.fastcount:" + e.GetType().Name); return 0; } // [PERFDIAG]
    }

    /// <summary>签名项（SigOwner 同形）：家内行数+Σcount+首末物品 id（0.5s 通道，逐件读 2 字段）。</summary>
    internal static long SigOf(long sig)
    {
        var drops = HomeDrops();
        int rows = 0; long countSum = 0, first = 0, last = 0;
        foreach (var d in drops)
        {
            var it = SafeItem(d);
            if (it == null) continue;
            long id = 0; int cnt = 0;
            try { id = it.InstanceId; cnt = it.ItemCount; } catch { }
            if (id <= 0) continue;
            if (rows == 0) first = id;
            last = id;
            countSum += cnt;
            rows++;
        }
        return ((((sig * 31 + rows) * 31 + (int)(countSum & 0x7FFFFFFF)) * 31 + (int)(first & 0x7FFFFFFF)) * 31 + (int)(last & 0x7FFFFFFF));
    }

    /// <summary>行拼装（RailData.AppendItemRow 行体）：伪坐标按 colWidth 列顺序填充。</summary>
    internal static int AppendItems(
        System.Text.StringBuilder sb,
        List<GameCore.HotUpdate.Battle.Logic.DropItem> drops,
        Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Item> itemDict,
        float nowHours, bool tradeScene, int colWidth)
    {
        int rows = 0, col = 0, row = 0;
        if (colWidth <= 0) colWidth = 12;
        sb.Append('[');
        foreach (var d in drops)
        {
            var it = SafeItem(d);
            if (it == null) continue;
            int w = 1, h = 1;
            try { w = it.ItemSize.x; h = it.ItemSize.y; } catch { }
            if (w <= 0) w = 1;
            if (h <= 0) h = 1;
            if (col + w > colWidth) { col = 0; row++; } // 换行（伪布局，渲染层不消费）
            RailData.AppendItemRow(sb, it, col, row, itemDict, nowHours, tradeScene, ref rows);
            col += w;
        }
        sb.Append(']');
        return rows;
    }

    /// <summary>cfg 收集（icfg 懒缓存集；BuildJson 第一遍与 CollectCfgIds 同点位）。</summary>
    internal static void CollectCfgIds(List<GameCore.HotUpdate.Battle.Logic.DropItem> drops, HashSet<int> seen, List<int> order)
    {
        foreach (var d in drops)
        {
            var it = SafeItem(d);
            if (it == null) continue;
            int cfg = 0;
            try { cfg = it.ItemConfigId; } catch { }
            if (cfg > 0 && seen.Add(cfg)) order.Add(cfg);
        }
    }

    /// <summary>
    /// 取物→背包：按物品 id（行 id=ItemData.InstanceId）反查家内 DropItem → 官方
    /// TryPickupItem(dropInstanceId, bagOwner)（silent）。firstOnly=JS all:false 语义——
    /// 地面无「拆 1 件」（官方拾取按实体整叠），成功 1 件即停（整叠捡，行为差异注释在案）。
    /// 返回成功件数。距离校验若拒=返回 0（数据面下轮自愈，无假成功）。
    /// </summary>
    internal static int TakeToBag(List<long> itemIds, long bagOwner, bool firstOnly)
    {
        if (bagOwner <= 0 || itemIds == null || itemIds.Count == 0) return 0;
        var dim = World()?._DropItemManager;
        if (dim == null) return 0;
        var drops = HomeDrops(); // 快照：拾取中实体出列不迭代原表
        int picked = 0;
        foreach (var id in itemIds)
        {
            GameCore.HotUpdate.Battle.Logic.DropItem hit = null;
            foreach (var d in drops)
            {
                var it = SafeItem(d);
                long iid = 0;
                try { iid = it?.InstanceId ?? 0; } catch { }
                if (iid == id) { hit = d; break; }
            }
            if (hit == null) continue;
            try { int n; if (dim.TryPickupItem(hit.InstanceId, bagOwner, out n, false)) picked++; }
            catch { }
            if (firstOnly && picked > 0) break;
        }
        return picked;
    }

    /// <summary>按物品 id（行 id=ItemData.InstanceId）反查家内 DropItem 的 ItemData——
    /// feed/basketPut 源物品预检（burnable/禁入/容量）用；找不到=null。</summary>
    internal static GameCore.HotUpdate.Battle.Logic.ItemData FindItem(long itemId)
    {
        if (itemId <= 0) return null;
        foreach (var d in HomeDrops())
        {
            var it = SafeItem(d);
            long iid = 0;
            try { iid = it?.InstanceId ?? 0; } catch { }
            if (iid == itemId) return it;
        }
        return null;
    }

    /// <summary>整取：家内全部 DropItem 逐件 TryPickupItem→背包（尽力捡：背包满/负重拒=停在该件）。</summary>
    internal static int TakeAllToBag(long bagOwner)
    {
        if (bagOwner <= 0) return 0;
        var dim = World()?._DropItemManager;
        if (dim == null) return 0;
        var drops = HomeDrops();
        int picked = 0;
        foreach (var d in drops)
        {
            long did = 0;
            try { did = d.InstanceId; } catch { }
            if (did == 0) continue;
            try { int n; if (dim.TryPickupItem(did, bagOwner, out n, false)) picked++; }
            catch { }
        }
        return picked;
    }

    private static GameCore.HotUpdate.Battle.Logic.ItemData SafeItem(GameCore.HotUpdate.Battle.Logic.DropItem d)
    {
        try { return d?.Item; } catch { return null; }
    }
}
