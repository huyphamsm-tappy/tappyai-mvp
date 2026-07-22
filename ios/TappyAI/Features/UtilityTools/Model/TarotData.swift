import Foundation

struct TarotCard: Identifiable {
    let id: String
    let name: String
    let nameVi: String
    let arcana: String
    let suit: String?
    let number: Int
    let emoji: String
    let keywordsUpright: [String]
    let keywordsReversed: [String]
    let meaningUpright: String
    let meaningReversed: String
}

struct DrawnCard: Identifiable {
    let id: String
    let card: TarotCard
    let reversed: Bool

    var displayMeaning: String { reversed ? card.meaningReversed : card.meaningUpright }
    var displayKeywords: [String] { reversed ? card.keywordsReversed : card.keywordsUpright }
    var positionLabel: String { reversed ? "Ngược" : "Xuôi" }
}

enum TarotDeck {
    static func getRandomCards(count: Int) -> [DrawnCard] {
        var deck = allCards
        var drawn: [DrawnCard] = []
        for _ in 0..<min(count, deck.count) {
            let idx = Int.random(in: 0..<deck.count)
            let card = deck.remove(at: idx)
            let reversed = Bool.random()
            drawn.append(DrawnCard(id: card.id, card: card, reversed: reversed))
        }
        return drawn
    }

    static let allCards: [TarotCard] = majorArcana + buildMinorArcana()

    // MARK: - Major Arcana (22 cards)

