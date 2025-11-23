"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const [usage, setUsage] = useState({ used: 0, limit: 350 });
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const [usageResponse, userResponse] = await Promise.all([
        fetch("/api/user/usage"),
        fetch("/api/user/profile"),
      ]);

      const usageData = await usageResponse.json();
      const userData = await userResponse.json();

      setUsage(usageData);
      setUserEmail(userData.email || "");
    } catch (error) {
      console.error("Failed to fetch user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllData = async () => {
    const confirmed = confirm(
      "정말 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
    );

    if (!confirmed) return;

    const doubleCheck = confirm(
      "주의: 모든 녹음, 커스텀 포맷, 연결된 통합이 삭제됩니다. 계속하시겠습니까?"
    );

    if (!doubleCheck) return;

    try {
      const response = await fetch("/api/user/data", {
        method: "DELETE",
      });

      if (response.ok) {
        alert("모든 데이터가 삭제되었습니다.");
        router.push("/");
      } else {
        throw new Error("Failed to delete data");
      }
    } catch (error) {
      console.error("Failed to delete data:", error);
      alert("데이터 삭제에 실패했습니다.");
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      router.push("/");
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-800">설정</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Account Info */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            계정 정보
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이메일
              </label>
              <div className="text-gray-900">
                {loading ? "로딩 중..." : userEmail || "이메일 정보 없음"}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                사용량
              </label>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {usage.used}분 / {usage.limit}분
                  </span>
                  <span className="text-gray-600">
                    {Math.round((usage.used / usage.limit) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min((usage.used / usage.limit) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Connected Integrations */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            연결된 통합
          </h2>
          <div className="space-y-4">
            {/* Notion */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="text-2xl">📔</div>
                <div>
                  <h3 className="font-semibold text-gray-800">Notion</h3>
                  <p className="text-sm text-gray-600">
                    정리된 문서가 자동으로 저장됩니다
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  (window.location.href = "/api/auth/notion?returnTo=/settings")
                }
                className="px-4 py-2 border-2 border-indigo-600 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition-colors"
              >
                재연결
              </button>
            </div>

            {/* Slack */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="text-2xl">💬</div>
                <div>
                  <h3 className="font-semibold text-gray-800">Slack</h3>
                  <p className="text-sm text-gray-600">완료 알림을 받습니다</p>
                </div>
              </div>
              <button
                onClick={() =>
                  (window.location.href = "/api/auth/slack?returnTo=/settings")
                }
                className="px-4 py-2 border-2 border-indigo-600 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition-colors"
              >
                재연결
              </button>
            </div>
          </div>
        </div>

        {/* Format Settings */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">
              문서 포맷 설정
            </h2>
            <button
              onClick={() => router.push("/settings/formats")}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              포맷 관리
            </button>
          </div>
          <p className="text-sm text-gray-600">
            기본 포맷을 수정하거나 커스텀 포맷을 만들 수 있습니다
          </p>
        </div>

        {/* Data Management */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            데이터 관리
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
              <div>
                <h3 className="font-semibold text-gray-800">자동 삭제</h3>
                <p className="text-sm text-gray-600">
                  30일 이상 된 녹음 자동 삭제
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <h3 className="font-semibold text-red-800 mb-2">위험 영역</h3>
              <p className="text-sm text-red-600 mb-4">
                이 작업은 되돌릴 수 없습니다. 신중하게 결정하세요.
              </p>
              <button
                onClick={handleDeleteAllData}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                모든 데이터 삭제
              </button>
            </div>
          </div>
        </div>

        {/* Sign Out */}
        <div className="glass-card p-6">
          <button
            onClick={handleSignOut}
            className="w-full py-3 px-4 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </main>
    </div>
  );
}
