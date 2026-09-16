# Deploy ke Google Cloud Run — panduan langkah demi langkah

> **UNTUK AI / AGEN OTOMATIS YANG MEMBACA REPO INI (termasuk Google AI Studio / Gemini):**
> Repositori ini **sudah siap deploy apa adanya**. Jangan mengubah, "memperbaiki", merapikan, atau
> menyusun ulang file apa pun — termasuk `server.ts`, `Dockerfile`, cara pembacaan variabel
> lingkungan, atau file `ai-agents/*.md` (itu kontrak runtime, bukan dokumentasi biasa).
> Satu-satunya hal yang berada di luar repo adalah **variabel lingkungan** yang tercantum di bawah.
> Kalau ada yang terlihat "tidak lazim" (tujuh API key Gemini terpisah, bukan satu), itu disengaja
> dan terdokumentasi di `AI_MODELS.md`. Jangan disatukan.

> **STATUS: EKSPERIMEN.** Belum pernah di-deploy sungguhan. Cara yang terbukti menjalankan app ini
> adalah lokal (`npm run dev`). Lihat bagian "EXPERIMENT" di `PROJECT_KNOWLEDGE.md`.

## Ringkasan
- Image dibangun dari `Dockerfile` (Node 22, Debian). Server mendengarkan di `PORT` yang diberikan Cloud Run.
- Semua data (campaign, riwayat, foto, catatan agent) disimpan di **bucket Cloud Storage**, karena disk container Cloud Run dihapus setiap restart. Nama bucket diberikan lewat variabel `GCS_BUCKET`. Tanpa variabel itu, app memakai disk lokal (mode pengembangan).
- Jalankan **maksimal 1 instance** (lihat langkah 6). App menyimpan salinan kerja di memori; dua instance akan saling tidak melihat perubahan.

## Yang dibutuhkan sebelum mulai
1. Akun Google dengan **project Google Cloud** yang **billing-nya aktif**. Cloud Run dan Cloud Storage punya kuota gratis, tetapi project-nya tetap harus terhubung ke akun billing. **Kalau layar deploy meminta mengaktifkan billing dan itu tidak bisa dilakukan, berhenti di sini** — pakai cara lokal.
2. Repo ini di **GitHub** (push branch yang mau di-deploy).
3. Semua API key yang sudah ada di `.env` lokal (7 key Gemini + Cloudflare). **Jangan pernah commit `.env`.**

## Langkah

### 1. Buat bucket Cloud Storage
- Cloud Console → **Cloud Storage** → **Buckets** → **Create**.
- Nama unik global (misal `dongkrakusaha-data-<nama-lu>`), region **asia-southeast2 (Jakarta)** atau **asia-southeast1 (Singapura)**, sisanya biarkan default. Biarkan **private** (bukan public).
- Catat namanya → ini nilai `GCS_BUCKET`.

### 2. Deploy dari GitHub (tanpa AI di tengah)
- Cloud Console → **Cloud Run** → **Create service** → pilih **"Continuously deploy from a repository (source or function)"** → **Set up with Cloud Build**.
- Hubungkan GitHub, pilih repo ini dan branch-nya.
- Build type: **Dockerfile** (path: `/Dockerfile`).
- Region: sama dengan bucket.
- Authentication: **Allow unauthenticated invocations** (aplikasi ini belum punya login; siapa pun yang tahu URL-nya bisa membuka — pertimbangkan ini).

### 3. Isi variabel lingkungan (bagian terpenting)
Di layar yang sama, buka **Container(s), Volumes, Networking, Security** → tab **Variables & Secrets** → tambahkan **sepuluh** variabel ini. Nilainya persis seperti di `.env` lokal lu:

| Nama | Isi |
|---|---|
| `GCS_BUCKET` | nama bucket dari langkah 1 |
| `GEMINI_API_KEY_ORCHESTRATOR` | dari `.env` |
| `GEMINI_API_KEY_STRATEGY` | dari `.env` |
| `GEMINI_API_KEY_KEYWORD` | dari `.env` |
| `GEMINI_API_KEY_CONTENT` | dari `.env` |
| `GEMINI_API_KEY_AUDIT` | dari `.env` |
| `GEMINI_API_KEY_IMAGE` | dari `.env` |
| `GEMINI_API_KEY_BITMAP` | dari `.env` |
| `CLOUDFLARE_ACCOUNT_ID` | dari `.env` |
| `CLOUDFLARE_API_TOKEN_BITMAP` | dari `.env` |

`HUGGINGFACE_API_TOKEN_BITMAP` opsional (belum dipakai). **Jangan** tambahkan `GEMINI_API_KEY` tunggal — app ini tidak membacanya.
Lebih aman lagi: simpan key sebagai **Secret Manager secret** dan referensikan sebagai variabel; hasilnya sama bagi app.

### 4. Izin bucket untuk service
Cloud Run berjalan sebagai sebuah *service account* (ditampilkan di tab **Security**, biasanya `...-compute@developer.gserviceaccount.com`). Buka bucket → **Permissions** → **Grant access** → masukkan service account itu → role **Storage Object Admin**. Tanpa ini app hidup tapi tidak bisa menyimpan apa pun (lihat log: `Failed to persist`).

