import React from 'react';
import { useTheme } from '../theme/useTheme';

/*
  Fanzine cut-out lettering for the Persona theme (THEME_PERSONA.md "Tipografi"): each
  letter is rotated and scaled by a small, DETERMINISTIC amount derived from its index,
  so the same title always looks the same and never jitters on re-render. Under the
  standard theme this renders the plain text, unchanged.

  Readability floor: texts longer than MAX_CUTOUT letters are rendered in the display
  face without the per-letter treatment; paragraphs never come through here.
*/

const MAX_CUTOUT = 28;

const jitter = (i: number) => {
  const r = ((i * 7) % 7) - 3;               // -3 .. 3 deg
  const s = 1 + ((((i * 13) % 5) - 2) * 0.04); // 0.92 .. 1.08
  return { ['--r' as string]: `${r}deg`, ['--s' as string]: String(s) } as React.CSSProperties;
};

export const CutoutText: React.FC<{ text: string; className?: string; as?: keyof React.JSX.IntrinsicElements }> = ({ text, className, as = 'span' }) => {
  const [theme] = useTheme();
  const Tag = as as any;
  // Standard theme: the text itself, no wrapper -- the DOM stays exactly as before.
  if (theme !== 'persona') return <>{text}</>;
  if (text.length > MAX_CUTOUT) return <Tag className={`du-label ${className || ''}`}>{text}</Tag>;
  return (
    <Tag className={`du-cutout ${className || ''}`} aria-label={text}>
      {Array.from(text).map((ch, i) =>
        ch === ' '
          ? <span key={i} className="du-sp" aria-hidden="true" />
          : <span key={i} aria-hidden="true" style={jitter(i)}>{ch}</span>
      )}
    </Tag>
  );
};
