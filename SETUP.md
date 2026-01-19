# Archy 로컬 개발 환경 설정

이 문서는 Archy를 로컬 환경에서 실행하는 방법을 설명합니다.

## 요구사항

- Node.js 18.17 이상
- npm 또는 yarn
- Supabase 계정
- OpenAI API 키
- Groq API 키 (STT 용)

## 1. 프로젝트 클론

```bash
git clone https://github.com/your-username/archy.git
cd archy
```

## 2. 패키지 설치

```bash
npm install
```

## 3. 환경 변수 설정

`.env.example`을 복사하여 `.env`를 생성합니다:

```bash
cp .env.example .env
```

`.env` 파일을 열고 다음 값들을 설정합니다:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=sk-...

# Groq API (STT - Whisper Large V3)
GROQ_API_KEY=your_groq_key

# Notion (온보딩 후 필요)
NOTION_CLIENT_ID=your_notion_client_id
NOTION_CLIENT_SECRET=your_notion_secret
NOTION_REDIRECT_URI=http://localhost:3000/api/auth/notion/callback

# Slack (온보딩 후 필요)
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_secret
SLACK_REDIRECT_URI=http://localhost:3000/api/auth/slack/callback

# Google (Docs/Drive 연동)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Push 알림 (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:your-email@example.com

# Analytics (Amplitude)
NEXT_PUBLIC_AMPLITUDE_API_KEY=your_amplitude_api_key

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 4. Supabase 설정

### 4.1 프로젝트 생성

