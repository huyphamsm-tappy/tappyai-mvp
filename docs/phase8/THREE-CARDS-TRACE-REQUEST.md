# The "3 Cards after Make Plan" incident — what is known and which trace to collect

Owner decision (2026-10-09): the approved legacy trip-plan hotel-card contract (PL-PLAN-CARD-RACE) stays unchanged; the incident is NOT declared resolved without the trace of the original failing turn.

## What is established
- On the **Agent Runtime** a Make Plan turn can no longer build cards from the plan's own venue names or run a TikTok lookup after the plan (`b8299b1`; frame sequence `[preliminary, cleared]` locked by `makePlanCards.test.ts`). The recorded Agent-Runtime plan turns in `post-fix-2026-10-09` carried **no** places frame at all.
- On the **legacy / Phase 7 path** a plan turn is *designed* to carry a places view: among the recorded Phase 7 golden plan turns (`wtp7/docs/uat/evidence/**`), 145 carried a `tappy.places.v1` annotation (8 items in 131 of them; I counted only turns that had one, not the plan turns without) with `picked` = 3 in 85, 2 in 32, 1 in 25, 0 in 3; their tools were the trip prefetch (`get_hotel_prices` + `get_weather` + `search_places` [+ `get_flight_prices` / `get_transport_options`]). That is consistent with the user seeing "3 cards" after a plan on the legacy path, but it is not proof that this was the user's turn.

## Trace to collect (one failing turn is enough)
1. The runtime: the response's server log lines — `tappyai_agent_run_trace` present ⇒ Agent Runtime (note `flag`); `tappyai_consult` / `tappyai_trip_prefetch` ⇒ legacy; and the `TAPPY_AGENT` value of that deployment.
2. The surface: request header `x-tappy-surface` (web renders the decision card; Android/iOS get inline media).
3. The user message and whether it came from the "Lên kế hoạch chi tiết" button.
4. The raw response stream, specifically the `8:` annotations in order: kind `tappy.progress.v1` (stage), `tappy.places.v1` with `preliminary`, `items[].name`, `picked`, `shown`, `cleared`, and the `9:` tool frames (names + args).
5. Log lines `tappyai_cards` (step, named_in_prose, pick_unmatched), `tappyai_cards_cleared`, `tappyai_tiktok_enrichment` (entities, searched), and the Serper ledger (`serper_ledger` budget event) to see which endpoints ran after the plan text.
6. The final message text including the `[TAPPY_PLAN]` block.
With 1–4 the cause is one of: legacy trip-prefetch card block (approved contract), an Agent-Runtime plan with a places frame (would be a regression of `b8299b1`), or a client rendering `places` from an earlier turn.
