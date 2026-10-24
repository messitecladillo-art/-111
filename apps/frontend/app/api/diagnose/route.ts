import {
  PROJECT_STAGES,
  type ProjectStage,
} from "@/data/control-plane-contract.generated";
import {
  diagnoseProject,
  EVIDENCE_STATUSES,
  type EvidenceStatus,
} from "../_lib/diagnosis";
import {
  apiErrorResponse,
  assertOnlyKeys,
  enumValue,
  noStoreJson,
  readJsonObject,
  requiredString,
} from "../_lib/http";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request, 8_192);
    assertOnlyKeys(body, [
      "title",
      "problem",
      "decisionOwner",
      "population",
      "geography",
      "stage",
      "evidenceStatus",
    ]);
    const input = {
      title: requiredString(body, "title", {
        max: 120,
        label: "项目名称",
      }),
      problem: requiredString(body, "problem", {
        max: 1_000,
        label: "决策问题",
      }),
      decisionOwner: requiredString(body, "decisionOwner", {
        max: 120,
        label: "决策主体",
      }),
      population: requiredString(body, "population", {
        max: 200,
        label: "目标人群",
      }),
      geography: requiredString(body, "geography", {
        max: 120,
        label: "地理范围",
      }),
      stage: enumValue(body.stage, PROJECT_STAGES, "stage") as ProjectStage,
      evidenceStatus: enumValue(
        body.evidenceStatus,
        EVIDENCE_STATUSES,
        "evidenceStatus",
      ) as EvidenceStatus,
    };

    const result = diagnoseProject(input);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    return noStoreJson({
      diagnosis: { id, createdAt, ...result },
      persistence: "not_persisted",
      privacy:
        "本次诊断及原始题目、问题描述、决策主体、目标人群和地理信息均不会被持久化。",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
