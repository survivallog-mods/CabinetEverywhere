using System;
using System.Collections.Generic;
using HarmonyLib;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 关页动作标记跳过（spec 2026-11-14-official-cost-guard §A；v1.1 收窄=仅 BackpackUI）。
///
/// 病灶（实测+反汇编定责，2026-11-14）：LogicAdapter.UpdateItemActionMarks（@0x2A90550）不查
/// 页面开关，一次给 9 个界面的 Reducer 全发动作标记重算——页面已关时 Reducer_Web_BackpackUI
/// .RA_UpdateItemActionMarks（@0x2B05CB0）仍全量跑（RefreshItems_A，双背包再 +RefreshItems_B，
/// 内部 BuildBagJson 整包重建），实测关页巨帧 411/719/1225/2142ms（PERFDIAG 卡顿帧行）。
///
/// v1.1 收窄教训（2026-11-14 实锤）：v1 挂了全部 9 页——安全论证（「重开页全量重建故跳过无损」）
/// 只对 BackpackUI 反汇编实证过（RA_OpenUI@0x2B036A0 new State+InitSide_A/B），其余 8 页是
/// 未验证的推断。官方无门扇出的设计前提=各页标记**常新**（重开不依赖复算）；染料桶/酿酒桶
/// 即属此类——跳过其关期重算后 Q 丢弃（物品操作）失效（作者实测）。撤防其余 8 页：实测巨帧
/// 全部来自背包页（其背包最大），其余页收益微小风险不证。
/// </summary>
internal static class StaleMarksGuard
{
    private static bool _installed;

    // 仅实证安全页（开页 RA_OpenUI new State+InitSide_A/B 全量重建=关期跳过零损失）
    private static readonly Dictionary<Type, Type> Map = new()
    {
        { typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_BackpackUI), typeof(GameCore.HotUpdate.ReduxUI.WebUI_BackpackUI) },
    };

    internal static void Install()
    {
        if (_installed) return;
        try
        {
            var h = new Harmony("com.local.survivallog.cabineteverywhere.stalemarks");
            int patched = 0;
            foreach (var kv in Map)
            {
                try
                {
                    var m = AccessTools.Method(kv.Key, "RA_UpdateItemActionMarks");
                    if (m == null)
                    {
                        CabinetEverywherePlugin.Log.LogWarning("[CE.关页标记] " + kv.Key.Name + " 缺 RA_UpdateItemActionMarks，跳过该页");
                        continue;
                    }
                    h.Patch(m, prefix: new HarmonyMethod(typeof(StaleMarksGuard), nameof(Skip)));
                    patched++;
                }
                catch (Exception e)
                {
                    CabinetEverywherePlugin.Log.LogWarning("[CE.关页标记] " + kv.Key.Name + " 挂载失败: " + e.Message);
                }
            }
            _installed = patched > 0;
            CabinetEverywherePlugin.Log.LogInfo("[CE.关页标记] 已挂 " + patched + "/1 页（BackpackUI 实证安全；其余 8 页撤防——v1 未验证页跳过致染料桶/酿酒桶 Q 丢弃失效)");
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[CE.关页标记] 安装失败: " + e.Message);
        }
    }

    private static bool Skip(System.Reflection.MethodBase __originalMethod)
    {
        try
        {
            if (!Map.TryGetValue(__originalMethod?.DeclaringType ?? typeof(object), out var ui) || ui == null)
                return true; // 不在名单（不该发生）=放行
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return false; // UI 系统不在=必然无页面开着
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            if (rus == null) return false;
            return rus.IsUIActive(Il2CppInterop.Runtime.Il2CppType.From(ui)); // 活跃=放行；关=跳过
        }
        catch { return true; } // 任何异常=放行（保守）
    }
}
