# Phase 3 Review — Watch-Time Tracking + Feed Personalization

**Commit:** `b880de4`
**Branch:** `main`
**Ngày:** 2026-06-30

---

## 1. Files đã có sẵn (KHÔNG thay đổi)

| File | Trạng thái |
|---|---|
| `src/lib/explore/behaviorTracker.ts` | ✅ Giữ nguyên — hoàn chỉnh 100% |
| `src/app/api/reviews/feed/route.ts` | ✅ Giữ nguyên — score formula đã có sẵn |
| `supabase/migrations/add_explore_upgrade.sql` | ✅ Giữ nguyên — schema `review_interactions` đã migrate |

---

## 2. Files tạo mới

### `src/app/api/reviews/[id]/interact/route.ts`
> **Note:** File này đã tồn tại dưới dạng stub, mình chỉ sửa lại — không tạo mới hoàn toàn.

**Logic:**
```
POST /api/reviews/[id]/interact
Body: { watch_seconds: number, completion_rate: number }
Auth: cookie (sendBeacon tự gửi cookie, không cần header)

1. Nếu không có user → trả 204 (im lặng)
2. Nếu watch_seconds <= 0 → trả 204
3. Fetch row hiện tại từ review_interactions
4. Tính GREATEST: finalWatch = Math.max(existing, new)
   (lý do: Supabase upsert không hỗ trợ GREATEST nên phải tự tính)
5. Upsert vào review_interactions với finalWatch, finalRate
6. Tính lại AVG(watch_seconds) từ tất cả viewers → update reviews.watch_time_avg
7. Trả 204
```

**Điểm cần review:**
- `Math.max` phía client thay vì `GREATEST` trong SQL — race condition nhỏ nếu 2 beacon cùng lúc, nhưng thực tế 1 user chỉ xem 1 nơi nên không ảnh hưởng
- AVG được tính lại mỗi lần beacon gửi — có thể nặng nếu review có nhiều viewers, nhưng MVP ổn

---

### `src/lib/explore/recommendation.ts`
```ts
getRecommendationContext(userId): Promise<{
  followingIds: string[]   // ID các creator user đang follow
  city: string             // thành phố suy ra từ bài đăng gần nhất của user
  topHashtags: string[]    // 10 hashtag xem nhiều nhất qua review_interactions
}>
```

**Logic từng field:**
- `followingIds`: query `user_follows WHERE follower_id = userId`
- `city`: lấy `place_address` của 5 bài gần nhất → tách phần cuối sau dấu phẩy → lấy giá trị xuất hiện nhiều nhất
  - Ví dụ: `"123 Lê Lợi, Q1, TP.HCM"` → `"TP.HCM"`
  - Không có cột `city` trong DB nên dùng cách suy ra này
- `topHashtags`: lấy 20 `review_id` gần nhất từ `review_interactions` → join sang `reviews.hashtags` → đếm tần suất

**Điểm cần review:**
- File này tạo ra nhưng chưa được gọi ở đâu — feed API hiện tại nhận `city` qua query param từ client, không gọi `getRecommendationContext` tự động
- Để dùng thật sự cần wiring thêm ở phía client hoặc một endpoint riêng

---

## 3. Files đã sửa

### `src/app/reviews/page.tsx`

**Thay đổi 1:** Thêm import
```ts
import { attachWatchTracker } from '@/lib/explore/behaviorTracker'
```

**Thay đổi 2:** Trong Post component — thêm ref + useEffect
```tsx
const containerRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (r.content_type !== 'video' || !containerRef.current) return
  return attachWatchTracker(containerRef.current, r.id, null)
}, [r.id, r.content_type])

// Outer div:
<div ref={containerRef} className="relative w-full h-dvh ...">
```

**Logic:** IntersectionObserver (threshold 0.5) theo dõi div toàn màn hình. Khi video ra khỏi viewport hoặc user rời trang → sendBeacon tới `/api/reviews/[id]/interact`.

**Điểm cần review:**
- `videoDuration = null` → `completion_rate` luôn là 0 (xem dưới)
- Nếu muốn completion_rate chính xác cần lấy duration từ VideoPlayer

---

## 4. Điểm cần chú ý

| Vấn đề | Ảnh hưởng | Gợi ý |
|---|---|---|
| `completion_rate` luôn = 0 | Feed score không dùng completion_rate trực tiếp nên không ảnh hưởng MVP | Bổ sung sau nếu cần |
| `recommendation.ts` chưa được gọi | Chỉ là utility, chưa wired vào feed | Gọi từ client khi load feed nếu muốn city/hashtag boost tự động |
| AVG tính lại mỗi beacon | Nếu 1 review có 1000 viewers → query nặng hơn | Dùng trigger SQL sau khi scale |
| Race condition GREATEST | Cực kỳ nhỏ (1 user, 1 session) | Có thể bỏ qua ở MVP |

---

## 5. Build Status

```
npm run build  ✅ pass
/api/reviews/[id]/interact  ƒ (dynamic)  ✅
```

---

## 6. Những gì chưa làm trong Phase 3 spec gốc

- [ ] **Cron behavior-rollup** — `src/app/api/cron/behavior-rollup/` (chưa commit)
- [ ] **Morning brief cron** — `src/app/api/cron/morning-brief/` (chưa commit)
- [ ] **Profile routes** — `src/app/api/profile/` (chưa commit)
- [ ] **Gọi `getRecommendationContext` từ feed client** — chưa wired
- [ ] **completion_rate thực** — cần duration từ VideoPlayer

---

## 7. Sơ đồ luồng dữ liệu

```
User xem video
    ↓
IntersectionObserver (threshold 0.5)
    ↓ (rời viewport hoặc unload)
behaviorTracker.send()
    ↓
sendBeacon → POST /api/reviews/[id]/interact
    ↓
UPSERT review_interactions (GREATEST)
    ↓
UPDATE reviews.watch_time_avg = AVG(...)
    ↓
Feed trending: score = 5 + watch_time_avg*0.4 + save*0.3 + like*0.2 + comment*0.1
```
