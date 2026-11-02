# Shopee Seller Center — kiến trúc API & data model (reverse-engineered)

> **Nguồn:** quan sát traffic XHR/fetch trên `banhang.shopee.vn` ngày 2026-09-27, bằng tài khoản
> seller thật đã đăng nhập (chỉ xem, không thao tác ghi). Không dùng file HAR: một bộ ghi thụ
> động trong trang chỉ lưu **tên field + kiểu dữ liệu + giá trị enum ngắn**. Mọi token, cookie,
> ID thật, tên/SĐT/địa chỉ người mua, tên shop và số tiền đều **không được lưu**.
>
> **Phạm vi đã xem:** Đơn hàng (6 tab) · Trả hàng/Hoàn tiền/Huỷ (4 case tab) · Sản phẩm (5 tab) ·
> Mã giảm giá · Khuyến mãi của Shop · Flash Sale · Doanh thu · Số dư TK (ví) · Dịch vụ Hiển thị
> (Ads). ~150 endpoint, trong đó ~110 là API nghiệp vụ.
>
> **Độ tin cậy:** "quan sát" = thấy trong response/request thật. "suy ra" = kết luận từ tên
> field/UI, chưa xác minh. Tôi ghi rõ ở từng chỗ.

---

## Service boundaries (theo domain/path)

Tất cả API nghiệp vụ đi qua **một origin** `banhang.shopee.vn/api/...` (BFF/gateway cùng domain
với web). Ranh giới service thấy được qua **path prefix + version + kiểu envelope** — ba thứ này
đổi cùng nhau, nên gần như chắc chắn là các team/service khác nhau đứng sau một gateway.

| Nhóm path | Service (suy ra) | Envelope response | Ví dụ endpoint |
|---|---|---|---|
| `/api/v3/order/*` | **Order** (list/search/card/actions) | `{code, message, user_message, data}` | `search_order_list_index`, `get_order_list_card_list`, `get_order_list_buttons`, `get_order_list_meta_v2` |
| `/api/v3/shipment/*` | **Logistics / Shipment** | như trên | `get_package_arrange_shipment_info`, `get_shop_pop_up_setting` |
| `/api/v4/seller_center/return/*` | **Return/Refund (RR)** — service riêng | `{error, error_msg, data}` | `return_list/get_exceptional_case_list`, `get_tab_options`, `get_filter_options` |
| `/api/v3/mpsku/list/*`, `/api/v3/opt/mpsku/*`, `/api/v3/product/*`, `/api/v3/category/*`, `/api/tool/mass_product/*` | **Product (MPSKU)** + category | `{code, message, user_message, data}` | `get_product_list`, `search_product_list`, `get_list_count`, `get_product_constraints` |
| `/api/v4/accounting/pc/seller_income/*` | **Accounting / Income (escrow)** | `{code, message, user_message, data}` | `get_income_overviews`, `get_income_detail`, `get_income_report_list` |
| `/api/v4/seller/local_wallet/*` | **Wallet** (ví người bán) | `{bff_meta, error, error_msg, data}` | `get_wallet_status`, `get_wallet_transactions`, `get_withdrawal_limits` |
| `/api/v4/invoice/seller/*` | **Invoice** (hoá đơn) | `{code, data}` | `get_invoice_list`, `get_invoice_status` |
| `/api/marketing/v3/voucher/*`, `/api/marketing/v3/public/discount/*`, `/api/marketing/v4/shop_flash_sale/*` | **Marketing / Promotion** (3 sub-domain: voucher, discount, flash sale) | `{code, message, data}` | `voucher/list`, `discount/list`, `get_shop_flash_sale_list` |
| `/api/pas/v1/*` | **Paid Ads Service (PAS)** | `{code, msg, debug_detail, validation_error_list, data}` | `homepage/query`, `product/get`, `meta/get` |
| `/api/v3/opt/optimizer/*`, `/api/v3/ai_optimizer/*` | Tối ưu/AI (gợi ý sản phẩm, ảnh AI) | — | `get_need_to_deal_with_product_overview` |
| `/api/seller_shop/v1/*`, `/api/framework/selleraccount/*`, `/api/v3/settings/*` | Shop settings / account / cấu hình | — | `holiday_mode/...`, `get_sip_primary_shop` |
| `/webchat/*`, `/api/cschat/*`, `chatbot.seller.shopee.vn`, `seller-service.cs.shopee.vn` | Chat & CSKH | — | (bỏ qua) |
| `deo.shopeemobile.com/.../vi.colNNNN.json`, `seller.shopee.sg/api/tsp/transify` | **i18n (Transify)**: chuỗi hiển thị tải theo "collection" | — | FE dùng `transify_key` để render nhãn |
| `patronus.idata...`, `report.chatbot...`, `ubt.tracking...`, `df.infra...` | Tracking / security | — | (bỏ qua) |

