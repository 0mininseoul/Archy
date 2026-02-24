# Archy 배포 가이드 (Vercel)

## 1. 배포 전 준비

- Supabase 프로젝트 생성 및 DB 마이그레이션 완료
- OAuth 앱 생성 (Google/Notion/Slack)
- OpenAI/Groq API 키 발급
- 필요 시 Polar(결제) 설정

## 2. Vercel 배포

1. GitHub 리포지토리 연결
2. Vercel에서 프로젝트 Import
3. 환경 변수 등록
4. Deploy

## 3. 환경 변수 (Production)

### 필수

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### 연동

```env
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=https://your-domain.com/api/auth/notion/callback

SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/google/callback
```

### 부가 기능

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com

NEXT_PUBLIC_AMPLITUDE_API_KEY=
NEXT_PUBLIC_KAKAO_JS_KEY=

POLAR_ACCESS_TOKEN=
POLAR_SUCCESS_URL=https://your-domain.com/dashboard?checkout_id={CHECKOUT_ID}
POLAR_WEBHOOK_SECRET=

ADMIN_EMAILS=you@example.com
```

## 4. Supabase 설정

### Authentication URL

- Site URL: `https://your-domain.com`
- Redirect URLs:
  - `https://your-domain.com/**`
  - 개발/프리뷰 URL 필요 시 추가

### OAuth Provider

- Google Provider 활성화
- Google Cloud에서 Supabase callback URI 등록

### Storage (선택)

- 오디오 저장 기능을 사용할 경우 `recordings` 버킷 생성

## 5. OAuth Redirect URI 정합성

실서비스에서 아래 URI가 모두 일치해야 합니다.

- Notion: `https://your-domain.com/api/auth/notion/callback`
- Slack: `https://your-domain.com/api/auth/slack/callback`
- Google Docs/Drive: `https://your-domain.com/api/auth/google/callback`
- Supabase Google Auth callback: `https://<supabase-project>.supabase.co/auth/v1/callback`

## 6. Polar Webhook

- Endpoint: `https://your-domain.com/api/webhook/polar`
- Secret: `POLAR_WEBHOOK_SECRET`
- 구독 활성/갱신/해지 이벤트가 사용자 `promo_expires_at` 갱신에 사용됩니다.

## 7. 배포 후 검증

1. `/` 접속 및 로그인
2. `/dashboard` 녹음 시작/종료
3. `/dashboard/history` 상태 갱신
4. Notion/Google/Slack 연동 후 결과 링크 확인
5. Push 알림 구독/발송 테스트
6. 결제 링크(`/api/checkout`) 및 webhook 로그 확인

## 8. 운영 팁

- 서버 로그: Vercel Functions + Supabase logs 함께 확인
- 노션 OAuth 문제 시: `npm run check:notion-oauth` 로컬 검증
- 캐시 이슈 시: Notion save target API에 `refresh=1` 사용
