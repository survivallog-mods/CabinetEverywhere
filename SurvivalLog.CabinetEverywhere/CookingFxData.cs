// CookingFxData —— CookingFx 的纯数据变换段（零游戏依赖，可离线测；BasketAid 同位纪律：
// interop 壳/通道在 CookingFx.cs，不入 tools/cookfx-math-test 工件）。
// 职责三件：静态排序键表 JSON / GlobalSetting 四系数读取 / 官方图标字形包 JSON。
using System;
using System.Collections.Generic;
using System.Text;

namespace SurvivalLog.CabinetEverywhere;

internal static class CookingFxData
{
    internal const int NormalIndex = 2; // 4 档产物 [Perfect,Good,Normal,Fail] 的 Normal 位=排序键口径（与官方 EffectText 同源）

    /// <summary>静态排序键表（实机定版：键=菜名——官方 .book-item 不带 rid，行键只有 .book-nm 文本；
    /// 名字来源 RecipeName_Local 与前端显示一致）。值=[vd1..5, id, cookExp]：五维排序键 + id 兼同值
    /// tiebreak + 尾位经验维（作者批改4「经验」chip）。vdOf 返回 null（产物缺配置）→ 该菜谱整条跳过。</summary>
    internal static string BuildRecipeTableJson(IEnumerable<(int id, string name, int cookExp, int[] productIds)> recipes, Func<int, float[]> vdOf)
    {
        var sb = new StringBuilder(1024);
        sb.Append('{');
        bool first = true;
        foreach (var (id, name, cookExp, productIds) in recipes)
        {
            if (productIds == null || productIds.Length <= NormalIndex || string.IsNullOrEmpty(name)) continue;
            var vd = vdOf(productIds[NormalIndex]);
            if (vd == null || vd.Length < 5) continue;
            if (!first) sb.Append(',');
            first = false;
            sb.Append('"').Append(EscapeJs(name)).Append("\":[")
              .Append(F(vd[0])).Append(',').Append(F(vd[1])).Append(',').Append(F(vd[2])).Append(',')
              .Append(F(vd[3])).Append(',').Append(F(vd[4])).Append(',').Append(id).Append(',').Append(cookExp).Append(']');
        }
        sb.Append('}');
        return sb.ToString();
    }

    /// <summary>GlobalSetting 系数（spec §2.3+批改9 7 元素）：[qFail,qNormal,qGood,qPerfect,
    /// tierHigh,tierMid,tierLow]（品质 4 档系数供可达档裁剪取端点）。任一缺键回退 1.0。</summary>
    internal static float[] ReadCoeffs(Func<string, float?> gsOf)
    {
        return new[]
        {
            gsOf("CookingVD_QualityCoeff_Fail") ?? 1f,
            gsOf("CookingVD_QualityCoeff_Normal") ?? 1f,
            gsOf("CookingVD_QualityCoeff_Good") ?? 1f,
            gsOf("CookingVD_QualityCoeff_Perfect") ?? 1f,
            gsOf("CookingVD_TierCoeff_High") ?? 1f,
            gsOf("CookingVD_TierCoeff_Mid") ?? 1f,
            gsOf("CookingVD_TierCoeff_Low") ?? 1f,
        };
    }

    /// <summary>品质档位（GetQualityTier 语义：0=Fail..3=Perfect）→ 品质系数索引（coeffs[0..3]=Fail..Perfect）。</summary>
    internal static float QCoeffOf(float[] coeffs, int tier) => coeffs[tier < 0 || tier > 3 ? 0 : tier];

