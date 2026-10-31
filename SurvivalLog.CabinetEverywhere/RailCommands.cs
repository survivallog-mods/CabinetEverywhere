using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using BepInEx;
using Il2CppInterop.Runtime;
using SurvivalLog.ModShared;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// CERail 命令层（T7）：JS→C# 命令通道的执行侧。两段式——
///   ① Enqueue：RailUi.Tick 发 drain()（ExecuteJavaScript 回调，线程/时序不确定），
///      回调内【只解析 JSON 入队】（红线1：ExecuteJavaScript 回调内禁止改游戏数据——
///      JS 桥重入会冻死，事故史；解析是纯 CPU 无游戏对象访问，回调线程执行安全）；
///   ② Pump：AccessTicker 主帧（RailUi.Tick 0.5s 快通道开头）串行执行，每帧上限 8 条，
///      余量留待下帧（红线6）；批量末尾统一 RailData.ForceRepublish() 一次
///      （两个候选方案取"批量末尾一次"——省推送：连点 10 次只涨一包）。
///
/// cmd 契约（T5 冻结 + v1.8.2 增删，railui.page.js 文件头逐字一致；drain 项 = {op 与 payload 平铺}）：
///   rackOpen {owner}   v1.8.2 v13：整理柜跨柜=重放官方 Ac_MaterialRack_Open.SendAction →
///                      State_Web_MaterialRack 整体重绑 → 官方行组件原生重渲染目标柜（见 OpRackOpen）
///   take   {ids:[long...], all:bool, from:ownerId}  all:false=只取【第一叠】1 件（SplitItem 拆 1）→ 背包
///                      （v1.8.2：JS 侧右键 mod 语义已退役不再发出；执行器保留无害）
///   put    {ids:[...], all:bool, to:ownerId}        背包→柜（整理柜左面板右键；all:false 同样只取第一叠 1 件）
///   takeAll{from}        TryMoveBagAll(from→bag)
///   putAll {to}          TryMoveBagAll(bag→to)
///   takeCat{from, cat}   C# 按 Config_Item.Category==cat 过滤 from 物品 id → 整批 → 背包
///   putCat {to, cat}     同上 bag→to
///   putTag {to}          读 to 的 FurnitureTagComponent.GetRule() 标签【名】集合（lib 查名），
///                        背包物品分类名命中即入选 → 整批 → to
///   tidy  {owner}        同 owner 内同名叠合并（三路方案见 OpTidy 注释）
///   storeAll{order:[...]} §4.7 路由：物品分类名→柜标签名匹配，order 顺序优先，柜满顺延，无匹配/全满留背包
///   rename{owner, name}  mod 侧持久化 cerail_names.json（≤8 字截断）
///   setTags{owner, tags} FurnitureTagComponent.SetRule；tagId 先经 lib 白名单校验
///
/// 红线对照（suite/docs/03-教训与红线.md）：
///   1. drain 回调只解析入队（ConcurrentQueue，回调线程不确定）；执行全在 Pump（主帧）。✅
///   2. OwnerCache 只白名单——所有 from/to/owner 先验 ∈ CabinetCatalog.AllContainers
///      ownerIds ∪ 背包 owner（RailData.BagOwner 同源），否则整条丢弃+LogWarning。✅
///   3. 不克隆物品对象；不置零源堆；不直接读写 State/Reducer 字段——只用官方 API：
///      ItemManager.TryQuickMoveItems / TryMoveBagAll / SplitItem / SortContainerForHub /
///      MergeStacksForHub、FurnitureTagComponent.GetRule/SetRule（dump.cs 实证签名）；
///      v1.8.2 增：Ac_MaterialRack_Open.SendAction **官方动作重放**（官方静态派发入口，
///      与页面事件到达同一 Reducer 入口——tagfilter forgeSwitch 的 C# 等价物，非伪造数据）。✅
///   4. id 查无（源容器物品字典 TryGetValue 不到）→ 静默跳过计数，不抛不中断整批。✅
///   5. setTags tagIds 过 Config_FurnitureTag_Dict 白名单，未知剔除；剔除后空数组仍 SetRule
///      （=清标签）。✅
///   6. 每帧 8 条上限；ForceRepublish 批量末尾一次。✅
///
/// 结果回传：无 JS 主动回传通道——执行结果经 ForceRepublish 数据差量自然体现 + 日志
/// （Verbose 每命令一行 op/参数/结果计数；失败 WarnOnce）。tidy 失败需让 JS 知道（T12 toast）：
/// 置 RailData.ctx.lastTidyFail=true 一次性标志（推出即清），railui.page.js 由 T12 消费。
/// </summary>
internal static class RailCommands
{
    // ================= 常量 / 状态 =================

    /// <summary>每帧（每次 Pump）执行上限（红线6）。</summary>
    private const int MaxPerPump = 8;

    /// <summary>入队积压上限：达到即抑流（RailUi 本周期不发 drain），防页面失控刷队列。</summary>
    internal const int MaxQueued = 32;

    /// <summary>rename 名称长度上限（与 railui.page.js maxlength=8 同值，C# 侧再截一道）。</summary>
    private const int NameMaxLen = 8;

    /// <summary>TryQuickMoveItems 的 silent 参数：true=不弹官方 toast（结果经数据回推自渲染）。
    /// 官方调用取值静态未见，校准点 T14：若实测官方右键 toast 是期望 UX，翻 false。</summary>
    private const bool SilentQuickMove = true;

    private static string NamesPath => Path.Combine(Paths.BepInExRootPath, "cerail_names.json");

    /// <summary>待执行命令队列（红线1：回调线程 Enqueue，主帧 Pump 消费——ConcurrentQueue）。</summary>
    private static readonly ConcurrentQueue<Cmd> Pending = new();

    internal static int QueueDepth => Pending.Count;

    /// <summary>命令模型（契约字段的扁平载体；缺省=0/false/空——按 op 校验必填项）。</summary>
    private sealed class Cmd
    {
        public string Op;
        public bool All;
        public long From, To, Owner, Cat;
        public string Name;
        public string Key; // v13.5+ sortBy：official/sat/mind/en/hp/value/shelf
        public List<long> Ids = new();
        public List<long> Tags = new();
        public List<long> Order = new();
    }

    // ================= 入队（drain 回调唯一入口——线程不确定，只解析不碰游戏） =================

