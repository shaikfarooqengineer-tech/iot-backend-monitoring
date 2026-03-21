// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/components/ProtectedRoute.js
// PURPOSE: Route guard. Redirects unauthenticated users to /login and
//          unauthorized users to /unauthorized. Shows spinner during auth check.
// ═══════════════════════════════════════════════════════════════════════════

import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ allowedRoles }) {
  const { user, loading } = useAuth();

  // Show nothing while the /me call is in flight — prevents flash redirect
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
