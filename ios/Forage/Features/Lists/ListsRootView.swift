import SwiftUI

/// Lists: Been (ranked, by occasion) and Want to try, as rows or on a MapKit map
/// (`GET /api/visits`, `GET /api/want`). Logging starts here too.
struct ListsRootView: View {
    @Environment(AppState.self) private var app
    @State private var model = ListsModel()

    var body: some View {
        NavigationStack {
            TabScreen(title: "Lists") {
                if app.isSignedIn {
                    content
                } else {
                    RatePromptCard(progress: .zero)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .task(id: ReloadKey(account: app.account?.ownerKey, revision: app.listsRevision)) {
            await model.load(app)
        }
    }

    private struct ReloadKey: Hashable {
        let account: String?
        let revision: Int
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .idle, .loading:
            LoadingRows(count: 5)
        case .failed(let message):
            ErrorStateView(message: message) { Task { await model.load(app) } }
        case .loaded(let data):
            loaded(data)
        }
    }

    private func loaded(_ data: ListsData) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xl) {
            actions
            SegmentedChoice(options: [ListsModel.Tab.been, .want], selection: $model.tab) { tab in
                tab == .been ? "Been \(data.been.count)" : "Want to try \(data.want.count)"
            }
            if model.tab == .been, !data.been.isEmpty {
                OccasionFilter(rows: data.been, selection: $model.occasion)
            }
            if let error = model.actionError { InlineError(message: error) }
            listBody(for: data)
        }
    }

    private var actions: some View {
        HStack(spacing: Spacing.sm) {
            Button("Rate places") { app.openRateFlow() }
                .buttonStyle(.forage(.accent))
            Button("Log a visit") { app.present(.logVisit(placeId: nil)) }
                .buttonStyle(.forage(.ghost))
            Spacer(minLength: 0)
            displayToggle
        }
    }

    private var displayToggle: some View {
        let isMap = model.display == .map
        return IconButton(systemName: isMap ? "list.bullet" : "map",
                          accessibilityLabel: isMap ? "Show as a list" : "Show on a map") {
            model.display = isMap ? .list : .map
        }
    }

    @ViewBuilder private func listBody(for data: ListsData) -> some View {
        if model.tab == .been {
            if data.been.isEmpty {
                EmptyStateView(message: "Nothing rated yet.", actionTitle: "Rate places near you") { app.openRateFlow() }
            } else if model.shownRows.isEmpty {
                EmptyStateView(message: "No places logged as \(model.occasion?.label.lowercased() ?? "anything") yet.")
            } else if model.display == .map {
                ListsMapView(pins: model.pins, label: "Map of places you've been") { app.present(.place(id: $0)) }
            } else {
                BeenListView(rows: model.shownRows, showsOccasion: model.occasion == nil) { app.present(.place(id: $0)) }
            }
        } else if data.want.isEmpty {
            EmptyStateView(message: "Nothing saved to try yet. Open a place and add it to this list.")
        } else if model.display == .map {
            ListsMapView(pins: model.pins, label: "Map of places you want to try") { app.present(.place(id: $0)) }
        } else {
            WantListView(entries: data.want, onOpen: { app.present(.place(id: $0)) }) { entry in
                Task { await model.removeWant(entry, app: app) }
            }
        }
    }
}

/// "All 12", "Casual 5"… pills over the Been list.
private struct OccasionFilter: View {
    let rows: [BeenRow]
    @Binding var selection: Occasion?

    private static let occasions: [Occasion] = [.quick, .casual, .nightOut, .special]

    var body: some View {
        let counts = BeenLists.counts(rows)
        FlowLayout {
            Pill(text: "All \(rows.count)", isOn: selection == nil) { selection = nil }
            ForEach(Self.occasions, id: \.self) { occasion in
                Pill(text: "\(occasion.label) \(counts[occasion] ?? 0)", isOn: selection == occasion) {
                    selection = occasion
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Filter by occasion")
    }
}
