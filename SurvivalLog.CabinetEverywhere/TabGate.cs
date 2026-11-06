using System;
using System.Collections.Generic;
using BepInEx.Configuration;
using GameCore.HotUpdate.ReduxUI;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 场景视图状态层收口（v1.8.7 T2「页签区还原官方设计」第二批）。
///
/// 背景：v1.8.7 T1 官方页签栏 DOM 原件还原后，页签可见性不能再走 rail 自绘行收窄，
/// 也不复活 v1.7.0 tagfilter 的 DOM 隐藏+消息扣发（十七轮防闪烁工程只服务于「JS 藏」
/// 这条路）。本类把视图谓词落到 **C# 状态层对账**：官方页签数组 = 可见集 ⇒ A/D 官方步进
/// （ContainerTabHotKey→RA_SwitchTabByKey，数组邻居制）天然只落在可见页签上，零拦截、
/// 零弹回、零闪烁；拖物到页签（webui-tabdrop）同样原生。
///
/// 视图谓词（JS viewAllows / ToolTablePruner.Allows 同语义合一，补 Kind 规则）：
/// - Food：冰箱（kind 'f'）全显 + 任一标签落食物域（dim1-4）的柜子；
/// - Material：材料/工具标签柜 + 材料架显；冰箱藏；未打标签柜藏；
/// - Browser：全显（v1.8.9：T4 下拉筛选随「全部柜子」按钮整链退役）。
///
/// 覆盖页与写者纪律（单写者原则——同一数组禁止两个组件对账）：
/// - Cooking/RatCage/Brew/Dye（bag×4 注入页）：TabInjector 内联（注入集按视图过滤 +
///   RemoveUndesired 移出不匹配原生条目，随移除解除会话防重标记），本类不碰；
/// - ToolTable：ToolTablePruner 已是本机制实例（2026-10-19/20 制作卡顿治理），不动；
/// - 本类：DroneHub（State_Web_DroneHub.BagTabs）、Shredder/GreenhouseBuild/Compressor
///   （State_Web_XXX.CartTabs）、Trade（State_Web_TradeUI.BagTabs=List&lt;BagTabEntry&gt;，
///   attr 制无下标耦合）——只移出不注入（柜子进数组走官方白名单/原生收集）。
///
/// 语义纪律（照 ToolTablePruner 实证经验）：
/// - ownerId 不在容器表（背包/pin/未知功能容器）→ 永不动（宁可不剪也不错剪）；
/// - 活动页签本轮不剪（bag/trade 族=active owner 直读、cart 族=ActiveTab 解下标），
///   防官方 active 错位；玩家切走/重开界面自然收敛；
/// - cart 族（索引制 TAB_SWITCH{j}，pin 占 0 / cart0 无 pin 均为数组位次）修剪后
///   重排 Index=位次并把 ActiveTab 平移到同 owner 新位次（pruner 同款舞步）；
/// - 官方每次开页重建数组（原生收集/白名单全量）→ 0.5s 轮询幂等收敛（开页瞬间全量
///   可见一拍后被收窄=注入页既有 UX）；
/// - 移出才 Repush（幂等，无移出零动作=轮询不成常量推送源）。
/// interop 取证（gamekb 2026-10-23_26157732 dump.cs）：DroneHub BagTabs@0xF8
/// （Data_Web_DroneHub_BagTab=Index/OwnerId/Name/Locked，与烹饪族同构）+ BagOwnerId@0xE8；
/// cart 三页 CartTabs + ActiveTab + CartOwnerId；Trade BagTabs@0x100（POCO 公有字段
/// owner/name/fridge/player/cols/rows/rack/rackCfg/pin，无 Index）+ OwnerId@0x28（active）。
/// </summary>
internal static class TabGate
{
    // ================= 视图谓词（单一事实源：TabInjector bag×4 / 本类五页共用） =================

    internal enum Verdict { Keep, Remove }

