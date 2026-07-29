# Production schema — PARTIAL introspection (live PostgREST, read-only)

> Generated 2026-07-05 from `GET /rest/v1/` (service_role). This is the LIVE
> production **table + column + type + PK/FK** structure — observed fact, not
> inference. It is NOT a substitute for `pg_dump --schema-only`: it does NOT
> contain RLS policies, triggers, function bodies, indexes, CHECK constraints,
> defaults, extensions, or storage config. Those are still required to author a
> complete, certifiable baseline (Blocker B).

```
HTTP 200

TABLES (29) via live PostgREST:
  billing_customers [4]: user_id:uuid PK, stripe_customer_id:text, created_at:timestamp with time zone, updated_at:timestamp with time zone
  bookings [15]: id:uuid PK, user_id:uuid, service_id:text, service_name:text, service_type:text, date:date, time:text, guests:integer, customer_name:text, customer_phone:text, notes:text, status:text, created_at:timestamp with time zone, updated_at:timestamp with time zone, place_id:text
  conversations [7]: id:uuid PK, user_id:uuid, title:text, category:text, messages:jsonb, created_at:timestamp with time zone, updated_at:timestamp with time zone
  favorites [7]: id:uuid PK, user_id:uuid, place_id:text, place_name:text, place_address:text, place_type:text, created_at:timestamp with time zone
  group_members [8]: id:uuid PK, group_id:uuid ->groups, name:text, budget:text, food_preferences:text, dietary_restrictions:text, area:text, created_at:timestamp with time zone
  groups [6]: id:uuid PK, creator_id:uuid, name:text, status:text, suggestion:text, created_at:timestamp with time zone
  message_feedback [7]: id:uuid PK, user_id:uuid, conversation_id:uuid ->conversations, message_index:integer, type:text, reason:text, created_at:timestamp with time zone
  music_categories [6]: id:uuid PK, slug:text, label_i18n:jsonb, sort_order:integer, is_active:boolean, created_at:timestamp with time zone
  music_providers [4]: id:uuid PK, slug:text, name:text, created_at:timestamp with time zone
  music_tracks [11]: id:uuid PK, title:text, artist:text, duration_sec:integer, audio_url:text, preview_url:text, cover_url:text, category_id:uuid ->music_categories, provider_id:uuid ->music_providers, is_active:boolean, created_at:timestamp with time zone
  music_usage [6]: id:uuid PK, track_id:uuid ->music_tracks, entity_type:text, entity_id:uuid, user_id:uuid, created_at:timestamp with time zone
  notification_subscriptions [7]: id:uuid PK, user_id:uuid, provider:text, subscription_data:jsonb, enabled:boolean, created_at:timestamp with time zone, updated_at:timestamp with time zone
  place_photos [3]: place_id:text PK, photo_url:text, created_at:timestamp with time zone
  price_watches [10]: id:uuid PK, user_id:uuid, product_name:text, target_price:bigint, current_price:bigint, search_query:text, status:text, notified_at:timestamp with time zone, last_checked:timestamp with time zone, created_at:timestamp with time zone
  profiles [10]: id:uuid PK, username:text, full_name:text, avatar_url:text, created_at:timestamp with time zone, updated_at:timestamp with time zone, onboarded:boolean, follower_count:integer, following_count:integer, language:text
  review_comments [5]: id:uuid PK, review_id:uuid ->reviews, user_id:uuid, body:text, created_at:timestamp with time zone
  review_interactions [6]: id:uuid PK, user_id:uuid, review_id:uuid ->reviews, watch_seconds:double precision, completion_rate:double precision, created_at:timestamp with time zone
  review_likes [4]: id:uuid PK, review_id:uuid ->reviews, user_id:uuid, created_at:timestamp with time zone
  review_milestones [4]: id:uuid PK, review_id:uuid ->reviews, milestone:integer, created_at:timestamp with time zone
  review_saves [4]: id:uuid PK, review_id:uuid ->reviews, user_id:uuid, created_at:timestamp with time zone
  reviews [24]: id:uuid PK, user_id:uuid ->profiles, place_id:text, place_name:text, place_address:text, rating:smallint, body:text, is_hidden:boolean, created_at:timestamp with time zone, photos:text[], is_verified:boolean, like_count:integer, comment_count:integer, content_type:text, media_url:text, thumbnail:text, hashtags:text[], watch_time_avg:double precision, completion_rate:double precision, save_count:integer, source_type:text, source_url:text, view_count:integer, music:jsonb
  services [15]: id:uuid PK, name:text, category:text, description:text, address:text, city:text, price_exact:numeric, price_unit:text, rating:numeric, phone:text, booking_url:text, images:text[], tags:text[], is_active:boolean, created_at:timestamp with time zone
  subscriptions [10]: id:uuid PK, user_id:uuid ->profiles, stripe_customer_id:text, stripe_sub_id:text, plan:text, status:text, current_period_end:timestamp with time zone, cancel_at_period_end:boolean, created_at:timestamp with time zone, updated_at:timestamp with time zone
  user_events [5]: id:uuid PK, user_id:uuid, event_type:text, metadata:jsonb, created_at:timestamp with time zone
  user_follows [4]: id:uuid PK, follower_id:uuid, following_id:uuid, created_at:timestamp with time zone
  user_integrations [11]: id:uuid PK, user_id:uuid, provider:text, access_token:text, refresh_token:text, expires_at:timestamp with time zone, scope:text, provider_user_id:text, metadata:jsonb, connected_at:timestamp with time zone, updated_at:timestamp with time zone
  user_memory [11]: id:uuid PK, user_id:text, location_base:text, preferences:jsonb, budget:jsonb, history:jsonb, updated_at:timestamp without time zone, companions:text, timing:text, personality:text, behavior_summary:text
  user_preferences [15]: user_id:uuid PK, budget_level:text, cuisine_likes:text[], dietary_restrictions:text, inferred_preferences:jsonb, updated_at:timestamp with time zone, budget_min:integer, budget_max:integer, preferred_style:text[], dietary_tags:text[], disliked_tags:text[], usual_party_size:integer, preference_profile:jsonb, profile_updated_at:timestamp with time zone, preferences:jsonb
  vouchers [12]: id:uuid PK, service_id:uuid ->services, title:text, original_price:numeric, sale_price:numeric, discount_pct:smallint, conditions:text, expires_at:timestamp with time zone, quantity_total:integer, quantity_sold:integer, is_active:boolean, created_at:timestamp with time zone

RPC FUNCTIONS (3): get_interaction_avgs, increment_review_view, sync_review_watch_stats
```
