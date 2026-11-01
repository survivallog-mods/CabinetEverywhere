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

    // =================（已退役 2026-11-01 作者终裁：stats=实例效果总量×剩余次数比，不叠天赋；
    //    天赋管线 EatValues/FactorsNow 整块移除——详见 Of() 注释） =================
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

    /// <summary>买家喜好条 chips（JS ctx.tradePrefs=[[分类名,加成]…] 消费位 v1.8.3 已就绪）。</summary>
    internal static void AppendTradePrefs(StringBuilder sb)
    {
        var t = TradeNow();
        sb.Append(",\"tradePrefs\":[");
        if (t.Valid)
        {
            if (t.DemandCategory > 0) sb.Append("[\"").Append(Escape(RailData.CategoryName(t.DemandCategory))).Append("\",").Append(F(t.Boost)).Append(']');
            if (t.HalfValueCategory > 0) sb.Append(",[\"").Append(Escape(RailData.CategoryName(t.HalfValueCategory))).Append("\",-0.5]");
        }
        sb.Append(']');
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
            if (isFood)
            {
                /* 2026-11-01 作者终裁（缺陷单#1 第六轮）：角标=**详情单次值 × 剩余使用次数**
                   （山珍菌菇饭(完美) 28×3=84）。单次值=Config_UseAction→Effect.Item*End（完美料理
                   有独立配置，品质已含在配置选择里）——**不再叠实例数组/天赋管线**（旧路 84→26/次
                   =78 与详情 28/次不符；详情=展示口径，作者以详情为准）。 */
                /* 2026-11-01 第七轮终解（配置表实锤）：**详情=实例效果总量（InstanceEffectEnd，
                   掷骰含品质），悬浮 vd=另一套展示掷值**——两套独立（山珍菌菇饭(完美)：实例 [84,18,6]
                   总量=28/次，vd=[24,6,2]/次；龙虎双拼(完美)：实例 [92,14,21]，配置才 [43,14,0]）。
                   作者算式：角标 = 单次值 × 剩余次数 = **实例总量 × UseTimes/MaxUseTimes**
                   （满份=总量 84；吃一口=28）。配置总量仅作无实例数组的兜底（同样是总量，不乘次数）。 */
                float[] total = new float[5];
                bool hasInst = false;
                try
                {
                    var ie = it.InstanceEffectEnd;
                    if (ie != null && ie.Length >= 5)
                    {
                        hasInst = true;
                        for (int q = 0; q < 5; q++) total[q] = ie[q];
                    }
                }
                catch { }
                if (!hasInst)
                {
                    try
                    {
                        if (cfg.UseAction > 0)
                        {
                            var act = cm?.Get_Config_Action(cfg.UseAction);
                            var eff = act == null ? null : cm.Get_Config_Effect(act.EffectConfigID);
                            if (eff != null)
                                total = new float[5] { eff.ItemSatietyEnd, eff.ItemMoraleEnd, eff.ItemStaminaEnd, eff.ItemHealthEnd, eff.ItemVitalityEnd };
                        }
                    }
                    catch { }
                }
                int uses = 1, usesMax = 1;
                try { uses = Math.Max(1, it.UseTimes); } catch { }
                try { usesMax = Math.Max(1, it.MaxUseTimes > 0 ? it.MaxUseTimes : 1); } catch { }
                for (int i = 0; i < 4; i++)
                {
                    if (total[EatIndex[i]] == 0f) continue;
                    int v = (int)Math.Round(total[EatIndex[i]] * uses / (float)usesMax, MidpointRounding.AwayFromZero);
                    if (v != 0) n.Stats[i] = v;
                }
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
