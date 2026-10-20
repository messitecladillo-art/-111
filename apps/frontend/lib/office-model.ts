/** Binary Office files are independent of the legacy structured text drafts. */
export const OFFICE_LIMITS = { bytes: 20 * 1024 * 1024, files: 20, versions: 20 } as const;
export type OfficeKind = "docx" | "pptx";
export const OFFICE_MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;
export type OfficeFileSummary = { id: string; filename: string; kind: OfficeKind; revision: number; sha256: string; size: number; updatedAt: string };
export type OfficeVersion = { id: string; fileId: string; revision: number; filename: string; kind: OfficeKind; size: number; sha256: string; label: string; createdAt: string };

export function parseOfficeFilename(value: unknown): { filename: string; kind: OfficeKind } {
  if (typeof value !== "string" || value.length < 6 || value.length > 180 || value !== value.trim()
    || /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
    || /[. ]$/.test(value) || value.startsWith(".") || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value)) {
    throw new Error("文件名须为 6–180 个字符，不能含路径、控制字符或系统保留名称。");
  }
  // Reject unpaired UTF-16 surrogates without changing the user's filename.
  try { encodeURIComponent(value); } catch { throw new Error("文件名包含无效字符。"); }
  const extension = value.slice(-5).toLowerCase();
  if (extension !== ".docx" && extension !== ".pptx") throw new Error("仅支持未加密的 .docx 和 .pptx 文件。");
  return { filename: value, kind: extension.slice(1) as OfficeKind };
}
export function parseOfficeLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 80 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) throw new Error("版本说明须为 1–80 个字符，不能含控制字符。");
  try { encodeURIComponent(value); } catch { throw new Error("版本说明包含无效字符。"); }
  return value.trim();
}
export function officeDisposition(filename: string, kind: OfficeKind): string {
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="document.${kind}"; filename*=UTF-8''${encoded}`;
}
