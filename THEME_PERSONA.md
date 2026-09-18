# THEME_PERSONA.md -- kontrak desain tema "Persona" (opsional, dipilih di tab Koneksi)

Status: Tahap 0 (kamus visual) -- menunggu konfirmasi pemilik sebelum kode ditulis.
Dunia visual: bahasa antarmuka Persona 5 (Atlus, art director Masayoshi Suto), dipatuhi
sebagai *gaya* di seluruh permukaan aplikasi. Aset karakter pemandu disediakan pemilik
(lihat "Pemandu"); tidak ada aset Atlus yang diambil atau dihasilkan oleh pengembang.
Tema default ("standar") tidak berubah; tema ini hidup di bawah `[data-theme="persona"]`.

## Sumber

- Wawancara Suto (Famitsu via Persona Central): satu warna utama crimson tanpa sub-warna;
  hitam & putih satu-satunya pendamping; tiap entri menu dianimasikan; data GUI resident agar
  menu muncul tanpa lag.
- Analisis UI (Samson; Olszewska; Kwan; Medium): menu terbelah hitam-putih/merah dengan diagonal
  yang menarik mata ke tengah; tipografi potongan fanzine beroutline hitam; keterbacaan diakui
  bermasalah pada teks panjang.
- Art of the Title, Persona 5: siluet hitam, sapuan merah, potongan kertas meluncur dari sisi.
- Arsip p5ui.tumblr.com; folder pemilik `OneDrive/Gambar/Persona 5 UI Data Base` (layar kalender:
  angka besar bertumpuk miring, satu angka merah sebagai fokus); screenshot tambahan dari pemilik.
- Kerangka kerja impeccable `new-work` (dunia terkunci oleh brief -> patuhi tata bahasanya;
  strategi warna Committed; kontrak arah enam blok).

## Direction contract

THESIS: Aplikasi kerja yang tampil seperti *menu Phantom Thieves* -- setiap tab adalah layar
menu P5, setiap kartu adalah potongan kertas yang dilempar ke meja, setiap status adalah
stempel. Yang ditolak: dashboard SaaS bersudut bulat berwarna pastel dengan ikon garis tipis.
OWN-WORLD: hitam pekat sebagai meja, putih sebagai kertas, satu merah crimson sebagai tinta
yang mengisi bidang (nav aktif, judul, tag, garis tebal), tanpa warna keempat. Panel miring
-7 derajat, tepi sobek polygon, halftone titik di latar, garis 3 px, bayangan hitam keras tanpa
blur, huruf display kapital potongan dengan outline hitam; body tetap bersih.
STORY: Operator masuk ke "markas": tahu di mana dirinya (tab menyala merah miring), apa yang
sedang dikerjakan mesin (stempel status), dan siapa yang menemani (pemandu di pojok yang
menjelaskan apa saja yang disorot). Tugas tetap tugas: form terbaca, tabel terbaca.
FIRST VIEWPORT (tab Data Bisnis, 1440 px): header hitam dengan judul aplikasi potongan huruf,
badge versi merah miring; konten di atas latar hitam ber-halftone; kartu form putih miring
ringan dengan label hitam tebal; nav bawah = menu P5: item aktif blok merah miring dengan
angka besar, lainnya putih di hitam; pemandu di kanan bawah di atas nav (desktop saja).
FORM: bahasa antarmuka P5 dipatuhi apa adanya (dunia terkunci oleh brief); bukan hasil roll.
FINISH: unreviewed and unfinished sampai tinjauan `critique` + `polish` tiap gerbang dan
`audit` di gerbang akhir dinyatakan lulus dan pemilik mengonfirmasi.

## Token

| Token | Nilai | Pemakaian |
|---|---|---|
| `--p5-red` | `#E0121B` | satu-satunya warna; bidang nav aktif, judul bagian, tag nama, garis tebal, fokus input, status gagal |
| `--p5-black` | `#0B0B0B` | meja/latar utama, kotak dialog, label |
| `--p5-ink` | `#000000` | outline huruf, bayangan keras, garis |
| `--p5-white` | `#FFFFFF` | kertas/kartu, teks di hitam |
| `--p5-paper` | `#F4F1EA` | kertas kedua untuk tabel/zebra (satu langkah, tidak lebih) |
| `--p5-grey` | `#8A8A8A` | teks nonaktif, placeholder (satu-satunya abu) |
| `--p5-halftone` | `radial-gradient(#ffffff22 1px, transparent 1.4px) 0 0/6px 6px` | tekstur latar hitam, statis |
| `--p5-shadow` | `6px 6px 0 var(--p5-ink)` | bayangan keras kartu/tombol (tanpa blur) |
| `--p5-skew` | `-7deg` | kemiringan panel & label |
| `--p5-line` | `3px` | tebal garis/border |

