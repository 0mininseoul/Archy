# Lean Canvas - Archy

- 업데이트 기준일: 2026-02-24
- 참고: 본 문서는 2025-12-14 Flownote 버전을 Archy 현재 서비스 기준으로 갱신한 버전입니다.

## 1. 문제 (Problem)

- 녹음, 전사, 정리, 공유가 분리되어 있어 회의 후처리에 시간이 많이 든다.
- 모바일 환경에서 녹음을 오래 유지하기 어렵고, 중단/재개가 불안정하다.
- 결과물을 Notion/Google/Slack으로 다시 옮기는 반복 작업이 비효율적이다.

## 2. 고객 세그먼트 (Customer Segments)

- Core: 스타트업/IT 실무자(PO/PM/개발자/디자이너)
- Niche: 인터뷰·콘텐츠 제작 직군(에디터/리서처/프리랜서)
- Mass: 대학생/연구자(강의·스터디·세미나 정리)

## 3. 고유 가치 제안 (Unique Value Proposition)

- "녹음 버튼 한 번으로, 문서 작성과 공유까지 자동으로 끝낸다."
- Mobile-first: 앱 설치 강제 없이 웹/PWA에서 바로 사용
- Privacy-default: 기본적으로 오디오 파일을 저장하지 않고 텍스트 중심 처리

## 4. 솔루션 (Solution)

- Session + Chunk 기반 녹음(20초 단위 업로드/재시도/복구)
- Groq Whisper + Gemini/OpenAI 포맷팅으로 빠른 전사/문서화
- Notion/Google Docs 자동 저장 + Slack/Push 알림
- Smart 포맷 + 커스텀 포맷 기본값 설정

## 5. 채널 (Channels)

- 제품 내 리퍼럴 공유(Kakao/Instagram DM) + 추천코드 보상
- 랜딩 페이지 SEO/콘텐츠 유입 + 온보딩 전환
- 프로모션 링크(`?promo=`) 기반 캠페인 유입
- 업무 커뮤니티/팀 단위 파일럿 확산

## 6. 수익원 (Revenue Streams)

- Free: 월 350분 사용량 제공
- Pro: 구독 기반(Polar 결제)으로 무제한 사용량 제공
- Promo: 기간 한정 Pro 체험(코드/캠페인)

## 7. 비용 구조 (Cost Structure)

- AI API: Groq(STT), Gemini/OpenAI(문서 정리)
- 인프라: Vercel + Supabase(Auth/DB/Storage)
- 외부 연동 운영: Notion/Google/Slack OAuth 및 유지보수
- 제품 개선/운영: 고객지원, 품질/성능 개선 비용

## 8. 핵심 지표 (Key Metrics)

- Recorder MAU(실제 녹음 시작 사용자)
- 녹음 완료율(start -> finalize 성공률)
- 연동 활성률(Notion/Google/Slack)
- Free -> Pro 전환율 및 Pro 유지율
- 사용자당 월간 처리 시간(분)

## 9. 경쟁 우위 (Unfair Advantage)

- 청크 업로드 + 세션 복구 중심의 모바일 안정성
- 저장/알림까지 한 번에 끝나는 통합 워크플로우
- 기본 비저장(오디오) 정책과 선택적 저장 옵션의 균형
- 웹 링크 진입 기반의 낮은 도입 장벽
