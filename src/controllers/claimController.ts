// src/controllers/claimController.ts
import type { RequestHandler } from "express";
import { Prisma, ClaimStatus, AttachmentType } from "@prisma/client";
import prisma from "../lib/prisma";
import { saveFile } from "../services/fileService";
import { addISOWeekYears, format } from "date-fns";
import { fetchAzureToken, fetchUserInfoProfile } from "./authController";
import axios from "axios";
// ─── List Claims ───────────────────────────────────────────────────────────────
export async function fetchAzureTokenEmail(): Promise<string> {
  const res = await axios.post(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID!,
      client_secret: process.env.AZURE_CLIENT_SECRET!,
      scope: "api://utility-API/.default",
      grant_type: "client_credentials",
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return res.data.access_token as string;
}

async function sendEmail(payload: any) {
  const token = await fetchAzureTokenEmail();
  await axios.post(
    process.env.EMAIL_API_URL || "https://mitrservices-internal.mitrphol.com/utility/api/v2/email",
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY!,
        "Content-Type": "application/json",
      },
    }
  );
}

export const listClaims: RequestHandler = async (req, res, next) => {
  try {
    // read our two filters (and an optional excludeStatus)
    const { userEmail, approverId, excludeStatus, categoryMain, categorySub } =
      req.query as {
        userEmail?: string;
        approverId?: string;
        excludeStatus?: string;
        categoryMain?: string;
        categorySub?: string;
      };

    // build up the Prisma `where` clause
    const where: any = {};

    if (userEmail) {
      // claims created by this email
      where.createdBy = { email: userEmail };
    }
    if (approverId) {
      // claims assigned to this approver
      where.approverId = approverId;
    }
    if (excludeStatus) {
      where.status = { not: excludeStatus };
    }
    if (categoryMain) where.categoryMain = categoryMain;
    if (categorySub) where.categorySub = categorySub;
    // fetch
    const dbClaims = await prisma.claim.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        docNum: true,
        approverId: true,
        categorySub: true,
        status: true,
        createdAt: true,
        submittedAt: true,
        insurerComment: true,
        createdBy: { select: { name: true } },
        cpmForm: { select: { cause: true } },
        categoryMain: true,
        updatedAt: true,
        history: {
          select: {
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        }, // ← include the history rows
      },
    });

    const claims = dbClaims.map((c) => {
      const statusDates: Record<string, string> = {};
      c.history.forEach((h) => {
        statusDates[h.status] = h.createdAt.toISOString();
      });

      return {
        id: c.id,
        docNum: c.docNum,
        approverId: c.approverId,
        categorySub: c.categorySub,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        submittedAt: c.submittedAt?.toISOString() ?? null,
        insurerComment: c.insurerComment,
        createdByName: c.createdBy.name,
        cause: c.cpmForm?.cause ?? null,
        updatedAt: c.updatedAt.toISOString(),
        statusDates, // ← your new timeline map
      };
    });

    res.json({ claims });
  } catch (err) {
    console.error("listClaims error:", err);
    next(err);
  }
};

