# CERail 取证定案表（Task 1 spike）

> 2026-10-30。取证方式：**纯静态**（控制器裁定，不开游戏）。全部结论基于
> build 26157732（gamekb `2026-10-23_26157732`）与 `suite/tools/webui_src/UI/*`（同版官方 WebUI 快照）。
> 每条结论带证据来源（dump.cs 行号 / 表数据 / webui 文件+行号）；静态无法唯一确定的项给
> 「默认值 + 校准点（后续任务号 + 方法）」。
>
> 后续任务的消费关系：T6（RailData）用 BAG_OWNER/VD_MAP/ICON_RULE/CAT_NAME_PATH/ItemData 字段名；
> T7（命令层）用同 owner 语义与宿主表；T12（tidy）用 tidy 分支；T14 回归锚点用 VD_MAP 四物核对行。

---

## 1. VD_MAP —— ValueDisplay1..5 → 属性语义（**已定案，静态即可**）

| 槽位 | 游戏属性（AttrName） | 中文（游戏内） | rail 令牌 |
|---|---|---|---|
| ValueDisplay1 | Satiety (=1) | 饱腹 | `sat` |
| ValueDisplay2 | Morale (=2) | 心态 | `mind` |
| ValueDisplay3 | Stamina (=3) | 精力 | `en` |
| ValueDisplay4 | Health (=4) | 健康 | ——（当前全表恒 0，无令牌；icfg 行原样透传 v4） |
| ValueDisplay5 | Vitality (=5) | 生命 | `hp` |

- 证据 A（枚举顺序）：`enum AttrName` Satiety=1/Morale=2/Stamina=3/Health=4/Vitality=5（dump.cs @56541-56573）；
  五属性中文名：`Config_AttributeStandard.json` ID1-5 = 饱腹/心态/精力/健康/生命（生命=「等于零时你会死亡」→ 即 rail 的 hp）。
- 证据 B（数值逐项对齐，四物交叉验证，`tables/Config_Item.json` vs `tables/Config_Effect.json`）：
  Config_Item.Action→EffectID 的 End 段（SatietyEnd/MoraleEnd/StaminaEnd/HealthEnd/VitalityEnd）与该物品 VD1..5 **逐项相等**：
  - 急救绷带 ID 2400：VD=[0,0,0,0,**20**]，Effect 100002400 VitalityEnd=**20**（绷带回血→VD5=生命=hp 实锤）；
  - 西瓜汁(完美) ID 12417：VD=[**102,51**,0,0,**9**]，Effect 100012417 SatietyEnd=102/MoraleEnd=51/VitalityEnd=9；
  - 面包 ID 2502：VD=[20,3,0,0,0]，Effect 100002502 SatietyEnd=20/MoraleEnd=3；
  - 咖啡 ID 7：VD=[0,**5**,**20**,0,0]，Effect 100000007 MoraleEnd=5/StaminaEnd=20。
- 证据 C（结构）：`Config_Item.ValueDisplay1..5`（float，dump.cs @39330-39338，属性 @39450-39454）；
  `ItemValueDisplayHelper.GetEffectiveVD(item, config, vdIndex)`（dump.cs @420060）——物品实例可带 InstanceVD 覆盖配置值
  （`ItemData.InstanceVD: float[]` @418214 区段），rail 读数优先 `InstanceVD ?? config.VDn`。
- 全表核查：`Config_Item.json` 3875 行中 VD4≠0 的行数 = **0**（VD4 在当前版本数据从未使用）。
- 「thirst」令牌：游戏五属性无口渴/水分项（AttrName @56541-56573 全集），rail.js 原型令牌表里的 `thirst` 无对应物，
  **弃用**（原型 SORT 键实际也只用了 sat/hp/en/mind 四个，design-proto/rail.js @39-40）。
- 校准点：**T6 Step 4**（计划已写）——游戏内 Debug.Verbose 打面包/绷带/咖啡的 icfg v1..v5，与本表逐项对照；
  若运行时物品带 InstanceVD（刚用过一次的食物），以 InstanceVD 为准核对。

## 2. ICON_RULE —— Config_Item.Icon/WebIcon → 页面可用 URL（**已定案**）

