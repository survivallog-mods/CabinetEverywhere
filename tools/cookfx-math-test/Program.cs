// cookfx-math-test console 断言（自断言工件，源自 design-proto/cookfx spike 20/20 绿集）
using SurvivalLog.CabinetEverywhere;
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
        // 负键算有键：排无键前（Review Focus 5 锁死）
        Eq("cmp.negative-vs-missing", CookingFxMath.CompareSortKeys(-6f, null), -1);
        // 稳定排序端到端：有键降序在前，无键保持官方相对序垫底
        var rows = new (int rid, float? key)[] { (1, 31), (2, null), (3, 45), (4, null), (5, 20) };
        var sorted = rows.Select((r, i) => (r, i))
            .OrderBy(x => x.r.key.HasValue ? 0 : 1)
            .ThenByDescending(x => x.r.key ?? float.MinValue)
            .ThenBy(x => x.i)
            .Select(x => x.r.rid).ToArray();
        Eq("stable.sort", string.Join(",", sorted), "3,1,5,2,4");

        // ---- T2/实机定版+批改4: BuildRecipeTableJson（键=菜名；值=[vd1..5, id, cookExp]——
        //      尾 id 兼同值 tiebreak，cookExp=经验排序维；Normal 档=productIds[2]）----
        var vdMap = new Dictionary<int, float[]>
        {
            [12313] = new float[]{ 45, 5, 0, 0, 40 },  // 佛跳墙 perfect
            [12314] = new float[]{ 38, 4, 0, 0, 34 },  // good
            [12315] = new float[]{ 31, 3, 0, 0, 28 },  // normal（键位口径）
            [12316] = new float[]{ 20, 1, 0, 0, 15 },  // fail
            [12317] = new float[]{ 52, 8, 0, 5, 12 },  // 全家桶 normal
        };
        float[] VdOf(int id) => vdMap.TryGetValue(id, out var v) ? v : null;
        var tbl = CookingFxData.BuildRecipeTableJson(
            new[] { (1001, "佛跳墙", 175, new[] { 12313, 12314, 12315, 12316 }), (1002, "全家桶", 140, new[] { 90001, 90002, 12317, 90003 }) },
            VdOf);
        Eq("table.json", tbl, "{\"佛跳墙\":[31,3,0,0,28,1001,175],\"全家桶\":[52,8,0,5,12,1002,140]}");
        // 产物缺配置（vdOf null）→ 该菜谱整条跳过（无键垫底语义）
        var tblMiss = CookingFxData.BuildRecipeTableJson(new[] { (1003, "焦炭布丁", 10, new[] { 1, 2, 3, 4 }) }, VdOf);
        Eq("table.json.missSkip", tblMiss, "{}");

        // ---- T2: ReadCoeffs（GlobalSetting 四系数；缺键回退 1.0）----
        var gsAll = new Dictionary<string, float>
        {
            ["CookingVD_QualityCoeff_Fail"] = 0.6f,
            ["CookingVD_QualityCoeff_Normal"] = 1.0f,
            ["CookingVD_QualityCoeff_Good"] = 1.1f,
            ["CookingVD_QualityCoeff_Perfect"] = 1.2f,
            ["CookingVD_TierCoeff_High"] = 1.1f,
            ["CookingVD_TierCoeff_Mid"] = 1.0f,
            ["CookingVD_TierCoeff_Low"] = 0.9f,
        };
        float? GsAll(string k) => gsAll.TryGetValue(k, out var v) ? v : null;
        Eq("coeffs.all", string.Join(",", CookingFxData.ReadCoeffs(GsAll)), "0.6,1,1.1,1.2,1.1,1,0.9");
        float? GsNone(string _) => null;
        Eq("coeffs.missingFallback", string.Join(",", CookingFxData.ReadCoeffs(GsNone)), "1,1,1,1,1,1,1");

        // ---- T4: BuildIconPackJson（官方字形包；AttrName 枚举 1..5=Satiety..Vitality → d0..d4）----
        var icons = CookingFxData.BuildIconPackJson(new[]
        {
            (1, "🍗"), (2, "🙂"), (3, "⚡"), (4, "❤"), (5, "💪"),
        });
        Eq("icons.full", icons, "{\"d0\":\"🍗\",\"d1\":\"🙂\",\"d2\":\"⚡\",\"d3\":\"❤\",\"d4\":\"💪\"}");
        // 空/越界字形不输出该键（JS 侧该维回退 SVG）
        var iconsPartial = CookingFxData.BuildIconPackJson(new[] { (1, "🍗"), (2, ""), (3, null), (9, "x"), (4, "❤") });
        Eq("icons.partial", iconsPartial, "{\"d0\":\"🍗\",\"d3\":\"❤\"}");

        // ---- T5: BuildPredEntryJson（这一锅区间条目；四维渲染白名单 d0..d3=饱腹/心态/精力/生命）----
        // 批改7 根因纠正：游戏文案 Vitality=「生命」/Health=「健康」(不显示)——生命位绑 VD5(Vitality)
        // exact 路：4 档产物 → dims=四维 [min,max]，全 0 维 null
        var entry = CookingFxData.BuildPredEntryJson(1002, "全家桶", isExact: true, fotiaoqiang,
            null, null, new[] { 0.6f, 1f, 1.1f, 1.2f, 1.1f, 1f, 0.9f }, 3f, 0, 0);
        Eq("pred.exact", entry, "{\"recipeId\":1002,\"name\":\"全家桶\",\"dims\":[[20,45],[1,5],null,[15,40]]}");
        // tag 路（spike 肉*2+蔬菜算例）：vd1=Σ58×角点±bonus3；vd4(生命=VD5)=Σ蔬菜活力3×角点；
        // vd2=产物 4 档 [1,5]；vd3 全 0 → null（修复批 M5：全精度输出）
        var tagEntry = CookingFxData.BuildPredEntryJson(1005, "药膳汤", isExact: false, fotiaoqiang,
            ing, cnt, new[] { 0.6f, 1f, 1.1f, 1.2f, 1.1f, 1f, 0.9f }, 3f, 0, 0);
        Eq("pred.tag", tagEntry, "{\"recipeId\":1005,\"name\":\"药膳汤\",\"dims\":[[34.32,79.56],[1,5],null,[12.42,30.36]]}");
        // tag 负值食材：Σ=-20，角点 min/max 归一；vd2 仍取产物 4 档（官方公式：vd2/vd3=产物配置）
        var negEntry = CookingFxData.BuildPredEntryJson(1007, "烤老鼠", isExact: false, fotiaoqiang,
            new List<float[]> { new float[] { -10, -3, 0, 0, 0 } }, new List<int> { 2 },
            new[] { 0.6f, 1f, 1.1f, 1.2f, 1.1f, 1f, 0.9f }, 2f, 0, 0);
        Eq("pred.tag.neg", negEntry, "{\"recipeId\":1007,\"name\":\"烤老鼠\",\"dims\":[[-24.4,-8.8],[1,5],null,null]}");

        // ---- T5: FilterKnownEntries（Level===2 且 RecipeId!==0）----
        var known = CookingFxData.FilterKnownEntries(new[] { (1002, 2), (0, 2), (1001, 1), (1005, 2) }).ToArray();
        Eq("pred.filter", string.Join(",", known.Select(k => k.recipeId)), "1002,1005");

        // ---- 修复批: ParsePredictionEntries（PascalCase 官方序 + camelCase 兼容；无 RecipeId 键的异形丢弃，
        //      rid=0/低 level 保留——那是 FilterKnownEntries 的职责分层）----
        var pe = CookingFxData.ParsePredictionEntries(
            "[{\"RecipeId\":1002,\"Name\":\"全家桶\",\"Level\":2,\"IsExact\":true},{\"recipeId\":1005,\"name\":\"药膳汤\",\"level\":2},{\"RecipeId\":0,\"Level\":2},{\"RecipeId\":1001,\"Level\":1},{\"bad\":1}]");
        Eq("predparse.mix", string.Join("|", pe.Select(x => x.rid + "," + x.level + "," + x.name)), "1002,2,全家桶|1005,2,药膳汤|0,2,|1001,1,");
        Eq("predparse.empty", (CookingFxData.ParsePredictionEntries("[]")?.Count ?? 0), 0);
        Eq("predparse.nullSafe", CookingFxData.ParsePredictionEntries(null), null);

        // ---- 修复批 M5: 全精度输出（舍入只留 JS 一处；角点值不再 C# 预舍入；生命位=VD5）----
        var fullEntry = CookingFxData.BuildPredEntryJson(1005, "药膳汤", isExact: false, fotiaoqiang,
            ing, cnt, new[] { 0.6f, 1f, 1.1f, 1.2f, 1.1f, 1f, 0.9f }, 3f, 0, 0);
        Eq("pred.fullprec", fullEntry, "{\"recipeId\":1005,\"name\":\"药膳汤\",\"dims\":[[34.32,79.56],[1,5],null,[12.42,30.36]]}");

        // ---- 批改9: 品质可达档裁剪（minTier 0=Fail..3=Perfect；qLo=QualityFloor+加成 决定）----
        // exact+minTier=2（qLo≥70 只 Good/Perfect）：子集 [P,G] → 饱腹 [38,45]、生命(VD5) [34,40]
        var clip2 = CookingFxData.BuildPredEntryJson(1002, "全家桶", isExact: true, fotiaoqiang,
            null, null, new[] { 0.6f, 1f, 1.1f, 1.2f, 1.1f, 1f, 0.9f }, 3f, 0, 2);
        Eq("pred.clipExact2", clip2, "{\"recipeId\":1002,\"name\":\"全家桶\",\"dims\":[[38,45],[4,5],null,[34,40]]}");
        // exact+minTier=3（恒 Perfect）：单档收敛单值
        var clip3 = CookingFxData.BuildPredEntryJson(1002, "全家桶", isExact: true, fotiaoqiang,
            null, null, new[] { 0.6f, 1f, 1.1f, 1.2f, 1.1f, 1f, 0.9f }, 3f, 0, 3);
        Eq("pred.clipExact3", clip3, "{\"recipeId\":1002,\"name\":\"全家桶\",\"dims\":[[45,45],[5,5],null,[40,40]]}");
        // tag+minTier=1（qLo≥30：Normal..Perfect 系数 [1.0,1.2]）×tier1：vd1=58×1.1×[1,1.2]+3=[66.8,79.56]
        var clipT1 = CookingFxData.BuildPredEntryJson(1005, "药膳汤", isExact: false, fotiaoqiang,
            ing, cnt, new[] { 0.6f, 1f, 1.1f, 1.2f, 1.1f, 1f, 0.9f }, 3f, 1, 1);
        Eq("pred.clipTag1", clipT1, "{\"recipeId\":1005,\"name\":\"药膳汤\",\"dims\":[[66.8,79.56],[3,5],null,[25.3,30.36]]}");

        // ---- 批改8: tier 单值化（GetTierCoeff 还原：tier1→High/2→Mid/3→Low）+ baseBonus 真值 ----
        // tier=1（High=1.1）：vd1=58×[0.6,1.2]×1.1+3 → [41.28,79.56]
        var t1Entry = CookingFxData.BuildPredEntryJson(1005, "药膳汤", isExact: false, fotiaoqiang,
            ing, cnt, new[] { 0.6f, 1f, 1.1f, 1.2f, 1.1f, 1f, 0.9f }, 3f, 1, 0);
        Eq("pred.tier1", t1Entry, "{\"recipeId\":1005,\"name\":\"药膳汤\",\"dims\":[[41.28,79.56],[1,5],null,[15.18,30.36]]}");
        // tier=3（Low=0.9）、baseBonus=6：vd1=58×[0.6,1.2]×0.9+6 → [37.32,68.76]；vd5=23×0.9×[0.6,1.2] → [12.42,24.84]
        var t3Entry = CookingFxData.BuildPredEntryJson(1005, "药膳汤", isExact: false, fotiaoqiang,
            ing, cnt, new[] { 0.6f, 1f, 1.1f, 1.2f, 1.1f, 1f, 0.9f }, 6f, 3, 0);
        Eq("pred.tier3.bonus", t3Entry, "{\"recipeId\":1005,\"name\":\"药膳汤\",\"dims\":[[37.32,68.64],[1,5],null,[12.42,24.84]]}");
        // tier 异常值（0/99）→ 括号区间兜底（旧行为）
        var t9Entry = CookingFxData.BuildPredEntryJson(1005, "药膳汤", isExact: false, fotiaoqiang,
            ing, cnt, new[] { 0.6f, 1f, 1.1f, 1.2f, 1.1f, 1f, 0.9f }, 3f, 99, 0);
        Eq("pred.tierFallback", t9Entry, "{\"recipeId\":1005,\"name\":\"药膳汤\",\"dims\":[[34.32,79.56],[1,5],null,[12.42,30.36]]}");

        Console.WriteLine(_fail == 0 ? "ALL PASS" : _fail + " FAILED");
        return _fail;
    }
}
