using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.Linq;
using System.Text;
using BepInEx.Configuration;
using BepInEx.Logging;
using Il2CppInterop.Runtime.Injection;
using UnityEngine;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// [PERFDIAG] ==== 临时性能诊断（PERF_NOTES.md 验证专用；验证完成后整文件删除，
/// 并按 “[PERFDIAG]” 注释标记清除各调用点）====
/// - R2 验证：AppDomain.FirstChanceException 全局哨兵（托管异常按类型计数，含被空 catch 吞掉的）
///   + 高频路径空 catch 打点（PerfDiag.Swallow(tag)，一行，不改变吞掉语义）；
/// - 帧率窗口统计：每 ReportIntervalSeconds 一行 avg FPS / &gt;50ms、&gt;100ms 慢帧数 / 最大帧时间；
/// - R1/R3/R4/R5/R8 A/B 开关（[PerfDiag] cfg 节，默认全 false=保持原样；改动需重启游戏生效）。
/// 开销纪律：热路径仅并发字典自增（无异常=零调用），汇总 10s 一行 Info——自身不构成卡顿源。
/// 独立挂载（不受 General.Enabled 影响）：总开关关闭时诊断也要活着。
/// </summary>
internal static class PerfDiag
{
    private static ManualLogSource _log;
    private static bool _installed;
    private static long _excTotal; // first-chance 总量熔断（防极端异常风暴把计数本身变热点）

    // ---- A/B 开关（默认 false = 原样） ----
    internal static ConfigEntry<bool> DisableR1SizeGuard, DisableR3FrameDrain, DisableR4HotKeyPatch,
        DisableR5KeyboardGate, DisableR8TagFilterBoot;
    internal static ConfigEntry<int> ReportSec;

    internal static bool R1Off => DisableR1SizeGuard != null && DisableR1SizeGuard.Value;
    internal static bool R3Off => DisableR3FrameDrain != null && DisableR3FrameDrain.Value;
    internal static bool R4Off => DisableR4HotKeyPatch != null && DisableR4HotKeyPatch.Value;
    internal static bool R5Off => DisableR5KeyboardGate != null && DisableR5KeyboardGate.Value;
    internal static bool R8Off => DisableR8TagFilterBoot != null && DisableR8TagFilterBoot.Value;

    // ---- 计数器（窗口增量，汇总后清零） ----
    private static readonly ConcurrentDictionary<string, long> Swallowed = new();
    private static readonly ConcurrentDictionary<string, long> ExcByType = new();

    /// <summary>高频路径空 catch 打点（原语义不变：吞掉；只是记一笔）。</summary>
    internal static void Swallow(string tag) => Swallowed.AddOrUpdate(tag, 1, (_, c) => c + 1);

    private static void OnFirstChance(object sender, System.Runtime.ExceptionServices.FirstChanceExceptionEventArgs e)
    {
        try
        {
            if (System.Threading.Interlocked.Increment(ref _excTotal) > 2_000_000) return; // 熔断：总量封顶后不再分型
            ExcByType.AddOrUpdate(e.Exception?.GetType().Name ?? "?", 1, (_, c) => c + 1);
        }
        catch { /* [PERFDIAG] 诊断自身绝不抛 */ }
    }

