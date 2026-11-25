# Tappy và pháp luật Việt Nam về nền tảng trực tuyến — hiện trạng kiểm duyệt (25/11/2026)

**Quan trọng:** bản tra cứu luật dưới đây lấy từ **báo chí và cổng thông tin cơ quan công an**, KHÔNG phải từ văn bản gốc (các agent tra cứu không đọc được PDF gốc của Nghị định 147/2024, và trang về mức phạt từ 01/07/2026 trả 404). Số điều, mức phạt và hiệu lực chuyển tiếp cần **luật sư xác nhận trên văn bản gốc** trước khi dựa vào. Đây không phải tư vấn pháp lý.

## 1. Khung luật (theo nguồn thứ cấp, CHƯA xác minh với văn bản gốc)

| Nội dung | Điều đã biết | Nguồn |
|---|---|---|
| Luật An ninh mạng 2025 (Luật 116/2025/QH15), hiệu lực **01/07/2026**, 45 điều, hợp nhất phần còn phù hợp của Luật An toàn thông tin mạng 2015 và Luật An ninh mạng 2018 | Doanh nghiệp viễn thông, internet, mạng xã hội phải gỡ/xử lý thông tin vi phạm trong **24 giờ** kể từ yêu cầu hợp pháp của cơ quan có thẩm quyền; tình huống khẩn cấp đe dọa an ninh quốc gia: **6 giờ**; phải chủ động xây dựng **bộ lọc ngăn chặn vi phạm**; bảo vệ trẻ em ngay từ khâu thiết kế, **tự động quét, phát hiện, chặn** nội dung hại trẻ em; phối hợp với cơ quan có thẩm quyền | congan.phutho.gov.vn, congan.quangtri.gov.vn, vietnamnet.vn, vtv.vn |
| Nghị định 147/2024/NĐ-CP (hiệu lực 25/12/2024) | Gỡ nội dung vi phạm trong **24 giờ** khi cơ quan có thẩm quyền yêu cầu, **48 giờ** khi người dùng khiếu nại có căn cứ; phải có **kênh tiếp nhận báo cáo** của người dùng; **xác thực tài khoản bằng số điện thoại** (hoặc căn cước) mới được đăng bài, bình luận, livestream, chia sẻ; khóa tài khoản tạm thời 7–30 ngày khi vi phạm từ 5 lần/30 ngày hoặc 10 lần/90 ngày bị yêu cầu gỡ; khóa vĩnh viễn khi đe dọa an ninh quốc gia hoặc bị khóa tạm từ 3 lần; **giấy phép** khi cung cấp livestream hoặc hoạt động tạo doanh thu | vtv.vn, kinhtedothi.vn (không có số điều) |
| Luật An ninh mạng 2018, Điều 16 (đã được hợp nhất/thay thế từ 01/07/2026, chưa rõ chuyển tiếp) | Cấm: tuyên truyền chống Nhà nước, kích động bạo loạn/phá rối an ninh, làm nhục/vu khống, thông tin bịa đặt gây hoang mang, xâm phạm trật tự quản lý kinh tế | luatminhkhue.vn, vietnamnet.vn |
| Mức phạt | Nghị định 15/2020 (sửa đổi bởi 14/2022): tổ chức 10–30 triệu đồng cho các hành vi trên mạng xã hội (cá nhân bằng 50%); nguồn báo chí nói **mức phạt tăng mạnh từ 01/07/2026** theo Nghị định 174/2026/NĐ-CP — **chưa đọc được nội dung, chưa biết mức cho nền tảng** | thuvienphapluat.vn, daibieunhandan.vn (mâu thuẫn nhau) |

## 2. Việc ĐÃ làm (code, đã kiểm trên UAT với mô hình thật)

