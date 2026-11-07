using System;
using System.Collections.Generic;
using BepInEx;
using BepInEx.Configuration;
using BepInEx.Logging;
using BepInEx.Unity.IL2CPP;
using Il2CppInterop.Runtime.Injection;
using SurvivalLog.ModShared;
using UnityEngine;
using Object = UnityEngine.Object;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>场景视图：Food=食物标签柜+全部冰箱；Material=材料/工具标签柜（不含冰箱与未打标签柜，2026-10-19 定版）；Browser=下拉自由筛选；
/// Fuel=带「燃料」官方标签(tagId 1013，Config_FurnitureTag 实证)的柜子——2026-11-07 燃油发电机 bagtabs 页专属（spec 2026-11-06-fuelgen-cabinet-tabs）。</summary>
public enum ScenarioView { Food, Material, Browser, Fuel }

/// <summary>
/// 储藏柜直达 + 标签筛选/场景视图（原独立 mod CabinetTagFilter 已于 2026-10-17 并回）。
///
/// 1. 直达：让普通储物类家具（储物柜/金属柜/床头柜等）出现在制作类界面的容器页签：
///    a. 白名单注入：把柜子家具 ID 加进 ToolCabinetConfig.CraftSourceFurnitureIds（官方"制作材料源"
///       白名单，原生驱动 工作台/无人机交易/无人机站/粉碎机/温室 五个系统的页签与自动取料，
///       GetAllLinkedOwnerIds 实证遍历 CabinetTabs 参与自动补料）。
///    b. 页签注入：烹饪/老鼠笼/酿酒桶/颜料桶 的容器过滤是内联的"冷链电器"判定（不走白名单），
///       改为向各自 Redux 状态的 BagTabs（ObservableList）追加柜子页签；切换/取放路径
///       ApplySwitchBag→GetBagData(ownerId) 已实证为通用取包，无类型过滤。
/// 2. 筛选/场景视图：按界面 cfg（[Scenario] View_*）固定收窄页签视野（食物/材料），或 Browser
///    模式自绘下拉按官方标签筛选；A/D 步进自动跳过被藏柜子（JS 侧扣发+伪造，DESIGN.md 附录）。
///
/// General.Enabled 总开关（2026-10-24，ModCenter 启停位）：false=白名单注入对称移除
/// （CraftSourceInjector.RemoveAll 按 _added 集合逐条 Remove）并全线停写停注入
/// （Ticker/页签注入/筛选/修剪/袋刷新合并均停）；已打开界面重开后收敛（原生重建页签）。
/// 下次启动不加载（不创建 Ticker、不装合并补丁，零日志零改写）。
///
/// 实证依据见 DESIGN.md（2026-10-10 全程反汇编 + 附录 A/C 取证史）。
/// </summary>
[BepInPlugin(Guid, Name, Version)]
public sealed class CabinetEverywherePlugin : BasePlugin
{
    public const string Guid = "com.local.survivallog.cabineteverywhere";
    public const string Name = "CabinetEverywhere";
    public const string Version = "1.8.1";

    internal static ManualLogSource Log;

