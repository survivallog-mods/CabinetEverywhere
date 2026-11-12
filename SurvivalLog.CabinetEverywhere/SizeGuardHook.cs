using System;
using HarmonyLib;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 尺寸抢写钩（读档掉物品修复，2026-11-12 实机取证）。
///
/// 病灶（日志 LogOutput 1801 行 + il2cpp 反汇编实锤）：
/// 读档流程会把 Config_Bag 尺寸洗回原生（柜子2/3、金属柜、床头柜等包宽 12→8/4/6），
/// 而 ItemManager.StartBattle→LoadItemsFromSave→AddItem→SetBagPosSafe→GetOwnerBagSize
/// 按当时表值校验每件物品的 BagPos——放在第 9~12 列/加高行的物品被判越界，
/// TryDropOverflowItemData 官方掉落到地上（AddItem 0x277e61c 调用点实证）。mod 原有
/// 5s 慢通道幂等重写（世界重绑清签名）在物品加载之后，窗口内物品已掉。
///
/// 修法：prefix 抢在物品加载之前把表写回 mod 目标值。挂在 ItemManager.StartBattle
/// （LoadItemsFromSave 的唯一宿主，0x27ab880 调用点实证）——prefix 必然先于物品校验
/// 执行。幂等（SizeEnginePoll 签名门已清），读档早期无 UI 可刷，安全。若 prefix 时
/// 家具尚未建全（柜子包进不了目标集），由帧守卫+5s 慢通道补写——此时该包物品按原生
/// 尺寸校验的窗口仍在（已知残留风险，实测以日志观察）。
/// 表重载若发生在更晚异步（1771→1801 间隔实证），由 RailUi.SizeGuardFrame 帧级守卫
/// 当帧写回兜底（窗口 5s→1 帧）。
/// </summary>
internal static class SizeGuardHook
{
    private static bool _installed;

    internal static void Install()
    {
        if (_installed) return;
        try
        {
            var type = typeof(GameCore.HotUpdate.Battle.Logic.ItemManager);
            var original = AccessTools.Method(type, "StartBattle");
            if (original == null)
            {
                CabinetEverywherePlugin.Log.LogWarning("[CERail] SizeGuard 钩未装上（ItemManager.StartBattle 缺失，回退 5s 慢通道+帧守卫）");
                return;
            }
            new Harmony("com.local.survivallog.cabineteverywhere.sizeguard")
                .Patch(original, prefix: new HarmonyMethod(typeof(SizeGuardHook), nameof(Prefix)));
            _installed = true;
            CabinetEverywherePlugin.Log.LogInfo(
                "[CERail] SizeGuard 钩已挂（ItemManager.StartBattle prefix 抢写——治读档表回原生致物品越界掉落）");
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CERail] SizeGuard 钩安装异常（回退 5s 慢通道）: " + e.Message);
        }
    }

    /// <summary>读档启动族 prefix：清签名+清守卫缓存→柜子名单/场景实例重扫→SizeEnginePoll 全量写表。
    /// 三方法共享，幂等（第二三次进入=签名未变零写）。</summary>
    private static void Prefix()
    {
        try
        {
            CabinetEverywherePlugin.Log.LogInfo("[CERail] SizeGuard 读档抢写（ItemManager.StartBattle 前）");
            RailUi.ReapplyOnBattleStart();
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CERail] SizeGuard prefix 异常（回退 5s 慢通道+帧守卫）: " + e.Message);
        }
    }
}
