import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
} from "discord.js";
import cron from "node-cron";

import {
  GEMINI_FLASH_MODEL,
  GEMINI_PRO_MODEL,
  buildDiscordMetricText,
  chooseChatModel,
  generateGeminiText,
  runDailyPipeline,
  toKstYmd,
} from "./daily-runner.mjs";

function getEnv(name, { optional = false, fallback = undefined, aliases = [] } = {}) {
  for (const key of [name, ...aliases]) {
    const value = process.env[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  if (fallback !== undefined && fallback !== null && fallback !== "") {
    return fallback;
  }

  if (!optional) {
    const suffix = aliases.length ? ` (or ${aliases.join(", ")})` : "";
    throw new Error(`Missing required environment variable: ${name}${suffix}`);
  }

  return fallback;
}

const DISCORD_BOT_TOKEN = getEnv("DISCORD_BOT_TOKEN", {
  aliases: ["DISCORD_TOKEN"],
});
const DAILY_CHANNEL_ID = getEnv("DISCORD_DAILY_CHANNEL_ID", {
  aliases: ["DISCORD_CHANNEL_ID"],
});
const GUILD_ID = getEnv("DISCORD_GUILD_ID", {
  optional: true,
  aliases: ["DISCORD_SERVER_ID"],
});
const CHAT_CHANNEL_IDS = new Set(
  (process.env.DISCORD_CHAT_CHANNEL_IDS || process.env.DISCORD_CHANNEL_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

let dailyRunInFlight = null;

function splitMessage(content, limit = 1800) {
  if (!content || content.length <= limit) return [content];
  const chunks = [];
  let start = 0;
  while (start < content.length) {
    const end = Math.min(content.length, start + limit);
    chunks.push(content.slice(start, end));
    start = end;
  }
  return chunks;
}

async function sendLongMessage(channel, content) {
  for (const chunk of splitMessage(content)) {
    if (!chunk) continue;
    await channel.send({ content: chunk });
  }
}

function buildDailyEmbed(report) {
  const { overviewText, heavyUserText } = buildDiscordMetricText(report);

  return new EmbedBuilder()
    .setColor(0x1f8b4c)
    .setTitle(`📊 Archy 데일리 리포트 · ${report.dailyLabel}`)
    .setDescription("Supabase + Amplitude + Notion 기반 자동 집계")
    .addFields(
      {
        name: "핵심 지표",
        value: overviewText,
      },
      {
        name: "헤비 유저 TOP3 (누적 녹음)",
        value: heavyUserText,
      }
    )
    .setFooter({
      text: `집계일: ${report.targetYmd} | 실행일: ${report.runYmd} (KST)`,
    })
    .setTimestamp(new Date());
}

async function runDailyAndPost({ trigger = "schedule" } = {}) {
  if (dailyRunInFlight) return dailyRunInFlight;

  dailyRunInFlight = (async () => {
    const channel = await client.channels.fetch(DAILY_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      throw new Error("Daily channel is missing or not text-based");
    }

    await channel.send(`데일리 배치 실행 시작 (${trigger})`);
    const report = await runDailyPipeline({
      runDate: new Date(),
      dryRun: false,
      runWeeklyWhenSunday: true,
      skipStrategicReview: false,
    });

    const embed = buildDailyEmbed(report);
    await channel.send({ embeds: [embed] });

    if (report.strategicReview) {
      await sendLongMessage(channel, `🧠 오늘의 전략 리뷰\n\n${report.strategicReview}`);
    }

    const syncSummary = [
      `- Google Sheet 삽입: ${report.sheetSync?.insertedRows ?? 0}`,
      `- Google Sheet 제외행 삭제: ${report.sheetSync?.removedExcludedRows ?? 0}`,
      `- Google Sheet 중복행 삭제: ${report.sheetSync?.removedDuplicateRows ?? 0}`,
      `- Notion(데일리): ${report.dailyNotionUpsert?.mode || "-"}`,
      `- Notion(위클리): ${report.weeklyNotionUpsert?.mode || "skip"}`,
      `- 가입전환율 데이터 소스: ${report.amplitudeConversion?.source || "-"}`,
    ].join("\n");
    await channel.send(`배치 완료\n${syncSummary}`);

    return report;
  })();

  try {
    return await dailyRunInFlight;
  } finally {
    dailyRunInFlight = null;
  }
}

async function answerAdvisorQuestion(message, question) {
  const model = chooseChatModel(question);

  const quickReport = await runDailyPipeline({
    runDate: new Date(),
    dryRun: true,
    skipStrategicReview: true,
  });

  const systemInstruction = [
    "당신은 Archy 서비스 운영 어시스턴트다.",
    "모호한 말보다 실행 지시와 숫자 근거를 우선한다.",
    "한국어로 간결하게 답한다.",
    `기본 사용 모델은 ${GEMINI_PRO_MODEL}이며, 가벼운 요청만 ${GEMINI_FLASH_MODEL}로 처리한다.`,
  ].join(" ");

  const prompt = [
    `현재 시각(KST): ${new Date().toISOString()} / KST 날짜: ${toKstYmd(new Date())}`,
    "아래는 최신 데일리 집계 요약이다.",
    JSON.stringify(
      {
        targetYmd: quickReport.targetYmd,
        counts: quickReport.counts,
        rates: quickReport.rates,
        amplitudeConversion: quickReport.amplitudeConversion,
        heavyUserTop3: quickReport.heavyUserTop3,
        workProgress: {
          found: quickReport.workProgress?.found,
          completedCount: quickReport.workProgress?.completed?.length || 0,
          pendingCount: quickReport.workProgress?.pending?.length || 0,
          summary: quickReport.workProgress?.text || "",
        },
      },
      null,
      2
    ),
    "질문:",
    question,
  ].join("\n\n");

  await message.channel.sendTyping();
  const answer = await generateGeminiText({
    model,
    systemInstruction,
    userPrompt: prompt,
    temperature: 0.2,
    maxOutputTokens: 2048,
  });

  if (!answer) {
    await message.reply("모델 응답이 비어 있습니다. 다시 질문해 주세요.");
    return;
  }

  await sendLongMessage(message.channel, answer);
}

function parseCommand(content) {
  const trimmed = content.trim();
  if (!trimmed.startsWith("!archy")) return null;
  const rest = trimmed.slice("!archy".length).trim();

  if (!rest) return { name: "help" };
  if (rest.startsWith("daily")) return { name: "daily" };
  if (rest.startsWith("stats")) return { name: "stats" };
  if (rest.startsWith("ask ")) return { name: "ask", query: rest.slice(4).trim() };
  if (rest === "help") return { name: "help" };

  return { name: "ask", query: rest };
}

client.on(Events.ClientReady, async () => {
  console.log(`Discord bot ready: ${client.user?.tag}`);

  if (GUILD_ID) {
    console.log(`Scoped guild: ${GUILD_ID}`);
  }

  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        await runDailyAndPost({ trigger: "schedule" });
      } catch (error) {
        console.error("Scheduled daily run failed:", error);
      }
    },
    {
      timezone: "Asia/Seoul",
    }
  );

  console.log("Scheduled daily pipeline at 00:00 Asia/Seoul");
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    if (GUILD_ID && message.guild.id !== GUILD_ID) return;

    const command = parseCommand(message.content);
    if (command) {
      if (command.name === "help") {
        await message.reply(
          [
            "사용 가능한 명령:",
            "- `!archy daily` : 데일리 배치 즉시 실행",
            "- `!archy stats` : 최신 집계 요약",
            "- `!archy ask <질문>` : 전략/운영 질의",
          ].join("\n")
        );
        return;
      }

      if (command.name === "daily") {
        await message.reply("데일리 배치를 실행합니다.");
        await runDailyAndPost({ trigger: `manual:${message.author.username}` });
        return;
      }

      if (command.name === "stats") {
        const report = await runDailyPipeline({
          runDate: new Date(),
          dryRun: true,
          skipStrategicReview: true,
        });
        const { overviewText } = buildDiscordMetricText(report);
        await message.reply(`최신 지표 (${report.dailyLabel})\n${overviewText}`);
        return;
      }

      if (command.name === "ask") {
        if (!command.query) {
          await message.reply("질문을 함께 입력해 주세요. 예: `!archy ask 오늘 유저 활성화율 해석해줘`");
          return;
        }
        await answerAdvisorQuestion(message, command.query);
        return;
      }
    }

    const isMentioned = message.mentions.has(client.user?.id || "");
    const inChatChannel = CHAT_CHANNEL_IDS.size === 0 || CHAT_CHANNEL_IDS.has(message.channelId);
    if (!isMentioned || !inChatChannel) return;

    const question = message.content.replace(new RegExp(`<@!?${client.user?.id}>`, "g"), "").trim();
    if (!question) {
      await message.reply("질문을 함께 남겨주세요.");
      return;
    }

    await answerAdvisorQuestion(message, question);
  } catch (error) {
    console.error("Message handler error:", error);
    try {
      await message.reply("처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } catch {
      // Ignore secondary send failures.
    }
  }
});

client.login(DISCORD_BOT_TOKEN).catch((error) => {
  console.error("Discord login failed:", error);
  process.exitCode = 1;
});
