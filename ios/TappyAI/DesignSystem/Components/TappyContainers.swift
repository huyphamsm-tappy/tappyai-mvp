import SwiftUI

/// A surface card container.
struct TappyCard<Content: View>: View {
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }

    var body: some View {
        content
            .padding(Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(TappyColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .tappyShadow(Elevation.low)
    }
}

extension View {
    /// Native bottom sheet (HIG) via `presentationDetents` + a drag indicator.
    func tappyBottomSheet<SheetContent: View>(
        isPresented: Binding<Bool>,
        detents: Set<PresentationDetent> = [.medium, .large],
        @ViewBuilder content: @escaping () -> SheetContent
    ) -> some View {
        sheet(isPresented: isPresented) {
            content()
                .presentationDetents(detents)
                .presentationDragIndicator(.visible)
        }
    }

    /// Native destructive confirmation (HIG `confirmationDialog`).
    func tappyConfirm(
        _ title: LocalizedStringKey,
        isPresented: Binding<Bool>,
        confirmTitle: LocalizedStringKey,
        role: ButtonRole = .destructive,
        onConfirm: @escaping () -> Void
    ) -> some View {
        confirmationDialog(title, isPresented: isPresented, titleVisibility: .visible) {
            Button(confirmTitle, role: role, action: onConfirm)
            Button("Cancel", role: .cancel) {}
        }
    }
}
