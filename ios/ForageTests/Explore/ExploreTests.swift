import Foundation
import Testing
@testable import Forage

private let tripID = "3b0b1e2a-1111-4222-8333-444455556666"

private func trip(destination: String? = "Lisbon", start: String? = "2026-12-01", end: String? = "2026-12-03") -> TripSummary {
    TripSummary(id: tripID, title: "Portugal", destination: destination,
                startDate: start.flatMap(LocalDate.init), endDate: end.flatMap(LocalDate.init))
}

@MainActor
private func service(recs: @escaping @Sendable (ExploreRequest) async throws -> [Rec] = { _ in [] },
                     geocode: @escaping @Sendable (String) async throws -> [Area] = { [RecFixture.area($0)] },
                     trips: @escaping @Sendable () async throws -> [TripSummary] = { [] },
                     linked: Bool? = true) -> ExploreModel.Service {
    ExploreModel.Service(recs: recs, geocode: geocode, trips: trips, linked: { linked },
                         handle: { $0.isCancellation ? nil : $0.userMessage })
}

@Suite("Explore")
struct ExploreTests {
    @Test func textHelpers() {
        #expect(ExploreText.hint(.splurge) == "Special places, no budget ceiling.")
        #expect(ExploreText.hint(.stretch) == "Something new, close to what you like.")
        #expect(ExploreText.hint(.travel) == "The best fits for you here.")
        #expect(ExploreText.dateSpan(date("2026-12-01"), date("2026-12-03")) == "2026-12-01 to 2026-12-03")
        #expect(ExploreText.dateSpan(date("2026-12-01"), date("2026-12-01")) == "2026-12-01")
        #expect(ExploreText.dateSpan(date("2026-12-01"), nil) == "2026-12-01")
        #expect(ExploreText.dateSpan(nil, date("2026-12-01")) == nil)
    }

    @Test func requestUsesAreaRadiusAndMode() throws {
        let spot = ExploreSpot(area: RecFixture.area(radiusKm: 8), trip: nil)
        let body = try jsonObject(ExploreModel.request(spot: spot, mode: .splurge))
        #expect(body["radiusKm"] as? Double == 8)
        #expect(body["mode"] as? String == "splurge")
        #expect(try jsonObject(ExploreModel.request(spot: spot, mode: .near))["mode"] as? String == "travel")
    }

    @Test @MainActor func pickTripGeocodesDestination() async {
        let model = ExploreModel(service: service())
        await model.pickTrip(trip())
        #expect(model.spot?.trip?.id == tripID)
        #expect(model.spot?.title == "Portugal")
        #expect(model.spot?.area.label == "Lisbon")
    }

    @Test @MainActor func pickTripWithoutMatchSaysSo() async {
        let model = ExploreModel(service: service(geocode: { _ in [] }))
        await model.pickTrip(trip())
        #expect(model.spot == nil)
        #expect(model.pickError == "Couldn't find Lisbon on the map. Search for it instead.")
    }

    @Test @MainActor func loadsPicksForTheSpot() async throws {
        let rec = try RecFixture.rec()
        let sent = Recorder<String>()
        let model = ExploreModel(service: service(recs: { request in
            sent.append(request.mode.rawValue)
            return [rec]
        }))
        model.pickArea(RecFixture.area())
        model.mode = .stretch
        await model.load(model.key)
        #expect(model.results.value?.count == 1)
        #expect(sent.all == ["stretch"])
        model.clearSpot()
        #expect(model.results.value == nil)
    }

    @Test @MainActor func tripsStates() async {
        let unlinked = ExploreModel(service: service(linked: false))
        await unlinked.loadTrips()
        #expect(unlinked.trips == .unlinked)

        let unknown = ExploreModel(service: service(linked: nil))
        await unknown.loadTrips()
        #expect(unknown.trips == .failed("Couldn't load your Lodestar trips."))

        let ready = ExploreModel(service: service(trips: { [trip()] }))
        await ready.loadTrips()
        #expect(ready.trips.trips.map(\.id) == [tripID])

        let revoked = ExploreModel(service: service(trips: {
            throw APIError.server(status: 409, message: "Lodestar ended this connection. Connect again from Account.")
        }))
        await revoked.loadTrips()
        #expect(revoked.trips == .unlinked)
    }
}

@Suite("Add to trip")
struct AddToTripTests {
    @MainActor
    private func model(days: [TripDay] = [], add: @escaping @Sendable (AddToTripRequest) async throws -> Void = { _ in },
                       trips: [TripSummary] = [trip()]) throws -> AddToTripModel {
        let place = try RecFixture.rec().place
        return AddToTripModel(place: place, trips: trips, initialTripId: nil, service: .init(
            days: { _ in days }, add: add, handle: { $0.userMessage }, unlinked: {}))
    }

    @Test func formatting() {
        #expect(AddToTripModel.dayLabel(date("2026-12-01")) == "Tue 12-01")
        #expect(AddToTripModel.mealsLine([]) == "No meals planned")
        #expect(AddToTripModel.mealsLine([TripMeal(title: "Dinner", time: "19:30"), TripMeal(title: "Lunch", time: nil)])
            == "19:30 Dinner, Lunch")
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        #expect(AddToTripModel.timeString(Date(timeIntervalSince1970: 7 * 3600 + 5 * 60), calendar: calendar) == "07:05")
    }

    @Test @MainActor func needsADay() async throws {
        let model = try model(days: [TripDay(day: date("2026-12-01"), meals: [])])
        await model.loadDays()
        #expect(model.day == nil)
        await model.save()
        #expect(model.error == "Pick a day.")
    }

    @Test @MainActor func undatedTripStartsOnItsFirstDay() async throws {
        let model = try model(days: [])
        await model.loadDays()
        #expect(model.day == date("2026-12-01"))
    }

    @Test @MainActor func savesTheRequest() async throws {
        let sent = Recorder<AddToTripRequest>()
        let model = try model(days: [TripDay(day: date("2026-12-02"), meals: [])], add: { sent.append($0) })
        await model.loadDays()
        model.day = date("2026-12-02")
        model.note = "  Book ahead  "
        await model.save()
        let request = try #require(sent.all.first)
        #expect(request.tripId == tripID)
        #expect(request.placeId == Fixture.placeID)
        #expect(request.day == date("2026-12-02"))
        #expect(request.time == nil)
        #expect(request.note == "Book ahead")
        #expect(model.done == "Added to Portugal on 2026-12-02.")
    }

    @Test @MainActor func showsServerError() async throws {
        let model = try model(days: [], add: { _ in throw APIError.server(status: 404, message: "That restaurant isn't in Forage any more.") })
        await model.loadDays()
        await model.save()
        #expect(model.error == "That restaurant isn't in Forage any more.")
        #expect(model.done == nil)
    }
}