// ─── Create Claim (header only) ────────────────────────────────────────────────
export const createClaim: RequestHandler = async (req, res, next) => {
  try {
    const {
      categoryMain,
      categorySub,
      approverId,
      approverEmail,
      approverPosition,
      approverDepartment: deptPayload,
      approverName,
      saveAsDraft,
      signerId,
      signerEmail,
      signerName,
      signerPosition,
    } = req.body as any;

    const approverDepartment: string =
      typeof deptPayload === "string"
        ? deptPayload
        : typeof deptPayload === "object" && deptPayload !== null
        ? deptPayload.name?.th || deptPayload.name?.en || String(deptPayload)
        : String(deptPayload);
    const createdById = req.user!.id;
    const creator = await prisma.user.findUnique({
      where: { id: createdById },
    });
    if (!creator) {
      res.status(400).json({ message: `No such user: ${createdById}` });
      return;
    }

    const createdByName = req.user!.name!;
    console.log(createdById, createdByName);
    const today = new Date();
    const ymd = format(today, "yyMMdd");
    const prefix = `${categorySub}${ymd}`;

    // count existing
    const count = await prisma.claim.count({
      where: { docNum: { startsWith: prefix } },
    });
    const seq = String(count + 1).padStart(4, "0");
    const docNum = `${prefix}${seq}`;

    // … generate docNum, count, etc …

    const claim = await prisma.claim.create({
      data: {
        docNum,
        createdById,
        createdByName,
        approverId,
        approverName: approverName,
        approverPosition: approverPosition,
        approverDepartment: approverDepartment,
        /** ← new required field: */
        approverEmail,
        signerId,
        signerEmail,
        signerName,
        signerPosition,
        status:
          saveAsDraft === "true"
            ? ClaimStatus.DRAFT
            : ClaimStatus.PENDING_APPROVER_REVIEW,
        categoryMain,
        categorySub,
        submittedAt: saveAsDraft === "true" ? null : new Date(),
      },
    });

    const existing = await prisma.claimHistory.findFirst({
      where: { claimId: claim.id, status: claim.status },
    });

    if (existing) {
      // (unlikely on a brand-new claim, but safe if you ever re-use createClaim)
      await prisma.claimHistory.update({
        where: { id: existing.id },
        data: { createdAt: new Date() },
      });
    } else {
      await prisma.claimHistory.create({
        data: { claimId: claim.id, status: claim.status },
      });
    }
    if (saveAsDraft !== "true") {
      const newClaimId = claim.id;

      // fetch the record you just made
      const db = await prisma.claim.findUnique({
        where: { id: newClaimId },
        select: {
          approverEmail: true,
          approverName: true,
          categorySub: true,
          docNum:true
        },
      });
      if (!db) throw new Error(`Claim ${newClaimId} not found`);

      const mailPayload = {
        sendFrom: "natchar@mitrphol.com",
        sendTo: [`${db.approverEmail}` ],
        topic: `แจ้งอนุมัติ – Claim ${db.docNum}`,
        body: [
          `<p>เรียน ${db.approverName}</p>`,
          `<p>มีเคลมเลขที่ <strong>${db.docNum}</strong> รอการอนุมัติ</p>`,
          `<p>กรุณาตรวจสอบรายละเอียดเพิ่มเติมที่ระบบ: <a href="${process.env.FE_PORT}/claim/claims/${categorySub?.toLowerCase()}/${newClaimId}">คลิกที่นี่</a></p>`,
        ].join("\n"),
      };
      console.log("📧 Sending mail payload:", mailPayload);

      // ↓ include protocol!
      const token = await fetchAzureTokenEmail();
        await axios.post(
          "https://mitrservices-internal.mitrphol.com/utility/api/v2/email",
          mailPayload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY!,
              "Content-Type": "application/json",
            },
          }
        );
      console.log(`✉️  Mail API responded `);
    }

    res.status(201).json({ success: true, claim });
  } catch (err) {
    console.error("createCpmForm error:", err);
    next(err);
  }
};

