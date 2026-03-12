# Archy 배포 가이드

최종 업데이트: 2026-03-12

이 저장소는 배포 면이 둘입니다.

- 메인 앱: Next.js 웹앱. 현재 문서는 Vercel 기준으로 설명합니다.
- `Archy Ops Agent`: Discord bot + daily batch. 현재 문서는 Railway 기준으로 설명합니다.

## 1. 배포 전 준비

- Supabase 프로젝트 생성 및 최신 마이그레이션 반영
- OAuth 앱 생성: Google / Notion / Slack
- OpenAI / Groq API 키 발급
- 선택: Push(VAPID), Polar, Amplitude, Kakao
- 선택: Ops Agent용 Discord bot, Gemini, Google Service Account, Notion Internal Integration

## 2. 메인 앱 배포 (Vercel)

1. GitHub 리포지토리 연결
2. Vercel에서 프로젝트 Import
3. 아래 환경 변수 등록
4. Deploy

### 2.1 메인 앱 필수 환경 변수

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://your-domain.com
OPENAI_API_KEY=
# Optional until 2026-05-06 00:00:00 KST: when set, formatting prefers Gemini
GEMINI_API_KEY=
GROQ_API_KEY=
CRON_SECRET=replace-with-a-random-16-plus-char-string
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

### 2.2 STT 라우팅 / 안정화 옵션

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

### 2.3 사용자-facing 연동

```env
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=https://your-domain.com/api/auth/notion/callback

SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/google/callback

NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com

NEXT_PUBLIC_AMPLITUDE_API_KEY=
NEXT_PUBLIC_KAKAO_JS_KEY=
SENTRY_ENVIRONMENT=production

POLAR_ACCESS_TOKEN=
POLAR_SUCCESS_URL=https://your-domain.com/dashboard?checkout_id={CHECKOUT_ID}
POLAR_WEBHOOK_SECRET=

ADMIN_EMAILS=you@example.com
```

메모:
- Slack runtime callback은 `NEXT_PUBLIC_APP_URL/api/auth/slack/callback`입니다.
- `database/schema.sql`만 배포 전에 적용하면 불충분합니다. 최신 마이그레이션 전체를 반영해야 합니다.
- Sentry는 클라이언트/browser 전송에 `NEXT_PUBLIC_SENTRY_DSN`, 서버 전송에 `SENTRY_DSN`을 사용합니다. 동일 DSN이면 두 값 모두 같은 값으로 넣으면 됩니다.
- `SENTRY_AUTH_TOKEN`은 Vercel build 시 source map 업로드용입니다. 런타임 비밀은 아니지만 저장소에는 커밋하지 마세요.
- `GEMINI_API_KEY`가 있으면 `2026-05-06 00:00:00 KST` 이전까지 메인 앱 포맷팅이 Gemini `gemini-3.1-pro-preview`를 우선 사용합니다. 이후에는 OpenAI `gpt-4o-mini` 경로로 복귀합니다.

## 3. Supabase 설정

### Authentication URL

- Site URL: `https://your-domain.com`
- Redirect URLs:
  - `https://your-domain.com/**`
  - 프리뷰/개발 URL이 있으면 추가

### OAuth Provider

- Google Provider 활성화
- Google Cloud에서 Supabase callback URI 등록

### Storage

- 오디오 저장 기능을 제공할 경우 `recordings` 버킷 생성
- 현재 session/chunk recorder는 `audio_file_path`를 채우지 않으므로, 이 버킷은 legacy direct-upload 경로나 향후 오디오 저장 확장 기준으로 보는 편이 정확합니다.

## 4. OAuth Redirect URI 정합성

실서비스에서 아래 URI가 모두 일치해야 합니다.

- Notion: `https://your-domain.com/api/auth/notion/callback`
- Slack: `https://your-domain.com/api/auth/slack/callback`
- Google Docs/Drive: `https://your-domain.com/api/auth/google/callback`
- Supabase Google Auth callback: `https://<supabase-project>.supabase.co/auth/v1/callback`

## 5. 스케줄링 및 유지보수

### 5.1 stale recordings cleanup

