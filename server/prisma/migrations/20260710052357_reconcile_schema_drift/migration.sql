-- Reconcile schema drift between migration history and schema.prisma.
--
-- Production was previously kept in sync via `prisma db push` at container
-- boot, so these changes already exist there. Every statement is idempotent
-- (IF NOT EXISTS) so this migration is a no-op on production and applies the
-- full change on a fresh database. All changes are additive; nothing is
-- dropped or altered destructively.

-- AlterTable: accounts — Twitch token storage columns
ALTER TABLE "public"."accounts" ADD COLUMN IF NOT EXISTS "twitch_access_token" TEXT;
ALTER TABLE "public"."accounts" ADD COLUMN IF NOT EXISTS "twitch_refresh_token" TEXT;
ALTER TABLE "public"."accounts" ADD COLUMN IF NOT EXISTS "twitch_token_expires_at" TIMESTAMP(3);
ALTER TABLE "public"."accounts" ADD COLUMN IF NOT EXISTS "twitch_token_scope" TEXT;

-- AlterTable: cups — description field
ALTER TABLE "public"."cups" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- AlterTable: queue_items — start_time offset
ALTER TABLE "public"."queue_items" ADD COLUMN IF NOT EXISTS "start_time" INTEGER DEFAULT 0;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_role_assignments_channel_id_idx" ON "public"."channel_role_assignments"("channel_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "channel_role_assignments_account_id_idx" ON "public"."channel_role_assignments"("account_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cups_channel_id_idx" ON "public"."cups"("channel_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cups_series_id_idx" ON "public"."cups"("series_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "judge_scores_queue_item_id_idx" ON "public"."judge_scores"("queue_item_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "judge_scores_cup_id_idx" ON "public"."judge_scores"("cup_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "queue_items_channel_id_idx" ON "public"."queue_items"("channel_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "queue_items_cup_id_idx" ON "public"."queue_items"("cup_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "queue_items_status_idx" ON "public"."queue_items"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "queue_items_channel_id_status_idx" ON "public"."queue_items"("channel_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "series_channel_id_idx" ON "public"."series"("channel_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "submission_logs_channel_id_idx" ON "public"."submission_logs"("channel_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "submission_logs_username_channel_id_idx" ON "public"."submission_logs"("username", "channel_id");
