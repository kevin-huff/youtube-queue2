/*
  Warnings:

  - You are about to drop the column `alias` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."users_channel_id_alias_key";

-- AlterTable
ALTER TABLE "public"."queue_items" ADD COLUMN     "submitter_alias" TEXT;

-- AlterTable
ALTER TABLE "public"."users" DROP COLUMN "alias";
