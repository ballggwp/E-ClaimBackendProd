// src/routes/auth.ts
import { Router } from 'express'
import { login,loginLimiter } from '../controllers/authController'
const router = Router()

router.post("/login", loginLimiter, login);
export default router
