/*
  Update log shown in the welcome splash ("Log Update" tab). Written for the PKL
  team: only what they feel -- the AI engine and the screens they use. Internal
  plumbing (routers, docs, deploy) stays out of here.

  Maintenance rule (see DEVELOPMENT_RULES.md): every user-visible change ships with an entry
  here, newest first, one line per item. Dates are ISO (YYYY-MM-DD).
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
    title: 'Orchestrator lebih cepat, data bisa dicadangkan',
    items: [
      'AI Orchestrator ±23 detik (sebelumnya 2–5 menit); saat Google sedang bermasalah tetap di bawah 1,5 menit.',
      'Task Ledger memperlihatkan model mana yang dicoba dan berapa lama — jelas kenapa sebuah tahap lambat.',
      'Koneksi → Cadangan Data: unduh semua campaign + riwayat ke satu file, pulihkan kapan saja.',
      'Kartu pengenalan baru: dua panel — pengenalan + profil GitHub pengembang (README bisa dibuka di tempat) dan Log Update. Tombol Mulai aktif setelah Log Update dibaca sampai bawah.'
    ]
  },
  {
    version: '2.5',
    date: '2026-09-15',
    title: 'Navigasi bawah, kerja di latar belakang',
    items: [
      'Tab pindah ke bawah layar; semua tab tetap bekerja saat Anda pindah-pindah, progress tampil di kiri bawah.',
      'Orchestrator menampilkan tahap yang sedang berjalan secara real-time.',
      'Publish: tombol "Buka Form Input Produk (klik otomatis)" — perlu ekstensi 1.1.0.',
      'Audit yang butuh data pemilik usaha (nama daerah, alamat, WhatsApp) diserahkan ke kolom "Perlu Input Anda".',
      'Status model: limit per menit / harian / tanpa jatah gratis dibedakan.'
    ]
  },
  {
    version: '2.4',
    date: '2026-09-14',
    title: 'Kepung Pasar & foto dasar AI',
    items: [
      'Kepung Pasar: draft listing untuk banyak kecamatan sekaligus tanpa kuota AI, realisasikan yang dipilih saja.',
      'Visual Aset: foto dasar dari AI atau unggahan, caption dirender otomatis.',
      'Agent AI belajar dari tiap pekerjaan lewat catatan kontraknya sendiri.'
    ]
  }
];
