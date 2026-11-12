import Foundation

/// Scores: one decimal ("8.4"), "–" when there is none (the web's `toFixed(1)`).
enum ScoreText {
    static func format(_ score: Double?) -> String {
        guard let score, score.isFinite else { return "–" }
        return String(format: "%.1f", score)
    }
}

/// Price levels 1…4 as "$"…"$$$$".
enum PriceText {
    static func label(_ level: Int?) -> String? {
        guard let level, (1...4).contains(level) else { return nil }
        return String(repeating: "$", count: level)
    }
}

/// Distances: "350 m" under 1 km, else "1.2 km" (the web's rec list).
enum DistanceText {
    static func format(km: Double) -> String {
        guard km.isFinite, km >= 0 else { return "" }
        return km < 1 ? "\(Int((km * 1000).rounded())) m" : String(format: "%.1f km", km)
    }
}

/// Dates: "2026-11-11" as the web shows it (`toISOString().slice(0, 10)`).
enum DateText {
    static func isoDay(_ millis: EpochMillis) -> String {
        LocalDate(localDayOf: millis.asDate, calendar: LocalDate.utc).string
    }
}

/// "1 visit", "3 visits".
func plural(_ count: Int, _ singular: String, _ pluralForm: String? = nil) -> String {
    "\(count) \(count == 1 ? singular : (pluralForm ?? singular + "s"))"
}

extension Place {
    /// "ramen, japanese · $$" (cuisine and price, as on the web rows).
    var summaryLine: String {
        [cuisine.prefix(2).joined(separator: ", "), PriceText.label(priceLevel) ?? ""]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }
}
