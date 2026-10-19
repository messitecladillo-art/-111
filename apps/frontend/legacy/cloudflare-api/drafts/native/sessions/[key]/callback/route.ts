import { ApiError, apiErrorResponse, noStoreJson, readJsonObject } from "../../../../../_lib/http";
import { OFFICE_LIMITS } from "@/lib/office-model";
import { inspectOfficePackage } from "@/lib/office-package";
import { assertNativeKey, exactOnlyOfficeOutputUrl, requireOnlyOfficeServiceRequest, verifyOnlyOfficeOutbound } from "@/lib/onlyoffice-protocol";
import { commitNativeVersion, getNativeSession, markNativeSaving, markNativeState, nativeSessionIsLive } from "@/db/native-editor-repository";
type Context = { params: Promise<{ key: string }> };

async function readBoundedOutput(url: URL): Promise<Uint8Array<ArrayBuffer>> {
  let response: Response;
  try { response = await fetch(url.href, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(30_000) }); }
  catch { throw new ApiError(503, "native_output_unavailable", "未能从受控文档服务取得保存内容。"); }
  if (response.status !== 200 || response.redirected) throw new ApiError(503, "native_output_unavailable", "文档服务没有返回可保存的文件内容。");
  const announced = response.headers.get("content-length");
  if (announced !== null && (!/^\d+$/.test(announced) || Number(announced) > OFFICE_LIMITS.bytes)) throw new ApiError(413, "native_output_too_large", "文档服务返回的文件过大。");
  if (response.headers.has("content-encoding")) throw new ApiError(415, "native_output_encoded", "文档服务不得压缩返回的文件内容。");
  if (!response.body) throw new ApiError(503, "native_output_empty", "文档服务未返回文件内容。");
  const chunks: Uint8Array[] = []; let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > OFFICE_LIMITS.bytes) { await reader.cancel("native_output_too_large"); throw new ApiError(413, "native_output_too_large", "文档服务返回的文件过大。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!length) throw new ApiError(503, "native_output_empty", "文档服务未返回文件内容。");
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function POST(request: Request, context: Context) {
  try {
    const settings = requireOnlyOfficeServiceRequest(request);
    const key = assertNativeKey((await context.params).key);
    const payload = await verifyOnlyOfficeOutbound(request, settings.secret);
    const body = await readJsonObject(request, 16_384);
    if (body.token !== undefined || body.key !== payload.key || body.status !== payload.status || body.url !== payload.url || body.filetype !== payload.filetype) {
      throw new ApiError(403, "native_callback_signature_mismatch", "回调签名与正文不一致。");
    }
    if (payload.key !== key || !Number.isSafeInteger(payload.status)) throw new ApiError(403, "native_callback_key_mismatch", "回调不属于该编辑会话。");
    const row = await getNativeSession(key);
    if (!nativeSessionIsLive(row)) throw new ApiError(410, "native_session_expired", "编辑会话已过期。");
    if (payload.status === 1) { await markNativeState(key, "open"); return noStoreJson({ error: 0 }); }
    if (payload.status === 4) { await markNativeState(key, "closed"); return noStoreJson({ error: 0 }); }
    if (payload.status === 3 || payload.status === 7) { await markNativeState(key, "error"); return noStoreJson({ error: 0 }); }
    if (payload.status === 6) throw new ApiError(409, "native_forcesave_unsupported", "首版不支持强制保存；原文件未改变。");
    if (payload.status !== 2) throw new ApiError(400, "native_unknown_status", "文档服务返回了不支持的状态。");
    if (payload.filetype !== row.kind) throw new ApiError(400, "native_kind_mismatch", "保存内容与原文件类型不符。");
    const url = exactOnlyOfficeOutputUrl(payload.url, settings);
    // Persist the in-flight state before network or storage I/O. A status=4
    // callback cannot turn an active final save into a misleading close.
    const saving = await markNativeSaving(key);
    try {
      const bytes = await readBoundedOutput(url);
      try { inspectOfficePackage(bytes, saving.kind); }
      catch { throw new ApiError(400, "native_invalid_package", "编辑器返回的文件结构未通过检查；原文件未改变。"); }
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
      await commitNativeVersion(saving, bytes, sha256);
      return noStoreJson({ error: 0 });
    } catch (error) {
      if (error instanceof ApiError && error.code === "native_revision_conflict_recoverable") {
        // The edit bytes are durably stored as an owner-only recovery object.
        // ACK Docs to stop resend noise; the browser still sees conflict, not saved.
        return noStoreJson({ error: 0 });
      }
      if (error instanceof ApiError && error.code === "native_recovery_reservation_conflict") {
        await markNativeState(key, "conflict");
        throw error;
      }
      // A later authenticated retry may recover; never downgrade an already
      // saved or conflicted session if callbacks finish out of order.
      await markNativeState(key, "error");
      throw error;
    }
  } catch (error) { return apiErrorResponse(error); }
}
