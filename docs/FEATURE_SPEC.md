# Archy 기능 명세서

- 버전: 2026.03
- 최종 업데이트: 2026-03-12

## 1. 서비스 요약

Archy는 모바일 웹/PWA 중심의 음성 자동 문서화 서비스입니다.

기본 흐름:
1. 녹음 세션 시작 (`/api/recordings/start`)
2. 20초 단위 청크 전송/전사 (`/api/recordings/chunk`)
3. 필요 시 auto-pause / session resume (`/api/recordings/pause-notify`, `/api/recordings/start`)
4. 종료 의도 제출(`/api/recordings/finalize-intent`) 또는 직접 종료(`/api/recordings/finalize`)
5. 활성 포맷팅 provider(Gemini `gemini-3.1-pro-preview` 또는 OpenAI `gpt-4o-mini`) 정리 + Notion / Google Docs / Slack / Push 후처리

운영 surface:
- `Archy`: 최종 사용자가 쓰는 제품
- `Archy Ops Agent`: Railway에서 상시 실행되는 관리자용 운영 에이전트

## 2. 핵심 사용자 가치

- 회의/강의/인터뷰의 기록 자동화
- Notion/Google Docs/Slack으로 후처리 자동화
- 모바일 환경에서 끊김 대비(청크 재시도/세션 복구/auto-pause)
- 텍스트 중심 저장(오디오 저장은 선택 기능)
- Discord 기반 운영 자동화와 지표 리포트 분리

## 3. 기능 명세

### 3.1 녹음/세션 라이프사이클

- 청크 길이: 20초 (`useChunkedRecorder`)
- 업로드 재시도: 지수 백오프, 최대 5회 (`ChunkUploadManager`)
- 오프라인 대응: 메모리 대기열 유지 후 네트워크 복구 시 재시도
- 파일 제한: 청크 4MB 초과 시 거부
- 세션 상태:
  - `recording`
  - `processing`
  - `completed`
  - `failed`
- 세션 보조 필드:
  - `last_chunk_index`
  - `last_activity_at`
  - `session_paused_at`
  - `termination_reason`
  - `expected_chunk_count`
- auto-pause:
  - `visibility_hidden`
  - `route_unmount`
  - `manual_pause`
- stale timeout: 30분 비활성 시 `/api/cron/stale-recordings`에서 `failed` 처리
- stale recovery candidate:
  - transcript는 있으나 formatting 전 실패한 세션은 recovery 후보로 마킹 가능

### 3.2 전사 품질/라우팅

- 모델: Groq Whisper Large V3
- 다중 키 라우팅:
  - 활성 녹음 유저 3명 이상 시 `GROQ_API_KEY_TIER_2` 우선
  - 활성 녹음 유저 5명 이상 시 `GROQ_API_KEY_TIER_3` 우선
- 예산 제어:
  - 일/시간 단위 오디오 예산
  - ASPD rate limit cooldown
  - `groq_audio_usage_buckets`, `groq_key_health` 사용
- 전사 전 필터:
  - 1KB 미만 chunk skip
  - `avgRms < 0.002` pre-gate
- 전사 후 필터:
  - likely silence
  - outro hallucination
  - mixed-script gibberish / suspicious repetition
- chunk 단위 추적:
  - `recording_chunks`
  - `attempt_count`, `status`, `provider_status_code`, `provider_error_code`
- 품질 메타데이터:
  - `transcription_quality_status`
  - `transcription_warnings`

### 3.3 AI 문서 정리 및 외부 연동

- 모델:
  - `GEMINI_API_KEY`가 있고 시각이 `2026-05-06 00:00:00 KST` 이전이면 Gemini `gemini-3.1-pro-preview`
  - 그 외에는 OpenAI `gpt-4o-mini`
- 기본 정책: Universal Prompt 기반 구조화 문서 생성
- 커스텀 포맷:
  - `is_default` 기본 포맷 지원
  - `{{transcript}}` placeholder를 우선 치환
  - placeholder가 없으면 transcript block 자동 주입
- 결과 저장:
  - `formatted_content`
  - AI 제목(`title`)
