# PRE-REDESIGN AUDIT — trạng thái thực tế trước khi quyết định redesign Consultative theo domain

Ngày: 2026-09-24 · Worktree canonical: `g1-place-guard` · Nhánh: `rc/web-uat` · HEAD khi viết: `ccee15b`
Phạm vi: CHỈ ĐỌC + đo. Không sửa sản phẩm, không đổi migration, không đổi test, không đổi `findings.json`,
không deploy, không push. Ngoại lệ duy nhất đã dùng: commit STEP-3 (`ccee15b`, §3).
Mọi chỗ "đã xác minh" dưới đây có lệnh/quan sát đi kèm. Chỗ nào không xác minh được thì ghi rõ.

---

## 1. Tóm tắt điều hành

1. **STEP-3 đã được cứu và commit** — `ccee15b` "chore: harden UAT environment guard", đúng 5 file
   (guard, badge, whoami, port 3007). Nó KHÔNG nằm trong working tree mà chỉ còn trong
   `stash@{1}` (`14f8acb`); đã khôi phục nguyên văn từ stash, stash giữ nguyên.
2. **Còn một đường local chạm được production** — repo chính `tappyai-mvp` giữ 4 file chứa secret
   production (service-role, Stripe secret + webhook secret, Anthropic, Zalo app secret, Google OAuth
   secret, Vercel OIDC, Blob RW, CRON_SECRET). Một trong số đó, `.env.production.local`, **được Next.js
   tự nạp khi `next build` / `next start`** → build/start production ở checkout đó sẽ chạy vào DB
   production. Guard STEP-3 không che đường này (chỉ chặn `NODE_ENV !== 'production'`). Ngoài ra
   `tappyai-mvp/.next` là dev-cache cũ (09-06) có 14 file chứa ref production. Chưa xoá gì — báo cáo.
3. **Guard khởi động: đã chứng minh bằng quan sát, không một kết nối mạng nào** (§6). Giới hạn: guard là
   denylist khớp đúng 1 ref; chỉ chặn `next dev`; override `ALLOW_PROD_SUPABASE_IN_DEV=1` không in cảnh báo
   khi khởi động (chỉ badge đỏ).
4. **Badge vắng mặt khỏi bundle production** — 0 hit trong `.next/static` và HTML prerender (§7).
5. **Music ẩn bằng CODE trên cả 3 nền tảng**, không phụ thuộc biến môi trường (§8). Backend
   `GET /api/music/tracks` vẫn sống theo quyết định trước đó của owner. Lockdown `music_tracks` đã áp trên
   audit, **chưa** áp trên production.
6. **Health check xanh**: tsc 0 lỗi · lint 0 lỗi/42 cảnh báo · web 13.584 pass/0 fail · DB 839 pass/0 fail ·
   production build OK · Android build OK + 770 unit test/0 fail · iOS **không compile được** trên máy này.
7. **findings.json: 0 finding nào chặn launch** theo bằng chứng code. 3 bug AI của Session D (8 card,
   "98-99%", bỏ qua quận) **vẫn tái hiện theo code và KHÔNG được ghi trong `findings.json`**.
8. **Redesign Consultative theo domain: KHÔNG cần trước launch.** Quan trọng: 3 bug AI đã biết nằm ở code
   deterministic (`budget.ts`, `food.ts`, `liveView.ts`), **không nằm ở prompt** — redesign prompt không
   sửa được chúng.
9. **Đường ngắn nhất tới launch: 3 phiên, 1 vòng UAT thủ công** — toàn bộ việc chặn launch còn lại là vận
   hành (migration, env, deploy, UAT bản RC cuối), không phải tính năng (§16).

---

## 2. `npm run whoami`

**Lúc bắt đầu audit (nguyên văn):**
```
npm error Missing script: "whoami"
npm error
npm error To see a list of scripts, run:
npm error   npm run
[exit=1]
```
Lý do: HEAD lúc đó là `33b7690` trên `rc/web-uat`; STEP-3 chưa từng được commit, chỉ nằm trong
`stash@{1}` "WIP groupA dev-env tooling (step3)".

**Sau commit STEP-3 `ccee15b` (nguyên văn):**
```
  worktree : D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\g1-place-guard
  branch   : rc/web-uat
  commit   : ccee15b
  supabase : zdaprdfgpbpnxyofagmc  ✅ audit/non-prod
  dev port : 3007
```

---

## 3. Việc chưa commit / STEP-3

### 3.1 Trạng thái worktree canonical khi bắt đầu
| Loại | Số file |
|---|---|
| modified | 0 |
| untracked | 0 |
| staged | 0 |
| unstaged | 0 |
| deleted | 0 |

Worktree sạch. Không có file Home/Profile/Settings, Music hay consultative nào đang dở ở đây.

### 3.2 STEP-3 nằm ở đâu
Chỉ trong `stash@{1}` = `14f8acba4e6154a680614fe0081eb8140a211b3c`, base `c9e8352`. Nội dung stash:

| File | Thuộc STEP-3? | Bằng chứng | Quyết định |
|---|---|---|---|
| `next.config.mjs` | ✅ | diff chỉ thêm `gitInfo()`, guard `REFUSING TO START`, 3 biến `NEXT_PUBLIC_DEV_*` | commit |
| `package.json` | ✅ | diff chỉ đổi `"dev": "next dev -p 3007"` + thêm `"whoami"` | commit |
| `src/app/layout.tsx` | ✅ | diff chỉ thêm dynamic import `DevEnvBadge` + render trong nhánh `development` | commit |
| `scripts/whoami.mjs` | ✅ | file mới, script whoami | commit |
| `src/components/DevEnvBadge.tsx` | ✅ | file mới, badge | commit |
| `docs/uat/ENVIRONMENT-INVENTORY.md` | ❓ | là báo cáo kiểm kê môi trường (STEP 0/1), không phải badge/guard/whoami/port | **KHÔNG commit** — vẫn trong stash |

### 3.3 Commit
- Hash: **`ccee15b1f8443e36c96735dfe51fcb495cee4e7d`** — "chore: harden UAT environment guard"
- File: `M next.config.mjs`, `M package.json`, `A scripts/whoami.mjs`, `M src/app/layout.tsx`,
  `A src/components/DevEnvBadge.tsx` (122 dòng thêm, 1 dòng xoá).
- Cách làm: `git diff <stash>^1 <stash> -- <3 file tracked> | git apply -3 --index` (cả 3 áp sạch, script
  `extension:package` của rc được giữ), 2 file mới lấy nguyên văn từ `<stash>^3`.
- Kiểm trước khi commit: đúng 5 file staged, không có conflict marker, `git diff --cached --check` sạch,
  control-byte guard sạch, `tsc --noEmit` exit 0, không có chuỗi giống secret.
- Không amend commit nào. Stash `14f8acb` **không drop**.

### 3.4 Còn lại chưa commit
| Ở đâu | Cái gì |
|---|---|
| `stash@{1}` `14f8acb` | `docs/uat/ENVIRONMENT-INVENTORY.md` (mơ hồ nên không commit) |
| `stash@{0}` `834652e` | Nhóm B — §5/§13 remediation (không phải STEP-3; merge đã chứa bản rc tương đương) |
| worktree canonical | `docs/uat/PRE-REDESIGN-AUDIT.md` (chính báo cáo này, untracked, không commit) |

### 3.5 Lưu ý về nhánh
`ccee15b` nằm trên `rc/web-uat` **local**, chồng lên `33b7690` "docs(zalo): region probe result…" — commit
của một actor khác, chỉ thêm `docs/uat/ZALO-REGION-PROBE.md`. **Trong lúc audit, tác giả đã push `33b7690`**:
`origin/rc/web-uat` giờ là `33b7690` (lúc bắt đầu là `c7604c9`). `ccee15b` **chỉ có ở local**, đi trước origin
đúng 1 commit (fast-forward được). Tôi không push gì. Chưa kiểm uat.tappyai.com đang phục vụ commit nào sau lần
push đó.

---

## 4. Ma trận môi trường 6 worktree

| Worktree | Nhánh | HEAD | Dirty | `.env.local` ref | Môi trường dự kiến | Port | Chạm được production? |
|---|---|---|---|---|---|---|---|
| `tappyai-mvp` (repo chính) | `feat/consultative-d1-d2-r1-r2-d3` | `77b0bb7` | 0 | `zdaprdfgpbpnxyofagmc` (audit) | audit (theo đợt hợp nhất) | 3000 | **CÓ** — xem §5 |
| `tappyai-ios-sprint` | `feat/backoffice-phase0` | `3516bce` | 129 | không có `.env.local` | iOS/backoffice sprint của owner (không đụng) | 3000 | Không (không có cấu hình Supabase; không có `node_modules`) |
| `.worktrees/g1-growth` | `feat/g1-growth` | `8a01877` | 3 | không có `.env.local` | tham chiếu G1 (giữ theo lệnh) | 3000 | Không (không có cấu hình; không có `node_modules`) |
| `audit-nonprod` | detached | `0802cf1` | 29 | `zdaprdfgpbpnxyofagmc` (audit) | nguồn `.env.local` audit | 3000 | Không |
| `g1-place-guard` ⭐ | `rc/web-uat` | `ccee15b` | 0 | `zdaprdfgpbpnxyofagmc` (audit) | UAT canonical | **3007** | Không (guard + env audit + không có file env production) |
| `tappyai-phase8` | `phase8-master` | `7a5f9e2` | 0 | không có `.env.local` | roadmap Phase 8 (cô lập) | 3000 | Không (không có cấu hình Supabase) |

