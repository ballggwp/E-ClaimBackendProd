import multer from 'multer';
import iconv from 'iconv-lite';

const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    // reinterpret the raw originalname bytes as UTF-8
    const utf8Name = iconv.decode(Buffer.from(file.originalname, 'binary'), 'utf8');
    // optional: prefix with a timestamp or UUID to avoid collisions
    cb(null, `${Date.now()}-${utf8Name}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // กำหนดขนาดสูงสุดต่อไฟล์
});