// Service Laporan (Requirement 7): statistik + tabel laporan + data 1 laporan
// + generate PDF laporan (pdfkit). Semua bagian ini hanya dipakai oleh ReportController.
// Tabel menampilkan SEMUA status (valid/invalid/unverified).
// Akses database didelegasikan ke ReportRepository.
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import type { Response } from "express";
import ReportRepository from "../repository/report.repository.js";
import type {
  ReportData,
  PaginationParams,
  ReportListResult,
} from "../interface/report.interface.js";

// Error validasi laporan (mis. query pagination tidak valid). Controller
// menerjemahkannya jadi response { ok: false, message } dengan status ini.
export class ReportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Aturan pagination GET /api/reports.
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const INVALID_PAGINATION_MESSAGE = "Parameter page/pageSize tidak valid.";

// Ubah satu nilai query jadi bilangan bulat positif.
// - tidak dikirim  -> pakai nilai default
// - bukan angka bulat (mis. "abc", "1.5", "-1", dikirim 2x) -> null (tidak valid)
function parsePositiveInt(raw: unknown, defaultValue: number): number | null {
  if (raw === undefined) {
    return defaultValue;
  }
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    return null;
  }
  return value;
}

// Format tanggal & jam dalam zona Asia/Jakarta (WIB). Server (Vercel) berjalan
// di UTC, jadi getHours() dkk. akan mundur 7 jam; Intl dipakai agar selalu WIB.
const jakartaFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23", // 00-23 (bukan 24:00:00 untuk tengah malam)
});

