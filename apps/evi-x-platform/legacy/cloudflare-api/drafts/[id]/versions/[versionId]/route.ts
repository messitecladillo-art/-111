import { apiErrorResponse, noStoreJson } from "../../../../_lib/http";
import { editorOwner } from "../../../../_lib/editor-auth";
import { validateProjectId } from "../../../../_lib/security";
import { readDraftVersion } from "@/db/editor-repository";

type Context = { params: Promise<{ id: string; versionId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const owner = await editorOwner(request);
    const { id, versionId } = await context.params;
    return noStoreJson({ version: await readDraftVersion(validateProjectId(id), validateProjectId(versionId), owner) });
  } catch (error) { return apiErrorResponse(error); }
}
