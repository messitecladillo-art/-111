import { validateKnowledgePack, type KnowledgeEntry, type KnowledgePack } from './types.ts';

export type KnowledgePublication = { schemaVersion: 1; release: string; entries: KnowledgeEntry[] };
/** Exact versions remain available even when a newer entry is published. */
export function assembleKnowledgePublication(release: string, packs: KnowledgePack[], previous?: KnowledgePublication): KnowledgePublication {
  const versions = new Map<string, KnowledgeEntry>();
  if (previous) {
    if(previous.schemaVersion!==1 || typeof previous.release!=='string' || !Array.isArray(previous.entries)) throw Error('Invalid previous knowledge publication');
    for(const entry of previous.entries) {
      const key=`${entry.id}@${entry.version}`;
      if(versions.has(key)) throw Error('Duplicate archived version: '+key);
      versions.set(key,entry);
    }
  }
  for (const pack of packs) for (const entry of pack.entries) {
    if (entry.review.status !== 'reviewed') throw Error('Unreviewed entry in publication: ' + entry.id);
    const key = `${entry.id}@${entry.version}`, existing = versions.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) throw Error('Published version changed: ' + key);
    versions.set(key, entry);
  }
  const entries = [...versions.values()].sort((a,b) => a.id.localeCompare(b.id,'en') || a.version-b.version);
  const latest = currentKnowledgeEntries({ schemaVersion:1, release, entries });
  if(entries.some(entry=>entry.review.status!=='reviewed')) throw Error('Unreviewed archived entry');
  validateKnowledgePack({ schemaVersion:1, version:release, entries:latest });
  // Validate old versions with the same reference vocabulary, not by overwriting them.
  for (const old of entries) {
    if (latest.find(entry => entry.id===old.id)?.version!==old.version) validateKnowledgePack({ schemaVersion:1, version:release, entries:latest.map(entry => entry.id===old.id ? old : entry) });
  }
  return { schemaVersion:1, release, entries };
}
export function currentKnowledgeEntries(publication: KnowledgePublication): KnowledgeEntry[] {
  const latest = new Map<string, KnowledgeEntry>();
  for (const entry of publication.entries) if (!latest.has(entry.id) || latest.get(entry.id)!.version < entry.version) latest.set(entry.id, entry);
  return [...latest.values()];
}
export function exactKnowledgeEntry(publication: KnowledgePublication, id: string, version: number) {
  return publication.entries.find(entry => entry.id===id && entry.version===version);
}
