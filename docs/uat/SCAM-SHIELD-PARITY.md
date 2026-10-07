# Scam Shield — bảng thực tế web + HỢP ĐỒNG CHUNG cho web, Android, iOS (02/10/2026)

Người viết: phiên WEB. Đọc từ mã `rc/web-uat` (đường dẫn dưới đây là trong repo). Android và iOS đọc bằng git, KHÔNG checkout trong `C:\wtrel`.

## 1. Bảng thực tế trên WEB (trước → sau đợt này)
| Mục | Web trước | Web sau | Ghi chú |
|---|---|---|---|
| (a) Kiểm link | CÓ — `POST /api/scam-shield/check` | không đổi | Công cụ xác định (DNS, SSL, chuyển hướng, danh sách chặn, đối chiếu thư mục chính thức, có thể gồm Google Web Risk). Không AI, không tốn hạn mức câu hỏi. |
| (b) Kiểm TIN NHẮN (dán chữ) | CÓ — `POST /api/scam-shield/analyze` | không đổi | Quy tắc xác định + mọi link trong tin đi qua công cụ link + **AI theo bậc** (bậc 0 = chỉ link/không chữ: KHÔNG AI; bậc 1–2 = có AI). Tin KHÔNG được ghi log. |
| (c) Quét MÃ QR | CÓ nhưng ảnh bị **TẢI LÊN máy chủ** (`POST /api/scam-shield/qr`) | **Giải mã NGAY TRONG TRÌNH DUYỆT**, chỉ gửi link đã giải mã | Trái quy tắc riêng tư chung → sửa. Route `/qr` còn trên server cho khách cũ nhưng giao diện web không gọi nữa. |
| (d) Thư viện tình huống | CÓ — 25 tình huống Bộ Công an (`/scam-shield/kich-ban`, 5 nhóm) | không đổi | 89 tình huống Phase 8: CHƯA vào, đúng như quyết định. |
| (e) Số khẩn cấp 113 | CÓ — «Báo ngay cho Công an nơi gần nhất hoặc gọi 113» trong từng tình huống (thư viện) | không đổi | Không có khối 113 cố định trên kết quả kiểm tin nhắn/link. |
| (f) Chia sẻ kết quả | CÓ — `POST /api/scam-shield/share` (kết quả LINK → trang công khai `/r/<slug>`, dựng ở máy chủ từ kết quả kiểm link, KHÔNG có chữ của người dùng) | không đổi | Kết quả kiểm tin nhắn không có chia sẻ công khai. |
| (g) Giải thích | CÓ — tín hiệu có lời giải thích (song ngữ), lời khuyên «Không làm / Nên làm» | không đổi | |
| (h) Mic / đọc loa | KHÔNG | không đổi | |
| QR không phải link (thanh toán, Wi-Fi, danh bạ, SMS, email, vị trí, liên kết mở app, văn bản) | KHÔNG (báo lỗi «mã QR không chứa liên kết») | **CÓ** — hiện LOẠI mã + cảnh báo «TappyAI không tự thanh toán/kết nối/gọi/mở…» + nội dung đọc được | Không gửi gì lên máy chủ. |

Loại thiếu so với yêu cầu chung (nêu rõ để khỏi hiểu nhầm):
- **«Khớp tình huống tĩnh bằng `matchScenario` + khối nguồn + nút Đọc cảnh báo gốc»: KHÔNG có ở bản release** (loại **B** — nằm trong Phase 8, chưa vào). Hợp đồng hiện có trả «tín hiệu + loại thủ đoạn + lời khuyên», không trả «tên tình huống số N».
- **Không có chế độ «chỉ khớp tĩnh, không AI» ở server** cho tin nhắn có chữ: bậc 1–2 luôn gọi mô hình và trừ **1 câu hỏi AI** trong hạn mức chung (cùng quỹ với chat). Nếu app muốn chặn AI trước khi người dùng đồng ý chia sẻ dữ liệu với AI thì phải **không gọi** `/analyze` cho tin có chữ cho tới khi có đồng ý (link thuần vẫn gọi được: bậc 0 không AI).

