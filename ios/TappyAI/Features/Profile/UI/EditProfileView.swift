import SwiftUI
import PhotosUI

struct EditProfileView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter

    @State private var fullName = ""
    @State private var bio = ""
    @State private var email = ""
    @State private var avatarUrl = ""
    @State private var loading = true
    @State private var saving = false
    @State private var saved = false
    @State private var error: String?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var uploadingAvatar = false

    private var service: ProfileService { ProfileService(api: deps.api) }

    private var firstName: String {
        fullName.components(separatedBy: " ").last ?? email.components(separatedBy: "@").first ?? "T"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else {
                    avatarSection
                    if let error { errorBanner(error) }
                    formSection
                    saveButton
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("Chỉnh sửa hồ sơ")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadProfile() }
        .onChange(of: selectedPhoto) { _, newValue in
            if let newValue { Task { await uploadAvatar(newValue) } }
        }
    }

    // MARK: - Avatar

    private var avatarSection: some View {
        VStack(spacing: Spacing.sm) {
            ZStack(alignment: .bottomTrailing) {
                if let url = URL(string: avatarUrl), !avatarUrl.isEmpty {
                    AsyncImage(url: url) { img in
                        img.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: {
                        Color.gray.opacity(0.2)
                    }
                    .frame(width: 96, height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
                    .opacity(uploadingAvatar ? 0.6 : 1)
                } else {
                    RoundedRectangle(cornerRadius: Radius.xl)
                        .fill(LinearGradient(colors: [TappyColor.primary, TappyColor.primary.opacity(0.6)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 96, height: 96)
                        .overlay(
                            Text(String(firstName.prefix(1)).uppercased())
                                .font(.system(size: 36, weight: .bold))
                                .foregroundStyle(.white)
                        )
                        .opacity(uploadingAvatar ? 0.6 : 1)
                }

                if uploadingAvatar {
                    ProgressView()
                        .frame(width: 96, height: 96)
                }

                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(TappyColor.primary)
                        .clipShape(Circle())
                        .shadow(radius: 2)
                }
                .disabled(uploadingAvatar)
                .offset(x: 4, y: 4)
            }

            Text("Nhấn vào 📷 để đổi ảnh · Tối đa 3MB")
                .font(.system(size: 11))
                .foregroundStyle(TappyColor.textSecondary)
        }
    }

    // MARK: - Error Banner

    @ViewBuilder
    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: Spacing.sm) {
            Text("⚠️")
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(.red)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .background(Color.red.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(Color.red.opacity(0.2), lineWidth: 1)
        )
    }

    // MARK: - Form

    private var formSection: some View {
        VStack(spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: 6) {
                Text("EMAIL")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
                HStack {
                    Text(email)
                        .font(.system(size: 13))
                        .foregroundStyle(TappyColor.textSecondary)
                    Spacer()
                    Text("Không thể thay đổi")
                        .font(.system(size: 10))
                        .foregroundStyle(TappyColor.textSecondary)
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, 3)
                        .background(TappyColor.surface)
                        .clipShape(Capsule())
                }
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, 12)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.lg)
                        .stroke(TappyColor.border, lineWidth: 1)
                )
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("HỌ VÀ TÊN")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
                TextField("Nhập tên của bạn...", text: $fullName)
                    .font(.system(size: 13))
                    .textContentType(.name)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, 12)
                    .background(TappyColor.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.lg)
                            .stroke(TappyColor.border, lineWidth: 1)
                    )
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("GIỚI THIỆU BẢN THÂN")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(TappyColor.textSecondary)
                    Text("(tuỳ chọn)")
                        .font(.system(size: 10))
                        .foregroundStyle(TappyColor.textSecondary)
                }
                TextField("Vài dòng về bạn...", text: $bio, axis: .vertical)
                    .font(.system(size: 13))
                    .lineLimit(3...6)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, 12)
                    .background(TappyColor.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.lg)
                            .stroke(TappyColor.border, lineWidth: 1)
                    )
                Text("\(bio.count)/200")
                    .font(.system(size: 10))
                    .foregroundStyle(TappyColor.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .padding(Spacing.md)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Save Button

    private var saveButton: some View {
        Button(action: handleSave) {
            HStack(spacing: Spacing.sm) {
                if saving {
                    ProgressView().tint(.white)
                    Text("Đang lưu...")
                } else if saved {
                    Image(systemName: "checkmark")
                    Text("Đã lưu!")
                } else {
                    Image(systemName: "square.and.arrow.down")
                    Text("Lưu hồ sơ")
                }
            }
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(saved ? Color.green : TappyColor.primary)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        }
        .buttonStyle(.plain)
        .disabled(saving || saved || uploadingAvatar)
        .opacity((saving || uploadingAvatar) ? 0.6 : 1)
    }

    // MARK: - Actions

    private func loadProfile() async {
        do {
            let p = try await service.fetchProfile()
            fullName = p.fullName
            bio = p.bio
            email = p.email
            avatarUrl = p.avatarUrl
        } catch {}
        loading = false
    }

    private func handleSave() {
        saving = true
        error = nil
        Task {
            do {
                try await service.updateProfile(
                    fullName: fullName.trimmingCharacters(in: .whitespaces),
                    bio: String(bio.prefix(200))
                )
                saved = true
                try? await Task.sleep(nanoseconds: 1_200_000_000)
                router.pop(on: .profile)
            } catch {
                self.error = "Lưu thất bại"
            }
            saving = false
        }
    }

    private func uploadAvatar(_ item: PhotosPickerItem) async {
        uploadingAvatar = true
        error = nil
        defer { uploadingAvatar = false }

        guard let rawData = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: rawData),
              let data = image.jpegData(compressionQuality: 0.85) else {
            error = "Không đọc được ảnh"
            return
        }
        if data.count > 3 * 1024 * 1024 {
            error = "Ảnh tối đa 3MB"
            return
        }

        do {
            let boundary = UUID().uuidString
            var body = Data()
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"avatar\"; filename=\"avatar.jpg\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
            body.append(data)
            body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

            if let url = try await service.uploadAvatar(body, boundary: boundary) {
                avatarUrl = url
            }
        } catch {
            self.error = "Upload thất bại"
        }
    }
}
