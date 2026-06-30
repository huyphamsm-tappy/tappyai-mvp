# Phase 2 Review — Video Upload, Deals Rotation, Explore APIs

**Commit cuối:** `3f89426`  
**Branch:** `main`  
**Deploy:** Vercel Production — ✅ Ready  
**Ngày:** 2026-06-30

---

## 1. Files Created

| File | Mục đích |
|---|---|
| `src/app/api/upload/video/route.ts` | Vercel Blob `handleUpload` server handler — xác thực mime/size, cấp upload token |
| `src/app/api/explore/process/route.ts` | POST — gọi claude-haiku-4-5 sinh caption + hashtags theo priority chain |
| `src/app/api/explore/oembed/route.ts` | GET proxy — TikTok oEmbed + Facebook OG scraper (edge runtime, CORS bypass) |
| `src/components/explore/VideoPlayer.tsx` | Video player với platform source-link overlay (YouTube/TikTok/Facebook) |
| `src/lib/explore/behaviorTracker.ts` | Client-side watch-time + completion-rate tracker (passive, non-blocking) |
| `src/lib/explore/contentProcessor.ts` | AI content processor — priority: caption → title → thumbnail |
| `public/feature-graphic.png` | App store feature graphic |
| `public/zalo_verifier*.html` | Zalo domain verification files (×2) |

---

## 2. Files Modified

| File | Thay đổi |
|---|---|
| `src/app/reviews/new/page.tsx` | Rewrite hoàn toàn — 3-tab media UI (Photo/Video/URL); AI flow cho cả video lẫn URL mode |
| `src/lib/shopee-deals.ts` | Thay live API (blocked) bằng 26-deal curated pool + deterministic day rotation |
| `src/app/deals/page.tsx` | Rewrite — color map theo category, badge styles, ICT timezone date, footer disclaimer |
| `src/app/api/cron/deal-notifications/route.ts` | `getShopeeDeals` → `getDealsForPersonalization` (pool 12 deals cho AI) |
| `src/app/api/reviews/feed/route.ts` | Feed query cập nhật columns mới: `content_type`, `media_url`, `thumbnail` |
| `src/app/api/reviews/route.ts` | POST handler lưu thêm `media_url`, `content_type`, `source_type`, `source_url`, `hashtags` |
| `src/app/reviews/page.tsx` | Feed UI render VideoPlayer cho video posts |
| `src/lib/ai/tools/common.ts` | Minor updates |
| `src/lib/ai/tools/food.ts` | Comment fix trên Serper photo fetch block |
| `src/app/api/debug-places/route.ts` | Serper debug endpoint mở rộng |
| `.gitignore` | Thêm `.env*`, `/*.bat`, `/*.ps1`, `/*.vbs`, `/*.log` |

---

## 3. Database Migrations

Tất cả migrations ở `supabase/migrations/`. Trạng thái: **đã chạy thủ công qua Supabase SQL Editor**.

| File | Tables / Columns Added |
|---|---|
| `add_explore_upgrade.sql` | `reviews.content_type`, `.media_url`, `.thumbnail`, `.hashtags`, `.watch_time_avg`, `.completion_rate`, `.save_count`, `.source_type`, `.source_url` + bảng `review_interactions` + trigger `trg_review_save_count` |
| `add_review_social.sql` | Bảng `review_saves`, `review_likes`, `review_comments` |
| `add_social_week2.sql` | Social feed indexes, follower counts |
| `add_memory_columns.sql` | Memory columns trên user profiles |
| `add_price_watches.sql` | Bảng `price_watches` |
| `add_profile_edit.sql` | Profile edit columns |
| `add_tracking_integrations.sql` | Integration tracking tables |
| `RUN_ALL_MIGRATIONS.sql` | Rollup tiện lợi — chạy tất cả theo thứ tự |

---

## 4. API Routes Added

```
POST /api/upload/video       — Cấp Vercel Blob upload token (yêu cầu auth)
POST /api/explore/process    — AI sinh caption+hashtags (caption → title → thumbnail)
GET  /api/explore/oembed     — TikTok oEmbed + Facebook OG proxy (?url=...)
```

---

## 5. Major Logic Changes

