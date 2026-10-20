# Shopee vs TikTok Shop Seller Center — so sánh kiến trúc

> Tổng hợp từ [architecture-shopee.md](architecture-shopee.md) và
> [architecture-tiktok.md](architecture-tiktok.md) (quan sát ngày 2026-09-27).
> ⚠️ Độ phủ không đều: shop Shopee có dữ liệu thật đầy đủ (đơn hàng, ví, ads). Shop TikTok có
> **0 đơn / 0 giao dịch / chưa có ads**, nên phần Order/Finance/Ads của TikTok dựa trên request
> schema, bộ đếm, nhãn UI và tài liệu Partner API công khai.

---

## 1. Điểm chung: pattern chuẩn ngành, nên học

| # | Pattern | Shopee | TikTok | Vì sao là chuẩn |
|---|---|---|---|---|
| 1 | **Một gateway/BFF cùng origin**, sau nó là nhiều service theo domain | `banhang.shopee.vn/api/{order,pas,marketing,...}` | `seller-vn.tiktok.com/api/{fulfillment,v1/reverse,v1/pay,...}` | Cookie session dùng chung, không CORS; service tách độc lập phía sau |
| 2 | **Order và Return/Refund là 2 service, 2 state machine** | `/api/v3/order` ≠ `/api/v4/seller_center/return` | `/api/fulfillment/order` ≠ `/api/v1/reverse` | Refund có vòng đời riêng (thương lượng, bằng chứng, khiếu nại) và không làm bẩn trạng thái đơn |
| 3 | **Tiền theo đơn (escrow/statement) ≠ ví (balance/withdraw)** | `accounting/seller_income` ≠ `local_wallet` | `pay/statement` ≠ `pay/settlement` | Doanh thu "đang giữ" và "đã về ví" là hai khái niệm kế toán khác nhau |
| 4 | **Ví/số dư có lịch sử giao dịch phân loại theo type + hướng tiền** | `transaction_type` + `money_flow` (2 vào / 3 ra), `old/new_available` | "Tổng quyết toán = doanh thu + phí + điều chỉnh"; lịch sử *Rút / Thu nhập* | Ledger append-only, đối soát được |
| 5 | **Đếm theo tab bằng endpoint riêng, server tính** | `get_order_list_meta_v2`, `get_list_count` | `search_count` → `count_map`, `product/tab/count/get` | Badge số trên tab luôn đúng, không phải tải hết để đếm |
| 6 | **Hành động hợp lệ do server quyết định** | `btn_info_list`, `editable_list` | `action_list[]{action, style}`, `dashboard_columns[].button_action` | Một nguồn luật cho mọi client, đổi luật không cần ship app |
| 7 | **SLA/hạn xử lý là dữ liệu và là view hạng nhất** | `ship_by_date`, filter "hết hạn trong 1/2 ngày" | "Cần vận chuyển trong 24h", "Respond within 24h", "Tự huỷ trong 24h tới" | Seller làm theo việc cần làm, không theo danh sách thô |
| 8 | **Trạng thái sản phẩm: seller-controlled ≠ platform-controlled** | tab *Đang hoạt động / Vi phạm / Chờ duyệt / Chưa đăng*; `appeal_info` | `status` + `audit_status` + `product_status_view{main,sub,display}` | Seller tắt SP ≠ nền tảng đình chỉ SP; cần lý do + kháng nghị |
| 9 | **Giá/tiền không dùng float** | giá dạng string `"…"` | `amount` string trong object tiền | Tránh sai số làm tròn |
| 10 | **Khuyến mãi = thực thể có khung thời gian + trạng thái suy ra từ thời gian** | voucher `start/end_time`, `fe_status`; discount `time_status` | promotion `start/end_time`, tab *Sắp tới / Đang diễn ra / Đã kết thúc* | `upcoming/ongoing/ended` tính từ thời gian, chỉ lưu `deactivated` do người tắt |
| 11 | **Giới hạn số khuyến mãi chạy đồng thời** | `max_active_count`, `max_active_discounts_data[]` | (đếm theo `promotion_status` trong `get_summary`) | Chặn lạm dụng, giữ hiệu năng tính giá |
| 12 | **Giá khuyến mãi chiếu ngược vào sản phẩm** | `products[].promotion.ongoing_campaigns[]` | `early_bird_info`, `need_lock_price` | Danh sách SP hiển thị giá cuối mà không phải join khuyến mãi |
| 13 | **Cookie session + token/chữ ký bổ sung ở endpoint nhạy cảm** (không Bearer trên web) | `SPC_CDS` query + `x-sap-*`, `af-ac-enc-*` | `msToken`, `X-Bogus`, `X-Gnarly`, `tt-ticket-guard-*` | Bảo vệ theo mức độ nhạy cảm (đơn, tiền), không áp toàn cục |
| 14 | **Ads là một thế giới riêng** (service + envelope + ví/credit riêng) | `/api/pas/v1`, `ads_credit`, trừ ví `450 PAID_ADS_CHARGE` | `/oec_ads`, GMV Max, tài khoản thanh toán ads riêng | Vòng đời chiến dịch, báo cáo, ngân sách khác hẳn bán hàng |
| 15 | **Nhãn trạng thái đi qua hệ i18n key** | `transify_key` | `starling_key` | Trạng thái là **mã ổn định**, nhãn là chuyện hiển thị |

