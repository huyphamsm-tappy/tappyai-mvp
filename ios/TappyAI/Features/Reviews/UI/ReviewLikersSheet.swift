import SwiftUI

/// "Ai đã thích" — the people who like a post, opened from the like count (web: the count is its own
/// click target). Tapping a person opens their profile.
struct ReviewLikersSheet: View {
    let service: ReviewsService
    let reviewId: String
    let onOpenProfile: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var likers: [ReviewLiker] = []
    @State private var cursor: String?
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        NavigationView {
            List {
                if loading {
                    HStack { Spacer(); ProgressView(); Spacer() }.listRowSeparator(.hidden)
                } else if failed && likers.isEmpty {
                    Text("likers.error").font(TappyFont.callout).foregroundStyle(TappyColor.textSecondary)
                } else if likers.isEmpty {
                    Text("likers.empty").font(TappyFont.callout).foregroundStyle(TappyColor.textSecondary)
                }
                ForEach(likers) { person in
                    Button {
                        dismiss()
                        onOpenProfile(person.id)
                    } label: {
                        HStack(spacing: Spacing.sm) {
                            avatar(person.avatarUrl)
                            Text(verbatim: person.displayName)
                                .font(TappyFont.body)
                                .foregroundStyle(TappyColor.textPrimary)
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                    .onAppear { if person.id == likers.last?.id { Task { await loadMore() } } }
                }
            }
            .listStyle(.plain)
            .navigationTitle(Text("likers.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("common.close") { dismiss() }
                }
            }
        }
        .task { await loadFirst() }
    }

    @ViewBuilder
    private func avatar(_ url: String?) -> some View {
        Group {
            if let url, let u = safeWebURL(url) {
                AsyncImage(url: u) { image in image.resizable().scaledToFill() } placeholder: { TappyColor.surface }
            } else {
                Image(systemName: "person.crop.circle.fill").resizable().foregroundStyle(TappyColor.textSecondary)
            }
        }
        .frame(width: 40, height: 40)
        .clipShape(Circle())
    }

    private func loadFirst() async {
        do {
            let page = try await service.fetchLikers(reviewId: reviewId)
            likers = page.likers
            cursor = page.nextCursor
        } catch { failed = true }
        loading = false
    }

    private func loadMore() async {
        guard let before = cursor else { return }
        cursor = nil   // one page at a time
        guard let page = try? await service.fetchLikers(reviewId: reviewId, before: before) else { cursor = before; return }
        let known = Set(likers.map(\.id))
        likers += page.likers.filter { !known.contains($0.id) }
        cursor = page.nextCursor
    }
}
