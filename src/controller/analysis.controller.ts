// Controller Analisis: menerima hasil deteksi (ONNX dari frontend) + teks OCR (dari frontend)
// -> tentukan koordinat -> cek duplikat -> cek zona -> simpan Analysis+Violation.
//
// Deteksi gerobak DAN OCR dilakukan di FRONTEND. Backend TIDAK mendeteksi dan
// TIDAK menjalankan OCR; backend menerima "detections" + "ocrText" yang sudah jadi,
// lalu menentukan koordinat (EXIF/OCR/manual), mencocokkan zona, dan menyimpan.
import { Request, Response, NextFunction } from "express";
import AnalysisService from "../service/analysis.service.js";
import { parseCoordinatesFromText } from "../service/ocr.service.js";
import type {
  ResolveInput,
  PersistAnalysisInput,
  RawDetection,
  LatLon,
  AnalyzeBody,
} from "../interface/analysis.interface.js";

class AnalysisController {
  // POST /api/analysis
  // multipart: field "photo" (opsional, untuk baca EXIF koordinat)
  // field "payload" (JSON) ATAU body JSON: { mediaId, detections, ocrText?, manualLatLon? }
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
      // Foto dipakai untuk baca EXIF dan untuk sidik jari (hash) cek duplikat.
      let photoBuffer = (req as any).file?.buffer as Buffer | undefined;
      if (!photoBuffer && media.mediaType === "photo") {
        photoBuffer = (await AnalysisService.loadMediaBuffer(media.storagePath)) ?? undefined;
      }

      // Deteksi datang dari frontend (ONNX). Default [] bila tidak ada.
      let detections: RawDetection[] = [];
      if (Array.isArray(body.detections)) {
        detections = body.detections;
      }

      // KOORDINAT (urutan: EXIF -> OCR -> manual).
      // OCR dijalankan di browser; backend cukup mem-parse teks hasilnya.
      const manualLatLon = body.manualLatLon ?? null;
      let ocrLatLon: LatLon | null = null;
      let ocrRawText = "";
      if (typeof body.ocrText === "string" && body.ocrText.trim()) {
        ocrRawText = body.ocrText.slice(0, 5000); // batasi input dari klien
        ocrLatLon = parseCoordinatesFromText(ocrRawText);
      }

      const resolveInput: ResolveInput = { ocrLatLon, manualLatLon };
      if (photoBuffer) resolveInput.photo = photoBuffer;
      const resolved = await AnalysisService.resolveCoordinate(resolveInput);

      // CEK DUPLIKAT: foto yang sama (isi file identik) di koordinat yang sama
      // sudah pernah menghasilkan pelanggaran -> jangan simpan apa pun lagi.
      let photoHash: string | null = null;
      if (photoBuffer) {
        photoHash = AnalysisService.hashPhoto(photoBuffer);
      }
      if (photoHash && resolved.latlon) {
        const duplicate = await AnalysisService.findDuplicate(photoHash, resolved.latlon);
        if (duplicate) {
          return res.status(409).json({
            ok: false,
            message: "Foto yang sama di koordinat yang sama sudah pernah dianalisis.",
            duplicateOf: duplicate,
          });
        }
      }

      // SIMPAN: cek zona + buat Violation
      const persistInput: PersistAnalysisInput = {
        mediaId: body.mediaId,
        photoCount: 1,
        photoHash,
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