**结论：直接用 `Config_Item.WebIcon` 字符串原样作 `<img src>`；全部 3875 个物品 WebIcon 均非空（无兜底分支）。**

- WebIcon 形如 `../../Res/Food/UI_Item_Icon_Food_S_1300200101.png`（tables/Config_Item.json ID=1）——
  **页面相对 URL**：官方页面在 `WebUI/UI/<Page>/<Page>.html`，`../../Res/...` 即 WebUI 根下的 Res 目录
  （gamekb `webui/Res/{Food,Consumable,Furniture,Material,...}` 实存）。官方页面同款用法：
  DroneHub.html @1025 `var DRONE_ICON = '../../Res/Furniture/UI_Item_Icon_wurenji.png'`；
  TradeUI.html @1050 区段 `<img class="item-icon" :src="it.icon">`——`it.icon` 即消息里 C# 下发的 WebIcon 字符串。
- mod 注入的侧栏与官方页面同 iframe 同路径，WebIcon 原样可用；若需要在 Root 帧或其它基路径使用，
  解析出 `Res/<子目录>/<文件名>.<ext>` 后按目标基路径重组（仅备用，rail 不需要）。
- `Icon`（Unity 资产路径，如 `Assets/RuntimeAssets/Texture/Food/UI_Item_Icon_Food_S_1300200101`）→ WebIcon 的官方换算
  规则 = 取 Texture/ 后的目录段+文件名拼 `../../Res/<目录>/<名>.<png|jpg>`；抽样 3875 行按此规则复算：
  3238 行完全一致，637 行目录段有出入（如 `Texture/UI/icon/X` → `Res/Food/X.png`）或扩展名为 .jpg——
  **证明 Icon 不是可靠来源，一律以 WebIcon 为准**（且 WebIcon 无空值，无需兜底）。
- 校准点：无需（全量静态可验）；T6 游戏内自查 icfg 的 icon 字段渲染为空再回看本节。

## 3. CAT_NAME_PATH —— categoryId/subCategoryId → 本地化名（路径已定位；主类名默认+校准）

- **categoryId = `Config_Item.Category`（int，0x60）/ subCategoryId = `Config_Item.SubCategory`（0x64）**
  （dump.cs @39312 区段；表数据 Config_Item.json 同名字段）。
- 官方下发链路：物品 VM 字段 `category`(string)/`categoryId`/`subCategoryId`/`kindName`(string)——
  状态侧 `Data_Web_DroneHub_Item : BaseStateData`（dump.cs @174984，字段 @175064-175068 `[WebBind_Int("_BagMsg","categoryId"/"subCategoryId")] [WebBind_String("_BagMsg","kindName")]`）、
  `Data_Web_MaterialRack_Item`（@191575，@191659-191663）、序列化侧 `WebUI_DroneHub_Item : BaseWebItemMsg`（@286398，
  字段 @286430-286434）。赋值方=各 `Reducer_Web_*`（方法体不在 dump 中，静态不可读）；页面把两字符串当
  **成品本地化文本**直用：DroneHub.html @873 `if (it.category) lines.push(it.category)`、@964 分类菜单
  `it.category || ('#' + it.categoryId)`、@864-865 同类搬运提示用 `kindName`。
- **subCategory 本地化名（mod 可静态取）**：`ConfigManager._Config_ItemSubCategory_Dict`（dump.cs @53622）→
  `Config_ItemSubCategory.Name_Local`（tables/Config_ItemSubCategory.json 全 12 行中文名齐全：
  0=不分类/1=主食/2=肉类/3=蛋奶/4=鱼/5=蔬菜/6=水果/7=零食/8=调味品/9=软饮料/10=酒/11=菌菇）。
  `ItemSubCategory` 枚举（dump.cs @56647）与之一致；stringliteral.json 含 `ItemSubCategory{0}` 格式键
  （官方本地化查键路径），值表即 Config_ItemSubCategory。
