# Archy - 자동 음성 문서화 서비스

녹음 한 번 하면 완성되는 자동 문서

## 프로젝트 개요

Archy는 음성 녹음을 자동으로 텍스트로 변환하고, AI가 정리하여 Notion에 저장하고 Slack으로 알림을 보내주는 자동화 서비스입니다.

### 주요 기능

- **원클릭 녹음**: 웹에서 바로 녹음 시작 (최대 120분)
- **자동 STT**: Groq Whisper Large V3를 통한 고품질 음성-텍스트 변환
- **AI 문서 정리**: GPT-4o-mini로 회의록/인터뷰/강의 형식으로 자동 정리
- **Notion 연동**: 정리된 문서를 Notion 페이지로 자동 생성
- **Google Docs 연동**: Google Docs에 문서 저장 지원
- **Slack 알림**: 처리 완료 시 Slack 메시지 전송
- **Push 알림**: 웹 푸시 알림으로 처리 완료 알림
- **리퍼럴 시스템**: 추천인 코드로 보너스 분 적립
- **PWA 지원**: 모바일 홈 화면에 추가 가능
- **다국어 지원**: 한국어/영어 자동 감지 및 설정
- **Amplitude Analytics**: 사용자 행동 분석

## 기술 스택

### Frontend
- **Next.js 16** (App Router)
- **React 19**
- **TypeScript 5.9**
- **Tailwind CSS** (Glassmorphism 디자인)

### Backend
- **Next.js API Routes** (서버리스)
- **Supabase** (PostgreSQL + Auth, 오디오 파일 저장 안 함)

### 외부 API
- **Groq Whisper Large V3** (STT)
- **OpenAI GPT-4o-mini** (문서 정리)
- **Notion API** (페이지 생성)
- **Google Docs API** (문서 생성)
- **Slack API** (메시지 전송)
- **Web Push** (푸시 알림)
- **Amplitude** (분석)

## 빠른 시작

자세한 설정 방법은 [SETUP.md](SETUP.md)를 참조하세요.

### 1. 환경 변수 설정

`.env.example`을 복사하여 `.env`를 생성하고 다음 값들을 설정하세요:

```bash
cp .env.example .env
```

#### 필수 환경 변수:

