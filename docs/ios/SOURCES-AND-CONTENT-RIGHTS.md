# Nguồn dữ liệu, ghi nguồn và quyền nội dung bên thứ ba (02/10/2026)

Chỉ đọc mã và điều khoản; **không sửa mã, không điền App Store Connect**. Mã đọc: nhánh `ios/sync-2026-09-30` (có cả `android/` và `src/`) và `origin/rc/web-uat`. Điều khoản đã đọc hôm nay: hướng dẫn ghi nguồn của OSM (osmfoundation.org/wiki/Licence/Attribution_Guidelines) và chính sách Nominatim (operations.osmfoundation.org/policies/nominatim/). Điều khoản các nguồn khác **chưa kiểm** — ghi rõ từng chỗ.

## 1. Bảng nguồn

| Nguồn | Dùng ở đâu | App iOS có hiển thị dữ liệu này không | Điều khoản yêu cầu ghi nguồn | App đã ghi nguồn ở đâu | THIẾU |
|---|---|---|---|---|---|
| **OpenStreetMap** (Overpass: danh sách quán/khách sạn; Nominatim: toạ độ → tên khu vực / thành phố) | Server `src/lib/ai/tools/food.ts`, `travel.ts`; web `ChatInterface.tsx`, `LocationProvider.tsx` gọi `nominatim.openstreetmap.org/reverse` | **Có, gián tiếp**: khi nguồn chính (Serper) không đủ, thẻ địa điểm lấy tên, địa chỉ, loại món, giờ mở cửa từ OSM. iOS không có bản đồ nhúng và không tự gọi Nominatim. | Có (ODbL). Đã đọc: ghi **"OpenStreetMap"**, nên có liên kết `openstreetmap.org/copyright`, nêu dữ liệu theo giấy phép ODbL. Với app: ở góc bản đồ hoặc màn hình khởi động, có thể thu gọn sau vài giây nếu vẫn xem được trong nút thông tin/menu. Với dữ liệu không phải bản đồ (tra cứu, danh sách): ghi trong phần thông tin/metadata của sản phẩm, không bắt buộc ghi từng kết quả (trừ khi tạo thành cơ sở dữ liệu phái sinh — chỗ này **chưa chắc**, cần người am hiểu luật). Nominatim: cũng đòi ghi nguồn; tối đa 1 yêu cầu/giây; bắt buộc User-Agent hoặc Referer nhận diện app. | (a) `/privacy` (rc/web-uat `legal.ts:70`, `:318`): liệt kê «OpenStreetMap (Nominatim và Overpass)» là nhà cung cấp — là minh bạch dữ liệu cá nhân, **không phải** dòng ghi nguồn. (b) Một ghi chú máy chủ «Du lieu tu OpenStreetMap» (`messages.ts`) nằm trong kết quả công cụ cho mô hình, **không chắc người dùng thấy**. | **Không có dòng «© OpenStreetMap contributors» nào trong app iOS, Android hay trang web.** |
| **Serper** (Google Search / Maps / Shopping qua API: kết quả địa điểm mặc định, giá, ảnh sản phẩm) | `placesProvider.ts` mặc định `serper`; `buildEntity.ts` ghi ảnh `serper_shopping`; giá/ưu đãi | Có: thẻ địa điểm, so sánh mua sắm, ảnh sản phẩm, liên kết sàn | **Chưa kiểm** điều khoản hiện hành của Serper và của Google đối với kết quả/ảnh lấy qua API (quyền hiển thị lại ảnh, có cần ghi «Google» không). | Không thấy dòng nào trong app | Cần Huy đọc/hỏi điều khoản Serper; **ảnh sản phẩm là nội dung có chủ sở hữu** (cửa hàng/thương hiệu) |
| **Google Places / Maps** | Mã chú thích: nhà cung cấp `google` đã gỡ 21/09 (Places không có cho Việt Nam). iOS không có Google Maps SDK; Android `MapCanvas.kt` hiện là **khung giả** chưa có bản đồ thật | Không (không dùng) | Không áp dụng hôm nay. Nếu sau này thêm Google Maps SDK thì có yêu cầu ghi nguồn riêng — **chưa kiểm** | — | Nút «Xem bản đồ» mở liên kết Google Maps bên ngoài: không cần ghi nguồn |
| **Bộ Công an** (25 kịch bản lừa đảo, bài 08/09/2026) | iOS `bocongan2026.json` (chép từ Android), màn Lá chắn → Tình huống / Tin nhắn | Có: tóm tắt, số điện thoại chính thức, liên kết «Đọc cảnh báo gốc» | **Chưa kiểm** điều khoản sử dụng lại thông tin của Cổng thông tin điện tử Bộ Công an (thường cho phép trích dẫn có ghi nguồn — **chưa kiểm**) | Có: thẻ «Nguồn: Cổng Thông tin điện tử Bộ Công an», ngày đăng, liên kết gốc, và dòng «TappyAI không phải cơ quan nhà nước» (đã thấy trong ảnh 06) | Chưa rõ giấy phép sao chép nguyên văn 25 tình huống vào app |
| **VnExpress Du lịch** | Server `vnexpressTravel.ts`: RSS + tối đa 3 bài, trích ≤1.500 ký tự, **không lưu**, đúng robots.txt (theo ghi chú trong mã) | Gián tiếp: làm căn cứ cho câu trả lời du lịch; mã ghi là chỉ bổ sung, không trích nguyên văn thành thẻ | **Chưa kiểm** (cả điều khoản VnExpress lẫn việc có hiện tên nguồn cho người dùng không) | **Chưa thấy** chỗ hiển thị tên báo cho người dùng iOS | Nếu câu trả lời dựa vào bài báo thì nên có «Theo VnExpress» + liên kết — cần web xác nhận |
| **YouTube (oEmbed)** | Web `api/oembed`, `explore/oembed`; iOS `CreateReviewService` / `ReviewDetailView`: bài đánh giá gắn liên kết YouTube | Có: clip YouTube người dùng gắn vào bài | **Chưa kiểm** điều khoản API/nhúng của YouTube (người chơi nhúng chính thức thường phải giữ nguyên player và nhãn) | Nội dung do chủ kênh đăng, hiển thị qua liên kết/nhúng | Nên kiểm iOS dùng player nhúng chính thức hay chỉ mở liên kết |
| **TikTok** | Web `explore/oembed`, `viet-content`; liên kết sàn TikTok Shop | Chủ yếu liên kết ra ngoài / thẻ so sánh | **Chưa kiểm** | — | Chưa kiểm |
| **Cloudinary** | Không tìm thấy trong mã `ios/`, `android/`, `src/` | Không | — | — | Không áp dụng (nếu ảnh người dùng ở nơi khác thì không ghi nguồn) |
| **Jamendo** (nhạc) | Tính năng Nhạc đã ẩn trong bản phát hành (`ProductFlags.showMusic`); iOS `SoundPageView` có `attributionFor` (giấy phép + nhà cung cấp) | Không (ẩn) | Có theo giấy phép Creative Commons từng bài (đã có mã ghi nguồn) | Có trong mã, nhưng đang ẩn | Không cần làm trước khi nộp nếu Nhạc vẫn ẩn |
| **OpenAI** (nhà cung cấp AI) | Đã có màn đồng ý chia sẻ dữ liệu | — | Không phải nội dung hiển thị | Màn đồng ý nêu «OpenAI» | — |

