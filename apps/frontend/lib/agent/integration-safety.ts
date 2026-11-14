/** Identity captured by a browser tool before any asynchronous work starts. */
export type WorkspaceIdentity = {
  owner: string | null;
  epoch: number;
  thread: string | null;
  project: string | null;
};

export function sameWorkspaceIdentity(expected: WorkspaceIdentity, current: WorkspaceIdentity): boolean {
  return expected.owner !== null && expected.owner === current.owner && expected.epoch === current.epoch
    && expected.thread === current.thread && expected.project === current.project;
}

export type StudioPublicationIdentity = WorkspaceIdentity & {
  sourceKey: string;
  previewKey: string;
  pending: boolean;
};

/** A result can replace only the exact report and candidate from which it was produced. */
export function canPublishStudioResult(expected: StudioPublicationIdentity, current: StudioPublicationIdentity): boolean {
  return sameWorkspaceIdentity(expected, current) && !expected.pending && !current.pending
    && expected.sourceKey === current.sourceKey && expected.previewKey === current.previewKey;
}

export function citationEvidenceReady(input: { title: string; authors: string; year: string; source: string; url: string; locator: string; checked: boolean }): boolean {
  if (!input.checked || !input.title.trim() || input.title.length > 400 || !input.authors.trim() || input.authors.length > 1200
      || !/^\d{4}$/u.test(input.year.trim()) || !input.source.trim() || input.source.length > 200
      || !input.locator.trim() || input.locator.length > 200 || input.url.length > 1000) return false;
  try { const url = new URL(input.url); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}
