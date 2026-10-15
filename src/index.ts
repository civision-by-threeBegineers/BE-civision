import express from "express";
import dotenv from "dotenv";
import cors from "cors"
import dns from "node:dns";

dotenv.config();
// Utamakan IPv4 saat resolve DNS. Di jaringan dengan IPv6 bermasalah (NAT64),
// fetch ke Supabase bisa gagal "fetch failed / ECONNRESET".
dns.setDefaultResultOrder("ipv4first");
import uploadRoute from "./routes/upload.route.js";
import zoneRoute from "./routes/zone.route.js";
import analysisRoute from "./routes/analysis.route.js";
import violationRoute from "./routes/violation.route.js";
import dashboardRoute from "./routes/dashboard.route.js";
import reportRoute from "./routes/report.route.js";
import logger from "./middlewares/logger.js";
import errorHandler from "./middlewares/errorHandler.js";
import { healthdb } from "./middlewares/healthdb.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Logger dipasang paling awal supaya semua request tercatat (termasuk preflight OPTIONS).
app.use(logger);
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ status: 'OK', env: PORT})
})

// Diagnostik sementara: cek apakah DATABASE_URL terbaca + koneksi DB jalan.
// TIDAK membocorkan nilai env (hanya host & flag). Hapus setelah selesai debug.
app.get("/health/db", healthdb);

app.use("/api", uploadRoute);
app.use("/api", zoneRoute);       // Zona: /api/zones
app.use("/api", analysisRoute);   // Analisis: /api/analysis
app.use("/api", violationRoute);  // Validasi pelanggaran: /api/violations
app.use("/api", dashboardRoute);  // Dashboard peta: /api/dashboard/map
app.use("/api", reportRoute);     // Laporan: /api/reports

// Error handler terpusat: WAJIB paling akhir, setelah semua route.
app.use(errorHandler);

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`BE is running on http://localhost:${PORT}`)
    })
}

export default app;