# Production read-only database access

**Status as of 2026-09-01: NO WORKING CHANNEL.** Read-only production measurement is **unavailable**, and the correct response is to report the missing number as **UNKNOWN**, never to infer it.

This document exists because the same blocker has now been rediscovered twice, ten days apart, by two separate pieces of work. It is written to stop that happening a third time.

---

## 1. The canonical channel

**Supabase Dashboard → SQL Editor → New query**, on project **`fwznnobrdctuskgrvuik`**.

That is the owner-authorized channel, and it is the one every existing procedure already assumes:

- [`ADR-014-migration-apply-checklist.md`](../architecture/ADR-014-migration-apply-checklist.md) §1 applies migrations there, and §2 verifies them there.
- [`K2_PLATFORM_SETTINGS_APPLY_PACK.md`](../controller-v2/runbooks/K2_PLATFORM_SETTINGS_APPLY_PACK.md) §1 names the same project and the same editor.

There is **no separate read-only path**. The SQL Editor is both the apply channel and the measurement channel, which is why losing it costs more than it first appears.

---

## 2. Current status — and why this file exists

| Date | Finding |
|---|---|
| **2026-08-22** | [`K2_PLATFORM_SETTINGS_APPLY_PACK.md`](../controller-v2/runbooks/K2_PLATFORM_SETTINGS_APPLY_PACK.md) §1 records: **apply channel BLOCKED** — no owner access token in either worktree, the session environment, `~/.supabase` or `%APPDATA%`; `supabase projects list` fails auth. The SQL Editor still worked, so work continued through it. |
| **2026-08-30** | The SQL Editor was used successfully for production verification. |
| **2026-09-01** | 🔴 **The SQL Editor and the project dashboard no longer render.** Measured: the page returns ~35 KB of HTML with `readyState: complete`, but **0 buttons, 0 text, 0 Monaco editor models**, across repeated attempts on `/sql/new` and the project root. `api.supabase.com` platform endpoints answer **401** to a cookie-only request, and the Supabase CLI's stored token is **also 401**. |

**The project has therefore gone from one working channel to zero, and nothing in `docs/` describes how to restore either.**

> 🚨 **This is an operational blocker, not a reason to weaken an acceptance criterion.** The security requirement that needed the measurement is unchanged. What is missing is the ability to *take* the measurement — and those are different problems with different fixes.

---

## 3. Restoring access

Only two restoration routes are established by this project's own context. Both are performed **by the Owner**, and neither is something an agent should attempt on its own.

1. **`supabase login`** — re-authenticates the CLI, which is what `supabase projects list` and the platform tooling read.
2. **A fresh owner Personal Access Token**, created from the Supabase account settings.

> 🚨 **No credential, token, token value, connection string or environment value belongs in this repository — including in this file.** Nothing here asserts that a token currently exists; as of 2026-09-01 the CLI's stored token is rejected.

---

## 4. `SUPABASE_SERVICE_ROLE_KEY` is not a substitute

This has been established twice and is recorded here so it is not re-litigated:

- The service-role key is a **PostgREST data JWT**. It has **no DDL path** and no platform/dashboard capability ([`K2_PLATFORM_SETTINGS_APPLY_PACK.md`](../controller-v2/runbooks/K2_PLATFORM_SETTINGS_APPLY_PACK.md) §1).
- **PostgREST does not expose the `auth` schema.** So service-role cannot read `auth.users` at all — including `auth.users.is_anonymous`.

🔑 **The second point is the important one.** Reaching for service-role when the SQL Editor is down is not merely a boundary violation; for any question about `auth.users` it does not even work. A measurement that requires the `auth` schema has exactly one legitimate channel, and it is the one in §1.

---

## 5. The evidence rule

> ### An absent measurement is UNKNOWN, not zero.

Concretely, and each of these has been a live temptation in this project:

- **Indirect audience measurements are not a substitute for querying `auth.users.is_anonymous`.** "The eligible audience is 1, and that person can sign in" is consistent with zero anonymous subscribers. It does not prove it, because the audience is computed from a *proxy* for anonymity (the absence of a `profiles` row) rather than from the authoritative column.
- **"No observed row" through an unavailable channel is not proof.** A recorder that cannot be read, or was never wired up, produces the same empty result as a genuinely empty table. That distinction is the whole subject of [`V2.2_PHASE_C_BROADCAST_CONTRACT.md`](../controller-v2/V2.2_PHASE_C_BROADCAST_CONTRACT.md) §14.4–14.5, where an observation window had to be aborted because the recorder was silently dropping cold-start events.
- **Any production claim that depends on `auth.users` needs direct read-only evidence.** Not inference from email, profile presence, audience fingerprint, admin identity, or which account happens to be signed in.

An honest **UNKNOWN** is a usable engineering state. A number produced by inference and presented as a measurement is not, because nothing downstream can tell the two apart.

---

## 6. If the SQL Editor does not render

There is no supported client-side remedy documented for this, and this file will not invent one. What is documented is what **not** to do:

- ❌ **Do not substitute service-role.** See §4 — for `auth.users` questions it cannot work regardless.
- ❌ **Do not create production data to make a measurement possible.** Creating an anonymous account to test the anonymous path changes the very population being measured.
- ❌ **Do not weaken the acceptance criterion** so that the available evidence happens to satisfy it.
- ❌ **Do not add an API route, view or `SECURITY DEFINER` function purely to make a one-off measurement reachable.** That converts a temporary access problem into permanent privileged surface. If such a reader is ever genuinely wanted, it is its own Owner decision with its own contract — see the Option A / Option B analysis recorded for Phase 5.
- ✅ **Restore a legitimate owner access path** (§3), then take the measurement.

---

## 7. What this currently blocks — Controller V2.2-1

Recorded here so the blocker and its consequence stay attached to each other:

| Item | State |
|---|---|
| C-14 two-step confirmation UI | ✅ **DONE** — [#223](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/223), `ff419cd` |
| Anonymous subscription **creation** prevention | ✅ **DONE** — [#225](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/225), `3b0a2fe` |
| Historical anonymous + profile + enabled subscription population | 🔴 **UNKNOWN / UNPROVEN** — needs the channel in §1 |
| **V2.2-1 overall** | 🔴 **NOT COMPLETE** |

The open question is one query away, and is stated in full in the Phase 5 record: *does any user with `auth.users.is_anonymous = true` currently hold both a `profiles` row and an enabled `notification_subscriptions` row?*

> ⚠️ **Preventive is not curative.** #225 guarantees no **new** anonymous claim can be created. It does not remove one that already exists. Until §1 is available again, the historical population stays **UNKNOWN**, and V2.2-1 stays **NOT COMPLETE**.
