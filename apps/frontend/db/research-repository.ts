import { env } from 'cloudflare:workers';
import { ApiError } from '../app/api/_lib/http';
import { sha256Hex } from '../app/api/_lib/security';
import { readDraft } from './editor-repository';
import { DRAFT_VERSION_LIMIT, parseEditorContent, type ReportSection } from '../lib/editor-model';
import { appendEvidence, evidenceSection, evidenceContract, FLOW_LIMIT, parseEvidence, type EvidenceInput, type ResearchRun } from '../lib/research-flow';

function database(): D1Database {
  const db = (env as unknown as {DB?:D1Database}).DB;
  if (!db) throw new ApiError(503,'research_storage_unavailable','任务存储未连接，汇总未保存。请保留本页或下载本地分析记录。');
  return db;
}
type Row = {id:string;draft_id:string;base_revision:number;input:string;input_hash:string;proposal:string;proposal_hash:string;status:ResearchRun['status'];created_at:string;decided_at:string|null;accepted_revision:number|null;before_id:string;version_id:string;current_revision:number};
const selection = 'SELECT r.*,d.revision AS current_revision FROM research_runs r JOIN editor_drafts d ON d.id=r.draft_id AND d.owner_hash=r.owner_hash';
function output(row: Row): ResearchRun {
  return {id:row.id,draftId:row.draft_id,baseRevision:row.base_revision,input:parseEvidence(JSON.parse(row.input)),inputHash:row.input_hash,proposal:JSON.parse(row.proposal),proposalHash:row.proposal_hash,status:row.status,createdAt:row.created_at,decidedAt:row.decided_at,acceptedRevision:row.accepted_revision,versionId:row.version_id,currentRevision:row.current_revision,
    events:[{type:'aggregate_saved',at:row.created_at},{type:'summary_checked',at:row.created_at},{type:'proposal_ready',at:row.created_at},...(row.decided_at?[{type:row.status,at:row.decided_at}]:[])]};
}
async function owned(id:string,owner:string): Promise<Row|null> {return database().prepare(`${selection} WHERE r.id=? AND r.owner_hash=?`).bind(id,owner).first<Row>();}
export async function readResearchRun(id:string,owner:string) {
  const row = await owned(id,owner); if(!row) throw new ApiError(404,'run_not_found','记录不存在或无权访问。'); return output(row);
}
export async function listResearchRuns(owner:string) {
  const rows = await database().prepare(`${selection} WHERE r.owner_hash=? ORDER BY r.created_at DESC,r.id DESC LIMIT ?`).bind(owner,FLOW_LIMIT).all<Row>();
  return rows.results.map(output);
}
export async function createResearchRun(id:string,owner:string,draftId:string,baseRevision:number,input:EvidenceInput) {
  const inputHash=await sha256Hex(JSON.stringify({version:evidenceContract(input),draftId,baseRevision,input}));
  const retry=(row:Row)=>{if(row.input_hash!==inputHash)throw new ApiError(409,'run_id_reused','这次任务标识已绑定另一份输入，未覆盖原记录。');return output(row);};
  const existing=await owned(id,owner);if(existing)return retry(existing);
  const draft=await readDraft(draftId,owner);
  if(draft.revision!==baseRevision)throw new ApiError(409,'draft_conflict','目标报告已更新，请刷新报告列表并重新预览提案。');
  const proposal=evidenceSection(input,id);
  try{appendEvidence(draft.content,proposal);}catch(e){throw new ApiError(400,'proposal_too_large',(e as Error).message);}
  const proposalHash=await sha256Hex(JSON.stringify({inputHash,proposal}));
  const time=new Date().toISOString();
  const saved=await database().prepare(`INSERT INTO research_runs(id,owner_hash,draft_id,base_revision,input,input_hash,proposal,proposal_hash,status,before_id,version_id,created_at)
    SELECT ?,?,?,?,?,?,?,?,'pending',?,?,? WHERE EXISTS(SELECT 1 FROM editor_drafts WHERE id=? AND owner_hash=? AND revision=?) AND (SELECT COUNT(*) FROM research_runs WHERE owner_hash=?)<? ON CONFLICT(id) DO NOTHING RETURNING id`)
    .bind(id,owner,draftId,baseRevision,JSON.stringify(input),inputHash,JSON.stringify(proposal),proposalHash,crypto.randomUUID(),crypto.randomUUID(),time,draftId,owner,baseRevision,owner,FLOW_LIMIT).first();
  if(saved)return readResearchRun(id,owner);
  const raced=await owned(id,owner);if(raced)return retry(raced);
  throw new ApiError(409,'run_capacity_or_conflict',`报告已更新或任务记录已达 ${FLOW_LIMIT} 条上限。已有记录未删除，请刷新核对。`);
}
export async function decideResearchRun(id:string,owner:string,action:'accept'|'cancel',proposalHash:string) {
  const row=await owned(id,owner);if(!row)throw new ApiError(404,'run_not_found','记录不存在或无权访问。');
  if(row.proposal_hash!==proposalHash)throw new ApiError(409,'proposal_changed','确认凭据与提案内容不一致，请重新打开提案。');
  if(row.status==='accepted'&&action==='accept'||row.status==='cancelled'&&action==='cancel')return output(row);
  if(row.status!=='pending')throw new ApiError(409,'run_terminal','这条记录已处理，不能改变决定。');
  const db=database(),time=new Date().toISOString();
  if(action==='cancel'){
    await db.prepare("UPDATE research_runs SET status='cancelled',decided_at=? WHERE id=? AND owner_hash=? AND status='pending' AND proposal_hash=?").bind(time,id,owner,proposalHash).run();
    const result=await readResearchRun(id,owner);if(result.status!=='cancelled')throw new ApiError(409,'run_terminal','确认已先完成，取消没有撤销已保存的版本。');return result;
  }
  const current=await readDraft(row.draft_id,owner);
  if(current.revision!==row.base_revision){
    const raced=await owned(id,owner);if(raced?.status==='accepted'&&raced.proposal_hash===proposalHash)return output(raced);
    throw new ApiError(409,'draft_conflict','报告已有更新；旧提案不会覆盖它。请取消旧提案并基于最新报告重新生成。');
  }
  // Revalidate saved aggregate and template before any write. No LLM bypass.
  const input=parseEvidence(JSON.parse(row.input));
  const verifiedInputHash=await sha256Hex(JSON.stringify({version:evidenceContract(input),draftId:row.draft_id,baseRevision:row.base_revision,input}));
  if(verifiedInputHash!==row.input_hash)throw new ApiError(409,'input_integrity','保存的证据输入与指纹不一致，未写入报告。');
  const proposal=evidenceSection(input,id);
  if(JSON.stringify(proposal)!==row.proposal || await sha256Hex(JSON.stringify({inputHash:row.input_hash,proposal}))!==row.proposal_hash)throw new ApiError(409,'proposal_integrity','提案校验失败，未写入报告。');
  let content;
  try{content=appendEvidence(parseEditorContent(current.content),proposal as ReportSection);}catch(e){throw new ApiError(400,'proposal_invalid',(e as Error).message);}
  const serialized=JSON.stringify(content), token=crypto.randomUUID();
  // D1 batch is one transaction. A unique fencing token means only this
  // invocation can commit. Missing receipts fail the CHECK and roll back all.
  await db.batch([
    db.prepare(`UPDATE research_runs SET status='accepting',commit_token=? WHERE id=? AND owner_hash=? AND status='pending' AND proposal_hash=? AND EXISTS(SELECT 1 FROM editor_drafts WHERE id=? AND owner_hash=? AND revision=?) AND (SELECT COUNT(*) FROM editor_versions WHERE draft_id=?)<=?`).bind(token,id,owner,proposalHash,row.draft_id,owner,row.base_revision,row.draft_id,DRAFT_VERSION_LIMIT-2),
    db.prepare(`INSERT INTO editor_versions(id,draft_id,label,source_revision,content,created_at) SELECT r.before_id,d.id,'证据写入前',d.revision,d.content,? FROM research_runs r JOIN editor_drafts d ON d.id=r.draft_id AND d.owner_hash=r.owner_hash WHERE r.id=? AND r.owner_hash=? AND r.status='accepting' AND r.commit_token=? AND d.revision=r.base_revision`).bind(time,id,owner,token),
    db.prepare(`UPDATE editor_drafts SET content=?,revision=revision+1,updated_at=? WHERE id=? AND owner_hash=? AND revision=? AND EXISTS(SELECT 1 FROM research_runs WHERE id=? AND owner_hash=? AND status='accepting' AND commit_token=?)`).bind(serialized,time,row.draft_id,owner,row.base_revision,id,owner,token),
    db.prepare(`INSERT INTO editor_versions(id,draft_id,label,source_revision,content,created_at) SELECT r.version_id,d.id,'证据确认版本',d.revision,d.content,? FROM research_runs r JOIN editor_drafts d ON d.id=r.draft_id AND d.owner_hash=r.owner_hash WHERE r.id=? AND r.owner_hash=? AND r.status='accepting' AND r.commit_token=? AND d.revision=r.base_revision+1 AND d.content=?`).bind(time,id,owner,token,serialized),
    db.prepare(`UPDATE research_runs SET status='accepted',decided_at=?,before_receipt_id=(SELECT id FROM editor_versions WHERE id=? AND draft_id=? AND source_revision=?),after_receipt_id=(SELECT id FROM editor_versions WHERE id=? AND draft_id=? AND source_revision=? AND content=?),accepted_revision=(SELECT source_revision FROM editor_versions WHERE id=? AND draft_id=? AND source_revision=? AND content=?) WHERE id=? AND owner_hash=? AND status='accepting' AND commit_token=?`).bind(time,row.before_id,row.draft_id,row.base_revision,row.version_id,row.draft_id,row.base_revision+1,serialized,row.version_id,row.draft_id,row.base_revision+1,serialized,id,owner,token),
  ]);
  const result=await readResearchRun(id,owner);
  if(result.status==='accepted')return result;
  if(result.status==='cancelled')throw new ApiError(409,'run_cancelled','提案已取消，没有写入报告。');
  throw new ApiError(409,'draft_conflict_or_capacity','报告版本已变化，或命名版本库不足两个空位；未做任何修改。请刷新核对。');
}
