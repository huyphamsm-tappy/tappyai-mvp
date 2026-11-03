# Tappy Business — P5: Vietnam data retention & privacy

> Research first, implementation second. **No new product feature. No deletion job.**
> **Phases:** [P0](PHASE_0_ARCHITECTURE.md) · [P1](P1_API.md) · [P2.1](P2_1_ORDER_CREATION.md) ·
> [P2.2](P2_2_ORDER_TRACKING.md) · [P3](P3_MERCHANT_ORDER_MANAGEMENT.md) ·
> [P4](P4_PRODUCTION_HARDENING.md)
> **Code:** [`src/lib/business/retention.ts`](../../src/lib/business/retention.ts) ·
> [`retention.test.ts`](../../src/lib/business/retention.test.ts)
>
> ⚠️ **Superseded in one respect by [P5_LEGAL_DECISION_PACK.md](P5_LEGAL_DECISION_PACK.md).**
> That pack reads the enacted gazette text and finds **no SME carve-out for an intermediary
> platform**: the 01-year period is at Điều 16 khoản 2 điểm c and governs *direct-selling*
> platforms. The floor is **03 years, flat**. Corrections are marked inline below; the pack is
> authoritative where the two differ.

## The headline

🚨 **The provisional "90 days" was not merely unratified — it pointed the wrong way.**

P0 §8 and P4 both carried "customer PII nulled 90 days after an order reaches a terminal
state". Research against current Vietnamese law found **no legal basis for any such number**,
and found a statute requiring the opposite: an intermediary e-commerce platform must keep
contract data for **at least 3 years**. A 90-day anonymisation
job would have destroyed records the platform is required to be able to produce.

Two further errors in the same sentence, both now corrected in code:

| Provisional | Correct | Why it matters |
|---|---|---|
| 90 days | **≥ 3 years, flat** (no SME carve-out — corrected in the decision pack) | destroying early is a breach; keeping longer is a question |
| clock from **terminal state** | clock from **contract date** | Art. 17(2)(i) measures from conclusion of the contract |
| a scheduled job | **no job at all** | see §4 — the floor is longer than the product has existed |

Both documents carrying the wrong policy have been marked superseded (P0 §8 table row,
P4 "Retention" section).

---

## 1. Legal research record

Sources are the instruments themselves — law number, article, effective date. Where a
proposition rests on reading rather than on quoted text, that is said so and marked
**needs counsel**. No blog, vendor summary or "industry practice" is load-bearing here.

### 1.1 Personal data — the framework changed

| | |
|---|---|
| **Instrument** | Luật Bảo vệ dữ liệu cá nhân (Personal Data Protection Law) |
| **Number** | **91/2025/QH15** |
| **Effective** | **2026-01-01** |
| **Detailing decree** | **Nghị định 356/2025/NĐ-CP**, effective 2026-01-01 |
| **Supersedes** | **Nghị định 13/2023/NĐ-CP** — the framework every earlier Tappy document reasoned from |
| **Status for Tappy** | **Mandatory**, in force today (2026-09-08) |
| **Confidence** | **High** — applicability is not in doubt; Tappy processes Vietnamese personal data |

Provisions that bear on retention:

- **Art. 3(3) — storage limitation.** Personal data is stored for a period appropriate to the
  processing purpose, *"trừ trường hợp pháp luật có quy định khác"* — **unless otherwise
  prescribed by law**. This clause is the hinge: it subordinates the privacy default to a
  sectoral retention duty rather than competing with it.
- **Art. 14(1) — deletion triggers.** Delete or destroy when (a) the subject requests it,
  (b) the purpose is fulfilled, (c) **the legally prescribed retention period expires**,
  (d) a competent authority so decides, or per contract.
- **Art. 14(2)** — a deletion request is not carried out in the Art. 19 exception cases.
- **Decree 356/2025** — a data-subject deletion request is actioned within **20 days**
  (30 days for related processors and third parties).

### 1.2 E-commerce — the binding retention floor

