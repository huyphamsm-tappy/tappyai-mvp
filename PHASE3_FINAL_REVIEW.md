# Phase 3 Final Review — Watch-Time Tracking + Feed Personalization + 3-Tab Feed

**Commit cuối:** `9f90d7c`
**Branch:** `main`
**Ngày:** 2026-06-30

---

## 1. Files thay đổi

| File | Loại | Mô tả |
|---|---|---|
| `src/lib/explore/behaviorTracker.ts` | Modified | getDuration() closure |
| `src/components/explore/VideoPlayer.tsx` | Modified | onDurationKnown prop |
| `src/app/reviews/page.tsx` | Modified | 3 tabs + city/hashtag wiring |
| `src/lib/explore/recommendation.ts` | Modified | Array.from() TS fix |
| `src/app/api/reviews/[id]/interact/route.ts` | Created (commit b880de4) | GREATEST + AVG watch_time |

---

## 2. Chi tiết từng thay đổi

### 2.1 `behaviorTracker.ts` — completion_rate fix

**Vấn đề cũ:**
```ts
// videoDuration = null → completion_rate luôn = 0
attachWatchTracker(element, reviewId, null)
```

**Fix:**
```ts
// Đổi signature: nhận getter thay vì giá trị cố định
export function attachWatchTracker(
  element: HTMLElement,
  reviewId: string,
  getDuration: (() => number | null) | null = null  // <-- đổi
)

// Trong send():
const duration = getDuration?.() ?? null  // đọc lúc send, không phải lúc attach
const completionRate = duration && duration > 0
  ? Math.min(totalWatched / duration, 1)
  : 0
```

**Tại sao dùng getter thay vì giá trị:** duration không biết tại thời điểm attach (video chưa load metadata), nên phải đọc lúc send.

---

### 2.2 `VideoPlayer.tsx` — expose duration

```ts
// Thêm prop
interface VideoPlayerProps {
  onDurationKnown?: (d: number) => void  // <-- mới
}

// Fire từ video element
<video
  onLoadedMetadata={e => onDurationKnown?.(e.currentTarget.duration)}
/>
```

Chỉ hoạt động cho `sourceType === 'upload'`. YouTube/TikTok/Facebook không có duration thật → completion_rate = 0 cho 3 loại đó.

---

### 2.3 `reviews/page.tsx` — Post component

```tsx
// Thêm durationRef
const durationRef = useRef<number | null>(null)

// Truyền getter vào tracker
useEffect(() => {
  if (r.content_type !== 'video' || !containerRef.current) return
  return attachWatchTracker(containerRef.current, r.id, () => durationRef.current)
}, [r.id, r.content_type])

// Wire onDurationKnown vào VideoPlayer
<VideoPlayer
  url={r.media_url}
  onDurationKnown={d => { durationRef.current = d }}
/>
```

---

### 2.4 `reviews/page.tsx` — 3-tab feed

**Tabs mới:**
```
[Đang follow]   [Đề xuất]   [Mới nhất]
```

**feedType:** `'for-you' | 'latest' | 'following'`

**Behavior:**
| Tab | API call |
|---|---|
| Đề xuất (for-you) | `sort=trending&city=xxx` |
| Mới nhất (latest) | `sort=latest` |
| Đang follow | `sort=latest&following=true` |

---

### 2.5 `reviews/page.tsx` — Recommendation wiring

**City** (inferred từ bài đăng gần nhất):
```ts
supabase.from('reviews').select('place_address').eq('user_id', me).limit(5)
// → tách phần cuối sau dấu phẩy → lấy city xuất hiện nhiều nhất
// → pass vào feed API: &city=xxx → locationBoost 1.3x trong sort=trending
```

**topHashtags** (từ lịch sử xem):
```ts
supabase.from('review_interactions').select('review_id').eq('user_id', me).limit(20)
// → join reviews.hashtags → đếm tần suất → top 10
// → client-side boost: posts có hashtag trùng được đẩy lên đầu (chỉ trong for-you tab)
```

**followingIds:** không cần thêm — feed API đã xử lý qua `&following=true`.

---

### 2.6 `/api/reviews/[id]/interact` — GREATEST logic

```ts
// 1. Fetch row hiện tại
const { data: existing } = await supabase
  .from('review_interactions').select('watch_seconds, completion_rate')
  .eq('user_id', user.id).eq('review_id', params.id).maybeSingle()

// 2. Giữ MAX (Supabase upsert không hỗ trợ GREATEST)
const finalWatch = existing ? Math.max(existing.watch_seconds, watchSeconds) : watchSeconds
const finalRate  = existing ? Math.max(existing.completion_rate, completionRate) : completionRate

// 3. Upsert
await supabase.from('review_interactions').upsert({ ... finalWatch, finalRate ... })

// 4. Sync watch_time_avg = AVG(watch_seconds) của tất cả viewers
const avg = rows.reduce((s, r) => s + r.watch_seconds, 0) / rows.length
await supabase.from('reviews').update({ watch_time_avg: avg }).eq('id', params.id)
```

---

## 3. Luồng dữ liệu hoàn chỉnh

```
User xem video upload
    ↓
VideoPlayer onLoadedMetadata → durationRef.current = duration
    ↓
IntersectionObserver (threshold 0.5) theo dõi div toàn màn hình
    ↓ (rời viewport / beforeunload)
behaviorTracker.send()
  watch_seconds = totalWatched
  completion_rate = totalWatched / getDuration()   ← giờ có giá trị thật
    ↓
sendBeacon → POST /api/reviews/[id]/interact
    ↓
UPSERT review_interactions (GREATEST)
    ↓
UPDATE reviews.watch_time_avg = AVG(...)
    ↓
Feed sort=trending: score = 5 + watch_time_avg*0.4 + save*0.3 + like*0.2 + comment*0.1
                           × locationBoost (1.3x nếu city match)
                           × recencyBoost (1/(1+daysOld))
    ↓
Client-side hashtag boost (for-you tab):
  posts có hashtag trùng topHashtags → lên đầu trang
```

---

## 4. Build Status

```
npm run build     ✅ pass
npx tsc --noEmit  ✅ 0 lỗi trong files đã thay đổi
                  ⚠️ pre-existing errors: middleware.ts, ChatInterface.tsx,
                     cron/behavior-rollup, stripe webhook, game pages
```

---

## 5. Remaining Risks

| Risk | Mức độ | Ghi chú |
|---|---|---|
| completion_rate = 0 cho YouTube/TikTok/Facebook | Low | Chỉ native upload có duration |
| City load bất đồng bộ → lần fetch đầu không có city boost | Low | Lần 2 trở đi sẽ có |
| Hashtag boost chỉ re-sort 12 posts/page | Low | OK cho MVP |
| Math.max GREATEST có race condition nhỏ | Very Low | 1 user, 1 session |
| watch_time_avg tính lại mỗi beacon | Low | Nặng hơn khi scale, dùng trigger SQL sau |

---

## 6. Commits Phase 3

| Commit | Nội dung |
|---|---|
| `b880de4` | interact route + behaviorTracker wiring (lần 1) |
| `9f90d7c` | completion_rate fix + 3-tab feed + recommendation wiring |
