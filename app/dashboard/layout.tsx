import { ReactNode } from "react";
import { FinalizeIntentRecovery } from "@/components/recordings/finalize-intent-recovery";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <FinalizeIntentRecovery />
      {children}
    </>
  );
}
