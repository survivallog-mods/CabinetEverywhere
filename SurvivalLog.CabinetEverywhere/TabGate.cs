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
/// - Browser：全显。v1.9.1 页脚筛选下拉回归（批改后=Trade/DroneHub 两页，本类收口；工作台撤钮）：
///   选中态 sel（"other"=未打标签/tagId=该标签柜，材料架补"材料"伪标签）由 SelMatch 接管
///   视图谓词（v1.8.7 T4 语义复活，按钮从页签行移到页脚排序钮旁）。
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

    /// <summary>标签上下文（材料/工具标签 id + 食物域判定 + 下拉分类标签集）：标签库极小，每轮重建（pruner TagContext 同款）。</summary>
    internal sealed class TagCtx
    {
        public int MatTagId;
        public int ToolTagId;
        private HashSet<int> _food;
        private HashSet<int> _catTags;

        /// <summary>筛选下拉的固定分类（作者 2026-11-08 定版清单）对应的官方 iconKey——「其他」
        /// =这些分类（含食物域）全不中的柜子；顺序由 JS 侧 FS_CATS 定，此处只管补集判定。</summary>
        private static readonly string[] CatIconKeys =
            { "material", "med", "daily", "fuel", "book", "fertilizer", "seed", "repair", "defense", "tool", "misc" };

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
                    var cats = new HashSet<int>();
                    foreach (var pair in dict)
                    {
                        var t = pair.Value;
                        if (t == null) continue;
                        try
                        {
                            if (t.IconKey == "material") ctx.MatTagId = t.ID;
                            if (t.IconKey == "tool") ctx.ToolTagId = t.ID;
                            if (t.Dim >= 1 && t.Dim <= 4) food.Add(t.ID);
                            if (Array.IndexOf(CatIconKeys, t.IconKey) >= 0) cats.Add(t.ID);
                        }
                        catch { }
                    }
                    ctx._food = food;
                    ctx._catTags = cats;
                }
            }
            catch { }
            return ctx;
        }

        public bool IsFood(int tagId) => _food != null && _food.Contains(tagId);
        public bool IsCat(int tagId) => _catTags != null && _catTags.Contains(tagId);
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
    /// v1.9.1：页脚筛选下拉（sel）回归——选中态（非空非 "0"）由 SelMatch 接管（v1.8.7 T4
    /// Browser 分支语义通用化：固定视图页选中即按标签集替换视图集）；未选=视图谓词原样。</summary>
    internal static Verdict Judge(long ownerId, string view, TagCtx ctx, string sel = null)
    {
        var inst = FindContainer(ownerId);
        if (inst == null) return Verdict.Keep;
        if (!string.IsNullOrEmpty(sel) && sel != "0")
            return SelMatch(inst, sel, ctx) ? Verdict.Keep : Verdict.Remove;
        return JudgeInst(inst, view, ctx);
    }

    /// <summary>筛选下拉选中匹配（v1.9.1 批改：作者 2026-11-08 定版 13 项分类清单）：
    /// "0"/空=全部；"food"=食物域（dim1-4 任一标签）；"other"=**前列分类全不中**的柜子
    ///（含未打标签与只带清单外标签如书刊/电器/剧情道具；材料架伪标签=材料→不算其他）；
    /// 数字=tagId 精确命中（材料架补"材料"伪标签）；未知值放行（宁可不剪也不错剪）。</summary>
    internal static bool SelMatch(CabinetCatalog.ContainerInst inst, string sel, TagCtx ctx)
    {
        if (string.IsNullOrEmpty(sel) || sel == "0") return true; // 全部
        var tags = inst.TagIds ?? Array.Empty<int>();
        if (sel == "food")
        {
            foreach (var tid in tags)
                if (ctx.IsFood(tid)) return true;
            return false;
        }
        if (sel == "other")
        {
            if (inst.IsMaterialRack && ctx.MatTagId != 0) return false; // 材料架伪标签→材料类→不算其他
            foreach (var tid in tags)
                if (ctx.IsFood(tid) || ctx.IsCat(tid)) return false;
            return true; // 前列分类（食物域+10 分类标签）全不中
        }
        if (int.TryParse(sel, out var tagId))
            return Array.IndexOf(tags, tagId) >= 0
                || (inst.IsMaterialRack && tagId == ctx.MatTagId); // 材料架补"材料"伪标签
        return true;
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

    // ---- 筛选下拉持久化（v1.9.1 复活 v1.8.7 T4：BepInEx/cerail_filter.json，names/pinorder 同款纪律；
    //      写者=页脚下拉 setFilter 命令，读者=本类两 Poll + ToolTablePruner（0.5s mtime 失效重载）） ----

    private static string FilterPath => System.IO.Path.Combine(BepInEx.Paths.BepInExRootPath, "cerail_filter.json");
    private static Dictionary<string, string> _filters = new();
    private static DateTime _filtersMtime;
    private static bool _filtersTried;

    /// <summary>每页下拉选中（pageKey→"0"|"other"|tagId 字符串）；mtime 失效重载。</summary>
    internal static Dictionary<string, string> LoadFilters()
    {
        try
        {
            DateTime mtime = System.IO.File.Exists(FilterPath) ? System.IO.File.GetLastWriteTimeUtc(FilterPath) : DateTime.MinValue;
            if (_filtersTried && mtime == _filtersMtime) return _filters;
            _filtersMtime = mtime;
            _filtersTried = true;
            var d = new Dictionary<string, string>();
            if (System.IO.File.Exists(FilterPath))
            {
                try
                {
                    if (RailJson.Parse(System.IO.File.ReadAllText(FilterPath)) is Dictionary<string, object> root)
                        foreach (var kv in root)
                            if (kv.Value is string s) d[kv.Key] = s;
                }
                catch (Exception e)
                {
                    WarnOnce("filters:corrupt", "cerail_filter.json 损坏，弃用重建: " + e.Message);
                }
            }
            _filters = d;
        }
        catch (Exception e)
        {
            WarnOnce("filters:load", "cerail_filter.json 读取失败: " + e.Message);
        }
        return _filters;
    }

    /// <summary>JS setFilter 命令落库（RailCommands.OpSetFilter 调）：sel 已过白名单校验；
    /// 同值幂等零写（开页自愈上报不发 IO）。</summary>
    internal static void SaveFilter(string pageKey, string sel)
    {
        var all = LoadFilters();
        var want = string.IsNullOrEmpty(sel) || sel == "0" ? null : sel; // 全部=缺省，不落库
        var cur = all.TryGetValue(pageKey, out var v) ? v : null;
        if (want == cur) return; // 幂等：值未变不写（mtime 不动=读者缓存零失效）
        if (want == null) all.Remove(pageKey);
        else all[pageKey] = want;
        try
        {
            var sb = new System.Text.StringBuilder(128);
            sb.Append('{');
            bool first = true;
            foreach (var kv in all)
            {
                if (!first) sb.Append(',');
                first = false;
                sb.Append('"').Append(kv.Key).Append("\":\"").Append(kv.Value).Append('"');
            }
            sb.Append('}');
            string path = FilterPath, tmp = path + ".tmp";
            System.IO.File.WriteAllText(tmp, sb.ToString());
            System.IO.File.Move(tmp, path, true);
            _filtersMtime = System.IO.File.GetLastWriteTimeUtc(path);
            CabinetEverywherePlugin.Log.LogInfo($"[CabinetEverywhere] 筛选选中：{pageKey} → {sel}（下轮对账收窄可见集）");
        }
        catch (Exception e)
        {
            WarnOnce("filters:save", "cerail_filter.json 写入失败: " + e.Message);
        }
    }

    /// <summary>sel 白名单校验（OpSetFilter 用）："0"/"food"/"other" 或官方标签表内 tagId。</summary>
    internal static bool SelValid(string sel, out string normalized)
    {
        normalized = null;
        if (sel == null) return false;
        if (sel == "0" || sel == "food" || sel == "other") { normalized = sel; return true; }
        if (int.TryParse(sel, out var tagId))
        {
            try
            {
                var dict = SurvivalLog.ModShared.BagTable.Cm()?._Config_FurnitureTag_Dict;
                if (dict != null && dict.ContainsKey(tagId)) { normalized = tagId.ToString(); return true; }
            }
            catch { }
        }
        return false;
    }

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
    /// v1.9.1：sel 选中态参与判定（Judge 同口径——选中由 SelMatch 接管）；Browser 未选=全显零动作快路径。
    /// 活动页签跳过；未知 owner 跳过；removedOwners 非空时收集被移 owner（TabInjector
    /// 用以解除会话防重标记——视图切回后 AddMissing 能重新补挂）。返回移出数（&gt;0 才 Repush）。
    /// </summary>
    internal static int RemoveUndesired<T>(ObservableCollections.ObservableList<T> tabs,
        Func<T, long> ownerOf, long activeOwner, string view, string sel, TagCtx ctx, HashSet<long> removedOwners = null)
    {
        if (view == "Browser" && (string.IsNullOrEmpty(sel) || sel == "0")) return 0;
        int removed = 0;
        for (int i = tabs.Count - 1; i >= 0; i--)
        {
            long o = 0;
            try { o = ownerOf(tabs[i]); } catch { }
            if (o == 0 || o == activeOwner) continue;
            if (Judge(o, view, ctx, sel) == Verdict.Remove)
            {
                try { tabs.RemoveAt(i); removed++; removedOwners?.Add(o); } catch { }
            }
        }
        return removed;
    }

    /// <summary>下拉选中是否处于收窄态（PollTrade 快路径用）。</summary>
    internal static bool SelActive(string sel)
        => !string.IsNullOrEmpty(sel) && sel != "0";

    /// <summary>抽屉页签归类=材料（作者 2026-11-08 实机裁定「工作台抽屉归类为材料，现在是
    /// 所有筛选项都能筛出它来」）：抽屉 owner 不在容器表（Judge 恒放行=旧病根）——筛选态改为
    /// 材料 分类/材料视图=显、其余藏；未选（gate 关）=照常全显。Trade（BagTabs 剪枝）与
    /// DroneHub（快照对账）同口径；DrawerTabs 补挂门同源（防「我剪它补」振荡）。</summary>
    private static bool DrawerPasses(bool gate, string view, string sel, TagCtx ctx)
    {
        if (!gate) return true;
        if (view == "Material") return true;
        if (SelActive(sel)) return int.TryParse(sel, out var t) && ctx != null && t == ctx.MatTagId;
        return false; // Food 等其余固定视图=藏
    }

    /// <summary>抽屉页签当前筛选态是否可见（DrawerTabs.EnsureTrade/EnsureDroneHub 补挂门）。</summary>
    internal static bool DrawerVisibleFor(string pageKey)
    {
        try
        {
            ConfigEntry<ScenarioView> e = pageKey switch
            {
                "trade" => CabinetEverywherePlugin.ViewTrade,
                "dronehub" => CabinetEverywherePlugin.ViewDroneHub,
                _ => null,
            };
            if (e == null) return true; // 非筛选页（粉碎机等）照常补
            string view = ViewOf(e);
            LoadFilters().TryGetValue(pageKey, out var sel);
            return DrawerPasses(view != "Browser" || SelActive(sel), view, sel, TagCtx.Build());
        }
        catch { return true; }
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
    // ---- DroneHub（bag 族 ObservableList：**会话快照双向对账**） ----
    // v1.9.1 批改二轮（作者实报④「调度机队切换筛选不生效，只有首次打开的条件生效」）：
    // 旧实现只 RemoveAt=**单向棘轮**——首次筛选剪掉的不匹配条目一去不返（官方数组开页才
    // 全量重建，稳态无回流路），再切条件无从加回（交集常空=越切越空）；剪空后更被
    // Count==0 早退钉死，后续 sel 切换整链静默（实机日志 1715-1717/1770 三连无「移出」行
    // 实证）。重写=会话快照（owner→条目对象，每轮并入官方重建/抽屉补挂的新见）双向对账：
    // desired=快照 ∩（活动恒留 + Judge 通过 + 抽屉归类门），多则剪、缺则补回（对象复用，
    // Index=位次重排）。渲染=官方 Ac_DroneHub_RefreshBag（Bug3 实证杠杆：按数据重建 state
    // 并推送页面——比 MarkAllMsgDirty 全量重推小包，治「页签不刷新要手动移动」的掉包路）。 ----
    private static readonly Dictionary<long, Data_Web_DroneHub_BagTab> DroneSeen = new();
    private static bool _droneWasActive;

    private static void PollDroneHub(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        try
        {
            if (!SafeActive(rus, DroneHubType))
            {
                if (_droneWasActive)
                {
                    _droneWasActive = false;
                    DroneSeen.Clear();
                    _droneTabsPushed = null; // 重开页指纹清零：官方重开=全量数组，首轮对账必重推（防同指纹跳推=全量滞留）
                }
                return;
            }
            _droneWasActive = true;
            var st = rus.GetStateByUI(DroneHubType)?.TryCast<State_Web_DroneHub>();
            var tabs = st?.BagTabs;
            if (tabs == null) return;
            if (tabs.Count == 0 && DroneSeen.Count == 0) return; // 官方数组未建（开页前）；快照在=剪空也是合法终态（批改：不再钉死）

            long active = 0;
            try { active = st.BagOwnerId?.Value ?? 0; } catch { }
            string view = ViewOf(CabinetEverywherePlugin.ViewDroneHub);
            LoadFilters().TryGetValue("dronehub", out var sel); /* v1.9.1 筛选下拉选中 */
            bool gate = view != "Browser" || SelActive(sel);
            var ctx = gate ? TagCtx.Build() : null;
            long drawerOwner = 0;
            try { drawerOwner = GameCore.HotUpdate.WorkbenchDrawerConfig.DrawerOwnerId; } catch { }

            // 快照并入（官方重建的新条目 / DrawerTabs 补挂的抽屉条目都收——重开页零丢失）
            for (int i = 0; i < tabs.Count; i++)
            {
                long o = 0;
                try { o = tabs[i]?.OwnerId?.Value ?? 0; } catch { }
                if (o != 0 && !DroneSeen.ContainsKey(o)) DroneSeen[o] = tabs[i];
            }

            // 期望集：活动恒留；抽屉=归类门（材料）；其余=Judge
            var want = new HashSet<long>();
            foreach (var kv in DroneSeen)
            {
                long o = kv.Key;
                bool keep;
                if (o == active) keep = true;
                else if (drawerOwner != 0 && o == drawerOwner) keep = DrawerPasses(gate, view, sel, ctx);
                else keep = !gate || Judge(o, view, ctx, sel) == Verdict.Keep;
                if (keep) want.Add(o);
            }
            /* 批改三轮②终版（作者裁定否决座位方案：「留一个错误的=硬造缺陷，没有就空页签栏
               就好，背包标题栏保留」）：命中零柜=背包页签独存，官方 renderBagTabs 对
               tabs.length<=1 的原生空态即正确终态（页签栏收起+背包标题栏显示，DroneHub.html:906），
               mod 零干预——筛选语义纯粹，无任何假条目。 */

            int removed = 0;
            for (int i = tabs.Count - 1; i >= 0; i--)
            {
                long o = 0;
                try { o = tabs[i]?.OwnerId?.Value ?? 0; } catch { }
                if (o == 0) continue;
                if (!want.Contains(o)) { try { tabs.RemoveAt(i); removed++; } catch { } }
            }
            int added = 0;
            foreach (var kv in DroneSeen) /* 快照序（≈官方原序）；pinOrder 在册则 ApplyOrder 终排 */
            {
                long o = kv.Key;
                if (!want.Contains(o)) continue;
                bool has = false;
                for (int i = 0; i < tabs.Count; i++) { try { if ((tabs[i]?.OwnerId?.Value ?? 0) == o) { has = true; break; } } catch { } }
                if (!has) { try { tabs.Add(kv.Value); added++; } catch { } }
            }
            for (int i = 0; i < tabs.Count; i++) { try { tabs[i].Index = i; } catch { } } /* Index=位次重排（补回/剪除后的终态） */

            bool reordered = TabInjector.ApplyOrder(tabs, t => t?.OwnerId?.Value ?? 0, "dronehub"); /* T3 拖拽序 */
            if (removed > 0 || added > 0 || reordered)
            {
                Log($"调度机队 视图={view} 剪 {removed} / 补 {added} / 序对齐={reordered}（快照双向对账=可见集，切换即还原）");
                /* 批改四轮③终版=页签渲染桥：实机四轮定谳——C# 对账全对（剪/补双向收敛），
                   但页签栏不随 Repush/RefreshBag/SwitchBag 任一官方杠杆重绘（消息管线不重发
                   bagTabs/拥塞延迟到用户交互才处理）。桥=把**权威数组**以小包（≤1KB，
                   ExecuteJavaScript 小包实证恒达）推到 Root 全局 __CERAIL_TABS__，rail 侧
                   500ms 消费：直写页面 State.bagTabs + 调页面自己的 renderBagTabs——同文档
                   JS 调用绕开消息管线，确定性渲染。Repush 退役（全量大消息且对页签栏无实证
                   效果）；RefreshBag 保留兜底（活动袋物品补刷）。 */
                PushDroneTabs(tabs);
                try { GameCore.HotUpdate.ReduxUI.Ac_DroneHub_RefreshBag.SendAction(); }
                catch (Exception ex) { WarnOnce("dronehub:refresh", "调度机队官方刷新派发失败: " + ex.Message); }
            }
        }
        catch (Exception e) { WarnOnce("dronehub", "调度机队视图对账异常: " + e.Message); }
    }

    // ---- 页签渲染桥（四轮③终版）：C# 权威数组 → Root __CERAIL_TABS__ → rail 直渲染 ----
    private static int _droneTabsRev;
    private static string _droneTabsPushed = "";

    private static void PushDroneTabs(ObservableCollections.ObservableList<Data_Web_DroneHub_BagTab> tabs)
    {
        try
        {
            var sb = new System.Text.StringBuilder(256);
            sb.Append("{\"rev\":").Append(_droneTabsRev + 1).Append(",\"tabs\":[");
            for (int i = 0; i < tabs.Count; i++)
            {
                var t = tabs[i];
                if (t == null) continue;
                long o = 0; string n = null; bool l = false;
                try { o = t.OwnerId?.Value ?? 0; n = t.Name?.Value; l = t.Locked?.Value ?? false; } catch { }
                if (i > 0) sb.Append(',');
                sb.Append("{\"o\":").Append(o).Append(",\"n\":\"").Append(EscJs(n)).Append("\",\"l\":").Append(l ? 1 : 0).Append('}');
            }
            sb.Append("]}");
            var payload = sb.ToString();
            if (payload == _droneTabsPushed) return; // 幂等：数组未变不重推
            _droneTabsPushed = payload;
            _droneTabsRev++;
            var web = TagFilter.GetWebView();
            if (web == null) return;
            // rev 前置（payload 首段即 rev，避免拼串错位）：rev 变化保证 rail 侧消费一次
            web.ExecuteJavaScript("window.__CERAIL_TABS__=" + payload);
        }
        catch (Exception e) { WarnOnce("dronehub:bridge", "页签渲染桥推送失败: " + e.Message); }
    }

    private static string EscJs(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var sb = new System.Text.StringBuilder(s.Length + 8);
        foreach (var ch in s)
        {
            if (ch == '\\' || ch == '"') sb.Append('\\').Append(ch);
            else if (ch == '\n') sb.Append("\\n");
            else sb.Append(ch < ' ' ? ' ' : ch);
        }
        return sb.ToString();
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
        int removed = RemoveUndesired(tabs, ownerOf, activeOwner, view, null, TagCtx.Build()); /* sel=null：cart 三页不在筛选下拉范围 */
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
    // v1.9.1 批改（作者实报「切换筛选卡住很久才生效」，实机日志定谳）：只剪 BagTabs→Repush 时，
    // 官方 Refresh/重建路会从**全量 Containers 源名单**重建 BagTabs（RA_SetContainerTabs 写入
    // state.Containers、RebuildBagTabs 消费——dump.cs 222724 段/226109 取证）→ 全量回流→再剪→
    // 再 Repush=自持振荡（日志「移出 19 条」无限重复+DrawerTabs 反复补+ping 风暴）。根修=
    // **Containers 源名单一并收窄**：官方任何重建天然产出筛选后集合，稳态零差异零 Repush；
    // 未选=会话快照全量还原（快照=每轮并入新见条目，新柜/新档位自然进）。DroneHub 无源名单
    // 字段（RA_Open 携带收集、开页即建，稳态无回流路）不受此坑。 ----
    private static readonly Dictionary<long, GameCore.HotUpdate.TradeContainerInfo> TradeSeen = new(); // 会话快照：owner→官方条目对象（重写时复用）
    private static bool _tradeWasActive;

    private static void PollTrade(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        try
        {
            if (!SafeActive(rus, TradeType))
            {
                if (_tradeWasActive) { _tradeWasActive = false; TradeSeen.Clear(); } // 关页=会话快照退役（重开重建）
                return;
            }
            _tradeWasActive = true;
            var st = rus.GetStateByUI(TradeType)?.TryCast<State_Web_TradeUI>();
            var tabs = st?.BagTabs;
            if (tabs == null || tabs.Count == 0) return;

            long active = 0;
            try { active = st.OwnerId; } catch { }
            string view = ViewOf(CabinetEverywherePlugin.ViewTrade);
            LoadFilters().TryGetValue("trade", out var sel); /* v1.9.1 筛选下拉选中 */
            bool gate = view != "Browser" || SelActive(sel); // 未选+Browser=全显零动作（v1.8.9 口径）
            var ctx = gate ? TagCtx.Build() : null;

            // ① 源名单对账：并入快照 → 期望集（gate 关=快照全量；开=Judge 通过+pin/活动/座位恒留）→ 差异重写
            int containersFixed = 0;
            var containers = st.Containers;
            if (containers != null)
            {
                for (int i = 0; i < containers.Count; i++)
                {
                    var c = containers[i];
                    long o = 0;
                    bool pin = false;
                    try { o = c.OwnerId; pin = c.Pinned; } catch { }
                    if (o != 0 && !TradeSeen.ContainsKey(o)) TradeSeen[o] = c;
                }
                bool needRewrite = false;
                var cur = new HashSet<long>();
                for (int i = 0; i < containers.Count; i++)
                {
                    long o = 0;
                    try { o = containers[i].OwnerId; } catch { }
                    if (o != 0) cur.Add(o);
                }
                foreach (var kv in TradeSeen)
                {
                    bool want = !gate || kv.Value.Pinned || kv.Key == active
                        || Judge(kv.Key, view, ctx, sel) == Verdict.Keep;
                    bool has = cur.Contains(kv.Key);
                    if (want != has) { needRewrite = true; break; }
                }
                if (needRewrite)
                {
                    // 期望≠现状：按快照序重写（条目对象复用；多出的官方新条目快照已并入=不丢）
                    containers.Clear();
                    foreach (var kv in TradeSeen)
                    {
                        bool want = !gate || kv.Value.Pinned || kv.Key == active
                            || Judge(kv.Key, view, ctx, sel) == Verdict.Keep;
                        if (want) { try { containers.Add(kv.Value); containersFixed++; } catch { } }
                    }
                }
            }

            // ② BagTabs 逐条移出（pin/player/活动恒留；抽屉=归类门（批改二轮①：材料类外全藏）；
            //    源名单已收窄=官方重建不再回流；TradeTabs.Ensure 同 Judge 口径负责切宽时补回）
            int removed = 0;
            long drawerOwner = 0;
            try { drawerOwner = GameCore.HotUpdate.WorkbenchDrawerConfig.DrawerOwnerId; } catch { }
            if (gate)
            {
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
                    bool keep = drawerOwner != 0 && o == drawerOwner
                        ? DrawerPasses(gate, view, sel, ctx)
                        : Judge(o, view, ctx, sel) == Verdict.Keep;
                    if (!keep)
                    {
                        try { tabs.RemoveAt(i); removed++; } catch { }
                    }
                }
            }
            bool reordered = ApplyOrderTrade(tabs); /* T3 拖拽序（List 非 ObservableList，独立小路） */
            if (removed > 0 || containersFixed > 0 || reordered)
            {
                Log($"无人机交易 视图={view} 移出 {removed} 条 / 源名单重写 {containersFixed} 条 / 序对齐={reordered}（源=可见集，重建不回流）");
                /* 批改二轮②③：渲染走官方 Ac_TradeUI_RefreshBag（Bug3 实证杠杆=按数据重建 state
                   并推送页面）——替代 MarkAllMsgDirty 全量重推（大包高丢弃率=「页签不刷新要手动
                   移动」+卡顿观感的实锤路，实机 ping 风暴佐证） */
                try { GameCore.HotUpdate.ReduxUI.Ac_TradeUI_RefreshBag.SendAction(); }
                catch (Exception ex) { WarnOnce("trade:refresh", "交易页官方刷新派发失败: " + ex.Message); }
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
