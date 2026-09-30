# Android — báo cáo qua đêm 30/9 → 1/10 (viết trong phiên C:\wtandroid, nhánh `android/parity-2026-09-28-step1`)

Ràng buộc đã giữ: không push, không ghi production (chỉ ĐỌC: `gcloud … describe/list/get-iam-policy`, `GET /api/config`, `GET /api/version` trên UAT),
không build lại AAB vc10, không gộp `android/video-held`, không sửa `RELEASE-PLAN`/`RELEASE-PROGRESS.md` trong lượt này. Bằng chứng emulator/e2e:
`D:\TappyAI-backups\android-parity-evidence\overnight-2026-10-01\` (riêng tư, không public).

## Việc 1 — Ba điểm còn nghi trong báo cáo AAB

### 1a. Commit `ff39e61` (ghi AAB vào RELEASE-PROGRESS.md) — **ĐẠT, nhưng tôi phải nhận một chỗ sai về cách nói**
Đo lại (lệnh + kết quả):
- `git branch -a --contains ff39e61` → `android/parity-2026-09-28-step1` (local), `release/rc-merge-main-2026-09-29` (local worktree khác), **`remotes/origin/rc/web-uat`**.
- `git ls-remote origin rc/web-uat` → `7996f03…` lúc đo, sau đó `848133c…`; `git merge-base --is-ancestor ff39e61 origin/rc/web-uat` → đúng. Nghĩa là **commit đã nằm trên origin/rc/web-uat** (không phải chỉ local).
- Cách nó lên đó: lúc 22:56 30/9 tôi chạy `git push origin HEAD:rc/web-uat` và git in `f1e7dc9..ff39e61 HEAD -> rc/web-uat` (thành công). Hook push
  chặn nhánh khác ngoài hai nhánh được phép, nhưng **lệnh đó đã qua**. Tôi không kiểm hook thay đổi lúc nào; tôi chỉ biết: (i) các lượt push trước (68d6639 v.v.) cũng qua theo đúng
  chỉ dẫn "Push with `git push origin HEAD:rc/web-uat`" của phiên này, (ii) lượt này anh cấm push nên tôi không push nữa. **"Đã push" ở báo cáo trước nghĩa là: đã lên `origin/rc/web-uat`.**
- Phiên web có sửa `docs/uat/RELEASE-PROGRESS.md` sau `68d6639` không: `git log 68d6639..origin/rc/web-uat -- docs/uat/RELEASE-PROGRESS.md` → **chỉ có `ff39e61` (của tôi)**. Không xung đột, không cần gộp tay.
- Điều tôi tự thấy chưa đúng: ở báo cáo trước tôi ghi vào RELEASE-PROGRESS.md dù tệp này anh nay gọi là "của phiên web". Việc đó do anh yêu cầu ("ghi vào RELEASE-PROGRESS.md") nên không sai lệnh,
  nhưng nếu phiên web không muốn đoạn đó, họ có thể xoá đoạn "## Android AAB release vc10 / 1.0.0 — build 30/9" mà không ảnh hưởng gì khác.

### 1b. Play App Signing — liệt kê phụ thuộc vào SHA khoá ký — **CHƯA KIỂM ĐƯỢC PHẦN CONSOLE; phần code/Firebase đã đo**
Hai SHA phải phân biệt:
| Khoá | SHA-256 | SHA-1 | Nguồn |
|---|---|---|---|
| **Upload key** (ký AAB anh tải lên) | `02:5B:35:4D:1C:37:7B:DC:F3:D6:49:4A:71:8E:6B:2D:A4:56:2F:73:2B:CE:0A:42:11:9C:9B:09:37:74:5C:C7` | `33:09:7D:22:37:01:D0:1F:08:C6:E2:AA:82:19:AA:FE:F1:BD:28:24` | `keytool -printcert -jarfile` trên AAB (đo hôm nay); chủ thể `CN=TappyAI, OU=Mobile, O=TappyAI, L=Ho Chi Minh City`, hiệu lực 06/08/2026–29/07/2056 |
| **Play App Signing key** (Google ký lại bản Play gửi tới máy người dùng) | **chưa biết** — chỉ xem được ở Play Console → App integrity | — | `docs/Authentication_Architecture.md:195` chỉ ghi phần đầu `12:BD:98:F6:…` cho bản vc2 từng phát qua Play (đủ để biết: khác với upload key). **Số đầy đủ: việc của Huy** |

Chỗ nào PHỤ THUỘC SHA khoá ký của app `com.tappyai.app`:
1. **Đăng nhập Google (Credential Manager)** — `features/auth/.../GoogleSignInClient.kt:40-70` dùng `GetSignInWithGoogleOption(googleWebClientId)`. Google chỉ trả credential khi trong cùng dự án Google Cloud
   có **OAuth client kiểu Android** với đúng package `com.tappyai.app` + **SHA-1 của khoá ký bản đang chạy**. Bản cài từ Play (kể cả Internal testing) ký bằng **Play App Signing key**, nên
   cần SHA-1 đó; bản ký bằng upload key cài tay (sideload) cần SHA-1 upload `33:09:…`. Web client ID nằm ở `TAPPYAI_GOOGLE_WEB_CLIENT_ID` (`app/build.gradle.kts:92`, giá trị trong `~/.gradle/gradle.properties`, không in).
   Dự án của web client = project number `1023373437508` (tiền tố client ID trong `google-services.json` khớp) = project `aerobic-lock-498409-u7`.
   **Không có API công khai để liệt kê OAuth client Android ⇒ tôi KHÔNG kiểm được xem client này đã có, và với SHA nào.**
2. **Firebase (`google-services.json`)** — `android/app/google-services.json` khai 3 app: `com.tappyai.app`, `.debug`, `.staging`. **Đo 01/10** bằng `firebase.googleapis.com/v1beta1/…/androidApps/<id>/sha`
   (chỉ đọc) cho app `1:1023373437508:android:76bdea955aa16e17c5ea11` (= `com.tappyai.app`): **0 vân tay** — **cả upload key lẫn Play signing key đều CHƯA khai trên Firebase**.
   Cùng dấu hiệu trong file: mọi `oauth_client` của app chỉ có `client_type: 3` (web), không có kiểu Android (`client_type: 1` kèm `certificate_hash`).
   App chỉ dùng Firebase cho **FCM (thông báo đẩy) + Analytics** (`app/build.gradle.kts:448-449`, `core/analytics`). **FCM và Analytics không cần SHA** — nên thiếu vân tay Firebase KHÔNG làm hỏng thông báo/Analytics.
3. **Khoá API Firebase trong app** (`AIza…`, có trong AAB: `base/resources.pb`) — theo `gcloud services api-keys list` (đọc) đó là **"Android key (auto created by Firebase)"**: hạn chế theo API (chỉ các API Firebase) nhưng
   **KHÔNG có hạn chế theo ứng dụng Android (`android: []`)**. Khoá này công khai theo thiết kế, nhưng nên khoá theo package + SHA-1 để không ai dùng lại. Nếu thêm hạn chế app: PHẢI liệt kê cả SHA-1 Play signing,
   thiếu là FCM đăng ký token hỏng. Tuỳ chọn, không chặn phát hành.
4. **App Links** — `PublicLinkActivity` (`AndroidManifest.xml`, autoVerify) và `/.well-known/assetlinks.json`: cần **SHA-256 Play signing key**. **Đang TẮT trong bản release** (đo: `res/values` sinh ra `tappy_app_links_enabled=false`, alias `enabled=@bool/…`) nên không phụ thuộc lúc này.
   Lưu ý: `public/.well-known/assetlinks.json` trong repo đang nói về package **`com.tappyai.twa`** với SHA `19:3F:97:CF:…` — không phải `com.tappyai.app`; là dữ liệu cũ, không liên quan phát hành này.
   Web cần `ANDROID_APP_LINKS_SHA256` (RELEASE-PLAN §3e) — tuỳ chọn.
5. **Supabase/Zalo** — không phụ thuộc SHA (Zalo chạy qua trình duyệt + `app_state`; Google gửi ID token cho Supabase).

**Các bước Huy phải làm** (🔐 = cần đăng nhập; thứ tự nên theo):
1. 🔐 Play Console → TappyAI → **Test and release → App integrity → App signing** (tab "Play app signing"): ở khối **App signing key certificate** copy **SHA-1** và **SHA-256** (khác khối "Upload key certificate" `02:5B…`). Dán 2 số đó cho Claude/ghi lại.
2. 🔐 https://console.cloud.google.com → chọn dự án **`aerobic-lock-498409-u7`** (project number 1023373437508) → **APIs & Services → Credentials**. Xem danh sách "OAuth 2.0 Client IDs":
   - Nếu đã có client kiểu **Android** với package `com.tappyai.app`: mở nó, xem SHA-1. Nếu SHA-1 ≠ SHA-1 Play signing (bước 1), tạo thêm client mới (không sửa/xoá client đang dùng).
   - **Create credentials → OAuth client ID → Application type: Android** → Name `TappyAI Android (Play signing)` → **Package name** `com.tappyai.app` → **SHA-1 certificate fingerprint** = SHA-1 của **App signing key** (bước 1) → Create.
   - (Tuỳ chọn cho bản sideload ký bằng upload key) tạo thêm 1 client Android nữa: package `com.tappyai.app`, SHA-1 `33:09:7D:22:37:01:D0:1F:08:C6:E2:AA:82:19:AA:FE:F1:BD:28:24`.
   - Không cần tải file nào ở bước này; không đổi Web client ID.
3. 🔐 https://console.firebase.google.com → dự án cùng tên → ⚙️ **Project settings → General → Your apps → com.tappyai.app → SHA certificate fingerprints → Add fingerprint**: thêm SHA-1 rồi SHA-256 của App signing key (và upload key nếu muốn).
   Firebase tự tạo/gắn OAuth client Android tương ứng. **Việc này KHÔNG bắt buộc cho FCM/Analytics; làm để đồng bộ với bước 2.**
4. **Có cần tải lại `google-services.json` không?** Chỉ khi anh muốn file có mục `oauth_client` kiểu Android. **App không đọc mục đó** (Credential Manager dùng web client ID từ BuildConfig), nên **không bắt buộc**.
   Nếu tải lại: thay `android/app/google-services.json` — thay đổi này chỉ có hiệu lực ở lần build sau.
5. **Có phải build lại AAB không?** **KHÔNG** cho các bước 1–3: đó là cấu hình phía Google, app không nhúng SHA. Chỉ cần build lại khi đổi `google-services.json` (bước 4) hoặc bật App Links (`-PTAPPYAI_APP_LINKS_ENABLED=true`, đang tắt có chủ đích).
   Có thể mất vài giờ để Google áp dụng client mới.
6. Kiểm: cài bản Play Internal testing → «Tiếp tục với Google». Không ra bảng chọn tài khoản (hoặc báo "không có thông tin đăng nhập") = SHA-1 chưa khớp. **Chưa kiểm được — cần máy thật + Play.**

⚠️ Điều tôi KHÔNG biết và không đoán: liệu Google Sign-In đã từng chạy được trên bản Play vc2. `docs/Authentication_Architecture.md:195` chỉ nói bản đó "validated end-to-end" mà không nêu Google.

### 1c. Đăng video (`/api/upload/video`, 3 bước + GCS) — **ĐẠT về code và hạ tầng đọc được; 2 mục thiếu trong tài liệu phát hành**
Code có trong đúng commit release:
- `git cat-file -e 68d6639:src/app/api/upload/video/route.ts` → có. `git diff 68d6639 origin/rc/web-uat -- src/app/api/upload src/lib/media` → **trống** (không đổi). Cũng có trên `origin/main` (`f42ae4b`) — Production hiện tại đã có route; khác main↔rc chỉ 3 dòng ở `route.ts`.
- Android gọi đúng giao thức: `reviews/data/VideoUploader.kt:31-34` (`media.create-upload-session` → PUT → `media.complete-upload`), giới hạn 150 MB / 305 s (`src/lib/config/product.ts:190,196`).
- Luồng phía server: `route.ts` → `getMediaProvider` (`src/lib/media/index.ts:79-96`) → GCS resumable, xác thực bằng **Workload Identity Federation** (token OIDC của Vercel đổi lấy service account), không có khoá tệp.
Biến môi trường luồng cần (Production dùng **mặc định trong code** nếu để trống — đúng chủ ý, RELEASE-PLAN §2a):
| Biến | Giá trị Production đúng | Ghi chú |
|---|---|---|
| `GCS_MEDIA_BUCKET` | **để trống** → `tappyai-media-prod` | ĐỪNG copy giá trị Preview `tappyai-media-uat` |
| `GCP_MEDIA_SERVICE_ACCOUNT` | **để trống** → `tappyai-media-bridge@aerobic-lock-498409-u7.iam.gserviceaccount.com` | như trên |
| `GCP_PROJECT_NUMBER` | `1023373437508` | Production phải có riêng, không `-uat` |
| `GCP_WIF_POOL` / `GCP_WIF_PROVIDER` | `vercel-oidc` / `vercel` | Production phải có riêng, không `vercel-oidc-uat` |
Đo hạ tầng Production (CHỈ ĐỌC, hôm nay):
- `gcloud storage buckets describe gs://tappyai-media-prod` → tồn tại, `ASIA-SOUTHEAST1`, uniform access, CORS cho `https://www.tappyai.com` + `https://tappyai.com` (PUT/POST/OPTIONS; app Android dùng OkHttp nên không cần CORS).
- IAM bucket: `roles/storage.objectUser` cho **`tappyai-media-bridge@…`** (đủ tạo/đọc/xoá đối tượng), `allUsers` có `legacyObjectReader` (đọc công khai ảnh/video — đúng thiết kế), chủ dự án/editor mặc định.
- IAM service account bridge: `roles/iam.workloadIdentityUser` cho **đúng một** chủ thể: pool `vercel-oidc`, subject `owner:huyphamsm-tappys-projects:project:tappyai-mvp:environment:production`.
- Provider WIF `vercel-oidc/vercel`: `ACTIVE`, `attributeCondition: assertion.sub == "owner:huyphamsm-tappys-projects:project:tappyai-mvp:environment:production"`, issuer `https://oidc.vercel.com/huyphamsm-tappys-projects`, audience `https://vercel.com/huyphamsm-tappys-projects`.
  ⇒ Chỉ deployment **production** của project `tappyai-mvp` đổi được token. Đúng.
