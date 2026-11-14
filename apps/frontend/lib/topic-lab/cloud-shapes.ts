/** Saved visual settings only: these never participate in term extraction or document counts. */
export type CloudShape =
  | 'free'
  | 'bag'
  | 'brain'
  | 'shield'
  | 'heart'
  | 'crown'
  | 'circle'
  | 'rectangle'
  | 'leaf'
  | 'crayfish'
  | 'custom';
export type CloudMask = { width: number; height: number; bits: string; label: string };
export type CloudAppearance = {
  shape: CloudShape;
  orientation: 'horizontal' | 'vertical';
  spacing: 'compact' | 'standard' | 'relaxed';
  outline: boolean;
  customMask?: CloudMask;
};
export const DEFAULT_CLOUD_APPEARANCE: CloudAppearance = { shape: 'free', orientation: 'horizontal', spacing: 'standard', outline: true };
export const CLOUD_SHAPES: readonly { id: CloudShape; label: string }[] = [
  { id: 'free', label: '自由布局' },
  { id: 'bag', label: '消费袋' },
  { id: 'brain', label: '智慧脑' },
  { id: 'shield', label: '护盾' },
  { id: 'heart', label: '康养心' },
  { id: 'crown', label: '国潮冕' },
  { id: 'leaf', label: '叶片' },
  { id: 'crayfish', label: '小龙虾' },
  { id: 'circle', label: '圆形' },
  { id: 'rectangle', label: '矩形' },
  { id: 'custom', label: '自定义' },
];

export type AgentShapeRecognition = {
  shape: CloudShape;
  label: string;
  domain: string;
  confidence: number;
  reason: string;
  matchedTerms: string[];
};

const AGENT_SHAPE_RULES: readonly {
  shape: CloudShape;
  label: string;
  domain: string;
  pattern: RegExp;
  baseWeight: number;
}[] = [
  {
    shape: 'crayfish',
    label: '小龙虾',
    domain: '餐饮美食与地域特产',
    pattern: /小龙虾|美食|餐饮|夜经济|小吃|预制菜|特产|火锅|烧烤|茶饮|咖啡|零食|口味|食材|餐厅|舌尖|卤味|烘焙|水饺|正大|正榆|鸡肉丸|无抗|速冻|刺梨|板面/iu,
    baseWeight: 1.25,
  },
  {
    shape: 'leaf',
    label: '生态叶',
    domain: '绿色生态与农林双碳',
    pattern: /绿色|生态|低碳|环保|农业|乡村|碳中和|新能源|可持续|茶园|林下|环境|节能|有机|植保|森林|减排|光伏|无废城市|双碳|碳标签|二手/iu,
    baseWeight: 1.18,
  },
  {
    shape: 'brain',
    label: '智慧脑',
    domain: '人工智能与数字认知',
    pattern: /人工智能|\bAI\b|大模型|智能|算法|学习|高校|大学生|数字|算力|认知|教育|深度|科技|软件|平台|信息|机器人|芯片|低空|无人机|无人驾驶|智能眼镜|智能客服|utaut/iu,
    baseWeight: 1.15,
  },
  {
    shape: 'heart',
    label: '康养心',
    domain: '医疗康养与民生福祉',
    pattern: /养老|医疗|健康|康养|心理|幸福|医养|护理|生育|托育|社区|老年|关怀|慢病|医院|睡眠|抑郁|亚健康|焦虑|体质|无陪护|病房|陪诊|轻食|保健|养生|宠物|拟人化/iu,
    baseWeight: 1.15,
  },
  {
    shape: 'shield',
    label: '治理护盾',
    domain: '公共治理与风险防控',
    pattern: /治理|安全|风险|监管|政策|防诈|合规|隐私|维权|应急|法治|韧性|信任|保障|食安|反诈|治安|公信力|审计/iu,
    baseWeight: 1.15,
  },
  {
    shape: 'crown',
    label: '国潮冕',
    domain: '国潮文创与文旅传播',
    pattern: /国潮|非遗|文旅|文化|博物馆|汉服|文创|景区|古镇|地标|影视|票房|哪吒|动漫|游戏|非物质|古建|戏曲|传播|符号|簪花|风筝|木版年画|微短剧|票根|赛事|citywalk|谷子|潮玩/iu,
    baseWeight: 1.12,
  },
  {
    shape: 'bag',
    label: '消费袋',
    domain: '商业消费与品牌营销',
    pattern: /消费|市场|购买|意愿|品牌|营销|价格|促销|电商|直播|零售|消费者|复购|渠道|Z世代|满意度|需求|产品|偏好|门店|商圈|性价比|即时零售|社区团购|盲盒|会员/iu,
    baseWeight: 1.0,
  },
];

