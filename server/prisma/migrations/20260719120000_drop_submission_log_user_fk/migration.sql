-- Drop the users FK from submission_logs: the audit log records actors
-- (producers, 'admin', 'system') that never exist in the per-channel users
-- table, so inserts for those actors violated the constraint.
ALTER TABLE "submission_logs" DROP CONSTRAINT "submission_logs_username_channel_id_fkey";
