import Foundation
import Observation

/// Near me's picks (`POST /api/recs`) for one spot and filter. The view drives `load` from
/// `.task(id: NearModel.Key)`, so a newer spot or filter cancels the request in flight.
@MainActor
@Observable
final class NearModel {
    /// What a load depends on. `refresh` is bumped to reload the same spot and filter.
    struct Key: Hashable, Sendable {
        let spot: NearSpot?
        let filter: NearFilter
        let refresh: Int
    }

    nonisolated static let radiusKm = 2.0
    nonisolated static let filters: [NearFilter] = [.new, .goTo]

    var filter: NearFilter = .new
    private(set) var load: LoadState<RecsPage> = .idle
    /// Bumped by pull to refresh and when Lists changed while this tab was away.
    private(set) var refresh = 0
    /// `AppState.listsRevision` the current picks were loaded at.
    @ObservationIgnored private(set) var loadedRevision: Int?

    private let fetch: @Sendable (NearRequest) async throws -> RecsPage
    private let handle: @MainActor (any Error) -> String?

    init(fetch: @escaping @Sendable (NearRequest) async throws -> RecsPage,
         handle: @escaping @MainActor (any Error) -> String? = { $0.isCancellation ? nil : $0.userMessage }) {
        self.fetch = fetch
        self.handle = handle
    }

    convenience init(app: AppState) {
        let api = app.api
        self.init(fetch: { try await api.send(API.Recs.near($0)) },
                  handle: { [weak app] in app?.handle($0) ?? $0.userMessage })
    }

    func key(spot: NearSpot?) -> Key {
        Key(spot: spot, filter: filter, refresh: refresh)
    }

    /// The body the web sends: `{lat, lng, radiusKm: 2, filter}`.
    nonisolated static func request(spot: NearSpot, filter: NearFilter) -> NearRequest {
        NearRequest(lat: spot.lat, lng: spot.lng, radiusKm: radiusKm, filter: filter == .unknown ? .new : filter)
    }

    /// Under `RateProgress.firstPicksAt` rated places: no picks are asked for.
    nonisolated static let lockedText = "Rate 5 places to get picks."

    /// The web's empty text per filter.
    nonisolated static func emptyText(_ filter: NearFilter) -> String {
        switch filter {
        case .goTo: "No go-tos near here yet. Places you log as loved show up here."
        case .new, .unknown: "Nothing new within 2 km yet. Try another place, or check back once the map has loaded more spots."
        }
    }

    /// "12 picks".
    var meta: String? {
        load.value.map { plural($0.recs.count, "pick") }
    }

    func load(_ key: Key, revision: Int) async {
        guard let spot = key.spot else {
            load = .idle
            return
        }
        load = .loading
        do {
            let page = try await fetch(Self.request(spot: spot, filter: key.filter))
            try Task.checkCancellation()
            load = .loaded(page)
            loadedRevision = revision
        } catch {
            guard !Task.isCancelled, let message = handle(error) else { return }
            load = .failed(message)
        }
    }

    /// Reload when Lists changed since the picks were loaded (a visit or Want elsewhere).
    func reloadIfStale(revision: Int) {
        guard let loadedRevision, loadedRevision != revision else { return }
        refresh += 1
    }

    func forceReload() {
        refresh += 1
    }
}
