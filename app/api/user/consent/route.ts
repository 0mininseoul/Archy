import { withAuth, successResponse, errorResponse } from "@/lib/api";

const TERMS_VERSION = "2025-01-01";
const PRIVACY_VERSION = "2025-01-12";

interface ConsentPayload {
  age14: boolean;
  terms: boolean;
  privacy: boolean;
  serviceQualityOptIn?: boolean;
  marketingOptIn?: boolean;
}

interface ConsentResponse {
  saved: boolean;
}

export const POST = withAuth<ConsentResponse>(async ({ user, supabase, request }) => {
  const body = (await request!.json()) as ConsentPayload;

  if (!body || body.age14 !== true || body.terms !== true || body.privacy !== true) {
    return errorResponse("Required consents are missing", 400);
  }

  const now = new Date().toISOString();
  const serviceQualityOptIn = Boolean(body.serviceQualityOptIn);
  const marketingOptIn = Boolean(body.marketingOptIn);

  const xForwardedFor = request?.headers.get("x-forwarded-for") || "";
  const ipAddress = xForwardedFor.split(",")[0]?.trim() || null;
  const userAgent = request?.headers.get("user-agent") || null;

  const { error: userUpdateError } = await supabase
    .from("users")
    .update({
      age_14_confirmed_at: now,
      terms_agreed_at: now,
      terms_version: TERMS_VERSION,
      privacy_agreed_at: now,
      privacy_version: PRIVACY_VERSION,
      service_quality_opt_in: serviceQualityOptIn,
      marketing_opt_in: marketingOptIn,
      consented_at: now,
    })
    .eq("id", user.id);

  if (userUpdateError) {
    return errorResponse("Failed to save consent snapshot", 500);
  }

  const { error: logInsertError } = await supabase.from("user_consent_logs").insert({
    user_id: user.id,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    age_14_confirmed: true,
    service_quality_opt_in: serviceQualityOptIn,
    marketing_opt_in: marketingOptIn,
    ip_address: ipAddress,
    user_agent: userAgent,
    consented_at: now,
  });

  if (logInsertError) {
    return errorResponse("Failed to write consent log", 500);
  }

  return successResponse({ saved: true });
});
