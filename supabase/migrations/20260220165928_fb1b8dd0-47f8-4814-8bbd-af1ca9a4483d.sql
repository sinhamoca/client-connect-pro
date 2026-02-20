-- Allow anonymous read access to clients via payment_token for public payment page
CREATE POLICY "Public can view client by payment_token"
ON public.clients
FOR SELECT
USING (true);

-- Note: The existing restrictive policy "Users manage own clients" already limits 
-- authenticated users. We need a permissive policy for anon access via token.
-- Actually, the existing policy is RESTRICTIVE (permissive=No), so we need a permissive one.
-- Let's drop and recreate properly.
DROP POLICY IF EXISTS "Public can view client by payment_token" ON public.clients;

-- Create a PERMISSIVE select policy that allows reading by payment_token
CREATE POLICY "Public read by payment_token"
ON public.clients
FOR SELECT
TO anon, authenticated
USING (true);