| | |
|---|---|
| **Instrument** | Luật Thương mại điện tử (E-Commerce Law) |
| **Number** | **122/2025/QH15** |
| **Effective** | **2026-07-01** |
| **Article** | **Điều 17 khoản 2 điểm i** |
| **Requirement** | The manager of an **intermediary e-commerce platform** with an online-ordering function must ensure access to *thông tin, dữ liệu liên quan đến hợp đồng giao kết* for **at least 03 years from conclusion of the contract**. ⚠️ **Corrected:** no reduced period applies — the 01-year figure is Điều 16 khoản 2 điểm c, for *direct-selling* platforms |
| **Mandatory or permitted** | **Mandatory**, if Tappy is an intermediary platform |
| **Applicability to Tappy** | ⚠️ **Needs counsel** — see §1.4 Q1 |
| **Confidence** | **High** on the rule; **Medium** on whether Tappy falls under it |

### 1.3 Do the two instruments conflict?

**No — and this was checked rather than assumed.** They interlock:

```
PDPL Art. 3(3) …………… store no longer than the purpose needs
                        ── "UNLESS OTHERWISE PRESCRIBED BY LAW" ──┐
E-Commerce Art. 17(2)(i)  keep contract data ≥ 3 years  ◄─────────┘
PDPL Art. 14(1)(c) …… delete when the prescribed period EXPIRES
```

The sectoral duty sets the floor; the privacy duty begins where that floor ends. There is no
contradiction to resolve silently — only an order of operations. **One live tension remains**
and is recorded, not resolved: a data-subject deletion request under Decree 356/2025 carries a
20-day clock, while Art. 17(2)(i) forbids destroying the contract record inside the window.
That is the classic "erasure vs statutory retention" case; it is a legal question, not an
engineering one (§1.4 Q4).

### 1.4 Questions that require Vietnamese legal counsel

These are stated as questions because guessing would be inventing a legal requirement.

| # | Question | Why it cannot be answered here | What turns on it |
|---|---|---|---|
| **Q1** | Is Tappy an **"intermediary e-commerce platform"** under Law 122/2025? Tappy hosts merchant catalogues and transmits orders but takes no payment, holds no funds, does not ship and is not the seller. | Statutory classification. Sharpens P0's original open flag. | Whether the 3-year floor applies at all |
| ~~**Q2**~~ | ~~SME carve-out?~~ **RESOLVED — not available.** The carve-out is in Điều 16 (direct-selling platforms); Điều 17 khoản 2 điểm i states one period for every operator | Settled on the statutory text | Nothing — the floor is 3 years |
| **Q3** | Does *"information and data relating to contracts"* include the customer's **name, phone and address**, or only the commercial terms (product, quantity, price, total, status, timestamps)? | Scope of a statutory term | **If it includes PII, anonymisation is unlawful during the window, not merely early** |
| **Q4** | How is a **PDPL Art. 14(1)(a) deletion request** answered for an order inside the Art. 17(2)(i) window — refuse under Art. 19, restrict processing, or partially anonymise? | Requires reading Art. 19 against a sectoral duty | The manual deletion-request procedure |
| **Q5** | Is Tappy a **controller, processor, or joint controller** with the merchant for `customer_*`? | Depends on the merchant terms, not on the schema | Who owes the Art. 14 response |

**Until Q1 and Q3 are answered, no automated anonymisation or deletion may be built.** That is
enforced by a test, not by memory: `retention.test.ts` asserts the module exports no
`anonymiseOrder` / `deleteOrder` / `purgeOrders`.

---

## 2. Data inventory

Every field Tappy Business persists, wherever it persists it. `PERSONAL` uses PDPL Art. 2's
sense — data identifying or *capable of identifying* a specific person, alone or combined.

### 2.1 `business_orders` — the contract record

