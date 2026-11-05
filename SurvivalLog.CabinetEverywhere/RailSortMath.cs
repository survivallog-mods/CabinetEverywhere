using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Il2CppInterop.Runtime;
using SurvivalLog.ModShared;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// CERail 排序数值管线（作者 2026-11-01 缺陷单#1：排序不生效/数据不显示/显示错误——
/// 「设计参考 ProjectCook mod，可参考或直接复用」）。本文件 = ProjectCook.dll（游戏内同装）
/// SortData/SortLogic/EatLogic/EatInputs/TalentInputs 反编译移植，适配本 mod 的
/// Battle 侧 ItemData（dump.cs@418214 实证字段全同 Data_Item：StartTime/TimeLeft/TimeScale/
/// OriginalTimeLeft/PresetShelfScale/InstanceVD/InstanceEffectEnd/UseTimes/MaxUseTimes）。
///
/// 与旧实现的差异（=本缺陷单的病根修复）：
///   ① 属性维（饱腹/心态/精力/生命）旧取 Config_Item.ValueDisplay*（配置级、无实例覆盖、
///      无天赋）→ 现 = 实例 InstanceEffectEnd[0/1/2/4] 优先，缺省回退 Config_Action→
///      Config_Effect.Item*End，再经天赋管线 EatValues（ProjectCook EatLogic 逐式移植）；
///   ② 交易价值旧 = TradeValue×count → 现 = TradeValue×TradeUses(损耗)×count×(1+鉴定)
///      （ProjectCook 公式）；Trade 页再加当前交易对象需求因子（Boost/HalfValueCategory，
///      State_Web_TradeUI，UI-SPEC §4.11 计算后交易价值口径）；
///   ③ 保质期旧 = TimeLeft 原值降序+秒假设角标（恒 0h）→ 现 = DaysLeftOf 状态机
///      （不腐/临期/过期/腐败 + PresetShelfScale/TimeScale 换算成天）升序（快坏的在前），
///      角标出「3天/0.5天/已过期/已腐败」（ProjectCook 口径）；
///   ④ 无键物品（非食物无属性/不腐坏）排最后（ProjectCook order() 语义；旧实现混排）。
/// 单位定案：TimeLeft/StartTime/OriginalTimeLeft = 游戏小时（DaysLeftOf ÷24 成天；
/// RobotSortingManager.GetNowHours(world) = 当前时刻，ProjectCook currentHours 同源）。
/// 全部 try/catch 防御：任一环不可得 → 该维 null（排序排尾、角标「—」），绝不抛出。
/// </summary>
internal static class RailSortMath
{
    private static readonly int[] EatIndex = { 0, 1, 2, 4 }; // Stats[0..3]=效果维[饱腹/心态/精力/生命(=效果4)]
    private static float _nowFallback; // NowHours 失败回退值（原 _factorsAt 引用随天赋管线退役）

    // ================= 吃入天赋管线（2026-11-01 第九轮恢复；68fb926 版逐字回归 + 诊断日志。
    //    第六轮整块删除是误判：详情 28/次 = 实例 24 × 天赋管线（PC OneUse→EatValues 实锤，
    //    PC 在冰箱/烹饪页的角标曾被作者实机验证与详情一致）。无管线 24×3=72≠84。） =================

    internal sealed class Talent
    {
        public float Nourish;
        public float PerfectMorale;
        public int[] AddPermille;      // [5]（0饱腹/1心态/2精力/3健康(弃)/4生命）
        public float[] SatietyFood;    // [12] 按食物子类
        public float[] MoraleFood;
        public int EfficientPermille;
        public int ComfortPermille;
    }

    internal sealed class Factors
    {
        public List<Talent> Talents = new List<Talent>();
        public int[] BasePermille;     // null=未读到（全按 0）
        public float LifeDelta;
    }

