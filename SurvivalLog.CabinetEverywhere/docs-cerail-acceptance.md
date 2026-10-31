# CERail 验收手册（v1.8.0）——UI-SPEC §7 十一条 + DESIGN §9.7 十一项实机校准

> **文档定位**：本文是 cerail-storage-rail 分支（储物侧栏正式实现，CERail）的**作者实机验收包**。
> 每条给出：操作步骤（具体到点哪个按钮）→ 预期观察 → 不过时回修到哪个任务/机制。
> 逐条打勾，十一条全绿 + 十一项校准过表 = §7 达成，方可发版。
> 静态部分（构建/两测试床 Playwright 全量/解析器基线/内嵌资源核对）已于 T14 收尾跑全绿，
> 终验表见文末附录 A——本文只含**必须开游戏**的部分（红线：游戏 UI 不自动化，人工过）。
>
> **放置说明**：放 mod 根（与 DESIGN.md/UI-SPEC.md 同目录）而非 design-proto/——
> 原型目录是构建资产与测试床；验收是作者文档，引用两份规格的章节即可，不应混进资产目录。

配套：`UI-SPEC.md §7`（十一条原文）、`DESIGN.md §9.7`（校准表原文）、
`design-proto/shots/v1.8.0-acceptance/README.txt`（截图归档命名）。

---

## 0. 部署（先读，含红线）

1. **【红线】先关游戏再复制 dll**——dll 被进程占用复制会失败/装到旧版；且 webview 里
   存量 rail 界面由原生重建清除，重开游戏才能拿到新资源。
2. 复制 `SurvivalLog.CabinetEverywhere/bin/Release/SurvivalLog.CabinetEverywhere.dll`
   → 游戏目录 `BepInEx\plugins\`（覆盖同名）。
3. 开游戏。版本核对：主界面防盗署名气泡/日志含 `1.8.0`（`LogOutput.log` 搜 `Version` 行）。
4. **日志开关**（验收前都打开）：
   `BepInEx\config\com.local.survivallog.cabineteverywhere.cfg` →
   ```ini
   [Debug]
   Verbose = true
   ```
   Verbose 门控两类观测点：C# 推送明细（`[CERail] 推送 rev=… head: …`）与
   命令逐条摘要（`[CERail] cmd <op>: …`）+ 全部 `[CERail][校准]` 行。cfg 热改约 5s 生效。
   C# 日志看 **`BepInEx\LogOutput.log`**（或 BepInEx 控制台窗口）。
5. **JS 控制台（DevTools 远程调试通道）**——suite/docs/06 实证流程：
   - `BepInEx\config\com.local.survivallog.viewportprobe.cfg` → `[DevTools] Enabled = true`
     （ViewportProbe 是不发布的开发探针；没有该 cfg/文件则本项跳过，JS 侧观测退化为
     「界面行为目测」）；
   - 开游戏约 55 秒后，Chrome 打开 `chrome://inspect` → Devices → `localhost:9222` →
     对 **Root Orchestrator** 点 inspect → 得到游戏 UI 完整 DevTools；
   - Console 面板看 JS 日志/报错；要看 iframe 内 DOM 时在 Console 顶部上下文下拉切到对应
     页面 frame（Backpack/Cooking/…）。

---

## 1. UI-SPEC §7 十一条逐条实测

> 每条格式：**步骤 → 预期 → 回修点**。场景进入方式：B 键=背包；对着对应家具/终端互动
> =该界面（烹饪炉→Cooking、酿酒桶→BrewPanel、老鼠笼→RatCage、粉碎机→Shredder、
> 食物压制器→Compressor、颜料桶→DyePanel、温室工程台→GreenhouseBuild、工作台→ToolTable、
> 无人机交易终端→TradeUI（装配键 Trade）、调度机队→DroneHub、整理柜（大型置物架）→MaterialRack）。

### 条 1 · 11 场景几何恒定
> 注意：游戏内页面**没有 `.gpage`**（那是原型自建画布，railui.css 176 行注释原话「游戏内页
> 没有 .gpage，改为全 #srp 生效」）——不要量它，会 null 解引用。拆两半测：
- **步骤①（画布 1536×864）**：任开一 rail 场景，目测页面布局与原生一致、随后在 ▾ 菜单
  切一个柜子、开/关一次容器设置弹窗、把窗口拉小再还原——页面是否始终恒定不抖、不换算。
  有 DevTools 通道时可加量（Console 切到该页 iframe 上下文，粘贴安全、元素缺失也不会抛错）：
  ```js
  (() => { const de = document.documentElement;
    return { iframeViewport: [de.clientWidth, de.clientHeight] }; })()
  ```
  预期输出 `iframeViewport: [1536, 864]`（官方 fit 容器缩放属另一维度，看校准 #4）。
