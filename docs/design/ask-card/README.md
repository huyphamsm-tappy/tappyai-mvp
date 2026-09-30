# Thẻ hỏi nhanh `[TAPPY_ASK]` — thiết kế mới (Huy, 30/09)

Ảnh mẫu: `ask-card-mockup.png` (nền tối). Mascot: `tappy-mascot-search.png` (Tappy cầm kính lúp, nền trong suốt,
đã cắt sát viền). Áp cho **cả web và Android**, **cả 5 mảng** (ăn uống, mua sắm, du lịch, giải trí, spa).

## 0. Nguyên tắc — KHÔNG đổi dữ liệu

- Server **không đổi**: `[TAPPY_ASK]{"v":1,"questions":[{id,q,options[≤4]}]}[/TAPPY_ASK]` như hiện nay.
- Thứ gửi lên **không đổi dạng**: câu trả lời vẫn là MỘT tin nhắn chữ của người dùng (`composeAskAnswer`):
  các câu theo thứ tự, nối bằng `" · "`, ý khác (nếu có) nối cuối. Chỉ thêm: câu **loại** chọn được nhiều →
  các lựa chọn của câu đó nối bằng `", "` (vd `Karaoke, Xem phim · Một mình · Tối nay · muốn chỗ chill`).
- Mọi thứ mới trên thẻ (số thứ tự, dòng phụ, icon, ô có ảnh, chọn nhiều) **suy ra từ `id` + chữ câu hỏi +
  chữ lựa chọn** theo bảng dưới — hai client dùng CÙNG bảng để thẻ giống nhau.

## 1. Bố cục (theo ảnh mẫu, từ trên xuống)

1. **Đầu thẻ**: mascot `tappy-mascot-search` bên trái; tiêu đề **«Tìm gì cho bạn hôm nay?»**; dòng phụ
   **«Chọn nhanh vài thứ, Tappy sẽ tìm phần còn lại.»**. (Câu dẫn của server — `lead`, vd «Để mình chọn đúng
   quán cho bạn:» — vẫn hiện ở bong bóng chữ phía trên thẻ như hiện nay.)
2. **Mỗi câu hỏi** (tối đa 3): huy hiệu số tròn xanh **1 / 2 / 3**, tiêu đề = `q` (nguyên văn server), dòng phụ theo
   loại câu (mục 2), rồi các ô lựa chọn:
   - câu **LOẠI** → ô **có ảnh** (lưới 3 cột trên web rộng / 2 cột trên điện thoại hẹp), ảnh phủ ô, nhãn + icon ở dải
     tối dưới ảnh; **chọn nhiều**.
   - các câu khác → ô **có icon** (icon trên, nhãn dưới), 1 hàng (tối đa 4 ô); **chọn một** (bấm lại để bỏ).
   - ô đang chọn: viền xanh `#3B82F6` sáng + nền xanh mờ + dấu ✓ tròn ở góc trên phải.
3. **Ô ý khác**: icon bong bóng chat, chữ mờ **«Hoặc nói thêm ý khác…»**, dòng gợi ý **«Ví dụ: muốn chỗ chill, ít ồn,
   có view đẹp...»**, nút tròn gửi (máy bay giấy) bên phải — gửi giống nút «Tìm cho tôi».
4. **Nút «Tìm cho tôi»** (✦ + chữ), gradient xanh, rộng hết thẻ — bật khi đã chọn ít nhất 1 ô hoặc gõ ý khác.

## 2. Loại câu hỏi — `id` trước, không khớp thì chữ `q` (so sau khi bỏ dấu, chữ thường, khớp cả từ)

Danh sách `id` lấy từ các câu hỏi THẬT của server (§10, 30/09, 15 kịch bản × 5 mảng).

| Loại | `id` | chữ `q` chứa (bỏ dấu) | Dòng phụ | Chọn | Ô |
|---|---|---|---|---|---|
| LOẠI | `activity` `dish` `style` `service` `line` `purpose` `type` `kind` `genre` `artist` `cuisine` `category` `product` `loai` `mon` | lam gi, choi gi, loai, the loai, kieu, mon, thich gi, hoat dong, dich vu, ca si, dong nao | Chọn một hoặc nhiều | **nhiều** | có ảnh (§3) |
| AI ĐI | `party` `people` `group` `pax` | may nguoi, voi ai, bao nhieu nguoi | Chọn nhóm phù hợp | một | icon: «đông»/«nhóm bạn» → nhóm lớn · «gia đình» → gia đình · «3»/«nhóm» → nhóm nhỏ · «2» → 2 người · còn lại → 1 người |
| KHI NÀO | `time` `date` `when` `day` | luc nao, khi nao, thoi diem, hom nao, ngay nao, may gio, buoi nao | Chọn thời điểm | một | icon: tối/đêm → trăng · sáng/trưa/chiều → mặt trời · cuối tuần/tuần/tháng/ngày/mai/hôm nay → lịch · còn lại → đồng hồ |
| Ở ĐÂU | `area` `origin` `place` `district` `where` | khu vuc, o dau, xuat phat | Chọn khu vực | một | icon ghim |
| NGÂN SÁCH | `budget` `price` | bao nhieu, gia, ngan sach, tam | Chọn mức giá | một | icon tiền |
| KHÁC | còn lại (vd `vibe` `must` `condition`) | | (không có) | một | icon chung |

