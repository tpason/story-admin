"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  IconActivity,
  IconBook,
  IconDashboard,
  IconMenu,
  IconQueue,
  IconShield,
  IconTerminal,
  IconUsers
} from "@/components/ui/NavIcons";
import { canAccessPath, scopeLabel, type AdminScope } from "@/lib/admin-rbac";

type AdminShellProps = {
  username?: string;
  adminScope?: AdminScope;
  children: React.ReactNode;
};

const NAV_ITEMS = [
  { href: "/", label: "Tổng quan", icon: IconDashboard, match: (p: string) => p === "/" },
  { href: "/stories", label: "Truyện", icon: IconBook, match: (p: string) => p.startsWith("/stories") },
  { href: "/quality", label: "QA", icon: IconShield, match: (p: string) => p.startsWith("/quality") },
  { href: "/jobs", label: "Hàng đợi", icon: IconQueue, match: (p: string) => p.startsWith("/jobs") },
  { href: "/operations", label: "Scripts", icon: IconTerminal, match: (p: string) => p.startsWith("/operations") },
  { href: "/activity", label: "Nhật ký", icon: IconActivity, match: (p: string) => p.startsWith("/activity") },
  { href: "/users", label: "Người dùng", icon: IconUsers, match: (p: string) => p.startsWith("/users") },
  { href: "/moderation", label: "Kiểm duyệt", icon: IconShield, match: (p: string) => p.startsWith("/moderation") }
] as const;

function userInitial(username: string) {
  return username.slice(0, 1).toUpperCase();
}

export function AdminShell({ username, adminScope = "full", children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) => canAccessPath(adminScope, item.href));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <div className="admin-shell">
      <button
        type="button"
        className="sidebar-toggle"
        aria-label="Mở menu"
        onClick={() => setSidebarOpen(true)}
      >
        <IconMenu />
      </button>

      <div
        className="sidebar-backdrop"
        data-open={sidebarOpen ? "true" : undefined}
        onClick={closeSidebar}
        aria-hidden={!sidebarOpen}
      />

      <aside className="admin-sidebar" data-open={sidebarOpen ? "true" : undefined}>
        <div className="admin-brand">
          <div className="admin-brand-mark">B</div>
          <div className="admin-brand-text">
            <strong>BetterBox Admin</strong>
            <small>Pipeline quản trị</small>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Điều hướng chính">
          {visibleNav.map(({ href, label, icon: Icon, match }) => (
            <Link
              key={href}
              href={href}
              data-active={match(pathname) ? "true" : undefined}
              onClick={closeSidebar}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          {username ? (
            <div className="admin-user-pill">
              <div className="admin-user-avatar" aria-hidden>
                {userInitial(username)}
              </div>
              <div className="admin-user-meta">
                <strong>{username}</strong>
                <span>{scopeLabel(adminScope)}</span>
              </div>
            </div>
          ) : null}
          <button type="button" className="btn btn-secondary btn-sm" onClick={logout} style={{ width: "100%" }}>
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}
