import Foundation

struct SuggestedPrompt {
    let text: String
    let textEn: String
    let category: String
}

enum DynamicPrompts {

    static func get(hour: Int, dayOfWeek: Int, count: Int = 3) -> [SuggestedPrompt] {
        let basePool: [PromptItem]
        if hour >= 5 && hour < 9 { basePool = morning }
        else if hour >= 11 && hour < 14 { basePool = lunch }
        else if hour >= 14 && hour < 17 { basePool = afternoon }
        else if hour >= 17 && hour < 20 { basePool = evening }
        else if hour >= 20 { basePool = night }
        else { basePool = morning }

        let dayPool: [PromptItem]
        if dayOfWeek >= 1 && dayOfWeek <= 3 { dayPool = weekday }
        else if dayOfWeek == 4 || dayOfWeek == 5 { dayPool = thuFri }
        else { dayPool = weekend }

        var pool = (witty.shuffled().prefix(4) + basePool + dayPool + witty.prefix(3)).shuffled()

        var seen = Set<String>()
        pool = pool.filter { seen.insert($0.text).inserted }

        var selected: [PromptItem] = []
        var usedCats = Set<String>()
        for p in pool where selected.count < count {
            if !usedCats.contains(p.category) || selected.count == count - 1 {
                selected.append(p)
                usedCats.insert(p.category)
            }
        }
        for p in pool where selected.count < count {
            if !selected.contains(where: { $0.text == p.text }) { selected.append(p) }
        }

        return selected.prefix(count).map { SuggestedPrompt(text: $0.text, textEn: $0.textEn, category: $0.category) }
    }

    private struct PromptItem {
        let text: String
        let textEn: String
        let category: String
    }

    // MARK: - Witty general

    private static let witty: [PromptItem] = [
        .init(text: "\"Ăn gì?\" — câu hỏi khó nhất ngày. Tappy quyết hộ luôn 🤔", textEn: "\"What to eat?\" — the hardest question of the day. Let Tappy decide 🤔", category: "food"),
        .init(text: "Hôm nay tự thưởng một cái gì đó đi, xứng đáng mà 🎁", textEn: "Treat yourself to something today, you deserve it 🎁", category: "entertainment"),
        .init(text: "Tìm quán ngon không cần hỏi cả group chat nữa", textEn: "Find a great spot without asking the whole group chat", category: "food"),
        .init(text: "Deadline xong rồi — tối nay ăn gì cho xứng? 🎉", textEn: "Deadline done — what dinner does that deserve? 🎉", category: "food"),
        .init(text: "Đặt đồ ăn thôi, hôm nay không muốn quyết định thêm gì 😌", textEn: "Just order food — no more decisions today 😌", category: "food"),
        .init(text: "Tìm chỗ ngồi đủ ngon để gọi là \"đang làm việc\" 💼", textEn: "Find a spot nice enough to count as \"working\" 💼", category: "food"),
        .init(text: "Bữa ăn ngon nhất là bữa ăn không cần nấu 😏", textEn: "The best meal is the one you don't have to cook 😏", category: "food"),
        .init(text: "Giá như có người quyết chỗ ăn hộ... à có rồi, là Tappy 😄", textEn: "If only someone picked where to eat for you... oh wait, that's Tappy 😄", category: "food"),
        .init(text: "Deal hôm nay có gì để biện hộ cho ví tiền không? 💸", textEn: "Any deals today to justify to my wallet? 💸", category: "shopping"),
        .init(text: "Chỗ đẹp, ngon, không đắt — unicorn hay có thật?", textEn: "Pretty, tasty, not pricey — a unicorn or the real deal?", category: "food"),
        .init(text: "Cần kế hoạch cho buổi tối không cần nghĩ quá nhiều", textEn: "Need an evening plan that requires zero overthinking", category: "entertainment"),
        .init(text: "Đi đâu cuối tuần mà về không muốn đi làm sớm hơn?", textEn: "Where to go this weekend that won't make Monday feel worse?", category: "travel"),
    ]

