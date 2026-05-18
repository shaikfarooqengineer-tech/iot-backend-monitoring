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
        <div className="px-14 py-2 max-w-[1800px] mx-auto flex items-center justify-between">

          {/* Left: avatar + name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 overflow-hidden flex items-center justify-center flex-shrink-0">
              {user?.avatar_url
                ? <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                : <User className="w-5 h-5 text-indigo-600" />
              }
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900 leading-tight">
                {user?.full_name ?? user?.name ?? "Patient"}
              </p>
              <p className="text-sm text-slate-500">Patient</p>
            </div>
          </div>

          {/* Right: logout */}
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-slate-600 hover:text-red-600 hover:bg-red-50 gap-2"
          >
            <LogOut className="w-6 h-6" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* ─── Page content ─────────────────────────────────────────────── */}
      <main className=" max-w-[1800px] mx-auto px-12 py-6">
        {children}
      </main>
    </div>
  );
}
