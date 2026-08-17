# Activation Checklist — Content Safety Gate

**Date:** 2026-08-17 · **Status:** TECHNICAL ACTIVATION PREPARED · **Gate:** NOT ACTIVE

> 🚨 **THIS DOCUMENT IS NOT CORPUS.** It records how to switch on machinery that
> already exists. It asserts no policy semantics, resolves no decision, and is
> subordinate to `01_GOVERNANCE.md` and `02_POLICY_TAXONOMY.md`.

> 🔒 **THE GATE IS OFF AND FAILS CLOSED.** `activationStatus()` returns
> `active: false` with every precondition unmet. While inactive it writes **no**
> publication state at all — new content behaves exactly as it does today. An
> unfinished configuration changes nothing in either direction.

---

## A. Product / Legal decision required

**One decision blocks activation.**

| | |
|---|---|
| **Decision** | Does `ts.hate.protected-target-abuse` block publication? |
| **Where** | `PUBLICATION_GATE_RULES` in `src/lib/safety/gate/publicationGate.ts` |
| **Current value** | `UNRESOLVED` |
| **Owner** | Product, with Legal input |

**Why it exists.** That policy is Legal-blocked at **`G02-D-07b`** (`PROTECTED_TARGET_SET`), so it can never return anything but "cannot tell". Whether an unanswerable policy should hold every upload is not a technical question.

**The two answers the architecture already supports, both tested:**

| | Rule | Effect on a clip with no other blocker |
|---|---|---|
| **A** | `BLOCKS_PUBLICATION` | `UNDER_REVIEW` — nothing publishes until Legal resolves |
| **B** | `DOES_NOT_BLOCK_PUBLICATION` | the other 17 policies decide; a clear clip publishes |

Under **B** the hate policy's own result stays `INSUFFICIENT_EVIDENCE` — the gate sets it aside, it does not rewrite it. **The Legal boundary survives either answer.**

**Related but separate:** resolving `G02-D-07b` itself would dissolve this decision. It is blocked on appointing a Legal Reviewer — Group 01 §5.1 lists nine unassigned roles.

**Also unresolved, and required only before an adverse action is enabled** (not before the gate runs): **GA-8** requires notice *and an appeal path*; `AP-3`/`AP-5` require the appeal to be decided by someone other than the original decider, which `OWN-2` makes impossible while one person holds every role. **No appeal capability exists.** Until it does, `RESTRICTED` may be computed but an adverse notification must not be sent.

---

## B. Migration required

**File:** `supabase/migrations/20260817_content_safety_gate.sql` — **written, validated, NOT APPLIED.**

Validated against the live schema on 2026-08-17:

- no `DROP` / `TRUNCATE` / `DELETE` / backfill / `SET NOT NULL`
- all four `reviews` columns are **nullable with no default** — `NULL` means "predates the gate" and every read path treats it as publishable
- `ADD COLUMN IF NOT EXISTS` throughout, so the migration is re-runnable
- `reviews` does **not** yet have the columns; `content_reports` does **not** yet exist
- FK target `public.reviews(id)` exists
- `content_reports` has RLS enabled, an **INSERT-only** policy and **no SELECT policy** — reports are service-role read only
- `content_reports` stores **no user identity**, only an opaque source id
- `UNIQUE (content_id, reporter_source_id, reason)` — duplicate reports cannot inflate corroboration
- **5 existing rows**, all of which keep `publication_state` NULL and are therefore unchanged

**Action:** apply through the normal Supabase migration path. **Applying it publishes nothing, hides nothing, and reclassifies nothing.**

---

## C. Production configuration required

After A and B:

1. Set the hate gate rule to the decided value (A or B).
2. Set the activation switch — `activationEnabled` — to true.
3. `activationStatus()` returns `active: true` only when **all three** preconditions are met: `GATE_RULES_RESOLVED`, `SCHEMA_MIGRATED`, `ACTIVATION_ENABLED`.

No environment variable alone can activate the gate: an unresolved rule keeps it closed regardless.

---

## D. Deployment required

Normal path: merge to `main` → Vercel deploys. Nothing about the gate is deployed as "on" — the guard reads configuration at runtime.

---

## E. Smoke test

**Six cases, no production write, no notification, no restriction:**

```bash
node --experimental-transform-types scripts/safety/smoke-cases.mjs
```

For each case it prints per-policy results, the publication gate outcome, the final publication state and the notification state.

**One real clip, against production data:**

```bash
node --experimental-transform-types scripts/safety/smoke-one-clip.mjs --review <review-id>
```

**The first production test must use a harmless clip.** It proves upload → gate → state → visibility → edit invalidation → re-evaluation. Only after that passes should a deliberately problematic clip be considered — and that decision is Product's, not an engineering step.

**Expected outcome today, before any decision:** `CONFIGURATION_REQUIRED` → stored `UNDER_REVIEW`. The tooling states in plain words that the clip is held by a missing Product/Legal decision, **not** by a safety finding.

---

## F. Rollback

Rollback is **configuration-based** and deletes nothing.

| Step | Effect |
|---|---|
| Set `activationEnabled` to false | `activationStatus()` returns inactive; the gate writes no publication state |
| Content already marked | Rows keep their stored state. To restore prior visibility set `publication_state` to `NULL` — the legacy value every read path treats as publishable |
| Corpus, registry, policy semantics | **Untouched by rollback.** Nothing in rollback edits them |
| User data | **Untouched.** No content is deleted, no report is deleted |

The migration itself does not need reverting: with the gate inactive the columns are inert.

**Rollback does NOT require:** deleting content · changing the corpus · changing the registry · modifying user data · a deploy, if the switch is runtime configuration.

---

## Frozen technical state

| Property | Value |
|---|---|
| Policies represented | 18 / 18 |
| P1 | 6 / 8, frozen — consent still not established from anything |
| Policy-result layer | independent of the publication gate (proven by test) |
| `PUBLICATION_GATE_RULES` | explicit for all 18; one `UNRESOLVED` |
| Hate gate rule | `UNRESOLVED` |
| `CONFIGURATION_REQUIRED` | distinct from `UNDER_REVIEW` |
| User Report | evidence source only; unverified contributes no basis |
| Access control | server-side on 5 public routes |
| Stale content | an edit invalidates the decision, both directions |
| Notification | generated ≠ sent |
| Enforcement · Group 06 · Group 09 | OFF · OFF · OFF |
| Legal boundary | unchanged |

**Validation, measured 2026-08-17:** 787 policy+safety tests (21 files), 465 adjacent (22 files), **48/48 safety mutations killed** (13 safety-gate + 12 report + 11 access + 12 publication-gate), tsc 0, architecture 8/8, `audit-09d` CLEAN, `gate66-phase0` NO DRIFT, foundation VERIFIED with 0 enforcement tokens, build 126/126, corpus SHA-1 unchanged.
