using System;
using System.Collections.Generic;
using System.Text;
using GameCore.HotUpdate;
using GameCore.HotUpdate.Battle.Logic;
using GameCore.HotUpdate.ReduxUI;
using Il2CppInterop.Runtime;
using Il2CppInterop.Runtime.InteropTypes.Arrays;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// TradeFx 取数壳（批1-2 全模式）：AccessTicker 0.5s 快轮 + Refresh postfix 事件驱动
/// （TradeFxRefreshHook）读 State_Web_TradeUI → TfxModel → JSON → __CERAIL_TRADEFX__ 通道。
/// 数值纪律=官方算子直调（EvaluateState/ResolveTakeTradeValue/ConvertItem/CampGainOf/
/// DonateSatietyOf/CollectDispatchTake/BuildCommissionReward/GetDefRsGift），零复刻零漂移。
/// 模式：trade（chips/bar/items/shelf）/ supply|camp（补给量+药品总计 B10）/ donate（饱腹）/
/// request（派送：+N 差分 B7+需求行 B8+奖励 B9+objects）。签名门控=7 源逐值+ItemDataList 引用。
/// 异常纪律：warn-once（消息去重）+ Disabled 自禁，不影响 rail 其他功能。
/// </summary>
internal static class TradeFx
{
    internal static bool Disabled;
    internal static string LastJson;            // 推送幂等基准（同串不推）

    private static string _lastSig;
    private static Il2CppSystem.Collections.Generic.List<Data_Item> _lastItems;
    private static bool _wasLive;               // 关窗沿：live→死 只推一次 none
    private static bool _refreshRequested;      // 官方 Refresh 事件沿（postfix 置位，FastPoll 消费）
    private static readonly HashSet<string> _warned = new();

    internal static void Poll()
    {
        if (Disabled || !RailUi.Enabled) return;
        try
        {
            var rus = BaseSingleton<ReduxUISystem>.IsInstanceCreated ? BaseSingleton<ReduxUISystem>.Instance : null;
            var st = rus?.GetStateByUI(Il2CppType.From(typeof(WebUI_TradeUI)))?.TryCast<State_Web_TradeUI>();
            bool live = st != null && st.OwnerId != 0;
            string phase = null;
            if (live) { try { phase = st.Phase?.Value; } catch { } }
            if (live && phase == "roster") live = false; // 回应求助名单页=无渲染（v1.9.2 同口径）

            if (!live)
            {
                if (!_wasLive) return;                    // 早已关窗：无事可做
                _wasLive = false;
                _lastSig = "dead";
                _lastItems = null;
                Publish(TradeFxJson.Build(new TfxModel { Mode = "none" }));
                return;
            }

            var items = st.ItemDataList;
            string sig = Sig(st, phase, items);
            bool retry = _reqEmptyRetry > 0;
            if (!retry && sig == _lastSig && ReferenceEquals(items, _lastItems)) return; // 门控：静置零重算零推送
            if (retry) _reqEmptyRetry--;
            _lastSig = sig;
            _lastItems = items;

            string json = Build(st, phase);
            // 奖池竞态（十一批定谳+十二批补杠杆）：频道奖励=运行时委托计算（DeliveryPool.DefRs），
            // 非配置表（127 表无 6612x 键）——只有官方派送数据链跑过才存在。切柜子之所以有效=
            // 触发 Ac_TradeUI_RefreshBag（TabGate 同款官方杠杆）。空奖励时我们主动发同一动作
            // 驱动灌载：每空窗发 1 次（≤2 次/窗），最多 3 窗后静默放弃（防刷新风暴），得数即复位。
            if (_lastModel != null && _lastModel.Mode == "request" && _lastModel.Rewards.Count == 0)
            {
                if (_reqEmptyRetry == 0 && _reqEmptyEpochs < 3)
                {
                    _reqEmptyRetry = 8;
                    _reqEmptyEpochs++;
                    if (_reqRefreshSends < 2)
                    {
                        _reqRefreshSends++;
                        try { Ac_TradeUI_RefreshBag.SendAction(); } catch { }
                    }
                }
            }
            else if (_lastModel == null || _lastModel.Mode != "request" || _lastModel.Rewards.Count > 0)
            {
                _reqRefreshSends = 0;
                _reqEmptyEpochs = 0;
            }
            if (json == null) { _lastSig = null; return; } // 瞬时缺件：下轮重试
            _wasLive = true;
            Publish(json);
        }
        catch (Exception e)
        {
            WarnOnce("TradeFx poll failed: " + e.Message);
            Disabled = true;
        }
    }

