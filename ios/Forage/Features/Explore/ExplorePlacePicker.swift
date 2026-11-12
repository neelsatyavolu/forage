import SwiftUI

/// Search a city or neighborhood, or start from one of the linked Lodestar trips
/// (the web's `PlacePicker`).
struct ExplorePlacePicker: View {
    let model: ExploreModel
    let search: AreaSearchModel
    @State private var text = ""
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xxl) {
            VStack(alignment: .leading, spacing: Spacing.md) {
                ForageField(label: "City or neighborhood", text: $text, placeholder: "Lisbon, or Mission District",
                            autocapitalization: .words, submitLabel: .search)
                    .onChange(of: text) { _, new in search.update(new) }
                AreaSearchResults(state: search.state, emptyText: "No city or neighborhood by that name.") { area in
                    model.pickArea(area)
                    text = ""
                    search.clear()
                }
            }
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("Your Lodestar trips").textStyle(.label).foregroundStyle(Color.mute)
                trips
            }
        }
    }

    @ViewBuilder private var trips: some View {
        switch model.trips {
        case .loading:
            LoadingRows(count: 1, height: Sizes.control)
        case .unlinked:
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("Connect Lodestar to explore around your trips.").textStyle(.bodySmall).foregroundStyle(Color.bodyText)
                Button("Connect Lodestar on Account") { app.selectedTab = .account }.buttonStyle(.forage(.link))
            }
        case .failed(let message):
            ErrorStateView(message: message) { Task { await model.loadTrips() } }
        case .ready(let trips) where trips.isEmpty:
            Text("No trips in Lodestar yet.").textStyle(.bodySmall).foregroundStyle(Color.mute)
        case .ready(let trips):
            VStack(spacing: 0) {
                Hairline()
                ForEach(trips) { trip in
                    tripRow(trip)
                    Hairline()
                }
            }
        }
    }

    private func tripRow(_ trip: TripSummary) -> some View {
        Button { Task { await model.pickTrip(trip) } } label: {
            HStack(alignment: .center, spacing: Spacing.lg) {
                VStack(alignment: .leading, spacing: Spacing.xxs) {
                    Text(trip.title).textStyle(.headline).foregroundStyle(Color.ink).lineLimit(1)
                    Text(trip.destination ?? "No destination set").textStyle(.caption).foregroundStyle(Color.mute).lineLimit(1)
                }
                Spacer(minLength: 0)
                Text(model.busyTrip == trip.id ? "Finding" : (ExploreText.dateSpan(trip.startDate, trip.endDate) ?? "No dates"))
                    .textStyle(.label).monospacedDigit().foregroundStyle(Color.mute)
            }
            .padding(.vertical, Spacing.sm)
            .padding(.horizontal, Spacing.sm)
            .frame(minHeight: Sizes.control)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressedRowStyle())
        .disabled(model.busyTrip != nil || trip.destination == nil)
    }
}
