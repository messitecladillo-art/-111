import { apiErrorResponse, noStoreJson } from "../../_lib/http";
import { editorSession } from "../../_lib/editor-auth";
export async function POST(request: Request) {
  try { return noStoreJson({ ok: true }, { headers: await editorSession(request) }); }
  catch (error) { return apiErrorResponse(error); }
}
