# 储物侧栏正式实现（CERail）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `UI-SPEC.md` v12 定稿的储物侧栏（11+1 场景替面板、自研整理柜双面板、真实物品转移）从 design-proto 原型落成 mod 正式实现。

**Architecture:** 双层分工——JS（新内嵌资源 `railui.page.js`/`railui.css`，由 `design-proto/rail.js/rail.css` 移植）负责全部 DOM/渲染/交互/视图态/localStorage/官方事件伪造；C#（新 `RailUi.cs`/`RailData.cs`/`RailCommands.cs`）负责数据供给（数据契约 v4，revision 门控直推）与命令执行（JS 排队 → 主帧串行执行，全部走官方公开 API：`ItemManager.TryQuickMoveItems/TryMoveBagAll/SplitItem`、`FurnitureTagComponent.SetRule`）。旧 tagfilter 层在 rail 生效页面整体让位（cfg `[Rail] Enable` 可回退）。

**Tech Stack:** BepInEx + Il2CppInterop（既有模式）；Vuplex WebView `ExecuteJavaScript`（含回调 = JS→C# 命令通道，回调只入队、Ticker 主帧执行——红线 9）；浏览器 localStorage（持久化，键名照 §4.9）。

**Spec:** `SurvivalLog.CabinetEverywhere/UI-SPEC.md`（v12，唯一定义源）；上游 `DESIGN.md`；红线 `suite/docs/03-教训与红线.md`。执行者必须先读这三份。

## Global Constraints（全文任务隐含遵守）

- 侧栏 428×816 恒定、画布 1536×864 恒定（`!important` 锁死）；网格 10 列×34px、间距 6，容量只加行 `rows=ceil(格数/10)`；改列数只动 `COLS/SLOT` 两常量。
- **官方已有控件一律不自绘**：五按钮本体用页面自带 `.transfer-btn`；BackpackUI 独有样式（下拉/putin）按官方 CSS 原样搬入。
- 弹层开关：先 `hidden` 再渲染内容；自开弹窗的按钮加入 document 级关闭监听豁免清单。
- 页签/菜单**原地更新**（结构未变不重建 innerHTML）；`#srp .gpage [hidden]{display:none !important}`；注入格子容器内联 `display:grid`。
- 右键口径：柜子右键取 1 件、Shift+右键整堆/整行；整理柜左背包右键放入 1 件、Shift+整堆；取出物并入背包同类叠。
- localStorage 键：`srp_pin_order_<scene>` / `srp_common_tags_<scene>` / `srp_ctn_names` / `srp_ctn_tags` / `srp_custom_tags`（§4.9）。
- **套件红线**（03-教训与红线.md）：绝不克隆物品对象；绝不置零源堆再恢复；不碰 State/Reducer；OwnerCache **只遍历 CabinetCatalog 名单 + 背包 owner**（混有地面掉落虚拟 owner）；ExecuteJavaScript 回调内**禁止改游戏数据**（只入 `_pending` 队列，Ticker 主帧执行）；部署前关游戏。
- JS 改动纪律：`node --check` + 重编 dll；双击等交互验证必须真实输入事件。
- 版本号单源 = 本仓 csproj `<Version>`。

## Review Focus（spec 未明说、最可能咬人的五类输入；对应测试已钉进各任务）

1. **JS 缓存过期时下命令**（物品刚被官方链路移走/吃掉，logicId 查无）→ C# 必须静默跳过该 id、执行其余、照常回推新数据；不得异常弹窗/中断整批。→ T7 Step 2 测试。
2. **虚拟 owner 混入**（OwnerCache 含地面掉落等）→ items 推送与命令执行只认 CabinetCatalog ownerIds + bagOwner。→ T6 Step 2 / T7 Step 3 断言。
3. **ValueDisplay1..5 ↔ 排序属性错位**（把口渴当饱食）→ T1 校准表 + T6 固定映射断言（用两个已知物品）。
4. **注入时序**（rail 先挂、数据未到 / 页面重载 / WebView 重建）→ 空态渲染、每 0.5s 幂等重注、观察器重挂，控制台零报错。→ T8 Step 4。
5. **连点命令洪泛**（五按钮/入库连点）→ 命令串行 + 每帧上限 + drain 后清队，UI 不卡不重入。→ T7 Step 2。

---

## 文件结构（Create/Modify 总览）

