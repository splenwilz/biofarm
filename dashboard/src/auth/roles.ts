/** The two access levels the shared passwords unlock. Safe to import in client code. */
export type Role = "viewer" | "admin";

export const ROLES: readonly Role[] = ["viewer", "admin"];

/** How the role reads on screen (sidebar footer, target change log). */
export const ROLE_LABEL: Record<Role, string> = { viewer: "View only", admin: "Admin" };
