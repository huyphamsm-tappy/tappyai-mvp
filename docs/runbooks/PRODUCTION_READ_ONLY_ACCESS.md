# Production read-only database access

**Status as of 2026-09-01: the SQL Editor WORKS.** A direct read-only production measurement was performed through it the same day — see §2.

> 🚨 **THIS FILE'S FIRST VERSION SAID THE OPPOSITE, AND IT WAS WRONG.** It reported "NO WORKING CHANNEL" on the strength of DOM probes that returned zero buttons, zero text and zero Monaco models. **A screenshot of the same page showed a fully rendered SQL Editor.** The instrument was fine; the *measurement of the instrument* was broken, and the wrong conclusion was published rather than checked.
>
> That is the same failure this document warns about in §5, committed by the document itself. It is corrected here rather than quietly overwritten, because a runbook that hid its own false negative would be teaching the wrong lesson.
>
> 🔑 **The operational takeaway: when a page appears empty, LOOK AT IT.** A screenshot is one call and settles in seconds what a DOM query can get confidently wrong — a client-rendered app can be fully painted while a scripted probe sees nothing, and "the page is broken" is a much bigger claim than "my selector found nothing."

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
| **2026-09-01 (first, WRONG)** | The SQL Editor was reported as not rendering — ~35 KB of HTML, `readyState: complete`, but 0 buttons, 0 text, 0 Monaco models from DOM probes. **This diagnosis was false and is superseded.** |
| **2026-09-01 (corrected)** | ✅ **The SQL Editor works.** A screenshot showed it fully rendered — Run button, `Primary Database`, role `postgres`, branch banner `main PRODUCTION`. The editor's Monaco model was then set via `window.monaco.editor.getModels()[0].setValue(...)` and the query run from the UI. **A direct read-only measurement of `auth.users` was completed**, recorded in [`V2.2_PHASE_C_BROADCAST_CONTRACT.md`](../controller-v2/V2.2_PHASE_C_BROADCAST_CONTRACT.md) §15.3. |

**Still true:** the Supabase **CLI** has no owner token (`~/.supabase` holds only `telemetry.json` and `traces`; `SUPABASE_ACCESS_TOKEN` is unset), and `api.supabase.com` answers **401** to a cookie-only request. So the CLI/platform-API route remains unavailable — but **the SQL Editor, which is the canonical channel in §1, is not**.

> 🚨 **The lesson worth keeping is not "the dashboard was down."** It never was. The lesson is that a broken *observation* was mistaken for a broken *system*, and an acceptance criterion was nearly parked as UNKNOWN because of it. Verify the instrument before reporting what it shows — visually, if the alternative is a scripted probe you have not validated.

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

## 7. What this channel unblocked — Controller V2.2-1

Recorded here so the channel and what depended on it stay attached to each other:

| Item | State |
|---|---|
| C-14 two-step confirmation UI | ✅ **DONE** — [#223](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/223), `ff419cd` |
| Anonymous subscription **creation** prevention | ✅ **DONE** — [#225](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/225), `3b0a2fe` |
| Historical anonymous + profile + enabled subscription population | ✅ **MEASURED ZERO** — 2026-09-01, direct read through §1 |
| **V2.2-1 overall** | ✅ **CLOSED on current production state** |

The question was one query away, and the query was run: *does any user with `auth.users.is_anonymous = true` currently hold both a `profiles` row and an enabled `notification_subscriptions` row?* **No.** Full result, control query and caveats: [`V2.2_PHASE_C_BROADCAST_CONTRACT.md`](../controller-v2/V2.2_PHASE_C_BROADCAST_CONTRACT.md) §15.3.

> ⚠️ **Preventive is not curative, and the measurement is point-in-time.** #225 guarantees no **new** anonymous claim can be created; it does not remove one that already exists. The measurement says none exists **on 2026-09-01**. Neither statement is a guarantee about the future — together they are simply the strongest thing that can honestly be said.
>
> 🔑 And note what the control query showed: **324 anonymous users exist, one with a legacy profile.** "Measured zero" means zero satisfying *all three* conditions. It does not mean there are no anonymous users, and this file should never be cited as if it did.
