import SwiftUI

/// Ask: describe what you want in a sentence and get three picks with reasons
/// (`POST /api/recs/ask`, the web's `AskPanel`). Needs ChatGPT or Grok connected.
struct AskRootView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        NavigationStack {
            TabScreen(title: "Ask", lede: "Describe tonight in a sentence and get three picks with reasons.",
                      signedOutMessage: "Sign in to ask for picks based on the places you have eaten.") {
                if app.aiStatus.anyConnected {
                    AskContent(app: app)
                } else {
                    AskNeedsAI()
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}

/// Ask runs on the user's own AI account; offer Connect instead of an error.
struct AskNeedsAI: View {
    @Environment(AppState.self) private var app

    var body: some View {
        EmptyStateView(message: "Ask runs on your own ChatGPT or Grok account, which isn't connected yet. Connect one, then come back.",
                       actionTitle: "Connect ChatGPT or Grok") { app.present(.connectAI(nil)) }
    }
}

private struct AskContent: View {
    @Environment(AppState.self) private var app
    @State private var spot: SpotModel
    @State private var search: AreaSearchModel
    @State private var model: AskModel
    @State private var actions: RecActionsModel
    @FocusState private var focused: Bool

    init(app: AppState) {
        _spot = State(initialValue: SpotModel(location: app.location))
        _search = State(initialValue: AreaSearchModel(app: app))
        _model = State(initialValue: AskModel(app: app))
        _actions = State(initialValue: RecActionsModel(app: app, source: .ask))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xxxl) {
            SpotBar(spotModel: spot, search: search)
            form
            outcome
        }
        .task { await spot.start() }
    }

    private var form: some View {
        @Bindable var model = model
        return VStack(alignment: .leading, spacing: Spacing.lg) {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("What do you want tonight").textStyle(.label).foregroundStyle(Color.mute)
                TextField("What do you want tonight", text: $model.want,
                          prompt: Text("Something spicy and brothy, under $30, for two").foregroundStyle(Color.mute),
                          axis: .vertical)
                    .lineLimit(4...8)
                    .textStyle(.body)
                    .foregroundStyle(Color.ink)
                    .tint(Color.accent)
                    .focused($focused)
                    .padding(Spacing.md)
                    .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.sm))
                    .overlay(RoundedRectangle(cornerRadius: Radius.sm)
                        .strokeBorder(focused ? Color.accent : Color.fieldBorder, lineWidth: Sizes.hairline))
                Text("\(model.want.count) / \(AskModel.maxLength)")
                    .textStyle(.label).monospacedDigit().foregroundStyle(Color.mute)
            }
            Button(model.isAsking ? "Picking" : "Get three picks") {
                focused = false
                Task { await model.submit(spot: spot.spot) }
            }
            .buttonStyle(.forage(.accent, isLoading: model.isAsking))
            .disabled(!model.canAsk(spot: spot.spot))
        }
    }

    @ViewBuilder private var outcome: some View {
        switch model.result {
        case .idle:
            EmptyView()
        case .asking:
            LoadingRows(count: 3, height: 96)
        case .failed(_, true):
            AskNeedsAI()
        case .failed(let message, false):
            InlineError(message: message)
        case .done(let recs):
            SectionRule(label: "Picks", meta: "\(recs.count) of 3") {
                if recs.isEmpty {
                    EmptyStateView(message: "No picks this time. Try saying it another way.")
                } else {
                    RecList(recs: recs, actions: actions)
                }
            }
        }
    }
}
