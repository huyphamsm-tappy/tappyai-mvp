# Controller V2.1 — Owner Decisions, 2026-08-23

**Status:** DECISION RECORD — authoritative and current
**Baseline at decision time:** `origin/main` = `afd18a0` · **Controller V2 is COMPLETE and RELEASED** (production `afd18a0`)
**Scope:** Controller **V2.1** — shell / presentation work *after* the V2 release
**Authority:** these decisions were made by the Owner. They are recorded in effect, not reinterpreted.

**Relationship to the earlier records.** [`OWNER_DECISIONS_2026-08-13.md`](OWNER_DECISIONS_2026-08-13.md),
[`OWNER_DECISIONS_2026-08-19.md`](OWNER_DECISIONS_2026-08-19.md) and
[`OWNER_DECISIONS_2026-08-22.md`](OWNER_DECISIONS_2026-08-22.md) are untouched. **Decision F stands** and is **not
reopened** — Controller V2's Definition of Done was met and released on 2026-08-23. Nothing in this record adds to,
subtracts from, or re-audits that DoD. **D8 and D9 stand** (see D10 for the precise boundary with D9).

Decision ids continue the sequence used in the 2026-08-22 record (D1–D9) so that no id is ambiguous across files.

---

## D10 — Controller visual theme: **FIXED DARK. APPROVED.**

### The decision, as given

> Controller V2.1 adopts a **fixed dark visual theme** for the Controller surface. This is **presentation-only** and
> does **not** introduce a theme preference, theme switch, persistence, or authorization behavior.

### 🔑 The boundary with D9 — stated so the two are never confused

| | D9 (2026-08-23, **still DEFERRED**) | D10 (this decision, **APPROVED**) |
|---|---|---|
| What it is | **dark *mode*** — a user-selectable preference | **dark *theme*** — a fixed product surface |
| Needs a preference contract? | **Yes** — that is exactly why it was deferred | **No** |
| Introduces state? | Yes (per-user preference, persistence) | **None** |

**D9 is not superseded and is not partially implemented by this.** D9 was deferred because *"what is missing is a
**theme-preference contract on the Controller side**"* — the **switch**, not the palette. D10 ships the palette and no
switch, so D9's blocker is untouched and D9 remains deferred exactly as written.

**Explicitly NOT introduced by D10:** theme switch · light/dark preference · `localStorage` theme · cookie theme ·
database theme preference · per-user theme · system-theme (`prefers-color-scheme`) detection.

### Why this was a decision and not a bug fix

**MEASURED on production `afd18a0`, in the browser:** the Controller surface rendered **white** —
`background: rgb(255,255,255)`, `--background: 0 0% 100%`, no `dark` class on `<html>` on any page. The cause is that
`.admin-theme` was **applied as a wrapper but never defined as a CSS rule** (`git grep "\.admin-theme" -- "*.css"`
matched only a comment), so its tokens resolved from the light `:root`.

The Controller was therefore **visually inconsistent with itself**, which is what made this worth deciding:

| Surface | State before D10 |
|---|---|
| Controller **login** (`/login` with a Controller `returnTo`) | **already dark** — `bg-[#070E1F]` |
| Controller **public home** (`/controller`) | **already dark** — same palette family |
| `/admin/analytics` | **already dark** — hard-coded `bg-gray-950 text-white` |
| every other `/admin` surface | **light** |

### Palette — adopted, not invented

D10 adopts the dark palette the Controller's own login and public-home surfaces already use, rather than inventing a
second one: page `#070E1F` · card `#0B1428` · elevated `#0E1A33` · accent `#2E7BF6` / `#4C9AFF` · success `#3ECF8E`.

**Contrast measured against the page background, WCAG 2.1:** foreground `#E6ECF7` **16.2:1** · muted `#9FB0CC`
**8.8:1** · accent `#4C9AFF` **6.8:1** · success `#3ECF8E` **9.6:1**. All exceed AA for normal text (4.5:1).

### Scope — Controller surface only

`.admin-theme` becomes the **canonical Controller theme boundary**. It is a scoped class, never a global or
document-level theme. **The consumer app is not touched**: it keeps its own `:root` light palette and its existing
`Header` toggle, and `ui/dialog.tsx` — which carries `.admin-theme` — was **measured to have exactly one importer,
`CommandPalette.tsx` (admin)**, so no consumer dialog changes appearance.

---

## D11 — Department selection after login: **NOT BUILT**

### The decision, as given

> **Department selection after login is NOT a requirement of V2.1.** No popup, no Department Switcher, no
> `active_department` state, no user-selected department.

### The canonical flow

