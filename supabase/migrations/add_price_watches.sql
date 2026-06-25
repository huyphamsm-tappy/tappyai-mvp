-- Price Watch: user sets a target price for a product, Tappy notifies when hit
CREATE TABLE IF NOT EXISTS public.price_watches (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_name  text        NOT NULL,
  target_price  bigint      NOT NULL,          -- target price in VND
  current_price bigint,                         -- last known price in VND (null = not checked yet)
  search_query  text        NOT NULL,           -- query used to search for price
  status        text        DEFAULT 'active'
                            CHECK (status IN ('active', 'triggered', 'cancelled')),
  notified_at   timestamptz,                    -- when push notification was sent
  last_checked  timestamptz,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.price_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own price watches"
  ON public.price_watches
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for cron job (active watches only)
CREATE INDEX IF NOT EXISTS price_watches_status_idx
  ON public.price_watches (status)
  WHERE status = 'active';
