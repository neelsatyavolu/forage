import SwiftUI

/// Onboarding: add places you love in one tap each. Each is logged as "loved" today under the
/// chosen occasion, with no comparisons (api.md §5.2, the web's `/log/quick`).
struct QuickStartSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var occasion: Occasion = .casual
    @State private var added: [QuickStartAdded] = []
    @State private var busy: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.xxl) {
                    Text("Add a few places you already like. Scores sort themselves out as you log real visits.")
                        .textStyle(.lede)
                        .foregroundStyle(Color.bodyText)
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("Add them as").textStyle(.label).foregroundStyle(Color.mute)
                        SegmentedChoice(options: LogOptions.occasions, selection: $occasion) { $0.label }
                    }
                    if let error { InlineError(message: error) }
                    PlaceSearchView(placeholder: "Search a place you love") { place in addButton(place) }
                    addedSection
                }
                .padding(Sizes.sheetPadding)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.card)
            .navigationTitle("Places you love")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.fixedSize()
                }
            }
        }
    }

    @ViewBuilder private func addButton(_ place: Place) -> some View {
        if QuickStartAdded.contains(added, placeId: place.id, occasion: occasion) {
            Label("Added", systemImage: "checkmark")
                .textStyle(.label)
                .foregroundStyle(Color.mute)
                .padding(.horizontal, Spacing.md)
        } else {
            Button("Add") { Task { await add(place) } }
                .buttonStyle(.forage(.ghost, small: true, isLoading: busy == place.id))
                .disabled(busy != nil)
                .accessibilityLabel("Add \(place.name)")
        }
    }

    private var addedSection: some View {
        SectionRule(label: "Added", meta: "\(added.count)") {
            if added.isEmpty {
                Text("Places you add show here.").textStyle(.lede).foregroundStyle(Color.bodyText)
            } else {
                LazyVStack(spacing: 0) {
                    Hairline()
                    ForEach(added) { entry in
                        HStack(alignment: .firstTextBaseline) {
                            Text(entry.place.name).textStyle(.body).foregroundStyle(Color.ink).lineLimit(1)
                            Spacer(minLength: Spacing.lg)
                            Text(entry.occasion.label).textStyle(.label).foregroundStyle(Color.mute)
                        }
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, Spacing.md)
                        Hairline()
                    }
                }
            }
        }
    }

    private func add(_ place: Place) async {
        let occasion = self.occasion
        busy = place.id
        error = nil
        defer { busy = nil }
        do {
            _ = try await app.api.send(API.Visits.log(QuickStartAdded.input(placeId: place.id, occasion: occasion)))
            added = [QuickStartAdded(place: place, occasion: occasion)] + added
            app.listsChanged()
        } catch {
            self.error = app.handle(error)
        }
    }
}

/// A place added in quick start, under one occasion.
struct QuickStartAdded: Hashable, Sendable, Identifiable {
    let place: Place
    let occasion: Occasion

    var id: String { "\(place.id):\(occasion.rawValue)" }

    nonisolated static func contains(_ list: [QuickStartAdded], placeId: String, occasion: Occasion) -> Bool {
        list.contains { $0.place.id == placeId && $0.occasion == occasion }
    }

    /// "Loved", today, no dishes or note.
    nonisolated static func input(placeId: String, occasion: Occasion, today: LocalDate = .today()) -> VisitInput {
        VisitInput(placeId: placeId, visitedOn: today, reaction: .loved, occasion: occasion, dishes: [], note: nil)
    }
}
