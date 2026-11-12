import Foundation
import Testing
@testable import Forage

@Suite("Ask")
struct AskTests {
    private let spot = NearSpot(lat: 37.7, lng: -122.4, label: "Your location")

    @Test func validation() {
        #expect(!AskModel.isValid("  hi  "))
        #expect(AskModel.isValid("ramen"))
        #expect(!AskModel.isValid(String(repeating: "a", count: 501)))
    }

    @Test @MainActor func capsLengthAndNeedsSpot() {
        let model = AskModel(ask: { _ in [] })
        model.want = String(repeating: "a", count: 600)
        #expect(model.want.count == 500)
        #expect(!model.canAsk(spot: nil))
        #expect(model.canAsk(spot: spot))
    }

    @Test @MainActor func sendsTrimmedWantAndShowsPicks() async throws {
        let sent = Recorder<AskRequest>()
        let rec = try RecFixture.rec()
        let model = AskModel(ask: { request in
            sent.append(request)
            return [rec]
        })
        model.want = "  spicy noodles for two  "
        await model.submit(spot: spot)
        #expect(sent.all.first?.want == "spicy noodles for two")
        #expect(sent.all.first?.radiusKm == nil)
        #expect(model.result == .done([rec]))
    }

    @Test @MainActor func notConnectedOffersConnect() async {
        let model = AskModel(ask: { _ in
            throw APIError.server(status: 401, message: "Connect ChatGPT or Grok on the Account page to use Ask.")
        })
        model.want = "ramen"
        await model.submit(spot: spot)
        #expect(model.result == .failed(message: "Connect ChatGPT or Grok on the Account page to use Ask.", needsAI: true))
    }

    @Test @MainActor func otherErrorsShowTheSentence() async {
        let model = AskModel(ask: { _ in
            throw APIError.server(status: 502, message: "The AI didn't pick any of the nearby places. Try again.")
        })
        model.want = "ramen"
        await model.submit(spot: spot)
        #expect(model.result == .failed(message: "The AI didn't pick any of the nearby places. Try again.", needsAI: false))
    }
}
