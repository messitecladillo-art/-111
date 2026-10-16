/** Build-time only. The browser receives the active public projection, never the review ledger. */
import { rejectDuplicateMembers } from './questionnaire.ts';
import { freshTopicPublication, type PublishedCountyProfile } from './topic-publication.ts';
import { TOPIC_REGION_CATALOG } from './topic-advisor/regions.ts';

export type CountyPublicationProjection = {
  schemaVersion: 1;
  catalogVersion: string;
  registrySha256: string;
  profiles: readonly PublishedCountyProfile[];
};

function fail(message: string): never { throw new Error(`County publication registry: ${message}`); }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

export async function projectCountyPublications(raw: string): Promise<CountyPublicationProjection> {
  if (typeof raw !== 'string') fail('JSON text required');
  const bytes = new TextEncoder().encode(raw);
  if (bytes.length > 8 * 1024 * 1024) fail('registry exceeds 8 MiB');
  let value: unknown;
  try { rejectDuplicateMembers(raw); value = JSON.parse(raw); } catch { return fail('invalid JSON or duplicate members'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('object required');
  const registry = value as Record<string, unknown>;
  if (Object.keys(registry).length !== 2 || registry.schemaVersion !== 1 || !Object.hasOwn(registry, 'histories')) fail('schema mismatch');
  if (!Array.isArray(registry.histories) || registry.histories.length > 64) fail('at most 64 pack histories');

  const packs = new Set<string>(), counties = new Set<string>(), profiles: PublishedCountyProfile[] = [];
  for (const history of registry.histories) {
    if (!Array.isArray(history) || !history.length) fail('each history must contain a release');
    // This verifies the entire chain, exact reviews, withdrawal targets and current geography.
    const active = await freshTopicPublication(history);
    const packId = history[0].draft.pack.id as string;
    if (packs.has(packId)) fail('duplicate pack history');
    packs.add(packId);
    for (const publication of active) {
      const code = publication.profile.regionRef.code;
      if (counties.has(code)) fail('multiple active packs cover the same county');
      counties.add(code);
      // A shared source may support unpublished counties. Keep only this profile's claims/read scope.
      const view: PublishedCountyProfile = JSON.parse(JSON.stringify(publication));
      view.sources = view.sources.map(source => ({
        ...source,
        supportedClaims: source.supportedClaims.filter(claim => view.profile.facts.some(fact => fact.sourceIds.includes(source.id) && fact.text === claim)),
      }));
      view.sourceReads = view.sourceReads.map(read => ({
        ...read,
        supportedFactIds: read.supportedFactIds.filter(id => view.profile.facts.some(fact => fact.id === id && fact.sourceIds.includes(read.sourceId))),
      }));
      profiles.push(view);
    }
  }
  profiles.sort((a, b) => a.profile.regionRef.code.localeCompare(b.profile.regionRef.code));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const registrySha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return freeze({ schemaVersion: 1, catalogVersion: TOPIC_REGION_CATALOG.catalogVersion, registrySha256, profiles });
}
