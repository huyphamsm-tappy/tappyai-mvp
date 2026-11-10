import SwiftUI

/// Colours of the overlay are `#rrggbb` only (the validator guarantees it); anything else falls back to white.
enum OverlayColor {
    static func color(hex: String, opacity: Double = 1) -> Color {
        let u = Array(hex.utf8)
        guard u.count == 7, u[0] == 0x23 else { return Color.white.opacity(opacity) }
        func nibble(_ b: UInt8) -> Double {
            switch b {
            case 0x30...0x39: return Double(b - 0x30)
            case 0x41...0x46: return Double(b - 0x41 + 10)
            case 0x61...0x66: return Double(b - 0x61 + 10)
            default: return 0
            }
        }
        let r = (nibble(u[1]) * 16 + nibble(u[2])) / 255
        let g = (nibble(u[3]) * 16 + nibble(u[4])) / 255
        let b = (nibble(u[5]) * 16 + nibble(u[6])) / 255
        return Color(red: r, green: g, blue: b).opacity(opacity)
    }
}

/// ONE text layer, drawn by the shared geometry rule (`OverlayGeometry`): font size = `size` x frame width, box width =
/// `width` x frame width, padding in em, rotation about the centre. The caller places its centre.
struct OverlayTextLayerView: View {
    let layer: OverlayLayer
    let frameWidth: CGFloat

    var body: some View {
        let font = CGFloat(OverlayGeometry.fontPx(size: layer.size, frameWidth: Double(frameWidth)))
        let boxWidth = CGFloat(OverlayGeometry.boxWidthPx(width: layer.width, frameWidth: Double(frameWidth)))
        let padX = (font * CGFloat(OverlayGeometry.paddingXEm)).rounded()
        let padY = (font * CGFloat(OverlayGeometry.paddingYEm)).rounded()
        let textWidth = max(1, boxWidth - 2 * padX)

        return styledText(font: font, textWidth: textWidth)
            .padding(.horizontal, padX)
            .padding(.vertical, padY)
            .background(backgroundColor)
            .rotationEffect(.degrees(layer.rotation))
            .allowsHitTesting(false)
    }

    private var backgroundColor: Color {
        if let bg = layer.background { return OverlayColor.color(hex: bg.color, opacity: bg.opacity) }
        return Color.clear
    }

    private var textAlignment: TextAlignment {
        switch layer.align {
        case "left": return .leading
        case "right": return .trailing
        default: return .center
        }
    }

    private var frameAlignment: Alignment {
        switch layer.align {
        case "left": return .leading
        case "right": return .trailing
        default: return .center
        }
    }

    private func plain(font: CGFloat, textWidth: CGFloat, hex: String) -> some View {
        Text(layer.text)
            .font(.system(size: font, weight: layer.weight == "bold" ? .bold : .regular))
            .foregroundColor(OverlayColor.color(hex: hex))
            .multilineTextAlignment(textAlignment)
            .fixedSize(horizontal: false, vertical: true)
            .frame(width: textWidth, alignment: frameAlignment)
    }

    @ViewBuilder
    private func styledText(font: CGFloat, textWidth: CGFloat) -> some View {
        if let outline = layer.outline, outline.width > 0 {
            // SwiftUI has no text stroke: the outline colour is drawn eight times around the text.
            let d = max(1, CGFloat(outline.width) * font)
            ZStack {
                ForEach(0..<8, id: \.self) { i in
                    plain(font: font, textWidth: textWidth, hex: outline.color)
                        .offset(x: d * Self.dx[i], y: d * Self.dy[i])
                }
                plain(font: font, textWidth: textWidth, hex: layer.color)
            }
            .shadow(color: shadowColor, radius: shadowRadius(font), x: shadowX(font), y: shadowY(font))
        } else {
            plain(font: font, textWidth: textWidth, hex: layer.color)
                .shadow(color: shadowColor, radius: shadowRadius(font), x: shadowX(font), y: shadowY(font))
        }
    }

    private static let dx: [CGFloat] = [1, -1, 0, 0, 0.7, -0.7, 0.7, -0.7]
    private static let dy: [CGFloat] = [0, 0, 1, -1, 0.7, 0.7, -0.7, -0.7]

    private var shadowColor: Color {
        layer.shadow ? Color.black.opacity(OverlayGeometry.shadowOpacity) : Color.clear
    }
    private func shadowRadius(_ font: CGFloat) -> CGFloat { layer.shadow ? font * CGFloat(OverlayGeometry.shadowBlur) * 2 : 0 }
    private func shadowX(_ font: CGFloat) -> CGFloat { layer.shadow ? font * CGFloat(OverlayGeometry.shadowDx) : 0 }
    private func shadowY(_ font: CGFloat) -> CGFloat { layer.shadow ? font * CGFloat(OverlayGeometry.shadowDy) : 0 }
}

/// The overlay over a playing clip. `fill` = the clip is aspect-FILLED in `container` (the feed), so the frame the layers are
/// measured against is the (cropped) video frame, not the screen.
struct OverlayLayersView: View {
    let doc: OverlayDocument
    let timeMs: Int
    let container: CGSize
    let videoSize: CGSize
    let fill: Bool

    var body: some View {
        let rect = OverlayGeometry.contentRect(container: container, video: videoSize, fill: fill)
        let visible = doc.layers.filter { OverlayGeometry.isVisible($0, timeMs: timeMs) }
        return ZStack(alignment: .topLeading) {
            ForEach(visible) { layer in
                OverlayTextLayerView(layer: layer, frameWidth: rect.width)
                    .position(OverlayGeometry.center(of: layer, in: rect))
            }
        }
        .frame(width: container.width, height: container.height, alignment: .topLeading)
        .clipped()
        .allowsHitTesting(false)
    }
}
