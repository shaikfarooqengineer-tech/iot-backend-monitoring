# Device Management, Patient Mapping & Real-Time Telemetry Routing

## PHASE 0 AUDIT — Pre-Implementation Fact Verification

All facts below are verified directly from the three source files. No item is inferred.

### ✅ `server.py` — Confirmed Facts

| Fact | Verified Location |
|---|---|
| Session-based auth only (NO JWT) | `get_current_user()` lines 508–559: reads `session_token` from cookie or `Authorization: Bearer` header, queries `user_sessions` collection |
| `RoleChecker([...roles])` exists | Lines 564–582: dependency class with `__call__` |
| `require_same_hospital(user, hospital_id)` exists | Lines 586–594: raises 403 if hospital mismatch |
| `DeviceCreate`, `DeviceAssign`, `DeviceAssignToPatient` defined | Lines 242–251: all three Pydantic models present |
| `UserRole` enum | Lines 97–101: `SUPERADMIN`, `HOSPITAL_ADMIN`, `STAFF`, `PATIENT` |
| `Permission` enum includes `ASSIGN_DEVICES`, `VIEW_IOT_STREAM` | Lines 105–113 |
| `can_create_patients: bool = True` on `User` | Line 200 |
| `can_assign_devices` does NOT exist — must be added | Not found anywhere in file |
| `api_router = APIRouter(prefix="/api")` is the only router | Line 52 |
| `app.include_router(api_router)` already called | Line 1639 — must NOT be called again |
| `create_indexes()` startup handler exists | Lines 1641–1655 — all new indexes go inside this one handler |
| `generate_telemetry_doc()` is a pure mock | Lines 1411–1466 — returns random data, no DB queries |
| `vitals_monitoring` collection **NEVER queried** anywhere | Searched entire file — zero references |
| WebSocket `/api/ws` exists with auth-frame protocol | Lines 1479–1590: accepts→auth frame→`auth_ok`→streaming loop |
| WS `patient_id` param accepted but unused for routing | Line 1483 declares it; lines 1555–1563 use `generate_telemetry_doc()` not patient_id |
| WS streams in `stream_telemetry()` coroutine every 3s | Lines 1560–1564: `await asyncio.sleep(3)` then `generate_telemetry_doc()` |
| Polling fallback `GET /api/dashboard-stream` exists | Lines 1393–1401: calls `generate_telemetry_doc()` |
| `log_activity()` exists | Lines 597–608: `async def log_activity(user_id, user_name, action, entity_type, entity_name, description)` |
| **Zero device API routes exist** | Searched entire file — no routes containing `/devices` |

### ✅ `Devices.js` — Confirmed Facts

| Fact | Verified Location |
|---|---|
| Calls `GET /api/devices` | Line 42 |
| Calls `POST /api/devices` | Line 55 |
| Calls `PATCH /api/devices/{device_id}/assign-hospital` | Line 78 |
| Calls `PATCH /api/devices/{device_id}/unassign` | Line 99 |
| Uses `authFetch` | Lines 42, 55, 78, 99 |
| Uses `usePermissions()` — currently only destructures `isSuperAdmin` | Line 25 |
| Uses shadcn/ui: `Card`, `Button`, `Input`, `Label`, `Badge`, `Dialog` | Lines 13–20 |
| **No assign-to-patient dialog or button exists** | Confirmed — no reference to `assign-patient` anywhere |
| State vars: `devices`, `loading`, `registerOpen`, `regForm`, `registering`, `assignDeviceId`, `assignHospitalId`, `assigning` | Lines 26–37 |
| Handlers: `handleRegister`, `handleAssignHospital`, `handleUnassign` | Lines 51–108 |
| `unassigned` / `assigned` computed from `devices` state | Lines 110–111 |

### ✅ `PatientMonitor.js` — Confirmed Facts

| Fact | Verified Location |
|---|---|
| Uses `useConnectionManager(patientId)` | Line 50 |
| `patientId = patientIdParam \|\| user?.user_id` | Line 47 |
| Connects to WS `/api/ws?patient_id=` (via `useConnectionManager`) | Confirmed by architecture comments lines 8–9 |
| Uses `GET /api/dashboard-stream` polling fallback | Confirmed by architecture comments lines 8–9 |
| All telemetry rendering in sub-components | Lines 28–38: 10 imported components |
| Loading/error screen when `doc` is null | Lines 61–87: full `!doc` guard renders spinner or WifiOff |
| `doc` is the raw telemetry document | Lines 91–183: `doc.hr`, `doc.br`, `doc.device_id` etc. directly accessed |
| No `doc.no_device` check exists | Confirmed — not present anywhere |
| Banner placement target: between header row and VitalsGrid | Lines 97–124: header at L97–110, VitalsGrid at L112–124 |