| 文件 | 职责 |
|---|---|
| Create `SurvivalLog.CabinetEverywhere/railui.css` | 侧栏样式（fork 自 `design-proto/rail.css`，去原型专属段） |
| Create `SurvivalLog.CabinetEverywhere/railui.page.js` | 侧栏 JS（fork 自 `design-proto/rail.js`：数据层换 `__CERAIL__`，装配换正式场景表） |
| Create `SurvivalLog.CabinetEverywhere/RailUi.cs` | Tick 编排：幂等注入 bootstrap、rev 变化推数据、drain 命令（回调入队）、主帧 Pump |
| Create `SurvivalLog.CabinetEverywhere/RailData.cs` | 数据契约 v4 组装：容器(cap)/物品行/icfg/lib/ctx/rev |
| Create `SurvivalLog.CabinetEverywhere/RailCommands.cs` | 命令队列 + 执行器（官方公开 API；红线对照；改名持久化文件） |
| Create `SurvivalLog.CabinetEverywhere/design-proto/railui-harness.html` | 本地测试床（mock `__CERAIL__` + 假官方页骨架 + 场景切换），T2-T5 全靠它 |
| Modify `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs` | cfg `[Rail] Enable`；AccessTicker 快通道挂 `RailUi.Tick` |
| Modify `SurvivalLog.CabinetEverywhere/tagfilter.page.js` | rail 生效页面跳过旧隐藏/下拉（railOn 门） |
| Modify `SurvivalLog.CabinetEverywhere/SurvivalLog.CabinetEverywhere.csproj` | 两个 EmbeddedResource |
| Modify `SurvivalLog.CabinetEverywhere/DESIGN.md` / `CHANGELOG.md` | 文档随源码（§8 迭代清单 + 新章） |

---

### Task 1: 取证 spike——四个实现期未知数定案

**Files:**
- Create: `docs/superpowers/plans/2026-10-30-cerail-spike-findings.md`（结论表）
- Test: 该结论表本身（每行带证据来源：dump.cs 行号 / ConfigDumpProbe 输出 / 实机日志）

**Interfaces:**
- Produces: `VD_MAP`（ValueDisplay1..5 → 'sat'|'hp'|'en'|'mind'|'thirst' 的定案映射）；`ICON_RULE`（Config_Item.Icon/WebIcon → 页面可用 URL 规则）；`CAT_NAME_PATH`（categoryId/subCategoryId → 本地化名：定位官方序列化 `WebUI_*_Item.category/kindName` 的取数代码）；`BAG_OWNER`（主角背包 ownerId 的取得：活动页 `State_Web_*` 的 `PlayerBagOwnerId` 或全局途径）；**同 owner `TryQuickMoveItems` 语义**（是否合并同名叠——tidy 方案的前提）；12 页 live-DOM 宿主选择器表（iframe id → 官方被替换面板的**运行时**选择器；build-rail-proto.cjs 头注释的切分标记是模板侧起点，live DOM 以 webui_src/游戏实测为准）。

- [ ] **Step 1: 静态取证（不开游戏）**——在 `gamekb/2026-10-23_26157732/il2cpp/dump.cs` 与 `suite/tools/webui_src/UI/*` 完成：① 遍历 `WebUI_DroneHub_Item.category` 的赋值方（搜 `[WebBind_Int("_BagMsg", "category")]` 所属 VM 的序列化函数），确定分类本地化名取数路径；② 整理 12 页运行时宿主选择器初表；③ 记录 `Ac_BackpackUI_QuickTransferItem`/`RA_QuickTransferItem`、`Btn_SortBag`（SORT_BAG 事件页清单：BackpackUI/Cooking/DroneHub/ToolTable/TradeUI 有，Brew/RatCage/Dye/Compressor/Shredder/GreenhouseBuild/MaterialRack 无）。
- [ ] **Step 2: 动态取证（开游戏，Debug.Verbose）**——临时探针（不提交）：启动日志 dump 2-3 个已知物品（如面包/绷带/咖啡）的 `Config_Item` 全字段 + `BattleLogicWorld.Instance._ItemManager` 同 owner 快速移动一次的前后堆数。产出 `VD_MAP` 与同 owner 语义结论。
- [ ] **Step 3: 写结论表并提交**——`VD_MAP` 若无法唯一确定，取「与游戏内物品 tooltip 数值逐项对齐」的那组并注明验证方法；tidy 若同 owner 移动不合并 → 记录降级方案（rail 整理按钮在有 SORT_BAG 事件的 5 页走伪造官方事件、其余页 toast「本界面暂不支持整理」），后续任务按此分支。
```bash
git add docs/superpowers/plans/2026-10-30-cerail-spike-findings.md
git commit -m "docs(cerail): 取证定案 VD_MAP/ICON_RULE/宿主选择器表/同owner移动语义"
```

