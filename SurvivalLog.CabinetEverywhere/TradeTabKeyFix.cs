using System;
using HarmonyLib;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 交易页 A/D 切页签修复（2026-11-12 作者实报：官方更新 1.1.21271/buildid 26615062 后
/// 无人机交易页 A/D 切页签失灵——禁 mod 裸跑复现=官方回归；烹饪页/投送物资正常）。
///
/// 终案（gamekb 2026-11-12_26615062 反汇编 + 实机四级诊断日志定案，RVA 全档内）：
/// - 键盘输入层完好：HotKeyManager.Update 前缀实测 Unity 本帧看到 A/D 按下、
///   escBlocked/textInput/planMode/inputDisabled 全 False（实机日志 2026-11-12 21:2x）。
/// - 断链点=Update 的 A/D 块三门（0x304ED98 GetOpenPanelType / 0x304EE13
///   IsUIActive(ConfirmationDialog) / 0x304EE3A HasModalUIOpenExcept）之第三门：
///   实测 panel=WebUI_TradeUI、confirmDlg=False、**modalExcept=True**。
/// - HasModalUIOpenExcept 链（0x2AA2730→EscCloseLayer 0x2A9CDA0）：遍历
///   UIViewLayer.GetOpenUITypes，除入参面板外，任一 UI 在 EscClose 配置且 modal 位
///   （cfg@0x20）开即 true。无人机交易从地图/电台打开后底层 UI 不再先关（对照官方
///   SwitchTradeToDispatchAsync 0x2A923D0「等 UI 关净才开」自知时序），殃及 A/D 门。
/// - 若动作真被派发，reducer 侧守卫本可全过：实机 CDP 现场交易页 phase=='trade'
///   （bag-op-hint 渲染中）+ 页签 28 个在位。
///
/// 修法两层（互补、均官方修复后自动静默）：
/// ①Update 前缀（0x304DDE0 前挂）：A/D 按下且 panel==TradeUI 且 confirmDlg=false 且
///   modalExcept=true（=官方将拒发）时，替官方补发 Ac_TradeUI_SwitchTabByKey.SendAction
///   （官方动作本体）——reducer 自身守卫（Phase=='trade'、BagTabs>1、边界 no-op）原样
///   生效，只绕过误杀的 modal 门。官方修好时序后 modalExcept=false→官方照发、本层零动作。
/// ②RA_SwitchTabByKey postfix（0x2D6F850 后挂）：动作到达但官方守卫拒切（BagOwnerId
///   未变）且本应能切（Phase=='trade'、Count&gt;1、邻居在界内）时，改发点击路
///   Ac_TradeUI_SwitchBag.SendAction（TradeUI.html 页签点击同 payload，RA_SwitchBag
///   全链）。覆盖①覆盖不到的 reducer 级拒绝；官方修复即零动作。
/// 在途补偿：连按时第 2 键先于第 1 键的 SwitchBag 落地，按「上一补偿目标=当前」算邻居，
/// 步进数=按键数（落地后 BagOwnerId 已变，自然退出在途态）。
/// 门=General.Enabled（mod 总开关）。纯 UI 态补偿（零配置/存档写），日志仅首效一条。
/// </summary>
internal static class TradeTabKeyFix
{
    private static bool _installed;
    private static bool _loggedOnce;
    private static string _lastRefusal; /* 拒切原因去重（每个不同口径只打一条，防刷屏） */

    private static long _before;        // prefix 记 BagOwnerId（reducer 单线程派发，静态栈安全）
    private static long _inflightFrom;  // 上次补偿的起始 owner（0=无在途）
    private static long _inflightTo;    // 上次补偿的目标 owner

