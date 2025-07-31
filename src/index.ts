import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import usersRoutes from './routes/users'
import authRoutes from "./routes/auth";
import claimRoutes from "./routes/claims";
import fppa04Routes from "./routes/fppa04"
import fileUpload from "express-fileupload";
import authMiddleware from './middleware/authMiddleware'
import path from "path"
import reportRoutes from "./routes/reports";
dotenv.config();
const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.FE_PORT,  
    credentials: true,     
    allowedHeaders: ["Authorization", "Content-Type"],           
  })
)
app.use("/api/reports", reportRoutes);
app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"))
);
import userinfoRouter from './routes/userinfo'
// 2) Mount your FPPA04 API (guarded inside that router by ensureRole)
app.use('/api/fppa04', fppa04Routes)

app.use('/api/users', usersRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/claims", claimRoutes);
app.use(
  fileUpload({
    useTempFiles:   true,
    tempFileDir:    path.join(process.cwd(), "tmp"), // or your choice
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 }
  })
);
app.use('/api/userinfo', authMiddleware, userinfoRouter)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
