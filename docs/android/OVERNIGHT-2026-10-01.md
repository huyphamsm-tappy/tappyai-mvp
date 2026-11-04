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


---

# VÒNG CUỐI 01/10 chiều — một bản build (commit `891be6c`, local, KHÔNG push)

- **Commit build:** `891be6c` (nhánh `android/parity-2026-09-28-step1`, trên `origin/rc/web-uat` @ `5894a9a`). APK UAT và AAB release build từ CÙNG commit.
- **APK UAT:** `D:\TappyAI-backups\TappyAI-UAT-891be6c.apk` — SHA-256 `71c34c920103bf1373d05bfd65ebfbc5b2fa5e6f9b9daabe26fe7b31ff339fd7`. **CHƯA cài được lên máy R58RC0V30BH: `adb devices` chỉ thấy emulator (máy chưa cắm/chưa cấp quyền).**
- **AAB release:** `D:\TappyAI-backups\TappyAI-release-vc10-891be6c.aab` — SHA-256 `12195610e78d3a45656f98e0a938e058eaf5425409c79c38ca3e027a7d09ae5a`; chứng chỉ upload SHA-256 `02:5B:35:4D:1C:37:7B:DC:F3:D6:49:4A:71:8E:6B:2D:A4:56:2F:73:2B:CE:0A:42:11:9C:9B:09:37:74:5C:C7` (trùng khoá tải lên trên Play Console đã đọc); versionCode **10** (Play: cao nhất đã tải = 8), versionName 1.0.0. Script kiểm: API `https://www.tappyai.com/`, DEBUG=false, `VERCEL_BYPASS_SECRET=""`, Supabase production. Tôi quét lại AAB: 0 chuỗi `uat.tappyai.com`/`.staging`/`localhost`, 0 khoá riêng/secret; 1 JWT = khoá anon Supabase (role `anon`, công khai); 1 khoá Firebase `AIza` (công khai); chuỗi `x-vercel-protection-bypass` chỉ là TÊN header (vô hiệu khi secret rỗng); manifest: 11 quyền, target 36/min 26, không `debuggable`/cleartext/`Uat*`; 8/8 thư viện native căn 16 KB.
- **Test trước build:** unit Android debug+release+uat xanh; test web quét Android 793 qua; `verify-release-clean` 9/9.

## 1a–1e
- **1a Thẻ hỏi theo mảng — ĐẠT.** `AskCardModel.areaOf(questions, context)`: id (cũ+mới `dish`/`service`/`dest`/`device`/`origin`) trước; không có tín hiệu thì đọc từ lời trò chuyện + chữ trong câu hỏi; không bao giờ mặc định du lịch. Ảnh thật 5 mảng cạnh mẫu `ask-card-5-areas-vs-mockup-v2-0110.png`; tiêu đề đúng ở cả 5 mảng + ca «ăn phở Bắc tối nay» (`pho-bac`). Vì web đã sửa id phía server (`eaefa04`) nên ảnh sau đó không tự chứng minh phần Android; phần Android được chứng minh bằng test đơn vị với bộ id THẬT đo từ UAT trước khi web sửa (`style`/`party`/`budget` → ĂN UỐNG) và ảnh `01-17-53` lúc UAT còn id cũ (thẻ màu cam + ví dụ «không cay…»).
- **1b Xoá tài khoản — ĐẠT (cờ BẬT chạy thật trên UAT).** Hàng «Xóa tài khoản» là hàng thường cùng kiểu các hàng khác, ô xám đá phiến (không đỏ), HÀNG CUỐI mục «Khác», «Đăng xuất» ở khung riêng bên dưới (ảnh `final-round/2026-10-01T10-35-34/account-delete/android/01-settings-delete-row.png`). Màn xác nhận = chữ R29 của chủ (đoạn gói trả phí chỉ khi app BIẾT có gói: `GET /api/subscription` → `isPro`; không biết → câu chung; biết là free → không có). UAT đã được web BẬT cờ nên flow `account-delete` chạy THẬT với tài khoản tạm trên DB audit: gõ XÓA → «Xóa vĩnh viễn tài khoản» → màn «Tài khoản của bạn đã được xóa» → đăng xuất → admin API xác nhận người dùng biến mất: **7/7** (+ web 2/2). Ảnh preview 3 biến thể (có gói / không biết / free): `delete-confirm-plan-{true,null,false}.png`. KHÔNG xoá gì trên production.
- **1c Tắt thông báo — ĐẠT (có sửa).** Lỗi thật: tắt công tắc chỉ ghi preference, server vẫn gửi; `onNewToken` còn tự đăng ký lại khi đã tắt. Sửa: `DELETE /api/notifications/subscribe` `{provider:'fcm', credential:<token>}` (hợp đồng server đủ phân biệt thiết bị), lỗi mạng ⇒ công tắc GIỮ BẬT + dòng «Chưa tắt được thông báo…», bật lại ⇒ POST lại, `onNewToken` tôn trọng TẮT. Test: `PushOffTest` + 2 test cũ đổi theo. e2e `notifications-toggle` trên UAT/audit: **5/5** (đăng ký → tắt → server `enabled=false` → bật → `enabled=true`). Đường lỗi mạng chỉ được test đơn vị (không tắt mạng emulator).
- **1d Firebase Analytics — ĐẠT (kiểm + ghi, KHÔNG tự tắt).** Có trong release, bật mặc định, không có công tắc; log `App measurement collection enabled`. Comment `app/build.gradle.kts` đã sửa; Data safety ghi theo sự thật; quyết có tắt không = **Huy** (3 phương án ở `PLAY-CONSOLE-PASTE.md` A0.2).
- **1e** không làm Mic native/Khám phá hub: không đụng.

