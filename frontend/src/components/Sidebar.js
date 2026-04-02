// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/components/Sidebar.js
// PURPOSE: Navigation sidebar for admin/staff roles.
//          Filters nav items by role. Has logo top, profile+logout bottom.
//          Desktop  → Collapsed: icon-only rail. X collapses, logo hover expands.
//          Mobile   → Always fully expanded. X fires onClose (closes drawer).
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useCallback } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Building2, Users, UserCircle,
  Cpu, LogOut, Activity, PanelRightOpen, X,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { NAV_ITEMS } from "@/constants/roles";
import { RoleBadge } from "@/components/RoleBadge";

// ─── Icon map ────────────────────────────────────────────────────────────────
const NAV_ICONS = {
  "/dashboard": LayoutDashboard,
  "/hospitals": Building2,
  "/patients": UserCircle,
  "/users": Users,
  "/devices": Cpu,
  "/my-health": Activity,
};

// ─── Mini toast hook ─────────────────────────────────────────────────────────
function useHoverToast() {
  const [toasts, setToasts] = useState([]);
  const timerRef = useRef({});

  const showToast = useCallback((label, anchorEl) => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const id = Date.now();

    setToasts(prev => [...prev, {
      id,
      label,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    }]);

    timerRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 1800);
  }, []);

  const clearToastsFor = useCallback((label) => {
    setToasts(prev => prev.filter(t => t.label !== label));
  }, []);

  return { toasts, showToast, clearToastsFor };
}

// ─── ToastLayer ──────────────────────────────────────────────────────────────
function ToastLayer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{ top: t.top, left: t.left, transform: "translateY(-50%)" }}
          className="
            fixed z-[9999] px-3 py-1.5 rounded-md
            bg-slate-900 text-white text-xs font-medium
            shadow-lg pointer-events-none
            animate-toast-in
          "
        >
          {t.label}
          <span
            className="absolute right-full top-1/2 -translate-y-1/2
              border-4 border-transparent border-r-slate-900"
          />
        </div>
      ))}
    </>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
