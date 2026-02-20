-- Remove the overly permissive policy - we'll use an edge function instead
DROP POLICY IF EXISTS "Public read by payment_token" ON public.clients;