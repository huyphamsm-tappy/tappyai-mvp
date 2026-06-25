// Bộ dữ liệu 78 lá bài Tarot tiêu chuẩn (22 Ẩn chính + 56 Ẩn phụ).
// Toàn bộ là dữ liệu tĩnh viết sẵn — không gọi API/LLM, rút bài dùng random phía client.

export interface TarotCard {
  id: string
  name: string // tên tiếng Anh chuẩn
  nameVi: string // tên tiếng Việt
  arcana: 'major' | 'minor'
  suit?: 'wands' | 'cups' | 'swords' | 'pentacles'
  number: number
  emoji: string
  keywordsUpright: string[]
  keywordsReversed: string[]
  meaningUpright: string
  meaningReversed: string
}

const MAJOR_ARCANA: TarotCard[] = [
  {
    id: 'major-00', name: 'The Fool', nameVi: 'Kẻ Khờ', arcana: 'major', number: 0, emoji: '🃏',
    keywordsUpright: ['khởi đầu mới', 'tự do', 'mạo hiểm'], keywordsReversed: ['liều lĩnh', 'thiếu chuẩn bị', 'do dự'],
    meaningUpright: 'Một khởi đầu mới đầy hứng khởi đang chờ bạn. Hãy tin vào trực giác, dám bước đi dù chưa biết hết mọi thứ phía trước.',
    meaningReversed: 'Bạn đang hành động hơi vội vàng hoặc thiếu chuẩn bị. Nên dừng lại suy nghĩ kỹ trước khi tiến thêm bước nữa.',
  },
  {
    id: 'major-01', name: 'The Magician', nameVi: 'Pháp Sư', arcana: 'major', number: 1, emoji: '🪄',
    keywordsUpright: ['sáng tạo', 'ý chí', 'năng lực'], keywordsReversed: ['lừa dối', 'thiếu tập trung', 'bỏ lỡ cơ hội'],
    meaningUpright: 'Bạn có đủ kỹ năng và nguồn lực để biến ý tưởng thành hiện thực. Đây là lúc hành động, biến tiềm năng thành kết quả cụ thể.',
    meaningReversed: 'Năng lực đang bị sử dụng sai cách hoặc thiếu tập trung. Cẩn thận với những lời hứa hẹn không đi kèm hành động thật.',
  },
  {
    id: 'major-02', name: 'The High Priestess', nameVi: 'Nữ Tư Tế', arcana: 'major', number: 2, emoji: '🌙',
    keywordsUpright: ['trực giác', 'bí ẩn', 'nội tâm'], keywordsReversed: ['mất kết nối', 'che giấu', 'thiếu rõ ràng'],
    meaningUpright: 'Hãy lắng nghe trực giác nhiều hơn lý trí trong giai đoạn này. Có những điều bạn cảm nhận được mà chưa thể giải thích rõ.',
    meaningReversed: 'Bạn đang xa rời cảm nhận thật của chính mình, hoặc có điều gì đó đang bị giấu kín chưa được tiết lộ.',
  },
  {
    id: 'major-03', name: 'The Empress', nameVi: 'Hoàng Hậu', arcana: 'major', number: 3, emoji: '👑',
    keywordsUpright: ['sung túc', 'nuôi dưỡng', 'sáng tạo'], keywordsReversed: ['phụ thuộc', 'trì trệ', 'thiếu chăm sóc'],
    meaningUpright: 'Một giai đoạn sung túc, sinh sôi đang đến — về tình cảm, sáng tạo hoặc vật chất. Hãy chăm sóc bản thân và những điều bạn đang vun đắp.',
    meaningReversed: 'Bạn có thể đang quên chăm sóc chính mình hoặc quá phụ thuộc vào người khác. Cần tìm lại sự cân bằng.',
  },
  {
    id: 'major-04', name: 'The Emperor', nameVi: 'Hoàng Đế', arcana: 'major', number: 4, emoji: '🏛️',
    keywordsUpright: ['kỷ luật', 'ổn định', 'quyền lực'], keywordsReversed: ['cứng nhắc', 'kiểm soát quá mức', 'thiếu linh hoạt'],
    meaningUpright: 'Cấu trúc, kỷ luật và sự ổn định sẽ giúp bạn đạt được mục tiêu. Hãy nắm quyền chủ động và xây dựng nền tảng vững chắc.',
    meaningReversed: 'Sự kiểm soát quá mức hoặc cứng nhắc đang gây cản trở. Hãy linh hoạt hơn để thích nghi với hoàn cảnh.',
  },
  {
    id: 'major-05', name: 'The Hierophant', nameVi: 'Giáo Hoàng', arcana: 'major', number: 5, emoji: '📿',
    keywordsUpright: ['truyền thống', 'quy tắc', 'hướng dẫn'], keywordsReversed: ['nổi loạn', 'phá vỡ quy tắc', 'lệch hướng'],
    meaningUpright: 'Những giá trị truyền thống, quy tắc hoặc sự hướng dẫn từ người đi trước sẽ giúp bạn đi đúng hướng lúc này.',
    meaningReversed: 'Bạn đang muốn phá bỏ những khuôn mẫu cũ để đi theo con đường riêng. Hãy cân nhắc kỹ điều gì nên giữ, điều gì nên bỏ.',
  },
  {
    id: 'major-06', name: 'The Lovers', nameVi: 'Tình Nhân', arcana: 'major', number: 6, emoji: '💞',
    keywordsUpright: ['kết nối', 'lựa chọn', 'hài hòa'], keywordsReversed: ['mất cân bằng', 'bất đồng', 'lựa chọn sai'],
    meaningUpright: 'Một mối kết nối sâu sắc hoặc một lựa chọn quan trọng đang ở phía trước. Hãy chọn theo giá trị thật của bạn.',
    meaningReversed: 'Có sự mất cân bằng hoặc bất đồng trong một mối quan hệ. Cần nhìn lại xem hai bên có còn cùng hướng hay không.',
  },
  {
    id: 'major-07', name: 'The Chariot', nameVi: 'Cỗ Xe', arcana: 'major', number: 7, emoji: '🏇',
    keywordsUpright: ['quyết tâm', 'chiến thắng', 'kiểm soát'], keywordsReversed: ['mất phương hướng', 'thiếu kiểm soát', 'trì hoãn'],
    meaningUpright: 'Bằng ý chí và sự quyết tâm, bạn đang tiến rất gần đến một chiến thắng quan trọng. Giữ vững tay lái và tiếp tục tiến lên.',
    meaningReversed: 'Bạn đang mất phương hướng hoặc bị kéo bởi nhiều hướng khác nhau. Cần xác định lại mục tiêu rõ ràng.',
  },
  {
    id: 'major-08', name: 'Strength', nameVi: 'Sức Mạnh', arcana: 'major', number: 8, emoji: '🦁',
    keywordsUpright: ['can đảm', 'kiên nhẫn', 'nội lực'], keywordsReversed: ['tự nghi ngờ', 'thiếu kiên nhẫn', 'kiệt sức'],
    meaningUpright: 'Sức mạnh thật sự nằm ở sự kiên nhẫn và lòng trắc ẩn, không phải vũ lực. Bạn đủ bản lĩnh để vượt qua thử thách bằng sự bình tĩnh.',
    meaningReversed: 'Bạn đang nghi ngờ chính khả năng của mình. Hãy cho bản thân thời gian để hồi phục nội lực trước khi tiếp tục.',
  },
  {
    id: 'major-09', name: 'The Hermit', nameVi: 'Ẩn Sĩ', arcana: 'major', number: 9, emoji: '🏮',
    keywordsUpright: ['tự soi xét', 'cô độc', 'tìm kiếm'], keywordsReversed: ['cô lập', 'lạc lối', 'né tránh'],
    meaningUpright: 'Đây là lúc lui về suy ngẫm, tìm câu trả lời từ chính bên trong bạn. Sự yên tĩnh sẽ mang lại những hiểu biết quý giá.',
    meaningReversed: 'Bạn có thể đang tự cô lập mình quá mức hoặc né tránh việc đối diện với vấn đề thật sự.',
  },
  {
    id: 'major-10', name: 'Wheel of Fortune', nameVi: 'Vòng Quay Số Phận', arcana: 'major', number: 10, emoji: '🎡',
    keywordsUpright: ['vận may', 'thay đổi', 'chu kỳ mới'], keywordsReversed: ['vận xấu', 'trì trệ', 'mất kiểm soát'],
    meaningUpright: 'Một bước ngoặt may mắn hoặc một chu kỳ mới đang bắt đầu. Hãy đón nhận thay đổi với tâm thế cởi mở.',
    meaningReversed: 'Vận may đang tạm chững lại hoặc có cảm giác mọi thứ ngoài tầm kiểm soát. Hãy bình tĩnh chờ đợi thời điểm thích hợp.',
  },
  {
    id: 'major-11', name: 'Justice', nameVi: 'Công Lý', arcana: 'major', number: 11, emoji: '⚖️',
    keywordsUpright: ['công bằng', 'sự thật', 'cân bằng'], keywordsReversed: ['bất công', 'thiên vị', 'trốn tránh trách nhiệm'],
    meaningUpright: 'Sự thật và công bằng sẽ được làm rõ. Mọi hành động đều có hệ quả tương xứng — hãy hành xử minh bạch và đúng đắn.',
    meaningReversed: 'Có sự bất công hoặc thiếu khách quan trong một tình huống. Cần xem lại để tránh đưa ra quyết định thiên vị.',
  },
  {
    id: 'major-12', name: 'The Hanged Man', nameVi: 'Người Treo Ngược', arcana: 'major', number: 12, emoji: '🙃',
    keywordsUpright: ['tạm dừng', 'góc nhìn mới', 'buông bỏ'], keywordsReversed: ['trì hoãn', 'bám chấp', 'do dự'],
    meaningUpright: 'Đôi khi dừng lại và nhìn vấn đề từ góc độ khác sẽ mang lại lời giải bất ngờ. Đừng cố vội vàng hành động lúc này.',
    meaningReversed: 'Bạn đang trì hoãn hoặc bám chấp vào điều không còn phù hợp. Cần can đảm buông bỏ để tiến lên.',
  },
  {
    id: 'major-13', name: 'Death', nameVi: 'Tử Thần', arcana: 'major', number: 13, emoji: '🦋',
    keywordsUpright: ['kết thúc', 'chuyển hóa', 'khởi đầu mới'], keywordsReversed: ['sợ thay đổi', 'trì trệ kéo dài', 'cố bám lấy quá khứ'],
    meaningUpright: 'Một giai đoạn đang kết thúc để mở ra điều mới. Sự chuyển hóa này, dù khó khăn, là cần thiết để bạn phát triển.',
    meaningReversed: 'Bạn đang sợ hãi hoặc cố chống lại một thay đổi tất yếu. Việc trì hoãn chỉ khiến quá trình thêm khó khăn.',
  },
  {
    id: 'major-14', name: 'Temperance', nameVi: 'Điều Độ', arcana: 'major', number: 14, emoji: '🍯',
    keywordsUpright: ['hài hòa', 'kiên nhẫn', 'điều độ'], keywordsReversed: ['mất cân bằng', 'thái quá', 'thiếu kiên nhẫn'],
    meaningUpright: 'Sự cân bằng và kiên nhẫn sẽ giúp bạn hòa hợp những điều tưởng như đối lập. Hãy từ từ, mọi thứ sẽ ổn theo đúng nhịp của nó.',
    meaningReversed: 'Bạn đang đẩy mọi thứ đi quá xa hoặc thiếu sự điều độ cần thiết. Hãy tìm lại điểm cân bằng.',
  },
  {
    id: 'major-15', name: 'The Devil', nameVi: 'Ác Quỷ', arcana: 'major', number: 15, emoji: '😈',
    keywordsUpright: ['ràng buộc', 'cám dỗ', 'thói quen xấu'], keywordsReversed: ['giải thoát', 'nhận ra ràng buộc', 'phá vỡ thói quen xấu'],
    meaningUpright: 'Bạn đang bị ràng buộc bởi một thói quen, mối quan hệ hoặc cám dỗ không lành mạnh. Hãy nhìn thẳng vào điều đang kiểm soát bạn.',
    meaningReversed: 'Bạn đang dần nhận ra và thoát khỏi những ràng buộc cũ. Đây là dấu hiệu tích cực của sự tự do trở lại.',
  },
  {
    id: 'major-16', name: 'The Tower', nameVi: 'Tòa Tháp', arcana: 'major', number: 16, emoji: '⚡',
    keywordsUpright: ['biến động', 'sụp đổ bất ngờ', 'thức tỉnh'], keywordsReversed: ['sợ thay đổi', 'trì hoãn điều tất yếu', 'khủng hoảng nhỏ'],
    meaningUpright: 'Một biến động bất ngờ có thể làm sụp đổ những gì không còn vững chắc. Dù gây sốc, đây là cơ hội để xây lại nền tảng tốt hơn.',
    meaningReversed: 'Bạn đang né tránh một sự thay đổi cần thiết. Trì hoãn điều tất yếu chỉ khiến cú sốc sau này lớn hơn.',
  },
  {
    id: 'major-17', name: 'The Star', nameVi: 'Sao', arcana: 'major', number: 17, emoji: '⭐',
    keywordsUpright: ['hy vọng', 'hàn gắn', 'cảm hứng'], keywordsReversed: ['mất niềm tin', 'tuyệt vọng tạm thời', 'thiếu phương hướng'],
    meaningUpright: 'Sau giai đoạn khó khăn, hy vọng và sự hàn gắn đang đến. Hãy giữ niềm tin, mọi thứ đang dần tốt lên.',
    meaningReversed: 'Bạn đang cảm thấy mất niềm tin hoặc thiếu định hướng. Hãy tìm lại điều khiến bạn cảm thấy có ý nghĩa.',
  },
  {
    id: 'major-18', name: 'The Moon', nameVi: 'Mặt Trăng', arcana: 'major', number: 18, emoji: '🌕',
    keywordsUpright: ['trực giác', 'mơ hồ', 'cảm xúc ẩn giấu'], keywordsReversed: ['rõ ràng dần', 'vượt qua sợ hãi', 'giải tỏa lo lắng'],
    meaningUpright: 'Có những điều chưa rõ ràng, cảm xúc đang dao động. Hãy tin vào trực giác nhưng đừng để lo lắng chi phối quá nhiều.',
    meaningReversed: 'Sự mơ hồ, lo lắng đang dần được giải tỏa. Bạn bắt đầu nhìn rõ vấn đề hơn sau giai đoạn hoang mang.',
  },
  {
    id: 'major-19', name: 'The Sun', nameVi: 'Mặt Trời', arcana: 'major', number: 19, emoji: '☀️',
    keywordsUpright: ['thành công', 'niềm vui', 'năng lượng tích cực'], keywordsReversed: ['trì hoãn niềm vui', 'kỳ vọng quá cao', 'thiếu tự tin tạm thời'],
    meaningUpright: 'Niềm vui, thành công và năng lượng tích cực đang chiếu sáng con đường của bạn. Đây là giai đoạn rất thuận lợi để tiến tới.',
    meaningReversed: 'Niềm vui đang bị trì hoãn hoặc bạn đang kỳ vọng quá cao vào kết quả. Hãy tận hưởng những điều nhỏ trước đã.',
  },
  {
    id: 'major-20', name: 'Judgement', nameVi: 'Phán Xét', arcana: 'major', number: 20, emoji: '📯',
    keywordsUpright: ['tỉnh thức', 'đánh giá lại', 'tái sinh'], keywordsReversed: ['tự trách', 'trì hoãn quyết định', 'sợ đối diện quá khứ'],
    meaningUpright: 'Đây là lúc nhìn lại chặng đường đã qua để đưa ra một quyết định quan trọng, mang tính bước ngoặt cho giai đoạn tới.',
    meaningReversed: 'Bạn đang quá khắt khe với bản thân hoặc trì hoãn một quyết định cần thiết vì sợ đối diện quá khứ.',
  },
  {
    id: 'major-21', name: 'The World', nameVi: 'Thế Giới', arcana: 'major', number: 21, emoji: '🌍',
    keywordsUpright: ['hoàn thiện', 'thành tựu', 'viên mãn'], keywordsReversed: ['chưa hoàn thiện', 'thiếu kết thúc', 'trì hoãn thành quả'],
    meaningUpright: 'Một chu kỳ quan trọng đang hoàn thành tốt đẹp. Đây là thành quả xứng đáng cho những nỗ lực bạn đã bỏ ra.',
    meaningReversed: 'Vẫn còn điều gì đó chưa được hoàn thiện. Hãy kiên nhẫn thêm một chút nữa trước khi khép lại chu kỳ này.',
  },
]

