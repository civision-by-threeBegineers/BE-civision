// Service Analisis (Requirement 3, 4, 5): gabungan dari
//   - exif               : baca GPS EXIF + validasi region
//   - coordinateResolver : strategi berjenjang EXIF -> OCR -> manual
//   - zoneMatcher        : point-in-polygon terhadap Zona Terlarang
//   - geocode            : reverse geocoding (Nominatim)
//   - analysisPersist    : simpan Analysis + Violation secara atomik
// Semua bagian ini hanya dipakai oleh AnalysisController.
// Akses database didelegasikan ke AnalysisRepository.
import crypto from "node:crypto";
import exifr from "exifr";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint, polygon as turfPolygon } from "@turf/helpers";
import AnalysisRepository from "../repository/analysis.repository.js";
import { getSupabase, SUPABASE_BUCKET } from "../config/supabase.js";
import type {
  LatLon,
  LngLat,
  ExifResult,
  RegionBounds,
  ResolvedCoordinate,
  ResolveInput,
  ZoneLike,
  MatchResult,
  PersistAnalysisInput,
  PersistResult,
  DuplicateMatch,
} from "../interface/analysis.interface.js";

// ============================================================================
// EXIF (Requirement 3.1, 3.7)
// Batas wilayah target (region_bounds): default sekitar Indonesia, bisa dioverride via env.
// ============================================================================

export const DEFAULT_REGION_BOUNDS: RegionBounds = {
  latMin: parseFloat(process.env.REGION_LAT_MIN || "-11.5"),
  latMax: parseFloat(process.env.REGION_LAT_MAX || "6.5"),
  lonMin: parseFloat(process.env.REGION_LON_MIN || "94.5"),
  lonMax: parseFloat(process.env.REGION_LON_MAX || "141.5"),
};

// Baca GPS EXIF dari berkas foto (buffer atau path).
// exifr sudah mengembalikan latitude/longitude dalam desimal (S/W negatif).
export async function readExifGps(input: Buffer | string): Promise<ExifResult> {
  try {
    const gps = await exifr.gps(input);
    if (
      gps &&
      typeof gps.latitude === "number" &&
      typeof gps.longitude === "number" &&
      Number.isFinite(gps.latitude) &&
      Number.isFinite(gps.longitude)
    ) {
      return { latlon: { lat: gps.latitude, lon: gps.longitude }, present: true };
    }
    return { latlon: null, present: false };
  } catch {
    // EXIF tidak ada / rusak / bukan gambar ber-EXIF
    return { latlon: null, present: false };
  }
}

// Validasi kewajaran koordinat: harus di dalam region_bounds (inklusif).
// Berlaku untuk SEMUA sumber koordinat (EXIF/OCR/manual) - Requirement 3.7.
export function isWithinRegion(
  latlon: LatLon,
  bounds: RegionBounds = DEFAULT_REGION_BOUNDS
): boolean {
  return (
    latlon.lat >= bounds.latMin &&
    latlon.lat <= bounds.latMax &&
    latlon.lon >= bounds.lonMin &&
    latlon.lon <= bounds.lonMax
  );
}

// ============================================================================
// Coordinate Resolver (Requirement 3): 1) GPS EXIF -> 2) OCR -> 3) manual
// ============================================================================

// Urutan: EXIF -> OCR -> manual. Yang pertama tersedia dipakai.
export async function resolveCoordinate(input: ResolveInput): Promise<ResolvedCoordinate> {
  // 1) GPS EXIF (sumber utama foto)
  if (input.photo !== undefined) {
    const exif = await readExifGps(input.photo);
    if (exif.present && exif.latlon) {
      return { latlon: exif.latlon, source: "gps_exif" };
    }
  }
  // 2) OCR (cadangan)
  if (input.ocrLatLon) {
    return { latlon: input.ocrLatLon, source: "ocr" };
  }
  // 3) Input manual (cadangan terakhir)
  if (input.manualLatLon) {
    return { latlon: input.manualLatLon, source: "manual" };
  }
  return { latlon: null, source: null };
}

// ============================================================================
// Zone Matcher (Requirement 5.1, 5.2, 5.3) - deterministik, bukan AI
// ============================================================================

