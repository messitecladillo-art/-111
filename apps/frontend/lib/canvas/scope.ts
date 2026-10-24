/** Local canvas ownership is explicit; never infer a hosted project from a filename or the last open tab. */
export type CanvasIdentity = { kind: 'account' | 'anonymous'; id: string };
export type CanvasStorageScope = { identity: CanvasIdentity; projectId: string };
export const LOCAL_CANVAS_WORKSPACE = 'local-workspace';
export const ANONYMOUS_CANVAS_SESSION = 'evix.canvas.anonymous-session.v1';

function opaqueId(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 160 || /[\u0000-\u001f\u007f]/u.test(value)) throw Error('画布归属标识无效。');
  return value;
}

export function canvasScopeKey(scope: CanvasStorageScope): string {
  if (!scope || !scope.identity || !['account', 'anonymous'].includes(scope.identity.kind)) throw Error('画布归属未确定。');
  // An encoded tuple prevents delimiter collisions and stores opaque IDs, never email addresses.
  return `evix.canvas.v2:${encodeURIComponent(JSON.stringify([scope.identity.kind, opaqueId(scope.identity.id), opaqueId(scope.projectId)]))}`;
}

/** Guest drafts survive a reload in this tab, but a login/logout invalidates the guest identity. */
export function anonymousCanvasIdentity(storage: Pick<Storage, 'getItem' | 'setItem'> | null, createId: () => string): CanvasIdentity {
  let id: string | null = null;
  try { id = storage?.getItem(ANONYMOUS_CANVAS_SESSION) ?? null; } catch { /* An unavailable session store means this mount is ephemeral. */ }
  if (!id || !/^[a-zA-Z0-9-]{16,80}$/u.test(id)) {
    id = createId();
    if (!/^[a-zA-Z0-9-]{16,80}$/u.test(id)) throw Error('无法建立匿名画布会话。');
    try { storage?.setItem(ANONYMOUS_CANVAS_SESSION, id); } catch { /* The canvas can still be used without persistent guest preferences. */ }
  }
  return { kind: 'anonymous', id };
}

export function clearAnonymousCanvasIdentity(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(ANONYMOUS_CANVAS_SESSION);
}
