import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");

    // MP sends different notification formats
    let paymentId: string | null = null;

    if (req.method === "POST") {
      const body = await req.json();
      
      // IPN format
      if (body.type === "payment" && body.data?.id) {
        paymentId = String(body.data.id);
      }
      // Webhook v2 format
      if (body.action === "payment.updated" || body.action === "payment.created") {
        paymentId = String(body.data?.id);
      }
      // Direct ID
      if (body.id && topic === "payment") {
        paymentId = String(body.id);
      }
    }

    if (!paymentId) {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the payment record to get the client's owner MP token
    const { data: paymentRecord } = await supabase
      .from("payments")
      .select("*, clients(user_id, payment_token, plan_id, due_date, plans(duration_months))")
      .eq("mp_payment_id", paymentId)
      .maybeSingle();

    if (!paymentRecord) {
      // Try finding by external_reference - query MP API
      // For now just acknowledge
      return new Response(JSON.stringify({ received: true, note: "payment not found locally" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get MP token from owner
    const userId = paymentRecord.clients?.user_id || paymentRecord.user_id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("mercadopago_access_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile?.mercadopago_access_token) {
      return new Response(JSON.stringify({ error: "No MP token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check payment status on MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${profile.mercadopago_access_token}` },
    });
    const mpData = await mpRes.json();

    // Update local payment record
    await supabase
      .from("payments")
      .update({
        mp_status: mpData.status,
        status: mpData.status === "approved" ? "paid" : mpData.status,
        payment_method: mpData.payment_method_id || paymentRecord.payment_method,
      })
      .eq("id", paymentRecord.id);

    // If approved, extend client due_date
    if (mpData.status === "approved") {
      const client = paymentRecord.clients;
      if (client) {
        const durationMonths = client.plans?.duration_months || 1;
        const currentDue = client.due_date ? new Date(client.due_date + "T12:00:00") : new Date();
        const now = new Date();
        // If current due is in the past, extend from today
        const baseDate = currentDue < now ? now : currentDue;
        baseDate.setMonth(baseDate.getMonth() + durationMonths);
        
        const newDue = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;

        await supabase
          .from("clients")
          .update({ due_date: newDue, is_active: true })
          .eq("payment_token", client.payment_token);
      }
    }

    return new Response(JSON.stringify({ received: true, status: mpData.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
