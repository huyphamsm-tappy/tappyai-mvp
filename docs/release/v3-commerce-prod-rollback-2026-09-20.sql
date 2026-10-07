-- ROLLBACK of v3-commerce-prod-apply-pack-2026-09-20.sql — removes ONLY the objects that pack created. Nothing `main` uses is touched.
begin;
drop trigger if exists commerce_providers_touch on public.commerce_providers;
drop function if exists public.commerce_providers_touch();
drop index if exists public.commerce_feed_items_provider_name_idx;
drop table if exists public.commerce_feed_runs;
drop table if exists public.commerce_feed_items;
drop table if exists public.commerce_providers;
commit;