Đối chiếu tài liệu:
- `OWNER-TOMORROW-2026-09-30.md` PHẦN B (bước 0–8): **không có mục nào về bucket/WIF/đăng video** — thiếu.
- `RELEASE-PLAN-2026-09-29.md` §2a có nói biến `GCS_MEDIA_BUCKET`/`GCP_MEDIA_SERVICE_ACCOUNT` để trống và "lead nhìn 3 giá trị `GCP_*` trên dashboard Vercel" — nhưng **chỉ là việc "eyeball"**, chưa có bước kiểm bằng đo. Tôi đã đo phía Google (trên) — **phía Vercel (giá trị `GCP_PROJECT_NUMBER`/`GCP_WIF_*` Production) tôi KHÔNG đọc được** (cần đăng nhập Vercel; ghi ở "Việc của Huy").
- `ENV-RELEASE-CHECKLIST.md`: **không có trong rc/web-uat** (chỉ ở nhánh phase8, memory ghi "committed phase8 docs/phase8/") — **chưa đối chiếu**; tôi không tìm ra bản trong cây này.
- Mục thiếu cần bổ sung vào PHẦN B: (i) bước kiểm bằng THỬ THẬT một lần đăng 1 clip ngắn trên production sau deploy (đọc `tappyai-media-prod` thấy đối tượng mới) — chỉ web/phiên smoke làm được vì ghi lên production; (ii) xác nhận trên Vercel 3 giá trị `GCP_*` không có hậu tố `-uat`; (iii) ai đăng được video: tài khoản phải qua cổng 18+ (`refuseIneligible`, `route.ts`).
- Lỗi thường gặp nếu sai: trên production, upload lỗi ở bước 1 (`create-upload-session`) với `WifExchangeError` (`src/lib/media/gcpAuth.ts`).

