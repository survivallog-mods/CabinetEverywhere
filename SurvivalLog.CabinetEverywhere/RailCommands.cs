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
///   feed  {owner, item}  燃油发电机柜中燃料整组直送（spec 2026-11-06-fuelgen-cabinet-tabs §5.3）：
///                        v1 只走两跳=柜→背包(TryQuickMoveItems)→官方 Ac_FuelGenerator_FuelAdd（S1 直达
///                        属后续优化）；叠并重解析=按 ItemConfigId 在背包重找目标叠；拒绝经
///                        RailData.MarkFeedFail(notfuel|full|bagfull|noitem)→ctx.feedFail 一次性回执
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
        public long From, To, Owner, Cat, Item;
        public string Name;
        public string Key; // uiShow/uiClose/pinOrder/setFilter 页键（v1.8.5：sortBy 数据层排序已退役——排序=显示层，见 railui.page.js DISP）
        public string Sel; // v1.9.1：setFilter 筛选选中（"0"=全部柜子/"other"=未打标签/tagId）
        public string Text; // TradeFx 批1：report 探针上报文本（纯日志，零副作用）
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
        c.Item = Lng(o, "item");
        if (o.TryGetValue("name", out var nm) && nm is string s) c.Name = s;
        if (o.TryGetValue("key", out var ky) && ky is string ks) c.Key = ks;
        if (o.TryGetValue("sel", out var sl) && sl is string ss) c.Sel = ss;
        if (o.TryGetValue("text", out var tx) && tx is string ts) c.Text = ts;
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
                mutated |= c.Op != "rename" && c.Op != "setTags" && c.Op != "rackOpen" && c.Op != "pinOrder" && c.Op != "setFilter" && c.Op != "report"; // 物品变更类（Bug3 刷新判定；pinOrder=纯序变更走 TabInjector Repush；setFilter=选中落库走 TabGate/Pruner 下轮对账；report=纯日志）
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
            if (_storeTask != null) DriveStoreTask(); // 方案 A 终案：入库任务每帧一步（收尾自带哨兵+推送收口）
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
            case "feed": OpFeed(c); break; // 燃油发电机柜中燃料直送（两跳，见 OpFeed 注释）
            case "switchBag": OpSwitchBag(c); break; // 九验收：柜签=官方背包数据切换（官方网格/拖拽/详情/悬浮全原生，见 OpSwitchBag 注释）
            case "refreshBag": OpRefreshBag(); break; // glist 批改#9：格子态官方刷新杠杆（switchBag 同值守卫早退不覆盖——见 OpRefreshBag 注释）
            case "basketPut": OpBasketPut(c); break; // 篮子救援 glist：右键 1 件直放篮子（最终入篮=官方快转动作，见 OpBasketPut 注释）
            case "uiShow": OpUiShow(c); break; // 调试：远程显示官方界面（AllowDebugUiShow 门控）
            case "uiClose": OpUiClose(c); break; // 调试：远程关闭官方界面（uiShow 前清场——Ac_OpenUI 不自动关旧 UI，ActivePage 被残留页霸占=验证踩坑实锤；同门控）
            case "storeAll": OpStoreAll(c); break;
            case "storeAbort": AbortStoreTask(); break; // 玩家 ✕ 关进度弹窗：中止剩余搬运（B 款可关闭批）
            case "rename": OpRename(c); break;
            case "setTags": OpSetTags(c); break;
            case "pinOrder": OpPinOrder(c); break; // 四轮（作者#2）：拖拽页签序同步官方 BagTabs 序（TabInjector 落盘+0.5s 轮询重排）
            case "setFilter": OpSetFilter(c); break; // v1.9.1 筛选下拉：选中落库（TabGate 下轮按选中收窄可见集）
            case "ping": OpPing(c); break; // v1.8.10 十三批四追：心跳自愈；六追后升级为通道对照实验（微包回执）：ExecuteJavaScript 大包（62KB 契约）实测零达而 drain（33B）恒达——长度丢弃假说验证
            case "report": OpReport(c); break; // TradeFx 批1：JS 侧 missing 探针上报（纯日志零副作用——游戏改版定位「哪个依赖部件没了」）
            case "detail": OpDetail(c); break; // TradeFx 批2（A5）：货架/格子点击 → 官方物品详情弹窗
            case "idetail": OpIDetail(c); break; // glist v2.2.1：行左键 → 官方详情弹窗（实例级，任意容器归属）
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

    /// <summary>ping：零副作用心跳（Pump 执行过即 ForceRepublish）。六追升级：附带微包回执
    /// `window.__CERAIL__._pp(n)`（~40B，与 drain 同量级）——微包达而大包（62KB setData）不达
    /// = ExecuteJavaScript 长度丢弃实锤（修向=大包改分片通道，八追已落）；双双不达=通道级问题。
    /// 八追：限频日志——JS 饥饿（ctx 空）或陈旧（>60s 无新包）态在跑（持续出现=推送丢弃态）。</summary>
    private static long _pingLastLog;
    private static void OpPing(Cmd c)
    {
        try
        {
            var web = RailUi.ActiveWebView;
            if (web == null) return;
            web.ExecuteJavaScript("(window.__CERAIL__&&__CERAIL__.state)?__CERAIL__._pp(1):0", RailUi.PushAckCallback);
            long now = DateTime.UtcNow.Ticks / TimeSpan.TicksPerSecond;
            if (now - _pingLastLog >= 30)
            {
                _pingLastLog = now;
                CabinetEverywherePlugin.Log?.LogInfo(
                    "[CERail] 心跳 ping 执行（JS 侧数据饥饿或陈旧>60s——Pump 批尾将 ForceRepublish 重推；持续出现=推送通道丢弃态，对照回执看门狗告警）");
            }
        }
        catch (Exception) { }
    }

    /// <summary>report：TradeFx JS 侧 missing 探针上报（批1 Task 3）。纯日志零副作用——
    /// 依赖选择器缺失即上报（「游戏改版把哪个部件改没了」实机定位口），消息去重防刷屏。
    /// 不入 Pump 的 mutated 名单（不触发 republish）。</summary>
    private static void OpReport(Cmd c)
    {
        if (!string.IsNullOrEmpty(c.Text))
            WarnOnce("fx:" + c.Text, "[TradeFx] 页面探针: " + c.Text);
    }

    /// <summary>detail：TradeFx 批2（A5）——货架单价/格子徽章点击 → 官方物品详情弹窗
    /// （Ac_ItemDetailPopup_OpenUI，configId 位传值其余默认——BT DetailPopup 同参形）。</summary>
    private static void OpDetail(Cmd c)
    {
        if (c.Item <= 0) return;
        try
        {
            GameCore.HotUpdate.ReduxUI.Ac_ItemDetailPopup_OpenUI.SendAction(
                0L, 0L, (int)c.Item, 1f, (GameCore.HotUpdate.TipsType)0, -1, 1f, 0, 0L, 0f, 0f, 0f, 0f);
        }
        catch (Exception e) { WarnOnce("fx:detail", "[TradeFx] 详情弹窗失败: " + e.Message); }
    }

    /// <summary>idetail：glist v2.2.1——列表行左键 → 官方物品详情弹窗（**实例级**：ItemId+OwnerId
    /// 直开——官方动作原生带 OwnerId 字段=任意容器归属物品均可开，柜源行同样成立；作者令
    /// 「列表所有物品都用官方原生详情弹窗」）。TipsType=Default 纯查看（零使用/购买钮语义风险；
    /// 背包同款 UseByBag 可后续实机裁定切换）。参形=OpDetail 同款 13 位（dump @130893：
    /// ItemId/OwnerId/ItemConfigId/Discount/TipsType/ShopShowHour/TimeScale/ShopConfigId/
    /// SourceFurnitureId/SourceRect×4）。</summary>
    private static void OpIDetail(Cmd c)
    {
        if (c.Item <= 0 || c.Owner < 0) return;
        try
        {
            GameCore.HotUpdate.ReduxUI.Ac_ItemDetailPopup_OpenUI.SendAction(
                c.Item, c.Owner, (int)c.Cat, 1f, (GameCore.HotUpdate.TipsType)0, -1, 1f, 0, 0L, 0f, 0f, 0f, 0f);
        }
        catch (Exception e) { WarnOnce("g:idetail", "[CERail] glist 官方详情弹窗失败: " + e.Message); }
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
    /// feed{owner,item}：燃油发电机柜中燃料**整组**直送（spec 2026-11-06-fuelgen-cabinet-tabs §5.3）。
    /// v1 只走两跳：柜→背包（TryQuickMoveItems 整叠，官方 API）→官方动作重放 Ac_FuelGenerator_FuelAdd
    /// （rackOpen 同款纪律：官方静态派发入口，与页面按钮到达同一 Reducer）。S1 直达（SendAction 直喂
    /// 柜中 itemId）待反编译/实机实证后作独立优化，不并本路径。
    /// 叠并重解析：背包已有同 cfg 叠时第一跳会把源叠并入既存叠——原 InstanceId 消失，须按 ItemConfigId
    /// 在背包重找目标叠再发 FUEL_ADD。
    /// 拒绝四路（权威校验在 C#，JS 预检只为省往返）：notfuel=非燃料（物品级 Config_Item.Burnable，
    /// 禁止按 Category 推导）/ full=燃料槽满（FuelItems.Count>=FuelSlotCount，官方 JS 谓词同源；
    /// 校准注=若 FuelItems 不含在燃格，实机改按 (activeFuel?1:0)+queue>=slots）/ bagfull=背包无空位 /
    /// noitem=物品已不在柜中。全部经 MarkFeedFail→ctx.feedFail 一次性回执，JS 弹 mod 警告条。
    /// </summary>
    private static void OpFeed(Cmd c)
    {
        long bag = RailData.BagOwner();
        if (bag <= 0) { WarnOnce("feed:nobag", "feed 丢弃：背包 owner 不可得"); return; }
        // glist（v1.9.0 终审 I1）：背包源=合法源（物品已在包，第一跳柜→包跳过）——bagtabs 时代
        // 无此调用面（柜签喂料恒为柜源），白名单对 bag owner 恒放行；不跳一跳则 TryQuickMoveItems
        // (bag→bag)=0 moved=假「背包已满」
        bool fromBag = c.Owner == bag;
        if (!fromBag && !Whitelisted(c.Owner)) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] feed 丢弃：owner={c.Owner} 不在白名单（红线2）"); return; }
        if (c.Item <= 0) return;
        var im = RailData.ItemMgr();
        if (im == null) { WarnOnce("feed:noim", "feed 丢弃：ItemManager 不可得"); return; }

        var src = ItemOf(OwnerItems(im, c.Owner), c.Item);
        if (src == null) { RailData.MarkFeedFail("noitem"); return; }

        // ① burnable 权威校验（dump @40395 Config_Item.Burnable）
        int cfgId = 0; try { cfgId = src.ItemConfigId; } catch { }
        var ic = ItemCfg(cfgId);
        bool burnable = false; try { burnable = ic != null && ic.Burnable; } catch { }
        if (!burnable) { RailData.MarkFeedFail("notfuel"); return; }

        // ② 燃料槽容量权威校验（bagtabs 族按页取 state 直读；读不到=放行交官方 Reducer 兜底）
        int slots = 0, queued = 0;
        if (RailData.ActivePage() == "Heater")
        {
            var stH = RailData.HeaterState();
            try { slots = stH?.FuelSlotCount?.Value ?? 0; queued = stH?.FuelItems?.Count ?? 0; } catch { }
        }
        else
        {
            var st = RailData.FuelGenState();
            try { slots = st?.FuelSlotCount?.Value ?? 0; queued = st?.FuelItems?.Count ?? 0; } catch { }
        }
        if (slots > 0 && queued >= slots) { RailData.MarkFeedFail("full"); return; }

        // ③ 第一跳：柜→背包（整叠，silent=不弹官方 toast——结果经数据回推自渲染）。
        //    glist 背包源（fromBag）：物品已在包，本跳整体跳过直落 ④ 重解析。
        if (!fromBag)
        {
            var batch = new Il2CppSystem.Collections.Generic.List<long>();
            batch.Add(c.Item);
            int moved = im.TryQuickMoveItems(batch, c.Owner, bag, SilentQuickMove, false);
            if (moved <= 0)
            {
                // 背包满 vs 物品消失：源物品仍在柜=背包满；已不在=noitem
                RailData.MarkFeedFail(ItemOf(OwnerItems(im, c.Owner), c.Item) != null ? "bagfull" : "noitem");
                return;
            }
        }

        // ④ 叠并重解析（终审 Important2 修正）：**先查原 InstanceId**——未并叠时原 id 存活
        //（背包无同 cfg 叠，或同 cfg 满叠+有空位=建新叠两种情形都命中），仅查不到才按 cfg
        // 遍历兜底（真并叠）。旧写法直接 cfg-first 遍历：满叠情形可能先命中背包 99 叠旧木柴
        // =错喂整叠（点了柜里 5 根进了背包 99 根）。
        long target = 0;
        var bagInner = OwnerItems(im, bag);
        if (ItemOf(bagInner, c.Item) != null) target = c.Item;
        else if (bagInner != null)
        {
            try
            {
                foreach (var pair in bagInner) // 白名单单 owner 内遍历（非整个 OwnerCache——红线2）
                {
                    var it = pair.Value;
                    if (it == null) continue;
                    long id = 0; int cfg = 0;
                    try { id = it.InstanceId; cfg = it.ItemConfigId; } catch { }
                    if (id > 0 && cfg == cfgId) { target = id; break; }
                }
            }
            catch (Exception e) { WarnOnce("feed:iter", "背包叠并重解析遍历异常: " + e.Message); }
        }
        if (target <= 0) { RailData.MarkFeedFail("noitem"); VLog(c.Op, $"cfg={cfgId} 重解析失败（背包无目标叠）"); return; }

        // ⑤ 第二跳：官方加油动作重放（与页面 FUEL_ADD 按钮同入口；bagtabs 族按页派发——
        // Ac_Heater_FuelAdd/Ac_FuelGenerator_FuelAdd 同载荷 {itemId}）
        if (RailData.ActivePage() == "Heater")
            GameCore.HotUpdate.ReduxUI.Ac_Heater_FuelAdd.SendAction("{\"itemId\":" + target + "}");
        else
            GameCore.HotUpdate.ReduxUI.Ac_FuelGenerator_FuelAdd.SendAction("{\"itemId\":" + target + "}");
        VLog(c.Op, $"owner={c.Owner} item={c.Item}→bag 重解析={target} cfg={cfgId}（两跳完成）");
    }

    /// <summary>
    /// switchBag{owner}（九验收 v2：**官方状态直写**——作者定调「官方原生逻辑」的正身用法）：
    /// 写 State_Web_FuelGenerator.BagOwnerId（游戏开页时自己就设这个字段；ReactiveProperty<long>
    /// 直写）→ 派发官方 Ac_FuelGenerator_RefreshBag → **官方 C# 按新 owner 组包推送**。柜签/
    /// 背包从此视图=权威状态永远一致：拖拽整理（官方 ITEM_MOVE 按当前 owner=柜子执行）、拖到
    /// 燃料槽（官方 FUEL_ADD 从柜子取）、左键详情（官方 ITEM_CLICK）、悬浮热值全部官方语义，
    /// 且无合成数据可失配=九验收 v1 的闪烁自激环（switchBag→泵刷新→官方推背包→失配重拉）与
    /// 背包移动失效（视图/状态分叉）结构性不存在。owner=0=玩家背包。白名单门（红线2）。
    /// </summary>
    private static void OpSwitchBag(Cmd c)
    {
        long bag = RailData.BagOwner();
        long owner = c.Owner;
        if (owner == 0) { if (bag <= 0) return; owner = bag; }
        else if (!Whitelisted(owner))
        {
            CabinetEverywherePlugin.Log.LogWarning($"[CERail] switchBag 丢弃：owner={owner} 不在白名单（红线2）");
            return;
        }
        /* bagtabs 族按页派发（暖炉移植批）：State_Web_Heater 与 State_Web_FuelGenerator 同构
           （BagOwnerId 同 ReactiveProperty<long> + Ac_Heater_RefreshBag 同名动作族）——官方状态
           直写语义两页一致；default=首发页燃油发电机。 */
        if (RailData.ActivePage() == "Heater")
        {
            var stH = RailData.HeaterState();
            if (stH == null || stH.BagOwnerId == null) { WarnOnce("switch:nost", "switchBag 丢弃：Heater 状态不可得"); return; }
            try
            {
                long cur = stH.BagOwnerId.Value;
                if (cur == owner) return; /* 同值守卫：已在目标 owner=免命令风暴（官方刷新也免） */
                stH.BagOwnerId.Value = owner;
                GameCore.HotUpdate.ReduxUI.Ac_Heater_RefreshBag.SendAction();
                VLog(c.Op, "owner=" + cur + "→" + owner + "（官方状态直写+官方刷新）");
            }
            catch (Exception e) { WarnOnce("switch:write", "BagOwnerId 直写异常(Heater): " + e.Message); }
            return;
        }
        var st = RailData.FuelGenState();
        if (st == null || st.BagOwnerId == null) { WarnOnce("switch:nost", "switchBag 丢弃：FuelGenerator 状态不可得"); return; }
        try
        {
            long cur = st.BagOwnerId.Value;
            if (cur == owner) return; /* 同值守卫：已在目标 owner=免命令风暴（官方刷新也免） */
            st.BagOwnerId.Value = owner;
            GameCore.HotUpdate.ReduxUI.Ac_FuelGenerator_RefreshBag.SendAction();
            VLog(c.Op, "owner=" + cur + "→" + owner + "（官方状态直写+官方刷新）");
        }
        catch (Exception e) { WarnOnce("switch:write", "BagOwnerId 直写异常: " + e.Message); }
    }

    /// <summary>
    /// refreshBag（glist 实机批改#9，2026-11-08）：glist 列表→格子切换的官方刷新杠杆。
    /// 背景：列表态全程隐藏官方格网，官方侧无重建时机=切回一片空白（#2 旧杠杆 switchBag 的
    /// 同值守卫 cur==owner 早退在「官方状态已在背包」时哑火，且只覆盖 bagtabs 两页不覆盖染料）。
    /// 正身=裸命令直调 RailData.RefreshActivePage()（按活跃页派 Ac_*_RefreshBag：Dye/Heater/
    /// FuelGenerator 三页全覆盖，官方动作重放零伪造；IsUIActive 门内置，页不活跃=无害空过）。
    /// </summary>
    private static void OpRefreshBag()
    {
        try { RailData.RefreshActivePage(); VLog("refreshBag", "活跃页官方刷新（glist 格子态）"); } catch (Exception e) { WarnOnce("refresh:fail", "refreshBag 异常: " + e.Message); }
    }

    /// <summary>basketPut{owner,item}（篮子救援 glist 右键）：1 件直放篮子（basket spec §5.1）。
    /// 目标 owner=State_Web_BackpackUI.OwnerIdRP_B（状态权威直读，不信 JS 传值）；源=背包或白名单柜。
    /// **最终入篮恒走官方快转动作** Ac_BackpackUI_QuickTransferItem（官方校验+B 侧格/救助进度
    /// RecomputeBasketPreview 官方链全刷新——TryQuickMoveItems 直写篮容器会绕开官方 reducer
    /// 使官方愿望条/B 侧停留旧值）：背包源=直发；柜源=SplitItem 拆 1 → TryQuickMoveItems 柜→包
    /// （silent，feed 两跳同款）→ 落包按 cfg 重解析 → 官方快转。满/禁入预检→MarkFeedFail
    /// （noitem/forbid/full/nomove 四码，ctx.feedFail 一次性回执，JS toast 官方口径文案）。</summary>
    private static void OpBasketPut(Cmd c)
    {
        var st = BasketGlist.State();
        long basket = 0;
        try { basket = st?.OwnerIdRP_B?.Value ?? 0; } catch { }
        bool isBasket = false;
        try { isBasket = st != null && st.IsBasket_B != null && st.IsBasket_B.Value; } catch { }
        if (!isBasket || basket <= 0) { WarnOnce("basketput:nobasket", "basketPut 丢弃：篮子态不在场"); return; }

        long bag = RailData.BagOwner();
        var im = RailData.ItemMgr();
        if (bag <= 0 || im == null) { RailData.MarkFeedFail("noitem"); return; }

        bool fromBag = c.Owner == bag;
        if (!fromBag && !Whitelisted(c.Owner))
        {
            CabinetEverywherePlugin.Log.LogWarning($"[CERail] basketPut 丢弃：owner={c.Owner} 不在白名单（红线2）");
            return;
        }
        var srcInner = OwnerItems(im, c.Owner);
        var src = ItemOf(srcInner, c.Item);
        if (src == null) { RailData.MarkFeedFail("noitem"); return; }

        // 禁入预检（官方 IsBasketForbidItem 口径——截图红叹号同源）
        int cfgId = 0;
        try { cfgId = src.ItemConfigId; } catch { }
        try { if (GameCore.HotUpdate.NeighborRules.IsBasketForbidItem(cfgId)) { RailData.MarkFeedFail("forbid"); return; } } catch { }

        // 容量预检：件数（叠数）≥max 且篮内无同 cfg 叠（并入不增件）→ full
        int maxItems = 5;
        try { maxItems = Math.Max(1, GameCore.HotUpdate.GameKey.GlobalSetting_Neighbor_BasketMaxItems); } catch { }
        int basketStacks = 0; bool hasSameCfg = false;
        try
        {
            var b = st.ItemDataList_B;
            if (b != null)
            {
                basketStacks = b.Count;
                for (int i = 0; i < b.Count; i++)
                {
                    var bi = b[i];
                    int bc = 0;
                    try { bc = bi?.ItemConfigId ?? 0; } catch { }
                    if (bc == cfgId && cfgId > 0) { hasSameCfg = true; break; }
                }
            }
        }
        catch { }
        if (basketStacks >= maxItems && !hasSameCfg) { RailData.MarkFeedFail("full"); VLog(c.Op, $"full：{basketStacks}/{maxItems} cfg={cfgId}"); return; }

        if (fromBag)
        {
            // 终审 I1：包源同拆 1 件（count>1 → SplitItem；官方快转若为整叠语义，不拆=整叠入篮
            // 违反「右键 1 件」口径，且与柜源行为不一致）
            int srcCount = 0;
            try { srcCount = src.ItemCount; } catch { }
            long pieceId = c.Item;
            if (srcCount > 1)
            {
                var split = TrySplit(im, c.Item);
                if (split > 0) pieceId = split;
            }
            SendQuickTransfer(pieceId);
        }
        else
        {
            // 柜源两跳（OpFeed 同款纪律）：拆 1 件柜→包（silent）→ 落包定位 → 官方快转入篮。
            // 终审 I2：落包定位=InstanceId 优先（拆件未并包叠时直用）；已并叠（包内同 cfg 叠
            // 有余量）时对并叠再拆 1 件发拆出叠——cfg-first 直发整叠=OpFeed 终审 Important2
            // 已修掉的「错喂整叠」模式，不回潮
            var batch = new Il2CppSystem.Collections.Generic.List<long>();
            AddTakeOne(im, srcInner, c.Item, batch);
            if (batch.Count == 0) { RailData.MarkFeedFail("noitem"); return; }
            int moved = im.TryQuickMoveItems(batch, c.Owner, bag, SilentQuickMove, false);
            if (moved <= 0)
            {
                // 终审 I4：柜→包失败主因=背包满——源叠仍在柜=bagfull（OpFeed :619 同口径），否则 noitem
                bool stillInCabinet = ItemOf(OwnerItems(im, c.Owner), c.Item) != null;
                RailData.MarkFeedFail(stillInCabinet ? "bagfull" : "noitem");
                VLog(c.Op, $"柜→包失败 cfg={cfgId} {(stillInCabinet ? "bagfull" : "noitem")}");
                return;
            }
            var bagInner = OwnerItems(im, bag);
            long target = 0;
            if (ItemOf(bagInner, batch[0]) != null) target = batch[0]; /* 拆件独立存活：直用 */
            if (target <= 0)
            {
                foreach (var pair in bagInner) /* 已并叠：找到并叠后再拆 1 件 */
                {
                    var it = pair.Value;
                    if (it == null) continue;
                    int bc = 0;
                    try { bc = it.ItemConfigId; } catch { }
                    if (bc == cfgId) { try { target = it.InstanceId; } catch { } break; }
                }
                if (target > 0)
                {
                    int mergedCount = 0;
                    try { mergedCount = ItemOf(bagInner, target)?.ItemCount ?? 0; } catch { }
                    if (mergedCount > 1)
                    {
                        var split = TrySplit(im, target);
                        if (split > 0) target = split;
                    }
                }
            }
            if (target <= 0) { RailData.MarkFeedFail("noitem"); VLog(c.Op, $"cfg={cfgId} 落包重解析失败"); return; }
            SendQuickTransfer(target);
        }
        VLog(c.Op, $"owner={c.Owner} item={c.Item} cfg={cfgId} 件={basketStacks}/{maxItems}{(hasSameCfg ? " 并叠" : "")}");

        static void SendQuickTransfer(long itemId)
        {
            try { GameCore.HotUpdate.ReduxUI.Ac_BackpackUI_QuickTransferItem.SendAction(itemId); }
            catch (Exception e) { RailData.MarkFeedFail("nomove"); WarnOnce("basketput:send", "QuickTransferItem 发送失败: " + e.Message); }
        }

        static long TrySplit(GameCore.HotUpdate.Battle.Logic.ItemManager im, long id)
        {
            try
            {
                var split = im.SplitItem(id, 1);
                return split?.InstanceId ?? 0;
            }
            catch { return 0; }
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
    /// <summary>
    /// uiClose{key}（调试专用，[Rail] AllowDebugUiShow=true 才生效）：官方 Ac_CloseUI 重放——
    /// uiShow 前清场。实锤：Ac_OpenUI 开新页不自动关旧页，双 UI 活跃时 RailData.ActivePage()
    /// 取到残留旧页 → 契约 ctx.page 错 → rail 按错误场景渲染（2026-11-01 实机验证踩坑）。
    /// </summary>
    private static void OpUiClose(Cmd c)
    {
        if (CabinetEverywherePlugin.AllowDebugUiShow?.Value != true) { WarnOnce("uiClose:gate", "uiClose 丢弃：[Rail] AllowDebugUiShow=false"); return; }
        try
        {
            var uiType = UiTypeOf(c.Key);
            if (uiType == null) { WarnOnce("uiClose:key", "uiClose 未知页: " + c.Key); return; }
            GameCore.HotUpdate.ReduxUI.Ac_CloseUI.SendAction(uiType);
            VLog(c.Op, c.Key + " (Ac_CloseUI)");
        }
        catch (Exception e) { WarnOnce("uiClose:call", "uiClose 异常: " + e.Message); }
    }

    private static Il2CppSystem.Type UiTypeOf(string key)  /* Ac_OpenUI/Ac_CloseUI.SendAction 形参=Il2CppSystem.Type（Il2CppType.From 直出） */
    {
        try
        {
            switch (key)
            {
                case "BackpackUI": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_BackpackUI)); /* 2026-11-01 实机踩坑补：缺此映射=uiClose 关不掉背包→ActivePage 被霸占全跑偏 */
                case "Cooking": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Cooking));
                case "BrewPanel": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Brew));
                case "RatCage": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_RatCage));
                case "DyePanel": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Dye));
                case "Compressor": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Compressor));
                case "Shredder": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_Shredder));
                case "GreenhouseBuild": return Il2CppInterop.Runtime.Il2CppType.From(typeof(GameCore.HotUpdate.ReduxUI.WebUI_GreenhouseBuild));
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
    /// storeAll{order}：§4.7 一键入库路由——背包快照后：物品命中标签集 → 按 order 顺序找「柜官方
    /// 标签名与之有交集」的柜，**按柜分批** TryQuickMoveItems 整批放入，柜满（叠件数纹丝不动）顺延
    /// 下一个匹配柜，无匹配/全满留背包。order 内非白名单 id 跳过+警告（order 来自 JS 页签顺序）。
    /// 材料架补「材料」伪标签入路由（CabinetCatalog.IsMaterialRack 语义：架子不能打标签但只收材料，
    /// JS 筛选侧同款伪标签口径；架子官方类型限制仍由 TryQuickMoveItems 自行兜底，T14 校准）。
    /// 2026-11-11 性能批（背包物品多时一键入库卡顿）：旧版逐叠逐柜试放=interop 调用最坏 O(叠数×柜数)
    /// 且每叠触发一轮官方 OnQuickMoveItem(s) 事件广播，全在一帧内=主帧冻结。本版改 OpPutTag:419 同款
    /// 「先收集后整批」形态：路由在托管侧完成（cfgId→命中标签集本地缓存，同 cfgId 只查一次配置表），
    /// 每柜一批一次调用；顺延判定=批后查叠现 ItemCount 比快照（件数减少=有吸收即视为已放置，部分
    /// 吸收不再顺延——对齐旧 moved&gt;0 即 break 语义），纹丝不动的叠 next 推进后下轮顺延。
    /// 每轮轮首重取 OwnerCache 背包字典（防引用被整替后 ItemOf 恒 miss 误判整批移走）。
    /// 尾行三段计时（快照/路由+移动/调用次数，Bug4 tidy 计时先例）=收益验收观测点。
    /// 2026-11-11 匹配批（材料架收不进+部分食物/花朵无标签可命中）：旧版「分类名==标签名」精确匹配
    /// 漏两大域——①分类是粗粒度（23 类）而官方标签是细粒度（33 个：食物域细分 15 个），打细分标签
    /// （主食/肉类/蛋奶/…）的柜收不进任何「食物」类物品；②花卉/投掷物/陷阱等六类无同名标签永不
    /// 命中。修法（作者裁定：与官方按标签存取同口径）=**直调官方权威判定**
    /// FurnitureTagRules.Matches(rule, cfg, remainDays, PutIn)（dump.cs@111363，官方按标签存取
    /// 同一函数：菜品/食材/即食/防御耗材走官方 _dishIds/_miscIds/DefenseSupplyItemIds 缓存，
    /// 需冷藏走 remainDays&lt;NeedsColdMaxDays(10) 的运行时判定）——mod 侧分类↔标签映射表整体
    /// 退役，官方判什么就是什么。remainDays=RailSortMath.DaysLeftOf 同源（TimeLeft 游戏小时÷24；
    /// 不腐传 float.MaxValue=永不满足「会变坏」、过期传 0）。材料架 rule=[1012 TagMaterial]
    /// （RackRouteTag）；无标签柜不入路由（§4.7 原语义，cabEmpty 构造期标记——IReadOnlyList
    /// 代理无 Count 可靠值，T14 校准注释同款）。
    /// </summary>
    /// <summary>材料架路由 rule：官方 TagMaterial 常量（FurnitureTagRules.TagMaterial=1012）——
    /// 架子不能打标签（TagIds 恒空）但只收材料，官方 Evaluate 对 1012 的判定=材料域（架子
    /// 「只能放材料类」的硬限制仍由 TryQuickMoveItems 兜底，T14 校准）。</summary>
    private const int RackRouteTag = 1012;

    /// <summary>每帧搬运件数上限（2026-11-11 提速终案）：实测铁律=凑满逻辑受顺延探测拖累
    /// （258 帧/261 件≈1 件/帧，67 次 0 件调用在探满柜）——上限提到 12 件/帧（弹窗模态期间
    /// 玩家看进度条不看游戏帧率，掉帧可接受）+ 桶级饱和标记（整桶 0 件=柜满，后续帧直接跳过
    /// 该柜不再逐帧重试）→ 261 件 ≈ 25-40 帧 ≈ 2-3s。</summary>
    private const int StoreBatchPerFrame = 12;

    /// <summary>storeAll 跨帧任务（方案 A 终案，头注释见 OpStoreAll）：Pump 每帧驱动一步
    /// （DriveStoreTask），LastIds/LastCab=上帧批与柜（本帧首结算差量）。TotalStacks=进度
    /// 分母（初始可路由叠+配置查无叠），进度分子=TotalStacks-Pending.Count（每帧 RemoveAll
    /// 后的即时值），每 5 帧小包直推 __CERAIL__.storeProg（模态进度弹窗，交互终案）。</summary>
    private sealed class StoreAllTask
    {
        public long Bag;
        public GameCore.HotUpdate.Battle.Logic.ItemManager Im;
        public List<CabinetCatalog.ContainerInst> Cabs;
        public List<Il2CppSystem.Collections.Generic.IReadOnlyList<int>> CabRules;
        public List<bool> CabEmpty;
        public List<(long id, GameCore.HotUpdate.Config_Item ic, float days, int cnt, int next)> Pending;
        public List<(int k, int cab)> LastIds; // 上帧批（pending 下标+所试柜）→ 本帧首结算差量
        public bool[] CabSaturated; // 桶级饱和（提速终案：整桶结算 0 件=柜满，MatchCab 跳过不再逐帧重试探测）
        public int ScanFrom; // 扫描游标（提速批：连续帧同柜时从上次位置续扫，不每帧从头全扫——600 叠全扫≈1.5ms/帧省掉）
        public Il2CppSystem.Collections.Generic.List<long> Batch;
        public int MovedStacks, MovedTotal, LeftStacks, TotalStacks, Calls, MatchCalls, Steps;
        public long TSnap; public System.Diagnostics.Stopwatch Sw;
    }
    private static StoreAllTask _storeTask;
    /// <summary>入库任务在途（RailUi.PushIfDue 闸门用：任务期间压住 FastPoll/Tick 全量重推，
    /// 防每帧搬运各触发一次 136KB BuildJson+下发——完成时收尾一次性推）。</summary>
    internal static bool StoreTaskActive => _storeTask != null;
    /// <summary>中止入库任务（storeAbort 命令=玩家 ✕ 关弹窗；OnWorldRebind 换档同口）：
    /// 走 FinishStoreTask 正式收口（部分已入库不可回滚——剩余留背包；收尾推送+哨兵+汇总日志照发，
    /// 哨兵对已关窗/已换档的 JS 无消费方=无害）。</summary>
    internal static void AbortStoreTask()
    {
        var t = _storeTask;
        if (t != null) FinishStoreTask(t, "手动中止（✕ 关闭）");
    }

    /// <summary>
    /// 2026-11-11 终案（方案 A：跨帧小批后台任务）：实机日志实锤卡顿根因=官方 TryQuickMoveItems
    /// 逐件 Notify 广播×订阅者全量活的**平方成本**（157 件 3.6s 单帧阻塞、54 件 179ms——
    /// C# 批量化只减 interop 边界，减不了官方内部风暴）。TAG_PUT_IN 官方事件重放路实测零效
    /// （官方按钮 core.UnitySendEvent 页内直发，postMessage 跨帧路由不认该 type——SORT_BACKPACK
    /// 在白名单故整理可用，教训存档）。终案=OpStoreAll 拆成**跨帧任务**（Pump 每帧驱动）：
    /// 每帧仅 ≤StoreBatchPerFrame 件小批一柜一次调用（小批区线性价），主帧每帧 ~13ms 不掉帧、
    /// 不切页玩家零打扰（该干嘛干嘛）；任务期间 PushIfDue 闸住（FastPoll/Tick 双通道）防每帧
    /// 全量重推，完成后 RefreshActivePage+ForceRepublish 一次性收口 + storeAllDone 哨兵包
    /// （RailData.MarkStoreDone→ctx 一次性带出即清，lastTidyFail 同款先例）：JS settleXfer
    /// 收到哨兵才解除 hold 结算差量 toast、入库按钮恢复。JS 侧任务期间禁用按钮（storeBtnBusy）。
    /// </summary>
    private static void OpStoreAll(Cmd c)
    {
        // 早退哨兵（交互终案兜底）：JS 弹窗在 cmdOut 后即开，任何不建任务的早退必须发哨兵包
        // （MarkStoreDone+ForceRepublish）关掉进度弹窗——探险模式无柜早退曾致 0% 悬挂（作者实测）。
        void Bail(string warnKey, string warnMsg, string vlog)
        {
            WarnOnce(warnKey, warnMsg);
            VLog(c.Op, vlog);
            RailData.MarkStoreDone();
            RailData.ForceRepublish();
        }
        if (_storeTask != null) { WarnOnce("storeAll:busy", "storeAll 丢弃：入库任务进行中（按钮应已禁用，防御）"); return; }
        var sw = System.Diagnostics.Stopwatch.StartNew();
        long bag = RailData.BagOwner();
        if (bag <= 0) { Bail("storeAll:nobag", "storeAll 丢弃：背包 owner 不可得", "无背包 owner，弹窗哨兵收口"); return; }
        var im = RailData.ItemMgr();
        if (im == null) { Bail("storeAll:noim", "storeAll 丢弃：ItemManager 不可得", "无 ItemManager，弹窗哨兵收口"); return; }

        var cabs = new List<CabinetCatalog.ContainerInst>();
        var cabRules = new List<Il2CppSystem.Collections.Generic.IReadOnlyList<int>>();
        var cabEmpty = new List<bool>();
        foreach (var id in c.Order)
        {
            var inst = ContainerOf(id);
            if (inst == null) { CabinetEverywherePlugin.Log.LogWarning($"[CERail] storeAll：order 内 owner={id} 不在白名单，跳过（红线2）"); continue; }
            var rule = new Il2CppSystem.Collections.Generic.List<int>();
            if (inst.IsMaterialRack) rule.Add(RackRouteTag); // 架子路由 rule（头注释匹配批）
            else for (int t = 0; t < inst.TagIds.Length; t++) rule.Add(inst.TagIds[t]);
            var ruleArg = rule.TryCast<Il2CppSystem.Collections.Generic.IReadOnlyList<int>>();
            if (ruleArg == null) { WarnOnce("storeAll:cast", "List<int>→IReadOnlyList<int> 代理转换失败，柜出局 owner=" + id); continue; } // OpSetTags 同款纪律
            cabs.Add(inst);
            cabRules.Add(ruleArg);
            cabEmpty.Add(rule.Count == 0); // 构造期标记（代理侧 Count 不可靠，头注释）
        }
        if (cabs.Count == 0) { Bail("storeAll:nocabs", "storeAll 丢弃：无有效柜候选（探险模式？）", "无有效柜候选（order 空/全非法/探险模式），背包原样｜弹窗哨兵收口"); return; }

        var inner = OwnerItems(im, bag);

        // 快照后路由（评审 Important 2）：TryQuickMoveItems 整叠吸收即 Remove 字典项，
        // 在 il2cpp 字典枚举中途调用会触发枚举器版本检查抛 InvalidOperationException
        // （被 catch 吞掉 → 入库只到第一叠成功为止）。先把背包快照为托管 List(id+cfg+count+保质天数)
        // ——count 供批后顺延判定（件数差量），remainDays 供官方 Matches 的需冷藏判定，
        // 路由决策与移动都基于快照（OpCat/OpPutTag 先收集后移动的同一形态）。
        var snapshot = new List<(long id, int cfg, int cnt, float days)>();
        float nowHours = RailSortMath.NowHours();
        if (inner != null)
        {
            try
            {
                foreach (var pair in inner)
                {
                    var it = pair.Value;
                    if (it == null) continue;
                    long id = 0; int cfg = 0, cnt = 0;
                    try { id = it.InstanceId; cfg = it.ItemConfigId; cnt = it.ItemCount; } catch { }
                    if (id <= 0) continue;
                    // remainDays 口径（头注释匹配批）：正常=剩余天，过期=0（会变坏），不腐/冻结=MaxValue
                    float days = float.MaxValue;
                    try
                    {
                        var di = RailSortMath.DaysLeftOf(ItemCfg(cfg), it, nowHours);
                        if (di.IsExpired) days = di.HasNumber ? 0f : float.MaxValue; // 过期无计=不腐兜底
                        else if (di.HasNumber) days = di.Days;
                    }
                    catch { }
                    snapshot.Add((id, cfg, cnt, days));
                }
            }
            catch (Exception e) { WarnOnce("storeAll:snap", "背包快照异常: " + e.Message); }
        }
        long tSnap = sw.ElapsedMilliseconds;

        // 可路由队列：ic 解析（cfgId 本地缓存，同 cfgId 只查一次 ItemCfg）。next=下一候选柜下标
        // （顺延游标），-1=终局标记（已放置/无匹配柜），帧内统一压缩（先标后压防下标漂移）。
        int leftStacks = 0;
        var icCache = new Dictionary<int, GameCore.HotUpdate.Config_Item>();
        var pending = new List<(long id, GameCore.HotUpdate.Config_Item ic, float days, int cnt, int next)>();
        foreach (var (id, cfg, cnt, days) in snapshot)
        {
            if (!icCache.TryGetValue(cfg, out var ic) || ic == null)
            {
                ic = ItemCfg(cfg);
                icCache[cfg] = ic;
            }
            if (ic == null) { leftStacks++; continue; } // 配置查无：无法路由 → 留背包（红线4 同口径）
            pending.Add((id, ic, days, cnt, 0));
        }
        if (pending.Count == 0)
        {
            VLog(c.Op, $"cabs={cabs.Count} 入库 0 叠/0 件，留背包 {leftStacks} 叠（无可路由物品）");
            RailData.MarkStoreDone(); // 哨兵收口（背包空/全配置查无：进度弹窗直落完成态）
            RailData.ForceRepublish();
            return;
        }

        _storeTask = new StoreAllTask
        {
            Bag = bag, Im = im, Cabs = cabs, CabRules = cabRules, CabEmpty = cabEmpty,
            Pending = pending, Batch = new Il2CppSystem.Collections.Generic.List<long>(),
            CabSaturated = new bool[cabs.Count],
            LeftStacks = leftStacks, TotalStacks = leftStacks + pending.Count, TSnap = tSnap, Sw = sw,
        };
        VLog(c.Op, $"任务启动：柜 {cabs.Count} 叠 {pending.Count}（每帧 ≤{StoreBatchPerFrame} 件分帧，完成时哨兵包收口）");
    }

    /// <summary>入库任务每帧一步（Pump 尾部调用）：①结算上帧批（count 差量：placed 终局/放不下
    /// 顺延游标）→ ②压缩终局+完成判定 → ③扫描找本帧批（首个活叠的匹配柜 j0，收同柜活叠
    /// ≤N 个；其余叠不动——扫描期不推进游标，只有「试过放不下」才推进）→ ④一柜一次调用发批。
    /// 扫描 O(活叠) 次 Matches/帧（实测 2182 次仅数 ms，微秒级/帧）。</summary>
    private static void DriveStoreTask()
    {
        var t = _storeTask;
        if (t == null) return;
        try
        {
            t.Steps++;
            var inner = OwnerItems(t.Im, t.Bag);
            if (inner == null) { FinishStoreTask(t, "背包字典不可得（保守终止）"); return; }
            if (t.LastIds != null)
            {
                var anyOk = new Dictionary<int, bool>(); // cab → 本批该柜有无吸收（提速终案：全无=饱和）
                for (int x = 0; x < t.LastIds.Count; x++)
                {
                    int k = t.LastIds[x].k, cab = t.LastIds[x].cab;
                    var p = t.Pending[k];
                    int now = 0;
                    try { now = ItemOf(inner, p.id)?.ItemCount ?? 0; } catch { }
                    if (now < p.cnt) { t.MovedStacks++; t.MovedTotal += p.cnt - now; p.next = -1; anyOk[cab] = true; } // 件数减少=有吸收即 placed（部分吸收不顺延，旧 moved>0 语义）
                    else { p.next = cab + 1; anyOk[cab] = anyOk.GetValueOrDefault(cab); } // 纹丝不动=放不下：顺延游标推进（anyOk 保持既有值/缺省 false）
                    t.Pending[k] = p;
                }
                foreach (var kv2 in anyOk)
                    if (!kv2.Value) t.CabSaturated[kv2.Key] = true; // 整柜零吸收=满：后续帧跳过（省逐帧探测）
                t.LastIds = null;
            }
            t.Pending.RemoveAll(p => p.next < 0);
            if (t.Pending.Count == 0) { FinishStoreTask(t, null); return; }
            if (t.Steps % 3 == 0) RailUi.PushStoreProg(t.TotalStacks - t.Pending.Count, t.TotalStacks); // 进度小包（~20 次/s，提速批加密）
            // 扫描（提速终案：环形游标+**跨柜分桶凑满**——旧「一柜一批」实测 191 调用/207 件≈1 件/帧，
            // 游标窗口内同柜叠稀疏=批恒凑不满，192 帧×40ms=7.6s 主因；改按柜分桶凑满 StoreBatchPerFrame
            // 件止（帧内每桶一次调用 1-3 次），帧数 ~207/4≈55 → ~2.4s）
            int n = t.Pending.Count;
            var buckets = new Dictionary<int, List<int>>();
            int gathered = 0, lastK = -1;
            for (int pass = 0; pass < n && gathered < StoreBatchPerFrame; pass++)
            {
                int k = (t.ScanFrom + pass) % n;
                var p = t.Pending[k];
                if (p.next < 0) continue;
                int j = p.next;
                while (j < t.Cabs.Count && !MatchCab(t.CabRules, t.CabEmpty, t.CabSaturated, j, p.ic, p.days, ref t.MatchCalls)) j++; // §4.7：官方判定（含饱和跳过）
                if (j >= t.Cabs.Count) { p.next = -1; t.Pending[k] = p; t.LeftStacks++; continue; } // 无匹配柜：终局留背包
                if (!buckets.TryGetValue(j, out var g)) { g = new List<int>(); buckets[j] = g; }
                g.Add(k); gathered++; lastK = k;
            }
            if (gathered == 0)
            {
                t.ScanFrom = 0;
                t.Pending.RemoveAll(p => p.next < 0);
                if (t.Pending.Count == 0) FinishStoreTask(t, null);
                return;
            }
            t.ScanFrom = (lastK + 1) % n;
            t.LastIds = new List<(int, int)>(gathered);
            foreach (var kv in buckets)
            {
                t.Batch.Clear();
                for (int x = 0; x < kv.Value.Count; x++) t.Batch.Add(t.Pending[kv.Value[x]].id);
                t.Calls++;
                t.Im.TryQuickMoveItems(t.Batch, t.Bag, t.Cabs[kv.Key].OwnerId, SilentQuickMove, false);
                for (int x = 0; x < kv.Value.Count; x++) t.LastIds.Add((kv.Value[x], kv.Key));
            }
        }
        catch (Exception e)
        {
            WarnOnce("storeAll:drive", "入库任务步进异常（终止）: " + e.Message);
            FinishStoreTask(t, "异常终止");
        }
    }

    /// <summary>任务收尾（正常/异常同口）：先清任务（PushIfDue 闸门开）→ 哨兵+官方页刷+重推
    /// 一次性收口（任务期间被闸住的全量推送在此补上）→ 汇总 VLog（总时长/帧数/调用次数）。</summary>
    private static void FinishStoreTask(StoreAllTask t, string abort)
    {
        _storeTask = null;
        RailUi.PushStoreProg(t.TotalStacks, t.TotalStacks); // 进度 100%（弹窗转完成态由哨兵包驱动）
        RailData.MarkStoreDone();     // ctx.storeAllDone 哨兵（JS settleXfer 解除 hold+弹窗结果态）
        RailData.RefreshActivePage(); // 官方格刷（任务期间官方直调零推送的补口）
        RailData.ForceRepublish();    // mod 契约重推（闸门已开，下一周期出包）
        if (abort != null) WarnOnce("storeAll:abort", "入库任务提前终止：" + abort);
        VLog("storeAll", $"cabs={t.Cabs.Count} 入库 {t.MovedStacks} 叠/{t.MovedTotal} 件，留背包 {t.LeftStacks} 叠" +
            $"｜性能 快照 {t.TSnap}ms 任务 {t.Sw.ElapsedMilliseconds - t.TSnap}ms/{t.Steps} 帧 均 {t.MovedStacks / Math.Max(1, t.Steps)} 件/帧" +
            $" 饱和柜 {CountTrue(t.CabSaturated)}/{t.Cabs.Count} Matches {t.MatchCalls} 次 TryQuickMoveItems {t.Calls} 次");
    }

    private static int CountTrue(bool[] a)
    {
        int n = 0;
        for (int i = 0; i < a.Length; i++) if (a[i]) n++;
        return n;
    }

    /// <summary>官方标签判定（storeAll 路由）：FurnitureTagRules.Matches(rule, cfg, remainDays,
    /// PutIn)——官方「按标签存取」同一函数，mod 零自建映射（头注释匹配批）。空 rule 柜（无标签）
    /// 不入路由；官方调用异常按不匹配保守处理（不阻断整批）。</summary>
    private static bool MatchCab(
        List<Il2CppSystem.Collections.Generic.IReadOnlyList<int>> cabRules, List<bool> cabEmpty, bool[] cabSat,
        int j, GameCore.HotUpdate.Config_Item ic, float remainDays, ref int matchCalls)
    {
        if (cabEmpty[j] || cabSat[j]) return false; // 无标签柜不入路由（§4.7）；饱和柜跳过（提速终案）
        matchCalls++;
        try
        {
            return GameCore.HotUpdate.FurnitureTagRules.Matches(
                cabRules[j], ic, remainDays, GameCore.HotUpdate.FurnitureTagMatchPurpose.PutIn);
        }
        catch (Exception e) { WarnOnce("storeAll:match", "官方 Matches 调用异常: " + e.Message); return false; }
    }

    /// <summary>
    /// pinOrder{key:场景键, order:[ownerId...]}（四轮 作者#2 定案）：显示序落 cerail_pinorder.json，
    /// TabInjector 0.5s 轮询把官方 BagTabs 重排成同序（官方 A/D 步进走官方数组序——序一致后
    /// 步进=显示序邻居）。key 非四注入页=丢弃（其他页官方数组非本 mod 注入域，不动）。
    /// 调用点：JS 拖拽落序（savePinOrder）+ 场景开启自愈（applyScene）。
    /// </summary>
    private static void OpPinOrder(Cmd c)
    {
        string pageKey = TabInjector.PageKeyOfScene(c.Key);
        if (pageKey == null) { WarnOnce("pinOrder:page", "pinOrder 丢弃：非注入页 key=" + c.Key); return; }
        if (c.Order == null || c.Order.Count == 0) return;
        // 白名单过滤（红线2 同款纪律）：不在容器名单的 id 剔除（防脏 localStorage 注入幽灵序）
        var ids = new List<long>(c.Order.Count);
        int dropped = 0;
        foreach (var id in c.Order)
        {
            if (Whitelisted(id)) ids.Add(id);
            else dropped++;
        }
        if (ids.Count == 0) return;
        TabInjector.SavePinOrder(pageKey, ids);
        VLog(c.Op, $"page={pageKey} ids={ids.Count} dropped={dropped}（0.5s 轮询重排官方数组序）");
    }

    /// <summary>v1.9.1 筛选下拉：选中（批改后 sel 域={"0"=全部/"food"=食物域/"other"=其他/官方 tagId}）落
    /// cerail_filter.json；sel 过 TabGate.SelValid 白名单（官方标签表），非法整条丢弃。
    /// 调用点：JS 页脚下拉 pickFilterSel（用户选择）+ applyScene 开页自愈上报（非缺省值）。</summary>
    private static void OpSetFilter(Cmd c)
    {
        string pageKey = TabInjector.PageKeyOfScene(c.Key);
        if (pageKey == null) { WarnOnce("setFilter:page", "setFilter 丢弃：未知页 key=" + c.Key); return; }
        var sel = c.Sel ?? "0";
        if (!TabGate.SelValid(sel, out var normalized))
        {
            WarnOnce("setFilter:sel", $"setFilter 丢弃：sel={sel} 非白名单（0/other/官方 tagId）");
            return;
        }
        TabGate.SaveFilter(pageKey, normalized);
        VLog(c.Op, $"page={pageKey} sel={normalized}（下轮对账收窄可见集）");
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
