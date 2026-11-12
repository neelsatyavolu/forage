import Foundation
import Observation

/// Where Explore recommends around: a searched area, optionally from a Lodestar trip.
struct ExploreSpot: Hashable, Sendable {
    let area: Area
    let trip: TripSummary?

    /// The trip's title, else the area's short name.
    var title: String { trip?.title ?? area.name }
}

/// The linked Lodestar account's trips, or why there are none (the web's `useTrips`).
enum ExploreTrips: Equatable, Sendable {
    case loading
    case unlinked
    case failed(String)
    case ready([TripSummary])

    var trips: [TripSummary] {
        if case .ready(let trips) = self { return trips }
        return []
    }
}

/// Explore's state: the chosen spot, the mode, the picks (`POST /api/explore/recs`) and the
/// Lodestar trips. The view drives `load` from `.task(id: ExploreModel.Key)`.
@MainActor
@Observable
final class ExploreModel {
    struct Key: Hashable, Sendable {
        let spot: ExploreSpot?
        let mode: RecMode
        let refresh: Int
    }

    /// Dependencies, as closures so tests can stand in for the server.
    struct Service: Sendable {
        var recs: @Sendable (ExploreRequest) async throws -> [Rec]
        var geocode: @Sendable (String) async throws -> [Area]
        var trips: @Sendable () async throws -> [TripSummary]
        /// Refreshes `GET /api/lodestar`; nil when it couldn't be checked.
        var linked: @MainActor () async -> Bool?
        var handle: @MainActor (any Error) -> String?
    }

    var mode: RecMode = .travel
    private(set) var spot: ExploreSpot?
    private(set) var results: LoadState<[Rec]> = .idle
    private(set) var trips: ExploreTrips = .loading
    private(set) var pickError: String?
    private(set) var busyTrip: String?
    private(set) var refresh = 0

    private let service: Service

    init(service: Service) {
        self.service = service
    }

    convenience init(app: AppState) {
        let api = app.api
        self.init(service: Service(
            recs: { try await api.send(API.Explore.recs($0)).recs },
            geocode: { try await api.send(API.Explore.geocode($0)).areas },
            trips: { try await api.send(API.Lodestar.trips).trips },
            linked: { [weak app] in
                guard let app else { return nil }
                await app.refreshLodestar()
                return app.lodestar?.isLinked
            },
            handle: { [weak app] in app?.handle($0) ?? $0.userMessage }))
    }

    var key: Key { Key(spot: spot, mode: mode, refresh: refresh) }

    // MARK: - Where

    func pickArea(_ area: Area) {
        pickError = nil
        spot = ExploreSpot(area: area, trip: nil)
    }

    /// A trip gives a destination name; find where that is (first geocode result).
    func pickTrip(_ trip: TripSummary) async {
        guard let destination = trip.destination, busyTrip == nil else { return }
        pickError = nil
        busyTrip = trip.id
        defer { busyTrip = nil }
        do {
            let areas = try await service.geocode(destination)
            if let first = areas.first {
                spot = ExploreSpot(area: first, trip: trip)
            } else {
                pickError = "Couldn't find \(destination) on the map. Search for it instead."
            }
        } catch {
            pickError = service.handle(error)
        }
    }

    /// "Change".
    func clearSpot() {
        spot = nil
        results = .idle
        pickError = nil
    }

    // MARK: - Picks

    nonisolated static func request(spot: ExploreSpot, mode: RecMode) -> ExploreRequest {
        let safeMode = RecMode.exploreModes.contains(mode) ? mode : .travel
        return ExploreRequest(lat: spot.area.lat, lng: spot.area.lng, radiusKm: spot.area.radiusKm, mode: safeMode)
    }

    func load(_ key: Key) async {
        guard let spot = key.spot else {
            results = .idle
            return
        }
        results = .loading
        do {
            let recs = try await service.recs(Self.request(spot: spot, mode: key.mode))
            try Task.checkCancellation()
            results = .loaded(recs)
        } catch {
            guard !Task.isCancelled, let message = service.handle(error) else { return }
            results = .failed(message)
        }
    }

    func retry() {
        refresh += 1
    }

    // MARK: - Trips

    func loadTrips() async {
        trips = .loading
        switch await service.linked() {
        case nil:
            trips = .failed("Couldn't load your Lodestar trips.")
        case false?:
            trips = .unlinked
        case true?:
            do {
                trips = .ready(try await service.trips())
            } catch let error as APIError where error.isLodestarUnlinked {
                _ = await service.linked()
                trips = .unlinked
            } catch {
                guard let message = service.handle(error) else { return }
                trips = .failed(message)
            }
        }
    }

    /// The link went away elsewhere (Account disconnect, a 409 while adding).
    func markUnlinked() {
        trips = .unlinked
    }
}

/// Copy and small formatting helpers shared by Explore's views.
enum ExploreText {
    /// The web's `MODES` hints.
    nonisolated static func hint(_ mode: RecMode) -> String {
        switch mode {
        case .splurge: "Special places, no budget ceiling."
        case .stretch: "Something new, close to what you like."
        case .travel, .near, .unknown: "The best fits for you here."
        }
    }

    /// "2026-12-01 to 2026-12-05", one day alone, or nil without a start (the web's `dateSpan`).
    nonisolated static func dateSpan(_ start: LocalDate?, _ end: LocalDate?) -> String? {
        guard let start else { return nil }
        guard let end, end != start else { return start.string }
        return "\(start.string) to \(end.string)"
    }

    static let emptyPicks = "No restaurants found around here yet. Try a wider area or another mode."
}
