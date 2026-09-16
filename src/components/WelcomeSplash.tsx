import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Globe, ArrowRight, Building2, Workflow, Send, Github, ExternalLink, History, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { CHANGELOG, APP_VERSION } from '../changelog';

/*
  Welcome splash, fourth version (2026-09-17): one wide dialog, two panes.
  - Left ("Tentang"): what the app does, credits, and the developer's GitHub card.
    The card itself expands in place to show the profile README exactly as GitHub
    renders it (fetched through /api/github/profile, scrollable, includes the
    "Languages and Tools" icons). No separate tab -- the owner asked for one place.
  - Right ("Log Update"): the changelog from src/changelog.ts, scrollable.
  On phones the panes stack. Falls back to a static GitHub card if the fetch fails.

  Animation policy unchanged: transform/opacity only, no blur, motion-reduce gated.
  Shown once per browser session; "Jangan tampilkan lagi" turns it off on this
  browser (localStorage). Storage access is wrapped -- a blocked context must never
  break the app.
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
  { icon: Building2, title: 'Isi data bisnis', text: 'Sekali saja: nama, layanan, WhatsApp, alamat, kota.' },
  { icon: Workflow, title: 'AI bekerja', text: 'Strategi, keyword, konten, audit kualitas, dan konsep gambar — otomatis.' },
  { icon: Send, title: 'Terbitkan', text: 'Ekstensi Chrome mengisi form DongkrakUsaha untuk Anda.' }
];

interface GithubProfile {
  login: string;
  name?: string;
  bio?: string;
  avatarUrl: string;
  htmlUrl: string;
  publicRepos?: number;
  followers?: number;
  following?: number;
  readmeHtml: string;
  stale?: boolean;
}

const GITHUB_LOGIN = 'rasyagantar-lab';
const GITHUB_URL = `https://github.com/${GITHUB_LOGIN}`;

export const WelcomeSplash: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [never, setNever] = useState(false);

  const [readmeOpen, setReadmeOpen] = useState(false);

  // "Read before you continue": Mulai stays disabled until the Log Update has been
  // scrolled to the bottom. On desktop that is the right pane; on phones the whole
  // card scrolls as one and the log sits at the bottom, so the wrapper is measured.
  // A pane that fits without scrolling counts as read. Esc / click-outside honour
  // the same gate, otherwise it would be decorative.
  const wrapRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLElement>(null);
  const [readPct, setReadPct] = useState(0);
  const [nudge, setNudge] = useState(0);
  const hasRead = readPct >= 100;
  const measureRead = useCallback(() => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    const el = isDesktop ? logRef.current : wrapRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max <= 4 ? 100 : Math.min(100, Math.round(((el.scrollTop + 4) / max) * 100));
    setReadPct(prev => (pct > prev ? pct : prev)); // reading is monotonic
  }, []);
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(measureRead, 400); // after the rise-in animation settles
    window.addEventListener('resize', measureRead);
    return () => { clearTimeout(t); window.removeEventListener('resize', measureRead); };
  }, [visible, readmeOpen, measureRead]);
  const [profile, setProfile] = useState<GithubProfile | null>(null);
  const [profileState, setProfileState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (!readFlag('local', NEVER_KEY) && !readFlag('session', SESSION_KEY)) setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, never, hasRead]);

  // The README is fetched only when the card is expanded -- it is the heaviest
  // thing on this screen and most sessions never open it.
  useEffect(() => {
    if (!readmeOpen || profileState !== 'idle') return;
    setProfileState('loading');
    fetch('/api/github/profile')
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Gagal memuat profil');
        setProfile(data);
        setProfileState('ready');
      })
      .catch(() => setProfileState('error'));
  }, [readmeOpen, profileState]);

  const dismiss = () => {
    if (closing) return;
    if (!hasRead) { setNudge(n => n + 1); return; }
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
  const rise = (i: number): React.CSSProperties => ({ animationDelay: `${100 + i * 70}ms` });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="du-splash-title"
      onClick={dismiss}
      // Flat semi-transparent scrim, never backdrop-blur (integrated GPUs).
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/55 motion-reduce:animate-none ${
        closing ? 'animate-du-fade-out' : 'animate-du-fade-in'
      }`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`relative w-full max-w-5xl max-h-[94vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden motion-reduce:animate-none ${
          closing ? 'animate-du-scale-out' : 'animate-du-scale-in'
        }`}
      >
        {/* Brand band */}
        <div className="relative shrink-0 px-6 sm:px-8 pt-6 pb-5 bg-gradient-to-r from-blue-600 via-blue-600 to-violet-600 text-white overflow-hidden">
          <div aria-hidden="true" className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-white/10 pointer-events-none" />
          <div aria-hidden="true" className="absolute -bottom-24 left-1/3 w-56 h-56 rounded-full bg-white/10 pointer-events-none" />
          <div className="relative flex items-center gap-4 animate-du-rise motion-reduce:animate-none" style={rise(0)}>
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0 animate-du-breathe motion-reduce:animate-none">
              <Globe className="w-8 h-8" />
            </div>
            <div className="min-w-0">
              <div className="text-3xs font-semibold text-blue-100 uppercase tracking-[0.2em]">DongkrakUsaha · v{APP_VERSION}</div>
              <h1 id="du-splash-title" className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight mt-0.5">
                AI Marketing Suite
              </h1>
              <p className="text-sm sm:text-base text-blue-100 mt-1 leading-relaxed">
                Satu bisnis, seluruh wilayah — dari data bisnis sampai listing terbit.
              </p>
            </div>
          </div>
        </div>

        {/* Two panes; stacked on phones. Each pane scrolls on its own. */}
        <div ref={wrapRef} onScroll={measureRead} className="relative flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] overflow-y-auto lg:overflow-hidden">
          {/* LEFT: about + credits + GitHub */}
          <section className="lg:overflow-y-auto px-6 sm:px-8 py-5 space-y-5 lg:border-r border-slate-100">
            <div>
              <div className="text-3xs font-semibold text-slate-400 uppercase tracking-wider mb-2 animate-du-rise motion-reduce:animate-none" style={rise(1)}>Cara kerja</div>
              <ol className="space-y-2.5">
                {STEPS.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.title} className="flex items-start gap-3 animate-du-rise motion-reduce:animate-none" style={rise(2 + i)}>
                      <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 font-bold text-sm">
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900 leading-tight">{i + 1}. {s.title}</span>
                        <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">{s.text}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 animate-du-rise motion-reduce:animate-none" style={rise(5)}>
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

            {/* GitHub card: link + README expander, all in one place. */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden animate-du-rise motion-reduce:animate-none" style={rise(6)}>
              <div className="flex items-center gap-3 p-3.5 bg-white">
                <img
                  src={profile?.avatarUrl || `${GITHUB_URL}.png?size=96`}
                  alt=""
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full border border-slate-200 bg-slate-50 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 leading-tight">
                    <Github className="w-4 h-4 text-slate-700 shrink-0" />
                    <span className="truncate">{profile?.name || 'Rasya Kishou'}</span>
                  </div>
                  <div className="text-2xs text-slate-500 truncate">
                    github.com/{profile?.login || GITHUB_LOGIN}{profile?.bio ? ` · ${profile.bio}` : ''}
                  </div>
                </div>
                <a
                  href={profile?.htmlUrl || GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shrink-0"
                >
                  Buka <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <button
                type="button"
                onClick={() => setReadmeOpen(o => !o)}
                aria-expanded={readmeOpen}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2 bg-slate-50 border-t border-slate-200 text-2xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <span>{readmeOpen ? 'Tutup README profil' : 'Lihat README profil — tools yang dipakai & cara menghubungi'}</span>
                {readmeOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {readmeOpen && (
                <div className="border-t border-slate-200 animate-du-fade-in motion-reduce:animate-none">
                  {profileState === 'loading' && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 py-6 justify-center">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Memuat README dari GitHub...
                    </div>
                  )}
                  {profileState === 'error' && (
                    <div className="text-xs text-slate-500 p-3 text-center">
                      README tidak bisa dimuat sekarang (offline atau GitHub membatasi). Buka lewat tombol di atas.
                    </div>
                  )}
                  {profileState === 'ready' && profile?.readmeHtml && (
                    /* Rendered by GitHub, proxied and sanitised by our server. Scrolls inside. */
                    <div className="gh-readme max-h-[48vh] overflow-y-auto p-4" dangerouslySetInnerHTML={{ __html: profile.readmeHtml }} />
                  )}
                  {profileState === 'ready' && !profile?.readmeHtml && (
                    <div className="text-xs text-slate-500 p-3 text-center">Profil ini belum punya README.</div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* RIGHT: update log */}
          <section ref={logRef} onScroll={measureRead} className="lg:overflow-y-auto px-6 sm:px-8 py-5 bg-slate-50/60">
            <div className="flex items-center gap-2 text-3xs font-semibold text-slate-400 uppercase tracking-wider mb-3 animate-du-rise motion-reduce:animate-none" style={rise(2)}>
              <History className="w-3.5 h-3.5" /> Log Update
            </div>
            <div className="space-y-3">
              {CHANGELOG.map((entry, i) => (
                <div key={entry.version} className="rounded-2xl border border-slate-200 bg-white p-3.5 animate-du-rise motion-reduce:animate-none" style={rise(3 + i)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className={`text-3xs font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${i === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>v{entry.version}</span>
                      <span className="text-sm font-bold text-slate-900 leading-snug">{entry.title}</span>
                    </div>
                    <span className="text-3xs text-slate-400 shrink-0">{entry.date}</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {entry.items.map(item => (
                      <li key={item} className="text-xs text-slate-600 leading-relaxed flex gap-2">
                        <span className="text-slate-300 shrink-0">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="relative shrink-0 px-6 sm:px-8 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3 bg-white">
          <div className="sm:w-72 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={dismiss}
              disabled={!hasRead}
              autoFocus
              title={hasRead ? undefined : 'Scroll Log Update sampai bawah dulu'}
              className={`relative overflow-hidden inline-flex items-center justify-center gap-2 text-white text-base font-semibold rounded-xl px-4 py-3 transition-colors transition-transform motion-reduce:transition-none ${
                hasRead ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] cursor-pointer' : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              {/* Reading progress fills the button from the left (transform only). */}
              {!hasRead && (
                <span aria-hidden="true" className="absolute inset-0 bg-blue-500/70 origin-left transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${readPct / 100})` }} />
              )}
              <span className="relative inline-flex items-center gap-2">
                {hasRead ? 'Mulai' : `Baca dulu · ${readPct}%`}
                <ArrowRight className="w-4 h-4" />
              </span>
            </button>
            {!hasRead && (
              <span key={nudge} className={`text-3xs text-slate-500 text-center ${nudge ? 'animate-du-scale-in motion-reduce:animate-none text-rose-600 font-semibold' : ''}`}>
                {nudge ? 'Belum bisa — scroll Log Update sampai bawah dulu 😄' : 'Scroll Log Update sampai bawah untuk melanjutkan'}
              </span>
            )}
          </div>
          <label className="inline-flex items-center gap-2 text-2xs text-slate-500 cursor-pointer select-none sm:pl-1">
            <input
              type="checkbox"
              checked={never}
              onChange={e => setNever(e.target.checked)}
              className="w-3.5 h-3.5 accent-blue-600"
            />
            Jangan tampilkan lagi
          </label>
          <span className="sm:ml-auto text-3xs text-slate-400">{hasRead ? 'Esc atau klik di luar untuk menutup' : 'Kartu ini terkunci sampai selesai dibaca'}</span>
        </div>
      </div>
    </div>
  );
};
