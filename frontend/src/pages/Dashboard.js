// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/Dashboard.js
// PURPOSE: Role-aware dashboard switcher. Renders the correct sub-dashboard
//          based on the current user's role.
// ═══════════════════════════════════════════════════════════════════════════

import { useAuth } from "@/context/AuthContext";
import SuperAdminDashboard    from "@/pages/dashboards/SuperAdminDashboard";
import HospitalAdminDashboard from "@/pages/dashboards/HospitalAdminDashboard";
import StaffDashboard         from "@/pages/dashboards/StaffDashboard";

export default function Dashboard({ backendUrl }) {
  const { user } = useAuth();

  if (user?.role === "superadmin")     return <SuperAdminDashboard />;
  if (user?.role === "hospital_admin") return <HospitalAdminDashboard />;
  return <StaffDashboard />;
}