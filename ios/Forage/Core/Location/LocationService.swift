import CoreLocation
import Foundation
import Observation

/// When-in-use location for Near me, Log search and Ask (free: CoreLocation only).
/// `requestFix()` asks for permission the first time, then returns one fix or nil.
@MainActor
@Observable
final class LocationService: NSObject {
    /// Give up on a fix this long after permission is decided (the simulator may never send one).
    /// The wait for the user to answer the permission prompt is not counted.
    nonisolated static let fixTimeout: Duration = .seconds(15)

    /// What one live update means for a pending fix.
    enum FixEvent: Sendable {
        case located(LatLng)
        case denied
        case waiting
    }

    private(set) var authorization: CLAuthorizationStatus
    /// The last fix this session.
    private(set) var current: LatLng?
    private(set) var isLocating = false

    @ObservationIgnored private let manager = CLLocationManager()
    /// Pending fixes waiting for the permission prompt to be answered.
    @ObservationIgnored private var waitingForDecision: [UUID: AsyncStream<Void>.Continuation] = [:]

    override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
    }

    /// Denied or restricted: show an area field and a button to Settings instead.
    var isDenied: Bool { authorization == .denied || authorization == .restricted }

    /// One location fix, asking for when-in-use permission if needed. Nil when denied,
    /// unavailable or timed out.
    func requestFix() async -> LatLng? {
        isLocating = true
        defer {
            isLocating = false
            authorization = manager.authorizationStatus
        }
        let id = UUID()
        let (decided, decide) = AsyncStream<Void>.makeStream()
        if manager.authorizationStatus == .notDetermined {
            waitingForDecision[id] = decide
        } else {
            decide.yield()
        }
        defer {
            waitingForDecision[id] = nil
            decide.finish()
        }
        let session = CLServiceSession(authorization: .whenInUse)
        defer { session.invalidate() }
        let fix = await Self.firstFix(events: Self.liveEvents(), decided: decided, timeout: Self.fixTimeout)
        if let fix { current = fix }
        return fix
    }

    /// The first fix from `events`, nil on denial. The timeout only starts once `decided`
    /// yields (permission answered), so a slow answer to the prompt is not a failure.
    nonisolated static func firstFix(events: AsyncStream<FixEvent>, decided: AsyncStream<Void>,
                                     timeout: Duration) async -> LatLng? {
        await withTaskGroup(of: LatLng?.self) { group in
            group.addTask {
                for await event in events {
                    switch event {
                    case .located(let point): return point
                    case .denied: return nil
                    case .waiting: continue
                    }
                }
                return nil
            }
            group.addTask {
                var iterator = decided.makeAsyncIterator()
                guard await iterator.next() != nil else { return nil }
                try? await Task.sleep(for: timeout)
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }

    private nonisolated static func liveEvents() -> AsyncStream<FixEvent> {
        AsyncStream { continuation in
            let task = Task {
                do {
                    for try await update in CLLocationUpdate.liveUpdates() {
                        continuation.yield(event(for: update))
                    }
                } catch {}
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private nonisolated static func event(for update: CLLocationUpdate) -> FixEvent {
        if update.authorizationDenied || update.authorizationDeniedGlobally || update.authorizationRestricted {
            return .denied
        }
        if let location = update.location {
            return .located(LatLng(lat: location.coordinate.latitude, lng: location.coordinate.longitude))
        }
        return .waiting
    }

    private func authorizationChanged() {
        authorization = manager.authorizationStatus
        guard authorization != .notDetermined else { return }
        for continuation in waitingForDecision.values { continuation.yield() }
        waitingForDecision = [:]
    }
}

extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        // The manager was made on the main thread, so it calls back there.
        MainActor.assumeIsolated { authorizationChanged() }
    }
}
