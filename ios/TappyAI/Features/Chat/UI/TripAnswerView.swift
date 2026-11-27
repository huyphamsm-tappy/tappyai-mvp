import SwiftUI
import UniformTypeIdentifiers

/// The trip answer (step 1 of the layout rework, owner mockups 26/11): the overview card, the stays carousel, the «Lịch trình chi tiết» row,
/// and the closed accordions «Chỗ ở gợi ý», «Món nên thử» and «Mẹo địa phương». It draws a `[TAPPY_PLAN]` and the turn's `tappy.places.v1`; both are
/// the server's data and a field that is missing is simply not drawn. Sharing and copying stay on the message's action bar; the only action
/// here is the one the bar does not have, the PDF.
struct TripAnswerView: View {
    let plan: TappyPlan
    /// Pictures the server found for stops that had no photo, by `SubjectImages.key(stop name)` (`tappy.subject_images.v1`, `stops`).
    var stopImages: [String: URL] = [:]
    var places: [PlaceCardView] = []
    /// The places section's title, e.g. «Gợi ý chỗ ở»; nil draws the carousel with no header.
    var placesTitle: String? = nil
    var placesSymbol = "bed.double.fill"
    var mapsSearchURL: String? = nil
    var placesShown: Int? = nil

    @State private var showOverview = false
    @State private var showItinerary = false
    // «Tải PDF»: built on the phone and handed to the system's save dialog (nothing is uploaded).
    @State private var pdfDocument = ReportFileDocument()
    @State private var pdfExporting = false
    @State private var pdfPreparing = false
    @State private var pdfNotice: ReportSaveNotice? = nil

    private var card: PlanCardModel { PlanCardModel.of(plan) }
    private var overview: TripOverviewModel.Overview { TripOverviewModel.of(plan, card: card) }

    var body: some View {
        let model = card
        VStack(alignment: .leading, spacing: Spacing.md) {
            overviewCard(model)
            if !places.isEmpty {
                PlaceCardsView(places: places, mapsSearchURL: mapsSearchURL, shown: placesShown, title: placesTitle, symbol: placesSymbol)
            }
            if !model.days.isEmpty { itineraryRow(model) }
            staysAccordion
            dishesAccordion
            tipsAccordion
            pdfButton
        }
        .sheet(isPresented: $showOverview) { TripOverviewSheet(card: model, overview: overview) }
        .sheet(isPresented: $showItinerary) { TripItinerarySheet(card: model, stopImages: stopImages) }
        .fileExporter(isPresented: $pdfExporting, document: pdfDocument, contentType: .pdf, defaultFilename: PlanPdf.fileName(for: plan)) { result in
            pdfNotice = ResearchReportFile.notice(for: result)
        }
        .task(id: pdfNotice) {
            guard pdfNotice != nil else { return }
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if !Task.isCancelled { pdfNotice = nil }
        }
    }

    // MARK: Overview