    static let majorArcana: [TarotCard] = [
        TarotCard(id: "major-00", name: "The Fool", nameVi: "Kẻ Khờ", arcana: "major", suit: nil, number: 0, emoji: "🃏", keywordsUpright: ["khởi đầu mới", "tự do", "mạo hiểm"], keywordsReversed: ["liều lĩnh", "thiếu chuẩn bị", "do dự"], meaningUpright: "Một khởi đầu mới đầy hứng khởi đang chờ bạn. Hãy tin vào trực giác, dám bước đi dù chưa biết hết mọi thứ phía trước.", meaningReversed: "Bạn đang hành động hơi vội vàng hoặc thiếu chuẩn bị. Nên dừng lại suy nghĩ kỹ trước khi tiến thêm bước nữa."),
        TarotCard(id: "major-01", name: "The Magician", nameVi: "Pháp Sư", arcana: "major", suit: nil, number: 1, emoji: "🪄", keywordsUpright: ["sáng tạo", "ý chí", "năng lực"], keywordsReversed: ["lừa dối", "thiếu tập trung", "bỏ lỡ cơ hội"], meaningUpright: "Bạn có đủ kỹ năng và nguồn lực để biến ý tưởng thành hiện thực. Đây là lúc hành động, biến tiềm năng thành kết quả cụ thể.", meaningReversed: "Năng lực đang bị sử dụng sai cách hoặc thiếu tập trung. Cẩn thận với những lời hứa hẹn không đi kèm hành động thật."),
        TarotCard(id: "major-02", name: "The High Priestess", nameVi: "Nữ Tư Tế", arcana: "major", suit: nil, number: 2, emoji: "🌙", keywordsUpright: ["trực giác", "bí ẩn", "nội tâm"], keywordsReversed: ["mất kết nối", "che giấu", "thiếu rõ ràng"], meaningUpright: "Hãy lắng nghe trực giác nhiều hơn lý trí trong giai đoạn này. Có những điều bạn cảm nhận được mà chưa thể giải thích rõ.", meaningReversed: "Bạn đang xa rời cảm nhận thật của chính mình, hoặc có điều gì đó đang bị giấu kín chưa được tiết lộ."),
        TarotCard(id: "major-03", name: "The Empress", nameVi: "Hoàng Hậu", arcana: "major", suit: nil, number: 3, emoji: "👑", keywordsUpright: ["sung túc", "nuôi dưỡng", "sáng tạo"], keywordsReversed: ["phụ thuộc", "trì trệ", "thiếu chăm sóc"], meaningUpright: "Một giai đoạn sung túc, sinh sôi đang đến — về tình cảm, sáng tạo hoặc vật chất. Hãy chăm sóc bản thân và những điều bạn đang vun đắp.", meaningReversed: "Bạn có thể đang quên chăm sóc chính mình hoặc quá phụ thuộc vào người khác. Cần tìm lại sự cân bằng."),
        TarotCard(id: "major-04", name: "The Emperor", nameVi: "Hoàng Đế", arcana: "major", suit: nil, number: 4, emoji: "🏛️", keywordsUpright: ["kỷ luật", "ổn định", "quyền lực"], keywordsReversed: ["cứng nhắc", "kiểm soát quá mức", "thiếu linh hoạt"], meaningUpright: "Cấu trúc, kỷ luật và sự ổn định sẽ giúp bạn đạt được mục tiêu. Hãy nắm quyền chủ động và xây dựng nền tảng vững chắc.", meaningReversed: "Sự kiểm soát quá mức hoặc cứng nhắc đang gây cản trở. Hãy linh hoạt hơn để thích nghi với hoàn cảnh."),
        TarotCard(id: "major-05", name: "The Hierophant", nameVi: "Giáo Hoàng", arcana: "major", suit: nil, number: 5, emoji: "📿", keywordsUpright: ["truyền thống", "quy tắc", "hướng dẫn"], keywordsReversed: ["nổi loạn", "phá vỡ quy tắc", "lệch hướng"], meaningUpright: "Những giá trị truyền thống, quy tắc hoặc sự hướng dẫn từ người đi trước sẽ giúp bạn đi đúng hướng lúc này.", meaningReversed: "Bạn đang muốn phá bỏ những khuôn mẫu cũ để đi theo con đường riêng. Hãy cân nhắc kỹ điều gì nên giữ, điều gì nên bỏ."),
        TarotCard(id: "major-06", name: "The Lovers", nameVi: "Tình Nhân", arcana: "major", suit: nil, number: 6, emoji: "💞", keywordsUpright: ["kết nối", "lựa chọn", "hài hòa"], keywordsReversed: ["mất cân bằng", "bất đồng", "lựa chọn sai"], meaningUpright: "Một mối kết nối sâu sắc hoặc một lựa chọn quan trọng đang ở phía trước. Hãy chọn theo giá trị thật của bạn.", meaningReversed: "Có sự mất cân bằng hoặc bất đồng trong một mối quan hệ. Cần nhìn lại xem hai bên có còn cùng hướng hay không."),
        TarotCard(id: "major-07", name: "The Chariot", nameVi: "Cỗ Xe", arcana: "major", suit: nil, number: 7, emoji: "🏇", keywordsUpright: ["quyết tâm", "chiến thắng", "kiểm soát"], keywordsReversed: ["mất phương hướng", "thiếu kiểm soát", "trì hoãn"], meaningUpright: "Bằng ý chí và sự quyết tâm, bạn đang tiến rất gần đến một chiến thắng quan trọng. Giữ vững tay lái và tiếp tục tiến lên.", meaningReversed: "Bạn đang mất phương hướng hoặc bị kéo bởi nhiều hướng khác nhau. Cần xác định lại mục tiêu rõ ràng."),
        TarotCard(id: "major-08", name: "Strength", nameVi: "Sức Mạnh", arcana: "major", suit: nil, number: 8, emoji: "🦁", keywordsUpright: ["can đảm", "kiên nhẫn", "nội lực"], keywordsReversed: ["tự nghi ngờ", "thiếu kiên nhẫn", "kiệt sức"], meaningUpright: "Sức mạnh thật sự nằm ở sự kiên nhẫn và lòng trắc ẩn, không phải vũ lực. Bạn đủ bản lĩnh để vượt qua thử thách bằng sự bình tĩnh.", meaningReversed: "Bạn đang nghi ngờ chính khả năng của mình. Hãy cho bản thân thời gian để hồi phục nội lực trước khi tiếp tục."),
        TarotCard(id: "major-09", name: "The Hermit", nameVi: "Ẩn Sĩ", arcana: "major", suit: nil, number: 9, emoji: "🏮", keywordsUpright: ["tự soi xét", "cô độc", "tìm kiếm"], keywordsReversed: ["cô lập", "lạc lối", "né tránh"], meaningUpright: "Đây là lúc lui về suy ngẫm, tìm câu trả lời từ chính bên trong bạn. Sự yên tĩnh sẽ mang lại những hiểu biết quý giá.", meaningReversed: "Bạn có thể đang tự cô lập mình quá mức hoặc né tránh việc đối diện với vấn đề thật sự."),
        TarotCard(id: "major-10", name: "Wheel of Fortune", nameVi: "Vòng Quay Số Phận", arcana: "major", suit: nil, number: 10, emoji: "🎡", keywordsUpright: ["vận may", "thay đổi", "chu kỳ mới"], keywordsReversed: ["vận xấu", "trì trệ", "mất kiểm soát"], meaningUpright: "Một bước ngoặt may mắn hoặc một chu kỳ mới đang bắt đầu. Hãy đón nhận thay đổi với tâm thế cởi mở.", meaningReversed: "Vận may đang tạm chững lại hoặc có cảm giác mọi thứ ngoài tầm kiểm soát. Hãy bình tĩnh chờ đợi thời điểm thích hợp."),
        TarotCard(id: "major-11", name: "Justice", nameVi: "Công Lý", arcana: "major", suit: nil, number: 11, emoji: "⚖️", keywordsUpright: ["công bằng", "sự thật", "cân bằng"], keywordsReversed: ["bất công", "thiên vị", "trốn tránh trách nhiệm"], meaningUpright: "Sự thật và công bằng sẽ được làm rõ. Mọi hành động đều có hệ quả tương xứng — hãy hành xử minh bạch và đúng đắn.", meaningReversed: "Có sự bất công hoặc thiếu khách quan trong một tình huống. Cần xem lại để tránh đưa ra quyết định thiên vị."),
        TarotCard(id: "major-12", name: "The Hanged Man", nameVi: "Người Treo Ngược", arcana: "major", suit: nil, number: 12, emoji: "🙃", keywordsUpright: ["tạm dừng", "góc nhìn mới", "buông bỏ"], keywordsReversed: ["trì hoãn", "bám chấp", "do dự"], meaningUpright: "Đôi khi dừng lại và nhìn vấn đề từ góc độ khác sẽ mang lại lời giải bất ngờ. Đừng cố vội vàng hành động lúc này.", meaningReversed: "Bạn đang trì hoãn hoặc bám chấp vào điều không còn phù hợp. Cần can đảm buông bỏ để tiến lên."),
        TarotCard(id: "major-13", name: "Death", nameVi: "Tử Thần", arcana: "major", suit: nil, number: 13, emoji: "🦋", keywordsUpright: ["kết thúc", "chuyển hóa", "khởi đầu mới"], keywordsReversed: ["sợ thay đổi", "trì trệ kéo dài", "cố bám lấy quá khứ"], meaningUpright: "Một giai đoạn đang kết thúc để mở ra điều mới. Sự chuyển hóa này, dù khó khăn, là cần thiết để bạn phát triển.", meaningReversed: "Bạn đang cố bám giữ điều không còn phù hợp. Sự trì trệ kéo dài chỉ làm giai đoạn chuyển tiếp thêm đau khổ."),
        TarotCard(id: "major-14", name: "Temperance", nameVi: "Điều Độ", arcana: "major", suit: nil, number: 14, emoji: "🏺", keywordsUpright: ["cân bằng", "kiên nhẫn", "hài hòa"], keywordsReversed: ["mất cân bằng", "thiếu kiên nhẫn", "thái quá"], meaningUpright: "Sự cân bằng và điều độ là chìa khóa thành công lúc này. Kiên nhẫn và hài hòa sẽ mang lại kết quả tốt đẹp.", meaningReversed: "Bạn đang thiếu cân bằng trong cuộc sống. Cần điều chỉnh lại nhịp độ trước khi mọi thứ vượt tầm kiểm soát."),
        TarotCard(id: "major-15", name: "The Devil", nameVi: "Ác Quỷ", arcana: "major", suit: nil, number: 15, emoji: "😈", keywordsUpright: ["ràng buộc", "cám dỗ", "nghiện"], keywordsReversed: ["giải thoát", "tỉnh ngộ", "phá vỡ xiềng xích"], meaningUpright: "Có điều gì đó đang trói buộc bạn — thói quen xấu, mối quan hệ độc hại, hoặc sợ hãi. Nhận ra xiềng xích là bước đầu để thoát ra.", meaningReversed: "Bạn đang bắt đầu nhận ra và muốn thoát khỏi những ràng buộc tiêu cực. Đây là tín hiệu tích cực."),
        TarotCard(id: "major-16", name: "The Tower", nameVi: "Tháp", arcana: "major", suit: nil, number: 16, emoji: "⚡", keywordsUpright: ["đổ vỡ", "thức tỉnh", "thay đổi đột ngột"], keywordsReversed: ["tránh thảm họa", "sợ thay đổi", "xây lại từ đống đổ nát"], meaningUpright: "Một sự kiện bất ngờ có thể phá vỡ cấu trúc cũ. Dù đau đớn, đây là cơ hội để xây lại trên nền tảng chân thật hơn.", meaningReversed: "Bạn đang cảm nhận sự bất ổn nhưng cố gắng duy trì nguyên trạng. Đôi khi chấp nhận thay đổi sớm sẽ bớt tổn thương hơn."),
        TarotCard(id: "major-17", name: "The Star", nameVi: "Ngôi Sao", arcana: "major", suit: nil, number: 17, emoji: "⭐", keywordsUpright: ["hy vọng", "cảm hứng", "bình yên"], keywordsReversed: ["mất niềm tin", "thất vọng", "mất phương hướng"], meaningUpright: "Sau bão tố là cầu vồng. Đây là giai đoạn chữa lành, tràn đầy hy vọng và cảm hứng mới cho tương lai.", meaningReversed: "Bạn đang mất niềm tin hoặc cảm thấy mục đích sống trở nên mờ nhạt. Hãy quay về những giá trị cốt lõi của mình."),
        TarotCard(id: "major-18", name: "The Moon", nameVi: "Mặt Trăng", arcana: "major", suit: nil, number: 18, emoji: "🌕", keywordsUpright: ["ảo tưởng", "lo âu", "tiềm thức"], keywordsReversed: ["sáng tỏ", "vượt qua sợ hãi", "giải mã"], meaningUpright: "Không phải mọi thứ đều như vẻ bề ngoài. Hãy cẩn trọng với những điều mơ hồ và tin vào cảm nhận sâu thẳm.", meaningReversed: "Sự mù mờ đang dần được giải tỏa. Những nỗi sợ cũ đang mất dần sức mạnh khi bạn đối diện với chúng."),
        TarotCard(id: "major-19", name: "The Sun", nameVi: "Mặt Trời", arcana: "major", suit: nil, number: 19, emoji: "☀️", keywordsUpright: ["niềm vui", "thành công", "sinh lực"], keywordsReversed: ["chậm trễ", "thiếu rõ ràng", "tự cao"], meaningUpright: "Ánh sáng, niềm vui và sự thành công đang chiếu rọi. Đây là một trong những lá bài tích cực nhất — hãy tận hưởng và biết ơn.", meaningReversed: "Niềm vui đang đến nhưng chậm hơn mong đợi. Hoặc bạn đang để ego che lấp sự chân thành trong mối quan hệ."),
        TarotCard(id: "major-20", name: "Judgement", nameVi: "Phán Xét", arcana: "major", suit: nil, number: 20, emoji: "📯", keywordsUpright: ["tái sinh", "giác ngộ", "gọi dậy"], keywordsReversed: ["tự phê phán", "trốn tránh", "không chấp nhận"], meaningUpright: "Một lời kêu gọi từ bên trong đang thúc giục bạn thay đổi. Đây là thời điểm tái sinh và bước vào phiên bản tốt nhất của mình.", meaningReversed: "Bạn đang tự phê phán quá nghiêm khắc hoặc trốn tránh tiếng gọi thay đổi. Hãy tha thứ cho chính mình và tiến lên."),
        TarotCard(id: "major-21", name: "The World", nameVi: "Thế Giới", arcana: "major", suit: nil, number: 21, emoji: "🌍", keywordsUpright: ["hoàn thành", "thành tựu", "viên mãn"], keywordsReversed: ["chưa hoàn thiện", "trì hoãn hoàn thành", "thiếu kết thúc"], meaningUpright: "Một chu kỳ quan trọng đang đi đến kết thúc viên mãn. Bạn đã hoàn thành hành trình — hãy ăn mừng trước khi bắt đầu vòng mới.", meaningReversed: "Bạn gần đến đích nhưng có điều gì đó chưa hoàn thiện. Hãy hoàn thành nốt để không mang theo dang dở sang chu kỳ mới."),
    ]

