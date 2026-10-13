// Parser teks koordinat. OCR (membaca teks dari gambar) dijalankan di FRONTEND;
// backend hanya menerima teks hasil OCR ("ocrText") lalu mengubahnya jadi { lat, lon }.
// Simbol derajat ditulis sebagai \u00b0 agar aman encoding.
import type { LatLon } from "../interface/analysis.interface.js";

const DEG = "\\u00b0"; // simbol derajat untuk regex

// ---- Parsing teks -> koordinat (fungsi murni) ----
export function parseCoordinatesFromText(text: string): LatLon | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();

  // 1) Desimal + arah: "6.1752 S, 106.8272 E" / "6.1752\u00b0S 106.8272\u00b0E"
  const decDir = new RegExp(
    `(-?\\d{1,3}(?:\\.\\d+)?)\\s*${DEG}?\\s*([NS])\\s*[, ]+\\s*(-?\\d{1,3}(?:\\.\\d+)?)\\s*${DEG}?\\s*([EW])`,
    "i"
  );
  let m = t.match(decDir);
  if (m) {
    let lat = parseFloat(m[1]!);
    let lon = parseFloat(m[3]!);
    if (m[2]!.toUpperCase() === "S") lat = -Math.abs(lat);
    if (m[4]!.toUpperCase() === "W") lon = -Math.abs(lon);
    if (isReasonable(lat, lon)) return { lat, lon };
  }

  // 2) Desimal bertanda tanpa arah: "-6.1752, 106.8272"
  const decPlain = /(-?\d{1,2}\.\d{3,})\s*[, ]+\s*(-?\d{1,3}\.\d{3,})/;
  m = t.match(decPlain);
  if (m) {
    const lat = parseFloat(m[1]!);
    const lon = parseFloat(m[2]!);
    if (isReasonable(lat, lon)) return { lat, lon };
  }

  // 3) DMS: "6\u00b010'30.7\"S 106\u00b049'37.9\"E" (semua simbol opsional, toleran spasi)
  const dms = new RegExp(
    `(\\d{1,3})\\s*${DEG}?\\s*(\\d{1,2})\\s*['\u2019]?\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*["\u201d]?\\s*([NS])\\s*[, ]*\\s*(\\d{1,3})\\s*${DEG}?\\s*(\\d{1,2})\\s*['\u2019]?\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*["\u201d]?\\s*([EW])`,
    "i"
  );
  m = t.match(dms);
  if (m) {
    let lat = dmsToDecimal(+m[1]!, +m[2]!, +m[3]!);
    let lon = dmsToDecimal(+m[5]!, +m[6]!, +m[7]!);
    if (m[4]!.toUpperCase() === "S") lat = -lat;
    if (m[8]!.toUpperCase() === "W") lon = -lon;
    if (isReasonable(lat, lon)) return { lat, lon };
  }

  return null;
}

function dmsToDecimal(d: number, min: number, sec: number): number {
  return d + min / 60 + sec / 3600;
}

function isReasonable(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

export default { parseCoordinatesFromText };
