# Release Readiness Report — Component 9a (Single admin-client construction point)

**Branch:** `feat/controller-v2-component9a-admin-client` · **Base:** `28f68c1` (`origin/main`)
**Diff:** 4 files — `src/` +185 / −21
**Scope:** exactly as approved — no schema, no migration, no env, no business logic, no new abstraction

# ✅ VERDICT: READY FOR REVIEW

Not merged. Not deployed.

---

## 1. What changed

Two routes hand-rolled their own service-role client. Both are gone.

| Route | Was | Now |
|---|---|---|
| `api/iap/apple/notifications` | `function adminSupabase()` | `createAdminClient()` |
| `api/webhooks/stripe` | `function getAdminSupabase()` | `createAdminClient()` |

The complete behaviour-relevant diff is nine lines: two imports swapped, two
local factories deleted, three call sites (including one `ReturnType<typeof …>`)
repointed. No other line in either route was touched.

### The defect this fixes is behavioural, not stylistic

`createAdminClient` applies `{ auth: { autoRefreshToken: false, persistSession:
false } }`. Both hand-rolled factories omitted it. A service-role client with
`autoRefreshToken` on will try to refresh a token it does not have, inside a
serverless handler that is about to be frozen; `persistSession` asks it to write
session state in an environment with nowhere to write. Both routes are webhooks
called by Apple and Stripe with no user session at all.

## 2. Correction to my own earlier report

The roadmap audit that recommended this component said the work was *"change
three call sites"*. That was wrong.

`api/users/search/route.ts` **already used `createAdminClient()`** (line 36). It
reads `SUPABASE_SERVICE_ROLE_KEY` only as an *availability flag* — "attempt the
admin path only if the key is configured". It never constructed a client.

**Two routes were bypassing, not three.** The roadmap audit lives on the
unmerged `feat/controller-v2-component5-capability-registry` branch; its §4
should be corrected to "two" when that branch is merged. Not corrected here —
editing another branch's document from this one would be cross-contamination.

## 3. The Architecture Guard rule

```
no-adhoc-service-role-client
  pattern: /SUPABASE_SERVICE_ROLE_KEY/
  allow:   src/lib/supabase/admin.ts          ← the sanctioned constructor
           src/app/api/users/search/route.ts  ← documented flag read (§2)
```

The exemption is narrow and cannot quietly widen: `admin.test.ts` asserts that
the exempted file contains **no `createClient(` of its own**. If someone adds a
construction there, the test fails even though the guard would not.

### The rule shipped inert, and I caught it

The first version of this rule contained a literal `U+0008` backspace where
`\b` was intended — a shell heredoc collapsed the escape. The pattern was
`/[BACKSPACE]SUPABASE_SERVICE_ROLE_KEY[BACKSPACE]/`, which matches nothing. CI
reported **8/8 rules passing over a live violation**.

**An inert guard is worse than no guard: it manufactures confidence.** It was
found by deliberately planting a violation and confirming the guard went RED —
not by reading the code, which looked correct.

`admin.test.ts` now asserts the pattern contains no stray control characters and
that it actually matches the token it exists for, so this cannot recur silently.

## 4. Tests — 14 new

| Group | What it pins |
|---|---|
| Single construction point | `createAdminClient` applies both hardening flags; it is the only file that reads the key to build a client; the exempted file constructs nothing; no file outside the admin module calls `createClient` with a service-role key |
| The two migrated routes | each imports the sanctioned constructor · no longer imports `@supabase/supabase-js` · defines no local admin factory · every former factory call site now calls `createAdminClient` |
| The guard itself | the rule exists · its pattern is a real regex, not a corrupted one · it exempts only the two documented paths |

These read the **source tree**. A behaviour test proves the call sites that exist
today are correct; it cannot see a third factory added next month.

## 5. Adversarial review

| Attempt | Result |
|---|---|
| **Hidden service-role construction** | ✅ none. Widest sweep (`SERVICE_ROLE`, `service_role`, `serviceRole`, `SUPABASE_SECRET`, `supabaseKey`) across `src/`, `scripts/`, all extensions |
| **Bypasses via a different `createClient`** | ✅ none. Audited all 60 `createClient(` occurrences in `src/`. Two take arguments — `api/auth/anonymous:41` and `modules/music/repository:12` — and **both use the ANON key**, documented in place |
| **Duplicated admin factories** | ✅ both found and removed. They were the finding, not a hypothetical |
| **Accidental behaviour changes** | ✅ none. The only runtime delta is the hardening the objective explicitly sanctions. `ReturnType<typeof …>` was repointed, so the shared helper's parameter type is unchanged in shape |
| **Stale documentation** | ⚠️ one found — §2, on another branch |
| **The guard being inert** | ✅ found and fixed — §3 |

### Out of scope, stated rather than hidden

`scripts/ingest-jamendo.mjs:33` constructs a service-role client
(`{ auth: { persistSession: false } }`, missing `autoRefreshToken: false`).

It is **not** routed through `createAdminClient` and the guard does not scan it.
The guard walks `src/` only, and a plain `.mjs` script cannot import a
TypeScript module behind the `@/` path alias without adding build tooling —
which would be the scope expansion this component forbids.

The objective said "every service-role client". This is the one that is not.
Different threat surface — a manually-run developer ingestion script, not a
request-path handler — but the honest statement is that Component 9a covers the
application, not the tooling. A follow-up could extend the guard to `scripts/`
and give the script its own hardened constructor.

## 6. Gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ exit 0 |
| `vitest run` | ✅ **73 files / 743 tests**, 0 failed |
| `architecture:check` | ✅ **8/8** rules (was 7) |
| `next lint` | ✅ 0 errors |
| `next build` | ✅ exit 0 |

Guard RED/GREEN proven: a planted violation fails CI, removing it passes.

## 7. Scope discipline

| Rule | Held |
|---|---|
| No schema changes | ✅ |
| No migrations | ✅ |
| No env changes | ✅ |
| No business logic changes | ✅ — the nine-line diff in §1 is the whole change |
| No new abstractions | ✅ — `createAdminClient` already existed |
| No feature work | ✅ |
| Components 1–4 untouched | ✅ |

## 8. Honest limits

- The two migrated routes are **webhooks driven by Apple and Stripe**. Neither
  can be exercised locally without a signed payload, so this change is verified
  by type-checking, the source-tree assertions and the build — **not** by
  executing either handler. The runtime delta is a client-construction option,
  which is why that is an acceptable level of proof here; it would not be for a
  logic change.
- Nothing has been verified against production, and nothing should be — this is
  not merged.
- `scripts/ingest-jamendo.mjs` remains outside the invariant (§5).

---

**Stopping here as instructed.** No merge, no deploy.
