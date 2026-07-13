# TappyAI Back Office — Event Catalog

**Version:** 1.1 (Review-hardened)  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13  
**Changelog:** v1.1 adds the affiliate/redirect events (a stated requirement), the anonymous-identity fields, `event_id`/`schema_version` in the envelope reference, and the event-governance rules (naming registry, versioning, ownership).

---

## 1. Objective

Define every trackable event in the TappyAI platform. This is the canonical reference for all analytics implementation across Web, Android, and iOS.

All events share the standard envelope defined in `06_Analytics_Architecture.md`. Every event MUST include `event_id` (UUID v4, for idempotency), `schema_version`, and exactly one of `user_id` / `anon_id`. See Analytics Architecture §8A and §8D.

### Event Governance Rules

| Rule | Requirement |
|---|---|
| **Registry** | This catalog is the ONLY authority for event names. An event that is not listed here must not be emitted. Adding an event requires a PR that updates this doc. |
| **Immutable semantics** | Once shipped, an event's meaning and required properties never change. To change semantics, create a new event (e.g. `_v2`) — never repurpose an existing name. |
| **Additive properties** | New optional properties may be added freely; required properties may never be added to an existing event (older clients would omit them). |
| **Ownership** | Each event domain has an owner (Product for feature events, Growth for auth/monetization, Eng for system events) responsible for its definition. |
| **Cross-platform parity** | The same `event_type` + `properties` shape must be emitted identically on Web, Android, and iOS. Divergence is a bug. |

---

## 2. Event Naming Convention

```
{domain}_{object}_{verb}

Examples:
  app_session_started
  chat_message_sent
  review_like_added
  subscription_upgraded
```

Rules:
- Lowercase snake_case only
- Domain comes first: `app`, `auth`, `chat`, `review`, `explore`, `music`, `search`, `subscription`, `notification`, `social`
- Verb in past tense: `started`, `sent`, `added`, `removed`, `opened`, `clicked`
- Be specific: `review_like_added` not `review_action`

---

## 3. System Events

| Event | Trigger | Key Properties |
|---|---|---|
| `app_session_started` | App foreground / tab focused | `is_new_session` |
| `app_session_ended` | App background / tab blur | `duration_sec`, `screens_visited` |
| `app_screen_viewed` | Screen/page navigation | `screen_name`, `previous_screen` |
| `app_error_occurred` | Unhandled error / crash | `error_type`, `error_message`, `screen_name` |

---

## 4. Auth Events

| Event | Trigger | Key Properties |
|---|---|---|
| `auth_signup_completed` | New account created | `method` (google/zalo/email/anonymous) |
| `auth_login_completed` | Successful login | `method` |
| `auth_logout_completed` | User logs out | |
| `auth_anonymous_started` | Anonymous session created | |
| `auth_anonymous_converted` | Anon user registers | `method` |
| `onboarding_step_completed` | Each onboarding step | `step_number`, `step_name` |
| `onboarding_completed` | Full onboarding done | `total_steps`, `duration_sec` |

---

## 5. Chat / AI Events

| Event | Trigger | Key Properties |
|---|---|---|
| `chat_conversation_started` | New conversation opened | `feature` (chat/food/travel/etc.) |
| `chat_message_sent` | User sends a message | `message_length`, `feature`, `has_image` |
| `chat_response_received` | AI response streamed | `latency_ms`, `output_tokens`, `model`, `feature` |
| `chat_tool_used` | AI tool invoked | `tool_name`, `feature` |
| `chat_message_regenerated` | User hits regenerate | `feature` |
| `chat_feedback_submitted` | Thumbs up/down | `feedback` (positive/negative), `feature` |
| `chat_quota_reached` | Free limit hit | `quota_type` (daily/anon) |
| `chat_memory_updated` | User memory written | |
| `chat_image_scanned` | OCR scan used | |
| `chat_shared` | Conversation shared | |

---

## 6. Explore / Feed Events

