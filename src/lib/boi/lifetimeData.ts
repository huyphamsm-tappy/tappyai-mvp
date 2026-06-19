// Tử vi trọn đời — nội dung tĩnh, luận giải TOÀN CỤC cả đời theo con giáp.
// Không phụ thuộc vào thời điểm, không gọi API.

export interface LifetimeReading {
  overview: string
  career: string
  love: string
  health: string
  advice: string
}

export const LIFETIME_READINGS: Record<string, LifetimeReading> = {
  ty: {
    overview:
      'Người tuổi Tý thông minh, nhanh nhạy và có khả năng thích nghi xuất sắc — những phẩm chất này là vũ khí chính giúp họ vượt qua mọi thử thách suốt hành trình cuộc đời.',
    career:
      'Phù hợp với các lĩnh vực đòi hỏi trí tuệ và ứng biến nhanh như kinh doanh, tài chính, truyền thông hay công nghệ. Người tuổi Tý có xu hướng thành công nhờ biết nắm bắt cơ hội đúng lúc — tài sản tích lũy thường tốt dần từ tuổi trung niên trở đi khi kinh nghiệm đã chín.',
    love:
      'Dễ rung động và yêu sâu, nhưng lòng đa nghi đôi khi tạo ra rào cản vô hình trong các mối quan hệ. Hôn nhân trở nên bền vững khi gặp người kiên nhẫn, bao dung và biết cho họ cảm giác an toàn — từ đó họ sẽ là người bạn đời hết mực chung thủy.',
    health:
      'Hệ thần kinh và hệ tiêu hóa là hai điểm yếu cần theo dõi suốt đời, đặc biệt khi căng thẳng tích tụ. Duy trì giấc ngủ đủ giấc, lịch sinh hoạt đều đặn và tránh suy nghĩ quá nhiều là ba nguyên tắc sức khỏe quan trọng nhất.',
    advice:
      'Tin vào trực giác nhưng đừng để sự đa nghi nuốt chửng những mối quan hệ tốt. Biết buông bỏ và dừng đúng lúc — thay vì ôm quá nhiều việc cùng lúc — sẽ giúp cuộc sống cân bằng và viên mãn hơn.',
  },
  suu: {
    overview:
      'Người tuổi Sửu mang trong mình sự bền bỉ hiếm có — họ không cần may mắn bằng người khác vì chính sự kiên trì là may mắn lớn nhất của họ.',
    career:
      'Phù hợp với các lĩnh vực đòi hỏi sự tỉ mỉ và đáng tin cậy như tài chính, kỹ thuật, quản lý hay nông nghiệp. Thành công thường đến muộn hơn tuổi đời nhưng một khi đã đạt được thì rất vững chắc và khó ai lay chuyển.',
    love:
      'Người tuổi Sửu trung thành và yêu thương bằng hành động hơn lời nói — đôi khi người bạn đời cần những biểu hiện cảm xúc rõ ràng hơn để cảm thấy được yêu. Khi đã chọn ai, họ gắn bó cả đời; điều họ cần học là bày tỏ cảm xúc thường xuyên hơn để tình cảm luôn được nuôi dưỡng ấm áp.',
    health:
      'Xương khớp, cột sống và vùng lưng là những điểm cần chú ý, đặc biệt khi làm việc nặng hoặc ngồi nhiều. Tránh ép bản thân làm việc đến kiệt sức — cơ thể của người tuổi Sửu cần được nghỉ ngơi đúng mức để duy trì sức bền lâu dài.',
    advice:
      'Đừng cứng nhắc đến mức bỏ lỡ những cơ hội đòi hỏi sự linh hoạt. Bản chất kiên định là điểm mạnh nhưng học cách mềm mỏng đúng thời điểm sẽ mở ra nhiều cánh cửa hơn trong cuộc đời.',
  },
  dan: {
    overview:
      'Người tuổi Dần mang khí chất của người sinh ra để dẫn đầu — mạnh mẽ, quyết đoán và toả ra một sức hút tự nhiên khiến người khác muốn đứng cạnh họ.',
    career:
      'Sinh ra để lãnh đạo, người tuổi Dần phát huy tốt nhất ở các vị trí tiên phong: doanh nhân, nhà quản lý, quân sự hay bất kỳ vai trò nào đòi hỏi dũng khí và quyết đoán. Sự nghiệp thường có những bước nhảy vọt đột ngột hơn là tăng trưởng đều đặn.',
    love:
      'Yêu mãnh liệt và bảo vệ người mình yêu rất mạnh mẽ, nhưng tính nóng nảy đôi khi gây ra những tổn thương không đáng có. Người bạn đời lý tưởng cần đủ bản lĩnh để không bị lấn át, đồng thời biết cách xoa dịu ngọn lửa bên trong đúng lúc.',
    health:
      'Gan và hệ tim mạch là hai điểm cần theo dõi lâu dài, đặc biệt khi chịu nhiều áp lực hoặc dùng nhiều bia rượu. Kiểm soát cảm xúc — đặc biệt cơn giận — không chỉ tốt cho các mối quan hệ mà còn là biện pháp bảo vệ sức khoẻ thiết thực.',
    advice:
      'Năng lượng mạnh mẽ là tài sản lớn, nhưng học cách lắng nghe và chờ đợi thời điểm chín muồi sẽ giúp những quyết định lớn trở nên khôn ngoan hơn nhiều. Người tuổi Dần càng trưởng thành, càng mạnh mẽ theo cả nghĩa đen lẫn nghĩa bóng.',
  },
  mao: {
    overview:
      'Người tuổi Mão có sức hút nhẹ nhàng nhưng sâu sắc — không ồn ào mà vẫn để lại ấn tượng lâu dài, không tranh giành mà vẫn luôn được lựa chọn.',
    career:
      'Có gu thẩm mỹ tốt và khả năng giao tiếp khéo léo, người tuổi Mão phù hợp với các lĩnh vực sáng tạo, nghệ thuật, chăm sóc, ngoại giao hoặc pháp lý. Thành công đến ổn định và bền vững hơn là đột phá nhảy vọt — sự kiên trì lặng lẽ là chìa khoá.',
    love:
      'Người tuổi Mão yêu bằng sự chu đáo và những cử chỉ nhỏ ý nghĩa — họ cần được yêu lại bằng sự trân trọng và lời nói chân thành. Dễ bị tổn thương khi cảm thấy bị xem nhẹ, nhưng trong một mối quan hệ an toàn, họ là người bạn đời ấm áp và trung thành hiếm có.',
    health:
      'Da, phổi và hệ hô hấp cần được chú ý, đặc biệt khi thời tiết thay đổi hoặc môi trường ô nhiễm. Tinh thần nhạy cảm dễ bị ảnh hưởng bởi không khí xung quanh — tạo ra một không gian sống gọn gàng và bình yên là đầu tư sức khỏe tinh thần thực sự.',
    advice:
      'Đừng để sự nhạy cảm trở thành gánh nặng — học cách xử lý cảm xúc lành mạnh hơn thay vì cất vào trong lòng. Sự nhẹ nhàng của bạn là sức mạnh, không phải điểm yếu.',
  },
  thin: {
    overview:
      'Người tuổi Thìn mang vóc dáng của huyền thoại — tham vọng lớn, năng lượng mạnh mẽ và một sức hút hiếm có khiến họ trở thành người nổi bật trong bất kỳ đám đông nào.',
    career:
      'Khí chất thiên về lãnh đạo, người tuổi Thìn phù hợp với các vị trí đỉnh cao trong kinh doanh, chính trị, nghệ thuật hoặc bất kỳ lĩnh vực nào họ quyết tâm theo đuổi. Sự nghiệp thường có những đỉnh điểm ấn tượng, nhưng cần học cách xây nền móng vững chắc trước khi vươn quá cao.',
    love:
      'Người tuổi Thìn yêu mãnh liệt và muốn dẫn dắt trong mối quan hệ — điều này đôi khi tạo ra sự mất cân bằng. Người bạn đời lý tưởng đứng bên cạnh họ như đồng đẳng: không bị lu mờ nhưng cũng không cần cạnh tranh.',
    health:
      'Tim mạch và huyết áp là hai điểm cần theo dõi, đặc biệt khi chịu nhiều áp lực công việc. Duy trì hoạt động thể chất đều đặn và học cách giải tỏa stress là ưu tiên sức khỏe hàng đầu.',
    advice:
      'Khiêm tốn là mặt còn thiếu trong bức tranh hoàn chỉnh của người tuổi Thìn — học cách lắng nghe và trân trọng những người âm thầm đồng hành sẽ giúp sự thành công trở nên bền vững và ý nghĩa hơn.',
  },
  ty2: {
    overview:
      'Người tuổi Tỵ thâm sâu và bí ẩn như chính biểu tượng của họ — quan sát nhiều hơn nói, nhưng khi hành động thì luôn chính xác và có chủ đích.',
    career:
      'Trực giác nhạy và tư duy chiến lược là vũ khí chính trong sự nghiệp — người tuổi Tỵ phù hợp với nghiên cứu, tài chính, y tế hoặc nghệ thuật. Họ thường thành công nhờ kế hoạch âm thầm chuẩn bị từ trước hơn là may mắn bất ngờ.',
    love:
      'Người tuổi Tỵ yêu sâu đậm và trung thành, nhưng khó bộc lộ cảm xúc khiến người yêu đôi khi cảm thấy xa cách. Họ cần người bạn đời đủ kiên nhẫn để hiểu rằng sự im lặng của họ không phải thờ ơ, mà là một cách thể hiện tình yêu theo phong cách riêng.',
    health:
      'Da và gan là hai điểm yếu cần chú ý lâu dài, đặc biệt cần hạn chế thức khuya và căng thẳng kéo dài. Thiền, yoga hoặc các hoạt động tĩnh tâm rất phù hợp với thể trạng và tinh thần của người tuổi Tỵ.',
    advice:
      'Mở lòng nhiều hơn — không phải ai cũng có ý định xấu như sự đa nghi đôi khi mách bảo. Chia sẻ đúng người đúng lúc không làm bạn yếu đi, mà sẽ giúp bạn nhẹ nhõm và vững vàng hơn rất nhiều.',
  },
  ngo: {
    overview:
      'Người tuổi Ngọ sinh ra để chạy — tự do, nhiệt tình và luôn hướng tới những chân trời mới, họ truyền cảm hứng cho người xung quanh bằng chính năng lượng không ngừng nghỉ của mình.',
    career:
      'Phù hợp với các ngành đòi hỏi sự năng động và giao tiếp như du lịch, truyền thông, bán hàng hay khởi nghiệp. Thành công đến khi họ học được cách kiên trì với một hướng đi đủ lâu thay vì liên tục thay đổi khi gặp khó khăn.',
    love:
      'Yêu cuồng nhiệt và chân thành, nhưng người tuổi Ngọ cần không gian tự do trong mọi mối quan hệ. Người bạn đời hiểu và tôn trọng điều đó — thay vì kiểm soát — sẽ giữ được trái tim của họ mãi mãi.',
    health:
      'Chân, hông và hệ tim mạch cần được chú ý, đặc biệt khi vận động cường độ cao. Cân bằng giữa hoạt động sôi nổi và nghỉ ngơi đúng mức là bí quyết sức khỏe quan trọng nhất.',
    advice:
      'Sự tự do bạn khao khát cần đi kèm với trách nhiệm — đặc biệt trong tình cảm và công việc. Học cách hoàn thành những gì đã bắt đầu sẽ nâng giá trị và uy tín của bạn lên rất nhiều.',
  },
  mui: {
    overview:
      'Người tuổi Mùi hiền hậu, chân thành và giàu lòng trắc ẩn — họ không tranh giành nổi tiếng nhưng luôn được nhớ đến vì sự ấm áp và chu đáo dành cho người xung quanh.',
    career:
      'Sáng tạo, nhạy cảm và có gu nghệ thuật tự nhiên, người tuổi Mùi phù hợp với văn hóa nghệ thuật, chăm sóc sức khỏe tâm lý, thiết kế hoặc giáo dục. Thành công đến khi họ học được cách tự tin hơn vào giá trị của bản thân và dám thể hiện rõ ý kiến riêng.',
    love:
      'Yêu tha thiết và hi sinh nhiều, nhưng người tuổi Mùi đôi khi không biết bảo vệ chính mình trong mối quan hệ. Họ cần người bạn đời biết trân trọng tấm lòng này và đáp lại bằng sự quan tâm thực sự, không phải lợi dụng sự tốt bụng của họ.',
    health:
      'Hệ tiêu hóa và tinh thần là hai điểm cần chú ý — lo lắng và căng thẳng thường biểu hiện qua dạ dày đối với người tuổi Mùi. Sống trong không gian ấm cúng, bình yên và gần gũi thiên nhiên giúp cải thiện sức khỏe tổng thể đáng kể.',
    advice:
      'Hãy học cách nói "không" — lòng tốt không có nghĩa là đồng ý với tất cả mọi thứ. Chăm sóc bản thân không phải là ích kỷ; đó là điều kiện để bạn tiếp tục chăm sóc được những người mình yêu thương.',
  },
  than: {
    overview:
      'Người tuổi Thân thông minh, sáng tạo và luôn tìm ra cách giải quyết bất ngờ — họ là người giỏi nhất trong việc biến nghịch cảnh thành cơ hội.',
    career:
      'Đa tài và linh hoạt, người tuổi Thân đặc biệt nổi trội trong những ngành đòi hỏi sáng tạo, phân tích và ứng biến nhanh như công nghệ, kinh doanh, quảng cáo hay giải trí. Thách thức lớn nhất là duy trì sự tập trung đủ lâu để hoàn thành những mục tiêu có giá trị.',
    love:
      'Hài hước và cuốn hút, họ dễ tạo thiện cảm ban đầu nhưng đôi khi thiếu chiều sâu cảm xúc mà người bạn đời cần. Học cách nghiêm túc hơn trong tình cảm và thể hiện sự dễ bị tổn thương thật sự sẽ giúp các mối quan hệ trở nên sâu sắc và bền vững hơn.',
    health:
      'Tay, cổ tay và đầu óc là những bộ phận hoạt động quá mức và cần được nghỉ ngơi thường xuyên. Người tuổi Thân dễ bị kiệt sức tinh thần vì suy nghĩ quá nhiều — vận động nhẹ hoặc thiền giúp tái tạo năng lượng hiệu quả.',
    advice:
      'Bộ não xuất sắc của bạn cần có mục tiêu rõ ràng và đủ lớn để không bị lãng phí vào những việc nhỏ lẻ. Kiên nhẫn hơn một chút với mọi thứ — bao gồm cả con người — sẽ nhân đôi giá trị của sự thông minh bẩm sinh.',
  },
  dau: {
    overview:
      'Người tuổi Dậu chăm chỉ, chỉn chu và có trách nhiệm cao — họ không chỉ làm tốt việc của mình mà còn muốn làm tốt hơn cả những gì được yêu cầu.',
    career:
      'Phù hợp với các lĩnh vực đòi hỏi sự kỹ lưỡng và chuyên nghiệp như y tế, pháp lý, tài chính hay quản lý. Người tuổi Dậu thường leo lên đỉnh cao nhờ sự bền bỉ và uy tín, không phải nhờ may mắn hay mối quan hệ.',
    love:
      'Trong tình cảm, họ quan tâm theo cách tỉ mỉ và chu đáo, nhưng sự kỳ vọng cao đôi khi tạo áp lực lên đối phương. Người bạn đời lý tưởng là người trân trọng sự cẩn thận này, đồng thời giúp họ bớt khắt khe với cả chính mình lẫn người yêu.',
    health:
      'Họng, phổi và hệ hô hấp cần được chú ý đặc biệt khi thời tiết thay đổi. Áp lực phải hoàn hảo thường gây ra căng thẳng mãn tính — học cách chấp nhận sự không hoàn hảo như một phần tự nhiên của cuộc sống là liều thuốc tinh thần quan trọng.',
    advice:
      'Tiêu chuẩn cao là điểm mạnh nhưng đừng để nó trở thành xiềng xích. Cuộc đời không phải lúc nào cũng cần được kiểm soát hoàn hảo — đôi khi buông lỏng đúng lúc mới thực sự là sự thông thái.',
  },
  tuat: {
    overview:
      'Người tuổi Tuất là người bạn, người đồng đội và người bảo vệ tuyệt vời nhất — lòng trung thành của họ không có điều kiện và đó là tài sản quý giá nhất trong cuộc đời.',
    career:
      'Phù hợp với các lĩnh vực phục vụ và đấu tranh vì lẽ phải như pháp lý, quân sự, xã hội học hoặc tổ chức phi lợi nhuận. Người tuổi Tuất thành công khi làm việc trong môi trường có đạo đức rõ ràng và cảm thấy ý nghĩa trong từng việc họ làm.',
    love:
      'Trung thành và hết lòng trong tình cảm, nhưng sự lo lắng và đề phòng đôi khi khiến người bạn đời cảm thấy bị kiểm soát. Học cách tin tưởng nhiều hơn — không phải ai cũng có ý định phản bội — sẽ giúp tình cảm của họ thực sự nở hoa.',
    health:
      'Tinh thần lo âu dễ biểu hiện qua các triệu chứng thể chất như mất ngủ hoặc căng cơ. Tìm kiếm sự bình an trong tâm trí thông qua thể thao, kết nối xã hội lành mạnh hoặc thiền định là ưu tiên sức khỏe hàng đầu.',
    advice:
      'Bảo vệ người khác là bản năng tốt đẹp, nhưng đừng quên bảo vệ chính mình. Đặt ra ranh giới lành mạnh không phải là ích kỷ — đó là cách để bạn tiếp tục là điểm tựa cho những người cần bạn.',
  },
  hoi: {
    overview:
      'Người tuổi Hợi hào sảng, chân thành và yêu đời — họ mang lại niềm vui và sự ấm áp cho mọi người xung quanh chỉ bằng cách sống thật với bản thân mình.',
    career:
      'Phù hợp với các ngành giao tiếp, chăm sóc, ẩm thực hay giải trí — bất kỳ lĩnh vực nào mang lại niềm vui cho người khác. Người tuổi Hợi thường được mọi người quý mến và sẵn sàng hỗ trợ — đây là nguồn lực sự nghiệp không thể đánh giá thấp.',
    love:
      'Yêu chân thành và hào phóng cả về vật chất lẫn cảm xúc, nhưng sự cả tin đôi khi khiến họ bị lợi dụng trong tình cảm. Học cách nhận biết sớm các dấu hiệu không lành mạnh trong mối quan hệ sẽ giúp họ bảo vệ trái tim quý giá của mình.',
    health:
      'Hệ tiêu hóa và cân nặng là hai điểm cần chú ý — người tuổi Hợi có xu hướng yêu thích ẩm thực và dễ tăng cân nếu không duy trì thói quen vận động. Sức khỏe tinh thần thường rất tốt nhờ tính cách lạc quan tự nhiên.',
    advice:
      'Lòng tốt của bạn là món quà quý giá — hãy trao nó cho đúng người. Học cách nhìn xa hơn vẻ ngoài của người khác sẽ giúp bạn bảo vệ bản thân mà không mất đi sự chân thành vốn là linh hồn của con người bạn.',
  },
}
