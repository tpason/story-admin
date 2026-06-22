// Edge-safe constants shared between middleware (Edge runtime) and server auth.
// Keep this file free of Node-only imports (no node:crypto / node:util) so it can
// be bundled into the Edge middleware without UnhandledSchemeError.
export const SESSION_COOKIE = "story_admin_session";
