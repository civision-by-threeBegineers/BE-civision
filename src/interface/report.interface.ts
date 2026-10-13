// Interface/tipe untuk src/service/report.service.ts

export interface ReportData {
  id: string;
  location: string;
  coordinate: { lat: number; lng: number };
  date: string;
  timestamp: string;
  mediaName: string | null;
  zoneName: string | null;
  status: string;
  confidence: number;
  evidencePath: string | null;   // path file lokal (lama) - dipakai bila ada
  evidenceUrl: string | null;    // URL publik foto bukti di Supabase (dipakai di Vercel)
  targetAgency: string;
}

// Parameter pagination yang sudah divalidasi (GET /api/reports?page=&pageSize=).
export interface PaginationParams {
  page: number;      // >= 1
  pageSize: number;  // 1 - 50
}

// Metadata pagination di response GET /api/reports.
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;  // semua pelanggaran (semua status) = stats.total
  totalPages: number;  // 0 bila tidak ada data
}

// Satu baris tabel laporan.
export interface ReportListItem {
  id: string;
  location: string;
  date: string;        // DD/MM/YYYY (Asia/Jakarta)
  timestamp: string;   // HH:MM:SS (Asia/Jakarta)
  mediaUrl: string | null;
  mediaName: string | null;
  status: string;      // valid | invalid | unverified
  downloadUrl: string;
  coordinate: { lat: number; lng: number };
}

// Hasil ReportService.listTable(): satu halaman + metadata pagination.
export interface ReportListResult {
  reports: ReportListItem[];
  pagination: PaginationMeta;
}
