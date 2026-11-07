using System;
using System.Collections.Generic;
using SurvivalLog.ModShared;
using UnityEngine;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 缩高掉落流（高度修改批 Task2，spec 2026-11-07-bag-height-design §8；作者 2026-11-07 拍板
/// 「放不下的直接掉地上，官方已经有相关案例了」）。
///
/// 官方机制实证（gamekb 2026-11-05 il2cpp dump）：
/// - DropItemManager.SpawnGroundLootItem(centerPos, radius, itemConfigId, count, startTime,
///   timeLeft, mapConfigId, isWaveLoot) —— public；游戏拆除/回收掉落同款先例
///   （Furniture.DropBrewBottlesOnDemolish / DropRobotCargoOnRecall 等）；
/// - ItemManager.RemoveItem(long itemInstanceId) —— public（按物品实例 id 移除）；
/// - DropItem 挂完整 ItemData（保鲜 startTime/timeLeft 随身），地面掉落持久化进存档
///   （GroundLootManager.SaveGame）；
/// - 合成 owner 常量（WorkbenchDrawerConfig.DrawerOwnerId 先例，DrawerTabs:166）：
///   VehicleConfig.TrunkOwnerId（后备箱）/BoxOwnerId·BoxOwnerId2（门口塑料袋，
///   DoorBoxBagId=1023 实锤——门口袋=BagFurniture 运行时种子，表无引用）。
///
/// 红线：mod 只编排官方函数（feed 命令 TryQuickMoveItems 同口径），不直接写 Data_Item/存档。
/// OwnerCache 只按**已知 owner** keyed 取（TryGetValue），不 foreach 全 Cache（红线4）；
/// 仅缩高事件内执行（RailUi.SizeEnginePoll 调用，主线程），5s 轮询稳态零成本。
///
/// 掉点策略（Task2 ruling）：全部掉在**玩家脚下**（玩家当前图）——家具 transform 无公开
/// 位置口（TransformComponent 私有链不稳），且他图家具在他图掉落=未加载图掉落风险；
/// 玩家位置不可得=本轮放弃（false，零损失下轮重试）。他图实例=留包兜底（物品不丢，
/// 到场开容器官方「整理」找回），日志一行。
/// </summary>
internal static class ShrinkDrop
{
    private static readonly HashSet<string> Warned = new();
    private static void WarnOnce(string key, string msg)
    {
        if (Warned.Add(key))
            CabinetEverywherePlugin.Log.LogWarning("[CabinetEverywhere.ShrinkDrop] " + msg);
    }

    /// <summary>
    /// 缩高前置：把 bagId 全部在场实例中 BagPos.y+ItemSize.y &gt; targetH 的物品经官方函数
    /// 掉落到玩家脚下并从包内移除。true=全部处理完、可安全写 size[1]；false=本轮放弃
    /// （调用方签名不记，下轮重试——已成功掉落+移除的物品天然幂等，不会重复处理）。
    /// </summary>
    internal static bool Process(int bagId, int targetH)
    {
        try
        {
            var world = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.Battle.Logic.BattleLogicWorld>.Instance;
            if (world == null) return false;
            var am = world._AgentManager;
            if (am == null) return false;
            var dim = world._DropItemManager;
            var im = world._ItemManager;
            if (dim == null || im == null) return false;

            Vector3 pos;
            int mapId;
            if (!PlayerDropPos(am, out pos, out mapId))
            {
                WarnOnce("ppos", "玩家位置不可得——缩高掉落本轮跳过（无物品损失，下轮重试）");
                return false;
            }

            var leftBehind = new List<string>();
            var owners = OwnersOf(bagId, am, mapId, leftBehind);

            // ItemManager.OwnerCache（逻辑侧 ItemData——AppendOwnerItems 同源同读法；Redux 侧
            // Data_Item 镜像无 BagPos 语义需求，不混用）
            var oc = im.OwnerCache;
            if (oc == null) return false; // OwnerCache 不可得：同"位置不可得"兜底

            int ownersHit = 0, dropped = 0;
            foreach (var owner in owners)
            {
                Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData> inner = null;
                try { if (!oc.TryGetValue(owner, out inner) || inner == null) continue; } catch { continue; }
                ownersHit++;

                // 快照式收集（枚举中移除有风险：先收集越界件再逐件掉+删）
                var victims = new List<GameCore.HotUpdate.Battle.Logic.ItemData>();
                try
                {
                    foreach (var pair in inner) // AppendOwnerItems 同款逐 pair 读法（BuildJson 0.5s 通道生产验证）
                    {
                        var it = pair.Value;
                        if (it == null) continue;
                        try
                        {
                            int y = it.BagPos.y, h = it.ItemSize.y;
                            if (h <= 0) h = 1;
                            if (y + h > targetH) victims.Add(it); // 越界=底缘超新高的整件掉落
                        }
                        catch { }
                    }
                }
                catch { }

                foreach (var it in victims)
                {
                    long itemId = 0; int cfg = 0, cnt = 0, st = 0, tl = 0;
                    try { itemId = it.InstanceId; cfg = it.ItemConfigId; cnt = it.ItemCount; st = it.StartTime; tl = it.TimeLeft; } catch { }
                    if (itemId <= 0 || cfg <= 0 || cnt <= 0) continue;

                    // 先生成后移除（生成失败=不移除，物品零损失；移除异常=可能地面+包双份，WarnOnce 记账）
                    long dropId = 0;
                    try { dropId = dim.SpawnGroundLootItem(pos, 0.8f, cfg, cnt, st, tl, mapId, false); } catch { }
                    if (dropId == 0)
                    {
                        WarnOnce("spawn-" + cfg, $"官方掉落生成失败（物品 cfg={cfg}）——本轮放弃，下轮重试");
                        return false;
                    }
                    try { im.RemoveItem(itemId); }
                    catch (Exception e) { WarnOnce("remove-" + itemId, "掉落已生成但包内移除异常（可能地面+包双份，拾取即并）: " + e.Message); }
                    dropped++;
                }
            }

            CabinetEverywherePlugin.Log.LogInfo(
                $"[CERail] ShrinkDrop：bag {bagId} 缩到 {targetH} 行——扫 {owners.Count} 实例（当前图 {ownersHit} 有物）、掉落 {dropped} 件于玩家脚下"
                + (leftBehind.Count > 0 ? "；他图留包 " + leftBehind.Count + "：" + string.Join("、", leftBehind) + "（到场整理找回）" : ""));
            return true;
        }
        catch (Exception e)
        {
            WarnOnce("process", "缩高掉落异常: " + e.Message);
            return false;
        }
    }

