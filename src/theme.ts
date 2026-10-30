import { useEffect, useState } from 'react';
import { BRAND } from './brand';

// Light / dark for the site and the admin panel. The choice is saved on the phone; until someone
// picks, it follows the phone's own setting. index.html sets it before the page draws, so no flash.
export type Theme = 'light' | 'dark';
const KEY = 'faei-theme';
const saved = (): Theme | null => { try { const value = localStorage.getItem(KEY); return value === 'light' || value === 'dark' ? value : null; } catch { return null; } };
const system = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d1720' : BRAND.colors.ink);
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => saved() ?? system());
  useEffect(() => { apply(theme); }, [theme]);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const follow = () => { if (!saved()) setTheme(system()); };
    media?.addEventListener?.('change', follow);
    return () => media?.removeEventListener?.('change', follow);
  }, []);
  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch { /* private mode: still switches for this visit */ }
    setTheme(next);
  }
  return [theme, toggle];
}
