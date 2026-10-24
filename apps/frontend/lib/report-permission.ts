/** A committed permission transition revokes every previously captured write capability. */
export function createReportPermissionGuard(readOnly: boolean) {
  let denied = readOnly, epoch = 0;
  return {
    get readOnly() { return denied; },
    get epoch() { return epoch; },
    update(nextReadOnly: boolean) { if (denied !== nextReadOnly) { denied = nextReadOnly; epoch++; } },
    allows(ticket: number) { return !denied && ticket === epoch; },
  };
}
