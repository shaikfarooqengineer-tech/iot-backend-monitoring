# PatientMonitor Production Refactor — Change Report

**Date:** 2026-05-16  
**Author:** Antigravity AI  
**Build Status:** ✅ Compiled successfully (0 errors, 0 warnings)

---

## Executive Summary

Complete rewrite of `PatientMonitor.js` from a 676-line monolithic prototype into a production-grade, modular component architecture. The refactor created **16 new files** and **modified 4 existing files**, replacing all fictional data field references with the real MongoDB telemetry document schema.

---

## Architecture Change

### Before
```
PatientMonitor.js (676 lines, monolithic)
├── All connection logic inline
├── All UI rendering inline
├── Fictional data fields (patient.name, vitals.heart_rate, etc.)
├── No validation
├── Token in WebSocket URL (security risk)
└── No chart/alert accumulation
```

### After
```
PatientMonitor.js (thin orchestrator, ~170 lines)
├── features/patientMonitor/
│   ├── hooks/
│   │   ├── useConnectionManager.js  (WS + polling + 10 production fixes)
│   │   └── useTelemetryProcessor.js (chart history + alert derivation)
│   ├── validation/
│   │   └── telemetrySchema.js       (Zod runtime validation)
│   ├── utils/
│   │   └── docHelpers.js            (pure utility functions)
│   └── components/                  (12 React.memo components)
│       ├── PageHeader.jsx
│       ├── ConnectionBadge.jsx
│       ├── VitalsGrid.jsx
│       ├── VitalCard.jsx
│       ├── RoomStatusCard.jsx
│       ├── AlertPanel.jsx
│       ├── HrChartPanel.jsx
│       ├── RrChartPanel.jsx
│       ├── SleepCard.jsx
│       ├── ActivityCard.jsx
│       ├── DeviceCard.jsx
│       └── FooterBar.jsx
```

---

## Files Changed

### New Files (16)

| File | Purpose | Lines |
|------|---------|-------|
| `validation/telemetrySchema.js` | Zod schema matching raw MongoDB telemetry doc, `parsePacket()` helper | ~65 |
| `utils/docHelpers.js` | Pure utility functions, threshold constants, status derivation | ~180 |
| `hooks/useConnectionManager.js` | WS + HTTP polling with all 10 production fixes | ~330 |
| `hooks/useTelemetryProcessor.js` | Chart history accumulation, alert flag transition detection | ~155 |
| `components/VitalCard.jsx` | Reusable vital metric card (React.memo) | ~48 |
| `components/PageHeader.jsx` | Device ID title, room/site subtitle, alert badge | ~45 |
| `components/ConnectionBadge.jsx` | 9-state connection indicator with retry button | ~55 |
| `components/VitalsGrid.jsx` | 6-card grid (HR, BR, SpO2, BP, Temp, Sleep) | ~110 |
| `components/RoomStatusCard.jsx` | Room environment: lux, temp, distance, site, room | ~90 |
| `components/AlertPanel.jsx` | Scrollable alert log with severity badges | ~70 |
| `components/HrChartPanel.jsx` | HR trend area chart with confidence indicator | ~55 |
| `components/RrChartPanel.jsx` | RR trend area chart with confidence indicator | ~55 |
| `components/SleepCard.jsx` | Sleep quality %, status, presence, confidence | ~60 |
| `components/ActivityCard.jsx` | Presence, distance, device load, formatted uptime | ~65 |
| `components/DeviceCard.jsx` | Device metadata with battery/load status badges | ~70 |
| `components/FooterBar.jsx` | Device time, receive time, connection mode, event ID | ~50 |

### Modified Files (4)

| File | Change |
|------|--------|
| `src/pages/PatientMonitor.js` | Complete rewrite → thin orchestrator (no business logic) |
| `src/context/AuthContext.js` | Added `token` and `updateToken` to context value |
| `src/App.css` | Added `.icon-spo2`, `.icon-bp`, `.icon-temp`, `.icon-presence`, `.badge-slate` |
| `backend/server.py` | New WS auth-frame protocol + `generate_telemetry_doc()` mock + ping/pong |

