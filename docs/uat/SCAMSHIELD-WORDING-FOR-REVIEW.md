# ScamShield — toàn bộ chữ người dùng nhìn thấy (vi + en), để rà soát pháp lý

> **CẢNH BÁO: Chữ này PHẢI được một người am hiểu pháp luật Việt Nam rà soát trước khi chốt.** File này được sinh tự động từ mã nguồn (nguyên văn, không biên tập) ngày 02/10/2026, nhánh final/scam.
> Quy tắc đã áp dụng: chỉ 3 trạng thái; không bao giờ "An toàn/Safe"; không điểm số; không "Độ tin cậy"; link/QR không bị kết luận "là lừa đảo" về một tổ chức/tên miền cụ thể; luôn có dòng "TappyAI không thay thế cơ quan chức năng".

## 1. Ba trạng thái và lời văn đi kèm (`src/lib/i18n/scamVerdict.ts`)
| Khóa | Tiếng Việt | English |
|---|---|---|
| `scamVerdict.familiar.title` | Có dấu hiệu lừa đảo quen thuộc | Familiar scam signs found |
| `scamVerdict.suspicious.title` | Có một số dấu hiệu đáng ngờ | Some suspicious signs found |
| `scamVerdict.unrecognized.title` | Chưa nhận ra dấu hiệu quen thuộc | No familiar signs recognised |
| `scamVerdict.unrecognized.body` | Điều này KHÔNG có nghĩa là an toàn: đừng chuyển tiền, đừng đọc mã OTP, đừng bấm link lạ; hãy xác minh qua kênh chính thức. | This does NOT mean it is safe: do not send money, do not read out any OTP code, do not tap unknown links; verify through an official channel. |
| `scamVerdict.familiar.body` | Nội dung này giống một thủ đoạn lừa đảo đã được cơ quan chức năng cảnh báo. Đừng làm theo yêu cầu trong đó. | This looks like a scam tactic the authorities have warned about. Do not do what it asks. |
| `scamVerdict.suspicious.body` | Chưa đủ để kết luận, nhưng bạn nên dừng lại và xác minh qua kênh chính thức trước khi làm bất cứ điều gì. | Not enough to be certain, but stop and verify through an official channel before doing anything. |
| `scamVerdict.link.familiar.title` | Đường link có đặc điểm thường gặp ở link giả mạo | This link has traits that are common in fake links |
| `scamVerdict.link.suspicious.title` | Đường link có một số điểm đáng ngờ | This link has some suspicious traits |
| `scamVerdict.link.unrecognized.title` | Chưa nhận ra dấu hiệu quen thuộc ở đường link này | No familiar signs recognised in this link |
| `scamVerdict.link.familiar.body` | Đây là nhận định về đặc điểm của đường link, không phải kết luận về một tổ chức hay tên miền cụ thể. Đừng đăng nhập, đừng nhập OTP hay thông tin thẻ trên trang này. | This describes the traits of the link, not a conclusion about any particular organisation or domain. Do not sign in or enter an OTP or card details on this page. |
| `scamVerdict.link.suspicious.body` | Chưa đủ để kết luận. Đừng nhập thông tin cá nhân hay mã OTP; hãy tự mở website hoặc ứng dụng chính thức. | Not enough to be certain. Do not enter personal details or an OTP; open the official website or app yourself. |
| `scamVerdict.link.unrecognized.body` | Điều này KHÔNG có nghĩa là an toàn: đừng chuyển tiền, đừng đọc mã OTP, đừng bấm link lạ; hãy xác minh qua kênh chính thức. | This does NOT mean it is safe: do not send money, do not read out any OTP code, do not tap unknown links; verify through an official channel. |
| `scamVerdict.link.reasons` | Lý do cụ thể | Specific reasons |
| `scamVerdict.link.short.familiar` | Đặc điểm link giả mạo | Fake-link traits |
| `scamVerdict.link.short.suspicious` | Có điểm đáng ngờ | Some suspicious traits |
| `scamVerdict.link.short.unrecognized` | Chưa nhận ra dấu hiệu | No signs recognised |
| `scamVerdict.disclaimer` | TappyAI không thay thế cơ quan chức năng. | TappyAI does not replace the authorities. |
| `scamVerdict.scenario.heading` | Tình huống tương ứng | Matching scenario |
| `scamVerdict.scenario.number` | Kịch bản số {n} trong danh sách của Bộ Công an | Scenario #{n} in the Ministry of Public Security list |
| `scamVerdict.scenario.signs` | Dấu hiệu nhận biết (theo bài viết) | Warning signs (from the article) |
| `scamVerdict.scenario.source` | Thông tin từ nguồn chính thức | Information from an official source |
| `scamVerdict.scenario.sourceOpen` | Xem bài viết gốc | Open the original article |
| `scamVerdict.scenario.guidanceNote` | Phần dấu hiệu và lời khuyên do TappyAI biên soạn từ nguồn chính thức, không phải trích dẫn nguyên văn. | The signs and advice were written by TappyAI from the official material, not quoted verbatim. |
| `scamVerdict.scenario.report` | Báo ngay cho Công an nơi gần nhất hoặc gọi 113 nếu nghi ngờ bị lừa. | Report to the nearest police station or call 113 if you suspect a scam. |
| `scamVerdict.msg.subtitle` | Dán tin nhắn hoặc mô tả ngắn tình huống đáng ngờ. TappyAI đối chiếu với các tình huống lừa đảo đã được Bộ Công an cảnh báo. | Paste a message or briefly describe a suspicious situation. TappyAI compares it with the scam scenarios the Ministry of Public Security has warned about. |
| `scamVerdict.msg.privacy` | Đối chiếu bằng danh sách tình huống và quy tắc có sẵn: không dùng AI, không lưu nội dung tin nhắn. | Matched against a built-in list of scenarios and rules: no AI is used and the message text is not stored. |
| `scamVerdict.msg.why` | Lý do cụ thể | Specific reasons |
| `scamVerdict.qr.noVerdict` | TappyAI chưa kiểm tra nội dung này. Đừng làm theo hướng dẫn trong đó nếu bạn không chắc; hãy xác minh qua kênh chính thức. | TappyAI has not checked this content. Do not follow instructions in it if you are unsure; verify through an official channel. |

