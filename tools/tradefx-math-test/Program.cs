// TradeFxMath 纯数学行为基线测试（批1 Task 1，计划钉死全部断言值）。
// 公式来源=游戏本体（gamekb 反推）；BetterTrade 反编译仅对拍参照。
// 断言失败 → 打印 FAIL 行 → 进程非零码退出（railjson-test 同款）。
using SurvivalLog.CabinetEverywhere;

int failures = 0;
int passed = 0;

void Ok(bool cond, string name, string detail = "")
{
    if (cond) { passed++; Console.WriteLine($"PASS {name} {detail}"); }
    else { failures++; Console.WriteLine($"FAIL {name} {detail}"); }
}


// ---- IsWanted：mask 位掩码优先，无 mask 才看单值 ----
{
    var t = new TfxTrader { DemandCategoryMask = 1 << 3, DemandCategory = 1 };
    Ok(TradeFxMath.IsWanted(3, t), "04_want_mask命中");
    Ok(!TradeFxMath.IsWanted(1, t), "05_want_mask优先于单值", "mask>0 时单值不生效");
}
{
    var t = new TfxTrader { DemandCategory = 3 };
    Ok(TradeFxMath.IsWanted(3, t), "06_want_无mask单值命中");
    Ok(!TradeFxMath.IsWanted(2, t), "07_want_无mask单值不中");
}
Ok(!TradeFxMath.IsWanted(0, new TfxTrader { DemandCategory = 0, DemandCategoryMask = 1 << 0 }), "08_want_类别小于1恒否");

// ---- ClampedBoost ----
Ok(TradeFxMath.ClampedBoost(new TfxTrader { Boost = -0.2f }) == 0f, "09_boost_负归零");
Ok(TradeFxMath.ClampedBoost(new TfxTrader { Boost = 0.8f, BoostMax = 0.5f }) == 0.5f, "10_boost_max取小");
Ok(TradeFxMath.ClampedBoost(new TfxTrader { Boost = 0.8f, BoostMax = 0f }) == 0.8f, "11_boost_max0不钳");






// ================= TradeFxJson（批1 Task 2）：契约冻结 =================
{
    var m = new TfxModel
    {
        Mode = "trade",
        Wants = new List<(string, string)> { ("食物", "×1.5"), ("药品", "×½") },
        Half = new List<(string, string)> { ("材料", "×0.5") },
        Bar = (84, 30, 12, true),
    };
    Ok(TradeFxJson.Build(m) == "{\"mode\":\"trade\",\"trader\":{\"wants\":[{\"n\":\"食物\",\"x\":\"×1.5\"},{\"n\":\"药品\",\"x\":\"×½\"}],\"half\":[{\"n\":\"材料\",\"x\":\"×0.5\"}]},\"bar\":{\"offer\":84,\"goods\":30,\"dealLine\":12,\"picked\":true},\"shelf\":{},\"items\":{}}",
        "25_json_全量形状", TradeFxJson.Build(m));
}
{
    var m = new TfxModel { Mode = "trade", Wants = new List<(string, string)>(), Half = new List<(string, string)>(), Bar = null };
    Ok(TradeFxJson.Build(m) == "{\"mode\":\"trade\",\"trader\":{\"wants\":[],\"half\":[]},\"bar\":null,\"shelf\":{},\"items\":{}}",
        "26_json_空组与nullBar", TradeFxJson.Build(m));
}
{
    var m = new TfxModel { Mode = "none" };
    Ok(TradeFxJson.Build(m) == "{\"mode\":\"none\"}", "27_json_none恰形", TradeFxJson.Build(m));
}
{
    // 转义与禁形：值含 , " \ ——输出不得出现 ",," / "[,"（Global Constraints），转义必须正确
    var m = new TfxModel
    {
        Mode = "trade",
        Wants = new List<(string, string)> { ("a,b\"c\\d", "×1") },
        Half = new List<(string, string)>(),
        Bar = (1, 2, 0, false),
    };
    string j = TradeFxJson.Build(m);
    Ok(!j.Contains(",,"), "28_json_禁形连续逗号", j);
    Ok(!j.Contains("[,"), "29_json_禁形数组首逗号", j);
    Ok(j.Contains("\\\""), "30_json_引号转义", j);
}

// ---- MultText：chips 倍率文本（终审 I2——整数化会 ×1.5→×2 破坏对拍口径） ----
Ok(TradeFxMath.MultText(1.5f) == "×1.5", "31_mult_一五", TradeFxMath.MultText(1.5f));
Ok(TradeFxMath.MultText(1f) == "×1", "32_mult_整一", TradeFxMath.MultText(1f));
Ok(TradeFxMath.MultText(0.7f) == "×0.7", "33_mult_零七", TradeFxMath.MultText(0.7f));
Ok(TradeFxMath.MultText(0.5f) == "×½", "34_mult_半", TradeFxMath.MultText(0.5f));
Ok(TradeFxMath.MultText(2.25f) == "×2.25", "35_mult_两位", TradeFxMath.MultText(2.25f));
Ok(TradeFxMath.MultText(1.05f) == "×1.05", "36_mult_补零", TradeFxMath.MultText(1.05f));

// ---- items/shelf 非空形状（批2 提前批） ----
{
    var m = new TfxModel { Mode = "trade", Wants = new List<(string, string)>(), Half = new List<(string, string)>(),
        Items = new List<(long, int, string, string, string)> { (8589966566L, 38, "w", "×1.3", "2/4"), (8589966567L, 5, "f", null, null) },
        Shelf = new List<(int, int, string)> { (55001, 20, "5次") } };
    string j = TradeFxJson.Build(m);
    Ok(j.Contains("\"items\":{\"8589966566\":{\"v\":38,\"t\":\"w\",\"m\":\"×1.3\",\"u\":\"2/4\"},\"8589966567\":{\"v\":5,\"t\":\"f\"}}")
       && j.Contains("\"shelf\":{\"55001\":{\"v\":20,\"u\":\"5次\"}}"), "37_json_items_shelf", j);
}

Console.WriteLine(failures == 0 ? $"ALL PASS ({passed})" : $"{failures} FAIL / {passed} PASS");
return failures == 0 ? 0 : 1;
