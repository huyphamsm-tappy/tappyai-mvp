# TikTok Shop Seller Center (VN) — kiến trúc API & data model (reverse-engineered)

> **Nguồn:** quan sát traffic XHR/fetch trên `seller-vn.tiktok.com` ngày 2026-09-27, bằng tài
> khoản seller thật đã đăng nhập (chỉ xem, không thao tác ghi). Không dùng file HAR: bộ ghi thụ
> động chỉ lưu **tên field + kiểu dữ liệu + enum ngắn**. Token, cookie, ID thật, tên/SĐT/địa chỉ,
> số tài khoản và số tiền đều **không được lưu**.
>
> **Phạm vi đã xem:** Quản lý đơn hàng (7 tab + bộ lọc) · Trả hàng & hoàn tiền (5 tab) · Quản lý
> sản phẩm (7 tab) · Khuyến mãi (5 tab trạng thái) · Giao dịch (đã/sẽ quyết toán) · Số tiền rút ·
> Giấy tờ thuế · Quảng cáo cửa hàng.
>
> ⚠️ **Giới hạn dữ liệu, đọc trước:** shop TikTok này **có 0 đơn hàng, 0 yêu cầu trả hàng, 0 giao
> dịch quyết toán và chưa có tài khoản quảng cáo**. Hệ quả:
> - Order/Return/Finance: có đủ **request schema, cấu trúc phân trang, bộ đếm theo tab và nhãn
>   UI**, nhưng **không có** schema phần tử của danh sách đơn/giao dịch (mảng rỗng).
> - Ads: chỉ thấy trang giới thiệu GMV Max. Tôi **không** bấm "Bắt đầu" vì sẽ tạo tài khoản.
> - Product (một số sản phẩm ở tab "Cần chú ý") và Promotion (các chương trình đã kết thúc) có dữ liệu thật.
>
> Chỗ nào điền từ **tài liệu công khai TikTok Shop Partner API** (kiến thức chung, không quan sát
> ở đây), tôi đánh dấu **[public API]**.

---

## Service boundaries (theo domain/path)

Web seller center là **micro-frontend** (module federation "island components" tải từ
`lf16-scmcdn.oecstatic.com`) và gọi API qua **một origin** `seller-vn.tiktok.com`. Khác Shopee:
**envelope thống nhất** `{code, message, data}` ở hầu hết service.

| Nhóm path | Service (suy ra) | Ví dụ endpoint |
|---|---|---|
| `/api/fulfillment/order/*` | **Order + Fulfillment** (chung 1 service) | `POST order/list`, `POST order/search_count`, `POST order/export_record/get` |
| `/api/v1/reverse/*` | **Reverse (Return/Refund/Cancel/Dispute)** | `POST reverse/component/orders/list`, `POST reverse/dashboard/get`, `POST reverse/orders/get_export_history` |
| `/api/v1/product/*`, `/api/v1/seller/global_product_permission/*` | **Product** | `GET product/local/products/list`, `GET product/tab/count/get` |
| `/api/v1/promotion/*`, `/api/v1/insights/seller/shop/promotion/*` | **Promotion** + analytics riêng | `POST promotion/list`, `GET promotion/get_summary`, `POST insights/.../promotion/period/stats` |
| `/api/v1/pay/statement/*`, `/api/v1/pay/settlement/*`, `/api/v2/pay/settlement/*`, `/api/v1/seller/settlement/*` | **Pay: Statement (quyết toán) + Settlement (số dư/rút)** | `GET pay/statement/order/list`, `GET pay/statement/stat/info`, `GET pay/settlement/balance/get`, `GET pay/settlement/withdraw/rules/get` |
| `/api/v1/tax/*` | **Tax/Invoice** | `GET tax/invoice/search`, `GET tax/tax_info/get` |
| `/oec_ads/pa/api/*`, route `/ads-creation/*` | **Ads** (hệ thống quảng cáo riêng, gắn TikTok Ads) | `GET oec_ads/pa/api/spider/query_payment_account/` |
| `/api/v1/affiliate/*`, `/api/v1/oec/affiliate/*` | Affiliate (creator) | `affiliate/account/info_v2`, `affiliate/config` |
| `/api/v1/seller/message/*`, `/api/v1/proxy/seller/helpdesk/*`, `/api/v1/shop_im/*` | Thông báo, CSKH, IM | (bỏ qua) |
| `/api/v1/arch/config_center_gw/*` | **Remote config center** | `get_config?app_name&config_name&domain_name` |
| `starling-sg.tiktokv.com`, `starling-sg.byteoversea.com` | **i18n (Starling)** | FE render qua `starling_key` |
| `api-verification.tiktokshop.com` | Captcha / xác minh | `captcha/get` |
| `/passport/*` | Session (heartbeat `token/beat`) | |
| `mssdk-sg.tiktok.com`, `tsr16-...tiktok.com/api/recording`, `/api/v1/bs/rt`, feelgood | Bảo mật, session replay, khảo sát | (bỏ qua) |

