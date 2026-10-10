import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

type RuntimeBindings = {
  DB?: D1Database;
};

const bindings = env as unknown as RuntimeBindings;

/** Use this for commands which require D1 and should fail closed. */
export function getDb(): AppDatabase {
  if (!bindings.DB) {
    throw new Error("D1_UNAVAILABLE");
  }

  return drizzle(bindings.DB, { schema });
}

/**
 * Route handlers use this to select the localhost-only demo store when D1 is
 * not bound. An operational D1 error is never silently converted into memory.
 */
export function getDbOrNull(): AppDatabase | null {
  try {
    return bindings.DB ? drizzle(bindings.DB, { schema }) : null;
  } catch {
    return null;
  }
}