## 2. Dòng OSM phải nằm ở đâu (đặc tả, chưa làm)

Dữ liệu OSM ở đây là **danh sách địa điểm và tên khu vực**, không phải bản đồ. Theo hướng dẫn OSM đã đọc, chỗ tối thiểu là thông tin của sản phẩm (không cần ở mỗi kết quả). Đề xuất theo thứ tự ít công nhất:

1. **iOS — Cài đặt → «Giới thiệu / Nguồn dữ liệu»** (hoặc ngay dưới các dòng pháp lý đã có): một dòng «Dữ liệu địa điểm: © OpenStreetMap contributors (ODbL)» là liên kết tới `https://www.openstreetmap.org/copyright`. Thêm khoá chuỗi vi/en. Nhỏ (≈1 màn hình + 2 chuỗi), **cần build mới**.
2. **Thẻ địa điểm lấy từ OSM**: hiển thị chữ nhỏ «© OpenStreetMap» khi `source` của dòng chứa OpenStreetMap (server đã gắn `source`, xem `PlacesModels.swift:56`). Cách này đúng tinh thần «ghi nguồn gần dữ liệu» nhất. Cần xác nhận server có luôn trả `source` cho dòng OSM không (web).
3. **Trang web `/terms` hoặc `/privacy`**: thêm một đoạn «Dữ liệu bản đồ» với cùng dòng và liên kết (mọi nền tảng dùng chung, không cần build).

Việc 1 + 3 là **tối thiểu bắt buộc theo em hiểu**; việc 2 là tốt hơn. Chưa chắc việc dùng Overpass trong thẻ có tạo «cơ sở dữ liệu phái sinh» theo ODbL hay không → **hỏi người am hiểu luật** (nếu có, nghĩa vụ chia sẻ lại sẽ nặng hơn ghi nguồn).

