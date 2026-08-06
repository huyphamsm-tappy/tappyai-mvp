# 04 · AI Disclosure

TappyAI's core feature is a **generative-AI assistant**. Google Play's Generative AI policy requires that apps producing AI content: (1) disclose it, (2) let users report/flag offensive AI output, and (3) prevent restricted/harmful content. This document gives you the disclosures to use across the Play form, the store listing, and in-app, all consistent with the app's actual behavior and the Web source of truth.

---

## What the app actually does (verified)
- The chat feature sends the user's message (and any attached photo) to **Anthropic Claude** via the TappyAI backend, plus **Google Search** for factual lookups, and streams back a generated answer with suggestions/links.
- Users can **report** an AI reply (message action bar → report; sent to `/api/message-feedback` with reason `user_reported`) and can **like/dislike** replies.
- The app's own Terms of Service already contains an "AI-Provided Information" clause (source of truth) stating AI information may be inaccurate or change and that TappyAI is not responsible for decisions based on it.
- Fortune features (Tarot, Tử Vi, Zodiac) render a clear "**For entertainment purposes only — not a substitute for professional advice**" line in-app.

---

## 1. Play Console disclosure (Content ratings → Generative AI question)
Answer **Yes**, the app uses generative AI to produce content shown to users. When asked how users can flag/report:
> "Users can report any AI-generated reply directly from the message action bar (Report), which is recorded server-side. Users can also report user-generated reviews, and a copyright notice-and-takedown flow exists for user-uploaded music. Support contact: support@tappyai.com."

Confirm the app has safeguards against generating restricted content: describe your server-side model configuration/system prompt guardrails (Anthropic Claude with a constrained system prompt scoped to local-life assistance). Keep this description truthful to your backend configuration.

---

## 2. Store-listing disclosure (already included in [01](01_play_store_listing.md))
The full description contains a plain-language AI notice. Recommended standalone line if you need one:

**Vietnamese:**
> Thông tin do AI cung cấp có thể chưa chính xác tuyệt đối hoặc thay đổi theo thời gian — vui lòng kiểm chứng trước khi quyết định. Tính năng bói toán chỉ mang tính giải trí.

**English:**
> Information provided by AI may not be perfectly accurate and can change over time — please verify before acting on it. Fortune-telling features are for entertainment only.

---

## 3. In-app disclosure (present today — keep it)
The app already surfaces AI limitations via:
- **Terms of Service → "AI-Provided Information"** (accessible from Settings): *"Prices, locations, reviews, and other information provided by TappyAI … may change over time, by branch, or by the moment. TappyAI does not guarantee absolute accuracy and is not responsible for decisions made based on this information."*
- **Fortune screens:** *"For entertainment purposes only — not a substitute for professional advice."*

These satisfy the "disclose AI" expectation in-context. No code change is required for compliance, but if you want a stronger first-run signal, consider (post-launch, optional) a one-line AI notice on the chat empty-state. This kit does **not** modify app code.

---

## 4. Reporting mechanism (present today — cite it to reviewers)
- **AI replies:** message action bar → **Report** (records `user_reported` server-side).
- **Reviews/comments:** report affordance in the reviews feed.
- **Music copyright:** notice-and-takedown flow with a designated copyright agent (see the in-app Copyright Policy).

Reference these in [08 Reviewer Notes](08_reviewer_notes.md) so the review team can find them.

---

## 5. Consistency checklist
- [ ] Play generative-AI question answered **Yes** with the reporting description above.
- [ ] Store listing AI notice present (VI + EN).
- [ ] In-app Terms "AI-Provided Information" clause live and reachable from Settings.
- [ ] Fortune disclaimers visible.
- [ ] Reviewer notes point to the Report actions.
- [ ] Privacy policy names the AI processor (Anthropic Claude) — it already does (§3).
