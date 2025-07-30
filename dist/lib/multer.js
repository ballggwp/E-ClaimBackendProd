"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const iconv_lite_1 = __importDefault(require("iconv-lite"));
const storage = multer_1.default.diskStorage({
    destination: './uploads',
    filename: (req, file, cb) => {
        // reinterpret the raw originalname bytes as UTF-8
        const utf8Name = iconv_lite_1.default.decode(Buffer.from(file.originalname, 'binary'), 'utf8');
        // optional: prefix with a timestamp or UUID to avoid collisions
        cb(null, `${Date.now()}-${utf8Name}`);
    }
});
exports.upload = (0, multer_1.default)({ storage });
