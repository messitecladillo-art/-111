import { apiErrorResponse, assertOnlyKeys, noStoreJson, readJsonObject, ApiError } from "../_lib/http";
import { assertEditorOrigin, editorOwner } from "../_lib/editor-auth";
import { validateProjectId } from "../_lib/security";
import { createDraft, listDrafts } from "@/db/editor-repository";
import { EDITOR_LIMITS, parseEditorContent } from "@/lib/editor-model";
export async function GET(request: Request) {
  try { const owner = await editorOwner(request); return noStoreJson({ drafts: await listDrafts(owner), storage: "d1", scope: owner }); }
  catch (error) { return apiErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    assertEditorOrigin(request);
    const owner = await editorOwner(request);
    const input = await readJsonObject(request, EDITOR_LIMITS.bytes + 1000);
    assertOnlyKeys(input, ["id", "content"]);
    const id = validateProjectId(String(input.id));
    let content;
    try { content = parseEditorContent(input.content); } catch (e) { throw new ApiError(400, "invalid_draft", e instanceof Error ? e.message : "草稿格式不正确。"); }
    return noStoreJson({ draft: await createDraft(id, owner, content), storage: "d1" }, { status: 201 });
  } catch (error) { return apiErrorResponse(error); }
}
