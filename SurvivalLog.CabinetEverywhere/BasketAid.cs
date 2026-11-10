using System;
using System.Collections.Generic;
using System.Text;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 篮子救援 glist 纯逻辑（spec 2026-11-09-basket-glist-design §4 B'/§5.1）——零游戏依赖，
/// 可离线单测（tools/basket-glist-test 链接编译）。Il2Cpp 取数/官方算子直调在 BasketGlist.cs。
/// 三态判定：dying（她需要吃的）> nowish（无许愿=第三段无配置 or 还在想）> wish（正常许愿）；
/// away 不可达（篮子不在家窗口打不开，作者裁定 2026-11-09 删除）不设态。
/// </summary>
internal sealed class BktModel
{
    /// <summary>wish|nowish|dying</summary>
    public string Mode = "wish";
    /// <summary>chips 行：id=ItemCategory，warn=危机枚（⚠）</summary>
    public List<(int Id, string Name, bool Warn)> Chips = new();
    /// <summary>行键 → 下一件实时边际分（行键=纯 cfgId 或 "cfg|u<uses>/<usesMax>" 多次使用物品
    /// 拆行口径——实机批改#1；SelfCheck 失败置 null=空集渲染，徽章/排序牌隐）</summary>
    public Dictionary<string, int> Scores = new();
    /// <summary>篮子禁入 cfg（NeighborRules.IsBasketForbidItem 口径，行置灰）</summary>
    public List<int> Forbid = new();
}

internal static class BasketAid
{
    /// <summary>三态判定。wishPending=快照 wishPending（还在想）；wishCatCount=wishCats 数量。</summary>
    public static string ModeOf(bool dying, bool wishPending, int wishCatCount)
        => dying ? "dying" : (wishPending || wishCatCount <= 0 ? "nowish" : "wish");

    /// <summary>SelfCheck 门限：mod 差分 Σ 与官方 gain 对账 |Δ|≤0.5（spec §4）。</summary>
    public static bool SelfCheckOk(float modSum, int officialGain)
        => Math.Abs(modSum - officialGain) <= 0.5f;

    /// <summary>ctx.basket 段 JSON（RailData 契约页条件字段，dyePal 先例）。
    /// 手搓纪律同 RailJson：转义 &amp; 禁 ",,"/"[,"（RailUi.cs 红线）；m==null → null。</summary>
    public static string BuildJson(BktModel m)
    {
        if (m == null) return null;
        var sb = new StringBuilder(128);
        sb.Append("{\"mode\":\"").Append(m.Mode).Append("\",\"chips\":[");
        if (m.Chips != null)
            for (int i = 0; i < m.Chips.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append("{\"id\":").Append(m.Chips[i].Id)
                  .Append(",\"name\":\"").Append(Esc(m.Chips[i].Name))
                  .Append("\",\"warn\":").Append(m.Chips[i].Warn ? "true" : "false").Append('}');
            }
        sb.Append("],\"scores\":{");
        if (m.Scores != null)
        {
            bool first = true;
            foreach (var kv in m.Scores)
            {
                if (!first) sb.Append(',');
                first = false;
                sb.Append('"').Append(kv.Key).Append("\":").Append(kv.Value);
            }
        }
        sb.Append("},\"forbid\":[");
        if (m.Forbid != null)
            for (int i = 0; i < m.Forbid.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append(m.Forbid[i]);
            }
        sb.Append("]}");
        return sb.ToString();
    }

    private static string Esc(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var sb = new StringBuilder(s.Length);
        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            switch (c)
            {
                case '\\': sb.Append(@"\\"); break;
                case '"': sb.Append("\\\""); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < ' ') sb.Append(' '); else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }
}