## 2. HỢP ĐỒNG (Android và iOS dùng ĐÚNG những route này; web KHÔNG đổi server)
Gốc: `https://www.tappyai.com` (UAT: `https://uat.tappyai.com`). Cần đăng nhập: KHÔNG (khách được dùng). Lỗi luôn là mã HTTP không phải 2xx kèm `{error, message}`.
### 2.1 Kiểm link — `POST /api/scam-shield/check`
- Body: `{ "url": "<chuỗi ≤ 2048>" }`. Tên miền trần (`vietcombank.com.vn`) được nhận; thiếu dấu chấm hoặc không phân tích được → 400.
- 200: `CheckResult` = `{ inputType, url, risk:{score 0–100, confidence, level}, evidence:{…}, officialMatch:{brand, website, hotline?}|null, actions:[{code,label_vi,label_en,…}], checkedAt, cached }`. `risk.level` ∈ `SAFE | LOW | MEDIUM | HIGH | CRITICAL | INCONCLUSIVE` (INCONCLUSIVE = «chưa đủ thông tin»). Hiển thị: an toàn / nghi ngờ / nguy hiểm / chưa đủ thông tin theo `level`; lý do ngắn lấy từ `evidence` + `actions`; nguồn đối chiếu lấy từ `officialMatch`.
- Lỗi: 400 `invalid_input`; 400 `private_url` (địa chỉ nội bộ bị từ chối); 429 `rate_limit` (10 lần/phút/IP) hoặc `daily_limit`; 500 `check_failed`.
- Giới hạn ngày: **30 lần (có tài khoản) / 10 lần (khách)**, tính chung cho kiểm link (và route QR cũ); chia sẻ có hạn mức ngày riêng theo IP (`share_daily_limit`, 429).
- App KHÔNG tự mở link. Nút «Đừng mở» / «Mở thận trọng» là của app (mở bằng trình duyệt, sau khi người dùng xác nhận).
### 2.2 Kiểm TIN NHẮN — `POST /api/scam-shield/analyze`
- Body: `{ text?: ≤ 8000 ký tự thô (tin được cắt còn 4000 ký tự), url?: ≤ 2048, imageBase64?: ảnh chụp tin (JPEG/PNG/WebP/GIF ≤ 5 MB), mimeType? }` — ít nhất MỘT trong text/url/imageBase64. **Với app: chỉ gửi `text`/`url`; ảnh chụp tin là tính năng riêng, không cần ở v1.**
- 200: `MessageAnalysisResult` = `{ inputType, risk:{level,score,confidence}, scamType|null, attackGoal|null, signals:[{type,severity,explanation,source:'rule'|'ai'|'url'}], requestedActions[], detectedEntities:{urls,phoneNumbers,emails,organizations,platforms}, urlChecks[], advice:{doNot:[{code,label_vi,label_en}], doNow:[…]}, reasoningSummary, analysis:{tier 0–3, aiStatus:'used'|'not_needed'|'quota_exhausted'|'unavailable'|'failed', …}, analyzedAt }` + trường hạn mức khi có AI. Cùng thang `risk.level` với kiểm link.
- Tin bình thường: `risk.level` thấp/SAFE, không tín hiệu. Test đã có phía server (`analyze/route.test.ts`, `message/__tests__`); e2e UAT 02/10 xem mục 4.
- Lỗi: 400 `invalid_input`/`invalid_image`; 429 `rate_limit` (6 lần/phút/IP) hoặc hết hạn mức AI (`aiStatus: quota_exhausted`, vẫn trả kết quả quy tắc); 403/503 khi tài khoản bị hạn chế.
- **Riêng tư:** tin KHÔNG được ghi log, KHÔNG lưu DB; chỉ có dòng nhật ký hình dạng (độ dài, bậc). Tin có chữ (không chỉ link) được gửi tới OpenAI để phân tích.
### 2.3 Quét QR — GIẢI MÃ TRÊN MÁY
1. Giải mã trên máy (web: gói `qr` chạy trong trình duyệt; Android/iOS: thư viện sẵn của nền tảng). **Không gửi ảnh.**
2. Phân loại bằng văn bản đã giải mã (web: `src/lib/scam-shield/qr/payload.ts` — **chép đúng logic**): `http(s)://…` hoặc tên miền trần → `url`; `000201…` (VietQR/EMVCo) hoặc `momo:`/`zalopay:`/`vnpay:`/`vietqr:`… → thanh toán; `WIFI:` → Wi-Fi; `BEGIN:VCARD`/`MECARD:` → danh bạ; `tel:` → số điện thoại; `smsto:`/`sms:` → SMS; `mailto:`/`MATMSG:` → email; `geo:` → vị trí; mọi scheme khác (`intent:`, `market:`, `javascript:`, `data:` …) → liên kết mở app; còn lại → văn bản.
3. `url` → gọi `POST /api/scam-shield/check {url}` (mục 2.1) và hiển thị như kiểm link. Mọi loại khác: hiện LOẠI + cảnh báo («không tự thanh toán / không tự kết nối Wi-Fi / không tự gọi / không tự mở…») + nội dung đọc được (cắt 500 ký tự); **không tự thực hiện hành động nào, không gọi máy chủ**.
4. Quyền camera/ảnh có lời giải thích vi/en; từ chối không làm app sập (cho chọn ảnh).
5. Route cũ `POST /api/scam-shield/qr` (nhận ảnh) vẫn còn nhưng **KHÔNG dùng nữa** ở bản mới của cả ba nền tảng.
### 2.4 Chia sẻ — `POST /api/scam-shield/share { url, locale? }` → `{ slug, url, host, level }` (kết quả kiểm LINK; trang công khai `/r/<slug>`; không có chữ người dùng). Tin nhắn thì chia sẻ bằng **văn bản thường** do app dựng (mức + lý do ngắn), KHÔNG kèm nội dung tin gốc nếu người dùng không chọn.
### 2.5 Thư viện — `GET /api/scam-shield/directory` (danh sách tổ chức/tên miền chính thức, có cache 1 giờ). Thư viện 25 tình huống chạy bằng trang web `/scam-shield/kich-ban` (dữ liệu tĩnh trong mã web; app không có API riêng; đồng bộ qua server: backlog).
### 2.6 Giới hạn chi phí
Kiểm link/QR-link: không token. Tin nhắn có chữ: 1 câu hỏi AI/lần trừ vào hạn mức chung (khách ít hơn tài khoản; xem `quota` trong phản hồi). Burst: 10/phút (link), 6/phút (tin).

