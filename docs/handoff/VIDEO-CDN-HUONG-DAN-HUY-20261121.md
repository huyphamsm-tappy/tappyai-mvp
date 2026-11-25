# Phát clip bằng CDN của Google — việc còn lại cho anh Huy (21/11/2026)

Em (Claude) đã dựng xong phần tài nguyên trên Google Cloud (project `aerobic-lock-498409-u7`, vùng Singapore). Phần phân quyền (IAM) và DNS em không tự làm được (quy tắc an toàn), nên anh làm theo file này. Tổng cộng 3 việc: DNS (1 dòng), phân quyền (chạy 1 đoạn lệnh), biến Vercel.

## Đã tạo sẵn (em làm, không chứa bí mật)
| Tài nguyên | Tên |
|---|---|
| Bucket nguồn (riêng tư, chặn công khai) | `tappyai-video-src` |
| Bucket phát (riêng tư, chặn công khai) | `tappyai-video-del` |
| Địa chỉ IP tĩnh của CDN | `8.232.199.23` |
| Backend bucket có bật CDN + khóa ký cookie | `tappyai-video-del-bb` (khóa `tappyai-video-key-1`) |
| Bản đồ URL / chứng chỉ HTTPS tự quản lý / proxy / luật chuyển tiếp | `tappyai-video-map`, `tappyai-video-cert` (cho `media.tappyai.com`), `tappyai-video-proxy`, `tappyai-video-fr` |

Chi phí cố định: luật chuyển tiếp (bộ cân tải) khoảng 18 USD/tháng (ước tính), trừ vào khoản hỗ trợ của Google. Muốn dừng: xóa `tappyai-video-fr`.

## Việc 1 — DNS ở Cloudflare (1 dòng, làm ngay để chứng chỉ HTTPS được cấp)
Cloudflare, tên miền `tappyai.com`, DNS, thêm bản ghi:
- Loại **A**, Tên **media**, Địa chỉ IPv4 **8.232.199.23**
- **Proxy status: DNS only** (đám mây xám, KHÔNG để cam). Để cam thì chứng chỉ của Google không cấp được.
Chứng chỉ chuyển từ PROVISIONING sang ACTIVE trong vài phút đến vài chục phút sau khi DNS đúng.

## Việc 2 — Phân quyền (IAM): mở PowerShell, đã đăng nhập gcloud, dán từng khối
(Mỗi lệnh tự giải thích. Không có lệnh nào xóa gì.)

```powershell
$P = 'aerobic-lock-498409-u7'
$N = '1023373437508'
$WIF = "principal://iam.googleapis.com/projects/$N/locations/global/workloadIdentityPools/vercel-oidc/subject/owner:huyphamsm-tappys-projects:project:tappyai-mvp:environment:production"

# 1) CDN của Google được ĐỌC bucket phát (riêng tư)
gcloud storage buckets add-iam-policy-binding gs://tappyai-video-del --member="serviceAccount:service-$N@cloud-cdn-fill.iam.gserviceaccount.com" --role=roles/storage.objectViewer

# 2) Tài khoản cầu nối media (đã có) được ghi/đọc/xóa trên hai bucket mới
gcloud storage buckets add-iam-policy-binding gs://tappyai-video-src --member="serviceAccount:tappyai-media-bridge@$P.iam.gserviceaccount.com" --role=roles/storage.objectAdmin
gcloud storage buckets add-iam-policy-binding gs://tappyai-video-del --member="serviceAccount:tappyai-media-bridge@$P.iam.gserviceaccount.com" --role=roles/storage.objectAdmin

# 3) Tài khoản dịch vụ riêng cho Transcoder + cho Vercel (production) mượn danh nó
gcloud iam service-accounts create tappyai-transcoder-bridge --display-name="TappyAI transcoder bridge" --project=$P
gcloud projects add-iam-policy-binding $P --member="serviceAccount:tappyai-transcoder-bridge@$P.iam.gserviceaccount.com" --role=roles/transcoder.admin
gcloud iam service-accounts add-iam-policy-binding "tappyai-transcoder-bridge@$P.iam.gserviceaccount.com" --member=$WIF --role=roles/iam.workloadIdentityUser

# 4) Chính Transcoder được đọc file nguồn và ghi kết quả vào bucket nguồn
gcloud storage buckets add-iam-policy-binding gs://tappyai-video-src --member="serviceAccount:service-$N@gcp-sa-transcoder.iam.gserviceaccount.com" --role=roles/storage.objectAdmin

# 5) Tài khoản dịch vụ chỉ để xóa bộ nhớ đệm CDN khi gỡ clip
gcloud iam service-accounts create tappyai-cdn-invalidate --display-name="TappyAI CDN invalidate" --project=$P
gcloud projects add-iam-policy-binding $P --member="serviceAccount:tappyai-cdn-invalidate@$P.iam.gserviceaccount.com" --role=roles/compute.loadBalancerAdmin
gcloud iam service-accounts add-iam-policy-binding "tappyai-cdn-invalidate@$P.iam.gserviceaccount.com" --member=$WIF --role=roles/iam.workloadIdentityUser
```
Lưu ý: vai trò `compute.loadBalancerAdmin` ở mục 5 khá rộng (quản trị bộ cân tải). Nếu muốn chặt hơn, tạo vai trò riêng chỉ có quyền `compute.urlMaps.invalidateCache`. Em có thể viết lệnh đó nếu anh muốn.