// ─── Get Single Claim ─────────────────────────────────────────────────────────
export const getClaim: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const claim = await prisma.claim.findUnique({
      where: { id },
      include: {
        history: {
          select: { status: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
        createdBy: { select: { name: true, id: true } },
        attachments: true,
        cpmForm: true,
        fppa04Base: {
          include: {
            cpmVariant: {
              include: { items: true, adjustments: true },
            },
          },
        },
      },
    });

    if (!claim) {
      res.status(404).json({ message: "Not found" });
      return;
    }

    // build the statusDates map
    const statusDates: Record<string, string> = {};
    claim.history.forEach((h) => {
      statusDates[h.status] = h.createdAt.toISOString();
    });

    // strip out `history` (or leave it) and return statusDates
    const { history, ...rest } = claim;
    res.json({
      claim: {
        ...rest,
        statusDates,
      },
      claimWithCause: {
        ...claim.cpmForm!,
        cause: claim.cpmForm?.cause ?? "",
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Update Claim (header + nested CPMForm upsert) ────────────────────────────
export const updateClaim: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      categoryMain,
      categorySub,
      cause,
      approverId,
      status,
      insurerComment,
    } = req.body as {
      categoryMain?: string;
      categorySub?: string;
      cause?: string;
      approverId?: string;
      status?: ClaimStatus;
      insurerComment?: string;
    };

    const data: Prisma.ClaimUpdateInput = {
      ...(categoryMain !== undefined && { categoryMain }),
      ...(categorySub !== undefined && { categorySub }),
      ...(status !== undefined && { status }),
      ...(typeof insurerComment === "string" && { insurerComment }),
    };

    if (approverId) {
      const approver = await prisma.user.findUnique({
        where: { id: approverId },
        select: { name: true, position: true, department: true },
      });
      if (!approver) {
        res.status(400).json({ message: "Approver not found" });
        return;
      }
      Object.assign(data, {
        approverId,
        approverName: approver.name,
        approverPosition: approver.position,
        approverDepartment: approver.department,
      });
    }

    if (cause !== undefined) {
      data.cpmForm = {
        upsert: {
          create: {
            accidentDate: new Date(), // replace with actual values if needed
            accidentTime: "00:00",
            location: "",
            cause,
            damageOwnType: "", // Provide a default or actual value as required
          },
          update: { cause },
        },
      };
    }

    const updatedClaim = await prisma.claim.update({
      where: { id },
      data,
      include: { cpmForm: true },
    });
    /* if (status === ClaimStatus.PENDING_APPROVER_REVIEW) {
      // 1) fetch Azure AD token
      const azureToken = await fetchAzureToken();

      // 2) Look up the fresh approver info
      const db = await prisma.claim.findUnique({
        where: { id },
        select: {
          approverEmail: true,
          approverName: true,
          categorySub: true,
          docNum:true
        },
      });
      if (!db) throw new Error(`Claim ${id} not found`);
      if (!db.categorySub) throw new Error(`Claim ${id} has no subcategory`);

      const sub = db.categorySub.toLowerCase();
      const link = `${process.env.FE_PORT}/claims/${sub}/${id}`;
      // 4) Compose and send the mail
      
      const mailPayload = {
        sendFrom: "J.Waitin@mitrphol.com",
        sendTo: ["J.Waitin@mitrphol.com" approverEmail ],
        topic: `แจ้งอนุมัติ – Claim ${db.docNum}`,
        body: [
          `<p>เรียน${db.approverName}</p>`,
          `<p>มีเคลมเลขที่ <strong>${db.docNum}</strong> รอการอนุมัติ</p>`,
          `<p>กรุณาตรวจสอบรายละเอียดเพิ่มเติมที่ระบบ: <a href="${process.env.FE_PORT}/claims/${categorySub?.toLowerCase()}/${id}">คลิกที่นี่</a></p>`,
        ].join("\n"),
      };
      console.log("📧 Sending mail payload:", mailPayload);

      const token = await fetchAzureTokenEmail();
        await axios.post(
          "https://mitrservices-internal.mitrphol.com/utility/api/v2/email",
          mailPayload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY!,
              "Content-Type": "application/json",
            },
          }
        );
    } */

    // 5) Return
    res.json({ claim: updatedClaim });
  } catch (err) {
    next(err);
  }
};

// ─── Insurance Actions ────────────────────────────────────────────────────────
export const claimAction: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role !== "INSURANCE") {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const { id } = req.params;
    const { action, comment } = req.body as {
      action: string;
      comment?: string;
    };

    // Determine new claim status based on action
    let newStatus: ClaimStatus;
    switch (action) {
      case "approve":
        newStatus = ClaimStatus.PENDING_INSURER_FORM;
        break;
      case "reject":
        newStatus = ClaimStatus.REJECTED;
        break;
      case "request_evidence":
        newStatus = ClaimStatus.AWAITING_EVIDENCE;
        break;
      default:
        res.status(400).json({ message: "Unknown action" });
        return;
    }

    // Atomically update claim and history
    const updatedClaim = await prisma.$transaction(async (tx) => {
      // a) update claim
      const c = await tx.claim.update({
        where: { id },
        data: {
          status: newStatus,
          ...(comment && { insurerComment: comment }),
        },
        include: { attachments: true },
      });

      // b) upsert history row
      const existing = await tx.claimHistory.findFirst({
        where: { claimId: id, status: newStatus },
      });
      if (existing) {
        await tx.claimHistory.update({
          where: { id: existing.id },
          data: { createdAt: new Date() },
        });
      } else {
        await tx.claimHistory.create({
          data: { claimId: id, status: newStatus },
        });
      }

      return c;
    });

    const { createdByName, approverEmail, docNum, categorySub } = updatedClaim;

    // On approval: notify the manager
   

      // On rejection or evidence request: notify creator and CC approver
     if (action === "reject" || action === "request_evidence") {
      // Lookup creator user by name (not unique) using first match
      const creator = await prisma.user.findFirst({
        where: { name: createdByName },
        select: { email: true, name: true },
      });
      if (creator) {
        const mailPayload = {
          sendFrom: "natchar@mitrphol.com"/* natchar@mitrphol.com */,
          sendTo: [`${creator.email}` /*creator.email*/],
          sendCC: [`${approverEmail}` /*approverEmail*/],
          topic:
            action === "request_evidence"
              ? `ขอเอกสารเพิ่มเติม – Claim ${docNum}`
              : `แจ้งผลการปฏิเสธ – Claim ${docNum}`,
          body: [
            `<p>เรียน ${creator.name}</p>`,
            comment ? `<p>ความคิดเห็น: ${comment}</p>` : "",
            `<p>สถานะล่าสุดของเคลมเลขที่ <strong>${docNum}</strong> คือ <em>${newStatus}</em></p>`,
            `<p>กรุณาตรวจสอบเพิ่มเติมที่ระบบ: <a href="${process.env.FE_PORT}/claim/claims/${categorySub?.toLowerCase()}/${id}">คลิกที่นี่</a></p>`,
          ]
            .filter(Boolean)
            .join("\n"),
        };

        try {
          const token = await fetchAzureTokenEmail();
        await axios.post(
          "https://mitrservices-internal.mitrphol.com/utility/api/v2/email",
          mailPayload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY!,
              "Content-Type": "application/json",
            },
          }
        );
          console.log(
            `✉️ Notification email sent to creator (${creator.email}) CC approver (${approverEmail})`
          );
        } catch (mailErr) {
          console.error("❌ Failed to send notification email:", mailErr);
        }
      }
    }

    res.json({ claim: updatedClaim });
    return;
  } catch (err) {
    next(err);
  }
};

