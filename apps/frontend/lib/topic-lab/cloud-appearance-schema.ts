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
export const DEFAULT_CLOUD_APPEARANCE: CloudAppearance = {
  shape: 'free',
  orientation: 'horizontal',
  spacing: 'standard',
  outline: true,
};
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

function plain(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw Error('词云外观格式无效。');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    required.some(key => !Object.hasOwn(descriptors, key)) ||
    keys.some(
      key =>
        typeof key !== 'string' ||
        ![...required, ...optional].includes(key) ||
        !descriptors[key].enumerable ||
        !Object.hasOwn(descriptors[key], 'value'),
    )
  ) {
    throw Error('词云外观包含未知字段或访问器。');
  }
  return value as Record<string, unknown>;
}

export function parseCloudAppearance(value: unknown): CloudAppearance {
  const v = plain(value, ['shape', 'orientation', 'spacing', 'outline'], ['customMask']);
  if (
    !CLOUD_SHAPES.some(s => s.id === v.shape) ||
    !['horizontal', 'vertical'].includes(v.orientation as string) ||
    !['compact', 'standard', 'relaxed'].includes(v.spacing as string) ||
    typeof v.outline !== 'boolean'
  ) {
    throw Error('词云外观选项无效。');
  }
  let customMask: CloudMask | undefined;
  if (Object.hasOwn(v, 'customMask')) {
    const mask = plain(v.customMask, ['width', 'height', 'bits', 'label']);
    const { width, height, bits, label } = mask;
    if (
      typeof width !== 'number' ||
      !Number.isSafeInteger(width) ||
      width < 1 ||
      width > 128 ||
      typeof height !== 'number' ||
      !Number.isSafeInteger(height) ||
      height < 1 ||
      height > 128 ||
      width * height > 16384 ||
      typeof bits !== 'string' ||
      bits.length !== width * height ||
      !/^[01]+$/.test(bits) ||
      typeof label !== 'string' ||
      !label.trim() ||
      label.length > 120 ||
      /[\u0000-\u001f\u007f]/u.test(label)
    ) {
      throw Error('剪影网格或名称无效。');
    }
    const occupied = bits.split('1').length - 1;
    if (occupied < Math.max(1, Math.ceil(bits.length * 0.01))) {
      throw Error('剪影可用面积太小，请换用轮廓清晰的图片。');
    }
    customMask = { width, height, bits, label };
  }
  if (v.shape === 'custom' && !customMask) throw Error('请先上传自定义剪影。');
  return {
    shape: v.shape as CloudShape,
    orientation: v.orientation as CloudAppearance['orientation'],
    spacing: v.spacing as CloudAppearance['spacing'],
    outline: v.outline,
    ...(customMask ? { customMask } : {}),
  };
}
