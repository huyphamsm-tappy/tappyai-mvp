import SwiftUI

/// "Chia tiền" — the bill of a group meal (web: `GroupBill.tsx`). Whoever paid enters the bill; it is
/// split equally among the people who share, personal items go to their owner, and everyone sees
/// what they owe the payer. The split is computed by the SERVER; this view only shows it.
struct GroupBillView: View {
    @ObservedObject var vm: GroupDetailViewModel
    @State private var editing = false
    @State private var confirmDelete = false

    // Form state (kept as text so a person can type freely).
    @State private var totalText = ""
    @State private var tipText = ""
    @State private var excluded: Set<String> = []
    @State private var items: [ItemRow] = []
    @State private var invalid = false

    struct ItemRow: Identifiable, Equatable {
        let id = UUID()
        var name = ""
        var amount = ""
        var forKey = ""
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("group.bill.title")
                .font(TappyFont.headline)
                .foregroundStyle(TappyColor.textPrimary)

            if editing {
                form
            } else if let bill = vm.bill {
                summary(bill)
            } else {
                TappyCard {
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("group.bill.intro")
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.textSecondary)
                        Button("group.bill.start") { startEditing(nil) }
                            .buttonStyle(.tappy(.primary))
                    }
                }
            }

            if let message = vm.errorMessage, !editing {
                Text(verbatim: message)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.danger)
            }
        }
    }

    // MARK: - Summary

    @ViewBuilder
    private func summary(_ bill: GroupBill) -> some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                if let settlement = bill.settlement, let payer = bill.payerName {
                    Text(String(format: NSLocalizedString("group.bill.paidBy", comment: ""),
                                payer, GroupMoney.text(bill.totalVnd + bill.tipVnd)))
                        .font(TappyFont.bodyEmphasis)
                        .foregroundStyle(TappyColor.textPrimary)
                    Text(String(format: NSLocalizedString("group.bill.shared", comment: ""),
                                GroupMoney.text(settlement.sharedVnd)))
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)

                    ForEach(settlement.shares, id: \.id) { share in
                        shareRow(share, payerKey: bill.payerKey, payer: payer, bill: bill)
                    }
                } else {
                    // The payer left the group: there is nothing to split until it is entered again.
                    Text("group.bill.needsUpdate")
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textSecondary)
                }

                HStack(spacing: Spacing.sm) {
                    if bill.isPayer || bill.settlement == nil {
                        Button("group.bill.edit") { startEditing(bill) }
                            .buttonStyle(.tappy(.secondary))
                    }
                    if bill.isPayer || vm.isCreator {
                        Button("group.bill.delete") { confirmDelete = true }
                            .buttonStyle(.tappy(.secondary))
                            .confirmationDialog(Text("group.bill.confirmDelete"), isPresented: $confirmDelete, titleVisibility: .visible) {
                                Button("group.bill.delete", role: .destructive) { vm.deleteBill() }
                                Button("common.cancel", role: .cancel) {}
                            }
                    }
                }
                .disabled(vm.isWorking)
            }
        }
    }

    @ViewBuilder
    private func shareRow(_ share: GroupBill.Share, payerKey: String?, payer: String, bill: GroupBill) -> some View {
        let isPayerRow = share.id == payerKey
        HStack(alignment: .firstTextBaseline) {
            if isPayerRow {
                Text(verbatim: share.name)
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
            } else if share.dueVnd > 0 {
                Text(String(format: NSLocalizedString("group.bill.owes", comment: ""), share.name, payer)
                     + " " + GroupMoney.text(share.dueVnd))
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textPrimary)
            } else {
                Text(String(format: NSLocalizedString("group.bill.nothing", comment: ""), share.name))
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
            }
            Spacer(minLength: Spacing.xs)
            if !isPayerRow && share.dueVnd > 0 {
                let isPaid = bill.paid[share.id] == true
                if bill.isPayer {
                    Button(LocalizedStringKey(isPaid ? "group.bill.unmark" : "group.bill.markPaid")) {
                        vm.markPaid(share.id, paid: !isPaid)
                    }
                    .font(TappyFont.caption)
                    .disabled(vm.isWorking)
                } else if isPaid {
                    Text("group.bill.paid")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
        }
    }

    // MARK: - Form

    private func startEditing(_ bill: GroupBill?) {
        totalText = bill.map { String($0.totalVnd) } ?? ""
        tipText = (bill?.tipVnd ?? 0) > 0 ? String(bill!.tipVnd) : ""
        excluded = Set(bill?.excluded ?? [])
        items = (bill?.items ?? []).map { ItemRow(name: $0.name, amount: String($0.amountVnd), forKey: $0.forId) }
        invalid = false
        vm.errorMessage = nil
        editing = true
    }

    @ViewBuilder
    private var form: some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                labelled("group.bill.total") {
                    TappyTextField(titleKey: "group.bill.total", text: $totalText).keyboardType(.numberPad)
                }
                labelled("group.bill.tip") {
                    TappyTextField(titleKey: "group.bill.tip", text: $tipText).keyboardType(.numberPad)
                }

                Text("group.bill.who")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                ForEach(vm.room?.people ?? []) { person in
                    Toggle(isOn: Binding(
                        get: { !excluded.contains(person.key) },
                        set: { shares in
                            if shares { excluded.remove(person.key) } else { excluded.insert(person.key) }
                        }
                    )) {
                        Text(verbatim: person.name)
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.textPrimary)
                    }
                }

                Text("group.bill.itemsTitle")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                ForEach($items) { $row in
                    VStack(alignment: .leading, spacing: Spacing.xxs) {
                        TappyTextField(titleKey: "group.bill.itemName", text: $row.name)
                        TappyTextField(titleKey: "group.bill.itemAmount", text: $row.amount).keyboardType(.numberPad)
                        Picker("group.bill.itemFor", selection: $row.forKey) {
                            ForEach(vm.room?.people ?? []) { p in Text(verbatim: p.name).tag(p.key) }
                        }
                        Button("common.delete", role: .destructive) { items.removeAll { $0.id == row.id } }
                            .font(TappyFont.caption)
                    }
                }
                if items.count < 20 {
                    Button("group.bill.addItem") {
                        items.append(ItemRow(forKey: vm.room?.people.first?.key ?? ""))
                    }
                    .font(TappyFont.callout)
                }

                if invalid || vm.errorMessage != nil {
                    Text(verbatim: vm.errorMessage ?? NSLocalizedString("group.bill.invalid", comment: ""))
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.danger)
                }

                HStack(spacing: Spacing.sm) {
                    Button("group.bill.save") { Task { await save() } }
                        .buttonStyle(.tappy(.primary))
                        .disabled(vm.isWorking)
                    Button("common.cancel") { editing = false; vm.errorMessage = nil }
                        .buttonStyle(.tappy(.secondary))
                }
            }
        }
    }

    @ViewBuilder
    private func labelled<Content: View>(_ key: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            Text(LocalizedStringKey(key))
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
            content()
        }
    }

    /// Builds the draft from the typed text; the server stays the judge of what is valid.
    private func save() async {
        guard let total = GroupMoney.parse(totalText), total >= 1 else { invalid = true; return }
        let tip = tipText.trimmingCharacters(in: .whitespaces).isEmpty ? 0 : GroupMoney.parse(tipText)
        guard let tip else { invalid = true; return }
        var parsed: [GroupBill.Item] = []
        for row in items {
            guard let amount = GroupMoney.parse(row.amount), amount >= 1, !row.forKey.isEmpty else { invalid = true; return }
            parsed.append(GroupBill.Item(name: row.name.trimmingCharacters(in: .whitespacesAndNewlines), amountVnd: amount, forId: row.forKey))
        }
        invalid = false
        let draft = GroupService.BillDraft(totalVnd: total, tipVnd: tip, items: parsed, excluded: Array(excluded))
        if await vm.saveBill(draft) { editing = false }
    }
}