// ─── Manager Actions ──────────────────────────────────────────────────────────
export const ManagerAction: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, comment } = req.body as {
      action: "approve" | "reject";
      comment?: string;
    };
    const newStatus =
      action === "approve"
        ? ClaimStatus.PENDING_USER_CONFIRM
        : ClaimStatus.PENDING_INSURER_REVIEW;
    
    const updatedClaim = await prisma.$transaction(async (tx) => {
      // 1) update the claim’s status & comment
      const updated = await tx.claim.update({
        where: { id },
        data: {
          status: newStatus,
          insurerComment: comment,
        },
      });

      // 2) find existing history entry for this (claimId, status)
      const existingHist = await tx.claimHistory.findFirst({
        where: { claimId: id, status: newStatus },
      });

      if (existingHist) {
        // bump its timestamp
        await tx.claimHistory.update({
          where: { id: existingHist.id },
          data: { createdAt: new Date() },
        });
      } else {
        // insert a fresh history record
        await tx.claimHistory.create({
          data: { claimId: id, status: newStatus },
        });
      }

      return updated;
    });

    const { createdByName, approverEmail, docNum, categorySub } = updatedClaim;

    if (action === "approve") {
      const user = await prisma.user.findFirst({
        where: { name: createdByName },
        select: { email: true, name: true },
      });
      if (user) {
        const mailPayload = {
          sendFrom: "natchar@mitrphol.com"/* natchar@mitrphol.com */,
          sendTo: [`${user.email}`/* user.email */],
          sendCC: ["MP_GroupInsurance@mitrphol.com"/* MP_GroupInsurance@mitrphol.com */],
          topic: `ผู้จัดการอนุมัติ – Claim ${docNum}`,
          body: [
            `<p>เรียน ${user.name}</p>`,
            `<p>เคลมเลขที่ <strong>${docNum}</strong> ได้รับการอนุมัติจากผู้จัดการแล้ว</p>`,
            `<p>กรุณายืนยันข้อมูลที่ระบบ: <a href=\"${process.env.FE_PORT}/claim/fppa04/${categorySub}/${id}\">คลิกที่นี่</a></p>`,
          ].filter(Boolean).join("\n"),
        };
        try {
          await sendEmail(mailPayload);
          console.log("✉️ Manager approval email sent to user:", user.email);
        } catch (mailErr) {
          console.error("❌ Failed to send manager approval email:", mailErr);
        }
      }
    } else {
      // manager rejected: notify insurance only
      const mailPayload = {
        sendFrom: "natchar@mitrphol.com"/* natchar@mitrphol.com */,
        sendTo: ["MP_GroupInsurance@mitrphol.com"/* MP_GroupInsurance@mitrphol.com */],
        topic: `ผู้จัดการปฏิเสธ – Claim ${docNum}`,
        body: [
          `<p>เรียน ทีมประกัน</p>`,
          `<p>เคลมเลขที่ <strong>${docNum}</strong> ถูกปฏิเสธโดยผู้จัดการ</p>`,
          comment ? `<p>ความคิดเห็น: ${comment}</p>` : "",
          `<p>กรุณาตรวจสอบที่ระบบ: <a href=\"${process.env.FE_PORT}/claim/fppa04/${categorySub}/${id}\">คลิกที่นี่</a></p>`,
        ].filter(Boolean).join("\n"),
      };
      try {
        await sendEmail(mailPayload);
        console.log("✉️ Manager rejection email sent to insurance:", approverEmail);
      } catch (mailErr) {
        console.error("❌ Failed to send manager rejection email:", mailErr);
      }
    }

    res.json({ claim: updatedClaim });
  } catch (err) {
    next(err);
  }
};

// ─── Create CPM Form ──────────────────────────────────────────────────────────

