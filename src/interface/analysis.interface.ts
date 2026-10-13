// Interface/tipe untuk domain Analysis (service + controller + repository):
//   - src/service/analysis.service.ts
//   - src/controller/analysis.controller.ts
//   - src/repository/analysis.repository.ts

// ---------------------------------------------------------------------------
// Tipe bersama
// ---------------------------------------------------------------------------

export interface LatLon {
  lat: number;
  lon: number;
}

export type CoordinateSource = "gps_exif" | "ocr" | "manual";

export type LngLat = [number, number]; // [lng, lat]

// ---------------------------------------------------------------------------
// EXIF (Requirement 3.1, 3.7)
// ---------------------------------------------------------------------------

export interface ExifResult {
  latlon: LatLon | null;
  present: boolean; // true jika GPS EXIF valid ditemukan
}

// Batas wilayah target (region_bounds). Default: sekitar Indonesia.
// Bisa dioverride lewat environment variable bila perlu.
export interface RegionBounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

// ---------------------------------------------------------------------------
// Coordinate Resolver (Requirement 3)
// ---------------------------------------------------------------------------

export interface ResolvedCoordinate {
  latlon: LatLon | null;
  source: CoordinateSource | null;
}

export interface ResolveInput {
  photo?: Buffer | string;          // berkas foto untuk dibaca EXIF-nya
  ocrLatLon?: LatLon | null;        // koordinat hasil OCR
  manualLatLon?: LatLon | null;     // koordinat input manual
}

// ---------------------------------------------------------------------------
// Zone Matcher (Requirement 5.1, 5.2, 5.3)
// ---------------------------------------------------------------------------

export interface ZoneLike {
  id: string;
  name: string;
  points: LngLat[]; // ring poligon (urutan simpul)
}

export interface MatchResult {
  inside: boolean;
  zoneId: string | null;
  zoneName: string | null;
}

// ---------------------------------------------------------------------------
// Persist Analysis + Violation (Requirement 5.2, 5.3, 5.4, 4.7)
// ---------------------------------------------------------------------------

// Satu deteksi mentah (format Wilson).
export interface RawDetection {
  label: string;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
}

// Input untuk satu unit gambar (1 foto = 1 unit).
export interface AnalysisUnitInput {
  detections: RawDetection[];
  latlon: LatLon | null;              // koordinat dari EXIF/OCR/manual (null jika gagal semua)
  coordinateSource: CoordinateSource | null;
  frameTimestampSec?: number | null;  // untuk video (null untuk foto)
}

export interface PersistAnalysisInput {
  mediaId: string;
  detectorMode?: string;              // default "proxy"
  units: AnalysisUnitInput[];         // foto = 1 unit; video = banyak unit
  photoHash?: string | null;          // SHA-256 isi foto (untuk cek duplikat); null bila tidak ada foto
  photoCount?: number;
  videoDuration?: number;
}

export interface PersistResult {
  analysisId: string;
  totalDetections: number;
  totalViolations: number;
  unknownLocation: number;            // deteksi valid tapi tanpa lokasi valid
}

// ---------------------------------------------------------------------------
// Controller (src/controller/analysis.controller.ts)
// ---------------------------------------------------------------------------

export interface AnalyzeBody {
  mediaId: string;
  detections?: RawDetection[];       // hasil deteksi ONNX dari frontend
  manualLatLon?: LatLon | null;      // koordinat manual (opsional)
  ocrText?: string | null;           // teks overlay koordinat hasil OCR di browser (opsional)
  detectorMode?: string;
}

// ---------------------------------------------------------------------------
// Repository (src/repository/analysis.repository.ts)
// ---------------------------------------------------------------------------

// Pelanggaran lama yang dianggap duplikat (foto sama + koordinat sama).
export interface DuplicateMatch {
  analysisId: string;
  violationId: string;
}

export interface AnalysisCreateData {
  mediaId: string;
  photoHash: string | null;
  detectorMode: string;
  photoCount: number;
  videoDuration: number;
}