### Task 2: 资源脚手架 + 本地测试床

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/railui.css`、`SurvivalLog.CabinetEverywhere/railui.page.js`（骨架）、`SurvivalLog.CabinetEverywhere/design-proto/railui-harness.html`
- Modify: `SurvivalLog.CabinetEverywhere.csproj`（EmbeddedResource 两项，LogicalName 同 tagfilter 模式）

**Interfaces:**
- Produces: `window.__CERAIL__`（railui.page.js 顶部定义，harness 与 C# 共用契约）：`{ ver:1, setData(json), drain() -> '[]'（待执行命令 JSON 数组字符串）, cmd(op, payload)（入队）, mount(doc, sceneKey)（装配到某页文档）, state（只读视图态） }`。bootstrap 顶部 `if (window.__CERAIL__) return;` 幂等。
- Produces: railui.page.js 内常量 `COLS=10, SLOT=34, GAP=6`、`SCENES` 表（key → `{host:'<选择器>', family:'bag|tt|trade|cart|cart0|backpack|rack', bagOnly:bool, duo:bool}`，12+1 页含 GreenhouseBuild；Trade 页 iframe id=`Trade`）。

- [ ] **Step 1: railui.css fork**——复制 `design-proto/rail.css`，删原型专属段（`.gpage`/`.srp-fitwrap`/`.scb` 等），保留全部 `#srp` 前缀（页内无冲突源）。对照源文件逐段核对未漏样式类。
- [ ] **Step 2: railui.page.js 骨架**——IIFE：`__CERAIL__` 定义（setData/drain/cmd/mount 空实现 + `RAIL_HTML`/`BAGPANEL_HTML` 从 rail.js 原样拷入）；SCENES 表按 Task 1 结论表填 host 选择器。
- [ ] **Step 3: harness**——单文件：引入 railui.css + railui.page.js + mock（`MOCK.setData` 定时喂固定假数据、收 `cmd()` 打到页面日志面板）+ 两个假场景骨架（cook 族 `.panel` 宿主、rack 族 `.rack-system` 宿主）+ 场景切换按钮。`node serve.cjs` 后访问 `http://127.0.0.1:8180/railui-harness.html`。
- [ ] **Step 4: 校验并提交**——`node --check railui.page.js` 通过；`dotnet build -c Release` 0 错误（资源已入 csproj）；harness 打开控制台零报错、空侧栏可见 428×816（DevTools 量取）。
```bash
git add SurvivalLog.CabinetEverywhere/railui.css SurvivalLog.CabinetEverywhere/railui.page.js SurvivalLog.CabinetEverywhere/design-proto/railui-harness.html SurvivalLog.CabinetEverywhere/SurvivalLog.CabinetEverywhere.csproj
git commit -m "feat(cerail): railui 资源脚手架 + 本地 harness（css fork/JS 骨架/SCENES 表）"
```

### Task 3: 渲染层——数据契约 v4 → 侧栏全静态渲染

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（渲染函数区）
- Test: `design-proto/railui-harness.html`（mock 数据扩展）

**Interfaces:**
- Consumes: `__CERAIL__.setData(json)`，json 形状（**本任务起冻结，C# 侧 T6 按此实现**）：
```js
{ rev: 7,                       // 数据版本；未变 C# 不推
  ctx: { page:"Cooking", family:"bag", bagOnly:false, rackOwner:0 },   // rackOwner=整理柜当前架子
  bag: 123456,                  // 主角背包 ownerId（页签「背包」固定首位）
  ctn: [[ownerId, "名称", 'c'|'f'|'r', capCells, tagId...], ...],      // 全部家中容器，不含背包
  lib: [[tagId, "标签名", dim, order, icon, color], ...],              // 官方标签库
  icfg: [[cfgId, "名称", "图标URL", tradeValue, stackLimit, catId, subCatId, "分类名", life, v1,v2,v3,v4,v5], ...],
  items: { "<ownerId或'bag'>": [[logicId, cfgId, count, timeLeftSec, x,y,w,h, flags], ...], ...] } // flags: bit0污染 bit1过期 bit2临期
}
```
- Produces（模块内函数，T4/T5 复用）：`store`（数据仓）、`render()`、`renderCtnBar()/renderCtnPop()/renderTags()/slotHtml()/visItems()/sortArr()`、`ctnById(id)`、`bagArr()`（=`items['bag']`）。

- [ ] **Step 1: mock 数据按契约扩展**——harness 喂 ≥3 容器（不同 cap/kind/tags）+ 背包 + 覆盖过的 icfg，图标用 1px 占位。
- [ ] **Step 2: 渲染移植**——从 rail.js 移植：头部（容器名+`10 列 · N 格 · 标签`）、页签栏（背包固定首位+2px 竖线；常用柜=localStorage 顺序数组里的容器，无存档默认前 4 个；其余仅 ▾ 菜单；恒一行横向滚动不省略）、物品区网格（rows=ceil(cap/10)、空格补齐、容器空=满空格）与列表（同名汇总行：数量=叠合计、副行 `分类 · N 叠 · 最短保质 · 来源`、排序键按汇总值、交易价值=单价×数量）、悬停详情条、页脚（已用/总格数 · N 行 + 动作组按钮位）。`emoji` 全部替换为 `<img src=icfg.icon>`。保质显示 `Math.round(timeLeft/3600)h`。
- [ ] **Step 3: 校验并提交**——harness 断言：侧栏 428×816、格子 34px×10 列、切容器（mock 换 setData）页签高亮原地更新不重建（`renderCtnBar` 的 key 短路）、列表汇总行与排序值正确、控制台零报错。
```bash
git add SurvivalLog.CabinetEverywhere/railui.page.js SurvivalLog.CabinetEverywhere/design-proto/railui-harness.html
git commit -m "feat(cerail): 数据契约 v4 渲染层（头部/页签/网格/列表/悬停/页脚）"
```