**Kết luận về boundary:**
- **Order và Fulfillment chung một service** (`/api/fulfillment/order/*`). Shopee thì tách
  order/shipment.
- **Reverse là service riêng**, mô hình "component search": mỗi tiêu chí lọc là một *component*
  kèm bộ đếm.
- **Pay chia 2:** *Statement* (bảng quyết toán theo đơn/kỳ) và *Settlement* (số dư, tài khoản
  nhận tiền, rút). Tương đương cặp Income ↔ Wallet của Shopee.
- **Ads nằm ngoài** seller center core (`/oec_ads`, gắn tài khoản TikTok Ads / GMV Max).

---

## Data model: Product

**Endpoint tiêu biểu**
- `GET /api/v1/product/local/products/list?tab_id=&page_number=&page_size=&product_sort_fields=&product_sort_types=&sku_number=&is_need_target_stock=...`
- `GET /api/v1/product/tab/count/get` → `data[]{tab_id: number, count: string}`

**Cấu trúc `data.products[]` (quan sát, rút gọn)**
```
product_id: string                         # ID dạng string (Shopee dùng number)
product_name: string
image: { uri, url_list[], thumb_url_list[], width, height }
categories[]: { id, parent_id: string, level: 1|2|3, is_leaf: bool, name, name_key }
brand: { id, name: string, is_authorized: bool }
price_range: { min_sale_price, max_sale_price, min_sale_price_display, max_sale_price_display: string }
sale_price_ranges[]: { region, price_range: string }
skus[]:
  id, seller_sku, global_sku_id: string
  base_price: { region, currency, sale_price, sale_price_display, list_price, starting_bid_price: string }
  region_prices[], quantities[], properties[]
  sku_status_info.status: number            # quan sát 0
  sku_low_stock.is_out_of_stock: bool
  sku_sold_out_detail: { reason: number (quan sát 0, 5), starling_key }
  pre_order_status, pre_order_ship_day: number
  combo_sku_info: {...}
sale_properties[]: { id, name, is_enum }    # thuộc tính biến thể
quantity: { total_available_stock,
            seller_quantity: { total_quantity, open_quantity, commit_quantity },   # tồn / còn bán / đã giữ chỗ
            platform_quantity }
product_status: number                      # quan sát 3
audit_status: number                        # quan sát 3
product_status_view: { product_main_status, product_sub_status, product_display_status: number }
                                            # quan sát main=3, sub=2, display=3 (các SP bị vi phạm)
sale_platform_products[]: { sale_platform, product_status, audit_status,
                            product_status_view{...}, suspend_reason{...} }   # trạng thái THEO TỪNG KÊNH BÁN
submit_sale_platforms: number[]
suspend_reason.deactivate_reasons[]: { reason{...}, sub_reasons[], field }
visible_status: { is_visible, reasons[]{key, name} }
traffic_control_status: number              # giới hạn hiển thị
action_list[]: { action, style: number }    # hành động hợp lệ, server-driven
edit_time: { create_time, update_time, delete_time, freeze_time, draft_create_time: number }
package_weight: string, package_length/width/height: number
product_sales: { sales, total_sales }, is_out_of_stock, has_revision_draft: bool
page_number, page_size, total_product_count: number
```

