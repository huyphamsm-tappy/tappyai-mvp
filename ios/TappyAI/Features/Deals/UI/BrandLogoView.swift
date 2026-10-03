import SwiftUI

/// The official partner logo on its tile — the native renderer of `BrandRegistry` (Web `BrandLogo.tsx`; contract in
/// `BRAND_ASSETS.md` §6/§14): a fixed square tile (no layout shift), the logo in an inner box of 72% × `scale`
/// (clamped to 1.15), aspect-fit and centred, never stretched or cropped, accessibility label "<name> logo".
/// The tile is the only thing drawn behind the mark: the logo itself is never recoloured.
struct BrandLogoView: View {
    let brand: BrandDefinition
    var size: CGFloat = 48
    /// True when the partner's name is already printed beside the logo (hides it from VoiceOver).
    var decorative = false

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let inner = size * 0.72 * min(brand.scale, 1.15)
        Image(brand.assetName)
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(width: inner, height: inner)
            .frame(width: size, height: size)
            .background(tile)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.3, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: size * 0.3, style: .continuous).stroke(border, lineWidth: 1))
            .accessibilityHidden(decorative)
            .accessibilityLabel(Text(verbatim: "\(brand.displayName) logo"))
    }

    /// Web tile colours (`TILE_CLASSES`): light = gray-50→gray-100 (white→gray-200 in dark mode); dark = gray-900→black.
    private var tile: LinearGradient {
        switch brand.background {
        case .light:
            return scheme == .dark
                ? LinearGradient(colors: [Color(hex: 0xFFFFFF), Color(hex: 0xE5E7EB)], startPoint: .topLeading, endPoint: .bottomTrailing)
                : LinearGradient(colors: [Color(hex: 0xF9FAFB), Color(hex: 0xF3F4F6)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .dark:
            return LinearGradient(colors: [Color(hex: 0x111827), Color(hex: 0x000000)], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }

    private var border: Color {
        scheme == .dark ? Color.white.opacity(0.10) : Color(hex: 0xF3F4F6).opacity(0.8)
    }
}