    // General.Enabled 总开关（ModCenter 启停位，2026-10-24）：false=对称移除白名单注入并停写停注入；
    // 下次启动不加载（不创建 Ticker、不装合并补丁，零日志零改写）。
    internal static ConfigEntry<bool> Enabled;
    internal static ConfigEntry<bool> EnableCraftSource;
    internal static ConfigEntry<bool> EnableCooking;
    internal static ConfigEntry<bool> EnableRatCage;
    internal static ConfigEntry<bool> EnableBrew;
    internal static ConfigEntry<bool> EnableDye;
    internal static ConfigEntry<string> IncludeFurnitureIds;
    internal static ConfigEntry<string> ExcludeFurnitureIds;
    internal static ConfigEntry<string> ExcludeBagIds;
    internal static ConfigEntry<bool> Verbose;
    internal static ConfigEntry<bool> ListOnReady;
    internal static ConfigEntry<bool> DumpFurniture;
    internal static ConfigEntry<bool> DumpDyePigments; // 染料桶排序 spike（dye-pigment-sort spec §6）：一次性自发现 dump
    internal static ConfigEntry<bool> FilterEnable;
    internal static ConfigEntry<bool> RailEnable;   // CERail 侧栏总开关（T8，[Rail] 区，General 区后）
    // ==== 高度修改批（2026-11-07，spec 2026-11-07-bag-height-design §4.1）====
    // 宽度退役恒 12（Rail.UniformBagWidth 绑定删除，代码常量 RailUi.UniformWidth；老 cfg 残留值忽略）。
    // 高度 15 键逐包/逐组，全部默认 0=恢复原生；MaxHeight 逐包/逐档夹持；缩高=越界物品官方掉落（ShrinkDrop）。
    // SettingChanged→RailUi.SizeDirty（帧内主线程重算=立即生效硬验收，勿直调 Il2Cpp）。
    internal static ConfigEntry<int> BackpackHeight;   // 背包链 9 包统一行数（天赋换包链必须同高，spec §7）
    internal static ConfigEntry<int> DrawerHeight;     // 工作台抽屉基准行数：三档=H/H+1/H+2（升级链保留）
    internal static ConfigEntry<int> MaxHeight;        // 高度防呆上限（0=不封顶自担）
    internal static Dictionary<int, ConfigEntry<int>> HeightByBag; // 12 个单包键（置物架4+工具柜1+冰箱4+载具3）
    internal static readonly int[] BackpackBagIds = { 1, 2, 5, 6, 7, 8, 9, 10, 11 }; // 天赋链（含 2 登山包/8 仓管初始）
    // 柜宽白名单（十六批）：Access 双名单（ExcludeBagIds/NonStorageBagIds）挡的是页签/筛选语义，
    // 不应连带挡宽度——名单内包的格子是真储物格、宽度照 12 统一（默认 1009 中控台）。
    internal static ConfigEntry<string> SizeIncludeBagIds;
    internal static ConfigEntry<bool> AllowDebugUiShow; // 调试：uiShow 远程显示官方界面（实机验收 Chrome 用，默认关）
    internal static ConfigEntry<int> RemoteDebugPort; // v1.8.10 八追：>0=WebView2 附加 --remote-debugging-port（断流现场 CDP 取证，默认关）
    internal static ConfigEntry<bool> ClassicWebViewScrollbars; // v1.8.8 关 fluent 滚动条（环境变量级，重启生效）

    // 场景视图（键=实测 iframe id，T1 report L203-214：Trade 不是 TradeUI、Brew 页 id=BrewPanel）
    internal static ConfigEntry<ScenarioView> ViewCooking, ViewRatCage, ViewBrewPanel, ViewDyePanel, ViewCompressor,
                                              ViewToolTable, ViewShredder, ViewGreenhouseBuild, ViewTrade, ViewDroneHub, ViewFuelGenerator, ViewHeater;
    // 燃油发电机柜子页签总开关（2026-11-07 二十一批后新增页：bagtabs 装配，spec fuelgen-cabinet-tabs）
    internal static ConfigEntry<bool> EnableFuelGen;
    // 暖炉柜子页签总开关（暖炉移植批=bagtabs 族第二页：与 EnableFuelGen 同构独立开关，不联动）
    internal static ConfigEntry<bool> EnableHeater;

    internal static volatile bool Rerun = true;