Lựa chọn «chưa biết / không quan trọng / gì cũng được / tuỳ / đều được / chưa chốt / nơi khác» → icon dấu hỏi, không ảnh.

## 3. Ảnh ô LOẠI — khoá `diem-<loai>` qua manifest ảnh loại điểm (R22), KHÔNG tự chọn ngẫu nhiên

Luật đầu tiên có từ khớp (bỏ dấu, khớp cả từ) trong chữ lựa chọn thắng; khoá tra `GET /api/plan-images/manifest`
như thẻ kế hoạch; khoá chưa có ảnh (hiện tại: tất cả) → ảnh giữ chỗ gradient theo MẢNG của luật + icon.
Không khớp luật nào → ảnh giữ chỗ theo mảng của thẻ + icon chung.

| Từ (bỏ dấu) | Khoá | Icon | Mảng (màu giữ chỗ) |
|---|---|---|---|
| karaoke | `diem-karaoke` | nốt nhạc | giải trí |
| phim, rap phim, cinema | `diem-rap-phim` | phim | giải trí |
| bar, pub, bia, beer, cocktail | `diem-bar` | ly | giải trí |
| bida, bowling, billiard | `diem-bida` | bia bắn | giải trí |
| khu vui choi | `diem-khu-vui-choi` | gia đình | giải trí |
| cong vien | `diem-cong-vien` | công viên | giải trí |
| thuy cung, bao tang | `diem-bao-tang` | bảo tàng | giải trí |
| ca phe, cafe, coffee, tra | `diem-ca-phe` | tách | ăn uống |
| hai san | `diem-hai-san` | hải sản | ăn uống |
| lau, nuong, bbq | `diem-lau-nuong` | bếp nướng | ăn uống |
| nhat, han, sushi | `diem-mon-nhat-han` | bát | ăn uống |
| mon viet, pho, bun, com, binh dan | `diem-mon-viet` | bát | ăn uống |
| an uong, am thuc, nha hang, an | `diem-an-uong` | dao nĩa | ăn uống |
| son gel, dap bot, mong, nail, dinh da | `diem-nail` | móng | spa |
| cham soc da, lam dep, skincare | `diem-lam-dep` | làm đẹp | spa |
| spa, massage, goi dau, goi, xong hoi | `diem-spa` | spa | spa |
| nghi duong, resort | `diem-nghi-duong` | nghỉ dưỡng | du lịch |
| bien | `diem-bien` | biển | du lịch |
| nui, trekking, cam trai | `diem-nui` | núi | du lịch |
| cong nghe, gaming, laptop, dien thoai | `diem-cong-nghe` | công nghệ | mua sắm |
| mua sam, shop, mall, cho, do | `diem-mua-sam` | túi | mua sắm |
| nhac, concert, show, live, pop, rap, indie, acoustic, hip hop | `diem-am-nhac` | micro | giải trí |

Mã tham chiếu Android (dùng để đối chiếu từng chữ): `android/app/src/main/java/com/tappyai/app/chat/ask/AskCardModel.kt`.

## 4. Kiểm (cả hai client)

- 5 mảng: ảnh chụp thẻ cạnh `ask-card-mockup.png` (Android: `D:/TappyAI-backups/android-parity-evidence/ask-card-v2-*/`).
- Chọn nhiều ở câu LOẠI → tin nhắn gửi đi có `", "` trong phần câu đó; các câu khác vẫn `" · "`; không có câu nào
  chọn mà có ý khác → chỉ gửi ý khác.
- Web giữ `data-ask-option="<id>"` / `data-ask-send`; Android giữ testTag `ask-card`, `ask-send`, `ask-free-text`.

## 5. R23.1 — bổ sung khi làm bản web (30/09, theo lời owner) — ÁP CHO CẢ ANDROID

Các mục trên giữ nguyên; chỉ những điểm sau đổi/bổ sung. Web: `src/lib/structuredContent/askCardModel.ts` (bảng) +
`src/components/chat/AskCard.tsx` (giao diện); test `askCardModel.test.ts`, `AskCard.test.tsx`.

