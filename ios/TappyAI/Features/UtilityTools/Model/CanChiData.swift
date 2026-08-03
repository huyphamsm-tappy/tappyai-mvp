import Foundation

struct CanChi: Identifiable {
    let id: String
    let nameVi: String
    let animalVi: String
    let emoji: String
    let traits: String
    let banks: FortuneBanks
}

/// One row of the Nạp Âm table: the name and its element, kept together so they cannot drift.
struct NapAmEntry: Equatable {
    let name: String
    let element: String
}

/// The astrology result for one birth year. Plain serialisable fields only (all strings), so a
/// backend can later return this exact shape unchanged and every platform decodes it as-is.
struct AstrologyProfile: Equatable {
    /// Thiên Can — Heavenly Stem, e.g. `Ất`.
    let heavenlyStem: String
    /// Địa Chi — Earthly Branch, e.g. `Sửu`.
    let earthlyBranch: String
    /// Stem + branch, e.g. `Ất Sửu`.
    let canChi: String
    /// Nạp Âm name of the year, e.g. `Hải Trung Kim`.
    let napAm: String
    /// Ngũ hành (mệnh) carried by the Nạp Âm row, e.g. `Kim`.
    let element: String
}

/// Canonical deterministic Can Chi / Nạp Âm engine — Swift mirror of the web source of truth
/// (`src/lib/boi/canChiEngine.ts`) and of
/// `android/app/src/main/java/com/tappyai/app/fortune/tuvi/CanChiEngine.kt`.
///
/// Pure functions + static tables only: no LLM, no network, no randomness, no clock.
///
/// Algorithm (solar/Gregorian year in, sexagenary cycle out):
///   n             = (year - 4) mod 60          — position in the 60-year cycle
///   heavenlyStem  = heavenlyStems[(year - 4) mod 10]
///   earthlyBranch = earthlyBranches[(year - 4) mod 12]
///   entry         = napAm[n / 2]                — each Nạp Âm spans 2 consecutive years
///   napAm         = entry.name, element = entry.element
///
/// NOTE: `element` is the NẠP ÂM element (mệnh), not the Heavenly-Stem element. Deriving it from
/// the birth year's last digit yields the stem element and is wrong for mệnh (1985 → "Mộc" instead
/// of the correct "Kim"). Name and element live in the SAME row of the SAME table — there is no
/// second element lookup and no string parsing, so the two cannot drift apart.
enum CanChiEngine {
    /// Thiên Can — 10 Heavenly Stems, in cycle order.
    static let heavenlyStems: [String] = [
        "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý",
    ]

    /// Địa Chi — 12 Earthly Branches, in cycle order.
    static let earthlyBranches: [String] = [
        "Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi",
    ]

    /// The five elements (ngũ hành) a Nạp Âm can resolve to.
    static let elements: [String] = ["Kim", "Mộc", "Thủy", "Hỏa", "Thổ"]

