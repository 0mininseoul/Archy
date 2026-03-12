# Archy LLM Context

최종 업데이트: 2026-03-12

이 문서는 LLM이 Archy 코드베이스를 빠르게 이해하도록 핵심 컨텍스트만 정리한 문서입니다.

## 1. 용어 정의

- `Archy`: 최종 사용자가 사용하는 음성 자동 문서화 서비스
- `Archy Ops Agent`: Railway에서 상시 실행되는 관리자용 운영 에이전트
- `아키 운영 에이전트`를 권장 명칭으로 사용하고, `아키 에이전트`는 동일 의미의 별칭으로 해석
- 두 용어를 같은 주체로 취급하지 않음

## 2. 제품 정의

Archy는 음성 녹음을 자동 문서화하는 서비스입니다.

핵심 파이프라인:
- 녹음 세션 시작
- 20초 청크 전사
- 종료 의도 제출(`finalize-intent`) 또는 직접 finalize
- AI 정리 및 외부 연동 저장
- Notion/Google 저장 + Slack/Push 알림
- 필요 시 `Archy Ops Agent`가 Discord/Railway에서 운영 배치 및 Notion/Google Sheets 동기화 수행

## 3. 핵심 규칙

- 인증: Supabase Auth 기반 (`withAuth` 래퍼)
- 녹음 상태: `recording -> processing -> completed/failed`
- 처리 단계: `transcription`, `formatting`, `saving`
- 기본 session/chunk 파이프라인은 text-first이며 `audio_file_path`는 대체로 `null`
- legacy `POST /api/recordings` 경로만 사용자 토글(`save_audio_enabled`)일 때 오디오 저장을 시도
- 녹음 세션은 30분 비활성 시 stale cleanup 대상이 됨 (`/api/cron/stale-recordings`)
- chunk 단위 품질 메타데이터는 `recording_chunks`, `expected_chunk_count`, `transcription_warnings`에 반영될 수 있음
- Slack OAuth callback은 `NEXT_PUBLIC_APP_URL/api/auth/slack/callback`에서 파생됨
- `database/schema.sql`만으로는 현재 앱 스키마가 완성되지 않으며 `database/migrations/*`가 필수

## 4. 주요 디렉토리

```text
app/
  api/
    recordings/           # start/chunk/finalize + CRUD
    auth/                 # google/notion/slack OAuth
    user/                 # 설정, 사용량, 연동, 탈퇴
    notion/               # Notion 도구 API
    promo/, checkout/, webhook/polar/
components/
  recorder/               # ChunkedAudioRecorder UI
  settings/               # integrations/formats/account/plan
lib/
  services/
    chunk-upload-manager.ts
    recording-finalizer.ts
    recording-transcription-state.ts
    groq-key-router.ts
    groq-audio-budget.ts
    whisper.ts            # Groq STT
    openai.ts             # Gemini 3.1 Pro Preview formatting -> 2026-05-06 KST 이후 gpt-4o-mini 복귀
    recording-processor.ts
    notion.ts             # page/db 생성 + markdown 변환
    notion-save-targets.ts# fast/deep 탐색/검색
    google.ts             # Docs 생성/폴더 조회
    slack.ts              # 메시지 전송
    push.ts               # web-push
  stores/                 # Zustand user/recordings 캐시
  i18n/                   # ko/en 번역
scripts/
  agent/                  # Archy Ops Agent (Discord bot + daily runner)
```

## 5. 데이터 모델 핵심

### users

- 연동 토큰: notion/slack/google
- 저장 대상: notion save target, google folder
- 사용량/플랜: monthly/bonus/promo/paid fields
- 알림/저장: push, save_audio_enabled, `pwa_installed_at`
- 동의 로그 스냅샷: `age_14_confirmed_at`, `terms_*`, `privacy_*`, `service_quality_opt_in`, `marketing_opt_in`

### recordings

- 세션 필드: `last_chunk_index`, `session_paused_at`
- 라이프사이클 필드: `last_activity_at`, `termination_reason`, `expected_chunk_count`
- 품질 필드: `transcription_quality_status`, `transcription_warnings`
- 결과 필드: `transcript`, `formatted_content`, `notion_page_url`, `google_doc_url`
- UX 필드: `is_hidden`, `is_pinned`

### 기타

- `recording_chunks`: chunk 단위 전사 상태/재시도/신호 메타데이터
- `custom_formats`: 사용자 포맷
- `promo_codes`: 프로모션
- `user_consent_logs`: 동의 이력
- `withdrawn_users`: 탈퇴 아카이브
- `amplitude_signup_identity_mappings`: Amplitude signup attribution 보조
- `groq_audio_usage_buckets`, `groq_key_health`: STT 오디오 예산/ASPD 상태
- `agent_memory_*`: Ops Agent 대화 메모리

## 6. API 계약 요약

### 녹음

- `POST /api/recordings/start`: 활성 세션 생성/재사용
- `POST /api/recordings/chunk`: 청크 전사 + transcript append
- `POST /api/recordings/pause-notify`: auto-pause 상태 반영 + push 알림
- `POST /api/recordings/finalize-intent`: background finalize 예약 (`202 Accepted`)
- `POST /api/recordings/finalize`: 세션 종료 후 동기 처리/복구
- `GET /api/cron/stale-recordings`: 비활성 세션 failed 정리 (`CRON_SECRET` 필요)

### 사용자

- `GET /api/user`: UI 캐시용 통합 응답
- `GET /api/user/profile`: 연동 상태 요약
- `GET /api/user/usage`: 분 사용량 + Pro 상태
- `POST /api/user/consent`: 온보딩 동의 저장
- `PATCH /api/user/audio-storage`, `PATCH /api/user/push-enabled`
- `POST /api/user/pwa-install`: 설치 시각 기록
- `DELETE /api/user/withdraw`: 아카이브 후 hard delete

### Notion 저장 대상

- `GET /api/notion/save-targets?mode=fast|deep`
- `GET /api/notion/save-targets/search?q=...`
- `GET /api/notion/pages`, `GET /api/notion/databases`
- `POST /api/notion/page`, `POST /api/notion/database`

## 7. LLM 작업 시 주의사항

- `types/index.ts`는 일부 타입이 오래되어 `lib/types/database.ts`를 우선 기준으로 사용
- 일부 UI 문구(예: 120분 제한)는 안내용이며 강제 종료 로직과 일치하지 않을 수 있음
- `finalize-intent`는 `after()` 기반 background finalize를 시도하지만, 실패 시 `finalize` 폴백이 존재함
- Notion 목록은 partial/sync_token 흐름이 있으므로 단일 호출 완전성을 가정하면 안 됨
- 추천/프로모션/유료 여부는 사용자-facing UI와 헬퍼 상수 일부가 다를 수 있으므로 실제 라우트 로직을 우선 확인

## 8. 문서-코드 정합 기준

문서 업데이트 시 우선순위:
1. `lib/types/database.ts`
2. `app/api/**/route.ts`
3. `lib/services/**`
4. `components/**` (UI/UX 표기)