Pemetaan ke variabel Tailwind v4 di bawah `[data-theme="persona"]` (satu lapisan, semua
komponen ikut): `--color-white` -> kertas; `--color-slate-50..200` -> kertas & garis tipis;
`--color-slate-300..500` -> abu tunggal; `--color-slate-600..950` -> hitam; `--color-blue-*`,
`--color-sky-*` -> merah (aksi utama); `--color-emerald-*` -> putih-di-hitam (sukses ditandai
bentuk & ikon, bukan hijau); `--color-amber-*` -> merah beroutline (peringatan); `--color-rose-*`
-> merah penuh (gagal); `--radius-*` -> 0; `--shadow-*` -> `--p5-shadow`.

Strategi warna: **Committed** -- merah mengisi bidang (nav aktif, header bagian, tag), bukan
aksen kecil; hitam & putih membagi sisa permukaan. Adegan fisik yang memutuskan gelap: empat
anak PKL & pembimbing di ruang kantor siang hari di laptop 8 GB -- latar hitam boleh, tapi
**semua teks tugas berdiri di kertas putih atau putih-di-hitam**, tidak pernah merah-di-hitam
untuk body.

## Tipografi

- Display (`--font-display`): **Anton** (bebas, dibundel di `public/fonts/`) -- berat, kondensasi,
  kapital; untuk judul tab, nama bagian, angka besar, label nav, tag nama pemandu.
- Efek potongan fanzine hanya pada judul <= 12 huruf: komponen `CutoutText` memecah judul per
  huruf dengan rotasi deterministik +-3 derajat dan ukuran +-8 % (hash dari indeks, bukan acak),
  `aria-label` utuh, `-webkit-text-stroke 2px` hitam + `text-shadow` bertumpuk sebagai outline.
- Body tetap Inter (sudah dibundel): form, tabel, dialog pemandu, isi kartu. Tidak ada
  potongan huruf pada teks yang dibaca.
- Skala: judul tab 40/44, nama bagian 22/24 kapital, label 12/16 kapital berjarak 0.08em.

## Bentuk

- Panel/kartu: `clip-path: polygon(...)` 6-8 titik dengan satu sudut "sobek" (1-2 gigi),
  kemiringan `-7deg` pada wadah, isi di-counter-skew `+7deg` supaya teks tegak.
- Label/tag: blok hitam miring dengan teks putih kapital; tag aktif merah.
- Garis: 3 px hitam pekat; pemisah bagian = garis diagonal merah pendek.
- Tombol: blok merah miring, teks putih Anton, bayangan keras; hover: blok hitam menyapu dari
  kiri di belakang teks; nonaktif: abu tunggal tanpa bayangan.
- Input: kertas putih, garis 3 px hitam, fokus = garis merah + label "berstempel".
- Tabel/daftar: baris zebra kertas/kertas-kedua, kolom pertama label hitam miring.
- Ikon: lucide tetap (garis 2 px), diberi latar blok hitam/merah kecil supaya tidak "tipis".

## Bahasa gerak (durasi/easing mengikat; transform/opacity saja; mati pada reduce-motion)