- Notion:
  - OAuth 연동 + 수동 토큰/URL 연동(`POST /api/user/notion-manual`)
  - 저장 대상: page/database
  - 저장 대상 탐색 API: `fast`, `deep`, `search`
  - 선택 대상의 icon(emoji/url) 메타데이터 저장
- Google Docs/Drive:
  - OAuth 토큰 저장 및 refresh
  - 폴더 선택 저장
- Slack:
  - OAuth 후 DM 채널 자동 오픈 시도
  - 처리 완료 메시지 + 문서 링크
- Push:
  - Web Push(VAPID)
  - 처리 완료 / auto-pause 알림

### 3.4 온보딩 / 설정 / 데이터 관리

- 온보딩: 2단계
  - Step 1: 필수/선택 동의 저장 (`/api/user/consent`)
  - Step 2: 추천코드 적용 / 시작
- 동의 로그:
  - `users` 스냅샷 필드 업데이트
  - `user_consent_logs`에 이벤트성 로그 저장
- 언어 설정: `ko`, `en`
- 오디오 저장 토글: `save_audio_enabled` (현재 `audio_file_path` 저장은 legacy direct upload path 기준)
- Push 구독 저장/삭제: `/api/user/push-subscription`
- PWA 설치 시각 추적: `/api/user/pwa-install`
- 데이터 전체 삭제:
  - recordings/custom_formats/연동정보 초기화
- 회원 탈퇴:
  - `withdrawn_users` 아카이브 후 public.users + auth 삭제

### 3.5 사용량 / 성장 / 결제

- Free 기본 한도: 월 350분
- 추천 보너스: 추천인/피추천인 각 +350분
- Pro 상태:
  - 프로모션 코드 또는 Polar 구독 이벤트로 부여
  - 현재 usage gating은 `promo_expires_at`을 기준으로 동작
- 커스텀 포맷 제한:
  - Free: 1개
  - Pro: 999개
- 결제 추적:
  - `is_paid_user`
  - `paid_ever`
  - `paid_started_at`
  - `paid_ended_at`
  - `polar_customer_id`
  - `polar_subscription_id`

### 3.6 운영 / 관리자 기능

- 프론트엔드 런타임 오류 수집: `/api/client-errors`
- stale recording 정리 크론: `/api/cron/stale-recordings`
- 관리자 프로모션 통계: `/api/admin/promo/stats`
- Discord 기반 `Archy Ops Agent`
  - 데일리 배치
  - Notion / Google Sheets sync
  - 멘션 기반 운영 요청 처리

## 4. 주요 화면

- `/`: 랜딩 (기능 소개, 연동 소개, Google 로그인)
- `/onboarding`: 2단계 온보딩(동의 / 추천코드)
- `/dashboard`: 녹음 시작/일시정지/재개/종료, 파형, 스텔스 모드
- `/dashboard/history`: 상태별 기록, 고정/숨김, 무한 스크롤
- `/dashboard/recordings/[id]`: 전사본/정리본/오디오 플레이어(선택)
- `/dashboard/settings`: 계정/연동/포맷/알림/데이터/언어/플랜
- `/privacy`, `/terms`, `/use-of-user-data`: 정책 문서

## 5. API 요약

### 5.1 인증

- `GET /api/auth/callback`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `GET /api/auth/notion`
- `GET /api/auth/notion/callback`
- `GET /api/auth/slack`
- `GET /api/auth/slack/callback`
- `GET|POST /api/auth/signout`

### 5.2 녹음 파이프라인

- `POST /api/recordings/start`
- `GET /api/recordings/start`
- `POST /api/recordings/chunk`
- `POST /api/recordings/pause-notify`
- `POST /api/recordings/finalize-intent`
- `POST /api/recordings/finalize`
- `GET /api/cron/stale-recordings`

### 5.3 녹음 조회/관리

- `GET /api/recordings`
- `POST /api/recordings` (legacy direct upload path)
- `GET /api/recordings/[id]`
- `PATCH /api/recordings/[id]` (`title`, `is_hidden`, `is_pinned`)
- `DELETE /api/recordings/[id]`
- `GET /api/recordings/[id]/audio`

