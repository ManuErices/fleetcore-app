import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { MigaduClient } from "../../../../lib/migadu";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 1. Authenticate user
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { domainName } = await req.json();
    if (!domainName) {
      return NextResponse.json({ error: "Domain name is required" }, { status: 400 });
    }

    // Basic domain validation regex
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}$/i;
    if (!domainRegex.test(domainName)) {
      return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
    }

    const lowerDomain = domainName.toLowerCase();

    // 2. Generate a unique verification token for TXT record verification
    const verificationToken = `migadu-verification-token=${crypto.randomBytes(16).toString("hex")}`;

    // 3. Insert domain into Supabase first (transaction/isolation purposes)
    const { data: dbDomain, error: dbError } = await supabase
      .from("domains")
      .insert({
        profile_id: session.user.id,
        domain_name: lowerDomain,
        verification_token: verificationToken,
        is_verified: false
      })
      .select()
      .single();

    if (dbError) {
      if (dbError.code === "23505") { // Unique key violation
        return NextResponse.json({ error: "Domain already registered" }, { status: 409 });
      }
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // 4. Register domain on Migadu
    const migadu = new MigaduClient();
    try {
      await migadu.createDomain(lowerDomain);
    } catch (migaduError: any) {
      // Rollback database domain registration if Migadu creation fails
      await supabase.from("domains").delete().eq("id", dbDomain.id);
      return NextResponse.json(
        { error: `Migadu registration failed: ${migaduError.message}` },
        { status: 502 }
      );
    }

    // 5. Construct and return required DNS records for the client
    const dnsRecords = {
      verification: {
        type: "TXT",
        host: "@",
        value: verificationToken,
        ttl: 3600
      },
      mx: [
        { type: "MX", host: "@", value: "aspmx1.migadu.com.", priority: 10, ttl: 3600 },
        { type: "MX", host: "@", value: "aspmx2.migadu.com.", priority: 20, ttl: 3600 }
      ],
      spf: {
        type: "TXT",
        host: "@",
        value: "v=spf1 include:spf.migadu.com -all",
        ttl: 3600
      },
      dkim: [
        { type: "CNAME", host: "key1._domainkey", value: `key1.${lowerDomain}._domainkey.migadu.com.`, ttl: 3600 },
        { type: "CNAME", host: "key2._domainkey", value: `key2.${lowerDomain}._domainkey.migadu.com.`, ttl: 3600 },
        { type: "CNAME", host: "key3._domainkey", value: `key3.${lowerDomain}._domainkey.migadu.com.`, ttl: 3600 }
      ]
    };

    return NextResponse.json({
      message: "Domain registered successfully. Please configure your DNS settings.",
      domain: dbDomain,
      dnsRecords
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