    /// <summary>标签上下文（材料/工具标签 id + 食物域判定）：标签库极小，每轮重建（pruner TagContext 同款）。</summary>
    internal sealed class TagCtx
    {
        public int MatTagId;
        public int ToolTagId;
        private HashSet<int> _food;

        public static TagCtx Build()
        {
            var ctx = new TagCtx();
            try
            {
                var cm = SurvivalLog.ModShared.BagTable.Cm();
                var dict = cm?._Config_FurnitureTag_Dict;
                if (dict != null)
                {
                    var food = new HashSet<int>();
                    foreach (var pair in dict)
                    {
                        var t = pair.Value;
                        if (t == null) continue;
                        try
                        {
                            if (t.IconKey == "material") ctx.MatTagId = t.ID;
                            if (t.IconKey == "tool") ctx.ToolTagId = t.ID;
                            if (t.Dim >= 1 && t.Dim <= 4) food.Add(t.ID);
                        }
                        catch { }
                    }
                    ctx._food = food;
                }
            }
            catch { }
            return ctx;
        }

        public bool IsFood(int tagId) => _food != null && _food.Contains(tagId);
    }

    /// <summary>容器实例判定（JS viewAllows 同语义；Food=冰箱全显+食物域柜、Material=材料/工具柜+架/冰箱藏、Browser 全显）。</summary>
    internal static Verdict JudgeInst(CabinetCatalog.ContainerInst inst, string view, TagCtx ctx)
    {
        if (inst == null || view == "Browser") return Verdict.Keep;
        if (view == "Food")
        {
            if (inst.Kind == 'f') return Verdict.Keep;
            foreach (var tid in inst.TagIds)
                if (ctx.IsFood(tid)) return Verdict.Keep;
            return Verdict.Remove;
        }
        if (view == "Material")
        {
            if (inst.Kind == 'f') return Verdict.Remove;
            if (inst.IsMaterialRack) return Verdict.Keep;
            if (ctx.MatTagId != 0 && Array.IndexOf(inst.TagIds, ctx.MatTagId) >= 0) return Verdict.Keep;
            if (ctx.ToolTagId != 0 && Array.IndexOf(inst.TagIds, ctx.ToolTagId) >= 0) return Verdict.Keep;
            return Verdict.Remove;
        }
        return Verdict.Keep; // Browser / 未来视图枚举
    }

    /// <summary>ownerId 判定：不在容器表（背包/pin/未知）→ Keep（宁可不剪也不错剪——pruner 同款纪律）。
    /// v1.8.9：T4 Browser 下拉选中（sel）随「全部柜子」按钮退役——Browser 恒全显。</summary>
    internal static Verdict Judge(long ownerId, string view, TagCtx ctx)
    {
        var inst = FindContainer(ownerId);
        if (inst == null) return Verdict.Keep;
        return JudgeInst(inst, view, ctx);
    }

    private static CabinetCatalog.ContainerInst FindContainer(long ownerId)
    {
        var list = CabinetCatalog.AllContainers;
        for (int i = 0; i < list.Count; i++)
        {
            var c = list[i];
            if (c != null && c.OwnerId == ownerId) return c;
        }
        return null;
    }

    // ---- v1.8.9：Browser 下拉选中持久化（cerail_filter.json：FilterPath/LoadFilters/SaveFilter/
    //      SelValid 整块）随「全部柜子」按钮退役——下拉是唯一写者，文件残留无消费方自然失效 ----

    internal static string ViewOf(ConfigEntry<ScenarioView> e)
    {
        try
        {
            return e.Value switch
            {
                ScenarioView.Food => "Food",
                ScenarioView.Material => "Material",
                _ => "Browser",
            };
        }
        catch { return "Browser"; }
    }

    /// <summary>bag×4 注入页取视图：[Filter] Enable 关 = Browser（全显全注入=注入页既有语义）。</summary>
    internal static string ViewOfEntry(ConfigEntry<ScenarioView> e)
    {
        if (CabinetEverywherePlugin.FilterEnable == null || !CabinetEverywherePlugin.FilterEnable.Value)
            return "Browser";
        return ViewOf(e);
    }

