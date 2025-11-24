import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next");

  if (code) {
    const cookieStore = await cookies();

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
              cookieStore.set(name, value, options);
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

      // If user doesn't exist, create them
      if (!existingUser) {
        const { error: insertError } = await supabase.from("users").insert({
          id: user.id,
          email: user.email!,
          google_id: user.user_metadata.sub,
        });

        if (insertError) {
          console.error("Error creating user:", insertError);
          const errorUrl = new URL("/auth/auth-code-error", origin);
          errorUrl.searchParams.set("message", "Failed to create user profile");
          return NextResponse.redirect(errorUrl);
        }
      }

      // Determine redirect destination based on Notion connection status
      // Only override if next is not explicitly set
      if (!next) {
        if (existingUser?.notion_access_token) {
          next = "/dashboard";
        } else {
          next = "/onboarding";
        }
      }
    }

    const forwardedHost = request.headers.get("x-forwarded-host");
    const isLocalEnv = process.env.NODE_ENV === "development";

    let redirectUrl: string;
    if (isLocalEnv) {
      redirectUrl = `${origin}${next}`;
    } else if (forwardedHost) {
      redirectUrl = `https://${forwardedHost}${next}`;
    } else {
      redirectUrl = `${origin}${next}`;
    }

    console.log("[Auth Callback] Redirecting to:", redirectUrl);
    return NextResponse.redirect(redirectUrl);
  }

  // Return the user to an error page with instructions
  const errorUrl = new URL("/auth/auth-code-error", origin);
  errorUrl.searchParams.set("message", "No authorization code provided");
  return NextResponse.redirect(errorUrl);
}
