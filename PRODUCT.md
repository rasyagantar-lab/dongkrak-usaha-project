# Product

<!-- product-schema 1 -->

## Platform

web

## Users
Tujuh operator PKL (siswa SMK, dilatih singkat) bekerja di kantor pada jam kerja. Tugasnya: menerima data satu bisnis UMKM klien, menjalankan pipeline AI, lalu mem-publish listing ke DongkrakUsaha atas nama klien. Mereka bukan marketer dan bukan developer; sesi pemakaian pertama tanpa pendampingan pernah gagal karena struktur tab yang membingungkan (PROJECT_KNOWLEDGE.md "Operator Feedback Round 1").

Pemilik UMKM dan staf DongkrakUsaha bukan pengguna app ini.

## Product Purpose
Mengotomatiskan Local SEO, quality control AI, dan publikasi listing ke DongkrakUsaha dari satu data bisnis. Sukses = listing klien tayang publik di DongkrakUsaha (URL publik terdeteksi dan tercatat di Riwayat) tanpa operator menyalin-tempel teks atau mengisi form situs secara manual.

## Positioning
"Satu bisnis, seluruh wilayah" (Kepung Pasar): satu data bisnis di-draft otomatis ke puluhan kecamatan/area target, operator memilih mana yang direalisasikan, lalu ekstensi Chrome mengisi dan men-submit form DongkrakUsaha sendiri. Mengisi form manual atau memakai chatbot umum lalu copy-paste tidak bisa menghasilkan puluhan listing per-area yang konsisten dan ter-audit.

## Operating Context
- Alur kerja nyata, berurutan, per satu campaign: 1 Data Bisnis -> 2 Kepung Pasar -> 3 AI Orchestrator -> 4 Visual Aset -> 5 Preview -> 6 Publish; Koneksi dan Riwayat sebagai utilitas. Satu campaign = satu listing = data bisnis + satu area target + output AI-nya; picker campaign di header menentukan campaign mana yang dikerjakan semua tab.
- Chrome desktop dengan ekstensi Manifest V3 (`public/extension/`, satu-satunya source) yang menjembatani tab DongkrakUsaha asli ke app. Publish nyata hanya lewat ekstensi.
- Pekerjaan panjang (orchestrator, realisasi siege) berjalan di Job Center dan tetap hidup saat operator pindah tab/campaign; tray job menunjukkan progres per tab.
- Dijalankan lokal (`npm run dev`, port 3000) atau hosted di Google AI Studio / Cloud Run dengan penyimpanan Firestore. Kuota Gemini free-tier terbatas dan terlihat oleh operator lewat widget status model.

## Capabilities and Constraints
- Stack: React + Vite + TypeScript + Tailwind di frontend; Express (`server.ts`) di backend; Gemini (tujuh key terpisah, quota router) untuk teks; foto dasar nyata + caption lokal untuk visual, foto AI opsional.
- Perangkat operator: laptop low-end (<=8 GB RAM, GPU terintegrasi). Animasi hanya `transform`/`opacity`, tanpa `backdrop-filter: blur()`, tanpa library motion. Lihat DEVELOPMENT_RULES.md "UI conventions".
- Layout mobile cukup tidak rusak; HP bukan perangkat kerja operator (dikonfirmasi 2026-09-17). Jangan mengoptimalkan untuk ponsel dengan mengorbankan desktop.
- Navigasi = bottom bar (`BottomNav.tsx`); header tanpa tab; setiap tab tetap mounted.
- Bahasa UI: Indonesia, kosakata operasional (campaign, area, publish, orchestrator, audit). Istilah "Kepung Pasar", "Realisasikan", "Terapkan ke Campaign" sudah dipakai operator; jangan diganti tanpa alasan.
- Setiap perubahan yang terlihat operator dicatat di `src/changelog.ts` (tab "Log Update" di splash); `APP_VERSION` di file yang sama (saat ini 2.5).
- Terbuka/belum diputuskan: penggabungan Preview + Publish + Koneksi menjadi satu tab (diusulkan, belum dikerjakan).

## Brand Commitments
- Nama produk: "DongkrakUsaha Asisten Premium" / "DongkrakUsaha AI Marketing & SEO Publisher". DongkrakUsaha adalah situs tujuan publish, bukan pemilik app ini.
- Kredit tetap: dikembangkan oleh Muhamad Rasya Ramadhan (siswa PKL, SMK Yadika 5), pembimbing Aceng Komarudin. Muncul di splash dan footer.
- Tidak ada logo, palet, atau tipografi resmi dari klien. Identitas visual saat ini berasal dari kode (splash v4, pill biru di bottom nav) dan bukan komitmen brand yang mengikat.

## Evidence on Hand
- Bukti fungsional: publish nyata ke DongkrakUsaha dengan gambar terverifikasi di browser; pipeline AI penuh terbukti dengan key asli; persistensi Firestore di AI Studio terverifikasi (PROJECT_KNOWLEDGE.md, entri bertanggal 2026-09-14 s.d. 2026-09-17).
- Aset: foto dasar di `public/base-photos/`, gambar hasil di `public/generated-images/`, ekstensi di `public/extension/`. Folder `assets/` kosong.
- Tidak ada testimoni, angka klien, benchmark, atau harga. Jangan dibuat-buat.

## Product Principles
1. Urutan kerja operator adalah struktur produk: tab bernomor mengikuti alur nyata, bukan daftar fitur.
2. Satu klik mengganti pekerjaan manual, bukan menambah pilihan: fitur yang hanya menjalankan satu agent sendirian sudah dihapus tiga kali; jangan dikembalikan.
3. Status harus terlihat: kuota model, progres job, transport penyimpanan, dan URL publik ditampilkan ke operator, bukan disembunyikan di log.
4. Ringan di mesin lemah lebih penting daripada efek visual.
5. Kepung Pasar adalah janji utama; setiap layar harus memperjelas campaign mana dan area mana yang sedang dikerjakan.

## Accessibility & Inclusion
Pengguna baru dengan pelatihan minimal: panduan "Getting Started" di tab pertama, label tab dalam bahasa Indonesia sehari-hari, dan `motion-reduce:` dihormati di semua animasi. Tidak ada standar formal (WCAG) yang diwajibkan klien.
