import { apiErrorResponse, assertOnlyKeys, noStoreJson, readJsonObject, ApiError } from "../../../_lib/http";
import { assertEditorOrigin, editorOwner } from "../../../_lib/editor-auth";
import { validateProjectId } from "../../../_lib/security";
import { createDraftVersion, listDraftVersions } from "@/db/editor-repository";
import { DRAFT_VERSION_LIMIT, parseVersionLabel } from "@/lib/editor-model";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const owner = await editorOwner(request);
    const id = validateProjectId((await context.params).id);
    return noStoreJson({ versions: await listDraftVersions(id, owner), limit: DRAFT_VERSION_LIMIT });
  } catch (error) { return apiErrorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    assertEditorOrigin(request);
    const owner = await editorOwner(request);
    const draftId = validateProjectId((await context.params).id);
    const input = await readJsonObject(request, 2000);
    assertOnlyKeys(input, ["id", "label", "revision"]);
    const versionId = validateProjectId(String(input.id));
    if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1) throw new ApiError(400, "invalid_revision", "缺少有效草稿版本。");
    let label: string;
    try { label = parseVersionLabel(input.label); } catch (error) { throw new ApiError(400, "invalid_version_label", error instanceof Error ? error.message : "版本名称不正确。"); }
    return noStoreJson({ version: await createDraftVersion(draftId, versionId, owner, label, input.revision as number) }, { status: 201 });
  } catch (error) { return apiErrorResponse(error); }
}