    /// <summary>
    /// drain 回调入口：解析 JSON 数组入队。可运行在 Vuplex 回调线程——红线1 前提下本方法
    /// 禁止触碰任何游戏对象/State（解析器纯托管，ConcurrentQueue 线程安全）。
    /// 解析失败整批丢弃并 LogWarning 一次（WarnOnce 防坏页每 0.5s 刷屏）。
    /// </summary>
    internal static void Enqueue(string jsonArray)
    {
        if (string.IsNullOrEmpty(jsonArray)) return;
        try
        {
            var parsed = RailJson.Parse(jsonArray);
            // 保险：个别 Vuplex 版本对字符串返回值再 JSON 编码一层（"..."）——拆一层再试。
            // TagFilter.Probe 实证本游戏版本回调收原始字符串，此处只是兜底。
            if (parsed is string inner) parsed = RailJson.Parse(inner);
            if (parsed is not List<object> arr)
            {
                WarnOnce("drainshape", "drain 返回非数组，整批丢弃");
                return;
            }
            int n = 0;
            foreach (var e in arr)
            {
                if (e is not Dictionary<string, object> o) continue;
                var c = ToCmd(o);
                if (c == null) { WarnOnce("cmdshape", "命令缺 op/类型不符，丢弃"); continue; }
                Pending.Enqueue(c);
                n++;
            }
            if (n > 0 && CabinetEverywherePlugin.Verbose?.Value == true)
                CabinetEverywherePlugin.Log.LogInfo($"[CERail] drain 入队 {n} 条（积压 {Pending.Count}）");
        }
        catch (Exception e)
        {
            WarnOnce("drainparse", "drain JSON 解析失败，整批丢弃: " + e.Message);
        }
    }

    /// <summary>契约对象 → Cmd；缺 op 或类型不符返回 null（调用方丢弃该条）。</summary>
    private static Cmd ToCmd(Dictionary<string, object> o)
    {
        if (!o.TryGetValue("op", out var opObj) || opObj is not string op || op.Length == 0) return null;
        var c = new Cmd { Op = op };
        if (o.TryGetValue("all", out var a) && a is bool b) c.All = b;
        c.From = Lng(o, "from");
        c.To = Lng(o, "to");
        c.Owner = Lng(o, "owner");
        c.Cat = Lng(o, "cat");
        if (o.TryGetValue("name", out var nm) && nm is string s) c.Name = s;
        if (o.TryGetValue("key", out var ky) && ky is string ks) c.Key = ks;
        c.Ids = Lngs(o, "ids");
        c.Tags = Lngs(o, "tags");
        c.Order = Lngs(o, "order");
        return c;
    }

    private static long Lng(Dictionary<string, object> o, string k)
    {
        if (!o.TryGetValue(k, out var v)) return 0;
        if (v is long l) return l;
        if (v is double d) return (long)d;
        return 0;
    }

    private static List<long> Lngs(Dictionary<string, object> o, string k)
    {
        var r = new List<long>();
        if (o.TryGetValue(k, out var v) && v is List<object> arr)
            foreach (var e in arr)
            {
                if (e is long l) r.Add(l);
                else if (e is double d) r.Add((long)d);
            }
        return r;
    }

    // ================= 执行泵（主帧，红线6：每帧 8 条） =================

    /// <summary>
    /// AccessTicker 主帧调用（RailUi.Tick 0.5s 快通道开头，场景门控之前——点完即关界面的
    /// 存量命令也要执行）。串行执行 ≤8 条，余量下帧；执行过任何命令则批量末尾
    /// ForceRepublish 一次（红线6 取"批量末尾统一调一次"方案：省推送，rev 门控强制下周期回推）。
    /// </summary>
    internal static void Pump()
    {
        try
        {
            int executed = 0;
            bool mutated = false;
            while (executed < MaxPerPump && Pending.TryDequeue(out var c))
            {
                try { Execute(c); }
                catch (Exception e) { WarnOnce("exec:" + c.Op, "命令 " + c.Op + " 执行异常: " + e.Message); }
                mutated |= c.Op != "rename" && c.Op != "setTags" && c.Op != "rackOpen"; // 物品变更类（Bug3 刷新判定）
                executed++;
            }
            if (executed > 0)
            {
                if (mutated) RailData.RefreshActivePage(); // Bug3：官方格重渲染（直调 API 不触发官方推送）
                // Bug3：重推耗时对账（BuildJson 全量 33 容器×数百行的主帧成本）
                var sw = System.Diagnostics.Stopwatch.StartNew();
                RailData.ForceRepublish();
                long tPush = sw.ElapsedMilliseconds;
                if (CabinetEverywherePlugin.Verbose?.Value == true || tPush > 150)
                    CabinetEverywherePlugin.Log.LogInfo($"[CERail] 命令泵本帧执行 {executed} 条（余量 {Pending.Count}）→ ForceRepublish {tPush}ms（>150ms 常驻打印）");
            }
        }
        catch (Exception e)
        {
            WarnOnce("pump", "命令泵异常: " + e.Message);
        }
    }

    private static void Execute(Cmd c)
    {
        switch (c.Op)
        {
            case "rackOpen": OpRackOpen(c); break; // v1.8.2 v13：整理柜跨柜=官方动作重放（见 OpRackOpen 注释）
            case "take": OpTake(c); break;
            case "put": OpPut(c); break;
            case "takeAll": OpTakeAll(c); break;
            case "putAll": OpPutAll(c); break;
            case "takeCat": OpCat(c, true); break;
            case "putCat": OpCat(c, false); break;
            case "putTag": OpPutTag(c); break;
            case "tidy": OpTidy(c); break;
            case "sortBy": OpSortBy(c); break; // v13.5-v13.8 设施排序：数据层重排（见 OpSortBy 注释）
            case "uiShow": OpUiShow(c); break; // 调试：远程显示官方界面（AllowDebugUiShow 门控）
            case "storeAll": OpStoreAll(c); break;
            case "rename": OpRename(c); break;
            case "setTags": OpSetTags(c); break;
            default: WarnOnce("op:" + c.Op, "未知 op，丢弃: " + c.Op); break;
        }
    }

    // ================= 各 op 执行器 =================

    /// <summary>take{ids,all,from}：柜→背包。all:false=第一叠 1 件（SplitItem 拆 1）；all:true=整批各叠全量。</summary>
    private static void OpTake(Cmd c)
    {
        long bag = RailData.BagOwner();
        if (bag <= 0) { WarnOnce("take:nobag", "take 丢弃：背包 owner 不可得"); return; }
        if (!Whitelisted(c.From)) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] take 丢弃：from={c.From} 不在白名单（红线2）"); return; }
        if (c.From == bag) return; // JS 侧已防（背包组跳过）；防御性 no-op
        var im = RailData.ItemMgr();
        if (im == null) { WarnOnce("take:noim", "take 丢弃：ItemManager 不可得"); return; }

