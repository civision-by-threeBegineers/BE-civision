// Route Analisis (Requirement 5) - endpoint menyatukan resolver koordinat + persist.
import express from "express";
import photoUpload from "../middlewares/upload.js";
import AnalysisController from "../controller/analysis.controller.js";

const router = express.Router();

// field "photo" opsional (untuk baca GPS EXIF). Data lain via body/JSON.
router.post("/analysis", photoUpload.single("photo"), AnalysisController.analyze);

export default router;
