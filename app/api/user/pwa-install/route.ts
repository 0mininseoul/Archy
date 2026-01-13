import { withAuth, successResponse, errorResponse } from "@/lib/api";

export const runtime = "edge";

// POST /api/user/pwa-install - Record PWA installation
export const POST = withAuth(async ({ user, supabase }) => {
    // Check if already installed (pwa_installed_at is not null)
    const { data: existingUser } = await supabase
        .from("users")
        .select("pwa_installed_at")
        .eq("id", user.id)
        .single();

    // If already installed, return success without updating
    if (existingUser?.pwa_installed_at) {
        return successResponse({
            message: "PWA already installed",
            installed_at: existingUser.pwa_installed_at,
        });
    }

    // Record the installation time
    const now = new Date().toISOString();
    const { error } = await supabase
        .from("users")
        .update({ pwa_installed_at: now })
        .eq("id", user.id);

    if (error) {
        console.error("[PWA Install] Error recording installation:", error);
        return errorResponse("Failed to record PWA installation", 500);
    }

    return successResponse({
        message: "PWA installation recorded",
        installed_at: now,
    });
});
