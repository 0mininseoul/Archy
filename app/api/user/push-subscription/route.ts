import { withAuth, successResponse, errorResponse, withErrorHandling } from "@/lib/api";
import { getVapidPublicKey } from "@/lib/services/push";
import { PushSubscriptionData } from "@/lib/types/database";

// GET /api/user/push-subscription - Get VAPID public key (no auth required)
export const GET = withErrorHandling<{ publicKey: string }>(async () => {
  const publicKey = getVapidPublicKey();

  if (!publicKey) {
    return errorResponse("Push notifications not configured", 503);
  }

  return successResponse({ publicKey });
});

// POST /api/user/push-subscription - Save push subscription
export const POST = withAuth<{ subscribed: boolean }>(async ({ user, supabase, request }) => {
  const { subscription } = await request!.json() as { subscription: PushSubscriptionData };

  if (!subscription || !subscription.endpoint) {
    return errorResponse("Invalid subscription", 400);
  }

  const { error } = await supabase
    .from("users")
    .update({
      push_subscription: subscription,
      push_enabled: true,
    })
    .eq("id", user.id);

  if (error) {
    return errorResponse("Failed to save subscription", 500);
  }

  return successResponse({ subscribed: true });
});

// DELETE /api/user/push-subscription - Delete push subscription
export const DELETE = withAuth<{ unsubscribed: boolean }>(async ({ user, supabase }) => {
  const { error } = await supabase
    .from("users")
    .update({
      push_subscription: null,
      push_enabled: false,
    })
    .eq("id", user.id);

  if (error) {
    return errorResponse("Failed to delete subscription", 500);
  }

  return successResponse({ unsubscribed: true });
});
