"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/userinfo.ts
const express_1 = require("express");
const userinfoController_1 = require("../controllers/userinfoController");
const router = (0, express_1.Router)();
// GET /api/userinfo?email=…
router.get('/', userinfoController_1.getUserInfo);
exports.default = router;