---

## Security Fixes Implemented

### FIX 1 — Token Removed from WebSocket URL
- **Before:** `ws://host/api/ws?token=<secret>&patient_id=xxx`
- **After:** `ws://host/api/ws?patient_id=xxx` → auth via first-frame message `{ type: "auth", token: "..." }`
- Backend updated to support both legacy (URL param) and new (auth-frame) protocols

### FIX 2 — No Direct localStorage Access
- **Before:** `localStorage.getItem("session_token")` in PatientMonitor
- **After:** `useAuth().token` — token exposed via React Context
- AuthContext updated with `token` state and `updateToken` callback

### FIX 3 — Reconnect Jitter (Thundering Herd Prevention)
- Added `Math.random() * 1000` jitter to exponential backoff
- Prevents all clients reconnecting simultaneously after server restart

### FIX 4 — WebSocket Heartbeat
- Client sends `{ type: "ping" }` every 25 seconds
- Expects `{ type: "pong" }` within 35 seconds
- Force-closes and reconnects on heartbeat timeout

### FIX 5 — Telemetry Staleness Detection
- Watchdog runs every 2 seconds
- Detects >10s without a packet → dispatches `STALE_DETECTED`
- Renders amber "Data Stale — last update Xs ago" badge
- Auto-clears when fresh packet arrives

### FIX 6 — Packet Sequence Ordering
- Tracks `latestEpoch` ref
- Discards out-of-order or duplicate packets with structured log

### FIX 7 — Tab Visibility Pause/Resume
- Pauses polling interval when tab is hidden
- Resumes + immediate fetch when tab becomes visible

### FIX 8 — Toast Debounce
- `toastOnce(key, fn, 10000)` pattern with per-key cooldown map
- Prevents toast spam during rapid reconnects

### FIX 9 — ConnMode State Machine
- `useReducer` with 9 valid states: idle, connecting, authenticating, connected, stale, reconnecting, polling, auth_failed, offline
- Named dispatch actions: CONNECT_START, AUTH_SENT, AUTH_OK, AUTH_FAIL, etc.
- No direct `setConnMode` calls anywhere

### FIX 10 — Safe Cleanup
- All timers, intervals, WebSocket handlers cleaned on unmount
- `isMounted.current` guard before every state update
- Cleanup function in every useEffect

---

## Data Architecture Changes

### Telemetry Document Schema
All UI panels now read from the real MongoDB telemetry document:

| Panel | Old (Fictional) Fields | New (Real) Fields |
|-------|----------------------|-------------------|
| Header | `patient.name`, `patient.room` | `doc.device_id`, `doc.room_id`, `doc.site_id` |
| Vitals | `vitals.heart_rate`, `vitals.respiration_rate` | `doc.hr`, `doc.br`, `doc.spo2`, `doc.bp`, `doc.temp` |
| Room | `room_status.light`, `room_status.temperature` | `doc.lux`, `doc.temp`, `doc.distance`, `doc.human_detected` |
| Alerts | `alerts[]` array | Derived from `hh`, `aa`, `aw`, `bl`, `high_load`, `al`, `spo2`, `temp`, `hr` flags |
| Charts | `heart_rate_history[]`, `respiration_history[]` | Accumulated from `doc.hr`, `doc.br` per packet |
| Sleep | `sleep_quality.total_hours` | `doc.sleep_quality * 100`, `doc.sleeping`, `doc.confidence` |
| Activity | `activity_level.steps` | `doc.human_detected`, `doc.distance`, `doc.high_load`, `doc.uptime_ms` |
| Device | `device_status.radar_sensor` | `doc.device_id`, `doc.firmware`, `doc.bs`, `doc.bl`, `doc.high_load` |

