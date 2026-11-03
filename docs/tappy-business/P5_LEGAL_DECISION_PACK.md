# Tappy Business — Vietnam data-retention legal decision pack

> **What this is.** Q1–Q10 answered against the enacted text of the three governing
> instruments, read from the official gazette rather than from summaries. Each answer states
> the instrument, article, clause and point; its effective date; whether the duty binds Tappy;
> and a confidence level.
>
> **What this is not.** I am not a Vietnamese lawyer and this is not a legal opinion. Where an
> answer turns on statutory interpretation rather than on statutory text, it is marked
> **⚠️ COUNSEL** and the competing readings are set out rather than resolved.
>
> **Companion:** [P5_DATA_RETENTION.md](P5_DATA_RETENTION.md) · code:
> [`src/lib/business/retention.ts`](../../src/lib/business/retention.ts)

---

## 0. Headline findings

| # | Finding | Consequence |
|---|---|---|
| **F1** | Tappy matches the statutory definition of a **nền tảng thương mại điện tử trung gian** (Điều 3 khoản 4, Law 122/2025) almost word for word, and has a **chức năng đặt hàng trực tuyến** (Điều 3 khoản 8) | Điều 17 khoản 2 applies in full |
| **F2** | 🚨 **There is no SME carve-out for an intermediary platform.** The 01-year period is at **Điều 16 khoản 2 điểm c**, which governs *direct-selling* platforms | The floor is **03 years, flat**. An earlier P5 conclusion allowing 1 year was wrong and has been corrected in code |
| **F3** | Two further retention duties were missed entirely: **Điều 17 khoản 1 điểm e** (listing data, ≥01 year from posting) and **Điều 17 khoản 2 điểm đ** (suspended seller must still be able to download contract data, 03 years) | Product data and merchant account closure now carry duties too |
| **F4** | **Điều 2 khoản 1 PDPL: "Dữ liệu cá nhân sau khi khử nhận dạng không còn là dữ liệu cá nhân."** De-identified data leaves the regime | De-identification is the lawful long-term posture — but see Q3 |
| **F5** | **Điều 14 khoản 5 PDPL** already provides the answer to an erasure request that cannot be honoured: refuse **and notify the subject** | Q4 has a statutory answer, not a gap |
| **F6** | Điều 14 khoản 6 điểm b PDPL **forbids re-identification** after de-identification | The act is irreversible in law as well as in fact — one more reason not to automate it |
| **F7** | A quarterly duty to hand seller identity data to the tax authority attaches to platforms **with an online-ordering function** | `legal_name` / `tax_or_identity_number` exist as columns but **nothing writes them** — a live gap. See Q6 |
| **F8** | Tappy has **no payment function**, so the withholding-agent regime (ND 117/2025) does not attach | Confirms the "infrastructure only" boundary holds under tax law |

---

## Sources of authority used

| Instrument | Number | Passed | Effective | How read |
|---|---|---|---|---|
| Luật Thương mại điện tử | **122/2025/QH15** | 10/12/2025 | **01/07/2026** (Điều 40) | Official gazette no. 41 (22/01/2026), full text, `congbao.chinhphu.vn` |
| Luật Bảo vệ dữ liệu cá nhân | **91/2025/QH15** | 26/06/2025 | **01/01/2026** | Official gazette no. 971+972 (24/07/2025), full text |
| Nghị định quy định chi tiết Luật BVDLCN | **356/2025/NĐ-CP** | 31/12/2025 | **01/01/2026** | Official PDF is a scan without a text layer; provisions below read from a secondary source and marked **medium confidence** |
| Luật Kế toán | 88/2015/QH13 (as amended) | — | — | Secondary |
| Nghị định 126/2020/NĐ-CP as amended by 91/2022/NĐ-CP | — | — | — | Secondary |
| Nghị định 117/2025/NĐ-CP (tax on e-commerce business) | — | 09/06/2025 | 01/07/2025 | Secondary |
| Nghị định 53/2022/NĐ-CP (Cybersecurity Law) | — | — | 01/10/2022 | Secondary |

**Transitional note (Điều 41, Law 122/2025):** platforms whose notification/registration was
confirmed before 01/07/2026 may continue under those terms **until 30/06/2027**. Tappy is new,
so it has no such registration to rely on and is inside the new regime from day one.

