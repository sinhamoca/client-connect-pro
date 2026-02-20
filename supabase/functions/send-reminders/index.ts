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

    // Current time in UTC-3 (Brasília)
    const now = new Date();
    const brasiliaOffset = -3 * 60;
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const brasilia = new Date(utcMs + brasiliaOffset * 60000);

    const currentHour = String(brasilia.getHours()).padStart(2, "0");
    const currentMinute = String(brasilia.getMinutes()).padStart(2, "0");
    const currentTime = `${currentHour}:${currentMinute}`;
    const todayStr = `${brasilia.getFullYear()}-${String(brasilia.getMonth() + 1).padStart(2, "0")}-${String(brasilia.getDate()).padStart(2, "0")}`;

    console.log(`[send-reminders] Running at ${currentTime} Brasília, date: ${todayStr}`);

    // Find active reminders that match current time and haven't been sent today
    const { data: reminders, error: remErr } = await supabase
      .from("reminders")
      .select("*, message_templates(content)")
      .eq("is_active", true)
      .eq("send_time", currentTime)
      .or(`last_sent_date.is.null,last_sent_date.neq.${todayStr}`);

    if (remErr) {
      console.error("[send-reminders] Error fetching reminders:", remErr.message);
      return new Response(JSON.stringify({ error: remErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!reminders || reminders.length === 0) {
      console.log("[send-reminders] No reminders to process at this time");
      return new Response(JSON.stringify({ message: "No reminders to process", time: currentTime }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;

    for (const reminder of reminders) {
      const templateContent = reminder.message_templates?.content;
      if (!templateContent) {
        console.log(`[send-reminders] Reminder "${reminder.name}" has no template, skipping`);
        continue;
      }

      // Calculate target due_date based on days_offset
      const targetDate = new Date(brasilia);
      targetDate.setDate(targetDate.getDate() - reminder.days_offset);
      const targetDueDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;

      // Get user profile for WuzAPI credentials and PIX key
      const { data: profile } = await supabase
        .from("profiles")
        .select("wuzapi_url, wuzapi_token, pix_key, messages_per_minute")
        .eq("user_id", reminder.user_id)
        .single();

      if (!profile?.wuzapi_url || !profile?.wuzapi_token) {
        console.log(`[send-reminders] User ${reminder.user_id} has no WuzAPI config, skipping`);
        continue;
      }

      // Check if WhatsApp is connected
      try {
        const statusRes = await fetch(`${profile.wuzapi_url.replace(/\/+$/, "")}/session/status`, {
          method: "GET",
          headers: { "Content-Type": "application/json", "Token": profile.wuzapi_token },
        });
        const statusData = await statusRes.json();
        if (!statusData?.data?.Connected) {
          console.log(`[send-reminders] WhatsApp not connected for user ${reminder.user_id}, skipping`);
          continue;
        }
      } catch {
        console.log(`[send-reminders] Failed to check WhatsApp status for user ${reminder.user_id}, skipping`);
        continue;
      }

      // Find clients with matching due_date
      const { data: clients } = await supabase
        .from("clients")
        .select("*, plans(name)")
        .eq("user_id", reminder.user_id)
        .eq("is_active", true)
        .eq("due_date", targetDueDate)
        .not("whatsapp_number", "is", null);

      if (!clients || clients.length === 0) {
        console.log(`[send-reminders] No clients with due_date ${targetDueDate} for reminder "${reminder.name}"`);
        // Still mark as sent so we don't re-check
        await supabase.from("reminders").update({ last_sent_date: todayStr }).eq("id", reminder.id);
        continue;
      }

      const delayMs = Math.ceil(60000 / (profile.messages_per_minute || 5));

      for (let i = 0; i < clients.length; i++) {
        const client = clients[i];

        // Build {link_pagamento} based on payment_type
        let linkPagamento = "";
        if (client.payment_type === "pix" && profile.pix_key) {
          linkPagamento = profile.pix_key;
        } else if (client.payment_token) {
          // We need the app URL - use SUPABASE_URL to derive it or use a fallback
          // For link type, we construct the payment URL
          linkPagamento = `https://${Deno.env.get("SUPABASE_URL")?.replace("https://", "").replace(".supabase.co", "")}-preview--*.lovable.app/pay/${client.payment_token}`;
        }

        // Replace template variables
        const dueFormatted = client.due_date
          ? (() => { const [y, m, d] = client.due_date.split("-"); return `${d}/${m}/${y}`; })()
          : "";

        let message = templateContent
          .replace(/\{nome\}/g, client.name || "")
          .replace(/\{vencimento\}/g, dueFormatted)
          .replace(/\{valor\}/g, `R$ ${Number(client.price_value || 0).toFixed(2)}`)
          .replace(/\{plano\}/g, client.plans?.name || "")
          .replace(/\{whatsapp\}/g, client.whatsapp_number || "")
          .replace(/\{link_pagamento\}/g, linkPagamento);

        const phone = client.whatsapp_number.replace(/\D/g, "");

        try {
          await fetch(`${profile.wuzapi_url.replace(/\/+$/, "")}/chat/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Token": profile.wuzapi_token },
            body: JSON.stringify({ Phone: phone, Body: message }),
          });
          totalSent++;
          console.log(`[send-reminders] Sent to ${phone} for reminder "${reminder.name}"`);
        } catch (e) {
          console.error(`[send-reminders] Failed to send to ${phone}:`, e.message);
        }

        // Rate limiting delay (skip on last message)
        if (i < clients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      // Mark reminder as sent today
      await supabase.from("reminders").update({ last_sent_date: todayStr }).eq("id", reminder.id);
      console.log(`[send-reminders] Reminder "${reminder.name}" marked as sent for ${todayStr}`);
    }

    return new Response(JSON.stringify({ 
      message: `Processed ${reminders.length} reminders, sent ${totalSent} messages`,
      time: currentTime,
      date: todayStr,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[send-reminders] Fatal error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