    /// <summary>官方 Reducer_Web_TradeUI.Refresh postfix 入口（第 4 个 patch）：
    /// 只置事件位，AccessTicker.Update 每帧的 FastPoll 消费——官方状态落定即推。</summary>
    internal static void OnOfficialRefresh()
    {
        _refreshRequested = true;
    }

    /// <summary>每帧（AccessTicker.Update）：有官方刷新事件且签名有变 → 立即重建推送；无事零开销。</summary>
    internal static void FastPoll()
    {
        if (Disabled || !_refreshRequested) return;
        _refreshRequested = false;
        Poll();
    }

    /// <summary>WebView 重建/页面重载沿（RailUi bootstrap 确认沿调用，与 ForceRepublish 同钩；
    /// 终审 I4）：JS 侧 TFX 状态被清空而 C# 门控仍命中 → 复位签名/幂等基准，下轮 Poll 重推。
    /// 只写三个静态引用，不碰游戏数据（回调线程红线 1）。_wasLive 不动（防伪 none 沿）。</summary>
    internal static void OnWebViewRebuilt()
    {
        _lastSig = null;
        _lastItems = null;
        LastJson = null;
    }

    /// 推送（批1 Task 3）：同串不推（幂等）；小包直推、>7.5KB 分块（自有 pid 空间
    /// 起点 1e9 与 rail 序列隔离，乱序免疫协议同 RailUi.PushIfDue）；必须带回调重载
    /// （RailUi.cs:401 单参静默丢弃实机铁证，自建空回调不喂 rail 看门狗账本——终审 I3）。
    private static void Publish(string json)
    {
        if (string.IsNullOrEmpty(json) || json == LastJson) return;
        LastJson = json;
        var web = RailUi.ActiveWebView;
        if (web == null) return; // WebView 暂不可得：LastJson 已记，签名再变才重推（开窗沿必变）
        try
        {
            if (_ack == null)
                _ack = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<Il2CppSystem.Action<string>>(new Action<string>(AckNoop));
            const int Chunk = 7500;
            if (json.Length <= Chunk)
            {
                web.ExecuteJavaScript("window.__CERAIL_TRADEFX__&&window.__CERAIL_TRADEFX__(" + json + ")",
                    _ack);
            }
            else
            {
                long pid = System.Threading.Interlocked.Increment(ref _chunkPid);
                int total = (json.Length + Chunk - 1) / Chunk;
                for (int i = 0; i < total; i++)
                {
                    int take = Math.Min(Chunk, json.Length - i * Chunk);
                    web.ExecuteJavaScript("window.__CERAIL_TRADEFX__&&window.__CERAIL_TRADEFX_CHUNK__(" + pid + "," + i + "," + total + ",\"" +
                        RailUi.EscapeJs(json.Substring(i * Chunk, take)) + "\")", _ack);
                }
            }
            if (CabinetEverywherePlugin.Verbose?.Value == true)
                CabinetEverywherePlugin.Log?.LogInfo(
                    "[TradeFx] 推送 " + json.Length + " 字符：head " + json.Substring(0, Math.Min(100, json.Length)));
        }
        catch (Exception e) { WarnOnce("push failed: " + e.Message); }
    }
    private static long _chunkPid = 1_000_000_000;
    private static Il2CppSystem.Action<string> _ack;
    private static void AckNoop(string s) { } // 纯空转：只为走「带回调」可达通道（红线1 不碰数据）

    // ================= 模型构建（四模式） =================