- **步骤②（侧栏 428×816）**：同上下文执行（`#srRail` 真实存在；null 守卫兜底未装配态）：
  ```js
  (() => { const el = document.getElementById('srRail');
    return el ? [el.offsetWidth, el.offsetHeight] : 'srRail 未装配'; })()
  ```
  在 ▾ 菜单切一个柜子后再执行一遍。
- **预期**：①页面恒定不抖；②两次都是 `[428, 816]`，切柜/开关弹窗不变。
- **回修点**：railui.css 几何锁段（!important 块，T2）；「整页缩放不同步/恒定抖动」
  先看 §9.7 校准 #4（缩放挂层）。

### 条 2 · ✎ 与双击
- **步骤**：在任意柜场景：①点一个非背包页签选中它 → 看该页签右缘；②点 ✎；③关掉弹窗，
  双击同一页签；④再点 ▾ 打开菜单，双击菜单里任意一行；⑤按 Esc。
- **预期**：①只有选中页签显示 ✎；②弹窗打开且**容器没被切换**（左侧标题/物品区原样）；
  ③④双击两路同样开弹窗不切容器；⑤Esc 关弹窗。
- **回修点**：railui.page.js bind 区 ✎ 的 `draggable=false`+mousedown stopPropagation 与
  双击合成逻辑（T3/T4）；弹窗本体 T4。

### 条 3 · 拖拽排序生效并持久化
- **步骤**：①页签栏拖一个柜页签到另一位置松手；②关界面重开（或滚轮横滚看顺序）；
  ③换一个场景（如酿酒桶）拖成不同顺序再切回来；④尝试拖「背包」页签。
- **预期**：①顺序即时生效；②重开后顺序保留；③两场景顺序互不干扰
  （localStorage `srp_pin_order_<scene>` 分键）；④背包恒首位、拖不动。
- **回修点**：页签拖拽与持久化（T4/T5，key 表 UI-SPEC §4.9）。

### 条 4 · 标签与排序
- **步骤**：①快捷标签行点 `＋` → 选一个官方标签 → 看 chip 出现与物品区过滤；②点 chip 本体；
  ③点 chip 的 `×`；④连续加标签塞满两行后再加一个；⑤`⇅ 排序` 下拉依次选 6 项并点 `↓/↑`；
  ⑥切 `列表`、`全库`，看列表行副标。
- **预期**：①chip 生效，筛的是**当前柜物品**；②chip 点击=切换筛选；③`×` 移出快捷栏；
  ④toast「快捷标签最多两行，请先移除一个」且拒绝添加；⑤排序 6 项
  （交易价值/保质期/饱食度/生命/精力/心态）+方向翻转生效，交易价值=单价×数量合计；
  ⑥列表=同名汇总行，数量=各叠合计，副标含 `分类 · N 叠 · 最短保质 · 来源`，全库锁列表。
- **回修点**：标签行与 chips（T4）、排序（T5）、全库/来源（T3/T5）。

### 条 5 · 容器设置同步与持久化
- **步骤**：①选柜 → ✎ → 名称改成 4 字新名、勾 2 个官方标签 → 保存；②看标题/页签名/
  ▾ 菜单分组/全库标签过滤；③关界面重开、再重启游戏。
- **预期**：①②四处**全同步**；③两轮都保留（mod 侧 `cerail_names.json` + 官方 SetRule，
  跟容器走；官方自定义名存在时显示层让位 mod 名）。
- **回修点**：rename/setTags（T7 RailCommands；弹窗 UI T4）；标签不生效先过 §9.7 校准 #6。
- **清空=恢复官方名（终审 Important-1 修复后的新路径）**：改名保存后再开 ✎ **清空名称** →
  保存 → 标题/页签恢复官方名，且重启游戏后仍是官方名（清空即发空 rename，C#
  `cerail_names.json` 删覆盖回契约名；旧实现清空静默无效，如复现即回修点在 saveEdit 基准）。

