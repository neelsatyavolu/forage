import Foundation
import Testing
@testable import Forage

@Suite("Place sheet helpers")
struct PlaceDetailModelTests {
    private func response(wanted: Bool = false) throws -> PlaceResponse {
        let json = """
        {"place":\(Fixture.place()),"live":null,"liveError":null,"visits":[\(Fixture.visit)],
         "scores":[\(Fixture.score)],"wanted":\(wanted)}
        """
        return try decodeEnvelope(json, as: PlaceResponse.self)
    }

    @Test func feedbackLineReadsLikeTheWeb() {
        let fb = FeedbackResponse.Feedback(predicted: 8.44, actual: 7.1, at: 1)
        #expect(PlaceDetailModel.feedbackLine(fb) == "We predicted 8.4, you gave 7.1")
    }

    @Test func liveLineJoinsWhatIsPresent() throws {
        let full = try decodeEnvelope(
            #"{"rating":4.46,"ratingCount":120,"priceLevel":2,"phone":null,"website":null,"mapsUrl":null,"openNow":false,"hours":[],"summary":null}"#,
            as: LiveDetails.self)
        #expect(PlaceDetailModel.liveLine(full) == "4.5 (120) · $$ · Closed now")
        let sparse = try decodeEnvelope(
            #"{"rating":null,"ratingCount":null,"priceLevel":null,"phone":null,"website":null,"mapsUrl":null,"openNow":true,"hours":[],"summary":null}"#,
            as: LiveDetails.self)
        #expect(PlaceDetailModel.liveLine(sparse) == "Open now")
    }

    @Test func togglingWantMakesANewValue() throws {
        let original = try response(wanted: false)
        let updated = PlaceDetailModel.settingWanted(original, true)
        #expect(updated.wanted)
        #expect(!original.wanted)
        #expect(updated.visits == original.visits)
    }

    @Test func removingAVisitKeepsTheRest() throws {
        let original = try response()
        let updated = PlaceDetailModel.removingVisit(original, id: original.visits[0].id)
        #expect(updated.visits.isEmpty)
        #expect(original.visits.count == 1)
        #expect(PlaceDetailModel.removingVisit(original, id: "other").visits.count == 1)
    }
}