**Rủi ro thứ hai (không phải ghi nguồn)**: chính sách Nominatim giới hạn 1 yêu cầu/giây; máy chủ gọi Nominatim thay cho mọi người dùng từ cùng một địa chỉ. Web trình duyệt gọi từ máy người dùng thì ổn. → web kiểm lưu đệm và tốc độ gọi trên server (`food.ts` có ngân sách 2,5 giây; cần xác nhận có lưu đệm và gửi User-Agent nhận diện).

## 3. Content Rights — nội dung bên thứ ba thật sự hiển thị

| Loại nội dung | Nguồn | Quyền sử dụng | Chỗ chưa rõ |
|---|---|---|---|
| Tên, địa chỉ, giờ mở cửa quán từ OSM | OSM contributors | Có, theo ODbL **nếu ghi nguồn** (mục 1) | Hiện **chưa ghi nguồn** |
| Ảnh/giá/đánh giá địa điểm từ Serper (Google) | Chủ cơ sở / Google | **Chưa kiểm** | Quyền hiển thị lại ảnh và xếp hạng lấy qua API |
| Ảnh sản phẩm, giá, tên cửa hàng (mua sắm) | Cửa hàng/thương hiệu qua Serper Shopping | **Chưa kiểm** | Như trên; logo/tên thương hiệu đối tác dùng để chỉ dẫn, nên kiểm quy định nhãn hiệu |
| Logo sàn/đối tác (Shopee, TikTok Shop, Booking, Agoda…) | Thương hiệu | **Chưa kiểm** giấy phép dùng logo; mã Android có `BrandLogo.kt` | Dùng logo chữ/biểu tượng chính thức hay tự vẽ? |
| Ảnh và clip người dùng đăng (Khám phá, Hồ sơ) | Người dùng | Cần điều khoản người dùng cấp quyền cho TappyAI; **bản `/terms` trong nhánh này chỉ có 6 mục ngắn, không có điều khoản giấy phép nội dung người dùng** (đọc `src/app/terms/page.tsx`); `legal.ts` của rc/web-uat chỉ có đoạn cấp quyền cho **âm thanh gốc** (`legal.ts:235`) | Có điều khoản cấp quyền cho ảnh/clip/bình luận không? — cần web xác nhận trên bản `/terms` mới của rc/web-uat 9474f65 (em chưa đọc bản đó) |
| Clip/liên kết YouTube, TikTok người dùng gắn | Chủ kênh | **Chưa kiểm** điều khoản nhúng | iOS nhúng hay chỉ mở liên kết? |
| Tóm tắt 25 kịch bản của Bộ Công an | Bộ Công an | **Chưa kiểm** | Có ghi nguồn và liên kết gốc (tốt); chưa rõ sao chép nguyên đoạn |
| Bài viết VnExpress làm căn cứ | VnExpress | **Chưa kiểm** | Có hiện nguồn cho người dùng không |
| Ảnh minh hoạ do công cụ AI tạo (mascot Tappy, ảnh thẻ, kế hoạch) | TappyAI tự tạo / công cụ AI | Phụ thuộc điều khoản công cụ đã dùng — **chưa kiểm** ở đây (em không biết công cụ nào đã tạo tệp trong `Assets.xcassets`) | Huy xác nhận: ai tạo, công cụ nào, có giấy phép thương mại không |
| Nhạc (Jamendo) | Nghệ sĩ CC | Có theo giấy phép từng bài, nhưng **đang ẩn** | Không ảnh hưởng bản nộp |

**Gợi ý cho ô Content Rights (Huy quyết, em không điền):** vì app hiển thị nội dung bên thứ ba, đáp án gần đúng nhất là «Có», kèm cam kết có quyền hoặc được cấp phép. Nên trả lời «Có» **chỉ khi** các dòng «chưa kiểm» ở trên đã được người am hiểu xem. Nếu chưa chắc về ảnh Serper hoặc logo, đó là chỗ App Review có thể hỏi (guideline 5.2 về sở hữu trí tuệ).

## 4. Có nghĩa vụ ghi nguồn nào đang thiếu không?

- **Có một nghĩa vụ chắc chắn: OpenStreetMap.** App hiển thị dữ liệu OSM (khi nguồn chính không đủ) mà không có dòng ghi nguồn ở đâu cả. Nên làm **trước khi nộp**.
- Công làm (iOS): thêm dòng ghi nguồn có liên kết trong Cài đặt (+ tuỳ chọn trên thẻ địa điểm có `source` OSM) ≈ nửa buổi, **cần build mới**. Công web: thêm đoạn ở `/privacy` hoặc `/terms` (không cần build app). Android: dòng tương tự trong Cài đặt.
- Các nguồn còn lại: **chưa kiểm** — không khẳng định đang thiếu.
