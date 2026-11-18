/**
 * 硅基样本 · simulated respondents ("silicon samples").
 * Every persona is fictional and exists only to pretest a questionnaire or rehearse an
 * analysis plan. Quota weights are the researcher's own assumptions, never population statistics.
 */
export const SILICON_LIMITS = { personas: 120, attributes: 8, levels: 8, scenarios: 4, models: 3, background: 240, label: 24 } as const;

export type AttributeLevel = { value: string; label: string; weight: number };
export type PersonaAttribute = { key: string; label: string; levels: AttributeLevel[] };
export type HatKind = 'none' | 'cap' | 'beret' | 'hardhat' | 'bucket' | 'top';
export type AccessoryKind = 'none' | 'glasses' | 'scarf' | 'backpack' | 'satchel';
export type Appearance = { hue: number; hat: HatKind; accessory: AccessoryKind; hair: number; height: number };
export type Persona = { id: string; code: string; traits: Record<string, string>; background: string; appearance: Appearance };
export type Allocation = 'quota' | 'random';
export type PanelSpec = { attributes: PersonaAttribute[]; size: number; allocation: Allocation; seed: number; background: string };
export type FidelityRisk = { level: 'baseline' | 'elevated'; reasons: string[] };

export const HAT_KINDS: Record<HatKind, string> = { none: '无', cap: '鸭舌帽', beret: '贝雷帽', hardhat: '安全帽', bucket: '渔夫帽', top: '礼帽' };
export const ACCESSORY_KINDS: Record<AccessoryKind, string> = { none: '无', glasses: '眼镜', scarf: '围巾', backpack: '双肩包', satchel: '斜挎包' };
/** Eight figure tints; index 0–7. Picked for contrast on the dark stage, not for meaning. */
export const FIGURE_PALETTE = ['#4fd1c1', '#f4b942', '#7aa7ff', '#ff8a8e', '#b69cff', '#9ad97a', '#f2a65a', '#e7eef3'] as const;
export const HAIR_TONES = ['#1c1a1a', '#5b3a24', '#a77b4f', '#cfd3d6'] as const;

const level = (value: string, label = value): AttributeLevel => ({ value, label, weight: 1 });
const attribute = (key: string, label: string, levels: string[]): PersonaAttribute => ({ key, label, levels: levels.map(l => level(l)) });

/** Starting points only; every label and weight is editable and none claims to describe a real population. */
export const PANEL_TEMPLATES: Record<string, { label: string; description: string; attributes: PersonaAttribute[] }> = {
  students: {
    label: '在校大学生', description: '校园服务、消费与学习类选题',
    attributes: [
      attribute('gender', '性别', ['男', '女']),
      attribute('grade', '年级', ['大一', '大二', '大三', '大四', '研究生']),
      attribute('major', '专业大类', ['理工', '经管', '人文社科', '医学', '艺术']),
      attribute('budget', '月生活费', ['1500 元以下', '1500–2500 元', '2500–4000 元', '4000 元以上']),
      attribute('origin', '生源地', ['城市', '县镇', '农村']),
    ],
  },
  residents: {
    label: '城市居民', description: '消费、出行与公共服务类选题',
    attributes: [
      attribute('gender', '性别', ['男', '女']),
      attribute('age', '年龄段', ['18–24 岁', '25–34 岁', '35–44 岁', '45–59 岁', '60 岁及以上']),
      attribute('education', '学历', ['初中及以下', '高中 / 中专', '大专', '本科', '研究生']),
      attribute('occupation', '职业', ['学生', '企业职员', '工人', '个体经营', '自由职业', '退休']),
      attribute('city', '城市层级', ['一线城市', '新一线 / 二线', '三线及以下']),
    ],
  },
  seniors: {
    label: '银发人群', description: '养老、健康与数字适老化类选题',
    attributes: [
      attribute('gender', '性别', ['男', '女']),
      attribute('age', '年龄', ['60–64 岁', '65–69 岁', '70–79 岁', '80 岁及以上']),
      attribute('living', '居住方式', ['独居', '与配偶同住', '与子女同住']),
      attribute('digital', '智能手机使用', ['经常使用', '偶尔使用', '几乎不用']),
      attribute('area', '居住地', ['城市', '县镇', '农村']),
    ],
  },
  custom: {
    label: '自定义', description: '从两个属性开始，按你的研究对象增减',
    attributes: [attribute('gender', '性别', ['男', '女']), attribute('age', '年龄段', ['18–29 岁', '30–49 岁', '50 岁及以上'])],
  },
};

