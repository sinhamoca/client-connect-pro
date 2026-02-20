-- Add unique constraint on key for upsert support
ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_key_unique UNIQUE (key);
