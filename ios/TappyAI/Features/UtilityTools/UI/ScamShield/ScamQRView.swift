import PhotosUI
import SwiftUI
import UIKit

/// «Quét mã QR» — camera or a picture from the library. The code is decoded ON THE PHONE; only a LINK found inside
/// it goes on to the link check, and then only its text (never the picture). Anything else is named and warned
/// about; the app never opens, pays, dials or joins anything because a code says so.
struct ScamQRView: View {
    @ObservedObject var vm: ScamShieldViewModel
    /// The scanned code held a link: show the link check (it has started).
    let onLinkScanned: () -> Void

    @State private var access = QRCameraAccess.current()
    @State private var showCamera = false
    @State private var pickedItem: PhotosPickerItem?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("scam.qr.intro").font(TappyFont.body).foregroundStyle(TappyColor.textSecondary)

            Button {
                Task { await openCamera() }
            } label: {
                Label { Text("scam.qr.camera") } icon: { Image(systemName: "camera.viewfinder") }
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.tappy(.primary))
            .disabled(busy || access == .unavailable)
            .accessibilityIdentifier("scam-qr-camera")

            PhotosPicker(selection: $pickedItem, matching: .images) {
                Label { Text("scam.qr.photo") } icon: { Image(systemName: "photo") }
                    .frame(maxWidth: .infinity)
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(TappyColor.primary)
                    .padding(.vertical, 14)
                    .background(TappyColor.primary.opacity(0.10))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            }
            .disabled(busy)
            .accessibilityIdentifier("scam-qr-photo")

            Text("scam.qr.privacy").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)

            if access == .denied { deniedCard }
            if access == .unavailable { infoCard("scam.qr.noCamera") }
            if busy { TappyLoadingIndicator() }
            if let message = vm.qrMessage {
                infoCardText(message).accessibilityIdentifier("scam-qr-none")
            }
            if let payload = vm.qrPayload { resultCard(payload) }
        }
        .fullScreenCover(isPresented: $showCamera) { cameraSheet }
        .onChange(of: pickedItem) { item in
            guard let item else { return }
            Task { await handlePicked(item) }
        }
        .task { await debugFixture() }
    }

    /// CI fixture only (DEBUG): a QR picture drawn on the phone, read back through the real decoder.
    @MainActor
    private func debugFixture() async {
        #if DEBUG
        if let payload = UITestLaunch.scamQR, vm.qrPayload == nil, let image = QRImageDecoder.makeImage(payload) {
            await handle(QRImageDecoder.decode(image))
        }
        #endif
    }

    // MARK: Camera

    private func openCamera() async {
        access = QRCameraAccess.current()
        if access == .undetermined { access = await QRCameraAccess.request() }
        if access == .allowed { showCamera = true }
    }

    private var cameraSheet: some View {
        ZStack(alignment: .top) {
            QRScannerView { code in
                showCamera = false
                Task { await handle([code]) }
            }
            .ignoresSafeArea()
            VStack(spacing: Spacing.sm) {
                HStack {
                    Spacer()
                    Button { showCamera = false } label: {
                        Image(systemName: "xmark").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                            .frame(width: 40, height: 40).background(.black.opacity(0.55)).clipShape(Circle())
                    }
                    .accessibilityLabel(Text("common.close"))
                    .accessibilityIdentifier("scam-qr-close")
                }
                Text("scam.qr.aim").font(TappyFont.callout).foregroundStyle(.white)
                    .padding(Spacing.sm).background(.black.opacity(0.55)).clipShape(RoundedRectangle(cornerRadius: Radius.md))
                Spacer()
            }
            .padding(Spacing.md)
        }
        .background(Color.black)
    }

    // MARK: Picture

    private func handlePicked(_ item: PhotosPickerItem) async {
        busy = true
        defer { busy = false; pickedItem = nil }
        guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
            await vm.handleQR(texts: [])
            return
        }
        // Decoded off the main thread; the picture is dropped as soon as this returns.
        let texts = await Task.detached(priority: .userInitiated) { QRImageDecoder.decode(image) }.value
        await handle(texts)
    }

    private func handle(_ texts: [String]) async {
        await vm.handleQR(texts: texts)
        if case .link? = vm.qrPayload { onLinkScanned() }
    }

    // MARK: Pieces

    private var deniedCard: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("scam.qr.denied").font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
            Button { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } } label: {
                Text("scam.qr.openSettings").font(TappyFont.callout.weight(.semibold))
            }
            .accessibilityIdentifier("scam-qr-settings")
        }
        .padding(Spacing.md).frame(maxWidth: .infinity, alignment: .leading)
        .background(TappyColor.secondary.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .accessibilityIdentifier("scam-qr-denied")
    }

    private func infoCard(_ key: LocalizedStringKey) -> some View {
        Text(key).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
            .padding(Spacing.md).frame(maxWidth: .infinity, alignment: .leading)
            .background(TappyColor.surface).clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }

    private func infoCardText(_ text: String) -> some View {
        Text(text).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
            .padding(Spacing.md).frame(maxWidth: .infinity, alignment: .leading)
            .background(TappyColor.surface).clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }

    @ViewBuilder
    private func resultCard(_ payload: QRPayload) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                Image(systemName: "qrcode").font(.title2).foregroundStyle(TappyColor.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text("scam.qr.found").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
                    Text(LocalizedStringKey(payload.kindKey)).font(TappyFont.headline).foregroundStyle(TappyColor.textPrimary)
                }
            }
            if !payload.preview.isEmpty {
                Text(payload.preview).font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary).lineLimit(3)
            }
            // 🚨 The warning is for EVERY kind, links included: a code is not a reason to open or pay anything.
            Text(LocalizedStringKey(payload.warningKey)).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
            if case .link = payload {
                Text("scam.qr.linkChecking").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
            }
            Button { vm.clearQR() } label: { Text("scam.qr.again").font(TappyFont.callout.weight(.semibold)) }
                .accessibilityIdentifier("scam-qr-again")
        }
        .padding(Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityIdentifier("scam-qr-result")
    }
}
