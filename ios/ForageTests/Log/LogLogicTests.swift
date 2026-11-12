import Foundation
import Testing
@testable import Forage

@Suite("Log helpers: dishes, draft, place query, comparisons, quick start")
struct LogLogicTests {
    @Test func parsesDishesLikeTheWeb() {
        #expect(LogOptions.parseDishes("ramen, gyoza ,, ") == ["ramen", "gyoza"])
        #expect(LogOptions.parseDishes("a, a, b") == ["a", "b"])
        #expect(LogOptions.parseDishes("") == [])
        let long = String(repeating: "x", count: 150)
        #expect(LogOptions.parseDishes(long) == [String(repeating: "x", count: 100)])
        let many = (1...30).map { "d\($0)" }.joined(separator: ",")
        #expect(LogOptions.parseDishes(many).count == 20)
    }

    @Test func draftNeedsReactionAndOccasion() {
        let draft = VisitDraft(reaction: .loved, occasion: nil, visitedOn: date("2026-11-10"))
        #expect(draft.input(placeId: "p", today: date("2026-11-11")) == .failure(.missingChoice))
    }

    @Test func draftRejectsFutureDays() {
        let draft = VisitDraft(reaction: .loved, occasion: .casual, visitedOn: date("2026-11-12"))
        #expect(draft.input(placeId: "p", today: date("2026-11-11")) == .failure(.futureDate))
    }

    @Test func draftBuildsTheBody() throws {
        let draft = VisitDraft(reaction: .fine, occasion: .nightOut, visitedOn: date("2026-11-10"),
                               dishes: "tonkotsu, gyoza", note: "  good broth \n")
        let input = try draft.input(placeId: "p1", today: date("2026-11-11")).get()
        let json = try jsonObject(input)
        #expect(json["placeId"] as? String == "p1")
        #expect(json["visitedOn"] as? String == "2026-11-10")
        #expect(json["reaction"] as? String == "fine")
        #expect(json["occasion"] as? String == "night_out")
        #expect(json["dishes"] as? [String] == ["tonkotsu", "gyoza"])
        #expect(json["note"] as? String == "good broth")
    }

    @Test func blankNoteIsNil() throws {
        let draft = VisitDraft(reaction: .loved, occasion: .quick, visitedOn: date("2026-11-11"), note: "   ")
        #expect(try draft.input(placeId: "p", today: date("2026-11-11")).get().note == nil)
    }

    @Test func noteOver2000IsRejected() {
        let draft = VisitDraft(reaction: .loved, occasion: .quick, visitedOn: date("2026-11-11"),
                               note: String(repeating: "n", count: 2001))
        #expect(draft.input(placeId: "p", today: date("2026-11-11")) == .failure(.noteTooLong))
    }

    @Test func placeQueryNeedsTextOrLocation() {
        #expect(PlaceQuery.make(text: "  ", near: nil) == nil)
        let here = LatLng(lat: 37.44, lng: -122.16)
        let nearby = PlaceQuery.make(text: "", near: here)
        #expect(nearby?.isNameSearch == false)
        #expect(nearby?.debounce == .zero)
        let named = PlaceQuery.make(text: " ramen ", near: nil)
        #expect(named?.text == "ramen")
        #expect(named?.debounce == .milliseconds(300))
    }

    @Test func placeQueryPicksTheEndpoint() throws {
        let base = URL(string: "https://forage.test")!
        let here = LatLng(lat: 37.44431, lng: -122.16112)
        let search = try #require(PlaceQuery.make(text: "nagi", near: here)).endpoint.makeRequest(baseURL: base)
        #expect(search.url?.absoluteString == "https://forage.test/api/places?q=nagi&lat=37.44431&lng=-122.16112")
        let nearby = try #require(PlaceQuery.make(text: "", near: here)).endpoint.makeRequest(baseURL: base)
        #expect(nearby.url?.absoluteString == "https://forage.test/api/places?lat=37.44431&lng=-122.16112&radiusKm=1.5")
    }

    @Test func comparisonLoserIsTheOtherPlace() throws {
        let subject = try decodeEnvelope(Fixture.place(), as: Place.self)
        let opponent = try decodeEnvelope(Fixture.place(id: Fixture.otherPlaceID, name: "Other"), as: Place.self)
        let picked = CompareStepView.request(winner: opponent, subject: subject, opponent: opponent,
                                             occasion: .casual, asked: 0)
        #expect(picked.comparison.winnerPlaceId == Fixture.otherPlaceID)
        #expect(picked.comparison.loserPlaceId == Fixture.placeID)
        #expect(picked.next == ComparisonNext(subjectPlaceId: Fixture.placeID, asked: 1))
        let kept = CompareStepView.request(winner: subject, subject: subject, opponent: opponent,
                                           occasion: .special, asked: 1)
        #expect(kept.comparison.loserPlaceId == Fixture.otherPlaceID)
        #expect(kept.next?.asked == 2)
        let json = try jsonObject(kept)
        #expect((json["comparison"] as? [String: Any])?["occasion"] as? String == "special")
    }

    @Test func quickStartLogsLovedToday() {
        let input = QuickStartAdded.input(placeId: "p", occasion: .special, today: date("2026-11-11"))
        #expect(input.reaction == .loved)
        #expect(input.occasion == .special)
        #expect(input.visitedOn == date("2026-11-11"))
        #expect(input.dishes.isEmpty && input.note == nil)
    }

    @Test func quickStartTracksPlacePerOccasion() throws {
        let place = try decodeEnvelope(Fixture.place(), as: Place.self)
        let added = [QuickStartAdded(place: place, occasion: .casual)]
        #expect(QuickStartAdded.contains(added, placeId: place.id, occasion: .casual))
        #expect(!QuickStartAdded.contains(added, placeId: place.id, occasion: .special))
    }
}
