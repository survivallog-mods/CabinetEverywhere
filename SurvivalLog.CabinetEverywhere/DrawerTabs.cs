using System;
using System.Collections.Generic;
using GameCore.HotUpdate.ReduxUI;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 工作台抽屉页签注入（2026-11-06 作者令：抽屉进 无人机交易+粉碎机 页签）。
///
/// 事实链（当日对齐终案，CHANGELOG 十七/十八批）：工作台抽屉=**全局包不挂家具**
/// （三档 5010[8×5]/5012[8×6]/5013[8×7]，全工作台共享互通），官方页签收集走家具白名单
/// → 抽屉永远进不了交易/粉碎机页签。本类把抽屉作为**固定页签**补进 交易/粉碎机/调度机队 三页状态层：
/// - Trade（State_Web_TradeUI.BagTabs=List&lt;BagTabEntry&gt; POCO：owner/name/fridge/player/
///   cols/rows/rack/rackCfg/pin，无 Index）；
/// - Shredder（State_Web_Shredder.CartTabs=ObservableList&lt;Data_Web_Shredder_Tab&gt;：
///   Index/OwnerId/Name/IsNew/IsRack/FurnitureConfigId——R3.ReactiveProperty 构造照
///   TabInjector bag×4 先例）。
///
/// 纯视图层状态追加：零配置写、零存档写、卸载重开界面即消（与 TabInjector 同生命周期语义）。
/// 与 TabGate 的相处（免豁免的关键）：场景视图修剪的纪律=「ownerId 不在容器表=Keep
/// （宁可不剪也不错剪）」——抽屉不在 AllContainers → 永不被剪；cart 族修剪后的 Index
/// 重排会把本页签位次一并维护（ReconcileCart 全量重排）。
///
/// owner 发现：WorkbenchDrawerConfig.DrawerOwnerId 编译期常量直读（dump 实证权威源），
/// 档位=BagCache[owner] 现读（键已知）；未注册（本会话未开过工作台）→ 冷启动注册=直调游戏
/// 自己的装配函数 ItemManager.SyncWorkbenchDrawerToRedux()（取证见 FindDrawerOwner 注释），
/// 仍不成 → 本轮跳过下轮再看——失败态=页签缺席，零崩溃路径。
/// 语义边界（作者已知悉）：这是**页签**=手动搬运；无人机交易本就全手动，无自动货源语义缺口。
/// </summary>
internal static class DrawerTabs
{
    private static readonly Il2CppSystem.Type TradeType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_TradeUI));
    private static readonly Il2CppSystem.Type ShredderType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_Shredder));
    private static readonly Il2CppSystem.Type DroneHubType = Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_DroneHub));

    private static readonly HashSet<string> Warned = new();
    private static void WarnOnce(string key, string msg)
    {
        if (Warned.Add(key))
            CabinetEverywherePlugin.Log.LogWarning("[CabinetEverywhere.DrawerTabs] " + msg);
    }
    private static void Log(string msg) => CabinetEverywherePlugin.Log.LogInfo("[CabinetEverywhere.DrawerTabs] " + msg);

    private const string DrawerName = "工作台抽屉";

    // ---- FastPoll（二十批：开界面短窗每帧抢跑——抽屉页签随官方数组建成那帧落地，TabGate.FastPoll 同款纪律） ----
    private sealed class FlipWin { public bool WasActive; public int Frames; }
    private static readonly Dictionary<string, FlipWin> FlipWins = new();

    private static void FastOne(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, Il2CppSystem.Type t,
        string key, Action<GameCore.HotUpdate.ReduxUI.ReduxUISystem> act)
    {
        if (!FlipWins.TryGetValue(key, out var f)) { f = new FlipWin(); FlipWins[key] = f; }
        bool active = SafeActive(rus, t);
        if (!active) { f.WasActive = false; f.Frames = 0; return; }
        if (!f.WasActive) { f.WasActive = true; f.Frames = 20; }
        if (f.Frames > 0) { f.Frames--; act(rus); }
    }

    /// <summary>每帧（AccessTicker，TabGate.FastPoll 旁）：三页翻转短窗内每帧抢跑（幂等）；稳态零动作。</summary>
    internal static void FastPoll()
    {
        if (CabinetEverywherePlugin.Enabled != null && !CabinetEverywherePlugin.Enabled.Value) return;
        if (CabinetEverywherePlugin.EnableCraftSource == null || !CabinetEverywherePlugin.EnableCraftSource.Value) return;
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return;
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            if (rus == null) return;
            FastOne(rus, TradeType, "trade", ActTrade);
            FastOne(rus, ShredderType, "shredder", ActShredder);
            FastOne(rus, DroneHubType, "dronehub", ActDroneHub);
        }
        catch (Exception e)
        {
            WarnOnce("fastpoll", "抽屉页签瞬帧注入异常: " + e.Message);
        }
    }

    private static void ActTrade(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var owner = FindDrawerOwner(rus);
        /* v1.9.1 批改二轮①：抽屉归类=材料（作者裁定）——筛选态非材料分类不补挂（TabGate
           .DrawerVisibleFor 与剪枝同口径单一事实源，防「它剪我补」振荡） */
        if (owner != 0 && TabGate.DrawerVisibleFor("trade")) EnsureTrade(rus, owner);
        FixStaleTradeSizes(rus);
    }

    private static void ActShredder(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var owner = FindDrawerOwner(rus);
        if (owner != 0) EnsureShredder(rus, owner);
    }

    private static void ActDroneHub(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        var owner = FindDrawerOwner(rus);
        if (owner != 0 && TabGate.DrawerVisibleFor("dronehub")) EnsureDroneHub(rus, owner); /* 批改二轮①：抽屉归类门同 ActTrade */
    }

    /// <summary>0.5s 轮询（AccessTicker 快通道，TabInjector.PollAll 之后）。门：General + EnableCraftSource（两页属白名单族）。
    /// 冷启动注册纪律（教训=读档窗口期做重活曾致原生闪退）：两页 UI 均未打开时直接返回，
    /// owner 发现与冷启动装配只在 SafeActive(Trade/Shredder) 之后才触达。</summary>
    internal static void PollAll()
    {
        if (CabinetEverywherePlugin.Enabled != null && !CabinetEverywherePlugin.Enabled.Value) return;
        if (CabinetEverywherePlugin.EnableCraftSource == null || !CabinetEverywherePlugin.EnableCraftSource.Value) return;
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated)
                return;
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance;
            if (rus == null) return;

            bool tradeActive = SafeActive(rus, TradeType);
            bool shredActive = SafeActive(rus, ShredderType);
            bool droneActive = SafeActive(rus, DroneHubType);
            if (!tradeActive && !shredActive && !droneActive) return; // 世界未就绪/三页未开=零重活

            var owner = FindDrawerOwner(rus);

            if (tradeActive)
            {
                if (owner != 0 && TabGate.DrawerVisibleFor("trade")) EnsureTrade(rus, owner); /* 批改二轮①：抽屉归类门（材料类外不补） */
                FixStaleTradeSizes(rus); // 首开快照竞态自愈（与抽屉页签无关，交易页常驻保健）
            }
            if (owner != 0 && shredActive) EnsureShredder(rus, owner);
            if (owner != 0 && droneActive && TabGate.DrawerVisibleFor("dronehub")) EnsureDroneHub(rus, owner);
        }
        catch (Exception e)
        {
            WarnOnce("poll", "抽屉页签轮询异常: " + e.Message);
        }
    }

    private static bool SafeActive(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, Il2CppSystem.Type t)
    {
        try { return rus.IsUIActive(t); } catch { return false; }
    }

    // ---- owner 发现（实机修正：首轮 BagCache 枚举静默零命中——Il2Cpp 字典 KeyValuePair
    //      枚举不可靠）。权威来源=WorkbenchDrawerConfig.DrawerOwnerId **编译期常量**（dump
    //      实证：静态类 cctor 直读，同类还有 DrawerBagId=5010 常量与 IsDrawerOwner()——mod
    //      读静态字段有 CraftSourceInjector 先例）。零发现歧义；档位=BagCache[owner] 现读
    //      （键已知 TryGetValue 可靠），未注册=本轮跳过（点了会 GetBagData 落空） ----
    //
    // ---- 冷启动注册机制（2026-11-06 反汇编取证定案，替代已证伪的 agent 扫描——抽屉无实体）：
    //      物品侧：读档期 ItemManager.StartBattle→LoadItemsFromSave（RVA 0x2789BF0）在
    //      0x278B023 读存档根字段 WorkbenchDrawerItems（偏移 0x328）逐件 AddItem 进
    //      ItemManager.Cache/OwnerCache——物品在世界加载完就绪，早于任何 UI；
    //      Redux 侧：首开工作台时 LeadingRole.OnWorkbenchDrawerOpen（0x314A360）只是调
    //      BattleLogicWorld._ItemManager（offset 0x78，与 [rax+0x78] 取法一致）的
    //      SyncWorkbenchDrawerToRedux()（**public**，RVA 0x279DA60）：内部 GetWorkbenchDrawerBagId()
    //      推档→dispatch Ac_Item_SetBag(DrawerOwnerId,档位)（Reducer_Data_Item.RA_SetBag 写
    //      BagCache）+GetItemDataList(owner) 逐件 ToDto dispatch（写 OwnerCache 物品行）——
    //      全程零 UI 依赖；WishManager.OnNavigateToWishItem 即为非工作台上下文的游戏自家调用先例。
    //      故本类在交易/粉碎机页打开后直调同一函数=游戏自己的完整装配路径，零手搓转换、幂等
    //      （游戏每次开抽屉都重跑该 Sync）。----
    private static int _tier; // 当前档位（FindDrawerOwner 现读，DrawerSize 消费）
    private static int _coldSyncAttempts; // 冷启动装配尝试次数（上限防病态轮询重打；成功即走快路径）

    private static long FindDrawerOwner(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        try
        {
            long owner = 0;
            try { owner = GameCore.HotUpdate.WorkbenchDrawerConfig.DrawerOwnerId; }
            catch (Exception ex) { WarnOnce("static-read", "DrawerOwnerId 静态常量读取异常: " + ex.Message); }
            if (owner == 0) { WarnOnce("static-zero", "DrawerOwnerId 常量读空（interop 静态字段不可达？）"); return 0; }

            var bagCache = StateItem(rus)?.BagCache;
            if (bagCache == null) { WarnOnce("cache-null", "State_Data_Item.BagCache 未就绪"); return 0; }
            int v = 0;
            bool has = false;
            try { has = bagCache.TryGetValue(owner, out v); } catch { }
            if (!has)
            {
                // 冷启动注册（终案）：BagCache 懒登记唯一断点=本会话未开过工作台。直调游戏装配函数
                // 补登（机制与 RVA 证据见类头注释），重读 BagCache 验收；最多 3 次防病态重试。
                if (_coldSyncAttempts < 3)
                {
                    _coldSyncAttempts++;
                    if (ColdStartSync())
                    {
                        try { has = bagCache.TryGetValue(owner, out v); } catch { }
                        if (has)
                            Log($"抽屉冷启动注册：直调 ItemManager.SyncWorkbenchDrawerToRedux() 成功，BagCache[0x{owner:X}]={v}（游戏自身装配，档位+物品行一次到位）");
                    }
                }
                if (!has)
                {
                    WarnOnce("not-registered", $"抽屉 owner=0x{owner:X} 未注册进 BagCache 且冷启动装配未成（尝试 {_coldSyncAttempts}/3）");
                    return 0;
                }
            }
            if (Array.IndexOf(RailUi.DrawerBagIds, v) < 0)
            {
                WarnOnce("tier-miss", $"抽屉 BagCache 值 {v} 不在三档 {string.Join("/", RailUi.DrawerBagIds)} 内（升级链变动？）");
                return 0;
            }
            _tier = v;
            return owner;
        }
        catch (Exception e)
        {
            WarnOnce("find", "抽屉 owner 发现异常: " + e.Message);
            return 0;
        }
    }

    /// <summary>直调游戏装配函数（私有/内部成员直调有 ToolTableProbe/RefreshCoalescer 先例；本函数为
    /// public 更无碍）。取 BattleLogicWorld._ItemManager（internal 属性，interop 可达，_AgentManager
    /// 同款先例）→ SyncWorkbenchDrawerToRedux()。任何异常=返回 false，页签缺席零崩溃。</summary>
    private static bool ColdStartSync()
    {
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.Battle.Logic.BattleLogicWorld>.IsInstanceCreated)
                return false;
            var im = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.Battle.Logic.BattleLogicWorld>.Instance?._ItemManager;
            if (im == null) { WarnOnce("im-null", "BattleLogicWorld._ItemManager 未就绪（世界未加载完？）"); return false; }
            im.SyncWorkbenchDrawerToRedux();
            return true;
        }
        catch (Exception e)
        {
            WarnOnce("coldsync", "抽屉冷启动装配直调异常: " + e.Message);
            return false;
        }
    }

    private static State_Data_Item StateItem(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        try
        {
            var dataTree = rus?.reduxStoreLayer?.dataTree;
            GameCore.HotUpdate.ReduxUI.BaseReduxState raw = null;
            dataTree?.TryGetValue(Il2CppInterop.Runtime.Il2CppType.From(typeof(State_Data_Item)), out raw);
            return raw?.TryCast<State_Data_Item>();
        }
        catch { return null; }
    }

    /// <summary>抽屉当前档位尺寸（Trade 页签条目要带 cols/rows；取不到兜底 8×7）。</summary>
    private static (int cols, int rows) DrawerSize()
    {
        try
        {
            var bags = SurvivalLog.ModShared.BagTable.BagDict(SurvivalLog.ModShared.BagTable.Cm());
            if (bags != null && bags.TryGetValue(_tier, out var b) && b != null && b.Size != null && b.Size.Count >= 2)
                return (b.Size[0], b.Size[1]);
        }
        catch { }
        return (8, 7);
    }

    // ---- Trade：BagTabs POCO 平字段直填 ----
    private static void EnsureTrade(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, long owner)
    {
        try
        {
            var tabs = rus.GetStateByUI(TradeType)?.TryCast<State_Web_TradeUI>()?.BagTabs;
            if (tabs == null || tabs.Count == 0) { WarnOnce("trade-empty", "交易页 BagTabs 空/未就绪（官方首推后再补）"); return; }
            for (int i = 0; i < tabs.Count; i++)
            {
                try { if (tabs[i] != null && tabs[i].owner == owner) return; } catch { }
            }
            var (cols, rows) = DrawerSize();
            var e = new State_Web_TradeUI.BagTabEntry
            {
                owner = owner, name = DrawerName, fridge = false, player = false,
                cols = cols, rows = rows, rack = false, rackCfg = 0, pin = false,
            };
            tabs.Add(e);
            Log($"交易页签已补：{DrawerName}(owner=0x{owner:X} {cols}×{rows})——手动搬运语义，重开界面自动收敛");
            TabInjector.Repush(rus, TradeType);
        }
        catch (Exception e)
        {
            WarnOnce("trade", "交易页抽屉页签注入异常: " + e.Message);
        }
    }

    // ---- Shredder：CartTabs R3.ReactiveProperty 族（TabInjector bag×4 构造同款） ----
    private static void EnsureShredder(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, long owner)
    {
        try
        {
            var tabs = rus.GetStateByUI(ShredderType)?.TryCast<State_Web_Shredder>()?.CartTabs;
            if (tabs == null || tabs.Count == 0) { WarnOnce("shredder-empty", "粉碎机页 CartTabs 空/未就绪"); return; }
            for (int i = 0; i < tabs.Count; i++)
            {
                try { if (tabs[i] != null && (tabs[i].OwnerId?.Value ?? 0) == owner) return; } catch { }
            }
            var tab = new Data_Web_Shredder_Tab
            {
                Index = tabs.Count,
                OwnerId = new R3.ReactiveProperty<long>(owner),
                Name = new R3.ReactiveProperty<string>(DrawerName),
                IsNew = new R3.ReactiveProperty<bool>(false),
                IsRack = new R3.ReactiveProperty<bool>(false),
                FurnitureConfigId = 0,
            };
            tabs.Add(tab);
            Log($"粉碎机页签已补：{DrawerName}(owner=0x{owner:X})——cart 索引制尾插，TabGate 重排自动维护位次");
            TabInjector.Repush(rus, ShredderType);
        }
        catch (Exception e)
        {
            WarnOnce("shredder", "粉碎机页抽屉页签注入异常: " + e.Message);
        }
    }

    // ---- DroneHub 调度机队（bag 族 ownerId 制：Data_Web_DroneHub_BagTab=Index/OwnerId/Name/Locked，无 cols/rows） ----
    private static void EnsureDroneHub(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus, long owner)
    {
        try
        {
            var tabs = rus.GetStateByUI(DroneHubType)?.TryCast<State_Web_DroneHub>()?.BagTabs;
            if (tabs == null || tabs.Count == 0) { WarnOnce("dronehub-empty", "调度机队页 BagTabs 空/未就绪"); return; }
            for (int i = 0; i < tabs.Count; i++)
            {
                try { if (tabs[i] != null && (tabs[i].OwnerId?.Value ?? 0) == owner) return; } catch { }
            }
            var tab = new Data_Web_DroneHub_BagTab
            {
                Index = tabs.Count,
                OwnerId = new R3.ReactiveProperty<long>(owner),
                Name = new R3.ReactiveProperty<string>(DrawerName),
                Locked = new R3.ReactiveProperty<bool>(false),
            };
            tabs.Add(tab);
            Log($"调度机队页签已补：{DrawerName}(owner=0x{owner:X})——bag 族 ownerId 制尾插");
            TabInjector.Repush(rus, DroneHubType);
        }
        catch (Exception e)
        {
            WarnOnce("dronehub", "调度机队页抽屉页签注入异常: " + e.Message);
        }
    }

    /// <summary>
    /// 交易页签快照宽度自愈（作者实测：直接开交易首帧全回原宽、重开恢复）：官方收集器抄
    /// Config_Bag.Size 进 BagTabEntry.cols/rows 的时机早于 SizeEngine 改写（读档装载期收集）
    /// → 首开页签带旧快照。逐条对账 live 配置（owner→BagCache→Config_Bag.Size），失配即改
    /// + Repush；幂等（全对=零写零推送）。与抽屉页签独立（owner 为空也跑）。
    /// </summary>
    private static void FixStaleTradeSizes(GameCore.HotUpdate.ReduxUI.ReduxUISystem rus)
    {
        try
        {
            var tabs = rus.GetStateByUI(TradeType)?.TryCast<State_Web_TradeUI>()?.BagTabs;
            if (tabs == null || tabs.Count == 0) return;
            var bagCache = StateItem(rus)?.BagCache;
            var bags = SurvivalLog.ModShared.BagTable.BagDict(SurvivalLog.ModShared.BagTable.Cm());
            if (bagCache == null || bags == null) return;

            int healed = 0;
            for (int i = 0; i < tabs.Count; i++)
            {
                var t = tabs[i];
                if (t == null) continue;
                int cfgId = 0;
                try { if (!bagCache.TryGetValue(t.owner, out cfgId) || cfgId == 0) continue; } catch { continue; }
                try
                {
                    if (!bags.TryGetValue(cfgId, out var b) || b?.Size == null || b.Size.Count < 2) continue;
                    int c = b.Size[0], r = b.Size[1];
                    if (t.cols != c || t.rows != r) { t.cols = c; t.rows = r; healed++; }
                }
                catch { }
            }
            if (healed > 0)
            {
                Log($"交易页签快照宽度自愈：修正 {healed} 条（首开收集早于柜宽改写=旧快照，live 配置对账）");
                TabInjector.Repush(rus, TradeType);
            }
        }
        catch (Exception e)
        {
            WarnOnce("stale", "交易页签宽度自愈异常: " + e.Message);
        }
    }
}
