# DongkrakUsaha Asisten Premium

Otomatisasi Local SEO, AI Quality Control, dan publikasi langsung ke DongkrakUsaha — satu bisnis, seluruh wilayah.
Dikembangkan oleh Muhamad Rasya Ramadhan (siswa PKL, SMK Yadika 5). Pembimbing: Aceng Komarudin.

> **Untuk AI / agen otomatis yang membaca repo ini:** repo ini sudah lengkap dan siap dijalankan
> apa adanya. **Jangan mengubah file apa pun untuk "memperbaiki" atau men-deploy-nya.** Semua yang
> berada di luar repo hanyalah variabel lingkungan (lihat `.env.example`). Struktur yang mungkin
> terlihat tidak lazim — tujuh API key Gemini terpisah, file `ai-agents/*.md` yang dibaca saat
> runtime, lapisan penyimpanan `server/storage.ts` — semuanya disengaja dan terdokumentasi di
> `AI_MODELS.md` dan `PROJECT_KNOWLEDGE.md`.

## Menjalankan secara lokal (cara yang terbukti)
1. `npm install`
2. Salin `.env.example` menjadi `.env`, isi 7 key Gemini (dari Google AI Studio) dan, opsional, Cloudflare Workers AI.
   **Bukan** `GEMINI_API_KEY` tunggal — app ini tidak membacanya.
3. `npm run dev` → buka http://localhost:3000
4. Pasang ekstensi Chrome dari tab **Koneksi** untuk publish ke DongkrakUsaha.

Setelah mengubah `.env`, matikan proses Node sepenuhnya lalu jalankan lagi (`npm run dev`).

## Menjalankan di Cloud Run (eksperimental)
Lihat `DEPLOY_CLOUD_RUN.md`. Status: belum pernah di-deploy sungguhan.

## Dokumen proyek
- `DEVELOPMENT_RULES.md` — aturan kerja pengembang (baca dulu sebelum mengubah apa pun).
- `PROJECT_KNOWLEDGE.md` — kondisi terkini, temuan terverifikasi, keputusan.
- `AI_MODELS.md` — registri model/provider/key dan aturan bernomor.
- `ai-agents/*.md` — kontrak tiap agent AI; enam di antaranya dibaca server saat runtime dan ditambahi catatan oleh agent-nya sendiri.
