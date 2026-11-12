import SwiftUI

/// Search state: the last answer and which query it was for.
@MainActor
@Observable
final class PlaceSearchModel {
    var text = ""
    private(set) var near: LatLng?
    private(set) var places: [Place] = []
    private(set) var answered: PlaceQuery?
    private(set) var error: String?
    private(set) var locationError: String?

    var query: PlaceQuery? { PlaceQuery.make(text: text, near: near) }
    /// Loading while the last answer isn't for the current query (old rows stay visible meanwhile).
    var isLoading: Bool { query != nil && answered != query }

    /// Uses a fix this session already has, and asks for a fresh one only when location is
    /// already allowed, so opening search never pops a permission prompt.
    func biasWithKnownLocation(_ app: AppState) async {
        if let current = app.location.current {
            near = current
        } else if app.location.authorization == .authorizedWhenInUse || app.location.authorization == .authorizedAlways {
            near = await app.location.requestFix()
        }
    }

    /// The "Near me" button: asks for permission if needed.
    func locate(_ app: AppState) async {
        locationError = nil
        if let fix = await app.location.requestFix() {
            near = fix
        } else {
            locationError = "Location is off. Search by name instead."
        }
    }

    /// Runs one query after its debounce. Called from `.task(id: query)`, so a newer query
    /// cancels this one and a stale answer is never stored.
    func run(_ query: PlaceQuery?, app: AppState) async {
        guard let query else {
            places = []
            answered = nil
            error = nil
            return
        }
        do {
            try await Task.sleep(for: query.debounce)
            let response = try await app.api.send(query.endpoint)
            try Task.checkCancellation()
            places = response.places
            error = nil
            answered = query
        } catch {
            guard !Task.isCancelled, let message = app.handle(error) else { return }
            places = []
            self.error = message
            answered = query
        }
    }
}

/// A search box over OpenStreetMap places, with "Near me" to list what's around. Each row picks
/// the place when `onPick` is given, and ends with `accessory(place)`.
struct PlaceSearchView<Accessory: View>: View {
    var placeholder = "Search for a restaurant, cafe or bar"
    var onPick: ((Place) -> Void)?
    @ViewBuilder var accessory: (Place) -> Accessory

    @Environment(AppState.self) private var app
    @State private var model = PlaceSearchModel()

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xl) {
            searchBar
            if let message = model.locationError { InlineError(message: message) }
            if let message = model.error { InlineError(message: message) }
            results
        }
        .task { await model.biasWithKnownLocation(app) }
        .task(id: model.query) { await model.run(model.query, app: app) }
    }

    private var searchBar: some View {
        HStack(alignment: .bottom, spacing: Spacing.sm) {
            ForageField(label: "", text: $model.text, placeholder: placeholder, autocapitalization: .words,
                        submitLabel: .search)
                .accessibilityLabel("Search places")
            Button { Task { await model.locate(app) } } label: {
                Label("Near me", systemImage: "location")
            }
            .buttonStyle(.forage(.ghost, isLoading: app.location.isLocating))
            .disabled(app.location.isLocating)
            .accessibilityLabel("Search near me")
        }
    }

    @ViewBuilder private var results: some View {
        if model.isLoading, model.places.isEmpty {
            Text("Searching").textStyle(.label).foregroundStyle(Color.mute)
        } else if let answered = model.answered, !model.isLoading, model.error == nil, model.places.isEmpty {
            Text(answered.emptyMessage).textStyle(.lede).foregroundStyle(Color.bodyText)
        }
        if !model.places.isEmpty {
            LazyVStack(spacing: 0) {
                Hairline(strong: true)
                ForEach(model.places) { place in
                    row(place)
                    Hairline()
                }
            }
            .opacity(model.isLoading ? 0.6 : 1)
            .animation(Motion.fast, value: model.isLoading)
        }
    }

    private func row(_ place: Place) -> some View {
        HStack(spacing: Spacing.md) {
            if let onPick {
                Button { onPick(place) } label: { PlaceNameBlock(place: place) }
                    .buttonStyle(PressedRowStyle())
            } else {
                PlaceNameBlock(place: place)
            }
            accessory(place)
        }
    }
}

extension PlaceSearchView where Accessory == EmptyView {
    init(placeholder: String = "Search for a restaurant, cafe or bar", onPick: @escaping (Place) -> Void) {
        self.init(placeholder: placeholder, onPick: onPick, accessory: { _ in EmptyView() })
    }
}

/// A place's name with what and where under it (the web's `PlaceText`).
struct PlaceNameBlock: View {
    let place: Place

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            Text(place.name).textStyle(.headline).foregroundStyle(Color.ink).lineLimit(2)
            Text(ListsText.text(place).isEmpty ? "Place to eat" : ListsText.text(place))
                .textStyle(.caption)
                .foregroundStyle(Color.mute)
                .lineLimit(1)
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.md)
        .frame(maxWidth: .infinity, minHeight: Sizes.control, alignment: .leading)
        .multilineTextAlignment(.leading)
        .contentShape(Rectangle())
    }
}
