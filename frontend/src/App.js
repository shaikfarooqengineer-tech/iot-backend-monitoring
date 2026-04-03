// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/App.js
// PURPOSE: Root router.
//          - Public routes: /register, /login, /oauth-login
//          - Protected routes behind <ProtectedRoute> → role-based layouts
//          - AuthCallback catch from hash fragment
// ═══════════════════════════════════════════════════════════════════════════

import "@/App.css";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Toaster }           from "@/components/ui/sonner";
import { useAuth }           from "@/context/AuthContext";
import { ProtectedRoute }    from "@/components/ProtectedRoute";
import { RoleHome }          from "@/components/RoleHome";
import { AdminLayout }       from "@/layouts/AdminLayout";
import { PatientLayout }     from "@/layouts/PatientLayout";
import { ROLES }             from "@/constants/roles";

// ─── Pages (lazily referenced, normal imports) ──────────────────────────────
import Register              from "@/pages/Register";
import NewLogin              from "@/pages/NewLogin";
import Login                 from "@/pages/Login";
import AuthCallback          from "@/pages/AuthCallback";
import Dashboard             from "@/pages/Dashboard";
import Unauthorized          from "@/pages/Unauthorized";
import HospitalManagement    from "@/pages/HospitalManagement";
import UserManagement        from "@/pages/UserManagement";
import PatientList           from "@/pages/PatientList";
import PatientMonitor        from "@/pages/PatientMonitor";
import Devices               from "@/pages/Devices";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// ─── Landing: redirects to /login or /register based on admin existence ────
function LandingPage() {
  const [dest,    setDest]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/check-admin`);
        const { admin_exists } = await res.json();
        setDest(admin_exists ? "/login" : "/register");
      } catch {
        setDest("/login"); // default to login on error
      } finally {
        setLoading(false);
      }
    };
    check();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }
  return <Navigate to={dest} replace />;
}

// ─── Admin layout wrapper ──────────────────────────────────────────────────
function AdminShell({ children, title }) {
  return <AdminLayout pageTitle={title}>{children}</AdminLayout>;
}

// ─── Patient layout wrapper ────────────────────────────────────────────────
function PatientShell({ children }) {
  return <PatientLayout>{children}</PatientLayout>;
}

// ─── Main router ───────────────────────────────────────────────────────────
function AppRouter() {
  const location = useLocation();
  const { user } = useAuth();

  // Hash-based auth callback intercept (emergent agent flow)
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      {/* ── Public routes ─────────────────────────────────────────────── */}
      <Route path="/"           element={<LandingPage />} />
      <Route path="/register"   element={<Register />} />
      <Route path="/login"      element={<NewLogin />} />
      <Route path="/oauth-login" element={<Login />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* ── Protected: Admin layout (superadmin, hospital_admin, staff) ─ */}
      <Route element={
        <ProtectedRoute allowedRoles={[ROLES.SUPERADMIN, ROLES.HOSPITAL_ADMIN, ROLES.STAFF]} />
      }>
        <Route path="/home" element={<RoleHome />} />
        
        {/* Superadmin only */}
        <Route path="/hospitals" element={
          <AdminShell title="Hospitals">
            <HospitalManagement />
          </AdminShell>
        } />

        {/* Admin + staff */}
        <Route path="/dashboard" element={
          <AdminShell title="Dashboard">
            <Dashboard backendUrl={BACKEND_URL} />
          </AdminShell>
        } />
        <Route path="/patients" element={
          <AdminShell title="Patients">
            <PatientList />
          </AdminShell>
        } />

        {/* Admin only — User management */}
        <Route path="/users" element={
          <AdminShell title="Users">
            <UserManagement />
          </AdminShell>
        } />

        {/* Patient Monitor (admin + staff) */}
        <Route path="/monitor/:patientId" element={
          <AdminShell title="Patient Monitor">
            <PatientMonitor />
          </AdminShell>
        } />

        {/* Devices (superadmin + hospital_admin) */}
        <Route path="/devices" element={
          <AdminShell title="Devices">
            <Devices />
          </AdminShell>
        } />
      </Route>

      {/* ── Protected: Patient layout ─────────────────────────────────── */}
      <Route element={
        <ProtectedRoute allowedRoles={[ROLES.PATIENT]} />
      }>
        <Route path="/my-health" element={
          <PatientShell>
            <PatientMonitor />
          </PatientShell>
        } />
      </Route>

      {/* ── Catch-all → role-aware home ───────────────────────────────── */}
      <Route path="*" element={
        user ? <RoleHome /> : <Navigate to="/login" replace />
      } />
    </Routes>
  );
}

// ─── App shell ─────────────────────────────────────────────────────────────
function App() {
  return (
    <div className="App">
      <AppRouter />
      <Toaster position="top-center" />
    </div>
  );
}

export default App;