---

## Q1 — Is Tappy an "intermediary e-commerce platform"?

**Answer: Yes, on the statutory text — with one interpretive question left for counsel.**
**Confidence: High.** *Điều 3 khoản 4 and Điều 3 khoản 8, Law 122/2025/QH15, effective
01/07/2026.*

The definition, verbatim:

> **Điều 3 khoản 4.** *Nền tảng thương mại điện tử trung gian là nền tảng thương mại điện tử cho
> phép tổ chức, cá nhân khác đăng ký tài khoản để thực hiện hoạt động giới thiệu, bán hàng hóa
> hoặc cung ứng dịch vụ trên chính nền tảng đó.*

Element by element:

| Statutory element | Tappy | Match |
|---|---|---|
| là nền tảng thương mại điện tử | a digital platform used to conduct commercial activity (Điều 3 khoản 1–2) | ✅ |
| cho phép **tổ chức, cá nhân khác** | merchants are third parties, not Tappy | ✅ |
| **đăng ký tài khoản** | merchant onboarding creates an account bound to a Controller identity | ✅ |
| giới thiệu, **bán hàng hóa** hoặc cung ứng dịch vụ | product pages and order placement | ✅ |
| **trên chính nền tảng đó** | the order is created on Tappy, not by redirect | ✅ |

And the ordering function:

> **Điều 3 khoản 8.** *Chức năng đặt hàng trực tuyến là chức năng của nền tảng thương mại điện
> tử cho phép thực hiện giao kết hợp đồng điện tử trên nền tảng đó.*

Tappy's order-creation endpoint concludes the offer/acceptance cycle on the platform
(PENDING → merchant ACCEPT). **Therefore Điều 17 khoản 2 attaches, not merely khoản 1.**

**Why the "we take no payment, no delivery" facts do not help.** The definition contains no
payment, custody, logistics or title element. Điều 16 vs Điều 17 turns on *who sells*, not on
*who is paid*. Payment appears elsewhere in the law — Điều 17 khoản 3 điểm đ addresses
platforms that *do* partner with payment or logistics providers, which confirms that a platform
without them is still inside Điều 17.

**⚠️ COUNSEL — the one real question.** Is Tappy instead a **mạng xã hội hoạt động thương mại
điện tử** (Điều 3 khoản 5)? Merchants reach customers through Facebook/Zalo, but *those* are the
social networks; Tappy is the platform the account and the order live on. This matters less than
it looks: **Điều 18 khoản 3 điểm b applies Điều 17 khoản 2 wholesale** to social networks with an
ordering function, so the retention duty is the same either way. Điều 18 khoản 2 điểm c would
add a 03-year duty on *dữ liệu giao kết* — again the same period.

**What is NOT in doubt:** Điều 2 — the law applies to domestic **and foreign** organisations
conducting e-commerce in Vietnam. There is no small-operator exemption from the law's scope.

---

## Q2 — Does Tappy get the 1-year SME period, or 3 years?

**Answer: 3 years. The 1-year period is not available to Tappy at all.**
**Confidence: High — this is text, not interpretation.**

This corrects an earlier P5 conclusion. Placing the two provisions side by side:

> **Điều 16 khoản 2 điểm c** *(chủ quản nền tảng thương mại điện tử **kinh doanh trực tiếp**)*:
> *Doanh nghiệp nhỏ và vừa khởi nghiệp sáng tạo, doanh nghiệp siêu nhỏ, hộ kinh doanh bảo đảm
> khả năng truy cập … **ít nhất 01 năm** … Thời gian áp dụng không quá 05 năm từ ngày được
> thành lập.*

> **Điều 17 khoản 2 điểm i** *(chủ quản nền tảng thương mại điện tử **trung gian**)*:
> *Bảo đảm khả năng truy cập thông tin, dữ liệu liên quan đến hợp đồng giao kết trong thời gian
> **ít nhất 03 năm** từ thời điểm giao kết hợp đồng trên nền tảng.*

Three reasons the carve-out cannot be borrowed:

1. **Placement.** It sits in Điều 16, whose subject is the direct-selling platform. Điều 17 has
   its own khoản 2 with its own điểm i and no equivalent.