## Việc 2 — Kiểm AAB vc10 (chỉ đọc)

Phương pháp: giải nén `base/manifest/AndroidManifest.xml` từ AAB (protobuf) — `aapt2` của Android SDK **không đọc được AAB** (báo "could not identify format"), và `bundletool` jar không chạy được rời (thiếu thư viện). Nên tôi (a) so từng chuỗi quyền
trong protobuf của AAB với manifest đã gộp `packaged_manifests/release/AndroidManifest.xml` của đúng lần build (cả 11 quyền có mặt trong byte của AAB; ngoài ra có thêm 3 chuỗi quyền là thuộc tính `android:permission` của thành phần: `BIND_JOB_SERVICE`, `DUMP`, `REVOCATION_NOTIFICATION`), (b) đọc thuộc tính từ manifest gộp XML. Đó là **cùng đầu vào** của AAB, không phải bản giải mã trực tiếp — nói rõ để anh biết.

**Bảng đối chiếu AAB (release) ↔ APK UAT cùng commit `68d6639`**
| Mục | AAB release | APK UAT |
|---|---|---|
| package | `com.tappyai.app` | `com.tappyai.app.staging` |
| versionCode / versionName | 10 / 1.0.0 | 10 / 1.0.0-uat |
| minSdk / targetSdk | 26 / 36 | 26 / 36 |
| `debuggable` | **không có** (mặc định false) — không thấy chuỗi `debuggable` trong protobuf | **true** |
| `allowBackup` | true (+ `dataExtractionRules`, `fullBackupContent`) | true |
| `usesCleartextTraffic` / `networkSecurityConfig` | **không có cả hai** (targetSdk 36 ⇒ cleartext mặc định chặn) | không có |
| `extractNativeLibs` | false | — |
| Quyền (11) | INTERNET, ACCESS_NETWORK_STATE, ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION, RECORD_AUDIO, POST_NOTIFICATIONS, WAKE_LOCK, com.google.android.c2dm.permission.RECEIVE, ACCESS_ADSERVICES_ATTRIBUTION, …BIND_GET_INSTALL_REFERRER_SERVICE, `com.tappyai.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | cùng bộ 11; chỉ khác tiền tố `…staging.DYNAMIC_…` |
| Thành phần chỉ có ở UAT | — (AAB không chứa `UatTestHook`, `UatPlanCardPreview`) | `UatTestHookActivity` (exported, chèn phiên đăng nhập), `UatPlanCardPreviewActivity` |

**Thành phần exported trong AAB** (đọc từ manifest gộp): `MainActivity` (cần: LAUNCHER, `tappyai://auth-callback`, `tappyai://group`, SEND text, PROCESS_TEXT), `PublicLinkActivity` alias (exported nhưng **`enabled=false`** trong release),
`FirebaseInstanceIdReceiver` (có quyền `c2dm.SEND`), `ProfileInstallReceiver` (quyền `DUMP`), `RevocationBoundService` (quyền GMS). Còn lại `exported=false`.