**Status**
- Tab UI: *Tất cả · Trên kệ · Đang xem xét · Cần chú ý · Đã vô hiệu hoá · Bản nháp · Đã xoá*.
  Sub-filter của "Cần chú ý": *Nền tảng đã đình chỉ · Nền tảng đã đóng băng · Bị từ chối · Giảm khả
  năng hiển thị*.
- **Mô hình trạng thái 3 tầng**: `main_status` (nhóm lớn, khớp tab) / `sub_status` (lý do cụ thể,
  khớp sub-filter) / `display_status` (hiển thị cho người mua). Thêm `audit_status` (duyệt) tách
  riêng.
- **Trạng thái theo kênh bán** (`sale_platform_products[]`): một sản phẩm có thể "live" ở kênh này
  và "suspended" ở kênh khác (TikTok Shop / Tokopedia; reverse filter cũng có `OrderChannel_Toko`).
- State machine (suy ra từ tab): `draft → reviewing(audit) → live ⇄ deactivated(seller tắt)`;
  `live → suspended/frozen/rejected/visibility_limited (nền tảng)`; `draft/reviewing → rejected`;
  `* → deleted`. Có thể có **revision draft** (sửa bản đang live mà chưa ảnh hưởng bản live).
- **[public API]** Product status công khai: `DRAFT, PENDING, FAILED, ACTIVATE, SELLER_DEACTIVATED,
  PLATFORM_DEACTIVATED, FREEZE, DELETED`.

---

## Data model: Order (kèm state machine)

**Endpoint tiêu biểu**
- `POST /api/fulfillment/order/list`
  - Request (quan sát):
    ```
    search_condition: { condition_list: { search_tab: { value: string[] },
                                          abnormal_pkg_tag: { value: string[] }, ... } }
    offset: number, count: number, sort_info: string,
    search_cursor: string, pagination_type: number (quan sát 0)
    ```
  - Response (quan sát, danh sách rỗng): `offset, count, total_count, has_more,
    search_next_has_more, search_previous_has_more, default_search_create_time{time_start, time_end}`
- `POST /api/fulfillment/order/search_count`: request `search_key_list: string[]`, response
  `count_map{ "101", "102", "1100", "1200", "3100", "3200", "3300": number }`. **Một lần gọi đếm
  nhiều tab**, key là mã tab/bộ lọc.

**Tab & bộ lọc (quan sát UI)**
- Tab: *Tất cả · Cần gửi · Đã gửi · Đã hoàn tất · Chờ xử lý · Đã huỷ · Giao không thành công*.
  URL tab "Cần gửi" = `tab=to_ship&order_status[]=1`.
- Filter "Trạng thái đơn hàng" (ở tab Tất cả): *Đang chờ vận chuyển · Đang chờ lấy hàng · Đang
  trung chuyển · Đã giao hàng*.
- Bộ lọc khác: thời gian tạo, cách giao hàng, tên khách, sản phẩm/SKU, phương thức vận chuyển,
  **phương thức huỷ**, nhà cung cấp dịch vụ vận chuyển, nội dung đơn, **kết hợp/tách đơn**, nguồn
  đơn, nhà sáng tạo (affiliate), tên kho, ghi chú người bán, **buổi LIVE**, kênh đặt hàng.
  → Đơn gắn với **nguồn nội dung** (LIVE, video, creator). Đây là đặc thù social commerce.
- Dashboard đầu trang: *Cần vận chuyển trong 24 giờ · Tự động huỷ trong 24 giờ tới · Quá hạn vận
  chuyển · Huỷ · Vấn đề giao hàng/kho vận · Đã yêu cầu trả hàng/hoàn tiền*. Tức là **SLA là
  view hạng nhất**.

**State machine đơn hàng**