| Field | Class | Purpose | Source | Who can read | Storage | Required retention | Legal basis | Deletion |
|---|---|---|---|---|---|---|---|---|
| `customer_name` | **PERSONAL** | fulfil the order | customer form | owning merchant (full); public tracking (masked) | PG, **unindexed** | ⚠️ **≥ floor if Q3 = yes** | 122/2025 Art. 17(2)(i) / PDPL Art. 3(3) | manual, post-floor |
| `customer_phone` | **PERSONAL** | merchant contacts customer | customer form | same | PG, **no index — deliberate** | same | same | same |
| `customer_address` | **PERSONAL** | delivery by the merchant | customer form | same | PG | same | same | same |
| `customer_note` | **PERSONAL** (free text — may contain anything) | order instructions | customer | same | PG | same | same | same |
| `total_amount`, `total_items`, `currency` | NON-PERSONAL alone | the contract's terms | computed | merchant, customer | PG | **≥ floor** | 122/2025 Art. 17(2)(i) | never inside floor |
| `status`, `created_at`, `updated_at`, `expires_at` | NON-PERSONAL alone | lifecycle | system | merchant, customer | PG | **≥ floor** | same | same |
| `public_id` | pseudonymous identifier | reference | ULID | both | PG | ≥ floor | same | same |
| `merchant_id`, `source`, `source_content_public_id` | NON-PERSONAL | ownership, attribution | system | merchant | PG | ≥ floor | same | same |
| `tracking_token_hash` | **secret material** (SHA-256, 32B) | authorize tracking | derived | nobody — never in a response | PG | ≥ floor (immutable by trigger) | security | never |
| `claimed_by_user_id`, `claimed_at` | **PERSONAL** (links order → account) | future order claiming | Controller identity | merchant | PG | ≥ floor | same | write-once |

### 2.2 `business_order_items` — the line snapshot

| Field | Class | Notes |
|---|---|---|
| `product_name_snapshot`, `unit_price_amount`, `quantity`, `line_total_amount`, `currency`, `selected_options_snapshot` | **NON-PERSONAL** | This is *what was agreed* — the core of "information relating to contracts". Frozen at order time on purpose: a later price edit must not rewrite history |
| `order_id`, `product_id`, `merchant_id`, `product_public_id` | NON-PERSONAL | composite FKs; retention follows the parent order |

Retention: **≥ floor, whole table.** `service_role` holds no `DELETE`.

### 2.3 `business_order_status_history` — the audit trail

| Field | Class | Notes |
|---|---|---|
| `from_status`, `to_status`, `created_at`, `reason` | NON-PERSONAL | `reason` is a closed enum plus system strings, never free customer text |
| `actor_type` | NON-PERSONAL | `CUSTOMER` / `MERCHANT` / `SYSTEM` / `ADMIN` |
| `actor_id` | **PERSONAL when set** | a Controller user id — a merchant or admin operator, never a customer |

Retention: **≥ floor.** This is the evidence that a contract was concluded, accepted or
rejected, and by whom — precisely what Art. 17(2)(i) asks a platform to be able to produce.

### 2.4 `business_merchants` + terms acceptances

| Field | Class | Purpose | Retention | Basis |
|---|---|---|---|---|
| `shop_name`, `address`, `phone` | **PERSONAL** for a household business — a sole trader's shop address and phone are their own | contactable seller identity; released to the customer only after `ACCEPTED` | while the account exists, **then ≥ floor** — an order's counterparty cannot be erased while the contract record must stand | 122/2025 Art. 17(2)(i) + `ON DELETE RESTRICT` |
| `legal_name`, `tax_or_identity_number` | **PERSONAL / sensitive-adjacent** | seller verification | **columns exist, nothing writes them** | — |
| `controller_user_id` | pseudonymous | ownership | account lifetime | authorization |
| `status`, `suspended_at`, `suspended_reason` | NON-PERSONAL | moderation | account lifetime | — |
| `accepted_ip` (`INET`), `terms_version`, `accepted_at` | **PERSONAL** (an IP is personal data) | prove the merchant accepted the terms | as long as the terms bind — a contract-evidence record | contract evidence |

### 2.5 Outside PostgreSQL

