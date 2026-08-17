# Architectural Precedent — Policy-as-Data (Source / Provider / Engine)

> **STATUS: PRECEDENT, NOT A COMMITMENT.** This records a pattern that is
> already shipped in this repository and already owner-approved, so that future
> architecture can reuse it deliberately instead of rediscovering it. Nothing
> here obliges any project to adopt it.

**Date:** 2026-08-15 · **Base commit:** `906c254`

---

## 1. Where the pattern already lives

Activation Analytics, Step 2 (`src/lib/admin/analytics/`) implements rules as
data in three separated parts. The separation is stated in the files themselves,
not inferred:

| Part | File | Stated role |
|---|---|---|
| **Source** | `activationRules/registry.ts` | "Declarative rule definitions only — no evaluation logic here and no storage/lookup logic here." |
| **Provider** | `activationRuleProvider.ts` | "The **ONLY** seam between the Engine and however rules are actually stored." Owns lifecycle filtering. |
| **Engine** | `activationRuleEngine.ts` | "The one generic evaluator… Knows nothing about 'AI answers' or 'saved places'." Depends only on the Provider interface. |

`src/lib/scam-shield/` reaches a similar shape from a different direction:
declared weights and thresholds in `config.ts`, a generic scorer in
`engine/riskEngine.ts`, and a level mapping in `engine/levels.ts`.

---

## 2. The pattern

**Source** — the rules, as inert data. No evaluation. No storage access.

**Provider** — the single interface between the engine and wherever rules
actually live. It also owns *lifecycle*: which rules are currently in force.

```
Provider {
  getActive(asOf?): Rule[]      // enabled AND within its effective window
  getById(id): Rule | null      // any state — needed to explain a past decision
}
```

**Engine** — one generic evaluator that knows the rule *grammar* and nothing
about any particular rule. It depends on the Provider interface only.

### 2.1 Lifecycle metadata belongs on the rule

`enabled`, `effectiveFrom`, `effectiveTo`, and a `version` — carried as fields,
filtered by the Provider. This is what makes "which rule was in force last
Tuesday" an answerable question rather than an archaeology exercise.

### 2.2 The payoff

Stated in the precedent's own comments:

> A future database / feature-flag / remote-config Rule Source implements this
> same interface — zero change to the Engine, service, API, or dashboard.

---

## 3. The constraint that decides whether it is real

`ActivationSignalDefinition.match` is a **JavaScript closure**:

```ts
match?: (properties: Record<string, unknown>) => boolean
```

This is the one part of the precedent that does **not** survive contact with a
non-code rule source. A function cannot be loaded from a database, cannot be
versioned as a value, cannot be diffed in review, and cannot be quoted in an
audit record. While any part of a rule is a closure, the rule is code wearing a
data costume — and the promise in §2.2 is not actually available.

**If a future project wants rules that are genuinely data, every predicate must
be a serialisable expression the engine interprets, with no executable member
at any depth — and that must be enforced by a test, not by convention.**

A closed, finite operator set is the price. An open one is how a data format
quietly becomes a scripting language.

### 3.1 Two obligations that follow

- **Unknown operator ⇒ deny / no-match, never skip.** The same discipline that
  makes an undeclared permission a loud denial rather than a silent allow.
- **A decision must record the `id` + `version` of the rule that produced it.**
  Once rules can change at runtime, a decision record without a version cannot
  be explained after the fact.

---

## 4. When this pattern is worth its cost

It pays when rules change on a different cadence than code, when someone
non-engineering needs to read them, when "which rule applied, and when" must be
answerable, or when the same evaluation runs over many rule variants.

It does not pay for a decision with one rule that changes when the code does.
Two indirections and a grammar are real cost, and the precedent's own
minimalism rule applies — *no `listAllRules()` until a real consumer needs one.*

---

## 5. Provenance

Extracted from an abandoned draft (`856f3e3`, never pushed, never merged) that
misread "Policy Architecture" as authorization policy. The domain-specific
content of that draft is discarded; only this pattern survives, deliberately
stated without reference to any domain.
