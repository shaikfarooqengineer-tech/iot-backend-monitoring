// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/hooks/useTelemetryProcessor.js
// PURPOSE: Consumes validated telemetry docs from useConnectionManager.
//          Manages: HR/RR chart history (throttled), alert log (flag transitions).
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useCallback } from "react";
import {
  CHART_MAX_POINTS,
  ALERT_MAX_ENTRIES,
  CHART_FLUSH_INTERVAL_MS,
  HR_LOW, HR_HIGH,
  SPO2_CRITICAL,
  TEMP_FEVER,
} from "../utils/docHelpers";

// ─── Alert Derivation Config ────────────────────────────────────────────────

const FLAG_ALERT_MAP = [
  { field: "hh",        severity: "HIGH",   message: "High heart rate detected" },
  { field: "aa",        severity: "HIGH",   message: "Apnea / abnormal activity alert" },
  { field: "aw",        severity: "MEDIUM", message: "Patient awake — unexpected wakeup" },
  { field: "bl",        severity: "MEDIUM", message: "Device low battery" },
  { field: "high_load", severity: "LOW",    message: "Device CPU high load — readings may be delayed" },
];

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useTelemetryProcessor() {
  const [doc, setDoc]             = useState(null);
  const [hrHistory, setHrHistory] = useState([]);
  const [rrHistory, setRrHistory] = useState([]);
  const [alertLog, setAlertLog]   = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Refs for chart buffering (append at full rate, flush throttled)
  const hrBufferRef     = useRef([]);
  const rrBufferRef     = useRef([]);
  const lastChartFlush  = useRef(0);

  // Ref for alert flag transition detection
  const flagStateRef = useRef({});

  // ─── Process one validated doc ──────────────────────────────────────────

  const processDoc = useCallback((newDoc) => {
    setDoc(newDoc);
    setLastUpdate(new Date());

    // ── Chart history accumulation ───────────────────────────────────────

    const timeLabel = newDoc.epoch
      ? new Date(newDoc.epoch * 1000).toLocaleTimeString()
      : new Date().toLocaleTimeString();

    if (newDoc.hr != null) {
      hrBufferRef.current.push({ time: timeLabel, value: newDoc.hr });
      if (hrBufferRef.current.length > CHART_MAX_POINTS) {
        hrBufferRef.current = hrBufferRef.current.slice(-CHART_MAX_POINTS);
      }
    }

    if (newDoc.br != null) {
      rrBufferRef.current.push({ time: timeLabel, value: newDoc.br });
      if (rrBufferRef.current.length > CHART_MAX_POINTS) {
        rrBufferRef.current = rrBufferRef.current.slice(-CHART_MAX_POINTS);
      }
    }

    // Throttled chart flush — at most once per second
    const now = Date.now();
    if (now - lastChartFlush.current > CHART_FLUSH_INTERVAL_MS) {
      setHrHistory([...hrBufferRef.current]);
      setRrHistory([...rrBufferRef.current]);
      lastChartFlush.current = now;
    }

    // ── Alert derivation from flag transitions ───────────────────────────

    const newAlerts = [];
    const prevFlags = flagStateRef.current;
    const isoTime = newDoc.iso_timestamp || new Date().toISOString();

    // Boolean flag alerts — only on false→true transition
    for (const { field, severity, message } of FLAG_ALERT_MAP) {
      const current = newDoc[field] === true;
      const previous = prevFlags[field] === true;
      if (current && !previous) {
        newAlerts.push({
          id: `${newDoc.event_id}_${field}`,
          message,
          severity,
          time: isoTime,
        });
      }
      prevFlags[field] = current;
    }

    // al field alerts
    if (newDoc.al === "HIGH" && prevFlags._al !== "HIGH") {
      newAlerts.push({
        id: `${newDoc.event_id}_al_high`,
        message: "Alert level: CRITICAL — immediate attention required",
        severity: "HIGH",
        time: isoTime,
      });
    }
    if (newDoc.al === "MEDIUM" && prevFlags._al !== "MEDIUM") {
      newAlerts.push({
        id: `${newDoc.event_id}_al_medium`,
        message: "Alert level: MODERATE — monitor closely",
        severity: "MEDIUM",
        time: isoTime,
      });
    }
    prevFlags._al = newDoc.al;

    // Vital-derived alerts (with transition logic)
    if (newDoc.spo2 != null && newDoc.spo2 < SPO2_CRITICAL && !prevFlags._spo2_critical) {
      newAlerts.push({
        id: `${newDoc.event_id}_spo2_low`,
        message: `SpO2 critically low: ${newDoc.spo2}%`,
        severity: "HIGH",
        time: isoTime,
      });
    }
    prevFlags._spo2_critical = newDoc.spo2 != null && newDoc.spo2 < SPO2_CRITICAL;

    if (newDoc.temp != null && newDoc.temp > TEMP_FEVER && !prevFlags._temp_high) {
      newAlerts.push({
        id: `${newDoc.event_id}_temp_high`,
        message: `Elevated temperature: ${newDoc.temp}°C`,
        severity: "MEDIUM",
        time: isoTime,
      });
    }
    prevFlags._temp_high = newDoc.temp != null && newDoc.temp > TEMP_FEVER;

    if (newDoc.hr != null && (newDoc.hr < HR_LOW || newDoc.hr > HR_HIGH) && !prevFlags._hr_oor) {
      newAlerts.push({
        id: `${newDoc.event_id}_hr_oor`,
        message: `Heart rate out of range: ${newDoc.hr} bpm`,
        severity: "MEDIUM",
        time: isoTime,
      });
    }
    prevFlags._hr_oor = newDoc.hr != null && (newDoc.hr < HR_LOW || newDoc.hr > HR_HIGH);

    flagStateRef.current = prevFlags;

    // Append new alerts if any
    if (newAlerts.length > 0) {
      setAlertLog((prev) => [...newAlerts, ...prev].slice(0, ALERT_MAX_ENTRIES));
    }
  }, []);

  return {
    doc,
    hrHistory,
    rrHistory,
    alertLog,
    lastUpdate,
    processDoc,
  };
}
