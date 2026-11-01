using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using BepInEx;
using GameCore.HotUpdate.ReduxUI;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 页签注入：向 烹饪/老鼠笼/酿酒桶/颜料桶 的 Redux 状态 BagTabs（ObservableList）追加柜子页签。
/// 四个界面的容器过滤是内联"冷链电器"判定（不走白名单），因此走状态层；
/// 切换路径 ApplySwitchBag→GetBagData(ownerId) 已实证无类型过滤，Locked=false 即可切换。
/// 轮询幂等：界面每次重推 tabs（打开/刷新）后若柜子页签缺失则自动补挂。
/// 2026-11-02 四轮（作者#2 定案：拖拽同步官方序）：
///   ① 注入集=HomeInstances（柜子 c）∪ AllContainers 的冰箱（f）——官方 CollectFridges
///      漏收的冷链（大容量冰柜类）补进官方数组，否则不在数组=步进锚缺失（三轮案例根因）；
///   ② BagTabs 序对齐显示序（cerail_pinorder.json，JS 拖拽/场景开启经 cmd pinOrder 上报）：
///      官方 A/D 步进走官方数组序，序一致后步进=显示序邻居；重排 Move 优先/RemoveAt+Insert
///      兜底，背包条目恒首位、未登记条目稳定排尾，变化才 Repush（幂等零刷屏）。
/// </summary>
internal static class TabInjector
{
    private sealed class UiSession
    {
        public readonly HashSet<long> Injected = new(); // 本轮会话已注入的 ownerId（防重复/防刷屏）
        public bool WasActive;
    }

    private static readonly Dictionary<string, UiSession> Sessions = new();

