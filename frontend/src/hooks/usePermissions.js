// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/hooks/usePermissions.js
// PURPOSE: Derives permission booleans from the current user's role.
//          Use this everywhere instead of checking user.role strings directly.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { ROLE_PERMISSIONS, CREATABLE_ROLES, ROLES } from "@/constants/roles";

export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role ?? null;

  return useMemo(() => ({
    role,
    // can("view_patient_data") → true/false
    can: (permission) => (ROLE_PERMISSIONS[role] ?? []).includes(permission),
    // canCreate("staff") → true only if this role is allowed to create staff
    canCreate: (targetRole) => (CREATABLE_ROLES[role] ?? []).includes(targetRole),
    // Convenience booleans
    isSuperAdmin:    role === ROLES.SUPERADMIN,
    isHospitalAdmin: role === ROLES.HOSPITAL_ADMIN,
    isStaff:         role === ROLES.STAFF,
    isPatient:       role === ROLES.PATIENT,
    isAdmin:         [ROLES.SUPERADMIN, ROLES.HOSPITAL_ADMIN].includes(role),
  }), [role]);
}