## 3. Sửa đổi phía WEB đợt này
- QR giải mã trong trình duyệt (mới: `qr/clientDecode.ts`, `qr/payload.ts`, `scamQr` i18n; giao diện mới hiện thẻ «Mã QR này không chứa đường link web»). Server KHÔNG đổi.
- `/privacy`: thêm đoạn Scam Shield (link → dịch vụ kiểm tra; tin có chữ → OpenAI; QR đọc trên thiết bị, ảnh không tải lên; không lưu tin/ảnh/số của kẻ lừa đảo).

## 4. Bằng chứng UAT — SHA 9474f65 (02/10), trình duyệt thật trên uat.tappyai.com, khách chưa đăng nhập, điện thoại 390 px
Ảnh + results.json: `gs://tappyai-uat-evidence/evidence/9474f65/scam/` (riêng tư). 17/17 bước đạt; đã MỞ XEM các ảnh kết quả.
| Kiểm | Kết quả |
|---|---|
| QR chứa link nguy hiểm (`vcb-secure-login.net`) | Trình duyệt giải mã tại chỗ; chỉ có MỘT yêu cầu `POST /api/scam-shield/check` dạng JSON chứa link; KHÔNG có `/qr`, KHÔNG có upload ảnh. Kết quả «Nguy cơ cao» 79 |
| QR Wi-Fi, QR thanh toán | Hiện «Mã QR này không chứa đường link web», loại mã + «TappyAI không tự kết nối/thanh toán…»; 0 yêu cầu tới máy chủ |
| Ảnh không có mã QR | Báo lỗi thân thiện, không sập, 0 yêu cầu |
| Tin «Bưu phẩm Trung thu kèm mã QR + link» | «Rất nguy hiểm» 81, loại «Lừa đảo giao hàng» |
| Tin «phạt nguội kèm link» | «Nguy cơ cao» 71, «Giả danh cơ quan nhà nước / công an» |
| 3 tin bình thường (người nhà; thông báo số dư không link; shipper GHN) | cả ba «An toàn» (4) — không bị báo nhầm |
| /privacy, /terms, /delete-account | hiện chữ mới; không còn Stripe; /terms có link bấm được tới /community-guidelines |
Chưa kiểm: quét bằng camera (web chỉ chọn ảnh); QR in nhỏ/mờ ngoài đời thật; Android/iOS (phiên khác).

