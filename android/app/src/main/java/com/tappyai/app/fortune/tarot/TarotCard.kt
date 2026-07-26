package com.tappyai.app.fortune.tarot

data class TarotCard(
    val id: Int,
    val emoji: String,
    val nameVi: String,
    val keywordsUpright: List<String>,
    val keywordsReversed: List<String>,
    val meaningUpright: String,
    val meaningReversed: String,
)

data class DrawnCard(val card: TarotCard, val reversed: Boolean)

private val MAJOR_ARCANA: List<TarotCard> = listOf(
    TarotCard(
        id = 0, emoji = "🃏", nameVi = "Kẻ Ngốc",
        keywordsUpright = listOf("Khởi đầu", "Tự do", "Phiêu lưu"),
        keywordsReversed = listOf("Liều lĩnh", "Bất cẩn", "Ngây thơ"),
        meaningUpright = "Một cơ hội mới đang chờ đợi. Hãy bước tiếp với tâm trí cởi mở và lòng tin vào bản thân. Đây là lúc thích hợp để bắt đầu một hành trình mới.",
        meaningReversed = "Hãy cẩn thận trước khi đưa ra quyết định. Sự thiếu suy nghĩ có thể dẫn đến những hệ quả không mong muốn.",
    ),
    TarotCard(
        id = 1, emoji = "🎩", nameVi = "Pháp Sư",
        keywordsUpright = listOf("Ý chí", "Kỹ năng", "Sáng tạo"),
        keywordsReversed = listOf("Thao túng", "Lãng phí tài năng", "Thiếu tự tin"),
        meaningUpright = "Bạn có đủ tài năng và nguồn lực để biến ý tưởng thành hiện thực. Hãy tin tưởng vào khả năng của mình và hành động ngay.",
        meaningReversed = "Tài năng của bạn đang bị lãng phí. Hãy xem xét lại mục tiêu và tập trung vào điều thực sự quan trọng.",
    ),
    TarotCard(
        id = 2, emoji = "🌙", nameVi = "Nữ Giáo Chủ",
        keywordsUpright = listOf("Trực giác", "Bí ẩn", "Nội tâm"),
        keywordsReversed = listOf("Bí mật", "Che giấu", "Bỏ lỡ trực giác"),
        meaningUpright = "Hãy lắng nghe tiếng nói nội tâm của bạn. Câu trả lời bạn tìm kiếm nằm sâu bên trong, không phải ở bên ngoài.",
        meaningReversed = "Bạn đang bỏ qua những dấu hiệu quan trọng. Đôi khi sự im lặng là cách tốt nhất để tìm ra sự thật.",
    ),
    TarotCard(
        id = 3, emoji = "👑", nameVi = "Nữ Hoàng",
        keywordsUpright = listOf("Phong phú", "Nuôi dưỡng", "Thiên nhiên"),
        keywordsReversed = listOf("Lệ thuộc", "Trì hoãn", "Thiếu sáng tạo"),
        meaningUpright = "Sự dồi dào và may mắn đang đến. Đây là thời điểm tốt để nuôi dưỡng các mối quan hệ và các dự án quan trọng.",
        meaningReversed = "Hãy xem xét lại cách bạn chăm sóc bản thân và người xung quanh. Sự phụ thuộc thái quá có thể cản trở sự phát triển.",
    ),
    TarotCard(
        id = 4, emoji = "🛡️", nameVi = "Hoàng Đế",
        keywordsUpright = listOf("Quyền lực", "Cấu trúc", "Lãnh đạo"),
        keywordsReversed = listOf("Độc đoán", "Cứng nhắc", "Thiếu linh hoạt"),
        meaningUpright = "Hãy đứng vững với vị trí của mình và thiết lập nền tảng vững chắc. Sự kỷ luật và trật tự sẽ dẫn đến thành công.",
        meaningReversed = "Sự cứng nhắc đang cản trở bạn. Hãy học cách uyển chuyển hơn trong cách tiếp cận các vấn đề.",
    ),
    TarotCard(
        id = 5, emoji = "⛪", nameVi = "Giáo Hoàng",
        keywordsUpright = listOf("Truyền thống", "Tín ngưỡng", "Hướng dẫn"),
        keywordsReversed = listOf("Cứng nhắc", "Phản kháng", "Giáo điều"),
        meaningUpright = "Hãy tìm kiếm sự hướng dẫn từ những người có kinh nghiệm. Đôi khi truyền thống và sự khôn ngoan từ thế hệ trước là con đường tốt nhất.",
        meaningReversed = "Bạn đang chống lại những quy tắc có thể giúp ích cho bạn. Hãy xem xét lại lý do bạn từ chối sự hướng dẫn.",
    ),
    TarotCard(
        id = 6, emoji = "💕", nameVi = "Người Tình",
        keywordsUpright = listOf("Tình yêu", "Lựa chọn", "Hài hòa"),
        keywordsReversed = listOf("Mất cân bằng", "Không chung thủy", "Xung đột"),
        meaningUpright = "Một quyết định quan trọng về tình cảm hoặc giá trị đang chờ bạn. Hãy theo đuổi trái tim và những điều bạn thực sự yêu thích.",
        meaningReversed = "Có sự mất cân bằng trong một mối quan hệ quan trọng. Hãy trung thực với bản thân về những gì bạn thực sự muốn.",
    ),
    TarotCard(
        id = 7, emoji = "🏆", nameVi = "Chiến Xa",
        keywordsUpright = listOf("Chiến thắng", "Kiểm soát", "Quyết tâm"),
        keywordsReversed = listOf("Thiếu kiểm soát", "Hung hăng", "Thất bại"),
        meaningUpright = "Với ý chí và sự quyết tâm, bạn sẽ vượt qua mọi trở ngại. Hãy tập trung vào mục tiêu và không để bất kỳ điều gì cản bước bạn.",
        meaningReversed = "Bạn đang chiến đấu nhưng không biết mình muốn gì. Hãy dừng lại và xác định rõ hướng đi trước khi tiếp tục.",
    ),
    TarotCard(
        id = 8, emoji = "🦁", nameVi = "Sức Mạnh",
        keywordsUpright = listOf("Can đảm", "Kiên nhẫn", "Nhân từ"),
        keywordsReversed = listOf("Yếu đuối", "Mất kiên nhẫn", "Tự nghi ngờ"),
        meaningUpright = "Sức mạnh thực sự đến từ sự nhân từ và lòng kiên nhẫn. Hãy đối mặt với thử thách bằng sự bình tĩnh và tự tin vào nội lực của mình.",
        meaningReversed = "Bạn đang để nỗi sợ hãi chi phối. Hãy tin tưởng vào bản thân và nhớ rằng bạn mạnh mẽ hơn bạn nghĩ.",
    ),
    TarotCard(
        id = 9, emoji = "🔦", nameVi = "Ẩn Sĩ",
        keywordsUpright = listOf("Tĩnh lặng", "Tìm kiếm nội tâm", "Suy ngẫm"),
        keywordsReversed = listOf("Cô lập", "Cô đơn", "Từ chối giúp đỡ"),
        meaningUpright = "Đây là thời gian để rút lui và suy ngẫm. Tìm kiếm câu trả lời trong sự im lặng và sự hiểu biết bên trong.",
        meaningReversed = "Sự cô lập đang làm hại bạn. Đừng ngại mở lòng với những người xung quanh và tìm kiếm sự hỗ trợ.",
    ),
    TarotCard(
        id = 10, emoji = "🎡", nameVi = "Bánh Xe Vận Mệnh",
        keywordsUpright = listOf("Thay đổi", "Chu kỳ", "May mắn"),
        keywordsReversed = listOf("Vận xui", "Kháng cự thay đổi", "Gián đoạn"),
        meaningUpright = "Vận may đang thay đổi theo hướng tốt. Hãy nắm bắt cơ hội và thích nghi với những thay đổi đang diễn ra.",
        meaningReversed = "Bạn đang chống lại những thay đổi không thể tránh khỏi. Hãy học cách thích nghi thay vì kháng cự.",
    ),
    TarotCard(
        id = 11, emoji = "⚖️", nameVi = "Công Lý",
        keywordsUpright = listOf("Công bằng", "Sự thật", "Trách nhiệm"),
        keywordsReversed = listOf("Bất công", "Thiếu trách nhiệm", "Thiên vị"),
        meaningUpright = "Sự thật sẽ được phơi bày và công bằng sẽ được thực thi. Hãy hành động một cách chính trực và chịu trách nhiệm về những quyết định của mình.",
        meaningReversed = "Có sự bất công trong tình huống hiện tại. Hãy xem xét lại liệu bạn có đang nhìn mọi thứ một cách khách quan không.",
    ),
    TarotCard(
        id = 12, emoji = "🙃", nameVi = "Người Treo Ngược",
        keywordsUpright = listOf("Hy sinh", "Góc nhìn mới", "Chờ đợi"),
        keywordsReversed = listOf("Trì hoãn", "Từ chối hy sinh", "Bế tắc"),
        meaningUpright = "Đôi khi bạn cần nhìn thế giới từ góc độ khác. Hãy sẵn sàng hy sinh điều gì đó để đạt được sự hiểu biết sâu sắc hơn.",
        meaningReversed = "Bạn đang mắc kẹt vì không muốn thay đổi. Hãy sẵn sàng buông bỏ để tiến về phía trước.",
    ),
    TarotCard(
        id = 13, emoji = "💀", nameVi = "Cái Chết",
        keywordsUpright = listOf("Kết thúc", "Chuyển đổi", "Tái sinh"),
        keywordsReversed = listOf("Kháng cự thay đổi", "Trì hoãn kết thúc", "Sợ hãi"),
        meaningUpright = "Một chu kỳ quan trọng đang kết thúc để nhường chỗ cho điều mới. Hãy chấp nhận sự kết thúc này như một phần của sự chuyển đổi.",
        meaningReversed = "Bạn đang bám víu vào những thứ đã hết thời. Hãy học cách buông bỏ để có thể bắt đầu lại.",
    ),
    TarotCard(
        id = 14, emoji = "🌊", nameVi = "Tiết Chế",
        keywordsUpright = listOf("Cân bằng", "Kiên nhẫn", "Hòa hợp"),
        keywordsReversed = listOf("Mất cân bằng", "Thái quá", "Thiếu kiên nhẫn"),
        meaningUpright = "Sự cân bằng và kiên nhẫn là chìa khóa lúc này. Hãy tìm kiếm sự hài hòa trong mọi khía cạnh của cuộc sống.",
        meaningReversed = "Bạn đang đi quá xa một chiều. Hãy tìm lại sự cân bằng trước khi tiếp tục.",
    ),
    TarotCard(
        id = 15, emoji = "😈", nameVi = "Ác Quỷ",
        keywordsUpright = listOf("Ràng buộc", "Vật chất", "Cạm bẫy"),
        keywordsReversed = listOf("Tự do", "Phá vỡ xiềng xích", "Nhận thức"),
        meaningUpright = "Có điều gì đó đang kìm hãm bạn. Hãy nhận ra những ràng buộc vô hình và tìm cách thoát khỏi chúng.",
        meaningReversed = "Bạn đang thoát khỏi một tình huống khó khăn. Đây là thời điểm để giải phóng bản thân và nhìn thấy sự thật rõ ràng hơn.",
    ),
    TarotCard(
        id = 16, emoji = "⚡", nameVi = "Tháp",
        keywordsUpright = listOf("Đổ vỡ", "Hỗn loạn", "Khải thị"),
        keywordsReversed = listOf("Thoát khỏi thảm họa", "Sợ thay đổi", "Từ chối sự thật"),
        meaningUpright = "Một sự kiện bất ngờ sẽ đảo lộn mọi thứ, nhưng đây cũng là cơ hội để xây dựng lại trên nền tảng vững chắc hơn.",
        meaningReversed = "Bạn đang cố tránh một sự thật khó chịu. Hãy đối mặt với nó thay vì trốn chạy.",
    ),
    TarotCard(
        id = 17, emoji = "⭐", nameVi = "Ngôi Sao",
        keywordsUpright = listOf("Hy vọng", "Cảm hứng", "Tâm linh"),
        keywordsReversed = listOf("Thất vọng", "Mất hy vọng", "Bi quan"),
        meaningUpright = "Một tia sáng hy vọng đang chiếu rọi vào cuộc sống của bạn. Hãy tin tưởng vào tương lai tươi sáng và mở lòng với những điều kỳ diệu.",
        meaningReversed = "Đừng để thất vọng che khuất ánh sáng. Hy vọng vẫn còn đó, chỉ cần bạn tìm kiếm.",
    ),
    TarotCard(
        id = 18, emoji = "🌕", nameVi = "Mặt Trăng",
        keywordsUpright = listOf("Ảo tưởng", "Nỗi sợ", "Tiềm thức"),
        keywordsReversed = listOf("Phơi bày sự thật", "Rõ ràng hơn", "Sợ hãi giảm"),
        meaningUpright = "Mọi thứ không phải như vẻ ngoài. Hãy cảnh giác với những ảo tưởng và lắng nghe trực giác của bạn trong lúc này.",
        meaningReversed = "Màn sương mù đang dần tan. Sự thật sẽ trở nên rõ ràng hơn và nỗi sợ của bạn sẽ dần biến mất.",
    ),
    TarotCard(
        id = 19, emoji = "☀️", nameVi = "Mặt Trời",
        keywordsUpright = listOf("Thành công", "Niềm vui", "Sinh lực"),
        keywordsReversed = listOf("Bi quan", "Thiếu nhiệt huyết", "Thất vọng"),
        meaningUpright = "Thành công và hạnh phúc đang đến với bạn. Đây là giai đoạn tích cực và tràn đầy năng lượng. Hãy tận hưởng nó!",
        meaningReversed = "Bạn đang khó nhìn thấy những điều tốt đẹp xung quanh mình. Hãy cố gắng tìm lại ánh sáng trong cuộc sống.",
    ),
    TarotCard(
        id = 20, emoji = "🌅", nameVi = "Phán Xét",
        keywordsUpright = listOf("Sự thức tỉnh", "Tha thứ", "Tái sinh"),
        keywordsReversed = listOf("Nghi ngờ bản thân", "Sợ thay đổi", "Từ chối trưởng thành"),
        meaningUpright = "Đây là thời điểm thức tỉnh và đánh giá lại cuộc sống của bạn. Hãy tha thứ cho bản thân và người khác để tiến về phía trước.",
        meaningReversed = "Bạn đang tự phán xét mình quá khắt khe. Hãy học cách tha thứ và chấp nhận bản thân như bạn vốn có.",
    ),
    TarotCard(
        id = 21, emoji = "🌍", nameVi = "Thế Giới",
        keywordsUpright = listOf("Hoàn thiện", "Thành tựu", "Trọn vẹn"),
        keywordsReversed = listOf("Gần đến đích", "Thiếu kết thúc", "Trì hoãn"),
        meaningUpright = "Bạn đang ở điểm kết thúc thành công của một chu kỳ quan trọng. Hãy tận hưởng thành quả và sẵn sàng cho những hành trình mới.",
        meaningReversed = "Bạn đang gần đến đích rồi. Hãy kiên trì thêm một chút nữa để hoàn thành những gì bạn đã bắt đầu.",
    ),
)