- **主类目本地化名（静态无表，默认+校准）**：`ItemCategory` 枚举 23 项（dump.cs @57107：0=None/1=Food/2=Drug/3=Books/
  4=ElectricalAppliances/5=DailyNecessities/6=Tool/7=Pet/8=Pack/9=Material/10=Seed/11=Fertilizer/12=Trap/13=Fuel/
  14=BagFurniture/15=Flower/16=Throwable/17=RobotModule/18=StoryItem/19=Collectible/20=Record/21=Renovation/
  22=TaskItem）；无 Config_ItemCategory 表、stringliteral 无 `ItemCategory{0}` 键、代码无中文字面量
  ——官方 `category` 字符串来源静态不可再追（Unity Localization 层）。
  - **默认值**：mod 自建 23 项 ItemCategory→中文 常量表（rail icfg「分类名」列显示用），中文词以游戏内
    tooltip 惯用为准（Food=食物/Material=材料/Tool=工具/Seed=种子/Fertilizer=肥料/Fuel=燃料…，初版词表写死在 T6）。
  - **校准点 T6**：游戏内抓 `_BagMsg` 2-3 个已知物品的 `category`/`kindName` 字符串——kindName 若等于
    Config_ItemSubCategory.Name_Local 即确认取数路径；category 若与常量表不一致，**照抄官方字符串回填常量表**。

## 4. BAG_OWNER —— 主角背包 ownerId 的取得（已定位；全局兜底默认+校准）

- **首选（8 个活动页 State 直读）**：`State_Web_*.PlayerBagOwnerId`（long）存在于：
  State_Web_Brew（@156724，字段 @156730）/Compressor（@161243/@161249）/DroneHub（@174359/@174365）/
  Dye（@175626/@175632）/GreenhouseBuild（@185026/@185032）/RatCage（@199861）/Shredder（@209542）/
  ToolTable（@215802）。取法照 ToolTablePruner 现成模式：
  `ReduxUISystem.Instance.GetStateByUI(uiType)?.TryCast<State_Web_XXX>().PlayerBagOwnerId`（ToolTablePruner.cs @66 同款）。
- **无此字段的 4 页**：BackpackUI/Cooking/MaterialRack/TradeUI（其 `BagOwnerId` ReactiveProperty 是「当前页签 active
  容器」，切到柜子后≠背包，不能当背包 owner 用——DESIGN.md 页签语义与 tagfilter.page.js readActive 实证）。
- **兜底默认值（常驻路径）**：三选一按顺序——① 会话内缓存：8 页任一开过时读到的 PlayerBagOwnerId 缓存复用
  （背包 owner 会话内不变，待校准确认）；② `State_Data_Player.PlayerId`（@149023 区段）== 背包 owner 的假设
  （Ac_Player_BattleStart 携带 PlayerId @142522；player agent 持 BagComponent @374690，agent InstanceId 即
  BaseEntity.InstanceId @106030——模式高度吻合但方法体不可读，**未实锤**）；③ 都不可得 → 本周期整包不推
  （计划 Step 1 的 null 分支）。
- **校准点 T6 Step 1**：Debug.Verbose 同时打「活动页 PlayerBagOwnerId / State_Data_Player.PlayerId /
  State_Data_Item.BagCache 键集合」（State_Data_Item @148615 区段：Cache/OwnerCache/BagCache 字段）——
  State_Data_Item @148633：Cache(0x20)/OwnerCache(0x28)/`BagCache`(0x30, @148641) 字段）——
  断言 PlayerBagOwnerId==PlayerId? 与 BagCache 命中；不等则确立「缓存复用」为唯一兜底并记录换包后是否变化。

## 5. 同 owner `TryQuickMoveItems` 语义（静态不可定 → 走计划预置降级分支）

- 接口事实：`ItemManager`（class @419067）：
  `public int TryQuickMoveItems(List<long> itemIds, long fromOwnerId, long toOwnerId, bool silent, bool avoidMold=False)`
  @419771（`BattleLogicWorld._ItemManager` internal 属性 @380591，backing field 0x78 @380384）；单件私有
  `TryQuickMoveItem` @419370；事件入口 `OnQuickMoveItem(s)` @419367/@419768、
  `OnQuickMoveItemsWithFallback` @419774。itemIds 元素 = `ItemData.InstanceId`（ItemData @418214 继承
  BaseEntity.InstanceId @106030；**ItemData 无 LogicId 属性**——LogicId 只在 Redux 侧 Data_Item @148332）。
  返回 int（推定=成功搬运件数，T7 按返回值做 toast）。
