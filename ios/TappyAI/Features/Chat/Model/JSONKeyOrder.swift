import Foundation

/// The order a JSON object's keys were WRITTEN in. `JSONDecoder` hands a keyed container's keys out of a dictionary, so the order the server
/// wrote (the cost lines of a plan: hotel first, then food…) is gone by the time a `Decodable` sees it; the web and Android keep it because
/// their parsers keep it. This reads the raw text instead. Pure, no allocation of the whole tree, and a malformed tail gives no keys.
enum JSONKeyOrder {

    /// The keys, in written order, of the object that is the value of the TOP-LEVEL key `name`. `[]` when the key is absent, its value is not an
    /// object, or the text is not well-formed up to the end of that object. A same-named key nested deeper is not looked at.
    static func keys(ofTopLevel name: String, in json: String) -> [String] {
        var scan = Cursor(bytes: Array(json.utf8))
        scan.skipSpace()
        guard scan.peek == 0x7B else { return [] }   // {
        scan.advance()
        while true {
            scan.skipSpace()
            guard scan.peek == 0x22, let key = scan.readString() else { return [] }
            scan.skipSpace()
            guard scan.peek == 0x3A else { return [] }   // :
            scan.advance()
            scan.skipSpace()
            if key == name { return scan.peek == 0x7B ? scan.objectKeys() : [] }
            guard scan.skipValue() else { return [] }
            scan.skipSpace()
            guard scan.peek == 0x2C else { return [] }   // ,
            scan.advance()
        }
    }

    private struct Cursor {
        let bytes: [UInt8]
        var i = 0

        init(bytes: [UInt8]) { self.bytes = bytes }

        var peek: UInt8? { i < bytes.count ? bytes[i] : nil }

        mutating func advance() { i += 1 }

        mutating func skipSpace() {
            while let c = peek, c == 0x20 || c == 0x0A || c == 0x0D || c == 0x09 { i += 1 }
        }

        /// At an opening quote: the decoded string (escapes resolved by `JSONSerialization`), `i` just past the closing quote.
        mutating func readString() -> String? {
            guard peek == 0x22 else { return nil }
            let start = i
            i += 1
            while i < bytes.count {
                if bytes[i] == 0x5C { i += 2; continue }   // backslash: skip the escaped byte
                if bytes[i] == 0x22 {
                    i += 1
                    let quoted: [UInt8] = [0x5B] + Array(bytes[start..<i]) + [0x5D]   // [ "..." ]
                    let decoded = (try? JSONSerialization.jsonObject(with: Data(quoted))) as? [String]
                    return decoded?.first
                }
                i += 1
            }
            return nil
        }

        /// Moves past one value of any kind. False when the text ends first.
        mutating func skipValue() -> Bool {
            guard let c = peek else { return false }
            if c == 0x22 { return readString() != nil }
            if c == 0x7B || c == 0x5B {
                var depth = 0
                while let d = peek {
                    if d == 0x22 { guard readString() != nil else { return false }; continue }
                    if d == 0x7B || d == 0x5B { depth += 1 }
                    if d == 0x7D || d == 0x5D { depth -= 1 }
                    i += 1
                    if depth == 0 { return true }
                }
                return false
            }
            // a number, true, false or null: up to the next delimiter
            let start = i
            while let d = peek, d != 0x2C, d != 0x7D, d != 0x5D, d != 0x20, d != 0x0A, d != 0x0D, d != 0x09 { i += 1 }
            return i > start
        }

        /// At `{`: the keys of this object in written order; `[]` when it is cut short.
        mutating func objectKeys() -> [String] {
            guard peek == 0x7B else { return [] }
            i += 1
            var keys: [String] = []
            while true {
                skipSpace()
                if peek == 0x7D { return keys }
                guard peek == 0x22, let key = readString() else { return [] }
                skipSpace()
                guard peek == 0x3A else { return [] }
                i += 1
                skipSpace()
                guard skipValue() else { return [] }
                keys.append(key)
                skipSpace()
                if peek == 0x2C { i += 1; continue }
                if peek == 0x7D { return keys }
                return []
            }
        }
    }
}