    // MARK: - Minor Arcana (56 cards, generated)

    private struct SuitDef {
        let id: String; let nameVi: String; let emoji: String; let domain: String
    }

    private struct RankDef {
        let number: Int; let nameVi: String; let upright: String; let reversed: String
        let kwUp: [String]; let kwRev: [String]
    }

    private static let suits: [SuitDef] = [
        SuitDef(id: "wands", nameVi: "Gậy", emoji: "🔥", domain: "công việc, đam mê và hành động"),
        SuitDef(id: "cups", nameVi: "Cốc", emoji: "💧", domain: "tình cảm, cảm xúc và các mối quan hệ"),
        SuitDef(id: "swords", nameVi: "Kiếm", emoji: "⚔️", domain: "tư duy, lời nói và các quyết định"),
        SuitDef(id: "pentacles", nameVi: "Tiền", emoji: "💰", domain: "tài chính, vật chất và công việc thực tế"),
    ]

    private static let ranks: [RankDef] = [
        RankDef(number: 1, nameVi: "Ace", upright: "Khởi đầu thuận lợi, cơ hội mới xuất hiện rõ ràng", reversed: "Cơ hội bị trì hoãn hoặc chưa sẵn sàng nắm bắt", kwUp: ["khởi đầu", "tiềm năng"], kwRev: ["trì hoãn", "bỏ lỡ"]),
        RankDef(number: 2, nameVi: "Hai", upright: "Sự cân bằng và hợp tác đang mang lại kết quả", reversed: "Mất cân bằng hoặc bất đồng cần được giải quyết", kwUp: ["cân bằng", "hợp tác"], kwRev: ["bất đồng", "mất cân bằng"]),
        RankDef(number: 3, nameVi: "Ba", upright: "Sự phát triển và mở rộng đang diễn ra tích cực", reversed: "Sự phát triển bị chậm lại hoặc đi sai hướng", kwUp: ["phát triển", "sáng tạo"], kwRev: ["chậm trễ", "thiếu kế hoạch"]),
        RankDef(number: 4, nameVi: "Bốn", upright: "Ổn định và nền tảng vững chắc đang được thiết lập", reversed: "Sự cứng nhắc hoặc trì trệ cần được phá vỡ", kwUp: ["ổn định", "nền tảng"], kwRev: ["trì trệ", "cứng nhắc"]),
        RankDef(number: 5, nameVi: "Năm", upright: "Thử thách và xung đột mang đến bài học giá trị", reversed: "Xung đột kéo dài không cần thiết, cần hòa giải", kwUp: ["thử thách", "học hỏi"], kwRev: ["xung đột", "mâu thuẫn"]),
        RankDef(number: 6, nameVi: "Sáu", upright: "Hài hòa và sự giúp đỡ đang đến từ xung quanh", reversed: "Sự phụ thuộc quá mức hoặc thiếu tự chủ", kwUp: ["hài hòa", "giúp đỡ"], kwRev: ["phụ thuộc", "thiếu tự chủ"]),
        RankDef(number: 7, nameVi: "Bảy", upright: "Nội lực và sự kiên trì đang được thử thách", reversed: "Nghi ngờ bản thân hoặc thiếu kiên nhẫn", kwUp: ["kiên trì", "nội lực"], kwRev: ["nghi ngờ", "bỏ cuộc"]),
        RankDef(number: 8, nameVi: "Tám", upright: "Tiến bộ nhanh chóng và hành động quyết đoán", reversed: "Vội vàng hoặc thiếu cân nhắc trước khi hành động", kwUp: ["tốc độ", "quyết đoán"], kwRev: ["vội vàng", "thiếu cẩn thận"]),
        RankDef(number: 9, nameVi: "Chín", upright: "Gần đạt được mục tiêu, chỉ cần thêm chút kiên nhẫn", reversed: "Lo lắng quá mức về kết quả cuối cùng", kwUp: ["gần đích", "kiên nhẫn"], kwRev: ["lo lắng", "thiếu tin tưởng"]),
        RankDef(number: 10, nameVi: "Mười", upright: "Hoàn thành và đạt được thành quả trọn vẹn", reversed: "Gánh nặng quá lớn hoặc kết thúc không như ý", kwUp: ["hoàn thành", "thành quả"], kwRev: ["gánh nặng", "quá sức"]),
        RankDef(number: 11, nameVi: "Page", upright: "Tin tốt và cơ hội học hỏi mới đang đến", reversed: "Thiếu chín chắn hoặc thông tin không chính xác", kwUp: ["tin tốt", "học hỏi"], kwRev: ["non nớt", "sai lệch"]),
        RankDef(number: 12, nameVi: "Knight", upright: "Hành động mạnh mẽ và quyết tâm cao", reversed: "Hành động thiếu suy nghĩ hoặc quá bốc đồng", kwUp: ["hành động", "quyết tâm"], kwRev: ["bốc đồng", "liều lĩnh"]),
        RankDef(number: 13, nameVi: "Queen", upright: "Sự chín chắn, trực giác và khả năng nuôi dưỡng", reversed: "Quá nhạy cảm hoặc kiểm soát người khác", kwUp: ["chín chắn", "trực giác"], kwRev: ["nhạy cảm", "kiểm soát"]),
        RankDef(number: 14, nameVi: "King", upright: "Quyền lực, sự thành thạo và khả năng lãnh đạo", reversed: "Lạm dụng quyền lực hoặc thiếu linh hoạt", kwUp: ["lãnh đạo", "thành thạo"], kwRev: ["lạm quyền", "độc đoán"]),
    ]

    private static func buildMinorArcana() -> [TarotCard] {
        var cards: [TarotCard] = []
        for suit in suits {
            for rank in ranks {
                cards.append(TarotCard(
                    id: "minor-\(suit.id)-\(rank.number)",
                    name: "\(rank.nameVi) of \(suit.nameVi)",
                    nameVi: "\(rank.nameVi) \(suit.nameVi)",
                    arcana: "minor",
                    suit: suit.id,
                    number: rank.number,
                    emoji: suit.emoji,
                    keywordsUpright: rank.kwUp,
                    keywordsReversed: rank.kwRev,
                    meaningUpright: "\(rank.upright), đặc biệt trong lĩnh vực \(suit.domain).",
                    meaningReversed: "\(rank.reversed), đặc biệt trong lĩnh vực \(suit.domain)."
                ))
            }
        }
        return cards
    }
}
