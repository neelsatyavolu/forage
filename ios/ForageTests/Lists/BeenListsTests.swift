import Foundation
import Testing
@testable import Forage

@Suite("Been list grouping (port of components/lists/been.ts)")
struct BeenListsTests {
    private static let a = Fixture.placeID
    private static let b = Fixture.otherPlaceID
    private static let c = "8b3c4d5e-1b2c-4d5e-8f90-123456789abc"

    private static func visit(_ id: String, place: String, day: String, reaction: String = "loved",
                              occasion: String = "casual") -> String {
        """
        {"id":"\(id)","userId":"u1","placeId":"\(place)","visitedOn":"\(day)","reaction":"\(reaction)",
         "occasion":"\(occasion)","dishes":[],"note":null,"createdAt":1762800000000}
        """
    }

    private static func score(place: String, occasion: String, _ value: Double) -> String {
        #"{"userId":"u1","placeId":"\#(place)","occasion":"\#(occasion)","score":\#(value),"updatedAt":1}"#
    }

    private static func response(visits: [String], scores: [String]) throws -> VisitsResponse {
        let places = [Fixture.place(id: a, name: "Nagi"), Fixture.place(id: b, name: "Bento"),
                      Fixture.place(id: c, name: "Arepa")].joined(separator: ",")
        let json = #"{"visits":[\#(visits.joined(separator: ","))],"places":[\#(places)],"scores":[\#(scores.joined(separator: ","))]}"#
        return try decodeEnvelope(json, as: VisitsResponse.self)
    }

    @Test func groupsByPlaceAndOccasionUsingTheNewestVisit() throws {
        let r = try Self.response(visits: [
            Self.visit("v3", place: Self.a, day: "2026-11-10", reaction: "fine"),
            Self.visit("v2", place: Self.a, day: "2026-10-01", reaction: "loved"),
            Self.visit("v1", place: Self.a, day: "2026-09-01", occasion: "night_out"),
        ], scores: [Self.score(place: Self.a, occasion: "casual", 7.5)])
        let rows = BeenLists.rows(from: r)
        #expect(rows.count == 2)
        let casual = try #require(rows.first { $0.occasion == .casual })
        #expect(casual.visits == 2)
        #expect(casual.reaction == .fine)
        #expect(casual.lastVisited == date("2026-11-10"))
        #expect(casual.score == 7.5)
        #expect(rows.first { $0.occasion == .nightOut }?.score == nil)
    }

    @Test func sortsByScoreThenNameWithUnscoredLast() throws {
        let r = try Self.response(visits: [
            Self.visit("v1", place: Self.a, day: "2026-11-01"),
            Self.visit("v2", place: Self.b, day: "2026-11-02"),
            Self.visit("v3", place: Self.c, day: "2026-11-03"),
        ], scores: [Self.score(place: Self.a, occasion: "casual", 6.0), Self.score(place: Self.b, occasion: "casual", 9.1)])
        #expect(BeenLists.rows(from: r).map(\.place.name) == ["Bento", "Nagi", "Arepa"])
    }

    @Test func tiesSortByName() throws {
        let r = try Self.response(visits: [
            Self.visit("v1", place: Self.a, day: "2026-11-01"),
            Self.visit("v2", place: Self.c, day: "2026-11-02"),
        ], scores: [])
        #expect(BeenLists.rows(from: r).map(\.place.name) == ["Arepa", "Nagi"])
    }

    @Test func dropsVisitsWhosePlaceIsMissing() throws {
        let r = try Self.response(visits: [Self.visit("v1", place: "missing", day: "2026-11-01")], scores: [])
        #expect(BeenLists.rows(from: r).isEmpty)
    }

    @Test func filtersAndCountsOccasions() throws {
        let r = try Self.response(visits: [
            Self.visit("v1", place: Self.a, day: "2026-11-01"),
            Self.visit("v2", place: Self.b, day: "2026-11-02", occasion: "special"),
            Self.visit("v3", place: Self.c, day: "2026-11-03"),
        ], scores: [])
        let rows = BeenLists.rows(from: r)
        #expect(BeenLists.filter(rows, occasion: nil).count == 3)
        #expect(BeenLists.filter(rows, occasion: .special).map(\.place.name) == ["Bento"])
        let counts = BeenLists.counts(rows)
        #expect(counts[.casual] == 2)
        #expect(counts[.special] == 1)
        #expect(counts[.quick] == nil)
    }

    @Test func beenPinsKeepTheBestScorePerPlace() throws {
        let r = try Self.response(visits: [
            Self.visit("v1", place: Self.a, day: "2026-11-01"),
            Self.visit("v2", place: Self.a, day: "2026-11-02", occasion: "special"),
        ], scores: [Self.score(place: Self.a, occasion: "casual", 6.0), Self.score(place: Self.a, occasion: "special", 8.25)])
        let pins = BeenLists.beenPins(BeenLists.rows(from: r))
        #expect(pins.count == 1)
        #expect(pins[0].score == 8.25)
        #expect(pins[0].label == "8.3" || pins[0].label == "8.2")
    }

    @Test func wantPinsHaveNoLabel() throws {
        let place = try decodeEnvelope(Fixture.place(), as: Place.self)
        let pins = BeenLists.wantPins([place])
        #expect(pins.map(\.label) == [""])
        #expect(pins[0].kind == .want)
    }

    @Test func wantEntriesPairItemsWithPlacesInOrder() throws {
        let json = #"""
        {"items":[{"userId":"u1","placeId":"\#(Self.b)","addedAt":1762800000000,"source":"rec"},
                  {"userId":"u1","placeId":"gone","addedAt":1,"source":"manual"},
                  {"userId":"u1","placeId":"\#(Self.a)","addedAt":1762700000000,"source":"lodestar"}],
         "places":[\#(Fixture.place(id: Self.a, name: "Nagi")),\#(Fixture.place(id: Self.b, name: "Bento"))]}
        """#
        let entries = BeenLists.wantEntries(try decodeEnvelope(json, as: WantResponse.self))
        #expect(entries.map(\.place.name) == ["Bento", "Nagi"])
        #expect(ListsText.source(entries[0].item.source) == "From a pick")
        #expect(ListsText.source(entries[1].item.source) == "From Lodestar")
    }

    @Test func placeLineJoinsWhatAndWhere() throws {
        let place = try decodeEnvelope(Fixture.place(), as: Place.self)
        #expect(ListsText.text(place) == "Ramen, japanese · 541 Bryant St")
    }

    @Test func placeLineFallsBackToAttributesAndCity() throws {
        let json = #"""
        {"id":"x","source":"osm","sourceId":"node/1","googlePlaceId":null,"name":"Cafe","lat":0,"lng":0,
         "address":null,"city":"Palo Alto","country":null,"cuisine":[],"priceLevel":null,
         "tags":{"attributes":["cafe"]},"updatedAt":1}
        """#
        let place = try decodeEnvelope(json, as: Place.self)
        #expect(ListsText.text(place) == "Cafe · Palo Alto")
    }

    @Test func formatsDaysWithoutShifting() {
        #expect(ListsText.day(date("2026-11-10")) == "Nov 10, 2026")
        #expect(ListsText.day(date("2026-01-01")) == "Jan 1, 2026")
        // 2026-11-11T05:00Z is still Nov 10 in Los Angeles.
        let millis: EpochMillis = 1_762_837_200_000
        #expect(ListsText.shortDay(millis, timeZone: TimeZone(identifier: "America/Los_Angeles")!) == "Nov 10")
        #expect(ListsText.shortDay(millis, timeZone: TimeZone(identifier: "UTC")!) == "Nov 11")
    }
}
