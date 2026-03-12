# Archy 로컬 개발 설정

최종 업데이트: 2026-03-12

## 1. 요구사항

- Node.js 20+
- npm
- Supabase 프로젝트
- OpenAI / Groq API 키
- 선택: `GEMINI_API_KEY` (메인 앱 포맷팅 provider 우선순위와 `Archy Ops Agent`가 함께 사용)
- 선택: Notion / Google / Slack / Polar / Amplitude / Kakao 설정
- 선택: `Archy Ops Agent`까지 로컬에서 돌릴 경우 Discord Bot / Gemini / Google Service Account / Notion Internal Integration

## 2. 설치

```bash
git clone <your-repo-url>
cd Archy
npm install
```

## 3. 환경 변수

```bash
cp .env.example .env.local
```

### 3.1 메인 앱 필수

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENAI_API_KEY=
# Optional until 2026-05-06 00:00:00 KST: when set, formatting prefers Gemini
GEMINI_API_KEY=
GROQ_API_KEY=
CRON_SECRET=replace-with-a-random-16-plus-char-string
```

메모:
- `OPENAI_API_KEY`는 기본/폴백 경로이므로 계속 권장됩니다.
- `GEMINI_API_KEY`가 있으면 `2026-05-06 00:00:00 KST` 이전까지 메인 앱 포맷팅이 Gemini `gemini-3.1-pro-preview`를 우선 사용합니다.

### 3.2 녹음/STT 라우팅 옵션

```env
GROQ_API_KEY_TIER_2=
GROQ_API_KEY_TIER_3=
GROQ_AUDIO_SECONDS_DAILY_LIMIT=28800
GROQ_AUDIO_SECONDS_HOURLY_LIMIT=7200
GROQ_AUDIO_SECONDS_DAILY_RISK_THRESHOLD_RATIO=0.9
GROQ_AUDIO_SECONDS_HOURLY_RISK_THRESHOLD_RATIO=0.9
GROQ_AUDIO_SECONDS_DAILY_FIXED_BUFFER_SECONDS=300
GROQ_AUDIO_SECONDS_DAILY_BUFFER_PER_ACTIVE_RECORDER_SECONDS=40
GROQ_AUDIO_SECONDS_ROLLING_WINDOW_HOURS=24
GROQ_AUDIO_SECONDS_BUCKET_MINUTES=5
GROQ_ASPD_RATE_LIMIT_COOLDOWN_MINUTES=60
```

설명:
- `GROQ_API_KEY_TIER_2`, `GROQ_API_KEY_TIER_3`는 동시 활성 녹음 유저 수가 각각 3명/5명 이상일 때 우선 선택됩니다.
- 일/시간 단위 예산과 위험 임계치, ASPD cooldown은 `lib/services/groq-key-router.ts`, `lib/services/groq-audio-budget.ts`에서 사용됩니다.

### 3.3 사용자-facing 연동/옵션

```env
# Notion
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=http://localhost:3000/api/auth/notion/callback

# Slack
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=

# Google Docs/Drive
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com

# Analytics / Share
NEXT_PUBLIC_AMPLITUDE_API_KEY=
NEXT_PUBLIC_KAKAO_JS_KEY=

# Billing / Admin
POLAR_ACCESS_TOKEN=
POLAR_SUCCESS_URL=http://localhost:3000/dashboard?checkout_id={CHECKOUT_ID}
POLAR_WEBHOOK_SECRET=
ADMIN_EMAILS=you@example.com
```

메모:
- Slack OAuth callback은 별도 runtime env를 읽지 않고 `NEXT_PUBLIC_APP_URL + /api/auth/slack/callback`에서 파생됩니다.
- `.env.example`의 `SLACK_REDIRECT_URI`는 provider 콘솔 값을 맞춰두기 위한 참고값으로 봐도 됩니다.

### 3.4 Archy Ops Agent / 데일리 배치 옵션

메인 웹앱만 개발한다면 이 섹션은 비워둬도 됩니다.

```env
# Shared Gemini / Discord
# GEMINI_API_KEY is also read by the main app formatter.
GEMINI_API_KEY=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_DAILY_CHANNEL_ID=
DISCORD_CHAT_CHANNEL_IDS=channel_id_1,channel_id_2
ARCHY_CHAT_REPORT_CACHE_SECONDS=300