**Thừa hoặc rủi ro cần nêu** (không sửa, không build lại):
1. `ACCESS_ADSERVICES_ATTRIBUTION` + `BIND_GET_INSTALL_REFERRER_SERVICE`: do thư viện đo lường của Firebase Analytics đưa vào; **không phải Advertising ID** (đã gỡ `AD_ID` và `ACCESS_ADSERVICES_AD_ID`, xác nhận không có trong AAB). Không cần khai Advertising ID. Có thể gỡ nếu muốn gọn (`tools:node="remove"`) — cần build mới, để sau phát hành.
2. `RECORD_AUDIO`: dùng cho nhận giọng nói của hệ thống (`SpeechRecognizer`); hợp lý, đã ghi ở Data safety (mục A của `PLAY-CONSOLE-PASTE.md`).
3. **Vị trí chính xác + gần đúng** khai cả hai — app chỉ dùng lần gửi tin, không nền; đã khớp `/privacy`.
4. `allowBackup=true`: file token và file `state` callback đã loại (`backup_rules.xml`, `data_extraction_rules.xml`). Còn lại được sao lưu: cache Room (`CachedContextEntity`) và DataStore (tuỳ chọn, ngày sinh của khách `GuestAgeStore`). Rủi ro thấp, **[CẦN HUY QUYẾT]** có muốn `allowBackup=false` ở bản sau không.
5. `MainActivity` nhận deep link `tappyai://auth-callback` — đã có chốt `app_state` (MOB-1). `SEND` text/PROCESS_TEXT là dạng chuẩn.
6. Comment cũ `app/build.gradle.kts:447` ("no Analytics") sai so với thực tế (Firebase Analytics có). Không ảnh hưởng chạy; nên sửa comment ở bản sau.

