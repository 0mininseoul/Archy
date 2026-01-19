# Archy 기능 명세서

**버전:** 3.0
**최종 업데이트:** 2026-01-10

---

## 1. 서비스 개요

**Archy**는 음성을 자동으로 문서화하는 AI 기반 서비스입니다.

| 항목 | 설명 |
|------|------|
| **서비스명** | Archy |
| **핵심 가치** | 녹음 한 번으로 완성되는 자동 문서 |
| **타겟 사용자** | 직장인, 대학생, 프리랜서 |
| **플랫폼** | 웹 (PWA 지원) |

---

## 2. 핵심 기능

### 2.1 음성 녹음
| 기능 | 상세 |
|------|------|
| 웹 녹음 | 브라우저 전용 녹음 (MediaRecorder API) |
| 안정성 | 20초 단위 청크 분할 전송 (네트워크 불안정 대비) |
| 이어하기 | 녹음 중단 시 세션 자동 저장 및 복구 (LocalStorage) |
| 백그라운드 | PWA 백그라운드 녹음 지원 (Silent Audio Keep-Alive) |
| 최대 시간 | 120분 |
| 화면 유지 | Wake Lock API로 녹음 중 화면 꺼짐 방지 |

### 2.2 실시간 음성 전사 (Real-time STT)
| 기능 | 상세 |
|------|------|
| API | Groq Whisper Large V3 |
| 처리 방식 | 20초 주기 청크 단위 실시간 전사 및 병합 |
| 언어 | 다국어 자동 감지 (한국어/영어 우선) |
| 정확도 | 99% (Whisper Large V3 기준) |

### 2.3 AI 문서 정리
| 기능 | 상세 |
|------|------|
| API | OpenAI GPT-4o-mini |
| 기본 포맷 | 회의록 형식 (참석자, 주요 안건, 결정 사항, 액션 아이템) |
| 커스텀 포맷 | 사용자 정의 프롬프트 지원 (최대 3개) |
| 출력 형식 | Markdown |

### 2.4 Notion 연동
| 기능 | 상세 |
|------|------|
| 인증 | OAuth 2.0 |
| 저장 위치 | 사용자 선택 데이터베이스 |
| 자동 생성 | 페이지 자동 생성 (제목, 본문, 속성) |
| 속성 | 포맷, 녹음 시간, 생성일 |

### 2.5 Slack 연동
| 기능 | 상세 |
|------|------|
| 인증 | OAuth 2.0 |
| 알림 채널 | 사용자 선택 채널 |
| 알림 내용 | 완료 알림 + Notion 페이지 링크 |

### 2.6 실시간 처리 상태
| 단계 | 표시 텍스트 |
|------|------------|
| transcription | 전사 중... / Transcribing... |
| formatting | 요약 중... / Summarizing... |
| saving | 저장 중... / Saving... |

- 3초 간격 폴링으로 실시간 업데이트
- 처리 중인 녹음이 있을 때 안내 문구 표시

### 2.7 Push 알림
| 기능 | 상세 |
|------|------|
| 기술 | Web Push API + web-push 라이브러리 |
| 트리거 | 녹음 처리 완료 시 자동 발송 |
| 설정 | 설정 페이지에서 ON/OFF 가능 |

### 2.8 리퍼럴 시스템
| 기능 | 상세 |
|------|------|
| 추천 코드 | 사용자별 고유 8자리 코드 |
| 보너스 | 추천인/피추천인 모두 보너스 분 적립 |
| 적용 시점 | 온보딩 Step 1에서 입력 |

### 2.9 Google Docs 연동
| 기능 | 상세 |
|------|------|
| 인증 | Google OAuth 2.0 |
| 저장 위치 | 사용자 Google Drive |
| 자동 생성 | 문서 자동 생성 |

### 2.10 사용자 탈퇴
| 기능 | 상세 |
|------|------|
| 탈퇴 처리 | 사용자 데이터 삭제 + withdrawn_users 테이블 이동 |
| 데이터 보관 | 탈퇴 사용자 데이터 별도 보관 |

