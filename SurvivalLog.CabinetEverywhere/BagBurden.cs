using System;
using System.Collections.Generic;
using SurvivalLog.ModShared;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 负重改写引擎（2026-11-07 作者令：背包负重调整新增 + 原独立 mod CabinetBurden 并回）。
/// ① 背包负重调整：[Burden] BackpackBurden（公斤，0=官方原值，0~1000）×1000 直写
///    9 个可穿背包（BackpackBagIds）的 Config_Bag.Burden，天赋加成照常独立叠加；
/// ② 柜子负重解放：[Burden] CabinetUnburden=true 把家具储物包 Burden 清零 = 官方"无负重"
///    语义（CanAddWeight 首步 ≤0 恒可放入；界面负重条 v-if max&gt;0 整行隐藏），false=写回原值。
///
/// 机制（CabinetBurden DESIGN 2026-10-11/10-24 反汇编实证随迁）：
/// - Config_Furniture 无负重字段；家具/背包负重唯一来源 = Config_Bag.Burden（int，内部单位=克，
///   UI 显示 Kg：fmtWeight 不做换算、原生 9600=9.6kg——kg×1000 写表即此口径）；
/// - BagComponent.OnInit 快照 Burden → 改表后需重新读档才对已存在容器/已穿背包生效；
/// - 幂等：进程内首读值&gt;0 记为原值；入册先于一切跳过判断——否则写 0 后下一轮会被
///   "raw&lt;=0 跳过"吞掉还原路径（旧倍数版即为此结构翻车，CabinetBurden 重构定案）；
/// - 家具包名单自动发现（_Config_Furniture_Dict 全部 BagId&gt;0），默认排除 3(购物车)/4(轿车)
///   ——载具包走背包装备体系（CabinetBurden 原默认，并回时内置不出配置键）；
/// - 原生 Burden=0 的包（冰箱/置物架等）不入册、永不接管。
/// </summary>
internal static class BagBurden
{
    // 柜子负重解放默认排除的 BagId（CabinetBurden 原默认内置：购物车/轿车走背包装备体系）
    private static readonly int[] UnburdenExcludeBagIds = { 3, 4 };

    // bagId -> 原生 Burden（首读 >0 入册；入册后即使当前被写成 0 也永远按原值还原）
    private static readonly Dictionary<int, int> Orig = new();

    private static bool _announced; // 首轮生效摘要只报一次
    private static bool _restored;  // General.Enabled=false 还原完成后空转（每帧调，幂等降载）

