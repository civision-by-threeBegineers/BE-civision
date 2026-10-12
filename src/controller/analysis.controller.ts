// Controller Analisis: menerima hasil deteksi (ONNX dari frontend) + OCR koordinat
// -> cek zona -> simpan Analysis+Violation.
//
// Deteksi gerobak dilakukan di FRONTEND pakai model ONNX (onnxruntime-web).
// Backend TIDAK mendeteksi; backend menerima "detections" yang sudah jadi,
// lalu menentukan koordinat (EXIF/OCR/manual), mencocokkan zona, dan menyimpan.
import { Request, Response, NextFunction } from "express";
import AnalysisService from "../service/analysis.service.js";
import { readCoordinatesFromImage, parseCoordinatesFromText } from "../service/ocr.service.js";
import type {
  ResolveInput,
  PersistAnalysisInput,
  RawDetection,
  LatLon,
  AnalyzeBody,
} from "../interface/analysis.interface.js";

class AnalysisController {
  // POST /api/analysis
  // multipart: field "photo" (opsional, untuk baca EXIF/OCR koordinat)
  // field "payload" (JSON) ATAU body JSON: { mediaId, detections, manualLatLon? }
  static async analyze(req: Request, res: Response, next: NextFunction) {
    try {
      // Body bisa dikirim sebagai field "payload" (string JSON, saat multipart)
      // atau langsung sebagai body JSON.
      let body: AnalyzeBody;
      if (typeof req.body?.payload === "string") {
        body = JSON.parse(req.body.payload);
      } else {
        body = req.body;
      }

      if (!body?.mediaId) {
        return res.status(400).json({ ok: false, message: "mediaId wajib diisi." });
      }

      // mediaId harus ada di DB (hindari error foreign key 500).
      const media = await AnalysisService.getMedia(body.mediaId);
      if (!media) {
        return res.status(404).json({ ok: false, message: "mediaId tidak ditemukan." });
      }

      // Foto boleh dikirim langsung (multipart "photo"), atau diambil dari storage
      // berdasarkan mediaId (untuk file besar yang di-upload langsung ke Supabase).
      let photoBuffer = (req as any).file?.buffer as Buffer | undefined;
      if (!photoBuffer && media.mediaType === "photo") {
        photoBuffer = (await AnalysisService.loadMediaBuffer(media.storagePath)) ?? undefined;
      }

      // Deteksi datang dari frontend (ONNX). Default [] bila tidak ada.
      let detections: RawDetection[] = [];
      if (Array.isArray(body.detections)) {
        detections = body.detections;
      }

      // KOORDINAT (urutan: EXIF -> OCR -> manual). OCR itu mahal (dan di Vercel
      // perlu /tmp), jadi hanya dijalankan bila EXIF & manual sama-sama tidak ada.
      const manualLatLon = body.manualLatLon ?? null;
      let ocrLatLon: LatLon | null = null;
      let ocrRawText = "";

      // 1) EXIF dulu bila ada foto.
      const exif = photoBuffer ? await AnalysisService.readExifGps(photoBuffer) : null;
      const hasExif = !!(exif?.present && exif.latlon);

      // 2) OCR hanya bila EXIF & manual kosong. Teks dibaca di browser (FE) karena
      //    tesseract di Vercel menggantung saat memuat file bahasa; backend cukup
      //    mem-parse teksnya. OCR backend hanya cadangan di luar Vercel (lokal).
      if (!hasExif && !manualLatLon) {
        if (typeof body.ocrText === "string" && body.ocrText.trim()) {
          ocrRawText = body.ocrText.slice(0, 5000); // batasi input dari klien
          ocrLatLon = parseCoordinatesFromText(ocrRawText);
        } else if (photoBuffer && !process.env.VERCEL) {
          const ocr = await readCoordinatesFromImage(photoBuffer);
          ocrLatLon = ocr.latlon;
          ocrRawText = ocr.rawText;
        }
      }

      // RESOLVER memakai urutan yang sama (EXIF -> OCR -> manual).
      const resolveInput: ResolveInput = { ocrLatLon, manualLatLon };
      if (photoBuffer) resolveInput.photo = photoBuffer;
      const resolved = await AnalysisService.resolveCoordinate(resolveInput);

      // SIMPAN: cek zona + buat Violation
      const persistInput: PersistAnalysisInput = {
        mediaId: body.mediaId,
        photoCount: 1,
        units: [
          {
            detections,
            latlon: resolved.latlon,
            coordinateSource: resolved.source,
          },
        ],
      };
      if (body.detectorMode) persistInput.detectorMode = body.detectorMode;
      const result = await AnalysisService.persist(persistInput);

      return res.status(201).json({
        ok: true,
        message: "Analisis tersimpan.",
        detectionCount: detections.length,
        coordinateSource: resolved.source,
        coordinate: resolved.latlon,
        ocrRawText,
        result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export default AnalysisController;