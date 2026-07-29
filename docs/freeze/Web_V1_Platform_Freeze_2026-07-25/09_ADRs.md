# 09 — Architectural Decisions

Each ADR records a decision **actually reflected in the frozen code**, its rationale, and its
consequences. These are reconstructed from the code and commit history, not from a pre-existing
ADR log — where the codebase already carries a numbered ADR (the `android/docs/adr/*` and
`docs/backoffice` sets) it is cited.

---

## ADR-01 — Backend owns business logic; clients own presentation
**Decision:** All product values (quotas, upload limits, auth providers, onboarding catalogs,
feature flags, limit copy) live server-side in `product.ts` and are served by `/api/config`.
Enforcement is always server-side.
**Why:** A shipped mobile app cannot be re-released to change a number. Serving product values
lets one change reach web + Android + iOS without an app release, and a tampered client can only
change what it *shows*.
**Consequences:** Android must consume `/api/config` rather than hard-coding — the 15s/60s drift
bug (`807d77b`) is exactly what happens when a client keeps its own copy. Enforcement duplication
is deliberate: the client shows the limit, the server enforces it.

## ADR-02 — One AI facade; vendor SDKs quarantined; CI-enforced
**Decision:** All model access goes through `AI` from `@/lib/ai/llm`; `@ai-sdk/anthropic` may be
imported only in `providers/claude.ts`; `scripts/architecture/check.mjs` enforces it on CI.
**Why:** Provider portability, one place to change models/keys, and no key ever leaking toward
the client. (See `android/docs/adr/0003` — clients must never know provider or model.)
**Consequences:** Swapping providers is a registry change. The four-role tiering is ready but,
at the freeze, only Haiku 4.5 is wired — machinery without differentiated models yet.

## ADR-03 — The LLM writes prose; the system owns structured output
**Decision:** Links, images, place cards, plan photos and layout are injected deterministically
(`streamEnrichment.ts`), never trusted from the model. The prompt no longer even asks the model
to write them inline.
**Why:** Correctness (the model rewrites place names and mis-places galleries), cost (~1.6K
output tokens saved per 3-place reply, `7ce9eb9`), and security (no model-authored URLs in the
render path). Forged across the six-commit enrichment thread.
**Consequences:** The place-list portion of a reply is buffered and appears at end-of-generation
(accepted UX trade-off). Any client rendering the reply must reproduce the final grouping
behaviour, not the model's raw text.

## ADR-04 — Language preference stored in `localStorage`, not the account
**Decision:** The UI language lives in `localStorage['tappy_lang']` (with a best-effort
`PATCH /api/profile` mirror for logged-in users).
**Why:** Language must work **before login and for anonymous users**, and must survive refresh,
restart and logout on the same device without a round-trip. The picker shows once, iff
`getStoredLocale() === null`.
**Consequences:** Cross-device language sync is out of scope for V1 (owner decision). The setter
must **always write storage before any early-return** — skipping it was the picker-reappears bug
(`dd74359`). Android has its own per-app-locale mechanism.

