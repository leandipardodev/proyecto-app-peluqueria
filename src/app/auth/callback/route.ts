import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function createSupabaseClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "").map(
            ({ name, value }) => ({
              name,
              value: value ?? "",
            })
          );
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}

function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    }
  );
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const stateParam = requestUrl.searchParams.get("state");

  if (!code) {
    let shopSlug = "kmln";
    if (stateParam) {
      try {
        const state = JSON.parse(decodeURIComponent(stateParam));
        shopSlug = state.shopSlug || "kmln";
      } catch {}
    }
    const errorUrl = new URL(`/book/${shopSlug}`, request.url);
    errorUrl.searchParams.set("error", "No+se+recibió+el+código+de+Google");
    return NextResponse.redirect(errorUrl);
  }

  let shopSlug: string | null = null;
  let serviceId: string | null = null;
  let staffId: string | null = null;
  const nextPath = requestUrl.searchParams.get("next");

  if (stateParam) {
    try {
      const state = JSON.parse(decodeURIComponent(stateParam));
      shopSlug = state.shopSlug || null;
      serviceId = state.serviceId || null;
      staffId = state.staffId || null;
    } catch {}
  }

  const response = NextResponse.redirect(
    nextPath && nextPath.startsWith("/")
      ? new URL(nextPath, request.url)
      : serviceId
      ? new URL(`/client/book?serviceId=${serviceId}${staffId ? `&staffId=${staffId}` : ""}`, request.url)
      : shopSlug
        ? new URL(`/book/${shopSlug}`, request.url)
        : new URL("/client/appointments", request.url)
  );

  const supabase = createSupabaseClient(request, response);

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(
      new URL("/login?error=No+se+pudo+obtener+el+usuario", request.url)
    );
  }

  // Check if user already has a profile
  const { data: existingProfile } = await supabase
    .from("user_profiles")
    .select("user_id, shop_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existingProfile) {
    let shopId: string | null = null;
    if (shopSlug) {
      const adminClient = createAdminClient();
      const { data: shop } = await adminClient
        .from("shops")
        .select("id")
        .eq("slug", shopSlug)
        .single();
      shopId = shop?.id || null;
    }

    // Use service role key to bypass RLS (chicken-and-egg: new user has no profile yet)
    const adminClient = createAdminClient();
    const { error: profileError } = await adminClient
      .from("user_profiles")
      .insert({
        user_id: user.id,
        shop_id: shopId,
        name: user.user_metadata?.full_name || user.email || "Cliente",
        email: user.email || "",
        role: "customer",
      });

    if (profileError) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(profileError.message)}`, request.url)
      );
    }

    const { error: customerError } = await adminClient
      .from("customers")
      .upsert({
        id: user.id,
        shop_id: shopId,
        name: user.user_metadata?.full_name || user.email || "Cliente",
        email: user.email || "",
        phone: null,
      });

    if (customerError) {
      try { await adminClient.from("user_profiles").delete().eq("user_id", user.id); } catch {}
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(customerError.message)}`, request.url)
      );
    }
  } else if (existingProfile.shop_id) {
    const adminClient = createAdminClient();
    await adminClient.from("customers").upsert({
      id: user.id,
      shop_id: existingProfile.shop_id,
      name: user.user_metadata?.full_name || user.email || "Cliente",
      email: user.email || "",
      phone: null,
    });
  }

  return response;
}
