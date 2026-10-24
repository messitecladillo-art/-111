import { apiErrorResponse, ApiError, noStoreJson } from "../../../_lib/http";
import { getEditorRecovery, setEditorRecovery } from "../../../../../db/editor-recovery-repository";
import { recoveryBody, recoveryOwner } from "../_recovery";

export async function GET(request: Request) {
  try {
    const scope = await recoveryOwner(request, false);
    return noStoreJson({ scope, recovery: await getEditorRecovery(scope) });
  } catch (error) { return apiErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const scope = await recoveryOwner(request, true);
    const { body, verifierHash } = await recoveryBody(request, ["key", "revision"]);
    if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= 1_000_000) throw new ApiError(400, "invalid_recovery_revision", "恢复密钥版本无效，请刷新身份状态。");
    return noStoreJson({ scope, recovery: await setEditorRecovery(scope, verifierHash, body.revision) });
  } catch (error) { return apiErrorResponse(error); }
}
