// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/components/RoleHome.js
// PURPOSE: Redirects "/" to the correct home page based on user role.
// ═══════════════════════════════════════════════════════════════════════════

import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ROLE_HOME } from "@/constants/roles";

export function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={ROLE_HOME[user?.role] ?? "/dashboard"} replace />;
}
