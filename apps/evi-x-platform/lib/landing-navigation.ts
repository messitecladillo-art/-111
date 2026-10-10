/** Explicit legacy bookmarks are migrated; unknown fragments remain local. */
export function legacyLandingDestination(hash: string): string | null {
  const name = hash.startsWith('#') ? hash.slice(1) : hash;
  if (name === 'product') return '/explore';
  if (name === 'questions') return '/explore#questions';
  if (name === 'services') return '/services';
  if (name === 'workspace') return '/projects';
  return ['overview', 'cases', 'diagnose', 'lifecycle', 'rules', 'editor', 'analysis', 'design', 'defense'].includes(name) ? `/workspace#${name}` : null;
}

export function timelineProgress(top: number, height: number, viewport: number): number {
  if (![top, height, viewport].every(Number.isFinite) || height <= viewport) return 0;
  return Math.max(0, Math.min(3, (-top / (height - viewport)) * 3));
}

export function timelineChapter(progress: number): number {
  return Number.isFinite(progress) ? Math.max(0, Math.min(3, Math.floor(progress + .45))) : 0;
}
