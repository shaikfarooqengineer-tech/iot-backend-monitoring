# VitalSync v3.1 — Implementation Plan

12 issues spanning backend (FastAPI) and frontend (React/CRA). All user requirements come from the detailed prompt specification.

## Proposed Changes

### Backend — [server.py](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py)

All backend changes go into a single file. The modifications add ~400 lines of new models and routes.

#### [MODIFY] [server.py](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py)

**New Pydantic models** (after existing [UserCreate](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#202-209)):
- `StaffPermissionUpdate` — `can_create_patients: bool`
- `PatientCreate` — auth fields + [room](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#348-356), [age](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/Dashboard.js#61-74), [status](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#348-356)
- `UserUpdate` / `PatientUpdate` — partial update models
- `DeviceModel`, `DeviceCreate`, `DeviceAssign`, `DeviceAssignToPatient`

**Modified models:**
- [User](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#191-201) — add `can_create_patients: bool = True`
- [UserCreate](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py#202-209) — add `can_create_patients: bool = True`

**New routes (15 total):**

| Route | Method | Issue | Purpose |
|-------|--------|-------|---------|
| `/api/users/{id}/permissions` | PATCH | 3 | Toggle staff patient-creation permission |
| `/api/patients` | POST | 4 | Create patient with medical fields |
| `/api/users/{id}` | PATCH | 5 | Edit user (name, email, username) |
| `/api/patients/{id}` | PATCH | 5 | Edit patient (+ room, age, status) |
| `/api/users/{id}` | DELETE | 7 | Permanently delete user + cascade |
| `/api/patients/{id}/monitor-data` | GET | 8 | Patient-scoped dashboard data |
| `/api/devices` | POST | 9 | Register device (superadmin) |
| `/api/devices` | GET | 9 | List devices (role-scoped) |
| `/api/devices/{id}/assign-hospital` | PATCH | 9 | Assign device to hospital |
| `/api/devices/{id}/assign-patient` | PATCH | 9 | Link device to patient |
| `/api/devices/{id}/unassign` | PATCH | 9 | Return device to pool |

**Modified route:**
- WebSocket `/api/ws` — add optional `patient_id` query param for patient-scoped streaming

**Modified logic in `create_user()`:**
- Check `can_create_patients` permission for staff creating patients

---

### Frontend — Utility

#### [NEW] [validation.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/utils/validation.js)
Email, password, confirm-password, required-field validators. Shared by all forms.

---

### Frontend — Login & Registration (Issues 1-2)

#### [MODIFY] [NewLogin.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/NewLogin.js)
- Add `Eye`/`EyeOff` toggle for password visibility
- Replace toast-only errors with inline red alert box (`loginError` state)
- Clear error on each submit attempt

#### [MODIFY] [Register.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/Register.js)
- Import validation helpers, replace inline checks with `firstError()`

#### [MODIFY] [CreateUserModal.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/CreateUserModal.js)
- Import validation helpers, replace inline checks with `firstError()`

---

### Frontend — New Components (Issues 3-7)

#### [NEW] [CreatePatientModal.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/CreatePatientModal.js)
Patient-specific creation form with medical fields (room, age, status). Posts to `POST /api/patients`.

#### [NEW] [EditUserModal.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/EditUserModal.js)
Dual-mode edit modal: standard fields for any user; medical fields added when editing a patient.

#### [NEW] [DeleteConfirmDialog.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/components/DeleteConfirmDialog.js)
Confirmation dialog using shadcn `AlertDialog`. Shows user name, warns about permanence.

---

### Frontend — Page Updates (Issues 3-8)

#### [MODIFY] [UserManagement.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/UserManagement.js)
- Add permission toggle (`Switch`) on staff rows for admins (Issue 3)
- Add edit button (`Pencil`) per row + `EditUserModal` (Issue 5)
- Add delete button (`Trash2`) per row + `DeleteConfirmDialog` (Issue 7)

#### [MODIFY] [PatientList.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/PatientList.js)
- Add "Admit patient" button + `CreatePatientModal` (Issue 4)
- Add edit button + `EditUserModal` (Issue 5)
- Add delete button + `DeleteConfirmDialog` (Issue 7)
- Change Monitor link from `/dashboard` to `/monitor/${patientId}` (Issue 8)

---

### Frontend — Dashboards (Issue 6)

#### [MODIFY] [Dashboard.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/Dashboard.js)
Replace the 621-line monolithic dashboard with a role switcher that imports the three sub-dashboards.

#### [NEW] [SuperAdminDashboard.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/dashboards/SuperAdminDashboard.js)
System overview: hospital count, user counts by role, quick actions.

#### [NEW] [HospitalAdminDashboard.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/dashboards/HospitalAdminDashboard.js)
Hospital overview: staff/patient counts, quick admit, manage links.

#### [NEW] [StaffDashboard.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/dashboards/StaffDashboard.js)
Retains the existing IoT WebSocket monitoring view from old [Dashboard.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/Dashboard.js).

---

### Frontend — Patient Monitor & Devices (Issues 8-9)

#### [NEW] [PatientMonitor.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/PatientMonitor.js)
Patient-scoped monitoring page. Connects to WebSocket with `patient_id` param, reuses the existing dashboard UI.

#### [NEW] [Devices.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/Devices.js)
Full device management: register, assign to hospital, unassign. Replaces "Coming soon" stub.

---

### Frontend — Routing

#### [MODIFY] [App.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/App.js)
- Add route `/monitor/:patientId` → `PatientMonitor` (Issue 8)
- Add route `/devices` → `Devices` (Issue 9)

---

## Verification Plan

### Automated Checks
1. **Backend AST check**: `python -c "import ast; ast.parse(open('server.py').read()); print('OK')"`
2. **Frontend build check**: `cd frontend && npx craco build` — verifies no import errors, no JSX syntax errors

### Manual Browser Testing
> [!IMPORTANT]
> Since this project requires a running MongoDB instance and backend server, full end-to-end testing requires manual verification by the user. The following test scenarios should be checked:

**Issue 1 — Login:** Type wrong credentials → verify inline red error box appears (not just toast). Click eye icon → password toggles visibility.

**Issue 2 — Validation:** Enter "notanemail" in Register or CreateUserModal email field → verify "valid email" error before API call.

**Issue 3 — Staff permissions:** As hospital admin, toggle "Can create patients" switch on a staff row → verify PATCH call succeeds.

**Issue 4 — Patient creation:** As hospital admin, click "Admit patient" → fill form → verify POST `/api/patients` succeeds.

**Issue 5 — Edit user:** Click pencil icon → edit name → Save → verify row updates without refresh.

**Issue 6 — Role dashboards:** Log in as superadmin → verify "System Overview". Log in as hospital_admin → verify "Hospital Dashboard". Log in as staff → verify IoT monitoring view.

**Issue 7 — Delete user:** Click trash icon → confirm dialog → verify user removed from list.

**Issue 8 — Patient Monitor:** Click "Monitor" on patient row → verify navigation to `/monitor/:id` with live WebSocket data showing that patient's info.

**Issue 9 — Devices:** As superadmin, register a device, assign to hospital, verify it moves between sections.