---

## 2. Điểm khác: lựa chọn riêng của từng nền tảng, cân nhắc trước khi copy

| Chủ đề | Shopee | TikTok | Gợi ý cho Tappy |
|---|---|---|---|
| **Envelope response** | 3 kiểu cùng tồn tại: `{code,message,user_message}`, `{error,error_msg,bff_meta}`, `{code,msg,debug_detail,validation_error_list}` | Gần như thống nhất `{code, message, data}` | **Theo TikTok** (một envelope), thêm `user_message` của Shopee |
| **Kiểu ID** | `number` (order_id, product_id) | `string` | **string/uuid**: JS an toàn với 64-bit |
| **Kiểu tiền** | number (VND nguyên) hoặc string giá; UI tự format | object `{amount:string, currency, symbol, format_with_symbol}` | Số nguyên VND trong DB, **object có format sẵn** ở API |
| **Enum** | Số (order/wallet/product) + **string cho Ads** (`ongoing/paused/ended`) | Số + key dạng string cho component reverse (`RefundStatus_REFUNDED`) | **Enum string** (`'pending'`, `'confirmed'`): đọc log/DB dễ, Postgres enum/check constraint |
| **Nhãn trạng thái** | Backend trả **chuỗi đã localize** (`status_info.status = "Chờ lấy hàng"`) | Backend trả `starling_key`, FE dịch | Trả **mã**, client dịch (Tappy đã có `useTranslation`) |
| **Cách lấy danh sách đơn** | 3 bước: **index (chỉ id) → card → buttons** | Một bước `order/list` (search_condition + cursor) | **Một bước** ở quy mô Tappy |
| **Order vs Fulfillment** | Tách `order` và `shipment` | Chung `/api/fulfillment/order` | Không có shipment, gộp vào order |
| **Mô hình Return** | Một **enum 18 trạng thái** + case/flow tab + nhiều filter số | **Nhiều trục song song** (refund / parcel / negotiate / dispute / appeal / intervention) | **Đa trục nhưng tối giản**: `refund_status` + (sau này) `dispute_status` |
| **Dashboard "việc cần làm"** | Bộ đếm + filter riêng | **Ô dashboard mang sẵn `search_param`** | **Theo TikTok** |
| **Pagination** | 5–6 kiểu (page, offset, cursor, sentinel, token, cursor+sort) | `pagination_type` là tham số; offset hoặc cursor hai chiều | **Một kiểu: cursor** (`next_cursor`, `has_more`) cho mọi list |
| **Seller context** | Cookie + `SPC_CDS` query | Query `oec_seller_id/seller_id/shop_region` + header region | Suy ra từ session (Supabase JWT → merchant_id qua RLS), **không** nhận từ query |
| **Tồn kho** | seller/shopee/in-transit stock | `seller_quantity{total, open, commit}` (có "đã giữ chỗ") | Nếu có tồn kho: học **`commit` (đã giữ chỗ)** của TikTok cho voucher/slot booking giới hạn |
| **Kênh bán** | Một kênh | Đa kênh (`sale_platform_products[]`) | Không cần |
| **Chu kỳ quyết toán** | Escrow theo đơn, nhả khi người mua xác nhận/tự động; Quick Funds trả sớm | Chu kỳ theo **chất lượng seller** (`settle_period_type`) | Cố định T+N, cấu hình được |
| **Ads** | PAS: bidding, ROI target, rebate, ads credit | GMV Max (tự động theo ROI), hệ TikTok Ads | Chưa làm; nếu làm thì "boost" giá cố định |
| **Micro-frontend** | SPA điều hướng nội bộ | Module federation, **mỗi mục một page load** | Không liên quan backend. Next.js hiện tại ổn |

