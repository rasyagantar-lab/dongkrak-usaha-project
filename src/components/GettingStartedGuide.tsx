import React, { useState } from 'react';
import { Compass, ChevronDown, ChevronUp, Building2, MapPinned, Workflow, Image as ImageIcon, Send } from 'lucide-react';

interface GettingStartedGuideProps {
  onGoTo: (tab: string) => void;
}

// Plain-language map of the whole app for a first-time operator (the PKL interns).
// Lives at the top of "1. Data Bisnis", the landing tab. Collapsible, remembered per
// browser so it stops taking space once someone knows the flow.
const STORAGE_KEY = 'du-guide-collapsed';

const STEPS = [
  {
    tab: 'business', icon: Building2, title: '1. Isi data bisnis',
    what: 'Nama, kategori, WhatsApp, alamat, layanan, kota. Ini bahan baku semua AI -- tanpa ini AI tidak tahu bisnis apa yang dipromosikan.',
    when: 'Sekali per bisnis. Klik "Simpan Data Bisnis" setelah mengisi.'
  },
  {
    tab: 'market-siege', icon: MapPinned, title: '2. Kepung Pasar (opsional)',
    what: 'Satu bisnis jadi banyak listing -- satu per kecamatan. Ketik daftar kecamatan, app membuat draft untuk semuanya secara GRATIS (tanpa AI).',
    when: 'Kalau mau menargetkan banyak area. Lewati kalau cuma satu kota.'
  },
  {
    tab: 'orchestrator', icon: Workflow, title: '3. Jalankan AI Orchestrator',
    what: 'Satu tombol, semua agent kerja berurutan: strategi -> keyword -> tulisan -> audit kualitas (dengan revisi otomatis) -> konsep gambar. Ini yang memakai kuota AI.',
    when: 'Untuk SATU campaign (yang dipilih di dropdown). Kalau campaign-nya banyak dari Kepung Pasar, pakai tombol "Realisasikan" di sana -- mesinnya sama, tapi jalan untuk semua yang dicentang tanpa harus ganti dropdown 30 kali. Klik "Terapkan ke Campaign" kalau hasilnya oke.'
  },
  {
    tab: 'visual-asset', icon: ImageIcon, title: '4. Buat gambar listing',
    what: 'Upload foto produk asli ATAU buat dengan AI. Caption (judul, subjudul, badge promo) sudah terisi otomatis dari langkah 3, tinggal render.',
    when: 'Foto dasar cukup sekali per kategori bisnis; caption berbeda tiap listing.'
  },
  {
    tab: 'publishing-hub', icon: Send, title: '5-6. Preview lalu Publish',
    what: 'Cek tampilan akhir, lalu isi otomatis form DongkrakUsaha lewat ekstensi Chrome dan submit. Riwayat mencatat semua yang terkirim.',
    when: 'Butuh ekstensi terpasang dan login DongkrakUsaha di tab lain (lihat "Koneksi").'
  }
];

export const GettingStartedGuide: React.FC<GettingStartedGuideProps> = ({ onGoTo }) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return window.localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-200 rounded-xl shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">Cara pakai aplikasi ini</div>
            <div className="text-2xs text-slate-500">Lima langkah, dari data bisnis sampai listing terbit. Tab di atas sudah diurutkan sesuai langkah.</div>
          </div>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="px-5 pb-3">
          <div className="bg-white border border-blue-200 rounded-lg p-3 text-2xs text-slate-700 leading-relaxed">
            <span className="font-bold text-slate-900">Apa itu "Campaign" di dropdown atas?</span> Satu campaign = satu listing yang
            akan diterbitkan = data bisnis + satu area target + semua hasil AI-nya. Satu bisnis boleh punya banyak campaign
            (misalnya satu per kecamatan). Dropdown itu memilih <span className="font-semibold">campaign mana yang sedang dikerjakan</span> --
            semua tab (Data Bisnis, Orchestrator, Visual, Preview, Publish) selalu menampilkan campaign yang dipilih di sana.
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-5 gap-3">
          {STEPS.map(step => {
            const Icon = step.icon;
            return (
              <button
                key={step.tab}
                type="button"
                onClick={() => onGoTo(step.tab)}
                className="text-left bg-white border border-slate-200 rounded-lg p-3 hover:border-blue-400 hover:shadow-sm transition-colors group flex flex-col justify-start items-stretch"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="text-xs font-bold text-slate-800 group-hover:text-blue-700">{step.title}</div>
                </div>
                <p className="text-2xs text-slate-600 leading-relaxed">{step.what}</p>
                <p className="text-3xs text-slate-400 mt-1.5 leading-relaxed"><span className="font-semibold">Kapan:</span> {step.when}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
