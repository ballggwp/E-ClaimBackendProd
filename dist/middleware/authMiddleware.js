"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureAuth = void 0;
exports.ensureRole = ensureRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authMiddleware = (req, res, next) => {
    const header = req.headers.authorization?.split(' ');
    if (!header || header[0] !== 'Bearer') {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(header[1], process.env.JWT_SECRET);
        req.user = { id: payload.id, role: payload.role, name: payload.name };
        next();
    }
    catch {
        res.status(401).json({ message: 'Invalid token' });
    }
};
const ensureAuth = (req, res, next) => {
    const header = req.headers.authorization?.split(' ');
    if (!header || header[0] !== 'Bearer') {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(header[1], process.env.JWT_SECRET);
        req.user = {
            id: payload.id,
            role: payload.role,
            name: payload.name,
        };
        next();
    }
    catch {
        res.status(401).json({ message: 'Invalid token' });
    }
};
exports.ensureAuth = ensureAuth;
function ensureRole(role) {
    return (req, res, next) => {
        if (req.user?.role !== role) {
            res.status(403).json({ message: `Forbidden, requires ${role}` });
            return;
        }
        next();
    };
}
exports.default = authMiddleware;