# Memory / planner
ARCHY_MEMORY_ENABLED=true
ARCHY_MEMORY_RECENT_TURNS=12
ARCHY_MEMORY_SUMMARY_MIN_TURNS=24
ARCHY_MEMORY_SUMMARY_KEEP_RECENT_TURNS=10
ARCHY_MEMORY_SUMMARY_MIN_INTERVAL_MINUTES=180
ARCHY_WORK_CONTEXT_CACHE_SECONDS=300
ARCHY_TOOL_MAX_CALLS=5
ARCHY_TOOL_PLANNER_TIMEOUT_MS=45000
ARCHY_TOOL_PLANNER_MAX_RETRIES=1
ARCHY_TOOL_SUMMARY_TIMEOUT_MS=30000
ARCHY_TOOL_SUMMARY_MAX_RETRIES=1

# Google Sheets
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
ARCHY_USER_SHEET_ID=
ARCHY_USER_SHEET_TAB_NAME=유저 데이터 최종
ARCHY_SHEET_SYNC_ALL_USERS=true

# Notion internal integration
NOTION_INTERNAL_INTEGRATION_TOKEN=
NOTION_USER_METRICS_DATABASE_ID=
NOTION_WORK_DB_DATA_SOURCE_ID=
NOTION_ASCENTUM_PAGE_ID=
NOTION_DEFAULT_PARENT_PAGE_ID=
NOTION_DEFAULT_DATA_SOURCE_ID=
ARCHY_NOTION_MAIN_PAGE_URL=
ARCHY_NOTION_MAIN_PAGE_ALIASES=아키 페이지,archy 페이지,메인 페이지

# Amplitude dashboard fetch
AMPLITUDE_DASHBOARD_REST_API_KEY=
AMPLITUDE_DASHBOARD_REST_SECRET=
AMPLITUDE_SIGNUP_CONVERSION_CHART_ID=