### Video Upload Flow (`reviews/new`)
Ba bước tuần tự, có thể huỷ:
```
1. [thumb]  Canvas → frame tại 0.5s → JPEG blob → upload lên Blob → thumbUrl
2. [video]  upload() với onUploadProgress + AbortController → media_url
3. [ai]     POST /api/explore/process { caption?, thumbnail_url } → hashtags + caption gợi ý (non-blocking)
```

### URL Mode AI Flow (`reviews/new`)
Khi user paste link (YouTube/TikTok/Facebook), ngay sau khi fetch metadata:
```
YouTube  → thumbnail từ i.ytimg.com → triggerUrlAI(thumb, '')
TikTok   → oEmbed fetch            → triggerUrlAI(thumb, title)
Facebook → OG scrape               → triggerUrlAI(thumb, title)

triggerUrlAI: POST /api/explore/process { thumbnail_url?, title?, caption? }
  → setAiHashtags nếu có
  → setBody nếu body trống và AI trả về caption
  → Non-blocking: failure không ảnh hưởng UX
```
Hashtags được lưu vào DB khi submit (`payload.hashtags = aiHashtags`).

### AI Input Priority (`contentProcessor.ts`)
```
1. caption có  →  text-only prompt (nhanh, không cần vision)
               →  AI chỉ sinh hashtags + category, giữ nguyên caption của user
2. title có    →  text-only prompt, AI sinh caption từ title
3. thumbnail   →  vision prompt (last resort, chỉ khi không có text)
4. không có gì →  fallback empty
```

### Facebook Best-Effort Preview
`/api/explore/oembed` fetch page HTML với `User-Agent: facebookexternalhit/1.1`, extract `og:image` + `og:title`. Trả về null nếu trang yêu cầu đăng nhập — không block UX.

### Day-based Deal Rotation (`shopee-deals.ts`)
Shopee Flash Sale API bị block (yêu cầu auth cookie). Thay bằng deterministic shuffle:
```ts
const seed = year * 10000 + (month+1) * 100 + day
// Fisher-Yates với seed — cùng shuffle cả ngày, bộ mới mỗi ngày
const j = (seed * (i + 1) * 2654435761) % (i + 1)
```
26 deals, 11 platform. `getShopeeDeals()` → 7 deals. `getDealsForPersonalization()` → 12 deals.

### Naming Convention — snake_case xuyên suốt
DB columns, API request body, frontend state đều dùng:
`media_url`, `content_type`, `source_type`, `source_url`, `thumbnail`

---

## 6. Test Results

| Test | Kết quả |
|---|---|
| `/deals` — 7 deals, date "Thứ Ba 30/6", HOT badge | ✅ |
| `/reviews/new` — Photo tab load | ✅ |
| `/reviews/new` — Video tab hiển thị "mp4·mov·webm·≤15s·50MB" | ✅ |
| `/reviews/new` — Link tab có sub-tabs YouTube/TikTok/Facebook | ✅ |
| YouTube URL → thumbnail load + `/api/explore/process` 200 + 5 hashtags sinh ra | ✅ Production |
| TikTok URL → oEmbed 200, thumbnail null → AI skip đúng (guard hoạt động) | ✅ Production |
| Facebook URL → oembed OG scrape 200 + `/api/explore/process` 200 | ✅ Production |
| Nút "Đăng" kích hoạt sau khi nhập URL | ✅ |
| AI dùng caption text-only khi user đã gõ nội dung | ✅ |
| **Video upload — thumbnail Blob** | ✅ Production: `thumbnails/1782791414545.jpg` |
| **Video upload — video Blob** | ✅ Production: `videos/1782791418060.webm` |
| **Video upload — AI process** | ✅ Production: `/api/explore/process` 200 |
| **Video upload — "Video đã tải lên" + Đăng enabled** | ✅ Production |
| `npm run build` — pass không lỗi | ✅ |
| Deal notification cron (7:30 ICT) | ⚠️ Đã schedule — chưa trigger thủ công |

**Blob store:** `y5ozy0i9wdb73mam.public.blob.vercel-storage.com` (production `BLOB_READ_WRITE_TOKEN` confirmed working)

---

## 7. Build Status