    private static string Build(State_Web_TradeUI st, string phase)
    {
        var cfg = BaseSingleton<ConfigManager>.Instance;
        if (cfg == null) return null;

        string mode = "trade";
        if (st.IsWhDonate) mode = "donate";
        else if (st.IsSupply) mode = "supply";
        else if (st.IsDispatch) mode = "request";

        var m = new TfxModel { Mode = mode };
        var give = Reducer_Web_TradeUI.ParseGive(st.GiveJson);
        var giveIds = new HashSet<long>();
        if (give != null)
            for (int i = 0; i < give.Count; i++)
                if (give[i] != null) giveIds.Add(give[i].id);

        if (mode == "trade") BuildTrade(st, cfg, give, giveIds, m);
        else if (mode == "supply") BuildSupply(st, cfg, giveIds, m);
        else if (mode == "donate") BuildDonate(st, cfg, m);
        else BuildRequest(st, cfg, give, giveIds, m);

        _lastModel = m;
        return TradeFxJson.Build(m);
    }
    private static TfxModel _lastModel;
    private static int _reqRefreshSends; // 每空窗官方刷新发送数（≤2）
    private static int _reqEmptyEpochs;  // 空窗总数（≤3 防风暴）
    private static int _reqEmptyRetry; // 奖池空重试窗（实机批改十一批：StrangerSupportManager 奖池
    // 游戏侧异步灌——开页首推常空，签名门控不覆盖该源=死到下一签名变化（作者实报须切柜子才出）。
    // request 态 rewards/requests 为空时连续 8 轮（≈4s）无视门控重查，灌好即捕获；非空即复位。

    /// <summary>trade：chips（A3）+ 天平（A4）+ 每格官方单件值（A1）+ 货架单价（A5）。</summary>
    private static void BuildTrade(State_Web_TradeUI st, ConfigManager cfg,
        Il2CppSystem.Collections.Generic.List<State_Web_TradeUI.GiveEntry> give, HashSet<long> giveIds, TfxModel m)
    {
        var t = new TfxTrader
        {
            DemandCategory = st.DemandCategory,
            DemandCategoryMask = st.DemandCategoryMask,
            Boost = st.Boost,
            BoostMax = st.BoostMax,
            HalfValueCategory = st.HalfValueCategory,
            AidDemandCategory = st.AidDemandCategory,
            IsTradeRunPoint = st.NpcId < 1 && st.ShelfShopId > 0,
        };
        try { t.HalfRate = Reducer_Web_TradeUI.ResolveSelfStockValueRate(); } catch { }

        var picks = Reducer_Web_TradeUI.ParsePicks(st.PicksJson);

        // A4：官方整笔算账（GivenValue=你给出；Threshold=成交线）；门控=官方值>0 或勾选
        var bal = Reducer_Web_TradeUI.EvaluateState(st, give, picks);
        bool picked = false;
        int goods = 0;
        if (picks != null)
            foreach (var kv in picks)
            {
                if (kv.Value < 1) continue;
                var ci = cfg.Get_Config_Item(kv.Key);
                if (ci == null) continue;
                picked = true;
                try { goods += kv.Value * Reducer_Web_TradeUI.ResolveTakeTradeValue(st, ci) * Math.Max(1, ci.UseTimes); } catch { }
            }
        if (picked || bal.GivenValue > 0.5f)
            m.Bar = (TradeFxMath.Shown(bal.GivenValue), goods, bal.Threshold, picked);

        // A3：wants/half chips（mask 多类别口径；倍率=MultText 小数）
        var wants = new List<(string, string)>();
        string mult = TradeFxMath.MultText(1f + TradeFxMath.ClampedBoost(t));
        for (int c = 1; c < 32; c++)
            if (TradeFxMath.IsWanted(c, t))
                wants.Add((CatName(c), mult));
        if (t.HalfValueCategory > 0 && t.HalfValueCategory != t.AidDemandCategory && t.HalfRate < 1f)
            m.Half.Add((CatName(t.HalfValueCategory), TradeFxMath.MultText(t.HalfRate)));
        m.Wants = wants;

        // A1：每格官方单件值（EvaluateState 给一件空 picks）+ 色调/因子文本
        var oneGive = new Il2CppSystem.Collections.Generic.List<State_Web_TradeUI.GiveEntry>();
        var emptyPicks = new Il2CppSystem.Collections.Generic.Dictionary<int, int>();
        int itemTry = 0, itemFail = 0;
        if (st.ItemDataList != null)
            for (int i = 0; i < st.ItemDataList.Count; i++)
            {
                var it = st.ItemDataList[i];
                if (it == null || it.ItemConfigId == 0) continue;
                var ci = cfg.Get_Config_Item(it.ItemConfigId);
                if (ci == null) continue;
                itemTry++;
                oneGive.Clear();
                oneGive.Add(new State_Web_TradeUI.GiveEntry { id = it.LogicId });
                float v;
                try { v = Reducer_Web_TradeUI.EvaluateState(st, oneGive, emptyPicks).GivenValue; }
                catch (Exception ex) { itemFail++; if (itemFail == 1) WarnOnce("[TradeFx] 单件 EvaluateState 失败（首例 " + it.LogicId + "）: " + ex.Message); continue; }
                bool wanted = TradeFxMath.IsWanted(ci.Category, t);
                string tone = wanted ? "w"
                    : (ci.Category == t.HalfValueCategory && ci.Category != t.AidDemandCategory) || (t.IsTradeRunPoint && ci.TradeSellRate > 0f && ci.TradeSellRate < 1f) ? "l" : "f";
                string mu = wanted ? mult : null;
                string u = it.MaxUseTimes > 0 ? it.UseTimes + "/" + it.MaxUseTimes
                    : (it.UseTimes > 1 && ci.UseTimes > 1 ? it.UseTimes + "/" + ci.UseTimes : null);
                m.Items.Add((it.LogicId, TradeFxMath.Shown(v), tone, mu, u));
            }
        if (itemTry > 0 && itemFail == itemTry)
            WarnOnce("[TradeFx] 单件 EvaluateState 全败（" + itemFail + "/" + itemTry + "）——items 徽章不可用，须回 gamekb 复核单件调用形状");

        // A5：货架单价
        try
        {
            if (st.ShelfSnapshotJson != null)
                foreach (var kv in Reducer_Web_TradeUI.ParsePicks(st.ShelfSnapshotJson))
                {
                    var ci = cfg.Get_Config_Item(kv.Key);
                    if (ci == null) continue;
                    try { m.Shelf.Add((kv.Key, Reducer_Web_TradeUI.ResolveTakeTradeValue(st, ci) * Math.Max(1, ci.UseTimes), ci.UseTimes > 1 ? ci.UseTimes + "次" : null)); } catch { }
                }
        }
        catch { }
    }

