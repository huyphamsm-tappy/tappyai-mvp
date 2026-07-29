# 01 · Google Play Store Listing

App: **TappyAI** · Package: `com.tappyai.app`
Provide the listing per locale. The app's default language is **Vietnamese**; **English** is a secondary locale. Set **Vietnamese (vi-VN)** as the default store listing (matches the app's primary market) and add **English (en-US)** as an additional listing.

Character limits (Google Play): **Title ≤ 30**, **Short description ≤ 80**, **Full description ≤ 4000**. Google Play has **no separate keyword field** — keywords are ranked from the title + descriptions, so an ASO keyword list is provided at the end to weave in naturally.

---

## Category & store settings

| Setting | Value | Notes |
|---|---|---|
| **App or game** | App | |
| **Category (primary)** | **Lifestyle** | Best fit: a daily-life AI assistant spanning food, places, travel, spa, shopping, fortune, and utilities. |
| Category (alternative) | Tools | Defensible if you want to position it as an assistant/utility. Pick one; Lifestyle recommended. |
| **Tags** | AI assistant, Food & drink, Local, Lifestyle | Choose from Play's tag list; keep to the app's real scope. |
| Contact email | huypham.sm@gmail.com | Matches the privacy-policy contact. |
| Website | *(your production web URL)* | The web app is the source of truth. |
| Privacy policy URL | *(public `/privacy` URL — must be live)* | Required. See README blocker #4. |
| Contains ads | **No** | No ad SDK in the build. |
| In-app purchases | **No** for this build | No billing library is integrated in the Android app (the "Membership/Upgrade" surface is not a live purchase flow). If you wire billing later, update this. |

---

## Vietnamese (vi-VN) — default listing

### App title (≤ 30 chars)
```
TappyAI – Trợ lý AI thuần Việt
```
> ~30 chars including diacritics — verify in Console; if it flags as too long, use the fallback: `TappyAI: Trợ lý AI Việt`

### Short description (≤ 80 chars)
```
Trợ lý AI tiếng Việt: tìm quán ăn, địa điểm, du lịch, spa, mua sắm & nhiều hơn.
```

### Full description (≤ 4000 chars)
```
TappyAI là trợ lý AI thuần Việt giúp bạn giải quyết những việc thường ngày — chỉ cần hỏi bằng tiếng Việt tự nhiên.

TAPPY GIÚP ĐƯỢC GÌ?
• Trò chuyện với AI: hỏi về quán ăn ngon, địa điểm, lịch trình du lịch, spa, mua sắm, giải trí… Tappy trả lời kèm gợi ý và liên kết để bạn tìm hiểu thêm.
• Khám phá địa điểm: duyệt theo nhóm Ẩm thực, Mua sắm, Du lịch, Giải trí, Spa và xem gợi ý “Dành cho bạn”.
• Bản đồ & tìm kiếm: xem địa điểm trên bản đồ, lưu nơi yêu thích, chia sẻ nhanh.
• Cộng đồng review: đọc và đăng review có ảnh, thả tim, lưu bài, bình luận.
• Tiện ích hằng ngày: đổi tiền tệ, dịch nhanh, quét ảnh để hỏi Tappy (OCR), theo dõi giá, ưu đãi.
• Giải trí: bói Tarot, Tử Vi, con giáp và các trò chơi nhỏ — chỉ mang tính giải trí.
• Cá nhân hóa: Tappy ghi nhớ sở thích bạn chia sẻ để phản hồi phù hợp hơn (bạn kiểm soát điều này trong phần “Tappy biết gì về bạn”).

RIÊNG TƯ & MINH BẠCH
• Đăng nhập bằng Google hoặc email. Lịch sử trò chuyện và hồ sơ của bạn chỉ mình bạn xem được.
• Để trả lời câu hỏi, nội dung câu hỏi được gửi tới dịch vụ AI (Anthropic Claude) và tìm kiếm để lấy kết quả.
• TappyAI không bán thông tin cá nhân của bạn.

LƯU Ý VỀ NỘI DUNG AI
Thông tin do AI cung cấp (giá cả, địa điểm, review…) có thể thay đổi theo thời gian hoặc chưa chính xác tuyệt đối. Hãy kiểm chứng thông tin quan trọng trước khi quyết định. Các tính năng bói toán chỉ nhằm mục đích giải trí.

Hỗ trợ tiếng Việt và tiếng Anh. Giao diện sáng/tối.

Liên hệ hỗ trợ: huypham.sm@gmail.com
```

---

## English (en-US) — additional listing

### App title (≤ 30 chars)
```
TappyAI – Vietnamese AI Help
```
> ~28 chars. Alternative: `TappyAI – AI Assistant`

### Short description (≤ 80 chars)
```
Vietnamese AI assistant for food, places, travel, spa, shopping and everyday help.
```
> 80 chars exactly — trim to `Vietnamese AI assistant: food, places, travel, spa, shopping & more.` (66) if flagged.

### Full description (≤ 4000 chars)
```
TappyAI is a Vietnamese-first AI assistant for everyday life — just ask in natural language.

WHAT TAPPY DOES
• Chat with AI: ask about good places to eat, local spots, travel plans, spa, shopping and entertainment. Tappy replies with suggestions and links to explore further.
• Discover places: browse Food, Shopping, Travel, Entertainment and Spa, plus a personalized "For you" feed.
• Maps & search: view places on a map, save favorites, and share them.
• Reviews community: read and post reviews with photos, like, save and comment.
• Everyday tools: currency converter, quick translate, scan a photo to ask Tappy (OCR), price tracking and deals.
• For fun: Tarot, Vietnamese astrology (Tử Vi), zodiac and light mini-games — for entertainment only.
• Personalization: Tappy can remember preferences you share to tailor its answers. You control this in "What Tappy knows."

PRIVACY & TRANSPARENCY
• Sign in with Google or email. Your chat history and profile are visible only to you.
• To answer your questions, your query content is sent to AI (Anthropic Claude) and search services to fetch results.
• TappyAI does not sell your personal information.

ABOUT AI CONTENT
Information provided by AI (prices, places, reviews and more) can change over time and may not be perfectly accurate. Please verify important details before acting on them. Fortune-telling features are for entertainment purposes only.

Available in Vietnamese and English. Light and dark themes.

Support: huypham.sm@gmail.com
```

---

## ASO keyword list (weave into title / short / full description — no dedicated field)

Primary (Vietnamese market): `trợ lý AI`, `AI tiếng Việt`, `tìm quán ăn`, `địa điểm`, `review`, `du lịch`, `spa`, `mua sắm`, `bản đồ`, `đổi tiền`, `dịch`, `bói tarot`, `tử vi`, `con giáp`, `ưu đãi`.

English/secondary: `AI assistant`, `Vietnamese AI`, `chatbot`, `local guide`, `food finder`, `places`, `travel planner`, `reviews`, `currency converter`, `translate`, `tarot`, `horoscope`.

> Keep keyword use natural and truthful. Do not keyword-stuff or claim features the app doesn't have (e.g. do not imply in-app booking payments, which the app doesn't process). Over-optimization risks a Play policy strike.

## Consistency notes (vs. Web source of truth)
- Web title is "TappyAI - Trợ lý AI thuần Việt" → the VI store title mirrors it.
- Descriptions describe only features the Android app actually ships (verified: chat, discovery, maps, reviews, music, games, fortune, currency, translate, scan, price tracking, deals, group dining, recommendations, VietWriter). Do not add "push notifications" — the Android app has no push. Do not add "booking payments" — bookings collect a contact name/phone for confirmation only.
