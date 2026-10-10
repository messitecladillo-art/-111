import { ApiError, apiErrorResponse, assertOnlyKeys, noStoreJson, readJsonObject } from "../../../_lib/http";
import { editorCookieToken, editorOwner, hasEditorAlternateIdentity } from "../../../_lib/editor-auth";
import { validateProjectId } from "../../../_lib/security";
import { createNativeSession } from "@/db/native-editor-repository";
import { requireOnlyOfficeBrowserRequest, signOnlyOfficeConfig } from "@/lib/onlyoffice-protocol";

export async function POST(request: Request) {
  try {
    const settings = requireOnlyOfficeBrowserRequest(request);
    if (request.headers.get("origin") !== settings.browserAppOrigin || request.headers.get("sec-fetch-site") === "cross-site" || request.headers.get("x-native-editor-intent") !== "open") {
      throw new ApiError(403, "native_open_forbidden", "请在系统内明确打开原生编辑器。");
    }
    if (!request.headers.get("x-editor-scope")) throw new ApiError(409, "native_scope_required", "请先连接原文件库并确认编辑身份。");
    if (!editorCookieToken(request) || hasEditorAlternateIdentity(request)) throw new ApiError(401, "editor_session_required", "原生编辑仅支持当前已连接的文件库会话。");
    const owner = await editorOwner(request);
    const body = await readJsonObject(request, 1024);
    assertOnlyKeys(body, ["fileId", "revision"]);
    const fileId = validateProjectId(String(body.fileId ?? ""));
    const revision = body.revision;
    if (!Number.isSafeInteger(revision) || Number(revision) < 1 || Number(revision) > 19) throw new ApiError(400, "native_invalid_revision", "文件版本号无效。");
    const session = await createNativeSession(owner, fileId, Number(revision));
    const sourceUrl = `${settings.appOrigin}/api/drafts/native/sessions/${session.key}/source`;
    const callbackUrl = `${settings.appOrigin}/api/drafts/native/sessions/${session.key}/callback`;
    const ext = `.${session.kind}`;
    const title = session.filename.length <= 128 ? session.filename : session.filename.slice(0, 128 - ext.length) + ext;
    const config: Record<string, unknown> = {
      documentType: session.kind === "docx" ? "word" : "slide",
      type: "desktop",
      document: {
        fileType: session.kind, key: session.key, title, url: sourceUrl,
        permissions: { edit: true, download: true, copy: true, print: true, comment: false, review: false, chat: false },
      },
      editorConfig: {
        callbackUrl, mode: "edit", lang: "zh",
        user: { id: `u_${session.key.slice(3, 19)}`, name: "编辑者" },
        customization: { forcesave: false },
      },
    };
    const token = await signOnlyOfficeConfig(config, settings.secret);
    return noStoreJson({ scriptUrl: settings.scriptUrl, shellUrl: settings.shellUrl, config: { ...config, token },
      session: { key: session.key, fileId: session.file_id, revision: session.base_revision } }, { status: 201 });
  } catch (error) { return apiErrorResponse(error); }
}