    /// Nạp Âm — 30 rows; row i covers the two consecutive cycle positions 2i and 2i+1.
    static let napAm: [NapAmEntry] = [
        NapAmEntry(name: "Hải Trung Kim", element: "Kim"),
        NapAmEntry(name: "Lư Trung Hỏa", element: "Hỏa"),
        NapAmEntry(name: "Đại Lâm Mộc", element: "Mộc"),
        NapAmEntry(name: "Lộ Bàng Thổ", element: "Thổ"),
        NapAmEntry(name: "Kiếm Phong Kim", element: "Kim"),
        NapAmEntry(name: "Sơn Đầu Hỏa", element: "Hỏa"),
        NapAmEntry(name: "Giản Hạ Thủy", element: "Thủy"),
        NapAmEntry(name: "Thành Đầu Thổ", element: "Thổ"),
        NapAmEntry(name: "Bạch Lạp Kim", element: "Kim"),
        NapAmEntry(name: "Dương Liễu Mộc", element: "Mộc"),
        NapAmEntry(name: "Tuyền Trung Thủy", element: "Thủy"),
        NapAmEntry(name: "Ốc Thượng Thổ", element: "Thổ"),
        NapAmEntry(name: "Tích Lịch Hỏa", element: "Hỏa"),
        NapAmEntry(name: "Tùng Bách Mộc", element: "Mộc"),
        NapAmEntry(name: "Trường Lưu Thủy", element: "Thủy"),
        NapAmEntry(name: "Sa Trung Kim", element: "Kim"),
        NapAmEntry(name: "Sơn Hạ Hỏa", element: "Hỏa"),
        NapAmEntry(name: "Bình Địa Mộc", element: "Mộc"),
        NapAmEntry(name: "Bích Thượng Thổ", element: "Thổ"),
        NapAmEntry(name: "Kim Bạch Kim", element: "Kim"),
        NapAmEntry(name: "Phú Đăng Hỏa", element: "Hỏa"),
        NapAmEntry(name: "Thiên Hà Thủy", element: "Thủy"),
        NapAmEntry(name: "Đại Trạch Thổ", element: "Thổ"),
        NapAmEntry(name: "Thoa Xuyến Kim", element: "Kim"),
        NapAmEntry(name: "Tang Đố Mộc", element: "Mộc"),
        NapAmEntry(name: "Đại Khê Thủy", element: "Thủy"),
        NapAmEntry(name: "Sa Trung Thổ", element: "Thổ"),
        NapAmEntry(name: "Thiên Thượng Hỏa", element: "Hỏa"),
        NapAmEntry(name: "Thạch Lựu Mộc", element: "Mộc"),
        NapAmEntry(name: "Đại Hải Thủy", element: "Thủy"),
    ]

    /// Positive modulo — Swift `%` keeps the sign of the dividend, which breaks years before AD 4.
    private static func mod(_ a: Int, _ m: Int) -> Int { ((a % m) + m) % m }

    /// Full astrology profile for a solar birth year. Deterministic and total: any year (including
    /// years before AD 4) returns all five fields.
    static func profile(_ year: Int) -> AstrologyProfile {
        let offset = year - 4
        let n = mod(offset, 60)
        let can = heavenlyStems[mod(offset, 10)]
        let chi = earthlyBranches[mod(offset, 12)]
        let entry = napAm[n / 2]

        return AstrologyProfile(
            heavenlyStem: can,
            earthlyBranch: chi,
            canChi: "\(can) \(chi)",
            napAm: entry.name,
            element: entry.element
        )
    }
}

enum CanChiData {
    static func getByYear(_ year: Int) -> CanChi {
        let idx = ((year - 4) % 12 + 12) % 12
        return list[idx]
    }

    /// Ngũ hành nạp âm (mệnh) by birth year — delegates to the canonical ``CanChiEngine``.
    /// e.g. 1985 → Ất Sửu → Hải Trung Kim → "Kim".
    static func getNguHanh(_ year: Int) -> String {
        CanChiEngine.profile(year).element
    }

    /// Full astrology profile (heavenlyStem / earthlyBranch / canChi / napAm / element) for a
    /// birth year.
    static func getAstrologyProfile(_ year: Int) -> AstrologyProfile {
        CanChiEngine.profile(year)
    }

