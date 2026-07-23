// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/validation/telemetrySchema.js
// PURPOSE: Zod runtime validation for raw MongoDB telemetry documents.
//          Every incoming packet (WS or HTTP) is validated before state update.
// ═══════════════════════════════════════════════════════════════════════════

import { z } from "zod";

/**
 * TelemetrySchema — matches the raw MongoDB telemetry document exactly.
 * Every field is nullable/optional because any given packet may omit fields.
 * Schema relaxed on event_id, device_type, and device_id to safely support
 * offline fallback/empty packets without discarding validation runs.
 */
export const TelemetrySchema = z.object({
  _id:                  z.any().optional(),
  event_id:             z.string().optional(), // 🌟 Made optional to support offline envelopes
  device_type:          z.string().nullable().optional(), // 🌟 Made optional to support offline envelopes
  device_id:            z.string().optional(), // 🌟 Made optional to support offline envelopes
  source:               z.enum(["live", "empty", "stale"]).optional(),
  no_device:            z.boolean().optional(),
  firmware:             z.union([z.string(), z.number()]).nullable().optional(),
  client_id:            z.string().nullable().optional(),
  status:               z.string().nullable().optional(),
  uptime_ms:            z.number().nullable().optional(),
  ts:                   z.union([z.number(), z.object({ $numberLong: z.string() })]).nullable().optional(),
  epoch:                z.number().nullable().optional(),
  iso_timestamp:        z.string().optional(),
  human_detected:       z.boolean().nullable().optional(),
  distance:             z.number().nullable().optional(),
  lux:                  z.number().nullable().optional(),
  hr:                   z.number().nullable().optional(),
  br:                   z.number().nullable().optional(),
  spo2:                 z.number().nullable().optional(),
  bp: z.object({
    systolic:           z.number().nullable().optional(),
    diastolic:          z.number().nullable().optional(),
    raw:                z.string().nullable().optional(),
  }).nullable().optional(),
  temp:                 z.number().nullable().optional(),
  heartbeat_confidence: z.number().nullable().optional(),
  breath_confidence:    z.number().nullable().optional(),
  sleep_quality:        z.number().nullable().optional(),
  confidence:           z.number().nullable().optional(),
  sleeping:             z.boolean().nullable().optional(),
  high_load:            z.boolean().nullable().optional(),
  alert_level:          z.string().nullable().optional(),
  schema:               z.string().optional(),
  site_id:              z.string().optional(),
  room_id:              z.string().optional(),
  hh:                   z.boolean().optional(),
  bl:                   z.boolean().optional(),
  bs:                   z.number().optional(),
  aw:                   z.boolean().optional(),
  aa:                   z.boolean().optional(),
  al:                   z.string().nullable().optional(),

  // ─── Alert Payload Fields ───
  fl:                   z.boolean().nullable().optional(),
  fs:                   z.string().nullable().optional(),
  bx:                   z.boolean().nullable().optional(),
  im:                   z.boolean().nullable().optional(),
  po:                   z.boolean().nullable().optional(),
  dt:                   z.boolean().nullable().optional(),
  rl:                   z.boolean().nullable().optional(),
  mp:                   z.boolean().nullable().optional(),

  // ─── Sleep Payload Fields ───
  sa:                   z.boolean().nullable().optional(),
  sg:                   z.string().nullable().optional(),
  qq:                   z.number().nullable().optional(),
  di:                   z.union([z.boolean(), z.number()]).nullable().optional(),
  sr:                   z.boolean().nullable().optional(),
}).passthrough(); // Passthrough remains as final structural safety net

/**
 * parsePacket — validate a raw JSON payload against TelemetrySchema.
 * @param {unknown} raw — the raw parsed JSON from WS or HTTP
 * @returns {{ success: boolean, data?: object, error?: object }}
 */
export function parsePacket(raw) {
  const result = TelemetrySchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    console.error("🚨 Zod Validation Failed:", result.error.format());
    console.warn("📦 Dropped Payload:", raw);
    return { success: false, error: result.error };
  }
}