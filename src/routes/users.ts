// src/routes/users.ts
import { Router } from 'express'
import { listUsers, listApprovers } from '../controllers/userController'
import { ensureAuth } from '../middleware/authMiddleware'

const router = Router()

// List local users from Prisma
router.get(
  '/',
  ensureAuth,
  listUsers
)

// List approvers via your Azure‐backed profile API
router.get(
  '/approvers',
  ensureAuth,
  listApprovers
)

export default router
