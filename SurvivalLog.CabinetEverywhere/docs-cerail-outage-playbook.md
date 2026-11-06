# CERail 断流排查手册（Outage Playbook）

> 建档：2026-11-05 八追。断流类问题（排序钮丢/侧栏死/按钮在但功能废/重开无效重启才好）
> 的**现场操作手册+结论档案**。核心教训：这类问题概率性复现，「重启后没复现」不构成
> 修复证据；四~七追的反复=观测盲区下盲修。下次复现**先读本手册第 4 节，保持现场取证，
> 不要重启**。

---

## 1. 一页结论：按钮为什么会丢（因果链·终案）

排序钮（页脚 `#srFoodSort` 等）初始 `hidden`，**唯一点亮路径**：
`setData 包到达 JS → store.ctx 落地 → render() 跑到显隐赋值`（railui.page.js render 首段
`el.srFoodSort.hidden = !isSortScene()`）。断流 = 包未落地 = render 不跑 = 按钮保持隐藏。

```
根因层（终案·CDP 字节级实锤）BuildJson 两处非法 JSON：
  ① tradePrefs：Escape 双重包装引号（""食物""）+ 需求条目缺席时前导逗号悬空（[,）
     → 旧直推路径=整段 setData 脚本 JS 语法错误 → WebView 静默丢弃该脚本
  ② lib：行尾+行首双分隔逗号（,,）→ 旧路径=合法 JS 数组空洞（隐匿无害）
     → 分片路径 JSON.parse 严格拒绝（部署当晚把它从隐匿变显性）
    触发条件=当日交易带 prefs（交易需求按日轮换）=「概率性复现」「重启才好」的全部来源；
    BuildJson 全页面无条件携带 tradePrefs=「除背包（官方原生自足）外全界面失效」
                         │
故障层（为什么持续）  ① C# 门②（page 未变且签名未变）不重推——无新包尝试
                    ② 旧心跳只覆盖「ctx 空」；首包到过后的陈旧态静默（八追已补）
                    ③ 无任何日志：语法错误的脚本死在 WebView 里，BepInEx 侧零痕迹
                         │
症状层（你看到的）  · ctx 恒空    → 排序钮全隐、侧栏裸骨架
                    · ctx 陈旧    → 按钮亮但功能死（命令打旧 owner）→「背包是空的」toast
                    · 纯 C# 子系统（页签注入/TabGate/柜宽）不受影响 → 「mod 部分活着」错位感
                    · 微包（探针/drain ~40B）恒为合法脚本恒达 → 「通道是通的」假象
```

**「大包丢弃/单参重载静默丢弃/到达延迟波动」三个历史定性均为本内容 bug 的衍生观测**
（trade 状态好=包合法=通；坏=语法错误=零到达；好坏随日轮换交替=「时好时坏」）。
**为什么历次修复「好了又复发」**：四~七追都在通道层修（ping/双通道/微包回执），没有碰
过内容层；修复后 trade 轮换到无 prefs 状态=「好了」，轮换回来=「复发」。八追终案=
修 BuildJson 两处 + JSON.parse 严格校验（内容坏=显式失败）+ 护栏告警 + 陈旧心跳自愈。

## 2. 证据边界：已实证 / 未定案

