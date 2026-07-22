package com.tappyai.app.fortune.zodiac

data class ZodiacSign(
    val id: Int,
    val emoji: String,
    val nameVi: String,
    val element: String,
    val ruling: String,
    val traits: String,
    val dateRangeLabel: String,
    val startMonth: Int,
    val startDay: Int,
    val endMonth: Int,
    val endDay: Int,
)

data class ZodiacReading(
    val periodLabel: String,
    val love: String,
    val career: String,
    val money: String,
    val health: String,
    val score: Int,
)

private val ZODIAC_SIGNS: List<ZodiacSign> = listOf(
    ZodiacSign(0, "♈", "Bạch Dương", "Lửa", "Sao Hỏa", "Nhiệt tình, dũng cảm, độc lập và luôn đi tiên phong trong mọi việc.", "21/3 – 19/4", 3, 21, 4, 19),
    ZodiacSign(1, "♉", "Kim Ngưu", "Đất", "Kim Tinh", "Kiên định, đáng tin cậy, yêu thích sự ổn định và những niềm vui giản đơn.", "20/4 – 20/5", 4, 20, 5, 20),
    ZodiacSign(2, "♊", "Song Tử", "Khí", "Sao Thủy", "Linh hoạt, tò mò, hài hước và luôn tìm kiếm thông tin mới mẻ.", "21/5 – 20/6", 5, 21, 6, 20),
    ZodiacSign(3, "♋", "Cự Giải", "Nước", "Mặt Trăng", "Nhạy cảm, chăm sóc, gắn bó với gia đình và có trực giác mạnh mẽ.", "21/6 – 22/7", 6, 21, 7, 22),
    ZodiacSign(4, "♌", "Sư Tử", "Lửa", "Mặt Trời", "Tự tin, hào phóng, sáng tạo và luôn muốn trở thành trung tâm chú ý.", "23/7 – 22/8", 7, 23, 8, 22),
    ZodiacSign(5, "♍", "Xử Nữ", "Đất", "Sao Thủy", "Tỉ mỉ, thực tế, phân tích tốt và luôn muốn hoàn thiện mọi thứ.", "23/8 – 22/9", 8, 23, 9, 22),
    ZodiacSign(6, "♎", "Thiên Bình", "Khí", "Kim Tinh", "Công bằng, hòa giải giỏi, yêu cái đẹp và luôn tìm kiếm sự cân bằng.", "23/9 – 22/10", 9, 23, 10, 22),
    ZodiacSign(7, "♏", "Bọ Cạp", "Nước", "Sao Diêm Vương", "Mãnh liệt, bí ẩn, kiên quyết và có trực giác sâu sắc về con người.", "23/10 – 21/11", 10, 23, 11, 21),
    ZodiacSign(8, "♐", "Nhân Mã", "Lửa", "Sao Mộc", "Lạc quan, ham học hỏi, yêu tự do và luôn hướng tới chân trời mới.", "22/11 – 21/12", 11, 22, 12, 21),
    ZodiacSign(9, "♑", "Ma Kết", "Đất", "Sao Thổ", "Tham vọng, kỷ luật, thực dụng và luôn kiên trì theo đuổi mục tiêu.", "22/12 – 19/1", 12, 22, 1, 19),
    ZodiacSign(10, "♒", "Bảo Bình", "Khí", "Sao Thiên Vương", "Độc đáo, tiến bộ, nhân đạo và luôn có cái nhìn đột phá về thế giới.", "20/1 – 18/2", 1, 20, 2, 18),
    ZodiacSign(11, "♓", "Song Ngư", "Nước", "Sao Hải Vương", "Nhạy cảm, từ bi, sáng tạo và có trí tưởng tượng phong phú.", "19/2 – 20/3", 2, 19, 3, 20),
)