export function seededRandom(seed: number): () => number {
  let state = (Number.isFinite(seed) ? Math.floor(seed) : 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit FNV-1a hash used to derive deterministic per-persona variety. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function clampPanelSize(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(SILICON_LIMITS.personas, Math.round(value))) : 12;
}

/** Validate a researcher-edited attribute list; returns readable problems instead of throwing. */
export function attributeIssues(attributes: PersonaAttribute[]): string[] {
  const issues: string[] = [];
  if (!attributes.length) issues.push('至少需要一个画像属性。');
  if (attributes.length > SILICON_LIMITS.attributes) issues.push(`画像属性最多 ${SILICON_LIMITS.attributes} 个。`);
  const keys = new Set<string>();
  attributes.forEach((a, i) => {
    const name = a.label.trim() || `第 ${i + 1} 个属性`;
    if (!a.label.trim()) issues.push(`第 ${i + 1} 个属性缺少名称。`);
    if (a.label.length > SILICON_LIMITS.label) issues.push(`「${name}」名称过长。`);
    if (keys.has(a.key)) issues.push(`「${name}」与其他属性重复。`);
    keys.add(a.key);
    if (a.levels.length < 2) issues.push(`「${name}」至少需要两个取值。`);
    if (a.levels.length > SILICON_LIMITS.levels) issues.push(`「${name}」最多 ${SILICON_LIMITS.levels} 个取值。`);
    if (a.levels.some(l => !l.label.trim())) issues.push(`「${name}」有空白取值。`);
    if (new Set(a.levels.map(l => l.label.trim())).size !== a.levels.length) issues.push(`「${name}」有重复取值。`);
    if (a.levels.some(l => !Number.isFinite(l.weight) || l.weight < 0) || a.levels.every(l => !(l.weight > 0))) issues.push(`「${name}」的配额比例须为非负数，且不能全为 0。`);
  });
  return issues;
}

/** Largest-remainder allocation: integer counts that sum to `size` and follow the weights. */
export function quotaCounts(weights: number[], size: number): number[] {
  const total = weights.reduce((sum, w) => sum + (w > 0 ? w : 0), 0);
  if (!(total > 0) || size <= 0) return weights.map(() => 0);
  const exact = weights.map(w => (w > 0 ? w : 0) / total * size);
  const counts = exact.map(Math.floor);
  let left = size - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) counts[order[k].index]++;
  return counts;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}

function pickWeighted(levels: AttributeLevel[], rng: () => number): AttributeLevel {
  const total = levels.reduce((s, l) => s + Math.max(0, l.weight), 0);
  let r = rng() * total;
  for (const l of levels) { r -= Math.max(0, l.weight); if (r < 0) return l; }
  return levels[levels.length - 1];
}

export function defaultAppearance(seed: string): Appearance {
  const rng = seededRandom(hash32(seed));
  const hats: HatKind[] = ['none', 'none', 'none', 'cap', 'beret', 'bucket', 'hardhat', 'top'];
  const accessories: AccessoryKind[] = ['none', 'none', 'glasses', 'scarf', 'backpack', 'satchel'];
  return {
    hue: Math.floor(rng() * FIGURE_PALETTE.length),
    hat: hats[Math.floor(rng() * hats.length)],
    accessory: accessories[Math.floor(rng() * accessories.length)],
    hair: Math.floor(rng() * HAIR_TONES.length),
    height: Math.round((0.94 + rng() * 0.12) * 100) / 100,
  };
}

