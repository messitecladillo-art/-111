import { RESEARCH_METHOD_CARDS } from '@/lib/research-method-guide';
import { MATERIAL_CARDS } from '@/lib/research-materials';
import { createKnowledgeSearchClient } from '@/lib/knowledge/worker-client';
import { recommendKnowledge, selectedKnowledgeText } from '@/lib/knowledge/context';
import { DOMAINS, KNOWLEDGE_ENTRIES } from './catalog';

export const KNOWLEDGE_BUNDLE = {
  entries: KNOWLEDGE_ENTRIES,
  domains: DOMAINS,
  methodCards: RESEARCH_METHOD_CARDS,
  materialCards: MATERIAL_CARDS,
  createSearchClient: createKnowledgeSearchClient,
  recommendKnowledge,
  selectedKnowledgeText,
} as const;

export type KnowledgeBundle = typeof KNOWLEDGE_BUNDLE;
