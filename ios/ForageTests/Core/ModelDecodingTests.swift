import Foundation
import Testing
@testable import Forage

@Suite("Place models")
struct PlaceModelTests {
    @Test func placeDecodesAndIgnoresUnknownTags() throws {
        let place = try decodeEnvelope(Fixture.place(), as: Place.self)
        #expect(place.id == Fixture.placeID)
        #expect(place.source == .osm)
        #expect(place.cuisine == ["ramen", "japanese"])
        #expect(place.priceLevel == 2)
        #expect(place.tags.dishes == ["tonkotsu"])
        #expect(place.tags.occasions == [.casual, .nightOut])
        #expect(place.summaryLine == "ramen, japanese · $$")
    }

    @Test func malformedTagIsDropped() throws {
        let place = try decodeEnvelope(Fixture.place(priceLevel: "null", tags: #"{"dishes":"not a list","website":"https://x.co"}"#), as: Place.self)
        #expect(place.tags.dishes == nil)
        #expect(place.tags.website == "https://x.co")
        #expect(place.priceLevel == nil)
    }

    @Test func placeResponseWithAndWithoutLive() throws {
        let withLive = """
        {"place":\(Fixture.place()),"live":{"rating":4.6,"ratingCount":812,"priceLevel":2,"phone":null,"website":null,
         "mapsUrl":"https://maps.google.com/?cid=1","openNow":true,"hours":["Monday: 11–9"],"summary":null},
         "liveError":null,"visits":[\(Fixture.visit)],"scores":[\(Fixture.score)],"wanted":true}
        """
        let detail = try decodeEnvelope(withLive, as: PlaceResponse.self)
        #expect(detail.live?.ratingCount == 812)
        #expect(detail.live?.openNow == true)
        #expect(detail.visits.first?.occasion == .nightOut)
        #expect(detail.scores.first?.score == 8.4)
        #expect(detail.wanted)

        let bare = #"{"place":\#(Fixture.place()),"live":null,"liveError":"Live details aren't available right now.","visits":[],"scores":[],"wanted":false}"#
        let plain = try decodeEnvelope(bare, as: PlaceResponse.self)
        #expect(plain.live == nil)
        #expect(plain.liveError == "Live details aren't available right now.")
    }

    @Test func placesList() throws {
        let page = try decodeEnvelope(#"{"places":[\#(Fixture.place()),\#(Fixture.place(id: Fixture.otherPlaceID))]}"#, as: PlacesResponse.self)
        #expect(page.places.map(\.id) == [Fixture.placeID, Fixture.otherPlaceID])
    }
}

@Suite("Visit models")
struct VisitModelTests {
    @Test func visitsResponse() throws {
        let json = #"{"visits":[\#(Fixture.visit)],"places":[\#(Fixture.place())],"scores":[\#(Fixture.score)]}"#
        let page = try decodeEnvelope(json, as: VisitsResponse.self)
        #expect(page.visits[0].visitedOn == date("2026-11-10"))
        #expect(page.visits[0].reaction == .loved)
        #expect(page.visits[0].note == nil)
        #expect(page.places.count == 1)
    }

    @Test func logResponseWithOpponentAndDone() throws {
        let asking = try decodeEnvelope(#"{"visit":\#(Fixture.visit),"score":null,"opponent":\#(Fixture.place(id: Fixture.otherPlaceID)),"asked":0}"#,
                                        as: LogResponse.self)
        #expect(asking.step.opponent?.id == Fixture.otherPlaceID)
        #expect(asking.step.score == nil)
        let done = try decodeEnvelope(#"{"score":7.9,"opponent":null,"asked":2}"#, as: CompareStep.self)
        #expect(done.opponent == nil)
        #expect(done.score == 7.9)
        #expect(done.asked == CompareStep.maxComparisons)
    }

    @Test func visitInputEncoding() throws {
        let input = VisitInput(placeId: Fixture.placeID, visitedOn: date("2026-11-11"), reaction: .disliked, occasion: .quick)
        let object = try jsonObject(input)
        #expect(object["visitedOn"] as? String == "2026-11-11")
        #expect(object["reaction"] as? String == "disliked")
        #expect(object["dishes"] as? [String] == [])
        #expect(object["note"] == nil)
    }

    @Test func visitPatchSendsOnlySetFieldsAndCanClearNote() throws {
        let partial = try jsonObject(VisitPatch(occasion: .nightOut))
        #expect(partial.keys.sorted() == ["occasion"])
        #expect(partial["occasion"] as? String == "night_out")
        let cleared = try jsonObject(VisitPatch(note: .some(nil)))
        #expect(cleared.keys.sorted() == ["note"])
        #expect(cleared["note"] is NSNull)
    }

    @Test func comparisonRequestEncoding() throws {
        let request = ComparisonRequest(
            comparison: ComparisonInput(winnerPlaceId: "a", loserPlaceId: "b", occasion: .casual),
            next: ComparisonNext(subjectPlaceId: "a", asked: 1))
        let object = try jsonObject(request)
        let comparison = try #require(object["comparison"] as? [String: String])
        #expect(comparison["winnerPlaceId"] == "a")
        #expect((object["next"] as? [String: Any])?["asked"] as? Int == 1)
    }

    @Test func feedback() throws {
        let some = try decodeEnvelope(#"{"feedback":{"predicted":8.4,"actual":7.1,"at":1762800000000}}"#, as: FeedbackResponse.self)
        #expect(some.feedback?.predicted == 8.4)
        #expect(try decodeEnvelope(#"{"feedback":null}"#, as: FeedbackResponse.self).feedback == nil)
    }
}

@Suite("Want and recs models")
struct WantRecsModelTests {
    @Test func wantList() throws {
        let json = #"{"items":[{"userId":"u1","placeId":"\#(Fixture.placeID)","addedAt":1762800000000,"source":"import"}],"places":[\#(Fixture.place())]}"#
        let page = try decodeEnvelope(json, as: WantResponse.self)
        #expect(page.items[0].source == .imported)
        #expect(try decodeEnvelope(#"{"removed":true}"#, as: WantRemoved.self).removed)
        #expect(try jsonObject(WantAdd(placeId: "p", source: .rec))["source"] as? String == "rec")
    }

    @Test func recsPageWithAndWithoutReasons() throws {
        let rec = #"{"place":\#(Fixture.place()),"score":8.7,"reason":"Like Ippudo, which you loved.","signals":{"taste":0.8,"quality":null,"distanceKm":0.42,"novelty":1,"visited":false,"wanted":true}}"#
        let near = try decodeEnvelope(#"{"recs":[\#(rec)],"reasons":true}"#, as: RecsPage.self)
        #expect(near.reasons == true)
        #expect(near.recs[0].reason == "Like Ippudo, which you loved.")
        #expect(near.recs[0].signals.quality == nil)
        #expect(near.recs[0].id == Fixture.placeID)
        let noReason = rec.replacingOccurrences(of: #""reason":"Like Ippudo, which you loved.","#, with: "")
        let explore = try decodeEnvelope(#"{"recs":[\#(noReason)]}"#, as: RecsPage.self)
        #expect(explore.reasons == nil)
        #expect(explore.recs[0].reason == nil)
    }

    @Test func recRequestsEncodeOnlyWhatIsSet() throws {
        let near = try jsonObject(NearRequest(lat: 1, lng: 2, filter: .goTo, occasion: .nightOut))
        #expect(near.keys.sorted() == ["filter", "lat", "lng", "occasion"])
        #expect(near["filter"] as? String == "goto")
        let explore = try jsonObject(ExploreRequest(lat: 1, lng: 2, radiusKm: 3, mode: .splurge))
        #expect(explore["mode"] as? String == "splurge")
        #expect(explore["radiusKm"] as? Double == 3)
        #expect(RecMode.exploreModes == [.travel, .splurge, .stretch])
    }

    @Test func areas() throws {
        let json = #"{"areas":[{"label":"Mission District, San Francisco, United States","name":"Mission District","lat":37.76,"lng":-122.42,"radiusKm":3}]}"#
        let areas = try decodeEnvelope(json, as: AreasResponse.self).areas
        #expect(areas[0].radiusKm == 3)
        #expect(areas[0].coordinate == LatLng(lat: 37.76, lng: -122.42))
    }

    @Test func unknownEnumValuesDecodeLeniently() throws {
        let json = #"{"userId":"u","placeId":"p","occasion":"brunch","score":5,"updatedAt":1}"#
        #expect(try decodeEnvelope(json, as: PlaceScore.self).occasion == .unknown)
        #expect(Occasion.knownCases == [.quick, .casual, .nightOut, .special])
        #expect(Reaction.disliked.label == "Didn't like")
    }
}

@Suite("Taste, account, AI and Lodestar models")
struct OtherModelTests {
    @Test func tasteViewPairs() throws {
        let json = #"{"summary":"","summaryEdited":false,"likes":[["cuisine:ramen",0.9],["attr:outdoor_seating",0.3]],"dislikes":[["price:4",-0.4]],"updatedAt":null}"#
        let taste = try decodeEnvelope(json, as: TasteView.self)
        #expect(taste.likes.count == 2)
        #expect(taste.likes[0].tag.prefix == "cuisine")
        #expect(taste.likes[0].tag.label == "ramen")
        #expect(taste.likes[1].tag.label == "outdoor seating")
        #expect(taste.dislikes[0].tag.label == "$$$$")
        #expect(taste.dislikes[0].weight == -0.4)
        #expect(TasteTag("occasion:night_out").label == "Night out")
        #expect(taste.updatedAt == nil)
    }

    @Test func tasteRefreshAndSummaryPut() throws {
        let json = #"{"summary":"Noodles.","summaryEdited":false,"likes":[],"dislikes":[],"updatedAt":1,"aiConnected":true,"cardsWritten":4,"summaryWritten":true}"#
        let refresh = try decodeEnvelope(json, as: TasteRefresh.self)
        #expect(refresh.view.summary == "Noodles.")
        #expect(refresh.cardsWritten == 4)
        let cleared = try jsonObject(TasteSummaryPut(summary: nil))
        #expect(cleared["summary"] is NSNull)
        #expect(try jsonObject(TasteSummaryPut(summary: "Mine"))["summary"] as? String == "Mine")
    }

    @Test func accountShapes() throws {
        #expect(try decodeEnvelope(#"{"user":null}"#, as: AccountState.self).user == nil)
        let session = try decodeEnvelope(#"{"user":{"email":"a@b.co"}}"#, as: AccountSession.self)
        #expect(session.user.createdAt == nil)
        #expect(try jsonObject(SignOutEverywhereRequest())["action"] as? String == "signout-everywhere")
        let forgot = try decodeEnvelope(#"{"message":"If an account exists for that address, a reset link is on its way."}"#, as: ForgotResponse.self)
        #expect(forgot.message.hasPrefix("If an account exists"))
    }

    @Test func resetTokenFromLink() {
        let token = "abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234"
        #expect(ResetRequest.token(fromLink: "https://forage.xanom.co/reset?token=\(token)") == token)
        #expect(ResetRequest.token(fromLink: "  \(token)\n") == token)
        #expect(ResetRequest.token(fromLink: "https://forage.xanom.co/reset") == nil)
        #expect(ResetRequest.token(fromLink: "") == nil)
    }

    @Test func aiStatus() throws {
        let status = try decodeEnvelope(#"{"connected":{"codex":false,"grok":true}}"#, as: AIStatus.self)
        #expect(status.anyConnected)
        #expect(status.defaultProvider == .grok)
        #expect(status.connectedCount == 1)
        #expect(AIStatus.disconnected.defaultProvider == nil)
        #expect(try decodeEnvelope(#"{"connected":"codex"}"#, as: AIConnected.self).connected == .codex)
        #expect(try decodeEnvelope(#"{"disconnected":"grok"}"#, as: AIDisconnected.self).disconnected == .grok)
    }

    @Test func lodestarStatusBothShapes() throws {
        #expect(try decodeEnvelope(#"{"linked":false}"#, as: LodestarStatus.self) == .unlinked)
        let linked = try decodeEnvelope(#"{"linked":true,"label":"lodestar.xanom.co","connectedAt":1762800000000}"#, as: LodestarStatus.self)
        #expect(linked == .linked(label: "lodestar.xanom.co", connectedAt: 1_762_800_000_000))
        #expect(linked.isLinked)
    }

    @Test func lodestarTrips() throws {
        let trips = try decodeEnvelope(#"{"trips":[{"id":"t1","title":"Tokyo","destination":"Tokyo","startDate":"2026-12-01","endDate":null}]}"#,
                                       as: TripsResponse.self)
        #expect(trips.trips[0].startDate == date("2026-12-01"))
        let days = try decodeEnvelope(#"{"trip":{"id":"t1","title":"Tokyo","destination":null,"startDate":null,"endDate":null},"days":[{"day":"2026-12-01","meals":[{"title":"Ramen","time":"19:30"}]}]}"#,
                                      as: TripDays.self)
        #expect(days.days[0].meals[0].time == "19:30")
        let add = try jsonObject(AddToTripRequest(tripId: "t1", placeId: "p", day: date("2026-12-01"), time: "12:00"))
        #expect(add["day"] as? String == "2026-12-01")
        #expect(try decodeEnvelope(#"{"itemId":null}"#, as: AddToTripResponse.self).itemId == nil)
    }
}

@Suite("Formatting")
struct FormattingTests {
    @Test func scorePriceDistance() {
        #expect(ScoreText.format(8.44) == "8.4")
        #expect(ScoreText.format(nil) == "–")
        #expect(PriceText.label(3) == "$$$")
        #expect(PriceText.label(5) == nil)
        #expect(DistanceText.format(km: 0.42) == "420 m")
        #expect(DistanceText.format(km: 1.25) == "1.2 km" || DistanceText.format(km: 1.25) == "1.3 km")
        #expect(DateText.isoDay(1_762_819_200_000) == "2025-11-11")
        #expect(plural(1, "visit") == "1 visit")
        #expect(plural(3, "visit") == "3 visits")
    }
}
