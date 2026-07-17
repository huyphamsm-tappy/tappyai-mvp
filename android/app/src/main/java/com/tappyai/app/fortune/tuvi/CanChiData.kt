package com.tappyai.app.fortune.tuvi

data class CanChi(
    val id: Int,
    val emoji: String,
    val nameVi: String,
    val animalVi: String,
    val traits: String,
)

data class TuViReading(
    val periodLabel: String,
    val love: String,
    val career: String,
    val money: String,
    val health: String,
    val score: Int,
)

private val CAN_CHI: List<CanChi> = listOf(
    CanChi(0, "🐭", "Canh Tý", "Chuột", "Thông minh, nhanh nhẹn, có khiếu kinh doanh và rất nhạy cảm với xu hướng."),
    CanChi(1, "🐮", "Tân Sửu", "Trâu", "Cần cù, bền bỉ, đáng tin cậy và luôn hoàn thành những gì đã cam kết."),
    CanChi(2, "🐯", "Nhâm Dần", "Hổ", "Can đảm, quyết đoán, có khả năng lãnh đạo và không sợ thử thách."),
    CanChi(3, "🐰", "Quý Mão", "Mèo", "Khéo léo, tinh tế, có gu thẩm mỹ tốt và biết cách duy trì hòa khí."),
    CanChi(4, "🐲", "Giáp Thìn", "Rồng", "Tự tin, sáng tạo, có tầm nhìn xa và thường đạt được những điều vĩ đại."),
    CanChi(5, "🐍", "Ất Tỵ", "Rắn", "Khôn ngoan, trực giác tốt, bí ẩn và có chiều sâu tâm lý đặc biệt."),
    CanChi(6, "🐴", "Bính Ngọ", "Ngựa", "Năng động, tự do, nhiệt huyết và luôn khát khao những điều mới mẻ."),
    CanChi(7, "🐏", "Đinh Mùi", "Dê", "Sáng tạo, nhân từ, nhạy cảm và có tâm hồn nghệ sĩ phong phú."),
    CanChi(8, "🐵", "Mậu Thân", "Khỉ", "Lanh lợi, thích nghi tốt, hài hước và luôn tìm ra giải pháp mới."),
    CanChi(9, "🐓", "Kỷ Dậu", "Gà", "Tỉ mỉ, chăm chỉ, thẳng thắn và có trách nhiệm cao với công việc."),
    CanChi(10, "🐶", "Canh Tuất", "Chó", "Trung thành, chính trực, bảo vệ người thân và luôn đứng về phía công lý."),
    CanChi(11, "🐷", "Tân Hợi", "Heo", "Hào phóng, chân thành, yêu hòa bình và biết tận hưởng cuộc sống."),
)