    /// <summary>supply/camp（B10 同源）：每格补给量（官方 ConvertItem/CampGainOf），选中 give 药品总计。</summary>
    private static void BuildSupply(State_Web_TradeUI st, ConfigManager cfg, HashSet<long> giveIds, TfxModel m)
    {
        bool camp = false;
        try
        {
            var targets = Reducer_Web_TradeUI.ParseSupplyTargets(st.SupplyTargetsRaw);
            camp = targets != null && Reducer_Web_TradeUI.FindCampRow(targets, st.NpcId) != null;
        }
        catch { }
        m.Mode = camp ? "camp" : "supply";

        int medicine = 0;
        if (st.ItemDataList != null)
            for (int i = 0; i < st.ItemDataList.Count; i++)
            {
                var it = st.ItemDataList[i];
                if (it == null || it.ItemConfigId == 0) continue;
                var ci = cfg.Get_Config_Item(it.ItemConfigId);
                if (ci == null) continue;
                int amount;
                string kind = null;
                if (camp)
                {
                    try
                    {
                        int k = 0;
                        amount = Reducer_Web_TradeUI.CampGainOf(it, ci, out k);
                        kind = k == 0 ? "satiety" : k == 2 ? "material" : "fuel";
                    }
                    catch (Exception ex) { WarnOnce("[TradeFx] CampGainOf 失败: " + ex.Message); continue; }
                }
                else
                {
                    try
                    {
                        float uses = Reducer_Web_TradeUI.EffectiveUses(it, ci);
                        amount = GameCore.HotUpdate.StrangerTrade.SupplyLevelRules.ConvertItem(it.ItemConfigId, it.ItemCount, uses, out var dim);
                        int d = (int)dim;
                        kind = d == 0 ? "satiety" : d == 1 ? "seed" : d == 2 ? "material" : d == 3 ? "fuel" : d == 4 ? "medicine" : null;
                    }
                    catch (Exception ex) { WarnOnce("[TradeFx] ConvertItem 失败: " + ex.Message); continue; }
                }
                if (amount <= 0) { m.Items.Add((it.LogicId, 0, "d", null, null)); continue; }
                m.Items.Add((it.LogicId, amount, kind == "medicine" ? "w" : "f", null, null));
                if (!camp && kind == "medicine" && giveIds.Contains(it.LogicId))
                    medicine += amount;
            }
        if (!camp && medicine > 0) m.Medicine = medicine;
    }

