"use client";

import { useState } from "react";

export default function AdminPage() {
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleImpersonate = async () => {
    if (!userInput.trim()) return;
    setLoading(true);
    setError("");

    try {
      const isEmail = userInput.includes("@");
      const body = isEmail
        ? { email: userInput.trim() }
        : { userId: userInput.trim() };

      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "요청 실패");
        return;
      }

      // Session cookies are now set to the target user - navigate to dashboard
      window.location.href = "/dashboard";
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-900 rounded-2xl p-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Admin</h1>
          <p className="text-sm text-gray-400 mt-1">
            유저 ID 또는 이메일을 입력하면 해당 유저 화면으로 진입합니다.
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleImpersonate()}
            placeholder="User ID 또는 이메일"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
          />

          <button
            onClick={handleImpersonate}
            disabled={loading || !userInput.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-xl transition-colors text-sm"
          >
            {loading ? "진입 중..." : "유저 화면 진입"}
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