    public override void Load()
    {
        Log = base.Log;
        // General.Enabled 放最前 Bind（保证 cfg 键已生成后才可能早退）
        Enabled = Config.Bind("General", "Enabled", true,
            "总开关：false=对称移除白名单注入并停写停注入；下次启动不加载。");
        Enabled.SettingChanged += (object s0, System.EventArgs e0) => { Rerun = true; };
        // [Rail] 区（T8，General 区后）：CERail 侧栏总开关。false=RailUi.Tick 首行 return——
        // bootstrap 注入/数据推送/drain（含命令 Pump）全停；已注入界面的存量 rail 随界面重开
        // 由原生重建清除（与 Filter 同策略，不主动清）。
        RailEnable = Config.Bind("Rail", "Enable", true,
            "CERail 储物侧栏总开关：false=不注入侧栏脚本、不推数据、不取命令（12 页官方面板恢复原样）。");
        RailEnable.SettingChanged += (object s, System.EventArgs e) => { Rerun = true; };
        AllowDebugUiShow = Config.Bind("Rail", "AllowDebugUiShow", false,
            "调试：允许 uiShow 命令远程显示官方界面（实机验收驱动用；发布/日常保持 false）。");
        RemoteDebugPort = Config.Bind("Rail", "RemoteDebugPort", 0,
            "断流/白屏现场取证：>0 时向 WebView2 附加 --remote-debugging-port=该值（浏览器打开 http://127.0.0.1:端口/json 可连 CDP 调试协议，仅本机可连；平时保持 0；需重启游戏生效）。");
        ClassicWebViewScrollbars = Config.Bind("Rail", "ClassicWebViewScrollbars", true,
            "v1.8.8 关闭 WebView2 fluent（悬浮式）滚动条：fluent 闲置自动淡出且无视页面 ::-webkit-scrollbar 自定义样式=「轨道常驻但滚动条切柜闪一下消失」的根因；经进程环境变量 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS 注入 --disable-features（只在游戏进程内生效、落盘零写，需重启游戏生效）。关闭后 railui.css 的 8px 自定义经典滚动条接管：恒久绘制、永不自动隐藏。");
        ApplyWebViewScrollbarEnv();
        ApplyRemoteDebugEnv();
        // ==== 高度修改批 15 键（spec §4.1 逐字；全部默认 0=恢复原生；宽度恒 12 不可改）====
        BackpackHeight = Config.Bind("Rail", "BackpackHeight", 0,
            "背包行数（普通背包/野外登山包/仓管背包，含天赋加行链共 9 包统一——换包逻辑要求链上同高；原生 18；0=恢复原生）。宽度恒 12。");
        HeightByBag = new Dictionary<int, ConfigEntry<int>>
        {
            { 110002, Config.Bind("Rail", "Height_110002", 0, "小型置物架行数（原生 8；0=恢复原生）。宽恒 12。") },
            { 110001, Config.Bind("Rail", "Height_110001", 0, "中型置物架行数（65 家具：中型置物架/工具柜(70006)/烧烤架等共用；原生 10；0=恢复原生）。宽恒 12。") },
            { 110000, Config.Bind("Rail", "Height_110000", 0, "大型置物架行数（原生 10；0=恢复原生）。宽恒 12。") },
            { 110008, Config.Bind("Rail", "Height_110008", 0, "超大型置物架行数（原生 12；0=恢复原生）。宽恒 12。") },
            { 10007,  Config.Bind("Rail", "Height_10007",  0, "工具柜行数（家具 406；原生 7；0=恢复原生）。宽恒 12。") },
            { 1004,   Config.Bind("Rail", "Height_1004",   0, "双门冰箱行数（12 家具共用：双门冰箱/冰柜/食堂冰箱/冷饮柜/医用冷藏柜等；原生 7；0=恢复原生）。宽恒 12。") },
            { 115000, Config.Bind("Rail", "Height_115000", 0, "双开门冰箱行数（原生 7；0=恢复原生）。宽恒 12。") },
            { 115001, Config.Bind("Rail", "Height_115001", 0, "冰柜行数（5 家具：冰柜/冰箱/豪华版双门冰箱等；原生 10；0=恢复原生）。宽恒 12。") },
            { 115005, Config.Bind("Rail", "Height_115005", 0, "大容量冰柜行数（原生 10；0=恢复原生）。宽恒 12。") },
            { 1021,   Config.Bind("Rail", "Height_1021",   0, "自行车车筐行数（原生 4；0=恢复原生）。宽恒 12。") },
            { 1022,   Config.Bind("Rail", "Height_1022",   0, "小汽车后备箱行数（原生 8；0=恢复原生）。宽恒 12。") },
            { 1023,   Config.Bind("Rail", "Height_1023",   0, "SUV后备箱行数（与门口塑料袋共用包——运行时指派，表无引用；原生 10；0=恢复原生）。宽恒 12。") },
        };
        DrawerHeight = Config.Bind("Rail", "DrawerHeight", 0,
            "工作台抽屉基准行数：三档=H/H+1/H+2（工作台升级加行语义保留；原生链 5/6/7；0=恢复原生链）。宽恒 12。");
        MaxHeight = Config.Bind("Rail", "MaxHeight", 50,
            "高度防呆上限：任何高度键目标超出即夹到该值（逐包/逐档夹；0=不封顶自担——超高依赖界面纵向滚动）。");
        // 立即生效硬验收（spec §2）：改键即置脏，RailUi.Tick 主线程帧内重算（SettingChanged 线程不定，禁直调 Il2Cpp）
        BackpackHeight.SettingChanged += (object s, System.EventArgs e) => RailUi.SizeDirty = true;
        DrawerHeight.SettingChanged += (object s, System.EventArgs e) => RailUi.SizeDirty = true;
        MaxHeight.SettingChanged += (object s, System.EventArgs e) => RailUi.SizeDirty = true;
        foreach (var hb in HeightByBag.Values)
            hb.SettingChanged += (object s, System.EventArgs e) => RailUi.SizeDirty = true;
        SizeIncludeBagIds = Config.Bind("Rail", "SizeIncludeBagIds", "1009",
            "柜宽统一的功能包白名单（逗号分隔 BagId）。这些包在 [Access] ExcludeBagIds/代码 NonStorageBagIds 双名单里（页签/筛选语义：不注入不筛选=页签常显，该语义不动），但其格子是真储物格、宽度应随恒定 12 列统一——默认 1009 无人机中控台（2026-11-05 作者复测「宽度不是 12」：Access 排除连带把宽度挡了，同冰箱漏网同病根）。无人机货舱 1008 等也要统一请自行追加；空=不追加。");
        EnableCraftSource = Config.Bind("Access", "EnableCraftSource", true,
            "白名单注入：工作台/无人机交易/无人机站/粉碎机/温室 的柜子页签与自动取料。");
        EnableCooking = Config.Bind("Access", "EnableCooking", true, "烹饪界面注入柜子页签。");
        EnableRatCage = Config.Bind("Access", "EnableRatCage", true, "老鼠笼界面注入柜子页签。");
        EnableBrew = Config.Bind("Access", "EnableBrew", true, "酿酒桶界面注入柜子页签。");
        EnableDye = Config.Bind("Access", "EnableDye", true, "颜料桶界面注入柜子页签。");
        IncludeFurnitureIds = Config.Bind("Access", "IncludeFurnitureIds", "",
            "追加的家具 ConfigId（逗号分隔，强制加入）。");
        ExcludeFurnitureIds = Config.Bind("Access", "ExcludeFurnitureIds", "313,80033,80164,1026,42033,66196,330,384,389,9126",
            "排除的家具 ConfigId（优先级最高）。默认排除：313/80033/80164自制工具台（非储物，同名三个变体）；载具 1026自行车/42033旧SUV；66196染料桶、330/384/389/9126材料堆（四个变体）——功能容器或角色专属，与纸箱/自制工具台共用包只能按家具排除（2026-10-17 作者实测日志实锤）。1024购物塑料袋/1025购物车/1027小汽车/1028SUV 2026-11-01 作者令撤出排除（收录为柜子，进直达页签/筛选）。");
        ExcludeBagIds = Config.Bind("Access", "ExcludeBagIds",
            "1008,1009,1014,1050,1060,10001,10004,3001,115004,5001,5002,5003,5004,5005,5006,5007,5008,5009,5011,5014,5015,5017,5020",
            "排除的 BagId（整包系排除）。默认排除非储物容器：厨房电器(5001燃料炉/5002电烤箱/5003微波炉/5004燃气灶/5005榨汁机/5006咖啡机/5011电火锅)、机器功能槽(5007-5009/5014老鼠笼/5015粉碎机/5017口粮压制机/5020暖房工程台/115004酿酒桶)、围栏(3001)、吊篮(1050)、无人机货舱(1008)/无人机中控台(1009，2026-10-17 作者实测补)、门(1060)、窗(1014)、床(10001)、垃圾桶(10004)。其余带储物包家具默认全部生效。");
        Verbose = Config.Bind("Debug", "Verbose", false, "输出每条明细。");
        ListOnReady = Config.Bind("Debug", "ListOnReady", true,
            "配置表就绪时在日志列出发现的全部柜子家具名单（首次核对用，可关）。");
        DumpFurniture = Config.Bind("Debug", "DumpFurniture", false,
            "置 true 后在日志列出家中全部带包家具明细：owner/配置/名称/锁定态/是否入选。排查'新柜子不生效'用，平时关。注意：cfg 改动需重启游戏生效（BepInEx 不监听 cfg 文件外部修改——2026-11-05 八追实测游戏内改 cfg 不生效，旧注「5 秒内生效」有误）。");
        DumpDyePigments = Config.Bind("Debug", "DumpDyePigments", false,
            "染料桶排序 spike：置 true 后进档在日志 dump 全部 Dye/Pigment 相关类型、GameKey 与 Config_Item 色素全表（植物×颜色点数）。一次性，取完关。cfg 改动需重启游戏生效。");
        FilterEnable = Config.Bind("Filter", "Enable", true,
            "标签筛选总开关：关闭后不注入筛选（场景视图也一并失效，容器页签全部显示）。");
        FilterEnable.SettingChanged += (object s, System.EventArgs e) => { Rerun = true; };

        // 场景视图默认值按 spec 场景表：烹饪/老鼠笼/酿酒/颜料桶/口粮压制机=Food，
        // 工作台/粉碎机/温室=Material，无人机交易/调度机队=Browser（键名=实测页面 id）
        const string viewDesc = "界面视图：Food=食物标签柜+全部冰箱；Material=材料/工具标签柜（不含冰箱与未打标签柜，通信设备等无标签容器不进，要看请切 Browser 选「其他」）；Browser=下拉自由筛选。";
        ViewCooking         = Config.Bind("Scenario", "View_Cooking",         ScenarioView.Food,    "烹饪" + viewDesc);
        ViewRatCage         = Config.Bind("Scenario", "View_RatCage",         ScenarioView.Food,    "老鼠笼" + viewDesc);
        ViewBrewPanel       = Config.Bind("Scenario", "View_BrewPanel",       ScenarioView.Food,    "酿酒桶" + viewDesc);
        ViewDyePanel        = Config.Bind("Scenario", "View_DyePanel",        ScenarioView.Food,    "颜料桶" + viewDesc);
        ViewCompressor      = Config.Bind("Scenario", "View_Compressor",      ScenarioView.Food,    "口粮压制机" + viewDesc);
        ViewToolTable       = Config.Bind("Scenario", "View_ToolTable",       ScenarioView.Material, "工作台" + viewDesc);
        ViewShredder        = Config.Bind("Scenario", "View_Shredder",        ScenarioView.Material, "粉碎机" + viewDesc);
        ViewGreenhouseBuild = Config.Bind("Scenario", "View_GreenhouseBuild", ScenarioView.Material, "温室工程台" + viewDesc);
        ViewTrade           = Config.Bind("Scenario", "View_Trade",           ScenarioView.Browser, "无人机交易" + viewDesc);
        ViewDroneHub        = Config.Bind("Scenario", "View_DroneHub",        ScenarioView.Browser, "调度机队（无人机站）" + viewDesc);
        // Fuel 视图（燃料标签 1013 柜）当前仅本页消费；Browser/其他视图照常可指派（spec §5.4）
        ViewFuelGenerator   = Config.Bind("Scenario", "View_FuelGenerator",   ScenarioView.Fuel,
            "燃油发电机（Fuel=只显示带「燃料」标签的柜子；spec 2026-11-06-fuelgen-cabinet-tabs）" + viewDesc);
        EnableFuelGen = Config.Bind("Access", "EnableFuelGen", true,
            "燃油发电机界面柜子页签：背包面板页签化（背包+燃料标签柜），点柜中燃料整组直送发电机；false=界面还原官方。");
        // 暖炉（bagtabs 族第二页，暖炉移植批 2026-11-07）：Fuel 视图默认与发电机同视角（烧火同语义）
        ViewHeater          = Config.Bind("Scenario", "View_Heater",          ScenarioView.Fuel, "暖炉" + viewDesc);
        EnableHeater = Config.Bind("Access", "EnableHeater", true,
            "暖炉界面柜子页签：背包面板页签化（背包+燃料标签柜），点柜中燃料整组直送暖炉；false=界面还原官方（与燃油发电机同构、独立开关）。");

        System.EventHandler reload = (object s, System.EventArgs e) => { Rerun = true; };
        IncludeFurnitureIds.SettingChanged += reload;
        ExcludeFurnitureIds.SettingChanged += reload;
        ExcludeBagIds.SettingChanged += reload;
        EnableCraftSource.SettingChanged += reload;
        EnableCooking.SettingChanged += reload;
        EnableRatCage.SettingChanged += reload;
        EnableBrew.SettingChanged += reload;
        EnableDye.SettingChanged += reload;
        ViewCooking.SettingChanged += reload;
        ViewRatCage.SettingChanged += reload;
        ViewBrewPanel.SettingChanged += reload;
        ViewDyePanel.SettingChanged += reload;
        ViewCompressor.SettingChanged += reload;
        ViewToolTable.SettingChanged += reload;
        ViewShredder.SettingChanged += reload;
        ViewGreenhouseBuild.SettingChanged += reload;
        ViewTrade.SettingChanged += reload;
        ViewDroneHub.SettingChanged += reload;
        ViewFuelGenerator.SettingChanged += reload;
        EnableFuelGen.SettingChanged += reload;
        ViewHeater.SettingChanged += reload;
        EnableHeater.SettingChanged += reload;
        DumpFurniture.SettingChanged += (object s, System.EventArgs e) => { CabinetCatalog.DumpRequested = true; };
        DumpDyePigments.SettingChanged += (object s, System.EventArgs e) => { RailData.DyePigDumpRequested = true; };

        // General.Enabled=false：不启 Ticker/不装合并补丁，零日志零改写
        //（白名单本会话从未注入，无需移除；运行中关闭由 AccessTicker 首行门处理）
        if (!Enabled.Value) return;

        if (!ClassInjector.IsTypeRegisteredInIl2Cpp<AccessTicker>())
            ClassInjector.RegisterTypeInIl2Cpp<AccessTicker>();
        if (DumpFurniture.Value) CabinetCatalog.DumpRequested = true; // cfg 启动即 true 也生效（进档后 dump 一次）
        if (DumpDyePigments.Value) RailData.DyePigDumpRequested = true; // 同上（重启路：SettingChanged 不覆盖文件加载）
        var go = new GameObject("CabinetEverywhere.Ticker");
        Object.DontDestroyOnLoad(go);
        go.AddComponent<AccessTicker>();
        Log.LogInfo("[CabinetEverywhere] loaded：白名单注入=" + EnableCraftSource.Value +
                    "，页签注入=烹饪/老鼠笼/酿酒/颜料桶(" + EnableCooking.Value + "/" + EnableRatCage.Value + "/" + EnableBrew.Value + "/" + EnableDye.Value + ")");
        SurvivalLog.ModShared.WelcomeTip.Install(Log);

        // 性能探针（Debug.Verbose 门控，发版归一 false）：纯测量零行为改动，卡顿定数用
        if (Verbose.Value) ToolTableProbe.Install();
        // 袋刷新帧尾合并（一次做一次算）：默认行为
        RefreshCoalescer.Install();
    }