    // MARK: - Time-based

    private static let morning: [PromptItem] = [
        .init(text: "Sáng nay ăn gì? Gợi ý quán ăn sáng ngon gần đây", textEn: "What's for breakfast? Suggest good breakfast spots nearby", category: "food"),
        .init(text: "Cà phê yên tĩnh để làm việc buổi sáng?", textEn: "A quiet café for morning work?", category: "food"),
        .init(text: "Bún bò, phở hay bánh mì ngon sáng nay?", textEn: "Bún bò, phở or bánh mì — what sounds good this morning?", category: "food"),
        .init(text: "Cà phê sáng không đông, ngồi được lâu?", textEn: "A morning café that's not crowded and good for a long sit?", category: "food"),
        .init(text: "Ăn sáng nhẹ, healthy gần chỗ làm?", textEn: "A light, healthy breakfast near work?", category: "food"),
        .init(text: "Sáng nay ngủ dậy muộn, ăn gì nhanh nhỉ? ⏰", textEn: "Overslept this morning — what's quick to eat? ⏰", category: "food"),
    ]

    private static let lunch: [PromptItem] = [
        .init(text: "Hôm nay ăn trưa ở đâu ngon gần đây?", textEn: "Where's a good lunch nearby today?", category: "food"),
        .init(text: "Quán cơm ngon, không phải chờ lâu?", textEn: "A good rice place without a long wait?", category: "food"),
        .init(text: "Cơm văn phòng bình dân gần khu vực này?", textEn: "An affordable office lunch near this area?", category: "food"),
        .init(text: "Bún/phở/mì trưa nay ăn gì ngon?", textEn: "Bún, phở or noodles — what's good for lunch today?", category: "food"),
        .init(text: "11h rồi, họp xong là chạy đi ăn ngay — chỗ nào nhanh? 🏃", textEn: "It's 11 already, sprinting to lunch right after the meeting — where's fast? 🏃", category: "food"),
        .init(text: "Ăn trưa một mình mà không thấy buồn — quán nào hay? 😄", textEn: "Lunch alone without feeling lonely — any good spots? 😄", category: "food"),
    ]

    private static let afternoon: [PromptItem] = [
        .init(text: "Cà phê buổi chiều, chỗ nào có view đẹp?", textEn: "Afternoon coffee — where has a nice view?", category: "food"),
        .init(text: "Deal spa chiều nay, thư giãn sau giờ làm?", textEn: "Spa deals this afternoon to unwind after work?", category: "spa"),
        .init(text: "Bánh ngọt + cà phê chiều ở đâu ngon?", textEn: "Where's good for afternoon coffee + pastries?", category: "food"),
        .init(text: "Trà sữa hay đồ uống mát lạnh chiều nay ngon?", textEn: "Bubble tea or a cold drink — what's good this afternoon?", category: "food"),
        .init(text: "3h chiều — buồn ngủ hay cà phê? Tappy gợi ý đi ☕", textEn: "3pm — nap or coffee? Tappy, suggest something ☕", category: "food"),
        .init(text: "Chiều nay trốn office một tí — cà phê chỗ nào ổn? 😏", textEn: "Sneaking out of the office this afternoon — which café works? 😏", category: "food"),
    ]

    private static let evening: [PromptItem] = [
        .init(text: "Tối nay ăn gì với gia đình hay bạn bè?", textEn: "What to eat tonight with family or friends?", category: "food"),
        .init(text: "Bar hoặc café nghe nhạc tối nay ở đâu?", textEn: "A bar or café with music tonight — where to?", category: "entertainment"),
        .init(text: "Nhà hàng tối nay, không cần đặt trước?", textEn: "A restaurant tonight, no reservation needed?", category: "food"),
        .init(text: "Quán lẩu hoặc nướng tối nay gần đây?", textEn: "Hotpot or BBQ nearby tonight?", category: "food"),
        .init(text: "Tối nay muốn đi đâu đó — không cần nghĩ nhiều, Tappy đề xuất đi", textEn: "Want to go somewhere tonight — no overthinking, Tappy, you pick", category: "entertainment"),
        .init(text: "Ăn gì tối nay mà cả nhóm không cãi nhau? 😂", textEn: "What dinner won't start a group argument tonight? 😂", category: "food"),
    ]

