import Foundation
import Observation

/// "Search a place not shown" on the grid (`GET /api/places?q=&lat&lng`): waits 300 ms after
/// the last keystroke, cancels the previous request and drops stale answers.
@MainActor
@Observable
final class RateSearchModel {
    private(set) var state: LoadState<[DeckPlace]> = .idle
    private(set) var query = ""
    /// The deck's centre; results sort and show distance from here.
    var origin: LatLng?
    @ObservationIgnored private var task: Task<Void, Never>?

    private let search: @Sendable (String, LatLng?) async throws -> [Place]
    private let handle: @MainActor (any Error) -> String?
    private let delay: Duration

    init(search: @escaping @Sendable (String, LatLng?) async throws -> [Place],
         handle: @escaping @MainActor (any Error) -> String?, delay: Duration) {
        self.search = search
        self.handle = handle
        self.delay = delay
    }

    func update(_ text: String) {
        query = text
        task?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= AreaSearchModel.minimumLength else {
            state = .idle
            return
        }
        let origin = origin
        task = Task { [weak self, delay, search] in
            do {
                try await Task.sleep(for: delay)
                self?.state = .loading
                let places = try await search(String(trimmed.prefix(200)), origin)
                try Task.checkCancellation()
                self?.state = .loaded(places.map { DeckPlace(place: $0, from: origin) })
            } catch {
                guard !Task.isCancelled, let self, let message = self.handle(error) else { return }
                self.state = .failed(message)
            }
        }
    }

    func clear() {
        task?.cancel()
        task = nil
        query = ""
        state = .idle
    }

    /// Waits for the in-flight search (tests).
    func settle() async {
        await task?.value
    }
}
