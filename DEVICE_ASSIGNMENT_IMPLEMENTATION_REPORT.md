# Device Assignment & Real-Time Telemetry Routing Implementation Report

This report confirms the completion of the **Device Management, Patient Mapping & Real-Time Telemetry Routing system** for the Remote Patient Monitoring (RPM) platform. It provides a formal, comprehensive walkthrough of the 18 validation checks defined in our technical verification plan.

---

## 1. MongoDB Database Index Verification
On system initialization, `server.py` executes `create_indexes()` as an `@app.on_event("startup")` handler. It creates 6 critical new indexes to guarantee performance and data integrity:
1. `devices.device_id`: Unique index ensuring no duplicate IDs.
2. `devices.device_serial`: Unique index guaranteeing hardware tracking uniqueness.
3. `devices.assigned_patient_id`: Sparse + Unique index enforcing a maximum of **one active device per patient** at the database level.
4. `devices.hospital_id`: Non-unique query optimization index.
5. `devices.status`: Optimization index for dashboard filters.
6. `vitals_monitoring.device_id_1_epoch_-1`: Composite query index sorting records chronologically by epoch descending.

## 2. Device Registration Endpoint (`POST /api/devices`)
SuperAdmins can register new devices via `POST /api/devices`. When a valid device registration request is processed:
* The payload is validated against the `Device` Pydantic model.
* The device is inserted into the `devices` collection with default status `"available"`.
* A success status code `201 Created` is returned, and an activity log entry is recorded in the database using `log_activity()`.

## 3. Registration Access Control (RBAC Protection)
Role-Based Access Control (RBAC) is strictly enforced using FastAPI's dependency injection:
* Endpoints like `POST /api/devices` utilize `RoleChecker([UserRole.SUPERADMIN])`.
* If a non-SuperAdmin user (e.g., a `HospitalAdmin` or `Staff`) attempts to register a device, the dependency automatically returns an `HTTP 403 Forbidden` response.

## 4. Hospital Assignment Endpoint (`PATCH /api/devices/{id}/assign-hospital`)
Devices start in the `"available"` (unassigned) pool. A SuperAdmin can assign a device to a hospital pool:
* Endpoint `PATCH /api/devices/{id}/assign-hospital` modifies the device status to `"assigned_to_hospital"`.
* Sets the target `hospital_id` in the document.
* Writes a corresponding audit activity log using `log_activity()`.

## 5. Concurrent Device Assignment Race Protection (Device Lockout)
To prevent a single device from being assigned to multiple patients concurrently under race conditions, the backend uses atomic MongoDB operations:
* `find_one_and_update` is executed with query filter: `{"device_id": id, "assigned_patient_id": None}`.
* If a concurrent request attempts to map the same device, the query filter fails to find a matching document (since `assigned_patient_id` is already set), returning `HTTP 409 Conflict`.

## 6. Concurrent Patient Mapping Race Protection (Patient Lockout)
A sparse, unique index is defined on `assigned_patient_id` inside the `devices` collection:
* Even if two concurrent requests attempt to map *two different devices* to the *same patient*, the database-level sparse unique index blocks the second write.
* The system catches `pymongo.errors.DuplicateKeyError` (error code `11000`) and returns `HTTP 409 Conflict` with the message: `"Patient already has an active device"`.

## 7. Privilege Checks on Patient Assignment
Staff assignment privileges are dynamically evaluated:
* Standard staff members can only map devices if they have been explicitly granted permission.
* If a Staff user attempts patient assignment while their `can_assign_devices` boolean is `False`, the backend rejects the operation with `HTTP 403 Forbidden`.
* Permissions can be updated by SuperAdmins/HospitalAdmins at `PATCH /api/users/{user_id}/device-permissions`.

