import { Client } from "@notionhq/client";

export async function createNotionPage(
  accessToken: string,
  databaseId: string,
  title: string,
  content: string,
  format: string,
  duration: number,
  audioUrl?: string
): Promise<string> {
  const notion = new Client({ auth: accessToken });

  // Convert markdown content to Notion blocks
  const blocks = convertMarkdownToBlocks(content);

  // Add audio file if provided
  if (audioUrl) {
    blocks.push({
      type: "file",
      file: {
        type: "external",
        external: { url: audioUrl },
      },
    } as any);
  }

  const response = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      title: {
        title: [{ text: { content: title } }],
      },
      format: {
        select: { name: format },
      },
      duration: {
        number: duration,
      },
      created: {
        date: { start: new Date().toISOString() },
      },
    },
    children: blocks as any,
  });

  return `https://notion.so/${response.id.replace(/-/g, "")}`;
}

function convertMarkdownToBlocks(markdown: string): any[] {
  const lines = markdown.split("\n");
  const blocks: any[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Heading 2
    if (line.startsWith("## ")) {
      blocks.push({
        type: "heading_2",
        heading_2: {
          rich_text: [{ text: { content: line.replace("## ", "") } }],
        },
      });
    }
    // Heading 3
    else if (line.startsWith("### ")) {
      blocks.push({
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: line.replace("### ", "") } }],
        },
      });
    }
    // Bullet list
    else if (line.startsWith("- ")) {
      blocks.push({
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ text: { content: line.replace("- ", "") } }],
        },
      });
    }
    // Numbered list
    else if (/^\d+\. /.test(line)) {
      blocks.push({
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{ text: { content: line.replace(/^\d+\. /, "") } }],
        },
      });
    }
    // Checkbox
    else if (line.startsWith("- [ ] ") || line.startsWith("- [x] ")) {
      const checked = line.startsWith("- [x] ");
      blocks.push({
        type: "to_do",
        to_do: {
          rich_text: [
            {
              text: {
                content: line.replace(/^- \[(x| )\] /, ""),
              },
            },
          ],
          checked,
        },
      });
    }
    // Paragraph
    else {
      blocks.push({
        type: "paragraph",
        paragraph: {
          rich_text: [{ text: { content: line } }],
        },
      });
    }
  }

  return blocks;
}

// Get user's databases
export async function getNotionDatabases(accessToken: string): Promise<any[]> {
  const notion = new Client({ auth: accessToken });

  try {
    const databaseMap = new Map<string, any>();

    // 1. Search for top-level databases
    const searchResponse = await notion.search({
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
    });

    // Add top-level databases
    searchResponse.results
      .filter((item: any) => item.object === "database")
      .forEach((db: any) => {
        databaseMap.set(db.id, {
          id: db.id,
          title: db.title?.[0]?.plain_text || "Untitled",
          url: db.url,
          last_edited_time: db.last_edited_time,
        });
      });

    // 2. Get pages and check for child databases
    const pages = searchResponse.results.filter((item: any) => item.object === "page");

    // Check each page for child databases
    for (const page of pages) {
      try {
        const blocksResponse = await notion.blocks.children.list({
          block_id: page.id,
          page_size: 100,
        });

        // Find child_database blocks
        blocksResponse.results
          .filter((block: any) => block.type === "child_database")
          .forEach((block: any) => {
            const dbId = block.id;
            // Only add if not already in map
            if (!databaseMap.has(dbId)) {
              databaseMap.set(dbId, {
                id: dbId,
                title: (block as any).child_database?.title || "Untitled",
                url: `https://notion.so/${dbId.replace(/-/g, "")}`,
                last_edited_time: (block as any).last_edited_time || page.last_edited_time,
              });
            }
          });
      } catch (blockError) {
        // Skip pages where we can't read blocks
        console.warn(`Could not read blocks for page ${page.id}:`, blockError);
      }
    }

    // Convert map to array and sort by last_edited_time
    return Array.from(databaseMap.values()).sort(
      (a, b) =>
        new Date(b.last_edited_time).getTime() -
        new Date(a.last_edited_time).getTime()
    );
  } catch (error) {
    console.error("Failed to fetch Notion databases:", error);
    throw new Error("Failed to fetch databases");
  }
}

// Create a new database in a page
export async function createNotionDatabase(
  accessToken: string,
  pageId: string,
  title: string = "Flownote Recordings"
): Promise<string> {
  const notion = new Client({ auth: accessToken });

  try {
    const response = await notion.databases.create({
      parent: {
        type: "page_id",
        page_id: pageId,
      },
      title: [
        {
          type: "text",
          text: {
            content: title,
          },
        },
      ],
      properties: {
        title: {
          title: {},
        },
        format: {
          select: {
            options: [
              { name: "meeting", color: "blue" },
              { name: "interview", color: "green" },
              { name: "lecture", color: "purple" },
              { name: "custom", color: "gray" },
            ],
          },
        },
        duration: {
          number: {
            format: "number",
          },
        },
        created: {
          date: {},
        },
      },
    } as any);

    return response.id;
  } catch (error) {
    console.error("Failed to create Notion database:", error);
    throw new Error("Failed to create database");
  }
}

// Get user's pages (for creating database)
export async function getNotionPages(accessToken: string): Promise<any[]> {
  const notion = new Client({ auth: accessToken });

  try {
    const response = await notion.search({
      filter: {
        property: "object",
        value: "page",
      },
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
    });

    return response.results.map((page: any) => ({
      id: page.id,
      title: page.properties?.title?.title?.[0]?.plain_text ||
             page.properties?.Name?.title?.[0]?.plain_text ||
             "Untitled",
      url: page.url,
      last_edited_time: page.last_edited_time,
    }));
  } catch (error) {
    console.error("Failed to fetch Notion pages:", error);
    throw new Error("Failed to fetch pages");
  }
}

// OAuth helpers
export function getNotionAuthUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.NOTION_CLIENT_ID!;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    owner: "user",
    redirect_uri: redirectUri,
  });

  if (state) {
    params.append("state", state);
  }

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
}

export async function exchangeNotionCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; workspace_id: string }> {
  const auth = Buffer.from(
    `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to exchange Notion code");
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    workspace_id: data.workspace_id,
  };
}
