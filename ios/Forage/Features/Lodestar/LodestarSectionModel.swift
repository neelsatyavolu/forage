import Foundation
import Observation

/// The Account tab's Lodestar section: Connect, Import preferences, Disconnect
/// (the web's `LodestarSection`). Link status itself lives in `AppState.lodestar`.
@MainActor
@Observable
final class LodestarSectionModel {
    struct Message: Equatable, Sendable {
        let text: String
        let isError: Bool
    }

    /// The consent page to show in the web-view fallback.
    struct WebConnect: Identifiable, Equatable {
        let url: URL
        var id: String { url.absoluteString }
    }

    struct Service {
        var connect: @Sendable () async throws -> URL
        var callback: @Sendable (LodestarCallback) async throws -> LodestarStatus
        var disconnect: @Sendable () async throws -> LodestarStatus
        var importPreferences: @Sendable () async throws -> LodestarSeed
        var refresh: @MainActor () async -> Void
        var setStatus: @MainActor (LodestarStatus) -> Void
        var handle: @MainActor (any Error) -> String?
        /// Drops the leftover `fg_lodestar_flow` cookie after the web-view fallback.
        var clearFlowCookie: @MainActor () -> Void
    }

    private(set) var busy = false
    private(set) var message: Message?
    var webConnect: WebConnect?

    private let service: Service
    private let native: LodestarNativeConnect?
    private let callbackHost: String?

    init(service: Service, native: LodestarNativeConnect? = nil, callbackHost: String? = nil) {
        self.service = service
        self.native = native
        self.callbackHost = callbackHost
    }

    convenience init(app: AppState) {
        let api = app.api
        self.init(service: Service(
            connect: {
                let start = try await api.send(API.Lodestar.connect)
                guard let url = URL(string: start.url), url.scheme == "https" || url.scheme == "http" else {
                    throw APIError.decoding(detail: "Lodestar connect URL")
                }
                return url
            },
            callback: { try await api.send(API.Lodestar.callback($0)) },
            disconnect: { try await api.send(API.Lodestar.disconnect) },
            importPreferences: { try await api.send(LodestarFeatureAPI.importPreferences).seed },
            refresh: { [weak app] in await app?.refreshLodestar() },
            setStatus: { [weak app] in app?.setLodestar($0) },
            handle: { [weak app] in app?.handle($0) ?? $0.userMessage },
            clearFlowCookie: {
                let target = api.baseURL.appending(path: LodestarConnectLogic.callbackPath)
                for cookie in api.cookies.cookies(for: target) ?? [] where cookie.name == "fg_lodestar_flow" {
                    api.cookies.deleteCookie(cookie)
                }
            }),
            native: LodestarConnectLogic.nativeCallbackAvailable ? LodestarNativeConnect() : nil,
            callbackHost: api.baseURL.host())
    }

    /// "Connect Lodestar": start the flow, then the native session or the web-view fallback.
    func connect() async {
        guard !busy else { return }
        busy = true
        message = nil
        defer { busy = false }
        do {
            let url = try await service.connect()
            if let native, let callbackHost {
                try await finishNative(url, native: native, host: callbackHost)
            } else {
                webConnect = WebConnect(url: url)
            }
        } catch LodestarNativeConnect.Failure.closed {
            return
        } catch LodestarNativeConnect.Failure.couldNotStart {
            message = Message(text: LodestarConnectLogic.Outcome.failed.text, isError: true)
        } catch {
            await fail(error)
        }
    }

    private func finishNative(_ url: URL, native: LodestarNativeConnect, host: String) async throws {
        let callbackURL = try await native.authorize(url, callbackHost: host)
        switch LodestarConnectLogic.callback(from: callbackURL) {
        case .refused(let outcome):
            message = Message(text: outcome.text, isError: true)
        case .code(let callback):
            service.setStatus(try await service.callback(callback))
            message = Message(text: LodestarConnectLogic.Outcome.connected.text, isError: false)
        }
    }

    /// The web-view fallback ended: nil when the user closed it.
    func finishWeb(_ outcome: LodestarConnectLogic.Outcome?) async {
        webConnect = nil
        service.clearFlowCookie()
        guard let outcome else { return }
        message = Message(text: outcome.text, isError: outcome.isError)
        await service.refresh()
    }

    func importPreferences() async {
        guard !busy else { return }
        busy = true
        message = nil
        defer { busy = false }
        do {
            let seed = try await service.importPreferences()
            message = Message(text: LodestarConnectLogic.importedText(seed), isError: false)
        } catch {
            await fail(error)
        }
    }

    func disconnect() async {
        guard !busy else { return }
        busy = true
        message = nil
        defer { busy = false }
        do {
            service.setStatus(try await service.disconnect())
        } catch {
            await fail(error)
        }
    }

    private func fail(_ error: any Error) async {
        if let api = error as? APIError, api.isLodestarUnlinked { await service.refresh() }
        guard let text = service.handle(error) else { return }
        message = Message(text: text, isError: true)
    }
}