Câu đầy đủ của trạng thái 3 (tin nhắn): "Chưa nhận ra dấu hiệu quen thuộc. Điều này KHÔNG có nghĩa là an toàn: đừng chuyển tiền, đừng đọc mã OTP, đừng bấm link lạ; hãy xác minh qua kênh chính thức."

## 2. Nhãn cũ của thang 6 mức (chỉ còn hiện ở lịch sử cũ trên máy; đã đổi sang cùng 3 trạng thái)
| Khóa | Tiếng Việt | English |
|---|---|---|
| `scamShield.result.safe` | Chưa nhận ra dấu hiệu quen thuộc | No familiar signs recognised |
| `scamShield.result.low` | Chưa nhận ra dấu hiệu quen thuộc | No familiar signs recognised |
| `scamShield.result.medium` | Có một số dấu hiệu đáng ngờ | Some suspicious signs found |
| `scamShield.result.high` | Có dấu hiệu lừa đảo quen thuộc | Familiar scam signs found |
| `scamShield.result.critical` | Có dấu hiệu lừa đảo quen thuộc | Familiar scam signs found |
| `scamShield.result.inconclusive` | Chưa nhận ra dấu hiệu quen thuộc | No familiar signs recognised |

## 3. Màn hình ScamShield: tab, ô nhập, lỗi, trạng thái rỗng (`src/lib/i18n/v3/web.ts` + `dictionaries.ts`)
| Khóa | Tiếng Việt | English |
|---|---|---|
| `v3.scam.title` | Kiểm tra link / website | Check a link / website |
| `v3.scam.cta` | Kiểm tra ngay | Check now |
| `v3.scam.historyTitle` | Lịch sử kiểm tra | Check history |
| `v3.scam.empty` | Chưa có lượt kiểm tra nào. | No checks yet. |
| `v3.scam.tagline` | Bảo vệ bạn khỏi các liên kết và website đáng ngờ | Protects you from suspicious links and websites |
| `v3.scam.historyLocal` | Lịch sử chỉ được lưu trên thiết bị này. | History is stored on this device only. |
| `v3.scam.historyClear` | Xóa lịch sử | Clear history |
| `v3.scam.historyAll` | Xem tất cả | See all |
| `v3.scam.historyLess` | Thu gọn | Show less |
| `v3.scam.recheck` | Kiểm tra lại | Check again |
| `v3.scam.heroEyebrow` | Duyệt web cẩn thận hơn | Browse more carefully |
| `v3.scam.heroTitle1` | Kiểm tra kỹ | Check it first |
| `v3.scam.heroTitle2` | trước khi truy cập | before you open it |
| `v3.scam.heroBody` | Tappy giúp bạn phát hiện liên kết và website đáng ngờ, lừa đảo — kiểm tra trước, mở sau. | Tappy helps you spot suspicious and fraudulent links and websites — check first, open later. |
| `v3.scam.featDetect` | Phát hiện lừa đảo | Scam detection |
| `v3.scam.featDetectDesc` | Danh sách đen & Web Risk | Blocklists & Web Risk |
| `v3.scam.featFast` | Kiểm tra nhanh | Fast check |
| `v3.scam.featFastDesc` | Chỉ vài giây | Just a few seconds |
| `v3.scam.featHttps` | HTTPS & chuyển hướng | HTTPS & redirects |
| `v3.scam.featHttpsDesc` | Chứng chỉ, chuỗi redirect | Certificate, redirect chain |
| `v3.scam.featBrand` | Thương hiệu chính thức | Official brands |
| `v3.scam.featBrandDesc` | Đối chiếu danh bạ chính chủ | Matched against the official directory |
| `v3.scam.tabUrl` | Kiểm tra URL | Check a URL |
| `v3.scam.historyLink` | Lịch sử kiểm tra | Check history |
| `v3.scam.tabMessage` | Phân tích tin nhắn | Analyze a message |
| `v3.scam.msg.title` | Phân tích tin nhắn | Analyze a message |
| `v3.scam.msg.placeholder` | Ví dụ: Một người tự xưng là nhân viên ngân hàng gọi cho tôi và yêu cầu chuyển tiền để xác minh tài khoản… | Example: Someone claiming to be a bank employee called me and asked me to transfer money to verify my account… |
| `v3.scam.msg.urlPlaceholder` | Liên kết kèm theo (không bắt buộc) | Link included in the message (optional) |
| `v3.scam.msg.upload` | Tải ảnh chụp màn hình | Upload a screenshot |
| `v3.scam.msg.removeScreenshot` | Bỏ ảnh | Remove screenshot |
| `v3.scam.msg.cta` | Phân tích ngay | Analyze now |
| `v3.scam.msg.analyzing` | Đang phân tích… | Analyzing… |
| `v3.scam.msg.errFailed` | Chưa phân tích được tin nhắn này. Vui lòng thử lại. | Couldn't analyze this message. Please try again. |
| `v3.scam.msg.errScreenshotOff` | Hiện chưa đọc được ảnh chụp màn hình. Hãy dán nội dung tin nhắn vào ô chữ. | Screenshots cannot be read right now. Please paste the message text instead. |
| `v3.scam.msg.errImage` | Ảnh không hợp lệ hoặc quá lớn (tối đa 5 MB, JPEG/PNG/WebP). | The image is not valid or too large (max 5 MB, JPEG/PNG/WebP). |
| `v3.scam.msg.why` | Vì sao đáng ngờ | Why it is suspicious |
| `v3.scam.msg.goal` | Kẻ gian muốn lấy gì | What the attacker is after |
| `v3.scam.msg.wants` | Tin nhắn yêu cầu bạn | The message asks you to |
| `v3.scam.msg.doNot` | KHÔNG làm | Do NOT |
| `v3.scam.msg.doNow` | Nên làm ngay | Do this now |
| `v3.scam.msg.links` | Liên kết trong tin nhắn | Links in the message |
| `v3.scam.msg.linkUnchecked` | Chưa kiểm tra được | Could not check |
| `v3.scam.msg.extracted` | Nội dung đọc từ ảnh | Text read from the screenshot |
| `v3.scam.msg.type.telegram_account_phishing` | Lừa chiếm tài khoản Telegram | Telegram account takeover phishing |
| `v3.scam.msg.type.bank_phishing` | Giả mạo ngân hàng | Bank impersonation phishing |
| `v3.scam.msg.type.government_impersonation` | Giả danh cơ quan nhà nước / công an | Government / police impersonation |
| `v3.scam.msg.type.delivery_scam` | Lừa đảo giao hàng | Delivery scam |
| `v3.scam.msg.type.ecommerce_refund_scam` | Lừa hoàn tiền mua sắm | E-commerce refund scam |
| `v3.scam.msg.type.prize_scam` | Lừa trúng thưởng | Prize / reward scam |
| `v3.scam.msg.type.investment_scam` | Lừa đảo đầu tư | Investment scam |
| `v3.scam.msg.type.otp_phishing` | Lừa lấy mã OTP | OTP phishing |
| `v3.scam.msg.type.remote_access_scam` | Lừa điều khiển thiết bị từ xa | Remote-access scam |
| `v3.scam.msg.type.malware_distribution` | Phát tán ứng dụng độc hại | Malicious app distribution |
| `v3.scam.msg.type.romance_scam` | Lừa đảo tình cảm | Romance scam |
| `v3.scam.msg.type.job_scam` | Lừa đảo việc làm | Job scam |
| `v3.scam.msg.type.tech_support_scam` | Giả mạo hỗ trợ kỹ thuật | Tech-support scam |
| `v3.scam.msg.type.customer_support_impersonation` | Giả mạo chăm sóc khách hàng | Customer-support impersonation |
| `v3.scam.msg.type.loan_scam` | Lừa đảo vay tiền | Loan scam |
| `v3.scam.msg.type.charity_scam` | Lừa đảo từ thiện | Charity scam |
| `v3.scam.msg.type.other` | Dấu hiệu lừa đảo khác | Other scam pattern |
| `v3.scam.msg.goal.account_takeover` | Chiếm đoạt tài khoản của bạn | Take over your account |
| `v3.scam.msg.goal.credential_theft` | Đánh cắp thông tin đăng nhập | Steal your login details |
| `v3.scam.msg.goal.otp_interception` | Lấy mã OTP của bạn | Capture your OTP code |
| `v3.scam.msg.goal.payment_fraud` | Lừa bạn chuyển tiền | Get you to send money |
| `v3.scam.msg.goal.identity_theft` | Đánh cắp thông tin cá nhân | Steal your personal information |
| `v3.scam.msg.goal.malware_installation` | Cài phần mềm độc hại lên thiết bị | Install malware on your device |
| `v3.scam.msg.goal.remote_access_compromise` | Điều khiển thiết bị của bạn từ xa | Take remote control of your device |
| `v3.scam.msg.goal.phishing` | Dụ bạn vào trang giả mạo | Lure you to a fake page |
| `v3.scam.msg.goal.social_engineering` | Thao túng để bạn làm theo yêu cầu | Manipulate you into complying |
| `v3.scam.msg.goal.investment_scam` | Dụ bạn nạp tiền đầu tư | Get you to deposit into a fake investment |
| `v3.scam.msg.goal.romance_scam` | Lợi dụng tình cảm để lấy tiền | Exploit a relationship for money |
| `v3.scam.msg.goal.impersonation` | Mạo danh để tạo lòng tin | Borrow a trusted name to gain your trust |
| `v3.scam.msg.goal.other` | Mục đích khác | Other goal |
| `scamShield.title` | Kiểm Tra An Toàn | Safety Check |
| `scamShield.subtitle` | Kiểm tra liên kết, website, mã QR | Check links, websites, QR codes |
| `scamShield.urlPlaceholder` | Nhập URL hoặc tên miền... | Enter URL or domain... |
| `scamShield.check` | Kiểm tra | Check |
| `scamShield.checking` | Đang kiểm tra... | Checking... |
| `scamShield.qrUpload` | Quét mã QR | Scan QR |
| `scamShield.qrCamera` | Chụp ảnh QR | Capture QR |
| `scamShield.orScanQr` | hoặc quét mã QR | or scan a QR code |
| `scamShield.evidence` | Chi tiết phân tích | Analysis details |
| `scamShield.actions` | Khuyến nghị | Recommendations |
| `scamShield.official` | Thông tin chính thức | Official information |
| `scamShield.official.website` | Website chính thức | Official website |
| `scamShield.official.hotline` | Hotline | Hotline |
| `scamShield.error.invalidUrl` | URL không hợp lệ | Invalid URL |
| `scamShield.error.privateUrl` | Không thể kiểm tra địa chỉ mạng nội bộ | Cannot check internal network addresses |
| `scamShield.error.rateLimit` | Bạn đã kiểm tra quá nhiều lần. Thử lại sau. | Too many checks. Try again later. |
| `scamShield.error.dailyLimit` | Đã hết lượt kiểm tra hôm nay. Quay lại ngày mai. | Daily check limit reached. Come back tomorrow. |
| `scamShield.error.checkFailed` | Không thể kiểm tra URL | Could not check this URL |
| `scamShield.error.qrDecode` | Không thể đọc mã QR | Could not read QR code |
| `scamShield.error.qrNoUrl` | Mã QR không chứa liên kết | QR code does not contain a link |
| `scamShield.error.qrFailed` | Không thể kiểm tra mã QR | Could not check QR code |

