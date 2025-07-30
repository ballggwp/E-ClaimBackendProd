/*
  Warnings:

  - A unique constraint covering the columns `[docNum]` on the table `Claim` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `docNum` to the `Claim` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "docNum" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Claim_docNum_key" ON "Claim"("docNum");
