# Archy

녹음 한 번으로 완성되는 자동 문서화 서비스.

## 개요

Archy는 모바일 웹/PWA 환경에서 음성을 녹음하면,

1. 청크 단위로 전사하고
2. AI로 문서를 정리한 뒤
3. Notion/Google Docs 저장 및 Slack/Push 알림까지

자동으로 처리하는 서비스입니다.

핵심 구현 포인트:
- 세션 기반 녹음 (`/api/recordings/start` → `/chunk` → `/finalize`)
- 20초 청크 업로드 + 재시도 큐 + 오프라인 복구
- Smart(범용) 포맷 + 사용자 커스텀 포맷 기본값 지정
- Notion 저장 대상 탐색(빠른/딥 모드 + 검색)
- Pro(프로모션/구독) 사용량 정책

## 주요 기능

- 실시간 녹음: 웹 MediaRecorder 기반, 세션 재개/이어녹음
- 청크 전사: Groq Whisper Large V3 (`whisper-large-v3`)
- AI 정리: OpenAI `gpt-4o-mini` + 구조화된 마크다운 출력
- 문서 저장: Notion 페이지/DB, Google Docs 자동 생성
- 알림: Slack DM/채널 알림 + Web Push 알림
- 설정: 저장 위치 선택, 언어(ko/en), 오디오 저장 토글
- 성장 기능: 추천코드(양쪽 보너스), 프로모션 코드, Polar 결제
- PWA: 설치 유도, 서비스워커, 설치 이벤트 추적

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

연동/옵션:
- Notion: `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`
- Slack: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`
- Google Docs/Drive: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Push: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Analytics: `NEXT_PUBLIC_AMPLITUDE_API_KEY`
- Billing(Polar): `POLAR_ACCESS_TOKEN`, `POLAR_SUCCESS_URL`, `POLAR_WEBHOOK_SECRET`
- Admin 통계: `ADMIN_EMAILS`
- Kakao 공유: `NEXT_PUBLIC_KAKAO_JS_KEY`

자세한 예시는 `.env.example` 참고.

## 데이터베이스 마이그레이션 순서

`database/schema.sql` 실행 후 아래 순서 권장:

1. `add_language.sql`
2. `add_is_onboarded.sql`
3. `make_audio_file_path_nullable.sql`
4. `add_notion_save_target_fields.sql`
5. `add_processing_step.sql`
6. `add_error_tracking.sql`
7. `add_push_notification.sql`
8. `add_referral_system.sql`
9. `add_google_integration.sql`
10. `add_user_name.sql`
11. `add_withdrawn_users_table.sql`
12. `update_withdrawn_users_add_name.sql`
13. `update_withdrawn_users_add_data.sql`
14. `add_recording_session.sql`
15. `add_audio_storage_setting.sql`
16. `add_custom_format_is_default.sql`
17. `add_notion_save_target_icon_fields.sql`
18. `add_promo_system.sql`
19. `add_active_recording_index.sql`

## API 개요

핵심 라우트:
- 인증: `/api/auth/*`
- 녹음 파이프라인: `/api/recordings/start`, `/api/recordings/chunk`, `/api/recordings/finalize`
- 녹음 관리: `/api/recordings`, `/api/recordings/[id]`, `/api/recordings/[id]/audio`
- 사용자 설정: `/api/user/*`
- Notion 저장 대상: `/api/notion/save-targets`, `/api/notion/save-targets/search`
- 포맷 관리: `/api/formats`
- 프로모션/결제: `/api/promo/*`, `/api/checkout`, `/api/webhook/polar`

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
docs/
```

## 개발 스크립트

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run check:notion-oauth
npx tsc --noEmit
```

## 문서

- [SETUP.md](./SETUP.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [기능 명세](./docs/FEATURE_SPEC.md)
- [서비스 흐름](./docs/SERVICE_FLOW.md)
- [LLM 컨텍스트](./docs/LLMS.md)
- [PRD](./docs/prd.md)
- [랜딩 페이지 기획](./docs/landing_page_plan.md)
- [Lean Canvas](./docs/LEAN_CANVAS.md)
