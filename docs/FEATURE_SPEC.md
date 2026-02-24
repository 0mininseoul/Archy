# Archy 기능 명세서

- 버전: 2026.02
- 최종 업데이트: 2026-02-24

## 1. 서비스 요약

Archy는 모바일 웹/PWA 중심의 음성 자동 문서화 서비스입니다.

기본 흐름:
1. 녹음 세션 시작 (`/api/recordings/start`)
2. 20초 단위 청크 전송/전사 (`/api/recordings/chunk`)
3. 종료 후 문서 정리/저장 (`/api/recordings/finalize`)

## 2. 핵심 사용자 가치

- 회의/강의/인터뷰의 기록 자동화
- Notion/Google Docs/Slack으로 후처리 자동화
- 모바일 환경에서 끊김 대비(청크 재시도/세션 복구)
- 텍스트 중심 저장(오디오 저장은 선택 기능)

## 3. 기능 명세

### 3.1 녹음/전사

- 청크 길이: 20초 (`useChunkedRecorder`)
- 업로드 재시도: 지수 백오프, 최대 5회 (`ChunkUploadManager`)
- 파일 제한: 청크 4MB 초과 시 거부
- 중복 청크 방지: `last_chunk_index` 기반
- 세션 복구: `session_paused_at` + localStorage/sessionStorage 기반
- 상태값:
  - `recording`
  - `processing`
  - `completed`
  - `failed`

### 3.2 AI 문서 정리

- 모델: OpenAI `gpt-4o-mini`
- 기본 정책: Universal Prompt(맥락 기반 제목 + 구조화 문서)
- 커스텀 포맷: 사용자가 생성한 프롬프트 중 기본값(`is_default`) 우선
- 결과 저장:
  - `formatted_content`
  - AI 제목(`title`)

### 3.3 외부 연동

- Notion
  - OAuth 연동 + 수동 토큰/URL 연동(`user/notion-manual`)
  - 저장 대상: page/database
  - 저장 대상 탐색 API: fast/deep + 검색
- Google Docs/Drive
  - OAuth 토큰 저장 및 refresh
  - 폴더 선택 저장
- Slack
  - OAuth 후 DM 채널 자동 오픈 시도
  - 처리 완료 메시지 + 문서 링크 버튼
- Push
  - Web Push(VAPID)
  - 처리 완료/일시정지 알림

### 3.4 설정/운영 기능

- 언어 설정: `ko`, `en`
- 오디오 저장 토글: `save_audio_enabled`
- 데이터 전체 삭제: recordings/custom_formats/연동정보 초기화
- 회원 탈퇴: `withdrawn_users` 아카이브 후 계정 삭제

### 3.5 사용량/플랜

- Free 기본 한도: 월 350분
- 추천 보너스: 추천인/피추천인 각 +350분
- Pro 상태:
  - 프로모션 코드 또는 Polar 구독 이벤트로 부여
  - 활성 기간 동안 사용량 무제한
- 커스텀 포맷 제한:
  - Free: 1개
  - Pro: 사실상 무제한(999)

## 4. 주요 화면

- `/`: 랜딩 (기능 소개, 연동 소개, Google 로그인)
- `/onboarding`: 2단계 온보딩
- `/dashboard`: 녹음 시작/중지, 파형, 스텔스 모드
- `/dashboard/history`: 상태별 기록, 고정/숨김, 무한 스크롤
- `/dashboard/recordings/[id]`: 전사본/정리본/오디오 플레이어(선택)
- `/dashboard/settings`: 계정/연동/포맷/알림/데이터/언어/플랜

## 5. API 요약

### 5.1 인증

- `GET /api/auth/callback`
- `POST /api/auth/signout`
- `GET /api/auth/notion`
- `GET /api/auth/notion/callback`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `GET /api/auth/slack`
- `GET /api/auth/slack/callback`

### 5.2 녹음 파이프라인

- `POST /api/recordings/start`
- `GET /api/recordings/start`
- `POST /api/recordings/chunk`
- `POST /api/recordings/finalize`
- `POST /api/recordings/pause-notify`

### 5.3 녹음 조회/관리

- `GET /api/recordings`
- `POST /api/recordings` (레거시 업로드 경로)
- `GET /api/recordings/[id]`
- `PATCH /api/recordings/[id]` (title/is_hidden/is_pinned)
- `DELETE /api/recordings/[id]`
- `GET /api/recordings/[id]/audio`

### 5.4 사용자/설정

- `GET /api/user`
- `GET /api/user/usage`
- `GET|PUT /api/user/language`
- `POST /api/user/onboarding`
- `GET|DELETE /api/user/data`
- `GET /api/user/profile`
- `GET|POST /api/user/referral`
- `GET|PATCH /api/user/audio-storage`
- `GET|POST|DELETE /api/user/push-subscription`
- `PATCH /api/user/push-enabled`
- `PUT|DELETE /api/user/google`
- `PUT|DELETE /api/user/notion-database`
- `POST /api/user/notion-manual`
- `DELETE /api/user/slack`
- `POST /api/user/pwa-install`
- `DELETE /api/user/withdraw`

### 5.5 Notion 도구 API

- `GET /api/notion/pages`
- `GET /api/notion/databases`
- `POST /api/notion/page`
- `POST /api/notion/database`
- `GET /api/notion/save-targets`
- `GET /api/notion/save-targets/search`

### 5.6 포맷/프로모션/결제

- `GET|POST|PUT|DELETE /api/formats`
- `GET /api/promo/status`
- `POST /api/promo/apply`
- `GET /api/admin/promo/stats`
- `GET /api/checkout`
- `POST /api/webhook/polar`

## 6. 데이터 모델 핵심

### users

주요 필드:
- 기본: `id`, `email`, `google_id`, `name`, `language`, `is_onboarded`
- 연동: Notion/Slack/Google 토큰 및 대상 정보
- 알림: `push_subscription`, `push_enabled`
- 저장옵션: `save_audio_enabled`
- 사용량: `monthly_minutes_used`, `bonus_minutes`, `last_reset_at`
- 성장/플랜: `referral_code`, `referred_by`, `promo_*`

### recordings

주요 필드:
- 상태: `status`, `processing_step`, `error_step`, `error_message`
- 결과: `transcript`, `formatted_content`, `notion_page_url`, `google_doc_url`
- 세션: `last_chunk_index`, `session_paused_at`
- UX: `is_hidden`, `is_pinned`

### 기타

- `custom_formats` (사용자 포맷)
- `promo_codes` (프로모션)
- `withdrawn_users` (탈퇴 사용자 아카이브)

## 7. 알려진 운영 제약

- 녹음 UI는 120분 가이드를 표시하지만, 실제 강제 종료는 클라이언트 로직에서 자동 stop 처리하지 않습니다.
- 오디오 저장이 꺼져 있으면 오디오 파일 재생 URL이 제공되지 않습니다.
- Notion deep 탐색은 sync token 기반 점진 동기화이며 partial 결과가 반환될 수 있습니다.
