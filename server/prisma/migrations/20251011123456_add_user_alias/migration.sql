ALTER TABLE "public"."users" ADD COLUMN "alias" TEXT;

CREATE UNIQUE INDEX "users_channel_id_alias_key" ON "public"."users"("channel_id", "alias");