    static let list: [CanChi] = [
        CanChi(id: "ty", nameVi: "Tý", animalVi: "Chuột", emoji: "🐀", traits: "Thông minh, nhanh nhẹn, tiết kiệm, linh hoạt. Người tuổi Tý có khả năng thích nghi cao và luôn biết cách tìm ra giải pháp trong mọi tình huống.", banks: FortuneBanks(love: ["Tình cảm phong phú, dễ thu hút người khác.", "Cần chung thuỷ và kiên định hơn.", "Mối quan hệ phát triển tốt nhờ sự thông minh.", "Giao tiếp khéo léo giúp giải quyết mâu thuẫn."], career: ["Trí thông minh giúp nắm bắt cơ hội nhanh.", "Kinh doanh và đầu tư có triển vọng.", "Cần kiên nhẫn hơn với mục tiêu dài hạn.", "Hợp tác với người tuổi Thìn, Thân rất tốt."], money: ["Khả năng kiếm tiền tốt nhưng cần tiết kiệm.", "Đầu tư nhỏ sinh lợi lớn nếu kiên trì.", "Tránh tham lam và liều lĩnh quá mức.", "Tài lộc đến từ sự nhanh nhẹn và linh hoạt."], health: ["Hệ thần kinh cần được nghỉ ngơi.", "Tránh lo lắng quá mức ảnh hưởng giấc ngủ.", "Vận động nhẹ nhàng đều đặn tốt cho sức khỏe.", "Chú ý sức khỏe vùng thận và bàng quang."], luckyNumbers: [1, 4, 9], luckyColors: ["Xanh dương", "Vàng", "Xanh lá"])),
        CanChi(id: "suu", nameVi: "Sửu", animalVi: "Trâu", emoji: "🐂", traits: "Kiên trì, đáng tin cậy, cần cù, bền bỉ. Người tuổi Sửu làm việc chăm chỉ và luôn hoàn thành nhiệm vụ được giao.", banks: FortuneBanks(love: ["Chung thuỷ và đáng tin cậy trong tình cảm.", "Cần lãng mạn và thể hiện tình cảm hơn.", "Mối quan hệ bền vững xây dựng từ sự tin tưởng.", "Kiên nhẫn giúp vượt qua khó khăn trong tình yêu."], career: ["Sự cần cù mang lại thành quả xứng đáng.", "Lĩnh vực nông nghiệp và bất động sản thuận lợi.", "Cần linh hoạt hơn để thích nghi thay đổi.", "Quản lý và tổ chức là thế mạnh lớn."], money: ["Tích luỹ dần nhờ sự kiên trì và cần kiệm.", "Đầu tư an toàn, tránh rủi ro cao.", "Bất động sản phù hợp cho đầu tư dài hạn.", "Tài chính ổn định nhờ kế hoạch rõ ràng."], health: ["Sức khỏe bền bỉ nhưng cần nghỉ ngơi.", "Chú ý vùng lưng và khớp gối.", "Ăn uống điều độ tốt cho tiêu hoá.", "Tránh lao động quá sức kéo dài."], luckyNumbers: [2, 5, 8], luckyColors: ["Vàng", "Trắng", "Xanh lá"])),
        CanChi(id: "dan", nameVi: "Dần", animalVi: "Hổ", emoji: "🐯", traits: "Dũng cảm, mạnh mẽ, tự tin, có uy. Người tuổi Dần có sức hút lãnh đạo và luôn sẵn sàng đối mặt với thử thách.", banks: FortuneBanks(love: ["Đam mê và mãnh liệt trong tình cảm.", "Cần kiểm soát sự nóng nảy.", "Thu hút đối phương bằng sự tự tin.", "Tình yêu cần sự tôn trọng lẫn nhau."], career: ["Lãnh đạo và quản lý là vị trí phù hợp.", "Dũng cảm đối mặt với thử thách lớn.", "Cần lắng nghe ý kiến của đồng nghiệp.", "Kinh doanh độc lập có triển vọng."], money: ["Kiếm tiền nhanh nhưng chi tiêu cũng lớn.", "Cần lập kế hoạch tài chính rõ ràng.", "Đầu tư mạo hiểm có thể thắng lớn.", "Tránh cho vay tiền không kiểm soát."], health: ["Năng lượng dồi dào nhưng cần kiểm soát.", "Thể thao mạnh giúp giải toả năng lượng.", "Chú ý huyết áp và tim mạch.", "Cần học cách thư giãn và buông bỏ."], luckyNumbers: [1, 3, 7], luckyColors: ["Cam", "Xanh lá", "Xám"])),
        CanChi(id: "mao", nameVi: "Mão", animalVi: "Mèo", emoji: "🐱", traits: "Duyên dáng, nhạy cảm, tinh tế, yêu hoà bình. Người tuổi Mão khéo léo trong giao tiếp và có gu thẩm mỹ cao.", banks: FortuneBanks(love: ["Duyên dáng và tinh tế trong tình cảm.", "Nhạy cảm giúp hiểu được đối phương.", "Cần quyết đoán hơn trong tình yêu.", "Mối quan hệ hài hòa và yên bình."], career: ["Nghệ thuật và thiết kế là lĩnh vực phù hợp.", "Khéo léo trong giao tiếp và ngoại giao.", "Cần tự tin hơn khi trình bày ý kiến.", "Môi trường thanh bình giúp sáng tạo."], money: ["Thẩm mỹ tốt giúp kinh doanh thuận lợi.", "Quản lý chi tiêu hợp lý và tinh tế.", "Đầu tư nghệ thuật có giá trị lâu dài.", "Tránh bị lợi dụng vì quá hiền lành."], health: ["Sức khỏe nhìn chung ổn định.", "Hệ thần kinh nhạy cảm cần được chăm sóc.", "Thiên nhiên và cây xanh tốt cho tinh thần.", "Giấc ngủ đủ giấc rất quan trọng."], luckyNumbers: [3, 4, 9], luckyColors: ["Hồng", "Tím", "Xanh lá nhạt"])),
        CanChi(id: "thin", nameVi: "Thìn", animalVi: "Rồng", emoji: "🐉", traits: "Uy nghi, tham vọng, năng lượng, may mắn. Người tuổi Thìn có vận khí mạnh và thường đạt được thành công lớn.", banks: FortuneBanks(love: ["Quyến rũ và thu hút đối phương mạnh mẽ.", "Cần khiêm tốn và lắng nghe trong tình cảm.", "Tình yêu mãnh liệt và đầy đam mê.", "Cần tìm đối tác ngang tầm để cùng phát triển."], career: ["Vận may và tài năng hội tụ đầy đủ.", "Lãnh đạo và khởi nghiệp rất thuận lợi.", "Tham vọng lớn cần kế hoạch cụ thể.", "Quý nhân phù trợ trong sự nghiệp."], money: ["Tài lộc vượng, nhiều cơ hội làm giàu.", "Đầu tư lớn có thể mang lại lợi nhuận cao.", "Cần tiết kiệm trong thời kỳ thịnh vượng.", "May mắn trong các phi vụ kinh doanh."], health: ["Năng lượng dồi dào nhưng dễ kiêu.", "Cẩn thận với stress do tham vọng quá lớn.", "Thể thao giúp cân bằng năng lượng.", "Chú ý gan và mật."], luckyNumbers: [1, 6, 7], luckyColors: ["Vàng", "Bạc", "Trắng"])),
        CanChi(id: "ty2", nameVi: "Tỵ", animalVi: "Rắn", emoji: "🐍", traits: "Trí tuệ, bí ẩn, quyến rũ, sâu sắc. Người tuổi Tỵ có trực giác mạnh và khả năng phân tích xuất sắc.", banks: FortuneBanks(love: ["Bí ẩn và quyến rũ thu hút người khác.", "Cần mở lòng và tin tưởng đối phương.", "Trực giác giúp chọn đúng người.", "Tình cảm sâu đậm khi đã yêu thật lòng."], career: ["Phân tích và nghiên cứu là thế mạnh.", "Tài chính và đầu tư thuận lợi.", "Cần hợp tác thay vì làm việc đơn độc.", "Trực giác giúp đưa ra quyết định đúng."], money: ["Khả năng quản lý tài chính xuất sắc.", "Đầu tư thông minh và có tính toán.", "Tài lộc đến từ sự kiên nhẫn.", "Cẩn thận với lòng tham và rủi ro."], health: ["Chú ý hệ tiêu hoá và da.", "Cần thư giãn và giải toả áp lực.", "Yoga và thiền phù hợp.", "Tránh ăn uống thất thường."], luckyNumbers: [2, 8, 9], luckyColors: ["Đỏ", "Vàng", "Đen"])),
        CanChi(id: "ngo", nameVi: "Ngọ", animalVi: "Ngựa", emoji: "🐴", traits: "Năng động, lạc quan, thích tự do, nhiệt huyết. Người tuổi Ngọ luôn hướng về phía trước với tinh thần lạc quan.", banks: FortuneBanks(love: ["Nhiệt huyết và lãng mạn trong tình cảm.", "Cần kiên nhẫn và cam kết lâu dài.", "Tự do cá nhân vẫn cần trong mối quan hệ.", "Tình yêu là cuộc phiêu lưu cùng nhau."], career: ["Năng động và sáng tạo trong công việc.", "Du lịch và kinh doanh quốc tế thuận lợi.", "Cần tập trung hơn vào một lĩnh vực.", "Sự lạc quan giúp vượt qua thử thách."], money: ["Kiếm tiền nhanh nhờ sự năng động.", "Chi tiêu cần kiểm soát hơn.", "Cơ hội từ du lịch và giải trí.", "Đa dạng hoá nguồn thu nhập."], health: ["Tim mạch và chân cần chú ý.", "Hoạt động ngoài trời tốt cho sức khỏe.", "Cần nghỉ ngơi đủ giữa các hoạt động.", "Thể thao là phần thiết yếu của cuộc sống."], luckyNumbers: [2, 3, 7], luckyColors: ["Xanh lá", "Đỏ", "Tím"])),
        CanChi(id: "mui", nameVi: "Mùi", animalVi: "Dê", emoji: "🐐", traits: "Hiền lành, sáng tạo, thương người, yêu nghệ thuật. Người tuổi Mùi có tâm hồn nhạy cảm và thiên hướng nghệ thuật.", banks: FortuneBanks(love: ["Dịu dàng và chân thành trong tình cảm.", "Nghệ thuật gắn kết hai tâm hồn.", "Cần tự tin hơn trong biểu đạt tình cảm.", "Mối quan hệ yên bình và hạnh phúc."], career: ["Nghệ thuật và sáng tạo phát triển mạnh.", "Công việc thiện nguyện mang lại ý nghĩa.", "Cần quyết đoán hơn trong sự nghiệp.", "Môi trường hoà bình giúp phát huy tài năng."], money: ["Tài chính ổn định nhờ sự chăm chỉ.", "Nghệ thuật có thể trở thành nguồn thu.", "Cần thực tế hơn trong kế hoạch tài chính.", "Tiết kiệm dần cho mục tiêu lớn."], health: ["Hệ tiêu hoá cần được quan tâm.", "Thiên nhiên và nghệ thuật giúp thư giãn.", "Ăn uống lành mạnh rất quan trọng.", "Tránh lo lắng quá mức."], luckyNumbers: [3, 4, 9], luckyColors: ["Xanh lá", "Tím", "Đỏ"])),
        CanChi(id: "than", nameVi: "Thân", animalVi: "Khỉ", emoji: "🐒", traits: "Thông minh, linh hoạt, hóm hỉnh, sáng tạo. Người tuổi Thân nhanh trí và luôn tìm được cách giải quyết mọi vấn đề.", banks: FortuneBanks(love: ["Hóm hỉnh và vui vẻ thu hút đối phương.", "Cần chân thành và nghiêm túc hơn.", "Sáng tạo giúp giữ lửa tình yêu.", "Giao tiếp tốt giải quyết mọi mâu thuẫn."], career: ["Sáng tạo và linh hoạt trong công việc.", "Công nghệ và đổi mới là lĩnh vực mạnh.", "Cần kiên trì hơn với dự án dài hạn.", "Hài hước giúp xây dựng quan hệ đồng nghiệp."], money: ["Nhanh nhẹn nắm bắt cơ hội tài chính.", "Cẩn thận với các scheme kiếm tiền nhanh.", "Sáng tạo mang lại thu nhập bất ngờ.", "Cần lập kế hoạch tiết kiệm dài hạn."], health: ["Hệ thần kinh cần được nghỉ ngơi.", "Vận động linh hoạt tốt cho cơ thể.", "Tránh thức khuya quá nhiều.", "Giải trí lành mạnh giúp cân bằng."], luckyNumbers: [1, 7, 8], luckyColors: ["Trắng", "Vàng", "Xanh dương"])),
        CanChi(id: "dau", nameVi: "Dậu", animalVi: "Gà", emoji: "🐓", traits: "Chăm chỉ, tỉ mỉ, đúng giờ, thẳng thắn. Người tuổi Dậu có kỷ luật tốt và luôn hoàn thành công việc đúng hạn.", banks: FortuneBanks(love: ["Chân thành và thẳng thắn trong tình cảm.", "Cần mềm mỏng hơn với đối phương.", "Sự tận tâm được đền đáp xứng đáng.", "Tình yêu xây dựng trên nền tảng trung thực."], career: ["Kỷ luật và tỉ mỉ mang lại thành công.", "Lĩnh vực tài chính và kế toán phù hợp.", "Cần linh hoạt hơn với thay đổi.", "Quản lý thời gian xuất sắc."], money: ["Quản lý tài chính chặt chẽ và hiệu quả.", "Tiết kiệm tốt nhờ kỷ luật.", "Cần đôi khi thưởng cho bản thân.", "Đầu tư an toàn và có kế hoạch."], health: ["Hệ hô hấp cần được quan tâm.", "Thói quen đều đặn tốt cho sức khỏe.", "Chú ý stress từ sự cầu toàn.", "Yoga buổi sáng giúp khởi đầu ngày tốt."], luckyNumbers: [5, 7, 8], luckyColors: ["Vàng", "Nâu", "Cam"])),
        CanChi(id: "tuat", nameVi: "Tuất", animalVi: "Chó", emoji: "🐕", traits: "Trung thành, thẳng thắn, dũng cảm, bảo vệ. Người tuổi Tuất đáng tin cậy và luôn sẵn sàng giúp đỡ người khác.", banks: FortuneBanks(love: ["Trung thành và tận tuỵ trong tình cảm.", "Cần lạc quan và vui vẻ hơn.", "Bảo vệ người yêu hết lòng.", "Sự chân thành xây dựng niềm tin."], career: ["Đáng tin cậy trong mọi nhiệm vụ.", "Lĩnh vực bảo vệ và pháp luật phù hợp.", "Cần tham vọng hơn cho sự nghiệp.", "Đồng đội tin tưởng và dựa dẫm vào bạn."], money: ["Tài chính ổn định nhờ sự chắc chắn.", "Không giỏi mạo hiểm nhưng an toàn.", "Tiết kiệm dần cho mục tiêu lớn.", "Giúp đỡ người khác mang lại may mắn."], health: ["Hệ tiêu hoá và dạ dày cần chú ý.", "Hoạt động ngoài trời tốt cho sức khỏe.", "Cần giải toả lo lắng về tương lai.", "Vận động đều đặn giúp duy trì sức khỏe."], luckyNumbers: [3, 4, 9], luckyColors: ["Xanh lá", "Đỏ", "Tím"])),
        CanChi(id: "hoi", nameVi: "Hợi", animalVi: "Heo", emoji: "🐖", traits: "Hào phóng, lạc quan, thật thà, yêu đời. Người tuổi Hợi sống chân thành và luôn mong muốn mọi người xung quanh hạnh phúc.", banks: FortuneBanks(love: ["Hào phóng và chân thành trong tình cảm.", "Tình yêu đến từ sự quan tâm thật lòng.", "Cần cẩn thận với người lợi dụng lòng tốt.", "Mối quan hệ hạnh phúc và ấm áp."], career: ["Sự hào phóng thu hút đồng nghiệp quý mến.", "Lĩnh vực ẩm thực và giải trí phù hợp.", "Cần kiên quyết hơn khi cần thiết.", "Lạc quan giúp vượt qua khó khăn."], money: ["Hào phóng nhưng cần kiểm soát chi tiêu.", "May mắn với các cơ hội bất ngờ.", "Cần lập ngân sách rõ ràng.", "Đầu tư ẩm thực và bất động sản phù hợp."], health: ["Cân nặng cần được kiểm soát.", "Ẩm thực lành mạnh rất quan trọng.", "Vận động đều đặn giúp duy trì sức khỏe.", "Tránh ăn uống quá mức khi stress."], luckyNumbers: [2, 5, 8], luckyColors: ["Vàng", "Xám", "Nâu"])),
    ]
}
