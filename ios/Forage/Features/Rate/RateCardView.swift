import SwiftUI

/// Step B: "How was it?" for one place. Three big buttons save the visit at once; the 1–10 row
/// saves (or fine-tunes) a score and moves on. The occasion is pre-guessed, one tap to change.
/// Swipe the card left for the next place, right to go back.
struct RateCardView: View {
    let model: RateModel
    let tile: DeckPlace
    @State private var drag: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let swipeDistance: CGFloat = 90

    private var entry: RatedPlace? { model.flow.rated[tile.id] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                header
                card
                VStack(alignment: .leading, spacing: Spacing.md) {
                    Text("How was it?").textStyle(.headline).foregroundStyle(Color.ink)
                    ReactionButtons(selected: entry?.reaction, isBusy: model.isBusy) { reaction in
                        Task { await model.react(reaction) }
                    }
                }
                VStack(alignment: .leading, spacing: Spacing.md) {
                    Text(entry == nil ? "Or give it a score out of 10" : "Fine-tune the score")
                        .textStyle(.label).foregroundStyle(Color.mute)
                    ScoreGrid(selected: entry?.rating, band: entry.map { RatingBand.range($0.reaction) },
                              isBusy: model.isBusy) { rating in
                        Task { await model.score(rating) }
                    }
                }
                if let error = model.error { InlineError(message: error) }
                if model.showsSavePrompt {
                    SavePanel(compact: true, onNotNow: { model.savePromptHidden = true })
                }
            }
            .padding(.horizontal, Spacing.gutter)
            .padding(.top, Spacing.xs)
            .padding(.bottom, Spacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { bottomBar }
        .sensoryFeedback(.impact(weight: .light), trigger: entry?.score)
    }

    private var header: some View {
        HStack {
            Button("Back") { model.back() }.buttonStyle(.forage(.quiet))
            Spacer()
            Text("Place \(model.flow.index + 1) of \(model.flow.queue.count)")
                .textStyle(.label).foregroundStyle(Color.mute)
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack(alignment: .firstTextBaseline, spacing: Spacing.md) {
                Text(tile.place.name)
                    .textStyle(.titleSmall)
                    .foregroundStyle(Color.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
                if let entry {
                    ScoreLabel(score: entry.score, large: true)
                        .transition(.opacity)
                }
            }
            Text(RateText.detail(tile)).textStyle(.label).foregroundStyle(Color.mute)
            OccasionMenu(selection: model.flow.occasion(for: tile), isBusy: model.isBusy) { occasion in
                Task { await model.chooseOccasion(occasion) }
            }
        }
        .padding(Spacing.lg)
        .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.hairlineStrong, lineWidth: Sizes.hairline))
        .offset(x: drag)
        .rotationEffect(.degrees(reduceMotion ? 0 : Double(drag / 40)))
        .gesture(swipe)
        .animation(Motion.fast, value: entry?.score)
        .accessibilityAction(named: "Next place") { Task { await model.next() } }
        .accessibilityAction(named: "Previous place") { model.back() }
    }

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 20)
            .onChanged { value in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                drag = value.translation.width
            }
            .onEnded { value in
                let width = value.translation.width
                withAnimation(Motion.enter) { drag = 0 }
                if width < -Self.swipeDistance {
                    Task { await model.next() }
                } else if width > Self.swipeDistance {
                    model.back()
                }
            }
    }

    private var bottomBar: some View {
        VStack(spacing: 0) {
            Hairline()
            Group {
                if entry == nil {
                    Button("Skip this place") { Task { await model.next() } }
                        .buttonStyle(.forage(.ghost, fullWidth: true))
                } else {
                    Button(isLast ? "Finish" : "Next place") { Task { await model.next() } }
                        .buttonStyle(.forage(.primary, fullWidth: true, isLoading: model.isBusy))
                }
            }
            .disabled(model.isBusy)
            .padding(.horizontal, Spacing.gutter)
            .padding(.vertical, Spacing.sm)
        }
        .background(Color.canvas)
    }

    private var isLast: Bool { model.flow.index == model.flow.queue.count - 1 && model.flow.pendingQuestion(for: tile.id) == nil }
}

