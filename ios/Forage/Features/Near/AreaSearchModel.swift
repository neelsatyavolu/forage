import Foundation
import Observation

/// City and neighborhood search as you type (`GET /api/explore/geocode`, free Photon data):
/// waits 300 ms after the last keystroke, cancels the previous request and drops stale answers.
/// Used by the Near me / Ask location bar and Explore's place picker.
@MainActor
@Observable
final class AreaSearchModel {
    enum State: Equatable, Sendable {
        case idle
        case loading
        case done([Area])
        case failed(String)
    }

    nonisolated static let debounce: Duration = .milliseconds(300)
    nonisolated static let minimumLength = 2

    private(set) var state: State = .idle
    private(set) var query = ""
    @ObservationIgnored private var task: Task<Void, Never>?

    private let search: @Sendable (String) async throws -> [Area]
    private let handle: @MainActor (any Error) -> String?
    private let delay: Duration

    init(search: @escaping @Sendable (String) async throws -> [Area],
         handle: @escaping @MainActor (any Error) -> String? = { $0.isCancellation ? nil : $0.userMessage },
         delay: Duration = AreaSearchModel.debounce) {
        self.search = search
        self.handle = handle
        self.delay = delay
    }

    convenience init(app: AppState) {
        let api = app.api
        self.init(search: { try await api.send(API.Explore.geocode($0)).areas },
                  handle: { [weak app] in app?.handle($0) ?? $0.userMessage })
    }

    /// Whether `text` should be sent: 2+ characters and not typed coordinates.
    nonisolated static func shouldSearch(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.count >= minimumLength && NearSpot.parse(trimmed) == nil
    }

    /// Call on every edit of the field.
    func update(_ text: String) {
        query = text
        task?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard Self.shouldSearch(trimmed) else {
            state = .idle
            return
        }
        task = Task { [weak self, delay, search] in
            do {
                try await Task.sleep(for: delay)
                self?.state = .loading
                let areas = try await search(trimmed)
                try Task.checkCancellation()
                self?.state = .done(areas)
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
