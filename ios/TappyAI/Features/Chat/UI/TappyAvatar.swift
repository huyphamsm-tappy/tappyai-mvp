import SwiftUI

/// Tappy's face in chat: the mascot in a round light-blue badge (web and Android), never an emoji.
struct TappyAvatar: View {
    var size: CGFloat = 32

    var body: some View {
        Image("TappyWave")
            .resizable()
            .scaledToFill()
            .frame(width: size, height: size, alignment: .top)
            .background(TappyColor.primary.opacity(0.12))
            .clipShape(Circle())
            .accessibilityHidden(true)
    }
}