### 条 6 · 入口默认与场景构成（v8-v12）
- **步骤**：①按 B 开单独背包；②开整理柜；③开烹饪等机器界面。
- **预期**：①纯背包页——无柜子页签栏、无全库切换，页面就是单个背包（bagonly）；
  ②自研三段双面板：左优化版背包面板 + 中间官方五按钮转移列 + 右柜子侧栏，
  官方 rack 原版双面板**零残留**（DevTools 查 `#rackSystem` 不在 DOM）；
  ③机器场景默认背包页，柜子页签正常显示。
- **回修点**：SCENES 装配与宿主替换（T8）、双面板（T10）；若官方面板残留→看 §9.7 校准 #1/#9。

### 条 7 · 动作组（v9/v11）
- **步骤**：①看任意场景页脚右下；②在**柜子页**点 `一键整理`；③切到**背包页**看页脚；
  ④点 `📦 一键入库`；⑤切 `全库` 再看页脚。
- **预期**：①页脚右侧恒有动作组（全场景统一，含背包面板）；②整理可用，toast
  `已整理：N 叠合并为 M 叠`（N>M 时）；**分类归位观察**：整理后同名叠合并、物品是否按
  分类聚集排列（食材/菜品/材料…各自成区）——该路依赖官方 SortContainerForHub 排序，
  与 §9.7 校准 #7 同源（叠合并成立但聚集观感异常也记入 #7 判读）；③入库按钮在背包侧显示；
  ④点击**必先弹确认窗**（文案含背包现有件数/叠数），取消/确认两路都通，Esc 可关；
  ⑤全库视图 `一键整理` 隐藏。
- **回修点**：动作组位置与豁免清单（T5/T9）、整理（T12）、入库确认（T11）。

### 条 8 · 一键入库（v8）
- **步骤**：①背包放几类物品（食材/材料/医疗…）并保证有对应标签柜 → 背包页 `📦 一键入库`
  → 核对确认窗数字 → 确认；②把某个标签柜塞满再入库一次；③入库完看背包网格。
- **预期**：①分布符合「物品分类名↔柜标签名」匹配、页签顺序优先；toast
  `已入库 N 件 → 柜名×n · …`（留背包时追加 `；M 件无匹配柜或柜已满，留在背包`）；
  ②柜满**顺延**下一个同标签柜；③背包显示**空格补位网格**（不是「没有匹配的物品」空态文案）。
  另核对（OpStoreAll 注释 T14 项）：材料架等官方类型限制由官方 TryQuickMoveItems 自行兜底，
  顺延路由的观感自然（食物进不了材料架时留在背包/进同标签柜，无报错）。
- **回修点**：JS 侧 order/差量 toast（T11）、C# 侧 OpStoreAll 路由（T7 RailCommands §9.4）。

### 条 9 · 取出/放入（v8-v12）
- **步骤**：①柜子网格与列表各做一次：右键、Shift+右键（列表行=整行）；②整理柜左背包面板
  物品右键、Shift+右键；③五按钮逐个：`◀全部取出`、`放入▶`、`◀分类取出`（下拉选分类）、
  `分类放入▶`（下拉）、`按标签放入▶`；④切右侧柜子看按标签放入按钮上方色点；⑤对一个
  **无标签柜**点按标签放入；⑥用满背包/满柜/无命中物品各触发一次；⑦列表模式看汇总行。
- **预期**：①右键=取 1 件并入背包同类叠（不占新格），Shift=整堆/整行；②左面板右键=放入
  右侧当前柜 1 件、Shift=整堆；③五按钮全部可用，整叠批量、满则整叠跳过计数；
  ④色点=当前柜官方标签前三+more，**随切柜联动**；⑤toast `X 未设置标签` 且**零命令**
  （柜侧栏 ▾ 可复核该柜无标签）；⑥四路兜底 toast：`背包已满`/`X 已满`/`背包里没有命中「cat」
  的物品`/`柜子里没有cat`；⑦汇总=各叠合计。
- **回修点**：右键落点与页签口径（T9）、双面板与五按钮（T10）、命令层各 op（T7）；
  数字不对先看 Verbose `[CERail] cmd take/put/…` 行对账。

