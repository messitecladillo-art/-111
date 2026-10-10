import { ApiError, apiErrorResponse, assertOnlyKeys, noStoreJson, readJsonObject } from '@/app/api/_lib/http';
import { assertEditorOrigin, editorOwner } from '@/app/api/_lib/editor-auth';
import { rejectDuplicateMembers } from '@/lib/questionnaire';
import { questionnaireId } from '../../../../_input';
import { readQuestionnaireDesignReview, executeQuestionnaireDesignReview } from '@/db/questionnaire-review-repository';

type Context = { params: Promise<{ id: string; versionId: string }> };
async function input(request: Request): Promise<string> {
  // Inspect raw keys after the shared bounded reader validates the original
  // request. Rejected headers must not start a second stream lifecycle.
  const parsed = await readJsonObject(request, 1024, raw => {
    try { rejectDuplicateMembers(raw); } catch { throw new ApiError(400, 'invalid_json', '检查请求包含重复或无效字段，未执行。'); }
  });
  assertOnlyKeys(parsed, ['expectedSha256', 'consent']);
  if (parsed.consent !== true) throw new ApiError(400, 'questionnaire_review_consent_required', '请先核对保存版本并明确同意执行设计检查。');
  if (typeof parsed.expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.expectedSha256)) throw new ApiError(400, 'questionnaire_review_source_invalid', '请选择具有有效指纹的已保存问卷版本。');
  return parsed.expectedSha256;
}
export async function GET(request: Request, context: Context) {
  try {
    assertEditorOrigin(request); const owner = await editorOwner(request), params = await context.params;
    const result = await readQuestionnaireDesignReview(questionnaireId(params.id), questionnaireId(params.versionId), owner);
    return noStoreJson({ ...result, scope: owner, storage: 'd1' });
  } catch (error) { return apiErrorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    assertEditorOrigin(request); const owner = await editorOwner(request), params = await context.params;
    const projectId = questionnaireId(params.id), versionId = questionnaireId(params.versionId), expectedSha256 = await input(request);
    const result = await executeQuestionnaireDesignReview(projectId, versionId, expectedSha256, owner);
    return noStoreJson({ ...result, scope: owner, storage: 'd1' }, { status: result.replayed ? 200 : 201 });
  } catch (error) { return apiErrorResponse(error); }
}
