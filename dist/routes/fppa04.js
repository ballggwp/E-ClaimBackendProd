"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const f04 = __importStar(require("../controllers/fppa04Controller"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fileService_1 = require("../services/fileService");
const router = express_1.default.Router();
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, "uploads/");
    },
    filename: (_req, file, cb) => {
        // grab original extension
        const ext = path_1.default.extname(file.originalname); // e.g. ".pdf"
        const nameOnly = path_1.default.basename(file.originalname, ext); // e.g. "my-doc"
        const ts = Date.now(); // e.g. 1623795300000
        // build final filename
        cb(null, `${nameOnly}-${ts}${ext}`); // "my-doc-1623795300000.pdf"
    }
});
const upload = (0, multer_1.default)({ storage });
// POST   /api/fppa04            → create base
// GET    /api/fppa04/:id        → read base + variant+items+adjustments
// PATCH  /api/fppa04/:id        → update base
router.post("/", f04.createFppa04Base);
router.get("/:id", f04.getFppa04Base);
router.patch("/:id", f04.updateFppa04Base);
// POST   /api/fppa04/:id/cpm  → create CPM variant
// PATCH  /api/fppa04/:id/cpm  → update CPM variant
router.post("/:id/cpm", upload.array("signatureFiles", 10), async (req, res, next) => {
    try {
        // req.files is an array of Multer File objects
        const files = req.files;
        // run each through your helper
        // saveFile moves them into uploads/ with proper UTF-8 names
        // and returns the public URL path
        const signatureUrls = files.map(fileService_1.saveFile);
        // attach to body so your controller can store them
        req.body.signatureUrls = signatureUrls;
        // now call into your normal controller
        return f04.createFppa04Cpm(req, res, next);
    }
    catch (err) {
        next(err);
    }
});
// same for PATCH if you want updates
router.patch("/:id/cpm", upload.array("signatureFiles", 10), async (req, res, next) => {
    try {
        const files = req.files;
        const signatureUrls = files.map(fileService_1.saveFile);
        req.body.signatureUrls = signatureUrls;
        return f04.createFppa04Cpm(req, res, next);
    }
    catch (err) {
        next(err);
    }
});
// POST   /api/fppa04/:id/items          → add item
// PATCH  /api/fppa04/:id/items/:itemId  → update item
// DELETE /api/fppa04/:id/items/:itemId  → delete item
router.post("/:id/items", f04.addFppa04Item);
router.patch("/:id/items/:itemId", f04.updateFppa04Item);
router.delete("/:id/items/:itemId", f04.deleteFppa04Item);
// POST   /api/fppa04/:id/adjustments         → add adjustment
// PATCH  /api/fppa04/:id/adjustments/:adjId  → update adjustment
// DELETE /api/fppa04/:id/adjustments/:adjId  → delete adjustment
router.post("/:id/adjustments", f04.addFppa04Adjustment);
router.patch("/:id/adjustments/:adjId", f04.updateFppa04Adjustment);
router.delete("/:id/adjustments/:adjId", f04.deleteFppa04Adjustment);
router.get("/", f04.listFppa04);
exports.default = router;
