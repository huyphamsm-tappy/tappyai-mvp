import { FortuneBanks } from './fortuneEngine'

export interface ZodiacSign {
  id: string
  nameVi: string
  nameEn: string
  emoji: string
  dateRangeLabel: string
  start: { month: number; day: number }
  end: { month: number; day: number }
  element: string
  ruling: string
  traits: string
  banks: FortuneBanks
}

export const ZODIAC_SIGNS: ZodiacSign[] = [
  {
    id: 'aries', nameVi: 'Bạch Dương', nameEn: 'Aries', emoji: '♈',
    dateRangeLabel: '21/3 - 19/4', start: { month: 3, day: 21 }, end: { month: 4, day: 19 },
    element: 'Hỏa', ruling: 'Sao Hỏa',
    traits: 'Bạch Dương nhiệt huyết, thẳng thắn và luôn tràn đầy năng lượng để dẫn đầu. Bạn thích hành động nhanh, không ngại thử thách mới nhưng đôi khi hơi vội vàng, thiếu kiên nhẫn. Tinh thần tiên phong giúp bạn dễ tạo ấn tượng và truyền cảm hứng cho người khác.',
    banks: {
      love: [
        'Tình cảm nồng nhiệt, bạn dễ chủ động bày tỏ cảm xúc và tạo bất ngờ cho người ấy.',
        'Một cuộc trò chuyện thẳng thắn sẽ giúp gỡ bỏ hiểu lầm đang âm ỉ trong mối quan hệ.',
        'Người độc thân có thể gặp ai đó thú vị qua một hoạt động năng động, sôi nổi.',
        'Cảm xúc hơi nóng nảy, hãy bình tĩnh trước khi tranh luận với nửa kia.',
        'Sự chân thành của bạn khiến đối phương cảm thấy an tâm và được trân trọng.',
      ],
      career: [
        'Năng lượng dồi dào giúp bạn xử lý nhanh một việc tồn đọng lâu nay.',
        'Một ý tưởng mới của bạn được cấp trên hoặc đồng nghiệp đánh giá cao.',
        'Đừng vội vàng ký kết hay quyết định lớn mà chưa xem kỹ chi tiết.',
        'Tinh thần dẫn đầu giúp bạn nổi bật trong một dự án nhóm.',
        'Cạnh tranh trong công việc tăng nhẹ, hãy giữ vững lập trường nhưng khéo léo hơn.',
      ],
      money: [
        'Tài chính ổn, nhưng nên tránh chi tiêu bốc đồng cho những thứ chưa cần thiết.',
        'Có thể xuất hiện một khoản thu nhỏ ngoài kế hoạch, hãy tiết kiệm thay vì tiêu hết.',
        'Một quyết định đầu tư cần thêm thời gian cân nhắc trước khi xuống tiền.',
        'Vận tài lộc khá tốt nếu bạn chủ động tìm kiếm cơ hội thay vì chờ đợi.',
      ],
      health: [
        'Năng lượng cao nhưng dễ căng cơ, hãy khởi động kỹ trước khi vận động mạnh.',
        'Nên chú ý giấc ngủ, tránh để công việc cuốn theo làm thiếu ngủ kéo dài.',
        'Sức khỏe tổng quan tốt, phù hợp để bắt đầu một thói quen tập luyện mới.',
      ],
      luckyNumbers: [1, 9, 18],
      luckyColors: ['Đỏ', 'Cam'],
    },
  },
  {
    id: 'taurus', nameVi: 'Kim Ngưu', nameEn: 'Taurus', emoji: '♉',
    dateRangeLabel: '20/4 - 20/5', start: { month: 4, day: 20 }, end: { month: 5, day: 20 },
    element: 'Thổ', ruling: 'Sao Kim',
    traits: 'Kim Ngưu kiên định, thực tế và rất coi trọng sự ổn định. Bạn làm việc chăm chỉ, đáng tin cậy và thích tận hưởng những điều chất lượng trong cuộc sống. Đôi khi bạn khá cứng đầu và ngại thay đổi, nhưng sự bền bỉ chính là điểm mạnh lớn nhất.',
    banks: {
      love: [
        'Mối quan hệ cần thêm sự lãng mạn nhỏ để không bị nhàm chán theo lối quen.',
        'Bạn được người ấy yêu thích vì sự chân thành và đáng tin cậy.',
        'Một bữa ăn ngon hoặc món quà nhỏ sẽ giúp tình cảm thêm ấm áp.',
        'Đừng quá cố chấp giữ quan điểm riêng khi trò chuyện với nửa kia.',
        'Người độc thân nên cởi mở hơn, đừng chờ đợi quá lâu để bắt đầu.',
      ],
      career: [
        'Sự kiên trì của bạn bắt đầu mang lại kết quả rõ rệt trong công việc.',
        'Một kế hoạch dài hạn cần được xem lại để tối ưu hơn.',
        'Cấp trên đánh giá cao tính ổn định và độ tin cậy trong công việc của bạn.',
        'Tránh trì hoãn quá lâu một quyết định quan trọng, hãy hành động đúng lúc.',
      ],
      money: [
        'Tài lộc khá vững, thích hợp để tiết kiệm hoặc lên kế hoạch dài hạn.',
        'Một món đồ yêu thích có thể khiến bạn chi tiêu nhiều hơn dự tính.',
        'Cơ hội tăng thu nhập đến từ chính sự kiên trì bạn đã bỏ ra trước đó.',
        'Nên rà soát lại các khoản chi cố định để tránh lãng phí không cần thiết.',
      ],
      health: [
        'Cơ thể cần được vận động nhiều hơn để tránh trì trệ, ù lì.',
        'Ăn uống điều độ, tránh ăn quá nhiều món yêu thích cùng lúc.',
        'Tinh thần thư thái, phù hợp để đi dạo hoặc nghe nhạc thư giãn.',
      ],
      luckyNumbers: [2, 6, 24],
      luckyColors: ['Xanh lá', 'Hồng'],
    },
  },
  {
    id: 'gemini', nameVi: 'Song Tử', nameEn: 'Gemini', emoji: '♊',
    dateRangeLabel: '21/5 - 20/6', start: { month: 5, day: 21 }, end: { month: 6, day: 20 },
    element: 'Khí', ruling: 'Sao Thủy',
    traits: 'Song Tử thông minh, linh hoạt và giao tiếp rất tốt. Bạn tò mò với nhiều thứ, dễ thích nghi và luôn tìm được chủ đề để nói chuyện với bất kỳ ai. Nhược điểm là dễ phân tâm, đôi khi thiếu nhất quán giữa lời nói và hành động.',
    banks: {
      love: [
        'Một cuộc trò chuyện thú vị có thể khiến tình cảm giữa hai người gần nhau hơn.',
        'Hãy lắng nghe nhiều hơn nói, đối phương cần được thấu hiểu lúc này.',
        'Tin nhắn bất ngờ từ một người quen cũ có thể khơi lại cảm xúc cũ.',
        'Đừng để sự đa mang khiến nửa kia cảm thấy thiếu an toàn.',
        'Người độc thân có cơ hội gặp ai đó hợp gu chuyện trò qua mạng xã hội.',
      ],
      career: [
        'Khả năng giao tiếp giúp bạn thuyết phục đối tác hoặc khách hàng hiệu quả.',
        'Nhiều việc dồn lại cùng lúc, hãy ưu tiên việc quan trọng trước.',
        'Một ý tưởng sáng tạo của bạn được mọi người đón nhận tích cực.',
        'Tránh hứa hẹn quá nhiều thứ cùng lúc rồi không hoàn thành kịp.',
      ],
      money: [
        'Có thể có thêm thu nhập từ một việc làm thêm hoặc ý tưởng mới.',
        'Nên ghi chép chi tiêu rõ ràng, tránh mua sắm theo cảm xúc nhất thời.',
        'Cơ hội tài chính đến từ mối quan hệ xã hội rộng của bạn.',
        'Một khoản chi nhỏ ngoài kế hoạch có thể xuất hiện, không đáng lo.',
      ],
      health: [
        'Đầu óc hoạt động nhiều, nên dành thời gian nghỉ ngơi cho tinh thần.',
        'Hơi mất ngủ do suy nghĩ nhiều chuyện cùng lúc, hãy thử viết nhật ký trước khi ngủ.',
        'Sức khỏe ổn định nếu duy trì lịch sinh hoạt đều đặn hơn.',
      ],
      luckyNumbers: [5, 7, 14],
      luckyColors: ['Vàng', 'Bạc'],
    },
  },
  {
    id: 'cancer', nameVi: 'Cự Giải', nameEn: 'Cancer', emoji: '♋',
    dateRangeLabel: '21/6 - 22/7', start: { month: 6, day: 21 }, end: { month: 7, day: 22 },
    element: 'Thủy', ruling: 'Mặt Trăng',
    traits: 'Cự Giải nhạy cảm, giàu tình cảm và rất biết quan tâm, chăm sóc người thân. Trực giác mạnh giúp bạn cảm nhận tốt cảm xúc của người khác. Đôi khi bạn dễ tổn thương và hay nghĩ nhiều, cần học cách bảo vệ cảm xúc của chính mình.',
    banks: {
      love: [
        'Tình cảm gia đình và người thân được vun đắp tốt trong giai đoạn này.',
        'Hãy chia sẻ cảm xúc thật của bạn, đừng giữ trong lòng quá lâu.',
        'Một cử chỉ quan tâm nhỏ từ nửa kia khiến bạn thấy được yêu thương.',
        'Người độc thân nên mở lòng hơn để đón nhận một kết nối mới.',
        'Tránh suy diễn quá nhiều về lời nói của đối phương khi chưa rõ ý.',
      ],
      career: [
        'Sự tận tâm của bạn được đồng nghiệp và cấp trên ghi nhận.',
        'Một việc liên quan đến chăm sóc, hỗ trợ người khác mang lại niềm vui.',
        'Cần cân bằng giữa công việc và cảm xúc cá nhân để không bị quá tải.',
        'Trực giác giúp bạn đưa ra quyết định đúng đắn trong tình huống khó.',
      ],
      money: [
        'Tài chính ổn định nếu bạn không chi tiêu theo cảm xúc lúc buồn.',
        'Có thể nhận được sự hỗ trợ tài chính nhỏ từ gia đình hoặc người thân.',
        'Nên dành một khoản tiết kiệm cho những kế hoạch dài hơi của gia đình.',
        'Tránh cho vay mượn cảm tính trong giai đoạn này.',
      ],
      health: [
        'Cảm xúc ảnh hưởng nhiều đến sức khỏe, hãy giữ tinh thần lạc quan.',
        'Dạ dày hoặc tiêu hóa cần được chú ý, ăn uống đúng giờ hơn.',
        'Nghỉ ngơi đầy đủ giúp bạn hồi phục năng lượng nhanh hơn.',
      ],
      luckyNumbers: [2, 11, 20],
      luckyColors: ['Trắng', 'Xanh nhạt'],
    },
  },
  {
    id: 'leo', nameVi: 'Sư Tử', nameEn: 'Leo', emoji: '♌',
    dateRangeLabel: '23/7 - 22/8', start: { month: 7, day: 23 }, end: { month: 8, day: 22 },
    element: 'Hỏa', ruling: 'Mặt Trời',
    traits: 'Sư Tử tự tin, hào phóng và có khả năng lãnh đạo bẩm sinh. Bạn thích được chú ý và luôn nỗ lực để tỏa sáng theo cách riêng. Đôi khi bạn hơi kiêu, nhưng tấm lòng rộng rãi với người xung quanh là điểm cộng lớn.',
    banks: {
      love: [
        'Sự tự tin và hào phóng của bạn khiến nửa kia thêm yêu mến.',
        'Một lời khen chân thành dành cho đối phương sẽ làm không khí ấm áp hơn.',
        'Đừng để cái tôi quá lớn cản trở việc xin lỗi khi cần thiết.',
        'Người độc thân có thể trở thành tâm điểm chú ý tại một sự kiện đông người.',
        'Tình cảm thăng hoa khi bạn chủ động tạo những khoảnh khắc đáng nhớ.',
      ],
      career: [
        'Khả năng lãnh đạo của bạn được phát huy tốt trong một dự án nhóm.',
        'Cơ hội thể hiện bản thân trước nhiều người xuất hiện, hãy tự tin nắm bắt.',
        'Tránh áp đặt ý kiến cá nhân quá mức lên đồng nghiệp.',
        'Thành quả công việc gần đây giúp bạn được ghi nhận xứng đáng.',
      ],
      money: [
        'Vận tài lộc khá rực rỡ, nhưng đừng tiêu hoang để thể hiện bản thân.',
        'Một khoản thu bất ngờ có thể đến từ chính tài năng của bạn.',
        'Nên lập quỹ dự phòng trước khi chi cho những thứ phô trương.',
        'Đầu tư vào hình ảnh cá nhân mang lại hiệu quả tốt lúc này.',
      ],
      health: [
        'Năng lượng tích cực giúp bạn tràn đầy sức sống trong các hoạt động.',
        'Lưu ý vùng tim và lưng, tránh vận động quá sức một lúc.',
        'Tinh thần lạc quan giúp bạn phục hồi nhanh nếu có mệt mỏi nhẹ.',
      ],
      luckyNumbers: [1, 4, 19],
      luckyColors: ['Vàng gold', 'Cam'],
    },
  },
  {
    id: 'virgo', nameVi: 'Xử Nữ', nameEn: 'Virgo', emoji: '♍',
    dateRangeLabel: '23/8 - 22/9', start: { month: 8, day: 23 }, end: { month: 9, day: 22 },
    element: 'Thổ', ruling: 'Sao Thủy',
    traits: 'Xử Nữ tỉ mỉ, chu đáo và có tiêu chuẩn cao trong mọi việc. Bạn làm việc có hệ thống, đáng tin cậy và luôn muốn mọi thứ hoàn hảo nhất có thể. Đôi khi bạn hơi khắt khe với bản thân và người khác, cần học cách buông bớt sự cầu toàn.',
    banks: {
      love: [
        'Sự quan tâm chi tiết của bạn khiến nửa kia cảm thấy được trân trọng.',
        'Đừng quá khắt khe khi đối phương mắc một lỗi nhỏ không đáng kể.',
        'Một cuộc hẹn được chuẩn bị kỹ lưỡng sẽ rất đáng nhớ.',
        'Người độc thân nên thử bước ra khỏi vùng an toàn để mở lòng hơn.',
        'Lời góp ý chân thành của bạn cần đi kèm sự nhẹ nhàng hơn.',
      ],
      career: [
        'Sự cẩn thận giúp bạn phát hiện một lỗi nhỏ trước khi nó trở thành vấn đề lớn.',
        'Khối lượng công việc tăng nhưng bạn vẫn xử lý gọn gàng, có hệ thống.',
        'Đồng nghiệp đánh giá cao sự tin cậy và tính chính xác trong công việc của bạn.',
        'Nên ủy quyền một phần việc thay vì cố làm hết mọi thứ một mình.',
      ],
      money: [
        'Quản lý chi tiêu chặt chẽ giúp tài chính của bạn khá ổn định.',
        'Một khoản chi cho sức khỏe hoặc học tập là đầu tư đáng giá lúc này.',
        'Tránh quá tiết kiệm đến mức bỏ lỡ cơ hội tốt.',
        'Kế hoạch tài chính dài hạn của bạn đang đi đúng hướng.',
      ],
      health: [
        'Hệ tiêu hóa cần được chú ý, hạn chế ăn uống vội vàng.',
        'Căng thẳng do cầu toàn có thể ảnh hưởng đến giấc ngủ, hãy thư giãn nhiều hơn.',
        'Một lịch trình tập luyện đều đặn, nhẹ nhàng sẽ rất phù hợp.',
      ],
      luckyNumbers: [3, 15, 22],
      luckyColors: ['Xanh navy', 'Nâu nhạt'],
    },
  },
  {
    id: 'libra', nameVi: 'Thiên Bình', nameEn: 'Libra', emoji: '♎',
    dateRangeLabel: '23/9 - 22/10', start: { month: 9, day: 23 }, end: { month: 10, day: 22 },
    element: 'Khí', ruling: 'Sao Kim',
    traits: 'Thiên Bình hòa nhã, công bằng và luôn tìm kiếm sự hài hòa trong mọi quan hệ. Bạn có gu thẩm mỹ tốt và khéo léo trong giao tiếp xã hội. Nhược điểm là đôi khi khó quyết định vì luôn cân nhắc quá nhiều phương án.',
    banks: {
      love: [
        'Mối quan hệ trở nên hài hòa hơn khi cả hai cùng lắng nghe nhau.',
        'Một quyết định chung quan trọng cần được đưa ra, đừng trì hoãn quá lâu.',
        'Sự tinh tế của bạn khiến đối phương cảm thấy được tôn trọng.',
        'Người độc thân có thể bị thu hút bởi một người có gu thẩm mỹ tương đồng.',
        'Tránh chiều theo ý người khác đến mức quên mất cảm xúc của chính mình.',
      ],
      career: [
        'Khả năng dung hòa các ý kiến giúp bạn giải quyết tốt một mâu thuẫn trong nhóm.',
        'Một quyết định công việc cần sự cân nhắc kỹ nhưng đừng để lỡ thời điểm.',
        'Gu thẩm mỹ và sự khéo léo của bạn được phát huy tốt trong dự án hiện tại.',
        'Hợp tác với người khác mang lại kết quả tốt hơn là làm việc đơn lẻ.',
      ],
      money: [
        'Tài chính cân bằng nếu bạn không chi tiêu chỉ để làm hài lòng người khác.',
        'Một cơ hội hợp tác tài chính đôi bên cùng lợi có thể xuất hiện.',
        'Nên so sánh kỹ trước khi quyết định mua sắm món đồ giá trị.',
        'Vận tài lộc khá thuận lợi trong các giao dịch liên quan đến đối tác.',
      ],
      health: [
        'Thận và vùng lưng dưới cần được chú ý, tránh ngồi quá lâu một chỗ.',
        'Tinh thần cân bằng tốt khi bạn dành thời gian cho không gian đẹp, yên tĩnh.',
        'Một buổi đi bộ cùng người thân sẽ giúp cải thiện tâm trạng.',
      ],
      luckyNumbers: [4, 13, 24],
      luckyColors: ['Hồng pastel', 'Xanh ngọc'],
    },
  },
  {
    id: 'scorpio', nameVi: 'Bọ Cạp', nameEn: 'Scorpio', emoji: '♏',
    dateRangeLabel: '23/10 - 21/11', start: { month: 10, day: 23 }, end: { month: 11, day: 21 },
    element: 'Thủy', ruling: 'Sao Hỏa & Sao Diêm Vương',
    traits: 'Bọ Cạp sâu sắc, mạnh mẽ và có ý chí kiên định hiếm ai sánh được. Bạn nhìn sự việc thấu đáo, trung thành với người mình tin tưởng. Đôi khi bạn khá đa nghi và giữ cảm xúc trong lòng, cần học cách tin tưởng và chia sẻ nhiều hơn.',
    banks: {
      love: [
        'Tình cảm sâu đậm hơn khi bạn dám mở lòng chia sẻ cảm xúc thật.',
        'Sự đa nghi không cần thiết có thể làm tổn hại đến niềm tin giữa hai người.',
        'Một bí mật được tiết lộ giúp mối quan hệ trở nên gần gũi hơn.',
        'Người độc thân dễ bị cuốn hút bởi một người có chiều sâu nội tâm.',
        'Lòng trung thành của bạn là điều khiến đối phương an tâm nhất.',
      ],
      career: [
        'Sự tập trung cao độ giúp bạn hoàn thành tốt một việc khó.',
        'Đừng giữ kín thông tin quan trọng với đồng nghiệp cần phối hợp.',
        'Ý chí kiên định giúp bạn vượt qua một trở ngại tưởng như bế tắc.',
        'Một cơ hội thăng tiến có thể đến từ chính sự bền bỉ của bạn.',
      ],
      money: [
        'Tài chính có thể biến động nhẹ, nên kiểm soát chi tiêu chặt hơn.',
        'Một khoản đầu tư cần được nghiên cứu kỹ trước khi quyết định.',
        'Vận tài lộc cải thiện nếu bạn tin tưởng vào trực giác của mình.',
        'Tránh giữ tiền nhàn rỗi quá lâu mà không có kế hoạch cụ thể.',
      ],
      health: [
        'Cảm xúc dồn nén có thể ảnh hưởng đến sức khỏe, hãy giải tỏa kịp thời.',
        'Giấc ngủ sâu giúp bạn phục hồi năng lượng tinh thần tốt hơn.',
        'Nên vận động nhẹ để giảm căng thẳng tích tụ trong người.',
      ],
      luckyNumbers: [8, 11, 27],
      luckyColors: ['Đỏ đậm', 'Đen'],
    },
  },
  {
    id: 'sagittarius', nameVi: 'Nhân Mã', nameEn: 'Sagittarius', emoji: '♐',
    dateRangeLabel: '22/11 - 21/12', start: { month: 11, day: 22 }, end: { month: 12, day: 21 },
    element: 'Hỏa', ruling: 'Sao Mộc',
    traits: 'Nhân Mã yêu tự do, ham học hỏi và luôn tràn đầy lạc quan với cuộc sống. Bạn thích khám phá điều mới, thẳng thắn và truyền cảm hứng tốt cho người khác. Đôi khi bạn hơi bộp chộp và ngại bị ràng buộc, cần cân bằng giữa tự do và trách nhiệm.',
    banks: {
      love: [
        'Tinh thần lạc quan của bạn mang lại nhiều tiếng cười cho mối quan hệ.',
        'Một chuyến đi cùng nhau sẽ giúp tình cảm thêm gắn kết.',
        'Đừng né tránh những cuộc trò chuyện nghiêm túc khi cần thiết.',
        'Người độc thân có thể gặp ai đó thú vị trong một chuyến du lịch hoặc lớp học mới.',
        'Sự thẳng thắn của bạn được đối phương đánh giá cao, dù đôi khi hơi sốc.',
      ],
      career: [
        'Một cơ hội học hỏi hoặc đi công tác mới sẽ mở rộng tầm nhìn của bạn.',
        'Tinh thần lạc quan giúp bạn vượt qua một giai đoạn công việc áp lực.',
        'Tránh hứa hẹn quá nhiều rồi không có thời gian thực hiện.',
        'Ý tưởng đột phá của bạn có thể thuyết phục được cả những người khó tính nhất.',
      ],
      money: [
        'Tài lộc khá hanh thông nếu bạn không chi tiêu quá tay cho du lịch, giải trí.',
        'Một cơ hội kiếm thêm từ sở thích cá nhân có thể xuất hiện.',
        'Nên lập quỹ dự phòng trước khi lên kế hoạch cho chuyến đi sắp tới.',
        'Vận đầu tư khá tốt nếu có sự tìm hiểu kỹ càng trước đó.',
      ],
      health: [
        'Năng lượng dồi dào, rất phù hợp cho các hoạt động ngoài trời.',
        'Chú ý vùng hông và đùi nếu thường xuyên vận động mạnh.',
        'Tinh thần phơi phới giúp bạn dễ lấy lại sức sau những ngày mệt mỏi.',
      ],
      luckyNumbers: [3, 9, 21],
      luckyColors: ['Tím', 'Xanh dương'],
    },
  },
  {
    id: 'capricorn', nameVi: 'Ma Kết', nameEn: 'Capricorn', emoji: '♑',
    dateRangeLabel: '22/12 - 19/1', start: { month: 12, day: 22 }, end: { month: 1, day: 19 },
    element: 'Thổ', ruling: 'Sao Thổ',
    traits: 'Ma Kết kỷ luật, kiên nhẫn và có tham vọng rõ ràng cho tương lai. Bạn làm việc bài bản, đáng tin cậy và sẵn sàng chờ đợi để đạt mục tiêu lớn. Đôi khi bạn hơi nghiêm khắc với bản thân, cần học cách thư giãn và ăn mừng những thành quả nhỏ.',
    banks: {
      love: [
        'Sự đáng tin cậy của bạn là điểm cộng lớn trong mắt nửa kia.',
        'Đừng để công việc chiếm hết thời gian dành cho người bạn yêu thương.',
        'Một lời nói ấm áp đúng lúc sẽ xóa tan khoảng cách giữa hai người.',
        'Người độc thân nên cho bản thân cơ hội thư giãn, cởi mở hơn để gặp người mới.',
        'Tình cảm bền vững hơn khi bạn thể hiện cảm xúc thật, không chỉ qua hành động.',
      ],
      career: [
        'Sự kiên trì giúp một kế hoạch dài hạn của bạn bắt đầu thấy kết quả.',
        'Cấp trên ghi nhận tính kỷ luật và trách nhiệm trong công việc của bạn.',
        'Đừng quá khắt khe với chính mình khi tiến độ chưa như mong đợi.',
        'Một cơ hội thăng tiến đến gần hơn nếu bạn kiên trì thêm một chút.',
      ],
      money: [
        'Tài chính ổn định nhờ thói quen tiết kiệm và lập kế hoạch kỹ lưỡng.',
        'Một khoản đầu tư dài hạn của bạn bắt đầu sinh lời nhẹ.',
        'Nên dành một phần nhỏ để tận hưởng, không nhất thiết phải tiết kiệm tuyệt đối.',
        'Vận tài lộc khá vững nếu bạn không quá thận trọng đến mức bỏ lỡ cơ hội.',
      ],
      health: [
        'Xương khớp và đầu gối cần được chú ý nếu làm việc ngồi nhiều.',
        'Áp lực công việc có thể gây căng thẳng, hãy dành thời gian nghỉ ngơi thực sự.',
        'Một lịch trình ngủ đều đặn sẽ giúp bạn duy trì năng lượng ổn định.',
      ],
      luckyNumbers: [6, 10, 26],
      luckyColors: ['Nâu', 'Xám đậm'],
    },
  },
  {
    id: 'aquarius', nameVi: 'Bảo Bình', nameEn: 'Aquarius', emoji: '♒',
    dateRangeLabel: '20/1 - 18/2', start: { month: 1, day: 20 }, end: { month: 2, day: 18 },
    element: 'Khí', ruling: 'Sao Thiên Vương',
    traits: 'Bảo Bình độc lập, sáng tạo và luôn có những góc nhìn khác biệt. Bạn coi trọng tự do cá nhân, quan tâm đến cộng đồng và không ngại đi ngược số đông nếu tin điều đó đúng. Đôi khi bạn hơi xa cách về cảm xúc, cần cởi mở hơn với người gần gũi.',
    banks: {
      love: [
        'Một cuộc trò chuyện cởi mở giúp đối phương hiểu hơn về thế giới riêng của bạn.',
        'Đừng giữ khoảng cách cảm xúc quá lâu, nửa kia cần cảm nhận được sự quan tâm.',
        'Sự độc lập của bạn được đối phương tôn trọng, nhưng đừng quên dành thời gian cho nhau.',
        'Người độc thân có thể bị thu hút bởi một người có tư duy khác biệt, thú vị.',
        'Ý tưởng mới mẻ của bạn trong cách thể hiện tình cảm khiến mối quan hệ thêm tươi mới.',
      ],
      career: [
        'Góc nhìn sáng tạo của bạn mang lại giải pháp bất ngờ cho một vấn đề cũ.',
        'Làm việc nhóm với những người có chung lý tưởng sẽ hiệu quả hơn lúc này.',
        'Đừng quá cứng nhắc bảo vệ ý tưởng cá nhân khi nhận góp ý từ người khác.',
        'Một dự án liên quan đến công nghệ hoặc cộng đồng phù hợp với bạn lúc này.',
      ],
      money: [
        'Tài chính có thể biến động nếu bạn đầu tư theo cảm tính, thiếu tìm hiểu.',
        'Một cơ hội thu nhập thụ động từ ý tưởng sáng tạo có thể xuất hiện.',
        'Nên cân nhắc kỹ trước khi chi tiền cho công nghệ hoặc thiết bị mới.',
        'Vận tài lộc ổn nếu bạn biết kết hợp giữa lý trí và sự đổi mới.',
      ],
      health: [
        'Hệ tuần hoàn và mắt cá chân cần được chú ý nếu vận động nhiều.',
        'Tinh thần cần không gian riêng để nạp lại năng lượng sau những ngày bận rộn.',
        'Một hoạt động mới lạ sẽ giúp bạn cảm thấy hứng khởi và khỏe khoắn hơn.',
      ],
      luckyNumbers: [4, 11, 22],
      luckyColors: ['Xanh điện', 'Bạc'],
    },
  },
  {
    id: 'pisces', nameVi: 'Song Ngư', nameEn: 'Pisces', emoji: '♓',
    dateRangeLabel: '19/2 - 20/3', start: { month: 2, day: 19 }, end: { month: 3, day: 20 },
    element: 'Thủy', ruling: 'Sao Hải Vương',
    traits: 'Song Ngư nhạy cảm, giàu trí tưởng tượng và rất thấu cảm với người xung quanh. Bạn sống nhiều bằng cảm xúc, yêu nghệ thuật và dễ đặt mình vào hoàn cảnh của người khác. Đôi khi bạn hơi mơ mộng và dễ bị cuốn theo cảm xúc, cần giữ một chút lý trí để bảo vệ bản thân.',
    banks: {
      love: [
        'Sự thấu cảm của bạn giúp mối quan hệ trở nên sâu sắc và ấm áp hơn.',
        'Một giấc mơ hoặc linh cảm có thể mách bảo bạn điều gì đó về đối phương.',
        'Đừng để cảm xúc lấn át lý trí khi đưa ra quyết định quan trọng trong tình cảm.',
        'Người độc thân dễ rơi vào lưới tình qua một kết nối đầy cảm xúc, lãng mạn.',
        'Nghệ thuật hoặc âm nhạc có thể là cầu nối giúp hai người gần nhau hơn.',
      ],
      career: [
        'Trí tưởng tượng phong phú giúp bạn đưa ra một ý tưởng sáng tạo độc đáo.',
        'Cần tỉnh táo hơn để không bị cảm xúc ảnh hưởng đến quyết định công việc.',
        'Một công việc liên quan đến nghệ thuật, chăm sóc người khác rất hợp với bạn lúc này.',
        'Đồng nghiệp đánh giá cao sự tinh tế và khả năng lắng nghe của bạn.',
      ],
      money: [
        'Tài chính dễ bị ảnh hưởng nếu bạn chi tiêu theo cảm xúc nhất thời.',
        'Một khoản chi cho sở thích nghệ thuật mang lại niềm vui tinh thần lớn.',
        'Nên có người lý trí hỗ trợ khi quyết định các vấn đề tài chính lớn.',
        'Vận tài lộc cải thiện nếu bạn lắng nghe trực giác kết hợp với tính toán cẩn thận.',
      ],
      health: [
        'Tinh thần nhạy cảm dễ bị ảnh hưởng bởi môi trường xung quanh, hãy chọn không gian tích cực.',
        'Chân và hệ miễn dịch cần được chú ý khi thời tiết thay đổi.',
        'Thiền hoặc nghe nhạc nhẹ sẽ giúp bạn cân bằng cảm xúc tốt hơn.',
      ],
      luckyNumbers: [3, 12, 29],
      luckyColors: ['Xanh biển', 'Tím nhạt'],
    },
  },
]

/** Xác định cung hoàng đạo từ tháng/ngày sinh (dương lịch). Xử lý riêng Ma Kết vì vắt qua năm. */
export function getZodiacByDate(month: number, day: number): ZodiacSign {
  const capricorn = ZODIAC_SIGNS.find((z) => z.id === 'capricorn')!
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return capricorn

  const found = ZODIAC_SIGNS.find((z) => {
    if (z.id === 'capricorn') return false
    const afterStart = month > z.start.month || (month === z.start.month && day >= z.start.day)
    const beforeEnd = month < z.end.month || (month === z.end.month && day <= z.end.day)
    return afterStart && beforeEnd
  })
  return found || capricorn
}
