/*
  Warnings:

  - Added the required column `approverDepartment` to the `Claim` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "approverDepartment" TEXT NOT NULL;