| # | 命题 | 状态 | 证据 |
|---|------|------|------|
| 1 | 断流窗口内大包不达、微包全通 | **实证→已重定性** | 六追 CDP：setData 钩 0 次/drain 2/s；八追 CDP 抓失败原文 65010B 定案：大包不是"不达"而是**内容非法（JS 语法错误）被执行端丢弃**；微包恒为合法脚本恒达 |
| 2 | 纯 C# 子系统断流窗口内正常 | **实证** | 2026-11-05 会话：TabInjector 注入颜料桶页签成功、SizeEngine/TabGate 照常 |
| 3 | 陈旧态心跳静默 | **实证（代码逻辑）** | 旧心跳 `if (!el.rail \|\| store.ctx) return;`——ctx 非空即静音（八追已补 >60s 无新包判据） |
| 4 | cfg 运行中改文件不生效 | **实证** | DumpFurniture/Verbose 双探针零触发（BepInEx 不监听 cfg 外部修改；旧注释「5 秒生效」已修正） |
| 5 | 按钮丢失的**直接原因**=包未落地→render 未跑 | **实证** | render 首行早退门 + 症状完全吻合 + 恢复瞬间按钮即亮 |
| 6 | 大包丢弃的底层机理 | **已结案（推翻）** | 不存在"大包丢弃"：字节级证据=tradePrefs/lib 两处拼装 bug 产非法 JSON。八追护栏（`,,`/`[,` 告警）+ JSON.parse 严格校验兜住未来同类 |
| 7 | 「JS 渲染异常假尸」路是否参与 | **基本排除（本案）** | 失败会话 JS 一直活着（toast/console 均响应、drain 返回正常）；控制台转发+CDP 保留为常开观测 |
| 8 | WebView2 ExecuteScript 异步无序执行 | **未证伪·未证实** | 部署版失败 100% 源于内容损坏，乱序未观测到；pid 高水位分片作为防御性设计保留（400 轮模拟覆盖）。设计教训仍然成立：**别依赖脚本执行顺序** |

## 3. 八追装了哪些仪表（下次直接读）

| 仪表 | 日志签名（BepInEx LogOutput.log） | 含义 |
|------|------|------|
| 回执看门狗 | `[CERail] 推送回执缺口 N（已发 X/回执 Y，距最近回执 Zs）` | 通道丢弃态**正在发生**（缺口≥6 且 >10s 无回执）；随后每 10s 一条+强制重推；`推送回执恢复（缺口归零）` = 断流窗口闭合，起止时间可直接读出 |
| 心跳可见化 | `[CERail] 心跳 ping 执行（JS 侧数据饥饿或陈旧>60s…）` | JS 活着且发现数据饥饿/陈旧（30s 限频）。持续刷 = 重推一直没落地 |
| 控制台转发 | `[CERail][JS:Warning/Error] <消息>（<源>:<行>）` | JS 侧异常（含 `render 失败(兜底不炸通道)` / `分片重组失败`）——假尸路的直接证据 |
| 分片重组 | `分片重组失败（丢片/乱序…）`（控制台转发可见） | 分片也丢（=通道级死，不是大包专属）——升级信号 |
| CDP 口 | 启动行 `[CERail] WebView2 远程调试端口已附加 --remote-debugging-port=9222` | cfg [Rail] RemoteDebugPort>0 时；排查期保持 9222，稳定后改回 0 |

## 4. 复现现场操作（**不要重启！不要关界面！**）

1. **抓日志**：复制 `BepInEx/LogOutput.log`（含看门狗/心跳/JS 转发签名，起止时间可量化）。
2. **连现场**：浏览器开 `http://127.0.0.1:9222/json`（RemoteDebugPort 已配 9222；若该行
   没出现在启动日志=cfg 没生效，改 cfg 后需重启游戏才有——那就只走第 1 步）。
3. 找到游戏主页面 target（通常名为游戏页/长 URL 那条），DevTools 连接，Console 里执行：

```js
// 一把梭现场快照（Root 文档执行；结果连同 console 报错一并截图/复制）
JSON.stringify({
  cerail: !!window.__CERAIL__,
  ver: window.__CERAIL__ && 'ok',
  ppCount: window.__CERAIL__ && window.__CERAIL__._ppCount,   // 心跳微包到达数
  pcBuf: window.__CERAIL__ && !!window.__CERAIL__._pcBuf,     // 分片缓冲滞留=有片没到齐
  store: window.__CERAIL__ && (function(){ try { return { rev: __CERAIL__.state ? 1:0 } } catch(e){ return 'no-state' } })(),
  iframes: document.querySelectorAll('#iframe-container iframe').length,
})
```
   再进故障页 iframe（DevTools 上下文切换到该 frame）读：
   `!!document.getElementById('srRail')`（rail 在不在）、
   `document.getElementById('srFoodSort') && document.getElementById('srFoodSort').hidden`（按钮节点在+hidden 态）。
