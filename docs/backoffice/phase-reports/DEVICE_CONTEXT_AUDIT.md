# device_context — Critical Architecture Audit

**Method:** static review of the implementation + repo-wide grep for competing device/platform detection and for `device_context` consumers, cross-checked against the frozen envelope architecture and the Auth/Activation Analytics consumers.

**Verdict: PASS.** No blocking defects. Two pre-existing, out-of-scope, LOW-severity duplications flagged (not introduced by this work, not silently changed). Two accepted, documented tradeoffs. One LOW privacy consideration.

---

## 1. Duplicated device detection — **CLEAN (in scope); 1 pre-existing LOW flagged**

- **In the analytics pipeline:** none. The former `getDeviceType`/`getOs` were **removed** from `envelope.ts` and consolidated into the single `deviceContext.ts`; the envelope now projects its flat fields from that one detection. `grep` confirms no other `userAgent`/OS/`window.screen`/`timeZone` detection exists in the analytics path.
- **F-1 (LOW, pre-existing, out-of-scope):** `src/app/login/page.tsx:18-19` does its own `navigator.userAgent` + `/Android/i` test. This is an **auth-flow** branch (native-vs-web login handling), not analytics telemetry — a different domain that predates this work. It duplicates only the "is Android" *concept*, not the analytics detection logic.
  - **Classification:** LOW, pre-existing, out-of-scope.
  - **Proposed fix (NOT applied):** optionally route it through a tiny shared `isAndroid()` helper (or `detectDeviceContext().os_name === 'Android'`) during a future auth cleanup. Not done here because (a) it's outside the analytics scope, (b) coupling the login flow to the analytics module is heavier than the local check, and (c) the rules forbid silently changing architecture.

## 2. Duplicated platform logic — **CLEAN**

- `platform` is set in exactly one place (`detectDeviceContext` → `'web'`), and the envelope's flat `platform` is projected from it. No second platform-derivation.
- `src/lib/admin/audit.ts` captures the **raw** `user-agent` header for the admin audit trail — it stores the string, performs **no parsing/detection**, and serves a different domain (admin audit, not telemetry). Not a duplication.

## 3. Unnecessary schema changes — **NONE**

- Exactly **one** additive, nullable `device_context jsonb` column. No new flat columns (the rejected alternative), no changes to existing columns/constraints/RLS/functions, no changes to any existing migration. Consumed by nothing yet → zero blast radius.

## 4. Future Android/iOS incompatibilities — **NONE FOUND**

- The `DeviceContext` contract is platform-neutral (no web-only field is *required*; `browser_name`/`browser_version`/`device_model` gracefully carry `'unknown'` where a platform can't supply them — e.g. iOS has no browser).
- Native clients post the same object to the same endpoint into the same column with **no backend/schema change**. `platform` is a free string (`'web'|'android'|'ios'|'unknown'`), not a Web-locked enum at rest.
- **Consistency note (not a defect):** `device_type` uses `'phone'` (matching the existing envelope's long-standing value), not `'mobile'`. Android/iOS must emit `'phone'`/`'tablet'`/`'desktop'` to match. Documented as the canonical vocabulary so native parity is unambiguous.
- **Added fields map cleanly to native:** `manufacturer`→`Build.MANUFACTURER`/`'Apple'`; `pixel_ratio`→`DisplayMetrics.density`/`UIScreen.scale`; `color_scheme`→system dark-mode (`UiModeManager`/`UITraitCollection`). No web-only assumption blocks native population.

## 5. Unnecessary payload growth — **ACCEPTED, QUANTIFIED**

- Per event, `device_context` adds ~13–15 short fields (jsonb). Of these, 5 (`platform`, `os_name`, `os_version`, `device_type`, `app_version`) are **also** in flat columns — a value-level denormalization (~60–100 bytes/row), not duplicated logic. The 15th-field contract (incl. the added `manufacturer`/`pixel_ratio`/`color_scheme`) contains **no** field outside the required contract; nothing is stored gratuitously, and adding the 3 fields cost **zero** new columns/migration (jsonb).
- **Classification:** accepted tradeoff (documented in the Architecture Decision). It is the necessary cost of keeping the flat columns for backward-compatible rollups. The rejected "store only non-overlapping fields" variant would eliminate the copy but split the contract across columns+jsonb at rest — worse for readers. No gratuitous growth: no field is stored that isn't part of the required contract.

## 6. Privacy — **1 LOW consideration, no PII**

- **No PII:** `device_context` contains only os/browser/screen/timezone/model/locale/versions — no email, phone, name, or precise location (`country` is deliberately *excluded* from the contract and stays server-derived). The values are produced by our own detection, not user free-text, so the existing `metadata` PII filter needn't extend to it.
- **P-1 (LOW):** the *combination* of `screen_width/height` + `pixel_ratio` + `color_scheme` + `timezone` + `browser_version` + `os_version` is a mild device-fingerprint surface — standard for any analytics SDK, but worth naming (the added `pixel_ratio`/`color_scheme` marginally increase it; `manufacturer`/`color_scheme` are low-entropy). Mitigations (NOT implemented, noted for a future privacy pass if required): coarsen screen dims/pixel_ratio to buckets, drop `timezone`, or truncate `browser_version` to major. Current posture is low-risk: the data is server-side only (never exposed to other users), write-only via the service-role path, and read only through RBAC-gated (`analyst`+) admin dashboards — and nothing reads `device_context` yet at all.
- **Honesty of `manufacturer` inference:** deriving `'Apple'` from an iPhone UA (or `'Samsung'` from an `SM-` model) is **factual derivation**, not fabrication — an iPhone *is* made by Apple. Where no OEM signal exists (generic desktop), it is `'unknown'`. This satisfies the "never fabricate" rule.

## 7. Backward compatibility — **CLEAN, 1 minor documented normalization**

- Callers, existing events, dashboards, APIs, migrations, and existing rows are all unaffected (flat columns still written; `device_context` nullable and unread). Verified: `userAcquisitionService` and the activation cron read only flat fields.
- **B-1 (informational):** flat `os_version` now emits `'unknown'` (was `''`) for undetectable versions. No consumer reads `os_version` (grep-verified across analytics services/rollups/tests), and `'unknown'` is the more honest value per the contract's rule. Safe; documented in the Architecture Decision.

---

## Findings summary

| ID | Area | Severity | Status | Action |
|---|---|---|---|---|
| F-1 | Duplicated detection (`login/page.tsx` isAndroid) | LOW | Pre-existing, out-of-scope | Flagged; fix proposed, **not applied** |
| P-1 | Fingerprint surface (screen+tz+versions) | LOW | Accepted | Mitigations noted, not required now |
| — | Payload denormalization (5 fields) | — | Accepted tradeoff | Documented in decision |
| B-1 | `os_version` `''`→`'unknown'` | Info | Safe normalization | Documented |

**No defect requires a change before review.** All items are either pre-existing/out-of-scope (flagged, not silently altered) or accepted-and-documented tradeoffs. The implementation introduces no duplicated logic, no unnecessary schema change, no Android/iOS incompatibility, and no PII, and preserves Authentication and Activation Analytics unchanged.
