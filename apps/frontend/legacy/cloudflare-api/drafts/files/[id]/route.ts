import { apiErrorResponse, noStoreJson } from "../../../_lib/http";
import { editorOwner } from "../../../_lib/editor-auth";
import { validateProjectId } from "../../../_lib/security";
import { listOfficeVersions, readOfficeFile } from "@/db/office-repository";
import { uploadOffice } from "../_upload";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { const id = validateProjectId((await context.params).id); const owner = await editorOwner(request); return noStoreJson({ file: await readOfficeFile(id, owner), versions: await listOfficeVersions(id, owner) }); }
  catch (error) { return apiErrorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try { return noStoreJson(await uploadOffice(request, validateProjectId((await context.params).id)), { status: 201 }); }
  catch (error) { return apiErrorResponse(error); }
}