### ✅ `usePermissions.js` — Confirmed Facts

| Fact | Verified Location |
|---|---|
| Currently exports: `role`, `can()`, `canCreate()`, `isSuperAdmin`, `isHospitalAdmin`, `isStaff`, `isPatient`, `isAdmin` | Lines 15–27 |
| Uses `useAuth()` hook and `ROLES` constant | Lines 12–13 |
| Does NOT export: `canAssignDevices`, `canRegisterDevices`, `canAssignHospital`, `canUnassignDevices`, `canViewDevices` | Confirmed — none present |

### ✅ `App.js` — Confirmed Facts

| Fact | Verified Location |
|---|---|
| `/devices` route is inside `ProtectedRoute allowedRoles={[SUPERADMIN, HOSPITAL_ADMIN, STAFF]}` | Lines 95–138 |
| **Patients (`ROLES.PATIENT`) are already excluded from `/devices`** by router | Lines 95–96: allowedRoles does not include PATIENT |
| Patient route is `/my-health` → `PatientMonitor` in `PatientLayout` | Lines 142–150 |
| No inline patient redirect guard needed inside `Devices.js` — router already enforces it | Confirmed |

`✓ PHASE 0 AUDIT COMPLETE — all facts verified from source files, no invented items.`

---

## Key Discovery: Patient Route Guard Already Exists

> [!IMPORTANT]
> `App.js` already excludes `ROLES.PATIENT` from the `/devices` route via `ProtectedRoute`. No additional redirect guard is needed in Phase 5. The router will redirect patients to `/unauthorized` automatically. Phase 5 scope is reduced to extending `usePermissions` only.

---

## Proposed Changes

### Phase 1 — Data Layer

#### [MODIFY] [server.py](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py) — Models & Indexes

- Add `Device` Pydantic response model (separate from `DeviceCreate`/`DeviceAssign`/`DeviceAssignToPatient`):
  ```python
  class Device(BaseModel):
      model_config = ConfigDict(extra="ignore")
      device_id: str
      device_serial: str
      device_type: str
      firmware_version: Optional[str] = None
      hospital_id: Optional[str] = None
      assigned_patient_id: Optional[str] = None
      status: str  # "available" | "assigned_to_hospital" | "assigned_to_patient"
      last_seen: Optional[str] = None
      created_at: str
      updated_at: str
  ```
- Add `can_assign_devices: bool = False` to `User` model (line 200 area) and `UserCreate` model (line 210 area)
- Add `DevicePermissionUpdate` Pydantic model for the PATCH permissions endpoint
- Add inside existing `create_indexes()` handler:
  ```python
  await db.devices.create_index("device_id", unique=True)
  await db.devices.create_index("device_serial", unique=True)
  await db.devices.create_index([("assigned_patient_id", 1)], sparse=True)
  await db.devices.create_index([("hospital_id", 1)])
  await db.devices.create_index([("status", 1)])
  await db.vitals_monitoring.create_index([("device_id", 1), ("ts", -1)])
  ```

---

### Phase 2 — Backend Service Logic

#### [MODIFY] [server.py](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py) — Helper Functions

Add these after `log_activity()` (~line 608):

1. **`resolve_telemetry(patient_id: str) -> dict`** — shared async coroutine:
   - Query `devices.find_one({"assigned_patient_id": patient_id})`
   - If no device → return `generate_telemetry_doc() | {"source": "mock", "no_device": True}`
   - Query `vitals_monitoring.find_one({"device_id": device["device_serial"]}, sort=[("ts", -1)])`
   - If no vitals doc → return `generate_telemetry_doc() | {"source": "mock", "no_device": False}`
   - Else return real doc merged with `{"source": "live", "no_device": False}`
   - Side effect: update `devices.last_seen` from `telemetry["iso_timestamp"]`

2. **`validate_device_available(device_doc)`** — raises 409 if `assigned_patient_id is not None`

