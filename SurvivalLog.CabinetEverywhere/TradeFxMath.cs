using System;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// TradeFx 批1 纯数学（零 Il2Cpp 依赖，可独立构建：tools/tradefx-math-test）。
/// 实机批改二批（作者指令=参照 BetterTrade/官方现成物）后天数收缩：数值侧全改官方算子
/// （EvaluateState/ResolveTakeTradeValue/ResolveSelfStockValueRate），本文件只剩 chips 侧
/// 读取规则（「想要」判定含 DemandCategoryMask 多类别位掩码口径——mask&gt;0 优先于单值，
/// rail tradePrefs 旧口径只认单值）与显示格式化。旧复刻数学已删（零漂移=不复刻）。
/// </summary>
internal sealed class TfxTrader
{
    public int DemandCategory;
    public int DemandCategoryMask;
    public int HalfValueCategory;
    public int AidDemandCategory;
    public float Boost;
    public float BoostMax;
    public float HalfRate = 1f;
    public bool IsTradeRunPoint; // 货架/交易点（sellRate 折价适用）——仅视觉色调分类用，数值恒官方
}

internal static class TradeFxMath
{
    /// <summary>想要判定：category&lt;1 恒否；mask&gt;0 位测试优先；无 mask 才看单值。</summary>
    public static bool IsWanted(int category, TfxTrader t)
    {
        if (category < 1) return false;
        if (t.DemandCategoryMask > 0) return (t.DemandCategoryMask & (1 << category)) != 0;
        return t.DemandCategory > 0 && category == t.DemandCategory;
    }

    /// <summary>加成钳：负归 0；BoostMax&gt;0 时取小。</summary>
    public static float ClampedBoost(TfxTrader t)
    {
        if (t.Boost < 0f) return 0f;
        if (t.BoostMax > 0f && t.Boost > t.BoostMax) return t.BoostMax;
        return t.Boost;
    }

    /// <summary>显示取整（远离零的中点）——天平条金数字。</summary>
    public static int Shown(float v) => (int)Math.Round(v, MidpointRounding.AwayFromZero);

    /// <summary>chips 倍率文本：round-2 去尾零（对拍口径=BetterTrade FactorText "0.##"），0.5 特例 ×½。</summary>
    public static string MultText(float v)
    {
        float r = (float)Math.Round(v, 2, MidpointRounding.AwayFromZero);
        if (r == 0.5f) return "×½";
        return "×" + r.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture);
    }
}
