import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Building2,
  Eye,
  Send,
  Settings,
  History,
  Workflow,
  Image as ImageIcon,
  MapPinned
} from 'lucide-react';
import { useJobCenter } from '../jobs';

/*
  Bottom tab bar. One blue "bubble" sits under the active tab and glides to the next
  one on click (translateX only, springy easing), then does a small scale bounce as
  it lands. Width changes are applied instantly (no layout animation) -- only
  transform and opacity ever animate here, per the UI conventions in CLAUDE.md.
  Tabs with a running background job carry a dot badge.
*/

export const NAV_ITEMS = [
  { id: 'business', label: 'Data Bisnis', short: 'Bisnis', num: 1, icon: Building2 },
  { id: 'market-siege', label: 'Kepung Pasar', short: 'Kepung', num: 2, icon: MapPinned },
  { id: 'orchestrator', label: 'AI Orchestrator', short: 'AI', num: 3, icon: Workflow },
  { id: 'visual-asset', label: 'Visual Aset', short: 'Visual', num: 4, icon: ImageIcon },
  { id: 'dongkrak-preview', label: 'Preview', short: 'Preview', num: 5, icon: Eye },
  { id: 'publishing-hub', label: 'Publish', short: 'Publish', num: 6, icon: Send },
  { id: 'connection-settings', label: 'Koneksi', short: 'Koneksi', num: 0, icon: Settings },
  { id: 'history', label: 'Riwayat', short: 'Riwayat', num: 0, icon: History }
] as const;

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { jobs } = useJobCenter();
  const running: Record<string, number> = {};
  for (const j of Object.values(jobs)) if (j.status === 'running') running[j.tab] = (running[j.tab] || 0) + 1;

  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);

  const measure = () => {
    const list = listRef.current;
    const el = itemRefs.current[activeTab];
    if (!list || !el) return;
    // The pill is positioned inside the scroll container, so content coordinates.
    setPill({ x: el.offsetLeft, w: el.offsetWidth });
    // Keep the active tab in view when the bar scrolls (phone widths).
    const left = el.offsetLeft, right = left + el.offsetWidth;
    if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) {
      el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  };

  useLayoutEffect(() => {
    measure();
    // First paint: place the pill without sliding in from x=0.
    const t = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const onChange = () => measure();
    window.addEventListener('resize', onChange);
    return () => window.removeEventListener('resize', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 shadow-[0_-1px_0_rgba(15,23,42,0.04)] du-bottom-nav"
    >
      <div
        ref={listRef}
        className="relative max-w-7xl mx-auto flex items-stretch gap-1 px-2 sm:px-4 overflow-x-auto no-scrollbar h-full"
      >
        {/* The gliding bubble. translateX slides; the inner layer bounces on landing. */}
        {pill && (
          <div
            aria-hidden="true"
            className={`absolute top-2 bottom-2 left-0 pointer-events-none ${ready ? 'transition-transform duration-300 ease-du-spring motion-reduce:transition-none' : ''}`}
            style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
          >
            <div key={activeTab} className="w-full h-full rounded-xl bg-blue-600 shadow-sm animate-du-bubble motion-reduce:animate-none" />
          </div>
        )}

        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const count = running[item.id] || 0;
          return (
            <button
              key={item.id}
              ref={el => { itemRefs.current[item.id] = el; }}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative z-10 flex-1 min-w-[64px] sm:min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-2 sm:px-3 my-2 rounded-xl text-2xs sm:text-xs font-semibold whitespace-nowrap select-none cursor-pointer transition-colors duration-200 active:scale-95 motion-reduce:active:scale-100 ${
                isActive ? 'text-white' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span className="relative">
                <Icon className="w-4 h-4 sm:w-4 sm:h-4" />
                {count > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-1 rounded-full text-3xs font-bold flex items-center justify-center animate-du-pulse motion-reduce:animate-none ${
                      isActive ? 'bg-white text-blue-700' : 'bg-violet-600 text-white'
                    }`}
                    title={`${count} pekerjaan berjalan`}
                  >
                    {count}
                  </span>
                )}
              </span>
              <span className="leading-none">
                {item.num ? <span className={`hidden sm:inline ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>{item.num}. </span> : null}
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
