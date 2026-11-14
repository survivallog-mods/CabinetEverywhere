using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using GameCore.HotUpdate;
using GameCore.HotUpdate.ReduxUI;
using Il2CppInterop.Runtime;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 篮子救援 glist 取数壳（spec 2026-11-09-basket-glist-design §4 B'/§5.1）：AccessTicker
/// 0.5s 快轮读 State_Web_BackpackUI 篮子态 → 官方算子直调差分逐行边际分 → BktModel →
/// BasketAid.BuildJson → BasketJson（RailData 契约 ctx.basket 页条件字段消费，Task 2 接线）。
/// 数值纪律=官方算子直调零复刻：NeighborRules.CalcSendProgress / CalcCrisisResolveProgress /
/// IsBasketForbidItem / Reducer_Web_TradeUI.CategoryDisplayName（dying chip 名）。
/// SelfCheck：CalcSendProgress(篮内现有内容) 与官方 wishJson gain 对账 |Δ|≤0.5（组合层双保险），
/// 超差 warn-once（按窗去重）+ scores 置空（JS 退无分值形态：chips 留、徽章/排序牌隐）。
/// 签名门控：wishJson/snap 关键值/ItemDataList_B 逐件/B 侧引用逐值比较（Il2Cpp 字符串引用
/// 恒不等必须 ordinal）；异常纪律=warn-once + Disabled 自禁，不影响 rail 其他功能。
/// </summary>
internal static class BasketGlist
{
    /// <summary>cfg 门（Task 2 接 EnableGlistBasket；本壳先恒 true 保持独立可编译）。</summary>
    internal static bool CfgOn = true;
    /// <summary>门结果：篮子窗在场且可服务（RailData glistOn@BackpackUI 消费）。</summary>
    internal static bool BasketOn;
    /// <summary>ctx.basket 段 JSON（null=整字段缺省，JS 判键在场）。</summary>
    internal static string BasketJson;
    /// <summary>签名变化沿（RailData.ItemsDirty 并入——愿望/危机变化而物品不变时也重推；推出即清）。</summary>
    internal static bool Dirty;

    internal static bool Disabled;

    /// <summary>吊栏需求三态与类别（RailData.BuildRowFilter 消费——吊栏窗柜子行按需求类别预筛）。
    /// 窗关（BasketOn=false）时 Mode 置 null。</summary>
    internal static string Mode;
    internal static int[] WishCats = Array.Empty<int>();
    internal static int CrisisCat;

    private static string _lastSig;
    private static bool _wasLive;
    private static long _warnOwnerId;           // SelfCheck 告警按窗去重
    private static readonly HashSet<string> _warned = new();
    private static readonly Dictionary<int, bool> _forbidCache = new();
    private static readonly Regex _gainRe = new("\"gain\":(-?\\d+)", RegexOptions.Compiled);

    internal static void Poll()
    {
        if (Disabled || !RailUi.Enabled) return;
        CfgOn = CabinetEverywherePlugin.EnableGlistBasket?.Value != false;
        if (CfgOn && RailData.ActivePage() != "BackpackUI") return; /* 终审 M4：窗活守卫兜底（state 残留 IsBasket_B 的首包闪挂面） */
        try
        {
            var st = State();
            bool live;
            try { live = st != null && st.IsBasket_B != null && st.IsBasket_B.Value; }
            catch { live = false; }
            if (!live || !CfgOn)
            {
                if (_wasLive)
                {
                    _wasLive = false;
                    BasketOn = false;
                    BasketJson = null;
                    Mode = null; // 行筛选随窗关退役（BuildRowFilter 判 BasketOn 兜底）
                    Dirty = true; // 关窗沿：让契约再推一包（glistOn=false）拆装对称
                }
                return;
            }

            string sig = Sig(st);
            if (_wasLive && sig == _lastSig) return; // 静置零重算零推送
            bool first = !_wasLive;

            var sw = Stopwatch.StartNew();
            BasketOn = true;
            BasketJson = Build(st);
            if (BasketJson == null) return; // 终审 M1：snap 未就绪=不提交签名（sig 不含 active，提交=翻转沿同 sig 早退卡死）
            _wasLive = true;
            _lastSig = sig;
            Dirty = true;
            if (CabinetEverywherePlugin.Verbose?.Value == true)
                CabinetEverywherePlugin.Log?.LogInfo(
                    $"[CERail] basket-glist rebuild{(first ? "(开窗沿)" : "")}：{BasketJson?.Length ?? 0}B，{sw.ElapsedMilliseconds}ms");
        }
        catch (Exception e)
        {
            WarnOnce("BasketGlist poll failed: " + e.Message);
            Disabled = true;
        }
    }

