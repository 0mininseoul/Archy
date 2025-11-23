import { WebClient } from "@slack/web-api";
import { formatKSTDate } from "../utils";

export async function sendSlackNotification(
  accessToken: string,
  channelId: string,
  title: string,
  duration: number,
  notionUrl: string
): Promise<void> {
  const client = new WebClient(accessToken);

  const durationMinutes = Math.floor(duration / 60);
  const date = formatKSTDate();

  await client.chat.postMessage({
    channel: channelId,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "✅ *녹음 처리 완료!*",
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `📝 *${title}*`,
          },
          {
            type: "mrkdwn",
            text: `⏱️ ${durationMinutes}분`,
          },
          {
            type: "mrkdwn",
            text: `📅 ${date}`,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Notion에서 보기",
            },
            url: notionUrl,
            style: "primary",
          },
        ],
      },
    ],
  });
}

// OAuth helpers
export function getSlackAuthUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.SLACK_CLIENT_ID!;
  const scopes = "chat:write,channels:read,groups:read";

  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
  });

  if (state) {
    params.append("state", state);
  }

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function exchangeSlackCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; team_id: string }> {
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to exchange Slack code");
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error);
  }

  return {
    access_token: data.access_token,
    team_id: data.team.id,
  };
}
