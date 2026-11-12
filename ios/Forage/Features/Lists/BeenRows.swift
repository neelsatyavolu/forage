import Foundation

/// One row of the Been list: a place within one occasion (the web's `BeenRow`).
struct BeenRow: Hashable, Sendable, Identifiable {
    let place: Place
    let occasion: Occasion
    let score: Double?
    /// The newest visit's reaction.
    let reaction: Reaction
    /// The newest visit's day.
    let lastVisited: LocalDate
    let visits: Int

    var id: String { "\(place.id):\(occasion.rawValue)" }

    func adding(visits more: Int) -> BeenRow {
        BeenRow(place: place, occasion: occasion, score: score, reaction: reaction,
                lastVisited: lastVisited, visits: visits + more)
    }
}

/// A place on the Lists map: one you've been (with your best score) or want to try.
struct ListPin: Hashable, Sendable, Identifiable {
    enum Kind: Sendable { case been, want }

    let id: String
    let name: String
    let lat: Double
    let lng: Double
    let kind: Kind
    let score: Double?

    /// The text inside a pin: the score to one decimal, or nothing.
    var label: String {
        guard kind == .been, let score else { return "" }
        return ScoreText.format(score)
    }
}

/// Port of the web's `components/lists/been.ts`.
enum BeenLists {
    /// One row per place per occasion, from the newest visit (its reaction and date) and the
    /// fitted score, best first; unscored rows go last, ties by name.
    nonisolated static func rows(from response: VisitsResponse) -> [BeenRow] {
        let placeById = Dictionary(response.places.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let scoreOf = Dictionary(response.scores.map { (key($0.placeId, $0.occasion), $0.score) },
                                 uniquingKeysWith: { first, _ in first })
        var order: [String] = []
        var rows: [String: BeenRow] = [:]
        // Visits arrive newest first, so the first one seen for a key is the latest.
        for visit in response.visits {
            let k = key(visit.placeId, visit.occasion)
            if let seen = rows[k] {
                rows[k] = seen.adding(visits: 1)
                continue
            }
            guard let place = placeById[visit.placeId] else { continue }
            order.append(k)
            rows[k] = BeenRow(place: place, occasion: visit.occasion, score: scoreOf[k], reaction: visit.reaction,
                              lastVisited: visit.visitedOn, visits: 1)
        }
        return order.compactMap { rows[$0] }.sorted(by: ranks)
    }

    /// Rows for one occasion, or all of them when `occasion` is nil.
    nonisolated static func filter(_ rows: [BeenRow], occasion: Occasion?) -> [BeenRow] {
        guard let occasion else { return rows }
        return rows.filter { $0.occasion == occasion }
    }

    /// How many rows each occasion has, for the filter pills.
    nonisolated static func counts(_ rows: [BeenRow]) -> [Occasion: Int] {
        rows.reduce(into: [:]) { $0[$1.occasion, default: 0] += 1 }
    }

    /// Map pins: one per place, with its best score across the shown rows.
    nonisolated static func beenPins(_ rows: [BeenRow]) -> [ListPin] {
        var best: [String: ListPin] = [:]
        var order: [String] = []
        for row in rows {
            let pin = ListPin(id: row.place.id, name: row.place.name, lat: row.place.lat, lng: row.place.lng,
                              kind: .been, score: row.score)
            if let previous = best[row.place.id] {
                if (row.score ?? -1) > (previous.score ?? -1) { best[row.place.id] = pin }
            } else {
                order.append(row.place.id)
                best[row.place.id] = pin
            }
        }
        return order.compactMap { best[$0] }
    }

    nonisolated static func wantPins(_ places: [Place]) -> [ListPin] {
        places.map { ListPin(id: $0.id, name: $0.name, lat: $0.lat, lng: $0.lng, kind: .want, score: nil) }
    }

    /// Want entries paired with their places, in the server's order; entries without a place are dropped.
    nonisolated static func wantEntries(_ response: WantResponse) -> [WantEntry] {
        let byId = Dictionary(response.places.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return response.items.compactMap { item in byId[item.placeId].map { WantEntry(item: item, place: $0) } }
    }

    private nonisolated static func key(_ placeId: String, _ occasion: Occasion) -> String {
        "\(placeId):\(occasion.rawValue)"
    }

    private nonisolated static func ranks(_ a: BeenRow, _ b: BeenRow) -> Bool {
        let sa = a.score ?? -1
        let sb = b.score ?? -1
        if sa != sb { return sa > sb }
        return a.place.name.localizedCompare(b.place.name) == .orderedAscending
    }
}

/// A Want to try entry with its place.
struct WantEntry: Hashable, Sendable, Identifiable {
    let item: WantItem
    let place: Place

    var id: String { item.placeId }
}

/// Text helpers shared by Lists, Log and the place sheet.
enum ListsText {
    /// "Ramen, japanese · 541 Bryant St": what a place is and where (the web's `placeLine`).
    nonisolated static func text(_ place: Place) -> String {
        let what = place.cuisine.isEmpty ? place.tags.attributes?.first : place.cuisine.prefix(3).joined(separator: ", ")
        let location = place.address ?? place.city
        return [what.map(capitalizedFirst), location]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    /// "Nov 10, 2026" for a visit day (formatted in UTC so the day never shifts).
    nonisolated static func day(_ day: LocalDate) -> String {
        day.date.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted, locale: Locale(identifier: "en_US"),
                                            timeZone: TimeZone(identifier: "UTC")!))
    }

    /// "Nov 11" for when a Want entry was added, on the device's calendar.
    nonisolated static func shortDay(_ millis: EpochMillis, timeZone: TimeZone = .current) -> String {
        var style = Date.FormatStyle(locale: Locale(identifier: "en_US"), timeZone: timeZone)
        style = style.month(.abbreviated).day()
        return millis.asDate.formatted(style)
    }

    /// Where a Want entry came from (the web's `SOURCE`).
    nonisolated static func source(_ source: WantSource) -> String {
        switch source {
        case .manual, .unknown: "Added"
        case .rec: "From a pick"
        case .ask: "From Ask"
        case .imported: "Imported"
        case .lodestar: "From Lodestar"
        case .rate: "From rating"
        }
    }

    private nonisolated static func capitalizedFirst(_ s: String) -> String {
        s.prefix(1).uppercased() + s.dropFirst()
    }
}