// Ubah daftar titik zona menjadi ring tertutup.
function toClosedRing(points: LngLat[]): LngLat[] {
  if (points.length === 0) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return points;
  return [...points, first];
}

// Cek satu titik terhadap satu zona.
export function isPointInZone(latlon: LatLon, zone: ZoneLike): boolean {
  if (!zone.points || zone.points.length < 3) return false;
  const pt = turfPoint([latlon.lon, latlon.lat]); // GeoJSON: [lng, lat]
  const poly = turfPolygon([toClosedRing(zone.points)]);
  return booleanPointInPolygon(pt, poly);
}

// Cek titik terhadap kumpulan zona; kembalikan zona pertama yang memuatnya.
export function matchZone(latlon: LatLon, zones: ZoneLike[]): MatchResult {
  for (const zone of zones) {
    if (isPointInZone(latlon, zone)) {
      return { inside: true, zoneId: zone.id, zoneName: zone.name };
    }
  }
  return { inside: false, zoneId: null, zoneName: null };
}

// ============================================================================
// Reverse Geocoding (OpenStreetMap Nominatim)
// Dipanggil SEKALI saat pelanggaran dibuat, hasilnya disimpan ke kolom address.
// ============================================================================

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

// Ubah koordinat -> alamat. Kembalikan null bila gagal (offline / rate limit / tidak ketemu).
// Pemanggil WAJIB sediakan fallback (mis. tampilkan koordinat) bila null.
export async function reverseGeocode(latlon: LatLon): Promise<string | null> {
  try {
    const url = `${NOMINATIM_URL}?format=jsonv2&lat=${latlon.lat}&lon=${latlon.lon}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        // Nominatim mewajibkan User-Agent yang mengidentifikasi aplikasi.
        "User-Agent": "Civision-PKL-Detection/1.0 (lomba smart city)",
        "Accept-Language": "id",
      },
      // batasi waktu tunggu agar tidak menggantung
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();

    // Susun nama jalan dari bagian alamat yang tersedia.
    const a = data.address ?? {};
    const road = a.road || a.pedestrian || a.footway || a.residential || null;
    if (road) {
      const area = a.suburb || a.village || a.town || a.city_district || a.city || "";
      if (area) {
        return `${road}, ${area}`;
      }
      return road;
    }
    // fallback ke display_name ringkas bila tidak ada 'road'
    return data.display_name ?? null;
  } catch {
    return null; // gagal -> pemanggil pakai fallback koordinat
  }
}

// ============================================================================
// Persist Analysis + Violation (Requirement 5.2, 5.3, 5.4, 4.7)
// ============================================================================

const CONFIDENCE_THRESHOLD = 0.5; // Requirement 4.3

// Toleransi "koordinat sama" saat cek duplikat: 0.000001 derajat (~0,1 m).
// Foto yang sama menghasilkan koordinat EXIF/OCR yang identik; toleransi kecil ini
// hanya untuk menyerap selisih pembulatan angka desimal.
const DUPLICATE_COORD_EPS = 0.000001;

class AnalysisService {
  static readExifGps = readExifGps;
  static isWithinRegion = isWithinRegion;
  static resolveCoordinate = resolveCoordinate;
  static isPointInZone = isPointInZone;
  static matchZone = matchZone;
  static reverseGeocode = reverseGeocode;

  // Ambil record MediaFile; null jika mediaId tidak ada.
  static async getMedia(mediaId: string) {
    return AnalysisRepository.findMediaById(mediaId);
  }

  // Ambil isi file media dari Supabase Storage (untuk baca EXIF/OCR) bila FE
  // tidak mengirim foto di request. storagePath berisi URL publik Supabase.
  // Mengembalikan null bila gagal; EXIF/OCR hanya sumber koordinat, bukan wajib.
  static async loadMediaBuffer(storagePath: string): Promise<Buffer | null> {
    try {
      const marker = `/storage/v1/object/public/${SUPABASE_BUCKET}/`;
      const idx = storagePath.indexOf(marker);
      // Bila storagePath berupa URL publik, ambil bagian path objeknya saja.
      let objectPath = storagePath;
      if (idx >= 0) {
        objectPath = decodeURIComponent(storagePath.slice(idx + marker.length));
      }

      const { data, error } = await getSupabase().storage.from(SUPABASE_BUCKET).download(objectPath);
      if (error || !data) {
        console.warn("[analysis] gagal download media:", error?.message ?? "no data");
        return null;
      }
      return Buffer.from(await data.arrayBuffer());
    } catch (err: any) {
      console.warn("[analysis] gagal download media:", err?.message ?? err);
      return null;
    }
  }

  // Sidik jari isi foto (SHA-256, hex). File yang byte-nya identik -> hash sama.
  static hashPhoto(photo: Buffer): string {
    return crypto.createHash("sha256").update(photo).digest("hex");
  }

  // Cek duplikat: foto yang sama (photoHash sama) di koordinat yang sama sudah
  // pernah menghasilkan pelanggaran. Mengembalikan pelanggaran lama, atau null.
  static async findDuplicate(photoHash: string, latlon: LatLon): Promise<DuplicateMatch | null> {
    const found = await AnalysisRepository.findViolationByPhotoAndCoordinate(
      photoHash,
      latlon.lat,
      latlon.lon,
      DUPLICATE_COORD_EPS,
    );
    if (!found) {
      return null;
    }
    return { analysisId: found.analysisId, violationId: found.id };
  }

  // Simpan satu Analysis beserta Violation-nya secara atomik.
  static async persist(input: PersistAnalysisInput): Promise<PersistResult> {
    // Ambil zona sekali (dipakai untuk semua unit).
    const zonesRaw = await AnalysisRepository.findAllZones();
    const zones: ZoneLike[] = zonesRaw.map((z) => ({
      id: z.id,
      name: z.name,
      points: z.points as unknown as LngLat[],
    }));

    let totalDetections = 0;
    let unknownLocation = 0;

    // Siapkan data violation sebelum transaksi.
    const violationData: any[] = [];

    for (const unit of input.units) {
      // Koordinat valid = ada DAN di dalam region (Requirement 3.7).
      const hasValidCoord = unit.latlon !== null && isWithinRegion(unit.latlon);

      for (const det of unit.detections) {
        // Hanya deteksi dengan confidence >= 0.5 dianggap valid (Req 4.3).
        if (det.confidence < CONFIDENCE_THRESHOLD) continue;
        totalDetections++;

        if (!hasValidCoord || !unit.latlon) {
          // Deteksi valid tapi tanpa Titik Deteksi valid => "lokasi tidak diketahui",
          // BUKAN pelanggaran (Requirement 5.3). Tidak disimpan sebagai Violation.
          unknownLocation++;
          continue;
        }

        // Cek titik masuk zona mana (point-in-polygon).
        const match = matchZone(unit.latlon, zones);
        if (!match.inside) {
          // Ada koordinat valid tapi di luar semua zona => bukan pelanggaran.
          continue;
        }

        // Pelanggaran (Req 5.2, 5.4). Isi alamat via reverse geocoding (fallback null).
        const address = await reverseGeocode(unit.latlon);
        violationData.push({
          zoneId: match.zoneId,
          lat: unit.latlon.lat,
          lng: unit.latlon.lon,
          confidence: det.confidence,
          bbox: det.bbox as any,
          coordinateSource: unit.coordinateSource ?? "manual",
          startTimeSec: unit.frameTimestampSec ?? null,
          endTimeSec: unit.frameTimestampSec ?? null,
          address,
          locationStatus: "matched",
          // status default "unverified", followUp default "belum" (Req 9.1)
        });
      }
    }

    // Tulis Analysis + Violation secara atomik (Req 4.7).
    const analysis = await AnalysisRepository.createAnalysisWithViolations(
      {
        mediaId: input.mediaId,
        photoHash: input.photoHash ?? null,
        detectorMode: input.detectorMode ?? "proxy",
        photoCount: input.photoCount ?? 0,
        videoDuration: input.videoDuration ?? 0,
      },
      violationData,
    );

    return {
      analysisId: analysis.id,
      totalDetections,
      totalViolations: violationData.length,
      unknownLocation,
    };
  }
}

export default AnalysisService;