- **方法体不可见，from==to 时是否合并同名叠静态无法证明**。默认值：**tidy 不建立在 TryQuickMoveItems(from==to) 上**。
- **tidy 首选方案（比计划伪造事件更强，推荐 T12 采用）**：官方合并+排序方法对就在 ItemManager 上——
  `public void SortContainerForHub(long ownerId)` @419597 + `private void MergeStacksForHub(long ownerId)` @419603
  （比较器 `<SortContainerForHub>b__175_0/1` @418733/418736、`<MergeStacksForHub>b__177_0` @418739；
  配套 `HubSortGroup(int category)` @419594、`CanMoveAllInto` @419588）。Il2Cpp 反射可调（私有方法亦可），
  与页面是否带排序按钮无关——12 页 + 背包 owner 理论全覆盖，且语义就是官方「一键整理」（页签 active owner）
  的服务端本体。tidy 实现顺序：调 SortContainerForHub → 调 MergeStacksForHub → ForceRepublish。
  注意「ForHub」命名：语义按 DroneHub 族排序整理对齐，跨容器类型行为由 T12 校准兜底。
- **降级分支（计划原文保留）**：反射调用失败 → 有 SORT 事件的 5 页伪造官方事件（先 `forgeSwitchTo(owner)`）：
  BackpackUI `SORT_BACKPACK{side}`（dump.cs @152845，页 JS BackpackUI.html @5844）、Cooking `SORT_BAG`（@163289，
  #sortBagBtn @Cooking.html @898/@2289）、DroneHub `SORT_BAG{}`（@174552，#sortBagBtn1/2 @DroneHub.html @944-945）、
  ToolTable `SORT_BAG`（@216290，#btn-sort-bag @ToolTable.html @3805-3807）、TradeUI `SORT_BAG`（@220011，
  仅 trade phase @TradeUI.html @3817）；其余 7 页（Brew/RatCage/Dye/Compressor/Shredder/GreenhouseBuild/MaterialRack）
  toast「本界面暂不支持整理」。旁证：Compressor/Shredder/GreenhouseBuild 虽无页面按钮，C# 却有内部 Sort 动作
  （Ac_Compressor_Sort @116063 / Ac_Shredder_Sort @137609 / Ac_GreenhouseBuild_Sort @126680，各 Reducer RA_Sort
  带 Data_Item 比较器）——官方内部流程可触发排序，进一步支持反射直调路线。
- **校准点 T12**：同一容器放两叠同名物品（如两叠面粉）→ Debug.Verbose 打 `OwnerCache[owner]` 条数+各堆
  ItemCount → 调 SortContainerForHub+MergeStacksForHub → 再打快照：**叠数减少=可合并（tidy 成立）**；
  同一日志顺带做一次 `TryQuickMoveItems(同 owner)` 对照（堆数不变=同 owner 移动无合并效应，证实不依赖它）；
  并在背包（player bag）与柜子两侧各测一轮、超 StackLimit 拆留各测一轮（计划 T12 Step 2 原清单）。

## 6. 12 页 live-DOM 宿主选择器表（模板标记已逐页核实；iframe id 10/12 实测、2 页待校准）

约定：`doc` = 目标页 iframe 的 contentDocument（Root 与 iframe 同源，TagFilter.cs Probe 已实证）；
「host」= 官方被替换面板的运行时选择器（**优先 id 锚点导航**，比 first-of-type 抗页面迭代）。
家族名沿用计划 SCENES 表（bag/tt/trade/cart/cart0/backpack/rack）。

