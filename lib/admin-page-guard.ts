import type { Route } from "next";
import { canAccessPath, visibleNavHrefs, type AdminScope } from "@/lib/admin-rbac";
import { getCurrentAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireAdminPage(pathname: string) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  if (!canAccessPath(admin.adminScope, pathname)) {
    const fallback = (visibleNavHrefs(admin.adminScope)[0] ?? "/") as Route;
    redirect(fallback);
  }

  return admin;
}

export type AdminPageContext = {
  admin: NonNullable<Awaited<ReturnType<typeof getCurrentAdmin>>>;
  adminScope: AdminScope;
};