// ---- Sinh 56 lá Ẩn phụ (Minor Arcana) từ template Chất bài x Cấp bậc ----

interface SuitInfo {
  id: 'wands' | 'cups' | 'swords' | 'pentacles'
  nameVi: string
  emoji: string
  domain: string // lĩnh vực chủ đề của chất bài
}

const SUITS: SuitInfo[] = [
  { id: 'wands', nameVi: 'Gậy', emoji: '🔥', domain: 'công việc, đam mê và hành động' },
  { id: 'cups', nameVi: 'Cốc', emoji: '💧', domain: 'tình cảm, cảm xúc và các mối quan hệ' },
  { id: 'swords', nameVi: 'Kiếm', emoji: '🗡️', domain: 'tư duy, lời nói và các quyết định' },
  { id: 'pentacles', nameVi: 'Tiền', emoji: '💰', domain: 'tài chính, vật chất và công việc thực tế' },
]

interface RankInfo {
  number: number
  nameVi: string
  emoji: string
  upright: string
  reversed: string
  kwUp: string
  kwRev: string
}

const RANKS: RankInfo[] = [
  { number: 1, nameVi: 'Ace', emoji: '①', upright: 'Một khởi đầu mới đầy tiềm năng đang mở ra', reversed: 'Một cơ hội khởi đầu đang bị trì hoãn hoặc bỏ lỡ', kwUp: 'khởi đầu', kwRev: 'lỡ cơ hội' },
  { number: 2, nameVi: 'Hai', emoji: '②', upright: 'Đến lúc cân nhắc một lựa chọn hoặc thiết lập sự hợp tác bước đầu', reversed: 'Sự mất cân bằng hoặc do dự trước một lựa chọn quan trọng', kwUp: 'lựa chọn', kwRev: 'do dự' },
  { number: 3, nameVi: 'Ba', emoji: '③', upright: 'Sự phát triển và hợp tác đang mang lại kết quả tích cực', reversed: 'Sự hợp tác đang gặp trở ngại hoặc thiếu gắn kết', kwUp: 'hợp tác', kwRev: 'trở ngại' },
  { number: 4, nameVi: 'Bốn', emoji: '④', upright: 'Nền tảng ổn định đang được thiết lập, mang lại cảm giác an toàn', reversed: 'Sự ổn định đang trở thành trì trệ, cần một chút thay đổi', kwUp: 'ổn định', kwRev: 'trì trệ' },
  { number: 5, nameVi: 'Năm', emoji: '⑤', upright: 'Một thử thách hoặc xung đột tạm thời xuất hiện, đòi hỏi sự khéo léo', reversed: 'Mâu thuẫn đang kéo dài hơn cần thiết, nên tìm cách hóa giải sớm', kwUp: 'thử thách', kwRev: 'mâu thuẫn kéo dài' },
  { number: 6, nameVi: 'Sáu', emoji: '⑥', upright: 'Sự hài hòa và hỗ trợ đang giúp mọi thứ dần hồi phục', reversed: 'Sự mất cân bằng trong việc cho và nhận đang cần được điều chỉnh', kwUp: 'hài hòa', kwRev: 'mất cân bằng' },
  { number: 7, nameVi: 'Bảy', emoji: '⑦', upright: 'Sự kiên trì và đánh giá lại tình hình sẽ giúp bạn đi đúng hướng', reversed: 'Thiếu kiên nhẫn hoặc đánh giá sai tình hình có thể gây trở ngại', kwUp: 'kiên trì', kwRev: 'thiếu kiên nhẫn' },
  { number: 8, nameVi: 'Tám', emoji: '⑧', upright: 'Mọi thứ đang chuyển động nhanh, đây là lúc hành động dứt khoát', reversed: 'Tốc độ và sự vội vàng đang khiến bạn dễ mắc sai sót', kwUp: 'hành động nhanh', kwRev: 'vội vàng' },
  { number: 9, nameVi: 'Chín', emoji: '⑨', upright: 'Bạn đang rất gần với thành quả mong muốn, hãy kiên trì thêm một chút', reversed: 'Cảm giác mệt mỏi hoặc cô đơn xuất hiện ngay trước đích đến', kwUp: 'gần đạt được', kwRev: 'mệt mỏi' },
  { number: 10, nameVi: 'Mười', emoji: '⑩', upright: 'Một chu kỳ đang hoàn thiện, mang lại kết quả rõ ràng và trọn vẹn', reversed: 'Một chu kỳ kết thúc nhưng để lại gánh nặng cần giải quyết', kwUp: 'hoàn thiện', kwRev: 'gánh nặng' },
  { number: 11, nameVi: 'Pháp Sư Nhỏ (Page)', emoji: '🧒', upright: 'Một tin tức mới hoặc cơ hội học hỏi đang đến với sự nhiệt huyết tươi mới', reversed: 'Sự thiếu kinh nghiệm hoặc tin tức chưa chắc chắn cần được kiểm chứng', kwUp: 'khởi đầu học hỏi', kwRev: 'thiếu kinh nghiệm' },
  { number: 12, nameVi: 'Kỵ Sĩ (Knight)', emoji: '🏇', upright: 'Hành động mạnh mẽ, quyết liệt theo đuổi mục tiêu đang được thúc đẩy', reversed: 'Sự hấp tấp hoặc thiếu kế hoạch đang cản trở mục tiêu của bạn', kwUp: 'hành động mạnh mẽ', kwRev: 'hấp tấp' },
  { number: 13, nameVi: 'Hoàng Hậu (Queen)', emoji: '👸', upright: 'Sự trưởng thành, nuôi dưỡng và làm chủ cảm xúc đang dẫn dắt bạn', reversed: 'Cảm xúc đang chi phối quá nhiều, cần lấy lại sự cân bằng nội tâm', kwUp: 'trưởng thành', kwRev: 'mất cân bằng cảm xúc' },
  { number: 14, nameVi: 'Vua (King)', emoji: '🤴', upright: 'Sự làm chủ, tinh thông và uy tín đang giúp bạn dẫn dắt tốt mọi việc', reversed: 'Quyền lực hoặc sự kiểm soát đang bị lạm dụng, cần điều chỉnh lại', kwUp: 'làm chủ', kwRev: 'lạm quyền' },
]