| 页面 | iframe id | 家族 | host（运行时选择器） | 页签锚点（族别判定/伪造切换用） | SORT 事件 |
|---|---|---|---|---|---|
| BackpackUI | `Backpack`?（校准 T8） | backpack | `.backpack-container`（替换其全部子节点：`.bag-slot`×N + `.transfer-controls`；Vue 渲染，模板 BackpackUI.html @3780/3838） | side A `.bag-tabs` 内 `.bag-tab` | SORT_BACKPACK{side} |
| MaterialRack | `MaterialRack`?（校准 T9） | rack | `#rackSystem`（整棵移除；非 Vue 静态 DOM，@MaterialRack.html @185） | rack 自研双面板自带 | 无 |
| Cooking | `Cooking`（实测） | bag | `#bagTabs.closest('.panel')`（=文档第 1 个 `.panel` @Cooking.html @881；后两个 @902/@945 是机器/右栏） | `#bagTabs`>`#bagTabPinned`+`#bagTabsScroll`（.bag-tab） | SORT_BAG |
| BrewPanel | `BrewPanel`（实测） | bag | `#bagTabs.closest('.col')`（第 1 个 `.col` @BrewPanel.html @263） | 同上 | 无 |
| RatCage | `RatCage`（实测） | bag | `#bagTabs.closest('.panel')`（第 1 个 `.panel` @RatCage.html @251；cage/power 在 @283/@305） | 同上 | 无 |
| DyePanel | `DyePanel`（实测） | bag | `#bagTabs.closest('.col.bag-col')`（@DyePanel.html @317） | 同上 | 无 |
| Compressor | `Compressor`（实测） | cart0 | 第 1 个 `.cart`（@Compressor.html @440；唯一 `.cart`） | `#tabs`（.left-tab，无 pin 分离，offset 0） | 无 |
| Shredder | `Shredder`（实测） | cart | 第 1 个 `.cart`（@Shredder.html @304；唯一 `.cart`） | `#tabsScroll`（.left-tab，pin=tabs[0] 偏移 1） | 无 |
| GreenhouseBuild | `GreenhouseBuild`（实测） | cart | `#cartPane`（`section.pane.cart` @GreenhouseBuild.html @267） | `#tabsScroll`（.left-tab，pin `#tabPinned`） | 无 |
| ToolTable | `ToolTable`（实测） | tt | `.backpack-panel`（@ToolTable.html @1947；**内含 `.left-tabs` 页签列——替换面板即连柜子页签一起走**） | `#leftTabsScroll`（.cabinet-tab；pin `#tab-bag`；`#tab-drawer` 在 scroll 内首个但无 .cabinet-tab） | SORT_BAG |
| TradeUI | `Trade`（实测，**不是 TradeUI**） | trade | `.cols > .col` 文档第 1 个（@TradeUI.html @2518；内含 `#tradeBagGrid` 与 `.bag-tab[data-owner]`；`.bag-tabs` 为 v-if tabs>1） | `.bag-tabs-scroll` 内 `.bag-tab[data-owner]`；pin `.bag-tab-pinned` | SORT_BAG（仅 trade phase） |
| DroneHub | `DroneHub`（实测） | bag | `#paneMine`（`section.pane.mine` @DroneHub.html @408） | `#bagTabs`>`#bagTabPinned`+`#bagTabsScroll` | SORT_BAG |

- 实测 iframe id 来源：DESIGN.md「场景视图表」（2026-10-16 起多轮实测，键=`iframe 元素 id`）；
  BackpackUI/MaterialRack 不在旧表（旧筛选层未覆盖这两页）——stringliteral.json 有 `"Backpack"`/`"MaterialRack"`
  字面量，**默认值** iframe id = `Backpack` / `MaterialRack`；**校准点**：T8（backpack 场景）/T9（rack 场景）
  首次注入时 `console.log` 或 RailUi 日志打印实际 frame id（tagfilter.page.js `pageKey(st)` 同法），不符则以实测为准。
- 页面 DOM 性质：BackpackUI/TradeUI/DroneHub 为 Vue 页（createApp），但 host 容器与 id 锚点均为静态节点或
  Vue 渲染后稳定存在；其余 9 页为 vanilla 静态 DOM（源码即 live 结构）。id 锚点（bagTabs/bagTabPinned/
  bagTabsScroll/leftTabsScroll/tabsScroll/tabs/paneMine/cartPane/rackSystem/tradeBagGrid）全部实存于源码。
