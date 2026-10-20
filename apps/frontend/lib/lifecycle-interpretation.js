export const LIFECYCLE_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 30 * 1000;

/**
 * @param {string} observedAt
 * @param {number} nowMs
 */
export function isLifecycleSnapshotExpired(observedAt, nowMs) {
  const observedMs = Date.parse(observedAt);
  const ageMs = nowMs - observedMs;
  return !Number.isFinite(observedMs)
    || !Number.isFinite(nowMs)
    || ageMs < -MAX_FUTURE_CLOCK_SKEW_MS
    || ageMs >= LIFECYCLE_SNAPSHOT_MAX_AGE_MS;
}

/**
 * Decide whether the UI may translate a local snapshot into workflow advice.
 * Every condition is intentionally explicit so stale or unhealthy evidence
 * cannot inherit a previously actionable-looking presentation.
 *
 * @param {{
 *   hasSnapshot: boolean,
 *   contractMatches: boolean,
 *   consistent: boolean,
 *   stale: boolean,
 *   doctorHealthy: boolean,
 *   doctorExitCode: number,
 *   checksPassed: boolean,
 * }} input
 */
export function canInterpretLifecycleSnapshot(input) {
  return input.hasSnapshot === true
    && input.contractMatches === true
    && input.consistent === true
    && input.stale === false
    && input.doctorHealthy === true
    && input.doctorExitCode === 0
    && input.checksPassed === true;
}

/**
 * Keep every action-shaped section behind the same evidence policy.
 *
 * @param {Parameters<typeof canInterpretLifecycleSnapshot>[0]} input
 */
export function selectLifecyclePresentation(input) {
  const allowed = canInterpretLifecycleSnapshot(input);
  return {
    showTransition: allowed,
    showMaterials: allowed,
    showNextAction: allowed,
    showParallelWork: allowed,
    showRawTechnicalDetails: !allowed,
  };
}
