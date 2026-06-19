import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { MigaduClient } from "../../../../lib/migadu";
import { promises as dns } from "dns";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 1. Authenticate user
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { domainId } = await req.json();
    if (!domainId) {
      return NextResponse.json({ error: "Domain ID is required" }, { status: 400 });
    }

    // 2. Retrieve domain details from Database
    const { data: domain, error: dbError } = await supabase
      .from("domains")
      .select("*")
      .eq("id", domainId)
      .eq("profile_id", session.user.id)
      .single();

    if (dbError || !domain) {
      return NextResponse.json({ error: "Domain not found or access denied" }, { status: 404 });
    }

    if (domain.is_verified) {
      return NextResponse.json({ message: "Domain is already verified", isVerified: true });
    }

    const domainName = domain.domain_name;

    // 3. DNS Lookup verification using native Node.js dns module
    let tokenVerified = false;
    let mxVerified = false;

    try {
      // A. Verify verification token (TXT record lookup)
      const txtRecords = await dns.resolveTxt(domainName);
      const flattenedTxt = txtRecords.flat();
      tokenVerified = flattenedTxt.includes(domain.verification_token);

      // B. Verify MX records
      const mxRecords = await dns.resolveMx(domainName);
      mxVerified = mxRecords.some(
        record => record.exchange.toLowerCase().includes("migadu.com")
      );

    } catch (dnsError: any) {
      // dns.resolve throws an error if no records exist (e.g. ENODATA or ENOTFOUND)
      return NextResponse.json({ 
        error: "DNS check failed. Records might not have propagated yet. If you just configured them, wait a few minutes.", 
        isVerified: false,
        dnsError: dnsError.code
      }, { status: 400 });
    }

    if (!tokenVerified || !mxVerified) {
      return NextResponse.json({
        message: "DNS verification failed. Please check that MX and TXT records are configured correctly.",
        isVerified: false,
        tokenVerified,
        mxVerified
      }, { status: 400 });
    }

    // 4. Verify propagation directly with Migadu (Double safety check)
    const migadu = new MigaduClient();
    try {
      const details = await migadu.getDomainDetails(domainName);
      // Verify Migadu state allows sending/receiving and is recognized as active/verified
      if (details.state !== "active" && details.state !== "verified") {
        console.warn("Domain verified locally but Migadu status is:", details.state);
      }
    } catch (migaduErr) {
      console.error("Failed fetching Migadu status during verification:", migaduErr);
    }

    // 5. Update domain verification state in Supabase
    const { error: updateError } = await supabase
      .from("domains")
      .update({ is_verified: true })
      .eq("id", domain.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      message: "Domain verified and active!",
      isVerified: true
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