    /// <summary>donate：每格官方饱腹贡献（DonateSatietyOf）。</summary>
    private static void BuildDonate(State_Web_TradeUI st, ConfigManager cfg, TfxModel m)
    {
        if (st.ItemDataList == null) return;
        for (int i = 0; i < st.ItemDataList.Count; i++)
        {
            var it = st.ItemDataList[i];
            if (it == null || it.ItemConfigId == 0) continue;
            var ci = cfg.Get_Config_Item(it.ItemConfigId);
            if (ci == null) continue;
            try
            {
                float v = Reducer_Web_TradeUI.DonateSatietyOf(it, ci);
                m.Items.Add((it.LogicId, TradeFxMath.Shown(v), v > 0 ? "f" : "d", null, null));
            }
            catch { }
        }
    }

    /// <summary>request（B7/8/9）：+N 官方差分（CollectDispatchTake 去一件/加一件）+ 需求行 + 奖励 + objects。</summary>
    private static void BuildRequest(State_Web_TradeUI st, ConfigManager cfg,
        Il2CppSystem.Collections.Generic.List<State_Web_TradeUI.GiveEntry> give, HashSet<long> giveIds, TfxModel m)
    {
        Reducer_Web_TradeUI.DispPayload payload = null;
        Reducer_Web_TradeUI.DispTarget target = null;
        try
        {
            payload = Reducer_Web_TradeUI.ParseDispatch(st.DispatchRaw);
            target = payload != null ? Reducer_Web_TradeUI.FindDispTarget(payload, st.DispSelKind, st.DispSelId) : null;
        }
        catch (Exception ex) { WarnOnce("[TradeFx] ParseDispatch 失败: " + ex.Message); }

        // 差分基线（官方 CollectDispatchTake：Add=各需求行增量，Accepted=收纳集合）
        int[] baseAdd = null;
        var accepted = new HashSet<long>();
        try
        {
            var take = Reducer_Web_TradeUI.CollectDispatchTake(st, give);
            if (take != null)
            {
                accepted = ToManaged(take.Accepted);
                baseAdd = ToManaged(take.Add);
            }
        }
        catch (Exception ex) { WarnOnce("[TradeFx] CollectDispatchTake 基线失败（+N 不可用）: " + ex.Message); }

        // hints id 集（投放可达物）
        var hintIds = new HashSet<long>();
        try
        {
            if (target?.hints != null)
                for (int i = 0; i < target.hints.Count; i++)
                    if (target.hints[i] != null) hintIds.Add(target.hints[i].id);
        }
        catch { }

        if (st.ItemDataList != null && baseAdd != null)
            for (int i = 0; i < st.ItemDataList.Count; i++)
            {
                var it = st.ItemDataList[i];
                if (it == null || it.ItemConfigId == 0) continue;
                try
                {
                    int[] alt = null;
                    bool ok = false;
                    if (giveIds.Contains(it.LogicId) && accepted.Contains(it.LogicId))
                    {
                        // 去一件：give 列表剔除本件再算
                        var less = new Il2CppSystem.Collections.Generic.List<State_Web_TradeUI.GiveEntry>();
                        for (int j = 0; j < give.Count; j++)
                            if (give[j] != null && give[j].id != it.LogicId) less.Add(give[j]);
                        var take = Reducer_Web_TradeUI.CollectDispatchTake(st, less);
                        alt = ToManaged(take?.Add); ok = alt != null;
                    }
                    else if (hintIds.Contains(it.LogicId))
                    {
                        var more = new Il2CppSystem.Collections.Generic.List<State_Web_TradeUI.GiveEntry>();
                        for (int j = 0; j < give.Count; j++) if (give[j] != null) more.Add(give[j]);
                        more.Add(new State_Web_TradeUI.GiveEntry { id = it.LogicId });
                        var take = Reducer_Web_TradeUI.CollectDispatchTake(st, more);
                        ok = ToManaged(take?.Accepted)?.Contains(it.LogicId) == true;
                        alt = ToManaged(take?.Add);
                    }
                    if (!ok || alt == null || alt.Length != baseAdd.Length) { m.Items.Add((it.LogicId, 0, "d", null, null)); continue; }
                    int first = 0; string p = null;
                    for (int d = 0; d < alt.Length; d++)
                    {
                        int add = alt[d] - baseAdd[d];
                        if (add > 0)
                        {
                            first += add;
                            if (p == null && target?.demands != null && d < target.demands.Count) p = target.demands[d]?.text;
                        }
                    }
                    m.Items.Add((it.LogicId, first, first > 0 ? "f" : "d", p, null));
                }
                catch { m.Items.Add((it.LogicId, 0, "d", null, null)); }
            }

        // 需求行（B8）+ 物品溯源 + objects（官方 AppendShelfJson）+ 奖励（B9）
        var objs = new Dictionary<int, string>();
        try
        {
            if (payload?.targets != null)
                for (int i = 0; i < payload.targets.Count; i++)
                {
                    var tg = payload.targets[i];
                    if (tg == null || tg.kind == 2 || tg.demands == null || tg.demands.Count == 0) continue;
                    var rows = new List<(int, int, bool, int)>();
                    for (int j = 0; j < tg.demands.Count; j++)
                    {
                        var dm = tg.demands[j];
                        rows.Add((dm?.need ?? 0, dm?.paid ?? 0, dm?.done ?? false, 0));
                    }
                    var lines = RequestLines(tg.kind, tg.id);
                    if (lines != null && lines.Count == rows.Count)
                        for (int j = 0; j < lines.Count; j++)
                        {
                            var ln = lines[j];
                            if (ln != null && ln.Value.Kind == 0 && ln.Value.ItemId > 0 &&
                                (ln.Value.PickIds == null || ln.Value.PickIds.Length == 0 ||
                                 (ln.Value.PickIds.Length == 1 && ln.Value.PickIds[0] == ln.Value.ItemId)))
                            {
                                int cid = ln.Value.ItemId;
                                var row = rows[j]; rows[j] = (row.Item1, row.Item2, row.Item3, cid);
                                AppendObject(cfg, objs, cid);
                            }
                        }
                    m.Requests.Add((tg.kind, tg.id, rows));

                    try
                    {
                        Dictionary<int, int> rw = null;
                        if (tg.kind == 1 && tg.no > 0)
                        {
                            var apm = BaseSingleton<BattleLogicWorld>.Instance?._AidPlatformManager;
                            if (apm != null) rw = ToManaged(AidPlatformManager.BuildCommissionReward(tg.no));
                        }
                        else if (tg.kind == 4 && tg.id >= 1000)
                        {
                            var ssm = BaseSingleton<BattleLogicWorld>.Instance?._StrangerSupportManager;
                            if (ssm != null)
                                rw = ToManaged(StrangerSupportManager.GetDefRsGift(StrangerSupportManager.AidChannelDefRs(tg.id - 1000)));
                        }
                        if (rw != null && rw.Count > 0)
                        {
                            var rl = new List<(int, int)>();
                            foreach (var kv in rw)
                                if (kv.Key > 0 && kv.Value > 0) { rl.Add((kv.Key, kv.Value)); AppendObject(cfg, objs, kv.Key); }
                            if (rl.Count > 0) m.Rewards.Add((tg.kind, tg.id, rl));
                        }
                    }
                    catch (Exception ex) { WarnOnce("[TradeFx] 奖励溯源失败: " + ex.Message); }
                }
        }
        catch (Exception ex) { WarnOnce("[TradeFx] 需求行构建失败: " + ex.Message); }
        foreach (var kv in objs) m.Objects.Add((kv.Key, kv.Value));
    }

