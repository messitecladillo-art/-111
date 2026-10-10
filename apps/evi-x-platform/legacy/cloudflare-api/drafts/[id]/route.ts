import { apiErrorResponse, assertOnlyKeys, noStoreJson, readJsonObject, ApiError } from "../../_lib/http";
import { assertEditorOrigin, editorOwner } from "../../_lib/editor-auth";
import { validateProjectId } from "../../_lib/security";
import { readDraft, updateDraft } from "@/db/editor-repository";
import { EDITOR_LIMITS, parseEditorContent } from "@/lib/editor-model";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { return noStoreJson({ draft: await readDraft(validateProjectId((await context.params).id), await editorOwner(request)) }); }
  catch (error) { return apiErrorResponse(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    assertEditorOrigin(request);
    const owner = await editorOwner(request);
    const id = validateProjectId((await context.params).id);
    const input = await readJsonObject(request, EDITOR_LIMITS.bytes + 1000);
    assertOnlyKeys(input, ["revision", "content"]);
    if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1) throw new ApiError(400, "invalid_revision", "缺少有效草稿版本。");
    let content;
    try { content = parseEditorContent(input.content); } catch (e) { throw new ApiError(400, "invalid_draft", e instanceof Error ? e.message : "草稿格式不正确。"); }
    return noStoreJson({ draft: await updateDraft(id, owner, input.revision as number, content) });
  } catch (error) { return apiErrorResponse(error); }
}
