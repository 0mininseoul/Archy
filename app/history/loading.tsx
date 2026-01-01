import { BottomTab } from "@/components/navigation/bottom-tab";

export default function HistoryLoading() {
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-header-title">기록</h1>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {/* Filter Chips Skeleton */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[44px] w-16 bg-slate-100 rounded-full animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Recordings List Skeleton */}
        <div className="px-4 py-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-3/4 bg-slate-100 rounded animate-pulse" />
                  <div className="h-4 w-1/2 bg-slate-100 rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Bottom Tab Navigation */}
      <BottomTab />
    </div>
  );
}
