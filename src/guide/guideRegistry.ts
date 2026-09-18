/*
  What the guide says about each part of the app. Keys are the values of data-guide
  attributes (or node.<id> for canvas nodes). One entry = what it does (fungsi, two
  sentences at most) and, where there is one, how it came to be (fakta), taken from
  PROJECT_KNOWLEDGE.md so the guide tells the app's real history, not marketing copy.
  tests/guideRegistry.test.ts pins coverage and length.
*/

export interface GuideEntry { judul: string; fungsi: string; fakta?: string; }

export const NAV_IDS = ['business', 'market-siege', 'orchestrator', 'visual-asset', 'dongkrak-preview', 'publishing-hub', 'connection-settings', 'history'] as const;

export const GUIDE: Record<string, GuideEntry> = {
  // ---- navigasi ----
  'nav.business': { judul: 'Data Bisnis', fungsi: 'Bahan baku semua agent: nama, kategori, WhatsApp, alamat, layanan, kota. Isi sekali per bisnis, simpan.', fakta: 'Auditor pernah menolak draft karena nomor WhatsApp kosong — data di sini yang menentukan, bukan AI.' },
  'nav.market-siege': { judul: 'Kepung Pasar', fungsi: 'Satu bisnis jadi banyak listing, satu per kecamatan. Draft dibuat gratis tanpa AI; realisasikan yang dipilih.', fakta: 'Mesinnya sama dengan Orchestrator; bedanya cuma dijalankan untuk banyak campaign sekaligus.' },
  'nav.orchestrator': { judul: 'AI Orchestrator', fungsi: 'Tujuh agent bekerja berurutan: rencana, strategi, keyword, tulisan, audit, revisi, konsep gambar. Ini yang memakai kuota AI.', fakta: 'Kanvas ini lahir 17 September 2026 karena daftar ledger tidak memperlihatkan siapa mengoper pekerjaan ke siapa.' },
  'nav.visual-asset': { judul: 'Visual Aset', fungsi: 'Foto produk asli atau buatan AI, ditambah caption (judul, subjudul, badge) yang sudah disiapkan agent Brief Gambar.', fakta: 'Caption dirender jadi jalur vektor dari font yang dibundel — dulu huruf Indonesia tertentu tampil sebagai kotak.' },
  'nav.dongkrak-preview': { judul: 'Preview', fungsi: 'Simulasi form Input Produk DongkrakUsaha dengan data yang akan diisi ekstensi. Cek di sini sebelum publish.', fakta: 'Sejak 19 September listing ini diturunkan langsung dari konten terbaru — sebelumnya bisa menampilkan deskripsi lama.' },
  'nav.publishing-hub': { judul: 'Publish', fungsi: 'Menghubungkan ke ekstensi Chrome: pindai form, isi otomatis, konfirmasi submit. Selalu berhenti sebelum submit.', fakta: 'DongkrakUsaha tidak punya API; ekstensi bekerja di dalam akun kamu sendiri, di tab browser kamu.' },
  'nav.connection-settings': { judul: 'Koneksi', fungsi: 'Cadangan data, pilihan tampilan, dan status koneksi ke DongkrakUsaha.', fakta: 'Di hosting AI Studio disk dibuang tiap server restart — cadangan JSON ada karena itu.' },
  'nav.history': { judul: 'Riwayat', fungsi: 'Semua yang pernah dikirim: status submit, URL publik kalau sudah ada, dan kapan.', fakta: 'URL publik baru bisa diambil sekitar 24 jam setelah submit; sebelum itu statusnya "Submitted".' },

  // ---- header & chrome ----
  'header.campaign': { judul: 'Campaign aktif', fungsi: 'Satu campaign = satu listing: data bisnis + satu area target + semua hasil AI-nya. Semua tab mengikuti pilihan ini.', fakta: 'Panel di-key per campaign; dulu ganti campaign tidak mengganti isi panel.' },
  'header.status': { judul: 'Status koneksi', fungsi: 'Apakah ekstensi dan tab DongkrakUsaha terdeteksi. Merah berarti belum terhubung.' },
  'status.agent': { judul: 'Status agent', fungsi: 'Kesehatan model AI per agent: siap, cooldown, atau kuota habis. Klik untuk rinciannya.', fakta: 'Kode 503 dari Google berarti "sedang padat" — router mengalihkan ke model cadangan, bukan gagal.' },
  'tray.job': { judul: 'Pekerjaan berjalan', fungsi: 'Run yang masih jalan di latar. Pindah tab atau campaign tidak membatalkannya.', fakta: 'Job Center hidup di akar aplikasi supaya hasil submit tidak hilang saat kamu pindah tab.' },

  // ---- orchestrator ----
  'orchestrator.instruksi': { judul: 'Tujuan & instruksi', fungsi: 'Diteruskan ke agent Plan, Strategi, Keyword, Konten, dan Audit sebagai prioritas tertinggi. Panjang boleh dalam kata, kalimat, atau karakter.', fakta: 'Sampai 18 September kolom ini tidak pernah sampai ke penulis — "500 kata" yang diketik tidak berefek.' },
  'orchestrator.terbaca': { judul: 'Terbaca', fungsi: 'Cara sistem menafsirkan instruksimu sebelum run: aturan panjang yang dipakai, atau apa yang dipotong dan kenapa.', fakta: 'Baris ini ada karena "500–1000 kalimat" pernah dijalankan diam-diam sebagai 500–1000 kata.' },
  'orchestrator.jalankan': { judul: 'Jalankan', fungsi: 'Memulai pipeline untuk campaign aktif. Sekitar 30 detik saat kuota tenang, lebih lama saat badai 503.', fakta: 'Dulu 2–5 menit; hedged timeout 30 detik dan kesehatan model per-model memangkasnya ke ±23 detik.' },
  'orchestrator.terapkan': { judul: 'Terapkan ke Campaign', fungsi: 'Menyimpan strategi, konten, audit, dan brief gambar ke campaign, lalu membangun ulang listing untuk Preview & Publish.' },
  'orchestrator.ledger': { judul: 'Salin ledger', fungsi: 'Menyalin jejak run sebagai JSON: tahap, model, key, durasi, dan setiap percobaan yang gagal.' },
  'orchestrator.hemat': { judul: 'Mode hemat', fungsi: 'Mematikan gerak aliran data di kanvas; status tetap tampil. Otomatis menyala kalau frame terasa berat.' },
  'orchestrator.zoom': { judul: 'Zoom', fungsi: 'Perbesar/perkecil kanvas. Scroll juga bisa; cubit dua jari di layar sentuh.' },
  'orchestrator.fit': { judul: 'Paskan ke layar', fungsi: 'Menyusun ulang tampilan supaya semua agent terlihat, tanpa lebih kecil dari 60% agar tetap terbaca.' },
  'orchestrator.fullscreen': { judul: 'Layar penuh', fungsi: 'Kanvas memenuhi layar; Esc untuk keluar.', fakta: 'Pernah tampil sebagai garis hitam tipis — animasi tab meninggalkan transform yang mengunci posisi fixed.' },

  // ---- node kanvas ----
  'node.source': { judul: 'Data Bisnis', fungsi: 'Sumber semua pekerjaan agent. Kalau hasil meleset, biasanya datanya yang kurang.' },
  'node.plan': { judul: 'Orchestrator', fungsi: 'Menyusun briefing: tujuan yang diperjelas, rincian tugas, risiko. Briefing ini diteruskan ke penulis dan auditor.' },
  'node.strategy': { judul: 'Strategi', fungsi: 'Posisi, sudut penawaran, CTA, nada. Berjalan paralel dengan Orchestrator.' },
  'node.keyword': { judul: 'Keyword', fungsi: 'Kata kunci utama, sekunder, LSI, intent, dan kota target untuk konten.' },
  'node.content': { judul: 'Konten', fungsi: 'Judul SEO, meta, dan artikel enam bagian. Panjangnya diukur server, bukan ditebak model.', fakta: 'Model kecil kurang ±15% dari jatah kata; koreksi otomatis satu kali memakai angka hasil ukur.' },
  'node.audit': { judul: 'Audit', fungsi: 'Skor SEO, kesiapan publish, temuan: yang bisa diperbaiki AI dan yang butuh datamu.', fakta: 'Selama beberapa hari auditor menilai teks lama campaign, bukan draft baru — salah urutan spread objek.' },
  'node.handoff': { judul: 'Perlu Input Anda', fungsi: 'Temuan yang hanya kamu yang bisa jawab: nomor WA, alamat, nama daerah. Isi di sini lalu jalankan ulang.' },
  'node.image': { judul: 'Brief Gambar', fungsi: 'Konsep foto dan caption untuk Visual Aset.' },
  'node.sink': { judul: 'Siap Pakai', fungsi: 'Hasil akhir run. Kalau ada blocker, tertulis di sini sebelum diterapkan.' },

  // ---- publish ----
  'publish.mode': { judul: 'Mode publish', fungsi: 'Ekstensi Chrome (pindai & isi otomatis), Manual Assist (langkah demi langkah), atau Export.' },
  'publish.refresh-dom': { judul: 'Refresh Live DOM', fungsi: 'Memindai form Input Produk yang sedang terbuka di tab DongkrakUsaha dan mencatat setiap field-nya.', fakta: 'Kalau popup ekstensi melihat field tapi di sini 0: ekstensi baru di-reload — klik Refresh Status di popup.' },
  'publish.buka-form': { judul: 'Buka Form Input Produk', fungsi: 'Membuka daftar produk DongkrakUsaha dan menekan tombol Input Produk untukmu.' },
  'publish.isi-form': { judul: 'Isi Form Otomatis', fungsi: 'Mengisi field dari campaign aktif — listing yang baru dibangun dari konten terbaru. Tidak submit.' },
  'publish.submit': { judul: 'Konfirmasi & Submit', fungsi: 'Mengirim form yang sudah terisi. Diblokir kalau CAPTCHA terdeteksi; status dicatat sebagai Submitted.' },
  'publish.ukur': { judul: 'Batas field', fungsi: 'Hasil "Ukur Field" dari popup ekstensi: panjang deskripsi di halaman dan setiap input ber-maxlength.', fakta: 'Kolom deskripsi DongkrakUsaha tidak punya maxlength; batasnya hanya bisa dibuktikan dengan publish lalu ukur ulang.' },

  // ---- koneksi ----
  'koneksi.tema': { judul: 'Tampilan', fungsi: 'Pilih tampilan standar atau Persona. Tersimpan di browser ini; semua fungsi sama.', fakta: 'Tema Persona mengganti 900-an warna sekaligus lewat CSS variable — bukan mengedit tiap komponen.' },
  'koneksi.cadangan': { judul: 'Unduh cadangan', fungsi: 'Satu file JSON berisi semua campaign dan riwayat. Simpan berkala.' },
  'koneksi.pulihkan': { judul: 'Pulihkan dari file', fungsi: 'Memuat cadangan; bisa digabung dengan data sekarang atau menggantikannya.' },

  // ---- tab lain ----
  'bisnis.simpan': { judul: 'Simpan Data Bisnis', fungsi: 'Menyimpan form ini ke campaign dan membangun ulang listing untuk Preview.' },
  'bisnis.form': { judul: 'Form bisnis', fungsi: 'Semua agent membaca dari sini. Nama daerah harus tempat nyata — placeholder akan ditolak auditor.' },
  'kepung.daftar': { judul: 'Daftar kecamatan', fungsi: 'Satu baris per area target; tiap baris jadi campaign sendiri.' },
  'kepung.realisasikan': { judul: 'Realisasikan', fungsi: 'Menjalankan orchestrator untuk campaign yang dicentang, berurutan, memakai kuota.' },
  'visual.upload': { judul: 'Foto dasar', fungsi: 'Unggah foto produk asli. Caption dari Brief Gambar dipasang di atasnya saat render.' },
  'visual.render': { judul: 'Render', fungsi: 'Menggabungkan foto dan caption menjadi gambar siap unggah, dikompresi ke WebP.' },
  'riwayat.tabel': { judul: 'Riwayat kirim', fungsi: 'Setiap submit tercatat di sini. "Tandai Selesai" untuk menambahkan URL publik setelah tersedia.' },
  'preview.listing': { judul: 'Simulasi form', fungsi: 'Persis yang akan diisi ekstensi: nama produk, penawaran, deskripsi, meta, WhatsApp. Meta dipotong 165 karakter sesuai form asli.' }
};

/** data-guide wins; a canvas node falls back to node.<id>. */
export function guideIdFrom(dataset: { guide?: string; node?: string }): string | null {
  if (dataset.guide) return dataset.guide;
  if (dataset.node) return 'node.' + dataset.node;
  return null;
}
