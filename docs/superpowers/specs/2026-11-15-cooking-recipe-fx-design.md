# 烹饪界面改造（Cooking Recipe FX）设计

日期：2026-11-15
状态：设计定稿（作者已拍板：产出属性用 min~max 区间形态）；原型 `design-proto/cookfx/`（harness + 纯逻辑 spike，见 §7）
证据基线：gamekb `2026-11-12_26615062`（capstone 反汇编级；GameAssembly.dll 方法体在 il2cpp 节）

## 1. 意图与为什么

烹饪界面三处决策盲区：

1. **找菜难**：菜谱书 495 条按官方序（推荐度）排列，玩家缺什么（饱腹/心态/精力/生命）只能逐条 hover 看 effectText——官方恰好把属性效果只藏在 hover tooltip 里（`Cooking.html` L2396-2411），行内完全不显示。
2. **这一锅是黑盒**：装料时预测栏只给菜名/图标，产出料理的属性数值完全不可见，无法在"再放一份肉 vs 就这样"之间做量化决策。
3. **跨柜食材形同虚设**：mod 已把柜子页签注入烹饪界面，但官方对**标签组合菜谱**（肉*2·蔬菜这类 TagCombo）的"可填装"判定和自动填装**只看当前页签+工作台**（反汇编实证，§2.4）；指定食材菜谱（SpecificItems）虽统计全部页签，但把 mod 筛选**隐藏**的柜子也算进去——与"筛选后的页签栏"所见即所得相悖。

## 2. 游戏侧实证（全部已到反汇编级）

### 2.1 界面架构

Vuplex WebView + Vue（`webui/UI/Cooking/Cooking.html`，2652 行）+ C# Redux：
`WebUI_Cooking`(VM, dump:274784) / `State_Web_Cooking`(dump:166207) / `Reducer_Web_Cooking`(dump:167959)。
前端菜谱列表 `renderRecipeListFromData`(L2341) **按后端推送顺序原样渲染，无任何排序控件**；顺序由 C# `RefreshRecipeList` 的 `List.Sort` 决定。

### 2.2 菜谱属性数据链（现成，零新取证）

- `Data_Web_Cooking_Recipe`：`RecipeId/Name/CostText/Status/CraftLocked/Icon/EffectText/GroupId/VariantCount/VariantsJson`，全部 `ReactiveProperty` + WebBind `_RecipeMsg`——**改 `.Value` 即重推**。
- `EffectText` 生成（`BuildRecipeEffectText` VA 0x182B57C30）：取 **`NormalItemID`（普通档产物）→ `Config_Item.ValueDisplay1..5`**（偏移 0x48-0x58），VD==0 跳过，正负格式串 `SR_UI_ItemTips_8..17`，`String.Join(null)` 无缝拼接。
- 五维语义：VD1 饱腹 / VD2 心态 / VD3 精力 / VD4 生命 / VD5 活力（`AttrName` 枚举 dump:57599）。

### 2.3 产出数值公式（决定 #2 只能区间，作者已拍板区间形态）

结算链：`Furniture.SettleCookingResult` → `RollCookingQuality`（VA 0x3152FD0）→ `GetQualityTier` → `CookingFormula.CalcProductVD`（VA 0x26B3760）→ `CalcProductEffectEnd` → `CalcSplit`。

- **品质分真随机**：`q = RandomInt(Config_CookingLv[lv].QualityFloor, 100) + 全新鲜/过期/调味品/精确匹配/灶具 QualityBonus/天赋加成`，clamp [0,100]，**出锅结算才 roll** → 烹饪前给不出唯一精确值。品质分经 `QualityMap`（默认 [0,30,70,90]）定 4 档产物。
- **精确配方（SpecificItems，isExact=true）**：`vd[0..4] = 产物 Config_Item.ValueDisplay1..5 配置值原样` → **4 档产物各有固定精确值**，纯配置可得 → 区间 = 4 档产物逐维 [min, max]。
- **标签配方（TagCombo，isExact=false）**：
  - vd1/vd4/vd5 = `Σ(参与食材数 × 食材 VD1/4/5) × tierCoeff × qualityCoeff`，vd1 另 `+ GetBaseSatietyBonus(食材总数)`（= 总数 × GlobalSetting.Params2）；vd3/vd4 是否加 bonus **未证实**（§6 实机核对）。
  - vd2/vd3 = 产物配置 VD2/VD3（产物随品质档 4 选 1 → 取 4 档 [min, max]）。
  - tierCoeff 按食材档位（High/Mid/Low，`CookingVD_TierCoeff_*`，档位由锅内食材确定——确定性）；qualityCoeff 随 roll 档位（Perfect/Good/Normal/Fail，`CookingVD_QualityCoeff_*`——**随机源**）→ 区间 = 系数取 [Fail, Perfect] 两端。
  - 系数全部在 `Config_GlobalSetting`（`ConfigManager._Config_GlobalSetting_Dict`，**string 键**，dump:54608；表抓取 data 为空 → 运行时读，`GameKey` 已有 `GlobalSetting_CookingQuality_*` 静态缓存先例 dump:59354）。
