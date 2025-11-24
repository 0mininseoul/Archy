"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  last_edited_time: string;
}

interface NotionPage {
  id: string;
  title: string;
  url: string;
  last_edited_time: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [usage, setUsage] = useState({ used: 0, limit: 350 });
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [notionConnected, setNotionConnected] = useState(false);
  const [notionDatabaseId, setNotionDatabaseId] = useState<string | null>(null);
  const [showDatabaseModal, setShowDatabaseModal] = useState(false);
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [modalTab, setModalTab] = useState<"select" | "create">("select");
  const [selectedPageId, setSelectedPageId] = useState("");
  const [newDbTitle, setNewDbTitle] = useState("Flownote Recordings");
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, []);

  useEffect(() => {
    // Check if returning from Notion OAuth and should open DB selector
    const params = new URLSearchParams(window.location.search);
    if (params.get("notion") === "connected" && params.get("selectDb") === "true") {
      openDatabaseModal();
      // Clean up URL
      window.history.replaceState({}, "", "/settings");
    }
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
      setNotionConnected(!!userData.notion_access_token);
      setNotionDatabaseId(userData.notion_database_id || null);
    } catch (error) {
      console.error("Failed to fetch user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const openDatabaseModal = async () => {
    setShowDatabaseModal(true);
    setModalLoading(true);
    try {
      const [dbResponse, pageResponse] = await Promise.all([
        fetch("/api/notion/databases"),
        fetch("/api/notion/pages"),
      ]);

      if (dbResponse.ok) {
        const dbData = await dbResponse.json();
        setDatabases(dbData.databases || []);
      }

      if (pageResponse.ok) {
        const pageData = await pageResponse.json();
        setPages(pageData.pages || []);
      }
    } catch (error) {
      console.error("Failed to fetch Notion data:", error);
      alert("Notion 데이터를 불러오는데 실패했습니다.");
    } finally {
      setModalLoading(false);
    }
  };

  const selectDatabase = async (databaseId: string) => {
    try {
      const response = await fetch("/api/user/notion-database", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ databaseId }),
      });

      if (response.ok) {
        setNotionDatabaseId(databaseId);
        setShowDatabaseModal(false);
        alert("Notion 데이터베이스가 설정되었습니다.");
      } else {
        throw new Error("Failed to update database");
      }
    } catch (error) {
      console.error("Failed to set database:", error);
      alert("데이터베이스 설정에 실패했습니다.");
    }
  };

  const createDatabase = async () => {
    if (!selectedPageId) {
      alert("페이지를 선택해주세요.");
      return;
    }

    setModalLoading(true);
    try {
      const response = await fetch("/api/notion/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: selectedPageId,
          title: newDbTitle,
        }),
      });

      if (response.ok) {
        const { databaseId } = await response.json();
        await selectDatabase(databaseId);
      } else {
        throw new Error("Failed to create database");
      }
    } catch (error) {
      console.error("Failed to create database:", error);
      alert("데이터베이스 생성에 실패했습니다.");
    } finally {
      setModalLoading(false);
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
                    {notionConnected
                      ? notionDatabaseId
                        ? "정리된 문서가 자동으로 저장됩니다"
                        : "데이터베이스를 선택해주세요"
                      : "연결하고 데이터베이스를 선택하세요"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (notionConnected) {
                    openDatabaseModal();
                  } else {
                    window.location.href = "/api/auth/notion?returnTo=/settings&selectDb=true";
                  }
                }}
                className="px-4 py-2 border-2 border-indigo-600 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition-colors"
              >
                {notionConnected ? "DB 선택" : "연결하기"}
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

      {/* Database Selection Modal */}
      {showDatabaseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800">
                  Notion 데이터베이스 설정
                </h2>
                <button
                  onClick={() => setShowDatabaseModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setModalTab("select")}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    modalTab === "select"
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  기존 DB 선택
                </button>
                <button
                  onClick={() => setModalTab("create")}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    modalTab === "create"
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  새 DB 생성
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)]">
              {modalLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : modalTab === "select" ? (
                <div className="space-y-3">
                  {databases.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-600 mb-4">
                        사용 가능한 데이터베이스가 없습니다.
                      </p>
                      <button
                        onClick={() => setModalTab("create")}
                        className="text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        새 데이터베이스 생성하기 →
                      </button>
                    </div>
                  ) : (
                    databases.map((db) => (
                      <button
                        key={db.id}
                        onClick={() => selectDatabase(db.id)}
                        className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-indigo-600 hover:bg-indigo-50 transition-all text-left"
                      >
                        <div className="font-semibold text-gray-800 mb-1">
                          {db.title}
                        </div>
                        <div className="text-sm text-gray-600">
                          마지막 수정: {new Date(db.last_edited_time).toLocaleDateString("ko-KR")}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      데이터베이스 이름
                    </label>
                    <input
                      type="text"
                      value={newDbTitle}
                      onChange={(e) => setNewDbTitle(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                      placeholder="Flownote Recordings"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      생성할 페이지 선택
                    </label>
                    {pages.length === 0 ? (
                      <p className="text-gray-600 text-sm">
                        사용 가능한 페이지가 없습니다. Notion에서 페이지를 만든 후 다시 시도하세요.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {pages.map((page) => (
                          <button
                            key={page.id}
                            onClick={() => setSelectedPageId(page.id)}
                            className={`w-full p-3 border-2 rounded-lg transition-all text-left ${
                              selectedPageId === page.id
                                ? "border-indigo-600 bg-indigo-50"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <div className="font-medium text-gray-800">
                              {page.title}
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              마지막 수정: {new Date(page.last_edited_time).toLocaleDateString("ko-KR")}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={createDatabase}
                    disabled={!selectedPageId || modalLoading}
                    className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    데이터베이스 생성
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