    internal static State_Web_BackpackUI State()
    {
        var rus = BaseSingleton<ReduxUISystem>.IsInstanceCreated ? BaseSingleton<ReduxUISystem>.Instance : null;
        return rus?.GetStateByUI(Il2CppType.From(typeof(WebUI_BackpackUI)))?.TryCast<State_Web_BackpackUI>();
    }

    /// <summary>签名：wishJson ordinal + snap 关键值 + wishCats 序 + B 侧逐件（cfg×count）+ B 侧引用。</summary>
    private static string Sig(State_Web_BackpackUI st)
    {
        var sb = new StringBuilder(96);
        try { sb.Append(st.BasketWishJson_B?.Value); } catch { }
        try
        {
            var s = st.NeighborWishSnap;
            if (s != null)
            {
                sb.Append('|').Append(s.dying).Append(',').Append(s.wishPending)
                  .Append(',').Append(s.progress).Append('/').Append(s.max)
                  .Append(',').Append(s.tier).Append(',').Append(s.crisisActive).Append(',').Append(s.crisisCat)
                  .Append(",c[");
                if (s.wishCats != null) for (int i = 0; i < s.wishCats.Count; i++) sb.Append(s.wishCats[i]).Append(';');
                sb.Append(']');
            }
        }
        catch { }
        try
        {
            var b = st.ItemDataList_B;
            sb.Append("|b[");
            if (b != null)
                for (int i = 0; i < b.Count; i++)
                {
                    var it = b[i];
                    if (it == null) continue;
                    sb.Append(it.ItemConfigId).Append('x').Append(it.ItemCount).Append(';');
                }
            sb.Append(']');
        }
        catch { }
        return sb.ToString();
    }

