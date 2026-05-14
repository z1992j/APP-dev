// Initial lint dictionary (≈100). Production goal ≥ 1500.
// Categories: 极限词 | 医疗 | 金融 | 平台风险 | 低俗 | 广告法
// Levels: red (block) | yellow (warn) | info (notice)

export interface SeedWord {
  term: string;
  patternType: 'exact' | 'regex';
  category: string;
  level: 'red' | 'yellow' | 'info';
  suggestion?: string;
}

export const SEED_LINT_WORDS: SeedWord[] = [
  // 极限词 - red
  ...exactRed('极限词', [
    ['最好', '比较好'],
    ['最佳', '不错的选择'],
    ['最优', '相对优秀'],
    ['第一', '靠前'],
    ['顶级', '高端'],
    ['绝对', '相对'],
    ['百分百', '极大概率'],
    ['100%', '极大概率'],
    ['永久', '长期'],
    ['终身', '长期'],
    ['官方推荐', '社区好评'],
    ['国家级', '获得认证的'],
    ['世界级', '行业领先的'],
    ['全网最低', '价格友好'],
    ['全国独家', '少见'],
    ['唯一', '少有'],
    ['首选', '不错的选择'],
    ['冠军', '靠前'],
    ['销量第一', '销量靠前'],
  ]),
  // 医疗 - red（避免暗示疗效）
  ...exactRed('医疗', [
    ['治愈', '改善'],
    ['根治', '改善'],
    ['特效', '辅助'],
    ['立竿见影', '逐步'],
    ['祛斑', '提亮'],
    ['祛痘', '改善肤况'],
    ['抗衰', '保养'],
    ['修复DNA', '日常护理'],
    ['延缓衰老', '日常保养'],
    ['杀菌99%', '辅助清洁'],
    ['消炎', '舒缓'],
    ['退烧', '降温辅助'],
    ['减脂', '体重管理'],
    ['瘦身奇效', '身材管理小窍门'],
    ['丰胸', '身材管理'],
  ]),
  // 金融 - red
  ...exactRed('金融', [
    ['保本', '相对稳健'],
    ['零风险', '风险较低'],
    ['稳赚', '潜在收益'],
    ['包赚', '潜在收益'],
    ['一夜暴富', '逐步积累'],
  ]),
  // 平台风险 - yellow（小红书敏感词）
  ...exactYellow('平台风险', [
    '微信号',
    '加微信',
    '私我',
    '私信我',
    '威信',
    '+v',
    '十v',
    '联系方式',
    '电话',
    'QQ群',
    '抖音同名',
    '主页有联系方式',
    '简介有v',
  ]),
  // 低俗 - red
  ...exactRed('低俗', [
    ['草泥马', ''],
    ['他妈的', ''],
    ['你妈', ''],
    ['妈逼', ''],
  ]),
  // 广告法 - yellow
  ...exactYellow('广告法', [
    '免费送',
    '免费领',
    '点击购买',
    '点击下单',
    '立即抢购',
    '错过等一年',
    '仅此一次',
  ]),
  // 正则示例：手机号 / 价格
  {
    term: '\\b1[3-9]\\d{9}\\b',
    patternType: 'regex',
    category: '平台风险',
    level: 'yellow',
    suggestion: '正文出现手机号易被限流，建议私聊',
  },
];

function exactRed(category: string, pairs: [string, string][]): SeedWord[] {
  return pairs.map(([term, suggestion]) => ({
    term,
    patternType: 'exact',
    category,
    level: 'red',
    suggestion: suggestion || undefined,
  }));
}

function exactYellow(category: string, terms: string[]): SeedWord[] {
  return terms.map((term) => ({
    term,
    patternType: 'exact',
    category,
    level: 'yellow',
  }));
}