| Event | Trigger | Key Properties |
|---|---|---|
| `explore_feed_opened` | Feed tab opened | |
| `explore_review_viewed` | Review visible in feed | `review_id`, `creator_id`, `content_type`, `position` |
| `explore_review_played` | Video review played | `review_id`, `duration_sec` |
| `explore_review_watched` | >3s watch threshold | `review_id`, `watch_sec` |
| `explore_sound_page_opened` | Sound page opened from feed | `track_id` |
| `explore_category_selected` | Category pill tapped | `category` |
| `explore_search_performed` | Search in explore | `query`, `results_count` |

---

## 7. Review / Content Events

| Event | Trigger | Key Properties |
|---|---|---|
| `review_like_added` | User likes a review | `review_id`, `creator_id` |
| `review_like_removed` | User unlikes | `review_id` |
| `review_save_added` | User saves | `review_id` |
| `review_save_removed` | User unsaves | `review_id` |
| `review_comment_added` | User comments | `review_id` |
| `review_share_triggered` | Share button tapped | `review_id`, `share_method` |
| `review_reported` | User reports content | `review_id`, `reason` |
| `review_upload_started` | Upload flow begun | `content_type` |
| `review_upload_completed` | Upload succeeds | `review_id`, `content_type`, `duration_sec` |
| `review_upload_failed` | Upload fails | `error_type` |
| `review_profile_visited` | Creator profile opened from review | `creator_id` |

---

## 8. Music Events

| Event | Trigger | Key Properties |
|---|---|---|
| `music_library_opened` | Music tab opened | |
| `music_search_performed` | Search in music | `query`, `results_count` |
| `music_track_previewed` | Track play button tapped | `track_id`, `source` |
| `music_track_saved` | Track saved to library | `track_id` |
| `music_track_unsaved` | Track unsaved | `track_id` |
| `music_use_this_sound` | "Use this sound" tapped | `track_id` |
| `music_track_reported` | Track reported | `track_id`, `reason` |
| `music_category_selected` | Category selected | `category` |

---

## 9. Social Events

| Event | Trigger | Key Properties |
|---|---|---|
| `social_follow_added` | User follows another | `target_user_id` |
| `social_follow_removed` | User unfollows | `target_user_id` |
| `social_profile_viewed` | Profile page viewed | `target_user_id` |
| `social_comment_liked` | Comment like | `comment_id`, `review_id` |

---

## 10. Search Events

| Event | Trigger | Key Properties |
|---|---|---|
| `search_performed` | Any search | `query`, `search_type` (food/travel/explore/general), `results_count` |
| `search_result_clicked` | Result item tapped | `query`, `position`, `result_type` |
| `search_no_results` | Zero results returned | `query`, `search_type` |

---

## 11. Subscription / Monetization Events

| Event | Trigger | Key Properties |
|---|---|---|
| `subscription_upgrade_initiated` | Pro upgrade tapped | `trigger` (quota/feature_gate/manual), `plan` |
| `subscription_checkout_completed` | Payment success (Stripe webhook) | `plan`, `platform`, `revenue_usd` |
| `subscription_cancelled` | Subscription cancelled | `plan`, `duration_days` |
| `subscription_restored` | IAP restore tapped | `platform` |
| `subscription_expired` | Subscription lapses | `plan` |
| `iap_purchase_completed` | Apple IAP success | `product_id`, `revenue_usd` |

---

## 12. Notification Events

| Event | Trigger | Key Properties |
|---|---|---|
| `notification_permission_requested` | System permission dialog shown | `platform` |
| `notification_permission_granted` | User allows | `platform` |
| `notification_permission_denied` | User denies | `platform` |
| `notification_received` | Push notification received | `campaign_id`, `notification_type` |
| `notification_opened` | Push notification tapped | `campaign_id`, `notification_type` |
| `notification_clicked` | CTA within notification tapped | `campaign_id`, `action` |

---

## 12A. Affiliate / External Redirect Events

TappyAI's monetization funnel ends in affiliate/platform redirects (see `project_response_links` — CTAs are external platform search links per category). These are the bottom of the core funnel (App Open → AI Chat → Search → Recommendation → Affiliate Click → External Redirect) and MUST be tracked.

