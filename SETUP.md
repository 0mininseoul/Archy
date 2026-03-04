# Archy 로컬 개발 설정

## 1. 요구사항

- Node.js 20+
- npm
- Supabase 프로젝트
- OpenAI / Groq API 키

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

### 필수

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
GROQ_API_KEY_TIER_2=
GROQ_API_KEY_TIER_3=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`GROQ_API_KEY_TIER_2`, `GROQ_API_KEY_TIER_3`는 선택 사항입니다.
- 동시 녹음 유저 3명 이상: `GROQ_API_KEY_TIER_2`
- 동시 녹음 유저 5명 이상: `GROQ_API_KEY_TIER_3`

### 연동/옵션

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

# Analytics
NEXT_PUBLIC_AMPLITUDE_API_KEY=

# Referral Share
NEXT_PUBLIC_KAKAO_JS_KEY=

# Billing (Polar)
POLAR_ACCESS_TOKEN=
POLAR_SUCCESS_URL=http://localhost:3000/dashboard?checkout_id={CHECKOUT_ID}
POLAR_WEBHOOK_SECRET=

# Admin
ADMIN_EMAILS=you@example.com
```

## 4. DB 스키마 및 마이그레이션

Supabase SQL Editor에서 아래 순서로 실행합니다.

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

## 5. Supabase Storage (선택)

- 기본 정책은 `audio_file_path`를 비워두고 오디오를 저장하지 않습니다.
- 설정에서 오디오 저장을 켜려면 `recordings` 버킷 생성이 필요합니다.

## 6. OAuth/외부 서비스 설정

### Google 로그인 (Supabase Auth)

- Supabase Auth Provider에서 Google 활성화
- Google Cloud OAuth Redirect에 Supabase callback 등록

### Notion

- Integration 생성 후 OAuth redirect를 `NOTION_REDIRECT_URI`와 동일하게 설정

### Slack

- 앱 생성 후 OAuth 설치
- 실제 redirect는 앱에서 `NEXT_PUBLIC_APP_URL + /api/auth/slack/callback` 사용

### Google Docs/Drive

- OAuth Client 생성 및 `GOOGLE_REDIRECT_URI` 등록
- Drive scope(`drive.file`) 허용

### Push 알림

- VAPID 키 생성 후 환경 변수 등록

## 7. 실행

```bash
npm run dev
```

브라우저: [http://localhost:3000](http://localhost:3000)

## 8. 기본 점검

- 로그인: 랜딩에서 Google OAuth
- 녹음: `/dashboard`에서 시작/일시정지/중지
- 처리: `/dashboard/history`에서 상태 전이 확인
- 연동: 설정에서 Notion/Google/Slack 연결
- 상세: `/dashboard/recordings/[id]`에서 전사/정리 확인

## 9. 유용한 명령어

```bash
npm run lint
npm run build
npm run start
npm run check:notion-oauth
npx tsc --noEmit
```

## 10. 트러블슈팅

- `401 Unauthorized`: 세션 쿠키/Redirect URI 불일치 확인
- `Notion not configured`: `NOTION_REDIRECT_URI` 누락 확인
- Push 등록 실패: HTTPS/서비스워커/VAPID 확인
- Google 폴더 조회 실패: refresh token/Drive scope 확인
