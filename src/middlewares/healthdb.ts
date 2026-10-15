import { Request, Response } from "express";

export async function healthdb (req:Request, res:Response) {
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
        const prisma = (await import("../config/prisma.js")).default;
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
}