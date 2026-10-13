# Panduan Backend Civision (Bahasa Manusia)

Panduan backend TANPA istilah teknis rumit. Buat ketua tim & anggota yang belum
pernah sentuh backend, dan contekan saat presentasi/demo.

---

## 1. Backend ini tugasnya apa?

Menerima foto â†’ cari tahu lokasinya â†’ cek apakah masuk zona terlarang â†’
simpan sebagai "pelanggaran" â†’ sediakan datanya buat ditampilkan & diverifikasi.

Analogi: backend = "petugas administrasi" (mencatat & memutuskan).
AI (Wilson) = "mata" (mendeteksi). Frontend (Shavelina) = "wajah" (yang dilihat user).

---

## 2. ALUR SISTEM (dari foto sampai tampil di peta)

```
1. Petugas gambar ZONA TERLARANG di peta
   -> POST /api/zones -> tersimpan di database

2. Foto PKL diupload -> dikirim ke AI (Wilson)
   -> AI balikin: deteksi gerobak + kotak (bbox) + tingkat keyakinan (confidence)

3. Backend TERIMA hasil AI -> POST /api/analysis
   - Baca koordinat foto: GPS EXIF -> OCR -> manual (berjenjang)
     (OCR dijalankan di FRONTEND; backend hanya mem-parse teks "ocrText")
   - Cek duplikat: foto yang sama (hash SHA-256 isi file) di koordinat yang sama
     sudah pernah jadi pelanggaran -> tolak 409, TIDAK ada yang disimpan
   - Cek: koordinat masuk zona terlarang? (perhitungan point-in-polygon)
   - Kalau YA -> catat PELANGGARAN (status awal: unverified / abu-abu)
   - Simpan ke database

4. Petugas lihat DASHBOARD PETA
   -> GET /api/dashboard/map -> pin muncul di peta (+ zona)
   -> hover: lihat detail | klik: tombol verifikasi

5. Petugas VERIFIKASI
   -> PATCH /api/violations/:id/status -> valid (hijau) / invalid (disembunyikan)
   -> PATCH /api/violations/:id/follow-up -> sudah / belum ditindak

6. Lihat RIWAYAT kapan saja
   -> GET /api/history -> daftar analisis lampau + laporannya
```

---

## 3. Struktur Folder

```
src/
  index.ts            -> START aplikasi + daftar semua "pintu" (route)
  config/             -> pengaturan (port, alamat AI)
  routes/             -> daftar PINTU MASUK (alamat URL)
  controller/         -> PENERIMA TAMU (ambil request, balas jawaban)
  service/            -> PEKERJA (logika inti yang benar-benar mengerjakan)
  db/prisma.ts        -> koneksi ke database
  middlewares/        -> penjaga otomatis (log, error, upload)
prisma/schema.prisma  -> cetak biru database (bentuk tabel)
docs/                 -> dokumentasi API (buat frontend & tim)
```

Pola tiap fitur = 3 lapis: route (pintu) -> controller (penerima) -> service (pekerja).

---

## 4. Penjelasan Syntax (untuk apa)

- `import` / `export`  -> ambil kode dari file lain / bagikan ke file lain
- `async` / `await`    -> "tunggu sampai selesai" (untuk akses database dsb.)
- `req`                -> request (data yang masuk dari user)
- `res`                -> response (jawaban yang dikirim balik)
- `req.body`           -> isi data yang dikirim user (mis. nama + titik zona)
- `res.json({...})`    -> balas dalam format JSON
- `res.status(201)`    -> kode status (200 ok, 201 tercipta, 400 salah input, 404 tidak ada)
- `try { } catch { }`  -> kalau ada error, ditangkap biar server tidak crash
- `prisma.zone.create` -> perintah simpan data ke database (Prisma = penerjemah ke MySQL)
- `router.post(...)`   -> daftarkan alamat + fungsi yang menanganinya

Contoh alur 1 request (buat zona):
```
POST /api/zones  ->  zone.route  ->  zone.controller.create  ->  zone.service.create  ->  database
        (user)        (pintu)         (penerima tamu)             (pekerja)              (simpan)
```

---

## 5. Daftar Endpoint (API) yang Sudah Jadi

| Fitur | Method + Path | Dokumentasi |
|-------|---------------|-------------|
| Kelola zona | GET/POST/PUT/DELETE /api/zones | api/zona.md |
| Analisis (simpan pelanggaran) | POST /api/analysis | - |
| Data peta dashboard | GET /api/dashboard/map | api/dashboard.md |
| Validasi pelanggaran | PATCH /api/violations/:id/status | api/validasi-pelanggaran.md |
| Tindak lanjut | PATCH /api/violations/:id/follow-up | api/validasi-pelanggaran.md |
| Daftar pelanggaran aktif | GET /api/violations | api/validasi-pelanggaran.md |
| Riwayat analisis | GET /api/history | api/riwayat.md |
| Detail laporan | GET /api/history/:id | api/riwayat.md |
| Upload (Wilson) | POST /upload | - |

---

## 6. Status: Sudah & Kurang

SUDAH: CRUD zona, baca GPS EXIF, cek zona, simpan pelanggaran, endpoint analisis,
validasi pelanggaran, data dashboard peta, riwayat analisis, parser hasil AI.

KURANG:
- Laporan + PDF (Req 7) -- data sudah ada, tinggal disusun + generate PDF
- OCR koordinat -- nunggu Wilson (backend cuma sediakan "slot")
- Sambungan penuh upload -> analisis -- komponen lengkap, perlu koordinasi Wilson

---

## 7. Pembagian Tugas Tim
- Keanan (kamu): Backend -- database, zona, pelanggaran, API
- Wilson: AI (Python) -- deteksi PKL + OCR koordinat, upload
- Shavelina: Frontend -- peta, dashboard, tampilan

Catatan: kamu TIDAK perlu hafal syntax. Cukup paham ALUR di dokumen ini
supaya bisa mimpin tim & cerita saat demo.