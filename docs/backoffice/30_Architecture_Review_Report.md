# TappyAI Back Office Platform — Architecture Review Report

**Reviewer role:** Chief Software Architect  
**Version:** 1.0  
**Date:** 2026-07-13  
**Scope:** All documents under `docs/backoffice/` (00–35)  
**Status of this report:** FINAL review — **architecture APPROVED & FROZEN by owner 2026-07-13** (see Addendum §12)

---

## 1. Executive Summary

The TappyAI Back Office architecture has been reviewed end-to-end against the stated requirements and against production-readiness criteria (correctness, scalability, security, maintainability, cross-platform consistency).

The initial draft (v1.0) was **structurally strong but had eight production-blocking gaps**, concentrated in the analytics ingestion and computation layer — the part that, if wrong, silently corrupts every downstream number. These have been resolved in this review pass (documents bumped to v1.1) and six explicitly-required documents that were missing have been authored.

### Recommendation: ✅ **READY FOR IMPLEMENTATION — conditional**

The architecture is **approved-ready to begin Phase 0 and Phase 1** subject to the owner:
1. Approving the seven architectural decisions listed in §5 (they are choices, not just facts).
2. Providing the owner-blocked external items in §7 before the phases that need them.

No production-blocking architectural gap remains open. The conditions are approvals and external credentials, not further design work.

---

## 2. Review Method

Each document was assessed on five axes:

| Axis | Question |
|---|---|
| Correctness | Will the design produce *accurate* results under real conditions (retries, offline, timezones, scale)? |
| Completeness | Does it cover every stated requirement? |
| Scalability | Does it hold from MVP to 1M+ MAU without a rewrite? |
| Security | Is every access path authorized and audited? |
| Consistency | Do Web, Android, and iOS behave identically? |

---

## 3. Findings — What Was Wrong and Now Fixed

### 3.1 Production-Blocking (all resolved in v1.1)

| # | Finding | Risk if shipped as-is | Resolution |
|---|---|---|---|
| B1 | **No event idempotency** — batched clients retry; events double-counted | Every count (DAU, revenue, cost) inflated by an unknown factor | `event_id` UUID + `ON CONFLICT DO NOTHING` (Analytics §8A.1, DB §7A) |
| B2 | **Undefined reporting timezone** — day boundary ambiguous; UTC splits the VN evening peak | Every per-day metric wrong/unstable | Canonical `Asia/Ho_Chi_Minh`; snapshot cron at 00:05 VN (Analytics §8B) |
| B3 | **No MAU/WAU computation strategy** — nightly 28-day rescans don't scale | Rollup cron slows and eventually times out | `user_active_days` rolling table (Analytics §8C, DB §7A) |
| B4 | **Late-arriving (offline) events** ignored after finalization | Permanent undercount of mobile users | Provisional + 3-day reconcile (`is_final`) (Analytics §8A.4) |
| B5 | **Affiliate/redirect events missing** though the core funnel ends there | The monetization funnel could not be measured | Added §12A events (Event Catalog) |
| B6 | **Anonymous identity not first-class** | Signup-conversion funnel unmeasurable | `anon_id` + `anon_identity_map` stitching (Analytics §8D) |
| B7 | **No event schema versioning** | Envelope changes break old field apps | `schema_version` field + governance (Event Catalog §1) |
| B8 | **Ingestion unhardened** (no payload caps, bot/PII filtering) | Abuse, cost blowout, PII leakage into analytics | Limits + filtering (Analytics §8A.3) |

### 3.2 Required Documents That Were Missing (now authored)

| Document | Why it was required |
|---|---|
| `24_Data_Dictionary.md` | Explicitly requested; single field-definition authority; prevents metric drift |
| `25_KPI_Definitions.md` | Explicitly requested; exact formula per metric; comparability over time |
| `26_Founder_Dashboard.md` | Requested; distinct from Home/Investor; founders' control room |
| `27_User_And_Notification_Journeys.md` | Requested; ties events → lifecycle → engagement targeting |
| `28_API_Governance.md` | Requested; versioning/deprecation/idempotency for a native-app client that can't be force-updated |
| `29_Database_Governance.md` | Requested; migration safety, RLS discipline, retention, partitioning path |

### 3.3 Minor / Non-Blocking Observations (accepted, tracked)

| Obs | Note | Disposition |
|---|---|---|
| PostHog not on native | Android/iOS don't send to PostHog; funnels are web-only until SDKs added | Documented in Analytics §8; native PostHog is a Phase-1 nice-to-have, not blocking (own pipeline covers funnels) |
| Session definition | Was implicit | Now defined (30-min inactivity) in Data Dictionary §4 |
| Investor shareable link | Public data without login = exposure | Mitigated: signed, expiring, revocable, max-3, audited (Investor §5). Owner should confirm acceptable. |
| "Gross margin" wording | Only AI cost subtracted | Labeled "(est.)" everywhere (KPI §6) |
| Crash capture on native | Requires platform hooks | `app_error_occurred` defined; native crash-handler wiring is an implementation detail for Phase 1 |

