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
///      官方 A/D 步进走官方数组序，序一致后步进=显示序邻居；重排 清空+按目标序整体重建
///      （九轮定案），背包条目恒首位、未登记条目稳定排尾，变化才 Repush（幂等零刷屏）。
/// v1.8.7 T2（官方页签栏还原第二批——场景视图状态层收口）：注入集按视图谓词过滤
///   （TabGate.JudgeInst：Food=冰箱+食物域柜/Material=材料·工具柜+架/Browser=全量，
///   [Filter] Enable=false 等效 Browser=注入页既有语义）+ RemoveUndesired 移出数组里
///   不匹配的**原生条目**（Material 视图下的原生冰箱等；活动页签本轮不剪）。数组=可见集
///   ⇒ A/D 官方步进天然只落可见页签（v1.7.0 tagfilter 的 DOM 隐藏+扣发工程全面让位）。
///   随移出解除会话防重标记（s.Injected），视图切回后 AddMissing 能重新补挂。
/// </summary>
internal static class TabInjector
{
    private sealed class UiSession
    {
        public readonly HashSet<long> Injected = new(); // 本轮会话已注入的 ownerId（防重复/防刷屏）
        public bool WasActive;
        public bool Pending; // 十三批：开界面后官方数组未建/未就绪 → FastPoll 每帧续查直到首注入
    }

    private static readonly Dictionary<string, UiSession> Sessions = new();

