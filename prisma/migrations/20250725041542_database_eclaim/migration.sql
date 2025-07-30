/*
  Warnings:

  - A unique constraint covering the columns `[claimId,status]` on the table `ClaimHistory` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ClaimHistory_claimId_status_key" ON "ClaimHistory"("claimId", "status");