---

## 4. Requirements Coverage Matrix

Every stated analytics requirement maps to a defined event + KPI + storage:

| Requirement | Event(s) | KPI Doc | Storage |
|---|---|---|---|
| App opens | `app_session_started` | §3 | daily_snapshots |
| Sessions | session envelope | §3 | daily_snapshots |
| DAU/WAU/MAU | (derived) | §3 | user_active_days |
| Retention / Returning / Churn | (derived) | §2,§4 | cohort_metrics, user_active_days |
| User growth | `auth_signup_completed` | §2 | profiles, daily_snapshots |
| Feature usage | `feature_opened` | §3 | feature_usage_rollup |
| Screen usage | `app_screen_viewed` | — | track_events |
| AI usage & cost | chat + `ai_usage_log` | §5 | ai_usage_log |
| Search behavior | `search_performed` | §7 | track_events |
| Notifications | notification_* | §8 | notification_deliveries |
| Engagement | like/comment/share/save | §3 | daily_snapshots |
| Free quota / exhausted | `chat_quota_reached` | §5 | track_events |
| Conversion to paid (future) | `subscription_checkout_completed` | §6 | subscriptions |
| Funnels | full funnel events | §7 | track_events + PostHog |
| Cohorts | (derived) | §4 | cohort_metrics |
| Crash / performance | `app_error_occurred` | §9 | version_analytics |
| Affiliate clicks | `affiliate_link_clicked` | §7 | track_events |
| Business metrics | subscription events | §6 | subscriptions, daily_snapshots |
| Platform/version/build on every event | envelope | — | track_events |

**Coverage: complete.** Every requirement has an event, a KPI definition, and a storage location.

---

## 5. Decisions Requiring Owner Approval

These are genuine choices where the owner's context should confirm the default:

| # | Decision | Default Chosen | Reversible? |
|---|---|---|---|
| D1 | Reporting timezone = `Asia/Ho_Chi_Minh` | Yes (VN-first product) | Hard later (recompute history) |
| D2 | Back office in the same Vercel/Next.js repo (ADR-001) | Yes | Medium |
| D3 | Analytics in Supabase Postgres, not ClickHouse (ADR-002) | Yes (MVP scale) | Easy (export snapshots) |
| D4 | RBAC roles = super_admin/admin/moderator/analyst (ADR-003) | Yes | Easy |
| D5 | MAU window = 28 days (not 30) | Yes (removes weekday bias) | Easy (relabel) |
| D6 | AI may temporarily hide only at >0.95 confidence (ADR-004) | Yes | Easy |
| D7 | Investor shareable link exposes curated data without login | Yes (signed/expiring/revocable) | Easy (disable) |

D1 and D7 are the two the owner should consciously confirm — D1 because it is expensive to change after data accumulates, D7 because it is an intentional external-exposure surface.

---

## 6. Risk Register (Residual, Post-Fix)

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| `track_events` volume outgrows single Postgres | Medium | Medium (at growth) | Partitioning trigger + ClickHouse path documented (DB Gov §8, ADR-002) |
| Native crash capture incomplete at launch | Low | Medium | Event defined; wire platform handlers in Phase 1; degrade gracefully |
| Moderation queue outpaces human capacity | Medium | Medium | Priority escalation rules (Moderation §5); staffing is an ops decision |
| Web push "delivered" is unmeasurable | Low | High | Documented; treat as best-effort; open-rate is the real signal |
| Report generation load | Low | Low | Async job queue (ADR-005) |
| Cache staleness across Vercel instances | Low | Low | 60s TTL acceptable for back office (ADR-006) |

No residual risk is rated High.

---

## 7. Owner-Blocked External Prerequisites (by phase)

| Item | Needed For | Phase |
|---|---|---|
| Apply DB migrations in Supabase prod | Everything | 0 |
| Seed `ADMIN_IDS` → `admin_roles` | RBAC | 0 |
| `POSTHOG_SECRET_KEY` (server) | Funnel data in BO | 1 |
| `REPORT_GENERATION_SECRET` | Signed report/investor links | 3/5 |
| Firebase project + FCM key | Android push | 4 |
| APNs auth key (.p8) + Key/Team ID | iOS push | 4 |
| Confirm AI daily budget threshold | AI cost alerts | 3 |

None of these block starting Phase 0/1 design-complete implementation; they gate the specific later features noted.

---

## 8. Cross-Platform Consistency Assessment

The unified event architecture is sound: one envelope, one catalog, one ingestion endpoint, identical `event_type`/`properties` across Web/Android/iOS, enforced by the Event Governance rules (Event Catalog §1) and the parity requirement. The three platform trackers implement the **same contract** (Analytics §4). This is the correct design and directly satisfies the "do not build separate tracking systems" mandate.

