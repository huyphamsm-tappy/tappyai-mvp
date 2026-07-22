# Phase 2 — Activation Analytics: Final Implementation Specification

**Status: ✅ APPROVED AND FROZEN (2026-07-14).** This specification is the binding, frozen design for Phase 2 — Activation Analytics. No code has been written. Any future change to this design (not merely its implementation) requires the same ADR-and-approval discipline as any other frozen architecture document (Constitution §8, ADR-013) — it is not to be silently re-edited during implementation.
**Revision history (for context, does not affect frozen status):**
- **3rd revision (final, approved):** the owner simplified the Rule Provider interface to exactly **`getActiveRule(asOf?)`** and **`getRuleById(id)`** — `listAllRules()` removed (SR-4: no consumer needs it today; see §2.4a, §17). The Rule Evaluation Result (§2.9) was finalized as **computed on demand only, never persisted** — no new table, event field, or log stores it; it is produced live by the Activation Engine when queried, and persistence is deferred until a real auditing/debugging consumer exists (§17).
- **2nd revision:** introduced the **Rule Provider** abstraction between the **Activation Engine** and the **Rule Source** (§2.4a) so the Engine never depends on a concrete rule source (new SR-6), extended the rule model with lifecycle metadata — `id`/`name`/`enabled`/`effective_from`/`effective_to`/`description` (§2.2) — and introduced the **Rule Evaluation Result** model for debugging/auditing/explainability (§2.9).
- **1st revision:** replaced the original draft's hardcoded "AI answer AND saved place" Aha-Moment definition with a **configurable Activation Rule** abstraction (SR-5), because a fixed formula does not scale across future verticals. The v1 business definition is preserved exactly, but now as **one named, versioned rule** evaluated by a generic engine — not the definition of activation itself.
**Governance:** Implementation of **Analytics Architecture v1.1** (Event Catalog `07`, Analytics `06`, Data Dictionary `24`, KPI `25`/`35`, Journeys `27`, Retention `34`). **No architecture change. No new ADR.** Stop-and-flag clause active if a genuine v1.1 conflict is found.
**Scope boundary:** Does not touch Authentication Analytics (Steps 1.0→6, **COMPLETE**, F1-fixed). Extends it — never modifies it. Does not touch the held Phase 0 or `8e68f42`.
**Origin of this spec:** Doc `27` (`§2`, "Aha-Moment Hypothesis") explicitly flags activation as *"to validate, not assumed."* Docs `06`/`07`/`25` contain no concrete activation event/schema/KPI. This spec is the missing concrete definition, produced for owner review before any code — the same gate Phase 1 had via `PHASE_1_AUTH_ANALYTICS_SPEC.md`.

---

## 0. Standing rules (inherited, unchanged — SR-1 → SR-4)

Same four binding rules as Phase 1, restated for this module:

- **SR-1 — Single source of truth for acquisition.** `user_acquisition` remains the *only* acquisition dimension. Activation Analytics **never** copies or re-derives acquisition attributes — it **JOINs** `user_acquisition` on `user_id`.
- **SR-2 — Cross-platform parity.** Web/Android/iOS emit identical `event_type`/`properties`; `platform` is metadata only; one aggregation/service/dashboard implementation, never per-platform branches.
- **SR-3 — Business-oriented, one unified platform.** Activation is **Stage 2** of the same funnel Authentication seeded as Stage 1. Founder/Investor dashboards consume the same foundation as curated views — never a parallel pipeline.
- **SR-4 — Reusable services, extend-before-create.** No duplicated SQL, KPI math, or aggregation. Every new capability is checked against the existing `src/lib/admin/analytics/*` layer, `authAnalyticsClient`/dashboard components, and `authAnalyticsService` patterns before anything new is added.

**New standing principles established across these revisions (bind all future activation work):**
- **SR-5 — Activation is rule-driven, not hardcoded.** What counts as "activation" is data (a versioned **Activation Rule** definition), never logic baked into the pipeline, API, service, rollup schema, or dashboard. Adding, changing, or retiring a business definition of activation must **never** require changing analytics architecture — only registering a new rule (§2).
- **SR-6 — The Activation Engine depends on an abstraction, never on a concrete rule source.** The engine that evaluates rules talks only to a **Rule Provider** interface (§2.4a); it must never import, query, or otherwise know about the in-code registry, a database table, a feature-flag service, or remote configuration directly. Swapping or adding a Rule Source must never require changing the engine, the service, the API, or the dashboard.

---

## 1. Business goals and business questions

**Goal:** Measure whether newly-signed-up users reach genuine first value ("activate"), under a **business definition that can evolve as TappyAI adds verticals**, and use that signal to predict/explain retention — without re-architecting analytics every time the definition changes.

**Business questions this module must answer:**
1. What % of new signups activate (per the **currently active** Activation Rule) — overall, and by acquisition source/platform/method (joined via `user_acquisition`)?
2. How long does it take users to activate (time-to-activation), and is that trending up or down?
3. Which signals within the active rule fire first, and does hitting all of them predict retention better than any one alone? (validated per-rule, not assumed)
4. Do activated users retain/convert/pay at a materially higher rate than non-activated users (hook for Stage 3/5/6 correlation — built as a join, not duplicated logic)?
5. Which platform/onboarding path produces the highest activation rate?
6. **(New)** When the business definition of activation changes (new vertical, new "aha" hypothesis), can the platform measure the new definition **without shipping a new pipeline** — only a new rule registration?

This module answers the **Activation** row of the lifecycle table in `PHASE_1_AUTH_ANALYTICS_SPEC.md` §1A and turns the Stage-1→Stage-2 funnel edge (`27` §2: "Activated → Engaged") into a measured, filterable, **and evolvable** fact.

---

## 2. The Activation Rule abstraction (replaces the hardcoded Aha-Moment definition)

### 2.1 Why a rule abstraction, not a fixed formula
The first draft of this spec defined activation as one hardcoded AND-combination of two specific events. The owner correctly identified that this does not scale: as TappyAI adds verticals (reviews, favorites, purchases, maps, bill-split, …), each may need its own "what counts as first value" definition, and re-defining activation should never mean re-architecting the pipeline, rollup schema, service, API, or dashboard. This revision introduces the **Activation Rule** as the one piece that changes; everything downstream of it is generic.