**Kết luận về boundary:**
- **Order ≠ Shipment ≠ Return.** Return/Refund là service riêng: khác version (`v4`), khác
  envelope (`error` thay vì `code`), và bộ filter/tab riêng. Hoá đơn cũng tách riêng.
- **Income (escrow) ≠ Wallet.** "Doanh thu" (tiền theo đơn đang giữ hoặc đã giải ngân) và "Số dư
  TK" (ví, rút tiền) là hai service, nối với nhau bằng giao dịch ví `ESCROW_VERIFIED_ADD`.
- **Ads có ví riêng** (`ads_credit`) nhưng cũng có thể trừ từ ví seller (`PAID_ADS_CHARGE`).

---

## Data model: Product

**Endpoint tiêu biểu**
- `GET /api/v3/opt/mpsku/list/v2/get_product_list?list_type=&page_number=&page_size=&need_ads=`
- `GET /api/v3/opt/mpsku/list/v2/search_product_list?list_type=&page_size=&operation_sort_by=...` (dùng cursor)
- `GET /api/v3/opt/mpsku/list/v2/get_list_count?list_types=...` → số lượng theo tab
- Enrichment gọi **riêng**, truyền `product_ids`: `get_product_extensive_info`,
  `get_product_performance_info`, `get_boost_info`, `get_product_lock_info`,
  `get_content_quality_info`, `get_smart_diagnosis_info`.
  → Pattern **list gọn + nhiều lời gọi enrichment theo batch id** (BFF fan-out).

**Cấu trúc `data.products[]` (quan sát)**
```
id: number
name: string
status: number                     # quan sát: 1 (đang bán), 8 (đã ẩn/delist)
cover_image: string
parent_sku: string
create_time, modify_time: number   # epoch giây
scheduled_publish_time: number
price_detail: { price_min, price_max, selling_price_min, selling_price_max: string,
                has_discount: bool, max_discount_percentage: number, max_discount: number }
stock_detail: { total_available_stock, total_seller_stock, total_shopee_stock: number,
                low_stock_status: number, enable_stock_reminder: bool,
                advanced_stock: { sellable_stock, in_transit_stock: number } }
statistics: { view_count, liked_count, sold_count: number }
tag: { is_virtual_sku, unlist, has_discount, wholesale, has_bundle_deal, has_add_on_deal,
       live_sku, ssp, member_exclusive, is_ipr_appealing, is_bulky_item, to_be_archived,
       has_ams_commission: bool }
promotion: { wholesale, has_bundle_deal: bool,
             ongoing_campaigns[]: { campaign_type, promo_source, start_time, end_time: number,
                                    price_min, price_max: string } }
boost_info: { boost_entry_status, campaign_id, campaign_type: number, show_boost_history: bool }
appeal_info.ipr_appeal_info: { appeal_opt, appeal_status, reference_id: number }
model_list[]:                      # biến thể (SKU con)
  id: number, name: string, sku: string
  tier_index: number[]             # vị trí trong ma trận biến thể (vd [màu, size])
  is_default: bool, image: string
  price_detail: { origin_price, promotion_price: string }
  stock_detail: { total_available_stock, total_seller_stock, total_shopee_stock: number }
  statistics.sold_count: number
page_info: { total, page_number, page_size: number }   # hoặc { cursor: string, total }
```

**Status / list_type (quan sát)**
- `list_type` (tab): `all`, `live_all`, `reviewing`, `delisted`, `banned`, `deleted`. Route UI
  còn có `unpublished/unlisted`.
- Tab UI: *Tất cả · Đang hoạt động · Vi phạm · Chờ duyệt bởi Shopee · Chưa được đăng*.
- `products[].status`: thấy `1` (live) và `8` (trong list delist). Các mã khác chưa thấy.
- State machine sản phẩm (suy ra từ tab): `draft/unpublished → reviewing → live ⇄ delisted
  (unlist)`; `live → banned (vi phạm, có appeal)`; `* → deleted`.

**Điểm đáng chú ý**
- **Giá là string** (dạng `"<số>.00"`), không phải number, để tránh lỗi float.
- **Tồn kho tách nguồn:** `seller_stock` (kho người bán) và `shopee_stock` (kho Shopee/FBS), cộng
  thêm `in_transit`.
- **Ràng buộc listing là data, không hard-code:** `GET /api/v3/product/get_product_constraints`
  trả về độ dài tên/mô tả, số ảnh, kích thước ảnh, min/max giá, max biến thể
  (`one_tier_option_count_limit`, `total_model_count_limit`), cân nặng/kích thước, ràng buộc
  số lượng mua tối thiểu/tối đa, định dạng video… FE validate theo cấu hình này.