### 条 10 · 页签恒一行（v9/v10）
- **步骤**：造一个柜名很长的场景（✎ 改名 8 字 × 多个柜）打开任意 bag 族场景；滚页签区。
- **预期**：所有页签文字完整（无 CSS 省略号），**恒一行横向滚动**、绝不换行；物品区高度
  不受滚动条影响（滚动条隐藏）；拖拽排序仍可用。
- **回修点**：页签 CSS 一行滚动段（T5 railui.css）、tt 族页签 edge 落点（T9 round1）。

### 条 11 · 控制台零报错 + 逐场景截图
- **步骤**：DevTools Console 清空 → 按顺序开全 12 场景（BackpackUI/MaterialRack/Cooking/
  BrewPanel/RatCage/Shredder/Compressor/DyePanel/GreenhouseBuild/ToolTable/Trade/DroneHub；
  无人机交易场景的装配键为 **Trade**（非 TradeUI，railui.page.js SCENES 键名；iframe 上下文
  切换/日志过滤时按此键搜）），每场景做一次页签切换+右键+五按钮（整理柜）；同时 BepInEx
  `LogOutput.log` 过一遍。
- **预期**：Console **0 error（红字）0 未捕获异常**；LogOutput.log 无 `[CERail]` 级 LogWarning
  （**预期路除外**——白名单丢弃/降级文案等，见第 3 节边界清单；出现即按关键字定位）；
  每场景截图按 `design-proto/shots/v1.8.0-acceptance/README.txt` 命名归档并人工过目。
- **回修点**：按报错栈定位——五页机器功能区冻结/TypeError → §9.7 校准 #9（stubs，T8/T9）；
  Trade 列被级联摘毁 → `:first-child` 宿主选择器（T8 评审 Critical）；其余按
  DESIGN §9.2 文件表归任务。

---

## 2. DESIGN §9.7 十一项实机校准（操作 → 日志关键字 → 判读/翻法）

> **观测总备**：Verbose=true（C# 日志）+ DevTools 通道（JS Console），见第 0 节。
> 「BepInEx」= `BepInEx\LogOutput.log` 搜关键字；「Console」= DevTools Console。

