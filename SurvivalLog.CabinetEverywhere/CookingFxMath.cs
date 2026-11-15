// CookingFxMath —— 烹饪产出属性区间 + 排序键纯逻辑（批1/批2 共用；设计 spec §5.2）。
// 口径对齐反汇编还原的 CookingFormula.CalcProductVD（gamekb 2026-11-12_26615062）：
//   精确配方 isExact=true：vd = 产物 ValueDisplay1..5 配置值原样（4 档各固定）。
//   标签配方 isExact=false：vd1/vd4/vd5 = Σ(食材数×食材该维) × tierCoeff × qualityCoeff，
//     vd1 另加 baseBonus(=食材总数×Params2)；vd2/vd3 = 产物该维配置（产物随品质档 4 选 1）。
//   qualityCoeff 是随机源（出锅才 roll 品质档）→ 区间取 [qFail, qPerfect] 两端。
// 源起 design-proto/cookfx spike（20/20 绿）上移；断言工件 tools/cookfx-math-test。
using System;
using System.Collections.Generic;

namespace SurvivalLog.CabinetEverywhere;

internal static class CookingFxMath
{
    internal const int DimSatiety = 0;   // VD1 饱腹
    internal const int DimMorale = 1;    // VD2 心态
    internal const int DimStamina = 2;   // VD3 精力
    internal const int DimHealth = 3;    // VD4 生命
    internal const int DimVitality = 4;  // VD5 活力（数据带全，渲染白名单不含）

    internal const int TierPerfect = 0, TierGood = 1, TierNormal = 2, TierFail = 3;

    /// <summary>精确配方区间：产物档位逐维 [min,max]（[n][5] → [5][2]，n=1..4 档——批改9
    /// 可达档裁剪后子集可短于 4）。min==max 由展示层收敛单值。</summary>
    internal static float[][] ExactRange(float[][] tierVd)
    {
        var r = NewRange();
        for (int d = 0; d < 5; d++)
        {
            float lo = float.MaxValue, hi = float.MinValue;
            for (int t = 0; t < tierVd.Length; t++)
            {
                var v = tierVd[t][d];
                if (v < lo) lo = v;
                if (v > hi) hi = v;
            }
            if (lo == float.MaxValue) { lo = 0; hi = 0; } /* 空集兜底（不至） */
            r[d][0] = lo; r[d][1] = hi;
        }
        return r;
    }

    /// <summary>标签配方区间。ingredientVd=各参与食材配置行；counts=对应份数；
    /// tierCoeff 单值（锅内档位确定）；qFail/qPerfect=品质系数两端；baseBonusOnlySatiety=
    /// 基础加成只加饱腹维（vd3/vd4 是否加待 T0-5 对拍，先按官方主证只加 vd1）。
    /// 负值食材时 qFail/qPerfect 两端大小反转（spike 实测抓到）→ min/max 归一。</summary>
    internal static float[][] TagRange(
        IReadOnlyList<float[]> ingredientVd, IReadOnlyList<int> counts,
        float tierCoeff, float qFail, float qPerfect, float baseBonus)
    {
        var sum = new float[5];
        for (int i = 0; i < ingredientVd.Count; i++)
            for (int d = 0; d < 5; d++) sum[d] += ingredientVd[i][d] * counts[i];
        var r = NewRange();
        // vd1/vd4/vd5：Σ × tierCoeff × [qFail, qPerfect]，vd1 + baseBonus
        foreach (int d in new[] { DimSatiety, DimHealth, DimVitality })
        {
            float bonus = d == DimSatiety ? baseBonus : 0f;
            float e0 = sum[d] * tierCoeff * qFail + bonus;
            float e1 = sum[d] * tierCoeff * qPerfect + bonus;
            r[d][0] = Math.Min(e0, e1);
            r[d][1] = Math.Max(e0, e1);
        }
        return r; // vd2/vd3 = 产物 4 档配置区间，由调用方经 ExactRange(产物 4 档) 的对应维填入
    }

    /// <summary>该维是否展示：精确口径=4 档全 0 隐藏（对齐官方 EffectText 的 VD==0 跳过）。</summary>
    internal static bool ShouldShow(float[] dimRange) => dimRange[0] != 0f || dimRange[1] != 0f;

    /// <summary>区间文本：min==max 单值；否则 "min~max"；整数不带小数点。</summary>
    internal static string FormatRange(float min, float max)
    {
        if (Math.Abs(max - min) < 0.05f) return F(min);
        return F(min) + "~" + F(max);
    }

    /// <summary>排序比较器（降序）：有键 > 无键垫底（负键算有键）；都无键=0（稳定排序保持原相对序）。</summary>
    internal static int CompareSortKeys(float? a, float? b)
    {
        bool ax = a.HasValue, bx = b.HasValue;
        if (ax && bx) return b.Value.CompareTo(a.Value);
        return ax ? -1 : bx ? 1 : 0;
    }

    private static float[][] NewRange()
    {
        var r = new float[5][];
        for (int d = 0; d < 5; d++) r[d] = new float[2];
        return r;
    }

    private static string F(float v)
    {
        var r = Math.Round(v, 1);
        return r == Math.Floor(r) ? ((int)r).ToString() : r.ToString("0.#");
    }
}