2. **Drafting.** Điều 16 khoản 2 điểm b expressly says *"trừ trường hợp quy định tại điểm c khoản
   này"* — the drafters wrote an explicit cross-reference where they wanted the exception to
   apply. Điều 17 khoản 2 điểm i contains no such words.
3. **Rationale.** The eligibility criteria are about the *seller's* size. On an intermediary
   platform the sellers are the merchants; the duty-holder is the platform. A small platform
   hosting merchants is not the case the carve-out addresses.

**Eligibility criteria, for completeness** (they would matter only if counsel reclassifies Tappy
as direct-selling): *doanh nghiệp nhỏ và vừa khởi nghiệp sáng tạo, doanh nghiệp siêu nhỏ, hộ
kinh doanh* — as defined by the SME support legislation and its implementing decree — **and**
the reduced period runs *không quá 05 năm từ ngày được thành lập*, so it expires 5 years after
establishment regardless.

**Engineering consequence, already applied:** the `SME_STARTUP` tier has been removed from
[`retention.ts`](../../src/lib/business/retention.ts). A test now asserts that no
365-day value appears in the contract-floor table.

---

## Q3 — What is "information relating to contracts", and may PII be de-identified early?

**Answer: the commercial record is certainly covered; whether customer PII is covered is the
one question that most changes Tappy's engineering. ⚠️ COUNSEL.**
**Confidence: High on the core; Low on the PII boundary.**

The statutory phrase is *"thông tin, dữ liệu liên quan đến hợp đồng giao kết"* — information and
data **relating to** the concluded contract. Note what it does *not* say: it does not say
"the contract", it says data *related to* it, which is broader.

| Field | Within the duty? | Reasoning |
|---|---|---|
| `product_name_snapshot`, `unit_price_amount`, `quantity`, `selected_options_snapshot`, `line_total_amount` | **Yes — certain** | The subject matter and price. A contract record without them proves nothing |
| `total_amount`, `total_items`, `currency` | **Yes — certain** | The consideration |
| `status`, status history, `created_at` | **Yes — high** | Evidence of conclusion, acceptance or rejection, and when |
| `public_id`, `merchant_id` | **Yes — high** | Identifies which contract and which seller |
| `customer_name`, `customer_phone` | **⚠️ Probably — unresolved** | Identity of the counterparty. A contract record naming only one party is a weak record. But the duty is framed as *access to data*, arguably for dispute resolution, and PDPL pushes the other way |
| `customer_address` | **⚠️ Probably** | For goods contracts this is a *term* (place of delivery), not merely contact detail |
| `customer_note` | **⚠️ Partly** | Free text. Where it carries a term ("giao buổi tối") it is contractual; where it carries a personal remark it is not |

**Two readings, and their engineering consequences:**

- **Reading A — contract data includes the counterparty's identity.** Then customer PII may
  **not** be de-identified inside the 3-year window at all. Anonymising at 90 days, or at any
  point before the floor, would be a breach of Điều 17 khoản 2 điểm i.
- **Reading B — contract data is the commercial terms only.** Then PII may be de-identified
  earlier once its own purpose is complete (PDPL Điều 3 khoản 3, Điều 14 khoản 1 điểm b), while
  the order record is retained.

**Why Tappy should act on Reading A until told otherwise:** under Reading A, acting on Reading B
destroys records the law requires. Under Reading B, acting on Reading A merely retains data
longer than strictly necessary — a purpose-limitation question, answerable by argument, not an
irreversible loss. The asymmetry is total, and Điều 14 khoản 6 điểm b makes it permanent:
*không được tái nhận dạng dữ liệu cá nhân sau khi đã được khử nhận dạng*.

**The supporting reason Reading A is likely correct for Tappy specifically:** Điều 17 khoản 2
điểm d requires the platform to *cung cấp các thông tin cần thiết để hỗ trợ các bên … trong quá
trình giải quyết phản ánh, yêu cầu, khiếu nại, tranh chấp*. A dispute between merchant and
customer cannot be supported from a record with the customer redacted out of it.

**A structural point counsel should be asked to confirm:** Điều 17 khoản 2 điểm i is a duty to
*bảo đảm khả năng truy cập* — to **ensure access to** the data — not, in terms, a duty to store
it in a particular form. Whether de-identified data can still satisfy "access to information
relating to the contract" is precisely the question. Tappy has no basis to answer it.

---

## Q4 — Erasure request received inside the retention window

