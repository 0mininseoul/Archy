"use client";

import { useState, useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import Image from "next/image";

interface NotionDatabase {
  id: string;
  title: string;
  url?: string;
  last_edited_time?: string;
}

interface NotionPage {
  id: string;
  title: string;
  url?: string;
  last_edited_time?: string;
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

type NotionDropdownState =
  | "idle"
  | "fast_loading"
  | "fast_ready"
  | "deep_loading"
  | "deep_ready"
  | "error";

interface NotionSaveTargetsPayload {
  pages: NotionPage[];
  databases: NotionDatabase[];
  meta?: {
    mode: "fast" | "deep";
    partial?: boolean;
    fromCache?: boolean;
    fetchedAt?: string;
  };
}

interface ClientSaveTargetsCacheEntry {
  expiresAt: number;
  payload: NotionSaveTargetsPayload;
}

const NOTION_CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;
const NOTION_SESSION_CACHE_PREFIX = "archy_notion_save_targets_v1";
const NOTION_SERVER_REFRESH_PENDING_KEY = "archy_notion_save_targets_refresh_pending_v1";
const notionSaveTargetsInMemoryCache: Record<
  "fast" | "deep",
  ClientSaveTargetsCacheEntry | null
> = {
  fast: null,
  deep: null,
};

function getNotionSessionCacheKey(mode: "fast" | "deep"): string {
  return `${NOTION_SESSION_CACHE_PREFIX}:${mode}`;
}

function readNotionSaveTargetsCache(
  mode: "fast" | "deep"
): NotionSaveTargetsPayload | null {
  const now = Date.now();
  const inMemory = notionSaveTargetsInMemoryCache[mode];
  if (inMemory && inMemory.expiresAt > now) {
    return inMemory.payload;
  }

  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(getNotionSessionCacheKey(mode));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ClientSaveTargetsCacheEntry;
    if (!parsed?.expiresAt || !parsed?.payload) {
      sessionStorage.removeItem(getNotionSessionCacheKey(mode));
      return null;
    }

    if (parsed.expiresAt <= now) {
      sessionStorage.removeItem(getNotionSessionCacheKey(mode));
      return null;
    }

    notionSaveTargetsInMemoryCache[mode] = parsed;
    return parsed.payload;
  } catch (error) {
    console.warn("[Notion Save Targets] Failed to read cache:", error);
    return null;
  }
}

function writeNotionSaveTargetsCache(
  mode: "fast" | "deep",
  payload: NotionSaveTargetsPayload
) {
  const entry: ClientSaveTargetsCacheEntry = {
    expiresAt: Date.now() + NOTION_CLIENT_CACHE_TTL_MS,
    payload,
  };
  notionSaveTargetsInMemoryCache[mode] = entry;

  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(getNotionSessionCacheKey(mode), JSON.stringify(entry));
  } catch (error) {
    console.warn("[Notion Save Targets] Failed to write cache:", error);
  }
}

function clearNotionSaveTargetsCache() {
  notionSaveTargetsInMemoryCache.fast = null;
  notionSaveTargetsInMemoryCache.deep = null;

  if (typeof window === "undefined") return;

  try {
    sessionStorage.removeItem(getNotionSessionCacheKey("fast"));
    sessionStorage.removeItem(getNotionSessionCacheKey("deep"));
    sessionStorage.setItem(NOTION_SERVER_REFRESH_PENDING_KEY, "1");
  } catch (error) {
    console.warn("[Notion Save Targets] Failed to clear cache:", error);
  }
}

function shouldForceNotionServerRefresh(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return sessionStorage.getItem(NOTION_SERVER_REFRESH_PENDING_KEY) === "1";
  } catch (error) {
    console.warn("[Notion Save Targets] Failed to read refresh flag:", error);
    return false;
  }
}

