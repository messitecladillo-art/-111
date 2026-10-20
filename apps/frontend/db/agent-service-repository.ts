import { env } from 'cloudflare:workers';
import {
  SERVICE_LIMIT, ServiceError, decryptServiceKey, encryptServiceKey, parseServiceInput,
  parseServiceUsage, serviceId, serviceOwner, serviceRevision,
  type EncryptedServiceKey, type MasterKey, type ServiceConfig, type ServiceInput, type ServiceUsage,
} from '../lib/agent-services';

type Row = {
  id: string; owner_hash: string; label: string; provider: string; base_url: string; model: string;
  capabilities: string; max_output_tokens: number; revision: number;
  key_version: number; key_id: string; key_iv: string; key_ciphertext: string;
};
const columns = 'id,label,provider,base_url,model,capabilities,max_output_tokens,revision';
async function configHash(input: ServiceInput | ServiceConfig): Promise<string> {
  const raw=JSON.stringify([input.id,input.label,input.provider,input.baseUrl,input.model,input.capabilities,input.maxOutputTokens]);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export const SERVICE_USAGE_LIMIT = 1000;

async function withDatabase<T>(operation: (db: D1Database) => Promise<T>): Promise<T> {
  try {
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) throw new Error('unavailable');
    return await operation(db);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    // Driver messages can contain SQL and bound values; never expose them.
    throw new ServiceError(503, 'service_storage_unavailable', '服务配置存储暂时不可用。');
  }
}
function config(row: Row): ServiceConfig {
  try {
    const parsed = parseServiceInput({
      id: row.id, label: row.label, provider: row.provider, baseUrl: row.base_url, model: row.model,
      capabilities: JSON.parse(row.capabilities), maxOutputTokens: row.max_output_tokens,
    });
    return { ...parsed, revision: serviceRevision(row.revision) };
  } catch {
    throw new ServiceError(409, 'service_config_integrity', '服务配置校验失败，请重新配置。');
  }
}
function envelope(row: Row): EncryptedServiceKey {
  return { version: row.key_version as 1, keyId: row.key_id, iv: row.key_iv, ciphertext: row.key_ciphertext };
}
async function owned(db: D1Database, owner: string, id: string): Promise<Row | null> {
  return db.prepare('SELECT * FROM agent_services WHERE owner_hash=? AND id=?').bind(owner, id).first<Row>();
}
function missing(): ServiceError {
  return new ServiceError(404, 'service_not_found', '服务配置不存在或无权访问。');
}
function conflict(): ServiceError {
  return new ServiceError(409, 'service_revision_conflict', '服务配置已更新，请刷新后重试。');
}

/** Returned configurations never include key material, key IDs or key suffixes. */
export async function listServices(owner: string): Promise<ServiceConfig[]> {
  serviceOwner(owner);
  return withDatabase(async db => {
    const rows = await db.prepare(`SELECT ${columns} FROM agent_services WHERE owner_hash=? ORDER BY updated_at DESC,id DESC LIMIT ?`)
      .bind(owner, SERVICE_LIMIT).all<Row>();
    return rows.results.map(config);
  });
}

/** expectedRevision=0 creates; updates require the currently observed revision. */
export async function saveService(owner: string, value: unknown, expectedRevision: number, master: MasterKey): Promise<ServiceConfig> {
  serviceOwner(owner); serviceRevision(expectedRevision, true);
  const input: ServiceInput = parseServiceInput(value);
  if (expectedRevision === 2_147_483_647) throw conflict();
  return withDatabase(async db => {
    const prior = await owned(db, owner, input.id);
    if (expectedRevision === 0 && prior) throw conflict();
    if (expectedRevision !== 0 && !prior) throw missing();
    if (prior && prior.revision !== expectedRevision) throw conflict();
    let secret = input.apiKey;
    if (secret === undefined) {
      if (!prior) throw new ServiceError(400, 'service_key_required', '首次配置需要 API Key。');
      if (prior.provider !== input.provider || prior.base_url !== input.baseUrl) {
        throw new ServiceError(400, 'service_key_required', '更换服务商或服务地址需要重新输入 API Key。');
      }
      secret = await decryptServiceKey(envelope(prior), { owner, id: input.id, revision: expectedRevision,configSha256:await configHash(config(prior)) }, master);
    }
    const revision = expectedRevision + 1;
    const sealed = await encryptServiceKey(secret, { owner, id: input.id, revision,configSha256:await configHash(input) }, master);
    const now = new Date().toISOString();
    const parameters = [input.label, input.provider, input.baseUrl, input.model, JSON.stringify(input.capabilities), input.maxOutputTokens,
      revision, sealed.version, sealed.keyId, sealed.iv, sealed.ciphertext, now];
    let saved: Row | null;
    if (expectedRevision === 0) {
      saved = await db.prepare(`INSERT INTO agent_services(label,provider,base_url,model,capabilities,max_output_tokens,revision,key_version,key_id,key_iv,key_ciphertext,updated_at,id,owner_hash,created_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM agent_services WHERE owner_hash=?)<?
        ON CONFLICT(owner_hash,id) DO NOTHING RETURNING ${columns}`)
        .bind(...parameters, input.id, owner, now, owner, SERVICE_LIMIT).first<Row>();
    } else {
      saved = await db.prepare(`UPDATE agent_services SET label=?,provider=?,base_url=?,model=?,capabilities=?,max_output_tokens=?,revision=?,key_version=?,key_id=?,key_iv=?,key_ciphertext=?,updated_at=?
        WHERE owner_hash=? AND id=? AND revision=? RETURNING ${columns}`)
        .bind(...parameters, owner, input.id, expectedRevision).first<Row>();
    }
    if (saved) return config(saved);
    if (expectedRevision !== 0 || await owned(db, owner, input.id)) throw conflict();
    throw new ServiceError(409, 'service_limit', `最多保存 ${SERVICE_LIMIT} 个服务配置。`);
  });
}