/**
 * Build a deterministic panel. `quota` matches each attribute's marginal shares exactly
 * (largest remainder, independently per attribute); `random` samples each persona independently.
 */
export function generatePanel(spec: PanelSpec): Persona[] {
  const size = clampPanelSize(spec.size);
  const rng = seededRandom(spec.seed);
  const columns = spec.attributes.map(a => {
    if (spec.allocation === 'random') return Array.from({ length: size }, () => pickWeighted(a.levels, rng).label);
    const counts = quotaCounts(a.levels.map(l => l.weight), size);
    return shuffle(a.levels.flatMap((l, i) => Array.from({ length: counts[i] }, () => l.label)), rng);
  });
  return Array.from({ length: size }, (_, i) => {
    const code = `S-${String(i + 1).padStart(3, '0')}`;
    const traits: Record<string, string> = {};
    spec.attributes.forEach((a, k) => { traits[a.key] = columns[k][i]; });
    return { id: `${spec.seed}-${code}`, code, traits, background: spec.background.slice(0, SILICON_LIMITS.background), appearance: defaultAppearance(`${spec.seed}:${code}`) };
  });
}

/** Observed marginal counts per attribute level, for checking a panel against its quota. */
export function panelMarginals(personas: Persona[], attributes: PersonaAttribute[]) {
  return attributes.map(a => ({ key: a.key, label: a.label, levels: a.levels.map(l => ({ label: l.label, count: personas.filter(p => p.traits[a.key] === l.label).length })) }));
}

const RISK_PATTERNS: Array<[RegExp, string]> = [
  [/小学|初中|文盲|未上学/u, '较低学历'],
  [/农村|乡村|乡镇|村/u, '农村地区'],
  [/少数民族|方言|民族语|小语种/u, '少数民族语言或方言'],
];

/**
 * Language models are usually less faithful when imitating lower-education, rural and minority-language
 * groups because their training data covers them less. This flags such personas; it cannot fix the bias.
 */
export function fidelityRisk(persona: Persona): FidelityRisk {
  const text = [...Object.values(persona.traits), persona.background].join(' ');
  const reasons = RISK_PATTERNS.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason);
  return { level: reasons.length ? 'elevated' : 'baseline', reasons };
}

export function describePersona(persona: Persona, attributes: PersonaAttribute[]): string {
  const parts = attributes.map(a => `${a.label}：${persona.traits[a.key] ?? '未设定'}`);
  return persona.background.trim() ? `${parts.join('；')}。背景：${persona.background.trim()}` : `${parts.join('；')}。`;
}

export type PersonaProfile = {
  alias: string;
  archetype: string;
  provenance: string;
  tags: string[];
  catchphrase: string;
  monologue: string;
  toneRule: string;
};

const ALIAS_SURNAMES = ['林同学', '小满', '老周', '阿穗', '陈姐', '小吴', '方老师', '阿哲', '苏敏', '边边', '小唐', '大伟'] as const;

