// RailScopeMath 纯逻辑行为测试（储物数据链瘦身：事件脏集/按页范围/列表筛选/入库结果）。
// 断言失败 → 打印 FAIL 行 → 进程以非零码退出（railjson-test 同款口径）。
using SurvivalLog.CabinetEverywhere;

int failures = 0;
int passed = 0;

void Ok(bool cond, string name, string detail = "")
{
    if (cond) { passed++; Console.WriteLine($"PASS {name} {detail}"); }
    else { failures++; Console.WriteLine($"FAIL {name} {detail}"); }
}

// ---- 事件脏集 RailDirtySet（Task 1）----
{
    var s = new RailDirtySet();
    Ok(!s.ScopedDirty(null), "d01_初始不脏");
}
{
    var s = new RailDirtySet();
    s.MarkOwner(5);
    Ok(s.ScopedDirty(null), "d02_标记owner后空范围视为全量即脏");
    s.Clear();
    Ok(!s.ScopedDirty(null), "d03_清后不脏");
}
{
    var s = new RailDirtySet();
    s.MarkGlobal();
    Ok(s.ScopedDirty(null), "d04_全局脏");
    Ok(s.ScopedDirty(new List<long>()), "d05_全局脏无视范围");
    s.Clear();
    Ok(!s.ScopedDirty(new List<long>()), "d06_清全局");
}
{
    var s = new RailDirtySet();
    s.MarkOwner(0); s.MarkOwner(-3);
    Ok(!s.ScopedDirty(null), "d07_非正owner忽略");
}
{
    var s = new RailDirtySet();
    s.MarkOwner(5);
    Ok(s.ScopedDirty(new List<long> { 1, 5 }), "d08_范围内owner脏");
    Ok(!s.ScopedDirty(new List<long> { 1, 2 }), "d09_范围外owner不触发");
}

// ---- 按页推送范围 RailScope.Compose（Task 2）----
List<long> Fill(long bag, long current, long[] allCtn, bool bagOnly, bool fullHouse)
{
    var fill = new List<long>();
    RailScope.Compose(bag, current, allCtn, bagOnly, fullHouse, fill);
    return fill;
}
bool Seq(List<long> a, params long[] e) { return a.Count == e.Length && Enumerable.Range(0, e.Length).All(i => a[i] == e[i]); }

{
    Ok(Seq(Fill(100, 0, new long[] { 1, 2 }, true, false), 100), "s01_bagOnly只推背包");
}
{
    Ok(Seq(Fill(100, 5, new long[] { 1, 2, 5 }, false, false), 100, 5), "s02_常规=背包+当前柜");
}
{
    Ok(Seq(Fill(100, 5, new long[] { 5, 1, 2 }, true, true), 100, 5, 1, 2), "s03_全量=背包+全部柜去重保持序");
}
{
    Ok(Seq(Fill(100, 0, new long[] { 1, 2 }, false, false), 100), "s04_当前柜未知退化为背包");
}
{
    Ok(Seq(Fill(100, 100, new long[] { 1 }, false, false), 100), "s05_当前柜=背包去重");
}
{
    Ok(Seq(Fill(0, 5, new long[] { 5, 1 }, false, false), 5), "s06_背包owner未知仍带当前柜");
}
{
    Ok(Seq(Fill(100, 5, new long[] { 100, 5, 7, 5 }, true, true), 100, 5, 7), "s07_全量含重复与背包重叠去重");
}