    internal static void Install()
    {
        if (_installed) return;
        try
        {
            var original = HarmonyLib.AccessTools.Method(
                typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_TradeUI), "RA_SwitchTabByKey");
            var update = HarmonyLib.AccessTools.Method(
                typeof(GameCore.HotUpdate.Battle.Show.HotKeyManager), "Update");
            if (original == null || update == null)
            {
                CabinetEverywherePlugin.Log.LogWarning("[TradeTabKey] RA_SwitchTabByKey/HotKeyManager.Update 缺失（游戏改版？），修复未装");
                return;
            }
            var h = new Harmony("com.local.survivallog.cabineteverywhere.tradetabkey");
            h.Patch(original,
                prefix: new HarmonyMethod(typeof(TradeTabKeyFix), nameof(RaPrefix)),
                postfix: new HarmonyMethod(typeof(TradeTabKeyFix), nameof(RaPostfix)));
            h.Patch(update, prefix: new HarmonyMethod(typeof(TradeTabKeyFix), nameof(UpdatePrefix)));
            _installed = true;
            CabinetEverywherePlugin.Log.LogInfo("[TradeTabKey] A/D 切页签修复已挂（官方 1.1.21271 modal 门误杀兜底：Update 前缀补发 + reducer 补偿双层，官方修复即自动失效）");
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[TradeTabKey] 修复安装异常: " + e.Message);
        }
    }

    // ---- 层①：Update 前缀——官方将拒发时补发官方动作 ----

    private static void UpdatePrefix(object __instance)
    {
        try
        {
            if (CabinetEverywherePlugin.Enabled != null && !CabinetEverywherePlugin.Enabled.Value) return;
            bool a = UnityEngine.Input.GetKeyDown(UnityEngine.KeyCode.A);
            if (!a && !UnityEngine.Input.GetKeyDown(UnityEngine.KeyCode.D)) return;

            var panel = GameCore.HotUpdate.Battle.Show.ContainerTabHotKey.GetOpenPanelType();
            if (panel == null || panel.Name != "WebUI_TradeUI") return; /* 其他面板官方路径自足 */

            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated) return;
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            if (rus == null) return;
            try
            {
                if (rus.IsUIActive(Il2CppInterop.Runtime.Il2CppType.From(
                        typeof(GameCore.HotUpdate.ReduxUI.WebUI_ConfirmationDialog)))) return; /* 真确认弹窗在场=尊重官方门 */
            }
            catch { return; }
            bool blocked;
            try { blocked = rus.HasModalUIOpenExcept(panel); }
            catch { return; }
            if (!blocked) return; /* 官方将自行派发（修复后的正常态）——不重复 */

            int dir = a ? -1 : 1;
            GameCore.HotUpdate.ReduxUI.Ac_TradeUI_SwitchTabByKey.SendAction(dir);
            if (!_loggedOnce)
            {
                _loggedOnce = true;
                CabinetEverywherePlugin.Log.LogWarning($"[TradeTabKey] A/D 修复首次生效：官方 modal 门误杀（交易页下叠 UI 未关），已补发官方动作 dir={dir}——reducer 守卫照常把关");
            }
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[TradeTabKey] Update 前缀异常: " + e.Message);
        }
    }

    // ---- 层②：reducer postfix——官方守卫拒切时走点击路 ----

    private static void RaPrefix(GameCore.HotUpdate.ReduxUI.State_Web_TradeUI state)
    {
        _before = 0;
        try { if (state != null) _before = state.BagOwnerId; } catch { }
    }

    private static void RaPostfix(
        GameCore.HotUpdate.ReduxUI.Ac_TradeUI_SwitchTabByKey ac,
        GameCore.HotUpdate.ReduxUI.State_Web_TradeUI state)
    {
        try
        {
            if (CabinetEverywherePlugin.Enabled != null && !CabinetEverywherePlugin.Enabled.Value) return;
            if (ac == null || state == null) return;

            var cur = state.BagOwnerId;
            if (cur != _before)
            {
                /* 官方自己切了（或后续流程已切）——正常路径，清在途、零动作 */
                _inflightFrom = 0;
                return;
            }

            string phase = null;
            try { phase = state.Phase?.Value; } catch { }
            var tabs = state.BagTabs;
            string refusal = "phase=" + (phase ?? "null") + " tabs=" + (tabs == null ? "null" : tabs.Count.ToString());
            if (phase != "trade") { LogRefusal(refusal); return; }         /* roster/done 官方有意禁切，同口径尊重 */
            if (tabs == null || tabs.Count <= 1) { LogRefusal(refusal); return; }

            long from = _before;
            if (_inflightFrom != 0 && _inflightFrom == _before) from = _inflightTo; /* 在途补偿 */

            int idx = -1;
            for (int i = 0; i < tabs.Count; i++)
            {
                var t = tabs[i];
                if (t != null && t.owner == from) { idx = i; break; }
            }
            if (idx < 0) idx = 0; /* 官方同口径：FindIndex 未中按下标 0 记（cmovns 语义） */
            int ni = idx + (ac.Dir < 0 ? -1 : 1);
            if (ni < 0 || ni >= tabs.Count) return; /* 边界按键：官方同款 no-op */

            long target = tabs[ni].owner;
            GameCore.HotUpdate.ReduxUI.Ac_TradeUI_SwitchBag.SendAction("{\"ownerId\":\"" + target + "\"}");
            _inflightFrom = from;
            _inflightTo = target;
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[TradeTabKey] reducer 补偿异常: " + e.Message);
        }
    }

    /// <summary>拒切诊断（同口径只打首条）：动作已到达 reducer 但补偿未动作的原因。</summary>
    private static void LogRefusal(string why)
    {
        if (_lastRefusal == why) return;
        _lastRefusal = why;
        CabinetEverywherePlugin.Log.LogWarning("[TradeTabKey] 补偿未动作（" + why + "）——官方守卫口径见此行");
    }
}