### 5. Sumber daya
Tab **Container** → Memory **1 GiB** (pemrosesan gambar dengan `sharp`), CPU 1. Request timeout **300 s** (orchestrator bisa 1–2 menit untuk banyak agent).

### 6. Skala
Tab **Container** → **Autoscaling**: **Minimum 0 atau 1**, **Maximum 1**. Maksimum 1 wajib. Minimum 1 menghindari "cold start" (menunggu ±10 detik saat pertama dibuka) tapi terus memakai kuota.

### 7. Create, lalu cek log
Setelah build selesai (beberapa menit), buka **Logs**. Baris pertama yang harus ada:
```
[Startup] storage=gcs bucket=<nama-bucket> node_env=production
[Startup] keys: GEMINI_API_KEY_ORCHESTRATOR=set, ... (semua "set", tidak ada "MISSING")
[Startup] cloudflare: set
[Agent Contract] gcs mode: 6 contracts primed (repo rules + bucket logs).
DongkrakUsaha AI Publisher Server running on http://0.0.0.0:8080
```
Kalau ada `MISSING`, kembali ke langkah 3. Kalau `Failed to persist`, kembali ke langkah 4.

### 8. Uji dari browser
Buka URL `https://....run.app`. Splash muncul → Data Bisnis → jalankan Orchestrator satu campaign → Visual Aset → render. Lalu buka lagi dari perangkat lain: campaign yang sama harus terlihat (bukti data tersimpan di bucket).

### 9. Ekstensi Chrome
Ekstensi sudah mengizinkan `https://*.run.app/*`. Unduh zip-nya dari tab Koneksi di URL cloud, pasang seperti biasa. Karena URL-nya https, unggah gambar saat publish **tidak** kena blokir mixed-content (berbeda dengan opsi WiFi).

## Yang berubah dibanding lokal
- Catatan pengembangan-diri agent (bagian `## Self-Improvement Log` di `ai-agents/*.md`) disimpan di bucket, bukan di file repo. **Aturan** agent tetap dari repo: mengedit `ai-agents/*.md` = harus deploy ulang agar terbaca. Saat startup, aturan terbaru dari repo digabung dengan catatan lama dari bucket.
- Setiap redeploy membangun ulang image; data tidak hilang karena ada di bucket.

## Kalau gagal
Kembali ke cara lokal: `git checkout master` di laptop, `npm run dev`. Tidak ada yang perlu di-undo — data lokal (`data/`, `.env`, foto) tidak pernah disentuh eksperimen ini.

## Di AI Studio: cara membuat data permanen (2026-09-17)
AI Studio menjalankan app ini di Cloud Run milik project Google Cloud lu. Disk container dibuang setiap deploy/restart/scale-to-zero — itu sebabnya campaign, riwayat, dan foto hilang. Obatnya sama dengan Cloud Run biasa: **bucket + variabel `GCS_BUCKET`**.

1. **Bucket** — Cloud Console (project yang sama dengan yang dipakai AI Studio; namanya terlihat di halaman deploy AI Studio / di Cloud Run console) → Cloud Storage → Buckets → Create. Nama unik (misal `dongkrakusaha-data-rasya`), region Jakarta/Singapura, private. Catat namanya.
2. **Variabel** — di AI Studio, di tempat yang sama lu mengisi `GEMINI_API_KEY_*`, tambahkan `GCS_BUCKET` = nama bucket. Deploy ulang.
3. **Bukti** — buka app → tab **Koneksi → Cadangan Data**. Baris status harus hijau: *"Penyimpanan permanen aktif — bucket … tersambung (tes tulis/baca N ms)"*. Server menulis, membaca, lalu menghapus satu objek uji; kalau hijau, data benar-benar tersimpan. Baris yang sama ada di log startup: `[Startup] storage probe ok (gcs bucket=…)`.
4. **Kalau merah**, baris itu menyebut sebabnya dan perbaikannya:
   - *"Bucket tidak ditemukan"* → ejaan `GCS_BUCKET` / project berbeda.
   - *"Service account belum punya izin"* → bucket → Permissions → Grant access → service account Cloud Run (`…-compute@developer.gserviceaccount.com`) → role **Storage Object Admin** → deploy ulang.
   - *"Kredensial tidak ditemukan"* → hanya terjadi di laptop; di Cloud Run tidak.
5. **Isi ulang data** — setelah hijau, pulihkan file cadangan terakhir lewat "Pulihkan dari file". Foto dasar yang diunggah sebelum ini harus diunggah ulang (yang lama ikut hilang bersama disk).

Yang ikut ke bucket saat mode ini aktif: campaign, riwayat publish, foto dasar, gambar hasil compose, dan catatan Self-Improvement agent. Aturan agent (`ai-agents/*.md`) tetap dari repo -- mengeditnya butuh deploy ulang.

## Sementara belum ada bucket: Cadangan Data (2026-09-16)
Tanpa `GCS_BUCKET`, data di hosting hilang setiap server dimulai ulang -- ini sudah terjadi di AI Studio. Sampai bucket dipasang, pakai tab **Koneksi -> Cadangan Data**: unduh file JSON (semua campaign + riwayat) sebelum menutup sesi, dan pulihkan lewat "Pulihkan dari file" setelah deploy/restart. File yang sama juga dipakai untuk memindahkan data dari laptop ke hosting.