# Web research
TAVILY_API_KEY=
```

## 4. DB 스키마 및 마이그레이션

`database/schema.sql`은 현재 코드에서 요구하는 모든 컬럼과 보조 테이블을 포함하지 않는 레거시 베이스라인입니다. 신규 프로젝트는 아래 순서로 적용하세요.

1. `database/schema.sql`
2. `database/migrations/add_language.sql`
3. `database/migrations/add_is_onboarded.sql`
4. `database/migrations/make_audio_file_path_nullable.sql`
5. `database/migrations/add_notion_save_target_fields.sql`
6. `database/migrations/add_processing_step.sql`
7. `database/migrations/add_error_tracking.sql`
8. `database/migrations/add_push_notification.sql`
9. `database/migrations/add_referral_system.sql`
10. `database/migrations/add_google_integration.sql`
11. `database/migrations/add_user_name.sql`
12. `database/migrations/add_withdrawn_users_table.sql`
13. `database/migrations/update_withdrawn_users_add_name.sql`
14. `database/migrations/update_withdrawn_users_add_data.sql`
15. `database/migrations/add_recording_session.sql`
16. `database/migrations/add_audio_storage_setting.sql`
17. `database/migrations/add_custom_format_is_default.sql`
18. `database/migrations/add_notion_save_target_icon_fields.sql`
19. `database/migrations/add_promo_system.sql`
20. `database/migrations/add_active_recording_index.sql`
21. `database/migrations/add_paid_subscription_fields.sql`
22. `database/migrations/add_user_recording_stats_view.sql`
23. `database/migrations/add_agent_memory_tables.sql`
24. `database/migrations/add_recording_chunk_tracking.sql`
25. `database/migrations/add_recording_lifecycle_tracking.sql`
26. `database/migrations/normalize_recording_timestamps_to_timestamptz.sql`
27. `database/migrations/add_user_consent_tracking.sql`
28. `database/migrations/add_amplitude_signup_identity_mappings.sql`
29. `database/migrations/add_groq_audio_budget_tracking.sql`

메모:
- 이미 운영 중인 DB라면 미적용된 파일만 순서대로 반영하세요.
- 현재 앱은 `recording_chunks`, `user_consent_logs`, `groq_audio_usage_buckets`, `groq_key_health`, `agent_memory_*`까지 의존합니다.

## 5. Supabase Storage 및 Auth 설정

### Storage

- 기본 정책은 오디오 파일을 저장하지 않습니다.
- 설정에서 오디오 저장을 켜려면 `recordings` 버킷 생성이 필요합니다.
- 현재 session/chunk recorder는 `audio_file_path`를 채우지 않으므로, `recordings` 버킷은 legacy direct-upload 경로나 향후 오디오 저장 확장 기준으로 보는 편이 정확합니다.

### Google 로그인 (Supabase Auth)

- Supabase Auth Provider에서 Google 활성화
- Google Cloud OAuth Redirect에 Supabase callback 등록

## 6. 외부 서비스 설정

### Notion

- Public OAuth Integration 생성
- Redirect URI를 `NOTION_REDIRECT_URI`와 동일하게 설정

### Slack

- Slack App 생성 후 OAuth 설치
- Redirect URI는 `NEXT_PUBLIC_APP_URL/api/auth/slack/callback`

### Google Docs/Drive

- OAuth Client 생성
- Redirect URI를 `GOOGLE_REDIRECT_URI`와 일치시킴
- 최소 scope는 `drive.file`

### Push 알림

- VAPID 키 생성 후 환경 변수 등록

### Polar

- Success URL은 `POLAR_SUCCESS_URL`
- Webhook endpoint는 `/api/webhook/polar`

## 7. 실행

### 메인 앱

```bash
npm run dev
```

브라우저: [http://localhost:3000](http://localhost:3000)

### 선택: Ops Agent 점검

```bash
npm run agent:daily:dry
npm run agent:discord
```

## 8. 기본 점검

- 로그인: 랜딩에서 Google OAuth
- 온보딩: 동의 저장 후 추천코드/시작 단계 진입
- 녹음: `/dashboard`에서 시작/일시정지/재개/종료
- 처리: `/dashboard/history`에서 상태 전이와 transcript 존재 여부 확인
- 연동: 설정에서 Notion/Google/Slack 연결
- 상세: `/dashboard/recordings/[id]`에서 전사/정리/오디오(옵션) 확인
- 크론: `CRON_SECRET` 설정 후 stale cleanup 호출 가능 여부 확인

## 9. 유용한 명령어

```bash
npm run lint
npx tsc --noEmit
npm run build
npm run start
npm run check:notion-oauth
npm run agent:daily
npm run agent:daily:dry
npm run agent:discord
```

## 10. 크론/운영 확인 예시

비활성 녹음 정리 라우트:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/stale-recordings
```

## 11. 트러블슈팅

- `401 Unauthorized`: 세션 쿠키/Redirect URI/Supabase Site URL 확인
- `notion_not_configured`: `NOTION_REDIRECT_URI`, `NEXT_PUBLIC_APP_URL` 확인
- Slack OAuth 실패: Slack callback URI가 `NEXT_PUBLIC_APP_URL/api/auth/slack/callback`과 일치하는지 확인
- Push 등록 실패: HTTPS/서비스워커/VAPID 확인
- Google 폴더 조회 실패: refresh token/Drive scope 확인
- stale cleanup 401: `CRON_SECRET`와 호출 헤더(`Authorization` 또는 `x-cron-secret`) 확인