| Store | Content | Class | TTL / retention | Notes |
|---|---|---|---|---|
| Redis `tb:idem:<key>` | **AES-256-GCM ciphertext** of `{fingerprint, result}` — contains the **raw tracking token** | **secret + pseudonymous** | **24 h, self-expiring** | Not a retention decision: it is a replay buffer. The token never reaches PostgreSQL |
| Redis phone rate-limit key | `HMAC-SHA256(secret, E.164)` truncated to 22 chars | **pseudonymous by construction** | 10-minute window | 🚨 A *plaintext* phone key would make the keyspace a "has this person ordered here" oracle. It is keyed, truncated and never stored beside an order |
| Redis IP / merchant rate-limit keys | IP or merchant id + counter | **PERSONAL** (IP) | ≤ 60 s window | Shortest-lived data in the system |
| Tracking token | in the customer's URL and the create response | **secret**, capability | **never persisted in PG**; digest only | Losing the link is unrecoverable by design (P2.2) |
| Platform logs | scope, error class, SQLSTATE, `public_id` | **NON-PERSONAL** | platform log retention (Controller-owned) | P4 closed the leak: `logBusinessError` never emits `message`, `details` or `hint`, because PostgreSQL puts the failing row — name, phone, address — into `detail` |
| Controller `notifications` | merchant `userId`, product name, formatted total, `orderPublicId` | pseudonymous + **PERSONAL** (recipient) | **Controller's retention, not Business's** | 🚨 Deliberately **no customer PII** — a push lands on a lock screen |
| GCS media | merchant-uploaded product images | may incidentally contain persons | media subsystem retention | Business adds no new media path |

---

## 3. Retention policy by category

Ten categories, each with: what · retention · legal basis · mandatory/chosen · deletion
mechanism · exception.

| # | Category | Retention | Basis | Mandatory? | Deletion mechanism |
|---|---|---|---|---|---|
| 1 | **Customer PII** (`customer_*`) | **≥ 03 years from the contract date**, then manual review | Điều 17 khoản 2 điểm i subject to **Q3**; then PDPL Điều 3 khoản 3 | ⚠️ **Floor mandatory; the post-floor action needs counsel** | **None exists.** Manual, per-order |
| 2 | **Merchant legal/identity** | account lifetime, then ≥ floor for the orders they are party to | 122/2025 + contract evidence | Mandatory while orders stand | None — `ON DELETE RESTRICT` from orders |
| 3 | **Order financial record** (amounts, currency, items) | **≥ floor** | 122/2025 Art. 17(2)(i) — this is the paradigm case | **Mandatory** | **None, and none may be built** |
| 4 | **Product snapshot** (`product_name_snapshot`, options) | **≥ floor** | as (3) — it *is* the contract's subject matter | Mandatory | None |
| 5 | **Status history** | **≥ floor** | as (3); evidence of conclusion/acceptance | Mandatory | None. `actor_id` is an operator, not a customer |
| 6 | **Security / audit** (`tracking_token_hash`, `reporter_ip_hash`) | life of the parent row | integrity; already one-way digests | Chosen (security) | None; digests are not reversible |
| 7 | **Rate-limit counters** | 10 s – 10 min | operational | Chosen | Self-expiring; keys are HMACs |
| 8 | **Idempotency records** | **24 h**, encrypted | operational replay protection | Chosen | Redis TTL |
| 9 | **Tracking-token material** | never persisted in PG; 24 h in Redis inside ciphertext | security | Chosen | TTL; digest is immutable by trigger |
| 10 | **Logs** | Controller's platform policy | operational | Inherited | Nothing to purge — no PII is written |

**Categories 3, 4 and 5 are the reason no deletion job exists.** They are exactly what
Art. 17(2)(i) names, and the schema already refuses to destroy them: `service_role` is granted
`SELECT, INSERT, UPDATE` on `business_orders` and `SELECT, INSERT` on the item and history
tables — **`DELETE` on none of the three**. Enforced by construction, and re-asserted by a test
that reads the migration.

---

## 4. Is a legal or retention hold required?

**Determination: not as a new mechanism. Do not build one.**

P4's provisional policy assumed a moderation/legal-hold exemption. That exemption only has
meaning if something can otherwise delete — a hold is a *brake on an automated destroyer*.
There is no destroyer:

1. No anonymisation or deletion job exists in any code path.
2. `service_role` holds no `DELETE` on any order table.
3. The statutory floor (1–3 years from the contract date) exceeds the age of every row that
   exists; **nothing in the database is even review-eligible yet**.

Adding a `retention_hold` column now would be a flag that nothing reads, guarding a job that
does not exist — a generic field added because it sounds useful, which this phase was
explicitly told not to do. `business_product_reports` already records reports and is the right
place for a moderation state if and when a moderation surface is built.

