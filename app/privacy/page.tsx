export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 border-b pb-4">
          개인정보 처리방침 (Privacy Policy)
        </h1>

        <div className="space-y-10 text-gray-700">
          {/* Introduction */}
          <section>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <p className="mb-4 leading-relaxed">
                  Archy(이하 "회사")는 정보통신망 이용촉진 및 정보보호 등에 관한
                  법률, 개인정보보호법 등 관련 법령상의 개인정보보호 규정을
                  준수하며, 관련 법령에 의거한 개인정보 처리방침을 정하여 이용자
                  권익 보호에 최선을 다하고 있습니다.
                </p>
                <p className="text-sm text-gray-500">최종 수정일: 2025년 1월 12일</p>
              </div>
              <div className="text-gray-600 italic border-l-2 pl-4 border-gray-100">
                <p className="mb-4 leading-relaxed">
                  Archy ("the Company") complies with the personal information protection regulations of relevant laws and regulations, such as the Act on Promotion of Information and Communications Network Utilization and Information Protection and the Personal Information Protection Act.
                </p>
                <p className="text-sm text-gray-500">Last Updated: January 12, 2025</p>
              </div>
            </div>
          </section>

          {/* Google Limited Use Disclosure - CRITICAL FOR VERIFICATION */}
          <section className="bg-blue-50 p-6 rounded-xl border border-blue-100">
            <h2 className="text-xl font-bold text-blue-900 mb-4 flex items-center">
              <span className="mr-2">G</span> Google API 서비스 데이터 정책 준수 (Google API Services User Data Policy)
            </h2>
            <div className="space-y-4">
              <p className="font-medium text-blue-800">
                Archy's use and transfer to any other app of information received from Google APIs will adhere to{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy#limited-use-requirements"
                  className="underline hover:text-blue-600"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>
              <p className="text-blue-700">
                Archy가 Google API로부터 수신한 정보를 여타 앱으로 사용하는 행위 및 전송하는 행위는 '제한적 사용' 요건을 포함하여 Google API 서비스 사용자 데이터 정책을 준수합니다.
              </p>
            </div>
          </section>

          {/* 1. Items collected */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex justify-between items-center">
              <span>1. 수집하는 개인정보 항목</span>
              <span className="text-lg font-normal text-gray-400">Personal Information Collected</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>필수 정보:</strong> 이메일 주소, 이름 (소셜 로그인 시)</li>
                <li><strong>서비스 이용 정보:</strong> 음성 녹음 파일, 변환된 텍스트 데이터</li>
                <li><strong>연동 서비스 정보:</strong> Notion 워크스페이스 정보, Slack 채널 정보, Google Drive/Docs 서비스 정보</li>
                <li><strong>자동 수집 정보:</strong> IP 주소, 쿠키, 서비스 이용 기록, 접속 로그</li>
              </ul>
              <ul className="list-disc list-inside space-y-2 ml-4 text-gray-600">
                <li><strong>Required:</strong> Email address, Name (via social login)</li>
                <li><strong>Service Data:</strong> Voice recordings, Transcribed text</li>
                <li><strong>Integration Data:</strong> Notion workspace info, Slack channel info, Google Drive/Docs info</li>
                <li><strong>Auto-collected:</strong> IP address, Cookies, Usage records, Access logs</li>
              </ul>
            </div>
          </section>

          {/* 2. Purpose */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex justify-between items-center">
              <span>2. 개인정보의 수집 및 이용 목적</span>
              <span className="text-lg font-normal text-gray-400">Purpose of Collection and Use</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>회원 가입 및 관리</li>
                <li>음성 파일의 텍스트 변환 및 요약 서비스 제공</li>
                <li><strong>Google 연동을 통한 문서 저장 및 관리:</strong> 사용자가 명시적으로 선택한 경우에 한해 Google Drive 및 Docs로 노트를 수출</li>
                <li>서비스 개선 및 고객 지원</li>
              </ul>
              <ul className="list-disc list-inside space-y-2 ml-4 text-gray-600">
                <li>User registration and management</li>
                <li>Voice transcription and summarization</li>
                <li><strong>Document Management via Google:</strong> Exporting notes to Google Drive and Docs only upon user's explicit request</li>
                <li>Service improvement and customer support</li>
              </ul>
            </div>
          </section>

          {/* AI Processing Disclosure */}
          <section className="bg-gray-50 p-6 rounded-xl border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              인공지능(AI) 서비스 이용 및 데이터 처리 (AI Service & Data Handling)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div className="space-y-2">
                <p>Archy는 원활한 서비스 제공을 위해 음성 데이터와 텍스트 데이터를 외부 AI 엔진(OpenAI, Groq 등)에 전송하여 처리할 수 있습니다.</p>
                <p className="font-semibold text-red-600">회사는 사용자의 Google 데이터를 포함한 서비스 데이터를 AI 모델 학습 목적으로 사용하지 않습니다.</p>
              </div>
              <div className="space-y-2 text-gray-600">
                <p>Archy may process voice and text data through external AI engines (OpenAI, Groq, etc.) to provide its services.</p>
                <p className="font-semibold text-red-600 text-gray-900">The Company does not use service data, including your Google user data, to train AI models.</p>
              </div>
            </div>
          </section>

          {/* 3. Retention */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex justify-between items-center">
              <span>3. 개인정보의 보유 및 이용 기간</span>
              <span className="text-lg font-normal text-gray-400">Retention and Use Period</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="mb-3">원칙적으로 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>회원 탈퇴 시: 즉시 파기</li>
                  <li>음성 및 변환 데이터: 사용자 삭제 시까지 (최대 1년)</li>
                  <li>법령 기록(계약 등): 5년</li>
                </ul>
              </div>
              <div className="text-gray-600">
                <p className="mb-3">In principle, data is destroyed without delay once the purpose of collection and use is achieved.</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Account Withdrawal: Immediate destruction</li>
                  <li>Service Data: Until deleted by user (Max. 1 year)</li>
                  <li>Legal Records (Contracts, etc.): 5 years</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 5. Entrustment (Third Party) */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex justify-between items-center">
              <span>5. 개인정보 처리의 위탁</span>
              <span className="text-lg font-normal text-gray-400">Entrustment of Data Processing</span>
            </h2>
            <div className="bg-gray-50 p-6 rounded-lg overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 text-left">수탁 업체 (Processor)</th>
                    <th className="py-2 text-left">업무 내용 (Service)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-3 font-medium">Supabase</td>
                    <td className="py-3 text-gray-600">데이터베이스 호스팅 및 인증 (Hosting & Auth)</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium">OpenAI / Groq</td>
                    <td className="py-3 text-gray-600">음성-텍스트 변환 및 AI 요약 (STT & AI Summarization)</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium">Google / Notion / Slack</td>
                    <td className="py-3 text-gray-600">사용자 요청에 따른 문서 연동 및 알림 (Integration & Notifications)</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium">Vercel</td>
                    <td className="py-3 text-gray-600">애플리케이션 호스팅 (Platform Hosting)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Contact */}
          <section className="border-t pt-10">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. 개인정보 보호책임자 (Data Protection Officer)</h2>
            <div className="bg-gray-50 p-6 rounded-xl">
              <p className="font-medium">Ascentum (Archy)</p>
              <p className="text-gray-600 mt-2">Email: contact@ascentum.co.kr</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
