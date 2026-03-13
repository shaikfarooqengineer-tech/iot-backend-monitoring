import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import Dashboard from "@/pages/Dashboard";
import Register from "@/pages/Register";
import NewLogin from "@/pages/NewLogin";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import ProtectedRoute from "@/components/ui/ProtectedRoute";
import { Toaster } from "@/components/ui/sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function LandingPage() {
  const [adminExists, setAdminExists] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/check-admin`);
      const data = await response.json();
      setAdminExists(data.admin_exists);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return <Navigate to={adminExists ? "/login" : "/register"} replace />;
}

function AppRouter() {
  const location = useLocation();

 // DEBUG: check what React receives for each component
  console.log({
    Dashboard,
    Register,
    NewLogin,
    Login,
    AuthCallback,
    ProtectedRoute
  });

  // CRITICAL: Check for session_id synchronously during render (prevents race conditions)
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<NewLogin />} />
      <Route path="/oauth-login" element={<Login />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard backendUrl={BACKEND_URL} />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AppRouter />
        <Toaster position="top-right" />
      </BrowserRouter>
    </div>
  );
}

export default App;