---

## Data model: Order (kèm state machine)

### Luồng lấy danh sách: 3 bước
1. `POST /api/v3/order/search_order_list_index`: **chỉ trả ID**.
   - Request: `order_list_tab: number`, `entity_type`, `pagination{from_page_number, page_number, page_size}`,
     `filter{fulfillment_type, is_drop_off, fulfillment_source, action_filter, order_to_ship_status}`,
     `sort{sort_type, ascending}`
   - Response: `index_list[]{order_id, shop_id, region_id, package_number}`,
     `pagination{total, page_number, page_size, next_page_sentinel, previous_page_sentinel}`
2. `POST /api/v3/order/get_order_list_card_list`: truyền `order_param_list[]` /
   `package_param_list[]`, nhận về **card đã render sẵn cho UI**.
3. `POST /api/v3/order/get_order_list_buttons`: truyền danh sách order, nhận về **các nút hành
   động hợp lệ** cho từng đơn.

Song song: `get_order_list_meta_v2` (đếm số đơn từng tab) và `get_sort_filter_options` (cấu hình
sort).

### Cấu trúc card (quan sát, đã rút gọn)
```
card_list[]:
  order_card | package_card:                 # 1 đơn có thể tách nhiều kiện (package)
    card_header: { order_sn: string, buyer_info: { username, portrait } }   # [REDACTED] khi trích
    item_info_group.item_info_list[]: {...}
    payment_info: { currency: number, total_price: number, payment_method: string }
    status_info: { status: string,           # nhãn đã localize, vd "Chờ lấy hàng"
                   status_description: { description_value, description_timestamp_list[], description_placeholder_list[] },
                   rts_info: {...} }
    fulfilment_info: { fulfilment_channel_name, masked_channel_name, ship_out_mode: string,
                       tracking_number_list: string[] }
    action_info: { btn_info_list[], hide_chat_button: bool }
    order_ext_info: { order_id, buyer_user_id, return_id, logistics_status, logistics_id: number,
                      fulfilled_by_shopee, is_order_ratable, is_split_up, can_partial_cancel: bool,
                      ship_by_date, pickup_attempts: number, seller_address: {...} }
    package_ext_info(_list): { package_number: string, ofg_id: number,
                      shipping_method, fulfilment_channel_id, fulfilment_status, allocating_status: number,
                      acl1_arrange_ship_date, acl2_3pl_ack_date, pickup_time: number,
                      shipping_name/phone/address: string,  # PII của người nhận
                      is_pickup_only, is_manual_consignment, is_auto_consignment, has_tracking, can_unsplit: bool }
```

### Nút hành động do server quyết định (server-driven actions)
```
btn_info_list[]: { btn_style: { btn_text, btn_msg, btn_icon_id: string, btn_status: number },
                   btn_action_type: number, btn_action_component: number,
                   btn_auth: string[], btn_owner: number, btn_priority: number, remove_fallback: bool }
```
FE **không** tự suy ra "được bấm gì ở trạng thái nào". Backend trả danh sách nút theo trạng thái,
quyền và kênh vận chuyển.

### State machine đơn hàng

**Tab cấp 1 (UI):** *Tất cả · Chờ xác nhận · Chờ lấy hàng · Đang giao · Đã giao ·
Trả hàng/Hoàn tiền/Huỷ*. Meta đếm theo cấu trúc hai tầng (quan sát):
```
all_tab_meta       { l1_meta, order{ l2_all, l2_ship_by_seller, l2_ship_by_advanced_fulfilment }, booking{ l2_all } }
unpaid_tab_meta    { l1_meta }
to_ship_tab_meta   { l1_meta, order{ l2_all, l2_to_process, l2_processed, l2_pending }, booking{...} }
shipping_tab_meta  { l1_meta, order{ l2_all, l2_ship_by_seller, l2_ship_by_advanced_fulfilment } }
completed_tab_meta { l1_meta, order{ l2_all, l2_pending_invoice, l2_uploaded_invoice } }
```
`order_list_tab` là mã số, quan sát được `200, 300, 400, 500`. Chưa xác minh ánh xạ chính xác từng
mã sang tab.

**Nhãn `status_info.status` quan sát được:** `Chờ lấy hàng`, `Đã giao cho ĐVVC`, `Đã giao`,
`Đã nhận được hàng`.
**`logistics_status` / `fulfilment_status` (số) quan sát:** `9` (đơn ở tab chờ lấy hàng),
`2, 5, 6` (đơn đã giao/hoàn tất). Chưa có bảng ánh xạ đầy đủ.

