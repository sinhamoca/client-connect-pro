
-- 1. Create panel_credentials table
CREATE TABLE public.panel_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('sigma','cloudnation','koffice','uniplay','club','rush','painelfoda')),
  label text NOT NULL DEFAULT '',
  domain text,
  username text NOT NULL,
  password text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.panel_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own panel_credentials"
  ON public.panel_credentials FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_panel_credentials_updated_at
  BEFORE UPDATE ON public.panel_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add panel_credential_id and package_id to plans
ALTER TABLE public.plans
  ADD COLUMN panel_credential_id uuid REFERENCES public.panel_credentials(id) ON DELETE SET NULL,
  ADD COLUMN package_id text;

-- 3. Create activity_logs table
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  type text NOT NULL,
  status text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own activity_logs"
  ON public.activity_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Create renewal_retry_queue table
CREATE TABLE public.renewal_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  attempt integer NOT NULL DEFAULT 1,
  max_attempts integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  last_error text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','success','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.renewal_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own retry_queue"
  ON public.renewal_retry_queue FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_renewal_retry_queue_updated_at
  BEFORE UPDATE ON public.renewal_retry_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
