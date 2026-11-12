import SwiftUI

/// The Add to trip sheet: trip (when there are several), day with what's planned, optional
/// time and note, then Add to trip.
struct AddToTripSheet: View {
    @State private var model: AddToTripModel

    init(model: AddToTripModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        AddToTripForm(model: model)
            .task { await model.loadDays() }
    }
}

private struct AddToTripForm: View {
    @Bindable var model: AddToTripModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        AccountSheetScaffold(title: "Add \(model.place.name) to a trip", onClose: { dismiss() }) {
            VStack(alignment: .leading, spacing: Spacing.xl) {
                if model.trips.count > 1 { tripChoice }
                dayChoice
                timeAndNote
                footer
            }
        }
    }

    private var tripChoice: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Trip").textStyle(.label).foregroundStyle(Color.mute)
            Picker("Trip", selection: Binding(get: { model.tripId }, set: { id in Task { await model.selectTrip(id) } })) {
                ForEach(model.trips) { Text($0.title).tag($0.id) }
            }
            .pickerStyle(.menu)
            .tint(Color.ink)
            .disabled(model.done != nil)
        }
    }

    @ViewBuilder private var dayChoice: some View {
        switch model.days {
        case .idle, .loading:
            LoadingRows(count: 3, height: Sizes.control)
        case .failed(let message):
            ErrorStateView(message: message) { Task { await model.loadDays() } }
        case .loaded(let days) where days.isEmpty:
            VStack(alignment: .leading, spacing: Spacing.sm) {
                DatePicker("Day", selection: Binding(
                    get: { (model.day ?? model.fallbackDay).pickerDate },
                    set: { model.day = LocalDate(localDayOf: $0) }), displayedComponents: .date)
                    .textStyle(.bodySmall)
                    .tint(Color.accent)
                Text("This trip has no dates yet.").textStyle(.caption).foregroundStyle(Color.mute)
            }
            .disabled(model.done != nil)
        case .loaded(let days):
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("Day").textStyle(.label).foregroundStyle(Color.mute)
                VStack(spacing: 0) {
                    Hairline()
                    ForEach(days) { day in
                        dayRow(day)
                        Hairline()
                    }
                }
            }
        }
    }

    private func dayRow(_ day: TripDay) -> some View {
        let isOn = model.day == day.day
        return Button { model.day = day.day } label: {
            HStack(spacing: Spacing.md) {
                Image(systemName: isOn ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(isOn ? Color.accent : Color.stone)
                    .accessibilityHidden(true)
                Text(AddToTripModel.dayLabel(day.day)).textStyle(.mono).monospacedDigit().foregroundStyle(Color.ink)
                    .frame(width: 96, alignment: .leading)
                Text(AddToTripModel.mealsLine(day.meals)).textStyle(.caption).foregroundStyle(Color.mute).lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Spacing.sm)
            .frame(minHeight: Sizes.control)
            .background(isOn ? Color.wash : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
        .disabled(model.done != nil)
    }

    private var timeAndNote: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            Toggle(isOn: $model.usesTime) {
                Text("Set a time").textStyle(.bodySmall).foregroundStyle(Color.ink)
            }
            .tint(Color.accent)
            if model.usesTime {
                DatePicker("Time", selection: $model.time, displayedComponents: .hourAndMinute)
                    .textStyle(.bodySmall)
                    .tint(Color.accent)
            }
            ForageField(label: "Note (optional)", text: $model.note, placeholder: "Book ahead, ask for the counter")
                .onChange(of: model.note) { _, new in
                    if new.count > AddToTripModel.noteLimit { model.note = String(new.prefix(AddToTripModel.noteLimit)) }
                }
        }
        .disabled(model.done != nil)
    }

    @ViewBuilder private var footer: some View {
        if let done = model.done {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Text(done).textStyle(.bodySmall).foregroundStyle(Color.ok)
                Button("Close") { dismiss() }.buttonStyle(.forage(.ghost))
            }
        } else {
            VStack(alignment: .leading, spacing: Spacing.md) {
                if let error = model.error { InlineError(message: error) }
                Button("Add to trip") { Task { await model.save() } }
                    .buttonStyle(.forage(.primary, fullWidth: true, isLoading: model.saving))
                    .disabled(model.saving || model.days.value == nil)
            }
        }
    }
}
