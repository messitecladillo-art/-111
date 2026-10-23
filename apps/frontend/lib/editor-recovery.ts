// Public format and browser-safe helpers. Keys are credentials, not document data.
export const EDITOR_RECOVERY_EVENT = "evix-editor-identity-transition-v1";
export const EDITOR_RECOVERY_CHANNEL = "evix-editor-identity-transition-v1";
const KEY = /^evxr_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
export function parseRecoveryKey(value: unknown): string {
  if (typeof value !== "string" || !KEY.test(value)) throw new Error("恢复密钥格式无效，请粘贴完整密钥，不要输入文件内容。");
  return value;
}
export function createRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `evxr_${btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}