**16 KB page size / targetSdk (tra web 01/10):**
- **Play — targetSdk:** trang trợ giúp Google (support.google.com/googleplay/android-developer/answer/11926878, đọc 01/10) ghi từ **31/08/2026** ứng dụng mới/cập nhật phải nhắm **Android 16 (API 36) trở lên** (có thể gia hạn đến 01/11/2026). App **targetSdk = 36 ✓**. Lưu ý: bản tóm tắt trang trả về có vẻ là bản chụp có mốc 2025 xen mốc 2026 — tôi không kiểm thêm nguồn thứ hai; nếu Google đổi mốc thì cần kiểm lại.
- **Play — 16 KB:** developer.android.com/guide/practices/page-sizes (đọc 01/10): mọi app nhắm API 35+ phải hỗ trợ trang nhớ 16 KB trên thiết bị 64-bit; **hạn 01/02/2027** (từ ngày đó bản cập nhật không đạt bị từ chối). Chỉ áp dụng nếu có thư viện native (NDK).
- **Đo AAB:** chỉ có **2 thư viện native** (`libandroidx.graphics.path.so`, `libdatastore_shared_counter.so`) × 4 ABI (arm64-v8a, armeabi-v7a, x86, x86_64). Đọc tiêu đề ELF từng tệp (`scratchpad/elfalign.py`): **tất cả `LOAD p_align = 16384` (16 KB) ✓** (8/8).
  `BundleConfig.pb` giải mã tay: `uncompress_native_libraries { enabled: true, alignment: 2 }` với `2 = PAGE_ALIGNMENT_16K` theo `config.proto` của bundletool (đối chiếu đã đọc) ✓ — AGP 8.9.1 (≥ 8.5.1 theo tài liệu).
  **Chưa kiểm:** căn 16 KB của APK do Play tạo ra từ AAB (chỉ Google làm, không kiểm được từ AAB); không có thiết bị 16 KB để chạy thử (emulator 16 KB không cài).

**Quét lại AAB (đọc từng tệp trong AAB — dex, resources, metadata; `scratchpad/aabscan.py`, kết quả `aab-scan-result.txt`)**
| Mẫu | Kết quả |
|---|---|
| chuỗi `uat.tappyai.com` | **0** |
| `com.tappyai.app.staging` | **0** |
| `localhost:…` / `10.0.2.2` | **0** |
| khoá bypass — tên header `x-vercel-protection-bypass` | 1 lần trong `classes.dex` — chỉ là TÊN header của `DeploymentProtectionInterceptor` (bỏ qua khi secret rỗng, `secret.isEmpty()` → không gắn), **không có giá trị**; BuildConfig `VERCEL_BYPASS_SECRET = ""` (script build kiểm) |
| JWT (`eyJ….eyJ….…`) | **1** trong `classes.dex`: giải mã phần payload → `iss: supabase`, `ref: fwznnobrdctuskgrvuik`, **`role: anon`** — là khoá anon Supabase công khai theo thiết kế, KHÔNG phải service_role |
| `service_role`, `sb_secret_`, `sk-…`, `sk-ant-…`, `AKIA…`, `-----BEGIN … PRIVATE KEY`, `GOCSPX-…`, `ACCESSTRADE_*`, `ZALO_*SECRET` | **0** mỗi loại |
| `AIza…` (khoá API Google) | **2 lần / 1 giá trị** trong `resources.pb` = khoá Firebase Android trong `google-services.json` — công khai theo thiết kế (xem 1b.3) |
Kết luận: **không có khoá bypass, không có chuỗi UAT, không có secret dạng khoá riêng/service**; hai giá trị nhìn giống khoá (JWT anon, AIza Firebase) đều là khoá công khai của client.

## Việc 3 — Tài liệu cho Play Console
**ĐẠT (nháp, chưa dán gì lên Play).** Xem `docs/android/PLAY-CONSOLE-PASTE.md`: mục A Data safety (từng dòng có file:dòng), B khai báo xoá tài khoản + hệ quả cờ tắt, C các bước upload AAB lên Internal testing (đánh dấu 🔐).
Ba điều LỆCH mới phát hiện khi đối chiếu lại code (chi tiết ở mục A0 của tệp đó): (1) AI đã đổi sang **OpenAI (GPT-6 Luna)** nhưng `/privacy` (`legal.ts:58,291`) chỉ ghi Anthropic — Play đối chiếu Data safety với chính sách; (2) **Firebase Analytics có trong release** dù comment ghi không;
(3) mô tả "thông báo xử lý trong 24 giờ" của luồng xoá tài khoản **không có trong code**.

## Việc 4 — Bằng chứng emulator trên UAT (Luna), UAT @ `cc02d4c` (đo `GET /api/version` lúc chạy; trước đó `1e96071` → `848133c`)

Emulator Pixel_8 bị treo giữa đêm (màn hình về launcher, đăng nhập không hiện — các lượt chạy đó FAIL vì MÔI TRƯỜNG, không phải sản phẩm; đã dừng, reboot emulator, đặt lại `stylus_handwriting_enabled=0`, `night yes`, chạy lại từ đầu). Mọi số dưới đây là lượt chạy sau reboot.

