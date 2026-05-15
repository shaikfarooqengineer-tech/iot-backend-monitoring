// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/utils/docHelpers.js
// PURPOSE: Pure utility functions for field derivation from telemetry docs.
//          No React dependencies. All functions are null-safe.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Named Threshold Constants ──────────────────────────────────────────────

export const HR_HIGH = 120;
export const HR_LOW  = 50;

export const BR_HIGH = 25;
export const BR_LOW  = 8;

export const SPO2_CRITICAL = 90;
export const SPO2_LOW      = 95;

export const BP_SYS_HIGH = 140;
export const BP_SYS_LOW  = 90;
export const BP_DIA_HIGH = 90;
export const BP_DIA_LOW  = 60;

export const TEMP_FEVER      = 38.5;
export const TEMP_HYPOTHERMIA = 35.5;

export const STALE_TIMEOUT_MS = 10000;
export const CHART_MAX_POINTS = 120;
export const ALERT_MAX_ENTRIES = 50;
export const CHART_FLUSH_INTERVAL_MS = 1000;

// ─── Timestamp Parsing ──────────────────────────────────────────────────────

/**
 * Safely extract a Date from the telemetry doc.
 * Tries ts.$numberLong first, falls back to epoch * 1000.
 * @param {object} doc — validated telemetry document
 * @returns {Date|null}
 */
export function getTimestamp(doc) {
  if (!doc) return null;
  if (doc.ts?.$numberLong) {
    const ms = parseInt(doc.ts.$numberLong, 10);
    if (!isNaN(ms)) return new Date(ms);
  }
  if (doc.epoch != null) {
    return new Date(doc.epoch * 1000);
  }
  return null;
}

// ─── Alert Level ────────────────────────────────────────────────────────────

/**
 * Derive alert level string from doc.al field.
 * @param {object} doc
 * @returns {"HIGH"|"MEDIUM"|"LOW"|"NONE"}
 */
export function getAlertLevel(doc) {
  const al = doc?.al;
  if (al === "HIGH") return "HIGH";
  if (al === "MEDIUM") return "MEDIUM";
  if (al === "LOW") return "LOW";
  return "NONE";
}

/**
 * Map alert level to Tailwind badge color classes.
 * @param {"HIGH"|"MEDIUM"|"LOW"|"NONE"} level
 * @returns {string} — CSS class string
 */
export function getAlertBadgeColor(level) {
  switch (level) {
    case "HIGH":   return "bg-red-500 text-white";
    case "MEDIUM": return "bg-amber-500 text-white";
    case "LOW":    return "bg-green-500 text-white";
    default:       return "bg-slate-400 text-white";
  }
}

/**
 * Get badge label for the page header based on alert level.
 * @param {"HIGH"|"MEDIUM"|"LOW"|"NONE"} level
 * @returns {string}
 */
export function getAlertBadgeLabel(level) {
  switch (level) {
    case "HIGH":   return "Critical";
    case "MEDIUM": return "Moderate";
    case "LOW":    return "Stable";
    default:       return "Monitoring";
  }
}

// ─── Vital Status Derivation ────────────────────────────────────────────────

/**
 * @param {number|null|undefined} hr
 * @returns {{ text: string, color: string }}
 */
export function getHrStatus(hr) {
  if (hr == null) return { text: "No Data", color: "bg-slate-400 text-white" };
  if (hr < HR_LOW || hr > HR_HIGH) return { text: "Warning", color: "bg-amber-500 text-white" };
  return { text: "Normal", color: "bg-green-500 text-white" };
}

/**
 * @param {number|null|undefined} br
 * @returns {{ text: string, color: string }}
 */
export function getBrStatus(br) {
  if (br == null) return { text: "No Data", color: "bg-slate-400 text-white" };
  if (br < BR_LOW || br > BR_HIGH) return { text: "Warning", color: "bg-amber-500 text-white" };
  return { text: "Steady", color: "bg-green-500 text-white" };
}

/**
 * @param {number|null|undefined} spo2
 * @returns {{ text: string, color: string }}
 */
export function getSpo2Status(spo2) {
  if (spo2 == null) return { text: "No Data", color: "bg-slate-400 text-white" };
  if (spo2 < SPO2_CRITICAL) return { text: "Critical", color: "bg-red-500 text-white" };
  if (spo2 < SPO2_LOW) return { text: "Low", color: "bg-amber-500 text-white" };
  return { text: "Normal", color: "bg-green-500 text-white" };
}

/**
 * @param {object|null|undefined} bp — { systolic, diastolic, raw }
 * @returns {{ text: string, color: string }}
 */
export function getBpStatus(bp) {
  if (!bp || bp.systolic == null || bp.diastolic == null) {
    return { text: "No Data", color: "bg-slate-400 text-white" };
  }
  if (bp.systolic > BP_SYS_HIGH || bp.diastolic > BP_DIA_HIGH) {
    return { text: "High", color: "bg-red-500 text-white" };
  }
  if (bp.systolic < BP_SYS_LOW || bp.diastolic < BP_DIA_LOW) {
    return { text: "Low", color: "bg-amber-500 text-white" };
  }
  return { text: "Normal", color: "bg-green-500 text-white" };
}

/**
 * @param {number|null|undefined} temp
 * @returns {{ text: string, color: string }}
 */
export function getTempStatus(temp) {
  if (temp == null) return { text: "No Data", color: "bg-slate-400 text-white" };
  if (temp > TEMP_FEVER) return { text: "Fever", color: "bg-red-500 text-white" };
  if (temp < TEMP_HYPOTHERMIA) return { text: "Hypothermia", color: "bg-blue-500 text-white" };
  return { text: "Normal", color: "bg-green-500 text-white" };
}

/**
 * @param {object} doc — needs sleeping, human_detected
 * @returns {{ text: string, color: string }}
 */
export function getPresenceStatus(doc) {
  if (doc?.sleeping === true) return { text: "Sleeping", color: "bg-indigo-500 text-white" };
  if (doc?.human_detected === true) return { text: "Awake", color: "bg-green-500 text-white" };
  return { text: "Not Detected", color: "bg-slate-400 text-white" };
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * Format uptime_ms into human-readable string.
 * @param {number|null|undefined} uptimeMs
 * @returns {string} — e.g. "2d 14h 37m" or "14h 37m" or "37m" or "—"
 */
export function formatUptime(uptimeMs) {
  if (uptimeMs == null || uptimeMs < 0) return "—";

  const days  = Math.floor(uptimeMs / 86400000);
  const hours = Math.floor((uptimeMs % 86400000) / 3600000);
  const mins  = Math.floor((uptimeMs % 3600000) / 60000);

  const parts = [];
  if (days > 0)  parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);

  return parts.join(" ");
}

/**
 * Get the presence/sleep display value.
 * @param {object} doc
 * @returns {string}
 */
export function getPresenceValue(doc) {
  if (doc?.sleeping === true) return "Asleep";
  if (doc?.human_detected === true) return "Awake";
  return "Absent";
}
