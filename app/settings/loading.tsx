import { BottomTab } from "@/components/navigation/bottom-tab";

export default function SettingsLoading() {
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-header-title">설정</h1>
      </header>

      {/* Main Content */}
      <main className="app-main px-4 py-4">
        <div className="space-y-4">
          {/* Account Info Skeleton */}
          <div className="card p-4">
            <div className="h-5 w-20 bg-slate-100 rounded animate-pulse mb-3" />
            <div className="space-y-4">
              <div>
                <div className="h-3 w-16 bg-slate-100 rounded animate-pulse mb-2" />
                <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
              </div>
              <div>
                <div className="h-3 w-24 bg-slate-100 rounded animate-pulse mb-2" />
                <div className="h-2 w-full bg-slate-100 rounded-full animate-pulse" />
              </div>
            </div>
          </div>

          {/* Integrations Skeleton */}
          <div className="card p-4">
            <div className="h-5 w-16 bg-slate-100 rounded animate-pulse mb-3" />
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="p-3 border border-slate-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
                      <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
                    </div>
                    <div className="h-9 w-16 bg-slate-100 rounded-lg animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Formats Skeleton */}
          <div className="card p-4">
            <div className="h-5 w-24 bg-slate-100 rounded animate-pulse mb-3" />
            <div className="p-3 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-slate-100 rounded-lg animate-pulse" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-20 bg-slate-100 rounded animate-pulse" />
                  <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Tab Navigation */}
      <BottomTab />
    </div>
  );
}
