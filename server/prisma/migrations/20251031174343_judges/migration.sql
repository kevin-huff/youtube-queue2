/*
  Warnings:

  - A unique constraint covering the columns `[cup_id,queue_item_id,judge_token_id]` on the table `judge_scores` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."ModerationStatus" AS ENUM ('APPROVED', 'WARNING');

-- CreateEnum
CREATE TYPE "public"."JudgeSessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "public"."LockType" AS ENUM ('MANUAL', 'FORCED');

-- DropForeignKey
ALTER TABLE "public"."judge_scores" DROP CONSTRAINT "judge_scores_judge_account_id_fkey";

-- AlterTable
ALTER TABLE "public"."cups" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."judge_scores" ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "judge_name" TEXT,
ADD COLUMN     "judge_token_id" TEXT,
ADD COLUMN     "lock_type" "public"."LockType",
ALTER COLUMN "judge_account_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."queue_items" ADD COLUMN     "moderated_at" TIMESTAMP(3),
ADD COLUMN     "moderated_by" TEXT,
ADD COLUMN     "moderated_by_display_name" TEXT,
ADD COLUMN     "moderation_note" TEXT,
ADD COLUMN     "moderation_status" "public"."ModerationStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateTable
CREATE TABLE "public"."judge_sessions" (
    "id" TEXT NOT NULL,
    "cup_id" TEXT NOT NULL,
    "judge_account_id" TEXT,
    "judge_token_id" TEXT,
    "judge_name" TEXT,
    "status" "public"."JudgeSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judge_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "judge_sessions_judge_account_id_idx" ON "public"."judge_sessions"("judge_account_id");

-- CreateIndex
CREATE INDEX "judge_sessions_judge_token_id_idx" ON "public"."judge_sessions"("judge_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "judge_sessions_cup_id_judge_account_id_key" ON "public"."judge_sessions"("cup_id", "judge_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "judge_sessions_cup_id_judge_token_id_key" ON "public"."judge_sessions"("cup_id", "judge_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "judge_scores_cup_id_queue_item_id_judge_token_id_key" ON "public"."judge_scores"("cup_id", "queue_item_id", "judge_token_id");

-- AddForeignKey
ALTER TABLE "public"."judge_sessions" ADD CONSTRAINT "judge_sessions_cup_id_fkey" FOREIGN KEY ("cup_id") REFERENCES "public"."cups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."judge_sessions" ADD CONSTRAINT "judge_sessions_judge_account_id_fkey" FOREIGN KEY ("judge_account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."judge_scores" ADD CONSTRAINT "judge_scores_judge_account_id_fkey" FOREIGN KEY ("judge_account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
