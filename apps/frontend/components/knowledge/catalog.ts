import publication from '@/content/knowledge/published.json';
import { currentKnowledgeEntries, type KnowledgePublication } from '@/lib/knowledge/publication';

// Publication is a separate semantic review boundary, not a schema validation result.
export const KNOWLEDGE_ENTRIES = currentKnowledgeEntries(publication as KnowledgePublication);
export const KNOWLEDGE_VERSION = publication.release;
export const DOMAINS: Record<string, string> = {
  stats: '统计与抽样', math: '数学', computing: '计算机与数据', ml: '机器学习',
  research: '调查与研究', philosophy: '哲学与论证', geography: '地理与空间', social: '经济与社会',
};
