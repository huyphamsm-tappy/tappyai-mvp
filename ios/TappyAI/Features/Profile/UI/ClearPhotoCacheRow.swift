import SwiftUI

/// Settings → "Clear photo cache" (web `ClearCacheRow`, owner 21/11/2026): frees this phone's copy of the Messenger pictures. Nothing is lost:
/// the server keeps every picture and the conversation loads it again when it is opened. Only this phone's saved copies are touched
/// (`ChatPhotoFiles.clearAll` never throws).
struct ClearPhotoCacheRow: View {
    @State private var done = false

    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 12).fill(Color(hex: 0x6B7280, alpha: 0.16)).frame(width: 40, height: 40)
                .overlay(Image(systemName: "internaldrive.fill").font(.system(size: 17, weight: .semibold)).foregroundStyle(Color(hex: 0x6B7280)))
            VStack(alignment: .leading, spacing: 2) {
                Text("settings.clearCache").font(.system(size: 15, weight: .semibold)).foregroundStyle(HomeV3.onSurface)
                Text(LocalizedStringKey(done ? "settings.clearCache.done" : "settings.clearCache.desc"))
                    .font(.system(size: 12.5)).foregroundStyle(HomeV3.onSurfaceVariant)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                ChatPhotoFiles.clearAll(base: ChatPhotoFiles.defaultBase)
                done = true
            } label: {
                Text("settings.clearCache.button").font(.system(size: 13, weight: .semibold))
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("settings-clear-cache-button")
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("settings-clear-cache")
    }
}
