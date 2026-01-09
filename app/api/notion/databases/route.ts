import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { getNotionDatabases } from "@/lib/services/notion";

export const runtime = "edge";

interface NotionDatabase {
  id: string;
  title: string;
}

// GET /api/notion/databases - List user's Notion databases
export const GET = withAuth<{ databases: NotionDatabase[] }>(async ({ user, supabase }) => {
  const { data: userData } = await supabase
    .from("users")
    .select("notion_access_token")
    .eq("id", user.id)
    .single();

  if (!userData?.notion_access_token) {
    return errorResponse("Notion not connected", 400);
  }

  const databases = await getNotionDatabases(userData.notion_access_token);

  return successResponse({ databases });
});