// onNavigate — called on nav link click
// onClose    — provided only on mobile; X closes the drawer instead of collapsing
export function Sidebar({ onNavigate, onClose }) {
  const { user, logout } = useAuth();
  const { role, can } = usePermissions();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const { toasts, showToast, clearToastsFor } = useHoverToast();

  // On mobile (onClose provided) collapse behaviour is fully disabled
  const isMobile = !!onClose;

  const visibleNav = NAV_ITEMS.filter(item => {
    if (item.roles && !item.roles.includes(role)) return false;
    if (item.permission && !can(item.permission)) return false;
    return true;
  });

  // Toasts only fire on desktop collapsed state
  const handleIconHover = (e, label) => {
    if (isCollapsed && !isMobile) showToast(label, e.currentTarget);
  };
  const handleIconLeave = (label) => {
    if (isCollapsed && !isMobile) clearToastsFor(label);
  };

  // X button: mobile → close drawer | desktop → collapse to icon rail
  const handleClose = () => {
    if (onClose) onClose();
    else setIsCollapsed(true);
  };

  return (
    <>
      {/* ── Sidebar panel ──────────────────────────────────────────────── */}
      <div
        className={`
          relative flex flex-col h-full bg-white border-r border-slate-200
          overflow-hidden
          transition-[width] duration-300 ease-in-out
          ${(isCollapsed && !isMobile) ? "w-16" : "w-64"}
        `}
      >
        {/* ─── Logo + X ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-3 py-4 border-b border-slate-100 min-h-[60px]">

          {/* Logo — desktop collapsed hover reveals open arrow + toast */}
          <div
            className="group relative flex items-center gap-3 cursor-pointer select-none"
            onMouseEnter={e => {
              if (isCollapsed && !isMobile) showToast("opensider", e.currentTarget);
            }}
            onMouseLeave={() => {
              if (isCollapsed && !isMobile) clearToastsFor("opensider");
            }}
            onClick={() => (isCollapsed && !isMobile) && setIsCollapsed(false)}
          >
            {/* Logo bubble */}
            <div
              className="
                w-8 h-8 rounded-lg bg-indigo-600
                flex items-center justify-center flex-shrink-0
                transition-colors duration-200
                group-hover:bg-indigo-700
              "
            >
              <span className="relative w-4 h-4">
                <Activity
                  className={`
                    absolute inset-0 w-4 h-4 text-white
                    transition-all duration-200
                    ${(isCollapsed && !isMobile) ? "group-hover:opacity-0 group-hover:scale-75" : ""}
                  `}
                />
                {(isCollapsed && !isMobile) && (
                  <PanelRightOpen
                    className="
                      absolute inset-0 w-5 h-5 text-white
                      opacity-0 scale-75
                      group-hover:opacity-100 group-hover:scale-100
                      transition-all duration-200
                    "
                  />
                )}
              </span>
            </div>

            {/* Brand name */}
            <span
              className={`
                text-base font-bold text-slate-900 whitespace-nowrap
                transition-all duration-300
                ${(isCollapsed && !isMobile)
                  ? "opacity-0 w-0 overflow-hidden"
                  : "opacity-100 w-auto"}
              `}
            >
              VitalSync
            </span>
          </div>

          {/* X button */}
          <button
            onClick={handleClose}
            className={`
              p-1 rounded-md hover:bg-slate-100 flex-shrink-0
              transition-all duration-200
              ${(isCollapsed && !isMobile)
                ? "opacity-0 pointer-events-none w-0"
                : "opacity-100 w-auto"}
            `}
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* ─── Navigation ─────────────────────────────────────────────── */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {visibleNav.map(item => {
            const Icon = NAV_ICONS[item.href] ?? LayoutDashboard;

            return (
              <NavLink
                key={item.href}
                to={item.href}
                onClick={onNavigate}
                onMouseEnter={e => handleIconHover(e, item.label)}
                onMouseLeave={() => handleIconLeave(item.label)}
                className={({ isActive }) => `
                  flex items-center gap-3 px-3 py-2.5 rounded-lg
                  text-sm font-medium transition-all duration-200
                  ${(isCollapsed && !isMobile) ? "justify-center" : ""}
                  ${isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}
                `}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span
                  className={`
                    whitespace-nowrap overflow-hidden
                    transition-all duration-300
                    ${(isCollapsed && !isMobile)
                      ? "opacity-0 w-0 max-w-0"
                      : "opacity-100 w-auto max-w-[160px]"}
                  `}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        {/* ─── Profile + Logout ──────────────────────────────────────── */}
        <div className="border-t border-slate-200 px-2 py-3 space-y-1">

          {/* Profile row */}
          <div
            className={`
              flex items-center gap-3 px-3 py-2 rounded-lg cursor-default
              ${(isCollapsed && !isMobile) ? "justify-center" : ""}
            `}
            onMouseEnter={e =>
              handleIconHover(e, user?.full_name ?? user?.name ?? "Profile")
            }
            onMouseLeave={() =>
              handleIconLeave(user?.full_name ?? user?.name ?? "Profile")
            }
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt="avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold text-slate-500">
                  {(user?.name ?? "U")[0].toUpperCase()}
                </span>
              )}
            </div>

            {/* Name + role badge */}
            <div
              className={`
                min-w-0 overflow-hidden transition-all duration-300
                ${(isCollapsed && !isMobile)
                  ? "opacity-0 w-0 max-w-0"
                  : "opacity-100 w-auto max-w-[160px]"}
              `}
            >
              <p className="text-sm font-medium text-slate-900 truncate">
                {user?.full_name ?? user?.name ?? "User"}
              </p>
              <RoleBadge role={user?.role} />
            </div>
          </div>

          {/* Logout button */}
          <button
            onClick={logout}
            onMouseEnter={e => handleIconHover(e, "Sign out")}
            onMouseLeave={() => handleIconLeave("Sign out")}
            className={`
              flex items-center gap-3 w-full px-3 py-2.5 rounded-lg
              text-sm font-medium transition-all duration-200
              text-slate-600 hover:bg-red-50 hover:text-red-700
              ${(isCollapsed && !isMobile) ? "justify-center" : ""}
            `}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span
              className={`
                whitespace-nowrap overflow-hidden transition-all duration-300
                ${(isCollapsed && !isMobile)
                  ? "opacity-0 w-0 max-w-0"
                  : "opacity-100 w-auto max-w-[160px]"}
              `}
            >
              Logout
            </span>
          </button>
        </div>
      </div>

      {/* ── Hover toasts ───────────────────────────────────────────────── */}
      <ToastLayer toasts={toasts} />
    </>
  );
}