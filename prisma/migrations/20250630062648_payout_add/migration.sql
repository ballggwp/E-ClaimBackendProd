/*
  Warnings:

  - Added the required column `insurancePayout` to the `Fppa04CPM` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Fppa04CPM" ADD COLUMN     "insurancePayout" DOUBLE PRECISION NOT NULL;