## 4. Mã QR không phải đường link (`scamQr.ts`)
| Khóa | Tiếng Việt | English |
|---|---|---|
| `scamQr.title` | Mã QR này không chứa đường link web | This QR code does not contain a web link |
| `scamQr.kind.payment` | Loại mã: thanh toán | Type: payment |
| `scamQr.kind.wifi` | Loại mã: Wi-Fi | Type: Wi-Fi |
| `scamQr.kind.contact` | Loại mã: danh bạ (thẻ liên hệ) | Type: contact card |
| `scamQr.kind.phone` | Loại mã: số điện thoại | Type: phone number |
| `scamQr.kind.sms` | Loại mã: tin nhắn SMS | Type: SMS message |
| `scamQr.kind.email` | Loại mã: email | Type: email |
| `scamQr.kind.geo` | Loại mã: vị trí | Type: location |
| `scamQr.kind.app_link` | Loại mã: liên kết mở ứng dụng | Type: app link |
| `scamQr.kind.text` | Loại mã: văn bản | Type: text |
| `scamQr.warn.payment` | TappyAI không tự thanh toán. Chỉ trả tiền khi chính bạn biết rõ người nhận và số tiền; đừng quét mã thanh toán do người lạ gửi. | TappyAI never pays for you. Only pay when you personally know the recipient and the amount; do not scan payment codes sent by strangers. |
| `scamQr.warn.wifi` | TappyAI không tự kết nối Wi-Fi. Mã lạ có thể dẫn vào mạng giả mạo. | TappyAI never joins a Wi-Fi network for you. An unknown code can lead you onto a fake network. |
| `scamQr.warn.contact` | TappyAI không tự lưu vào danh bạ của bạn. | TappyAI never saves anything to your contacts. |
| `scamQr.warn.phone` | TappyAI không tự gọi. Kẻ lừa đảo hay dùng số lạ — đừng gọi lại nếu bạn không chắc. | TappyAI never places a call. Scammers often use unknown numbers — do not call back if you are not sure. |
| `scamQr.warn.sms` | TappyAI không tự nhắn tin. | TappyAI never sends a message. |
| `scamQr.warn.email` | TappyAI không tự gửi email. | TappyAI never sends an email. |
| `scamQr.warn.geo` | TappyAI không tự mở bản đồ. | TappyAI never opens a map. |
| `scamQr.warn.app_link` | Đây là liên kết mở một ứng dụng khác. TappyAI không tự mở nó; chỉ mở nếu bạn tin người gửi. | This link opens another app. TappyAI will not open it; open it only if you trust whoever sent it. |
| `scamQr.warn.text` | Nội dung này chưa được kiểm tra. Đừng làm theo hướng dẫn trong đó nếu bạn không chắc. | This content has not been checked. Do not follow instructions in it if you are not sure. |
| `scamQr.content` | Nội dung đọc được | What was read |
| `scamQr.privacy` | Ảnh QR được đọc ngay trên thiết bị của bạn và không được tải lên máy chủ. | The QR image is read on your device and is not uploaded to a server. |

