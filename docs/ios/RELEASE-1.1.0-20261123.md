# iOS 1.1.0 — release notes and hand-over (23/11/2026)

Update of the released version **1.0.0 (build 214, commit `4f2d698`)**. This file is a draft for App Store Connect. Nothing has been filled in or submitted by the assistant: "Submit for Review" is the owner's button.

## What the build is
- Branch `ios/consolidated-20261122`: build 214 + the Messenger (#313) + the security audit (#287) + Explore video (dark until the server flag is on) + the brain parity work (`docs/ios/IOS-BRAIN-FREEZE-20261123.md`).
- `MARKETING_VERSION` is **1.1.0** (`ios/project.yml`); the build number is the run number of the TestFlight workflow run, which is higher than 214.
- It talks to the **production** server (the secrets of the workflow point at it). The web build with the new brain is not deployed yet; this build was written to work against today's production server and to light up when the web build ships (see the freeze file, "Written to work against today's production server too").

## What a person sees with TODAY's production server
Honest list for "What's New" (do not promise anything that needs the new web build):

- **Vietnamese**
  - Báo cáo nội dung có thêm lý do "Bạo lực" và "Thông tin sai"; bỏ chặn một người ngay trên trang cá nhân của họ.
  - Ưu đãi: có logo Lazada và Vexere; chỉ hiện đối tác Accesstrade, Lazada, Agoda, Vexere.
  - Cài đặt: nút "Xóa bộ nhớ đệm ảnh" (ảnh tin nhắn trên máy này).
  - Giọng điệu và độ dài câu trả lời chọn trong "Tappy biết gì" nay áp dụng thật.
  - Hỏi "gần tôi" dùng vị trí mới nhất thay vì vị trí cũ.
  - Câu trả lời có nút "Nguồn · N" liệt kê các trang đã dùng.
  - Kế hoạch du lịch có nút "Tải PDF".
  - Gỡ một mục trong "Tappy biết gì" không còn xóa nhầm các mục khác.
- **English**
  - Report reasons add "Violence" and "Misinformation"; unblock someone on their profile.
  - Deals: Lazada and Vexere logos; only Accesstrade, Lazada, Agoda and Vexere partners are shown.
  - Settings: "Clear photo cache" (message pictures on this phone).
  - The tone and length chosen in "What Tappy knows" now apply to replies.
  - "Near me" questions use a fresh location, not an old one.
  - Answers have a "Sources · N" button listing the pages used.
  - Trip plans have a "Download PDF" button.
  - Removing one item in "What Tappy knows" no longer erases the others.

## What is in the build but DARK until the web build ships
Stays and dishes in a plan, hotel reference price, the price band on place cards, emergency card, comparison tables / subject cards / gallery / questions / booking cards, the deep-research limit note, the quick-read sheet for links (a server without it opens the link itself), hiding a comment, Explore video upload (needs the server flag).

## App Review notes (add to the existing notes; nothing changes for the demo account)
- No new account, payment or sign-in flow. In-app purchase code is unchanged.
- External links: the quick-read sheet and booking cards only link to articles and partner sites for goods and services (`ExternalPurchaseGuardTests` lists every file that opens a link and was reviewed for 3.1.1).
- The emergency card dials a hotline with `tel:` (2-4 digit numbers only).
- User-generated content: reporting reasons were extended; blocking, unblocking and the 24-hour review commitment are unchanged.

## What only the owner can do (the assistant does not)
1. In App Store Connect create the version **1.1.0**, attach the build the TestFlight job uploaded (its number is in the job summary), paste "What's New" above.
2. Test the TestFlight build on a real iPhone first (nothing in this work has been run on a device).
3. Press **Add for Review / Submit for Review** (choose manual release).

## Before pressing submit — owner's checklist
- [ ] Opened the TestFlight build on an iPhone: chat, a plan card, Settings, Deals, a profile with a block.
- [ ] Production still has the flags build 214 was approved with (account deletion in-app, reports and blocks).
- [ ] No other iOS build is waiting for review.