export const createCpmForm: RequestHandler = async (req, res, next) => {
  try {
    const { claimId } = req.params;
    const now = new Date();
    if (!req.files) {
      res.status(400).json({ message: "No files uploaded" });
      return;
    }

    // Helper to normalize express-fileupload fields into an array
    const toArray = (x: any): any[] => (Array.isArray(x) ? x : x ? [x] : []);

    const damageFiles = toArray((req.files as any).damageFiles);
    const estimateFiles = toArray((req.files as any).estimateFiles);
    const otherFiles = toArray((req.files as any).otherFiles);
    const dateStamp = format(now, "yyyyMMddHHmmss");
    // First, create the CPMForm record
    const {
      phoneNum,
      accidentDate,
      accidentTime,
      location,
      cause,
      repairShop,
      repairShopLocation,
      policeDate,
      policeTime,
      policeStation,
      damageOwnType,
      damageOtherOwn,
      damageDetail,
      damageAmount,
      victimDetail,
      partnerName,
      partnerPhone,
      partnerLocation,
      partnerDamageDetail,
      partnerDamageAmount,
      partnerVictimDetail,
    } = req.body as Record<string, string>;

    await prisma.cPMForm.create({
      data: {
        claimId,
        accidentDate: new Date(accidentDate),
        accidentTime,
        location,
        cause,
        phoneNum: phoneNum || undefined,
        repairShop: repairShop || null,
        repairShopLocation: repairShopLocation || null,
        policeDate: policeDate ? new Date(policeDate) : undefined,
        policeTime: policeTime || undefined,
        policeStation: policeStation || undefined,
        damageOwnType,
        damageOtherOwn: damageOtherOwn || undefined,
        damageDetail: damageDetail || undefined,
        damageAmount: damageAmount ? parseFloat(damageAmount) : undefined,
        victimDetail: victimDetail || undefined,
        partnerName: partnerName || undefined,
        partnerPhone: partnerPhone || undefined,
        partnerLocation: partnerLocation || undefined,
        partnerDamageDetail: partnerDamageDetail || undefined,
        partnerDamageAmount: partnerDamageAmount
          ? parseFloat(partnerDamageAmount)
          : undefined,
        partnerVictimDetail: partnerVictimDetail || undefined,
      },
    });

    // Next, process and save attachments
    // Log each uploaded file object
    damageFiles.forEach((f) => console.log("Uploaded damage file object:", f));
    estimateFiles.forEach((f) =>
      console.log("Uploaded estimate file object:", f)
    );
    otherFiles.forEach((f) => console.log("Uploaded other file object:", f));

    // inside createCpmForm, after you've saved the CPM form...
    const attachCreates = [
      // DAMAGE_IMAGE
      ...damageFiles.map((f) => ({
        id: `${claimId}-${dateStamp}-D${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        claimId,
        type: "DAMAGE_IMAGE" as const,
        // reinterpret the raw JS string (which was decoded as latin1) as UTF-8
        fileName: Buffer.from(f.originalname, "latin1").toString("utf8"),
        url: saveFile(f),
      })),
      // ESTIMATE_DOC
      ...estimateFiles.map((f) => ({
        id: `${claimId}-${dateStamp}-E${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        claimId,
        type: "ESTIMATE_DOC" as const,
        fileName: Buffer.from(f.originalname, "latin1").toString("utf8"),
        url: saveFile(f),
      })),
      // OTHER_DOCUMENT
      ...otherFiles.map((f) => ({
        id: `${claimId}-${dateStamp}-O${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        claimId,
        type: "OTHER_DOCUMENT" as const,
        fileName: Buffer.from(f.originalname, "latin1").toString("utf8"),
        url: saveFile(f),
      })),
    ];

    if (attachCreates.length) {
      await prisma.attachment.createMany({
        data: attachCreates,
      });
    }

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── Update CPMForm ──────────────────────────────────────────────────────────

export const updateCpmForm: RequestHandler = async (req, res, next) => {
  try {
    const { claimId } = req.params;
    const now = new Date();

    // Must have at least some form data
    if (!req.body) {
      res.status(400).json({ message: "No form data" });
      return;
    }

    // Normalize files into arrays
    const toArray = (x: any): Express.Multer.File[] =>
      Array.isArray(x) ? x : x ? [x] : [];
    const damageFiles = toArray((req.files as any).damageFiles);
    const estimateFiles = toArray((req.files as any).estimateFiles);
    const otherFiles = toArray((req.files as any).otherFiles);

    // Destructure & parse the incoming fields
    const {
      phoneNum,
      accidentDate,
      accidentTime,
      location,
      cause,
      repairShop,
      repairShopLocation,
      policeDate,
      policeTime,
      policeStation,
      damageOwnType,
      damageOtherOwn,
      damageDetail,
      damageAmount,
      victimDetail,
      partnerName,
      partnerPhone,
      partnerLocation,
      partnerDamageDetail,
      partnerDamageAmount,
      partnerVictimDetail,
    } = req.body as Record<string, string>;

    // 1) Update the CPMForm row
    await prisma.cPMForm.update({
      where: { claimId },
      data: {
        accidentDate: new Date(accidentDate),
        accidentTime,
        location,
        cause,
        phoneNum: phoneNum || undefined,
        repairShop: repairShop || null,
        repairShopLocation: repairShopLocation || null,
        policeDate: policeDate ? new Date(policeDate) : null,
        policeTime: policeTime || null,
        policeStation: policeStation || null,
        damageOwnType,
        damageOtherOwn:
          damageOwnType === "other" ? damageOtherOwn || null : null,
        damageDetail: damageDetail || null,
        damageAmount: damageAmount ? parseFloat(damageAmount) : null,
        victimDetail: victimDetail || null,
        partnerName: partnerName || null,
        partnerPhone: partnerPhone || null,
        partnerLocation: partnerLocation || null,
        partnerDamageDetail: partnerDamageDetail || null,
        partnerDamageAmount: partnerDamageAmount
          ? parseFloat(partnerDamageAmount)
          : null,
        partnerVictimDetail: partnerVictimDetail || null,
      },
    });

    // 2) Prepare new attachment records
    const dateStamp = format(now, "yyyyMMddHHmmss");
    const attachCreates = [
      // DAMAGE_IMAGE
      ...damageFiles.map((f) => ({
        id: `${claimId}-${dateStamp}-D${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        claimId,
        type: "DAMAGE_IMAGE" as const,
        // reinterpret the raw JS string (which was decoded as latin1) as UTF-8
        fileName: Buffer.from(f.originalname, "latin1").toString("utf8"),
        url: saveFile(f),
      })),
      // ESTIMATE_DOC
      ...estimateFiles.map((f) => ({
        id: `${claimId}-${dateStamp}-E${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        claimId,
        type: "ESTIMATE_DOC" as const,
        fileName: Buffer.from(f.originalname, "latin1").toString("utf8"),
        url: saveFile(f),
      })),
      // OTHER_DOCUMENT
      ...otherFiles.map((f) => ({
        id: `${claimId}-${dateStamp}-O${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        claimId,
        type: "OTHER_DOCUMENT" as const,
        fileName: Buffer.from(f.originalname, "latin1").toString("utf8"),
        url: saveFile(f),
      })),
    ];

    // 3) Bulk insert any new attachments
    if (attachCreates.length) {
      await prisma.attachment.createMany({ data: attachCreates });
    }
    const saveAsDraft = req.body.saveAsDraft === "true";
    if (!saveAsDraft) {
      const updatedClaim = await prisma.claim.update({
        where: { id: claimId },
        data: {
          status: ClaimStatus.PENDING_APPROVER_REVIEW,
          submittedAt: now,
        },
      });

      // 5) Record into claimHistory
      const existingHistory = await prisma.claimHistory.findFirst({
        where: { claimId: updatedClaim.id, status: updatedClaim.status },
      });
      if (existingHistory) {
        await prisma.claimHistory.update({
          where: { id: existingHistory.id },
          data: { createdAt: now },
        });
      } else {
        await prisma.claimHistory.create({
          data: { claimId: updatedClaim.id, status: updatedClaim.status },
        });
      }
      
      const db = await prisma.claim.findUnique({
        where: { id: claimId },
        select: {
          approverEmail: true,
          approverName: true,
          categorySub: true,
          docNum:true,
        },
      });
      if (!db) throw new Error(`Claim ${claimId} not found`);
      if (!db.categorySub) {
        // either throw or default
        throw new Error(`Claim ${claimId} missing subcategory`);
      }
      
      const link = `${process.env.FE_PORT}/claim/claims/${db.categorySub?.toLowerCase()}/${claimId}`;
      const mailPayload = {
        sendFrom: "natchar@mitrphol.com"/* natchar@mitrphol.com */,
        sendTo: [`${db.approverEmail}` /* approverEmail */ ],
        topic: `แจ้งอนุมัติ – Claim ${db.docNum}`,
        body: [
          `<p>เรียน${db.approverName}</p>`,
          `<p>มีเคลมเลขที่ <strong>${db.docNum}</strong> รอการอนุมัติ</p>`,
          `<p>กรุณาตรวจสอบรายละเอียดเพิ่มเติมที่ระบบ: <a href="${process.env.FE_PORT}/claim/claims/${db.categorySub?.toLowerCase()}/${claimId}">คลิกที่นี่</a></p>`,
        ].join("\n"),
      };
      console.log("📧 Sending mail payload:", mailPayload);

      const token = await fetchAzureTokenEmail();
        await axios.post(
          "https://mitrservices-internal.mitrphol.com/utility/api/v2/email",
          mailPayload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY!,
              "Content-Type": "application/json",
            },
          }
        );
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
// ─── Approver approve/reject ──────────────────────────────────────────────────────────
export const approverAction: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, comment } = req.body as {
      action: "approve" | "reject";
      comment?: string;
    };

    let newStatus: ClaimStatus;
    switch (action) {
      case "approve":
        newStatus = ClaimStatus.PENDING_INSURER_REVIEW;
        break;
      case "reject":
        newStatus = ClaimStatus.REJECTED;
        break;
      default:
        res.status(400).json({ message: "Unknown action" });
        return;
    }

    // transaction: update + history
   const updated = await prisma.$transaction(async (tx) => {
      // 1) update the claim
      const u = await tx.claim.update({
        where: { id },
        data: {
          status: newStatus,
          ...(comment && { insurerComment: comment }),
        },
      });

      // 2) see if we already have a history row for this (claimId + status)
      const existing = await tx.claimHistory.findFirst({
        where: { claimId: id, status: newStatus },
      });

      if (existing) {
        // bump its timestamp
        await tx.claimHistory.update({
          where: { id: existing.id },
          data: { createdAt: new Date() },
        });
      } else {
        // create a brand‐new history entry
        await tx.claimHistory.create({
          data: { claimId: id, status: newStatus },
        });
      }

      return u;
    });

    if (action === "approve") {
      //    — lookup the claim's signer email & name & subcategory

      // สร้างลิงก์เชิญทีมประกันภัยมาเช็ค
      const link = `${process.env.FE_PORT}/claim/claims/${updated.categorySub?.toLowerCase()}/${id}`;

      const mailPayload = {
        sendFrom: "natchar@mitrphol.com"/* natchar@mitrphol.com */,
        sendTo: ["MP_GroupInsurance@mitrphol.com"], //"MP_GroupInsurance@mitrphol.com",         // ส่งถึงทีมประกันภัยทั้งทีม
        topic: "มีเคลมรอตรวจสอบโดยทีมประกันภัย",
        body: [
          `<p>เรียน ทีมประกันภัย</p>`,
          `<p>มีเคลมเลขที่ <strong>${updated.docNum}</strong> รอการตรวจสอบจากทีมท่าน</p>`,
          `<p>กรุณาตรวจสอบที่ลิงก์นี้: <a href="${link}">คลิกที่นี่</a></p>`,
        ].join("\n"),
      };

      try {
        const token = await fetchAzureTokenEmail();
        await axios.post(
          "https://mitrservices-internal.mitrphol.com/utility/api/v2/email",
          mailPayload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY!,
              "Content-Type": "application/json",
            },
          }
        );
      } catch (mailErr) {
        console.error(
          "❌ Failed to send insurance team notification:",
          mailErr
        );
      }
    }

    // 4) finally respond
    res.json({ claim: updated });
  } catch (err) {
    next(err);
  }
};

