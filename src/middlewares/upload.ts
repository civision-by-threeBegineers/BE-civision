// Middleware upload foto (multer). Satu instance untuk semua endpoint yang menerima
// file lewat backend: POST /api/upload (field "files") dan POST /api/analysis (field "photo").
// File disimpan di memori (filesystem Vercel read-only), lalu diteruskan ke controller.
import { Request } from "express";
import multer from "multer";

// Batas body request Vercel Functions = 4,5 MB untuk SELURUH request (file + field lain
// + overhead multipart). Batas per foto dibuat 4 MB supaya masih ada sisa ruang untuk
// field lain (mis. "payload" berisi detections & ocrText). Foto lebih besar dari ini
// harus lewat alur upload langsung: /api/upload/signed-url -> Supabase -> /api/upload/confirm.
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_PHOTO_MB = MAX_PHOTO_BYTES / (1024 * 1024);

// Error saat tipe file ditolak. Diterjemahkan errorHandler menjadi 400 JSON.
export class FileTypeError extends Error {
  status = 400;
}

// Hanya terima gambar (image/*).
function imageFileFilter(req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const mimetype: string = file.mimetype || "";
  if (mimetype.startsWith("image/")) {
    return cb(null, true);
  }
  cb(new FileTypeError("File harus berupa gambar."));
}

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
  fileFilter: imageFileFilter,
});

export default photoUpload;