Nếu lệnh 1 báo không tìm thấy tài khoản `cloud-cdn-fill`: nó chỉ xuất hiện sau khi CDN chạy lần đầu. Chờ chứng chỉ ACTIVE rồi chạy lại.

## Việc 3 — Biến môi trường Vercel (Production)
Thêm vào Vercel như hướng dẫn trước (Key, Value, chỉ Production):

| Key | Value |
|---|---|
| `GCS_VIDEO_SOURCE_BUCKET` | `tappyai-video-src` |
| `GCS_VIDEO_DELIVERY_BUCKET` | `tappyai-video-del` |
| `GCP_TRANSCODER_SERVICE_ACCOUNT` | `tappyai-transcoder-bridge@aerobic-lock-498409-u7.iam.gserviceaccount.com` |
| `GCP_CDN_SERVICE_ACCOUNT` | `tappyai-cdn-invalidate@aerobic-lock-498409-u7.iam.gserviceaccount.com` |
| `CDN_URL_MAP_NAME` | `tappyai-video-map` |
| `VIDEO_CDN_HOST` | `media.tappyai.com` |
| `VIDEO_CDN_KEY_NAME` | `tappyai-video-key-1` |
| `VIDEO_CDN_COOKIE_DOMAIN` | `.tappyai.com` |
| `VIDEO_CDN_SIGNING_KEY` | nội dung tệp `D:\TappyAI-review-artifacts\secrets\video-cdn-signing-key.txt` (một dòng 22 ký tự; mở bằng Notepad, copy, dán; đừng gửi cho ai kể cả em) |
| `VIDEO_SPEECH_TRANSCRIBE_ENABLED` | `true` |
| `EXPLORE_VIDEO_PIPELINE_ENABLED` | **để TRỐNG / chưa thêm** ở lần deploy đầu (xem dưới) |

**Khuyên: deploy lần đầu với `EXPLORE_VIDEO_PIPELINE_ENABLED` chưa đặt (đang tắt).** Phát clip chỉ thử thật được trên tên miền thật (cookie CDN không đặt được trên localhost). Sau khi deploy và DNS/chứng chỉ ACTIVE, anh thêm `EXPLORE_VIDEO_PIPELINE_ENABLED=true`, Redeploy, đăng một clip thử bằng tài khoản của anh và xem. Có sự cố thì xóa biến đó là tắt ngay, không ảnh hưởng phần còn lại.

Cũng nhớ: khóa OpenAI trên production phải thuộc dự án đã cho phép `omni-moderation-latest` và `gpt-4o-mini-transcribe` (anh đã làm cho khóa UAT; nếu production dùng cùng khóa/dự án thì xong).

Migration cơ sở dữ liệu production cho clip (20261111 đến 20261117) cần áp trước khi bật cờ.
