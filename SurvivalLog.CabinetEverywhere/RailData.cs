using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Il2CppInterop.Runtime;
using SurvivalLog.ModShared;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// CERail 数据层（T6）：把游戏状态组装成 railui.page.js 消费的**数据契约 v4** JSON 并直推
/// （RailUi.Tick 0.5s 快通道，rev 门控——rev 未变不推）。
///
/// 契约（T3 冻结 + T6 裁定增补 ctx.bagCap，与 railui.page.js setData 逐字段对齐）：
///   { rev, ctx:{page,family,bagOnly,rackOwner,bagCap,lastTidyFail}, bag, ctn:[[ownerId,"名",kind,cap,tagId...]],
///     lib:[[tagId,"名",dim,order,"iconKey","color"]],
///     icfg:[[cfgId,"名","图标URL",tradeValue,stackLimit,catId,subCatId,"分类名",life,v1..v5]],
///     items:{ "bag":[[logicId,cfgId,count,timeLeftSec,x,y,w,h,flags]], "&lt;ownerId&gt;":[...] } }
///   flags: bit0=污染 bit1=过期 bit2=临期。
///
/// 取证依据（docs/superpowers/plans/2026-10-30-cerail-spike-findings.md，字段语义以它为准）：
///   §1 VD_MAP  v1=饱食 v2=心态 v3=精力 v4=恒0 v5=生命；thirst 退役（不产出）。
///   §2 ICON_RULE  icfg 图标 = Config_Item.WebIcon 原样字符串（勿拼前缀勿加工）。
///   §3 CAT_NAME_PATH  分类名列 = 主类目名常量表（23 项默认值，官方字符串 T14 校准回填）；
///                     subCatId 原样透出（其 Name_Local 取数路径已定位，本列暂不用）。
///   §4 BAG_OWNER  背包 ownerId：活动页 State_Web_*.PlayerBagOwnerId（8 页）→ 会话缓存 →
///                 State_Data_Player.PlayerId → 仍不可得则本周期整包不推（BuildJson 返 null）。
///   §7 ItemData 无 LogicId——物品唯一 id = ItemData.InstanceId；InstanceVD 实例覆盖不折算进
///      icfg（行按 cfgId 共享，取 Config 值，校准点 T14）。
///   T7 增补 ctx.lastTidyFail（一次性标志，bool）：RailCommands tidy 执行失败（官方排序/合并
///      两路异常或 ItemManager 不可得）时置位，下一包 ctx 带出即清（推出即清）；JS（T12）收到
///      toast「本界面暂不支持整理」。railui.page.js 本任务不改（T12 消费）。
///
/// 红线（suite/docs/03-教训与红线.md）：OwnerCache 混有地面掉落虚拟 owner——**绝不 foreach
/// 整个 OwnerCache 字典**，只按白名单（CabinetCatalog.AllContainers ownerIds + 背包 owner）
/// TryGetValue 逐 owner 取。State/Reducer 只读不写。
/// 线程模型：全部入口（AccessTicker.Update 5s/0.5s 通道）都在 Unity 主线程，懒缓存无需加锁。
/// </summary>
internal static class RailData
{
    // ================= 场景表（ctx.page/family/bagOnly —— 键与 railui.page.js SCENES 一致） =================

    private sealed class SceneDef
    {
        public string Page;                                        // ctx.page（= SCENES 键 = iframe id）
        public string Family;                                      // ctx.family
        public bool BagOnly;                                       // ctx.bagOnly（仅 BackpackUI true）
        public bool IsRack;                                        // MaterialRack：ctx.rackOwner 另取
        public bool ReadsPlayerBagOwner;                           // 8 页 State_Web_*.PlayerBagOwnerId 直读
        public Il2CppSystem.Type UiType;                           // ReduxUISystem.IsUIActive 参数
    }