    /// <summary>
    /// v1.8.8 fluent 滚动条关闭（作者实测：轨道常驻但 thumb 随切柜「闪一下然后消失」=fluent
    /// 渲染无视页面 ::-webkit-scrollbar 样式；overflow-y:scroll 与自定义样式两轮 CSS 都治不了）。
    /// WebView2 loader 原生支持进程级 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS（
    /// CreateCoreWebView2Environment 时与 options 参数合并），注入 --disable-features 关 fluent
    /// 系 feature——此后 railui.css 的 8px 自定义经典滚动条接管：恒久绘制、永不自动隐藏、槽宽恒定。
    /// 只在游戏进程内生效、零落盘；已有 --disable-features 时把 feature 名追加进列表（不覆盖）。
    /// 链路时序：BepInEx chainloader（本方法）先于游戏首块 WebView 环境创建，变量来得及。
    /// </summary>
    private static void ApplyWebViewScrollbarEnv()
    {
        if (!Enabled.Value || ClassicWebViewScrollbars == null || !ClassicWebViewScrollbars.Value) return;
        const string varName = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";
        const string feats = "msFluentScrollbars,msFluentScrollbar,msOverlayScrollbar,OverlayScrollbar,FluentScrollbar";
        try
        {
            var cur = Environment.GetEnvironmentVariable(varName);
            if (!string.IsNullOrEmpty(cur) && cur.IndexOf("msFluentScrollbars", StringComparison.Ordinal) >= 0)
            {
                Log.LogInfo("[CERail] WEBVIEW2 滚动条：环境变量已含 fluent 禁用，跳过");
                return;
            }
            string next;
            if (string.IsNullOrEmpty(cur))
                next = "--disable-features=" + feats;
            else if (cur.IndexOf("--disable-features=", StringComparison.Ordinal) >= 0)
                next = cur + "," + feats;
            else
                next = cur + " --disable-features=" + feats;
            Environment.SetEnvironmentVariable(varName, next);
            Log.LogInfo("[CERail] WEBVIEW2 滚动条：注入 --disable-features=" + feats + "（原值=" + (cur ?? "<空>") + "）");
        }
        catch (Exception e)
        {
            Log.LogWarning("[CERail] WEBVIEW2 滚动条环境变量注入失败（fluent 可能仍生效）: " + e.Message);
        }
    }