Ghi chú:
- Chỉ `g1-place-guard` có guard + `whoami` + port 3007. Năm worktree còn lại không có guard.
- Biến có mặt (chỉ tên): `g1-place-guard` và `audit-nonprod` có `SUPABASE_SERVICE_ROLE_KEY` +
  `SUPABASE_DB_PASSWORD` của **audit**.
- Không worktree nào có `.vercel/project.json` → không có đường `vercel deploy` / `vercel env pull` local.
- `audit-nonprod` bẩn 29 file và `g1-growth` bẩn 3 file; cả hai đã tồn tại trước audit và nằm ngoài phạm vi.

---

## 5. Chứng minh cách ly production

### 5.1 File env chứa production (repo chính `tappyai-mvp`, đều gitignored, không tracked)
| File | Next.js tự nạp? | Ref | Tên biến nhạy cảm (không in giá trị) |
|---|---|---|---|
| `.env.production.local` (08-03) | **CÓ** — khi `next build`/`next start` (ưu tiên hơn `.env.local`) | **production** | `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GOOGLE_CLIENT_SECRET`, `ZALO_APP_SECRET`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `VERCEL_OIDC_TOKEN`, … |
| `.env.production.tmp` (06-29) | không | production | như trên |
| `.env.vercel.prod.tmp` (08-03) | không | production | như trên |
| `.env.vercel.tmp` (06-30) | không | production | `ANTHROPIC_API_KEY`, `VERCEL_OIDC_TOKEN`, anon key… |
| `.env.local.PRODUCTION-DO-NOT-USE.bak` (09-20, do đợt hợp nhất tạo) | không | production | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, … |
| `.env.local.bak-before-restore` (08-13) | không | production | `KV_REST_API_TOKEN`, anon key, … |

**Kết luận:** `npm run dev` ở `tappyai-mvp` → audit. Nhưng `npm run build` / `next start` ở đó → **production,
với service-role**. Đợt hợp nhất trước chỉ trung hoà `.env.local` và **bỏ sót** `.env.production.local`.
Quy tắc owner "không để checkout local nào chạm production" hiện **đang bị vi phạm** ở checkout này.
Audit này không xoá/đổi tên (theo lệnh chỉ báo cáo).

### 5.2 Artifact build đã cache
| Worktree | `.next` | File chứa ref production | File chứa ref audit |
|---|---|---|---|
| `tappyai-mvp` | dev-cache, 09-06 | **14** | 0 |
| `g1-growth` | dev-cache, 09-15 | 0 | 0 |
| `audit-nonprod` | dev-cache, 09-20 | 0 | 4 |
| `g1-place-guard` | dev-cache, 09-24 | 0 | 3 |
| `tappyai-phase8` | dev-cache, 09-24 | 0 | 0 |

Không `.next` nào là production build (không có `BUILD_ID`). Cache của `tappyai-mvp` sinh ra khi checkout
đó còn trỏ production. Không xoá.

### 5.3 Script / cấu hình tracked có ref production (`git grep` trên `ccee15b`, không tính docs)
- `scripts/audit/*` (13 file), `scripts/diagnostics/c11-*`: dùng ref production làm **denylist**
  (`throw`/refuse khi URL chứa ref đó). Không phải đường tấn công.
- `scripts/migrations/apply-controller-v2-production.mjs`: công cụ **cố ý** áp migration lên production. Cần
  `PROD_DATABASE_URL` trong `.env.prod-admin` + cờ `--apply`, và từ chối nếu URL không phải production.
  Không worktree nào có `.env.prod-admin` → hiện không chạy được.
- `next.config.mjs`, `scripts/whoami.mjs`, `src/components/DevEnvBadge.tsx`: hằng số để so sánh (guard/badge).
- Không có `supabase/config.toml` / `project_id`.

---

## 6. Chứng minh guard khởi động

### 6.1 Guard nằm ở đâu trong chuỗi khởi động
- Guard ở `next.config.mjs` dòng 1–32, top-level của module, trước `const nextConfig` (dòng 34).
  `next.config.mjs` không import Supabase.
- Next nạp `next.config.mjs` trước khi biên dịch hay phục vụ bất kỳ route nào. Supabase client chỉ được
  tạo trong handler/module nạp theo request. Không có `instrumentation.*` (hook chạy lúc server start).
- Mọi điều trên ban đầu chỉ là đọc code, nên thứ tự được **chứng minh bằng quan sát** như dưới.

### 6.2 Bố trí test (an toàn)
- Bản sao cô lập: `git archive ccee15b` vào scratchpad. **Không có file `.env` nào** (chỉ
  `.env.local.example`, Next không nạp) → **0 credential**. Không đụng `.next` của server :3007 đang chạy.
- Tripwire mạng `netblock.cjs` nạp qua `NODE_OPTIONS=--require` vào **mọi** process node (CLI cha + server
  fork). Nó ghi log mọi `socket.connect` / DNS / `fetch`, và **chặn mọi thứ không phải loopback/IPC**. Như vậy
  kể cả khi guard hỏng, test vẫn không thể tới production.
- Không ghi gì vào file env nào. Biến môi trường chỉ đặt cho process con. `NEXT_TELEMETRY_DISABLED=1`.

### 6.3 Kết quả
| Run | `NEXT_PUBLIC_SUPABASE_URL` | Kết quả | Log mạng |
|---|---|---|---|
| **B** — synthetic, cùng dạng production (20 ký tự) | `https://zzzzzzzzzzzzzzzzzzzz.supabase.co` | server lên `✓ Ready in 2.5s` | 3 process; **0 connect, 0 DNS, 0 fetch** |
| **A** — chuỗi ref production, KHÔNG credential, mạng bị chặn | `https://fwznnobrdctuskgrvuik.supabase.co` | exit 1, `🛑 REFUSING TO START — dev server is pointed at the PRODUCTION Supabase project (fwznnobrdctuskgrvuik).` | **1 process** (server chưa từng được fork); **0 kết nối remote, 0 lookup supabase** |

**Phương pháp:** A (chuỗi ref production, không credential), với thứ tự "guard trước mọi kết nối" được
chứng minh bằng quan sát ở run B, cộng tripwire chặn mạng. Run B đồng thời cho thấy guard quyết định dựa trên
**giá trị** ref, không dựa trên khả năng kết nối: một ref cùng dạng nhưng khác giá trị thì **không** bị chặn.

### 6.4 Giới hạn của guard (không sửa)
1. **Denylist khớp đúng 1 ref** (`fwznnobrdctuskgrvuik`). Một project production khác sẽ lọt qua.
2. **Chỉ chặn khi `NODE_ENV !== 'production'`** → `next build` / `next start` không được che. Đây chính là
   đường đi của §5.1.
3. **Override không in cảnh báo.** `ALLOW_PROD_SUPABASE_IN_DEV=1` bỏ qua guard mà không log gì; chỉ còn badge
   đỏ trên UI. Kết luận này là **đọc code**, không chạy thử, vì chạy thử nghĩa là boot một server cấu hình trỏ
   production. Yêu cầu "không bao giờ im lặng" chỉ đạt một phần.
4. Chỉ `g1-place-guard` có guard.

### 6.5 Khôi phục
Bản sao cô lập đã xoá, kể cả `.env.local` audit chép tạm cho bước build ở §7. `node_modules` trong bản sao là
bản **copy vật lý** 686 MB (xác nhận bằng `fsutil`: không phải reparse point), nên xoá không ảnh hưởng bản
cài canonical (vẫn 525 entry). Không còn file `.env*` nào trong scratchpad. Không file env thật nào bị đổi.

---

## 7. Badge trên production build

| | |
|---|---|
| Lệnh | `npm run build` (= `node scripts/check-env.mjs && next build`), trên bản sao cô lập của `ccee15b`, env = audit |
| Kết quả | exit 0 · `✓ Compiled successfully` · `✓ Generating static pages (192/192)` · `BUILD_ID 0zoEOO1ai6dTdxBGmntm5` · C9b: 5/5 biến bắt buộc |
| Log "Dynamic server usage" | `/api/admin/media/wif-check`, `/api/subscription`: route được đánh dấu dynamic lúc phân tích tĩnh; không phải lỗi build |
| Cách xác minh | grep toàn bộ `.next` (931 file js/html/json) |

| Chuỗi | Toàn bộ `.next` | `.next/static` (gửi cho trình duyệt) |
|---|---|---|
| `dev-env-badge` (testid) | 0 | 0 |
| `audit dev` / `PRODUCTION DB` (chữ trên badge) | 0 | 0 |
| `fwznnobrdctuskgrvuik` (hằng số trong badge) | 0 | 0 |
| `DevEnvBadge` | 2 (chỉ trong `.next/cache/webpack/server-production/0.pack` và cache eslint) | **0** |
| `NEXT_PUBLIC_DEV_` | 1 (`.next/required-server-files.json`, tức config serialize; phía server) | **0** |
| đường dẫn worktree | 605 (server chunks, types, trace: đường dẫn tuyệt đối bình thường của build local) | **0** |
| Kiểm tra độ tin cậy: `VersionWatcher` / `NavHistoryTracker` | 95 / 95 | — |

