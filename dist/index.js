"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const users_1 = __importDefault(require("./routes/users"));
const auth_1 = __importDefault(require("./routes/auth"));
const claims_1 = __importDefault(require("./routes/claims"));
const fppa04_1 = __importDefault(require("./routes/fppa04"));
const express_fileupload_1 = __importDefault(require("express-fileupload"));
const authMiddleware_1 = __importDefault(require("./middleware/authMiddleware"));
const path_1 = __importDefault(require("path"));
const reports_1 = __importDefault(require("./routes/reports"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: process.env.FE_PORT,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type"],
}));
app.use("/api/reports", reports_1.default);
app.use("/uploads", express_1.default.static(path_1.default.join(process.cwd(), "uploads")));
const userinfo_1 = __importDefault(require("./routes/userinfo"));
// 2) Mount your FPPA04 API (guarded inside that router by ensureRole)
app.use('/api/fppa04', fppa04_1.default);
app.use('/api/users', users_1.default);
app.use("/api/auth", auth_1.default);
app.use("/api/claims", claims_1.default);
app.use((0, express_fileupload_1.default)({
    useTempFiles: true,
    tempFileDir: path_1.default.join(process.cwd(), "tmp"), // or your choice
    createParentPath: true,
}));
app.use('/api/userinfo', authMiddleware_1.default, userinfo_1.default);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
