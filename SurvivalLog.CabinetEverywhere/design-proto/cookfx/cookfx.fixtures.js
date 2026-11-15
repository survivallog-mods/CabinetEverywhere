// cookfx fixtures —— 测试床假数据（2026-11-15 实机定版后：C# 真实包形态）
// 静态表键=菜名（官方 .book-item 不带 rid，行键只有 .book-nm 文本；尾位=菜谱 ID 兼同值 tiebreak）
var COOKFX_RECIPES = {
  //            [vd1 饱腹, vd2 心态, vd3 精力, vd4 生命, vd5 活力, 菜谱ID]
  '佛跳墙':   [31, 3, 0, 0, 28, 1001, 175],   // gamekb 12315 Normal 实值
  '全家桶':   [45, 8, 0, 0, 12, 1002, 140],
  '凉拌树莓': [0, 22, 0, 0, 6, 1003, 30],    // 心态特化
  '提神咖啡': [12, 0, 35, 0, 4, 1004, 60],   // 精力特化
  '药膳汤':   [20, 2, 0, 0, 30, 1005, 120],   // 生命特化
  '八宝饭':   [52, 5, 0, 0, 20, 1006, 160],
  '烤老鼠':   [18, -6, 0, 0, 0, 1007],   // 心态负值：验证负号与垫底
  '松茸汤':   [25, 4, 0, 0, 18, 1008, 90],   // 组代表：多配方组
  '焦炭布丁': null,                      // 四维全 0：无键垫底
  '油炸薯条': [15, 2, 0, 0, 10, 1010, 20],   // 锁定菜：锁定垫尾
  '奶米布丁': [33, 6, 0, 0, 15, 1011, 110],
  '八宝炖菜': [28, 1, 0, 0, 9, 1012, 80],
  '蘑菇炖鸡': [20, 2, 0, 0, 5, 1014, 70],    // 饱腹 20 与药膳汤同值 → 同值按 ID：1005 前 1014 后
  '双拼烤肉': [45, 3, 0, 0, 8, 1015, 150]     // 饱腹 45 与全家桶同值 → 1002 前 1015 后
};

// 官方序（模拟后端 RefreshRecipeList 推送顺序——故意与任何属性维都不同序）
var COOKFX_FIXTURES_OFFICIAL = [
  { rid: 1001, icon: '🍲', name: '佛跳墙',   cost: '鱼翅·鲍鱼·海参·火腿', status: 1 },
  { rid: 1002, icon: '🍗', name: '全家桶',   cost: '肉*2·蔬菜*2', status: 2 },
  { rid: 1003, icon: '🍓', name: '凉拌树莓', cost: '树莓*2', status: 1 },
  { rid: 1004, icon: '☕', name: '提神咖啡', cost: '咖啡豆·水', status: 0 },
  { rid: 1005, icon: '🥣', name: '药膳汤',   cost: '肉·草药', status: 1 },
  { rid: 1006, icon: '🍚', name: '八宝饭',   cost: '生态香米·冻干草莓·综合坚果', status: 1 },
  { rid: 1007, icon: '🐁', name: '烤老鼠',   cost: '黑老鼠*2', status: 2 },
  { rid: 1008, icon: '🍄', name: '松茸汤',   cost: '松茸', status: 1, group: '3 种配方' },
  { rid: 1009, icon: '🌑', name: '焦炭布丁', cost: '？', status: 0 },
  { rid: 1010, icon: '🍟', name: '油炸薯条', cost: '冻薯条实惠装', status: 1, locked: true },
  { rid: 1011, icon: '🍮', name: '奶米布丁', cost: '草莓·纯牛奶·生态香米', status: 1 },
  { rid: 1012, icon: '🥘', name: '八宝炖菜', cost: '肉·蔬菜', status: 2 },
  { rid: 1015, icon: '🍖', name: '双拼烤肉', cost: '肉*2', status: 1 },
  { rid: 1014, icon: '🍲', name: '蘑菇炖鸡', cost: '蘑菇·鸡肉', status: 1 }
];

// 预测包（C# 真实形态：{entries:[{recipeId,name,dims}]}；官方行 .pot-card 由 btnPred 造）
var COOKFX_FIXTURES_PRED = {
  entries: [
    { recipeId: 1002, name: '全家桶', dims: [[37.2, 79.56], [3, 5], null, [1.08, 2.64]] },
    { recipeId: 1005, name: '药膳汤', dims: [[12, 20], [1, 1], null, [18, 30]] },
    { recipeId: 1013, name: '夏日水果沙拉', dims: [[31, 31], [3, 3], null, null] },
    { recipeId: 0, name: '未知组合', dims: null }
  ]
};

// ---- harness 装配辅助 ----
function COOKFX_FIXTURES官方序() { return COOKFX_FIXTURES_OFFICIAL.slice(); }
function COOKFX_FIXTURES预测包() { return COOKFX_FIXTURES_PRED; }
