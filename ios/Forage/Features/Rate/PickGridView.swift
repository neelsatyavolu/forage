import SwiftUI

/// Step A: "Which of these have you been to?" A two-column grid of nearby places; tapping a
/// tile marks it Been. Each tile also has Want to try and Not been. A search box covers places
/// that aren't shown. The sticky bar moves on to rating the selected places.
struct PickGridView: View {
    let model: RateModel
    @State private var query = ""

    private let columns = [GridItem(.flexible(), spacing: Spacing.sm), GridItem(.flexible(), spacing: Spacing.sm)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                ScreenHeader(title: "Which of these have you been to?", lede: lede)
                searchBox
                grid
                footer
            }
            .padding(.horizontal, Spacing.gutter)
            .padding(.vertical, Spacing.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { bottomBar }
    }

    private var lede: String {
        guard let spot = model.spot, spot.label != NearSpot.currentLocationLabel else {
            return "Places near you. Tap every one you've been to."
        }
        return "Places near \(spot.label.split(separator: ",").first ?? Substring(spot.label)). Tap every one you've been to."
    }

    private var searchBox: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            ForageField(label: "", text: $query, placeholder: "Search a place not shown",
                        autocapitalization: .words, submitLabel: .search)
                .onChange(of: query) { _, new in model.search.update(new) }
            RateSearchResults(model: model) { query = "" }
        }
    }

    @ViewBuilder private var grid: some View {
        let tiles = model.flow.visibleTiles
        if tiles.isEmpty, model.isLoadingDeck {
            LazyVGrid(columns: columns, spacing: Spacing.sm) {
                ForEach(0..<6, id: \.self) { _ in Skeleton(height: PlaceTile.minHeight) }
            }
        } else if tiles.isEmpty {
            EmptyStateView(message: "No more places to show here. Search for one, or try another area.")
        } else {
            LazyVGrid(columns: columns, spacing: Spacing.sm) {
                ForEach(tiles) { tile in
                    PlaceTile(tile: tile,
                              isSelected: model.flow.selected.contains(tile.id),
                              isWanted: model.flow.wanted.contains(tile.id),
                              isBusy: model.isBusy,
                              onToggle: { model.toggle(tile) },
                              onWant: { Task { await model.want(tile) } },
                              onSkip: { Task { await model.skip(tile) } })
                }
            }
        }
    }

    @ViewBuilder private var footer: some View {
        if let error = model.error ?? model.deckError { InlineError(message: error) }
        if model.flow.hasMore, !model.flow.visibleTiles.isEmpty {
            Button("Show more places") { Task { await model.loadDeck(more: true) } }
                .buttonStyle(.forage(.ghost, fullWidth: true, isLoading: model.isLoadingDeck))
                .disabled(model.isLoadingDeck)
        }
    }

    private var bottomBar: some View {
        let count = model.flow.selected.count
        return VStack(spacing: Spacing.xs) {
            Hairline()
            Button(count == 0 ? "Tap the places you've been" : "Next: rate \(plural(count, "place"))") {
                model.startRating()
            }
            .buttonStyle(.forage(.accent, fullWidth: true))
            .disabled(count == 0)
            .padding(.horizontal, Spacing.gutter)
            .padding(.top, Spacing.sm)
            if model.flow.canFinishFromPick {
                Button("Done for now") { model.finish() }.buttonStyle(.forage(.quiet))
            }
        }
        .padding(.bottom, Spacing.xs)
        .background(Color.canvas)
    }
}

/// One place on the grid. The whole tile toggles Been; Want to try and Not been sit along the bottom.
struct PlaceTile: View {
    static let minHeight: CGFloat = 112

    let tile: DeckPlace
    let isSelected: Bool
    let isWanted: Bool
    let isBusy: Bool
    let onToggle: () -> Void
    let onWant: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack(alignment: .top, spacing: Spacing.sm) {
                Text(tile.place.name)
                    .textStyle(.headline)
                    .foregroundStyle(Color.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                check
            }
            Text(RateText.meta(tile))
                .textStyle(.label)
                .foregroundStyle(Color.mute)
                .lineLimit(1)
            Spacer(minLength: Spacing.xs)
            controls
        }
        .padding(.leading, Spacing.md)
        .padding(.top, Spacing.md)
        .frame(maxWidth: .infinity, minHeight: Self.minHeight, alignment: .topLeading)
        .background(isSelected ? Color.wash : Color.card, in: RoundedRectangle(cornerRadius: Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Radius.md)
            .strokeBorder(isSelected ? Color.accent : Color.hairlineStrong, lineWidth: Sizes.hairline))
        .opacity(isWanted ? 0.55 : 1)
        .contentShape(RoundedRectangle(cornerRadius: Radius.md))
        .onTapGesture(perform: onToggle)
        .animation(Motion.fast, value: isSelected)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(tile.place.name), \(RateText.meta(tile))")
        .accessibilityValue(isSelected ? "Been" : isWanted ? "Want to try" : "")
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction(named: isSelected ? "Not been after all" : "Been", onToggle)
    }

    private var check: some View {
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
            .font(.system(size: 20, weight: .regular))
            .foregroundStyle(isSelected ? Color.accent : Color.stone)
            .padding(.trailing, Spacing.md)
            .accessibilityHidden(true)
    }

    @ViewBuilder private var controls: some View {
        if isWanted {
            Text("Saved to try").textStyle(.label).foregroundStyle(Color.accent)
                .frame(minHeight: Sizes.control)
        } else {
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                IconButton(systemName: "bookmark", accessibilityLabel: "Want to try", action: onWant)
                    .disabled(isBusy)
                IconButton(systemName: "xmark", accessibilityLabel: "Not been", action: onSkip)
                    .disabled(isBusy)
            }
        }
    }
}

/// Search results under the box: Been adds the place to the grid, selected.
struct RateSearchResults: View {
    let model: RateModel
    let onAdded: () -> Void

    var body: some View {
        switch model.search.state {
        case .idle:
            EmptyView()
        case .loading:
            LoadingRows(count: 2, height: Sizes.control)
        case .failed(let message):
            InlineError(message: message)
        case .loaded(let tiles) where tiles.isEmpty:
            Text("No places by that name. Try fewer words or another spelling.")
                .textStyle(.bodySmall).foregroundStyle(Color.mute)
        case .loaded(let tiles):
            VStack(spacing: 0) {
                ForEach(tiles.prefix(8)) { tile in
                    row(tile)
                    Hairline()
                }
            }
        }
    }

    private func row(_ tile: DeckPlace) -> some View {
        HStack(spacing: Spacing.sm) {
            VStack(alignment: .leading, spacing: Spacing.xxs) {
                Text(tile.place.name).textStyle(.bodySmall).foregroundStyle(Color.ink).lineLimit(1)
                Text(RateText.meta(tile)).textStyle(.label).foregroundStyle(Color.mute).lineLimit(1)
            }
            Spacer(minLength: 0)
            Button("Been") {
                model.addFromSearch(tile)
                onAdded()
            }
            .buttonStyle(.forage(.ghost, small: true))
            IconButton(systemName: "bookmark", accessibilityLabel: "Want to try") {
                Task {
                    await model.want(tile)
                    model.search.clear()
                    onAdded()
                }
            }
        }
        .frame(minHeight: Sizes.control)
    }
}