    /// <summary>官方图标字形包（作者批改#3）：{d0..d4:字形}。attrs=(AttrName 枚举值, 字形) 对，
    /// 枚举 1..5=Satiety/Morale/Stamina/Health/Vitality → d0..d4（d4 活力备用，JS 暂不渲染）；
    /// 空/越界字形不输出该键（JS 侧该维回退 SVG）。</summary>
    internal static string BuildIconPackJson(IEnumerable<(int attrNameKey, string icon)> attrs)
    {
        var slot = new string[5];
        foreach (var (key, icon) in attrs)
        {
            if (key < 1 || key > 5 || string.IsNullOrEmpty(icon)) continue;
            slot[key - 1] = icon;
        }
        var sb = new StringBuilder(64);
        sb.Append('{');
        bool first = true;
        for (int i = 0; i < 5; i++)
        {
            if (slot[i] == null) continue;
            if (!first) sb.Append(',');
            first = false;
            sb.Append("\"d").Append(i).Append("\":\"").Append(EscapeJs(slot[i])).Append('"');
        }
        sb.Append('}');
        return sb.ToString();
    }

    /// <summary>这一锅区间条目（批2+批改9）：exact=可达档产物逐维区间；tag=vd1/4/5 Σ食材×tier 系数×
    /// 可达品质系数两端（角点 min/max 归一，负值安全）+vd1 基础加成，vd2/3=可达档产物区间。
    /// coeffs=[qFail,qNormal,qGood,qPerfect,tHigh,tMid,tLow]；tier（GetTierCoeff：1→High/2→Mid/3→Low）
    /// 单值，异常回退括号；minTier=品质可达最低档（0=Fail..3=Perfect，来自 qLo=QualityFloor+加成 vs
    /// recipe.QualityMap——批改9：等级/天赋保底下 Fail 档常不可达，区间按可达档裁剪，不再把
    /// 抽不到的 Fail 产物算进下端）。四维白名单 d0..d3=饱腹/心态/精力/生命(VD5)，全 0 维 null。</summary>
    internal static string BuildPredEntryJson(int recipeId, string name, bool isExact,
        float[][] tierVd, IReadOnlyList<float[]> ingredientVd, IReadOnlyList<int> counts,
        float[] coeffs, float baseBonus, int tier, int minTier)
    {
        if (minTier < 0) minTier = 0;
        if (minTier > 3) minTier = 3;
        // 可达档子集：tierVd=[Perfect,Good,Normal,Fail]（idx=3-档）；档≥minTier ⇔ idx≤3-minTier
        var reachable = new float[4 - minTier][];
        for (int i = 0; i < reachable.Length; i++) reachable[i] = tierVd[i];

        float[][] range;
        if (isExact)
        {
            range = CookingFxMath.ExactRange(reachable);
        }
        else
        {
            // 品质系数端点=可达档 [minTier..3]（负 Σ 角点安全）
            float qA = QCoeffOf(coeffs, minTier), qB = QCoeffOf(coeffs, 3);
            float qLo2 = System.Math.Min(qA, qB), qHi2 = System.Math.Max(qA, qB);
            range = CookingFxMath.TagRange(ingredientVd, counts, 1f, qLo2, qHi2, baseBonus);
            float tLo, tHi;
            if (tier == 1) { tLo = tHi = coeffs[4]; }
            else if (tier == 2) { tLo = tHi = coeffs[5]; }
            else if (tier == 3) { tLo = tHi = coeffs[6]; }
            else
            {
                tLo = System.Math.Min(coeffs[4], System.Math.Min(coeffs[5], coeffs[6]));
                tHi = System.Math.Max(coeffs[4], System.Math.Max(coeffs[5], coeffs[6]));
            }
            foreach (int d in new[] { CookingFxMath.DimSatiety, CookingFxMath.DimHealth, CookingFxMath.DimVitality })
            {
                float bonus = d == CookingFxMath.DimSatiety ? baseBonus : 0f;
                float lo = range[d][0] - bonus, hi = range[d][1] - bonus;
                float c0 = System.Math.Min(lo, hi) * tLo, c1 = System.Math.Max(lo, hi) * tLo;
                float c2 = System.Math.Min(lo, hi) * tHi, c3 = System.Math.Max(lo, hi) * tHi;
                range[d][0] = System.Math.Min(System.Math.Min(c0, c1), System.Math.Min(c2, c3)) + bonus;
                range[d][1] = System.Math.Max(System.Math.Max(c0, c1), System.Math.Max(c2, c3)) + bonus;
            }
            // vd2/vd3 = 可达档产物区间
            var prodRange = CookingFxMath.ExactRange(reachable);
            range[CookingFxMath.DimMorale] = prodRange[CookingFxMath.DimMorale];
            range[CookingFxMath.DimStamina] = prodRange[CookingFxMath.DimStamina];
        }
        var sb = new StringBuilder(96);
        sb.Append("{\"recipeId\":").Append(recipeId)
          .Append(",\"name\":\"").Append(EscapeJs(name)).Append("\",\"dims\":[");
        /* 四维渲染白名单=饱腹/心态/精力/生命。批改7 根因纠正：游戏文案 Vitality=「生命」、
         * Health=「健康」(食物数据全 0 不显示)——第 4 位绑 VD5(Vitality) 而非 VD4(Health) */
        int[] dimsOut = { CookingFxMath.DimSatiety, CookingFxMath.DimMorale, CookingFxMath.DimStamina, CookingFxMath.DimVitality };
        for (int i = 0; i < dimsOut.Length; i++)
        {
            if (i > 0) sb.Append(',');
            var dim = range[dimsOut[i]];
            if (!CookingFxMath.ShouldShow(dim)) { sb.Append("null"); continue; }
            sb.Append('[').Append(F(dim[0])).Append(',').Append(F(dim[1])).Append(']');
        }
        sb.Append("]}");
        return sb.ToString();
    }

