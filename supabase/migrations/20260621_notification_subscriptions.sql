-- Push notification subscriptions table
-- provider: 'webpush' now; 'fcm' when native Android/iOS app ships
CREATE TABLE notification_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'webpush',
  -- webpush: { endpoint, keys: { p256dh, auth } }
  -- fcm (future): { token }
  subscription_data JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_subscriptions"
  ON notification_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_notif_subs_enabled ON notification_subscriptions(enabled) WHERE enabled = true;
CREATE INDEX idx_notif_subs_user_id ON notification_subscriptions(user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_notification_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notif_subs_updated_at
  BEFORE UPDATE ON notification_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_notification_subscriptions_updated_at();
