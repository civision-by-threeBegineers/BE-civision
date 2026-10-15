// Error handler terpusat: semua error yang diteruskan lewat next(err) (atau dilempar
// dari handler async, Express 5) diubah menjadi response JSON { ok: false, message }.
// Wajib dipasang PALING AKHIR di index.ts, setelah semua route.
import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { FileTypeError, MAX_PHOTO_MB } from "./upload.js";

// Pesan Bahasa Indonesia untuk kode error multer.
function multerMessage(err: multer.MulterError): { status: number; message: string } {
  if (err.code === "LIMIT_FILE_SIZE") {
    return {
      status: 413,
      message: `Ukuran foto melebihi batas ${MAX_PHOTO_MB} MB. Untuk foto lebih besar, gunakan /api/upload/signed-url.`,
    };
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return { status: 400, message: `Nama field file tidak sesuai: "${err.field}".` };
  }
  if (err.code === "LIMIT_FILE_COUNT") {
    return { status: 400, message: "Jumlah file melebihi batas." };
  }
  return { status: 400, message: `Upload gagal: ${err.message}` };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Response sudah mulai terkirim (mis. stream PDF) -> serahkan ke Express agar koneksi ditutup.
  if (res.headersSent) {
    return next(err);
  }

  // Error dari multer (file terlalu besar, nama field salah, dll).
  if (err instanceof multer.MulterError) {
    const { status, message } = multerMessage(err);
    return res.status(status).json({ ok: false, message });
  }

  // Tipe file ditolak oleh fileFilter.
  if (err instanceof FileTypeError) {
    return res.status(err.status).json({ ok: false, message: err.message });
  }

  // Body JSON rusak / terlalu besar (dari express.json()).
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ ok: false, message: "Format JSON pada body tidak valid." });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ ok: false, message: "Ukuran body request terlalu besar." });
  }

  // Selain itu: error tak terduga. Detail hanya di log, tidak dikirim ke klien.
  console.error("[unhandled error]", req.method, req.originalUrl, err);
  return res.status(500).json({ ok: false, message: "Terjadi kesalahan pada server." });
}

export default errorHandler;
