using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using GameCore.HotUpdate.ReduxUI;

namespace SurvivalLog.CabinetEverywhere;

/// <summary>
/// 烹饪界面改造通道（Cooking Recipe FX 批1/批2，spec 2026-11-15 §5）：
/// 探活状态机（TagFilter 同款）向 Root WebView 注入 cookingfx.page.js 并推三类包——
///   setRecipes 静态排序键表（_Config_CookingRecipe_Dict 4 档产物 Normal 位 VD，构建一次）
///   setIcons   官方图标字形包（State_Web_CoreUI1.AttrList 的 AttrIcon，HUD 常驻；缺=JS 回退 SVG）
///   setPred    这一锅区间包（批2/T5 动态侧，本文件预留挂点）
/// 门控：[CookingFx] Enable + 烹饪 UI 活跃（全关零注入零推送）；推送走带回调重载
/// （单参静默丢弃铁证）；纯变换在 CookingFxData（tools/cookfx-math-test 离线断言）。
/// </summary>
internal static class CookingFx
{
    private static readonly HashSet<string> Warned = new();

    private static readonly Il2CppSystem.Type CookingUiType =
        Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_Cooking));
    private static readonly Il2CppSystem.Type CoreUi1Type =
        Il2CppInterop.Runtime.Il2CppType.From(typeof(WebUI_CoreUI1));

    // ---- 探活状态机（TagFilter 同款语义；不做 WebView 引用判等，重建检测纯靠探针回包）----
    private static bool _alive;
    private static int _probeState;      // 0=等回包/未知 1=最近一探明确 absent（许可注入一剂）
    private static Il2CppSystem.Action<string> _probeCb, _ackCb;
    private static bool _tablePushed;     // 静态表本 WebView 生命周期已推（JS 侧随重建清空，alive 沿补推）
    private static string _lastIcons;     // 同串免重推（成功一次即缓存；重建沿复位——I2①）
    private static string _lastPred;      // 同串免重推（重建沿复位——I2①）
    private static float[] _coeffs;       // GlobalSetting 系数缓存（表运行时不变，_tableCache 同口径）

    private static string _bootstrap;
    private static string BootstrapJs => _bootstrap ??= ReadBootstrap();
    private static string ReadBootstrap()
    {
        var asm = System.Reflection.Assembly.GetExecutingAssembly();
        using var s = asm.GetManifestResourceStream("SurvivalLog.CabinetEverywhere.cookingfx.page.js");
        if (s == null) { WarnOnce("res", "内嵌资源 cookingfx.page.js 缺失"); return ""; }
        using var r = new StreamReader(s, Encoding.UTF8);
        return r.ReadToEnd();
    }

    private static bool _refreshEvent; // 官方刷新沿（CookingFxRefreshHook postfix 置位）

    /// <summary>官方刷新沿（hook postfix）：置位由 FastPoll 每帧消费（批改9② 消轮询延迟）。</summary>
    internal static void OnOfficialRefresh() => _refreshEvent = true;

    /// <summary>帧级快通道（AccessTicker.Update 每帧调，RailUi.FastPoll 同位）：事件位才动作，
    /// 空闲零开销；触发即当帧推区间包+行内值（JS 侧 sortval 随 setPred 重渲染路径刷新）。</summary>
    internal static void FastPoll()
    {
        if (!_refreshEvent) return;
        _refreshEvent = false;
        try
        {
            if (CabinetEverywherePlugin.CookingFxEnable is not { Value: true }) return;
            if (!_alive) return; // 未注入/重建期：交给 0.5s Poll 重建
            var web = TagFilter.GetWebView();
            if (web == null) return;
            if (_tablePushed) PollPred(web);
        }
        catch { /* 快通道异常不置回事件位，0.5s 兜底 */ }
    }

    /// <summary>0.5s 节拍（AccessTicker 调；仅烹饪 UI 打开时注入/推送）。</summary>
    internal static void Poll()
    {
        try
        {
            if (CabinetEverywherePlugin.CookingFxEnable is not { Value: true }) return;
            if (!GameCore.HotUpdate.BaseSingleton<ReduxUISystem>.IsInstanceCreated) return;
            var rus = GameCore.HotUpdate.BaseSingleton<ReduxUISystem>.Instance;
            if (rus == null || !SafeActive(rus, CookingUiType)) return;

            var web = TagFilter.GetWebView();
            if (web == null) return;

            if (_probeCb == null)
                _probeCb = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<Il2CppSystem.Action<string>>(
                    new Action<string>(r =>
                    {
                        if (r == "1")
                        {
                            if (!_alive) { _alive = true; _probeState = 0; _tablePushed = false; } // 注入成功沿：补推一包
                        }
                        else
                        {
                            // WebView 重建/重载：复位待重注。幂等闸一并清（终审 I2①：JS 侧数据随重建归零，
                            // 同串免推会让区间/字形包整个新生命周期漏推）
                            _alive = false; _tablePushed = false; _probeState = 1;
                            _lastIcons = null; _lastPred = null;
                        }
                    }));
            if (_ackCb == null)
                _ackCb = Il2CppInterop.Runtime.DelegateSupport.ConvertDelegate<Il2CppSystem.Action<string>>(
                    new Action<string>(_ => { }));
            web.ExecuteJavaScript("(function(){try{return window.__CEFX__?1:0}catch(e){return 0}})()", _probeCb);
            if (_alive)
            {
                if (!_tablePushed)
                {
                    var table = TryBuildTable();
                    if (table != null && Push(web, "setRecipes", table))
                    {
                        _tablePushed = true; // 构建失败/推送异常均不置位，下周期重试（终审 I2③）
                        CabinetEverywherePlugin.Log.LogInfo("[CookingFx] 静态表已推（" + table.Length / 1024 + "KB）");
                    }
                }
                // 图标包：成功一次即缓存推送（内容恒定）；未就绪每周期重试（终审 I2②：HUD 晚就绪不永久回退）
                if (_lastIcons == null)
                {
                    var icons = TryBuildIconPack();
                    if (icons != null && icons != "{}" && Push(web, "setIcons", icons))
                    {
                        _lastIcons = icons;
                        CabinetEverywherePlugin.Log.LogInfo("[CookingFx] 官方字形包已推 " + icons);
                    }
                }
                PollPred(web); // 批2 动态侧
                return;
            }
            if (_probeState != 1) return;
            _probeState = 0;
            web.ExecuteJavaScript(BootstrapJs, _ackCb);
        }
        catch (Exception e)
        {
            WarnOnce("poll", "通道轮询异常: " + e.Message);
        }
    }

    // ---- 批2：这一锅区间包（WorkbenchItems 计数 + PredictionListJson → BuildPredEntryJson）----
    private static void PollPred(Vuplex.WebView.IWebView web)
    {
        var pred = TryBuildPredPack();
        if (pred == null || pred == _lastPred) return;
        if (Push(web, "setPred", pred)) _lastPred = pred; // 推送成功才置幂等闸（终审 I2③）
    }

    private static string TryBuildPredPack()
    {
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<ReduxUISystem>.IsInstanceCreated) return null;
            var rus = GameCore.HotUpdate.BaseSingleton<ReduxUISystem>.Instance;
            var st = rus?.GetStateByUI(CookingUiType)?.TryCast<State_Web_Cooking>();
            if (st == null) return null;
            var wb = st.WorkbenchItems;
            var predJson = st.PredictionListJson?.Value;

            // 空锅/无预测也推清空包（终审 I2④：JS 残留旧区间）——state 在即有效；state 缺=未就绪不动
            var parsed = CookingFxData.ParsePredictionEntries(predJson); // null=空串/异形 → 按空处理
            if (wb == null) return null;

            var cm = SurvivalLog.ModShared.BagTable.Cm();
            if (cm == null) return null;
            var itemDict = cm._Config_Item_Dict;
            var recipeDict = cm._Config_CookingRecipe_Dict;
            if (itemDict == null || recipeDict == null) return null;

            // 品质/档位系数（运行时读 GlobalSetting.Params2；缺键 1.0 兜底——ReadCoeffs 契约。
            // 表运行时不变，与 _tableCache 同口径构建一次）
            if (_coeffs == null)
            {
                var c = new[] { 1f, 1f, 1f, 1f, 1f };
                try
                {
                    var gs = cm._Config_GlobalSetting_Dict;
                    if (gs != null)
                    {
                        var map = new Dictionary<string, float>();
                        foreach (var pair in gs)
                            if (pair.Value != null) map[pair.Key] = pair.Value.Params2;
                        c = CookingFxData.ReadCoeffs(k => map.TryGetValue(k, out var v) ? v : null);
                    }
                }
                catch { /* 缺表=全 1.0 兜底 */ }
                _coeffs = c;
            }
            var coeffs = _coeffs;

            // 锅内食材计数（过滤照官方 §2.4：Category==1 && CanCook && !NeedCut）
            var counts = new Dictionary<int, int>();
            if (wb != null)
                for (int i = 0; i < wb.Count; i++)
                {
                    var it = wb[i];
                    if (it == null) continue;
                    if (it.Category?.Value != 1 || it.CanCook?.Value != true || it.NeedCut?.Value == true) continue;
                    int cid = it.ConfigId?.Value ?? 0;
                    int n = it.Count?.Value ?? 1;
                    if (cid == 0 || n <= 0) continue;
                    counts[cid] = counts.TryGetValue(cid, out var c2) ? c2 + n : n;
                }
            var ingRows = new List<float[]>();
            var ingCounts = new List<int>();
            foreach (var pair in counts)
            {
                if (itemDict.TryGetValue(pair.Key, out var cfg) && cfg != null)
                {
                    ingRows.Add(new[] { cfg.ValueDisplay1, cfg.ValueDisplay2, cfg.ValueDisplay3, cfg.ValueDisplay4, cfg.ValueDisplay5 });
                    ingCounts.Add(pair.Value);
                }
            }

            // 已知菜谱过滤（Level===2 且 rid!==0）→ 区间条目
            var known = new HashSet<int>();
            if (parsed != null)
                foreach (var k in CookingFxData.FilterKnownEntries(ToRidLevel(parsed)))
                    known.Add(k.recipeId);

            // 基础饱腹加成（批改8）+ 精确匹配品质奖励（GS Params1）+ 品质可达下限（批改9①）
            float baseBonus = 0f;
            int ingTotal = 0;
            foreach (var n in ingCounts) ingTotal += n;
            int exactBonus = 0;
            try
            {
                var gs2 = cm._Config_GlobalSetting_Dict;
                if (gs2 != null)
                    foreach (var pair in gs2)
                    {
                        if (pair.Value == null) continue;
                        if (ingTotal > 0 && pair.Key == "CookingVD_BaseSatietyPerIngredient")
                            baseBonus = ingTotal * pair.Value.Params2;
                        else if (pair.Key == "CookingQuality_ExactMatchBonus")
                            exactBonus = pair.Value.Params1;
                    }
            }
            catch { /* 缺键=0 兜底 */ }
            int qualityFloor = 0;
            try
            {
                int lv = st.CookingLevel; // plain int 字段（CookingRecordComponent dump:76893）
                var lvDict = cm._Config_CookingLv_Dict;
                if (lvDict != null && lvDict.TryGetValue(lv, out var lvCfg) && lvCfg != null)
                    qualityFloor = lvCfg.QualityFloor;
            }
            catch { /* 缺表=0 */ }

            var sb = new System.Text.StringBuilder(256);
            sb.Append("{\"entries\":[");
            bool any = false;
            if (parsed != null)
                foreach (var (rid, _, tier, name) in parsed)
                {
                    if (!known.Contains(rid)) continue;
                    if (!recipeDict.TryGetValue(rid, out var r) || r == null) continue;
                    var tierVd = TierVdOf(itemDict, r);
                    if (tierVd == null) continue;
                    // isExact 用配置判定（SpecificItems 非空）而非包内 IsExact——防官方语义漂移（spec §5.3）
                    bool isExact = r.SpecificItems != null && r.SpecificItems.Count > 0;
                    // minTier：qLo=floor+精确奖励 → 按本菜谱 QualityMap 从高往低折档（GetQualityTier 同语义）
                    int qLo = qualityFloor + (isExact ? exactBonus : 0);
                    int minTier = 0;
                    var qmap = r.QualityMap;
                    if (qmap != null)
                        for (int qi = qmap.Count - 1; qi >= 0; qi--)
                            if (qLo >= qmap[qi]) { minTier = qi; break; }
                    var entry = CookingFxData.BuildPredEntryJson(rid, name, isExact, tierVd,
                        isExact ? null : ingRows, isExact ? null : ingCounts, coeffs, baseBonus, tier, minTier);
                    if (any) sb.Append(',');
                    any = true;
                    sb.Append(entry);
                }
            sb.Append("]}");
            return sb.ToString(); // 空锅/全滤 → {"entries":[]}（清空包，同串免推）
        }
        catch (Exception e)
        {
            WarnOnce("pred", "区间包构建异常: " + e.Message);
            return null;
        }
    }

    private static IEnumerable<(int recipeId, int level)> ToRidLevel(List<(int rid, int level, int tier, string name)> src)
    {
        foreach (var x in src) yield return (x.rid, x.level);
    }

    private static float[][] TierVdOf(Il2CppSystem.Collections.Generic.Dictionary<int, GameCore.HotUpdate.Config_Item> dict,
        GameCore.HotUpdate.Config_CookingRecipe r)
    {
        var ids = new[] { r.PerfectItemID, r.GoodItemID, r.NormalItemID, r.FailItemID };
        var rows = new float[4][];
        for (int i = 0; i < 4; i++)
        {
            if (!dict.TryGetValue(ids[i], out var cfg) || cfg == null) return null;
            rows[i] = new[] { cfg.ValueDisplay1, cfg.ValueDisplay2, cfg.ValueDisplay3, cfg.ValueDisplay4, cfg.ValueDisplay5 };
        }
        return rows;
    }

    private static int IntOf(Dictionary<string, object> m, string k1, string k2)
    {
        object v = null;
        if (m.TryGetValue(k1, out v) || m.TryGetValue(k2, out v)) return Convert.ToInt32(v);
        return 0;
    }

    private static string StrOf(Dictionary<string, object> m, string k1, string k2)
    {
        if (m.TryGetValue(k1, out var v1)) return v1 as string;
        if (m.TryGetValue(k2, out var v2)) return v2 as string;
        return "";
    }

    // ---- interop 壳：静态排序键表（纯变换在 CookingFxData.BuildRecipeTableJson）----
    private static string _tableCache;
    private static string TryBuildTable()
    {
        if (_tableCache != null) return _tableCache;
        var cm = SurvivalLog.ModShared.BagTable.Cm();
        if (cm == null) return null;
        var recipes = cm._Config_CookingRecipe_Dict;
        var items = cm._Config_Item_Dict;
        if (recipes == null || items == null || recipes.Count == 0) return null;
            try
            {
                var list = new List<(int, string, int, int[])>();
                foreach (var pair in recipes)
                {
                    var r = pair.Value;
                    if (r == null) continue;
                    // 名字=RecipeName_Local（与前端显示一致；空则跳过——行键唯一来源）
                    var name = string.IsNullOrEmpty(r.RecipeName_Local) ? r.RecipeName : r.RecipeName_Local;
                    if (string.IsNullOrEmpty(name)) continue;
                    list.Add((r.ID, name, r.CookExp, new[] { r.PerfectItemID, r.GoodItemID, r.NormalItemID, r.FailItemID }));
                }
            _tableCache = CookingFxData.BuildRecipeTableJson(list, productId =>
            {
                if (!items.TryGetValue(productId, out var cfg) || cfg == null) return null;
                return new[] { cfg.ValueDisplay1, cfg.ValueDisplay2, cfg.ValueDisplay3, cfg.ValueDisplay4, cfg.ValueDisplay5 };
            });
            return _tableCache;
        }
        catch (Exception e)
        {
            WarnOnce("table", "静态表构建异常: " + e.Message);
            return null;
        }
    }

    // ---- interop 壳：官方图标字形包（CoreUI1 HUD 五维 AttrIcon；纯变换在 BuildIconPackJson）----
    private static string TryBuildIconPack()
    {
        try
        {
            if (!GameCore.HotUpdate.BaseSingleton<ReduxUISystem>.IsInstanceCreated) return null;
            var rus = GameCore.HotUpdate.BaseSingleton<ReduxUISystem>.Instance;
            var st = rus?.GetStateByUI(CoreUi1Type)?.TryCast<State_Web_CoreUI1>();
            var attrs = st?.AttrList;
            if (attrs == null || attrs.Count == 0) return null;
            var pairs = new List<(int, string)>();
            // interop 集合的 GetEnumerator 不可直接 foreach，走索引器（TabInjector.CollectOwners 同款）
            for (int i = 0; i < attrs.Count; i++)
            {
                var item = attrs[i];
                if (item == null) continue;
                pairs.Add(((int)item.AttrNameKey, item.AttrIcon?.Value));
            }
            return CookingFxData.BuildIconPackJson(pairs);
        }
        catch (Exception e)
        {
            WarnOnce("icons", "图标包读取异常: " + e.Message);
            return null;
        }
    }

    private static bool Push(Vuplex.WebView.IWebView web, string entry, string json)
    {
        // JSON 作 JS 字符串字面量传入（表内仅双引号/汉字/数字；仍统一转义 ' 与 \）
        try
        {
            var literal = json.Replace("\\", "\\\\").Replace("'", "\\'");
            web.ExecuteJavaScript("window.__CEFX__&&window.__CEFX__." + entry + "('" + literal + "')", _ackCb);
            return true;
        }
        catch (Exception e)
        {
            WarnOnce("push." + entry, "推送异常（下周期重试）: " + e.Message);
            return false; // 调用方不置幂等闸（终审 I2③）
        }
    }

    private static bool SafeActive(ReduxUISystem rus, Il2CppSystem.Type t)
    {
        try { return rus.IsUIActive(t); }
        catch { return false; }
    }

    private static void WarnOnce(string key, string msg)
    {
        if (Warned.Add(key))
            CabinetEverywherePlugin.Log.LogWarning("[CookingFx] " + msg);
    }
}
