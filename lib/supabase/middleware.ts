import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Cookie name for language preference
const LOCALE_COOKIE = "flownote_locale";

// 30 days in seconds for persistent login
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

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

  // Default to Korean for all cases
  return "ko";
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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            // PWA 자동로그인을 위해 쿠키 옵션 강화
            supabaseResponse.cookies.set(name, value, {
              ...options,
              maxAge: COOKIE_MAX_AGE,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
              path: "/",
            });
          });
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
  const protectedRoutes = ["/dashboard", "/history", "/settings", "/onboarding", "/recordings"];
  const isProtectedRoute = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  // Exception: Withdrawal complete page should be accessible without auth
  const isWithdrawComplete = request.nextUrl.pathname === "/settings/contact/withdraw/complete";

  if (isProtectedRoute && !isWithdrawComplete && !user) {
    console.log("[Middleware] Redirecting to home - no user on protected route");
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // If authenticated user tries to access /onboarding, check if already onboarded
  // This prevents PWA users from seeing onboarding again after completing it
  if (user && request.nextUrl.pathname.startsWith("/onboarding")) {
    // Query user's onboarding status
    const { data: userData } = await supabase
      .from("users")
      .select("is_onboarded")
      .eq("id", user.id)
      .single();

    if (userData?.is_onboarded) {
      console.log("[Middleware] User already onboarded, redirecting to dashboard");
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
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
