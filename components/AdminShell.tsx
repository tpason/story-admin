"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type AdminShellProps = {
  username?: string;
  children: React.ReactNode;
};

export function AdminShell({ username, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          BetterBox Admin
          <small>Pipeline quản trị</small>
        </div>
        <nav className="admin-nav">
          <Link href="/" data-active={pathname === "/" ? "true" : undefined}>
            Dashboard
          </Link>
          <Link href="/stories" data-active={pathname.startsWith("/stories") ? "true" : undefined}>
            Truyện
          </Link>
          <Link href="/jobs" data-active={pathname.startsWith("/jobs") ? "true" : undefined}>
            Jobs
          </Link>
          <Link href="/operations" data-active={pathname.startsWith("/operations") ? "true" : undefined}>
            Scripts
          </Link>
          <Link href="/activity" data-active={pathname.startsWith("/activity") ? "true" : undefined}>
            Activity
          </Link>
          <Link href="/users" data-active={pathname.startsWith("/users") ? "true" : undefined}>
            Users
          </Link>
        </nav>
        <button type="button" className="btn btn-secondary" onClick={logout}>
          Đăng xuất
        </button>
      </aside>
      <main className="admin-main">
        <div className="admin-header">
          <div />
          {username ? <div className="admin-user">Xin chào, {username}</div> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