### 2.2 Definition: Activation Rule (extended with lifecycle metadata)
> An **Activation Rule** is a **versioned, declarative specification** consisting of:
>
> **Evaluation logic:**
> - a set of **signal definitions** — each naming one event_type (existing or future, from *any* vertical) plus optional property-match criteria (e.g. "any `ai_response_completed`-class event that is not an error", "any `place_saved` event", "a completed `bill_split_created` event", …),
> - a **combinator** — how the signals combine to produce "activated" (`ALL`, `ANY`, or `AT_LEAST(n)`), and
> - a **window** — the qualifying time boundary (e.g. "same session," "within N days of signup").
>
> **Lifecycle metadata (new in this revision):**
> - **`id`** — a stable, unique rule identifier (e.g. `"activation-v1"`). Distinct from `rule_version` (§2.8's TEXT tag stored on results) — `id` identifies *the rule record itself* within a Rule Source (§2.4a); `rule_version` is what gets stamped onto results/rollups. For the default in-code registry, `id` and `rule_version` may coincide (both `"v1"`), but the model keeps them as separate fields so a future Rule Source (e.g. a database) can have multiple rows with the same conceptual version tag under different internal ids, or vice versa.
> - **`name`** — a short human-readable label (e.g. `"AI Answer + Place Saved (v1)"`), shown in the dashboard's rule label (§9) instead of a raw version string.
> - **`enabled`** — boolean; a disabled rule is never evaluated as "the active rule" and never produces new results, but its historical definition and past results remain queryable (for audit/explainability, §2.9).
> - **`effective_from`** / **`effective_to`** — nullable timestamps bounding when a rule is/was the operative definition. Enables a rule to be scheduled ahead of time or retired at a known point without deleting it, and lets the engine (or a human auditor) answer "which rule was active for signups on date X" deterministically, independent of whatever the *current* `enabled` flag says today.
> - **`description`** — free-text explanation of the business rationale (e.g. "Original doc-27 hypothesis: first AI answer and first saved place in the signup session"), for auditability — so a future engineer/owner reading rule history doesn't have to reverse-engineer intent from signal definitions alone.
>
> A rule is identified by its immutable `id`; its evaluation logic is **never mutated in place** — a changed definition is always a **new rule** (new `id`, typically a new `rule_version` tag), so historical activation results remain interpretable against the exact rule that produced them (the same principle already used for `schema_version` on events, §3). Retiring a rule is done via `enabled=false` + `effective_to`, never by deleting or silently editing it.

**Where rules live:** behind a **Rule Provider** abstraction (§2.4a), not accessed directly by the engine. The initial **Rule Source** is a small, declarative **in-code registry** (data/config, not pipeline logic) — e.g. `src/lib/admin/analytics/activationRules/registry.ts` — exporting the list of rule definitions (including their lifecycle metadata) and which one(s) are currently `enabled`/effective. This registry is the **only** artifact that changes when the business definition of activation changes, *for now* — see §2.4a for why the engine itself never depends on it directly.

### 2.3 Activation Rule v1 (current default — exactly the hypothesis from doc 27, now expressed as data)
> **Rule `v1`** (kept **exactly** as previously specified, now declared as one entry in the registry, not the definition of activation itself):
> - **Signals:** (1) any successful AI-answer event (non-error, non-empty response) from any AI tool; (2) any successful "place saved" event.
> - **Combinator:** `ALL` (both signals required).
> - **Window:** same session (`session_id` — the session whose `client_timestamp` is earliest among the user's sessions, i.e. the first session; reused from the existing envelope, no new session model).
>
> This is doc `27` §2's hypothesis, unchanged in substance, expressed as the first row of the registry rather than baked into any table/service/API code. It remains flagged **"to validate, not assumed"** (§2.6) exactly as before.

### 2.4 Generic evaluation (the one and only engine)
A **single, rule-agnostic evaluator** determines activation for a user against **whichever rule is currently active**:
> Given a rule's signal list, combinator, and window: for a user, has the qualifying set of signal-events (matching each signal's event_type + property criteria, within the window relative to signup) satisfied the combinator?

This evaluator is written **once**, generically over `(rule, user's events)` — it does not know what "AI answer" or "place saved" mean; it only knows how to match event_type/property criteria and apply `ALL`/`ANY`/`AT_LEAST(n)`. **Adding Rule v2** (say, combining `review_submitted` + `favorite_added` + `purchase_completed` with `AT_LEAST(2)` within 14 days) requires **zero changes** to the evaluator, the rollup table shape, the service's public API, the `/api/admin/analytics/activation` contract, or the dashboard components — only a new rule registered at the Rule Source (§2.4a) and, if the rule references a genuinely new event type, an **additive** Event Catalog entry for that event (§3) — the same additive discipline already used for Authentication events.

### 2.4a The Rule Provider abstraction (new in this revision)

The 1st revision had the Activation Engine read the in-code registry directly. The owner requires an explicit layer between them, so the engine never depends on *how or where* rules are stored:

```
Activation Engine   (activationRuleEngine.ts — generic evaluator, §2.4)
      ↓  depends only on this interface:
Activation Rule Provider   (a minimal interface: getActiveRule(asOf?), getRuleById(id))
      ↓  implemented by, initially, one adapter:
Rule Source   (v1: an in-code registry — activationRules/registry.ts)
```

- **Activation Engine** — the generic evaluator (§2.4). It never imports a registry, a database client, or a feature-flag SDK. It receives rule objects (already resolved, with lifecycle metadata applied — i.e. only rules that are `enabled` and within `[effective_from, effective_to)` "as of" the relevant date) from whatever implements the **Rule Provider** interface, and evaluates them against a user's events. This is the concrete mechanism behind SR-6: the engine is written once and never touches a concrete source.
- **Activation Rule Provider** — a small, stable interface (not a specific implementation) exposing exactly **two** operations: **`getActiveRule(asOf?)`** ("give me the rule that is active as of date X, default now") and **`getRuleById(id)`** ("give me a specific rule by id, for evaluating/auditing a historical result against the exact rule that produced it, §2.9"). This is the seam the owner's diagram names explicitly (`Activation Engine → Activation Rule Provider → Rule Source`). The Provider is responsible for applying the lifecycle-metadata filtering (`enabled`, `effective_from/to`) — the Engine asks for "the active rule," never filters raw rule rows itself. **`listAllRules()` is deliberately not part of this interface** — per SR-4 ("build only what has a real consumer"), there is currently exactly one rule, no consumer needs to enumerate multiple rules, and adding a listing capability now would be speculative surface area. It can be added to the interface later, without any Engine change, the moment a real multi-rule consumer (e.g. an admin rule-management UI, or the "list rules" API view floated in the prior draft) actually needs it — see §17.
- **Rule Source** — the actual place rule *data* lives. **v1 Rule Source = the in-code registry** (`activationRules/registry.ts`), wrapped by a Provider implementation that simply reads the in-memory list. Because the Engine only ever talks to the Provider interface, **future Rule Sources — a database table, a feature-flag/remote-config service, an admin-editable UI-backed store — can be introduced by writing a *new Provider implementation* against the *same interface*, with zero change to the Engine, the service layer (§7), the API (§8), or the dashboard (§9).** This directly satisfies the owner's requirement: "the architecture must allow future rule sources... without changing the Activation Engine."
- **Why this matters beyond satisfying the diagram:** it also cleanly supports rule lifecycle metadata (§2.2) being enforced consistently regardless of source — a future database-backed Provider and today's in-code Provider both guarantee "the Engine only ever sees currently-effective, enabled rules" the same way, because that logic lives in the Provider contract, not duplicated per source.

### 2.5 Signal events vs. the activation result event
- **Signal events** are whatever events a rule's signals reference — for v1, that means one event per AI-tool-answer-success and one per place-save-success (§3). These are **ordinary product events**, not activation-specific — a future rule may reference *existing* events (e.g. `review_submitted`, already emitted by Reviews) with **no new event needed at all**.
- **`activation_aha_reached`** (§3) is the **one** generic, server-computed result event: "the currently active rule's combinator was satisfied for this user, at this timestamp, under this `rule_version`." Its shape does not change per rule — it always carries `rule_version` + the timestamps of whichever signals fired + `time_to_activation_seconds`. This is what makes it possible for the pipeline/rollup/service/API/dashboard to stay generic: they consume the result event's stable shape, never the rule's internal signal list.

### 2.6 Hypothesis-validation obligation (unchanged from the prior draft, now generalized)
Every rule is a hypothesis until validated — v1 explicitly so, per doc 27. The dashboard/service (§7, §9) must expose **per-signal timestamps** (not just the combined boolean) for whichever rule is active, so the owner can test "does signal X alone predict retention as well as the full rule?" for **any** rule version, not just v1. If validation shows a rule should change, the fix is registering a **new rule version** (§2.2) — never silently redefining history under the same `rule_version`.

### 2.7 "Session" — exact boundary (unchanged)
Reuses the existing `session_id` already present in every event's envelope (`20260713_analytics_envelope_foundation.sql`). "First session" = the session whose `session_id` is earliest, by envelope `client_timestamp`, among sessions containing that `user_id`. No new session model. (A rule's "window" per §2.2 may instead specify a day-count, as future rules might.)

