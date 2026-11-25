'use client';

import { useState, type ReactNode } from 'react';

/**
 * Silky Shared-Axis route entry transition inspired by iOS Spring & Material 3 Emphasized motion.
 * Clears the animation class on completion so `transform` reverts cleanly to `none` and never
 * traps `position: fixed` floating docks or modals inside a transformed containing block.
 */
export default function RootTemplate({ children }: { children: ReactNode }) {
  const [animating, setAnimating] = useState(true);
  return (
    <div
      className={animating ? 'evix-route-stage' : undefined}
      onAnimationEnd={event => {
        if (event.target === event.currentTarget) setAnimating(false);
      }}
    >
      {children}
    </div>
  );
}
