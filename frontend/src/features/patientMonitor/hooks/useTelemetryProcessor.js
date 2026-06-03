// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/hooks/useTelemetryProcessor.js
// PURPOSE: Consumes validated telemetry docs from useConnectionManager.
//          Two-state design:
//            liveDoc       — updated ONLY when source === "live"
//                            Drives charts, vitals, alerts.
//                            Survives device going offline (never cleared).
//            connectionDoc — updated on EVERY packet (live or empty).
//                            Drives UI state branching (no-device / waiting / live).
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
  // liveDoc: last real telemetry document. Never set to null after first live frame.
  const [liveDoc, setLiveDoc]               = useState(null);
  // connectionDoc: reflects the most recent packet from the server (any source).
  const [connectionDoc, setConnectionDoc]   = useState(null);
  const [hrHistory, setHrHistory]           = useState([]);
  const [rrHistory, setRrHistory]           = useState([]);
  const [alertLog, setAlertLog]             = useState([]);
  const [lastUpdate, setLastUpdate]         = useState(null);

  // Ref for alert flag transition detection
  const flagStateRef = useRef({});

  // ─── Bulk Initializer for Historical Data ─────────────────────────────

  const initializeHistory = useCallback((historyList) => {
    if (!Array.isArray(historyList)) return;

    const hrPoints = historyList
      .filter(item => item.hr !== null && item.hr !== undefined)
      .map(item => {
        const timeLabel = item.iso_timestamp
          ? new Date(item.iso_timestamp).toLocaleTimeString()
          : item.epoch
            ? new Date(item.epoch * 1000).toLocaleTimeString()
            : new Date().toLocaleTimeString();
        return {
          timestamp: item.iso_timestamp,
          epoch: item.epoch,
          value: item.hr,
          confidence: item.heartbeat_confidence,
          time: timeLabel // Backwards compatible with legacy chart components
        };
      });

    const rrPoints = historyList
      .filter(item => item.br !== null && item.br !== undefined)
      .map(item => {
        const timeLabel = item.iso_timestamp
          ? new Date(item.iso_timestamp).toLocaleTimeString()
          : item.epoch
            ? new Date(item.epoch * 1000).toLocaleTimeString()
            : new Date().toLocaleTimeString();
        return {
          timestamp: item.iso_timestamp,
          epoch: item.epoch,
          value: item.br,
          confidence: item.breath_confidence,
          time: timeLabel // Backwards compatible with legacy chart components
        };
      });

    setHrHistory(hrPoints);
    setRrHistory(rrPoints);

    if (historyList.length > 0) {
      const lastRecord = historyList[historyList.length - 1];
      const telemetryTime = lastRecord.iso_timestamp
        ? new Date(lastRecord.iso_timestamp)
        : lastRecord.epoch
          ? new Date(lastRecord.epoch * 1000)
          : new Date();
      setLastUpdate(telemetryTime);
    }
  }, []);

  // ─── Process Live Stream Documents ─────────────────────────────────────

  const processDoc = useCallback((newDoc) => {
    // Always update connectionDoc — drives UI state decisions
    setConnectionDoc(newDoc);

    // Resolve accurate packet timestamp from packet metadata (not browser time)
    const telemetryTime = newDoc.iso_timestamp
      ? new Date(newDoc.iso_timestamp)
      : newDoc.epoch
        ? new Date(newDoc.epoch * 1000)
        : new Date();

    setLastUpdate(telemetryTime);

    // Only update liveDoc (and charts/alerts) for real live telemetry
    if (newDoc.source !== "live") {
      // source === "empty" or "stale": connectionDoc is updated, liveDoc is preserved.
      // Last real reading stays visible if the device goes offline.
      return;
    }

    setLiveDoc(newDoc);

    // Formulate a backwards-compatible time label for active charts
    const timeLabel = telemetryTime.toLocaleTimeString();

    // ── Chart history accumulation (deduplicated) ───────────────────────

    if (newDoc.hr != null) {
      setHrHistory(prev => {
        const isDuplicate = prev.some(item => 
          (item.epoch && item.epoch === newDoc.epoch) || 
          (item.timestamp && item.timestamp === newDoc.iso_timestamp)
        );
        if (isDuplicate) return prev;

        const updated = [...prev, {
          timestamp: newDoc.iso_timestamp,
          epoch: newDoc.epoch,
          value: newDoc.hr,
          confidence: newDoc.heartbeat_confidence,
          time: timeLabel
        }];
        return updated.slice(-CHART_MAX_POINTS);
      });
    }

    if (newDoc.br != null) {
      setRrHistory(prev => {
        const isDuplicate = prev.some(item => 
          (item.epoch && item.epoch === newDoc.epoch) || 
          (item.timestamp && item.timestamp === newDoc.iso_timestamp)
        );
        if (isDuplicate) return prev;

        const updated = [...prev, {
          timestamp: newDoc.iso_timestamp,
          epoch: newDoc.epoch,
          value: newDoc.br,
          confidence: newDoc.breath_confidence,
          time: timeLabel
        }];
        return updated.slice(-CHART_MAX_POINTS);
      });
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
    liveDoc,        // use for: charts, vitals, alerts, all telemetry widgets
    connectionDoc,  // use for: UI state branching (no-device / waiting / live)
    hrHistory,
    rrHistory,
    alertLog,
    lastUpdate,
    processDoc,
    initializeHistory,
  };
}