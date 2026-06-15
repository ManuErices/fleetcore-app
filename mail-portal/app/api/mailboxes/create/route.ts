import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { MigaduClient } from "../../../../lib/migadu";

// Plan quotas limit configurations (based on user tier identifiers)
const MAX_MAILBOX_LIMITS: Record<string, number> = {
  basic_plan: 5,
  growth_plan: 15,
  enterprise_plan: 100
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 1. Authenticate User
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { domainId, localPart, password, quotaMb } = await req.json();
    if (!domainId || !localPart) {
      return NextResponse.json({ error: "Domain ID and Local Part are required" }, { status: 400 });
    }

    // Basic local_part validation
    const localPartRegex = /^[a-z0-9._%+-]+$/i;
    if (!localPartRegex.test(localPart)) {
      return NextResponse.json({ error: "Invalid local part format" }, { status: 400 });
    }

    // 2. Validate Domain Ownership and Status
    const { data: domain, error: domainError } = await supabase
      .from("domains")
      .select("*")
      .eq("id", domainId)
      .eq("profile_id", session.user.id)
      .single();

    if (domainError || !domain) {
      return NextResponse.json({ error: "Domain not found or unauthorized" }, { status: 404 });
    }

    if (!domain.is_verified) {
      return NextResponse.json({ error: "Domain must be verified before creating mailboxes" }, { status: 400 });
    }

    // 3. Verify Subscription Status and Limits
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("profile_id", session.user.id)
      .single();

    if (subError || !subscription) {
      return NextResponse.json({ error: "Active subscription is required to create mailboxes" }, { status: 403 });
    }

    if (subscription.status !== "active") {
      return NextResponse.json({ 
        error: `Subscription is currently ${subscription.status}. Mailbox creation is locked.` 
      }, { status: 403 });
    }

    // Check expiration date
    if (subscription.current_period_end && new Date(subscription.current_period_end) < new Date()) {
      return NextResponse.json({ error: "Subscription has expired" }, { status: 403 });
    }

    // 4. Check Plan Limits (Mailbox count limit)
    // Query count of mailboxes from the DB belonging to the user's domains
    const { data: userDomains, error: domainsError } = await supabase
      .from("domains")
      .select("id")
      .eq("profile_id", session.user.id);

    if (domainsError || !userDomains) {
      return NextResponse.json({ error: domainsError?.message || "Failed to retrieve user domains for limit checking" }, { status: 500 });
    }

    const userDomainIds = userDomains.map((d: any) => d.id);
    let mailboxCount = 0;

    if (userDomainIds.length > 0) {
      const { count, error: countError } = await supabase
        .from("mailboxes")
        .select("id", { count: "exact", head: true })
        .in("domain_id", userDomainIds);

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }
      mailboxCount = count || 0;
    }

    // Fetch the limit. Defaulting to standard 5 mailboxes limit if plan is unmapped.
    const userPlanLimit = MAX_MAILBOX_LIMITS[subscription.subscription_id] || 5; 
    if (mailboxCount >= userPlanLimit) {
      return NextResponse.json({ 
        error: `Mailbox limit reached (${userPlanLimit} mailboxes allowed on your plan). Please upgrade your subscription.` 
      }, { status: 403 });
    }

    const cleanLocalPart = localPart.toLowerCase();

    // 5. Create Mailbox on Migadu
    const migadu = new MigaduClient();
    try {
      await migadu.createMailbox(domain.domain_name, cleanLocalPart, password, quotaMb || 1024);
    } catch (migaduError: any) {
      return NextResponse.json(
        { error: `Migadu mailbox creation failed: ${migaduError.message}` },
        { status: 502 }
      );
    }

    // 6. Record in Database
    const { data: dbMailbox, error: createError } = await supabase
      .from("mailboxes")
      .insert({
        domain_id: domain.id,
        local_part: cleanLocalPart,
        storage_quota_mb: quotaMb || 1024
      })
      .select()
      .single();

    if (createError) {
      // Rollback Migadu mailbox on database save failure
      try {
        await migadu.deleteMailbox(domain.domain_name, cleanLocalPart);
      } catch (rollbackError) {
        console.error("Critical: Database insert failed and Migadu rollback failed:", rollbackError);
      }
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    return NextResponse.json({
      message: "Mailbox created successfully!",
      mailbox: dbMailbox,
      emailAddress: `${cleanLocalPart}@${domain.domain_name}`
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
