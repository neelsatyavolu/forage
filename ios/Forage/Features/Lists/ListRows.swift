import SwiftUI

/// Ranked Been rows: rank, name, what/where, reaction and date, then the score in mono.
struct BeenListView: View {
    let rows: [BeenRow]
    /// Add the occasion to each row when the list mixes occasions.
    let showsOccasion: Bool
    let onOpen: (String) -> Void

    var body: some View {
        LazyVStack(spacing: 0) {
            Hairline()
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                Button { onOpen(row.place.id) } label: { label(row, rank: index + 1) }
                    .buttonStyle(PressedRowStyle())
                Hairline()
            }
        }
    }

    private func label(_ row: BeenRow, rank: Int) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.lg) {
            Text("\(rank)").textStyle(.label).foregroundStyle(Color.mute).frame(width: 24, alignment: .leading)
            VStack(alignment: .leading, spacing: Spacing.xxs) {
                Text(row.place.name).textStyle(.body).foregroundStyle(Color.ink).lineLimit(1)
                let line = [ListsText.text(row.place), showsOccasion ? row.occasion.label : ""]
                    .filter { !$0.isEmpty }.joined(separator: " · ")
                if !line.isEmpty {
                    Text(line).textStyle(.caption).foregroundStyle(Color.mute).lineLimit(1)
                }
                Text(meta(row)).textStyle(.label).foregroundStyle(Color.mute)
            }
            Spacer(minLength: 0)
            ScoreLabel(score: row.score)
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func meta(_ row: BeenRow) -> String {
        let visits = row.visits > 1 ? " · \(plural(row.visits, "visit"))" : ""
        return "\(row.reaction.label) · \(ListsText.day(row.lastVisited))\(visits)"
    }
}

/// Want to try rows: name and what/where, then where it came from and when. Long-press to remove.
struct WantListView: View {
    let entries: [WantEntry]
    let onOpen: (String) -> Void
    let onRemove: (WantEntry) -> Void

    var body: some View {
        LazyVStack(spacing: 0) {
            Hairline()
            ForEach(entries) { entry in
                Button { onOpen(entry.place.id) } label: { label(entry) }
                    .buttonStyle(PressedRowStyle())
                    .contextMenu {
                        Button("Remove from Want to try", systemImage: "minus.circle", role: .destructive) {
                            onRemove(entry)
                        }
                    }
                    .accessibilityAction(named: "Remove from Want to try") { onRemove(entry) }
                Hairline()
            }
        }
    }

    private func label(_ entry: WantEntry) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.lg) {
            VStack(alignment: .leading, spacing: Spacing.xxs) {
                Text(entry.place.name).textStyle(.body).foregroundStyle(Color.ink).lineLimit(1)
                let line = ListsText.text(entry.place)
                if !line.isEmpty {
                    Text(line).textStyle(.caption).foregroundStyle(Color.mute).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Text("\(ListsText.source(entry.item.source)) \(ListsText.shortDay(entry.item.addedAt))")
                .textStyle(.label)
                .foregroundStyle(Color.mute)
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
