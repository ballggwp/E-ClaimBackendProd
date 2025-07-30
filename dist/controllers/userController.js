"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listApprovers = exports.listUsers = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const authController_1 = require("./authController");
const axios_1 = __importDefault(require("axios"));
const listUsers = async (_req, res, next) => {
    try {
        const users = await prisma_1.default.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                position: true,
                employeeNumber: true,
                department: true, // include department
            },
        });
        res.json({ users });
    }
    catch (err) {
        next(err);
    }
};
exports.listUsers = listUsers;
const listApprovers = async (req, res, next) => {
    try {
        const azureToken = await (0, authController_1.fetchAzureToken)();
        // replace YOUR_APPROVE_CODE with whatever you need (e.g. from env)
        const body = { approveCode: "206" };
        const profileRes = await axios_1.default.post(`https://${process.env.SERVICE_HOST}/userinfo/api/v2/profile`, body, {
            headers: {
                Authorization: `Bearer ${azureToken}`,
                "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY,
                "Content-Type": "application/json",
            },
        });
        const result = profileRes.data.result;
        const users = result.map(u => ({
            id: u.id, // e.g. "00000009"
            name: u.employeeName.th, // ไทยชื่อ
            position: u.position.name.th,
            department: u.department.name.th // ตำแหน่งไทย       // or derive from u.role if you have it
        }));
        res.json({ users });
    }
    catch (err) {
        console.error("listApprovers error:", err);
        next(err);
    }
};
exports.listApprovers = listApprovers;
