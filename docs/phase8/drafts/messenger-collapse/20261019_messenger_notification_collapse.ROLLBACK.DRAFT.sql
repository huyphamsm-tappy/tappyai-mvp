-- DRAFT rollback for 20261019_messenger_notification_collapse.DRAFT.sql — NOT APPLIED. Order: (1) turn MESSAGE_NOTIFICATIONS_ENABLED off / deploy the route that no longer calls these functions, (2) run this.
-- Rows already written stay valid ordinary notifications (type 'message'); no data migration in either direction.
DROP FUNCTION IF EXISTS public.mark_notifications_read(uuid[]);
DROP FUNCTION IF EXISTS public.mark_thread_read(uuid);
DROP FUNCTION IF EXISTS public.emit_message_notification(uuid, uuid, timestamptz, uuid, text, text, text, text, interval, timestamptz);
DROP INDEX IF EXISTS public.notifications_unread_message_uidx;
