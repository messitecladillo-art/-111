import { getDbOrNull, type AppDatabase } from "@/db";
import { ApiError } from "./http";

export type ProjectStorage = {
  db: AppDatabase | null;
  mode: "d1" | "demo-memory";
};

export function projectStorageForRequest(request: Request): ProjectStorage {
  const hostname = new URL(request.url).hostname.toLowerCase();
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost");

  // Local preview is a clearly labeled, process-local demo by default. This
  // also prevents a freshly created but unmigrated Miniflare D1 binding from
  // making the UI crash. Developers may opt into a migrated local D1.
  if (isLocalhost && request.headers.get("x-evi-local-storage") !== "d1") {
    return { db: null, mode: "demo-memory" };
  }

  const db = getDbOrNull();
  if (db) return { db, mode: "d1" };

  throw new ApiError(
    503,
    "storage_unavailable",
    "项目存储尚未配置，请稍后重试。",
  );
}
