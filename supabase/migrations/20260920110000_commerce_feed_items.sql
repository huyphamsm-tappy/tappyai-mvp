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