```
LOGIN
  → authentication
  → corporate identity check          (FOUNDATION-10C, Option B)
  → membership resolution
  → DERIVED department context        (never chosen)
  → Controller Home
```

### What department is, and is not

| | |
|---|---|
| **Is** | navigation · presentation · context |
| **Is NOT** | authorization. `requirePermission()` / the PDP remain the **sole** authority |
| `Actor` | does **not** gain a department field |
| State | **no** `active_department`, no department cookie, no `localStorage`, no per-user department preference |
| UI | **no** selector, **no** switcher, **no** drill-down route |
| `DepartmentCard` | remains **display-only** — no `href`, no `onClick`, no button/link role |

This ratifies, rather than changes, what
[`FOUNDATION-10_RESOURCE_ENFORCEMENT_DECISION.md`](FOUNDATION-10_RESOURCE_ENFORCEMENT_DECISION.md) §1 already measured:
*"**Verdict: 2 — SAFE ONLY AS NAVIGATION / PRESENTATION SCOPE** … F-10 must therefore be described as
**department-aware navigation**, never as department isolation."*

### 🔴 The future case, bounded rather than left open

If an actor ever holds **more than one** membership, **no behaviour is to be invented.** Selection or switching
requires its **own Owner decision** first. Today `homeMode()` renders every department the actor's scope covers, and
that stays.

---

## D12 — The DepartmentSwitcher removal, recorded in SSOT (retroactive)

**The decision itself was taken 2026-08-21 (option A) and executed. It was never written into SSOT** — it lived only in
two source locations, `CommandHeader.tsx` and `departmentSwitcherRemoved.test.tsx`. A binding product decision that
exists only in a code comment is the drift class `STATUS.md`'s own banner exists to prevent, so it is captured here.

> **Owner decision, 2026-08-21 — option A: REMOVE the department switcher.**

**Why it went rather than got wired**, as measured at the time: *"`selected` was written by its own `onChange` and read
only by its own `value`… **no route accepted a department parameter**; `Actor` carries no department field… **Nothing in
the repository ever defined what SELECTING a department should do, so no behaviour was invented.**"*

**What the removal deliberately preserved** — and what D11 now confirms as permanent for V2.1:
departments are **still DISPLAYED** · membership **still scopes navigation** (`filterNavByDepartment`) · the membership
API is untouched · the department registry and summaries remain.

**Scope of the removal, stated precisely** so it is not over-read: it removed **one control — the `<select>` in
`CommandHeader`**. It did not, by itself, decide the concept of department selection. **D11 decides that.**

---

## D13 — `HomeMode` semantics, recorded in SSOT

`HomeMode` is referenced in source as "FOUNDATION-08", and **no FOUNDATION-08 document exists** (measured: 0 files).
The semantics are load-bearing for the Home, so they are recorded here as the authoritative statement.

```
homeMode(ctx):
  ctx.isOwner              → 'owner'       — Enterprise Overview: all 15 departments
  ctx.memberships.length>0 → 'department'  — Your Workspace: only the actor's own
  otherwise                → 'none'        — NoWorkspace
```

**It is derived, never selected**, and `authorizedScopes()` is the isolation boundary **for Home rendering only**: the
Owner sees all 15; everyone else sees only their own active-membership departments. That is a presentation boundary, not
an authorization one — the PDP has already run, and it never receives a department.

---

## Outcome — released and accepted

| | |
|---|---|
| **D10** fixed dark theme · **D11** derived department context · **D12/D13** SSOT capture | shipped `bdbade4` ([#164](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/164)) |
| **Home design pass** (hierarchy · honest affordances · theme tokens) | shipped `eba35a9` ([#165](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/165)) |
| Production | `eba35a9`, `/api/version` matching, `main` == production |
| **Owner authenticated UAT, 2026-08-23** | ✅ **PASS on every checked item; no Home bugs found** |

Evidence and the full checklist: [`STATUS.md` § Controller V2.1](STATUS.md#controller-v21--owner-uat-verified-2026-08-23).

**D9 is unchanged by this outcome.** A fixed dark Controller shipped; a theme *preference* did not, and D9 stays
deferred with its conditions for return intact.

## Consequences

1. **Controller V2's Definition of Done is NOT reopened.** V2 remains COMPLETE and RELEASED at `afd18a0`.
2. **D9 remains DEFERRED.** D10 ships a palette, not a preference.
3. **No database, API, schema, RBAC, PDP, `Actor` or authorization change** is authorized by any decision here.
4. **K-1 and K-3 are untouched.** Capability binding stays role-derived with the gate `false`; the event sink is
   unchanged.
5. Department remains navigation/presentation/context, permanently for V2.1.