**Timeline trên trang chi tiết đơn (quan sát UI):**
`Đơn hàng mới` → `Người mua xác nhận đã nhận được hàng` → `Đã giao` → `Đã hoàn thành chuyển khoản`
(bước cuối là giải ngân cho seller).

**State machine tổng hợp (suy ra từ tab + nhãn + timeline):**
```
            ┌──────────────► CANCELLED (Đơn huỷ — đi qua service Return, case_type=2)
            │
UNPAID ──► TO_SHIP ──────────► SHIPPING ──────────► DELIVERED ──► COMPLETED ──► PAYOUT_RELEASED
(Chờ xác   (Chờ lấy hàng)      (Đã giao cho ĐVVC/   (Đã giao)    (Người mua     (Đã hoàn thành
 nhận)     sub: to_process →   Đang giao)                         xác nhận /     chuyển khoản —
           processed / pending                                    tự động)       escrow → ví)
                                   │                    │
                                   ▼                    ▼
                         FAILED_DELIVERY          RETURN_REFUND (case_type=1)
                         (case_type=3)
```
- `to_ship` có trạng thái con: **to_process** (chưa chuẩn bị) / **processed** (đã sắp xếp vận
  chuyển) / **pending**. Có filter theo `order_status` (`1`, `2`, `100`) và `entity_type`
  (`1/2/3`, trong đó "booking" là loại đơn đặt trước, suy ra).
- `ship_by_date` là **hạn SLA giao cho ĐVVC**. Sort mặc định của tab chờ lấy hàng là
  `ship_by_date_asc`.

### Return/Refund/Cancel: service riêng, state machine đầy đủ nhất (quan sát từ `get_tab_options` + `get_filter_options`)

**Case (tab cấp 1):** `0` Tất cả · `1` Đơn Trả hàng/Hoàn tiền · `2` Đơn Huỷ · `3` Đơn Giao hàng
không thành công.

**Flow (tab cấp 2):** `1` Tất cả · `2` Shopee đang xem xét · `3` Đang trả hàng cho Người bán ·
`4` Đã hoàn tiền cho Người mua · `5` Đã khiếu nại đến Shopee · `6` Yêu cầu bị huỷ/không hợp lệ ·
`7` Đang trả hàng cho NB (giao thất bại) · `8` Đã trả hàng cho NB · `9` Trả hàng không thành công ·
`11` Đã gửi yêu cầu khiếu nại.

**Trạng thái yêu cầu trả hàng (filter `[4]`, đầy đủ):**
| mã | trạng thái |
|---|---|
| 1 | Shopee đang xem xét |
| 2 | Chờ bạn phản hồi quyết định hoàn tiền của Shopee |
| 3 | Chờ Người mua phản hồi thương lượng |
| 5 | Người mua đang trả hàng |
| 6 | Chờ bạn xác nhận hàng trả về |
| 7 | Bạn đang khiếu nại |
| 8 | Đã hoàn tiền cho Người mua |
| 9 | Yêu cầu của Người mua không hợp lệ |
| 10 | Khiếu nại của bạn được chấp nhận |
| 11 | Khiếu nại của bạn bị từ chối |
| 12 | Bạn đã thu hồi khiếu nại |
| 13 | Yêu cầu bị huỷ |
| 14 | Yêu cầu được xác nhận |
| 15 | Yêu cầu bồi thường được chấp nhận |
| 17 | Khiếu nại đã bị từ chối |
| 18 | Khiếu nại đang được xem xét |

**Hành động seller cần làm (filter `[1]/[3]`):** 1 Thương lượng với Người mua · 3 Kiểm tra hàng
hoàn · 4 Cần cung cấp bằng chứng · 5 Hoàn tiền một phần · 6 Hoàn tiền toàn phần · 7 Phản hồi quyết
định của Shopee · 10 Giữ lại kiện hàng.

**Giải pháp người mua yêu cầu (filter `[8]`):** `0` Trả hàng & Hoàn tiền · `1` Hoàn tiền ngay ·
`100` Trả hàng.

**Trạng thái logistics chiều đi (`[5]`) và chiều về (`[6]`):** 1 Chưa lấy hàng · 2 Đang chuẩn bị ·
3 Đã lấy hàng · 4 Đã giao · 5 Giao không thành công · 6 Lấy hàng không thành công · 7 Thất lạc ·
8 Đã huỷ (chiều đi) / 9 Đang giao hàng (chiều về).

**Người xử lý (`[14]`):** 1 Shopee xử lý · 2 Shop xử lý. **Hạn xử lý (`[13]`):** hết hạn trong
86400s / 172800s. Đây là SLA key-action theo giây.

