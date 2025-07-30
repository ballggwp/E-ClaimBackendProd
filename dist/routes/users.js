"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/users.ts
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// List local users from Prisma
router.get('/', authMiddleware_1.ensureAuth, userController_1.listUsers);
// List approvers via your Azure‐backed profile API
router.get('/approvers', authMiddleware_1.ensureAuth, userController_1.listApprovers);
exports.default = router;
