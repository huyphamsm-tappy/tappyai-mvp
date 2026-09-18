# Store listing kit — TappyAI browser extension

Prepared assets for the owner to submit. **Nothing here has been submitted.** Submission itself needs an owner account on each store (see §Owner actions). Text below is written to match the manifest exactly; the tests in `src/lib/growth/browserExtension.test.ts` pin the manifest, so if the permission model ever changes, update this file in the same change.

## Facts (must match `manifest.json`)

| Field | Value |
|---|---|
| Name | TappyAI — Hỏi Tappy về trang này *(en: TappyAI — Ask Tappy about this page)* |
| Version | 0.1.0 |
| Manifest | V3 · module service worker · popup · **no content scripts** |
| Permissions | `activeTab`, `contextMenus`, `storage` |
| Host permissions | none |
| Homepage | https://www.tappyai.com/extension |
| Privacy policy URL | https://www.tappyai.com/extension/privacy |
| Support | support@tappyai.com |
| Category | Chrome: **Productivity** (alt: Tools) · Edge: **Productivity** · Firefox: **Search Tools** / Productivity |
| Languages | vi (default), en (`_locales`) |
| Firefox id | `extension@tappyai.com` (`browser_specific_settings.gecko`) |

## Chrome Web Store fields

**Summary (≤132 chars)**
- vi: `Bôi đen văn bản, chuột phải, hỏi Tappy. Kiểm tra link lừa đảo với Scam Shield. Không theo dõi duyệt web.` (104)
- en: `Select text, right-click, ask Tappy. Check suspicious links with Scam Shield. Never tracks your browsing.` (105)

**Description**

vi:
```
Hỏi Tappy ngay trong trình duyệt.

• Bôi đen bất kỳ đoạn văn nào → chuột phải → “Hỏi Tappy về …”
• Chuột phải vào trang → “Hỏi Tappy về trang này”
• Chuột phải vào link → “Kiểm tra link này với Scam Shield” (link được điền sẵn, bạn bấm Kiểm tra)
• Nút trên thanh công cụ: hỏi nhanh, hỏi về trang đang mở, kiểm tra trang, mở TappyAI

TappyAI là trợ lý AI thuần Việt cho ăn uống, mua sắm, du lịch, giải trí, làm đẹp — và Scam Shield kiểm tra lừa đảo. Mỗi câu trả lời có lý do, nguồn và link để bạn tự kiểm tra.

Riêng tư theo thiết kế:
• Chỉ 3 quyền: activeTab, contextMenus, storage. Không quyền truy cập trang web, không content script.
• Không đọc lịch sử, không theo dõi việc duyệt web, không gửi gì cho đến khi bạn bấm.
• Địa chỉ trang được gửi đã bỏ tham số và mật khẩu; văn bản giới hạn 1.000 ký tự. Không lưu gì.

Miễn phí. Không cần đăng nhập để bắt đầu.
Chính sách riêng tư: https://www.tappyai.com/extension/privacy
```

en:
```
Ask Tappy from your browser.

• Select any text → right-click → “Ask Tappy about …”
• Right-click a page → “Ask Tappy about this page”
• Right-click a link → “Check this link with Scam Shield” (prefilled; you press Check)
• Toolbar button: quick ask, ask about the open page, check the page, open TappyAI

TappyAI is a Vietnamese-first AI assistant for food, shopping, travel, entertainment and beauty — plus Scam Shield for fraud checks. Every answer comes with the reason, the source and a link so you can verify it.

Private by design:
• Three permissions only: activeTab, contextMenus, storage. No host permissions, no content scripts.
• No history access, no browsing surveillance, nothing sent until you click.
• Page addresses are stripped of parameters and credentials; text is capped at 1,000 characters. Nothing is stored.

Free. No account needed to start.
Privacy policy: https://www.tappyai.com/extension/privacy
```

**Single purpose statement:** "Send the text, link or page the user explicitly chooses to TappyAI (a question or a Scam Shield link check) by opening a TappyAI web page."

**Permission justifications (the dashboard asks for each):**
- `activeTab` — "The popup shows and uses the current tab's URL and title so the user can ask about / check the page they are on. Granted only while the popup is open by the user's click."
- `contextMenus` — "Adds the right-click entries that are the extension's main interface."
- `storage` — "Stores one preference: the user's question language (vi/en). No URLs, no text, no identifiers."
- Host permissions — none requested. Remote code — none.

**Privacy practices disclosure (Chrome "data usage" form):** collects **no** user data categories (no personally identifiable info, no health, financial, authentication, personal communications, location, web history, user activity, or website content collected/transmitted by the extension). Certify: not sold to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness/lending. *Note:* the text the user explicitly selects is sent to TappyAI **as a URL the user opens**, exactly like typing it — disclose this plainly in the description (done above) and in the privacy policy (done).

**Screenshots needed (owner, 1280×800 or 640×400, PNG/JPEG):** (1) context menu on a selection, (2) popup over a page, (3) Scam Shield prefilled from a link, (4) an answer in TappyAI. Optional small promo tile 440×280. *Not generated here — real screenshots of the real extension only.*

## Edge Add-ons

Same fields; Partner Center registration has **no fee** (learn.microsoft.com, "Register as a Microsoft Edge extension developer", updated 2026-09-02). Upload the same zip. Category: Productivity. Provide the privacy policy URL and support URL above.

## Firefox (AMO)

Same zip works (MV3 with `browser_specific_settings.gecko`). Listing is free (extensionworkshop.com, "Submitting an add-on"). Note for reviewers: no remote code; no content scripts; source is plain unminified JS.

## Packaging

```bash
cd extensions/browser && zip -r ../tappyai-extension-0.1.0.zip . -x "store/*" "README.md"
```

## Owner actions (not done by this repo)

1. Chrome Web Store: register developer account (one-time US$5, developer.chrome.com/docs/webstore/register) → upload zip → fill the fields above → submit for review.
2. Edge Add-ons: Partner Center (free) → submit the same zip.
3. Firefox AMO: developer hub (free) → submit.
4. After approval, paste each listing URL into `NEXT_PUBLIC_EXTENSION_URL_CHROME` / `_EDGE` / `_FIREFOX`. The `/extension` page shows the install buttons only then.

## Honesty rule

Until step 4 the landing page says the extension is awaiting review. No copy anywhere claims users, ratings, "featured", or store presence. Store ranking is a store heuristic of ratings and installs-vs-uninstalls (developer.chrome.com/docs/webstore/best-listing) — nothing in this repo can or does influence it.
