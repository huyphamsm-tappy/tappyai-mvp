import SwiftUI
import UIKit

/// A photo the person attached, drawn from its bytes. `fill` crops it square (the composer's thumbnail); otherwise it keeps its shape up to
/// `maxSide` (the question's bubble, as the web's 240 x 280 box).
struct AttachmentPhotoView: View {
    let attachment: ChatAttachment
    var side: CGFloat? = nil
    var maxWidth: CGFloat = 240
    var maxHeight: CGFloat = 280
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                if let side {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: side, height: side)
                        .clipped()
                } else {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: maxWidth, maxHeight: maxHeight)
                }
            } else {
                Rectangle()
                    .fill(TappyColor.surface)
                    .frame(width: side ?? 120, height: side ?? 120)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        // Decoded once per attachment, not on every redraw of the list.
        .task(id: attachment.id) { image = UIImage(data: attachment.data) }
        .accessibilityLabel(Text("chat.attach.imageA11y"))
        .accessibilityAddTraits(.isImage)
    }
}

/// A PDF the person attached: its icon and name (no preview of a document's pages), as the web shows it.
struct AttachmentPdfChip: View {
    let name: String
    var onRemove: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: Spacing.xs) {
            Image(systemName: "doc.fill")
                .font(.system(size: 14))
                .foregroundStyle(TappyColor.secondary)
                .accessibilityHidden(true)
            Text(name)
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textPrimary)
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: 220, alignment: .leading)
            if let onRemove {
                Button(action: onRemove) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(TappyColor.textSecondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("chat.attach.remove"))
                .minimumTapTarget()
            }
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.xs)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .accessibilityElement(children: onRemove == nil ? .ignore : .contain)
        .accessibilityLabel(Text(String(format: NSLocalizedString("chat.attach.pdfA11y", comment: ""), name)))
    }
}

/// The chosen file above the box: a small photo or the PDF's name, with a button to take it off again.
struct StagedAttachmentCard: View {
    let attachment: ChatAttachment
    let onRemove: () -> Void

    var body: some View {
        switch attachment.kind {
        case .image:
            // The button sits beside the thumbnail, not over it: a 44 pt target would cover most of a 64 pt picture.
            HStack(alignment: .top, spacing: 0) {
                AttachmentPhotoView(attachment: attachment, side: 64)
                Button(action: onRemove) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(TappyColor.textSecondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("chat.attach.remove"))
                .minimumTapTarget()
            }
        case .pdf:
            AttachmentPdfChip(name: attachment.name, onRemove: onRemove)
        }
    }
}