/// "Loved it" / "It was fine" / "Didn't like it", full width and 56 pt tall.
struct ReactionButtons: View {
    let selected: Reaction?
    let isBusy: Bool
    let onPick: (Reaction) -> Void

    var body: some View {
        VStack(spacing: Spacing.sm) {
            ForEach(LogOptions.reactions, id: \.self) { reaction in
                let isOn = reaction == selected
                Button { onPick(reaction) } label: {
                    HStack {
                        Text(LogOptions.reactionLabel(reaction)).textStyle(.headline)
                        Spacer()
                        Text(RateText.bandLabel(reaction)).textStyle(.label)
                            .foregroundStyle(isOn ? Color.accent : Color.mute)
                    }
                    .foregroundStyle(Color.ink)
                    .padding(.horizontal, Spacing.lg)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(isOn ? Color.wash : Color.card, in: RoundedRectangle(cornerRadius: Radius.sm))
                    .overlay(RoundedRectangle(cornerRadius: Radius.sm)
                        .strokeBorder(isOn ? Color.accent : Color.fieldBorder, lineWidth: Sizes.hairline))
                    .contentShape(RoundedRectangle(cornerRadius: Radius.sm))
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
                .accessibilityAddTraits(isOn ? .isSelected : [])
            }
        }
    }
}

/// Ten big score buttons, 1–5 over 6–10. Inside the chosen reaction's band they are lit;
/// the given rating is filled.
struct ScoreGrid: View {
    let selected: Int?
    let band: ClosedRange<Int>?
    let isBusy: Bool
    let onPick: (Int) -> Void

    var body: some View {
        Grid(horizontalSpacing: Spacing.sm, verticalSpacing: Spacing.sm) {
            GridRow { ForEach(1...5, id: \.self) { cell($0) } }
            GridRow { ForEach(6...10, id: \.self) { cell($0) } }
        }
    }

    private func cell(_ value: Int) -> some View {
        let isOn = value == selected
        let inBand = band?.contains(value) ?? true
        return Button { onPick(value) } label: {
            Text("\(value)")
                .textStyle(.score)
                .foregroundStyle(isOn ? Color.accentOn : inBand ? Color.ink : Color.stone)
                .frame(maxWidth: .infinity, minHeight: 56)
                .background(isOn ? Color.accent : inBand && band != nil ? Color.wash : Color.card,
                            in: RoundedRectangle(cornerRadius: Radius.sm))
                .overlay(RoundedRectangle(cornerRadius: Radius.sm)
                    .strokeBorder(isOn ? Color.accent : Color.hairlineStrong, lineWidth: Sizes.hairline))
                .contentShape(RoundedRectangle(cornerRadius: Radius.sm))
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .accessibilityLabel("\(value) out of 10")
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// The occasion chip: shows the guess, opens the four choices.
struct OccasionMenu: View {
    let selection: Occasion
    let isBusy: Bool
    let onPick: (Occasion) -> Void

    var body: some View {
        Menu {
            ForEach(LogOptions.occasions, id: \.self) { occasion in
                Button { onPick(occasion) } label: {
                    if occasion == selection { Label(occasion.label, systemImage: "checkmark") } else { Text(occasion.label) }
                }
            }
        } label: {
            HStack(spacing: Spacing.xs) {
                Text(selection.label)
                Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
            }
            .textStyle(.label)
            .foregroundStyle(Color.ink)
            .padding(.horizontal, Spacing.md)
            .frame(minHeight: Sizes.controlSmall)
            .overlay(Capsule().strokeBorder(Color.hairlineStrong, lineWidth: Sizes.hairline))
            .contentShape(Capsule())
            .frame(minHeight: Sizes.control)
        }
        .disabled(isBusy)
        .accessibilityLabel("Occasion, \(selection.label)")
        .accessibilityHint("Change what kind of meal it was")
    }
}
