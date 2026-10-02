
-- ===== EXTENSIONS =====
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

-- ===== ENUM TYPES =====
CREATE TYPE public."admin_role" AS ENUM ('super_admin', 'admin', 'moderator', 'analyst');
CREATE TYPE public."moderation_action_type" AS ENUM ('warn', 'hide_content', 'restore_content', 'suspend_user', 'unsuspend_user', 'ban_user', 'restore_user', 'delete_content', 'dismiss_report');
CREATE TYPE public."moderation_status" AS ENUM ('pending', 'in_review', 'resolved', 'dismissed');
CREATE TYPE public."moderation_type" AS ENUM ('review_report', 'comment_report', 'user_report', 'music_report', 'ai_flag');

-- ===== DOMAINS =====

-- ===== SEQUENCES (non-identity) =====
CREATE SEQUENCE IF NOT EXISTS public."audit_log_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;

-- ===== TABLES =====
CREATE TABLE public."account_status" (
  "user_id" uuid NOT NULL,
  "is_suspended" boolean DEFAULT false NOT NULL,
  "suspended_until" timestamp with time zone,
  "is_banned" boolean DEFAULT false NOT NULL,
  "ban_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."activation_daily_rollup" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_date" date NOT NULL,
  "platform" text DEFAULT 'unknown'::text NOT NULL,
  "signup_source" text DEFAULT 'organic'::text NOT NULL,
  "rule_version" text DEFAULT 'none'::text NOT NULL,
  "signups_in_cohort" integer DEFAULT 0 NOT NULL,
  "activated_count" integer DEFAULT 0 NOT NULL,
  "activated_within_7d_count" integer DEFAULT 0 NOT NULL,
  "avg_time_to_activation_seconds" numeric,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."admin_permissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "permission" text NOT NULL,
  "granted" boolean DEFAULT true NOT NULL,
  "granted_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."admin_roles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" admin_role NOT NULL,
  "granted_by" uuid,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "notes" text
);
CREATE TABLE public."anon_chat_usage" (
  "user_id" uuid NOT NULL,
  "day" date NOT NULL,
  "count" integer DEFAULT 0 NOT NULL
);
CREATE TABLE public."audit_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid NOT NULL,
  "actor_email" text NOT NULL,
  "actor_role" text NOT NULL,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "before_state" jsonb,
  "after_state" jsonb,
  "metadata" jsonb,
  "ip_address" inet,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "seq" bigint NOT NULL,
  "prev_hash" bytea,
  "row_hash" bytea NOT NULL
);
CREATE TABLE public."auth_daily_rollup" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_date" date NOT NULL,
  "platform" text DEFAULT 'unknown'::text NOT NULL,
  "method" text DEFAULT 'unknown'::text NOT NULL,
  "signups" integer DEFAULT 0 NOT NULL,
  "logins_success" integer DEFAULT 0 NOT NULL,
  "logins_failed" integer DEFAULT 0 NOT NULL,
  "first_logins" integer DEFAULT 0 NOT NULL,
  "returning_logins" integer DEFAULT 0 NOT NULL,
  "unique_users" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."billing_customers" (
  "user_id" uuid NOT NULL,
  "stripe_customer_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."bookings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "service_id" text,
  "service_name" text NOT NULL,
  "service_type" text DEFAULT 'food'::text,
  "date" date NOT NULL,
  "time" text,
  "guests" integer DEFAULT 1,
  "customer_name" text NOT NULL,
  "customer_phone" text NOT NULL,
  "notes" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "place_id" text
);
CREATE TABLE public."chat_blocks" (
  "blocker_id" uuid NOT NULL,
  "blocked_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."chat_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "thread_id" uuid NOT NULL,
  "sender_id" uuid,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."chat_participants" (
  "thread_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."chat_reads" (
  "thread_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "last_read_at" timestamp with time zone DEFAULT '-infinity'::timestamp with time zone NOT NULL
);
CREATE TABLE public."chat_settings" (
  "id" boolean DEFAULT true NOT NULL,
  "reachability" text DEFAULT 'mutual_follow'::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."chat_threads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "kind" text NOT NULL,
  "title" text,
  "created_by" uuid,
  "direct_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."cohort_metrics" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cohort_date" date NOT NULL,
  "platform" text DEFAULT 'all'::text NOT NULL,
  "cohort_size" integer DEFAULT 0 NOT NULL,
  "d1_retained" integer DEFAULT 0 NOT NULL,
  "d7_retained" integer DEFAULT 0 NOT NULL,
  "d30_retained" integer DEFAULT 0 NOT NULL,
  "d1_rate" numeric(5,4) DEFAULT 0,
  "d7_rate" numeric(5,4) DEFAULT 0,
  "d30_rate" numeric(5,4) DEFAULT 0,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."comment_reactions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "comment_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "reaction" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."content_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "content_id" uuid NOT NULL,
  "reporter_source_id" text NOT NULL,
  "reason" text NOT NULL,
  "policy_id" text,
  "verification_state" text DEFAULT 'UNVERIFIED'::text NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."conversations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text DEFAULT 'Cuộc trò chuyện mới'::text,
  "category" text DEFAULT 'general'::text,
  "messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."daily_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_date" date NOT NULL,
  "platform" text DEFAULT 'all'::text NOT NULL,
  "total_users" integer DEFAULT 0 NOT NULL,
  "new_users" integer DEFAULT 0 NOT NULL,
  "returning_users" integer DEFAULT 0 NOT NULL,
  "dau" integer DEFAULT 0 NOT NULL,
  "wau" integer DEFAULT 0 NOT NULL,
  "mau" integer DEFAULT 0 NOT NULL,
  "is_final" boolean DEFAULT false NOT NULL,
  "reconciled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."decision_evidence" (
  "id" uuid NOT NULL,
  "owner_id" uuid NOT NULL,
  "evidence" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."department" (
  "id" text NOT NULL,
  "organization_id" uuid NOT NULL,
  "name_key" text NOT NULL,
  "display_name" text NOT NULL,
  "status" text DEFAULT 'placeholder'::text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."department_membership" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "department_id" text NOT NULL,
  "org_role" text NOT NULL,
  "scope" text DEFAULT 'GLOBAL'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."event_outbox" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "schema_version" smallint DEFAULT 1 NOT NULL,
  "type" text NOT NULL,
  "event_version" text NOT NULL,
  "producer" text NOT NULL,
  "actor" jsonb,
  "correlation_id" text,
  "security_class" text NOT NULL,
  "payload" jsonb,
  "metadata" jsonb,
  "occurred_at" timestamp with time zone NOT NULL,
  "consumer_id" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "attempts" smallint DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "delivered_at" timestamp with time zone
);
CREATE TABLE public."favorites" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "place_id" text NOT NULL,
  "place_name" text NOT NULL,
  "place_address" text,
  "place_type" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."group_members" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL,
  "name" text NOT NULL,
  "budget" text,
  "food_preferences" text,
  "dietary_restrictions" text,
  "area" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "user_id" uuid
);
CREATE TABLE public."groups" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "creator_id" uuid,
  "name" text NOT NULL,
  "status" text DEFAULT 'open'::text,
  "suggestion" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."marketing_campaigns" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "link" text,
  "category" text DEFAULT 'marketing'::text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "audience_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid NOT NULL,
  "activated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "activated_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);
CREATE TABLE public."marketing_consent" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "channel" text NOT NULL,
  "opted_in" boolean NOT NULL,
  "opted_in_at" timestamp with time zone,
  "opted_out_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."message_feedback" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "message_index" integer NOT NULL,
  "type" text NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."moderation_actions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "queue_id" uuid,
  "action" moderation_action_type NOT NULL,
  "actor_id" uuid NOT NULL,
  "target_user_id" uuid,
  "target_content_id" uuid,
  "reason" text NOT NULL,
  "duration_hours" integer,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."moderation_queue" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "type" moderation_type NOT NULL,
  "status" moderation_status DEFAULT 'pending'::moderation_status NOT NULL,
  "priority" smallint DEFAULT 1 NOT NULL,
  "reported_by" uuid,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "reason" text,
  "metadata" jsonb,
  "assigned_to" uuid,
  "resolved_by" uuid,
  "resolution" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);
CREATE TABLE public."music_categories" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "label_i18n" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."music_followed" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "track_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."music_providers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."music_saved" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "track_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."music_track_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "track_id" uuid NOT NULL,
  "reporter_id" uuid,
  "reason" text NOT NULL,
  "details" text,
  "status" text DEFAULT 'open'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."music_tracks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "artist" text,
  "duration_sec" integer NOT NULL,
  "audio_url" text NOT NULL,
  "preview_url" text,
  "cover_url" text,
  "category_id" uuid,
  "provider_id" uuid NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "music_type" text DEFAULT 'royalty_free'::text NOT NULL,
  "play_count" integer DEFAULT 0 NOT NULL,
  "uploaded_by" uuid,
  "rights_confirmed" boolean DEFAULT false NOT NULL
);
CREATE TABLE public."music_usage" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "track_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."notification_deliveries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "channel" text DEFAULT 'push'::text NOT NULL,
  "category" text DEFAULT 'marketing'::text NOT NULL,
  "status" text NOT NULL,
  "skip_reason" text,
  "notification_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."notification_subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" text DEFAULT 'webpush'::text NOT NULL,
  "subscription_data" jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "type" text NOT NULL,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "actor_id" uuid,
  "entity_url" text,
  "image_url" text,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "read_at" timestamp with time zone,
  "push_status" text DEFAULT 'pending'::text NOT NULL,
  "push_sent_at" timestamp with time zone,
  "push_attempts" integer DEFAULT 0 NOT NULL,
  "push_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."organization" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."partner_deal_translations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "category" text,
  "title" text,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."partner_deals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_name" text NOT NULL,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "official_url" text NOT NULL,
  "banner_image" text,
  "logo_image" text,
  "display_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "start_at" timestamp with time zone,
  "end_at" timestamp with time zone,
  "country_code" text DEFAULT 'VN'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "partner_slug" text NOT NULL,
  "partner_type" text DEFAULT 'ecommerce'::text NOT NULL,
  "affiliate_code" text,
  "is_featured" boolean DEFAULT false NOT NULL,
  "click_count" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE public."place_photos" (
  "place_id" text NOT NULL,
  "photo_url" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."platform_owner" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "assigned_by" text NOT NULL,
  "revoked_at" timestamp with time zone,
  "notes" text
);
CREATE TABLE public."platform_owner_recovery" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "target_user_id" uuid NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "closed_at" timestamp with time zone,
  "outcome" text,
  "reason" text NOT NULL
);
CREATE TABLE public."platform_settings" (
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "scope" text DEFAULT 'global'::text NOT NULL,
  "value_schema" text,
  "updated_by" uuid
);
CREATE TABLE public."price_watches" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "product_name" text NOT NULL,
  "target_price" bigint NOT NULL,
  "current_price" bigint,
  "search_query" text NOT NULL,
  "status" text DEFAULT 'active'::text,
  "notified_at" timestamp with time zone,
  "last_checked" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."profiles" (
  "id" uuid NOT NULL,
  "username" text,
  "full_name" text,
  "avatar_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "onboarded" boolean DEFAULT false,
  "follower_count" integer DEFAULT 0,
  "following_count" integer DEFAULT 0,
  "language" text
);
CREATE TABLE public."review_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "parent_comment_id" uuid
);
CREATE TABLE public."review_interactions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "review_id" uuid,
  "watch_seconds" double precision DEFAULT 0,
  "completion_rate" double precision DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."review_likes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."review_milestones" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL,
  "milestone" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."review_saves" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."review_shares" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "channel" text DEFAULT 'unknown'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."reviews" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "place_id" text NOT NULL,
  "place_name" text NOT NULL,
  "place_address" text,
  "rating" smallint DEFAULT 0,
  "body" text DEFAULT ''::text,
  "is_hidden" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "photos" text[] DEFAULT '{}'::text[],
  "is_verified" boolean DEFAULT false,
  "like_count" integer DEFAULT 0,
  "comment_count" integer DEFAULT 0,
  "content_type" text DEFAULT 'photo'::text,
  "media_url" text,
  "thumbnail" text,
  "hashtags" text[],
  "watch_time_avg" double precision DEFAULT 0,
  "completion_rate" double precision DEFAULT 0,
  "save_count" integer DEFAULT 0,
  "source_type" text DEFAULT 'upload'::text,
  "source_url" text,
  "view_count" integer DEFAULT 0,
  "music" jsonb,
  "publication_state" text,
  "safety_state" text,
  "evaluated_version" text,
  "evaluated_at" timestamp with time zone
);
CREATE TABLE public."services" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "address" text,
  "city" text DEFAULT 'ho-chi-minh'::text,
  "price_exact" numeric,
  "price_unit" text DEFAULT 'per_person'::text,
  "rating" numeric(2,1),
  "phone" text,
  "booking_url" text,
  "images" text[] DEFAULT '{}'::text[],
  "tags" text[] DEFAULT '{}'::text[],
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "stripe_customer_id" text,
  "stripe_sub_id" text,
  "plan" text DEFAULT 'free'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."system_health_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "check_name" text NOT NULL,
  "status" text NOT NULL,
  "latency_ms" integer,
  "message" text,
  "metadata" jsonb,
  "checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."user_acquisition" (
  "user_id" uuid NOT NULL,
  "anon_id" uuid,
  "signup_method" text,
  "signup_platform" text,
  "signup_app_version" text,
  "signup_device_type" text,
  "signup_country" text,
  "signup_language" text,
  "acquisition_source" text,
  "signup_at" timestamp with time zone,
  "first_login_at" timestamp with time zone,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "activated_at" timestamp with time zone,
  "activation_rule_version" text
);
CREATE TABLE public."user_demographics" (
  "user_id" uuid NOT NULL,
  "date_of_birth" date,
  "age_declared_at" timestamp with time zone,
  "dob_corrections" smallint DEFAULT 0 NOT NULL,
  "admin_corrections" smallint DEFAULT 0 NOT NULL,
  "gender" text,
  "gender_self_describe" text,
  "city" text,
  "country" text,
  "occupation" text,
  "industry" text,
  "education_level" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."user_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "event_type" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "place_id" uuid,
  "review_id" uuid,
  "event_id" uuid,
  "schema_version" smallint DEFAULT 1 NOT NULL,
  "anon_id" uuid,
  "platform" text,
  "app_version" text,
  "build_number" text,
  "os_name" text,
  "os_version" text,
  "device_type" text,
  "country" text,
  "language" text,
  "session_id" text,
  "client_timestamp" timestamp with time zone,
  "is_unknown_event" boolean DEFAULT false NOT NULL,
  "device_context" jsonb
);
CREATE TABLE public."user_follows" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "follower_id" uuid NOT NULL,
  "following_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."user_integrations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "expires_at" timestamp with time zone,
  "scope" text,
  "provider_user_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "connected_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."user_memory" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "location_base" text,
  "preferences" jsonb DEFAULT '{}'::jsonb,
  "budget" jsonb DEFAULT '{}'::jsonb,
  "history" jsonb DEFAULT '[]'::jsonb,
  "updated_at" timestamp without time zone DEFAULT now(),
  "companions" text,
  "timing" text,
  "personality" text,
  "behavior_summary" text,
  "discovery_city" text
);
CREATE TABLE public."user_notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "note" text NOT NULL,
  "is_pinned" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."user_preferences" (
  "user_id" uuid NOT NULL,
  "budget_level" text,
  "cuisine_likes" text[] DEFAULT '{}'::text[],
  "dietary_restrictions" text,
  "inferred_preferences" jsonb DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone DEFAULT now(),
  "budget_min" integer,
  "budget_max" integer,
  "preferred_style" text[] DEFAULT '{}'::text[],
  "dietary_tags" text[] DEFAULT '{}'::text[],
  "disliked_tags" text[] DEFAULT '{}'::text[],
  "usual_party_size" integer,
  "preference_profile" jsonb,
  "profile_updated_at" timestamp with time zone,
  "preferences" jsonb DEFAULT '[]'::jsonb
);
CREATE TABLE public."vouchers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "service_id" uuid,
  "title" text NOT NULL,
  "original_price" numeric NOT NULL,
  "sale_price" numeric NOT NULL,
  "discount_pct" smallint,
  "conditions" text,
  "expires_at" timestamp with time zone,
  "quantity_total" integer,
  "quantity_sold" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now()
);

