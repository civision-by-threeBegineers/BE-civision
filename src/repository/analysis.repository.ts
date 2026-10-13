// Repository Analisis: membungkus akses database (Prisma) untuk menyimpan
// Analysis beserta Violation-nya secara atomik. Logika bisnis (matching zona,
// threshold confidence, reverse geocode) TIDAK di sini — itu di AnalysisService.
import prisma from "../config/prisma.js";
import type { AnalysisCreateData } from "../interface/analysis.interface.js";

class AnalysisRepository {
  // Ambil semua zona (dipakai untuk point-in-polygon di service).
  static findAllZones() {
    return prisma.zone.findMany();
  }

  // Ambil record MediaFile (cek mediaId valid + lokasi file di storage).
  static findMediaById(id: string) {
    return prisma.mediaFile.findUnique({ where: { id } });
  }

  // Cari satu pelanggaran lama dari foto yang sama (photoHash sama) di sekitar
  // koordinat yang sama (selisih <= eps derajat). Semua status dihitung, termasuk
  // invalid, supaya pelanggaran yang sudah ditolak petugas tidak muncul lagi.
  static findViolationByPhotoAndCoordinate(
    photoHash: string,
    lat: number,
    lng: number,
    eps: number,
  ) {
    return prisma.violation.findFirst({
      where: {
        analysis: { photoHash },
        lat: { gte: lat - eps, lte: lat + eps },
        lng: { gte: lng - eps, lte: lng + eps },
      },
      select: { id: true, analysisId: true },
      orderBy: { createdAt: "asc" },
    });
  }

  // Buat Analysis + semua Violation-nya secara berurutan (TANPA $transaction).
  //
  // Catatan: sebelumnya ini dibungkus prisma.$transaction (interaktif) agar atomik.
  // Namun transaksi interaktif lewat Supabase connection pooler (pgbouncer, mode
  // transaction) menggantung/timeout di serverless Vercel -> endpoint /api/analysis
  // tidak pernah merespons. Karena volume data kecil (1 Analysis + sedikit Violation)
  // dan kegagalan di tengah sangat jarang, kita simpan berurutan biasa.
  // Jika Violation gagal, Analysis sudah terlanjur dibuat; createMany dipakai agar
  // semua Violation ditulis dalam satu perintah (lebih cepat & lebih kecil peluang
  // gagal sebagian dibanding membuat satu per satu).
  static async createAnalysisWithViolations(
    analysisData: AnalysisCreateData,
    violations: any[],
  ) {
    const analysis = await prisma.analysis.create({
      data: {
        mediaId: analysisData.mediaId,
        photoHash: analysisData.photoHash,
        detectorMode: analysisData.detectorMode,
        status: "done",
        progress: 100,
        photoCount: analysisData.photoCount,
        videoDuration: analysisData.videoDuration,
      },
    });

    if (violations.length > 0) {
      await prisma.violation.createMany({
        data: violations.map((v) => ({ ...v, analysisId: analysis.id })),
      });
    }

    return analysis;
  }
}

export default AnalysisRepository;