**Case item (quan sát):** `return_info{status, reason, return_solution, logistics_status,
negotiable_refund_flag, is_partial_quantity_return_allowed, real_return_reason}`,
`forward_logistics_info` / `reverse_logistics_info` `{aggregated_logistics_status(_text),
tracking_numbers[], shipping_carrier}`, `display_refund_amount`, `display_compensation_amount`
(string đã format), `header{status_text_key, hint_text_key, action_button_list}`.

---

## Data model: Finance/Wallet

### A. Income (escrow theo đơn): `/api/v4/accounting/pc/seller_income/*`
- `GET income_overview/get_income_overviews` → `list[]{type: number, amount: number}` (type quan
  sát: 6, 7, 8, 9, tương ứng UI *Chưa thanh toán · Đã thanh toán tuần này / tháng này / tổng*.
  Ánh xạ từng mã chưa xác minh).
- `POST income_overview/get_income_detail`
  - Request: `income_category` (quan sát `1`, `2`, khớp tab *Chưa thanh toán / Đã thanh toán*),
    `source_type`, `pagination_info{direction, limit}`, `local_query_condition{start_date, end_date}`
  - Response `list[].local_income_detail`:
    ```
    order_income_info: { order_id, order_sn, item_count, order_status, payment_method: number,
                         payment_method_name, item_name, shop_name, buyer_name: string }   # PII
    income_amount, adjustment_income_amount, net_income_amount: number
    income_estimated_escrow_time, income_released_time, income_adjustment_released_time: number
    order_status_transify_key: string
    next_page: { cursor: string, limit, direction: number }
    ```
  → Mỗi đơn có **thu nhập dự kiến → điều chỉnh → thu nhập ròng**, cùng thời điểm
  **escrow dự kiến / thực nhả**.

### B. Wallet: `/api/v4/seller/local_wallet/*`
- `get_wallet_status`:
  `wallet_available_balance, wallet_active_balance, wallet_blocked_balance, wallet_secured_balance`,
  hạn mức rút theo ngày, số lần rút miễn phí còn lại, `is_wallet_frozen`, `has_wallet_password`,
  `is_seller_payment_locked`.
- `get_withdrawal_limits`, `get_withdrawal_options` (tài khoản ngân hàng `bank_accounts[]{status,
  is_default, is_linked, withdrawal_transaction_fee_*}`), `get_user_auto_withdrawal_setting`
  (`enabled, freq_type, freq_value[], amount, is_full_amount, reserved_amount`),
  `calculate_user_withdrawal_fee` (`final_fee_rate, final_withdrawal_amount`),
  `get_withdrawal_block_info` (`blocked_amount, kyc_status, kyc_withdrawal_threshold`).
- `POST get_wallet_transactions`
  - Request: `wallet_provider, begin_time, end_time, transaction_types[], limit`
  - Response `transactions[]`:
    ```
    transaction_id: string, transaction_type: number, status: number, money_flow: number,
    amount: number, create_time: number, reason: string, comment: string,
    order_id, order_sn, refund_sn: string,
    old_available, new_available, old_outgoing, new_outgoing: number,   # số dư trước/sau: kiểu ledger
    request_id: string, request_type: number, selling_region: string,
    withdrawal_type, withdrawal_splits, root_withdrawal_id, transaction_fee, payout_time,
    cancel_time, cancel_reason, complete_time: (null khi không phải giao dịch rút)
    next_cursor: string, pagination{cursor, limit, has_more}
    ```
  `status` quan sát: `3` (đã hoàn tất). `money_flow`: **2 = tiền vào, 3 = tiền ra**.

**Bảng loại giao dịch ví (đầy đủ, từ `get_wallet_transaction_types_meta`)**

