-- AlterEnum
ALTER TYPE "ClaimStatus" ADD VALUE 'PENDING_APPROVER_REVIEW';

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "approverEmail" TEXT;
