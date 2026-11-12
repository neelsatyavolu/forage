import CoreLocation
import Foundation
import Observation

/// When-in-use location for Near me, Log search and Ask (free: CoreLocation only).
/// `requestFix()` asks for permission the first time, then returns one fix or nil.
@MainActor
@Observable
final class LocationService {
    /// Give up on a fix after this long (the simulator may never send one).
    nonisolated static let fixTimeout: Duration = .seconds(15)

    private(set) var authorization: CLAuthorizationStatus
    /// The last fix this session.
    private(set) var current: LatLng?
    private(set) var isLocating = false

    @ObservationIgnored private let manager = CLLocationManager()

    init() {
        authorization = manager.authorizationStatus
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
        let session = CLServiceSession(authorization: .whenInUse)
        defer { session.invalidate() }
        let fix = await Self.firstFix()
        if let fix { current = fix }
        return fix
    }

    private nonisolated static func firstFix() async -> LatLng? {
        await withTaskGroup(of: LatLng?.self) { group in
            group.addTask {
                do {
                    for try await update in CLLocationUpdate.liveUpdates() {
                        if update.authorizationDenied || update.authorizationDeniedGlobally || update.authorizationRestricted {
                            return nil
                        }
                        if let location = update.location {
                            return LatLng(lat: location.coordinate.latitude, lng: location.coordinate.longitude)
                        }
                    }
                } catch {
                    return nil
                }
                return nil
            }
            group.addTask {
                try? await Task.sleep(for: fixTimeout)
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }
}