## 8. Lá chắn lừa đảo — CHỮ CUỐI (vi + en) và LÝ DO cho link/QR (02/10, nhánh final/web-2026-10-02)
Android và iOS dùng ĐÚNG những câu dưới đây. Chữ này vẫn cần người am hiểu luật Việt Nam xem (docs/uat/SCAMSHIELD-WORDING-FOR-REVIEW.md). Không bao giờ hiện «An toàn/Safe», điểm số hay «Độ tin cậy».

**Tin nhắn — ba trạng thái** (`verdict` trong JSON của /analyze: `familiar` | `suspicious` | `unrecognized`)
| Trạng thái | Tiêu đề vi | Tiêu đề en | Câu đi kèm vi | Câu đi kèm en |
|---|---|---|---|---|
| familiar | Có dấu hiệu lừa đảo quen thuộc | Familiar scam signs found | Nội dung này giống một thủ đoạn lừa đảo đã được cơ quan chức năng cảnh báo. Đừng làm theo yêu cầu trong đó. | This looks like a scam tactic the authorities have warned about. Do not do what it asks. |
| suspicious | Có một số dấu hiệu đáng ngờ | Some suspicious signs found | Chưa đủ để kết luận, nhưng bạn nên dừng lại và xác minh qua kênh chính thức trước khi làm bất cứ điều gì. | Not enough to be certain, but stop and verify through an official channel before doing anything. |
| unrecognized | Chưa nhận ra dấu hiệu quen thuộc | No familiar signs recognised | Điều này KHÔNG có nghĩa là an toàn: đừng chuyển tiền, đừng đọc mã OTP, đừng bấm link lạ; hãy xác minh qua kênh chính thức. | This does NOT mean it is safe: do not send money, do not read out any OTP code, do not tap unknown links; verify through an official channel. |

**Link / QR có link — ba trạng thái**
| Trạng thái | Tiêu đề vi | Tiêu đề en |
|---|---|---|
| familiar | Đường link có đặc điểm thường gặp ở link giả mạo | This link has traits that are common in fake links |
| suspicious | Đường link có một số điểm đáng ngờ | This link has some suspicious traits |
| unrecognized | Chưa nhận ra dấu hiệu quen thuộc ở đường link này | No familiar signs recognised in this link |
- familiar, câu đi kèm vi: «Đây là nhận định về đặc điểm của đường link, không phải kết luận về một tổ chức hay tên miền cụ thể. Đừng đăng nhập, đừng nhập OTP hay thông tin thẻ trên trang này.»
- suspicious: «Chưa đủ để kết luận. Đừng nhập thông tin cá nhân hay mã OTP; hãy tự mở website hoặc ứng dụng chính thức.»
- unrecognized: cùng câu «Điều này KHÔNG có nghĩa là an toàn…» như trên.
- Tiêu đề khối lý do: «Lý do cụ thể» / «Specific reasons».
- QR KHÔNG phải link: hiện loại mã + «TappyAI chưa kiểm tra nội dung này. Đừng làm theo hướng dẫn trong đó nếu bạn không chắc; hãy xác minh qua kênh chính thức.» / «TappyAI has not checked this content. Do not follow instructions in it if you are unsure; verify through an official channel.»