### Zod Validation
Every incoming packet is validated with `TelemetrySchema.safeParse()` before any state update. Invalid packets are discarded with structured warning logs.

### Null Safety
Every field access uses `doc?.field ?? "—"` pattern. No crashes on missing/null fields.

---

## State Architecture

### Before (Monolithic)
```js
const [dashboardData, setDashboardData] = useState(null);  // entire object replaced every packet
```

### After (Normalized Slices)
```js
const [doc, setDoc]           = useState(null);   // latest validated telemetry doc
const [hrHistory, setHrHistory] = useState([]);   // accumulated HR chart points (max 120)
const [rrHistory, setRrHistory] = useState([]);   // accumulated RR chart points (max 120)
const [alertLog, setAlertLog]   = useState([]);   // accumulated alerts (max 50)
const [lastUpdate, setLastUpdate] = useState(null); // browser receive time
```

### Chart Throttling
- `useRef` buffers append at full packet rate
- `useState` flush at most once per second
- Prevents unnecessary chart re-renders

### Alert Derivation
- Flag transitions tracked via `flagStateRef`
- Only `false→true` transitions generate new alerts
- Rolling window: max 50 entries

---

## Backend Changes

### WebSocket Auth Protocol (v2)
```
Client → Server:  Connect ws://host/api/ws?patient_id=xxx  (NO token)
Server → Client:  Accept connection
Client → Server:  { "type": "auth", "token": "<session_token>" }
Server → Client:  { "type": "auth_ok" }  OR  { "type": "auth_fail", "reason": "..." }
Server → Client:  (streaming telemetry docs every 3s)
Client → Server:  { "type": "ping" }
Server → Client:  { "type": "pong" }
```

### Backward Compatibility
The server still accepts `?token=` in the URL for legacy clients. If present, it skips the auth-frame wait.

### Telemetry Mock
Added `generate_telemetry_doc()` that returns data in the real MongoDB schema (instead of the old `DashboardData` Pydantic model). Both the WS and HTTP polling endpoints now use this generator.

---

## Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| No reference to `doc.patient`, `doc.vitals`, `doc.room_status`, etc. | ✅ |
| Every rendered field maps to real schema fields | ✅ |
| 6 vital cards render live data (HR, BR, SpO2, BP, Temp, Sleep) | ✅ |
| Room status shows lux, temp, distance, humanDetected | ✅ |
| Alerts derived from flag transitions (not fictional array) | ✅ |
| HR/BR charts accumulate locally, capped at 120 points, 1/sec flush | ✅ |
| Sleep card shows `sleep_quality * 100` %, sleeping boolean | ✅ |
| Activity card shows presence, distance, load, uptime (no steps) | ✅ |
| Device card shows device_id, firmware, bs, bl, high_load | ✅ |
| Footer shows iso_timestamp + browser time + event_id | ✅ |
| Token NOT in WebSocket URL | ✅ |
| No `localStorage.getItem` in PatientMonitor module | ✅ |
| Staleness watchdog (>10s → amber "Stale") | ✅ |
| Packet ordering (stale epochs discarded) | ✅ |
| Reconnect with exponential backoff + jitter | ✅ |
| Tab-hidden polling paused | ✅ |
| Toast debounced per key (10s cooldown) | ✅ |
| All timers/intervals/listeners cleaned on unmount | ✅ |
| Every component wrapped in React.memo | ✅ |
| Zod TelemetrySchema validates every packet | ✅ |
| Structured JSON logging (no plain console calls) | ✅ |
| Production build succeeds | ✅ |

---

## Build Verification

```
$ npx craco build
Creating an optimized production build...
Compiled successfully.

File sizes after gzip:
  270.36 kB (+26.56 kB)  build/static/js/main.ade0455c.js
  13.68 kB (+945 B)      build/static/css/main.bdeb94dd.css
```

**Result:** Zero compilation errors, zero warnings. Bundle size increase of ~27 KB (gzipped) for the entire refactor.
