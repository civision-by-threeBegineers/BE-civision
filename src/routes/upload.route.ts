import express from "express"
import upload from "../middlewares/upload.js"
import Controller from "../controller/upload.controller.js"
const app = express.Router()

// Upload foto lewat backend (multipart, field "files"). Hanya gambar, maks 4 MB per foto.
// Di Vercel total body request maks 4,5 MB, jadi kirim banyak foto sekaligus bisa ditolak 413.
app.post("/upload", upload.array("files", 20), Controller.upload)

// Upload langsung ke Supabase Storage (untuk foto besar, tanpa batas 4.5 MB Vercel):
// 1) minta signed URL, 2) FE upload ke Supabase, 3) confirm -> record MediaFile.
app.post("/upload/signed-url", Controller.signedUrl)
app.post("/upload/confirm", Controller.confirm)

export default app;