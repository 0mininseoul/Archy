# Archy Assistant Agent (Discord + Daily Ops)

## 개요
`scripts/agent/discord-bot.mjs`는 Railway에서 상시 실행되는 Discord 하이브리드 봇(슬래시 + 멘션)입니다.

역할:
1. 매일 00:00 (Asia/Seoul) 데일리 배치 실행
2. Supabase + Amplitude 기반 지표 집계
3. Google Sheet / Notion 멱등 업데이트 (`있으면 update, 없으면 insert`)
4. Discord 리포트 전송 + Gemini Pro 전략 리뷰 자동 생성
5. 멘션 채팅 질의 응답(기본 Pro 라우팅)
6. Supabase 기반 대화 메모리(요약 + 사실 메모)로 연속 맥락 유지
7. 멘션 요청으로 웹 조사 / Notion 페이지·DB 생성·편집 / Google Sheet 탭·셀 편집 실행
8. 업무 맥락 동기화: Notion `업무 DB` + `Ascentum` 최근 편집 반영

## 핵심 정의 (고정)
- 제외 테스트 유저 ID:
  - `2018416a-14dc-4087-91aa-24cf68451366`
  - `724261a2-8cdd-4318-9c99-fd8c7a39c5d8`
- 전체 가입자 수: `users(활성) + withdrawn_users(탈퇴)`
- 가입전환율: Amplitude 차트(`signup_completed / visitor`) 값 사용
- 활성화율: 가입자 대비 최근 30일 내 1회 이상 녹음한 유저 비율
- 결제율: 가입자 대비 `users.is_paid_user = true` 유저 비율
- 배치 시간대: `Asia/Seoul 00:00`

## 결제 데이터 기록
Polar 웹훅에서 아래 필드를 `users`에 기록합니다.
- `is_paid_user` (현재 유료 활성)
- `paid_ever` (유료 결제 경험 여부)
- `paid_started_at`
- `paid_ended_at`
- `polar_customer_id`
- `polar_subscription_id`

마이그레이션:
- `database/migrations/add_paid_subscription_fields.sql`
- `database/migrations/add_agent_memory_tables.sql`

## 녹음 횟수 추적
`users.recording_count`를 직접 업데이트하지 않고 뷰를 사용합니다.
- `database/migrations/add_user_recording_stats_view.sql`
- 뷰명: `user_recording_stats`

## 실행 방법
```bash
# 데일리 파이프라인 단독 실행
npm run agent:daily

# Dry-run (외부 write 없이 계산/리뷰 확인)
npm run agent:daily:dry

# Discord 봇 실행 (Railway 런타임)
npm run agent:discord
```

## Discord 명령
- `/daily` : 데일리 배치 즉시 실행
- `/stats` : 최신 집계 요약
- `/help` : 명령 안내
- 위클리 Notion upsert는 **실행 시각(KST)이 일요일**일 때 수행됩니다.
  - 스케줄러(일요일 00:00 KST) 실행 시: 데일리 + 위클리 upsert
  - `/daily` 수동 실행도 일요일에 실행하면: 데일리 + 위클리 upsert
- 전략/운영 질의는 봇 멘션으로 입력 (`DISCORD_CHAT_CHANNEL_IDS` 설정 시 채널 제한)
  - 예: `@사업 개고수 에이전트 오늘 데이터 해석해줘`
  - 예: `@사업 개고수 에이전트 경쟁 서비스 최신 동향 웹 조사해줘`
  - 예: `@사업 개고수 에이전트 노션에 페이지 만들고 제목은 3월 실험안, 본문은 ...`
  - 예: `@사업 개고수 에이전트 구글시트에 신규 탭 만들고 A1:C1에 헤더 써줘`
- `/daily` 실행 UX:
  - 슬래시 호출 직후 에페메랄 확인 응답
  - 실제 리포트/전략리뷰는 데일리 채널(`DISCORD_DAILY_CHANNEL_ID`)로 전송

