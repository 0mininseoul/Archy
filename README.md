# Archy

녹음 한 번으로 완성되는 자동 문서화 서비스.

## 개요

Archy는 모바일 웹/PWA 환경에서 음성을 녹음하면,

1. 청크 단위로 전사하고
2. AI로 문서를 정리한 뒤
3. Notion/Google Docs 저장 및 Slack/Push 알림까지

자동으로 처리하는 서비스입니다.

용어 구분:
- `Archy`: 최종 사용자가 사용하는 제품/서비스
- `Archy Ops Agent` (`아키 운영 에이전트`, 별칭 `아키 에이전트`): Railway에서 상시 실행되며 데일리 배치, Notion/Google Sheets 업데이트, Discord 운영 요청 처리를 담당하는 관리자용 운영 에이전트

핵심 구현 포인트:
- 세션 기반 녹음 (`/api/recordings/start` → `/chunk` → `/finalize-intent|/finalize`)
- 20초 청크 업로드 + 재시도 큐 + 오프라인 복구 + 세션 재개
- 30분 비활성 세션 정리(`/api/cron/stale-recordings`)와 stale recovery 후보 표시
- Groq 다중 키 라우팅 + RMS/무음/환각 필터 + chunk 단위 품질 추적
- Smart(범용) 포맷 + 사용자 커스텀 포맷 기본값 지정
- Notion 저장 대상 탐색(빠른/딥 모드 + 검색)
- Pro(프로모션/구독) 사용량 정책

## 주요 기능

- 실시간 녹음: 웹 MediaRecorder 기반, 세션 재개/이어녹음
- 청크 전사: Groq Whisper Large V3 (`whisper-large-v3`)
- AI 정리: Gemini `gemini-3.1-pro-preview` 사용 후 `2026-05-06 00:00:00 KST`부터 OpenAI `gpt-4o-mini`로 자동 복귀
- 문서 저장: Notion 페이지/DB, Google Docs 자동 생성
- 알림: Slack DM/채널 알림 + Web Push 알림
- 설정: 저장 위치 선택, 언어(ko/en), 오디오 저장 토글, Push/PWA 설치 추적
- 온보딩: 2단계 동의/추천코드 플로우 + `user_consent_logs` 적재
- 성장 기능: 추천코드(양쪽 보너스), 프로모션 코드, Polar 결제
- PWA: 설치 유도, 서비스워커, 설치 이벤트 추적
- 운영 면: Discord 기반 `Archy Ops Agent`, 데일리 배치, Notion/Google Sheets 동기화

## 기술 스택

- Frontend: Next.js 16 (App Router), React 19, TypeScript 5.9, Tailwind CSS
- Backend: Next.js Route Handlers, Supabase (Auth + Postgres + Storage)
- AI: Groq Whisper, OpenAI Chat Completions
- Integrations: Notion API, Google Docs/Drive API, Slack API, Web Push
- Analytics: Amplitude, Vercel Analytics/Speed Insights

## 빠른 시작

로컬 실행은 [SETUP.md](./SETUP.md) 기준으로 진행하세요.

```bash
npm install
npm run dev
```

## 환경 변수

실제 사용되는 키 기준 최소 목록입니다.

필수:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `GROQ_API_KEY`
- `NEXT_PUBLIC_APP_URL`

STT 다중 키 라우팅(선택):
- `GROQ_API_KEY_TIER_2` (동시 녹음 유저 3명 이상일 때 사용)
- `GROQ_API_KEY_TIER_3` (동시 녹음 유저 5명 이상일 때 사용)
- `GROQ_AUDIO_SECONDS_DAILY_LIMIT` (기본 `28800`)
- `GROQ_AUDIO_SECONDS_HOURLY_LIMIT` (기본 `7200`)
- `GROQ_AUDIO_SECONDS_DAILY_RISK_THRESHOLD_RATIO` (기본 `0.9`)
- `GROQ_AUDIO_SECONDS_HOURLY_RISK_THRESHOLD_RATIO` (기본 `0.9`)
- `GROQ_AUDIO_SECONDS_DAILY_FIXED_BUFFER_SECONDS` (기본 `300`)
- `GROQ_AUDIO_SECONDS_DAILY_BUFFER_PER_ACTIVE_RECORDER_SECONDS` (기본 `40`)
- `GROQ_AUDIO_SECONDS_ROLLING_WINDOW_HOURS` (기본 `24`)
- `GROQ_AUDIO_SECONDS_BUCKET_MINUTES` (기본 `5`)
- `GROQ_ASPD_RATE_LIMIT_COOLDOWN_MINUTES` (기본 `60`)