**Kết luận: badge VẮNG MẶT** khỏi bundle client và HTML của production build tại `ccee15b`. Dư lượng duy nhất
là giá trị `NEXT_PUBLIC_DEV_*` (sha/branch `unknown`, đường dẫn thư mục build) trong `required-server-files.json`
phía server. Không hiển thị cho người dùng, không phải secret.

---

## 8. Audit các cờ hành vi

### 8.1 Cờ đọc từ biến môi trường (`src/lib/config/product.ts`)
| Cờ | Giá trị code khi chưa đặt | Prod cần | Nguồn sự thật | Prod phụ thuộc env? | Khớp DEPLOY-CHECKLIST §4a? |
|---|---|---|---|---|---|
| `PLACE_GUARD_ATTRIBUTION_V2` | **ON** (chỉ `0`/`false` mới tắt, `:391-395`) | unset (ON) | product.ts | có, nhưng an toàn khi chưa đặt | ✅ |
| `CONSULTATIVE_V1` | OFF (`:436-439`) | unset (OFF) | product.ts | có, an toàn khi chưa đặt | ✅ |
| `SNIPPET_PRICE_GUARD_V2` | OFF | unset | product.ts | có, an toàn | ✅ |
| `MEDIA_PLACEMENT_V2` | OFF | unset | product.ts | có, an toàn | ✅ |
| `RISK_BACKSTOP` | **live** (`:461-466`) | unset (live) | product.ts | có, an toàn | ✅ (§4b) |
| `LLM_*_MODEL` | `claude-haiku-4-5-20251001` (`providers/claude.ts:32-33`) | unset | registry/provider | có, an toàn | ✅ |
| `PLACES_PROVIDER` | `serper` (`placesProvider.ts:21`) | unset | placesProvider.ts | có, an toàn | ✅ |
| `PRO_DAILY_CHAT_CAP` / `CHAT_*_BURST_PER_MINUTE` | 300 / 20 / 30 qua `envInt` (`security/chatCaps.ts:21-25`) | mặc định | chatCaps.ts | **có thể ghi đè bằng env** | ⚠️ §4a gọi là "code const"; thực tế đọc được từ env |
| `SERPER_DAILY_CREDIT_CEILING` | 15.000 | **phải đặt rõ** | serperClient.ts | **có — BẮT BUỘC** | ✅ (checklist đánh dấu REQUIRED; cần thêm `KV_REST_API_URL` để là trần toàn cục) |

### 8.2 Hằng số trong code (không đọc env)
| Cờ | Giá trị | Khớp §4a? |
|---|---|---|
| `SHOW_SCAM_SHIELD` / `SHOW_PRO_UPGRADE` / `SHOW_MARKETPLACE` / `SHOW_WALLET` / `SHOW_APP_CONNECTIONS` | `true` / `false` / `false` / `false` / `false` | ✅ |
| **`SHOW_MUSIC`** | **`false`** (`product.ts:111`) | ⚠️ **không có trong dòng "Navigation surfaces" của §4a** (Music được nói ở callout đầu checklist) |
| `CCP_ENABLED` / `CCP_MERCHANT_PAGE_READ_ENABLED` / `CCP_FEED_DISPLAY_ENABLED` / `CCP_FEED_INGEST_ENABLED` / `CCP_AFFILIATE_WRAPPING_ENABLED` | `true` / `false` / `false` / `true` / `true` | ✅ |
| `EMIT_PLACES_ANNOTATION` / `EMIT_TAPPY_PLACES` / `SERVER_AUTHORED_CTA` | `true` / `false` / `false` | ✅ |
| `FREE_DAILY_LIMIT` / `ANON_LIFETIME_LIMIT` | 15 / 5 | ✅ |

### 8.3 Music — ẩn bằng CODE, không phụ thuộc env
| Nền tảng | Cơ chế | Đọc env/server? | Bằng chứng |
|---|---|---|---|
| Web | `export const SHOW_MUSIC = false`; gate nav, Smart Tools, composer, feed, `/music` (`notFound()`) | **Không** | `product.ts:111`; `musicHidden.test.tsx` (30 test) xanh trong bộ full |
| Android | `const val SHOW_MUSIC = false` trong `ProductFlags.kt:34`; package `com.tappyai.app.music` **không tồn tại** | **Không** | music vắng mặt, không chỉ bị gate |
| iOS | `static let showMusic = false` (`ProductFlags.swift:26`); UI gate ở `CreateReviewView`, `ReviewActionRail`, `ReviewsFeedView` | **Không**. `AppConfigService.showMusic: Bool?` được decode nhưng **không nơi nào đọc** để quyết định UI | **iOS chưa compile** |
| Server → native | `GET /api/config` trả `showMusic: SHOW_MUSIC` (`config/route.ts:53`) | — | để đối chiếu; client không dùng nó để hiển thị |

Tài liệu cũ (không sửa trong audit này): callout Music trong `DEPLOY-CHECKLIST.md` và `owner_decision` trong
`findings.json` vẫn nhắc `FeatureFlags.showMusic` / `FeatureFlags.swift`. File đó **đã bị xoá**; symbol thật là
`ProductFlags.showMusic`. Callout cũng ghi "Android: nothing to gate", nay Android đã có mirror
`ProductFlags.SHOW_MUSIC`. Cả hai do tôi viết ở `c9e8352`.

---

## 9. Tính nhất quán nhánh và migration

### 9.1 Lineage `uat/phase7-regressions`
- Tip `c9e8352`. **Tuyến tính** (0 merge commit) trong đoạn sau điểm tách với dòng rc (`f258ca5`, 09-18):
  233 commit.
- Các lớp (cũ → mới):
  1. 09-18 → 09-20, khoảng 150 commit: dòng consultative-v1 / cost / cards / CCP / commerce / guards / venues.
  2. 09-20 → 09-21: UAT release-audit PASS 1–3 (F-014 … F-036).
  3. `9f85cde` 09-22: **Session A** "complete Phase 7 UAT fixes".
  4. `2b0664f` → `336db06` 09-22/24: **Session C**, gồm golden set, F-038 → F-052.
  5. `c9e8352` 09-24: ẩn Music (cleanup).
- "Session D" (bộ 8 ảnh chụp) **không có commit nào** trên nhánh này.
- **Toàn bộ `uat/phase7-regressions` nằm trong `rc/web-uat`** (`merge-base --is-ancestor` = YES) → không có
  commit nào của nó bị mồ côi so với nhánh sẽ ship.

### 9.2 Revert, trùng lặp, áp lại
- **2 cặp revert triệt tiêu, không áp lại:**
  - `4bf514a` ↔ `d10a7e9` (rules bị `CONSULTATIVE_V1` override rời rulebook đã cache)
  - `010128f` ↔ `5f67dfc` (rulebook batch 2)
- **Music: gỡ → khôi phục → ẩn hai lần**
  - `919736a`/`21cc9cf`/`c584367` (F-024/F-034) gỡ reuse và thư viện, xoá `src/modules/music`.
  - `9f85cde` (Session A) **khôi phục** thư viện.
  - `c9e8352` ẩn thư viện. `b72f5cc` (bên rc) cũng ẩn, theo kiến trúc reuse.
  - Merge `3cbb10e` + `070e6ad` gộp về một flag.
- **Thay đổi tương đương ở nhiều commit:**
  - §5 giới hạn ảnh / §13 Back: bản uncommitted ở stash nhóm B **và** bản đã commit trong `861783a` (rc).
    Merge lấy bản rc.
  - Escape control-byte: `815875c` (phase7) và `c7604c9` (file growth của rc).

### 9.3 Nhánh local giữ việc KHÔNG có trong `rc/web-uat` (liên quan launch)
| Nhánh | Commit không có trong rc | Ghi chú |
|---|---|---|
| `phase8-master` | 6 | roadmap riêng, đúng dự kiến |
| `feat/scam-shield-public-utility` | 1 (`153035d`) | tiện ích `/kiem-tra`, **không** nằm trong nhánh ship |
| `feat/g1-completion`, `feat/g1-growth`, `uat/release-audit-2026-09`, `uat/unified`, `hotfix/auth-exif`, `integration/v3-canonical` | 0 | đã nằm trọn trong rc |

Có 404 nhánh local tổng cộng. Nhiều nhánh cũ (tháng 7–8, backup/feature) có commit không nằm trong rc; không
nhánh nào là ứng viên launch.

### 9.4 Migration
- `uat/phase7-regressions`: **94** forward / 25 rollback.
- `rc/web-uat`: **96** / 27. Thêm 2 migration G1: `20260913_g1_growth_foundation`, `20260918_g1b_share_ancestry`.
- `origin/main 842379b` (code production): **80**. → **16 migration mới** so với code production.
- Bảng đủ cả 96 dòng: **Phụ lục A**.

