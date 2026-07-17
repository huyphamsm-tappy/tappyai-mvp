# ADR-013: Pricing Catalog

**Status:** Accepted (Sprint 5). Foundation only — nothing in production reads
these values yet.
**Related:** ADR-014 (Cost Calculator), ADR-015 (Budget Policy).

## Context

Sprints 2–4 built a Router/Policy/Capability Registry that can resolve
`(role, capabilities) → (provider, model)`. Comparing providers on *cost* is
a natural next question once more than one exists — but nothing in the
codebase described what anything actually costs. Sprint 5's brief is explicit
that this sprint prepares the foundation only: no live pricing API, no online
fetch, no runtime cost optimization.

The Owner Architecture Principle, appended to this sprint's brief, sets the
governing constraint for everything in this ADR: **pricing data is not
source of truth**. The catalog is a replaceable configuration layer; a real
vendor invoice or published pricing page is the actual authority. Updating a
price must only ever mean editing data here — never touching the Cost
Calculator's logic, the Pricing Contract's shape, or anything upstream.

## Decision

- `pricing.ts` defines the **contract**: `ModelPricing` — `provider`, `model`,
  `inputTokenPrice`, `outputTokenPrice`, an optional `cachedInputPrice`,
  `currency`, `effectiveDate`. All four price fields are documented as USD
  (or `currency`) **per 1,000,000 tokens** — the unit every major vendor
  (Anthropic, OpenAI, Google) actually publishes in — fixed once in the
  contract's doc comment rather than re-specified per entry.
- `pricingCatalog.ts` defines the **data**: `PRICING_CATALOG`, a plain array
  of `ModelPricing`, plus `findPricing(provider, model)` and
  `PRICING_CATALOG_VERSION` (a version tag bumped whenever the array's values
  change, threaded through to telemetry — see ADR-014).
- **Only the two Claude model ids actually in use today**
  (`claude-haiku-4-5`, `claude-haiku-4-5-20251001` — `providers/claude.ts`'s
  `DEFAULT_MODELS`) have entries. Every other installed-or-recognized
  provider (Gemini, OpenAI, Grok, DeepSeek) has **zero** entries — the
  "empty placeholder" the brief calls for. `findPricing` naturally returns
  `undefined` for them; nothing needed to be special-cased to make that true.
- `cachedInputPrice` is **omitted** for both Claude entries. Anthropic's
  prompt-cache "hit" rate is real and already used in this codebase
  (`ClaudeProvider.decorateMessages`), but its exact current discount isn't
  confirmed here — omitting it means the Cost Calculator prices cached
  tokens at the plain `inputTokenPrice`, which **over-estimates** rather than
  under-estimates real spend. Given the Owner Architecture Principle, an
  honest over-estimate is safer than a guessed discount presented as fact.

## Alternatives Considered

1. **Fetch pricing from a live vendor API or scrape a pricing page.**
   Explicitly forbidden by the brief ("Do NOT use live pricing APIs. Do NOT
   fetch pricing online"). Also directly at odds with "pricing data is not
   source of truth" — a live fetch implies the fetched value IS the source
   of truth, which the Owner Architecture Principle rejects outright.
2. **Store pricing as JSON/config file, loaded at runtime, instead of a TS
   array.** Rejected as unnecessary indirection for this sprint — a plain
   exported array already satisfies "configuration-driven" (it's data,
   separate from logic) without adding a file-loading mechanism nobody asked
   for. Nothing prevents migrating to a loaded-config file later; that's a
   mechanical change, not an architectural one.
3. **Guess a specific Claude prompt-cache discount rate and include
   `cachedInputPrice`.** Rejected — an unconfirmed number presented as
   confident data is exactly what "not source of truth" warns against.
   Omitting it and over-estimating is the honest choice.
4. **Add placeholder Gemini/OpenAI entries with `null`/`0` prices instead of
   omitting them entirely.** Rejected: a `0`-priced entry is indistinguishable
   from "this model is free," which is false and misleading. Omission (no
   entry at all) is the only representation that can't be misread as a claim.

## Trade-offs

- **Pro:** adding, correcting, or removing a price is a one-line data change
  in `pricingCatalog.ts` — the Cost Calculator, the Telemetry Contract, and
  every caller are completely unaffected (verified: `golden.test.ts`'s
  Cost-Calculator tests don't hardcode Claude's specific numbers anywhere
  except the one test asserting today's catalog values compute the expected
  total, which would need updating alongside a real price change — by
  design, since that test's whole job is to catch silent catalog drift).
- **Con:** the two real entries' numbers are best-effort, not vendor-invoiced
  — anyone using them for an actual budget decision must verify against
  Anthropic's current published pricing first, per the Owner Architecture
  Principle disclosed directly in the catalog's own file comment.
- **Con:** omitting Gemini pricing means any future telemetry involving
  Gemini (e.g. during `LLM_PROVIDER_OVERRIDE` staging validation) reports no
  cost estimate at all, rather than an approximate one — an intentional
  trade favoring "no number" over "a fabricated number."

## Future Evolution

- Add real Gemini pricing once genuinely needed (e.g. before Phase 6 of the
  original Sprint 1 migration plan — flipping one role to a second provider)
  — a pure data addition, no other file changes required.
- Confirm and add Claude's real `cachedInputPrice` once the org verifies the
  current discount rate — same, a pure data change.
- If pricing data volume or update frequency ever justifies it, migrate
  `PRICING_CATALOG` from an in-repo array to an externally-loaded
  configuration source (e.g. a small JSON file, or a DB table) — the contract
  (`ModelPricing`) and the calculator are already decoupled from *how* the
  catalog is populated, so this would not require touching either.