    private static readonly List<SceneDef> Scenes = new()
    {
        new SceneDef{ Page="BackpackUI",      Family="backpack", BagOnly=true,  UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_BackpackUI)) },
        new SceneDef{ Page="MaterialRack",    Family="rack",     IsRack=true,   UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_MaterialRack)) },
        new SceneDef{ Page="Cooking",         Family="bag",      UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Cooking)) },
        new SceneDef{ Page="BrewPanel",       Family="bag",      ReadsPlayerBagOwner=true, UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Brew)) },
        new SceneDef{ Page="RatCage",         Family="bag",      ReadsPlayerBagOwner=true, UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_RatCage)) },
        new SceneDef{ Page="DyePanel",        Family="bag",      ReadsPlayerBagOwner=true, UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Dye)) },
        new SceneDef{ Page="Compressor",      Family="cart0",    ReadsPlayerBagOwner=true, UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Compressor)) },
        new SceneDef{ Page="Shredder",        Family="cart",     ReadsPlayerBagOwner=true, UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Shredder)) },
        new SceneDef{ Page="GreenhouseBuild", Family="cart",     ReadsPlayerBagOwner=true, UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_GreenhouseBuild)) },
        new SceneDef{ Page="ToolTable",       Family="tt",       ReadsPlayerBagOwner=true, UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_ToolTable)) },
        new SceneDef{ Page="Trade",           Family="trade",    UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_TradeUI)) }, /* iframe id 实测='Trade'（T1 findings §6） */
        new SceneDef{ Page="DroneHub",        Family="bag",      ReadsPlayerBagOwner=true, UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_DroneHub)) },
    };

    // ================= 公共入口 =================

    /// <summary>当前是否有 rail 场景（12 页 IsUIActive 任一命中）——RailUi 推送门控第一道。</summary>
    internal static bool AnyRailSceneActive()
    {
        var rus = ReduxUi();
        if (rus == null) return false;
        foreach (var sc in Scenes)
        {
            try { if (rus.IsUIActive(sc.UiType)) return true; } catch { }
        }
        return false;
    }

    /// <summary>当前活动 rail 场景的 ctx.page 键；无场景返回 null。</summary>
    internal static string ActivePage()
    {
        var sc = ActiveScene();
        return sc?.Page;
    }

    /// <summary>
    /// Bug3（2026-10-31 实机："取用界面一键整理不生效"）：命令执行改了物品后，**官方格子不会自己
    /// 刷新**（官方 BagMsg 由游戏侧 Reducer 推送；ItemManager 直调不触发）——命令泵批量末尾
    /// 派发当前活跃页的官方 RefreshBag 动作（Ra_RefreshBag=按数据重建 state 并推送页面），
    /// 官方格/行组件随之重渲染（官方动作重放，同 rackOpen 口径；门=该 UI 活跃）。
    /// </summary>
    internal static void RefreshActivePage()
    {
        var sc = ActiveScene();
        if (sc == null) return;
        var rus = ReduxUi();
        if (rus == null) return;
        try
        {
            if (!rus.IsUIActive(sc.UiType)) return;
            switch (sc.Page)
            {
                // BackpackUI 的 RefreshBag 需 (OwnerId, List<Data_Item>)（Redux 侧数据对象，构造不划算）
                // ——改由 JS 侧对当前 owner 重发 SWITCH_BAG（官方重绑=同效刷新，railui.page.js cmdOut 内）。
                case "MaterialRack": GameCore.HotUpdate.ReduxUI.Ac_MaterialRack_RefreshBag.SendAction(); break;
                case "Cooking": GameCore.HotUpdate.ReduxUI.Ac_Cooking_RefreshBag.SendAction(); break;
                case "BrewPanel": GameCore.HotUpdate.ReduxUI.Ac_Brew_RefreshBag.SendAction(); break;
                case "RatCage": GameCore.HotUpdate.ReduxUI.Ac_RatCage_RefreshBag.SendAction(); break;
                case "DyePanel": GameCore.HotUpdate.ReduxUI.Ac_Dye_RefreshBag.SendAction(); break;
                case "Compressor": GameCore.HotUpdate.ReduxUI.Ac_Compressor_RefreshBag.SendAction(); break;
                case "Shredder": GameCore.HotUpdate.ReduxUI.Ac_Shredder_RefreshBag.SendAction(); break;
                case "GreenhouseBuild": GameCore.HotUpdate.ReduxUI.Ac_GreenhouseBuild_RefreshBag.SendAction(); break;
                case "ToolTable": GameCore.HotUpdate.ReduxUI.Ac_ToolTable_RefreshBag.SendAction(); break;
                case "Trade": GameCore.HotUpdate.ReduxUI.Ac_TradeUI_RefreshBag.SendAction(); break;
                case "DroneHub": GameCore.HotUpdate.ReduxUI.Ac_DroneHub_RefreshBag.SendAction(); break;
            }
        }
        catch (Exception e) { /* 刷新失败无害：下一周期数据门自然补 */ }
    }

    /// <summary>
    /// Bug1（2026-10-31 实机）：开柜=BackpackUI **双背包**（A 袋|五按钮|B 柜，官方"整理物资"形态）——
    /// 该形态下 ctx.bagOnly=false（rail 柜签/全库照常）；B 键单背包才 bagOnly=true。
    /// 直读 State_Web_BackpackUI.IsDualBag（dump.cs @152422 区段，普通 bool 属性；IsDualBagRP 兜底）。
    /// </summary>
    private static bool BagOnlyDyn(SceneDef sc)
    {
        if (sc == null || !sc.BagOnly) return sc != null && sc.BagOnly;
        var rus = ReduxUi();
        if (rus == null) return true;
        try
        {
            var st = rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_BackpackUI)))
                ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_BackpackUI>();
            if (st == null) return true;
            bool dual = st.IsDualBag;
            return !dual;
        }
        catch { return true; }
    }

    /// <summary>ctx.rackOwner：MaterialRack 活动时的当前架子 owner（0=未知）。</summary>
    private static long RackOwnerOf(SceneDef sc = null)
    {
        if (sc == null) sc = ActiveScene();
        if (sc == null || !sc.IsRack) return 0;
        var rus = ReduxUi();
        if (rus == null) return 0;
        try
        {
            var st = rus.GetStateByUI(sc.UiType)?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_MaterialRack>();
            // RackOwnerId=当前架 owner（ReactiveProperty）；CurrentFurnitureId 兜底（打开即锁定的架子）
            long v = st?.RackOwnerId?.Value ?? 0;
            if (v == 0) v = st?.CurrentFurnitureId ?? 0;
            return v;
        }
        catch { return 0; }
    }

    /// <summary>
    /// 5s 慢通道（AccessTicker）：容器行元数据+背包容量（来自 CabinetCatalog.AllContainers
    /// 与 Config_Bag/Config_Furniture 纯配置查询）。物品行不在本通道——0.5s 快通道 BuildJson 现算。
    /// </summary>
    internal static void RefreshMeta()
    {
        try
        {
            var cm = BagTable.Cm();
            if (cm == null) return;
            var furn = BagTable.FurnDict(cm);
            var bags = BagTable.BagDict(cm);
            var itemState = ItemState();

            var list = new List<CtnMeta>();
            foreach (var c in CabinetCatalog.AllContainers)
            {
                var m = new CtnMeta
                {
                    OwnerId = c.OwnerId,
                    Name = NameOf(c),
                    Kind = c.Kind,
                    Cap = CapCells(furn, bags, itemState, c.ConfigId, c.OwnerId),
                    TagIds = c.TagIds ?? Array.Empty<int>(),
                };
                list.Add(m);
            }
            _ctn = list;

            long bagOwner = ResolveBagOwner(null);
            _bagCap = bagOwner > 0 ? CapCells(furn, bags, itemState, 0, bagOwner) : 0;
        }
        catch (Exception e)
        {
            WarnOnce("meta", "容器元数据刷新失败: " + e.Message);
        }
    }

    /// <summary>
    /// 廉价 rev：白名单各 owner 的物品条数+Σ数量+首末 InstanceId 混元数据签名。
    /// TimeLeft 倒计时不入签名（小时粒度缓变，不为此 0.5s 重推——校准点 T14：若需临期红点
    /// 实时翻转，在此追加 timeLeft&lt;=0 的粗粒度项）。
    /// </summary>
    internal static bool ItemsDirty()
    {
        return ComputeSig() != _lastSig || _forcePending || _tidyFailPending;
    }

    /// <summary>rev 强制 +1 并重推（T7 命令执行后调用）：仅置脏标记，下一周期 BuildJson 消费。</summary>
    internal static void ForceRepublish()
    {
        _forcePending = true;
    }

    /// <summary>tidy 失败标记（RailCommands.OpTidy 置位）：下一包 ctx.lastTidyFail=true 带出即清（T12 toast 消费）。</summary>
    internal static void ReportTidyFail()
    {
        _tidyFailPending = true;
    }

    /// <summary>
    /// 组装契约 v4 JSON。返回 (null, rev) = 背包 owner 不可得 → 整包不推（findings §4 兜底③）。
    /// 容器 0 个/物品 0 件照常可推（JS 空态已就绪，T6 裁定 4）。
    /// </summary>
    internal static (string json, int rev) BuildJson()
    {
        var world = LogicWorld();
        var im = world?._ItemManager;
        Il2CppSystem.Collections.Generic.Dictionary<long, Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData>> oc = null;
        try { oc = im?.OwnerCache; } catch { }
        if (oc == null) return (null, _rev);

        long bagOwner = ResolveBagOwner(null);
        if (bagOwner <= 0) return (null, _rev); // findings §4 兜底③：取不到背包 owner 不推

        var cm = BagTable.Cm();
        var itemDict = cm?._Config_Item_Dict;

        var sc = ActiveScene();
        long rackOwner = RackOwnerOf(sc);

        // icfg 行收集：本轮 items 出现过的 cfgId（懒缓存行字符串，IcfgRow 出）
        var icfgOrder = new List<int>();
        var icfgSeen = new HashSet<int>();
        int itemRows = 0;

        var sb = new StringBuilder(16384);
        sb.Append("{\"rev\":").Append(_rev + 1);
        sb.Append(",\"ctx\":{\"page\":\"").Append(EscapeJs(sc?.Page)).Append('"');
        sb.Append(",\"family\":\"").Append(EscapeJs(sc?.Family ?? "bag")).Append('"');
        sb.Append(",\"bagOnly\":").Append(BagOnlyDyn(sc) ? "true" : "false");
        sb.Append(",\"rackOwner\":").Append(rackOwner);
        sb.Append(",\"bagCap\":").Append(Math.Max(0, _bagCap));
        // T7 增补：tidy 失败一次性标志（推出即清；早退分支不清——等有包可推时再带出）
        sb.Append(",\"lastTidyFail\":").Append(_tidyFailPending ? "true" : "false");
        sb.Append('}');
        sb.Append(",\"bag\":").Append(bagOwner);

        // ---- ctn：背包不入列（JS 虚拟首位）；行 [ownerId,"名",kind,cap,tagId...] ----
        sb.Append(",\"ctn\":[");
        var ctn = _ctn;
        for (int i = 0; i < ctn.Count; i++)
        {
            var m = ctn[i];
            if (i > 0) sb.Append(',');
            sb.Append('[').Append(m.OwnerId).Append(",\"").Append(EscapeJs(m.Name))
              .Append("\",\"").Append(m.Kind).Append("\",").Append(Math.Max(0, m.Cap));
            for (int t = 0; t < m.TagIds.Length; t++) sb.Append(',').Append(m.TagIds[t]);
            sb.Append(']');
        }
        sb.Append(']');

        // ---- lib：标签库透传（T6 裁定 3：dim/order/icon/color 原样，C# 不分组）----
        AppendLib(sb, cm);

        // ---- icfg：只出本轮 items 出现过的 cfgId（行字符串懒缓存，IcfgRow 出）----
        // 契约字段序 icfg 在 items 前 → 先浅走白名单收集 cfgId（第一遍，只读 ItemConfigId），
        // 拼 icfg 段，再拼 items 段（第二遍）。同一次 BuildJson 内主线程无让出，
        // 两遍之间 OwnerCache 不会变化。
        var ownerIds = new List<long>();
        foreach (var m in _ctn) ownerIds.Add(m.OwnerId);

        // 第一遍：收集 cfgId（浅走：只读 ItemConfigId）
        CollectCfgIds(oc, bagOwner, ownerIds, icfgSeen, icfgOrder);

        sb.Append(",\"icfg\":[");
        for (int i = 0; i < icfgOrder.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(IcfgRow(icfgOrder[i], itemDict));
        }
        sb.Append(']');

        // ---- items：{"bag":[...],"<ownerId>":[...]}，行 [instanceId,cfgId,count,timeLeftSec,x,y,w,h,flags] ----
        sb.Append(",\"items\":{");
        sb.Append("\"bag\":");
        int n = AppendOwnerItems(sb, oc, bagOwner, itemDict);
        itemRows += n;
        for (int i = 0; i < ownerIds.Count; i++)
        {
            sb.Append(",\"").Append(ownerIds[i]).Append("\":");
            n = AppendOwnerItems(sb, oc, ownerIds[i], itemDict);
            itemRows += n;
        }
        sb.Append('}');
        sb.Append('}');

        _forcePending = false;
        _tidyFailPending = false; // 推出即清（一次性标志）
        _rev++;
        _lastSig = ComputeSig();
        _lastJsonHead = sb.Length > 200 ? sb.ToString(0, 200) : sb.ToString();
        _lastItemRows = itemRows;
        _lastCtnRows = _ctn.Count;
        _lastIcfgRows = icfgOrder.Count;
        LogVerboseAnchors(icfgOrder, itemDict);
        return (sb.ToString(), _rev);
    }

    /// <summary>
    /// icfg 懒缓存行（cfgId → 已转义 JSON 行字符串）。主线程单线程调用（AccessTicker 通道），无需加锁。
    /// 配置查不到时**不入缓存**（评审 Important 1，fix round 1）：占位行直接返回、不写
    /// _icfgCache——首包若落在配置表未就绪窗口，负缓存会让该物品整会话显示 "?" 不可恢复；
    /// 下一周期再查即可拿到真值。已缓存的正常行不受影响。
    /// </summary>
    internal static string IcfgRow(int cfgId, Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Item> itemDict = null)
    {
        if (_icfgCache.TryGetValue(cfgId, out var row)) return row;
        row = BuildIcfgRow(cfgId, itemDict);
        if (row == null) return PlaceholderIcfgRow(cfgId); // 未就绪窗口：不缓存，等下周期
        _icfgCache[cfgId] = row;
        return row;
    }

    /// <summary>icfg 占位行（cfgId 查不到 Config_Item 时）：契约 14 列形状保持，显示 "?"。</summary>
    private static string PlaceholderIcfgRow(int cfgId)
    {
        return "[" + cfgId + ",\"?\",\"\",0,1,0,0,\"\",0,0,0,0,0,0]";
    }

    /// <summary>Config_Item 字典（v13.5+ sortBy 维度取值用；配置表未就绪返回 null，调用侧容错）。</summary>
    internal static Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Item> ItemDict()
    {
        try { return BagTable.Cm()?._Config_Item_Dict; } catch { return null; }
    }

    /// <summary>容器显示名：T7 接线——RailCommands.LoadNames()（cerail_names.json 改名持久化）优先，契约名兜底。</summary>
    internal static string NameOf(CabinetCatalog.ContainerInst c)
    {
        var renamed = RailCommands.LoadNames();
        if (renamed != null && renamed.TryGetValue(c.OwnerId, out var v) && !string.IsNullOrEmpty(v)) return v;
        return c.Name;
    }

    // ================= 场景 / 背包 owner（findings §4 BAG_OWNER 三级兜底） =================

    private static SceneDef ActiveScene()
    {
        var rus = ReduxUi();
        if (rus == null) return null;
        foreach (var sc in Scenes)
        {
            try { if (rus.IsUIActive(sc.UiType)) return sc; } catch { }
        }
        return null;
    }

    /// <summary>
    /// 背包 ownerId（findings §4）：① 活动页 State_Web_*.PlayerBagOwnerId（8 页，命中即写会话缓存）
    /// → ② 会话缓存 → ③ State_Data_Player.PlayerId → 0（调用方整包不推）。
    /// </summary>
    private static long ResolveBagOwner(SceneDef sc)
    {
        var rus = ReduxUi();
        if (rus == null) return _bagOwner;
        if (sc == null) sc = ActiveScene();

        if (sc != null && sc.ReadsPlayerBagOwner)
        {
            long v = 0;
            try
            {
                var raw = rus.GetStateByUI(sc.UiType);
                v = sc.Page switch
                {
                    "BrewPanel" => raw?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_Brew>()?.PlayerBagOwnerId ?? 0,
                    "RatCage" => raw?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_RatCage>()?.PlayerBagOwnerId ?? 0,
                    "DyePanel" => raw?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_Dye>()?.PlayerBagOwnerId ?? 0,
                    "Compressor" => raw?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_Compressor>()?.PlayerBagOwnerId ?? 0,
                    "Shredder" => raw?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_Shredder>()?.PlayerBagOwnerId ?? 0,
                    "GreenhouseBuild" => raw?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_GreenhouseBuild>()?.PlayerBagOwnerId ?? 0,
                    "ToolTable" => raw?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_ToolTable>()?.PlayerBagOwnerId ?? 0,
                    "DroneHub" => raw?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_DroneHub>()?.PlayerBagOwnerId ?? 0,
                    _ => 0,
                };
            }
            catch { }
            if (v > 0)
            {
                if (_bagOwner != v && CabinetEverywherePlugin.Verbose?.Value == true)
                    CabinetEverywherePlugin.Log.LogInfo($"[CERail] 背包 owner：活动页 {sc.Page} PlayerBagOwnerId={v}（旧缓存 {_bagOwner}）");
                _bagOwner = v;
                return v;
            }
        }
        if (_bagOwner > 0) return _bagOwner;

        // 兜底③（findings §4 ②）：State_Data_Player.PlayerId == 背包 owner（假设，校准点 T14）
        try
        {
            var store = rus?.reduxStoreLayer;
            var dataTree = store?.dataTree;
            GameCore.HotUpdate.ReduxUI.BaseReduxState rawP = null;
            dataTree?.TryGetValue(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.State_Data_Player)), out rawP);
            long pid = rawP?.TryCast<GameCore.HotUpdate.ReduxUI.State_Data_Player>()?.PlayerId ?? 0;
            if (pid > 0)
            {
                if (_bagOwner != pid && CabinetEverywherePlugin.Verbose?.Value == true)
                    CabinetEverywherePlugin.Log.LogInfo($"[CERail] 背包 owner 兜底：State_Data_Player.PlayerId={pid}");
                _bagOwner = pid;
                return pid;
            }
        }
        catch { }
        return 0;
    }

    /// <summary>BAG_OWNER 校准日志（findings §4 校准点，Debug.Verbose 每会话一次）。</summary>
    private static void LogBagOwnerCalibration(long bagOwner)
    {
        if (_bagCalLogged) return;
        _bagCalLogged = true;
        try
        {
            var rus = ReduxUi();
            var itemState = ItemState();
            long player = 0;
            try
            {
                var dataTree = rus?.reduxStoreLayer?.dataTree;
                GameCore.HotUpdate.ReduxUI.BaseReduxState rawP = null;
                dataTree?.TryGetValue(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.State_Data_Player)), out rawP);
                player = rawP?.TryCast<GameCore.HotUpdate.ReduxUI.State_Data_Player>()?.PlayerId ?? 0;
            }
            catch { }
            int bagCacheKeys = 0;
            try { bagCacheKeys = itemState?.BagCache?.Count ?? 0; } catch { }
            CabinetEverywherePlugin.Log.LogInfo(
                $"[CERail][校准] 背包 owner={bagOwner}，PlayerId={player}，BagCache 键数={bagCacheKeys}" +
                $"（断言 owner==PlayerId 且 BagCache 命中——findings §4，T14 复核）");
        }
        catch { }
    }

    // ================= 物品行 / icfg =================

    /// <summary>白名单浅走一遍，收集本轮出现过的 cfgId（icfg 只出出现过的行）。</summary>
    private static void CollectCfgIds(
        Il2CppSystem.Collections.Generic.Dictionary<long, Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData>> oc,
        long bagOwner, List<long> ownerIds, HashSet<int> seen, List<int> order)
    {
        CollectOwnerCfgIds(oc, bagOwner, seen, order);
        for (int i = 0; i < ownerIds.Count; i++) CollectOwnerCfgIds(oc, ownerIds[i], seen, order);
    }

    private static void CollectOwnerCfgIds(
        Il2CppSystem.Collections.Generic.Dictionary<long, Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData>> oc,
        long owner, HashSet<int> seen, List<int> order)
    {
        if (owner <= 0) return;
        Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData> inner = null;
        try { if (!oc.TryGetValue(owner, out inner)) return; } catch { return; }
        if (inner == null) return;
        try
        {
            foreach (var pair in inner)
            {
                var it = pair.Value;
                if (it == null) continue;
                int cfg = 0;
                try { cfg = it.ItemConfigId; } catch { }
                if (cfg > 0 && seen.Add(cfg)) order.Add(cfg);
            }
        }
        catch { }
    }

    /// <summary>
    /// 单 owner 物品行拼装（白名单 owner 才进本方法——绝不 foreach OwnerCache 本身）。
    /// cfgId 全集由 CollectCfgIds 首遍收集（同一次 BuildJson 内、主线程、无让出——两遍之间
    /// OwnerCache 不会变化，故本遍不再增补 icfg 行）。
    /// </summary>
    private static int AppendOwnerItems(
        StringBuilder sb,
        Il2CppSystem.Collections.Generic.Dictionary<long, Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData>> oc,
        long owner,
        Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Item> itemDict)
    {
        Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData> inner = null;
        try { if (!oc.TryGetValue(owner, out inner) || inner == null) { sb.Append("[]"); return 0; } } catch { sb.Append("[]"); return 0; }

        int rows = 0;
        sb.Append('[');
        try
        {
            foreach (var pair in inner)
            {
                var it = pair.Value;
                if (it == null) continue;
                long id = 0; int cfg = 0, count = 0, timeLeft = 0, x = 0, y = 0, w = 1, h = 1;
                bool polluted = false;
                try { id = it.InstanceId; } catch { }
                if (id <= 0) continue; // findings §7：物品唯一 id = ItemData.InstanceId（无 LogicId 字段）
                try { cfg = it.ItemConfigId; count = it.ItemCount; timeLeft = it.TimeLeft; polluted = it.Polluted; } catch { }
                try { x = it.BagPos.x; y = it.BagPos.y; } catch { }
                try { w = it.ItemSize.x; h = it.ItemSize.y; } catch { }
                if (w <= 0) w = 1;
                if (h <= 0) h = 1;

                GameCore.HotUpdate.Config_Item ic = null;
                try { itemDict?.TryGetValue(cfg, out ic); } catch { }
                int life = 0, orig = 0;
                try { life = ic?.Life ?? 0; } catch { }
                try { orig = it.OriginalTimeLeft; } catch { }
                int flags = ItemFlags(life, timeLeft, orig, polluted);

                if (rows > 0) sb.Append(',');
                sb.Append('[').Append(id).Append(',').Append(cfg).Append(',').Append(count)
                  .Append(',').Append(timeLeft) /* timeLeftSec：TimeLeft 原样（单位校准点 T14） */
                  .Append(',').Append(x).Append(',').Append(y).Append(',').Append(w).Append(',').Append(h)
                  .Append(',').Append(flags).Append(']');
                rows++;
            }
        }
        catch { }
        sb.Append(']');
        return rows;
    }

    /// <summary>
    /// flags：bit0=污染 bit1=过期 bit2=临期。
    /// 过期=可腐坏（Life&gt;0）且 TimeLeft≤0；临期照 FoodPreservationRules.IsNearExpiry 公式形状
    /// （剩余 ≤ maxDays，或 ≤ ratio×原始保质——ratio 项用 OriginalTimeLeft 比值，单位无关）。
    /// TimeLeft 单位静态未定案：maxDays 项按秒换算（86400），校准点 T14。
    /// </summary>
    private static int ItemFlags(int life, int timeLeft, int origTimeLeft, bool polluted)
    {
        int flags = 0;
        if (polluted) flags |= 1;
        if (life <= 0) return flags;
        if (timeLeft <= 0) { flags |= 2; return flags; }

        float ratio = 0.2f, maxDays = 3f;
        try { ratio = GameCore.HotUpdate.GameKey.GlobalSetting_NearExpiry_Ratio; } catch { }
        try { maxDays = GameCore.HotUpdate.GameKey.GlobalSetting_NearExpiry_MaxDays; } catch { }
        if (ratio < 0f) ratio = 0.2f;
        if (maxDays <= 0f) maxDays = 3f;
        if (origTimeLeft > 0 && timeLeft <= ratio * origTimeLeft) flags |= 4;
        else if (timeLeft <= maxDays * 86400f) flags |= 4;
        return flags;
    }

    // ================= icfg 行 =================

    /// <summary>
    /// icfg 行：[cfgId,"名","图标URL",tradeValue,stackLimit,catId,subCatId,"分类名",life,v1..v5]。
    /// 图标=WebIcon 原样（findings §2，勿加工）；分类名=主类目名常量表（findings §3 默认表）；
    /// v1..v5=Config 值（VD_MAP：饱食/心态/精力/恒0/生命；实例 InstanceVD 覆盖不折算——
    /// 行按 cfgId 共享无法折算单叠覆盖，校准点 T14）。
    /// 返回 null = cfgId 查不到 Config_Item（含配置表未就绪窗口）——调用方（IcfgRow）不缓存，
    /// 直接出占位行，防未就绪首包把 "?" 负缓存整会话（评审 Important 1）。
    /// </summary>
    private static string BuildIcfgRow(int cfgId, Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Item> itemDict)
    {
        var cm = BagTable.Cm();
        if (itemDict == null) { itemDict = cm?._Config_Item_Dict; }
        GameCore.HotUpdate.Config_Item ic = null;
        try { itemDict?.TryGetValue(cfgId, out ic); } catch { }
        if (ic == null) return null; // 配置未就绪/查无：返回 null（IcfgRow 不缓存，直接出占位行）

        string name = null, icon = null;
        int stack = 1, cat = 0, subCat = 0, trade = 0, life = 0;
        float v1 = 0, v2 = 0, v3 = 0, v4 = 0, v5 = 0;
        try { name = string.IsNullOrEmpty(ic.ItemName_Local) ? ic.ItemName : ic.ItemName_Local; } catch { }
        try { icon = ic.WebIcon; } catch { } // ICON_RULE：原样字符串，全表非空（findings §2）
        try { stack = ic.StackLimit; } catch { }
        try { cat = ic.Category; subCat = ic.SubCategory; } catch { }
        try { trade = ic.TradeValue; } catch { } // 交易价值（price=0x80 另有字段，未用）
        try { life = ic.Life; } catch { }
        try { v1 = ic.ValueDisplay1; v2 = ic.ValueDisplay2; v3 = ic.ValueDisplay3; v4 = ic.ValueDisplay4; v5 = ic.ValueDisplay5; } catch { }

        var sb = new StringBuilder(256);
        sb.Append('[').Append(cfgId)
          .Append(",\"").Append(EscapeJs(name)).Append('"')
          .Append(",\"").Append(EscapeJs(icon)).Append('"')
          .Append(',').Append(trade)
          .Append(',').Append(Math.Max(1, stack))
          .Append(',').Append(cat)
          .Append(',').Append(subCat)
          .Append(",\"").Append(EscapeJs(CategoryName(cat))).Append('"')
          .Append(',').Append(life)
          .Append(',').Append(F(v1)).Append(',').Append(F(v2)).Append(',').Append(F(v3)).Append(',').Append(F(v4)).Append(',').Append(F(v5))
          .Append(']');
        return sb.ToString();
    }

    /// <summary>
    /// 主类目中文名默认表（findings §3：ItemCategory 枚举 23 项，官方 category 字符串静态不可追）。
    /// 词表取向：官方标签库（Config_FurnitureTag.TagName_Local，33 词）里有对应词的类目**照抄标签词**
    /// （书刊/剧情道具/装修材料/任务道具等）——§4.4 快捷标签命中=「分类名 ↔ lib 标签名」同名比对，
    /// 同词空间才可命中（食物/药品/材料等 14 词直接对齐）；无对应标签的类目按游戏内 tooltip 惯用词。
    /// 校准点 T14：游戏内抓 _BagMsg 已知物品的 category 字符串，与official不一致时**照抄回填**本表
    /// （回填方法=把官方字符串替换对应槽位即可，索引=ItemCategory 枚举值）。
    /// </summary>
    private static readonly string[] CategoryNames =
    {
        "无",         // 0  None
        "食物",       // 1  Food        ← 官方标签「食物」
        "药品",       // 2  Drug        ← 官方标签「药品」
        "书刊",       // 3  Books       ← 官方标签「书刊」
        "电器",       // 4  ElectricalAppliances ← 官方标签「电器」
        "日用品",     // 5  DailyNecessities ← 官方标签「日用品」
        "工具",       // 6  Tool        ← 官方标签「工具」
        "宠物",       // 7  Pet
        "背包",       // 8  Pack
        "材料",       // 9  Material    ← 官方标签「材料」
        "种子",       // 10 Seed        ← 官方标签「种子」
        "肥料",       // 11 Fertilizer  ← 官方标签「肥料」
        "陷阱",       // 12 Trap
        "燃料",       // 13 Fuel        ← 官方标签「燃料」
        "背包家具",   // 14 BagFurniture
        "花卉",       // 15 Flower
        "投掷物",     // 16 Throwable
        "机器人模块", // 17 RobotModule
        "剧情道具",   // 18 StoryItem   ← 官方标签「剧情道具」
        "收藏品",     // 19 Collectible ← 官方标签「收藏品」
        "唱片",       // 20 Record      ← 官方标签「唱片」
        "装修材料",   // 21 Renovation  ← 官方标签「装修材料」
        "任务道具",   // 22 TaskItem    ← 官方标签「任务道具」
    };

    internal static string CategoryName(int cat)
    {
        return cat >= 0 && cat < CategoryNames.Length ? CategoryNames[cat] : "#" + cat;
    }

    // ================= T7 RailCommands 取用（主线程，同本类其它入口） =================

    /// <summary>背包 ownerId（RailCommands 白名单/转移方向用；三级兜底同 ResolveBagOwner）。</summary>
    internal static long BagOwner() => ResolveBagOwner(null);

    /// <summary>BattleLogicWorld 实例（RailCommands 取 AgentManager/组件用；未建= null）。</summary>
    internal static GameCore.HotUpdate.Battle.Logic.BattleLogicWorld World() => LogicWorld();

    /// <summary>ItemManager 实例（官方转移 API 载体：TryQuickMoveItems/TryMoveBagAll/SplitItem/Sort...）。</summary>
    internal static GameCore.HotUpdate.Battle.Logic.ItemManager ItemMgr() => LogicWorld()?._ItemManager;

    // ================= lib（标签库，透传 TagFilter 同源数据，数组行契约） =================

    /// <summary>
    /// lib 行：[tagId,"名",dim,order,"iconKey","color"]——与 TagFilter.BuildDataJson 的 lib 同源
    /// （Config_FurnitureTag），形状按契约 v4 数组行（dim 在 order 前）。JS 按 dim 分组（T4 已接），
    /// C# 不分组只透传（T6 裁定 3）。
    /// </summary>
    private static void AppendLib(StringBuilder sb, GameCore.HotUpdate.ConfigManager cm)
    {
        sb.Append(",\"lib\":[");
        bool first = true;
        try
        {
            var dict = cm?._Config_FurnitureTag_Dict;
            if (dict != null)
                foreach (var pair in dict)
                {
                    var t = pair.Value;
                    if (t == null) continue;
                    int id = 0, order = 0, dim = 0;
                    string name = null, icon = null, color = null;
                    try
                    {
                        id = t.ID;
                        order = t.Order;
                        dim = t.Dim;
                        name = string.IsNullOrEmpty(t.TagName_Local) ? t.TagName : t.TagName_Local;
                        icon = t.IconKey;   // T1 实测：System.String（TAG_ICONS 键），原样透出
                        color = t.Color;    // T1 实测：System.String（色值），原样透出
                    }
                    catch { continue; }
                    if (!first) sb.Append(',');
                    first = false;
                    sb.Append('[').Append(id)
                      .Append(",\"").Append(EscapeJs(name)).Append('"')
                      .Append(',').Append(dim)
                      .Append(',').Append(order)
                      .Append(",\"").Append(EscapeJs(icon)).Append('"')
                      .Append(",\"").Append(EscapeJs(color)).Append("\"],");
                }
        }
        catch (Exception e)
        {
            WarnOnce("lib", "标签库读取失败: " + e.Message);
        }
        if (!first) sb.Length--; // 去尾逗号
        sb.Append(']');
    }

    // ================= 元数据 / 容量 =================

    private sealed class CtnMeta
    {
        public long OwnerId;
        public string Name;
        public char Kind;
        public int Cap;
        public int[] TagIds;
    }

    /// <summary>capCells = Config_Bag.Size=[w,h] → w×h：家具 BagId 配置路径优先，BagCache 兜底。</summary>
    private static int CapCells(
        Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Furniture> furn,
        Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Bag> bags,
        GameCore.HotUpdate.ReduxUI.State_Data_Item itemState,
        int furnConfigId, long owner)
    {
        int bagCfgId = 0;
        try { bagCfgId = furn != null && furn.TryGetValue(furnConfigId, out var f) && f != null ? f.BagId : 0; } catch { }
        if (bagCfgId <= 0)
        {
            try { itemState?.BagCache?.TryGetValue(owner, out bagCfgId); } catch { }
        }
        if (bagCfgId <= 0) return 0;
        try
        {
            if (bags != null && bags.TryGetValue(bagCfgId, out var bag) && bag != null)
            {
                var size = bag.Size; // [w,h]（BagTableRw 实证：Config_Bag.Size List<int>）
                if (size != null && size.Count >= 2) return Math.Max(0, size[0]) * Math.Max(0, size[1]);
            }
        }
        catch { }
        return 0;
    }

    // ================= 签名 / rev =================

    /// <summary>白名单物品签名 + 元数据签名混合（廉价：Σ条数/Σ数量/首末 id/容器数/owner 集合）。</summary>
    private static long ComputeSig()
    {
        long sig = 17;

        // 元数据：容器数、owner 集合、cap、bagCap、rackOwner、bagOwner
        var ctn = _ctn;
        sig = sig * 31 + ctn.Count;
        for (int i = 0; i < ctn.Count; i++)
            sig = sig * 31 + ctn[i].OwnerId * 7 + ctn[i].Cap;
        sig = sig * 31 + _bagCap;
        sig = sig * 31 + (BagOnlyDyn(ActiveScene()) ? 1 : 0); // Bug1：双背包形态翻转也要重推
        sig = sig * 31 + _bagOwner;
        sig = sig * 31 + RackOwnerOf();
        string ap = ActivePage();
        sig = sig * 31 + (ap != null ? ap.GetHashCode() : 0);

        // 物品：逐白名单 owner 的条数/Σcount/首末 id
        var world = LogicWorld();
        var oc = world?._ItemManager?.OwnerCache;
        if (oc != null)
        {
            sig = SigOwner(oc, _bagOwner, sig);
            for (int i = 0; i < ctn.Count; i++)
                sig = SigOwner(oc, ctn[i].OwnerId, sig);
        }
        return sig;
    }

    // 裁定（评审 Important 2，fix round 1 停放）：SigOwner 不含 BagPos——同容器内挪动物位
    // 不触发重推。依据：rail 渲染层不消费 x/y（按排序键平铺），当前无观察面；已记 SDD 账本。
    // 若未来契约/渲染消费位置，在此追加 x/y 哈希项即可。
    private static long SigOwner(
        Il2CppSystem.Collections.Generic.Dictionary<long, Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData>> oc,
        long owner, long sig)
    {
        if (owner <= 0) return sig;
        Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData> inner = null;
        try { if (!oc.TryGetValue(owner, out inner) || inner == null) return sig * 31; } catch { return sig * 31; }
        int rows = 0; long countSum = 0, first = 0, last = 0;
        try
        {
            foreach (var pair in inner)
            {
                var it = pair.Value;
                if (it == null) continue;
                long id = 0; int cnt = 0;
                try { id = it.InstanceId; cnt = it.ItemCount; } catch { }
                if (id <= 0) continue;
                if (rows == 0) first = id;
                last = id;
                countSum += cnt;
                rows++;
            }
        }
        catch { }
        return ((((sig * 31 + rows) * 31 + (int)(countSum & 0x7FFFFFFF)) * 31 + (int)(first & 0x7FFFFFFF)) * 31 + (int)(last & 0x7FFFFFFF));
    }

    // ================= Debug.Verbose（T14 实机校准日志） =================

    private static string _lastJsonHead = "";
    private static int _lastItemRows, _lastCtnRows, _lastIcfgRows;
    private static bool _bagCalLogged;
    private static bool _vdLogged;

    /// <summary>
    /// T14 校准锚点（Debug.Verbose 门控，每会话各一次）：
    /// ① VD_MAP 四物回归（findings §1B：面包 2502=[20,3,0,0,0]/绷带 2400=[0,0,0,0,20]/
    ///    西瓜汁完美 12417=[102,51,0,0,9]/咖啡 7=[0,5,20,0,0]）；
    /// ② BAG_OWNER 三值对照（findings §4）。
    /// </summary>
    private static void LogVerboseAnchors(List<int> icfgOrder, Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Item> itemDict)
    {
        if (CabinetEverywherePlugin.Verbose?.Value != true) return;

        LogBagOwnerCalibration(_bagOwner);

        if (_vdLogged) return;
        var cm = BagTable.Cm();
        if (itemDict == null) itemDict = cm?._Config_Item_Dict;
        var marks = new[] { (2502, "面包"), (2400, "绷带"), (12417, "西瓜汁完美"), (7, "咖啡") };
        var hits = new List<string>();
        foreach (var (id, label) in marks)
        {
            if (!icfgOrder.Contains(id)) continue;
            GameCore.HotUpdate.Config_Item ic = null;
            try { itemDict?.TryGetValue(id, out ic); } catch { }
            if (ic == null) continue;
            string v;
            try { v = $"{ic.ValueDisplay1},{ic.ValueDisplay2},{ic.ValueDisplay3},{ic.ValueDisplay4},{ic.ValueDisplay5}"; }
            catch { continue; }
            hits.Add($"{label}({id}) v=[{v}]");
        }
        if (hits.Count == 0) return;
        _vdLogged = true;
        CabinetEverywherePlugin.Log.LogInfo("[CERail][校准] VD_MAP 四物对照（期望 面包[20,3,0,0,0]/绷带[0,0,0,0,20]/西瓜汁[102,51,0,0,9]/咖啡[0,5,20,0,0]，findings §1B）："
            + string.Join("；", hits));
    }

    /// <summary>最近一包的头 200 字符（RailUi.Verbose 日志用）。</summary>
    internal static string LastJsonHead => _lastJsonHead;
    internal static int LastItemRows => _lastItemRows;
    internal static int LastCtnRows => _lastCtnRows;
    internal static int LastIcfgRows => _lastIcfgRows;

    // ================= 基础取用 / 杂项 =================

    private static GameCore.HotUpdate.ReduxUI.ReduxUISystem ReduxUi()
    {
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return null;
            return GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
        }
        catch { return null; }
    }

    private static GameCore.HotUpdate.Battle.Logic.BattleLogicWorld LogicWorld()
    {
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.Battle.Logic.BattleLogicWorld>.IsInstanceCreated)
                return null;
            return GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.Battle.Logic.BattleLogicWorld>.Instance;
        }
        catch { return null; }
    }

    private static GameCore.HotUpdate.ReduxUI.State_Data_Item ItemState()
    {
        try
        {
            var dataTree = ReduxUi()?.reduxStoreLayer?.dataTree;
            GameCore.HotUpdate.ReduxUI.BaseReduxState raw = null;
            dataTree?.TryGetValue(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.State_Data_Item)), out raw);
            return raw?.TryCast<GameCore.HotUpdate.ReduxUI.State_Data_Item>();
        }
        catch { return null; }
    }

    // ---- 状态 ----
    private static List<CtnMeta> _ctn = new();      // RefreshMeta 5s 刷新
    private static long _bagOwner;                  // BAG_OWNER 会话缓存（findings §4 ①）
    private static int _bagCap;                     // 背包容量（格），RefreshMeta 刷新
    private static long _lastSig = long.MinValue;   // 首包必推
    private static int _rev;
    private static volatile bool _forcePending;
    private static volatile bool _tidyFailPending;  // tidy 失败一次性标志（ReportTidyFail 置位，BuildJson 推出即清）
    private static readonly Dictionary<int, string> _icfgCache = new(); // cfgId → 行字符串（懒缓存）

    /// <summary>EscapeJs：JSON 字符串字面量转义（TagFilter 私有实现的共享复制，计划 Step 3 允许复制）。</summary>
    internal static string EscapeJs(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var sb = new StringBuilder(s.Length + 8);
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '\\': sb.Append("\\\\"); break;
                case '"': sb.Append("\\\""); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (ch < ' ') sb.Append(' ');
                    else sb.Append(ch);
                    break;
            }
        }
        return sb.ToString();
    }

    /// <summary>浮点 → 不变文化短数字串（102.0 → "102"，JS 侧数值语义一致）。</summary>
    private static string F(float v)
    {
        if (float.IsNaN(v) || float.IsInfinity(v)) return "0";
        return v.ToString("0.###", CultureInfo.InvariantCulture);
    }

    private static readonly HashSet<string> _warned = new();

    private static void WarnOnce(string key, string msg)
    {
        if (!_warned.Add(key)) return;
        CabinetEverywherePlugin.Log?.LogWarning("[CERail] " + msg);
    }
}
