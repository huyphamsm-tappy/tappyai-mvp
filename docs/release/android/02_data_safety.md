# 02 · Data Safety Declaration (Play Console)

This maps directly to the **Play Console → App content → Data safety** form. Every entry below is grounded in the actual Android app behavior and the published privacy policy (source of truth). Read the **Owner decisions** section first — two answers depend on choices only you can make.

> Reminder: the Data Safety form is about what your app **and its backend/SDKs** do with user data. TappyAI's Android client has **no third-party data-collection SDKs**; all data collection happens through the app's own network calls to the TappyAI backend (Supabase + API), which in turn uses AI/search processors server-side.

---

## Owner decisions (resolve before submitting)

1. **PostHog analytics.** The privacy policy declares PostHog product analytics (page views, feature-type usage, UI interaction events — **not** message content). The **Android client contains no PostHog SDK**; its only analytics implementation writes to logcat and is disabled in release builds. Decide:
   - **(A) Web-only analytics** → do **not** declare an "App activity/analytics" collection for the Android app, and add a one-line note to the privacy policy clarifying PostHog applies to the web experience. *(Most accurate to the Android binary.)*
   - **(B) Backend attributes Android events to PostHog** → declare **App interactions** collected for **Analytics** (see optional row below). Choose this only if the backend actually forwards Android-originated events to PostHog.
   The rows below mark this row **[DECISION]**.

2. **Account & data deletion path.** Play requires a deletion method for account-based apps. The app has **no in-app deletion today** (README blocker #1). Either (A) add the in-app flow, or (B) stand up a public **Account Deletion URL** and enter it in the Data Safety form's deletion section. You must pick one before submission.

---

## Top-level questions

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** — all network traffic is HTTPS (Supabase + API over TLS). |
| Do you provide a way for users to request that their data be deleted? | **Yes** — *conditional on resolving Owner decision #2.* Provide the in-app path or a public deletion URL. |

---

## Data collected & shared — declare these types

Legend — **Collected** = sent off the device; **Shared** = sent to a third party; **Purpose**; **Optional?** = can the user use the app without providing it.

### Personal info

| Data type | Collected | Shared | Purpose | Optional | Basis (verified) |
|---|---|---|---|---|---|
| **Name** | Yes | No* | App functionality; Account management | Required (sign-in) | From Google/Facebook profile or entered; shown in Profile. |
| **Email address** | Yes | No* | App functionality; Account management | Required (sign-in) | Email OTP / OAuth identity. |
| **User IDs** | Yes | No* | App functionality; Account management | Required | Supabase user id / auth token. |
| **Phone number** | Yes | No* | App functionality (booking confirmation) | Optional | Collected only when the user submits a booking (name + phone), per privacy policy §1. |

\* "No" third-party sharing = the data is stored in TappyAI's own backend (Supabase, acting as a data **processor**, not an independent third party). If your legal review treats the AI processor path as "sharing," see the AI/search row below.

### Photos and videos

| Data type | Collected | Shared | Purpose | Optional | Basis |
|---|---|---|---|---|---|
| **Photos** | Yes | **Yes** (conditionally) | App functionality | Optional | (1) Avatar upload → stored in backend. (2) Review photos → stored + shown in the public reviews feed. (3) A photo attached to a chat message, or a Scan photo, is sent to the AI processor (Anthropic Claude) to answer the question → this is **sharing** with a third-party processor. |

### Messages / user content

| Data type | Collected | Shared | Purpose | Optional | Basis |
|---|---|---|---|---|---|
| **Other in-app messages** (chat content) | Yes | **Yes** | App functionality | Required to use chat | Chat text is stored (history) and sent to Anthropic Claude + search services to generate answers (privacy policy §3). |
| **Other user-generated content** (reviews, comments, ratings) | Yes | No* | App functionality | Optional | Reviews/comments are stored and shown publicly to other users **within the app** (a social feed), not sold or sent to external third parties. |

### App activity

| Data type | Collected | Shared | Purpose | Optional | Basis |
|---|---|---|---|---|---|
| **App interactions** | **[DECISION]** | No | Analytics | — | Declare **only if Owner decision #1 = (B)**. Metadata only (feature type, navigation, toolbar actions) — never message content. If decision = (A), omit this row. |
| **In-app search history** (queries, place searches) | Yes | Yes | App functionality | Optional | Discovery/place queries are sent to search/AI to return results. |

### "Personalization" preferences (declare under the closest matching type)

| Data type | Collected | Shared | Purpose | Optional | Basis |
|---|---|---|---|---|---|
| **Other info** — user-provided preferences & remembered context (food tastes, budget, a text "location" the user types, response-style choice) | Yes | No* | App functionality; Personalization | Optional | Stored in the backend; used to tailor AI replies. **Note:** the typed "location" is free text the user shares in conversation — it is **not** device GPS. See below. |

---

## Data types you must NOT declare (verified absent)

Do not check these — the app does not access them:

- **Precise or approximate location** — no location permission is declared (`AndroidManifest.xml` has only `INTERNET` + `ACCESS_NETWORK_STATE`); the app never reads device GPS/network location. Any "location" is text a user optionally types in chat.
- **Contacts** — never accessed.
- **Calendar** — never accessed.
- **Microphone/audio recordings** — voice input uses the **system speech recognizer** (`RecognizerIntent`), which returns **text**; the app never receives or transmits raw audio. Declare the resulting **text** under chat messages, not audio.
- **Financial info / payment info** — no billing/IAP library is integrated; the app processes no payments.
- **Health & fitness** — not applicable.
- **Device or other IDs for advertising** — no ad/attribution SDK; no advertising ID used.
- **Crash logs / diagnostics via a third-party SDK** — no Crashlytics/Firebase in the build.

---

## Data security section answers

| Prompt | Answer |
|---|---|
| Is data encrypted in transit? | **Yes** (TLS/HTTPS for all Supabase + API traffic). |
| Can users request data deletion? | **Yes** — via *(in-app flow or public deletion URL — Owner decision #2)*. |
| Committed to Play Families Policy? | Only if you target children — **not recommended**; this app is not designed for children (see [03 Content Rating](03_content_rating.md)). Answer **No**, app is not primarily child-directed. |

---

## Third-party processors (for your records / privacy policy, not a Play form field)

Grounded in privacy policy §3–§5 and the code:
- **Supabase** — authentication + Postgres data storage (data processor; first-party backend).
- **Anthropic (Claude)** — receives chat/query content and any attached image to generate AI answers.
- **Google Search** — receives query content to fetch results for the AI.
- **PostHog** — product analytics **[per privacy policy; web app]**. Reconcile per Owner decision #1.

Keep the published privacy policy and this declaration in sync. If you resolve decision #1 = (A), lightly amend the policy so it doesn't imply the Android app itself runs PostHog.
