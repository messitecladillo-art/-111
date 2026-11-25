'use client';

import { createContext, useContext } from 'react';
import type { Section } from './shell-kit';

export type WorkbenchPanel = Exclude<Section, 'lifecycle'>;

/**
 * Canvas <-> editor navigation. A canvas node opens the same mounted editor panel the workbench uses
 * (panels stay mounted once visited), and a pill brings the user back to that node.
 */
export type WorkbenchNav = {
  section: Section;
  openFromCanvas: (target: Section, nodeId: string, title: string) => void;
  showWorkbench: () => void;
  canvasFocus: { nodeId: string; token: number } | null;
};

const NavContext = createContext<WorkbenchNav | null>(null);

/** Lets another shell (the agent shell) host workbench modules that navigate through this context. */
export const WorkbenchNavProvider = NavContext.Provider;

export function useWorkbenchNav(): WorkbenchNav {
  const value = useContext(NavContext);
  if (!value) throw Error('useWorkbenchNav must be used inside WorkbenchShell');
  return value;
}
