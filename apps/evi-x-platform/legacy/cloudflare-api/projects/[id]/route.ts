import {
  getProject,
  listProjectEvents,
} from "@/db/project-repository";
import { CONTROL_CAPABILITIES } from "@/data/control-portal";
import {
  ApiError,
  apiErrorResponse,
  noStoreJson,
} from "../../_lib/http";
import {
  resolveOwnership,
  sha256Hex,
  validateProjectId,
} from "../../_lib/security";
import { projectStorageForRequest } from "../../_lib/storage";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function routeId(context: RouteContext) {
  const params = await Promise.resolve(context.params);
  return validateProjectId(params.id);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const id = await routeId(context);
    const ownership = resolveOwnership(request);
    const clientKeyHash = await sha256Hex(ownership.ownerKey);
    const storage = projectStorageForRequest(request);
    const project = await getProject(storage.db, id, clientKeyHash);
    if (!project) {
      throw new ApiError(404, "project_not_found", "未找到该项目。");
    }
    const events = await listProjectEvents(storage.db, project.id);
    return noStoreJson({
      project,
      events,
      capabilities: CONTROL_CAPABILITIES,
      storage: storage.mode,
      demo: storage.mode === "demo-memory",
      ownershipMode: ownership.mode,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const id = await routeId(context);
    const ownership = resolveOwnership(request);
    const clientKeyHash = await sha256Hex(ownership.ownerKey);
    const storage = projectStorageForRequest(request);
    const project = await getProject(storage.db, id, clientKeyHash);
    if (!project) {
      // Wrong-owner and unknown-ID responses intentionally remain identical.
      throw new ApiError(404, "project_not_found", "未找到该项目。");
    }

    throw new ApiError(
      503,
      CONTROL_CAPABILITIES.reason,
      CONTROL_CAPABILITIES.message,
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