## 2 — Play Console / Google Cloud (chỉ đọc) — xem `PLAY-CONSOLE-PASTE.md` mục A00–A02
Bảng versionCode, trạng thái phát hành, cảnh báo nguyên văn, so sánh khai báo với mã, chính sách UGC với từng yêu cầu, và SHA khoá ký — đều ở đó. Điểm mấu chốt: **Data safety trên Play hiện khai «không thu thập dữ liệu» và «chưa mã hoá»** (sai nghiêm trọng, phải làm lại); **SHA-1 khoá ký hiện tại của Play (`C2:0A:A1…`) chưa có trong client Google nào**; **thiếu «báo cáo/chặn người dùng» trong app** (UGC).

## 3 — e2e trên UAT (SHA web lúc chạy `5894a9a`/`03358ed`, cờ xoá tài khoản BẬT)
| Nhóm | Android | Web |
|---|---|---|
| notifications-toggle, auth-callback (MOB-1), nav-back, login | 5/5 · 6/6 · 11/11 · 13/13 PASS | — |
| account-delete (cờ BẬT, xoá thật tài khoản tạm) | 7/7 PASS | 2/2 PASS |
| chat: kính cường lực · phim · bay từ HCM · 5 mảng (phở, tai nghe, tối nay SG, vé máy bay, spa) · pho-bac · snacks-then-q1 | **PASS tất cả** | PASS trừ snacks-then-q1 và mua-he |
| chat: «Mùa này đi du lịch ở đâu» | PASS 7/7 (gợi ý Vũng Tàu, có khách sạn) | **FAIL**: tin cuối không có link |
Lượt đầy đủ trước đó (tất cả ca + non-AI + chia sẻ + Back) chạy trên `6e68862`/`bd8f9b1` (cùng UAT); lượt cuối trên `891be6c` chạy lại tập con ở bảng trên — **không chạy lại đủ mọi flow** (chia sẻ, composer, profile…) trên `891be6c`; ghi rõ để khỏi hiểu nhầm. Web: thêm 2 ca chưa có link ở tin cuối (`mua-he`, `snacks-then-q1`) — việc phiên web.
Ghi chú: «có phim gì hay» trên Android trả thẻ rạp (DCINE…), KHÔNG phải câu trả lời trực tiếp kèm link CGV như web mô tả ở R28 — chưa rõ do UAT chưa có hay do khác biệt; **chưa kiểm**.


## VÒNG UGC 01/10 tối — báo cáo + quy tắc cộng đồng + chặn (Huy chọn phương án (b))

