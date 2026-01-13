"use client";

import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default function DashboardPage() {
  // Authentication is handled by middleware
  // No server-side auth check needed
  return <DashboardClient />;
}
