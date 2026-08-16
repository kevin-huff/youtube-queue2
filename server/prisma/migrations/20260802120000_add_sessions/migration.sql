-- CreateTable
CREATE TABLE "public"."sessions" (
    "sid" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "public"."sessions"("expires_at");
