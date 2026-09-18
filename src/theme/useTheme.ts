import { useEffect, useState } from 'react';

/*
  The visual theme is a per-viewer preference (localStorage), applied as data-theme on
  <html> so CSS variables in src/theme/persona.css take over the whole page. index.html
  applies the stored value before the first paint, so switching themes never flashes.
  "standard" is the default and renders exactly the UI that existed before the theme.
*/

export type ThemeName = 'standard' | 'persona';

export const THEME_KEY = 'du-theme';

export const THEMES: Array<{ id: ThemeName; label: string; description: string }> = [
  { id: 'standard', label: 'Standar', description: 'Tampilan bawaan: terang, netral, fokus ke form.' },
  { id: 'persona', label: 'Persona', description: 'Hitam-merah-putih bergaya menu Persona 5, huruf potongan, pemandu di pojok (desktop).' }
];

export function readTheme(): ThemeName {
  try { return localStorage.getItem(THEME_KEY) === 'persona' ? 'persona' : 'standard'; } catch { return 'standard'; }
}

export function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private window: the theme still applies for this page */ }
  window.dispatchEvent(new CustomEvent('du-theme', { detail: theme }));
}

export function useTheme(): [ThemeName, (theme: ThemeName) => void] {
  const [theme, setTheme] = useState<ThemeName>(readTheme);
  useEffect(() => {
    const onChange = (e: Event) => setTheme((e as CustomEvent<ThemeName>).detail);
    window.addEventListener('du-theme', onChange);
    return () => window.removeEventListener('du-theme', onChange);
  }, []);
  return [theme, applyTheme];
}

export const isPersona = (theme: ThemeName) => theme === 'persona';
