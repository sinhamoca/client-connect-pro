-- Platform plans managed by admin
CREATE TABLE public.platform_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 30,
  max_clients integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read active plans
CREATE POLICY "Anyone can read active platform plans"
ON public.platform_plans FOR SELECT
USING (true);

-- Only admins can manage
CREATE POLICY "Admins manage platform plans"
ON public.platform_plans FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Platform payments/subscriptions log
CREATE TABLE public.platform_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  platform_plan_id uuid REFERENCES public.platform_plans(id),
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  mp_payment_id text,
  mp_status text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own platform payments"
ON public.platform_payments FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own platform payments"
ON public.platform_payments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage platform payments"
ON public.platform_payments FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_platform_plans_updated_at
BEFORE UPDATE ON public.platform_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_platform_payments_updated_at
BEFORE UPDATE ON public.platform_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
