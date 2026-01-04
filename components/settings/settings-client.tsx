"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

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

interface GoogleFolder {
  id: string;
  name: string;
}

interface InitialData {
  email: string;
  usage: { used: number; limit: number };
  notionConnected: boolean;
  slackConnected: boolean;
  googleConnected: boolean;
  notionDatabaseId: string | null;
  notionSaveTargetType: "database" | "page" | null;
  notionSaveTargetTitle: string | null;
  googleFolderId: string | null;
  googleFolderName: string | null;
  customFormats: CustomFormat[];
}

interface SettingsClientProps {
  initialData: InitialData;
}

export function SettingsClient({ initialData }: SettingsClientProps) {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();

  // State definitions (initialized with server data)
  const [usage, setUsage] = useState(initialData.usage);
  const [userEmail] = useState(initialData.email);

  // Feature states
  const [notionConnected, setNotionConnected] = useState(initialData.notionConnected);
  const [slackConnected] = useState(initialData.slackConnected);
  const [googleConnected, setGoogleConnected] = useState(initialData.googleConnected);
  const [autoSave, setAutoSave] = useState(true);

  // Google Drive folder states
  const [googleFolders, setGoogleFolders] = useState<GoogleFolder[]>([]);
  const [googleFolder, setGoogleFolder] = useState<{ id: string | null; name: string | null }>({
    id: initialData.googleFolderId,
    name: initialData.googleFolderName,
  });
  const [showGoogleFolderDropdown, setShowGoogleFolderDropdown] = useState(false);
  const [googleFolderLoading, setGoogleFolderLoading] = useState(false);

  // Notion database states
  const [notionDatabaseId, setNotionDatabaseId] = useState<string | null>(initialData.notionDatabaseId);
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [pages, setPages] = useState<NotionPage[]>([]);

  // Notion 기본 저장 위치 드롭다운
  const [showSaveTargetDropdown, setShowSaveTargetDropdown] = useState(false);
  const [saveTarget, setSaveTarget] = useState<NotionSaveTarget | null>(() => {
    // 초기 데이터에서 저장 위치 정보가 있으면 설정
    if (initialData.notionDatabaseId && initialData.notionSaveTargetType && initialData.notionSaveTargetTitle) {
      return {
        type: initialData.notionSaveTargetType,
        id: initialData.notionDatabaseId,
        title: initialData.notionSaveTargetTitle,
      };
    }
    return null;
  });
  const [saveTargetSearch, setSaveTargetSearch] = useState("");
  const [dropdownLoading, setDropdownLoading] = useState(false);

  // Custom format states
  const [customFormats, setCustomFormats] = useState<CustomFormat[]>(initialData.customFormats);
  const [showFormatForm, setShowFormatForm] = useState(false);
  const [newFormatName, setNewFormatName] = useState("");
  const [newFormatPrompt, setNewFormatPrompt] = useState("");
  const [formatLoading, setFormatLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isNotionJustConnected = params.get("notion") === "connected";
    const isGoogleJustConnected = params.get("google") === "connected";

    if (isNotionJustConnected || isGoogleJustConnected) {
      // 연결 완료 후 URL 파라미터 제거
      window.history.replaceState({}, "", "/settings");
      // DB 저장 완료 대기 후 데이터 가져오기
      setTimeout(() => {
        refreshData();
      }, 800);
    }
  }, []);

  const refreshData = async () => {
    try {
      const [usageResponse, userResponse] = await Promise.all([
        fetch("/api/user/usage"),
        fetch("/api/user/profile"),
      ]);

      const usageData = await usageResponse.json();
      const userData = await userResponse.json();

      setUsage({
        used: usageData.used || 0,
        limit: usageData.limit || 350,
      });
      setNotionConnected(!!userData.notion_access_token);
      setNotionDatabaseId(userData.notion_database_id || null);
      setGoogleConnected(!!userData.google_access_token);
      setGoogleFolder({
        id: userData.google_folder_id || null,
        name: userData.google_folder_name || null,
      });
    } catch (error) {
      console.error("Failed to refresh data:", error);
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

  const handleConnect = (service: 'notion' | 'slack' | 'google') => {
    if (service === 'notion') {
      window.location.href = "/api/auth/notion?returnTo=/settings";
    } else if (service === 'slack') {
      window.location.href = "/api/auth/slack?returnTo=/settings";
    } else if (service === 'google') {
      window.location.href = "/api/auth/google?returnTo=/settings";
    }
  };

  // Google 연결 해제
  const handleDisconnectGoogle = async () => {
    if (!confirm("Google 연결을 해제하시겠습니까?")) return;

    try {
      const response = await fetch("/api/user/google", {
        method: "DELETE",
      });

      if (response.ok) {
        setGoogleConnected(false);
        setGoogleFolder({ id: null, name: null });
      }
    } catch (error) {
      console.error("Failed to disconnect Google:", error);
    }
  };

  // Google 폴더 목록 가져오기
  const fetchGoogleFolders = async () => {
    setGoogleFolderLoading(true);
    try {
      const response = await fetch("/api/google/folders");
      if (response.ok) {
        const data = await response.json();
        setGoogleFolders(data.folders || []);
      }
    } catch (error) {
      console.error("Failed to fetch Google folders:", error);
    } finally {
      setGoogleFolderLoading(false);
    }
  };

  // Google 폴더 선택
  const selectGoogleFolder = async (folderId: string | null, folderName: string | null) => {
    try {
      const response = await fetch("/api/user/google", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, folderName }),
      });

      if (response.ok) {
        setGoogleFolder({ id: folderId, name: folderName });
        setShowGoogleFolderDropdown(false);
      }
    } catch (error) {
      console.error("Failed to set Google folder:", error);
    }
  };

  // Google 폴더 드롭다운 열기
  const openGoogleFolderDropdown = () => {
    setShowGoogleFolderDropdown(true);
    fetchGoogleFolders();
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
          title: target.title,
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

  // Notion 연결 해제
  const handleDisconnectNotion = async () => {
    if (!confirm("Notion 연결을 해제하시겠습니까?")) return;

    try {
      const response = await fetch("/api/user/notion-database", {
        method: "DELETE",
      });

      if (response.ok) {
        setNotionConnected(false);
        setSaveTarget(null);
        setNotionDatabaseId(null);
      }
    } catch (error) {
      console.error("Failed to disconnect Notion:", error);
    }
  };

  // 신규 페이지 생성
  const createNewPage = async (title: string) => {
    if (!title.trim()) return;

    setDropdownLoading(true);
    try {
      const response = await fetch("/api/notion/page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });

      if (response.ok) {
        const { pageId } = await response.json();
        await selectSaveTarget({ type: "page", id: pageId, title: title.trim() });
      } else {
        alert("페이지 생성에 실패했습니다.");
      }
    } catch (error) {
      console.error("Failed to create page:", error);
      alert("페이지 생성에 실패했습니다.");
    } finally {
      setDropdownLoading(false);
    }
  };

  // 신규 데이터베이스 생성
  const createNewDatabase = async (title: string) => {
    if (!title.trim()) return;

    setDropdownLoading(true);
    try {
      const pageResponse = await fetch("/api/notion/page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });

      if (pageResponse.ok) {
        const { pageId } = await pageResponse.json();

        const dbResponse = await fetch("/api/notion/database", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId, title: title.trim() }),
        });

        if (dbResponse.ok) {
          const { databaseId } = await dbResponse.json();
          await selectSaveTarget({ type: "database", id: databaseId, title: title.trim() });
        } else {
          alert("데이터베이스 생성에 실패했습니다.");
        }
      } else {
        alert("페이지 생성에 실패했습니다.");
      }
    } catch (error) {
      console.error("Failed to create database:", error);
      alert("데이터베이스 생성에 실패했습니다.");
    } finally {
      setDropdownLoading(false);
    }
  };

  // 필터링된 결과
  const filteredDatabases = databases.filter(db =>
    db.title.toLowerCase().includes(saveTargetSearch.toLowerCase())
  );
  const filteredPages = pages.filter(page =>
    page.title.toLowerCase().includes(saveTargetSearch.toLowerCase())
  );

  // 검색어가 기존 항목과 일치하는지 확인
  const searchTermMatchesExisting = saveTargetSearch.trim() !== "" &&
    (filteredDatabases.some(db => db.title.toLowerCase() === saveTargetSearch.toLowerCase()) ||
     filteredPages.some(page => page.title.toLowerCase() === saveTargetSearch.toLowerCase()));

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
              {userEmail || t.settings.account.noEmail}
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
                  style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
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
              {notionConnected && (
                <button
                  onClick={handleDisconnectNotion}
                  className="px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 min-h-[36px]"
                >
                  해지
                </button>
              )}
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
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-80 overflow-hidden">
                      {/* 검색 입력 */}
                      <div className="p-2 border-b border-slate-100">
                        <input
                          type="text"
                          value={saveTargetSearch}
                          onChange={(e) => setSaveTargetSearch(e.target.value)}
                          placeholder="검색 또는 새로운 이름 입력..."
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                          autoFocus
                        />
                      </div>

                      <div className="overflow-y-auto max-h-52">
                        {dropdownLoading ? (
                          <div className="flex justify-center py-4">
                            <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                          </div>
                        ) : (
                          <>
                            {/* 신규 생성 버튼 */}
                            {saveTargetSearch.trim() && !searchTermMatchesExisting && (
                              <div className="border-b border-slate-100">
                                <div className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50">
                                  &quot;{saveTargetSearch}&quot; 신규 생성
                                </div>
                                <button
                                  onClick={() => createNewPage(saveTargetSearch)}
                                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 flex items-center gap-2 min-h-[44px] text-blue-700"
                                >
                                  <span>+ 📄</span>
                                  <span>신규 페이지로 추가</span>
                                </button>
                                <button
                                  onClick={() => createNewDatabase(saveTargetSearch)}
                                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 flex items-center gap-2 min-h-[44px] text-blue-700"
                                >
                                  <span>+ 📊</span>
                                  <span>신규 데이터베이스로 추가</span>
                                </button>
                              </div>
                            )}

                            {/* 데이터베이스 섹션 */}
                            {filteredDatabases.length > 0 ? (
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
                            ) : null}

                            {/* 페이지 섹션 */}
                            {filteredPages.length > 0 && (
                              <div>
                                <div className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-50">
                                  페이지 (하위 페이지로 추가)
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

                            {filteredDatabases.length === 0 && filteredPages.length === 0 && !saveTargetSearch.trim() && (
                              <div className="px-3 py-4 text-center text-sm text-slate-500">
                                연결된 페이지나 데이터베이스가 없습니다
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

          {/* Google Docs */}
          <div className="p-3 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-xl">
                📄
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 text-sm">{t.settings.integrations.google.title}</h3>
                <p className="text-xs text-slate-500 truncate">
                  {googleConnected
                    ? googleFolder.name
                      ? `저장 위치: ${googleFolder.name}`
                      : t.settings.integrations.google.selectFolder
                    : t.settings.integrations.google.notConnected}
                </p>
              </div>
              {googleConnected && (
                <button
                  onClick={handleDisconnectGoogle}
                  className="px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 min-h-[36px]"
                >
                  {t.settings.integrations.google.disconnect}
                </button>
              )}
            </div>

            {googleConnected ? (
              <div className="space-y-2">
                {/* Google 폴더 선택 드롭다운 */}
                <div className="relative">
                  <button
                    onClick={openGoogleFolderDropdown}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-left text-sm font-medium text-slate-700 flex items-center justify-between min-h-[44px]"
                  >
                    <span className="truncate">
                      {googleFolder.name ? `📁 ${googleFolder.name}` : t.settings.integrations.google.rootFolder}
                    </span>
                    <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* 드롭다운 메뉴 */}
                  {showGoogleFolderDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-64 overflow-hidden">
                      <div className="overflow-y-auto max-h-52">
                        {googleFolderLoading ? (
                          <div className="flex justify-center py-4">
                            <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                          </div>
                        ) : (
                          <>
                            {/* 루트 폴더 (내 드라이브) */}
                            <button
                              onClick={() => selectGoogleFolder(null, null)}
                              className="w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2 min-h-[44px] border-b border-slate-100"
                            >
                              <span>🏠</span>
                              <span>{t.settings.integrations.google.rootFolder}</span>
                            </button>

                            {/* 폴더 목록 */}
                            {googleFolders.map((folder) => (
                              <button
                                key={folder.id}
                                onClick={() => selectGoogleFolder(folder.id, folder.name)}
                                className="w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2 min-h-[44px]"
                              >
                                <span>📁</span>
                                <span className="truncate">{folder.name}</span>
                              </button>
                            ))}

                            {googleFolders.length === 0 && (
                              <div className="px-3 py-4 text-center text-sm text-slate-500">
                                폴더가 없습니다
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* 닫기 버튼 */}
                      <div className="p-2 border-t border-slate-100">
                        <button
                          onClick={() => setShowGoogleFolderDropdown(false)}
                          className="w-full py-2 text-sm text-slate-500 font-medium"
                        >
                          닫기
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={() => handleConnect('google')}
                className="w-full px-4 py-2.5 bg-slate-900 text-white rounded-lg font-bold text-sm min-h-[44px]"
              >
                {t.settings.integrations.google.connect}
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
          {/* Auto Format - Default */}
          <div className="p-3 border border-slate-200 rounded-xl bg-gradient-to-r from-purple-50 to-blue-50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-lg border border-slate-200">
                🎯
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-sm">{t.settings.formats.auto}</h3>
                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 text-[10px] font-bold rounded-full">
                    {t.settings.formats.isDefault}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">{t.settings.formats.autoDesc}</p>
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
            한국어
          </button>
          <button
            onClick={() => setLocale("en")}
            className={`flex-1 px-3 py-3 rounded-xl font-medium text-sm transition-all min-h-[44px] ${
              locale === "en"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            English
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

      {/* Bottom spacer for scroll */}
      <div className="h-32" aria-hidden="true" />
    </div>
  );
}
