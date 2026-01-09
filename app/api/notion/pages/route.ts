import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { getNotionPages } from "@/lib/services/notion";

export const runtime = "edge";

interface NotionPage {
  id: string;
  title: string;
}

// GET /api/notion/pages - List user's Notion pages
export const GET = withAuth<{ pages: NotionPage[] }>(async ({ user, supabase }) => {
  const { data: userData } = await supabase
    .from("users")
    .select("notion_access_token")
    .eq("id", user.id)
    .single();

  if (!userData?.notion_access_token) {
    return errorResponse("Notion not connected", 400);
  }

  const pages = await getNotionPages(userData.notion_access_token);

  return successResponse({ pages });
});