### 5.4 사용자/설정

- `GET /api/user`
- `GET /api/user/profile`
- `GET /api/user/usage`
- `GET|PUT /api/user/language`
- `POST /api/user/consent`
- `POST /api/user/onboarding`
- `GET|DELETE /api/user/data`
- `GET|PATCH /api/user/audio-storage`
- `GET|POST|DELETE /api/user/push-subscription`
- `PATCH /api/user/push-enabled`
- `PUT|DELETE /api/user/google`
- `PUT|DELETE /api/user/notion-database`
- `POST /api/user/notion-manual`
- `DELETE /api/user/slack`
- `GET|POST /api/user/referral`
- `POST /api/user/pwa-install`
- `DELETE /api/user/withdraw`

### 5.5 Notion / Google 도구 API

- `GET /api/google/folders`
- `GET /api/notion/pages`
- `GET /api/notion/databases`
- `POST /api/notion/page`
- `POST /api/notion/database`
- `GET /api/notion/save-targets`
- `GET /api/notion/save-targets/search`

### 5.6 포맷 / 프로모션 / 결제 / 운영

- `GET|POST|PUT|DELETE /api/formats`
- `GET /api/promo/status`
- `POST /api/promo/apply`
- `GET /api/admin/promo/stats`
- `GET /api/checkout`
- `POST /api/webhook/polar`
- `POST /api/client-errors`

## 6. 데이터 모델 핵심

### users

주요 필드:
- 기본: `id`, `email`, `google_id`, `name`, `language`, `is_onboarded`
- 연동: Notion/Slack/Google 토큰 및 저장 대상 정보
- 알림/설치: `push_subscription`, `push_enabled`, `pwa_installed_at`
- 저장옵션: `save_audio_enabled`
- 동의: `age_14_confirmed_at`, `terms_*`, `privacy_*`, `service_quality_opt_in`, `marketing_opt_in`
- 사용량/플랜: `monthly_minutes_used`, `bonus_minutes`, `last_reset_at`, `promo_*`
- 결제: `is_paid_user`, `paid_*`, `polar_*`

### recordings

주요 필드:
- 상태: `status`, `processing_step`, `error_step`, `error_message`
- 결과: `transcript`, `formatted_content`, `notion_page_url`, `google_doc_url`
- 세션: `last_chunk_index`, `last_activity_at`, `session_paused_at`, `termination_reason`
- 품질: `expected_chunk_count`, `transcription_quality_status`, `transcription_warnings`
- UX: `is_hidden`, `is_pinned`

### 기타

- `recording_chunks`: chunk 상태/재시도/신호 메타데이터
- `custom_formats`: 사용자 포맷
- `promo_codes`: 프로모션
- `user_consent_logs`: 동의 로그
- `withdrawn_users`: 탈퇴 사용자 아카이브
- `amplitude_signup_identity_mappings`: signup attribution
- `groq_audio_usage_buckets`, `groq_key_health`: STT 예산 추적
- `agent_memory_threads`, `agent_memory_messages`, `agent_memory_facts`: Ops Agent 메모리

## 7. 알려진 운영 제약

- 녹음 UI는 120분 가이드를 표시하지만, 실제 강제 종료 기준은 별도 하드캡이 아니라 lifecycle 로직과 브라우저 상태에 좌우됩니다.
- 오디오 저장이 꺼져 있으면 signed URL 재생 경로는 제공되지 않습니다.
- `save_audio_enabled`와 signed playback route는 존재하지만, 현재 session/chunk recorder는 `audio_file_path`를 채우지 않습니다. 오디오 재생 경로는 주로 legacy direct-upload 녹음 기준입니다.
- Notion deep 탐색은 sync token 기반 점진 동기화라 partial 결과가 반환될 수 있습니다.
- `/api/recordings/finalize-intent`는 background task가 보장되지 않는 환경에서 `/api/recordings/finalize` 폴백이 필요할 수 있습니다.
- `database/schema.sql` 단독 적용으로는 현재 코드가 기대하는 스키마를 충족하지 못합니다.
