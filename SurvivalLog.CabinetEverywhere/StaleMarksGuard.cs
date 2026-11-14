using System;
using System.Collections.Generic;
using HarmonyLib;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 关页动作标记跳过（spec 2026-11-14-official-cost-guard §A）。
///
/// 病灶（实测+反汇编定责，2026-11-14）：LogicAdapter.UpdateItemActionMarks（@0x2A90550）不查
/// 页面开关，一次给 9 个界面的 Reducer 全发动作标记重算——页面已关时 Reducer_Web_BackpackUI
/// .RA_UpdateItemActionMarks（@0x2B05CB0）仍全量跑（RefreshItems_A，双背包再 +RefreshItems_B，
/// 内部 BuildBagJson 整包重建），实测关页巨帧 411/719/1225/2142ms（PERFDIAG 卡顿帧行）。
/// 烹饪/工作台/交易/发电机/暖炉不在这 9 页扇出名单=「烹饪不卡、背包页卡」的结构性差异。
///
/// 安全性（跳过零损失）：RA_OpenUI（@0x2B036A0）开页时 new State_Web_BackpackUI + InitSide_A/B
/// + BuildATabs 全量重建——关页期间算出的标记在重开时全部作废重算。
///
/// 拦法：bool prefix（false=跳过官方处理器），按 __originalMethod.DeclaringType 查表取该页
/// UI 类型，IsUIActive=false 才跳过；查不到/异常一律放行（保守）。事件频率级调用，每次 1 次
/// IsUIActive（非每帧）。
/// </summary>
internal static class StaleMarksGuard
{
    private static bool _installed;

    // 九页扇出名单（LogicAdapter.UpdateItemActionMarks 反汇编 @0x2A90550；Reducer↔UI 一一对应）
    private static readonly Dictionary<Type, Type> Map = new()
    {
        { typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_BackpackUI),   typeof(GameCore.HotUpdate.ReduxUI.WebUI_BackpackUI) },
        { typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_RatCage),      typeof(GameCore.HotUpdate.ReduxUI.WebUI_RatCage) },
        { typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_Brew),         typeof(GameCore.HotUpdate.ReduxUI.WebUI_Brew) },
        { typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_Shredder),     typeof(GameCore.HotUpdate.ReduxUI.WebUI_Shredder) },
        { typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_Compressor),   typeof(GameCore.HotUpdate.ReduxUI.WebUI_Compressor) },
        { typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_DroneHub),     typeof(GameCore.HotUpdate.ReduxUI.WebUI_DroneHub) },
        { typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_Dye),          typeof(GameCore.HotUpdate.ReduxUI.WebUI_Dye) },
        { typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_MaterialRack), typeof(GameCore.HotUpdate.ReduxUI.WebUI_MaterialRack) },
        { typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_TrashCan),     typeof(GameCore.HotUpdate.ReduxUI.WebUI_TrashCan) },
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
            CabinetEverywherePlugin.Log.LogInfo("[CE.关页标记] 已挂 " + patched + "/9 页（页面未激活跳过 RA_UpdateItemActionMarks）");
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
