# Archy 배포 가이드

이 문서는 Archy 애플리케이션을 Vercel에 배포하는 방법을 설명합니다.

## 사전 준비

### 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에 접속하여 새 프로젝트를 생성합니다.
2. SQL Editor에서 `database/schema.sql` 파일의 내용을 실행합니다.
3. Storage에서 `recordings` bucket을 생성합니다 (Public: false).
4. Authentication > Providers에서 Google OAuth를 활성화합니다.

**필요한 정보:**
- `NEXT_PUBLIC_SUPABASE_URL`: 프로젝트 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: anon public key
- `SUPABASE_SERVICE_ROLE_KEY`: service role key (비밀)

### 2. Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com)에서 프로젝트를 생성합니다.
2. APIs & Services > Credentials에서 OAuth 2.0 클라이언트 ID를 생성합니다.
3. 승인된 리디렉션 URI에 Supabase 콜백 URL을 추가합니다:
   - `https://[your-project-ref].supabase.co/auth/v1/callback`

### 3. OpenAI API 키

1. [OpenAI Platform](https://platform.openai.com)에서 API 키를 생성합니다.
2. 결제 정보를 등록하고 사용량 제한을 설정합니다.

**필요한 정보:**
- `OPENAI_API_KEY`: OpenAI API 키

### 4. Groq API 설정 (STT)

1. [Groq Console](https://console.groq.com)에서 API 키를 발급받습니다.

**필요한 정보:**
- `GROQ_API_KEY`: Groq API 키

### 5. Notion Integration

1. [Notion Developers](https://www.notion.so/my-integrations)에서 새 통합을 생성합니다.
2. OAuth 설정:
   - Redirect URIs: `https://www.archynotes.com/api/auth/notion/callback`
   - Capabilities: Read content, Update content, Insert content

**필요한 정보:**
- `NOTION_CLIENT_ID`: OAuth Client ID
- `NOTION_CLIENT_SECRET`: OAuth Client Secret

### 6. Slack App 생성

1. [Slack API](https://api.slack.com/apps)에서 새 앱을 생성합니다.
2. OAuth & Permissions:
   - Redirect URLs: `https://www.archynotes.com/api/auth/slack/callback`
   - Scopes: `chat:write`, `channels:read`, `groups:read`
3. Install App to Workspace

**필요한 정보:**
- `SLACK_CLIENT_ID`: Client ID
- `SLACK_CLIENT_SECRET`: Client Secret

## Vercel 배포

### 1. Vercel CLI 설치 (선택사항)

```bash
npm install -g vercel
```

### 2. GitHub 연동 배포 (권장)

1. GitHub에 리포지토리를 생성하고 코드를 푸시합니다:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/your-username/archy.git
git push -u origin main
```

2. [Vercel Dashboard](https://vercel.com/dashboard)에서 "New Project"를 클릭합니다.
3. GitHub 리포지토리를 선택합니다.
4. 환경 변수를 추가합니다 (아래 참조).
5. "Deploy"를 클릭합니다.

### 3. 환경 변수 설정

Vercel Dashboard > Settings > Environment Variables에서 다음 환경 변수를 추가합니다:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=sk-...

# WhisperAPI (백업, 선택사항)
WHISPER_API_KEY=your_whisper_key

# Groq (STT - 필수)
GROQ_API_KEY=your_groq_api_key

# Notion
NOTION_CLIENT_ID=your_notion_client_id
NOTION_CLIENT_SECRET=your_notion_secret
NOTION_REDIRECT_URI=https://www.archynotes.com/api/auth/notion/callback

# Slack
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_secret
SLACK_REDIRECT_URI=https://www.archynotes.com/api/auth/slack/callback

# App URL
NEXT_PUBLIC_APP_URL=https://www.archynotes.com
```

### 4. 도메인 설정 (선택사항)

1. Vercel Dashboard > Settings > Domains에서 커스텀 도메인을 추가합니다.
2. DNS 레코드를 설정합니다 (CNAME 또는 A 레코드).
3. SSL 인증서가 자동으로 생성됩니다.

## 배포 후 설정

### 1. OAuth Redirect URIs 업데이트

배포된 URL로 모든 OAuth Redirect URIs를 업데이트합니다:

**Google OAuth:**
- Google Cloud Console > APIs & Services > Credentials
- 승인된 리디렉션 URI에 추가:
  - `https://www.archynotes.com`
  - `https://[your-project-ref].supabase.co/auth/v1/callback`

**Notion:**
- Notion Integration Settings
- Redirect URIs: `https://www.archynotes.com/api/auth/notion/callback`

**Slack:**
- Slack App Settings > OAuth & Permissions
- Redirect URLs: `https://www.archynotes.com/api/auth/slack/callback`

### 2. Supabase 설정 업데이트

Supabase Dashboard > Authentication > URL Configuration:
- Site URL: `https://www.archynotes.com`
- Redirect URLs에 추가:
  - `https://www.archynotes.com/**`

### 3. 배포 확인

1. `https://www.archynotes.com`에 접속합니다.
2. Google 로그인을 테스트합니다.
3. 녹음 기능을 테스트합니다.
4. Notion/Slack 연동을 테스트합니다.

## CI/CD

GitHub와 연동된 경우, `main` 브랜치에 푸시할 때마다 자동으로 배포됩니다.

### 배포 전 체크리스트

- [ ] `npm run build`가 로컬에서 성공하는지 확인
- [ ] `.env.example`과 실제 환경 변수가 일치하는지 확인
- [ ] 모든 API 키가 유효한지 확인
- [ ] 데이터베이스 마이그레이션이 완료되었는지 확인

## 모니터링

### Vercel Analytics

Vercel Dashboard > Analytics에서 트래픽과 성능을 모니터링할 수 있습니다.

### Supabase Logs

Supabase Dashboard > Logs에서 데이터베이스 쿼리와 에러를 확인할 수 있습니다.

### 에러 트래킹 (선택사항)

프로덕션 환경에서는 [Sentry](https://sentry.io) 같은 에러 트래킹 서비스를 추가하는 것을 권장합니다:

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

## 비용 예상

### 무료 티어로 시작

- **Vercel**: 월 100GB 대역폭 (무료)
- **Supabase**: 500MB 데이터베이스, 1GB 파일 스토리지 (무료)
- **WhisperAPI**: 30시간 무료
- **OpenAI**: 종량제 (GPT-4o-mini: $0.15/1M tokens)

### 예상 비용 (100명 사용자 기준)

- Vercel: $0 (무료 티어)
- Supabase: $0-25/월
- WhisperAPI: $0.10/분 → 약 $35/월 (350분)
- OpenAI: $5-10/월
- **총 예상 비용: $40-70/월**

## 트러블슈팅

### 빌드 실패

```bash
# 로컬에서 빌드 테스트
npm run build

# 타입 에러 확인
npm run type-check
```

### 환경 변수 누락

Vercel 로그에서 "Environment variable not found" 에러가 발생하면:
1. Vercel Dashboard > Settings > Environment Variables 확인
2. 변수명 오타 확인
3. 재배포 (Redeploy)

### OAuth 리디렉션 에러

- 모든 OAuth 설정에서 Redirect URI가 정확한지 확인
- HTTPS를 사용하는지 확인 (로컬 개발 제외)

### 데이터베이스 연결 실패

- Supabase URL과 키가 정확한지 확인
- RLS (Row Level Security) 정책이 올바르게 설정되었는지 확인

## 다음 단계

- [ ] 커스텀 도메인 설정
- [ ] 에러 트래킹 (Sentry) 추가
- [ ] 성능 모니터링 설정
- [ ] 백업 및 복구 전략 수립
- [ ] 사용량 알림 설정

## 지원

문제가 발생하면 다음을 확인하세요:
- [Vercel 문서](https://vercel.com/docs)
- [Supabase 문서](https://supabase.com/docs)
- [Next.js 문서](https://nextjs.org/docs)
- GitHub Issues
