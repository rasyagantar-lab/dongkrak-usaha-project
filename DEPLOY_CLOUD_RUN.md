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

## Di AI Studio (Starter Tier): data permanen lewat Firestore (2026-09-17)
Fakta dari dokumentasi Google (dicek 2026-09-17): project **Starter Tier** yang dibuat AI Studio hanya menyediakan Cloud Run, Firebase Authentication, **Firestore**, Cloud SQL, dan Maps demo key. **Cloud Storage tidak ada, dan role IAM tidak bisa diubah** ("strictly managed by Google"). Percobaan bucket pertama (`storage.buckets.create` ditolak untuk `…-compute@developer.gserviceaccount.com`) adalah bukti langsungnya. Upgrade ke project standar = pasang billing (kartu). Jadi di AI Studio, penyimpanan permanen = **Firestore** (kuota Starter Tier: 1 GiB, 40.000 tulis/hari, 50.000 baca/hari -- lebih dari cukup).

Temuan tambahan (2026-09-17, dari status line yang dikirim AI Studio): container-nya berjalan di project sandbox milik Google (`ais-asia-southeast1-…`), sedangkan Firestore disediakan AI Studio di project **milik lu** (`civic-ally-z9v0l`) sebagai database **bernama** (bukan `(default)`), dicatat AI Studio di file `firebase-applet-config.json` di copy-nya. Karena itu project dan database harus disebut eksplisit; app membacanya dari env dulu, lalu dari file itu kalau ada.

Prosedur operator (urutannya penting):
1. **Ambil versi terbaru repo dari GitHub dulu** (`rasyagantar-lab/dongkrak-usaha-project`, branch `experiment/cloud-run`). Copy AI Studio sering tertinggal dan ia mengedit filenya sendiri; tes di kode lama tidak berarti. Import ini juga menimpa edit-editnya.
2. Pastikan **tidak ada** `GCS_BUCKET` di env AI Studio (kalau ada, mode gcs yang menang dan gagal).
3. Set env: `FIRESTORE_PROJECT=<project id tempat Firestore disediakan>` dan `FIRESTORE_DATABASE=<database id>` -- nilainya dari laporan provisioning AI Studio / file `firebase-applet-config.json`. Restart.
4. Baca **Koneksi -> Cadangan Data** (atau `GET /api/storage/status`):
   - Hijau *"Firestore <project> / <database> · koleksi du_storage tersambung"* -> selesai. Pulihkan cadangan terakhir, unggah ulang foto dasar.
   - *"API Firestore belum diaktifkan / database belum disediakan"* -> minta agent AI Studio menjalankan penyediaan Firestore (`set_up_firebase`) **tanpa mengubah file**, lalu periksa ulang.
   - *"Service account container … tidak diizinkan mengakses Firestore di project …"* -> izin lintas-project sandbox -> project lu tidak ada, dan di Starter Tier tidak bisa lu beri. Ini batas platform; jalur berikutnya adalah Firestore lewat REST API + API key di bawah security rules (belum dibangun -- catat di PROJECT_KNOWLEDGE.md sebelum membangunnya).
   - Kredensial / project id -> hanya terjadi di laptop.
5. Server tidak pernah menunggu backend yang mati: pembacaan awal dibatasi 20 detik lalu jalan dengan data default, jadi kegagalan penyimpanan selalu terlihat sebagai baris merah, bukan container yang tidak hidup.

Apa yang disimpan di Firestore: koleksi `du_storage` (satu dokumen per objek: campaigns.json, publish-history.json, tiap foto dasar, tiap gambar hasil, tiap log agent) dan `du_storage_chunks` untuk objek > 900 KB (dokumen Firestore maksimal 1 MiB). Aturan agent tetap dari repo -- mengeditnya butuh deploy ulang.

Project standar (dengan billing) tetap bisa memakai bucket: set `GCS_BUCKET`, app membuat bucket-nya sendiri saat boot; kalau service account tidak boleh membuat bucket, beri role Storage Admin atau buat bucket manual + Storage Object Admin.

## Sementara belum ada bucket: Cadangan Data (2026-09-16)
Tanpa `GCS_BUCKET`, data di hosting hilang setiap server dimulai ulang -- ini sudah terjadi di AI Studio. Sampai bucket dipasang, pakai tab **Koneksi -> Cadangan Data**: unduh file JSON (semua campaign + riwayat) sebelum menutup sesi, dan pulihkan lewat "Pulihkan dari file" setelah deploy/restart. File yang sama juga dipakai untuk memindahkan data dari laptop ke hosting.
