-- ============================================================================
-- Analytics infrastructure — cross-platform device_context
-- Adds the single additive column that stores the full DeviceContext contract
-- (src/lib/tracking/deviceContext.ts) emitted identically by Web/Android/iOS.
--
-- DESIGN (see DEVICE_CONTEXT_ARCHITECTURE_DECISION.md):
--   • device_context is ENVELOPE infrastructure, not per-event business props,
--     so it gets its own top-level column rather than being folded into
--     `metadata` (which would conflate context with business properties and
--     break the envelope/properties separation this schema already established).
--   • The existing flat columns (platform/os_name/os_version/device_type/
--     app_version/language/build_number) are UNCHANGED and remain the indexed
--     "hot" dimensions used by auth_daily_rollup / user_acquisition / the
--     activation cron. This column is additive and consumed by nothing yet.
--   • jsonb (not 7 new flat columns) so future context fields need NO migration.
--
-- Additive + backward-compatible: nullable, IF NOT EXISTS, touches no existing
-- column/function/RLS policy; existing rows keep device_context = NULL. No index
-- (nothing queries it relationally yet — a GIN index can be added additively if
-- segmentation queries later need it).
--
-- Depends on: 20260713_analytics_envelope_foundation.sql (user_events envelope).
-- NOT applied to any database as part of this step — file only.
-- ============================================================================

ALTER TABLE public.user_events
  ADD COLUMN IF NOT EXISTS device_context jsonb;
