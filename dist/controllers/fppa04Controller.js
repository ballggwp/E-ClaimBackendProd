"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFppa04 = exports.deleteFppa04Adjustment = exports.updateFppa04Adjustment = exports.addFppa04Adjustment = exports.deleteFppa04Item = exports.updateFppa04Item = exports.addFppa04Item = exports.createFppa04Cpm = exports.updateFppa04Base = exports.getFppa04Base = exports.createFppa04Base = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../lib/prisma"));
const axios_1 = __importDefault(require("axios"));
const claimController_1 = require("./claimController");
// ─── Create FPPA-04 Base ───────────────────────────────────────────────────────
const createFppa04Base = async (req, res, next) => {
    try {
        const { claimId, categoryMain, categorySub } = req.body;
        console.log(claimId, categoryMain, categorySub);
        if (!claimId || !categoryMain || !categorySub) {
            res.status(400).json({ message: 'claimId, categoryMain and categorySub are required' });
            return;
        }
        const base = await prisma_1.default.fppa04Base.upsert({
            where: { claimId },
            create: {
                claimId,
                mainType: categoryMain,
                subType: categorySub,
            },
            update: {
            // if you ever want to allow changing categoryMain/Sub on an existing record,
            // put those fields here.  Otherwise, leave this empty to just leave the existing row untouched:
            },
        });
        res.status(200).json({ base });
        return;
    }
    catch (err) {
        next(err);
    }
};
exports.createFppa04Base = createFppa04Base;
// ─── Get FPPA-04 Base (with CPM variant) ──────────────────────────────────────
const getFppa04Base = async (req, res, next) => {
    try {
        const { id } = req.params; // this is the claimId (not the auto-PK of the base)
        const base = await prisma_1.default.fppa04Base.findUnique({
            where: { claimId: id },
            include: {
                claim: {
                    select: {
                        docNum: true,
                        cpmForm: { select: { cause: true } },
                        id: true,
                        approverName: true,
                        signerName: true,
                        status: true,
                        categoryMain: true,
                        categorySub: true,
                    }
                },
                cpmVariant: {
                    include: {
                        items: true,
                        adjustments: true,
                    }
                }
            }
        });
        if (!base) {
            res.status(404).json({ message: "FPPA-04 base not found" });
            return;
        }
        // even if base.cpmVariant is null, we return it as `form: null`
        res.json({
            form: base.cpmVariant, // may be null on brand-new
            claim: base.claim
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getFppa04Base = getFppa04Base;
// ─── Update FPPA-04 Base ───────────────────────────────────────────────────────
const updateFppa04Base = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { mainType, subType } = req.body;
        const data = {
            ...(mainType !== undefined && { mainType }),
            ...(subType !== undefined && { subType }),
        };
        const updated = await prisma_1.default.fppa04Base.update({
            where: { id },
            data,
        });
        res.json({ base: updated });
    }
    catch (err) {
        next(err);
    }
};
exports.updateFppa04Base = updateFppa04Base;
// ─── Create / Update CPM Variant ───────────────────────────────────────────────
// POST   /api/fppa04/:id/cpm
const createFppa04Cpm = async (req, res, next) => {
    try {
        const claimId = req.params.id;
        // 1) Look up the base record
        const base = await prisma_1.default.fppa04Base.findUnique({
            where: { claimId },
            select: { id: true },
        });
        if (!base) {
            res.status(404).json({ message: "FPPA-04 base not found" });
            return;
        }
        // 2) Parse items & adjustments (JSON-encoded arrays)
        const parseArray = (raw) => [].concat(raw || []).map(s => JSON.parse(s));
        const items = parseArray(req.body.items);
        const adjustments = parseArray(req.body.adjustments);
        // 3) Collect all uploaded signature files:
        //    multer put them in req.files as an array
        const files = Array.isArray(req.files)
            ? req.files
            : [];
        // now map to your public URL or relative path:
        const signatureFiles = files.map(f => `/uploads/${f.filename}`);
        // 4) Build upsert payload
        const payload = {
            baseId: base.id,
            eventType: req.body.eventType,
            claimRefNumber: req.body.claimRefNumber,
            eventDescription: req.body.eventDescription,
            productionYear: Number(req.body.productionYear),
            accidentDate: new Date(req.body.accidentDate),
            reportedDate: new Date(req.body.reportedDate),
            receivedDocDate: new Date(req.body.receivedDocDate),
            company: req.body.company,
            factory: req.body.factory,
            policyNumber: req.body.policyNumber,
            surveyorRefNumber: req.body.surveyorRefNumber,
            insurancePayout: parseFloat(req.body.insurancePayout),
            netAmount: parseFloat(req.body.netAmount),
            signatureFiles,
            items: {
                create: items.map(i => ({
                    category: i.category,
                    description: i.description,
                    total: parseFloat(String(i.total)),
                    exception: parseFloat(String(i.exception)),
                })),
            },
            adjustments: {
                create: adjustments.map(a => ({
                    type: a.type,
                    description: a.description,
                    amount: parseFloat(String(a.amount)),
                })),
            },
        };
        // 5) Upsert the CPM record
        const cpm = await prisma_1.default.fppa04CPM.upsert({
            where: { baseId: base.id },
            create: payload,
            update: {
                // if updating signatureFiles, you could merge old + new:
                signatureFiles
            },
            include: {
                items: true,
                adjustments: true,
            },
        });
        const updated = await prisma_1.default.$transaction(async (tx) => {
            // 1) update the claim status
            const upd = await tx.claim.update({
                where: { id: req.params.id },
                data: { status: client_1.ClaimStatus.PENDING_MANAGER_REVIEW },
            });
            // 2) upsert the history entry
            const existing = await tx.claimHistory.findFirst({
                where: {
                    claimId: req.params.id,
                    status: client_1.ClaimStatus.PENDING_MANAGER_REVIEW,
                },
            });
            if (existing) {
                // bump its timestamp
                await tx.claimHistory.update({
                    where: { id: existing.id },
                    data: { createdAt: new Date() },
                });
            }
            else {
                // create a fresh history record
                await tx.claimHistory.create({
                    data: {
                        claimId: req.params.id,
                        status: client_1.ClaimStatus.PENDING_MANAGER_REVIEW,
                    },
                });
            }
            return upd;
        });
        const claim = await prisma_1.default.claim.findUnique({
            where: { id: claimId },
            select: { docNum: true, categorySub: true },
        });
        const mailPayload = {
            sendFrom: "natchar@mitrphol.com",
            sendTo: [`suvimolv@mitrphol.com`],
            topic: `แจ้งอนุมัติ – Claim ${claim?.docNum}`,
            body: [
                `<p>เรียนผู้จัดการฝ่ายประกันกลุ่ม</p>`,
                `<p>เคลมเลขที่ <strong>${claim?.docNum}</strong> ได้รับการอนุมัติเรียบร้อยแล้ว</p>`,
                `<p>กรุณาตรวจสอบรายละเอียดเพิ่มเติมที่ระบบ: <a href="${process.env.FE_PORT}/fppa04/CPM/${claimId}">คลิกที่นี่</a></p>`,
            ].join("\n"),
        };
        try {
            const token = await (0, claimController_1.fetchAzureTokenEmail)();
            await axios_1.default.post("https://mitrservices-internal.mitrphol.com/utility/api/v2/email", mailPayload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY,
                    "Content-Type": "application/json",
                },
            });
            console.log("✉️ Approval notification sent to manager:");
        }
        catch (mailErr) {
            console.error("❌ Failed to send approval email:", mailErr);
        }
        res.json({ cpm });
    }
    catch (err) {
        next(err);
    }
};
exports.createFppa04Cpm = createFppa04Cpm;
// ─── Items CRUD under CPM Variant ──────────────────────────────────────────────
// POST   /api/fppa04/:id/items
const addFppa04Item = async (req, res, next) => {
    try {
        const baseId = req.params.id;
        const { category, description, total, exception } = req.body;
        const item = await prisma_1.default.fppa04ItemCPM.create({
            data: { baseId, category, description, total, exception },
        });
        res.status(201).json({ item });
    }
    catch (err) {
        next(err);
    }
};
exports.addFppa04Item = addFppa04Item;
// PATCH  /api/fppa04/:id/items/:itemId
const updateFppa04Item = async (req, res, next) => {
    try {
        const { itemId } = req.params;
        const body = req.body;
        const data = {
            ...(body.category && { category: body.category }),
            ...(body.description && { description: body.description }),
            ...(body.total !== undefined && { total: body.total }),
            ...(body.exception !== undefined && { exception: body.exception }),
        };
        const item = await prisma_1.default.fppa04ItemCPM.update({
            where: { id: itemId },
            data,
        });
        res.json({ item });
    }
    catch (err) {
        next(err);
    }
};
exports.updateFppa04Item = updateFppa04Item;
// DELETE /api/fppa04/:id/items/:itemId
const deleteFppa04Item = async (req, res, next) => {
    try {
        await prisma_1.default.fppa04ItemCPM.delete({ where: { id: req.params.itemId } });
        res.status(204).end();
    }
    catch (err) {
        next(err);
    }
};
exports.deleteFppa04Item = deleteFppa04Item;
// ─── Adjustments CRUD under CPM Variant ────────────────────────────────────────
// POST   /api/fppa04/:id/adjustments
const addFppa04Adjustment = async (req, res, next) => {
    try {
        const baseId = req.params.id;
        const { type, description, amount } = req.body;
        const adj = await prisma_1.default.fppa04AdjustmentCPM.create({
            data: { baseId, type, description, amount },
        });
        res.status(201).json({ adjustment: adj });
    }
    catch (err) {
        next(err);
    }
};
exports.addFppa04Adjustment = addFppa04Adjustment;
// PATCH  /api/fppa04/:id/adjustments/:adjId
const updateFppa04Adjustment = async (req, res, next) => {
    try {
        const { adjId } = req.params;
        const body = req.body;
        const data = {
            ...(body.type && { type: body.type }),
            ...(body.description && { description: body.description }),
            ...(body.amount !== undefined && { amount: body.amount }),
        };
        const adj = await prisma_1.default.fppa04AdjustmentCPM.update({
            where: { id: adjId },
            data,
        });
        res.json({ adjustment: adj });
    }
    catch (err) {
        next(err);
    }
};
exports.updateFppa04Adjustment = updateFppa04Adjustment;
// DELETE /api/fppa04/:id/adjustments/:adjId
const deleteFppa04Adjustment = async (req, res, next) => {
    try {
        await prisma_1.default.fppa04AdjustmentCPM.delete({ where: { id: req.params.adjId } });
        res.status(204).end();
    }
    catch (err) {
        next(err);
    }
};
exports.deleteFppa04Adjustment = deleteFppa04Adjustment;
const listFppa04 = async (req, res, next) => {
    try {
        const { categoryMain, categorySub } = req.query;
        // build a dynamic filter
        const where = {};
        if (categoryMain)
            where.mainType = categoryMain;
        if (categorySub)
            where.subType = categorySub;
        const claims = await prisma_1.default.fppa04Base.findMany({
            where,
            select: {
                claimId: true,
                // include any other fields you need, e.g. cause, createdAt
                claim: { select: { createdAt: true } },
            },
        });
        // flatten if you prefer ClaimSummary shape
        const formatted = claims.map(c => ({
            id: c.claimId,
            createdAt: c.claim.createdAt,
        }));
        res.json({ claims: formatted });
    }
    catch (err) {
        next(err);
    }
};
exports.listFppa04 = listFppa04;
