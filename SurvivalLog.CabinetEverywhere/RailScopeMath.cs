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
