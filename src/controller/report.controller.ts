// Controller Laporan (Requirement 7): statistik + tabel + unduh PDF.
import { Request, Response, NextFunction } from "express";
import ReportService, { ReportError } from "../service/report.service.js";

class ReportController {
  // GET /api/reports?page=1&pageSize=10  -> statistik + 1 halaman tabel laporan
  // stats = seluruh data (bukan per halaman). isEmpty = tidak ada data sama sekali.
  static async list(req: Request, res: Response) {
    try {
      const pageParams = ReportService.parsePagination(req.query);

      const [stats, { reports, pagination }] = await Promise.all([
        ReportService.stats(),
        ReportService.listTable(pageParams),
      ]);

      return res.json({
        ok: true,
        stats,
        reports,
        pagination,
        isEmpty: pagination.totalItems === 0,
      });
    } catch (err) {
      if (err instanceof ReportError) {
        return res.status(err.status).json({ ok: false, message: err.message });
      }
      console.error("[reports] gagal mengambil data laporan:", err);
      return res.status(500).json({ ok: false, message: "Gagal mengambil data laporan." });
    }
  }

  // GET /api/reports/:id/pdf  -> unduh PDF laporan
  static async downloadPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ReportService.getOne(req.params.id as string);
      if (!data) {
        return res.status(404).json({ ok: false, message: "Laporan tidak ditemukan." });
      }
      // ?inline=1 -> tampilkan di browser (preview); selain itu paksa unduh.
      const inline = req.query.inline === "1" || req.query.inline === "true";
      await ReportService.streamReportPdf(data, res, inline);
    } catch (err) {
      next(err);
    }
  }
}

export default ReportController;