| Nhóm (tab) | Mã: tên | Hướng |
|---|---|---|
| 1 Doanh thu đơn hàng | 101 ESCROW_VERIFIED_ADD · 102 ESCROW_VERIFIED_MINUS | vào/ra |
| 2 Điều chỉnh | 401/402 ADJUSTMENT_ADD/MINUS · 404/405 FBS_ADJUSTMENT · 406/407 ADJUSTMENT_CENTER · 408 FSF_COST_PASSING_DEDUCT · 411 ADJUSTMENT_FOR_RR_AFTER_ESCROW_VERIFIED · 412 AFFILIATE_COMMISSION_FEE_ADD · 413/414 CROSS_MERCHANT_ADJUSTMENT · 415 SELLER_COMPENSATE_ADD · 418/419 FBS_FEE_CHARGE · 460 AFFILIATE_FEE_DEDUCT · 461 LOST_PARCEL_SELLER_ADD · 462/463 AMS_COMMISSION_FEE · 464 AFFILIATE_SAMPLE_SHIPPING_FEE_DEDUCT · 465 NON_RECEIPT_RR_SELLER_COMPENSATE_ADD · 468 SHIPPING_FEE_CLAIM_ADD · 471 INSTANT_CANCELLATION_SELLER_COMPENSATE_ADD · 474 FULFILMENT_COMPENSATE_ADD · 475/476 INSTALLATION_FEE · 477 RETURN_COMPENSATION_SERVICE_ADD · 483/484 REALTIME_OFFSET · … | vào/ra |
| 3 Thanh toán bằng ví | 501 PAID_BY_WALLET · 502 SPM_DEDUCT · 503 APM_DEDUCT · **450 PAID_ADS_CHARGE** | ra |
| 4 Hoàn tiền | 301 REFUND_VERIFIED_ADD · 302 AUTO_REFUND_ADD · 303 FOODY_REFUND_ADD · 451 PAID_ADS_REFUND · 504 SPM_REFUND_ADD · 505 APM_REFUND_ADD · 512 SVS_PURCHASE_REFUND | vào |
| 5 Rút tiền | 201 WITHDRAWAL_CREATED · 203 WITHDRAWAL_CANCELLED · 4000 WITHDRAWAL · 4001 WITHDRAWAL_SPLIT | ra |
| 7 Quick Funds | 452 FAST_ESCROW_DISBURSEMENT · 458 FAST_ESCROW_DEDUCT · 459 FAST_ESCROW_DISBURSE_REMAIN | vào/ra |
| 8 Vay seller | 801 AUTO_DEDUCT_SELLER · 802 DISBURSEMENT_LOAN_SELLER | ra/vào |

**Dòng tiền (suy ra):** đơn hoàn tất → escrow được xác minh → `101 ESCROW_VERIFIED_ADD` vào ví →
các khoản điều chỉnh/phí (`4xx`) → rút (`201 → 4000`, có thể tách `4001`) hoặc bị huỷ (`203`).
Hoàn tiền sau khi đã giải ngân: `411 ADJUSTMENT_FOR_RR_AFTER_ESCROW_VERIFIED`.

### C. Invoice: `/api/v4/invoice/seller/*`
`get_invoice_list` (request `invoice_type[]` quan sát `1,2,3,4,9`) → `invoice_list[]{invoice_id,
invoice_type, invoice_status, issue_time, start_time, end_time, total_price, tax_amount: string,
invoice_files[]{file_link, file_type, file_format}}`, phân trang kiểu
`next_pagination.source_offsets[]{source, offset, total}` (gộp nhiều nguồn hoá đơn).

---

## Data model: Ads (Dịch vụ Hiển thị, `/api/pas/v1/*`)

- `POST homepage/query`: danh sách chiến dịch + báo cáo.
  - Request: `start_time, end_time, filter_list[]{campaign_type, state, search_term, is_valid_rebate_only}, offset, limit, use_paid_gmv`
  - `entry_list[]`:
    ```
    title, image: string
    state: string        # quan sát: ongoing | paused | ended   (filter còn có scheduled, all)
    type: string         # quan sát: product_mpd | product_manual   (chi tiết: product_gms)
    subtype: string      # product_homepage__roi_two__target | ..._simple
    campaign: { campaign_id, daily_budget, total_budget, start_time, end_time, roi_two_target: number }
    manual_product_ads: { item_id, product_placement, bidding_strategy: string, cps, enhanced_bid_price: bool }
    report: { impression, click, ctr, cpc, cpm, cost, reach, view,
              direct_gmv, direct_order, direct_roi, direct_cr, direct_cir,
              broad_gmv, broad_order, broad_roi, broad_cir, checkout, checkout_rate, avg_rank, sov, ... : number }
    ratio: { ...cùng key với report... }   # % thay đổi so với kỳ trước
    editable_list: string[]               # field nào được sửa (server-driven)
    trait_list: string[], trait_data[]
    ```
- `POST product/get`: chi tiết campaign `{state, bidding_strategy, product_placement,
  product_selection, daily_budget, roi_two.target, type}`.
- `POST meta/get`: `ads_credit{total, is_low_balance, low_balance_status("ok"), expiring_in_30d}`,
  `has_ads{shop, product_manual, product_auto, display, live_stream, video, ...}`.
- `POST rebate/campaign_get` → `rebate_campaign_status` (quan sát `"invalid"`), `invalid_reason`
  (quan sát `"auto_escrow_off"`).
- `POST setup_helper/get_campaign_expense_statistics` → `today_expense, avg_seven_day_expense, max_seven_day_expense`.
- `POST todo/daily_budget/check_campaign_list` → `items[].status` (quan sát `"not_recommended"`).

