import Foundation

/// Where Near me and Ask look: the device's location, or a place the user picked when location
/// is off (the web's `Spot` in `use-location.ts`). The last one is remembered on this device.
struct NearSpot: Codable, Hashable, Sendable {
    let lat: Double
    let lng: Double
    let label: String

    static let currentLocationLabel = "Your location"

    init(lat: Double, lng: Double, label: String) {
        self.lat = lat
        self.lng = lng
        self.label = label
    }

    init(fix: LatLng) {
        self.init(lat: fix.lat, lng: fix.lng, label: Self.currentLocationLabel)
    }

    init(area: Area) {
        self.init(lat: area.lat, lng: area.lng, label: area.label)
    }

    var coordinate: LatLng { LatLng(lat: lat, lng: lng) }

    /// "37.77, -122.42" typed by hand, or nil (the web's `parseLatLng`).
    nonisolated static func parse(_ text: String) -> NearSpot? {
        let parts = text.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: ",", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        let latText = parts[0].trimmingCharacters(in: .whitespaces)
        let lngText = parts[1].trimmingCharacters(in: .whitespaces)
        guard isNumber(latText, maxIntegerDigits: 2), isNumber(lngText, maxIntegerDigits: 3),
              let lat = Double(latText), let lng = Double(lngText),
              abs(lat) <= 90, abs(lng) <= 180
        else { return nil }
        return NearSpot(lat: lat, lng: lng, label: String(format: "%.4f, %.4f", lat, lng))
    }

    /// `-?\d{1,n}(\.\d+)?`, as in the web's pattern.
    private nonisolated static func isNumber(_ text: String, maxIntegerDigits: Int) -> Bool {
        var body = Substring(text)
        if body.first == "-" { body = body.dropFirst() }
        let pieces = body.split(separator: ".", omittingEmptySubsequences: false)
        guard (1...2).contains(pieces.count) else { return false }
        let whole = pieces[0]
        guard (1...maxIntegerDigits).contains(whole.count), whole.allSatisfy(\.isASCIIDigit) else { return false }
        if pieces.count == 2 {
            return !pieces[1].isEmpty && pieces[1].allSatisfy(\.isASCIIDigit)
        }
        return true
    }
}

private extension Character {
    var isASCIIDigit: Bool { isASCII && isNumber }
}

/// The last spot, kept in `UserDefaults` (the web keeps it in localStorage under `forage:near-spot`).
enum NearSpotMemory {
    static let key = "forage.nearSpot"

    static func load(from defaults: UserDefaults = .standard) -> NearSpot? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(NearSpot.self, from: data)
    }

    static func save(_ spot: NearSpot, to defaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(spot) else { return }
        defaults.set(data, forKey: key)
    }
}

/// Why there is no fix (the web's `REFUSED`, worded for the app).
enum NearSpotMessage {
    static let denied = "Location is off for Forage. Pick a place instead, or turn it on in Settings."
    static let unavailable = "Your location isn't available right now. Pick a place instead."
}