| Event | Trigger | Key Properties |
|---|---|---|
| `recommendation_shown` | A place/deal recommendation card is rendered | `category`, `item_id`, `position`, `source` (ai/search/feed) |
| `recommendation_clicked` | User taps a recommendation card | `category`, `item_id`, `position` |
| `affiliate_link_clicked` | User taps an outbound affiliate/platform CTA | `category`, `provider` (e.g. grab/booking/shopee), `item_id`, `link_type` |
| `external_redirect_completed` | Redirect to external platform initiated | `provider`, `category`, `item_id` |

**Attribution note:** because the redirect leaves the app, conversion on the partner side is not observable without partner postbacks (out of scope). These events measure intent and click-through, which is the measurable portion of the affiliate funnel. Partner postback integration is a Future Recommendation.

---

## 12B. Anonymous & Conversion Events

| Event | Trigger | Key Properties |
|---|---|---|
| `anon_session_started` | Anonymous session begins | `anon_id` |
| `anon_quota_reached` | Anonymous user hits free daily limit | `anon_id`, `quota_type` |
| `auth_anonymous_converted` | Anonymous user registers | `anon_id`, `user_id`, `method` |

The `auth_anonymous_converted` event carries **both** `anon_id` and `user_id` to stitch the pre/post-signup identity (Analytics Architecture §8D).

---

## 13. Feature Usage Events (Cross-Cutting)

These events apply when a user opens any named feature tab or section.

| Event | Trigger | Key Properties |
|---|---|---|
| `feature_opened` | User opens a named feature | `feature_key` |

`feature_key` values:
- `chat` — AI Chat tab
- `food` — Food AI
- `travel` — Travel AI
- `explore` — Explore feed
- `reviews` — Reviews tab
- `music` — Music library
- `games` — Games hub
- `profile` — Own profile
- `settings` — Settings
- `horoscope` — Horoscope page
- `fortune` — Fortune page
- `viet_writer` — VietWriter
- `currency` — Currency converter
- `weather` — Weather
- `deals` — Deals / shopping

---

## 14. Events Mapped to Dashboard Metrics

| Dashboard Metric | Computed From |
|---|---|
| DAU | Distinct `user_id` in any event |
| New Users | `auth_signup_completed` count |
| AI Conversations | `chat_conversation_started` count |
| Feature Usage Ranking | `feature_opened` grouped by `feature_key` |
| Review Uploads | `review_upload_completed` count |
| Subscription Conversions | `subscription_checkout_completed` count |
| Quota Hits | `chat_quota_reached` count |
| Search Trends | `search_performed` grouped by `query` |
| Notification CTR | `notification_clicked` / `notification_received` |
| Cohort Retention | Users with events on D+1, D+7, D+30 after `auth_signup_completed` |

---

## 15. Existing Events (Current `tracker.ts`)

The following events already exist in `src/lib/tracking/tracker.ts`. They must be **renamed or mapped** to the canonical names in this catalog during implementation:

| Current Event | Canonical Event | Action |
|---|---|---|
| `page_view` | `app_screen_viewed` | Rename + add `screen_name` |
| `page_time` | `app_session_ended` | Merge (session-level) |
| `chat_search` | `chat_message_sent` | Rename |
| `category_click` | `explore_category_selected` | Rename |
| `place_save` | `search_result_saved` (new) | Rename |
| `place_click` | `search_result_clicked` | Rename |
| `review_view` | `explore_review_viewed` | Rename |
| `deal_click` | `search_result_clicked` (deal type) | Merge |
| `feature_use` | `feature_opened` | Rename |
| `review_search` | `search_performed` (type=explore) | Rename |
| `review_like` | `review_like_added` | Rename |
| `review_share` | `review_share_triggered` | Rename |
| `review_post` | `review_upload_completed` | Rename |

**Migration note:** Old event names can remain in the database for historical data. New events use canonical names. Back office analytics queries must handle both names during transition period.

---

*End of Event Catalog*
