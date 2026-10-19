/** Read-only presentation over an already verified publication selection. No release authority or I/O. */
import type { PublishedCountyProfile } from './topic-publication.ts';
import type { TopicProfile } from './topic-advisor/types.ts';
import { profileRegionStatus } from './topic-advisor/geography.ts';
import { getRegionByCode, regionPath, type RegionRef } from './topic-advisor/regions.ts';

export type CountyEvidenceSelection =
  | { status: 'select_county' | 'stale' | 'empty' | 'ambiguous' | 'invalid'; title: string; detail: string; geography: string }
  | { status: 'ready'; publication: PublishedCountyProfile; geography: string; regionRef: RegionRef };
export type CountyEvidenceSource = {
  id: string; title: string; url: string | null; authority: string;
  publishedAt: string | null; retrievedAt: string | null; sourceLocator: string; readLocator: string;
  coverage: 'fulltext' | 'listing_only' | 'unread' | 'unrecorded'; readAt: string | null;
  scopeLabel: string; supportLabel: string;
};
const hash = (value: unknown): boolean => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const nonblank = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const instant = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && date(value.slice(0, 10)) && Number.isFinite(Date.parse(value));

/** Exact current county identity only. A name, a parent city or historical code is never guessed. */
export function selectCountyEvidence(profile: TopicProfile, published: readonly PublishedCountyProfile[]): CountyEvidenceSelection {
  let geography = '';
  try {
    const status = profileRegionStatus(profile);
    if (status === 'migration_required') return { status: 'stale', title: '请重新确认地区', detail: '原地区引用已保留；选择当前目录中的县级地区后，再查看县域资料。', geography };
    if (status !== 'current' || profile.schemaVersion !== 2 || !profile.regionRef) return { status: 'select_county', title: '选择一个县级地区', detail: '确认区、县或县级市后，可查看精确对应的县域资料。', geography };
    const ref = profile.regionRef, county = getRegionByCode(ref.code);
    geography = regionPath(ref).map(row => row.name).join(' · ');
    if (county?.level !== 'county') return { status: 'select_county', title: '继续选择县级地区', detail: '当前选择覆盖多个地区；请明确要查看的区、县或县级市。', geography };
    if (!Array.isArray(published)) return { status: 'invalid', title: '县域资料暂不可用', detail: '资料格式未通过展示检查。', geography };
    const entries: readonly PublishedCountyProfile[] = published;
    const matching = entries.filter(item => item?.profile?.regionRef?.code === ref.code && item.profile.regionRef.catalogVersion === ref.catalogVersion);
    if (matching.length > 1) return { status: 'ambiguous', title: '县域资料存在版本歧义', detail: '这个县级地区对应多份当前资料；明确保留的发布记录后再展示。', geography };
    if (!matching.length) {
      if (entries.some(item => item?.profile?.regionRef?.code === ref.code && item.profile.regionRef.catalogVersion !== ref.catalogVersion)) return { status: 'stale', title: '县域资料需要更新地区引用', detail: '现有资料属于其他地区目录版本，暂不作为当前县域资料展示。', geography };
      return { status: 'empty', title: '暂无已发布县域资料', detail: '这表示当前资料库尚未覆盖该地区；可以继续使用上方的选题探索。', geography };
    }
    const publication = matching[0], p = publication.profile;
    if (publication.status !== 'published' || p.status !== 'draft' || p.displayName !== county.name || !hash(publication.packHash) || !hash(publication.releaseHash) || !nonblank(publication.packId) || !nonblank(publication.contentVersion) || !Array.isArray(p.facts) || !Array.isArray(p.directions) || !Array.isArray(p.gaps) || !Array.isArray(publication.sources) || !Array.isArray(publication.sourceReads) || !p.facts.every(fact => fact.temporalKind === 'historical_reference') || !p.directions.every(direction => direction.classification === 'proposed')) return { status: 'invalid', title: '县域资料暂不可用', detail: '发布状态、地区或内容分类未通过展示检查。', geography };
    return { status: 'ready', publication, geography, regionRef: { ...ref } };
  } catch {
    return { status: 'invalid', title: '请检查地区引用', detail: '地区信息格式无效，请重新选择县级地区。', geography: '' };
  }
}

function link(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}

/** Reading a source and recording support for this fact are separate statements. */
export function countySourceEvidence(publication: PublishedCountyProfile, sourceIds: readonly string[], factId?: string): CountyEvidenceSource[] {
  return [...new Set(sourceIds)].map(id => {
    const sources = publication.sources.filter(source => source.id === id), reads = publication.sourceReads.filter(read => read.sourceId === id);
    const source = sources.length === 1 ? sources[0] : null, read = reads.length === 1 ? reads[0] : null;
    const retrievedAt = date(source?.retrievedAt) ? source.retrievedAt : null;
    const actualRead = Boolean(source && read && instant(read.readAt) && retrievedAt && read.readAt.slice(0, 10) >= retrievedAt);
    const coverage: CountyEvidenceSource['coverage'] = read?.coverage === 'unread' ? 'unread' : actualRead && (read?.coverage === 'fulltext' || read?.coverage === 'listing_only') ? read.coverage : 'unrecorded';
    const covered = Boolean(factId && (coverage === 'fulltext' || coverage === 'listing_only') && Array.isArray(read?.supportedFactIds) && read.supportedFactIds.includes(factId));
    return {
      id, title: source?.title ?? `来源记录缺失（${id}）`, url: source ? link(source.url) : null, authority: source?.authority ?? '',
      publishedAt: date(source?.publishedAt) ? source.publishedAt : null, retrievedAt,
      sourceLocator: source?.locator ?? '', readLocator: read?.locator ?? '', coverage,
      readAt: (coverage === 'fulltext' || coverage === 'listing_only') && read ? read.readAt : null,
      scopeLabel: { fulltext: '已读原文', listing_only: '仅题录 / 名单已读', unread: '未读', unrecorded: '未登记实际阅读' }[coverage],
      supportLabel: factId ? covered ? coverage === 'fulltext' ? '已登记支持此事实' : '已登记覆盖此条目；仅限题录 / 名单' : '未登记支持此事实' : '拟议研究的背景资料',
    };
  });
}