const VOICE_BANK: ReadonlyArray<{
  prefix: string;
  habitTag: string;
  catchphrase: string;
  toneRule: string;
  focusCue: string;
}> = [
  {
    prefix: '效率实用派',
    habitTag: '怕填长卷',
    catchphrase: '别跟我绕弯子，选项写得含糊我直接就点最中间那个“一般”过去了。',
    toneRule: '语速偏快、先讲结论与时间成本，常用“说白了/懒得算/直接看”。',
    focusCue: '会第一时间挑出题干冗余、选项重叠或手机端滑屏过长的题项。',
  },
  {
    prefix: '细看成分党',
    habitTag: '细节抠字眼',
    catchphrase: '“性价比高”太虚了，你得问清楚到底是因为分量足、价格稳还是回购优惠多。',
    toneRule: '注重边界与前提条件，爱追问“你这里指的是哪种情况？”。',
    focusCue: '容易发现量表维度概念混杂（把“质量”和“服务态度”揉成一题）的问题。',
  },
  {
    prefix: '日常体验派',
    habitTag: '重现场感受',
    catchphrase: '我选东西全看当下的体感和顺手程度，参数再好看用着别扭也是白搭。',
    toneRule: '口语生活化、常举最近一周亲身经历的小细节，带感性直观判断。',
    focusCue: '擅长补充研究者容易遗漏的具体使用场景与情绪触发点。',
  },
  {
    prefix: '口碑观望派',
    habitTag: '随手对照点评',
    catchphrase: '一般不会当场拍板，都是先翻几条真实差评，确定没踩坑才敢继续用。',
    toneRule: '措辞留有余地、善于横向对比不同备选方案，偶用“看情况/还得比一比”。',
    focusCue: '对社会赞许性偏差敏感，遇到引导性过强的正面题干会本能质疑。',
  },
  {
    prefix: '精算性价比派',
    habitTag: '价格锚点敏锐',
    catchphrase: '涨一块两块倒无所谓，主要是份量暗地缩水或者附加条件太多让人膈应。',
    toneRule: '数字意识强，回答里常自带金额、频次或时间间隔估算。',
    focusCue: '会敏锐指出收入/花费区间划分不均、选项跨度不合理等尺度缺陷。',
  },
  {
    prefix: '随缘轻度派',
    habitTag: '偶尔触发消费',
    catchphrase: '有些问题其实是重度用户才会想的，我一个月才碰一次实在答不上来。',
    toneRule: '直白坦率、不愿被强迫在“同意/不同意”里硬站队。',
    focusCue: '最能暴露“缺少『不知道 / 不适用 / 跳过』选项导致硬填中间值”的污染风险。',
  },
];

/**
 * Synthesizes an Atypica-caliber behavioral dossier deterministically from a synthetic
 * respondent's traits, seed id and optional researcher background. Remains strictly labeled synthetic.
 */
export function synthesizePersonaProfile(
  persona: Persona,
  attributes: PersonaAttribute[],
  topic = '调查专题',
): PersonaProfile {
  const h = hash32(persona.id);
  const voice = VOICE_BANK[h % VOICE_BANK.length];
  const surname = ALIAS_SURNAMES[(h >>> 4) % ALIAS_SURNAMES.length];
  const traitValues = attributes.map(a => persona.traits[a.key]).filter(Boolean);
  const ageOrGrade = persona.traits.age || persona.traits.grade || '';
  const jobOrMajor = persona.traits.occupation || persona.traits.major || persona.traits.living || '';
  const originOrCity = persona.traits.city || persona.traits.origin || persona.traits.area || '';

  const leadTrait = [jobOrMajor, ageOrGrade, originOrCity].filter(Boolean).slice(0, 2).join(' · ') || traitValues.slice(0, 2).join(' · ');
  const alias = `${voice.prefix} · ${surname}`;
  const archetype = leadTrait ? `${leadTrait}` : `配额画像 (${persona.code})`;

  const extraTags = traitValues.slice(0, 3);
  const tags = Array.from(new Set([...extraTags, voice.habitTag, voice.prefix])).slice(0, 5);

  const traitSentence = attributes
    .map(a => `${a.label}为「${persona.traits[a.key] ?? '未设定'}」`)
    .slice(0, 5)
    .join('，');
  const bgNote = persona.background.trim()
    ? `你的具体生活境况是：${persona.background.trim()}。`
    : '你的判断主要来自过去三个月真实且琐碎的日常习惯与消费取舍。';

  const monologue = [
    `你要始终以「${alias}」（${persona.code}）的第一视角作答与讨论。当前人口学与分层属性为：${traitSentence}。${bgNote}`,
    `在参与《${topic || '本项调查'}》时，${voice.focusCue}遇到表述模糊、缺乏“不适用”出口或带明显诱导的题项时，请直接用真实受访者的困惑口气指出来，不要用官话或“综上所述”等模板词汇敷衍打高分。`,
  ].join('\n\n');

  return {
    alias,
    archetype,
    provenance: `硅基田野画像 · 配额锚点 ${persona.code}（与真实样本隔离）`,
    tags,
    catchphrase: voice.catchphrase,
    monologue,
    toneRule: voice.toneRule,
  };
}
