import Foundation

/// One row of the by-item split (Web `Person` in src/app/(app)/split-bill/page.tsx).
struct SplitPerson: Identifiable, Equatable {
    let id: Int
    var name: String
    var amount: String
}

/// The by-item list rules, as pure functions so they can be unit-tested (no macOS UI needed).
enum SplitBillRows {
    /// Web `splitBill.personDefaultName`: "Người {n}" / "Person {n}".
    static func defaultName(_ n: Int) -> String {
        String(format: NSLocalizedString("splitbill.personDefaultName", comment: ""), n)
    }

    /// Web `fitPersons(n)`: resize to exactly `n` rows. Existing rows keep their names and amounts; growth appends default-named rows
    /// whose ids continue from the highest existing id (a row removed earlier can never be re-issued as a duplicate key);
    /// shrinkage drops rows from the end.
    static func fit(_ persons: [SplitPerson], to n: Int, name: (Int) -> String = defaultName) -> [SplitPerson] {
        let n = max(0, n)
        if n > persons.count {
            let maxId = persons.map(\.id).max() ?? 0
            var result = persons
            for i in 0..<(n - persons.count) {
                result.append(SplitPerson(id: maxId + i + 1, name: name(persons.count + i + 1), amount: ""))
            }
            return result
        }
        return Array(persons.prefix(n))
    }

    /// Web `addPerson`: one more row, id = highest id + 1, default name from the new row count.
    static func adding(to persons: [SplitPerson], name: (Int) -> String = defaultName) -> [SplitPerson] {
        fit(persons, to: persons.count + 1, name: name)
    }
}
