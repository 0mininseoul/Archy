import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// 30 days in seconds for persistent login
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next");
  const locale = searchParams.get("locale"); // Get locale from query params

  if (code) {
    const cookieStore = await cookies();

    // Store cookies to set on redirect response
    const cookiesToSetOnResponse: { name: string; value: string; options: Record<string, unknown> }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              // PWA 자동로그인을 위해 쿠키 옵션 강화
              const enhancedOptions = {
                ...options,
                maxAge: COOKIE_MAX_AGE,
                sameSite: "lax" as const,
                secure: process.env.NODE_ENV === "production",
                path: "/",
              };
              cookieStore.set(name, value, enhancedOptions);
              // Also save for redirect response
              cookiesToSetOnResponse.push({ name, value, options: enhancedOptions });
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Error exchanging code for session:", error);
      const errorUrl = new URL("/auth/auth-code-error", origin);
      errorUrl.searchParams.set("message", error.message);
      return NextResponse.redirect(errorUrl);
    }

    if (!data.session) {
      console.error("No session returned after code exchange");
      const errorUrl = new URL("/auth/auth-code-error", origin);
      errorUrl.searchParams.set("message", "No session created");
      return NextResponse.redirect(errorUrl);
    }

    console.log("[Auth Callback] Session created:", data.session.user.id);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let isNewUser = false;

    if (user) {
      // Check if user exists in our users table
      const { data: existingUser, error: fetchError } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        // PGRST116 is "not found" error, which is expected for new users
        console.error("Error fetching user:", fetchError);
      }

      // If user doesn't exist, create them (new user)
      if (!existingUser) {
        isNewUser = true;
        const { error: insertError } = await supabase.from("users").insert({
          id: user.id,
          email: user.email!,
          google_id: user.user_metadata.sub,
          is_onboarded: false, // New users haven't completed onboarding
        });

        if (insertError) {
          console.error("Error creating user:", insertError);
          const errorUrl = new URL("/auth/auth-code-error", origin);
          errorUrl.searchParams.set("message", "Failed to create user profile");
          return NextResponse.redirect(errorUrl);
        }
        console.log("[Auth Callback] New user created:", user.id);
      }

      // Determine redirect destination based on user status
      // Only override if next is not explicitly set
      if (!next) {
        if (isNewUser) {
          // Case B: New user -> Onboarding page
          next = "/onboarding";
          console.log("[Auth Callback] New user, redirecting to onboarding");
        } else if (existingUser?.is_onboarded) {
          // Case A: Existing user who completed onboarding -> Dashboard
          next = "/dashboard";
          console.log("[Auth Callback] Existing user (onboarded), redirecting to dashboard");
        } else {
          // Existing user but hasn't completed onboarding -> Onboarding
          next = "/onboarding";
          console.log("[Auth Callback] Existing user (not onboarded), redirecting to onboarding");
        }
      }
    }

    // Prefer origin over NEXT_PUBLIC_APP_URL to maintain locale and avoid cross-domain redirects
    // Only use NEXT_PUBLIC_APP_URL if origin is not available (shouldn't happen in practice)
    const appUrl = origin || process.env.NEXT_PUBLIC_APP_URL;
    const redirectUrl = new URL(next || "/", appUrl);

    console.log("[Auth Callback] Redirecting to:", redirectUrl.toString());
    console.log("[Auth Callback] Setting cookies:", cookiesToSetOnResponse.map(c => c.name));

    const response = NextResponse.redirect(redirectUrl);

    // Set session cookies on redirect response
    cookiesToSetOnResponse.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options as Record<string, unknown>);
    });

    // Preserve locale cookie - prefer locale from query params, then existing cookie
    const localeToSet = locale || cookieStore.get("flownote_locale")?.value || "ko";
    if (localeToSet === "ko" || localeToSet === "en") {
      response.cookies.set("flownote_locale", localeToSet, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: "lax",
      });
      console.log("[Auth Callback] Set locale cookie:", localeToSet, locale ? "(from query param)" : "(from existing cookie)");
    }

    return response;
  }

  // Return the user to an error page with instructions
  const errorUrl = new URL("/auth/auth-code-error", origin);
  errorUrl.searchParams.set("message", "No authorization code provided");
  return NextResponse.redirect(errorUrl);
}
