import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CutoutText } from '../../ui/CutoutText';
import { useTheme } from '../useTheme';

/*
  The P5 result moment (Level Up / Confidant rank-up): a red diagonal band, one giant
  yellow number, black label strips, a few icon sprites flying once. Shown for a run
  that finishes COMPLETE and for a successful submit to DongkrakUsaha. Persona theme
  only; one appearance, ~2.6 s, transform/opacity, nothing loops.

  Callers fire it through showResult(); the banner itself is mounted once in App.
*/

export interface ResultPayload { title: string; number?: string | number; numberLabel?: string; lines?: string[]; }

const EVENT = 'du-result';
export const showResult = (payload: ResultPayload) => { window.dispatchEvent(new CustomEvent(EVENT, { detail: payload })); };

const SPRITES = 10;

export const ResultBanner: React.FC = () => {
  const [theme] = useTheme();
  const [payload, setPayload] = useState<ResultPayload | null>(null);

  useEffect(() => {
    if (theme !== 'persona') return;
    let timer: number | null = null;
    const onShow = (e: Event) => {
      setPayload((e as CustomEvent<ResultPayload>).detail);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setPayload(null), 2600);
    };
    window.addEventListener(EVENT, onShow);
    return () => { window.removeEventListener(EVENT, onShow); if (timer) window.clearTimeout(timer); };
  }, [theme]);

  if (theme !== 'persona' || !payload) return null;
  return createPortal(
    <div className="du-result fixed inset-0 z-[60] pointer-events-none" role="status" aria-live="polite">
      <span className="du-result-band" />
      <span className="du-result-band du-result-band-2" />
      {Array.from({ length: SPRITES }).map((_, i) => (
        <span key={i} className="du-result-sprite" style={{ ['--i' as string]: i } as React.CSSProperties} aria-hidden="true">★</span>
      ))}
      <div className="du-result-body absolute left-[8%] top-[22%]">
        <div className="du-result-title"><CutoutText text={payload.title} /></div>
        {payload.number !== undefined && (
          <div className="flex items-end gap-4 mt-2">
            <span className="du-result-number">{payload.number}</span>
            {payload.numberLabel && <span className="du-result-strip">{payload.numberLabel}</span>}
          </div>
        )}
        {payload.lines?.map((l, i) => <div key={i} className="du-result-line" style={{ ['--i' as string]: i } as React.CSSProperties}>{l}</div>)}
      </div>
    </div>,
    document.body
  );
};
