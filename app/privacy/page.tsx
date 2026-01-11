export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          개인정보 처리방침
        </h1>

        <div className="space-y-6 text-gray-700">
          <section>
            <p className="mb-4">
              Archy(이하 "회사")는 정보통신망 이용촉진 및 정보보호 등에 관한
              법률, 개인정보보호법 등 관련 법령상의 개인정보보호 규정을
              준수하며, 관련 법령에 의거한 개인정보 처리방침을 정하여 이용자
              권익 보호에 최선을 다하고 있습니다.
            </p>
            <p className="text-sm text-gray-500">최종 수정일: 2025년 1월</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              1. 수집하는 개인정보 항목
            </h2>
            <p className="mb-3">
              회사는 서비스 제공을 위해 다음과 같은 개인정보를 수집합니다:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong>필수 정보:</strong> 이메일 주소, 이름 (소셜 로그인 시)
              </li>
              <li>
                <strong>서비스 이용 정보:</strong> 음성 녹음 파일, 변환된 텍스트
                데이터
              </li>
              <li>
                <strong>연동 서비스 정보:</strong> Notion 워크스페이스 정보,
                Slack 채널 정보
              </li>
              <li>
                <strong>자동 수집 정보:</strong> IP 주소, 쿠키, 서비스 이용 기록,
                접속 로그
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              2. 개인정보의 수집 및 이용 목적
            </h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>회원 가입 및 관리</li>
              <li>음성 파일의 텍스트 변환 서비스 제공</li>
              <li>Notion 및 Slack 연동을 통한 자동화 서비스 제공</li>
              <li>서비스 개선 및 맞춤형 서비스 제공</li>
              <li>고객 문의 및 불만 처리</li>
              <li>서비스 이용 통계 분석</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              3. 개인정보의 보유 및 이용 기간
            </h2>
            <p className="mb-3">
              회사는 원칙적으로 개인정보 수집 및 이용 목적이 달성된 후에는 해당
              정보를 지체 없이 파기합니다. 단, 다음의 경우에는 해당 기간 동안
              보관합니다:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                회원 탈퇴 시: 탈퇴 즉시 파기 (단, 관계 법령에 따라 보존이 필요한
                경우 예외)
              </li>
              <li>
                음성 파일 및 변환 데이터: 사용자가 삭제하기 전까지 보관 (최대 1년)
              </li>
              <li>
                법령에 따른 보존:
                <ul className="list-circle list-inside ml-6 mt-2 space-y-1">
                  <li>계약 또는 청약철회 등에 관한 기록: 5년</li>
                  <li>대금결제 및 재화 등의 공급에 관한 기록: 5년</li>
                  <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년</li>
                  <li>서비스 이용 기록, 접속 로그: 3개월</li>
                </ul>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              4. 개인정보의 제3자 제공
            </h2>
            <p className="mb-3">
              회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.
              다만, 다음의 경우에는 예외로 합니다:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>이용자가 사전에 동의한 경우</li>
              <li>법령의 규정에 의거하거나 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              5. 개인정보 처리의 위탁
            </h2>
            <p className="mb-3">
              회사는 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁하고
              있습니다:
            </p>
            <div className="bg-gray-50 p-4 rounded-lg">
              <ul className="space-y-3">
                <li>
                  <strong>Supabase:</strong> 데이터베이스 호스팅 및 사용자 인증
                </li>
                <li>
                  <strong>Groq:</strong> 음성 텍스트 변환 (Whisper Large V3)
                </li>
                <li>
                  <strong>OpenAI:</strong> AI 문서 정리 및 요약
                </li>
                <li>
                  <strong>Notion:</strong> 문서 저장 (사용자 직접 연동)
                </li>
                <li>
                  <strong>Slack:</strong> 알림 전송 (사용자 직접 연동)
                </li>
                <li>
                  <strong>Google:</strong> 사용자 인증 (OAuth)
                </li>
                <li>
                  <strong>Vercel:</strong> 애플리케이션 호스팅
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              6. 이용자의 권리와 행사 방법
            </h2>
            <p className="mb-3">
              이용자는 언제든지 다음과 같은 권리를 행사할 수 있습니다:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>개인정보 열람 요구</li>
              <li>오류 등이 있을 경우 정정 요구</li>
              <li>삭제 요구</li>
              <li>처리 정지 요구</li>
            </ul>
            <p className="mt-3">
              권리 행사는 서비스 내 설정 메뉴를 통해 직접 하실 수 있으며, 고객센터를 통해서도 가능합니다.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              7. 개인정보의 파기 절차 및 방법
            </h2>
            <p className="mb-3">
              회사는 개인정보 보유 기간의 경과, 처리 목적 달성 등 개인정보가
              불필요하게 되었을 때에는 지체 없이 해당 개인정보를 파기합니다.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong>파기 절차:</strong> 보유 기간이 경과하거나 처리 목적이
                달성된 개인정보는 내부 방침에 따라 파기합니다.
              </li>
              <li>
                <strong>파기 방법:</strong> 전자적 파일 형태의 정보는 기록을 재생할
                수 없는 기술적 방법을 사용하여 삭제하며, 종이에 출력된 개인정보는
                분쇄기로 분쇄하거나 소각합니다.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              8. 개인정보 보호책임자
            </h2>
            <p className="mb-3">
              회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보
              처리와 관련한 정보주체의 불만처리 및 피해구제를 위하여 아래와 같이
              개인정보 보호책임자를 지정하고 있습니다.
            </p>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p>
                개인정보 관련 문의사항이 있으시면 아래 연락처로 문의해 주시기
                바랍니다.
              </p>
              <p className="mt-2 text-gray-600">
                이메일: contact@ascentum.co.kr
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              9. 개인정보 처리방침의 변경
            </h2>
            <p>
              이 개인정보 처리방침은 2025년 1월 1일부터 적용됩니다. 법령, 정책
              또는 보안기술의 변경에 따라 내용의 추가, 삭제 및 수정이 있을
              경우에는 변경 사항의 시행 7일 전부터 공지사항을 통하여 고지할
              것입니다.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
