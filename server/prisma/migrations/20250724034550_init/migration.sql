-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MODERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('YOUTUBE', 'TIKTOK', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('PENDING', 'PLAYING', 'PLAYED', 'SKIPPED', 'REMOVED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "twitch_username" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "submission_count" INTEGER NOT NULL DEFAULT 0,
    "last_submission" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_items" (
    "id" SERIAL NOT NULL,
    "video_url" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "title" TEXT,
    "thumbnail_url" TEXT,
    "duration" INTEGER,
    "submitter_username" TEXT NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'PENDING',
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "played_at" TIMESTAMP(3),

    CONSTRAINT "queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "submission_logs" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_twitch_username_key" ON "users"("twitch_username");

-- AddForeignKey
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_submitter_username_fkey" FOREIGN KEY ("submitter_username") REFERENCES "users"("twitch_username") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_logs" ADD CONSTRAINT "submission_logs_username_fkey" FOREIGN KEY ("username") REFERENCES "users"("twitch_username") ON DELETE RESTRICT ON UPDATE CASCADE;
