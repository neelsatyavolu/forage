import Foundation
import Observation

/// Ask: a sentence about tonight, then three picks with reasons (`POST /api/recs/ask`). Runs on
/// the user's own ChatGPT or Grok; a 401 "Connect …" means it isn't connected.
@MainActor
@Observable
final class AskModel {
    enum Result: Equatable, Sendable {
        case idle
        case asking
        case done([Rec])
        case failed(message: String, needsAI: Bool)
    }

    nonisolated static let maxLength = AskRequest.wantLength.upperBound

    var want = "" {
        didSet {
            if want.count > Self.maxLength { want = String(want.prefix(Self.maxLength)) }
        }
    }
    private(set) var result: Result = .idle

    private let ask: @Sendable (AskRequest) async throws -> [Rec]
    private let handle: @MainActor (any Error) -> String?

    init(ask: @escaping @Sendable (AskRequest) async throws -> [Rec],
         handle: @escaping @MainActor (any Error) -> String? = { $0.isCancellation ? nil : $0.userMessage }) {
        self.ask = ask
        self.handle = handle
    }

    convenience init(app: AppState) {
        let api = app.api
        self.init(ask: { try await api.send(API.Recs.ask($0)).recs },
                  handle: { [weak app] in app?.handle($0) ?? $0.userMessage })
    }

    var trimmed: String { want.trimmingCharacters(in: .whitespacesAndNewlines) }
    var isAsking: Bool { result == .asking }

    /// 3–500 characters after trimming, as the server checks.
    nonisolated static func isValid(_ text: String) -> Bool {
        AskRequest.wantLength.contains(text.trimmingCharacters(in: .whitespacesAndNewlines).count)
    }

    func canAsk(spot: NearSpot?) -> Bool {
        spot != nil && Self.isValid(want) && !isAsking
    }

    nonisolated static func request(spot: NearSpot, want: String) -> AskRequest {
        AskRequest(lat: spot.lat, lng: spot.lng, want: want.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Sends the question; awaits the answer so tests and the button spinner can follow it.
    func submit(spot: NearSpot?) async {
        guard let spot, canAsk(spot: spot) else { return }
        result = .asking
        do {
            result = .done(try await ask(Self.request(spot: spot, want: want)))
        } catch {
            guard let message = handle(error) else {
                result = .idle
                return
            }
            let needsAI = (error as? APIError)?.needsAIConnection ?? false
            result = .failed(message: message, needsAI: needsAI)
        }
    }
}