    private static let night: [PromptItem] = [
        .init(text: "Đêm nay có gì vui không?", textEn: "Anything fun going on tonight?", category: "entertainment"),
        .init(text: "Quán nhậu ngon, không quá ồn tối nay?", textEn: "A good drinking spot tonight that's not too loud?", category: "food"),
        .init(text: "Đồ ăn khuya ngon ship nhanh gần đây?", textEn: "Good late-night food with fast delivery nearby?", category: "food"),
        .init(text: "Quán cà phê mở khuya, ngồi chill được?", textEn: "A café open late, good for chilling?", category: "food"),
        .init(text: "Karaoke tối nay, chỗ nào giá ok?", textEn: "Karaoke tonight — where has decent prices?", category: "entertainment"),
        .init(text: "Khuya rồi mà vẫn chưa ngủ được — đặt gì ăn vặt thôi 🌙", textEn: "It's late and sleep isn't happening — let's order a snack 🌙", category: "food"),
    ]

    // MARK: - Day-of-week

    private static let weekday: [PromptItem] = [
        .init(text: "Cà phê làm việc đầu tuần, chỗ nào yên tĩnh?", textEn: "A quiet café to start the work week?", category: "food"),
        .init(text: "Ăn uống healthy đầu tuần, quán nào ngon?", textEn: "Healthy eats to kick off the week — which spot is good?", category: "food"),
        .init(text: "Cơm bình dân gần văn phòng đầu tuần?", textEn: "An affordable lunch near the office to start the week?", category: "food"),
        .init(text: "Thứ 2 lại rồi... ăn gì để đỡ buồn hơn nhỉ? 😅", textEn: "Monday again... what to eat to make it hurt less? 😅", category: "food"),
    ]

    private static let thuFri: [PromptItem] = [
        .init(text: "Spa thư giãn cuối tuần sắp tới, đặt trước ở đâu?", textEn: "A relaxing spa for the coming weekend — where to book ahead?", category: "spa"),
        .init(text: "Kế hoạch tối thứ 6 đi đâu chơi?", textEn: "Friday night plans — where to go?", category: "entertainment"),
        .init(text: "Happy hour thứ 6 ở bar nào ngon?", textEn: "Which bar has a good Friday happy hour?", category: "entertainment"),
        .init(text: "Thứ 6 rồi! Tối nay ăn gì xứng tầm với cả tuần làm việc? 🎊", textEn: "It's Friday! What dinner is worthy of the whole work week? 🎊", category: "food"),
    ]

    private static let weekend: [PromptItem] = [
        .init(text: "Cuối tuần đi đâu chơi gần thành phố?", textEn: "Where to go this weekend near the city?", category: "travel"),
        .init(text: "Khách sạn staycation cuối tuần giá tốt?", textEn: "A good-value staycation hotel this weekend?", category: "travel"),
        .init(text: "Hoạt động vui cuối tuần cho cả gia đình?", textEn: "Fun weekend activities for the whole family?", category: "entertainment"),
        .init(text: "Buffet cuối tuần ngon, không phải đặt trước?", textEn: "A good weekend buffet, no booking needed?", category: "food"),
        .init(text: "Điểm check-in đẹp cuối tuần gần đây?", textEn: "Pretty photo spots nearby this weekend?", category: "travel"),
        .init(text: "Cuối tuần mà ở nhà thì... thôi đi đâu đó đi 😄", textEn: "Staying home on a weekend? Nah... let's go somewhere 😄", category: "entertainment"),
    ]
}
