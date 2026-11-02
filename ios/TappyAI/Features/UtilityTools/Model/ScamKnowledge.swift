import Foundation

/// Scam Shield · the Ministry of Public Security's «25 kịch bản lừa đảo 2026» — the SAME dataset Android reads
/// (`assets/scam_knowledge/bocongan2026.json`, generated from the web module), bundled and read offline.
///
/// 🚨 A record has TWO halves that must never be confused:
///  - `official` — text from the official source as published. Never rewritten here.
///  - `guidance` — what TappyAI adds for the reader, always labelled as TappyAI's, never a quotation.
/// Nothing here calls a server, a model or a quota.
struct KnowledgeSource: Decodable, Equatable {
    var organization = ""
    var title = ""
    var url = ""
    var publishedAt: String?
    var verifiedAt = ""

    private enum CodingKeys: String, CodingKey { case organization, title, url, publishedAt, verifiedAt }
    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        organization = (try? c.decode(String.self, forKey: .organization)) ?? ""
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        url = (try? c.decode(String.self, forKey: .url)) ?? ""
        publishedAt = try? c.decodeIfPresent(String.self, forKey: .publishedAt)
        verifiedAt = (try? c.decode(String.self, forKey: .verifiedAt)) ?? ""
    }
}

struct KnowledgeGroup: Decodable, Identifiable, Equatable {
    var category = ""
    var officialNumber = 0
    var label = ""
    var description = ""
    var id: String { category }

    private enum CodingKeys: String, CodingKey { case category, officialNumber, label, description }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        category = (try? c.decode(String.self, forKey: .category)) ?? ""
        officialNumber = (try? c.decode(Int.self, forKey: .officialNumber)) ?? 0
        label = (try? c.decode(String.self, forKey: .label)) ?? ""
        description = (try? c.decode(String.self, forKey: .description)) ?? ""
    }
}

struct ScamScenario: Decodable, Identifiable, Equatable {
    struct Official: Decodable, Equatable {
        var title = ""
        var summary = ""
        private enum CodingKeys: String, CodingKey { case title, summary }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            title = (try? c.decode(String.self, forKey: .title)) ?? ""
            summary = (try? c.decode(String.self, forKey: .summary)) ?? ""
        }
        init() {}
    }
    struct Guidance: Decodable, Equatable {
        var warningSigns: [String] = []
        var commonRequests: [String] = []
        var whatToDo: [String] = []
        var whatNotToDo: [String] = []
        private enum CodingKeys: String, CodingKey { case warningSigns, commonRequests, whatToDo, whatNotToDo }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            warningSigns = (try? c.decode([String].self, forKey: .warningSigns)) ?? []
            commonRequests = (try? c.decode([String].self, forKey: .commonRequests)) ?? []
            whatToDo = (try? c.decode([String].self, forKey: .whatToDo)) ?? []
            whatNotToDo = (try? c.decode([String].self, forKey: .whatNotToDo)) ?? []
        }
        init() {}
    }

    var id = ""
    var officialNumber = 0
    var category = ""
    var official = Official()
    var guidance = Guidance()
    var source = KnowledgeSource()

    private enum CodingKeys: String, CodingKey { case id, officialNumber, category, official, guidance, source }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? ""
        officialNumber = (try? c.decode(Int.self, forKey: .officialNumber)) ?? 0
        category = (try? c.decode(String.self, forKey: .category)) ?? ""
        official = (try? c.decode(Official.self, forKey: .official)) ?? Official()
        guidance = (try? c.decode(Guidance.self, forKey: .guidance)) ?? Guidance()
        source = (try? c.decode(KnowledgeSource.self, forKey: .source)) ?? KnowledgeSource()
    }
}

struct KnowledgeAdvice: Decodable, Equatable {
    var preventionMeasures: [String] = []
    var reportAdvice = ""
    var hotline = ""
    private enum CodingKeys: String, CodingKey { case preventionMeasures, reportAdvice, hotline }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        preventionMeasures = (try? c.decode([String].self, forKey: .preventionMeasures)) ?? []
        reportAdvice = (try? c.decode(String.self, forKey: .reportAdvice)) ?? ""
        hotline = (try? c.decode(String.self, forKey: .hotline)) ?? ""
    }
    init() {}
}

struct ScamKnowledge: Decodable, Equatable {
    var source = KnowledgeSource()
    var groups: [KnowledgeGroup] = []
    var scenarios: [ScamScenario] = []
    var official = KnowledgeAdvice()

    private enum RootKeys: String, CodingKey { case dataset }
    private enum CodingKeys: String, CodingKey { case source, groups, scenarios, official }

    init() {}
    init(from decoder: Decoder) throws {
        let root = try decoder.container(keyedBy: RootKeys.self)
        let c = try root.nestedContainer(keyedBy: CodingKeys.self, forKey: .dataset)
        source = (try? c.decode(KnowledgeSource.self, forKey: .source)) ?? KnowledgeSource()
        groups = (try? c.decode([KnowledgeGroup].self, forKey: .groups)) ?? []
        scenarios = ((try? c.decode([ScamScenario].self, forKey: .scenarios)) ?? []).sorted { $0.officialNumber < $1.officialNumber }
        official = (try? c.decode(KnowledgeAdvice.self, forKey: .official)) ?? KnowledgeAdvice()
    }

    /// Bundled, read once. An unreadable file is an EMPTY library (the screen then hides the tab), never a crash.
    static func load(bundle: Bundle = .main) -> ScamKnowledge {
        guard let url = bundle.url(forResource: "bocongan2026", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let parsed = try? JSONDecoder().decode(ScamKnowledge.self, from: data) else { return ScamKnowledge() }
        return parsed
    }

    func scenarios(in category: String) -> [ScamScenario] { scenarios.filter { $0.category == category } }

    /// The authority's own HTTPS pages only: a «read the original» link to anywhere else is never shown.
    static let officialHosts = ["bocongan.gov.vn", "mps.gov.vn", "ncsc.gov.vn", "khonggianmang.vn", "tinnhiemmang.vn", "chinhphu.vn"]

    static func officialURL(_ raw: String) -> URL? {
        guard let url = URL(string: raw), url.scheme == "https", let host = url.host else { return nil }
        return officialHosts.contains(where: { host == $0 || host.hasSuffix("." + $0) }) ? url : nil
    }

    /// «2026-09-08» → «08/09/2026»; anything else is returned untouched.
    static func displayDate(_ iso: String?) -> String? {
        guard let iso, !iso.isEmpty else { return nil }
        let p = iso.prefix(10).split(separator: "-")
        guard p.count == 3, p[0].count == 4 else { return iso }
        return "\(p[2])/\(p[1])/\(p[0])"
    }
}