- 家族判定与伪造切换负载沿用 tagfilter.page.js detectC（@257-268）与 DESIGN 附录 A：bag 族 SWITCH_BAG{ownerId:数字}、
  trade 族 SWITCH_BAG{ownerId:String}、tt/cart/cart0 族 TAB_SWITCH{tab 下标}。

## 7. 附带定案（Step 1 ③ 与 T6/T7 直接消费）

- **事件/动作锚点**：`Ac_BackpackUI_QuickTransferItem`（dump.cs @112345）→ `Reducer_Web_BackpackUI.RA_QuickTransferItem`
  @154238（Trigger @154460；State 侧按钮 `Btn_QuickTransferItem` @152653/@152884）；同类搬运
  `Ac_BackpackUI_QuickTransferKind` @112372 / `RA_QuickTransferKind` @154247（页内注释 BackpackUI.html @5909：
  「真正执行搬运的是 RA_QuickTransferKind」）；DroneHub 分类取回 `Ac_DroneHub_TakeCategory` @122743
  （WebBind `ACTION_TAKE_CATEGORY` @174540）。**rail 不伪造这些**（走 ItemManager 直调），仅作语义参照。
- **容器标签/改名组件**：`FurnitureTagComponent.GetRule()` @372553 / `SetRule(IReadOnlyList<int>)` @372559 /
  `IsRuleEmpty()` @372556 / **`SetCustomName(string)` @372562**——T7 的 rename/setTags 直调此组件
  （改名不必新发明机制）。
- **逻辑层物品字段名（T6 白名单遍历用）**：`ItemData`（@418214，继承 BaseEntity）：`InstanceId`（基类 @106030）、
  `OwnerId`(0x30)/`ItemConfigId`(0x38)/`ItemCount`(0x3C)/`StartTime`(0x40)/`TimeLeft`(0x44)/`ItemSize`(0x48)/
  `BagPos`(0x50)/`UseTimes`(0x58)/`MaxUseTimes`(0x5C)/`InstanceVD`(0x78)/`InstanceEffectEnd`(0x80)/
  `InstanceWeight`(0x8C)/`Polluted`(0x90)/`IsMapPreset`(0x91)。**无 LogicId 字段**（计划 Consumes 行的
  `LogicId` 应读作 `InstanceId`）。Redux 侧镜像 `Data_Item`（@148332）才有 `LogicId`(0x10)。
- **堆合并线索**：`FindStackableItem(ownerId, itemConfigId, extraPredicate, polluted, isMapPreset)` @419394
  （入包即找同 configId 堆合并；polluted/isMapPreset 为不合并条件）——take/put 走 TryQuickMoveItems 的合并
  行为由该路径保证，无需 rail 自己拼堆。

---

## 校准总表（后续任务执行清单）

| 校准点 | 任务 | 动作（Debug.Verbose 日志形态） |
|---|---|---|
| VD_MAP 四物回归 | T6 Step 4 | 开烹饪界面，日志打面包/绷带/咖啡 icfg 行 `v1..v5`，与 §1B 数值逐项对照；有 InstanceVD 的物品以 InstanceVD 为准 |
| CAT_NAME_PATH | T6 | 抓 `_BagMsg` 中 2-3 物品的 `category`/`kindName` 字符串，对 Config_ItemSubCategory.Name_Local 与 §3 常量表；不一致照抄回填 |
| BAG_OWNER | T6 Step 1 | 同一周期打 `PlayerBagOwnerId(活动页)`、`PlayerId`、`BagCache` 键集合三值；确立兜底顺序与换包稳定性 |
| 同 owner tidy | T12 | 两叠面粉快照→反射调 Sort+Merge→快照；附 TryQuickMoveItems(同 owner) 对照；背包/柜子两侧、超限拆留 |
| iframe id×2 | T8/T9 | backpack/rack 场景首推时打印实际 frame id，核对 `Backpack`/`MaterialRack` 默认值 |
| TryQuickMoveItems 返回值 | T7 | 首次 take/put 日志打返回 int 与 OwnerCache 差量，确定「成功搬运件数」语义 |
