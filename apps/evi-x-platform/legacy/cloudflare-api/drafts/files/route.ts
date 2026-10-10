import { apiErrorResponse, noStoreJson } from "../../_lib/http";
import { editorOwner } from "../../_lib/editor-auth";
import { listOfficeFiles, officeStorage } from "@/db/office-repository";
import { OFFICE_LIMITS } from "@/lib/office-model";
import { uploadOffice } from "./_upload";
export async function GET(request: Request) {
  try { const owner = await editorOwner(request); return noStoreJson({ files: await listOfficeFiles(owner), scope: owner, storage: officeStorage().mode, available: true, limits: OFFICE_LIMITS }); }
  catch (error) { return apiErrorResponse(error); }
}
export async function POST(request: Request) {
  try { return noStoreJson(await uploadOffice(request), { status: 201 }); }
  catch (error) { return apiErrorResponse(error); }
}
