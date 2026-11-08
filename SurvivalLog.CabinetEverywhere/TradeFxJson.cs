using System.Collections.Generic;
using System.Text;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>TradeFx 页面数据模型（批1-2 全模式）。</summary>
internal sealed class TfxModel
{
    public string Mode; // trade | supply | camp | donate | request | none
    public List<(string N, string X)> Wants = new();
    public List<(string, string X)> Half = new();
    public (int Offer, int Goods, int DealLine, bool Picked)? Bar;
    /// <summary>每格数值：trade=官方单件出售值；supply/camp=补给量；donate=饱腹；request=+N。
    /// (logicId, 值, 色调 f/l/w/d, 想要倍率|行名, 使用文本)。</summary>
    public List<(long Id, int V, string T, string M, string U)> Items = new();
    /// <summary>货架单价（官方 ResolveTakeTradeValue）：configId → 单价。</summary>
    public List<(int Cid, int Unit, string U)> Shelf = new();
    /// <summary>supply：选中 give 药品总计（B10）。</summary>
    public int? Medicine;
    /// <summary>request 需求行（B8）：按 targets 顺序（JS 与 .sup-row 索引 zip）。</summary>
    public List<(int K, int Id, List<(int Need, int Paid, bool Done, int Item)> Rows)> Requests = new();
    /// <summary>物品对象（官方 AppendShelfJson）：tooltip/图标源。</summary>
    public List<(int Cid, string Json)> Objects = new();
    /// <summary>request 奖励（B9）：按 targets 顺序。</summary>
    public List<(int K, int Id, List<(int Cid, int Count)> Gifts)> Rewards = new();
}

/// <summary>
/// 模型→页面 JSON（纯函数，零 Il2Cpp 依赖；契约=harness-tradefx + 单测）。
/// 手搓纪律（RailSortMath 八追终案同铁律）：引号包装语义只出自 Str 一处、元素首件无前导
/// 逗号 → 结构上不可能出现 ",,"/"[,"。mode=none 恰为 {"mode":"none"}。
/// </summary>
internal static class TradeFxJson
{
    public static string Build(TfxModel m)
    {
        if (m == null || m.Mode == "none") return "{\"mode\":\"none\"}";
        var sb = new StringBuilder(512);
        sb.Append("{\"mode\":\"").Append(m.Mode).Append("\"");
        if (m.Mode == "trade")
        {
            sb.Append(",\"trader\":{\"wants\":");
            AppendPairs(sb, m.Wants);
            sb.Append(",\"half\":");
            AppendPairs(sb, m.Half);
            sb.Append("},\"bar\":");
            if (m.Bar is (int offer, int goods, int dealLine, bool picked))
            {
                sb.Append("{\"offer\":").Append(offer)
                  .Append(",\"goods\":").Append(goods)
                  .Append(",\"dealLine\":").Append(dealLine)
                  .Append(",\"picked\":").Append(picked ? "true" : "false").Append('}');
            }
            else sb.Append("null");
            sb.Append(",\"shelf\":{");
            for (int i = 0; i < m.Shelf.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append('"').Append(m.Shelf[i].Cid).Append("\":{\"v\":").Append(m.Shelf[i].Unit);
                if (!string.IsNullOrEmpty(m.Shelf[i].U)) sb.Append(",\"u\":\"").Append(m.Shelf[i].U).Append("\"");
                sb.Append('}');
            }
            sb.Append('}');
        }
        else if (m.Mode == "supply" || m.Mode == "camp")
        {
            sb.Append(",\"medicine\":").Append(m.Medicine.HasValue ? m.Medicine.Value.ToString() : "null");
        }
        else if (m.Mode == "request")
        {
            sb.Append(",\"requests\":[");
            for (int i = 0; i < m.Requests.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append("{\"k\":").Append(m.Requests[i].K).Append(",\"id\":").Append(m.Requests[i].Id).Append(",\"rows\":[");
                var rows = m.Requests[i].Rows;
                for (int j = 0; j < rows.Count; j++)
                {
                    if (j > 0) sb.Append(',');
                    sb.Append("{\"n\":").Append(rows[j].Need).Append(",\"p\":").Append(rows[j].Paid)
                      .Append(",\"d\":").Append(rows[j].Done ? "true" : "false")
                      .Append(",\"i\":").Append(rows[j].Item).Append('}');
                }
                sb.Append("]}");
            }
            sb.Append("],\"rewards\":[");
            for (int i = 0; i < m.Rewards.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append("{\"k\":").Append(m.Rewards[i].K).Append(",\"id\":").Append(m.Rewards[i].Id).Append(",\"g\":[");
                var g = m.Rewards[i].Gifts;
                for (int j = 0; j < g.Count; j++)
                {
                    if (j > 0) sb.Append(',');
                    sb.Append("{\"c\":").Append(g[j].Cid).Append(",\"q\":").Append(g[j].Count).Append('}');
                }
                sb.Append("]}");
            }
            sb.Append("],\"objects\":{");
            for (int i = 0; i < m.Objects.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append('"').Append(m.Objects[i].Cid).Append("\":").Append(m.Objects[i].Json);
            }
            sb.Append('}');
        }
        sb.Append(",\"items\":{");
        for (int i = 0; i < m.Items.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append('"').Append(m.Items[i].Id).Append("\":{\"v\":").Append(m.Items[i].V)
              .Append(",\"t\":\"").Append(m.Items[i].T).Append("\"");
            if (!string.IsNullOrEmpty(m.Items[i].M)) sb.Append(",\"m\":\"").Append(m.Items[i].M).Append("\"");
            if (!string.IsNullOrEmpty(m.Items[i].U)) sb.Append(",\"u\":\"").Append(m.Items[i].U).Append("\"");
            sb.Append('}');
        }
        return sb.Append("}}").ToString();
    }

    private static void AppendPairs(StringBuilder sb, List<(string N, string X)> g)
    {
        if (g == null || g.Count == 0) { sb.Append("[]"); return; }
        sb.Append('[');
        for (int i = 0; i < g.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append("{\"n\":").Append(Str(g[i].N)).Append(",\"x\":").Append(Str(g[i].X)).Append('}');
        }
        sb.Append(']');
    }

    /// <summary>JSON 字符串引用器（唯一引号包装点）：转义引号/反斜杠与控制字符。</summary>
    private static string Str(string s)
    {
        var sb = new StringBuilder((s?.Length ?? 0) + 2).Append('"');
        if (!string.IsNullOrEmpty(s))
        {
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
        }
        return sb.Append('"').ToString();
    }
}