1. **Tiêu đề / dòng phụ theo mảng** (owner: «tiêu đề/phụ đề/câu hỏi theo từng mảng»). Mảng suy từ `id` câu hỏi:
   `dish`/`mode` → ăn uống · `service`/`special` → spa · `activity`/`vibe`/`artist` → giải trí ·
   `date`/`origin`/`transport` → du lịch · `line`/`must`/`condition`/`purpose` → mua sắm · chỉ có `style` → spa nếu
   lựa chọn là massage/nail/tóc…, ngược lại du lịch · câu có «mỗi đêm» hoặc nhóm «Gia đình/Nhóm bạn» → du lịch · còn lại → chung.

   | Mảng | Tiêu đề | Dòng phụ | Gợi ý ô ý khác |
   |---|---|---|---|
   | giải trí, chung | Tìm gì cho bạn hôm nay? | Chọn nhanh vài thứ, Tappy sẽ tìm phần còn lại. | Ví dụ: muốn chỗ chill, ít ồn, có view đẹp... (chung: gần nhà, giá vừa phải...) |
   | ăn uống | Hôm nay ăn gì nhỉ? | Chọn nhanh vài thứ, Tappy sẽ tìm quán hợp nhất. | Ví dụ: không cay, có chỗ đậu ô tô... |
   | mua sắm | Bạn đang tìm món gì? | Chọn nhanh vài thứ, Tappy sẽ lọc giúp bạn. | Ví dụ: màu xanh, bảo hành chính hãng... |
   | du lịch | Chuyến đi thế nào đây? | Chọn nhanh vài thứ, Tappy sẽ lên phương án. | Ví dụ: có hồ bơi, gần biển, cho trẻ nhỏ... |
   | spa | Thư giãn kiểu nào hôm nay? | Chọn nhanh vài thứ, Tappy sẽ tìm chỗ hợp nhất. | Ví dụ: kỹ thuật viên nữ, phòng riêng... |

2. **Id LOẠI thêm `dish` và `service`** (router gửi đúng hai id này cho câu «Món gì / kiểu quán?» và «Muốn làm dịch vụ gì?»).
3. **Khoá ảnh theo tên owner đặt** (thay các khoá §3 tương ứng): bar/pub/bia/beer/cocktail → `diem-bar-rooftop`;
   cà phê/cafe/trà → `diem-cafe`; món việt/phở/bún/cơm và ăn/món/ẩm thực/nhà hàng → `diem-quan-an`;
   bowling → `diem-bowling` (bida/billiard vẫn `diem-bida`); nail/móng → `diem-nail` (spa/massage/gội vẫn `diem-spa`).
   Thứ tự dòng = thứ tự bảng §3 (dòng đầu khớp thắng: «Bida/bowling» → `diem-bida`, «Cafe/rooftop» → `diem-cafe`).
   Lựa chọn không khớp dòng nào → khoá giữ chỗ **cùng tên** `diem-<chữ-không-dấu-nối-gạch>` (vd «Dạo phố» → `diem-dao-pho`).
4. **Từ trùng khi bỏ dấu — so CÓ dấu**: rạp (≠ rap), trà (≠ trả), lẩu (≠ lâu), nhật/hàn, phở/bún/cơm/ăn/món (≠ phố…),
   chợ (≠ cho), đồ (≠ đỏ). Các từ còn lại so bỏ dấu, nguyên từ (không khớp giữa từ).
5. **Không chọn gì vẫn gửi được**: nút «Tìm cho tôi» luôn bật; không chọn, không gõ → gửi đúng chữ `Tìm cho tôi`.
   Sau khi gửi: nút thành «Đang tìm…», cả thẻ khoá (không gửi lần 2).
6. **Icon**: AI ĐI — lựa chọn có «3»/«nhóm»/«đông»/«gia đình» → nhóm; «2» → 2 người; còn lại → 1 người.
   KHI NÀO — «tuần/tháng/ngày/chưa chốt/3N2Đ» → lịch; «tối/đêm» → trăng; «sáng/trưa/chiều» → mặt trời.
   KHÁC (tuỳ chọn) — quận/gần/TP/Hà Nội/Đà Nẵng/nơi khác → ghim bản đồ; máy bay; xe khách/tàu → xe buýt;
   xe riêng/ô tô → ô tô; giao/ship → xe máy; tại quán → cửa hàng; còn lại icon chung ✦.
7. **Lưới**: câu LOẠI 3 lựa chọn → 3 cột; 4 lựa chọn → 2×2 trên điện thoại, 1 hàng 4 ô trên màn rộng; 2 → 2 cột.
   Câu icon 4 lựa chọn: icon trên nhãn dưới (4 cột); 2–3 lựa chọn: icon cạnh nhãn, 1 hàng (như mockup «Chiều nay / Tối nay / Cuối tuần»).
8. **Ảnh giữ chỗ**: gradient theo mảng (giải trí tím, ăn uống cam, mua sắm xanh ngọc, du lịch xanh biển, spa hồng,
   chung xanh dương) + icon mờ giữa ô + dải nhãn dưới — giống ô có ảnh thật.
9. **Mascot trong app**: web `public/tappy/mascot-search.png` (172×192, thu nhỏ từ `tappy-mascot-search.png`), hiện 62×69.