-- ===== FUNCTIONS =====
SET check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.admin_set_user_date_of_birth(p_user_id uuid, p_dob date, p_actor_id uuid, p_actor_email text, p_actor_role text, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_before_dob  DATE;
  v_exists      BOOLEAN;
  v_before_band TEXT;
  v_after_band  TEXT;
BEGIN
  IF p_user_id IS NULL OR p_actor_id IS NULL
     OR coalesce(trim(p_actor_email), '') = '' OR coalesce(trim(p_actor_role), '') = '' THEN
    RETURN 'invalid_actor';
  END IF;

  IF coalesce(length(trim(p_reason)), 0) < 20 THEN
    RETURN 'reason_too_short';
  END IF;

  IF p_dob IS NULL OR p_dob > CURRENT_DATE OR p_dob <= DATE '1900-01-01' THEN
    RETURN 'invalid_date';
  END IF;

  -- The subject must be a real account. An anonymous identity has no profile
  -- row, so there is nothing to correct and the FK would refuse the write.
  SELECT true INTO v_exists FROM public.profiles WHERE id = p_user_id;
  IF NOT coalesce(v_exists, false) THEN
    RETURN 'user_not_found';
  END IF;

  SELECT d.date_of_birth INTO v_before_dob
    FROM public.user_demographics d WHERE d.user_id = p_user_id;

  v_before_band := public.age_band_of(v_before_dob);
  v_after_band  := public.age_band_of(p_dob);

  INSERT INTO public.user_demographics (user_id, date_of_birth, age_declared_at, admin_corrections)
  VALUES (p_user_id, p_dob, now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET date_of_birth     = EXCLUDED.date_of_birth,
        age_declared_at   = EXCLUDED.age_declared_at,
        admin_corrections = public.user_demographics.admin_corrections + 1,
        updated_at        = now();

  -- Same statement, same transaction: the change and its record commit together
  -- or not at all. The chain trigger (Component 7) links this row like any other.
  INSERT INTO public.audit_log (
    actor_id, actor_email, actor_role, action, target_type, target_id,
    before_state, after_state, metadata
  ) VALUES (
    p_actor_id, p_actor_email, p_actor_role,
    'user.date_of_birth.corrected', 'user', p_user_id::text,
    jsonb_build_object('age_band', v_before_band, 'had_date_of_birth', v_before_dob IS NOT NULL),
    jsonb_build_object('age_band', v_after_band),
    jsonb_build_object('reason', trim(p_reason))
  );

  RETURN 'corrected';
END;
$function$;
CREATE OR REPLACE FUNCTION public.age_band_of(p_dob date)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_dob IS NULL THEN NULL
    WHEN date_part('year', age(CURRENT_DATE, p_dob)) < 18 THEN 'under_18'
    WHEN date_part('year', age(CURRENT_DATE, p_dob)) < 25 THEN '18_24'
    WHEN date_part('year', age(CURRENT_DATE, p_dob)) < 35 THEN '25_34'
    WHEN date_part('year', age(CURRENT_DATE, p_dob)) < 45 THEN '35_44'
    WHEN date_part('year', age(CURRENT_DATE, p_dob)) < 55 THEN '45_54'
    WHEN date_part('year', age(CURRENT_DATE, p_dob)) < 65 THEN '55_64'
    ELSE '65_plus'
  END
$function$;
CREATE OR REPLACE FUNCTION public.anon_chat_usage_increment()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  new_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  -- Only anonymous sessions consume this counter; logged-in users are governed
  -- by the free/pro tier logic in /api/chat.
  IF NOT COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'not an anonymous session';
  END IF;

  INSERT INTO public.anon_chat_usage (user_id, day, count)
  VALUES (auth.uid(), (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 1)
  ON CONFLICT (user_id, day)
  DO UPDATE SET count = anon_chat_usage.count + 1
  RETURNING count INTO new_count;

  RETURN new_count;
END;
$function$;
CREATE OR REPLACE FUNCTION public.anon_chat_usage_today()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  used integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  -- Same gate as the increment function: this counter belongs to anonymous sessions.
  -- A logged-in user is governed by the free/pro tier logic and has no row here; letting
  -- them read it would return 0 and invite a caller to treat that as "no quota used".
  IF NOT COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'not an anonymous session';
  END IF;

  SELECT count INTO used
  FROM public.anon_chat_usage
  WHERE user_id = auth.uid()
    AND day = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  -- No row means no attempt today. The day boundary is Asia/Ho_Chi_Minh, identical to
  -- the increment function's — a different timezone here would reset the displayed
  -- count hours before or after the enforced one, which is the same class of bug.
  RETURN COALESCE(used, 0);
END;
$function$;
CREATE OR REPLACE FUNCTION public.chat_can_reach(p_target uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me     UUID := auth.uid();
  v_policy TEXT;
BEGIN
  IF v_me IS NULL OR p_target IS NULL OR p_target = v_me THEN
    RETURN false;
  END IF;

  -- A block stops the conversation before any policy is consulted, in BOTH
  -- directions. Someone you blocked must not be able to reach you either.
  IF EXISTS (
    SELECT 1 FROM public.chat_blocks
     WHERE (blocker_id = v_me AND blocked_id = p_target)
        OR (blocker_id = p_target AND blocked_id = v_me)
  ) THEN
    RETURN false;
  END IF;

  -- An existing conversation always wins. Once two people are talking, an
  -- unfollow or a later policy change must not break the thread in progress.
  IF EXISTS (
    SELECT 1 FROM public.chat_threads
     WHERE kind = 'direct'
       AND direct_key = LEAST(v_me::text, p_target::text) || ':' || GREATEST(v_me::text, p_target::text)
  ) THEN
    RETURN true;
  END IF;

  SELECT reachability INTO v_policy FROM public.chat_settings WHERE id;
  -- No settings row is not permission to open the doors.
  v_policy := COALESCE(v_policy, 'mutual_follow');

  IF v_policy = 'anyone' THEN
    RETURN true;
  END IF;

  IF v_policy = 'recipient_follows_sender' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_follows
       WHERE follower_id = p_target AND following_id = v_me
    );
  END IF;

  -- mutual_follow (the default, and the fallback for any unknown value).
  RETURN EXISTS (SELECT 1 FROM public.user_follows WHERE follower_id = v_me     AND following_id = p_target)
     AND EXISTS (SELECT 1 FROM public.user_follows WHERE follower_id = p_target AND following_id = v_me);
END;
$function$;
CREATE OR REPLACE FUNCTION public.chat_create_group(p_title text, p_members uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me      UUID := auth.uid();
  v_thread  UUID;
  v_members UUID[];
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501';
  END IF;

  -- Distinct, real, and never the creator twice. A group of one is a note to
  -- self, not a conversation.
  SELECT COALESCE(array_agg(DISTINCT u.id), '{}')
    INTO v_members
    FROM auth.users u
   WHERE u.id = ANY(COALESCE(p_members, '{}'::uuid[])) AND u.id <> v_me;

  IF array_length(v_members, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_members' USING ERRCODE = '22023';
  END IF;
  IF array_length(v_members, 1) > 49 THEN
    RAISE EXCEPTION 'too_many_members' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.chat_threads (kind, title, created_by)
       VALUES ('group', NULLIF(btrim(COALESCE(p_title, '')), ''), v_me)
    RETURNING id INTO v_thread;

  INSERT INTO public.chat_participants (thread_id, user_id)
       SELECT v_thread, m FROM unnest(v_members || v_me) AS m
  ON CONFLICT DO NOTHING;

  RETURN v_thread;
END;
$function$;
CREATE OR REPLACE FUNCTION public.chat_is_participant(p_thread uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE thread_id = p_thread AND user_id = auth.uid()
  );
$function$;
CREATE OR REPLACE FUNCTION public.chat_start_direct(p_target uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me     UUID := auth.uid();
  v_key    TEXT;
  v_thread UUID;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_target IS NULL OR p_target = v_me THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target) THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;

  -- 🚨 THE GATE. Same error, same code, same message as "no such account": a
  -- caller must not be able to tell "that account does not exist" from "that
  -- account exists and will not hear from you". Distinguishing them turns this
  -- RPC into a user-enumeration oracle.
  IF NOT public.chat_can_reach(p_target) THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;

  v_key := LEAST(v_me::text, p_target::text) || ':' || GREATEST(v_me::text, p_target::text);

  INSERT INTO public.chat_threads (kind, direct_key, created_by)
       VALUES ('direct', v_key, v_me)
  ON CONFLICT (direct_key) WHERE kind = 'direct' DO NOTHING
    RETURNING id INTO v_thread;

  IF v_thread IS NULL THEN
    SELECT id INTO v_thread FROM public.chat_threads
     WHERE direct_key = v_key AND kind = 'direct';
    RETURN v_thread;
  END IF;

  INSERT INTO public.chat_participants (thread_id, user_id)
       VALUES (v_thread, v_me), (v_thread, p_target)
  ON CONFLICT DO NOTHING;

  RETURN v_thread;
END;
$function$;
CREATE OR REPLACE FUNCTION public.chat_thread_blocked(p_thread uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.chat_participants p
      JOIN public.chat_blocks b
        ON (b.blocker_id = auth.uid() AND b.blocked_id = p.user_id)
        OR (b.blocker_id = p.user_id  AND b.blocked_id = auth.uid())
     WHERE p.thread_id = p_thread
       AND p.user_id <> auth.uid()
  );
$function$;
CREATE OR REPLACE FUNCTION public.chat_thread_summaries()
 RETURNS TABLE(thread_id uuid, kind text, title text, last_message_at timestamp with time zone, last_body text, last_sender_id uuid, last_created_at timestamp with time zone, unread_count integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    t.id,
    t.kind,
    t.title,
    t.last_message_at,
    m.body,
    m.sender_id,
    m.created_at,
    (
      SELECT count(*)::int
        FROM public.chat_messages um
       WHERE um.thread_id = t.id
         AND um.sender_id IS DISTINCT FROM auth.uid()
         AND um.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
    )
  FROM public.chat_threads t
  LEFT JOIN LATERAL (
    SELECT body, sender_id, created_at
      FROM public.chat_messages
     WHERE thread_id = t.id
     ORDER BY created_at DESC, id DESC
     LIMIT 1
  ) m ON TRUE
  LEFT JOIN public.chat_reads r
    ON r.thread_id = t.id AND r.user_id = auth.uid()
  ORDER BY t.last_message_at DESC
  LIMIT 100;
$function$;
CREATE OR REPLACE FUNCTION public.chat_touch_thread()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.chat_threads
     SET last_message_at = NEW.created_at
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.decision_evidence_load(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  found JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT evidence INTO found
    FROM public.decision_evidence
   WHERE id = p_id
     AND owner_id = auth.uid()
     AND expires_at > now();

  RETURN found;
END;
$function$;
CREATE OR REPLACE FUNCTION public.decision_evidence_save(p_id uuid, p_evidence jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.decision_evidence (id, owner_id, evidence, expires_at)
  VALUES (p_id, auth.uid(), p_evidence, now() + interval '2 hours')
  -- Re-writing an id the caller already owns is a retry, not a takeover: the
  -- owner_id predicate means a second caller can never overwrite the first's row.
  ON CONFLICT (id) DO UPDATE
    SET evidence = EXCLUDED.evidence, expires_at = EXCLUDED.expires_at
    WHERE public.decision_evidence.owner_id = auth.uid();

  DELETE FROM public.decision_evidence
   WHERE owner_id = auth.uid() AND expires_at <= now();

  DELETE FROM public.decision_evidence
   WHERE owner_id = auth.uid()
     AND id NOT IN (
       SELECT id FROM public.decision_evidence
        WHERE owner_id = auth.uid()
        ORDER BY created_at DESC
        LIMIT 3
     );
END;
$function$;
CREATE OR REPLACE FUNCTION public.disown_push_credential(p_credential text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_credential IS NULL OR length(p_credential) = 0 THEN
    RAISE EXCEPTION 'credential required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notification_subscriptions
     SET enabled = false
   WHERE enabled
     AND user_id <> caller
     AND public.push_credential(subscription_data) = p_credential;

  RETURN EXISTS (
    SELECT 1
      FROM public.notification_subscriptions
     WHERE enabled
       AND user_id = caller
       AND public.push_credential(subscription_data) = p_credential
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_audit_log_chain()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prev BYTEA;
  v_memo TEXT;
  v_xid  TEXT;
BEGIN
  -- P1. Under REPEATABLE READ or SERIALIZABLE the snapshot is pinned at
  -- transaction start, so a second writer cannot see the first writer's
  -- committed row and two HONEST writes fork the chain. Fail loudly instead.
  -- What P1 actually requires is per-statement snapshots. PostgreSQL provides
  -- those at READ COMMITTED and, identically, at READ UNCOMMITTED â€” the docs
  -- state Read Uncommitted "behaves like Read Committed"; the name is accepted
  -- for SQL-standard compatibility and maps onto the same implementation.
  -- Rejecting it by string comparison was a FALSE POSITIVE, and because
  -- writeAuditLog is fire-and-forget and swallows errors, the rejected row
  -- vanished with nothing but a console line. REPEATABLE READ and SERIALIZABLE
  -- pin the snapshot at transaction start and genuinely do fork the chain.
  IF current_setting('transaction_isolation') NOT IN ('read committed', 'read uncommitted') THEN
    RAISE EXCEPTION
      'audit_log chain requires READ COMMITTED (got %). See Component 7 precondition P1.',
      current_setting('transaction_isolation')
      USING ERRCODE = '25001';
  END IF;

  -- P2. Transaction-scoped: held through COMMIT, so the critical section
  -- includes the insert; released on commit, rollback AND backend crash.
  PERFORM pg_advisory_xact_lock(477100701);

  -- P3. Allocated INSIDE the lock. A column default would be evaluated when the
  -- tuple is formed â€” before this trigger fires â€” and two concurrent inserts
  -- could then chain in the opposite order to their sequence numbers.
  NEW.seq := nextval('audit_log_seq');

  -- P6/P9. Memo first: rows inserted by the CURRENT command are invisible to
  -- that command's snapshot, so a multi-row INSERT would otherwise chain every
  -- row to the same predecessor. Hex both ways â€” an implicit bytea->text cast
  -- yields the \x... form, which does not round-trip through decode().
  -- The memo is STAMPED WITH THE TRANSACTION ID and only believed when the
  -- stamp matches. Without that, the trigger trusted any value the GUC happened
  -- to hold, and two reproduced failures followed:
  --
  --   SET audit.chain_head = 'deadbeef'      -> the row chained to a fabricated
  --                                             predecessor; verifier reports
  --                                             prev_mismatch on honest writes.
  --   SET audit.chain_head = 'not-hex'       -> decode() raised, the INSERT
  --                                             failed, writeAuditLog swallowed
  --                                             it, and EVERY audit row was
  --                                             silently lost.
  --
  -- P8 anticipated only a function-level SET clause. A session-, role- or
  -- database-level SET reaches the same GUC and neither is_local nor P8 sees it.
  -- With the stamp, anything this transaction did not write is simply ignored
  -- and the table read takes over â€” wrong input degrades to correct behaviour
  -- instead of to corruption or an outage.
  v_xid  := pg_current_xact_id()::TEXT;
  v_memo := current_setting('audit.chain_head', true);
  IF v_memo IS NOT NULL AND split_part(v_memo, ':', 1) = v_xid THEN
    v_prev := decode(split_part(v_memo, ':', 2), 'hex');
  ELSE
    -- P5. Inline, never a LANGUAGE sql helper: the planner may inline such a
    -- helper into the calling query and it would adopt the wrong snapshot.
    SELECT a.row_hash INTO v_prev FROM audit_log a ORDER BY a.seq DESC LIMIT 1;
  END IF;

  NEW.prev_hash := v_prev;
  NEW.row_hash  := fn_audit_row_hash(
      v_prev, NEW.seq, NEW.id, NEW.actor_id, NEW.actor_email, NEW.actor_role, NEW.action,
      NEW.target_type, NEW.target_id, NEW.before_state, NEW.after_state,
      NEW.metadata, NEW.ip_address, NEW.user_agent, NEW.created_at);

  PERFORM set_config('audit.chain_head', v_xid || ':' || encode(NEW.row_hash, 'hex'), true);

  RETURN NEW;
  -- P7. No EXCEPTION handler: it would open an implicit subtransaction, and the
  -- memo could revert while the handler proceeded.
END
$function$;
CREATE OR REPLACE FUNCTION public.fn_audit_part(p_value text)
 RETURNS bytea
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    WHEN p_value IS NULL THEN int4send(-1)
    ELSE int4send(length(p_value)) || convert_to(p_value, 'UTF8')
  END
$function$;
CREATE OR REPLACE FUNCTION public.fn_audit_row_hash(p_prev bytea, p_seq bigint, p_id uuid, p_actor_id uuid, p_actor_email text, p_actor_role text, p_action text, p_target_type text, p_target_id text, p_before_state jsonb, p_after_state jsonb, p_metadata jsonb, p_ip_address inet, p_user_agent text, p_created_at timestamp with time zone)
 RETURNS bytea
 LANGUAGE sql
 STABLE
AS $function$
  SELECT sha256(
       COALESCE(p_prev, int4send(-1))
    || fn_audit_part(p_seq::TEXT)
    || fn_audit_part(p_id::TEXT)
    || fn_audit_part(p_actor_id::TEXT)
    || fn_audit_part(p_actor_email)
    || fn_audit_part(p_actor_role)
    || fn_audit_part(p_action)
    || fn_audit_part(p_target_type)
    || fn_audit_part(p_target_id)
    || fn_audit_part(p_before_state::TEXT)
    || fn_audit_part(p_after_state::TEXT)
    || fn_audit_part(p_metadata::TEXT)
    || fn_audit_part(p_ip_address::TEXT)
    || fn_audit_part(p_user_agent)
    || fn_audit_part(fn_audit_ts(p_created_at))
  )
$function$;
CREATE OR REPLACE FUNCTION public.fn_audit_ts(p_ts timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT to_char(p_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
$function$;
CREATE OR REPLACE FUNCTION public.fn_claim_anonymous_conversations(p_anon_id uuid, p_target_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    moved integer;
BEGIN
    -- Structural guards. These are not a substitute for the route's token verification;
    -- they make misuse impossible to express even from a service-role context.
    IF p_anon_id IS NULL OR p_target_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_CLAIM: both ids are required'
            USING ERRCODE = '22004';
    END IF;
    IF p_anon_id = p_target_id THEN
        -- A self-claim is meaningless and would let a caller "launder" a no-op as success.
        RAISE EXCEPTION 'INVALID_CLAIM: source and target must differ'
            USING ERRCODE = '22023';
    END IF;

    -- The whole transfer is ONE statement, so it is atomic by construction: there is no
    -- interleaving point at which some conversations have moved and others have not.
    -- Idempotent: after the first claim no rows match p_anon_id, so a repeat moves 0 and
    -- cannot duplicate anything (rows MOVE, they are never copied).
    UPDATE public.conversations
       SET user_id    = p_target_id,
           updated_at = now()
     WHERE user_id = p_anon_id;

    GET DIAGNOSTICS moved = ROW_COUNT;
    RETURN moved;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_finalize_daily_snapshots(p_before date)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  UPDATE public.daily_snapshots
     SET is_final = true, reconciled_at = now(), updated_at = now()
   WHERE snapshot_date < p_before
     AND is_final = false;
$function$;
CREATE OR REPLACE FUNCTION public.fn_grant_admin_role(p_actor_id uuid, p_user_id uuid, p_role admin_role, p_notes text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS admin_roles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_row admin_roles;
BEGIN
    -- Constitutional rule: nobody may promote themselves. Checked first so it
    -- applies to the Owner too — the Owner has no reason to self-grant, and an
    -- audit trail showing self-grants would be indistinguishable from abuse.
    IF p_actor_id = p_user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: self-promotion is not permitted'
            USING ERRCODE = '42501';
    END IF;

    -- Constitutional rule: only the Platform Owner may create a Super Admin.
    IF p_role = 'super_admin' AND NOT fn_is_platform_owner(p_actor_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: only the Platform Owner may grant super_admin'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO admin_roles (user_id, role, granted_by, notes, expires_at)
    VALUES (p_user_id, p_role, p_actor_id, p_notes, p_expires_at)
    RETURNING * INTO v_row;

    RETURN v_row;
END$function$;
CREATE OR REPLACE FUNCTION public.fn_ingest_moderation_reports()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- MUSIC REPORTS. This table stores the raw reporter id and always has; §4.4's
  -- `reported_by` is exactly what it holds, so it is carried straight through.
  INSERT INTO public.moderation_queue
    (type, status, priority, reported_by, target_type, target_id, reason, metadata, created_at)
  SELECT
    'music_report'::moderation_type,
    'pending'::moderation_status,
    1,
    r.reporter_id,
    'music_track',
    r.track_id,
    r.reason,
    jsonb_build_object('source_table', 'music_track_reports', 'source_id', r.id::text),
    r.created_at
  FROM public.music_track_reports r
  ON CONFLICT DO NOTHING;

  -- CONTENT-SAFETY REPORTS. ADR-026: `reported_by` is NULL and the opaque
  -- `reporter_source_id` goes into `metadata` instead.
  --
  -- Note what is NOT here: no join to `profiles`, no join to `auth.users`,
  -- no lookup of any kind. There is nothing to join on - the source id is
  -- derived one-way - and adding one would break ADR-026 silently.
  INSERT INTO public.moderation_queue
    (type, status, priority, reported_by, target_type, target_id, reason, metadata, created_at)
  SELECT
    'review_report'::moderation_type,
    'pending'::moderation_status,
    1,
    NULL,
    'review',
    c.content_id,
    c.reason,
    jsonb_build_object(
      'source_table', 'content_reports',
      'source_id', c.id::text,
      -- Opaque provenance. Distinguishes sources; identifies none.
      'reporter_source_id', c.reporter_source_id,
      'policy_id', c.policy_id,
      'verification_state', c.verification_state
    ),
    c.created_at
  FROM public.content_reports c
  ON CONFLICT DO NOTHING;
$function$;
CREATE OR REPLACE FUNCTION public.fn_is_platform_owner(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM platform_owner
        WHERE user_id = p_user_id AND active = true
    );
$function$;
CREATE OR REPLACE FUNCTION public.fn_original_sound_is_servable(p_track uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    -- ORPHAN — no originating clip. Not this gate's subject matter (Option A).
    NOT EXISTS (
      SELECT 1 FROM public.reviews r
       WHERE r.music->>'trackId' = p_track::text
         AND r.music->>'origin'  = 'original')
    -- …or at least one originating clip is publishable.
    OR EXISTS (
      SELECT 1 FROM public.reviews r
       WHERE r.music->>'trackId' = p_track::text
         AND r.music->>'origin'  = 'original'
         AND (r.publication_state IS NULL OR r.publication_state = 'PUBLISHED'));
$function$;
CREATE OR REPLACE FUNCTION public.fn_outbox_claim(p_ready_consumers text[], p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, event_id uuid, type text, event_version text, producer text, actor jsonb, correlation_id text, security_class text, payload jsonb, metadata jsonb, occurred_at timestamp with time zone, consumer_id text, attempts smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT o.id
      FROM event_outbox o
     WHERE o.status = 'pending'
       AND o.next_attempt_at <= now()
       AND o.consumer_id = ANY(COALESCE(p_ready_consumers, ARRAY[]::TEXT[]))
     ORDER BY o.created_at
     LIMIT GREATEST(p_limit, 0)
     FOR UPDATE SKIP LOCKED          -- two overlapping drains never contend
  )
  UPDATE event_outbox o
     SET attempts = o.attempts + 1
    FROM claimed
   WHERE o.id = claimed.id
  RETURNING
    o.id, o.event_id, o.type, o.event_version, o.producer, o.actor,
    o.correlation_id, o.security_class, o.payload, o.metadata, o.occurred_at,
    o.consumer_id, o.attempts;
END
$function$;
CREATE OR REPLACE FUNCTION public.fn_outbox_publish(p_event_id uuid, p_type text, p_event_version text, p_producer text, p_security_class text, p_occurred_at timestamp with time zone, p_consumer_ids text[], p_actor jsonb DEFAULT NULL::jsonb, p_correlation_id text DEFAULT NULL::text, p_payload jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT NULL::jsonb, p_schema_version smallint DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inserted INTEGER;
BEGIN
  -- No EXCEPTION handler: it would open an implicit subtransaction, and a
  -- producer that swallowed an outbox failure would commit its business write
  -- with no event â€” the exact failure P4 exists to prevent. Let it propagate
  -- and roll the producer back.
  INSERT INTO event_outbox (
    event_id, schema_version, type, event_version, producer, actor,
    correlation_id, security_class, payload, metadata, occurred_at, consumer_id
  )
  SELECT
    p_event_id, p_schema_version, p_type, p_event_version, p_producer, p_actor,
    p_correlation_id, p_security_class, p_payload, p_metadata, p_occurred_at, c
  FROM unnest(COALESCE(p_consumer_ids, ARRAY[]::TEXT[])) AS c
  ON CONFLICT (event_id, consumer_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END
$function$;
CREATE OR REPLACE FUNCTION public.fn_outbox_settle(p_id uuid, p_ok boolean, p_error text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status TEXT;
BEGIN
  UPDATE event_outbox o
     SET status       = CASE
                          WHEN p_ok THEN 'delivered'
                          WHEN o.attempts >= 3 THEN 'dead'
                          ELSE 'pending'
                        END,
         delivered_at = CASE WHEN p_ok THEN now() ELSE o.delivered_at END,
         last_error   = CASE WHEN p_ok THEN NULL ELSE p_error END,
         next_attempt_at = CASE WHEN p_ok THEN o.next_attempt_at ELSE now() END
   WHERE o.id = p_id
     AND o.status = 'pending'
  RETURNING o.status INTO v_status;

  RETURN v_status;   -- NULL when the row was already terminal or absent
END
$function$;
CREATE OR REPLACE FUNCTION public.fn_owner_recovery_arm(p_target_user_id uuid, p_reason text, p_window_minutes integer DEFAULT 30)
 RETURNS platform_owner_recovery
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_row platform_owner_recovery;
BEGIN
    -- A justification is mandatory and stored. It is the only durable record of
    -- WHY normal control was unavailable, and 20 characters is the same floor
    -- 19_Security.md §5 sets for an administrative sanction.
    IF p_reason IS NULL OR length(btrim(p_reason)) < 20 THEN
        RAISE EXCEPTION 'CONFLICT: reason must be at least 20 characters'
            USING ERRCODE = '23514';
    END IF;

    -- Bounded window. Too short is unusable under pressure; too long is a
    -- standing authorization, which is the thing D3 forbids.
    IF p_window_minutes IS NULL OR p_window_minutes < 5 OR p_window_minutes > 120 THEN
        RAISE EXCEPTION 'CONFLICT: window must be between 5 and 120 minutes'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_target_user_id) THEN
        RAISE EXCEPTION 'NOT_FOUND: replacement Owner has no profile'
            USING ERRCODE = 'P0002';
    END IF;

    -- Recovering TO the current Owner recovers nothing, and would silently
    -- succeed. This is the structural guard against the derivation defect above
    -- being repeated by hand.
    IF fn_is_platform_owner(p_target_user_id) THEN
        RAISE EXCEPTION 'CONFLICT: target is already the active Platform Owner'
            USING ERRCODE = '23514';
    END IF;

    -- Checked explicitly for a clear message; the partial unique index is the
    -- authority and still refuses a concurrent second window.
    IF EXISTS (SELECT 1 FROM platform_owner_recovery WHERE closed_at IS NULL) THEN
        RAISE EXCEPTION 'CONFLICT: a recovery window is already open'
            USING ERRCODE = '23514';
    END IF;

    INSERT INTO platform_owner_recovery (target_user_id, expires_at, reason)
    VALUES (p_target_user_id, now() + make_interval(mins => p_window_minutes), btrim(p_reason))
    RETURNING * INTO v_row;

    -- Arming is itself security-relevant: it names an account that is about to
    -- receive ownership. Auditing only the execution would leave a cancelled or
    -- expired attempt invisible.
    PERFORM fn_owner_recovery_audit(
        'owner.break_glass_armed',
        p_target_user_id,
        NULL,
        jsonb_build_object('target_user_id', p_target_user_id, 'expires_at', v_row.expires_at),
        jsonb_build_object('mechanism', 'break_glass', 'correlation_id', v_row.id,
                           'window_minutes', p_window_minutes, 'reason', v_row.reason,
                           'outcome', 'armed')
    );

    RETURN v_row;
END$function$;
CREATE OR REPLACE FUNCTION public.fn_owner_recovery_audit(p_action text, p_target uuid, p_before jsonb, p_after jsonb, p_metadata jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    INSERT INTO audit_log (actor_id, actor_email, actor_role, action, target_type, target_id,
                           before_state, after_state, metadata)
    VALUES ('00000000-0000-0000-0000-000000000000',
            'break-glass@system.invalid',
            'system',
            p_action, 'platform_owner', p_target::text,
            p_before, p_after, p_metadata);
$function$;
CREATE OR REPLACE FUNCTION public.fn_owner_recovery_cancel(p_recovery_id uuid, p_reason text)
 RETURNS platform_owner_recovery
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_win platform_owner_recovery;
BEGIN
    SELECT * INTO v_win FROM platform_owner_recovery WHERE id = p_recovery_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: no such recovery window'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_win.closed_at IS NOT NULL THEN
        RAISE EXCEPTION 'CONFLICT: recovery window already %', v_win.outcome
            USING ERRCODE = '23514';
    END IF;

    UPDATE platform_owner_recovery
       SET closed_at = now(), outcome = 'cancelled'
     WHERE id = v_win.id
    RETURNING * INTO v_win;

    PERFORM fn_owner_recovery_audit(
        'owner.break_glass_cancelled',
        v_win.target_user_id,
        jsonb_build_object('target_user_id', v_win.target_user_id),
        NULL,
        jsonb_build_object('mechanism', 'break_glass', 'correlation_id', v_win.id,
                           'reason', p_reason, 'outcome', 'cancelled')
    );

    RETURN v_win;
END$function$;
CREATE OR REPLACE FUNCTION public.fn_owner_recovery_execute(p_recovery_id uuid)
 RETURNS platform_owner
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_win      platform_owner_recovery;
    v_previous UUID;
    v_new      platform_owner;
BEGIN
    -- FOR UPDATE: two concurrent executions of the same window must not both
    -- pass the "still open" check.
    SELECT * INTO v_win FROM platform_owner_recovery WHERE id = p_recovery_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: no such recovery window'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_win.closed_at IS NOT NULL THEN
        RAISE EXCEPTION 'CONFLICT: recovery window already %', v_win.outcome
            USING ERRCODE = '23514';
    END IF;

    IF now() > v_win.expires_at THEN
        RAISE EXCEPTION 'CONFLICT: recovery window expired at %', v_win.expires_at
            USING ERRCODE = '23514';
    END IF;

    -- May be NULL: the platform can be ownerless (row deleted, or bootstrap
    -- never ran), and that is a lockout this procedure must also recover from.
    SELECT user_id INTO v_previous FROM platform_owner WHERE active;

    -- Revoke rather than delete — the previous Owner's tenure stays in the
    -- record. The partial unique index requires this to happen before the
    -- insert below.
    UPDATE platform_owner SET active = false, revoked_at = now() WHERE active;

    INSERT INTO platform_owner (user_id, assigned_by, notes)
    VALUES (v_win.target_user_id, 'break_glass', v_win.reason)
    RETURNING * INTO v_new;

    UPDATE platform_owner_recovery
       SET closed_at = now(), outcome = 'consumed'
     WHERE id = v_win.id;

    PERFORM fn_owner_recovery_audit(
        'owner.break_glass_recovery',
        v_win.target_user_id,
        jsonb_build_object('owner_user_id', v_previous),
        jsonb_build_object('owner_user_id', v_win.target_user_id, 'assigned_by', 'break_glass'),
        jsonb_build_object('mechanism', 'break_glass', 'correlation_id', v_win.id,
                           'reason', v_win.reason, 'outcome', 'consumed',
                           'window_expires_at', v_win.expires_at)
    );

    RETURN v_new;
END$function$;
CREATE OR REPLACE FUNCTION public.fn_revoke_admin_role(p_actor_id uuid, p_role_id uuid)
 RETURNS admin_roles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_row   admin_roles;
    v_count INT;
BEGIN
    SELECT * INTO v_row FROM admin_roles WHERE id = p_role_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: role assignment does not exist'
            USING ERRCODE = 'P0002';
    END IF;

    -- Constitutional rule: only the Platform Owner may demote a Super Admin.
    IF v_row.role = 'super_admin' AND NOT fn_is_platform_owner(p_actor_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: only the Platform Owner may revoke super_admin'
            USING ERRCODE = '42501';
    END IF;

    -- Lockout guard (pre-existing behaviour, preserved): never remove the last
    -- active super_admin. Counted over ACTIVE grants only, matching how
    -- resolveActor interprets expires_at.
    IF v_row.role = 'super_admin' THEN
        SELECT COUNT(*) INTO v_count
        FROM admin_roles
        WHERE role = 'super_admin'
          AND (expires_at IS NULL OR expires_at > NOW());
        IF v_count <= 1 THEN
            RAISE EXCEPTION 'CONFLICT: cannot revoke the last remaining super_admin'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- The Owner's own admin rows may not be stripped while they hold ownership;
    -- otherwise a Super Admin could disarm the Owner's back-office access.
    IF fn_is_platform_owner(v_row.user_id) AND p_actor_id <> v_row.user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: cannot revoke roles from the Platform Owner'
            USING ERRCODE = '42501';
    END IF;

    DELETE FROM admin_roles WHERE id = p_role_id;
    RETURN v_row;
END$function$;
CREATE OR REPLACE FUNCTION public.fn_rollup_activation_daily(p_from date, p_to date)
 RETURNS void
 LANGUAGE sql
AS $function$
  INSERT INTO public.activation_daily_rollup AS r (
    snapshot_date, platform, signup_source, rule_version,
    signups_in_cohort, activated_count, activated_within_7d_count, avg_time_to_activation_seconds
  )
  SELECT
    (ua.signup_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS snapshot_date,
    COALESCE(ua.signup_platform, 'unknown')              AS platform,
    COALESCE(ua.acquisition_source, 'organic')            AS signup_source,
    COALESCE(ua.activation_rule_version, 'none')          AS rule_version,
    COUNT(*)                                                                                    AS signups_in_cohort,
    COUNT(*) FILTER (WHERE ua.activated_at IS NOT NULL)                                          AS activated_count,
    COUNT(*) FILTER (WHERE ua.activated_at IS NOT NULL AND ua.activated_at <= ua.signup_at + interval '7 days') AS activated_within_7d_count,
    AVG(EXTRACT(EPOCH FROM (ua.activated_at - ua.signup_at))) FILTER (WHERE ua.activated_at IS NOT NULL)        AS avg_time_to_activation_seconds
  FROM public.user_acquisition ua
  WHERE ua.signup_at IS NOT NULL
    AND (ua.signup_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN p_from AND p_to
  GROUP BY 1, 2, 3, 4
  ON CONFLICT (snapshot_date, platform, signup_source, rule_version) DO UPDATE SET
    signups_in_cohort              = EXCLUDED.signups_in_cohort,
    activated_count                = EXCLUDED.activated_count,
    activated_within_7d_count      = EXCLUDED.activated_within_7d_count,
    avg_time_to_activation_seconds = EXCLUDED.avg_time_to_activation_seconds,
    updated_at                     = now();
$function$;
CREATE OR REPLACE FUNCTION public.fn_rollup_auth_daily(p_from date, p_to date)
 RETURNS void
 LANGUAGE sql
AS $function$
  INSERT INTO public.auth_daily_rollup AS r (
    snapshot_date, platform, method,
    signups, logins_success, logins_failed, first_logins, returning_logins, unique_users
  )
  SELECT
    (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date            AS snapshot_date,
    COALESCE(e.platform, 'unknown')                                 AS platform,
    COALESCE(e.metadata->>'method', 'unknown')                      AS method,
    count(*) FILTER (WHERE e.event_type = 'auth_signup_completed')  AS signups,
    count(*) FILTER (WHERE e.event_type = 'auth_login_completed')   AS logins_success,
    count(*) FILTER (WHERE e.event_type = 'auth_login_failed')      AS logins_failed,
    count(*) FILTER (WHERE e.event_type = 'auth_login_completed' AND e.metadata->>'is_first_login' = 'true')  AS first_logins,
    count(*) FILTER (WHERE e.event_type = 'auth_login_completed' AND e.metadata->>'is_first_login' = 'false') AS returning_logins,
    count(DISTINCT e.user_id)                                        AS unique_users
  FROM public.user_events e
  WHERE e.event_type IN ('auth_signup_completed','auth_login_completed','auth_login_failed')
    AND (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN p_from AND p_to
  GROUP BY 1, 2, 3
  ON CONFLICT (snapshot_date, platform, method) DO UPDATE SET
    signups          = EXCLUDED.signups,
    logins_success   = EXCLUDED.logins_success,
    logins_failed    = EXCLUDED.logins_failed,
    first_logins     = EXCLUDED.first_logins,
    returning_logins = EXCLUDED.returning_logins,
    unique_users     = EXCLUDED.unique_users,
    updated_at       = now();
$function$;
CREATE OR REPLACE FUNCTION public.fn_rollup_cohort_metrics(p_from date, p_to date, p_today date)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH days AS (
    -- An inverted window yields zero rows, so nothing is written. Guessing at
    -- the caller's intent would write cohorts nobody asked for.
    SELECT d::date AS cohort_date FROM generate_series(p_from, p_to, interval '1 day') AS d
  ),
  -- Cohort membership: the VN calendar day of REGISTRATION (§3.3).
  signup AS (
    SELECT p.id AS user_id,
           (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS cohort_date
    FROM public.profiles p
    WHERE (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN p_from AND p_to
  ),
  -- Activity, NOT de-duplicated here: the single dedup point is the
  -- `count(DISTINCT ...)` below. Two of them would let either one be deleted
  -- without any test noticing.
  --
  -- Anonymous events carry no user_id and are excluded: they cannot belong to
  -- a registration cohort.
  --
  -- The window spans the earliest milestone any cohort in range can have
  -- (p_from + 1) to the latest (p_to + 30). Narrowing it silently drops D30.
  activity AS (
    SELECT e.user_id,
           (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS active_date
    FROM public.user_events e
    WHERE e.user_id IS NOT NULL
      AND (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            BETWEEN (p_from + 1) AND (p_to + 30)
  ),
  -- CLASSIC (BRACKET) retention, `25` §4: active on EXACTLY day C+N. Rolling
  -- retention ("any day >= C+N") is a separate secondary view and is NOT this
  -- table; conflating them silently inflates every number on the page.
  computed AS (
    SELECT
      d.cohort_date,
      (SELECT count(*) FROM signup s WHERE s.cohort_date = d.cohort_date)::int AS cohort_size,
      (SELECT count(DISTINCT a.user_id) FROM activity a
         JOIN signup s ON s.user_id = a.user_id
        WHERE s.cohort_date = d.cohort_date AND a.active_date = d.cohort_date + 1)::int  AS d1,
      (SELECT count(DISTINCT a.user_id) FROM activity a
         JOIN signup s ON s.user_id = a.user_id
        WHERE s.cohort_date = d.cohort_date AND a.active_date = d.cohort_date + 7)::int  AS d7,
      (SELECT count(DISTINCT a.user_id) FROM activity a
         JOIN signup s ON s.user_id = a.user_id
        WHERE s.cohort_date = d.cohort_date AND a.active_date = d.cohort_date + 30)::int AS d30
    FROM days d
  )
  INSERT INTO public.cohort_metrics AS c (
    cohort_date, platform, cohort_size,
    d1_retained, d7_retained, d30_retained,
    d1_rate, d7_rate, d30_rate, computed_at
  )
  SELECT
    k.cohort_date, 'all', k.cohort_size,
    k.d1, k.d7, k.d30,
    -- A rate needs BOTH: somebody to divide by, and a day that has finished.
    -- `cohort_date + N < p_today` is the closed-day test - on the morning of
    -- day D the last complete VN day is D-1.
    CASE WHEN k.cohort_size > 0 AND (k.cohort_date + 1)  < p_today
         THEN round(k.d1::numeric  / k.cohort_size, 4) END,
    CASE WHEN k.cohort_size > 0 AND (k.cohort_date + 7)  < p_today
         THEN round(k.d7::numeric  / k.cohort_size, 4) END,
    CASE WHEN k.cohort_size > 0 AND (k.cohort_date + 30) < p_today
         THEN round(k.d30::numeric / k.cohort_size, 4) END,
    now()
  FROM computed k
  ON CONFLICT (cohort_date, platform) DO UPDATE SET
    cohort_size  = EXCLUDED.cohort_size,
    d1_retained  = EXCLUDED.d1_retained,
    d7_retained  = EXCLUDED.d7_retained,
    d30_retained = EXCLUDED.d30_retained,
    d1_rate      = EXCLUDED.d1_rate,
    d7_rate      = EXCLUDED.d7_rate,
    d30_rate     = EXCLUDED.d30_rate,
    computed_at  = EXCLUDED.computed_at;
$function$;
CREATE OR REPLACE FUNCTION public.fn_rollup_daily_snapshots(p_from date, p_to date)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH days AS (
    SELECT d::date AS snapshot_date FROM generate_series(p_from, p_to, interval '1 day') AS d
  ),
  -- One row per (user, VN day) they were active. Anonymous events carry no
  -- user_id and are excluded: they cannot contribute to a DISTINCT USER count.
  activity AS (
    SELECT DISTINCT
      e.user_id,
      (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS active_date
    FROM public.user_events e
    WHERE e.user_id IS NOT NULL
      AND (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            BETWEEN (p_from - INTERVAL '29 days')::date AND p_to
  ),
  signup AS (
    SELECT p.id AS user_id,
           (p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS signup_date
    FROM public.profiles p
  )
  INSERT INTO public.daily_snapshots AS s (
    snapshot_date, platform, total_users, new_users, returning_users, dau, wau, mau, is_final
  )
  SELECT
    d.snapshot_date,
    'all',
    (SELECT count(*) FROM signup g WHERE g.signup_date <= d.snapshot_date),
    (SELECT count(*) FROM signup g WHERE g.signup_date  = d.snapshot_date),
    -- Active that day AND not created that day. An account that signs up and is
    -- immediately active is NEW, not returning; counting it as both would make
    -- the two numbers overlap without saying so.
    (SELECT count(*) FROM activity a
       JOIN signup g ON g.user_id = a.user_id
      WHERE a.active_date = d.snapshot_date AND g.signup_date < d.snapshot_date),
    (SELECT count(*) FROM activity a WHERE a.active_date = d.snapshot_date),
    -- Trailing windows are INCLUSIVE of the snapshot day: 7 days means the day
    -- itself plus the six before it.
    (SELECT count(DISTINCT a.user_id) FROM activity a
      WHERE a.active_date BETWEEN (d.snapshot_date - 6) AND d.snapshot_date),
    (SELECT count(DISTINCT a.user_id) FROM activity a
      WHERE a.active_date BETWEEN (d.snapshot_date - 29) AND d.snapshot_date),
    false
  FROM days d
  ON CONFLICT (snapshot_date, platform) DO UPDATE SET
    total_users     = EXCLUDED.total_users,
    new_users       = EXCLUDED.new_users,
    returning_users = EXCLUDED.returning_users,
    dau             = EXCLUDED.dau,
    wau             = EXCLUDED.wau,
    mau             = EXCLUDED.mau,
    updated_at      = now()
  -- A finalised day is never rewritten. Once a day has left the reconciliation
  -- window an operator may already have reported its numbers; silently changing
  -- them later is worse than carrying a very late event as a known gap.
  WHERE s.is_final = false;
$function$;
CREATE OR REPLACE FUNCTION public.fn_session_inventory(p_user_id uuid, p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, user_id uuid, state text, created_at timestamp with time zone, last_refreshed_at timestamp with time zone, expires_at timestamp with time zone, aal text, client_class text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.user_id,
    CASE WHEN s.not_after IS NOT NULL AND s.not_after <= now() THEN 'expired' ELSE 'active' END,
    s.created_at,
    (s.refreshed_at AT TIME ZONE 'UTC'),
    s.not_after,
    s.aal::TEXT,
    -- Coarsened platform class. The raw user agent never leaves this function;
    -- what comes out is one of three constants. P-6 permits a platform class
    -- where it is already available, and forbids the string it is derived from.
    CASE
      WHEN s.user_agent IS NULL THEN 'unknown'
      WHEN s.user_agent ILIKE '%okhttp%'
        OR s.user_agent ILIKE '%CFNetwork%'
        OR s.user_agent ILIKE '%Darwin%'
        OR s.user_agent ILIKE '%Dart%' THEN 'native'
      WHEN s.user_agent ILIKE '%Mozilla%' THEN 'web'
      ELSE 'unknown'
    END
  FROM auth.sessions s
  JOIN auth.users u ON u.id = s.user_id
  WHERE s.user_id = p_user_id
    AND u.is_anonymous = false                       -- P-4
    AND (p_before IS NULL OR s.created_at < p_before) -- cursor
  ORDER BY s.created_at DESC
  LIMIT GREATEST(LEAST(p_limit, 50), 0);             -- contract Â§7 caps at 50
END
$function$;
CREATE OR REPLACE FUNCTION public.fn_session_revoke(p_session_id uuid)
 RETURNS TABLE(revoked integer, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_subject UUID;
  v_anon    BOOLEAN;
  v_count   INTEGER;
BEGIN
  SELECT s.user_id, u.is_anonymous
    INTO v_subject, v_anon
    FROM auth.sessions s
    JOIN auth.users u ON u.id = s.user_id
   WHERE s.id = p_session_id;

  IF v_subject IS NULL THEN
    RETURN QUERY SELECT 0, 'not_found'; RETURN;
  END IF;

  -- P-4: anonymous sessions are outside C11 v1 entirely. Reported as not_found
  -- so the surface cannot be used to enumerate anonymous identities.
  IF v_anon THEN
    RETURN QUERY SELECT 0, 'not_found'; RETURN;
  END IF;

  -- P-2: the Ultimate Owner can never be the target. Enforced here as well as
  -- in the handler, because the database is the authority and a future caller
  -- must not be able to route around the application check.
  IF fn_is_platform_owner(v_subject) THEN
    RETURN QUERY SELECT 0, 'owner_protected'; RETURN;
  END IF;

  DELETE FROM auth.sessions WHERE id = p_session_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, 'ok';
END
$function$;
CREATE OR REPLACE FUNCTION public.fn_session_revoke_all(p_user_id uuid)
 RETURNS TABLE(revoked integer, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_anon  BOOLEAN;
  v_count INTEGER;
BEGIN
  SELECT u.is_anonymous INTO v_anon FROM auth.users u WHERE u.id = p_user_id;

  IF v_anon IS NULL OR v_anon THEN
    RETURN QUERY SELECT 0, 'not_found'; RETURN;
  END IF;

  IF fn_is_platform_owner(p_user_id) THEN
    RETURN QUERY SELECT 0, 'owner_protected'; RETURN;
  END IF;

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, 'ok';
END
$function$;
CREATE OR REPLACE FUNCTION public.fn_session_subject(p_session_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.user_id
    FROM auth.sessions s
    JOIN auth.users u ON u.id = s.user_id
   WHERE s.id = p_session_id
     AND u.is_anonymous = false;
$function$;
CREATE OR REPLACE FUNCTION public.fn_sync_last_login()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  UPDATE public.user_acquisition ua
  SET last_login_at = u.last_sign_in_at, updated_at = now()
  FROM auth.users u
  WHERE u.id = ua.user_id
    AND u.last_sign_in_at IS DISTINCT FROM ua.last_login_at;
$function$;
CREATE OR REPLACE FUNCTION public.fn_upsert_activation(p_user_id uuid, p_activated_at timestamp with time zone, p_activation_rule_version text)
 RETURNS void
 LANGUAGE sql
AS $function$
  UPDATE public.user_acquisition ua
  SET activated_at            = COALESCE(ua.activated_at, p_activated_at),
      activation_rule_version = COALESCE(ua.activation_rule_version, p_activation_rule_version),
      updated_at              = now()
  WHERE ua.user_id = p_user_id
    AND ua.activated_at IS NULL;
$function$;
CREATE OR REPLACE FUNCTION public.fn_upsert_user_acquisition(p_user_id uuid, p_anon_id uuid DEFAULT NULL::uuid, p_signup_method text DEFAULT NULL::text, p_signup_platform text DEFAULT NULL::text, p_signup_app_version text DEFAULT NULL::text, p_signup_device_type text DEFAULT NULL::text, p_signup_country text DEFAULT NULL::text, p_signup_language text DEFAULT NULL::text, p_acquisition_source text DEFAULT NULL::text, p_signup_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_first_login_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_last_login_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE sql
AS $function$
  INSERT INTO public.user_acquisition AS ua (
    user_id, anon_id, signup_method, signup_platform, signup_app_version,
    signup_device_type, signup_country, signup_language, acquisition_source,
    signup_at, first_login_at, last_login_at
  ) VALUES (
    p_user_id, p_anon_id, p_signup_method, p_signup_platform, p_signup_app_version,
    p_signup_device_type, p_signup_country, p_signup_language, p_acquisition_source,
    p_signup_at, p_first_login_at, p_last_login_at
  )
  ON CONFLICT (user_id) DO UPDATE SET
    anon_id            = COALESCE(ua.anon_id,            EXCLUDED.anon_id),
    signup_method      = COALESCE(ua.signup_method,      EXCLUDED.signup_method),
    signup_platform    = COALESCE(ua.signup_platform,    EXCLUDED.signup_platform),
    signup_app_version = COALESCE(ua.signup_app_version, EXCLUDED.signup_app_version),
    signup_device_type = COALESCE(ua.signup_device_type, EXCLUDED.signup_device_type),
    signup_country     = COALESCE(ua.signup_country,     EXCLUDED.signup_country),
    signup_language    = COALESCE(ua.signup_language,    EXCLUDED.signup_language),
    acquisition_source = COALESCE(ua.acquisition_source, EXCLUDED.acquisition_source),
    signup_at          = LEAST(COALESCE(ua.signup_at,      EXCLUDED.signup_at),      COALESCE(EXCLUDED.signup_at,      ua.signup_at)),
    first_login_at     = LEAST(COALESCE(ua.first_login_at, EXCLUDED.first_login_at), COALESCE(EXCLUDED.first_login_at, ua.first_login_at)),
    last_login_at      = GREATEST(COALESCE(ua.last_login_at, EXCLUDED.last_login_at), COALESCE(EXCLUDED.last_login_at, ua.last_login_at)),
    updated_at         = now();
$function$;
CREATE OR REPLACE FUNCTION public.fn_verify_audit_chain(p_from bigint DEFAULT NULL::bigint, p_to bigint DEFAULT NULL::bigint)
 RETURNS TABLE(seq bigint, id uuid, problem text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r          RECORD;
  v_expected BYTEA;
  v_actual   BYTEA;
  v_last_seq BIGINT := NULL;
BEGIN
  -- An inverted range selects no rows, and an integrity tool that answers
  -- "clean" to a question it never asked is a false assurance. Fail loudly.
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'fn_verify_audit_chain: p_from (%) is greater than p_to (%)', p_from, p_to
      USING ERRCODE = '22023';
  END IF;

  -- Ranged verification starts from the predecessor's stored hash, so the
  -- Controller can check a recent window without walking a million rows.
  -- A-2 (adversarial review): a full scan previously skipped this comparison
  -- for the FIRST row, so its prev_hash was never checked and the leading gap was never
  -- reported. `DELETE FROM audit_log WHERE seq <= 3` therefore verified clean.
  -- That is not the documented tail-truncation limit (T-03, which genuinely
  -- needs an external anchor): the chain already carries what is needed to
  -- catch it, because a truncated head leaves a prev_hash pointing at nothing.
  --
  -- Anchoring at NULL discriminates correctly:
  --   genesis                    prev_hash NULL  -> matches, clean
  --   head deleted               prev_hash set   -> prev_mismatch + sequence_gap
  --   first seq burnt by rollback prev_hash NULL -> matches, still clean
  IF p_from IS NOT NULL THEN
    SELECT a.row_hash, a.seq INTO v_expected, v_last_seq
      FROM audit_log a WHERE a.seq < p_from ORDER BY a.seq DESC LIMIT 1;
  ELSE
    v_expected := NULL;
    v_last_seq := 0;
  END IF;

  FOR r IN
    SELECT * FROM audit_log a
    WHERE (p_from IS NULL OR a.seq >= p_from)
      AND (p_to   IS NULL OR a.seq <= p_to)
    ORDER BY a.seq
  LOOP
    IF r.row_hash IS NULL THEN
      -- Reachable only if the trigger was disabled for the insert.
      seq := r.seq; id := r.id; problem := 'unchained'; RETURN NEXT;
      v_last_seq := r.seq;
      v_expected := NULL;
      CONTINUE;
    END IF;

    v_actual := fn_audit_row_hash(
        r.prev_hash, r.seq, r.id, r.actor_id, r.actor_email, r.actor_role, r.action,
        r.target_type, r.target_id, r.before_state, r.after_state,
        r.metadata, r.ip_address, r.user_agent, r.created_at);

    IF v_actual IS DISTINCT FROM r.row_hash THEN
      seq := r.seq; id := r.id; problem := 'hash_mismatch'; RETURN NEXT;
    END IF;

    IF r.prev_hash IS DISTINCT FROM v_expected THEN
      seq := r.seq; id := r.id; problem := 'prev_mismatch'; RETURN NEXT;
      IF v_last_seq IS NOT NULL AND r.seq - v_last_seq > 1 THEN
        seq := v_last_seq + 1; id := NULL; problem := 'sequence_gap'; RETURN NEXT;
      END IF;
    END IF;

    -- Chain on the RECOMPUTED hash so an edit propagates to the successor.
    v_expected := v_actual;
    v_last_seq := r.seq;
  END LOOP;

  RETURN;
END
$function$;
CREATE OR REPLACE FUNCTION public.get_interaction_avgs(p_review_id uuid)
 RETURNS TABLE(avg_watch double precision, avg_completion double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    AVG(watch_seconds)::FLOAT,
    AVG(completion_rate)::FLOAT
  FROM public.review_interactions
  WHERE review_id = p_review_id;
$function$;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Anonymous identities get no public profile. Everything else is unchanged.
  IF NOT COALESCE(new.is_anonymous, false) THEN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
      new.id,
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name  = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      updated_at = now();
  END IF;

  RETURN new;
END;
$function$;
CREATE OR REPLACE FUNCTION public.increment_deal_click(p_deal_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE partner_deals SET click_count = click_count + 1 WHERE id = p_deal_id;
$function$;
CREATE OR REPLACE FUNCTION public.increment_review_view(p_review_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.reviews SET view_count = view_count + 1 WHERE id = p_review_id;
$function$;
CREATE OR REPLACE FUNCTION public.music_followed_count(p_track uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT count(*) FROM public.music_followed WHERE track_id = p_track; $function$;
CREATE OR REPLACE FUNCTION public.music_increment_play(p_track uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.music_tracks SET play_count = play_count + 1 WHERE id = p_track;
$function$;
CREATE OR REPLACE FUNCTION public.music_saved_count(p_track uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT count(*) FROM public.music_saved WHERE track_id = p_track; $function$;
CREATE OR REPLACE FUNCTION public.notification_subscriptions_enforce_single_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  cred text := public.push_credential(NEW.subscription_data);
BEGIN
  IF cred IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.notification_subscriptions
     SET enabled = false
   WHERE enabled
     AND id <> NEW.id
     AND public.push_credential(subscription_data) = cred;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.partner_deal_translations_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$;
CREATE OR REPLACE FUNCTION public.partner_deals_slug_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.partner_slug IS DISTINCT FROM OLD.partner_slug THEN
    RAISE EXCEPTION 'partner_slug is immutable and cannot be changed';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.partner_deals_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.push_credential(subscription_data jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(subscription_data ->> 'endpoint', subscription_data ->> 'token')
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.set_user_date_of_birth(p_dob date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       UUID := auth.uid();
  v_anon      BOOLEAN;
  v_existing  DATE;
  v_cor       SMALLINT;
  v_found     BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'unauthenticated';
  END IF;

  -- An anonymous identity must not acquire demographic data at all. The FK to
  -- `profiles` already makes the INSERT impossible; this returns the honest
  -- reason instead of a foreign-key error.
  SELECT u.is_anonymous INTO v_anon FROM auth.users u WHERE u.id = v_uid;
  IF COALESCE(v_anon, false) THEN
    RETURN 'anonymous_not_eligible';
  END IF;

  -- Validated here as well as by the CHECK constraint: a constraint violation
  -- is an exception the caller must catch, while this is a value it can branch
  -- on. The CHECK remains as the backstop for every other write path.
  IF p_dob IS NULL OR p_dob > CURRENT_DATE OR p_dob <= DATE '1900-01-01' THEN
    RETURN 'invalid_date';
  END IF;

  SELECT d.date_of_birth, d.dob_corrections, true
    INTO v_existing, v_cor, v_found
    FROM public.user_demographics d
   WHERE d.user_id = v_uid;

  -- First declaration. Also covers the case where a row exists because the user
  -- already saved a city or occupation, but has never given a date.
  IF NOT COALESCE(v_found, false) OR v_existing IS NULL THEN
    INSERT INTO public.user_demographics (user_id, date_of_birth, age_declared_at)
    VALUES (v_uid, p_dob, now())
    ON CONFLICT (user_id) DO UPDATE
      SET date_of_birth   = EXCLUDED.date_of_birth,
          age_declared_at = EXCLUDED.age_declared_at,
          updated_at      = now();
    RETURN 'recorded';
  END IF;

  -- Re-submitting the same date is not a correction and must not consume the
  -- single allowance â€” a double-tap or a retry after a network failure would
  -- otherwise cost the user their one chance to fix a genuine mistake.
  IF v_existing = p_dob THEN
    RETURN 'unchanged';
  END IF;

  IF COALESCE(v_cor, 0) >= 1 THEN
    RETURN 'correction_exhausted';
  END IF;

  UPDATE public.user_demographics
     SET date_of_birth   = p_dob,
         dob_corrections = COALESCE(dob_corrections, 0) + 1,
         age_declared_at = now(),
         updated_at      = now()
   WHERE user_id = v_uid;

  RETURN 'corrected';
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_review_watch_stats(p_review_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.reviews r SET
    watch_time_avg = COALESCE((SELECT round(avg(watch_seconds)::numeric,1) FROM public.review_interactions WHERE review_id = p_review_id),0),
    completion_rate = COALESCE((SELECT round(avg(completion_rate)::numeric,3) FROM public.review_interactions WHERE review_id = p_review_id),0)
  WHERE r.id = p_review_id;
END; $function$;
CREATE OR REPLACE FUNCTION public.update_follow_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE public.profiles SET follower_count  = follower_count  + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE public.profiles SET follower_count  = GREATEST(follower_count  - 1, 0) WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END; $function$;
CREATE OR REPLACE FUNCTION public.update_notification_subscriptions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;
CREATE OR REPLACE FUNCTION public.update_review_comment_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET comment_count = comment_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reviews SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END; $function$;
CREATE OR REPLACE FUNCTION public.update_review_like_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF TG_OP = 'INSERT' THEN UPDATE public.reviews SET like_count = like_count + 1 WHERE id = NEW.review_id; ELSIF TG_OP = 'DELETE' THEN UPDATE public.reviews SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.review_id; END IF; RETURN NULL; END; $function$;
CREATE OR REPLACE FUNCTION public.update_review_save_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF TG_OP = 'INSERT' THEN UPDATE public.reviews SET save_count = save_count + 1 WHERE id = NEW.review_id; ELSIF TG_OP = 'DELETE' THEN UPDATE public.reviews SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.review_id; END IF; RETURN NULL; END; $function$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end; $function$;
CREATE OR REPLACE FUNCTION public.user_age_status()
 RETURNS TABLE(has_dob boolean, age_years integer, age_band text, corrections_used smallint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_dob DATE;
  v_cor SMALLINT;
  v_age INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, NULL::INTEGER, NULL::TEXT, 0::SMALLINT;
    RETURN;
  END IF;

  SELECT d.date_of_birth, d.dob_corrections
    INTO v_dob, v_cor
    FROM public.user_demographics d
   WHERE d.user_id = v_uid;

  IF v_dob IS NULL THEN
    RETURN QUERY SELECT false, NULL::INTEGER, NULL::TEXT, COALESCE(v_cor, 0::SMALLINT);
    RETURN;
  END IF;

  -- Whole years elapsed. `date_part('year', age(...))` handles leap years and
  -- the not-yet-had-a-birthday-this-year case without any client arithmetic.
  v_age := date_part('year', age(CURRENT_DATE, v_dob))::INTEGER;

  -- Banded by the one shared helper (section 5.0), never inline here.
  RETURN QUERY SELECT true, v_age, public.age_band_of(v_dob), COALESCE(v_cor, 0::SMALLINT);
END;
$function$;
SET check_function_bodies = on;

-- ===== CONSTRAINTS (PK/UNIQUE/CHECK/EXCLUDE) =====
ALTER TABLE account_status ADD CONSTRAINT "account_status_pkey" PRIMARY KEY (user_id);
ALTER TABLE activation_daily_rollup ADD CONSTRAINT "activation_daily_rollup_pkey" PRIMARY KEY (id);
ALTER TABLE activation_daily_rollup ADD CONSTRAINT "activation_daily_rollup_snapshot_date_platform_signup_sourc_key" UNIQUE (snapshot_date, platform, signup_source, rule_version);
ALTER TABLE admin_permissions ADD CONSTRAINT "admin_permissions_pkey" PRIMARY KEY (id);
ALTER TABLE admin_permissions ADD CONSTRAINT "admin_permissions_user_id_permission_key" UNIQUE (user_id, permission);
ALTER TABLE admin_roles ADD CONSTRAINT "admin_roles_pkey" PRIMARY KEY (id);
ALTER TABLE admin_roles ADD CONSTRAINT "admin_roles_user_id_role_key" UNIQUE (user_id, role);
ALTER TABLE anon_chat_usage ADD CONSTRAINT "anon_chat_usage_pkey" PRIMARY KEY (user_id, day);
ALTER TABLE audit_log ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE audit_log ADD CONSTRAINT "audit_log_seq_key" UNIQUE (seq);
ALTER TABLE auth_daily_rollup ADD CONSTRAINT "auth_daily_rollup_pkey" PRIMARY KEY (id);
ALTER TABLE auth_daily_rollup ADD CONSTRAINT "auth_daily_rollup_snapshot_date_platform_method_key" UNIQUE (snapshot_date, platform, method);
ALTER TABLE billing_customers ADD CONSTRAINT "billing_customers_pkey" PRIMARY KEY (user_id);
ALTER TABLE billing_customers ADD CONSTRAINT "billing_customers_stripe_customer_id_key" UNIQUE (stripe_customer_id);
ALTER TABLE bookings ADD CONSTRAINT "bookings_pkey" PRIMARY KEY (id);
ALTER TABLE chat_blocks ADD CONSTRAINT "chat_blocks_check" CHECK ((blocker_id <> blocked_id));
ALTER TABLE chat_blocks ADD CONSTRAINT "chat_blocks_pkey" PRIMARY KEY (blocker_id, blocked_id);
ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_body_check" CHECK (((length(body) >= 1) AND (length(body) <= 4000)));
ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY (id);
ALTER TABLE chat_participants ADD CONSTRAINT "chat_participants_pkey" PRIMARY KEY (thread_id, user_id);
ALTER TABLE chat_reads ADD CONSTRAINT "chat_reads_pkey" PRIMARY KEY (thread_id, user_id);
ALTER TABLE chat_settings ADD CONSTRAINT "chat_settings_id_check" CHECK (id);
ALTER TABLE chat_settings ADD CONSTRAINT "chat_settings_pkey" PRIMARY KEY (id);
ALTER TABLE chat_settings ADD CONSTRAINT "chat_settings_reachability_check" CHECK ((reachability = ANY (ARRAY['mutual_follow'::text, 'recipient_follows_sender'::text, 'anyone'::text])));
ALTER TABLE chat_threads ADD CONSTRAINT "chat_threads_direct_has_key" CHECK ((((kind = 'direct'::text) AND (direct_key IS NOT NULL)) OR ((kind = 'group'::text) AND (direct_key IS NULL))));
ALTER TABLE chat_threads ADD CONSTRAINT "chat_threads_kind_check" CHECK ((kind = ANY (ARRAY['direct'::text, 'group'::text])));
ALTER TABLE chat_threads ADD CONSTRAINT "chat_threads_pkey" PRIMARY KEY (id);
ALTER TABLE cohort_metrics ADD CONSTRAINT "cohort_metrics_cohort_date_platform_key" UNIQUE (cohort_date, platform);
ALTER TABLE cohort_metrics ADD CONSTRAINT "cohort_metrics_pkey" PRIMARY KEY (id);
ALTER TABLE comment_reactions ADD CONSTRAINT "comment_reactions_one_per_user" UNIQUE (comment_id, user_id);
ALTER TABLE comment_reactions ADD CONSTRAINT "comment_reactions_pkey" PRIMARY KEY (id);
ALTER TABLE comment_reactions ADD CONSTRAINT "comment_reactions_reaction_check" CHECK (((char_length(reaction) >= 1) AND (char_length(reaction) <= 20)));
ALTER TABLE content_reports ADD CONSTRAINT "content_reports_content_id_reporter_source_id_reason_key" UNIQUE (content_id, reporter_source_id, reason);
ALTER TABLE content_reports ADD CONSTRAINT "content_reports_pkey" PRIMARY KEY (id);
ALTER TABLE content_reports ADD CONSTRAINT "content_reports_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'reviewing'::text, 'closed'::text])));
ALTER TABLE content_reports ADD CONSTRAINT "content_reports_verification_state_check" CHECK ((verification_state = ANY (ARRAY['UNVERIFIED'::text, 'VERIFIED'::text, 'REJECTED'::text])));
ALTER TABLE conversations ADD CONSTRAINT "conversations_pkey" PRIMARY KEY (id);
ALTER TABLE daily_snapshots ADD CONSTRAINT "daily_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE daily_snapshots ADD CONSTRAINT "daily_snapshots_snapshot_date_platform_key" UNIQUE (snapshot_date, platform);
ALTER TABLE decision_evidence ADD CONSTRAINT "decision_evidence_pkey" PRIMARY KEY (id);
ALTER TABLE department ADD CONSTRAINT "department_pkey" PRIMARY KEY (id);
ALTER TABLE department ADD CONSTRAINT "department_status_check" CHECK ((status = ANY (ARRAY['defined'::text, 'placeholder'::text])));
ALTER TABLE department_membership ADD CONSTRAINT "ck_membership_scope" CHECK (((scope = 'GLOBAL'::text) OR (scope = department_id)));
ALTER TABLE department_membership ADD CONSTRAINT "department_membership_org_role_check" CHECK ((org_role = ANY (ARRAY['DEPARTMENT_HEAD'::text, 'DEPARTMENT_MANAGER'::text, 'EMPLOYEE'::text])));
ALTER TABLE department_membership ADD CONSTRAINT "department_membership_pkey" PRIMARY KEY (id);
ALTER TABLE department_membership ADD CONSTRAINT "department_membership_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])));
ALTER TABLE department_membership ADD CONSTRAINT "uq_membership_user_department" UNIQUE (organization_id, user_id, department_id);
ALTER TABLE event_outbox ADD CONSTRAINT "event_outbox_attempts_check" CHECK ((attempts >= 0));
ALTER TABLE event_outbox ADD CONSTRAINT "event_outbox_event_consumer_key" UNIQUE (event_id, consumer_id);
ALTER TABLE event_outbox ADD CONSTRAINT "event_outbox_pkey" PRIMARY KEY (id);
ALTER TABLE event_outbox ADD CONSTRAINT "event_outbox_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'delivered'::text, 'dead'::text])));
ALTER TABLE favorites ADD CONSTRAINT "favorites_pkey" PRIMARY KEY (id);
ALTER TABLE favorites ADD CONSTRAINT "favorites_user_id_place_id_key" UNIQUE (user_id, place_id);
ALTER TABLE group_members ADD CONSTRAINT "group_members_pkey" PRIMARY KEY (id);
ALTER TABLE groups ADD CONSTRAINT "groups_pkey" PRIMARY KEY (id);
ALTER TABLE groups ADD CONSTRAINT "groups_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])));
ALTER TABLE marketing_campaigns ADD CONSTRAINT "marketing_campaigns_body_check" CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 500)));
ALTER TABLE marketing_campaigns ADD CONSTRAINT "marketing_campaigns_category_check" CHECK ((category = 'marketing'::text));
ALTER TABLE marketing_campaigns ADD CONSTRAINT "marketing_campaigns_link_check" CHECK (((link IS NULL) OR ((link ~~ '/%'::text) AND (link !~~ '//%'::text))));
ALTER TABLE marketing_campaigns ADD CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY (id);
ALTER TABLE marketing_campaigns ADD CONSTRAINT "marketing_campaigns_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text])));
ALTER TABLE marketing_campaigns ADD CONSTRAINT "marketing_campaigns_title_check" CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 120)));
ALTER TABLE marketing_consent ADD CONSTRAINT "marketing_consent_channel_check" CHECK ((channel = ANY (ARRAY['push'::text, 'email'::text, 'in_app'::text, 'global'::text])));
ALTER TABLE marketing_consent ADD CONSTRAINT "marketing_consent_pkey" PRIMARY KEY (id);
ALTER TABLE marketing_consent ADD CONSTRAINT "marketing_consent_user_id_channel_key" UNIQUE (user_id, channel);
ALTER TABLE message_feedback ADD CONSTRAINT "message_feedback_pkey" PRIMARY KEY (id);
ALTER TABLE message_feedback ADD CONSTRAINT "message_feedback_type_check" CHECK ((type = ANY (ARRAY['like'::text, 'dislike'::text, 'report'::text])));
ALTER TABLE message_feedback ADD CONSTRAINT "message_feedback_user_id_conversation_id_message_index_type_key" UNIQUE (user_id, conversation_id, message_index, type);
ALTER TABLE moderation_actions ADD CONSTRAINT "moderation_actions_pkey" PRIMARY KEY (id);
ALTER TABLE moderation_queue ADD CONSTRAINT "moderation_queue_pkey" PRIMARY KEY (id);
ALTER TABLE music_categories ADD CONSTRAINT "music_categories_pkey" PRIMARY KEY (id);
ALTER TABLE music_categories ADD CONSTRAINT "music_categories_slug_key" UNIQUE (slug);
ALTER TABLE music_followed ADD CONSTRAINT "music_followed_pkey" PRIMARY KEY (id);
ALTER TABLE music_followed ADD CONSTRAINT "music_followed_user_id_track_id_key" UNIQUE (user_id, track_id);
ALTER TABLE music_providers ADD CONSTRAINT "music_providers_pkey" PRIMARY KEY (id);
ALTER TABLE music_providers ADD CONSTRAINT "music_providers_slug_key" UNIQUE (slug);
ALTER TABLE music_saved ADD CONSTRAINT "music_saved_pkey" PRIMARY KEY (id);
ALTER TABLE music_saved ADD CONSTRAINT "music_saved_user_id_track_id_key" UNIQUE (user_id, track_id);
ALTER TABLE music_track_reports ADD CONSTRAINT "music_track_reports_pkey" PRIMARY KEY (id);
ALTER TABLE music_track_reports ADD CONSTRAINT "music_track_reports_reason_check" CHECK ((reason = ANY (ARRAY['copyright'::text, 'inappropriate'::text, 'spam'::text, 'other'::text])));
ALTER TABLE music_track_reports ADD CONSTRAINT "music_track_reports_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'reviewing'::text, 'actioned'::text, 'dismissed'::text])));
ALTER TABLE music_tracks ADD CONSTRAINT "music_tracks_duration_positive" CHECK ((duration_sec > 0));
ALTER TABLE music_tracks ADD CONSTRAINT "music_tracks_music_type_check" CHECK ((music_type = ANY (ARRAY['royalty_free'::text, 'licensed'::text, 'original_sound'::text, 'ai_generated'::text, 'external'::text])));
ALTER TABLE music_tracks ADD CONSTRAINT "music_tracks_pkey" PRIMARY KEY (id);
ALTER TABLE music_usage ADD CONSTRAINT "music_usage_pkey" PRIMARY KEY (id);
ALTER TABLE notification_deliveries ADD CONSTRAINT "notification_deliveries_campaign_id_user_id_key" UNIQUE (campaign_id, user_id);
ALTER TABLE notification_deliveries ADD CONSTRAINT "notification_deliveries_category_check" CHECK ((category = 'marketing'::text));
ALTER TABLE notification_deliveries ADD CONSTRAINT "notification_deliveries_channel_check" CHECK ((channel = ANY (ARRAY['push'::text, 'email'::text, 'in_app'::text])));
ALTER TABLE notification_deliveries ADD CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY (id);
ALTER TABLE notification_deliveries ADD CONSTRAINT "notification_deliveries_reason_matches_status" CHECK ((((status = 'sent'::text) AND (skip_reason IS NULL)) OR ((status = 'skipped'::text) AND (skip_reason IS NOT NULL))));
ALTER TABLE notification_deliveries ADD CONSTRAINT "notification_deliveries_skip_reason_check" CHECK (((skip_reason IS NULL) OR (skip_reason = ANY (ARRAY['consent'::text, 'unsubscribed'::text, 'frequency_24h'::text, 'frequency_7d'::text, 'quiet_hours'::text, 'ineligible'::text]))));
ALTER TABLE notification_deliveries ADD CONSTRAINT "notification_deliveries_status_check" CHECK ((status = ANY (ARRAY['sent'::text, 'skipped'::text])));
ALTER TABLE notification_subscriptions ADD CONSTRAINT "notification_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE notification_subscriptions ADD CONSTRAINT "notification_subscriptions_user_id_provider_key" UNIQUE (user_id, provider);
ALTER TABLE notifications ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE notifications ADD CONSTRAINT "notifications_push_status_check" CHECK ((push_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])));
ALTER TABLE organization ADD CONSTRAINT "organization_pkey" PRIMARY KEY (id);
ALTER TABLE organization ADD CONSTRAINT "organization_slug_key" UNIQUE (slug);
ALTER TABLE partner_deal_translations ADD CONSTRAINT "partner_deal_translations_deal_id_locale_key" UNIQUE (deal_id, locale);
ALTER TABLE partner_deal_translations ADD CONSTRAINT "partner_deal_translations_locale_check" CHECK ((locale ~ '^[a-z]{2}(-[A-Z]{2})?$'::text));
ALTER TABLE partner_deal_translations ADD CONSTRAINT "partner_deal_translations_pkey" PRIMARY KEY (id);
ALTER TABLE partner_deals ADD CONSTRAINT "partner_deals_official_url_check" CHECK ((official_url ~ '^https://'::text));
ALTER TABLE partner_deals ADD CONSTRAINT "partner_deals_pkey" PRIMARY KEY (id);
ALTER TABLE partner_deals ADD CONSTRAINT "partner_deals_slug_lowercase" CHECK ((partner_slug = lower(partner_slug)));
ALTER TABLE place_photos ADD CONSTRAINT "place_photos_pkey" PRIMARY KEY (place_id);
ALTER TABLE platform_owner ADD CONSTRAINT "platform_owner_pkey" PRIMARY KEY (id);
ALTER TABLE platform_owner_recovery ADD CONSTRAINT "platform_owner_recovery_closed" CHECK (((closed_at IS NULL) = (outcome IS NULL)));
ALTER TABLE platform_owner_recovery ADD CONSTRAINT "platform_owner_recovery_outcome" CHECK (((outcome IS NULL) OR (outcome = ANY (ARRAY['consumed'::text, 'cancelled'::text]))));
ALTER TABLE platform_owner_recovery ADD CONSTRAINT "platform_owner_recovery_pkey" PRIMARY KEY (id);
ALTER TABLE platform_owner_recovery ADD CONSTRAINT "platform_owner_recovery_window" CHECK ((expires_at > requested_at));
ALTER TABLE platform_settings ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY (key);
ALTER TABLE platform_settings ADD CONSTRAINT "platform_settings_scope_check" CHECK ((scope = ANY (ARRAY['global'::text, 'hub'::text, 'module'::text])));
ALTER TABLE price_watches ADD CONSTRAINT "price_watches_pkey" PRIMARY KEY (id);
ALTER TABLE price_watches ADD CONSTRAINT "price_watches_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'triggered'::text, 'cancelled'::text])));
ALTER TABLE profiles ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE profiles ADD CONSTRAINT "profiles_username_key" UNIQUE (username);
ALTER TABLE review_comments ADD CONSTRAINT "review_comments_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 300)));
ALTER TABLE review_comments ADD CONSTRAINT "review_comments_pkey" PRIMARY KEY (id);
ALTER TABLE review_interactions ADD CONSTRAINT "review_interactions_pkey" PRIMARY KEY (id);
ALTER TABLE review_interactions ADD CONSTRAINT "review_interactions_user_id_review_id_key" UNIQUE (user_id, review_id);
ALTER TABLE review_likes ADD CONSTRAINT "review_likes_pkey" PRIMARY KEY (id);
ALTER TABLE review_likes ADD CONSTRAINT "review_likes_review_id_user_id_key" UNIQUE (review_id, user_id);
ALTER TABLE review_milestones ADD CONSTRAINT "review_milestones_pkey" PRIMARY KEY (id);
ALTER TABLE review_milestones ADD CONSTRAINT "review_milestones_review_id_milestone_key" UNIQUE (review_id, milestone);
ALTER TABLE review_saves ADD CONSTRAINT "review_saves_pkey" PRIMARY KEY (id);
ALTER TABLE review_saves ADD CONSTRAINT "review_saves_review_id_user_id_key" UNIQUE (review_id, user_id);
ALTER TABLE review_shares ADD CONSTRAINT "review_shares_channel_check" CHECK (((char_length(channel) >= 1) AND (char_length(channel) <= 64)));
ALTER TABLE review_shares ADD CONSTRAINT "review_shares_pkey" PRIMARY KEY (id);
ALTER TABLE reviews ADD CONSTRAINT "reviews_content_type_check" CHECK ((content_type = ANY (ARRAY['video'::text, 'photo'::text, 'text'::text])));
ALTER TABLE reviews ADD CONSTRAINT "reviews_pkey" PRIMARY KEY (id);
ALTER TABLE reviews ADD CONSTRAINT "reviews_publication_state_check" CHECK ((publication_state = ANY (ARRAY['UNDER_REVIEW'::text, 'PUBLISHED'::text, 'RESTRICTED'::text])));
ALTER TABLE reviews ADD CONSTRAINT "reviews_safety_state_check" CHECK ((safety_state = ANY (ARRAY['SAFE'::text, 'VIOLATION'::text, 'UNDETERMINED'::text, 'HUMAN_REVIEW_REQUIRED'::text, 'LEGAL_REVIEW_REQUIRED'::text, 'ENGINE_ERROR'::text])));
ALTER TABLE reviews ADD CONSTRAINT "reviews_source_type_check" CHECK ((source_type = ANY (ARRAY['upload'::text, 'youtube'::text, 'tiktok'::text, 'facebook'::text])));
ALTER TABLE services ADD CONSTRAINT "services_pkey" PRIMARY KEY (id);
ALTER TABLE subscriptions ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE subscriptions ADD CONSTRAINT "subscriptions_stripe_customer_id_key" UNIQUE (stripe_customer_id);
ALTER TABLE subscriptions ADD CONSTRAINT "subscriptions_stripe_sub_id_key" UNIQUE (stripe_sub_id);
ALTER TABLE subscriptions ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE (user_id);
ALTER TABLE system_health_log ADD CONSTRAINT "system_health_log_pkey" PRIMARY KEY (id);
ALTER TABLE user_acquisition ADD CONSTRAINT "user_acquisition_pkey" PRIMARY KEY (user_id);
ALTER TABLE user_demographics ADD CONSTRAINT "user_demographics_admin_corrections_chk" CHECK ((admin_corrections >= 0));
ALTER TABLE user_demographics ADD CONSTRAINT "user_demographics_corrections_chk" CHECK (((dob_corrections >= 0) AND (dob_corrections <= 1)));
ALTER TABLE user_demographics ADD CONSTRAINT "user_demographics_country_chk" CHECK (((country IS NULL) OR (country ~ '^[A-Z]{2}$'::text)));
ALTER TABLE user_demographics ADD CONSTRAINT "user_demographics_dob_chk" CHECK (((date_of_birth IS NULL) OR ((date_of_birth > '1900-01-01'::date) AND (date_of_birth <= CURRENT_DATE))));
ALTER TABLE user_demographics ADD CONSTRAINT "user_demographics_gender_chk" CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['female'::text, 'male'::text, 'other'::text, 'prefer_not_to_say'::text]))));
ALTER TABLE user_demographics ADD CONSTRAINT "user_demographics_pkey" PRIMARY KEY (user_id);
ALTER TABLE user_demographics ADD CONSTRAINT "user_demographics_self_describe_chk" CHECK (((gender_self_describe IS NULL) OR (gender = 'other'::text)));
ALTER TABLE user_demographics ADD CONSTRAINT "user_demographics_text_len_chk" CHECK (((COALESCE(length(gender_self_describe), 0) <= 60) AND (COALESCE(length(city), 0) <= 80) AND (COALESCE(length(occupation), 0) <= 80) AND (COALESCE(length(industry), 0) <= 80) AND (COALESCE(length(education_level), 0) <= 80)));
ALTER TABLE user_events ADD CONSTRAINT "user_events_identity_chk" CHECK (((user_id IS NOT NULL) OR (anon_id IS NOT NULL))) NOT VALID;
ALTER TABLE user_events ADD CONSTRAINT "user_events_pkey" PRIMARY KEY (id);
ALTER TABLE user_follows ADD CONSTRAINT "user_follows_check" CHECK ((follower_id <> following_id));
ALTER TABLE user_follows ADD CONSTRAINT "user_follows_follower_id_following_id_key" UNIQUE (follower_id, following_id);
ALTER TABLE user_follows ADD CONSTRAINT "user_follows_pkey" PRIMARY KEY (id);
ALTER TABLE user_integrations ADD CONSTRAINT "user_integrations_pkey" PRIMARY KEY (id);
ALTER TABLE user_integrations ADD CONSTRAINT "user_integrations_user_id_provider_key" UNIQUE (user_id, provider);
ALTER TABLE user_memory ADD CONSTRAINT "user_memory_pkey" PRIMARY KEY (id);
ALTER TABLE user_memory ADD CONSTRAINT "user_memory_user_id_key" UNIQUE (user_id);
ALTER TABLE user_notes ADD CONSTRAINT "user_notes_pkey" PRIMARY KEY (id);
ALTER TABLE user_preferences ADD CONSTRAINT "user_preferences_budget_level_check" CHECK ((budget_level = ANY (ARRAY['cheap'::text, 'mid'::text, 'high'::text])));
ALTER TABLE user_preferences ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY (user_id);
ALTER TABLE vouchers ADD CONSTRAINT "vouchers_pkey" PRIMARY KEY (id);

-- ===== CONSTRAINTS (FOREIGN KEYS) =====
ALTER TABLE account_status ADD CONSTRAINT "account_status_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE admin_permissions ADD CONSTRAINT "admin_permissions_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE admin_permissions ADD CONSTRAINT "admin_permissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE admin_roles ADD CONSTRAINT "admin_roles_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE admin_roles ADD CONSTRAINT "admin_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE billing_customers ADD CONSTRAINT "billing_customers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE bookings ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE chat_blocks ADD CONSTRAINT "chat_blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE chat_blocks ADD CONSTRAINT "chat_blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE;
ALTER TABLE chat_participants ADD CONSTRAINT "chat_participants_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE;
ALTER TABLE chat_participants ADD CONSTRAINT "chat_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE chat_reads ADD CONSTRAINT "chat_reads_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE;
ALTER TABLE chat_reads ADD CONSTRAINT "chat_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE chat_threads ADD CONSTRAINT "chat_threads_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE comment_reactions ADD CONSTRAINT "comment_reactions_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES review_comments(id) ON DELETE CASCADE;
ALTER TABLE comment_reactions ADD CONSTRAINT "comment_reactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE content_reports ADD CONSTRAINT "content_reports_content_id_fkey" FOREIGN KEY (content_id) REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE department ADD CONSTRAINT "department_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE;
ALTER TABLE department_membership ADD CONSTRAINT "department_membership_department_id_fkey" FOREIGN KEY (department_id) REFERENCES department(id) ON DELETE CASCADE;
ALTER TABLE department_membership ADD CONSTRAINT "department_membership_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE;
ALTER TABLE department_membership ADD CONSTRAINT "department_membership_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE favorites ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE group_members ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE group_members ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE groups ADD CONSTRAINT "groups_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE marketing_consent ADD CONSTRAINT "marketing_consent_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE message_feedback ADD CONSTRAINT "message_feedback_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE message_feedback ADD CONSTRAINT "message_feedback_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE moderation_actions ADD CONSTRAINT "moderation_actions_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id);
ALTER TABLE moderation_actions ADD CONSTRAINT "moderation_actions_queue_id_fkey" FOREIGN KEY (queue_id) REFERENCES moderation_queue(id) ON DELETE SET NULL;
ALTER TABLE moderation_actions ADD CONSTRAINT "moderation_actions_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE moderation_queue ADD CONSTRAINT "moderation_queue_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE moderation_queue ADD CONSTRAINT "moderation_queue_reported_by_fkey" FOREIGN KEY (reported_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE moderation_queue ADD CONSTRAINT "moderation_queue_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE music_followed ADD CONSTRAINT "music_followed_track_id_fkey" FOREIGN KEY (track_id) REFERENCES music_tracks(id) ON DELETE CASCADE;
ALTER TABLE music_followed ADD CONSTRAINT "music_followed_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE music_saved ADD CONSTRAINT "music_saved_track_id_fkey" FOREIGN KEY (track_id) REFERENCES music_tracks(id) ON DELETE CASCADE;
ALTER TABLE music_saved ADD CONSTRAINT "music_saved_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE music_track_reports ADD CONSTRAINT "music_track_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE music_track_reports ADD CONSTRAINT "music_track_reports_track_id_fkey" FOREIGN KEY (track_id) REFERENCES music_tracks(id) ON DELETE CASCADE;
ALTER TABLE music_tracks ADD CONSTRAINT "music_tracks_category_id_fkey" FOREIGN KEY (category_id) REFERENCES music_categories(id);
ALTER TABLE music_tracks ADD CONSTRAINT "music_tracks_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES music_providers(id);
ALTER TABLE music_tracks ADD CONSTRAINT "music_tracks_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE music_usage ADD CONSTRAINT "music_usage_track_id_fkey" FOREIGN KEY (track_id) REFERENCES music_tracks(id) ON DELETE CASCADE;
ALTER TABLE music_usage ADD CONSTRAINT "music_usage_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE notification_deliveries ADD CONSTRAINT "notification_deliveries_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id) ON DELETE RESTRICT;
ALTER TABLE notification_deliveries ADD CONSTRAINT "notification_deliveries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE notification_subscriptions ADD CONSTRAINT "notification_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE partner_deal_translations ADD CONSTRAINT "partner_deal_translations_deal_id_fkey" FOREIGN KEY (deal_id) REFERENCES partner_deals(id) ON DELETE CASCADE;
ALTER TABLE platform_owner ADD CONSTRAINT "platform_owner_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE platform_owner_recovery ADD CONSTRAINT "platform_owner_recovery_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE platform_settings ADD CONSTRAINT "platform_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);
ALTER TABLE price_watches ADD CONSTRAINT "price_watches_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE profiles ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE review_comments ADD CONSTRAINT "review_comments_parent_comment_id_fkey" FOREIGN KEY (parent_comment_id) REFERENCES review_comments(id) ON DELETE CASCADE;
ALTER TABLE review_comments ADD CONSTRAINT "review_comments_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE review_comments ADD CONSTRAINT "review_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE review_interactions ADD CONSTRAINT "review_interactions_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE review_interactions ADD CONSTRAINT "review_interactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE review_likes ADD CONSTRAINT "review_likes_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE review_likes ADD CONSTRAINT "review_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE review_milestones ADD CONSTRAINT "review_milestones_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE review_saves ADD CONSTRAINT "review_saves_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE review_saves ADD CONSTRAINT "review_saves_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE review_shares ADD CONSTRAINT "review_shares_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE review_shares ADD CONSTRAINT "review_shares_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE reviews ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE subscriptions ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE user_acquisition ADD CONSTRAINT "user_acquisition_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE user_demographics ADD CONSTRAINT "user_demographics_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE user_events ADD CONSTRAINT "user_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_follows ADD CONSTRAINT "user_follows_follower_id_fkey" FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_follows ADD CONSTRAINT "user_follows_following_id_fkey" FOREIGN KEY (following_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_integrations ADD CONSTRAINT "user_integrations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_notes ADD CONSTRAINT "user_notes_author_id_fkey" FOREIGN KEY (author_id) REFERENCES profiles(id);
ALTER TABLE user_notes ADD CONSTRAINT "user_notes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE user_preferences ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE vouchers ADD CONSTRAINT "vouchers_service_id_fkey" FOREIGN KEY (service_id) REFERENCES services(id);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_account_status_suspended_until ON public.account_status USING btree (suspended_until) WHERE (is_suspended AND (suspended_until IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_activation_daily_rollup_date ON public.activation_daily_rollup USING btree (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_admin_roles_user ON public.admin_roles USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log USING btree (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log USING btree (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_date ON public.audit_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON public.audit_log USING btree (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_daily_rollup_date ON public.auth_daily_rollup USING btree (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS bookings_date_idx ON public.bookings USING btree (date);
CREATE INDEX IF NOT EXISTS bookings_service_id_idx ON public.bookings USING btree (service_id);
CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON public.bookings USING btree (user_id);
CREATE INDEX IF NOT EXISTS chat_blocks_blocked_idx ON public.chat_blocks USING btree (blocked_id);
CREATE INDEX IF NOT EXISTS chat_messages_thread_created_idx ON public.chat_messages USING btree (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_participants_user_idx ON public.chat_participants USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_direct_key_uniq ON public.chat_threads USING btree (direct_key) WHERE (kind = 'direct'::text);
CREATE INDEX IF NOT EXISTS chat_threads_last_message_idx ON public.chat_threads USING btree (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_cohort_metrics_date ON public.cohort_metrics USING btree (cohort_date DESC);
CREATE INDEX IF NOT EXISTS comment_reactions_comment_idx ON public.comment_reactions USING btree (comment_id);
CREATE INDEX IF NOT EXISTS comment_reactions_user_idx ON public.comment_reactions USING btree (user_id);
CREATE INDEX IF NOT EXISTS content_reports_content_idx ON public.content_reports USING btree (content_id);
CREATE INDEX IF NOT EXISTS content_reports_policy_idx ON public.content_reports USING btree (policy_id) WHERE (policy_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON public.conversations USING btree (updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON public.conversations USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date ON public.daily_snapshots USING btree (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_platform ON public.daily_snapshots USING btree (platform, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS decision_evidence_expires_idx ON public.decision_evidence USING btree (expires_at);
CREATE INDEX IF NOT EXISTS decision_evidence_owner_created_idx ON public.decision_evidence USING btree (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_department_org ON public.department USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_membership_user_active ON public.department_membership USING btree (user_id, status);
CREATE INDEX IF NOT EXISTS event_outbox_claim_idx ON public.event_outbox USING btree (next_attempt_at, created_at) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS event_outbox_dead_idx ON public.event_outbox USING btree (created_at DESC) WHERE (status = 'dead'::text);
CREATE UNIQUE INDEX IF NOT EXISTS group_members_group_user_uniq ON public.group_members USING btree (group_id, user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON public.marketing_campaigns USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_consent_user ON public.marketing_consent USING btree (user_id);
CREATE INDEX IF NOT EXISTS message_feedback_conversation_id_idx ON public.message_feedback USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS message_feedback_user_id_idx ON public.message_feedback USING btree (user_id);
CREATE INDEX IF NOT EXISTS message_feedback_user_idx ON public.message_feedback USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_mod_actions_actor ON public.moderation_actions USING btree (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_target ON public.moderation_actions USING btree (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modq_status ON public.moderation_queue USING btree (status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_modq_target ON public.moderation_queue USING btree (target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_modq_source ON public.moderation_queue USING btree (((metadata ->> 'source_table'::text)), ((metadata ->> 'source_id'::text))) WHERE (metadata ? 'source_id'::text);
CREATE INDEX IF NOT EXISTS music_categories_sort_idx ON public.music_categories USING btree (sort_order);
CREATE INDEX IF NOT EXISTS music_followed_track_idx ON public.music_followed USING btree (track_id);
CREATE INDEX IF NOT EXISTS music_followed_user_idx ON public.music_followed USING btree (user_id);
CREATE INDEX IF NOT EXISTS music_saved_track_idx ON public.music_saved USING btree (track_id);
CREATE INDEX IF NOT EXISTS music_saved_user_idx ON public.music_saved USING btree (user_id);
CREATE INDEX IF NOT EXISTS music_track_reports_status_idx ON public.music_track_reports USING btree (status) WHERE (status = 'open'::text);
CREATE INDEX IF NOT EXISTS music_track_reports_track_idx ON public.music_track_reports USING btree (track_id);
CREATE INDEX IF NOT EXISTS music_tracks_active_idx ON public.music_tracks USING btree (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS music_tracks_artist_search_idx ON public.music_tracks USING btree (lower(artist));
CREATE INDEX IF NOT EXISTS music_tracks_category_idx ON public.music_tracks USING btree (category_id);
CREATE INDEX IF NOT EXISTS music_tracks_provider_idx ON public.music_tracks USING btree (provider_id);
CREATE INDEX IF NOT EXISTS music_tracks_title_search_idx ON public.music_tracks USING btree (lower(title));
CREATE INDEX IF NOT EXISTS music_tracks_uploaded_by_idx ON public.music_tracks USING btree (uploaded_by);
CREATE INDEX IF NOT EXISTS music_usage_entity_idx ON public.music_usage USING btree (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS music_usage_track_idx ON public.music_usage USING btree (track_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_campaign ON public.notification_deliveries USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_cap ON public.notification_deliveries USING btree (user_id, created_at DESC) WHERE (status = 'sent'::text);
CREATE INDEX IF NOT EXISTS idx_notif_subs_enabled ON public.notification_subscriptions USING btree (enabled) WHERE (enabled = true);
CREATE INDEX IF NOT EXISTS idx_notif_subs_user_id ON public.notification_subscriptions USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS notification_subscriptions_one_owner_per_credential ON public.notification_subscriptions USING btree (push_credential(subscription_data)) WHERE enabled;
CREATE INDEX IF NOT EXISTS notifications_push_retry_idx ON public.notifications USING btree (push_status) WHERE (push_status = 'failed'::text);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_partner_deals_active_order ON public.partner_deals USING btree (is_active, display_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_deals_slug ON public.partner_deals USING btree (partner_slug);
CREATE INDEX IF NOT EXISTS idx_platform_owner_user ON public.platform_owner USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_owner_single_active ON public.platform_owner USING btree (active) WHERE (active = true);
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_owner_recovery_open ON public.platform_owner_recovery USING btree (((closed_at IS NULL))) WHERE (closed_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_platform_settings_scope ON public.platform_settings USING btree (scope);
CREATE INDEX IF NOT EXISTS price_watches_status_idx ON public.price_watches USING btree (status) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS review_comments_parent_idx ON public.review_comments USING btree (parent_comment_id, created_at);
CREATE INDEX IF NOT EXISTS review_comments_review_id_idx ON public.review_comments USING btree (review_id, created_at);
CREATE INDEX IF NOT EXISTS review_likes_review_id_idx ON public.review_likes USING btree (review_id);
CREATE INDEX IF NOT EXISTS review_likes_user_id_idx ON public.review_likes USING btree (user_id);
CREATE INDEX IF NOT EXISTS review_milestones_review_idx ON public.review_milestones USING btree (review_id);
CREATE INDEX IF NOT EXISTS review_saves_review_id_idx ON public.review_saves USING btree (review_id);
CREATE INDEX IF NOT EXISTS review_saves_user_idx ON public.review_saves USING btree (user_id);
CREATE INDEX IF NOT EXISTS review_shares_review_id_idx ON public.review_shares USING btree (review_id);
CREATE INDEX IF NOT EXISTS review_shares_user_created_idx ON public.review_shares USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_content_type_idx ON public.reviews USING btree (content_type);
CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON public.reviews USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_feed_score_idx ON public.reviews USING btree (like_count DESC, save_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_hashtags_idx ON public.reviews USING gin (hashtags);
CREATE INDEX IF NOT EXISTS reviews_publication_state_idx ON public.reviews USING btree (publication_state) WHERE (publication_state IS NOT NULL);
CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON public.reviews USING btree (user_id);
CREATE INDEX IF NOT EXISTS reviews_view_count_idx ON public.reviews USING btree (view_count);
CREATE INDEX IF NOT EXISTS reviews_visibility_idx ON public.reviews USING btree (is_hidden, created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON public.subscriptions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_health_log_check ON public.system_health_log USING btree (check_name, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_acquisition_method ON public.user_acquisition USING btree (signup_method);
CREATE INDEX IF NOT EXISTS idx_user_acquisition_platform ON public.user_acquisition USING btree (signup_platform);
CREATE INDEX IF NOT EXISTS idx_user_acquisition_signup_at ON public.user_acquisition USING btree (signup_at);
CREATE INDEX IF NOT EXISTS idx_user_acquisition_source ON public.user_acquisition USING btree (acquisition_source);
CREATE INDEX IF NOT EXISTS idx_user_events_anon ON public.user_events USING btree (anon_id) WHERE (anon_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_user_events_created ON public.user_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_type_created ON public.user_events USING btree (event_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_events_event_id ON public.user_events USING btree (event_id);
CREATE INDEX IF NOT EXISTS user_events_type_idx ON public.user_events USING btree (event_type);
CREATE INDEX IF NOT EXISTS user_events_user_created_idx ON public.user_events USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_events_user_id_idx ON public.user_events USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_follows_follower_idx ON public.user_follows USING btree (follower_id);
CREATE INDEX IF NOT EXISTS user_follows_following_idx ON public.user_follows USING btree (following_id);
CREATE INDEX IF NOT EXISTS user_memory_user_id_idx ON public.user_memory USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_notes_user ON public.user_notes USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_preferences_profile_updated_idx ON public.user_preferences USING btree (user_id, profile_updated_at DESC);

-- ===== SEQUENCE OWNERSHIP =====

-- ===== TRIGGERS =====
CREATE TRIGGER account_status_set_updated_at BEFORE UPDATE ON public.account_status FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER zzz_audit_log_chain BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION fn_audit_log_chain();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER chat_messages_touch_thread AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION chat_touch_thread();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_notif_subs_single_owner BEFORE INSERT OR UPDATE OF subscription_data, enabled ON public.notification_subscriptions FOR EACH ROW WHEN (new.enabled) EXECUTE FUNCTION notification_subscriptions_enforce_single_owner();
CREATE TRIGGER trg_notif_subs_updated_at BEFORE UPDATE ON public.notification_subscriptions FOR EACH ROW EXECUTE FUNCTION update_notification_subscriptions_updated_at();
CREATE TRIGGER trg_partner_deal_translations_updated_at BEFORE UPDATE ON public.partner_deal_translations FOR EACH ROW EXECUTE FUNCTION partner_deal_translations_touch_updated_at();
CREATE TRIGGER trg_partner_deals_slug_immutable BEFORE UPDATE ON public.partner_deals FOR EACH ROW EXECUTE FUNCTION partner_deals_slug_immutable();
CREATE TRIGGER trg_partner_deals_updated_at BEFORE UPDATE ON public.partner_deals FOR EACH ROW EXECUTE FUNCTION partner_deals_touch_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_review_comment_count AFTER INSERT OR DELETE ON public.review_comments FOR EACH ROW EXECUTE FUNCTION update_review_comment_count();
CREATE TRIGGER trg_review_like_count AFTER INSERT OR DELETE ON public.review_likes FOR EACH ROW EXECUTE FUNCTION update_review_like_count();
CREATE TRIGGER trg_review_save_count AFTER INSERT OR DELETE ON public.review_saves FOR EACH ROW EXECUTE FUNCTION update_review_save_count();
CREATE TRIGGER user_demographics_set_updated_at BEFORE UPDATE ON public.user_demographics FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_follow_counts AFTER INSERT OR DELETE ON public.user_follows FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- ===== ROW LEVEL SECURITY =====
ALTER TABLE public."account_status" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."activation_daily_rollup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."admin_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."admin_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."anon_chat_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."auth_daily_rollup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."billing_customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cohort_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."comment_reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."content_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."daily_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."decision_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."department_membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."event_outbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."favorites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."group_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."marketing_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."marketing_consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."message_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."moderation_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."moderation_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."music_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."music_followed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."music_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."music_saved" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."music_track_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."music_tracks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."music_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notification_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notification_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_deal_translations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_deals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."place_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_owner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_owner_recovery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."price_watches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."review_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."review_interactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."review_likes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."review_milestones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."review_saves" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."review_shares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."system_health_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_acquisition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_demographics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_follows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_memory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vouchers" ENABLE ROW LEVEL SECURITY;

-- ===== POLICIES =====
CREATE POLICY "account_status_select_own" ON account_status AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "billing_customers_select_own" ON billing_customers AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "Users can manage own bookings" ON bookings AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "chat_blocks_delete_own" ON chat_blocks AS PERMISSIVE FOR DELETE TO public USING ((blocker_id = auth.uid()));
CREATE POLICY "chat_blocks_insert_own" ON chat_blocks AS PERMISSIVE FOR INSERT TO public WITH CHECK ((blocker_id = auth.uid()));
CREATE POLICY "chat_blocks_select_own" ON chat_blocks AS PERMISSIVE FOR SELECT TO public USING ((blocker_id = auth.uid()));
CREATE POLICY "chat_messages_insert_participant" ON chat_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((chat_is_participant(thread_id) AND (sender_id = auth.uid()) AND (NOT chat_thread_blocked(thread_id))));
CREATE POLICY "chat_messages_select_participant" ON chat_messages AS PERMISSIVE FOR SELECT TO public USING (chat_is_participant(thread_id));
CREATE POLICY "chat_participants_select_own_threads" ON chat_participants AS PERMISSIVE FOR SELECT TO public USING (chat_is_participant(thread_id));
CREATE POLICY "chat_reads_insert_own" ON chat_reads AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = auth.uid()) AND chat_is_participant(thread_id)));
CREATE POLICY "chat_reads_select_own" ON chat_reads AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "chat_reads_update_own" ON chat_reads AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "chat_settings_select_all" ON chat_settings AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "chat_threads_select_participant" ON chat_threads AS PERMISSIVE FOR SELECT TO public USING (chat_is_participant(id));
CREATE POLICY "Anyone can read comment reactions" ON comment_reactions AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users can add own reaction" ON comment_reactions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can change own reaction" ON comment_reactions AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can remove own reaction" ON comment_reactions AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can file a content report" ON content_reports AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Users can manage own conversations" ON conversations AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own favorites" ON favorites AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Anyone can read group members" ON group_members AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "group_members_delete_self" ON group_members AS PERMISSIVE FOR DELETE TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "group_members_insert_self" ON group_members AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Anyone can read groups" ON groups AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Creators manage own groups" ON groups AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = creator_id)) WITH CHECK ((auth.uid() = creator_id));
CREATE POLICY "Users can manage own message feedback" ON message_feedback AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "users_manage_own_feedback" ON message_feedback AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Anyone can read active music categories" ON music_categories AS PERMISSIVE FOR SELECT TO public USING (is_active);
CREATE POLICY "own followed tracks delete" ON music_followed AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "own followed tracks insert" ON music_followed AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "own followed tracks select" ON music_followed AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Anyone can read music providers" ON music_providers AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "own saved tracks delete" ON music_saved AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "own saved tracks insert" ON music_saved AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "own saved tracks select" ON music_saved AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can file a report" ON music_track_reports AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = reporter_id));
CREATE POLICY "Anyone can read active music tracks" ON music_tracks AS PERMISSIVE FOR SELECT TO public USING (is_active);
CREATE POLICY "Uploader can deactivate own track" ON music_tracks AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = uploaded_by)) WITH CHECK ((auth.uid() = uploaded_by));
CREATE POLICY "Users publish own original sound" ON music_tracks AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() = uploaded_by) AND (music_type = 'original_sound'::text) AND (rights_confirmed = true)));
CREATE POLICY "music_tracks_publication_boundary" ON music_tracks AS RESTRICTIVE FOR SELECT TO "anon", "authenticated" USING (fn_original_sound_is_servable(id));
CREATE POLICY "Users can record their own music usage" ON music_usage AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "users_manage_own_subscriptions" ON notification_subscriptions AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "notifications_select_own" ON notifications AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "notifications_update_own" ON notifications AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "public reads translations of visible deals" ON partner_deal_translations AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partner_deals d
  WHERE (d.id = partner_deal_translations.deal_id))));
CREATE POLICY "public reads active in-window deals" ON partner_deals AS PERMISSIVE FOR SELECT TO public USING ((is_active AND ((start_at IS NULL) OR (start_at <= now())) AND ((end_at IS NULL) OR (end_at >= now()))));
CREATE POLICY "anon_read" ON place_photos AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users manage own price watches" ON price_watches AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Public profiles are viewable by everyone" ON profiles AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users can insert own profile" ON profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can update own profile" ON profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id));
CREATE POLICY "Users can view own profile" ON profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));
CREATE POLICY "profiles_insert_own" ON profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = id));
CREATE POLICY "profiles_select" ON profiles AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "profiles_select_own" ON profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));
CREATE POLICY "profiles_update" ON profiles AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
CREATE POLICY "profiles_update_own" ON profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id));
CREATE POLICY "Anyone can read comments" ON review_comments AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users can comment" ON review_comments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own comment" ON review_comments AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own interactions" ON review_interactions AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Anyone can read likes" ON review_likes AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users can like" ON review_likes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can unlike" ON review_likes AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Anyone can read milestones" ON review_milestones AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users manage own saves" ON review_saves AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "review_saves_delete_own" ON review_saves AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "review_saves_insert_own" ON review_saves AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "review_saves_select_own" ON review_saves AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "review_shares_delete_own" ON review_shares AS PERMISSIVE FOR DELETE TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "review_shares_insert_own" ON review_shares AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((auth.uid() = user_id) AND (COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) = false)));
CREATE POLICY "review_shares_select_own" ON review_shares AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() = user_id) AND (COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) = false)));
CREATE POLICY "Owners can see own reviews" ON reviews AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Read visible reviews" ON reviews AS PERMISSIVE FOR SELECT TO public USING ((NOT is_hidden));
CREATE POLICY "Users can update own reviews" ON reviews AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users delete own reviews" ON reviews AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own reviews" ON reviews AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "reviews_publication_boundary" ON reviews AS RESTRICTIVE FOR SELECT TO "anon", "authenticated" USING (((publication_state IS NULL) OR (publication_state = 'PUBLISHED'::text) OR (user_id = auth.uid())));
CREATE POLICY "services_select_all" ON services AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));
CREATE POLICY "subscriptions_select_own" ON subscriptions AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "user_demographics_insert_own" ON user_demographics AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "user_demographics_select_own" ON user_demographics AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "user_demographics_update_own" ON user_demographics AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users insert own events" ON user_events AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own events" ON user_events AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users read own events" ON user_events AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Anyone can read follows" ON user_follows AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users can follow" ON user_follows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = follower_id));
CREATE POLICY "Users can unfollow" ON user_follows AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = follower_id));
CREATE POLICY "Users manage own integrations" ON user_integrations AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can manage own memory" ON user_memory AS PERMISSIVE FOR ALL TO public USING (((auth.uid())::text = user_id));
CREATE POLICY "Users can manage own preferences" ON user_preferences AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own preferences" ON user_preferences AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "vouchers_select_all" ON vouchers AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));

-- ===== TABLE/SEQUENCE PRIVILEGES (reset to production state for anon/authenticated/service_role) =====
REVOKE ALL ON TABLE public."account_status" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."account_status" TO "service_role";
REVOKE ALL ON TABLE public."activation_daily_rollup" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."activation_daily_rollup" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."activation_daily_rollup" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."activation_daily_rollup" TO "service_role";
REVOKE ALL ON TABLE public."admin_permissions" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."admin_permissions" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."admin_permissions" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."admin_permissions" TO "service_role";
REVOKE ALL ON TABLE public."admin_roles" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."admin_roles" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."admin_roles" TO "authenticated";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."admin_roles" TO "service_role";
REVOKE ALL ON TABLE public."anon_chat_usage" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."anon_chat_usage" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."anon_chat_usage" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."anon_chat_usage" TO "service_role";
REVOKE ALL ON TABLE public."audit_log" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."audit_log" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."audit_log" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."audit_log" TO "service_role";
REVOKE ALL ON TABLE public."auth_daily_rollup" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."auth_daily_rollup" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."auth_daily_rollup" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."auth_daily_rollup" TO "service_role";
REVOKE ALL ON TABLE public."billing_customers" FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public."billing_customers" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."billing_customers" TO "service_role";
REVOKE ALL ON TABLE public."bookings" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."bookings" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."bookings" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."bookings" TO "service_role";
REVOKE ALL ON TABLE public."chat_blocks" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, SELECT ON TABLE public."chat_blocks" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."chat_blocks" TO "service_role";
REVOKE ALL ON TABLE public."chat_messages" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT ON TABLE public."chat_messages" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."chat_messages" TO "service_role";
REVOKE ALL ON TABLE public."chat_participants" FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public."chat_participants" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."chat_participants" TO "service_role";
REVOKE ALL ON TABLE public."chat_reads" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public."chat_reads" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."chat_reads" TO "service_role";
REVOKE ALL ON TABLE public."chat_settings" FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public."chat_settings" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."chat_settings" TO "service_role";
REVOKE ALL ON TABLE public."chat_threads" FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public."chat_threads" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."chat_threads" TO "service_role";
REVOKE ALL ON TABLE public."cohort_metrics" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."cohort_metrics" TO "service_role";
REVOKE ALL ON TABLE public."comment_reactions" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."comment_reactions" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."comment_reactions" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."comment_reactions" TO "service_role";
REVOKE ALL ON TABLE public."content_reports" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."content_reports" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."content_reports" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."content_reports" TO "service_role";
REVOKE ALL ON TABLE public."conversations" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."conversations" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."conversations" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."conversations" TO "service_role";
REVOKE ALL ON TABLE public."daily_snapshots" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."daily_snapshots" TO "service_role";
REVOKE ALL ON TABLE public."decision_evidence" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."decision_evidence" TO "service_role";
REVOKE ALL ON TABLE public."department" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."department" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."department" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."department" TO "service_role";
REVOKE ALL ON TABLE public."department_membership" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."department_membership" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."department_membership" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."department_membership" TO "service_role";
REVOKE ALL ON TABLE public."event_outbox" FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public."event_outbox" TO "service_role";
REVOKE ALL ON TABLE public."favorites" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."favorites" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."favorites" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."favorites" TO "service_role";
REVOKE ALL ON TABLE public."group_members" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."group_members" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."group_members" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."group_members" TO "service_role";
REVOKE ALL ON TABLE public."groups" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."groups" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."groups" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."groups" TO "service_role";
REVOKE ALL ON TABLE public."marketing_campaigns" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."marketing_campaigns" TO "service_role";
REVOKE ALL ON TABLE public."marketing_consent" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."marketing_consent" TO "service_role";
REVOKE ALL ON TABLE public."message_feedback" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."message_feedback" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."message_feedback" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."message_feedback" TO "service_role";
REVOKE ALL ON TABLE public."moderation_actions" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."moderation_actions" TO "service_role";
REVOKE ALL ON TABLE public."moderation_queue" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."moderation_queue" TO "service_role";
REVOKE ALL ON TABLE public."music_categories" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_categories" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_categories" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_categories" TO "service_role";
REVOKE ALL ON TABLE public."music_followed" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_followed" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_followed" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_followed" TO "service_role";
REVOKE ALL ON TABLE public."music_providers" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_providers" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_providers" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_providers" TO "service_role";
REVOKE ALL ON TABLE public."music_saved" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_saved" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_saved" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_saved" TO "service_role";
REVOKE ALL ON TABLE public."music_track_reports" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_track_reports" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_track_reports" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_track_reports" TO "service_role";
REVOKE ALL ON TABLE public."music_tracks" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_tracks" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_tracks" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_tracks" TO "service_role";
REVOKE ALL ON TABLE public."music_usage" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_usage" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_usage" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."music_usage" TO "service_role";
REVOKE ALL ON TABLE public."notification_deliveries" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."notification_deliveries" TO "service_role";
REVOKE ALL ON TABLE public."notification_subscriptions" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."notification_subscriptions" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."notification_subscriptions" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."notification_subscriptions" TO "service_role";
REVOKE ALL ON TABLE public."notifications" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."notifications" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."notifications" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."notifications" TO "service_role";
REVOKE ALL ON TABLE public."organization" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."organization" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."organization" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."organization" TO "service_role";
REVOKE ALL ON TABLE public."partner_deal_translations" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."partner_deal_translations" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."partner_deal_translations" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."partner_deal_translations" TO "service_role";
REVOKE ALL ON TABLE public."partner_deals" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."partner_deals" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."partner_deals" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."partner_deals" TO "service_role";
REVOKE ALL ON TABLE public."place_photos" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."place_photos" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."place_photos" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."place_photos" TO "service_role";
REVOKE ALL ON TABLE public."platform_owner" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."platform_owner" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."platform_owner" TO "authenticated";
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public."platform_owner" TO "service_role";
REVOKE ALL ON TABLE public."platform_owner_recovery" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public."platform_settings" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."platform_settings" TO "service_role";
REVOKE ALL ON TABLE public."price_watches" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."price_watches" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."price_watches" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."price_watches" TO "service_role";
REVOKE ALL ON TABLE public."profiles" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."profiles" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."profiles" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."profiles" TO "service_role";
REVOKE ALL ON TABLE public."review_comments" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_comments" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_comments" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_comments" TO "service_role";
REVOKE ALL ON TABLE public."review_interactions" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_interactions" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_interactions" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_interactions" TO "service_role";
REVOKE ALL ON TABLE public."review_likes" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_likes" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_likes" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_likes" TO "service_role";
REVOKE ALL ON TABLE public."review_milestones" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_milestones" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_milestones" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_milestones" TO "service_role";
REVOKE ALL ON TABLE public."review_saves" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_saves" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_saves" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_saves" TO "service_role";
REVOKE ALL ON TABLE public."review_shares" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_shares" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_shares" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."review_shares" TO "service_role";
REVOKE ALL ON TABLE public."reviews" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."reviews" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."reviews" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."reviews" TO "service_role";
REVOKE ALL ON TABLE public."services" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."services" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."services" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."services" TO "service_role";
REVOKE ALL ON TABLE public."subscriptions" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."subscriptions" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."subscriptions" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."subscriptions" TO "service_role";
REVOKE ALL ON TABLE public."system_health_log" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."system_health_log" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."system_health_log" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."system_health_log" TO "service_role";
REVOKE ALL ON TABLE public."user_acquisition" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_acquisition" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_acquisition" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_acquisition" TO "service_role";
REVOKE ALL ON TABLE public."user_demographics" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_demographics" TO "service_role";
REVOKE ALL ON TABLE public."user_events" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_events" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_events" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_events" TO "service_role";
REVOKE ALL ON TABLE public."user_follows" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_follows" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_follows" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_follows" TO "service_role";
REVOKE ALL ON TABLE public."user_integrations" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_integrations" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_integrations" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_integrations" TO "service_role";
REVOKE ALL ON TABLE public."user_memory" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_memory" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_memory" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_memory" TO "service_role";
REVOKE ALL ON TABLE public."user_notes" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_notes" TO "service_role";
REVOKE ALL ON TABLE public."user_preferences" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_preferences" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_preferences" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."user_preferences" TO "service_role";
REVOKE ALL ON TABLE public."vouchers" FROM anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."vouchers" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."vouchers" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."vouchers" TO "service_role";
REVOKE ALL ON SEQUENCE public."audit_log_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."audit_log_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."audit_log_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."audit_log_seq" TO "service_role";

-- ===== COLUMN PRIVILEGES =====
GRANT SELECT ("is_banned") ON TABLE public."account_status" TO "authenticated";
GRANT SELECT ("is_suspended") ON TABLE public."account_status" TO "authenticated";
GRANT SELECT ("suspended_until") ON TABLE public."account_status" TO "authenticated";
GRANT SELECT ("user_id") ON TABLE public."account_status" TO "authenticated";
GRANT UPDATE ("city") ON TABLE public."user_demographics" TO "authenticated";
GRANT INSERT ("city") ON TABLE public."user_demographics" TO "authenticated";
GRANT SELECT ("city") ON TABLE public."user_demographics" TO "authenticated";
GRANT INSERT ("country") ON TABLE public."user_demographics" TO "authenticated";
GRANT UPDATE ("country") ON TABLE public."user_demographics" TO "authenticated";
GRANT SELECT ("country") ON TABLE public."user_demographics" TO "authenticated";
GRANT SELECT ("created_at") ON TABLE public."user_demographics" TO "authenticated";
GRANT SELECT ("education_level") ON TABLE public."user_demographics" TO "authenticated";
GRANT UPDATE ("education_level") ON TABLE public."user_demographics" TO "authenticated";
GRANT INSERT ("education_level") ON TABLE public."user_demographics" TO "authenticated";
GRANT SELECT ("gender") ON TABLE public."user_demographics" TO "authenticated";
GRANT UPDATE ("gender") ON TABLE public."user_demographics" TO "authenticated";
GRANT INSERT ("gender") ON TABLE public."user_demographics" TO "authenticated";
GRANT INSERT ("gender_self_describe") ON TABLE public."user_demographics" TO "authenticated";
GRANT UPDATE ("gender_self_describe") ON TABLE public."user_demographics" TO "authenticated";
GRANT SELECT ("gender_self_describe") ON TABLE public."user_demographics" TO "authenticated";
GRANT INSERT ("industry") ON TABLE public."user_demographics" TO "authenticated";
GRANT SELECT ("industry") ON TABLE public."user_demographics" TO "authenticated";
GRANT UPDATE ("industry") ON TABLE public."user_demographics" TO "authenticated";
GRANT UPDATE ("occupation") ON TABLE public."user_demographics" TO "authenticated";
GRANT INSERT ("occupation") ON TABLE public."user_demographics" TO "authenticated";
GRANT SELECT ("occupation") ON TABLE public."user_demographics" TO "authenticated";
GRANT SELECT ("updated_at") ON TABLE public."user_demographics" TO "authenticated";
GRANT SELECT ("user_id") ON TABLE public."user_demographics" TO "authenticated";
GRANT INSERT ("user_id") ON TABLE public."user_demographics" TO "authenticated";

-- ===== FUNCTION PRIVILEGES (reset to production state) =====
REVOKE ALL ON FUNCTION public."admin_set_user_date_of_birth"(p_user_id uuid, p_dob date, p_actor_id uuid, p_actor_email text, p_actor_role text, p_reason text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."admin_set_user_date_of_birth"(p_user_id uuid, p_dob date, p_actor_id uuid, p_actor_email text, p_actor_role text, p_reason text) TO "postgres";
GRANT EXECUTE ON FUNCTION public."admin_set_user_date_of_birth"(p_user_id uuid, p_dob date, p_actor_id uuid, p_actor_email text, p_actor_role text, p_reason text) TO "service_role";
REVOKE ALL ON FUNCTION public."age_band_of"(p_dob date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."age_band_of"(p_dob date) TO "postgres";
GRANT EXECUTE ON FUNCTION public."age_band_of"(p_dob date) TO "service_role";
REVOKE ALL ON FUNCTION public."anon_chat_usage_increment"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."anon_chat_usage_increment"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."anon_chat_usage_increment"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."anon_chat_usage_increment"() TO "service_role";
REVOKE ALL ON FUNCTION public."anon_chat_usage_today"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."anon_chat_usage_today"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."anon_chat_usage_today"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."anon_chat_usage_today"() TO "authenticated";
REVOKE ALL ON FUNCTION public."chat_can_reach"(p_target uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."chat_can_reach"(p_target uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."chat_can_reach"(p_target uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."chat_can_reach"(p_target uuid) TO "authenticated";
REVOKE ALL ON FUNCTION public."chat_create_group"(p_title text, p_members uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."chat_create_group"(p_title text, p_members uuid[]) TO "postgres";
GRANT EXECUTE ON FUNCTION public."chat_create_group"(p_title text, p_members uuid[]) TO "service_role";
GRANT EXECUTE ON FUNCTION public."chat_create_group"(p_title text, p_members uuid[]) TO "authenticated";
REVOKE ALL ON FUNCTION public."chat_is_participant"(p_thread uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."chat_is_participant"(p_thread uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."chat_is_participant"(p_thread uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."chat_is_participant"(p_thread uuid) TO "authenticated";
REVOKE ALL ON FUNCTION public."chat_start_direct"(p_target uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."chat_start_direct"(p_target uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."chat_start_direct"(p_target uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."chat_start_direct"(p_target uuid) TO "authenticated";
REVOKE ALL ON FUNCTION public."chat_thread_blocked"(p_thread uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."chat_thread_blocked"(p_thread uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."chat_thread_blocked"(p_thread uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."chat_thread_blocked"(p_thread uuid) TO "authenticated";
REVOKE ALL ON FUNCTION public."chat_thread_summaries"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."chat_thread_summaries"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."chat_thread_summaries"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."chat_thread_summaries"() TO "authenticated";
REVOKE ALL ON FUNCTION public."chat_touch_thread"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."chat_touch_thread"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."chat_touch_thread"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."chat_touch_thread"() TO "anon";
GRANT EXECUTE ON FUNCTION public."chat_touch_thread"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."chat_touch_thread"() TO "service_role";
REVOKE ALL ON FUNCTION public."decision_evidence_load"(p_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."decision_evidence_load"(p_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."decision_evidence_load"(p_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."decision_evidence_load"(p_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION public."decision_evidence_save"(p_id uuid, p_evidence jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."decision_evidence_save"(p_id uuid, p_evidence jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION public."decision_evidence_save"(p_id uuid, p_evidence jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION public."decision_evidence_save"(p_id uuid, p_evidence jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION public."disown_push_credential"(p_credential text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."disown_push_credential"(p_credential text) TO "postgres";
GRANT EXECUTE ON FUNCTION public."disown_push_credential"(p_credential text) TO "authenticated";
REVOKE ALL ON FUNCTION public."fn_audit_log_chain"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_audit_log_chain"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_audit_log_chain"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_audit_log_chain"() TO "anon";
GRANT EXECUTE ON FUNCTION public."fn_audit_log_chain"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."fn_audit_log_chain"() TO "service_role";
REVOKE ALL ON FUNCTION public."fn_audit_part"(p_value text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_audit_part"(p_value text) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_audit_part"(p_value text) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_audit_row_hash"(p_prev bytea, p_seq bigint, p_id uuid, p_actor_id uuid, p_actor_email text, p_actor_role text, p_action text, p_target_type text, p_target_id text, p_before_state jsonb, p_after_state jsonb, p_metadata jsonb, p_ip_address inet, p_user_agent text, p_created_at timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_audit_row_hash"(p_prev bytea, p_seq bigint, p_id uuid, p_actor_id uuid, p_actor_email text, p_actor_role text, p_action text, p_target_type text, p_target_id text, p_before_state jsonb, p_after_state jsonb, p_metadata jsonb, p_ip_address inet, p_user_agent text, p_created_at timestamp with time zone) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_audit_row_hash"(p_prev bytea, p_seq bigint, p_id uuid, p_actor_id uuid, p_actor_email text, p_actor_role text, p_action text, p_target_type text, p_target_id text, p_before_state jsonb, p_after_state jsonb, p_metadata jsonb, p_ip_address inet, p_user_agent text, p_created_at timestamp with time zone) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_audit_ts"(p_ts timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_audit_ts"(p_ts timestamp with time zone) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_audit_ts"(p_ts timestamp with time zone) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_claim_anonymous_conversations"(p_anon_id uuid, p_target_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_claim_anonymous_conversations"(p_anon_id uuid, p_target_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_claim_anonymous_conversations"(p_anon_id uuid, p_target_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_finalize_daily_snapshots"(p_before date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_finalize_daily_snapshots"(p_before date) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_finalize_daily_snapshots"(p_before date) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_grant_admin_role"(p_actor_id uuid, p_user_id uuid, p_role admin_role, p_notes text, p_expires_at timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_grant_admin_role"(p_actor_id uuid, p_user_id uuid, p_role admin_role, p_notes text, p_expires_at timestamp with time zone) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_grant_admin_role"(p_actor_id uuid, p_user_id uuid, p_role admin_role, p_notes text, p_expires_at timestamp with time zone) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_ingest_moderation_reports"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_ingest_moderation_reports"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_ingest_moderation_reports"() TO "service_role";
REVOKE ALL ON FUNCTION public."fn_is_platform_owner"(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_is_platform_owner"(p_user_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_is_platform_owner"(p_user_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_original_sound_is_servable"(p_track uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_original_sound_is_servable"(p_track uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_original_sound_is_servable"(p_track uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."fn_original_sound_is_servable"(p_track uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."fn_original_sound_is_servable"(p_track uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_outbox_claim"(p_ready_consumers text[], p_limit integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_outbox_claim"(p_ready_consumers text[], p_limit integer) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_outbox_claim"(p_ready_consumers text[], p_limit integer) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_outbox_publish"(p_event_id uuid, p_type text, p_event_version text, p_producer text, p_security_class text, p_occurred_at timestamp with time zone, p_consumer_ids text[], p_actor jsonb, p_correlation_id text, p_payload jsonb, p_metadata jsonb, p_schema_version smallint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_outbox_publish"(p_event_id uuid, p_type text, p_event_version text, p_producer text, p_security_class text, p_occurred_at timestamp with time zone, p_consumer_ids text[], p_actor jsonb, p_correlation_id text, p_payload jsonb, p_metadata jsonb, p_schema_version smallint) TO "postgres";
REVOKE ALL ON FUNCTION public."fn_outbox_settle"(p_id uuid, p_ok boolean, p_error text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_outbox_settle"(p_id uuid, p_ok boolean, p_error text) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_outbox_settle"(p_id uuid, p_ok boolean, p_error text) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_owner_recovery_arm"(p_target_user_id uuid, p_reason text, p_window_minutes integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_owner_recovery_arm"(p_target_user_id uuid, p_reason text, p_window_minutes integer) TO "postgres";
REVOKE ALL ON FUNCTION public."fn_owner_recovery_audit"(p_action text, p_target uuid, p_before jsonb, p_after jsonb, p_metadata jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_owner_recovery_audit"(p_action text, p_target uuid, p_before jsonb, p_after jsonb, p_metadata jsonb) TO "postgres";
REVOKE ALL ON FUNCTION public."fn_owner_recovery_cancel"(p_recovery_id uuid, p_reason text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_owner_recovery_cancel"(p_recovery_id uuid, p_reason text) TO "postgres";
REVOKE ALL ON FUNCTION public."fn_owner_recovery_execute"(p_recovery_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_owner_recovery_execute"(p_recovery_id uuid) TO "postgres";
REVOKE ALL ON FUNCTION public."fn_revoke_admin_role"(p_actor_id uuid, p_role_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_revoke_admin_role"(p_actor_id uuid, p_role_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_revoke_admin_role"(p_actor_id uuid, p_role_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_rollup_activation_daily"(p_from date, p_to date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_rollup_activation_daily"(p_from date, p_to date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_rollup_activation_daily"(p_from date, p_to date) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_rollup_activation_daily"(p_from date, p_to date) TO "anon";
GRANT EXECUTE ON FUNCTION public."fn_rollup_activation_daily"(p_from date, p_to date) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."fn_rollup_activation_daily"(p_from date, p_to date) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_rollup_auth_daily"(p_from date, p_to date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_rollup_auth_daily"(p_from date, p_to date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_rollup_auth_daily"(p_from date, p_to date) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_rollup_auth_daily"(p_from date, p_to date) TO "anon";
GRANT EXECUTE ON FUNCTION public."fn_rollup_auth_daily"(p_from date, p_to date) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."fn_rollup_auth_daily"(p_from date, p_to date) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_rollup_cohort_metrics"(p_from date, p_to date, p_today date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_rollup_cohort_metrics"(p_from date, p_to date, p_today date) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_rollup_cohort_metrics"(p_from date, p_to date, p_today date) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_rollup_daily_snapshots"(p_from date, p_to date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_rollup_daily_snapshots"(p_from date, p_to date) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_rollup_daily_snapshots"(p_from date, p_to date) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_session_inventory"(p_user_id uuid, p_limit integer, p_before timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_session_inventory"(p_user_id uuid, p_limit integer, p_before timestamp with time zone) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_session_inventory"(p_user_id uuid, p_limit integer, p_before timestamp with time zone) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_session_revoke"(p_session_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_session_revoke"(p_session_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_session_revoke"(p_session_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_session_revoke_all"(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_session_revoke_all"(p_user_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_session_revoke_all"(p_user_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_session_subject"(p_session_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_session_subject"(p_session_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_session_subject"(p_session_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_sync_last_login"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_sync_last_login"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_sync_last_login"() TO "service_role";
REVOKE ALL ON FUNCTION public."fn_upsert_activation"(p_user_id uuid, p_activated_at timestamp with time zone, p_activation_rule_version text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_upsert_activation"(p_user_id uuid, p_activated_at timestamp with time zone, p_activation_rule_version text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_upsert_activation"(p_user_id uuid, p_activated_at timestamp with time zone, p_activation_rule_version text) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_upsert_activation"(p_user_id uuid, p_activated_at timestamp with time zone, p_activation_rule_version text) TO "anon";
GRANT EXECUTE ON FUNCTION public."fn_upsert_activation"(p_user_id uuid, p_activated_at timestamp with time zone, p_activation_rule_version text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."fn_upsert_activation"(p_user_id uuid, p_activated_at timestamp with time zone, p_activation_rule_version text) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_upsert_user_acquisition"(p_user_id uuid, p_anon_id uuid, p_signup_method text, p_signup_platform text, p_signup_app_version text, p_signup_device_type text, p_signup_country text, p_signup_language text, p_acquisition_source text, p_signup_at timestamp with time zone, p_first_login_at timestamp with time zone, p_last_login_at timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_upsert_user_acquisition"(p_user_id uuid, p_anon_id uuid, p_signup_method text, p_signup_platform text, p_signup_app_version text, p_signup_device_type text, p_signup_country text, p_signup_language text, p_acquisition_source text, p_signup_at timestamp with time zone, p_first_login_at timestamp with time zone, p_last_login_at timestamp with time zone) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_upsert_user_acquisition"(p_user_id uuid, p_anon_id uuid, p_signup_method text, p_signup_platform text, p_signup_app_version text, p_signup_device_type text, p_signup_country text, p_signup_language text, p_acquisition_source text, p_signup_at timestamp with time zone, p_first_login_at timestamp with time zone, p_last_login_at timestamp with time zone) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_upsert_user_acquisition"(p_user_id uuid, p_anon_id uuid, p_signup_method text, p_signup_platform text, p_signup_app_version text, p_signup_device_type text, p_signup_country text, p_signup_language text, p_acquisition_source text, p_signup_at timestamp with time zone, p_first_login_at timestamp with time zone, p_last_login_at timestamp with time zone) TO "anon";
GRANT EXECUTE ON FUNCTION public."fn_upsert_user_acquisition"(p_user_id uuid, p_anon_id uuid, p_signup_method text, p_signup_platform text, p_signup_app_version text, p_signup_device_type text, p_signup_country text, p_signup_language text, p_acquisition_source text, p_signup_at timestamp with time zone, p_first_login_at timestamp with time zone, p_last_login_at timestamp with time zone) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."fn_upsert_user_acquisition"(p_user_id uuid, p_anon_id uuid, p_signup_method text, p_signup_platform text, p_signup_app_version text, p_signup_device_type text, p_signup_country text, p_signup_language text, p_acquisition_source text, p_signup_at timestamp with time zone, p_first_login_at timestamp with time zone, p_last_login_at timestamp with time zone) TO "service_role";
REVOKE ALL ON FUNCTION public."fn_verify_audit_chain"(p_from bigint, p_to bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."fn_verify_audit_chain"(p_from bigint, p_to bigint) TO "postgres";
GRANT EXECUTE ON FUNCTION public."fn_verify_audit_chain"(p_from bigint, p_to bigint) TO "service_role";
REVOKE ALL ON FUNCTION public."get_interaction_avgs"(p_review_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."get_interaction_avgs"(p_review_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."get_interaction_avgs"(p_review_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."handle_new_user"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO "anon";
GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO "service_role";
REVOKE ALL ON FUNCTION public."increment_deal_click"(p_deal_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."increment_deal_click"(p_deal_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."increment_deal_click"(p_deal_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."increment_deal_click"(p_deal_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."increment_deal_click"(p_deal_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."increment_deal_click"(p_deal_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."increment_review_view"(p_review_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."increment_review_view"(p_review_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."increment_review_view"(p_review_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."increment_review_view"(p_review_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."music_followed_count"(p_track uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."music_followed_count"(p_track uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."music_followed_count"(p_track uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."music_followed_count"(p_track uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."music_followed_count"(p_track uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."music_followed_count"(p_track uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."music_increment_play"(p_track uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."music_increment_play"(p_track uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."music_increment_play"(p_track uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."music_increment_play"(p_track uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."music_increment_play"(p_track uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."music_increment_play"(p_track uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."music_saved_count"(p_track uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."music_saved_count"(p_track uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."music_saved_count"(p_track uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."music_saved_count"(p_track uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."music_saved_count"(p_track uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."music_saved_count"(p_track uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."notification_subscriptions_enforce_single_owner"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."notification_subscriptions_enforce_single_owner"() TO "postgres";
REVOKE ALL ON FUNCTION public."partner_deal_translations_touch_updated_at"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."partner_deal_translations_touch_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."partner_deal_translations_touch_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."partner_deal_translations_touch_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION public."partner_deal_translations_touch_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."partner_deal_translations_touch_updated_at"() TO "service_role";
REVOKE ALL ON FUNCTION public."partner_deals_slug_immutable"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."partner_deals_slug_immutable"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."partner_deals_slug_immutable"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."partner_deals_slug_immutable"() TO "anon";
GRANT EXECUTE ON FUNCTION public."partner_deals_slug_immutable"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."partner_deals_slug_immutable"() TO "service_role";
REVOKE ALL ON FUNCTION public."partner_deals_touch_updated_at"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."partner_deals_touch_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."partner_deals_touch_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."partner_deals_touch_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION public."partner_deals_touch_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."partner_deals_touch_updated_at"() TO "service_role";
REVOKE ALL ON FUNCTION public."push_credential"(subscription_data jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."push_credential"(subscription_data jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."push_credential"(subscription_data jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION public."push_credential"(subscription_data jsonb) TO "anon";
GRANT EXECUTE ON FUNCTION public."push_credential"(subscription_data jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."push_credential"(subscription_data jsonb) TO "service_role";
REVOKE ALL ON FUNCTION public."set_updated_at"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO "service_role";
REVOKE ALL ON FUNCTION public."set_user_date_of_birth"(p_dob date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."set_user_date_of_birth"(p_dob date) TO "postgres";
GRANT EXECUTE ON FUNCTION public."set_user_date_of_birth"(p_dob date) TO "service_role";
GRANT EXECUTE ON FUNCTION public."set_user_date_of_birth"(p_dob date) TO "authenticated";
REVOKE ALL ON FUNCTION public."sync_review_watch_stats"(p_review_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."sync_review_watch_stats"(p_review_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public."sync_review_watch_stats"(p_review_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."sync_review_watch_stats"(p_review_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."update_follow_counts"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."update_follow_counts"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_follow_counts"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."update_follow_counts"() TO "anon";
GRANT EXECUTE ON FUNCTION public."update_follow_counts"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_follow_counts"() TO "service_role";
REVOKE ALL ON FUNCTION public."update_notification_subscriptions_updated_at"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."update_notification_subscriptions_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_notification_subscriptions_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."update_notification_subscriptions_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION public."update_notification_subscriptions_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_notification_subscriptions_updated_at"() TO "service_role";
REVOKE ALL ON FUNCTION public."update_review_comment_count"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."update_review_comment_count"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_review_comment_count"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."update_review_comment_count"() TO "anon";
GRANT EXECUTE ON FUNCTION public."update_review_comment_count"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_review_comment_count"() TO "service_role";
REVOKE ALL ON FUNCTION public."update_review_like_count"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."update_review_like_count"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_review_like_count"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."update_review_like_count"() TO "anon";
GRANT EXECUTE ON FUNCTION public."update_review_like_count"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_review_like_count"() TO "service_role";
REVOKE ALL ON FUNCTION public."update_review_save_count"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."update_review_save_count"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_review_save_count"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."update_review_save_count"() TO "anon";
GRANT EXECUTE ON FUNCTION public."update_review_save_count"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_review_save_count"() TO "service_role";
REVOKE ALL ON FUNCTION public."update_updated_at_column"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."update_updated_at_column"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_updated_at_column"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."update_updated_at_column"() TO "anon";
GRANT EXECUTE ON FUNCTION public."update_updated_at_column"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_updated_at_column"() TO "service_role";
REVOKE ALL ON FUNCTION public."user_age_status"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."user_age_status"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."user_age_status"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."user_age_status"() TO "authenticated";

-- ===== REALTIME PUBLICATION =====
ALTER PUBLICATION supabase_realtime ADD TABLE public."chat_messages";
ALTER PUBLICATION supabase_realtime ADD TABLE public."notifications";
ALTER PUBLICATION supabase_realtime ADD TABLE public."review_comments";
ALTER PUBLICATION supabase_realtime ADD TABLE public."review_likes";
ALTER PUBLICATION supabase_realtime ADD TABLE public."review_milestones";
ALTER PUBLICATION supabase_realtime ADD TABLE public."user_follows";
