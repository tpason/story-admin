import { AdminShell } from "@/components/AdminShell";
import { ToastProvider } from "@/components/ui/ToastProvider";
import type { AdminScope } from "@/lib/admin-rbac";

type AdminAppShellProps = {
  username?: string;
  adminScope?: AdminScope;
  children: React.ReactNode;
};

export function AdminAppShell({ username, adminScope = "full", children }: AdminAppShellProps) {
  return (
    <ToastProvider>
      <AdminShell username={username} adminScope={adminScope}>
        {children}
      </AdminShell>
    </ToastProvider>
  );
}
