// src/controllers/fppa04Controller.ts
import type { RequestHandler } from "express";
import { Prisma, ClaimStatus, AttachmentType } from "@prisma/client";
import prisma from "../lib/prisma";
import axios from "axios";
import { fetchAzureTokenEmail } from "./claimController";
import { saveFile } from "../services/fileService" // import path อาจต่างไป
// ─── Create FPPA-04 Base ───────────────────────────────────────────────────────
export const createFppa04Base: RequestHandler = async (req, res, next) => {
  try {
    const { claimId, categoryMain, categorySub } = req.body as {
      claimId: string
      categoryMain: string
      categorySub: string
    }
    //console.log(claimId,categoryMain,categorySub)
    if (!claimId || !categoryMain || !categorySub) {
      res.status(400).json({ message: 'claimId, categoryMain and categorySub are required' });
      return;
    }

    const base = await prisma.fppa04Base.upsert({
      where: { claimId },
      create: {
        claimId,
        mainType: categoryMain,
        subType:  categorySub,
      },
      update: {
        // if you ever want to allow changing categoryMain/Sub on an existing record,
        // put those fields here.  Otherwise, leave this empty to just leave the existing row untouched:
      },
    });
    
    res.status(200).json({ base });
    return;
  } catch (err) {
    next(err);
  }
}

// ─── Get FPPA-04 Base (with CPM variant) ──────────────────────────────────────
export const getFppa04Base: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params  // this is the claimId (not the auto-PK of the base)
    const base = await prisma.fppa04Base.findUnique({
      where: { claimId: id },
      include: {
        claim: {
          select: {
            docNum:true,
            cpmForm: { select: { cause: true } },
            id:           true,
            approverName: true,
            signerName:true,
            status:       true,
            categoryMain: true,
            categorySub:  true,
          }
        },
        cpmVariant: {
          include: {
            items:       true,
            adjustments: true,
          }
        }
      }
    })

    if (!base) {
      res.status(404).json({ message: "FPPA-04 base not found" })
      return
    }

    // even if base.cpmVariant is null, we return it as `form: null`
    res.json({
      form:  base.cpmVariant,   // may be null on brand-new
      claim: base.claim
    })
  } catch (err) {
    next(err)
  }
}

// ─── Update FPPA-04 Base ───────────────────────────────────────────────────────
export const updateFppa04Base: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mainType, subType } = req.body as {
      mainType?: string;
      subType?: string;
    };

    const data: Prisma.Fppa04BaseUpdateInput = {
      ...(mainType !== undefined && { mainType }),
      ...(subType  !== undefined && { subType }),
    };

    const updated = await prisma.fppa04Base.update({
      where: { id },
      data,
    });
    res.json({ base: updated });
  } catch (err) {
    next(err);
  }
};

