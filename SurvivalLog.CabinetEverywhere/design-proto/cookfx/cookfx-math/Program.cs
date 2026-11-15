// cookfx-math console 断言（harness-brew-tier 同款自断言工件；运行：sdk dotnet run）
using CookFxMath;
using System;
using System.Collections.Generic;
using System.Linq;

internal static class Program
{
    private static int _fail;

    private static void Eq(string name, object got, object want)
    {
        var ok = Equals(got, want);
        if (!ok) _fail++;
        Console.WriteLine((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  got=" + got + " want=" + want));
    }

    private static string R(float[][] r) => string.Join(",", r.Select(x => x[0].ToString("0.#") + "~" + x[1].ToString("0.#")));

    private static int Main()
    {

// ---- ExactRange：佛跳墙式（饱腹/心态/活力三维非零，精力/生命全 0 隐藏）----
float[][] fotiaoqiang =
{
    new float[]{ 45, 5, 0, 0, 40 },  // perfect
    new float[]{ 38, 4, 0, 0, 34 },  // good
    new float[]{ 31, 3, 0, 0, 28 },  // normal（对齐 gamekb 12315 实值）
    new float[]{ 20, 1, 0, 0, 15 },  // fail
};
var ex = CookingFxMath.ExactRange(fotiaoqiang);
Eq("exact.vd1", R(new[]{ex[0]}), "20~45");
Eq("exact.vd2", R(new[]{ex[1]}), "1~5");
Eq("exact.vd3.show", CookingFxMath.ShouldShow(ex[2]), false);
Eq("exact.vd4.show", CookingFxMath.ShouldShow(ex[3]), false);
Eq("exact.vd5", R(new[]{ex[4]}), "15~40");
Eq("exact.fmt.single", CookingFxMath.FormatRange(31, 31), "31");
Eq("exact.fmt.range", CookingFxMath.FormatRange(ex[0][0], ex[0][1]), "20~45");

// 四档同维全同 → 收敛单值
Eq("exact.const", CookingFxMath.FormatRange(12, 12), "12");
// 小数
Eq("fmt.decimal", CookingFxMath.FormatRange(12.4f, 12.6f), "12.4~12.6");
Eq("fmt.decimal.single", CookingFxMath.FormatRange(12.0f, 12.04f), "12");

// ---- TagRange：肉*2+蔬菜式 ----
// 食材配置行：生肉 vd1=25/vd4=0/vd5=10；蔬菜 vd1=8/vd4=2/vd5=3
var ing = new List<float[]> { new float[]{ 25, 0, 0, 0, 10 }, new float[]{ 8, 0, 0, 2, 3 } };
var cnt = new List<int> { 2, 1 };
// tierCoeff=1.0, qFail=0.6, qPerfect=1.2, baseBonus=3(总数3×1)
var tag = CookingFxMath.TagRange(ing, cnt, 1.0f, 0.6f, 1.2f, 3f);
// vd1: Σ=58 → 58*0.6+3=37.8 / 58*1.2+3=72.6
Eq("tag.vd1", R(new[]{tag[0]}), "37.8~72.6");
// vd4: Σ=2 → 2*0.6=1.2 / 2*1.2=2.4（无 bonus）
Eq("tag.vd4", R(new[]{tag[3]}), "1.2~2.4");
// vd5: Σ=23 → 13.8 / 27.6
Eq("tag.vd5", R(new[]{tag[4]}), "13.8~27.6");
// 负值食材（有毒物 vd1=-10×2）：Σ=-20 → ×[0.5,1]+2 = {-8,-18}，归一后 [-18,-8]
var neg = CookingFxMath.TagRange(new List<float[]>{ new float[]{ -10, -3, 0, 0, 0 } }, new List<int>{ 2 }, 1f, 0.5f, 1f, 2f);
Eq("tag.neg.vd1", R(new[]{neg[0]}), "-18~-8");

// ---- CompareSortKeys：降序 + 无键垫底 ----
Eq("cmp.desc", CookingFxMath.CompareSortKeys(31f, 20f), -1);
Eq("cmp.eq", CookingFxMath.CompareSortKeys(31f, 31f), 0);
Eq("cmp.missing.a", CookingFxMath.CompareSortKeys(null, 1f), 1);
Eq("cmp.missing.b", CookingFxMath.CompareSortKeys(1f, null), -1);
Eq("cmp.missing.both", CookingFxMath.CompareSortKeys(null, null), 0);
// 稳定排序端到端：有键降序在前，无键保持官方相对序垫底
var rows = new (int rid, float? key)[] { (1, 31), (2, null), (3, 45), (4, null), (5, 20) };
var sorted = rows.Select((r, i) => (r, i))
    .OrderBy(x => x.r.key.HasValue ? 0 : 1)
    .ThenByDescending(x => x.r.key ?? float.MinValue)
    .ThenBy(x => x.i)
    .Select(x => x.r.rid).ToArray();
Eq("stable.sort", string.Join(",", sorted), "3,1,5,2,4");

Console.WriteLine(_fail == 0 ? "ALL PASS" : _fail + " FAILED");
        return _fail;
    }
}
