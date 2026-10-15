// Middleware logger: mencatat setiap request API yang diakses.
// Contoh output:
//   [2026-10-15 13:19:27] GET /api/reports?page=1 -> 200 (35 ms)
//   [2026-10-15 13:19:30] POST /api/analysis -> 409 (812 ms)
// Di lokal tampil di terminal `npm run dev`; di Vercel tampil di tab Logs.
// Body request TIDAK dicatat supaya data sensitif (foto, koordinat, token) tidak bocor ke log.
import type { Request, Response, NextFunction } from "express";

// Waktu dalam zona Asia/Jakarta (WIB), format YYYY-MM-DD HH:MM:SS.
const timeFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function logger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  const time = timeFormatter.format(new Date());
  // originalUrl berisi path lengkap + query (mis. /api/reports?page=2), bukan path relatif router.
  const url = req.originalUrl;
  let logged = false;

  function write(note: string) {
    if (logged) return;
    logged = true;

    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const line = `[${time}] ${req.method} ${url} -> ${res.statusCode}${note} (${durationMs.toFixed(0)} ms)`;

    // 5xx = error server, 4xx = request ditolak, selain itu normal.
    if (res.statusCode >= 500) {
      console.error(line);
    } else if (res.statusCode >= 400) {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  // "finish" = response selesai dikirim.
  res.on("finish", () => write(""));
  // "close" tanpa "finish" = koneksi diputus sebelum response selesai (mis. klien membatalkan).
  res.on("close", () => write(" [koneksi terputus]"));

  next();
}

export default logger;
