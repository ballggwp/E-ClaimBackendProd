// src/routes/claims.ts
import express from "express";
import multer from "multer";
import * as claimCtl from "../controllers/claimController";
import { ensureAuth, ensureRole } from "../middleware/authMiddleware";
import {  updateSigner,uploadAttachments } from "../controllers/claimController";
const router = express.Router();
const upload = multer({ dest: "uploads/" });
// List & filter claims
router.get(
  "/",
  ensureAuth,
  claimCtl.listClaims
);
router.get("/search", claimCtl.handleSearch);
// Create a new claim — now req.user is guaranteed
router.post(
  "/",
  ensureAuth,
  claimCtl.createClaim
);

// Get one claim
router.get(
  "/:id",
  ensureAuth,
  claimCtl.getClaim
);

// Update header + nested CPM upsert
router.patch(
  "/:id",
  ensureAuth,
  claimCtl.updateClaim
);

// Insurance actions
router.post(
  "/:id/action",
  ensureAuth,
  ensureRole("INSURANCE"),
  claimCtl.claimAction
);
router.post('/:id/approverAction', claimCtl.approverAction);

// Manager actions
router.post(
  "/:id/manager",
  ensureAuth,
  ensureRole("MANAGER"),
  claimCtl.ManagerAction
);

// instead of upload.single("confirmationFiles")…
router.post(
  "/:id/userconfirm",
  ensureAuth,
  upload.array("confirmationFiles", 10),   // <— allow up to 10 files here
  claimCtl.userConfirm,
);


// Create CPM form
router.post(
  "/:claimId/cpm",
  ensureAuth,
  upload.fields([
    { name: "damageFiles" },
    { name: "estimateFiles" },
    { name: "otherFiles" },
    { name: 'userConfirmFiles' },
  ]),
  claimCtl.createCpmForm
);
router.put(
  "/:claimId/cpm",
  ensureAuth,
  upload.fields([
    { name: "damageFiles" },
    { name: "estimateFiles" },
    { name: "otherFiles" },
    { name: 'userConfirmFiles' },
  ]),
  claimCtl.updateCpmForm
);
router.put(
  "/:id/signer",
  // optionally insert a middleware here that checks req.user.role === "INSURANCE"
  updateSigner
);

 router.get(
   "/:id",
   ensureAuth,
   claimCtl.getClaim
 );
router.get("/:id/attachments", ensureAuth, claimCtl.listAttachments);
router.post ("/:id/attachments", upload.array("attachments"), uploadAttachments);
export default router;