**Answer: deletion may be refused, and the law says exactly how. Confidence: High.**
*Điều 14 khoản 1 điểm a, khoản 2, khoản 5 and Điều 19, Law 91/2025/QH15; Điều 5, Decree
356/2025/NĐ-CP.*

The chain, in order:

1. **The right exists** — Điều 4 khoản 1 điểm d: the subject may *yêu cầu cung cấp, xóa, hạn chế
   xử lý dữ liệu cá nhân*.
2. **But it is conditional from the outset** — Điều 14 khoản 1 điểm a grants deletion where the
   subject requests it *"và chấp nhận các rủi ro, thiệt hại có thể xảy ra đối với mình"* — and
   accepts the risks and losses that may follow. This is not the unqualified GDPR Art. 17 right.
3. **Two express refusal gates** — Điều 14 khoản 2: the request is **not** carried out in the
   Điều 19 cases, or where deletion would breach Điều 4 khoản 3.
4. **The duty to notify** — Điều 14 khoản 5: *Trường hợp không thể xóa, hủy dữ liệu cá nhân vì
   lý do chính đáng sau khi nhận được yêu cầu … phải thông báo để chủ thể dữ liệu cá nhân biết.*
   A legitimate reason plus notification is a complete lawful answer.
5. **Restriction is a separate, lesser remedy** — Điều 10 lets the subject request *hạn chế xử
   lý*, itself subject to the Điều 19 carve-outs; Điều 10 khoản 4 confirms it does not reach
   processing that already happened.
6. **Deadlines** — Decree 356/2025 Điều 5: acknowledge within **02 working days**; action a
   deletion request within **20 days**, or **30 days** where third parties are involved; one
   extension is permitted if justified and disclosed. *(Medium confidence — the official PDF is
   a scan; verify against the gazette text.)*

**On Điều 19 specifically — read it before relying on it.** Its title is *"Xử lý dữ liệu cá nhân
trong trường hợp không cần sự đồng ý"* — processing **without consent**, not "exceptions to
erasure". The relevant limb is likely **khoản 1 điểm đ**, *trường hợp khác theo quy định của
pháp luật*, into which Điều 17 khoản 2 điểm i would fall as a statutory retention duty. Điều 19
khoản 2 then attaches obligations to relying on it: a documented processing procedure, allocated
responsibility, protective measures, periodic risk assessment, periodic compliance review, and a
channel for receiving complaints. **⚠️ COUNSEL: confirm the limb and the khoản 2 obligations
Tappy must stand up before invoking it.**

**Recommended procedure (manual, no code required):**

| Step | Action |
|---|---|
| 1 | Acknowledge within 2 working days |
| 2 | Locate the orders. Note: Tappy **cannot look an order up by phone** — there is no index and no lookup path. The subject must supply the tracking link or the merchant must identify the order |
| 3 | Compute the floor: `statutoryFloor(order.created_at)` |
| 4 | Inside the floor → refuse the contract record under Điều 14 khoản 2 + Điều 19, **and notify under Điều 14 khoản 5**, stating the instrument, the article and the expiry date |
| 5 | Offer restriction of processing under Điều 10 as the interim remedy |
| 6 | Delete anything **outside** the contract record with no independent basis — e.g. force-expire the Redis idempotency record |
| 7 | Record the decision and the notification. Retain that record |

⚠️ **Nothing in this procedure is automated, and none of it should be** until Q3 is answered.

---

## Q5 — Controller, processor, or joint controller?

**Answer: role by role. Vietnam's taxonomy is not the GDPR's — there are four roles, and the
third is the one Tappy most often occupies. ⚠️ COUNSEL on (b).**
*Điều 2 khoản 7–10, Law 91/2025/QH15.*

> **7. Bên kiểm soát** — decides the **purpose and means**.
> **8. Bên xử lý** — processes **on the controller's instruction, under a contract**.
> **9. Bên kiểm soát và xử lý** — decides purpose and means **and directly processes**.
> **10. Bên thứ ba** — anyone else involved in the processing.

Note khoản 9: Vietnam has an explicit *controller-and-processor* role with no GDPR equivalent.
A platform that both decides why data is collected and runs the servers is squarely in it —
which is Tappy for most of what follows.

