
import { createClient } from "@/lib/supabase/server";
import { successResponse, errorResponse, withAuth } from "@/lib/api";

export const DELETE = withAuth(async ({ user, supabase }) => {
    const { error } = await supabase
        .from("users")
        .update({ slack_access_token: null })
        .eq("id", user.id);

    if (error) {
        return errorResponse(error.message, 500);
    }

    return successResponse({ message: "Slack disconnected successfully" });
});