| Peristiwa | Gerak | Durasi / easing |
|---|---|---|
| Ganti tab | panel baru meluncur dari kanan sambil menegak (skew -8deg -> 0), panel lama terlempar ke kiri; siluet ikon tab melintas sekejap | 260 ms, `cubic-bezier(.2,.9,.2,1)` |
| Hover tombol/nav | label bergeser 4 px; blok hitam/merah menyapu dari kiri (scaleX 0 -> 1) | 120 ms |
| Tekan tombol | stempel: scale 1.06 -> 1, bayangan keras muncul, teks berkedip putih sekali | 160 ms |
| Kartu muncul | potongan kertas jatuh: translateY(-12px) rotate(-2deg) -> 0; bayangan menyusul 60 ms; stagger 40 ms, maks 8 | 220 ms |
| Pemandu bicara | portrait idle -> bicara (crossfade 120 ms + scale 1.04); kotak melebar dari kiri (scaleX); teks mengetik 18 ms/karakter; tag nama menampar masuk | 200 ms buka |
| JobTray | kartu meluncur dari bawah miring; garis merah tepi kiri mengisi | 240 ms |
| Run mulai | tombol Jalankan meledak sekali (bintang polygon scale 0 -> 1.4 -> 0) | 380 ms, sekali |
| Node kanvas selesai | node distempel; label status slide vertikal (hanya saat run aktif) | 200 ms |
| Run COMPLETE | banner hasil meluncur miring dari kanan: judul besar, angka tahap & durasi bertumpuk | 320 ms, sekali |
| Layar penuh kanvas | latar hitam menyapu diagonal (clip-path berkembang) | 240 ms |
| Splash | judul potongan huruf jatuh satu-satu (stagger 30 ms, maks 12), garis merah menyapu | 700 ms total, sekali per sesi |
| Error boundary | panel merah sobek masuk + getar 1x (translateX +-3 px, 2 siklus) | 200 ms |

Larangan tetap: `filter: blur()`, animasi latar berputar terus, dua animasi bersamaan pada satu
elemen, `will-change` permanen. Kanvas orchestrator tetap tunduk pada kebijakan gerak 2026-09-17.

## Pemetaan layar P5 -> permukaan aplikasi

| Layar P5 | Permukaan | Yang ditiru |
|---|---|---|
| Menu utama / pause | nav bawah, header | item aktif blok merah miring beranomor besar, sisanya putih-di-hitam; siluet ikon |
| Kalender / ganti hari | transisi tab; penanda tanggal Riwayat | angka bertumpuk miring, satu merah sebagai fokus |
| Kotak dialog berportrait | pemandu Mitsuru | kotak hitam bertepi sobek, tag nama merah, portrait menyembul di luar kotak |
| Daftar (Confidant/toko) | Riwayat, tabel field Publish, daftar campaign | baris zebra, kolom pertama label hitam miring, baris aktif merah |
| Panel status Persona | kartu, NodeInspector, JobTray | judul potongan, blok data bertumpuk, garis diagonal |
| Layar hasil pertempuran | banner COMPLETE orchestrator | judul besar meluncur, angka bertumpuk |
| "Take Your Time" / loading | splash, tunggu run | siluet + satu baris teks berjalan, tanpa spinner bulat |

## Status (tidak boleh bergantung warna saja)

- Selesai/sukses: label putih-di-hitam + ikon centang berblok.
- Berjalan: label merah beroutline + bar indeterminate (yang sudah ada).
- Peringatan: label merah beroutline + ikon segitiga.
- Gagal: blok merah penuh, teks putih.
- Menunggu manusia: label hitam beroutline merah putus-putus.

## Pemandu (Tahap 2)

Aset milik pemilik: `public/guide/mitsuru-idle.png` (foto 1), `public/guide/mitsuru-talk.png`
(foto 2). Nama tampil "MITSURU". Posisi kanan bawah di atas nav (`--du-bottom-nav`), desktop
saja (>= 1024 px). Kotak dialog hitam bertepi sobek, tag nama merah, teks putih Inter 14/22,
maks 2 kalimat fungsi + 1 baris fakta dari PROJECT_KNOWLEDGE. Bisukan tersimpan per pemakai.
Semua nama/aset/gaya bicara di `src/guide/persona.ts` supaya dapat diganti dari satu tempat.

## Lantai aksesibilitas & performa

- Kontras teks >= 4.5:1: putih di `#0B0B0B` (19:1), hitam di putih, putih di `#E0121B` (4.6:1,
  hanya untuk label >= 14 px tebal); merah di hitam tidak dipakai untuk teks.
- Fokus keyboard terlihat (garis merah 3 px), target sentuh >= 40 px, HP 400 px tanpa scroll
  horizontal, pemandu disembunyikan di < 1024 px.
- Aset tema dimuat sekali (font & dua portrait di-preload saat tema aktif); tidak ada fetch saat
  ganti menu; tidak ada gambar latar besar -- halftone & sobek dibuat dengan CSS.

## Yang tetap sama di tema ini

Struktur tab dan alur 1-6, semua fungsi, teks Indonesia, kebijakan gerak kanvas, `canvasGraph.ts`,
kontrak agent, dan tema standar sebagai default.
