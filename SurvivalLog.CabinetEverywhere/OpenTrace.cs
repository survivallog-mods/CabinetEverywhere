using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using HarmonyLib;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// [PERFDIAG] 打开链计时探针 v2（PERF_NOTES.md P1 定责专用；验证后整文件删除）。
///
/// v1 教训（2026-11-14 闪退）：全量反射挂几百方法（含 .ctor/.cctor/属性访问器/超短函数），
/// Dobby detour 装载期原生崩溃（日志止于安装循环中，「已挂 N 方法」未打出）。v2 收敛：
/// ①只挂三个打开链类（LogicAdapter/ReduxUISystem/WebUI_BackpackUI）——ItemManager 与已有
///   搬运合并 7 patch 叠加、State_Web_* 数据类、基类全部不碰；
/// ②名字白名单（打开/刷新/构造/同步族），显式排除 ctor/cctor/属性访问器/运算符/超短通用函数；
/// ③prefix+postfix（弃 finalizer 多参注入——HarmonyX IL2CPP 支持存疑），标准注入参数；
/// ④**每个 patch 前一行排雷日志**（固定顺序：类序+名字序）——再闪退时日志末行=凶手方法，
///   下版精确剔除（可迭代收敛，不用回滚整个探针）。
///
/// 计时：ThreadStatic 栈记 (token,tick)，postfix 出栈算差；>2ms 入窗口账（卡顿帧现场行消费）。
/// </summary>
internal static class OpenTrace
{
    private static bool _installed;
    private static readonly Dictionary<int, string> _keys = new(); // MetadataToken → 类.方法（安装期填，运行期只读）

    internal struct Acc { public long Ms, Hits; public Acc(long ms, long hits) { Ms = ms; Hits = hits; } }
    internal static readonly ConcurrentDictionary<string, Acc> Window = new(); // 主线程写，Report 线程读

    private struct Ent { public int Token; public long Tick; }
    [ThreadStatic] private static Stack<Ent> _stack;

    // 名字白名单（前缀匹配，聚焦打开链动词族；大小写敏感=官方命名风格 PascalCase）
    // v3（2026-11-14 二次闪退）："On" 已剔除——OnEventRegister 被 cctor 链调用时经本 hook 走 managed
    // 包装 → 类初始化未完成重入 → 无限递归栈溢出；事件处理器族与打开链无关，全族不挂。
    // v4（2026-11-14 NRE 风暴）：再剔 "Init"/"Update"——LogicAdapter::Initialize 的 DMD 包装层每次
    // 调用抛 NRE（120~530 次/s，FPS 掉到 27~40、巨帧被撑大）；Update 族每帧空转纯开销。
    // v5（2026-11-14 读档闪退）：On 族黑名单制放行失败——OnEventRegister=cctor 重入栈溢出、
    // OnNextDayWeatherUpdated=封送层 CLR 致命错误，事件处理器族两类死法，整体永久不挂。
    private static readonly string[] NamePrefixes =
        { "Open", "Show", "Refresh", "Build", "Sync", "Render", "Enter", "Switch", "Create", "Load" };
    // 显式排除（v1 闪退嫌疑群：构造/属性/运算符/超短通用/释放）
    private static bool Excluded(string n)
        => n.IndexOf('.') >= 0 || n.StartsWith("get_") || n.StartsWith("set_") || n.StartsWith("op_")
           || n == "ToString" || n == "Equals" || n == "GetHashCode" || n == "Finalize" || n == "Dispose"
           || n == "GetType" || n == "MemberwiseClone";