    /// <summary>AttrName.Add*_Ratio（HotUpdate.dll 反编译实锤：20001-20005 =
    /// SatietyAdd/MoraleAdd/StaminaAdd/HealthAdd/VitalityAdd_Ratio，与效果数组序一致）。</summary>
    private static readonly int[] AddRatioIds = { 20001, 20002, 20003, 20004, 20005 };

    private static Factors _factors;
    private static int _factorsAtMs = int.MinValue;
    private static string _factorsSig;
    private static bool _factorsWarned;

    /// <summary>因子缓存 2s（buff/难度缓变）。签名变化时打一行诊断（第九轮对账用：
    /// 若角标仍≠详情，从这行直接读出 base/talents 与 PC 期望的差异）。</summary>
    internal static Factors FactorsNow()
    {
        int nowMs = Environment.TickCount;
        if (_factors != null && nowMs - _factorsAtMs < 2000) return _factors;
        var f = new Factors();
        var sig = new StringBuilder();
        try
        {
            var cm = BagTable.Cm();
            var world = RailData.World();
            var role = world?._AgentManager?.GetLeadingRole();
            if (cm != null && role != null)
            {
                var ac = GameCore.HotUpdate.Battle.Logic.AgentTools.GetAgentComponent<GameCore.HotUpdate.Battle.Logic.AttributeComponent>(role);
                if (ac != null)
                {
                    f.BasePermille = new int[5];
                    for (int i = 0; i < 5; i++)
                    {
                        try { f.BasePermille[i] = ac.GetBaseValue_Int((GameCore.HotUpdate.AttrName)AddRatioIds[i]); } catch { }
                    }
                }
                try { f.LifeDelta = GameCore.HotUpdate.Battle.Logic.DifficultyTools.GetVitalityItemAddDelta(); } catch { }

                var bc = GameCore.HotUpdate.Battle.Logic.AgentTools.GetAgentComponent<GameCore.HotUpdate.Battle.Logic.BuffComponent>(role);
                var buffs = bc?.buffIdMap;
                if (buffs != null)
                {
                    var byBuff = TalentsByBuff(cm);
                    foreach (var kv in buffs)
                    {
                        GameCore.HotUpdate.Config_Talent tCfg = null;
                        try { byBuff?.TryGetValue(kv.Key, out tCfg); } catch { }
                        if (tCfg == null) continue;
                        var bCfg = cm.Get_Config_Buff(kv.Key);
                        if (bCfg == null || bCfg.BuffDuring >= 0f) continue; // 永久 buff 才算天赋
                        var eff = cm.Get_Config_Effect(bCfg.EffectConfigId);
                        if (eff == null) continue;
                        int cnt = 1;
                        try { cnt = Math.Max(1, kv.Value?.Count ?? 1); } catch { sig.Append("(Count读失败:").Append(kv.Key).Append(") "); }
                        var t = ToTalent(eff);
                        if (t != null)
                        {
                            for (int j = 0; j < cnt; j++) f.Talents.Add(t);
                            sig.Append("buff").Append(kv.Key).Append("x").Append(cnt).Append("(").Append(TalentBrief(t)).Append(") ");
                        }
                    }
                }
            }
        }
        catch (Exception e)
        {
            if (!_factorsWarned) { _factorsWarned = true; CabinetEverywherePlugin.Log.LogWarning("[CERail] 排序天赋因子读取失败（按无天赋计）: " + e.Message); }
            sig.Append("failed:").Append(e.Message);
        }
        if (f.BasePermille != null) sig.Append("base=").Append(string.Join("/", f.BasePermille)).Append(' ');
        sig.Append("life=").Append(f.LifeDelta);
        if (sig.ToString() != _factorsSig)
        {
            _factorsSig = sig.ToString();
            CabinetEverywherePlugin.Log.LogInfo("[CERail][因子] " + _factorsSig);
        }
        _factors = f; _factorsAtMs = nowMs;
        return f;
    }