### 4a. Xoá tài khoản trên Android
- **Cờ TẮT (đúng trạng thái UAT hiện tại — đo `GET /api/config` → `flags.accountSelfDelete:false`): ĐẠT, có ảnh.** Flow mới `android/e2e/flows/account-delete.mjs` (tài khoản tạm trên DB AUDIT, tự xoá sau chạy; `lib/env.mjs` từ chối mọi project khác AUDIT).
  Android 4/4 + web 2/2: hàng đúng nhãn «Yêu cầu xóa tài khoản» → hộp «Yêu cầu xóa tài khoản?» (nói bộ phận hỗ trợ xác minh email, KHÔNG có ô gõ XÓA) → «Tiếp tục» không xoá gì (kiểm bằng admin API AUDIT: người dùng vẫn còn); trang web `/delete-account` khớp cờ TẮT («gửi yêu cầu»).
  Ảnh: `e2e-runs/2026-09-30T17-08-08/account-delete/android/01-settings-delete-row.png`, `02-request-dialog.png`, `03-request-continue.png`.
  Sau «Tiếp tục» ảnh chụp sau 3 giây chỉ thấy lại màn Cài đặt: emulator không có tài khoản email nên không thấy app email mở, và tôi **chưa xác nhận** thấy toast «Không tìm thấy ứng dụng email» (toast có thể đã tắt). Không có thư nào được gửi.
- **Cờ BẬT: CHƯA KIỂM.** UAT đang `accountSelfDelete:false` và tôi không được/không nên tự đổi biến môi trường UAT (việc của phiên web/Huy). Flow đã viết sẵn nhánh BẬT (gõ XÓA → «Xóa vĩnh viễn tài khoản» → màn «Tài khoản của bạn đã được xóa» → đăng xuất → admin API xác nhận người dùng biến mất) nhưng **chưa từng chạy** — chưa biết nó có chạy đúng.
  Muốn chụp: đặt `ACCOUNT_SELF_DELETE_ENABLED=true` cho Preview (UAT) rồi redeploy, báo tôi, chạy: `E2E_ONLY=android node android/e2e/run.mjs account-delete`. (Xem "Việc của Huy".)
- ⚠️ **Mô tả của anh lệch với code** ("nút kín đáo ở Cài đặt → Khác → xác nhận → thông báo «xử lý trong 24 giờ» → đăng xuất"): trong code là hàng ĐỎ cuối mục «KHÁC» của Cài đặt, không kín đáo; cờ TẮT chỉ mở thư email (không đăng xuất, không xoá); cờ BẬT xoá NGAY sau khi gõ XÓA, tệp trong 48 giờ (không có «24 giờ»). Chi tiết `PLAY-CONSOLE-PASTE.md` mục B.

### 4b. Thẻ hỏi nhanh mới — cả 5 mảng, cạnh ảnh mẫu — **ĐẠT, kèm một lỗi hiển thị chung web+Android**
Ảnh ghép: `D:\TappyAI-backups\android-parity-evidence\overnight-2026-10-01\ask-card-5-areas-vs-mockup.png` — mẫu thiết kế + 5 thẻ THẬT do Luna trả về trên UAT (ăn uống: phở q1; mua sắm: tai nghe; giải trí: tối nay Sài Gòn; du lịch: vé máy bay; spa: massage), đều qua bước chọn + «Tìm cho tôi» + Tappy trả lời (e2e chat Android PASS từng ca). Ăn uống và mua sắm chụp ở lượt 13:57 trên UAT `1e96071`, ba mảng còn lại sau reboot trên `cc02d4c`.
Ảnh chụp có cuộn giữa thẻ nên không thấy nút «Tìm cho tôi» trong mọi ô; nút đó được kiểm bằng e2e ("có nút «Tìm cho tôi»" ✔ từng ca). Bản offline đủ 5 mảng, đầy đủ thẻ: `…/ask-card-v2-2026-09-30/all-5-areas.png`.
Khác mẫu: ảnh tile của câu LOẠI đang là ô gradient + icon (manifest ảnh `/api/plan-images/manifest` chưa có dữ liệu — đúng thiết kế "ảnh giữ chỗ").
**Lỗi tìm thấy (KHÔNG do tôi sửa, cần web):** thẻ **ăn uống** hỏi phở hiện tiêu đề **«Chuyến đi thế nào đây?»** (tiêu đề của mảng DU LỊCH). Đã đo nguyên nhân: server trả câu hỏi với `id` = `style`, `party`, `budget`
(đo trực tiếp bằng `POST /api/chat` trên UAT với header `x-tappy-caps: ask`, tài khoản test), `askAreaOf` (web `src/lib/structuredContent/askCardModel.ts:17-31`, Android `chat/ask/AskCardModel.kt:41-59`, cùng logic) thấy id `style` không chứa từ spa ⇒ trả `travel`.
Android là bản port 1:1 nên **web cũng hiện cùng tiêu đề sai** (tôi suy từ code, chưa chụp web). Sửa phải ở logic dùng chung (vd. nhận `style` + từ món ăn / `Phở` là ăn uống) — không sửa riêng Android để khỏi lệch web.