    private func overviewCard(_ model: PlanCardModel) -> some View {
        let o = overview
        return Button { showOverview = true } label: {
            AnswerCard(title: NSLocalizedString("chat.planV2.overviewTrip", comment: ""), symbol: "safari",
                       subtitle: model.title.isEmpty ? nil : model.title, trailing: nil,
                       media: { EmptyView() },
                       content: {
                           VStack(alignment: .leading, spacing: Spacing.xs) {
                               if !o.chips.isEmpty {
                                   ScrollView(.horizontal, showsIndicators: false) {
                                       HStack(spacing: Spacing.xs) { ForEach(o.chips) { chip in overviewChip(chip) } }
                                   }
                               }
                               // The server's own sentence about the budget (or the tagline when there is no budget sentence), in full width,
                               // three lines; «Xem thêm» opens the whole overview.
                               if let paragraph = o.paragraph ?? model.tagline {
                                   Text(paragraph).font(.subheadline).foregroundStyle(AnswerStyle.text).lineLimit(3)
                                       .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                                   Text("trip.seeMore").font(.subheadline.weight(.medium)).foregroundStyle(AnswerStyle.accent)
                               }
                           }
                       },
                       chips: { EmptyView() }, footer: { EmptyView() })
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("trip-overview")
    }

    private func overviewChip(_ chip: TripOverviewModel.Chip) -> some View {
        let symbol: String
        let labelKey: String
        switch chip.kind {
        case .budget: symbol = "banknote"; labelKey = "chat.planV2.budget"
        case .duration: symbol = "calendar"; labelKey = "chat.planV2.duration"
        case .people: symbol = "person.2.fill"; labelKey = "chat.planV2.peopleLabel"
        }
        return VStack(spacing: 2) {
            Image(systemName: symbol).font(.footnote).foregroundStyle(AnswerStyle.accent).accessibilityHidden(true)
            Text(chip.value).font(.subheadline.weight(.semibold)).foregroundStyle(AnswerStyle.text).multilineTextAlignment(.center)
            Text(LocalizedStringKey(labelKey)).font(.footnote).foregroundStyle(AnswerStyle.secondary)
        }
        .padding(.horizontal, Spacing.sm).padding(.vertical, Spacing.xs)
        .frame(minWidth: 72)
        .overlay(RoundedRectangle(cornerRadius: AnswerStyle.chipRadius, style: .continuous).stroke(AnswerStyle.border, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    // MARK: Itinerary row

    private func itineraryRow(_ model: PlanCardModel) -> some View {
        let first = model.days.first.map { dayName($0) }
        let last = model.days.last.map { dayName($0) }
        let range = (model.days.count > 1) ? [first, last].compactMap { $0 }.joined(separator: " – ") : first
        return Button { showItinerary = true } label: {
            HStack(spacing: Spacing.xs) {
                Image(systemName: "calendar").font(.title3).foregroundStyle(AnswerStyle.accent).accessibilityHidden(true)
                Text("trip.itinerary").font(.headline).foregroundStyle(AnswerStyle.text)
                Spacer(minLength: Spacing.xs)
                if let range { Text(range).font(.footnote).foregroundStyle(AnswerStyle.secondary).multilineTextAlignment(.trailing) }
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(AnswerStyle.secondary)
            }
            .padding(Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .answerSurface()
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("trip-itinerary-row")
    }

    // MARK: Accordions (closed by default, title with the number of items, the server's words as written)

    @ViewBuilder private var staysAccordion: some View {
        if let stays = plan.stays, !stays.isEmpty {
            AnswerAccordion(title: NSLocalizedString("chat.plan.stays", comment: ""), symbol: "bed.double.fill", count: stays.count) {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    ForEach(Array(stays.enumerated()), id: \.offset) { _, stay in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(stay.name).font(.subheadline.weight(.semibold)).foregroundStyle(AnswerStyle.text)
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: Spacing.xs)
                                if let price = stay.price { Text(price).font(.footnote.weight(.semibold)).foregroundStyle(AnswerStyle.text) }
                            }
                            if let why = stay.why { Text(why).font(.footnote).foregroundStyle(AnswerStyle.secondary).fixedSize(horizontal: false, vertical: true) }
                            if let address = stay.address { Text(address).font(.footnote).foregroundStyle(AnswerStyle.secondary) }
                            if let url = PlanCardContent.link(stay.bookingLink) {
                                Link(destination: url) { AnswerChip(text: NSLocalizedString("chat.plan.bookStay", comment: ""), symbol: "arrow.up.right.square") }
                            }
                        }
                    }
                }
            }
            .accessibilityIdentifier("trip-stays")
        }
    }

    @ViewBuilder private var dishesAccordion: some View {
        if let dishes = plan.dishes, !dishes.isEmpty {
            AnswerAccordion(title: NSLocalizedString("chat.plan.dishes", comment: ""), symbol: "fork.knife", count: dishes.count) {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    ForEach(Array(dishes.enumerated()), id: \.offset) { _, d in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(d.dish).font(.subheadline.weight(.semibold)).foregroundStyle(AnswerStyle.text).fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: Spacing.xs)
                                if let price = d.price { Text(price).font(.footnote.weight(.semibold)).foregroundStyle(AnswerStyle.text) }
                            }
                            if let line = TripDishLine.text(venue: d.venue, note: d.note) {
                                Text(line).font(.footnote).foregroundStyle(AnswerStyle.secondary).fixedSize(horizontal: false, vertical: true)
                            }
                            if let address = d.address { Text(address).font(.footnote).foregroundStyle(AnswerStyle.secondary) }
                        }
                    }
                }
            }
            .accessibilityIdentifier("trip-dishes")
        }
    }

    @ViewBuilder private var tipsAccordion: some View {
        let tips = PlanCardContent.tips(plan)
        if !tips.isEmpty {
            AnswerAccordion(title: NSLocalizedString("chat.plan.localTips", comment: ""), symbol: "lightbulb.fill", count: tips.count) {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    ForEach(Array(tips.enumerated()), id: \.offset) { _, tip in
                        Group {
                            if let place = tip.place { Text(verbatim: place + ": " + tip.text) }
                            else { Text("chat.plan.generalTip") + Text(verbatim: " · " + tip.text) }
                        }
                        .font(.footnote).foregroundStyle(AnswerStyle.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .accessibilityIdentifier("trip-tips")
        }
    }

    // MARK: PDF (the one action the message's bar does not have)

    private var pdfButton: some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            Button { startPdfExport() } label: {
                HStack(spacing: 6) {
                    if pdfPreparing { ProgressView().controlSize(.small) }
                    AnswerChip(text: NSLocalizedString("chat.plan.pdf", comment: ""), symbol: pdfPreparing ? nil : "arrow.down.doc")
                }
            }
            .buttonStyle(.plain)
            .disabled(pdfPreparing)
            .accessibilityIdentifier("plan-pdf")
            if let pdfNotice {
                Text(LocalizedStringKey(pdfNotice.key)).font(.footnote)
                    .foregroundStyle(pdfNotice == .failed ? Color.red : AnswerStyle.secondary)
                    .accessibilityIdentifier("plan-pdf-note")
            }
        }
    }

    private func startPdfExport() {
        guard !pdfPreparing else { return }
        pdfPreparing = true
        let plan = self.plan
        let labels = PlanPdf.labels(for: plan)
        let pictures = stopImages
        Task { @MainActor in
            // The designed file: its pictures are downloaded, then the pages are drawn, both off the main thread.
            let data = await Task.detached(priority: .userInitiated) { await PlanPdf.dataWithPictures(for: plan, labels: labels, stopImages: pictures) }.value
            pdfDocument = ReportFileDocument(data: data)
            pdfPreparing = false
            pdfExporting = true
        }
    }

    private func dayName(_ day: PlanCardModel.Day) -> String {
        day.label.isEmpty ? String(format: NSLocalizedString("chat.plan.dayFallback", comment: ""), day.number) : day.label
    }
}