/** Semantic agent analyzer: scans weighted topic/literature keywords to auto-select a domain-fit silhouette. */
export function inferAgentCloudShape(
  terms: readonly { label: string; weight?: number }[],
  topicHint = '',
): AgentShapeRecognition {
  const scores = new Map<CloudShape, { score: number; matched: string[]; rule: (typeof AGENT_SHAPE_RULES)[number] }>();
  for (const rule of AGENT_SHAPE_RULES) {
    scores.set(rule.shape, { score: 0, matched: [], rule });
  }

  const normalizedHint = topicHint.trim();
  if (normalizedHint) {
    for (const rule of AGENT_SHAPE_RULES) {
      if (rule.pattern.test(normalizedHint)) {
        const bucket = scores.get(rule.shape)!;
        bucket.score += 18 * rule.baseWeight;
      }
    }
  }

  for (const term of terms) {
    const label = term.label.trim();
    if (!label) continue;
    const w = typeof term.weight === 'number' && Number.isFinite(term.weight) && term.weight > 0 ? term.weight : 10;
    for (const rule of AGENT_SHAPE_RULES) {
      if (rule.pattern.test(label)) {
        const bucket = scores.get(rule.shape)!;
        bucket.score += w * rule.baseWeight;
        if (!bucket.matched.includes(label) && bucket.matched.length < 5) bucket.matched.push(label);
      }
    }
  }

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const runnerUp = ranked[1];
  if (!top || top.score <= 0) {
    const fallbackTerms = terms.slice(0, 3).map(t => t.label).filter(Boolean);
    return {
      shape: 'bag',
      label: '消费袋',
      domain: '实证调研通用领域',
      confidence: 86,
      matchedTerms: fallbackTerms,
      reason: fallbackTerms.length
        ? `Agent 综合高频词「${fallbackTerms.join('、')}」，匹配通用实证「消费袋」主体轮廓。`
        : 'Agent 默认启用实证「消费袋」结构轮廓。',
    };
  }

  const marginRatio = runnerUp && runnerUp.score > 0 ? (top.score - runnerUp.score) / (top.score + runnerUp.score) : 0.72;
  const confidence = Math.min(98, Math.max(88, Math.round(88 + marginRatio * 10)));
  const evidenceWords = top.matched.length ? top.matched.slice(0, 4).join('、') : normalizedHint.slice(0, 16);
  return {
    shape: top.rule.shape,
    label: top.rule.label,
    domain: top.rule.domain,
    confidence,
    matchedTerms: top.matched,
    reason: `Agent 识别核心词「${evidenceWords}」→ 归类【${top.rule.domain}】，自动塑形为「${top.rule.label}」轮廓（置信度 ${confidence}%）。`,
  };
}

