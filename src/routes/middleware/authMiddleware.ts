// src/middleware/authMiddleware.ts
import type { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string;name:string }
    }
  }
}

const authMiddleware: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization?.split(' ')
  if (!header || header[0] !== 'Bearer') {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  try {
    const payload = jwt.verify(header[1], process.env.JWT_SECRET!) as any
    req.user = { id: payload.id, role: payload.role,name:payload.name }
    next()
  } catch {
    res.status(401).json({ message: 'Invalid token' })
  }
}

import type { Request, Response, NextFunction } from 'express'

export const ensureAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization?.split(' ')
  if (!header || header[0] !== 'Bearer') {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  try {
    const payload = jwt.verify(
      header[1],
      process.env.JWT_SECRET!
    ) as any
    req.user = {
      id: payload.id,
      role: payload.role,
      name: payload.name,
    }
    next()
  } catch {
    res.status(401).json({ message: 'Invalid token' })
  }
}

export function ensureRole(role: string): RequestHandler {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      res.status(403).json({ message: `Forbidden, requires ${role}` })
      return
    }
    next()
  }
}

export default authMiddleware