---

## 3. 페이지별 기능

### 3.1 랜딩 페이지 (`/`)

| 섹션 | 기능 |
|------|------|
| Navigation | 로고, Features/How it works 링크, "시작하기" 버튼 |
| Hero | 핵심 메시지, "무료로 시작하기" 버튼 |
| Features | 3가지 핵심 기능 소개 (녹음, 전사, 요약) |
| How It Works | 4단계 프로세스 (녹음→전사→정리→공유) |
| Integrations | Notion, Slack, Google 로고 및 설명 |
| CTA | 하단 행동 유도 섹션, "무료로 시작하기" 버튼 |
| Footer | 사업자 정보, 개인정보처리방침, 이용약관 링크 |

**버튼 텍스트:**
- Navigation 버튼: "시작하기" (Google 심볼 없음)
- Hero/CTA 버튼: "무료로 시작하기" (Google 심볼 없음)

### 3.2 온보딩 페이지 (`/onboarding`)

| 단계 | 기능 |
|------|------|
| Step 1 | 환영 메시지, "시작하기" 버튼 |
| Step 2 | Notion/Slack 연결, "뒤로", "건너뛰기", "다음" 버튼 |
| Step 3 | 포맷 선택 (기본/커스텀), "뒤로", "설정 완료" 버튼 |
| Step 4 | PWA 설치 안내, 완료 버튼 |

### 3.3 대시보드 페이지 (`/dashboard`)

| 기능 | 상세 |
|------|------|
| 헤더 | Archy 로고 |
| 녹음 카드 | 녹음 버튼, 타이머, 일시정지/중지 |
| 연동 경고 | Notion/Slack 미연동 시 주의 문구 표시 |
| 개인정보 안내 | "음성 녹음해도 어차피 안 들으시죠? 음성은 텍스트로 변환된 후 즉시 폐기해 드립니다." |
| 하단 탭 | 녹음, 기록, 설정 네비게이션 |

**연동 경고 문구:**
- Notion 미연동: "Notion이 연결되지 않았습니다. 녹음 내용이 Notion에 저장되지 않습니다."
- Slack 미연동: "Slack이 연결되지 않았습니다. 완료 알림이 발송되지 않습니다."

### 3.4 기록 페이지 (`/history`)

| 기능 | 상세 |
|------|------|
| 필터 | 전체, 처리 중, 완료, 실패 |
| 처리 중 안내 | "이 페이지에서 나가셔도 자동으로 처리 후 슬랙으로 알려드립니다." |
| 녹음 카드 | 제목(편집 가능), 상태, 시간, Notion 링크, 삭제 버튼 |
| 실시간 상태 | 전사 중.../요약 중.../저장 중... 표시 |
| 에러 표시 | 실패 시 에러 단계 및 메시지 표시 |
| 폴링 | 처리 중 녹음 있을 시 3초 간격 자동 새로고침 |

### 3.5 녹음 상세 페이지 (`/recordings/[id]`)

| 기능 | 상세 |
|------|------|
| 전사본 | 원본 텍스트 표시 |
| 정리된 내용 | AI 요약 결과 표시 |
| 토글 | 전사본/정리된 내용 전환 |
| 메타데이터 | 녹음 시간, 생성일 |

### 3.6 설정 페이지 (`/settings`)

| 섹션 | 기능 |
|------|------|
| 계정 정보 | 이메일, 사용량 (X분/350분) |
| Notion 연동 | 연결 상태, 저장 위치 설정, 재연결 |
| Slack 연동 | 연결 상태, 재연결 |
| 요약 포맷 | 기본/커스텀 포맷 관리 |
| 언어 설정 | 한국어/English 선택 |
| 푸시 알림 | ON/OFF 설정 |
| 리퍼럴 코드 | 내 추천 코드 확인 및 복사 |
| 데이터 관리 | 30일 자동 삭제 안내, 모든 데이터 삭제 |
| 탈퇴 | 사용자 탈퇴 버튼 |
| 로그아웃 | 로그아웃 버튼 |

