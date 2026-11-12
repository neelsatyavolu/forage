import Foundation
import Testing
@testable import Forage

@Suite("Rating flow models and endpoints")
struct RateModelsTests {
    @Test func decodesDeckPage() throws {
        let page = RateFixture.deck([1, 2], hasMore: false, rated: 3)
        #expect(page.places.map(\.id) == [RateFixture.id(1), RateFixture.id(2)])
        #expect(page.places[0].kind == "Sushi")
        #expect(page.places[0].guessedOccasion == .casual)
        #expect(page.progress == RateProgress(rated: 3))
        #expect(!page.hasMore)
    }

    @Test func decodesGuestAccountWithProgress() throws {
        let state = try decodeEnvelope(
            #"{"user":{"email":null,"guest":true,"createdAt":1762800000000},"progress":{"rated":6,"firstPicksAt":5,"goal":10}}"#,
            as: AccountState.self)
        #expect(state.user?.guest == true)
        #expect(state.user?.email == nil)
        #expect(state.user?.ownerKey == "guest")
        #expect(state.progress?.rated == 6)
        let account = try decodeEnvelope(#"{"user":{"email":"a@example.com"}}"#, as: AccountSession.self)
        #expect(account.user.guest == false)
        let started = try decodeEnvelope(#"{"user":{"guest":true,"email":null},"created":true}"#, as: GuestStart.self)
        #expect(started.user.guest && started.created)
    }

    @Test func decodesVisitRatingAndOlderVisits() throws {
        let rated = try decodeEnvelope(RateFixture.visitJSON(1, reaction: .loved, rating: 9), as: Visit.self)
        #expect(rated.rating == 9)
        #expect(rated.dated == false)
        let older = try decodeEnvelope(Fixture.visit, as: Visit.self)
        #expect(older.rating == nil)
        #expect(older.dated == nil)
    }

    @Test func decodesCompareAnswerAndEdit() throws {
        let answer = RateFixture.answer(id: 12, score: 8.7, opponent: 3, asked: 1)
        #expect(answer.id == 12)
        #expect(answer.step.score == 8.7)
        #expect(answer.opponent?.id == RateFixture.id(3))
        let edit = RateFixture.edited(1, reaction: .fine, rating: 6, score: 6)
        #expect(edit.score == 6)
        #expect(edit.visit.rating == 6)
    }

    @Test func encodesRatingFields() throws {
        let input = VisitInput(placeId: "p", visitedOn: date("2026-11-11"), reaction: .loved, occasion: .casual,
                               rating: 9, dated: false)
        let json = try jsonObject(input)
        #expect(json["rating"] as? Int == 9)
        #expect(json["dated"] as? Bool == false)
        let plain = try jsonObject(VisitInput(placeId: "p", visitedOn: date("2026-11-11"), reaction: .fine, occasion: .quick))
        #expect(plain["rating"] == nil && plain["dated"] == nil)

        let cleared = try jsonObject(VisitPatch(reaction: .fine, rating: .some(nil)))
        #expect(cleared["rating"] is NSNull)
        #expect(cleared["reaction"] as? String == "fine")
        let untouched = try jsonObject(VisitPatch(occasion: .special))
        #expect(untouched.keys.sorted() == ["occasion"])
    }

    @Test func progressCopy() {
        #expect(RateProgress(rated: 2).line == "2 of 5 · Rate 3 more to get picks")
        #expect(RateProgress(rated: 6).line == "6 of 10 · Picks get better as you rate")
        #expect(RateProgress(rated: 10).line == nil)
        #expect(RateProgress(rated: 4).counter == "4 of 5")
        #expect(RateProgress(rated: 12).counter == "12 rated")
        #expect(!RateProgress(rated: 4).picksUnlocked && RateProgress(rated: 5).picksUnlocked)
        #expect(RateProgress(rated: 0).adding(-1).rated == 0)
    }

    @Test func ratingBands() {
        #expect(RatingBand.range(.loved) == 8...10)
        #expect(RatingBand.range(.fine) == 5...7)
        #expect(RatingBand.range(.disliked) == 1...4)
        #expect(RatingBand.reaction(for: 8) == .loved)
        #expect(RatingBand.reaction(for: 7) == .fine)
        #expect(RatingBand.reaction(for: 4) == .disliked)
        #expect(!RatingBand.contains(4, .fine))
    }

    /// The same cases as `lib/rate/occasion.test.ts`.
    @Test func occasionGuessMatchesTheWeb() throws {
        func place(_ tags: String, price: String = "null", cuisine: [String] = []) throws -> Place {
            var json = Fixture.place(priceLevel: price, tags: tags)
            json = json.replacingOccurrences(of: #""cuisine":["ramen","japanese"]"#,
                                             with: #""cuisine":[\#(cuisine.map { "\"\($0)\"" }.joined(separator: ","))]"#)
            return try JSONDecoder().decode(Place.self, from: Data(json.utf8))
        }
        #expect(OccasionGuess.guess(try place(#"{"occasions":["night_out"],"attributes":["cafe"]}"#, price: "4")) == .nightOut)
        #expect(OccasionGuess.guess(try place(#"{"occasions":["quick","casual"],"attributes":["cafe"]}"#, price: "4")) == .special)
        #expect(OccasionGuess.guess(try place(#"{"attributes":["fast food"]}"#)) == .quick)
        #expect(OccasionGuess.guess(try place(#"{"attributes":["bakery","takeaway"]}"#)) == .quick)
        #expect(OccasionGuess.guess(try place(#"{"attributes":["pub"]}"#)) == .nightOut)
        #expect(OccasionGuess.guess(try place(#"{"attributes":["biergarten"]}"#)) == .nightOut)
        #expect(OccasionGuess.guess(try place(#"{"attributes":["restaurant"]}"#)) == .casual)
        #expect(OccasionGuess.guess(try place("{}")) == .casual)
        #expect(OccasionGuess.guess(try place(#"{"attributes":["outdoor seating"]}"#)) == .casual)

        #expect(OccasionGuess.kind(try place(#"{"attributes":["restaurant"]}"#, cuisine: ["coffee shop", "sushi"])) == "Coffee Shop")
        #expect(OccasionGuess.kind(try place(#"{"attributes":["fast food"]}"#)) == "Fast Food")
        #expect(OccasionGuess.kind(try place("{}")) == "Place")
    }

    @Test func searchResultBecomesTile() {
        let place = RateFixture.place(4)
        let tile = DeckPlace(place: place, from: LatLng(lat: place.lat + 0.0045, lng: place.lng))
        #expect(abs(tile.distanceKm - 0.5) < 0.01)
        #expect(tile.guessedOccasion == .casual)
        #expect(RateText.meta(tile) == "Ramen · 500 m")
    }

    @Test func endpoints() throws {
        let base = URL(string: "https://forage.test")!
        let deck = try API.Rate.deck(DeckRequest(lat: 1, lng: 2, radiusKm: 1.5, limit: 24, exclude: ["a"])).makeRequest(baseURL: base)
        #expect(deck.httpMethod == "POST" && deck.url?.path() == "/api/rate/deck")
        #expect(deck.timeoutInterval == Timeouts.recs)
        let body = try JSONSerialization.jsonObject(with: deck.httpBody ?? Data()) as? [String: Any]
        #expect(body?["exclude"] as? [String] == ["a"])

        let unskip = try API.Rate.unskip(placeId: "p").makeRequest(baseURL: base)
        #expect(unskip.httpMethod == "DELETE" && String(data: unskip.httpBody ?? Data(), encoding: .utf8) == #"{"placeId":"p"}"#)

        let next = try API.Comparisons.next(placeId: "p", occasion: .nightOut, asked: 1).makeRequest(baseURL: base)
        #expect(next.url?.query() == "placeId=p&occasion=night_out&asked=1")

        let undo = try API.Comparisons.delete(id: 9, placeId: "p").makeRequest(baseURL: base)
        #expect(undo.httpMethod == "DELETE" && undo.url?.path() == "/api/comparisons/9" && undo.url?.query() == "placeId=p")

        let guest = try API.Account.guest.makeRequest(baseURL: base)
        #expect(guest.httpMethod == "POST" && guest.url?.path() == "/api/account/guest")
        #expect(try jsonObject(WantAdd(placeId: "p", source: .rate))["source"] as? String == "rate")
    }

    @Test func launchRule() {
        #expect(AppState.shouldOpenRateOnLaunch(progress: .zero, dismissedAt: 0))
        #expect(AppState.shouldOpenRateOnLaunch(progress: RateProgress(rated: 9), dismissedAt: 0))
        #expect(!AppState.shouldOpenRateOnLaunch(progress: RateProgress(rated: 10), dismissedAt: 0))
        #expect(!AppState.shouldOpenRateOnLaunch(progress: .zero, dismissedAt: 1_762_800_000))
    }
}
