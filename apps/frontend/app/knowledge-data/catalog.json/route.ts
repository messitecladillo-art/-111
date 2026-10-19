import publication from '@/content/knowledge/published.json';
import { currentKnowledgeEntries, type KnowledgePublication } from '@/lib/knowledge/publication';
export function GET() {
  const data = publication as KnowledgePublication;
  return Response.json({ schemaVersion:1, release:data.release, entries:currentKnowledgeEntries(data).map(entry=>({id:entry.id,version:entry.version,name:entry.name,domain:entry.domain,depth:entry.depth,updatedAt:entry.updatedAt})) },{headers:{'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
}
