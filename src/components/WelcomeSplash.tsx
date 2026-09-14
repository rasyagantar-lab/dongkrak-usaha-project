import React, { useEffect, useState } from 'react';
import { Globe, Sparkles, ArrowRight } from 'lucide-react';

// Shown once per browser session (a fresh tab/window shows it again). sessionStorage
// is wrapped in try/catch because a blocked-storage or private context can throw, and
// the splash must never be able to break the app.
const SESSION_KEY = 'du-welcome-splash-seen';
const EXIT_MS = 200; // must match animate-du-scale-out / animate-du-fade-out durations

const readSeen = (): boolean => {
  try { return window.sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
};
const writeSeen = () => {
  try { window.sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
};

export const WelcomeSplash: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!readSeen()) setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    writeSeen();
    window.setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, EXIT_MS);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="du-splash-title"
      onClick={dismiss}
      // Solid semi-transparent scrim on purpose -- no backdrop-blur. A full-viewport
      // blur is the single most expensive thing this app could ask an integrated GPU
      // to do; opacity on a flat colour is essentially free.
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 motion-reduce:animate-none ${
        closing ? 'animate-du-fade-out' : 'animate-du-fade-in'
      }`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden motion-reduce:animate-none ${
          closing ? 'animate-du-scale-out' : 'animate-du-scale-in'
        }`}
      >
        {/* Brand band -- reuses the header's own blue-600 badge + Globe mark. */}
        <div className="bg-blue-600 px-6 pt-7 pb-6 text-white">
          <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center mb-4">
            <Globe className="w-7 h-7" />
          </div>
          <div className="inline-flex items-center gap-1.5 bg-white/15 border border-white/25 rounded-full px-2.5 py-0.5 text-2xs font-semibold tracking-wide mb-2">
            <Sparkles className="w-3 h-3" />
            ASISTEN PREMIUM
          </div>
          <h1 id="du-splash-title" className="text-xl font-bold leading-tight">
            DongkrakUsaha Asisten Premium
          </h1>
          <p className="text-xs text-blue-100 mt-1.5 leading-relaxed">
            Otomatisasi Local SEO, AI Quality Control, dan publikasi langsung ke DongkrakUsaha —
            satu bisnis, seluruh wilayah.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-2.5">
            <div>
              <div className="text-3xs font-semibold text-slate-400 uppercase tracking-wider">Dikembangkan oleh</div>
              <div className="text-sm font-bold text-slate-900">Muhamad Rasya Ramadhan</div>
              <div className="text-xs text-slate-500">Siswa Praktik Kerja Lapangan (PKL) · SMK Yadika 5</div>
            </div>
            <div>
              <div className="text-3xs font-semibold text-slate-400 uppercase tracking-wider">Pembimbing</div>
              <div className="text-sm font-bold text-slate-900">Aceng Komarudin</div>
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            autoFocus
            className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm font-semibold rounded-xl px-4 py-3 transition-colors transition-transform motion-reduce:transition-none"
          >
            Mulai
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-3xs text-slate-400 text-center">Tekan Esc atau klik di luar untuk menutup</p>
        </div>
      </div>
    </div>
  );
};