| # | 校准点 | 操作 | 日志关键字 / 看什么 | 判读与翻法 |
|---|---|---|---|---|
| 1 | Backpack/MaterialRack iframe id | 开背包页、整理柜各一次（首装必打） | Console：`[CERail] scene mounted: <键> (iframe#<id>…)` | 键=BackpackUI/MaterialRack 即成立（'Backpack' 会带「别名归一」尾注）；实测既非 'BackpackUI' 亦非 'Backpack' → 回填 railui.page.js `SCENES`/`ID_ALIAS`（各一行） |
| 2 | PlayerBagOwnerId 兜底链 | Verbose 开 → 进任意 bag 族 rail 场景 | BepInEx：`[CERail] 背包 owner：活动页 … PlayerBagOwnerId=…`；缺直读时 `…兜底：State_Data_Player.PlayerId=…`；每会话一次 `[CERail][校准] 背包 owner=… PlayerId=… BagCache 键数=…` | 直读值==PlayerId → 8 页直读假设成立；不等/缺字段 → 会话缓存为唯一兜底（代码顺序已如此，无需改动），记录即可 |
| 3 | TimeLeft 单位 | 背包放一件可腐坏食物，Console 钩一包数据（见下方代码） | items 行第 4 列 timeLeftSec 样本值 | 出现 7200 类值（=2 小时）→ 单位=秒成立；若量级对不上现实小时数（如 2 显示成 7200 的倒数）→ 实为小时，改 RailData.cs ItemFlags 常量与注释（各一行） |
| 4 | 缩放挂层 | 把游戏窗口拉小，开烹饪/无人机交易（官方整页缩放页），看 rail 是否随官方 zoom、有无恒定抖动 | 目测 + Console `getComputedStyle(document.getElementById('srp').parentElement).zoom` | rail 跟随缩放、无持续抖动 → 挂层成立；恒定抖动 → wrap 改挂 zoom 容器外层（mount 处注释已留改法，一处改动） |
| 5 | VD_MAP 四物核对 | 背包同时放：面包、急救绷带、西瓜汁(完美)、咖啡 | BepInEx：`[CERail][校准] VD_MAP 四物对照（期望 面包[20,3,0,0,0]/绷带[0,0,0,0,20]/西瓜汁[102,51,0,0,9]/咖啡[0,5,20,0,0]…）：…`（每会话一次，四物齐才打） | 逐项对照实际 v1..v5 与期望（有 InstanceVD 的实例以 Config 值出）；不符 → 改 RailData.cs VD_MAP 顺序 |
| 6 | SetRule TryCast 门（+putTag 读通道） | ✎ 给柜勾标签保存；随后对该柜点「按标签放入」 | BepInEx：`[CERail] cmd setTags: owner=… tags=[…] → kept=N dropped=… ok=True`；`[CERail] cmd putTag: to=… tags=[…] batch=N moved=N` | `ok=True` → TryCast 门成立；转换失败会有 `setTags:cast` 警告 → 翻 `set_TagIds` 直写（OpSetTags 注释留备选）。`moved>0` → putTag 读 TagIds 同通道读取路成立（GetRule 语义并入本项一并验）；moved=0 且背包确有命中 → 查读取路 |
| 7 | SortContainerForHub 合并实效 | 柜里放两叠**同名**物品 → 一键整理 | 界面：叠数是否减少 + toast `已整理：N 叠合并为 M 叠`；Verbose `[CERail] cmd tidy: owner=… sort+merge 已调` | 叠数减少=路线成立；调用成功但叠数不变 → 把 OpTidy 改置失败标记（RailCommands.cs 注释 ③，一行改动），JS 降级 toast「本界面暂不支持整理」已就位（T12） |
| 8 | silent 参数 | 做一次五按钮批量转移 | 界面：官方页面有无官方 toast；结果数字是否由 rail 差量 toast 给出 | 无官方 toast、rail toast 数字正确 → SilentQuickMove=true 生效；实机更期望官方 toast UX → RailCommands.cs `SilentQuickMove` 常量翻 false |
| 9 | 五页桩+StatusMsg 零异常 | 依次开 压制器/粉碎机/温室工程台/整理柜/工作台，各做一次官方操作（投料/切换/等状态推送） | Console：无 TypeError；官方功能区（按钮/权重条/提示文字）正常刷新不冻结 | 全程零异常=桩清单成立；游戏改版后页面按 railui.page.js `buildStubs` 注释流程复扫 SCENES.stubs（不写死页名，声明驱动） |
| 10 | XFER 竞态观察 | 整理柜连点 `◀全部取出`/`放入▶` 多次；右键连点 | 界面：每次 toast 是否末次命令口径、数据最终一致 | 在途恒一笔（后发覆盖前发）+单场景活跃=装配语义，静待最终态即可；连点观感差（中间态闪错）→ 复核 settleXfer 单飞/快照差裁定（T10） |
| 11 | OpTidy 白名单丢弃路 | 制造非白名单 tidy 触发面（柜子拆掉后的残留入口等）→ 触发整理 | BepInEx：`[CERail] tidy 丢弃：owner=… 不在白名单（红线2）`；界面：降级 toast，无异常 | 整条丢弃+LogWarning=红线 2 生效；核对触发面范围与日志可读性，若日志刷屏严重再议 WarnOnce 化（T7） |

**校准 #3 的 Console 钩子代码**（粘到 Console 执行一次即可，后续每包打印样本）：

```js
(() => { const o = __CERAIL__.setData.bind(__CERAIL__);
  __CERAIL__.setData = (json) => {
    try { const bag = (json.items||{})[json.bag]||[];
      console.log('timeLeftSec 样本:', bag.map(r=>r[3]).filter(v=>v>0).slice(0,5)); } catch(e){}
    return o(json); }; })();
```

---

## 3. 已知 best-effort 边界（收拢自 T1-T13 任务报告；实机遇到先对照，不算 bug）

1. **XFER 在途恒一笔**（T10）：后发命令覆盖前发——连点五按钮/右键时，toast 按**末次命令**
   快照差生成，中间态不逐笔 toast；数据最终一致。
2. **非命令回推包落在 arm 与 settle 之间**（T10/T11）：按差量出 toast——同一 best-effort
   口径，storeAll/tidy 同类继承；观察观感即可。
3. **结果 toast 恒走主侧栏**（T11/T12）：整理柜双面板下，sb（左面板）入口的 storeAll/tidy
   结果 toast 也显示在右侧主侧栏（proto v11/v12 定稿「两段同屏」）；观感不佳改 sbToast
   分流（一行改动，不改数据路）。
