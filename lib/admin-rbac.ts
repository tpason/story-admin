export type AdminScope = "full" | "ops" | "moderator";

export type AdminPermission =
  | "dashboard"
  | "stories"
  | "jobs"
  | "pipeline"
  | "moderation"
  | "manage_users"
  | "manage_admins";

const SCOPE_PERMISSIONS: Record<AdminScope, AdminPermission[]> = {
  full: ["dashboard", "stories", "jobs", "pipeline", "moderation", "manage_users", "manage_admins"],
  ops: ["dashboard", "stories", "jobs", "pipeline"],
  moderator: ["dashboard", "moderation", "manage_users"]
};

const NAV_PERMISSIONS: Record<string, AdminPermission> = {
  "/": "dashboard",
  "/stories": "stories",
  "/jobs": "jobs",
  "/operations": "pipeline",
  "/activity": "pipeline",
  "/users": "manage_users",
  "/moderation": "moderation"
};

export function normalizeAdminScope(value: string | null | undefined): AdminScope {
  if (value === "ops" || value === "moderator") return value;
  return "full";
}

export function scopeLabel(scope: AdminScope) {
  switch (scope) {
    case "full":
      return "Full admin";
    case "ops":
      return "Pipeline ops";
    case "moderator":
      return "Moderator";
    default:
      return scope;
  }
}

export function hasPermission(scope: AdminScope, permission: AdminPermission) {
  return SCOPE_PERMISSIONS[scope].includes(permission);
}

export function canAccessPath(scope: AdminScope, pathname: string) {
  if (pathname.startsWith("/stories")) return hasPermission(scope, "stories");
  if (pathname.startsWith("/jobs")) return hasPermission(scope, "jobs");
  if (pathname.startsWith("/operations")) return hasPermission(scope, "pipeline");
  if (pathname.startsWith("/activity")) return hasPermission(scope, "pipeline");
  if (pathname.startsWith("/users")) return hasPermission(scope, "manage_users");
  if (pathname.startsWith("/moderation")) return hasPermission(scope, "moderation");
  if (pathname === "/") return hasPermission(scope, "dashboard");
  return true;
}

export function visibleNavHrefs(scope: AdminScope) {
  return Object.entries(NAV_PERMISSIONS)
    .filter(([, permission]) => hasPermission(scope, permission))
    .map(([href]) => href);
}