    /// <summary>
    /// v1.8.10 八追：WebView2 远程调试端口（cfg [Rail] RemoteDebugPort，默认 0=关）。>0 时向
    /// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS 附加 --remote-debugging-port——断流/白屏/JS 假尸
    /// 现场可直接连 CDP（浏览器开 http://127.0.0.1:端口/json）读 __CERAIL__ 活态（store.rev/
    /// _ppCount/srFoodSort.hidden/FRAMES），四~七追轮番盲修的教训=没有 JS 侧现场只能猜。
    /// 仅本机回环可连；平时保持 0；需重启游戏生效（环境变量在 WebView 环境创建时读取）。
    /// 独立于滚动条开关（ClassicWebViewScrollbars=false 也可单独开调试口）。
    /// </summary>
    private static void ApplyRemoteDebugEnv()
    {
        try
        {
            int port = RemoteDebugPort?.Value ?? 0;
            if (port <= 0 || port > 65535) return;
            const string varName = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";
            var cur = Environment.GetEnvironmentVariable(varName);
            if (cur != null && cur.IndexOf("--remote-debugging-port=", StringComparison.Ordinal) >= 0) return;
            cur = string.IsNullOrEmpty(cur) ? "--remote-debugging-port=" + port : cur + " --remote-debugging-port=" + port;
            Environment.SetEnvironmentVariable(varName, cur);
            Log.LogInfo("[CERail] WebView2 远程调试端口已附加 --remote-debugging-port=" + port + "（取证：http://127.0.0.1:" + port + "/json）");
        }
        catch (Exception e)
        {
            Log.LogWarning("[CERail] 远程调试端口注入失败: " + e.Message);
        }
    }
}

