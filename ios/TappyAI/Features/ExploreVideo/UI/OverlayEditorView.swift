import SwiftUI

/// Text overlay editor + preview. The canvas is the clip's cover drawn with the SAME geometry as playback
/// (`OverlayTextLayerView` + `OverlayGeometry`), so what is placed here is what viewers and the download show.
struct OverlayEditorView: View {
    @AppStateObject private var model: OverlayEditorViewModel
    @Environment(\.dismiss) private var dismiss

    init(model: OverlayEditorViewModel) {
        _model = AppStateObject(wrappedValue: model)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.md) {
                    canvas
                    if model.loading {
                        ProgressView()
                    } else {
                        layerChips
                        if let layer = model.selectedLayer {
                            controls(for: layer)
                        }
                    }
                    if let message = model.message {
                        Text(message)
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(Spacing.md)
            }
            .background(TappyColor.background.ignoresSafeArea())
            .navigationTitle(Text("video.overlay.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("video.overlay.close", comment: "")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(NSLocalizedString("video.overlay.save", comment: "")) { Task { await model.save() } }
                        .disabled(model.saving || model.loading)
                }
            }
            .task { await model.load() }
        }
    }

    // MARK: Canvas

    private var canvas: some View {
        let aspect = model.frameSize.width / model.frameSize.height
        return GeometryReader { geo in
            let rect = OverlayGeometry.contentRect(container: geo.size, video: model.frameSize, fill: false)
            ZStack(alignment: .topLeading) {
                Color.black
                if let thumb = model.thumbnail {
                    Image(uiImage: thumb)
                        .resizable()
                        .frame(width: rect.width, height: rect.height)
                        .position(x: rect.midX, y: rect.midY)
                }
                ForEach(model.doc.layers) { layer in
                    OverlayTextLayerView(layer: layer, frameWidth: rect.width)
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(Color.white.opacity(0.9), style: StrokeStyle(lineWidth: 1, dash: [4]))
                                .opacity(layer.id == model.selectedId ? 1 : 0)
                        )
                        .position(OverlayGeometry.center(of: layer, in: rect))
                        .gesture(
                            DragGesture(minimumDistance: 1, coordinateSpace: .named("overlayCanvas"))
                                .onChanged { value in
                                    model.selectedId = layer.id
                                    model.move(layer.id, to: value.location, in: rect)
                                }
                        )
                        .onTapGesture { model.selectedId = layer.id }
                }
            }
            .coordinateSpace(name: "overlayCanvas")
            .clipped()
        }
        .aspectRatio(aspect, contentMode: .fit)
        .frame(maxHeight: 420)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
    }

    // MARK: Layer list

    private var layerChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.xs) {
                ForEach(Array(model.doc.layers.enumerated()), id: \.element.id) { index, layer in
                    Button { model.selectedId = layer.id } label: {
                        Text("\(index + 1). \(String(layer.text.prefix(12)))")
                            .font(TappyFont.caption)
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, Spacing.xs)
                            .background(layer.id == model.selectedId ? TappyColor.primary : TappyColor.surface)
                            .foregroundStyle(layer.id == model.selectedId ? Color.white : TappyColor.textPrimary)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
                Button { model.addLayer() } label: {
                    Label(NSLocalizedString("video.overlay.add", comment: ""), systemImage: "plus")
                        .font(TappyFont.caption)
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, Spacing.xs)
                        .background(TappyColor.surface)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: Controls of the selected layer

    private func controls(for layer: OverlayLayer) -> some View {
        let id = layer.id
        let seconds = Double(model.durationMs) / 1000
        return VStack(alignment: .leading, spacing: Spacing.sm) {
            TextField(NSLocalizedString("video.overlay.textPlaceholder", comment: ""),
                      text: model.binding(id, \.text, fallback: ""), axis: .vertical)
                .lineLimit(1...6)
                .textFieldStyle(.roundedBorder)

            sliderRow("video.overlay.size", value: model.binding(id, \.size, fallback: 0.07), range: 0.02...0.2)
            sliderRow("video.overlay.width", value: model.binding(id, \.width, fallback: 0.8), range: 0.1...1)
            sliderRow("video.overlay.rotation", value: model.binding(id, \.rotation, fallback: 0), range: -180...180)

            HStack(spacing: Spacing.xs) {
                ForEach(OverlayEditing.palette, id: \.self) { hex in
                    Button { model.binding(id, \.color, fallback: "#ffffff").wrappedValue = hex } label: {
                        Circle()
                            .fill(OverlayColor.color(hex: hex))
                            .frame(width: 28, height: 28)
                            .overlay(Circle().stroke(layer.color == hex ? TappyColor.primary : TappyColor.border, lineWidth: layer.color == hex ? 3 : 1))
                    }
                    .buttonStyle(.plain)
                }
            }

            Toggle("video.overlay.bold", isOn: model.boldBinding(id))
            Toggle("video.overlay.background", isOn: model.backgroundBinding(id))
            Toggle("video.overlay.outline", isOn: model.outlineBinding(id))
            Toggle("video.overlay.shadow", isOn: model.binding(id, \.shadow, fallback: true))

            Picker("video.overlay.align", selection: model.binding(id, \.align, fallback: "center")) {
                Text("video.overlay.alignLeft").tag("left")
                Text("video.overlay.alignCenter").tag("center")
                Text("video.overlay.alignRight").tag("right")
            }
            .pickerStyle(.segmented)

            sliderRow("video.overlay.start", value: model.secondsBinding(id, isStart: true), range: 0...max(0.1, seconds))
            sliderRow("video.overlay.end", value: model.secondsBinding(id, isStart: false), range: 0...max(0.1, seconds))

            Button(role: .destructive) { model.deleteSelected() } label: {
                Label(NSLocalizedString("video.overlay.delete", comment: ""), systemImage: "trash")
            }
        }
    }

    private func sliderRow(_ key: LocalizedStringKey, value: Binding<Double>, range: ClosedRange<Double>) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(key).font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
            Slider(value: value, in: range)
        }
    }
}

/// The clip conditions (contract §6): what is sent to the AI provider, and that declining only means no clip posting.
struct VideoConsentSheet: View {
    let onAccept: () -> Void
    let onLater: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    Text("video.consent.body")
                        .font(.system(size: 14))
                        .foregroundStyle(TappyColor.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("video.consent.declineNote")
                        .font(.system(size: 13))
                        .foregroundStyle(TappyColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(action: onAccept) {
                        Text("video.consent.agree")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(maxWidth: .infinity, minHeight: 46)
                            .foregroundStyle(.white)
                            .background(TappyColor.primary)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                    }
                    .buttonStyle(.plain)
                    Button(action: onLater) {
                        Text("video.consent.later")
                            .font(.system(size: 15))
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(Spacing.lg)
            }
            .background(TappyColor.background)
            .navigationTitle(Text("video.consent.title"))
            .navigationBarTitleDisplayMode(.inline)
        }
        .interactiveDismissDisabled()
    }
}