    internal static void Install(ConfigFile cfg, ManualLogSource log)
    {
        if (_installed) return;
        _installed = true;
        _log = log;
        DisableR1SizeGuard = cfg.Bind("PerfDiag", "DisableR1SizeGuard", false,
            "[PERFDIAG 临时诊断] true=停用 SizeGuardFrame 帧级读检（R1 A/B；读档掉物品防线剩 5s 慢通道+StartBattle 抢写钩）。重启生效。");
        DisableR3FrameDrain = cfg.Bind("PerfDiag", "DisableR3FrameDrain", false,
            "[PERFDIAG 临时诊断] true=停用 FastPoll 每帧 drain IPC，保留 0.5s Tick 的 drain（R3 A/B）。重启生效。");
        DisableR4HotKeyPatch = cfg.Bind("PerfDiag", "DisableR4HotKeyPatch", false,
            "[PERFDIAG 临时诊断] true=不装 HotKeyManager.Update 跳板补丁（R4 A/B；交易页 A/D 切页签修复随之停=可能失灵）。重启生效。");
        DisableR5KeyboardGate = cfg.Bind("PerfDiag", "DisableR5KeyboardGate", false,
            "[PERFDIAG 临时诊断] true=停用 glist 键盘门（R5 A/B；染料桶/暖炉/篮子等页搜索框将无法输入）。重启生效。");
        DisableR8TagFilterBoot = cfg.Bind("PerfDiag", "DisableR8TagFilterBoot", false,
            "[PERFDIAG 临时诊断] true=停用筛选脚本每 5s 全量重注（R8 A/B；标签筛选下拉可能不生效）。重启生效。");
        ReportSec = cfg.Bind("PerfDiag", "ReportIntervalSeconds", 10, "汇总输出间隔秒（3~60 夹持）。");
        AppDomain.CurrentDomain.FirstChanceException += OnFirstChance;
        if (!ClassInjector.IsTypeRegisteredInIl2Cpp<PerfDiagTicker>())
            ClassInjector.RegisterTypeInIl2Cpp<PerfDiagTicker>();
        var go = new GameObject("CabinetEverywhere.PerfDiag");
        UnityEngine.Object.DontDestroyOnLoad(go);
        go.AddComponent<PerfDiagTicker>();
        log.LogInfo("[PERFDIAG] 诊断已挂：first-chance 异常哨兵 + 吞异常打点 + 帧率汇总（" +
                    Math.Clamp(ReportSec.Value, 3, 60) + "s）+ R1/R3/R4/R5/R8 开关（默认全关=原样；验证后删除）");
    }

    private static string TopN(ConcurrentDictionary<string, long> d, int n, out long total)
    {
        total = 0;
        foreach (var kv in d) total += kv.Value;
        var sb = new StringBuilder(96);
        int i = 0;
        foreach (var kv in d.OrderByDescending(kv => kv.Value))
        {
            if (i++ >= n) break;
            if (i > 1) sb.Append(", ");
            sb.Append(kv.Key).Append('×').Append(kv.Value);
        }
        return sb.ToString();
    }

    /// <summary>帧窗口统计（每 ReportSec 一行：avg FPS / 慢帧 / 最大帧 / 吞异常 top / first-chance top）。</summary>
    internal sealed class PerfDiagTicker : MonoBehaviour
    {
        public PerfDiagTicker(IntPtr ptr) : base(ptr) { }
        public PerfDiagTicker() { }

        private float _next;
        private int _frames, _slow50, _slow100;
        private float _sumDt, _maxDt;

        public void Update()
        {
            float dt = Time.unscaledDeltaTime; // [PERFDIAG] 每帧一次读+三次比较，零分配
            _frames++; _sumDt += dt;
            if (dt > _maxDt) _maxDt = dt;
            if (dt > 0.05f) _slow50++;
            if (dt > 0.1f) _slow100++;
            float now = Time.unscaledTime;
            if (now < _next) return;
            _next = now + Math.Clamp(ReportSec?.Value ?? 10, 3, 60);
            try { Report(); } catch { /* [PERFDIAG] */ }
            _frames = 0; _slow50 = 0; _slow100 = 0; _sumDt = 0f; _maxDt = 0f;
        }

        private void Report()
        {
            float avgFps = _sumDt > 0f ? _frames / _sumDt : 0f;
            var sb = new StringBuilder(160);
            sb.Append("[PERFDIAG] ").Append(_sumDt.ToString("0.0", CultureInfo.InvariantCulture)).Append("s：FPS avg ")
              .Append(avgFps.ToString("0.0", CultureInfo.InvariantCulture))
              .Append("｜慢帧 >50ms×").Append(_slow50)
              .Append(" >100ms×").Append(_slow100)
              .Append("｜最大帧 ").Append((_maxDt * 1000f).ToString("0", CultureInfo.InvariantCulture)).Append("ms");
            if (Swallowed.Count > 0)
            {
                long t; string top = TopN(Swallowed, 3, out t);
                sb.Append("｜吞异常 ").Append(t).Append("：").Append(top);
            }
            if (ExcByType.Count > 0)
            {
                long t; string top = TopN(ExcByType, 3, out t);
                sb.Append("｜first-chance ").Append(t).Append("：").Append(top);
            }
            Swallowed.Clear();
            ExcByType.Clear(); // 窗口增量口径
            _log.LogInfo(sb.ToString());
        }
    }
}
