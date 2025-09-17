/*
  Warnings:

  - The primary key for the `bot_settings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[channel_id,key]` on the table `bot_settings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[twitch_username,channel_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `channel_id` to the `bot_settings` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `bot_settings` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `channel_id` to the `queue_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `channel_id` to the `submission_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `channel_id` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "queue_items" DROP CONSTRAINT "queue_items_submitter_username_fkey";

-- DropForeignKey
ALTER TABLE "submission_logs" DROP CONSTRAINT "submission_logs_username_fkey";

-- DropIndex
DROP INDEX "users_twitch_username_key";

-- AlterTable
ALTER TABLE "bot_settings" DROP CONSTRAINT "bot_settings_pkey",
ADD COLUMN     "channel_id" TEXT NOT NULL,
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "bot_settings_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "queue_items" ADD COLUMN     "channel_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "submission_logs" ADD COLUMN     "channel_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "channel_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "twitch_user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "profile_image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channels_twitch_user_id_key" ON "channels"("twitch_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "bot_settings_channel_id_key_key" ON "bot_settings"("channel_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "users_twitch_username_channel_id_key" ON "users"("twitch_username", "channel_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_submitter_username_channel_id_fkey" FOREIGN KEY ("submitter_username", "channel_id") REFERENCES "users"("twitch_username", "channel_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_settings" ADD CONSTRAINT "bot_settings_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_logs" ADD CONSTRAINT "submission_logs_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_logs" ADD CONSTRAINT "submission_logs_username_channel_id_fkey" FOREIGN KEY ("username", "channel_id") REFERENCES "users"("twitch_username", "channel_id") ON DELETE RESTRICT ON UPDATE CASCADE;