- 预测条目 `CookingPredictionInfo`（dump:103475）：`{RecipeId, Name, Tier, Level, IsExact, Icon, CookTime}`，`Level===2` = 已知菜谱·必出，经 `State.PredictionListJson`（ReactiveProperty string）下发。

### 2.4 可制作判定与填装的容器范围（决定 #3 改法）

`RefreshRecipeList`（VA 0x182B64F90）构建字典（反汇编逐步验证）：

| 字典 | 种子 | 并入 |
|---|---|---|
| wbIds/wbTags | 工作台物品（Category==1 && CanCook && !NeedCut） | — |
| totalIds | = wbIds 拷贝 | + 当前页签 BagItems + **`AddOtherTabsToExactCounts`：其余全部未锁定页签（只并 ids）** |
| totalTags | = wbTags 拷贝 | + 当前页签 BagItems（**其他页签不并入**） |

`GetRecipeStatus`（VA 0x182B5ACE0，被内联）：SpecificItems 菜谱查 `HasSufficientMaterials(totalIds,…)`；TagCombo 菜谱查 `HasSufficientTags(totalTags,…)` → status 2=就绪/1=填装/0=材料不足。

填装 `TryPlanRecipeFill`（VA 0x182B6BDB0）：

- SpecificItems → `SelectItemsByConfigId(itemState, GetExactFillOwners(state), needed)`，owners = 工作台+当前+**全部未锁定页签**（跨页签取料官方已有，`AnnounceTookFromOtherTabs` 提示齐备）。
- TagCombo → `SelectItemsByTagTiered(itemState, bagOwnerId, workbenchOwnerId, tagCombo, requiredTier, excludeConfigIds)`——**签名只有单 bagOwner，只看当前页签+工作台**。

⇒ 用户感知的"局限当前背包/柜子" = TagCombo 路径；SpecificItems 的问题相反（**范围过宽**：mod JS 藏掉的柜子也被统计，筛选语义失真）。

### 2.5 mod 侧现状

- 烹饪页容器页签 = 状态层注入（`State_Web_Cooking.BagTabs` 全量补挂）+ JS 藏 DOM（tagfilter）；Rail 开时官方页签栏被 rail 覆盖，数据源同份。
- 场景视图：Cooking 默认 `Food`（冰箱恒显 + 食物域柜子；Browser 视图选择存 JS localStorage `sltf_sel_v3`，**C# 读不到**）。
- Harmony hook 先例：`TradeFxRefreshHook`（postfix、零参、按名解析、缺方法回退）；RailData ctx 推送；design-proto harness 惯例。

## 3. 目标 / 非目标 / 反目标

**目标**
1. 菜谱书头部 5 个排序 chips：`默认 | 饱腹 | 心态 | 精力 | 生命`。选中后按该维降序，**同数值按菜谱 ID 升序**（确定性 tiebreak——官方相对序随推荐度/可用套数漂移，多次打开会不一致，作者批改#2 定死）；无键/负值自然垫底（组内同样 ID 升序）；再点"默认"回官方序快照；选择按页记忆（重启保持）。排序键 = 代表菜谱 Normal 档产物该维 VD（与官方 EffectText 同口径）。**chips 是菜谱书区唯一新增 DOM，其余一切按官方原生展示不动**（作者批改#2 红线：只加排序标签，不改其他样式）。
2. "这一锅"已知菜谱（Level===2）条目行内属性区间 chips：**图标 + 数值**（作者批改#1：不用文字标签）——`图标 12~31`，4 档全同值时单值 `图标 31`；该维 4 档全为 0 则不显示；**图标=官方原生五维字形**（作者批改#3）：C# 运行时读 `State_Web_CoreUI1.AttrList`（HUD 五维条就在 CoreUI1 WebView，每行 `AttrNameKey`（AttrName 枚举）+ `AttrIcon`（C# 下发的 unicode 字形，实证前端 `'❤'` 特判），`Data_CoreUI1_AttrItem` dump:172809）按枚举取 `AttrIcon.Value` 随数据包下发；读不到（HUD 未激活/字段缺失/字形空）回退内联 SVG 四枚（饭碗/笑脸/闪电/心）；悬停 title 显示维度名；只渲染用户点名的四维（VD5 活力数据管道带全、渲染白名单先不含，加一行即扩）。
3. "可填装/就绪"状态与自动填装取料范围 = **mod 可见页签集**（工作台 + 当前页签 + 通过场景视图筛选的其余页签；被隐藏柜子不计入）；TagCombo 与 SpecificItems 一致对待。
4. 三点全部只作用于 Cooking 页；筛选总开关 `[Filter] Enable` 关闭或视图=Browser 时 #3 整体回退官方行为（Browser 的 JS 自由筛选选择 C# 不可达，初版不收窄——见 §5.3 门控）。