3. **`validate_patient_has_no_device(patient_id: str)`** — async, queries devices, raises 409 if found

4. **`validate_hospital_match(current_user, device_doc)`** — raises 403 if non-superadmin user's hospital ≠ device's hospital

5. **`can_assign_devices_check(user: User)`** — raises 403 unless superadmin, hospital_admin, or (staff with `can_assign_devices == True`)

6. **`sync_last_seen()`** — background async loop (every 10s) to sync `last_seen` from latest vitals

---

### Phase 3 — Backend API Routes

#### [MODIFY] [server.py](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py) — New Routes on `api_router`

All routes added to `api_router` only. `DuplicateKeyError` (code 11000) caught → HTTP 409.

| Method | Path | RBAC | Handler Name |
|---|---|---|---|
| POST | `/devices` | SuperAdmin only | `register_device()` |
| GET | `/devices` | SA=all; HA+Staff=hospital-scoped; Patient=403 | `list_devices()` |
| GET | `/devices/{device_id}` | SA + HA + Staff (hospital-scoped) | `get_device()` |
| PATCH | `/devices/{device_id}/assign-hospital` | SuperAdmin only | `assign_hospital()` |
| PATCH | `/devices/{device_id}/assign-patient` | SA + HA + Staff(if can_assign_devices) | `assign_patient()` |
| PATCH | `/devices/{device_id}/unassign` | SA + HA (hospital-scoped) | `unassign_device()` |
| GET | `/patient/device` | Any authenticated | `get_patient_device()` |
| PATCH | `/users/{user_id}/device-permissions` | SA + HA (hospital-scoped) | `update_device_permissions()` |

Key atomicity: `assign-patient` and `unassign` use `find_one_and_update` with conditional filter to prevent race conditions.

---

### Phase 4 — Streaming Integration

#### [MODIFY] [server.py](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/backend/server.py) — Streaming Updates

**`GET /api/dashboard-stream`** (lines 1393–1401) — add `patient_id: Optional[str] = Query(default=None)` param, replace `generate_telemetry_doc()` call with `resolve_telemetry(target_patient_id)`.

**WebSocket `stream_telemetry()` coroutine** (lines 1560–1564) — replace `generate_telemetry_doc()` with `await resolve_telemetry(target_patient_id)` where `target_patient_id = patient_id or session_doc.get("user_id")`. Also update initial snapshot (line 1555).

**`create_indexes()` startup handler** — add `asyncio.create_task(sync_last_seen())` at the end.

---

### Phase 5 — Frontend: `usePermissions` Hook

#### [MODIFY] [usePermissions.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/hooks/usePermissions.js)

Add to the existing `useMemo` return object (do NOT replace existing exports):
```javascript
canRegisterDevices: role === ROLES.SUPERADMIN,
canAssignHospital:  role === ROLES.SUPERADMIN,
canUnassignDevices: [ROLES.SUPERADMIN, ROLES.HOSPITAL_ADMIN].includes(role),
canAssignDevices:   [ROLES.SUPERADMIN, ROLES.HOSPITAL_ADMIN].includes(role)
                    || (role === ROLES.STAFF && user?.can_assign_devices === true),
canViewDevices:     role !== ROLES.PATIENT,
```

> [!NOTE]
> No route guard change needed in `App.js`. The `/devices` route already uses `ProtectedRoute allowedRoles={[SUPERADMIN, HOSPITAL_ADMIN, STAFF]}` which excludes patients. No code change required for Phase 5's redirect requirement.

---

### Phase 6 — Frontend: `Devices.js` Updates

#### [MODIFY] [Devices.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/Devices.js) — Full file replacement

Changes from current file:
1. Destructure new permissions from `usePermissions()`: `canRegisterDevices`, `canAssignHospital`, `canUnassignDevices`, `canAssignDevices`
2. Replace `isSuperAdmin` checks with new permission values
3. Add 3 new state variables for assign-to-patient flow
4. Add `handleAssignPatient` handler calling `PATCH /api/devices/${id}/assign-patient`
5. Add assign-to-patient Dialog (mirrors assign-to-hospital dialog structure)
6. Add "Assign to patient" button on devices where `hospital_id` is set, `assigned_patient_id` is null, and `canAssignDevices`
7. Add status Badge display (Active/In Pool/Unassigned) and `last_seen` relative timestamp per device row
8. Staff read-only view: no action buttons unless `canAssignDevices`

