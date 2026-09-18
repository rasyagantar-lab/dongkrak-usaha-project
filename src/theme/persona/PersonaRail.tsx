import React from 'react';
import { NAV_ITEMS } from '../../components/BottomNav';
import { useJobCenter } from '../../jobs';
import { useTheme } from '../useTheme';

/*
  Desktop navigation for the Persona theme: the P5 main menu as a left rail. Eight
  labels stacked and skewed, a giant number per entry, the active one a red block that
  slashes into the content area. Below 1024 px the bottom bar remains (phones keep
  their thumb reach); in the standard theme this renders nothing.

  Same data as BottomNav (NAV_ITEMS, running-job counts) so the two never disagree.
*/

export const PersonaRail: React.FC<{ activeTab: string; setActiveTab: (tab: string) => void }> = ({ activeTab, setActiveTab }) => {
  const [theme] = useTheme();
  const { jobs } = useJobCenter();
  if (theme !== 'persona') return null;
  const running: Record<string, number> = {};
  for (const j of Object.values(jobs)) if (j.status === 'running') running[j.tab] = (running[j.tab] || 0) + 1;

  return (
    <nav aria-label="Menu utama" className="du-rail hidden lg:flex fixed left-0 top-[73px] bottom-0 z-30 w-[228px] flex-col pt-6 pb-4 overflow-visible">
      <ul className="flex flex-col gap-1.5">
        {NAV_ITEMS.map((item, i) => {
          const Icon = item.icon;
          const active = item.id === activeTab;
          const count = running[item.id] || 0;
          return (
            <li key={item.id} style={{ ['--i' as string]: i } as React.CSSProperties}>
              <button
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={active ? 'page' : undefined}
                data-active={active ? 'true' : 'false'}
                data-guide={'nav.' + item.id}
                className="du-rail-item relative w-full text-left flex items-center gap-3 pl-5 pr-3 py-2 cursor-pointer"
              >
                <span className="du-rail-num">{item.num || '·'}</span>
                <span className="du-rail-label flex items-center gap-2 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {count > 0 && <span className="du-rail-count" title={`${count} pekerjaan berjalan`}>{count}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