    // interop 侧的 UI 类型（IsUIActive/GetStateByUI 参数为 Il2CppSystem.Type）
    private static readonly Il2CppSystem.Type CookingType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_Cooking));
    private static readonly Il2CppSystem.Type RatCageType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_RatCage));
    private static readonly Il2CppSystem.Type BrewType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_Brew));
    private static readonly Il2CppSystem.Type DyeType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_Dye));

    /// <summary>JS 场景键（pinOrder cmd 的 key）→ 会话键（cerail_pinorder.json 与 Sessions 共用）。</summary>
    internal static string PageKeyOfScene(string sceneKey) => sceneKey switch
    {
        "Cooking" => "cooking",
        "RatCage" => "ratcage",
        "BrewPanel" => "brew",
        "DyePanel" => "dye",
        _ => null,
    };

    private static UiSession Session(string key) => Sessions.TryGetValue(key, out var s) ? s : Sessions[key] = new UiSession();

    /// <summary>
    /// 注入集（四轮①）：柜子子集 HomeInstances + 全容器里的冰箱（f）。冰箱多已在官方原生
    /// tabs（CollectFridges 收录的）——have 集去重，实际补进的是漏收的（大容量冰柜类）。
    /// </summary>
    private static IEnumerable<CabinetCatalog.ContainerInst> Injectable()
    {
        foreach (var c in CabinetCatalog.HomeInstances) yield return c;
        foreach (var c in CabinetCatalog.AllContainers)
            if (c.Kind == 'f')
                yield return c;
    }

    internal static void PollAll()
    {
        // General.Enabled 停用门（2026-10-24）：false=不再注入柜子页签；已打开界面重开后
        // 原生重建页签自然收敛（Tabs 数组由界面重推，无需主动摘除）。
        if (CabinetEverywherePlugin.Enabled != null && !CabinetEverywherePlugin.Enabled.Value)
            return;

        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return;
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            if (rus == null) return;

            if (CabinetEverywherePlugin.EnableCooking.Value)
                PollCooking(rus);
            if (CabinetEverywherePlugin.EnableRatCage.Value)
                PollRatCage(rus);
            if (CabinetEverywherePlugin.EnableBrew.Value)
                PollBrew(rus);
            if (CabinetEverywherePlugin.EnableDye.Value)
                PollDye(rus);
        }
        catch (Exception e)
        {
            WarnOnce("poll", "页签轮询异常: " + e.Message);
        }
    }

    // ---- 烹饪 ----
    private static void PollCooking(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var s = Session("cooking");
        bool active = SafeActive(rus, CookingType);
        if (!active) { s.WasActive = false; return; }

        if (!s.WasActive) { s.WasActive = true; s.Injected.Clear(); }
        var st = rus.GetStateByUI(CookingType)?.TryCast<State_Web_Cooking>();
        var tabs = st?.BagTabs;
        if (tabs == null || tabs.Count == 0) return;

        var have = CollectOwners(tabs, t => t?.OwnerId?.Value ?? 0);
        var added = AddMissing("烹饪", s, have, tabs.Count,
            (ownerId, name, index) =>
            {
                var tab = new Data_Web_Cooking_BagTab();
                tab.Index = index;
                tab.OwnerId = new R3.ReactiveProperty<long>(ownerId);
                tab.Name = new R3.ReactiveProperty<string>(name);
                tab.Locked = new R3.ReactiveProperty<bool>(false);
                tab.LockText = new R3.ReactiveProperty<string>("");
                tab.IsNew = new R3.ReactiveProperty<bool>(false);
                tabs.Add(tab);
            });
        if (added > 0 | ApplyOrder(tabs, t => t?.OwnerId?.Value ?? 0, "cooking")) Repush(rus, CookingType);
    }

    // ---- 老鼠笼 ----
    private static void PollRatCage(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var s = Session("ratcage");
        bool active = SafeActive(rus, RatCageType);
        if (!active) { s.WasActive = false; return; }

        if (!s.WasActive) { s.WasActive = true; s.Injected.Clear(); }
        var st = rus.GetStateByUI(RatCageType)?.TryCast<State_Web_RatCage>();
        var tabs = st?.BagTabs;
        if (tabs == null || tabs.Count == 0) return;

        var have = CollectOwners(tabs, t => t?.OwnerId?.Value ?? 0);
        var added = AddMissing("老鼠笼", s, have, tabs.Count,
            (ownerId, name, index) =>
            {
                var tab = new Data_Web_RatCage_BagTab();
                tab.Index = index;
                tab.OwnerId = new R3.ReactiveProperty<long>(ownerId);
                tab.Name = new R3.ReactiveProperty<string>(name);
                tab.Locked = new R3.ReactiveProperty<bool>(false);
                tabs.Add(tab);
            });
        if (added > 0 | ApplyOrder(tabs, t => t?.OwnerId?.Value ?? 0, "ratcage")) Repush(rus, RatCageType);
    }

    // ---- 酿酒桶 ----
    private static void PollBrew(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var s = Session("brew");
        bool active = SafeActive(rus, BrewType);
        if (!active) { s.WasActive = false; return; }

        if (!s.WasActive) { s.WasActive = true; s.Injected.Clear(); }
        var st = rus.GetStateByUI(BrewType)?.TryCast<State_Web_Brew>();
        var tabs = st?.BagTabs;
        if (tabs == null || tabs.Count == 0) return;

        var have = CollectOwners(tabs, t => t?.OwnerId?.Value ?? 0);
        var added = AddMissing("酿酒", s, have, tabs.Count,
            (ownerId, name, index) =>
            {
                var tab = new Data_Web_Brew_BagTab();
                tab.Index = index;
                tab.OwnerId = new R3.ReactiveProperty<long>(ownerId);
                tab.Name = new R3.ReactiveProperty<string>(name);
                tab.Locked = new R3.ReactiveProperty<bool>(false);
                tabs.Add(tab);
            });
        if (added > 0 | ApplyOrder(tabs, t => t?.OwnerId?.Value ?? 0, "brew")) Repush(rus, BrewType);
    }

    // ---- 颜料桶 ----
    private static void PollDye(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var s = Session("dye");
        bool active = SafeActive(rus, DyeType);
        if (!active) { s.WasActive = false; return; }

        if (!s.WasActive) { s.WasActive = true; s.Injected.Clear(); }
        var st = rus.GetStateByUI(DyeType)?.TryCast<State_Web_Dye>();
        var tabs = st?.BagTabs;
        if (tabs == null || tabs.Count == 0) return;

        var have = CollectOwners(tabs, t => t?.OwnerId?.Value ?? 0);
        var added = AddMissing("颜料桶", s, have, tabs.Count,
            (ownerId, name, index) =>
            {
                var tab = new Data_Web_Dye_BagTab();
                tab.Index = index;
                tab.OwnerId = new R3.ReactiveProperty<long>(ownerId);
                tab.Name = new R3.ReactiveProperty<string>(name);
                tab.Locked = new R3.ReactiveProperty<bool>(false);
                tabs.Add(tab);
            });
        if (added > 0 | ApplyOrder(tabs, t => t?.OwnerId?.Value ?? 0, "dye")) Repush(rus, DyeType);
    }

    // ---- 公共 ----
    private static bool SafeActive(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, Il2CppSystem.Type t)
    {
        try { return rus.IsUIActive(t); }
        catch { return false; }
    }

    private static HashSet<long> CollectOwners<T>(ObservableCollections.ObservableList<T> tabs, Func<T, long> getOwner)
    {
        var set = new HashSet<long>();
        // interop 集合的 GetEnumerator 不可直接 foreach，走索引器
        for (int i = 0; i < tabs.Count; i++)
        {
            var id = getOwner(tabs[i]);
            if (id != 0) set.Add(id);
        }
        return set;
    }

    /// <summary>
    /// 注入后触发界面重推：WebUIVm 绑定是脏标记制（MarkAllMsgDirty → OnMsgChange 序列化推送 JS），
    /// ObservableList.Add 后必须走一遍 VM 的重推，JS 才会收到 bagTabs（TriggerStateSubscribe 实证无效）。
    /// ToolTablePruner 修剪 CabinetTabs 后同用此通道。
    /// </summary>
    internal static void Repush(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, Il2CppSystem.Type uiType)
    {
        try
        {
            var layer = rus.GetWebUILayer();
            GameCore.HotUpdate.ReduxUI.WebUIVm vm = null;
            if (layer != null && layer.GetWebUI(uiType, out vm) && vm != null)
            {
                vm.MarkAllMsgDirty();
                vm.OnMsgChange();
            }
        }
        catch (Exception e) { WarnOnce("repush", "UI 重推失败: " + e.Message); }
    }

    private static int AddMissing(string uiName, UiSession s, HashSet<long> have, int currentCount,
        Action<long, string, int> create)
    {
        var cabinets = Injectable(); /* 四轮①：柜子 ∪ 漏收冰箱（have 集去重，原生已有的不重复注入） */
        int added = 0, index = currentCount;
        var names = new List<string>();
        foreach (var c in cabinets)
        {
            if (have.Contains(c.OwnerId) || s.Injected.Contains(c.OwnerId)) continue;
            try
            {
                create(c.OwnerId, c.Name, index++);
                s.Injected.Add(c.OwnerId);
                added++;
                names.Add($"{c.Name}({c.OwnerId})");
            }
            catch (Exception e)
            {
                WarnOnce("add_" + uiName + "_" + c.OwnerId, $"{uiName} 页签注入失败 ownerId={c.OwnerId}: {e.Message}");
            }
        }
        if (added > 0)
            CabinetEverywherePlugin.Log.LogInfo($"[CabinetEverywhere] {uiName} 界面注入 {added} 个柜子页签：{string.Join("、", names)}");
        return added;
    }

    private static readonly HashSet<string> WarnedOnce = new();
    private static void WarnOnce(string key, string msg)
    {
        if (WarnedOnce.Add(key))
            CabinetEverywherePlugin.Log.LogWarning("[CabinetEverywhere] " + msg);
    }

    // ================= 四轮②：BagTabs 序对齐显示序（cerail_pinorder.json） =================

    private static string OrderPath => Path.Combine(Paths.BepInExRootPath, "cerail_pinorder.json");
    private static Dictionary<string, List<long>> _orders = new();
    private static DateTime _ordersMtime;
    private static bool _ordersTried;

    /// <summary>
    /// 显示序表（pageKey→ownerId 序）：BepInEx/cerail_pinorder.json。内存缓存 + mtime 失效重载
    /// （names 同款纪律）。未登记页=空表（ApplyOrder 直接过，注入序=目录扫描序）。
    /// </summary>
    internal static Dictionary<string, List<long>> LoadOrders()
    {
        try
        {
            DateTime mtime = File.Exists(OrderPath) ? File.GetLastWriteTimeUtc(OrderPath) : DateTime.MinValue;
            if (_ordersTried && mtime == _ordersMtime) return _orders;
            _ordersMtime = mtime;
            _ordersTried = true;
            var d = new Dictionary<string, List<long>>();
            if (File.Exists(OrderPath))
            {
                try
                {
                    if (RailJson.Parse(File.ReadAllText(OrderPath)) is Dictionary<string, object> root)
                        foreach (var kv in root)
                        {
                            if (kv.Value is not List<object> arr) continue;
                            var ids = new List<long>(arr.Count);
                            foreach (var e in arr)
                            {
                                if (e is long l) ids.Add(l);
                                else if (e is double db) ids.Add((long)db);
                            }
                            d[kv.Key] = ids;
                        }
                }
                catch (Exception e)
                {
                    WarnOnce("orders:corrupt", "cerail_pinorder.json 损坏，弃用重建: " + e.Message);
                }
            }
            _orders = d;
        }
        catch (Exception e)
        {
            WarnOnce("orders:load", "cerail_pinorder.json 读取失败: " + e.Message);
        }
        return _orders;
    }

    /// <summary>JS pinOrder 命令落库（RailCommands.OpPinOrder 调）：写表+原子落盘；重排由 0.5s 轮询自愈。</summary>
    internal static void SavePinOrder(string pageKey, List<long> ids)
    {
        var all = LoadOrders();
        all[pageKey] = ids;
        try
        {
            var sb = new StringBuilder(128);
            sb.Append('{');
            bool first = true;
            foreach (var kv in all)
            {
                if (kv.Value == null || kv.Value.Count == 0) continue;
                if (!first) sb.Append(',');
                first = false;
                sb.Append('"').Append(kv.Key).Append("\":[").Append(string.Join(",", kv.Value)).Append(']');
            }
            sb.Append('}');
            string path = OrderPath, tmp = path + ".tmp";
            File.WriteAllText(tmp, sb.ToString());
            File.Move(tmp, path, true);
            _ordersMtime = File.GetLastWriteTimeUtc(path);
            CabinetEverywherePlugin.Log.LogInfo($"[CabinetEverywhere] 页签序同步：{pageKey} → {ids.Count} 项已落盘（官方数组序随 0.5s 轮询对齐）");
        }
        catch (Exception e)
        {
            WarnOnce("orders:save", "cerail_pinorder.json 写入失败: " + e.Message);
        }
    }

    /// <summary>
    /// BagTabs 按 pageKey 的显示序稳定重排：背包条目恒首位；在册条目按显示序；未登记条目
    /// （新柜/原生未拖过的）按现序稳定排尾。选择排序就位（Move 优先，RemoveAt+Insert 兜底——
    /// interop 代理缺 Move 时等价）。返回 true=发生移动（调用方 Repush）。幂等：序已一致零移动。
    /// </summary>
    internal static bool ApplyOrder<T>(ObservableCollections.ObservableList<T> tabs, Func<T, long> ownerOf, string pageKey)
    {
        try
        {
            if (!LoadOrders().TryGetValue(pageKey, out var desired) || desired == null || desired.Count == 0) return false;
            if (tabs == null || tabs.Count == 0) return false;
            long bag = RailData.BagOwner();
            int n = tabs.Count;
            var rank = new int[n];
            int unk = 0;
            for (int i = 0; i < n; i++)
            {
                long o = ownerOf(tabs[i]);
                if (o != 0 && o == bag) { rank[i] = -1; continue; } /* 背包恒首位（官方 pin 条目） */
                int idx = desired.IndexOf(o);
                rank[i] = idx >= 0 ? idx : (int.MaxValue - (unk++)); /* 未登记=稳定排尾（unk 递增保现序） */
            }
            bool moved = false;
            for (int p = 0; p < n; p++)
            {
                int best = p;
                for (int q = p + 1; q < n; q++)
                    if (rank[q] < rank[best]) best = q;
                if (best == p) continue;
                int tmpR = rank[best];
                for (int q = best; q > p; q--) rank[q] = rank[q - 1];
                rank[p] = tmpR;
                MoveEntry(tabs, best, p);
                moved = true;
            }
            return moved;
        }
        catch (Exception e)
        {
            WarnOnce("order:" + pageKey, "页签序同步失败: " + e.Message);
            return false;
        }
    }

    private static void MoveEntry<T>(ObservableCollections.ObservableList<T> tabs, int from, int to)
    {
        /* interop 代理无 Move（编译期实锤）——RemoveAt+Insert 等价重排（条目对象复用，不新建） */
        var t = tabs[from];
        tabs.RemoveAt(from);
        tabs.Insert(to, t);
    }
}
