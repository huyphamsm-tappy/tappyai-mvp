import Foundation

// The pure half of the trip answer (step 1 of the layout rework, owner mockups 26/11): what the overview card and the stop rows show, decided from
// the plan the server sent. RULE NUMBER ONE: only what the data has — a field that is missing is not drawn, and nothing is made up (no season,
// no tips of our own, no picture). The words in the rows are the server's words, character for character.

enum TripOverviewModel {
    /// A budget longer than this is not a chip: it is a sentence (the server sometimes writes «Chưa chốt được tổng: …»), and it is drawn as the
    /// card's paragraph, in full.
    static let maxChipLength = 28

    struct Chip: Equatable, Identifiable {
        enum Kind: String { case budget, duration, people }
        let kind: Kind
        let value: String
        var id: String { kind.rawValue }
    }

    /// One line of the expanded sheet: a label above, the value below.
    struct Row: Equatable, Identifiable {
        let labelKey: String
        let value: String
        var id: String { labelKey + "|" + value }
    }

    struct Overview: Equatable {
        /// Short facts, as chips: budget, time and people — only the ones the data has.
        var chips: [Chip]
        /// The long explanation (the budget sentence), or nil.
        var paragraph: String?
        /// Everything the plan says about the trip, for the sheet.
        var rows: [Row]
        var costs: [TappyPlan.CostLine]
        var assumptions: [String]
    }

    /// The nights of a trip of `days` days: one fewer than the days. Nil for a plan that is not a trip (an evening has no «N đêm»).
    static func derivedDuration(days: Int, area: PlanArea) -> String? {
        guard area == .travel, days >= 1 else { return nil }
        return days == 1
            ? String(format: NSLocalizedString("trip.duration.oneDay", comment: ""), 1)
            : String(format: NSLocalizedString("trip.duration.daysNights", comment: ""), days, days - 1)
    }

    static func of(_ plan: TappyPlan, card: PlanCardModel) -> Overview {
        var chips: [Chip] = []
        var paragraph: String?
        var rows: [Row] = []

        // Budget: the server's figure, and its sentence when it is one.
        if let budget = PlanPrice.amount(plan.budgetTotal) {
            if budget.count <= maxChipLength { chips.append(Chip(kind: .budget, value: budget)) } else { paragraph = budget }
            rows.append(Row(labelKey: "chat.planV2.budget", value: budget))
            if let perPerson = PlanPrice.amount(plan.budgetPerPerson) {
                rows.append(Row(labelKey: "trip.budgetPerPerson", value: perPerson))
            }
        }

        // Time: the plan's own duration, else the number of days it lists.
        let duration = card.duration ?? derivedDuration(days: card.days.count, area: card.area)
        if let duration {
            chips.append(Chip(kind: .duration, value: duration))
            rows.append(Row(labelKey: "chat.planV2.duration", value: duration))
        }
        if let destination = card.destination {
            rows.append(Row(labelKey: "chat.planV2.destination", value: destination))
        }

        // People: the count the plan names, else the party the plan says it is for.
        let party = plan.traveler?.party
        if let people = card.people {
            let value = String(format: NSLocalizedString("chat.planV2.people", comment: ""), people)
            chips.append(Chip(kind: .people, value: value))
            rows.append(Row(labelKey: "chat.planV2.peopleLabel", value: value))
        } else if let party {
            chips.append(Chip(kind: .people, value: party))
        }
        if let party, card.people != nil {
            rows.append(Row(labelKey: "trip.travelerParty", value: party))
        } else if let party, !rows.contains(where: { $0.labelKey == "chat.planV2.peopleLabel" }) {
            rows.append(Row(labelKey: "chat.planV2.peopleLabel", value: party))
        }
        if let pace = plan.traveler?.pace { rows.append(Row(labelKey: "trip.travelerPace", value: pace)) }
        if let interests = plan.traveler?.interests, !interests.isEmpty {
            rows.append(Row(labelKey: "trip.travelerInterests", value: interests.joined(separator: " · ")))
        }

        return Overview(chips: chips, paragraph: paragraph, rows: rows, costs: plan.costBreakdown ?? [], assumptions: plan.assumptions ?? [])
    }
}

/// The small symbol of a stop that has no picture: by its `category` (the server's word), else by its emoji's meaning, else a pin.
enum TripStopIcon {
    static func symbol(category: String, emoji: String = "") -> String {
        let c = category.lowercased()
        func has(_ words: [String]) -> Bool { words.contains { c.contains($0) } }
        if has(["hotel", "lưu trú", "luu tru", "stay", "nghỉ", "nghi ngoi", "homestay", "resort", "check-in", "nhận phòng"]) { return "bed.double.fill" }
        if has(["food", "ăn", "an uong", "ẩm thực", "restaurant", "quán", "cafe", "cà phê", "dining", "meal"]) { return "fork.knife" }
        if has(["transport", "di chuyển", "di chuyen", "xe", "car", "bus", "taxi", "tàu", "train"]) { return "car.fill" }
        if has(["flight", "bay", "airport", "sân bay"]) { return "airplane" }
        if has(["shop", "mua", "market", "chợ"]) { return "bag.fill" }
        if has(["spa", "massage", "wellness"]) { return "leaf.fill" }
        if has(["entertain", "giải trí", "show", "ticket", "vé"]) { return "ticket.fill" }
        if has(["sight", "tham quan", "attraction", "nature", "thiên nhiên", "view", "check in"]) { return "camera.fill" }
        return "mappin.circle.fill"
    }
}

/// The second line of a dish (web: «venue · note», or the note alone).
enum TripDishLine {
    static func text(venue: String?, note: String?) -> String? {
        switch (venue, note) {
        case let (venue?, note?): return venue + " · " + note
        case let (venue?, nil): return venue
        case let (nil, note?): return note
        default: return nil
        }
    }
}
