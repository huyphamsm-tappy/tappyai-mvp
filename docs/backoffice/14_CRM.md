# TappyAI Back Office — CRM (Customer Relationship Management)

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Design the CRM module — a unified view of every user's relationship with TappyAI, enabling the team to understand, support, and manage users effectively.

---

## 2. CRM vs User Management

| Aspect | User Management | CRM |
|---|---|---|
| Primary use | Administrative actions (suspend, ban) | Understanding + supporting users |
| View depth | Account status + quick actions | Full relationship history |
| Audience | Moderators, Admins | Success team, Founders |
| Focus | Safety + compliance | Engagement + retention |

The CRM is a deeper, relationship-focused view of the User 360. Both point to the same user but serve different purposes.

---

## 3. User 360 — CRM View

Available at `/admin/crm/[user_id]`.

### 3.1 Header Summary Card

```
[Avatar]  Display Name           🔵 Pro Subscriber
          @username              📱 iOS | 🌍 VN | 🗣️ Vietnamese
          Joined: March 15, 2026 Last active: July 12, 2026
          [📧 h***@gmail.com]    [📌 Pin note] [💬 Add note]
```

### 3.2 Relationship Health Score (Optional Display)

Not a computed ML score — a simple qualitative indicator based on:
- Last active: < 7 days = 🟢, 7–30 = 🟡, > 30 = 🔴
- Subscription: Pro = 🟢, Free = ⚪
- Prior violations: 0 = 🟢, 1 = 🟡, 2+ = 🔴

Shown as colored indicators, not a number.

### 3.3 Lifecycle Timeline

A chronological reverse timeline of the user's key events:

```
📅 2026-07-12  Active session (iOS)
📅 2026-07-10  Uploaded review "Phở Hà Nội tuyệt vời"
📅 2026-07-08  Started Pro subscription (Stripe)
📅 2026-07-05  Hit free AI quota limit (3 times)
📅 2026-06-30  Joined platform
```

Events shown:
- Account milestones (signup, onboarding complete)
- Subscription events (upgrade, downgrade, lapse)
- Content events (uploads, significant engagement milestones)
- AI quota events (quota hit — useful to see Pro conversion trigger)
- Moderation events (warnings, suspensions)
- Admin notes from team

### 3.4 Engagement Summary

| Metric | Value |
|---|---|
| Total AI conversations | 47 |
| Total messages sent | 312 |
| Reviews uploaded | 8 |
| Total review views | 24,500 |
| Followers | 143 |
| Following | 67 |
| Days active (last 30) | 22 |
| Avg session length | 8 min |

### 3.5 Feature Usage Breakdown

Horizontal bar chart showing what percentage of this user's sessions involved each feature:
- Chat: 65%
- Explore: 45%
- Reviews: 30%
- Food: 20%
- Travel: 15%

### 3.6 Subscription History

| Date | Event | Amount | Platform |
|---|---|---|---|
| 2026-07-08 | Upgraded to Pro | $4.99/mo | Web (Stripe) |
| 2026-06-30 | Registered (Free) | — | iOS |

### 3.7 Internal Notes

Thread of admin notes visible only to back office team:

```
[📌 Pinned] 2026-07-10 — huy@tappyai.com (admin)
"Top creator in Food category. Reached out asking about creator program."

2026-07-05 — moderation@tappyai.com (moderator)
"User reported spam. Reviewed — not spam. Dismissed."
```

Add note form is always visible at the top.

### 3.8 Contact Actions

| Action | When Available |
|---|---|
| Send in-app message | Always (requires engagement.send permission) |
| Send push notification | If push token exists |
| Mark as VIP | Toggle — adds VIP tag to profile |
| Create support ticket | (Future — if support tool integrated) |

---

## 4. Segment-Based CRM

The CRM supports acting on segments, not just individual users.

From the Audience Segments page:
- View a segment's user list
- Export segment as CSV
- Send a campaign to the segment
- See aggregate metrics for the segment (avg session, avg AI usage, etc.)

---

## 5. VIP Users

Super Admin can mark users as VIP:
- VIP badge shown in user list and CRM header
- VIP users can be filtered in engagement campaigns
- VIP users can be excluded from certain moderation auto-actions
- VIP status is stored in `profiles.is_vip BOOLEAN` (new column)

---

## 6. Data Privacy in CRM

| Data | Visibility |
|---|---|
| Display name | All admin roles |
| Email (masked) | moderator, analyst |
| Email (full) | admin, super_admin |
| Conversation content | Not shown in CRM (privacy) |
| AI message count | All admin roles (count only) |
| Payment amount | admin, super_admin |
| Location (country) | All admin roles |

Conversation content is never shown in the back office. Only aggregates (count, cost) are visible. This protects user privacy and avoids back office becoming a surveillance tool.

---

## 7. Notes Architecture

Notes are stored in `user_notes` table (see `04_Database_Architecture.md`).

- Every note records `author_id` and `created_at`
- Notes can be pinned (float to top)
- Notes can be edited (only by author or admin)
- Note edits are NOT audited (low-risk internal text)
- Notes are NOT exposed to end users
- Notes are included in GDPR data export (transparency)

---

*End of CRM Architecture*