Không quan sát được enum trên đơn thật (0 đơn). Tổng hợp từ tab UI + **[public API]**:
```
UNPAID(100) ──► ON_HOLD(105)* ──► AWAITING_SHIPMENT(111) ──► AWAITING_COLLECTION(114) ──► IN_TRANSIT(121) ──► DELIVERED(122) ──► COMPLETED(130)
   │                                 │  (PARTIALLY_SHIPPING 112 khi tách kiện)                    │
   └──────────────► CANCELLED(140) ◄─┘  (huỷ bởi người mua/người bán/hệ thống; auto-cancel khi quá SLA)  └──► giao thất bại → Reverse
```
`*ON_HOLD`: thời gian chờ ngắn sau khi thanh toán để người mua còn huỷ được, trước khi seller xử
lý **[public API]**.
Ánh xạ UI (suy ra): *Cần gửi* ≈ AWAITING_SHIPMENT (+sub: chờ vận chuyển / chờ lấy hàng) · *Đã gửi*
≈ AWAITING_COLLECTION/IN_TRANSIT · *Đã hoàn tất* ≈ DELIVERED/COMPLETED · *Đã huỷ* ≈ CANCELLED ·
*Giao không thành công* = nhánh reverse.

### Reverse (Return/Refund/Cancel/Dispute)
- `POST /api/v1/reverse/component/orders/list`
  - Request: `search_condition{ tab{str_value_list[]}, order_sort_comp{str_value_list[]} }`,
    `pagination_type, offset, count, component_version`
  - Response: `total_count`, **`search_component_overview`**: map `{component_value → {order_count}}`,
    cùng các cờ `show_policy_entry, show_charge_back_entry, show_reverse_settings_entry`.
- `POST /api/v1/reverse/dashboard/get` → `dashboard_columns[]{column_id, title_text, order_count,
  description{message_level, items[]}, button_action, button_text, search_param{search_condition,
  sort_info}}`. **Mỗi ô dashboard mang sẵn `search_param`**: bấm vào là ra danh sách đã lọc.

**Từ vựng trạng thái reverse (quan sát: key của `search_component_overview`):**
| Component | Giá trị |
|---|---|
| tab | `800` (Đang chờ bạn), `900`, … `1100` (tab code) |
| **request_type** | `return` · `refund_only` · `exchange` · `replace` |
| **RefundStatus** | `REFUNDING` · `REFUNDED` |
| **ParcelStatus** (hàng trả) | `AWAITING_FOR_CUSTOMER_DISPATCH` · `CUSTOMER_DISPATCH` · `OUT_OF_DELIVERY` · `PARCEL_FAILED_DELIVERY` · `PARCEL_RECEIVED_AWAITING_FOR_REFUND` |
| **NegotiateWithBuyer** | `NEGOTIATE_APPLYING` · `NEGOTIATE_SUCCESS` · `NEGOTIATE_CLOSED` |
| **DisputeStatus** | `IN_PROCESS` · `support_for_customer` · `support_for_seller` (+ `to_respond_dispute`) |
| **AppealStatus** | `to_appeal` · `inProgress` · `success` · `failed` |
| **PlatformIntervention** | `AUTO_APPROVED` · `Platform_TakeOver` |
| **CompensationStatus** | `inProgress` · `completed` |
| **Urgent** | `TO_RESPOND_WITHIN_24_HOURS` |
| WarehouseType | `SELLED_WAREHOUSE` · `WAREHOUSE_FULFILLED_BY_TIKTOK` |
| OrderChannel | `SHOP` · `Toko` |
| OrderFlag | `ADDED_FLAG` · `NO_FLAG` |

Tab UI: *Tất cả · Đang chờ bạn · Đang chờ TikTok Shop/khách hàng · Đã khiếu nại/tranh chấp ·
Đã giải quyết*; sub: *Trả hàng và hoàn tiền · Chỉ hoàn tiền · Khiếu nại · Tranh chấp · Đang thương
lượng*. Dashboard: *Respond within 24 hours · Auto-approved (last 7d) · Can be appealed · Disputes
awaiting response*.

**State machine reverse (suy ra):**
```
REQUESTED (return | refund_only | exchange | replace)
   ├─► [seller 24h SLA] ──► APPROVED ──► (return) AWAITING_BUYER_DISPATCH → BUYER_DISPATCHED → IN_TRANSIT
   │                                         → RECEIVED_AWAITING_REFUND ──► REFUNDING ──► REFUNDED
   │                        └─ quá hạn ─► AUTO_APPROVED (nền tảng tự duyệt)
   ├─► REJECTED ──► buyer DISPUTE ──► IN_PROCESS ──► support_for_customer | support_for_seller
   ├─► NEGOTIATING (APPLYING → SUCCESS | CLOSED)
   └─► PLATFORM_TAKEOVER
seller APPEAL (sau quyết định): to_appeal → inProgress → success | failed ; COMPENSATION inProgress → completed
```
Trạng thái **song song theo nhiều trục** (refund, parcel, negotiate, dispute, appeal), không phải
một enum tuyến tính.

