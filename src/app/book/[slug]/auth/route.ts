import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const slug = requestUrl.pathname.split("/")[2];
  const stateParam = requestUrl.searchParams.get("state");

  // Create the response that will redirect to Google
  const response = NextResponse.redirect(
    new URL(`/book/${slug}`, request.url)
  );

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
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, '');
  const redirectTo = `${baseUrl}/auth/callback?state=${stateParam || ""}`;
  
  console.log("Auth route - RedirectTo:", redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  console.log("Auth route - SignIn result:", { data, error });

  if (error) {
    console.error("Auth route - Error:", error);
    const errorUrl = new URL(`/book/${slug}`, request.url);
    errorUrl.searchParams.set("error", "Error al conectar con Google. Intenta nuevamente.");
    return NextResponse.redirect(errorUrl);
  }

  if (!data.url) {
    console.error("Auth route - No redirect URL returned");
    const errorUrl = new URL(`/book/${slug}`, request.url);
    errorUrl.searchParams.set("error", "No se pudo conectar con Google.");
    return NextResponse.redirect(errorUrl);
  }

  console.log("Auth route - Redirecting to Google:", data.url);
  
  // Create final response with Google URL and cookies
  const googleResponse = NextResponse.redirect(data.url);
  
  // Copy cookies from our response to the Google response
  response.cookies.getAll().forEach(cookie => {
    googleResponse.cookies.set(cookie.name, cookie.value, cookie);
  });
  
  return googleResponse;
}