// -> { date: "DD/MM/YYYY", timestamp: "HH:MM:SS" }
function formatJakarta(t: Date): { date: string; timestamp: string } {
  const parts: Record<string, string> = {};
  for (const part of jakartaFormatter.formatToParts(t)) {
    parts[part.type] = part.value;
  }
  return {
    date: `${parts.day}/${parts.month}/${parts.year}`,
    timestamp: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

// Warna tema (ungu) sesuai desain laporan.
const PURPLE = "#5a50c3";
const PURPLE_LABEL = "#8b82d6";  // sel label (kiri)
const BORDER = "#d9d6f2";        // garis border sel nilai
const GRAY = "#6b7280";

// Nama bulan Indonesia untuk tanggal "27 September 2026".
const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// Ubah "DD/MM/YYYY" (dari formatJakarta) jadi "D Bulan YYYY".
function tanggalPanjang(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split("/");
  const bulan = BULAN_ID[Number(m) - 1] ?? m;
  return `${Number(d)} ${bulan} ${y}`;
}

// Status mentah (unverified/valid/invalid) -> label berhuruf besar di awal.
function statusLabel(status: string): string {
  if (!status) return "-";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// Ambil byte gambar bukti dari URL (Supabase) atau file lokal. Kembalikan null
// bila gagal; serverless (Vercel) tidak punya file lokal, jadi URL yang utama.
async function loadEvidence(data: ReportData): Promise<Buffer | null> {
  const url = data.evidenceUrl;
  if (url && /^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* abaikan -> fallback / tidak tersedia */
    }
  }
  // Fallback file lokal (dev): evidencePath/evidenceUrl berupa path relatif.
  const local = data.evidencePath ?? (url && !/^https?:\/\//i.test(url) ? url : null);
  if (local) {
    const p = path.resolve(process.cwd(), local);
    if (fs.existsSync(p)) {
      try { return fs.readFileSync(p); } catch { /* abaikan */ }
    }
  }
  return null;
}

// Render laporan langsung ke response (di-stream sebagai PDF).
// Async karena gambar bukti diambil via fetch (dari Supabase) sebelum dirender.
// inline=true -> PDF dibuka di browser (preview); false -> dipaksa unduh.
export async function streamReportPdf(data: ReportData, res: Response, inline = false) {
  // Ambil gambar lebih dulu (perlu await) sebelum menulis PDF.
  const evidence = await loadEvidence(data);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  const disposition = inline ? "inline" : "attachment";
  res.setHeader("Content-Disposition", `${disposition}; filename="laporan-${data.id}.pdf"`);
  doc.pipe(res);

  const left = doc.page.margins.left;             // 50
  const right = doc.page.width - doc.page.margins.right; // 545
  const contentWidth = right - left;

  // ---- Header: judul ungu + logo bulat di kanan ----
  doc.fillColor(PURPLE).font("Helvetica-Bold").fontSize(28);
  doc.text("Laporan", left, 55);
  doc.text("Pelanggaran PKL", left, doc.y);
  const titleBottom = doc.y;

  // Logo CiVision di kanan atas. Pakai file bila ada; selain itu lingkaran+"C".
  const logoSize = 44, logoX = right - logoSize, logoY = 48;
  const logoPath = path.resolve(process.cwd(), "src/assets/logo.png");
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, logoX, logoY, { width: logoSize, height: logoSize });
    } catch {
      doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2).fill(PURPLE);
    }
  } else {
    const cr = logoSize / 2, cx = logoX + cr, cy = logoY + cr;
    doc.circle(cx, cy, cr).fill(PURPLE);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(22).text("C", cx - 7, cy - 12);
  }

  doc.fillColor(GRAY).font("Helvetica").fontSize(11);
  doc.text(`Kepada: ${data.targetAgency},`, left, titleBottom + 8);
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(BORDER).lineWidth(1).stroke();
  doc.moveDown(0.8);

  // ---- Helper: judul seksi + tabel 2 kolom ----
  const labelW = 150;        // lebar kolom label (kiri)
  const rowH = 26;

  const section = (title: string) => {
    doc.moveDown(0.3);
    doc.fillColor(PURPLE).font("Helvetica-Bold").fontSize(13).text(title, left, doc.y);
    doc.moveDown(0.4);
  };

  const table = (rows: [string, string][]) => {
    for (const [label, value] of rows) {
      const y = doc.y;
      // sel label (kiri, ungu muda)
      doc.rect(left, y, labelW, rowH).fill(PURPLE_LABEL);
      doc.fillColor("white").font("Helvetica").fontSize(10)
        .text(label, left + 10, y + 8, { width: labelW - 16 });
      // sel nilai (kanan, border tipis)
      doc.rect(left + labelW, y, contentWidth - labelW, rowH).lineWidth(1).strokeColor(BORDER).stroke();
      doc.fillColor(PURPLE).font("Helvetica").fontSize(10)
        .text(value, left + labelW + 10, y + 8, { width: contentWidth - labelW - 16 });
      doc.y = y + rowH;
    }
    doc.moveDown(0.6);
  };

  // ---- I. Identitas Laporan ----
  section("I. Identitas Laporan");
  table([
    ["ID Pelanggaran", data.id],
    ["Tanggal", tanggalPanjang(data.date)],
    ["Waktu", `${data.timestamp} WIB`],
  ]);

  // ---- II. Data Pelanggaran ----
  section("II. Data Pelanggaran");
  table([
    ["Lokasi (Alamat)", data.location],
    ["Zona Terlarang", data.zoneName ?? "-"],
    ["Koordinat", `${data.coordinate.lat}, ${data.coordinate.lng}`],
  ]);

  // ---- III. Status Verifikasi ----
  section("III. Status Verifikasi");
  table([
    ["Status", statusLabel(data.status)],
    ["Keyakinan AI", `${(data.confidence * 100).toFixed(1)}%`],
  ]);

  // ---- IV. Bukti Visual ----
  section("IV. Bukti Visual");
  const linkY = doc.y;
  if (evidence) {
    try {
      doc.image(evidence, left, doc.y, { fit: [220, 180] });
    } catch {
      doc.fillColor("red").font("Helvetica").fontSize(10).text("(Gagal memuat gambar bukti.)", left, doc.y);
    }
    // Tautan "Link" ke foto asli (bila URL http).
    if (data.evidenceUrl && /^https?:\/\//i.test(data.evidenceUrl)) {
      doc.fillColor(PURPLE).font("Helvetica").fontSize(10)
        .text("Link", left + 230, linkY, { link: data.evidenceUrl, underline: true });
    }
  } else {
    doc.fillColor(GRAY).font("Helvetica").fontSize(10).text("(Bukti visual tidak tersedia.)", left, doc.y);
  }

  doc.end();
}