## 5. Chia sẻ công khai (`share.ts` + `scamSharePayload.ts`)
| Khóa | Tiếng Việt | English |
|---|---|---|
| `share.scam.button` | Cảnh báo cho mọi người | Warn your group |
| `share.scam.hint` | Tạo trang công khai với kết quả kiểm tra để gửi vào nhóm Zalo, Messenger… | Creates a public page with this verdict to send into Zalo, Messenger… |
| `share.scam.title` | Kiểm tra lừa đảo: {host} — TappyAI | Scam check: {host} — TappyAI |
| `share.scam.checkAnother` | Kiểm tra một link khác | Check another link |

Nội dung trang chia sẻ (sinh trong mã): dòng đầu "**<tiêu đề trạng thái link>.**"; "Tappy đã đối chiếu x/y nguồn kiểm tra độc lập."; "n dấu hiệu nguy hiểm"; "n dấu hiệu cần lưu ý"; bằng chứng (chỉ mục cảnh báo); "Trang chính thức của **<tổ chức>** là địa chỉ bên dưới — hãy so sánh kỹ trước khi đăng nhập hay chuyển tiền."; "Kết quả này được TappyAI kiểm tra tự động từ các nguồn công khai tại thời điểm chia sẻ. Hãy kiểm tra lại nếu bạn nhận được link tương tự."; "TappyAI không thay thế cơ quan chức năng." Tiêu đề: "Kiểm tra lừa đảo: <host> — <tiêu đề trạng thái link>". (EN tương ứng trong mã.)

