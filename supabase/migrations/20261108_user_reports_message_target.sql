-- Report a MESSAGE (owner 04/11/2026: "báo cáo tin nhắn - anh duyệt làm"). user_reports already holds reports of comments and users in a table of its own
-- (20261001b); a message becomes a third target type, so Messenger reports reuse that table, its one-report-per-target rule, its writer (the service role,
-- after the route's checks) and its reviewer ping — no second report system.
--
-- Only the target-type CHECK changes. target_id stays a uuid with no FK on purpose (it points at a comment, a user or a message); a message that is later
-- removed (its thread or the account is deleted) leaves the report as evidence, the same rule as a deleted comment.
-- What a message report stores: the message's id, the reason and an optional note — NOT the text of the message. A reviewer reads the message through the
-- service role; the person reporting is told, before sending, that the message goes to the moderators.
--
-- Safe before the web release: it only widens an allowed list (the route that writes the new value ships with the web release).
-- Requires: 20261001b_user_reports.sql. Rollback: rollback/20261108_user_reports_message_target_rollback.sql.

ALTER TABLE public.user_reports DROP CONSTRAINT IF EXISTS user_reports_target_type_check;
ALTER TABLE public.user_reports ADD CONSTRAINT user_reports_target_type_check CHECK (target_type IN ('comment', 'user', 'message'));
