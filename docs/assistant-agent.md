# Archy Assistant Agent (Discord + Daily Ops)

## 개요
`scripts/agent/discord-bot.mjs`는 Railway에서 상시 실행되는 Discord 일반 채팅형 봇입니다.

역할:
1. 매일 00:00 (Asia/Seoul) 데일리 배치 실행
2. Supabase + Amplitude 기반 지표 집계
3. Google Sheet / Notion 멱등 업데이트 (`있으면 update, 없으면 insert`)
4. Discord 리포트 전송 + Gemini Pro 전략 리뷰 자동 생성
5. 일반 채팅 질문 응답(기본 Pro 라우팅)

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
- `!archy daily` : 데일리 배치 즉시 실행
- `!archy stats` : 최신 집계 요약
- `!archy ask <질문>` : 전략/운영 질의
- 봇 멘션으로도 질문 가능 (`DISCORD_CHAT_CHANNEL_IDS` 설정 시 채널 제한)

## 필수 환경변수
`.env.example`에 추가된 키를 설정하세요.
- Gemini: `GEMINI_API_KEY`
- Discord: `DISCORD_BOT_TOKEN`, `DISCORD_DAILY_CHANNEL_ID`, `DISCORD_GUILD_ID`
- Google Sheets: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- Notion: `NOTION_INTERNAL_INTEGRATION_TOKEN`, `NOTION_USER_METRICS_DATABASE_ID`
- Amplitude: `AMPLITUDE_DASHBOARD_REST_API_KEY`, `AMPLITUDE_DASHBOARD_REST_SECRET`, `AMPLITUDE_SIGNUP_CONVERSION_CHART_ID`

## 참고
- 데일리 배치는 기본적으로 `전날(targetYmd)` 데이터를 기준으로 집계합니다.
- 주간(Notion 위클리)은 일요일 00:00 실행 시 실행일 라벨(예: `3/8(일)`)로 upsert합니다.
