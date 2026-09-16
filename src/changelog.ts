/*
  Update log shown in the welcome splash ("Log Update" tab). Written for the PKL
  team, not for developers: what changed for THEM, in plain Indonesian.

  Maintenance rule (see CLAUDE.md): every user-visible change ships with an entry
  here, newest first. Keep each item one line. Dates are ISO (YYYY-MM-DD).
*/

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const APP_VERSION = '2.5';

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.5.1',
    date: '2026-09-16',
    title: 'Orchestrator jauh lebih cepat & lebih transparan',
    items: [
      'Orchestrator ~23 detik saat Google normal, 45–85 detik saat Google sedang bermasalah (sebelumnya 2–5 menit).',
      'Task Ledger menampilkan tiap percobaan model beserta durasinya, plus tombol "Salin ledger (JSON)".',
      'Model yang sedang bermasalah di Google otomatis dilewati semua agent, bukan dicoba ulang oleh tiap stage.',
      'Widget AI Agent Status menyebut model mana yang sedang bermasalah dan berapa lama dilewati.',
      'Kartu pengenalan: tab Log Update dan Profil GitHub pengembang.'
    ]
  },
  {
    version: '2.5',
    date: '2026-09-15',
    title: 'Navigasi bawah, kerja di latar belakang, ekstensi 1.1.0',
    items: [
      'Tab pindah ke bawah layar dengan indikator yang meluncur; kartu pengenalan baru.',
      'Semua tab tetap bekerja saat Anda pindah tab; notifikasi progress muncul di kiri bawah.',
      'Orchestrator menampilkan tahap yang sedang berjalan secara real-time.',
      'Tab Publish: tombol "Buka Form Input Produk (klik otomatis)" — ekstensi menekan tombol Input Produk di DongkrakUsaha untuk Anda (perlu ekstensi 1.1.0).',
      'Caption pada gambar listing tidak lagi tampil sebagai kotak-kotak di server hosting.',
      'Status quota model dibedakan: limit per menit, limit harian, atau tanpa jatah gratis.',
      'Audit yang butuh data pemilik usaha (nama daerah, alamat, WhatsApp) diserahkan ke kolom "Perlu Input Anda" alih-alih direvisi berulang.'
    ]
  },
  {
    version: '2.4',
    date: '2026-09-14',
    title: 'Kepung Pasar, foto dasar AI, kontrak agent hidup',
    items: [
      'Tab Kepung Pasar: buat draft listing untuk banyak kecamatan sekaligus tanpa kuota AI, realisasikan hanya yang dipilih.',
      'Visual Aset: foto dasar bisa dibuat dengan AI (Cloudflare) atau diunggah, caption dirender lokal.',
      'Setiap agent AI membaca dan mengembangkan file kontraknya sendiri (ai-agents/*.md) pada tiap panggilan.',
      'Campaign dan riwayat tersimpan permanen; tombol hapus campaign.',
      'Panduan "Cara pakai aplikasi ini" di tab Data Bisnis.'
    ]
  },
  {
    version: '2.3',
    date: '2026-09-13',
    title: 'Publikasi via ekstensi Chrome',
    items: [
      'Isi form DongkrakUsaha otomatis dari campaign, submit dengan konfirmasi, status "Submitted" di Riwayat.',
      'URL publik listing diisi manual di Riwayat setelah tersedia (~24 jam setelah submit).'
    ]
  }
];