4. **宿主复活窗口**（T8/T10）：官方页面整树重建（换父容器）会先摘 rail 再重装配——
   实测重装配 3~21ms，肉眼是「闪一下」，属预期；500ms interval 兜底保证 ≤500ms 恢复。
5. **缩放挂层**（T8 裁定 5）：wrap 挂宿主原位=官方 zoom 容器内，侧栏天然跟随；
   恒定抖动才翻外层（校准 #4）。
6. **SortContainerForHub 合并实效静态不可证**（T7/T12）：调用成功≠实测合并，校准 #7
   定案；降级路（失败标记→降级 toast）已就位且不误报成功、标志不闩死。
7. **OpTidy 白名单丢弃路**（T7）：非白名单 owner（柜拆掉后的残留入口等）整条丢弃+LogWarning，
   界面侧降级 toast——触发面与日志观感校准 #11。
8. **tagfilter railOn 让位**（T13）：rail 开=12 页全让位（旧筛选/场景视图不作用）；
   cfg `[Rail] Enable` 热翻 false → 下一 5s 数据包起旧行为完全恢复（回退态），无需重开界面。
9. **harness mock 保真度**（T10 备注）：测试床 cap 按「叠数<cap」近似（真实 C# 按格占用），
   截图中满柜 railFill 可能显示『9 / 6 格』——只影响测试床观感，不影响断言与实机。
10. **toast 归因**（T12）：settleXfer 每包只走一次（消费即置 false），同包/重推不重复
    toast；失败标志不闩死，下一包起正常差量。
11. **材料架伪标签不入路由**（T7 OpStoreAll 注释）：TagIds 只含官方标签，材料架官方类型
    限制由 TryQuickMoveItems 自行兜底——条 8 的附核项。

---

## 4. 截图归档（§7 条 11 收尾）

按 `design-proto/shots/v1.8.0-acceptance/README.txt` 命名归档：**12 场景各 1 张 +
整理柜加 2 张 + 一键入库 1 张 = 15 张**，目录已预置。截图时页面先 scrollTo(0,0)
（UI-SPEC §4.10 教训：别截到滚动后的偏移态）。

---

## 附录 A · T14 静态终验表（2026-10-30 实跑记录，全绿）

| 套件 | 床 | 结果 |
|---|---|---|
| `dotnet build -c Release`（DOTNET_MULTILEVEL_LOOKUP=0 官方 sdk） | — | 0 错 0 警告 |
| `tools/railjson-test`（dotnet run -c Release） | C# 解析器基线 | **13/13 PASS** |
| `node --check railui.page.js` / `tagfilter.page.js` | 内嵌资源纪律 | 双过 |
| t8-root-harness（tmp-t8） | Root 床真装配 | **130/130** |
| t8-old-harness（tmp-t8） | 旧床回归 | **15/15** |
| t8 alias-check（tmp-t8） | ID_ALIAS 别名路 | **5/5** |
| t8 coexist-check（tmp-t8） | __SLTF__/__CERAIL__ 共存 | **3/3** |
| t9-root-harness（tmp-t9） | 官方联动/包装链 | **30/30** |
| t9-coexist（tmp-t9，真 tagfilter.page.js 共存） | 包装链共存+跟随 | **5/5** |
| t11-old-harness（tmp-t11） | 一键入库全流程 | **32/32** |
| t11-root-harness（tmp-t11） | 入库真装配路 | **22/22** |
| t12-old-harness（tmp-t12） | 一键整理全流程 | **32/32** |
| t12-root-harness（tmp-t12） | 整理真装配路 | **19/19** |
| t11-regression-old / -root（tmp-t12） | T10 双面板回归组 | **32/32 + 22/22** |
| t13-railon-gate（tmp-t13） | railOn 让位门基线/让位/回退 | **15/15** |
| dd_regression_test.js（suite/tools） | 自绘下拉几何 | **12/12** |
| **合计** | | **374 断言 + 13 解析器 = 387，0 失败，全部 0 控制台错误** |

> 说明：T10（双面板/五按钮/快照差）无独立驱动脚本——其验证面已并入 t8-root rack 场景组与
> t11/t12 各组随行断言（T11 报告 §3 即按 t8/t9 回归+自有组口径），上表 t11-regression
> 两行即 T10 面回归。dll 内嵌资源核对：manifest 三资源与磁盘文件**逐字节等长**
> （tagfilter.page.js 64,894 / railui.page.js 142,928 / railui.css 18,210）。
