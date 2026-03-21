# VitalSync — Full Frontend Implementation Plan

Complete RBAC system, two-layout architecture, register flow fix, new admin/patient pages, and backend bug fixes.

## User Review Required

> [!IMPORTANT]
> **File extension convention**: The existing project uses [.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/App.js) for all pages/components (not [.jsx](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/ui/form.jsx) as mentioned in the prompt). All new files will use [.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/App.js) to stay consistent.

> [!IMPORTANT]  
> **Import aliases**: The project uses `@/` path aliases via craco (e.g., `import { authFetch } from '@/utils/authFetch'`). All new imports will follow this convention.

> [!WARNING]
> **Backend [HospitalCreate](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#89-94) model issue**: The current [HospitalCreate](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#89-94) Pydantic model requires `created_by` and `created_at` as mandatory fields in the request body. This means the frontend would need to send those — but they should be set server-side. I'll fix the model to make those optional/auto-populated.

> [!WARNING]
> **`/api/patients` endpoint is broken**: The route decorator exists but the actual DB query function is commented out and replaced with a hardcoded return. I'll restore the proper DB-backed implementation.

---

## Proposed Changes

### Backend Bug Fixes ([server.py](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py))

#### [MODIFY] [server.py](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py)

**Issues found and fixes:**

| Issue | Status | Fix |
|-------|--------|-----|
| BUG-01: Enum `.value` in MongoDB | ✅ Already fixed | Lines 608, 628, 759, 774, 1024 all use `.value` |
| BUG-02: Password excluded from projections | ✅ Already fixed | Line 508 has `"password": 0`, line 1049, 1147 also exclude |
| BUG-03: `expires_at` stored as datetime | ✅ Already fixed | Lines 888-889 store as datetime objects |
| BUG-04: `db is None` guard | ✅ Already fixed | Lines 483-484, 1244-1246 have guards |
| **Line 775 `Superadmin` variable name bug** | ❌ Still Present | `Superadmin` → [admin](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#605-663) (the variable from line 774) |
| **[HospitalCreate](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#89-94) model requires `created_by`/`created_at`** | ❌ Still Present | Make fields optional, set server-side |
| **`/api/patients` returns hardcoded data** | ❌ Still Present | Restore DB query with role-scoped access |
| **[reset_password_with_token](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#905-941) `expires_at` parsing** | ⚠️ Partially | Line 917 calls `fromisoformat()` — will crash if `expires_at` is already datetime. Add `isinstance` check. |
| **[get_pending_resets](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#943-973) same issue** | ⚠️ Partially | Line 957 same issue. Add `isinstance` check. |
| **Logout only checks cookies, not Bearer token** | ❌ Still Present | Also check `Authorization` header |
| **Root API message mismatch** | ❌ Minor | Line 1187 says "SleepWell" — change to "VitalSync" |

---

### Frontend — Constants & Auth Infrastructure

#### [NEW] [roles.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/constants/roles.js)
Single source of truth: role strings, permissions, nav items, role metadata, home routes.

#### [NEW] [AuthContext.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/context/AuthContext.js)
Global auth state with `/api/auth/me` verification on mount, `setUser`, [logout](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#1122-1130), `loading` flag.

#### [NEW] [usePermissions.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/hooks/usePermissions.js)
Derives `can()`, `canCreate()`, `isSuperAdmin`, etc. from user role.

#### [MODIFY] [index.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/index.js)
Wrap `<App />` with `<BrowserRouter>` and `<AuthProvider>`. Remove `<React.StrictMode>` wrapping (optional) or keep it.

---

### Frontend — Shared Components

#### [NEW] [RoleBadge.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/RoleBadge.js)
#### [NEW] [RoleGate.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/RoleGate.js)
#### [NEW] [ProtectedRoute.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/ProtectedRoute.js)
New file in `src/components/` (not [ui/](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#545-554)). Uses `<Outlet>` pattern for route nesting. The old [ui/ProtectedRoute.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/ui/ProtectedRoute.js) will be superseded.
#### [NEW] [RoleHome.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/RoleHome.js)
#### [NEW] [CreateUserModal.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/CreateUserModal.js)
#### [NEW] [Sidebar.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/Sidebar.js)

---

### Frontend — Layouts

#### [NEW] [AdminLayout.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/layouts/AdminLayout.js)
Sidebar shell for superadmin, hospital_admin, staff. Desktop sidebar, mobile hamburger drawer.

#### [NEW] [PatientLayout.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/layouts/PatientLayout.js)
Minimal top-bar for patients. No sidebar.

---

### Frontend — Pages

#### [MODIFY] [Register.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/Register.js)
Full rewrite: bootstrap superadmin only, check-admin guard, proper field mapping.

#### [NEW] [Unauthorized.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/Unauthorized.js)
#### [NEW] [HospitalManagement.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/HospitalManagement.js)
#### [NEW] [UserManagement.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/UserManagement.js)
#### [NEW] [PatientList.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/PatientList.js)
#### [NEW] [PatientView.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/PatientView.js)

#### [MODIFY] [Dashboard.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/Dashboard.js)
- Remove standalone auth check useEffect (lines 51-71) — use `useAuth()` instead
- Add `RoleBadge` to user profile display
- Wrap vitals/IoT sections with `RoleGate`
- Verify WS token key matches `session_token`

#### [MODIFY] [NewLogin.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/NewLogin.js)
- Store `session_token` in localStorage after login (already done)
- Navigate to role-based home instead of `/dashboard`

---

### Frontend — App Router

#### [MODIFY] [App.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/App.js)
Full rewrite of [AppRouter](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/App.js#45-77). Remove `BrowserRouter` (moved to [index.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/index.js)). Add [ProtectedRoute](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/ui/ProtectedRoute.js#7-60) wrappers, layout wrappers, `RoleHome` redirect. Keep `Toaster`.

---

## Verification Plan

### Automated Tests
1. **Backend syntax check**: `python -c "import ast; ast.parse(open('server.py').read()); print('OK')"`
2. **Frontend compilation**: Check `npm run start` terminal for compilation errors

### Browser Verification
After all code changes, verify in the browser:
1. Navigate to `/register` → should show bootstrap form (if no superadmin exists) or redirect to `/login`
2. Register a superadmin → redirects to `/hospitals`
3. Sidebar shows correct nav items for superadmin
4. Create a hospital → appears in list with copyable ID
5. Navigate to `/users` → create a hospital_admin user
6. Login as hospital_admin → sidebar shows different nav items, home is `/dashboard`
7. Patient visiting `/hospitals` → redirected to `/unauthorized`

### Manual Verification (User)
- Please verify after implementation that:
  1. The sidebar collapses on mobile (<768px) and shows hamburger
  2. Patient layout has no sidebar, just top bar
  3. Role badges display correctly in sidebar and user management