    private static string TalentBrief(Talent t)
    {
        var b = new StringBuilder();
        if (t.Nourish != 0f) b.Append("nourish=").Append(t.Nourish.ToString("0.###", CultureInfo.InvariantCulture)).Append(',');
        if (t.EfficientPermille != 0) b.Append("eff=").Append(t.EfficientPermille).Append(',');
        if (t.ComfortPermille != 0) b.Append("comfort=").Append(t.ComfortPermille).Append(',');
        if (t.AddPermille != null) b.Append("add=").Append(string.Join("/", t.AddPermille)).Append(',');
        if (t.SatietyFood != null) b.Append("satFood,");
        if (t.MoraleFood != null) b.Append("morFood,");
        return b.Length > 0 ? b.ToString(0, b.Length - 1) : "?";
    }

    private static Dictionary<int, GameCore.HotUpdate.Config_Talent> _talentByBuff;
    private static object _talentByBuffSrc;

    private static Dictionary<int, GameCore.HotUpdate.Config_Talent> TalentsByBuff(GameCore.HotUpdate.ConfigManager cm)
    {
        var src = cm?._Config_Talent_Dict;
        if (src == null) return null;
        if (_talentByBuff != null && ReferenceEquals(src, _talentByBuffSrc)) return _talentByBuff;
        var d = new Dictionary<int, GameCore.HotUpdate.Config_Talent>();
        try
        {
            foreach (var kv in src)
                if (kv.Value != null && kv.Value.BuffID > 0) d[kv.Value.BuffID] = kv.Value;
        }
        catch { }
        _talentByBuff = d; _talentByBuffSrc = src;
        return d;
    }

    /// <summary>Config_Effect → Talent（ProjectCook ToTalent 逐分支移植；ConfigName 键照抄）。</summary>
    private static Talent ToTalent(GameCore.HotUpdate.Config_Effect e)
    {
        var t = new Talent();
        bool any = false;
        string name = null;
        try { name = e.ConfigName; } catch { }
        if (name == "Buff/AE_CookDishNourish") { t.Nourish = e.FloatValue0; any = true; }
        else if (name == "Buff/AE_CookEatPerfectMorale") { t.PerfectMorale = e.FloatValue0; any = true; }
        else if (name == "Buff/Efficient_Nutrition") { t.EfficientPermille = (int)(e.FloatValue0 * 1000f); any = true; }
        else if (name == "Buff/Buff_304310_ComfortFood") { t.ComfortPermille = (int)(e.FloatValue0 * 1000f); any = true; }
        var add = new float[5];
        try { add[0] = e.BuffSatietyAdd; add[1] = e.BuffMoraleAdd; add[2] = e.BuffStaminaAdd; add[4] = e.BuffVitalityAdd; } catch { }
        bool hasAdd = false;
        for (int i = 0; i < 5; i++) if (add[i] != 0f) hasAdd = true;
        if (hasAdd)
        {
            t.AddPermille = new int[5];
            for (int i = 0; i < 5; i++) t.AddPermille[i] = (int)(add[i] * 1000f);
            any = true;
        }
        t.SatietyFood = FoodRatios(e, "BuffSatietyFood{0}Add_Ratio");
        t.MoraleFood = FoodRatios(e, "EF_BuffMoraleFood{0}Add_Ratio");
        if (!any && t.SatietyFood == null && t.MoraleFood == null) return null;
        return t;
    }

    private static float[] FoodRatios(GameCore.HotUpdate.Config_Effect e, string fmt)
    {
        float[] arr = null;
        for (int i = 1; i < 12; i++)
        {
            float v = 0f;
            try
            {
                var p = typeof(GameCore.HotUpdate.Config_Effect).GetProperty(string.Format(CultureInfo.InvariantCulture, fmt, i));
                if (p == null) continue;
                v = Convert.ToSingle(p.GetValue(e), CultureInfo.InvariantCulture);
            }
            catch { continue; }
            if (v != 0f) { arr = arr ?? new float[12]; arr[i] = v; }
        }
        return arr;
    }