function clearNotionServerRefreshPending() {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.removeItem(NOTION_SERVER_REFRESH_PENDING_KEY);
  } catch (error) {
    console.warn("[Notion Save Targets] Failed to clear refresh flag:", error);
  }
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
  const [notionDropdownState, setNotionDropdownState] =
    useState<NotionDropdownState>("idle");
  const [notionDropdownError, setNotionDropdownError] = useState<string | null>(null);
  const [notionDeepSyncError, setNotionDeepSyncError] = useState<string | null>(null);
  const notionRequestIdRef = useRef(0);

  // Manual Notion connection states
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [manualPageUrl, setManualPageUrl] = useState("");
  const [manualConnecting, setManualConnecting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Google states
  const [googleConnected, setGoogleConnected] = useState(initialGoogleConnected);
  const [googleFolders, setGoogleFolders] = useState<GoogleFolder[]>([]);
  const [googleFolder, setGoogleFolder] = useState(initialGoogleFolder);
  const [showGoogleFolderDropdown, setShowGoogleFolderDropdown] = useState(false);
  const [googleFolderLoading, setGoogleFolderLoading] = useState(false);

  // Sync state with props when they change
  useEffect(() => {
    setNotionConnected(initialNotionConnected);
  }, [initialNotionConnected]);

  useEffect(() => {
    if (!notionConnected) {
      clearNotionSaveTargetsCache();
    }
  }, [notionConnected]);

  useEffect(() => {
    setSaveTarget(initialSaveTarget);
  }, [initialSaveTarget]);

  useEffect(() => {
    setGoogleConnected(initialGoogleConnected);
  }, [initialGoogleConnected]);

  useEffect(() => {
    setGoogleFolder(initialGoogleFolder);
  }, [initialGoogleFolder]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("notion") === "connected") {
        clearNotionSaveTargetsCache();
        setDatabases([]);
        setPages([]);
        setNotionDropdownState("idle");
        setNotionDropdownError(null);
        setNotionDeepSyncError(null);
      }
    } catch (error) {
      console.warn("[Notion Save Targets] Failed to inspect URL params:", error);
    }
  }, []);

  const handleConnect = (service: "notion" | "slack" | "google") => {
    window.location.href = `/api/auth/${service}?returnTo=/dashboard/settings`;
  };

  // Notion handlers
  const applyNotionSaveTargets = (payload: NotionSaveTargetsPayload) => {
    setDatabases(payload.databases || []);
    setPages(payload.pages || []);
  };

  const fetchNotionSaveTargets = async (
    mode: "fast" | "deep"
  ): Promise<NotionSaveTargetsPayload> => {
    const cached = readNotionSaveTargetsCache(mode);
    if (cached) {
      return cached;
    }

    const forceRefresh = shouldForceNotionServerRefresh();
    const response = await fetch(
      `/api/notion/save-targets?mode=${mode}&limit=15${forceRefresh ? "&refresh=1" : ""}`
    );
    const payload = await response.json();

    if (!response.ok || !payload?.success || !payload?.data) {
      if (response.status === 400 && payload?.error === "Notion not connected") {
        clearNotionSaveTargetsCache();
      }
      throw new Error(payload?.error || "Failed to fetch Notion save targets");
    }

    const data = payload.data as NotionSaveTargetsPayload;
    writeNotionSaveTargetsCache(mode, data);
    return data;
  };

  const openSaveTargetDropdown = async () => {
    setShowSaveTargetDropdown(true);
    setNotionDropdownError(null);
    setNotionDeepSyncError(null);

    const requestId = notionRequestIdRef.current + 1;
    notionRequestIdRef.current = requestId;

    let hasData = databases.length > 0 || pages.length > 0;

    const deepCached = readNotionSaveTargetsCache("deep");
    if (deepCached) {
      applyNotionSaveTargets(deepCached);
      setNotionDropdownState("deep_ready");
      return;
    }

    const fastCached = readNotionSaveTargetsCache("fast");
    if (fastCached) {
      applyNotionSaveTargets(fastCached);
      hasData = true;
      setNotionDropdownState("fast_ready");
    } else {
      setNotionDropdownState("fast_loading");
      try {
        const fastPayload = await fetchNotionSaveTargets("fast");
        if (requestId !== notionRequestIdRef.current) return;
        applyNotionSaveTargets(fastPayload);
        hasData = true;
        setNotionDropdownState("fast_ready");
      } catch (error) {
        console.error("Failed to fetch Notion fast save targets:", error);
        if (requestId !== notionRequestIdRef.current) return;

        if (!hasData) {
          setNotionDropdownState("error");
          setNotionDropdownError(t.settings.integrations.notion.dropdown.loadFailed);
        } else {
          setNotionDropdownState("fast_ready");
          setNotionDropdownError(t.settings.integrations.notion.dropdown.loadFailed);
        }
      }
    }

    setNotionDropdownState("deep_loading");
    try {
      const deepPayload = await fetchNotionSaveTargets("deep");
      if (requestId !== notionRequestIdRef.current) return;
      applyNotionSaveTargets(deepPayload);
      clearNotionServerRefreshPending();
      setNotionDropdownState("deep_ready");
      setNotionDropdownError(null);
      setNotionDeepSyncError(null);
    } catch (error) {
      console.error("Failed to fetch Notion deep save targets:", error);
      if (requestId !== notionRequestIdRef.current) return;

      if (!hasData) {
        setNotionDropdownState("error");
        setNotionDropdownError(t.settings.integrations.notion.dropdown.loadFailed);
      } else {
        setNotionDropdownState("fast_ready");
        setNotionDeepSyncError(t.settings.integrations.notion.dropdown.syncFailed);
      }
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
        clearNotionSaveTargetsCache();
        setNotionConnected(false);
        setSaveTarget(null);
        setDatabases([]);
        setPages([]);
        setNotionDropdownState("idle");
        setNotionDropdownError(null);
        setNotionDeepSyncError(null);
        onNotionDisconnect();
      }
    } catch (error) {
      console.error("Failed to disconnect Notion:", error);
    }
  };

  const handleManualConnect = async () => {
    if (!manualToken.trim() || !manualPageUrl.trim()) return;

    setManualConnecting(true);
    setManualError(null);

    try {
      const response = await fetch("/api/user/notion-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: manualToken.trim(),
          pageUrl: manualPageUrl.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.data?.connected) {
        clearNotionSaveTargetsCache();
        setNotionConnected(true);
        setSaveTarget(data.data.saveTarget);
        setShowManualModal(false);
        setManualToken("");
        setManualPageUrl("");
      } else {
        // Handle specific error cases
        if (response.status === 401) {
          setManualError(t.settings.integrations.notion.manualModal.errorInvalidToken);
        } else if (response.status === 400) {
          setManualError(t.settings.integrations.notion.manualModal.errorInvalidUrl);
        } else if (response.status === 403) {
          setManualError(t.settings.integrations.notion.manualModal.errorNoAccess);
        } else {
          setManualError(t.settings.integrations.notion.manualModal.errorGeneric);
        }
      }
    } catch (error) {
      console.error("Failed to connect Notion manually:", error);
      setManualError(t.settings.integrations.notion.manualModal.errorGeneric);
    } finally {
      setManualConnecting(false);
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

  // Slack handlers
  const handleDisconnectSlack = async () => {
    if (!confirm("Slack 연결을 해제하시겠습니까?")) return;

    try {
      const response = await fetch("/api/user/slack", { method: "DELETE" });
      if (response.ok) {
        // We might need a callback to update parent state, but assuming implicit reload or store update needs checking.
        // The original code used window.location for connect.
        // Here we just reload or expect store to update? 
        // The prop 'slackConnected' comes from parent. Parent 'SettingsClient' gets it from store.
        // Store FetchUserData should be called or page reload.
        // For now, let's force a reload or assume parent updates if we had a callback passed.
        // Actually, the original code for Notion/Google had 'onNotionDisconnect' callbacks.
        // Slack prop didn't have one. We should probably accept one or just reload.
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to disconnect Slack:", error);
    }
  };

  const normalizedSearch = saveTargetSearch.toLowerCase();
  const filteredDatabases = databases.filter((db) =>
    (db.title || "").toLowerCase().includes(normalizedSearch)
  );
  const filteredPages = pages.filter((page) =>
    (page.title || "").toLowerCase().includes(normalizedSearch)
  );
  const searchTermMatchesExisting =
    saveTargetSearch.trim() !== "" &&
    (filteredDatabases.some((db) => (db.title || "").toLowerCase() === normalizedSearch) ||
      filteredPages.some((page) => (page.title || "").toLowerCase() === normalizedSearch));

  const hasSaveTargets = databases.length > 0 || pages.length > 0;
  const showBlockingLoadState =
    !dropdownLoading &&
    !hasSaveTargets &&
    (notionDropdownState === "fast_loading" || notionDropdownState === "deep_loading");
  const showDeepSyncStatus = hasSaveTargets && notionDropdownState === "deep_loading";
  const showLoadErrorState = !hasSaveTargets && notionDropdownState === "error";

  return (
    <div className="card p-4">
      <h2 className="text-base font-bold text-slate-900 mb-1">{t.settings.integrations.title}</h2>
      <p className="text-xs text-slate-500 mb-3">{t.settings.integrations.description}</p>

      <div className="space-y-3">
        {/* Notion */}
        <div className="p-3 border border-slate-200 rounded-xl">
          <div className="flex items-center gap-3">
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
            {notionConnected ? (
              <button
                onClick={handleDisconnectNotion}
                className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium min-h-[36px] hover:bg-slate-50 transition-colors"
              >
                해지
              </button>
            ) : (
              <button
                onClick={() => handleConnect("notion")}
                className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium min-h-[36px] hover:bg-slate-800 transition-colors"
              >
                연결
              </button>
            )}
          </div>

          {notionConnected && (
            <div className="mt-3 relative">
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
                    {showBlockingLoadState ? (
                      <div className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
                        <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                        <p className="text-xs text-slate-500">
                          {t.settings.integrations.notion.dropdown.loading}
                        </p>
                      </div>
                    ) : dropdownLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                      </div>
                    ) : (
                      <>
                        {showDeepSyncStatus && (
                          <div className="px-3 py-2 text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                            {t.settings.integrations.notion.dropdown.syncing}
                          </div>
                        )}

                        {notionDeepSyncError && (
                          <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
                            {notionDeepSyncError}
                          </div>
                        )}

                        {notionDropdownError && hasSaveTargets && (
                          <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
                            {notionDropdownError}
                          </div>
                        )}

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

                        {showLoadErrorState ? (
                          <div className="px-3 py-4 text-center text-sm text-slate-500">
                            {notionDropdownError ||
                              t.settings.integrations.notion.dropdown.loadFailed}
                          </div>
                        ) : (
                          filteredDatabases.length === 0 &&
                          filteredPages.length === 0 &&
                          !saveTargetSearch.trim() && (
                            <div className="px-3 py-4 text-center text-sm text-slate-500">
                              연결된 페이지나 데이터베이스가 없습니다
                            </div>
                          )
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
          )}

        </div>

        {/* Google Docs */}
        <div className="p-3 border border-slate-200 rounded-xl">
          <div className="flex items-center gap-3">
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
            {googleConnected ? (
              <button
                onClick={handleDisconnectGoogle}
                className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium min-h-[36px] hover:bg-slate-50 transition-colors"
              >
                해지
              </button>
            ) : (
              <button
                onClick={() => handleConnect("google")}
                className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium min-h-[36px] hover:bg-slate-800 transition-colors"
              >
                연결
              </button>
            )}

          </div>

          {googleConnected && (
            <div className="mt-3 relative">
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
            {slackConnected ? (
              <button
                onClick={handleDisconnectSlack}
                className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium min-h-[36px] hover:bg-slate-50 transition-colors"
              >
                해지
              </button>
            ) : (
              <button
                onClick={() => handleConnect("slack")}
                className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium min-h-[36px] hover:bg-slate-800 transition-colors"
              >
                연결
              </button>
            )}

          </div>
        </div>

        {/* Manual Notion connection help - at bottom of integrations section */}
        {!notionConnected && (
          <div className="text-center pt-1">
            <button
              onClick={() => setShowManualModal(true)}
              className="text-xs text-slate-400 hover:text-slate-600 underline transition-colors"
            >
              {t.settings.integrations.notion.troubleshoot}
            </button>
          </div>
        )}
      </div>

      {/* Manual Notion Connection Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">
                  {t.settings.integrations.notion.manualModal.title}
                </h3>
                <button
                  onClick={() => {
                    setShowManualModal(false);
                    setManualToken("");
                    setManualPageUrl("");
                    setManualError(null);
                  }}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <p className="text-sm text-slate-600 mb-4">
                {t.settings.integrations.notion.manualModal.description}
              </p>

              <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2">
                <p className="text-xs text-slate-600">
                  {t.settings.integrations.notion.manualModal.step1}
                </p>
                <p className="text-xs text-slate-600">
                  {t.settings.integrations.notion.manualModal.step2}
                </p>
                <p className="text-xs text-slate-600">
                  {t.settings.integrations.notion.manualModal.step3}
                </p>
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-2"
                >
                  {t.settings.integrations.notion.manualModal.guideLink}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t.settings.integrations.notion.manualModal.tokenLabel}
                  </label>
                  <input
                    type="password"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder={t.settings.integrations.notion.manualModal.tokenPlaceholder}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t.settings.integrations.notion.manualModal.pageUrlLabel}
                  </label>
                  <input
                    type="url"
                    value={manualPageUrl}
                    onChange={(e) => setManualPageUrl(e.target.value)}
                    placeholder={t.settings.integrations.notion.manualModal.pageUrlPlaceholder}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {manualError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                    <p className="text-sm text-red-600">{manualError}</p>
                  </div>
                )}

                <button
                  onClick={handleManualConnect}
                  disabled={manualConnecting || !manualToken.trim() || !manualPageUrl.trim()}
                  className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {manualConnecting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t.settings.integrations.notion.manualModal.connecting}
                    </>
                  ) : (
                    t.settings.integrations.notion.manualModal.connect
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
