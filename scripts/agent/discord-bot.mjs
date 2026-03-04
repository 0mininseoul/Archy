import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
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
import {
  getConversationForSummary,
  getConversationMemory,
  getConversationMessageCount,
  saveConversationSummary,
  saveConversationTurn,
  upsertMemoryFacts,
} from "./memory-store.mjs";

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

function getPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function truncate(value, max = 400) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function stripCodeFenceJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return raw;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(stripCodeFenceJson(text));
  } catch {
    return null;
  }
}

function isBusinessCriticalQuestion(question) {
  const text = String(question || "").toLowerCase();
  const keywords = [
    "지표",
    "전환",
    "리텐션",
    "활성화",
    "결제",
    "매출",
    "전략",
    "로드맵",
    "실험",
    "가설",
    "리스크",
    "우선순위",
    "온보딩",
    "퍼널",
    "cohort",
    "funnel",
    "retention",
    "activation",
    "conversion",
    "pricing",
    "revenue",
    "kpi",
    "okr",
  ];
  return keywords.some((keyword) => text.includes(keyword));
}

function buildAdvisorSystemInstruction({ question, model }) {
  const businessCritical = isBusinessCriticalQuestion(question);

  const sharedRules = [
    "너는 Archy 서비스 운영 어시스턴트다.",
    "톤은 친근하고 캐주얼하게 유지하되, 중요한 내용은 전문가처럼 정확히 말한다.",
    "핵심 결론을 먼저 말하고, 근거/가정/리스크를 분명히 구분한다.",
    "문맥상 자연스러울 때만 가벼운 드립이나 ㅋㅋ를 0~1회 사용한다.",
    "중요한 업무 항목은 절대 생략하지 않는다.",
    "한국어로 답한다.",
    `기본 사용 모델은 ${GEMINI_PRO_MODEL}이며, 가벼운 요청만 ${GEMINI_FLASH_MODEL}로 처리한다. 이번 응답 모델은 ${model}이다.`,
  ];

  if (businessCritical) {
    sharedRules.push(
      "업무/전략 질문에서는 단정적 표현 전에 근거를 제시하고, 실행 액션을 우선순위로 제안한다.",
      "형식보다 내용 정확도를 우선하며, 필요 시 짧아도 빠짐없이 답한다."
    );
  } else {
    sharedRules.push(
      "가벼운 질문에는 부담 없는 톤으로 답하되, 도움되는 한 줄 액션을 함께 준다."
    );
  }

  return sharedRules.join(" ");
}