**16 migration mới — đối chiếu DEPLOY-CHECKLIST và DB audit (probe chỉ đọc, chỉ trên audit):**
| Migration | DEPLOY-CHECKLIST | Đã áp trên audit | Rollback |
|---|---|---|---|
| `20260905_chat_messaging_phase1` | — (ngầm hiểu đã có trên prod) | ✅ | không |
| `20260906_phase6_messenger_reachability` | — | ✅ | không |
| `20260913_plan_shares` | #1 | ✅ | có |
| `20260915_profile_public_presentation` | — | ✅ | có |
| `20260915_review_shares` | — | ✅ | có |
| `20260920100000_commerce_providers` | #2 | ✅ | không (additive) |
| `20260920110000_commerce_feed_items` | #3 | ✅ | không (additive) |
| `20260920_f028_dob_self_correct_while_ineligible` | #4 | ✅ | có |
| `20260921_f032_admin_role_actor_from_authuid` | #5 | ✅ | có |
| `20260921_music_tracks_lockdown` | #6 | ✅ (0 policy, anon SELECT = false) | có |
| `20260921_user_events_ga4_event_types` | #7 | ✅ | có |
| `20260921_user_events_shopping_search_event` | #8 | ✅ | có |
| **`20260922_groups_avatar_url`** | **không có trong thứ tự** | ✅ | có |
| **`20260922_music_soundhelix_attribution`** (data) | chỉ được nhắc ("treat like seed") | có cột; dữ liệu chưa xác minh | không |
| **`20260913_g1_growth_foundation`** (chỉ rc) | **không có** | **❌ CHƯA ÁP** | có |
| **`20260918_g1b_share_ancestry`** (chỉ rc) | **không có** | **❌ CHƯA ÁP** | có |

**Mâu thuẫn (không tự chọn bên):**
- DEPLOY-CHECKLIST §1 ghi "*Only **eight** migrations are missing from the 2026-09-17 prod snapshot*".
- Nhánh ship thực tế có thêm ít nhất **4 migration nằm ngoài thứ tự áp**: 2 migration ngày 09-22 (ra đời sau
  snapshot) và 2 migration G1.
- Code G1 đang ship dùng `shared_results`, bảng này **chưa có trên audit**. Nếu uat.tappyai.com trỏ vào audit
  (chưa xác minh), luồng G1 share-out sẽ lỗi khi UAT.
- Trạng thái DB production **không thể kiểm** (cấm truy cập production). Mọi khẳng định "đã có trên prod" chỉ
  dựa vào checklist.

