import { withAuth, successResponse, errorResponse } from "@/lib/api";

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// Extract page ID from Notion URL
function extractPageId(url: string): string | null {
  try {
    // Handle various Notion URL formats:
    // https://www.notion.so/workspace/Page-Title-abc123def456...
    // https://notion.so/abc123def456...
    // https://www.notion.so/abc123def456...
    const urlObj = new URL(url);

    if (!urlObj.hostname.includes("notion.so")) {
      return null;
    }

    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    if (pathParts.length === 0) {
      return null;
    }

    // Get the last part of the path which contains the page ID
    const lastPart = pathParts[pathParts.length - 1];

    // The ID is the last 32 characters (without dashes) or after the last dash
    // Format: Page-Title-abc123def456789012345678901234 (32 hex chars at end)
    const idMatch = lastPart.match(/([a-f0-9]{32})$/i) ||
                    lastPart.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);

    if (idMatch) {
      // Return ID without dashes for API use
      return idMatch[1].replace(/-/g, "");
    }

    // Try to extract from query parameter (for some Notion URL formats)
    const pParam = urlObj.searchParams.get("p");
    if (pParam && /^[a-f0-9]{32}$/i.test(pParam)) {
      return pParam;
    }

    return null;
  } catch {
    return null;
  }
}

// Validate token by calling Notion API
async function validateToken(token: string): Promise<{ valid: boolean; workspaceName?: string }> {
  try {
    const response = await fetch(`${NOTION_API_URL}/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
      },
    });

    if (response.ok) {
      return { valid: true };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

// Check if page is accessible and get its info
async function getPageInfo(token: string, pageId: string): Promise<{
  accessible: boolean;
  title?: string;
  isDatabase?: boolean;
  error?: string;
}> {
  try {
    // First try as a page
    const pageResponse = await fetch(`${NOTION_API_URL}/pages/${pageId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
      },
    });

    if (pageResponse.ok) {
      const pageData = await pageResponse.json();
      // Extract title from page properties
      let title = "Untitled";
      if (pageData.properties?.title?.title?.[0]?.plain_text) {
        title = pageData.properties.title.title[0].plain_text;
      } else if (pageData.properties?.Name?.title?.[0]?.plain_text) {
        title = pageData.properties.Name.title[0].plain_text;
      }
      return { accessible: true, title, isDatabase: false };
    }

    // Try as a database
    const dbResponse = await fetch(`${NOTION_API_URL}/databases/${pageId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
      },
    });

    if (dbResponse.ok) {
      const dbData = await dbResponse.json();
      const title = dbData.title?.[0]?.plain_text || "Untitled Database";
      return { accessible: true, title, isDatabase: true };
    }

    // Check error type
    if (pageResponse.status === 404 || dbResponse.status === 404) {
      return { accessible: false, error: "not_found" };
    }
    if (pageResponse.status === 401 || dbResponse.status === 401) {
      return { accessible: false, error: "unauthorized" };
    }

    return { accessible: false, error: "no_access" };
  } catch {
    return { accessible: false, error: "network_error" };
  }
}

// POST /api/user/notion-manual - Connect Notion with manual token
export const POST = withAuth<{
  connected: boolean;
  saveTarget?: { type: "database" | "page"; id: string; title: string };
}>(async ({ user, supabase, request }) => {
  const body = await request!.json();
  const { token, pageUrl } = body;

  // Validate inputs
  if (!token || typeof token !== "string") {
    return errorResponse("Token is required", 400);
  }

  if (!pageUrl || typeof pageUrl !== "string") {
    return errorResponse("Page URL is required", 400);
  }

  // Check token format (Internal Integration tokens start with "secret_")
  if (!token.startsWith("secret_") && !token.startsWith("ntn_")) {
    return errorResponse("Invalid token format", 400);
  }

  // Validate token
  const tokenValidation = await validateToken(token);
  if (!tokenValidation.valid) {
    return errorResponse("Invalid token", 401);
  }

  // Extract page ID from URL
  const pageId = extractPageId(pageUrl);
  if (!pageId) {
    return errorResponse("Invalid Notion URL", 400);
  }

  // Check page accessibility
  const pageInfo = await getPageInfo(token, pageId);
  if (!pageInfo.accessible) {
    if (pageInfo.error === "no_access" || pageInfo.error === "not_found") {
      return errorResponse("No access to page", 403);
    }
    return errorResponse("Failed to access page", 500);
  }

  // Save to database
  const targetType = pageInfo.isDatabase ? "database" : "page";
  const { error } = await supabase
    .from("users")
    .update({
      notion_access_token: token,
      notion_database_id: pageId,
      notion_save_target_type: targetType,
      notion_save_target_title: pageInfo.title,
    })
    .eq("id", user.id);

  if (error) {
    return errorResponse("Failed to save connection", 500);
  }

  return successResponse({
    connected: true,
    saveTarget: {
      type: targetType,
      id: pageId,
      title: pageInfo.title || "Untitled",
    },
  });
});
