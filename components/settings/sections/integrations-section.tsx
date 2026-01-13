"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import Image from "next/image";

interface NotionDatabase {
  id: string;
  title: string;
}

interface NotionPage {
  id: string;
  title: string;
}

interface NotionSaveTarget {
  type: "database" | "page";
  id: string;
  title: string;
}

interface GoogleFolder {
  id: string;
  name: string;
}

interface IntegrationsSectionProps {
  notionConnected: boolean;
  slackConnected: boolean;
  googleConnected: boolean;
  initialSaveTarget: NotionSaveTarget | null;
  initialGoogleFolder: { id: string | null; name: string | null };
  onNotionDisconnect: () => void;
  onGoogleDisconnect: () => void;
}

export function IntegrationsSection({
  notionConnected: initialNotionConnected,
  slackConnected,
  googleConnected: initialGoogleConnected,
  initialSaveTarget,
  initialGoogleFolder,
  onNotionDisconnect,
  onGoogleDisconnect,
}: IntegrationsSectionProps) {
  const { t } = useI18n();

  // Notion states
  const [notionConnected, setNotionConnected] = useState(initialNotionConnected);
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [showSaveTargetDropdown, setShowSaveTargetDropdown] = useState(false);
  const [saveTarget, setSaveTarget] = useState<NotionSaveTarget | null>(initialSaveTarget);
  const [saveTargetSearch, setSaveTargetSearch] = useState("");
  const [dropdownLoading, setDropdownLoading] = useState(false);

  // Google states
  const [googleConnected, setGoogleConnected] = useState(initialGoogleConnected);
  const [googleFolders, setGoogleFolders] = useState<GoogleFolder[]>([]);
  const [googleFolder, setGoogleFolder] = useState(initialGoogleFolder);
  const [showGoogleFolderDropdown, setShowGoogleFolderDropdown] = useState(false);
  const [googleFolderLoading, setGoogleFolderLoading] = useState(false);

  const handleConnect = (service: "notion" | "slack" | "google") => {
    window.location.href = `/api/auth/${service}?returnTo=/settings`;
  };

  // Notion handlers
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
        setDatabases(dbData.data?.databases || dbData.databases || []);
      }
      if (pageResponse.ok) {
        const pageData = await pageResponse.json();
        setPages(pageData.data?.pages || pageData.pages || []);
      }
    } catch (error) {
      console.error("Failed to fetch Notion data:", error);
    } finally {
      setDropdownLoading(false);
    }
  };

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

  const handleDisconnectNotion = async () => {
    if (!confirm("Notion 연결을 해제하시겠습니까?")) return;

    try {
      const response = await fetch("/api/user/notion-database", { method: "DELETE" });
      if (response.ok) {
        setNotionConnected(false);
        setSaveTarget(null);
        onNotionDisconnect();
      }
    } catch (error) {
      console.error("Failed to disconnect Notion:", error);
    }
  };

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
        const data = await response.json();
        const pageId = data.data?.pageId || data.pageId;
        await selectSaveTarget({ type: "page", id: pageId, title: title.trim() });
      }
    } catch (error) {
      console.error("Failed to create page:", error);
    } finally {
      setDropdownLoading(false);
    }
  };

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
        const pageData = await pageResponse.json();
        const pageId = pageData.data?.pageId || pageData.pageId;
        const dbResponse = await fetch("/api/notion/database", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId, title: title.trim() }),
        });
        if (dbResponse.ok) {
          const dbData = await dbResponse.json();
          const databaseId = dbData.data?.databaseId || dbData.databaseId;
          await selectSaveTarget({ type: "database", id: databaseId, title: title.trim() });
        }
      }
    } catch (error) {
      console.error("Failed to create database:", error);
    } finally {
      setDropdownLoading(false);
    }
  };

  // Google handlers
  const fetchGoogleFolders = async () => {
    setGoogleFolderLoading(true);
    try {
      const response = await fetch("/api/google/folders");
      if (response.ok) {
        const data = await response.json();
        setGoogleFolders(data.data?.folders || data.folders || []);
      }
    } catch (error) {
      console.error("Failed to fetch Google folders:", error);
    } finally {
      setGoogleFolderLoading(false);
    }
  };

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

  const handleDisconnectGoogle = async () => {
    if (!confirm("Google 연결을 해제하시겠습니까?")) return;

    try {
      const response = await fetch("/api/user/google", { method: "DELETE" });
      if (response.ok) {
        setGoogleConnected(false);
        setGoogleFolder({ id: null, name: null });
        onGoogleDisconnect();
      }
    } catch (error) {
      console.error("Failed to disconnect Google:", error);
    }
  };

  const filteredDatabases = databases.filter((db) =>
    db.title.toLowerCase().includes(saveTargetSearch.toLowerCase())
  );
  const filteredPages = pages.filter((page) =>
    page.title.toLowerCase().includes(saveTargetSearch.toLowerCase())
  );
  const searchTermMatchesExisting =
    saveTargetSearch.trim() !== "" &&
    (filteredDatabases.some((db) => db.title.toLowerCase() === saveTargetSearch.toLowerCase()) ||
      filteredPages.some((page) => page.title.toLowerCase() === saveTargetSearch.toLowerCase()));

  return (
    <div className="card p-4">
      <h2 className="text-base font-bold text-slate-900 mb-1">{t.settings.integrations.title}</h2>
      <p className="text-xs text-slate-500 mb-3">{t.settings.integrations.description}</p>

      <div className="space-y-3">
        {/* Notion */}
        <div className="p-3 border border-slate-200 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center overflow-hidden">
              <Image src="/logos/notion.png" alt="Notion" width={28} height={28} />
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

              {showSaveTargetDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-80 overflow-hidden">
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

                        {filteredDatabases.length > 0 && (
                          <div>
                            <div className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-50">
                              데이터베이스
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

                        {filteredPages.length > 0 && (
                          <div>
                            <div className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-50">
                              페이지
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

                  <div className="p-2 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setShowSaveTargetDropdown(false);
                        setSaveTargetSearch("");
                      }}
                      className="w-full py-2 text-sm text-slate-500 font-medium"
                    >
                      {t.common.close || "닫기"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => handleConnect("notion")}
              className="w-full px-4 py-2.5 bg-slate-900 text-white rounded-lg font-bold text-sm min-h-[44px]"
            >
              {t.settings.integrations.notion.connect}
            </button>
          )}
        </div>

        {/* Google Docs */}
        <div className="p-3 border border-slate-200 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center overflow-hidden">
              <Image src="/logos/google-docs.png" alt="Google Docs" width={28} height={28} />
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
            <div className="relative">
              <button
                onClick={() => {
                  setShowGoogleFolderDropdown(true);
                  fetchGoogleFolders();
                }}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-left text-sm font-medium text-slate-700 flex items-center justify-between min-h-[44px]"
              >
                <span className="truncate">
                  {googleFolder.name ? `📁 ${googleFolder.name}` : t.settings.integrations.google.rootFolder}
                </span>
                <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showGoogleFolderDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-64 overflow-hidden">
                  <div className="overflow-y-auto max-h-52">
                    {googleFolderLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => selectGoogleFolder(null, null)}
                          className="w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2 min-h-[44px] border-b border-slate-100"
                        >
                          <span>🏠</span>
                          <span>{t.settings.integrations.google.rootFolder}</span>
                        </button>
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
                  <div className="p-2 border-t border-slate-100">
                    <button
                      onClick={() => setShowGoogleFolderDropdown(false)}
                      className="w-full py-2 text-sm text-slate-500 font-medium"
                    >
                      {t.common.close || "닫기"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => handleConnect("google")}
              className="w-full px-4 py-2.5 bg-slate-900 text-white rounded-lg font-bold text-sm min-h-[44px]"
            >
              {t.settings.integrations.google.connect}
            </button>
          )}
        </div>

        {/* Slack */}
        <div className="p-3 border border-slate-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center overflow-hidden">
              <Image src="/logos/slack.png" alt="Slack" width={28} height={28} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-900 text-sm">{t.settings.integrations.slack.title}</h3>
              <p className="text-xs text-slate-500">{t.settings.integrations.slack.description}</p>
            </div>
            <button
              onClick={() => handleConnect("slack")}
              className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium min-h-[44px]"
            >
              {slackConnected ? t.settings.integrations.slack.reconnect : "연결"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