연동/옵션:
- Notion: `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`
- Slack: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`
  - Slack OAuth callback은 `NEXT_PUBLIC_APP_URL/api/auth/slack/callback`에서 파생됩니다.
- Google Docs/Drive: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Push: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Analytics: `NEXT_PUBLIC_AMPLITUDE_API_KEY`
- Billing(Polar): `POLAR_ACCESS_TOKEN`, `POLAR_SUCCESS_URL`, `POLAR_WEBHOOK_SECRET`
- Admin 통계: `ADMIN_EMAILS`
- Kakao 공유: `NEXT_PUBLIC_KAKAO_JS_KEY`
- 크론/운영: `CRON_SECRET`

Ops Agent / 데일리 배치를 함께 돌릴 경우 추가:
- Discord/Gemini: `GEMINI_API_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_DAILY_CHANNEL_ID`
- Google Sheets(Service Account): `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `ARCHY_USER_SHEET_ID`, `ARCHY_USER_SHEET_TAB_NAME`
- Notion Internal Integration: `NOTION_INTERNAL_INTEGRATION_TOKEN`, `NOTION_USER_METRICS_DATABASE_ID`, `NOTION_WORK_DB_DATA_SOURCE_ID`

자세한 예시는 `.env.example` 참고.

## 데이터베이스 부트스트랩

- `database/schema.sql`은 현재 앱의 모든 컬럼/보조 테이블을 포함하지 않는 레거시 베이스라인입니다.
- 신규 환경은 `database/schema.sql` 실행 후 `database/migrations/`의 최신 목록을 모두 반영해야 합니다.
- 현재 필수 마이그레이션 목록과 권장 순서는 [SETUP.md](./SETUP.md)에 정리돼 있습니다.
- 특히 현재 앱은 `recording_chunks`, 녹음 라이프사이클 필드, 동의 로그, Groq 오디오 예산 추적, 결제/운영 메모리 테이블에 의존합니다.

## API 개요

핵심 라우트:
- 인증: `/api/auth/*`
- 녹음 파이프라인: `/api/recordings/start`, `/api/recordings/chunk`, `/api/recordings/pause-notify`, `/api/recordings/finalize-intent`, `/api/recordings/finalize`
- 녹음 관리: `/api/recordings`, `/api/recordings/[id]`, `/api/recordings/[id]/audio`, `/api/cron/stale-recordings`
- 사용자 설정: `/api/user/*`
- 사용자 보조 라우트: `/api/client-errors`, `/api/google/folders`
- Notion 저장 대상: `/api/notion/save-targets`, `/api/notion/save-targets/search`, `/api/notion/pages`, `/api/notion/databases`
- 포맷 관리: `/api/formats`
- 프로모션/결제: `/api/promo/*`, `/api/checkout`, `/api/webhook/polar`
- 운영: `npm run agent:daily`, `npm run agent:daily:dry`, `npm run agent:discord`

## 프로젝트 구조

```text
app/
  api/                    # 서버 라우트
  dashboard/              # 녹음/기록/설정 UI
  onboarding/             # 온보딩
components/               # UI 컴포넌트
hooks/                    # 녹음 훅(useChunkedRecorder)
lib/
  services/               # STT/LLM/Notion/Google/Slack/Push
  stores/                 # Zustand 캐시
  i18n/                   # 다국어 번역
database/
  schema.sql
  migrations/
scripts/
  agent/                  # Archy Ops Agent (Discord + Daily batch)
docs/
```

## 개발 스크립트

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run check:notion-oauth
npm run agent:daily
npm run agent:daily:dry
npm run agent:discord
npx tsc --noEmit
```

Archy Ops Agent(Discord + Daily Ops) 설정은 [docs/assistant-agent.md](docs/assistant-agent.md) 참고.
전략 리뷰용 주입 맥락은 [docs/STRATEGIC_REVIEW_CONTEXT.md](docs/STRATEGIC_REVIEW_CONTEXT.md)에서 관리합니다.

## 문서

- [SETUP.md](./SETUP.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [기능 명세](./docs/FEATURE_SPEC.md)
- [서비스 흐름](./docs/SERVICE_FLOW.md)
- [LLM 컨텍스트](./docs/LLMS.md)
- [PRD](./docs/prd.md)
- [랜딩 페이지 기획](./docs/landing_page_plan.md)
- [Lean Canvas](./docs/LEAN_CANVAS.md)