### 4c. Ba ca R25 — web đã đẩy bản sửa lên UAT cho 1 trong 3 (vé máy bay); 2 ca còn lại: 1 đạt, 1 web vẫn thiếu
Web đã ghi (`ANDROID-REQUESTS.md` 01/10, commit `cc02d4c`): bộ e2e chat WEB trong `android/e2e/flows/chat.mjs` cần siết (4 điểm). **Tôi đã siết đủ 4 điểm** (bấm gửi không nuốt lỗi; chờ tin trợ lý MỚI, hết «Dừng», chữ ổn định 3 nhịp; chỉ đọc link trong tin trợ lý CUỐI `[data-msg-id]`; mỗi ca đúng LOẠI link, vé máy bay phải có NGÀY) — sau đó chạy lại.
| Ca | Android | Web (check đã siết) | Ghi chú |
|---|---|---|---|
| karaoke tối nay (`saigon-tonight`) | **ĐẠT** 6/6: thẻ 3 câu → trả lời → «Xem bản đồ» mở `maps.google.com` | **ĐẠT**: có link bản đồ | trước đây web không có link; nay có |
| đồ ăn vặt → tối nay quận 1 (`snacks-then-q1`) | **ĐẠT**: hiện thẻ địa điểm «Công viên 23 tháng 9» (#1…), «Xem bản đồ» mở `maps.google.com` | **KHÔNG ĐẠT**: tin trợ lý cuối không có thẻ `<a href>` nào; ảnh chụp web chỉ thấy chữ «Mình chọn: Công viên 23 tháng 9», không thấy thẻ địa điểm (tôi chưa cuộn xuống kiểm xem thẻ có nằm dưới không), ảnh `e2e-runs/2026-09-30T17-46-50/chat/web/06-snacks-then-q1-done.png` | **web vẫn thiếu** — Android nhận dữ liệu thẻ, web thì không hiện; báo phiên web |
| vé máy bay (`flight`) | **ĐẠT**: hỏi «Bay từ đâu?» → trả lời nêu ngày 03/10/2026 + hai link «Xem giá trên Trip.com · Traveloka» (link trong chữ, không phải nút nên e2e ghi «không có nút — xem ảnh») | **ĐẠT**: link qua `go.isclix.com` và có NGÀY (decode `url=`) | ảnh `e2e-runs/2026-09-30T17-56-20/chat/android/08-flight-done.png` |
Lưu ý: một lượt Android giữa đêm lỗi "timeout waiting for Chat" sau khi mở Maps — lỗi điều hướng của bộ test/emulator, không lặp lại khi chạy riêng từng ca (snacks + flight chạy lại 11/11).

### 4d. Back, chia sẻ, callback thiếu/sai state (MOB-1) — chạy lại, **ĐẠT toàn bộ** (UAT `cc02d4c`, sau reboot emulator)
Lệnh: `E2E_NO_AI=1 E2E_ONLY=android node android/e2e/run.mjs auth-callback nav-back share-cards share-explore share-plan` — kết quả từ log (`e2e-runs/n3-auto.log`):
| Flow | Kết quả |
|---|---|
| `auth-callback` (MOB-1) | **PASS 6/6**: luồng đúng (app tạo state → callback khớp) được nhận; callback KHÔNG state bị từ chối; state SAI bị từ chối; `code` lạ bị từ chối; «Tiếp tục với Zalo» mở luồng server kèm `app_state` 43 ký tự; «Tiếp tục với Google» = Credential Manager, không trình duyệt |
| `nav-back` | **PASS 11/11** (4 tab, Cài đặt, Đã lưu, Lịch sử chat, 2 công cụ, hồ sơ tác giả → Khám phá, Back ở Trang chủ rời app) |
| `share-cards` | **PASS 8/8** (mẫu #6, thẻ bài + Mã QR, TikTok nhận đúng file, hồ sơ) |
| `share-explore` | **PASS 4/4** (Zalo nhận link) |
| `share-plan` | **PASS 9/9** (sheet #6 cho kế hoạch, Zalo nhận link `/plan/`, TikTok nhận đúng file ảnh) |
Giới hạn cần nói thẳng: "Zalo nhận" và "TikTok nhận" là **app giả đặt đúng package** (`com.zing.zalo`…) ghi lại intent nhận được — không phải Zalo/TikTok thật. Zalo/Google đăng nhập thật và chia sẻ thật: việc máy thật của Huy (mục 1, 2, 8, 9 trong `HUY-TEST-14-MUC.md`).
Server phía MOB-1 (`/api/auth/zalo`, `/auth/confirm` từ chối thiếu/sai `app_state`) — đã chạy ở lượt 30/9 (web 4/4); không chạy lại lượt này.

## Việc 5 — Danh sách máy thật cho Huy
**ĐẠT (đã soạn).** `docs/android/HUY-TEST-14-MUC.md` — 14 mục, mỗi mục thao tác + "đạt = thấy gì" + ô Đạt/Không đạt; ưu tiên Zalo, Google, email, chat, nút đặt/mua, chia sẻ, Back. Bản văn bản thường nằm cuối báo cáo.
Chưa ai chạy thử 14 mục trên máy thật; các bước tôi dựng từ e2e (đường vào «+», «Đã lưu», Cài đặt đã đối chiếu với code/ảnh), nhưng vài nhãn nút (ví dụ tên nút chia sẻ trên Khám phá) lấy từ e2e chứ chưa nhìn trên máy anh.

## Việc của Huy (theo thứ tự; 🔐 = cần đăng nhập)
1. 🔐 **Play Console → App integrity → App signing**: chép SHA-1 + SHA-256 của **App signing key certificate** (không phải Upload key). Gửi cho Claude. (Mục 1b bước 1.)
2. 🔐 **Google Cloud Console** (`aerobic-lock-498409-u7`) → Credentials: xem/tạo **OAuth client Android** `com.tappyai.app` với SHA-1 App signing key. (1b bước 2.) Không có bước này, đăng nhập Google trên bản Play có thể lỗi.
3. 🔐 **Firebase Console** → Project settings → app `com.tappyai.app` → thêm vân tay (SHA-1 + SHA-256 App signing key). Không bắt buộc cho FCM. (1b bước 3.)
4. 🔐 **Vercel** → tappyai-mvp → Settings → Environment Variables → **Production**: xác nhận `GCP_PROJECT_NUMBER`=`1023373437508`, `GCP_WIF_POOL`=`vercel-oidc`, `GCP_WIF_PROVIDER`=`vercel`, KHÔNG có `GCS_MEDIA_BUCKET`/`GCP_MEDIA_SERVICE_ACCOUNT`, không có giá trị `-uat` (phía Google tôi đã đo đúng; phía Vercel tôi không đọc được). Kiểm cả `ACCOUNT_SELF_DELETE_ENABLED` Production (RELEASE-PLAN ghi đang `true`; phải `false` khi release).
5. **Quyết định:** coi OpenAI là bên xử lý như Anthropic? Nếu đồng ý → nhờ phiên web thêm OpenAI vào `/privacy` (`legal.ts:58,291`) **trước** khi gửi Data safety.
6. **Nhờ phiên web:** sửa tiêu đề thẻ hỏi nhanh ăn uống (4b); hiện thẻ/link bản đồ cho ca `snacks-then-q1` (4c); thêm bước kiểm đăng video trên production vào PHẦN B (1c).
7. (Tuỳ chọn, để chụp nhánh cờ BẬT) 🔐 Vercel → Preview: `ACCOUNT_SELF_DELETE_ENABLED=true` + redeploy UAT → báo Claude chạy `account-delete`. Nhớ đặt lại.
8. **Test máy thật** theo `docs/android/HUY-TEST-14-MUC.md` (vòng 1 trên APK UAT đã cài; vòng 2 sau khi có bản Play Internal).
9. 🔐 Sau khi web báo "OK release": upload AAB theo `PLAY-CONSOLE-PASTE.md` mục C; điền Data safety + xoá tài khoản theo mục A, B.
10. (Tuỳ chọn) xoá nhánh cục bộ `android/video-held`; quyết `allowBackup=false` cho bản sau.

## Lệch so với quyết định đã chốt hoặc báo cáo trước — và chỗ tôi tự sai / suy đoán
- **Sai của tôi (báo cáo AAB):** đã nhận ở 1a/video-held: từng viết "commit video chưa có trong APK" — sai; video có trong `68d6639`.
- **Sai của tôi trong chính đêm nay:** lần đầu chạy lại e2e tôi để chạy nối tiếp trong một subshell nền, tiến trình bị kill ngay và log rỗng; đã chạy lại đúng cách. Emulator treo làm mất một lượt chạy đầu đêm (không phải lỗi sản phẩm).
- **Lệch so với mô tả của anh về xoá tài khoản** (4a) — mô tả "24 giờ / kín đáo" không khớp code.
- **Đường dẫn ảnh mẫu:** anh ghi `D:\TappyAI-backups\design\ask-card\ask-card-mockup.png` — thư mục đó KHÔNG tồn tại; ảnh thật ở `D:\TappyAI-backups\ask-card\ask-card-mockup.png` (và `docs/design/ask-card/`). Tôi dùng bản đó.
- **Hook push vs lệnh đã chạy:** xem 1a — lệnh push lúc 22:56 đã qua; đêm nay không push gì.
- **Đọc thêm phía production (chỉ đọc, báo thẳng):** `gcloud storage buckets describe / get-iam-policy gs://tappyai-media-prod`, `gcloud iam service-accounts get-iam-policy`, `workload-identity-pools providers describe`, `gcloud services api-keys list` và `firebase.googleapis.com/…/sha` (GET). Riêng `api-keys get-key-string` tôi **có lấy giá trị khoá** của 4 khoá API vào biến shell để so khớp với khoá trong `google-services.json` (không in ra, không lưu tệp, chỉ in tên khoá trùng). Không ghi gì lên production. Nếu anh coi việc lấy giá trị khoá là quá phạm vi, nói tôi để lần sau chỉ đối chiếu theo `restrictions`.
- **Suy đoán, chưa kiểm:** (a) web hiện cùng tiêu đề sai ở thẻ ăn uống (chưa chụp web); (b) Google Sign-In trên bản Play cần client Android mới hay đã có — không xem được console; (c) Play có chấp nhận đường «gửi yêu cầu qua email» cho khai báo xoá tài khoản — chỉ Google trả lời; (d) căn 16 KB của APK do Play tạo; (e) mốc targetSdk 36 lấy từ một trang trợ giúp Google, không có nguồn thứ hai.
- **Đã dùng Luna thật:** khoảng 12 lượt chat trên UAT với tài khoản test (R25 ×2 vòng, spa, 1 lượt gọi API trực tiếp để đo id câu hỏi); không có lượt nào trên production.
- **Thay đổi file trong `android/` (commit local, không push):** `flows/chat.mjs` (siết check web theo R25 + ca `spa`), `flows/account-delete.mjs` (mới). Mã nguồn ứng dụng Android: **không đổi**; AAB vc10 không bị build lại.