    /// <summary>
    /// 移出视图不匹配条目（ownerId 制数组通用：bag×4 注入页与 DroneHub 共用）。
    /// v1.8.9：T4 Browser 下拉选中（sel）退役——Browser=全显零动作快路径。
    /// 活动页签跳过；未知 owner 跳过；removedOwners 非空时收集被移 owner（TabInjector
    /// 用以解除会话防重标记——视图切回后 AddMissing 能重新补挂）。返回移出数（&gt;0 才 Repush）。
    /// </summary>
    internal static int RemoveUndesired<T>(ObservableCollections.ObservableList<T> tabs,
        Func<T, long> ownerOf, long activeOwner, string view, TagCtx ctx, HashSet<long> removedOwners = null)
    {
        if (view == "Browser") return 0;
        int removed = 0;
        for (int i = tabs.Count - 1; i >= 0; i--)
        {
            long o = 0;
            try { o = ownerOf(tabs[i]); } catch { }
            if (o == 0 || o == activeOwner) continue;
            if (Judge(o, view, ctx) == Verdict.Remove)
            {
                try { tabs.RemoveAt(i); removed++; removedOwners?.Add(o); } catch { }
            }
        }
        return removed;
    }

    // ================= 轮询（Plugin 快通道 0.5s） =================

    private static readonly Il2CppSystem.Type DroneHubType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_DroneHub));
    private static readonly Il2CppSystem.Type ShredderType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_Shredder));
    private static readonly Il2CppSystem.Type CompressorType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_Compressor));
    private static readonly Il2CppSystem.Type GreenhouseType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_GreenhouseBuild));
    private static readonly Il2CppSystem.Type TradeType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_TradeUI));

    private static readonly HashSet<string> Warned = new();
    private static void WarnOnce(string key, string msg)
    {
        if (Warned.Add(key))
            CabinetEverywherePlugin.Log.LogWarning("[CabinetEverywhere.TabGate] " + msg);
    }
    private static void Log(string msg) => CabinetEverywherePlugin.Log.LogInfo("[CabinetEverywhere.TabGate] " + msg);

    // ================= FastPoll（二十批：开界面短窗每帧抢跑修剪——治「先全量闪一下再收窄」） =================
    // 十四批 TabInjector.FastPoll 同族问题：官方开页按白名单**全量**建页签并渲染在先，场景视图
    // 修剪挂 0.5s 轮询=量化延迟闪一帧（作者实机复报：粉碎机开页先显全部柜子再收窄）。修=翻转帧
    // 起 ~20 帧短窗内每帧跑同一条 Poll（幂等零动作），官方页签数组建成那一帧即修剪+Repush=首推
    // 渲染前落地；窗口过后交还 0.5s 轮询（稳态新增开销=每页一次 bool 读）。Poll 方法零改动复用。
    private sealed class FlipWin { public bool WasActive; public int Frames; }
    private static readonly Dictionary<string, FlipWin> FlipWins = new();

    private static void FastOne(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, Il2CppSystem.Type t,
        string key, Action<GameCore.HotUpdate.ReduxUI.ReduxUISystem> poll)
    {
        if (!FlipWins.TryGetValue(key, out var f)) { f = new FlipWin(); FlipWins[key] = f; }
        bool active = SafeActive(rus, t);
        if (!active) { f.WasActive = false; f.Frames = 0; return; }
        if (!f.WasActive) { f.WasActive = true; f.Frames = 20; } /* 开界面翻转帧起算短窗 */
        if (f.Frames > 0) { f.Frames--; poll(rus); }
    }

    internal static void FastPoll()
    {
        // 视图语义总门（PollAll 同源；Browser 视图页 poll 自身零动作）
        if (CabinetEverywherePlugin.FilterEnable == null || !CabinetEverywherePlugin.FilterEnable.Value)
            return;
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return;
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            if (rus == null) return;
            FastOne(rus, DroneHubType, "dronehub", PollDroneHub);
            FastOne(rus, ShredderType, "shredder", PollShredder);
            FastOne(rus, CompressorType, "compressor", PollCompressor);
            FastOne(rus, GreenhouseType, "greenhouse", PollGreenhouse);
            FastOne(rus, TradeType, "trade", PollTrade);
        }
        catch (Exception e)
        {
            WarnOnce("fastpoll", "视图瞬帧对账异常: " + e.Message);
        }
    }

    internal static void PollAll()
    {
        // 视图语义总门=[Filter] Enable（关=全显，与 tagfilter/Pruner 同源语义）；General.Enabled 由调用方守。
        if (CabinetEverywherePlugin.FilterEnable == null || !CabinetEverywherePlugin.FilterEnable.Value)
            return;
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return;
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            if (rus == null) return;

            PollDroneHub(rus);
            PollShredder(rus);
            PollCompressor(rus);
            PollGreenhouse(rus);
            PollTrade(rus);
        }
        catch (Exception e)
        {
            WarnOnce("poll", "视图对账轮询异常: " + e.Message);
        }
    }

    private static bool SafeActive(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, Il2CppSystem.Type t)
    {
        try { return rus.IsUIActive(t); }
        catch { return false; }
    }

    // ---- DroneHub（bag 族 ownerId 制：移出+排序即可，无 Index/Active 平移） ----
    private static void PollDroneHub(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        try
        {
            if (!SafeActive(rus, DroneHubType)) return;
            var st = rus.GetStateByUI(DroneHubType)?.TryCast<State_Web_DroneHub>();
            var tabs = st?.BagTabs;
            if (tabs == null || tabs.Count == 0) return;

            long active = 0;
            try { active = st.BagOwnerId?.Value ?? 0; } catch { }
            string view = ViewOf(CabinetEverywherePlugin.ViewDroneHub);
            int removed = RemoveUndesired(tabs, t => t?.OwnerId?.Value ?? 0, active, view, TagCtx.Build());
            bool reordered = TabInjector.ApplyOrder(tabs, t => t?.OwnerId?.Value ?? 0, "dronehub"); /* T3 拖拽序 */
            if (removed > 0 || reordered)
            {
                Log($"调度机队 视图={view} 移出 {removed} 条 / 序对齐={reordered}（数组=可见集，A/D 原生步进）");
                TabInjector.Repush(rus, DroneHubType);
            }
        }
        catch (Exception e) { WarnOnce("dronehub", "调度机队视图对账异常: " + e.Message); }
    }

    // ---- cart 三页（索引制：移出 + Index=位次重排 + ActiveTab 平移到同 owner 新位次） ----

    /// <summary>cart 族对账收拢（三页状态/条目类型互异、无公共 interop 基类——owner/下标存取
    /// 与 ActiveTab 读写全部经委托传入，调用点对具体类型解析重载）。T3 增序对齐
    /// （pinOrder 文件无本页键=ApplyOrder 恒 false 零开销）。</summary>
    private static void ReconcileCart<T>(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, Il2CppSystem.Type uiType,
        ObservableCollections.ObservableList<T> tabs, string pageName, string pageKey, string view,
        Func<T, long> ownerOf, Action<T, int> setIndex,
        Func<int> getActive, Action<int> setActive)
    {
        int active = 0;
        try { active = getActive(); } catch { }
        long activeOwner = 0;
        if (active >= 0 && active < tabs.Count)
        {
            try { activeOwner = ownerOf(tabs[active]); } catch { }
        }
        int removed = RemoveUndesired(tabs, ownerOf, activeOwner, view, TagCtx.Build());
        bool reordered = TabInjector.ApplyOrder(tabs, ownerOf, pageKey); /* T3 拖拽序 */
        if (removed == 0 && !reordered) return;

        for (int i = 0; i < tabs.Count; i++)
        {
            try { setIndex(tabs[i], i); } catch { }
        }
        if (activeOwner != 0)
        {
            for (int i = 0; i < tabs.Count; i++)
            {
                long o = 0;
                try { o = ownerOf(tabs[i]); } catch { }
                if (o == activeOwner)
                {
                    if (active != i) { try { setActive(i); } catch { } }
                    break;
                }
            }
        }
        Log($"{pageName} 视图={view} 移出 {removed} 条 / 序对齐={reordered}，Index/ActiveTab 已按新位次平移");
        TabInjector.Repush(rus, uiType);
    }

    // cart 条目三种类型（Data_Web_Shredder_Tab/Compressor_Tab/GreenhouseBuild_Tab）都有
    // Index/OwnerId（dump.cs 取证）——小面重载，调用点对具体类型解析：
    private static long OwnerOf(Data_Web_Shredder_Tab t) { try { return t?.OwnerId?.Value ?? 0; } catch { return 0; } }
    private static long OwnerOf(Data_Web_Compressor_Tab t) { try { return t?.OwnerId?.Value ?? 0; } catch { return 0; } }
    private static long OwnerOf(Data_Web_GreenhouseBuild_Tab t) { try { return t?.OwnerId?.Value ?? 0; } catch { return 0; } }
    private static void SetTabIndex(Data_Web_Shredder_Tab t, int i) { try { if (t != null) t.Index = i; } catch { } }
    private static void SetTabIndex(Data_Web_Compressor_Tab t, int i) { try { if (t != null) t.Index = i; } catch { } }
    private static void SetTabIndex(Data_Web_GreenhouseBuild_Tab t, int i) { try { if (t != null) t.Index = i; } catch { } }

    private static void PollShredder(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        try
        {
            if (!SafeActive(rus, ShredderType)) return;
            var st = rus.GetStateByUI(ShredderType)?.TryCast<State_Web_Shredder>();
            var tabs = st?.CartTabs;
            if (tabs == null || tabs.Count == 0) return;
            ReconcileCart(rus, ShredderType, tabs, "粉碎机", "shredder", ViewOf(CabinetEverywherePlugin.ViewShredder),
                OwnerOf, SetTabIndex,
                () => { try { return st.ActiveTab?.Value ?? 0; } catch { return 0; } },
                v => { try { st.ActiveTab.Value = v; } catch { } });
        }
        catch (Exception e) { WarnOnce("shredder", "粉碎机视图对账异常: " + e.Message); }
    }

    private static void PollCompressor(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        try
        {
            if (!SafeActive(rus, CompressorType)) return;
            var st = rus.GetStateByUI(CompressorType)?.TryCast<State_Web_Compressor>();
            var tabs = st?.CartTabs;
            if (tabs == null || tabs.Count == 0) return;
            ReconcileCart(rus, CompressorType, tabs, "口粮压制机", "compressor", ViewOf(CabinetEverywherePlugin.ViewCompressor),
                OwnerOf, SetTabIndex,
                () => { try { return st.ActiveTab?.Value ?? 0; } catch { return 0; } },
                v => { try { st.ActiveTab.Value = v; } catch { } });
        }
        catch (Exception e) { WarnOnce("compressor", "口粮压制机视图对账异常: " + e.Message); }
    }

    private static void PollGreenhouse(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        try
        {
            if (!SafeActive(rus, GreenhouseType)) return;
            var st = rus.GetStateByUI(GreenhouseType)?.TryCast<State_Web_GreenhouseBuild>();
            var tabs = st?.CartTabs;
            if (tabs == null || tabs.Count == 0) return;
            ReconcileCart(rus, GreenhouseType, tabs, "温室工程台", "greenhouse", ViewOf(CabinetEverywherePlugin.ViewGreenhouseBuild),
                OwnerOf, SetTabIndex,
                () => { try { return st.ActiveTab?.Value ?? 0; } catch { return 0; } },
                v => { try { st.ActiveTab.Value = v; } catch { } });
        }
        catch (Exception e) { WarnOnce("greenhouse", "温室工程台视图对账异常: " + e.Message); }
    }

    // ---- Trade（BagTabs=List<BagTabEntry> POCO，attr 制无下标耦合：移出+排序即可，pin/player 条目恒留） ----
    private static void PollTrade(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        try
        {
            if (!SafeActive(rus, TradeType)) return;
            var st = rus.GetStateByUI(TradeType)?.TryCast<State_Web_TradeUI>();
            var tabs = st?.BagTabs;
            if (tabs == null || tabs.Count == 0) return;

            long active = 0;
            try { active = st.OwnerId; } catch { }
            string view = ViewOf(CabinetEverywherePlugin.ViewTrade);
            int removed = 0;
            if (view != "Browser") /* v1.8.9：T4 Browser 下拉退役，Browser=全显零动作 */
            {
                var ctx = TagCtx.Build();
                for (int i = tabs.Count - 1; i >= 0; i--)
                {
                    long o = 0;
                    bool keepMarked = false;
                    try
                    {
                        var e = tabs[i];
                        if (e == null) continue;
                        o = e.owner;
                        keepMarked = e.player || e.pin; // 背包 pin 条目永不参与（双层保险：其 owner 也不在容器表）
                    }
                    catch { continue; }
                    if (keepMarked || o == 0 || o == active) continue;
                    if (Judge(o, view, ctx) == Verdict.Remove)
                    {
                        try { tabs.RemoveAt(i); removed++; } catch { }
                    }
                }
            }
            bool reordered = ApplyOrderTrade(tabs); /* T3 拖拽序（List 非 ObservableList，独立小路） */
            if (removed > 0 || reordered)
            {
                Log($"无人机交易 视图={view} 移出 {removed} 条 / 序对齐={reordered}（attr 制无下标耦合）");
                TabInjector.Repush(rus, TradeType);
            }
        }
        catch (Exception e) { WarnOnce("trade", "无人机交易视图对账异常: " + e.Message); }
    }

    /// <summary>Trade 页签序对齐（cerail_pinorder.json "trade"）：pin/player 条目稳定在前（官方
    /// 首位语义），desired 序在册条目随后，未登记按现序排尾；序变才重建（条目对象复用）。</summary>
    private static bool ApplyOrderTrade(Il2CppSystem.Collections.Generic.List<State_Web_TradeUI.BagTabEntry> tabs)
    {
        try
        {
            if (!TabInjector.LoadOrders().TryGetValue("trade", out var desired) || desired == null || desired.Count == 0)
                return false;
            int n = tabs.Count;
            var pinned = new List<State_Web_TradeUI.BagTabEntry>();
            var byOwner = new Dictionary<long, State_Web_TradeUI.BagTabEntry>();
            var unknown = new List<State_Web_TradeUI.BagTabEntry>();
            for (int i = 0; i < n; i++)
            {
                var e = tabs[i];
                if (e == null) continue;
                long o = 0; bool mark = false;
                try { o = e.owner; mark = e.player || e.pin; } catch { }
                if (mark || o == 0) { pinned.Add(e); continue; }
                if (!byOwner.ContainsKey(o)) byOwner[o] = e; else unknown.Add(e);
            }
            var ordered = new List<State_Web_TradeUI.BagTabEntry>(n);
            ordered.AddRange(pinned);
            foreach (var id in desired)
                if (byOwner.TryGetValue(id, out var e2)) { ordered.Add(e2); byOwner.Remove(id); }
            foreach (var kv in byOwner) ordered.Add(kv.Value);
            foreach (var e3 in unknown) ordered.Add(e3);
            if (ordered.Count != n) return false; /* 防御：条目数对不上不动 */

            bool same = true;
            for (int i = 0; i < n && same; i++)
            {
                bool eq;
                try { eq = ReferenceEquals(tabs[i], ordered[i]); } catch { eq = false; }
                same = eq;
            }
            if (same) return false;
            tabs.Clear();
            for (int i = 0; i < ordered.Count; i++) tabs.Add(ordered[i]);
            return true;
        }
        catch (Exception e)
        {
            WarnOnce("trade:order", "交易页签序对齐失败: " + e.Message);
            return false;
        }
    }
}
