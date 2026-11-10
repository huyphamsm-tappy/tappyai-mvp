-- Rollback of 20261120_tvi_core.sql: removes the TVI core tables and functions. Nothing else reads or writes them (no code is wired to the store yet), so this loses only TVI rows.

DROP FUNCTION IF EXISTS public.tvi_retire_fact(uuid, integer, text, text, text, text);
DROP FUNCTION IF EXISTS public.tvi_promote_fact(uuid, uuid, integer, text, text, text, text, uuid[]);
DROP FUNCTION IF EXISTS public.tvi_stage_fact(text, text, text, text, text, text, text, jsonb, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text);
DROP TABLE IF EXISTS public.knowledge_fact_evidence;
DROP TABLE IF EXISTS public.knowledge_evidence;
DROP TABLE IF EXISTS public.knowledge_fact_events;
DROP TABLE IF EXISTS public.knowledge_fact_state;
DROP TABLE IF EXISTS public.knowledge_fact_versions;
DROP TABLE IF EXISTS public.knowledge_facts;
DROP TABLE IF EXISTS public.knowledge_entities;
DROP TABLE IF EXISTS public.knowledge_sources;
DROP FUNCTION IF EXISTS public.tvi_guard_immutable();