### Task 4: 视图状态与持久化

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（视图态区）

**Interfaces:**
- Consumes: T3 的 `render()/visItems()/sortArr()`。
- Produces: `st`（视图态对象，同 rail.js 形状：`mode/sort/dir/query/global/tags/sel/currentId`）；`persist` 模块（五键读写，键名照 §4.9；`srp_ctn_names/srp_ctn_tags` 由 T5 编辑弹窗写入，本任务只做读写函数）。

- [ ] **Step 1: 交互移植**——搜索框 input、`本柜/全库` 切换（全库=跨全部容器+物品分类或来源柜标签命中+锁列表+前 300 条）、快捷标签 chips（点=切换、×=移出、＋=管理弹层、两行上限 toast「快捷标签最多两行，请先移除一个」）、自定义标签词表、排序下拉 6 项+方向+网格/列表分段（全库锁定列表）、选中态。全库标题「全库搜索」、来源显示首个来源+`等 N 处`。
- [ ] **Step 2: 场景态**——`bagOnly`（BackpackUI）下柜签栏/全库切换整行不显示；rack 场景 `railCtns()` 排除背包；场景入口默认（`bagOnly→bag`、`rack→rackOwner`、其余→bag）。
- [ ] **Step 3: 校验并提交**——harness 真实输入事件驱动：改状态→`localStorage` 键值正确→刷新页面恢复；两行上限拒绝添加且 toast 出现；A 场景与 B 场景的页签顺序互不影响。
```bash
git add SurvivalLog.CabinetEverywhere/railui.page.js SurvivalLog.CabinetEverywhere/design-proto/railui-harness.html
git commit -m "feat(cerail): 视图状态+分场景 localStorage 持久化+bagonly/rack 场景态"
```

### Task 5: 容器菜单、✎ 编辑弹窗、命令排队

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（弹层区 + 命令排队）

**Interfaces:**
- Consumes: T3 `renderCtnPop()`、T4 `st`。
- Produces: `__CERAIL__.cmd(op, payload)` 完整语义（命令名冻结，T7 按此实现）：
  `{op:"take", ids:[logicId...], all:bool, from}`（右键取 1/Shift 整堆或整行）、
  `{op:"put", ids:[...], all:bool, to}`（rack 左面板放入）、
  `{op:"takeAll"|"putAll", from|to}`、`{op:"takeCat"|"putCat", from|to, cat:catId}`、
  `{op:"putTag", to}`、`{op:"tidy", owner}`、`{op:"storeAll", order:[ownerId...]}`、
  `{op:"rename", owner, name}`、`{op:"setTags", owner, tags:[tagId...]}`。

- [ ] **Step 1: ▾ 菜单移植**——196px 分组小菜单（食品类/材料类/功能类/自定义/未打标签，分组按 lib 的 dim 与容器 tags 求交）；单击切换不关菜单、高亮原地更新；点空白/Esc 关；双击菜单行=打开设置并关菜单。
- [ ] **Step 1b: 右键取出/放入接线**——物品区 `contextmenu`（§4.8）：网格叠右键=`cmd('take',{ids:[该叠],all:false})`、Shift=整堆 `all:true`；列表行=该名字全部叠 `all:true`；rack 左背包面板右键=`cmd('put',...)` 对称；物品区空白处右键 `preventDefault` 吞浏览器菜单；命中背包自身条目的 id 由 C# 跳过后 JS 依回推数据提示「已经在背包里了」。选中态（左键）照 rail.js。
- [ ] **Step 2: ✎ 编辑弹窗移植**——248px：名称输入 maxlength=8 + 官方 26 标签分组多选（+自定义词表组）；✎ 仅选中页签显示、`draggable=false`+mousedown stopPropagation、点击不切容器；双击页签同开。保存=写 localStorage（names/tags）+ `cmd('rename')/cmd('setTags')` + 全处同步重渲染（标题/页签/菜单/全库过滤）。
- [ ] **Step 3: 页签拖拽移植**——dragstart/dragover/drop 指示与持久化（背包固定首位不可拖）；drop 写 `srp_pin_order_<scene>`。
- [ ] **Step 4: 校验并提交**——harness 真实 dblclick 打开弹窗（验证原地更新纪律：菜单行节点未被替换，`isConnected` 同一元素）；保存后 mock 日志面板显示 `rename/setTags` 命令内容正确；Esc 关全部弹层。
```bash
git add SurvivalLog.CabinetEverywhere/railui.page.js SurvivalLog.CabinetEverywhere/design-proto/railui-harness.html
git commit -m "feat(cerail): 容器菜单/✎编辑弹窗/页签拖拽/命令排队（cmd 契约冻结）"
```

