// Repository Laporan: membungkus akses database (Prisma) untuk data laporan.
// Pemetaan/format data (tanggal, downloadUrl, dll) TIDAK di sini — itu di ReportService.
import prisma from "../config/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { SortParams } from "../interface/report.interface.js";

// Urutan tabel laporan. Hanya nilai whitelist (SortParams) yang sampai ke sini.
// Pemecah seri createdAt desc, id desc: urutan stabil antar halaman.
export function violationOrderBy({ sortBy, sortDir }: SortParams): Prisma.ViolationOrderByWithRelationInput[] {
  const newestFirst: Prisma.ViolationOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "desc" }];
  switch (sortBy) {
    case "createdAt":
      return [{ createdAt: sortDir }, { id: sortDir }];
    case "location":
      // Tanpa alamat (tabel menampilkan koordinat) selalu di akhir.
      return [{ address: { sort: sortDir, nulls: "last" } }, ...newestFirst];
    case "media":
      return [{ analysis: { media: { originalName: sortDir } } }, ...newestFirst];
    case "status":
      return [{ status: sortDir }, ...newestFirst];
  }
}

class ReportRepository {
  static countAll() {
    return prisma.violation.count();
  }

  static countByStatus(status: "valid" | "invalid" | "unverified") {
    return prisma.violation.count({ where: { status } });
  }

  // Satu halaman pelanggaran (semua status) beserta relasi media & frame,
  // sekaligus total baris. Dijalankan dalam satu transaksi agar halaman & total konsisten.
  // Urutan dari violationOrderBy (default terbaru dulu). Tetap batch array
  // $transaction: transaksi interaktif macet di Vercel/Supabase pooler.
  static findAllWithRelations(skip: number, take: number, sort: SortParams) {
    return prisma.$transaction([
      prisma.violation.findMany({
        include: { analysis: { include: { media: true } }, annotatedFrames: true },
        orderBy: violationOrderBy(sort),
        skip,
        take,
      }),
      prisma.violation.count(),
    ]);
  }

  // Satu pelanggaran lengkap untuk isi PDF.
  static findByIdWithRelations(id: string) {
    return prisma.violation.findUnique({
      where: { id },
      include: { analysis: { include: { media: true } }, zone: true, annotatedFrames: true },
    });
  }
}

export default ReportRepository;