**State machine chiến dịch:** `scheduled → ongoing ⇄ paused → ended` (UI còn có tab *Đã xoá*).
Khác các service kia: **Ads dùng enum dạng string**, còn Order/Product/Wallet dùng số.

---

## Data model: Promotion/Voucher

### Voucher: `GET /api/marketing/v3/voucher/list/?promotion_type=&offset=&limit=`
```
voucher_list[]:
  voucher_id: number, name, voucher_code: string
  start_time, end_time, ctime, mtime: number
  discount: number, value, min_price, max_value: string      # giảm % hoặc giảm tiền, đơn tối thiểu, trần giảm
  usage_limit, current_usage, usage_quantity, claim_quantity, distributed_count: number
  status: number          # quan sát: 1  (trạng thái backend)
  fe_status: number       # quan sát: 3  (trạng thái hiển thị: sắp/đang/đã kết thúc — suy ra)
  use_type: number        # quan sát: 0
  rule: { reward_type, usecase, voucher_landing_page, usage_limit_per_user: number,
          hide, display_voucher_early, is_seller_absorbed, is_cofund_campaign_voucher: bool,
          choose_users: { shop_order_count, shop_order_count_period, user_segment },
          fund_rule: { fund_type (quan sát 2), cofund_scheme_type, shopee_party, seller_party } }
total_count, max_active_count: number, is_exceed_max_active_count: bool
```
Loại voucher trên UI: *Voucher toàn Shop · Voucher sản phẩm · Voucher riêng tư · Voucher Live ·
Voucher Video*.

### Discount / Combo / Mua kèm: `POST /api/marketing/v3/public/discount/list/`
- Request: `discount_type, time_status, offset, limit`
- `discounts[]{discount_type, seller_discount | add_on_deal | bundle_deal}`, mỗi loại có
  `{discount_id, name, time_status, start_time, end_time, item_preview{item_count, images[]}, source}`.
- `discount_type` quan sát `1, 2, 3` (seller_discount / add_on_deal / bundle_deal, suy ra từ tên
  field). `time_status` quan sát `2, 3` (đang diễn ra / đã kết thúc, suy ra).
- `POST discount/active/` → `max_active_discounts_data[]{discount_type, max_active_count}`: mỗi
  loại khuyến mãi có **giới hạn số chương trình chạy đồng thời**.

### Flash Sale của shop: `GET /api/marketing/v4/shop_flash_sale/get_shop_flash_sale_list/?type=&offset=&limit=`
`flash_sale_list[]{flash_sale_id, timeslot_id, start_time, end_time, status, type, item_count,
enabled_item_count}`. Flash sale gắn với **khung giờ (timeslot) do nền tảng định sẵn**.

**Promotion ↔ Product:** `products[].promotion.ongoing_campaigns[]{campaign_type, promo_source,
start_time, end_time, price_min, price_max}`. Giá khuyến mãi được **chiếu ngược** vào sản phẩm để
danh sách sản phẩm hiển thị luôn.

---

## Auth & pagination pattern

### Auth (chỉ ghi tên, không ghi giá trị)
- **Cookie session** (cookie HttpOnly của domain Shopee), gửi tự động, `credentials: include`.
- **Query param trên mọi request:** `SPC_CDS`, `SPC_CDS_VER`. Đây là token gắn với session (vai
  trò chống CSRF / chống replay), không nằm trong header.
- **Header FE:** `sc-fe-ver`, `sc-fe-session`, `locale`, `caller-source`, `x-api-src-list`.
- **Header ký chống bot (chỉ ở endpoint nhạy cảm):** `x-sap-ri`, `x-sap-sec`, `af-ac-enc-sz-token`,
  `af-ac-enc-dat`, `x-sz-sdk-version`. Thấy ở: danh sách đơn (index + card), `get_wallet_status`,
  `calculate_user_withdrawal_fee`, `get_withdrawal_block_info`, thống kê chi phí ads.
  → Chữ ký được **áp theo mức độ nhạy cảm của endpoint**, không áp toàn cục.
- Không thấy `Authorization: Bearer` ở web seller center.

### Pagination: **ít nhất 5 kiểu cùng tồn tại**
| Kiểu | Nơi dùng |
|---|---|
| `page_number` + `page_size` + `total` | product list, report list, invoice report |
| `offset` + `limit` + `total_count` | voucher, discount, flash sale, ads homepage |
| `cursor` (string) + `has_more` | `search_product_list`, `get_wallet_transactions` (`next_cursor`), `get_income_detail` (`next_page.cursor` + `direction`) |
| page **sentinel** (`next_page_sentinel`/`previous_page_sentinel` + `from_page_number`) | `search_order_list_index` (nhảy trang trên index lớn) |
| token (`last_token`, `next_page_token`) | ads item performance |
| `cursor{cursor_type, cursor_offset}` + `sort_orders[]` + `has_more` | return list |

