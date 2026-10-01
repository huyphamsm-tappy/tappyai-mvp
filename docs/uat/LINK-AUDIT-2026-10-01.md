# LINK-AUDIT — mọi luồng sinh link nào, đích cuối là trang nào (UAT, 01/10/2026)

Nguồn: chạy thật trên UAT (tài khoản test, mobile 390 px), mở từng link, chụp trang đích. Ảnh ở **private**
`gs://tappyai-uat-evidence/evidence/<SHA>/links/` (không đưa vào git). Mức chính xác: **(a)** trang cụ thể (+tham số nếu trang cho phép);
**(b)** trang kết quả tìm kiếm đúng từ khoá; **(c)** không có link, nói thật + hỏi lọc. "TRK" = ACCESSTRADE + sub1 (qua `/go/at`); "thường" = link trực tiếp.
Ghi chú chung: link `/go/at` mở được (302 → ACCESSTRADE → trang đích); lần đầu tôi tưởng nó về trang chủ vì tự cắt URL khi mở — không phải lỗi sản phẩm.
Mặc định KHÔNG kiểm link còn sống lúc chạy; "chưa kiểm" ghi rõ chỗ không mở được.

| Luồng (câu gõ) | Link hiện ra | Đích cuối thực tế | Tracking | Mức |
|---|---|---|---|---|
| Ăn uống («quán phở ngon quận 1…») | Xem bản đồ · website quán · GrabFood | Google Maps của quán · website quán (vd. phohung.vn — **trang Wix "Reconnect Your Domain"**, tên miền chết, dữ liệu Maps của quán) · `food.grab.com/vn/vi/restaurants?search=<tên quán> quan 1` (headless bị CloudFront chặn → **chưa kiểm** trang đích) | thường | (a) Maps · (b) Grab |
| Mua sắm («tai nghe bluetooth chống ồn dưới 2tr») | thẻ sản phẩm: Lazada · CellphoneS · Shopee · Google | Lazada: `lazada.vn/catalog/?q=<tên SP>` (trang kết quả tìm kiếm) · CellphoneS: **trang sản phẩm** `cellphones.com.vn/tai-nghe-…html` · Shopee: trang sản phẩm `…-i.<shop>.<item>` (headless bị `shopee.vn/verify/traffic/error` → **chưa kiểm** trang đích thật) · Google: Google Shopping `ibp=oshop` (headless bị CAPTCHA) | Lazada, CellphoneS = TRK; Shopee, Google = thường | CellphoneS (a), Shopee (a), Lazada (b), Google (b, không phải sàn) |
| Phụ kiện («ốp lưng iPhone 15 Pro chống sốc dưới 300k») | CellphoneS · Lazada · Shopee | CellphoneS trang SP `op-lung-iphone-15-pro-max-slimcase…` · Lazada trang SP `/products/op-lung-iphone-15-pro-max…-i<id>.html` · Shopee trang SP | CellphoneS, Lazada = TRK | (a) |
| Kính cường lực («kính cường lực iPhone 15 Pro full màn hình dưới 200k») | Shopee · Lazada · Google | Shopee trang SP «Kính cường lực iPhone 15 series SLIMCASE» · Lazada `catalog/?q=Dán kính cường lực màn hình iPhone 15 Pro` | Lazada = TRK | (a) Shopee · (b) Lazada |
| Vé máy bay («vé máy bay TP.HCM đi Đà Nẵng cuối tuần này 2 người») | Trip.com · Traveloka | Trip.com `vn.trip.com/flights/showfarefirst?dcity=sgn&acity=dad&ddate=2026-10-03&flighttype=ow&class=y&quantity=<n>` · Traveloka `/vi-VN/flight/fullsearch?ap=SGN.DAD&dt=03-10-2026.null&ps=<n>.0.0&sc=ECONOMY` | TRK cả hai | (a) điểm đi/đến + ngày; **số người đã được truyền từ 01/10** (trước đó luôn `quantity=1`/`ps=1`) |
| Khách sạn («khách sạn Đà Nẵng cuối tuần này 2 người…») | Booking · website KS · Trip.com · Maps | Booking `searchresults.vi.html?ss=<KS+thành phố>` (trước 01/10 **không có ngày/số khách**; nay có ngày nhận/trả phòng khi người dùng nói "cuối tuần") · website khách sạn (vd. santaluxuryhotel.com → mở bình thường) · Trip.com **trang chi tiết KS** `vn.trip.com/hotels/detail/?hotelId=117011133` | Trip.com = TRK; Booking thường | Trip.com (a) · Booking (b) · website (a) |
| Tour / hoạt động («tour khám phá Hội An 1 ngày…») | **hiện KHÁCH SẠN** (Anio Boutique Hotel…) | — | — | **Sai luồng** — xem PL-TOUR-KLOOK |
| Xe khách («vé xe khách Sài Gòn đi Đà Lạt…») | **không có link** | — | — | (c) — nói thật "chưa có nhà xe/giá"; không có thẻ xe (Vexere chỉ có trang chủ, depth 0) |
| Rạp / xem phim («rạp chiếu phim gần Quận 1…») | Maps · website rạp (galaxycine.vn, cgv.vn trang rạp) | Galaxy Cinema trang chủ (`galaxycine.vn/` → 302 loop với curl, mở được bằng trình duyệt) · CGV trang rạp `cgv-vincom-dong-khoi` | thường (CGV ACCESSTRADE chưa duyệt) | (a) CGV · Galaxy trang chủ rạp |
| «Có phim gì hay» | 5 link **trang phim đang chiếu** chính thức: CGV, Galaxy, Lotte, BHD, Beta | đều mở được (200) 01/10 | thường | (a) — không có danh sách phim thật (PL-MOVIES) |
| Spa («massage thư giãn quận 1…») | Maps · website · Zalo · Klook · Google Maps search | website spa · Klook trang hoạt động `klook.com/…/activity/212930-charm-garden-spa…` · Zalo `zalo.me/<sđt>` (→ trang đăng nhập Zalo) | Klook = TRK (bản `/go/at` + bản thường cùng hiện) | (a) |
| Karaoke («karaoke quận 1 cho 4 người tối nay») | Maps · website quán · TikTok/Facebook/YouTube tìm review | karaokeavatar.com, kingdomkaraoke.com (mở được) | thường | (a) |

## Việc tìm thấy (đã sửa / chưa sửa)
- **Đã sửa 01/10:** số người vào link vé máy bay; ngày vào link khách sạn (giả định đọc từ "cuối tuần", nói rõ trong câu trả lời); Luna không tự viết "tìm trên Shopee" (chỉ sàn mà code gắn link mới được nhắc).
- **Chưa sửa (backlog):** tour/hoạt động ra khách sạn (cần luồng Klook, link tìm kiếm Klook **chưa kiểm** vì Cloudflare chặn công cụ — PL-TOUR-KLOOK); xe khách không có link; link Google Shopping nằm cạnh link sàn (không phải sàn; log `shallow_commerce_link` đã đánh dấu "trung gian"); website quán chết (phohung.vn) — dữ liệu từ Google Maps, kiểm sống lúc chạy bị cấm theo quy tắc.
- **Đối tác đã duyệt có tracking:** Lazada, CellphoneS, Trip.com, Traveloka, Klook (thấy trong chạy thật). Shopee, Booking, Agoda, DMX, FPT: link thường (đúng quy tắc). Vietnam Airlines: có trong code (trang đặt vé chung, depth 1, **không điền sẵn** chặng/ngày) — không hiện trong chạy thật hôm nay. Vexere: chỉ trang chủ (depth 0) — không dùng.