**非目标（本次不做）**
- 黑暗料理/未知组合（foggy/dark 条目）的属性区间——公式同路但产物与档位链更绕，批 2 落地后按作者反馈再评估。
- 品质档概率展示（区间形态已拍板，概率留扩展位：品质分区间可精确算出，随时可加）。
- 结算弹窗（productsJson）实际属性展示——出锅后 `ItemData.InstanceVD` 可读，属"精确值"另案。
- 火锅模式（官方自带饱腹预览）；老鼠笼/酿酒桶/颜料桶同款改造；菜谱行内常显 effectText。
- 活力（VD5）排序/展示。

**反目标（做了即失败）**
- 其他 11 页任何观感/行为变化。
- 篡改官方 DOM 事件监听/消息流（chips=壳层 overlay；排序=DOM 节点重排，不碰官方数据通道）。
- 从 Category/SubCategory 推导 CanCook/FoodTag（物品级标志纪律，Burnable/CanBrew 同款先例）。
- 改存档/游戏文件；hook 失败时不得阻断官方链（全部 try/catch 回退）。

## 4. 方案选型

| # | 方案 | 取舍 | 判定 |
|---|---|---|---|
| 1a 排序执行 | **A. DOM 重排**（MutationObserver 盯官方容器，render 后按 key 重排 `.book-item`） | 零触碰官方数据流；官方重渲染自动重挂（rail 同款观察器纪律）；组条目整块走 | ✅ |
| | B. 截 `_RecipeMsg` 改数组顺序 | 要复刻官方渲染触发链；与官方 render 竞态 | ❌ |
| | C. hook C# `RefreshRecipeList` 的 List.Sort 比较器 | IL2CPP 无 IL 可 transpile，只能整体 prefix 替换重排逻辑——为轻需求背最重的改法 | ❌ |
| 2a 区间数据源 | **A. C# 算好推 JS**（静态表：每菜谱 4 档产物 5 维 VD；动态包：按锅内容算好的区间） | 公式/系数/反射调用官方纯函数全在 C# 侧；JS 只渲染 | ✅ |
| | B. JS 侧自算 | JS 拿不到 Config 表与玩家天赋/CookingLv，得再铺一条全量数据通道，更胖 | ❌ |
| 2b 通道 | **A. 独立轻通道**（探活一次性推静态表 + 官方刷新沿/0.5s 兜底推动态小包，TagFilter 状态机同款） | 遵守 §F 瘦身纪律：静态表 20KB 级不进 RailData 周期 ctx；动态包只有当前锅几十字节 | ✅ |
| | B. 并进 RailData ctx | 每 5s 扫描沿全量重推静态表，刚瘦身完又灌胖 | ❌ |
| 3a 状态对齐 | **A. postfix `RefreshRecipeList` 重算 Status**（自建可见集字典 → 反射调官方 `GetRecipeStatus` → 写回 `Status.Value` + 重序列化 VariantsJson） | 官方内联点全绕开；`ReactiveProperty.Value` 直改即重推；只改判定不改构建 | ✅ |
| | B. hook `AddOtherTabsToExactCounts` 补 totalTags | 拿不到 totalTags（不在参数表）；且无法做"收窄"方向 | ❌ |
| | C. 前置临时改 `state.BagTabs` 再还原 | 竞态/闪烁，十七轮防闪烁工程的反面 | ❌ |
| 3b 填装接管 | **A. prefix `TryPlanRecipeFill`**（接管分支自建 targetIds 后 return false；SpecificItems 反射调官方 `SelectItemsByConfigId` 只换 owners；TagCombo 自研跨 owner 选择器） | 两个调用方（RA_RecipeClick/EvaluateRecipeForBook）一次覆盖；官方移动/提示链复用 | ✅ |
| | B. hook `SelectItemsByTagTiered` 拼多次单 owner 调用 | excludeConfigIds/requiredTier 跨 owner 语义拼不干净 | ❌ |
| | C. 填装前自动切页签再切回 | 可见闪烁 + 语义欺骗 | ❌ |

