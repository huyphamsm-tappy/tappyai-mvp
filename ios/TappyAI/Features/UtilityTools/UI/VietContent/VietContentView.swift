import SwiftUI

struct VietContentView: View {
    @AppStateObject private var vm: VietContentViewModel

    init(deps: AppDependencies) {
        let service = UtilityToolsService(api: deps.api)
        _vm = AppStateObject(wrappedValue: VietContentViewModel(service: service))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                topicInput
                optionsSection
                generateButton
                if !vm.caption.isEmpty {
                    resultSection
                }
                if let error = vm.error {
                    errorBanner(error)
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("✍️ Viết nội dung")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Topic input

    private var topicInput: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Chủ đề / ý tưởng")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)

            ZStack(alignment: .topLeading) {
                if vm.topic.isEmpty {
                    Text("VD: Review quán cà phê mới mở ở Quận 1...")
                        .font(TappyFont.body)
                        .foregroundStyle(TappyColor.textSecondary.opacity(0.5))
                        .padding(.horizontal, Spacing.md)
                        .padding(.vertical, 12)
                }
                TextEditor(text: $vm.topic)
                    .font(TappyFont.body)
                    .foregroundStyle(TappyColor.textPrimary)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 80)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.xs)
            }
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg)
                    .stroke(vm.isOverLimit ? Color.red : TappyColor.border, lineWidth: 1)
            )

            HStack {
                Text("\(vm.charCount)/500")
                    .font(TappyFont.caption)
                    .foregroundStyle(vm.isOverLimit ? .red : TappyColor.textSecondary)
                Spacer()
                if !vm.topic.isEmpty {
                    Button("Xoá") { vm.clear() }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Options

    private var optionsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            optionRow("Nền tảng", options: VietContentViewModel.platforms, selection: $vm.platform)
            optionRow("Giọng văn", options: VietContentViewModel.tones, selection: $vm.tone)
            optionRow("Độ dài", options: VietContentViewModel.lengths, selection: $vm.length)
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    private func optionRow(_ label: String, options: [(id: String, label: String)], selection: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(label)
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.xs) {
                    ForEach(options, id: \.id) { opt in
                        Button {
                            selection.wrappedValue = opt.id
                        } label: {
                            Text(opt.label)
                                .font(.system(size: 12, weight: .medium))
                                .padding(.horizontal, Spacing.sm)
                                .padding(.vertical, Spacing.xs)
                                .background(selection.wrappedValue == opt.id ? TappyColor.primary : TappyColor.surface)
                                .foregroundStyle(selection.wrappedValue == opt.id ? .white : TappyColor.textSecondary)
                                .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Generate button

    private var generateButton: some View {
        Button {
            Task { await vm.generate() }
        } label: {
            HStack(spacing: Spacing.sm) {
                if vm.loading {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.8)
                    Text("Đang tạo...")
                } else {
                    Image(systemName: "sparkles")
                    Text("Tạo nội dung")
                }
            }
            .font(.system(size: 15, weight: .semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(vm.canGenerate ? TappyColor.primary : TappyColor.primary.opacity(0.4))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        }
        .buttonStyle(.plain)
        .disabled(!vm.canGenerate)
    }

    // MARK: - Result

    private var resultSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack {
                Text("Nội dung tạo")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
                Spacer()
                Button {
                    let full = vm.caption + "\n\n" + vm.hashtags
                    UIPasteboard.general.string = full
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 11))
                        Text("Sao chép")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(TappyColor.primary)
                }
                .buttonStyle(.plain)
            }

            Text(vm.caption)
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textPrimary)
                .textSelection(.enabled)

            if !vm.hashtags.isEmpty {
                let tags = vm.hashtags.split(separator: " ").map(String.init)
                FlowLayout(spacing: Spacing.xs) {
                    ForEach(tags, id: \.self) { tag in
                        Text(tag)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(TappyColor.primary)
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, Spacing.xxs)
                            .background(TappyColor.primary.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
                    }
                }
            }
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Error

    private func errorBanner(_ message: String) -> some View {
        Text(message)
            .font(TappyFont.callout)
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.md)
            .background(Color.red.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
    }
}

// MARK: - Flow Layout for hashtags

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > maxWidth && currentX > 0 {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }

        return CGSize(width: maxWidth, height: currentY + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX: CGFloat = bounds.minX
        var currentY: CGFloat = bounds.minY
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX && currentX > bounds.minX {
                currentX = bounds.minX
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            subview.place(at: CGPoint(x: currentX, y: currentY), proposal: .unspecified)
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