### 2.8 Activation Rate — the business metric (rule-relative)
> **Activation Rate (cohort, rule_version, window N days) = (# signups in the cohort who reached `activation_aha_reached` under that `rule_version` within N days of signup) / (# signups in the cohort).**
Default N = 7 (aligns with the existing D7 retention convention, `PHASE_1_AUTH_ANALYTICS_SPEC.md` §1A/§7, doc `34`). N and `rule_version` are both query parameters (§7/§8), never hardcoded constants. **Default `rule_version` = "currently active rule"** so existing dashboard consumers need not specify one, but historical/comparison queries can pin an explicit version.

### 2.9 Rule Evaluation Result model (new — debugging, auditing, future explainability)

Every time the Activation Engine (§2.4) evaluates a rule for a user (whether or not it resulted in activation), it produces a **Rule Evaluation Result** — a structured record of *why* the engine reached its conclusion, not just the conclusion itself:

| Field | Type | Meaning |
|---|---|---|
| `activation_rule_version` | TEXT | Which rule (`rule_version`/`id`, §2.2) was evaluated. |
| `evaluation_time` | TIMESTAMPTZ | When this evaluation ran (distinct from `activated_at`, which is only set if `activation_result=true` — an evaluation can run and *not* activate). |
| `matched_signals` | JSONB (list of signal keys + their matching event's timestamp) | Which of the rule's required signals **were** satisfied, and when. |
| `missing_signals` | JSONB (list of signal keys) | Which of the rule's required signals were **not yet** satisfied at evaluation time — this is what makes a non-activation explainable ("user is missing the place-saved signal") instead of a bare `false`. |
| `activation_result` | BOOLEAN | Whether the combinator was satisfied (i.e. whether this evaluation caused/would cause `activation_aha_reached`). |

**Purpose and usage (explicitly not a new user-facing dashboard requirement — this is an internal/diagnostic model):**
- **Debugging:** when a user reports "I did both things but I'm not marked activated," the Rule Evaluation Result for that user/rule shows exactly which signal was missing or mistimed (e.g. outside the window) — without re-deriving the answer from raw events by hand.
- **Auditing:** because it's timestamped and immutable per evaluation, it provides a trail of *when* the engine considered a user and what it knew at that time — useful when rules change (§2.2 `effective_from/to`) and someone needs to confirm which rule's logic actually applied to a given evaluation.
- **Future explainability:** this is the foundation for a later (not built now) "why is this cohort's activation rate low" drill-down — e.g. aggregating `missing_signals` across a cohort to show "80% of non-activated users are missing the place-saved signal specifically" — without any new data model, since the result already carries that detail.
- **Not persisted — computed on demand only (final, per owner refinement):** the Rule Evaluation Result is **not** written to any table, event, or log. It is produced **live**, in memory, whenever the Activation Engine evaluates a rule for a user — whether that's the real-time evaluation that may lead to `activation_aha_reached` (§3, which persists only the small, already-justified subset it needs — `rule_version`, `signal_timestamps`, `time_to_activation_seconds` — as an ordinary analytics event, unchanged from §3/§4), or an **on-demand diagnostic call** via `activationAnalyticsService.getEvaluationResult(userId, ruleVersion?)` (§7), which re-runs the Engine against the user's current events and returns the result **without storing it anywhere**. There is deliberately **no** "evaluation log" table and no history of past evaluation attempts — only the current, freshly-computed answer. Persisting a stored evaluation history is explicitly **not** built now and is introduced **only if and when a real auditing/debugging consumer requires it** (§17) — SR-4's "build only what has a real consumer" applied to this model exactly as it was applied to the Provider interface (§2.4a).

---

## 3. Event catalog additions (additive within v1.1; identical across platforms per SR-2)

| Event | Status | Properties (besides shared envelope) | Emitted when |
|---|---|---|---|
| `activation_ai_answer_received` | **add** (a *signal* event referenced by Rule v1 — not activation-specific by nature) | `tool` (open vocab: `chat`\|`food`\|`travel`\|`weather`\|`gold`\|`translate`\|`ocr`\|…), `is_first_for_user` (client convenience flag; server-authoritative per §2.4) | Client receives a **successful** AI response. Reuses existing AI-tool completion points; adds one tracked event alongside each. |
| `activation_place_saved` | **add** (a *signal* event referenced by Rule v1) | `place_category` (open vocab), `is_first_for_user` | Client completes a "save place" action (Maps/Explore/Reviews). |
| `activation_aha_reached` | **add** (the **one generic result event**, produced by evaluating whichever rule is active — §2.5) | `rule_version`, `signal_timestamps` (≈ the `matched_signals` field of a Rule Evaluation Result, §2.9; JSON map of signal-key → timestamp, generalizes the old fixed `first_ai_answer_at`/`first_place_saved_at` pair to an arbitrary-length map so future rules with more/fewer/different signals need no schema change), `time_to_activation_seconds` | **Server-computed** by the generic evaluator (§2.4), via the Rule Provider (§2.4a), the moment the active rule's combinator is satisfied for a user. **Not** client-emitted — avoids three platforms re-implementing rule logic (SR-2/SR-5). **Note:** this event is the persisted analytics record for a *successful* activation only; it does not carry `missing_signals` (that field is only meaningful for non-activating evaluations, which are never persisted — §2.9). |

**Future verticals (illustrative, not built now):** a hypothetical Rule v2 referencing `review_submitted` + `favorite_added` requires **no new row in this table** if those events already exist for Reviews/Favorites — only a registry entry (§2.2). If a genuinely new signal event is needed, it is added the same additive way `activation_ai_answer_received` was — no pipeline change.

**No changes to any Authentication event** (`auth_signup_completed`, `auth_login_completed`, `auth_login_failed`, `auth_logout_completed`) — those remain exactly as shipped.

Every new event carries the **existing v1.1 envelope** unchanged (`event_id`, `schema_version`, `user_id`/`anon_id`, `platform`, `app_version`, `session_id`, `client_timestamp`, …) — reused verbatim (SR-4). Ingestion path is the **existing** `/api/track` (unchanged). **Same emission contract required on Web/Android/iOS** (SR-2) — this spec does not ship until all three platforms can emit the v1 signal events identically; native instrumentation is an explicit, tracked build item.

---

## 4. Event properties (detail)

| Property | Type | Notes |
|---|---|---|
| `tool` (on `activation_ai_answer_received`) | TEXT, open vocab | Mirrors the existing AI-tool taxonomy already used in AI usage logging. |
| `place_category` (on `activation_place_saved`) | TEXT, open vocab | Mirrors the existing Maps/Explore place-category taxonomy. |
| `is_first_for_user` | BOOLEAN | Client-side convenience only; **never** the system of record — the server evaluator (§2.4) is authoritative, exactly as `is_first_login` is a convenience flag while `user_acquisition.first_login_at` is authoritative (same pattern, reused). |
| `rule_version` (on `activation_aha_reached`) | TEXT | Which registered rule (§2.2) produced this result. Immutable once written. |
| `signal_timestamps` (on `activation_aha_reached`) | JSONB | Map of the active rule's signal keys → their qualifying timestamps. Shape generalized (was a fixed pair in the rejected draft) precisely so future rules with different signal sets need no event-schema change. |
| `time_to_activation_seconds` | INTEGER | `activated_at - signup_at`; convenience for trend charts, recomputable from the dimension. |

---

## 5. `user_acquisition` correlation strategy (SR-1) — now rule-version-aware

**No new dimension table.** Activation state extends the existing `user_acquisition` row, correlated the same way every module is instructed to correlate (`PHASE_1_AUTH_ANALYTICS_SPEC.md` §4):

- **Two new nullable columns added to `user_acquisition`** (replacing the previous draft's three fixed-signal columns): `activated_at` (TIMESTAMPTZ, null = not yet activated under the currently-tracked rule) and **`activation_rule_version`** (TEXT, nullable — **which rule produced `activated_at`**, per requirement 5). The per-signal timestamps (`first_ai_answer_at`-style detail) are **not** stored on the dimension — they live on the `activation_aha_reached` event's `signal_timestamps` (§3/§4) and, for rollup/analysis convenience, on `activation_daily_rollup` (§6), keeping the dimension's shape stable across rule versions (a dimension column per signal would break the moment a rule adds/removes a signal — exactly the scaling problem being fixed).
  - This mirrors why `first_login_at`/`last_login_at` live on the dimension: activation is a one-row-per-user *state*, same kind of durable per-user fact — but the *rule that produced it* must travel with it (§5 requirement 5), hence the added `activation_rule_version` column.
  - **Only one `(activated_at, activation_rule_version)` pair is stored per user at a time** (first-write-wins, like every other dimension field) — this reflects "did the user activate, and under which rule" as the operational answer. Full historical detail across rule versions (e.g. re-evaluating past cohorts under a new rule) is a rollup/analysis-time concern (§6), not a dimension concern — the dimension is not the place to accumulate multi-version history.
- **Correlation for every downstream module remains a JOIN on `user_id`** against this (extended) `user_acquisition` — e.g. "D30 retention by activation status" = `user_active_days JOIN user_acquisition ON user_id WHERE activated_at IS NOT NULL`, optionally filtered `AND activation_rule_version = 'v1'` for rule-specific analysis. No new correlation mechanism invented.

**Population:** the generic evaluator (§2.4), running server-side (in the same rollup/cron layer as §6), determines when the active rule's combinator is satisfied and upserts `activated_at`/`activation_rule_version` via the **same first-write-wins upsert pattern** as `fn_upsert_user_acquisition` (COALESCE, never overwrite an existing value) — extended, not reimplemented (SR-4 extend-before-create). This upsert call is **rule-agnostic**: it always writes the same two columns regardless of which rule fired.

---

## 6. Rollup strategy — now versioned by rule

**No new rollup table per rule.** One `activation_daily_rollup` table serves **every** rule version, distinguished by a grain column — this is the key mechanism that lets rules change without pipeline change:

- **`activation_daily_rollup`**: grain **`(snapshot_date, platform, signup_source, rule_version)`** → `signups_in_cohort, activated_count, activated_within_7d_count, avg_time_to_activation_seconds`. Adding `rule_version` to the grain (vs. the previous draft's 3-column grain without it) means: when Rule v2 goes live, its results land as **new rows with `rule_version='v2'`**, alongside v1's historical rows — no schema change, no migration, no new table. Populated by grouping `user_acquisition`/`activation_aha_reached` results by VN-day of `signup_at` (same `AT TIME ZONE 'Asia/Ho_Chi_Minh'` convention, ADR-008 — reused) and the applicable `rule_version`.
- **Cron:** the **existing** `src/app/api/cron/analytics-snapshot/route.ts` gains one additional step — `fn_rollup_activation_daily(from, to)` — run in the **same** reconcile-window invocation immediately after `fn_rollup_auth_daily`, sharing the same `CRON_SECRET` gate, same 4-VN-day reconcile window, same per-step error-capture-without-crash pattern (F1-class robustness lesson applied from day one — any new `SECURITY DEFINER`/grant-sensitive function reviewed for the same class of issue found in `fn_sync_last_login`). **No new cron job, no new schedule.** The rollup function itself reads "which rule is/was active for the relevant dates" from the registry (§2.2) generically — it does not encode any rule's signal logic.
- **Idempotency:** same as `fn_rollup_auth_daily` — `ON CONFLICT (snapshot_date, platform, signup_source, rule_version) DO UPDATE` (recompute-overwrite), safe to re-run.
- **Rule changeover in the rollup:** switching the active rule does not touch historical `rule_version='v1'` rows — new rollup periods simply start accumulating under the new version. Any dashboard/API view that wants a continuous trend line across a rule change does so explicitly (e.g. compare v1 vs v2 side-by-side) — the platform does not silently splice incompatible definitions together.

---

## 7. Reusable service design (SR-4) — generic over rule_version

Extends `src/lib/admin/analytics/authAnalyticsService.ts`'s **pattern** with a sibling service, `activationAnalyticsService`, that is **parameterized by `rule_version`** everywhere rather than assuming v1:

```
Data:      user_acquisition (extended: activated_at, activation_rule_version)
           activation_daily_rollup (grain includes rule_version)
           Rule Source (v1: activationRules/registry.ts — declarative rule defs + lifecycle metadata)
              │ (facts + dimension + rule source; joined by user_id — SR-1)
Providers: src/lib/admin/analytics/activationRuleProvider.ts (new, interface + v1 in-code adapter)
              │ getActiveRule(asOf?) / getRuleById(id) — §2.4a (no listAllRules — SR-4, no consumer yet)
              │ the ONLY thing that knows how/where rules are actually stored
Services:  src/lib/admin/analytics/activationAnalyticsService.ts
              │ reuses: AuthAnalyticsFilter shape (date/platform/method/app_version/country/language)
              │         + adds rule_version? (defaults to "currently active") and window_days?
              │         the same fetch-with-lazy-admin-import pattern as fetchRollup/fetchAcquisition
              │         the same pure-aggregation-function style as summarizeRollup/dailyTrend
           src/lib/admin/analytics/activationRuleEngine.ts (new, generic — the Activation Engine)
              │ evaluateActivationRule(rule, events) → Rule Evaluation Result (§2.9)
              │ depends ONLY on the Provider interface above (SR-6) — never on registry.ts directly
API:       /api/admin/analytics/activation  ← thin wrapper, same envelope/RBAC/rate-limit contract,
              accepts an optional rule_version param; NEVER needs a code change when a new rule ships
              or a new Rule Source is introduced
              │
Consumers: Dashboards · Reporting · Export Center · Notifications · Founder/Investor views
```

**Public surface (mirrors `authAnalyticsService`'s shape, generalized by `rule_version`):**
- `activationAnalyticsService.getSummary(filter)` → `{ signups, activatedCount, activationRate, avgTimeToActivationSeconds, ruleVersion }` — `filter.rule_version` optional, defaults to the registry's "currently active" rule.
- `activationAnalyticsService.getBySource(filter)` / `getByPlatform(filter)` — same "breakdown by dimension" shape as `providerBreakdown`/`platformBreakdown`.
- `activationAnalyticsService.getDailyTrend(filter)` — same shape as `dailyTrend`; a `rule_version` filter lets a trend span be scoped to one rule (avoiding silently mixing v1/v2 semantics, §6).
- `activationAnalyticsService.getSignalBreakdown(filter)` → **generalizes** the prior draft's fixed "AI-only / place-only / both" breakdown into a **generic per-signal-key breakdown**, driven by whichever rule's signal list is active — serves §2.6's validation obligation for **any** rule, not just v1.
- `activationAnalyticsService.getActiveRule()` → calls through to the **Rule Provider**'s `getActiveRule()` (§2.4a), not the registry directly — exposes rule metadata (id, name, version, `enabled`, `effective_from/to`, description, signals, combinator, window, §2.2) so the dashboard/API can be self-describing about what "activated" currently means, and so consumers never hardcode a rule's shape. **No `listRules()`/multi-rule listing method is exposed** — only one rule exists and nothing currently consumes a list (SR-4).
- `activationAnalyticsService.getEvaluationResult(userId, ruleVersion?)` → **new**, computes the **Rule Evaluation Result** (§2.9) for one user/rule **live, on demand** — `matched_signals`/`missing_signals`/`activation_result`/`evaluation_time` — by re-running the Engine against that user's current events. **Returns a value; persists nothing.** Not wired into the Step-9 dashboard in this phase (explicitly a diagnostic surface, not a new UI requirement) but exposed here so a future debug tool or support flow can call it without inventing a new service.
- **KPI math lives here, once** — `activationRate()`, `avgTimeToActivation()` pure functions, parameterized by rule_version, unit-testable exactly like `loginSuccessRate`/`firstLoginConversion`.
- **Filter type**: extends the existing `AuthAnalyticsFilter` interface shape by adding `rule_version?` and `window_days?` (SR-4 — no duplicated type definitions).

**Extend-before-create check performed:** `authAnalyticsService` is **not** extended in place (distinct KPI domain, doc 35, per the original spec's reasoning) — unchanged from the prior draft. **New in this revision:** the rule **evaluator** (`activationRuleEngine.ts`, the Activation Engine) is factored out as its **own** reusable primitive, separate from `activationAnalyticsService`, and depends **only** on the **Rule Provider interface** (`activationRuleProvider.ts`) rather than any concrete source (SR-6) — specifically so future modules that need "has this user satisfied some declarative combination of events" (a plausible reusable capability beyond just Activation — e.g. feature-flag-style cohort qualification) can reuse the **engine + Provider contract** without depending on Activation-specific KPI code *or* on the in-code registry being the permanent source of truth.

---

## 8. API design — accepts `rule_version`, never requires a code change for new rules

**Same contract shape as `/api/admin/analytics/auth`, now with one additional optional parameter:**

`GET /api/admin/analytics/activation` — RBAC `analyst`+ (reused), same-origin check (reused), rate limit 100/min (reused config), Zod validation (422, same schema-builder pattern as `src/app/api/admin/analytics/auth/schema.ts`), standard envelope `{data}` / `{data,meta.page}` / `{error:{code,message}}` (reused, unchanged).
- **Params:** `view` (`summary`\|`by_source`\|`by_platform`\|`trend`\|`signals`\|`rule`), `from`, `to`, `platform?`, `method?`, `app_version?`, `country?`, `language?`, `window_days?` (default 7), **`rule_version?`** (default: currently active rule — resolved via the Rule Provider's `getActiveRule()`, or `getRuleById()` when `rule_version` is supplied — never hardcoded in the route).
- **`view=rule`** (new, singular — not a list): returns the **one** rule the request resolves to (active rule by default, or the specific `rule_version` requested via `getRuleById`) — id, name, signals, combinator, window, lifecycle metadata (§2.2). Lets the dashboard render "you are viewing Activation Rule v1" without hardcoding that string in the frontend. **No endpoint enumerates all rules** — consistent with the Provider exposing no `listAllRules()` (§2.4a); add one only when a real multi-rule consumer exists (§17).
- **Thin wrapper only** — zero SQL/KPI/rule-evaluation logic in the route file, identical discipline to the existing route. **Adding Rule v2 requires no change to this route, its schema, or its RBAC/rate-limit wiring** — only a new registry entry (§2.2) and, if new signal events are introduced, an additive Event Catalog entry.
- **This one endpoint** feeds the Activation Dashboard, Founder/Investor activation rows, and any future report/export (SR-4) — no second implementation anywhere, for any rule version.

---

## 9. Dashboard design — rule-aware, not rule-hardcoded

**New page** `/admin/analytics/activation`, added to `AdminShell` nav (same pattern as "Auth Analytics": `minRole: 'analyst'`, `ready: true`), reusing the **exact same component family** built in Step 6:

- **KPI cards** (new sibling of `AuthKpiCards`, same shape): Signups (cohort), Activated Count, **Activation Rate**, Avg Time-to-Activation — **plus a small "Activation Rule: v1" label** sourced from `view=rule` (§8), so the dashboard is honest about which definition produced the numbers and requires no code change when the label should say "v2" later.
- **`AuthBreakdownTable`** (existing **generic** `Column<T>` component) reused **as-is** for: activation-by-source, activation-by-platform, and the **signal breakdown** (§7 `getSignalBreakdown`) — the columns for signal breakdown are generated from whichever rule is active (generic per-signal-key rows), not hardcoded to "AI-only/place-only/both." Zero new table component needed.
- **`AuthTrendChart`** (existing dependency-free div-bar component) reused **as-is** for the daily activation-rate trend.
- **Filters:** same six (date/platform/method/app_version/country/language) + `window_days` (7/14/30) + an optional **rule_version selector** (defaults to "current," lets the owner compare historical rule versions once more than one exists — inert/hidden if only v1 has ever run, so it adds no visible complexity today).
- **States:** loading/empty/error, identical pattern to Step 6.
- **Funnel affordance:** unchanged from the prior draft — activation segments link downstream to Engagement/Retention correlation panels via `user_acquisition.activated_at`, as those modules ship.

---

## 10. Founder/Investor metric mapping

- **Founder Dashboard (`26`):** Activation Rate (current rule, current + trend) as a **headline funnel-health metric** under the existing Acquisition/signup row — same service call (`activationAnalyticsService.getSummary`/`getDailyTrend`, defaulting to the active rule), curated view only.
- **Investor Dashboard (`15`):** Activation Rate as a **leading indicator row** alongside the acquisition-channel view — same service call, different framing/labels only.
- Both dashboards call the **same** `/api/admin/analytics/activation` (or the service directly, server-side) — never a parallel query — and both automatically reflect whichever rule is active without any dashboard code change.

---

## 11. Cross-platform parity (SR-2)

- Signal events referenced by the active rule (for v1: `activation_ai_answer_received`, `activation_place_saved`) must be emitted with **identical `event_type`/property names** from Web, Android, iOS. This spec explicitly requires native (Android/iOS) instrumentation to ship before this module is complete — a hard business requirement (§1), not optional polish.
- `activation_aha_reached` is **server-computed** by the one generic evaluator (§2.4) specifically so rule logic exists in exactly one place — a *stronger* parity guarantee than relying on three client implementations to agree on rule/session semantics, and it means **future rules never need client changes at all** (the client only ever emits raw product events; the server decides what they mean).
- Rollup + dashboard: one code path, `platform` a filter/breakdown dimension only, `rule_version` a grain/parameter dimension only — identical discipline to Phase 1 §8, extended consistently to the new axis.

---

## 12. SR-1 → SR-6 compliance summary

- **SR-1:** No new acquisition dimension. `activated_at`/`activation_rule_version` extend the existing `user_acquisition` row (§5); every other module still correlates via the same single dimension.
- **SR-2:** Identical signal events/properties across platforms; one rollup; one dashboard; `platform` and `rule_version` are filter/grain dimensions only, never code branches (§3, §11).
- **SR-3:** Activation is explicitly Stage 2 of the same funnel; Founder/Investor are curated views of the same service; no isolated "Activation feature stats" silo.
- **SR-4:** New service and new rule engine are **siblings**, not duplicates, of `authAnalyticsService`, reusing its filter shape, fetch pattern, and aggregation style; API route reuses the exact RBAC/rate-limit/envelope/schema pattern; dashboard reuses `AuthBreakdownTable`/`AuthTrendChart` **verbatim**. No duplicated SQL, KPI math, or aggregation.
- **SR-5:** Activation is defined by a **versioned, declarative rule** (§2), evaluated by **one generic engine** (§2.4). Introducing Rule v2/v3 changes only the Rule Source (and, if needed, an additive event) — **never** the rollup schema shape (beyond the already-present `rule_version` grain column), the service's public methods, the API contract, or the dashboard components.
- **SR-6 (new):** The Activation Engine (§2.4) depends **only** on the Rule Provider interface (§2.4a), never on a concrete Rule Source. The v1 in-code registry is one interchangeable adapter behind that interface. Introducing a database-backed, feature-flag-backed, or remote-config-backed Rule Source later means writing a **new Provider implementation** against the same interface — zero change to the Engine, the service, the API, or the dashboard. This directly satisfies the owner's `Activation Engine → Activation Rule Provider → Rule Source` requirement.

---

## 13. Reuse map — what is reused from Authentication Analytics

| Authentication Analytics artifact | Reused as-is for Activation | Extended | New (activation-specific) |
|---|---|---|---|
| Envelope (`envelope.ts`, `event_id` idempotency, `/api/track`) | ✅ verbatim | | |
| `session_id` field | ✅ verbatim (defines rule windows that use "first session," §2.7) | | |
| `user_acquisition` table | | ✅ 2 nullable columns added (`activated_at`, `activation_rule_version`) | |
| `fn_upsert_user_acquisition` upsert pattern (COALESCE first-write-wins) | | ✅ same pattern extended, rule-agnostic write | |
| `auth_daily_rollup` shape/grain convention, VN-day bucketing (ADR-008) | ✅ pattern reused | | `activation_daily_rollup` (new table, grain adds `rule_version`) |
| `analytics-snapshot` cron, `CRON_SECRET`, reconcile window, per-step error capture | ✅ same cron, one more step | | `fn_rollup_activation_daily` (new function, reads registry generically) |
| `AuthAnalyticsFilter` interface | | ✅ imported/extended (+`rule_version?`, `window_days?`) | |
| `authAnalyticsService` fetch/aggregation *style* (lazy admin import, pure functions) | ✅ pattern reused | | `activationAnalyticsService` (new sibling service, rule-version-parameterized) |
| — | | | **`activationRuleEngine.ts`** (new, generic Activation Engine — §2.4/§7, depends only on the Provider interface, itself a reusable primitive beyond just Activation) |
| — | | | **`activationRuleProvider.ts`** (new — the Rule Provider interface + the v1 in-code adapter, §2.4a; the *only* seam a future Rule Source needs to implement) |
| — | | | **`activationRules/registry.ts`** (new — the v1 **Rule Source**: declarative rule definitions + lifecycle metadata, §2.2; the artifact that changes per new rule *within this source*) |
| `/api/admin/analytics/auth` route/schema pattern (RBAC/rate-limit/Zod/envelope) | ✅ pattern reused | | `/api/admin/analytics/activation` (new route, +`rule_version`/`view=rule` params) |
| `AuthBreakdownTable`, `AuthTrendChart` (UI components) | ✅ **verbatim, no changes** | | |
| `AuthKpiCards`, `AuthFilters` (UI components) | | ✅ same shape, new fields/KPIs | new sibling components (Auth Analytics UI stays untouched) |
| `AdminShell` nav pattern | | ✅ one new entry, additive | |
| RBAC (`requireAdminRole`), audit log | ✅ verbatim | | |

**Nothing in the existing Authentication Analytics code is modified.** Every "extended" row means a **new column/function/entry added alongside**, not an edit to existing logic.

---

## 14. Database changes (proposed; not applied — migration only on approval)

1. **`ALTER TABLE user_acquisition ADD COLUMN activated_at TIMESTAMPTZ, ADD COLUMN activation_rule_version TEXT;`** — both nullable, no default, no backfill required (pre-instrumentation users show `null` = "activation not measured," factually correct, same honesty principle as `unknown` sentinels in Phase 1's backfill). *(Revised from the prior draft's three fixed-signal columns — signal-level detail now lives on the event/rollup, not the dimension, so the dimension's shape survives future rule changes unchanged.)*
2. **New table `activation_daily_rollup`** — grain **`(snapshot_date, platform, signup_source, rule_version)`**, columns per §6, `UNIQUE(snapshot_date, platform, signup_source, rule_version)`, RLS deny (service-role only) — same posture as `auth_daily_rollup`, with `rule_version` added to the grain and uniqueness constraint.
3. **New function `fn_rollup_activation_daily(from, to)`** — set-based GROUP BY over `user_acquisition`/activation events, `ON CONFLICT` recompute-overwrite, `SECURITY DEFINER` reviewed **up front** for any cross-schema read (learned from F1) even though this function is expected to only touch `public` tables (flagged here so implementation double-checks before assuming DEFINER is unnecessary).
4. **New function/upsert path** applying first-write-wins semantics to `activated_at`/`activation_rule_version` when the generic evaluator (§2.4) determines a user has satisfied the active rule — implemented as a narrowly-scoped sibling to `fn_upsert_user_acquisition` (decision on "extend vs. sibling function" deferred to implementation Step 1).
5. **No new table for rule definitions (v1 Rule Source only).** Rule definitions + lifecycle metadata (§2.2 — `id`, `name`, `enabled`, `effective_from/to`, `description`, signals, combinator, window) are **not** stored as database rows in this spec's default design — they are a **code-level declarative registry** (`activationRules/registry.ts`) behind the Rule Provider interface (§2.4a), since rule definitions change rarely, are authored by engineers (not admins, at least initially), and keeping them in code keeps them version-controlled/reviewable like the KPI Dictionary itself. *(Because the Engine only depends on the Provider interface — not this table-vs-code choice — moving rule storage to a database later, per §17, is an additive migration plus a new Provider implementation, never a pipeline change.)*
6. **No new table or column for Rule Evaluation Results.** Per the owner's final refinement, the Rule Evaluation Result (§2.9) — `matched_signals`/`missing_signals`/`activation_result`/`evaluation_time` for **any** evaluation, activating or not — is generated **on demand, in memory**, by the Activation Engine when `activationAnalyticsService.getEvaluationResult(userId, ruleVersion?)` (§7) is called; it is **never written to a database table, event, or log**. Only `activation_aha_reached` (a normal, minimal analytics event for a *successful* activation — `rule_version`/`signal_timestamps`/`time_to_activation_seconds`, unchanged from the 2nd revision) is persisted. This avoids building storage for a debugging/auditing aid that has no concrete consumer yet (SR-4). *(If a genuine auditing/debugging consumer later requires a persisted trail of every evaluation — not just an on-demand recomputation of the current state — that is a scoped future addition, §17, introduced only at that point.)*
7. **No changes to `auth_daily_rollup`, `fn_rollup_auth_daily`, `fn_sync_last_login`, or any Phase-1 table/function/RLS policy.**

---

## 15. Production verification checklist (for when this is implemented — not run now)

- [ ] Migration applies cleanly; `user_acquisition` gains 2 nullable columns; `activation_daily_rollup` created with the `rule_version`-inclusive grain/constraints/RLS.
- [ ] `activation_ai_answer_received` / `activation_place_saved` (Rule v1's signals) emit identically from Web, Android, iOS with correct envelope + properties.
- [ ] A real user: logs in → gets one successful AI answer → saves one place (same session) → `user_acquisition.activated_at` and `activation_rule_version='v1'` populate exactly once; a second AI-answer/save afterward does **not** move the timestamp (first-write-wins verified).
- [ ] `activation_aha_reached` event appears exactly once per user, carrying `rule_version='v1'` and a `signal_timestamps` map with both signals.
- [ ] Cron: `fn_rollup_activation_daily` runs in the same invocation as `fn_rollup_auth_daily`; re-running is idempotent (values stable per `(date, platform, source, rule_version)`, no double counting).
- [ ] `GET /api/admin/analytics/activation` reconciles to `activation_daily_rollup`/`user_acquisition` for every `view`, defaulting correctly to the active rule when `rule_version` is omitted; RBAC/rate-limit/validation behave identically to the auth endpoint (401/403/422/429).
- [ ] `view=rule` returns the current active rule's definition accurately (and `getRuleById` resolves a specific historical `rule_version` correctly, once more than one version has ever existed).
- [ ] Dashboard renders KPI cards (incl. the "Activation Rule: v1" label)/breakdowns/trend/signal-split with real data; filters (incl. `window_days`, `rule_version`) narrow correctly; empty/error states verified.
- [ ] Founder/Investor activation rows render from the same service with no discrepancy vs. the standalone dashboard.
- [ ] **Rule-scaling smoke test:** hand-register a throwaway "Rule vTest" in the registry referencing a different existing event (e.g. a Reviews event) with `combinator=ANY`, confirm the evaluator/rollup/API/dashboard all handle it correctly **with no code change beyond the registry entry** — this is the concrete proof of the 1st revision's requirement 4/7, run once before sign-off, then removed.
- [ ] **(New) Provider-swap smoke test:** implement a second, throwaway Rule Provider (e.g. a hardcoded-in-test-only "fake DB" adapter returning the same v1 rule from a different shape), point the Engine at it instead of the registry-backed Provider, confirm identical evaluation results — proves the Engine genuinely depends on the interface, not the registry, before sign-off (this test artifact is removed after verification, not shipped).
- [ ] **(New) Rule metadata correctness:** confirm `enabled=false` or an `effective_to` in the past correctly excludes a rule from `getActiveRule()`, while `getRuleById()` can still retrieve it directly by id (audit/debugging access to a retired rule, §2.2, without needing a listing method).
- [ ] **(New) Rule Evaluation Result correctness:** for a user missing exactly one v1 signal, confirm `getEvaluationResult` returns `activation_result=false` with the correct signal in `missing_signals` and the other in `matched_signals` (§2.9).
- [ ] Confirm **no** Authentication Analytics test, route, table, or dashboard regressed (full existing 81-test suite still green + any new tests added).

---

## 16. Backward compatibility

- **Additive only.** No existing table column is renamed/removed/retyped; no existing function signature changes; no existing route/component is edited. Every existing Authentication Analytics test, report, and dashboard continues to function unchanged.
- New `user_acquisition` columns are nullable — every existing query against that table (including `authAnalyticsService.fetchAcquisition`) continues to work unmodified.
- The existing cron's Authentication-Analytics steps are unaffected by the appended activation-rollup step; a failure in the new step must not fail the existing steps (same per-step error-capture discipline as today).
- **Rule-version compatibility:** because `rule_version` is part of the rollup grain and travels with the dimension's `activated_at`, introducing Rule v2 in the future is itself backward compatible — v1's historical numbers are neither recomputed nor deleted.

---

## 17. Future extensibility

- **Adding Rule v2, v3, …:** register a new entry at the current Rule Source (`activationRules/registry.ts`: signals, combinator, window, lifecycle metadata) and flip `enabled`/`effective_from` — **no change** to the Engine, the Provider interface, rollup schema, service methods, API contract, or dashboard components. If a rule references events from a not-yet-built vertical (reviews, favorites, purchases, maps, bill-split, …), the only prerequisite is that vertical already emitting a suitable event through the existing `/api/track` pipeline — itself no architecture change.
- **Swapping or adding a Rule Source (the owner's core requirement this revision addresses):** a database-backed Source (e.g. an `activation_rules` table, letting admins author/enable/schedule rules at runtime without a deploy), a feature-flag-backed Source, or a remote-config-backed Source are each introduced by writing a **new Rule Provider implementation** against the existing interface (§2.4a) — the Engine, service, API, and dashboard require **zero changes**. Multiple Sources could even coexist (e.g. registry as fallback, database as primary) entirely inside the Provider layer, invisible to the Engine.
- **Stage 3+ correlation** (Engagement/Retention/Monetization/Revenue/Churn/LTV): each future module JOINs `user_acquisition.activated_at` (optionally filtered by `activation_rule_version`) the same way it JOINs `signup_method` today.
- **Reporting/Export/Notifications (`08`/`09`):** consume `activationAnalyticsService`/`/api/admin/analytics/activation` exactly as any future report would consume `authAnalyticsService` — no new pattern to design when that module is built, and reports automatically follow whichever rule is active.
- **Multi-rule comparison:** because rollup rows are keyed by `rule_version`, a future "rule A/B comparison" view is a query-time concern (compare two `rule_version` slices), not a new table or pipeline.
- **`listAllRules()` (deliberately deferred, §2.4a):** the moment a real consumer needs to enumerate every rule (e.g. an admin rule-management screen, or a "rule history" audit view), this is a small additive method on the existing Provider interface — the Engine still never uses it, so adding it does not touch the Engine at all. Not built now because no such consumer exists yet (SR-4).
- **Persisted Rule Evaluation Results (deliberately deferred, §2.9/§14):** likewise, if a genuine auditing/debugging consumer emerges that needs a stored history of every evaluation (not just on-demand recomputation of the current state), that consumer's arrival is the trigger to add storage — the Rule Evaluation Result's shape (§2.9) is already defined, so this would be a storage addition, not a redesign.
- **Persisted evaluation history:** if on-demand `getEvaluationResult` (§7, §14 item 6) proves insufficient for a future compliance/audit need, persisting every Rule Evaluation Result as an event/table is an additive extension of the same model (§2.9 already defines its shape) — not a redesign.
- **Cohort-level explainability:** aggregating `missing_signals` across a non-activated cohort (§2.9) to power a "why isn't this cohort activating" report is a new read/query over existing data, not a new tracking or storage mechanism.

---

**This is the complete, three-times-revised, APPROVED AND FROZEN Phase 2 specification.** It replaces the originally-rejected hardcoded Aha-Moment definition with a configurable **Activation Rule** abstraction evaluated through a layered **Activation Engine → Activation Rule Provider → Rule Source** architecture (§2.4a): Rule v1 preserves the original business definition exactly (now carrying `id`/`name`/`enabled`/`effective_from`/`effective_to`/`description` metadata, §2.2), `activation_aha_reached` is produced by the Engine evaluating whichever rule the Provider resolves as active, `activation_rule_version` is stored alongside every activation result (dimension + rollup + event), and a **Rule Evaluation Result** model (§2.9) gives any evaluation a debuggable, auditable, explainable shape (`matched_signals`/`missing_signals`/`activation_result`/`evaluation_time`) — computed **on demand only, never persisted**, until a real auditing/debugging consumer justifies storage. The Rule Provider exposes only **`getActiveRule(asOf?)`** and **`getRuleById(id)`** — no `listAllRules()`, built only when a real consumer needs it. The pipeline/API/service/dashboard remain generic over both rule version *and* rule source — future rules (combining reviews, favorites, purchases, maps, bill-split, or anything else) require only a new Rule Source entry, and future rule *storage* (database, feature flags, remote config) requires only a new Provider implementation — neither ever touches the Engine, service, API, or dashboard. No ADR added, no architecture changed, no existing Authentication Analytics artifact modified.

*This specification is now the frozen basis for Phase 2 implementation. Step 1 of Phase 2 implementation may begin only when the owner explicitly authorizes it — this document's approval is a design sign-off, not an instruction to start building. Authentication Analytics (Steps 1.0→6, F1-fixed) remains untouched and complete.*
