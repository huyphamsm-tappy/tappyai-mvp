import Foundation

// The pure rules of the Messenger, kept out of the views so they are tested without a screen. Each one mirrors the web's
// (`src/lib/messaging/*`) so the clients read alike.

// MARK: - Bubbles: which ones carry a name and a time

/// Which bubbles of a conversation carry a sender name and a time — the web's `bubbleMetas` (`bubbles.ts`).
///
/// A "run" is consecutive messages of ONE sender with less than `runGap` between neighbours. A run shows the sender's name ONCE at its
/// start (group threads, other people's messages only — a direct thread has one other person, and your own side needs no name) and the
/// time ONCE at its end, so a burst of five messages is one time, not five.
enum ChatBubbles {
    static let runGap: TimeInterval = 5 * 60

    struct Meta: Equatable {
        var showName: Bool
        var showTime: Bool
        /// The sender's name (fallback applied), or nil for my own messages.
        var name: String?
        /// "14:50" today, "03/11 14:50" on another day (Vietnam time, like the Inbox and the web). Empty if the stamp is unreadable.
        var time: String
    }

    private static var vietnam: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh") ?? TimeZone(secondsFromGMT: 7 * 3600) ?? .current
        return cal
    }

    /// "HH:mm" for today (in Vietnam), "dd/MM HH:mm" for any other day. Built by hand (not from a locale pattern) so it is identical on every device.
    static func timeLabel(_ iso: String, now: Date) -> String {
        guard let date = ISO8601Timestamp.date(from: iso) else { return "" }
        let cal = vietnam
        let a = cal.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let b = cal.dateComponents([.year, .month, .day], from: now)
        let clock = String(format: "%02d:%02d", a.hour ?? 0, a.minute ?? 0)
        if a.year == b.year && a.month == b.month && a.day == b.day { return clock }
        return String(format: "%02d/%02d %@", a.day ?? 0, a.month ?? 0, clock)
    }

    static func metas(for messages: [PeerMessage], meId: String?, group: Bool,
                      nameOf: (String?) -> String, now: Date = Date()) -> [Meta] {
        func sameRun(_ a: PeerMessage?, _ b: PeerMessage?) -> Bool {
            guard let a, let b, a.senderId == b.senderId,
                  let x = ISO8601Timestamp.date(from: a.createdAt), let y = ISO8601Timestamp.date(from: b.createdAt) else { return false }
            return abs(y.timeIntervalSince(x)) < runGap
        }
        return messages.indices.map { i -> Meta in
            let m = messages[i]
            let mine = meId != nil && m.senderId == meId
            let previous: PeerMessage? = i > 0 ? messages[i - 1] : nil
            let next: PeerMessage? = i + 1 < messages.count ? messages[i + 1] : nil
            return Meta(showName: group && !mine && !sameRun(previous, m),
                        showTime: !sameRun(m, next),
                        name: mine ? nil : nameOf(m.senderId),
                        time: timeLabel(m.createdAt, now: now))
        }
    }
}

// MARK: - Refusals: what a failed send or upload says

/// What a refused SEND or UPLOAD says. The server answers "not a participant" and "blocked" with the SAME 404 (no oracle for who
/// blocked whom), so a 404 only locks the writing area and says one neutral sentence — nothing here ever says "blocked".
enum ChatFailure: Equatable, Sendable {
    case load
    case send
    /// 404: the conversation cannot be written to (a participant no more, or a block — the server never says which).
    case locked
    /// 429.
    case tooFast
    /// The file is not a picture the server accepts.
    case photoType
    case photoTooLarge
    /// 422: the picture is not allowed.
    case photoBlocked
    /// 503: the safety scan is unavailable right now.
    case photoScanUnavailable
    /// 403 `ai_consent_required`: the account has not agreed to share data with the AI provider (the picture goes through its safety scan).
    case photoConsent
    case photoUpload