```
Build local:   ✅ npm run build pass
Commit cuối:   URL-mode AI + PHASE_REVIEW sync
URL prod:      https://tappyai.com
```

Lần redeploy trước (61c3e0f) cần thiết sau khi rotate `BLOB_READ_WRITE_TOKEN` để Vercel production nhận key mới.

---

## 8. Remaining Risks

| Risk | Mức độ | Ghi chú |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` thiếu trong `.env.local` | Medium | Video upload chỉ test được trên production |
| Facebook OG scrape fail nếu page private/login-gated | Low | Fallback về thumbnail rỗng — không block UX |
| TikTok oEmbed có thể rate-limit | Low | Edge-cached mỗi request; không có retry |
| `review_interactions` chưa được dùng trong feed ranking | Low | Columns đã có, score formula ghi trong SQL comment |
| Video >15s reject chỉ client-side + server size check | Low | Double protection: client duration check + server MAX_VIDEO_BYTES |

---

## 9. Known TODO Items

- [ ] **Local dev**: Thêm `BLOB_READ_WRITE_TOKEN` vào `.env.local`
- [ ] **Phase 3 chưa commit**: `src/app/api/profile/`, `src/app/profile/edit/`, `src/app/api/cron/morning-brief/`, `src/app/api/price-watch/`, `src/app/api/reviews/[id]/interact/`
- [ ] **Feed ranking**: Đưa watch-time từ `review_interactions` vào score formula
- [ ] **Video cancel UX**: Hiện toast "Đã huỷ" sau abort thay vì chỉ clear state
- [ ] **Cron test**: Trigger `/api/cron/deal-notifications` thủ công với `CRON_SECRET` để verify push end-to-end
- [ ] **Video storage**: Migrate lên Cloudflare R2 + CDN khi scale (xem TODO trong `upload/video/route.ts`)

---

## 10. Important Code Snippets

### Canvas Thumbnail Generation
```ts
function generateVideoThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true; video.playsInline = true
    video.src = URL.createObjectURL(file)
    video.onloadedmetadata = () => { video.currentTime = 0.5 }
    video.onseeked = () => {
      const scale = Math.min(1280 / video.videoWidth, 1280 / video.videoHeight, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => blob ? resolve(blob) : reject(), 'image/jpeg', 0.82)
    }
  })
}
```

### AI Input Priority (contentProcessor.ts)
```ts
// 1. Caption có → text-only (rẻ, chính xác)
if (caption?.trim()) {
  // sinh hashtags + category từ caption — không gọi vision
}
// 2. Title có, không có thumbnail → text-only, sinh caption
if (title?.trim() && !thumbnailUrl) { ... }
// 3. Thumbnail (± title hint) → vision prompt
{ type: 'image', image: new URL(thumbnailUrl) }, { type: 'text', text: titleHint + prompt }
```

### URL Mode AI Flow
```ts
const triggerUrlAI = async (thumbnail_url: string, title: string) => {
  if (!thumbnail_url && !title) return
  try {
    const aiRes = await fetch('/api/explore/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thumbnail_url, title, caption: body.trim() || undefined }),
    })
    if (aiRes.ok) {
      const ai = await aiRes.json()
      if (Array.isArray(ai.hashtags) && ai.hashtags.length > 0) setAiHashtags(ai.hashtags)
      if (!body.trim() && ai.caption) setBody(ai.caption)
    }
  } catch { /* non-blocking */ }
}
// Gọi sau khi setUrlMeta cho YouTube / TikTok / Facebook
```

### Vercel Blob Upload với Progress + Cancel
```ts
const controller = new AbortController()
const result = await upload(`videos/${Date.now()}.${ext}`, file, {
  access: 'public',
  handleUploadUrl: '/api/upload/video',
  abortSignal: controller.signal,
  onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
})
```

### Day-based Deal Rotation
```ts
function getDailyDeals(count = 6): Deal[] {
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
  const shuffled = [...DEAL_POOL]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (seed * (i + 1) * 2654435761) % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count)
}
```

### Facebook OG Scrape
```ts
const res = await fetch(url, {
  headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' },
  signal: AbortSignal.timeout(6000),
})
const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null
```