// ── Minor arcana (56) — generated from suit × rank templates, mirroring the web
//    `buildMinorArcana()` (`src/lib/boi/tarotData.ts`). Ids continue after the 22 major arcana.
private data class TarotSuit(val nameVi: String, val emoji: String, val domain: String)
private data class TarotRank(
    val nameVi: String,
    val upright: String,
    val reversed: String,
    val kwUp: String,
    val kwRev: String,
)

private val TAROT_SUITS = listOf(
    TarotSuit("Gậy", "🔥", "công việc, đam mê và hành động"),
    TarotSuit("Cốc", "💧", "tình cảm, cảm xúc và các mối quan hệ"),
    TarotSuit("Kiếm", "🗡️", "tư duy, lời nói và các quyết định"),
    TarotSuit("Tiền", "💰", "tài chính, vật chất và công việc thực tế"),
)

private val TAROT_RANKS = listOf(
    TarotRank("Ace", "Một khởi đầu mới đầy tiềm năng đang mở ra", "Một cơ hội khởi đầu đang bị trì hoãn hoặc bỏ lỡ", "khởi đầu", "lỡ cơ hội"),
    TarotRank("Hai", "Đến lúc cân nhắc một lựa chọn hoặc thiết lập sự hợp tác bước đầu", "Sự mất cân bằng hoặc do dự trước một lựa chọn quan trọng", "lựa chọn", "do dự"),
    TarotRank("Ba", "Sự phát triển và hợp tác đang mang lại kết quả tích cực", "Sự hợp tác đang gặp trở ngại hoặc thiếu gắn kết", "hợp tác", "trở ngại"),
    TarotRank("Bốn", "Nền tảng ổn định đang được thiết lập, mang lại cảm giác an toàn", "Sự ổn định đang trở thành trì trệ, cần một chút thay đổi", "ổn định", "trì trệ"),
    TarotRank("Năm", "Một thử thách hoặc xung đột tạm thời xuất hiện, đòi hỏi sự khéo léo", "Mâu thuẫn đang kéo dài hơn cần thiết, nên tìm cách hóa giải sớm", "thử thách", "mâu thuẫn kéo dài"),
    TarotRank("Sáu", "Sự hài hòa và hỗ trợ đang giúp mọi thứ dần hồi phục", "Sự mất cân bằng trong việc cho và nhận đang cần được điều chỉnh", "hài hòa", "mất cân bằng"),
    TarotRank("Bảy", "Sự kiên trì và đánh giá lại tình hình sẽ giúp bạn đi đúng hướng", "Thiếu kiên nhẫn hoặc đánh giá sai tình hình có thể gây trở ngại", "kiên trì", "thiếu kiên nhẫn"),
    TarotRank("Tám", "Mọi thứ đang chuyển động nhanh, đây là lúc hành động dứt khoát", "Tốc độ và sự vội vàng đang khiến bạn dễ mắc sai sót", "hành động nhanh", "vội vàng"),
    TarotRank("Chín", "Bạn đang rất gần với thành quả mong muốn, hãy kiên trì thêm một chút", "Cảm giác mệt mỏi hoặc cô đơn xuất hiện ngay trước đích đến", "gần đạt được", "mệt mỏi"),
    TarotRank("Mười", "Một chu kỳ đang hoàn thiện, mang lại kết quả rõ ràng và trọn vẹn", "Một chu kỳ kết thúc nhưng để lại gánh nặng cần giải quyết", "hoàn thiện", "gánh nặng"),
    TarotRank("Pháp Sư Nhỏ (Page)", "Một tin tức mới hoặc cơ hội học hỏi đang đến với sự nhiệt huyết tươi mới", "Sự thiếu kinh nghiệm hoặc tin tức chưa chắc chắn cần được kiểm chứng", "khởi đầu học hỏi", "thiếu kinh nghiệm"),
    TarotRank("Kỵ Sĩ (Knight)", "Hành động mạnh mẽ, quyết liệt theo đuổi mục tiêu đang được thúc đẩy", "Sự hấp tấp hoặc thiếu kế hoạch đang cản trở mục tiêu của bạn", "hành động mạnh mẽ", "hấp tấp"),
    TarotRank("Hoàng Hậu (Queen)", "Sự trưởng thành, nuôi dưỡng và làm chủ cảm xúc đang dẫn dắt bạn", "Cảm xúc đang chi phối quá nhiều, cần lấy lại sự cân bằng nội tâm", "trưởng thành", "mất cân bằng cảm xúc"),
    TarotRank("Vua (King)", "Sự làm chủ, tinh thông và uy tín đang giúp bạn dẫn dắt tốt mọi việc", "Quyền lực hoặc sự kiểm soát đang bị lạm dụng, cần điều chỉnh lại", "làm chủ", "lạm quyền"),
)

