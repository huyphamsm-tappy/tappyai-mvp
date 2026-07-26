package com.tappyai.app.fortune.zodiac

import com.tappyai.app.fortune.engine.FortuneBanks

/** Zodiac fortune banks, transcribed VERBATIM from prod `src/lib/boi/zodiacData.ts` (worktree
 *  cool-vaughan-b3c7ff). Keyed by the web string sign id — the seed id the deterministic engine
 *  hashes, so these must match the web exactly for byte-identical readings. */
internal val ZODIAC_SEED_IDS: List<String> = listOf(
    // the 12 web ids in the SAME order as the prod ZODIAC_SIGNS array (index 0..11):
    // aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
)

internal val ZODIAC_BANKS: Map<String, FortuneBanks> = mapOf(
    "aries" to FortuneBanks(
        love = listOf(
            "Tình cảm nồng nhiệt, bạn dễ chủ động bày tỏ cảm xúc và tạo bất ngờ cho người ấy.",
            "Một cuộc trò chuyện thẳng thắn sẽ giúp gỡ bỏ hiểu lầm đang âm ỉ trong mối quan hệ.",
            "Người độc thân có thể gặp ai đó thú vị qua một hoạt động năng động, sôi nổi.",
            "Cảm xúc hơi nóng nảy, hãy bình tĩnh trước khi tranh luận với nửa kia.",
            "Sự chân thành của bạn khiến đối phương cảm thấy an tâm và được trân trọng.",
        ),
        career = listOf(
            "Năng lượng dồi dào giúp bạn xử lý nhanh một việc tồn đọng lâu nay.",
            "Một ý tưởng mới của bạn được cấp trên hoặc đồng nghiệp đánh giá cao.",
            "Đừng vội vàng ký kết hay quyết định lớn mà chưa xem kỹ chi tiết.",
            "Tinh thần dẫn đầu giúp bạn nổi bật trong một dự án nhóm.",
            "Cạnh tranh trong công việc tăng nhẹ, hãy giữ vững lập trường nhưng khéo léo hơn.",
        ),
        money = listOf(
            "Tài chính ổn, nhưng nên tránh chi tiêu bốc đồng cho những thứ chưa cần thiết.",
            "Có thể xuất hiện một khoản thu nhỏ ngoài kế hoạch, hãy tiết kiệm thay vì tiêu hết.",
            "Một quyết định đầu tư cần thêm thời gian cân nhắc trước khi xuống tiền.",
            "Vận tài lộc khá tốt nếu bạn chủ động tìm kiếm cơ hội thay vì chờ đợi.",
        ),
        health = listOf(
            "Năng lượng cao nhưng dễ căng cơ, hãy khởi động kỹ trước khi vận động mạnh.",
            "Nên chú ý giấc ngủ, tránh để công việc cuốn theo làm thiếu ngủ kéo dài.",
            "Sức khỏe tổng quan tốt, phù hợp để bắt đầu một thói quen tập luyện mới.",
        ),
        luckyNumbers = listOf(1, 9, 18),
        luckyColors = listOf("Đỏ", "Cam"),
    ),
    "taurus" to FortuneBanks(
        love = listOf(
            "Mối quan hệ cần thêm sự lãng mạn nhỏ để không bị nhàm chán theo lối quen.",
            "Bạn được người ấy yêu thích vì sự chân thành và đáng tin cậy.",
            "Một bữa ăn ngon hoặc món quà nhỏ sẽ giúp tình cảm thêm ấm áp.",
            "Đừng quá cố chấp giữ quan điểm riêng khi trò chuyện với nửa kia.",
            "Người độc thân nên cởi mở hơn, đừng chờ đợi quá lâu để bắt đầu.",
        ),
        career = listOf(
            "Sự kiên trì của bạn bắt đầu mang lại kết quả rõ rệt trong công việc.",
            "Một kế hoạch dài hạn cần được xem lại để tối ưu hơn.",
            "Cấp trên đánh giá cao tính ổn định và độ tin cậy trong công việc của bạn.",
            "Tránh trì hoãn quá lâu một quyết định quan trọng, hãy hành động đúng lúc.",
        ),
        money = listOf(
            "Tài lộc khá vững, thích hợp để tiết kiệm hoặc lên kế hoạch dài hạn.",
            "Một món đồ yêu thích có thể khiến bạn chi tiêu nhiều hơn dự tính.",
            "Cơ hội tăng thu nhập đến từ chính sự kiên trì bạn đã bỏ ra trước đó.",
            "Nên rà soát lại các khoản chi cố định để tránh lãng phí không cần thiết.",
        ),
        health = listOf(
            "Cơ thể cần được vận động nhiều hơn để tránh trì trệ, ù lì.",
            "Ăn uống điều độ, tránh ăn quá nhiều món yêu thích cùng lúc.",
            "Tinh thần thư thái, phù hợp để đi dạo hoặc nghe nhạc thư giãn.",
        ),
        luckyNumbers = listOf(2, 6, 24),
        luckyColors = listOf("Xanh lá", "Hồng"),
    ),
    "gemini" to FortuneBanks(
        love = listOf(
            "Một cuộc trò chuyện thú vị có thể khiến tình cảm giữa hai người gần nhau hơn.",
            "Hãy lắng nghe nhiều hơn nói, đối phương cần được thấu hiểu lúc này.",
            "Tin nhắn bất ngờ từ một người quen cũ có thể khơi lại cảm xúc cũ.",
            "Đừng để sự đa mang khiến nửa kia cảm thấy thiếu an toàn.",
            "Người độc thân có cơ hội gặp ai đó hợp gu chuyện trò qua mạng xã hội.",
        ),
        career = listOf(
            "Khả năng giao tiếp giúp bạn thuyết phục đối tác hoặc khách hàng hiệu quả.",
            "Nhiều việc dồn lại cùng lúc, hãy ưu tiên việc quan trọng trước.",
            "Một ý tưởng sáng tạo của bạn được mọi người đón nhận tích cực.",
            "Tránh hứa hẹn quá nhiều thứ cùng lúc rồi không hoàn thành kịp.",
        ),
        money = listOf(
            "Có thể có thêm thu nhập từ một việc làm thêm hoặc ý tưởng mới.",
            "Nên ghi chép chi tiêu rõ ràng, tránh mua sắm theo cảm xúc nhất thời.",
            "Cơ hội tài chính đến từ mối quan hệ xã hội rộng của bạn.",
            "Một khoản chi nhỏ ngoài kế hoạch có thể xuất hiện, không đáng lo.",
        ),
        health = listOf(
            "Đầu óc hoạt động nhiều, nên dành thời gian nghỉ ngơi cho tinh thần.",
            "Hơi mất ngủ do suy nghĩ nhiều chuyện cùng lúc, hãy thử viết nhật ký trước khi ngủ.",
            "Sức khỏe ổn định nếu duy trì lịch sinh hoạt đều đặn hơn.",
        ),
        luckyNumbers = listOf(5, 7, 14),
        luckyColors = listOf("Vàng", "Bạc"),
    ),
    "cancer" to FortuneBanks(
        love = listOf(
            "Tình cảm gia đình và người thân được vun đắp tốt trong giai đoạn này.",
            "Hãy chia sẻ cảm xúc thật của bạn, đừng giữ trong lòng quá lâu.",
            "Một cử chỉ quan tâm nhỏ từ nửa kia khiến bạn thấy được yêu thương.",
            "Người độc thân nên mở lòng hơn để đón nhận một kết nối mới.",
            "Tránh suy diễn quá nhiều về lời nói của đối phương khi chưa rõ ý.",
        ),
        career = listOf(
            "Sự tận tâm của bạn được đồng nghiệp và cấp trên ghi nhận.",
            "Một việc liên quan đến chăm sóc, hỗ trợ người khác mang lại niềm vui.",
            "Cần cân bằng giữa công việc và cảm xúc cá nhân để không bị quá tải.",
            "Trực giác giúp bạn đưa ra quyết định đúng đắn trong tình huống khó.",
        ),
        money = listOf(
            "Tài chính ổn định nếu bạn không chi tiêu theo cảm xúc lúc buồn.",
            "Có thể nhận được sự hỗ trợ tài chính nhỏ từ gia đình hoặc người thân.",
            "Nên dành một khoản tiết kiệm cho những kế hoạch dài hơi của gia đình.",
            "Tránh cho vay mượn cảm tính trong giai đoạn này.",
        ),
        health = listOf(
            "Cảm xúc ảnh hưởng nhiều đến sức khỏe, hãy giữ tinh thần lạc quan.",
            "Dạ dày hoặc tiêu hóa cần được chú ý, ăn uống đúng giờ hơn.",
            "Nghỉ ngơi đầy đủ giúp bạn hồi phục năng lượng nhanh hơn.",
        ),
        luckyNumbers = listOf(2, 11, 20),
        luckyColors = listOf("Trắng", "Xanh nhạt"),
    ),
    "leo" to FortuneBanks(
        love = listOf(
            "Sự tự tin và hào phóng của bạn khiến nửa kia thêm yêu mến.",
            "Một lời khen chân thành dành cho đối phương sẽ làm không khí ấm áp hơn.",
            "Đừng để cái tôi quá lớn cản trở việc xin lỗi khi cần thiết.",
            "Người độc thân có thể trở thành tâm điểm chú ý tại một sự kiện đông người.",
            "Tình cảm thăng hoa khi bạn chủ động tạo những khoảnh khắc đáng nhớ.",
        ),
        career = listOf(
            "Khả năng lãnh đạo của bạn được phát huy tốt trong một dự án nhóm.",
            "Cơ hội thể hiện bản thân trước nhiều người xuất hiện, hãy tự tin nắm bắt.",
            "Tránh áp đặt ý kiến cá nhân quá mức lên đồng nghiệp.",
            "Thành quả công việc gần đây giúp bạn được ghi nhận xứng đáng.",
        ),
        money = listOf(
            "Vận tài lộc khá rực rỡ, nhưng đừng tiêu hoang để thể hiện bản thân.",
            "Một khoản thu bất ngờ có thể đến từ chính tài năng của bạn.",
            "Nên lập quỹ dự phòng trước khi chi cho những thứ phô trương.",
            "Đầu tư vào hình ảnh cá nhân mang lại hiệu quả tốt lúc này.",
        ),
        health = listOf(
            "Năng lượng tích cực giúp bạn tràn đầy sức sống trong các hoạt động.",
            "Lưu ý vùng tim và lưng, tránh vận động quá sức một lúc.",
            "Tinh thần lạc quan giúp bạn phục hồi nhanh nếu có mệt mỏi nhẹ.",
        ),
        luckyNumbers = listOf(1, 4, 19),
        luckyColors = listOf("Vàng gold", "Cam"),
    ),
    "virgo" to FortuneBanks(
        love = listOf(
            "Sự quan tâm chi tiết của bạn khiến nửa kia cảm thấy được trân trọng.",
            "Đừng quá khắt khe khi đối phương mắc một lỗi nhỏ không đáng kể.",
            "Một cuộc hẹn được chuẩn bị kỹ lưỡng sẽ rất đáng nhớ.",
            "Người độc thân nên thử bước ra khỏi vùng an toàn để mở lòng hơn.",
            "Lời góp ý chân thành của bạn cần đi kèm sự nhẹ nhàng hơn.",
        ),
        career = listOf(
            "Sự cẩn thận giúp bạn phát hiện một lỗi nhỏ trước khi nó trở thành vấn đề lớn.",
            "Khối lượng công việc tăng nhưng bạn vẫn xử lý gọn gàng, có hệ thống.",
            "Đồng nghiệp đánh giá cao sự tin cậy và tính chính xác trong công việc của bạn.",
            "Nên ủy quyền một phần việc thay vì cố làm hết mọi thứ một mình.",
        ),
        money = listOf(
            "Quản lý chi tiêu chặt chẽ giúp tài chính của bạn khá ổn định.",
            "Một khoản chi cho sức khỏe hoặc học tập là đầu tư đáng giá lúc này.",
            "Tránh quá tiết kiệm đến mức bỏ lỡ cơ hội tốt.",
            "Kế hoạch tài chính dài hạn của bạn đang đi đúng hướng.",
        ),
        health = listOf(
            "Hệ tiêu hóa cần được chú ý, hạn chế ăn uống vội vàng.",
            "Căng thẳng do cầu toàn có thể ảnh hưởng đến giấc ngủ, hãy thư giãn nhiều hơn.",
            "Một lịch trình tập luyện đều đặn, nhẹ nhàng sẽ rất phù hợp.",
        ),
        luckyNumbers = listOf(3, 15, 22),
        luckyColors = listOf("Xanh navy", "Nâu nhạt"),
    ),
    "libra" to FortuneBanks(
        love = listOf(
            "Mối quan hệ trở nên hài hòa hơn khi cả hai cùng lắng nghe nhau.",
            "Một quyết định chung quan trọng cần được đưa ra, đừng trì hoãn quá lâu.",
            "Sự tinh tế của bạn khiến đối phương cảm thấy được tôn trọng.",
            "Người độc thân có thể bị thu hút bởi một người có gu thẩm mỹ tương đồng.",
            "Tránh chiều theo ý người khác đến mức quên mất cảm xúc của chính mình.",
        ),
        career = listOf(
            "Khả năng dung hòa các ý kiến giúp bạn giải quyết tốt một mâu thuẫn trong nhóm.",
            "Một quyết định công việc cần sự cân nhắc kỹ nhưng đừng để lỡ thời điểm.",
            "Gu thẩm mỹ và sự khéo léo của bạn được phát huy tốt trong dự án hiện tại.",
            "Hợp tác với người khác mang lại kết quả tốt hơn là làm việc đơn lẻ.",
        ),
        money = listOf(
            "Tài chính cân bằng nếu bạn không chi tiêu chỉ để làm hài lòng người khác.",
            "Một cơ hội hợp tác tài chính đôi bên cùng lợi có thể xuất hiện.",
            "Nên so sánh kỹ trước khi quyết định mua sắm món đồ giá trị.",
            "Vận tài lộc khá thuận lợi trong các giao dịch liên quan đến đối tác.",
        ),
        health = listOf(
            "Thận và vùng lưng dưới cần được chú ý, tránh ngồi quá lâu một chỗ.",
            "Tinh thần cân bằng tốt khi bạn dành thời gian cho không gian đẹp, yên tĩnh.",
            "Một buổi đi bộ cùng người thân sẽ giúp cải thiện tâm trạng.",
        ),
        luckyNumbers = listOf(4, 13, 24),
        luckyColors = listOf("Hồng pastel", "Xanh ngọc"),
    ),
    "scorpio" to FortuneBanks(
        love = listOf(
            "Tình cảm sâu đậm hơn khi bạn dám mở lòng chia sẻ cảm xúc thật.",
            "Sự đa nghi không cần thiết có thể làm tổn hại đến niềm tin giữa hai người.",
            "Một bí mật được tiết lộ giúp mối quan hệ trở nên gần gũi hơn.",
            "Người độc thân dễ bị cuốn hút bởi một người có chiều sâu nội tâm.",
            "Lòng trung thành của bạn là điều khiến đối phương an tâm nhất.",
        ),
        career = listOf(
            "Sự tập trung cao độ giúp bạn hoàn thành tốt một việc khó.",
            "Đừng giữ kín thông tin quan trọng với đồng nghiệp cần phối hợp.",
            "Ý chí kiên định giúp bạn vượt qua một trở ngại tưởng như bế tắc.",
            "Một cơ hội thăng tiến có thể đến từ chính sự bền bỉ của bạn.",
        ),
        money = listOf(
            "Tài chính có thể biến động nhẹ, nên kiểm soát chi tiêu chặt hơn.",
            "Một khoản đầu tư cần được nghiên cứu kỹ trước khi quyết định.",
            "Vận tài lộc cải thiện nếu bạn tin tưởng vào trực giác của mình.",
            "Tránh giữ tiền nhàn rỗi quá lâu mà không có kế hoạch cụ thể.",
        ),
        health = listOf(
            "Cảm xúc dồn nén có thể ảnh hưởng đến sức khỏe, hãy giải tỏa kịp thời.",
            "Giấc ngủ sâu giúp bạn phục hồi năng lượng tinh thần tốt hơn.",
            "Nên vận động nhẹ để giảm căng thẳng tích tụ trong người.",
        ),
        luckyNumbers = listOf(8, 11, 27),
        luckyColors = listOf("Đỏ đậm", "Đen"),
    ),
    "sagittarius" to FortuneBanks(
        love = listOf(
            "Tinh thần lạc quan của bạn mang lại nhiều tiếng cười cho mối quan hệ.",
            "Một chuyến đi cùng nhau sẽ giúp tình cảm thêm gắn kết.",
            "Đừng né tránh những cuộc trò chuyện nghiêm túc khi cần thiết.",
            "Người độc thân có thể gặp ai đó thú vị trong một chuyến du lịch hoặc lớp học mới.",
            "Sự thẳng thắn của bạn được đối phương đánh giá cao, dù đôi khi hơi sốc.",
        ),
        career = listOf(
            "Một cơ hội học hỏi hoặc đi công tác mới sẽ mở rộng tầm nhìn của bạn.",
            "Tinh thần lạc quan giúp bạn vượt qua một giai đoạn công việc áp lực.",
            "Tránh hứa hẹn quá nhiều rồi không có thời gian thực hiện.",
            "Ý tưởng đột phá của bạn có thể thuyết phục được cả những người khó tính nhất.",
        ),
        money = listOf(
            "Tài lộc khá hanh thông nếu bạn không chi tiêu quá tay cho du lịch, giải trí.",
            "Một cơ hội kiếm thêm từ sở thích cá nhân có thể xuất hiện.",
            "Nên lập quỹ dự phòng trước khi lên kế hoạch cho chuyến đi sắp tới.",
            "Vận đầu tư khá tốt nếu có sự tìm hiểu kỹ càng trước đó.",
        ),
        health = listOf(
            "Năng lượng dồi dào, rất phù hợp cho các hoạt động ngoài trời.",
            "Chú ý vùng hông và đùi nếu thường xuyên vận động mạnh.",
            "Tinh thần phơi phới giúp bạn dễ lấy lại sức sau những ngày mệt mỏi.",
        ),
        luckyNumbers = listOf(3, 9, 21),
        luckyColors = listOf("Tím", "Xanh dương"),
    ),
    "capricorn" to FortuneBanks(
        love = listOf(
            "Sự đáng tin cậy của bạn là điểm cộng lớn trong mắt nửa kia.",
            "Đừng để công việc chiếm hết thời gian dành cho người bạn yêu thương.",
            "Một lời nói ấm áp đúng lúc sẽ xóa tan khoảng cách giữa hai người.",
            "Người độc thân nên cho bản thân cơ hội thư giãn, cởi mở hơn để gặp người mới.",
            "Tình cảm bền vững hơn khi bạn thể hiện cảm xúc thật, không chỉ qua hành động.",
        ),
        career = listOf(
            "Sự kiên trì giúp một kế hoạch dài hạn của bạn bắt đầu thấy kết quả.",
            "Cấp trên ghi nhận tính kỷ luật và trách nhiệm trong công việc của bạn.",
            "Đừng quá khắt khe với chính mình khi tiến độ chưa như mong đợi.",
            "Một cơ hội thăng tiến đến gần hơn nếu bạn kiên trì thêm một chút.",
        ),
        money = listOf(
            "Tài chính ổn định nhờ thói quen tiết kiệm và lập kế hoạch kỹ lưỡng.",
            "Một khoản đầu tư dài hạn của bạn bắt đầu sinh lời nhẹ.",
            "Nên dành một phần nhỏ để tận hưởng, không nhất thiết phải tiết kiệm tuyệt đối.",
            "Vận tài lộc khá vững nếu bạn không quá thận trọng đến mức bỏ lỡ cơ hội.",
        ),
        health = listOf(
            "Xương khớp và đầu gối cần được chú ý nếu làm việc ngồi nhiều.",
            "Áp lực công việc có thể gây căng thẳng, hãy dành thời gian nghỉ ngơi thực sự.",
            "Một lịch trình ngủ đều đặn sẽ giúp bạn duy trì năng lượng ổn định.",
        ),
        luckyNumbers = listOf(6, 10, 26),
        luckyColors = listOf("Nâu", "Xám đậm"),
    ),
    "aquarius" to FortuneBanks(
        love = listOf(
            "Một cuộc trò chuyện cởi mở giúp đối phương hiểu hơn về thế giới riêng của bạn.",
            "Đừng giữ khoảng cách cảm xúc quá lâu, nửa kia cần cảm nhận được sự quan tâm.",
            "Sự độc lập của bạn được đối phương tôn trọng, nhưng đừng quên dành thời gian cho nhau.",
            "Người độc thân có thể bị thu hút bởi một người có tư duy khác biệt, thú vị.",
            "Ý tưởng mới mẻ của bạn trong cách thể hiện tình cảm khiến mối quan hệ thêm tươi mới.",
        ),
        career = listOf(
            "Góc nhìn sáng tạo của bạn mang lại giải pháp bất ngờ cho một vấn đề cũ.",
            "Làm việc nhóm với những người có chung lý tưởng sẽ hiệu quả hơn lúc này.",
            "Đừng quá cứng nhắc bảo vệ ý tưởng cá nhân khi nhận góp ý từ người khác.",
            "Một dự án liên quan đến công nghệ hoặc cộng đồng phù hợp với bạn lúc này.",
        ),
        money = listOf(
            "Tài chính có thể biến động nếu bạn đầu tư theo cảm tính, thiếu tìm hiểu.",
            "Một cơ hội thu nhập thụ động từ ý tưởng sáng tạo có thể xuất hiện.",
            "Nên cân nhắc kỹ trước khi chi tiền cho công nghệ hoặc thiết bị mới.",
            "Vận tài lộc ổn nếu bạn biết kết hợp giữa lý trí và sự đổi mới.",
        ),
        health = listOf(
            "Hệ tuần hoàn và mắt cá chân cần được chú ý nếu vận động nhiều.",
            "Tinh thần cần không gian riêng để nạp lại năng lượng sau những ngày bận rộn.",
            "Một hoạt động mới lạ sẽ giúp bạn cảm thấy hứng khởi và khỏe khoắn hơn.",
        ),
        luckyNumbers = listOf(4, 11, 22),
        luckyColors = listOf("Xanh điện", "Bạc"),
    ),
    "pisces" to FortuneBanks(
        love = listOf(
            "Sự thấu cảm của bạn giúp mối quan hệ trở nên sâu sắc và ấm áp hơn.",
            "Một giấc mơ hoặc linh cảm có thể mách bảo bạn điều gì đó về đối phương.",
            "Đừng để cảm xúc lấn át lý trí khi đưa ra quyết định quan trọng trong tình cảm.",
            "Người độc thân dễ rơi vào lưới tình qua một kết nối đầy cảm xúc, lãng mạn.",
            "Nghệ thuật hoặc âm nhạc có thể là cầu nối giúp hai người gần nhau hơn.",
        ),
        career = listOf(
            "Trí tưởng tượng phong phú giúp bạn đưa ra một ý tưởng sáng tạo độc đáo.",
            "Cần tỉnh táo hơn để không bị cảm xúc ảnh hưởng đến quyết định công việc.",
            "Một công việc liên quan đến nghệ thuật, chăm sóc người khác rất hợp với bạn lúc này.",
            "Đồng nghiệp đánh giá cao sự tinh tế và khả năng lắng nghe của bạn.",
        ),
        money = listOf(
            "Tài chính dễ bị ảnh hưởng nếu bạn chi tiêu theo cảm xúc nhất thời.",
            "Một khoản chi cho sở thích nghệ thuật mang lại niềm vui tinh thần lớn.",
            "Nên có người lý trí hỗ trợ khi quyết định các vấn đề tài chính lớn.",
            "Vận tài lộc cải thiện nếu bạn lắng nghe trực giác kết hợp với tính toán cẩn thận.",
        ),
        health = listOf(
            "Tinh thần nhạy cảm dễ bị ảnh hưởng bởi môi trường xung quanh, hãy chọn không gian tích cực.",
            "Chân và hệ miễn dịch cần được chú ý khi thời tiết thay đổi.",
            "Thiền hoặc nghe nhạc nhẹ sẽ giúp bạn cân bằng cảm xúc tốt hơn.",
        ),
        luckyNumbers = listOf(3, 12, 29),
        luckyColors = listOf("Xanh biển", "Tím nhạt"),
    ),
)