    // interop 侧的 UI 类型（IsUIActive/GetStateByUI 参数为 Il2CppSystem.Type）
    private static readonly Il2CppSystem.Type CookingType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_Cooking));
    private static readonly Il2CppSystem.Type RatCageType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_RatCage));
    private static readonly Il2CppSystem.Type BrewType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_Brew));
    private static readonly Il2CppSystem.Type DyeType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_Dye));

    /// <summary>JS 场景键（pinOrder cmd 的 key）→ 会话键（cerail_pinorder.json 与 Sessions 共用）。
    /// v1.8.7 T3：全十页拖拽排序接入（bag×4=本类轮询、DroneHub/cart×3=TabGate、ToolTable=Pruner、
    /// Trade=TabGate List 路）。</summary>
    internal static string PageKeyOfScene(string sceneKey) => sceneKey switch
    {
        "Cooking" => "cooking",
        "RatCage" => "ratcage",
        "BrewPanel" => "brew",
        "DyePanel" => "dye",
        "ToolTable" => "tooltable",
        "Shredder" => "shredder",
        "GreenhouseBuild" => "greenhouse",
        "Compressor" => "compressor",
        "Trade" => "trade",
        "DroneHub" => "dronehub",
        _ => null,
    };

    private static UiSession Session(string key) => Sessions.TryGetValue(key, out var s) ? s : Sessions[key] = new UiSession();

    /// <summary>
    /// 注入集（四轮① + v1.8.7 T2 视图过滤）：柜子子集 HomeInstances + 全容器里的冰箱（f），
    /// 按 TabGate.JudgeInst 过滤到当前视图（Browser=不过滤=四轮原语义）。冰箱多已在官方原生
    /// tabs（CollectFridges 收录的）——have 集去重，实际补进的是漏收的（大容量冰柜类）。
    /// v1.8.9：T4 Browser 下拉选中（sel）随「全部柜子」按钮退役，注入集只按视图过滤。
    /// </summary>
    private static IEnumerable<CabinetCatalog.ContainerInst> Injectable(string view, TabGate.TagCtx ctx)
    {
        foreach (var c in CabinetCatalog.HomeInstances)
            if (TabGate.JudgeInst(c, view, ctx) == TabGate.Verdict.Keep) yield return c;
        foreach (var c in CabinetCatalog.AllContainers)
            if (c.Kind == 'f' && TabGate.JudgeInst(c, view, ctx) == TabGate.Verdict.Keep)
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

    /// <summary>
    /// v1.8.9 十三批：开界面瞬帧注入（作者缺陷单「刚打开界面页签只显示背包+冰箱，闪一下
    /// 才加载柜子页签」）。根因：注入走 0.5s 轮询——开界面后最多白等 500ms，首推 BagMsg
    /// 只带原生页签，下一次 Repush 才是全量=可见闪烁（2026-11-01「烹饪页签迟到」同源）。
    /// 修（照 RailUi.FastPoll v1.8.9 Bug4 帧级快通道先例）：每帧只做翻转/未决判定
    /// （SafeActive=layer 查询 ×4，廉价），命中（刚开的翻转帧，或官方数组未建的 Pending
    /// 期）才跑该 UI 全量注入——在开界面那一帧就改完 BagTabs 并 Repush，抢在官方首推
    /// 序列化之前落地（即便同帧竞态，两包间隔≤1 帧=不可感知）。稳态活跃（WasActive 且
    /// 非 Pending）零额外动作，重活仍归 0.5s 轮询。
    /// </summary>
    internal static void FastPoll()
    {
        if (CabinetEverywherePlugin.Enabled != null && !CabinetEverywherePlugin.Enabled.Value)
            return;
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return;
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            if (rus == null) return;

            if (CabinetEverywherePlugin.EnableCooking.Value && JustOpened(rus, CookingType, "cooking"))
                PollCooking(rus);
            if (CabinetEverywherePlugin.EnableRatCage.Value && JustOpened(rus, RatCageType, "ratcage"))
                PollRatCage(rus);
            if (CabinetEverywherePlugin.EnableBrew.Value && JustOpened(rus, BrewType, "brew"))
                PollBrew(rus);
            if (CabinetEverywherePlugin.EnableDye.Value && JustOpened(rus, DyeType, "dye"))
                PollDye(rus);
        }
        catch (Exception e)
        {
            WarnOnce("fastpoll", "页签瞬帧注入异常: " + e.Message);
        }
    }

    /// <summary>翻转帧或 Pending 期（活跃且未入稳态）——本帧立即全量注入的判据。</summary>
    private static bool JustOpened(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, Il2CppSystem.Type t, string key)
    {
        var s = Session(key);
        if (s.WasActive && !s.Pending) return false; /* 稳态活跃：交给 0.5s 轮询（首注入/对账已完成） */
        return SafeActive(rus, t); /* 从未开过（恒 false 自然空转）/刚开翻转帧/数组未建——命中 */
    }

    // ---- 烹饪 ----
    private static void PollCooking(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var s = Session("cooking");
        bool active = SafeActive(rus, CookingType);
        if (!active) { s.WasActive = false; s.Pending = false; return; }

        if (!s.WasActive) { s.WasActive = true; s.Injected.Clear(); }
        var st = rus.GetStateByUI(CookingType)?.TryCast<State_Web_Cooking>();
        var tabs = st?.BagTabs;
        if (tabs == null || tabs.Count == 0) { s.Pending = true; return; } /* 十三批：官方数组未建——FastPoll 每帧续查，0.5s 门闩不再是首注入延迟源 */
        s.Pending = false;

        string view = TabGate.ViewOfEntry(CabinetEverywherePlugin.ViewCooking);
        var ctx = TabGate.TagCtx.Build();
        var have = CollectOwners(tabs, t => t?.OwnerId?.Value ?? 0);
        var added = AddMissing("烹饪", s, have, tabs.Count, Injectable(view, ctx),
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
        int removed = RemoveUndesired(s, tabs, t => t?.OwnerId?.Value ?? 0, ActiveOwner(st), view, ctx);
        if (added > 0 | removed > 0 | ApplyOrder(tabs, t => t?.OwnerId?.Value ?? 0, "cooking")) Repush(rus, CookingType);
    }

    // ---- 老鼠笼 ----
    private static void PollRatCage(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var s = Session("ratcage");
        bool active = SafeActive(rus, RatCageType);
        if (!active) { s.WasActive = false; s.Pending = false; return; }

        if (!s.WasActive) { s.WasActive = true; s.Injected.Clear(); }
        var st = rus.GetStateByUI(RatCageType)?.TryCast<State_Web_RatCage>();
        var tabs = st?.BagTabs;
        if (tabs == null || tabs.Count == 0) { s.Pending = true; return; } /* 十三批：官方数组未建——FastPoll 每帧续查，0.5s 门闩不再是首注入延迟源 */
        s.Pending = false;

        string view = TabGate.ViewOfEntry(CabinetEverywherePlugin.ViewRatCage);
        var ctx = TabGate.TagCtx.Build();
        var have = CollectOwners(tabs, t => t?.OwnerId?.Value ?? 0);
        var added = AddMissing("老鼠笼", s, have, tabs.Count, Injectable(view, ctx),
            (ownerId, name, index) =>
            {
                var tab = new Data_Web_RatCage_BagTab();
                tab.Index = index;
                tab.OwnerId = new R3.ReactiveProperty<long>(ownerId);
                tab.Name = new R3.ReactiveProperty<string>(name);
                tab.Locked = new R3.ReactiveProperty<bool>(false);
                tabs.Add(tab);
            });
        int removed = RemoveUndesired(s, tabs, t => t?.OwnerId?.Value ?? 0, ActiveOwner(st), view, ctx);
        if (added > 0 | removed > 0 | ApplyOrder(tabs, t => t?.OwnerId?.Value ?? 0, "ratcage")) Repush(rus, RatCageType);
    }

    // ---- 酿酒桶 ----
    private static void PollBrew(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var s = Session("brew");
        bool active = SafeActive(rus, BrewType);
        if (!active) { s.WasActive = false; s.Pending = false; return; }

        if (!s.WasActive) { s.WasActive = true; s.Injected.Clear(); }
        var st = rus.GetStateByUI(BrewType)?.TryCast<State_Web_Brew>();
        var tabs = st?.BagTabs;
        if (tabs == null || tabs.Count == 0) { s.Pending = true; return; } /* 十三批：官方数组未建——FastPoll 每帧续查，0.5s 门闩不再是首注入延迟源 */
        s.Pending = false;

        string view = TabGate.ViewOfEntry(CabinetEverywherePlugin.ViewBrewPanel);
        var ctx = TabGate.TagCtx.Build();
        var have = CollectOwners(tabs, t => t?.OwnerId?.Value ?? 0);
        var added = AddMissing("酿酒", s, have, tabs.Count, Injectable(view, ctx),
            (ownerId, name, index) =>
            {
                var tab = new Data_Web_Brew_BagTab();
                tab.Index = index;
                tab.OwnerId = new R3.ReactiveProperty<long>(ownerId);
                tab.Name = new R3.ReactiveProperty<string>(name);
                tab.Locked = new R3.ReactiveProperty<bool>(false);
                tabs.Add(tab);
            });
        int removed = RemoveUndesired(s, tabs, t => t?.OwnerId?.Value ?? 0, ActiveOwner(st), view, ctx);
        if (added > 0 | removed > 0 | ApplyOrder(tabs, t => t?.OwnerId?.Value ?? 0, "brew")) Repush(rus, BrewType);
    }

    // ---- 颜料桶 ----
    private static void PollDye(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var s = Session("dye");
        bool active = SafeActive(rus, DyeType);
        if (!active) { s.WasActive = false; s.Pending = false; return; }

        if (!s.WasActive) { s.WasActive = true; s.Injected.Clear(); }
        var st = rus.GetStateByUI(DyeType)?.TryCast<State_Web_Dye>();
        var tabs = st?.BagTabs;
        if (tabs == null || tabs.Count == 0) { s.Pending = true; return; } /* 十三批：官方数组未建——FastPoll 每帧续查，0.5s 门闩不再是首注入延迟源 */
        s.Pending = false;

        string view = TabGate.ViewOfEntry(CabinetEverywherePlugin.ViewDyePanel);
        var ctx = TabGate.TagCtx.Build();
        var have = CollectOwners(tabs, t => t?.OwnerId?.Value ?? 0);
        var added = AddMissing("颜料桶", s, have, tabs.Count, Injectable(view, ctx),
            (ownerId, name, index) =>
            {
                var tab = new Data_Web_Dye_BagTab();
                tab.Index = index;
                tab.OwnerId = new R3.ReactiveProperty<long>(ownerId);
                tab.Name = new R3.ReactiveProperty<string>(name);
                tab.Locked = new R3.ReactiveProperty<bool>(false);
                tabs.Add(tab);
            });
        int removed = RemoveUndesired(s, tabs, t => t?.OwnerId?.Value ?? 0, ActiveOwner(st), view, ctx);
        if (added > 0 | removed > 0 | ApplyOrder(tabs, t => t?.OwnerId?.Value ?? 0, "dye")) Repush(rus, DyeType);
    }

    // ---- 公共 ----
    private static bool SafeActive(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, Il2CppSystem.Type t)
    {
        try { return rus.IsUIActive(t); }
        catch { return false; }
    }

    // bag 族四状态同构（dump.cs：BagOwnerId=ReactiveProperty<long>，active 容器）——重载小面
    private static long ActiveOwner(State_Web_Cooking st) { try { return st?.BagOwnerId?.Value ?? 0; } catch { return 0; } }
    private static long ActiveOwner(State_Web_RatCage st) { try { return st?.BagOwnerId?.Value ?? 0; } catch { return 0; } }
    private static long ActiveOwner(State_Web_Brew st) { try { return st?.BagOwnerId?.Value ?? 0; } catch { return 0; } }
    private static long ActiveOwner(State_Web_Dye st) { try { return st?.BagOwnerId?.Value ?? 0; } catch { return 0; } }

    /// <summary>
    /// v1.8.7 T2：移出数组里视图不匹配的原生条目（活动页签跳过——防官方 active 错位，
    /// 玩家切走/重开自然收敛）；随移出解除会话防重标记（s.Injected），视图切回后
    /// AddMissing 能重新补挂。返回移出数（并入调用方 Repush 条件）。
    /// </summary>
    private static int RemoveUndesired<T>(UiSession s, ObservableCollections.ObservableList<T> tabs,
        Func<T, long> ownerOf, long activeOwner, string view, TabGate.TagCtx ctx)
    {
        var removedOwners = new HashSet<long>();
        int removed = TabGate.RemoveUndesired(tabs, ownerOf, activeOwner, view, ctx, removedOwners);
        if (removedOwners.Count > 0)
        {
            foreach (var o in removedOwners) s.Injected.Remove(o);
            CabinetEverywherePlugin.Log.LogInfo(
                $"[CabinetEverywhere] 视图={view} 移出 {removed} 条不匹配页签（数组=可见集，A/D 原生步进）");
        }
        return removed;
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
        IEnumerable<CabinetCatalog.ContainerInst> cabinets,
        Action<long, string, int> create)
    {
        int added = 0, index = currentCount;
        var names = new List<string>();
        foreach (var c in cabinets)
        {
            /* v1.8.10 八追：去掉 s.Injected 防重门——官方刷新（RefreshBag/界面重推）重建
               BagTabs 后注入条目消失，但会话防重集仍记着「已注入」→ 本函数全部跳过 →
               页签栏永不补挂（直到关开界面）=「顶部柜子页签栏不见了」。have=活数组实时判定
               即可防重（数组在=不加，数组不在=补，官方重建窗口 0.5s 轮询自然收敛）；
               s.Injected 仅剩 RemoveUndesired 的对账语义（视图移出解标），不再挡补挂。 */
            if (have.Contains(c.OwnerId)) continue;
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
    /// （新柜/原生未拖过的）按现序稳定排尾。返回 true=发生重排（调用方 Repush）。幂等。
    /// 2026-11-02 九轮（作者实锤老鼠笼滚动条 2Hz 闪烁）：旧实现=RemoveAt+Insert 逐位挪——
    /// interop Insert 行为可疑致排序**不收敛**（每 0.5s 轮询都判乱序→重排→Repush→整页
    /// 重渲→滚动条闪烁；活体观测页签数组在两序间 2Hz 摆动实锤）。改为**清空+按目标序整体
    /// 重建**（条目对象复用；Add=注入器验证过的通道）——一次到位必收敛；每次重排打日志行
    /// （若再出现循环，LogOutput 每秒两行一眼可见）。
    /// </summary>
    internal static bool ApplyOrder<T>(ObservableCollections.ObservableList<T> tabs, Func<T, long> ownerOf, string pageKey)
    {
        try
        {
            if (!LoadOrders().TryGetValue(pageKey, out var desired) || desired == null || desired.Count == 0) return false;
            if (tabs == null || tabs.Count == 0) return false;
            long bag = RailData.BagOwner();
            int n = tabs.Count;

            /* 目标序：背包条目（若有）恒首 → desired 序在册条目 → 未登记/重复条目按现序稳定排尾 */
            var ordered = new List<T>(n);
            T bagEntry = default;
            var byOwner = new Dictionary<long, T>();
            var unknown = new List<T>();
            for (int i = 0; i < n; i++)
            {
                var e = tabs[i];
                long o = ownerOf(e);
                if (o != 0 && o == bag && bagEntry == null) { bagEntry = e; continue; }
                if (o != 0 && !byOwner.ContainsKey(o)) byOwner[o] = e; else unknown.Add(e);
            }
            if (bagEntry != null) ordered.Add(bagEntry);
            foreach (var id in desired)
                if (byOwner.TryGetValue(id, out var e2)) { ordered.Add(e2); byOwner.Remove(id); }
            foreach (var kv in byOwner) ordered.Add(kv.Value); /* desired 未含的在册条目（新柜/新冰箱） */
            foreach (var e3 in unknown) ordered.Add(e3);
            if (ordered.Count != n) return false; /* 防御：条目数对不上不动（宁可不排也不错排） */

            /* 与现序比对（幂等：一致零动作） */
            bool same = true;
            for (int i = 0; i < n && same; i++) same = ReferenceEquals(tabs[i], ordered[i]);
            if (same) return false;

            /* 清空+按目标序重建（Add=验证通道；条目对象复用） */
            tabs.Clear();
            for (int i = 0; i < ordered.Count; i++) tabs.Add(ordered[i]);
            CabinetEverywherePlugin.Log.LogInfo($"[CabinetEverywhere] 页签序重排 {pageKey}：{n} 条（拖拽序同步，一次收敛）");
            return true;
        }
        catch (Exception e)
        {
            WarnOnce("order:" + pageKey, "页签序同步失败: " + e.Message);
            return false;
        }
    }
}