// ─── Update Signer ──────────────────────────────────────────────────────────

export const updateSigner: RequestHandler = async (req, res, next) => {
  const { id } = req.params;
  const { signerId, signerEmail, signerName, signerPosition } = req.body as {
    signerId?: string;
    signerEmail?: string;
    signerName?: string;
    signerPosition?: string;
  };

  // only INSURANCE users in PENDING_INSURER_REVIEW should hit this,
  // you can also check req.user!.role or the claim.status here if you like

  if (!signerId || !signerEmail || !signerName || !signerPosition) {
    res.status(422).json({
      message: "Must provide signerId, signerEmail, signerName, signerPosition",
    });
    return;
  }

  try {
    const updated = await prisma.claim.update({
      where: { id },
      data: {
        signerId,
        signerEmail,
        signerName,
        signerPosition,
      },
    });
    res.json({ claim: updated });
  } catch (err) {
    console.error("updateSigner error:", err);
    next(err);
  }
};

export const userConfirm: RequestHandler = async (req, res, next) => {
  console.log("→ [userConfirm] invoked", { body: req.body, files: req.files });
  try {
    const { action, comment } = req.body as {
      action: "confirm" | "reject";
      comment?: string;
    };

    // now req.files is an array of Multer.File
    const files = (req.files as Express.Multer.File[]) || [];
    const creates = files.map((f) => ({
      id: `${req.params.id}-${Date.now()}-U${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      claimId: req.params.id,
      type: AttachmentType.USER_CONFIRM_DOC,
      fileName: Buffer.from(f.originalname, "latin1").toString("utf8"),
      url: saveFile(f),
    }));

    if (creates.length) {
      await prisma.attachment.createMany({ data: creates });
    }

    const newStatus =
      action === "confirm"
        ? ClaimStatus.COMPLETED
        : ClaimStatus.PENDING_INSURER_REVIEW;

    // 3) Update claim + history in a transaction
    await prisma.$transaction(async (tx) => {
  // 1) Update the claim
  await tx.claim.update({
    where: { id: req.params.id },
    data: {
      status: newStatus,
      ...(action === "reject" && { insurerComment: comment }),
    },
  });

  // 2) Upsert the history row for (claimId, status)
  const existing = await tx.claimHistory.findFirst({
    where: { claimId: req.params.id, status: newStatus },
  });

  if (existing) {
    // just bump the timestamp on the existing row
    await tx.claimHistory.update({
      where: { id: existing.id },
      data: { createdAt: new Date() },
    });
  } else {
    // create a fresh history entry
    await tx.claimHistory.create({
      data: { claimId: req.params.id, status: newStatus },
    });
  }
});


    const claim = await prisma.claim.findUnique({ where: { id: req.params.id }, select: { approverEmail: true, categorySub: true, docNum: true } });
    if (claim) {
      const linkUrl = action === "confirm"
        ? `${process.env.FE_PORT}/claim/download`
        : `${process.env.FE_PORT}/claim/fppa04/${claim.categorySub}/${req.params.id}`;
      const subjectAction = action === "confirm" ? "ผู้ใช้ยืนยัน" : "ผู้ใช้ปฏิเสธ";
      const bodyAction = action === "confirm"
        ? `<p>ผู้ใช้ยืนยันเคลมเลขที่ <strong>${claim.docNum}</strong> เรียบร้อยแล้ว</p>`
        : `<p>ผู้ใช้ปฏิเสธเคลมเลขที่ <strong>${claim.docNum}</strong></p>`;
      const mailPayload = {
        sendFrom: "natchar@mitrphol.com"/* natchar@mitrphol.com */,
        sendTo: ["MP_GroupInsurance@mitrphol.com"/* MP_GroupInsurance@mitrphol.com */],
        topic: `${subjectAction} – Claim ${claim.docNum}`,
        body: [
          `<p>เรียน ทีมประกัน</p>`,
          bodyAction,
          `<p>กรุณาตรวจสอบที่ระบบ: <a href="${linkUrl}">คลิกที่นี่</a></p>`
        ].join(""),
      };
      try {
        await sendEmail(mailPayload);
        console.log("✉️ Sent user action email to insurance team");
      } catch (e) {
        console.error("❌ Failed to send user action email:", e);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("userConfirm error:", err);
    next(err);
  }
}


// ─── List Attachments by Claim ─────────────────────────────────────────────
export const listAttachments: RequestHandler = async (req, res, next) => {
  const claimId = req.params.id;
  console.log(claimId);
  try {
    const attachments = await prisma.attachment.findMany({
      where: { claimId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        fileName: true, // matches your Prisma schema
        url: true, // matches your Prisma schema
        uploadedAt: true, // when it was uploaded
        type: true,
        claimId: true,
      },
    });
    // send back only this claim’s attachments
    res.json(attachments);
    console.log(attachments);
  } catch (err: any) {
    console.error("listAttachments error:", err);
    res.status(500).json({ message: "ไม่สามารถโหลดไฟล์ได้" });
  }
};

// ─── UpLoad File ──────────────────────────────────────────────────────────

export const uploadAttachments: RequestHandler = async (
  req,
  res,
  next
): Promise<void> => {
  try {
    const claimId = req.params.id;
    const files = (req.files as Express.Multer.File[]) || [];

    if (!files.length) {
      res.status(400).json({ message: "No files uploaded" });
      return; // <-- early exit with void
    }

    const now = Date.now();
    const creates = files.map((f, idx) => ({
      id: `${claimId}-${now}-${idx}`,
      claimId,
      type: AttachmentType.INSURANCE_DOC,
      fileName: Buffer.from(f.originalname, "latin1").toString("utf8"),
      url: saveFile(f),
      uploadedAt: new Date(),
    }));

    await prisma.attachment.createMany({ data: creates });

    const newAttachments = await prisma.attachment.findMany({
      where: { claimId },
      orderBy: { uploadedAt: "asc" },
    });

    // **DO NOT return this**—just call it, then end the function
    res.json(newAttachments);
    // function returns void here
  } catch (err) {
    console.error("uploadAttachments error:", err);
    next(err);
  }
};
export const handleSearch: RequestHandler = async (req, res, next) => {
  try {
    const { categoryMain, categorySub, excludeStatus, userEmail } = req.query;
    if (
      typeof categoryMain !== "string" ||
      typeof categorySub !== "string"
    ) {
      res.status(400).json({ message: "Missing categoryMain or categorySub" });
      return;
    }

    // build the where filter
    const where: any = {
      categoryMain,
      categorySub,
      // exclude a status
      ...(excludeStatus
        ? { status: { not: excludeStatus } }
        : {}),
      // if userEmail supplied, filter via the relation:
      ...(typeof userEmail === "string"
        ? { createdBy: { email: userEmail } }
        : {}),
    };

    const results = await prisma.claim.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    res.json(results);
    return;
  } catch (err) {
    next(err);
    return;
  }
};



