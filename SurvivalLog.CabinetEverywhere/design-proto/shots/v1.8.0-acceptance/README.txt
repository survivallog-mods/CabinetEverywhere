v1.8.0 正式实现验收截图归档（cerail-storage-rail / CERail）

实机截图 = 作者节点（UI-SPEC §7 条 11；本目录预置命名，作者实测后按名放入）。
截图前页面先 scrollTo(0,0)（UI-SPEC §4.10：别截到滚动后的偏移态）。
共 15 张 = 12 场景各 1 张 + 整理柜加 2 张 + 一键入库 1 张：

  01-backpack-bagonly.png       B 键单独背包（纯背包页，无页签栏无全库切换）
  02-rack-dual.png              整理柜三段双面板全景（左背包/中五按钮/右柜子侧栏）
  03-cooking.png                烹饪（bag 族侧栏）
  04-brew.png                   酿酒桶
  05-ratcage.png                老鼠笼
  06-shredder.png               粉碎机（cart 族）
  07-compressor.png             食物压制器（cart0 族）
  08-dye.png                    颜料桶
  09-greenhouse.png             温室工程台（cart 族）
  10-tooltable.png              工作台（tt 族）
  11-trade.png                  无人机交易（:first-child 宿主）
  12-dronehub.png               调度机队
  02b-rack-transfer.png         整理柜加拍①：分类下拉展开 + 整理/转移结果 toast
  02c-rack-tagput.png           整理柜加拍②：按标签放入色点 + 切柜联动（另拍一张无标签柜拒绝态更佳，可附 -nolabel 变体）
  01b-backpack-storeall.png     一键入库：确认弹窗 + 结果差量 toast（两态可拼一张或加 -confirm/-toast 变体）

命名沿用 shots/ 既有惯例（vN-NN-场景-主题；本目录已带版本段，文件名从简）。
验收手册：mod 根 docs-cerail-acceptance.md（§7 十一条步骤/预期/回修点 + §9.7 校准表翻法）。