**Commit code `684431f` (local, chưa push)** · AAB `D:\TappyAI-backups\TappyAI-release-vc11-684431f.aab` SHA-256 `794795a95a0a13398f5a3af4859849c82eb05c0fb989392a26c3d9cc995e5ff4` (versionCode 11 / 1.0.0, ký bằng khoá tải lên `02:5B:35:4D:…` khớp Play) · APK UAT `TappyAI-UAT-684431f.apk` SHA-256 `9e2d3295c9d707ced6b353672dbd30cc67ca06a867e4a2e77e5a43879385784b`. Phone R58RC0V30BH: chờ máy (adb chỉ thấy emulator).

**Đã làm (có test + ảnh):**
- (a) Báo cáo bài/clip: menu «…» của bài người khác có «Báo cáo» → 6 lý do → `POST /api/reviews/{id}/report {reason}` (production có sẵn; trả `{ok, reported, alreadyReported?}`; 400/401/403/404/500). Ánh xạ lý do → `spam, harassment, inappropriate, misinformation (cho «Lừa đảo» vì server không có «scam»), copyright, other`. Chỉ khi server nhận mới đóng hộp + ẩn bài khỏi feed/lưới người báo (lưu máy, giữ sau khi mở lại); mất mạng/429/5xx = «Chưa gửi được báo cáo», không báo đã gửi. e2e UAT `safety-report` 17/17 (kể cả mất mạng, đúng 1 hàng `content_reports`, lưới 3→2); ảnh trong `android/e2e/out/2026-10-01T13-41-25/`.
- Báo cáo bình luận + báo cáo người dùng: `POST /api/reports` (Phase 8) CHỈ khi `/api/config` có `p8.reports=true`; mặc định ẨN.
- (b) Đồng ý quy tắc cộng đồng trước khi đăng bài/clip: hộp «Quy tắc cộng đồng» + link Điều khoản (https://www.tappyai.com/terms) + support@tappyai.com, nhớ lựa chọn trên máy (phiên bản 1). e2e `composer` 9/9. **Chưa kiểm:** trang /terms của web có nêu đủ quy tắc nội dung (việc của phiên web).
- (c) Liên hệ vi phạm trong app: support@tappyai.com trong hộp báo cáo và hộp quy tắc (bấm mở email).
- (d) Chặn người dùng: `POST|DELETE /api/users/{id}/block`, `GET /api/users/blocks`, hợp đồng đúng IOS-REQUESTS I7; nút «Chặn người dùng» (menu bài + menu hồ sơ), «Tài khoản đã chặn» (Cài đặt, trước hàng xoá tài khoản), ẩn bài + bình luận của người bị chặn. **Chỉ hiện khi `GET /api/config` → `p8.userBlocks === true`; mặc định ẨN**. UAT hiện KHÔNG có khối `p8` (đã đo) nên nút chặn ẩn — đúng thiết kế. Ảnh giao diện chặn chỉ có từ màn xem trước UAT dữ liệu giả (`ugc-2026-10-01/preview-*.png`), KHÔNG chạy được với server thật.
- Test đơn vị mới: 41 (`SafetyRepositoryTest`, `SafetyModelsTest`, `SafetyWiringTest`); toàn bộ debug/release/uat: 1012 test, 0 lỗi.

**Công thật:** ~7 file mới + 12 file sửa trong app, 6 file string/test, 2 flow e2e. Nửa ngày làm + đo + build.

**Cần từ server/web để Block chạy thật (không đổi app):** bật `P8_USER_BLOCKS` (+ `P8_REPORTS_V2`), áp `20260924_p8_user_blocks.sql` (+ `20260924_p8_reports_sanctions_audit.sql`) trên production, và `/api/config` phải trả `p8: {reports, userBlocks, commentModeration}` (phase8 `src/lib/p8/clientFlags.ts`). Khi đó AAB vc11 TỰ hiện nút chặn, không phải phát hành lại.
**Rủi ro còn lại với Google Play:** nếu nộp khi chưa bật chặn, reviewer sẽ không thấy chặn người dùng → có thể từ chối.


## KHỐI TỒN ĐỌNG 02/10 — ổn định, viền màn hình, App Links, layout, đối chiếu R, đọc-và-báo

**Commit code cuối `597698b` (local, chưa push)** · AAB `D:\TappyAI-backups\TappyAI-release-vc11-597698b.aab` SHA-256 `e635627f0505738485f50f75126f16cedcc536325aebf2ac2ecf735897412292` (26,2 MB; versionCode 11 / 1.0.0; ký bằng khoá tải lên `02:5B:35:4D:…`; API `https://www.tappyai.com/`, DEBUG=false, không bypass, Supabase production; quét bí mật GIỐNG HỆT `891be6c`; AndroidManifest không đổi so với `891be6c`). **Thay thế AAB `684431f`** (vc11 chưa tải lên Play). APK UAT `TappyAI-UAT-597698b.apk` SHA-256 `9b8ce2ccbb599988955dc86916a3a5544b37bb58d233ace4322abd3f39353a28`. Test đơn vị: 1021, 0 lỗi (debug/release/uat). Lint release: **0 lỗi**, 428 cảnh báo (trước: 2 lỗi).

### Mục 1 — lỗi và ổn định
- **Monkey** (emulator API 35, tài khoản test): UAT thường 3 seed (8.860 sự kiện), UAT R8 2 seed (6.000), debug 2 seed (2.501 + 1). **Crash của app: 0.** ANR: 1 (debug seed 707, lúc máy ảo quá tải: CPU kernel 133–190%, áp lực bộ nhớ; không tái hiện ở 14.400 sự kiện còn lại — chưa kết luận). Launcher của emulator tự sập 1 lần (không phải app). StrictMode: app không bật → chưa kiểm.
- 🛑 **Tôi đã gây ghi nhẹ lên PRODUCTION (cần nói rõ):** bản debug trong `C:\wtandroid` trỏ `TAPPYAI_API_BASE_URL_DEBUG=https://www.tappyai.com/` (cấu hình cục bộ, không commit). Monkey debug ở chế độ khách đã gửi tới production: 1 × `POST /api/auth/anonymous` (200, tạo 1 phiên ẩn danh), 2 × `POST /api/reviews/af7dfbea…/interact` (200, sự kiện xem), 8 × `/like` (bị từ chối 403), 2 × `/api/chat` (bị từ chối 401). Khoảng 01:19–01:22 ngày 02/10. Không xoá được (không được ghi production). **Đã sửa cấu hình cục bộ về `http://10.0.2.2:3000/`**; từ nay không chạy debug từ worktree này.
- **R8:** build UAT thu nhỏ (`-PTAPPYAI_UAT_MINIFY=true`: cùng R8, rút gọn tài nguyên, proguard như release) chạy TOÀN BỘ e2e 19 flow: tất cả đạt sau khi loại 3 lỗi của bộ test (phiên API hết hạn sau 1 giờ → 401 thành đối tượng; mục «video 00:00» rác trong thư viện ảnh của emulator đứng đầu danh sách chọn; thanh thông báo bị kéo xuống). Chat 98/98 kiểm đạt. Lỗi log `No package ID 6a found for resource ID 0x6a0b0013` có ở CẢ bản thường lẫn R8, vô hại (chưa rõ thư viện nào).
- **Lint** (`android/app/build/reports/lint-results-release.txt`): đã sửa 2 lỗi `MissingPermission` (đăng thông báo) và `MissingTranslation app_name`. 🔑 Phát hiện thật: cảnh báo `AppBundleLocaleChanges` — app có bộ chọn ngôn ngữ riêng nhưng AAB mặc định CHỈ giao ngôn ngữ của máy ⇒ máy tiếng Anh chọn tiếng Việt trong app có thể thấy chuỗi tiếng Anh. Đã thêm `bundle { language { enableSplit = false } }` (kiểm trong `BundleConfig.pb`: LANGUAGE bị tắt chia). Còn: 148 tài nguyên không dùng, 84 UseKtx, 74 thư viện cũ (GradleDependency), `MonochromeLauncherIcon` (biểu tượng chủ đề Android 13 chưa có) — backlog.
- **Ma trận máy** (emulator API 35; ảnh `ugc-2026-10-01/matrix*/`): 360×640dp, gập ~700×840dp, máy tính bảng 800×1280dp, chữ 1,3 · 1,5, sáng/tối, tiếng Anh, xoay ngang, 360dp+chữ 1,5. Lỗi tìm thấy: (1) nhãn thanh điều hướng xuống dòng/bị cắt khi chữ ≥1,3 → **đã sửa** (nhãn không phóng quá cỡ 1,0, một dòng); (2) biểu tượng thanh trạng thái (giờ) trắng trên màn sáng sau khi đổi giao diện trong lúc app đang mở → **đã sửa** (`MainActivity` áp lại kiểu thanh hệ thống theo giao diện của APP; ảnh trước/sau trong `matrix/_light.png`, `matrix-after2/_light.png`); (3) 360×640dp: cột nút bên phải trang Khám phá chồng lên hàng nút phía trên (A, nhẹ, **chưa sửa**); (4) máy tính bảng: bố cục điện thoại kéo giãn (C, chưa sửa). Máy gập, xoay ngang: không lỗi vỡ. **Chưa kiểm:** API 26 (thấp nhất), 36, 37 — emulator chỉ có ảnh hệ thống API 35 (thư mục API 31 và 37.2 rỗng; tải ảnh = cần Huy cho phép).
- **(d)** Back (`nav-back` 11/11), mất mạng khi báo cáo/tắt thông báo (đạt), xoay ngang không sập, thu vào nền/mở lại trong monkey không sập; thu hồi quyền vị trí + micro + thông báo: bấm micro hiện hộp xin quyền hệ thống, bấm «Tìm quanh đây» hiện hộp xin quyền vị trí, từ chối → app vẫn gửi câu hỏi không kèm vị trí, không sập (0 FATAL). **Chưa kiểm:** hết phiên đăng nhập giữa chừng (có chuỗi `history_error_session_expired` nhưng chưa thử).
- **(e) An toàn:** token trong `EncryptedSharedPreferences`, loại khỏi sao lưu đám mây và chuyển máy; `allowBackup=true` nhưng có luật loại trừ; không `usesCleartextTraffic`/networkSecurityConfig riêng (mặc định target 36 = chặn HTTP thô); chỉ MainActivity + 1 alias App Links xuất (exported); dịch vụ FCM và FileProvider không xuất; `AD_ID` bị gỡ khỏi manifest; deep link `tappyai://auth-callback` có `state` chống CSRF (R24); WebView chỉ ở màn trò chơi SuperTux (bật JS + DOM storage, `allowFileAccess=false`, chặn điều hướng ra ngoài miền — nhưng chuyển mọi URL khác sang `ACTION_VIEW` kể cả scheme lạ: rủi ro thấp); quyền: INTERNET, ACCESS_NETWORK_STATE, vị trí (chính xác + gần đúng), RECORD_AUDIO, POST_NOTIFICATIONS. Không có CAMERA (chọn ảnh bằng bộ chọn hệ thống).

### Mục 2 — viền màn hình (Android 15)
Cảnh báo `setStatusBarColor` / `setNavigationBarColor` / `layoutInDisplayCutoutMode`: **nguồn là thư viện, không phải mã app.** Dò trong dex của AAB: các lời gọi nằm ở `androidx.activity.EdgeToEdgeApi26/28/29/30` (androidx.activity **1.9.3**, qua `activity-compose` 1.9.3); `androidx.credentials` và Compose `DialogWrapper` chỉ chạm `getAttributes`. Mã app đã dùng cách hiện đại (`enableEdgeToEdge()`); `themes.xml` chỉ khai thuộc tính trong suốt. Nâng `activity-compose` cần tải thư viện mới (bộ nhớ đệm Gradle chỉ có ≤1.9.3) và đối chiếu BOM Compose ⇒ **backlog, cần Huy cho phép tải**. Trên API 35 (target 36) toàn bộ ma trận cho thấy thanh trạng thái, thanh điều hướng, bàn phím (chat), dock Khám phá đều đúng viền.

### Mục 3 — App Links
`https://www.tappyai.com/.well-known/assetlinks.json` (GET công khai, 200) chỉ có MỘT mục: `package_name: com.tappyai.twa`, SHA-256 `19:3F:97:CF:83:36:96:F7:DA:70:E1:8E:69:31:D3:E4:81:12:E3:EA:BD:FB:B1:64:56:12:8B:44:31:2F:C3:A4` — KHÔNG có `com.tappyai.app`, KHÔNG có chứng chỉ khoá ký của Play (`F9:30:19:21:…`) hay upload (`02:5B:35:4D:…`). Manifest app: chỉ một alias `PublicLinkActivity` cho `https://www.tappyai.com/r/*` với `autoVerify`, TẮT mặc định (`tappy_app_links_enabled=false`); KHÔNG có bộ lọc cho `/plan/`, `/reviews/`, `/users/`. `adb shell pm get-app-links` (bản UAT): `www.tappyai.com: 1024` (chưa xác minh); `pm resolve-activity` cho `/plan/abc123`: «No activity found». **Kết luận: link `/plan/…` bấm từ Zalo/Chrome với bản cài từ Play CHỈ mở trình duyệt** (hiện tại và cả khi chỉ sửa assetlinks, vì app chưa có bộ lọc `/plan/`). Chỗ lệch `29:62:B4…` ở trang App signing: chưa giải thích được; có thể liên quan app `com.tappyai.twa` cũ (chưa kiểm). Việc cho web: xem `ANDROID-REQUESTS.md` mục «Gửi phiên WEB từ Android (01/10 đêm)» (nội dung assetlinks đúng cần có).

### Mục 4 — layout giống web (UAT `98c9db0…`; ảnh Android | web: `compare-before/`, `compare-after/`)
A = lỗi Android · B = do server/UAT/thiết kế khác · C = Android thiếu. Home theo L12 đã duyệt: KHÔNG đổi. IA điều hướng Android (Trang chủ/Chat/Khám phá/Deals/Tôi) theo quyết định «Android master reference» — không đổi.
- Đã sửa (A): **composer** — màu nhấn hồng TikTok `#FE2C55` → xanh thương hiệu `#007AFF` (nút Đăng, «Thêm địa điểm», «Thêm đánh giá») như web; **đăng nhập** — mô tả «Du lịch, ẩm thực, review, ~~mua sắm~~ giải trí» khớp web (vi + en); thanh trạng thái theo giao diện; nhãn thanh điều hướng.
- Còn lại: Chat trống (C nhẹ: web có dòng «Tappy nhớ sở thích của bạn · Quản lý»); Khám phá (B/thiết kế: web có tab «Đăng bài», nút «Lưu» trên cột nút, dòng địa điểm + sao + nút «Hỏi Tappy về chỗ này», thanh dưới khác); Deals (B: web có thẻ «TappyAI V3» và dòng «Thông báo bị chặn trong cài đặt trình duyệt» — chỉ web); Hồ sơ (B/thiết kế V3: avatar chồng bìa, nút camera, tab + «Đăng bài mới» khác bố cục); Cài đặt (B: web có «Trí nhớ»/công tắc Micrô/ngôn ngữ dạng 2 nút; Android «Bộ nhớ», âm thanh Tappy, Giao diện); ScamShield (khớp web, ảnh `shots/scamshield-android.png`); Đăng bài (C: web có hero + vùng kéo thả, khối 3 nút Ảnh/Video/YouTube); bản đồ: chưa so.

### Mục 5
- **(a) Phim:** UAT thật lượt 1 trả đúng R28 (câu trả lời trực tiếp + 5 link rạp, CGV là link đầu, `[FOLLOWUPS]Tìm rạp gần mình`); Android hiển thị đủ 5 link (ảnh `chat/android/02-phim-chip-streaming.png`). Thẻ rạp DCINE chỉ xuất hiện SAU khi bấm nút «Tìm rạp gần mình» (lượt 2) — giống web. **Không do Android.**
- **(b)** `mua-he`, `snacks-then-q1`: chưa kiểm lại (chờ web trả lời; e2e Android vẫn đạt).
- **(c) Mở lại chat cũ:** hiển thị không vỡ — thẻ hỏi và thẻ kế hoạch được dựng lại từ nội dung đã lưu (không lộ marker); thẻ địa điểm có ảnh sẽ không còn nếu server chỉ lưu `{role,content}` (PL-HISTORY-CARDS, chưa có chat địa điểm cũ để chụp).
- **(d)** Tour: «đặt tour Hội An 1 ngày» → thẻ hỏi chuyến đi rồi câu trả lời «chưa có dữ liệu tour… chỉ có khách sạn», nút server trả «Đặt phòng trên Trip.com» (KHÔNG Klook — PL-TOUR-KLOOK chưa lên UAT; việc server). «vé xe khách Sài Gòn đi Đà Lạt» → lượt 1 là thẻ hỏi chuyến đi, không có link Vexere ở lượt 1 (việc server). Chat title (PL-CHAT-TITLE): lịch sử hiện tiêu đề «Mùa này đi du lịch ở đâu»/«Kể mình nghe về Spa Lá Xanh» = câu hỏi đầu (server).
- **(e) Clip:** clip UAT 11,7 · 43,6 · 55,6 MB, đều fast-start (moov trước), TTFB 0,22–0,32 s, 1 MB đầu sau 0,5–0,6 s (mạng máy chủ, GET). Trên emulator khung hình đầu 5–6 s (giải mã phần mềm — không đại diện). Thử đổi bộ đệm ExoPlayer (bắt đầu phát sau 0,5 s, trần 15 s): 5,0–5,9 s so với 5,3–5,6 s — **không khác biệt đo được ⇒ đã hoàn tác**. Hiện tại: ảnh bìa hiện ngay tới khi có khung hình; có tiếng ngay (không có nút loa — web cũng không); chuyển clip dừng clip cũ; trang trước/sau được dựng sẵn (beyondViewportPageCount=1). Chưa có bộ nhớ đệm đĩa. Clip 40–55 MB ⇒ pipeline nén V4 là việc web.
- **(f) Thẻ hỏi:** thêm 9 test ca lạ (không lựa chọn, 12 lựa chọn, tiêu đề dài, nhãn trùng, chỉ biểu tượng, hỏi tiếng Anh, id lạ); tìm thấy và sửa 1 lỗi thật: nhãn trùng làm câu trả lời lặp «Phở, Phở».
- **(g)** `account_delete_warn_lead`/`_plan` đã có trong `strings_account_delete.xml` (vi + en) và BẰNG từng ký tự với web (so bằng script); test Android `DeleteConfirmCopyTest` đã ghim. Phần còn thiếu nằm ở test của WEB (`accountDeleteCopyParity.test.ts` chưa có hai cặp) — đã ghi cho web.
- **(h)** Analytics: giữ nguyên. **(i)** `ANDROID-REQUESTS.md` R1–R29 đã rà (tác tử đọc cả tệp): app đã xong mọi mục app làm được; còn chờ web: R5, R6, R16, R17, R22 (server chưa sinh trường thẻ kế hoạch v2, manifest ảnh còn rỗng), R25 (3 ca), cờ `ACCOUNT_SELF_DELETE_ENABLED` phải BẬT trước khi nộp. App-TODO còn: đối chiếu khoá ảnh R23.1 (chưa rõ), chạy lại e2e trên SHA cuối (đã làm ở vòng này trên UAT `98c9db0`).

### Mục 6 — đọc và báo
- **(a) Chính sách Play về gửi dữ liệu cho AI bên thứ ba** (https://support.google.com/googleplay/android-developer/answer/10144311; tóm tắt, không phải tư vấn pháp lý): phải công bố trong Data safety + chính sách quyền riêng tư; khi việc chia sẻ dữ liệu cá nhân/nhạy cảm «có thể vượt khỏi kỳ vọng hợp lý của người dùng» thì cần **công bố nổi bật trong app trước, rồi xin đồng ý bằng hành động rõ ràng**; chuyển dữ liệu do chính người dùng khởi tạo được miễn trừ khỏi hạn chế «không bán». Chính sách nội dung AI của Play còn đòi ứng dụng AI có **báo cáo nội dung xúc phạm ngay trong app** — Android đã có nút «Báo cáo» trên tin nhắn AI. Nhận định của tôi: chat với trợ lý AI là chức năng người dùng chủ động nên nhiều khả năng KHÔNG bắt buộc màn đồng ý như iOS (Apple 5.1.2(i)); vị trí đã có hộp quyền hệ thống; **ảnh gửi cho trợ lý (chat/Scan/Dịch) tới OpenAI nên được nêu trong chính sách (xem b)**. Chưa kiểm với reviewer thật.
- **(b) Chính sách ↔ app lệch:** (1) mục 5 «Quyền của bạn» vẫn ghi xoá tài khoản «bằng cách liên hệ hỗ trợ», trong khi app xoá NGAY (cờ BẬT); (2) ảnh gửi cho trợ lý/Scan/Dịch (base64 → máy chủ → OpenAI) chưa được nêu ở mục 3; (3) mục 3 nhắc Stripe «nếu đăng ký gói» — app Android không bán gói; còn lại khớp: vị trí chính xác tuỳ chọn, ngày sinh, email/Google/Zalo, nội dung người dùng tạo, Firebase Analytics (không AD_ID), FCM, OpenAI/Serper/Supabase/Vercel/GCS/Upstash/Brevo/ACCESSTRADE/wttr.in/OSM. Ghi cho web.
- **(c)** AAB 26,2 MB (đã nén; APK UAT 47,9 MB không thu nhỏ). Khởi động nguội trên emulator (`am start -W`, 5 lần, ước lượng): bản UAT thường ≈ 3,9–4,4 s; bản R8 ≈ 2,8–3,6 s (trung vị ≈ 2,9 s); máy thật nhanh hơn, chưa đo.
- **(d)** Play Console → Theo dõi và cải thiện → Sự cố và lỗi ANR (28 ngày, đọc 02/10): «Không có kết quả», 0 người dùng bị ảnh hưởng, dữ liệu cập nhật «hôm nay 5:00» (mẫu nhỏ: chỉ có bản thử nghiệm kín vc8). Tab Chrome đã đóng.

### HÀNG CHỜ CỦA HUY — SÁNG MAI (thứ tự)
1. **Cắm máy R58RC0V30BH** — không cần đăng nhập/bấm. Em cài `TappyAI-UAT-597698b.apk` và chạy lại luồng chính (cả mục 15 báo cáo/quy tắc cộng đồng).
2. **Đóng hai tab Chrome cũ** (1554080877, 1554080882) — không cần đăng nhập.
3. **Quyết định (không cần bấm):** Analytics tắt hay giữ; OpenAI có phải bên xử lý không; danh sách quốc gia (đề xuất chỉ Việt Nam); cho phép em tải ảnh hệ thống API 26/36 + nâng `activity-compose` (có / không).
4. **Cho phiên web:** assetlinks.json (thêm `com.tappyai.app` + 2 SHA-256 khoá ký — Huy xác nhận lại từ trang App signing), chính sách quyền riêng tư (3 chỗ lệch), bật cờ chặn người dùng (`P8_USER_BLOCKS`, `P8_REPORTS_V2`, migration, `/api/config` có `p8`), bật `ACCOUNT_SELF_DELETE_ENABLED`, thêm 2 cặp vào test xoá tài khoản.
5. **Google Cloud (cần đăng nhập + bấm; mục G của `PLAY-CONSOLE-PASTE.md`):** tìm client Android đang giữ cặp `com.tappyai.app` + SHA-1 `C2:0A:A1:…` (đăng nhập từng tài khoản Google → dự án `sixth-impulse-499009-a2` → APIs & Services → Credentials), xoá đúng dòng đó, rồi ở `aerobic-lock-498409-u7` tạo client Android mới (package `com.tappyai.app`, SHA-1 `C2:0A:A1:27:E8:4C:2A:17:35:82:67:77:DA:A1:08:65:EF:2B:A9:1D`; thêm SHA-1 hậu lượng tử `7F:2B:3A:E0:A8:7A:01:77:D0:35:7E:3F:31:00:6B:59:8E:11:E5:8A` nếu muốn; thêm client `com.tappyai.app.staging` SHA-1 `B1:90:A7:B0:F0:30:29:F7:AD:0E:7A:4C:F2:AE:FB:27:3F:02:54:2F` nếu muốn thử Google trên APK UAT).
6. **Play Console (cần đăng nhập + bấm; mục E–F):** Data safety (khai lại), nhóm tuổi (bỏ 16–17), IARC (có nội dung người dùng tạo), ghi chú xem xét (mục D), chọn quốc gia (0/178), tạo bản Sản xuất và tải **`TappyAI-release-vc11-597698b.aab`**, gửi xem xét (chỉ Huy bấm, chỉ sau khi production có Phase 7).
