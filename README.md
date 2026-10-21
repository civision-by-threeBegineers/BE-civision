# Civision

**Civision** adalah prototipe web untuk membantu Satpol PP dan Dinas Perhubungan mendeteksi pedagang kaki lima (PKL) yang berjualan di zona terlarang, seperti trotoar dan badan jalan.

🌐 **Demo:** [ci-vision.vercel.app](https://ci-vision.vercel.app)

---

## Apa yang Dilakukan Civision?

1. Petugas mengunggah foto lapangan.
2. Sistem mendeteksi gerobak PKL dengan AI.
3. Lokasi foto dibaca dari GPS atau watermark.
4. Lokasi dicocokkan dengan Zona Terlarang.
5. Petugas memverifikasi, lalu laporan dan peta sebaran tersedia.

AI hanya mendeteksi. Keputusan pelanggaran dan verifikasi akhir tetap dilakukan secara deterministik dan oleh petugas.

---

## Fitur Utama

- 📸 Deteksi gerobak PKL otomatis di browser
- 📍 Pembacaan lokasi dari GPS EXIF atau OCR watermark
- 🗺️ Pencocokan lokasi dengan Zona Terlarang
- 👮 Verifikasi petugas (valid / invalid)
- 📊 Dashboard peta dan riwayat pelanggaran
- 📄 Laporan PDF

---

## Teknologi

React · TypeScript · Express.js · Supabase · YOLO26n · ONNX Runtime Web · Leaflet · Vercel

---

## Repository

- Frontend: [FE-civision](https://github.com/wravelio9/FE-civision)
- Backend: [BE-civision](https://github.com/wravelio9/BE-civision)
- AI: [AI-civision](https://github.com/wravelio9/AI-civision)

---

## Status

Ini masih **prototipe**. Dataset deteksi masih terbatas, dan OCR baru dioptimalkan untuk watermark aplikasi Timemark.

---

## Tim

Three Begineers: Keanan Enrico, Shavelina Laurenta Santoso, Wilson Ravelio

Dibuat untuk ICONFEST 2026 Software Development Competition, Universitas Siliwangi.