function buildMinorArcana(): TarotCard[] {
  const cards: TarotCard[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        id: `minor-${suit.id}-${rank.number}`,
        name: `${rank.nameVi.replace(/\s*\(.+\)/, '')} of ${suit.nameVi === 'Gậy' ? 'Wands' : suit.nameVi === 'Cốc' ? 'Cups' : suit.nameVi === 'Kiếm' ? 'Swords' : 'Pentacles'}`,
        nameVi: `${rank.nameVi} ${suit.nameVi}`,
        arcana: 'minor',
        suit: suit.id,
        number: rank.number,
        emoji: suit.emoji,
        keywordsUpright: [rank.kwUp, suit.domain.split(',')[0].trim()],
        keywordsReversed: [rank.kwRev, suit.domain.split(',')[0].trim()],
        meaningUpright: `${rank.upright}, đặc biệt trong lĩnh vực ${suit.domain}.`,
        meaningReversed: `${rank.reversed}, đặc biệt trong lĩnh vực ${suit.domain}.`,
      })
    }
  }
  return cards
}

export const TAROT_DECK: TarotCard[] = [...MAJOR_ARCANA, ...buildMinorArcana()]

export function getRandomCards(count: 1 | 2 | 3): { card: TarotCard; reversed: boolean }[] {
  const pool = [...TAROT_DECK]
  const result: { card: TarotCard; reversed: boolean }[] = []
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    const card = pool.splice(idx, 1)[0]
    result.push({ card, reversed: Math.random() < 0.5 })
  }
  return result
}
