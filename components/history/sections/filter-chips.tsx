"use client";

import { useI18n } from "@/lib/i18n";

type FilterValue = "all" | "processing" | "completed" | "failed";

interface FilterChipsProps {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}

export function FilterChips({ value, onChange }: FilterChipsProps) {
  const { t } = useI18n();

  const filters: { value: FilterValue; label: string }[] = [
    { value: "all", label: t.history.filters.all },
    { value: "processing", label: t.history.filters.processing },
    { value: "completed", label: t.history.filters.completed },
    { value: "failed", label: t.history.filters.failed },
  ];

  return (
    <div className="px-4 py-3 border-b border-slate-100">
      <div className="scroll-x flex gap-2 pb-1">
        {filters.map((item) => (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
              value === item.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
