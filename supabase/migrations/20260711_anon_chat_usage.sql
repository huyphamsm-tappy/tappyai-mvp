-- Anonymous chat quota — server-side daily counter keyed by anonymous_id
-- (Backend Auth Contract Completion, 2026-07-11).
--
-- Replaces the client-visible cookie counter for token-based anonymous
-- sessions (POST /api/auth/anonymous → Supabase Anonymous Auth). The key is
-- auth.uid() taken from the VERIFIED JWT inside a SECURITY DEFINER function —
-- clients never send or compute quota information.
--
-- Day boundary = Việt Nam calendar day, matching the product copy
-- ("quay lại ngày mai", reset 00:00 VN) and vnToday() in src/lib/config/product.ts.

CREATE TABLE IF NOT EXISTS public.anon_chat_usage (
  user_id UUID NOT NULL,
  day     DATE NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Locked down: RLS on, NO policies — only the definer function below can touch it.
ALTER TABLE public.anon_chat_usage ENABLE ROW LEVEL SECURITY;

-- Atomically increment today's counter for the calling anonymous session and
-- return the new count. /api/chat blocks when the returned count exceeds the
-- daily limit (limit itself lives in code: ANON_DAILY_LIMIT).
CREATE OR REPLACE FUNCTION public.anon_chat_usage_increment()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.anon_chat_usage_increment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anon_chat_usage_increment() TO authenticated;

-- Housekeeping note: rows are tiny ((uuid, date, int) per anon per day); prune
-- old days later with a cron DELETE if volume ever matters.
