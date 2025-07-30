import fs from "fs";
import path from "path";
import crypto from "crypto";

export function saveFile(file: any): string {
  const uploadDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  // 1) Decode the client-side originalname from latin1 → UTF-8
  const latin1Name = file.originalname as string; 
  const utf8Name   = Buffer.from(latin1Name, "latin1").toString("utf8");
  //    e.g. "รายงานสรุป.xlsx"

  // 2) Break out base + ext
  const ext   = path.extname(utf8Name);            // ".xlsx"
  const base  = path.basename(utf8Name, ext);      // "รายงานสรุป"

  // 3) Add a short random suffix so two uploads don’t collide
  const rand      = crypto.randomBytes(3).toString("hex"); // e.g. "a1b2c3"
  const stored    = `${base}-${rand}${ext}`;               // "รายงานสรุป-a1b2c3.xlsx"

  // 4) Move temp file → uploads/
  const source = file.path as string;                     // temp path
  const dest   = path.join(uploadDir, stored);
  fs.renameSync(source, dest);

  // 5) Return the raw Unicode path.  Browsers will percent-encode under the hood,
  //    but users see "http://localhost:3000/uploads/รายงานสรุป-a1b2c3.xlsx"
  return `/uploads/${stored}`;
}
