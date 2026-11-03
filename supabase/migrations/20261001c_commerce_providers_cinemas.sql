-- Four cinema chains join the CCP registry as handoff-only providers (owner 01/10/2026): Galaxy, Lotte, BHD, Beta.
-- Tier 2, direct handoff to the chain's own «now showing» page, no deeplink. Seed rows only: idempotent, no schema change.
-- Rollback: delete from public.commerce_providers where provider_id in ('galaxy','lotte','bhd','beta');
insert into public.commerce_providers (provider_id, active, deeplink_enabled, tier, network, campaign_id, note) values
  ('galaxy', true, false, 2, null, null, 'Tier 2 — now-showing page link only (owner 01/10)'),
  ('lotte',  true, false, 2, null, null, 'Tier 2 — now-showing page link only (owner 01/10)'),
  ('bhd',    true, false, 2, null, null, 'Tier 2 — now-showing page link only (owner 01/10)'),
  ('beta',   true, false, 2, null, null, 'Tier 2 — now-showing page link only (owner 01/10)')
on conflict (provider_id) do nothing;