    private static List<(int Kind, int ItemId, int[] PickIds)?> RequestLines(int kind, int id)
    {
        try
        {
            if (kind == 1)
            {
                var apm = BaseSingleton<BattleLogicWorld>.Instance?._AidPlatformManager;
                var req = apm != null ? apm.FindRequest(id) : null;
                if (req?.Demands == null) return null;
                var l = new List<(int, int, int[])?>();
                for (int i = 0; i < req.Demands.Count; i++)
                {
                    var d = req.Demands[i];
                    l.Add(d == null ? null : (d.Kind, d.ItemId, null));
                }
                return l;
            }
            if (kind == 4 && id >= 1000)
            {
                var ssm = BaseSingleton<BattleLogicWorld>.Instance?._StrangerSupportManager;
                var spec = ssm != null ? StrangerSupportManager.GetPoolSpec(ssm.AidChannelPool, id - 1000) : null;
                if (spec?.Lines == null) return null;
                var l = new List<(int, int, int[])?>();
                for (int i = 0; i < spec.Lines.Count; i++)
                {
                    var d = spec.Lines[i];
                    if (d == null) { l.Add(null); continue; }
                    var picks = new List<int>();
                    if (d.PickIds != null) foreach (var p in d.PickIds) picks.Add(p);
                    l.Add(((int)d.Kind, d.ItemId, picks.ToArray()));
                }
                return l;
            }
        }
        catch (Exception ex) { WarnOnce("[TradeFx] 需求行溯源失败: " + ex.Message); }
        return null;
    }

