"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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

  const [customFormats, setCustomFormats] = useState<CustomFormat[]>(
    Array.isArray(initialFormats) ? initialFormats : []
  );
  const [showFormatForm, setShowFormatForm] = useState(false);
  const [newFormatName, setNewFormatName] = useState("");
  const [newFormatPrompt, setNewFormatPrompt] = useState("");

  // 수정 모드 상태
  const [editingFormat, setEditingFormat] = useState<CustomFormat | null>(null);
  const [editFormatName, setEditFormatName] = useState("");
  const [editFormatPrompt, setEditFormatPrompt] = useState("");

  // temp ID로 기본값 설정 시도 시 저장 (서버 응답 후 실제 ID로 PUT 호출)
  const pendingDefaultTempIdRef = useRef<string | null>(null);

  // 부모에서 포맷 목록을 다시 받아오면 로컬 상태와 동기화
  useEffect(() => {
    setCustomFormats(Array.isArray(initialFormats) ? initialFormats : []);
  }, [initialFormats]);

  // 스마트 포맷이 기본값인지 확인 (커스텀 포맷 중 기본값이 없으면 스마트 포맷이 기본값)
  const isSmartFormatDefault = !customFormats.some(f => f.is_default);

  // 커스텀 포맷을 기본값으로 설정 (Optimistic Update)
  const handleSetDefaultFormat = useCallback(async (id: string) => {
    // 이미 기본값인 경우 무시
    const targetFormat = customFormats.find(f => f.id === id);
    if (targetFormat?.is_default) return;

    // 임시 ID인 경우: UI만 업데이트하고 pending에 저장 (서버 응답 후 실제 PUT 호출)
    if (id.startsWith("temp-")) {
      pendingDefaultTempIdRef.current = id;
      setCustomFormats(formats =>
        formats.map(f => ({
          ...f,
          is_default: f.id === id,
        }))
      );
      return;
    }

    // 다른 포맷 선택 시 pending 초기화
    pendingDefaultTempIdRef.current = null;

    // Optimistic update - 즉시 UI 반영
    const previousFormats = customFormats;
    setCustomFormats(formats =>
      formats.map(f => ({
        ...f,
        is_default: f.id === id,
      }))
    );

    try {
      const response = await fetch("/api/formats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_default: true }),
      });
      if (!response.ok) {
        // 실패 시 롤백
        setCustomFormats(previousFormats);
        alert(t.settings.formats.setDefaultFailed);
      }
    } catch (error) {
      console.error("Failed to set default format:", error);
      // 실패 시 롤백
      setCustomFormats(previousFormats);
      alert(t.settings.formats.setDefaultFailed);
    }
  }, [customFormats, t]);

  // 스마트 포맷을 기본값으로 설정 (Optimistic Update)
  const handleSetSmartFormatDefault = useCallback(async () => {
    // 이미 스마트 포맷이 기본값이면 아무것도 안 함
    if (isSmartFormatDefault) return;

    // pending default 초기화 (temp 포맷이 기본값이었다가 스마트 포맷 선택 시)
    pendingDefaultTempIdRef.current = null;

    // Optimistic update - 즉시 UI 반영
    const previousFormats = customFormats;
    setCustomFormats(formats =>
      formats.map(f => ({
        ...f,
        is_default: false,
      }))
    );

    try {
      const response = await fetch("/api/formats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear_all_default: true }),
      });
      if (!response.ok) {
        // 실패 시 롤백
        setCustomFormats(previousFormats);
        alert(t.settings.formats.setDefaultFailed);
      }
    } catch (error) {
      console.error("Failed to set smart format as default:", error);
      // 실패 시 롤백
      setCustomFormats(previousFormats);
      alert(t.settings.formats.setDefaultFailed);
    }
  }, [isSmartFormatDefault, customFormats, t]);

  // 포맷 생성 (Optimistic Update)
  const handleCreateFormat = useCallback(async () => {
    if (!newFormatName || !newFormatPrompt) return;

    // Optimistic update - 임시 ID로 즉시 추가
    const tempId = `temp-${Date.now()}`;
    const newFormat: CustomFormat = {
      id: tempId,
      name: newFormatName.trim(),
      prompt: newFormatPrompt.trim(),
      is_default: false,
      created_at: new Date().toISOString(),
    };

    const previousFormats = customFormats;
    setCustomFormats(formats => [newFormat, ...formats]);
    setShowFormatForm(false);
    setNewFormatName("");
    setNewFormatPrompt("");

    try {
      const response = await fetch("/api/formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFormat.name,
          prompt: newFormat.prompt,
          is_default: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const createdFormat = data.data?.format || data.format;

        // 서버에서 받은 실제 ID로 교체
        // pending default가 이 temp ID였다면 is_default: true로 유지
        const shouldBeDefault = pendingDefaultTempIdRef.current === tempId;
        setCustomFormats(formats =>
          formats.map(f => (f.id === tempId ? { ...createdFormat, is_default: shouldBeDefault || createdFormat.is_default } : f))
        );

        // pending default였다면 서버에도 기본값 설정 요청
        if (shouldBeDefault) {
          pendingDefaultTempIdRef.current = null;
          fetch("/api/formats", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: createdFormat.id, is_default: true }),
          }).catch(err => console.error("Failed to set default after create:", err));
        }
      } else {
        const data = await response.json();
        // 실패 시 롤백
        pendingDefaultTempIdRef.current = null;
        setCustomFormats(previousFormats);
        // API 에러 메시지를 번역된 텍스트로 변환
        const errorMessage = data.error === "Maximum format limit reached"
          ? t.settings.formats.maxFormats
          : (data.error || t.settings.formats.saveFailed);
        alert(errorMessage);
      }
    } catch (error) {
      console.error("Failed to create format:", error);
      // 실패 시 롤백
      pendingDefaultTempIdRef.current = null;
      setCustomFormats(previousFormats);
      alert(t.settings.formats.saveFailed);
    }
  }, [newFormatName, newFormatPrompt, customFormats, t]);

  // 포맷 삭제 (Optimistic Update)
  const handleDeleteFormat = useCallback(async (id: string) => {
    if (!confirm(t.settings.formats.deleteConfirm)) return;

    // Optimistic update - 즉시 삭제
    const previousFormats = customFormats;
    setCustomFormats(formats => formats.filter(f => f.id !== id));

    try {
      const response = await fetch(`/api/formats?id=${id}`, { method: "DELETE" });
      if (!response.ok) {
        // 실패 시 롤백
        setCustomFormats(previousFormats);
        alert(t.settings.formats.deleteFailed);
      }
    } catch (error) {
      console.error("Failed to delete format:", error);
      // 실패 시 롤백
      setCustomFormats(previousFormats);
      alert(t.settings.formats.deleteFailed);
    }
  }, [customFormats, t]);

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

  // 수정 저장 (Optimistic Update)
  const handleSaveEdit = useCallback(async () => {
    if (!editingFormat || !editFormatName || !editFormatPrompt) return;

    const updatedName = editFormatName.trim();
    const updatedPrompt = editFormatPrompt.trim();

    // Optimistic update - 즉시 UI 반영
    const previousFormats = customFormats;
    setCustomFormats(formats =>
      formats.map(f =>
        f.id === editingFormat.id
          ? { ...f, name: updatedName, prompt: updatedPrompt }
          : f
      )
    );
    setEditingFormat(null);
    setEditFormatName("");
    setEditFormatPrompt("");

    try {
      const response = await fetch("/api/formats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingFormat.id,
          name: updatedName,
          prompt: updatedPrompt,
        }),
      });

      if (!response.ok) {
        // 실패 시 롤백
        setCustomFormats(previousFormats);
        alert(t.settings.formats.editFailed);
      }
    } catch (error) {
      console.error("Failed to update format:", error);
      // 실패 시 롤백
      setCustomFormats(previousFormats);
      alert(t.settings.formats.editFailed);
    }
  }, [editingFormat, editFormatName, editFormatPrompt, customFormats, t]);

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
                    disabled={!editFormatName || !editFormatPrompt}
                    className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold disabled:bg-slate-300 min-h-[44px]"
                  >
                    {t.common.save}
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
                disabled={!newFormatName || !newFormatPrompt}
                className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold disabled:bg-slate-300 min-h-[44px]"
              >
                {t.common.save}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
