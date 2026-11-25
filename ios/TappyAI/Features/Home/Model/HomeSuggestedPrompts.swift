import Foundation

/// One "Hỏi Tappy thử" card's content — the web's `SuggestedPrompt` (`src/lib/suggestedPrompts.ts`).
/// `category` is one of food / shopping / entertainment / travel / spa / general; only `general`
/// (any-topic) prompts carry a `topic` (work, study, money, health, family, news, tech, writing).
struct HomeSuggestedPrompt: Equatable {
    let text: String
    let textEn: String
    let category: String
    let topic: String?
    let emoji: String
    /// Badge tint key: the category, or `cafe` for the amber café prompts (web `CAFE_GRADIENT`).
    let tone: String
}

/// Port of the web's `getDynamicPrompts(hour, day, memory, gender, count)` for the signed-out /
/// no-memory / no-gender case, which is what iOS Home has (so the female / male / spa-override
/// pools and location localisation are not ported — they need data iOS does not hold here).
/// Selection is random exactly like the web (`shuffle`); inject a generator for tests.
enum HomeSuggestedPrompts {

    /// Web `page.tsx:83`: `getDynamicPrompts(vnTime.getUTCHours(), vnTime.getUTCDay(), …, 5)`,
    /// i.e. hour and weekday (0 = Sunday) in Vietnam time.
    static let timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh") ?? TimeZone(secondsFromGMT: 7 * 3600)!

