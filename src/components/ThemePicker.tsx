import React from 'react';
import { Palette, Check } from 'lucide-react';
import { THEMES, useTheme } from '../theme/useTheme';

/*
  Theme choice lives in Koneksi with the other per-device settings. Each option shows a
  small swatch of its own world so the choice is made by eye, not by name.
*/

export const ThemePicker: React.FC = () => {
  const [theme, setTheme] = useTheme();
  return (
    <div className="du-card bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4" data-guide="koneksi.tema">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
        <Palette className="w-4 h-4 text-blue-600" />
        Tampilan
      </h3>
      <p className="text-xs text-slate-500">Pilihan tersimpan di browser ini saja. Semua fungsi sama di kedua tampilan.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {THEMES.map(t => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              aria-pressed={active}
              className={`text-left rounded-xl border-2 p-3 flex gap-3 items-start cursor-pointer transition-colors ${active ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-400'}`}
            >
              <span aria-hidden="true" className={`shrink-0 w-14 h-10 grid grid-cols-3 overflow-hidden rounded-md border ${t.id === 'persona' ? 'border-black' : 'border-slate-300'}`}>
                {t.id === 'persona' ? (
                  <>
                    <span className="bg-[#0B0B0B]" /><span className="bg-[#E0121B]" /><span className="bg-[#FFFFFF]" />
                  </>
                ) : (
                  <>
                    <span className="bg-[#f1f5f9]" /><span className="bg-[#2563eb]" /><span className="bg-[#ffffff]" />
                  </>
                )}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  {t.label}
                  {active && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </span>
                <span className="block text-xs text-slate-500 leading-snug">{t.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