    /// <summary>已知菜谱过滤：Level===2（必出）且 RecipeId!==0（非黑暗料理）。</summary>
    internal static IEnumerable<(int recipeId, int level)> FilterKnownEntries(
        IEnumerable<(int recipeId, int level)> entries)
    {
        foreach (var e in entries)
            if (e.recipeId != 0 && e.level == 2) yield return e;
    }

    /// <summary>PredictionListJson 解析（修复批 I2/M2 下沉）：PascalCase 官方序 + camelCase 兼容；
    /// 无 RecipeId 键的条目视为异形丢弃（有键但 rid=0/level 低保留——过滤是 FilterKnownEntries 职责）。
    /// 元组=(rid, level, tier, name)——tier 供档位系数单值化（批改8）。
    /// null/空串/解析异常 → null（调用方整包跳过）。</summary>
    internal static List<(int rid, int level, int tier, string name)> ParsePredictionEntries(string json)
    {
        if (string.IsNullOrEmpty(json)) return null;
        try
        {
            if (RailJson.Parse(json) is not System.Collections.IList arr) return null;
            var list = new List<(int, int, int, string)>();
            foreach (var o in arr)
            {
                if (o is not Dictionary<string, object> m) continue;
                if (!m.ContainsKey("RecipeId") && !m.ContainsKey("recipeId")) continue;
                int rid = IntOf(m, "RecipeId", "recipeId");
                list.Add((rid, IntOf(m, "Level", "level"), IntOf(m, "Tier", "tier"), StrOf(m, "Name", "name")));
            }
            return list;
        }
        catch
        {
            return null;
        }
    }

    private static int IntOf(Dictionary<string, object> m, string k1, string k2)
    {
        object v = null;
        if (m.TryGetValue(k1, out v) || m.TryGetValue(k2, out v)) return Convert.ToInt32(v);
        return 0;
    }

    private static string StrOf(Dictionary<string, object> m, string k1, string k2)
    {
        if (m.TryGetValue(k1, out var v1)) return v1 as string;
        if (m.TryGetValue(k2, out var v2)) return v2 as string;
        return "";
    }

    /// <summary>JSON 数值输出：全精度（0.####，Invariant）——舍入只留 JS 展示层一处（修复批 M5）。</summary>
    private static string F(float v)
    {
        return v.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string EscapeJs(string s)
    {
        var sb = new StringBuilder(s.Length + 4);
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '\\': sb.Append("\\\\"); break;
                case '"': sb.Append("\\\""); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\u2028': case '\u2029': sb.Append("\\u").Append(((int)ch).ToString("x4")); break; // JS 行终止符
                default: sb.Append(ch); break;
            }
        }
        return sb.ToString();
    }
}
