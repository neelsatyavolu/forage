import Foundation
@testable import Forage

/// Recs and places built from the shared JSON fixtures, for the Near, Explore and Ask suites.
enum RecFixture {
    static func rec(id: String = Fixture.placeID, name: String = "Ramen Nagi", score: Double = 8.4,
                    reason: String? = "Like Marufuku, which you loved.", distanceKm: Double = 0.35,
                    visited: Bool = false, wanted: Bool = false) throws -> Rec {
        let reasonJSON = reason.map { "\"\($0)\"" } ?? "null"
        let json = """
        {"place":\(Fixture.place(id: id, name: name)),"score":\(score),"reason":\(reasonJSON),
         "signals":{"taste":0.8,"quality":null,"distanceKm":\(distanceKm),"novelty":0.5,"visited":\(visited),"wanted":\(wanted)}}
        """
        return try JSONDecoder().decode(Rec.self, from: Data(json.utf8))
    }

    static func area(_ label: String = "Mission District, San Francisco, United States", radiusKm: Double = 3) -> Area {
        Area(label: label, name: String(label.split(separator: ",").first ?? ""), lat: 37.76, lng: -122.42, radiusKm: radiusKm)
    }

    /// A fresh, empty defaults suite per test.
    static func defaults(_ name: String = UUID().uuidString) -> UserDefaults {
        let suite = "forage-tests-\(name)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }
}

/// Collects values from @Sendable closures.
final class Recorder<T: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var items: [T] = []

    func append(_ item: T) {
        lock.lock()
        items.append(item)
        lock.unlock()
    }

    var all: [T] {
        lock.lock()
        defer { lock.unlock() }
        return items
    }
}
