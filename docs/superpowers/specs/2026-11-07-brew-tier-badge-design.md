# 酿酒桶界面 酒品品质角标 + 饱腹排序收敛（Brew Tier Badge）设计

日期：2026-11-07
状态：已实施（2026-11-07，brew-tier-badge 分支；harness-brew-tier 27/27；待实机验收——§7 清单与聚合公式一步验证未跑）
视觉基准：原型 v14（`design-proto/`，七轮实机断言+AI 读图核验；截图 `design-proto/shots/v14-01…07`）

## 1. 意图与为什么

酿酒桶发酵产物的品质（劣质/普通/烈性）由桶内全部原料的**心态密度**决定，但玩家在装料时
只能进酿酒桶界面看整桶刻度，无法在整理物资时预判「这件原料会酿出什么」。

本设计把品质预判前移到**酿酒桶界面的储物侧栏**：排序菜单收敛为「默认 / 饱腹度」两项，
选饱腹度后每个物品格右上角显示 **饱腹数值 + 品质色角标**，并按品质主键排序
（烈→普→劣，同品质内饱腹高在前）——装料决策一站完成。

**作者底线（最高优先级约束）**：只改酿酒桶（BrewPanel）一页的排序按钮、排序规则、
物品角标显示三处；**其他 11 个界面的观感与行为一个字节不变**；官方 DOM/监听零触碰
（§0 红线照旧，角标=壳层 overlay）。

## 2. 品质机制（游戏侧实证）

- 游戏侧 `BrewPanelData` 携带 `TotalSatiety / MoodDensity / TierIndex / TierP1 / TierP2`，
  加减原料即重算并经 `WebUI_Brew_StateMsg` 推给界面。
- 酿酒桶自带品质条（gamekb `webui/UI/BrewPanel/BrewPanel.html` L319-329）：
  `moodDensity` 对 P1/P2 三段——**< P1 劣质 / P1~P2 普通 / ≥ P2 烈性**；
  三档色 `TIER_COLOR = ['#9dc47f','#e8b04b','#e0899b']`（劣绿/普黄/烈粉）。
- 阈值来源 `GameCore.HotUpdate.GameKey.GlobalSetting_Brew_TierMoodDensityP1/P2`
  （运行时读；界面兜底默认 P1=0、P2=0.5）。
- 原料判定=物品级 `Config_Item.CanBrew`（全表 190 件，Category 全为 1=食物；
  心态密度=心态/饱腹，分布：负 40 件 / 0~0.5 125 件 / ≥0.5 25 件）。
  **禁止从 Category==1 推导 CanBrew**（与燃油页 Burnable 同纪律：官方判定是物品级标志）。
- 角标口径=**单件心态密度** `s2/s1`（RailSortMath 实例+天赋口径，与饱腹数值角标同源）。
  桶内聚合公式（Σ心态/Σ饱腹 假设）实机一步验证（计划 T0）——单件口径不受其影响。

## 3. 目标 / 非目标 / 反目标

**目标**
- BrewPanel 页排序菜单只出两项：`⊞默认` / `🍗饱腹度`
- 选饱腹度后：可酿物品格右上角 = 饱腹数值（原位原色）+ 正下方品质单字角标
  （劣/普/烈，游戏三档色）；不可酿物品只有饱腹数值（无值=「-」，照旧）
- 排序规则（仅 BrewPanel+饱腹序）：品质主键 烈→普→劣→不可酿垫底；同品质内饱腹高在前
- 默认序=零角标、零重排（与现状一致）
- 选饱腹度 toast：`已按「饱腹度」排序 · 烈→普→劣 · 同品质按饱腹值从高到低`

**非目标（本次不做）**
- 其他 5 个可排序页（Cooking/RatCage/Compressor/Trade/DroneHub）的菜单/排序/角标任何变化
- 悬停详情条加品质行（机器页 plain 侧栏无悬停条——原型里的悬停演示不随行）
- 酿酒桶右侧官方发酵面板、料仓、品质条的任何改动
- NB 侧（BackpackUI/整理物资袋面板）排序与角标的任何改动

**反目标（做了即失败）**
- 其他界面推送形状变化（icfg 尾列只允许 BrewPanel 页出现——fuelCols 同约束）
- 动官方格 DOM/监听；角标层之外的任何官方元素写入
- 从 Category 推导 CanBrew

## 4. 方案选型

