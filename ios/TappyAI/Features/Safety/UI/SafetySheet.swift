import SwiftUI

/// The one place someone else's content or profile can be reported and its author blocked — reached
/// from the ⋯ on a post, a comment or a profile in ≤ 2 taps (App Store 1.2).
///
///   header (what is being reported)
///   ── Báo cáo ── pick a reason (radio) · optional details (≤ 1000) · «Gửi báo cáo»
///   ── Chặn ── «Chặn {tên}» with what it does · confirm · done (or «Bỏ chặn»)
///
/// Each half shows only when its server flag (`SafetyStore.flags`) is on, so with both off the sheet is
/// never presented. After a report the sheet says thanks and keeps the block option one tap away.
struct SafetySheet: View {
    let target: SafetyTarget
    let onClose: () -> Void

    @ObservedObject private var safety: SafetyStore
    @State private var reason: SafetyReportReason?
    @State private var details = ""
    @State private var sending = false
    @State private var outcome: ReportOutcome?
    @State private var confirmBlock = false
    @State private var blocking = false
    @State private var blockFailed = false

    init(target: SafetyTarget, safety: SafetyStore, onClose: @escaping () -> Void) {
        self.target = target
        self.onClose = onClose
        _safety = ObservedObject(wrappedValue: safety)
    }

    private var alreadyBlocked: Bool { safety.isBlocked(target.authorId) }
    private var canBlock: Bool { safety.flags.userBlocks && target.authorId != nil }
    private var author: String {
        let n = (target.authorName ?? "").trimmingCharacters(in: .whitespaces)
        return n.isEmpty ? NSLocalizedString("safety.block.thisPerson", comment: "") : n
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    if safety.flags.reports { reportSection }
                    if canBlock { blockSection }
                }
                .padding(16)
            }
            .background(TappyColor.background)
            .navigationTitle(Text(LocalizedStringKey(target.kind.titleKey)))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(NSLocalizedString("common.close", comment: ""), action: onClose)
                        .accessibilityIdentifier("safety-close")
                }
            }
            .alert(Text(String(format: NSLocalizedString("safety.block.confirmTitle", comment: ""), author)),
                   isPresented: $confirmBlock) {
                Button(role: .destructive) { Task { await block() } } label: { Text("safety.block.confirm") }
                Button(role: .cancel) {} label: { Text("common.cancel") }
            } message: {
                Text("safety.block.confirmBody")
            }
            .alert(Text("safety.error.failed"), isPresented: $blockFailed) {
                Button { blockFailed = false } label: { Text("common.ok") }
            }
        }
        .task { await safety.refresh() }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let summary = target.summary, !summary.isEmpty {
                Text(summary).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary).lineLimit(3)
            }
            Text("safety.intro").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: Report

    @ViewBuilder
    private var reportSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("safety.report.heading")
            if outcome == .sent {
                sentCard
            } else {
                VStack(spacing: 0) {
                    ForEach(SafetyReportReason.allCases) { r in
                        Button { reason = r } label: {
                            HStack(spacing: 12) {
                                Image(systemName: reason == r ? "largecircle.fill.circle" : "circle")
                                    .foregroundStyle(reason == r ? TappyColor.primary : TappyColor.textSecondary)
                                Text(LocalizedStringKey(r.labelKey)).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
                                Spacer()
                            }
                            .padding(.horizontal, 12).padding(.vertical, 11)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(reason == r ? .isSelected : [])
                        .accessibilityIdentifier("safety-reason-" + r.rawValue)
                        if r != SafetyReportReason.allCases.last { Divider().padding(.leading, 44) }
                    }
                }
                .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 12))

                TextField(NSLocalizedString("safety.details.placeholder", comment: ""), text: $details, axis: .vertical)
                    .lineLimit(2...4)
                    .font(TappyFont.callout)
                    .padding(12)
                    .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 12))
                    .onChange(of: details) { text in
                        if text.count > ReportRequest.maxDetails { details = String(text.prefix(ReportRequest.maxDetails)) }
                    }
                    .accessibilityIdentifier("safety-details")

                if let outcome, outcome != .sent {
                    Text(LocalizedStringKey(outcome.messageKey)).font(TappyFont.caption).foregroundStyle(TappyColor.danger)
                        .accessibilityIdentifier("safety-error")
                }

                Button { Task { await send() } } label: {
                    Text(sending ? "safety.report.sending" : "safety.report.submit")
                        .font(TappyFont.callout.weight(.semibold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(TappyColor.danger, in: RoundedRectangle(cornerRadius: 12))
                        .opacity(reason == nil || sending ? 0.5 : 1)
                }
                .buttonStyle(.plain)
                .disabled(reason == nil || sending)
                .accessibilityIdentifier("safety-submit")
            }
        }
    }

    private var sentCard: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.seal.fill").font(.system(size: 22)).foregroundStyle(Color(hex: 0x34D399))
            VStack(alignment: .leading, spacing: 3) {
                Text("safety.report.sent").font(TappyFont.callout.weight(.semibold)).foregroundStyle(TappyColor.textPrimary)
                Text("safety.report.sentBody").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityIdentifier("safety-sent")
    }

    private func send() async {
        guard let reason, !sending else { return }
        sending = true
        outcome = await safety.report(ReportRequest(kind: target.kind, targetId: target.targetId, reason: reason, details: details))
        sending = false
    }

    // MARK: Block

    private var blockSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("safety.block.heading")
            VStack(alignment: .leading, spacing: 10) {
                Text(alreadyBlocked ? "safety.block.doneBody" : "safety.block.explain")
                    .font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
                Button {
                    if alreadyBlocked { Task { await unblock() } } else { confirmBlock = true }
                } label: {
                    Text(alreadyBlocked
                         ? String(format: NSLocalizedString("safety.block.undo", comment: ""), author)
                         : String(format: NSLocalizedString("safety.block.action", comment: ""), author))
                        .font(TappyFont.callout.weight(.semibold))
                        .foregroundStyle(alreadyBlocked ? TappyColor.primary : TappyColor.danger)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .overlay(RoundedRectangle(cornerRadius: 12)
                            .stroke(alreadyBlocked ? TappyColor.primary : TappyColor.danger, lineWidth: 1))
                        .opacity(blocking ? 0.5 : 1)
                }
                .buttonStyle(.plain)
                .disabled(blocking)
                .accessibilityIdentifier("safety-block")
            }
            .padding(12)
            .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private func block() async {
        guard let id = target.authorId else { return }
        blocking = true
        let ok = await safety.block(id)
        blocking = false
        if ok { onClose() } else { blockFailed = true }
    }

    private func unblock() async {
        guard let id = target.authorId else { return }
        blocking = true
        let ok = await safety.unblock(id)
        blocking = false
        if !ok { blockFailed = true }
    }

    private func sectionTitle(_ key: String) -> some View {
        Text(LocalizedStringKey(key)).font(.system(size: 12, weight: .semibold)).foregroundStyle(TappyColor.textSecondary)
    }
}