internal sealed class AccessTicker : MonoBehaviour
{
    public AccessTicker(IntPtr ptr) : base(ptr) { }
    public AccessTicker() { }

    private float _slowCheck;          // 白名单 + 柜子名单重扫 + 统一容器扫描（5s 幂等）
    private float _fastCheck;          // 页签注入轮询（0.5s，仅目标界面打开时）
    private bool _listedOnce;

    public void Update()
    {
        try
        {
            // 帧尾合并补派：必须每帧最先跑（在 0.5s/5s 门闩之前）
            RefreshCoalescer.Flush();
            // v1.8.9 Bug4 帧级快通道：官方排序/搬运改叠数 ≤1 帧检出并重推（替代 0.5s 泵量化等待，
            // 「一键整理响应 2s+」排查修复；空闲≈零开销，重活仍在 0.5s Tick）
            RailUi.FastPoll();
            // v1.8.9 十三批：开界面瞬帧注入柜子页签（0.5s 轮询量化是首开闪烁根源——首推只带
            // 原生背包+冰箱；每帧只查翻转，开界面那帧抢在首推序列化前注入全量；稳态零动作）
            TabInjector.FastPoll();
            // 二十批：开界面短窗每帧抢跑——视图修剪+抽屉页签随官方数组建成那帧落地（治开页闪全量）
            TabGate.FastPoll();
            DrawerTabs.FastPoll();
            Tick(Time.deltaTime);
        }
        catch { /* 单帧异常不终止轮询 */ }
    }

