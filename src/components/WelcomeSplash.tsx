import React, { useEffect, useState } from 'react';
import { Globe, ArrowRight, Building2, Workflow, Send } from 'lucide-react';

/*
  Welcome splash, second version (2026-09-15). The first one was a plain blue card the
  operator found dull. This one: a soft layered backdrop, a breathing logo mark, and
  lines that rise in one after another. Still only transform/opacity, no blur, and
  every animation is gated by prefers-reduced-motion.

  Shown once per browser session; "Jangan tampilkan lagi" turns it off for good on
  this browser (localStorage). Storage access is wrapped because a private window or
  blocked storage can throw, and the splash must never break the app.
*/
const SESSION_KEY = 'du-welcome-splash-seen';
const NEVER_KEY = 'du-welcome-splash-never';
const EXIT_MS = 200; // must match animate-du-scale-out / animate-du-fade-out

const readFlag = (store: 'session' | 'local', key: string): boolean => {
  try { return (store === 'session' ? window.sessionStorage : window.localStorage).getItem(key) === '1'; } catch { return false; }
};
const writeFlag = (store: 'session' | 'local', key: string) => {
  try { (store === 'session' ? window.sessionStorage : window.localStorage).setItem(key, '1'); } catch { /* ignore */ }
};

const STEPS = [
  { icon: Building2, text: 'Isi data bisnis sekali' },
  { icon: Workflow, text: 'AI menyusun strategi, konten, dan audit' },
  { icon: Send, text: 'Terbitkan ke DongkrakUsaha lewat ekstensi' }
];

export const WelcomeSplash: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [never, setNever] = useState(false);

  useEffect(() => {
    if (!readFlag('local', NEVER_KEY) && !readFlag('session', SESSION_KEY)) setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, never]);

  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    writeFlag('session', SESSION_KEY);
    if (never) writeFlag('local', NEVER_KEY);
    window.setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, EXIT_MS);
  };

  if (!visible) return null;

  // Each block rises slightly after the previous one.
  const rise = (i: number): React.CSSProperties => ({ animationDelay: `${120 + i * 90}ms` });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="du-splash-title"
      onClick={dismiss}
      // Flat semi-transparent scrim, never backdrop-blur (integrated GPUs).
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 motion-reduce:animate-none ${
        closing ? 'animate-du-fade-out' : 'animate-du-fade-in'
      }`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden motion-reduce:animate-none ${
          closing ? 'animate-du-scale-out' : 'animate-du-scale-in'
        }`}
      >
        {/* Soft backdrop: two static gradient blobs, no filters. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-blue-50 via-white to-white" />
        <div aria-hidden="true" className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-blue-100/70" />
        <div aria-hidden="true" className="absolute -top-6 -left-20 w-48 h-48 rounded-full bg-violet-100/60" />

        <div className="relative px-7 pt-8 pb-7">
          <div className="animate-du-rise motion-reduce:animate-none" style={rise(0)}>
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md animate-du-breathe motion-reduce:animate-none">
              <Globe className="w-8 h-8" />
            </div>
          </div>

          <div className="mt-5 animate-du-rise motion-reduce:animate-none" style={rise(1)}>
            <div className="text-3xs font-semibold text-blue-600 uppercase tracking-[0.2em]">DongkrakUsaha</div>
            <h1 id="du-splash-title" className="text-2xl font-bold text-slate-900 leading-tight tracking-tight mt-1">
              AI Marketing Suite
            </h1>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              Satu bisnis, seluruh wilayah — dari data bisnis sampai listing terbit.
            </p>
          </div>

          <ul className="mt-5 space-y-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.text}
                  className="flex items-center gap-3 text-sm text-slate-700 animate-du-rise motion-reduce:animate-none"
                  style={rise(2 + i)}
                >
                  <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span>{s.text}</span>
                </li>
              );
            })}
          </ul>

          <div
            className="mt-6 grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 animate-du-rise motion-reduce:animate-none"
            style={rise(5)}
          >
            <div className="min-w-0">
              <div className="text-3xs font-semibold text-slate-400 uppercase tracking-wider">Dikembangkan oleh</div>
              <div className="text-sm font-bold text-slate-900 leading-tight mt-0.5">Muhamad Rasya Ramadhan</div>
              <div className="text-2xs text-slate-500 mt-0.5">Siswa PKL · SMK Yadika 5</div>
            </div>
            <div className="min-w-0 border-l border-slate-200 pl-3">
              <div className="text-3xs font-semibold text-slate-400 uppercase tracking-wider">Pembimbing</div>
              <div className="text-sm font-bold text-slate-900 leading-tight mt-0.5">Aceng Komarudin</div>
            </div>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 animate-du-rise motion-reduce:animate-none" style={rise(6)}>
            <button
              type="button"
              onClick={dismiss}
              autoFocus
              className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm font-semibold rounded-xl px-4 py-3 transition-colors transition-transform motion-reduce:transition-none cursor-pointer"
            >
              Mulai
              <ArrowRight className="w-4 h-4" />
            </button>
            <label className="inline-flex items-center gap-2 text-2xs text-slate-500 cursor-pointer select-none sm:pl-1">
              <input
                type="checkbox"
                checked={never}
                onChange={e => setNever(e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-600"
              />
              Jangan tampilkan lagi
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
