// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/constants/roles.js
// PURPOSE: Single source of truth for roles, permissions, nav, and UI meta.
//          Mirrors the backend UserRole and Permission enums exactly.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Role strings (must match backend UserRole enum .value exactly) ─────────
export const ROLES = {
  SUPERADMIN:     "superadmin",
  HOSPITAL_ADMIN: "hospital_admin",
  STAFF:          "staff",
  PATIENT:        "patient",
};

// ─── Permission strings (must match backend Permission enum .value exactly) ──
export const PERMISSIONS = {
  CREATE_HOSPITAL:   "create_hospital",
  MANAGE_HOSPITAL:   "manage_hospital",
  ADD_STAFF:         "add_staff",
  ADD_PATIENT:       "add_patient",
  VIEW_PATIENT_DATA: "view_patient_data",
  EDIT_PATIENT_DATA: "edit_patient_data",
  ASSIGN_DEVICES:    "assign_devices",
  VIEW_IOT_STREAM:   "view_iot_stream",
};

// ─── What each role is allowed to DO ────────────────────────────────────────
export const ROLE_PERMISSIONS = {
  [ROLES.SUPERADMIN]: Object.values(PERMISSIONS),
  [ROLES.HOSPITAL_ADMIN]: [
    PERMISSIONS.MANAGE_HOSPITAL,
    PERMISSIONS.ADD_STAFF,
    PERMISSIONS.ADD_PATIENT,
    PERMISSIONS.VIEW_PATIENT_DATA,
    PERMISSIONS.EDIT_PATIENT_DATA,
    PERMISSIONS.ASSIGN_DEVICES,
    PERMISSIONS.VIEW_IOT_STREAM,
  ],
  [ROLES.STAFF]: [
    PERMISSIONS.ADD_PATIENT,
    PERMISSIONS.VIEW_PATIENT_DATA,
    PERMISSIONS.EDIT_PATIENT_DATA,
    PERMISSIONS.VIEW_IOT_STREAM,
  ],
  [ROLES.PATIENT]: [
    PERMISSIONS.VIEW_PATIENT_DATA,   // own data only — enforced server-side
    PERMISSIONS.VIEW_IOT_STREAM,
  ],
};

// ─── What each role is allowed to CREATE ────────────────────────────────────
// Mirrors server.py ROLE_CREATE_PERMISSIONS exactly.
// Frontend filtering is UX only — server always re-validates.
export const CREATABLE_ROLES = {
  [ROLES.SUPERADMIN]:     [ROLES.SUPERADMIN, ROLES.HOSPITAL_ADMIN],
  [ROLES.HOSPITAL_ADMIN]: [ROLES.STAFF, ROLES.PATIENT],
  [ROLES.STAFF]:          [ROLES.PATIENT],
  [ROLES.PATIENT]:        [],
};

// ─── UI display metadata ─────────────────────────────────────────────────────
export const ROLE_META = {
  [ROLES.SUPERADMIN]:     { label: "Superadmin",     badgeColor: "bg-purple-100 text-purple-800 border-purple-200" },
  [ROLES.HOSPITAL_ADMIN]: { label: "Hospital admin",  badgeColor: "bg-teal-100   text-teal-800   border-teal-200"   },
  [ROLES.STAFF]:          { label: "Staff",           badgeColor: "bg-blue-100   text-blue-800   border-blue-200"   },
  [ROLES.PATIENT]:        { label: "Patient",         badgeColor: "bg-orange-100 text-orange-800 border-orange-200" },
};

// ─── Navigation items (Sidebar filters this list by role/permission) ─────────
export const NAV_ITEMS = [
  { label: "Dashboard",       href: "/dashboard",  roles: [ROLES.SUPERADMIN, ROLES.HOSPITAL_ADMIN, ROLES.STAFF] },
  { label: "Hospitals",       href: "/hospitals",  roles: [ROLES.SUPERADMIN] },
  { label: "Patients",        href: "/patients",   roles: [ROLES.SUPERADMIN, ROLES.HOSPITAL_ADMIN, ROLES.STAFF] },
  { label: "User management", href: "/users",      roles: [ROLES.SUPERADMIN, ROLES.HOSPITAL_ADMIN] },
  { label: "Devices",         href: "/devices",    permission: PERMISSIONS.ASSIGN_DEVICES },
];

// ─── Role → home page after login ───────────────────────────────────────────
export const ROLE_HOME = {
  [ROLES.HOSPITAL_ADMIN]: "/dashboard",
  [ROLES.SUPERADMIN]:     "/hospitals",
  [ROLES.STAFF]:          "/dashboard",
  [ROLES.PATIENT]:        "/my-health",
};
