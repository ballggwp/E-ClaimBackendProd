// src/routes/userinfo.ts
import { Router } from 'express'
import { getUserInfo } from '../controllers/userinfoController'

const router = Router()

// GET /api/userinfo?email=…
router.get('/', getUserInfo)

export default router
