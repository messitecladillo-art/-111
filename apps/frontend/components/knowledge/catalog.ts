import publication from '@/content/knowledge/published.json';
import { currentKnowledgeEntries, type KnowledgePublication } from '@/lib/knowledge/publication';

// Publication is a separate semantic review boundary, not a schema validation result.
export const KNOWLEDGE_ENTRIES = currentKnowledgeEntries(publication as KnowledgePublication);
export const KNOWLEDGE_VERSION = publication.release;
export { DOMAINS } from './domains';