## 6. Lời khuyên "KHÔNG làm / Nên làm" của tin nhắn (`message/advice.ts`) — vi | en
- KHÔNG nhập hay đọc mã OTP / mã xác thực cho bất kỳ ai | Do NOT enter or read out any OTP / verification code to anyone
- KHÔNG nhập mật khẩu vào liên kết trong tin nhắn | Do NOT enter your password on a link from the message
- KHÔNG cung cấp mã khôi phục, mã 2FA hay thông tin đăng nhập | Do NOT provide recovery codes, 2FA codes or login details
- KHÔNG bấm vào liên kết trong tin nhắn | Do NOT open the link in the message
- KHÔNG chuyển tiền hay nộp bất kỳ khoản "phí" nào | Do NOT transfer money or pay any "fee"
- KHÔNG gửi tiền mã hóa — giao dịch không thể hoàn lại | Do NOT send cryptocurrency — it cannot be reversed
- KHÔNG cài đặt ứng dụng hay tệp được gửi kèm | Do NOT install any app or file you were sent
- KHÔNG chia sẻ màn hình hay cấp quyền điều khiển từ xa | Do NOT share your screen or grant remote access
- KHÔNG cung cấp CCCD, số thẻ, thông tin cá nhân | Do NOT provide ID, card numbers or personal details
- KHÔNG chuyển sang trò chuyện ở ứng dụng khác theo yêu cầu | Do NOT move the conversation to another app as asked
- KHÔNG trả lời hay làm theo yêu cầu trong tin nhắn | Do NOT reply to or follow the requests in the message
- KHÔNG hành động vội vì hạn chót — đó là chiêu gây áp lực | Do NOT act on the deadline — it exists to pressure you
- Mở ứng dụng chính thức (không qua liên kết) để kiểm tra trạng thái tài khoản | Open the official app yourself (not via the link) to check your account status
- Báo cáo và chặn người gửi | Report and block the sender
- Bật xác thực hai bước trong ứng dụng chính thức | Turn on two-step verification in the official app
- Nếu đã nhập thông tin: đổi mật khẩu ngay và đăng xuất mọi thiết bị lạ | If you already entered details: change your password now and sign out unknown devices
- Nếu đã chuyển tiền: gọi ngân hàng ngay để yêu cầu chặn giao dịch | If you already paid: call your bank immediately to try to stop the transfer
- Nếu đã cài ứng dụng lạ: gỡ ngay, đổi mật khẩu ngân hàng từ thiết bị khác | If you installed an unknown app: remove it now and change bank passwords from another device
- Nếu đã cấp quyền điều khiển từ xa: ngắt mạng, gỡ phần mềm, đổi mật khẩu từ thiết bị khác | If you granted remote access: disconnect, remove the software, change passwords from another device
- Tự liên hệ tổ chức qua số điện thoại / website chính thức bạn tra cứu được | Contact the organisation yourself through a phone number / website you looked up
- Chưa nhận ra dấu hiệu quen thuộc. Điều này KHÔNG có nghĩa là an toàn: hãy xác minh qua kênh chính thức trước khi làm theo | No familiar signs recognised. This does NOT mean it is safe: verify through an official channel before acting on it
- Chưa nhận ra dấu hiệu quen thuộc. Điều này KHÔNG có nghĩa là an toàn: hãy xác minh qua kênh chính thức trước khi làm theo | No familiar signs recognised. This does NOT mean it is safe: verify through an official channel before acting on it
- Chỉ truy cập trang chính thức: ${match.website} | Only use the official site: ${match.website}
- Gọi hotline chính thức: ${match.hotline} | Call the official hotline: ${match.hotline}