---

## Data model: Finance/Wallet

### A. Statement (quyết toán theo đơn/kỳ): `/api/v1/pay/statement/*`
- `GET pay/statement/order/list?settlement_status=&statement_version=&pagination_type=&page_type=&size=&from=&need_total_amount=&no_need_sku_record=`
  → `total_record, search_next_has_more, search_previous_has_more` (danh sách rỗng).
- `GET pay/statement/stat/info?amount_stat_type=` → `seller_quality_stat{settle_period_type
  (quan sát 1), bill_finish_period_in_days, quality_title{starling_key}, floating_body[]}`.
  **Chu kỳ quyết toán phụ thuộc chất lượng seller.**
- `GET pay/statement/balance/detail/query?transaction_type=&offset=&limit=` → `total, has_more, is_display_tab`.
- `GET pay/settlement/settings` → `statement_version, reserve_version`, URL giải thích phí.
- UI tab: **Đã quyết toán / Sẽ quyết toán** (`settlement_status`). Công thức hiển thị:
  **Tổng số tiền quyết toán = Tổng doanh thu + Tổng phí + Tổng mức điều chỉnh**. Cột: ID đơn
  hàng/điều chỉnh · Ngày tạo đơn · Ngày quyết toán · Số tiền thanh toán · Phân tích quyết toán.

### B. Settlement (số dư, tài khoản nhận, rút): `/api/v1/pay/settlement/*`
- `GET pay/settlement/balance/get` → `amount{amount: string, currency, symbol, format_with_symbol,
  format_without_symbol}`. **Tiền là object**: số dạng string + tiền tệ + chuỗi đã format sẵn.
- `GET /api/v1/seller/settlement/account/get` → `payment_method` (quan sát `"LOCAL_BANK_TRANSFER"`),
  `status` (quan sát 2), `bank_name, bank_account_number, beneficiary_name, email: string` (PII, đã masked trên UI).
- `GET pay/settlement/auto/withdraw/info/query` → `{payment_instrument, status (quan sát 2)}`.
- `GET pay/settlement/withdraw/rules/get` → `rules[]{key, text, params[]}, can_withdraw: bool`.
- `GET pay/settlement/withdraw/fail/msg/query` → `settle_err_msg{type (quan sát 6),
  kyc_remediation_details{limit_withdraw_fund, kyc_remediation_status (quan sát 4), target}}`.
  **KYC có thể chặn rút tiền.**
- `GET pay/settlement/info/compliance/security/get?info_type=`: kiểm tra bảo mật trước khi thao tác tiền.
- UI "Số tiền rút": *Số tiền rút khả dụng*, *Tài khoản quyết toán chính*, lịch sử tab *Tất cả ·
  Các khoản rút · Thu nhập*; cột *Thời gian · Loại · Số tiền · Trạng thái · Số tham chiếu*.
  Tự động rút theo lịch.

### C. Tax/Invoice: `/api/v1/tax/*`
`GET tax/invoice/search?tax_types[0..2]=&billing_party=&pagination_type=&size=&from=` →
`total, search_next_has_more, search_previous_has_more`; `tax/tax_info/get`; `tax/invoice/export_task`.

**Dòng tiền (suy ra):** đơn hoàn tất → sau chu kỳ quyết toán (theo chất lượng seller) → dòng
statement (doanh thu − phí ± điều chỉnh) → cộng vào số dư settlement → rút (thủ công/tự động) về
`LOCAL_BANK_TRANSFER`, có thể bị chặn bởi KYC.

---

## Data model: Ads