### Task 6: C# 数据层 RailData

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/RailData.cs`
- Modify: `SurvivalLog.CabinetEverywhere/RailUi.cs`（本任务先建文件承载 `RailUi.Tick` 最小版：仅数据推）

**Interfaces:**
- Consumes: `CabinetCatalog.AllContainers`（ownerId/name/kind/TagIds）；`BagTable.BagDict`（`Config_Bag.Size=[w,h]` → capCells）；`BattleLogicWorld.Instance._ItemManager`（`OwnerCache: Dictionary<long, Dictionary<long, ItemData>>`，ItemData 字段 `LogicId/ItemConfigId/ItemCount/TimeLeft/BagPos/ItemSize/Polluted`——以实际属性名为准，Task 1 结论表核对）；`Config_Item`（ItemName_Local/Icon/WebIcon/price|TradeValue/StackLimit/Category/SubCategory/Life/ValueDisplay1..5）；标签库复用 TagFilter 的 lib 组装段。
- Produces: `RailData.RefreshMeta()`（5s 慢通道调用：容器行+cap）；`RailData.BuildJson()` → `(string json, int rev)`（json 含 ctx 段：`page/family/bagOnly/rackOwner`——page 由当前 `IsUIActive` 命中的界面映射，rackOwner 取 `State_Web_MaterialRack` 的架子 owner）；`RailData.ItemsDirty()` → bool（廉价 rev：Σ各白名单 owner 的物品条数+首末 logicId）；`RailData.ForceRepublish()`（rev 强制+1，T7 命令执行后调用）；`RailData.IcfgRow(int cfgId)`（懒缓存）。改名覆盖：`RailData.NameOf(ContainerInst)` = `RailCommands.LoadNames()` 优先。

- [ ] **Step 1: 容器与背包**——ctn 行组装（cap=Config_Bag w×h）；bag ownerId 按 Task 1 `BAG_OWNER` 结论取得（活动页 `State_Web_*.PlayerBagOwnerId` 优先，兜底常驻路径），取不到则整包不推（返回 null，等下一周期）。
- [ ] **Step 2: 物品行（白名单遍历）**——`foreach` CabinetCatalog ownerIds + bagOwner，逐 owner 读 `OwnerCache[owner]` 输出紧凑行；icfg 按出现过的 cfgId 懒缓存；**绝不 foreach OwnerCache 本身**（红线 4）。
- [ ] **Step 3: rev 门控与推送**——`RailUi.Tick`（0.5s）：rev 未变或当前无 rail 场景（`ReduxUISystem.IsUIActive` 全表皆否）→ 不推；变化 → `ExecuteJavaScript("window.__CERAIL__&&window.__CERAIL__.setData(" + json + ")")`。json 用 StringBuilder 紧凑拼（EscapeJs 复用 TagFilter 私有实现，提为内部共享或复制）。
- [ ] **Step 4: 校验并提交**——`dotnet build -c Release` 0 错误；游戏内（Debug.Verbose）开烹饪界面日志打出 json 头 200 字符 + 容器数/物品行数；用 Task 1 的两个已知物品核对 icfg 行的 v1..v5 与 `VD_MAP` 一致（Review Focus 3 回归锚点）；无柜家也正常（ctn=[]）。
```bash
git add SurvivalLog.CabinetEverywhere/RailData.cs SurvivalLog.CabinetEverywhere/RailUi.cs
git commit -m "feat(cerail): RailData 数据契约 v4 组装（白名单遍历+rev 门控直推）"
```

### Task 7: C# 命令层 RailCommands（红线对照）

**Files:**
- Create: `SurvivalLog.CabinetEverywhere/RailCommands.cs`
- Modify: `SurvivalLog.CabinetEverywhere/RailUi.cs`（drain + Pump 接线）

**Interfaces:**
- Consumes: T5 冻结的 cmd 契约；`ItemManager.TryQuickMoveItems(List<long> itemIds, long fromOwnerId, long toOwnerId, bool silent, bool avoidMold=false) -> int`、`ItemManager.TryMoveBagAll(long from, long to, bool tipOnUntransferred=true) -> bool`、`ItemManager.SplitItem(long srcInstanceId, int splitCount) -> ItemData`、`FurnitureTagComponent.SetRule(IReadOnlyList<int>) -> bool`（CabinetCatalog 已有组件读取通道）；背包 owner = `RailData` 同源。
- Produces: `RailCommands.Enqueue(string jsonArray)`（drain 回调唯一入口——只解析入队）；`RailCommands.Pump()`（Ticker 主帧串行执行，每帧上限 8 条，余量留待下帧）；`RailCommands.LoadNames()/SaveNames()`（`BepInEx/ cerail_names.json`，ownerId→名称，长度>8 截断）。

- [ ] **Step 1: 执行器映射**——`take{all:false}`：每 id `SplitItem(id,1)`，返回 null（不可拆/整叠=1）则原 id 直移；产出的新 id 与其余 id 合一批 `TryQuickMoveItems(→bag)`。`take{all:true}/put`：`TryQuickMoveItems` 整批。`takeAll/putAll`：`TryMoveBagAll`。`takeCat/putCat`：C# 侧按 `Config_Item.Category==cat` 过滤源 owner 物品 id 再整批。`putTag`：读 `to` 容器 `FurnitureTagComponent.GetRule()` 标签名集合，物品分类名命中即入选。`tidy`：同 owner 内同 cfgId 分组，每组首叠外全部 `TryQuickMoveItems(ids, owner, owner)`（Task 1 语义结论若否决 → 按 Task 1 Step 3 降级方案执行并在代码注释标注）。`storeAll`：§4.7 路由——按 `order` 顺序找「标签名含该物品分类名且未满」的柜，`TryQuickMoveItems` 逐叠；无匹配/全满留背包。`rename/setTags`：文件持久化 / `SetRule`。
- [ ] **Step 2: 鲁棒性（Review Focus 1/5 的测试）**——id 查无（源 owner 的物品字典里不存在）→ 跳过计数不抛；每命令执行完 `RailData.ForceRepublish()`（rev 强制+1，下周期立即回推）；命令解析失败整条丢弃并 LogWarning 一次。
- [ ] **Step 3: 白名单执行域（Review Focus 2）**——所有 from/to owner 必须命中 `CabinetCatalog.AllContainers` ownerIds 或 bagOwner，否则丢弃该命令（防虚拟 owner/前端伪造）。
- [ ] **Step 4: 校验并提交**——游戏内：柜子右键取 1（堆 5→4 且背包同类叠+1）、Shift 整堆、`storeAll` 分布符合 §4.7、背包满 toast；日志逐命令一行结果；连续快速点击 10 次五按钮无重入无卡顿。
```bash
git add SurvivalLog.CabinetEverywhere/RailCommands.cs SurvivalLog.CabinetEverywhere/RailUi.cs
git commit -m "feat(cerail): RailCommands 命令执行层（官方 API 直调+红线对照+主帧串行）"
```

### Task 8: 场景装配——rail 替换官方面板（正式注入）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（装配区）、`SurvivalLog.CabinetEverywhere/RailUi.cs`（bootstrap 注入循环）
- Modify: `SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs`（cfg `[Rail] Enable=true` + AccessTicker 快通道挂 `RailUi.Tick`）

**Interfaces:**
- Consumes: T2 `SCENES` 表与 `mount(doc, sceneKey)`；tagfilter 注入模式（Root 幂等 bootstrap + 同源探针）。
- Produces: `RailUi.Enabled`（cfg 直读）；railui.page.js 内 `ensureMounted()`——检测当前活动 iframe（`#iframe-container iframe` 逐个 `el.id` 对 SCENES）、宿主替换（`host.parentNode.replaceChild`）、CSS 注入（`<style id="srpRail">`）、MutationObserver 重挂（宿主被官方重建→重新替换；自家 rail 节点排除观察）、clickThrough 交互同步（全部可点元素走官方 `data-interactive`/button 通道，参照 webui-core 与 tagfilter `[data-interactive]` 先例）。