    /// <summary>
    /// 5s 慢拍幂等改写（AccessTicker 调；配置表未就绪=空跑，下一拍 Rerun/周期再试）。
    /// </summary>
    internal static void SlowTick()
    {
        var cm = BagTable.Cm();
        var dict = BagTable.BagDict(cm);
        if (cm == null || dict == null || dict.Count == 0) return;

        // 背包目标值：kg 夹 0~1000 后 ×1000 写表；kg=0 = 写回原生（0=恢复官方口径）
        int kg = Math.Max(0, Math.Min(1000, CabinetEverywherePlugin.BackpackBurden.Value));
        int backpackWant = kg <= 0 ? -1 : checked(kg * 1000);
        bool unburden = CabinetEverywherePlugin.CabinetUnburden.Value;

        var furnBags = DiscoverFurnitureBagIds(cm);

        int bpManaged = 0, bpChanged = 0, cbManaged = 0, cbChanged = 0;
        var lines = new List<string>();
        foreach (var pair in dict)
        {
            var bag = pair.Value;
            if (bag == null) continue;

            bool isBackpack = Array.IndexOf(CabinetEverywherePlugin.BackpackBagIds, pair.Key) >= 0;
            bool isCabinet = !isBackpack && furnBags.Contains(pair.Key);
            if (!isBackpack && !isCabinet) continue;

            int raw = 0;
            try { raw = bag.Burden; } catch { continue; }

            // 入册先于一切跳过（见类注释：防写 0 后还原路径被吞）
            if (!Orig.ContainsKey(pair.Key))
            {
                if (raw <= 0) continue;
                Orig[pair.Key] = raw;
            }

            int want = isBackpack
                ? (backpackWant > 0 ? backpackWant : Orig[pair.Key])
                : (unburden ? 0 : Orig[pair.Key]);

            if (isBackpack) bpManaged++; else cbManaged++;

            if (raw == want)
            {
                if (CabinetEverywherePlugin.Verbose.Value)
                    lines.Add($"BAG {pair.Key}({BagTable.Name(bag)}) 负重 {raw}（原 {Orig[pair.Key]}，已达标）");
                continue;
            }

            bag.Burden = want;
            if (isBackpack) bpChanged++; else cbChanged++;
            lines.Add($"BAG {pair.Key}({BagTable.Name(bag)}) 负重 {raw} -> {want}" +
                      (isCabinet && want == 0 ? "（无限制）" : ""));
        }

        _restored = false; // 本拍有接管动作，重新武装停用还原路

        foreach (var l in lines)
            CabinetEverywherePlugin.Log.LogInfo("[CabinetEverywhere] " + l);

        if (!_announced && (bpManaged > 0 || cbManaged > 0))
        {
            _announced = true;
            if (cbManaged > 0 && unburden)
                CabinetEverywherePlugin.Log.LogInfo(
                    $"[CabinetEverywhere] 柜子负重解放生效：{cbManaged} 个储物包负重清零 → 无限制（名单自动发现，默认排除购物车 3/轿车 4；原生无负重的包自动跳过）。柜子界面负重条整行隐藏，重进存档一次对已存在容器生效。");
            else if (cbManaged > 0)
                CabinetEverywherePlugin.Log.LogInfo(
                    $"[CabinetEverywhere] 柜子负重解放停用：{cbManaged} 个储物包负重保持/还原原生值（重进存档生效）。");
            if (bpManaged > 0 && backpackWant > 0)
                CabinetEverywherePlugin.Log.LogInfo(
                    $"[CabinetEverywhere] 背包负重生效：{bpManaged} 个背包统一 {kg}kg（原生 9600/12000/12480 即 9.6/12/12.5kg 量级各异，天赋加成照常叠加）；重新读档后对已穿背包生效。");
        }
    }

    /// <summary>
    /// General.Enabled=false 对称还原（AccessTicker 每帧调；幂等降载——还原一遍后空转，
    /// SlowTick 重新接管时再武装）。表值写回原生；已存在容器/已穿背包仍需读档一次回官方值。
    /// </summary>
    internal static void SyncDisabled()
    {
        if (_restored || Orig.Count == 0) return;
        var cm = BagTable.Cm();
        var dict = BagTable.BagDict(cm);
        if (cm == null || dict == null) return;

        int changed = 0;
        foreach (var pair in dict)
        {
            if (!Orig.TryGetValue(pair.Key, out var orig)) continue;
            var bag = pair.Value;
            if (bag == null) continue;
            try
            {
                if (bag.Burden != orig)
                {
                    bag.Burden = orig;
                    changed++;
                }
            }
            catch { }
        }
        _restored = true;
        if (changed > 0)
            CabinetEverywherePlugin.Log.LogInfo(
                $"[CabinetEverywhere] 总开关关闭：{changed} 个包负重写回原生值（已存在容器/已穿背包读档一次后回官方值）。");
    }

    /// <summary>
    /// 扫 _Config_Furniture_Dict 收集全部带储物包的 BagId（不限 FurnitureType：
    /// Type=2 可放置 + Type=0 场景固定柜），套内置排除 {3,4}。CabinetBurden.DiscoverTargets 同款。
    /// </summary>
    private static HashSet<int> DiscoverFurnitureBagIds(GameCore.HotUpdate.ConfigManager cm)
    {
        var result = new HashSet<int>();
        var furn = BagTable.FurnDict(cm);
        if (furn == null) return result;
        foreach (var pair in furn)
        {
            var f = pair.Value;
            if (f == null) continue;
            int bagId = 0;
            try { bagId = f.BagId; } catch { continue; }
            if (bagId > 0) result.Add(bagId);
        }
        foreach (var id in UnburdenExcludeBagIds) result.Remove(id);
        return result;
    }
}
