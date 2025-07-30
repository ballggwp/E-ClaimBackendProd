/*
  Warnings:

  - Added the required column `approverPosition` to the `Claim` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "approverPosition" TEXT NOT NULL;
