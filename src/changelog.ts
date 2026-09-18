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

export const APP_VERSION = '2.7';

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.7',
    date: '2026-09-18',
    title: 'Deskripsi jadi artikel SEO 500–1000 kata',
    items: [
      'Sesuai arahan pembimbing: deskripsi listing sekarang artikel SEO 500–1000 kata. Server yang menghitung katanya, bukan AI — kalau meleset, otomatis dikoreksi satu kali lalu diperiksa lagi oleh Audit.',
      'Kolom "Tujuan & instruksi" di AI Orchestrator sekarang benar-benar sampai ke penulis konten dan auditor (sebelumnya cuma ke tahap perencanaan).',
      'Klik kotak Konten di kanvas untuk melihat jumlah kata dan apakah sudah memenuhi syarat.'
    ]
  },
  {
    version: '2.6.1',
    date: '2026-09-18',
    title: 'Layar penuh diperbaiki, tidak ada lagi layar putih',
    items: [
      'Tombol layar penuh di kanvas orchestrator sekarang benar-benar memenuhi layar (sebelumnya cuma garis hitam tipis).',
      'Di HP, kotak agent pertama tidak lagi tertutup panel campaign saat kanvas dibuka.',
      'Layar putih saat orchestrator jalan sudah ketemu penyebabnya (geser kanvas lalu lepas cepat) dan diperbaiki.',
      'Kalau ada bagian aplikasi yang error, yang muncul sekarang panel merah dengan tombol "Coba lagi" dan "Salin detail error" — bukan halaman putih yang harus di-refresh. Kirim hasil salinannya kalau ini terjadi.'
    ]
  },
  {
    version: '2.6',
    date: '2026-09-17',
    title: 'Tab AI Orchestrator jadi peta agent',
    items: [
      'Orchestrator sekarang berupa kanvas: tiap agent jadi kotak, garisnya memperlihatkan siapa mengoper pekerjaan ke siapa.',
      'Saat dijalankan, agent yang sedang bekerja menyala dan data terlihat mengalir di jalur yang benar-benar aktif — bukan animasi hiasan.',
      'Klik sebuah agent untuk melihat model yang dipakai, lama kerjanya, percobaan yang gagal, dan hasil tahap itu.',
      'Kanvas bisa di-zoom, digeser, dan dibuka layar penuh; ada tombol hemat kalau laptop terasa berat.',
      'Kolom "Perlu Input Anda" kini menempel pada node-nya sendiri, lengkap dengan tombol Simpan & Jalankan Ulang.'
    ]
  },
  {
    version: '2.5.1',
    date: '2026-09-16',
    title: 'Orchestrator lebih cepat, data bisa dicadangkan',
    items: [
      'AI Orchestrator ±23 detik (sebelumnya 2–5 menit); saat Google sedang bermasalah tetap di bawah 1,5 menit.',
      'Task Ledger memperlihatkan model mana yang dicoba dan berapa lama — jelas kenapa sebuah tahap lambat.',
      'Koneksi → Cadangan Data: unduh semua campaign + riwayat ke satu file, pulihkan kapan saja.',
      'Kartu pengenalan baru: dua panel — pengenalan + profil GitHub pengembang (README bisa dibuka di tempat) dan Log Update.'
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
