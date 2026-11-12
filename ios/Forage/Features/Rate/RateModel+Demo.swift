#if DEBUG
import Foundation

/// `-ForageRateDemo pick|rate|rated|compare|save|finish` (Debug builds only): drives the flow to
/// that stage against a local server so each step can be screenshotted without tapping.
extension RateModel {
    static var demoStage: String? { UserDefaults.standard.string(forKey: "ForageRateDemo") }

    func runDemo(_ stage: String) async {
        guard flow.step == .pick else { return }
        let tiles = flow.visibleTiles
        let count = stage == "save" ? 6 : stage == "pick" ? 3 : 2
        for tile in tiles.prefix(count) { toggle(tile) }
        guard stage != "pick" else { return }
        startRating()
        guard stage != "rate" else { return }
        await rateCurrent()
        guard stage != "rated" else {
            await score(9)
            return
        }
        await next()
        await rateCurrent()
        if stage == "save" {
            for _ in 0..<4 {
                await next()
                if case .compare = flow.step { tooTough() }
                await rateCurrent()
            }
            return
        }
        await next()
        guard stage == "finish", case .compare(let question) = flow.step else { return }
        await pick(question.subject.place, in: question)
        if flow.step != .finish { finish() }
    }

    private func rateCurrent() async {
        guard flow.current != nil else { return }
        await chooseOccasion(.casual)
        await react(.loved)
    }
}
#endif
