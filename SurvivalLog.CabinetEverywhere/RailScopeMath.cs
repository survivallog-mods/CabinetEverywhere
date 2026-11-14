using System;
using System.Collections.Generic;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 事件驱动脏集（纯托管零游戏依赖——tools/railscope-test 链源码独立测试，RailJson 同纪律）。
/// ItemChangeSignal（LogicAdapter 3002/3005/3031/3027/21015 prefix）标记；RailData.ItemsDirty /
/// RailUi.FastPoll 读；BuildJson 组装完成后清一次。全部在 Unity 主线程（NotifyGlobal 同步直调），
/// lock 只是防意外的非主线程调用点。
/// </summary>
internal sealed class RailDirtySet
{
    private readonly object _gate = new();
    private readonly HashSet<long> _owners = new();
    private bool _global;

    /// <summary>某 owner 的物品有增删改（3002 dto.OwnerId / 3031 from,to）。owner≤0 忽略。</summary>
    public void MarkOwner(long owner)
    {
        if (owner <= 0) return;
        lock (_gate) _owners.Add(owner);
    }

    /// <summary>全局脏（3005 反查不到 owner / 3027 全刷 / 21015 地面）。</summary>
    public void MarkGlobal()
    {
        lock (_gate) _global = true;
    }

    /// <summary>范围内是否有变化：scope=null 视为全部 owner 都在范围内。只读不清。</summary>
    public bool ScopedDirty(List<long> scope)
    {
        lock (_gate)
        {
            if (_global) return true;
            if (scope == null) return _owners.Count > 0;
            for (int i = 0; i < scope.Count; i++)
                if (_owners.Contains(scope[i])) return true;
            return false;
        }
    }

    /// <summary>组装完成后清（范围外的残留标记一并清——它们不影响本页载荷，无害）。</summary>
    public void Clear()
    {
        lock (_gate) { _owners.Clear(); _global = false; }
    }
}

/// <summary>
/// 按页推送范围组成（spec 2026-11-14-rail-data-slim-design §B，纯逻辑）：interop 侧读好的
/// bag/current/全量名单入参，产出 items 段要拼的 owner 集（ctn 元数据段不受此限——全量保留）。
/// </summary>
internal static class RailScope
{
    /// <summary>范围 = 背包 +（bagOnly=false 时）当前容器；（fullHouse=true 时）全部柜子。
    /// fill 复用调用方列表（零新建）；去重且保持「背包→当前→其余按名单序」稳定。</summary>
    public static void Compose(long bag, long current, IReadOnlyList<long> allCtn, bool bagOnly, bool fullHouse, List<long> fill)
    {
        fill.Clear();
        if (bag > 0) fill.Add(bag);
        if (!bagOnly && current > 0 && !fill.Contains(current)) fill.Add(current);
        if (fullHouse && allCtn != null)
            for (int i = 0; i < allCtn.Count; i++)
                if (allCtn[i] > 0 && !fill.Contains(allCtn[i])) fill.Add(allCtn[i]);
    }
}

/// <summary>
/// 五列表页 + 吊栏的行筛选规则（spec 2026-11-14-rail-data-slim-design §C/§D，纯逻辑——
/// 游戏侧字段由调用方抽成 primitives 传入，与 JS glistAggregate（railui.page.js:4839-4869）
/// 同源同判：可燃=物品级 Burnable（禁从 Category 推导）、色素=有色素点、猎物=Prey（含死体）
/// 或 s1&gt;0、可酿=CanBrew 且 s1&gt;0。吊栏按需求状态类别（JS GLB_NOWISH_CATS 八类同源）。</summary>
internal static class RailGlistRule
{
    /// <summary>五列表页行保留判定。page=场景键；preyKind=0/1/2（RatPreyKind 同值域）；
    /// s1=饱腹排序值（RailSortMath.Stats[0]，无=0）。</summary>
    public static bool Keep(string page, bool burnable, bool hasPig, int preyKind, float s1, bool canBrew)
    {
        switch (page)
        {
            case "Heater":
            case "FuelGenerator": return burnable;
            case "DyePanel": return hasPig;
            case "RatCage": return preyKind != 0 || s1 > 0f;
            case "BrewPanel": return canBrew && s1 > 0f;
            default: return true;
        }
    }

    /// <summary>吊栏允许类别（JS GLB_NOWISH_CATS 同源：食物1/材料9/日用品5/燃料13/药品2/书刊3/工具6/种子10）。
    /// dying=只食物；wish=许愿类∪危机类；nowish（含 mode 未知兜底）=8 固定分类。</summary>
    public static readonly int[] NowishCats = { 1, 9, 5, 13, 2, 3, 6, 10 };

    public static List<int> BasketAllowedCats(string mode, int[] wishCats, int crisisCat)
    {
        var r = new List<int>();
        if (mode == "dying") { r.Add(1); return r; }
        if (mode == "wish")
        {
            if (wishCats != null)
                for (int i = 0; i < wishCats.Length; i++)
                    if (wishCats[i] > 0 && !r.Contains(wishCats[i])) r.Add(wishCats[i]);
            if (crisisCat > 0 && !r.Contains(crisisCat)) r.Add(crisisCat);
            return r;
        }
        r.AddRange(NowishCats);
        return r;
    }

    /// <summary>「已隐藏 N 种」种类键（JS glistItemKey 同粒度=名+uses+attrSig；C# 以 cfg 代名——
    /// 同名异 cfg 极罕见，计一次 vs 两次的差别，页脚数字口径足够）。</summary>
    public static string KindKey(int cfg, int? uses, int? usesMax, string attrSig)
        => cfg + "|u" + (uses.HasValue ? uses.Value.ToString(System.Globalization.CultureInfo.InvariantCulture) : "-")
           + "/" + (usesMax.HasValue ? usesMax.Value.ToString(System.Globalization.CultureInfo.InvariantCulture) : "-")
           + "|" + attrSig;
}
