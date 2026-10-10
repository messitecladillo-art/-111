import { apiErrorResponse, noStoreJson } from "../../../_lib/http";
import { editorCookieHeader, newEditorToken } from "../../../_lib/editor-auth";
import { sha256Hex } from "../../../_lib/security";
import { restoreEditorRecovery } from "../../../../../db/editor-recovery-repository";
import { recoveryBody, recoveryOwner } from "../_recovery";

export async function POST(request: Request) {
  try {
    await recoveryOwner(request, true);
    const { verifierHash } = await recoveryBody(request, ["key"]);
    const token = newEditorToken();
    const result = await restoreEditorRecovery(verifierHash, await sha256Hex(`editor:${token}`));
    return noStoreJson({ ok: true, scope: result.owner }, { headers: { "set-cookie": editorCookieHeader(request, token) } });
  } catch (error) { return apiErrorResponse(error); }
}