One implementation watch-item: native trackers must survive process death (Android WorkManager / iOS background task) so batched events are not lost — specified in Analytics §4.2–4.3.

---

## 9. Security & Governance Assessment

- **AuthN/AuthZ:** three-layer (middleware → handler RBAC → service-role) is correct; defense-in-depth. ✅
- **Audit:** immutable, INSERT-only, every mutation covered. ✅
- **Privacy:** no conversation content in BO; PII role-gated; no PII in analytics; GDPR delete path defined. ✅
- **API governance:** additive client contract protects un-updatable native apps; idempotency keys on dangerous mutations. ✅
- **DB governance:** RLS-on-by-default, expand–contract migrations, retention windows that preserve metric sources. ✅

Assessment: **production-grade.** The only optional hardening (2FA, IP allowlist) is correctly deferred to Future Recommendations.

---

## 10. Final Recommendation

> ## ✅ READY FOR IMPLEMENTATION (conditional on §5 approvals + §7 externals per phase)

**Rationale:** The architecture is complete against all stated requirements, internally consistent across 31 documents, and free of open production-blocking gaps after the v1.1 hardening. It is appropriately scoped for MVP scale with documented, non-premature scaling paths. Security and governance are production-grade.

**Approve to proceed with:**
- **Phase 0 (Foundation)** — no external blockers beyond applying migrations.
- **Phase 1 (Analytics Core)** — begin immediately after Phase 0; the ingestion-hardening items (B1–B8) are now first-class deliverables and MUST land before any dashboard reads data, so numbers are correct from day one.

**Do not begin** Phases 4–5 until their §7 external prerequisites (push credentials, report secret) are supplied.

**Sign-off required from owner on:** the architecture as a whole, and explicitly on decisions D1 (timezone) and D7 (investor link exposure).

---

## 11. Post-Approval Change Control

Once approved, this architecture is the single source of truth. Any change follows the amendment protocol (Constitution §7): an ADR documenting why/impact/migration/risk, owner approval, then the affected document is updated. No implementation may deviate from an approved document without an approved ADR.

---

## 12. Addendum — Owner Decisions & Approval (2026-07-13)

Following this review, the owner issued decisions and approved the architecture.

### 12.1 Decisions Recorded

| Decision | Owner Ruling | ADR |
|---|---|---|
| D1 — Reporting timezone | **Approved** `Asia/Ho_Chi_Minh` | ADR-008 |
| D7 — Investor Dashboard sharing | **Modified:** never public; secure + revocable + expiring links **plus** authentication (password or OTP) + full audit logging. Implemented via `investor_share_grants` (Investor Dashboard §5) | ADR-009 |

### 12.2 Scope Additions Requested (integrated before freeze)

The owner brought four capabilities into scope and requested one new business reference. All integrate cleanly with the existing architecture and introduce **no new blocking issues** (verified below):

| Addition | Document | Integration | Blocking issues? |
|---|---|---|---|
| Feature Flags | `31_Feature_Flags.md` | Formalizes capability already referenced by Settings + Dev Tools; backend-authoritative; reuses RBAC/audit | None |
| Experiment / A-B Testing | `32_Experimentation_AB_Testing.md` | Builds on `variant` feature flags + unified events + KPI defs + `anon_identity_map` | None |
| Privacy & Data Governance | `33_Privacy_Data_Governance.md` | Consolidates existing privacy rules (Security, Analytics, User Mgmt, CRM) into one authority; PII matrix consistent with RBAC | None |
| Data Retention Policy | `34_Data_Retention_Policy.md` | Consolidates retention from DB Arch §10 + DB Gov §7 + Audit §8; preserves every metric's source | None |
| Business KPI Dictionary | `35_Business_KPI_Dictionary.md` | Business-facing companion to `25`; points to `25` for formulas; marks LTV/CAC/NRR as FUTURE | None |

### 12.3 Integration Verification

- **No contradictions introduced:** the PII access matrix in `33` matches RBAC (`12`) and Data Dictionary; retention windows in `34` supersede and align the scattered prior statements; feature-flag overrides reuse the Dev Tools per-user override already specified.
- **No new external blockers:** feature flags and experimentation require no new third-party service (experiment analysis reuses PostHog, already integrated).
- **Freeze integrity preserved:** all additions carry ADRs (010, 011) and the freeze itself is ADR-012.

### 12.4 Final Status

> ## ✅ Architecture v1.0 — APPROVED & FROZEN (2026-07-13)

Implementation may begin against the approved documents and the roadmap (`23`). Post-freeze, any architectural change requires a new ADR with explicit owner approval **before** implementation (Constitution §7, ADR-012).

---

*End of Architecture Review Report*
