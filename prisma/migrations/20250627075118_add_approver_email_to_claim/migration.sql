/*
  Warnings:

  - Made the column `approverEmail` on table `Claim` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Claim" ALTER COLUMN "approverEmail" SET NOT NULL;
