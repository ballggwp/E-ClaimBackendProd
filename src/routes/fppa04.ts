import express from "express";
import * as f04 from "../controllers/fppa04Controller";
import multer from "multer";
import path from "path";
import { saveFile } from "../services/fileService";
const router = express.Router();
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, "uploads/");
  },
  filename: (_req, file, cb) => {
    // grab original extension
    const ext      = path.extname(file.originalname);         // e.g. ".pdf"
    const nameOnly = path.basename(file.originalname, ext);   // e.g. "my-doc"
    const ts       = Date.now();                              // e.g. 1623795300000
    // build final filename
    cb(null, `${nameOnly}-${ts}${ext}`);                      // "my-doc-1623795300000.pdf"
  }
});

const upload = multer({ storage });

// POST   /api/fppa04            → create base
// GET    /api/fppa04/:id        → read base + variant+items+adjustments
// PATCH  /api/fppa04/:id        → update base
router.post  ("/",         f04.createFppa04Base);
router.get   ("/:id",      f04.getFppa04Base);
router.patch ("/:id",      f04.updateFppa04Base);


// POST   /api/fppa04/:id/cpm  → create CPM variant
// PATCH  /api/fppa04/:id/cpm  → update CPM variant
router.post(
  "/:id/cpm",
  upload.array("signatureFiles", 10),
  f04.createFppa04Cpm
);
router.patch(
  "/:id/cpm",
  upload.array("signatureFiles", 10),
  f04.createFppa04Cpm
);

// POST   /api/fppa04/:id/items          → add item
// PATCH  /api/fppa04/:id/items/:itemId  → update item
// DELETE /api/fppa04/:id/items/:itemId  → delete item
router.post   ("/:id/items",             f04.addFppa04Item);
router.patch  ("/:id/items/:itemId",     f04.updateFppa04Item);
router.delete ("/:id/items/:itemId",     f04.deleteFppa04Item);


// POST   /api/fppa04/:id/adjustments         → add adjustment
// PATCH  /api/fppa04/:id/adjustments/:adjId  → update adjustment
// DELETE /api/fppa04/:id/adjustments/:adjId  → delete adjustment
router.post   ("/:id/adjustments",              f04.addFppa04Adjustment);
router.patch  ("/:id/adjustments/:adjId",       f04.updateFppa04Adjustment);
router.delete ("/:id/adjustments/:adjId",       f04.deleteFppa04Adjustment);


router.get("/", f04.listFppa04)
export default router;