**Dòng cuối mọi kết quả:** «TappyAI không thay thế cơ quan chức năng.» / «TappyAI does not replace the authorities.»
**Dòng 113 (khi có tình huống khớp):** «Báo ngay cho Công an nơi gần nhất hoặc gọi 113 nếu nghi ngờ bị lừa.» / «Report to the nearest police station or call 113 if you suspect a scam.»
**Khối tình huống:** «Tình huống tương ứng» / «Matching scenario»; «Kịch bản số {n} trong danh sách của Bộ Công an» / «Scenario #{n} in the Ministry of Public Security list»; «Dấu hiệu nhận biết (theo bài viết)» / «Warning signs (from the article)»; «Thông tin từ nguồn chính thức» / «Information from an official source»; «Xem bài viết gốc» / «Open the original article»; «Phần dấu hiệu và lời khuyên do TappyAI biên soạn từ nguồn chính thức, không phải trích dẫn nguyên văn.» / «The signs and advice were written by TappyAI from the official material, not quoted verbatim.»

**LÝ DO bằng vi/en cho link/QR (mới, CỘNG THÊM vào hợp đồng, không đổi trường cũ).** Mỗi phần tử của `evidence.items[]` ở /check (kể cả kiểm link do QR) có thêm (`urlChecks[]` của /analyze chỉ là bản tóm tắt, KHÔNG có các trường này):
- `reasonCode` — mã ổn định `<source>.<finding>` (bảng dưới);
- `reason_vi`, `reason_en` — câu đã điền số liệu; app chọn theo ngôn ngữ (mặc định vi) hoặc tự dịch từ `reasonCode`;
- `detail`/`summary` vẫn là dòng tiếng Anh kỹ thuật cũ (cho bản app cũ). Bản app cũ vẫn chạy; muốn hết chữ Anh thì app phải ĐỌC `reason_vi/reason_en` → **Android và iOS build lại MỘT lần**.
Chỉ hiện các mục `severity` là `warning` hoặc `critical` (mục `safe` là «bình thường», không hiện thành lý do). Không có lý do nào kết luận «link/tên miền này là lừa đảo» hay nói «an toàn».
Lưu ý: engine link HIỆN KHÔNG có tín hiệu «từ khoá đăng nhập/ngân hàng» hay «link rút gọn» nên không có câu cho chúng; chỉ khi engine thêm tín hiệu thì thêm câu vào `src/lib/scam-shield/reasons.ts` (test chặn: finding mới mà thiếu câu thì test đỏ).
| reasonCode | Tiếng Việt | English |
|---|---|---|
| `blocklist.BLOCKLISTED` | Tên miền nằm trong danh sách trang web xấu của Việt Nam mà TappyAI đối chiếu. | The domain appears on a Vietnamese bad-site list that TappyAI checks against. |
| `blocklist.NOT_LISTED` | Tên miền không nằm trong danh sách trang web xấu mà TappyAI đối chiếu. | The domain is not on the bad-site list TappyAI checks against. |
| `dns.NO_A_RECORD` | Tên miền chưa trỏ tới máy chủ nào (không có bản ghi địa chỉ). Hay gặp ở tên miền bỏ không hoặc mới đăng ký. | The domain does not point to any server yet (no address record). Common with parked or newly registered domains. |
| `dns.NO_NS_RECORD` | Tên miền không khai báo máy chủ tên (không có bản ghi NS). | The domain declares no name servers (no NS record). |
| `dns.RESOLVED` | Tên miền có bản ghi DNS bình thường. | The domain has ordinary DNS records. |
| `redirect.UNSAFE_REDIRECT` | Đường link chuyển hướng tới một địa chỉ không được phép truy cập (địa chỉ nội bộ). | The link redirects to an address that must not be visited (an internal address). |
| `redirect.CROSS_DOMAIN_REDIRECT` | Đường link chuyển qua 3 tên miền khác nhau trước khi tới trang cuối. | The link passes through 3 different domains before the final page. |
| `redirect.EXCESSIVE_REDIRECTS` | Đường link chuyển hướng 4 lần trước khi tới trang cuối. | The link redirects 4 times before the final page. |
| `redirect.MULTIPLE_REDIRECTS` | Đường link chuyển hướng 4 lần trước khi tới trang cuối. | The link redirects 4 times before the final page. |
| `redirect.FEW_REDIRECTS` | Đường link chuyển hướng ít lần, trong cùng một tên miền. | The link redirects a few times, within the same domain. |
| `redirect.NO_REDIRECTS` | Đường link không chuyển hướng. | The link does not redirect. |
| `ssl.INVALID_CERT` | Chứng chỉ bảo mật (SSL) của trang không hợp lệ hoặc đã hết hạn. | The page’s security certificate (SSL) is invalid or expired. |
| `ssl.EXPIRING_SOON` | Chứng chỉ bảo mật (SSL) của trang sắp hết hạn (còn 9 ngày). | The page’s security certificate (SSL) expires soon (9 days left). |
| `ssl.NO_SSL` | Không xác minh được chứng chỉ bảo mật (SSL) của trang. | The page’s security certificate (SSL) could not be verified. |
| `ssl.VALID` | Chứng chỉ bảo mật (SSL) của trang hợp lệ. | The page’s security certificate (SSL) is valid. |
| `whois.NEWLY_REGISTERED` | Tên miền mới được đăng ký cách đây 5 ngày. | The domain was registered only 5 days ago. |
| `whois.RECENTLY_REGISTERED` | Tên miền mới được đăng ký cách đây 5 ngày. | The domain was registered only 5 days ago. |
| `whois.ESTABLISHED` | Tên miền đã được đăng ký cách đây 5 ngày. | The domain was registered 5 days ago. |
| `impersonation.BRAND_IMPERSONATION` | Tên miền có chứa tên «Vietcombank» nhưng không nằm trong các tên miền chính thức mà TappyAI có của tổ chức này. | The domain contains the name “Vietcombank” but is not one of the official domains TappyAI has for that organisation. |
| `impersonation.OFFICIAL_DOMAIN` | Tên miền trùng với tên miền chính thức của «Vietcombank» trong danh bạ TappyAI. | The domain matches an official domain of “Vietcombank” in the TappyAI directory. |
| `webRisk.CLEAN` | Google Web Risk không ghi nhận cảnh báo cho địa chỉ này. | Google Web Risk has no warning recorded for this address. |
| `webRisk.SOCIAL_ENGINEERING` | Google Web Risk có cảnh báo về địa chỉ này: trang giả mạo để lấy thông tin (lừa đảo trực tuyến). | Google Web Risk has a warning about this address: a page that imitates another to steal information (phishing). |
| `webRisk.MALWARE` | Google Web Risk có cảnh báo về địa chỉ này: trang phát tán phần mềm độc hại. | Google Web Risk has a warning about this address: a page that spreads malicious software. |
| `webRisk.UNWANTED_SOFTWARE` | Google Web Risk có cảnh báo về địa chỉ này: trang cài phần mềm không mong muốn. | Google Web Risk has a warning about this address: a page that installs unwanted software. |
(Câu có số: số ngày, số lần chuyển hướng, số ngày còn hạn của chứng chỉ, tên tổ chức được điền từ dữ liệu; tên tổ chức đã lọc ký tự đặc biệt.)
