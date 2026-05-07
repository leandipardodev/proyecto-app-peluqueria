import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const stateParam = requestUrl.searchParams.get("state");

  if (!code) {
    // Extract shopSlug from state if possible
    let shopSlug = 'kmln';
    if (stateParam) {
      try {
        const state = JSON.parse(decodeURIComponent(stateParam));
        shopSlug = state.shopSlug || 'kmln';
      } catch {}
    }
    const errorUrl = new URL(`/book/${shopSlug}`, request.url);
    errorUrl.searchParams.set("error", "No+se+recibió+el+código+de+Google");
    return NextResponse.redirect(errorUrl);
  }

  // Parse state if it exists (contains booking data)
  let shopSlug: string | null = null;
  let serviceId: string | null = null;
  let staffId: string | null = null;
  let appointmentDate: string | null = null;
  let appointmentTime: string | null = null;

  if (stateParam) {
    try {
      const state = JSON.parse(decodeURIComponent(stateParam));
      shopSlug = state.shopSlug || null;
      serviceId = state.serviceId || null;
      staffId = state.staffId || null;
      appointmentDate = state.date || null;
      appointmentTime = state.time || null;
    } catch {
      // Invalid state, ignore
    }
  }

  // If we have a serviceId from public booking, redirect to client book page
  // to complete the booking with date/time
  if (serviceId) {
    const bookUrl = new URL("/client/book", request.url);
    bookUrl.searchParams.set("serviceId", serviceId);
    if (staffId) {
      bookUrl.searchParams.set("staffId", staffId);
    }
    const response = NextResponse.redirect(bookUrl);

    // Create Supabase client to handle the session
    const supabase = createServerClient(
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

    // Exchange code for session
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
      );
    }

    // Get the user that just signed in
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
      .single();

    // If no profile exists, create one as customer
    if (!existingProfile) {
      let shopId: string | null = null;
      if (shopSlug) {
        const { data: shop } = await supabase
          .from("shops")
          .select("id")
          .eq("slug", shopSlug)
          .single();
        shopId = shop?.id || null;
      }

      await supabase.from("user_profiles").insert({
        user_id: user.id,
        shop_id: shopId,
        name: user.user_metadata?.full_name || user.email || "Cliente",
        email: user.email || "",
        role: "customer",
      });
    }

    return response;
  }

  // Default redirect to client appointments
  const response = NextResponse.redirect(
    new URL("/client/appointments", request.url)
  );

  // Create Supabase client with proper cookie handling for PKCE
  const supabase = createServerClient(
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

  // Exchange code for session
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  // Get the user that just signed in
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
    .single();

  // If no profile exists, create one as customer
  if (!existingProfile) {
    let shopId: string | null = null;
    if (shopSlug) {
      const { data: shop } = await supabase
        .from("shops")
        .select("id")
        .eq("slug", shopSlug)
        .single();
      shopId = shop?.id || null;
    }

    await supabase.from("user_profiles").insert({
      user_id: user.id,
      shop_id: shopId,
      name: user.user_metadata?.full_name || user.email || "Cliente",
      email: user.email || "",
      role: "customer",
    });
  }

  return response;
}