| Data | Role | Reasoning | Confidence |
|---|---|---|---|
| **(a) Product / content data** | **Bên kiểm soát và xử lý** for the platform record; the merchant is an independent controller of its own business data | Tappy decides the schema, the retention and the publication model; a sole-trader merchant's `shop_name`/`address`/`phone` is personal data Tappy determines the means for | **High** |
| **(b) Guest customer / order data** | **⚠️ Contested — see below** | The heart of the question | **Low** |
| **(c) Tracking data** (token, digest, tracking view) | **Bên kiểm soát và xử lý** — Tappy alone | The merchant never sees the token, cannot issue or revoke one, and does not choose the scheme. Purpose (authorise a guest to see one order) and means (256-bit bearer, SHA-256 digest, no phone lookup) are entirely Tappy's | **High** |
| **(d) Security / rate-limit data** (HMAC phone keys, IP counters, `reporter_ip_hash`, logs) | **Bên kiểm soát và xử lý** — Tappy alone | Platform-integrity purpose, invisible to merchants, never disclosed to them. The merchant has no say and no access | **High** |

**On (b), the three readings:**

- **Tappy is bên kiểm soát và xử lý, merchant is a separate controller.** Supported by the facts:
  Tappy alone defines what is collected (the four `customer_*` fields, no more), how long it is
  kept, that the phone is never indexed, and that the public tracking view is masked. The
  merchant chooses none of that. The merchant then becomes a controller in its own right for
  fulfilment — a *bên thứ ba* receiving the data under Điều 2 khoản 10 for its own purpose.
- **Tappy is bên xử lý for the merchant.** Weak: Điều 2 khoản 8 requires processing *theo yêu cầu
  của bên kiểm soát … thông qua hợp đồng*. There is no merchant instruction and no processing
  contract; the merchant accepts Tappy's terms, which is the reverse relationship.
- **Joint.** Vietnam has no "joint controller" concept. The nearest construction is two
  controllers each responsible for its own processing — which is the first reading.

**Why it matters and what to do:** the role determines **who owes the Điều 14 response**. Under
the first reading Tappy owes it for Tappy's copy and the merchant owes it for the merchant's.
The merchant terms (`terms_version`, currently unwritten) are where this must be fixed — a
processing/allocation clause, not a schema change. **⚠️ COUNSEL should draft it.**

---

## Q6 — Other Vietnamese retention obligations

**Answer: four more instruments, and the distinction the question asks for matters a great
deal.** Confidence noted per row; all read from secondary sources unless stated.

### (a) Obligations of the **merchant**, not Tappy

| Instrument | Duty | Bearing on Tappy |
|---|---|---|
| **Luật Kế toán 88/2015/QH13, Điều 41** | Accounting records: **≥05 years** (management use), **≥10 years** (records used directly to post the books and annual financial statements), **permanent** for historically significant records | The merchant's books, not Tappy's platform record. Tappy is not the seller and issues no invoice. **Do not import a 10-year figure into the platform.** Tappy owes it only for Tappy's own corporate accounting |
| **Luật Quản lý thuế 38/2019/QH14 + invoice decrees** | The seller declares and invoices | The merchant's duty |

🚨 **The trap this row exists to prevent:** "e-commerce, therefore 10 years" is a common
shortcut. The 10-year figure belongs to accounting documents of an accounting unit. Tappy's
order record is not a *chứng từ kế toán* of Tappy's, because Tappy is not a party to the sale.

### (b) Obligations directly on **Tappy**

| Instrument | Duty | Applies? |
|---|---|---|
| **Law 122/2025 Điều 17 khoản 2 điểm i** | Contract data ≥03 years from conclusion | **Yes** — the governing floor |
| **Law 122/2025 Điều 17 khoản 1 điểm e** | Posted goods/service data ≥01 year **from posting** | **Yes** — F3. Applies to product listings; note it runs from posting, so an unpublished or deleted product is still inside it |
| **Law 122/2025 Điều 17 khoản 2 điểm đ** | A suspended or terminated seller must still be able to sign in and download contract data for **03 years** from that event | **Yes** — F3. Merchant suspension must not sever access to their own order history |
| **Law 122/2025 Điều 15 khoản 1 điểm b, d** | Periodic online reporting; comply with authority requests in disputes and investigations | **Yes** — presupposes the records exist |
| **PDPL 91/2025 Điều 3 khoản 3, Điều 14** | Storage limitation, deletion triggers | **Yes** |
| **Decree 356/2025 Điều 5** | Request deadlines | **Yes** |