- [ ] **Step 1: bootstrap 注入**——RailUi.Tick 注入 railui.page.js（含 railui.css 文本内联进 bootstrap 头部，或 JS 侧注入 style——二选一，取「样式随 JS 单资源」方案）；`window.__CERAIL__` 已存在即跳过；WebView 重建自动重挂。
- [ ] **Step 2: 宿主替换**——机器族 10 页（cook/brew/cage/dye/shred/press/tool/trade/drone + greenhouse）按 SCENES.host 替换为侧栏；BackpackUI 替换为 bagonly 侧栏；MaterialRack 本任务先替换为**单柜子侧栏**（duo 三段留 T10）；侧栏挂进官方缩放容器内（§1 实现期决定项：跟随 createViewportFit，若实测抖动再挂外层——在代码注释记录实测结论）。
- [ ] **Step 3: 观察器重挂 + v-if 浮层 hidden**——body 级 MutationObserver（records 过滤：仅宿主容器子树被动到才 `ensureMounted`）；官方运行时浮层（tooltip/拖拽幽灵等）构建期按 build-rail-proto.cjs 的 extras 正则 hidden；`[hidden]{display:none !important}` 规则随 CSS 注入。
- [ ] **Step 4: 校验（Review Focus 4）并提交**——游戏内逐场景开页：rail 出现、官方原背包面板零残留、`gpage` 1536×864（DevTools 量取）；切容器/切柜页面尺寸不变；关闭重开界面、切场景往返、快速开关——控制台零报错、rail 始终在位（0.5s 内自动恢复）；点击穿透正常（Unity 侧能收到点击，官方机器区域如菜谱列表仍可操作）。
```bash
git add SurvivalLog.CabinetEverywhere/railui.page.js SurvivalLog.CabinetEverywhere/RailUi.cs SurvivalLog.CabinetEverywhere/CabinetEverywherePlugin.cs
git commit -m "feat(cerail): 12+1 场景装配（宿主替换/观察器重挂/clickThrough/cfg 门）"
```