    /// <summary>EatValues+Gain（ProjectCook EatLogic 逐式；values=单次食用效果值[5]，
    /// hasInstance 时 Nourish 只乘实例值）。i=3(Fitness) 跳过——PC 同款。</summary>
    private static float[] EatValues(float[] values, bool hasInstance, bool isStaple, bool isPerfect, int subCategory, int portions, Factors f)
    {
        var r = new float[5];
        float nourish = 0f, perfectMorale = 0f;
        foreach (var t in f.Talents) { nourish += t.Nourish; perfectMorale += t.PerfectMorale; }
        for (int i = 0; i < 5; i++)
        {
            if (i == 3) continue; // 3=Fitness（ProjectCook 同款跳过）
            float v = Get(values, i);
            if (hasInstance) v *= 1f + nourish;
            r[i] = Gain(i, v, isStaple, subCategory, f);
        }
        if (isPerfect && perfectMorale != 0f)
            r[1] += Math.Max(1, portions) * Gain(1, perfectMorale, isStaple, subCategory, f);
        return r;
    }

    private static float Gain(int stat, float value, bool isStaple, int subCategory, Factors f)
    {
        if (value <= 0f) return value;
        float satFood = 0f;
        int permille = Get(f.BasePermille, stat);
        foreach (var t in f.Talents)
        {
            if (stat == 0) satFood += Get(t.SatietyFood, subCategory);
            if (stat == 1) satFood += Get(t.MoraleFood, subCategory);
            permille += Get(t.AddPermille, stat);
            if (stat == 0) permille += t.EfficientPermille + (isStaple ? t.ComfortPermille : 0);
        }
        if (stat == 0 || stat == 1) value *= 1f + Math.Min(2f, Math.Max(-1f, satFood));
        if (stat == 4) value = Math.Max(0f, (1f + f.LifeDelta) * value);
        return value * (1f + Math.Min(2000, Math.Max(-500, permille)) / 1000f);
    }

    private static float Get(float[] a, int i) => (a == null || i < 0 || i >= a.Length) ? 0f : a[i];
    private static int Get(int[] a, int i) => (a == null || i < 0 || i >= a.Length) ? 0 : a[i];

    private static HashSet<int> _perfectIds;
    private static object _perfectSrc;

    private static bool IsPerfect(GameCore.HotUpdate.ConfigManager cm, int cfgId)
    {
        var src = cm?._Config_CookingRecipe_Dict;
        if (src == null) return false;
        if (_perfectIds == null || !ReferenceEquals(src, _perfectSrc))
        {
            var set = new HashSet<int>();
            try { foreach (var kv in src) if (kv.Value != null && kv.Value.PerfectItemID > 0) set.Add(kv.Value.PerfectItemID); } catch { }
            _perfectIds = set; _perfectSrc = src;
        }
        return _perfectIds.Contains(cfgId);
    }

    // ================= 交易（ProjectCook TradeUses/鉴定 + Trade 页需求因子） =================

    /// <summary>使用损耗系数（ProjectCook TradeUses 逐式：全新=1；用过的按剩余次数比例折算）。</summary>
    internal static float TradeUses(int useTimes, int maxUseTimes, int cfgUses)
    {
        int denom = cfgUses < 1 ? 1 : cfgUses;
        if (useTimes < 1) return 1f;
        int max = maxUseTimes > 0 ? maxUseTimes : denom;
        return (float)useTimes / max * denom;
    }

    /// <summary>鉴定加成（ProjectCook TalentInputs.ReadAppraisal 同键）。</summary>
    internal static float Appraisal()
    {
        try { return GameCore.HotUpdate.Battle.Logic.Furniture.GetTalentEffectRatio("Buff/AE_StrangerTradeAppraisalBonus"); }
        catch { return 0f; }
    }

    // ================= Trade 页当前交易对象需求（State_Web_TradeUI） =================

    internal sealed class TradeCtx
    {
        public bool Valid;
        public int DemandCategory = -1;
        public int DemandCategoryMask;
        public int HalfValueCategory = -1;
        public float Boost;
        public float AppraisalBoost;
    }

