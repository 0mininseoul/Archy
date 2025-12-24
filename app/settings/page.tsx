"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { BottomTab } from "@/components/navigation/bottom-tab";

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

interface NotionSaveTarget {
  type: "database" | "page";
  id: string;
  title: string;
}

interface CustomFormat {
  id: string;
  name: string;
  prompt: string;
  is_default: boolean;
  created_at: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();

  // State definitions
  const [usage, setUsage] = useState({ used: 0, limit: 350, total: 0 });
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);

  // Feature states
  const [notionConnected, setNotionConnected] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [autoSave, setAutoSave] = useState(true);

  // Notion database states
  const [notionDatabaseId, setNotionDatabaseId] = useState<string | null>(null);
  const [showDatabaseModal, setShowDatabaseModal] = useState(false);
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [modalTab, setModalTab] = useState<"select" | "create">("select");
  const [selectedPageId, setSelectedPageId] = useState("");
  const [newDbTitle, setNewDbTitle] = useState("Flownote Recordings");
  const [modalLoading, setModalLoading] = useState(false);

  // Notion 기본 저장 위치 드롭다운
  const [showSaveTargetDropdown, setShowSaveTargetDropdown] = useState(false);
  const [saveTarget, setSaveTarget] = useState<NotionSaveTarget | null>(null);
  const [saveTargetSearch, setSaveTargetSearch] = useState("");
  const [dropdownLoading, setDropdownLoading] = useState(false);

  // Custom format states
  const [customFormats, setCustomFormats] = useState<CustomFormat[]>([]);
  const [showFormatForm, setShowFormatForm] = useState(false);
  const [newFormatName, setNewFormatName] = useState("");
  const [newFormatPrompt, setNewFormatPrompt] = useState("");
  const [formatLoading, setFormatLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isNotionJustConnected = params.get("notion") === "connected";

    if (isNotionJustConnected) {
      // Notion 연결 완료 후 URL 파라미터 제거
      window.history.replaceState({}, "", "/settings");
      // DB 저장 완료 대기 후 데이터 가져오기 (즉시 호출하지 않음)
      setTimeout(() => {
        fetchUserData();
        fetchCustomFormats();
      }, 800);
    } else {
      // 일반적인 경우 즉시 데이터 가져오기
      fetchUserData();
      fetchCustomFormats();
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

      // 디버깅: API 응답 확인
      console.log("[Settings] User profile response:", {
        hasNotionToken: !!userData.notion_access_token,
        hasSlackToken: !!userData.slack_access_token,
        notionDbId: userData.notion_database_id,
      });

      setUsage({
        used: usageData.used || 0,
        limit: usageData.limit || 350,
        total: usageData.used || 0
      });
      setUserEmail(userData.email || "");
      setNotionConnected(!!userData.notion_access_token);
      setSlackConnected(!!userData.slack_access_token);
      setNotionDatabaseId(userData.notion_database_id || null);

      // 기존 DB ID가 있으면 해당 정보 표시
      if (userData.notion_database_id) {
        const db = databases.find(d => d.id === userData.notion_database_id);
        if (db) {
          setSaveTarget({ type: "database", id: db.id, title: db.title });
        }
      }
    } catch (error) {
      console.error("Failed to fetch user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomFormats = async () => {
    try {
      const response = await fetch("/api/formats");
      if (response.ok) {
        const data = await response.json();
        setCustomFormats(data.formats || []);
      }
    } catch (error) {
      console.error("Failed to fetch custom formats:", error);
    }
  };

  const handleCreateFormat = async () => {
    if (!newFormatName || !newFormatPrompt) return;

    setFormatLoading(true);
    try {
      const response = await fetch("/api/formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFormatName,
          prompt: newFormatPrompt,
          is_default: false,
        }),
      });

      if (response.ok) {
        await fetchCustomFormats();
        setShowFormatForm(false);
        setNewFormatName("");
        setNewFormatPrompt("");
        alert(t.settings.formats.saveSuccess);
      } else {
        const data = await response.json();
        alert(data.error || t.settings.formats.saveFailed);
      }
    } catch (error) {
      console.error("Failed to create format:", error);
      alert(t.settings.formats.saveFailed);
    } finally {
      setFormatLoading(false);
    }
  };

  const handleDeleteFormat = async (id: string) => {
    if (!confirm(t.settings.formats.deleteConfirm)) return;

    try {
      const response = await fetch(`/api/formats?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await fetchCustomFormats();
        alert(t.settings.formats.deleteSuccess);
      } else {
        alert(t.settings.formats.deleteFailed);
      }
    } catch (error) {
      console.error("Failed to delete format:", error);
      alert(t.settings.formats.deleteFailed);
    }
  };

  const handleSetDefaultFormat = async (id: string) => {
    try {
      const response = await fetch("/api/formats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_default: true }),
      });

      if (response.ok) {
        await fetchCustomFormats();
      }
    } catch (error) {
      console.error("Failed to set default format:", error);
    }
  };

  const handleConnect = (service: 'notion' | 'slack') => {
    if (service === 'notion') {
      // 연동 후 바로 settings로 돌아옴 (selectDb 파라미터 제거)
      window.location.href = "/api/auth/notion?returnTo=/settings";
    } else if (service === 'slack') {
      window.location.href = "/api/auth/slack?returnTo=/settings";
    }
  };

  // 기본 저장 위치 드롭다운 열기
  const openSaveTargetDropdown = async () => {
    setShowSaveTargetDropdown(true);
    setDropdownLoading(true);
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
    } finally {
      setDropdownLoading(false);
    }
  };

  // 저장 위치 선택
  const selectSaveTarget = async (target: NotionSaveTarget) => {
    try {
      const response = await fetch("/api/user/notion-database", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseId: target.type === "database" ? target.id : null,
          pageId: target.type === "page" ? target.id : null,
          saveTargetType: target.type,
        }),
      });

      if (response.ok) {
        setSaveTarget(target);
        setShowSaveTargetDropdown(false);
        setSaveTargetSearch("");
      }
    } catch (error) {
      console.error("Failed to set save target:", error);
    }
  };

  // 필터링된 결과
  const filteredDatabases = databases.filter(db =>
    db.title.toLowerCase().includes(saveTargetSearch.toLowerCase())
  );
  const filteredPages = pages.filter(page =>
    page.title.toLowerCase().includes(saveTargetSearch.toLowerCase())
  );

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
      alert(t.settings.notionModal.fetchFailed);
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
        alert(t.settings.notionModal.dbSet);
      } else {
        throw new Error("Failed to update database");
      }
    } catch (error) {
      console.error("Failed to set database:", error);
      alert(t.settings.notionModal.dbSetFailed);
    }
  };

  const createDatabase = async () => {
    if (!selectedPageId) {
      alert(t.settings.notionModal.selectPageFirst);
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
      alert(t.settings.notionModal.createFailed);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteAllData = async () => {
    const confirmed = confirm(t.settings.data.deleteConfirm);

    if (!confirmed) return;

    const doubleCheck = confirm(t.settings.data.deleteDoubleConfirm);

    if (!doubleCheck) return;

    try {
      const response = await fetch("/api/user/data", {
        method: "DELETE",
      });

      if (response.ok) {
        alert(t.settings.data.deleteSuccess);
        router.push("/");
      } else {
        throw new Error("Failed to delete data");
      }
    } catch (error) {
      console.error("Failed to delete data:", error);
      alert(t.settings.data.deleteFailed);
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
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-header-title">{t.settings.title}</h1>
      </header>

      {/* Main Content */}
      <main className="app-main px-4 py-4">
        <div className="space-y-4">
          {/* Account Info */}
          <div className="card p-4">
            <h2 className="text-base font-bold text-slate-900 mb-3">
              {t.settings.account.title}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {t.settings.account.email}
                </label>
                <div className="text-sm text-slate-900 font-medium">
                  {loading ? t.common.loading : userEmail || t.settings.account.noEmail}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-2">
                  {t.settings.account.usage}
                </label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 font-medium">
                      {usage.used} mins / {usage.limit} mins
                    </span>
                    <span className="text-slate-500">
                      {Math.round((usage.used / usage.limit) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-900 transition-all duration-500"
                      style={{ width: `${Math.min((usage.total / usage.limit) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Integrations */}
          <div className="card p-4">
            <h2 className="text-base font-bold text-slate-900 mb-3">
              {t.settings.integrations.title}
            </h2>
            <div className="space-y-3">
              {/* Notion */}
              <div className="p-3 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-xl">
                    📔
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm">{t.settings.integrations.notion.title}</h3>
                    <p className="text-xs text-slate-500 truncate">
                      {notionConnected
                        ? saveTarget
                          ? `저장 위치: ${saveTarget.title}`
                          : t.settings.integrations.notion.selectDb
                        : t.settings.integrations.notion.notConnected}
                    </p>
                  </div>
                </div>

                {notionConnected ? (
                  <div className="space-y-2">
                    {/* 기본 저장 위치 드롭다운 */}
                    <div className="relative">
                      <button
                        onClick={openSaveTargetDropdown}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-left text-sm font-medium text-slate-700 flex items-center justify-between min-h-[44px]"
                      >
                        <span className="truncate">
                          {saveTarget ? `📁 ${saveTarget.title}` : "기본 저장 위치 선택"}
                        </span>
                        <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* 드롭다운 메뉴 */}
                      {showSaveTargetDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-64 overflow-hidden">
                          {/* 검색 입력 */}
                          <div className="p-2 border-b border-slate-100">
                            <input
                              type="text"
                              value={saveTargetSearch}
                              onChange={(e) => setSaveTargetSearch(e.target.value)}
                              placeholder="검색..."
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                              autoFocus
                            />
                          </div>

                          <div className="overflow-y-auto max-h-48">
                            {dropdownLoading ? (
                              <div className="flex justify-center py-4">
                                <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                              </div>
                            ) : (
                              <>
                                {/* 데이터베이스 섹션 */}
                                {filteredDatabases.length > 0 && (
                                  <div>
                                    <div className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-50">
                                      데이터베이스 (새 아이템으로 추가)
                                    </div>
                                    {filteredDatabases.map((db) => (
                                      <button
                                        key={db.id}
                                        onClick={() => selectSaveTarget({ type: "database", id: db.id, title: db.title })}
                                        className="w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2 min-h-[44px]"
                                      >
                                        <span>📊</span>
                                        <span className="truncate">{db.title}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {/* 페이지 섹션 */}
                                {filteredPages.length > 0 && (
                                  <div>
                                    <div className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-50">
                                      페이지 (새 페이지로 추가)
                                    </div>
                                    {filteredPages.map((page) => (
                                      <button
                                        key={page.id}
                                        onClick={() => selectSaveTarget({ type: "page", id: page.id, title: page.title })}
                                        className="w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2 min-h-[44px]"
                                      >
                                        <span>📄</span>
                                        <span className="truncate">{page.title}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {filteredDatabases.length === 0 && filteredPages.length === 0 && (
                                  <div className="px-3 py-4 text-center text-sm text-slate-500">
                                    검색 결과가 없습니다
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* 닫기 버튼 */}
                          <div className="p-2 border-t border-slate-100">
                            <button
                              onClick={() => {
                                setShowSaveTargetDropdown(false);
                                setSaveTargetSearch("");
                              }}
                              className="w-full py-2 text-sm text-slate-500 font-medium"
                            >
                              닫기
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={openDatabaseModal}
                      className="w-full px-3 py-2.5 text-sm text-slate-600 font-medium hover:bg-slate-50 rounded-lg min-h-[44px]"
                    >
                      + 새 데이터베이스 만들기
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleConnect('notion')}
                    className="w-full px-4 py-2.5 bg-slate-900 text-white rounded-lg font-bold text-sm min-h-[44px]"
                  >
                    {t.settings.integrations.notion.connect}
                  </button>
                )}
              </div>

              {/* Slack */}
              <div className="p-3 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-xl">
                    💬
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm">{t.settings.integrations.slack.title}</h3>
                    <p className="text-xs text-slate-500">{t.settings.integrations.slack.description}</p>
                  </div>
                  <button
                    onClick={() => handleConnect('slack')}
                    className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium min-h-[44px]"
                  >
                    {slackConnected ? t.settings.integrations.slack.reconnect : "연결"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Custom Formats */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900">
                {t.settings.formats.title}
              </h2>
              {customFormats.length < 3 && !showFormatForm && (
                <button
                  onClick={() => setShowFormatForm(true)}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-bold text-xs min-h-[36px]"
                >
                  {t.settings.formats.addNew}
                </button>
              )}
            </div>

            <div className="space-y-3">
              {/* Default Format */}
              <div className="p-3 border border-slate-200 rounded-xl bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-lg border border-slate-200">
                    📝
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm">{t.settings.formats.default}</h3>
                    <p className="text-xs text-slate-500 truncate">{t.settings.formats.defaultDesc}</p>
                  </div>
                </div>
              </div>

              {/* Custom Formats List */}
              {customFormats.map((format) => (
                <div
                  key={format.id}
                  className={`p-3 border rounded-xl ${
                    format.is_default
                      ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-lg">
                      ✨
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-sm">{format.name}</h3>
                        {format.is_default && (
                          <span className="px-1.5 py-0.5 bg-slate-900 text-white text-[10px] font-bold rounded-full">
                            {t.settings.formats.isDefault}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{format.prompt}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!format.is_default && (
                        <button
                          onClick={() => handleSetDefaultFormat(format.id)}
                          className="px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-100 rounded-lg min-h-[32px]"
                        >
                          기본값
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteFormat(format.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg min-h-[32px] min-w-[32px]"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* New Format Form */}
              {showFormatForm && (
                <div className="p-3 border border-slate-200 rounded-xl bg-white space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t.settings.formats.formatName}
                    </label>
                    <input
                      type="text"
                      value={newFormatName}
                      onChange={(e) => setNewFormatName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none"
                      placeholder={t.settings.formats.formatName}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {t.settings.formats.formatPrompt}
                    </label>
                    <textarea
                      value={newFormatPrompt}
                      onChange={(e) => setNewFormatPrompt(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none resize-none"
                      rows={3}
                      placeholder={t.settings.formats.promptPlaceholder}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowFormatForm(false);
                        setNewFormatName("");
                        setNewFormatPrompt("");
                      }}
                      className="flex-1 px-3 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium min-h-[44px]"
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      onClick={handleCreateFormat}
                      disabled={!newFormatName || !newFormatPrompt || formatLoading}
                      className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold disabled:bg-slate-300 min-h-[44px]"
                    >
                      {formatLoading ? t.common.loading : t.common.save}
                    </button>
                  </div>
                </div>
              )}

              {customFormats.length >= 3 && (
                <p className="text-xs text-slate-500 text-center py-1">
                  {t.settings.formats.maxFormats}
                </p>
              )}
            </div>
          </div>

          {/* Data Management */}
          <div className="card p-4">
            <h2 className="text-base font-bold text-slate-900 mb-3">
              {t.settings.data.title}
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm">{t.settings.data.autoDelete}</h3>
                  <p className="text-xs text-slate-500">{t.settings.data.autoDeleteDesc}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={autoSave}
                    onChange={(e) => setAutoSave(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"></div>
                </label>
              </div>

              <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                <h3 className="font-bold text-red-700 text-sm mb-1">{t.settings.data.danger}</h3>
                <p className="text-xs text-red-600 mb-3">{t.settings.data.dangerDesc}</p>
                <button
                  onClick={handleDeleteAllData}
                  className="px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-medium min-h-[44px]"
                >
                  {t.settings.data.deleteAll}
                </button>
              </div>
            </div>
          </div>

          {/* Language Settings */}
          <div className="card p-4">
            <h2 className="text-base font-bold text-slate-900 mb-3">
              {t.settings.language.title}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setLocale("ko")}
                className={`flex-1 px-3 py-3 rounded-xl font-medium text-sm transition-all min-h-[44px] ${
                  locale === "ko"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                🇰🇷 한국어
              </button>
              <button
                onClick={() => setLocale("en")}
                className={`flex-1 px-3 py-3 rounded-xl font-medium text-sm transition-all min-h-[44px] ${
                  locale === "en"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                🇺🇸 English
              </button>
            </div>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="w-full py-3 px-4 border border-slate-200 text-slate-700 rounded-xl font-medium text-sm min-h-[44px]"
          >
            {t.settings.signOut}
          </button>
        </div>
      </main>

      {/* Bottom Tab Navigation */}
      <BottomTab />

      {/* Database Creation Modal */}
      {showDatabaseModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-end justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-t-2xl w-full max-w-[430px] max-h-[80vh] overflow-hidden shadow-2xl animate-slide-up">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900">
                  새 데이터베이스 만들기
                </h2>
                <button
                  onClick={() => setShowDatabaseModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 min-h-[44px] min-w-[44px]"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
              {modalLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      데이터베이스 이름
                    </label>
                    <input
                      type="text"
                      value={newDbTitle}
                      onChange={(e) => setNewDbTitle(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none"
                      placeholder="Flownote Recordings"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      상위 페이지 선택
                    </label>
                    {pages.length === 0 ? (
                      <p className="text-slate-500 text-sm bg-slate-50 p-3 rounded-lg">
                        페이지가 없습니다. Notion에서 먼저 페이지를 만들어주세요.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {pages.map((page) => (
                          <button
                            key={page.id}
                            onClick={() => setSelectedPageId(page.id)}
                            className={`w-full p-3 border rounded-lg transition-all text-left min-h-[44px] ${
                              selectedPageId === page.id
                                ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <div className="font-medium text-slate-900 text-sm">{page.title}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={createDatabase}
                    disabled={!selectedPageId || modalLoading}
                    className="w-full px-4 py-3 bg-slate-900 text-white rounded-lg font-bold text-sm disabled:bg-slate-300 min-h-[44px]"
                  >
                    데이터베이스 만들기
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