🔑 **The dependency runs the other way, and is recorded as a gate:** *if* an automated
anonymisation job is ever authorised (Q1–Q3 answered), it **must not be enabled** until a hold
mechanism covering open reports, disputes and authority requests exists first. The job is
blocked on the hold, not the hold on the job.

---

## 5. Non-PII history — can it be kept indefinitely?

**Conclusion: it must be kept for the floor; beyond the floor it may be kept, but "non-PII" is
a claim that had to be tested, not asserted.**

The instruction was explicit: *do not call something non-PII merely because it has no obvious
name, phone or address.* So the combination was checked, not the fields:

| Combination | Identifying? | Reasoning |
|---|---|---|
| `order_items` + `status_history` alone | **No** | Product name, price, quantity, timestamps, status. Nothing links to a person once `customer_*` are gone |
| … + `merchant_id` + `created_at` | **Weakly, in principle** | "the 14:03 order at this one shop on this day" can single out a person **to someone who was there**. This is a re-identification risk from *outside* knowledge, not from the data |
| … + `claimed_by_user_id` | **YES — directly personal** | It is a Controller account id. Anonymising `customer_*` while leaving this joins the order straight back to a person |
| `actor_id` on history | **YES when set** | A merchant/admin operator. Personal data about the *operator*, not the customer |
| `reporter_ip_hash` | No (keyed one-way digest, 32B) | Not reversible; not stored beside an identifier |

🔑 **Consequence for any future anonymisation:** clearing `customer_name/phone/address/note`
would **not** anonymise the order while `claimed_by_user_id` is set. Any future job must treat
`claimed_by_user_id` as customer PII. Recording that now is the point of writing this section
before the job exists — `claimed_by_user_id` is currently never written by any route, so the
trap is dormant, which is exactly when it is easiest to miss.

`selected_options_snapshot` is a closed set of merchant-authored option labels, not customer
free text. `customer_note` **is** free text and is classified PERSONAL for that reason alone.

---

## 6. What was implemented

The minimum technically necessary, and nothing else.

| Change | What it is |
|---|---|
| `src/lib/business/retention.ts` | The floor, its citation, and the clock — as code. `RETENTION_SOURCES`, `PlatformTier`, `STATUTORY_FLOOR_DAYS`, `statutoryFloor()`, `retentionState()`, `daysUntilReviewEligible()` |
| `src/lib/business/retention.test.ts` | 13 tests, including: 90 days is **never** eligible; **no 365-day value may appear in the contract-floor table**; the module exports no deletion function; the migration grants no `DELETE` |
| [P5_LEGAL_DECISION_PACK.md](P5_LEGAL_DECISION_PACK.md) | Q1–Q10 answered against the gazette text, with the counsel register |
| P0 §8 + P4 "Retention" | Marked **superseded**, with the reason and the correct rule |
| This document | The research record |

**Deliberately absent:** `anonymiseOrder()`, `deleteOrder()`, a cron route, a scheduler, a
`retention_hold` column, a migration. P5 adds **no migration** — the schema already encodes the
floor by granting no `DELETE`.

Two design choices worth naming:

- **The clock starts at the contract date** (`business_orders.created_at`), not the terminal
  state. `statutoryFloor()` takes exactly one required parameter, so the wrong event cannot be
  passed in — asserted by a test.
- **The state past the floor is `REVIEW_ELIGIBLE`, not `EXPIRED` or `DELETABLE`.** A name that
  sounds like a verb invites a scheduler. Past the floor the sectoral duty merely stops
  compelling retention; a human still has to decide.

## 7. Open items

| Item | Owner | Blocking |
|---|---|---|
| Q1 — intermediary-platform classification | Vietnamese counsel | which floor, or whether one applies |
| Q3 — does "contract data" include customer PII | counsel | whether anonymisation inside the window is lawful **at all** |
| Q4 — Art. 14 deletion request inside the retention window | counsel | the manual response procedure |
| Q5 — controller / processor / joint controller | counsel + merchant terms | who owes the response |
| Privacy notice & consent text for the guest order form | product + counsel | PDPL Art. 3(3) purpose statement |
| Merchant terms version (`terms_version`) content | product + counsel | what the merchant is actually accepting |
| A legal-hold mechanism | engineering — **only if** an anonymisation job is authorised | must exist **before** any such job is enabled |