private fun buildMinorArcana(startId: Int): List<TarotCard> {
    val cards = mutableListOf<TarotCard>()
    var id = startId
    for (suit in TAROT_SUITS) {
        val domainFirst = suit.domain.substringBefore(",").trim()
        for (rank in TAROT_RANKS) {
            cards.add(
                TarotCard(
                    id = id++,
                    emoji = suit.emoji,
                    nameVi = "${rank.nameVi} ${suit.nameVi}",
                    keywordsUpright = listOf(rank.kwUp, domainFirst),
                    keywordsReversed = listOf(rank.kwRev, domainFirst),
                    meaningUpright = "${rank.upright}, đặc biệt trong lĩnh vực ${suit.domain}.",
                    meaningReversed = "${rank.reversed}, đặc biệt trong lĩnh vực ${suit.domain}.",
                ),
            )
        }
    }
    return cards
}

/** The full 78-card deck: 22 major arcana + 56 generated minor arcana (web parity). */
val TAROT_DECK: List<TarotCard> = MAJOR_ARCANA + buildMinorArcana(MAJOR_ARCANA.size)

fun drawCards(count: Int): List<DrawnCard> {
    return TAROT_DECK
        .shuffled()
        .take(count)
        // Web parity (tarotData.ts getRandomCards): reversed probability is 0.5, not 0.4.
        .map { card -> DrawnCard(card = card, reversed = Math.random() < 0.5) }
}
