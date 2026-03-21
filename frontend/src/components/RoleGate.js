// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/components/RoleGate.js
// PURPOSE: Declaratively hides/shows UI sections by role or permission.
//          Use instead of scattered inline ternaries.
// ═══════════════════════════════════════════════════════════════════════════

import { usePermissions } from "@/hooks/usePermissions";

/**
 * <RoleGate roles={["superadmin"]}>  — show only if role matches
 * <RoleGate permission="add_patient">  — show only if user has permission
 * <RoleGate roles={["staff"]} fallback={<p>No access</p>}>
 */
export function RoleGate({ roles, permission, children, fallback = null }) {
  const { role, can } = usePermissions();
  if (roles && !roles.includes(role)) return fallback;
  if (permission && !can(permission)) return fallback;
  return children;
}
