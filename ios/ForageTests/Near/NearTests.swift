import Foundation
import Testing
@testable import Forage

@Suite("Near me spot")
struct NearSpotTests {
    @Test func parsesTypedCoordinates() throws {
        let spot = try #require(NearSpot.parse(" 37.7749, -122.4194 "))
        #expect(spot.lat == 37.7749)
        #expect(spot.lng == -122.4194)
        #expect(spot.label == "37.7749, -122.4194")
        #expect(NearSpot.parse("37,-122")?.label == "37.0000, -122.0000")
    }

    @Test func refusesNonCoordinates() {
        #expect(NearSpot.parse("Mission District") == nil)
        #expect(NearSpot.parse("91, 10") == nil)
        #expect(NearSpot.parse("10, 181") == nil)
        #expect(NearSpot.parse("123.4, 10") == nil)
        #expect(NearSpot.parse("1e1, 2") == nil)
        #expect(NearSpot.parse("37., -122") == nil)
        #expect(NearSpot.parse("37.7, -122.4, 3") == nil)
    }

    @Test func remembersTheLastSpot() {
        let defaults = RecFixture.defaults()
        #expect(NearSpotMemory.load(from: defaults) == nil)
        let spot = NearSpot(lat: 1, lng: 2, label: "Somewhere")
        NearSpotMemory.save(spot, to: defaults)
        #expect(NearSpotMemory.load(from: defaults) == spot)
    }

    @Test @MainActor func fixBecomesYourLocation() async {
        let defaults = RecFixture.defaults()
        let model = SpotModel(fix: { LatLng(lat: 10, lng: 20) }, isDenied: { false }, defaults: defaults)
        await model.start()
        #expect(model.spot == NearSpot(lat: 10, lng: 20, label: "Your location"))
        #expect(model.message == nil)
        #expect(NearSpotMemory.load(from: defaults)?.label == "Your location")
    }

    @Test @MainActor func deniedWithoutSpotAsksToPick() async {
        let model = SpotModel(fix: { nil }, isDenied: { true }, defaults: RecFixture.defaults())
        await model.start()
        #expect(model.state == .unavailable(NearSpotMessage.denied))
        #expect(model.deniedByUser)
        model.choose(NearSpot(lat: 1, lng: 2, label: "Picked"))
        #expect(model.spot?.label == "Picked")
        #expect(model.message == nil)
        #expect(!model.deniedByUser)
    }

    @Test @MainActor func failedFixKeepsRememberedSpot() async {
        let defaults = RecFixture.defaults()
        NearSpotMemory.save(NearSpot(lat: 1, lng: 2, label: "Lisbon"), to: defaults)
        let model = SpotModel(fix: { nil }, isDenied: { false }, defaults: defaults)
        await model.start()
        #expect(model.spot?.label == "Lisbon")
        #expect(model.notice == NearSpotMessage.unavailable)
    }
}

@Suite("Near me picks")
struct NearModelTests {
    @Test func requestMatchesTheWeb() throws {
        let spot = NearSpot(lat: 37.1, lng: -122.2, label: "x")
        let body = try jsonObject(NearModel.request(spot: spot, filter: .goTo))
        #expect(body["lat"] as? Double == 37.1)
        #expect(body["radiusKm"] as? Double == 2)
        #expect(body["filter"] as? String == "goto")
        #expect(body["mode"] == nil)
        #expect(try jsonObject(NearModel.request(spot: spot, filter: .unknown))["filter"] as? String == "new")
    }

    @Test func emptyCopy() {
        #expect(NearModel.emptyText(.goTo).hasPrefix("No go-tos near here yet."))
        #expect(NearModel.emptyText(.new).hasPrefix("Nothing new within 2 km yet."))
    }