/** Server-only access; routes must never serialize this object to the browser. */
export async function readService(owner: string, id: string, master: MasterKey): Promise<{ config: ServiceConfig; apiKey: string }> {
  serviceOwner(owner); serviceId(id);
  return withDatabase(async db => {
    const row = await owned(db, owner, id);
    if (!row) throw missing();
    const summary = config(row);
    const secret = await decryptServiceKey(envelope(row), { owner, id, revision: summary.revision,configSha256:await configHash(summary) }, master);
    return { config: summary, apiKey: secret };
  });
}
export async function removeService(owner: string, id: string, expectedRevision: number): Promise<void> {
  serviceOwner(owner); serviceId(id); serviceRevision(expectedRevision);
  return withDatabase(async db => {
    const deleted = await db.prepare('DELETE FROM agent_services WHERE owner_hash=? AND id=? AND revision=? RETURNING id')
      .bind(owner, id, expectedRevision).first();
    if (deleted) return;
    if (!await owned(db, owner, id)) throw missing();
    throw conflict();
  });
}

/** Bounded metadata only: no request prompts, responses, headers or API keys. */
export async function recordServiceUsage(owner: string, value: ServiceUsage): Promise<void> {
  serviceOwner(owner);
  const usage = parseServiceUsage(value);
  return withDatabase(async db => {
    const statements = [
      db.prepare(`INSERT INTO agent_service_usage(id,owner_hash,service_id,service_revision,capability,status,duration_ms,input_tokens,output_tokens,error_code,created_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM agent_services WHERE owner_hash=? AND id=? AND revision>=?)
        ON CONFLICT(owner_hash,id) DO NOTHING RETURNING id`)
        .bind(usage.id, owner, usage.serviceId, usage.serviceRevision, usage.capability, usage.status, usage.durationMs,
          usage.inputTokens ?? null, usage.outputTokens ?? null, usage.errorCode ?? null, new Date().toISOString(), owner, usage.serviceId, usage.serviceRevision),
      db.prepare(`DELETE FROM agent_service_usage WHERE owner_hash=? AND id IN
        (SELECT id FROM agent_service_usage WHERE owner_hash=? ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET ?)`)
        .bind(owner, owner, SERVICE_USAGE_LIMIT),
    ];
    const result = await db.batch(statements);
    if (!result[0].success) throw new Error('usage write failed');
    // Duplicate request IDs are idempotent; the route assigns IDs, never the client.
    const receipt = await db.prepare('SELECT service_id,service_revision,capability,status,duration_ms,input_tokens,output_tokens,error_code FROM agent_service_usage WHERE owner_hash=? AND id=?')
      .bind(owner, usage.id).first<{ service_id: string; service_revision: number; capability: string; status: string; duration_ms: number; input_tokens: number | null; output_tokens: number | null; error_code: string | null }>();
    if (!receipt) throw missing();
    if (receipt.service_id !== usage.serviceId || receipt.service_revision !== usage.serviceRevision || receipt.capability !== usage.capability ||
      receipt.status !== usage.status || receipt.duration_ms !== usage.durationMs || receipt.input_tokens !== (usage.inputTokens ?? null) ||
      receipt.output_tokens !== (usage.outputTokens ?? null) || receipt.error_code !== (usage.errorCode ?? null)) {
      throw new ServiceError(409, 'service_usage_id_reused', '调用标识已绑定另一份记录。');
    }
  });
}