// MARK: - Overview sheet (full height, a label above its value)

struct TripOverviewSheet: View {
    let card: PlanCardModel
    let overview: TripOverviewModel.Overview
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    ForEach(overview.rows) { row in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(LocalizedStringKey(row.labelKey)).font(.footnote).foregroundStyle(AnswerStyle.secondary)
                            Text(row.value).font(.body).foregroundStyle(AnswerStyle.text).fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Divider().overlay(AnswerStyle.border)
                    }
                    if !overview.costs.isEmpty {
                        Text("chat.plan.costBreakdown").font(.headline).foregroundStyle(AnswerStyle.text)
                        ForEach(Array(overview.costs.enumerated()), id: \.offset) { _, line in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(line.key).font(.footnote).foregroundStyle(AnswerStyle.secondary)
                                Text(line.value).font(.body).foregroundStyle(AnswerStyle.text)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    if !overview.assumptions.isEmpty {
                        Text("trip.assumptions").font(.headline).foregroundStyle(AnswerStyle.text)
                        ForEach(Array(overview.assumptions.enumerated()), id: \.offset) { _, assumption in
                            Text(verbatim: "• " + assumption).font(.body).foregroundStyle(AnswerStyle.text).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(AnswerStyle.margin)
            }
            .background(ChatTheme.background)
            .navigationTitle(Text("chat.planV2.overviewTrip"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { dismiss() } label: { Text("common.close") } } }
        }
        .presentationDetents([.large])
    }
}

// MARK: - Itinerary sheet (day tabs that stay on top, a timeline, a bottom sheet per stop)

struct TripItinerarySheet: View {
    let card: PlanCardModel
    var stopImages: [String: URL] = [:]
    @State private var selected = 0
    @State private var detail: PlanCardModel.Stop?
    @Environment(\.dismiss) private var dismiss