## 5. 实现设计（三批，批间无依赖可独立发版）

### 5.1 批1：排序 chips（纯前端 + 静态数据）

**C# 新文件 `CookingFx.cs`**（数据侧，<300 行纪律）：
- 静态表构建：遍历 `ConfigManager._Config_CookingRecipe_Dict` → 每条取 4 档产物 ID → `_Config_Item_Dict` 查 `ValueDisplay1..5` → `{id, n:[4 档 Normal 键维], vd:[[5]×4 档]}`（组代表 id 一并给出，排序键用）。缓存一次，WebView 生命周期内不重算。
- 推送：复用 TagFilter 探活状态机模式（探针→ack→一次性 `window.__CEFX__.setRecipes(json)`）；烹饪页打开时才推。

**JS（railui.page.js 场景段或独立 cookfx 段）**：
- Cooking 场景装配：菜谱书头部注 5 chips（样式走 railui.css 体系，贴官方暗色调；**区外零新增 DOM**）；选中态 localStorage（`cefx_sort_v1`，键=页面 id）。
- 重排：观察器盯菜谱容器 childList → 官方 render 完成后按选中 key 对 `.book-item` 稳定降序（key 取静态表代表菜谱该维 VD；**同值 tiebreak=菜谱 ID 升序**，无键组内同样 ID 升序——确定性，作者批改#2）；**"默认"=按官方序快照还原**（快照在每次官方重建沿更新；见下三条硬约束——spike 实测抓坑）。
- 组条目（variantCount>1）整块随代表走；craftLocked 条目不参与排序值、按官方序垫尾（锁定菜不参与数值竞争）。
- **重排实现三条硬约束（原型 v1 实测定版，勿再踩）**：
  1. **自触发环**：观察器回调里的 appendChild 会再触发观察器 → 无限环卡死主线程。防线=重入门卫 + 目标序与当前序一致时零 DOM 操作早退。
  2. **官方序快照污染**：`applying` 标志若在移动后同步复位，紧随的观察器微任务执行时标志已 false，自身移动被误判为官方重建、污染 officialOrder（"默认"从此还原成污染序）。复位必须 `queueMicrotask` 排队，让标志穿过该回调。
  3. **微任务时序假象**：官方重建后同步读 DOM 拿到的是重挂前状态——验收断言必须 Promise+setTimeout 让观察器微任务先跑（harness 断言脚本已按此写）。

### 5.2 批2：这一锅属性区间

**C# `CookingFxMath.cs`**（纯逻辑，tools 测试工件同 RailSortMath 先例）：
- `ExactRange(recipe)`：4 档产物逐维 [min,max]，min==max 收敛单值。
- `TagRange(participatedCounts, tier, vd 表, coeffs)`：vd1/vd4/vd5 = Σ×tierCoeff×[qFail,qPerfect]（vd1 + baseBonus）；vd2/vd3 = 产物 4 档 [min,max]；负值/零处理同官方 AppendEffectPart 语义。
- 中间 round/clamp 对齐官方浮点 helper（实机对拍校准，§6）。

**C# 动态侧**（`CookingFx.cs` 续）：
- 触发：postfix `RefreshRecipeList`（TradeFxRefreshHook 同款事件位）+ 0.5s AccessTicker 兜底（漏沿路）。
- 计算：`ReduxUISystem.GetStateByUI(State_Web_Cooking)` → `WorkbenchItems` 按 ConfigId 计数 → 解析 `PredictionListJson` → 对 Level===2 条目：IsExact ? `ExactRange` : `TagRange`（tier 反射调官方 `ResolvePredictionTier`，系数运行时读 `_Config_GlobalSetting_Dict`，缺键回退 1.0 并告警一次）→ 推 `window.__CEFX__.setPred({recipeId:[四维区间]})`。
- 展示：JS 在预测行内注 chips（**图标+数值，无文字标签**，作者批改#1；四维白名单、全 0 维隐藏、`12~31`/单值格式、负号保留；图标=官方原生字形包 `setIcons({d0..d3})`——C# 读 CoreUI1 AttrList 下发，缺包/空字形回退内联 SVG 四枚，悬停 title=维度名）；混合/单独模式同规则。图标包来源（作者批改#3）：`ReduxUISystem.GetStateByUI(State_Web_CoreUI1).AttrList` 遍历，`AttrNameKey∈{Satiety,Morale,Stamina,Health}` 映射 d0..d3（Vitality 映射 d4 备用）；HUD 常驻，理论上始终可读；异常/空→回退且 WarnOnce。

