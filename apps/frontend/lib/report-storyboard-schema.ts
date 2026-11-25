/**
 * Zero-dependency schema & parser for `ReportSlideLink` (shared between `editor-model.ts` and `report-storyboard.ts`
 * so initial route bundles never pull heavy storyboard synthesis / inline-math formatting on startup).
 */
export type ReportSlideLinkSource = {
  sectionId: string;
  sectionHash: string;
  blockIds: string[];
};

export type ReportSlideLink = {
  version: 1 | 2 | 3;
  sectionId: string;
  sectionHash: string;
  slideHash: string;
  sources?: ReportSlideLinkSource[];
};

export function parseLinkSources(value: unknown): ReportSlideLinkSource[] {
  if (!Array.isArray(value) || !value.length || value.length > 12) {
    throw Error('页面来源数量无效。');
  }
  const sources = value.map(v => {
    if (
      !v ||
      typeof v !== 'object' ||
      Array.isArray(v) ||
      Object.keys(v).length !== 3 ||
      Object.keys(v).some(k => !['sectionId', 'sectionHash', 'blockIds'].includes(k))
    ) {
      throw Error('页面来源无效。');
    }
    const x = v as Record<string, unknown>;
    const parsed = parseReportSlideLink({
      version: 2,
      sectionId: x.sectionId,
      sectionHash: x.sectionHash,
      slideHash: x.sectionHash,
    });
    if (
      !Array.isArray(x.blockIds) ||
      x.blockIds.length > 60 ||
      x.blockIds.some(
        id =>
          typeof id !== 'string' ||
          !id.trim() ||
          id.length > 80 ||
          /[\u0000-\u001f\p{Surrogate}]/u.test(id),
      ) ||
      new Set(x.blockIds).size !== x.blockIds.length
    ) {
      throw Error('内容块引用无效。');
    }
    return {
      sectionId: parsed.sectionId,
      sectionHash: parsed.sectionHash,
      blockIds: x.blockIds as string[],
    };
  });
  if (new Set(sources.map(s => s.sectionId)).size !== sources.length) {
    throw Error('页面来源重复。');
  }
  return sources;
}

export function parseReportSlideLink(value: unknown): ReportSlideLink {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw Error('报告关联结构无效。');
  }
  const x = value as Record<string, unknown>;
  if (
    Object.keys(x).some(k => !['version', 'sectionId', 'sectionHash', 'slideHash', 'sources'].includes(k)) ||
    ![1, 2, 3].includes(x.version as number) ||
    typeof x.sectionId !== 'string' ||
    !x.sectionId.trim() ||
    x.sectionId.length > 80 ||
    /[\u0000-\u001f\u007f\p{Surrogate}]/u.test(x.sectionId) ||
    typeof x.sectionHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(x.sectionHash) ||
    typeof x.slideHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(x.slideHash)
  ) {
    throw Error('报告关联版本或指纹无效。');
  }
  if (x.version !== 3 && Object.hasOwn(x, 'sources')) {
    throw Error('旧关联不支持多来源。');
  }
  const sources = x.version === 3 ? parseLinkSources(x.sources) : undefined;
  if (sources && (sources[0].sectionId !== x.sectionId || sources[0].sectionHash !== x.sectionHash)) {
    throw Error('主来源与来源清单不一致。');
  }
  return {
    version: x.version as 1 | 2 | 3,
    sectionId: x.sectionId,
    sectionHash: x.sectionHash,
    slideHash: x.slideHash,
    ...(sources ? { sources } : {}),
  };
}
