-- Cost reports over public.ai_usage_events (run in the Supabase SQL editor; only the service role can read the table).
-- Written 02/11/2026 for the question "what do a normal question, a web search and a Deep Research really cost, per plan".
-- One row = one AI turn of a signed-in account (guests are not recorded). Counts and prices only; never a word of the conversation.
-- Prices: model tokens at list price; Serper at SERPER_USD_PER_CREDIT (default 0.001 - set the real figure of the plan you bought).
-- The model price counts uncached input at the cache-write price, so llm_usd is an UPPER bound. Change the interval below as needed.

-- 0. How much data is there (do not read the other reports before this is a few hundred turns)
SELECT count(*) AS turns, count(DISTINCT user_id) AS accounts, min(created_at) AS first_turn, max(created_at) AS last_turn
FROM public.ai_usage_events;

-- 1. THE QUESTION: cost of a turn by kind of question and plan
--    normal       = chat / auto that did not search      web_search = a turn that searched (quick or thorough), not thinking
--    thinking     = think / auto_think                    deep       = Deep Research
WITH t AS (
  SELECT *,
    CASE
      WHEN mode = 'deep' THEN 'deep_research'
      WHEN mode IN ('think', 'auto_think') THEN 'thinking'
      WHEN search_depth <> 'none' OR serper_calls > 0 THEN 'web_search'
      ELSE 'normal'
    END AS kind
  FROM public.ai_usage_events
  WHERE ok AND created_at >= now() - interval '30 days'
)
SELECT plan, kind,
       count(*)                                         AS turns,
       round(avg(cost_usd), 5)                          AS avg_usd,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY cost_usd)::numeric, 5) AS p50_usd,
       round(percentile_cont(0.9) WITHIN GROUP (ORDER BY cost_usd)::numeric, 5) AS p90_usd,
       round(avg(llm_usd), 5)                           AS avg_llm_usd,
       round(avg(serper_usd), 5)                        AS avg_search_usd,
       round(100 * sum(serper_usd) / NULLIF(sum(cost_usd), 0), 1) AS search_pct_of_cost,
       round(avg(serper_calls), 2)                      AS avg_serper_calls,
       round(avg(parallel_calls), 2)                    AS avg_parallel_calls
FROM t
GROUP BY plan, kind
ORDER BY plan, kind;

-- 2. Mix: how many turns of each kind (what share of a plan's turns is expensive)
SELECT plan,
       count(*) AS turns,
       round(100.0 * count(*) FILTER (WHERE mode = 'deep') / count(*), 1)                                         AS pct_deep,
       round(100.0 * count(*) FILTER (WHERE mode IN ('think', 'auto_think')) / count(*), 1)                       AS pct_thinking,
       round(100.0 * count(*) FILTER (WHERE mode <> 'deep' AND mode NOT IN ('think', 'auto_think') AND (search_depth <> 'none' OR serper_calls > 0)) / count(*), 1) AS pct_web_search,
       round(100.0 * count(*) FILTER (WHERE search_depth = 'thorough') / count(*), 1)                             AS pct_thorough
FROM public.ai_usage_events
WHERE ok AND created_at >= now() - interval '30 days'
GROUP BY plan ORDER BY plan;

-- 3. What one account costs per month, by plan (average, median, heaviest decile)
WITH m AS (
  SELECT plan, user_id, sum(cost_usd) AS month_usd, count(*) AS turns,
         count(*) FILTER (WHERE mode = 'deep') AS deep_runs
  FROM public.ai_usage_events
  WHERE created_at >= now() - interval '30 days'
  GROUP BY plan, user_id
)
SELECT plan, count(*) AS accounts,
       round(avg(month_usd), 3) AS avg_usd_per_account,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY month_usd)::numeric, 3) AS p50_usd,
       round(percentile_cont(0.9) WITHIN GROUP (ORDER BY month_usd)::numeric, 3) AS p90_usd,
       round(max(month_usd), 3) AS max_usd,
       round(avg(turns), 1) AS avg_turns, round(avg(deep_runs), 2) AS avg_deep_runs
FROM m GROUP BY plan ORDER BY plan;

-- 4. The heaviest accounts of the last 30 days (ids only; look them up by hand if you must)
SELECT user_id, plan, count(*) AS turns, round(sum(cost_usd), 3) AS usd,
       round(sum(serper_usd), 3) AS search_usd, count(*) FILTER (WHERE mode = 'deep') AS deep_runs
FROM public.ai_usage_events
WHERE created_at >= now() - interval '30 days'
GROUP BY user_id, plan ORDER BY usd DESC LIMIT 20;

-- 5. Do the caches work?  (decides whether the cache proposals are worth doing)
--    provider_cache_share: input tokens the provider served from its cache (tokens_in may or may not include them: read as a trend, not a law)
--    serper_cache_share:   Serper lookups answered from our own cache, of all lookups asked
SELECT mode,
       count(*) AS turns,
       round(100.0 * sum(cached_tokens_in) / NULLIF(sum(tokens_in), 0), 1)                          AS provider_cache_share_pct,
       round(100.0 * sum(serper_cache_hits) / NULLIF(sum(serper_cache_hits + serper_calls), 0), 1)  AS serper_cache_share_pct,
       sum(serper_calls) AS serper_credits_spent_calls, sum(serper_cache_hits) AS serper_cache_hits
FROM public.ai_usage_events
WHERE ok AND created_at >= now() - interval '30 days'
GROUP BY mode ORDER BY mode;

-- 6. Search spend by turn type (where the Serper credits go)
SELECT turn_type, mode, count(*) AS turns, round(sum(serper_usd), 3) AS search_usd,
       round(avg(serper_calls), 2) AS avg_calls
FROM public.ai_usage_events
WHERE ok AND created_at >= now() - interval '30 days'
GROUP BY turn_type, mode ORDER BY search_usd DESC;

-- 7. Daily trend (turns, cost, search share)
SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
       count(*) AS turns, round(sum(cost_usd), 3) AS usd,
       round(100 * sum(serper_usd) / NULLIF(sum(cost_usd), 0), 1) AS search_pct
FROM public.ai_usage_events
WHERE created_at >= now() - interval '30 days'
GROUP BY 1 ORDER BY 1;

-- 8. Failed turns (the question was given back, but the money may still have been spent)
SELECT plan, mode, count(*) AS failed_turns, round(sum(cost_usd), 4) AS usd_spent
FROM public.ai_usage_events
WHERE NOT ok AND created_at >= now() - interval '30 days'
GROUP BY plan, mode ORDER BY usd_spent DESC;
