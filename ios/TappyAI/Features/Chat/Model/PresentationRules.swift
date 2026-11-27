import Foundation

// Layout step 3 (owner spec 26/11, §3 «khối do model khai báo» and «quy tắc ghép chung»). Pure rules, decided from the data the server sent:
// a block is drawn only when its data is there; the model's own profile and comparison blocks step aside when the answer already has places or
// a markdown table says the same thing (web's rule); a gallery's layout follows how many of its pictures were found.

enum PresentationRules {

    /// The frame as it should be drawn beside this answer. Places already on the answer replace the model's profile cards and comparison table
    /// (one look, never two), and a comparison table written as markdown in the text replaces the declared comparison.
    static func framed(_ frame: PresentationFrame, hasPlaces: Bool, textHasTable: Bool) -> PresentationFrame {
        let blocks = frame.blocks.filter { block in
            switch block {
            case .profiles, .compare:
                if hasPlaces { return false }
                if textHasTable, case .compare = block { return false }
                return true
            default:
                return true
            }
        }
        return PresentationFrame(blocks: blocks, links: frame.links)
    }

    /// The reply's action buttons, minus the ones a place card already offers (the same address, ignoring its query and fragment): a card with its
    /// own «Bản đồ» or «Đặt» is enough (spec §5.1: no button repeated under the answer).
    static func ctaButtonsNotOnPlaces(_ buttons: [CTAButton], placeURLs: [String]) -> [CTAButton] {
        let onCards = Set(placeURLs.map(addressKey))
        return buttons.filter { !onCards.contains(addressKey($0.url)) }
    }

    /// An address without its query and fragment, lowercased; two addresses that name the same page compare equal.
    static func addressKey(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var parts = URLComponents(string: trimmed) else { return trimmed.lowercased() }
        parts.query = nil
        parts.fragment = nil
        return (parts.string ?? trimmed).lowercased()
    }

    /// Whether the answer's text already holds a markdown table (a header row, a separator row of dashes, then a row).
    static func textHasTable(_ markdown: String) -> Bool {
        MarkdownBlocks.parse(markdown).contains { if case .table = $0 { return true } else { return false } }
    }

    /// Web: three or more subjects, each with at most one point, read as a two-column table (subject | point), not as three cards.
    static func profilesAsTable(_ items: [PresentationBlock.ProfileItem]) -> Bool {
        items.count >= 3 && items.allSatisfy { $0.points.count <= 1 }
    }

    /// The gallery's layout by how many pictures were found: 1 = a wide picture, 2 = side by side, 3 = one large and two small.
    enum GalleryLayout: Equatable {
        case none, wide, pair, trio
    }

    static func galleryLayout(pictures: Int) -> GalleryLayout {
        switch pictures {
        case 1: return .wide
        case 2: return .pair
        case 3: return .trio
        default: return .none
        }
    }
}
