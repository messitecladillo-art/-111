import type { AppDatabase } from "./index";
import { diagnoses } from "./schema";

export type DiagnosisPersistence = {
  id: string;
  inputFingerprint: string;
  readiness: number;
  qScore: number;
  dScore: number;
  iScore: number;
  aScore: number;
  riskCodes: string[];
  nextStepCodes: string[];
  createdAt: string;
};

/**
 * A missing D1 intentionally means no diagnosis persistence. The in-memory
 * project demo store is not reused here so free-text-derived records cannot be
 * mistaken for durable evidence.
 */
export async function persistDiagnosisSummary(
  db: AppDatabase | null,
  input: DiagnosisPersistence,
): Promise<boolean> {
  if (!db) return false;

  await db.insert(diagnoses).values({
    ...input,
    riskCodes: JSON.stringify(input.riskCodes),
    nextStepCodes: JSON.stringify(input.nextStepCodes),
  });
  return true;
}