`/api/cron/stale-recordings`는 30분 이상 비활성 상태의 `recording` 세션을 `failed`로 정리합니다.

- 메서드: `GET`
- 인증: `Authorization: Bearer <CRON_SECRET>` 또는 `x-cron-secret: <CRON_SECRET>`
- 권장 주기: 5분~15분 간격

예시:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.com/api/cron/stale-recordings
```

### 5.2 finalize-intent

- `/api/recordings/finalize-intent`는 `202 Accepted`로 응답하며 `after()`를 사용해 background finalize를 예약합니다.
- 플랫폼 특성상 background 처리가 불안정하면 클라이언트가 `/api/recordings/finalize` 폴백을 사용합니다.

## 6. Archy Ops Agent 배포 (Railway)

Railway에는 보통 항상 떠 있는 서비스 하나를 둡니다.

- 실행 명령: `npm run agent:discord`
- 역할: Discord slash/mention 응답, 00:05 KST daily batch, Notion/Google Sheets sync, 전략 리뷰 생성

### 6.1 Railway 필수/권장 환경 변수

```env
GEMINI_API_KEY=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_DAILY_CHANNEL_ID=
DISCORD_CHAT_CHANNEL_IDS=channel_id_1,channel_id_2
ARCHY_CHAT_REPORT_CACHE_SECONDS=300

GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
ARCHY_USER_SHEET_ID=
ARCHY_USER_SHEET_TAB_NAME=유저 데이터 최종
ARCHY_SHEET_SYNC_ALL_USERS=true

NOTION_INTERNAL_INTEGRATION_TOKEN=
NOTION_USER_METRICS_DATABASE_ID=
NOTION_WORK_DB_DATA_SOURCE_ID=
NOTION_ASCENTUM_PAGE_ID=
NOTION_DEFAULT_PARENT_PAGE_ID=
NOTION_DEFAULT_DATA_SOURCE_ID=
ARCHY_NOTION_MAIN_PAGE_URL=
ARCHY_NOTION_MAIN_PAGE_ALIASES=아키 페이지,archy 페이지,메인 페이지

AMPLITUDE_DASHBOARD_REST_API_KEY=
AMPLITUDE_DASHBOARD_REST_SECRET=
AMPLITUDE_SIGNUP_CONVERSION_CHART_ID=

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

TAVILY_API_KEY=
```

메모:
- Railway 런타임에서 메인 앱과 동일한 Supabase/Amplitude/Polar 관련 env도 함께 필요할 수 있습니다.
- daily batch를 별도 cron job으로 분리하고 싶다면 `npm run agent:daily`를 추가 스케줄 작업으로 등록할 수 있습니다.

## 7. Polar Webhook

- Endpoint: `https://your-domain.com/api/webhook/polar`
- Secret: `POLAR_WEBHOOK_SECRET`
- 현재 구현은 `promo_expires_at`를 사용량 gating과 계속 연결하면서, 별도 `is_paid_user`, `paid_ever`, `polar_*` 필드도 함께 업데이트합니다.

## 8. 배포 후 검증

1. `/` 접속 및 로그인
2. `/onboarding` 동의 저장 후 `/dashboard` 진입
3. `/dashboard`에서 녹음 시작/일시정지/재개/종료
4. `/dashboard/history`에서 상태, pinned/hidden, transcript 존재 여부 확인
5. Notion/Google/Slack 연동 후 결과 링크 확인
6. Push 알림 구독/발송 테스트
7. `curl`로 `/api/cron/stale-recordings` 호출 확인
8. Railway 로그에서 `scope=daily-runner|discord-bot` 로그 확인

## 9. 운영 팁

- 서버 로그는 Vercel Functions와 Supabase 로그를 같이 봐야 합니다.
- Notion save target 이슈는 `refresh=1`을 붙여 캐시를 우회할 수 있습니다.
- Notion OAuth 문제는 `npm run check:notion-oauth`로 로컬 검증 가능합니다.
- Discord slash 명령 반영이 늦으면 봇 재초대(Scopes: `bot`, `applications.commands`) 후 확인하세요.