/** Deterministic procedural 64×64 silhouette mask synthesizer for arbitrary AI shape prompts. */
export function synthesizeSemanticCloudMask(prompt: string): CloudMask {
  const clean = prompt.trim().slice(0, 36) || '智能语义轮廓';
  const w = 64;
  const h = 64;
  const cells = new Array<string>(w * h).fill('0');

  const isCar = /车|新能源|电车|出行|高铁|列车|交通/u.test(clean);
  const isDrone = /无人机|低空|飞行|航拍|飞行器/u.test(clean);
  const isCup = /杯|奶茶|咖啡|茶饮|饮品|饮料/u.test(clean);
  const isCity = /楼|城|城市|建筑|社区|房产|校园/u.test(clean);
  const isBook = /书|阅读|教育|大学|课程|文献|知识/u.test(clean);
  const isTrophy = /奖|冠|杯|荣耀|榜|赛/u.test(clean);
  const isPeak = /山|水|文旅|景区|自然|峰|生态/u.test(clean);
  const isPaw = /宠物|猫|狗|犬|宠/u.test(clean);

  let seed = 0x811c9dc5;
  for (let i = 0; i < clean.length; i++) {
    seed ^= clean.charCodeAt(i);
    seed = Math.imul(seed, 0x01000193);
  }
  const lobes = 5 + ((seed >>> 0) % 4);
  const phase = ((seed >>> 4) % 628) / 100;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      let inside = false;
      if (isCar) {
        const cabin = u >= 0.24 && u <= 0.72 && v >= 0.22 && v <= 0.48 && (u >= 0.34 || v >= 0.22 + (0.34 - u) * 1.6) && (u <= 0.60 || v >= 0.22 + (u - 0.60) * 1.6);
        const body = u >= 0.06 && u <= 0.94 && v >= 0.46 && v <= 0.74;
        const leftWheel = (u - 0.24) ** 2 + (v - 0.74) ** 2 <= 0.105 ** 2;
        const rightWheel = (u - 0.76) ** 2 + (v - 0.74) ** 2 <= 0.105 ** 2;
        inside = cabin || body || leftWheel || rightWheel;
      } else if (isCup) {
        const straw = Math.abs(u - (0.58 - (0.30 - v) * 0.25)) <= 0.035 && v >= 0.05 && v <= 0.28;
        const lid = u >= 0.22 && u <= 0.78 && v >= 0.24 && v <= 0.34;
        const halfTop = 0.27;
        const halfBot = 0.17;
        const t = Math.max(0, Math.min(1, (v - 0.34) / 0.58));
        const halfW = halfTop + (halfBot - halfTop) * t;
        const body = v >= 0.34 && v <= 0.92 && Math.abs(u - 0.5) <= halfW;
        inside = straw || lid || body;
      } else if (isCity) {
        const ground = u >= 0.06 && u <= 0.94 && v >= 0.72 && v <= 0.93;
        const t1 = u >= 0.08 && u <= 0.23 && v >= 0.36 && v <= 0.92;
        const t2 = u >= 0.25 && u <= 0.42 && v >= 0.20 && v <= 0.92;
        const t3 = u >= 0.44 && u <= 0.62 && v >= 0.10 && v <= 0.92;
        const t4 = u >= 0.64 && u <= 0.79 && v >= 0.26 && v <= 0.92;
        const t5 = u >= 0.81 && u <= 0.92 && v >= 0.44 && v <= 0.92;
        inside = ground || t1 || t2 || t3 || t4 || t5;
      } else if (isBook) {
        const dip = Math.max(0, 0.06 - Math.abs(u - 0.5) * 0.14);
        const topEdge = 0.14 + dip + Math.abs(u - 0.5) * 0.05;
        const botEdge = 0.86 - dip * 0.8;
        inside = u >= 0.06 && u <= 0.94 && v >= topEdge && v <= botEdge;
      } else if (isTrophy) {
        const bowl = v >= 0.10 && v <= 0.58 && Math.abs(u - 0.5) <= 0.36 - (v - 0.10) * 0.34;
        const stem = v >= 0.56 && v <= 0.78 && Math.abs(u - 0.5) <= 0.09;
        const base = v >= 0.76 && v <= 0.92 && Math.abs(u - 0.5) <= 0.26;
        inside = bowl || stem || base;
      } else if (isDrone) {
        const arm = Math.abs(Math.abs(u - 0.5) - Math.abs(v - 0.5)) <= 0.08 && u >= 0.14 && u <= 0.86 && v >= 0.18 && v <= 0.82;
        const body = ((u - 0.5) / 0.16) ** 2 + ((v - 0.5) / 0.12) ** 2 <= 1;
        const rotors =
          (u - 0.20) ** 2 + (v - 0.24) ** 2 <= 0.13 ** 2 ||
          (u - 0.80) ** 2 + (v - 0.24) ** 2 <= 0.13 ** 2 ||
          (u - 0.20) ** 2 + (v - 0.76) ** 2 <= 0.13 ** 2 ||
          (u - 0.80) ** 2 + (v - 0.76) ** 2 <= 0.13 ** 2;
        inside = arm || body || rotors;
      } else if (isPaw) {
        const pad = ((u - 0.5) / 0.25) ** 2 + ((v - 0.68) / 0.20) ** 2 <= 1;
        const toes =
          ((u - 0.24) / 0.09) ** 2 + ((v - 0.38) / 0.12) ** 2 <= 1 ||
          ((u - 0.41) / 0.09) ** 2 + ((v - 0.25) / 0.12) ** 2 <= 1 ||
          ((u - 0.59) / 0.09) ** 2 + ((v - 0.25) / 0.12) ** 2 <= 1 ||
          ((u - 0.76) / 0.09) ** 2 + ((v - 0.38) / 0.12) ** 2 <= 1;
        inside = pad || toes;
      } else if (isPeak) {
        const p1 = Math.max(0, 0.78 - Math.abs(u - 0.34) * 1.9);
        const p2 = Math.max(0, 0.62 - Math.abs(u - 0.70) * 1.7);
        const ridge = 0.90 - Math.max(p1, p2);
        const base = u >= 0.05 && u <= 0.95 && v >= ridge && v <= 0.90;
        const sun = (u - 0.74) ** 2 + (v - 0.24) ** 2 <= 0.11 ** 2;
        inside = base || sun;
      } else {
        const dx = (u - 0.5) / 0.45;
        const dy = (v - 0.5) / 0.42;
        const r = Math.hypot(dx, dy);
        const theta = Math.atan2(dy, dx);
        const radius = 0.84 + 0.12 * Math.cos(lobes * theta + phase);
        inside = r <= radius;
      }
      if (inside) cells[y * w + x] = '1';
    }
  }

  return {
    width: w,
    height: h,
    bits: cells.join(''),
    label: `Agent构形·${clean}`,
  };
}

