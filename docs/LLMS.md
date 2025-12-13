# FlowNote - LLM Context 기획서

> 이 문서는 FlowNote 서비스의 전체 구조를 LLM(Large Language Model)이 컨텍스트로 이해할 수 있도록 정리한 문서입니다.

---

## 1. 서비스 개요

### 1.1 핵심 컨셉
**FlowNote**는 "녹음 한 번 하면 완성되는 자동 문서" 서비스입니다.

- **목적**: 음성 녹음 → 자동 텍스트 변환(STT) → AI 문서 정리 → Notion 저장 + Slack 알림
- **타겟 사용자**: 직장인(회의록), 대학생(강의 요약), 프리랜서(인터뷰 기록)

### 1.2 핵심 기능
| 기능 | 설명 |
|------|------|
| **원클릭 녹음** | 웹 브라우저에서 최대 120분 녹음 |
| **자동 STT** | WhisperAPI를 통한 음성→텍스트 변환 |
| **AI 문서 정리** | GPT-4o-mini로 회의록/인터뷰/강의 형식으로 자동 정리 |
| **Notion 연동** | 정리된 문서를 Notion 페이지로 자동 생성 |
| **Slack 알림** | 처리 완료 시 Slack 메시지 전송 |
| **PWA 지원** | 모바일 홈 화면 추가 가능 |
| **다국어 지원** | 한국어/영어 자동 감지 및 설정 (i18n) |

---

## 2. 기술 스택

### 2.1 Frontend
```
- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS (Glassmorphism 디자인)
```

### 2.2 Backend
```
- Next.js API Routes (서버리스)
- Supabase (PostgreSQL + Auth + Storage)
```

### 2.3 외부 API
```
- WhisperAPI.com (STT 변환)
- OpenAI GPT-4o-mini (문서 정리)
- Notion API (페이지 생성)
- Slack API (메시지 전송)
- Google OAuth (인증)
```

---

## 3. 프로젝트 구조

```
flownote/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── auth/                 # 인증 관련 (Google OAuth, Notion/Slack OAuth callback)
│   │   ├── recordings/           # 녹음 CRUD
│   │   ├── formats/              # 커스텀 포맷 관리
│   │   ├── user/                 # 사용자 정보 및 사용량
│   │   └── notion/               # Notion 연동
│   ├── dashboard/                # 메인 대시보드 (녹음 UI)
│   ├── onboarding/               # 온보딩 플로우
│   ├── history/                  # 녹음 히스토리
│   ├── settings/                 # 설정 및 포맷 관리
│   ├── privacy/                  # 개인정보처리방침
│   ├── terms/                    # 이용약관
│   ├── layout.tsx                # 루트 레이아웃
│   └── page.tsx                  # 랜딩 페이지
│
├── components/                   # React 컴포넌트
│   ├── recorder/                 # 녹음 관련 컴포넌트
│   └── google-login-button.tsx   # Google 로그인 버튼
│
├── lib/                          # 유틸리티 및 서비스
│   ├── supabase/                 # Supabase 클라이언트 (client, server, middleware)
│   ├── i18n/                     # 다국어 지원 (한국어/영어)
│   │   ├── context.tsx           # i18n 컨텍스트 및 Provider
│   │   ├── translations.ts       # 번역 텍스트 정의
│   │   └── index.ts              # export
│   ├── services/                 # 외부 API 서비스
│   │   ├── whisper.ts            # WhisperAPI STT 서비스
│   │   ├── openai.ts             # OpenAI 문서 정리 서비스
│   │   ├── notion.ts             # Notion API 서비스
│   │   └── slack.ts              # Slack API 서비스
│   ├── prompts.ts                # AI 프롬프트 템플릿
│   ├── auth.ts                   # 인증 헬퍼
│   └── utils.ts                  # 공통 유틸리티
│
├── database/                     # 데이터베이스
│   ├── schema.sql                # Supabase PostgreSQL 기본 스키마
│   └── migrations/               # 데이터베이스 마이그레이션
│       ├── add_language.sql      # 언어 설정 컬럼 추가
│       └── add_is_onboarded.sql  # 온보딩 완료 플래그 추가
│
├── types/                        # TypeScript 타입 정의
│
└── public/                       # 정적 파일 (manifest.json 등)
```

---

## 4. 데이터베이스 스키마

### 4.1 users 테이블
```sql
id                    UUID PRIMARY KEY
email                 TEXT UNIQUE NOT NULL
google_id             TEXT UNIQUE NOT NULL
notion_access_token   TEXT
notion_database_id    TEXT
slack_access_token    TEXT
slack_channel_id      TEXT
monthly_minutes_used  INTEGER DEFAULT 0      -- 월 사용량 (분)
last_reset_at         TIMESTAMP              -- 마지막 리셋 시간
language              VARCHAR(2) DEFAULT 'ko' -- 언어 설정 (ko|en)
is_onboarded          BOOLEAN DEFAULT false  -- 온보딩 완료 여부
created_at            TIMESTAMP
```

### 4.2 recordings 테이블
```sql
id                UUID PRIMARY KEY
user_id           UUID REFERENCES users(id)
title             TEXT NOT NULL
audio_file_path   TEXT NOT NULL            -- Supabase Storage 경로
duration_seconds  INTEGER NOT NULL
format            TEXT CHECK (meeting|interview|lecture|custom)
status            TEXT CHECK (processing|completed|failed)
transcript        TEXT                     -- STT 결과
formatted_content TEXT                     -- AI 정리 결과
notion_page_url   TEXT
error_message     TEXT
error_step        TEXT CHECK (upload|transcription|formatting|notion|slack)
created_at        TIMESTAMP
```