---

## 4. 데이터 타입

### 4.1 Recording
```typescript
interface Recording {
  id: string;
  user_id: string;
  title: string;
  audio_file_path: string | null;
  duration_seconds: number;
  format: "meeting" | "interview" | "lecture" | "custom";
  status: "processing" | "completed" | "failed";
  processing_step?: "transcription" | "formatting" | "saving";
  transcript?: string;
  formatted_content?: string;
  notion_page_url?: string;
  error_message?: string;
  error_step?: "upload" | "transcription" | "formatting" | "notion" | "slack";
  created_at: string;
}
```

### 4.2 User
```typescript
interface User {
  id: string;
  email: string;
  google_id: string;
  name?: string;
  notion_access_token?: string;
  notion_database_id?: string;
  notion_save_target_type?: "database" | "page";
  notion_save_target_id?: string;
  slack_access_token?: string;
  slack_channel_id?: string;
  google_access_token?: string;
  google_refresh_token?: string;
  google_docs_enabled?: boolean;
  monthly_minutes_used: number;
  bonus_minutes: number;
  last_reset_at: string;
  language: "ko" | "en";
  is_onboarded: boolean;
  push_enabled: boolean;
  push_subscription?: object;
  referral_code: string;
  referred_by?: string;
  created_at: string;
}
```

### 4.3 CustomFormat
```typescript
interface CustomFormat {
  id: string;
  user_id: string;
  name: string;
  prompt: string;
  created_at: string;
}
```

---

## 5. 제한 사항

| 항목 | 제한 |
|------|------|
| 월 사용량 | 350분/계정 |
| 최대 녹음 시간 | 120분 |
| 커스텀 포맷 | 최대 3개 |
| 데이터 보관 | 30일 후 자동 삭제 |
| 오디오 저장 | 저장 안 함 (텍스트만 보관) |

---

## 6. 에러 처리

| 에러 단계 | 설명 | 사용자 표시 |
|----------|------|------------|
| upload | 파일 업로드 실패 | 파일 업로드 단계 |
| transcription | 음성 전사 실패 | 음성 전사 단계 |
| formatting | AI 정리 실패 | AI 포맷팅 단계 |
| notion | Notion 저장 실패 | Notion 연동 단계 |
| slack | Slack 알림 실패 | Slack 알림 단계 |

- transcription 실패: 처리 중단
- formatting 실패: 원본 전사본으로 대체, 처리 계속
- notion/slack 실패: 에러 기록 후 처리 완료

---

## 7. 다국어 지원

### 7.1 지원 언어
- 한국어 (ko)
- 영어 (en)

### 7.2 언어 감지 순서
1. 사용자 설정 (DB)
2. Cookie (`archy_locale`)
3. Vercel GeoIP 헤더 (한국이면 ko, 그 외 en)

---

## 8. PWA 기능

| 기능 | 상세 |
|------|------|
| 백그라운드 녹음 | 화면이 꺼지거나 앱이 백그라운드로 가도 녹음 유지 (iOS/Android) |
| 스마트 일시정지 | 백그라운드 전환 시 자동 저장 및 푸시 알림 발송 |
| 오프라인 지원 | Service Worker 캐싱 |
| 설치 가능 | manifest.json 제공 (A2HS) |
| 아이콘 | 192x192, 512x512, Maskable 지원 |
| 테마 색상 | #0f172a (Slate 900) |

---

## 9. 보안

| 항목 | 상세 |
|------|------|
| 인증 | Google OAuth 2.0 (Supabase Auth) |
| 데이터 격리 | Row Level Security (RLS) |
| 오디오 보안 | 서버 메모리에서만 처리, 저장 안 함 |
| API 보호 | 서버 사이드 토큰 관리 |

---

## 10. 향후 계획

- [ ] WebSocket 기반 실시간 진행 상황 표시
- [ ] 녹음 편집 기능
- [ ] 팀 공유 기능
- [ ] 추가 언어 지원
- [ ] 유료 플랜