4. **判读表**：

| ppCount | 回执缺口日志 | rail 在? | 结论 |
|---|---|---|---|
| 涨 | 无 | 在 | 心跳通+分片通=新版本不该有此态；若按钮仍丢→**新机理**，把快照发我 |
| 涨 | 无 | 在 | （补充：若同时控制台有 `分片重组失败（齐片仍解析失败）`——契约 JSON 兼容问题，非通道问题，报我） |
| 涨 | 持续告警 | 在 | 分片也在丢（通道级死）→ §2#6 升级：考虑 PostMessage/接管层方案 |
| 0 | 持续告警 | 在 | JS 整尸（连微包都不执行）→ WebView2 renderer 挂起，查游戏日志崩溃段 |
| 涨 | 无 | 不在 | 不是断流，是挂载竞态（rebind/mount 路）→ 快照 FRAMES/宿主节点给我 |
| — | — | 在 | console 有 `[CERail] render 失败` 堆栈 → 渲染异常假尸路，堆栈即答案 |

5. 取证完再重启。修复验证期间**每次游玩后扫一眼 LogOutput.log 里 `[CERail]`**——正常态应
   只有启动行+偶发心跳行；出现「回执缺口」告警=抓到现行。

## 5. 验证标准（什么才叫修好）

- ~~重启后没复现~~（无效证据：新实例+概率性）
- ✅ **结构性**：C# 不再发送 >7.5KB 单包（分片后已知丢包条件被消除）
- ✅ **自愈上界**：即便再丢，陈旧心跳 ≤65s 发现 → ping → 重推；「重开无效/重启才好」
  的死局被拆掉（表现为：复现后一分钟内自行恢复，日志留痕）
- ✅ **可观测**：断流再发生时日志留铁证（缺口告警/恢复行/JS 异常），不再盲修
- 长期：连续游玩日志零「回执缺口」告警 + 若干次断流窗口全部自愈 → 结案

## 6. 历史批次速查（假设-证据-结局）

| 批次 | 当时假设 | 结局 |
|------|---------|------|
| 四追（ping 心跳） | 首包 fire-and-forget 丢失 | 修了「ctx 空」态；陈旧态盲区（八追补） |
| 六追（改带回调重载） | 单参重载静默丢弃 | **定性被终案推翻**（无丢弃；坏包=语法错误，与重载无关）；带回调无害保留且成了回执账本地基 |
| 七追（微包回执基建） | 到达延迟波动 | **定性被终案推翻**（"延迟"=坏包好包随交易轮换交替的观测假象）；_pp 回执基建保留 |
| 八追（终案） | ~~大包丢弃~~ → **BuildJson 非法 JSON**（tradePrefs 双引号+悬空逗号=真凶；lib 双分隔=隐匿存量） | 内容层修复+JSON.parse 严格校验+护栏告警+陈旧心跳+分片（防御性）+CDP 门；分片把七轮悬案从静默变显式——**没有这次显式失败，字节级证据抓不到** |

## 7. 涉及文件锚点

- 分片下发：`RailUi.cs` PushIfDue（Chunk=7500）｜分片落地：`railui.page.js` `__CERAIL__.pushChunk`
- 陈旧心跳：`railui.page.js` 心跳块（`lastSetAt`/`hungry`）｜到达记时：`setData` 首段
- 看门狗：`RailUi.cs` PushWatchdog（缺口≥6 且 >10s 无回执）｜账本：PushAck/add_ConsoleMessageLogged
- 控制台转发：`RailUi.cs` HookConsole/OnConsoleMessage（本机 Vuplex 事件=add_ 方法形态）
- CDP 门：`CabinetEverywherePlugin.cs` ApplyRemoteDebugEnv + cfg [Rail] RemoteDebugPort
- 页签补挂根修：`TabInjector.cs` AddMissing（去 s.Injected 门；Trade 页签走白名单官方机制，
  若 Trade 页签栏再丢而 bag×4 不丢 → 白名单/官方重建路，另案）
