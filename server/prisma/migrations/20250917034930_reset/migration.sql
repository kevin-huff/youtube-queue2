-- CreateEnum
CREATE TYPE "public"."ChannelRole" AS ENUM ('OWNER', 'MANAGER');

-- AlterTable
ALTER TABLE "public"."channels" ALTER COLUMN "twitch_user_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."accounts" (
    "id" TEXT NOT NULL,
    "twitch_id" TEXT,
    "username" TEXT NOT NULL,
    "display_name" TEXT,
    "profile_image_url" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."channel_owners" (
    "id" SERIAL NOT NULL,
    "account_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "role" "public"."ChannelRole" NOT NULL DEFAULT 'OWNER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_owners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_twitch_id_key" ON "public"."accounts"("twitch_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_username_key" ON "public"."accounts"("username");

-- CreateIndex
CREATE UNIQUE INDEX "channel_owners_account_id_channel_id_key" ON "public"."channel_owners"("account_id", "channel_id");

-- AddForeignKey
ALTER TABLE "public"."channel_owners" ADD CONSTRAINT "channel_owners_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."channel_owners" ADD CONSTRAINT "channel_owners_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
