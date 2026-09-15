import type { KnowledgeDataset, KnowledgeSource, OfficialGroup, ScamScenario } from './types'

// Scam Shield · official anti-fraud knowledge — dataset "Bộ Công an · 25 kịch bản lừa đảo 2026".
//
// ============================================================================
// PROVENANCE (researched 2026-09-15)
// ============================================================================
// Source page: Cổng thông tin điện tử Bộ Công an, mục "Cảnh báo tội phạm":
//   "Nâng cao cảnh giác trước 25 kịch bản lừa đảo trên không gian mạng năm 2026" — 08/09/2026,
//   byline Trọng Nghĩa – Quang Khải, tagged "Công an Hà Nội".
// The article BODY names the 25 scenarios only by count and describes the 5 groups in prose. The 25
// are itemised in the infographic embedded in that article (hosted on bocongan.gov.vn, credited
// "Công an xã Bình Minh" in its header), titled "25 KỊCH BẢN LỪA ĐẢO TRÊN KHÔNG GIAN MẠNG NĂM 2026".
// Every `official.*` string below is a transcription of that infographic / article. The infographic
// numbers scenarios 1–25 in an order that does not follow the groups; the official numbers are kept.
//
// 🚨 `guidance.*` is TappyAI's, written from the official text. It is labelled as such in the UI and
// must never be shown as a quotation. Do not let a model rewrite either half.

const SOURCE: KnowledgeSource = {
  organization: 'Bộ Công an',
  title: 'Nâng cao cảnh giác trước 25 kịch bản lừa đảo trên không gian mạng năm 2026',
  url: 'https://bocongan.gov.vn/bai-viet/nang-cao-canh-giac-truoc-25-kich-ban-lua-dao-tren-khong-gian-mang-nam-2026-1788865614',
  mediaUrl: 'https://bocongan.gov.vn/media/bca-media/bocongan-ctv/bocongan-ctv/photo-library-20260908180627-9a930b4e-fc3f-46b4-b27e-22efa3289e70-download-3.png',
  publishedAt: '2026-09-08',
  verifiedAt: '2026-09-15',
}

const GROUPS: OfficialGroup[] = [
  {
    category: 'impersonation', officialNumber: 1, label: 'Mạo danh cơ quan nhà nước',
    description: 'Các đối tượng giả danh Công an, Viện kiểm sát, Tòa án, ngân hàng, nhà trường, bệnh viện, cơ quan bảo hiểm xã hội, điện lực, viễn thông hoặc sử dụng tin nhắn Brandname giả mạo để yêu cầu cung cấp thông tin cá nhân, mã OTP, mật khẩu tài khoản hoặc chuyển tiền với các lý do như “xác minh thông tin”, “xử lý vi phạm”, “thanh toán nợ cước”, “nhận hoàn tiền”, “nộp phạt nguội”...',
  },
  {
    category: 'ai_deepfake', officialNumber: 2, label: 'AI – Deepfake, DeepVoice',
    description: 'Lợi dụng công nghệ trí tuệ nhân tạo, các đối tượng tạo hình ảnh, video, giọng nói giả mạo người thân, bạn bè hoặc lãnh đạo cơ quan để vay tiền, yêu cầu chuyển khoản khẩn cấp. Một số trường hợp còn gọi điện thu thập mẫu giọng nói nhằm phục vụ cho việc giả mạo, lừa đảo trong tương lai.',
  },
  {
    category: 'investment_jobs', officialNumber: 3, label: 'Đầu tư, việc làm',
    description: 'Các đối tượng đăng quảng cáo “việc nhẹ lương cao”, tuyển cộng tác viên trực tuyến hoặc mời tham gia đầu tư chứng khoán, tiền số, ngoại hối với cam kết lợi nhuận hấp dẫn. Ban đầu, chúng cho rút tiền để tạo lòng tin, sau đó dụ dỗ nạp số tiền lớn rồi chiếm đoạt toàn bộ tài sản.',
  },
  {
    category: 'online_trading', officialNumber: 4, label: 'Mua bán trực tuyến',
    description: 'Thủ đoạn phổ biến là sử dụng biên lai chuyển khoản giả, giả danh người mua hoặc người bán để yêu cầu đặt cọc trước, lợi dụng các giao dịch thương mại điện tử nhằm chiếm đoạt tài sản của cả người mua và người bán.',
  },
  {
    category: 'data_theft', officialNumber: 5, label: 'Đánh cắp dữ liệu',
    description: 'Các đối tượng phát tán đường link giả mạo, mã QR độc hại, ứng dụng chứa mã độc hoặc phần mềm điều khiển từ xa để chiếm đoạt tài khoản mạng xã hội, tài khoản ngân hàng, thu thập thông tin cá nhân và tiếp tục thực hiện các hành vi lừa đảo khác.',
  },
]

