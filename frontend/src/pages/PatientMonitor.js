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
//   - 12 React.memo components with narrow prop signatures
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

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

// ─── Component ──────────────────────────────────────────────────────────────

export default function PatientMonitor() {
  const { patientId: patientIdParam } = useParams();
  const { user } = useAuth();

  // Resolve patient ID: URL param (admin view) ‖ own user_id (patient view)
  const patientId = patientIdParam || user?.user_id;

  // ── Connection manager — handles WS + polling + all production fixes ──
  const { connState, manualRetry, onDocReceived } = useConnectionManager(patientId);

  // ── Telemetry processor — accumulates charts + alerts ──
  const { doc, hrHistory, rrHistory, alertLog, lastUpdate, processDoc } = useTelemetryProcessor();

  // Wire: connection manager → telemetry processor
  useEffect(() => {
    onDocReceived.current = processDoc;
  }, [processDoc, onDocReceived]);

  // ─── Loading / Error screen ────────────────────────────────────────────
  if (!doc) {
    const isOffline = connState.mode === "offline" || connState.mode === "auth_failed";
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md px-4">
          {isOffline ? (
            <WifiOff className="w-14 h-14 text-red-400 mx-auto mb-4" />
          ) : (
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          )}

          <p className="text-slate-700 font-semibold text-lg mb-1">
            {isOffline ? "Connection Failed" : "Connecting to patient monitor…"}
          </p>

          <p className="text-sm text-slate-500 mb-2">{connState.message}</p>

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

  // ─── Derive props from validated doc ───────────────────────────────────
  const alertLevel = getAlertLevel(doc);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader
          deviceId={doc.device_id}
          roomId={doc.room_id}
          siteId={doc.site_id}
          deviceType={doc.device_type}
          alertLevel={alertLevel}
        />
        <ConnectionBadge
          connState={connState}
          onManualRetry={manualRetry}
        />
      </div>

      {/* ── Vitals Grid (6 cards) ── */}
      <VitalsGrid
        hr={doc.hr}
        br={doc.br}
        spo2={doc.spo2}
        bp={doc.bp}
        temp={doc.temp}
        sleeping={doc.sleeping}
        humanDetected={doc.human_detected}
        sleepQuality={doc.sleep_quality}
        heartbeatConfidence={doc.heartbeat_confidence}
        breathConfidence={doc.breath_confidence}
      />

      {/* ── Room Status & Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RoomStatusCard
          lux={doc.lux}
          temp={doc.temp}
          distance={doc.distance}
          humanDetected={doc.human_detected}
          siteId={doc.site_id}
          roomId={doc.room_id}
        />
        <AlertPanel alertLog={alertLog} />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HrChartPanel
          hrHistory={hrHistory}
          heartbeatConfidence={doc.heartbeat_confidence}
        />
        <RrChartPanel
          rrHistory={rrHistory}
          breathConfidence={doc.breath_confidence}
        />
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SleepCard
          sleeping={doc.sleeping}
          sleepQuality={doc.sleep_quality}
          humanDetected={doc.human_detected}
          confidence={doc.confidence}
        />
        <ActivityCard
          humanDetected={doc.human_detected}
          distance={doc.distance}
          highLoad={doc.high_load}
          uptimeMs={doc.uptime_ms}
        />
        <DeviceCard
          deviceId={doc.device_id}
          firmware={doc.firmware}
          deviceType={doc.device_type}
          bs={doc.bs}
          bl={doc.bl}
          highLoad={doc.high_load}
          status={doc.status}
          schema={doc.schema}
        />
      </div>

      {/* ── Footer ── */}
      <FooterBar
        lastUpdate={lastUpdate}
        isoTimestamp={doc.iso_timestamp}
        eventId={doc.event_id}
        connState={connState}
      />
    </div>
  );
}
