import Foundation

enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

/// Request timeouts per route class (api.md §0, "Timeouts"). No route sets `maxDuration`,
/// so these are estimates of the slowest upstream plus a margin.
enum Timeouts {
    /// Account, visits, comparisons, want, taste GET/PUT, feedback, Lodestar status.
    static let standard: TimeInterval = 30
    /// `/api/places`, `/api/places/:id`, `/api/explore/geocode` (Overpass may try two mirrors).
    static let places: TimeInterval = 45
    /// `/api/recs`, `/api/explore/recs`, Lodestar trips and add (nearby lookup plus an AI rerank).
    static let recs: TimeInterval = 90
    /// `/api/recs/ask`, `/api/taste/refresh`, `/api/ai/*/complete`.
    static let ai: TimeInterval = 150
}

/// One API call: where it goes, what it sends and what `data` decodes to.
/// Build these with the factories in `API` (Endpoints*.swift), not by hand.
struct Endpoint<Response: Decodable & Sendable>: Sendable {
    let method: HTTPMethod
    let path: String
    var query: [URLQueryItem] = []
    var body: (any Encodable & Sendable)?
    var timeout: TimeInterval = Timeouts.standard

    /// Builds the URLRequest. Never sets `Origin` (the server refuses cross-site writes that carry one).
    /// Non-GET requests without a body send `{}`, because the server rejects an empty body as "not JSON".
    func makeRequest(baseURL: URL) throws(APIError) -> URLRequest {
        guard var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false) else {
            throw .invalidRequest(detail: "Bad path \(path)")
        }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw .invalidRequest(detail: "Bad query for \(path)") }

        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if method != .get {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encodedBody()
        }
        return request
    }

    private func encodedBody() throws(APIError) -> Data {
        guard let body else { return Data("{}".utf8) }
        do {
            return try JSONCoding.encoder.encode(body)
        } catch {
            throw .invalidRequest(detail: "Couldn't encode body for \(path): \(error)")
        }
    }
}

/// Shared coders. The API is camelCase throughout; models spell out keys only where they differ.
enum JSONCoding {
    static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return encoder
    }

    static var decoder: JSONDecoder { JSONDecoder() }
}

/// For routes whose `data` is `{}` or ignored.
struct EmptyResponse: Codable, Sendable, Equatable {}