### 5.3 批3：可见集对齐（状态重算 + 填装接管，同批防"显示可填装点不动"断裂）

**可见集 C# 副本 `CookingScope.cs`**：
- `VisibleOwners(state)`：[WorkbenchOwnerId, BagOwnerId] + BagTabs 中非 Locked 且 owner 通过场景视图判定的页签。视图判定复刻 JS `viewAllows`：`[Filter] Enable` 关或 View=Browser → 返回 null（=不接管，官方行为）；Food → 冰箱恒显 + 食物域柜（`CabinetCatalog.AllContainers` 的 Kind/TagIds，Dim 1-4 命中）。当前页签恒可见。
- 语义：null=官方全量；否则=收窄集。TagCombo 扩集与 SpecificItems 收窄都基于它。

**`CookingStatusHook.cs`**（postfix `RefreshRecipeList`）：
- 官方构建完 → 自建可见集 wbIds/wbTags/totalIds/totalTags（过滤条件照抄 §2.4 表）→ 遍历 `state.RecipeList`：单条反射 `GetRecipeStatus` 写 `Status.Value`；组条目解析 `VariantsJson` 逐 variant 重算重序列化。异常吞掉=官方结果留存。

**`CookingFillHook.cs`**（prefix `TryPlanRecipeFill`）：
- 门控：`CookingScope.VisibleOwners` 为 null → 放行官方（return true 不拦）。
- SpecificItems：needed = `CountMaterials`（反射）→ `SelectItemsByConfigId(itemState, visibleOwners, needed)`（反射，官方原函数只换 owners）→ 覆盖齐全则写 out targetIds、return false；不齐 → 放行官方（保留官方"材料不足"分支语义）。
- TagCombo：自研 `SelectItemsByTagTieredMulti`（CookingFxMath 纯逻辑 + CookingFx 实机适配层）：按官方单 owner 选择语义（tier 匹配优先/排除集）跨 visibleOwners 顺序取料至满足 tagCombo 需求；成功 → out + return false。
- 移动执行不接管：`RA_RecipeClick` 拿 targetIds 后的移动链（`MoveFillItemToBench` per-item source 解析）官方已支持跨页签（SpecificItems 路径实证），批3 T0 反汇编复核后放行；若复核发现 source 固定取当前页签，则 prefix 内自走移动（反射 `MoveFillItemToBench` + `AnnounceTookFromOtherTabs`），设计不变、实现加一段。

### 5.4 配置与开关

- `[CookingFx] Enable`（总开关，默认 true）：false = 三点全部不装配（JS 不注入 chips、hook 不装、静态表不推）。
- 复用 `[Filter] Enable` / `View_Cooking` 作为 #3 的门控输入，不新增重复配置。

## 6. 风险与实机核对清单（T0，实施第一批前跑）

| # | 核对点 | 方法 | 失败回退 |
|---|---|---|---|
| T0-1 | Il2CppInterop Harmony prefix 带 `out List<long>` 参数 + return false 跳过原方法是否成立 | 实机装 `CookingFillHook` 试探桩（log 进/出） | prefix 只做 SpecificItems 反射路径；TagCombo 降级只做状态对齐（3a），填装维持官方 |
| T0-2 | `RA_RecipeClick` 填装分支后续链：targetIds→逐 item source 解析→`MoveFillItemToBench` 序列 | 反汇编 0x182B60720 填装分支（批3 前补一步，~30 分钟） | prefix 自走移动（§5.3 已备案） |
| T0-3 | `ReactiveProperty<int>.Value` 直改是否触发 `_RecipeMsg` 增量重推（还是必须 MarkAllMsgDirty+OnMsgChange） | 实机改一个 Status 观察前端 | 收尾补 MarkAllMsgDirty 同款（TagFilter 注入先例） |
| T0-4 | `_Config_GlobalSetting_Dict` 四系数键名/值实存；`ResolvePredictionTier` 反射调用可用 | 实机 log 一次系数快照 | 缺键回退 1.0 + 告警一次；区间退化为 Σ 食材值区间 |
| T0-5 | vd3/vd4 是否加 baseBonus；浮点 round/clamp helper 语义 | 实机做一锅 tag 菜对拍（预测区间 vs 出锅 InstanceVD） | 区间边界 ±1 容差标注（显示层不装精确） |
| T0-6 | 品质分加成全项（新鲜/过期/调味品/天赋/灶具 bonus）对 4 档概率区间的影响 | 仅影响未来"概率展示"扩展，区间形态不受影响 | — |