### Envelope lỗi
Ba kiểu: `{code, message, user_message}` · `{error, error_msg, bff_meta}` ·
`{code, msg, debug_detail, validation_error_list}`. Riêng `user_message` (thông điệp đã localize
để hiện cho người dùng) tách biệt với `message` (cho dev). Đây là ý hay.

---

## Nhận xét: pattern nào áp dụng cho Tappy, pattern nào không cần

Bối cảnh Tappy: commerce đang ở trạng thái **FUTURE** (`docs/design/V3_PRODUCT_STRUCTURE.md`:
cart, checkout, payments, order management, merchant onboarding đều chưa làm). Hiện đã có
Deals / Bookings / Reviews, còn thanh toán SePay/VietQR nằm ở Phase 8 (đang parked). Merchant của
Tappy là doanh nghiệp địa phương (quán ăn, dịch vụ), catalog nhỏ, không có kho vận ĐVVC.

### ✅ Nên học
1. **Server-driven actions** (`btn_info_list` / `editable_list`): backend trả danh sách hành
   động hợp lệ theo trạng thái. Tappy có ít trạng thái nhưng nhiều client (web + Android + iOS).
   Đây đúng là chỗ đã từng lệch giữa các nền tảng (xem canonical commerce action CCP).
2. **Tách Order ↔ Refund/Dispute** thành 2 bảng/2 state machine. Đừng nhét `refunded` vào enum
   trạng thái đơn. Dùng `order.status` + `refund_request.status` riêng.
3. **Tách Income (escrow theo đơn) ↔ Wallet (ledger)**. Ví là **ledger append-only**: mỗi giao dịch
   có `transaction_type`, `money_flow` (in/out), `amount`, `balance_before/after`, `ref(order_id |
   refund_id | payout_id)`. Không bao giờ UPDATE số dư trực tiếp.
4. **Taxonomy loại giao dịch có nhóm** (doanh thu / điều chỉnh / phí / hoàn / rút). Tappy chỉ cần
   ~6 mã: `ORDER_INCOME`, `REFUND_DEDUCT`, `PLATFORM_FEE`, `ADJUSTMENT_ADD/DEDUCT`, `PAYOUT`.
5. **Giá & tiền dạng string/decimal (hoặc số nguyên VND)**, không dùng float.
6. **Voucher có `status` (backend) và trạng thái hiển thị tính từ thời gian** (`upcoming/ongoing/
   ended` suy ra từ `start/end_time`). Không lưu "đang diễn ra" vào DB.
7. **Ràng buộc listing là config** (`get_product_constraints`): một endpoint/constant dùng chung
   cho validate client và server.
8. **SLA dưới dạng dữ liệu** (`ship_by_date`, hạn key-action 24h/48h). Với Tappy: hạn merchant
   xác nhận booking/đơn.
9. **`user_message` tách khỏi `message`** trong envelope lỗi.
10. **Đếm theo tab bằng endpoint riêng** (`get_list_count`, `order_list_meta`), không đếm ở client.

### ❌ Không cần (Tappy đơn giản hơn)
- **Order vs Package/OFG split, ĐVVC, pickup/drop-off, `logistics_status` 2 chiều**: Tappy là
  local (tại quán/đặt chỗ/voucher), không vận chuyển.
- **Luồng 3 bước index → card → buttons**: sinh ra để chịu tải hàng triệu đơn. Với Tappy, một
  query có join + phân trang là đủ.
- **Return/Refund 18 trạng thái + khiếu nại + Shopee phân xử**: Tappy cần tối đa
  `requested → approved | rejected → refunded`.
- **Ma trận biến thể `tier_index`, tồn kho đa nguồn (seller/Shopee/in-transit)**: catalog merchant
  của Tappy là dịch vụ/món. Nếu cần biến thể thì một cấp là đủ.
- **Hệ Ads đầy đủ** (bidding, ROI target, ads_credit riêng): để sau, hoặc chỉ làm "boost" trả phí
  cố định.
- **5 kiểu pagination khác nhau**: Tappy nên chọn **một** kiểu (cursor cho list dài) và dùng thống
  nhất.
- **Chữ ký chống bot (`x-sap-*`)** ở quy mô này: dùng Supabase auth + RLS + rate limit là đủ.
- **Quick Funds, vay seller, FBS, affiliate/AMS, co-fund voucher**.
