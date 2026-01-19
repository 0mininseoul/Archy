"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomFormat } from "@/types";

export default function FormatsPage() {
  const router = useRouter();
  const [formats, setFormats] = useState<CustomFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFormat, setNewFormat] = useState({ name: "", prompt: "" });

  useEffect(() => {
    fetchFormats();
  }, []);

  const fetchFormats = async () => {
    try {
      const response = await fetch("/api/formats");
      const data = await response.json();
      setFormats(data.formats || []);
    } catch (error) {
      console.error("Failed to fetch formats:", error);
    } finally {
      setLoading(false);
    }
  };

  const createFormat = async () => {
    if (!newFormat.name || !newFormat.prompt) {
      alert("Please enter a name and prompt.");
      return;
    }

    try {
      const response = await fetch("/api/formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newFormat),
      });

      if (response.ok) {
        const data = await response.json();
        setFormats([data.format, ...formats]);
        setShowCreateModal(false);
        setNewFormat({ name: "", prompt: "" });
      }
    } catch (error) {
      console.error("Failed to create format:", error);
      alert("Failed to create format.");
    }
  };

  const defaultFormats = [
    {
      name: "Meeting Minutes",
      icon: "🎙️",
      description: "Attendees, agenda items, decisions, action items",
      isDefault: true,
    },
    {
      name: "Interview Notes",
      icon: "📝",
      description: "Q&A format with key insights",
      isDefault: true,
    },
    {
      name: "Lecture Summary",
      icon: "📚",
      description: "Key concepts and section summaries",
      isDefault: true,
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard/settings")}
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
            <h1 className="text-2xl font-bold text-slate-900">Format Settings</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Default Formats */}
        <div className="card p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            Default Formats
          </h2>
          <div className="space-y-3">
            {defaultFormats.map((format, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl"
              >
                <div className="text-3xl">{format.icon}</div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900">{format.name}</h3>
                  <p className="text-sm text-slate-500">{format.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Formats */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900">
              Custom Formats
            </h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary py-2 px-4 shadow-lg shadow-slate-900/10 text-sm"
            >
              + Create New Format
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : formats.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📝</div>
              <p className="text-slate-500">
                No custom formats yet. Create one!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {formats.map((format) => (
                <div
                  key={format.id}
                  className="flex items-start gap-4 p-4 border border-gray-200 rounded-xl"
                >
                  <div className="text-3xl">📄</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900">
                      {format.name}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                      {format.prompt.substring(0, 100)}...
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              Create New Format
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Format Name
                </label>
                <input
                  type="text"
                  value={newFormat.name}
                  onChange={(e) =>
                    setNewFormat({ ...newFormat, name: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all placeholder:text-slate-400"
                  placeholder="e.g., Meeting Minutes"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  AI Prompt
                </label>
                <textarea
                  value={newFormat.prompt}
                  onChange={(e) =>
                    setNewFormat({ ...newFormat, prompt: e.target.value })
                  }
                  placeholder={`Please summarize the transcript:\n\n{{transcript}}\n\n## Format\n...\n\nTemplate variables: {{transcript}}, {{date}}`}
                  rows={12}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all placeholder:text-slate-400 font-mono text-sm"
                />
                <p className="text-sm text-slate-500 mt-2">
                  Available variables: {"{"}
                  {"{"}transcript{"}"} {"}"}, {"{"}
                  {"{"}date{"}"}
                  {"}"}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewFormat({ name: "", prompt: "" });
                }}
                className="flex-1 py-3 px-4 border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createFormat}
                disabled={!newFormat.name || !newFormat.prompt}
                className="btn-primary w-full shadow-lg shadow-slate-900/10 hover:shadow-slate-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Format
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