    private void Tick(float dt)
    {
        // General.Enabled 总开关：false=白名单注入对称移除（_added 逐条 Remove，幂等：移除后
        // _added 空则静默空操作）并全线停写停注入；已打开界面重开后收敛（原生重建页签）。
        // Load 阶段 false 时 Ticker 不会创建，本分支覆盖运行中关闭（ModCenter 写 cfg 热生效）。
        if (CabinetEverywherePlugin.Enabled != null && !CabinetEverywherePlugin.Enabled.Value)
        {
            CraftSourceInjector.RemoveAll();
            return;
        }

        _slowCheck += dt;
        var slowDue = CabinetEverywherePlugin.Rerun || _slowCheck >= 5f;

        if (slowDue)
        {
            _slowCheck = 0f;
            // 1) 柜子家具名单（配置层，幂等重扫）
            var cfgIds = CabinetCatalog.RebuildConfigIds();
            if (cfgIds == null) return; // 配置表未就绪
            CabinetEverywherePlugin.Rerun = false;

            if (!_listedOnce && CabinetEverywherePlugin.ListOnReady.Value)
            {
                _listedOnce = true;
                CabinetEverywherePlugin.Log.LogInfo("[CabinetEverywhere] 柜子名单（" + cfgIds.Count + " 条）：\n  " +
                                                    string.Join("\n  ", CabinetCatalog.DescribeAll()));
            }

            // 2) 白名单注入（工作台/无人机交易/无人机站/粉碎机/温室）；关=对称移除本会话
            //    注入（CraftSourceInjector.RemoveAll，幂等——含"运行中由开转关"的收敛路径）
            if (CabinetEverywherePlugin.EnableCraftSource.Value)
                CraftSourceInjector.Ensure(cfgIds);
            else
                CraftSourceInjector.RemoveAll();

            // 3) 统一容器扫描（5s 只扫一遍，原直达/筛选两个 5s 扫描合一）：单遍产出
            //    AllContainers（全容器+标签，筛选用）+ HomeInstances（柜子子集，直达注入用）
            CabinetCatalog.RefreshHomeInstances();
            CabinetCatalog.FlushDump();
            RailData.FlushDyePigDump(); // 染料桶 spike：同门同节律（进档后一次性；flag 消费自复位）

            // 4) 筛选：JS 注入/喂标签数据（容器枚举已并入上面的统一扫描）
            if (CabinetEverywherePlugin.FilterEnable.Value)
                TagFilter.Tick();

            // 5) CERail 容器行/背包容量元数据（消费上面的 AllContainers；物品行走 0.5s 快通道）
            //    终审 Minor-4：cfg [Rail] Enable=false 时跳过（回退态不再做死工作——
            //    OpRename/OpSetTags 命令路径内的 RefreshMeta 直调不受此门影响）
            if (RailUi.Enabled) RailData.RefreshMeta();
        }

        // 页签注入（烹饪/老鼠笼/酿酒/颜料桶）：读 5s 刷新的柜子子集 HomeInstances，0.5s 轮询补挂
        _fastCheck += dt;
        if (_fastCheck < 0.5f) return;
        _fastCheck = 0f;
        TabInjector.PollAll();
        // 十八批：抽屉页签（交易/粉碎机）——全局抽屉包补进两页页签（DrawerTabs 内自带
        // General/EnableCraftSource 门；owner=WorkbenchDrawerConfig 常量直读）
        DrawerTabs.PollAll();

        // CERail 数据推送（T8：cfg 门 [Rail] Enable 在 RailUi.Tick 首行——false 时不注入不推数
        // 不 drain；T6 的 bootstrap 注入循环与探活 ForceRepublish 也已并入 Tick）：
        // rev 门控在 RailUi.Tick 内（无场景/rev 未变不推），常态空转零开销
        RailUi.Tick();

        // 工作台页签修剪（扫描=所见）：仅当白名单注入+筛选都开着才有意义
        if (CabinetEverywherePlugin.EnableCraftSource.Value &&
            CabinetEverywherePlugin.FilterEnable.Value)
            ToolTablePruner.Poll();

        // v1.8.7 T2 场景视图状态层对账（DroneHub/cart×3/Trade——bag×4 在 TabInjector 内联、
        // 工作台=上方 Pruner；总门 [Filter] Enable 在 TabGate.PollAll 首行，false=全显零动作）
        TabGate.PollAll();
    }
}