| 方案 | 内容 | 取舍 | 判定 |
|---|---|---|---|
| A（选定） | icfg 尾列 `canBrew`（BrewPanel 页专属，fuelCols 同款）+ ctx 直推 P1/P2 + JS 算 tier | 复用两条现成契约先例（uniformWidth/fuelCols）；C# 每行只多读一个 bool；其他页零变化 | ✅ |
| B | 契约 items 行尾加 canBrew | 物品级重复（同 cfg 每叠重复带）；行形状变长影响所有页解析 | ❌ |
| C | JS 侧按 icfg 现有字段推导（catId/subCatId） | 违反「物品级标志禁止分类推导」纪律（Burnable 实锤先例） | ❌ |
| D | C# 算好 tier 整数随行推 | 排序键与角标都吃 tier，但 C# 侧多一套排序口径副本；JS 已有 s1/s2 与比较器，tier 纯派生 | ❌ |

排序比较器：在 `dispApply` 现有单键比较器前加 BrewPanel+sat 分支（tier 主键、s1 次键），
不动通用路径（其他页走原比较器逐字节不变）。

## 5. 实现设计（4 文件，全部 BrewPanel 门控）

### 5.1 C# `RailData.cs`
- `BuildIcfgRow` 增加 `brewCols` 尾列（`fuelCols` 同款三处接线）：
  `bool canBrew = ic.CanBrew`（try/catch 缺省 false → `0`）；
  出包判据 `sc?.Page == "BrewPanel"`。
- ctx 增补（`uniformWidth` 先例同点位）：
  `"brewP1":F(GameKey.GlobalSetting_Brew_TierMoodDensityP1),"brewP2":F(...P2)`
  （try/catch，缺省 0/0.5；`!(P2>P1)` 时 JS 兜底 0/0.5——与官方界面同守卫）。

### 5.2 JS `railui.page.js`
- **菜单**：`makeSortMenu` 的 `renderPop/labelOf` 支持 `cfg.keys` 为函数
  （`typeof keys==='function'?keys():keys`，向后兼容数组）；`menuFoot` 实例传
  `keys: function(){ return st.scene==='BrewPanel' ? FSORTS.filter(仅 official+sat) : FSORTS; }`
  （BrewPanel 项 label 显示「饱腹度」）。
- **tier 计算**：`brewTierOf(row)` = `ICFG[row.cfg].bw ? 三档(s2/s1 vs ctx.brewP1/P2) : -1`；
  `normIcfg` 增 `bw: r[15]||0`（其他页 r[15] 缺失=0，天然隔离）；
  `dispRows` 行增 `cfg`（join 行已有 cfg，透传）。
- **排序**：`dispApply` 比较器头部加分支：`key==='sat' && st.scene==='BrewPanel'` 时
  先比 `brewTierOf`（null→-1 排尾）再比 s1；其余页原路径不动。
- **角标**：`makeBadgeLayer` 绘制处——spec.k==='sat' 且 BrewPanel 且 tier≥0 时，
  `<i>` 内容追加 `<span class="sr-tier" style="color:TIER_COLOR[tier]">劣|普|烈</span>`；
  TIER_TXT/TIER_COLOR 常量（游戏同源色）+ ctx.brewP1/P2 读取（store.ctx）。

### 5.3 CSS `railui.css`
- `#srp #srBadgeLayer i .sr-tier{display:block;…}`：垫在数值正下方
  （同底衬 rgba(0,0,0,.80)、font-size 9px、line-height 12px、右对齐随父 `<i>` translate）。

### 5.4 原型 `design-proto/rail.js`（已随本设计同步定稿，v14）
- 供后续对照，不再改动。

### 隔离论证（反目标逐条）
- 其他 11 页：icfg 行无尾列（r[15] 缺失）、ctx 新字段无人消费、菜单 keys 函数返回原
  FSORTS 七项、比较器分支条件不命中、badgeSpec 不变——推送形状与行为逐字节不变。
- BrewPanel 页内：默认序路径（dispRestore/badgeSpec null）零改动。

## 6. 交给实现者的既有事实
- 页面键 `BrewPanel`；`SORT_KEYS`/`PLAIN_KEYS`（railui.page.js L121-122）。
- 角标层 `#srBadgeLayer` z-index 50（十三批教训：低于官方格 z-index:10 会被盖）。
- join 行下标直配（v1.8.5④）；官方重渲染 MO 回调重算角标链路现成。
- GameKey 读法先例：RailData.cs L744（NearExpiry）；fuelCols 先例：L474/L521。
- 红线：回调内禁止改游戏数据；命令批量 ≤8 条/帧（本设计零命令、纯显示层）。

## 7. 验收
1. BrewPanel：菜单两项；选饱腹度 → 可酿格双层角标（数值+品质色字），顺序
   烈→普→劣→不可酿、同品质饱腹降序；默认序无角标。
2. 对照五页（Cooking/RatCage/Compressor/Trade/DroneHub）：菜单仍 7 项、选各维角标/排序
   与改前一致；harness 四路回归基线绿。
3. 官方发酵面板/料仓/品质条逐像素未动；官方格 DOM 零写入。
4. 实机：阈值非默认值时三档分布跟随（P1/P2 从 GameKey 实读）。
