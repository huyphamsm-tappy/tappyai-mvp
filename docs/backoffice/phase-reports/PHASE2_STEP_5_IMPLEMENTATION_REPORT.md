# Phase 2 — Activation Analytics — Step 5 Implementation Report

**Step scope:** The reusable service layer per `PHASE_2_ACTIVATION_ANALYTICS_SPEC.md` §7 — `activationAnalyticsService`, a sibling to `authAnalyticsService`. **No** API route, no dashboard, no cron change. This is the layer a future thin API (Step 6) will wrap.

---

## 1. What was implemented (2 new files, nothing edited)

| File | Role |
|---|---|
| `src/lib/admin/analytics/activationAnalyticsService.ts` | The service: `ActivationAnalyticsFilter` (date/platform/rule_version — mirrors `AuthAnalyticsFilter`'s shape), pure KPI/aggregation functions (`activationRate`, `avgTimeToActivation`, `summarizeRollup`, `sourceBreakdown`, `platformBreakdown`, `dailyTrend`), a thin `fetchRollup` reading `activation_daily_rollup` (lazy admin import), and the public `activationAnalyticsService` object: `getSummary`, `getBySource`, `getByPlatform`, `getDailyTrend`, `getActiveRule`, `getRuleById`, `getEvaluationResult`. |
| `src/lib/admin/analytics/activationAnalyticsService.test.ts` | 11 unit tests. |

## 2. Design decisions (within frozen-spec bounds)

- **`rule_version` defaults to the active rule, resolved via the Provider** — `fetchRollup`'s `resolveRuleVersion` calls `provider.getActiveRule()` when the filter omits `rule_version`, never hardcoding `'v1'`. A future Rule v2 becomes the default with zero change to this service — only the registry's `enabled`/`effectiveFrom` flips (per Step 2).
- **`getActiveRule`/`getRuleById` call through the Provider**, not the registry — consistent with SR-6; this service has no import of `activationRules/registry.ts` at all, only of the Provider and the Engine's types.
- **`getEvaluationResult` computes live and persists nothing** — reuses the exact same event-fetch shape as the Step 4 cron/runner (`toDomainEvent`, `evaluateActivationRule`) but does **not** call `upsertActivation`; it is read-only, matching the owner's "Rule Evaluation Result is computed on demand only, never stored" refinement precisely. Not wired into any dashboard (§7 explicitly scopes it as diagnostic-only in this phase).
- **`avgTimeToActivation` is a rollup-weighted average** (weighted by each row's `activated_count`), not a naive mean of already-averaged rows — avoids the classic "average of averages" error when combining rollup rows across platforms/sources/days.
- **Deliberately scoped out this step: cohort-level signal breakdown** (the spec's `getSignalBreakdown` concept, §7). Reasoning: it would require live-evaluating many users' event histories on demand (expensive, and nothing in the codebase currently requests it) — no real consumer exists yet for a *cohort-wide* signal breakdown, only for the *single-user* diagnostic (`getEvaluationResult`, which the spec explicitly names a concrete future use case for — "a future debug tool or support flow"). Per SR-4 ("build only when a real consumer exists," reaffirmed by the owner at Steps 2/3/4), this is deferred rather than built speculatively. Flagged here transparently, not silently dropped — see §4.

## 3. Reuse (SR-1 → SR-6)

- **File/shape pattern reused verbatim from `authAnalyticsService.ts`**: filter type shape, pure-aggregation-then-thin-fetch layering, lazy admin-client import, `export const xService = { ... }` public surface, `export type XService = typeof xService`.
- **No duplicated SQL/KPI**: this service is the only place activation KPI math exists; it reads `activation_daily_rollup` (Step 4), never re-aggregates raw `user_events` itself for the rollup-backed methods.
- **`getEvaluationResult` reuses the Step 4 runner's event-adaptation helper (`toDomainEvent`) and the Step 2 Engine (`evaluateActivationRule`) directly** — no second copy of either.
- **Provider reused, not re-implemented**: every rule-aware method takes an optional `ActivationRuleProvider` parameter defaulting to `inCodeActivationRuleProvider` — the same seam Steps 2/4 established, letting a future Rule Source swap require zero change here either.

## 4. Verification results

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ Clean |
| `next lint` | ✅ Clean — no warnings in any new file |
| `npm test` (vitest) | ✅ **119/119 passing** (14 files: 13 prior + 1 new `activationAnalyticsService.test.ts` with 11 tests) |
| `npm run build` | ✅ "Compiled successfully"; the one logged `Dynamic server usage` line is `/api/subscription`'s pre-existing, unrelated `request.headers` usage |
| `architecture:check` | ✅ 7/7 rules passed |

## 5. Critical audit

- **SR-6 re-verified at the service layer**: confirmed `activationAnalyticsService.ts` has zero import of `activationRules/registry.ts` — only `activationRuleProvider.ts` (for the interface + default adapter) and `activationRuleEngine.ts` (for types/the evaluator function). The service, like the Engine, never depends on a concrete Rule Source.
- **`getEvaluationResult` confirmed non-persisting by test**: the unit test explicitly asserts the mocked client's `rpc` is never called during evaluation — a concrete, not just claimed, check that this diagnostic path writes nothing.
- **Weighted-average correctness verified by test**: `avgTimeToActivation` is asserted against a hand-computed weighted value (not just "returns a number"), and against the "nothing activated → null" edge case.
- **No activation-prefixed event referenced anywhere** — this step touches no event emission at all; `grep -rn "'activation_" src/` remains empty.
- **Scope-out is disclosed, not hidden**: cohort-level signal breakdown is named, reasoned about, and explicitly deferred (§2) rather than silently omitted from the report.
- **No new abstraction beyond the frozen spec**: no additional Provider methods, no persistence, no batching/parallelism (that's Step 4's documented technical debt, untouched here).
- **Scope discipline**: exactly 2 new files, 0 edits to any existing file, 0 changes to the frozen specification, 0 changes to Authentication Analytics.

## 6. Technical debt (owner-approved addendum, documented only — not implemented)

**Naming consistency between Authentication Analytics and Activation Analytics services.** `authAnalyticsService` uses `getByProvider`/`getByPlatform` for its two breakdown methods; `activationAnalyticsService` uses `getBySource`/`getByPlatform` (matching its own dimensions — "source" not "provider," since Activation has no login-provider concept). The two services are not perfectly parallel in naming (e.g. `getByProvider` vs `getBySource`) because each names its breakdown after its own actual dimension, not an arbitrary shared label. During a future final Analytics cleanup, review whether a more consistent naming convention across all analytics modules' public APIs (e.g. a shared `getByX` verb pattern) would help future consumers. Not implemented now, per SR-4 — no real consumer is currently confused or blocked by the current naming, and forcing artificial consistency between genuinely different dimensions risks obscuring meaning rather than clarifying it. Recorded here as technical debt only.

---

**Step 5 status: Implemented, code-verified (tsc/lint/build/119 tests/architecture 7/7 all green).** `activationAnalyticsService` exists as the single reusable business-logic layer over `activation_daily_rollup`, rule-version-aware and Provider-based throughout. No API or dashboard yet.

*Stopping here. Do not proceed to Step 6 until explicitly approved.*