### (c) Obligations that attach **only on a classification**

| Instrument | Duty | Trigger | Status for Tappy |
|---|---|---|---|
| **Law 122/2025 Điều 17 khoản 3** | Online complaints system; automated screening/removal; algorithm disclosure to authorities | Being a **nền tảng số lớn** under the consumer-protection legislation | **Not yet** — a size threshold. Re-check on growth |
| **ND 126/2020 Điều 27 khoản 8** (added by ND 91/2022) | Provide the tax authority, **quarterly**, with each seller's name, tax code or personal identification number, address, contact phone, and revenue through the platform's online-ordering function | Owning an e-commerce platform **with an online-ordering function** | ⚠️ **Likely yes — and Tappy cannot currently comply.** See below |
| **ND 117/2025/NĐ-CP** | Withhold and remit tax on the seller's behalf | Platform **with a payment function** | **No** — Tappy has no payment function. The "we never touch money" boundary is load-bearing here |
| **ND 53/2022/NĐ-CP** (Cybersecurity Law) | Store specified user data in Vietnam, **≥24 months**; system logs **≥12 months** | A **decision/request from the competent Ministry of Public Security authority**, for in-scope services | **Not automatic.** Do not pre-emptively build to it — but note it would *lengthen* retention, never shorten it |

🚨 **F7, the live gap.** If ND 126/2020 Điều 27 khoản 8 (or its successor) binds Tappy, the
quarterly return needs each merchant's **name, tax code or ID number, address and phone**.
`business_merchants` has `legal_name` and `tax_or_identity_number` — **and no code writes
them**. The P0 architecture flagged these columns as "collected only if a legal obligation
requires it". This is that obligation surfacing. ⚠️ **COUNSEL: confirm whether the duty binds
Tappy and whether ND 117/2025 superseded the mechanism.** If it binds, collecting those fields
becomes mandatory — a product change, deliberately **not** made in P5.

---

## Q7 — What event starts the clock?

**Answer: conclusion of the contract. Explicitly, and not the terminal state.**
**Confidence: High — the statute names the event.**

> **Điều 17 khoản 2 điểm i:** *… ít nhất 03 năm **từ thời điểm giao kết hợp đồng** trên nền tảng.*

Each duty has its own start event, and they differ — this is why a single "retention date"
column would be wrong:

| Duty | Start event | Article |
|---|---|---|
| Contract data, 03 years | **giao kết hợp đồng** — conclusion | Điều 17 khoản 2 điểm i |
| Listing data, 01 year | **thời điểm đăng tải** — the moment of posting | Điều 17 khoản 1 điểm e |
| Seller download access, 03 years | **suspension or termination of the account** | Điều 17 khoản 2 điểm đ |
| Livestream recordings, 01 year | start of transmission | Điều 22 khoản 7 *(not applicable — Tappy has no livestream)* |

**⚠️ COUNSEL — which Tappy event is *giao kết*?** Two candidates:

- **Order creation (`created_at`).** The customer submits and the platform records an order.
- **Merchant acceptance.** The merchant accepts; before that the order is an offer that may
  expire in 72 hours.

Contract-formation doctrine points to **acceptance** as the moment of *giao kết*. Tappy uses
**`created_at`** anyway, deliberately: it is **always earlier or equal**, so the floor computed
from it always expires **later**, and it exists on every order including those that were
rejected or expired — which have no acceptance timestamp but are still records of a dealing on
the platform. Choosing the later-expiring, always-present event is the conservative choice, and
it costs nothing while no order is anywhere near the floor.

🚨 **What is definitively wrong is the provisional policy's event.** "90 days after the order
reaches a terminal state" starts the clock late for an order that sits 72 hours in PENDING and
early for every other one — and has no basis in the statute either way.

---

## Q8 — After the retention period expires

**Answer: none of delete / anonymise / destroy is compelled by the E-Commerce Law; PDPL then
governs, and it permits continued retention only for a documented lawful purpose.**
**Confidence: Medium-High.**

Expiry of the Điều 17 floor removes a *compulsion to keep*. It creates no compulsion to destroy —
Law 122/2025 contains no maximum. The question then passes to the PDPL:

| Route | Basis | Comment |
|---|---|---|
| **Delete / destroy** | Điều 14 khoản 1 điểm c — *hết thời hạn lưu trữ theo quy định của pháp luật* | Available. Must use safe methods that prevent unauthorised recovery (khoản 3), and the data must not be intentionally restored (khoản 4) |
| **De-identify (khử nhận dạng)** | Điều 2 khoản 11 + Điều 14 khoản 6 | **Likely the right answer for Tappy.** Điều 2 khoản 1: de-identified data is no longer personal data, so the order record survives for statistics and dispute history while leaving the regime. Constrained by khoản 6: supervise the process, and **never re-identify** |
| **Restrict processing** | Điều 10 | A subject-driven remedy, not a lifecycle stage |
| **Retain for another documented lawful purpose** | Điều 3 khoản 3 — *trừ trường hợp pháp luật có quy định khác*; Điều 19 | Permitted, but the purpose must be identified and documented in advance. "It might be useful" is not one |

**Recommended posture:** at the floor an order becomes `REVIEW_ELIGIBLE` — a state that means
*a human must decide*, deliberately not named `EXPIRED` or `DELETABLE`. The likely decision is
de-identification of `customer_*` with the commercial record retained. **It must not be
automated before Q3 is answered**, because under Reading A it would be unlawful and under
Điều 14 khoản 6 điểm b it is irreversible.

---

## Q9 — Is a legal/moderation hold required before automation?

**Answer: yes — as a precondition, not as a feature to build now.**
**Confidence: High (engineering determination, given the legal answers above).**

**Today no hold is required, because there is nothing to hold back.** A hold is a brake on an
automated destroyer, and there is none: no deletion or de-identification job exists, no order
table grants `DELETE` to `service_role`, and the 3-year floor exceeds the age of every row that
exists. Adding a `retention_hold` column now would be a flag nothing reads, guarding a job that
does not exist.

**The dependency is recorded in the other direction, as a gate.** Before any automated
de-identification is enabled, a hold must exist and must cover at least:

| Hold reason | Source |
|---|---|
| Open complaint or dispute between merchant and customer | Law 122/2025 Điều 17 khoản 2 điểm d |
| Request or decision by a competent state authority | Law 122/2025 Điều 15 khoản 1 điểm d; PDPL Điều 14 khoản 1 điểm d |
| Open product report | `business_product_reports` — the mechanism already exists |
| An erasure request under adjudication | PDPL Điều 14 khoản 5 — the decision and notification must be evidenced |
| A cybersecurity data-storage request | ND 53/2022 — would extend retention, not shorten it |

Two further preconditions the job would inherit: **Điều 19 khoản 2** requires a documented
processing procedure, assigned responsibility, protective measures, periodic risk assessment and
compliance review, and a complaints channel before relying on the no-consent basis; and
**Điều 14 khoản 6 điểm a** requires the de-identification process itself to be supervised and
protected against leakage while it runs.

🔑 **The rule, stated so it survives this document:** *the job is blocked on the hold; the hold
is not blocked on the job.*

---

## Q10 — Retention period to adopt, by category

Recommended positions. Every one is a floor with no automated destruction behind it; the
"Action at floor" column describes a **manual** decision.