**Cổng kiểm duyệt tự động, không cần người duyệt** (`src/lib/safety/autoModeration/`): kiểm trước khi lưu, chặn chặt, **lỗi hoặc không xác định được thì KHÔNG đăng** (fail-closed).
- **Chữ:** bài đánh giá/bài đăng (nội dung, hashtag, tên địa điểm), bình luận, tên và giới thiệu hồ sơ, tên nhóm và thông tin thành viên nhóm, kế hoạch du lịch chia sẻ.
- **Ảnh:** ảnh hồ sơ, ảnh bìa, ảnh bài đánh giá, ảnh nhóm (mô hình nhìn ảnh).
- **Hai lớp:** (1) danh sách cụm từ tiếng Việt rõ ràng (khiêu dâm, trẻ em, cờ bạc, bán ma túy/vũ khí, lăng mạ/kêu gọi lật đổ…), chạy trước, không gọi mô hình; (2) mô hình phân loại theo 10 nhóm: khiêu dâm, an toàn trẻ em, chống phá Nhà nước, chia rẽ/thù ghét, bạo lực/khủng bố, thông tin sai, lừa đảo, cờ bạc, ma túy, bôi nhọ/lộ thông tin cá nhân. Ngưỡng tin: trẻ em 0,3; thông tin sai 0,75; còn lại 0,6–0,65.
- **Chống dò bộ lọc:** quá 10 lần bị chặn trong một ngày thì khoá đăng nội dung đến hết ngày.
- Thông báo cho người dùng không nêu từ khoá/luật nào bị vi phạm. Nhật ký chỉ ghi chỗ đăng, kết quả, nhóm — **không ghi nội dung**.
- Cờ `AUTO_MODERATION_ENABLED`: **bật** trừ khi đặt đúng `false`.
- **Kiểm trên UAT với mô hình thật (ĐÃ KIỂM):** chặn đúng khiêu dâm, kêu gọi lật đổ/bạo loạn, tin đồn gây hoảng loạn (nước Hà Nội bị đầu độc), quảng cáo cờ bạc, dịch vụ tình dục, quảng cáo lừa đảo nhiệm vụ nhận tiền, "thần dược" chữa ung thư, kích động thù ghét dân tộc, đe dọa đốt nhà giết người, lộ CCCD/địa chỉ kèm xúi đòi nợ, nội dung gợi dục trẻ em; cho đăng đúng: bình luận thường, góp ý chính sách, tin báo chí về bắt giữ, cảnh báo lừa đảo có trích khẩu hiệu lừa đảo, khuyến cáo y tế, bài giáo dục giới tính, chuyện bầu cử, đi thăm Dinh Độc Lập.

## 3. Việc CHƯA làm hoặc cần quyết (nói thẳng)