## 필수 환경변수
`.env.example`에 추가된 키를 설정하세요.
- Gemini: `GEMINI_API_KEY`
- Gemini 재시도/타임아웃(옵션): `GEMINI_REQUEST_TIMEOUT_MS`, `GEMINI_REQUEST_MAX_RETRIES`, `GEMINI_REQUEST_RETRY_BASE_MS`, `GEMINI_REQUEST_RETRY_CAP_MS`, `GEMINI_STRATEGIC_REVIEW_TIMEOUT_MS`, `GEMINI_STRATEGIC_REVIEW_MAX_RETRIES`
- Discord: `DISCORD_BOT_TOKEN`, `DISCORD_DAILY_CHANNEL_ID`, `DISCORD_GUILD_ID`
- Google Sheets: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- Google Sheets 동기화 모드(옵션): `ARCHY_SHEET_SYNC_ALL_USERS` (기본 `true`)
- Notion: `NOTION_INTERNAL_INTEGRATION_TOKEN`, `NOTION_USER_METRICS_DATABASE_ID`
- 업무 맥락 추적(Notion, 권장): `NOTION_WORK_DB_DATA_SOURCE_ID`, `NOTION_ASCENTUM_PAGE_ID`
- Amplitude: `AMPLITUDE_DASHBOARD_REST_API_KEY`, `AMPLITUDE_DASHBOARD_REST_SECRET`, `AMPLITUDE_SIGNUP_CONVERSION_CHART_ID`
- Memory(옵션): `ARCHY_MEMORY_ENABLED`, `ARCHY_MEMORY_RECENT_TURNS`, `ARCHY_MEMORY_SUMMARY_MIN_TURNS`, `ARCHY_MEMORY_SUMMARY_KEEP_RECENT_TURNS`, `ARCHY_MEMORY_SUMMARY_MIN_INTERVAL_MINUTES`
- 멘션 업무맥락 캐시(옵션): `ARCHY_WORK_CONTEXT_CACHE_SECONDS`
- Tool 실행 기본값(옵션): `NOTION_DEFAULT_PARENT_PAGE_ID`, `NOTION_DEFAULT_DATA_SOURCE_ID`, `ARCHY_TOOL_MAX_CALLS`
- Web 조사(옵션): `TAVILY_API_KEY` (미설정 시 DuckDuckGo HTML fallback)

## 참고
- 데일리 배치는 기본적으로 `전날(targetYmd)` 데이터를 기준으로 집계합니다.
- Google Sheet 동기화는 기본적으로 `users` 전체를 대상으로 동작합니다.
  - 시트에 없는 유저는 상단 행에 삽입
  - 시트에 이미 있는 유저는 최신 Supabase 상태(O/X 포함)로 행 업데이트
  - `users` 컬럼 전체를 읽어 시트 헤더와 매핑하며, 미매핑 컬럼은 기존 시트 값을 보존합니다.
- 주간(Notion 위클리)은 실행 시각이 일요일일 때 실행일 라벨(예: `3/8(일)`)로 upsert합니다.
- 전략 리뷰가 Gemini 혼잡(503/timeout)으로 생성 실패하면:
  - 데일리 리포트는 정상 전송
  - 전략 리뷰는 생략 안내 메시지를 전송
- 긴 전략 리뷰는 Discord 길이 제한(2000자) 대응을 위해 자동 분할 전송합니다.
- 업무 맥락은 멘션 응답 시 실시간으로 Notion에서 조회되고, 요약값은 Supabase `agent_memory_facts`에도 저장됩니다.
- Railway 로그에는 `scope=daily-runner|discord-bot` JSON 구조 로그가 남아 run/step 단위 추적이 가능합니다.
- 슬래시 명령 반영이 늦으면 봇 재초대(Scopes: `bot`, `applications.commands`) 후 확인하세요.