    static func vietnamHourAndDay(_ now: Date) -> (hour: Int, dayOfWeek: Int) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let c = calendar.dateComponents([.hour, .weekday], from: now)
        return (c.hour ?? 0, (c.weekday ?? 1) - 1)
    }

    static func get(hour: Int, dayOfWeek: Int, count: Int = 5) -> [HomeSuggestedPrompt] {
        var rng = SystemRandomNumberGenerator()
        return get(hour: hour, dayOfWeek: dayOfWeek, count: count, using: &rng)
    }

    static func get<G: RandomNumberGenerator>(hour: Int, dayOfWeek: Int, count: Int = 5, using rng: inout G) -> [HomeSuggestedPrompt] {
        // 1. Time-based base pool (web ts:282-287)
        let basePool: [Item]
        if hour >= 5 && hour < 9 { basePool = morning }
        else if hour >= 11 && hour < 14 { basePool = lunch }
        else if hour >= 14 && hour < 17 { basePool = afternoon }
        else if hour >= 17 && hour < 20 { basePool = evening }
        else if hour >= 20 { basePool = night }
        else { basePool = morning }

        // 2. Day-of-week pool (ts:291-293)
        let dayPool: [Item]
        if dayOfWeek >= 1 && dayOfWeek <= 3 { dayPool = weekday }
        else if dayOfWeek == 4 || dayOfWeek == 5 { dayPool = thuFri }
        else { dayPool = weekend }

        // 3-4. Witty pool stands in for the gender pool; merge and shuffle (ts:296-309)
        let genderPool = shuffle(witty, using: &rng)
        let pool = shuffle(Array(genderPool.prefix(4)) + basePool + dayPool + Array(witty.prefix(3)) + discovery, using: &rng)

        // Dedupe by text (ts:350-355)
        var seen = Set<String>()
        let candidates = pool.filter { seen.insert($0.text).inserted }

        // 6. At least half the strip is any-topic; the rest keeps vertical diversity; they alternate,
        //    any-topic first (ts:357-371).
        let generalCount = min((count + 1) / 2, general.count)
        let picked = Array(shuffle(general, using: &rng).prefix(generalCount))
        let verticals = candidates.filter { $0.category != "general" }
        let restCount = count - picked.count
        let rest = diversifyByCategory(verticals, count: restCount, using: &rng)
        var selected: [Item] = []
        var i = 0
        while selected.count < picked.count + rest.count {
            if i < picked.count { selected.append(picked[i]) }
            if i < rest.count { selected.append(rest[i]) }
            i += 1
        }
        return selected.map { $0.prompt }
    }

    /// Web `diversifyByCategory` (ts:251-271): round-robin across categories (category order
    /// shuffled, order inside a category kept), the category used last never opens the next lap.
    static func diversifyByCategory<G: RandomNumberGenerator>(_ items: [Item], count: Int, using rng: inout G) -> [Item] {
        var order: [String] = []
        var buckets: [String: [Item]] = [:]
        for p in items {
            if buckets[p.category] == nil { order.append(p.category) }
            buckets[p.category, default: []].append(p)
        }
        var queues = shuffle(order, using: &rng).map { buckets[$0] ?? [] }
        var out: [Item] = []
        while out.count < count && queues.contains(where: { !$0.isEmpty }) {
            let lastCat = out.last?.category
            var lap = queues.indices.filter { !queues[$0].isEmpty }
            if lap.count > 1, let last = lastCat, queues[lap[0]][0].category == last { lap.append(lap.removeFirst()) }
            for q in lap {
                if out.count >= count { break }
                out.append(queues[q].removeFirst())
            }
        }
        return out
    }

    private static func shuffle<T, G: RandomNumberGenerator>(_ array: [T], using rng: inout G) -> [T] {
        var a = array
        guard a.count > 1 else { return a }
        for i in stride(from: a.count - 1, to: 0, by: -1) {
            let j = Int.random(in: 0...i, using: &rng)
            a.swapAt(i, j)
        }
        return a
    }

    // MARK: - Pool item

    struct Item {
        let text: String
        let textEn: String
        let category: String
        var topic: String? = nil
        var emoji: String? = nil
        var cafe = false

        init(_ text: String, _ textEn: String, _ category: String, topic: String? = nil, emoji: String? = nil, cafe: Bool = false) {
            self.text = text; self.textEn = textEn; self.category = category
            self.topic = topic; self.emoji = emoji; self.cafe = cafe
        }

        var prompt: HomeSuggestedPrompt {
            HomeSuggestedPrompt(text: text, textEn: textEn, category: category, topic: topic,
                                emoji: emoji ?? HomeSuggestedPrompts.defaultEmoji[category] ?? "✨",
                                tone: cafe ? "cafe" : category)
        }
    }

    /// Web `DEFAULT_EMOJI` (ts:40-47).
    static let defaultEmoji: [String: String] = [
        "food": "🍜", "shopping": "🛍️", "entertainment": "🎮", "travel": "✈️", "spa": "💆", "general": "💡",
    ]

    // MARK: - Pools (web ts:62-242, verbatim wording)

    static let witty: [Item] = [
        .init("\"Ăn gì?\" — câu hỏi khó nhất ngày. Tappy quyết hộ luôn 🤔", "\"What to eat?\" — the hardest question of the day. Let Tappy decide 🤔", "food"),
        .init("Hôm nay tự thưởng một cái gì đó đi, xứng đáng mà 🎁", "Treat yourself to something today, you deserve it 🎁", "entertainment"),
        .init("Tìm quán ngon không cần hỏi cả group chat nữa", "Find a great spot without asking the whole group chat", "food"),
        .init("Deadline xong rồi — tối nay ăn gì cho xứng? 🎉", "Deadline done — what dinner does that deserve? 🎉", "food"),
        .init("Đặt đồ ăn thôi, hôm nay không muốn quyết định thêm gì 😌", "Just order food — no more decisions today 😌", "food"),
        .init("Tìm chỗ ngồi đủ ngon để gọi là \"đang làm việc\" 💼", "Find a spot nice enough to count as \"working\" 💼", "food", emoji: "☕", cafe: true),
        .init("Bữa ăn ngon nhất là bữa ăn không cần nấu 😏", "The best meal is the one you don't have to cook 😏", "food"),
        .init("Giá như có người quyết chỗ ăn hộ... à có rồi, là Tappy 😄", "If only someone picked where to eat for you... oh wait, that's Tappy 😄", "food"),
        .init("Deal hôm nay có gì để biện hộ cho ví tiền không? 💸", "Any deals today to justify to my wallet? 💸", "shopping"),
        .init("Chỗ đẹp, ngon, không đắt — unicorn hay có thật?", "Pretty, tasty, not pricey — a unicorn or the real deal?", "food"),
        .init("Cần kế hoạch cho buổi tối không cần nghĩ quá nhiều", "Need an evening plan that requires zero overthinking", "entertainment"),
        .init("Đi đâu cuối tuần mà về không muốn đi làm sớm hơn?", "Where to go this weekend that won't make Monday feel worse?", "travel"),
    ]

    static let morning: [Item] = [
        .init("Sáng nay ăn gì? Gợi ý quán ăn sáng ngon gần đây", "What's for breakfast? Suggest good breakfast spots nearby", "food"),
        .init("Cà phê yên tĩnh để làm việc buổi sáng?", "A quiet café for morning work?", "food", emoji: "☕", cafe: true),
        .init("Bún bò, phở hay bánh mì ngon sáng nay?", "Bún bò, phở or bánh mì — what sounds good this morning?", "food"),
        .init("Cà phê sáng không đông, ngồi được lâu?", "A morning café that's not crowded and good for a long sit?", "food", emoji: "☕", cafe: true),
        .init("Ăn sáng nhẹ, healthy gần chỗ làm?", "A light, healthy breakfast near work?", "food"),
        .init("Cà phê take away ngon và nhanh buổi sáng?", "Good, quick takeaway coffee this morning?", "food", emoji: "☕", cafe: true),
        .init("Quán bánh mì ngon, không xếp hàng lâu?", "A good bánh mì spot without a long queue?", "food"),
        .init("Sáng nay ngủ dậy muộn, ăn gì nhanh nhỉ? ⏰", "Overslept this morning — what's quick to eat? ⏰", "food"),
        .init("Cà phê sáng mà đến không muộn — liệu có khả thi? 🤔", "Morning coffee without being late — is that even possible? 🤔", "food", emoji: "☕", cafe: true),
    ]

    static let lunch: [Item] = [
        .init("Hôm nay ăn trưa ở đâu ngon gần đây?", "Where's a good lunch nearby today?", "food"),
        .init("Quán cơm ngon, không phải chờ lâu?", "A good rice place without a long wait?", "food"),
        .init("Cơm văn phòng bình dân gần khu vực này?", "An affordable office lunch near this area?", "food"),
        .init("Bún/phở/mì trưa nay ăn gì ngon?", "Bún, phở or noodles — what's good for lunch today?", "food"),
        .init("Đặt đồ ăn trưa qua ShopeeFood có gì ngon?", "What's good for lunch delivery on ShopeeFood?", "food"),
        .init("Cơm gà hay cơm sườn, quán nào ngon nhất gần đây?", "Cơm gà or cơm sườn — which spot is best nearby?", "food"),
        .init("11h rồi, họp xong là chạy đi ăn ngay — chỗ nào nhanh? 🏃", "It's 11 already, sprinting to lunch right after the meeting — where's fast? 🏃", "food"),
        .init("Ăn trưa một mình mà không thấy buồn — quán nào hay? 😄", "Lunch alone without feeling lonely — any good spots? 😄", "food"),
    ]

    static let afternoon: [Item] = [
        .init("Cà phê buổi chiều, chỗ nào có view đẹp?", "Afternoon coffee — where has a nice view?", "food", emoji: "☕", cafe: true),
        .init("Deal spa chiều nay, thư giãn sau giờ làm?", "Spa deals this afternoon to unwind after work?", "spa"),
        .init("Bánh ngọt + cà phê chiều ở đâu ngon?", "Where's good for afternoon coffee + pastries?", "food", emoji: "☕", cafe: true),
        .init("Chỗ ngồi làm việc yên tĩnh, wifi tốt buổi chiều?", "A quiet work spot with good wifi this afternoon?", "food", emoji: "☕", cafe: true),
        .init("Trà sữa hay đồ uống mát lạnh chiều nay ngon?", "Bubble tea or a cold drink — what's good this afternoon?", "food", emoji: "🧋", cafe: true),
        .init("Nail + spa nhanh, xong trước 18h gần đây?", "Quick nails + spa nearby, done before 6pm?", "spa"),
        .init("Chiều nay cần relax, spa massage ở đâu ngon?", "Need to relax this afternoon — where's a good spa massage?", "spa"),
        .init("3h chiều — buồn ngủ hay cà phê? Tappy gợi ý đi ☕", "3pm — nap or coffee? Tappy, suggest something ☕", "food", emoji: "☕", cafe: true),
        .init("Chiều nay trốn office một tí — cà phê chỗ nào ổn? 😏", "Sneaking out of the office this afternoon — which café works? 😏", "food", emoji: "☕", cafe: true),
    ]

    static let evening: [Item] = [
        .init("Tối nay ăn gì với gia đình hay bạn bè?", "What to eat tonight with family or friends?", "food"),
        .init("Bar hoặc café nghe nhạc tối nay ở đâu?", "A bar or café with music tonight — where to?", "entertainment"),
        .init("Nhà hàng tối nay, không cần đặt trước?", "A restaurant tonight, no reservation needed?", "food"),
        .init("Quán lẩu hoặc nướng tối nay gần đây?", "Hotpot or BBQ nearby tonight?", "food"),
        .init("Xem phim tối nay, rạp nào còn chỗ?", "Movie tonight — which cinema still has seats?", "entertainment"),
        .init("Happy hour tối nay ở bar nào ngon?", "Which bar has a good happy hour tonight?", "entertainment"),
        .init("Quán hải sản tươi sống tối nay gần đây?", "Fresh seafood nearby tonight?", "food"),
        .init("Tối nay muốn đi đâu đó — không cần nghĩ nhiều, Tappy đề xuất đi", "Want to go somewhere tonight — no overthinking, Tappy, you pick", "entertainment"),
        .init("Ăn gì tối nay mà cả nhóm không cãi nhau? 😂", "What dinner won't start a group argument tonight? 😂", "food"),
    ]

    static let night: [Item] = [
        .init("Đêm nay có gì vui không?", "Anything fun going on tonight?", "entertainment"),
        .init("Quán nhậu ngon, không quá ồn tối nay?", "A good drinking spot tonight that's not too loud?", "food"),
        .init("Bia hơi hay cocktail bar tối nay ở đâu?", "Bia hơi or a cocktail bar — where to tonight?", "entertainment"),
        .init("Đồ ăn khuya ngon ship nhanh gần đây?", "Good late-night food with fast delivery nearby?", "food"),
        .init("Quán cà phê mở khuya, ngồi chill được?", "A café open late, good for chilling?", "food", emoji: "☕", cafe: true),
        .init("Đặt pizza/burger khuya giao nhanh?", "Late-night pizza/burger with fast delivery?", "food"),
        .init("Karaoke tối nay, chỗ nào giá ok?", "Karaoke tonight — where has decent prices?", "entertainment"),
        .init("Khuya rồi mà vẫn chưa ngủ được — đặt gì ăn vặt thôi 🌙", "It's late and sleep isn't happening — let's order a snack 🌙", "food"),
        .init("Mì tôm hay order đồ ăn khuya? Tappy chọn hộ đi 😴", "Instant noodles or late-night delivery? Tappy, you choose 😴", "food"),
    ]

    static let weekday: [Item] = [
        .init("Cà phê làm việc đầu tuần, chỗ nào yên tĩnh?", "A quiet café to start the work week?", "food", emoji: "☕", cafe: true),
        .init("Ăn uống healthy đầu tuần, quán nào ngon?", "Healthy eats to kick off the week — which spot is good?", "food"),
        .init("Cơm bình dân gần văn phòng đầu tuần?", "An affordable lunch near the office to start the week?", "food"),
        .init("Thứ 2 lại rồi... ăn gì để đỡ buồn hơn nhỉ? 😅", "Monday again... what to eat to make it hurt less? 😅", "food"),
    ]

    static let thuFri: [Item] = [
        .init("Spa thư giãn cuối tuần sắp tới, đặt trước ở đâu?", "A relaxing spa for the coming weekend — where to book ahead?", "spa"),
        .init("Kế hoạch tối thứ 6 đi đâu chơi?", "Friday night plans — where to go?", "entertainment"),
        .init("Happy hour thứ 6 ở bar nào ngon?", "Which bar has a good Friday happy hour?", "entertainment"),
        .init("Dinner cuối tuần, nhà hàng nào cần đặt trước?", "Weekend dinner — which restaurants need a reservation?", "food"),
        .init("Thứ 6 rồi! Tối nay ăn gì xứng tầm với cả tuần làm việc? 🎊", "It's Friday! What dinner is worthy of the whole work week? 🎊", "food"),
    ]

    static let weekend: [Item] = [
        .init("Cuối tuần đi đâu chơi gần thành phố?", "Where to go this weekend near the city?", "travel"),
        .init("Khách sạn staycation cuối tuần giá tốt?", "A good-value staycation hotel this weekend?", "travel"),
        .init("Hoạt động vui cuối tuần cho cả gia đình?", "Fun weekend activities for the whole family?", "entertainment"),
        .init("Resort nghỉ dưỡng 1-2 ngày gần thành phố?", "A 1-2 day resort getaway near the city?", "travel"),
        .init("Buffet cuối tuần ngon, không phải đặt trước?", "A good weekend buffet, no booking needed?", "food"),
        .init("Điểm check-in đẹp cuối tuần gần đây?", "Pretty photo spots nearby this weekend?", "travel"),
        .init("Cuối tuần mà ở nhà thì... thôi đi đâu đó đi 😄", "Staying home on a weekend? Nah... let's go somewhere 😄", "entertainment"),
        .init("Kế hoạch cuối tuần: không plan gì cả, Tappy gợi ý hộ đi", "Weekend plan: no plan at all — Tappy, suggest something", "entertainment"),
    ]

    /// Cross-vertical discovery, merged into every draw (ts:213-222).
    static let discovery: [Item] = [
        .init("Đang có deal hay khuyến mãi nào đáng mua gần đây không?", "Any worthwhile deals or promotions nearby right now?", "shopping"),
        .init("Trung tâm thương mại nào đang sale, đi dạo mua sắm một vòng?", "Which mall has a sale on — a little shopping stroll?", "shopping"),
        .init("Gợi ý lịch trình du lịch 2 ngày 1 đêm gần đây?", "A 2-day, 1-night trip itinerary nearby?", "travel"),
        .init("Nên đi du lịch đâu dịp nghỉ lễ sắp tới?", "Where should I travel for the next holiday?", "travel"),
        .init("Tối nay có phim hay hoặc sự kiện gì đáng đi không?", "Any good movie or event worth going to tonight?", "entertainment"),
        .init("Chỗ vui chơi giải trí cho nhóm bạn cuối tuần này?", "Somewhere fun for a group of friends this weekend?", "entertainment"),
        .init("Spa hoặc massage thư giãn sau một tuần mệt?", "A spa or massage to unwind after a tiring week?", "spa"),
        .init("Phòng gym, yoga hoặc chỗ chăm sóc sức khoẻ gần đây?", "A gym, yoga studio or wellness spot nearby?", "spa"),
    ]

    /// Any-topic prompts, each authored with the topic its card picture follows (ts:225-242).
    static let general: [Item] = [
        .init("Mình đang phân vân giữa hai lời mời làm việc — giúp mình cân nhắc nhé?", "I'm torn between two job offers — can you help me weigh them?", "general", topic: "work"),
        .init("Nên học cao học hay đi làm ngay sau khi ra trường?", "Grad school or start working right after graduating?", "general", topic: "study", emoji: "🎓"),
        .init("Có một khoản tiền nhàn rỗi: nên trả nợ hay để tiết kiệm?", "I have spare money: pay off debt or save it?", "general", topic: "money", emoji: "💰"),
        .init("Giải thích giúp mình lãi kép là gì, cho ví dụ dễ hiểu", "Explain compound interest with an easy example", "general", topic: "money", emoji: "📈"),
        .init("Viết lại giúp mình email xin nghỉ phép cho lịch sự hơn", "Help me rewrite a leave-request email so it sounds more polite", "general", topic: "writing", emoji: "✉️"),
        .init("Mình hay ngủ muộn rồi mệt cả ngày — đổi thói quen thế nào cho dễ?", "I stay up late and feel tired all day — how can I change the habit?", "general", topic: "health", emoji: "😴"),
        .init("Làm sao nói chuyện với người thân khi hai bên đang hơi căng về chuyện tiền?", "How do I talk to a family member when money is causing tension?", "general", topic: "family", emoji: "💬"),
        .init("Laptop hay MacBook cho người mới học lập trình?", "Laptop or MacBook for someone learning to code?", "general", topic: "tech", emoji: "💻"),
        .init("Chuẩn bị gì cho buổi phỏng vấn trong 2 ngày tới?", "How should I prepare for an interview in two days?", "general", topic: "work", emoji: "🗂️"),
        .init("Giải thích giúp mình lạm phát ảnh hưởng thế nào đến tiền tiết kiệm", "Explain how inflation affects my savings", "general", topic: "money", emoji: "📉"),
        .init("Tin tức nổi bật hôm nay có gì đáng chú ý?", "What's the most notable news today?", "general", topic: "news", emoji: "📰"),
        .init("Mình muốn bắt đầu tập thói quen đọc sách — bắt đầu từ đâu?", "I want to build a reading habit — where do I start?", "general", topic: "study", emoji: "📚"),
        .init("Tỷ giá USD/VND hôm nay là bao nhiêu và vì sao hay dao động?", "What's today's USD/VND rate and why does it fluctuate?", "general", topic: "money", emoji: "💱"),
        .init("Mình bị áp lực công việc, làm gì để bớt stress mà không bỏ việc?", "Work pressure is getting to me — how to ease stress without quitting?", "general", topic: "health", emoji: "🧘"),
        .init("Học tiếng Anh giao tiếp trong 3 tháng — lộ trình thực tế?", "Learning conversational English in 3 months — a realistic plan?", "general", topic: "study", emoji: "🗣️"),
        .init("Nên đàm phán lương thế nào khi nhận offer mới?", "How should I negotiate salary on a new offer?", "general", topic: "work", emoji: "🤝"),
    ]
}
