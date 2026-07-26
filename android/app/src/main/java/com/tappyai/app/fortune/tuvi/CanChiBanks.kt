package com.tappyai.app.fortune.tuvi

import com.tappyai.app.fortune.engine.FortuneBanks

/** Can-chi fortune banks, transcribed VERBATIM from prod `src/lib/boi/canChiData.ts` (worktree
 *  cool-vaughan-b3c7ff). Keyed by the web string id (the engine seed) — must match web exactly for
 *  byte-identical readings. Index 0..11 = ((year-4)%12). Note: Tỵ (snake) id is `ty2`. */
internal val CANCHI_SEED_IDS: List<String> = listOf(
    // the 12 web ids in the SAME order as the prod CAN_CHI array (index 0..11):
    // ty, suu, dan, mao, thin, ty2, ngo, mui, than, dau, tuat, hoi
    "ty", "suu", "dan", "mao", "thin", "ty2", "ngo", "mui", "than", "dau", "tuat", "hoi",
)

internal val CANCHI_BANKS: Map<String, FortuneBanks> = mapOf(
    "ty" to FortuneBanks(
        love = listOf(
            "Tình duyên khởi sắc nhờ sự khéo léo và tinh ý của bạn trong cách quan tâm đối phương.",
            "Một lời nói vô tình có thể gây hiểu lầm nhỏ, nên giải thích rõ sớm.",
            "Người độc thân có cơ hội gặp đối tượng phù hợp qua bạn bè giới thiệu.",
            "Sự tinh tế giúp bạn nhận ra điều nửa kia đang cần mà không cần họ nói ra.",
        ),
        career = listOf(
            "Khả năng xoay sở linh hoạt giúp bạn giải quyết gọn một việc khó trong công việc.",
            "Cơ hội mới xuất hiện bất ngờ, hãy nhanh tay nắm bắt trước khi vuột mất.",
            "Cẩn trọng với những lời mời hợp tác chưa rõ ràng về điều khoản.",
            "Sự nhạy bén giúp bạn phát hiện sớm một rủi ro tiềm ẩn trong dự án.",
        ),
        money = listOf(
            "Tài lộc khá thuận, tính tiết kiệm giúp bạn có một khoản dự phòng ổn.",
            "Có thể có thêm thu nhập nhỏ từ một mối quan hệ hoặc cơ hội bất ngờ.",
            "Nên cẩn trọng với các lời mời đầu tư sinh lời nhanh, dễ rủi ro.",
            "Quản lý chi tiêu chặt chẽ giúp bạn tránh được một khoản phát sinh không đáng.",
        ),
        health = listOf(
            "Hệ thần kinh cần được thư giãn, tránh suy nghĩ quá nhiều việc cùng lúc.",
            "Giấc ngủ chập chờn gần đây, nên hạn chế dùng điện thoại trước khi ngủ.",
            "Sức khỏe tổng quan ổn nếu duy trì thói quen ăn uống đúng giờ.",
        ),
        luckyNumbers = listOf(2, 3, 8),
        luckyColors = listOf("Xanh dương", "Vàng kim"),
    ),
    "suu" to FortuneBanks(
        love = listOf(
            "Sự chân thành, bền bỉ của bạn dần khiến đối phương thêm tin tưởng.",
            "Đừng quá im lặng, hãy chủ động nói ra cảm xúc thật của mình.",
            "Một kỷ niệm cũ được nhắc lại giúp tình cảm thêm gắn bó.",
            "Người độc thân nên cởi mở hơn, đừng chỉ chờ đợi cơ hội tự đến.",
        ),
        career = listOf(
            "Sự cần cù của bạn bắt đầu mang lại thành quả rõ rệt, đáng được công nhận.",
            "Một việc tồn đọng lâu nay có thể được giải quyết dứt điểm trong giai đoạn này.",
            "Tránh quá bảo thủ với cách làm cũ khi tình huống đã thay đổi.",
            "Đồng nghiệp đánh giá cao sự đáng tin cậy mà bạn thể hiện hằng ngày.",
        ),
        money = listOf(
            "Tài lộc tích lũy dần đều, phù hợp với người có kế hoạch dài hạn như bạn.",
            "Một khoản đầu tư kiên trì từ trước có dấu hiệu sinh lời.",
            "Nên tránh chi tiêu lớn cho những thứ chưa thật cần thiết lúc này.",
            "Vận tài chính ổn nếu bạn không quá keo kiệt với chính mình.",
        ),
        health = listOf(
            "Xương khớp và vùng lưng cần được chú ý nếu làm việc nặng nhiều.",
            "Nên dành thời gian nghỉ ngơi thay vì cố làm việc đến khi thật mệt.",
            "Một chế độ ăn cân bằng sẽ giúp bạn duy trì sức bền tốt hơn.",
        ),
        luckyNumbers = listOf(1, 9, 17),
        luckyColors = listOf("Trắng", "Xanh lá"),
    ),
    "dan" to FortuneBanks(
        love = listOf(
            "Sự mạnh mẽ, bảo vệ của bạn khiến nửa kia cảm thấy an toàn.",
            "Tránh nóng giận trong một cuộc tranh luận nhỏ, hãy bình tĩnh lắng nghe.",
            "Người độc thân dễ thu hút người khác bởi sự tự tin, bản lĩnh.",
            "Một quyết định quan trọng trong tình cảm cần thêm thời gian suy xét.",
        ),
        career = listOf(
            "Tinh thần quyết đoán giúp bạn xử lý dứt khoát một vấn đề khó.",
            "Cơ hội thể hiện vai trò lãnh đạo xuất hiện, hãy tự tin nắm bắt.",
            "Nóng tính nhất thời có thể làm hỏng một mối quan hệ hợp tác tốt.",
            "Sự dũng cảm của bạn giúp dự án vượt qua giai đoạn khó khăn nhất.",
        ),
        money = listOf(
            "Tài lộc có thể tăng nhờ một quyết định táo bạo nhưng có tính toán.",
            "Tránh đầu tư theo cảm tính nhất thời, dễ dẫn đến thua lỗ.",
            "Một cơ hội kinh doanh mới đáng để bạn xem xét kỹ.",
            "Nên giữ lại một khoản dự phòng trước khi mạo hiểm với số tiền lớn.",
        ),
        health = listOf(
            "Năng lượng mạnh mẽ nhưng dễ gây áp lực lên gan, hạn chế rượu bia.",
            "Nên kiểm soát cảm xúc để tránh ảnh hưởng đến huyết áp.",
            "Vận động thể thao cường độ cao rất phù hợp để giải tỏa năng lượng.",
        ),
        luckyNumbers = listOf(1, 3, 13),
        luckyColors = listOf("Cam", "Xanh rừng"),
    ),
    "mao" to FortuneBanks(
        love = listOf(
            "Sự dịu dàng, tinh tế của bạn khiến mối quan hệ luôn nhẹ nhàng, dễ chịu.",
            "Đừng quá nhạy cảm với một câu nói đùa vô ý của đối phương.",
            "Người độc thân có duyên gặp gỡ qua những hoạt động nghệ thuật, thẩm mỹ.",
            "Một món quà nhỏ tinh tế sẽ khiến nửa kia rất cảm động.",
        ),
        career = listOf(
            "Khả năng giao tiếp khéo léo giúp bạn tạo thiện cảm với khách hàng, đối tác.",
            "Một ý tưởng liên quan đến thẩm mỹ, sáng tạo được đánh giá cao.",
            "Tránh để cảm xúc cá nhân ảnh hưởng đến quyết định công việc.",
            "Mối quan hệ tốt với đồng nghiệp giúp công việc thuận lợi hơn.",
        ),
        money = listOf(
            "Tài lộc ổn định, phù hợp để chi cho những thứ mang giá trị thẩm mỹ, tinh thần.",
            "Nên cân nhắc kỹ trước khi mua sắm theo cảm xúc nhất thời.",
            "Một cơ hội tài chính nhỏ đến từ mối quan hệ xã hội của bạn.",
            "Vận tài chính khá tốt nếu bạn biết tận dụng sự khéo léo của mình.",
        ),
        health = listOf(
            "Tinh thần nhạy cảm dễ bị ảnh hưởng bởi môi trường xung quanh.",
            "Da và hệ hô hấp cần được chăm sóc kỹ khi thời tiết thay đổi.",
            "Một không gian sống gọn gàng, đẹp mắt giúp bạn thấy thoải mái hơn.",
        ),
        luckyNumbers = listOf(4, 6, 22),
        luckyColors = listOf("Hồng", "Xanh nhạt"),
    ),
    "thin" to FortuneBanks(
        love = listOf(
            "Sức hút tự nhiên của bạn khiến nửa kia luôn cảm thấy tự hào khi ở bên.",
            "Đừng để cái tôi quá lớn làm tổn thương cảm xúc của đối phương.",
            "Người độc thân thu hút sự chú ý đặc biệt tại một sự kiện quan trọng.",
            "Một cử chỉ khiêm nhường nhỏ sẽ khiến tình cảm thêm bền chặt.",
        ),
        career = listOf(
            "Tham vọng lớn của bạn được tiếp sức bởi một cơ hội đáng giá xuất hiện.",
            "Khí chất lãnh đạo giúp bạn ghi điểm trong mắt cấp trên.",
            "Tránh áp đặt quan điểm cá nhân lên toàn bộ tập thể.",
            "Một dự án quan trọng cần sự phối hợp khéo léo hơn là chỉ làm theo ý mình.",
        ),
        money = listOf(
            "Vận tài lộc khá rực rỡ, có thể đến từ một cơ hội lớn bất ngờ.",
            "Tránh đầu tư quá tay vào những thứ phô trương, hình thức.",
            "Một quyết định tài chính táo bạo cần có sự tính toán kỹ càng.",
            "Nên chia sẻ thành quả với người đã đồng hành cùng bạn.",
        ),
        health = listOf(
            "Năng lượng dồi dào nhưng dễ chủ quan với sức khỏe, đừng quên nghỉ ngơi.",
            "Huyết áp và tim mạch cần được theo dõi nếu làm việc áp lực cao.",
            "Một chuyến đi xa sẽ giúp bạn nạp lại năng lượng tích cực.",
        ),
        luckyNumbers = listOf(1, 7, 16),
        luckyColors = listOf("Vàng", "Đỏ"),
    ),
    "ty2" to FortuneBanks(
        love = listOf(
            "Trực giác nhạy giúp bạn hiểu rõ điều đối phương chưa nói ra.",
            "Sự kín đáo của bạn nên đi kèm với chia sẻ nhiều hơn để đối phương an tâm.",
            "Người độc thân có duyên gặp người đặc biệt qua một mối quan hệ quen biết.",
            "Một hiểu lầm nhỏ cần được làm rõ sớm để tránh xa cách.",
        ),
        career = listOf(
            "Sự khôn khéo giúp bạn xử lý êm đẹp một tình huống nhạy cảm trong công việc.",
            "Trực giác tốt giúp bạn nhận ra cơ hội mà người khác chưa thấy.",
            "Tránh quá kín tiếng khi cần sự hỗ trợ từ đồng nghiệp.",
            "Một kế hoạch âm thầm chuẩn bị từ trước bắt đầu cho thấy hiệu quả.",
        ),
        money = listOf(
            "Tài lộc có thể đến từ một nguồn kín đáo, không ngờ tới.",
            "Sự cẩn trọng giúp bạn tránh được một quyết định đầu tư rủi ro.",
            "Nên tin vào trực giác khi cân nhắc một cơ hội tài chính mới.",
            "Vận tài chính ổn nếu bạn không quá giữ kín thông tin với người cần biết.",
        ),
        health = listOf(
            "Hệ thần kinh cần được thư giãn, tránh suy nghĩ quá nhiều về người khác.",
            "Da và gan cần được chú ý, hạn chế thức khuya kéo dài.",
            "Thiền hoặc yoga nhẹ sẽ giúp bạn cân bằng nội tâm tốt hơn.",
        ),
        luckyNumbers = listOf(2, 8, 19),
        luckyColors = listOf("Đen", "Đỏ thẫm"),
    ),
    "ngo" to FortuneBanks(
        love = listOf(
            "Sự nhiệt tình, vui vẻ của bạn mang lại nhiều năng lượng tích cực cho mối quan hệ.",
            "Đừng để sự tự do cá nhân khiến đối phương cảm thấy bị bỏ quên.",
            "Người độc thân có cơ hội gặp ai đó thú vị trong một hoạt động ngoài trời.",
            "Một lời hứa cần được thực hiện đúng để giữ niềm tin từ nửa kia.",
        ),
        career = listOf(
            "Năng lượng tích cực giúp bạn lan tỏa cảm hứng cho cả nhóm làm việc.",
            "Một chuyến đi công tác hoặc thay đổi môi trường mang lại cơ hội mới.",
            "Cần kiên định hơn để hoàn thành một dự án đã bắt đầu từ lâu.",
            "Khả năng kết nối tốt giúp bạn xây dựng được mạng lưới quan hệ giá trị.",
        ),
        money = listOf(
            "Tài lộc khá thông thoáng nếu bạn không tiêu hết cho những chuyến đi, vui chơi.",
            "Một cơ hội kiếm thêm từ mối quan hệ rộng có thể xuất hiện.",
            "Nên lập kế hoạch chi tiêu rõ ràng để tránh tiêu vượt mức.",
            "Vận tài chính cải thiện khi bạn kiên định với một kế hoạch cụ thể.",
        ),
        health = listOf(
            "Năng lượng dồi dào, rất phù hợp cho các hoạt động thể chất ngoài trời.",
            "Chân và khớp gối cần được chú ý nếu vận động cường độ cao.",
            "Nên cân bằng giữa vui chơi và nghỉ ngơi để tránh kiệt sức.",
        ),
        luckyNumbers = listOf(2, 5, 14),
        luckyColors = listOf("Đỏ", "Tím"),
    ),
    "mui" to FortuneBanks(
        love = listOf(
            "Sự chân thành, ấm áp của bạn khiến mối quan hệ luôn bền vững.",
            "Đừng lo lắng quá nhiều về những điều chưa xảy ra trong tình cảm.",
            "Người độc thân dễ được chú ý nhờ sự dịu dàng, chu đáo tự nhiên.",
            "Một buổi tối yên tĩnh cùng nhau sẽ giúp tình cảm thêm gắn kết.",
        ),
        career = listOf(
            "Sự tận tâm của bạn được đồng nghiệp và khách hàng đánh giá cao.",
            "Một công việc liên quan đến nghệ thuật, chăm sóc rất hợp với bạn lúc này.",
            "Tránh lo lắng thái quá về một việc nhỏ chưa chắc đã xảy ra.",
            "Sự hợp tác nhẹ nhàng, chân thành giúp công việc nhóm thuận lợi hơn.",
        ),
        money = listOf(
            "Tài lộc ổn định nếu bạn không quá rộng tay vì cả nể người khác.",
            "Một khoản chi cho gia đình hoặc người thân là việc nên làm lúc này.",
            "Nên tự tin hơn khi đưa ra quyết định tài chính của riêng mình.",
            "Vận tài chính khá tốt khi bạn biết cân bằng giữa cho và nhận.",
        ),
        health = listOf(
            "Tinh thần dễ lo âu, nên dành thời gian cho những hoạt động thư giãn.",
            "Hệ tiêu hóa cần được chú ý, ăn uống đúng giờ và đủ chất.",
            "Một không gian sống ấm cúng giúp bạn cảm thấy an yên hơn.",
        ),
        luckyNumbers = listOf(3, 9, 24),
        luckyColors = listOf("Xanh lá", "Vàng nhạt"),
    ),
    "than" to FortuneBanks(
        love = listOf(
            "Sự hài hước, dí dỏm của bạn luôn mang lại tiếng cười cho mối quan hệ.",
            "Đừng đùa quá đà khiến đối phương hiểu nhầm thành thiếu nghiêm túc.",
            "Người độc thân dễ tạo thiện cảm ban đầu nhờ sự lôi cuốn tự nhiên.",
            "Một sự kiên nhẫn nhỏ trong giao tiếp sẽ giúp hai người hiểu nhau hơn.",
        ),
        career = listOf(
            "Sự nhanh nhạy giúp bạn xử lý gọn một tình huống bất ngờ trong công việc.",
            "Ý tưởng sáng tạo của bạn được đón nhận tích cực từ nhóm làm việc.",
            "Tránh bỏ cuộc giữa đường khi công việc trở nên lặp lại, nhàm chán.",
            "Khả năng ứng biến linh hoạt giúp bạn ghi điểm trước khách hàng khó tính.",
        ),
        money = listOf(
            "Tài lộc có thể đến từ một ý tưởng kinh doanh sáng tạo, mới lạ.",
            "Nên kiên trì với một kế hoạch tài chính thay vì đổi hướng liên tục.",
            "Một cơ hội kiếm thêm thu nhập linh hoạt phù hợp với bạn lúc này.",
            "Vận tài chính khá tốt nếu bạn không quá ham những lợi ích ngắn hạn.",
        ),
        health = listOf(
            "Đầu óc hoạt động liên tục, nên dành thời gian nghỉ ngơi cho tinh thần.",
            "Tay và cổ tay cần được chú ý nếu làm việc với máy tính nhiều.",
            "Một hoạt động mới lạ sẽ giúp bạn duy trì sự hứng khởi, năng động.",
        ),
        luckyNumbers = listOf(1, 6, 15),
        luckyColors = listOf("Trắng", "Xanh dương"),
    ),
    "dau" to FortuneBanks(
        love = listOf(
            "Sự chỉn chu, quan tâm chi tiết của bạn khiến nửa kia cảm thấy được yêu thương.",
            "Đừng so sánh mối quan hệ của mình với người khác, mỗi cặp đôi có nhịp riêng.",
            "Người độc thân tạo ấn tượng tốt nhờ vẻ ngoài chỉn chu, tự tin.",
            "Một buổi hẹn được chuẩn bị kỹ lưỡng sẽ ghi điểm với đối phương.",
        ),
        career = listOf(
            "Tinh thần trách nhiệm cao giúp bạn được giao thêm việc quan trọng.",
            "Sự tự tin giúp bạn thể hiện tốt trong một buổi thuyết trình hoặc phỏng vấn.",
            "Tránh quá khắt khe với đồng nghiệp khi họ chưa làm đúng ý bạn.",
            "Một thành quả công việc gần đây xứng đáng được bạn tự hào.",
        ),
        money = listOf(
            "Tài lộc ổn định nhờ tính kế hoạch và chỉn chu trong chi tiêu.",
            "Một khoản đầu tư cho hình ảnh cá nhân hoặc kỹ năng mang lại hiệu quả tốt.",
            "Tránh so sánh tài chính của mình với người khác rồi chi tiêu theo cảm xúc.",
            "Vận tài chính khá tốt nếu bạn duy trì được kỷ luật đã đặt ra.",
        ),
        health = listOf(
            "Áp lực phải hoàn hảo có thể gây căng thẳng, hãy cho bản thân thời gian nghỉ.",
            "Họng và hệ hô hấp cần được chú ý khi thời tiết chuyển mùa.",
            "Một chế độ luyện tập đều đặn giúp bạn duy trì vóc dáng và tinh thần tốt.",
        ),
        luckyNumbers = listOf(5, 7, 23),
        luckyColors = listOf("Vàng", "Nâu"),
    ),
    "tuat" to FortuneBanks(
        love = listOf(
            "Sự trung thành, hết lòng của bạn là điều khiến đối phương luôn an tâm.",
            "Đừng quá lo lắng hay đề phòng khi chưa có lý do rõ ràng.",
            "Người độc thân dễ tạo dựng niềm tin nhanh nhờ sự chân thật tự nhiên.",
            "Một hành động nhỏ thể hiện sự quan tâm sẽ được đối phương ghi nhận.",
        ),
        career = listOf(
            "Tinh thần trách nhiệm và công bằng giúp bạn được đồng nghiệp tin tưởng.",
            "Một vấn đề cần sự công bằng, khách quan đang chờ bạn xử lý tốt.",
            "Tránh đề phòng thái quá khiến hợp tác trở nên khó khăn hơn.",
            "Sự kiên định với nguyên tắc giúp bạn được đánh giá là người đáng tin cậy.",
        ),
        money = listOf(
            "Tài lộc ổn định nhờ thói quen chi tiêu có nguyên tắc, rõ ràng.",
            "Một khoản hỗ trợ từ người thân hoặc bạn thân có thể xuất hiện.",
            "Tránh quá đề phòng đến mức bỏ lỡ một cơ hội hợp tác tốt.",
            "Vận tài chính khá vững nếu bạn tin tưởng đúng người để hợp tác.",
        ),
        health = listOf(
            "Tinh thần dễ lo âu, nên dành thời gian cho những hoạt động giải tỏa căng thẳng.",
            "Hệ xương khớp cần được chú ý nếu thường xuyên vận động mạnh.",
            "Một giấc ngủ đủ và đều đặn giúp bạn duy trì sự tỉnh táo, vững vàng.",
        ),
        luckyNumbers = listOf(3, 10, 19),
        luckyColors = listOf("Đỏ", "Xanh navy"),
    ),
    "hoi" to FortuneBanks(
        love = listOf(
            "Sự chân thành, hào sảng của bạn khiến mối quan hệ luôn ấm áp, dễ chịu.",
            "Đừng quá cả tin trước những lời nói chưa được kiểm chứng từ người khác.",
            "Người độc thân dễ được yêu thích nhờ tính cách hiền lành, dễ gần.",
            "Một bữa ăn ngon cùng nhau sẽ giúp tình cảm thêm gắn kết.",
        ),
        career = listOf(
            "Sự chân thành trong công việc giúp bạn xây dựng được mối quan hệ tốt với đồng nghiệp.",
            "Một cơ hội hợp tác hấp dẫn xuất hiện, nhưng cần xem kỹ điều khoản trước khi nhận.",
            "Tránh quá dễ tính khiến công việc bị người khác lợi dụng.",
            "Sự hào sảng của bạn được mọi người quý trọng và sẵn sàng hỗ trợ lại.",
        ),
        money = listOf(
            "Tài lộc khá rộng mở, nhưng cần tỉnh táo trước những lời mời hợp tác hấp dẫn.",
            "Một khoản chi cho việc hưởng thụ cuộc sống là hợp lý, miễn không quá đà.",
            "Nên kiểm tra kỹ trước khi cho vay mượn hoặc đầu tư theo lời giới thiệu.",
            "Vận tài chính ổn nếu bạn biết giữ một khoản dự phòng riêng cho mình.",
        ),
        health = listOf(
            "Hệ tiêu hóa cần được chú ý nếu ăn uống quá thoải mái gần đây.",
            "Nên duy trì vận động đều đặn để tránh tăng cân ngoài ý muốn.",
            "Tinh thần lạc quan giúp bạn dễ phục hồi sau những ngày mệt mỏi.",
        ),
        luckyNumbers = listOf(2, 8, 26),
        luckyColors = listOf("Vàng", "Xám nhạt"),
    ),
)

/* getNguHanhByYear (prod) — digit → element mapping (year % 10 = last digit):
 *   0, 1 -> Kim
 *   2, 3 -> Thủy
 *   4, 5 -> Mộc
 *   6, 7 -> Hỏa
 *   8, 9 -> Thổ  (default / else branch)
 */
