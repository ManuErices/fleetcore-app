import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { MigaduClient } from "../../../../lib/migadu";

// Use service role key to bypass RLS since this is a server-to-server webhook
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface DomainRow {
  id: string;
  domain_name: string;
}

interface MailboxRow {
  domain_id: string;
  local_part: string;
}

/**
 * Helper to update Migadu access permissions for all mailboxes belonging to a profile ID.
 */
async function toggleProfileMailboxesState(profileId: string, active: boolean) {
  const migadu = new MigaduClient();

  // 1. Get all domains for the user
  const { data: domains, error: domainErr } = (await supabaseAdmin
    .from("domains")
    .select("id, domain_name")
    .eq("profile_id", profileId)) as { data: DomainRow[] | null; error: any };

  if (domainErr || !domains || domains.length === 0) return;

  // 2. Get all mailboxes for these domains
  const domainIds = domains.map((d: DomainRow) => d.id);
  const { data: mailboxes, error: mailErr } = (await supabaseAdmin
    .from("mailboxes")
    .select("domain_id, local_part")
    .in("domain_id", domainIds)) as { data: MailboxRow[] | null; error: any };

  if (mailErr || !mailboxes || mailboxes.length === 0) return;

  // Create mapping for domains fast lookup
  const domainMap = new Map<string, string>(domains.map((d: DomainRow) => [d.id, d.domain_name]));

  // 3. Update each mailbox in Migadu (batch update sequentially to avoid API rate limits)
  const permissions = {
    may_receive: active,
    may_send: active,
    may_access_imap: active,
    may_access_pop3: active
  };

  for (const mb of mailboxes) {
    const domainName = domainMap.get(mb.domain_id);
    if (domainName) {
      try {
        await migadu.updateMailboxPermissions(domainName, mb.local_part, permissions);
        console.log(`Successfully toggled mailbox ${mb.local_part}@${domainName} active=${active}`);
      } catch (err) {
        console.error(`Failed toggling mailbox ${mb.local_part}@${domainName}:`, err);
      }
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const provider = req.nextUrl.searchParams.get("provider"); // e.g., ?provider=mercado_pago or ?provider=fintoc
    const payload = await req.json();

    let subscriptionId = "";
    let eventType = "";
    let newStatus: "active" | "paused" | "cancelled" = "active";
    let nextBillingDate: string | null = null;

    // ==========================================
    // MERCADO PAGO HANDLER
    // ==========================================
    if (provider === "mercado_pago") {
      // Basic signature check: verify request secret key if set
      const secret = req.headers.get("x-signature-token");
      if (process.env.MERCADO_PAGO_WEBHOOK_SECRET && secret !== process.env.MERCADO_PAGO_WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Invalid MP Webhook Signature" }, { status: 401 });
      }

      eventType = payload.action || payload.type;
      
      // Subscription updates are sent under preapproval object
      if (payload.data && payload.data.id) {
        subscriptionId = payload.data.id;
        
        // Fetch full subscription info from MP API if payload is minimal
        const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
          headers: { Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}` }
        });
        
        if (mpRes.ok) {
          const subscriptionData = await mpRes.json();
          // MP Statuses: authorized (active), paused, cancelled, pending
          if (subscriptionData.status === "authorized") {
            newStatus = "active";
          } else if (subscriptionData.status === "paused") {
            newStatus = "paused";
          } else {
            newStatus = "cancelled";
          }
          nextBillingDate = subscriptionData.next_payment_date || null;
        }
      }
    } 
    // ==========================================
    // FINTOC HANDLER
    // ==========================================
    else if (provider === "fintoc") {
      // Verify signature using crypto
      const fintocSignature = req.headers.get("x-fintoc-signature");
      if (!fintocSignature) {
        return NextResponse.json({ error: "Missing Fintoc signature" }, { status: 401 });
      }

      // In production, verify the webhook payload signature:
      // const crypto = require('crypto');
      // const computedSignature = crypto.createHmac('sha256', process.env.FINTOC_WEBHOOK_SECRET)
      //   .update(JSON.stringify(payload))
      //   .digest('hex');
      // if (computedSignature !== fintocSignature) return error...

      eventType = payload.type;
      
      if (payload.data && payload.data.id) {
        subscriptionId = payload.data.id; // subscription ID from fintoc
        
        // Fintoc events: link.credentials_changed, subscription.created, subscription.paused, subscription.cancelled
        if (eventType === "subscription.created" || eventType === "subscription.paid") {
          newStatus = "active";
        } else if (eventType === "subscription.paused") {
          newStatus = "paused";
        } else if (eventType === "subscription.cancelled" || eventType === "subscription.failed") {
          newStatus = "cancelled";
        }
        nextBillingDate = payload.data.next_billing_date || null;
      }
    } 
    
    else {
      return NextResponse.json({ error: "Unknown billing provider" }, { status: 400 });
    }

    if (!subscriptionId) {
      return NextResponse.json({ message: "Webhook accepted, but no subscription ID identified" }, { status: 200 });
    }

    // 1. Fetch Subscription from Database
    const { data: dbSubscription, error: fetchErr } = await supabaseAdmin
      .from("subscriptions")
      .select("profile_id, status")
      .eq("subscription_id", subscriptionId)
      .single();

    if (fetchErr || !dbSubscription) {
      console.error(`Subscription ${subscriptionId} not found in DB:`, fetchErr);
      return NextResponse.json({ error: "Subscription reference not found" }, { status: 404 });
    }

    const previousStatus = dbSubscription.status;

    // 2. Update status in Database
    const { error: updateErr } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: newStatus,
        current_period_end: nextBillingDate ? new Date(nextBillingDate) : null,
        updated_at: new Date()
      })
      .eq("subscription_id", subscriptionId);

    if (updateErr) {
      console.error("Database update failed for webhook:", updateErr);
      return NextResponse.json({ error: "Database update failure" }, { status: 500 });
    }

    // 3. Suspend / Reactivate Mailboxes in Migadu if state changed
    if (newStatus !== previousStatus) {
      if (newStatus === "active" && previousStatus !== "active") {
        // Reactivate accounts
        await toggleProfileMailboxesState(dbSubscription.profile_id, true);
      } else if (newStatus === "paused" || newStatus === "cancelled") {
        // Suspend accounts (disable send/receive/IMAP/POP3)
        await toggleProfileMailboxesState(dbSubscription.profile_id, false);
      }
    }

    return NextResponse.json({ received: true, statusUpdatedTo: newStatus });

  } catch (error: any) {
    console.error("Webhook route error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
