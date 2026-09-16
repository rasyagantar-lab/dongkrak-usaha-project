import React, { useEffect, useState } from 'react';
import { Globe, ArrowRight, Building2, Workflow, Send, Github, ExternalLink, History, RefreshCw, ChevronRight } from 'lucide-react';
import { CHANGELOG, APP_VERSION } from '../changelog';

/*
  Welcome splash, third version (2026-09-16). Three tabs:
  - Tentang: what the app does, credits, and a block that opens the GitHub profile.
  - Log Update: the changelog from src/changelog.ts, scrollable.
  - Profil GitHub: the developer's profile card + their profile README exactly as
    GitHub renders it (fetched through /api/github/profile, scrollable, includes the
    "Languages and Tools" icons). Falls back to a static card if the fetch fails.

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
  { icon: Building2, text: 'Isi data bisnis sekali' },
  { icon: Workflow, text: 'AI menyusun strategi, konten, dan audit' },
  { icon: Send, text: 'Terbitkan ke DongkrakUsaha lewat ekstensi' }
];

type SplashTab = 'about' | 'changelog' | 'github';

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

const GITHUB_URL = 'https://github.com/kartiniresolusi-source';

export const WelcomeSplash: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [never, setNever] = useState(false);
  const [tab, setTab] = useState<SplashTab>('about');

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
  }, [visible, never]);

  // The README is only fetched when the GitHub tab is opened -- most sessions never
  // need it, and it is the heaviest thing on this screen.
  useEffect(() => {
    if (tab !== 'github' || profileState !== 'idle') return;
    setProfileState('loading');
    fetch('/api/github/profile')
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Gagal memuat profil');
        setProfile(data);
        setProfileState('ready');
      })
      .catch(() => setProfileState('error'));
  }, [tab, profileState]);

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
  const rise = (i: number): React.CSSProperties => ({ animationDelay: `${100 + i * 80}ms` });

  const TABS: { id: SplashTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'about', label: 'Tentang', icon: Globe },
    { id: 'changelog', label: 'Log Update', icon: History },
    { id: 'github', label: 'Profil GitHub', icon: Github }
  ];

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
        className={`relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden motion-reduce:animate-none ${
          closing ? 'animate-du-scale-out' : 'animate-du-scale-in'
        }`}
      >
        {/* Soft backdrop: static gradient + two blobs, no filters. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-50 via-white to-white pointer-events-none" />
        <div aria-hidden="true" className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-blue-100/70 pointer-events-none" />
        <div aria-hidden="true" className="absolute -top-6 -left-20 w-48 h-48 rounded-full bg-violet-100/60 pointer-events-none" />

        {/* Header: mark + title + tabs */}
        <div className="relative px-6 sm:px-7 pt-6 pb-3">
          <div className="flex items-start gap-4 animate-du-rise motion-reduce:animate-none" style={rise(0)}>
            <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shrink-0 animate-du-breathe motion-reduce:animate-none">
              <Globe className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <div className="text-3xs font-semibold text-blue-600 uppercase tracking-[0.2em]">DongkrakUsaha · v{APP_VERSION}</div>
              <h1 id="du-splash-title" className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight tracking-tight mt-0.5">
                AI Marketing Suite
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                Satu bisnis, seluruh wilayah — dari data bisnis sampai listing terbit.
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-1 bg-slate-100 p-1 rounded-xl animate-du-rise motion-reduce:animate-none" style={rise(1)}>
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body: scrolls when content is tall (changelog, README). */}
        <div className="relative flex-1 min-h-0 overflow-y-auto px-6 sm:px-7 pb-2">
          {tab === 'about' && (
            <div key="about" className="space-y-4">
              <ul className="space-y-2">
                {STEPS.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.text} className="flex items-center gap-3 text-sm text-slate-700 animate-du-rise motion-reduce:animate-none" style={rise(2 + i)}>
                      <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span>{s.text}</span>
                    </li>
                  );
                })}
              </ul>

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

              {/* The block the user asked for: press it to see the GitHub profile + README. */}
              <button
                type="button"
                onClick={() => setTab('github')}
                className="w-full text-left flex items-center gap-3 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 p-3.5 transition-colors cursor-pointer animate-du-rise motion-reduce:animate-none"
                style={rise(6)}
              >
                <span className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                  <Github className="w-4.5 h-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">Profil GitHub pengembang</span>
                  <span className="block text-2xs text-slate-500 truncate">github.com/kartiniresolusi-source — lihat README profil, tools yang dipakai, dan repo proyek ini</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            </div>
          )}

          {tab === 'changelog' && (
            <div key="changelog" className="space-y-3 animate-du-fade-in motion-reduce:animate-none">
              {CHANGELOG.map((entry, i) => (
                <div key={entry.version} className="rounded-2xl border border-slate-200 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-3xs font-bold px-1.5 py-0.5 rounded ${i === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>v{entry.version}</span>
                      <span className="text-sm font-bold text-slate-900 truncate">{entry.title}</span>
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
          )}

          {tab === 'github' && (
            <div key="github" className="space-y-3 animate-du-fade-in motion-reduce:animate-none">
              {/* Profile card: from the API when available, static otherwise. */}
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                <img
                  src={profile?.avatarUrl || `${GITHUB_URL}.png?size=96`}
                  alt=""
                  width={56}
                  height={56}
                  className="w-14 h-14 rounded-full border border-slate-200 bg-white shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900 leading-tight">{profile?.name || 'Rasya Kishou'}</div>
                  <div className="text-2xs text-slate-500 truncate">@{profile?.login || 'kartiniresolusi-source'}{profile?.bio ? ` · ${profile.bio}` : ''}</div>
                  {profile && (
                    <div className="text-3xs text-slate-400 mt-1">
                      {profile.publicRepos ?? 0} repo · {profile.followers ?? 0} pengikut{profile.stale ? ' · data tersimpan' : ''}
                    </div>
                  )}
                </div>
                <a
                  href={profile?.htmlUrl || GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shrink-0"
                >
                  Buka GitHub <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {profileState === 'loading' && (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-6 justify-center">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Memuat README profil dari GitHub...
                </div>
              )}
              {profileState === 'error' && (
                <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  README profil tidak bisa dimuat sekarang (offline atau GitHub membatasi). Buka langsung lewat tombol di atas.
                </div>
              )}
              {profileState === 'ready' && profile?.readmeHtml && (
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-3xs font-semibold text-slate-500 uppercase tracking-wider">
                    README profil · tampil persis seperti di GitHub
                  </div>
                  {/* Rendered by GitHub, proxied and sanitised by our server (no scripts,
                      no inline handlers). Scrolls inside the card. */}
                  <div
                    className="gh-readme max-h-[52vh] overflow-y-auto p-4"
                    dangerouslySetInnerHTML={{ __html: profile.readmeHtml }}
                  />
                </div>
              )}
              {profileState === 'ready' && !profile?.readmeHtml && (
                <div className="text-xs text-slate-500 text-center py-4">Profil ini belum punya README.</div>
              )}
            </div>
          )}
        </div>

        {/* Footer: action + opt-out */}
        <div className="relative px-6 sm:px-7 py-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 bg-white">
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
  );
};
