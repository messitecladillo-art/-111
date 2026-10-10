import {
  createProject,
  listProjects,
} from "@/db/project-repository";
import { CONTROL_CONTRACT_META } from "@/data/control-plane-contract.generated";
import { CONTROL_CAPABILITIES } from "@/data/control-portal";
import {
  ApiError,
  apiErrorResponse,
  assertOnlyKeys,
  noStoreJson,
  readJsonObject,
  requiredString,
} from "../_lib/http";
import { resolveOwnership, sha256Hex } from "../_lib/security";
import { projectStorageForRequest } from "../_lib/storage";

const PROJECTS_PER_OWNER_LIMIT = 20;

export async function GET(request: Request) {
  try {
    const ownership = resolveOwnership(request);
    const clientKeyHash = await sha256Hex(ownership.ownerKey);
    const storage = projectStorageForRequest(request);
    const rows = await listProjects(storage.db, clientKeyHash);
    return noStoreJson({
      projects: rows,
      capabilities: CONTROL_CAPABILITIES,
      contract: CONTROL_CONTRACT_META,
      storage: storage.mode,
      demo: storage.mode === "demo-memory",
      ownershipMode: ownership.mode,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request, 8_192);
    assertOnlyKeys(body, ["title"]);
    const ownership = resolveOwnership(request);
    const title = requiredString(body, "title", {
      max: 120,
      label: "项目名称",
    });
    assertSafeProjectTitle(title);
    const storage = projectStorageForRequest(request);
    const clientKeyHash = await sha256Hex(ownership.ownerKey);
    const existingProjects = await listProjects(storage.db, clientKeyHash);
    if (existingProjects.length >= PROJECTS_PER_OWNER_LIMIT) {
      throw new ApiError(
        429,
        "project_quota_exceeded",
        `每个工作区最多登记 ${PROJECTS_PER_OWNER_LIMIT} 个项目。`,
        { "retry-after": "3600" },
      );
    }
    const project = await createProject(storage.db, {
      id: crypto.randomUUID(),
      clientKeyHash,
      title,
      createdAt: new Date().toISOString(),
    });

    return noStoreJson(
      {
        project,
        capabilities: CONTROL_CAPABILITIES,
        contract: CONTROL_CONTRACT_META,
        storage: storage.mode,
        demo: storage.mode === "demo-memory",
        ownershipMode: ownership.mode,
        quota: { used: existingProjects.length + 1, limit: PROJECTS_PER_OWNER_LIMIT },
        privacy: "仅保存项目名称和登记态元数据；请勿在名称中填写敏感信息。",
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function assertSafeProjectTitle(title: string) {
  const containsEmail = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(title);
  const containsMainlandPhone = /(?<!\d)1[3-9]\d{9}(?!\d)/.test(title);
  const containsMainlandId =
    /(?<!\d)\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9Xx](?!\d)/.test(
      title,
    );
  if (containsEmail || containsMainlandPhone || containsMainlandId) {
    throw new ApiError(
      400,
      "sensitive_data_not_allowed",
      "项目名称不能包含邮箱、手机号或身份证号。",
    );
  }
}