## 8. Real Telemetry Stream Resolution (`GET /api/dashboard-stream`)
The polling fallback endpoint `GET /api/dashboard-stream` has been completely rewritten to use `resolve_telemetry()`.
* When called with a valid `patient_id`, it looks up the mapped device serial.
* It performs a sorted lookup on `vitals_monitoring` with sorting `[("epoch", -1)]` and projection `{"_id": 0}`.
* Returns `source: "live"` with the actual real vital metrics.

## 9. Telemetry Resolution: Waiting State (Mapped, No Vitals)
When a device is mapped to a patient, but has not yet transmitted any real IoT signals:
* `resolve_telemetry()` detects that a `device` document exists, but a query on the `vitals_monitoring` collection returns `None`.
* The endpoint returns a clean status packet: `{"source": "empty", "no_device": false}`.

## 10. Telemetry Resolution: No Device State (Unmapped Patient)
When a patient has no mapped device in the database:
* `resolve_telemetry()` finds no record matching `{"assigned_patient_id": patient_id}` in `devices`.
* The endpoint returns a clean status packet: `{"source": "empty", "no_device": true}`.

## 11. Complete Removal of Mock Telemetry (`generate_telemetry_doc()`)
The developer utility `generate_telemetry_doc()` has been **completely banned and removed** from all active, patient-facing routes and streaming systems.
* Neither `/api/dashboard-stream` nor `/api/ws` makes any calls to this function.
* Telemetry streaming depends strictly on physical IoT sensor data written to the database.

## 12. Security Gating at Route Level for Patients
Patients are strictly prohibited from viewing or accessing the Device Management console:
* `/devices` routes inside React Router are wrapped inside `ProtectedRoute allowedRoles={[SUPERADMIN, HOSPITAL_ADMIN, STAFF]}`.
* Patients attempting to navigate to `/devices` are redirected to `/unauthorized` automatically.

## 13. Frontend Bypass of Strict Schema for Status Frames
Status packets (`source: "empty"`) do not carry telemetry identifiers such as `event_id` or `device_type`.
* The hook `useConnectionManager` checks `rawData.source === "empty"` at the entry point of `processPacket`.
* These packets bypass `parsePacket()` validation entirely and are immediately dispatched to update the UI connection states without getting discarded.

## 14. Frontend Two-State Telemetry Processing
To avoid dashboard stuttering and preserve offline readability, the telemetry processor uses two states:
1. `connectionDoc`: Updated on **every incoming packet** (live or empty) to control UI state routing.
2. `liveDoc`: Updated **only** when `source === "live"`. It is never reset to `null` to ensure the dashboard remains populated even during brief disconnects.

## 15. UI State A: No Device Assigned Display
If `connectionDoc` indicates `source === "empty" && no_device === true`, the React UI renders a specialized, high-fidelity overlay:
* Displays a centered, pulsing red `WifiOff` icon.
* Renders clear guidance: `"No Device Assigned — This patient currently does not have any active health monitoring device mapped."`

## 16. UI State B: Waiting for Telemetry Display
If `connectionDoc` indicates `source === "empty" && no_device === false` (while `liveDoc` is null):
* Renders a pulsing blue `Radio` transmission finder wave.
* Informs the staff/patient: `"Waiting for Telemetry Data — A monitoring device is mapped to this patient, but no live telemetry signal has been received yet."`

## 17. UI State C: Live Dashboards with Metric Projection
Once a `liveDoc` becomes available:
* The page transitions into the interactive RPM Dashboard.
* The vitals cards, room statuses, sleeping metrics, heart rate charts, and respiratory rate charts are driven directly by `liveDoc` variables.

## 18. Graceful Transition Handling when Devices Go Offline
If a device that has been active goes offline or ceases transmitting:
* The backend streams begin sending `{"source": "empty", "no_device": false}` status packets.
* The frontend `connectionDoc` is updated, notifying the user via the `ConnectionBadge` that data is stale.
* However, `liveDoc` retains the last known set of vitals, keeping the charts and graphs visible instead of wiping the user interface.