1. **Xác thực số điện thoại để đăng bài** (Nghị định 147): CHƯA có. Hiện đăng nhập bằng email/Google/Zalo/Apple, không bắt xác thực số điện thoại. Nếu luật áp dụng cho Tappy thì đây là thiếu sót lớn (cần nhà cung cấp SMS/OTP và thay đổi đăng ký). Cần luật sư xác nhận Tappy có thuộc đối tượng.
2. **Giấy phép mạng xã hội / thiết lập trang thông tin điện tử:** Tappy có clip, bài đăng, nhắn tin, nhóm — có dấu hiệu của dịch vụ mạng xã hội. Điều kiện cấp phép và ngưỡng người dùng: **chưa xác minh**; cần luật sư xem Tappy có phải xin giấy phép không trước khi mở cho đông người dùng.
3. **Quy trình xử lý yêu cầu gỡ nội dung của cơ quan chức năng (24 giờ; 6 giờ khẩn cấp):** ĐÃ CÓ phần lõi (commit `83d83e7`, xem `docs/legal/QUY-TRINH-GO-BAI-THEO-YEU-CAU-20261125.md`): sổ yêu cầu có đồng hồ, gỡ bài/bình luận/kế hoạch/khoá tài khoản, bản sao nội dung, cảnh báo và theo dõi hạn; nằm sau `MODERATION_ADMIN_ENABLED` (mặc định tắt, phải bật trên production) và cần migration `20261209`. **CHƯA có giao diện quản trị** (chỉ API), chưa công bố đầu mối tiếp nhận, chưa có người trực 24/7 (công cụ chỉ báo, không tự gỡ).
4. **Kênh báo cáo và hạn 48 giờ** cho khiếu nại của người dùng: có báo cáo bài viết với mốc 24 giờ (đợt Apple 1.2) nhưng phụ thuộc cờ tắt; tự ẩn bài khi đủ 3–5 người báo cáo không áp cho báo cáo "thông tin sai".
5. **Khoá tài khoản khi tái phạm (5/30 ngày, 10/90 ngày) và khoá vĩnh viễn:** hiện chỉ có thang cảnh cáo trong `communityRules.ts` (cấm ở 5 cảnh cáo) và khoá trong ngày của cổng tự động.
6. **Tin nhắn riêng:** chữ không bị quét (quyền riêng tư thư tín); ảnh trong tin nhắn đang quét bằng OpenAI Moderations — **khoá OpenAI đang thiếu quyền Moderations nên mọi ảnh tin nhắn bị từ chối**, và mọi clip chuyển sang duyệt tay.
7. **Clip (đã làm 25/11/2026, commit `d7510ea`):** kiểm duyệt clip TỰ ĐỘNG HOÀN TOÀN, không người duyệt. Khung hình, lời nói (đã chuyển thành chữ) và chữ chèn trên clip được lọc bằng bộ lọc luật Việt Nam của mục 2 (không phụ thuộc OpenAI Moderations). Clip sạch → "Sẵn sàng đăng"; mọi trường hợp trước đây chờ người duyệt (điểm cao, điểm lưng chừng, thiếu bằng chứng, nhà cung cấp lỗi sau 4 lần thử) → **bị từ chối**, tác giả chọn clip khác; riêng ca liên quan trẻ em vẫn bị giữ khẩn cấp + lưu giữ pháp lý 365 ngày, không bao giờ đăng. Cờ `VIDEO_MODERATION_AUTOMATED` (bật trừ khi đặt đúng `false`); cần `EXPLORE_VIDEO_PIPELINE_ENABLED=true` và `VIDEO_SPEECH_TRANSCRIBE_ENABLED=true` (clip có tiếng mà không đọc được lời thì bị từ chối). ĐÃ KIỂM thật trên UAT (giao diện thật, hạ tầng GCS/Transcoder UAT, mô hình thật): clip bình thường được duyệt; clip có lời quảng cáo cờ bạc bị từ chối; clip có hình quảng cáo cờ bạc (tiếng bình thường) bị từ chối. CHƯA kiểm: clip dài, nhiều cảnh, tiếng Việt thật (giọng thử là tiếng Anh), hình ảnh nhạy cảm thật (em không tạo), phát lại qua CDN thật.
8. **Chat AI (trợ lý):** chưa có lớp lọc đầu vào/đầu ra theo luật Việt Nam; chỉ trông vào mô hình.
9. **Ảnh có chữ nhỏ, hoạt họa, ảnh ghép** và nội dung tiếng lóng/viết tắt/tiếng dân tộc: bộ lọc có thể bỏ sót. Máy không thay được người duyệt; tỷ lệ bỏ sót và chặn nhầm chưa đo trên dữ liệu thật.
10. **Chính sách quyền riêng tư:** cần thêm một dòng nói rõ bài đăng công khai được hệ thống AI kiểm tra tự động (nhà cung cấp AI xử lý văn bản/ảnh sắp đăng). Chưa sửa trang pháp lý.
11. **Lưu nhật ký phục vụ điều tra** (luật yêu cầu lưu nhật ký hệ thống): chưa rà.

## 4. Cấu hình cần đặt khi lên production
- `AUTO_MODERATION_ENABLED` để trống hoặc `true` (không đặt `false`).
- Các biến AI đã có cho vai trò `intent` (mô hình nhỏ phân loại) và, cho ảnh, một mô hình có khả năng đọc ảnh; có kho dùng chung (`KV_REST_*`) để bộ đếm khoá trong ngày dùng chung giữa các máy.
- Bật `REPORTS_ENABLED`, `USER_BLOCKS_ENABLED`, `MODERATION_ADMIN_ENABLED` (đã có trong checklist deploy).
- Cấp quyền Moderations cho khoá OpenAI (ảnh tin nhắn, clip).
- Chi phí: mỗi lần đăng chữ/ảnh một lần gọi mô hình nhỏ (đã có nhật ký `tappyai_auto_moderation`); theo dõi sau deploy.