### 9.5 Music — bốn tầng tách bạch
| Tầng | Trạng thái | Bằng chứng |
|---|---|---|
| 1. **Ẩn ở code** | ✅ Web/Android/iOS, hằng số trong code | §8.3 |
| 2. **Thư viện/DB được khôi phục** | Code thư viện sống lại (`9f85cde`). `GET /api/music/tracks` phục vụ hàng `royalty_free`/`licensed` qua service-role, **không bị `SHOW_MUSIC` gate** (theo quyết định của owner). Audit có 14 hàng SoundHelix `royalty_free`, 0 hàng Jamendo | `api/music/tracks/route.ts`; probe audit |
| 3. **Lockdown DB** | Đã áp trên **audit**. **Chưa** áp trên production (checklist #6) | probe audit |
| 4. **Yêu cầu khi deploy production** | Production hiện là `842379b` (09-11), **trước** F-024 → UI Music + reuse **đang hiển thị trên production**. Deploy code RC ẩn UI mà không cần biến env nào. Áp #6 cùng hoặc ngay sau deploy. Còn lại: API GET vẫn trả catalogue; nếu catalogue production có hàng Jamendo (PHASE7-AUDIT R5) thì vẫn gọi được trực tiếp — **chưa xác minh** | §9.4, PHASE7-AUDIT |

---

## 10. Trạng thái bug hợp nhất (`findings.json` thực tế trên `ccee15b`)

**52 finding:** fixed 23 · open 23 · closed 3 · verified 1 · not-reproducible 1 · fix-built-pending-approval 1.
Mọi `fix_commit` được ghi đều là tổ tiên của HEAD, nên không có fix nào bị mất qua merge.

### A. CHẶN LAUNCH
Theo bằng chứng code, **không finding nào trong `findings.json`** chặn launch.
- *Có điều kiện, không có trong `findings.json`:* **Zalo R-1.** `/api/auth/zalo/complete` từng tin `zaloId`
  gửi lên từ body, dẫn tới chiếm tài khoản.
  - Đã sửa ở `8efcdb5` (là tổ tiên của HEAD).
  - Production `842379b` **vẫn còn lỗ**, chỉ được che nhờ Zalo app chưa kích hoạt.
  - Bản sửa trả 503 khi chạy từ region US; region probe chưa kết luận.
  - → Chặn launch **chỉ khi Zalo login nằm trong phạm vi launch**. Toggle kích hoạt Zalo phải giữ OFF tới khi
    bản sửa lên production.

### B. NÊN SỬA TRƯỚC LAUNCH
| ID | Sev | Mô tả | Trạng thái thực |
|---|---|---|---|
| F-001 | P1 | GA4 prod: code xong, còn việc của owner (env prod, Firebase, Play Data Safety; chính sách riêng tư chưa nêu GA/Firebase) | fixed-in-code, việc owner còn mở |
| F-002 | P0 | `next@14.2.35` còn advisory critical/high; đã giảm nhẹ cho AVIF RCE, SSRF/DoS chưa | mở (owner hẹn sau launch) |
| F-003 | P2 | `google-services.json` được track; key có bị giới hạn không phải kiểm trên Cloud Console | chưa xác định |
| F-004 | P2 | Google key cũ trong `c473ade` (chỉ còn ở reflog); cần owner xác nhận đã vô hiệu | chưa xác định |
| F-005 | P2 | 15 advisory dependency production (lockfile không đổi) | mở |
| F-023 | P2 | Scam Shield chưa có disclaimer / đường khiếu nại (`ScamMessageResult.tsx:100-125`) | mở |
| F-036 | P2 | 0 nút mua cho tới khi feed-ingest chạy (cần credential Accesstrade + 1 lần cron) | mở (vận hành) |
| **Session D (a)** | — | **~8 place card**, owner nói đã thống nhất 3 | **tái hiện** (xem dưới) |
| **Session D (b)** | — | **"like new 98-99%" bị đọc thành budget 98k–99k** | **tái hiện** |
| **Session D (c)** | — | **"quận 3" trong câu bị bỏ qua, ưu tiên GPS gần nhất** (rạp phim) | **tái hiện** |
| R-2 | — | Ảnh đã public trước bản sửa EXIF có thể còn GPS; `scripts/audit/gpsInStoredMedia.mjs` chưa chạy | mở (quyền riêng tư) |

**Ba bug Session D** — nguồn: lần re-run 2026-09-24 trên `336db06` + DB audit (chạy trong phiên, không có
file). Code tại HEAD khớp; `budget.ts`, `food.ts`, `serperLocation.ts`, `liveView.ts`, `toolResultSplit.ts`
**không đổi** giữa `336db06` và HEAD. **Không có trong `findings.json` hay tài liệu UAT nào.**
- (a) `liveView.ts:178` `MAX_ITEMS = 8`; `PlaceDecision.tsx:388` + `b40dc8a` "**three cards above the fold**".
  → Thiết kế đã hiện thực là *3 card trên màn hình đầu, tối đa 8 trong bộ* ("Tất cả (8)").
  **Mâu thuẫn chưa giải:** "3 card" theo owner nhớ là 3 *tổng cộng* hay 3 *trên màn hình đầu*? Cần owner quyết.
- (b) `budget.ts:72-77`: regex khoảng giá có đơn vị tuỳ chọn và không loại trừ `%`; `parseMoneyAmount`
  (`:37`) nhân ×1000 với số trần ≤ 9999. Được gọi ở `chat/route.ts:223`.
- (c) `food.ts:111`: địa danh trong câu chỉ override GPS khi là **thành phố khác**. Search đặt tâm ở GPS;
  `belongsToDestination` kiểm cấp thành phố, không kiểm quận.

### C. SAU LAUNCH
F-008 (PUT cuộc trò chuyện của người khác trả 500), F-009 (DELETE trả `ok:true` cả khi không xoá dòng nào),
F-011 (lộ chuỗi lỗi Supabase thô khi đăng ký), F-012 (anon nhận 200 ở notifications/memory),
F-020 (affiliate chờ Accesstrade duyệt), F-030 (điểm mù của test mock DB), F-045 (một bộ card mỗi lượt,
theo thiết kế).

### Stale / đã sửa nhưng chưa đóng (bản ghi cần cập nhật; audit không sửa)
- **F-043** ghi "fix-built-pending-approval, default OFF". Thực tế đã duyệt và bật: `229ca82` + `6eae9d0`,
  `product.ts:461-466` mặc định `live`.
- **F-051** fixed nhưng thiếu `fix_commit`; bản sửa thật là `7e06be1`.
- **F-001** fixed nhưng thiếu `fix_commit`; bản sửa nằm ở `da8808c`/`8a5354c`/`b9ade29`.
- **F-006/007/013/016/017/018/019/021/025/026**: là bản ghi PASS nhưng để status `open`, vì schema không có
  trạng thái "pass". F-013 (Zalo PASS) đã **sai** so với R-1. F-016 có thể stale vì code quota đổi sau đó.
- R-3 (fail-open quota chat) đã sửa ở `8efcdb5`, chưa được ghi thành finding.

### Mâu thuẫn giữa `findings.json` và tài liệu
- `RELEASE-REPORT.md` (09-20) stale toàn bộ:
  - F-001 ghi FAIL; F-029 ghi còn mở; F-010 ghi UNVERIFIED; F-031 ghi P3.
  - Ghi "Android/iOS music-reuse NOT removed"; ghi golden set "NOT RUN".
- `MANUAL-UAT-HANDOFF.md:191` và `PHASE7-AUDIT.md:54` ghi "iOS still ships music-reuse / must not be released".
  Code hiện gate bằng `ProductFlags.showMusic` (chưa compile).
- `PHASE7-AUDIT §8.4` vẫn coi licensing catalogue là blocker, dù đã bị quyết định `SHOW_MUSIC=false` thay thế.
- `MANUAL-UAT-HANDOFF:180` (`BLOB_READ_WRITE_TOKEN`) mâu thuẫn với `PHASE7-AUDIT R3` (GCS qua WIF).
- F-043: xem mục stale ở trên.

---

## 11. Health check

| Kiểm tra | Lệnh | Kết quả |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | ✅ exit 0, 0 lỗi |
| Lint | `npx next lint` | ✅ exit 0, **0 lỗi, 42 cảnh báo** (35 `@next/next/no-img-element`, 7 `react-hooks/exhaustive-deps`, trên 29 file, **không file STEP-3 nào**) |
| Web (vitest project `app`) | `npx vitest run` | ✅ 769 file · **13.584 pass · 0 fail** · 69 skip · 1 todo |
| DB (vitest project `db`, embedded Postgres) | cùng lần chạy | ✅ 32 file · **839 pass · 0 fail** |
| Tổng vitest | | 790 file pass, 11 file skip · 14.423 pass · 0 fail |
| Production build | `npm run build` | ✅ exit 0, 192/192 trang |
| Android build | `./gradlew :app:assembleDebug` (JDK 21 của Android Studio) | ✅ BUILD SUCCESSFUL, `app-debug.apk` 45 MB |
| Android unit | `./gradlew :app:testDebugUnitTest` | ✅ **770 test · 0 fail · 0 error** |
| iOS | — | ⛔ **chưa compile** (không có macOS) |

**11 file bị skip:** các harness đo đạc/xác minh gate bằng env (`ai/__measure__/*` ×7,
`tools/__verification__/ccpVerificationEvidence`, `scripts/audit/memReplay.audit`), cộng
`app/profile/profileCollectionsParity.test.ts` (11 test) và `app/profile/sharedPrivacy.test.ts` (3 test).
Lý do skip của 2 file profile chưa điều tra.

**iOS — phát hiện tĩnh (không compile nên chưa xác minh):**
- `StreamingClient.swift:51` còn một `case "8"` chết sau merge.
- Case `.annotation` mới không được xử lý trong `switch` ở `ChatViewModel.swift:385-423`, và switch này không có
  `default` → **rất có thể là lỗi compile**.
- `TappyPlan` iOS (`ChatModels.swift:98-113`) dùng `day/title/activities`, trong khi wire là `label/items` → các
  ngày trong plan decode ra rỗng. **Contract plan đã trôi trên iOS.**

**Đính chính một khẳng định trước đó của tôi:** trước đây tôi báo `architectureLock "still ai@4.3.x"` là
"lỗi môi trường có sẵn". Sai. Nguyên nhân là `node_modules` của `g1-place-guard` từng là **symlink treo** trỏ
vào worktree `v3-phase4-design`, worktree **do chính đợt hợp nhất của tôi xoá**. Hiện `node_modules` đã là thư
mục thật (ai đó đã cài lại) và test **pass**.

---

## 12. Tác động kiến trúc của redesign Consultative (KHÔNG triển khai)

### Ba điều cần biết trước
1. **`CONSULTATIVE_V1` đang OFF** trong cấu hình được UAT (`product.ts:436-439`, checklist §4a). Prompt V1,
   clarify gate, presearch, canned follow-up và guard prose V1 đều có trong code nhưng **không hoạt động** ở
   bản phát hành. Redesign phải nói rõ nhắm vào pipeline nào.
2. **Ý tưởng per-domain đã được đánh giá và bác bỏ một lần.**
   `docs/audit/cost-optimization-report-2026-09-18.md:43` (mục "Luật theo vertical"):
   - rule theo domain nằm trong prefix đã cache, tiết kiệm được ≤ ~4% mỗi lượt;
   - nhân số nhánh cache;
   - mất rule ở lượt đa domain (planner).
   `promptBuilder.ts:500-506` ghi lại rằng việc bỏ block theo lượt (2026-08-10) từng "forked a SECOND cache
   lineage".
3. **Không bug AI nào đang biết nằm ở prompt.** Cả ba bug Session D nằm ở code deterministic.

### 12A. File / module / block prompt
| Thành phần | Vị trí | Khi redesign |
|---|---|---|
| Điểm vào | `app/api/chat/route.ts` (2.417 dòng, **một** `result = AI.stream(` ở `:2018`) | giữ |
| Intent/khung | tính trong `route.ts:222-418`: `intent.ts`, `budget.ts`, `needProfile.ts:473` (**đã có `domain`**), `decisionFrame.ts:167`, `actionability.ts:85`, `refinement.ts:123` | giữ; thêm một quyết định "tập domain đang hoạt động" |
| Retrieval/cache | `search_places` `route.ts:1639` → `tools/food.ts:952` (cache 30 phút `:995`); `search_products` → `tools/shopping.ts`; `web_search`, `get_*` | giữ nguyên |
| Filter/scorer deterministic | `applyBudgetFilter`, `placeConstraintFilter.ts:96/161`, `rankForModel` `route.ts:1038-1220`, `trimPlacesForModel`, hard-constraint gate `route.ts:1519-1540` | giữ nguyên |
| Synthesizer | `consultativeBlock` `route.ts:1419-1458`, `v1Block` / `consultativeV1Prompt.ts:52` | đổi → module theo domain |
| Rulebook dùng chung | `promptBuilder.ts:579` SYSTEM_BASE; **rule domain 9–20 đang gửi mọi lượt** (`:207-258`) | phần text domain bị thay |
| Card / annotation | `buildPlacesLiveView` `liveView.ts:388` → `8:` `tappy.places.v1` (`streamEnrichment.ts:2318`) | giữ, nếu wire contract không đổi |
| `[TAPPY_PLAN]` | producer `buildPlanningBlock` `promptBuilder.ts:70-145`; parser web `structuredContent/parsePlan.ts:42`, Android `ChatResponse.kt:267`, iOS `ContentParser.swift:230` | giữ, nếu contract không đổi |
| Client | Web `ChatInterface.tsx:772/882`; Android `ChatStreamFrames.kt:47-79`, `PlaceCard.kt`; iOS `StreamingClient.swift`, `ContentParser.swift` | không đổi, nếu wire không đổi |

### 12B. Guard deterministic
- **Phải giữ nguyên:**
  - input trust boundary; rate limit; cổng 18+;
  - `quotaExempt` + metering R-3 (`route.ts:420/527/650/772`);
  - share follow-up guard; routing tool (movie bỏ `search_places`, offline bỏ `search_products`);
  - `forcedTool` không bao giờ đưa cho model (`architectureLock.test.ts:44`);
  - **đúng một `AI.stream`** (`architectureLock.test.ts:25-80`);
  - mọi ràng buộc retrieval;
  - `RISK_BACKSTOP` (`riskBackstop.ts:158`);
  - fencing (`fenceUntrusted`, `wrapToolResultAsData`);
  - money / spec / travel / ticket / hours / place-claim / grounding guard;
  - F-052 (`liveView.ts:293-294`).
- **Chỉ phải đổi nếu output contract đổi:** `planPriceGuard` (`streamEnrichment.ts:1608`); guard prose-shape của
  V1; chuỗi validate CTA; mọi **danh sách marker hard-code** (`streamEnrichment.ts:555/1872/2059/2091`,
  `sanitizePriorAssistantContent.ts:28-33`, `clarification.ts:19`); các parser.
- **Phải đổi dưới bất kỳ cách tách nào:** các test bất biến "shared byte-identical" (`promptBuilder.test.ts:42`,
  `architectureLock.test.ts:111`) nếu rule domain bị rút khỏi `shared`.

### 12C. Output contract + client mobile
Contract đi qua wire:
- frame text `0:` chứa marker: `[TAPPY_PLAN]`, `[TAPPY_SHOPPING]`, `[CTA_BUTTONS]`, `[FOLLOWUPS]`;
- annotation `8:`: `tappy.places.v1`, `tappy.progress.v1`;
- header `X-Decision-Evidence-Id`;
- header request `x-tappy-surface` (`decisionSurface.ts:25`: chỉ `web`, `android`).

**"Nếu chỉ cập nhật Web, Android/iOS có trôi không?" — CÓ**, theo bốn cơ chế:
1. **Marker mới trong text:** cả hai client native không có cơ chế lọc `[A-Z_]+` chung → marker lạ **hiện
   nguyên văn**. Server cũng phải cập nhật danh sách marker, nếu không marker sẽ bị gửi ngược cho model.
2. **Field mới trong annotation/marker:** bị bỏ qua lặng lẽ. Android dùng `ignoreUnknownKeys`; iOS dùng decoder
   viết tay dễ dãi. Riêng `ShoppingReason` của iOS decode chặt: chỉ một reason sai là mất cả mảng.
3. **`kind` annotation mới:** Android bỏ qua; iOS ánh xạ thành `.unknown`.
4. **Prompt phụ thuộc surface:** mọi thứ gate bằng `rendersDecisionCard` tới được web + Android nhưng **không bao
   giờ tới iOS**, vì iOS không gửi header surface.

Đổi prompt ở server mà giữ nguyên wire contract thì tới cả ba client cùng lúc (cùng gọi `/api/chat`).

Fixture chung đang ghim contract:
- `shared/structured-content/marker-fixtures.json` (21 case, cả 3 nền tảng);
- `shared/ccp/commerce-action-fixtures.json`;
- `shared/place-card/copy-fixtures.json` (không có phía iOS).

**Không fixture nào ghim `TappyPlan` phía iOS** — vì vậy độ trôi `label/items` không ai phát hiện.

### 12D. Token / chi phí / độ trễ / cache
Số đo (trích tài liệu đo có sẵn; không tự bịa con số USD):
- `prompt-shape.json` (commit 09-19): shared 44.713 ký tự. Khi test chạy lại hôm nay ra **48.173**, nên bản
  commit đang stale. Dynamic: places 3.794, shopping 11.724, chitchat 964.
- `cost-report.md:63-86`:
  - prefix cache khoảng 21,2–21,5k token (tool ≈ 2,4k + rulebook ≈ 18,8k);
  - có **4 biến thể prefix** vì tập tool đổi theo lượt;
  - dynamic 3,3–5k token gửi **mỗi step**;
  - tool result 8–10,5k token, sau khi trim còn 4,5–6k.
- Cache: BP1 nằm cuối `systemShared`; BP2 ở tin nhắn user cuối (`claude.ts:78-99`).
  - Tỉ lệ hit: 55% → 73% sau BP2; lượt ấm 80–90%.
  - Ở lưu lượng thấp, cold write chiếm 49% chi phí.
- Nhánh cache đã tồn tại sẵn: lượt movie; offline; `save_price_watch` chỉ cho user đăng nhập; và (suy luận từ
  code, **chưa đo**) mô tả tool `get_hotel_prices` có nhúng `budget.max` → mỗi lượt có budget làm rẽ nhánh BP1.

Hai cách tách:

| | Cách 1: block domain nằm TRONG `shared` (trước BP1) | Cách 2: block domain SAU BP1, thu gọn `shared` |
|---|---|---|
| Số nhánh cache | mỗi tổ hợp domain một nhánh, nhân thêm biến thể tool | giữ một nhánh; prefix ngắn hơn |
| Chi phí | mỗi nhánh trả write ×1,25 trên khoảng 20k token; hit giảm ở lưu lượng thấp | text domain trả giá chưa cache ở step 1, BP2 đọc lại ở step 2 với ×0,1 |
| Test bất biến | phá bất biến byte-identical | giữ được |
| Lượt đa domain (planner) | nhân tổ hợp | — |
| Lợi ích ròng | — | **nhỏ**, vì rule bị bỏ vốn đang được đọc với giá ×0,1 (≤ ~4%) |

Output token: bị chặn bởi `maxTokens` (`route.ts:2055`); chỉ đổi nếu dạng reply đổi. Độ trễ: TTFT bị chi phối
bởi presearch và vòng tool; prompt ngắn hơn chỉ rút prefill chút ít; thêm nhánh cache nghĩa là thêm lượt chậm
ở lưu lượng thấp.

---

## 13. Bề mặt bị vô hiệu

| Mức độ | Bộ test / tài liệu |
|---|---|
| **Chắc chắn vô hiệu** (khi text/cấu trúc prompt đổi) | `promptBuilder.test.ts` (12); `consultative/architectureLock.test.ts` (~29 khi chạy); `consultativeArchitecture.test.ts` (21); `promptCommerceRule.test.ts` (3); `recommendationContract.test.ts` (23); `planningContract.test.ts` (15); `app/api/chat/consultativeV1.route.test.ts` (20); một phần `responseLanguage` / `scamCheckerWording` / `fenceApplication`. Rộng hơn: **40 file / ~694 test** import `promptBuilder`. JSON đầu ra của `scripts/audit/promptShape.audit.test.ts` / `promptLayout.audit.test.ts` |
| **Phải chạy lại** | route test `app/api/chat/*` (12 file / 149); 43 file / ~614 test đọc source `route.ts`; `consultative/*.test.ts` (53 file / 1.132); stream/guard test; 21 file / 481 test chạm `[TAPPY_PLAN]`; **golden set** `docs/uat/ai-golden-set.jsonl` (13 case / 58 check, gọi model thật, kết quả trước 25 → 53/58) phải lập baseline mới |
| **Không ảnh hưởng nếu wire contract giữ nguyên** (vô hiệu nếu contract đổi) | Android (~222 test chat/share/planner); iOS (~87, không chạy được ở đây); fixture chung; test card web (`PlaceDecision.test.tsx` 25, `liveView.test.ts` 16, …). Không có snapshot test |
| **Tài liệu sẽ stale** | `MANUAL-UAT-HANDOFF.md` (`:85`, `:94`, `:196`); `DEPLOY-CHECKLIST.md:269-330`; `docs/uat/evidence/golden/*`; release notes (`docs/release-notes/v3-guards-g1-g2.md`, …); tài liệu chi phí/cache (`cost-report.md`, `cost-optimization-report-2026-09-18.md`, `short-job-report-2026-09-19.md`); `consultative-v1-design.md`; `RUNBOOK.md` |

---

## 14. Ước lượng số phiên cho redesign

Giả định cách 2 (block domain sau BP1) và **wire contract giữ nguyên**:
- **Phiên 1:** router domain từ `needProfile.domain` / `decisionFrame.domains`; rút rule 9–20 khỏi `shared`; viết
  lại các test bất biến; chạy lại khoảng 700 test prompt.
- **Phiên 2:** nội dung block cho 5 vertical + ghép cho lượt đa domain (planner); refactor `consultativeBlock`.
- **Phiên 3:** lập baseline mới cho golden set (model thật) + đo lại chi phí/cache (`prompt-shape`, tỉ lệ hit).
- **Phiên 4:** một vòng UAT thủ công đầy đủ + cập nhật DEPLOY-CHECKLIST / handoff / evidence.
- **Nếu wire contract đổi:** +1–2 phiên (parser web + Android + iOS + fixture chung; iOS không compile được ở
  đây).

→ **4 phiên + 1 vòng UAT**, hoặc 5–6 phiên nếu contract đổi.

**"Một phiên làm được gì mà không tạo thêm vòng UAT?"** Chỉ: tài liệu thiết kế + khung dựng sẵn sau một cờ
**mặc định OFF**, giữ `shared` byte-identical. Hành vi production không đổi, các test bất biến vẫn giữ. Mọi thứ
vượt quá mức đó đều làm thay đổi câu trả lời, và vì vậy cần UAT.

---

## 15. Khuyến nghị trình tự launch

| | Hạng mục |
|---|---|
| **BẮT BUỘC trước launch** | áp migration production đúng thứ tự, **sau khi đã đối chiếu lại checklist** với 16 migration thực tế; đặt env bắt buộc (`SERPER_DAILY_CREDIT_CEILING` + `KV_REST_API_URL`); giữ Zalo OFF nếu chưa sẵn sàng; UAT thủ công đúng SHA RC cuối; deploy RC; smoke test production |
| **CÓ THỂ sau launch** | redesign Consultative; 3 bug Session D (nếu owner chấp nhận); F-002 (nâng Next), F-005 (dependency); iOS (không nằm trong release); dọn bản ghi `findings.json` |
| **RỦI RO CAO nếu làm trước launch** | redesign prompt (vô hiệu golden set/UAT, bất biến prompt, nguy cơ rẽ nhánh cache); bật `CONSULTATIVE_V1` (đường chưa được đo); đổi wire contract (client native trôi); nâng Next.js lên major |
| **RỦI RO THẤP nếu làm trước launch** | đối chiếu lại tài liệu (checklist, tên `FeatureFlags`, dòng §4a); sửa (b) "98-99%" (regex cục bộ trong `budget.ts`); quyết định (a) số card (một hằng số/fold, sau khi owner chốt). (c) quận/GPS chạm logic đặt tâm search → rủi ro trung bình |

---

## 16. Đường ngắn nhất tới launch công khai

Chỉ liệt kê việc **thực sự chặn** phát hành công khai.

**1 — Làm trước (phiên 1, không đổi code sản phẩm):**
- **Đối chiếu DEPLOY-CHECKLIST với 16 migration thực tế.** 4 migration chưa có trong thứ tự áp: 2 migration
  09-22 và 2 migration G1.
  - *Vì sao chặn:* code ship đọc/ghi các bảng không có trên production → plan share 500 (checklist #1 tự nói
    vậy), G1 share-out lỗi.
- **Áp 2 migration G1 lên audit** và xác nhận uat.tappyai.com trỏ vào DB nào.
  - *Vì sao chặn:* không thì UAT của bản RC không chạy được luồng G1.
- Không cần vòng UAT riêng cho bước này.

**2 — Tiếp theo (phiên 2): một vòng UAT thủ công trên uat.tappyai.com, đúng SHA RC cuối.**
- *Vì sao chặn:* bản RC là kết quả merge ba dòng (`3cbb10e` / `070e6ad` / `c7604c9`) và **chưa từng được UAT
  thủ công như một bản hoàn chỉnh**.
- Nếu owner muốn sửa 3 bug Session D trước launch thì làm **trước** vòng UAT này, để một vòng phủ cả hai (+1
  phiên).

**3 — Cổng phát hành cuối (phiên 3):**
- Áp migration production theo thứ tự đã đối chiếu, **kèm** lockdown #6.
- Đặt env production (trần Serper + KV; GA4 cho F-001).
- Promote `rc/web-uat` → `main` → deploy, rồi smoke test production (song ngữ, đăng nhập, chat place/shopping,
  plan share, 18+).
- Giữ toggle Zalo OFF nếu Zalo không nằm trong phạm vi.
- *Vì sao chặn:* production hiện là `842379b` (09-11), vẫn còn lỗ Zalo R-1 và UI Music/reuse. Deploy RC vừa là
  điều kiện launch vừa đóng các lỗ đó.
- Không cần thêm vòng UAT nếu phiên 2 đạt.

### A. Đường phát hành ngắn nhất
Đối chiếu checklist + migration audit → **1 vòng UAT RC** → áp migration + env production → deploy RC + smoke test.

### B. Redesign Consultative
**Tuỳ chọn, sau launch.** Launch mà không có nó thì mất gì (chỉ những gì có bằng chứng):
- **Giới hạn sản phẩm:** golden set đạt 53/58 (5 check trượt). Checklist ghi các đường chỉ dựa vào prompt
  "regress ~1 run in 4" (liên quan F-043).
- **Nợ kỹ thuật:** rulebook dùng chung khoảng 48k ký tự, chứa rule của mọi domain và gửi mọi lượt; nhiều danh
  sách marker hard-code; contract `TappyPlan` đã trôi trên iOS.
- **Chi phí/hiệu năng:** tác động nhỏ. Rule domain nằm trong prefix đã cache (đọc với ×0,1); lần đánh giá trước
  ước ≤ ~4% mỗi lượt và đã bác bỏ cách tách này.
- **UX:** không có hạn chế UX nào đang biết mà redesign sửa được. Ba bug UX đang biết đều ở code deterministic,
  **redesign không chạm tới**.

### C. Tổng số phiên thực tế tới launch
- **Tối thiểu 3 phiên** (đối chiếu/chuẩn bị · UAT · phát hành), với **1 vòng UAT thủ công**, giả định vòng UAT
  đạt.
- Nếu owner yêu cầu sửa 3 bug Session D trước launch: **4 phiên**, vẫn 1 vòng UAT nếu sửa trước vòng đó.
- Không tính cải tiến tuỳ chọn sau launch.

---

## 17. Điều còn chưa chắc chắn

1. **DB production không kiểm được** (cấm truy cập). Migration nào đã có trên prod chỉ dựa vào checklist, mà
   checklist mâu thuẫn với nhánh (§9.4).
2. **uat.tappyai.com dùng project Supabase nào?** Không đọc được env Vercel từ đây. Nếu là audit thì các bảng
   G1 đang thiếu.
3. **iOS:** không compile. Lỗi compile rất có thể, và độ trôi `TappyPlan`, chỉ là phát hiện tĩnh.
4. **Catalogue Music production** có hàng Jamendo hay không: chưa rõ. API GET vẫn phục vụ catalogue.
5. **Số card:** "3 trên màn hình đầu / 8 trong bộ" (code) hay "3 tổng cộng" (owner nhớ): cần owner quyết.
6. **`33b7690`** (docs Zalo, actor khác) đã được tác giả push trong lúc audit. `ccee15b` (STEP-3) vẫn local,
   chờ owner quyết có push không.
7. **Golden set** không chạy lại trong audit này (cần gọi model thật qua mạng).
8. **14 test bị skip** trong `app/profile/*`: chưa điều tra lý do.
9. Tripwire mạng chặn và ghi log ở tầng module Node (`net` / `dns` / `fetch`), không phải packet capture ở cấp
   OS. Đủ để chứng minh process Node không cố kết nối; không chứng minh gì về process ngoài Node (không có
   process nào như vậy trong chuỗi `next dev`).

---

## Kiểm tra an toàn cuối
- Không để lại credential production trong env local mới. **Nhưng** 4 file credential production có sẵn từ trước
  vẫn nằm trong `tappyai-mvp` (§5.1), không đổi.
- Không có lời gọi DB/API production nào. Probe DB chỉ nhắm **audit** (script từ chối mọi ref khác; session
  `READ ONLY`).
- Không sửa sản phẩm, migration, code Music, hay `findings.json`. Không triển khai redesign. Không commit việc
  UAT Home/Profile/Settings.
- Commit duy nhất: `ccee15b` (STEP-3, 5 file), chỉ ở local (origin/rc/web-uat = `33b7690`, do actor khác push).
  Tôi không push, không deploy.
- Worktree canonical: sạch, trừ file báo cáo này (untracked).
- File báo cáo: `docs/uat/PRE-REDESIGN-AUDIT.md` (worktree `g1-place-guard`).

---

## Phụ lục A — Toàn bộ 96 migration trên `rc/web-uat` (94 cũng có trên `uat/phase7-regressions`)

Cột "Đã áp trên audit": chỉ 16 migration mới được probe (chỉ đọc). 80 migration còn lại là baseline code
production và không được kiểm lại trên DB.

| # | File | Mục đích (dòng mô tả đầu file) | Có trên uat/phase7-regressions | Trong baseline code production (origin/main 842379b) | Đã áp trên audit | Rollback | Thứ tự triển khai |
|---|---|---|---|---|---|---|---|
| 1 | `20260620_place_photos.sql` | Place photos cache table | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 2 | `20260621_notification_subscriptions.sql` | Push notification subscriptions table | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 3 | `20260627_user_memory.sql` | user_preferences — extend existing table with typed preference columns | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 4 | `20260703_add_reviews_update_policy.sql` | Fix: reviews table has RLS enabled but no UPDATE policy, and owners cannot | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 5 | `20260703_fix_comment_count_trigger.sql` | Fix reviews.comment_count trigger drift for ordinary authenticated users. | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 6 | `20260703_fix_like_count_trigger.sql` | Fix reviews.like_count trigger drift for ordinary authenticated users. | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 7 | `20260703_fix_save_count_trigger.sql` | Fix reviews.save_count trigger drift for ordinary authenticated users. | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 8 | `20260704_add_music_module.sql` | Music Module V1 — standalone schema. | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 9 | `20260704_add_reviews_music_column.sql` | Additive: lets a Review attach a Music Module selection. Reviews owns this | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 10 | `20260704_backfill_review_counters.sql` | Backfill denormalized review counters to match their junction tables. | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 11 | `20260704_tighten_music_constraints.sql` | Tighten Music Module V1 schema constraints. | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 12 | `20260705_seed_music_demo_catalog.sql` | Music Library — demo catalog seed (REPLACEABLE DATA) | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 13 | `20260706_add_music_saved_and_type.sql` | Phase A (final) — saved/followed tracks, music_type, and a play counter, | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 14 | `20260706b_add_music_count_fns.sql` | Public count functions for the sound page's "N người đã lưu" / follower total. | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 15 | `20260706c_repoint_music_audio_local.sql` | #39 fix: the seeded demo catalog pointed audio_url at soundhelix.com, which | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 16 | `20260711_anon_chat_usage.sql` | Anonymous chat quota — server-side daily counter keyed by anonymous_id | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 17 | `20260711_music_ugc_combined.sql` | Combined Music UGC migration — run once in Supabase SQL Editor | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 18 | `20260712_prod_baseline_and_review_saves_indexes.sql` | 20260712_prod_baseline_and_review_saves_indexes.sql | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 19 | `20260713_analytics_envelope_foundation.sql` | Step 1.0 — Shared Analytics Foundation | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 20 | `20260713_auth_daily_rollup.sql` | Phase 1 · Step 3 — auth_daily_rollup + rollup functions | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 21 | `20260713_backoffice_phase0.sql` | TappyAI Back Office — Phase 0 Foundation (SCHEMA ONLY) | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 22 | `20260713_user_acquisition_dimension.sql` | Phase 1 · Step 2 — user_acquisition dimension + backfill | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 23 | `20260714_activation_daily_rollup.sql` | Phase 2 · Step 4 — activation_daily_rollup + rollup function | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 24 | `20260714_activation_dimension.sql` | Phase 2 · Step 3 — Activation dimension extension | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 25 | `20260714_device_context.sql` | Analytics infrastructure — cross-platform device_context | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 26 | `20260720_comment_replies_reactions.sql` | Comment replies + multi-reaction system. | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 27 | `20260722_notification_realtime.sql` | Bug #21: emit realtime INSERT events for the four tables the unread notification | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 28 | `20260724_partner_deals.sql` | Bug #14 V1 — Partner Deals (admin-managed content, replaces hardcoded DEAL_POOL) | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 29 | `20260724_partner_deals_hardening.sql` | Bug #14 V1 hardening — extend partner_deals (backward-compatible, NO data loss). | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 30 | `20260724_partner_deals_metadata.sql` | Bug #14 V1 polish — reserve a metadata JSONB on partner_deals for future | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 31 | `20260725_notifications_unification.sql` | ADR-014 Notification Unification — Phase 0. | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 32 | `20260731_partner_deal_translations.sql` | Deals i18n V1 — localized partner-deal content (shared by Web, Android, iOS). | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 33 | `20260803_platform_owner.sql` | Controller V2 — Phase 1, Component 1: PLATFORM OWNER | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 34 | `20260807_audit_chain.sql` | Controller V2 — Component 7: tamper-evident audit chain | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 35 | `20260807_platform_hardening_phase0.sql` | Platform Hardening Phase 0 — close the accidental anon reach on | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 36 | `20260807_platform_owner_revoke_public_execute.sql` | Platform Owner RPCs — REVOKE EXECUTE from PUBLIC, anon and authenticated | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 37 | `20260807b_sync_last_login_revoke_public_execute.sql` | fn_sync_last_login — REVOKE EXECUTE from PUBLIC, anon and authenticated | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 38 | `20260808_anon_chat_usage_acl_hardening.sql` | anon_chat_usage_increment — bring the ACL and search_path to platform standard | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 39 | `20260808b_anon_claim_conversations.sql` | fn_claim_anonymous_conversations — backend-owned anon → account carry-over | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 40 | `20260808c_handle_new_user_skip_anonymous.sql` | handle_new_user — do not create a profiles row for ANONYMOUS auth users | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 41 | `20260813_c8_event_outbox.sql` | Controller V2 — Component 8: Event Bus (transactional outbox) | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 42 | `20260814_c11_session_security.sql` | Controller V2 — Component 11: Session Security | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 43 | `20260817_content_safety_gate.sql` | Content Safety Gate — minimum lifecycle state. | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 44 | `20260818_publication_boundary_rls.sql` | PUBLICATION BOUNDARY — Phase 0 (F-2 containment) | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 45 | `20260818b_music_tracks_publication_boundary.sql` | MUSIC_TRACKS PUBLICATION BOUNDARY — Phase 0, part 2 (M1) | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 46 | `20260819_m08_account_status.sql` | Controller V2 — Phase 2 / Module 08 User Management | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 47 | `20260820_b8_owner_recovery.sql` | Controller V2 — K-6 / B8: BREAK-GLASS OWNER RECOVERY | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 48 | `20260820_m01_daily_snapshots.sql` | Controller V2 - Module 01 Home Dashboard: daily_snapshots + its rollup | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 49 | `20260820_m04_cohort_metrics.sql` | Controller V2 - Module 04 User Analytics, RETENTION: cohort_metrics | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 50 | `20260821_anon_chat_usage_read.sql` | anon_chat_usage_today() — the READ-ONLY sibling of anon_chat_usage_increment() | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 51 | `20260821_m08_user_notes.sql` | Module 08 — internal admin notes: user_notes | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 52 | `20260821_m09_moderation_queue.sql` | Module 09 Content Moderation - moderation_queue, moderation_actions | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 53 | `20260822_k2_platform_settings.sql` | K-2 — the Configuration Provider's runtime tier: platform_settings | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 54 | `20260824_decision_evidence_state.sql` | decision_evidence — the minimal server-side store for shopping decision facts | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 55 | `20260830_push_credential_ownership.sql` | PUSH CREDENTIAL OWNERSHIP — one device, one account | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 56 | `20260901_marketing_governance_foundation.sql` | V2.2-2 Marketing Phase 2 -- GOVERNANCE FOUNDATION | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 57 | `20260905_chat_messaging_phase1.sql` | Social messaging, Phase 1 — chat_threads, chat_participants, | có | **KHÔNG** | ✅ | không | **KHÔNG có trong thứ tự của checklist** |
| 58 | `20260906_phase6_messenger_reachability.sql` | Phase 6 — Messenger reachability + block foundation (ADDITIVE) | có | **KHÔNG** | ✅ | không | **KHÔNG có trong thứ tự của checklist** |
| 59 | `20260908_user_demographics_foundation.sql` | V3 User Data Foundation — public.user_demographics | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 60 | `20260911_user_memory_discovery_city.sql` | user_memory.discovery_city — the destination / discovery interest. | có | có | không kiểm lại (baseline) | có | đã là baseline |
| 61 | `20260913_g1_growth_foundation.sql` | TappyAI G1 Growth — foundation: shared results + anonymous identity stitching | **không (chỉ rc)** | **KHÔNG** | ❌ CHƯA | có | **KHÔNG có trong thứ tự của checklist** |
| 62 | `20260913_plan_shares.sql` | Plan shares — the PUBLISHED snapshot behind a /plan/<shareId> brochure. | có | **KHÔNG** | ✅ | có | DEPLOY-CHECKLIST #1 |
| 63 | `20260915_profile_public_presentation.sql` | Profile public presentation: profiles.bio and profiles.cover_url | có | **KHÔNG** | ✅ | có | **KHÔNG có trong thứ tự của checklist** |
| 64 | `20260915_review_shares.sql` | 20260915_review_shares.sql | có | **KHÔNG** | ✅ | có | **KHÔNG có trong thứ tự của checklist** |
| 65 | `20260918_g1b_share_ancestry.sql` | TappyAI G1-B — share ancestry + anonymous second-generation sharing | **không (chỉ rc)** | **KHÔNG** | ❌ CHƯA | có | **KHÔNG có trong thứ tự của checklist** |
| 66 | `20260920100000_commerce_providers.sql` | A3.1 (2026-09-20) — THE RUNTIME COMMERCE PROVIDER REGISTRY. | có | **KHÔNG** | ✅ | không | DEPLOY-CHECKLIST #2 |
| 67 | `20260920110000_commerce_feed_items.sql` | B5 (2026-09-20) — ACCESSTRADE FEED ITEMS, ingested for the APPROVED merchants. | có | **KHÔNG** | ✅ | không | DEPLOY-CHECKLIST #3 |
| 68 | `20260920_f028_dob_self_correct_while_ineligible.sql` | F-028 — a mistyped date of birth must be self-recoverable. | có | **KHÔNG** | ✅ | có | DEPLOY-CHECKLIST #4 |
| 69 | `20260921_f032_admin_role_actor_from_authuid.sql` | F-032 — admin-role RPCs: derive the actor from auth.uid(), never from a | có | **KHÔNG** | ✅ | có | DEPLOY-CHECKLIST #5 |
| 70 | `20260921_music_tracks_lockdown.sql` | Music reuse cleanup — close the direct-PostgREST surface on music_tracks. | có | **KHÔNG** | ✅ (0 policy, anon SELECT=false) | có | DEPLOY-CHECKLIST #6 |
| 71 | `20260921_user_events_ga4_event_types.sql` | Analytics taxonomy: allow the new GA4-mirrored funnel event types on user_events. | có | **KHÔNG** | ✅ | có | DEPLOY-CHECKLIST #7 |
| 72 | `20260921_user_events_shopping_search_event.sql` | Analytics taxonomy: allow the 'shopping_search_click' event type on user_events. | có | **KHÔNG** | ✅ | có | DEPLOY-CHECKLIST #8 |
| 73 | `20260922_groups_avatar_url.sql` | Phase 7 (item 4): a GROUP avatar — the group's own picture, not the creator's. | có | **KHÔNG** | ✅ | có | **KHÔNG có trong thứ tự của checklist** |
| 74 | `20260922_music_soundhelix_attribution.sql` | Phase 7 (music licensing audit, 2026-09-22): record the provenance of the 14 SoundHelix | có | **KHÔNG** | cột có; dữ liệu chưa xác minh | không | **KHÔNG có trong thứ tự của checklist** |
| 75 | `add_billing_customers_isolation.sql` | Security Issue #1 (Critical): isolate stripe_customer_id from public profiles | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 76 | `add_counter_security_definer.sql` | Counter integrity hardening — SECURITY DEFINER for denormalized counters | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 77 | `add_event_type_check.sql` | Security hardening: constrain user_events.event_type to the known taxonomy. | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 78 | `add_explore_upgrade.sql` | Phase 1: Explore/Reviews upgrade | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 79 | `add_gatea_db_hardening.sql` | Gate A DB hardening — residual verified findings (idempotent; re-runnable) | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 80 | `add_group_members_auth.sql` | Security Issue (High): group_members INSERT is fully anonymous | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 81 | `add_groups.sql` | (không có dòng mô tả) | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 82 | `add_memory_columns.sql` | Phase 5: Extend user_memory with richer preference signals | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 83 | `add_message_feedback.sql` | message_feedback — per-message 👍/👎/report for chat replies (MessageActionBar) | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 84 | `add_music_attribution.sql` | Music attribution — for curated CC-BY tracks (Tier 1, e.g. Jamendo). | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 85 | `add_original_sound_ugc.sql` | Original Sound (UGC music) — user uploads + rights consent + notice-and-takedown | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 86 | `add_phase4.sql` | Phase 4: view_count + milestone notifications | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 87 | `add_phase4_hardening.sql` | Phase 4 Hardening — idempotent, safe to re-run | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 88 | `add_preferences.sql` | Add freeform preferences array to user_preferences table. | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 89 | `add_price_watches.sql` | Price Watch: user sets a target price for a product, Tappy notifies when hit | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 90 | `add_profile_edit.sql` | Add bio and updated_at columns to profiles for profile edit feature | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 91 | `add_profiles_email_isolation.sql` | Security Issue (Critical): profiles.email publicly readable via anon key | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 92 | `add_review_social.sql` | Phase 6: Social review features | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 93 | `add_social_week2.sql` | Phase 6 Week 2: Follow system + Comments | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 94 | `add_tracking_integrations.sql` | Phase 7: In-app behavior tracking + third-party integrations | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 95 | `add_user_language_preference.sql` | Add UI language preference to profiles (Localization_Architecture.md §3). | có | có | không kiểm lại (baseline) | — | đã là baseline |
| 96 | `add_user_preference_profile.sql` | Phase 1 User Memory Engine | có | có | không kiểm lại (baseline) | — | đã là baseline |
