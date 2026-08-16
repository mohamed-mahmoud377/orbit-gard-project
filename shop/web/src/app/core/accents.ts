/**
 * The catalog's per-category `accent` field is a Tailwind palette key
 * (CONTRACT §3). Tailwind 4 has no `tailwind.config.js` to read and these are
 * chosen at runtime, so the palette is resolved here into CSS custom
 * properties (`--cat-accent`, `--cat-accent-dark`, `--cat-accent-soft`) that
 * category-themed surfaces bind to.
 */

export interface Accent {
  base: string;
  dark: string;
  soft: string;
}

const DEFAULT_ACCENT: Accent = { base: '#6c2bd9', dark: '#4c1d95', soft: '#f2ebfe' };

const ACCENTS: Record<string, Accent> = {
  slate: { base: '#475569', dark: '#1e293b', soft: '#f1f5f9' },
  gray: { base: '#4b5563', dark: '#1f2937', soft: '#f3f4f6' },
  zinc: { base: '#52525b', dark: '#27272a', soft: '#f4f4f5' },
  neutral: { base: '#525252', dark: '#262626', soft: '#f5f5f5' },
  stone: { base: '#57534e', dark: '#292524', soft: '#f5f5f4' },
  red: { base: '#dc2626', dark: '#991b1b', soft: '#fef2f2' },
  orange: { base: '#ea580c', dark: '#9a3412', soft: '#fff7ed' },
  amber: { base: '#d97706', dark: '#92400e', soft: '#fffbeb' },
  yellow: { base: '#ca8a04', dark: '#854d0e', soft: '#fefce8' },
  lime: { base: '#65a30d', dark: '#3f6212', soft: '#f7fee7' },
  green: { base: '#16a34a', dark: '#166534', soft: '#f0fdf4' },
  emerald: { base: '#059669', dark: '#065f46', soft: '#ecfdf5' },
  teal: { base: '#0d9488', dark: '#115e59', soft: '#f0fdfa' },
  cyan: { base: '#0891b2', dark: '#155e75', soft: '#ecfeff' },
  sky: { base: '#0284c7', dark: '#075985', soft: '#f0f9ff' },
  blue: { base: '#2563eb', dark: '#1e40af', soft: '#eff6ff' },
  indigo: { base: '#4f46e5', dark: '#3730a3', soft: '#eef2ff' },
  violet: { base: '#7c3aed', dark: '#5b21b6', soft: '#f5f3ff' },
  purple: { base: '#9333ea', dark: '#6b21a8', soft: '#faf5ff' },
  fuchsia: { base: '#c026d3', dark: '#86198f', soft: '#fdf4ff' },
  pink: { base: '#db2777', dark: '#9d174d', soft: '#fdf2f8' },
  rose: { base: '#e11d48', dark: '#9f1239', soft: '#fff1f2' },
};

export function accentFor(key: string | null | undefined): Accent {
  return (key && ACCENTS[key]) || DEFAULT_ACCENT;
}

/** Inline style object for a category-themed container. */
export function accentVars(key: string | null | undefined): Record<string, string> {
  const accent = accentFor(key);
  return {
    '--cat-accent': accent.base,
    '--cat-accent-dark': accent.dark,
    '--cat-accent-soft': accent.soft,
  };
}