| Category | Adopt | Legal basis | Mandatory? | Action at floor |
|---|---|---|---|---|
| **Customer PII** (`customer_name/phone/address/note`) | **03 years from order creation**, then manual review | Law 122/2025 Điều 17 khoản 2 điểm i (subject to Q3); then PDPL Điều 3 khoản 3 | **Mandatory floor**, ⚠️ post-floor action needs counsel | De-identify under PDPL Điều 14 khoản 6, if Q3 permits. Never automated |
| **Order / business record** (amounts, currency, items, product snapshot) | **03 years from order creation**, retention beyond permitted | Law 122/2025 Điều 17 khoản 2 điểm i | **Mandatory** | Keep. De-identified, it is no longer personal data (PDPL Điều 2 khoản 1) |
| **Status history** | **03 years**, aligned to the parent order | Same — evidence of conclusion/acceptance | **Mandatory** | Keep. `actor_id` is an operator id, not a customer's |
| **Merchant identity** (`shop_name`, `address`, `phone`, and `legal_name`/`tax_or_identity_number` **if Q6 requires collecting them**) | Account lifetime, **plus 03 years** after suspension/termination | Law 122/2025 Điều 17 khoản 2 điểm đ; ND 126/2020 Điều 27 khoản 8 if applicable | **Mandatory** | `ON DELETE RESTRICT` already prevents removal while orders stand |
| **Product listings** | **≥01 year from posting**, in practice for the life of the merchant account | Law 122/2025 Điều 17 khoản 1 điểm e | **Mandatory** | 🚨 A product may not be hard-deleted within a year of posting. Unpublish, never delete |
| **Security / audit** (`tracking_token_hash`, `reporter_ip_hash`) | Life of the parent row | Integrity; both are one-way digests | Chosen | None — not reversible, not personal data in any useful sense |
| **Redis rate-limit data** (HMAC phone keys, IP counters) | **10 s – 10 min**, unchanged | Operational; PDPL Điều 3 khoản 2–3 (minimum necessary) | Chosen | Self-expiring. Keys are HMACs, so the keyspace is not a "has this person ordered" oracle |
| **Idempotency records** | **24 h**, encrypted, unchanged | Operational replay protection | Chosen | Redis TTL. Contains the raw tracking token — the shortest TTL that works is the right one |
| **Tracking-token material** | Never persisted in PostgreSQL; 24 h inside the encrypted idempotency record | Security | Chosen | Digest only, immutable by trigger |
| **Logs** | Controller's platform policy, unchanged | Operational | Inherited | Nothing to purge — `logBusinessError` writes no PII. Note ND 53/2022 would impose **≥12 months** on system logs *if* a competent-authority request ever attaches |

**One number to hold on to:** **03 years from order creation.** Every other figure in this table
is either shorter and operational, or derived from that one.

---

## Register of what must go to counsel

| # | Question | Blocks |
|---|---|---|
| **C1** | Confirm Q1: intermediary platform (Điều 17) vs social-network-with-commerce (Điều 18). Same period either way — confirm the reporting/registration consequences differ | Registration and periodic reporting duties |
| **C2** | **Q3 — does "thông tin, dữ liệu liên quan đến hợp đồng" include customer name, phone, address?** | Whether de-identification inside the window is lawful **at all**. The highest-value question in this pack |
| **C3** | Q7 — is *giao kết* order creation or merchant acceptance? | Confirms `created_at` is the conservative choice |
| **C4** | Q4 — which limb of Điều 19 supports refusing erasure, and what Điều 19 khoản 2 obligations must exist first | The erasure-refusal procedure |
| **C5** | Q5(b) — Tappy's role for guest order data, and the allocation clause in the merchant terms | Who answers a Điều 14 request |
| **C6** | **Q6 — does ND 126/2020 Điều 27 khoản 8 (or ND 117/2025) bind Tappy?** | Whether `legal_name` / `tax_or_identity_number` must start being collected |
| **C7** | Verify Decree 356/2025 Điều 5 deadlines and Điều 42 repeal against the gazette text (our copy is a scan) | The response SLA |
| **C8** | Privacy notice and consent wording for the guest order form; merchant terms content and `terms_version` | PDPL Điều 9 and Điều 3 khoản 2 |

---

## What P5 changed in the code, on this research

| Change | Reason |
|---|---|
| `PlatformTier` → `PlatformRole`; `SME_STARTUP` removed | F2 — the 1-year carve-out is Điều 16's and does not reach an intermediary platform |
| `CONTRACT_FLOOR_DAYS` = 3×365 for both roles | Same |
| `LISTING_FLOOR_DAYS`, `SELLER_EXPORT_FLOOR_DAYS` added | F3 — two duties that were missed |
| Citations narrowed to *Điều/khoản/điểm* | The earlier "Art. 17(2)(i)" was right but unverifiable; these are quotable |
| `RETENTION_SOURCES.ecommerceDirectSellingCarveOut` added | Records the rule that does **not** apply, so it is not re-adopted from a summary |
| Tests: "no 365-day value in the contract-floor table" | Makes F2 a build failure rather than a memory |

**Still deliberately absent:** any deletion or de-identification function, cron route, scheduler,
`retention_hold` column, or migration. P5 adds no migration; the floor is already enforced by
granting no `DELETE`.
