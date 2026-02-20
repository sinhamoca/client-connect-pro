
-- Role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  max_clients INTEGER NOT NULL DEFAULT 100,
  max_instances INTEGER NOT NULL DEFAULT 1,
  messages_per_minute INTEGER NOT NULL DEFAULT 10,
  subscription_start TIMESTAMPTZ DEFAULT now(),
  subscription_end TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Servers table
CREATE TABLE public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  cost_per_screen NUMERIC(10,2) NOT NULL DEFAULT 0,
  multiply_by_screens BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

-- Plans table
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  duration_months INTEGER NOT NULL DEFAULT 1,
  num_screens INTEGER NOT NULL DEFAULT 1,
  is_sigma_plan BOOLEAN DEFAULT false,
  sigma_plan_code TEXT,
  sigma_domain TEXT,
  is_live21_plan BOOLEAN DEFAULT false,
  is_koffice_plan BOOLEAN DEFAULT false,
  koffice_domain TEXT,
  is_uniplay_plan BOOLEAN DEFAULT false,
  is_unitv_plan BOOLEAN DEFAULT false,
  is_club_plan BOOLEAN DEFAULT false,
  is_painelfoda_plan BOOLEAN DEFAULT false,
  painelfoda_domain TEXT,
  painelfoda_username TEXT,
  painelfoda_password TEXT,
  painelfoda_package_id TEXT,
  is_rush_plan BOOLEAN DEFAULT false,
  rush_type TEXT CHECK (rush_type IN ('IPTV', 'P2P')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Clients table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  whatsapp_number TEXT,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL,
  price_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  due_date DATE,
  username TEXT,
  suffix TEXT,
  password TEXT,
  mac_address TEXT,
  device_key TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  payment_token UUID DEFAULT gen_random_uuid(),
  payment_type TEXT DEFAULT 'pix' CHECK (payment_type IN ('link', 'pix')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), NEW.email);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies
-- user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admin can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- servers
CREATE POLICY "Users manage own servers" ON public.servers FOR ALL USING (auth.uid() = user_id);

-- plans
CREATE POLICY "Users manage own plans" ON public.plans FOR ALL USING (auth.uid() = user_id);

-- clients
CREATE POLICY "Users manage own clients" ON public.clients FOR ALL USING (auth.uid() = user_id);
