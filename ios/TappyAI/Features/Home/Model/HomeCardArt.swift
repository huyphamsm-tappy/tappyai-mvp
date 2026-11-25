import Foundation

/// Port of the web's `assignCardArt` (`src/app/HomeV3.tsx:128-256`): one picture per card, all different,
/// the same every time for the same input. Art ids are the web's own paths (`/home/inspire/food-2.webp`,
/// `/home/topics/work.webp`, `/tappy/thinking.png`) so the two stay comparable; `HomeCardArtImage` maps
/// an id to its bundled file.
enum HomeCardArt {
    /// What the picture choice may depend on — never the prompt text or the emoji.
    struct Card: Equatable {
        let category: String
        var topic: String? = nil
        /// A real photograph wins outright (nothing sets it today).
        var imageUrl: String? = nil
    }

    /// Web `CATEGORY_ART_VARIANTS` (ts:128-134): three photographs per category.
    static let categoryVariants: [String: [String]] = [
        "food": ["/home/inspire/food.webp", "/home/inspire/food-2.webp", "/home/inspire/food-3.webp"],
        "travel": ["/home/inspire/travel.webp", "/home/inspire/travel-2.webp", "/home/inspire/travel-3.webp"],
        "shopping": ["/home/inspire/shopping.webp", "/home/inspire/shopping-2.webp", "/home/inspire/shopping-3.webp"],
        "spa": ["/home/inspire/spa.webp", "/home/inspire/spa-2.webp", "/home/inspire/spa-3.webp"],
        "entertainment": ["/home/inspire/entertainment.webp", "/home/inspire/entertainment-2.webp", "/home/inspire/entertainment-3.webp"],
    ]

    /// Web `ART_POOL`: `Object.values(CATEGORY_ART_VARIANTS).flat()` — insertion order food, travel, shopping, spa, entertainment.
    static let pool: [String] = ["food", "travel", "shopping", "spa", "entertainment"].flatMap { categoryVariants[$0] ?? [] }

    /// Web `TOPIC_ART` (ts:137-146): owner photographs for the any-topic cards; tech and writing have one.
    static let topicArt: [String: [String]] = [
        "work": ["/home/topics/work.webp", "/home/topics/work-2.webp"],
        "study": ["/home/topics/study.webp", "/home/topics/study-2.webp"],
        "money": ["/home/topics/money.webp", "/home/topics/money-2.webp"],
        "health": ["/home/topics/health.webp", "/home/topics/health-2.webp"],
        "family": ["/home/topics/family.webp", "/home/topics/family-2.webp"],
        "news": ["/home/topics/news.webp", "/home/topics/news-2.webp"],
        "tech": ["/home/topics/tech.webp"],
        "writing": ["/home/topics/writing.webp"],
    ]

    /// Web `NEUTRAL_MASCOT_ART` (ts:148): Tappy poses for cards with no photograph of their own.
    static let neutralMascot: [String] = ["/tappy/thinking.png", "/tappy/speaking.png", "/tappy/recommendation.png", "/tappy/aitools.png", "/tappy/welcome.png"]

    /// Web `CATEGORY_PREFERRED_ART` (ts:169-175).
    static let preferred: [String: String] = [
        "food": "/home/inspire/food.webp",
        "travel": "/home/inspire/travel.webp",
        "shopping": "/home/inspire/shopping.webp",
        "spa": "/home/inspire/spa.webp",
        "entertainment": "/home/inspire/entertainment.webp",
    ]

    static func isMascot(_ art: String) -> Bool { art.hasPrefix("/tappy/") }

    static func assign(_ cards: [Card]) -> [String] {
        var out = [String?](repeating: nil, count: cards.count)
        var used = Set<String>()

        // 1. Real imagery is never overridden by a stand-in.
        for (i, card) in cards.enumerated() {
            if let url = card.imageUrl, !url.isEmpty { out[i] = url }
        }

        // 2. Cards whose category has no photography (general): the first free picture of their topic, else the
        //    mascot in a neutral pose rotated by position (never by the card's words).
        var neutral = 0
        var topicUsed = Set<String>()
        for (i, card) in cards.enumerated() {
            if out[i] != nil || categoryVariants[card.category] != nil { continue }
            let own = card.topic.flatMap { topicArt[$0] } ?? []
            if let pick = own.first(where: { !topicUsed.contains($0) }) {
                out[i] = pick
                topicUsed.insert(pick)
                continue
            }
            out[i] = neutralMascot[neutral % neutralMascot.count]
            neutral += 1
        }

        // 3. The first free picture OF THE CARD'S OWN CATEGORY (preferred scene first, then its variants).
        for (i, card) in cards.enumerated() where out[i] == nil {
            let own = ([preferred[card.category]].compactMap { $0 }) + (categoryVariants[card.category] ?? [])
            if let pick = own.first(where: { !used.contains($0) }) {
                out[i] = pick
                used.insert(pick)
            }
        }

        // 4. Next free scene in the pool, walked from the card's own position.
        for i in cards.indices where out[i] == nil {
            var picked = false
            for step in 0..<pool.count {
                let candidate = pool[(i + step) % pool.count]
                if !used.contains(candidate) {
                    out[i] = candidate
                    used.insert(candidate)
                    picked = true
                    break
                }
            }
            if !picked { out[i] = pool[i % pool.count] }
        }

        return out.map { $0 ?? pool[0] }
    }
}
