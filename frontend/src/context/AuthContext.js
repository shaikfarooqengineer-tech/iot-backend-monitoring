// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/context/AuthContext.js
// PURPOSE: Global authenticated user state. Single place /api/auth/me is called.
//          All components read user from here — never call /me themselves.
// ═══════════════════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authFetch } from "@/utils/authFetch";

// ─── Context ────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ─── Provider ───────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);  // true until /me resolves
  const [token,   setToken]   = useState(() => localStorage.getItem("session_token") ?? null);

  // Verify session on every page load / refresh
  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await authFetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/me`);
        setUser(res.ok ? await res.json() : null);
      } catch {
        // Network error — treat as unauthenticated, ProtectedRoute handles redirect
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    verifySession();
  }, []);

  // Atomic token setter to prevent sync mismatches
  const saveToken = useCallback((newToken) => {
    setToken(newToken);
    if (newToken) {
      localStorage.setItem("session_token", newToken);
    } else {
      localStorage.removeItem("session_token");
    }
  }, []);

  // Clears session on server + wipes local state.
  // Navigation is handled by ProtectedRoute reacting to user === null.
  const logout = useCallback(async () => {
    try {
      await authFetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/logout`, { method: "POST" });
    } catch { /* ignore network errors on logout */ }
    setUser(null);
    saveToken(null);
  }, [saveToken]);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout, token, saveToken }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