private val READINGS: Map<Int, List<TuViReading>> = mapOf(
    0 to listOf(
        TuViReading("Hôm nay", "Ngày lý tưởng để thể hiện cảm xúc với người thân.", "Công việc suôn sẻ, ý tưởng sáng tạo được đón nhận.", "Cơ hội nhỏ từ chi tiêu thông minh.", "Năng lượng tốt, duy trì thói quen lành mạnh.", 4),
        TuViReading("Tuần này", "Tình cảm phát triển tích cực, giao tiếp cởi mở.", "Tuần bận rộn nhưng kết quả xứng đáng.", "Nên tiết kiệm thay vì chi tiêu tự do.", "Chú ý nghỉ ngơi đủ giấc.", 3),
        TuViReading("Tháng này", "Khả năng gặp được người phù hợp hoặc mối quan hệ thăng hoa.", "Tháng tốt để đề xuất ý tưởng và dự án mới.", "Tài chính ổn định, tránh đầu tư rủi ro.", "Sức khỏe tốt nếu duy trì tập thể dục.", 4),
    ),
    1 to listOf(
        TuViReading("Hôm nay", "Cần kiên nhẫn hơn với người yêu hoặc bạn đời.", "Ngày làm việc hiệu quả, đặc biệt là công việc cần sự tỉ mỉ.", "Tránh chi tiêu bốc đồng hôm nay.", "Cơ thể cần được nghỉ ngơi sau nhiều ngày làm việc.", 3),
        TuViReading("Tuần này", "Thời gian chất lượng với gia đình mang lại hạnh phúc.", "Dự án dài hạn tiến triển tốt, đừng vội vàng.", "Tiết kiệm được một khoản nhỏ trong tuần.", "Duy trì sức khỏe ổn định, ăn uống điều độ.", 4),
        TuViReading("Tháng này", "Mối quan hệ ổn định và bền vững, cảm giác an toàn.", "Sự kiên trì sẽ mang lại kết quả xứng đáng.", "Tháng tốt để lập kế hoạch tài chính dài hạn.", "Chú ý đến sức khỏe cột sống và tiêu hóa.", 3),
    ),
    2 to listOf(
        TuViReading("Hôm nay", "Có thể xảy ra tranh luận nho nhỏ, hãy bình tĩnh xử lý.", "Ngày phù hợp để thể hiện năng lực và tầm nhìn.", "Cơ hội tài chính đến bất ngờ, hãy cân nhắc kỹ.", "Sức khỏe tốt, có nhiều năng lượng.", 4),
        TuViReading("Tuần này", "Tình cảm nồng nàn, nhưng hãy lắng nghe đối phương.", "Tuần có nhiều thử thách nhưng bạn đủ sức vượt qua.", "Kiểm soát chi tiêu, tránh những khoản không cần thiết.", "Cần giải tỏa căng thẳng qua thể dục hoặc giải trí.", 3),
        TuViReading("Tháng này", "Tháng thuận lợi cho việc bày tỏ tình cảm hoặc bắt đầu mối quan hệ mới.", "Cơ hội thăng tiến đang đến gần.", "Tài chính có chuyển biến tích cực cuối tháng.", "Chú ý đến hệ miễn dịch và nghỉ ngơi hợp lý.", 5),
    ),
    3 to listOf(
        TuViReading("Hôm nay", "Ngày lãng mạn, phù hợp để dành thời gian cho tình yêu.", "Công việc sáng tạo đặc biệt thuận lợi hôm nay.", "Đừng để cảm xúc ảnh hưởng đến quyết định tài chính.", "Sức khỏe tốt, tâm trạng vui vẻ.", 5),
        TuViReading("Tuần này", "Hài hòa trong mọi mối quan hệ, nhận được nhiều yêu thương.", "Tuần làm việc nhẹ nhàng nhưng hiệu quả.", "Chi tiêu cho bản thân là điều bạn xứng đáng.", "Duy trì cân bằng giữa làm việc và nghỉ ngơi.", 4),
        TuViReading("Tháng này", "Tháng có nhiều kỷ niệm đẹp với người thân yêu.", "Dự án sáng tạo mang lại thành công và công nhận.", "Tháng tốt nhưng hãy cẩn thận với chi tiêu xa xỉ.", "Sức khỏe nhìn chung tốt, hãy tận hưởng cuộc sống.", 4),
    ),
    4 to listOf(
        TuViReading("Hôm nay", "Cơ hội gặp gỡ người đặc biệt hoặc tăng cường tình cảm.", "Ngày của những quyết định táo bạo và sáng suốt.", "Tiềm năng tài chính tốt, hãy nắm bắt cơ hội.", "Sức khỏe dồi dào, nhiều năng lượng.", 5),
        TuViReading("Tuần này", "Mối quan hệ phát triển mạnh, bạn trở nên hấp dẫn hơn.", "Tuần bận rộn nhưng đầy thành tựu.", "Đầu tư thông minh có thể mang lại lợi nhuận tốt.", "Chú ý đến sức khỏe tim mạch và vận động.", 4),
        TuViReading("Tháng này", "Tháng xuất sắc cho tình yêu và các mối quan hệ xã hội.", "Lãnh đạo tốt sẽ được ghi nhận và thăng tiến.", "Tài chính tăng trưởng, cơ hội đầu tư tốt.", "Duy trì sức khỏe bằng chế độ ăn cân bằng.", 5),
    ),
    5 to listOf(
        TuViReading("Hôm nay", "Trực giác mách bảo điều đúng đắn trong tình cảm.", "Ngày tốt để lên kế hoạch dài hạn.", "Hãy cẩn thận với các giao dịch tài chính.", "Sức khỏe ổn, hãy lắng nghe cơ thể.", 3),
        TuViReading("Tuần này", "Sự bí ẩn của bạn thu hút sự chú ý.", "Tuần làm việc sâu sắc và có chiều sâu.", "Tránh vay mượn hoặc cho vay tuần này.", "Thiền định giúp tái tạo năng lượng.", 3),
        TuViReading("Tháng này", "Mối quan hệ có chiều sâu và ý nghĩa hơn.", "Kế hoạch dài hạn bắt đầu cho thấy kết quả.", "Tài chính ổn định, hãy tiếp tục kiên nhẫn.", "Chú ý đến hệ tiêu hóa và thần kinh.", 4),
    ),
    6 to listOf(
        TuViReading("Hôm nay", "Năng động trong tình yêu nhưng đừng quá vội vã.", "Ngày phù hợp cho các cuộc họp và thương thảo.", "Hãy kiểm tra lại các khoản chi hôm nay.", "Tràn đầy sức sống, tận dụng để vận động.", 4),
        TuViReading("Tuần này", "Sự nhiệt tình của bạn lan tỏa đến người xung quanh.", "Tuần của những ý tưởng mới và cơ hội bất ngờ.", "Quản lý chi tiêu chặt chẽ hơn trong tuần.", "Năng lượng cao nhưng cần nghỉ ngơi đầy đủ.", 4),
        TuViReading("Tháng này", "Tháng sôi động trong tình cảm với nhiều cuộc hẹn hò.", "Cơ hội nghề nghiệp mới đang mở ra.", "Tài chính biến động, hãy linh hoạt ứng phó.", "Chú ý đến hệ xương khớp khi vận động nhiều.", 3),
    ),
    7 to listOf(
        TuViReading("Hôm nay", "Ngày tuyệt vời để bày tỏ tình cảm qua nghệ thuật.", "Công việc sáng tạo đạt đỉnh cao.", "Tránh quyết định tài chính lớn khi đang cảm xúc.", "Sức khỏe tinh thần tốt, thể chất cần chú ý hơn.", 4),
        TuViReading("Tuần này", "Nhận được nhiều yêu thương và trân trọng từ người xung quanh.", "Tuần của sự sáng tạo và nghệ thuật.", "Tuần bình ổn về tài chính.", "Yoga hoặc thiền định giúp cân bằng năng lượng.", 3),
        TuViReading("Tháng này", "Tháng ngọt ngào và lãng mạn, đặc biệt vào nửa cuối.", "Dự án sáng tạo được đền đáp xứng đáng.", "Tài chính ổn định, tránh cho vay tiền.", "Duy trì sức khỏe bằng chế độ dinh dưỡng tốt.", 4),
    ),
    8 to listOf(
        TuViReading("Hôm nay", "Duyên số bất ngờ có thể xuất hiện hôm nay.", "Khả năng thích nghi giúp bạn xử lý tốt mọi tình huống.", "Cơ hội tài chính nhỏ từ mạng xã hội.", "Giữ sức khỏe bằng cách kiểm soát căng thẳng.", 4),
        TuViReading("Tuần này", "Tình yêu thú vị và đầy bất ngờ.", "Tuần năng động với nhiều ý tưởng độc đáo.", "Cơ hội kiếm thêm thu nhập từ kỹ năng đặc biệt.", "Sức khỏe tốt nếu duy trì giấc ngủ đều đặn.", 4),
        TuViReading("Tháng này", "Tháng của những cuộc phiêu lưu trong tình yêu.", "Sự linh hoạt giúp bạn thành công trong công việc.", "Tài chính cải thiện nhờ ý tưởng sáng tạo.", "Chú ý đến hệ thần kinh và não bộ.", 3),
    ),
    9 to listOf(
        TuViReading("Hôm nay", "Hãy thể hiện sự quan tâm bằng hành động cụ thể.", "Ngày hoàn hảo để hoàn thiện các chi tiết công việc.", "Kiểm tra lại tình hình tài chính hôm nay.", "Sức khỏe ổn định, duy trì lịch trình đều đặn.", 3),
        TuViReading("Tuần này", "Sự chăm chỉ của bạn được người thân đánh giá cao.", "Tuần hoàn thành nhiều công việc tồn đọng.", "Tiết kiệm tốt hơn nhờ kế hoạch chi tiêu rõ ràng.", "Chú ý đến hệ tiêu hóa và thói quen ăn uống.", 4),
        TuViReading("Tháng này", "Mối quan hệ ổn định và đáng tin cậy.", "Sự chăm chỉ được thưởng xứng đáng cuối tháng.", "Tháng tốt để tăng tiết kiệm và giảm nợ.", "Sức khỏe cần được chú ý nhiều hơn.", 3),
    ),
    10 to listOf(
        TuViReading("Hôm nay", "Ngày tốt để vun đắp và bảo vệ mối quan hệ quan trọng.", "Trung thực và chính trực giúp bạn tiến xa.", "Tài chính ổn định, tránh rủi ro không cần thiết.", "Sức khỏe tốt, có nhiều năng lượng.", 4),
        TuViReading("Tuần này", "Sự trung thành của bạn được đền đáp.", "Tuần làm việc hiệu quả với tinh thần trách nhiệm cao.", "Quản lý tài chính cẩn thận, đặc biệt chi tiêu gia đình.", "Duy trì vận động thể chất và ngủ đủ giấc.", 4),
        TuViReading("Tháng này", "Tháng của sự vun đắp và ổn định trong tình cảm.", "Phẩm chất trung thực giúp bạn thăng tiến.", "Tài chính ổn định, tháng tốt để đầu tư an toàn.", "Sức khỏe nhìn chung tốt, tận hưởng cuộc sống.", 5),
    ),
    11 to listOf(
        TuViReading("Hôm nay", "Ngày hào phóng với tình yêu, nhận và cho đi đều nhiều.", "Công việc thuận lợi, được đồng nghiệp hỗ trợ.", "Hãy cẩn thận khi chi tiêu cho người khác hôm nay.", "Sức khỏe tốt, tâm trạng vui vẻ và thoải mái.", 4),
        TuViReading("Tuần này", "Bầu không khí gia đình ấm áp và hạnh phúc.", "Làm việc nhóm mang lại kết quả tốt hơn làm một mình.", "Tránh cho vay tiền tuần này.", "Duy trì lối sống lành mạnh và cân bằng.", 4),
        TuViReading("Tháng này", "Tháng của sự hào phóng và kết nối tình cảm sâu sắc.", "Tinh thần đồng đội giúp dự án thành công.", "Tài chính ổn định nếu kiểm soát chi tiêu tốt.", "Chú ý đến sức khỏe tổng thể và dinh dưỡng.", 4),
    ),
)

fun getCanChiByYear(birthYear: Int): CanChi {
    val index = ((birthYear - 4) % 12 + 12) % 12
    return CAN_CHI[index]
}

fun getTuViReadings(canChiId: Int): List<TuViReading> {
    return READINGS[canChiId] ?: READINGS[0]!!
}