## ADR-05 — Commerce is abstracted behind deep links, not in-app transactions
**Decision:** Deals, bookings, flights, food and shopping surface **deep links to external
platforms** built by `lib/platformLinks/*`; the app takes no payment for them.
**Why:** No in-app booking infrastructure, no merchant integrations, and (for Pro) no legal
entity for payments yet — hence `SHOW_PRO_UPGRADE = false`. Deals became **admin-managed DB
content** (`partner_deals`) precisely so link rot is an editorial fix, not a deploy (Bug #14).
**Consequences:** Deal correctness is validated by *rendering* the destination, not by HTTP status
(`56e4495` — 200-but-soft-404 was the trap). `affiliate_code` exists as a placeholder with no
logic yet.

## ADR-06 — Streaming buffers to own layout; client decouples render from network
**Decision:** The server buffers post-tool text to reposition enrichment; the client reveals text
via a rAF typewriter (`useSmoothText`) rather than binding to chunk arrival.
**Why:** Grouping photos with their place needs the full text (so buffering is unavoidable), and
network delivery is chunky (measured 71/147/116-char bursts) so raw binding jumps in blocks.
**Consequences:** Slightly delayed appearance of the place list, in exchange for correct grouping
and smooth typing. Android must implement incremental rendering to match (`11_Android_Migration.md`).

## ADR-07 — Self-healing convergent loops for non-deterministic platform behaviour
**Decision:** Media playback uses a **300 ms self-healing watchdog** on the active clip rather
than an enumerated state machine; the active clip is driven by a parent `active` flag, not a
per-video observer.
**Why:** iOS Safari's autoplay/unmute/decode behaviour is non-deterministic; Web needed **eleven**
commits enumerating failure paths before a watchdog that simply re-converges won. The per-video
IntersectionObserver approach raced with the feed's own tracking.
**Consequences:** Android should port the watchdog model, not the failed attempts. ExoPlayer has
the same finite-decoder constraint that forces the ±1 video window.

## ADR-08 — Graceful degradation and defensive fallbacks everywhere
**Decision:** Optional enrichments are best-effort and never fail the core; missing keys degrade
rather than crash. Examples: sound-page extras are wrapped so only the core track can 404
(`f9dbccb`); `/api/rates` has a hardcoded fallback table; `getActiveDeals` returns `[]` on error;
mascot art falls back to an emoji; TTS returns silence + a notice rather than a wrong-language
voice; chat auth/quota **fails open** on error.
**Why:** Availability over strictness for non-critical paths — Stability is Priority 3 and "no
optimization may sacrifice stability."
**Consequences:** Some failures are *silent* — e.g. an unapplied `partner_deals` migration makes
Deals render empty rather than error, and the chat fail-open is an unmetered-cost path. These are
recorded as risks in `12_Open_Items.md`.

## ADR-09 — Caching to protect cost and latency
**Decision:** A FIFO tool-result cache (300 entries), Serper `gstatic` thumbnails instead of
billed Google Places photos, ISR on `/api/rates`, `s-maxage` on the public feed, `max-age` on
`/api/config`, client-side image resize before scan upload, and a deterministic (zero-cost)
fortune engine.
**Why:** Cost Optimization is Priority 1 — minimise tokens, paid API calls, and bandwidth.
**Consequences:** The tool cache is per-lambda-instance, so hit rate degrades with fan-out — a
known limitation, not a bug.

## ADR-10 — Version-baked build ID with a self-reloading client
**Decision:** `NEXT_PUBLIC_BUILD_ID` is baked from `VERCEL_GIT_COMMIT_SHA`; `VersionWatcher`
compares it to `/api/version` and reloads a stale tab once per version.
**Why:** iOS Safari aggressively cached old builds; users saw stale UI after a deploy.
**Consequences:** This same mechanism is what let the freeze *prove* production == the frozen
commit (`13_Release_Gate.md`). Android does not need it (it ships as an app).

## ADR-11 — Security-definer aggregate exposure for privacy
**Decision:** Public counts (saves, follows, plays) come from `SECURITY DEFINER` RPCs, not from
readable tables; the underlying save/follow rows are private.
**Why:** Show "N people saved this" without ever revealing *who*, while keeping the tables
RLS-locked.
**Consequences:** Any new public count must be added as an RPC, not a table read. One RPC
(`music_increment_play`) and the deal-click RPC are deliberately anon-callable and therefore
inflatable — accepted for popularity counters, flagged if they ever drive ranking.

## ADR-12 — Manual database migrations (accepted debt)
**Decision:** Migrations are applied by hand in the Supabase SQL Editor; there is no automated
pipeline, config, or ledger.
**Why:** MVP speed; each migration carries "run this in SQL Editor" instructions.
**Consequences:** This is the direct cause of the schema drift in `04_Database.md` — `reviews`
and `favorites` have no `CREATE TABLE` in the repo, three 2026-07-14 migrations self-declare
"not applied" while code calls their functions, and the repo cannot rebuild a working database.
**This is the most consequential debt in the freeze and is the top item in `12_Open_Items.md`.**

---

### Referenced pre-existing ADRs (in-repo)
- `android/docs/adr/0002` — TikTok login deferred.
- `android/docs/adr/0003` — Pro hidden app-wide; clients never know provider/model; free tier
  15/day.
- `android/docs/adr/0004` — upload limits should be runtime-configurable via `/api/config`
  (**Status: Proposed/Deferred** — the 15→60 drift proved constants go stale).
- `docs/backoffice/22_Architecture_Decision_Records.md` — back-office ADR set (incl. the
  INSERT-only immutable audit log).
