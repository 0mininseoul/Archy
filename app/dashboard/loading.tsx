import Image from "next/image";
import { BottomTab } from "@/components/navigation/bottom-tab";

export default function DashboardLoading() {
    return (
        <div className="app-container">
            {/* Header */}
            <header className="app-header">
                <div className="flex items-center gap-2">
                    <Image
                        src="/icons/archy logo.png"
                        alt="Archy"
                        width={32}
                        height={32}
                        className="rounded-lg"
                    />
                    <span className="text-lg font-bold text-slate-900">Archy</span>
                </div>
            </header>

            {/* Main Content */}
            <main className="app-main flex flex-col items-center justify-center min-h-[calc(100vh-56px-64px)] px-4">
                <div className="w-full max-w-sm mx-auto">
                    <div className="card p-6 shadow-lg">
                        {/* Recorder Skeleton */}
                        <div className="space-y-6">
                            {/* Timer skeleton */}
                            <div className="flex justify-center">
                                <div className="h-16 w-32 bg-slate-100 rounded-lg animate-pulse" />
                            </div>
                            {/* Record button skeleton */}
                            <div className="flex justify-center">
                                <div className="w-20 h-20 rounded-full bg-slate-100 animate-pulse" />
                            </div>
                            {/* Controls skeleton */}
                            <div className="flex justify-center gap-4">
                                <div className="h-10 w-24 bg-slate-100 rounded-full animate-pulse" />
                                <div className="h-10 w-24 bg-slate-100 rounded-full animate-pulse" />
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
