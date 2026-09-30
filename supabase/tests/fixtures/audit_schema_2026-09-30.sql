-- Schema-only snapshot of the AUDIT database's public schema, read 2026-09-30 through catalog
-- queries in a READ ONLY transaction (security audit). Tables (columns, NOT NULL, simple defaults,
-- primary/unique keys), enum types, non-trigger functions, RLS flags, policies, table/column/function
-- grants for anon + authenticated. NO data, NO foreign keys, NO check constraints, NO triggers — the
-- suite that loads it tests who may read/write which rows, not data integrity.
-- Regenerate rather than hand-edit.
CREATE TYPE public.admin_role AS ENUM ('super_admin', 'admin', 'moderator', 'analyst');
CREATE TYPE public.moderation_action_type AS ENUM ('warn', 'hide_content', 'restore_content', 'suspend_user', 'unsuspend_user', 'ban_user', 'restore_user', 'delete_content', 'dismiss_report');
CREATE TYPE public.moderation_status AS ENUM ('pending', 'in_review', 'resolved', 'dismissed');
CREATE TYPE public.moderation_type AS ENUM ('review_report', 'comment_report', 'user_report', 'music_report', 'ai_flag');
CREATE TABLE public.account_deletion_jobs (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, group_ids uuid[] NOT NULL DEFAULT '{}'::uuid[], google_tokens text[] NOT NULL DEFAULT '{}'::text[], created_at timestamp with time zone NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0, last_error text, media_deleted integer, done_at timestamp with time zone);
CREATE TABLE public.account_status (user_id uuid NOT NULL, is_suspended boolean NOT NULL DEFAULT false, suspended_until timestamp with time zone, is_banned boolean NOT NULL DEFAULT false, ban_reason text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.activation_daily_rollup (id uuid NOT NULL DEFAULT gen_random_uuid(), snapshot_date date NOT NULL, platform text NOT NULL DEFAULT 'unknown'::text, signup_source text NOT NULL DEFAULT 'organic'::text, rule_version text NOT NULL DEFAULT 'none'::text, signups_in_cohort integer NOT NULL DEFAULT 0, activated_count integer NOT NULL DEFAULT 0, activated_within_7d_count integer NOT NULL DEFAULT 0, avg_time_to_activation_seconds numeric, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.admin_permissions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, permission text NOT NULL, granted boolean NOT NULL DEFAULT true, granted_by uuid, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.admin_roles (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role admin_role NOT NULL, granted_by uuid, granted_at timestamp with time zone NOT NULL DEFAULT now(), expires_at timestamp with time zone, notes text);
CREATE TABLE public.anon_chat_usage (user_id uuid NOT NULL, day date NOT NULL, count integer NOT NULL DEFAULT 0);
CREATE TABLE public.anon_identity_map (anon_id uuid NOT NULL, user_id uuid NOT NULL, linked_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.audit_log (id uuid NOT NULL DEFAULT gen_random_uuid(), actor_id uuid NOT NULL, actor_email text, actor_role text NOT NULL, action text NOT NULL, target_type text, target_id text, before_state jsonb, after_state jsonb, metadata jsonb, ip_address inet, user_agent text, created_at timestamp with time zone NOT NULL DEFAULT now(), seq bigint NOT NULL, prev_hash bytea, row_hash bytea NOT NULL);
CREATE TABLE public.audit_log_anchor (seq bigint NOT NULL, row_hash bytea NOT NULL, pruned_rows integer NOT NULL, pruned_before timestamp with time zone NOT NULL, pruned_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.audit_log_client (audit_id uuid NOT NULL, ip_address inet, user_agent text, salt bytea NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.auth_daily_rollup (id uuid NOT NULL DEFAULT gen_random_uuid(), snapshot_date date NOT NULL, platform text NOT NULL DEFAULT 'unknown'::text, method text NOT NULL DEFAULT 'unknown'::text, signups integer NOT NULL DEFAULT 0, logins_success integer NOT NULL DEFAULT 0, logins_failed integer NOT NULL DEFAULT 0, first_logins integer NOT NULL DEFAULT 0, returning_logins integer NOT NULL DEFAULT 0, unique_users integer NOT NULL DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.billing_customers (user_id uuid NOT NULL, stripe_customer_id text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.bookings (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, service_id text, service_name text NOT NULL, service_type text DEFAULT 'food'::text, date date NOT NULL, "time" text, guests integer DEFAULT 1, customer_name text NOT NULL, customer_phone text NOT NULL, notes text, status text NOT NULL DEFAULT 'pending'::text, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), place_id text);
CREATE TABLE public.chat_blocks (blocker_id uuid NOT NULL, blocked_id uuid NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.chat_messages (id uuid NOT NULL DEFAULT gen_random_uuid(), thread_id uuid NOT NULL, sender_id uuid, body text NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.chat_participants (thread_id uuid NOT NULL, user_id uuid NOT NULL, joined_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.chat_reads (thread_id uuid NOT NULL, user_id uuid NOT NULL, last_read_at timestamp with time zone NOT NULL DEFAULT '-infinity'::timestamp with time zone);
CREATE TABLE public.chat_reports (id uuid NOT NULL DEFAULT gen_random_uuid(), thread_id uuid NOT NULL, reporter_id uuid NOT NULL, reported_user_id uuid NOT NULL, message_id uuid, reason text NOT NULL, status text NOT NULL DEFAULT 'open'::text, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.chat_settings (id boolean NOT NULL DEFAULT true, reachability text NOT NULL DEFAULT 'mutual_follow'::text, updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.chat_threads (id uuid NOT NULL DEFAULT gen_random_uuid(), kind text NOT NULL, title text, created_by uuid, direct_key text, created_at timestamp with time zone NOT NULL DEFAULT now(), last_message_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.cohort_metrics (id uuid NOT NULL DEFAULT gen_random_uuid(), cohort_date date NOT NULL, platform text NOT NULL DEFAULT 'all'::text, cohort_size integer NOT NULL DEFAULT 0, d1_retained integer NOT NULL DEFAULT 0, d7_retained integer NOT NULL DEFAULT 0, d30_retained integer NOT NULL DEFAULT 0, d1_rate numeric(5,4) DEFAULT 0, d7_rate numeric(5,4) DEFAULT 0, d30_rate numeric(5,4) DEFAULT 0, computed_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.comment_reactions (id uuid NOT NULL DEFAULT gen_random_uuid(), comment_id uuid NOT NULL, user_id uuid NOT NULL, reaction text NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.commerce_click_attributions (sub1 text NOT NULL, identity_id uuid, provider_id text NOT NULL, target_url text NOT NULL, clicked_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.commerce_feed_items (provider_id text NOT NULL, sku text NOT NULL, name text NOT NULL, url text NOT NULL, price numeric, discount numeric, image text, description text, category text, feed_file text NOT NULL, ingested_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.commerce_feed_runs (id bigint NOT NULL, provider_id text NOT NULL, started_at timestamp with time zone NOT NULL DEFAULT now(), finished_at timestamp with time zone, rows_total integer, rows_kept integer, rows_rejected integer, outcome text NOT NULL DEFAULT 'running'::text, detail text);
CREATE TABLE public.commerce_providers (provider_id text NOT NULL, active boolean NOT NULL DEFAULT true, deeplink_enabled boolean NOT NULL DEFAULT false, tier smallint NOT NULL DEFAULT 2, network text, campaign_id text, wrapper_template text, note text, updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.contact_identity_index (identifier_hash text NOT NULL, hash_version smallint NOT NULL DEFAULT 1, user_id uuid NOT NULL, kind text NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.contact_matches (owner_user_id uuid NOT NULL, matched_user_id uuid NOT NULL, matched_via text NOT NULL, first_matched_at timestamp with time zone NOT NULL DEFAULT now(), last_matched_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.contact_sync_state (user_id uuid NOT NULL, sync_consent_granted_at timestamp with time zone, sync_consent_revoked_at timestamp with time zone, sync_consent_source text, sync_consent_version smallint NOT NULL DEFAULT 1, discoverable_granted_at timestamp with time zone, discoverable_revoked_at timestamp with time zone, last_sync_at timestamp with time zone, last_sync_source text, last_sync_submitted integer NOT NULL DEFAULT 0, last_sync_matched integer NOT NULL DEFAULT 0, sync_count integer NOT NULL DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.content_reports (id uuid NOT NULL DEFAULT gen_random_uuid(), content_id uuid NOT NULL, reporter_source_id text NOT NULL, reason text NOT NULL, policy_id text, verification_state text NOT NULL DEFAULT 'UNVERIFIED'::text, status text NOT NULL DEFAULT 'open'::text, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.conversations (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, title text DEFAULT 'Cuộc trò chuyện mới'::text, category text DEFAULT 'general'::text, messages jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public.daily_snapshots (id uuid NOT NULL DEFAULT gen_random_uuid(), snapshot_date date NOT NULL, platform text NOT NULL DEFAULT 'all'::text, total_users integer NOT NULL DEFAULT 0, new_users integer NOT NULL DEFAULT 0, returning_users integer NOT NULL DEFAULT 0, dau integer NOT NULL DEFAULT 0, wau integer NOT NULL DEFAULT 0, mau integer NOT NULL DEFAULT 0, is_final boolean NOT NULL DEFAULT false, reconciled_at timestamp with time zone, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.decision_evidence (id uuid NOT NULL, owner_id uuid NOT NULL, evidence jsonb NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now(), expires_at timestamp with time zone NOT NULL);
CREATE TABLE public.department (id text NOT NULL, organization_id uuid NOT NULL, name_key text NOT NULL, display_name text NOT NULL, status text NOT NULL DEFAULT 'placeholder'::text, is_active boolean NOT NULL DEFAULT true, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.department_membership (id uuid NOT NULL DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, user_id uuid NOT NULL, department_id text NOT NULL, org_role text NOT NULL, scope text NOT NULL DEFAULT 'GLOBAL'::text, status text NOT NULL DEFAULT 'active'::text, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.event_outbox (id uuid NOT NULL DEFAULT gen_random_uuid(), event_id uuid NOT NULL, schema_version smallint NOT NULL DEFAULT 1, type text NOT NULL, event_version text NOT NULL, producer text NOT NULL, actor jsonb, correlation_id text, security_class text NOT NULL, payload jsonb, metadata jsonb, occurred_at timestamp with time zone NOT NULL, consumer_id text NOT NULL, status text NOT NULL DEFAULT 'pending'::text, attempts smallint NOT NULL DEFAULT 0, next_attempt_at timestamp with time zone NOT NULL DEFAULT now(), last_error text, created_at timestamp with time zone NOT NULL DEFAULT now(), delivered_at timestamp with time zone);
CREATE TABLE public.favorites (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, place_id text NOT NULL, place_name text NOT NULL, place_address text, place_type text, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.governed_events (id uuid NOT NULL DEFAULT gen_random_uuid(), event_id uuid, domain text NOT NULL, event_type text NOT NULL, user_id uuid, anon_id uuid, subject_id text, platform text, app_version text, session_id text, props jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.group_members (id uuid NOT NULL DEFAULT gen_random_uuid(), group_id uuid NOT NULL, name text NOT NULL, budget text, food_preferences text, dietary_restrictions text, area text, created_at timestamp with time zone DEFAULT now(), user_id uuid);
CREATE TABLE public.groups (id uuid NOT NULL DEFAULT gen_random_uuid(), creator_id uuid, name text NOT NULL, status text DEFAULT 'open'::text, suggestion text, created_at timestamp with time zone DEFAULT now(), avatar_url text);
CREATE TABLE public.marketing_campaigns (id uuid NOT NULL DEFAULT gen_random_uuid(), title text NOT NULL, body text NOT NULL, link text, category text NOT NULL DEFAULT 'marketing'::text, status text NOT NULL DEFAULT 'draft'::text, audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid NOT NULL, activated_by uuid, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), activated_at timestamp with time zone, completed_at timestamp with time zone);
CREATE TABLE public.marketing_consent (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, channel text NOT NULL, opted_in boolean NOT NULL, opted_in_at timestamp with time zone, opted_out_at timestamp with time zone, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.message_feedback (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, conversation_id uuid NOT NULL, message_index integer NOT NULL, type text NOT NULL, reason text, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.moderation_actions (id uuid NOT NULL DEFAULT gen_random_uuid(), queue_id uuid, action moderation_action_type NOT NULL, actor_id uuid NOT NULL, target_user_id uuid, target_content_id uuid, reason text NOT NULL, duration_hours integer, notes text, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.moderation_queue (id uuid NOT NULL DEFAULT gen_random_uuid(), type moderation_type NOT NULL, status moderation_status NOT NULL DEFAULT 'pending'::moderation_status, priority smallint NOT NULL DEFAULT 1, reported_by uuid, target_type text NOT NULL, target_id uuid NOT NULL, reason text, metadata jsonb, assigned_to uuid, resolved_by uuid, resolution text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), resolved_at timestamp with time zone);
CREATE TABLE public.music_categories (id uuid NOT NULL DEFAULT gen_random_uuid(), slug text NOT NULL, label_i18n jsonb NOT NULL DEFAULT '{}'::jsonb, sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.music_followed (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, track_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.music_providers (id uuid NOT NULL DEFAULT gen_random_uuid(), slug text NOT NULL, name text NOT NULL, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.music_saved (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, track_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.music_track_reports (id uuid NOT NULL DEFAULT gen_random_uuid(), track_id uuid NOT NULL, reporter_id uuid, reason text NOT NULL, details text, status text NOT NULL DEFAULT 'open'::text, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.music_tracks (id uuid NOT NULL DEFAULT gen_random_uuid(), title text NOT NULL, artist text, duration_sec integer NOT NULL, audio_url text NOT NULL, preview_url text, cover_url text, category_id uuid, provider_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamp with time zone DEFAULT now(), music_type text NOT NULL DEFAULT 'royalty_free'::text, play_count integer NOT NULL DEFAULT 0, uploaded_by uuid, rights_confirmed boolean NOT NULL DEFAULT false, license text, source_url text);
CREATE TABLE public.music_usage (id uuid NOT NULL DEFAULT gen_random_uuid(), track_id uuid NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL, user_id uuid, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.notification_deliveries (id uuid NOT NULL DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL, user_id uuid NOT NULL, channel text NOT NULL DEFAULT 'push'::text, category text NOT NULL DEFAULT 'marketing'::text, status text NOT NULL, skip_reason text, notification_id uuid, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.notification_subscriptions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, provider text NOT NULL DEFAULT 'webpush'::text, subscription_data jsonb NOT NULL, enabled boolean NOT NULL DEFAULT true, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.notifications (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, type text NOT NULL, category text NOT NULL, title text NOT NULL, body text NOT NULL, actor_id uuid, entity_url text, image_url text, data jsonb NOT NULL DEFAULT '{}'::jsonb, read_at timestamp with time zone, push_status text NOT NULL DEFAULT 'pending'::text, push_sent_at timestamp with time zone, push_attempts integer NOT NULL DEFAULT 0, push_error text, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.organization (id uuid NOT NULL DEFAULT gen_random_uuid(), slug text NOT NULL, name text NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.partner_deal_translations (id uuid NOT NULL DEFAULT gen_random_uuid(), deal_id uuid NOT NULL, locale text NOT NULL, category text, title text, description text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.partner_deals (id uuid NOT NULL DEFAULT gen_random_uuid(), partner_name text NOT NULL, category text NOT NULL, title text NOT NULL, description text, official_url text NOT NULL, banner_image text, logo_image text, display_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true, start_at timestamp with time zone, end_at timestamp with time zone, country_code text NOT NULL DEFAULT 'VN'::text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), partner_slug text NOT NULL, partner_type text NOT NULL DEFAULT 'ecommerce'::text, affiliate_code text, is_featured boolean NOT NULL DEFAULT false, click_count integer NOT NULL DEFAULT 0, metadata jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE public.place_photos (place_id text NOT NULL, photo_url text NOT NULL, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.plan_shares (id text NOT NULL, owner_id uuid NOT NULL, fingerprint text NOT NULL, plan jsonb NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.platform_owner (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, active boolean NOT NULL DEFAULT true, assigned_at timestamp with time zone NOT NULL DEFAULT now(), assigned_by text NOT NULL, revoked_at timestamp with time zone, notes text);
CREATE TABLE public.platform_owner_recovery (id uuid NOT NULL DEFAULT gen_random_uuid(), target_user_id uuid NOT NULL, requested_at timestamp with time zone NOT NULL DEFAULT now(), expires_at timestamp with time zone NOT NULL, closed_at timestamp with time zone, outcome text, reason text NOT NULL);
CREATE TABLE public.platform_settings (key text NOT NULL, value jsonb NOT NULL, scope text NOT NULL DEFAULT 'global'::text, value_schema text, updated_by uuid);
CREATE TABLE public.price_watches (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, product_name text NOT NULL, target_price bigint NOT NULL, current_price bigint, search_query text NOT NULL, status text DEFAULT 'active'::text, notified_at timestamp with time zone, last_checked timestamp with time zone, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.profiles (id uuid NOT NULL, username text, full_name text, avatar_url text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), onboarded boolean DEFAULT false, follower_count integer DEFAULT 0, following_count integer DEFAULT 0, language text, bio text, cover_url text);
CREATE TABLE public.query_texts (query_id uuid NOT NULL, user_id uuid, anon_id uuid, session_id text, vertical text, text text NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.review_comments (id uuid NOT NULL DEFAULT gen_random_uuid(), review_id uuid NOT NULL, user_id uuid NOT NULL, body text NOT NULL, created_at timestamp with time zone DEFAULT now(), parent_comment_id uuid);
CREATE TABLE public.review_interactions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid, review_id uuid, watch_seconds double precision DEFAULT 0, completion_rate double precision DEFAULT 0, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.review_likes (id uuid NOT NULL DEFAULT gen_random_uuid(), review_id uuid NOT NULL, user_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.review_milestones (id uuid NOT NULL DEFAULT gen_random_uuid(), review_id uuid NOT NULL, milestone integer NOT NULL, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.review_saves (id uuid NOT NULL DEFAULT gen_random_uuid(), review_id uuid NOT NULL, user_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.review_shares (id uuid NOT NULL DEFAULT gen_random_uuid(), review_id uuid NOT NULL, user_id uuid NOT NULL, channel text NOT NULL DEFAULT 'unknown'::text, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.reviews (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, place_id text NOT NULL, place_name text NOT NULL, place_address text, rating smallint DEFAULT 0, body text DEFAULT ''::text, is_hidden boolean NOT NULL DEFAULT false, created_at timestamp with time zone DEFAULT now(), photos text[] DEFAULT '{}'::text[], is_verified boolean DEFAULT false, like_count integer DEFAULT 0, comment_count integer DEFAULT 0, content_type text DEFAULT 'photo'::text, media_url text, thumbnail text, hashtags text[], watch_time_avg double precision DEFAULT 0, completion_rate double precision DEFAULT 0, save_count integer DEFAULT 0, source_type text DEFAULT 'upload'::text, source_url text, view_count integer DEFAULT 0, music jsonb, publication_state text, safety_state text, evaluated_version text, evaluated_at timestamp with time zone);
CREATE TABLE public.services (id uuid NOT NULL DEFAULT gen_random_uuid(), name text NOT NULL, category text NOT NULL, description text, address text, city text DEFAULT 'ho-chi-minh'::text, price_exact numeric, price_unit text DEFAULT 'per_person'::text, rating numeric(2,1), phone text, booking_url text, images text[] DEFAULT '{}'::text[], tags text[] DEFAULT '{}'::text[], is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.shared_results (id uuid NOT NULL DEFAULT gen_random_uuid(), slug text NOT NULL, owner_id uuid, query text NOT NULL, payload jsonb NOT NULL, domain text NOT NULL DEFAULT 'general'::text, locale text NOT NULL DEFAULT 'vi'::text, status text NOT NULL DEFAULT 'public'::text, og_version integer NOT NULL DEFAULT 1, view_count integer NOT NULL DEFAULT 0, ask_count integer NOT NULL DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), parent_id uuid, owner_is_anonymous boolean NOT NULL DEFAULT false);
CREATE TABLE public.subscriptions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, stripe_customer_id text, stripe_sub_id text, plan text NOT NULL DEFAULT 'free'::text, status text NOT NULL DEFAULT 'active'::text, current_period_end timestamp with time zone, cancel_at_period_end boolean DEFAULT false, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public.system_health_log (id uuid NOT NULL DEFAULT gen_random_uuid(), check_name text NOT NULL, status text NOT NULL, latency_ms integer, message text, metadata jsonb, checked_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.user_acquisition (user_id uuid NOT NULL, anon_id uuid, signup_method text, signup_platform text, signup_app_version text, signup_device_type text, signup_country text, signup_language text, acquisition_source text, signup_at timestamp with time zone, first_login_at timestamp with time zone, last_login_at timestamp with time zone, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), activated_at timestamp with time zone, activation_rule_version text);
CREATE TABLE public.user_demographics (user_id uuid NOT NULL, date_of_birth date, age_declared_at timestamp with time zone, dob_corrections smallint NOT NULL DEFAULT 0, admin_corrections smallint NOT NULL DEFAULT 0, gender text, gender_self_describe text, city text, country text, occupation text, industry text, education_level text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.user_events (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid, event_type text NOT NULL, metadata jsonb DEFAULT '{}'::jsonb, created_at timestamp with time zone DEFAULT now(), place_id uuid, review_id uuid, event_id uuid, schema_version smallint NOT NULL DEFAULT 1, anon_id uuid, platform text, app_version text, build_number text, os_name text, os_version text, device_type text, country text, language text, session_id text, client_timestamp timestamp with time zone, is_unknown_event boolean NOT NULL DEFAULT false, device_context jsonb);
CREATE TABLE public.user_follows (id uuid NOT NULL DEFAULT gen_random_uuid(), follower_id uuid NOT NULL, following_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.user_integrations (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, provider text NOT NULL, access_token text, refresh_token text, expires_at timestamp with time zone, scope text, provider_user_id text, metadata jsonb DEFAULT '{}'::jsonb, connected_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public.user_memory (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, location_base text, preferences jsonb DEFAULT '{}'::jsonb, budget jsonb DEFAULT '{}'::jsonb, history jsonb DEFAULT '[]'::jsonb, updated_at timestamp without time zone DEFAULT now(), companions text, timing text, personality text, behavior_summary text, discovery_city text);
CREATE TABLE public.user_memory_fk_cleanup_log (id uuid NOT NULL DEFAULT gen_random_uuid(), memory_row_id uuid NOT NULL, orphan_user_id text, memory_updated_at timestamp with time zone, reason text NOT NULL, cleaned_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.user_notes (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, author_id uuid NOT NULL, note text NOT NULL, is_pinned boolean NOT NULL DEFAULT false, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.user_preferences (user_id uuid NOT NULL, budget_level text, cuisine_likes text[] DEFAULT '{}'::text[], dietary_restrictions text, inferred_preferences jsonb DEFAULT '{}'::jsonb, updated_at timestamp with time zone DEFAULT now(), budget_min integer, budget_max integer, preferred_style text[] DEFAULT '{}'::text[], dietary_tags text[] DEFAULT '{}'::text[], disliked_tags text[] DEFAULT '{}'::text[], usual_party_size integer, preference_profile jsonb, profile_updated_at timestamp with time zone, preferences jsonb DEFAULT '[]'::jsonb);
CREATE TABLE public.vouchers (id uuid NOT NULL DEFAULT gen_random_uuid(), service_id uuid, title text NOT NULL, original_price numeric NOT NULL, sale_price numeric NOT NULL, discount_pct smallint, conditions text, expires_at timestamp with time zone, quantity_total integer, quantity_sold integer DEFAULT 0, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());
ALTER TABLE public.account_deletion_jobs ADD PRIMARY KEY (id);
ALTER TABLE public.account_status ADD PRIMARY KEY (user_id);
ALTER TABLE public.activation_daily_rollup ADD UNIQUE (snapshot_date, platform, signup_source, rule_version);
ALTER TABLE public.activation_daily_rollup ADD PRIMARY KEY (id);
ALTER TABLE public.admin_permissions ADD PRIMARY KEY (id);
ALTER TABLE public.admin_permissions ADD UNIQUE (user_id, permission);
ALTER TABLE public.admin_roles ADD PRIMARY KEY (id);
ALTER TABLE public.admin_roles ADD UNIQUE (user_id, role);
ALTER TABLE public.anon_chat_usage ADD PRIMARY KEY (user_id, day);
ALTER TABLE public.anon_identity_map ADD PRIMARY KEY (anon_id, user_id);
ALTER TABLE public.audit_log ADD PRIMARY KEY (id);
ALTER TABLE public.audit_log ADD UNIQUE (seq);
ALTER TABLE public.audit_log_anchor ADD PRIMARY KEY (seq);
ALTER TABLE public.audit_log_client ADD PRIMARY KEY (audit_id);
ALTER TABLE public.auth_daily_rollup ADD PRIMARY KEY (id);
ALTER TABLE public.auth_daily_rollup ADD UNIQUE (snapshot_date, platform, method);
ALTER TABLE public.billing_customers ADD PRIMARY KEY (user_id);
ALTER TABLE public.billing_customers ADD UNIQUE (stripe_customer_id);
ALTER TABLE public.bookings ADD PRIMARY KEY (id);
ALTER TABLE public.chat_blocks ADD PRIMARY KEY (blocker_id, blocked_id);
ALTER TABLE public.chat_messages ADD PRIMARY KEY (id);
ALTER TABLE public.chat_participants ADD PRIMARY KEY (thread_id, user_id);
ALTER TABLE public.chat_reads ADD PRIMARY KEY (thread_id, user_id);
ALTER TABLE public.chat_reports ADD PRIMARY KEY (id);
ALTER TABLE public.chat_reports ADD UNIQUE (thread_id, reporter_id, reported_user_id, reason);
ALTER TABLE public.chat_settings ADD PRIMARY KEY (id);
ALTER TABLE public.chat_threads ADD PRIMARY KEY (id);
ALTER TABLE public.cohort_metrics ADD UNIQUE (cohort_date, platform);
ALTER TABLE public.cohort_metrics ADD PRIMARY KEY (id);
ALTER TABLE public.comment_reactions ADD PRIMARY KEY (id);
ALTER TABLE public.comment_reactions ADD UNIQUE (comment_id, user_id);
ALTER TABLE public.commerce_click_attributions ADD PRIMARY KEY (sub1);
ALTER TABLE public.commerce_feed_items ADD PRIMARY KEY (provider_id, sku);
ALTER TABLE public.commerce_feed_runs ADD PRIMARY KEY (id);
ALTER TABLE public.commerce_providers ADD PRIMARY KEY (provider_id);
ALTER TABLE public.contact_identity_index ADD PRIMARY KEY (identifier_hash, hash_version, user_id);
ALTER TABLE public.contact_matches ADD PRIMARY KEY (owner_user_id, matched_user_id, matched_via);
ALTER TABLE public.contact_sync_state ADD PRIMARY KEY (user_id);
ALTER TABLE public.content_reports ADD UNIQUE (content_id, reporter_source_id, reason);
ALTER TABLE public.content_reports ADD PRIMARY KEY (id);
ALTER TABLE public.conversations ADD PRIMARY KEY (id);
ALTER TABLE public.daily_snapshots ADD UNIQUE (snapshot_date, platform);
ALTER TABLE public.daily_snapshots ADD PRIMARY KEY (id);
ALTER TABLE public.decision_evidence ADD PRIMARY KEY (id);
ALTER TABLE public.department ADD PRIMARY KEY (id);
ALTER TABLE public.department_membership ADD PRIMARY KEY (id);
ALTER TABLE public.department_membership ADD UNIQUE (organization_id, user_id, department_id);
ALTER TABLE public.event_outbox ADD PRIMARY KEY (id);
ALTER TABLE public.event_outbox ADD UNIQUE (event_id, consumer_id);
ALTER TABLE public.favorites ADD UNIQUE (user_id, place_id);
ALTER TABLE public.favorites ADD PRIMARY KEY (id);
ALTER TABLE public.governed_events ADD PRIMARY KEY (id);
ALTER TABLE public.group_members ADD PRIMARY KEY (id);
ALTER TABLE public.groups ADD PRIMARY KEY (id);
ALTER TABLE public.marketing_campaigns ADD PRIMARY KEY (id);
ALTER TABLE public.marketing_consent ADD PRIMARY KEY (id);
ALTER TABLE public.marketing_consent ADD UNIQUE (user_id, channel);
ALTER TABLE public.message_feedback ADD UNIQUE (user_id, conversation_id, message_index, type);
ALTER TABLE public.message_feedback ADD PRIMARY KEY (id);
ALTER TABLE public.moderation_actions ADD PRIMARY KEY (id);
ALTER TABLE public.moderation_queue ADD PRIMARY KEY (id);
ALTER TABLE public.music_categories ADD PRIMARY KEY (id);
ALTER TABLE public.music_categories ADD UNIQUE (slug);
ALTER TABLE public.music_followed ADD PRIMARY KEY (id);
ALTER TABLE public.music_followed ADD UNIQUE (user_id, track_id);
ALTER TABLE public.music_providers ADD PRIMARY KEY (id);
ALTER TABLE public.music_providers ADD UNIQUE (slug);
ALTER TABLE public.music_saved ADD UNIQUE (user_id, track_id);
ALTER TABLE public.music_saved ADD PRIMARY KEY (id);
ALTER TABLE public.music_track_reports ADD PRIMARY KEY (id);
ALTER TABLE public.music_tracks ADD PRIMARY KEY (id);
ALTER TABLE public.music_usage ADD PRIMARY KEY (id);
ALTER TABLE public.notification_deliveries ADD PRIMARY KEY (id);
ALTER TABLE public.notification_deliveries ADD UNIQUE (campaign_id, user_id);
ALTER TABLE public.notification_subscriptions ADD PRIMARY KEY (id);
ALTER TABLE public.notification_subscriptions ADD UNIQUE (user_id, provider);
ALTER TABLE public.notifications ADD PRIMARY KEY (id);
ALTER TABLE public.organization ADD PRIMARY KEY (id);
ALTER TABLE public.organization ADD UNIQUE (slug);
ALTER TABLE public.partner_deal_translations ADD UNIQUE (deal_id, locale);
ALTER TABLE public.partner_deal_translations ADD PRIMARY KEY (id);
ALTER TABLE public.partner_deals ADD PRIMARY KEY (id);
ALTER TABLE public.place_photos ADD PRIMARY KEY (place_id);
ALTER TABLE public.plan_shares ADD UNIQUE (owner_id, fingerprint);
ALTER TABLE public.plan_shares ADD PRIMARY KEY (id);
ALTER TABLE public.platform_owner ADD PRIMARY KEY (id);
ALTER TABLE public.platform_owner_recovery ADD PRIMARY KEY (id);
ALTER TABLE public.platform_settings ADD PRIMARY KEY (key);
ALTER TABLE public.price_watches ADD PRIMARY KEY (id);
ALTER TABLE public.profiles ADD PRIMARY KEY (id);
ALTER TABLE public.profiles ADD UNIQUE (username);
ALTER TABLE public.query_texts ADD PRIMARY KEY (query_id);
ALTER TABLE public.review_comments ADD PRIMARY KEY (id);
ALTER TABLE public.review_interactions ADD PRIMARY KEY (id);
ALTER TABLE public.review_interactions ADD UNIQUE (user_id, review_id);
ALTER TABLE public.review_likes ADD UNIQUE (review_id, user_id);
ALTER TABLE public.review_likes ADD PRIMARY KEY (id);
ALTER TABLE public.review_milestones ADD UNIQUE (review_id, milestone);
ALTER TABLE public.review_milestones ADD PRIMARY KEY (id);
ALTER TABLE public.review_saves ADD PRIMARY KEY (id);
ALTER TABLE public.review_saves ADD UNIQUE (review_id, user_id);
ALTER TABLE public.review_shares ADD PRIMARY KEY (id);
ALTER TABLE public.reviews ADD PRIMARY KEY (id);
ALTER TABLE public.services ADD PRIMARY KEY (id);
ALTER TABLE public.shared_results ADD PRIMARY KEY (id);
ALTER TABLE public.shared_results ADD UNIQUE (slug);
ALTER TABLE public.subscriptions ADD UNIQUE (stripe_sub_id);
ALTER TABLE public.subscriptions ADD PRIMARY KEY (id);
ALTER TABLE public.subscriptions ADD UNIQUE (stripe_customer_id);
ALTER TABLE public.subscriptions ADD UNIQUE (user_id);
ALTER TABLE public.system_health_log ADD PRIMARY KEY (id);
ALTER TABLE public.user_acquisition ADD PRIMARY KEY (user_id);
ALTER TABLE public.user_demographics ADD PRIMARY KEY (user_id);
ALTER TABLE public.user_events ADD PRIMARY KEY (id);
ALTER TABLE public.user_follows ADD PRIMARY KEY (id);
ALTER TABLE public.user_follows ADD UNIQUE (follower_id, following_id);
ALTER TABLE public.user_integrations ADD UNIQUE (user_id, provider);
ALTER TABLE public.user_integrations ADD PRIMARY KEY (id);
ALTER TABLE public.user_memory ADD UNIQUE (user_id);
ALTER TABLE public.user_memory ADD PRIMARY KEY (id);
ALTER TABLE public.user_memory_fk_cleanup_log ADD PRIMARY KEY (id);
ALTER TABLE public.user_notes ADD PRIMARY KEY (id);
ALTER TABLE public.user_preferences ADD PRIMARY KEY (user_id);
ALTER TABLE public.vouchers ADD PRIMARY KEY (id);
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.audit_log_client_sweep(p_days integer DEFAULT 90)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n INTEGER;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RETURN 0;
  END IF;
  DELETE FROM public.audit_log_client WHERE created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.audit_log_prune(p_months integer DEFAULT 12)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cut  TIMESTAMPTZ;
  v_seq  BIGINT;
  v_hash BYTEA;
  v_n    INTEGER;
BEGIN
  -- The owner's floor. A shorter retention needs a new decision, not an argument.
  IF p_months IS NULL OR p_months < 12 THEN
    RAISE EXCEPTION 'audit_log_prune: retention must be at least 12 months (got %)', p_months
      USING ERRCODE = '22023';
  END IF;
  v_cut := now() - make_interval(months => p_months);

  -- The chain writer's lock: no audit insert interleaves with a prune.
  PERFORM pg_advisory_xact_lock(477100701);

  SELECT max(a.seq) INTO v_seq FROM audit_log a WHERE a.created_at < v_cut;
  IF v_seq IS NULL THEN
    RETURN 0;
  END IF;

  -- Never launder: the prefix must verify before its evidence is replaced by an anchor.
  IF EXISTS (SELECT 1 FROM fn_verify_audit_chain(NULL, v_seq)) THEN
    RAISE EXCEPTION 'audit_log_prune: the chain does not verify up to seq %; refusing to prune', v_seq
      USING ERRCODE = '55000';
  END IF;

  SELECT a.row_hash INTO v_hash FROM audit_log a WHERE a.seq = v_seq;
  DELETE FROM public.audit_log_client c USING audit_log a WHERE a.seq <= v_seq AND c.audit_id = a.id;
  DELETE FROM audit_log a WHERE a.seq <= v_seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.audit_log_anchor (seq, row_hash, pruned_rows, pruned_before)
  VALUES (v_seq, v_hash, v_n, v_cut);
  RETURN v_n;
END;
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.commerce_click_attributions_sweep(p_limit integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH doomed AS (
    SELECT sub1 FROM public.commerce_click_attributions
    WHERE clicked_at < now() - interval '12 months'
    ORDER BY clicked_at
    LIMIT greatest(1, least(p_limit, 50000))
  ), gone AS (
    DELETE FROM public.commerce_click_attributions c USING doomed d WHERE c.sub1 = d.sub1 RETURNING 1
  )
  SELECT count(*)::integer FROM gone
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.decision_evidence_sweep(p_limit integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    RETURN 0;
  END IF;

  WITH doomed AS (
    SELECT id FROM public.decision_evidence
     WHERE expires_at < now()
     ORDER BY expires_at
     LIMIT LEAST(p_limit, 50000)
  )
  DELETE FROM public.decision_evidence d
   USING doomed
   WHERE d.id = doomed.id
     AND d.expires_at < now();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.fn_audit_mask(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN p;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(e.key,
             CASE
               WHEN e.key ~* '^(date_?of_?birth|dob|birth_?date|birthday|phone(_?number)?|email|e_?mail|address|street|id_?number|national_?id|citizen_?id|cccd|cmnd|passport(_?number)?|password|secret|token|access_?token|refresh_?token|ip|ip_?address|user_?agent)$'
                 THEN to_jsonb('***'::TEXT)
               WHEN jsonb_typeof(e.value) = 'object' THEN public.fn_audit_mask(e.value)
               ELSE e.value
             END)
      FROM jsonb_each(p) AS e), '{}'::JSONB);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_audit_part(p_value text)
 RETURNS bytea
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    WHEN p_value IS NULL THEN int4send(-1)
    ELSE int4send(length(p_value)) || convert_to(p_value, 'UTF8')
  END
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.fn_audit_ts(p_ts timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT to_char(p_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.fn_grant_admin_role(p_actor_id uuid, p_user_id uuid, p_role admin_role, p_notes text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS admin_roles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_row      admin_roles;
    v_jwt_role TEXT := auth.jwt() ->> 'role';
    v_actor    UUID;
BEGIN
    -- Who is acting, decided from the VERIFIED request (never from p_actor_id).
    IF v_jwt_role = 'service_role' THEN
        -- Trusted server path. The application authorizes the admin in its API
        -- layer and then calls this through the service-role client, passing the
        -- acting admin's id as p_actor_id purely for the audit trail (granted_by).
        v_actor := p_actor_id;
    ELSE
        -- Defense in depth: unreachable today (EXECUTE revoked below), kept so the
        -- function stays safe even if that grant is ever widened. A real caller
        -- must be the platform owner or an active super_admin/admin.
        v_actor := auth.uid();
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'FORBIDDEN: unauthenticated caller'
                USING ERRCODE = '42501';
        END IF;
        IF NOT (
            fn_is_platform_owner(v_actor)
            OR EXISTS (
                SELECT 1 FROM admin_roles
                WHERE user_id = v_actor
                  AND role IN ('super_admin', 'admin')
                  AND (expires_at IS NULL OR expires_at > NOW())
            )
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN: caller is not a platform owner or admin'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Constitutional rules, now evaluated against the DERIVED actor.
    -- Self-promotion (checked first so it applies to the Owner too).
    IF v_actor = p_user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: self-promotion is not permitted'
            USING ERRCODE = '42501';
    END IF;

    -- Only the Platform Owner may create a Super Admin.
    IF p_role = 'super_admin' AND NOT fn_is_platform_owner(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN: only the Platform Owner may grant super_admin'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO admin_roles (user_id, role, granted_by, notes, expires_at)
    VALUES (p_user_id, p_role, v_actor, p_notes, p_expires_at)
    RETURNING * INTO v_row;

    RETURN v_row;
END$function$
;
CREATE OR REPLACE FUNCTION public.fn_group_participant(p_group uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = p_group AND g.creator_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.group_members m
    WHERE m.group_id = p_group AND m.user_id = auth.uid()
  );
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
END$function$
;
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
$function$
;
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
END$function$
;
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
END$function$
;
CREATE OR REPLACE FUNCTION public.fn_revoke_admin_role(p_actor_id uuid, p_role_id uuid)
 RETURNS admin_roles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_row      admin_roles;
    v_count    INT;
    v_jwt_role TEXT := auth.jwt() ->> 'role';
    v_actor    UUID;
BEGIN
    IF v_jwt_role = 'service_role' THEN
        v_actor := p_actor_id;
    ELSE
        v_actor := auth.uid();
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'FORBIDDEN: unauthenticated caller'
                USING ERRCODE = '42501';
        END IF;
        IF NOT (
            fn_is_platform_owner(v_actor)
            OR EXISTS (
                SELECT 1 FROM admin_roles
                WHERE user_id = v_actor
                  AND role IN ('super_admin', 'admin')
                  AND (expires_at IS NULL OR expires_at > NOW())
            )
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN: caller is not a platform owner or admin'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO v_row FROM admin_roles WHERE id = p_role_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: role assignment does not exist'
            USING ERRCODE = 'P0002';
    END IF;

    -- Only the Platform Owner may demote a Super Admin.
    IF v_row.role = 'super_admin' AND NOT fn_is_platform_owner(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN: only the Platform Owner may revoke super_admin'
            USING ERRCODE = '42501';
    END IF;

    -- Never remove the last active super_admin (pre-existing lockout guard).
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

    -- The Owner's own admin rows may not be stripped by anyone but themselves.
    IF fn_is_platform_owner(v_row.user_id) AND v_actor <> v_row.user_id THEN
        RAISE EXCEPTION 'FORBIDDEN: cannot revoke roles from the Platform Owner'
            USING ERRCODE = '42501';
    END IF;

    DELETE FROM admin_roles WHERE id = p_role_id;
    RETURN v_row;
END$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.fn_shared_result_bump(p_slug text, p_kind text, p_by integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_by IS NULL OR p_by < 1 OR p_by > 1000 THEN
    RAISE EXCEPTION 'invalid increment';
  END IF;
  IF p_kind = 'view' THEN
    UPDATE public.shared_results SET view_count = view_count + p_by WHERE slug = p_slug AND status = 'public';
  ELSIF p_kind = 'ask' THEN
    UPDATE public.shared_results SET ask_count = ask_count + p_by WHERE slug = p_slug AND status = 'public';
  ELSE
    RAISE EXCEPTION 'unknown counter kind: %', p_kind;
  END IF;
END;
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'fn_verify_audit_chain: p_from (%) is greater than p_to (%)', p_from, p_to
      USING ERRCODE = '22023';
  END IF;

  IF p_from IS NOT NULL THEN
    SELECT a.row_hash, a.seq INTO v_expected, v_last_seq
      FROM audit_log a WHERE a.seq < p_from ORDER BY a.seq DESC LIMIT 1;
    IF NOT FOUND THEN
      SELECT x.row_hash, x.seq INTO v_expected, v_last_seq
        FROM audit_log_anchor x WHERE x.seq < p_from ORDER BY x.seq DESC LIMIT 1;
    END IF;
  ELSE
    -- No anchor: genesis (prev NULL, seq 0), exactly as before — so an UNANCHORED head
    -- deletion is still prev_mismatch + sequence_gap (A-2).
    SELECT x.row_hash, x.seq INTO v_expected, v_last_seq
      FROM audit_log_anchor x ORDER BY x.seq DESC LIMIT 1;
    IF NOT FOUND THEN
      v_expected := NULL;
      v_last_seq := 0;
    END IF;
  END IF;

  FOR r IN
    SELECT * FROM audit_log a
    WHERE (p_from IS NULL OR a.seq >= p_from)
      AND (p_to   IS NULL OR a.seq <= p_to)
    ORDER BY a.seq
  LOOP
    IF r.row_hash IS NULL THEN
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

    v_expected := v_actual;
    v_last_seq := r.seq;
  END LOOP;

  RETURN;
END
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.hot_places_24h(p_limit integer DEFAULT 10)
 RETURNS TABLE(place_name text, like_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT r.place_name, COUNT(*)::BIGINT AS like_count
  FROM public.review_likes l
  JOIN public.reviews r ON r.id = l.review_id
  WHERE l.created_at >= now() - INTERVAL '24 hours'
    AND r.place_name IS NOT NULL
    AND COALESCE(r.is_hidden, false) = false
    AND (r.publication_state IS NULL OR r.publication_state = 'PUBLISHED')
  GROUP BY r.place_name
  ORDER BY like_count DESC, r.place_name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20)
$function$
;
CREATE OR REPLACE FUNCTION public.increment_deal_click(p_deal_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE partner_deals SET click_count = click_count + 1 WHERE id = p_deal_id;
$function$
;
CREATE OR REPLACE FUNCTION public.increment_review_view(p_review_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.reviews SET view_count = view_count + 1 WHERE id = p_review_id;
$function$
;
CREATE OR REPLACE FUNCTION public.music_followed_count(p_track uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT count(*) FROM public.music_followed WHERE track_id = p_track; $function$
;
CREATE OR REPLACE FUNCTION public.music_increment_play(p_track uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.music_tracks SET play_count = play_count + 1 WHERE id = p_track;
$function$
;
CREATE OR REPLACE FUNCTION public.music_saved_count(p_track uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT count(*) FROM public.music_saved WHERE track_id = p_track; $function$
;
CREATE OR REPLACE FUNCTION public.plan_share_public(p_id text)
 RETURNS TABLE(id text, plan jsonb, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.id, s.plan, s.created_at
  FROM public.plan_shares s
  WHERE s.id = p_id
$function$
;
CREATE OR REPLACE FUNCTION public.push_credential(subscription_data jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(subscription_data ->> 'endpoint', subscription_data ->> 'token')
$function$
;
CREATE OR REPLACE FUNCTION public.review_likers(p_review_id uuid, p_limit integer DEFAULT 30, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(user_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT l.user_id, l.created_at
  FROM public.review_likes l
  WHERE l.review_id = p_review_id
    AND (p_before IS NULL OR l.created_at < p_before)
    -- The review itself must be readable by the caller: the same gate as
    -- GET /api/reviews/[id] — not hidden, and published unless the caller wrote it.
    AND EXISTS (
      SELECT 1 FROM public.reviews r
      WHERE r.id = p_review_id
        AND COALESCE(r.is_hidden, false) = false
        AND (r.publication_state IS NULL OR r.publication_state = 'PUBLISHED' OR r.user_id = auth.uid())
    )
  ORDER BY l.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50)
$function$
;
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

  SELECT u.is_anonymous INTO v_anon FROM auth.users u WHERE u.id = v_uid;
  IF COALESCE(v_anon, false) THEN
    RETURN 'anonymous_not_eligible';
  END IF;

  IF p_dob IS NULL OR p_dob > CURRENT_DATE OR p_dob <= DATE '1900-01-01' THEN
    RETURN 'invalid_date';
  END IF;

  SELECT d.date_of_birth, d.dob_corrections, true
    INTO v_existing, v_cor, v_found
    FROM public.user_demographics d
   WHERE d.user_id = v_uid;

  -- First declaration (or a row that exists for a city/occupation but has no date yet).
  IF NOT COALESCE(v_found, false) OR v_existing IS NULL THEN
    INSERT INTO public.user_demographics (user_id, date_of_birth, age_declared_at)
    VALUES (v_uid, p_dob, now())
    ON CONFLICT (user_id) DO UPDATE
      SET date_of_birth   = EXCLUDED.date_of_birth,
          age_declared_at = EXCLUDED.age_declared_at,
          updated_at      = now();
    RETURN 'recorded';
  END IF;

  -- Re-submitting the same date is not a correction and must not consume the allowance.
  IF v_existing = p_dob THEN
    RETURN 'unchanged';
  END IF;

  -- F-028: exhaustion applies ONLY while the user is currently ELIGIBLE. An ineligible user
  -- (stored DOB under 18, same threshold as public.age_band_of) may keep self-correcting so a
  -- mistyped date is never a lockout. Eligible users are unchanged: one correction, then exhausted.
  IF COALESCE(v_cor, 0) >= 1
     AND date_part('year', age(CURRENT_DATE, v_existing)) >= 18 THEN
    RETURN 'correction_exhausted';
  END IF;

  UPDATE public.user_demographics
     SET date_of_birth   = p_dob,
         -- F-028: only a correction made FROM an ELIGIBLE state consumes the single allowance. A
         -- correction made while currently INELIGIBLE is a free recovery and does not increment —
         -- which also keeps dob_corrections within its `BETWEEN 0 AND 1` CHECK when an ineligible
         -- user re-corrects repeatedly. (From an eligible state the exhaustion check above already
         -- guaranteed dob_corrections = 0 here, so this never exceeds 1.)
         dob_corrections = CASE
           WHEN date_part('year', age(CURRENT_DATE, v_existing)) >= 18
             THEN COALESCE(dob_corrections, 0) + 1
             ELSE COALESCE(dob_corrections, 0)
         END,
         age_declared_at = now(),
         updated_at      = now()
   WHERE user_id = v_uid;

  RETURN 'corrected';
END;
$function$
;
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
END; $function$
;
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
$function$
;
ALTER TABLE public.account_deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_daily_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anon_chat_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anon_identity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log_anchor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log_client ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_daily_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_click_attributions ENABLE ROW LEVEL SECURITY; ALTER TABLE public.commerce_click_attributions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_feed_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_identity_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governed_events ENABLE ROW LEVEL SECURITY; ALTER TABLE public.governed_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_followed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_saved ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_track_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_deal_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_owner_recovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.query_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_acquisition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_demographics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_memory_fk_cleanup_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_status_select_own ON public.account_status AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY billing_customers_select_own ON public.billing_customers AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can manage own bookings" ON public.bookings AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY chat_blocks_select_own ON public.chat_blocks AS PERMISSIVE FOR SELECT TO public USING ((blocker_id = auth.uid()));
CREATE POLICY chat_blocks_delete_own ON public.chat_blocks AS PERMISSIVE FOR DELETE TO public USING ((blocker_id = auth.uid()));
CREATE POLICY chat_blocks_insert_own ON public.chat_blocks AS PERMISSIVE FOR INSERT TO public WITH CHECK ((blocker_id = auth.uid()));
CREATE POLICY chat_messages_insert_participant ON public.chat_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((chat_is_participant(thread_id) AND (sender_id = auth.uid()) AND (NOT chat_thread_blocked(thread_id))));
CREATE POLICY chat_messages_select_participant ON public.chat_messages AS PERMISSIVE FOR SELECT TO public USING (chat_is_participant(thread_id));
CREATE POLICY chat_participants_select_own_threads ON public.chat_participants AS PERMISSIVE FOR SELECT TO public USING (chat_is_participant(thread_id));
CREATE POLICY chat_reads_insert_own ON public.chat_reads AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = auth.uid()) AND chat_is_participant(thread_id)));
CREATE POLICY chat_reads_select_own ON public.chat_reads AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY chat_reads_update_own ON public.chat_reads AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY chat_reports_insert_participant ON public.chat_reports AS PERMISSIVE FOR INSERT TO public WITH CHECK (((reporter_id = auth.uid()) AND (NOT COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false)) AND chat_is_participant(thread_id) AND (EXISTS ( SELECT 1
   FROM chat_participants p
  WHERE ((p.thread_id = chat_reports.thread_id) AND (p.user_id = chat_reports.reported_user_id)))) AND ((message_id IS NULL) OR (EXISTS ( SELECT 1
   FROM chat_messages m
  WHERE ((m.id = chat_reports.message_id) AND (m.thread_id = chat_reports.thread_id)))))));
CREATE POLICY chat_reports_select_own ON public.chat_reports AS PERMISSIVE FOR SELECT TO public USING ((reporter_id = auth.uid()));
CREATE POLICY chat_settings_select_all ON public.chat_settings AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY chat_threads_select_participant ON public.chat_threads AS PERMISSIVE FOR SELECT TO public USING (chat_is_participant(id));
CREATE POLICY "Users can remove own reaction" ON public.comment_reactions AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can add own reaction" ON public.comment_reactions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can change own reaction" ON public.comment_reactions AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Anyone can read comment reactions" ON public.comment_reactions AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY contact_matches_select_own ON public.contact_matches AS PERMISSIVE FOR SELECT TO public USING ((owner_user_id = auth.uid()));
CREATE POLICY contact_matches_delete_own ON public.contact_matches AS PERMISSIVE FOR DELETE TO public USING ((owner_user_id = auth.uid()));
CREATE POLICY contact_sync_state_select_own ON public.contact_sync_state AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users can file a content report" ON public.content_reports AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can manage own conversations" ON public.conversations AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own favorites" ON public.favorites AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY group_members_select_participant ON public.group_members AS PERMISSIVE FOR SELECT TO authenticated USING (fn_group_participant(group_id));
CREATE POLICY group_members_insert_self ON public.group_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY group_members_delete_self ON public.group_members AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY groups_select_participant ON public.groups AS PERMISSIVE FOR SELECT TO authenticated USING (fn_group_participant(id));
CREATE POLICY "Creators manage own groups" ON public.groups AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = creator_id)) WITH CHECK ((auth.uid() = creator_id));
CREATE POLICY users_manage_own_feedback ON public.message_feedback AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can manage own message feedback" ON public.message_feedback AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Anyone can read active music categories" ON public.music_categories AS PERMISSIVE FOR SELECT TO public USING (is_active);
CREATE POLICY "own followed tracks delete" ON public.music_followed AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "own followed tracks insert" ON public.music_followed AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "own followed tracks select" ON public.music_followed AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Anyone can read music providers" ON public.music_providers AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "own saved tracks delete" ON public.music_saved AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "own saved tracks insert" ON public.music_saved AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "own saved tracks select" ON public.music_saved AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can file a report" ON public.music_track_reports AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = reporter_id));
CREATE POLICY "Users can record their own music usage" ON public.music_usage AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY users_manage_own_subscriptions ON public.notification_subscriptions AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY notifications_select_own ON public.notifications AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY notifications_update_own ON public.notifications AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "public reads translations of visible deals" ON public.partner_deal_translations AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partner_deals d
  WHERE (d.id = partner_deal_translations.deal_id))));
CREATE POLICY "public reads active in-window deals" ON public.partner_deals AS PERMISSIVE FOR SELECT TO public USING ((is_active AND ((start_at IS NULL) OR (start_at <= now())) AND ((end_at IS NULL) OR (end_at >= now()))));
CREATE POLICY anon_read ON public.place_photos AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY plan_shares_delete_own ON public.plan_shares AS PERMISSIVE FOR DELETE TO authenticated USING ((owner_id = auth.uid()));
CREATE POLICY plan_shares_select_own ON public.plan_shares AS PERMISSIVE FOR SELECT TO authenticated USING ((owner_id = auth.uid()));
CREATE POLICY plan_shares_insert_own ON public.plan_shares AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((owner_id = auth.uid()) AND (COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) = false)));
CREATE POLICY "Users manage own price watches" ON public.price_watches AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY profiles_update ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id));
CREATE POLICY profiles_select_own ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));
CREATE POLICY profiles_select ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY profiles_insert_own ON public.profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id));
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can comment" ON public.review_comments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Anyone can read comments" ON public.review_comments AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users can delete own comment" ON public.review_comments AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own interactions" ON public.review_interactions AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can like" ON public.review_likes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY review_likes_select_own ON public.review_likes AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can unlike" ON public.review_likes AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Anyone can read milestones" ON public.review_milestones AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY review_saves_select_own ON public.review_saves AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own saves" ON public.review_saves AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY review_saves_delete_own ON public.review_saves AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY review_saves_insert_own ON public.review_saves AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY review_shares_select_own ON public.review_shares AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = user_id) AND (COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) = false)));
CREATE POLICY review_shares_insert_own ON public.review_shares AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) = false)));
CREATE POLICY review_shares_delete_own ON public.review_shares AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users delete own reviews" ON public.reviews AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Owners can see own reviews" ON public.reviews AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Read visible reviews" ON public.reviews AS PERMISSIVE FOR SELECT TO public USING ((NOT is_hidden));
CREATE POLICY "Users can update own reviews" ON public.reviews AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own reviews" ON public.reviews AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY reviews_publication_boundary ON public.reviews AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (((publication_state IS NULL) OR (publication_state = 'PUBLISHED'::text) OR (user_id = auth.uid())));
CREATE POLICY services_select_all ON public.services AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));
CREATE POLICY shared_results_owner_withdraw ON public.shared_results AS PERMISSIVE FOR UPDATE TO authenticated USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY shared_results_owner_select ON public.shared_results AS PERMISSIVE FOR SELECT TO authenticated USING ((owner_id = auth.uid()));
CREATE POLICY subscriptions_select_own ON public.subscriptions AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY user_demographics_update_own ON public.user_demographics AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY user_demographics_select_own ON public.user_demographics AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY user_demographics_insert_own ON public.user_demographics AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users read own events" ON public.user_events AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own events" ON public.user_events AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users insert own events" ON public.user_events AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can unfollow" ON public.user_follows AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = follower_id));
CREATE POLICY "Users can follow" ON public.user_follows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = follower_id));
CREATE POLICY "Anyone can read follows" ON public.user_follows AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users manage own integrations" ON public.user_integrations AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can manage own memory" ON public.user_memory AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own preferences" ON public.user_preferences AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can manage own preferences" ON public.user_preferences AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY vouchers_select_all ON public.vouchers AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));
REVOKE ALL ON public.account_deletion_jobs FROM anon, authenticated;
REVOKE ALL ON public.account_status FROM anon, authenticated;
REVOKE ALL ON public.activation_daily_rollup FROM anon, authenticated; GRANT SELECT ON public.activation_daily_rollup TO anon; GRANT INSERT ON public.activation_daily_rollup TO anon; GRANT UPDATE ON public.activation_daily_rollup TO anon; GRANT DELETE ON public.activation_daily_rollup TO anon; GRANT SELECT ON public.activation_daily_rollup TO authenticated; GRANT INSERT ON public.activation_daily_rollup TO authenticated; GRANT UPDATE ON public.activation_daily_rollup TO authenticated; GRANT DELETE ON public.activation_daily_rollup TO authenticated;
REVOKE ALL ON public.admin_permissions FROM anon, authenticated; GRANT SELECT ON public.admin_permissions TO anon; GRANT INSERT ON public.admin_permissions TO anon; GRANT UPDATE ON public.admin_permissions TO anon; GRANT DELETE ON public.admin_permissions TO anon; GRANT SELECT ON public.admin_permissions TO authenticated; GRANT INSERT ON public.admin_permissions TO authenticated; GRANT UPDATE ON public.admin_permissions TO authenticated; GRANT DELETE ON public.admin_permissions TO authenticated;
REVOKE ALL ON public.admin_roles FROM anon, authenticated; GRANT SELECT ON public.admin_roles TO anon; GRANT INSERT ON public.admin_roles TO anon; GRANT UPDATE ON public.admin_roles TO anon; GRANT DELETE ON public.admin_roles TO anon; GRANT SELECT ON public.admin_roles TO authenticated; GRANT INSERT ON public.admin_roles TO authenticated; GRANT UPDATE ON public.admin_roles TO authenticated; GRANT DELETE ON public.admin_roles TO authenticated;
REVOKE ALL ON public.anon_chat_usage FROM anon, authenticated; GRANT SELECT ON public.anon_chat_usage TO anon; GRANT INSERT ON public.anon_chat_usage TO anon; GRANT UPDATE ON public.anon_chat_usage TO anon; GRANT DELETE ON public.anon_chat_usage TO anon; GRANT SELECT ON public.anon_chat_usage TO authenticated; GRANT INSERT ON public.anon_chat_usage TO authenticated; GRANT UPDATE ON public.anon_chat_usage TO authenticated; GRANT DELETE ON public.anon_chat_usage TO authenticated;
REVOKE ALL ON public.anon_identity_map FROM anon, authenticated;
REVOKE ALL ON public.audit_log FROM anon, authenticated; GRANT SELECT ON public.audit_log TO anon; GRANT INSERT ON public.audit_log TO anon; GRANT UPDATE ON public.audit_log TO anon; GRANT DELETE ON public.audit_log TO anon; GRANT SELECT ON public.audit_log TO authenticated; GRANT INSERT ON public.audit_log TO authenticated; GRANT UPDATE ON public.audit_log TO authenticated; GRANT DELETE ON public.audit_log TO authenticated;
REVOKE ALL ON public.audit_log_anchor FROM anon, authenticated;
REVOKE ALL ON public.audit_log_client FROM anon, authenticated;
REVOKE ALL ON public.auth_daily_rollup FROM anon, authenticated; GRANT SELECT ON public.auth_daily_rollup TO anon; GRANT INSERT ON public.auth_daily_rollup TO anon; GRANT UPDATE ON public.auth_daily_rollup TO anon; GRANT DELETE ON public.auth_daily_rollup TO anon; GRANT SELECT ON public.auth_daily_rollup TO authenticated; GRANT INSERT ON public.auth_daily_rollup TO authenticated; GRANT UPDATE ON public.auth_daily_rollup TO authenticated; GRANT DELETE ON public.auth_daily_rollup TO authenticated;
REVOKE ALL ON public.billing_customers FROM anon, authenticated; GRANT SELECT ON public.billing_customers TO authenticated;
REVOKE ALL ON public.bookings FROM anon, authenticated; GRANT SELECT ON public.bookings TO anon; GRANT INSERT ON public.bookings TO anon; GRANT UPDATE ON public.bookings TO anon; GRANT DELETE ON public.bookings TO anon; GRANT SELECT ON public.bookings TO authenticated; GRANT INSERT ON public.bookings TO authenticated; GRANT UPDATE ON public.bookings TO authenticated; GRANT DELETE ON public.bookings TO authenticated;
REVOKE ALL ON public.chat_blocks FROM anon, authenticated; GRANT SELECT ON public.chat_blocks TO authenticated; GRANT INSERT ON public.chat_blocks TO authenticated; GRANT DELETE ON public.chat_blocks TO authenticated;
REVOKE ALL ON public.chat_messages FROM anon, authenticated; GRANT SELECT ON public.chat_messages TO authenticated; GRANT INSERT ON public.chat_messages TO authenticated;
REVOKE ALL ON public.chat_participants FROM anon, authenticated; GRANT SELECT ON public.chat_participants TO authenticated;
REVOKE ALL ON public.chat_reads FROM anon, authenticated; GRANT SELECT ON public.chat_reads TO authenticated; GRANT INSERT ON public.chat_reads TO authenticated; GRANT UPDATE ON public.chat_reads TO authenticated;
REVOKE ALL ON public.chat_reports FROM anon, authenticated; GRANT SELECT ON public.chat_reports TO authenticated; GRANT INSERT ON public.chat_reports TO authenticated;
REVOKE ALL ON public.chat_settings FROM anon, authenticated; GRANT SELECT ON public.chat_settings TO authenticated;
REVOKE ALL ON public.chat_threads FROM anon, authenticated; GRANT SELECT ON public.chat_threads TO authenticated;
REVOKE ALL ON public.cohort_metrics FROM anon, authenticated;
REVOKE ALL ON public.comment_reactions FROM anon, authenticated; GRANT SELECT ON public.comment_reactions TO anon; GRANT INSERT ON public.comment_reactions TO anon; GRANT UPDATE ON public.comment_reactions TO anon; GRANT DELETE ON public.comment_reactions TO anon; GRANT SELECT ON public.comment_reactions TO authenticated; GRANT INSERT ON public.comment_reactions TO authenticated; GRANT UPDATE ON public.comment_reactions TO authenticated; GRANT DELETE ON public.comment_reactions TO authenticated;
REVOKE ALL ON public.commerce_click_attributions FROM anon, authenticated;
REVOKE ALL ON public.commerce_feed_items FROM anon, authenticated;
REVOKE ALL ON public.commerce_feed_runs FROM anon, authenticated;
REVOKE ALL ON public.commerce_providers FROM anon, authenticated;
REVOKE ALL ON public.contact_identity_index FROM anon, authenticated;
REVOKE ALL ON public.contact_matches FROM anon, authenticated; GRANT SELECT ON public.contact_matches TO authenticated; GRANT DELETE ON public.contact_matches TO authenticated;
REVOKE ALL ON public.contact_sync_state FROM anon, authenticated; GRANT SELECT ON public.contact_sync_state TO authenticated;
REVOKE ALL ON public.content_reports FROM anon, authenticated; GRANT SELECT ON public.content_reports TO anon; GRANT INSERT ON public.content_reports TO anon; GRANT UPDATE ON public.content_reports TO anon; GRANT DELETE ON public.content_reports TO anon; GRANT SELECT ON public.content_reports TO authenticated; GRANT INSERT ON public.content_reports TO authenticated; GRANT UPDATE ON public.content_reports TO authenticated; GRANT DELETE ON public.content_reports TO authenticated;
REVOKE ALL ON public.conversations FROM anon, authenticated; GRANT SELECT ON public.conversations TO anon; GRANT INSERT ON public.conversations TO anon; GRANT UPDATE ON public.conversations TO anon; GRANT DELETE ON public.conversations TO anon; GRANT SELECT ON public.conversations TO authenticated; GRANT INSERT ON public.conversations TO authenticated; GRANT UPDATE ON public.conversations TO authenticated; GRANT DELETE ON public.conversations TO authenticated;
REVOKE ALL ON public.daily_snapshots FROM anon, authenticated;
REVOKE ALL ON public.decision_evidence FROM anon, authenticated;
REVOKE ALL ON public.department FROM anon, authenticated; GRANT SELECT ON public.department TO anon; GRANT INSERT ON public.department TO anon; GRANT UPDATE ON public.department TO anon; GRANT DELETE ON public.department TO anon; GRANT SELECT ON public.department TO authenticated; GRANT INSERT ON public.department TO authenticated; GRANT UPDATE ON public.department TO authenticated; GRANT DELETE ON public.department TO authenticated;
REVOKE ALL ON public.department_membership FROM anon, authenticated; GRANT SELECT ON public.department_membership TO anon; GRANT INSERT ON public.department_membership TO anon; GRANT UPDATE ON public.department_membership TO anon; GRANT DELETE ON public.department_membership TO anon; GRANT SELECT ON public.department_membership TO authenticated; GRANT INSERT ON public.department_membership TO authenticated; GRANT UPDATE ON public.department_membership TO authenticated; GRANT DELETE ON public.department_membership TO authenticated;
REVOKE ALL ON public.event_outbox FROM anon, authenticated;
REVOKE ALL ON public.favorites FROM anon, authenticated; GRANT SELECT ON public.favorites TO anon; GRANT INSERT ON public.favorites TO anon; GRANT UPDATE ON public.favorites TO anon; GRANT DELETE ON public.favorites TO anon; GRANT SELECT ON public.favorites TO authenticated; GRANT INSERT ON public.favorites TO authenticated; GRANT UPDATE ON public.favorites TO authenticated; GRANT DELETE ON public.favorites TO authenticated;
REVOKE ALL ON public.governed_events FROM anon, authenticated;
REVOKE ALL ON public.group_members FROM anon, authenticated; GRANT SELECT ON public.group_members TO anon; GRANT INSERT ON public.group_members TO anon; GRANT UPDATE ON public.group_members TO anon; GRANT DELETE ON public.group_members TO anon; GRANT SELECT ON public.group_members TO authenticated; GRANT INSERT ON public.group_members TO authenticated; GRANT UPDATE ON public.group_members TO authenticated; GRANT DELETE ON public.group_members TO authenticated;
REVOKE ALL ON public.groups FROM anon, authenticated; GRANT SELECT ON public.groups TO anon; GRANT INSERT ON public.groups TO anon; GRANT UPDATE ON public.groups TO anon; GRANT DELETE ON public.groups TO anon; GRANT SELECT ON public.groups TO authenticated; GRANT INSERT ON public.groups TO authenticated; GRANT UPDATE ON public.groups TO authenticated; GRANT DELETE ON public.groups TO authenticated;
REVOKE ALL ON public.marketing_campaigns FROM anon, authenticated;
REVOKE ALL ON public.marketing_consent FROM anon, authenticated;
REVOKE ALL ON public.message_feedback FROM anon, authenticated; GRANT SELECT ON public.message_feedback TO anon; GRANT INSERT ON public.message_feedback TO anon; GRANT UPDATE ON public.message_feedback TO anon; GRANT DELETE ON public.message_feedback TO anon; GRANT SELECT ON public.message_feedback TO authenticated; GRANT INSERT ON public.message_feedback TO authenticated; GRANT UPDATE ON public.message_feedback TO authenticated; GRANT DELETE ON public.message_feedback TO authenticated;
REVOKE ALL ON public.moderation_actions FROM anon, authenticated;
REVOKE ALL ON public.moderation_queue FROM anon, authenticated;
REVOKE ALL ON public.music_categories FROM anon, authenticated; GRANT SELECT ON public.music_categories TO anon; GRANT INSERT ON public.music_categories TO anon; GRANT UPDATE ON public.music_categories TO anon; GRANT DELETE ON public.music_categories TO anon; GRANT SELECT ON public.music_categories TO authenticated; GRANT INSERT ON public.music_categories TO authenticated; GRANT UPDATE ON public.music_categories TO authenticated; GRANT DELETE ON public.music_categories TO authenticated;
REVOKE ALL ON public.music_followed FROM anon, authenticated; GRANT SELECT ON public.music_followed TO anon; GRANT INSERT ON public.music_followed TO anon; GRANT UPDATE ON public.music_followed TO anon; GRANT DELETE ON public.music_followed TO anon; GRANT SELECT ON public.music_followed TO authenticated; GRANT INSERT ON public.music_followed TO authenticated; GRANT UPDATE ON public.music_followed TO authenticated; GRANT DELETE ON public.music_followed TO authenticated;
REVOKE ALL ON public.music_providers FROM anon, authenticated; GRANT SELECT ON public.music_providers TO anon; GRANT INSERT ON public.music_providers TO anon; GRANT UPDATE ON public.music_providers TO anon; GRANT DELETE ON public.music_providers TO anon; GRANT SELECT ON public.music_providers TO authenticated; GRANT INSERT ON public.music_providers TO authenticated; GRANT UPDATE ON public.music_providers TO authenticated; GRANT DELETE ON public.music_providers TO authenticated;
REVOKE ALL ON public.music_saved FROM anon, authenticated; GRANT SELECT ON public.music_saved TO anon; GRANT INSERT ON public.music_saved TO anon; GRANT UPDATE ON public.music_saved TO anon; GRANT DELETE ON public.music_saved TO anon; GRANT SELECT ON public.music_saved TO authenticated; GRANT INSERT ON public.music_saved TO authenticated; GRANT UPDATE ON public.music_saved TO authenticated; GRANT DELETE ON public.music_saved TO authenticated;
REVOKE ALL ON public.music_track_reports FROM anon, authenticated; GRANT SELECT ON public.music_track_reports TO anon; GRANT INSERT ON public.music_track_reports TO anon; GRANT UPDATE ON public.music_track_reports TO anon; GRANT DELETE ON public.music_track_reports TO anon; GRANT SELECT ON public.music_track_reports TO authenticated; GRANT INSERT ON public.music_track_reports TO authenticated; GRANT UPDATE ON public.music_track_reports TO authenticated; GRANT DELETE ON public.music_track_reports TO authenticated;
REVOKE ALL ON public.music_tracks FROM anon, authenticated;
REVOKE ALL ON public.music_usage FROM anon, authenticated; GRANT SELECT ON public.music_usage TO anon; GRANT INSERT ON public.music_usage TO anon; GRANT UPDATE ON public.music_usage TO anon; GRANT DELETE ON public.music_usage TO anon; GRANT SELECT ON public.music_usage TO authenticated; GRANT INSERT ON public.music_usage TO authenticated; GRANT UPDATE ON public.music_usage TO authenticated; GRANT DELETE ON public.music_usage TO authenticated;
REVOKE ALL ON public.notification_deliveries FROM anon, authenticated;
REVOKE ALL ON public.notification_subscriptions FROM anon, authenticated; GRANT SELECT ON public.notification_subscriptions TO anon; GRANT INSERT ON public.notification_subscriptions TO anon; GRANT UPDATE ON public.notification_subscriptions TO anon; GRANT DELETE ON public.notification_subscriptions TO anon; GRANT SELECT ON public.notification_subscriptions TO authenticated; GRANT INSERT ON public.notification_subscriptions TO authenticated; GRANT UPDATE ON public.notification_subscriptions TO authenticated; GRANT DELETE ON public.notification_subscriptions TO authenticated;
REVOKE ALL ON public.notifications FROM anon, authenticated; GRANT SELECT ON public.notifications TO anon; GRANT INSERT ON public.notifications TO anon; GRANT UPDATE ON public.notifications TO anon; GRANT DELETE ON public.notifications TO anon; GRANT SELECT ON public.notifications TO authenticated; GRANT INSERT ON public.notifications TO authenticated; GRANT UPDATE ON public.notifications TO authenticated; GRANT DELETE ON public.notifications TO authenticated;
REVOKE ALL ON public.organization FROM anon, authenticated; GRANT SELECT ON public.organization TO anon; GRANT INSERT ON public.organization TO anon; GRANT UPDATE ON public.organization TO anon; GRANT DELETE ON public.organization TO anon; GRANT SELECT ON public.organization TO authenticated; GRANT INSERT ON public.organization TO authenticated; GRANT UPDATE ON public.organization TO authenticated; GRANT DELETE ON public.organization TO authenticated;
REVOKE ALL ON public.partner_deal_translations FROM anon, authenticated; GRANT SELECT ON public.partner_deal_translations TO anon; GRANT INSERT ON public.partner_deal_translations TO anon; GRANT UPDATE ON public.partner_deal_translations TO anon; GRANT DELETE ON public.partner_deal_translations TO anon; GRANT SELECT ON public.partner_deal_translations TO authenticated; GRANT INSERT ON public.partner_deal_translations TO authenticated; GRANT UPDATE ON public.partner_deal_translations TO authenticated; GRANT DELETE ON public.partner_deal_translations TO authenticated;
REVOKE ALL ON public.partner_deals FROM anon, authenticated; GRANT SELECT ON public.partner_deals TO anon; GRANT INSERT ON public.partner_deals TO anon; GRANT UPDATE ON public.partner_deals TO anon; GRANT DELETE ON public.partner_deals TO anon; GRANT SELECT ON public.partner_deals TO authenticated; GRANT INSERT ON public.partner_deals TO authenticated; GRANT UPDATE ON public.partner_deals TO authenticated; GRANT DELETE ON public.partner_deals TO authenticated;
REVOKE ALL ON public.place_photos FROM anon, authenticated; GRANT SELECT ON public.place_photos TO anon; GRANT INSERT ON public.place_photos TO anon; GRANT UPDATE ON public.place_photos TO anon; GRANT DELETE ON public.place_photos TO anon; GRANT SELECT ON public.place_photos TO authenticated; GRANT INSERT ON public.place_photos TO authenticated; GRANT UPDATE ON public.place_photos TO authenticated; GRANT DELETE ON public.place_photos TO authenticated;
REVOKE ALL ON public.plan_shares FROM anon, authenticated; GRANT SELECT ON public.plan_shares TO authenticated; GRANT INSERT ON public.plan_shares TO authenticated; GRANT DELETE ON public.plan_shares TO authenticated;
REVOKE ALL ON public.platform_owner FROM anon, authenticated; GRANT SELECT ON public.platform_owner TO anon; GRANT INSERT ON public.platform_owner TO anon; GRANT UPDATE ON public.platform_owner TO anon; GRANT DELETE ON public.platform_owner TO anon; GRANT SELECT ON public.platform_owner TO authenticated; GRANT INSERT ON public.platform_owner TO authenticated; GRANT UPDATE ON public.platform_owner TO authenticated; GRANT DELETE ON public.platform_owner TO authenticated;
REVOKE ALL ON public.platform_owner_recovery FROM anon, authenticated;
REVOKE ALL ON public.platform_settings FROM anon, authenticated;
REVOKE ALL ON public.price_watches FROM anon, authenticated; GRANT SELECT ON public.price_watches TO anon; GRANT INSERT ON public.price_watches TO anon; GRANT UPDATE ON public.price_watches TO anon; GRANT DELETE ON public.price_watches TO anon; GRANT SELECT ON public.price_watches TO authenticated; GRANT INSERT ON public.price_watches TO authenticated; GRANT UPDATE ON public.price_watches TO authenticated; GRANT DELETE ON public.price_watches TO authenticated;
REVOKE ALL ON public.profiles FROM anon, authenticated; GRANT SELECT ON public.profiles TO anon; GRANT INSERT ON public.profiles TO anon; GRANT UPDATE ON public.profiles TO anon; GRANT DELETE ON public.profiles TO anon; GRANT SELECT ON public.profiles TO authenticated; GRANT INSERT ON public.profiles TO authenticated; GRANT UPDATE ON public.profiles TO authenticated; GRANT DELETE ON public.profiles TO authenticated;
REVOKE ALL ON public.query_texts FROM anon, authenticated;
REVOKE ALL ON public.review_comments FROM anon, authenticated; GRANT SELECT ON public.review_comments TO anon; GRANT INSERT ON public.review_comments TO anon; GRANT UPDATE ON public.review_comments TO anon; GRANT DELETE ON public.review_comments TO anon; GRANT SELECT ON public.review_comments TO authenticated; GRANT INSERT ON public.review_comments TO authenticated; GRANT UPDATE ON public.review_comments TO authenticated; GRANT DELETE ON public.review_comments TO authenticated;
REVOKE ALL ON public.review_interactions FROM anon, authenticated; GRANT SELECT ON public.review_interactions TO anon; GRANT INSERT ON public.review_interactions TO anon; GRANT UPDATE ON public.review_interactions TO anon; GRANT DELETE ON public.review_interactions TO anon; GRANT SELECT ON public.review_interactions TO authenticated; GRANT INSERT ON public.review_interactions TO authenticated; GRANT UPDATE ON public.review_interactions TO authenticated; GRANT DELETE ON public.review_interactions TO authenticated;
REVOKE ALL ON public.review_likes FROM anon, authenticated; GRANT SELECT ON public.review_likes TO anon; GRANT INSERT ON public.review_likes TO anon; GRANT UPDATE ON public.review_likes TO anon; GRANT DELETE ON public.review_likes TO anon; GRANT SELECT ON public.review_likes TO authenticated; GRANT INSERT ON public.review_likes TO authenticated; GRANT UPDATE ON public.review_likes TO authenticated; GRANT DELETE ON public.review_likes TO authenticated;
REVOKE ALL ON public.review_milestones FROM anon, authenticated; GRANT SELECT ON public.review_milestones TO anon; GRANT INSERT ON public.review_milestones TO anon; GRANT UPDATE ON public.review_milestones TO anon; GRANT DELETE ON public.review_milestones TO anon; GRANT SELECT ON public.review_milestones TO authenticated; GRANT INSERT ON public.review_milestones TO authenticated; GRANT UPDATE ON public.review_milestones TO authenticated; GRANT DELETE ON public.review_milestones TO authenticated;
REVOKE ALL ON public.review_saves FROM anon, authenticated; GRANT SELECT ON public.review_saves TO anon; GRANT INSERT ON public.review_saves TO anon; GRANT UPDATE ON public.review_saves TO anon; GRANT DELETE ON public.review_saves TO anon; GRANT SELECT ON public.review_saves TO authenticated; GRANT INSERT ON public.review_saves TO authenticated; GRANT UPDATE ON public.review_saves TO authenticated; GRANT DELETE ON public.review_saves TO authenticated;
REVOKE ALL ON public.review_shares FROM anon, authenticated; GRANT SELECT ON public.review_shares TO anon; GRANT INSERT ON public.review_shares TO anon; GRANT UPDATE ON public.review_shares TO anon; GRANT DELETE ON public.review_shares TO anon; GRANT SELECT ON public.review_shares TO authenticated; GRANT INSERT ON public.review_shares TO authenticated; GRANT UPDATE ON public.review_shares TO authenticated; GRANT DELETE ON public.review_shares TO authenticated;
REVOKE ALL ON public.reviews FROM anon, authenticated; GRANT SELECT ON public.reviews TO anon; GRANT INSERT ON public.reviews TO anon; GRANT UPDATE ON public.reviews TO anon; GRANT DELETE ON public.reviews TO anon; GRANT SELECT ON public.reviews TO authenticated; GRANT INSERT ON public.reviews TO authenticated; GRANT UPDATE ON public.reviews TO authenticated; GRANT DELETE ON public.reviews TO authenticated;
REVOKE ALL ON public.services FROM anon, authenticated; GRANT SELECT ON public.services TO anon; GRANT INSERT ON public.services TO anon; GRANT UPDATE ON public.services TO anon; GRANT DELETE ON public.services TO anon; GRANT SELECT ON public.services TO authenticated; GRANT INSERT ON public.services TO authenticated; GRANT UPDATE ON public.services TO authenticated; GRANT DELETE ON public.services TO authenticated;
REVOKE ALL ON public.shared_results FROM anon, authenticated; GRANT SELECT ON public.shared_results TO authenticated;
REVOKE ALL ON public.subscriptions FROM anon, authenticated; GRANT SELECT ON public.subscriptions TO anon; GRANT INSERT ON public.subscriptions TO anon; GRANT UPDATE ON public.subscriptions TO anon; GRANT DELETE ON public.subscriptions TO anon; GRANT SELECT ON public.subscriptions TO authenticated; GRANT INSERT ON public.subscriptions TO authenticated; GRANT UPDATE ON public.subscriptions TO authenticated; GRANT DELETE ON public.subscriptions TO authenticated;
REVOKE ALL ON public.system_health_log FROM anon, authenticated; GRANT SELECT ON public.system_health_log TO anon; GRANT INSERT ON public.system_health_log TO anon; GRANT UPDATE ON public.system_health_log TO anon; GRANT DELETE ON public.system_health_log TO anon; GRANT SELECT ON public.system_health_log TO authenticated; GRANT INSERT ON public.system_health_log TO authenticated; GRANT UPDATE ON public.system_health_log TO authenticated; GRANT DELETE ON public.system_health_log TO authenticated;
REVOKE ALL ON public.user_acquisition FROM anon, authenticated; GRANT SELECT ON public.user_acquisition TO anon; GRANT INSERT ON public.user_acquisition TO anon; GRANT UPDATE ON public.user_acquisition TO anon; GRANT DELETE ON public.user_acquisition TO anon; GRANT SELECT ON public.user_acquisition TO authenticated; GRANT INSERT ON public.user_acquisition TO authenticated; GRANT UPDATE ON public.user_acquisition TO authenticated; GRANT DELETE ON public.user_acquisition TO authenticated;
REVOKE ALL ON public.user_demographics FROM anon, authenticated;
REVOKE ALL ON public.user_events FROM anon, authenticated; GRANT SELECT ON public.user_events TO anon; GRANT INSERT ON public.user_events TO anon; GRANT UPDATE ON public.user_events TO anon; GRANT DELETE ON public.user_events TO anon; GRANT SELECT ON public.user_events TO authenticated; GRANT INSERT ON public.user_events TO authenticated; GRANT UPDATE ON public.user_events TO authenticated; GRANT DELETE ON public.user_events TO authenticated;
REVOKE ALL ON public.user_follows FROM anon, authenticated; GRANT SELECT ON public.user_follows TO anon; GRANT INSERT ON public.user_follows TO anon; GRANT UPDATE ON public.user_follows TO anon; GRANT DELETE ON public.user_follows TO anon; GRANT SELECT ON public.user_follows TO authenticated; GRANT INSERT ON public.user_follows TO authenticated; GRANT UPDATE ON public.user_follows TO authenticated; GRANT DELETE ON public.user_follows TO authenticated;
REVOKE ALL ON public.user_integrations FROM anon, authenticated; GRANT SELECT ON public.user_integrations TO anon; GRANT INSERT ON public.user_integrations TO anon; GRANT UPDATE ON public.user_integrations TO anon; GRANT DELETE ON public.user_integrations TO anon; GRANT SELECT ON public.user_integrations TO authenticated; GRANT INSERT ON public.user_integrations TO authenticated; GRANT UPDATE ON public.user_integrations TO authenticated; GRANT DELETE ON public.user_integrations TO authenticated;
REVOKE ALL ON public.user_memory FROM anon, authenticated; GRANT SELECT ON public.user_memory TO anon; GRANT INSERT ON public.user_memory TO anon; GRANT UPDATE ON public.user_memory TO anon; GRANT DELETE ON public.user_memory TO anon; GRANT SELECT ON public.user_memory TO authenticated; GRANT INSERT ON public.user_memory TO authenticated; GRANT UPDATE ON public.user_memory TO authenticated; GRANT DELETE ON public.user_memory TO authenticated;
REVOKE ALL ON public.user_memory_fk_cleanup_log FROM anon, authenticated;
REVOKE ALL ON public.user_notes FROM anon, authenticated;
REVOKE ALL ON public.user_preferences FROM anon, authenticated; GRANT SELECT ON public.user_preferences TO anon; GRANT INSERT ON public.user_preferences TO anon; GRANT UPDATE ON public.user_preferences TO anon; GRANT DELETE ON public.user_preferences TO anon; GRANT SELECT ON public.user_preferences TO authenticated; GRANT INSERT ON public.user_preferences TO authenticated; GRANT UPDATE ON public.user_preferences TO authenticated; GRANT DELETE ON public.user_preferences TO authenticated;
REVOKE ALL ON public.vouchers FROM anon, authenticated; GRANT SELECT ON public.vouchers TO anon; GRANT INSERT ON public.vouchers TO anon; GRANT UPDATE ON public.vouchers TO anon; GRANT DELETE ON public.vouchers TO anon; GRANT SELECT ON public.vouchers TO authenticated; GRANT INSERT ON public.vouchers TO authenticated; GRANT UPDATE ON public.vouchers TO authenticated; GRANT DELETE ON public.vouchers TO authenticated;
GRANT SELECT (is_suspended) ON public.account_status TO authenticated;
GRANT SELECT (is_banned) ON public.account_status TO authenticated;
GRANT SELECT (user_id) ON public.account_status TO authenticated;
GRANT SELECT (suspended_until) ON public.account_status TO authenticated;
GRANT UPDATE (updated_at) ON public.shared_results TO authenticated;
GRANT UPDATE (status) ON public.shared_results TO authenticated;
GRANT SELECT (user_id) ON public.user_demographics TO authenticated;
GRANT SELECT (updated_at) ON public.user_demographics TO authenticated;
GRANT UPDATE (gender_self_describe) ON public.user_demographics TO authenticated;
GRANT UPDATE (occupation) ON public.user_demographics TO authenticated;
GRANT INSERT (industry) ON public.user_demographics TO authenticated;
GRANT SELECT (country) ON public.user_demographics TO authenticated;
GRANT UPDATE (country) ON public.user_demographics TO authenticated;
GRANT INSERT (education_level) ON public.user_demographics TO authenticated;
GRANT SELECT (education_level) ON public.user_demographics TO authenticated;
GRANT UPDATE (education_level) ON public.user_demographics TO authenticated;
GRANT SELECT (industry) ON public.user_demographics TO authenticated;
GRANT INSERT (country) ON public.user_demographics TO authenticated;
GRANT UPDATE (city) ON public.user_demographics TO authenticated;
GRANT SELECT (city) ON public.user_demographics TO authenticated;
GRANT INSERT (city) ON public.user_demographics TO authenticated;
GRANT SELECT (created_at) ON public.user_demographics TO authenticated;
GRANT INSERT (occupation) ON public.user_demographics TO authenticated;
GRANT UPDATE (industry) ON public.user_demographics TO authenticated;
GRANT SELECT (occupation) ON public.user_demographics TO authenticated;
GRANT INSERT (user_id) ON public.user_demographics TO authenticated;
GRANT SELECT (gender_self_describe) ON public.user_demographics TO authenticated;
GRANT INSERT (gender_self_describe) ON public.user_demographics TO authenticated;
GRANT UPDATE (gender) ON public.user_demographics TO authenticated;
GRANT SELECT (gender) ON public.user_demographics TO authenticated;
GRANT INSERT (gender) ON public.user_demographics TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_user_date_of_birth(p_user_id uuid, p_dob date, p_actor_id uuid, p_actor_email text, p_actor_role text, p_reason text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.age_band_of(p_dob date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.anon_chat_usage_increment() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.anon_chat_usage_increment() TO authenticated;
REVOKE ALL ON FUNCTION public.anon_chat_usage_today() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.anon_chat_usage_today() TO authenticated;
REVOKE ALL ON FUNCTION public.audit_log_client_sweep(p_days integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_log_prune(p_months integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_can_reach(p_target uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.chat_can_reach(p_target uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.chat_create_group(p_title text, p_members uuid[]) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.chat_create_group(p_title text, p_members uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.chat_is_participant(p_thread uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.chat_is_participant(p_thread uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.chat_start_direct(p_target uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.chat_start_direct(p_target uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.chat_thread_blocked(p_thread uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.chat_thread_blocked(p_thread uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.chat_thread_summaries() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.chat_thread_summaries() TO authenticated;
REVOKE ALL ON FUNCTION public.commerce_click_attributions_sweep(p_limit integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decision_evidence_load(p_id uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.decision_evidence_load(p_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.decision_evidence_save(p_id uuid, p_evidence jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.decision_evidence_save(p_id uuid, p_evidence jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.decision_evidence_sweep(p_limit integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disown_push_credential(p_credential text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.disown_push_credential(p_credential text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_audit_mask(p jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_audit_part(p_value text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_audit_row_hash(p_prev bytea, p_seq bigint, p_id uuid, p_actor_id uuid, p_actor_email text, p_actor_role text, p_action text, p_target_type text, p_target_id text, p_before_state jsonb, p_after_state jsonb, p_metadata jsonb, p_ip_address inet, p_user_agent text, p_created_at timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_audit_ts(p_ts timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_claim_anonymous_conversations(p_anon_id uuid, p_target_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_finalize_daily_snapshots(p_before date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_grant_admin_role(p_actor_id uuid, p_user_id uuid, p_role admin_role, p_notes text, p_expires_at timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_group_participant(p_group uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fn_group_participant(p_group uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_ingest_moderation_reports() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_is_platform_owner(p_user_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_original_sound_is_servable(p_track uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fn_original_sound_is_servable(p_track uuid) TO anon; GRANT EXECUTE ON FUNCTION public.fn_original_sound_is_servable(p_track uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_outbox_claim(p_ready_consumers text[], p_limit integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_outbox_publish(p_event_id uuid, p_type text, p_event_version text, p_producer text, p_security_class text, p_occurred_at timestamp with time zone, p_consumer_ids text[], p_actor jsonb, p_correlation_id text, p_payload jsonb, p_metadata jsonb, p_schema_version smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_outbox_settle(p_id uuid, p_ok boolean, p_error text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_owner_recovery_arm(p_target_user_id uuid, p_reason text, p_window_minutes integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_owner_recovery_audit(p_action text, p_target uuid, p_before jsonb, p_after jsonb, p_metadata jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_owner_recovery_cancel(p_recovery_id uuid, p_reason text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_owner_recovery_execute(p_recovery_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_revoke_admin_role(p_actor_id uuid, p_role_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_rollup_activation_daily(p_from date, p_to date) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fn_rollup_activation_daily(p_from date, p_to date) TO anon; GRANT EXECUTE ON FUNCTION public.fn_rollup_activation_daily(p_from date, p_to date) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rollup_auth_daily(p_from date, p_to date) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fn_rollup_auth_daily(p_from date, p_to date) TO anon; GRANT EXECUTE ON FUNCTION public.fn_rollup_auth_daily(p_from date, p_to date) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rollup_cohort_metrics(p_from date, p_to date, p_today date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_rollup_daily_snapshots(p_from date, p_to date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_session_inventory(p_user_id uuid, p_limit integer, p_before timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_session_revoke(p_session_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_session_revoke_all(p_user_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_session_subject(p_session_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_shared_result_bump(p_slug text, p_kind text, p_by integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_sync_last_login() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_upsert_activation(p_user_id uuid, p_activated_at timestamp with time zone, p_activation_rule_version text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fn_upsert_activation(p_user_id uuid, p_activated_at timestamp with time zone, p_activation_rule_version text) TO anon; GRANT EXECUTE ON FUNCTION public.fn_upsert_activation(p_user_id uuid, p_activated_at timestamp with time zone, p_activation_rule_version text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_upsert_user_acquisition(p_user_id uuid, p_anon_id uuid, p_signup_method text, p_signup_platform text, p_signup_app_version text, p_signup_device_type text, p_signup_country text, p_signup_language text, p_acquisition_source text, p_signup_at timestamp with time zone, p_first_login_at timestamp with time zone, p_last_login_at timestamp with time zone) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fn_upsert_user_acquisition(p_user_id uuid, p_anon_id uuid, p_signup_method text, p_signup_platform text, p_signup_app_version text, p_signup_device_type text, p_signup_country text, p_signup_language text, p_acquisition_source text, p_signup_at timestamp with time zone, p_first_login_at timestamp with time zone, p_last_login_at timestamp with time zone) TO anon; GRANT EXECUTE ON FUNCTION public.fn_upsert_user_acquisition(p_user_id uuid, p_anon_id uuid, p_signup_method text, p_signup_platform text, p_signup_app_version text, p_signup_device_type text, p_signup_country text, p_signup_language text, p_acquisition_source text, p_signup_at timestamp with time zone, p_first_login_at timestamp with time zone, p_last_login_at timestamp with time zone) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_verify_audit_chain(p_from bigint, p_to bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_interaction_avgs(p_review_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hot_places_24h(p_limit integer) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.hot_places_24h(p_limit integer) TO anon; GRANT EXECUTE ON FUNCTION public.hot_places_24h(p_limit integer) TO authenticated;
REVOKE ALL ON FUNCTION public.increment_deal_click(p_deal_id uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.increment_deal_click(p_deal_id uuid) TO anon; GRANT EXECUTE ON FUNCTION public.increment_deal_click(p_deal_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.increment_review_view(p_review_id uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.increment_review_view(p_review_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.music_followed_count(p_track uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.music_followed_count(p_track uuid) TO anon; GRANT EXECUTE ON FUNCTION public.music_followed_count(p_track uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.music_increment_play(p_track uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.music_increment_play(p_track uuid) TO anon; GRANT EXECUTE ON FUNCTION public.music_increment_play(p_track uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.music_saved_count(p_track uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.music_saved_count(p_track uuid) TO anon; GRANT EXECUTE ON FUNCTION public.music_saved_count(p_track uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.plan_share_public(p_id text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.plan_share_public(p_id text) TO anon; GRANT EXECUTE ON FUNCTION public.plan_share_public(p_id text) TO authenticated;
REVOKE ALL ON FUNCTION public.push_credential(subscription_data jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.push_credential(subscription_data jsonb) TO anon; GRANT EXECUTE ON FUNCTION public.push_credential(subscription_data jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.review_likers(p_review_id uuid, p_limit integer, p_before timestamp with time zone) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.review_likers(p_review_id uuid, p_limit integer, p_before timestamp with time zone) TO anon; GRANT EXECUTE ON FUNCTION public.review_likers(p_review_id uuid, p_limit integer, p_before timestamp with time zone) TO authenticated;
REVOKE ALL ON FUNCTION public.set_user_date_of_birth(p_dob date) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.set_user_date_of_birth(p_dob date) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_review_watch_stats(p_review_id uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.sync_review_watch_stats(p_review_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.user_age_status() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.user_age_status() TO authenticated;
