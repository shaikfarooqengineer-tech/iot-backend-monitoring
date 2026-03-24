# VitalSync Full Implementation — Task Checklist

## Phase 1: Backend Bug Fixes (server.py)
- [x] BUG: Fix `check-admin` variable name (`Superadmin` → [admin](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#603-661)) on line 775
- [x] BUG: Fix [HospitalCreate](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#89-92) model — remove required `created_by`/`created_at` 
- [x] BUG: Uncomment/fix `/api/patients` endpoint (currently returns hardcoded data)
- [x] BUG: Fix [reset_password_with_token](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#903-941) — `expires_at` may be datetime not string
- [x] BUG: Fix [get_pending_resets](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#943-975) — same `expires_at` issue
- [x] BUG: Fix logout to also check Authorization header for token
- [x] Verify all enum `.value` usages are correct
- [x] Verify all user projections exclude password

## Phase 2: Frontend Constants & Auth Infrastructure
- [x] Create [src/constants/roles.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/constants/roles.js)
- [x] Create [src/context/AuthContext.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/context/AuthContext.js)
- [x] Create [src/hooks/usePermissions.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/hooks/usePermissions.js)
- [x] Update [src/index.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/index.js) — add AuthProvider + BrowserRouter

## Phase 3: Shared Components
- [x] Create [src/components/RoleBadge.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/RoleBadge.js)
- [x] Create [src/components/RoleGate.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/RoleGate.js)
- [x] Create [src/components/ProtectedRoute.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/ProtectedRoute.js) (new Outlet-based)
- [x] Create [src/components/RoleHome.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/RoleHome.js)
- [x] Create [src/components/CreateUserModal.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/CreateUserModal.js)
- [x] Create [src/components/Sidebar.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/Sidebar.js)

## Phase 4: Layouts
- [x] Create [src/layouts/AdminLayout.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/layouts/AdminLayout.js)
- [x] Create [src/layouts/PatientLayout.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/layouts/PatientLayout.js)

## Phase 5: Pages
- [x] Rewrite [src/pages/Register.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/Register.js) — superadmin bootstrap only
- [x] Create [src/pages/Unauthorized.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/Unauthorized.js)
- [x] Create [src/pages/HospitalManagement.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/HospitalManagement.js)
- [x] Create [src/pages/UserManagement.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/UserManagement.js)
- [x] Create [src/pages/PatientList.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/PatientList.js)
- [x] Create [src/pages/PatientView.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/PatientView.js)
- [x] Update [src/pages/Dashboard.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/Dashboard.js) — use AuthContext, add RoleBadge

## Phase 6: App Router & Integration
- [x] Rewrite [src/App.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/App.js) — new router with ProtectedRoute + layouts
- [x] Update [src/pages/NewLogin.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/NewLogin.js) — redirect to role-based home

## Phase 7: Verification
- [x] Backend syntax check
- [/] Frontend compilation check
- [ ] Create walkthrough
