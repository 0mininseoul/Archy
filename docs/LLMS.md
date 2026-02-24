# Archy LLM Context

최종 업데이트: 2026-02-24

이 문서는 LLM이 Archy 코드베이스를 빠르게 이해하도록 핵심 컨텍스트만 정리한 문서입니다.

## 1. 제품 정의

Archy는 음성 녹음을 자동 문서화하는 서비스입니다.

핵심 파이프라인:
- 녹음 세션 시작
- 20초 청크 전사
- 종료 후 AI 정리
- Notion/Google 저장 + Slack/Push 알림

## 2. 핵심 규칙

- 인증: Supabase Auth 기반 (`withAuth` 래퍼)
- 녹음 상태: `recording -> processing -> completed/failed`
- 처리 단계: `transcription`, `formatting`, `saving`
- 기본 저장 정책: 오디오 저장 안 함 (`audio_file_path` nullable)
- 오디오 저장은 사용자 토글(`save_audio_enabled`)일 때만 시도

## 3. 주요 디렉토리

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
    whisper.ts            # Groq STT
    openai.ts             # gpt-4o-mini formatting
    recording-processor.ts
    notion.ts             # page/db 생성 + markdown 변환
    notion-save-targets.ts# fast/deep 탐색/검색
    google.ts             # Docs 생성/폴더 조회
    slack.ts              # 메시지 전송
    push.ts               # web-push
  stores/                 # Zustand user/recordings 캐시
  i18n/                   # ko/en 번역
```

## 4. 데이터 모델 핵심

### users

- 연동 토큰: notion/slack/google
- 저장 대상: notion save target, google folder
- 사용량/플랜: monthly/bonus/promo
- 알림/저장: push, save_audio_enabled

### recordings

- 세션 필드: `last_chunk_index`, `session_paused_at`
- 결과 필드: `transcript`, `formatted_content`, `notion_page_url`, `google_doc_url`
- UX 필드: `is_hidden`, `is_pinned`

### 기타

- `custom_formats`: 사용자 포맷
- `promo_codes`: 프로모션
- `withdrawn_users`: 탈퇴 아카이브

## 5. API 계약 요약

### 녹음

- `POST /api/recordings/start`: 활성 세션 생성/재사용
- `POST /api/recordings/chunk`: 청크 전사 + transcript append
- `POST /api/recordings/finalize`: 세션 종료 후 동기 처리

### 사용자

- `GET /api/user`: UI 캐시용 통합 응답
- `GET /api/user/usage`: 분 사용량 + Pro 상태
- `PATCH /api/user/audio-storage`, `PATCH /api/user/push-enabled`
- `DELETE /api/user/withdraw`: 아카이브 후 hard delete

### Notion 저장 대상

- `GET /api/notion/save-targets?mode=fast|deep`
- `GET /api/notion/save-targets/search?q=...`

## 6. LLM 작업 시 주의사항

- `types/index.ts`는 일부 타입이 오래되어 `lib/types/database.ts`를 우선 기준으로 사용
- 일부 UI 문구(예: 120분 제한)는 안내용이며 강제 종료 로직과 일치하지 않을 수 있음
- finalize는 Vercel 특성상 동기 처리(`await processFromTranscripts`)를 사용
- Notion 목록은 partial/sync_token 흐름이 있으므로 단일 호출 완전성을 가정하면 안 됨

## 7. 문서-코드 정합 기준

문서 업데이트 시 우선순위:
1. `lib/types/database.ts`
2. `app/api/**/route.ts`
3. `lib/services/**`
4. `components/**` (UI/UX 표기)
