import SwiftUI

struct BookingFormView: View {
    let service: ServiceDetail
    let deps: AppDependencies

    @State private var date = Date()
    @State private var selectedTime: String?
    @State private var guests = 2
    @State private var name = ""
    @State private var phone = ""
    @State private var notes = ""
    @State private var loading = false
    @State private var done = false
    @State private var error: String?

    private let timeSlots = [
        "08:00", "09:00", "10:00", "11:00", "12:00",
        "13:00", "14:00", "15:00", "16:00", "17:00",
        "18:00", "19:00", "20:00", "21:00",
    ]

    private var showGuests: Bool {
        ["food", "hotel", "entertainment", "travel"].contains(service.type)
    }

    private var guestLabel: String {
        switch service.type {
        case "hotel": return "Số phòng"
        case "spa": return "Số người"
        default: return "Số khách"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            if done {
                successView
            } else {
                formView
            }
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Success

    private var successView: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 40))
                .foregroundStyle(.green)

            Text("Đặt chỗ thành công! 🎉")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(TappyColor.textPrimary)

            Text("Chúng tôi sẽ liên hệ xác nhận với bạn sớm nhất.")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center)

            VStack(alignment: .leading, spacing: 4) {
                Text(service.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(TappyColor.textPrimary)
                Text("📅 \(formattedDate)\(selectedTime.map { " lúc \($0)" } ?? "")")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                Text("👤 \(name) · 📞 \(phone)")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                if guests > 1 {
                    Text("👥 \(guests) khách")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.md)
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))

            ShareLink(item: shareText) {
                HStack(spacing: Spacing.sm) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 14))
                    Text("Chia sẻ xác nhận")
                        .font(.system(size: 14, weight: .bold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(TappyColor.primary)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var shareText: String {
        [
            "📋 Xác nhận đặt chỗ — TappyAI",
            "🏠 \(service.name)",
            "📅 Ngày: \(formattedDate)\(selectedTime.map { " lúc \($0)" } ?? "")",
            "👤 \(name) | 📞 \(phone)",
            guests > 1 ? "👥 Số khách: \(guests)" : nil,
            notes.isEmpty ? nil : "📝 \(notes)",
        ].compactMap { $0 }.joined(separator: "\n")
    }

    // MARK: - Form

    private var formView: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack(spacing: Spacing.sm) {
                Image(systemName: "calendar")
                    .font(.system(size: 15))
                    .foregroundStyle(TappyColor.primary)
                Text("Đặt chỗ ngay")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)
            }

            HStack(spacing: Spacing.sm) {
                fieldGroup("Họ tên *") {
                    TextField("Nguyễn Văn A", text: $name)
                        .font(.system(size: 13))
                        .textContentType(.name)
                }
                fieldGroup("Số điện thoại *") {
                    TextField("09xxxxxxxx", text: $phone)
                        .font(.system(size: 13))
                        .textContentType(.telephoneNumber)
                        .keyboardType(.phonePad)
                }
            }

            fieldGroup("Ngày *") {
                DatePicker("", selection: $date, in: Date()..., displayedComponents: .date)
                    .labelsHidden()
                    .datePickerStyle(.compact)
            }

            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("Giờ (tùy chọn)")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.xs) {
                        ForEach(timeSlots, id: \.self) { slot in
                            Button {
                                selectedTime = selectedTime == slot ? nil : slot
                            } label: {
                                Text(slot)
                                    .font(.system(size: 11, weight: .medium))
                                    .padding(.horizontal, Spacing.sm)
                                    .padding(.vertical, 6)
                                    .background(selectedTime == slot ? TappyColor.primary : TappyColor.surface)
                                    .foregroundStyle(selectedTime == slot ? .white : TappyColor.textSecondary)
                                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: Radius.lg)
                                            .stroke(selectedTime == slot ? TappyColor.primary : TappyColor.border, lineWidth: 1)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            if showGuests {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(guestLabel)
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    HStack(spacing: Spacing.md) {
                        Button { guests = max(1, guests - 1) } label: {
                            Text("−")
                                .font(.system(size: 16, weight: .bold))
                                .frame(width: 34, height: 34)
                                .background(TappyColor.surface)
                                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                        }
                        .buttonStyle(.plain)

                        Text("\(guests)")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(TappyColor.textPrimary)
                            .frame(width: 32)

                        Button { guests = min(20, guests + 1) } label: {
                            Text("+")
                                .font(.system(size: 16, weight: .bold))
                                .frame(width: 34, height: 34)
                                .background(TappyColor.surface)
                                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            fieldGroup("Ghi chú thêm") {
                TextField("Yêu cầu đặc biệt, dị ứng thực phẩm...", text: $notes, axis: .vertical)
                    .font(.system(size: 13))
                    .lineLimit(2...4)
            }

            if let error {
                Text(error)
                    .font(TappyFont.caption)
                    .foregroundStyle(.red)
            }

            Button(action: submit) {
                Group {
                    if loading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("✅ Xác nhận đặt chỗ")
                            .font(.system(size: 14, weight: .bold))
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(TappyColor.primary)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            }
            .buttonStyle(.plain)
            .disabled(loading)
            .opacity(loading ? 0.6 : 1)

            Text("Sau khi đặt, cơ sở sẽ liên hệ xác nhận với bạn")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
    }

    private func fieldGroup<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
            content()
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, 10)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.lg)
                        .stroke(TappyColor.border, lineWidth: 1)
                )
        }
    }

    private var formattedDate: String {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        return df.string(from: date)
    }

    private func submit() {
        let trimName = name.trimmingCharacters(in: .whitespaces)
        let trimPhone = phone.trimmingCharacters(in: .whitespaces)
        guard !trimName.isEmpty, !trimPhone.isEmpty else {
            error = "Vui lòng điền đầy đủ thông tin bắt buộc."
            return
        }
        error = nil
        loading = true

        Task {
            let request = PlacesService.CreateBookingRequest(
                serviceId: service.id,
                serviceName: service.name,
                serviceType: service.type,
                date: formattedDate,
                time: selectedTime,
                guests: guests,
                name: trimName,
                phone: trimPhone,
                notes: notes.isEmpty ? nil : notes,
                placeId: service.placeId.isEmpty ? nil : service.placeId
            )
            do {
                try await PlacesService(api: deps.api).createBooking(request)
                done = true
            } catch {
                self.error = "Có lỗi xảy ra. Vui lòng thử lại."
            }
            loading = false
        }
    }
}