---

## 3. Đề xuất data model tối giản cho Tappy Merchant Center

Rút ra từ các điểm chung ở §1 và đã **bỏ** các phần ở §2 mà Tappy chưa cần. Đây là **khung để
thảo luận**, không phải spec đã duyệt. Tappy commerce hiện là FUTURE
(`docs/design/V3_PRODUCT_STRUCTURE.md`).

```
merchant_listing (sản phẩm/dịch vụ/deal)
  status            : draft | active | inactive                      # seller điều khiển
  moderation_status : pending | approved | rejected | suspended      # Tappy điều khiển (+ reason, appeal_note)
  visibility        : suy ra = status=active ∧ moderation=approved ∧ trong giờ mở cửa
  price_vnd         : bigint

promotion (voucher/deal)
  start_at, end_at, discount_type(percent|amount), value, min_order_vnd, max_discount_vnd,
  usage_limit, per_user_limit, used_count
  deactivated_at    : nullable                                       # chỉ lưu thao tác tắt
  → display_state   : upcoming | ongoing | ended | deactivated        # TÍNH, không lưu
  max_active_per_merchant (config)

order / booking
  pending_payment ──► paid ──► confirmed ──► fulfilled(redeemed/served) ──► completed
        │               │          │
        └► expired      └► cancelled_by_buyer | cancelled_by_merchant | auto_cancelled (quá SLA xác nhận)
  confirm_by        : timestamptz                                    # SLA là dữ liệu
  allowed_actions[] : server trả về theo status + vai trò            # server-driven

refund_request (bảng riêng, không nhét vào order.status)
  requested ──► approved ──► refunded
            └─► rejected (──► escalated → resolved_buyer | resolved_merchant  — để sau)

merchant_ledger (append-only)
  type      : ORDER_INCOME | PLATFORM_FEE | REFUND_DEDUCT | ADJUSTMENT_ADD | ADJUSTMENT_DEDUCT | PAYOUT
  direction : in | out
  amount_vnd, balance_after_vnd, ref_type(order|refund|payout|adjustment), ref_id, created_at
  → số dư = SUM theo ledger; không có cột balance bị UPDATE

payout: requested ──► processing ──► paid | failed(reason)  (SePay/VietQR, T+N cố định)
```

**API conventions đề xuất:** một envelope `{code, message, user_message, data}` · list luôn trả
`{items, next_cursor, has_more}` · `GET /merchant/counts?keys=a,b,c` → `{counts:{...}}` cho badge
tab · endpoint "việc cần làm" trả sẵn `filter` cho từng ô · tiền trả dạng
`{amount_vnd, formatted}` · enum trạng thái là string ổn định, client tự dịch.

**Cân nhắc trước khi copy:**
- **Đừng copy luồng index → card → buttons của Shopee**: đó là tối ưu cho hàng triệu đơn/shop.
- **Đừng copy enum 18 trạng thái return**: bắt đầu với 3 trạng thái, thêm trục dispute khi thật sự
  có tranh chấp.
- **Đừng copy chữ ký chống bot / fingerprint**: dùng Supabase auth + RLS + rate limit trước.
- **Nên copy ngay:** ledger append-only, tách refund khỏi order, server-driven actions, đếm tab
  phía server, trạng thái khuyến mãi suy ra từ thời gian, SLA là dữ liệu.

---

**ĐÃ KIỂM TRA LẦN CUỐI 2026-09-27 20:56 (+07:00)**
- Đã rà lại cả 3 file: không có token, cookie, session id, ID đơn/sản phẩm thật, tên shop, SĐT,
  email, địa chỉ, số tài khoản hay mã vận đơn.
- Đã làm mờ 3 số liệu thật hoặc có thể là thật: ví dụ giá trong `architecture-shopee.md` (mục
  Product), số đơn của shop Shopee trong `comparison.md` (đầu file), số sản phẩm vi phạm của shop
  TikTok trong `architecture-tiktok.md` (đầu file).
- Không còn python server hay listener nào trên port 8765. Không có thao tác nào đang chạy trên 2
  tài khoản. Trình duyệt không được mở lại kể từ lệnh DỪNG. Riêng script inject và sessionStorage
  trong tab chưa được kiểm chứng lại, vì kiểm tra thì phải mở trình duyệt.
- 3 file ở trạng thái untracked. Chưa commit, chưa push.
