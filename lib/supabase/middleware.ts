import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Cookie name for language preference
const LOCALE_COOKIE = "flownote_locale";

// Detect locale based on country (Vercel provides x-vercel-ip-country header)
function detectLocale(request: NextRequest): "ko" | "en" {
  // First check if user has a language preference cookie
  const localeCookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (localeCookie === "ko" || localeCookie === "en") {
    return localeCookie;
  }

  // Check Vercel's GeoIP header
  const country = request.headers.get("x-vercel-ip-country");

  // Korean IP -> Korean language
  if (country === "KR") {
    return "ko";
  }

  // All other countries -> English
  // This includes when country is null (local development)
  return country ? "en" : "ko"; // Default to Korean for local dev
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("[Middleware] Path:", request.nextUrl.pathname);
  console.log("[Middleware] User:", user?.id || "No user");
  console.log("[Middleware] Cookies:", request.cookies.getAll().map(c => c.name).filter(n => n.includes('supabase')));

  // Protected routes
  const protectedRoutes = ["/dashboard", "/history", "/settings", "/onboarding"];
  const isProtectedRoute = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  if (isProtectedRoute && !user) {
    console.log("[Middleware] Redirecting to home - no user on protected route");
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Set locale cookie if not already set
  const existingLocaleCookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!existingLocaleCookie) {
    const detectedLocale = detectLocale(request);
    supabaseResponse.cookies.set(LOCALE_COOKIE, detectedLocale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: "lax",
    });
    console.log("[Middleware] Set locale cookie to:", detectedLocale);
  }

  return supabaseResponse;
}