        var inner = OwnerItems(im, c.From);
        var batch = new Il2CppSystem.Collections.Generic.List<long>();
        int skip = 0;
        if (c.All)
        {
            foreach (var id in c.Ids)
            {
                if (ItemOf(inner, id) == null) { skip++; continue; } // 红线4：查无静默跳过
                batch.Add(id);
            }
        }
        else
        {
            // all:false = 只取【第一叠】1 件（契约 T5 冻结；列表行 ids=该名字全部叠）：
            // 按 ids 顺序找第一个存在的叠拆 1，其余忽略。
            foreach (var id in c.Ids)
            {
                if (ItemOf(inner, id) == null) { skip++; continue; }
                AddTakeOne(im, inner, id, batch);
                break;
            }
        }
        int moved = batch.Count > 0 ? im.TryQuickMoveItems(batch, c.From, bag, SilentQuickMove, false) : 0;
        VLog(c.Op, $"from={c.From}→bag={bag} all={c.All} batch={batch.Count} moved={moved} skip={skip}");
    }

    /// <summary>put{ids,all,to}：背包→柜（整理柜左面板右键）。all:false 同样只取第一叠 1 件。</summary>
    private static void OpPut(Cmd c)
    {
        long bag = RailData.BagOwner();
        if (bag <= 0) { WarnOnce("put:nobag", "put 丢弃：背包 owner 不可得"); return; }
        if (!Whitelisted(c.To)) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] put 丢弃：to={c.To} 不在白名单（红线2）"); return; }
        if (c.To == bag) return;
        var im = RailData.ItemMgr();
        if (im == null) { WarnOnce("put:noim", "put 丢弃：ItemManager 不可得"); return; }

        var inner = OwnerItems(im, bag);
        var batch = new Il2CppSystem.Collections.Generic.List<long>();
        int skip = 0;
        if (c.All)
        {
            foreach (var id in c.Ids)
            {
                if (ItemOf(inner, id) == null) { skip++; continue; }
                batch.Add(id);
            }
        }
        else
        {
            foreach (var id in c.Ids)
            {
                if (ItemOf(inner, id) == null) { skip++; continue; }
                AddTakeOne(im, inner, id, batch);
                break;
            }
        }
        int moved = batch.Count > 0 ? im.TryQuickMoveItems(batch, bag, c.To, SilentQuickMove, false) : 0;
        VLog(c.Op, $"bag={bag}→to={c.To} all={c.All} batch={batch.Count} moved={moved} skip={skip}");
    }

    /// <summary>takeAll{from}：整容器柜→背包（TryMoveBagAll；tipOnUntransferred 默认 true=装不下官方自带 toast）。</summary>
    private static void OpTakeAll(Cmd c)
    {
        long bag = RailData.BagOwner();
        if (bag <= 0) { WarnOnce("takeAll:nobag", "takeAll 丢弃：背包 owner 不可得"); return; }
        if (!Whitelisted(c.From)) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] takeAll 丢弃：from={c.From} 不在白名单（红线2）"); return; }
        if (c.From == bag) return;
        var im = RailData.ItemMgr();
        if (im == null) { WarnOnce("takeAll:noim", "takeAll 丢弃：ItemManager 不可得"); return; }
        bool ok = im.TryMoveBagAll(c.From, bag, true);
        VLog(c.Op, $"from={c.From}→bag={bag} ok={ok}");
    }

    /// <summary>putAll{to}：背包→柜整转（TryMoveBagAll tipOnUntransferred=true：背包满官方 toast）。</summary>
    private static void OpPutAll(Cmd c)
    {
        long bag = RailData.BagOwner();
        if (bag <= 0) { WarnOnce("putAll:nobag", "putAll 丢弃：背包 owner 不可得"); return; }
        if (!Whitelisted(c.To)) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] putAll 丢弃：to={c.To} 不在白名单（红线2）"); return; }
        if (c.To == bag) return;
        var im = RailData.ItemMgr();
        if (im == null) { WarnOnce("putAll:noim", "putAll 丢弃：ItemManager 不可得"); return; }
        bool ok = im.TryMoveBagAll(bag, c.To, true);
        VLog(c.Op, $"bag={bag}→to={c.To} ok={ok}");
    }

    /// <summary>takeCat{from,cat} / putCat{to,cat}：按 Config_Item.Category==cat 过滤源 owner 物品 id → 整批转移。</summary>
    private static void OpCat(Cmd c, bool toBag)
    {
        long bag = RailData.BagOwner();
        if (bag <= 0) { WarnOnce("cat:nobag", "takeCat/putCat 丢弃：背包 owner 不可得"); return; }
        long other = toBag ? c.From : c.To;
        if (!Whitelisted(other)) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] {(toBag ? "takeCat" : "putCat")} 丢弃：owner={other} 不在白名单（红线2）"); return; }
        if (other == bag || c.Cat <= 0) return;

        var im = RailData.ItemMgr();
        if (im == null) { WarnOnce("cat:noim", "takeCat/putCat 丢弃：ItemManager 不可得"); return; }
        var inner = OwnerItems(im, toBag ? c.From : bag);
        var batch = new Il2CppSystem.Collections.Generic.List<long>();
        if (inner != null)
        {
            try
            {
                foreach (var pair in inner) // 白名单单 owner 内遍历（非整个 OwnerCache——红线2）
                {
                    var it = pair.Value;
                    if (it == null) continue;
                    long id = 0; int cfg = 0;
                    try { id = it.InstanceId; cfg = it.ItemConfigId; } catch { }
                    if (id <= 0) continue;
                    var ic = ItemCfg(cfg);
                    if (ic == null) continue; // 配置查无：无法核验分类 → 跳过（红线4 同口径）
                    if (ic.Category == c.Cat) batch.Add(id);
                }
            }
            catch (Exception e) { WarnOnce("cat:iter", "分类遍历异常: " + e.Message); }
        }
        long from = toBag ? c.From : bag;
        long to = toBag ? bag : c.To;
        int moved = batch.Count > 0 ? im.TryQuickMoveItems(batch, from, to, SilentQuickMove, false) : 0;
        VLog(toBag ? "takeCat" : "putCat", $"owner={other} cat={c.Cat} batch={batch.Count} moved={moved}");
    }

    /// <summary>
    /// putTag{to}：读 to 容器 FurnitureTagComponent.GetRule() 的 tagId → lib（Config_FurnitureTag）查【名】，
    /// 背包物品分类名（RailData.CategoryName 主类目名表）同名命中即入选 → 整批 → to。
    /// 口径 = §4.4 快捷标签命中（「分类名 ↔ lib 标签名」同名比对，官方标签词已照抄进 CategoryNames 表）。
    /// </summary>
    private static void OpPutTag(Cmd c)
    {
        long bag = RailData.BagOwner();
        if (bag <= 0) { WarnOnce("putTag:nobag", "putTag 丢弃：背包 owner 不可得"); return; }
        if (!Whitelisted(c.To)) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] putTag 丢弃：to={c.To} 不在白名单（红线2）"); return; }
        if (c.To == bag) return;
        var im = RailData.ItemMgr();
        if (im == null) { WarnOnce("putTag:noim", "putTag 丢弃：ItemManager 不可得"); return; }

        var names = TagNamesOfContainer(c.To);
        var inner = OwnerItems(im, bag);
        var batch = new Il2CppSystem.Collections.Generic.List<long>();
        if (names.Count > 0 && inner != null)
        {
            try
            {
                foreach (var pair in inner)
                {
                    var it = pair.Value;
                    if (it == null) continue;
                    long id = 0; int cfg = 0;
                    try { id = it.InstanceId; cfg = it.ItemConfigId; } catch { }
                    if (id <= 0) continue;
                    var ic = ItemCfg(cfg);
                    if (ic == null) continue;
                    if (names.Contains(RailData.CategoryName(ic.Category))) batch.Add(id);
                }
            }
            catch (Exception e) { WarnOnce("putTag:iter", "标签入选遍历异常: " + e.Message); }
        }
        int moved = batch.Count > 0 ? im.TryQuickMoveItems(batch, bag, c.To, SilentQuickMove, false) : 0;
        VLog(c.Op, $"to={c.To} tags=[{string.Join("/", names)}] batch={batch.Count} moved={moved}");
    }

    /// <summary>
    /// tidy{owner}：同 owner 内同名叠合并——三路方案（Task 1 findings §5 定案）：
    ///   ① 首选：公开 API ItemManager.SortContainerForHub(long)（dump.cs @419597 public，
    ///      官方「一键整理」的服务端本体，与页面是否有排序按钮无关）；
    ///   ② 备选：私有 MergeStacksForHub(long)（@419603）——Il2CppInterop 代理已为私有方法生成
    ///      public 包装，直调即可，无需 System.Reflection（findings §5 的反射路线由此并入①②直调）；
    ///      实现顺序照 findings §5：先 Sort 后 Merge，再 ForceRepublish（Pump 批量末尾统一调）。
    ///   ③ 降级：①②调用异常（类型缺失/运行时拒绝）→ 命令结果以失败标记回传：
    ///      RailData.ctx.lastTidyFail=true 一次性推出（推出即清），JS（T12）收到后 toast
    ///      「本界面暂不支持整理」——5 页 SORT_BAG 页面事件路线 C# 无法代发，按计划原文放弃。
    ///   备注：①②「调用成功但实测不合并」静态不可证（方法体不可见），由 T12 校准
    ///   （两叠同名快照对照）；若校准不成立，则把本方法整体改为置失败标记（③）即完成降级。
    /// </summary>
    /// <summary>
    /// rackOpen{owner}（v1.8.2 v13）：整理柜跨柜切换——**重放官方动作** Ac_MaterialRack_Open
    /// .SendAction(OwnerId, TargetId, FurnitureConfigId)（dump.cs @129857/@129893；SendAction 通道
    /// 套件先例：PreDisasterSpeed Ac_CoreUI1_SpeedChange / ToolTablePruner Ac_ToolTable_RefreshBag）
    /// → Reducer RA_Open 整体重绑 State_Web_MaterialRack（RackOwnerId/Rows/FurnitureName）→
    /// 官方 rackrows 行组件原生重渲染目标柜——行拖拽/右键取1/锁定/取出最多/官方 PUT_ALL·TAKE_ALL
    /// 全部作用于新柜（全原生，非伪造非自绘）。
    /// 白名单：owner 必须在 CabinetCatalog.AllContainers（红线2，冰箱 f/柜子 c/架子 r 一视同仁——
    /// RA_Open 读 OwnerCache 渲染行视图，跨 kind 行为 T14 实机校准）。
    /// 门：仅 MaterialRack UI 活跃时执行（防点完即关页的存量命令把界面重新拉起）。
    /// TargetId 口径（校准点 C1）：CabinetCatalog 注释 ownerId==Furniture.InstanceId，目标家具
    /// 实例即容器 owner 本身 → 首版取 OwnerId 同值；Verbose 打印重放前后 RackOwnerId/
    /// CurrentFurnitureId 供实机核对（不符则按日志回填，一行改动）。
    /// </summary>
    private static void OpRackOpen(Cmd c)
    {
        var inst = ContainerOf(c.Owner);
        if (inst == null)
        {
            CabinetEverywherePlugin.Log.LogWarning($"[CERail] rackOpen 丢弃：owner={c.Owner} 不在白名单（红线2）");
            return;
        }
        var rus = GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.IsInstanceCreated
            ? GameCore.HotUpdate.BaseSingleton<GameCore.HotUpdate.ReduxUI.ReduxUISystem>.Instance
            : null;
        if (rus == null) { WarnOnce("rackOpen:norus", "rackOpen 丢弃：ReduxUISystem 不可得"); return; }
        try
        {
            if (!rus.IsUIActive(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_MaterialRack))))
            { WarnOnce("rackOpen:notactive", $"rackOpen 丢弃：MaterialRack 界面未开（owner={c.Owner}，防关页重拉）"); return; }

            if (CabinetEverywherePlugin.Verbose?.Value == true)
            {
                long before = 0, cur = 0;
                try
                {
                    var st = rus.GetStateByUI(Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_MaterialRack)))
                        ?.TryCast<GameCore.HotUpdate.ReduxUI.State_Web_MaterialRack>();
                    before = st?.RackOwnerId?.Value ?? 0; cur = st?.CurrentFurnitureId ?? 0;
                }
                catch { }
                CabinetEverywherePlugin.Log.LogInfo($"[CERail] rackOpen 前态：RackOwnerId={before} CurrentFurnitureId={cur} → 重放 Ac_MaterialRack_Open(owner={c.Owner}, target={c.Owner}, cfg={inst.ConfigId})（C1 校准点）");
            }
            GameCore.HotUpdate.ReduxUI.Ac_MaterialRack_Open.SendAction(c.Owner, c.Owner, inst.ConfigId);
            VLog(c.Op, $"owner={c.Owner} cfg={inst.ConfigId} 已重放官方 Ac_MaterialRack_Open（state 重绑→官方行重渲染）");
        }
        catch (Exception e)
        {
            WarnOnce("rackOpen:call", "rackOpen Ac_MaterialRack_Open.SendAction 异常: " + e.Message);
        }
    }

    private static void OpTidy(Cmd c)
    {
        if (!Whitelisted(c.Owner)) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] tidy 丢弃：owner={c.Owner} 不在白名单（红线2）"); return; }
        var im = RailData.ItemMgr();
        if (im == null)
        {
            RailData.ReportTidyFail(); // 降级③：无法执行=失败标记（JS T12 toast）
            WarnOnce("tidy:noim", "tidy 丢弃：ItemManager 不可得（已置失败标记）");
            return;
        }
        try
        {
            // Bug3（2026-10-31 实机反馈：一键整理卡顿 1-2s）——分段计时定位：sort / merge 各占多少，
            // 与 Pump 末尾的重推耗时对账（见 Pump 计时日志）。常驻 Info 一行（tidy 低频）。
            var sw = System.Diagnostics.Stopwatch.StartNew();
            im.SortContainerForHub(c.Owner); // ① 首选：官方公开排序
            long tSort = sw.ElapsedMilliseconds;
            im.MergeStacksForHub(c.Owner);   // ② 备选：官方合并（interop public 包装直调，免反射）
            long tMerge = sw.ElapsedMilliseconds - tSort;
            CabinetEverywherePlugin.Log.LogInfo($"[CERail] tidy 计时 owner={c.Owner}：sort={tSort}ms merge={tMerge}ms（卡顿对账用）");
            VLog(c.Op, $"owner={c.Owner} sort+merge 已调（合并效果 T12 校准）");
        }
        catch (Exception e)
        {
            // ③ 降级：调用异常 → 失败标记，下一包 ctx.lastTidyFail=true（JS T12 toast）
            RailData.ReportTidyFail();
            WarnOnce("tidy:call", "tidy 官方排序/合并调用异常（已降级为失败标记）: " + e.Message);
        }
    }

    /// <summary>
    /// uiShow{key}（调试专用，[Rail] AllowDebugUiShow=true 才生效）：远程显示指定官方界面——
    /// 重放官方各族 **无参 ShowUI 动作**（零载荷=零状态构造风险，与 rackOpen 重放同性质；
    /// 机器区自身数据若未初始化可能空显，rail 侧数据由本 mod 推送泵独立供给，验收 Chrome 用）。
    /// </summary>
    private static void OpUiShow(Cmd c)
    {
        if (CabinetEverywherePlugin.AllowDebugUiShow?.Value != true) { WarnOnce("uiShow:gate", "uiShow 丢弃：[Rail] AllowDebugUiShow=false"); return; }
        try
        {
            /* 主路：通用 Ac_OpenUI(Type)——带初始化的打开（iframe 按需创建）；失败降级各族 ShowUI */
            var uiType = UiTypeOf(c.Key);
            if (uiType != null)
            {
                try { GameCore.HotUpdate.ReduxUI.Ac_OpenUI.SendAction(uiType); VLog(c.Op, c.Key + " (Ac_OpenUI)"); return; }
                catch (Exception e1) { WarnOnce("uiShow:openui", "Ac_OpenUI 异常（降级 ShowUI）: " + e1.Message); }
            }
            switch (c.Key)
            {
                case "Cooking": GameCore.HotUpdate.ReduxUI.Ac_Cooking_ShowUI.SendAction(); break;
                case "BrewPanel": GameCore.HotUpdate.ReduxUI.Ac_Brew_ShowUI.SendAction(); break;
                case "RatCage": GameCore.HotUpdate.ReduxUI.Ac_RatCage_ShowUI.SendAction(); break;
                case "DyePanel": GameCore.HotUpdate.ReduxUI.Ac_Dye_ShowUI.SendAction(); break;
                case "Compressor": GameCore.HotUpdate.ReduxUI.Ac_Compressor_ShowUI.SendAction(); break;
                case "Shredder": GameCore.HotUpdate.ReduxUI.Ac_Shredder_ShowUI.SendAction(); break;
                case "ToolTable": GameCore.HotUpdate.ReduxUI.Ac_ToolTable_ShowUI.SendAction(); break;
                case "Trade": GameCore.HotUpdate.ReduxUI.Ac_TradeUI_ShowUI.SendAction(); break;
                case "DroneHub": GameCore.HotUpdate.ReduxUI.Ac_DroneHub_ShowUI.SendAction(); break;
                case "MaterialRack": GameCore.HotUpdate.ReduxUI.Ac_MaterialRack_ShowUI.SendAction(); break;
                default: WarnOnce("uiShow:key", "uiShow 未知页: " + c.Key); return;
            }
            VLog(c.Op, c.Key);
        }
        catch (Exception e) { WarnOnce("uiShow:call", "uiShow 异常: " + e.Message); }
    }
    private static Il2CppSystem.Type UiTypeOf(string key)  /* Ac_OpenUI.SendAction 形参=Il2CppSystem.Type（Il2CppType.From 直出） */
    {
        try
        {
            switch (key)
            {
                case "Cooking": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Cooking));
                case "BrewPanel": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Brew));
                case "RatCage": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_RatCage));
                case "DyePanel": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Dye));
                case "Compressor": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Compressor));
                case "Shredder": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Shredder));
                case "ToolTable": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_ToolTable));
                case "Trade": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_TradeUI));
                case "DroneHub": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_DroneHub));
                case "MaterialRack": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_MaterialRack));
            }
        }
        catch { }
        return null;
    }

    /// <summary>
    /// sortBy{owner,key}（v13.5-v13.8 作者执行令：设施属性排序 + 交易页默认交易价值排序）。
    /// key=official → 官方 SortContainerForHub（=「默认（官方）」，与一键整理同源官方排序）；
    /// 其余（sat/mind/en/hp/value/shelf）→ 自算顺序 + 逐叠落位（数据层重排，官方管线重渲染）：
    ///   ① OwnerCache 取该 owner 全部 ItemData（白名单 owner，绝不越权）；
    ///   ② 维度值（VD_MAP 同 icfg）：sat/mind/en/hp=Config_Item.ValueDisplay1/2/3/5（配置级）、
    ///      value=TradeValue×ItemCount、shelf=TimeLeft（逐叠）；降序稳定（LogicId 升序 tiebreak）；
    ///   ③ 占用网格贪心首放（宽 GetOwnerBagSize 优先，兜底 12；ItemSize w×h；放不下=原地不动）；
    ///   ④ 与 BagPos 不同才落位：OnSetBagPos（私有 reducer，interop public 包装直调——tidy 的
    ///      MergeStacksForHub 同款先例），异常回退 SetBagPosSafe；我们算的是完整无重叠布局，
    ///      中间态重叠可容忍（同一主帧批次内完成，Pump 末尾 RefreshActivePage+ForceRepublish）。
    /// 非破坏性操作：任何异常=该叠跳过（宁少动勿错动），不做失败标记。
    /// </summary>
    private static void OpSortBy(Cmd c)
    {
        if (!Whitelisted(c.Owner)) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] sortBy 丢弃：owner={c.Owner} 不在白名单（红线2）"); return; }
        var im = RailData.ItemMgr();
        if (im == null) { WarnOnce("sortBy:noim", "sortBy 丢弃：ItemManager 不可得"); return; }
        if (string.IsNullOrEmpty(c.Key)) { WarnOnce("sortBy:nokey", "sortBy 丢弃：缺 key"); return; }
        if (c.Key == "official")
        {
            try { im.SortContainerForHub(c.Owner); VLog(c.Op, $"owner={c.Owner} key=official 官方排序已调"); }
            catch (Exception e) { WarnOnce("sortBy:official", "sortBy official 异常: " + e.Message); }
            return;
        }
        try
        {
            var oc = im.OwnerCache;
            Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData> inner = null;
            try { if (!oc.TryGetValue(c.Owner, out inner) || inner == null) return; } catch { return; }
            var items = new List<GameCore.HotUpdate.Battle.Logic.ItemData>();
            foreach (var pair in inner) if (pair.Value != null) items.Add(pair.Value);
            if (items.Count < 2) return; // 0/1 叠无需排序

            var itemDict = RailData.ItemDict();
            int vi = c.Key == "sat" ? 1 : c.Key == "mind" ? 2 : c.Key == "en" ? 3 : c.Key == "hp" ? 5 : 0;
            bool byValue = c.Key == "value", byShelf = c.Key == "shelf";
            if (vi == 0 && !byValue && !byShelf) { WarnOnce("sortBy:key", $"sortBy 丢弃：未知 key={c.Key}"); return; }
            long Dim(GameCore.HotUpdate.Battle.Logic.ItemData it)
            {
                GameCore.HotUpdate.Config_Item ic = null;
                try { itemDict?.TryGetValue(it.ItemConfigId, out ic); } catch { }
                if (ic == null) return 0;
                try
                {
                    if (vi == 1) return (long)Math.Round(ic.ValueDisplay1 * 100);
                    if (vi == 2) return (long)Math.Round(ic.ValueDisplay2 * 100);
                    if (vi == 3) return (long)Math.Round(ic.ValueDisplay3 * 100);
                    if (vi == 5) return (long)Math.Round(ic.ValueDisplay5 * 100);
                    if (byValue) return (long)ic.TradeValue * Math.Max(1, it.ItemCount);
                    if (byShelf) return it.TimeLeft;
                }
                catch { }
                return 0;
            }
            items.Sort((a, b) =>
            {
                var d = Dim(b) - Dim(a);
                return d != 0 ? (d > 0 ? 1 : -1) : a.InstanceId.CompareTo(b.InstanceId);
            });

            // 网格尺寸：官方 bag 配置优先（v13.8 统一 12 列由 SizeEngine 落表），兜底 12 列
            int W = 12, H = Math.Max(4, (items.Count * 2 + W - 1) / W);
            try { var sz = im.GetOwnerBagSize(c.Owner); if (sz.x >= 6) { W = sz.x; H = Math.Max(H, sz.y); } } catch { }

            var occ = new bool[W, H + 8]; // 尾部 8 行余量（放不下即止，物品原地不动）
            int moved = 0, skipped = 0;
            foreach (var it in items)
            {
                int w = 1, h = 1;
                try { var s = it.ItemSize; w = Math.Max(1, s.x); h = Math.Max(1, s.y); } catch { }
                int fx = -1, fy = -1;
                for (int y = 0; y + h <= H + 8 && fx < 0; y++)
                    for (int x = 0; x + w <= W; x++)
                    {
                        bool free = true;
                        for (int yy = y; yy < y + h && free; yy++)
                            for (int xx = x; xx < x + w; xx++)
                                if (occ[xx, yy]) { free = false; break; }
                        if (free) { fx = x; fy = y; break; }
                    }
                if (fx < 0) { skipped++; continue; }
                for (int yy = fy; yy < fy + h; yy++) for (int xx = fx; xx < fx + w; xx++) occ[xx, yy] = true;
                bool need = true;
                try { need = it.BagPos.x != fx || it.BagPos.y != fy; } catch { }
                if (!need) continue;
                try { im.OnSetBagPos(it.InstanceId, new UnityEngine.Vector2Int(fx, fy), false); moved++; }
                catch
                {
                    try { im.SetBagPosSafe(it, new UnityEngine.Vector2Int(fx, fy), false); moved++; }
                    catch (Exception e) { skipped++; WarnOnce("sortBy:pos", "OnSetBagPos/SetBagPosSafe 异常: " + e.Message); }
                }
            }
            VLog(c.Op, $"owner={c.Owner} key={c.Key} items={items.Count} moved={moved} skip={skipped} grid={W}x{H}");
        }
        catch (Exception e)
        {
            WarnOnce("sortBy:call", "sortBy 重排异常: " + e.Message);
        }
    }

    /// <summary>
    /// storeAll{order}：§4.7 一键入库路由——背包逐叠：物品分类名 → 按 order 顺序找「柜官方标签名
    /// 含该分类名」的柜 TryQuickMoveItems 逐叠放入，柜满（moved==0）顺延下一个同标签柜，
    /// 无匹配/全满留背包。order 内非白名单 id 跳过+警告（order 来自 JS 页签顺序）。
    /// 材料架伪标签不入路由（TagIds 只含官方；架子官方类型限制由 TryQuickMoveItems 自行兜底，T14 校准）。
    /// </summary>
    private static void OpStoreAll(Cmd c)
    {
        long bag = RailData.BagOwner();
        if (bag <= 0) { WarnOnce("storeAll:nobag", "storeAll 丢弃：背包 owner 不可得"); return; }
        var im = RailData.ItemMgr();
        if (im == null) { WarnOnce("storeAll:noim", "storeAll 丢弃：ItemManager 不可得"); return; }

        var cabs = new List<CabinetCatalog.ContainerInst>();
        var cabNames = new List<HashSet<string>>();
        foreach (var id in c.Order)
        {
            var inst = ContainerOf(id);
            if (inst == null) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] storeAll：order 内 owner={id} 不在白名单，跳过（红线2）"); continue; }
            cabs.Add(inst);
            cabNames.Add(TagNamesOfIds(inst.TagIds));
        }
        if (cabs.Count == 0) { VLog(c.Op, "无有效柜候选（order 空/全非法），背包原样"); return; }

        var inner = OwnerItems(im, bag);

        // 快照后路由（评审 Important 2）：TryQuickMoveItems 整叠吸收即 Remove 字典项，
        // 在 il2cpp 字典枚举中途调用会触发枚举器版本检查抛 InvalidOperationException
        // （被 catch 吞掉 → 入库只到第一叠成功为止）。先把背包快照为托管 List(id+cfg)，
        // 路由决策与移动都基于快照（OpCat/OpPutTag 先收集后移动的同一形态）。
        var snapshot = new List<(long id, int cfg)>();
        if (inner != null)
        {
            try
            {
                foreach (var pair in inner)
                {
                    var it = pair.Value;
                    if (it == null) continue;
                    long id = 0; int cfg = 0;
                    try { id = it.InstanceId; cfg = it.ItemConfigId; } catch { }
                    if (id > 0) snapshot.Add((id, cfg));
                }
            }
            catch (Exception e) { WarnOnce("storeAll:snap", "背包快照异常: " + e.Message); }
        }

        var batch = new Il2CppSystem.Collections.Generic.List<long>();
        int movedStacks = 0, movedTotal = 0, leftStacks = 0;
        foreach (var (id, cfg) in snapshot)
        {
            var ic = ItemCfg(cfg);
            if (ic == null) { leftStacks++; continue; } // 配置查无：无法路由 → 留背包（红线4 同口径）
            string catName = RailData.CategoryName(ic.Category);

            bool placed = false;
            for (int i = 0; i < cabs.Count; i++)
            {
                if (!cabNames[i].Contains(catName)) continue; // §4.7：分类名↔柜标签名匹配
                batch.Clear();
                batch.Add(id);
                int moved = im.TryQuickMoveItems(batch, bag, cabs[i].OwnerId, SilentQuickMove, false);
                if (moved > 0) { placed = true; movedStacks++; movedTotal += moved; break; } // 柜满顺延
            }
            if (!placed) leftStacks++; // 无匹配/全满：留背包（§4.7）
        }
        VLog(c.Op, $"cabs={cabs.Count} 入库 {movedStacks} 叠/{movedTotal} 件，留背包 {leftStacks} 叠");
    }

    /// <summary>rename{owner,name}：mod 侧持久化 cerail_names.json（≤8 字截断；空名=删除覆盖回契约名）。</summary>
    private static void OpRename(Cmd c)
    {
        if (!Whitelisted(c.Owner)) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] rename 丢弃：owner={c.Owner} 不在白名单（红线2）"); return; }
        if (c.Owner == RailData.BagOwner()) return; // 背包无名称槽位（JS openEdit 亦不发），防御性忽略

        string v = (c.Name ?? "").Trim();
        if (v.Length > NameMaxLen) v = v.Substring(0, NameMaxLen);
        var names = LoadNames();
        if (v.Length == 0) names.Remove(c.Owner); // 空名=删覆盖（railui saveEdit 同语义，防御性）
        else names[c.Owner] = v;
        SaveNames();
        RailData.RefreshMeta(); // NameOf 进 _ctn 行缓存，立即随 ForceRepublish 回推
        VLog(c.Op, $"owner={c.Owner} name=\"{v}\"");
    }

    /// <summary>
    /// setTags{owner,tags}：tagId 先经 Config_FurnitureTag_Dict 白名单校验（未知 id 剔除——
    /// 防纯数字自定义词误入，T5 Minor 裁定兜底；红线5）；剔除后空数组仍 SetRule（=清标签）。
    /// 成败由 SetRule 返回值日志；标签变化经 RefreshMeta+ForceRepublish 回推契约。
    /// </summary>
    private static void OpSetTags(Cmd c)
    {
        if (!Whitelisted(c.Owner)) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] setTags 丢弃：owner={c.Owner} 不在白名单（红线2）"); return; }
        if (c.Owner == RailData.BagOwner()) return; // 背包不可打标签（JS 亦不发）

        var tagDict = BagTable.Cm()?._Config_FurnitureTag_Dict;
        var rule = new Il2CppSystem.Collections.Generic.List<int>();
        int dropped = 0;
        foreach (var t in c.Tags)
        {
            bool known = false;
            try { known = tagDict != null && t > 0 && t <= int.MaxValue && tagDict.TryGetValue((int)t, out var cfg) && cfg != null; }
            catch { known = false; }
            if (known) rule.Add((int)t); else dropped++;
        }
        if (dropped > 0) VLog("setTags", $"白名单剔除未知 tagId ×{dropped}（红线5）");

        var comp = TagComponentOf(c.Owner);
        if (comp == null) { WarnOnce("setTags:nocomp", "setTags 失败：容器 FurnitureTagComponent 不可得 owner=" + c.Owner); return; }
        // interop 侧 IReadOnlyList<int> 接口代理与 List<int> 无隐式转换——TryCast 取实现者实例
        // （il2cpp 层 List<T> 真实实现 IReadOnlyList<T>，isinst 命中即返回代理）
        var ruleArg = rule.TryCast<Il2CppSystem.Collections.Generic.IReadOnlyList<int>>();
        if (ruleArg == null) { WarnOnce("setTags:cast", "List<int>→IReadOnlyList<int> 代理转换失败，setTags 放弃 owner=" + c.Owner); return; }
        bool ok;
        try { ok = comp.SetRule(ruleArg); } // 空数组=清标签（红线5 允许）
        catch (Exception e) { WarnOnce("setTags:call", "SetRule 调用异常: " + e.Message); return; }

        RailData.RefreshMeta(); // 新 TagIds 进 _ctn 行，立即随 ForceRepublish 回推
        VLog(c.Op, $"owner={c.Owner} tags=[{string.Join(",", c.Tags)}] → kept={rule.Count} dropped={dropped} ok={ok}");
    }

    // ================= 取用 / 校验助手 =================

    /// <summary>白名单（红线2）：ownerId ∈ CabinetCatalog.AllContainers ∪ 背包 owner。</summary>
    private static bool Whitelisted(long id)
    {
        if (id <= 0) return false;
        if (id == RailData.BagOwner()) return true;
        var all = CabinetCatalog.AllContainers;
        for (int i = 0; i < all.Count; i++)
            if (all[i].OwnerId == id) return true;
        return false;
    }

    /// <summary>白名单内查 ContainerInst（storeAll 标签路由用）；非白名单/查无返回 null。</summary>
    private static CabinetCatalog.ContainerInst ContainerOf(long id)
    {
        var all = CabinetCatalog.AllContainers;
        for (int i = 0; i < all.Count; i++)
            if (all[i].OwnerId == id) return all[i];
        return null;
    }

    /// <summary>源容器物品字典（只按白名单 owner TryGetValue 逐层取——绝不 foreach OwnerCache，红线2）。</summary>
    private static Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData> OwnerItems(
        GameCore.HotUpdate.Battle.Logic.ItemManager im, long owner)
    {
        try { if (im.OwnerCache != null && im.OwnerCache.TryGetValue(owner, out var inner)) return inner; }
        catch { }
        return null;
    }

    /// <summary>id 查物（红线4：TryGetValue 不到/异常 → null，调用方静默跳过计数）。</summary>
    private static GameCore.HotUpdate.Battle.Logic.ItemData ItemOf(
        Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData> inner, long id)
    {
        try { if (inner != null && inner.TryGetValue(id, out var it)) return it; }
        catch { }
        return null;
    }

    /// <summary>
    /// 「取 1 件」批量项（take/put 的 all:false 语义）：叠数≤1 直接整移源 id；
    /// 否则 SplitItem(id,1) 拆出 1 件新 ItemData（id 入批量）；SplitItem 返回 null
    /// （不可拆/异常，brief 处方：count&gt;1 且不可拆静态不成立，兜底=源 id 整移）。
    /// </summary>
    private static void AddTakeOne(
        GameCore.HotUpdate.Battle.Logic.ItemManager im,
        Il2CppSystem.Collections.Generic.Dictionary<long, GameCore.HotUpdate.Battle.Logic.ItemData> inner,
        long id, Il2CppSystem.Collections.Generic.List<long> batch)
    {
        int count = 0;
        try { count = ItemOf(inner, id)?.ItemCount ?? 0; } catch { }
        if (count <= 1) { batch.Add(id); return; }

        GameCore.HotUpdate.Battle.Logic.ItemData split = null;
        try { split = im.SplitItem(id, 1); } catch { }
        long newId = 0;
        try { newId = split?.InstanceId ?? 0; } catch { }
        batch.Add(newId > 0 ? newId : id); // null/异常兜底：源 id 直移（brief 处方）
    }

    /// <summary>Config_Item 查表（BagTable.Cm 缓存配置管理器，同 RailData 模式）。</summary>
    private static GameCore.HotUpdate.Config_Item ItemCfg(int cfgId)
    {
        try
        {
            var d = BagTable.Cm()?._Config_Item_Dict;
            if (d != null && d.TryGetValue(cfgId, out var ic)) return ic;
        }
        catch { }
        return null;
    }

    /// <summary>ownerId → Furniture 上的 FurnitureTagComponent（AgentManager.GetAgent 直查，组件字典按 Type 索引）。</summary>
    private static GameCore.HotUpdate.Battle.Logic.FurnitureTagComponent TagComponentOf(long ownerId)
    {
        try
        {
            var am = RailData.World()?._AgentManager;
            var furn = am?.GetAgent(ownerId)?.TryCast<GameCore.HotUpdate.Battle.Logic.Furniture>();
            var dict = furn?.agentComponentDictionary;
            var raw = dict?[Il2CppType.From(typeof(GameCore.HotUpdate.Battle.Logic.FurnitureTagComponent))];
            return raw?.TryCast<GameCore.HotUpdate.Battle.Logic.FurnitureTagComponent>();
        }
        catch { return null; }
    }

    /// <summary>
    /// 容器当前官方标签【名】集合（tagId → lib 查名；无组件/无标签=空集合）。
    /// 读走 TagIds 属性（List&lt;int&gt; 代理，与 GetRule() 同一 backing 存储的读取通道——
    /// CabinetCatalog.ReadTagIds 生产先例；interop 侧 IReadOnlyList 接口代理无 Count 可迭代，T14 校准）。
    /// </summary>
    private static HashSet<string> TagNamesOfContainer(long ownerId)
    {
        var ids = new List<int>();
        try
        {
            var list = TagComponentOf(ownerId)?.TagIds;
            if (list != null)
            {
                int n = list.Count;
                for (int i = 0; i < n; i++) ids.Add(list[i]);
            }
        }
        catch { }
        return TagNamesOfIds(ids);
    }

    /// <summary>tagId 集合 → 官方标签名集合（Config_FurnitureTag_Dict，TagName_Local 优先）。</summary>
    private static HashSet<string> TagNamesOfIds(IEnumerable<int> ids)
    {
        var set = new HashSet<string>();
        var tagDict = BagTable.Cm()?._Config_FurnitureTag_Dict;
        foreach (var id in ids)
        {
            try
            {
                if (tagDict == null || !tagDict.TryGetValue(id, out var t) || t == null) continue;
                var name = string.IsNullOrEmpty(t.TagName_Local) ? t.TagName : t.TagName_Local;
                if (!string.IsNullOrEmpty(name)) set.Add(name);
            }
            catch { }
        }
        return set;
    }

    // ================= rename 持久化（cerail_names.json） =================

    private static Dictionary<long, string> _names = new();   // 内存缓存（LoadNames 引用换替）
    private static DateTime _namesMtime;                      // 缓存对应的文件 mtime
    private static object _namesWorld;                        // 缓存对应的世界会话（换档 ownerId 域变）
    private static bool _namesTried;

    /// <summary>
    /// 容器改名覆盖表（RailData.NameOf 接线点）：BepInEx/cerail_names.json {"ownerId":"名"}（键带引号
    /// 的合法 JSON——评审 Important 1）。内存缓存 + 两条件失效重载：文件 mtime 变（含手动改档外编辑）
    /// 或 BattleLogicWorld 实例换（读档/换存档后家具 InstanceId 是新域，旧名必须弃用防串档）。
    /// 旧格式文件（无引号数字键）→ JsonParse 抛"对象键非字符串"→ inner catch 走"损坏重建"路径
    /// （返回空表不崩溃），下次 rename SaveNames 以新格式覆写。主线程调用（NameOf/Pump 均主帧），无锁。
    /// </summary>
    internal static Dictionary<long, string> LoadNames()
    {
        try
        {
            string path = NamesPath;
            DateTime mtime = File.Exists(path) ? File.GetLastWriteTimeUtc(path) : DateTime.MinValue;
            var world = RailData.World();
            if (_namesTried && mtime == _namesMtime && ReferenceEquals(world, _namesWorld)) return _names;
            _namesMtime = mtime;
            _namesWorld = world;
            _namesTried = true;

            var d = new Dictionary<long, string>();
            if (File.Exists(path))
            {
                try
                {
                    // 文件不是 JS：值原样读，只按 JSON 语法解析（RailJson，键带引号合法 JSON）
                    if (RailJson.Parse(File.ReadAllText(path)) is Dictionary<string, object> root)
                        foreach (var kv in root)
                        {
                            if (!long.TryParse(kv.Key, NumberStyles.Integer, CultureInfo.InvariantCulture, out var oid)) continue;
                            if (kv.Value is not string s || s.Length == 0) continue;
                            d[oid] = s.Length > NameMaxLen ? s.Substring(0, NameMaxLen) : s;
                        }
                }
                catch (Exception e)
                {
                    WarnOnce("names:corrupt", "cerail_names.json 损坏，弃用重建（下次 rename 覆写）: " + e.Message);
                }
            }
            _names = d;
        }
        catch (Exception e)
        {
            WarnOnce("names:load", "cerail_names.json 读取失败: " + e.Message);
        }
        return _names;
    }

    /// <summary>原子写：先写 .tmp 再 File.Move(overwrite:true)；写后同步 mtime 防下次误判外部修改。</summary>
    private static void SaveNames()
    {
        try
        {
            var sb = new StringBuilder(256);
            sb.Append('{');
            bool first = true;
            foreach (var kv in _names)
            {
                if (!first) sb.Append(',');
                first = false;
                // 键必须带引号（评审 Important 1）：无引号数字键非法 JSON，重启 JsonParse
                // 必抛→损坏重建路径→全部改名丢失。解析端 LoadNames 已按字符串键 long.TryParse。
                sb.Append('"').Append(kv.Key.ToString(CultureInfo.InvariantCulture)).Append("\":\"")
                  .Append(RailData.EscapeJs(kv.Value)).Append('"');
            }
            sb.Append('}');
            string path = NamesPath, tmp = path + ".tmp";
            File.WriteAllText(tmp, sb.ToString());
            File.Move(tmp, path, true);
            _namesMtime = File.GetLastWriteTimeUtc(path);
            VLog("rename", $"cerail_names.json 已写（{_names.Count} 条）");
        }
        catch (Exception e)
        {
            WarnOnce("names:save", "cerail_names.json 写入失败: " + e.Message);
        }
    }

    // ================= 日志 =================

    private static readonly HashSet<string> Warned = new();

    /// <summary>失败 WarnOnce（键级去重；回调线程与主帧都可能进来——锁保护 Add）。</summary>
    private static void WarnOnce(string key, string msg)
    {
        lock (Warned)
        {
            if (!Warned.Add(key)) return;
        }
        CabinetEverywherePlugin.Log?.LogWarning("[CERail] " + msg);
    }

    /// <summary>Debug.Verbose：每命令一行 op/参数摘要/结果计数（T14 实机校准观测点）。</summary>
    private static void VLog(string op, string detail)
    {
        if (CabinetEverywherePlugin.Verbose?.Value != true) return;
        CabinetEverywherePlugin.Log.LogInfo($"[CERail] cmd {op}: {detail}");
    }
}
