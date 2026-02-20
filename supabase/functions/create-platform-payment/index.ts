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
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { plan_id } = await req.json();
    if (!plan_id) {
      return new Response(JSON.stringify({ error: "plan_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the platform plan
    const { data: plan, error: planError } = await supabase
      .from("platform_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Plan not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get admin's MP access token from system_settings
    const { data: mpSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "admin_mp_access_token")
      .single();

    if (!mpSetting?.value) {
      return new Response(JSON.stringify({ error: "Payment system not configured by admin" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mpToken = mpSetting.value;

    // Get user profile for identification
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("user_id", user.id)
      .single();

    // Create platform payment record
    const { data: payment, error: paymentError } = await supabase
      .from("platform_payments")
      .insert({
        user_id: user.id,
        platform_plan_id: plan.id,
        amount: plan.price,
        status: "pending",
      })
      .select("id")
      .single();

    if (paymentError) {
      return new Response(JSON.stringify({ error: paymentError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get webhook URL
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Create MP preference (checkout link)
    const prefRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mpToken}`,
      },
      body: JSON.stringify({
        items: [{
          title: `GestãoPro - ${plan.name}`,
          quantity: 1,
          unit_price: Number(plan.price),
          currency_id: "BRL",
        }],
        payer: {
          email: profile?.email || user.email,
          first_name: profile?.name || "",
        },
        external_reference: payment.id,
        notification_url: `${supabaseUrl}/functions/v1/platform-mp-webhook`,
        back_urls: {
          success: `${supabaseUrl.replace('.supabase.co', '')}/dashboard`,
          failure: `${supabaseUrl.replace('.supabase.co', '')}/dashboard/renew-plan`,
        },
        auto_return: "approved",
      }),
    });

    const prefData = await prefRes.json();

    if (!prefRes.ok) {
      console.error("MP Preference error:", prefData);
      return new Response(JSON.stringify({ error: "Failed to create payment" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      init_point: prefData.init_point,
      payment_id: payment.id,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