private val READINGS: Map<Int, List<ZodiacReading>> = mapOf(
    0 to listOf(
        ZodiacReading("Hôm nay", "Bày tỏ tình cảm thẳng thắn sẽ được đón nhận tốt.", "Tinh thần lãnh đạo giúp bạn nổi bật hôm nay.", "Cơ hội nhanh đến nhanh đi, hãy quyết đoán.", "Năng lượng dồi dào, tận dụng để vận động.", 4),
        ZodiacReading("Tuần này", "Đam mê và sự nhiệt tình thu hút người phù hợp.", "Tuần bận rộn nhưng đầy thành tựu.", "Kiểm soát chi tiêu bốc đồng trong tuần.", "Sức khỏe tốt, chú ý đến đầu và mặt.", 4),
        ZodiacReading("Tháng này", "Tháng đầy đam mê với nhiều cơ hội tình cảm.", "Tháng xuất sắc để thể hiện tài năng lãnh đạo.", "Tài chính tích cực nhờ sự quyết đoán.", "Duy trì sức sống bằng thể thao và nghỉ ngơi.", 5),
    ),
    1 to listOf(
        ZodiacReading("Hôm nay", "Kiên nhẫn trong tình yêu mang lại kết quả tốt.", "Ngày hoàn thành công việc cần sự tỉ mỉ.", "Nên tránh đầu tư lớn hôm nay.", "Thư giãn và tận hưởng những niềm vui nhỏ.", 3),
        ZodiacReading("Tuần này", "Sự ổn định trong mối quan hệ mang lại hạnh phúc.", "Làm việc đều đặn mang lại kết quả tốt dần.", "Tiết kiệm tốt, tránh xa hoa.", "Chú ý đến cổ họng và tiêu hóa.", 4),
        ZodiacReading("Tháng này", "Tháng ổn định và bền vững trong tình cảm.", "Kiên trì làm việc sẽ được đền đáp.", "Tài chính ổn định, tháng tốt để tiết kiệm.", "Sức khỏe tốt với chế độ ăn lành mạnh.", 4),
    ),
    2 to listOf(
        ZodiacReading("Hôm nay", "Sự hài hước và thú vị của bạn thu hút sự chú ý.", "Ngày phù hợp cho giao tiếp và kết nối.", "Đa dạng hóa nguồn thu nhập.", "Tâm trí hoạt động tốt, cơ thể cần nghỉ ngơi.", 4),
        ZodiacReading("Tuần này", "Những cuộc trò chuyện thú vị dẫn đến cảm xúc sâu hơn.", "Tuần bận rộn với nhiều dự án đồng thời.", "Cơ hội tài chính từ mạng lưới quen biết.", "Đừng để đầu óc quá tải, hãy nghỉ ngơi.", 3),
        ZodiacReading("Tháng này", "Tháng kết nối thú vị và đầy bất ngờ trong tình cảm.", "Sự linh hoạt giúp bạn xử lý nhiều thách thức.", "Tài chính ổn định nhờ nhiều nguồn thu.", "Chú ý đến hệ hô hấp và thần kinh.", 4),
    ),
    3 to listOf(
        ZodiacReading("Hôm nay", "Trực giác mách bảo điều đúng trong tình cảm.", "Môi trường làm việc hài hòa giúp bạn hiệu quả.", "Cẩn thận với chi tiêu cảm xúc.", "Lắng nghe cơ thể và nghỉ ngơi khi cần.", 3),
        ZodiacReading("Tuần này", "Gia đình và người thân mang lại hạnh phúc.", "Tuần làm việc ổn định với tinh thần chăm sóc.", "Kiểm soát tài chính gia đình tốt.", "Chú ý đến dạ dày và cảm xúc.", 4),
        ZodiacReading("Tháng này", "Tháng ấm áp với những kết nối tình cảm sâu sắc.", "Sự nhạy cảm giúp bạn hiểu đồng nghiệp hơn.", "Tháng tốt để tiết kiệm và lập kế hoạch.", "Giữ cân bằng cảm xúc để sức khỏe tốt.", 4),
    ),
    4 to listOf(
        ZodiacReading("Hôm nay", "Bạn tỏa sáng và thu hút sự chú ý trong tình yêu.", "Hãy tự tin thể hiện tài năng của mình.", "Cơ hội tài chính đến với những ai dám mạo hiểm.", "Sức sống mạnh mẽ, tràn đầy năng lượng.", 5),
        ZodiacReading("Tuần này", "Sự tự tin và hào phóng làm đối phương ngưỡng mộ.", "Lãnh đạo và sáng tạo giúp bạn nổi bật.", "Tuần tài chính tốt với tiềm năng tăng thu.", "Duy trì sức khỏe tim và cột sống.", 4),
        ZodiacReading("Tháng này", "Tháng rực rỡ trong tình yêu và các mối quan hệ.", "Tài năng được công nhận và thăng tiến.", "Tháng tốt về tài chính với cơ hội đầu tư.", "Sức khỏe tốt, hãy tận hưởng cuộc sống.", 5),
    ),
    5 to listOf(
        ZodiacReading("Hôm nay", "Hãy chú ý đến chi tiết trong tình cảm.", "Ngày hoàn hảo để giải quyết công việc tồn đọng.", "Xem xét kỹ trước khi chi tiêu lớn.", "Chú ý đến hệ tiêu hóa.", 3),
        ZodiacReading("Tuần này", "Sự quan tâm chân thành được đánh giá cao.", "Tuần làm việc hiệu quả với sự tỉ mỉ.", "Tiết kiệm tốt nhờ kế hoạch chi tiêu rõ ràng.", "Nghỉ ngơi và giảm căng thẳng.", 3),
        ZodiacReading("Tháng này", "Mối quan hệ phát triển nhờ sự quan tâm chăm sóc.", "Sự hoàn hảo trong công việc được ghi nhận.", "Tài chính ổn định nhờ kỷ luật.", "Chú ý sức khỏe tổng thể và chế độ ăn.", 4),
    ),
    6 to listOf(
        ZodiacReading("Hôm nay", "Sự công bằng và lắng nghe giúp hài hòa tình cảm.", "Ngày tốt cho đàm phán và thỏa thuận.", "Cân bằng chi tiêu và tiết kiệm.", "Sức khỏe ổn định, tìm kiếm cân bằng.", 4),
        ZodiacReading("Tuần này", "Sự hòa giải giúp mối quan hệ bền vững.", "Tuần thuận lợi cho hợp tác và đối tác.", "Đầu tư cẩn thận mang lại lợi nhuận ổn định.", "Duy trì cân bằng giữa công việc và nghỉ ngơi.", 4),
        ZodiacReading("Tháng này", "Tháng hài hòa và cân bằng trong tình yêu.", "Đối tác tốt giúp công việc thành công.", "Tài chính ổn định với sự cân bằng khéo léo.", "Sức khỏe tốt khi có lối sống cân bằng.", 4),
    ),
    7 to listOf(
        ZodiacReading("Hôm nay", "Trực giác sắc bén về mối quan hệ hôm nay.", "Quyết tâm giúp bạn vượt qua thách thức.", "Cơ hội tài chính đòi hỏi phân tích kỹ.", "Kiểm soát cảm xúc để sức khỏe tốt.", 4),
        ZodiacReading("Tuần này", "Chiều sâu cảm xúc tạo kết nối mạnh mẽ.", "Tuần làm việc mãnh liệt với kết quả đáng kể.", "Nghiên cứu kỹ trước khi đầu tư.", "Chú ý đến hệ sinh dục và đào thải.", 3),
        ZodiacReading("Tháng này", "Tháng của những kết nối sâu sắc và có ý nghĩa.", "Sự kiên quyết dẫn đến những thành tựu lớn.", "Tài chính cải thiện qua chiến lược thông minh.", "Sức khỏe tốt khi kiểm soát căng thẳng.", 4),
    ),
    8 to listOf(
        ZodiacReading("Hôm nay", "Sự lạc quan và phiêu lưu thu hút sự chú ý.", "Cơ hội từ xa hoặc từ nước ngoài đang đến.", "Cơ hội tài chính từ những con đường bất ngờ.", "Năng lượng tốt nhờ hoạt động ngoài trời.", 4),
        ZodiacReading("Tuần này", "Những cuộc phiêu lưu cùng nhau tạo kỷ niệm đẹp.", "Tuần mở ra nhiều cơ hội mới.", "Cơ hội tài chính từ mạng lưới quốc tế.", "Vận động và khám phá tăng cường sức khỏe.", 5),
        ZodiacReading("Tháng này", "Tháng phiêu lưu và kết nối trong tình yêu.", "Cơ hội nghề nghiệp mới trên phạm vi rộng.", "Tháng tốt nhờ tư duy mở rộng về tài chính.", "Sức khỏe tốt khi sống năng động.", 4),
    ),
    9 to listOf(
        ZodiacReading("Hôm nay", "Kiên nhẫn và cam kết trong tình yêu được đền đáp.", "Ngày làm việc hiệu quả với mục tiêu rõ ràng.", "Đầu tư dài hạn hơn là lợi nhuận nhanh.", "Chú ý xương khớp và cơ bắp.", 3),
        ZodiacReading("Tuần này", "Sự ổn định và đáng tin cậy được đánh giá cao.", "Tuần đặt nền tảng cho thành công dài hạn.", "Đầu tư thông minh mang lại lợi nhuận bền vững.", "Duy trì lịch sinh hoạt đều đặn.", 4),
        ZodiacReading("Tháng này", "Tháng xây dựng nền tảng vững chắc trong tình cảm.", "Tháng tốt để đặt ra mục tiêu dài hạn.", "Tài chính cải thiện nhờ kế hoạch rõ ràng.", "Sức khỏe ổn định với lối sống kỷ luật.", 4),
    ),
    10 to listOf(
        ZodiacReading("Hôm nay", "Sự độc đáo của bạn thu hút người phù hợp.", "Ý tưởng đột phá được đón nhận hôm nay.", "Cơ hội tài chính từ công nghệ hoặc đổi mới.", "Chú ý đến tuần hoàn và thần kinh.", 4),
        ZodiacReading("Tuần này", "Tình bạn có thể phát triển thành tình yêu.", "Tuần của những ý tưởng đột phá và sáng tạo.", "Đầu tư vào công nghệ hoặc tương lai.", "Sức khỏe ổn định với lối sống độc đáo.", 3),
        ZodiacReading("Tháng này", "Tháng kết nối với những người cùng chí hướng.", "Đổi mới và sáng tạo dẫn đến thành công.", "Tài chính cải thiện qua công nghệ và mạng lưới.", "Tập trung vào sức khỏe tâm trí và thể chất.", 4),
    ),
    11 to listOf(
        ZodiacReading("Hôm nay", "Sự từ bi và lãng mạn tạo nên những khoảnh khắc đẹp.", "Sáng tạo và trực giác giúp bạn tỏa sáng.", "Cẩn thận với quyết định tài chính cảm tính.", "Nghỉ ngơi và thiền định tốt cho sức khỏe.", 4),
        ZodiacReading("Tuần này", "Tình yêu huyền ảo và đầy cảm xúc.", "Sáng tạo nghệ thuật đặc biệt nổi bật tuần này.", "Tránh cho vay tiền hoặc đầu tư mạo hiểm.", "Nghỉ ngơi đủ để tái tạo năng lượng.", 3),
        ZodiacReading("Tháng này", "Tháng của tình yêu lãng mạn và cảm xúc sâu sắc.", "Tài năng sáng tạo được đền đáp xứng đáng.", "Tháng ổn định nếu tránh quyết định cảm tính.", "Sức khỏe tốt khi chú ý đến chân và hệ bạch huyết.", 4),
    ),
)

fun getZodiacByDate(month: Int, day: Int): ZodiacSign {
    return ZODIAC_SIGNS.firstOrNull { sign ->
        when {
            sign.startMonth == sign.endMonth -> month == sign.startMonth && day >= sign.startDay && day <= sign.endDay
            month == sign.startMonth -> day >= sign.startDay
            month == sign.endMonth -> day <= sign.endDay
            sign.startMonth < sign.endMonth -> month > sign.startMonth && month < sign.endMonth
            else -> month > sign.startMonth || month < sign.endMonth
        }
    } ?: ZODIAC_SIGNS[11]
}

fun getZodiacReadings(signId: Int): List<ZodiacReading> {
    return READINGS[signId] ?: READINGS[0]!!
}
