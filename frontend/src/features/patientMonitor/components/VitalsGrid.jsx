// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/VitalsGrid.jsx
// PURPOSE: Grid of 6 vital cards wired to real telemetry fields.
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { Heart, Wind, Activity, ThermometerSun, Moon, Gauge } from "lucide-react";
import VitalCard from "./VitalCard";
import {
  getHrStatus,
  getBrStatus,
  getSpo2Status,
  getBpStatus,
  getTempStatus,
  getPresenceStatus,
  getPresenceValue,
} from "../utils/docHelpers";

const VitalsGrid = React.memo(function VitalsGrid({
  hr,
  br,
  spo2,
  bp,
  temp,
  sleeping,
  humanDetected,
  sleepQuality,
  heartbeatConfidence,
  breathConfidence,
}) {
  const hrStatus   = getHrStatus(hr);
  const brStatus   = getBrStatus(br);
  const spo2Status = getSpo2Status(spo2);
  const bpStatus   = getBpStatus(bp);
  const tempStatus = getTempStatus(temp);
  const presStatus = getPresenceStatus({ sleeping, human_detected: humanDetected });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Card A — Heart Rate */}
      <VitalCard
        label="Heart Rate"
        value={hr ?? "—"}
        unit="bpm"
        subLabel={`Confidence: ${heartbeatConfidence?.toFixed(1) ?? "—"}%`}
        icon={Heart}
        iconColorClass="icon-heart"
        badgeText={hrStatus.text}
        badgeColor={hrStatus.color}
      />

      {/* Card B — Respiration Rate */}
      <VitalCard
        label="Respiration"
        value={br ?? "—"}
        unit="breaths/min"
        subLabel={`Confidence: ${breathConfidence?.toFixed(1) ?? "—"}%`}
        icon={Wind}
        iconColorClass="icon-breath"
        badgeText={brStatus.text}
        badgeColor={brStatus.color}
      />

      {/* Card C — SpO2 */}
      <VitalCard
        label="SpO2"
        value={spo2 ?? "—"}
        unit="%"
        icon={Activity}
        iconColorClass="icon-spo2"
        badgeText={spo2Status.text}
        badgeColor={spo2Status.color}
      />

      {/* Card D — Blood Pressure */}
      <VitalCard
        label="Blood Pressure"
        value={bp?.raw ?? "—/—"}
        unit="mmHg"
        subLabel="Systolic / Diastolic"
        icon={Gauge}
        iconColorClass="icon-bp"
        badgeText={bpStatus.text}
        badgeColor={bpStatus.color}
      />

      {/* Card E — Temperature */}
      <VitalCard
        label="Temperature"
        value={temp ?? "—"}
        unit="°C"
        icon={ThermometerSun}
        iconColorClass="icon-temp"
        badgeText={tempStatus.text}
        badgeColor={tempStatus.color}
      />

      {/* Card F — Sleep / Presence */}
      <VitalCard
        label="Sleep / Presence"
        value={getPresenceValue({ sleeping, human_detected: humanDetected })}
        subLabel={`Quality: ${((sleepQuality ?? 0) * 100).toFixed(0)}%`}
        icon={Moon}
        iconColorClass="icon-sleep"
        badgeText={presStatus.text}
        badgeColor={presStatus.color}
      />
    </div>
  );
});

VitalsGrid.displayName = "VitalsGrid";
export default VitalsGrid;