    private static string Build(State_Web_BackpackUI st)
    {
        var snap = st.NeighborWishSnap;
        if (snap == null || !snap.active) return null; // 快照未就绪：字段缺省，下轮再试

        int wishCount = 0;
        try { wishCount = snap.wishCats?.Count ?? 0; } catch { }
        bool dying = snap.dying, pending = snap.wishPending;
        var model = new BktModel { Mode = BasketAid.ModeOf(dying, pending, wishCount) };

        // 行筛选消费的三态/类别快照（RailData.BuildRowFilter）
        Mode = model.Mode;
        try
        {
            var cats = new int[wishCount];
            for (int i = 0; i < wishCount; i++) cats[i] = snap.wishCats[i];
            WishCats = cats;
        }
        catch { WishCats = Array.Empty<int>(); }
        CrisisCat = snap.crisisActive && snap.crisisCat > 0 ? snap.crisisCat : 0;

        // ---- chips ----
        if (model.Mode == "wish")
        {
            for (int i = 0; i < wishCount; i++)
            {
                int cat = snap.wishCats[i];
                string name = null;
                try { if (snap.wishNames != null && i < snap.wishNames.Count) name = snap.wishNames[i]; } catch { }
                model.Chips.Add((cat, string.IsNullOrEmpty(name) ? CatName(cat) : name, false));
            }
            if (snap.crisisActive && snap.crisisCat > 0)
                model.Chips.Add((snap.crisisCat, string.IsNullOrEmpty(snap.crisisCatName) ? CatName(snap.crisisCat) : snap.crisisCatName, true));
        }
        else if (model.Mode == "dying")
        {
            model.Chips.Add((1, CatName(1), false)); // 她需要吃的=食物（官方 CategoryDisplayName 口径）
        }

        // ---- 逐行边际分（官方直调差分，仅 wish 态）+ SelfCheck ----
        if (model.Mode == "wish")
        {
            var dict = RailData.ItemDict();
            var basket = BasketStacks(st, dict); // 篮内逐叠 (cat, 官方叠值, count)
            float hitRate = snap.hitValueRate, missRate = snap.missValueRate;
            int hitPerCat = snap.hitPerCategory;

            var baseCats = ToIl(snap.wishCats);
            int modSum = CalcSend(basket.cats, basket.vals, baseCats, hitPerCat, hitRate, missRate);

            // 候选行=（cfg,uses,usesMax) 三元组（实机批改#1：多次使用物品剩余次数异=分值异=拆行，
            // glist 合并键同口径）；行键=无 uses 纯 cfg / 有 uses "cfg|u<uses>/<usesMax>"（JS 行同构）
            var kinds = RailData.BasketKindRows();
            var scores = new Dictionary<string, int>(kinds.Count);
            foreach (var kind in kinds)
            {
                Config_Item ic = null;
                try { dict?.TryGetValue(kind.Cfg, out ic); } catch { }
                if (ic == null) continue;
                int cat = 0;
                try { cat = ic.Category; } catch { }
                if (cat <= 0) continue;
                int pieceVal = StackValue(ic, 1, kind.Uses, kind.UsesMax); // 假想下一件=1 件叠

                int marginal;
                if (snap.crisisActive && cat == snap.crisisCat)
                {
                    // 危机差分：CalcCrisisResolveProgress(categories+counts 逐叠) 假想加 1 件叠取差
                    int before = CalcCrisis(basket.cats, basket.counts, snap);
                    basket.cats.Add(cat); basket.counts.Add(1);
                    int after = CalcCrisis(basket.cats, basket.counts, snap);
                    basket.cats.RemoveAt(basket.cats.Count - 1); basket.counts.RemoveAt(basket.counts.Count - 1);
                    marginal = after - before;
                }
                else
                {
                    basket.cats.Add(cat); basket.vals.Add(pieceVal);
                    int with = CalcSend(basket.cats, basket.vals, baseCats, hitPerCat, hitRate, missRate);
                    basket.cats.RemoveAt(basket.cats.Count - 1); basket.vals.RemoveAt(basket.vals.Count - 1);
                    marginal = with - modSum;
                }
                if (marginal != 0 || snap.crisisActive) scores[KindKey(kind)] = marginal; // 0 分也进表（危机态明示 0 比缺行好）
            }
            model.Scores = scores;

            // SelfCheck：官方 gain（wishJson 内）vs 官方算子对篮内现有内容的直算
            int gain = int.MinValue;
            try
            {
                var m = _gainRe.Match(st.BasketWishJson_B?.Value ?? "");
                if (m.Success) int.TryParse(m.Groups[1].Value, out gain);
            }
            catch { }
            bool gainOk = gain != int.MinValue;
            bool basketHasItems = basket.cats.Count > 0;
            if (!gainOk && basketHasItems)
            {
                // 终审 I5：gain 解析失败（wishJson 格式漂移）≠对账通过——fail-closed 按失败处理
                gain = modSum + 9999;
                if (CabinetEverywherePlugin.Verbose?.Value == true)
                    CabinetEverywherePlugin.Log?.LogWarning("[basket-glist] wishJson gain 未解析（格式漂移？），SelfCheck 按 fail-closed 处理");
            }
            if (!BasketAid.SelfCheckOk(modSum, gain))
            {
                long oid = 0; try { oid = st.OwnerIdRP_B?.Value ?? 0; } catch { }
                if (_warnOwnerId != oid)
                {
                    _warnOwnerId = oid;
                    WarnOnce($"[basket-glist] SelfCheck 对账失败：mod={modSum} vs 官方 gain={gain}（本窗不显分值）");
                }
                model.Scores = null;
            }
        }

        // ---- 禁入（IsBasketForbidItem，cfg 级缓存）----
        foreach (int cfg in RailData.BasketCfgIds())
        {
            bool bad;
            if (!_forbidCache.TryGetValue(cfg, out bad))
            {
                try { bad = NeighborRules.IsBasketForbidItem(cfg); }
                catch { bad = false; }
                _forbidCache[cfg] = bad;
            }
            if (bad) model.Forbid.Add(cfg);
        }
        return BasketAid.BuildJson(model);
    }

    /// <summary>官方叠值（实机批改#1 反汇编定谳 RecomputeBasketPreview@0x2af04b0-0x2af0558）：
    /// cfgUses=max(cfg.UseTimes,1)；maxUses=item.MaxUseTimes&gt;0?:cfgUses；
    /// factor=item.UseTimes&gt;0 ? UseTimes/maxUses×cfgUses : 1（剩余使用次数折算——维修零件类
    /// 多次使用物品分值随剩余次数变化，v2.1.0 逐件平铺 TV 模型错因）；val=TradeValue&gt;0 ?
    /// Math.Round(ItemCount×TradeValue×factor) : 0；**逐叠条目**（非逐件）。</summary>
    private static int StackValue(Config_Item ic, int itemCount, int useTimes, int maxUseTimes)
    {
        int cfgUses = 1, tv = 0;
        try { cfgUses = Math.Max(1, ic.UseTimes); } catch { }
        try { tv = ic.TradeValue; } catch { }
        int maxUses = maxUseTimes > 0 ? maxUseTimes : cfgUses;
        float factor = useTimes > 0 ? (float)useTimes / maxUses * cfgUses : 1f;
        if (tv <= 0) return 0;
        return (int)Math.Round((double)itemCount * tv * factor);
    }