function buildAdvisorResponseGuide(question) {
  const businessCritical = isBusinessCriticalQuestion(question);
  if (businessCritical) {
    return [
      "답변 형식:",
      "1) 한 줄 결론",
      "2) 근거(숫자/사실/가정)",
      "3) 바로 실행 액션(1~3개, 우선순위 순)",
      "4) 추가 확인이 필요한 데이터(있으면만)",
    ].join("\n");
  }

  return [
    "답변 형식:",
    "1) 짧은 결론",
    "2) 이유 또는 맥락",
    "3) 다음 액션 1개",
  ].join("\n");
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

const CHAT_REPORT_CACHE_SECONDS = getPositiveInt(process.env.ARCHY_CHAT_REPORT_CACHE_SECONDS, 300);
const MEMORY_RECENT_TURNS = getPositiveInt(process.env.ARCHY_MEMORY_RECENT_TURNS, 12);
const MEMORY_SUMMARY_MIN_TURNS = getPositiveInt(process.env.ARCHY_MEMORY_SUMMARY_MIN_TURNS, 24);
const MEMORY_SUMMARY_KEEP_RECENT_TURNS = getPositiveInt(
  process.env.ARCHY_MEMORY_SUMMARY_KEEP_RECENT_TURNS,
  10
);
const MEMORY_SUMMARY_MIN_INTERVAL_MINUTES = getPositiveInt(
  process.env.ARCHY_MEMORY_SUMMARY_MIN_INTERVAL_MINUTES,
  180
);

const SLASH_COMMANDS = [
  new SlashCommandBuilder().setName("help").setDescription("사용 가능한 Archy 명령 안내"),
  new SlashCommandBuilder().setName("stats").setDescription("최신 Archy 핵심 지표 요약"),
  new SlashCommandBuilder().setName("daily").setDescription("데일리 배치를 즉시 실행"),
].map((command) => command.toJSON());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

let dailyRunInFlight = null;
let quickReportCache = {
  report: null,
  expiresAt: 0,
};

function invalidateQuickReportCache() {
  quickReportCache = {
    report: null,
    expiresAt: 0,
  };
}

async function getCachedQuickReport() {
  const now = Date.now();
  if (quickReportCache.report && now < quickReportCache.expiresAt) {
    return quickReportCache.report;
  }

  const report = await runDailyPipeline({
    runDate: new Date(),
    dryRun: true,
    skipStrategicReview: true,
  });

  quickReportCache = {
    report,
    expiresAt: now + CHAT_REPORT_CACHE_SECONDS * 1000,
  };

  return report;
}

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

    invalidateQuickReportCache();

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

function formatMemoryContext(memory) {
  const summaryText = memory?.summary ? truncate(memory.summary, 1400) : "(없음)";

  const factsText = (memory?.facts || [])
    .slice(0, 12)
    .map((fact, idx) => `${idx + 1}. [${fact.fact_type || "general"}] ${fact.fact_key}: ${fact.fact_value}`)
    .join("\n");

  const turnsText = (memory?.recentTurns || [])
    .slice(-MEMORY_RECENT_TURNS)
    .map((turn, idx) => {
      const role = turn.role === "assistant" ? "어시스턴트" : turn.role === "system" ? "시스템" : "사용자";
      return `${idx + 1}. ${role}: ${truncate(turn.content, 240)}`;
    })
    .join("\n");

  return {
    summaryText,
    factsText: factsText || "(없음)",
    turnsText: turnsText || "(없음)",
  };
}

async function maybeRefreshConversationSummary({ guildId, channelId, userId }) {
  try {
    const transcript = await getConversationForSummary({
      guildId,
      channelId,
      userId,
      limit: 80,
    });

    if (!transcript.enabled || !transcript.threadId) return;

    const totalTurns = transcript.messages.length;
    if (totalTurns < MEMORY_SUMMARY_MIN_TURNS) return;

    const summaryUpdatedAt = transcript.summaryUpdatedAt ? new Date(transcript.summaryUpdatedAt) : null;
    const ageMinutes = summaryUpdatedAt
      ? Math.floor((Date.now() - summaryUpdatedAt.getTime()) / (60 * 1000))
      : null;

    if (ageMinutes !== null && ageMinutes < MEMORY_SUMMARY_MIN_INTERVAL_MINUTES) {
      return;
    }

    const summarizeUntil = Math.max(0, totalTurns - MEMORY_SUMMARY_KEEP_RECENT_TURNS);
    const chunk = transcript.messages.slice(0, summarizeUntil);
    if (chunk.length < 10) return;

    const conversationText = chunk
      .map((item) => {
        const role = item.role === "assistant" ? "assistant" : item.role === "system" ? "system" : "user";
        return `- ${role}: ${truncate(item.content, 320)}`;
      })
      .join("\n");

    const summaryPrompt = [
      "아래 대화를 장기 메모 형태로 압축하라.",
      "반드시 JSON만 출력.",
      "형식:",
      '{"summary":"...","facts":[{"key":"...","value":"...","type":"goal|constraint|preference|decision|status","confidence":0.0}]}',
      "규칙:",
      "1) summary는 6~10문장, 사실 중심",
      "2) facts는 최대 12개",
      "3) key는 짧고 중복 없는 식별자",
      "4) 확실하지 않으면 confidence를 낮춰라",
      "5) 한국어로 작성",
      "\n[대화]\n",
      conversationText,
    ].join("\n");

    const raw = await generateGeminiText({
      model: GEMINI_FLASH_MODEL,
      systemInstruction: "당신은 대화 메모리 압축기다. JSON 이외 텍스트를 출력하지 마라.",
      userPrompt: summaryPrompt,
      temperature: 0.1,
      maxOutputTokens: 1400,
    });

    const parsed = parseJsonSafe(raw);
    const summary = parsed?.summary ? String(parsed.summary).trim() : String(raw || "").trim();
    if (!summary) return;

    await saveConversationSummary({
      threadId: transcript.threadId,
      summary,
      sourceModel: GEMINI_FLASH_MODEL,
    });

    if (Array.isArray(parsed?.facts) && parsed.facts.length > 0) {
      await upsertMemoryFacts({
        guildId,
        userId,
        facts: parsed.facts,
      });
    }
  } catch (error) {
    console.warn("Memory summary refresh failed:", error);
  }
}

async function answerAdvisorQuestion(message, question) {
  const model = chooseChatModel(question);
  const quickReport = await getCachedQuickReport();

  const memory = await getConversationMemory({
    guildId: message.guild.id,
    channelId: message.channelId,
    userId: message.author.id,
    recentLimit: MEMORY_RECENT_TURNS,
  });

  const memoryContext = formatMemoryContext(memory);

  const systemInstruction = buildAdvisorSystemInstruction({ question, model });

  const prompt = [
    `현재 시각(KST): ${new Date().toISOString()} / KST 날짜: ${toKstYmd(new Date())}`,
    "아래 컨텍스트를 바탕으로 질문에 답해라.",
    buildAdvisorResponseGuide(question),
    "[장기 메모 요약]",
    memoryContext.summaryText,
    "[사용자/프로젝트 사실 메모]",
    memoryContext.factsText,
    "[최근 대화]",
    memoryContext.turnsText,
    "[최신 데일리 집계 요약(JSON)]",
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
    "[질문]",
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

  try {
    await saveConversationTurn({
      guildId: message.guild.id,
      channelId: message.channelId,
      userId: message.author.id,
      userMessage: question,
      assistantMessage: answer,
      model,
    });

    const count = await getConversationMessageCount({
      guildId: message.guild.id,
      channelId: message.channelId,
      userId: message.author.id,
    });

    if (count >= MEMORY_SUMMARY_MIN_TURNS) {
      void maybeRefreshConversationSummary({
        guildId: message.guild.id,
        channelId: message.channelId,
        userId: message.author.id,
      });
    }
  } catch (error) {
    console.warn("Memory persistence failed:", error);
  }
}

function parseLegacyCommand(content) {
  const trimmed = content.trim();
  if (!trimmed.startsWith("!archy")) return null;
  return {
    name: "legacy",
  };
}

async function registerSlashCommands() {
  const appId = client.application?.id || client.user?.id;
  if (!appId) {
    console.warn("Slash command registration skipped: application id not found");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(appId, GUILD_ID), {
      body: SLASH_COMMANDS,
    });
    console.log(`Registered guild slash commands (${GUILD_ID})`);
    return;
  }

  await rest.put(Routes.applicationCommands(appId), {
    body: SLASH_COMMANDS,
  });
  console.log("Registered global slash commands");
}

client.on(Events.ClientReady, async () => {
  console.log(`Discord bot ready: ${client.user?.tag}`);

  if (GUILD_ID) {
    console.log(`Scoped guild: ${GUILD_ID}`);
  }

  try {
    await registerSlashCommands();
  } catch (error) {
    console.error("Failed to register slash commands:", error);
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

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    if (GUILD_ID && interaction.guildId !== GUILD_ID) return;

    if (interaction.commandName === "help") {
      await interaction.reply({
        ephemeral: true,
        content: [
          "Archy 명령:",
          "- `/daily` : 데일리 배치 즉시 실행",
          "- `/stats` : 최신 핵심 지표 요약",
          "- `/help` : 도움말",
          "채팅 질의는 봇 멘션으로 입력하세요. 예: `@봇 오늘 가입전환율 해석해줘`",
        ].join("\n"),
      });
      return;
    }

    if (interaction.commandName === "stats") {
      await interaction.deferReply({ ephemeral: true });
      const report = await getCachedQuickReport();
      const { overviewText } = buildDiscordMetricText(report);
      await interaction.editReply(`최신 지표 (${report.dailyLabel})\n${overviewText}`);
      return;
    }

    if (interaction.commandName === "daily") {
      await interaction.deferReply({ ephemeral: true });
      const report = await runDailyAndPost({ trigger: `slash:${interaction.user.username}` });
      await interaction.editReply(
        `데일리 배치 완료 (${report.dailyLabel})\n채널 ${DAILY_CHANNEL_ID}에 결과를 전송했습니다.`
      );
      return;
    }
  } catch (error) {
    console.error("Interaction handler error:", error);
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      } else {
        await interaction.reply({
          ephemeral: true,
          content: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        });
      }
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    if (GUILD_ID && message.guild.id !== GUILD_ID) return;

    const legacyCommand = parseLegacyCommand(message.content);
    if (legacyCommand) {
      await message.reply(
        [
          "운영 명령은 슬래시를 사용해 주세요: `/help`, `/stats`, `/daily`",
          "전략 질문은 `!archy ask` 대신 봇 멘션으로 입력해 주세요.",
          `예: <@${client.user?.id}> 오늘 데이터 해석해줘`,
        ].join("\n")
      );
      return;
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