    internal static void Install()
    {
        if (_installed) return;
        _installed = true;
        try
        {
            var h = new Harmony("com.local.survivallog.cabineteverywhere.opentrace");
            var types = new[]
            {
                typeof(GameCore.HotUpdate.ReduxUI.LogicAdapter),
                typeof(GameCore.HotUpdate.ReduxUI.ReduxUISystem),
                typeof(GameCore.HotUpdate.ReduxUI.WebUI_BackpackUI),
            };
            int patched = 0;
            foreach (var t in types)
            foreach (var m in AccessTools.GetDeclaredMethods(t).OrderBy(m2 => m2?.Name))
            {
                try
                {
                    if (m == null || m.IsGenericMethod || m.IsAbstract) continue;
                    var name = m.Name ?? "";
                    if (name.Length == 0 || Excluded(name)) continue;
                    if (!NamePrefixes.Any(p => name.StartsWith(p, StringComparison.Ordinal))) continue;
                    var key = t.Name + "." + name;
                    // 排雷日志（闪退时日志末行=本方法 → 下版剔除）
                    CabinetEverywherePlugin.Log.LogInfo("[PERFDIAG][OpenTrace] patching " + key);
                    h.Patch(m,
                        prefix: new HarmonyMethod(typeof(OpenTrace), nameof(Pre)),
                        postfix: new HarmonyMethod(typeof(OpenTrace), nameof(Post)));
                    _keys[m.MetadataToken] = key;
                    patched++;
                }
                catch { /* 单方法失败=跳过 */ }
            }
            // v6 精确点名（dump.cs 取证）：v4 实测 15 个前缀方法零命中巨帧+WebView 侧最长任务仅
            // 106ms+巨帧宽度恒定 ~1s（真计算不会这么齐）——嫌疑=官方 LoadPage→就绪 等待带
            // （WebUILayer 有 STALL band/learned/escalate 自适应超时常量）与 GetMsg 页面 JSON 构建。
            // 全部普通实例/静态方法，不碰 On 族（两类死法已证）与泛型（ToJson<T>）。
            var pinpoints = new (Type t, string[] names)[]
            {
                (typeof(GameCore.HotUpdate.ReduxUI.WebUILayer), new[]
                    { "LoadPage", "ShowPage", "HidePage", "RemovePage", "SendMessageToPage",
                      "FlushMessageQueue", "PostOrQueueRootMessage", "BroadcastToAllPages", "BuildLoadPageJson" }),
                (typeof(GameCore.HotUpdate.ReduxUI.WebUI_BackpackUI), new[] { "GetMsg" }),
                // v7.1：整包重建定责——单件操作帧（254~518ms）可见成本仅 15~32ms，大头疑在
                // Reducer_Web_BackpackUI 的 RA_* 处理器与 BuildBagJson（PERF_NOTES 已证整包重建占 65-80%）。
                // "RA_*"=前缀通配（全静态普通方法，非 On 族/泛型，安全）。
                (typeof(GameCore.HotUpdate.ReduxUI.Reducer_Web_BackpackUI), new[] { "BuildBagJson", "RA_*" }),
            };
            foreach (var (t, names) in pinpoints)
            foreach (var m in AccessTools.GetDeclaredMethods(t))
            {
                try
                {
                    if (m == null || m.IsGenericMethod || m.IsAbstract) continue;
                    var name = m.Name ?? "";
                    if (name.Length == 0) continue;
                    bool hit = false;
                    foreach (var want in names)
                        if (want == name || (want.EndsWith("*") && name.StartsWith(want.Substring(0, want.Length - 1), StringComparison.Ordinal)))
                        { hit = true; break; }
                    if (!hit) continue;
                    var key = t.Name + "." + name;
                    CabinetEverywherePlugin.Log.LogInfo("[PERFDIAG][OpenTrace] patching " + key);
                    h.Patch(m,
                        prefix: new HarmonyMethod(typeof(OpenTrace), nameof(Pre)),
                        postfix: new HarmonyMethod(typeof(OpenTrace), nameof(Post)));
                    _keys[m.MetadataToken] = key;
                    patched++;
                }
                catch { /* 单方法失败=跳过 */ }
            }
            CabinetEverywherePlugin.Log.LogInfo("[PERFDIAG][OpenTrace] 已挂 " + patched + " 方法（打开链计时；卡顿帧现场行将附耗时排行）");
        }
        catch (Exception e)
        {
            CabinetEverywherePlugin.Log.LogWarning("[PERFDIAG][OpenTrace] 安装失败（零影响）: " + e.Message);
        }
    }

    private static void Pre(System.Reflection.MethodBase __originalMethod)
    {
        try
        {
            if (__originalMethod == null) return;
            (_stack ??= new Stack<Ent>(8)).Push(new Ent { Token = __originalMethod.MetadataToken, Tick = Stopwatch.GetTimestamp() });
        }
        catch { }
    }

    private static void Post(System.Reflection.MethodBase __originalMethod)
    {
        try
        {
            if (_stack == null || _stack.Count == 0) return;
            var e = _stack.Pop();
            if (__originalMethod == null || e.Token != __originalMethod.MetadataToken)
            { _stack.Clear(); return; } // 异常路径残留/失配：清栈丢账（防御性，正常路径零发生）
            long ms = (Stopwatch.GetTimestamp() - e.Tick) * 1000 / Stopwatch.Frequency;
            if (ms < 1) return; // v4：2ms→1ms——单次 1~2ms×数百次的分布型成本（如逐件 JSON）不能漏账
            if (!_keys.TryGetValue(e.Token, out var key)) return;
            Window.AddOrUpdate(key, new Acc(ms, 1), (_, a) => new Acc(a.Ms + ms, a.Hits + 1));
        }
        catch { }
    }

    /// <summary>窗口内累计耗时排行（SlowFrame/Report 消费后清零）。无数据返回 null。</summary>
    internal static string TakeTop(int n)
    {
        if (Window.IsEmpty) return null;
        var sb = new StringBuilder(128);
        int i = 0;
        foreach (var kv in Window.OrderByDescending(kv => kv.Value.Ms))
        {
            if (i++ >= n) break;
            if (i > 1) sb.Append("，");
            sb.Append(kv.Key).Append(' ').Append(kv.Value.Ms).Append("ms");
            if (kv.Value.Hits > 1) sb.Append('×').Append(kv.Value.Hits);
        }
        Window.Clear();
        return sb.Length == 0 ? null : sb.ToString();
    }
}