1. [Supabase](https://supabase.com)에 로그인하고 새 프로젝트를 생성합니다.
2. 프로젝트 URL과 API 키를 복사하여 `.env`에 추가합니다.

### 4.2 데이터베이스 스키마 실행

1. Supabase Dashboard > SQL Editor를 엽니다.
2. `database/schema.sql` 파일의 내용을 복사하여 붙여넣습니다.
3. "Run"을 클릭하여 실행합니다.

이 스크립트는 다음을 생성합니다:
- `users` 테이블
- `recordings` 테이블
- `custom_formats` 테이블
- Row Level Security 정책
- Storage 정책

### 4.2.1 데이터베이스 마이그레이션 실행

추가 마이그레이션 파일들을 실행합니다:

1. `database/migrations/add_language.sql` - 사용자 언어 설정 컬럼 추가
2. `database/migrations/add_is_onboarded.sql` - 온보딩 완료 플래그 추가
3. `database/migrations/make_audio_file_path_nullable.sql` - 오디오 파일 경로 nullable
4. `database/migrations/add_notion_save_target_fields.sql` - Notion 저장 대상 설정
5. `database/migrations/add_processing_step.sql` - 처리 단계 컬럼
6. `database/migrations/add_error_tracking.sql` - 에러 추적
7. `database/migrations/add_push_notification.sql` - 푸시 알림
8. `database/migrations/add_referral_system.sql` - 리퍼럴 시스템
9. `database/migrations/add_google_integration.sql` - Google Docs 연동
10. `database/migrations/add_user_name.sql` - 사용자 이름
11. `database/migrations/add_withdrawn_users_table.sql` - 탈퇴 사용자 테이블
12. `database/migrations/update_withdrawn_users_add_name.sql` - 탈퇴 사용자 이름 추가
13. `database/migrations/update_withdrawn_users_add_data.sql` - 탈퇴 사용자 데이터 추가
14. `database/migrations/add_recording_session.sql` - 녹음 세션 관리
15. `database/migrations/add_audio_storage_setting.sql` - 오디오 저장 설정

각 파일의 내용을 SQL Editor에서 실행합니다.

### 4.3 Storage Bucket 생성

**참고:** 오디오 파일은 저장하지 않습니다. Groq API로 전송 후 즉시 폐기되며, 텍스트(전사 결과)만 데이터베이스에 저장됩니다. Storage Bucket 생성은 필요하지 않습니다.

### 4.4 Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com)에서 OAuth 2.0 클라이언트를 생성합니다.
2. Supabase Dashboard > Authentication > Providers > Google을 활성화합니다.
3. Google Client ID와 Secret을 입력합니다.
4. 승인된 리디렉션 URI에 추가:
   - `https://[your-project-ref].supabase.co/auth/v1/callback`
   - `http://localhost:3000` (로컬 개발용)

## 5. 외부 API 설정

### 5.1 OpenAI

1. [OpenAI Platform](https://platform.openai.com)에서 API 키를 생성합니다.
2. `.env`의 `OPENAI_API_KEY`에 추가합니다.

### 5.2 Groq API (STT - 필수)

1. [Groq Console](https://console.groq.com)에서 API 키를 생성합니다.
2. `.env`의 `GROQ_API_KEY`에 추가합니다.

### 5.3 Notion (선택사항 - 온보딩 시 필요)

1. [Notion Developers](https://www.notion.so/my-integrations)에서 통합을 생성합니다.
2. OAuth 설정:
   - Redirect URI: `http://localhost:3000/api/auth/notion/callback`
3. Client ID와 Secret을 `.env`에 추가합니다.

### 5.4 Slack (선택사항 - 온보딩 시 필요)

1. [Slack API](https://api.slack.com/apps)에서 앱을 생성합니다.
2. OAuth & Permissions:
   - Redirect URL: `http://localhost:3000/api/auth/slack/callback`
   - Scopes: `chat:write`, `channels:read`, `groups:read`
3. Client ID와 Secret을 `.env`에 추가합니다.

## 6. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000을 열어 확인합니다.

## 7. 기능 테스트

### 7.1 로그인

1. 랜딩 페이지에서 "Google 아이디로 시작하기"를 클릭합니다.
2. Google 계정으로 로그인합니다.
3. 온보딩 페이지로 리디렉션됩니다.

### 7.2 녹음

1. 대시보드로 이동합니다.
2. "녹음 시작" 버튼을 클릭합니다.
3. 마이크 권한을 허용합니다.
4. 테스트 녹음을 진행합니다.
5. "중지" 버튼을 클릭합니다.

### 7.3 히스토리

1. 히스토리 페이지(`/dashboard/history`)로 이동합니다.
2. 녹음 목록을 확인합니다.
3. 처리 상태를 확인합니다 (처리중/완료/실패).

### 7.4 다국어 지원

1. 랜딩 페이지에서 언어가 자동으로 감지됩니다 (한국 IP → 한국어, 기타 → 영어).
2. 설정 페이지에서 언어를 변경할 수 있습니다.
3. OAuth 로그인 후에도 언어 설정이 유지됩니다.

## 8. 데이터베이스 확인

Supabase Dashboard에서:
- Table Editor > users: 사용자 정보 확인
- Table Editor > recordings: 녹음 기록 확인
- Storage > recordings: 오디오 파일 확인

## 트러블슈팅

### 마이크 권한 오류

브라우저 설정에서 마이크 권한을 확인합니다:
- Chrome: 설정 > 개인정보 보호 및 보안 > 사이트 설정 > 마이크
- Safari: 설정 > 웹사이트 > 마이크

### Supabase 연결 오류

1. `.env` 파일에 올바른 URL과 키가 있는지 확인
2. Supabase 프로젝트가 활성 상태인지 확인
3. 데이터베이스 스키마가 실행되었는지 확인

### API 키 오류

- OpenAI: 유효한 API 키인지, 결제 정보가 등록되었는지 확인
- WhisperAPI: 무료 한도를 초과하지 않았는지 확인

### OAuth 리디렉션 오류

- 로컬 개발 시 `http://localhost:3000`을 사용
- Redirect URI가 정확히 일치하는지 확인 (후행 슬래시 주의)

## 개발 팁

### 핫 리로드

코드를 수정하면 자동으로 브라우저가 새로고침됩니다.

### 타입 체크

```bash
npm run type-check
```

### 빌드 테스트

```bash
npm run build
npm run start
```

### 데이터베이스 리셋

```bash
# Supabase Dashboard > SQL Editor에서 실행
DROP TABLE IF EXISTS custom_formats CASCADE;
DROP TABLE IF EXISTS recordings CASCADE;
DROP TABLE IF EXISTS users CASCADE;

# 그 다음 schema.sql을 다시 실행
```

## 다음 단계

- [ ] 모든 기능 테스트 완료
- [ ] 프로덕션 환경 변수 준비
- [ ] Vercel 배포 (DEPLOYMENT.md 참조)

## 지원

문제가 발생하면:
- README.md 참조
- GitHub Issues 확인
- 개발자 문서 참조