    /// <summary>bagId 的全部在场实例 owner：背包（链内才收）/抽屉/后备箱/门口袋合成常量 +
    /// 全图家具（当前图收录掉落、他图留包兜底）。</summary>
    private static List<long> OwnersOf(int bagId,
        GameCore.HotUpdate.Battle.Logic.AgentManager am, int curMap, List<string> leftBehind)
    {
        var owners = new List<long>();

        // ① 背包：仅 bagId 在背包链内才收玩家 owner（否则会把玩家包物品错配到柜子目标高）
        try
        {
            if (Array.IndexOf(CabinetEverywherePlugin.BackpackBagIds, bagId) >= 0)
            {
                long bagOwner = RailData.BagOwner();
                if (bagOwner > 0) owners.Add(bagOwner);
            }
        }
        catch { }

        // ② 抽屉（DrawerOwnerId 静态常量直读——DrawerTabs:166 先例）
        if (bagId == 5010 || bagId == 5012 || bagId == 5013)
        {
            try { owners.Add(GameCore.HotUpdate.WorkbenchDrawerConfig.DrawerOwnerId); } catch { }
        }

        // ③④ 后备箱+门口塑料袋（VehicleConfig 静态常量；DoorBoxBagId=1023 dump 实锤）
        if (bagId == 1021 || bagId == 1022 || bagId == 1023)
        {
            try { owners.Add(GameCore.HotUpdate.VehicleConfig.TrunkOwnerId); } catch { }
            try { owners.Add(GameCore.HotUpdate.VehicleConfig.BoxOwnerId); } catch { }
            try { owners.Add(GameCore.HotUpdate.VehicleConfig.BoxOwnerId2); } catch { }
        }

        // ⑤ 家具（柜/冰箱/置物架…）：全图单遍（CabinetCatalog 同款廉价顺序：TryCast→配置查包→图判定）
        try
        {
            var cm = BagTable.Cm();
            var dict = BagTable.FurnDict(cm);
            var list = am.agentList;
            if (dict != null && list != null)
            {
                var seenCfg = new HashSet<int>();
                for (int i = 0; i < list.Count; i++)
                {
                    GameCore.HotUpdate.Battle.Logic.Furniture furn = null;
                    try { furn = list[i]?.TryCast<GameCore.HotUpdate.Battle.Logic.Furniture>(); } catch { }
                    if (furn == null) continue;

                    long ownerId = 0; int cfgId = 0, furnMap = 0;
                    try { ownerId = furn.InstanceId; cfgId = furn.AgentConfigId; furnMap = furn.MapConfigId; } catch { continue; }
                    if (ownerId == 0 || cfgId == 0) continue;

                    int bagOf = 0;
                    GameCore.HotUpdate.Config_Furniture fcfg = null;
                    try { if (dict.TryGetValue(cfgId, out fcfg) && fcfg != null) bagOf = fcfg.BagId; } catch { }
                    if (bagOf != bagId) continue;

                    if (furnMap == curMap) owners.Add(ownerId);
                    else if (seenCfg.Add(cfgId)) // 同配置他图实例只记一名（日志防刷屏）
                        leftBehind.Add($"{(fcfg != null ? BagTable.FurnName(fcfg) : "?")}(cfg {cfgId})");
                }
            }
        }
        catch (Exception e) { WarnOnce("furn-enum", "家具枚举异常（该源跳过）: " + e.Message); }

        return owners;
    }

    /// <summary>玩家落点与当前图。当前图=BattleShowWorld.mapConfigId（展示世界随玩家切图，
    /// 私有属性 interop 直读；读取异常回退 GetHomeMapId——家中改键主路径下两者一致）；
    /// 位置=LeadingRole 私有 transform 链（world._AgentManager 同款私有字段直读先例）。
    /// 任一环不可得=false，绝不以 Vector3.zero/0 图盲掉。</summary>
    private static bool PlayerDropPos(GameCore.HotUpdate.Battle.Logic.AgentManager am, out Vector3 pos, out int mapId)
    {
        pos = default;
        mapId = 0;
        try
        {
            try { mapId = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.Battle.Show.BattleShowWorld>.Instance?._mapConfigId ?? 0; } catch { }
            if (mapId == 0) { try { mapId = am.GetHomeMapId(); } catch { } }

            var role = am.GetLeadingRole();
            if (role == null) return false;
            var tc = role._transformComponent;
            var tr = tc?.transform;
            if (tr == null) return false;
            pos = tr.position;
            return mapId != 0;
        }
        catch { return false; }
    }
}