---

### Phase 7 — Frontend: `PatientMonitor.js` Update

#### [MODIFY] [PatientMonitor.js](file:///c:/olt-innovation-team-portal/health-check-up-monitoring-system/frontend/src/pages/PatientMonitor.js)

Single targeted change: add `no_device` banner between the header `<div>` (line 97) and the `<VitalsGrid>` (line 112):
```jsx
{doc?.no_device && (
  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800 flex items-center gap-2">
    <span>⚠</span>
    No device is assigned to this patient — displaying simulated data.
  </div>
)}
```

---

### Phase 8 — Integration Validation Table

| Frontend Action | API Endpoint | Backend Handler | MongoDB Collection |
|---|---|---|---|
| Devices.js / Register device | POST /api/devices | `register_device()` | devices |
| Devices.js / Assign to hospital | PATCH /api/devices/{id}/assign-hospital | `assign_hospital()` | devices, hospitals |
| Devices.js / Assign to patient | PATCH /api/devices/{id}/assign-patient | `assign_patient()` | devices, users |
| Devices.js / Unassign | PATCH /api/devices/{id}/unassign | `unassign_device()` | devices |
| Devices.js / List devices | GET /api/devices | `list_devices()` | devices |
| PatientMonitor / WS stream | WS /api/ws?patient_id= | `websocket_endpoint()` | devices, vitals_monitoring |
| PatientMonitor / Poll fallback | GET /api/dashboard-stream?patient_id= | `get_dashboard_stream()` | devices, vitals_monitoring |
| PatientMonitor / Device info | GET /api/patient/device | `get_patient_device()` | devices |
| Staff permissions page | PATCH /api/users/{id}/device-permissions | `update_device_permissions()` | users |

---

### Phase 9 — Documentation

#### [NEW] `DEVICE_ASSIGNMENT_IMPLEMENTATION_REPORT.md`

Full report in project root covering all 18 sections as specified.

---

## Verification Plan

### Automated / Manual Steps
- Start backend, confirm indexes created in MongoDB logs
- `POST /api/devices` with SuperAdmin session → expect 201
- `GET /api/devices` as Hospital Admin → expect only hospital-scoped results
- `PATCH /api/devices/{id}/assign-patient` with concurrent requests → expect atomic 409 on second
- `PATCH /api/devices/{id}/assign-patient` as Staff without `can_assign_devices` → expect 403
- `GET /api/dashboard-stream?patient_id=X` → when device assigned to X, expect `source: "live"` doc
- `GET /api/dashboard-stream?patient_id=X` → when no device, expect `source: "mock"` and `no_device: true`
- WS connect as patient → stream resolves to own device's vitals
- Frontend: Patient visiting `/devices` → redirected to `/unauthorized` (router guard already in place)
- Frontend: `Devices.js` as Staff with `can_assign_devices=false` → no action buttons visible
- Frontend: `PatientMonitor.js` — amber banner visible when `doc.no_device === true`

---

## Open Questions

> [!IMPORTANT]
> **`vitals_monitoring` document field `ts`**: The mock generator (line 1435) stores `ts` as `{"$numberLong": "..."}` (MongoDB Extended JSON format for display). Real MongoDB documents use native `ISODate` or epoch integers. The `sort([("ts", -1)])` query in `resolve_telemetry` will work correctly if `ts` is stored as a native BSON long/date. If documents in your real collection store `ts` differently, the sort field may need adjustment. Please confirm the real `vitals_monitoring` document schema.

> [!NOTE]
> **`UserCreate` model**: The prompt asks to add `can_assign_devices: bool = False` to `UserCreate`. The existing `create_team_member` endpoint (`POST /api/auth/create-user`) does not pass `can_create_patients` through to the DB document. The new field will follow the same pattern — it will only be settable via `PATCH /api/users/{user_id}/device-permissions`, not at creation time (for security). If you want it settable at creation, please confirm.

> [!NOTE]
> **`Devices.js` — "Assign to patient" button visibility**: The prompt spec says button appears when `d.hospital_id` is set AND `d.assigned_patient_id` is null. In the current DB schema there's no `assigned_patient_id` field on the current zero-device-route response. After Phase 1, the `Device` response model will always include `assigned_patient_id`. This is consistent — just confirming no issue.
