# Archy 랜딩/초기 진입 UX 계획 (Current Snapshot)

최종 업데이트: 2026-02-24

## 1. 목적

랜딩 페이지의 목적은 `Google OAuth 가입 시작`이며,
추가로 다음을 명확하게 전달한다.

- 녹음 → 전사 → 정리 → 공유 자동화
- Notion/Google Docs/Slack 연동
- 모바일/PWA 중심 경험

## 2. 현재 정보 구조

1. Navigation
- 로고(Archy)
- 섹션 이동: Features / How it works
- CTA 버튼: 시작하기

2. Hero
- 핵심 메시지 + 서브카피
- CTA 버튼: 무료로 시작하기 (Beta)

3. Features
- 고품질 녹음
- 즉시 전사
- AI 자동 요약
- 스마트 알림

4. How it works
- Record
- Transcribe
- Organize
- Share

5. Integrations
- Notion
- Google Docs
- Slack

6. CTA (하단)
- 반복 CTA 버튼

7. Footer
- 사업자 정보
- Privacy / Terms 링크

## 3. 현재 구현 규칙

- 모바일 퍼스트 spacing/typography
- 랜딩은 `I18n` 기반 ko/en 카피
- 로그인 버튼은 `GoogleLoginButton` 컴포넌트 재사용
- 인앱 브라우저 감지 시 Android는 외부 브라우저 유도, iOS는 안내 모달 노출
- promo 쿼리 파라미터(`?promo=...`)를 OAuth redirect로 전달

## 4. 디자인 가이드

- 톤: 밝은 배경 + 슬레이트 계열 + 블루 포인트
- 주요 버튼: gradient primary
- 카드: 얕은 border/shadow
- 섹션 전환: 슬라이드/페이드 기반 최소 애니메이션

## 5. 연관 파일

- `components/landing/LandingClient.tsx`
- `components/google-login-button.tsx`
- `components/in-app-browser-modal.tsx`
- `lib/i18n/translations.ts`
- `app/globals.css`

## 6. 개선 후보

- 퍼널 이벤트(랜딩 스크롤/CTA 클릭) 세분화
- A/B 테스트용 헤드라인/CTA 실험
- 데스크탑 환경 안내(모바일 권장) 노출 시점 미세조정
