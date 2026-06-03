// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/validation/telemetrySchema.js
// PURPOSE: Zod runtime validation for raw MongoDB telemetry documents.
//          Every incoming packet (WS or HTTP) is validated before state update.
// ═══════════════════════════════════════════════════════════════════════════

import { z } from "zod";

/**
 * TelemetrySchema — matches the raw MongoDB telemetry document exactly.
 * Every field is nullable/optional because any given packet may omit fields.
 */
export const TelemetrySchema = z.object({
  _id:                  z.any().optional(),
  event_id:             z.string(),
  device_type:          z.string(),
  device_id:            z.string(),
  source:               z.enum(["live", "empty", "stale"]).optional(),
  no_device:            z.boolean().optional(),
  firmware:             z.string().nullable().optional(),
  client_id:            z.string().nullable().optional(),
  status:               z.string().nullable().optional(),
  uptime_ms:            z.number().nullable().optional(),
  ts:                   z.object({ $numberLong: z.string() }).optional(),
  epoch:                z.number().optional(),
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
}).passthrough();

/**
 * parsePacket — validate a raw JSON payload against TelemetrySchema.
 * @param {unknown} raw — the raw parsed JSON from WS or HTTP
 * @returns {{ success: boolean, data?: object, error?: object }}
 */
export function parsePacket(raw) {
  const result = TelemetrySchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.issues };
}