## 7. Khuyến nghị cho đường link (`engine/actionEngine.ts`) — vi | en
- KHÔNG mở liên kết này | Do NOT open this link
- Truy cập trang chính thức: ${directoryMatch.website} | Visit the official site: ${directoryMatch.website}
- Gọi hotline chính thức: ${directoryMatch.hotline} | Call official hotline: ${directoryMatch.hotline}
- Nếu nghi ngờ bị lừa, báo cho cơ quan chức năng | If you suspect a scam, report it to the authorities
- Cần cẩn thận khi truy cập | Proceed with caution
- Xác minh danh tính trang web trước khi nhập thông tin | Verify the site identity before entering information
- Kiểm tra trang chính thức: ${directoryMatch.website} | Compare with the official site: ${directoryMatch.website}
- Chưa nhận ra dấu hiệu quen thuộc. Điều này KHÔNG có nghĩa là an toàn: đừng chuyển tiền, đừng đọc mã OTP, đừng bấm link lạ; hãy xác minh qua kênh chính thức. | No familiar signs recognised. This does NOT mean it is safe: do not send money, do not read out any OTP code, do not tap unknown links; verify through an official channel.
- Tự xác minh danh tính trang web trước khi nhập thông tin | Verify the site identity yourself before entering information
- Kiểm tra trang chính thức: ${directoryMatch.website} | Compare with the official site: ${directoryMatch.website}

