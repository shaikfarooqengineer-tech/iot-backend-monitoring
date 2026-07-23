// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/PatientMonitor.js
// PURPOSE: Production-grade patient monitoring page.
//   Thin orchestration layer: imports hooks and components, wires them together.
//   No business logic, no raw field access — just prop passing.
//
// DATA TRANSPORT:
//   1. PRIMARY   — WebSocket (wss:// on deployed, ws:// on localhost)
//   2. FALLBACK  — HTTP polling via GET /api/dashboard-stream (every 3 s)
//
// ARCHITECTURE:
//   - useConnectionManager: WS + polling + auth + heartbeat + staleness
//   - useTelemetryProcessor: chart history + alert log accumulation
//   - Resilient, cross-env environment variable resolver
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { WifiOff, RefreshCw, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch"; // Import the authenticated fetch wrapper

// ─── Feature hooks & components ─────────────────────────────────────────────
import { useConnectionManager } from "@/features/patientMonitor/hooks/useConnectionManager";
import { useTelemetryProcessor } from "@/features/patientMonitor/hooks/useTelemetryProcessor";
import { getAlertLevel } from "@/features/patientMonitor/utils/docHelpers";

import PageHeader      from "@/features/patientMonitor/components/PageHeader";
import ConnectionBadge from "@/features/patientMonitor/components/ConnectionBadge";
import VitalsGrid      from "@/features/patientMonitor/components/VitalsGrid";
import RoomStatusCard  from "@/features/patientMonitor/components/RoomStatusCard";
import AlertPanel      from "@/features/patientMonitor/components/AlertPanel";
import HrChartPanel    from "@/features/patientMonitor/components/HrChartPanel";
import RrChartPanel    from "@/features/patientMonitor/components/RrChartPanel";
import SleepCard       from "@/features/patientMonitor/components/SleepCard";
import ActivityCard    from "@/features/patientMonitor/components/ActivityCard";
import DeviceCard      from "@/features/patientMonitor/components/DeviceCard";
import FooterBar       from "@/features/patientMonitor/components/FooterBar";

// ─── Utility: Cross-Environment Variable Resolver ──────────────────────────

const getEnvVar = (key, defaultValue) => {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch (e) {}
  try {
    if (typeof process !== "undefined" && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {}
  return defaultValue;
};

// ─── Utility: Absolute Backend URL Resolver ───────────────────────────────

const resolveBackendUrl = () => {
  let httpUrl = getEnvVar("VITE_BACKEND_URL", getEnvVar("REACT_APP_BACKEND_URL", ""));

  if (!httpUrl && typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    // Auto-detect development loops on local machines or local networks
    if (
      hostname === "localhost" || 
      hostname === "127.0.0.1" || 
      hostname.startsWith("192.168.") || 
      hostname.startsWith("10.") || 
      hostname.startsWith("172.") ||
      port === "3000" || 
      port === "3001" || 
      port === "5173" || 
      port === "8080"
    ) {
      httpUrl = `${protocol}//${hostname}:8000`; // Points cleanly to local FastAPI backends
    } else {
      httpUrl = window.location.origin;
    }
  }
  return httpUrl.replace(/\/$/, "");
};

const BACKEND_URL = resolveBackendUrl();

// ─── Relative Telemetry Age Tracker (Phase 4 Task 3) ─────────────────────────

const relativeAge = (timestamp) => {
  if (!timestamp) return "unknown";
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function PatientMonitor() {
  const { patientId: patientIdParam } = useParams();
  const { user } = useAuth();

  // Resolve patient ID: URL param (admin view) ‖ own user_id (patient view)
  const patientId = patientIdParam || user?.user_id;

  // ── Connection manager — handles WS + polling + all production fixes ──
  const { connState, manualRetry, onDocReceived } = useConnectionManager(patientId);

  // ── Telemetry processor — accumulates charts + alerts ──
  const { 
    liveDoc, 
    connectionDoc, 
    hrHistory, 
    rrHistory, 
    alertLog, 
    lastUpdate, 
    processDoc,
    initializeHistory // Pulled from updated Phase 2 Hook
  } = useTelemetryProcessor();

  // Wire: connection manager → telemetry processor
  useEffect(() => {
    if (onDocReceived) {
      onDocReceived.current = processDoc;
    }
  }, [processDoc, onDocReceived]);

  // ─── Load Historical Records on Mount (Phase 4 Task 1) ─────────────────────
  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      try {
        const res = await authFetch(`${BACKEND_URL}/api/patients/${patientId}/telemetry-history`);
        if (res.ok && active) {
          const data = await res.json();
          initializeHistory(data.history || []);
        }
      } catch (err) {
        console.error("Failed loading historical telemetry records:", err);
      }
    };

    if (patientId) {
      loadHistory();
    }
    return () => { active = false; };
  }, [patientId, initializeHistory]);

  // ─── Loading / Hydration Guard State ────────────────────────────────────
  if (!patientId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading patient profile…</p>
        </div>
      </div>
    );
  }

  // State A: No device assigned
  if (connectionDoc?.source === "empty" && connectionDoc?.no_device) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] p-6">
        <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center max-w-xl w-full shadow-sm">
          <div className="w-20 h-20 bg-rose-50 dark:bg-rose-950/30 rounded-full flex items-center justify-center mb-6 text-rose-500 animate-pulse">
            <WifiOff className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">No Device Assigned</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mb-6 leading-relaxed">
            This patient currently does not have any active health monitoring device mapped. 
            Please assign a device in the Device Management console to start tracking live telemetry.
          </p>
          <div className="text-xs text-slate-400 font-mono bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded">
            Patient ID: {patientId}
          </div>
        </div>
      </div>
    );
  }

  // State B: Device assigned, but no live telemetry received yet (and no historical liveDoc)
  if (connectionDoc?.source === "empty" && !connectionDoc?.no_device && !liveDoc) {
    const isOffline = connState.mode === "offline" || connState.mode === "auth_failed";
    return (
      <div className="flex items-center justify-center min-h-[70vh] p-6">
        <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center max-w-xl w-full shadow-sm">
          <div className="w-20 h-20 bg-blue-50 dark:bg-blue-950/30 rounded-full flex items-center justify-center mb-6 text-blue-500 relative">
            <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping" />
            <Radio className="w-10 h-10 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Waiting for Telemetry Data</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mb-4 leading-relaxed">
            A monitoring device is mapped to this patient, but no live telemetry signal has been received yet. 
            Please ensure the device is powered on and connected to the hospital network.
          </p>
          <p className="text-xs text-blue-500 font-medium mb-6 bg-blue-50 dark:bg-blue-950/20 px-3 py-1 rounded-full">
            Status: {connState.message}
          </p>
          
          <div className="flex flex-col items-center gap-3">
            <div className="text-xs text-slate-400 font-mono bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded">
              Patient ID: {patientId}
            </div>
            {isOffline && (
              <Button size="sm" variant="outline" onClick={manualRetry} className="gap-2 mt-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Retry Connection
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Connecting / Loading / Connection Failed (if we don't have any connectionDoc yet)
  if (!connectionDoc) {
    const isOffline = connState.mode === "offline" || connState.mode === "auth_failed";
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md px-4">
          {isOffline ? (
            <WifiOff className="w-14 h-14 text-rose-400 mx-auto mb-4 animate-bounce" />
          ) : (
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          )}

          <p className="text-slate-700 dark:text-slate-200 font-semibold text-lg mb-1">
            {isOffline ? "Connection Failed" : "Connecting to patient monitor…"}
          </p>

          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{connState.message}</p>

          <p className="text-xs text-slate-400 mb-4">Patient ID: {patientId}</p>

          {isOffline && (
            <Button size="sm" variant="outline" onClick={manualRetry} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Retry Connection
            </Button>
          )}
        </div>
      </div>
    );
  }

  // If we have no liveDoc yet (but connectionDoc is not empty, which is a fallback gate)
  if (!liveDoc) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md px-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-700 dark:text-slate-200 font-semibold text-lg mb-1">
            Initializing Live Dashboard…
          </p>
          <p className="text-xs text-slate-400">Patient ID: {patientId}</p>
        </div>
      </div>
    );
  }

  // ─── Derive props from validated doc (with defensive nullish guards) ───
  const alertLevel = getAlertLevel(liveDoc);

  // Status flags - Must be connected/polling AND the current stream source must be live
  const isOnline = connectionDoc?.source === "live" && 
                   (connState.mode === "connected" || connState.mode === "polling");
                   
  const formattedTime = lastUpdate 
    ? new Date(lastUpdate).toUTCString().replace("GMT", "UTC") 
    : "—";

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader
          deviceId={liveDoc.device_id ?? ""}
          roomId={liveDoc.room_id ?? ""}
          siteId={liveDoc.site_id ?? ""}
          deviceType={liveDoc.device_type ?? ""}
          alertLevel={alertLevel}
        />
        <ConnectionBadge
          connState={connState}
          onManualRetry={manualRetry}
        />
      </div>

      {/* ── Status Badge & Telemetry Age Panel (Phase 4 Task 2) ── */}
      <div className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          {isOnline ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Device Online
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-xs font-semibold w-fit">
                <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                Device Offline
              </div>
              <span className="text-xs text-rose-500 dark:text-rose-400 font-medium">
                Showing Last Known Vitals
              </span>
            </div>
          )}
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium sm:text-right">
          {isOnline ? (
            <span>Last Vitals Received: <strong className="text-slate-700 dark:text-slate-200 font-semibold">{formattedTime}</strong></span>
          ) : (
            <div className="flex flex-col gap-0.5 sm:items-end">
              <span>Last Telemetry: <strong className="text-rose-600 dark:text-rose-400 font-semibold">{relativeAge(lastUpdate)}</strong></span>
              <span className="text-[10px] text-slate-400">({formattedTime})</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Vitals Grid (6 cards) with robust physical schema translation fallbacks ── */}
      <VitalsGrid
        hr={liveDoc.hr ?? null}
        br={liveDoc.br ?? liveDoc.rr ?? null} // Translates both rr and br models safely
        spo2={liveDoc.spo2 ?? liveDoc.bh ?? null} // Translates both bh and spo2 fields safely
        bp={liveDoc.bp ?? liveDoc.bb ?? null} // Translates both bb and blood pressure safely
        temp={liveDoc.temp ?? null}
        sleeping={liveDoc.sleeping ?? false}
        humanDetected={liveDoc.human_detected ?? false}
        sleepQuality={liveDoc.sleep_quality ?? null}
        heartbeatConfidence={liveDoc.heartbeat_confidence ?? null}
        breathConfidence={liveDoc.breath_confidence ?? null}
      />

      {/* ── Room Status & Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RoomStatusCard
          lux={liveDoc.lux ?? null}
          temp={liveDoc.temp ?? null}
          distance={liveDoc.distance ?? null}
          humanDetected={liveDoc.human_detected ?? false}
          siteId={liveDoc.site_id ?? ""}
          roomId={liveDoc.room_id ?? ""}
        />
        <AlertPanel alertLog={alertLog} />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HrChartPanel
          hrHistory={hrHistory}
          heartbeatConfidence={liveDoc.heartbeat_confidence ?? null}
        />
        <RrChartPanel
          rrHistory={rrHistory}
          breathConfidence={liveDoc.breath_confidence ?? null}
        />
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SleepCard
          sleeping={liveDoc.sleeping ?? false}
          sleepQuality={liveDoc.sleep_quality ?? null}
          humanDetected={liveDoc.human_detected ?? false}
          confidence={liveDoc.confidence ?? null}
        />
        <ActivityCard
          humanDetected={liveDoc.human_detected ?? false}
          distance={liveDoc.distance ?? null}
          highLoad={liveDoc.high_load ?? false}
          uptimeMs={liveDoc.uptime_ms ?? 0}
        />
        <DeviceCard
          deviceId={liveDoc.device_id ?? ""}
          firmware={liveDoc.firmware ?? liveDoc.fw ?? ""} // Aligns both fw and firmware versions cleanly
          deviceType={liveDoc.device_type ?? ""}
          bs={liveDoc.bs ?? 0}
          bl={liveDoc.bl ?? 0}
          highLoad={liveDoc.high_load ?? false}
          status={liveDoc.status ?? ""}
          schema={liveDoc.schema ?? ""}
        />
      </div>

      {/* ── Footer ── */}
      <FooterBar
        lastUpdate={lastUpdate}
        isoTimestamp={liveDoc.iso_timestamp ?? liveDoc.iso ?? ""}
        eventId={liveDoc.event_id ?? ""}
        connState={connState}
      />
    </div>
  );
}