**Không có dữ liệu.** Shop chưa có tài khoản quảng cáo: `/ads-creation/dashboard` chuyển hướng về
`/ads-creation/welcome` (giới thiệu **GMV Max**: "Tối đa GMV", "Ngân sách theo mục tiêu ROI",
"tự động dùng video/sản phẩm"). Endpoint duy nhất quan sát được:
`GET /oec_ads/pa/api/spider/query_payment_account/` → `{code, msg, data: null}` (chưa có tài khoản
thanh toán ads). Envelope `msg` thay vì `message` cho thấy đây là hệ thống khác (TikTok Ads).

---

## Data model: Promotion/Voucher

- `POST /api/v1/promotion/list`
  - Request: `index, size, status, promotion_type` (quan sát `status=1`, `promotion_type=1`)
  - Response `promotions[]`:
    ```
    id: string, name: string
    status: number                 # quan sát 5 (chương trình đã kết thúc)
    promotion_type: number         # quan sát 2, 4, 10
    promotion_type_detail: number
    display_type: number           # quan sát 1, 3, 11, 19 (loại hiển thị: giảm giá SP, voucher, voucher KH mới...)
    start_time, end_time: string   # epoch dạng string
    is_long_term, is_default, is_member_promotion: bool
    discount, threshold: string    # mức giảm, ngưỡng đơn tối thiểu
    extra: { create_source, total_promotion_gmv, promotion_orders, promotion_customers: string,
             hide_product, is_original_recommended, can_duplicate: bool }
    republish_edit_info: { allow_republish: bool, republish_reasons: number }
    total_count: number
    ```
- `GET /api/v1/promotion/get_summary?promotion_type=` → `quantity_info[]{promotion_status
  (quan sát 2, 3), quantity}, seller_status`: đếm theo trạng thái.
- `POST /api/v1/insights/seller/shop/promotion/period/stats`: analytics service riêng, request
  `time_descriptor{start, end, timezone_offset, granularity, with_previous_period}`,
  `filter.promotion_tools[]`, `stats_types[]` → `segments[].timed_stats[]`. **Hiệu quả khuyến mãi
  tách sang service insights**, không nằm trong service promotion.

**Tab trạng thái (UI):** *Tất cả trạng thái · Đang diễn ra · Sắp tới · Đã vô hiệu hoá · Đã kết
thúc*. **State machine:** `upcoming → ongoing → ended`, với `upcoming|ongoing → deactivated`
(seller tắt). Chương trình đã kết thúc có thể **sao chép** (`can_duplicate`) hoặc **đăng lại**
(`allow_republish`).
**Loại (cột "Loại" UI):** *Giảm giá sản phẩm · Voucher khách mới · Voucher · Giảm giá hàng mới
về*. Tab "Tạo khuyến mãi" còn có Flash Sale, combo… (không mở, vì là luồng tạo).

---

## Auth & pagination pattern

### Auth (chỉ tên)
- **Cookie session** (passport TikTok), có **heartbeat** `GET /passport/token/beat/web/`.
- **Query param chung trên gần như mọi request:** `aid, app_name, device_platform, fp`
  (fingerprint), `oec_seller_id, seller_id, shop_region, locale, language, timezone_name,
  browser_*, screen_*`. Tức là **seller context truyền qua query**, không qua header.
- **Header:** `x-tt-oec-region` (định tuyến theo vùng dữ liệu).
- **Chữ ký chống bot (endpoint nhạy cảm):** query `msToken, X-Bogus, X-Gnarly, X-Tts-Oec-Bsid`.
  Thấy ở settlement settings, settlement account, invoice export.
- **Ticket guard (thao tác tiền):** header `tt-ticket-guard-client-data`,
  `tt-ticket-guard-public-key`, `tt-ticket-guard-version`, `tt-ticket-guard-web-version`,
  `tt-ticket-guard-iteration-version` ở `withdraw/rules/get`, `withdraw/fail/msg/query`. Đây là ký
  request bằng khoá phía client.
- **Captcha service riêng** (`api-verification.tiktokshop.com/captcha/get`) được gọi trong phiên.
- Không thấy `Authorization: Bearer` trên web.

