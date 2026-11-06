using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 微型 JSON 解析器（T7，评审 Important 3 提为独立文件）：纯托管、零游戏/BepInEx 依赖
/// （tools/railjson-test 以 Compile Include 链源码测试本文件）。
///
/// 用途：① RailCommands.Enqueue 解析 drain() 返回的命令数组；② RailCommands.LoadNames
/// 解析 cerail_names.json（{"ownerId":"名"}，键带引号合法 JSON）。
///
/// 覆盖形状：object/array/string/整型/bool/null + 全部字符串转义（含 \uXXXX）；
/// 浮点解析为 double 容错（契约无浮点字段）。非预期输入抛 FormatException，
/// 调用方整条/整批丢弃（红线4 风格）。
/// 自带解析器的理由：mod 工程无 Newtonsoft 引用（interop 版 Newtonsoft 的 Il2Cpp 对象
/// 搬运成本高于 ~160 行解析），且契约形状固定、可整批丢弃式容错。
/// 行为基线：tools/railjson-test 13 断言（评审 Important 3 持久工件）。
/// </summary>
internal static class RailJson
{
    /// <summary>解析整个字符串为 JSON 值（object→Dictionary&lt;string,object&gt; / array→List&lt;object&gt; /
    /// string / long / double / bool / null）；尾随非空白内容抛 FormatException。</summary>
    public static object Parse(string s)
    {
        int i = 0;
        var v = JValue(s, ref i);
        JSkipWs(s, ref i);
        if (i != s.Length) throw new FormatException("尾部多余内容 @" + i);
        return v;
    }

    private static void JSkipWs(string s, ref int i)
    {
        while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++;
    }

    private static object JValue(string s, ref int i)
    {
        JSkipWs(s, ref i);
        if (i >= s.Length) throw new FormatException("意外结束");
        switch (s[i])
        {
            case '{':
                {
                    i++;
                    var d = new Dictionary<string, object>();
                    JSkipWs(s, ref i);
                    if (i < s.Length && s[i] == '}') { i++; return d; }
                    while (true)
                    {
                        JSkipWs(s, ref i);
                        if (i >= s.Length || s[i] != '"') throw new FormatException("对象键非字符串 @" + i);
                        var k = JString(s, ref i);
                        JSkipWs(s, ref i);
                        if (i >= s.Length || s[i] != ':') throw new FormatException("对象缺冒号 @" + i);
                        i++;
                        d[k] = JValue(s, ref i);
                        JSkipWs(s, ref i);
                        if (i >= s.Length) throw new FormatException("对象意外结束");
                        if (s[i] == ',') { i++; continue; }
                        if (s[i] == '}') { i++; return d; }
                        throw new FormatException("对象缺 ,/} @" + i);
                    }
                }
            case '[':
                {
                    i++;
                    var l = new List<object>();
                    JSkipWs(s, ref i);
                    if (i < s.Length && s[i] == ']') { i++; return l; }
                    while (true)
                    {
                        l.Add(JValue(s, ref i));
                        JSkipWs(s, ref i);
                        if (i >= s.Length) throw new FormatException("数组意外结束");
                        if (s[i] == ',') { i++; continue; }
                        if (s[i] == ']') { i++; return l; }
                        throw new FormatException("数组缺 ,/] @" + i);
                    }
                }
            case '"': return JString(s, ref i);
            case 't':
                if (i + 4 <= s.Length && s.Substring(i, 4) == "true") { i += 4; return true; }
                throw new FormatException("坏字面量 @" + i);
            case 'f':
                if (i + 5 <= s.Length && s.Substring(i, 5) == "false") { i += 5; return false; }
                throw new FormatException("坏字面量 @" + i);
            case 'n':
                if (i + 4 <= s.Length && s.Substring(i, 4) == "null") { i += 4; return null; }
                throw new FormatException("坏字面量 @" + i);
            default:
                return JNumber(s, ref i);
        }
    }

    private static string JString(string s, ref int i)
    {
        i++; // 跳过开引号
        var sb = new StringBuilder();
        while (true)
        {
            if (i >= s.Length) throw new FormatException("字符串意外结束");
            char c = s[i++];
            if (c == '"') return sb.ToString();
            if (c != '\\') { sb.Append(c); continue; }
            if (i >= s.Length) throw new FormatException("转义意外结束");
            char e = s[i++];
            switch (e)
            {
                case '"': sb.Append('"'); break;
                case '\\': sb.Append('\\'); break;
                case '/': sb.Append('/'); break;
                case 'b': sb.Append('\b'); break;
                case 'f': sb.Append('\f'); break;
                case 'n': sb.Append('\n'); break;
                case 'r': sb.Append('\r'); break;
                case 't': sb.Append('\t'); break;
                case 'u':
                    if (i + 4 > s.Length) throw new FormatException("\\u 意外结束");
                    sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                    i += 4;
                    break;
                default: throw new FormatException("坏转义 \\" + e);
            }
        }
    }

    private static object JNumber(string s, ref int i)
    {
        int start = i;
        if (i < s.Length && (s[i] == '-' || s[i] == '+')) i++;
        bool frac = false;
        while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '-' || s[i] == '+'))
        {
            if (s[i] == '.' || s[i] == 'e' || s[i] == 'E') frac = true;
            i++;
        }
        if (i == start) throw new FormatException("非法数字 @" + i);
        string tok = s.Substring(start, i - start);
        if (!frac && long.TryParse(tok, NumberStyles.Integer, CultureInfo.InvariantCulture, out var l)) return l;
        return double.Parse(tok, CultureInfo.InvariantCulture); // 契约无浮点字段；仅容错
    }
}
