
-- 1. System settings table for admin-configurable values
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage settings" ON public.system_settings
FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read settings" ON public.system_settings
FOR SELECT TO authenticated USING (true);

-- Insert default trial days
INSERT INTO public.system_settings (key, value) VALUES ('default_trial_days', '30');

-- 2. Admin policies on profiles (admin can update/delete any profile)
CREATE POLICY "Admins can update all profiles" ON public.profiles
FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete profiles" ON public.profiles
FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- 3. Update handle_new_user to set subscription based on default_trial_days
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  trial_days integer;
BEGIN
  SELECT COALESCE(value::integer, 30) INTO trial_days
  FROM public.system_settings WHERE key = 'default_trial_days';

  IF trial_days IS NULL THEN
    trial_days := 30;
  END IF;

  INSERT INTO public.profiles (user_id, name, email, subscription_start, subscription_end)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    now(),
    now() + (trial_days || ' days')::interval
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$;

-- 4. Update trigger for system_settings
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
