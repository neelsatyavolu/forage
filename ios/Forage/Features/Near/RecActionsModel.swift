import Foundation
import Observation

/// The Want to try action on rec rows (`POST /api/want`), shared by Near me, Explore and Ask.
/// Remembers which places were saved this session so a row flips to "Saved" without a reload.
@MainActor
@Observable
final class RecActionsModel {
    enum WantMark: Equatable, Sendable {
        case saving
        case saved
        case failed(String)
    }

    private(set) var marks: [String: WantMark] = [:]

    private let add: @Sendable (String, WantSource) async throws -> Void
    private let handle: @MainActor (any Error) -> String?
    private let changed: @MainActor () -> Void
    let source: WantSource

    init(source: WantSource,
         add: @escaping @Sendable (String, WantSource) async throws -> Void,
         handle: @escaping @MainActor (any Error) -> String? = { $0.isCancellation ? nil : $0.userMessage },
         changed: @escaping @MainActor () -> Void = {}) {
        self.source = source
        self.add = add
        self.handle = handle
        self.changed = changed
    }

    convenience init(app: AppState, source: WantSource) {
        let api = app.api
        self.init(source: source,
                  add: { placeId, source in _ = try await api.send(API.Want.add(placeId: placeId, source: source)) },
                  handle: { [weak app] in app?.handle($0) ?? $0.userMessage },
                  changed: { [weak app] in app?.listsChanged() })
    }

    /// Saved now, or already on the list when the rec was made.
    func isWanted(_ rec: Rec) -> Bool {
        marks[rec.place.id] == .saved || (rec.signals.wanted && marks[rec.place.id] == nil)
    }

    func mark(for rec: Rec) -> WantMark? {
        marks[rec.place.id]
    }

    func want(_ rec: Rec) async {
        let id = rec.place.id
        guard marks[id] != .saving, !isWanted(rec) else { return }
        marks[id] = .saving
        do {
            try await add(id, source)
            marks[id] = .saved
            changed()
        } catch {
            if let message = handle(error) {
                marks[id] = .failed(message)
            } else {
                marks[id] = nil
            }
        }
    }
}
