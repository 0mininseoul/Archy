"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";

export default function AuthCodeError() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const message = searchParams.get("message") || "인증 중 오류가 발생했습니다.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="max-w-md w-full mx-4">
        <div className="glass-card p-8 text-center">
          <div className="mb-6">
            <svg
              className="w-16 h-16 mx-auto text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold mb-4">인증 오류</h1>

          <p className="text-gray-300 mb-6">{message}</p>

          <button
            onClick={() => router.push("/")}
            className="glass-button w-full text-lg"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
