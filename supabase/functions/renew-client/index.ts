import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth check
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { client_id } = await req.json();
    if (!client_id) return new Response(JSON.stringify({ error: "client_id required" }), { status: 400, headers: corsHeaders });

    // Fetch client
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("*, plans!clients_plan_id_fkey(*)")
      .eq("id", client_id)
      .eq("user_id", user.id)
      .single();

    if (!client) return new Response(JSON.stringify({ error: "Client not found" }), { status: 404, headers: corsHeaders });
    if (!client.plan_id || !client.plans) return new Response(JSON.stringify({ error: "Client has no plan" }), { status: 400, headers: corsHeaders });

    const plan = client.plans;
    if (!plan.panel_credential_id) return new Response(JSON.stringify({ error: "Plan has no panel credential" }), { status: 400, headers: corsHeaders });

    // Fetch panel credential
    const { data: cred } = await supabaseAdmin
      .from("panel_credentials")
      .select("*")
      .eq("id", plan.panel_credential_id)
      .single();

    if (!cred) return new Response(JSON.stringify({ error: "Panel credential not found" }), { status: 404, headers: corsHeaders });

    // Fetch global API settings
    const { data: settings } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .in("key", ["renewal_api_url", "renewal_api_key"]);

    const apiUrl = settings?.find(s => s.key === "renewal_api_url")?.value;
    const apiKey = settings?.find(s => s.key === "renewal_api_key")?.value;

    if (!apiUrl || !apiKey) return new Response(JSON.stringify({ error: "Renewal API not configured by admin" }), { status: 500, headers: corsHeaders });

    // Build payload
    const payload: any = {
      provider: cred.provider,
      credentials: { username: cred.username, password: cred.password },
      client_name: client.name,
      months: plan.duration_months,
      telas: plan.num_screens || 1,
    };

    if (client.suffix) payload.suffix = client.suffix;
    if (client.username) payload.client_id = client.username;

    switch (cred.provider) {
      case "sigma":
        payload.sigma_domain = cred.domain;
        payload.sigma_plan_code = plan.package_id;
        break;
      case "koffice":
        payload.koffice_domain = cred.domain;
        payload.client_id = client.username;
        break;
      case "painelfoda":
        payload.painelfoda_domain = cred.domain;
        payload.painelfoda_package_id = plan.package_id;
        break;
      case "rush":
        payload.rush_type = plan.rush_type || "IPTV";
        break;
      case "club":
        payload.client_id = client.username;
        break;
    }

    // Call external API
    const apiResponse = await fetch(`${apiUrl}/renew`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify(payload),
    });

    const result = await apiResponse.json();

    // Log activity
    await supabaseAdmin.from("activity_logs").insert({
      user_id: user.id,
      client_id: client.id,
      type: "renewal",
      status: result.success ? "success" : "error",
      details: result,
    });

    if (result.success) {
      // Update client due_date
      const currentDue = client.due_date ? new Date(client.due_date) : new Date();
      const baseDate = currentDue > new Date() ? currentDue : new Date();
      const newDue = new Date(baseDate.getTime() + plan.duration_months * 30 * 86400000);
      const newDueStr = newDue.toISOString().split("T")[0];

      await supabaseAdmin
        .from("clients")
        .update({ due_date: newDueStr })
        .eq("id", client.id);
    } else {
      // Queue for retry
      await supabaseAdmin.from("renewal_retry_queue").insert({
        user_id: user.id,
        client_id: client.id,
        attempt: 1,
        next_retry_at: new Date(Date.now() + 5 * 60000).toISOString(),
        payload,
        last_error: result.error || "Unknown error",
        status: "pending",
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