// ─── Create / Update CPM Variant ───────────────────────────────────────────────
// POST   /api/fppa04/:id/cpm
export const createFppa04Cpm: RequestHandler = async (req, res, next) => {
  try {
    const claimId = req.params.id;
    
    // 1) Look up the base record
    const base = await prisma.fppa04Base.findUnique({
      where: { claimId },
      select: { id: true },
    });
    if (!base) {
      res.status(404).json({ message: "FPPA-04 base not found" });
      return;
    }

    // 2) Parse items & adjustments (JSON-encoded arrays)
    const parseArray = <T>(raw: any): T[] =>
      ([] as any[]).concat(raw || []).map(s => JSON.parse(s) as T);

    const items = parseArray<{
      category: string;
      description: string;
      total: number | string;
      exception: number | string;
    }>(req.body.items);

    const adjustments = parseArray<{
      type: string;
      description: string;
      amount: number | string;
    }>(req.body.adjustments);

    // 3) Collect all uploaded signature files:
    //    multer put them in req.files as an array
    const files = Array.isArray(req.files)
      ? (req.files as Express.Multer.File[])
      : [];
      const signatureFiles = files.map(saveFile);
    // now map to your public URL or relative path:

    // 4) Build upsert payload
    const payload = {
      baseId:            base.id,
      eventType:         req.body.eventType,
      claimRefNumber:    req.body.claimRefNumber,
      eventDescription:  req.body.eventDescription,
      productionYear:    Number(req.body.productionYear),
      accidentDate:      new Date(req.body.accidentDate),
      reportedDate:      new Date(req.body.reportedDate),
      receivedDocDate:   new Date(req.body.receivedDocDate),
      company:           req.body.company,
      factory:           req.body.factory,
      policyNumber:      req.body.policyNumber,
      surveyorRefNumber: req.body.surveyorRefNumber,
      insurancePayout:         parseFloat(req.body.insurancePayout),
      netAmount:         parseFloat(req.body.netAmount),
      signatureFiles, 
      items: {
        create: items.map(i => ({
          category:    i.category,
          description: i.description,
          total:       parseFloat(String(i.total)),
          exception:   parseFloat(String(i.exception)),
        })),
      },
      adjustments: {
        create: adjustments.map(a => ({
          type:        a.type,
          description: a.description,
          amount:      parseFloat(String(a.amount)),
        })),
      },
    };

    // 5) Upsert the CPM record
    const cpm = await prisma.fppa04CPM.upsert({
  where: { baseId: base.id },
  create: {
    // 1) instead of specifying baseId: base.id, connect the relation:
    base: { connect: { id: base.id } },

    // 2) then spread in all your other fields from payload—*excluding* baseId
    eventType:        payload.eventType,
    claimRefNumber:   payload.claimRefNumber,
    eventDescription: payload.eventDescription,
    productionYear:   payload.productionYear,
    accidentDate:     payload.accidentDate,
    reportedDate:     payload.reportedDate,
    receivedDocDate:  payload.receivedDocDate,
    company:          payload.company,
    factory:          payload.factory,
    policyNumber:     payload.policyNumber,
    surveyorRefNumber:payload.surveyorRefNumber,
    insurancePayout:  payload.insurancePayout,
    netAmount:        payload.netAmount,
    signatureFiles:   payload.signatureFiles,

    items: {
      create: payload.items.create.map(i => ({
        category:    i.category,
        description: i.description,
        total:       i.total,
        exception:   i.exception,
      })),
    },
    adjustments: {
      create: payload.adjustments.create.map(a => ({
        type:        a.type,
        description: a.description,
        amount:      a.amount,
      })),
    },
  },
  update: {
    signatureFiles,
  },
  include: {
    items:       true,
    adjustments: true,
  },
});
    const updated = await prisma.$transaction(async (tx) => {
  // 1) update the claim status
  const upd = await tx.claim.update({
    where: { id: req.params.id },
    data: { status: ClaimStatus.PENDING_MANAGER_REVIEW },
  });

  // 2) upsert the history entry
  const existing = await tx.claimHistory.findFirst({
    where: {
      claimId: req.params.id,
      status: ClaimStatus.PENDING_MANAGER_REVIEW,
    },
  });

  if (existing) {
    // bump its timestamp
    await tx.claimHistory.update({
      where: { id: existing.id },
      data: { createdAt: new Date() },
    });
  } else {
    // create a fresh history record
    await tx.claimHistory.create({
      data: {
        claimId: req.params.id,
        status: ClaimStatus.PENDING_MANAGER_REVIEW,
      },
    });
  }

  return upd;
});
    
     const claim = await prisma.claim.findUnique({
  where: { id: claimId },
  select: { docNum: true, categorySub: true},
});
      const mailPayload = {
        sendFrom: "natchar@mitrphol.com",
        sendTo: [`suvimolv@mitrphol.com`],//suvimolv@mitrphol.com
        topic: `แจ้งอนุมัติ – Claim ${claim?.docNum}`,
        body: [
          `<p>เรียนผู้จัดการฝ่ายประกันกลุ่ม</p>`,
          `<p>เคลมเลขที่ <strong>${claim?.docNum}</strong> ได้รับการอนุมัติเรียบร้อยแล้ว</p>`,
          `<p>กรุณาตรวจสอบรายละเอียดเพิ่มเติมที่ระบบ: <a href="${process.env.FE_PORT}/claim/fppa04/CPM/${claimId}">คลิกที่นี่</a></p>`,
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
        //console.log("✉️ Approval notification sent to manager:");
      } catch (mailErr) {
        console.error("❌ Failed to send approval email:", mailErr);
      }
    res.json({ cpm });
  } catch (err) {
    next(err);
  }
};




// ─── Items CRUD under CPM Variant ──────────────────────────────────────────────
// POST   /api/fppa04/:id/items
export const addFppa04Item: RequestHandler = async (req, res, next) => {
  try {
    const baseId = req.params.id;
    const { category, description, total, exception } = req.body as {
      category: string;
      description: string;
      total: number;
      exception: number;
    };
    const item = await prisma.fppa04ItemCPM.create({
      data: { baseId, category, description, total, exception },
    });
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
};

// PATCH  /api/fppa04/:id/items/:itemId
export const updateFppa04Item: RequestHandler = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const body = req.body as Partial<{
      category: string;
      description: string;
      total: number;
      exception: number;
    }>;
    const data: Prisma.Fppa04ItemCPMUpdateInput = {
      ...(body.category    && { category: body.category }),
      ...(body.description && { description: body.description }),
      ...(body.total       !== undefined && { total: body.total }),
      ...(body.exception   !== undefined && { exception: body.exception }),
    };
    const item = await prisma.fppa04ItemCPM.update({
      where: { id: itemId },
      data,
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/fppa04/:id/items/:itemId
export const deleteFppa04Item: RequestHandler = async (req, res, next) => {
  try {
    await prisma.fppa04ItemCPM.delete({ where: { id: req.params.itemId } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// ─── Adjustments CRUD under CPM Variant ────────────────────────────────────────
// POST   /api/fppa04/:id/adjustments
export const addFppa04Adjustment: RequestHandler = async (req, res, next) => {
  try {
    const baseId = req.params.id;
    const { type, description, amount } = req.body as {
      type: string;
      description: string;
      amount: number;
    };
    const adj = await prisma.fppa04AdjustmentCPM.create({
      data: { baseId, type, description, amount },
    });
    res.status(201).json({ adjustment: adj });
  } catch (err) {
    next(err);
  }
};

// PATCH  /api/fppa04/:id/adjustments/:adjId
export const updateFppa04Adjustment: RequestHandler = async (req, res, next) => {
  try {
    const { adjId } = req.params;
    const body = req.body as Partial<{
      type: string;
      description: string;
      amount: number;
    }>;
    const data: Prisma.Fppa04AdjustmentCPMUpdateInput = {
      ...(body.type        && { type: body.type }),
      ...(body.description && { description: body.description }),
      ...(body.amount      !== undefined && { amount: body.amount }),
    };
    const adj = await prisma.fppa04AdjustmentCPM.update({
      where: { id: adjId },
      data,
    });
    res.json({ adjustment: adj });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/fppa04/:id/adjustments/:adjId
export const deleteFppa04Adjustment: RequestHandler = async (req, res, next) => {
  try {
    await prisma.fppa04AdjustmentCPM.delete({ where: { id: req.params.adjId } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export const listFppa04: RequestHandler = async (req, res, next) => {
  try {
    
    const { categoryMain, categorySub } = req.query as {
      categoryMain?: string
      categorySub?: string
    }


    // build a dynamic filter
    const where: any = {}
    if (categoryMain) where.mainType = categoryMain
    if (categorySub)  where.subType  = categorySub

    const claims = await prisma.fppa04Base.findMany({
      where,
      select: {
        claimId: true,
        // include any other fields you need, e.g. cause, createdAt
        claim: { select: { createdAt: true } },
      },
    })

    // flatten if you prefer ClaimSummary shape
    const formatted = claims.map(c => ({
      id: c.claimId,
      createdAt: c.claim.createdAt,
    }))

    res.json({ claims: formatted })
  } catch (err) {
    next(err)
  }
}