function plain(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw Error('词云外观格式无效。');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (required.some(key => !Object.hasOwn(descriptors, key)) || keys.some(key => typeof key !== 'string' || ![...required, ...optional].includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) throw Error('词云外观包含未知字段或访问器。');
  return value as Record<string, unknown>;
}
export function parseCloudAppearance(value: unknown): CloudAppearance {
  const v = plain(value, ['shape', 'orientation', 'spacing', 'outline'], ['customMask']);
  if (!CLOUD_SHAPES.some(s => s.id === v.shape) || !['horizontal', 'vertical'].includes(v.orientation as string) || !['compact', 'standard', 'relaxed'].includes(v.spacing as string) || typeof v.outline !== 'boolean') throw Error('词云外观选项无效。');
  let customMask: CloudMask | undefined;
  if (Object.hasOwn(v, 'customMask')) {
    const mask = plain(v.customMask, ['width', 'height', 'bits', 'label']);
    const { width, height, bits, label } = mask;
    if (typeof width !== 'number' || !Number.isSafeInteger(width) || width < 1 || width > 128 || typeof height !== 'number' || !Number.isSafeInteger(height) || height < 1 || height > 128 || width * height > 16384 || typeof bits !== 'string' || bits.length !== width * height || !/^[01]+$/.test(bits) || typeof label !== 'string' || !label.trim() || label.length > 120 || /[\u0000-\u001f\u007f]/u.test(label)) throw Error('剪影网格或名称无效。');
    const occupied = bits.split('1').length - 1;
    if (occupied < Math.max(1, Math.ceil(bits.length * .01))) throw Error('剪影可用面积太小，请换用轮廓清晰的图片。');
    customMask = { width, height, bits, label };
  }
  if (v.shape === 'custom' && !customMask) throw Error('请先上传自定义剪影。');
  return { shape: v.shape as CloudShape, orientation: v.orientation as CloudAppearance['orientation'], spacing: v.spacing as CloudAppearance['spacing'], outline: v.outline, ...(customMask ? { customMask } : {}) };
}

type Point = [number, number];
const CRAYFISH: Point[] = [
  [.025, .28], [.16, .37], [.12, .20], [.25, .35], [.38, .31], [.53, .32], [.64, .38],
  [.665, .285], [.72, .19], [.765, .09], [.86, .025], [.94, .055], [.99, .145],
  [.95, .245], [.895, .285], [.90, .18], [.855, .13], [.815, .19], [.815, .29],
  [.765, .37], [.705, .425], [.72, .46], [.755, .445], [.745, .485], [.765, .50],
  [.745, .515], [.755, .555], [.72, .54], [.705, .575], [.765, .63], [.815, .71],
  [.815, .81], [.855, .87], [.90, .82], [.895, .715], [.95, .755], [.99, .855],
  [.94, .945], [.86, .975], [.765, .91], [.72, .81], [.665, .715], [.64, .62],
  [.60, .68], [.65, .81], [.57, .72], [.52, .69], [.53, .82], [.46, .70],
  [.39, .69], [.40, .79], [.33, .68], [.25, .65], [.12, .80], [.16, .63],
  [.025, .72], [.085, .56], [.015, .50], [.085, .44],
];
const BAG: Point[] = [
  [0.12, 0.25], [0.28, 0.25], [0.32, 0.09], [0.40, 0.03], [0.60, 0.03], [0.68, 0.09], [0.72, 0.25], [0.88, 0.25],
  [0.95, 0.92], [0.91, 0.97], [0.09, 0.97], [0.05, 0.92],
];
const BRAIN: Point[] = [
  [0.50, 0.10], [0.64, 0.05], [0.80, 0.10], [0.92, 0.23], [0.96, 0.40], [0.94, 0.57],
  [0.86, 0.72], [0.72, 0.80], [0.60, 0.82], [0.58, 0.95], [0.42, 0.95], [0.40, 0.82],
  [0.28, 0.80], [0.14, 0.72], [0.06, 0.57], [0.04, 0.40], [0.08, 0.23], [0.20, 0.10], [0.36, 0.05],
];
const SHIELD: Point[] = [
  [0.50, 0.03], [0.92, 0.14], [0.90, 0.52], [0.80, 0.74], [0.65, 0.88], [0.50, 0.97],
  [0.35, 0.88], [0.20, 0.74], [0.10, 0.52], [0.08, 0.14],
];
const HEART: Point[] = Array.from({ length: 64 }, (_, i) => {
  const t = (i / 64) * Math.PI * 2;
  const hx = 16 * Math.pow(Math.sin(t), 3);
  const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
  return [0.5 + (hx / 16) * 0.46, 0.05 + ((hy + 12) / 29) * 0.91] as Point;
});
const CROWN: Point[] = [
  [0.06, 0.20], [0.28, 0.44], [0.50, 0.06], [0.72, 0.44], [0.94, 0.20],
  [0.90, 0.82], [0.85, 0.93], [0.15, 0.93], [0.10, 0.82],
];
const LEAF: Point[] = Array.from({ length: 65 }, (_, i) => {
  const t = i / 64 * Math.PI * 2;
  // A pointed, convex lens. Unlike an image it is the actual placement boundary.
  return [(1 + Math.cos(t)) / 2, .5 + Math.sin(t) * Math.sin(t / 2) * .48] as Point;
});
const CIRCLE: Point[] = Array.from({ length: 96 }, (_, i) => [.5 + Math.cos(i / 96 * Math.PI * 2) * .5, .5 + Math.sin(i / 96 * Math.PI * 2) * .5]);
function polygon(shape: CloudShape): Point[] {
  if (shape === 'bag') return BAG;
  if (shape === 'brain') return BRAIN;
  if (shape === 'shield') return SHIELD;
  if (shape === 'heart') return HEART;
  if (shape === 'crown') return CROWN;
  if (shape === 'crayfish') return CRAYFISH;
  if (shape === 'leaf') return LEAF;
  if (shape === 'circle') return CIRCLE;
  return [[0, 0], [1, 0], [1, 1], [0, 1]];
}
export function cloudShapeAspectRatio(appearance: CloudAppearance): number {
  const ratio = appearance.shape === 'circle' ? 1
    : appearance.shape === 'shield' ? 1.15
      : appearance.shape === 'heart' ? 1.22
        : appearance.shape === 'bag' ? 1.28
          : appearance.shape === 'brain' ? 1.38
            : appearance.shape === 'crown' ? 1.48
              : appearance.shape === 'leaf' ? 1.55
                : appearance.shape === 'crayfish' ? 1.7
                  : appearance.shape === 'custom' && appearance.customMask ? appearance.customMask.width / appearance.customMask.height : 1.6;
  return appearance.orientation === 'vertical' ? 1 / ratio : ratio;
}
function frame(appearance: CloudAppearance, width: number, height: number) {
  const margin = Math.min(width, height) * .035, ratio = cloudShapeAspectRatio(appearance);
  const w = Math.min(width - margin * 2, (height - margin * 2) * ratio), h = w / ratio;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}
function toCanvas(p: Point, appearance: CloudAppearance, f: ReturnType<typeof frame>): Point {
  const [x, y] = appearance.orientation === 'vertical' ? [1 - p[1], p[0]] : p;
  return [f.x + x * f.w, f.y + y * f.h];
}
function fromCanvas(x: number, y: number, appearance: CloudAppearance, f: ReturnType<typeof frame>): Point {
  const u = (x - f.x) / f.w, v = (y - f.y) / f.h;
  return appearance.orientation === 'vertical' ? [v, 1 - u] : [u, v];
}
function inPolygon(x: number, y: number, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j], [bx, by] = points[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-8 && x >= Math.min(ax, bx) - 1e-8 && x <= Math.max(ax, bx) + 1e-8 && y >= Math.min(ay, by) - 1e-8 && y <= Math.max(ay, by) + 1e-8) return true;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
export function cloudShapeContains(appearance: CloudAppearance, x: number, y: number, width: number, height: number): boolean {
  if (![width, height, x, y].every(Number.isFinite) || width <= 0 || height <= 0 || x < 0 || x > width || y < 0 || y > height) return false;
  if (appearance.shape === 'free') return true;
  const p = fromCanvas(x, y, appearance, frame(appearance, width, height));
  if (p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1) return false;
  if (appearance.shape === 'custom') {
    const m = appearance.customMask;
    return !!m && m.bits[Math.min(m.height - 1, Math.floor(p[1] * m.height)) * m.width + Math.min(m.width - 1, Math.floor(p[0] * m.width))] === '1';
  }
  return inPolygon(p[0], p[1], polygon(appearance.shape));
}

/** Trace exposed pixel edges into closed paths. No uploaded markup is ever used as SVG. */
function maskContours(mask: CloudMask): Point[][] {
  const edges = new Map<string, Point[]>(), on = (x: number, y: number) => x >= 0 && y >= 0 && x < mask.width && y < mask.height && mask.bits[y * mask.width + x] === '1';
  const add = (a: Point, b: Point) => { const key = `${a[0]},${a[1]}`; edges.set(key, [...(edges.get(key) ?? []), b]); };
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) if (on(x, y)) {
    if (!on(x, y - 1)) add([x, y], [x + 1, y]);
    if (!on(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
    if (!on(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
    if (!on(x - 1, y)) add([x, y + 1], [x, y]);
  }
  const result: Point[][] = [];
  while (edges.size) {
    const key = edges.keys().next().value!, start = key.split(',').map(Number) as Point, points: Point[] = [start];
    let p = start, previous: Point = [start[0] - 1, start[1]], guard = mask.width * mask.height * 4 + 1;
    do {
      const k = `${p[0]},${p[1]}`, choices = edges.get(k);
      if (!choices?.length) break;
      // At diagonal contacts prefer a right turn, keeping each filled cell on the right.
      const incoming = Math.atan2(p[1] - previous[1], p[0] - previous[0]);
      choices.sort((a, b) => ((Math.atan2(a[1] - p[1], a[0] - p[0]) - incoming + Math.PI * 2) % (Math.PI * 2)) - ((Math.atan2(b[1] - p[1], b[0] - p[0]) - incoming + Math.PI * 2) % (Math.PI * 2)));
      const next = choices.shift()!; if (!choices.length) edges.delete(k);
      previous = p; p = next; points.push(p);
    } while ((p[0] !== start[0] || p[1] !== start[1]) && --guard > 0);
    result.push(points.map(([x, y]) => [x / mask.width, y / mask.height]));
  }
  return result;
}
export function cloudShapePath(appearance: CloudAppearance, width: number, height: number): string {
  if (appearance.shape === 'free' || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';
  const f = frame(appearance, width, height), contours = appearance.shape === 'custom' ? appearance.customMask ? maskContours(appearance.customMask) : [] : [polygon(appearance.shape)];
  return contours.map(points => points.map((p, i) => { const [x, y] = toCanvas(p, appearance, f); return `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`; }).join('') + 'Z').join('');
}

/** A conservative summed-area mask makes full rectangle containment an O(1) query. */
export function cloudShapeConstraint(appearance: CloudAppearance, width: number, height: number): (x: number, y: number, w: number, h: number) => boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return () => false;
  const validBox = (x: number, y: number, w: number, h: number) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  if (appearance.shape === 'free') return (x, y, w, h) => validBox(x, y, w, h) && x - w / 2 >= 0 && x + w / 2 <= width && y - h / 2 >= 0 && y + h / 2 <= height;
  const f = frame(appearance, width, height);
  if (f.w <= 0 || f.h <= 0) return () => false;
  if (appearance.shape === 'rectangle') return (x, y, w, h) => validBox(x, y, w, h) && x - w / 2 >= f.x && x + w / 2 <= f.x + f.w && y - h / 2 >= f.y && y + h / 2 <= f.y + f.h;
  if (appearance.shape === 'circle') {
    // The inradius is conservative against the 96-sided outline used by the renderer.
    const r = f.w / 2 * Math.cos(Math.PI / CIRCLE.length);
    return (x, y, w, h) => validBox(x, y, w, h) && (Math.abs(x - width / 2) + w / 2) ** 2 + (Math.abs(y - height / 2) + h / 2) ** 2 <= r ** 2;
  }
  const mask = appearance.shape === 'custom' ? appearance.customMask : undefined;
  if (appearance.shape === 'custom' && !mask) return () => false;
  const cols = mask?.width ?? Math.min(256, Math.max(16, Math.ceil(f.w / 6))), rows = mask?.height ?? Math.min(256, Math.max(16, Math.ceil(f.h / 6)));
  const stride = cols + 1, prefix = new Uint32Array((rows + 1) * stride), points = polygon(appearance.shape);
  const edges = points.map((a, i) => ({ a, b: points[(i + 1) % points.length] }));
  for (let r = 0; r < rows; r++) {
    let rowSum = 0;
    for (let c = 0; c < cols; c++) {
      let inside: boolean;
      if (mask) inside = mask.bits[r * cols + c] === '1';
      else {
        const l = c / cols, t = r / rows, rr = (c + 1) / cols, bb = (r + 1) / rows;
        inside = inPolygon(l, t, points) && inPolygon(rr, t, points) && inPolygon(rr, bb, points) && inPolygon(l, bb, points);
        // Four corners alone miss inward notches. Any boundary vertex inside a cell makes it unsafe.
        if (inside) inside = !edges.some(({ a, b }) => segmentEntersBox(a, b, l, t, rr, bb));
      }
      rowSum += inside ? 0 : 1; prefix[(r + 1) * stride + c + 1] = prefix[r * stride + c + 1] + rowSum;
    }
  }
  return (x, y, w, h) => {
    if (!validBox(x, y, w, h)) return false;
    const p = fromCanvas(x - w / 2, y - h / 2, appearance, f), q = fromCanvas(x + w / 2, y + h / 2, appearance, f);
    const l = Math.min(p[0], q[0]), t = Math.min(p[1], q[1]), rr = Math.max(p[0], q[0]), bb = Math.max(p[1], q[1]);
    if (l < 0 || t < 0 || rr > 1 || bb > 1) return false;
    const x0 = Math.max(0, Math.floor(l * cols + 1e-9)), y0 = Math.max(0, Math.floor(t * rows + 1e-9));
    const x1 = Math.min(cols, Math.ceil(rr * cols - 1e-9)), y1 = Math.min(rows, Math.ceil(bb * rows - 1e-9));
    return prefix[y1 * stride + x1] - prefix[y0 * stride + x1] - prefix[y1 * stride + x0] + prefix[y0 * stride + x0] === 0;
  };
}
function segmentEntersBox(a: Point, b: Point, left: number, top: number, right: number, bottom: number): boolean {
  const eps = 1e-9; left += eps; top += eps; right -= eps; bottom -= eps;
  if (Math.max(a[0], b[0]) < left || Math.min(a[0], b[0]) > right || Math.max(a[1], b[1]) < top || Math.min(a[1], b[1]) > bottom) return false;
  let lo = 0, hi = 1;
  for (const [p, q] of [[-(b[0] - a[0]), a[0] - left], [b[0] - a[0], right - a[0]], [-(b[1] - a[1]), a[1] - top], [b[1] - a[1], bottom - a[1]]]) {
    if (p === 0) { if (q < 0) return false; } else if (p < 0) lo = Math.max(lo, q / p); else hi = Math.min(hi, q / p);
    if (lo > hi) return false;
  }
  return true;
}