### Task 9: 官方联动——切柜伪造与 active 跟随

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（联动区）

**Interfaces:**
- Consumes: tagfilter.page.js 的 `forgeSwitch`/`detectC`/族别判定逻辑（按附录 A 十页对照表**复制**进 railui.page.js，勿引用 `__SLTF__`——两文件生命周期独立）；Root→iframe postMessage 包装模式（wrapRelay，只读）。
- Produces: `forgeSwitchTo(ownerId)`（rail 切柜→以页面同款事件伪造官方切换，负载类型逐页照抄：bag=数字/trade=字符串/其余=TAB_SWITCH 下标）；`onActiveChanged(ownerId)`（官方 active 变化→更新 `st.currentId` 并重渲染）；postMessage 包装链（保留前一引用并调用，与 `__SLTF__` 共存）。

- [ ] **Step 1: 双向跟随**——rail 页签/菜单切换 → `forgeSwitchTo`；A/D 步进或页面自身切 bag → 拦截到 active 字段变化 → rail 跟随（`hasActive` 字段清单照附录 A：bagOwnerId/bagOwnerKey/activeLeftTab/activeTab）。
- [ ] **Step 2: 验证并提交**——游戏内：rail 切到柜 X 后点菜谱「填装」取料来自 X（工作台自动取料链跟随）；A/D 切柜 rail 高亮同步；交易页（attr 制）无错位；与 `__SLTF__` 共存无双重拦截（两包装链都放行）。
```bash
git add SurvivalLog.CabinetEverywhere/railui.page.js
git commit -m "feat(cerail): 官方联动（切柜伪造/active 跟随/postMessage 包装链共存）"
```

### Task 10: 整理柜双面板（.sr-duo 三段一体）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（BAGPANEL + 转移列区）
- Test: harness rack 场景 + 游戏内 MaterialRack

**Interfaces:**
- Consumes: T5 cmd 契约（put/takeAll/putAll/takeCat/putCat/putTag）；T3 `renderBagPanel()`。
- Produces: `renderDuo()`（左 `BAGPANEL_HTML` 渲染 + 中官方五按钮静态模板 + 右主侧栏，`renderBagPanel()` 含按标签色点随 `st.currentId` 联动）；`refreshAll()`（主侧栏任何渲染连带刷背包面板）。

- [ ] **Step 1: 三段装配**——rack 场景宿主替换为 `.sr-duo`（左背包面板/中 `.transfer-controls` 五按钮/右柜子侧栏）；五按钮标记照搬官方静态模板（v12 定版五按钮 + 下拉 wrapper 结构），样式用页面自带 `.transfer-btn`；BackpackUI 独有样式已在 railui.css。
- [ ] **Step 2: 交互接驳**——左面板右键=cmd put 1 件、Shift=整堆；五按钮 → cmd takeAll/putAll/takeCat/putCat/putTag；分类下拉选项=对应容器实际存在分类（`catsOf` 同义，按 icfg.catId 汇总）；下拉点外/Esc 收起（豁免 wrapper）；柜子无标签 → putTag 前 toast 拒绝；满则整叠跳过计数（结果 toast 由 C# 执行结果驱动，JS 从下轮 push 的数据差量生成文案——复用 T12 的快照差工具）。
- [ ] **Step 3: 联动与验证并提交**——切柜后色点/下拉语义跟随（v12 第三连修回归点）；转移后三段同步刷新；harness rack 场景全流程可走（mock 命令日志核对）；游戏内复跑 v12 实测场景：分类放入（食材）/分类取出（菜品）/按标签放入（切柜语义跟随）/全部取出清柜。
```bash
git add SurvivalLog.CabinetEverywhere/railui.page.js SurvivalLog.CabinetEverywhere/design-proto/railui-harness.html
git commit -m "feat(cerail): 整理柜自研双面板（左背包/中官方五按钮/右柜子侧栏+联动）"
```

### Task 11: 一键入库（确认弹窗 + storeAll）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（入库区）
- Consumes: T7 `storeAll` 执行器（已实现）；cmd `storeAll` 带 `order`。

- [ ] **Step 1: 确认前置**——背包页专属按钮（rack 场景在左背包面板底部，主侧栏隐藏）；点击弹确认窗（`背包现有 X 件（Y 叠），将按物品分类放入带对应标签的柜子…`，锚底部按钮上方）；背包空直接 toast 不弹窗；**入库按钮加入 document 级关闭监听豁免清单**（v9 踩坑）；确认才 `cmd('storeAll',{order:当前页签顺序})`。
- [ ] **Step 2: 结果渲染**——入库完成后背包显示空格网格（非「没有匹配的物品」文案——容器空 vs 筛空两态，T3 已区分，此处回归）；toast 汇总 `已入库 N 件 → 柜名×n …（M 件留背包）`（JS 从推送数据差量生成）。
- [ ] **Step 3: 验证并提交**——游戏内：分布符合标签匹配、柜满顺延、留背包件数正确；确认弹窗不被同次点击秒关。
```bash
git add SurvivalLog.CabinetEverywhere/railui.page.js
git commit -m "feat(cerail): 一键入库（确认弹窗/页签顺序路由/结果差量 toast）"
```

