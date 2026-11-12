import Foundation
@testable import Forage

/// Wraps `data` JSON in the success envelope and decodes it the way the app does.
func decodeEnvelope<T: Decodable>(_ dataJSON: String, as type: T.Type, status: Int = 200) throws -> T {
    let body = #"{"ok":true,"data":"# + dataJSON + "}"
    return try ResponseDecoder.decode(T.self, data: Data(body.utf8), status: status)
}

/// Encodes a value and parses it back to a dictionary for key assertions.
func jsonObject<T: Encodable>(_ value: T) throws -> [String: Any] {
    let data = try JSONCoding.encoder.encode(value)
    return try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) as? [String: Any] ?? [:]
}

func date(_ s: String) -> LocalDate { LocalDate(s)! }

/// API fixtures shaped like the server's answers (docs/api.md).
enum Fixture {
    static let placeID = "6f1c2a3e-1b2c-4d5e-8f90-123456789abc"
    static let otherPlaceID = "7a2b3c4d-1b2c-4d5e-8f90-123456789abc"

    static func place(id: String = placeID, name: String = "Ramen Nagi", priceLevel: String = "2",
                      tags: String = #"{"dishes":["tonkotsu"],"occasions":["casual","night_out"],"brand":"x","stars":4}"#) -> String {
        """
        {"id":"\(id)","source":"osm","sourceId":"node/123456","googlePlaceId":null,"name":"\(name)",
         "lat":37.4443,"lng":-122.1611,"address":"541 Bryant St","city":"Palo Alto","country":"US",
         "cuisine":["ramen","japanese"],"priceLevel":\(priceLevel),"tags":\(tags),"updatedAt":1762000000000}
        """
    }

    static let visit = """
    {"id":"11111111-2222-3333-4444-555555555555","userId":"u1","placeId":"\(placeID)","visitedOn":"2026-11-10",
     "reaction":"loved","occasion":"night_out","dishes":["tonkotsu"],"note":null,"createdAt":1762800000000}
    """

    static let score = #"{"userId":"u1","placeId":"\#(placeID)","occasion":"casual","score":8.4,"updatedAt":1762800000000}"#
}
