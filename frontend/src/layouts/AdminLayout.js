// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/layouts/AdminLayout.js
// PURPOSE: Sidebar-driven shell for superadmin, hospital_admin, and staff.
//
//  Desktop : Sidebar always mounted. X → collapses to icon-only rail.
//  Mobile  : Sidebar hidden. Menu hamburger → slides in drawer.
//            X inside drawer → closes drawer → back to hamburger.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";

export function AdminLayout({ children, pageTitle }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* ─── Desktop sidebar (hidden on mobile) ────────────────────────── */}
      {/* No onClose here — X will collapse to icon rail, not unmount */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <Sidebar />
      </div>

      {/* ─── Mobile drawer overlay ──────────────────────────────────────── */}
      {/* onClose passed here — X will close the drawer back to hamburger  */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer panel — Sidebar owns logo + X, no extra header */}
          <div className="relative z-50 flex flex-col w-64 bg-white shadow-xl">
            <Sidebar
              onNavigate={() => setMobileOpen(false)}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ─── Main content area ─────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Mobile-only top bar — shows hamburger when drawer is closed */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Menu className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-lg font-semibold text-slate-900">
            {pageTitle ?? "VitalSync"}
          </h1>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}