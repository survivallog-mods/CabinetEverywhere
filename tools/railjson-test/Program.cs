// RailJson 解析器行为基线测试（T7 评审 Important 3 持久工件）。
// 断言失败 → 打印 FAIL 行 → 进程以非零码退出（CI/脚本可判）。
// 覆盖：T7 原 12 例（空数组/单命令/坏输入×4/全命令形状/字段/转义unicode/大整数/嵌套字面量）
// + 名称文件往返例（评审 Important 1：SaveNames 引号键格式）。
using SurvivalLog.CabinetEverywhere;

int failures = 0;
int passed = 0;

void Ok(bool cond, string name, string detail = "")
{
    if (cond) { passed++; Console.WriteLine($"PASS {name} {detail}"); }
    else { failures++; Console.WriteLine($"FAIL {name} {detail}"); }
}

// ---- T7 原 12 例：合法输入 ----
{
    var v = RailJson.Parse("[]");
    Ok(v is List<object> a && a.Count == 0, "01_空数组");
}
{
    var v = RailJson.Parse("[{\"op\":\"take\",\"ids\":[123,456],\"all\":false,\"from\":789}]");
    Ok(v is List<object> a && a.Count == 1 &&
       a[0] is Dictionary<string, object> o && (string)o["op"] == "take" &&
       o["ids"] is List<object> ids && ids.Count == 2 && (long)ids[0] == 123 && (long)ids[1] == 456 &&
       !(bool)o["all"] && (long)o["from"] == 789,
       "02_单命令字段");
}
{
    var v = RailJson.Parse(
        "[{\"op\":\"put\",\"ids\":[1],\"all\":true,\"to\":2},{\"op\":\"takeAll\",\"from\":3}," +
        "{\"op\":\"putAll\",\"to\":4},{\"op\":\"takeCat\",\"from\":5,\"cat\":9},{\"op\":\"putCat\",\"to\":6,\"cat\":9}," +
        "{\"op\":\"putTag\",\"to\":7},{\"op\":\"tidy\",\"owner\":8},{\"op\":\"storeAll\",\"order\":[10,11]}," +
        "{\"op\":\"rename\",\"owner\":12,\"name\":\"柜子\"},{\"op\":\"setTags\",\"owner\":13,\"tags\":[1,2,3]}]");
    Ok(v is List<object> a && a.Count == 10 &&
       ((Dictionary<string, object>)a[0])["to"] is not null &&
       ((Dictionary<string, object>)a[6])["owner"] is not null &&
       ((Dictionary<string, object>)a[7])["order"] is List<object> order && order.Count == 2,
       "03_全命令形状", $"项={(v is List<object> a2 ? a2.Count : -1)}");
}
{
    var v = RailJson.Parse("[{\"op\":\"rename\",\"owner\":1,\"name\":\"\\u4e2d\\u6587\\\\\\\"x\"}]");
    var name = v is List<object> a && a[0] is Dictionary<string, object> o ? (string)o["name"] : null;
    Ok(name == "中文\\\"x", "04_转义+unicode", $"name=[{name}]");
}
{
    var v = RailJson.Parse("[{\"op\":\"take\",\"ids\":[9999999999],\"all\":true,\"from\":123456789012345}]");
    var from = v is List<object> a && a[0] is Dictionary<string, object> o ? (long)o["from"] : 0L;
    Ok(from == 123456789012345L, "05_大整数owner", $"from={from}");
}
{
    var v = RailJson.Parse("  [ { \"op\" : \"tidy\" , \"owner\" : 1 } ]  ");
    Ok(v is List<object> a && a.Count == 1, "06_空白容忍");
}
{
    var v = RailJson.Parse("[{\"op\":\"rename\",\"owner\":1,\"name\":null,\"extra\":{\"x\":[1,2.5,true,false,null]}}]");
    var ex = v is List<object> a && a[0] is Dictionary<string, object> o &&
             o["extra"] is Dictionary<string, object> e && e["x"] is List<object> x ? x : null;
    Ok(ex != null && ex.Count == 5 && ex[1] is double && (bool)ex[2] && ex[4] == null,
       "07_null嵌套浮点字面量");
}

// ---- T7 原 12 例：非法输入整批拒绝（RailJson.Parse 必抛）----
bool Throws(string json)
{
    try { RailJson.Parse(json); return false; }
    catch (FormatException) { return true; }
    catch (Exception) { return false; } // 解析器契约：只抛 FormatException
}
Ok(Throws("[{\"op\":\"take\""), "08_坏JSON缺括号拒绝");
Ok(Throws("[{\"op\":\"take\",\"ids\":[1,],\"all\":true,\"from\":2}]"), "09_坏JSON尾逗号拒绝");
Ok(Throws("[{\"op\":\"tidy\"}] garbage"), "10_尾部多余拒绝");
{
    // 原 T7 例"顶层非数组"：解析器接受顶层对象，但结果非 List → Enqueue 判"非数组"整批丢弃
    var v = RailJson.Parse("{\"op\":\"tidy\"}");
    Ok(v is not List<object>, "11_顶层非数组整批丢弃");
}
Ok(Throws(""), "12_空串拒绝");

// ---- 评审 Important 1 回归：SaveNames 引号键格式往返 ----
{
    // SaveNames 写出形如 {"123":"名","456":"x\"y"}（键带引号）；模拟 LoadNames 解析路径
    var v = RailJson.Parse("{\"123\":\"名\",\"456\":\"x\\\"y\",\"0x\":1}");
    Ok(v is Dictionary<string, object> root && root.Count == 3 &&
       long.TryParse("123", out var id1) && (string)root["123"] == "名" &&
       (string)root["456"] == "x\"y" &&
       !long.TryParse("0x", out _), // 非数字键 → LoadNames 跳过该条
       "13_名称文件引号键往返",
       $"count={(v is Dictionary<string, object> d ? d.Count : -1)}");
}

Console.WriteLine($"---- {passed} passed, {failures} failed ----");
return failures == 0 ? 0 : 1;