    /// <summary>篮内逐叠条目 (cfg.Category, 官方叠值)——CalcSendProgress 入参形状（官方同形）。</summary>
    private static (Il2CppSystem.Collections.Generic.List<int> cats, Il2CppSystem.Collections.Generic.List<int> vals, Il2CppSystem.Collections.Generic.List<int> counts)
        BasketStacks(State_Web_BackpackUI st, Il2CppSystem.Collections.Generic.Dictionary<int, Config_Item> dict)
    {
        var cats = new Il2CppSystem.Collections.Generic.List<int>();
        var vals = new Il2CppSystem.Collections.Generic.List<int>();
        var counts = new Il2CppSystem.Collections.Generic.List<int>();
        var b = st.ItemDataList_B;
        if (b == null) return (cats, vals, counts);
        for (int i = 0; i < b.Count; i++)
        {
            var it = b[i];
            if (it == null) continue;
            Config_Item ic = null;
            try { dict?.TryGetValue(it.ItemConfigId, out ic); } catch { }
            if (ic == null) continue;
            int cat = 0, ut = 0, mt = 0, n = 0;
            try { cat = ic.Category; } catch { }
            try { ut = it.UseTimes; } catch { }
            try { mt = it.MaxUseTimes; } catch { }
            try { n = it.ItemCount; } catch { }
            cats.Add(cat);
            vals.Add(StackValue(ic, n, ut, mt));
            counts.Add(n);
        }
        return (cats, vals, counts);
    }

    private static int CalcSend(
        Il2CppSystem.Collections.Generic.List<int> cats, Il2CppSystem.Collections.Generic.List<int> vals,
        Il2CppSystem.Collections.Generic.List<int> wishCats, int hitPerCategory, float hitValueRate, float missValueRate)
    {
        var hitOut = new Il2CppSystem.Collections.Generic.List<int>();
        return NeighborRules.CalcSendProgress(cats, vals, wishCats, hitPerCategory, hitValueRate, missValueRate, hitOut);
    }

    /// <summary>行键：无 uses（MaxUseTimes≤0）=纯 cfgId；有 uses="cfg|u&lt;uses&gt;/&lt;usesMax&gt;"
    /// （uses=契约行 r[16]=max(1,UseTimes) 口径、usesMax=r[17] 原值——JS glistAidScoreKey 同构）。</summary>
    private static string KindKey((int Cfg, int Uses, int UsesMax) k)
        => k.UsesMax > 0 ? $"{k.Cfg}|u{Math.Max(1, k.Uses)}/{k.UsesMax}" : k.Cfg.ToString();

    private static int CalcCrisis(
        Il2CppSystem.Collections.Generic.List<int> cats, Il2CppSystem.Collections.Generic.List<int> counts,
        NeighborWishSnapshot snap)
    {
        int hitPieces;
        return NeighborRules.CalcCrisisResolveProgress(cats, counts, snap.crisisCat, snap.crisisResolve, snap.crisisPerItem, out hitPieces);
    }

    private static Il2CppSystem.Collections.Generic.List<int> ToIl(Il2CppSystem.Collections.Generic.List<int> src)
    {
        var dst = new Il2CppSystem.Collections.Generic.List<int>();
        if (src != null) for (int i = 0; i < src.Count; i++) dst.Add(src[i]);
        return dst;
    }

    private static string CatName(int cat)
    {
        try
        {
            var n = GameCore.HotUpdate.ReduxUI.Reducer_Web_TradeUI.CategoryDisplayName(cat);
            if (!string.IsNullOrEmpty(n)) return n;
        }
        catch { }
        return cat.ToString();
    }

    private static void WarnOnce(string msg)
    {
        if (_warned.Add(msg))
            CabinetEverywherePlugin.Log?.LogWarning("[basket-glist] " + msg);
    }
}
