import SwiftUI

/// The end of a run: how many are rated, the places just rated best first, and the way on
/// (picks from 5 rated, otherwise rate more). Guests also get the save form here.
struct RateFinishView: View {
    let model: RateModel
    let onDone: () -> Void
    @Environment(AppState.self) private var app

    private var progress: RateProgress { model.flow.progress }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.xxl) {
                ScreenHeader(title: "That's \(progress.rated) rated.", lede: lede)
                if progress.picksUnlocked, let line = progress.line {
                    Text(line).textStyle(.label).foregroundStyle(Color.mute)
                }
                if !model.flow.ratedBestFirst.isEmpty { list }
                actions
                if app.isGuest { SavePanel(compact: false, onNotNow: nil) }
            }
            .padding(.horizontal, Spacing.gutter)
            .padding(.vertical, Spacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var lede: String {
        if progress.picksUnlocked {
            guard let spot = model.spot, spot.label != NearSpot.currentLocationLabel else {
                return "Your picks near you are ready."
            }
            return "Your picks near \(spot.label.split(separator: ",").first ?? Substring(spot.label)) are ready."
        }
        let left = progress.firstPicksAt - progress.rated
        return "Rate \(left) more to unlock picks."
    }

    private var list: some View {
        SectionRule(label: "Just rated", meta: plural(model.flow.ratedBestFirst.count, "place")) {
            VStack(spacing: 0) {
                ForEach(Array(model.flow.ratedBestFirst.enumerated()), id: \.element.tile.id) { offset, entry in
                    HStack(alignment: .center, spacing: Spacing.md) {
                        Text("\(offset + 1)").textStyle(.label).foregroundStyle(Color.mute)
                            .frame(width: 20, alignment: .leading)
                        VStack(alignment: .leading, spacing: Spacing.xxs) {
                            Text(entry.tile.place.name).textStyle(.bodySmall).foregroundStyle(Color.ink)
                            Text("\(LogOptions.reactionLabel(entry.reaction)) · \(entry.occasion.label)")
                                .textStyle(.caption).foregroundStyle(Color.mute)
                        }
                        Spacer(minLength: 0)
                        ScoreLabel(score: entry.score)
                    }
                    .padding(.vertical, Spacing.md)
                    Hairline()
                }
            }
        }
    }

    @ViewBuilder private var actions: some View {
        VStack(spacing: Spacing.sm) {
            if progress.picksUnlocked {
                Button("See picks near you", action: onDone).buttonStyle(.forage(.accent, fullWidth: true))
                Button("Rate more places") { Task { await model.rateMore() } }
                    .buttonStyle(.forage(.ghost, fullWidth: true))
            } else {
                Button("Rate more places") { Task { await model.rateMore() } }
                    .buttonStyle(.forage(.accent, fullWidth: true))
                Button("Done for now", action: onDone).buttonStyle(.forage(.ghost, fullWidth: true))
            }
        }
    }
}

/// "Save your places" for a guest: email and password make this guest an account (same places);
/// Sign in merges them into an existing account. Not a modal and never blocks.
struct SavePanel: View {
    /// Inside Step B: a shorter lede and a "Not now".
    let compact: Bool
    let onNotNow: (() -> Void)?
    @Environment(AppState.self) private var app
    @State private var email = ""
    @State private var password = ""
    @State private var signingIn = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        SectionRule(label: signingIn ? "Sign in" : "Save your places") {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Text(signingIn ? "Your places here are added to your account."
                     : "Save your places so you don't lose them.")
                    .textStyle(.bodySmall).foregroundStyle(Color.bodyText)
                ForageField(label: "Email", text: $email, contentType: .emailAddress, keyboard: .emailAddress,
                            autocapitalization: .never, submitLabel: .next)
                ForageField(label: "Password", text: $password, hint: signingIn ? nil : "At least 8 characters.",
                            error: error, secure: true, contentType: signingIn ? .password : .newPassword,
                            autocapitalization: .never, submitLabel: .done) { Task { await submit() } }
                HStack(spacing: Spacing.sm) {
                    Button(signingIn ? "Sign in" : "Save") { Task { await submit() } }
                        .buttonStyle(.forage(.primary, isLoading: busy))
                        .disabled(busy)
                    if let onNotNow { Button("Not now", action: onNotNow).buttonStyle(.forage(.quiet)) }
                    Spacer(minLength: 0)
                }
                Button(signingIn ? "New here? Save with a new account" : "Already have an account? Sign in") {
                    signingIn.toggle()
                    error = nil
                }
                .buttonStyle(.forage(.link))
            }
        }
    }

    private func submit() async {
        guard !busy else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
            if signingIn {
                try await app.signIn(email: trimmed, password: password)
            } else {
                try await app.register(email: trimmed, password: password)
            }
        } catch {
            self.error = app.handle(error)
        }
    }
}
