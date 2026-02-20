import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { type, data: notifData } = body;

    // Handle IPN notification
    if (type === "payment" && notifData?.id) {
      // Get admin's MP token
      const { data: mpSetting } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "admin_mp_access_token")
        .single();

      if (!mpSetting?.value) {
        console.error("Admin MP token not configured");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // Fetch payment from Mercado Pago
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${notifData.id}`, {
        headers: { Authorization: `Bearer ${mpSetting.value}` },
      });
      const mpPayment = await mpRes.json();

      if (!mpRes.ok) {
        console.error("MP fetch error:", mpPayment);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const externalRef = mpPayment.external_reference;
      if (!externalRef) {
        console.log("No external_reference, skipping");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // Update platform payment record
      const { data: platformPayment } = await supabase
        .from("platform_payments")
        .update({
          mp_payment_id: String(notifData.id),
          mp_status: mpPayment.status,
          status: mpPayment.status === "approved" ? "paid" : mpPayment.status,
        })
        .eq("id", externalRef)
        .select("*, platform_plans(*)")
        .single();

      if (!platformPayment) {
        console.log("Platform payment not found for ref:", externalRef);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // If approved, extend user's subscription
      if (mpPayment.status === "approved" && platformPayment.platform_plans) {
        const plan = platformPayment.platform_plans;
        const userId = platformPayment.user_id;

        // Get current subscription_end
        const { data: profile } = await supabase
          .from("profiles")
          .select("subscription_end, max_clients")
          .eq("user_id", userId)
          .single();

        const now = new Date();
        let baseDate = now;
        if (profile?.subscription_end) {
          const subEnd = new Date(profile.subscription_end);
          if (subEnd > now) baseDate = subEnd;
        }

        const newEnd = new Date(baseDate);
        newEnd.setDate(newEnd.getDate() + plan.duration_days);

        await supabase
          .from("profiles")
          .update({
            subscription_end: newEnd.toISOString(),
            is_active: true,
            max_clients: plan.max_clients,
          })
          .eq("user_id", userId);

        console.log(`[platform-webhook] User ${userId} subscription extended to ${newEnd.toISOString()}`);
      }
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("Webhook error:", error.message);
    return new Response("OK", { status: 200, headers: corsHeaders });
  }
});
