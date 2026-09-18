import React, { useEffect, useRef, useState } from 'react';
import { X, MessageSquare } from 'lucide-react';
import { GUIDE, guideIdFrom, type GuideEntry } from './guideRegistry';
import { GUIDE_PERSONA } from './persona';
import { useTheme } from '../theme/useTheme';

/*
  The corner guide for the Persona theme: a portrait and a P5-style dialogue box
  (THEME_PERSONA.md "Pemandu"). It listens to pointerover on the whole document and
  looks up the nearest [data-guide] or canvas [data-node] in the registry; the
  portrait swaps to "talk", the text is typed in, and after a few seconds of silence
  she returns to idle. Desktop only (>= lg) and only under the Persona theme -- in the
  standard theme this renders nothing at all.

  Everything here is transform/opacity; the typewriter is a timer, not an animation.
  Reduced motion prints the line at once.
*/

const MUTE_KEY = 'du-guide-muted';
const readMuted = () => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } };

export const GuideCompanion: React.FC = () => {
  const [theme] = useTheme();
  const [muted, setMuted] = useState(readMuted);
  const [entry, setEntry] = useState<GuideEntry | null>(null);
  const [typed, setTyped] = useState('');
  const [idleLine, setIdleLine] = useState(0);
  const speaking = !!entry;
  const lastId = useRef<string | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const idleTimer = useRef<number | null>(null);
  const typeTimer = useRef<number | null>(null);
  const reduced = useRef(false);

  const enabled = theme === 'persona' && !muted;

  // Preload both portraits once so the swap is instant (P5 rule: menus without lag).
  useEffect(() => {
    if (theme !== 'persona') return;
    for (const src of Object.values(GUIDE_PERSONA.portraits)) { const img = new Image(); img.src = src; }
    reduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }, [theme]);

  // Idle line rotates slowly while nobody points at anything.
  useEffect(() => {
    if (!enabled || speaking) return;
    const t = window.setInterval(() => setIdleLine(i => (i + 1) % GUIDE_PERSONA.idleLines.length), 12000);
    return () => window.clearInterval(t);
  }, [enabled, speaking]);

  useEffect(() => {
    if (!enabled) return;
    const clear = (r: React.MutableRefObject<number | null>) => { if (r.current) { window.clearTimeout(r.current); r.current = null; } };

    const speak = (id: string, e: GuideEntry) => {
      if (lastId.current === id) { clear(idleTimer); idleTimer.current = window.setTimeout(rest, GUIDE_PERSONA.idleAfterMs); return; }
      lastId.current = id;
      setEntry(e);
      clear(typeTimer);
      const full = e.fungsi;
      if (reduced.current || (GUIDE_PERSONA.typeSpeedMs as number) <= 0) { setTyped(full); }
      else {
        setTyped('');
        let i = 0;
        const tick = () => { i += 1; setTyped(full.slice(0, i)); if (i < full.length) typeTimer.current = window.setTimeout(tick, GUIDE_PERSONA.typeSpeedMs); };
        typeTimer.current = window.setTimeout(tick, GUIDE_PERSONA.typeSpeedMs);
      }
      clear(idleTimer);
      idleTimer.current = window.setTimeout(rest, GUIDE_PERSONA.idleAfterMs);
    };
    const rest = () => { lastId.current = null; setEntry(null); setTyped(''); clear(typeTimer); };

    const onOver = (ev: PointerEvent) => {
      const target = (ev.target as HTMLElement | null)?.closest?.('[data-guide], [data-node]') as HTMLElement | null;
      if (!target) return;
      const id = guideIdFrom(target.dataset as { guide?: string; node?: string });
      const e = id ? GUIDE[id] : undefined;
      if (!id || !e) return;
      clear(hoverTimer);
      hoverTimer.current = window.setTimeout(() => speak(id, e), 120);
    };
    document.addEventListener('pointerover', onOver, { passive: true });
    return () => {
      document.removeEventListener('pointerover', onOver);
      clear(hoverTimer); clear(idleTimer); clear(typeTimer);
    };
  }, [enabled]);

  if (theme !== 'persona') return null;

  if (muted) {
    return (
      <button
        type="button"
        onClick={() => { setMuted(false); try { localStorage.setItem(MUTE_KEY, '0'); } catch { /* ignore */ } }}
        className="du-guide-chip hidden lg:inline-flex fixed right-4 z-40 items-center gap-1.5 px-2.5 py-1.5 text-xs cursor-pointer"
        style={{ bottom: 'calc(var(--du-bottom-nav) + 92px)' }}
        title="Tampilkan pemandu"
      >
        <MessageSquare className="w-3.5 h-3.5" /> {GUIDE_PERSONA.name}
      </button>
    );
  }

  const src = speaking ? GUIDE_PERSONA.portraits.talk : GUIDE_PERSONA.portraits.idle;
  return (
    <aside
      role="complementary"
      aria-label="Pemandu"
      className="du-guide du-dark hidden lg:flex fixed right-4 z-40 items-end gap-3 pointer-events-none"
      style={{ bottom: 'calc(var(--du-bottom-nav) + 92px)' }}
      data-speaking={speaking ? 'true' : 'false'}
    >
      <div className="pointer-events-auto relative w-[360px] max-w-[42vw]">
        <span className="du-guide-tag absolute -top-3 left-4 z-10 px-2.5 py-0.5 text-xs">{GUIDE_PERSONA.name}</span>
        <div className="du-guide-box relative p-4 pr-8 text-white">
        <button
          type="button"
          onClick={() => { setMuted(true); try { localStorage.setItem(MUTE_KEY, '1'); } catch { /* ignore */ } }}
          className="absolute top-2 right-2 p-1 text-white/70 hover:text-white cursor-pointer"
          title="Sembunyikan pemandu"
          aria-label="Sembunyikan pemandu"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        {speaking && entry ? (
          <div className="space-y-1.5" aria-live="polite">
            <div className="du-label text-xs text-white/80">{entry.judul}</div>
            <p className="text-[13px] leading-[20px] min-h-[40px]">{typed}<span className="du-guide-caret" aria-hidden="true" /></p>
            {entry.fakta && typed.length >= entry.fungsi.length && (
              <p className="text-[12px] leading-[18px] text-white/85 du-guide-fact">
                <span className="du-guide-fact-tag">{GUIDE_PERSONA.factLabel}</span> {entry.fakta}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[13px] leading-[20px] text-white/90" aria-live="polite">{GUIDE_PERSONA.idleLines[idleLine]}</p>
        )}
        </div>
      </div>
      <div className="du-guide-portrait pointer-events-auto relative w-32 h-32 shrink-0">
        <img src={src} alt="" className="w-full h-full object-cover" style={{ objectPosition: '50% 12%' }} draggable={false} />
      </div>
    </aside>
  );
};
