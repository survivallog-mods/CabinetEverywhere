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

Console.WriteLine($"\n{passed} passed, {failures} failed");
return failures == 0 ? 0 : 1;
