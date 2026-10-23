/** Explicit legacy bookmarks are migrated; unknown fragments remain local. */
export function legacyLandingDestination(hash: string): string | null {
  const name = hash.startsWith('#') ? hash.slice(1) : hash;
  if (name === 'product') return '/explore';
  if (name === 'questions') return '/explore#questions';
  if (name === 'services') return '/services';
  if (name === 'workspace') return '/projects';
  return ['overview', 'cases', 'diagnose', 'lifecycle', 'rules', 'editor', 'analysis', 'design', 'defense'].includes(name) ? `/workspace#${name}` : null;
}