// ---- 五列表页/吊栏行筛选 RailGlistRule（Task 3）----
{
    Ok(RailGlistRule.Keep("Heater", true, false, 0, 0f, false), "g01_暖炉可燃物保留");
    Ok(!RailGlistRule.Keep("Heater", false, true, 2, 99f, true), "g02_暖炉非可燃滤掉（其余维度无关）");
    Ok(RailGlistRule.Keep("FuelGenerator", true, false, 0, 0f, false), "g03_发电机同暖炉口径");
    Ok(RailGlistRule.Keep("DyePanel", false, true, 0, 0f, false), "g04_染料桶有色素保留");
    Ok(!RailGlistRule.Keep("DyePanel", true, false, 1, 50f, true), "g05_染料桶无色素滤掉");
    Ok(RailGlistRule.Keep("RatCage", false, false, 1, 0f, false), "g06_老鼠笼活体猎物保留");
    Ok(RailGlistRule.Keep("RatCage", false, false, 2, 0f, false), "g07_老鼠笼死体猎物保留");
    Ok(RailGlistRule.Keep("RatCage", false, false, 0, 12.5f, false), "g08_老鼠笼有饱腹食物保留");
    Ok(!RailGlistRule.Keep("RatCage", false, false, 0, 0f, false), "g09_老鼠笼无饱腹非猎物滤掉");
    Ok(RailGlistRule.Keep("BrewPanel", false, false, 0, 30f, true), "g10_酿酒桶可酿且有值保留");
    Ok(!RailGlistRule.Keep("BrewPanel", false, false, 0, 30f, false), "g11_酿酒桶不可酿滤掉");
    Ok(!RailGlistRule.Keep("BrewPanel", false, false, 0, 0f, true), "g12_酿酒桶可酿无值滤掉");
    Ok(RailGlistRule.Keep("Cooking", false, false, 0, 0f, false), "g13_非列表页恒保留");
}
{
    var d = RailGlistRule.BasketAllowedCats("dying", new int[] { 7, 8 }, 5);
    Ok(d.Count == 1 && d[0] == 1, "g14_垂危=只食物(1)");
    var w = RailGlistRule.BasketAllowedCats("wish", new int[] { 7, 7, 8 }, 5);
    Ok(w.Count == 3 && w.Contains(7) && w.Contains(8) && w.Contains(5), "g15_许愿=许愿类∪危机类去重", string.Join(",", w));
    var n = RailGlistRule.BasketAllowedCats("nowish", null, 9);
    Ok(n.Count == 8 && n.Contains(1) && n.Contains(9) && n.Contains(5) && n.Contains(13) && n.Contains(2) && n.Contains(3) && n.Contains(6) && n.Contains(10), "g16_无许愿=8 固定分类", string.Join(",", n));
    var u = RailGlistRule.BasketAllowedCats(null, null, 0);
    Ok(u.Count == 8, "g17_模式未知按 8 分类兜底");
}
{
    Ok(RailGlistRule.KindKey("木板", null, null, "") == "木板|u-/-|", "g18_种类键=物品名+uses", RailGlistRule.KindKey("木板", null, null, ""));
    Ok(RailGlistRule.KindKey("面包", 3, 5, "1|2|0|0|0") == "面包|u3/5|1|2|0|0|0", "g19_种类键含uses与词条", RailGlistRule.KindKey("面包", 3, 5, "1|2|0|0|0"));
    Ok(RailGlistRule.KindKey("面包", 3, 5, "1|2|0|0|0") != RailGlistRule.KindKey("硬面包", 3, 5, "1|2|0|0|0"), "g20_不同名分键（cfg 口径回归修复）");
}

// ---- 挪位忽略缓存 RailMoveCache（3002 纯挪位/纯缓变抑制——恢复旧 SigOwner「位置不入变化检测」裁定）----
{
    var m = new RailMoveCache();
    Ok(!m.NoteIgnoreable(100, 7, 42, 3), "m01_首见=实质变化");
    Ok(m.NoteIgnoreable(100, 7, 42, 3), "m02_同柜同物同数=纯挪位/缓变，忽略");
    Ok(m.NoteIgnoreable(100, 7, 42, 3), "m03_重复通知仍忽略（幂等）");
    Ok(!m.NoteIgnoreable(100, 7, 42, 4), "m04_数量变=实质变化");
    Ok(!m.NoteIgnoreable(100, 7, 43, 4), "m05_配置变=实质变化");
    Ok(!m.NoteIgnoreable(100, 8, 43, 4), "m06_换柜=实质变化");
    Ok(m.NoteIgnoreable(100, 8, 43, 4), "m07_稳定后继续忽略");
    m.Remove(100);
    Ok(!m.NoteIgnoreable(100, 8, 43, 4), "m08_删除后重见=实质变化（新增路径）");
    m.Clear();
    Ok(!m.NoteIgnoreable(200, 1, 1, 1), "m09_清空后重见=实质变化（换档路径）");
    Ok(!m.NoteIgnoreable(0, 1, 1, 1) && !m.NoteIgnoreable(-5, 1, 1, 1), "m10_非正id不入缓存");
}

// ---- 一键入库结果 RailStoreRes（Task 4）----
{
    Ok(RailStoreRes.Build(new (long, long)[0], 0) == "{\"cabs\":[],\"left\":0}", "r01_空结果");
    Ok(RailStoreRes.Build(new[] { (5L, 3L), (7L, 0L), (9L, 12L) }, 4)
       == "{\"cabs\":[[5,3],[9,12]],\"left\":4}", "r02_跳过零件柜保持序", RailStoreRes.Build(new[] { (5L, 3L), (7L, 0L), (9L, 12L) }, 4));
    Ok(RailStoreRes.Build(new[] { (5L, 1L) }, 99).Contains("\"left\":99"), "r03_留背包件数");
}

Console.WriteLine($"\n{passed} passed, {failures} failed");
return failures == 0 ? 0 : 1;
