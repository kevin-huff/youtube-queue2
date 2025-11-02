-- CreateTable
CREATE TABLE "public"."channel_role_invites" (
    "id" SERIAL NOT NULL,
    "channel_id" TEXT NOT NULL,
    "invited_username" TEXT NOT NULL,
    "role" "public"."ShowRole" NOT NULL,
    "cup_id" TEXT,
    "assigned_by" TEXT,
    "note" TEXT,
    "expires_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_role_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channel_role_invites_channel_id_idx" ON "public"."channel_role_invites"("channel_id");

-- CreateIndex
CREATE INDEX "channel_role_invites_invited_username_idx" ON "public"."channel_role_invites"("invited_username");

-- CreateIndex
CREATE UNIQUE INDEX "channel_role_invites_channel_id_invited_username_role_cup_i_key" ON "public"."channel_role_invites"("channel_id", "invited_username", "role", "cup_id");

-- AddForeignKey
ALTER TABLE "public"."channel_role_invites" ADD CONSTRAINT "channel_role_invites_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."channel_role_invites" ADD CONSTRAINT "channel_role_invites_cup_id_fkey" FOREIGN KEY ("cup_id") REFERENCES "public"."cups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."channel_role_invites" ADD CONSTRAINT "channel_role_invites_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
