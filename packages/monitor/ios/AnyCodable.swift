import Foundation

/**
 Sendable, Codable wrapper for `string | number | boolean` JSON primitives.

 The schema codegen emits `AnyCodable` for any TypeScript field whose type
 is `string | number | boolean` (the `JsonPrimitive` shape used in custom
 event attributes). This file is hand-rolled and lives next to the
 generated code so the package compiles standalone — there is no
 dependency on a third-party AnyCodable library.

 Only the three primitive variants are supported. Anything outside that
 set decodes as `.string` after `String(describing:)` so we never throw
 inside the SDK.
 */
public enum AnyCodable: Codable, Equatable, Sendable {
  case string(String)
  case number(Double)
  case bool(Bool)

  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if let b = try? container.decode(Bool.self) {
      self = .bool(b)
      return
    }
    if let d = try? container.decode(Double.self) {
      self = .number(d)
      return
    }
    if let s = try? container.decode(String.self) {
      self = .string(s)
      return
    }
    self = .string("")
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .string(let s): try container.encode(s)
    case .number(let d): try container.encode(d)
    case .bool(let b):   try container.encode(b)
    }
  }
}
