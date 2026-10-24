import { emptyDoc, parseDoc, serializeDoc, type CanvasDoc } from './graph.ts';
import { canvasScopeKey, type CanvasStorageScope } from './scope.ts';

export type CanvasViewport = { x: number; y: number; zoom: number };
type LocalStore = Pick<Storage, 'getItem' | 'setItem'>;

/** A mount owns one scope; a keyed remount gets a different lifetime. React strict effects may reactivate it. */
export function canvasScopeLifetime(isCurrentIdentity: () => boolean) {
  let mounted = true;
  return { isCurrent: () => mounted && isCurrentIdentity(), activate: () => { mounted = true; }, deactivate: () => { mounted = false; } };
}

function viewportValue(value: unknown): CanvasViewport | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const v = value as CanvasViewport;
  if (![v.x, v.y, v.zoom].every(Number.isFinite) || Math.abs(v.x) > 1e7 || Math.abs(v.y) > 1e7 || v.zoom < 0.15 || v.zoom > 2) return;
  return { x: v.x, y: v.y, zoom: v.zoom };
}

/**
 * A captured scope never changes underneath an asynchronous operation. The caller supplies a
 * synchronous identity-generation/lifetime fence, so an old save cannot run during React cleanup.
 * Unscoped v1 keys are deliberately neither read nor migrated: their owner is unknown.
 */
export function scopedCanvasStorage(scope: CanvasStorageScope, storage: LocalStore | null, isCurrent: () => boolean) {
  const key = canvasScopeKey(scope), documentKey = `${key}:document`, viewportKey = `${key}:viewport`;
  return {
    key, documentKey, viewportKey,
    readDocument(): CanvasDoc {
      if (!isCurrent()) return emptyDoc();
      try { const raw = storage?.getItem(documentKey); return raw ? parseDoc(JSON.parse(raw)) : emptyDoc(); } catch { return emptyDoc(); }
    },
    readViewport(): CanvasViewport | undefined {
      if (!isCurrent()) return;
      try { const raw = storage?.getItem(viewportKey); return raw ? viewportValue(JSON.parse(raw)) : undefined; } catch { return; }
    },
    writeDocument(doc: CanvasDoc): boolean {
      if (!isCurrent()) return false;
      const raw = serializeDoc(doc);
      if (!isCurrent()) return false;
      if (!storage) throw Error('本机存储不可用。');
      storage.setItem(documentKey, raw);
      return true;
    },
    writeViewport(value: CanvasViewport): boolean {
      if (!isCurrent()) return false;
      const viewport = viewportValue(value);
      if (!viewport || !storage) return false;
      storage.setItem(viewportKey, JSON.stringify(viewport));
      return true;
    },
  };
}