## 8. Các "dấu hiệu" do quy tắc sinh ra (hiện ở "Lý do cụ thể") (`message/rules.ts`) — vi | en
- Đe dọa khóa hoặc đình chỉ tài khoản — chiêu ép người nhận hành động vội. | Threatens to lock or suspend an account — a pressure tactic to make you act quickly.
- Dựng lên một "cảnh báo bảo mật" để tạo cớ yêu cầu bạn xác thực. | Stages a "security alert" as the pretext for asking you to verify something.
- Đặt ra hạn chót gấp gáp để bạn không kịp suy nghĩ hay kiểm chứng. | Sets an artificial deadline so you have no time to think or check.
- Yêu cầu "xác thực số điện thoại" — bước đầu của việc chiếm đoạt tài khoản qua mã OTP. | Asks you to "verify your phone number" — the usual first step of an OTP-based account takeover.
- Yêu cầu "xác thực tài khoản" bên ngoài ứng dụng chính thức. | Asks you to "verify your account" outside the official app.
- Yêu cầu mã OTP / mã xác thực — không tổ chức hợp pháp nào hỏi mã này. | Asks for an OTP / verification code — no legitimate organisation asks for this.
- Yêu cầu mật khẩu. | Asks for a password.
- Yêu cầu mã PIN. | Asks for a PIN.
- Yêu cầu chuyển tiền hoặc nộp một khoản "phí" trước. | Asks you to transfer money or pay a "fee" up front.
- Cung cấp số tài khoản để nhận tiền. | Provides a bank account to receive money.
- Liên quan đến tiền mã hóa / ví điện tử — giao dịch không thể hoàn lại. | Involves cryptocurrency / a wallet address — transactions cannot be reversed.
- Yêu cầu chia sẻ màn hình hoặc điều khiển thiết bị từ xa. | Asks for screen sharing or remote control of your device.
- Yêu cầu cài đặt ứng dụng / tệp từ nguồn không chính thức. | Asks you to install an app or file from an unofficial source.
- Dùng phần thưởng / quà tặng làm mồi nhử. | Uses a prize or gift as bait.
- Hứa hẹn lợi nhuận / thu nhập — dấu hiệu lừa đảo đầu tư. | Promises returns or income — the shape of an investment scam.
- Giả danh cơ quan pháp luật — công an, tòa án không làm việc qua tin nhắn. | Poses as a legal authority — police and courts do not work through messages.
- Tự xưng là bộ phận hỗ trợ / "hệ thống" để tạo vẻ chính thức. | Claims to be support or "the system" to sound official.
- Dụ chuyển sang nền tảng khác — nơi khó truy vết và kiểm soát. | Tries to move the conversation to another platform where it is harder to trace.
- Thúc giục bấm vào một liên kết bên ngoài. | Urges you to open an external link.
- Yêu cầu đăng nhập hoặc nhập thông tin tài khoản / thẻ qua liên kết. | Asks you to log in or enter account / card details through a link.
- Dùng lời lẽ đe dọa / gây sợ hãi. | Uses threatening or fear-inducing language.
- Chứa câu lệnh nhắm vào hệ thống phân tích — tin nhắn cố thao túng công cụ kiểm tra. | Contains instructions aimed at the analysis system — the message is trying to manipulate the checker.
- Nhân danh một tổ chức / nền tảng quen thuộc để tạo lòng tin. | Speaks in the name of a familiar organisation or platform to gain trust.