    /// <summary>官方 AppendShelfJson 造物品对象（tooltip/图标源），幂等去重。</summary>
    private static void AppendObject(ConfigManager cfg, Dictionary<int, string> objs, int cid)
    {
        if (objs.ContainsKey(cid)) return;
        try
        {
            var ci = cfg.Get_Config_Item(cid);
            if (ci == null) return;
            var sb = new Il2CppSystem.Text.StringBuilder();
            bool first = true;
            Reducer_Web_TradeUI.AppendShelfJson(sb, ref first, cid, ci, 1, 1, false);
            string json = sb.ToString();
            if (!string.IsNullOrEmpty(json) && json[0] == '{') objs[cid] = json;
        }
        catch (Exception ex) { WarnOnce("[TradeFx] AppendShelfJson 失败（cid=" + cid + "）: " + ex.Message); }
    }

    private static int[] ToManaged(Il2CppStructArray<int> a)
    {
        if (a == null) return null;
        var r = new int[a.Length];
        for (int i = 0; i < a.Length; i++) r[i] = a[i];
        return r;
    }

    private static HashSet<long> ToManaged(Il2CppSystem.Collections.Generic.HashSet<long> h)
    {
        var r = new HashSet<long>();
        if (h == null) return r;
        try { foreach (var v in h) r.Add(v); } catch { }
        return r;
    }

    private static Dictionary<int, int> ToManaged(Il2CppSystem.Collections.Generic.Dictionary<int, int> d)
    {
        var r = new Dictionary<int, int>();
        if (d == null) return r;
        try { foreach (var kv in d) r[kv.Key] = kv.Value; } catch { }
        return r;
    }

    private static string CatName(int category)
    {
        try
        {
            string n = Reducer_Web_TradeUI.CategoryDisplayName(category);
            return string.IsNullOrEmpty(n) ? category.ToString() : n;
        }
        catch { return category.ToString(); }
    }

    private static string Sig(State_Web_TradeUI st, string phase, Il2CppSystem.Collections.Generic.List<Data_Item> items)
    {
        var sb = new StringBuilder(160);
        sb.Append(st.OwnerId).Append('|').Append(phase ?? string.Empty).Append('|')
          .Append(st.GiveJson).Append('|').Append(st.PicksJson).Append('|')
          .Append(st.ShelfSnapshotJson).Append('|').Append(st.DispatchRaw).Append('|')
          .Append(st.SupplyTargetsRaw).Append('|').Append(items?.Count ?? -1);
        return sb.ToString();
    }

    private static void WarnOnce(string text)
    {
        if (_warned.Add(text)) CabinetEverywherePlugin.Log.LogWarning("[TradeFx] " + text);
    }
}
