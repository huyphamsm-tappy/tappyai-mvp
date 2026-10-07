-- V3 COMMERCE — PROD APPLY PACK (2026-09-20). Paste WHOLE file into Supabase Dashboard → SQL Editor of project fwznnobrdctuskgrvuik → Run.
-- Additive only: creates 3 NEW tables + 1 NEW trigger function; touches nothing `main` reads. Safe to run twice.
begin;
-- A3.1 (2026-09-20) — THE RUNTIME COMMERCE PROVIDER REGISTRY.
--
-- The commercial state of a provider is DATA the owner flips without a deploy: whether its
-- deeplink (affiliate wrapper) is approved and through which network / campaign / template,
-- whether the provider is switched on, and its tier. The technical registry (hosts, grammars,
-- depth audits) stays in code (src/lib/ccp/registry/providers.ts); the app reads this table
-- through a 60-second cache (src/lib/ccp/registry/runtime.ts), so a row edited here changes the
-- emitted link on the next request after the cache turns over — no restart, no code edit.
--
-- HOW THE OWNER FLIPS A PROVIDER (Tier 2 → Tier 1):
--   update public.commerce_providers
--      set deeplink_enabled = true, tier = 1, network = 'accesstrade', campaign_id = '<id>'
--    where provider_id = 'lazada';
-- A row that enables the deeplink WITHOUT a campaign id (accesstrade) or a wrapper template
-- (template) is a configuration error: the app logs it and keeps emitting the DIRECT link —
-- a tracked URL is never fabricated.
--
-- SERVICE ROLE ONLY. No anon / authenticated policy: the table is read server-side with the
-- admin client and written by the owner in the SQL editor / dashboard.

create table if not exists public.commerce_providers (
  provider_id       text primary key,
  active            boolean not null default true,
  deeplink_enabled  boolean not null default false,
  tier              smallint not null default 2 check (tier in (1, 2)),
  network           text check (network in ('accesstrade', 'template')),
  campaign_id       text,
  wrapper_template  text check (wrapper_template is null or wrapper_template like 'https://%{url}%'),
  note              text,
  updated_at        timestamptz not null default now()
);

alter table public.commerce_providers enable row level security;
revoke all on public.commerce_providers from anon, authenticated;

create or replace function public.commerce_providers_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists commerce_providers_touch on public.commerce_providers;
create trigger commerce_providers_touch before update on public.commerce_providers
  for each row execute function public.commerce_providers_touch();

-- THE OWNER'S LIST (2026-09-20) IS AUTHORITATIVE. Tier 1 = has deeplink; Tier 2 = direct handoff.
-- Campaign ids are the ones already verified in the code registry; Traveloka and Vietnam Airlines
-- are Tier 1 per the owner but no campaign id / template is on file — they stay DIRECT until the
-- owner fills `network` + `campaign_id` (or `wrapper_template`) here.
insert into public.commerce_providers (provider_id, active, deeplink_enabled, tier, network, campaign_id, note) values
  ('lazada',          true, true,  1, 'accesstrade', '5087153089503673507', 'Tier 1 per owner 2026-09-20 (code said pending)'),
  ('cellphones',      true, true,  1, 'accesstrade', '6259155740535091857', 'Tier 1'),
  ('tripcom',         true, true,  1, 'accesstrade', '6455552313033835511', 'Tier 1'),
  ('traveloka',       true, true,  1, null,          null,                  'Tier 1 per owner — NO campaign id / template on file: direct until filled'),
  ('vexere',          true, true,  1, 'accesstrade', '5222734619328835827', 'Tier 1 per owner 2026-09-20 (code said pending)'),
  ('vietnamairlines', true, true,  1, null,          null,                  'Tier 1 per owner — NO campaign id / template on file: direct until filled'),
  ('klook',           true, true,  1, 'accesstrade', '4704521809526929067', 'Tier 1'),
  ('tiktokshop',      true, true,  1, 'accesstrade', '6648523843406889655', 'Tier 1'),
  ('shopee',          true, false, 2, 'accesstrade', '4751584435713464237', 'Tier 2: approval pending — direct handoff'),
  ('vietjet',         true, false, 2, null,          null,                  'Tier 2'),
  ('booking',         true, false, 2, null,          null,                  'Tier 2'),
  ('agoda',           true, false, 2, null,          null,                  'Tier 2'),
  ('grabfood',        true, false, 2, null,          null,                  'Tier 2 — card CTA only'),
  ('shopeefood',      true, false, 2, null,          null,                  'Tier 2 — card CTA only'),
  ('ticketbox',       true, false, 2, null,          null,                  'Tier 2'),
  ('cgv',             true, false, 2, null,          null,                  'Tier 2'),
  ('dmx',             true, false, 2, 'accesstrade', '5751981382510607935', 'In code, NOT in the owner list 2026-09-20: kept active as direct handoff, no deeplink — owner to confirm')
on conflict (provider_id) do nothing;

-- B5 (2026-09-20) — ACCESSTRADE FEED ITEMS, ingested for the APPROVED merchants.
--
-- The feed (header sku,name,url,price,discount,image,desc,category) carries NO stock, NO brand
-- and NO per-row timestamp — so nothing here ever backs a "còn hàng" claim (the shopping gate
-- reports stock as a gap, always). Rows are the merchant's own product pages: the deepest
-- destination there is, which is why they feed discovery FIRST (src/lib/commerce/feedHints.ts).
--
-- D7 (owner decision, still open): title / price / image from a feed are NOT displayed until the
-- written data-rights confirmation is on file (`CCP_FEED_DISPLAY_ENABLED = false`). The rows
-- are stored so ingestion and link discovery work now; display waits for D7.
--
-- SERVICE ROLE ONLY: written by the ingest cron, read by the chat seam through the admin client.

create table if not exists public.commerce_feed_items (
  provider_id   text not null,
  sku           text not null,
  name          text not null,
  url           text not null,
  price         numeric,
  discount      numeric,
  image         text,
  description   text,
  category      text,
  feed_file     text not null,
  ingested_at   timestamptz not null default now(),
  primary key (provider_id, sku)
);

create index if not exists commerce_feed_items_provider_name_idx on public.commerce_feed_items (provider_id, lower(name));

alter table public.commerce_feed_items enable row level security;
revoke all on public.commerce_feed_items from anon, authenticated;

create table if not exists public.commerce_feed_runs (
  id            bigserial primary key,
  provider_id   text not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  rows_total    integer,
  rows_kept     integer,
  rows_rejected integer,
  outcome       text not null default 'running',
  detail        text
);
alter table public.commerce_feed_runs enable row level security;
revoke all on public.commerce_feed_runs from anon, authenticated;

-- Owner decision 2026-09-20: DMX off (data). Re-enable later with the same statement and true.
update public.commerce_providers set active = false, note = 'Owner decision 2026-09-20: disabled entirely' where provider_id = 'dmx';
commit;

-- VERIFY (run after): expect 17 rows, dmx active=false, both feed tables 0 rows.
select count(*) as providers, count(*) filter (where active) as active_providers, bool_or(provider_id = 'dmx' and not active) as dmx_off from public.commerce_providers;
select provider_id, active, deeplink_enabled, tier, network, updated_at from public.commerce_providers where provider_id = 'dmx';
select (select count(*) from public.commerce_feed_items) as feed_items, (select count(*) from public.commerce_feed_runs) as feed_runs;
