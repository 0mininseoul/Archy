import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Cookie name for language preference
const LOCALE_COOKIE = "archy_locale";
const ONBOARDED_CACHE_COOKIE = "archy_onboarded";

// 30 days in seconds for persistent login
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const ONBOARDED_CACHE_MAX_AGE = 60 * 10; // 10 minutes
const WITHDRAW_COMPLETE_PATH = "/dashboard/settings/contact/withdraw/complete";
const PROTECTED_ROUTES = ["/dashboard", "/onboarding"];

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

// Public pages that don't need authentication or session check
// Skip auth for these to significantly improve TTFB
const PUBLIC_PAGES = ["/", "/privacy", "/terms", "/auth/auth-code-error"];
const MIDDLEWARE_DEBUG_ENABLED = process.env.MIDDLEWARE_DEBUG_LOGS === "true";

function debugLog(...args: unknown[]) {
  if (MIDDLEWARE_DEBUG_ENABLED) {
    console.log(...args);
  }
}

function addServerTiming(timings: string[], name: string, startedAt: number) {
  const duration = Math.max(0, performance.now() - startedAt);
  timings.push(`${name};dur=${duration.toFixed(1)}`);
}

function applyServerTiming(response: NextResponse, timings: string[]) {
  if (timings.length === 0) return;

  const existing = response.headers.get("Server-Timing");
  const timingValue = timings.join(", ");
  response.headers.set(
    "Server-Timing",
    existing ? `${existing}, ${timingValue}` : timingValue
  );
}

function setLocaleCookieIfMissing(request: NextRequest, response: NextResponse) {
  const existingLocaleCookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (existingLocaleCookie) return;

  const detectedLocale = detectLocale(request);
  response.cookies.set(LOCALE_COOKIE, detectedLocale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  debugLog("[Middleware] Set locale cookie to:", detectedLocale);
}

function setOnboardedCacheCookie(response: NextResponse, isOnboarded: boolean) {
  response.cookies.set(ONBOARDED_CACHE_COOKIE, isOnboarded ? "1" : "0", {
    path: "/",
    maxAge: ONBOARDED_CACHE_MAX_AGE,
    sameSite: "lax",
  });
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const timings: string[] = [];
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );
  const isWithdrawComplete = pathname === WITHDRAW_COMPLETE_PATH;

  // Fast path for public/non-protected pages - skip Supabase auth check entirely
  if (PUBLIC_PAGES.includes(pathname) || !isProtectedRoute || isWithdrawComplete) {
    const response = NextResponse.next({ request });
    setLocaleCookieIfMissing(request, response);
    applyServerTiming(response, timings);
    return response;
  }

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

  // Refresh session only for protected page requests
  const authStart = performance.now();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  addServerTiming(timings, "auth", authStart);

  debugLog("[Middleware] Path:", request.nextUrl.pathname);
  debugLog("[Middleware] User:", user?.id || "No user");
  debugLog(
    "[Middleware] Cookies:",
    request.cookies
      .getAll()
      .map((cookie) => cookie.name)
      .filter((name) => name.includes("supabase") || name.startsWith("sb-"))
  );

  if (isProtectedRoute && !isWithdrawComplete && !user) {
    debugLog("[Middleware] Redirecting to home - no user on protected route");
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const redirectResponse = NextResponse.redirect(url);
    setLocaleCookieIfMissing(request, redirectResponse);
    applyServerTiming(redirectResponse, timings);
    return redirectResponse;
  }

  // If authenticated user tries to access exact /onboarding,
  // check if already onboarded (with short cookie cache).
  if (user && pathname === "/onboarding") {
    const onboardingCache = request.cookies.get(ONBOARDED_CACHE_COOKIE)?.value;
    const isCachedOnboarded = onboardingCache === "1";

    if (isCachedOnboarded) {
      debugLog("[Middleware] Onboarding cache hit (onboarded), redirecting to dashboard");
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      const redirectResponse = NextResponse.redirect(url);
      setOnboardedCacheCookie(redirectResponse, true);
      setLocaleCookieIfMissing(request, redirectResponse);
      applyServerTiming(redirectResponse, timings);
      return redirectResponse;
    }

    // cache miss only: query users.is_onboarded
    if (onboardingCache !== "0") {
      const onboardingCheckStart = performance.now();
      const { data: userData } = await supabase
        .from("users")
        .select("is_onboarded")
        .eq("id", user.id)
        .single();
      addServerTiming(timings, "onboarding_check", onboardingCheckStart);

      if (typeof userData?.is_onboarded === "boolean") {
        setOnboardedCacheCookie(supabaseResponse, userData.is_onboarded);
      }

      if (userData?.is_onboarded) {
        debugLog("[Middleware] User already onboarded, redirecting to dashboard");
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        const redirectResponse = NextResponse.redirect(url);
        setOnboardedCacheCookie(redirectResponse, true);
        setLocaleCookieIfMissing(request, redirectResponse);
        applyServerTiming(redirectResponse, timings);
        return redirectResponse;
      }
    }
  }

  setLocaleCookieIfMissing(request, supabaseResponse);
  applyServerTiming(supabaseResponse, timings);
  return supabaseResponse;
}
