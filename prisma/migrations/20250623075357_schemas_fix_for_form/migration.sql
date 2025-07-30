-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'PENDING_INSURER_REVIEW', 'AWAITING_EVIDENCE', 'PENDING_INSURER_FORM', 'PENDING_MANAGER_REVIEW', 'PENDING_USER_CONFIRM', 'AWAITING_SIGNATURES', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('DAMAGE_IMAGE', 'ESTIMATE_DOC', 'OTHER_DOCUMENT');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MANAGER', 'INSURANCE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "position" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "categoryMain" TEXT,
    "categorySub" TEXT,
    "submittedAt" TIMESTAMP(3),
    "insurerComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CPMForm" (
    "claimId" TEXT NOT NULL,
    "accidentDate" TIMESTAMP(3) NOT NULL,
    "accidentTime" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "policeDate" TIMESTAMP(3),
    "policeTime" TEXT,
    "policeStation" TEXT,
    "damageOwnType" TEXT NOT NULL,
    "damageOtherOwn" TEXT,
    "damageDetail" TEXT,
    "damageAmount" DOUBLE PRECISION,
    "victimDetail" TEXT,
    "partnerName" TEXT,
    "partnerPhone" TEXT,
    "partnerLocation" TEXT,
    "partnerDamageDetail" TEXT,
    "partnerDamageAmount" DOUBLE PRECISION,
    "partnerVictimDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CPMForm_pkey" PRIMARY KEY ("claimId")
);

-- CreateTable
CREATE TABLE "Fppa04Base" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "mainType" TEXT NOT NULL,
    "subType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fppa04Base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fppa04CPM" (
    "baseId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "claimRefNumber" TEXT NOT NULL,
    "eventDescription" TEXT NOT NULL,
    "productionYear" INTEGER NOT NULL,
    "accidentDate" TIMESTAMP(3) NOT NULL,
    "reportedDate" TIMESTAMP(3) NOT NULL,
    "receivedDocDate" TIMESTAMP(3) NOT NULL,
    "company" TEXT NOT NULL,
    "factory" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "surveyorRefNumber" TEXT NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "signatureFiles" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fppa04CPM_pkey" PRIMARY KEY ("baseId")
);

-- CreateTable
CREATE TABLE "Fppa04ItemCPM" (
    "id" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "exception" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Fppa04ItemCPM_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fppa04AdjustmentCPM" (
    "id" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Fppa04AdjustmentCPM_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Fppa04Base_claimId_key" ON "Fppa04Base"("claimId");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CPMForm" ADD CONSTRAINT "CPMForm_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fppa04Base" ADD CONSTRAINT "Fppa04Base_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fppa04CPM" ADD CONSTRAINT "Fppa04CPM_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Fppa04Base"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fppa04ItemCPM" ADD CONSTRAINT "Fppa04ItemCPM_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Fppa04CPM"("baseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fppa04AdjustmentCPM" ADD CONSTRAINT "Fppa04AdjustmentCPM_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Fppa04CPM"("baseId") ON DELETE RESTRICT ON UPDATE CASCADE;
