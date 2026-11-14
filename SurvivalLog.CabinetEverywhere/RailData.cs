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
/// 契约（T3 冻结 + T6 裁定增补 ctx.bagCap，2026-11-01 缺陷单#1/#2 增补 ctx.view/tradePrefs/
/// 与物品行数值段对齐；v1.8.5 起 lastSortAck 随数据层 sortBy 退役）。
///   { rev, ctx:{page,family,bagOnly,rackOwner,bagCap,uniformWidth,brewP1,brewP2,view,tradePrefs,lastTidyFail},
///     bag, ctn:[[ownerId,"名",kind,cap,tagId...]],
///     lib:[[tagId,"名",dim,order,"iconKey","color"]],
///     icfg:[[cfgId,"名","图标URL",tradeValue,stackLimit,catId,subCatId,"分类名",life,v1..v5,uses]]
///         （页专属尾列：bagtabs 族两页 FuelGenerator/Heater +[burnable,burnValue]；BrewPanel +[canBrew]——brew spec §5.1），
///     items:{ "bag":[[id,cfg,count,timeLeft,x,y,w,h,flags,s1,s2,s3,s4,trade,days]], "&lt;ownerId&gt;":[...] } }
///   flags: bit0=污染 bit1=过期 bit2=临期；timeLeft 单位=游戏小时（RailSortMath 定案）。
///   s1..s4=饱腹/心态/精力/生命（RailSortMath=ProjectCook 实例+天赋口径；0/缺=null）、
///   trade=整叠计算后交易价值（null=无价）、days=保质排序键（null=不腐；-100001 腐败/
///   -100000 过期/(-100000,0) 过期计天/>0 剩余天数——角标文本 JS 由键推导）、
///   v1.9.0 起行尾追加 attrSig（string=原始 InstanceVD 随机词条签名，无实例掷值=""——
///   glist 合并键属性依据）、再尾 uses（v2 作者终案：原始剩余使用次数，仅 MaxUseTimes>0
///   物品携带，null=无该维度——合并键=物品名+uses+attrSig；右键取物 FEFO=行内 timeLeft 升序）。
///   view=当前页场景视图（food/material/browser，TagFilter.ViewStr 同源）；tradePrefs=[[分类名,加成]…]；
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
        /* 燃油发电机 bagtabs 页（2026-11-07，spec fuelgen-cabinet-tabs）：**不替换宿主/无侧栏壳**——
           JS 侧 SCENES.FuelGenerator.bagtabs 在官方左背包面板内装配页签/柜格/底行（右面板零改动）。
           ReadsPlayerBagOwner=true：本页取 State_Web_FuelGenerator.BagOwnerId（ReactiveProperty<long>，
           读 .Value——与别家裸 long 不同，ResolveBagOwner 该 case 单列）。 */
        new SceneDef{ Page="FuelGenerator",   Family="fg",      ReadsPlayerBagOwner=true, UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_FuelGenerator)) },
        /* 暖炉 bagtabs 页（2026-11-07，暖炉移植批=bagtabs 族第二页）：游戏侧与燃油发电机**逐件镜像**——
           State_Web_Heater.BagOwnerId（同为 ReactiveProperty<long>）+ Ac_Heater_RefreshBag/
           FuelAdd/FuelReturn/ItemClick 同载荷动作族 + Heater.html 左面板 DOM 契约同名
           （#backpackGrid/#fuelQueueZone/.fuel-slot/.panel-title/.info-bar/.hint-shift）。
           mod 侧零新机制：JS SCENES.Heater.bagtabs 同一ensureBagtabs 装配（BAGTABS 页描述符指路），
           ResolveBagOwner 该 case 同款 .Value 直读+十一验收 CtnGuard。 */
        new SceneDef{ Page="Heater",          Family="ht",      ReadsPlayerBagOwner=true, UiType=Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Heater)) },
    };

    // ================= 公共入口 =================

    /// <summary>当前是否有 rail 场景（12 页 IsUIActive 任一命中）——RailUi 推送门控第一道。
    /// 帧级缓存版（*Cached）：同一帧内多处调用只查官方状态一次（12 次 interop）——
    /// FastPoll/Tick/开页沿/PollCtxFast 共 4+ 个调用点，不缓存=每帧 36~48 次跨界读。</summary>
    private static int _sceneFrame = -1;
    private static SceneDef _sceneCached;
    private static SceneDef ActiveSceneCached()
    {
        int f = UnityEngine.Time.frameCount;
        if (f != _sceneFrame)
        {
            _sceneFrame = f;
            _sceneCached = ActiveScene();
        }
        return _sceneCached;
    }
    internal static bool AnyRailSceneActiveCached() => ActiveSceneCached() != null;
    internal static string ActivePageCached() => ActiveSceneCached()?.Page;

    /// <summary>当前是否有 rail 场景（12 页 IsUIActive 任一命中）——RailUi 推送门控第一道。</summary>
    internal static bool AnyRailSceneActive()
    {
        var rus = ReduxUi();
        if (rus == null) return false;
        foreach (var sc in Scenes)
        {
            try { if (rus.IsUIActive(sc.UiType)) return true; } catch (Exception e) { PerfDiag.Swallow("rus.IsUIActive:" + e.GetType().Name); } // [PERFDIAG]
        }
        return false;
    }

    /// <summary>当前活动 rail 场景的 ctx.page 键；无场景返回 null。</summary>
    internal static string ActivePage()
    {
        var sc = ActiveSceneCached();
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
        var sc = ActiveSceneCached();
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
                // 燃油发电机：feed 两跳后官方背包格/燃料槽重渲染（spec §5.3 收尾）
                case "FuelGenerator": GameCore.HotUpdate.ReduxUI.Ac_FuelGenerator_RefreshBag.SendAction(); break;
                // 暖炉（bagtabs 族第二页）：feed 两跳后官方背包格/料槽重渲染（Ac_Heater_RefreshBag 同名族）
                case "Heater": GameCore.HotUpdate.ReduxUI.Ac_Heater_RefreshBag.SendAction(); break;
            }
        }
        catch (Exception e)
        {
            /* 失败无害：下一周期数据门自然补——Debug 级留痕（默认不显示，排查时开 Console 调试级可见） */
            CabinetEverywherePlugin.Log?.LogDebug("[CERail] 官方页刷新动作失败（无害）: " + e.GetType().Name + " " + e.Message);
        }
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

    /// <summary>
    /// v13.9 §0a-4（2026-10-31）：BackpackUI **A 侧是否玩家背包**——B键单背包/开柜双背包=true；
    /// 取用（单柜面板，InfoA 绑柜子 ownerId）=false。JS 侧原生页 mod 按钮对（排序/入库）
    /// 以此为装配判据（负重条判据不成立：柜子也有负重，v13.4 柜侧隐负重条 CSS 即证）。
    /// 直读 State_Web_BackpackUI.OwnerId_A 比对背包 owner（dump @152427 区段 public long）。
    /// 任一端未知（0）/状态不可达 = 保守 true（按钮照装，与 BagOnlyDyn 兜底风格一致）。
    /// </summary>
    private static bool BpBagDyn()
    {
        var rus = ReduxUi();
        if (rus == null) return true;
        try
        {
            var st = rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_BackpackUI)))
                ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_BackpackUI>();
            if (st == null) return true;
            long a = st.OwnerId_A;
            if (a == 0) return true;
            if (a == ResolveBagOwner(null)) return true;
            // 2026-11-01 作者实机缺陷#3：页面 bagA.ownerId=**背包实体 id**（与 PlayerId 不同
            // id 空间，实测 12884906630 vs 12884906565）→ 旧「相等」判恒假=solo 背包被误判
            // 取用单柜（排序/入库按钮不装配；整理物资双背包因 nbPanel 双形态无条件分支而幸存）。
            // 新判据：A 侧是白名单容器（真取用柜）→false；否则（背包实体/玩家）→true
            var all = CabinetCatalog.AllContainers;
            for (int i = 0; i < all.Count; i++)
                if (all[i].OwnerId == a) return false;
            return true;
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

    // ================= 按页推送范围（spec 2026-11-14-rail-data-slim-design §B） =================

    /// <summary>当前容器 owner（页面 Redux 状态直读，0=未知）：BackpackUI 双背包=OwnerId_B /
    /// 取用单柜=OwnerId_A（白名单校验，BpBagDyn 同款——B 键单背包 A 侧=背包 → 0）；
    /// 机器页=各 State_Web_*.BagOwnerId / cart 三页=CartOwnerId（RP .Value，TradeUI 裸 long）；
    /// MaterialRack=RackOwnerOf。官方切页签该字段随之翻——PollCtxFast 帧级跟随触发重推。
    /// 注意与 ResolveBagOwner 的 CtnGuard 相反：这里柜 id 是**合法值**（当前柜本就是柜）。</summary>
    private static long CurrentOwnerOf(SceneDef sc)
    {
        if (sc == null) return 0;
        var rus = ReduxUi();
        if (rus == null) return 0;
        try
        {
            switch (sc.Page)
            {
                case "BackpackUI":
                {
                    var st = rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_BackpackUI)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_BackpackUI>();
                    if (st == null) return 0;
                    long o;
                    try { o = st.IsDualBag ? st.OwnerId_B : st.OwnerId_A; } catch { return 0; }
                    if (o == 0 || o == _bagOwner) return 0;
                    var all = CabinetCatalog.AllContainers;
                    for (int i = 0; i < all.Count; i++) if (all[i].OwnerId == o) return o; // 白名单校验
                    return 0;
                }
                case "Cooking":
                    return rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Cooking)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_Cooking>()?.BagOwnerId?.Value ?? 0;
                case "RatCage":
                    return rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_RatCage)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_RatCage>()?.BagOwnerId?.Value ?? 0;
                case "BrewPanel":
                    return rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Brew)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_Brew>()?.BagOwnerId?.Value ?? 0;
                case "DyePanel":
                    return rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Dye)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_Dye>()?.BagOwnerId?.Value ?? 0;
                case "Compressor":
                    return rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Compressor)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_Compressor>()?.CartOwnerId?.Value ?? 0;
                case "Shredder":
                    return rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Shredder)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_Shredder>()?.CartOwnerId?.Value ?? 0;
                case "GreenhouseBuild":
                    return rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_GreenhouseBuild)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_GreenhouseBuild>()?.CartOwnerId?.Value ?? 0;
                case "ToolTable":
                    return rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_ToolTable)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_ToolTable>()?.BagOwnerId?.Value ?? 0;
                case "Trade":
                    return rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_TradeUI)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_TradeUI>()?.BagOwnerId ?? 0;
                case "DroneHub":
                    return rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_DroneHub)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_DroneHub>()?.BagOwnerId?.Value ?? 0;
                case "FuelGenerator":
                    return rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_FuelGenerator)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_FuelGenerator>()?.BagOwnerId?.Value ?? 0;
                case "Heater":
                    return rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Heater)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_Heater>()?.BagOwnerId?.Value ?? 0;
                case "MaterialRack":
                    return RackOwnerOf(sc);
            }
        }
        catch { return 0; }
        return 0;
    }

    /// <summary>_ctn 的 ownerId 数组（RecomputeCaps 随名单重建——Compose 零分配入参）。</summary>
    private static long[] _ctnOwnerIds = Array.Empty<long>();

    /// <summary>items 段范围（BuildJson 现算）：背包 + 当前柜（CurrentOwnerOf 自校验：B 键背包
    /// A 侧=背包→0、非白名单→0，故不必按 bagOnly 另行清零——取用单柜页 bagOnly=true 仍需 A 柜行）。
    /// 全量页=温室（作者令不动）+ 吊栏窗（类别用户运行时点选无法预筛）。glist 五页在列表批扩全量。</summary>
    private static List<long> ScopeOwnersOf(SceneDef sc)
    {
        var fill = new List<long>(16);
        ScopeOwnersOfInto(sc, fill);
        return fill;
    }

    private static void ScopeOwnersOfInto(SceneDef sc, List<long> fill)
    {
        long bag = _bagOwner > 0 ? _bagOwner : ResolveBagOwner(null);
        bool fullHouse = sc != null && (sc.Page == "GreenhouseBuild"
            || GlistOnOf(sc.Page)                       // 五列表页：全屋按页筛后的子集（spec §C）
            || (sc.Page == "BackpackUI" && BasketGlist.BasketOn)); // 吊栏窗：全屋按需求类别筛（spec §D）
        long cur = CurrentOwnerOf(sc);
        RailScope.Compose(bag, cur, _ctnOwnerIds, false, fullHouse, fill);
    }

    /// <summary>行筛选上下文（spec §C/§D）：五列表页按页谓词、吊栏按需求类别；Drop=true 滤掉不输出，
    /// Drop=false（背包/当前柜）仅计数（行全量输出——格子态网格/排序角标/右键取物回查都要）；
    /// HiddenKinds=「已隐藏 N 种」计数（跨 owner 共享，含 Drop=false 将被 JS 列表态藏掉的行）。</summary>
    internal sealed class RowFilterCtx
    {
        public string Page;                 // 五页场景键，或 "basket"
        public HashSet<int> BasketCats;     // basket：允许类别集（null=非 basket）
        public bool Drop;
        public HashSet<string> HiddenKinds;
    }

    /// <summary>五列表页 glistOn（与 BuildJson ctx.glistOn 同源同值：RatCage/BrewPanel 零配置键恒开）。</summary>
    private static bool GlistOnOf(string page)
    {
        switch (page)
        {
            case "RatCage":
            case "BrewPanel": return true;
            case "DyePanel": return CabinetEverywherePlugin.EnableGlistDye?.Value != false && CabinetEverywherePlugin.EnableDye?.Value != false;
            case "Heater": return CabinetEverywherePlugin.EnableGlistHeater?.Value != false && CabinetEverywherePlugin.EnableHeater?.Value != false;
            case "FuelGenerator": return CabinetEverywherePlugin.EnableGlistFuelGen?.Value != false && CabinetEverywherePlugin.EnableFuelGen?.Value != false;
            default: return false;
        }
    }

    private static RowFilterCtx BuildRowFilter(SceneDef sc, HashSet<string> hiddenKinds)
    {
        if (sc?.Page == null) return null;
        if (sc.Page == "BackpackUI" && BasketGlist.BasketOn)
            return new RowFilterCtx
            {
                Page = "basket",
                BasketCats = new HashSet<int>(RailGlistRule.BasketAllowedCats(BasketGlist.Mode, BasketGlist.WishCats, BasketGlist.CrisisCat)),
                HiddenKinds = hiddenKinds,
            };
        if (GlistOnOf(sc.Page))
            return new RowFilterCtx { Page = sc.Page, HiddenKinds = hiddenKinds };
        return null;
    }

    /// <summary>
    /// 5s 慢通道（AccessTicker）：容器行元数据+背包容量（来自 CabinetCatalog.AllContainers
    /// 与 Config_Bag/Config_Furniture 纯配置查询）。物品行不在本通道——0.5s 快通道 BuildJson 现算。
    /// 高度修改批（2026-11-07）顺序翻转：先 SizeEngine（改尺寸）后 RecomputeCaps（算容量）——
    /// 改写当轮 cap 即为新尺寸，写后链（RailUi.RefreshAfterSizeWrite）同款口径。
    /// </summary>
    internal static void RefreshMeta()
    {
        try
        {
            RailUi.SizeEnginePoll();
            RecomputeCaps();
        }
        catch (Exception e)
        {
            WarnOnce("meta", "容器元数据刷新失败: " + e.Message);
        }
    }

    /// <summary>容器行 cap 重算（RefreshMeta 主体抽出；尺寸改写后立即生效链即时调用——
    /// cap 变化经 _lastMetaSig 比对强制重推，mod rail 帧级跟上，spec §2 硬验收）。</summary>
    internal static void RecomputeCaps()
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
        var ownerIds = new long[list.Count];
        for (int i = 0; i < list.Count; i++) ownerIds[i] = list[i].OwnerId;
        _ctnOwnerIds = ownerIds;

        long bagOwner = ResolveBagOwner(null);
        _bagCap = bagOwner > 0 ? CapCells(furn, bags, itemState, 0, bagOwner) : 0;

        // 元数据变化（柜增删/容量/标签/改名）→ 强制重推（原 ComputeSig 元数据项的事件化替身）
        long ms = 17;
        for (int i = 0; i < list.Count; i++)
        {
            var m = list[i];
            ms = ms * 31 + m.OwnerId * 7 + m.Cap + (m.Name != null ? m.Name.GetHashCode() : 0);
            if (m.TagIds != null) for (int t = 0; t < m.TagIds.Length; t++) ms = ms * 31 + m.TagIds[t];
        }
        ms = ms * 31 + _bagCap;
        if (ms != _lastMetaSig)
        {
            _lastMetaSig = ms;
            _forcePending = true;
        }
    }

    // ================= 事件驱动脏标记（spec 2026-11-14-rail-data-slim-design §A） =================
    // 物品变化由 ItemChangeSignal 挂官方通知（3002/3005/3031/3027/21015）标记；原 0.5s 全屋签名
    // 扫描（ComputeSig）与每帧结构快检（StructureChangedFast）已退役。BuildJson 组装完成处清。
    internal static readonly RailDirtySet Dirty = new();

    /// <summary>物品事件置脏（ItemChangeSignal prefix 调；owner≤0 由集合自身忽略）。</summary>
    internal static void MarkOwnerDirty(long owner) => Dirty.MarkOwner(owner);

    /// <summary>全局置脏（3027 全刷/21015 地面/3005 反查不到 owner）。</summary>
    internal static void MarkGlobalDirty() => Dirty.MarkGlobal();

    /// <summary>
    /// 推送门②：物品事件脏 / 页面态变化(_ctxDirty) / 强制重推 / 一次性标志 / 篮子沿 任一为真。
    /// （篮子沿：愿望/危机/篮内变化而物品不变时 ctx.basket 也要重推；推出即清）
    /// </summary>
    internal static bool ItemsDirty()
    {
        return Dirty.ScopedDirty(_scopeCache) || _ctxDirty || _forcePending || _tidyFailPending || BasketGlist.Dirty;
    }

    // ---- 页面态快检（原 ComputeSig 元数据项的事件化替身；RailUi.FastPoll 每帧调）----
    // ctx 里不随物品事件变化的页面态——活动页/双背包形态/A 侧归属/架子 owner/背包 owner——
    // 任一翻转置 _ctxDirty（BuildJson 尾清）。每帧数次 interop 读（场景活跃时才有意义）。
    private static long _lastCtxSig = long.MinValue;
    private static bool _ctxDirty;
    private static readonly List<long> _scopeCache = new(16); // 场景活跃时随 PollCtxFast 刷新

    internal static void PollCtxFast()
    {
        var sc = ActiveSceneCached();
        if (sc == null) return;
        long cur = CurrentOwnerOf(sc);
        long sig = 17;
        sig = sig * 31 + (sc.Page != null ? sc.Page.GetHashCode() : 0);
        sig = sig * 31 + (BagOnlyDyn(sc) ? 1 : 0);
        sig = sig * 31 + (BpBagDyn() ? 1 : 0);
        sig = sig * 31 + RackOwnerOf(sc);
        sig = sig * 31 + _bagOwner;
        sig = sig * 31 + cur;                    // 当前容器跟随：官方切页签→翻→重推
        sig = sig * 31 + _ctnOwnerIds.Length;    // 柜名单增删→范围变→重推
        if (sig != _lastCtxSig)
        {
            _lastCtxSig = sig;
            _ctxDirty = true;
            ScopeOwnersOfInto(sc, _scopeCache);  // 输入变才重建缓存（零新建；稳态零动作）
        }
    }

    // 元数据签名（RecomputeCaps 尾比对）：柜增删/容量/标签/改名变化 → 强制重推
    // （原 ComputeSig 元数据项的事件化替身；慢通道每轮幂等比对，稳态零推）。
    private static long _lastMetaSig;

    /* ================= 世界重绑（2026-11-01 第十二轮：作者「退主菜单重读档后排序彻底失效」
       日志实锤：rev3 之后全程静默——重读档后页沿不翻/签名不变 → 泵门②永拦 → JS 契约冻结在
       旧世界物品 id → 新模型 id 全 miss=排序键全 null+角标全空。换档=LogicWorld 引用变，
       泵每帧比对，变了就按新开机复位）。 ================= */

    private static object _lastWorldRef;

    /// <summary>泵每帧调用：世界引用变化且非空=true（调用方随即 OnWorldRebind+清 _lastPage）。</summary>
    internal static bool CheckWorldRebind()
    {
        var w = LogicWorld();
        bool changed = !ReferenceEquals(w, _lastWorldRef);
        _lastWorldRef = w;
        return changed && w != null;
    }

    /// <summary>按新开机复位（换档重读：PlayerId 变/物品实例全换/缓存键变）。</summary>
    internal static void OnWorldRebind()
    {
        _bagOwner = 0;
        _bagCalLogged = false;
        RailGround.Reset(); // 地面：家图判定缓存随档失效（mapId→IsHomeMap 语义换档变）
        _forcePending = true;
        _tidyFailPending = false;
        RailCommands.AbortStoreTask(); // 入库任务基于旧 OwnerCache 快照，换档后无意义：静默丢弃（方案 A 终案）
        ItemChangeSignal.ResetMoveCache(); // 挪位忽略缓存按旧世界 id 记账，换档全部作废
        try { CabinetEverywherePlugin.Log.LogInfo("[CERail] 世界重绑：管线按新开机复位（owner/签名/force 全清+立即重推——治「重读档后排序彻底失效」）"); } catch { }
    }

    /// <summary>rev 强制 +1 并重推（T7 命令执行后调用）：仅置脏标记，下一周期 BuildJson 消费。</summary>
    internal static void ForceRepublish()
    {
        _forcePending = true;
    }

    /// <summary>storeAll 跨帧任务完成哨兵（方案 A 终案，RailCommands.FinishStoreTask 置位）：
    /// BuildJson ctx.storeAllDone 带出即清（lastTidyFail 同款一次性语义）——JS settleXfer
    /// 收到哨兵包才解除 hold 结算差量 toast+恢复入库按钮。</summary>
    private static bool _storeDonePending;
    internal static void MarkStoreDone() => _storeDonePending = true;

    /// <summary>storeAll 结果 JSON（FinishStoreTask 置）：ctx.storeAllRes 带出即清（数据链瘦身 §E
    /// ——逐柜件数+留背包件数，JS 差量快照结算退役）。空/异常=null。</summary>
    private static string _storeResPending;
    internal static void SetStoreAllRes(string json) => _storeResPending = json;

    /// <summary>tidy 失败标记（RailCommands.OpTidy 置位）：下一包 ctx.lastTidyFail=true 带出即清（T12 toast 消费）。</summary>
    internal static void ReportTidyFail()
    {
        _tidyFailPending = true;
    }

    /// <summary>feed 失败码（notfuel/full/bagfull/noitem——RailCommands.OpFeed 权威校验拒绝时置位；
    /// BuildJson ctx.feedFail 带出即清，一次性，lastTidyFail 同款）。JS 映射文案弹 mod 警告条（spec §5.2）。</summary>
    internal static void MarkFeedFail(string code)
    {
        _feedFailPending = string.IsNullOrEmpty(code) ? null : code;
    }

    /// <summary>燃油发电机 Redux 状态（OpFeed 容量校验用；GetStateByUI 同 ResolveBagOwner 路径）。不可得=null。</summary>
    internal static GameCore.HotUpdate.ReduxUI.State_Web_FuelGenerator FuelGenState()
    {
        try
        {
            var rus = ReduxUi();
            return rus?.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_FuelGenerator)))
                ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_FuelGenerator>();
        }
        catch { return null; }
    }

    /// <summary>暖炉 Redux 状态（暖炉移植批=bagtabs 族第二页；State_Web_Heater 与 FuelGenerator
    /// 字段级同构：BagOwnerId/FuelSlotCount/FuelItems——OpFeed 容量校验+OpSwitchBag 直写目标）。
    /// 不可得=null。</summary>
    internal static GameCore.HotUpdate.ReduxUI.State_Web_Heater HeaterState()
    {
        try
        {
            var rus = ReduxUi();
            return rus?.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Heater)))
                ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_Heater>();
        }
        catch { return null; }
    }

    /// <summary>
    /// 逐页场景视图（缺陷单#2：机器页页签按 v1.7.0 语义收窄——TagFilter.ViewStr 同源同值：
    /// cfg [Scenario] View_* → "food"/"material"/"browser"；未登记页=browser）。
    /// </summary>
    private static string ScenarioViewOf(string page)
    {
        var v = SurvivalLog.CabinetEverywhere.ScenarioView.Browser;
        try
        {
            switch (page)
            {
                case "Cooking": v = CabinetEverywherePlugin.ViewCooking?.Value ?? v; break;
                case "RatCage": v = CabinetEverywherePlugin.ViewRatCage?.Value ?? v; break;
                case "BrewPanel": v = CabinetEverywherePlugin.ViewBrewPanel?.Value ?? v; break;
                case "DyePanel": v = CabinetEverywherePlugin.ViewDyePanel?.Value ?? v; break;
                case "Compressor": v = CabinetEverywherePlugin.ViewCompressor?.Value ?? v; break;
                case "ToolTable": v = CabinetEverywherePlugin.ViewToolTable?.Value ?? v; break;
                case "Shredder": v = CabinetEverywherePlugin.ViewShredder?.Value ?? v; break;
                case "GreenhouseBuild": v = CabinetEverywherePlugin.ViewGreenhouseBuild?.Value ?? v; break;
                case "Trade": v = CabinetEverywherePlugin.ViewTrade?.Value ?? v; break;
                case "DroneHub": v = CabinetEverywherePlugin.ViewDroneHub?.Value ?? v; break;
                case "FuelGenerator": v = CabinetEverywherePlugin.ViewFuelGenerator?.Value ?? v; break;
                case "Heater": v = CabinetEverywherePlugin.ViewHeater?.Value ?? v; break; /* 暖炉（bagtabs 族）：View_Heater 绑定默认 Fuel=与发电机同视角 */
            }
        }
        catch { }
        return v switch
        {
            SurvivalLog.CabinetEverywhere.ScenarioView.Food => "food",
            SurvivalLog.CabinetEverywhere.ScenarioView.Material => "material",
            SurvivalLog.CabinetEverywhere.ScenarioView.Fuel => "fuel", // 燃料标签(1013)柜——JS viewAllows fuel 分支消费
            _ => "browser",
        };
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

        var sc = ActiveSceneCached();
        long rackOwner = RackOwnerOf(sc);

        // 地面（家内掉落）快照（地面/门口袋扩展批）：一次取、ctn/items/icfg 三段共用
        var gdrops = RailGround.HomeDrops();

        // icfg 行收集：本轮 items 出现过的 cfgId（懒缓存行字符串，IcfgRow 出）
        var icfgOrder = new List<int>();
        var icfgSeen = new HashSet<int>();
        int itemRows = 0;

        var sb = new StringBuilder(16384);
        sb.Append("{\"rev\":").Append(_rev + 1);
        sb.Append(",\"ctx\":{\"page\":\"").Append(EscapeJs(sc?.Page)).Append('"');
        sb.Append(",\"family\":\"").Append(EscapeJs(sc?.Family ?? "bag")).Append('"');
        sb.Append(",\"bagOnly\":").Append(BagOnlyDyn(sc) ? "true" : "false");
        // v13.9 §0a-4：BackpackUI A 侧是否玩家背包（B键单背包/双背包=true；取用=单柜面板=false）——
        // 原生页 mod 按钮对（排序/入库）装配判据；其余页恒 true 无消费方
        sb.Append(",\"bpBag\":").Append(BpBagDyn() ? "true" : "false");
        sb.Append(",\"rackOwner\":").Append(rackOwner);
        sb.Append(",\"bagCap\":").Append(Math.Max(0, _bagCap));
        // 壳宽地板/抽屉克隆包的目标宽直出（高度修改批起=常量 RailUi.UniformWidth 恒 12，
        // [Rail] UniformBagWidth 键退役；JS 契约形状不变，0=off 信号不复存在）
        sb.Append(",\"uniformWidth\":").Append(RailUi.UniformWidth);
        // 酿酒桶品质阈值直推（brew spec §5.1，uniformWidth 先例同点位）：GameKey 运行时读，
        // try/catch 缺省 0/0.5（官方 BrewPanel.html 界面兜底同值）；所有页都带、仅 BrewPanel 消费
        float brewP1 = 0f, brewP2 = 0.5f;
        try { brewP1 = GameCore.HotUpdate.GameKey.GlobalSetting_Brew_TierMoodDensityP1; } catch { }
        try { brewP2 = GameCore.HotUpdate.GameKey.GlobalSetting_Brew_TierMoodDensityP2; } catch { }
        sb.Append(",\"brewP1\":").Append(F(brewP1)).Append(",\"brewP2\":").Append(F(brewP2));
        // 2026-11-01 缺陷单#2：机器页页签逐页语义（v1.7.0 场景视图口径）——ctx.view 供 JS
        // railCtns 收窄（food=冰箱全显+柜子按食物域标签；material=材料/工具柜+架子；browser=全显）
        sb.Append(",\"view\":\"").Append(ScenarioViewOf(sc?.Page)).Append('"');
        // 2026-11-01 缺陷单#1：Trade 买家喜好条 chips（State_Web_TradeUI 当前需求，RailSortMath 读）
        RailSortMath.AppendTradePrefs(sb);
        // sortBy 回执（一次性标志：[key,ok,moved,skip]；JS settle toast——治「排序不生效静默」）
        // T7 增补：tidy 失败一次性标志（推出即清；早退分支不清——等有包可推时再带出）
        sb.Append(",\"lastTidyFail\":").Append(_tidyFailPending ? "true" : "false");
        // storeAll 任务完成哨兵（方案 A 终案）：JS settleXfer 靠它解除 hold（带出即清，与 lastTidyFail 同点位）
        sb.Append(",\"storeAllDone\":").Append(_storeDonePending ? "true" : "false");
        _storeDonePending = false;
        sb.Append(",\"storeAllRes\":").Append(string.IsNullOrEmpty(_storeResPending) ? "null" : _storeResPending);
        _storeResPending = null;
        // feed 失败码一次性标志（fuelgen bagtabs 页消费；空串=无失败。推出即清与 lastTidyFail 同点位）
        sb.Append(",\"feedFail\":\"").Append(EscapeJs(_feedFailPending ?? "")).Append('"');
        // fgOn（终审 Important1）：cfg EnableFuelGen 的契约消费链——false=JS fgFuelCtns 空表=拆除态=原版
        //（spec §5.4 对称拆装；仅本页带出=tradePrefs 页条件字段先例）
        if (sc?.Page == "FuelGenerator")
            sb.Append(",\"fgOn\":").Append(CabinetEverywherePlugin.EnableFuelGen?.Value != false ? "true" : "false");
        // heaterOn（暖炉移植批）：EnableHeater 的契约消费链同 fgOn——false=JS fgFuelCtns 空表=拆除态=原版
        //（仅本页带出=页条件字段先例同 fgOn/tradePrefs）
        if (sc?.Page == "Heater")
            sb.Append(",\"heaterOn\":").Append(CabinetEverywherePlugin.EnableHeater?.Value != false ? "true" : "false");
        // glistOn（v1.9.0 global-storage-list）：竖版全局物品栏页条件门——染料桶/暖炉两页先行；
        // 染料桶受 EnableDye 联动（柜子页签关则 glist 一并还原官方），暖炉同理挂 EnableHeater；
        // false=JS 拆装对称还原（glistGate 消费，heaterOn 先例同构）
        if (sc?.Page == "DyePanel")
            sb.Append(",\"glistOn\":").Append(CabinetEverywherePlugin.EnableGlistDye?.Value != false && CabinetEverywherePlugin.EnableDye?.Value != false ? "true" : "false");
        if (sc?.Page == "Heater")
            sb.Append(",\"glistOn\":").Append(CabinetEverywherePlugin.EnableGlistHeater?.Value != false && CabinetEverywherePlugin.EnableHeater?.Value != false ? "true" : "false");
        // 批改#8（2026-11-08 作者令：暖炉界面复用到燃油发电机——两页同构可燃物→料槽）；同构挂 EnableFuelGen
        if (sc?.Page == "FuelGenerator")
            sb.Append(",\"glistOn\":").Append(CabinetEverywherePlugin.EnableGlistFuelGen?.Value != false && CabinetEverywherePlugin.EnableFuelGen?.Value != false ? "true" : "false");
        // 篮子救援 glist（basket spec §5.1）：BackpackUI 篮子模式第四场景——glistOn 由篮子态门控
        //（BasketOn 已含 cfg+窗活+IsBasket_B，此处不重复 AND）；ctx.basket 段随行（缺省=键不在场，
        // JS 判键存在性=篮子数据就绪与否的唯一口径，dyePal 先例）。愿望/危机变化而物品不变时
        // 由 BasketGlist.Dirty 并入 ItemsDirty 触发重推（推出即清）
        if (sc?.Page == "BackpackUI")
        {
            sb.Append(",\"glistOn\":").Append(BasketGlist.BasketOn ? "true" : "false");
            if (BasketGlist.BasketJson != null)
                sb.Append(",\"basket\":").Append(BasketGlist.BasketJson);
        }
        // rat-brew glist（rat-brew spec 2026-11-09 裁定#7）：第五/六场景——老鼠笼/酿酒桶。
        // **零新增配置键**（作者令「安装了 mod 就默认启用」）：glistOn 恒 true；既有 EnableRatCage/
        // EnableBrew 键不再作用于这两页（键保留兼容防配置文件报缺——JS 侧装配/退役门=glistGate 同源）。
        if (sc?.Page == "RatCage" || sc?.Page == "BrewPanel")
            sb.Append(",\"glistOn\":true");
        // dyePal（染料桶色素排序批）：颜色板页条件字段——DyePaletteRules.PanelDyeItems（官方面板
        // 序，全颜色含未解锁）+ PanelDyeHex（平行 hex）+ 染料物品本地化名（ItemDict）。spike v3
        // 实证：ColorCount=8（20363-20370），名称走染料物品自身（ColorShowKeys=StateXX 非显示名）。
        // 板未就绪（配置空）→ 整字段不下发（JS 空板=菜单仅「默认」，dye-pigment-sort spec §5.1.2）。
        if (sc?.Page == "DyePanel")
        {
            var pal = DyePalJson();
            if (!string.IsNullOrEmpty(pal)) sb.Append(",\"dyePal\":").Append(pal);
        }
        // rat-brew glist：brewIco 页条件字段（仅 BrewPanel 页）——游戏三档酒精瓶实物图=物品级
        // WebIcon（15505 劣质青绿液/15504 普通橙黄液/15506 烈性红液，Config_Item dump 实证=
        // 酿酒产物三档物品本体，档位语义游戏自画）。角标随档换瓶（spec §4 定稿：图标+档色双通道）。
        // 静态缓存（配置表运行期不变，_icfgFuelCache 先例）；任一读不到=整字段缺席（JS 角标退
        // 纯色无图不崩——dyePal「板未就绪不下发」同口径）。
        if (sc?.Page == "BrewPanel")
        {
            var bico = BrewIcoJson();
            if (!string.IsNullOrEmpty(bico)) sb.Append(",\"brewIco\":").Append(bico);
        }
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

        // 地面（家内掉落）虚拟容器（地面/门口袋扩展批）：有物才现——0.5s 动态判定（不入
        // _ctn 5s 元数据通道=掉落/拾取即时跟页）；kind 'g'/cap 0（地面无格语义，件数看行）
        if (gdrops.Count > 0)
        {
            sb.Append(",[").Append(RailGround.OwnerId).Append(",\"").Append(EscapeJs(RailGround.CtnName))
              .Append("\",\"g\",0]");
        }
        sb.Append(']');

        // ---- lib：标签库透传（T6 裁定 3：dim/order/icon/color 原样，C# 不分组）----
        AppendLib(sb, cm);

        // ---- icfg：只出本轮 items 出现过的 cfgId（行字符串懒缓存，IcfgRow 出）----
        // 契约字段序 icfg 在 items 前 → 先浅走白名单收集 cfgId（第一遍，只读 ItemConfigId），
        // 拼 icfg 段，再拼 items 段（第二遍）。同一次 BuildJson 内主线程无让出，
        // 两遍之间 OwnerCache 不会变化。
        var ownerIds = ScopeOwnersOf(sc); // 按页范围（spec §B）——ctn 元数据段仍全量（入库路由/页签名/白名单校验）
        var hiddenKinds = new HashSet<string>();
        var flt = BuildRowFilter(sc, hiddenKinds);
        long curOwner = CurrentOwnerOf(sc);

        // 第一遍：收集 cfgId（浅走：只读 ItemConfigId）
        CollectCfgIds(oc, bagOwner, ownerIds, icfgSeen, icfgOrder);
        RailGround.CollectCfgIds(gdrops, icfgSeen, icfgOrder); // 地面段同遍（icfg 懒缓存共用）

        sb.Append(",\"icfg\":[");
        bool fuelCols = sc?.Page == "FuelGenerator" || sc?.Page == "Heater"; // 尾列仅 bagtabs 族两页（其他页推送形状不变——spec 约束；暖炉移植批补：角标/右键预检同源消费 ICFG.burn，漏此=暖炉页角标全灭+预检误拒）
        bool brewCols = sc?.Page == "BrewPanel";     // 酿酒桶页专属尾列 canBrew（brew spec §5.1，同约束）
        bool dyeCols = sc?.Page == "DyePanel";       // 染料桶页专属尾列 pig 串（dye-pigment-sort spec §5.1，同约束；JS normIcfg 按类型判形与 canBrew 数字同宽互斥）
        // rat-brew v2.2.5：老鼠笼页专属尾列 prey（Config_Item.Prey_Rarity>0=活体猎物——全表 23 件
        // 核验：鼠/蛇/鸟/兔等活体全>0、死体与料理全 0，物品级标志照 canBrew 同纪律；双 tab 筛选用）
        bool ratCols = sc?.Page == "RatCage";
        for (int i = 0; i < icfgOrder.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(IcfgRow(icfgOrder[i], itemDict, fuelCols, brewCols, dyeCols, ratCols));
        }
        sb.Append(']');

        // ---- items：{"bag":[...],"<ownerId>":[...]}，行 [id,cfg,count,timeLeft,x,y,w,h,flags,s1,s2,s3,s4,trade,days] ----
        // （缺陷单#1：s1..s4=饱腹/心态/精力/生命 数值（RailSortMath 实例+天赋口径，0/缺=null）、
        //   trade=整叠计算后交易价值（null=无价）、days=保质排序键（null=不腐；-100001 腐败/
        //   -100000 过期/(-100000,0) 过期计天/>0 剩余天数——角标文本 JS 由键推导，省字符串段）
        float nowHours = RailSortMath.NowHours();
        bool tradeScene = sc?.Page == "Trade";
        sb.Append(",\"items\":{");
        sb.Append("\"bag\":");
        if (flt != null) flt.Drop = false; // 背包行全量（右键取物回查/格子态网格）
        int n = AppendOwnerItems(sb, oc, bagOwner, itemDict, nowHours, tradeScene, flt);
        itemRows += n;
        for (int i = 0; i < ownerIds.Count; i++)
        {
            sb.Append(",\"").Append(ownerIds[i]).Append("\":");
            if (flt != null) flt.Drop = ownerIds[i] != curOwner; // 当前柜全量（格子态网格/排序角标）
            n = AppendOwnerItems(sb, oc, ownerIds[i], itemDict, nowHours, tradeScene, flt);
            itemRows += n;
        }
        // 地面段（虚拟键 RailGround.OwnerId；行 id=ItemData.InstanceId——idetail/词条同源，
        // 取物命令按物品 id 反查 DropItem 实体）。伪坐标 UniformWidth 列（渲染层平铺不消费）
        if (gdrops.Count > 0)
        {
            sb.Append(",\"").Append(RailGround.OwnerId).Append("\":");
            if (flt != null) flt.Drop = true; // 地面=非当前柜：列表页/吊栏同谓词滤（§C 补：地面参与预筛）
            n = RailGround.AppendItems(sb, gdrops, itemDict, nowHours, tradeScene, RailUi.UniformWidth, flt);
            itemRows += n;
        }
        sb.Append('}');
        // 页脚「已隐藏 N 种」：C# 推送前滤掉+当前柜/背包将被 JS 藏掉的行，按种计数随包回传
        // （吊栏无页脚计数——篮子行为「全部可见」，类别预筛即全部内容）。
        if (flt != null && flt.BasketCats == null)
            sb.Append(",\"glistHidden\":").Append(hiddenKinds.Count);
        sb.Append('}');

        _forcePending = false;
        _tidyFailPending = false; // 推出即清（一次性标志）
        _feedFailPending = null;  // 同上（feed 失败码随本包带出即清）
        BasketGlist.Dirty = false; // 篮子沿同款：ctx.basket 已随本包带出即清（ItemsDirty 并入位）
        _rev++;
        Dirty.Clear();     // 组装完成：事件脏清（其后新事件重新标；瞬态早退由 _forcePending 保重试）
        _ctxDirty = false; // 页面态沿同点清
        /* 2026-11-01 第十一轮（实机 rev4 实锤）+第十二轮修正：上一轮把 _last* 计数**先赋值
           再比前包**=恒假死代码（三零空包照推）。正确序=先比后存：三零且前包非空=瞬态
           （OwnerCache 空窗/换档瞬间），不推立即重试；T6 裁定 4 的正常空态（开局首包/
           无容器玩家）不受影响。 */
        bool emptyTransient = _ctn.Count == 0 && itemRows == 0 && icfgOrder.Count == 0
            && (_lastCtnRows > 0 || _lastItemRows > 0 || _lastIcfgRows > 0);
        if (emptyTransient)
        {
            _forcePending = true; /* 瞬态：下一周期重试 */
            return (null, _rev);
        }
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
    /// fuelCols=true（燃油发电机页专属，spec §5.3）：行尾追加 [burnable(0/1),burnValue] 两列，
    /// 独立缓存 _icfgFuelCache——同一 cfgId 在普通页(14 列)与本页(16 列)间不得共用缓存行。
    /// brewCols=true（酿酒桶页专属，brew spec §5.1）：行尾追加 canBrew(0/1) 一列，
    /// 独立缓存 _icfgBrewCache——同上分键防串形（15 列）。
    /// dyeCols=true（染料桶页专属，dye-pigment-sort spec §5.1）：行尾追加 pig 打包串一列
    /// （"[[colorId,points],…]"，无色素="[]"；JS normIcfg 按类型判形——与 canBrew 数字同宽互斥），
    /// 独立缓存 _icfgDyeCache——同上分键防串形。
    /// ratCols=true（老鼠笼页专属，rat-brew v2.2.5）：行尾追加 prey(0/1) 一列（Prey_Rarity>0），
    /// 独立缓存 _icfgRatCache——同上分键防串形（与 canBrew 同位数字、按页消费互斥）。
    /// </summary>
    internal static string IcfgRow(int cfgId, Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Item> itemDict = null, bool fuelCols = false, bool brewCols = false, bool dyeCols = false, bool ratCols = false)
    {
        var cache = fuelCols ? _icfgFuelCache : (brewCols ? _icfgBrewCache : (dyeCols ? _icfgDyeCache : (ratCols ? _icfgRatCache : _icfgCache)));
        if (cache.TryGetValue(cfgId, out var row)) return row;
        row = BuildIcfgRow(cfgId, itemDict, fuelCols, brewCols, dyeCols, ratCols);
        if (row == null) // 未就绪窗口：不缓存，等下周期（占位行补页专属尾列，形状与本页真行一致）
            // 终审 Minor4：尾列必须拼在行括号内（旧写法 ,0,0 落在 ] 外=非法形状，normRows 数组过滤侥幸无症状）
            return fuelCols ? PlaceholderIcfgRow(cfgId).TrimEnd(']') + ",0,0]"
                : (brewCols ? PlaceholderIcfgRow(cfgId).TrimEnd(']') + ",0]"
                : (dyeCols ? PlaceholderIcfgRow(cfgId).TrimEnd(']') + ",\"[]\"]"
                : (ratCols ? PlaceholderIcfgRow(cfgId).TrimEnd(']') + ",0]" : PlaceholderIcfgRow(cfgId))));
        cache[cfgId] = row;
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

    /// <summary>契约柜 ownerId 清单（篮子救援 glist：差分候选 cfg 枚举用，CollectCfgIds 同域只读）。</summary>
    internal static List<long> CtnOwnerIds()
    {
        var ids = new List<long>(_ctn.Count);
        for (int i = 0; i < _ctn.Count; i++) ids.Add(_ctn[i].OwnerId);
        return ids;
    }

    /// <summary>背包+契约柜在场 cfg 全集（篮子救援 glist 禁入表候选；OwnerCache 白名单
    /// 只读枚举——绝不 foreach OwnerCache 本身，CollectOwnerCfgIds 同纪律）。</summary>
    internal static List<int> BasketCfgIds()
    {
        var order = new List<int>();
        var seen = new HashSet<int>();
        var oc = ItemMgr()?.OwnerCache;
        if (oc == null) return order;
        CollectOwnerCfgIds(oc, ResolveBagOwner(null), seen, order);
        var owners = CtnOwnerIds();
        for (int i = 0; i < owners.Count; i++) CollectOwnerCfgIds(oc, owners[i], seen, order);
        return order;
    }

    /// <summary>背包+契约柜在场（cfg,uses,usesMax) 去重三元组（篮子救援 glist 逐行边际分候选行
    /// ——实机批改#1：多次使用物品剩余次数异=分值异=拆行，glistItemKey 合并键同口径；
    /// uses/usesMax=Data_Item 原值，键口径在 BasketGlist.KindKey 归一）。</summary>
    internal static List<(int Cfg, int Uses, int UsesMax)> BasketKindRows()
    {
        var order = new List<(int, int, int)>();
        var seen = new HashSet<(int, int, int)>();
        var oc = ItemMgr()?.OwnerCache;
        if (oc == null) return order;
        var owners = CtnOwnerIds();
        CollectKindRows(oc, ResolveBagOwner(null), seen, order);
        for (int i = 0; i < owners.Count; i++) CollectKindRows(oc, owners[i], seen, order);
        return order;
    }

    private static void CollectKindRows(
        Il2CppSystem.Collections.Generic.Dictionary<long, Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData>> oc,
        long owner, HashSet<(int, int, int)> seen, List<(int, int, int)> order)
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
                int cfg = 0, ut = 0, mt = 0;
                try { cfg = it.ItemConfigId; } catch { }
                try { ut = it.UseTimes; } catch { }
                try { mt = it.MaxUseTimes; } catch { }
                if (cfg <= 0) continue;
                var k = (cfg, mt > 0 ? Math.Max(1, ut) : 0, mt);
                if (seen.Add(k)) order.Add(k);
            }
        }
        catch { }
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
            try { if (rus.IsUIActive(sc.UiType)) return sc; } catch (Exception e) { PerfDiag.Swallow("rus.IsUIActive:" + e.GetType().Name); } // [PERFDIAG]
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

        long CtnGuard(long x) => RailData.IsKnownCtn(x) ? 0 : x; /* 柜子 id 视同未读到（回落②③） */
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
                    // 燃油发电机：BagOwnerId 是 ReactiveProperty<long>（非裸 long，dump @184723）——取 .Value。
                    // 十一验收守卫：switchBag v2 会把柜子 id 写进该字段（官方状态直写）——柜子 id
                    // 不是玩家背包：拒用且不落会话缓存（防污染），回落缓存/PlayerId 正路。
                    "FuelGenerator" => CtnGuard(raw?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_FuelGenerator>()?.BagOwnerId?.Value ?? 0),
                    // 暖炉（bagtabs 族第二页）：State_Web_Heater.BagOwnerId 同为 ReactiveProperty<long>——
                    // .Value 直读+十一验收 CtnGuard 同款（switchBag 直写的柜子 id 同样拒用防污染）。
                    "Heater" => CtnGuard(raw?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_Heater>()?.BagOwnerId?.Value ?? 0),
                    _ => 0,
                };
            }
            catch (Exception e) { PerfDiag.Swallow("resolveBagOwner.state:" + e.GetType().Name); } // [PERFDIAG]
            if (v > 0)
            {
                if (_bagOwner != v && CabinetEverywherePlugin.Verbose?.Value == true)
                    CabinetEverywherePlugin.Log.LogInfo($"[CERail] 背包 owner：活动页 {sc.Page} PlayerBagOwnerId={v}（旧缓存 {_bagOwner}）");
                _bagOwner = v;
                return v;
            }
        }
        /* 换档竞态终修（第十二轮 b，实机校准行 owner=43170≠PlayerId=79943 实锤）：世界重绑
           复位后管线立刻重推，此刻 redux 树可能还带**上一档**的 PlayerId → 兜底把旧 pid
           缓存终身（原下行短路 `if (_bagOwner > 0) return`）→ 新档背包行永远按旧 owner
           组装=空 → bagArr()=[] 角标层被摘（「读其他档就不行」；同档重读 PlayerId 不变故
           碰巧没事）。修：PlayerId 每次现读、变了就采用（owner 在签名里=变化即自动重推
           自愈，坏包至多一帧）；读不到才回退旧缓存。 */
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
                if (_bagOwner != pid)
                {
                    CabinetEverywherePlugin.Log.LogInfo($"[CERail] 背包 owner 兜底：PlayerId={pid}（旧缓存 {_bagOwner}→采用新值）");
                    _bagOwner = pid;
                }
                return pid;
            }
        }
        catch (Exception e) { PerfDiag.Swallow("resolveBagOwner.playerId:" + e.GetType().Name); } // [PERFDIAG]
        return _bagOwner > 0 ? _bagOwner : 0;
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
        Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Item> itemDict,
        float nowHours, bool tradeScene, RowFilterCtx flt)
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
                int x = 0, y = 0;
                try { x = it.BagPos.x; y = it.BagPos.y; } catch { }
                AppendItemRow(sb, it, x, y, itemDict, nowHours, tradeScene, ref rows, flt);
            }
        }
        catch { }
        sb.Append(']');
        return rows;
    }

    /// <summary>
    /// 单件行体（地面/门口袋扩展批抽公共）：包内物品（AppendOwnerItems）与家内地面掉落
    /// （RailGround.AppendItems）同构行 [id,cfg,count,timeLeft,x,y,w,h,flags,s1..s4,trade,
    /// days,attrSig,uses,useMax]；x/y 由调用方给（包内=BagPos；地面=伪坐标）。rows 兼作
    /// 行间逗号门与计数（行首逗号=rows&gt;0，行尾 rows++）——与抽取前 AppendOwnerItems
    /// 逐字等价。InstanceId 读不到=不输出（调用方 rows 不变）。
    /// </summary>
    internal static void AppendItemRow(
        StringBuilder sb, GameCore.HotUpdate.Battle.Logic.ItemData it, int x, int y,
        Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Item> itemDict,
        float nowHours, bool tradeScene, ref int rows, RowFilterCtx flt)
    {
        try
        {
            long id = 0; int cfg = 0, count = 0, timeLeft = 0, w = 1, h = 1;
                bool polluted = false;
                try { id = it.InstanceId; } catch { }
                if (id <= 0) return; // findings §7：物品唯一 id = ItemData.InstanceId（无 LogicId 字段）
                try { cfg = it.ItemConfigId; count = it.ItemCount; timeLeft = it.TimeLeft; polluted = it.Polluted; } catch { }
                try { w = it.ItemSize.x; h = it.ItemSize.y; } catch { }
                if (w <= 0) w = 1;
                if (h <= 0) h = 1;

                GameCore.HotUpdate.Config_Item ic = null;
                try { itemDict?.TryGetValue(cfg, out ic); } catch { }
                int life = 0, orig = 0;
                try { life = ic?.Life ?? 0; } catch { }
                try { orig = it.OriginalTimeLeft; } catch { }
                int flags = ItemFlags(life, timeLeft, orig, polluted);

                // 缺陷单#1：逐叠排序数值（RailSortMath=ProjectCook 口径；任一环失败该维 null）
                var nums = RailSortMath.Of(it, ic, tradeScene, nowHours);

                // glist（v1.9.0 批改#1 三追）：attrSig=随机词条签名（**原始 InstanceVD**）——合并键
                // =物品名+attrSig 的唯一属性依据。剥掉一切瞬态：使用次数（s 值乘了 UseTimes，随吃
                // 递减=吃一口裂一行的假拆）、滋养天赋（玩家成长全叠同变）、保鲜（flags/timeLeft 食物
                // 态位燃料恒 0）。无实例掷值（包装食品/燃料/材料）=空串（同名全并）。
                string attrSig = "";
                try
                {
                    var iv2 = it.InstanceVD;
                    if (iv2 != null && iv2.Length >= 5 && (iv2[0] != 0f || iv2[1] != 0f || iv2[2] != 0f || iv2[3] != 0f || iv2[4] != 0f))
                        attrSig = iv2[0].ToString("0.###", CultureInfo.InvariantCulture) + "|" + iv2[1].ToString("0.###", CultureInfo.InvariantCulture)
                            + "|" + iv2[2].ToString("0.###", CultureInfo.InvariantCulture) + "|" + iv2[3].ToString("0.###", CultureInfo.InvariantCulture)
                            + "|" + iv2[4].ToString("0.###", CultureInfo.InvariantCulture);
                }
                catch { }

                // v2（作者 2026-11-08 终案）：uses/useMax=原始剩余/最大使用次数（仅 MaxUseTimes>0 的
                // 多用途物品携带——非料理食物/药物/书籍同口径）——合并键第三维+行上官方「剩余/最大」
                // 徽章（item-use 方案镜像）；null=无该维度（材料/燃料等同名即并）。
                int? usesVal = null, usesMaxVal = null;
                try { var um = it.MaxUseTimes; if (um > 0) { usesVal = Math.Max(1, it.UseTimes); usesMaxVal = um; } } catch { }

                // 列表页/吊栏行筛选（spec §C/§D）：Drop=true 的 owner 滤掉不输出（行未落笔 rows 不变）；
                // Drop=false（背包/当前柜）仅计 HiddenKinds——行照常输出，列表态由 JS 按同谓词藏。
                if (flt != null)
                {
                    bool keep;
                    if (flt.BasketCats != null)
                    {
                        int cat = 0;
                        try { cat = ic?.Category ?? 0; } catch { }
                        keep = flt.BasketCats.Contains(cat);
                    }
                    else
                    {
                        bool burnable = false, canBrew = false, hasPig = false;
                        int prey = 0;
                        try { burnable = ic != null && ic.Burnable; } catch { }
                        try { canBrew = ic != null && ic.CanBrew; } catch { }
                        if (flt.Page == "RatCage") { try { prey = RatPreyKind(cfg); } catch { } }
                        if (flt.Page == "DyePanel") { try { hasPig = DyePigOf(cfg) != "[]"; } catch { } }
                        float s1v = nums.Stats[0] ?? 0;
                        keep = RailGlistRule.Keep(flt.Page, burnable, hasPig, prey, s1v, canBrew);
                    }
                    if (!keep)
                    {
                        var kindName = "";
                        try { kindName = ic == null ? "" : (string.IsNullOrEmpty(ic.ItemName_Local) ? ic.ItemName : ic.ItemName_Local); } catch { }
                        flt.HiddenKinds?.Add(RailGlistRule.KindKey(kindName, usesVal, usesMaxVal, attrSig));
                        if (flt.Drop) return;
                    }
                }

                if (rows > 0) sb.Append(',');
                sb.Append('[').Append(id).Append(',').Append(cfg).Append(',').Append(count)
                  .Append(',').Append(timeLeft) /* TimeLeft 原样（单位=游戏小时，RailSortMath 定案） */
                  .Append(',').Append(x).Append(',').Append(y).Append(',').Append(w).Append(',').Append(h)
                  .Append(',').Append(flags)
                  .Append(',').Append(NumOrNull(nums.Stats[0])).Append(',').Append(NumOrNull(nums.Stats[1]))
                  .Append(',').Append(NumOrNull(nums.Stats[2])).Append(',').Append(NumOrNull(nums.Stats[3]))
                  .Append(',').Append(NumOrNull(nums.Trade))
                  .Append(',').Append(nums.DaysKey.HasValue ? nums.DaysKey.Value.ToString("0.###", CultureInfo.InvariantCulture) : "null")
                  .Append(",\"").Append(attrSig).Append("\"") /* v1.9.0：attrSig（glist 合并键属性依据） */
                  .Append(',').Append(usesVal.HasValue ? usesVal.Value.ToString(CultureInfo.InvariantCulture) : "null") /* v2：uses（glist 合并键+徽章） */
                  .Append(',').Append(usesMaxVal.HasValue ? usesMaxVal.Value.ToString(CultureInfo.InvariantCulture) : "null") /* v2：useMax（徽章「剩余/最大」+键） */
                  .Append(']');
                rows++;
        }
        catch { }
    }

    private static string NumOrNull(int? v) => v.HasValue ? v.Value.ToString(CultureInfo.InvariantCulture) : "null";

    /// <summary>
    /// flags：bit0=污染 bit1=过期 bit2=临期。
    /// 过期=可腐坏（Life&gt;0）且 TimeLeft≤0；临期照 FoodPreservationRules.IsNearExpiry 公式形状
    /// （剩余 ≤ maxDays，或 ≤ ratio×原始保质——ratio 项用 OriginalTimeLeft 比值，单位无关）。
    /// TimeLeft 单位已定案=游戏小时（RailSortMath DaysLeftOf ÷24 成天；2026-11-01 缺陷单#1）。
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
        else if (timeLeft <= maxDays * 24f) flags |= 4;
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
    private static string BuildIcfgRow(int cfgId, Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Item> itemDict, bool fuelCols = false, bool brewCols = false, bool dyeCols = false, bool ratCols = false)
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
        int uses = 0; try { uses = ic.UseTimes; } catch { } // v1.8.5④：vue 页交易折旧 dispTradeUses 的 cfgUses
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
          .Append(',').Append(uses) /* v1.8.5④：cfgUses（交易使用折旧） */
          .Append(']');
        /* bagtabs 族两页（燃油发电机/暖炉）专属尾列（spec §5.3/builder-check Q1 裁定；暖炉移植批扩页）：burnable(0/1)+burnValue——
           官方火苗角标/加油校验的物品级标志（dump @40395/40396），**禁止**从 Category==13 推导
           （官方判定是物品级 Burnable，分类外的可燃物会误标）。读不到=0（与各行 try/catch 同口径）。 */
        if (fuelCols)
        {
            bool burnable = false; int burnValue = 0;
            try { burnable = ic.Burnable; } catch { }
            try { burnValue = ic.BurnValue; } catch { }
            sb.Remove(sb.Length - 1, 1).Append(',').Append(burnable ? 1 : 0).Append(',').Append(burnValue).Append(']');
        }
        /* 酿酒桶页专属尾列（brew spec §5.1，fuelCols 同款纪律）：canBrew(0/1)——发酵原料的
           物品级标志（Config_Item.CanBrew，dump @Config_Item 列表 190 件），**禁止**从
           Category==1 推导（官方判定是物品级 CanBrew，Burnable 先例同款）。读不到=0。 */
        if (brewCols)
        {
            bool canBrew = false;
            try { canBrew = ic.CanBrew; } catch { }
            sb.Remove(sb.Length - 1, 1).Append(',').Append(canBrew ? 1 : 0).Append(']');
        }
        /* 染料桶页专属尾列（dye-pigment-sort spec §5.1，fuelCols/brewCols 同款纪律）：pig=植物
           全颜色点数打包串 "[[dyeItemId,points],…]"（含未解锁色；无色素/读不到="[]"）。
           数据源=_Config_PlantPigment_Dict 聚合索引（spike v3 实证）；行缓存=_icfgDyeCache。 */
        if (dyeCols)
        {
            sb.Remove(sb.Length - 1, 1).Append(",\"").Append(EscapeJs(DyePigOf(cfgId))).Append("\"]");
        }
        /* 老鼠笼页专属尾列（rat-brew v2.2.5；v2.2.7 作者令改「猎物」含死体）：prey 三值——
           0=非猎物 / 1=活体（Prey_Rarity>0，gamekb 全表 23 件核验）/ 2=死体（与活体**同动物
           Model 预制体**结构关联——7 种死体一一对应活体，料理用 Furniture 模型不撞；腐烂链
           活体→肥料不可用作判定）。**禁止**从 Category/SubCategory/名字推导。读不到=0。 */
        if (ratCols)
        {
            sb.Remove(sb.Length - 1, 1).Append(',').Append(RatPreyKind(cfgId)).Append(']');
        }
        return sb.ToString();
    }

    /// <summary>cfgId → pig 打包串 "[[dyeItemId,points],…]"（dye-pigment-sort spec §5.1）。
    /// 数据源=ConfigManager._Config_PlantPigment_Dict（spike v3 实证 66 行：ItemId/DyeItemId/
    /// Points，全颜色含未解锁）；按 ItemId 聚合懒建索引，配置未就绪返 "[]" 下周期再试（不锁死）。</summary>
    private static Dictionary<int, string> _dyePigIdx;

    private static string DyePigOf(int cfgId)
    {
        try
        {
            if (_dyePigIdx == null)
            {
                var pd = BagTable.Cm()?._Config_PlantPigment_Dict;
                if (pd == null || pd.Count == 0) return "[]"; // 未就绪窗口：等下周期（占位/空串均可被 JS 容错）
                var agg = new Dictionary<int, StringBuilder>();
                foreach (var kv in pd)
                {
                    var r = kv.Value;
                    if (r == null) continue;
                    int item, dye, pts;
                    try { item = r.ItemId; dye = r.DyeItemId; pts = r.Points; } catch { continue; }
                    if (!agg.TryGetValue(item, out var sb)) agg[item] = sb = new StringBuilder();
                    sb.Append(sb.Length > 0 ? ",[" : "[").Append(dye).Append(',').Append(pts).Append(']');
                }
                var idx = new Dictionary<int, string>(agg.Count);
                foreach (var a in agg) idx[a.Key] = "[" + a.Value.ToString() + "]";
                _dyePigIdx = idx;
            }
            return _dyePigIdx.TryGetValue(cfgId, out var s) ? s : "[]";
        }
        catch { return "[]"; }
    }

    /// <summary>dyePal 页条件字段 JSON（[[dyeItemId,"名","#hex",1,order]…]；空串=板未就绪不下发）。
    /// 序=DyePaletteRules.PanelDyeItems（官方面板序）；名=染料物品 ItemName_Local/ItemName
    /// （spike v3 实证 ColorShowKeys=StateXX 非显示名，名称必须走染料物品本体）。</summary>
    private static string DyePalJson()
    {
        try
        {
            var ids = new List<int>();
            foreach (var e in GameCore.HotUpdate.DyePaletteRules.PanelDyeItems) ids.Add(e);
            var hexes = new List<string>();
            foreach (var e in GameCore.HotUpdate.DyePaletteRules.PanelDyeHex) hexes.Add(e);
            if (ids.Count == 0 || hexes.Count != ids.Count) return "";
            var dict = ItemDict();
            if (dict == null || dict.Count == 0) return "";
            var sb = new StringBuilder("[");
            for (var i = 0; i < ids.Count; i++)
            {
                string name = null;
                try { dict.TryGetValue(ids[i], out var dic); name = string.IsNullOrEmpty(dic?.ItemName_Local) ? dic?.ItemName : dic.ItemName_Local; } catch { }
                if (i > 0) sb.Append(',');
                sb.Append('[').Append(ids[i])
                  .Append(",\"").Append(EscapeJs(name ?? ids[i].ToString())).Append('"')
                  .Append(",\"").Append(EscapeJs(hexes[i] ?? "")).Append('"')
                  .Append(",1,").Append(i + 1).Append(']');
            }
            return sb.Append(']').ToString();
        }
        catch { return ""; }
    }

    private static string _brewIcoCache; /* rat-brew glist：三档酒精瓶 WebIcon JSON（静态配置一次读，_icfgFuelCache 先例；失败不缓存=下包重试） */
    private static HashSet<int> _ratPreyLive;   /* 活猎物 cfgId（Prey_Rarity>0） */
    private static HashSet<string> _ratPreyModels; /* 活猎物动物 Model 预制体 → 死体关联键 */
    private static HashSet<int> _ratPreyDead;   /* 死体猎物 cfgId（同 Model 结构关联） */
    private static object _ratPreySrc;          /* 索引源字典引用（配置表恒定，防重建） */

    /// <summary>rat-brew v2.2.7：cfgId → 猎物三值（0 非猎物/1 活体/2 死体）。活=Prey_Rarity>0；
    /// 死体=与活体同动物 Model（结构关联非名字推导——gamekb 7 种死体全对上，腐烂链活体→肥料
    /// 不可用）。索引懒建一次（_perfectIds 同款源引用守卫）。</summary>
    private static int RatPreyKind(int cfgId)
    {
        try
        {
            var dict = ItemDict();
            if (dict == null || dict.Count == 0) return 0;
            if (!ReferenceEquals(_ratPreySrc, dict))
            {
                var live = new HashSet<int>();
                var models = new HashSet<string>();
                var dead = new HashSet<int>();
                foreach (var kv in dict)
                {
                    var it = kv.Value;
                    if (it == null) continue;
                    try
                    {
                        if (it.Prey_Rarity > 0) { live.Add(kv.Key); var m = it.Model; if (!string.IsNullOrEmpty(m)) models.Add(m); }
                    }
                    catch { }
                }
                foreach (var kv in dict)
                {
                    var it = kv.Value;
                    if (it == null || live.Contains(kv.Key)) continue;
                    try { if (!string.IsNullOrEmpty(it.Model) && models.Contains(it.Model)) dead.Add(kv.Key); } catch { }
                }
                _ratPreyLive = live; _ratPreyModels = models; _ratPreyDead = dead; _ratPreySrc = dict;
            }
            if (_ratPreyLive.Contains(cfgId)) return 1;
            if (_ratPreyDead.Contains(cfgId)) return 2;
            return 0;
        }
        catch { return 0; }
    }
    /// <summary>brewIco 页条件字段 JSON（["劣","普","烈"] 三 WebIcon；空串=任一缺席整字段不下发——
    /// JS 角标退纯色无图不崩）。序=JS GLB_TIER 档序；物品 15505/15504/15506=酿酒产物三档
    /// 物品本体（Config_Item dump 实证，rat-brew spec §4）。</summary>
    private static string BrewIcoJson()
    {
        if (_brewIcoCache != null) return _brewIcoCache;
        try
        {
            var dict = ItemDict();
            if (dict == null || dict.Count == 0) return "";
            int[] ids = { 15505, 15504, 15506 };
            var urls = new string[3];
            for (var i = 0; i < 3; i++)
            {
                try { dict.TryGetValue(ids[i], out var bic); urls[i] = bic?.WebIcon; } catch { }
                if (string.IsNullOrEmpty(urls[i])) return "";
            }
            var sb = new StringBuilder("[");
            for (var i = 0; i < 3; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append('"').Append(EscapeJs(urls[i])).Append('"');
            }
            _brewIcoCache = sb.Append(']').ToString();
            return _brewIcoCache;
        }
        catch { return ""; }
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
    /// <summary>是否白名单容器 owner（switchBag v2 会把柜子 id 写进 State_Web_FuelGenerator.
    /// BagOwnerId——背包解析链须排斥容器 id，玩家背包 id 与柜子 id 空间天然不同）。</summary>
    internal static bool IsKnownCtn(long owner)
    {
        var list = _ctn;
        if (list == null) return false;
        for (int i = 0; i < list.Count; i++) if (list[i].OwnerId == owner) return true;
        return false;
    }

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
                    /* 2026-11-06 八追终案修复：旧行尾多余 "\",\"" 之后的 ","（行尾逗号）与
                       行首分隔逗号叠加 → 行间 ",,"（实机 CDP 抓包 "#E8A33D"],,[1002,…" 铁证）。
                       旧直推路径按 JS 字面量求值：",,"=数组空洞（合法，normRows 兜底滤掉）——
                       故历史一直"能用"；分片路径 JSON.parse 严格拒绝 → 全包报废。改为纯行首
                       分隔（ctn/icfg/items 同款），尾部 Length-- 补丁随行尾逗号一并退役。 */
                    sb.Append('[').Append(id)
                      .Append(",\"").Append(EscapeJs(name)).Append('"')
                      .Append(',').Append(dim)
                      .Append(',').Append(order)
                      .Append(",\"").Append(EscapeJs(icon)).Append('"')
                      .Append(",\"").Append(EscapeJs(color)).Append("\"]");
                }
        }
        catch (Exception e)
        {
            WarnOnce("lib", "标签库读取失败: " + e.Message);
        }
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

    internal static GameCore.HotUpdate.ReduxUI.ReduxUISystem ReduxUi()
    {
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return null;
            return GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
        }
        catch (Exception e) { PerfDiag.Swallow("rus.singleton:" + e.GetType().Name); return null; } // [PERFDIAG]
    }

    private static GameCore.HotUpdate.Battle.Logic.BattleLogicWorld LogicWorld()
    {
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.Battle.Logic.BattleLogicWorld>.IsInstanceCreated)
                return null;
            return GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.Battle.Logic.BattleLogicWorld>.Instance;
        }
        catch (Exception e) { PerfDiag.Swallow("world.singleton:" + e.GetType().Name); return null; } // [PERFDIAG]
    }

    internal static GameCore.HotUpdate.ReduxUI.State_Data_Item ItemState() // 高度修改批：ShrinkDrop 共用（BagCache/OwnerCache 只读入口）
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
    private static int _rev;
    private static volatile bool _forcePending;
    private static volatile bool _tidyFailPending;  // tidy 失败一次性标志（ReportTidyFail 置位，BuildJson 推出即清）
    private static volatile string _feedFailPending; // feed 失败码一次性标志（MarkFeedFail 置位，同上点位清）
    private static readonly Dictionary<int, string> _icfgCache = new(); // cfgId → 行字符串（懒缓存，14 列）
    private static readonly Dictionary<int, string> _icfgFuelCache = new(); // 燃油发电机页 16 列行（尾列 burnable/burnValue，spec §5.3——与 14 列缓存分键防串形）
    private static readonly Dictionary<int, string> _icfgBrewCache = new(); // 酿酒桶页 15 列行（尾列 canBrew，brew spec §5.1——同上分键防串形）
    private static readonly Dictionary<int, string> _icfgDyeCache = new(); // 染料桶页行（尾列 pig 打包串，dye-pigment-sort spec §5.1——同上分键防串形）
    private static readonly Dictionary<int, string> _icfgRatCache = new(); // 老鼠笼页行（尾列 prey，rat-brew v2.2.5——同上分键防串形）

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

    // ================= 染料桶色素 spike dump（dye-pigment-sort spec §6 S1/S3；Debug.DumpDyePigments 触发一次） =================
    // 自发现式：枚举 GameCore.HotUpdate 程序集里名字含 Dye/Pigment 的类型与字段，逐项 try/catch——
    // 找多少打多少（找不全不是错）。产出=Task 2 的 C# 访问链 + 附录 A 数值表。
    internal static volatile bool DyePigDumpRequested;

    internal static void FlushDyePigDump()
    {
        if (!DyePigDumpRequested) return;
        if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.Battle.Logic.BattleLogicWorld>.IsInstanceCreated)
            return; // 等进档（FlushDump 同门）：主菜单阶段配置表未挂世界
        if (ItemDict() == null || ItemDict().Count == 0)
            return; // 配置表未就绪：不消费标志，等下周期（FlushDump「等首份有效数据」同纪律）
        DyePigDumpRequested = false;
        var log = CabinetEverywherePlugin.Log;
        log.LogInfo("[CERail] dye-pig spike dump 开始（自发现：类型普查/GameKey/ConfigManager/Config_Item 逐项容错）");

        // ① 类型普查：名字含 Dye/Pigment 的类型 + 其字段/属性名（只打名字，值由②③④定向取）
        try
        {
            var types = typeof(GameCore.HotUpdate.ConfigManager).Assembly.GetTypes();
            int n = 0;
            foreach (var t in types)
            {
                var fn = t.FullName ?? "";
                if (fn.IndexOf("Dye", StringComparison.OrdinalIgnoreCase) < 0 &&
                    fn.IndexOf("Pigment", StringComparison.OrdinalIgnoreCase) < 0) continue;
                n++;
                var sb = new StringBuilder();
                sb.Append("[CERail] dye-pig type ").Append(t.FullName);
                try
                {
                    foreach (var f in t.GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Static))
                        sb.Append("\n    f ").Append(f.FieldType.Name).Append(' ').Append(f.Name).Append(f.IsStatic ? " [static]" : "");
                    foreach (var p in t.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Static))
                        sb.Append("\n    p ").Append(p.PropertyType.Name).Append(' ').Append(p.Name);
                }
                catch (Exception e) { sb.Append("  <成员枚举失败: ").Append(e.Message).Append('>'); }
                log.LogInfo(sb.ToString());
            }
            log.LogInfo("[CERail] dye-pig 类型普查命中 " + n + " 个");
        }
        catch (Exception e) { log.LogWarning("[CERail] dye-pig 类型普查失败: " + e.Message); }

        // ② GameKey：含 Dye/Pigment 的静态属性名+值（brewP1 读取的同类）
        try
        {
            foreach (var p in typeof(GameCore.HotUpdate.GameKey).GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static))
            {
                if (p.Name.IndexOf("Dye", StringComparison.OrdinalIgnoreCase) < 0 &&
                    p.Name.IndexOf("Pigment", StringComparison.OrdinalIgnoreCase) < 0) continue;
                var v = "<读取失败>";
                try { v = string.Concat(p.GetValue(null)); } catch { }
                log.LogInfo("[CERail] dye-pig GameKey " + p.Name + " = " + v);
            }
        }
        catch (Exception e) { log.LogWarning("[CERail] dye-pig GameKey 枚举失败: " + e.Message); }

        // ③-v2 ConfigManager：Il2CppInterop 把 il2cpp 字段暴露成**属性**（一轮 GetFields 空手教训）——
        //    GetProperties 扫名字含 Dye/Pigment/Plant 的表属性，dict/list 打 count，并定向枚举 PlantPigment 表
        var cm = BagTable.Cm();
        if (cm != null)
        {
            // v3 起 typed 路负责取值——反射仅留属性名普查（表类型对账；pigTable/pigProp 死变量随警告清理删除）
            try
            {
                foreach (var p in cm.GetType().GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance))
                {
                    var n = p.Name;
                    if (n.IndexOf("Dye", StringComparison.OrdinalIgnoreCase) < 0 &&
                        n.IndexOf("Pigment", StringComparison.OrdinalIgnoreCase) < 0 &&
                        n.IndexOf("Plant", StringComparison.OrdinalIgnoreCase) < 0) continue;
                    log.LogInfo("[CERail] dye-pig ConfigManager p " + p.PropertyType.Name + " " + n);
                }
            }
            catch (Exception e) { log.LogWarning("[CERail] dye-pig ConfigManager 属性枚举失败: " + e.Message); }
        }
        else log.LogWarning("[CERail] dye-pig ConfigManager 未就绪");

        // ⑤-v3 色板与色素表：**typed 直读**（v2 反射枚举 Il2Cpp 集合两路空——interop 只保证 typed
        //    路可用；_Config_Item_Dict typed foreach 先例实证）。逐块独立 try/catch，坏一块不影响其余。
        try
        {
            var sbA = new StringBuilder();
            sbA.Append("ColorCount=").Append(GameCore.HotUpdate.Battle.Logic.DyeConfig.ColorCount);
            try { sbA.Append(" ColorDyeIds=["); foreach (var e in GameCore.HotUpdate.Battle.Logic.DyeConfig.ColorDyeIds) sbA.Append(e).Append(','); sbA.Append(']'); } catch (Exception e2) { sbA.Append(" <ColorDyeIds 失败: ").Append(e2.Message).Append('>'); }
            try { sbA.Append(" ColorHex=["); foreach (var e in GameCore.HotUpdate.Battle.Logic.DyeConfig.ColorHex) sbA.Append(e).Append(','); sbA.Append(']'); } catch (Exception e2) { sbA.Append(" <ColorHex 失败: ").Append(e2.Message).Append('>'); }
            try { sbA.Append(" ColorShowKeys=["); foreach (var e in GameCore.HotUpdate.Battle.Logic.DyeConfig.ColorShowKeys) sbA.Append(e).Append(','); sbA.Append(']'); } catch (Exception e2) { sbA.Append(" <ColorShowKeys 失败: ").Append(e2.Message).Append('>'); }
            log.LogInfo("[CERail] dye-pig DyeConfig " + sbA.ToString());
        }
        catch (Exception e) { log.LogWarning("[CERail] dye-pig DyeConfig typed 读取失败: " + e.Message); }
        try
        {
            var sbB = new StringBuilder();
            sbB.Append("PaletteSize=").Append(GameCore.HotUpdate.DyePaletteRules.PaletteSize).Append(" NoDye=").Append(GameCore.HotUpdate.DyePaletteRules.NoDye);
            try { sbB.Append(" SlotToDyeItem=["); foreach (var e in GameCore.HotUpdate.DyePaletteRules.SlotToDyeItem) sbB.Append(e).Append(','); sbB.Append(']'); } catch (Exception e2) { sbB.Append(" <SlotToDyeItem 失败: ").Append(e2.Message).Append('>'); }
            try { sbB.Append(" PanelDyeItems=["); foreach (var e in GameCore.HotUpdate.DyePaletteRules.PanelDyeItems) sbB.Append(e).Append(','); sbB.Append(']'); } catch (Exception e2) { sbB.Append(" <PanelDyeItems 失败: ").Append(e2.Message).Append('>'); }
            try { sbB.Append(" PanelDyeHex=["); foreach (var e in GameCore.HotUpdate.DyePaletteRules.PanelDyeHex) sbB.Append(e).Append(','); sbB.Append(']'); } catch (Exception e2) { sbB.Append(" <PanelDyeHex 失败: ").Append(e2.Message).Append('>'); }
            log.LogInfo("[CERail] dye-pig DyePaletteRules " + sbB.ToString());
        }
        catch (Exception e) { log.LogWarning("[CERail] dye-pig DyePaletteRules typed 读取失败: " + e.Message); }
        // PlantPigment 表 typed 全行（附录 A 数据源）：ID/Source/ItemId/DyeItemId/Points/MainKey
        try
        {
            var pd = BagTable.Cm()?._Config_PlantPigment_Dict;
            if (pd == null || pd.Count == 0) log.LogWarning("[CERail] dye-pig PlantPigment 表未就绪（null/空）");
            else
            {
                var sbC = new StringBuilder("[CERail] dye-pig PlantPigment 表 ").Append(pd.Count).Append(" 行：\n");
                foreach (var kv in pd)
                {
                    var r = kv.Value;
                    if (r == null) continue;
                    try { sbC.Append("  ID=").Append(r.ID).Append(" item=").Append(r.ItemId).Append(" dye=").Append(r.DyeItemId).Append(" pts=").Append(r.Points).Append(" src=\"").Append(r.Source).Append("\"\n"); }
                    catch (Exception e2) { sbC.Append("  <行读失败: ").Append(e2.Message).Append(">\n"); }
                }
                log.LogInfo(sbC.Append("（附录 A 数据源）").ToString());
            }
        }
        catch (Exception e) { log.LogWarning("[CERail] dye-pig PlantPigment typed 枚举失败: " + e.Message); }
        // _plantPigmentsByItem typed（运行期索引，核对与配置表一致性 + 行集合形状）
        try
        {
            var it = BagTable.Cm()?._plantPigmentsByItem;
            if (it == null) log.LogWarning("[CERail] dye-pig _plantPigmentsByItem null");
            else
            {
                var sbD = new StringBuilder("[CERail] dye-pig _plantPigmentsByItem：\n");
                int n = 0;
                foreach (var kv in it)
                {
                    n++;
                    var val = kv.Value;
                    try { sbD.Append("  item ").Append(kv.Key).Append(" → ").Append(val == null ? "null" : val.ToString()).Append('\n'); }
                    catch (Exception e2) { sbD.Append("  item ").Append(kv.Key).Append(" → <读失败: ").Append(e2.Message).Append(">\n"); }
                }
                log.LogInfo(sbD.Append("共 ").Append(n).Append(" 键").ToString());
            }
        }
        catch (Exception e) { log.LogWarning("[CERail] dye-pig _plantPigmentsByItem typed 读取失败: " + e.Message); }

        log.LogInfo("[CERail] dye-pig spike dump 结束（Task 2 访问链/附录 A 依据）");
    }

    private static string SafeName(GameCore.HotUpdate.Config_Item ci)
    {
        try { return string.IsNullOrEmpty(ci?.ItemName_Local) ? (ci?.ItemName ?? "?") : ci.ItemName_Local; } catch { return "?"; }
    }

    /// <summary>dump 辅助：集合/可枚举 → "[a,b,…]"（限长 4000），标量 → 字符串。Il2Cpp 包装不实现
    /// System 侧接口时返回类型名（候选资格不受影响——枚举走 ④ 双路）。</summary>
    private static string StrOfCollection(object o, string typeName)
    {
        try
        {
            if (o is System.Collections.ICollection c) return typeName + " count=" + c.Count;
            if (o is System.Collections.IEnumerable en && !(o is string))
            {
                var sb = new StringBuilder(typeName).Append(" [");
                int k = 0;
                foreach (var e in en) { if (sb.Length > 4000) { sb.Append(",…"); break; } if (k++ > 0) sb.Append(','); sb.Append(string.Concat(e)); }
                return sb.Append(']').ToString();
            }
            return string.Concat(o);
        }
        catch { return "<读取失败>"; }
    }
}
