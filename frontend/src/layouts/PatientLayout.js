// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/layouts/PatientLayout.js
// PURPOSE: Minimal top-bar layout for patients. No sidebar.
//          Designed to feel like a consumer health app, not an admin portal.
// ═══════════════════════════════════════════════════════════════════════════

import { User, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

export function PatientLayout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ─── Top profile bar ───────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between">

          {/* Left: avatar + name */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
              {user?.avatar_url
                ? <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                : <User className="w-5 h-5 text-slate-400" />
              }
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-tight">
                {user?.full_name ?? user?.name ?? "Patient"}
              </p>
              <p className="text-xs text-slate-500">Patient</p>
            </div>
          </div>

          {/* Right: logout */}
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-slate-600 hover:text-slate-900 gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* ─── Page content ─────────────────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