签名漂移防线：全部 hook 按名解析（`AccessTools.Method`），缺方法=告警+回退官方（TradeFxRefreshHook 同款），游戏更新不炸只退功能。

## 7. 局部原型（design-proto/cookfx/，随设计交付）

| 文件 | 内容 | 验证什么 |
|---|---|---|
| `cookfx-math/`（csproj + CookingFxMath.cs + Program.cs） | 区间公式纯逻辑 spike（ExactRange/TagRange/排序键提取/比较器）+ console 断言 | 公式口径、四档收敛单值、负值/零垫底、稳定排序 |
| `cookfx-harness.html` | 静态仿制：菜谱书（12 条含组/锁定/负值）+ 这一锅（3 条已知+1 雾） | — |
| `cookfx.proto.js` + `cookfx.fixtures.js` | chips 注入、DOM 稳定重排、区间 chips 渲染、选择记忆 | 排序/渲染交互与视觉形态（作者过目定版） |
| `serve.cjs` 复用 | `node design-proto/serve.cjs` 后浏览器开 harness | — |

原型**未**验证（实机项，见 §6）：interop hook 可行性、GlobalSetting 实值、ReactiveProperty 推送、官方浮点对拍。

**spike 实测结论（2026-11-15，全部已回写 §5.1/§4）**
- C# 纯逻辑 20/20 断言全绿（佛跳墙 gamekb 实值对拍口径）；**抓到 bug 1**：负值食材时 [qFail,qPerfect] 两端大小反转 → TagRange min/max 归一。
- JS 原型 Playwright 实测全绿：五 chips 排序/降序/0 值键排 null 前/锁定垫尾/记忆恢复/官方重渲染自动重挂/默认还原官方序/区间 chips（单值收敛、全 0 维隐藏）。**抓到 bug 2**：观察器自触发无限环（卡死主线程）；**bug 3**：官方序快照被自身移动污染（queueMicrotask 复位修复）；另澄清一处**测试假象**：官方重建后同步读 DOM 是重挂前状态。
- **批改轮（同日，作者三条批改）**：①区间 chips 图标化；②同值 tiebreak 改菜谱 ID 升序（对抗序算例 1015/1014 正确翻转 + 三次重挂逐字节一致断言）；③图标改**官方原生字形**——排查定案：HUD 五维条在 CoreUI1（WebView），`Data_CoreUI1_AttrItem.AttrIcon` 为 C# 下发 unicode 字形（非图片资源，全 webui Res 扫描+stringliteral 均无五维图标文件）→ C# 运行时读 `State_Web_CoreUI1.AttrList` 取字形随包下发，SVG 仅作回退；harness 双向切换验证（字形包⇄SVG 回退）+ 排序回归全绿。顺手修正 v1 里从不命中的 `.cefx-vdN b` 选择器为 `b.cefx-vdN`。
- 成品截图：`cookfx-proto-v3.png`（官方字形形态；v2=SVG 形态存档；v1 初版）。

## 8. 分批与验收口径

- 批1：chips 出现/排序正确/默认回官方序/重启保持/其他页零变化；craftLocked 垫尾。
- 批2：已知菜谱 4 维区间显示（全 0 维隐藏）；精确配方与实出锅 4 档值一致（档内精确）；tag 配方出锅值落在区间内（T0-5 对拍）；性能：界面开关零后台开销（静态表只推一次）。
- 批3：Food 视图藏柜后其材料不再点亮"填装"；跨柜 TagCombo 菜谱可填装且取料正确、`AnnounceTookFromOtherTabs` 提示照常；Browser 视图/筛选关=官方行为逐字节不变；填装失败路径（材料不足）不弹错不卡死。
