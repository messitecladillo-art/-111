import { env } from 'cloudflare:workers';
import { ApiError } from '../app/api/_lib/http';
function database(): D1Database {
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(!db) throw new ApiError(503,'agent_storage_unavailable','服务配置存储尚未连接。');
  return db;
}
export async function reserveAgentCall(owner:string,id:string,serviceId:string,revision:number,kind:'test'|'questionnaire'):Promise<void> {
  if(!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(serviceId) || !Number.isInteger(revision)||revision<1) throw new ApiError(400,'agent_call_invalid','请求标识无效。');
  const now=Date.now();
  const db=database();
  const row=await db.prepare(`INSERT INTO agent_service_calls(id,owner_hash,service_id,service_revision,kind,state,started_at)
    SELECT ?,?,?,?,?,'pending',? WHERE
    NOT EXISTS(SELECT 1 FROM agent_service_calls WHERE owner_hash=? AND state='pending' AND started_at>?) AND
    (SELECT COUNT(*) FROM agent_service_calls WHERE owner_hash=? AND started_at>?)<12
    ON CONFLICT(owner_hash,id) DO NOTHING RETURNING id`).bind(id,owner,serviceId,revision,kind,now,owner,now-60000,owner,now-3600000).first<{id:string}>();
  if(!row) throw new ApiError(409,'agent_call_reserved','这个请求已发起，或当前调用仍在运行、已达到每小时上限。不会自动重复调用。');
}
export async function finishAgentCall(owner:string,id:string,state:'succeeded'|'failed'|'unknown'):Promise<void> {
  await database().prepare("UPDATE agent_service_calls SET state=?,finished_at=? WHERE owner_hash=? AND id=? AND state='pending'").bind(state,Date.now(),owner,id).run();
}
