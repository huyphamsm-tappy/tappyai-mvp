import SwiftUI

/// Settings → Thông báo vi phạm. What was decided about the person's own content, and the one
/// appeal each decision gets (App Review 1.2: an appeal path inside the app). The web page of the
/// same name (`/profile/notices`) is the specification.
struct ModerationNoticesView: View {
    let deps: AppDependencies

    private enum Phase { case loading, ready, failed }

    @State private var phase: Phase = .loading
    @State private var notices: [ModerationNotice] = []
    @State private var appealing: String?
    @State private var text = ""
    @State private var sending = false
    @State private var banner: String?

    private var service: ProfileService { ProfileService(api: deps.api) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Text(String(format: NSLocalizedString("notices.intro", comment: ""), 30))
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
                if let banner {
                    Text(verbatim: banner)
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textPrimary)
                }
                switch phase {
                case .loading:
                    ProgressView().frame(maxWidth: .infinity).padding(.top, Spacing.lg)
                case .failed:
                    Text("notices.error")
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.danger)
                case .ready where notices.isEmpty:
                    Text("notices.empty")
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textSecondary)
                case .ready:
                    ForEach(notices) { notice in card(notice) }
                }
            }
            .padding(Spacing.md)
        }
        .background(TappyColor.background)
        .navigationTitle(Text("notices.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder
    private func card(_ n: ModerationNotice) -> some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(verbatim: dateText(n.createdAt))
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                Text(verbatim: NSLocalizedString("notices.rule", comment: "") + ": " + ruleName(n.ruleGroup))
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(TappyColor.textPrimary)
                Text(verbatim: outcomeText(n))
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textPrimary)
                if let until = n.strikeExpiresAt, !until.isEmpty {
                    Text(String(format: NSLocalizedString("notices.strikeUntil", comment: ""), dateText(until)))
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
                appealArea(n)
            }
        }
    }

    @ViewBuilder
    private func appealArea(_ n: ModerationNotice) -> some View {
        if let state = n.appeal {
            Text(verbatim: NSLocalizedString("notices.appeal.\(state.rawValue)", comment: ""))
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textPrimary)
        } else if !n.canAppeal {
            Text("notices.appeal.closed")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
        } else if appealing == n.id {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("notices.appeal.label")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                TextEditor(text: $text)
                    .frame(minHeight: 100)
                    .padding(Spacing.xxs)
                    .overlay(RoundedRectangle(cornerRadius: Radius.sm).stroke(TappyColor.separator, lineWidth: 1))
                Button("notices.appeal.send") { Task { await send(n) } }
                    .buttonStyle(.tappy(.primary))
                    .disabled(!ModerationNotice.isValidAppeal(text) || sending)
            }
        } else {
            Button("notices.appeal.cta") { appealing = n.id; text = "" }
                .buttonStyle(.tappy(.secondary))
        }
    }

    // MARK: - Words

    private func ruleName(_ group: String) -> String {
        let key = "notices.ruleGroup.\(group)"
        let name = NSLocalizedString(key, comment: "")
        return name == key ? group : name   // a rule group added later shows its own id, never a raw key
    }

    private func outcomeText(_ n: ModerationNotice) -> String {
        guard let outcome = n.outcome else { return NSLocalizedString("notices.outcome.other", comment: "") }
        switch outcome {
        case .warning: return NSLocalizedString("notices.outcome.warning", comment: "")
        case .contentRemoved: return NSLocalizedString("notices.outcome.content_removed", comment: "")
        case .restricted:
            return String(format: NSLocalizedString("notices.outcome.restricted", comment: ""), n.restrictDays ?? 0)
        case .banned: return NSLocalizedString("notices.outcome.banned", comment: "")
        }
    }

    private func dateText(_ iso: String) -> String {
        guard let date = ISO8601Timestamp.date(from: iso) else { return iso }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    // MARK: - Calls

    private func load() async {
        do {
            notices = try await service.fetchModerationNotices()
            phase = .ready
        } catch {
            // 404 = moderation is off on the server: nothing to show, not a failure.
            if case AppError.network(let status, _) = error, status == 404 { notices = []; phase = .ready }
            else { phase = .failed }
        }
    }

    private func send(_ n: ModerationNotice) async {
        sending = true
        defer { sending = false }
        do {
            try await service.appealModerationNotice(id: n.id, message: text)
            banner = NSLocalizedString("notices.appeal.sent", comment: "")
            appealing = nil
            text = ""
            await load()
        } catch {
            banner = NSLocalizedString("notices.appeal.failed", comment: "")
        }
    }
}
