import { WebClient } from "@slack/web-api";
import { formatKSTDate } from "../utils";

export async function sendSlackNotification(
  accessToken: string,
  channelId: string,
  title: string,
  duration: number,
  urls: {
    notionUrl?: string;
    googleDocUrl?: string;
    archyUrl: string;
  }
): Promise<void> {
  const client = new WebClient(accessToken);

  const durationMinutes = Math.floor(duration / 60);
  const date = formatKSTDate();

  // 버튼 동적 생성
  const actionsElements: any[] = [];

  if (urls.notionUrl) {
    actionsElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Notion에서 보기",
      },
      url: urls.notionUrl,
      style: "primary",
    });
  }

  if (urls.googleDocUrl) {
    actionsElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Google Docs에서 보기",
      },
      url: urls.googleDocUrl,
      style: "primary",
    });
  }

  // 연결된 문서가 없으면 Archy 링크 제공
  if (actionsElements.length === 0) {
    actionsElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Archy에서 보기",
      },
      url: urls.archyUrl,
      style: "primary",
    });
  }

  const blocks: any[] = [
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
  ];

  // 버튼이 있을 경우에만 액션 블록 추가
  if (actionsElements.length > 0) {
    blocks.push({
      type: "actions",
      elements: actionsElements,
    });
  }

  await client.chat.postMessage({
    channel: channelId,
    text: `✅ 녹음 처리 완료! - ${title}`,
    blocks,
  });
}

// OAuth helpers
export function getSlackAuthUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.SLACK_CLIENT_ID!;
  const scopes = "chat:write,channels:read,groups:read,im:write";

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
): Promise<{ access_token: string; team_id: string; user_id: string }> {
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
    user_id: data.authed_user.id,
  };
}

export async function getSlackDMChannelId(
  accessToken: string,
  userId: string
): Promise<string> {
  const client = new WebClient(accessToken);

  // conversations.open works for opening a DM with a user
  const result = await client.conversations.open({
    users: userId
  });

  if (!result.ok || !result.channel?.id) {
    throw new Error(`Failed to open DM channel: ${result.error}`);
  }

  return result.channel.id;
}
