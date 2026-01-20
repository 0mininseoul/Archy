"use client";

import { useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";

interface CustomFormat {
  id: string;
  name: string;
  prompt: string;
  is_default: boolean;
  created_at: string;
}

interface CustomFormatsSectionProps {
  initialFormats: CustomFormat[];
}

export function CustomFormatsSection({ initialFormats }: CustomFormatsSectionProps) {
  const { t } = useI18n();

  const [customFormats, setCustomFormats] = useState<CustomFormat[]>(initialFormats);
  const [showFormatForm, setShowFormatForm] = useState(false);
  const [newFormatName, setNewFormatName] = useState("");
  const [newFormatPrompt, setNewFormatPrompt] = useState("");
  const [formatLoading, setFormatLoading] = useState(false);

  // 수정 모드 상태
  const [editingFormat, setEditingFormat] = useState<CustomFormat | null>(null);
  const [editFormatName, setEditFormatName] = useState("");
  const [editFormatPrompt, setEditFormatPrompt] = useState("");

  // 스마트 포맷이 기본값인지 확인 (커스텀 포맷 중 기본값이 없으면 스마트 포맷이 기본값)
  const isSmartFormatDefault = !customFormats.some(f => f.is_default);

  const fetchCustomFormats = useCallback(async () => {
    try {
      const response = await fetch("/api/formats");
      if (response.ok) {
        const data = await response.json();
        setCustomFormats(data.data?.formats || data.formats || []);
      }
    } catch (error) {
      console.error("Failed to fetch custom formats:", error);
    }
  }, []);

  const handleCreateFormat = useCallback(async () => {
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
  }, [newFormatName, newFormatPrompt, t, fetchCustomFormats]);

  const handleDeleteFormat = useCallback(async (id: string) => {
    if (!confirm(t.settings.formats.deleteConfirm)) return;

    try {
      const response = await fetch(`/api/formats?id=${id}`, { method: "DELETE" });
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
  }, [t, fetchCustomFormats]);

  // 커스텀 포맷을 기본값으로 설정
  const handleSetDefaultFormat = useCallback(async (id: string) => {
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
  }, [fetchCustomFormats]);

  // 스마트 포맷을 기본값으로 설정 (모든 커스텀 포맷의 is_default를 false로)
  const handleSetSmartFormatDefault = useCallback(async () => {
    // 이미 스마트 포맷이 기본값이면 아무것도 안 함
    if (isSmartFormatDefault) return;

    try {
      // 모든 커스텀 포맷의 is_default를 false로 설정
      const response = await fetch("/api/formats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear_all_default: true }),
      });
      if (response.ok) {
        await fetchCustomFormats();
      }
    } catch (error) {
      console.error("Failed to set smart format as default:", error);
    }
  }, [isSmartFormatDefault, fetchCustomFormats]);

  // 수정 시작
  const handleStartEdit = useCallback((format: CustomFormat) => {
    setEditingFormat(format);
    setEditFormatName(format.name);
    setEditFormatPrompt(format.prompt);
  }, []);

  // 수정 취소
  const handleCancelEdit = useCallback(() => {
    setEditingFormat(null);
    setEditFormatName("");
    setEditFormatPrompt("");
  }, []);

  // 수정 저장
  const handleSaveEdit = useCallback(async () => {
    if (!editingFormat || !editFormatName || !editFormatPrompt) return;

    setFormatLoading(true);
    try {
      const response = await fetch("/api/formats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingFormat.id,
          name: editFormatName,
          prompt: editFormatPrompt,
        }),
      });

      if (response.ok) {
        await fetchCustomFormats();
        setEditingFormat(null);
        setEditFormatName("");
        setEditFormatPrompt("");
        alert(t.settings.formats.editSuccess);
      } else {
        alert(t.settings.formats.editFailed);
      }
    } catch (error) {
      console.error("Failed to update format:", error);
      alert(t.settings.formats.editFailed);
    } finally {
      setFormatLoading(false);
    }
  }, [editingFormat, editFormatName, editFormatPrompt, t, fetchCustomFormats]);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-slate-900">{t.settings.formats.title}</h2>
        {customFormats.length < 1 && !showFormatForm && (
          <button
            onClick={() => setShowFormatForm(true)}
            className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-bold text-xs min-h-[36px]"
          >
            {t.settings.formats.addNew}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* Smart Format - clickable to set as default */}
        <div
          onClick={handleSetSmartFormatDefault}
          className={`p-3 border rounded-xl bg-gradient-to-r from-purple-50 to-blue-50 cursor-pointer transition-all ${
            isSmartFormatDefault
              ? "border-purple-400 ring-1 ring-purple-400"
              : "border-slate-200 hover:border-purple-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-lg border border-slate-200">
              🎯
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-sm">{t.settings.formats.auto}</h3>
                {isSmartFormatDefault && (
                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 text-[10px] font-bold rounded-full">
                    {t.settings.formats.isDefault}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate">{t.settings.formats.autoDesc}</p>
            </div>
          </div>
        </div>

        {/* Custom Formats List */}
        {customFormats.map((format) => (
          <div key={format.id}>
            {editingFormat?.id === format.id ? (
              // 수정 폼
              <div className="p-3 border border-slate-900 rounded-xl bg-white space-y-3 ring-1 ring-slate-900">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.settings.formats.formatName}
                  </label>
                  <input
                    type="text"
                    value={editFormatName}
                    onChange={(e) => setEditFormatName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none"
                    placeholder={t.settings.formats.formatName}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.settings.formats.formatPrompt}
                  </label>
                  <textarea
                    value={editFormatPrompt}
                    onChange={(e) => setEditFormatPrompt(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none resize-none"
                    rows={3}
                    placeholder={t.settings.formats.promptPlaceholder}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 px-3 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium min-h-[44px]"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={!editFormatName || !editFormatPrompt || formatLoading}
                    className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold disabled:bg-slate-300 min-h-[44px]"
                  >
                    {formatLoading ? t.common.loading : t.common.save}
                  </button>
                </div>
              </div>
            ) : (
              // 일반 카드 - 클릭하면 기본값으로 설정
              <div
                onClick={() => handleSetDefaultFormat(format.id)}
                className={`p-3 border rounded-xl cursor-pointer transition-all ${
                  format.is_default
                    ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                    : "border-slate-200 hover:border-slate-400"
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
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {/* 수정 아이콘 */}
                    <button
                      onClick={() => handleStartEdit(format)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg min-h-[32px] min-w-[32px]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    {/* 삭제 아이콘 */}
                    <button
                      onClick={() => handleDeleteFormat(format.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg min-h-[32px] min-w-[32px]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
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
      </div>
    </div>
  );
}
