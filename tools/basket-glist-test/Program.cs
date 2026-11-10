// BasketAid 纯逻辑行为基线测试（篮子救援 glist Task 1，计划钉死全部断言值）。
// 分值本体=官方 NeighborRules.CalcSendProgress 差分（Il2Cpp，不可离线跑）；
// 本工程只钉三态判定/SelfCheck 门限/JSON 契约形状（spec §4 B' + §5.1）。
// 断言失败 → 打印 FAIL 行 → 进程非零码退出（railjson-test 同款）。
using SurvivalLog.CabinetEverywhere;

int failures = 0;
int passed = 0;

void Ok(bool cond, string name, string detail = "")
{
    if (cond) { passed++; Console.WriteLine($"PASS {name} {detail}"); }
    else { failures++; Console.WriteLine($"FAIL {name} {detail}"); }
}
bool NoCollapse(string json) { return json.IndexOf(",,", StringComparison.Ordinal) < 0 && json.IndexOf("[,", StringComparison.Ordinal) < 0 && json.IndexOf(",]", StringComparison.Ordinal) < 0; }

// ---- ModeOf：三态判定（dying > noWish(无许愿/还在想) > wish；away 不可达不设态）----
Ok(BasketAid.ModeOf(dying: true, wishPending: false, wishCatCount: 2) == "dying", "01_mode_dying优先", "dying 压过一切");
Ok(BasketAid.ModeOf(dying: true, wishPending: true, wishCatCount: 0) == "dying", "02_mode_dying压pending");
Ok(BasketAid.ModeOf(dying: false, wishPending: true, wishCatCount: 3) == "nowish", "03_mode_pending=nowish", "还在想=无许愿形态");
Ok(BasketAid.ModeOf(dying: false, wishPending: false, wishCatCount: 0) == "nowish", "04_mode_无许愿类=nowish", "第三段无配置");
Ok(BasketAid.ModeOf(dying: false, wishPending: false, wishCatCount: 2) == "wish", "05_mode_正常许愿");

// ---- SelfCheckOk：|Δ|≤0.5 门限 ----
Ok(BasketAid.SelfCheckOk(50, 50), "06_check_相等过");
Ok(BasketAid.SelfCheckOk(50.4f, 50), "07_check_0.4过");
Ok(!BasketAid.SelfCheckOk(50.6f, 50), "08_check_0.6不过");
Ok(!BasketAid.SelfCheckOk(49, 50), "09_check_整数差1不过");

// ---- BuildJson：契约形状（Task 2/5/6 消费：JS 按此解析）----
{
    var m = new BktModel
    {
        Mode = "wish",
        Chips = new List<(int, string, bool)> { (9, "材料", false), (2, "药品", true) },
        Scores = new Dictionary<string, int> { { "2168", 21 }, { "20214|u3/5", 6 } },
        Forbid = new List<int> { 3011, 3015 }
    };
    string j = BasketAid.BuildJson(m);
    Ok(j == "{\"mode\":\"wish\",\"chips\":[{\"id\":9,\"name\":\"材料\",\"warn\":false},{\"id\":2,\"name\":\"药品\",\"warn\":true}],\"scores\":{\"2168\":21,\"20214|u3/5\":6},\"forbid\":[3011,3015]}",
       "10_json_wish全形", j);
    Ok(NoCollapse(j), "11_json_无塌陷");
}
{
    var m = new BktModel { Mode = "nowish", Chips = new List<(int, string, bool)>(), Scores = null, Forbid = new List<int>() };
    string j = BasketAid.BuildJson(m);
    Ok(j == "{\"mode\":\"nowish\",\"chips\":[],\"scores\":{},\"forbid\":[]}", "12_json_空集形状", j);
}
{
    var m = new BktModel { Mode = "dying", Chips = new List<(int, string, bool)> { (1, "食物", false) }, Scores = null, Forbid = new List<int>() };
    Ok(BasketAid.BuildJson(m) == "{\"mode\":\"dying\",\"chips\":[{\"id\":1,\"name\":\"食物\",\"warn\":false}],\"scores\":{},\"forbid\":[]}", "13_json_dying形");
}
{
    // 注入用例：name 含引号/逗号/反斜杠 → 转义且无 ",,"（RailUi.cs 手搓 JSON 红线）
    var m = new BktModel { Mode = "wish", Chips = new List<(int, string, bool)> { (9, "材,料\"x\\y", false) }, Scores = null, Forbid = new List<int>() };
    string j = BasketAid.BuildJson(m);
    Ok(NoCollapse(j), "14_json_注入无塌陷", j);
    Ok(j.IndexOf("材,料\\\"x\\\\y", StringComparison.Ordinal) >= 0, "15_json_转义正确");
}
Ok(BasketAid.BuildJson(null) == null, "16_json_null进null出");

Console.WriteLine(failures == 0 ? $"ALL PASS ({passed})" : $"{failures} FAILED / {passed} passed");
return failures == 0 ? 0 : 1;