    var messageKey: String {
        switch self {
        case .load: return "msg.error.load"
        case .send: return "msg.error.send"
        case .locked: return "msg.error.cannotSend"
        case .tooFast: return "msg.error.tooFast"
        case .photoType: return "msg.error.imageType"
        case .photoTooLarge: return "msg.error.imageTooLarge"
        case .photoBlocked: return "msg.error.imageBlocked"
        case .photoScanUnavailable: return "msg.error.scanUnavailable"
        case .photoConsent, .photoUpload: return "msg.error.upload"
        }
    }

    /// Whether this refusal locks the writing area.
    var locksComposer: Bool { self == .locked }

    static func forSend(_ error: Error) -> ChatFailure {
        switch error as? AppError {
        case .network(404, _)?: return .locked
        case .network(429, _)?: return .tooFast
        default: return .send
        }
    }

    static func forUpload(_ error: Error) -> ChatFailure {
        switch error as? AppError {
        case .network(404, _)?: return .locked
        case .network(429, _)?: return .tooFast
        case .network(422, _)?: return .photoBlocked
        case .network(503, _)?: return .photoScanUnavailable
        case .network(413, _)?: return .photoTooLarge
        case .validation?: return .photoType
        case .authentication(.aiConsentRequired)?: return .photoConsent
        default: return .photoUpload
        }
    }
}

// MARK: - Wire bodies

enum ChatWire {
    /// `{ body, clientId, media?: { path, width, height } }` — the sender is the bearer, never a field.
    static func sendBody(body: String, clientId: String?, media: UploadedPhoto?) throws -> Data {
        var json: [String: Any] = ["body": String(body.trimmingCharacters(in: .whitespacesAndNewlines).prefix(ChatLimits.maxBody))]
        if let clientId { json["clientId"] = clientId }
        if let media {
            var m: [String: Any] = ["path": media.path]
            if let w = media.width { m["width"] = w }
            if let h = media.height { m["height"] = h }
            json["media"] = m
        }
        return try JSONSerialization.data(withJSONObject: json)
    }

    /// `{ kind: 'direct', userId }` or `{ kind: 'group', userIds, title? }`.
    static func startBody(userIds: [String], title: String?) throws -> Data {
        if userIds.count == 1, let only = userIds.first {
            return try JSONSerialization.data(withJSONObject: ["kind": "direct", "userId": only])
        }
        var json: [String: Any] = ["kind": "group", "userIds": userIds]
        let t = (title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { json["title"] = String(t.prefix(120)) }
        return try JSONSerialization.data(withJSONObject: json)
    }

    /// A multipart/form-data body with ONE part, `file`.
    static func multipartBody(file: Data, mimeType: String, boundary: String) -> Data {
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\n".utf8))
        body.append(Data("Content-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(file)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return body
    }
}

// MARK: - A message notification's link

/// A message notification's `entity_url` is the web link to its conversation: `/profile/notifications?tab=messages&thread=<id>`
/// (optionally with the origin in front). Returns the thread id, or nil when the link is not a conversation link or the id is not a plain
/// id (a notification is data the app did not write).
enum ChatLinks {
    static func threadId(fromPathOrURL link: String) -> String? {
        let trimmed = link.trimmingCharacters(in: .whitespacesAndNewlines)
        var rest = trimmed
        if let range = rest.range(of: "://") {
            let afterScheme = rest[range.upperBound...]
            guard let slash = afterScheme.firstIndex(of: "/") else { return nil }
            rest = String(afterScheme[slash...])
        }
        let parts = rest.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        var path = String(parts.first ?? "")
        while path.count > 1 && path.hasSuffix("/") { path.removeLast() }
        guard path == "/profile/notifications", parts.count == 2 else { return nil }
        for pair in parts[1].split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            if kv.count == 2, kv[0] == "thread" {
                let id = String(kv[1])
                return DeepLinkHandler.isSafeId(id) ? id : nil
            }
        }
        return nil
    }
}
