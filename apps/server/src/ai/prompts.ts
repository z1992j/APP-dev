// Prompt templates for Claude (see docs/design/p0-detailed-design.md §5)
// Each block is shaped to be cache-friendly: vertical knowledge + persona +
// style are static across many requests, while topic/ref are dynamic.

export function verticalKnowledge(vertical: string | null | undefined): string {
  const v = vertical ?? '通用';
  const KB: Record<string, string> = {
    穿搭: `小红书穿搭赛道核心：
- 标题公式：场景 + 价位 + 反差点（如"通勤｜500 元穿出高级感"）
- 必含元素：身高体重、单品价格、风格关键词、3~5 张实拍
- 高频 hashtag：#OOTD #穿搭分享 #日常穿搭`,
    美妆: `小红书美妆赛道核心：
- 真实感 > 完美感；测评类爆款最多
- 严格避免医疗效果暗示；不允许"瘦脸""祛斑""祛痘"等断言
- 高频 hashtag：#护肤分享 #美妆好物 #平价彩妆`,
    母婴: `小红书母婴赛道核心：
- 安全 > 颜值；引用权威必要时标注
- 严禁推荐未取得资质的婴幼儿食品；避免"治愈""根治"等词
- 高频 hashtag：#新手妈妈 #育儿日记 #宝宝辅食`,
    美食: `小红书美食赛道核心：
- 步骤清晰 + 实拍成品；预算与时间要明示
- 避免医疗保健功效断言
- 高频 hashtag：#美食教程 #居家美食 #快手菜`,
    通用: `小红书通用风格：
- 真实、利他、轻量种草
- 避免极限词、绝对化用语
- 适度使用 emoji 装饰`,
  };
  return KB[v] ?? KB.通用;
}

export function personaBlock(persona: Record<string, unknown> = {}): string {
  const lines = [
    persona.gender ? `性别：${persona.gender}` : '',
    persona.ageRange ? `年龄段：${persona.ageRange}` : '',
    persona.city ? `城市：${persona.city}` : '',
    persona.intro ? `自我介绍：${persona.intro}` : '',
    Array.isArray(persona.catchphrases) && persona.catchphrases.length
      ? `口头禅：${(persona.catchphrases as string[]).join(' / ')}`
      : '',
    Array.isArray(persona.bannedWords) && persona.bannedWords.length
      ? `用户禁用词（必须避开）：${(persona.bannedWords as string[]).join('、')}`
      : '',
  ].filter(Boolean);
  return lines.join('\n') || '（账号档案尚未完善人设）';
}

export const STYLE_GUIDE: Record<string, string> = {
  种草: '种草型：先给痛点 → 再给方案 → 最后给购买理由。语气亲切，有故事感。',
  干货: '干货型：要点清晰，分步骤分要点列出，可加表情符号做序号。',
  吐槽: '吐槽型：有反转、有金句、有共鸣点。但避免人身攻击和情绪极端。',
  故事: '故事型：第一人称，时间线推进，有冲突有转折有顿悟。',
};

export const HARD_RULES = `【硬性要求】
1. 标题 ≤20 字，必带 1~2 个 emoji，避免极限词
2. 正文分 3~5 段，每段开头加 emoji 或符号
3. 自然嵌入 3~6 个 hashtag 在正文末尾
4. 不出现医疗疗效断言、极限词（最/第一/绝对等）、敏感品类
5. 输出严格的 JSON：{"titles":["...",...],"body":"...","hashtags":["#...",...]}
6. 不输出任何 JSON 之外的解释文字`;

export function buildSystem(
  vertical: string | null | undefined,
  persona: Record<string, unknown>,
  style: string,
): { systemBlocks: Array<{ type: 'text'; text: string; cache: boolean }> } {
  return {
    systemBlocks: [
      { type: 'text', text: '你是一位资深小红书内容编辑。', cache: false },
      { type: 'text', text: verticalKnowledge(vertical), cache: true },
      { type: 'text', text: `【账号人设】\n${personaBlock(persona)}`, cache: true },
      { type: 'text', text: `【风格】${STYLE_GUIDE[style] ?? STYLE_GUIDE.种草}`, cache: true },
      { type: 'text', text: HARD_RULES, cache: true },
    ],
  };
}

export function buildUserMessage(
  topic: string,
  words: number,
  refExcerpt?: string,
): string {
  return `【主题】${topic}
【字数】正文约 ${words} 字（±20%）
${refExcerpt ? `【参考】仅做风格参考，不抄：\n${refExcerpt}` : ''}
请输出 JSON。`;
}

export const REWRITE_SYSTEM = `你是小红书文案改写助手。
保留原意，长度不超过原文 1.2 倍，避免极限词与医疗暗示。
只输出改写后的纯文本，不要解释。`;