    private static TradeCtx _trade;
    private static float _tradeAt = float.NegativeInfinity;

    /// <summary>Trade 页状态缓存 2s（买家加成/半价品类/鉴定 boost）。</summary>
    internal static TradeCtx TradeNow()
    {
        float now = NowHours();
        if (_trade != null && now - _tradeAt < 2f) return _trade;
        var t = new TradeCtx();
        try
        {
            var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated
                ? GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance : null;
            var st = rus?.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_TradeUI)))
                ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_TradeUI>();
            if (st != null)
            {
                t.DemandCategory = st.DemandCategory;
                t.DemandCategoryMask = st.DemandCategoryMask;
                t.HalfValueCategory = st.HalfValueCategory;
                t.Boost = st.Boost;
                t.AppraisalBoost = st.AppraisalBoost;
                t.Valid = true;
            }
        }
        catch { }
        _trade = t; _tradeAt = now;
        return t;
    }

    /// <summary>
    /// Trade 页「计算后交易价值」单价（UI-SPEC §4.11：单价×(1+当前交易对象品类加成)；
    /// 需求命中=+Boost（DemandCategory/Mask 两判），HalfValueCategory 命中=半价）。
    /// 官方 ResolveTakeTradeValue 为 private 不可直调（dump@222819），实机对照官方价校准。
    /// </summary>
    internal static float TradeUnit(GameCore.HotUpdate.Config_Item cfg, TradeCtx t)
    {
        if (cfg == null || t == null || !t.Valid) return cfg?.TradeValue ?? 0f;
        int cat = 0;
        try { cat = cfg.Category; } catch { }
        bool demand = cat == t.DemandCategory || (t.DemandCategoryMask != 0 && (t.DemandCategoryMask & (1 << cat)) != 0);
        bool half = cat == t.HalfValueCategory;
        float v = cfg.TradeValue;
        if (demand) v *= 1f + t.Boost;
        if (half) v *= 0.5f;
        return v;
    }

    /// <summary>买家喜好条 chips（JS ctx.tradePrefs=[[分类名,加成]…] 消费位 v1.8.3 已就绪）。
    /// 【2026-11-06 八追终案修复】旧实现双 bug 产出非法 JSON（实机 CDP 抓包铁证：
    /// "tradePrefs":[,[""食物"",-0.5]]）：①Escape 是「带引号包装」的 JSON 引用器（返回
    /// "名" 形态），旧码在包装结果外再手拼 \" → 双重引号；②需求条目缺席（DemandCategory<=0，
    /// 本日交易无热需分类）时 HalfValue 条目的无条件前导逗号悬空 → "[,"。BuildJson 对
    /// **所有页面**无条件携带本字段 → 交易状态带 prefs 的存档里每一包推送都是非法 JSON：
    /// 旧直推路径=整段 setData 脚本语法错误被 WebView 静默丢弃=四~八追「大包丢失/时好时坏」
    /// 悬案真凶（交易需求按日轮换 ⇒ 好坏随日期/存档变化=「概率性」的全部来源）。
    /// 修=条目集 string.Join 拼装，引号包装语义只出自 Escape 一处。</summary>
    internal static void AppendTradePrefs(StringBuilder sb)
    {
        var t = TradeNow();
        var entries = new List<string>();
        if (t.Valid)
        {
            if (t.DemandCategory > 0)
                entries.Add("[" + Escape(RailData.CategoryName(t.DemandCategory)) + "," + F(t.Boost) + "]");
            if (t.HalfValueCategory > 0)
                entries.Add("[" + Escape(RailData.CategoryName(t.HalfValueCategory)) + ",-0.5]");
        }
        sb.Append(",\"tradePrefs\":[").Append(string.Join(",", entries)).Append(']');
    }

    // ================= 保质期（SortLogic.DaysLeftOf 状态机移植） =================

    internal sealed class DaysLeft
    {
        public bool IsExpired, IsRotten, HasNumber;
        public float Days;
    }

    internal static DaysLeft DaysLeftOf(GameCore.HotUpdate.Config_Item cfg, GameCore.HotUpdate.Battle.Logic.ItemData it, float now)
    {
        var d = new DaysLeft();
        try
        {
            int life = cfg?.Life ?? 0;
            float rot = 0f, timeScale = 0f, preset = 0f;
            int startTime = 0, timeLeft = 0, orig = 0;
            try { rot = cfg.IT_Rot_Threshold; } catch { }
            try { startTime = it.StartTime; timeLeft = it.TimeLeft; orig = it.OriginalTimeLeft; } catch { }
            try { timeScale = it.TimeScale; preset = it.PresetShelfScale; } catch { }
            bool frozen = false;
            try { frozen = GameCore.HotUpdate.FoodPreservationRules.IsCompostRotFrozen(cfg, timeScale); } catch { }

            if (life < 1 || frozen) return d; // NoSpoil
            float scale = preset > 0f ? preset : 1f;
            float left = (timeLeft + startTime) - now;
            float days = left * scale / 24f;
            if (days > 0f) { d.HasNumber = true; d.Days = days; return d; }
            if (rot <= 1f) { d.IsExpired = true; return d; }
            float full = orig >= 1 ? orig : life * 24f;
            float gone = full <= 0f ? 0f : (full - left * timeScale) / full;
            if (gone >= rot) { d.IsExpired = true; d.IsRotten = true; return d; }
            float toRot = (rot - gone) * full;
            if (timeScale > 0f) toRot /= timeScale;
            d.IsExpired = true; d.HasNumber = true; d.Days = toRot * scale / 24f;
            return d;
        }
        catch { return d; }
    }

    /// <summary>排序键（ProjectCook DaysKey 逐式）：腐败=-100001 < 过期(-100000..-1) < 正常天数；null=不腐。</summary>
    internal static float? DaysKey(DaysLeft d)
    {
        if (d == null) return null;
        if (d.IsRotten) return -100001f;
        if (d.IsExpired) return d.HasNumber ? -100000f + Math.Min(d.Days, 99999f) : -100000f;
        return d.HasNumber ? d.Days : (float?)null;
    }

    /// <summary>角标文本（ProjectCook DaysText：≥1 天取整，<1 天留 0.1 粒度一位小数）。</summary>
    internal static string DaysText(DaysLeft d)
    {
        if (d == null) return null;
        if (d.IsRotten) return "已腐败";
        if (!d.HasNumber) return d.IsExpired ? "已过期" : null;
        if (d.IsExpired) return "已过期";
        if (d.Days >= 1f) return ((int)Math.Floor(d.Days)).ToString(CultureInfo.InvariantCulture) + "天";
        return Math.Max(0.1, Math.Round(d.Days, 1, MidpointRounding.AwayFromZero)).ToString("0.0", CultureInfo.InvariantCulture) + "天";
    }

    // ================= 单件汇总（SortData.Numbers 对应物） =================

    internal sealed class Numbers
    {
        public int?[] Stats = new int?[4];  // [饱腹/心态/精力/生命]（0→null=不显示不参与）
        public int? Trade;                  // 整叠计算后交易价值（≤0→null）
        public float? DaysKey;
        public string DaysText;
    }


    /// <summary>
    /// 单叠数值：属性=实例效果→配置效果→天赋管线；交易=场景分式（Trade 页需求价 / 其他页
    /// ProjectCook 损耗×鉴定）；保质=DaysLeftOf 状态机。任何一环失败该维=null（角标「—」、排序排尾）。
    /// </summary>
    internal static Numbers Of(GameCore.HotUpdate.Battle.Logic.ItemData it, GameCore.HotUpdate.Config_Item cfg, bool tradeScene, float now)
    {
        var n = new Numbers();
        if (it == null || cfg == null) return n;
        var cm = BagTable.Cm();
        try
        {
            int cat = 0, sub = 0, count = 1;
            try { cat = cfg.Category; sub = cfg.SubCategory; } catch { }
            try { count = it.ItemCount; } catch { }
            bool isFood = cat == 1;
            /* 2026-11-03 作者口径：药物（cat=2，兴奋剂 -10生命×3次 / 急救绷带 +20生命…）同出
               属性角标——实例→配置取值链与「弹窗数×剩余次数」算式全同食物；滋养
               （AE_CookDishNourish）只乘熟食=烹饪特产，药物有 InstanceEffectEnd（时效效果，
               如兴奋剂）也不吃滋养，恒 ×1。 */
            bool isDrug = cat == 2;
            if (isFood || isDrug)
            {
                /* 2026-11-01 第十轮终解（游戏详情弹窗实机三连证，构建内直验）：
                   ①包装食品（无实例）详情=vd 原值：红烧牛肉面 vd[25,3]→弹窗 +25/+3、
                   火腿肠 vd[10,1]→+10/+1（逐字相等，零加成）；
                   ②熟食（有实例）详情=round(vd×(1+ΣAE_CookDishNourish))：招牌盖饭(完美)
                   vd[30.5,10,0,0,4]×1.15→+35/+12/+5（35.075→35、11.5→12、4.6→5 全中）；
                   ③作者「菌菇饭单次 28」=round(24×1.15)=27.6→28（对账实例 24 实锤）。
                   PC EatValues 的 Gain（BasePermille/satFood/eff/comfort）详情**不叠**——
                   第九轮整管线全叠（牛肉面 25→45 错）。滋养只乘熟食=PC if(HasInstanceValues)
                   同分支。角标=round(单次值)×UseTimes（作者算式：弹窗数×剩余次数，
                   先舍入再乘——27.6→28×3=84 而非 82.8→83）。 */
                float[] vd = new float[5];
                bool cooked = false;
                try
                {
                    var iv = it.InstanceVD;
                    if (iv != null && iv.Length >= 5)
                        for (int q = 0; q < 5; q++) vd[q] = iv[q];
                }
                catch { }
                try
                {
                    var ie = it.InstanceEffectEnd;
                    if (ie != null && ie.Length >= 5) cooked = true; /* 熟食=滋养适用判据（PC 同款） */
                }
                catch { }
                if (vd[0] == 0f && vd[1] == 0f && vd[2] == 0f && vd[3] == 0f && vd[4] == 0f)
                {
                    /* InstanceVD 缺失兜底：Config ValueDisplay（包装食品本就来自这里） */
                    try { vd = new float[5] { cfg.ValueDisplay1, cfg.ValueDisplay2, cfg.ValueDisplay3, cfg.ValueDisplay4, cfg.ValueDisplay5 }; } catch { }
                }
                float nourish = 0f;
                if (cooked && isFood)
                {
                    var f2 = FactorsNow();
                    foreach (var t in f2.Talents) nourish += t.Nourish; /* AE_CookDishNourish 之和（[因子]行同源可核）；食物限定=药物不吃烹饪滋养 */
                }
                int uses = 1, usesMax = 0;
                try { uses = Math.Max(1, it.UseTimes); } catch { } /* 剩余使用次数（随食用递减） */
                try { usesMax = it.MaxUseTimes; } catch { }
                var perOnce = new float[5];
                for (int q = 0; q < 5; q++) perOnce[q] = vd[q] * (cooked ? 1f + nourish : 1f);
                for (int i = 0; i < 4; i++)
                {
                    int per = (int)Math.Round(perOnce[EatIndex[i]], MidpointRounding.AwayFromZero);
                    int v = per * uses; /* 弹窗整数×剩余次数（作者算式逐字） */
                    if (v != 0) n.Stats[i] = v;
                }
                Vouch(cfg, it, vd, cooked, nourish, perOnce, uses, usesMax, n); /* 60045/60093 全链路一行对账（仅首次遇到该组合时打） */
            }

            int useTimes = 0, maxUse = 0, cfgUses = 0;
            try { useTimes = it.UseTimes; maxUse = it.MaxUseTimes; cfgUses = cfg.UseTimes; } catch { }
            float trade;
            if (tradeScene)
            {
                var t = TradeNow();
                trade = TradeUnit(cfg, t) * Math.Max(1, count) * (1f + t.AppraisalBoost);
            }
            else
            {
                trade = cfg.TradeValue * TradeUses(useTimes, maxUse, cfgUses) * Math.Max(1, count) * (1f + Appraisal());
            }
            int tv = (int)Math.Round(trade, MidpointRounding.AwayFromZero);
            if (tv > 0) n.Trade = tv;

            var days = DaysLeftOf(cfg, it, now);
            n.DaysKey = DaysKey(days);
            n.DaysText = DaysText(days);
        }
        catch { }
        return n;
    }

    // ================= 对账日志（第九轮：作者两份料理的全链路数字，写进 BepInEx 日志
    //    供事后核对——不给作者加任何验证负担） =================

    private static HashSet<string> _vouched;

    private static void Vouch(GameCore.HotUpdate.Config_Item cfg, GameCore.HotUpdate.Battle.Logic.ItemData it,
        float[] vd, bool cooked, float nourish, float[] perOnce, int uses, int usesMax, Numbers n)
    {
        try
        {
            if (cfg.ID != 60045 && cfg.ID != 60093) return; /* 山珍菌菇饭(完美)/龙虎双拼(完美) */
            long iid = 0;
            try { iid = it.InstanceId; } catch { }
            var key = cfg.ID + ":" + iid + ":" + uses;
            if (_vouched == null) _vouched = new HashSet<string>();
            if (_vouched.Contains(key)) return;
            _vouched.Add(key);
            var b = new StringBuilder();
            b.Append("[CERail][对账] ").Append(cfg.ID).Append(cooked ? " 熟食" : " 包装")
             .Append(" vd=").Append(Fmt5(vd)).Append(" 滋养=").Append(nourish.ToString("0.###", CultureInfo.InvariantCulture))
             .Append(" 单次=").Append(Fmt5(perOnce))
             .Append(" uses=").Append(uses).Append('/').Append(usesMax)
             .Append(" → 角标=").Append(NFmt(n));
            CabinetEverywherePlugin.Log.LogInfo(b.ToString());
        }
        catch { }
    }

    private static string Fmt5(float[] a)
    {
        var b = new StringBuilder("[");
        for (int i = 0; i < 5; i++) { if (i > 0) b.Append(','); b.Append((a != null && i < a.Length ? a[i] : 0f).ToString("0.##", CultureInfo.InvariantCulture)); }
        return b.Append(']').ToString();
    }

    private static string NFmt(Numbers n)
    {
        var b = new StringBuilder("[");
        for (int i = 0; i < 4; i++) { if (i > 0) b.Append(','); b.Append(n.Stats[i].HasValue ? n.Stats[i].Value.ToString() : "-"); }
        return b.Append(']').ToString();
    }

    // ================= 杂项 =================

    /// <summary>当前游戏小时（RobotSortingManager.GetNowHours(world)，dump@426782 public static）。
    /// 失败回退因子缓存时间戳（保排序键不瞬跳；首次失败=0）。</summary>
    internal static float NowHours()
    {
        try
        {
            var w = RailData.World();
            if (w != null) return GameCore.HotUpdate.Battle.Logic.RobotSortingManager.GetNowHours(w);
        }
        catch { }
        return _nowFallback;
    }

    private static string F(float v) => v.ToString("0.###", CultureInfo.InvariantCulture);
    private static string Escape(string s)
    {
        var sb = new StringBuilder((s ?? "").Length + 2);
        sb.Append('"');
        foreach (char c in s ?? "")
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); continue;
                case '\\': sb.Append("\\\\"); continue;
                case '\n': sb.Append("\\n"); continue;
                case '\r': sb.Append("\\r"); continue;
                case '\t': sb.Append("\\t"); continue;
            }
            if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
            else sb.Append(c);
        }
        sb.Append('"');
        return sb.ToString();
    }
}
