# FOUNDATION-10 — Feature-Flag Forensic

How `CONTROLLER_ORG_MEMBERSHIP_ENABLED` behaves in practice, what can and cannot be observed about it, and the operational rules that follow.

Written after a read-only investigation that produced one wrong intermediate conclusion. Both the finding and the mistake are recorded, because the mistake is the more useful of the two.

---

## 1. The flag cannot be read back — by any means

`vercel env add` created the variable with type **Sensitive**. Verified in three places:

| Surface | What it shows |
|---|---|
| `vercel env ls` | name · `Encrypted` · `Production` · age — **no value** |
| `vercel env pull` | `CONTROLLER_ORG_MEMBERSHIP_ENABLED=""` |
| Vercel Dashboard | padlock icon + a `Sensitive` badge + **no value field, no dots, no reveal control** |

Every other project variable renders in the Dashboard with a `<>` icon and an **eye + `•••••••••••••`** — masked but revealable. This one has no reveal control at all.

> **A Sensitive Vercel variable is write-only. Its plaintext cannot be retrieved from the CLI, the API, or the Dashboard.**

### 🚨 The mistake this caused

`vercel env pull` rendered the variable as `""`, and that was read as evidence that the stored value was empty. **It was not evidence of anything.** A control check settled it: **29 of 57 Production variables pull as empty**, including `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`, `STRIPE_SECRET_KEY` and `CRON_SECRET` — all of which demonstrably hold values.

Acting on the false reading, the variable was removed and re-added — an unplanned production mutation that proved nothing and reset its creation timestamp.

**Rule: never infer a value from `env pull`. Diagnose a flag by the runtime behaviour of a deployment that carries it.**

### Consequence for design

**Do not store a feature flag as Sensitive.** A flag that cannot be read cannot be audited: there is no way to answer "is it on?" except by deploying and observing. Sensitive is correct for credentials, wrong for switches.

---

## 2. Changing the variable does not change the running system

Vercel binds environment variables to a deployment when that deployment is created. An existing deployment keeps the snapshot it was built with.

Measured:

| Artefact | Timestamp |
|---|---|
| Production deployment `5217f367` (`tappyai-8cn0twqjw`) | created 08:43:38 |
| Current `CONTROLLER_ORG_MEMBERSHIP_ENABLED` record | created ~4 minutes later |

The running deployment therefore carries the **previous** variable record, not the current one — so its behaviour says nothing about the value stored now.

> ⚠️ **A flag stored but not deployed is *armed*.** The next production deployment — for any unrelated reason — loads it. If that is not wanted, remove the variable rather than leaving it staged.

---

## 3. Deploy through Git, never `vercel redeploy`

`/api/version` returns `process.env.VERCEL_GIT_COMMIT_SHA || 'dev'` (`src/app/api/version/route.ts`).

- A **Git-triggered** deployment sets that variable → `/api/version` reports the real commit.
- `vercel redeploy` does **not** → `/api/version` degrades to `"dev"`, and version reporting (and the stale-tab reload it drives) breaks.

Confirmed: after merging through Git, `/api/version` returned the merge SHA exactly.

Governance note: `main` carries no GitHub branch protection, but every advance in its history is a merge commit from a PR, and pushing directly to `main` is prohibited. The minimum legal way to force a deployment is therefore a **documentation-only PR**.

---

## 4. How to read the runtime flag without touching data

`featureGate()` is the **first statement** in every handler of `src/app/api/admin/org/memberships/route.ts` — before `requirePermission`, before schema parsing, before the service. That ordering makes the endpoint a safe oracle.

Two probes, neither able to mutate anything:

| Probe | Flag OFF | Flag ON |
|---|---|---|
| `POST` with `{}` and **no** credentials | `404` + `{"error":{"code":"NOT_FOUND"}}` | `401` — stopped by `requirePermission` |
| `POST` with **malformed** JSON | `404` — the gate fires before parsing | `401`, or `422` if authenticated |

Always check alongside:

- **`x-matched-path`** — must equal `/api/admin/org/memberships`. A different path (e.g. `/404`) with an HTML body means the route is absent from the build, which is a different failure entirely.
- **`x-vercel-cache`** — must be `MISS`, otherwise a stale edge response is being read.
- **A gate-free control**, e.g. `GET /api/admin/deals` → `401`. If the control also misbehaves, the problem is not the flag.

**Never send a well-formed authenticated payload to this endpoint as a probe: that call creates a membership.**

---

## 5. Operational summary

1. Read the flag by **deploying and probing**, never by inspecting stored values.
2. Keep flags **non-Sensitive** so they stay auditable.
3. Remember that setting a flag **arms** it; the next deployment fires it.
4. Deploy through **Git** so `/api/version` stays truthful.
5. Probe with **malformed, unauthenticated** requests only.
