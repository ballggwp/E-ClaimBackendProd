import express from "express";
import { generateMonthlyReportCPM } from "../controllers/reportController";
const router = express.Router();

router.get("/reportCPM", generateMonthlyReportCPM);

export default router;