### 4.3 custom_formats 테이블
```sql
id        UUID PRIMARY KEY
user_id   UUID REFERENCES users(id)
name      TEXT NOT NULL
prompt    TEXT NOT NULL                    -- 사용자 정의 프롬프트
created_at TIMESTAMP
```

### 4.4 Row Level Security (RLS)
- 모든 테이블에 RLS 적용
- 사용자는 자신의 데이터만 조회/수정/삭제 가능

---

## 5. API 엔드포인트

### 5.1 인증 API
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/auth/callback` | Google OAuth 콜백 (locale 유지 지원) |
| POST | `/api/auth/signout` | 로그아웃 |
| GET | `/api/auth/notion/callback` | Notion OAuth 콜백 |
| GET | `/api/auth/slack/callback` | Slack OAuth 콜백 |

### 5.2 녹음 API
| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/recordings` | 녹음 생성 및 업로드 |
| GET | `/api/recordings` | 녹음 목록 조회 |
| GET | `/api/recordings/[id]` | 녹음 상세 조회 |
| DELETE | `/api/recordings/[id]` | 녹음 삭제 |

### 5.3 사용자 API
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/user/usage` | 사용량 조회 (분) |
| GET | `/api/user/language` | 언어 설정 조회 |
| PUT | `/api/user/language` | 언어 설정 업데이트 (ko|en) |
| POST | `/api/user/onboarding` | 온보딩 완료 표시 |
| DELETE | `/api/user/data` | 모든 데이터 삭제 |

### 5.4 포맷 API
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/formats` | 커스텀 포맷 목록 |
| POST | `/api/formats` | 커스텀 포맷 생성 |
| PUT | `/api/formats/[id]` | 커스텀 포맷 수정 |
| DELETE | `/api/formats/[id]` | 커스텀 포맷 삭제 |

---

## 6. 핵심 처리 플로우

### 6.1 녹음 → 문서화 파이프라인
```
1. 웹 녹음 (MediaRecorder API, WebM)
       ↓
2. Supabase Storage 업로드
       ↓
3. WhisperAPI (STT 변환)
       ↓
4. Supabase DB (트랜스크립트 저장)
       ↓
5. OpenAI GPT-4o-mini (포맷별 문서 정리)
       ↓
6. Notion API (페이지 생성 + 오디오 첨부)
       ↓
7. Slack API (완료 알림 + Notion 링크)
```

### 6.2 문서 포맷 종류

**기본 포맷:**
1. **meeting (회의록)**: 참석자, 주요 안건, 결정 사항, 액션 아이템
2. **interview (인터뷰)**: Q&A 형식, 핵심 인사이트
3. **lecture (강의)**: 섹션별 요약, 핵심 요점 정리

**커스텀 포맷:** 사용자가 직접 프롬프트 정의 가능

---

## 7. 페이지 구성

| 경로 | 설명 | 주요 기능 |
|------|------|----------|
| `/` | 랜딩 페이지 | 서비스 소개, Google 로그인, 다국어 지원 |
| `/onboarding` | 온보딩 | Notion/Slack 연동, 기본 포맷 선택 |
| `/dashboard` | 대시보드 | 녹음 버튼, 타이머, 포맷 선택, 사용량 |
| `/history` | 히스토리 | 녹음 목록, 처리 상태, Notion 링크 |
| `/settings` | 설정 | 계정 정보, 통합 관리, 언어 설정, 데이터 삭제 |
| `/settings/formats` | 포맷 설정 | 커스텀 포맷 CRUD |

---

## 8. 제한 사항

- **월 사용량**: 계정당 350분/월 (매월 1일 리셋)
- **최대 녹음 시간**: 120분
- **자동 삭제**: 30일 이상 녹음 파일 자동 삭제

---

## 9. 환경 변수

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# WhisperAPI
WHISPER_API_KEY=

# Notion OAuth
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=

# Slack OAuth
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=

# App
NEXT_PUBLIC_APP_URL=
```

---

## 10. 디자인 시스템

- **스타일**: Glassmorphism (반투명 배경, backdrop-blur)
- **색상**: Slate 900 (#0f172a) + Deep Blue (#1e3a5f) 그라데이션
- **반응형**: 모바일 퍼스트 (320px~)
- **PWA**: manifest.json, service worker 지원

## 10.1 다국어 지원 (i18n)

- **지원 언어**: 한국어(ko), 영어(en)
- **자동 감지**: 
  - Vercel GeoIP 헤더 기반 국가 감지 (KR → 한국어)
  - Cookie 기반 언어 설정 저장 (`flownote_locale`)
- **OAuth 콜백**: 로그인 시 locale을 query parameter로 전달하여 언어 설정 유지
- **Middleware**: 요청마다 locale cookie 설정 및 유지

---

## 11. 개발 명령어

```bash
npm run dev      # 개발 서버 실행
npm run build    # 프로덕션 빌드
npm run start    # 프로덕션 서버 실행
npm run lint     # 린트 검사
```

---

## 12. 관련 문서

- [README.md](../README.md) - 프로젝트 개요 및 빠른 시작
- [SETUP.md](../SETUP.md) - 로컬 개발 환경 설정 가이드
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Vercel 배포 가이드
- [prd.md](./prd.md) - 제품 요구사항 문서 (상세)