/** Shared "never" list — the source's five prevention measures apply to every scenario. */
const NEVER_SHARE = 'Không cung cấp mã OTP, mật khẩu hay thông tin cá nhân cho người gọi/nhắn, dù họ xưng là ai.'
const REPORT_113 = 'Báo ngay cho Công an nơi gần nhất hoặc gọi 113 nếu nghi ngờ bị lừa.'

function scenario(
  officialNumber: number,
  category: ScamScenario['category'],
  attackerGoal: ScamScenario['attackerGoal'],
  official: ScamScenario['official'],
  guidance: ScamScenario['guidance'],
): ScamScenario {
  return { id: `bca-2026-${String(officialNumber).padStart(2, '0')}`, officialNumber, category, attackerGoal, official, guidance, source: SOURCE, verified: true, language: 'vi' }
}

const SCENARIOS: ScamScenario[] = [
  // ── Nhóm 2 · AI – Deepfake, DeepVoice ────────────────────────────────────
  scenario(1, 'ai_deepfake', 'payment_fraud',
    { title: 'Giả người thân qua video Deepfake', summary: 'Dùng hình ảnh giả để gọi video, viện lý do cần tiền gấp và đề nghị chuyển khoản.' },
    {
      warningSigns: ['Cuộc gọi video ngắn, hình mờ, giật hoặc kết thúc đột ngột', 'Người thân "bỗng nhiên" cần tiền gấp và chỉ nhận qua chuyển khoản', 'Tài khoản nhận tiền không mang tên người thân'],
      commonRequests: ['Chuyển khoản ngay để xử lý việc gấp', 'Chuyển vào tài khoản của "bạn" hoặc "đối tác" của người thân'],
      whatToDo: ['Cúp máy và gọi lại người thân bằng số điện thoại đã lưu', 'Hỏi một chi tiết chỉ người thân mới biết trước khi chuyển tiền', REPORT_113],
      whatNotToDo: ['Không chuyển tiền chỉ vì đã "thấy mặt" trong video', 'Không chuyển vào tài khoản lạ dù được giải thích lý do'],
    }),
  scenario(2, 'ai_deepfake', 'payment_fraud',
    { title: 'Làm giả giọng người quen bằng DeepVoice', summary: 'Tạo giọng nói tương tự người thân rồi dựng tình huống cấp bách để vay tiền.' },
    {
      warningSigns: ['Giọng giống người quen nhưng gọi từ số lạ', 'Tình huống khẩn cấp (tai nạn, bị giữ, nợ gấp) và không thể gọi lại', 'Từ chối gọi video hoặc gặp trực tiếp'],
      commonRequests: ['Chuyển tiền "vay tạm" ngay lập tức', 'Giữ kín, không nói với ai khác'],
      whatToDo: ['Gọi lại số đã lưu của người đó hoặc người thân của họ để kiểm chứng', 'Thống nhất trước với gia đình một "mật khẩu" cho tình huống khẩn cấp', REPORT_113],
      whatNotToDo: ['Không chuyển tiền dựa trên giọng nói', 'Không làm theo yêu cầu "giữ bí mật"'],
    }),
  scenario(9, 'ai_deepfake', 'identity_theft',
    { title: 'Gọi điện im lặng', summary: 'Gọi điện nhưng không nói chuyện nhằm thu thập và phân tích mẫu giọng nói.' },
    {
      warningSigns: ['Cuộc gọi từ số lạ, đầu dây bên kia im lặng hoặc chỉ hỏi vu vơ', 'Nhiều cuộc gọi tương tự trong thời gian ngắn'],
      commonRequests: ['Khiến bạn nói càng nhiều càng tốt ("A lô? Ai đấy? Có nghe không?")'],
      whatToDo: ['Cúp máy ngay khi không có người trả lời', 'Chặn số và báo cho nhà mạng nếu lặp lại'],
      whatNotToDo: ['Không nói chuyện dài với số lạ im lặng', 'Không đọc tên, địa chỉ hay thông tin cá nhân qua điện thoại cho số lạ'],
    }),

  // ── Nhóm 1 · Mạo danh cơ quan nhà nước ───────────────────────────────────
  scenario(3, 'impersonation', 'payment_fraud',
    { title: 'Mạo danh cơ quan tố tụng', summary: 'Giả làm Công an, Viện kiểm sát, Tòa án, yêu cầu chuyển tiền để “xác minh”.' },
    {
      warningSigns: ['Gọi điện/nhắn tin báo bạn "liên quan vụ án", "rửa tiền", có "lệnh bắt"', 'Yêu cầu giữ bí mật, không được kể cho người thân', 'Đòi chuyển tiền vào "tài khoản tạm giữ" để chứng minh trong sạch'],
      commonRequests: ['Chuyển toàn bộ tiền để "xác minh" rồi sẽ trả lại', 'Cung cấp CCCD, tài khoản ngân hàng, mã OTP', 'Cài ứng dụng "Bộ Công an" giả'],
      whatToDo: ['Cúp máy — cơ quan tố tụng làm việc bằng giấy mời/giấy triệu tập trực tiếp, không qua điện thoại', 'Đến trụ sở Công an gần nhất hoặc gọi 113 để kiểm chứng'],
      whatNotToDo: ['Không chuyển tiền vào bất kỳ "tài khoản tạm giữ" nào', NEVER_SHARE, 'Không cài ứng dụng theo hướng dẫn qua điện thoại'],
    }),
  scenario(4, 'impersonation', 'credential_theft',
    { title: 'Giả nhân viên ngân hàng', summary: 'Yêu cầu cung cấp tên đăng nhập, mật khẩu, OTP hoặc thông tin tài khoản.' },
    {
      warningSigns: ['Tự xưng nhân viên ngân hàng gọi/nhắn về "giao dịch lạ", "nâng hạn mức", "khóa tài khoản"', 'Hỏi thẳng mật khẩu, mã OTP hoặc gửi link đăng nhập'],
      commonRequests: ['Đọc mã OTP vừa nhận', 'Đăng nhập qua link/website được gửi', 'Cập nhật thông tin để "mở khóa"'],
      whatToDo: ['Gọi lại tổng đài in trên mặt sau thẻ hoặc trong ứng dụng chính thức', 'Chỉ thao tác trong ứng dụng ngân hàng tự mở, không qua link'],
      whatNotToDo: ['Ngân hàng không bao giờ hỏi mật khẩu hay OTP — không đọc cho ai', 'Không đăng nhập qua liên kết trong tin nhắn/email'],
    }),
  scenario(5, 'impersonation', 'phishing',
    { title: 'Tin nhắn Brandname giả', summary: 'Gửi SMS tên hiển thị giống ngân hàng, cơ quan nhà nước để đánh lừa.' },
    {
      warningSigns: ['SMS có tên thương hiệu quen thuộc nhưng kèm link lạ, tên miền khác thường', 'Nội dung thúc giục: "tài khoản bị khóa", "đăng nhập bất thường", "nhận tiền hoàn"'],
      commonRequests: ['Bấm vào link để "xác minh" hoặc "mở khóa"', 'Nhập tên đăng nhập, mật khẩu, OTP trên trang được dẫn tới'],
      whatToDo: ['Coi mọi link trong SMS là đáng ngờ; tự mở ứng dụng/website chính thức để kiểm tra', 'Dùng công cụ Kiểm tra URL của Scam Shield trước khi mở'],
      whatNotToDo: ['Không bấm link trong SMS dù tên người gửi trông chính thức', NEVER_SHARE],
    }),
  scenario(10, 'impersonation', 'payment_fraud',
    { title: 'Giả danh giáo viên, nhà trường', summary: 'Thông báo học sinh gặp tai nạn, cần tiền gấp để xử lý.' },
    {
      warningSigns: ['Số lạ báo con/em bạn "đang cấp cứu", cần chuyển viện phí ngay', 'Không cho thời gian xác minh, thúc ép chuyển khoản'],
      commonRequests: ['Chuyển tiền viện phí vào tài khoản cá nhân "của bác sĩ/giáo viên"'],
      whatToDo: ['Gọi cho con, giáo viên chủ nhiệm hoặc nhà trường qua số đã có', 'Liên hệ trực tiếp bệnh viện được nêu tên'],
      whatNotToDo: ['Không chuyển tiền trước khi nói chuyện được với người thân hoặc nhà trường'],
    }),
  scenario(11, 'impersonation', 'payment_fraud',
    { title: 'Mạo danh nhân viên y tế', summary: 'Báo người thân đang cấp cứu, yêu cầu thanh toán hoặc chuyển tiền khẩn cấp.' },
    {
      warningSigns: ['Người lạ xưng bác sĩ/điều dưỡng báo người thân nhập viện', 'Yêu cầu chuyển khoản gấp vào tài khoản cá nhân'],
      commonRequests: ['Chuyển "tạm ứng viện phí" ngay lập tức'],
      whatToDo: ['Gọi cho người thân hoặc gọi tổng đài bệnh viện để kiểm chứng', 'Bệnh viện thu viện phí tại quầy/tài khoản đơn vị, không qua tài khoản cá nhân'],
      whatNotToDo: ['Không chuyển tiền cho tài khoản cá nhân dưới danh nghĩa bệnh viện'],
    }),
  scenario(12, 'impersonation', 'account_takeover',
    { title: 'Dọa khóa SIM', summary: 'Thông báo thuê bao cần chuẩn hóa, nâng cấp hoặc xác thực SIM.' },
    {
      warningSigns: ['Gọi/nhắn báo SIM "sắp bị khóa" trong vài giờ nếu không xác thực', 'Hướng dẫn bấm mã *#…, gửi tin nhắn cú pháp lạ hoặc đọc mã OTP'],
      commonRequests: ['Đọc mã OTP', 'Thao tác cú pháp chuyển hướng cuộc gọi/tin nhắn', 'Cung cấp CCCD để "chuẩn hóa"'],
      whatToDo: ['Chỉ chuẩn hóa thông tin tại điểm giao dịch hoặc ứng dụng chính thức của nhà mạng', 'Gọi tổng đài nhà mạng để hỏi'],
      whatNotToDo: ['Không bấm cú pháp theo hướng dẫn qua điện thoại', NEVER_SHARE],
    }),
  scenario(13, 'impersonation', 'payment_fraud',
    { title: 'Giả chương trình hoàn tiền', summary: 'Mạo danh đơn vị cung cấp dịch vụ, cơ quan thuế, trường học để hoàn tiền.' },
    {
      warningSigns: ['Được báo "hoàn tiền" học phí, thuế, cước dịch vụ mà bạn không hề đề nghị', 'Muốn nhận tiền phải bấm link, nhập thẻ hoặc "đóng phí trước"'],
      commonRequests: ['Nhập số thẻ/tài khoản và mã OTP vào trang "nhận hoàn tiền"', 'Chuyển một khoản phí để "kích hoạt" hoàn tiền'],
      whatToDo: ['Liên hệ đơn vị đó qua kênh chính thức để hỏi có chương trình hoàn tiền không', 'Hoàn tiền thật không bao giờ cần OTP hay phí trước'],
      whatNotToDo: ['Không nhập thông tin thẻ vào link được gửi', 'Không đóng bất kỳ khoản phí nào để "nhận" tiền'],
    }),
  scenario(17, 'impersonation', 'payment_fraud',
    { title: 'Mạo danh điện lực, cấp nước, viễn thông', summary: 'Thông báo nợ cước, yêu cầu thanh toán qua link hoặc tài khoản.' },
    {
      warningSigns: ['Báo nợ cước và dọa cắt điện/nước/mạng trong vài giờ', 'Gửi link thanh toán hoặc số tài khoản cá nhân để nộp cước'],
      commonRequests: ['Chuyển tiền cước vào tài khoản được cung cấp', 'Cài ứng dụng "tra cứu cước" từ link lạ'],
      whatToDo: ['Tra cứu và thanh toán trong ứng dụng/website chính thức của đơn vị', 'Gọi tổng đài chăm sóc khách hàng in trên hóa đơn'],
      whatNotToDo: ['Không thanh toán qua link trong tin nhắn', 'Không chuyển vào tài khoản cá nhân'],
    }),
  scenario(18, 'impersonation', 'identity_theft',
    { title: 'Giả danh cơ quan BHXH, y tế, lao động', summary: 'Yêu cầu cập nhật thông tin hồ sơ, đánh cắp dữ liệu cá nhân.' },
    {
      warningSigns: ['Yêu cầu "cập nhật hồ sơ", "đồng bộ CCCD", "nhận trợ cấp" qua điện thoại/link', 'Hỏi ảnh CCCD, số BHXH, tài khoản ngân hàng'],
      commonRequests: ['Gửi ảnh CCCD hai mặt', 'Cài ứng dụng "VssID"/"dịch vụ công" giả từ link', 'Cung cấp mã OTP'],
      whatToDo: ['Chỉ dùng ứng dụng chính thức tải từ App Store/Google Play, hoặc đến trực tiếp cơ quan', 'Gọi tổng đài BHXH/cơ quan đó để hỏi'],
      whatNotToDo: ['Không gửi ảnh giấy tờ tùy thân cho người lạ', 'Không cài ứng dụng từ link'],
    }),
  scenario(22, 'impersonation', 'phishing',
    { title: 'Giả thông báo phạt nguội', summary: 'Gửi yêu cầu tra cứu vi phạm qua link giả, hướng dẫn nộp phạt trực tuyến.' },
    {
      warningSigns: ['Tin nhắn/cuộc gọi báo bạn có "phạt nguội" kèm link tra cứu, thúc nộp phạt ngay', 'Tên miền không phải của Cục CSGT / Cổng dịch vụ công'],
      commonRequests: ['Bấm link tra cứu và nhập thông tin xe, CCCD, tài khoản', 'Chuyển tiền phạt vào tài khoản được chỉ định'],
      whatToDo: ['Tra cứu phạt nguội tại website chính thức của Cục CSGT hoặc Cổng dịch vụ công quốc gia', 'Nộp phạt qua kênh chính thức sau khi có quyết định xử phạt'],
      whatNotToDo: ['Không tra cứu/nộp phạt qua link trong tin nhắn', NEVER_SHARE],
    }),

  // ── Nhóm 3 · Đầu tư, việc làm ────────────────────────────────────────────
  scenario(14, 'investment_jobs', 'payment_fraud',
    { title: 'Lừa tuyển cộng tác viên', summary: 'Mời làm nhiệm vụ online, yêu cầu nộp tiền để được tiếp tục hoặc nhận hoa hồng.' },
    {
      warningSigns: ['"Việc nhẹ lương cao": like, đánh giá, đặt đơn ảo được trả hoa hồng', 'Nhiệm vụ đầu trả tiền thật, nhiệm vụ sau phải "nạp" để nhận'],
      commonRequests: ['Chuyển tiền để làm nhiệm vụ / nâng cấp thành viên', 'Chuyển thêm để "rút được" số dư'],
      whatToDo: ['Dừng ngay khi bị yêu cầu nạp tiền để làm việc', 'Lưu bằng chứng chuyển khoản và trình báo Công an'],
      whatNotToDo: ['Không nạp tiền để "nhận lương" hay "rút tiền"', 'Không kéo thêm người thân tham gia'],
    }),
  scenario(15, 'investment_jobs', 'investment_scam',
    { title: 'Mời đầu tư lợi nhuận cao', summary: 'Dụ tham gia chứng khoán, tiền số, ngoại hối với cam kết lợi nhuận hấp dẫn.' },
    {
      warningSigns: ['Cam kết lợi nhuận cố định rất cao, "không rủi ro"', 'Sàn/app không được cấp phép, "chuyên gia" kết bạn qua mạng xã hội'],
      commonRequests: ['Nạp tiền vào sàn qua tài khoản cá nhân hoặc ví tiền số', 'Nạp thêm để "nâng cấp gói" hoặc "nộp thuế" mới rút được'],
      whatToDo: ['Kiểm tra giấy phép hoạt động của sàn/công ty với cơ quan quản lý', 'Chỉ đầu tư qua tổ chức được cấp phép; nghi ngờ mọi lời hứa lợi nhuận đảm bảo'],
      whatNotToDo: ['Không chuyển tiền cho "chuyên gia" quen qua mạng', 'Không nạp thêm tiền để được rút tiền'],
    }),
  scenario(16, 'investment_jobs', 'investment_scam',
    { title: 'Tạo nhóm đầu tư giả', summary: 'Ban đầu cho rút khoản lãi nhỏ để tạo niềm tin, sau đó yêu cầu nạp số tiền lớn.' },
    {
      warningSigns: ['Nhóm chat đông người khoe lãi, "thầy" đọc lệnh', 'Rút được lãi nhỏ lúc đầu, rồi bị chặn rút khi số dư lớn'],
      commonRequests: ['Nạp số tiền lớn để "vào lệnh VIP"', 'Nộp "phí bảo hiểm", "thuế" để rút tiền'],
      whatToDo: ['Rời nhóm, không nạp thêm; giữ toàn bộ tin nhắn, lịch sử giao dịch làm bằng chứng', REPORT_113],
      whatNotToDo: ['Không tin lãi nhỏ rút được ban đầu là bằng chứng uy tín', 'Không nộp bất kỳ "phí" nào để rút tiền'],
    }),
  scenario(23, 'investment_jobs', 'payment_fraud',
    { title: 'Thông báo trúng thưởng giả', summary: 'Thông báo nhận quà hoặc tiền thưởng nhưng yêu cầu đóng phí, thuế hoặc phí vận chuyển.' },
    {
      warningSigns: ['Trúng thưởng chương trình bạn không tham gia', 'Muốn nhận thưởng phải đóng phí/thuế trước hoặc cung cấp thông tin thẻ'],
      commonRequests: ['Chuyển "phí vận chuyển", "thuế thu nhập" để nhận quà', 'Nhập thông tin thẻ/OTP để "nhận tiền thưởng"'],
      whatToDo: ['Liên hệ nhãn hàng qua kênh chính thức để hỏi về chương trình', 'Giải thưởng thật không bao giờ thu phí trước'],
      whatNotToDo: ['Không đóng bất kỳ khoản nào để nhận thưởng', NEVER_SHARE],
    }),
  scenario(24, 'investment_jobs', 'romance_scam',
    { title: 'Lừa đảo tình cảm', summary: 'Tạo quan hệ tình cảm trên mạng rồi từng bước đề nghị chuyển tiền, đầu tư, nhận hàng hộ.' },
    {
      warningSigns: ['Người quen qua mạng tiến triển tình cảm rất nhanh, tránh gặp mặt/gọi video', 'Bắt đầu nhắc đến khó khăn tài chính, quà tặng bị "giữ ở hải quan", cơ hội đầu tư'],
      commonRequests: ['Chuyển tiền giúp việc gấp, "phí hải quan" nhận quà', 'Đầu tư cùng vào sàn họ giới thiệu'],
      whatToDo: ['Tìm kiếm ngược ảnh đại diện; đề nghị gọi video trực tiếp', 'Kể với người thân/bạn bè trước khi chuyển bất kỳ khoản tiền nào'],
      whatNotToDo: ['Không chuyển tiền cho người chưa từng gặp ngoài đời', 'Không nhận/chuyển hàng hộ người quen qua mạng'],
    }),
  scenario(25, 'investment_jobs', 'payment_fraud',
    { title: 'Giả nhân viên tuyển dụng', summary: 'Thông báo trúng tuyển hoặc nhận việc nhưng yêu cầu đóng phí hồ sơ, đào tạo, đồng phục.' },
    {
      warningSigns: ['Trúng tuyển không cần phỏng vấn, lương cao bất thường', 'Phải đóng tiền trước khi nhận việc'],
      commonRequests: ['Chuyển "phí hồ sơ", "phí đào tạo", "tiền đồng phục", "đặt cọc thiết bị"'],
      whatToDo: ['Xác minh tin tuyển dụng qua website/hotline chính thức của công ty', 'Nhà tuyển dụng hợp pháp không thu tiền của ứng viên'],
      whatNotToDo: ['Không đóng bất kỳ khoản phí nào để được nhận việc', 'Không gửi ảnh CCCD/thẻ ngân hàng khi chưa ký hợp đồng lao động'],
    }),

  // ── Nhóm 4 · Mua bán trực tuyến ──────────────────────────────────────────
  scenario(7, 'online_trading', 'payment_fraud',
    { title: 'Làm giả bằng chứng giao dịch', summary: 'Sử dụng biên lai, hình ảnh chuyển khoản giả để khiến người bán tin rằng đã thanh toán.' },
    {
      warningSigns: ['Người mua gửi ảnh "đã chuyển khoản" nhưng tài khoản chưa nhận tiền', 'Giục giao hàng ngay, viện lý do "ngân hàng đang xử lý"'],
      commonRequests: ['Giao hàng/trả tiền thừa trước khi tiền về tài khoản'],
      whatToDo: ['Chỉ giao hàng khi số dư trong ứng dụng ngân hàng thực sự tăng', 'Bật thông báo biến động số dư'],
      whatNotToDo: ['Không tin ảnh chụp biên lai', 'Không "hoàn tiền thừa" cho người mua khi chưa nhận tiền'],
    }),
  scenario(21, 'online_trading', 'payment_fraud',
    { title: 'Lừa mua bán hàng hóa', summary: 'Giả làm người bán, yêu cầu đặt cọc trước rồi cắt đứt liên lạc.' },
    {
      warningSigns: ['Giá rẻ bất thường, tài khoản bán hàng mới lập, ít tương tác thật', 'Chỉ nhận cọc/chuyển khoản trước, không cho kiểm hàng, không ship COD'],
      commonRequests: ['Đặt cọc hoặc thanh toán toàn bộ trước khi giao'],
      whatToDo: ['Mua qua sàn thương mại điện tử có bảo vệ người mua, chọn thanh toán khi nhận hàng', 'Kiểm tra uy tín người bán trước khi chuyển tiền'],
      whatNotToDo: ['Không đặt cọc cho người bán lạ trên mạng xã hội'],
    }),
  scenario(19, 'online_trading', 'phishing',
    { title: 'Mã QR giả', summary: 'Dẫn người dùng đến website giả, trang thanh toán giả hoặc tải phần mềm chứa mã độc.' },
    {
      warningSigns: ['Mã QR dán đè, in rời tại quầy, cột điện, tờ rơi, hoặc gửi qua tin nhắn', 'Quét xong dẫn tới trang lạ yêu cầu đăng nhập/tải app'],
      commonRequests: ['Chuyển tiền theo QR', 'Tải ứng dụng hoặc đăng nhập trên trang mở ra từ QR'],
      whatToDo: ['Kiểm tra tên người nhận hiện trong ứng dụng ngân hàng trước khi xác nhận', 'Dùng Quét mã QR của Scam Shield để kiểm tra đường dẫn trước khi mở'],
      whatNotToDo: ['Không quét mã QR không rõ nguồn gốc', 'Không cài ứng dụng từ trang mở ra sau khi quét'],
    }),
  scenario(20, 'online_trading', 'remote_access_compromise',
    { title: 'Dụ cài ứng dụng điều khiển từ xa', summary: 'Yêu cầu cài phần mềm để đối tượng có thể truy cập và kiểm soát thiết bị.' },
    {
      warningSigns: ['"Hỗ trợ kỹ thuật" bảo cài ứng dụng để "sửa lỗi", "hỗ trợ giao dịch"', 'Ứng dụng đòi quyền trợ năng, đọc SMS, hiển thị trên ứng dụng khác'],
      commonRequests: ['Cài TeamViewer/AnyDesk/UltraViewer hoặc file .apk gửi qua tin nhắn', 'Đọc mã ID/mật khẩu kết nối, chia sẻ màn hình'],
      whatToDo: ['Nếu đã cài: ngắt mạng, gỡ ứng dụng, đổi mật khẩu ngân hàng từ thiết bị khác', 'Chỉ cài ứng dụng từ App Store/Google Play'],
      whatNotToDo: ['Không cài phần mềm theo hướng dẫn của người lạ', 'Không chia sẻ màn hình khi đang mở ứng dụng ngân hàng'],
    }),

  // ── Nhóm 5 · Đánh cắp dữ liệu ────────────────────────────────────────────
  scenario(6, 'data_theft', 'phishing',
    { title: 'Phát tán đường link giả mạo', summary: 'Gửi liên kết qua SMS, email, MXH để đánh cắp dữ liệu hoặc cài mã độc.' },
    {
      warningSigns: ['Link rút gọn hoặc tên miền lạ giống thương hiệu thật', 'Trang mở ra yêu cầu đăng nhập, nhập OTP hoặc tải file'],
      commonRequests: ['Đăng nhập tài khoản trên trang được dẫn tới', 'Tải file/ứng dụng "cần thiết"'],
      whatToDo: ['Dùng Kiểm tra URL của Scam Shield trước khi mở link lạ', 'Tự gõ địa chỉ website chính thức thay vì bấm link'],
      whatNotToDo: ['Không đăng nhập qua link nhận được', 'Không tải file từ link lạ'],
    }),
  scenario(8, 'data_theft', 'account_takeover',
    { title: 'Chiếm đoạt tài khoản mạng xã hội', summary: 'Sau khi kiểm soát tài khoản, kẻ gian nhắn tin cho bạn bè, người thân để vay tiền.' },
    {
      warningSigns: ['Bạn bè nhắn vay tiền gấp, cách nhắn khác thường, tài khoản nhận tên lạ', 'Đường link "bình chọn", "xem ảnh" dẫn tới trang đăng nhập giả'],
      commonRequests: ['Chuyển tiền "vay tạm" vào tài khoản người khác', 'Đăng nhập Facebook/Zalo trên trang lạ'],
      whatToDo: ['Gọi điện trực tiếp cho người đó trước khi chuyển tiền', 'Bật xác thực hai lớp cho tài khoản mạng xã hội'],
      whatNotToDo: ['Không chuyển tiền chỉ vì tin nhắn từ tài khoản quen', 'Không đăng nhập mạng xã hội trên link lạ'],
    }),
]

export const BOCONGAN_2026: KnowledgeDataset = {
  version: '2026-09-15.1',
  source: SOURCE,
  groups: GROUPS,
  scenarios: SCENARIOS,
  official: {
    attackerGoals: [
      'Chiếm đoạt tiền trong tài khoản',
      'Đánh cắp thông tin cá nhân',
      'Chiếm quyền kiểm soát thiết bị, tài khoản',
      'Lợi dụng danh tính để lừa đảo người khác',
    ],
    preventionMeasures: [
      'Không cung cấp thông tin cá nhân, mật khẩu, mã OTP cho bất kỳ ai.',
      'Không chuyển tiền khi chưa xác minh chính xác người nhận.',
      'Không truy cập link lạ, không quét mã QR không rõ nguồn gốc.',
      'Không cài đặt ứng dụng theo hướng dẫn của người lạ.',
      'Xác minh thông tin qua kênh chính thức của cơ quan, tổ chức.',
    ],
    reportAdvice: 'Hãy báo ngay cho Công an nơi gần nhất hoặc gọi 113 để được hỗ trợ kịp thời.',
    hotline: '113',
  },
}
