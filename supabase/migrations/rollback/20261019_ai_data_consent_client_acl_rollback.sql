-- Rollback of 20261019_ai_data_consent_client_acl.sql: restore the client-role grants that 20261018 left in place.
GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.ai_data_consent TO anon, authenticated;
