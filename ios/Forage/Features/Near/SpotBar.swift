import SwiftUI
import UIKit

/// "Near · Your location" with Use my location and Pick a place; picking opens a city search
/// that also takes typed "lat, lng" (the web's `LocationBar`). When location is off it shows
/// the search straight away and a button to Settings.
struct SpotBar: View {
    let spotModel: SpotModel
    let search: AreaSearchModel
    @State private var picking = false
    @State private var text = ""
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            summary
            if let message = spotModel.message {
                Text(message).textStyle(.label).foregroundStyle(Color.mute)
            }
            if showsPicker { picker }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var showsPicker: Bool {
        if picking { return true }
        if case .unavailable = spotModel.state { return true }
        return false
    }

    private var placeText: String {
        switch spotModel.state {
        case .ready(let spot): spot.label
        case .idle, .locating: "Finding your location"
        case .unavailable: "No location yet"
        }
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
                Text("Near").textStyle(.label).foregroundStyle(Color.mute)
                Text(placeText).textStyle(.body).foregroundStyle(Color.ink).lineLimit(2)
            }
            HStack(spacing: Spacing.sm) {
                Button("Use my location") { Task { await spotModel.locate() } }
                    .buttonStyle(.forage(.ghost, small: true, isLoading: spotModel.isLocating))
                    .disabled(spotModel.isLocating)
                if spotModel.deniedByUser {
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    }
                    .buttonStyle(.forage(.quiet, small: true))
                }
                if !showsPicker {
                    Button("Pick a place") { picking = true }.buttonStyle(.forage(.quiet, small: true))
                }
            }
        }
    }

    private var picker: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            ForageField(label: "City, neighborhood, or lat, lng", text: $text, placeholder: "Mission District",
                        autocapitalization: .words, submitLabel: .search)
                .onChange(of: text) { _, new in search.update(new) }
            if let typed = NearSpot.parse(text) {
                AreaRows(labels: ["Use \(typed.label)"]) { _ in pick(typed) }
            }
            AreaSearchResults(state: search.state, emptyText: "No place by that name.") { pick(NearSpot(area: $0)) }
        }
    }

    private func pick(_ spot: NearSpot) {
        spotModel.choose(spot)
        picking = false
        text = ""
        search.clear()
    }
}

/// The search's loading, error, empty and result rows.
struct AreaSearchResults: View {
    let state: AreaSearchModel.State
    let emptyText: String
    let onPick: (Area) -> Void

    var body: some View {
        switch state {
        case .idle:
            EmptyView()
        case .loading:
            LoadingRows(count: 1, height: Sizes.control)
        case .failed(let message):
            InlineError(message: message)
        case .done(let areas) where areas.isEmpty:
            Text(emptyText).textStyle(.bodySmall).foregroundStyle(Color.mute)
        case .done(let areas):
            AreaRows(labels: areas.map(\.label)) { onPick(areas[$0]) }
        }
    }
}

/// Hairline rows of plain text choices.
struct AreaRows: View {
    let labels: [String]
    let onPick: (Int) -> Void

    var body: some View {
        VStack(spacing: 0) {
            Hairline()
            ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                Button { onPick(index) } label: {
                    Text(label)
                        .textStyle(.bodySmall)
                        .foregroundStyle(Color.ink)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, minHeight: Sizes.control, alignment: .leading)
                        .padding(.horizontal, Spacing.sm)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressedRowStyle())
                Hairline()
            }
        }
    }
}
