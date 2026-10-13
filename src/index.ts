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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ status: 'OK', env: PORT})
})

// Diagnostik sementara: cek apakah DATABASE_URL terbaca + koneksi DB jalan.
// TIDAK membocorkan nilai env (hanya host & flag). Hapus setelah selesai debug.
app.get("/health/db", async (req, res) => {
    const url = process.env.DATABASE_URL || "";
    let host: string | null = null;
    let port: string | null = null;
    try {
        const u = new URL(url);
        host = u.hostname;
        port = u.port;
    } catch {
        // URL kosong / tidak valid
    }

    const result: Record<string, unknown> = {
        hasDatabaseUrl: url.length > 0,
        host,                       // harus "...pooler.supabase.com", bukan null/localhost
        port,                       // harus "6543"
        onVercel: !!process.env.VERCEL,
    };

    try {
        const prisma = (await import("./config/prisma.js")).default;
        const count = await prisma.mediaFile.count();
        result.dbConnected = true;
        result.mediaFileCount = count;
    } catch (err: any) {
        result.dbConnected = false;
        result.dbError = err?.message ?? String(err);
    }

    let statusCode = 500;
    if (result.dbConnected) {
        statusCode = 200;
    }
    return res.status(statusCode).json(result);
})

app.use("/api", uploadRoute);
app.use("/api", zoneRoute);       // Zona: /api/zones
app.use("/api", analysisRoute);   // Analisis: /api/analysis
app.use("/api", violationRoute);  // Validasi pelanggaran: /api/violations
app.use("/api", dashboardRoute);  // Dashboard peta: /api/dashboard/map
app.use("/api", reportRoute);     // Laporan: /api/reports

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`BE is running on http://localhost:${PORT}`)
    })
}

export default app;