### Task 12: 一键整理（tidy）

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/railui.page.js`（整理按钮区）
- Consumes: T7 `tidy` 执行器（或 Task 1 降级方案）；快照差工具 `stackCountOf(ownerId)`。

- [ ] **Step 1: 按钮行为**——任意容器可用（页脚动作组，官方 action-btn 同图标）；全库视图隐藏；点击前记录该 owner 叠数快照 → `cmd('tidy',{owner})` → 下轮数据到后差量 toast `已整理：N 叠合并为 M 叠`；若 Task 1 走降级分支：有 SORT_BAG/SORT_BACKPACK 事件的页先 `forgeSwitchTo(owner)` 再伪造页面排序事件，无事件页 toast「本界面暂不支持整理」。
- [ ] **Step 2: 验证并提交**——游戏内：同名叠真实合并（背包内两叠面粉→一叠）；多层叠超 StackLimit 拆留；背包/柜子两侧都试；toast 计数与实际一致。
```bash
git add SurvivalLog.CabinetEverywhere/railui.page.js
git commit -m "feat(cerail): 一键整理（同名叠合并+差量 toast+降级分支）"
```

### Task 13: 旧层门控、发版与文档收尾

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/tagfilter.page.js`（railOn 门）、`SurvivalLog.CabinetEverywhere/TagFilter.cs`（BuildDataJson 追加 railOn 段）、`CabinetEverywherePlugin.cs`（如 T8 未加 cfg 则补）、`SurvivalLog.CabinetEverywhere.csproj`（`<Version>` 1.8.0）、`DESIGN.md`、`CHANGELOG.md`、`UI-SPEC.md`（§8 加一行「正式实现落地」注记）

**Interfaces:**
- Consumes: T8 `RailUi.Enabled`。
- Produces: tagfilter 数据段新增 `railOn:true|false`（C# BuildDataJson 追加；rail 开→true）；tagfilter JS 对 railOn 页跳过隐藏/下拉/A-D 弹回（官方页签已随面板移除，逻辑自然失效，跳过是防其作用于不存在 DOM 报错）。ToolTablePruner **不动**（CabinetTabs 仍驱动自动取料与重算成本，与本功能正交）。

- [ ] **Step 1: 门控实现**——`[Rail] Enable=false` → RailUi 全停（不注入不推数不 drain），tagfilter 回归旧行为；rail 开时旧下拉不出现。
- [ ] **Step 2: 收尾并提交**——版本 1.8.0；CHANGELOG 条目；DESIGN.md 新增 §9「储物侧栏正式实现」（文件表+数据契约 v4+命令通道+红线对照）；UI-SPEC §8 注记。
- [ ] **Step 3: 部署验证**——关游戏 → `dotnet build -c Release` → release.ps1 打包流程跑通（`-PackageOnly`）。
```bash
git add -A
git commit -m "feat(cerail): 旧层门控+版本 1.8.0+文档收尾（DESIGN §9/UI-SPEC §8/CHANGELOG）"
```

### Task 14: 验收——UI-SPEC §7 十一条全绿

**Files:**
- Modify: `SurvivalLog.CabinetEverywhere/design-proto/shots/`（新增实机截图存档）

- [ ] **Step 1: 实机全绿**——逐条跑 §7 清单 1-11（11 场景几何恒定/✎ 与双击/拖拽持久化/标签与排序/设置同步/入口默认与场景构成/动作组/入库/取出放入五按钮/页签恒一行/控制台零报错+逐场景截图）。任何一条不过：回到对应任务修复后重跑，不得带病过版。
- [ ] **Step 2: 截图归档并提交**——按既有命名惯例入 `design-proto/shots/`（每场景 1 张 + 整理柜 2 张 + 入库 1 张）。
```bash
git add SurvivalLog.CabinetEverywhere/design-proto/shots
git commit -m "docs(cerail): 正式实现验收截图归档（§7 十一条全绿）"
```

---

## 明确不做（本计划范围外）

- ToolTablePruner / RefreshCoalescer 行为不变（CabinetTabs 与制作重算治理正交）。
- `[Scenario] View_*` 旧场景视图语义保留给 `[Rail] Enable=false` 回退态；rail 态下被 §4.5 入口默认取代。
- 官方柜名系统写入（`FurnitureCustomName` notify 1191/1193）不用——改名走 mod 侧持久化（与原型语义一致，跟容器走）；官方自定义名若存在则显示层让位 mod 名。
- 拖拽物品进官方机器区（烹饪投料等官方拖拽）不增强不拦截——机器区官方交互原样。