    private var dayIndex: Int { dayTabIndex(selected, dayCount: card.days.count) }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                    Section {
                        if let day = card.days[safe: dayIndex] {
                            ForEach(Array(day.stops.enumerated()), id: \.element.id) { i, stop in
                                stopRow(stop, last: i == day.stops.count - 1)
                            }
                        }
                    } header: {
                        dayTabs
                    }
                }
                .padding(.horizontal, AnswerStyle.margin)
            }
            .background(ChatTheme.background)
            .navigationTitle(Text("trip.itinerary"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { dismiss() } label: { Text("common.close") } } }
            .sheet(item: $detail) { stop in
                TripStopSheet(stop: stop, photo: photo(for: stop)).presentationDetents([.medium, .large])
            }
        }
        .presentationDetents([.large])
    }

    private func photo(for stop: PlanCardModel.Stop) -> URL? {
        stop.photoUrl ?? stopImages[SubjectImages.key(stop.name)]
    }

    /// Day 1 / Day 2 / Day 3 (the days' own labels), pinned while the stops scroll.
    private var dayTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.xs) {
                ForEach(card.days) { day in
                    Button { selected = day.index } label: {
                        AnswerChip(text: day.label.isEmpty ? String(format: NSLocalizedString("chat.plan.dayFallback", comment: ""), day.number) : day.label,
                                   selected: day.index == dayIndex)
                            .frame(minWidth: 72)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(day.index == dayIndex ? .isSelected : [])
                    .accessibilityIdentifier("trip-day-tab-\(day.index)")
                }
            }
            .padding(.vertical, Spacing.xs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ChatTheme.background)
    }

    private func stopRow(_ stop: PlanCardModel.Stop, last: Bool) -> some View {
        let photo = photo(for: stop)
        return HStack(alignment: .top, spacing: Spacing.xs) {
            Text(stop.time.isEmpty ? "—" : stop.time).font(.footnote.weight(.semibold)).foregroundStyle(AnswerStyle.text)
                .frame(width: 44, alignment: .trailing).padding(.top, Spacing.sm)
            // The timeline: a dot per stop and the line down to the next one.
            VStack(spacing: 0) {
                Circle().stroke(AnswerStyle.accent, lineWidth: 2).frame(width: 10, height: 10).padding(.top, Spacing.sm + 3)
                if !last { Rectangle().fill(AnswerStyle.border).frame(width: 2).frame(maxHeight: .infinity) }
            }
            .frame(width: 12)
            Button { detail = stop } label: {
                HStack(alignment: .top, spacing: Spacing.sm) {
                    // A thumbnail only when the stop has a picture; otherwise a small symbol of its category sits with the name.
                    if let photo { StopThumbnail(url: photo) }
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            if photo == nil {
                                Image(systemName: TripStopIcon.symbol(category: stop.category)).font(.footnote)
                                    .foregroundStyle(AnswerStyle.accent).accessibilityHidden(true)
                            }
                            Text(stop.name).font(.subheadline.weight(.semibold)).foregroundStyle(AnswerStyle.text).lineLimit(2)
                                .multilineTextAlignment(.leading)
                        }
                        if let d = stop.description {
                            Text(d).font(.footnote).foregroundStyle(AnswerStyle.secondary).lineLimit(2).multilineTextAlignment(.leading)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.footnote).foregroundStyle(AnswerStyle.secondary)
                }
                .padding(Spacing.sm)
                .frame(maxWidth: .infinity, alignment: .leading)
                .answerSurface(radius: AnswerStyle.chipRadius)
            }
            .buttonStyle(.plain)
            .padding(.bottom, Spacing.xs)
            .accessibilityIdentifier("trip-stop-\(stop.id)")
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// The 56 × 56 picture of a stop. It exists only for a stop that has a picture; if the picture cannot load, nothing is left in its place.
private struct StopThumbnail: View {
    let url: URL

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                image.resizable().aspectRatio(contentMode: .fill).frame(width: AnswerStyle.thumb, height: AnswerStyle.thumb)
                    .clipShape(RoundedRectangle(cornerRadius: AnswerStyle.imageRadius, style: .continuous))
            case .failure:
                EmptyView()
            default:
                RoundedRectangle(cornerRadius: AnswerStyle.imageRadius, style: .continuous).fill(AnswerStyle.secondary.opacity(0.18))
                    .frame(width: AnswerStyle.thumb, height: AnswerStyle.thumb)
            }
        }
    }
}

// MARK: - A stop in full (bottom sheet)

struct TripStopSheet: View {
    let stop: PlanCardModel.Stop
    let photo: URL?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    AnswerImage(url: photo, height: 180).clipShape(RoundedRectangle(cornerRadius: AnswerStyle.imageRadius, style: .continuous))
                    if !stop.time.isEmpty { Text(stop.time).font(.subheadline.weight(.semibold)).foregroundStyle(AnswerStyle.secondary) }
                    Text(stop.name).font(.title3.weight(.semibold)).foregroundStyle(AnswerStyle.text).fixedSize(horizontal: false, vertical: true)
                    if let description = stop.description {
                        Text(description).font(.body).foregroundStyle(AnswerStyle.text).fixedSize(horizontal: false, vertical: true)
                    }
                    if let address = stop.address {
                        Label { Text(address).font(.subheadline).foregroundStyle(AnswerStyle.secondary) } icon: {
                            Image(systemName: "mappin.and.ellipse").foregroundStyle(AnswerStyle.accent)
                        }
                    }
                    if let price = stop.price { Text(price).font(.subheadline.weight(.semibold)).foregroundStyle(AnswerStyle.text) }
                    if stop.mapsLink != nil || stop.bookingLink != nil {
                        HStack(spacing: Spacing.xs) {
                            if let url = stop.mapsLink { Link(destination: url) { AnswerChip(text: NSLocalizedString("chat.plan.map", comment: ""), symbol: "mappin.and.ellipse") } }
                            if let url = stop.bookingLink { Link(destination: url) { AnswerChip(text: NSLocalizedString("chat.plan.bookStay", comment: ""), symbol: "arrow.up.right.square") } }
                        }
                        .padding(.top, Spacing.xs)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(AnswerStyle.margin)
            }
            .background(ChatTheme.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { dismiss() } label: { Text("common.close") } } }
        }
    }
}

private extension Array {
    /// The element at `index`, or nil when there is none.
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