    @Test @MainActor func loadsAndReloadsWhenListsChange() async throws {
        let sent = Recorder<NearRequest>()
        let rec = try RecFixture.rec()
        let model = NearModel(fetch: { request in
            sent.append(request)
            return RecsPage(recs: [rec], reasons: true)
        })
        let spot = NearSpot(lat: 1, lng: 2, label: "x")
        await model.load(model.key(spot: nil), revision: 0)
        #expect(model.load.value == nil)
        #expect(sent.all.isEmpty)

        await model.load(model.key(spot: spot), revision: 3)
        #expect(model.load.value?.recs.count == 1)
        #expect(model.meta == "1 pick")

        let before = model.key(spot: spot)
        model.reloadIfStale(revision: 3)
        #expect(model.key(spot: spot) == before)
        model.reloadIfStale(revision: 4)
        #expect(model.key(spot: spot) != before)
    }

    @Test @MainActor func errorsShowTheServerSentence() async {
        let model = NearModel(fetch: { _ in
            throw APIError.server(status: 429, message: "Too many requests. Wait a few minutes and try again.")
        })
        await model.load(model.key(spot: NearSpot(lat: 1, lng: 2, label: "x")), revision: 0)
        #expect(model.load.errorMessage == "Too many requests. Wait a few minutes and try again.")
    }
}

@Suite("Rec rows and Want")
struct RecActionsTests {
    @Test func factsAndBadges() throws {
        let rec = try RecFixture.rec(distanceKm: 1.25, visited: true)
        #expect(RecFacts.line(rec) == "ramen, japanese · $$ · 1.2 km")
        #expect(RecFacts.badges(rec, wantedNow: true) == ["Been", "Want to try"])
        #expect(RecFacts.badges(try RecFixture.rec(), wantedNow: false).isEmpty)
    }

    @Test @MainActor func wantSavesOnceWithSource() async throws {
        let sent = Recorder<String>()
        let changes = Recorder<Int>()
        let model = RecActionsModel(source: .ask, add: { id, source in sent.append("\(id):\(source.rawValue)") },
                                    changed: { changes.append(1) })
        let rec = try RecFixture.rec()
        #expect(!model.isWanted(rec))
        await model.want(rec)
        await model.want(rec)
        #expect(model.isWanted(rec))
        #expect(sent.all == ["\(Fixture.placeID):ask"])
        #expect(changes.all.count == 1)
    }

    @Test @MainActor func alreadyWantedIsNotSentAgain() async throws {
        let sent = Recorder<String>()
        let model = RecActionsModel(source: .rec, add: { id, _ in sent.append(id) })
        let rec = try RecFixture.rec(wanted: true)
        #expect(model.isWanted(rec))
        await model.want(rec)
        #expect(sent.all.isEmpty)
    }

    @Test @MainActor func wantFailureShowsMessage() async throws {
        let model = RecActionsModel(source: .rec, add: { _, _ in throw APIError.server(status: 404, message: "That place wasn't found.") })
        let rec = try RecFixture.rec()
        await model.want(rec)
        #expect(model.mark(for: rec) == .failed("That place wasn't found."))
        #expect(!model.isWanted(rec))
    }
}

@Suite("Area search")
struct AreaSearchTests {
    @Test func shouldSearch() {
        #expect(!AreaSearchModel.shouldSearch("L"))
        #expect(AreaSearchModel.shouldSearch("Li"))
        #expect(!AreaSearchModel.shouldSearch("37.7, -122.4"))
    }

    @Test @MainActor func debouncesAndKeepsTheLastQuery() async {
        let sent = Recorder<String>()
        let model = AreaSearchModel(search: { query in
            sent.append(query)
            return [RecFixture.area(query)]
        }, delay: .milliseconds(20))
        model.update("Li")
        model.update("Lis")
        model.update(" Lisbon ")
        await model.settle()
        #expect(sent.all == ["Lisbon"])
        #expect(model.state == .done([RecFixture.area("Lisbon")]))
        model.update("L")
        #expect(model.state == .idle)
    }

    @Test @MainActor func failureShowsMessage() async {
        let model = AreaSearchModel(search: { _ in
            throw APIError.server(status: 502, message: "Place search isn't answering. Try again in a moment.")
        }, delay: .zero)
        model.update("Lisbon")
        await model.settle()
        #expect(model.state == .failed("Place search isn't answering. Try again in a moment."))
    }
}
