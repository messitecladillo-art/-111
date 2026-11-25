'use client';

import { memo, useEffect, useState, type ReactNode } from 'react';
import styles from './Tex.module.css';

type TexModule = typeof import('./Tex');

let loadedMod: TexModule | null = null;
let loadingPromise: Promise<TexModule> | null = null;

export function preloadTexModule(): Promise<TexModule> {
  if (loadedMod) return Promise.resolve(loadedMod);
  if (!loadingPromise) {
    loadingPromise = import('./Tex')
      .then((mod) => {
        loadedMod = mod;
        return mod;
      })
      .catch((err) => {
        loadingPromise = null;
        throw err;
      });
  }
  return loadingPromise;
}

function useTexModule(): TexModule | null {
  const [mod, setMod] = useState<TexModule | null>(() => loadedMod);
  useEffect(() => {
    if (mod) return;
    let active = true;
    preloadTexModule()
      .then((resolved) => {
        if (active) setMod(() => resolved);
      })
      .catch(() => {
        // Retain semantic plain-text math fallback when chunk fetch is transiently offline.
      });
    return () => {
      active = false;
    };
  }, [mod]);
  return mod ?? loadedMod;
}

export type TexLazyProps = {
  tex: string;
  className?: string;
};

/** On-demand inline KaTeX formula; zero static `katex` import in the initial route bundle. */
export const TexLazy = memo(function TexLazy({ tex, className }: TexLazyProps) {
  const mod = useTexModule();
  if (mod) {
    const LoadedTex = mod.Tex;
    return <LoadedTex tex={tex} className={className} />;
  }
  return (
    <span className={className ? `${styles.inline} ${className}` : styles.inline} data-tex-loading="">
      {tex}
    </span>
  );
});

export type FormulaLazyProps = {
  tex: string;
  label?: ReactNode;
  number?: string;
  copyable?: boolean;
  compact?: boolean;
  print?: boolean;
};

/** On-demand display equation with identical props and layout contract to `Formula`. */
export const FormulaLazy = memo(function FormulaLazy({
  tex,
  label,
  number,
  copyable = true,
  compact = false,
  print = false,
}: FormulaLazyProps) {
  const mod = useTexModule();
  if (mod) {
    const LoadedFormula = mod.Formula;
    return (
      <LoadedFormula
        tex={tex}
        label={label}
        number={number}
        copyable={copyable}
        compact={compact}
        print={print}
      />
    );
  }
  const name = typeof label === 'string' ? label : number ? `公式 ${number}` : '';
  return (
    <figure
      className={styles.formula}
      data-compact={compact || undefined}
      data-print={print || undefined}
      data-tex-loading=""
    >
      {label && <figcaption>{label}</figcaption>}
      <div className={styles.body}>
        <div className={styles.math} tabIndex={0} aria-label={name ? `${name}（公式）` : '公式'}>
          {tex}
        </div>
        {number && <span className={styles.number}>{print ? `（${number}）` : `(${number})`}</span>}
      </div>
    </figure>
  );
});

export type TexSpanLazyProps = {
  tex: string;
  display: boolean;
  className?: string;
};

/** On-demand inline/block TeX span used by transcript/router spans (`Glyphs.tsx`). */
export const TexSpanLazy = memo(function TexSpanLazy({ tex, display, className }: TexSpanLazyProps) {
  const mod = useTexModule();
  if (mod) {
    return <span className={className} dangerouslySetInnerHTML={{ __html: mod.renderTex(tex, display) }} />;
  }
  return (
    <span className={className} data-tex-loading="">
      {tex}
    </span>
  );
});