class ReportService {
  static streamReportPdf = streamReportPdf;

  // Statistik untuk kartu di atas tabel (total/valid/invalid/unverified).
  static async stats() {
    const [total, valid, invalid, unverified] = await Promise.all([
      ReportRepository.countAll(),
      ReportRepository.countByStatus("valid"),
      ReportRepository.countByStatus("invalid"),
      ReportRepository.countByStatus("unverified"),
    ]);
    return { total, valid, invalid, unverified };
  }

  // Validasi query ?page=&pageSize=. Lempar ReportError (400) bila tidak valid.
  // page >= 1 (default 1), pageSize 1-50 (default 10).
  static parsePagination(query: { page?: unknown; pageSize?: unknown }): PaginationParams {
    const page = parsePositiveInt(query.page, DEFAULT_PAGE);
    const pageSize = parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE);

    if (page === null || page < 1) {
      throw new ReportError(INVALID_PAGINATION_MESSAGE);
    }
    if (pageSize === null || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new ReportError(INVALID_PAGINATION_MESSAGE);
    }
    return { page, pageSize };
  }

  // Satu halaman laporan (baris tabel) - SEMUA status ditampilkan.
  // page melebihi totalPages -> reports kosong, pagination tetap diisi (bukan error).
  static async listTable({ page, pageSize }: PaginationParams): Promise<ReportListResult> {
    const skip = (page - 1) * pageSize;
    const [violations, totalItems] = await ReportRepository.findAllWithRelations(skip, pageSize);

    const reports = violations.map((v) => {
      const { date, timestamp } = formatJakarta(v.createdAt);
      return {
        id: v.id,
        // "Location" dari address (reverse geocode); fallback koordinat bila kosong.
        location: v.address ?? `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`,
        date,
        timestamp,
        // "Media (Link)": frame beranotasi bila ada; selain itu URL publik foto asli
        // di Supabase (alur analisis saat ini tidak membuat AnnotatedFrame).
        mediaUrl: v.annotatedFrames[0]?.imagePath ?? v.analysis?.media?.storagePath ?? null,
        mediaName: v.analysis?.media?.originalName ?? null,
        status: v.status,                                    // valid | invalid | unverified
        downloadUrl: `/api/reports/${v.id}/pdf`,             // kolom Download
        coordinate: { lat: v.lat, lng: v.lng },
      };
    });

    return {
      reports,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize), // 0 bila totalItems = 0
      },
    };
  }

  // Data 1 laporan (buat isi PDF).
  static async getOne(violationId: string): Promise<ReportData | null> {
    const v = await ReportRepository.findByIdWithRelations(violationId);
    if (!v) return null;
    const { date, timestamp } = formatJakarta(v.createdAt);
    return {
      id: v.id,
      location: v.address ?? `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`,
      coordinate: { lat: v.lat, lng: v.lng },
      date,
      timestamp,
      mediaName: v.analysis?.media?.originalName ?? null,
      zoneName: v.zone?.name ?? null,
      status: v.status,
      confidence: v.confidence,
      evidencePath: v.annotatedFrames[0]?.imagePath ?? null,
      // Foto bukti: frame beranotasi (jarang ada) atau URL publik foto asli di Supabase.
      evidenceUrl: v.annotatedFrames[0]?.imagePath ?? v.analysis?.media?.storagePath ?? null,
      targetAgency: "Satpol PP / Dishub",
    };
  }
}

export default ReportService;
