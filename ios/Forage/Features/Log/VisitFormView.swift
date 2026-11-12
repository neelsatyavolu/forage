import SwiftUI

/// Reaction, occasion, date, dishes and a note for one place; `POST /api/visits`.
struct VisitFormView: View {
    let place: Place
    let onLogged: (LogResponse) -> Void
    let onChangePlace: () -> Void

    @Environment(AppState.self) private var app
    @State private var draft = VisitDraft(visitedOn: .today())
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xxl) {
            placeHeader
            choice("How was it") {
                SegmentedChoice(options: LogOptions.reactions.map(Optional.some), selection: $draft.reaction) {
                    $0.map(LogOptions.reactionLabel) ?? ""
                }
            }
            choice("Occasion") {
                SegmentedChoice(options: LogOptions.occasions.map(Optional.some), selection: $draft.occasion) {
                    $0?.label ?? ""
                }
            }
            dateRow
            ForageField(label: "Dishes", text: $draft.dishes, placeholder: "Dan dan noodles, cucumber salad",
                        hint: "Separate with commas.")
            noteField
            if let error { InlineError(message: error) }
            Button("Save visit") { Task { await save() } }
                .buttonStyle(.forage(.accent, fullWidth: true, isLoading: busy))
                .disabled(busy)
        }
    }

    private var placeHeader: some View {
        VStack(spacing: 0) {
            Hairline(strong: true)
            HStack(spacing: Spacing.sm) {
                PlaceNameBlock(place: place)
                Button("Change", action: onChangePlace).buttonStyle(.forage(.quiet, small: true))
            }
            Hairline(strong: true)
        }
    }

    private func choice<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(label).textStyle(.label).foregroundStyle(Color.mute)
            content()
        }
    }

    private var dateRow: some View {
        HStack {
            Text("Date").textStyle(.label).foregroundStyle(Color.mute)
            Spacer()
            DatePicker("Date", selection: dateBinding, in: ...Date.now, displayedComponents: .date)
                .labelsHidden()
                .tint(Color.accent)
        }
    }

    private var dateBinding: Binding<Date> {
        Binding(get: { draft.visitedOn.pickerDate },
                set: { draft.visitedOn = LocalDate(localDayOf: $0) })
    }

    private var noteField: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Note").textStyle(.label).foregroundStyle(Color.mute)
            TextField("Note", text: $draft.note, prompt: Text("Optional").foregroundStyle(Color.mute), axis: .vertical)
                .lineLimit(3...8)
                .font(TextStyle.bodySmall.font)
                .foregroundStyle(Color.ink)
                .tint(Color.accent)
                .padding(Spacing.md)
                .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.sm))
                .overlay(RoundedRectangle(cornerRadius: Radius.sm).strokeBorder(Color.fieldBorder, lineWidth: Sizes.hairline))
                .onChange(of: draft.note) { _, note in
                    if note.count > LogOptions.maxNote { draft.note = String(note.prefix(LogOptions.maxNote)) }
                }
        }
    }

    private func save() async {
        switch draft.input(placeId: place.id, today: .today()) {
        case .failure(let problem):
            error = problem.message
        case .success(let input):
            busy = true
            error = nil
            do {
                let response = try await app.api.send(API.Visits.log(input))
                app.listsChanged()
                onLogged(response)
            } catch {
                self.error = app.handle(error)
                busy = false
            }
        }
    }
}