### Pagination
| Kiểu | Nơi dùng |
|---|---|
| `offset` + `count` + `pagination_type` + `search_cursor`, trả `has_more` / `search_next_has_more` / `search_previous_has_more` | order list, reverse list, statement, invoice (`from` + `size`) |
| `page_number` + `page_size` + `total_product_count` | product list |
| `index` + `size` + `total_count` | promotion list |
| `offset` + `limit` + `has_more` | balance detail |
| `pagination_cursor` + `pagination_size` → `next_cursor/prev_cursor` | thông báo |

`pagination_type` là một **tham số**: cùng endpoint hỗ trợ cả offset lẫn cursor (hai chiều
next/previous).

### Envelope
Gần như thống nhất `{code, message, data}` (Ads: `msg`). Nhãn hiển thị luôn qua **`starling_key`**
(i18n phía FE); backend ít trả chuỗi đã localize (trái với Shopee `status_info.status` = chuỗi
tiếng Việt).

---

## Nhận xét: pattern nào áp dụng cho Tappy, pattern nào không cần

(Bối cảnh Tappy: commerce là FUTURE; hiện có Deals/Bookings/Reviews; merchant là doanh nghiệp địa
phương; thanh toán SePay/VietQR ở Phase 8.)

### ✅ Nên học
1. **Envelope thống nhất `{code, message, data}`** cho mọi service merchant. TikTok làm được,
   Shopee thì có 3 kiểu. Tappy nên có một envelope từ ngày đầu.
2. **Tiền = object** `{amount: string, currency, format_with_symbol}`: client không tự format VND,
   tránh lệch giữa web/Android/iOS.
3. **ID dạng string**: an toàn cho JS với id 64-bit. Supabase uuid đã đáp ứng.
4. **Trạng thái sản phẩm tách trục:** `status` (seller bật/tắt) ≠ `audit/moderation_status` (Tappy
   duyệt) ≠ `visibility` (hiển thị cho user). Rất hợp với Tappy vì deal/listing cần kiểm duyệt nội
   dung (đúng tinh thần provenance guard hiện có).
5. **Reverse mô hình nhiều trục** thay vì một enum dài: `refund_status` + `dispute_status`, đủ cho
   Tappy ở dạng tối giản.
6. **Dashboard ô = saved search** (`dashboard_columns[].search_param`): mỗi ô "việc cần làm" mang
   sẵn bộ lọc. Rẻ, rõ ràng, tái dùng endpoint list.
7. **Đếm nhiều tab trong một lần gọi** (`search_count` với `search_key_list[]` → `count_map`).
8. **SLA là view hạng nhất** ("Cần xử lý trong 24h", "Tự huỷ trong 24h tới"). Tappy: "Booking chờ
   xác nhận trong 2h".
9. **Remote config center** cho luật/ngưỡng (hạn SLA, phí, giới hạn khuyến mãi) thay vì hard-code.
10. **Analytics khuyến mãi tách service** (`insights`): giữ bảng promotion gọn, số liệu hiệu quả
    tính riêng.
11. **`can_duplicate` / `allow_republish`**: nhân bản chương trình đã kết thúc. Tính năng nhỏ,
    merchant rất cần.

### ❌ Không cần (Tappy đơn giản hơn)
- **Đa kênh bán (`sale_platform_products[]`, TikTok ↔ Tokopedia)** và đa vùng (`x-tt-oec-region`,
  `region_prices`): Tappy chỉ 1 kênh, 1 vùng (VN).
- **Nguồn nội dung trên đơn (LIVE, video, creator/affiliate)**: chưa có social commerce.
- **ON_HOLD, AWAITING_COLLECTION, tách kiện, kho FBT**: không có vận chuyển.
- **Exchange/replace, appeal, platform takeover, compensation**: quá nặng. Refund đơn giản là đủ.
- **Chu kỳ quyết toán theo chất lượng seller, KYC remediation, ticket guard**: thay bằng payout
  định kỳ cố định (T+N) qua SePay và xác minh tài khoản ngân hàng một lần.
- **Fingerprint + X-Bogus/msToken**: Supabase auth + RLS + rate limit.
- **Hệ Ads riêng (GMV Max)**: nằm ngoài phạm vi.
- **Tiêu đề qua `starling_key` từ server**: Tappy đã có i18n phía client (`useTranslation`), chỉ
  cần server trả **mã trạng thái** ổn định.
