"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveFile = saveFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
function saveFile(file) {
    const uploadDir = path_1.default.join(process.cwd(), "uploads");
    if (!fs_1.default.existsSync(uploadDir))
        fs_1.default.mkdirSync(uploadDir, { recursive: true });
    // 1) Decode the client-side originalname from latin1 → UTF-8
    const latin1Name = file.originalname;
    const utf8Name = Buffer.from(latin1Name, "latin1").toString("utf8");
    //    e.g. "รายงานสรุป.xlsx"
    // 2) Break out base + ext
    const ext = path_1.default.extname(utf8Name); // ".xlsx"
    const base = path_1.default.basename(utf8Name, ext); // "รายงานสรุป"
    // 3) Add a short random suffix so two uploads don’t collide
    const rand = crypto_1.default.randomBytes(3).toString("hex"); // e.g. "a1b2c3"
    const stored = `${base}-${rand}${ext}`; // "รายงานสรุป-a1b2c3.xlsx"
    // 4) Move temp file → uploads/
    const source = file.path; // temp path
    const dest = path_1.default.join(uploadDir, stored);
    fs_1.default.renameSync(source, dest);
    // 5) Return the raw Unicode path.  Browsers will percent-encode under the hood,
    //    but users see "http://localhost:3000/uploads/รายงานสรุป-a1b2c3.xlsx"
    return `/uploads/${stored}`;
}
