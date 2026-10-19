import publication from '@/content/knowledge/published.json';
import { exactKnowledgeEntry, type KnowledgePublication } from '@/lib/knowledge/publication';
import { isKnowledgeId } from '@/lib/knowledge/types';
export async function GET(_request:Request, {params}:{params:Promise<{entryId:string;version:string}>}) {
  const {entryId,version}=await params;
  if (!isKnowledgeId(entryId) || !/^[1-9][0-9]{0,9}$/.test(version) || Number(version)>2147483647) return Response.json({code:'knowledge_version_unavailable'},{status:404});
  const entry=exactKnowledgeEntry(publication as KnowledgePublication,entryId,Number(version));
  if (!entry) return Response.json({code:'knowledge_version_unavailable'},{status:404,headers:{'Cache-Control':'no-store'}});
  return Response.json(entry,{headers:{'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
}