**Supabase** (https://supabase.com)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

**OpenAI** (https://platform.openai.com)
```env
OPENAI_API_KEY=your_openai_api_key
```

**Groq** (https://console.groq.com) - STT
```env
GROQ_API_KEY=your_groq_api_key
```

**Google** (https://console.cloud.google.com) - Docs 연동
```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

**Notion** (https://developers.notion.com)
```env
NOTION_CLIENT_ID=your_notion_client_id
NOTION_CLIENT_SECRET=your_notion_client_secret
NOTION_REDIRECT_URI=http://localhost:3000/api/auth/notion/callback
```

**Slack** (https://api.slack.com/apps)
```env
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
SLACK_REDIRECT_URI=http://localhost:3000/api/auth/slack/callback
```

**App URL**
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Push 알림** (VAPID 키 생성 필요)
```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:your-email@example.com
```

**Analytics** (https://amplitude.com)
```env
NEXT_PUBLIC_AMPLITUDE_API_KEY=your_amplitude_api_key
```

### 2. 데이터베이스 설정

Supabase 대시보드에서 SQL 에디터를 열고 다음 파일들을 순서대로 실행하세요:

1. `database/schema.sql` - 기본 스키마 생성
2. `database/migrations/add_language.sql` - 언어 설정 컬럼 추가
3. `database/migrations/add_is_onboarded.sql` - 온보딩 완료 플래그 추가
4. `database/migrations/make_audio_file_path_nullable.sql` - 오디오 파일 경로 nullable
5. `database/migrations/add_notion_save_target_fields.sql` - Notion 저장 대상 설정
6. `database/migrations/add_processing_step.sql` - 처리 단계 컬럼
7. `database/migrations/add_error_tracking.sql` - 에러 추적
8. `database/migrations/add_push_notification.sql` - 푸시 알림
9. `database/migrations/add_referral_system.sql` - 리퍼럴 시스템
10. `database/migrations/add_google_integration.sql` - Google Docs 연동
11. `database/migrations/add_user_name.sql` - 사용자 이름
11. `database/migrations/add_withdrawn_users_table.sql` - 탈퇴 사용자 테이블
12. `database/migrations/update_withdrawn_users_add_name.sql` - 탈퇴 사용자 이름 추가
13. `database/migrations/update_withdrawn_users_add_data.sql` - 탈퇴 사용자 데이터 추가
14. `database/migrations/add_recording_session.sql` - 녹음 세션 관리
15. `database/migrations/add_audio_storage_setting.sql` - 오디오 저장 설정

기본 스키마는 다음을 생성합니다:
- `users` 테이블
- `recordings` 테이블
- `custom_formats` 테이블
- `withdrawn_users` 테이블
- Row Level Security (RLS) 정책

### 3. Supabase Storage 설정

**참고:** 오디오 파일은 저장하지 않습니다. Groq API로 전송 후 즉시 폐기되며, 텍스트(전사 결과)만 데이터베이스에 저장됩니다.

### 4. Google OAuth 설정

Supabase 대시보드에서:
1. Authentication > Providers > Google 활성화
2. Google Cloud Console에서 OAuth 2.0 클라이언트 생성
3. 인증된 리디렉션 URI 추가: `https://[your-project-ref].supabase.co/auth/v1/callback`

### 5. 패키지 설치 및 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000을 열어 확인하세요.

## 프로젝트 구조

```
.
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   ├── dashboard/         # 대시보드 (메인, 히스토리, 설정, 녹음)
│   ├── onboarding/        # 온보딩
│   └── page.tsx           # 랜딩 페이지
├── components/            # React 컴포넌트
│   └── recorder/          # 녹음 관련 컴포넌트
├── lib/                   # 유틸리티
│   ├── supabase/         # Supabase 클라이언트
│   ├── i18n/             # 다국어 지원 (한국어/영어)
│   ├── auth.ts           # 인증 헬퍼
│   └── utils.ts          # 공통 유틸리티
├── types/                 # TypeScript 타입 정의
├── database/              # 데이터베이스 스키마 및 마이그레이션
└── public/                # 정적 파일
```

## 주요 페이지

### 랜딩 페이지 (`/`)
- 서비스 소개
- Google 로그인 버튼
- 3가지 사용 사례 (회의록/인터뷰/강의)
- 다국어 지원 (한국어/영어 자동 감지)

### 온보딩 (`/onboarding`)
- **Step 1**: 환영 메시지
- **Step 2**: Notion/Slack 연동
- **Step 3**: 기본 문서 포맷 선택

### 대시보드 (`/dashboard`)
- 녹음 컨트롤 (시작/일시정지/중지)
- 타이머 표시
- 포맷 선택
- 사용량 표시

### 히스토리 (`/dashboard/history`)
- 최근 녹음 목록
- 처리 상태 (처리중/완료/실패)
- Notion 링크 바로가기

### 설정 (`/dashboard/settings`)
- 계정 정보
- 연결된 통합 관리
- 데이터 삭제

## API 엔드포인트

### 인증
- `GET /api/auth/callback` - OAuth 콜백
- `POST /api/auth/signout` - 로그아웃

### 녹음
- `POST /api/recordings/start` - 녹음 세션 시작
- `POST /api/recordings/chunk` - 실시간 청크 업로드 및 전사
- `POST /api/recordings/finalize` - 녹음 종료 및 AI 처리
- `POST /api/recordings/pause-notify` - 백그라운드 전환 시 푸시 알림
- `POST /api/recordings` - 녹음 생성 및 업로드 (레거시)
- `GET /api/recordings` - 녹음 목록 조회
- `GET /api/recordings/[id]` - 녹음 상세 조회
- `GET /api/recordings/[id]/audio` - 오디오 파일 조회
- `DELETE /api/recordings/[id]` - 녹음 삭제

### 사용자
- `GET /api/user` - 사용자 정보 조회
- `GET /api/user/usage` - 사용량 조회
- `POST /api/user/language` - 언어 설정 업데이트
- `POST /api/user/onboarding` - 온보딩 완료 표시
- `GET /api/user/data` - 사용자 데이터 조회
- `DELETE /api/user/data` - 모든 데이터 삭제
- `GET /api/user/profile` - 프로필 조회
- `GET /api/user/referral` - 리퍼럴 코드 조회
- `POST /api/user/referral` - 리퍼럴 코드 적용
- `POST /api/user/push-subscription` - 푸시 구독 등록
- `DELETE /api/user/push-subscription` - 푸시 구독 해제
- `GET /api/user/push-enabled` - 푸시 알림 상태 조회
- `POST /api/user/push-enabled` - 푸시 알림 상태 변경
- `POST /api/user/pwa-install` - PWA 설치 추적
- `POST /api/user/audio-storage` - 오디오 저장 설정
- `POST /api/user/withdraw` - 사용자 탈퇴
- `GET /api/user/google` - Google 연동 상태 조회
- `POST /api/user/google` - Google Docs 연동
- `GET /api/user/slack` - Slack 연동 상태 조회
- `GET /api/user/notion-database` - Notion 데이터베이스 설정 조회
- `POST /api/user/notion-database` - Notion 데이터베이스 설정 변경

### 포맷
- `GET /api/formats` - 커스텀 포맷 목록
- `POST /api/formats` - 커스텀 포맷 생성
- `PUT /api/formats` - 커스텀 포맷 수정
- `DELETE /api/formats` - 커스텀 포맷 삭제

## 개발 현황

### ✅ MVP 완료
- [x] Next.js 14 프로젝트 초기화 (App Router, TypeScript)
- [x] Tailwind CSS 및 Glassmorphism 디자인 시스템
- [x] Supabase 설정 및 데이터베이스 스키마
- [x] Google OAuth 인증 시스템
- [x] 랜딩 페이지
- [x] 온보딩 플로우 (3단계)
- [x] 대시보드 페이지 및 녹음 컨트롤
- [x] 웹 오디오 녹음 기능 (MediaRecorder API)
- [x] API Routes (recordings, user, formats)
- [x] WhisperAPI.com STT 연동
- [x] OpenAI GPT-4o-mini 문서 정리 (3가지 기본 프롬프트)
- [x] Notion API 연동 (OAuth + 페이지 생성)
- [x] Slack API 연동 (OAuth + 메시지 전송)
- [x] 히스토리 페이지
- [x] 설정 페이지 및 포맷 설정
- [x] PWA 설정 (manifest.json, service worker)
- [x] Vercel 배포 설정
- [x] 다국어 지원 (i18n) - 한국어/영어
- [x] OAuth 콜백에서 언어 설정 유지

### ✅ 추가 구현 완료
- [x] Push 알림 기능
- [x] 리퍼럴 시스템 (추천인 코드)
- [x] Google Docs 연동
- [x] 사용자 탈퇴 기능
- [x] Amplitude Analytics 연동
- [x] 실시간 처리 상태 표시 (폴링 기반)

### 📋 향후 개선 사항
- [ ] WebSocket 기반 실시간 진행 상황 표시
- [ ] 성능 최적화
- [ ] 단위 테스트 및 E2E 테스트
- [ ] 녹음 편집 기능
- [ ] 팀 공유 기능

## 배포

자세한 배포 방법은 [DEPLOYMENT.md](DEPLOYMENT.md)를 참조하세요.

### 빠른 배포 (Vercel)

1. GitHub 리포지토리 생성 및 푸시
2. [Vercel Dashboard](https://vercel.com)에서 프로젝트 임포트
3. 환경 변수 설정
4. 배포

```bash
# 또는 CLI 사용
npm install -g vercel
vercel
```

## 라이선스

ISC

## 문서

- [SETUP.md](SETUP.md) - 로컬 개발 환경 설정 가이드
- [DEPLOYMENT.md](DEPLOYMENT.md) - Vercel 배포 가이드
- [docs/prd.md](docs/prd.md) - 제품 요구사항 문서 (PRD)

## 개발 스크립트

```bash
# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 서버 실행
npm run start

# 린트 검사
npm run lint

# 타입 체크
npx tsc --noEmit
```

## 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 문의

이슈나 질문은 GitHub Issues를 이용해주세요.

## 제작

이 프로젝트는 Claude Code와 함께 개발되었습니다.
