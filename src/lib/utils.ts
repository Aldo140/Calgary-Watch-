import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Public folder URL that respects Vite `base` (e.g. GitHub Pages project site). */
export function publicAsset(path: string): string {
  const p = path.startsWith('/') ? path.slice(1) : path;
  const base = import.meta.env.BASE_URL;
  return base.endsWith('/') ? `${base}${p}` : `${base}/${p}`;
}
