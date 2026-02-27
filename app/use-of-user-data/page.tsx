export default function UseOfUserDataPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-10 px-5">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          서비스 품질 향상을 위한 데이터 활용
        </h1>
        <p className="mt-3 text-sm text-gray-500">
          최종 수정일: 2026년 2월 27일
        </p>

        <div className="mt-6 space-y-6 text-gray-700 leading-relaxed">
          <section>
            <p>
              Archy는 이용자의 사전 동의 없이 저장된 녹음, 전사, 요약 데이터를 품질 개선 목적으로 임의 열람하지 않습니다.
              아래 선택 항목에 동의한 경우에 한해, 서비스 안정화와 품질 개선을 위해 제한된 범위에서 활용합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. 수집 및 활용 대상</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>녹음 음성 데이터</li>
              <li>전사 텍스트 및 요약/포맷 결과물</li>
              <li>오류 분석에 필요한 최소한의 이용 로그 및 메타데이터</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. 이용 목적</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>음성 인식 정확도 및 요약 품질 개선</li>
              <li>기능 오류 재현 및 장애 대응</li>
              <li>서비스 성능 최적화와 고객 지원</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. 보호 조치</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>최소 권한 원칙에 따라 승인된 담당자만 접근</li>
              <li>접근 사유와 이력(감사 로그) 기록</li>
              <li>목적 달성 후 지체 없이 삭제 또는 비식별 처리</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. 동의 거부권</h2>
            <p>
              이용자는 서비스 품질 향상을 위한 데이터 활용 동의를 거부할 수 있으며,
              거부하더라도 Archy의 기본 기능 이용에는 제한이 없습니다.
            </p>
          </section>

          <section className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-sm">
              본 문서는 선택 동의 항목 안내를 위한 별도 고지이며,
              일반적인 개인정보 처리 기준은 개인정보처리방침과 이용약관을 따릅니다.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