## 9. Thông báo lỗi từ máy chủ (`serverMessages.ts`)
| Khóa | Tiếng Việt | English |
|---|---|---|
| `scam.invalidUrl` | Đường liên kết không hợp lệ. | That link is not valid. |
| `scam.invalidBody` | Yêu cầu không hợp lệ. | That request is not valid. |
| `scam.privateUrl` | Không kiểm tra được địa chỉ nội bộ. | Internal network addresses can't be checked. |
| `scam.checkFailed` | Chưa kiểm tra được liên kết này. Vui lòng thử lại. | Couldn't check this link. Please try again. |
| `scam.tooManyChecks` | Bạn kiểm tra quá nhiều lần. Vui lòng thử lại sau. | Too many checks. Please try again later. |
| `scam.dailyLimit` | Bạn đã dùng hết lượt kiểm tra hôm nay. | You've used all of today's checks. |
| `scam.analyzeEmpty` | Hãy dán tin nhắn, thêm liên kết hoặc tải ảnh chụp màn hình. | Paste a message, add a link, or upload a screenshot. |
| `scam.analyzeInvalidImage` | Ảnh không hợp lệ hoặc quá lớn (tối đa 5 MB, JPEG/PNG/WebP). | The image is not valid or too large (max 5 MB, JPEG/PNG/WebP). |
| `scam.screenshotUnavailable` | Hiện chưa đọc được ảnh chụp màn hình. Hãy dán nội dung tin nhắn vào ô chữ. | Screenshots cannot be read right now. Please paste the message text instead. |
| `scam.analyzeFailed` | Chưa phân tích được tin nhắn này. Vui lòng thử lại. | Couldn't analyze this message. Please try again. |

## 10. Khối "tình huống tương ứng"
Tiêu đề, tóm tắt, dấu hiệu, việc nên/không nên làm lấy NGUYÊN VĂN từ 25 kịch bản trong `src/lib/scam-shield/knowledge/bocongan2026.ts` (nguồn: Bộ Công an, "Nâng cao cảnh giác trước 25 kịch bản lừa đảo trên không gian mạng năm 2026", 08/09/2026), cùng dòng "Báo ngay cho Công an nơi gần nhất hoặc gọi 113 nếu nghi ngờ bị lừa." Phần "hướng dẫn" do TappyAI biên soạn, có ghi chú không phải trích dẫn nguyên văn.
